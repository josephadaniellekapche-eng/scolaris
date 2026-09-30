<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleFinance(ROLES_FINANCE_LECTURE);
    $inscriptionId = (int)($_GET['inscription_id'] ?? 0);
    if (!$inscriptionId) {
        erreur('inscription_id est obligatoire.');
    }

    $detail = fraisAvecSoldes($pdo, $inscriptionId);
    $solde  = soldeInscription($pdo, $inscriptionId);

    repondre([
        'frais'                 => $detail['frais'],
        'excedent_non_affecte'  => $detail['excedent_non_affecte'],
        'montant_du'            => $solde['montant_du'],
        'montant_paye'          => $solde['montant_paye'],
        'solde'                 => $solde['solde'],
    ]);
}

/* Ajout d'un frais optionnel (cantine, transport, tenue…) à une inscription
   déjà existante — depuis la fiche financière de l'élève, sans resaisir
   son identité. Les frais obligatoires sont créés automatiquement par
   creerFraisObligatoires() à la création de l'inscription (php/inscriptions.php). */
if ($methode === 'POST') {
    exigerRoleFinance(ROLES_FINANCE_ECRITURE);
    $d = entreeJSON();

    $inscriptionId = (int)($d['inscription_id'] ?? 0);
    $typeFraisId   = (int)($d['type_frais_id'] ?? 0);
    if (!$inscriptionId || !$typeFraisId) {
        erreur('inscription_id et type_frais_id sont obligatoires.');
    }

    $inscription = $pdo->prepare('SELECT id FROM inscriptions WHERE id = ?');
    $inscription->execute([$inscriptionId]);
    if (!$inscription->fetch()) {
        erreur('Inscription introuvable.', 404);
    }

    $type = $pdo->prepare("SELECT montant_defaut FROM types_frais WHERE id = ? AND statut = 'actif'");
    $type->execute([$typeFraisId]);
    $typeFrais = $type->fetch();
    if (!$typeFrais) {
        erreur('Type de frais introuvable ou désactivé.', 404);
    }

    $montantDu = isset($d['montant_du']) && $d['montant_du'] !== ''
        ? (int)$d['montant_du']
        : (int)($typeFrais['montant_defaut'] ?? 0);
    if ($montantDu <= 0) {
        erreur('Le montant du frais doit être renseigné et positif.');
    }

    $dateEcheance = !empty($d['date_echeance']) ? $d['date_echeance'] : null;

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO inscription_frais (inscription_id, type_frais_id, montant_du, date_echeance)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$inscriptionId, $typeFraisId, $montantDu, $dateEcheance]);
        repondre(['id' => (int)$pdo->lastInsertId()], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            erreur('Ce frais est déjà associé à cette inscription.', 409);
        }
        throw $e;
    }
}

/* Modification (montant, échéance) ou annulation d'un frais déjà associé —
   opération sensible (un paiement peut déjà avoir été enregistré dessus),
   réservée à l'administration/comptabilité. */
if ($methode === 'PUT') {
    exigerRoleFinance(ROLES_FINANCE_ADMIN);
    $id = idRequis();
    $d  = entreeJSON();

    $frais = $pdo->prepare('SELECT id FROM inscription_frais WHERE id = ?');
    $frais->execute([$id]);
    if (!$frais->fetch()) {
        erreur('Frais introuvable.', 404);
    }

    if (($d['action'] ?? '') === 'annuler') {
        $pdo->prepare("UPDATE inscription_frais SET statut = 'annule' WHERE id = ?")->execute([$id]);
        repondre(['ok' => true]);
    }

    $champs = [];
    $valeurs = [];
    if (isset($d['montant_du'])) {
        $champs[] = 'montant_du = ?';
        $valeurs[] = (int)$d['montant_du'];
    }
    if (array_key_exists('date_echeance', $d)) {
        $champs[] = 'date_echeance = ?';
        $valeurs[] = $d['date_echeance'] ?: null;
    }
    if (!$champs) {
        erreur('Aucune modification fournie.');
    }
    $valeurs[] = $id;
    $pdo->prepare('UPDATE inscription_frais SET ' . implode(', ', $champs) . ' WHERE id = ?')->execute($valeurs);

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
