<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $annees = $pdo->query(
        'SELECT id, libelle, date_debut, date_fin, statut FROM annees_scolaires ORDER BY date_debut DESC'
    )->fetchAll();
    repondre($annees);
}

/** Crée une nouvelle année scolaire, au statut "à venir" (module Paramètres). */
if ($methode === 'POST') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);
    $d = entreeJSON();

    $libelle = trim((string)($d['libelle'] ?? ''));
    $debut   = trim((string)($d['date_debut'] ?? ''));
    $fin     = trim((string)($d['date_fin'] ?? ''));

    if (!$libelle || !$debut || !$fin) {
        erreur('Le libellé et les deux dates sont obligatoires.');
    }
    if ($fin <= $debut) {
        erreur('La date de fin doit être après la date de début.');
    }

    try {
        $pdo->prepare(
            "INSERT INTO annees_scolaires (libelle, date_debut, date_fin, statut) VALUES (?, ?, ?, 'a_venir')"
        )->execute([$libelle, $debut, $fin]);
    } catch (PDOException $e) {
        erreur('Ce libellé d\'année scolaire existe déjà.', 409);
    }

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

/**
 * PUT sans corps (comportement historique, utilisé par profil.js) : bascule
 * l'année scolaire active. PUT avec libelle/date_debut/date_fin (module
 * Paramètres) : modifie ces informations sans toucher au statut.
 * Les deux réservés à l'administration et à la direction.
 */
if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);

    $id = idRequis();
    $existe = $pdo->prepare('SELECT id FROM annees_scolaires WHERE id = ?');
    $existe->execute([$id]);
    if (!$existe->fetch()) {
        erreur('Année scolaire introuvable.', 404);
    }

    $d = entreeJSON();

    if (!empty($d['libelle']) || !empty($d['date_debut']) || !empty($d['date_fin'])) {
        $actuelle = $pdo->prepare('SELECT libelle, date_debut, date_fin FROM annees_scolaires WHERE id = ?');
        $actuelle->execute([$id]);
        $a = $actuelle->fetch();

        $libelle = trim((string)($d['libelle'] ?? $a['libelle']));
        $debut   = trim((string)($d['date_debut'] ?? $a['date_debut']));
        $fin     = trim((string)($d['date_fin'] ?? $a['date_fin']));
        if ($fin <= $debut) {
            erreur('La date de fin doit être après la date de début.');
        }

        $pdo->prepare('UPDATE annees_scolaires SET libelle=?, date_debut=?, date_fin=? WHERE id=?')
            ->execute([$libelle, $debut, $fin, $id]);

        repondre(['ok' => true]);
    }

    $pdo->prepare("UPDATE annees_scolaires SET statut = 'cloturee' WHERE statut = 'active'")->execute();
    $pdo->prepare("UPDATE annees_scolaires SET statut = 'active' WHERE id = ?")->execute([$id]);

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
