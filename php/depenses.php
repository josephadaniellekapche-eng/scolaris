<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

const SELECT_DEPENSE = "
    SELECT d.id, d.libelle, d.montant, d.date_depense, d.beneficiaire,
           d.mode_paiement, d.reference, d.statut, d.cree_le,
           cat.id AS categorie_id, cat.nom AS categorie_nom,
           CONCAT(u.prenom, ' ', u.nom) AS saisi_par
    FROM depenses d
    JOIN categories_depenses cat ON cat.id = d.categorie_id
    LEFT JOIN utilisateurs u     ON u.id = d.saisi_par_id";

if ($methode === 'GET') {
    exigerRoleFinance(ROLES_FINANCE_RAPPORTS);

    $conditions = ["d.statut = 'valide'"];
    $valeurs    = [];

    if (!empty($_GET['categorie_id'])) {
        $conditions[] = 'd.categorie_id = ?';
        $valeurs[]    = (int)$_GET['categorie_id'];
    }
    if (!empty($_GET['du'])) {
        $conditions[] = 'd.date_depense >= ?';
        $valeurs[]    = $_GET['du'];
    }
    if (!empty($_GET['au'])) {
        $conditions[] = 'd.date_depense <= ?';
        $valeurs[]    = $_GET['au'];
    }

    $sql = SELECT_DEPENSE . ' WHERE ' . implode(' AND ', $conditions) . ' ORDER BY d.date_depense DESC, d.id DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $utilisateur = exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $d = entreeJSON();

    $categorieId = (int)($d['categorie_id'] ?? 0);
    $libelle     = trim((string)($d['libelle'] ?? ''));
    $montant     = (int)($d['montant'] ?? 0);
    $modePaiement = trim((string)($d['mode_paiement'] ?? ''));
    $modesValides = ['Espèces', 'MTN Mobile Money', 'Orange Money', 'Virement bancaire', 'Chèque'];

    if (!$categorieId || !$libelle) {
        erreur('La catégorie et le libellé sont obligatoires.');
    }
    if ($montant <= 0) {
        erreur('Le montant doit être positif.');
    }
    if (!in_array($modePaiement, $modesValides, true)) {
        erreur('Mode de paiement invalide.');
    }

    $dateDepense  = !empty($d['date_depense']) ? $d['date_depense'] : date('Y-m-d');
    $beneficiaire = !empty($d['beneficiaire']) ? trim((string)$d['beneficiaire']) : null;
    $reference    = !empty($d['reference']) ? trim((string)$d['reference']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO depenses (categorie_id, libelle, montant, date_depense, beneficiaire, mode_paiement, reference, saisi_par_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$categorieId, $libelle, $montant, $dateDepense, $beneficiaire, $modePaiement, $reference, $utilisateur['id']]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

/* Annulation (jamais de suppression physique — traçabilité). */
if ($methode === 'PUT') {
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $id = idRequis();
    $d  = entreeJSON();

    if (($d['action'] ?? '') !== 'annuler') {
        erreur('Seule l\'annulation est prise en charge.');
    }

    $depense = $pdo->prepare("SELECT id FROM depenses WHERE id = ? AND statut = 'valide'");
    $depense->execute([$id]);
    if (!$depense->fetch()) {
        erreur('Dépense introuvable ou déjà annulée.', 404);
    }

    $pdo->prepare("UPDATE depenses SET statut = 'annule' WHERE id = ?")->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
