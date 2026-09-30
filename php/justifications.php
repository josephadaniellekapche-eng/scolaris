<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_LECTURE);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM justifications WHERE id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $justification = $stmt->fetch();
        if (!$justification) {
            erreur('Justificatif introuvable.', 404);
        }
        repondre($justification);
    }

    $sql = 'SELECT * FROM justifications';
    $valeurs = [];
    if (!empty($_GET['inscription_id'])) {
        $sql .= ' WHERE inscription_id = ?';
        $valeurs[] = (int)$_GET['inscription_id'];
    }
    $sql .= ' ORDER BY cree_le DESC, id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

/* Crée un justificatif et l'associe immédiatement à une ou plusieurs
   absences/retards de la même inscription (ex. un seul certificat médical
   couvrant toute une semaine d'absence). Validé directement à la saisie :
   la personne qui enregistre le justificatif est déjà habilitée à le faire
   (mêmes rôles que la saisie des absences). */
if ($methode === 'POST') {
    $utilisateur = exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_SAISIE);
    $d = entreeJSON();

    $inscriptionId = (int)($d['inscription_id'] ?? 0);
    $motif         = trim((string)($d['motif'] ?? ''));
    $absenceIds    = is_array($d['absence_ids'] ?? null) ? array_map('intval', $d['absence_ids']) : [];

    if (!$inscriptionId) {
        erreur('inscription_id est obligatoire.');
    }
    if (!$motif) {
        erreur('Le motif est obligatoire.');
    }
    if (!$absenceIds) {
        erreur('Sélectionnez au moins une absence ou un retard à justifier.');
    }

    $inscription = $pdo->prepare('SELECT classe_id FROM inscriptions WHERE id = ?');
    $inscription->execute([$inscriptionId]);
    $classeId = $inscription->fetchColumn();
    if ($classeId === false) {
        erreur('Inscription introuvable.', 404);
    }
    verifierProfesseurPrincipal($pdo, (int)$classeId);

    /* N'accepte que des absences non déjà justifiées appartenant bien à
       cette inscription (jamais de justification croisée entre élèves). */
    $in = implode(',', array_fill(0, count($absenceIds), '?'));
    $verif = $pdo->prepare(
        "SELECT id FROM absences WHERE inscription_id = ? AND justification_id IS NULL AND id IN ($in)"
    );
    $verif->execute([$inscriptionId, ...$absenceIds]);
    $idsValides = array_column($verif->fetchAll(), 'id');
    if (!$idsValides) {
        erreur('Aucune des absences sélectionnées ne peut être justifiée (déjà justifiées ou introuvables).');
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO justifications (inscription_id, motif, type_piece, statut, traite_par_id, traite_le)
             VALUES (?, ?, ?, 'validee', ?, NOW())"
        )->execute([$inscriptionId, $motif, $d['type_piece'] ?? null, $utilisateur['id']]);
        $justificationId = (int)$pdo->lastInsertId();

        $inValides = implode(',', array_fill(0, count($idsValides), '?'));
        $pdo->prepare("UPDATE absences SET justification_id = ? WHERE id IN ($inValides)")
            ->execute([$justificationId, ...$idsValides]);

        $pdo->commit();
        repondre(['id' => $justificationId, 'absences_justifiees' => count($idsValides)], 201);
    } catch (Throwable $e) {
        $pdo->rollBack();
        erreur('Échec de l\'enregistrement du justificatif : ' . $e->getMessage(), 500);
    }
}

/* Rejette un justificatif déjà saisi (erreur de saisie, pièce invalide...) :
   les absences qui y étaient liées redeviennent non justifiées. */
if ($methode === 'PUT') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_SAISIE);
    $id = idRequis();

    $justification = $pdo->prepare("SELECT id FROM justifications WHERE id = ? AND statut = 'validee'");
    $justification->execute([$id]);
    if (!$justification->fetch()) {
        erreur('Justificatif introuvable ou déjà rejeté.', 404);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE justifications SET statut = 'rejetee' WHERE id = ?")->execute([$id]);
        $pdo->prepare('UPDATE absences SET justification_id = NULL WHERE justification_id = ?')->execute([$id]);
        $pdo->commit();
        repondre(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        erreur('Échec du rejet : ' . $e->getMessage(), 500);
    }
}

erreur('Méthode non autorisée.', 405);
