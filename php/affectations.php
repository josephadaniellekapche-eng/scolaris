<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $classeId = isset($_GET['classe_id']) ? (int)$_GET['classe_id'] : null;

    $sql = 'SELECT a.id, a.enseignant_id, a.matiere_id, a.classe_id, a.coefficient, a.volume_horaire,
                   m.nom AS matiere_nom, e.civilite, e.nom AS enseignant_nom, e.prenom AS enseignant_prenom
            FROM affectations a
            JOIN matieres m     ON m.id = a.matiere_id
            JOIN enseignants e  ON e.id = a.enseignant_id';

    if ($classeId) {
        $stmt = $pdo->prepare($sql . ' WHERE a.classe_id = ?');
        $stmt->execute([$classeId]);
    } else {
        $stmt = $pdo->query($sql);
    }

    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $a = entreeJSON();
    foreach (['enseignant_id', 'matiere_id', 'classe_id', 'coefficient', 'volume_horaire'] as $champ) {
        if (empty($a[$champ])) {
            erreur("Le champ « $champ » est obligatoire.");
        }
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO affectations (enseignant_id, matiere_id, classe_id, coefficient, volume_horaire)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            (int)$a['enseignant_id'],
            (int)$a['matiere_id'],
            (int)$a['classe_id'],
            (int)$a['coefficient'],
            (int)$a['volume_horaire'],
        ]);
    } catch (PDOException $e) {
        erreur('Cette matière est déjà affectée à cette classe.', 409);
    }

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'DELETE') {
    $id = idRequis();
    $pdo->prepare('DELETE FROM affectations WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
