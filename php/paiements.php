<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Toujours joint via inscriptions -> eleves/classes : le module Finance ne
   stocke jamais lui-même le nom, la classe, etc. d'un élève. */
const SELECT_PAIEMENT = "
    SELECT p.id, p.inscription_id, p.inscription_frais_id, p.montant, p.mode_paiement,
           p.reference, p.observation, p.date_paiement, p.statut,
           p.motif_annulation, p.cree_le,
           t.nom AS frais_nom,
           el.id AS eleve_id, el.matricule, el.nom AS eleve_nom, el.prenom AS eleve_prenom,
           c.id AS classe_id, c.nom AS classe_nom,
           r.numero AS numero_recu,
           CONCAT(u.prenom, ' ', u.nom) AS saisi_par
    FROM paiements p
    JOIN inscriptions i        ON i.id = p.inscription_id
    JOIN eleves el              ON el.id = i.eleve_id
    JOIN classes c               ON c.id = i.classe_id
    LEFT JOIN inscription_frais f ON f.id = p.inscription_frais_id
    LEFT JOIN types_frais t       ON t.id = f.type_frais_id
    LEFT JOIN recus r             ON r.paiement_id = p.id
    LEFT JOIN utilisateurs u      ON u.id = p.saisi_par_id";

if ($methode === 'GET') {
    exigerRoleFinance(ROLES_FINANCE_LECTURE);

    $conditions = [];
    $valeurs    = [];

    if (!empty($_GET['inscription_id'])) {
        $conditions[] = 'p.inscription_id = ?';
        $valeurs[]    = (int)$_GET['inscription_id'];
    }
    if (!empty($_GET['eleve_id'])) {
        $conditions[] = 'el.id = ?';
        $valeurs[]    = (int)$_GET['eleve_id'];
    }
    if (!empty($_GET['classe_id'])) {
        $conditions[] = 'c.id = ?';
        $valeurs[]    = (int)$_GET['classe_id'];
    }
    if (!empty($_GET['du'])) {
        $conditions[] = 'p.date_paiement >= ?';
        $valeurs[]    = $_GET['du'];
    }
    if (!empty($_GET['au'])) {
        $conditions[] = 'p.date_paiement <= ?';
        $valeurs[]    = $_GET['au'];
    }
    /* Par défaut, seuls les paiements valides comptent. `inclure_annules`
       permet à l'écran d'historique de montrer aussi les annulations. */
    if (empty($_GET['inclure_annules'])) {
        $conditions[] = "p.statut = 'valide'";
    } elseif (!empty($_GET['statut'])) {
        $conditions[] = 'p.statut = ?';
        $valeurs[]    = $_GET['statut'];
    }

    $sql = SELECT_PAIEMENT;
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY p.date_paiement DESC, p.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $utilisateur = exigerRoleFinance(ROLES_FINANCE_ECRITURE);
    $d = entreeJSON();

    $inscriptionId = (int)($d['inscription_id'] ?? 0);
    $montant       = (int)($d['montant'] ?? 0);
    $modePaiement  = trim((string)($d['mode_paiement'] ?? ''));
    $modesValides  = ['Espèces', 'MTN Mobile Money', 'Orange Money', 'Virement bancaire', 'Chèque'];

    if (!$inscriptionId) {
        erreur('inscription_id est obligatoire.');
    }
    if ($montant <= 0) {
        erreur('Le montant doit être positif.');
    }
    if (!in_array($modePaiement, $modesValides, true)) {
        erreur('Mode de paiement invalide.');
    }

    $inscription = $pdo->prepare('SELECT id FROM inscriptions WHERE id = ?');
    $inscription->execute([$inscriptionId]);
    if (!$inscription->fetch()) {
        erreur('Inscription introuvable.', 404);
    }

    $inscriptionFraisId = null;
    if (!empty($d['inscription_frais_id'])) {
        $frais = $pdo->prepare("SELECT id FROM inscription_frais WHERE id = ? AND inscription_id = ? AND statut = 'actif'");
        $frais->execute([(int)$d['inscription_frais_id'], $inscriptionId]);
        if (!$frais->fetch()) {
            erreur('Ce frais ne correspond pas à cette inscription.', 404);
        }
        $inscriptionFraisId = (int)$d['inscription_frais_id'];
    }

    $datePaiement = !empty($d['date_paiement']) ? $d['date_paiement'] : date('Y-m-d');
    $reference    = !empty($d['reference']) ? trim((string)$d['reference']) : null;
    $observation  = !empty($d['observation']) ? trim((string)$d['observation']) : null;

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO paiements
                (inscription_id, inscription_frais_id, montant, mode_paiement, reference, observation, date_paiement, saisi_par_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $inscriptionId, $inscriptionFraisId, $montant, $modePaiement,
            $reference, $observation, $datePaiement, $utilisateur['id'],
        ]);
        $paiementId = (int)$pdo->lastInsertId();

        $numero = genererNumeroRecu($pdo);
        $pdo->prepare('INSERT INTO recus (paiement_id, numero) VALUES (?, ?)')->execute([$paiementId, $numero]);

        $pdo->commit();
        repondre(['id' => $paiementId, 'numero_recu' => $numero], 201);
    } catch (Throwable $e) {
        $pdo->rollBack();
        erreur('Échec de l\'enregistrement du paiement : ' . $e->getMessage(), 500);
    }
}

/* Annulation d'un paiement : jamais de suppression physique (traçabilité).
   Réservée à l'administration/comptabilité — pas à qui l'a saisi. */
if ($methode === 'PUT') {
    $utilisateur = exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $id = idRequis();
    $d  = entreeJSON();

    $motif = trim((string)($d['motif_annulation'] ?? ''));
    if (!$motif) {
        erreur('Le motif d\'annulation est obligatoire.');
    }

    $paiement = $pdo->prepare("SELECT id FROM paiements WHERE id = ? AND statut = 'valide'");
    $paiement->execute([$id]);
    if (!$paiement->fetch()) {
        erreur('Paiement introuvable ou déjà annulé.', 404);
    }

    $pdo->prepare(
        "UPDATE paiements SET statut='annule', annule_par_id=?, annule_le=NOW(), motif_annulation=? WHERE id=?"
    )->execute([$utilisateur['id'], $motif, $id]);

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
