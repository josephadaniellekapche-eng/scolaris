<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $matieres = $pdo->query(
        'SELECT id, code, nom, categorie, description, groupe, ordre_bulletin FROM matieres ORDER BY nom'
    )->fetchAll();

    $affectations = $pdo->query(
        'SELECT a.matiere_id, a.coefficient, a.volume_horaire,
                c.id AS classe_id, c.nom AS classe_nom, c.filiere,
                n.code AS niveau_code, n.nom AS niveau_nom,
                e.id AS enseignant_id, e.civilite, e.nom AS enseignant_nom, e.prenom AS enseignant_prenom
         FROM affectations a
         JOIN classes c     ON c.id = a.classe_id
         JOIN niveaux n     ON n.id = c.niveau_id
         JOIN enseignants e ON e.id = a.enseignant_id'
    )->fetchAll();

    $parMatiere = [];
    foreach ($affectations as $a) {
        $parMatiere[$a['matiere_id']][] = $a;
    }

    foreach ($matieres as &$m) {
        $m['occurrences'] = $parMatiere[$m['id']] ?? [];
    }
    unset($m);

    repondre($matieres);
}

if ($methode === 'POST') {
    $m = entreeJSON();
    if (empty($m['nom']) || empty($m['code'])) {
        erreur('Nom et code obligatoires.');
    }

    $code = preg_replace('/[^A-Z0-9]/', '', strtoupper($m['code']));
    if (!$code) {
        erreur('Le code ne peut contenir que des lettres et des chiffres.');
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO matieres (code, nom, categorie, description, groupe, ordre_bulletin) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $code, $m['nom'], $m['categorie'] ?? 'Fondamentale', $m['description'] ?? null,
            trim((string)($m['groupe'] ?? '')) ?: 'Général',
            (int)($m['ordre_bulletin'] ?? 1),
        ]);
    } catch (PDOException $e) {
        erreur('Ce code matière existe déjà.', 409);
    }

    repondre(['id' => (int)$pdo->lastInsertId(), 'code' => $code], 201);
}

if ($methode === 'PUT') {
    $id = idRequis();
    $m  = entreeJSON();

    $stmt = $pdo->prepare('UPDATE matieres SET nom=?, categorie=?, description=?, groupe=?, ordre_bulletin=? WHERE id=?');
    $stmt->execute([
        $m['nom'] ?? '', $m['categorie'] ?? 'Fondamentale', $m['description'] ?? null,
        trim((string)($m['groupe'] ?? '')) ?: 'Général',
        (int)($m['ordre_bulletin'] ?? 1),
        $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    $id = idRequis();
    try {
        $pdo->prepare('DELETE FROM matieres WHERE id=?')->execute([$id]);
    } catch (PDOException $e) {
        erreur('Impossible de supprimer : cette matière est encore affectée à des classes.', 409);
    }
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
