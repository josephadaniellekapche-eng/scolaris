<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : reconstitue le bulletin d'un élève à partir des mêmes
 * tables que php/notes.php (evaluations + notes), via les fonctions
 * partagées de _aide.php. Aucune note n'est écrite ici — ce module ne fait
 * qu'agréger ce que les enseignants ont déjà saisi dans le module Notes.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$classeId = (int)($_GET['classe_id'] ?? 0);
if (!$classeId) {
    erreur('classe_id est obligatoire.');
}

/* Sans inscription_id : roster minimal pour peupler le sélecteur Élève. */
if (!isset($_GET['inscription_id'])) {
    repondre(roster($pdo, $classeId));
}

$inscriptionId = (int)$_GET['inscription_id'];
$trimestre     = (int)($_GET['trimestre'] ?? 0);
if (!in_array($trimestre, [1, 2, 3], true)) {
    erreur('Le trimestre doit être 1, 2 ou 3.');
}

$anneeActive   = $pdo->query("SELECT libelle FROM annees_scolaires WHERE statut = 'active' LIMIT 1")->fetch();
$anneeLibelle  = $anneeActive['libelle'] ?? '';

$elevesRoster = roster($pdo, $classeId);
$eleveCible   = null;
foreach ($elevesRoster as $eleve) {
    if ((int)$eleve['inscription_id'] === $inscriptionId) {
        $eleveCible = $eleve;
        break;
    }
}
if (!$eleveCible) {
    erreur('Élève introuvable dans cette classe.', 404);
}

$stmtMatieres = $pdo->prepare(
    'SELECT m.id, m.nom, m.groupe, m.ordre_bulletin, a.coefficient
     FROM affectations a
     JOIN matieres m ON m.id = a.matiere_id
     WHERE a.classe_id = ?
     ORDER BY m.ordre_bulletin, m.nom'
);
$stmtMatieres->execute([$classeId]);
$matieres = $stmtMatieres->fetchAll();

/* Accumulateurs pour la moyenne générale et le rang général de TOUS les
   élèves de la classe (pas seulement l'élève demandé), matière par matière. */
$totalParEleve = array_fill_keys(array_column($elevesRoster, 'inscription_id'), 0.0);
$coefParEleve  = array_fill_keys(array_column($elevesRoster, 'inscription_id'), 0);

$groupes = [];

foreach ($matieres as $mat) {
    $matiereId = (int)$mat['id'];
    $coef      = (int)$mat['coefficient'];

    $moyennesDetail = moyennesTrimestreParClasseMatiere($pdo, $classeId, $matiereId, $trimestre);
    $moyennes       = array_map(static fn($m) => $m['trimestre'], $moyennesDetail);
    $rangs          = classement($moyennes);

    foreach ($moyennes as $insId => $moy) {
        if ($moy !== null) {
            $totalParEleve[$insId] += $moy * $coef;
            $coefParEleve[$insId]  += $coef;
        }
    }

    $detailCible  = $moyennesDetail[$inscriptionId] ?? ['sequence1' => null, 'sequence2' => null, 'trimestre' => null];
    $moyenneCible = $detailCible['trimestre'];
    $totalCible   = $moyenneCible !== null ? round($moyenneCible * $coef, 2) : null;

    $nomGroupe = $mat['groupe'];
    if (!isset($groupes[$nomGroupe])) {
        $groupes[$nomGroupe] = ['ordre' => (int)$mat['ordre_bulletin'], 'matieres' => [], 'total' => 0.0, 'coef' => 0];
    }
    $groupes[$nomGroupe]['ordre'] = min($groupes[$nomGroupe]['ordre'], (int)$mat['ordre_bulletin']);
    $groupes[$nomGroupe]['matieres'][] = [
        'matiere'      => $mat['nom'],
        'sequence1'    => $detailCible['sequence1'],
        'sequence2'    => $detailCible['sequence2'],
        'moyenne'      => $moyenneCible,
        'coefficient'  => $coef,
        'total'        => $totalCible,
        'rang'         => $rangs[$inscriptionId] ?? null,
        'appreciation' => appreciation($moyenneCible),
    ];
    if ($totalCible !== null) {
        $groupes[$nomGroupe]['total'] += $totalCible;
        $groupes[$nomGroupe]['coef']  += $coef;
    }
}

uasort($groupes, static fn($a, $b) => $a['ordre'] <=> $b['ordre']);

$groupesFinal = [];
foreach ($groupes as $nom => $g) {
    $groupesFinal[] = [
        'groupe'         => $nom,
        'matieres'       => $g['matieres'],
        'moyenne_groupe' => $g['coef'] > 0 ? round($g['total'] / $g['coef'], 2) : null,
    ];
}

$moyennesGenerales = [];
foreach ($elevesRoster as $eleve) {
    $id = (int)$eleve['inscription_id'];
    $moyennesGenerales[$id] = $coefParEleve[$id] > 0 ? round($totalParEleve[$id] / $coefParEleve[$id], 2) : null;
}
$rangsGeneraux = classement($moyennesGenerales);

$numeroBulletin = codeVerificationBulletin(
    $eleveCible['matricule'],
    $trimestre,
    $anneeLibelle,
    $moyennesGenerales[$inscriptionId] ?? null
);

repondre([
    'eleve' => [
        'inscription_id' => $inscriptionId,
        'eleve_id'       => (int)$eleveCible['eleve_id'],
        'matricule'      => $eleveCible['matricule'],
        'nom'            => $eleveCible['nom'],
        'prenom'         => $eleveCible['prenom'],
        'sexe'           => $eleveCible['sexe'],
    ],
    'effectif'         => count($elevesRoster),
    'trimestre'        => $trimestre,
    'annee_scolaire'   => $anneeLibelle,
    'groupes'          => $groupesFinal,
    'moyenne_generale' => $moyennesGenerales[$inscriptionId] ?? null,
    'rang_general'     => $rangsGeneraux[$inscriptionId] ?? null,
    'appreciation_generale' => appreciation($moyennesGenerales[$inscriptionId] ?? null),
    'numero_bulletin'  => $numeroBulletin,
]);
