<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Historique de connexion de l'utilisateur connecté (remplace la liste
   factice de « sessions actives » affichée jusqu'ici dans profil.html) —
   voir php/connexion.php pour l'alimentation de connexions_historique. */
if ($methode === 'GET') {
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }

    $stmt = $pdo->prepare(
        'SELECT id, adresse_ip, navigateur, connecte_le, deconnecte_le
         FROM connexions_historique
         WHERE utilisateur_id = ?
         ORDER BY connecte_le DESC
         LIMIT 10'
    );
    $stmt->execute([$utilisateur['id']]);
    repondre($stmt->fetchAll());
}

erreur('Méthode non autorisée.', 405);
