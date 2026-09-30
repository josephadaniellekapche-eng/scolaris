<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);

    $sql = 'SELECT * FROM justifications_enseignants';
    $valeurs = [];
    if (!empty($_GET['enseignant_id'])) {
        $sql .= ' WHERE enseignant_id = ?';
        $valeurs[] = (int)$_GET['enseignant_id'];
    }
    $sql .= ' ORDER BY cree_le DESC, id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

/* Même principe que php/justifications.php (module élèves) : un justificatif
   peut couvrir plusieurs absences/retards à la fois, validé directement à
   la saisie. */
if ($methode === 'POST') {
    $utilisateur = exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);
    $d = entreeJSON();

    $enseignantId = (int)($d['enseignant_id'] ?? 0);
    $motif        = trim((string)($d['motif'] ?? ''));
    $absenceIds   = is_array($d['absence_ids'] ?? null) ? array_map('intval', $d['absence_ids']) : [];

    if (!$enseignantId) {
        erreur('enseignant_id est obligatoire.');
    }
    if (!$motif) {
        erreur('Le motif est obligatoire.');
    }
    if (!$absenceIds) {
        erreur('Sélectionnez au moins une absence ou un retard à justifier.');
    }

    $enseignant = $pdo->prepare('SELECT id FROM enseignants WHERE id = ?');
    $enseignant->execute([$enseignantId]);
    if (!$enseignant->fetch()) {
        erreur('Enseignant introuvable.', 404);
    }

    $in = implode(',', array_fill(0, count($absenceIds), '?'));
    $verif = $pdo->prepare(
        "SELECT id FROM absences_enseignants WHERE enseignant_id = ? AND justification_id IS NULL AND id IN ($in)"
    );
    $verif->execute([$enseignantId, ...$absenceIds]);
    $idsValides = array_column($verif->fetchAll(), 'id');
    if (!$idsValides) {
        erreur('Aucune des absences sélectionnées ne peut être justifiée (déjà justifiées ou introuvables).');
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO justifications_enseignants (enseignant_id, motif, type_piece, statut, traite_par_id, traite_le)
             VALUES (?, ?, ?, 'validee', ?, NOW())"
        )->execute([$enseignantId, $motif, $d['type_piece'] ?? null, $utilisateur['id']]);
        $justificationId = (int)$pdo->lastInsertId();

        $inValides = implode(',', array_fill(0, count($idsValides), '?'));
        $pdo->prepare("UPDATE absences_enseignants SET justification_id = ? WHERE id IN ($inValides)")
            ->execute([$justificationId, ...$idsValides]);

        $pdo->commit();
        repondre(['id' => $justificationId, 'absences_justifiees' => count($idsValides)], 201);
    } catch (Throwable $e) {
        $pdo->rollBack();
        erreur('Échec de l\'enregistrement du justificatif : ' . $e->getMessage(), 500);
    }
}

if ($methode === 'PUT') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);
    $id = idRequis();

    $justification = $pdo->prepare("SELECT id FROM justifications_enseignants WHERE id = ? AND statut = 'validee'");
    $justification->execute([$id]);
    if (!$justification->fetch()) {
        erreur('Justificatif introuvable ou déjà rejeté.', 404);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE justifications_enseignants SET statut = 'rejetee' WHERE id = ?")->execute([$id]);
        $pdo->prepare('UPDATE absences_enseignants SET justification_id = NULL WHERE justification_id = ?')->execute([$id]);
        $pdo->commit();
        repondre(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        erreur('Échec du rejet : ' . $e->getMessage(), 500);
    }
}

erreur('Méthode non autorisée.', 405);
