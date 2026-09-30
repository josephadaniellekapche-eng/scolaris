<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleFinance(ROLES_FINANCE_LECTURE);
    $actifsSeulement = isset($_GET['actifs']);
    $sql = 'SELECT id, code, nom, categorie, montant_defaut, statut FROM types_frais';
    if ($actifsSeulement) {
        $sql .= " WHERE statut = 'actif'";
    }
    repondre($pdo->query($sql . ' ORDER BY categorie, nom')->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $d = entreeJSON();

    $code = trim((string)($d['code'] ?? ''));
    $nom  = trim((string)($d['nom'] ?? ''));
    if (!$code || !$nom) {
        erreur('Le code et le nom sont obligatoires.');
    }
    $categorie = in_array($d['categorie'] ?? '', ['obligatoire', 'optionnel'], true) ? $d['categorie'] : 'optionnel';
    $montantDefaut = isset($d['montant_defaut']) && $d['montant_defaut'] !== '' ? (int)$d['montant_defaut'] : null;

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO types_frais (code, nom, categorie, montant_defaut) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$code, $nom, $categorie, $montantDefaut]);
        repondre(['id' => (int)$pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            erreur('Ce code de frais existe déjà.', 409);
        }
        throw $e;
    }
}

if ($methode === 'PUT') {
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $id = idRequis();
    $d  = entreeJSON();

    $nom = trim((string)($d['nom'] ?? ''));
    if (!$nom) {
        erreur('Le nom est obligatoire.');
    }
    $categorie = in_array($d['categorie'] ?? '', ['obligatoire', 'optionnel'], true) ? $d['categorie'] : 'optionnel';
    $montantDefaut = isset($d['montant_defaut']) && $d['montant_defaut'] !== '' ? (int)$d['montant_defaut'] : null;
    $statut = in_array($d['statut'] ?? '', ['actif', 'inactif'], true) ? $d['statut'] : 'actif';

    $pdo->prepare('UPDATE types_frais SET nom=?, categorie=?, montant_defaut=?, statut=? WHERE id=?')
        ->execute([$nom, $categorie, $montantDefaut, $statut, $id]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    /* Désactivation plutôt que suppression : un type de frais déjà
       associé à des inscriptions ne peut pas être supprimé (clé
       étrangère), et on veut garder l'historique intact. */
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $id = idRequis();
    $pdo->prepare("UPDATE types_frais SET statut = 'inactif' WHERE id = ?")->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
