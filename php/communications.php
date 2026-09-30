<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Module Communication : SMS / e-mail vers élèves, parents, enseignants,
 * personnel. Recyclage complet des tables existantes pour les
 * destinataires (eleves, enseignants, personnel_administratif) — aucune
 * nouvelle table d'identité, voir resoudreDestinataires() dans _aide.php.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

const SELECT_COMMUNICATION = "
    SELECT c.id, c.canal, c.categorie, c.portee, c.classe_id, c.individu_type, c.individu_id,
           c.sujet, c.contenu, c.statut, c.nb_destinataires, c.nb_reussis, c.nb_echecs,
           c.cree_le, c.envoye_le,
           cl.nom AS classe_nom,
           CONCAT(u.prenom, ' ', u.nom) AS auteur,
           (SELECT nom FROM communications_destinataires WHERE communication_id = c.id ORDER BY id LIMIT 1) AS premier_destinataire
    FROM communications c
    LEFT JOIN classes cl ON cl.id = c.classe_id
    LEFT JOIN utilisateurs u ON u.id = c.auteur_id";

/** Type d'individu (pour portée « individuel ») déduit de la catégorie. */
function typeIndividuPourCategorie(string $categorie): ?string
{
    return match ($categorie) {
        'eleves', 'parents' => 'eleve',
        'enseignants'       => 'enseignant',
        'personnel'         => 'personnel',
        default             => null,
    };
}

if ($methode === 'GET') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);

    // Aperçu en direct des destinataires correspondant à une sélection,
    // sans créer ni envoyer de communication (utilisé par l'aperçu avant
    // envoi et le compteur de destinataires du formulaire).
    if (isset($_GET['destinataires'])) {
        $categorie = (string)($_GET['categorie'] ?? '');
        $portee    = (string)($_GET['portee'] ?? 'tous');
        if (!in_array($categorie, CATEGORIES_VALIDES, true) || !in_array($portee, PORTEES_VALIDES, true)) {
            erreur('Catégorie ou portée invalide.');
        }
        if ($categorie === 'tous') {
            $portee = 'tous';
        }
        $classeId   = $portee === 'classe' ? (int)($_GET['classe_id'] ?? 0) : null;
        $individuId = $portee === 'individuel' ? (int)($_GET['individu_id'] ?? 0) : null;

        $destinataires = resoudreDestinataires($pdo, $categorie, $portee, $classeId, $individuId);
        repondre([
            'total'         => count($destinataires),
            'sans_telephone'=> count(array_filter($destinataires, fn($d) => empty($d['telephone']))),
            'sans_email'    => count(array_filter($destinataires, fn($d) => empty($d['email']))),
            'destinataires' => $destinataires,
        ]);
    }

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare(SELECT_COMMUNICATION . ' WHERE c.id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $communication = $stmt->fetch();
        if (!$communication) {
            erreur('Communication introuvable.', 404);
        }

        $stmtDest = $pdo->prepare(
            'SELECT categorie, reference_id, nom, telephone, email, statut_sms, erreur_sms, statut_email, erreur_email
             FROM communications_destinataires WHERE communication_id = ? ORDER BY nom'
        );
        $stmtDest->execute([$communication['id']]);
        $communication['destinataires'] = $stmtDest->fetchAll();

        repondre($communication);
    }

    // Liste (historique), avec recherche et filtres.
    $conditions = [];
    $params     = [];

    if (!empty($_GET['recherche'])) {
        $conditions[] = '(c.sujet LIKE ? OR c.contenu LIKE ?)';
        $motif = '%' . $_GET['recherche'] . '%';
        $params[] = $motif;
        $params[] = $motif;
    }
    if (!empty($_GET['canal']) && in_array($_GET['canal'], CANAUX_VALIDES, true)) {
        $conditions[] = 'c.canal = ?';
        $params[] = $_GET['canal'];
    }
    if (!empty($_GET['statut'])) {
        $conditions[] = 'c.statut = ?';
        $params[] = $_GET['statut'];
    }
    if (!empty($_GET['categorie']) && in_array($_GET['categorie'], CATEGORIES_VALIDES, true)) {
        $conditions[] = 'c.categorie = ?';
        $params[] = $_GET['categorie'];
    }
    if (!empty($_GET['date_debut'])) {
        $conditions[] = 'DATE(c.cree_le) >= ?';
        $params[] = $_GET['date_debut'];
    }
    if (!empty($_GET['date_fin'])) {
        $conditions[] = 'DATE(c.cree_le) <= ?';
        $params[] = $_GET['date_fin'];
    }

    $sql = SELECT_COMMUNICATION;
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY c.cree_le DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $utilisateur = exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $d = entreeJSON();

    $canal     = (string)($d['canal'] ?? '');
    $categorie = (string)($d['categorie'] ?? '');
    $portee    = (string)($d['portee'] ?? 'tous');
    $sujet     = trim((string)($d['sujet'] ?? ''));
    $contenu   = trim((string)($d['contenu'] ?? ''));
    $action    = (string)($d['action'] ?? 'envoyer');

    if (!in_array($canal, CANAUX_VALIDES, true)) {
        erreur('Canal invalide.');
    }
    if (!in_array($categorie, CATEGORIES_VALIDES, true)) {
        erreur('Catégorie de destinataires invalide.');
    }
    if (!in_array($portee, PORTEES_VALIDES, true)) {
        erreur('Portée invalide.');
    }
    if ($categorie === 'tous') {
        $portee = 'tous';
    }
    if ($portee === 'classe' && !in_array($categorie, ['eleves', 'parents'], true)) {
        erreur('La portée « classe » ne s\'applique qu\'aux élèves et parents.');
    }
    if ($canal === 'whatsapp' && $portee !== 'individuel') {
        erreur('Le canal WhatsApp n\'est disponible que pour un destinataire individuel.');
    }
    if (!$contenu) {
        erreur('Le contenu du message est obligatoire.');
    }
    if (!in_array($canal, ['sms', 'whatsapp'], true) && !$sujet) {
        erreur('L\'objet est obligatoire pour un envoi par e-mail.');
    }

    $classeId   = $portee === 'classe' ? (int)($d['classe_id'] ?? 0) : null;
    $individuId = $portee === 'individuel' ? (int)($d['individu_id'] ?? 0) : null;
    if ($portee === 'classe' && !$classeId) {
        erreur('Choisissez une classe.');
    }
    if ($portee === 'individuel' && !$individuId) {
        erreur('Choisissez un destinataire.');
    }
    $individuType = $portee === 'individuel' ? typeIndividuPourCategorie($categorie) : null;

    if ($action === 'brouillon') {
        $stmt = $pdo->prepare(
            'INSERT INTO communications
                (canal, categorie, portee, classe_id, individu_type, individu_id, sujet, contenu, statut, auteur_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, "brouillon", ?)'
        );
        $stmt->execute([$canal, $categorie, $portee, $classeId, $individuType, $individuId, $sujet ?: null, $contenu, $utilisateur['id']]);
        repondre(['id' => (int)$pdo->lastInsertId()], 201);
    }

    $destinataires = resoudreDestinataires($pdo, $categorie, $portee, $classeId, $individuId);
    if (!$destinataires) {
        erreur('Aucun destinataire ne correspond à cette sélection.');
    }

    $id = envoyerCommunication($pdo, $utilisateur['id'], $canal, $categorie, $portee, $classeId, $individuType, $individuId, $sujet, $contenu, $destinataires);

    $stmt = $pdo->prepare(SELECT_COMMUNICATION . ' WHERE c.id = ?');
    $stmt->execute([$id]);
    repondre($stmt->fetch(), 201);
}

if ($methode === 'PUT') {
    $utilisateur = exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $id = idRequis();
    $d  = entreeJSON();

    $stmt = $pdo->prepare('SELECT * FROM communications WHERE id = ?');
    $stmt->execute([$id]);
    $existant = $stmt->fetch();
    if (!$existant) {
        erreur('Communication introuvable.', 404);
    }
    if ($existant['statut'] !== 'brouillon') {
        erreur('Seul un brouillon peut être modifié ou envoyé.', 409);
    }

    $canal     = (string)($d['canal'] ?? $existant['canal']);
    $categorie = (string)($d['categorie'] ?? $existant['categorie']);
    $portee    = (string)($d['portee'] ?? $existant['portee']);
    $sujet     = trim((string)($d['sujet'] ?? $existant['sujet'] ?? ''));
    $contenu   = trim((string)($d['contenu'] ?? $existant['contenu']));
    $action    = (string)($d['action'] ?? 'brouillon');

    if (!in_array($canal, CANAUX_VALIDES, true) || !in_array($categorie, CATEGORIES_VALIDES, true) || !in_array($portee, PORTEES_VALIDES, true)) {
        erreur('Sélection invalide.');
    }
    if ($categorie === 'tous') {
        $portee = 'tous';
    }
    if ($canal === 'whatsapp' && $portee !== 'individuel') {
        erreur('Le canal WhatsApp n\'est disponible que pour un destinataire individuel.');
    }
    if (!$contenu) {
        erreur('Le contenu du message est obligatoire.');
    }
    if (!in_array($canal, ['sms', 'whatsapp'], true) && !$sujet) {
        erreur('L\'objet est obligatoire pour un envoi par e-mail.');
    }

    $classeId     = $portee === 'classe' ? (int)($d['classe_id'] ?? $existant['classe_id'] ?? 0) : null;
    $individuId   = $portee === 'individuel' ? (int)($d['individu_id'] ?? $existant['individu_id'] ?? 0) : null;
    $individuType = $portee === 'individuel' ? typeIndividuPourCategorie($categorie) : null;

    if ($action === 'brouillon') {
        $pdo->prepare(
            'UPDATE communications SET canal=?, categorie=?, portee=?, classe_id=?, individu_type=?, individu_id=?, sujet=?, contenu=?
             WHERE id=?'
        )->execute([$canal, $categorie, $portee, $classeId, $individuType, $individuId, $sujet ?: null, $contenu, $id]);
        repondre(['ok' => true]);
    }

    $destinataires = resoudreDestinataires($pdo, $categorie, $portee, $classeId, $individuId);
    if (!$destinataires) {
        erreur('Aucun destinataire ne correspond à cette sélection.');
    }

    $pdo->prepare(
        'UPDATE communications SET canal=?, categorie=?, portee=?, classe_id=?, individu_type=?, individu_id=?, sujet=?, contenu=?
         WHERE id=?'
    )->execute([$canal, $categorie, $portee, $classeId, $individuType, $individuId, $sujet ?: null, $contenu, $id]);

    enregistrerEnvoi($pdo, $id, $canal, $sujet, $contenu, $destinataires);

    $stmt = $pdo->prepare(SELECT_COMMUNICATION . ' WHERE c.id = ?');
    $stmt->execute([$id]);
    repondre($stmt->fetch());
}

if ($methode === 'DELETE') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $id = idRequis();
    $pdo->prepare('DELETE FROM communications WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);

/**
 * Crée une communication puis l'envoie immédiatement à ses destinataires.
 * Retourne l'identifiant créé.
 */
function envoyerCommunication(PDO $pdo, int $auteurId, string $canal, string $categorie, string $portee, ?int $classeId, ?string $individuType, ?int $individuId, string $sujet, string $contenu, array $destinataires): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO communications
            (canal, categorie, portee, classe_id, individu_type, individu_id, sujet, contenu, statut, auteur_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, "brouillon", ?)'
    );
    $stmt->execute([$canal, $categorie, $portee, $classeId, $individuType, $individuId, $sujet ?: null, $contenu, $auteurId]);
    $id = (int)$pdo->lastInsertId();

    enregistrerEnvoi($pdo, $id, $canal, $sujet, $contenu, $destinataires);

    return $id;
}

/**
 * Envoie effectivement le message à chaque destinataire résolu (selon le
 * canal choisi), enregistre le statut de chacun et met à jour l'état
 * agrégé de la communication (envoye / partiel / echec).
 */
function enregistrerEnvoi(PDO $pdo, int $communicationId, string $canal, string $sujet, string $contenu, array $destinataires): void
{
    $pdo->prepare('DELETE FROM communications_destinataires WHERE communication_id = ?')->execute([$communicationId]);

    $inserer = $pdo->prepare(
        'INSERT INTO communications_destinataires
            (communication_id, categorie, reference_id, nom, telephone, email, statut_sms, erreur_sms, statut_email, erreur_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $nbReussis = 0;
    foreach ($destinataires as $dest) {
        $statutSms = 'non_concerne';
        $erreurSms = null;
        $statutEmail = 'non_concerne';
        $erreurEmail = null;
        $reussi = true;

        if ($canal === 'sms' || $canal === 'sms_email') {
            if (empty($dest['telephone'])) {
                $statutSms = 'echec';
                $erreurSms = 'Aucun téléphone renseigné.';
                $reussi = false;
            } else {
                $resultat = envoyerSMS($dest['telephone'], $contenu);
                $statutSms = $resultat['statut'];
                $erreurSms = $resultat['erreur'];
                if ($statutSms === 'echec') {
                    $reussi = false;
                }
            }
        }

        /* WhatsApp : aucun envoi automatique côté serveur (pas de passerelle
           officielle gratuite) — le navigateur ouvre wa.me avec le message
           déjà rempli et c'est l'administrateur qui appuie sur Envoyer dans
           WhatsApp. On trace simplement que le lien a été préparé pour un
           numéro exploitable. */
        if ($canal === 'whatsapp') {
            if (empty($dest['telephone'])) {
                $statutSms = 'echec';
                $erreurSms = 'Aucun téléphone renseigné.';
                $reussi = false;
            } else {
                $statutSms = 'whatsapp';
            }
        }

        if ($canal === 'email' || $canal === 'sms_email') {
            if (empty($dest['email'])) {
                $statutEmail = 'echec';
                $erreurEmail = 'Aucune adresse e-mail renseignée.';
                $reussi = false;
            } else {
                $resultat = envoyerEmail($dest['email'], $sujet, $contenu);
                $statutEmail = $resultat['statut'];
                $erreurEmail = $resultat['erreur'];
                if ($statutEmail === 'echec') {
                    $reussi = false;
                }
            }
        }

        if ($reussi) {
            $nbReussis++;
        }

        $inserer->execute([
            $communicationId, $dest['categorie'], $dest['reference_id'], $dest['nom'],
            $dest['telephone'], $dest['email'], $statutSms, $erreurSms, $statutEmail, $erreurEmail,
        ]);
    }

    $nbDestinataires = count($destinataires);
    $nbEchecs = $nbDestinataires - $nbReussis;
    $statut = $nbEchecs === 0 ? 'envoye' : ($nbReussis === 0 ? 'echec' : 'partiel');

    $pdo->prepare(
        'UPDATE communications SET statut=?, nb_destinataires=?, nb_reussis=?, nb_echecs=?, envoye_le=NOW() WHERE id=?'
    )->execute([$statut, $nbDestinataires, $nbReussis, $nbEchecs, $communicationId]);
}
