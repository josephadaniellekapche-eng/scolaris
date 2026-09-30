<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $classeId  = (int)($_GET['classe_id'] ?? 0);
    $matiereId = (int)($_GET['matiere_id'] ?? 0);
    $sequence  = (int)($_GET['sequence'] ?? 0);

    if (!$classeId || !$matiereId || !$sequence) {
        erreur('classe_id, matiere_id et sequence sont obligatoires.');
    }

    $stmt = $pdo->prepare(
        'SELECT id, libelle, coefficient, ordre FROM evaluations
         WHERE classe_id = ? AND matiere_id = ? AND sequence = ?
         ORDER BY ordre, id'
    );
    $stmt->execute([$classeId, $matiereId, $sequence]);

    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $e = entreeJSON();
    foreach (['classe_id', 'matiere_id', 'sequence', 'libelle'] as $champ) {
        if (empty($e[$champ])) {
            erreur("Le champ « $champ » est obligatoire.");
        }
    }

    $sequence = (int)$e['sequence'];
    if ($sequence < 1 || $sequence > 6) {
        erreur('La séquence doit être comprise entre 1 et 6.');
    }

    $coefficient = isset($e['coefficient']) ? (int)$e['coefficient'] : 1;
    if ($coefficient < 1) {
        erreur('Le coefficient doit être au moins 1.');
    }

    verifierAffectation($pdo, (int)$e['classe_id'], (int)$e['matiere_id']);

    $ordre = $pdo->prepare(
        'SELECT COALESCE(MAX(ordre), 0) + 1 FROM evaluations WHERE classe_id = ? AND matiere_id = ? AND sequence = ?'
    );
    $ordre->execute([(int)$e['classe_id'], (int)$e['matiere_id'], $sequence]);

    $stmt = $pdo->prepare(
        'INSERT INTO evaluations (classe_id, matiere_id, sequence, libelle, coefficient, ordre)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        (int)$e['classe_id'],
        (int)$e['matiere_id'],
        $sequence,
        trim((string)$e['libelle']),
        $coefficient,
        (int)$ordre->fetchColumn(),
    ]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'DELETE') {
    $id = idRequis();

    $stmt = $pdo->prepare('SELECT classe_id, matiere_id FROM evaluations WHERE id = ?');
    $stmt->execute([$id]);
    $evaluation = $stmt->fetch();
    if (!$evaluation) {
        erreur('Évaluation introuvable.', 404);
    }
    verifierAffectation($pdo, (int)$evaluation['classe_id'], (int)$evaluation['matiere_id']);

    $pdo->prepare('DELETE FROM evaluations WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
