<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* --- Connexion --- */
if ($methode === 'POST') {
    $d = entreeJSON();
    $email       = trim((string)($d['email'] ?? ''));
    $motDePasse  = (string)($d['mot_de_passe'] ?? '');

    if (!$email || !$motDePasse) {
        erreur('Adresse e-mail et mot de passe requis.');
    }

    $stmt = $pdo->prepare(
        'SELECT id, nom, prenom, email, mot_de_passe_hash, role, statut, enseignant_id
         FROM utilisateurs WHERE email = ?'
    );
    $stmt->execute([$email]);
    $utilisateur = $stmt->fetch();

    /* Message volontairement identique que l'email existe ou non,
       pour ne pas révéler quels comptes existent. */
    if (!$utilisateur || !password_verify($motDePasse, $utilisateur['mot_de_passe_hash'])) {
        erreur('Identifiants incorrects.', 401);
    }
    if ($utilisateur['statut'] !== 'actif') {
        erreur('Ce compte a été désactivé.', 403);
    }

    $pdo->prepare('UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = ?')
        ->execute([$utilisateur['id']]);

    /* Historique de connexion (module Paramètres) : une ligne par connexion,
       complétée à la déconnexion — voir php/connexions.php. */
    $pdo->prepare(
        'INSERT INTO connexions_historique (utilisateur_id, adresse_ip, navigateur) VALUES (?, ?, ?)'
    )->execute([
        $utilisateur['id'],
        $_SERVER['REMOTE_ADDR'] ?? null,
        $_SERVER['HTTP_USER_AGENT'] ?? null,
    ]);
    $connexionId = (int)$pdo->lastInsertId();

    $_SESSION['utilisateur'] = [
        'id'             => $utilisateur['id'],
        'nom'            => $utilisateur['nom'],
        'prenom'         => $utilisateur['prenom'],
        'email'          => $utilisateur['email'],
        'role'           => $utilisateur['role'],
        'enseignant_id'  => $utilisateur['enseignant_id'] !== null ? (int)$utilisateur['enseignant_id'] : null,
    ];
    $_SESSION['connexion_id'] = $connexionId;

    repondre($_SESSION['utilisateur']);
}

/* --- Qui est connecté ? --- */
if ($methode === 'GET') {
    repondre(['utilisateur' => $_SESSION['utilisateur'] ?? null]);
}

/* --- Déconnexion --- */
if ($methode === 'DELETE') {
    if (!empty($_SESSION['connexion_id'])) {
        $pdo->prepare('UPDATE connexions_historique SET deconnecte_le = NOW() WHERE id = ?')
            ->execute([$_SESSION['connexion_id']]);
    }
    $_SESSION = [];
    session_destroy();
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
