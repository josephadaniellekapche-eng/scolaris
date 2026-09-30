<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleFinance(ROLES_FINANCE_LECTURE);
    repondre($pdo->query('SELECT id, nom FROM categories_depenses ORDER BY nom')->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $d   = entreeJSON();
    $nom = trim((string)($d['nom'] ?? ''));
    if (!$nom) {
        erreur('Le nom est obligatoire.');
    }

    try {
        $pdo->prepare('INSERT INTO categories_depenses (nom) VALUES (?)')->execute([$nom]);
        repondre(['id' => (int)$pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            erreur('Cette catégorie existe déjà.', 409);
        }
        throw $e;
    }
}

erreur('Méthode non autorisée.', 405);
