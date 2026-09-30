<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

const SELECT_CLASSE = '
    SELECT c.id, c.code, c.nom, c.filiere, c.capacite, c.salle,
           c.frais_inscription, c.frais_scolarite,
           n.code AS niveau_code, n.nom AS niveau_nom, n.cycle,
           a.libelle AS annee_scolaire, c.annee_scolaire_id,
           p.id AS professeur_principal_id, p.civilite AS pp_civilite,
           p.nom AS pp_nom, p.prenom AS pp_prenom
    FROM classes c
    JOIN niveaux n           ON n.id = c.niveau_id
    JOIN annees_scolaires a  ON a.id = c.annee_scolaire_id
    LEFT JOIN enseignants p  ON p.id = c.professeur_principal_id';

if ($methode === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare(SELECT_CLASSE . ' WHERE c.id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $classe = $stmt->fetch();
        if (!$classe) {
            erreur('Classe introuvable.', 404);
        }
        $classe['inscrits'] = (int)$pdo->query(
            'SELECT COUNT(*) FROM inscriptions WHERE classe_id = ' . (int)$classe['id'] . ' AND statut = "validee"'
        )->fetchColumn();
        repondre($classe);
    }

    $classes = $pdo->query(SELECT_CLASSE . ' ORDER BY n.ordre, c.nom')->fetchAll();

    $comptes = $pdo->query(
        'SELECT classe_id, COUNT(*) AS total FROM inscriptions WHERE statut = "validee" GROUP BY classe_id'
    )->fetchAll(PDO::FETCH_KEY_PAIR);

    foreach ($classes as &$c) {
        $c['inscrits'] = (int)($comptes[$c['id']] ?? 0);
    }
    unset($c);

    repondre($classes);
}

if ($methode === 'POST') {
    $c = entreeJSON();
    foreach (['niveau_id', 'filiere', 'nom', 'annee_scolaire_id', 'capacite'] as $champ) {
        if (empty($c[$champ]) && $c[$champ] !== 0) {
            erreur("Le champ « $champ » est obligatoire.");
        }
    }

    $stmtNiveau = $pdo->prepare('SELECT code FROM niveaux WHERE id = ?');
    $stmtNiveau->execute([(int)$c['niveau_id']]);
    $niveauCode = $stmtNiveau->fetchColumn();
    if (!$niveauCode) {
        erreur('Niveau inconnu.');
    }
    $code = $niveauCode . $c['filiere'] . substr((string)round(microtime(true) * 1000), -4);

    $stmt = $pdo->prepare(
        'INSERT INTO classes
            (code, nom, niveau_id, filiere, annee_scolaire_id, capacite, salle,
             professeur_principal_id, frais_inscription, frais_scolarite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $code,
        $c['nom'],
        (int)$c['niveau_id'],
        $c['filiere'],
        (int)$c['annee_scolaire_id'],
        (int)$c['capacite'],
        $c['salle'] ?? null,
        !empty($c['professeur_principal_id']) ? (int)$c['professeur_principal_id'] : null,
        (int)($c['frais_inscription'] ?? 0),
        (int)($c['frais_scolarite'] ?? 0),
    ]);

    repondre(['id' => (int)$pdo->lastInsertId(), 'code' => $code], 201);
}

if ($methode === 'PUT') {
    $id = idRequis();
    $c  = entreeJSON();

    /* Le niveau, la filière et le nom ne sont volontairement pas modifiables
       ici : ce sont les repères utilisés par Élèves/Inscription pour
       rattacher chaque élève à sa classe. */
    $stmt = $pdo->prepare(
        'UPDATE classes SET capacite=?, salle=?, professeur_principal_id=?, frais_inscription=?, frais_scolarite=?
         WHERE id=?'
    );
    $stmt->execute([
        (int)($c['capacite'] ?? 0),
        $c['salle'] ?? null,
        !empty($c['professeur_principal_id']) ? (int)$c['professeur_principal_id'] : null,
        (int)($c['frais_inscription'] ?? 0),
        (int)($c['frais_scolarite'] ?? 0),
        $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    $id = idRequis();
    try {
        $pdo->prepare('DELETE FROM classes WHERE id=?')->execute([$id]);
    } catch (PDOException $e) {
        erreur('Impossible de supprimer : des élèves sont encore inscrits dans cette classe.', 409);
    }
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
