<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $stmt = $pdo->query('SELECT * FROM parametres_financiers WHERE id = 1');
    repondre($stmt->fetch() ?: []);
}

if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);
    $d = entreeJSON();

    $modesValides = ['Espèces', 'MTN Mobile Money', 'Orange Money', 'Virement bancaire', 'Chèque'];
    $modePaiement = trim((string)($d['mode_paiement_defaut'] ?? 'Espèces'));
    if (!in_array($modePaiement, $modesValides, true)) {
        erreur('Mode de paiement par défaut invalide.');
    }

    $tauxPenalite = (float)($d['taux_penalite'] ?? 0);
    if ($tauxPenalite < 0 || $tauxPenalite > 100) {
        erreur('Le taux de pénalité doit être compris entre 0 et 100.');
    }

    $pdo->prepare(
        'UPDATE parametres_financiers
            SET devise_defaut = ?, mode_paiement_defaut = ?, penalites_retard_actif = ?, taux_penalite = ?
          WHERE id = 1'
    )->execute([
        trim((string)($d['devise_defaut'] ?? 'FCFA')) ?: 'FCFA',
        $modePaiement,
        !empty($d['penalites_retard_actif']) ? 1 : 0,
        $tauxPenalite,
    ]);

    $stmt = $pdo->query('SELECT * FROM parametres_financiers WHERE id = 1');
    repondre($stmt->fetch());
}

erreur('Méthode non autorisée.', 405);
