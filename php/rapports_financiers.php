<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : agrège paiements + inscription_frais + dépenses.
 * N'écrit jamais rien — les rapports « par élève » se lisent déjà en
 * détail via php/inscription_frais.php et php/paiements.php.
 *
 * ?vue=synthese  (défaut) : recettes/dépenses/solde sur la période demandée
 * ?vue=par_classe          : recettes dues/payées, regroupées par classe
 * ?vue=impayes             : inscriptions avec un solde restant à payer
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$utilisateur = exigerRoleFinance(ROLES_FINANCE_RAPPORTS);
$vue = $_GET['vue'] ?? 'synthese';

/* Filtres communs */
$du               = $_GET['du'] ?? null;
$au               = $_GET['au'] ?? null;
$classeId         = (int)($_GET['classe_id'] ?? 0);
$anneeScolaireId  = (int)($_GET['annee_scolaire_id'] ?? 0);

if ($vue === 'synthese') {
    $conditionsPaiements = ["p.statut = 'valide'"];
    $valeursPaiements    = [];
    if ($du) { $conditionsPaiements[] = 'p.date_paiement >= ?'; $valeursPaiements[] = $du; }
    if ($au) { $conditionsPaiements[] = 'p.date_paiement <= ?'; $valeursPaiements[] = $au; }
    if ($classeId) { $conditionsPaiements[] = 'i.classe_id = ?'; $valeursPaiements[] = $classeId; }
    if ($anneeScolaireId) { $conditionsPaiements[] = 'i.annee_scolaire_id = ?'; $valeursPaiements[] = $anneeScolaireId; }

    $sqlRecettes = 'SELECT COALESCE(SUM(p.montant),0), COUNT(*)
                     FROM paiements p JOIN inscriptions i ON i.id = p.inscription_id
                     WHERE ' . implode(' AND ', $conditionsPaiements);
    $stmt = $pdo->prepare($sqlRecettes);
    $stmt->execute($valeursPaiements);
    [$recettes, $nombrePaiements] = $stmt->fetch(PDO::FETCH_NUM);

    $conditionsDus = ["f.statut = 'actif'"];
    $valeursDus    = [];
    if ($classeId) { $conditionsDus[] = 'i.classe_id = ?'; $valeursDus[] = $classeId; }
    if ($anneeScolaireId) { $conditionsDus[] = 'i.annee_scolaire_id = ?'; $valeursDus[] = $anneeScolaireId; }
    $sqlDu = 'SELECT COALESCE(SUM(f.montant_du),0)
              FROM inscription_frais f JOIN inscriptions i ON i.id = f.inscription_id
              WHERE ' . implode(' AND ', $conditionsDus);
    $stmt = $pdo->prepare($sqlDu);
    $stmt->execute($valeursDus);
    $montantDu = (int)$stmt->fetchColumn();

    $conditionsDepenses = ["statut = 'valide'"];
    $valeursDepenses    = [];
    if ($du) { $conditionsDepenses[] = 'date_depense >= ?'; $valeursDepenses[] = $du; }
    if ($au) { $conditionsDepenses[] = 'date_depense <= ?'; $valeursDepenses[] = $au; }
    $sqlDepenses = 'SELECT COALESCE(SUM(montant),0) FROM depenses WHERE ' . implode(' AND ', $conditionsDepenses);
    $stmt = $pdo->prepare($sqlDepenses);
    $stmt->execute($valeursDepenses);
    $depenses = (int)$stmt->fetchColumn();

    repondre([
        'periode'            => ['du' => $du, 'au' => $au],
        'montant_du'         => $montantDu,
        'recettes'           => (int)$recettes,
        'nombre_paiements'   => (int)$nombrePaiements,
        'taux_recouvrement'  => $montantDu > 0 ? round($recettes / $montantDu * 100, 1) : null,
        'depenses'           => $depenses,
        'resultat_net'       => (int)$recettes - $depenses,
    ]);
}

if ($vue === 'par_classe') {
    $conditions = ['1=1'];
    $valeurs    = [];
    if ($anneeScolaireId) { $conditions[] = 'i.annee_scolaire_id = ?'; $valeurs[] = $anneeScolaireId; }

    $sql = "
        SELECT c.id AS classe_id, c.nom AS classe_nom,
               COALESCE(SUM(f.montant_du), 0) AS montant_du,
               COALESCE((
                 SELECT SUM(p.montant) FROM paiements p
                 JOIN inscriptions i2 ON i2.id = p.inscription_id
                 WHERE i2.classe_id = c.id AND p.statut = 'valide'
                 " . ($anneeScolaireId ? 'AND i2.annee_scolaire_id = ?' : '') . "
               ), 0) AS montant_paye
        FROM classes c
        JOIN inscriptions i ON i.classe_id = c.id
        LEFT JOIN inscription_frais f ON f.inscription_id = i.id AND f.statut = 'actif'
        WHERE " . implode(' AND ', $conditions) . '
        GROUP BY c.id, c.nom
        ORDER BY c.nom';

    $valeursFinales = $anneeScolaireId ? [...$valeurs, $anneeScolaireId] : $valeurs;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeursFinales);
    $lignes = $stmt->fetchAll();
    foreach ($lignes as &$ligne) {
        $ligne['montant_du']   = (int)$ligne['montant_du'];
        $ligne['montant_paye'] = (int)$ligne['montant_paye'];
        $ligne['solde']        = $ligne['montant_du'] - $ligne['montant_paye'];
    }
    unset($ligne);

    repondre($lignes);
}

if ($vue === 'impayes') {
    $conditions = ["i.statut = 'validee'"];
    $valeurs    = [];
    if ($classeId) { $conditions[] = 'i.classe_id = ?'; $valeurs[] = $classeId; }
    if ($anneeScolaireId) { $conditions[] = 'i.annee_scolaire_id = ?'; $valeurs[] = $anneeScolaireId; }

    /* La colonne échéance_depassee est un agrégat (MIN sur un CASE) : on
       l'enveloppe dans une sous-requête, MariaDB n'acceptant pas de trier
       sur l'alias d'un agrégat combiné à une autre expression (IS NULL). */
    $sql = "
        SELECT * FROM (
            SELECT i.id AS inscription_id, el.id AS eleve_id, el.matricule, el.nom, el.prenom,
                   c.id AS classe_id, c.nom AS classe_nom,
                   COALESCE(SUM(f.montant_du), 0) AS montant_du,
                   COALESCE((
                     SELECT SUM(p.montant) FROM paiements p WHERE p.inscription_id = i.id AND p.statut = 'valide'
                   ), 0) AS montant_paye,
                   MIN(CASE WHEN f.date_echeance < CURDATE() THEN f.date_echeance END) AS echeance_depassee
            FROM inscriptions i
            JOIN eleves el ON el.id = i.eleve_id
            JOIN classes c ON c.id = i.classe_id
            JOIN inscription_frais f ON f.inscription_id = i.id AND f.statut = 'actif'
            WHERE " . implode(' AND ', $conditions) . '
            GROUP BY i.id, el.id, el.matricule, el.nom, el.prenom, c.id, c.nom
        ) AS synthese
        WHERE (montant_du - montant_paye) > 0
        ORDER BY echeance_depassee IS NULL, echeance_depassee ASC, nom';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    $lignes = $stmt->fetchAll();
    foreach ($lignes as &$ligne) {
        $ligne['montant_du']   = (int)$ligne['montant_du'];
        $ligne['montant_paye'] = (int)$ligne['montant_paye'];
        $ligne['solde']        = $ligne['montant_du'] - $ligne['montant_paye'];
        $ligne['en_retard']    = $ligne['echeance_depassee'] !== null;
    }
    unset($ligne);

    repondre($lignes);
}

erreur('Vue de rapport inconnue.');
