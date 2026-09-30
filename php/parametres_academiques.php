<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $stmt = $pdo->query('SELECT * FROM parametres_academiques WHERE id = 1');
    repondre($stmt->fetch() ?: []);
}

if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);
    $d = entreeJSON();

    $moyennePassage = (float)($d['moyenne_passage'] ?? 10);
    $nombreTrimestres = (int)($d['nombre_trimestres'] ?? 3);
    if ($moyennePassage < 0 || $moyennePassage > 20) {
        erreur('La moyenne de passage doit être comprise entre 0 et 20.');
    }
    if ($nombreTrimestres < 1 || $nombreTrimestres > 4) {
        erreur('Le nombre de trimestres doit être compris entre 1 et 4.');
    }

    $pdo->prepare(
        'UPDATE parametres_academiques
            SET systeme_evaluation = ?, moyenne_passage = ?, nombre_trimestres = ?,
                afficher_rangs = ?, afficher_moyennes_ponderees = ?, autoriser_decimales = ?, arrondir_moyennes = ?
          WHERE id = 1'
    )->execute([
        trim((string)($d['systeme_evaluation'] ?? 'Sur 20')),
        $moyennePassage,
        $nombreTrimestres,
        !empty($d['afficher_rangs']) ? 1 : 0,
        !empty($d['afficher_moyennes_ponderees']) ? 1 : 0,
        !empty($d['autoriser_decimales']) ? 1 : 0,
        !empty($d['arrondir_moyennes']) ? 1 : 0,
    ]);

    $stmt = $pdo->query('SELECT * FROM parametres_academiques WHERE id = 1');
    repondre($stmt->fetch());
}

erreur('Méthode non autorisée.', 405);
