<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/** Modèles de messages réutilisables pour le module Communication. */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM modeles_messages WHERE id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $modele = $stmt->fetch();
        if (!$modele) {
            erreur('Modèle introuvable.', 404);
        }
        repondre($modele);
    }

    repondre($pdo->query('SELECT * FROM modeles_messages ORDER BY titre')->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $m = entreeJSON();

    $titre   = trim((string)($m['titre'] ?? ''));
    $canal   = (string)($m['canal'] ?? 'sms_email');
    $sujet   = trim((string)($m['sujet'] ?? ''));
    $contenu = trim((string)($m['contenu'] ?? ''));

    if (!$titre || !$contenu) {
        erreur('Le titre et le contenu sont obligatoires.');
    }
    if (!in_array($canal, CANAUX_VALIDES, true)) {
        erreur('Canal invalide.');
    }

    $stmt = $pdo->prepare('INSERT INTO modeles_messages (titre, canal, sujet, contenu) VALUES (?, ?, ?, ?)');
    $stmt->execute([$titre, $canal, $sujet ?: null, $contenu]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'PUT') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $id = idRequis();
    $m  = entreeJSON();

    $titre   = trim((string)($m['titre'] ?? ''));
    $canal   = (string)($m['canal'] ?? 'sms_email');
    $sujet   = trim((string)($m['sujet'] ?? ''));
    $contenu = trim((string)($m['contenu'] ?? ''));

    if (!$titre || !$contenu) {
        erreur('Le titre et le contenu sont obligatoires.');
    }
    if (!in_array($canal, CANAUX_VALIDES, true)) {
        erreur('Canal invalide.');
    }

    $stmt = $pdo->prepare('UPDATE modeles_messages SET titre=?, canal=?, sujet=?, contenu=? WHERE id=?');
    $stmt->execute([$titre, $canal, $sujet ?: null, $contenu, $id]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    exigerRoleCommunication(ROLES_COMMUNICATION_GESTION);
    $id = idRequis();
    $pdo->prepare('DELETE FROM modeles_messages WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
