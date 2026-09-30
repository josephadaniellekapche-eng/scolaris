<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : agrège les notes déjà saisies via php/notes.php (tables
 * evaluations + notes, via les fonctions partagées de _aide.php) pour
 * produire le classement d'une classe sur une matière et un trimestre.
 * N'écrit jamais dans la base — aucune deuxième saisie possible ici.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$classeId  = (int)($_GET['classe_id'] ?? 0);
$matiereId = (int)($_GET['matiere_id'] ?? 0);
$trimestre = (int)($_GET['trimestre'] ?? 0);

if (!$classeId || !$matiereId) {
    erreur('classe_id et matiere_id sont obligatoires.');
}
if (!in_array($trimestre, [1, 2, 3], true)) {
    erreur('Le trimestre doit être 1, 2 ou 3.');
}

$eleves         = roster($pdo, $classeId);
$moyennesDetail = moyennesTrimestreParClasseMatiere($pdo, $classeId, $matiereId, $trimestre);
$moyennes       = array_map(static fn($m) => $m['trimestre'], $moyennesDetail);
$rangs          = classement($moyennes);
$effectif       = count($eleves);

$lignes = [];
foreach ($eleves as $eleve) {
    $id      = (int)$eleve['inscription_id'];
    $detail  = $moyennesDetail[$id] ?? ['sequence1' => null, 'sequence2' => null, 'trimestre' => null];
    $moyenne = $detail['trimestre'];
    $lignes[] = [
        'inscription_id' => $id,
        'matricule'      => $eleve['matricule'],
        'nom'            => $eleve['nom'],
        'prenom'         => $eleve['prenom'],
        'sequence1'      => $detail['sequence1'],
        'sequence2'      => $detail['sequence2'],
        'moyenne'        => $moyenne,
        'rang'           => $rangs[$id] ?? null,
        'appreciation'   => appreciation($moyenne),
    ];
}

usort($lignes, static function ($a, $b) {
    if ($a['rang'] === null && $b['rang'] === null) return 0;
    if ($a['rang'] === null) return 1;
    if ($b['rang'] === null) return -1;
    return $a['rang'] <=> $b['rang'];
});

$notees = array_filter(array_column($lignes, 'moyenne'), static fn($m) => $m !== null);

repondre([
    'effectif'        => $effectif,
    'notes_saisies'   => count($notees),
    'moyenne_classe'  => $notees ? round(array_sum($notees) / count($notees), 2) : null,
    'meilleure'       => $notees ? max($notees) : null,
    'eleves'          => $lignes,
]);
