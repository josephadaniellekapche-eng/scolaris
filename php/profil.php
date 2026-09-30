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

$d      = entreeJSON();
$prenom = trim((string)($d['prenom'] ?? ''));
$nom    = trim((string)($d['nom'] ?? ''));
$email  = trim((string)($d['email'] ?? ''));

if (!$prenom || !$nom || !$email) {
    erreur('Le prénom, le nom et l\'adresse e-mail sont obligatoires.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    erreur('Adresse e-mail invalide.');
}

$conflit = $pdo->prepare('SELECT id FROM utilisateurs WHERE email = ? AND id <> ?');
$conflit->execute([$email, $utilisateur['id']]);
if ($conflit->fetch()) {
    erreur('Cette adresse e-mail est déjà utilisée par un autre compte.');
}

$pdo->prepare('UPDATE utilisateurs SET prenom=?, nom=?, email=? WHERE id=?')
    ->execute([$prenom, $nom, $email, $utilisateur['id']]);

/* La session PHP et la réponse renvoyée reflètent immédiatement le changement,
   pour que le front puisse mettre à jour sessionStorage sans se reconnecter. */
$utilisateur['prenom'] = $prenom;
$utilisateur['nom']    = $nom;
$utilisateur['email']  = $email;
$_SESSION['utilisateur'] = $utilisateur;

repondre($utilisateur);
