<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/** Rôles autorisés à diffuser une notification à tout le personnel. */
const ROLES_DIFFUSION = ['administrateur', 'direction'];

if ($methode === 'GET') {
    $utilisateur = utilisateurConnecte();
    $utilisateurId = $utilisateur['id'] ?? 0;

    if ($utilisateur && in_array($utilisateur['role'], ROLES_FINANCE_LECTURE, true)) {
        verifierEcheancesEnRetard($pdo);
    }

    $stmt = $pdo->prepare(
        'SELECT n.id, n.titre, n.message, n.icone, n.cree_le,
                CONCAT(u.prenom, \' \', u.nom) AS auteur,
                (l.utilisateur_id IS NOT NULL) AS lue
         FROM notifications n
         LEFT JOIN utilisateurs u ON u.id = n.auteur_id
         LEFT JOIN notifications_lues l ON l.notification_id = n.id AND l.utilisateur_id = ?
         ORDER BY n.cree_le DESC
         LIMIT 50'
    );
    $stmt->execute([$utilisateurId]);
    $notifications = $stmt->fetchAll();

    foreach ($notifications as &$n) {
        $n['lue'] = (bool)$n['lue'];
    }

    repondre($notifications);
}

if ($methode === 'POST') {
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }
    if (!in_array($utilisateur['role'], ROLES_DIFFUSION, true)) {
        erreur('Seuls l\'administration et la direction peuvent diffuser une notification.', 403);
    }

    $d      = entreeJSON();
    $titre   = trim((string)($d['titre'] ?? ''));
    $message = trim((string)($d['message'] ?? ''));
    $icone   = trim((string)($d['icone'] ?? '')) ?: '🔔';

    if (!$titre || !$message) {
        erreur('Le titre et le message sont obligatoires.');
    }

    $stmt = $pdo->prepare(
        'INSERT INTO notifications (titre, message, icone, auteur_id) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$titre, $message, $icone, $utilisateur['id']]);
    $id = (int)$pdo->lastInsertId();

    // L'auteur voit d'emblée sa propre diffusion comme lue.
    $pdo->prepare(
        'INSERT IGNORE INTO notifications_lues (notification_id, utilisateur_id) VALUES (?, ?)'
    )->execute([$id, $utilisateur['id']]);

    repondre([
        'id'      => $id,
        'titre'   => $titre,
        'message' => $message,
        'icone'   => $icone,
        'auteur'  => trim($utilisateur['prenom'] . ' ' . $utilisateur['nom']),
        'cree_le' => date('Y-m-d H:i:s'),
        'lue'     => true,
    ], 201);
}

if ($methode === 'PUT') {
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }

    if (isset($_GET['tout'])) {
        $pdo->prepare(
            'INSERT IGNORE INTO notifications_lues (notification_id, utilisateur_id)
             SELECT id, ? FROM notifications'
        )->execute([$utilisateur['id']]);
        repondre(['ok' => true]);
    }

    $id = idRequis();
    $pdo->prepare(
        'INSERT IGNORE INTO notifications_lues (notification_id, utilisateur_id) VALUES (?, ?)'
    )->execute([$id, $utilisateur['id']]);
    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur || !in_array($utilisateur['role'], ROLES_DIFFUSION, true)) {
        erreur('Action réservée à l\'administration et à la direction.', 403);
    }
    $id = idRequis();
    $pdo->prepare('DELETE FROM notifications WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
