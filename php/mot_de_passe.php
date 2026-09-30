<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'PUT') {
    erreur('Méthode non autorisée.', 405);
}

$utilisateur = utilisateurConnecte();
if (!$utilisateur) {
    erreur('Connexion requise.', 401);
}

$d       = entreeJSON();
$actuel   = (string)($d['mot_de_passe_actuel'] ?? '');
$nouveau  = (string)($d['nouveau_mot_de_passe'] ?? '');

if (!$actuel || !$nouveau) {
    erreur('Le mot de passe actuel et le nouveau mot de passe sont obligatoires.');
}
if (strlen($nouveau) < 6) {
    erreur('Le nouveau mot de passe doit compter au moins 6 caractères.');
}

$stmt = $pdo->prepare('SELECT mot_de_passe_hash FROM utilisateurs WHERE id = ?');
$stmt->execute([$utilisateur['id']]);
$hash = $stmt->fetchColumn();

if (!$hash || !password_verify($actuel, $hash)) {
    erreur('Mot de passe actuel incorrect.', 401);
}

$pdo->prepare('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?')
    ->execute([password_hash($nouveau, PASSWORD_DEFAULT), $utilisateur['id']]);

repondre(['ok' => true]);
