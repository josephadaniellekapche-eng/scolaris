<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Distinct du module élèves (php/absences.php) : un enseignant n'a pas
   d'inscription, on référence directement enseignant_id. */
const SELECT_ABSENCE_ENSEIGNANT = "
    SELECT a.id, a.enseignant_id, a.type, a.date_evenement, a.heure_debut, a.heure_fin,
           a.classe_id, a.matiere_id, a.motif, a.justification_id, a.cree_le,
           c.nom AS classe_nom, m.nom AS matiere_nom,
           ens.matricule, ens.nom AS enseignant_nom, ens.prenom AS enseignant_prenom,
           j.statut AS justification_statut,
           CONCAT(u.prenom, ' ', u.nom) AS signale_par
    FROM absences_enseignants a
    JOIN enseignants ens           ON ens.id = a.enseignant_id
    LEFT JOIN classes c            ON c.id = a.classe_id
    LEFT JOIN matieres m           ON m.id = a.matiere_id
    LEFT JOIN justifications_enseignants j ON j.id = a.justification_id
    LEFT JOIN utilisateurs u       ON u.id = a.signale_par_id";

if ($methode === 'GET') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare(SELECT_ABSENCE_ENSEIGNANT . ' WHERE a.id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $absence = $stmt->fetch();
        if (!$absence) {
            erreur('Absence introuvable.', 404);
        }
        repondre($absence);
    }

    $conditions = [];
    $valeurs    = [];

    if (!empty($_GET['enseignant_id'])) {
        $conditions[] = 'a.enseignant_id = ?';
        $valeurs[]    = (int)$_GET['enseignant_id'];
    }
    if (!empty($_GET['type']) && in_array($_GET['type'], ['absence', 'retard'], true)) {
        $conditions[] = 'a.type = ?';
        $valeurs[]    = $_GET['type'];
    }
    if (!empty($_GET['du'])) {
        $conditions[] = 'a.date_evenement >= ?';
        $valeurs[]    = $_GET['du'];
    }
    if (!empty($_GET['au'])) {
        $conditions[] = 'a.date_evenement <= ?';
        $valeurs[]    = $_GET['au'];
    }
    if (isset($_GET['justifie']) && $_GET['justifie'] !== '') {
        $conditions[] = $_GET['justifie'] === '1'
            ? "a.justification_id IS NOT NULL AND j.statut = 'validee'"
            : "(a.justification_id IS NULL OR j.statut != 'validee')";
    }

    $sql = SELECT_ABSENCE_ENSEIGNANT;
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY a.date_evenement DESC, a.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $utilisateur = exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);
    $d = entreeJSON();

    $enseignantId  = (int)($d['enseignant_id'] ?? 0);
    $type          = trim((string)($d['type'] ?? ''));
    $dateEvenement = trim((string)($d['date_evenement'] ?? ''));

    if (!$enseignantId) {
        erreur('enseignant_id est obligatoire.');
    }
    if (!in_array($type, ['absence', 'retard'], true)) {
        erreur('Le type doit être « absence » ou « retard ».');
    }
    if (!$dateEvenement) {
        erreur('La date est obligatoire.');
    }

    $enseignant = $pdo->prepare('SELECT id FROM enseignants WHERE id = ?');
    $enseignant->execute([$enseignantId]);
    if (!$enseignant->fetch()) {
        erreur('Enseignant introuvable.', 404);
    }

    $classeId   = !empty($d['classe_id']) ? (int)$d['classe_id'] : null;
    $matiereId  = !empty($d['matiere_id']) ? (int)$d['matiere_id'] : null;
    $heureDebut = !empty($d['heure_debut']) ? $d['heure_debut'] : null;
    $heureFin   = !empty($d['heure_fin']) ? $d['heure_fin'] : null;
    $motif      = !empty($d['motif']) ? trim((string)$d['motif']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO absences_enseignants (enseignant_id, type, date_evenement, heure_debut, heure_fin, classe_id, matiere_id, motif, signale_par_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$enseignantId, $type, $dateEvenement, $heureDebut, $heureFin, $classeId, $matiereId, $motif, $utilisateur['id']]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'DELETE') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_ENSEIGNANTS);
    $id = idRequis();

    $absence = $pdo->prepare('SELECT id FROM absences_enseignants WHERE id = ?');
    $absence->execute([$id]);
    if (!$absence->fetch()) {
        erreur('Absence introuvable.', 404);
    }

    $pdo->prepare('DELETE FROM absences_enseignants WHERE id = ?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
