<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM eleves WHERE id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $eleve = $stmt->fetch();
        if (!$eleve) {
            erreur('Élève introuvable.', 404);
        }
        repondre($eleve);
    }

    repondre($pdo->query('SELECT * FROM eleves ORDER BY nom, prenom')->fetchAll());
}

if ($methode === 'PUT') {
    $id = idRequis();
    $e  = entreeJSON();

    /* Bascule d'une case « pièce du dossier » : mise à jour ciblée pour ne
       pas écraser le reste de la fiche avec des valeurs vides. */
    if (array_key_exists('pieces_fournies', $e) && count($e) === 1) {
        $liste = is_array($e['pieces_fournies']) ? implode(',', $e['pieces_fournies']) : '';
        $pdo->prepare('UPDATE eleves SET pieces_fournies=? WHERE id=?')->execute([$liste, $id]);
        repondre(['ok' => true]);
    }

    $stmt = $pdo->prepare(
        'UPDATE eleves SET nom=?, prenom=?, sexe=?, date_naissance=?, lieu_naissance=?, nationalite=?,
                            pere=?, mere=?, tuteur=?, contact=?, email=?, adresse=?, origine=?, groupe_sanguin=?, statut=?
         WHERE id=?'
    );
    $stmt->execute([
        $e['nom'] ?? '', $e['prenom'] ?? '', $e['sexe'] ?? 'F',
        $e['date_naissance'] ?? null, $e['lieu_naissance'] ?? null, $e['nationalite'] ?? null,
        $e['pere'] ?? null, $e['mere'] ?? null, $e['tuteur'] ?? null,
        $e['contact'] ?? null, $e['email'] ?? null, $e['adresse'] ?? null, $e['origine'] ?? null,
        $e['groupe_sanguin'] ?? null, $e['statut'] ?? 'actif',
        $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    $id = idRequis();
    $pdo->prepare('DELETE FROM eleves WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
