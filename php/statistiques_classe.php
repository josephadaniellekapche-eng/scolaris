<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : statistiques d'évaluation d'une classe pour un trimestre
 * donné — moyenne par matière (comment les élèves assimilent chaque
 * discipline) et répartition des moyennes générales par appréciation.
 * Réutilise exactement les mêmes fonctions que php/bulletins.php et
 * php/resultats.php (roster(), moyennesTrimestreParClasseMatiere(),
 * appreciation()) : jamais un second calcul de moyenne qui pourrait
 * diverger de celui affiché sur le bulletin d'un élève.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$classeId  = (int)($_GET['classe_id'] ?? 0);
$trimestre = (int)($_GET['trimestre'] ?? 0);
if (!$classeId) {
    erreur('classe_id est obligatoire.');
}
if (!in_array($trimestre, [1, 2, 3], true)) {
    erreur('Le trimestre doit être 1, 2 ou 3.');
}

$elevesRoster = roster($pdo, $classeId);
if (!$elevesRoster) {
    repondre([
        'effectif'                  => 0,
        'effectif_note'             => 0,
        'par_matiere'               => [],
        'repartition_appreciations' => [],
        'taux_reussite'             => null,
        'moyenne_classe'            => null,
    ]);
}

$stmtMatieres = $pdo->prepare(
    'SELECT m.id, m.nom, a.coefficient
     FROM affectations a
     JOIN matieres m ON m.id = a.matiere_id
     WHERE a.classe_id = ?
     ORDER BY m.nom'
);
$stmtMatieres->execute([$classeId]);
$matieres = $stmtMatieres->fetchAll();

/* Mêmes accumulateurs pondérés que php/bulletins.php, pour que la moyenne
   générale de chaque élève ici soit identique à celle de son bulletin. */
$totalParEleve = array_fill_keys(array_column($elevesRoster, 'inscription_id'), 0.0);
$coefParEleve  = array_fill_keys(array_column($elevesRoster, 'inscription_id'), 0);

$parMatiere = [];
foreach ($matieres as $mat) {
    $matiereId = (int)$mat['id'];
    $coef      = (int)$mat['coefficient'];

    $moyennesDetail = moyennesTrimestreParClasseMatiere($pdo, $classeId, $matiereId, $trimestre);

    $sommeMatiere        = 0.0;
    $effectifNoteMatiere = 0;
    foreach ($moyennesDetail as $insId => $detail) {
        $moy = $detail['trimestre'];
        if ($moy !== null) {
            $totalParEleve[$insId] += $moy * $coef;
            $coefParEleve[$insId]  += $coef;
            $sommeMatiere        += $moy;
            $effectifNoteMatiere++;
        }
    }

    $parMatiere[] = [
        'matiere'        => $mat['nom'],
        'moyenne_classe' => $effectifNoteMatiere > 0 ? round($sommeMatiere / $effectifNoteMatiere, 2) : null,
        'effectif_note'  => $effectifNoteMatiere,
    ];
}

/* Moyenne générale pondérée de chaque élève (mêmes coefficients que le
   bulletin) : sert à la répartition par appréciation et au taux de réussite. */
$moyennesGenerales = [];
foreach ($elevesRoster as $eleve) {
    $id = (int)$eleve['inscription_id'];
    $moyennesGenerales[$id] = $coefParEleve[$id] > 0 ? round($totalParEleve[$id] / $coefParEleve[$id], 2) : null;
}

$notees = array_filter($moyennesGenerales, static fn($m) => $m !== null);

$libellesAppreciation = ['Très faible', 'Faible', 'Passable', 'Assez bien', 'Bien', 'Très bien', 'Excellent'];
$repartition = array_fill_keys($libellesAppreciation, 0);
foreach ($notees as $moy) {
    $repartition[appreciation($moy)]++;
}

repondre([
    'effectif'                  => count($elevesRoster),
    'effectif_note'             => count($notees),
    'par_matiere'               => $parMatiere,
    'repartition_appreciations' => array_map(
        static fn($libelle) => ['appreciation' => $libelle, 'effectif' => $repartition[$libelle]],
        $libellesAppreciation
    ),
    'taux_reussite'  => $notees ? round(count(array_filter($notees, static fn($m) => $m >= 10)) / count($notees) * 100, 1) : null,
    'moyenne_classe' => $notees ? round(array_sum($notees) / count($notees), 2) : null,
]);
