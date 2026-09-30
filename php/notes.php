<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* roster(), evaluationsSequence(), notesParEvaluations(), moyennePonderee(),
   verifierAffectation() sont partagées depuis _aide.php (réutilisées telles
   quelles par php/resultats.php et php/bulletins.php, sans duplication). */

if ($methode === 'GET') {
    $classeId  = (int)($_GET['classe_id'] ?? 0);
    $matiereId = (int)($_GET['matiere_id'] ?? 0);
    if (!$classeId || !$matiereId) {
        erreur('classe_id et matiere_id sont obligatoires.');
    }

    if (isset($_GET['sequence'])) {
        $sequence = (int)$_GET['sequence'];
        if ($sequence < 1 || $sequence > 6) {
            erreur('La séquence doit être comprise entre 1 et 6.');
        }

        $eleves      = roster($pdo, $classeId);
        $evaluations = evaluationsSequence($pdo, $classeId, $matiereId, $sequence);
        $notes       = notesParEvaluations($pdo, $evaluations);

        foreach ($eleves as &$eleve) {
            $notesEleve       = $notes[$eleve['inscription_id']] ?? [];
            $eleve['notes']   = $notesEleve;
            $eleve['moyenne'] = moyennePonderee($evaluations, $notesEleve);
        }
        unset($eleve);

        repondre(['evaluations' => $evaluations, 'eleves' => $eleves]);
    }

    if (isset($_GET['trimestre'])) {
        $trimestre = (int)$_GET['trimestre'];
        if (!in_array($trimestre, [1, 2, 3], true)) {
            erreur('Le trimestre doit être 1, 2 ou 3.');
        }
        $seq1 = $trimestre * 2 - 1;
        $seq2 = $trimestre * 2;

        $eleves = roster($pdo, $classeId);

        $evals1 = evaluationsSequence($pdo, $classeId, $matiereId, $seq1);
        $evals2 = evaluationsSequence($pdo, $classeId, $matiereId, $seq2);
        $notes1 = notesParEvaluations($pdo, $evals1);
        $notes2 = notesParEvaluations($pdo, $evals2);

        foreach ($eleves as &$eleve) {
            $moy1 = moyennePonderee($evals1, $notes1[$eleve['inscription_id']] ?? []);
            $moy2 = moyennePonderee($evals2, $notes2[$eleve['inscription_id']] ?? []);
            $eleve['sequence1'] = $moy1;
            $eleve['sequence2'] = $moy2;
            $eleve['trimestre'] = ($moy1 !== null && $moy2 !== null)
                ? round(($moy1 + $moy2) / 2, 2)
                : null;
        }
        unset($eleve);

        repondre($eleves);
    }

    erreur('sequence ou trimestre est obligatoire.');
}

if ($methode === 'PUT') {
    $d = entreeJSON();
    $cellules = $d['cellules'] ?? [];
    if (!is_array($cellules) || !$cellules) {
        erreur('Le champ « cellules » doit être une liste non vide.');
    }

    /* Toutes les cellules d'un même enregistrement portent sur une seule
       évaluation à la fois côté écran (Notes.js n'envoie que la grille
       affichée) : on retrouve sa classe/matière une seule fois pour
       vérifier l'affectation de l'enseignant, puis on vérifie que chaque
       élève visé appartient bien à cette classe avant d'écrire quoi que
       ce soit. */
    $idsEvaluation = array_values(array_unique(array_map(
        static fn($c) => (int)($c['evaluation_id'] ?? 0),
        $cellules
    )));
    $idsEvaluation = array_filter($idsEvaluation);
    if (!$idsEvaluation) {
        erreur('evaluation_id est obligatoire pour chaque cellule.');
    }

    $in   = implode(',', array_fill(0, count($idsEvaluation), '?'));
    $stmt = $pdo->prepare("SELECT id, classe_id, matiere_id FROM evaluations WHERE id IN ($in)");
    $stmt->execute($idsEvaluation);
    $evaluationsParId = [];
    foreach ($stmt->fetchAll() as $ev) {
        $evaluationsParId[$ev['id']] = $ev;
    }
    if (count($evaluationsParId) !== count($idsEvaluation)) {
        erreur('Une évaluation visée est introuvable.');
    }

    $classesMatieres = array_unique(array_map(
        static fn($ev) => $ev['classe_id'] . ':' . $ev['matiere_id'],
        $evaluationsParId
    ));
    foreach ($classesMatieres as $paire) {
        [$classeId, $matiereId] = array_map('intval', explode(':', $paire));
        verifierAffectation($pdo, $classeId, $matiereId);
    }

    /* Élèves valides pour chacune des classes concernées (une note ne peut
       porter que sur un élève inscrit et validé dans la classe de son
       évaluation). */
    $inscriptionsValides = [];
    foreach (array_unique(array_column($evaluationsParId, 'classe_id')) as $classeId) {
        foreach (roster($pdo, (int)$classeId) as $eleve) {
            $inscriptionsValides[(int)$eleve['inscription_id']] = (int)$classeId;
        }
    }

    $inserer = $pdo->prepare(
        'INSERT INTO notes (evaluation_id, inscription_id, note) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note)'
    );
    $effacer = $pdo->prepare('DELETE FROM notes WHERE evaluation_id = ? AND inscription_id = ?');

    $pdo->beginTransaction();
    foreach ($cellules as $c) {
        $evaluationId  = (int)($c['evaluation_id'] ?? 0);
        $inscriptionId = (int)($c['inscription_id'] ?? 0);
        if (!$evaluationId || !$inscriptionId) {
            continue;
        }

        $evaluation = $evaluationsParId[$evaluationId] ?? null;
        if (!$evaluation || ($inscriptionsValides[$inscriptionId] ?? null) !== (int)$evaluation['classe_id']) {
            $pdo->rollBack();
            erreur('Un élève visé n\'est pas inscrit dans la classe de cette évaluation.');
        }

        $note = $c['note'] ?? null;

        if ($note === null || $note === '') {
            $effacer->execute([$evaluationId, $inscriptionId]);
            continue;
        }

        $note = (float)$note;
        if ($note < 0 || $note > 20) {
            $pdo->rollBack();
            erreur('Une note doit être comprise entre 0 et 20.');
        }
        $inserer->execute([$evaluationId, $inscriptionId, $note]);
    }
    $pdo->commit();

    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
