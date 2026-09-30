<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Gestion des comptes/rôles réservée à l'administrateur (voir proposition
   validée pour le module Administratif). Jamais de nom ressaisi : un compte
   enseignant/personnel se rattache à une fiche déjà existante. */
const SELECT_UTILISATEUR = "
    SELECT u.id, u.nom, u.prenom, u.email, u.role, u.statut, u.derniere_connexion,
           u.enseignant_id, u.personnel_id,
           ens.nom AS enseignant_nom, ens.prenom AS enseignant_prenom,
           pa.nom AS personnel_nom, pa.prenom AS personnel_prenom, pa.fonction AS personnel_fonction
    FROM utilisateurs u
    LEFT JOIN enseignants ens ON ens.id = u.enseignant_id
    LEFT JOIN personnel_administratif pa ON pa.id = u.personnel_id";

if ($methode === 'GET') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_UTILISATEURS);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare(SELECT_UTILISATEUR . ' WHERE u.id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $utilisateur = $stmt->fetch();
        if (!$utilisateur) {
            erreur('Utilisateur introuvable.', 404);
        }
        repondre($utilisateur);
    }

    repondre($pdo->query(SELECT_UTILISATEUR . ' ORDER BY u.nom, u.prenom')->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_UTILISATEURS);
    $d = entreeJSON();

    $rolesValides = ['administrateur', 'direction', 'secretaire', 'enseignant', 'comptable'];
    $nom          = trim((string)($d['nom'] ?? ''));
    $prenom       = trim((string)($d['prenom'] ?? ''));
    $email        = trim((string)($d['email'] ?? ''));
    $motDePasse   = (string)($d['mot_de_passe'] ?? '');
    $role         = trim((string)($d['role'] ?? ''));

    if (!$nom || !$prenom || !$email || !$motDePasse) {
        erreur('Nom, prénom, e-mail et mot de passe sont obligatoires.');
    }
    if (strlen($motDePasse) < 6) {
        erreur('Le mot de passe doit compter au moins 6 caractères.');
    }
    if (!in_array($role, $rolesValides, true)) {
        erreur('Rôle invalide.');
    }

    $enseignantId = null;
    if ($role === 'enseignant' && !empty($d['enseignant_id'])) {
        $verif = $pdo->prepare('SELECT id FROM enseignants WHERE id = ?');
        $verif->execute([(int)$d['enseignant_id']]);
        if (!$verif->fetch()) {
            erreur('Enseignant introuvable.', 404);
        }
        $enseignantId = (int)$d['enseignant_id'];
    }

    $personnelId = null;
    if ($role !== 'enseignant' && !empty($d['personnel_id'])) {
        $verif = $pdo->prepare('SELECT id FROM personnel_administratif WHERE id = ?');
        $verif->execute([(int)$d['personnel_id']]);
        if (!$verif->fetch()) {
            erreur('Agent administratif introuvable.', 404);
        }
        $personnelId = (int)$d['personnel_id'];
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role, enseignant_id, personnel_id, statut)
             VALUES (?, ?, ?, ?, ?, ?, ?, "actif")'
        );
        $stmt->execute([
            $nom, $prenom, $email,
            password_hash($motDePasse, PASSWORD_DEFAULT),
            $role, $enseignantId, $personnelId,
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            erreur('Cette adresse e-mail est déjà utilisée, ou cette fiche enseignant/personnel est déjà rattachée à un autre compte.', 409);
        }
        throw $e;
    }

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_UTILISATEURS);
    $id = idRequis();
    $d  = entreeJSON();

    $existe = $pdo->prepare('SELECT id FROM utilisateurs WHERE id = ?');
    $existe->execute([$id]);
    if (!$existe->fetch()) {
        erreur('Utilisateur introuvable.', 404);
    }

    $rolesValides = ['administrateur', 'direction', 'secretaire', 'enseignant', 'comptable'];
    $role = trim((string)($d['role'] ?? ''));
    if (!in_array($role, $rolesValides, true)) {
        erreur('Rôle invalide.');
    }
    $statut = ($d['statut'] ?? 'actif') === 'desactive' ? 'desactive' : 'actif';

    $enseignantId = null;
    if ($role === 'enseignant' && !empty($d['enseignant_id'])) {
        $verif = $pdo->prepare('SELECT id FROM enseignants WHERE id = ?');
        $verif->execute([(int)$d['enseignant_id']]);
        if (!$verif->fetch()) {
            erreur('Enseignant introuvable.', 404);
        }
        $enseignantId = (int)$d['enseignant_id'];
    }

    $personnelId = null;
    if ($role !== 'enseignant' && !empty($d['personnel_id'])) {
        $verif = $pdo->prepare('SELECT id FROM personnel_administratif WHERE id = ?');
        $verif->execute([(int)$d['personnel_id']]);
        if (!$verif->fetch()) {
            erreur('Agent administratif introuvable.', 404);
        }
        $personnelId = (int)$d['personnel_id'];
    }

    try {
        $pdo->prepare(
            'UPDATE utilisateurs SET role=?, statut=?, enseignant_id=?, personnel_id=? WHERE id=?'
        )->execute([$role, $statut, $enseignantId, $personnelId, $id]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            erreur('Cette fiche enseignant/personnel est déjà rattachée à un autre compte.', 409);
        }
        throw $e;
    }

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
