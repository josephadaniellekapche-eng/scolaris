<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/** Rôles autorisés à modifier la fiche établissement. */
const ROLES_ETABLISSEMENT = ['administrateur', 'direction'];

if ($methode === 'GET') {
    $fiche = $pdo->query(
        'SELECT nom, adresse, telephone, email,
                delegation_regionale, delegation_regionale_en,
                delegation_departementale, delegation_departementale_en
         FROM etablissement WHERE id = 1'
    )->fetch();
    repondre($fiche ?: []);
}

if ($methode === 'PUT') {
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur || !in_array($utilisateur['role'], ROLES_ETABLISSEMENT, true)) {
        erreur('Action réservée à l\'administration et à la direction.', 403);
    }

    $d        = entreeJSON();
    $nom       = trim((string)($d['nom'] ?? ''));
    $adresse   = trim((string)($d['adresse'] ?? ''));
    $telephone = trim((string)($d['telephone'] ?? ''));
    $email     = trim((string)($d['email'] ?? ''));

    /* Lignes bilingues de l'en-tête ministériel du bulletin : facultatives
       (un bulletin peut être imprimé sans ces informations déjà remplies). */
    $delegationRegionale       = trim((string)($d['delegation_regionale'] ?? ''));
    $delegationRegionaleEn     = trim((string)($d['delegation_regionale_en'] ?? ''));
    $delegationDepartementale   = trim((string)($d['delegation_departementale'] ?? ''));
    $delegationDepartementaleEn = trim((string)($d['delegation_departementale_en'] ?? ''));

    if (!$nom || !$adresse || !$telephone || !$email) {
        erreur('Tous les champs sont obligatoires.');
    }

    $pdo->prepare(
        'UPDATE etablissement SET nom=?, adresse=?, telephone=?, email=?,
            delegation_regionale=?, delegation_regionale_en=?,
            delegation_departementale=?, delegation_departementale_en=?
         WHERE id = 1'
    )->execute([
        $nom, $adresse, $telephone, $email,
        $delegationRegionale ?: null, $delegationRegionaleEn ?: null,
        $delegationDepartementale ?: null, $delegationDepartementaleEn ?: null,
    ]);

    repondre([
        'nom' => $nom, 'adresse' => $adresse, 'telephone' => $telephone, 'email' => $email,
        'delegation_regionale' => $delegationRegionale, 'delegation_regionale_en' => $delegationRegionaleEn,
        'delegation_departementale' => $delegationDepartementale, 'delegation_departementale_en' => $delegationDepartementaleEn,
    ]);
}

erreur('Méthode non autorisée.', 405);
