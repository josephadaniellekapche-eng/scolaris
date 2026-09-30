<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* montant_du/montant_verse restent tels qu'enregistrés à l'inscription
   (historique, voir php/_aide.php) ; montant_du_actuel/montant_paye_actuel
   sont calculés en direct depuis le module Finance (inscription_frais +
   paiements) — à utiliser pour tout affichage de solde à jour. */
const SELECT_INSCRIPTION = '
    SELECT i.id, i.type, i.statut, i.date_inscription, i.montant_du, i.montant_verse,
           i.mode_paiement, i.reference_paiement,
           el.id AS eleve_id, el.matricule, el.nom, el.prenom, el.sexe, el.pieces_fournies,
           el.date_naissance, el.lieu_naissance, el.pere, el.mere, el.tuteur, el.contact, el.adresse,
           c.id AS classe_id, c.nom AS classe_nom,
           an.libelle AS annee_scolaire,
           (SELECT COALESCE(SUM(f.montant_du), 0) FROM inscription_frais f
             WHERE f.inscription_id = i.id AND f.statut = "actif") AS montant_du_actuel,
           (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p
             WHERE p.inscription_id = i.id AND p.statut = "valide") AS montant_paye_actuel
    FROM inscriptions i
    JOIN eleves el          ON el.id = i.eleve_id
    JOIN classes c          ON c.id = i.classe_id
    JOIN annees_scolaires an ON an.id = i.annee_scolaire_id';

if ($methode === 'GET') {
    repondre($pdo->query(SELECT_INSCRIPTION . ' ORDER BY i.date_inscription DESC, i.id DESC')->fetchAll());
}

if ($methode === 'POST') {
    $d = entreeJSON();
    foreach (['nom', 'prenom', 'classe_id', 'annee_scolaire_id'] as $champ) {
        if (empty($d[$champ])) {
            erreur("Le champ « $champ » est obligatoire.");
        }
    }

    $reduction = max(0, min(100, (int)($d['reduction_pourcentage'] ?? 0)));
    $motifReduction = trim((string)($d['motif_reduction'] ?? '')) ?: null;

    $montantVerseInitial = (int)($d['montant_verse'] ?? 0);
    $modesValides = ['Espèces', 'MTN Mobile Money', 'Orange Money', 'Virement bancaire', 'Chèque'];
    if ($montantVerseInitial > 0 && !in_array($d['mode_paiement'] ?? '', $modesValides, true)) {
        erreur('Mode de paiement invalide pour le versement initial.');
    }

    $pdo->beginTransaction();
    try {
        /* --- Élève --- */
        $annee     = (int)date('Y');
        $suite     = (int)$pdo->query('SELECT COUNT(*) FROM eleves')->fetchColumn() + 420;
        $matricule = $annee . '-' . str_pad((string)$suite, 4, '0', STR_PAD_LEFT);

        $stmt = $pdo->prepare(
            'INSERT INTO eleves (matricule, nom, prenom, sexe, date_naissance, lieu_naissance, nationalite,
                                  pere, mere, tuteur, contact, email, adresse, origine, statut)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "actif")'
        );
        $stmt->execute([
            $matricule, $d['nom'], $d['prenom'], $d['sexe'] ?? 'F',
            $d['date_naissance'] ?? null, $d['lieu_naissance'] ?? null, $d['nationalite'] ?? 'Camerounaise',
            $d['pere'] ?? null, $d['mere'] ?? null, $d['tuteur'] ?? null,
            $d['contact'] ?? null, $d['email'] ?? null, $d['adresse'] ?? null, $d['origine'] ?? null,
        ]);
        $eleveId = (int)$pdo->lastInsertId();

        /* --- Inscription --- */
        $stmtClasse = $pdo->prepare('SELECT frais_inscription, frais_scolarite FROM classes WHERE id = ?');
        $stmtClasse->execute([(int)$d['classe_id']]);
        $classe = $stmtClasse->fetch();
        if (!$classe) {
            throw new RuntimeException('Classe introuvable.');
        }
        /* Simple aperçu conservé pour compatibilité d'affichage (ex. module
           Classes) : le calcul faisant foi est désormais celui du module
           Finance (inscription_frais + paiements, voir php/_aide.php). */
        $montantDu = (int)round(($classe['frais_inscription'] + $classe['frais_scolarite']) * (100 - $reduction) / 100);

        $typesValides = ['Nouvel élève', 'Réinscription', 'Transfert'];
        $type = in_array($d['type'] ?? '', $typesValides, true) ? $d['type'] : 'Nouvel élève';

        $stmt = $pdo->prepare(
            'INSERT INTO inscriptions
                (eleve_id, classe_id, annee_scolaire_id, type, statut, date_inscription,
                 montant_du, montant_verse, mode_paiement, reference_paiement)
             VALUES (?, ?, ?, ?, "validee", CURDATE(), ?, ?, ?, ?)'
        );
        $stmt->execute([
            $eleveId,
            (int)$d['classe_id'],
            (int)$d['annee_scolaire_id'],
            $type,
            $montantDu,
            $montantVerseInitial,
            $montantVerseInitial > 0 ? $d['mode_paiement'] : null,
            $d['reference_paiement'] ?? null,
        ]);
        $inscriptionId = (int)$pdo->lastInsertId();

        /* Association automatique des frais obligatoires (module Finance). */
        creerFraisObligatoires($pdo, $inscriptionId, (int)$d['classe_id'], $reduction, $motifReduction);

        /* Frais optionnels cochés à l'inscription (cantine, transport…). */
        $fraisOptionnels = is_array($d['frais_optionnels'] ?? null) ? $d['frais_optionnels'] : [];
        if ($fraisOptionnels) {
            $insererOptionnel = $pdo->prepare(
                'INSERT INTO inscription_frais (inscription_id, type_frais_id, montant_du) VALUES (?, ?, ?)'
            );
            $typeParCode = $pdo->prepare("SELECT id, montant_defaut FROM types_frais WHERE code = ? AND categorie = 'optionnel' AND statut = 'actif'");
            foreach ($fraisOptionnels as $option) {
                $code = trim((string)($option['code'] ?? ''));
                if (!$code) {
                    continue;
                }
                $typeParCode->execute([$code]);
                $type = $typeParCode->fetch();
                if (!$type) {
                    continue;
                }
                $montant = isset($option['montant']) && $option['montant'] !== ''
                    ? (int)$option['montant']
                    : (int)($type['montant_defaut'] ?? 0);
                if ($montant > 0) {
                    $insererOptionnel->execute([$inscriptionId, $type['id'], $montant]);
                }
            }
        }

        /* Versement du jour (facultatif) : un vrai paiement + reçu, jamais
           un simple nombre écrasé — c'est tout l'objet du module Finance.
           Rattaché explicitement au frais d'inscription (jamais un
           versement global) : c'est ce que ce formulaire encaisse, comme
           l'indique déjà son libellé « Paiement des frais d'inscription ». */
        $numeroRecu = null;
        if ($montantVerseInitial > 0) {
            $utilisateur = utilisateurConnecte();

            $stmtFraisInscription = $pdo->prepare(
                "SELECT f.id FROM inscription_frais f
                 JOIN types_frais t ON t.id = f.type_frais_id
                 WHERE f.inscription_id = ? AND t.code = 'inscription'"
            );
            $stmtFraisInscription->execute([$inscriptionId]);
            $fraisInscriptionId = $stmtFraisInscription->fetchColumn();

            $pdo->prepare(
                'INSERT INTO paiements (inscription_id, inscription_frais_id, montant, mode_paiement, reference, observation, date_paiement, saisi_par_id)
                 VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)'
            )->execute([
                $inscriptionId,
                $fraisInscriptionId ?: null,
                $montantVerseInitial,
                $d['mode_paiement'],
                $d['reference_paiement'] ?? null,
                $d['observation'] ?? null,
                $utilisateur['id'] ?? null,
            ]);
            $paiementId = (int)$pdo->lastInsertId();

            $numeroRecu = genererNumeroRecu($pdo);
            $pdo->prepare('INSERT INTO recus (paiement_id, numero) VALUES (?, ?)')->execute([$paiementId, $numeroRecu]);
        }

        $pdo->commit();
        repondre(['id' => $inscriptionId, 'eleve_id' => $eleveId, 'matricule' => $matricule, 'numero_recu' => $numeroRecu], 201);
    } catch (Throwable $e) {
        $pdo->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') {
            erreur('Cet élève a déjà une inscription pour cette année scolaire.', 409);
        }
        erreur('Échec de l\'inscription : ' . $e->getMessage(), 500);
    }
}

if ($methode === 'PUT') {
    $id = idRequis();
    $d  = entreeJSON();

    /* Changement de classe (depuis la fiche Élève) : les frais obligatoires
       déjà associés (scolarité, inscription) sont réajustés sur les
       montants de la nouvelle classe, en conservant la réduction déjà
       accordée à l'élève. Les paiements déjà enregistrés ne sont jamais
       touchés — seul le montant dû peut changer. */
    if (!empty($d['classe_id'])) {
        $stmtClasse = $pdo->prepare('SELECT frais_inscription, frais_scolarite FROM classes WHERE id = ?');
        $stmtClasse->execute([(int)$d['classe_id']]);
        $classe = $stmtClasse->fetch();
        if (!$classe) {
            erreur('Classe introuvable.');
        }
        $montantsParCode = ['inscription' => (int)$classe['frais_inscription'], 'scolarite' => (int)$classe['frais_scolarite']];

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE inscriptions SET classe_id=?, montant_du=? WHERE id=?')->execute([
                (int)$d['classe_id'],
                $montantsParCode['inscription'] + $montantsParCode['scolarite'],
                $id,
            ]);

            $lignes = $pdo->prepare(
                "SELECT f.id, t.code, f.reduction_pourcentage FROM inscription_frais f
                 JOIN types_frais t ON t.id = f.type_frais_id
                 WHERE f.inscription_id = ? AND t.code IN ('inscription','scolarite') AND f.statut = 'actif'"
            );
            $lignes->execute([$id]);
            $maj = $pdo->prepare('UPDATE inscription_frais SET montant_du = ? WHERE id = ?');
            foreach ($lignes->fetchAll() as $ligne) {
                if (!isset($montantsParCode[$ligne['code']])) {
                    continue;
                }
                $nouveauMontant = (int)round($montantsParCode[$ligne['code']] * (100 - $ligne['reduction_pourcentage']) / 100);
                $maj->execute([$nouveauMontant, $ligne['id']]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            erreur('Échec du changement de classe : ' . $e->getMessage(), 500);
        }
        repondre(['ok' => true]);
    }

    /* Changement de statut du dossier (validée / rejetée / annulée...).
       Le versement ne se modifie plus ici : voir php/paiements.php. */
    $statutsValides = ['en_attente', 'validee', 'rejetee', 'annulee'];
    if (!in_array($d['statut'] ?? '', $statutsValides, true)) {
        erreur('Statut invalide.');
    }
    $pdo->prepare('UPDATE inscriptions SET statut=? WHERE id=?')->execute([$d['statut'], $id]);

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
