<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$niveaux = db()->query('SELECT id, code, nom, cycle, ordre FROM niveaux ORDER BY ordre')->fetchAll();
repondre($niveaux);
