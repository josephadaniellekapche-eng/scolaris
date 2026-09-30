<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Toujours joint via inscriptions -> eleves/classes : le module Vie scolaire
   ne stocke jamais lui-même le nom, la classe, etc. d'un élève. */
const SELECT_ABSENCE = "
    SELECT a.id, a.inscription_id, a.type, a.date_evenement, a.heure_debut, a.heure_fin,
           a.matiere_id, a.motif, a.justification_id, a.cree_le,
           m.nom AS matiere_nom,
           el.id AS eleve_id, el.matricule, el.nom AS eleve_nom, el.prenom AS eleve_prenom,
           c.id AS classe_id, c.nom AS classe_nom,
           j.statut AS justification_statut, j.motif AS justification_motif,
           CONCAT(u.prenom, ' ', u.nom) AS signale_par
    FROM absences a
    JOIN inscriptions i        ON i.id = a.inscription_id
    JOIN eleves el              ON el.id = i.eleve_id
    JOIN classes c               ON c.id = i.classe_id
    LEFT JOIN matieres m          ON m.id = a.matiere_id
    LEFT JOIN justifications j    ON j.id = a.justification_id
    LEFT JOIN utilisateurs u      ON u.id = a.signale_par_id";

if ($methode === 'GET') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_LECTURE);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare(SELECT_ABSENCE . ' WHERE a.id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $absence = $stmt->fetch();
        if (!$absence) {
            erreur('Absence introuvable.', 404);
        }
        repondre($absence);
    }

    $conditions = [];
    $valeurs    = [];

    if (!empty($_GET['inscription_id'])) {
        $conditions[] = 'a.inscription_id = ?';
        $valeurs[]    = (int)$_GET['inscription_id'];
    }
    if (!empty($_GET['classe_id'])) {
        $conditions[] = 'c.id = ?';
        $valeurs[]    = (int)$_GET['classe_id'];
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
    /* justifie=1 -> justification validée ; justifie=0 -> non justifiée ;
       sans ce paramètre, tout est renvoyé (utilisé par les statistiques). */
    if (isset($_GET['justifie']) && $_GET['justifie'] !== '') {
        $conditions[] = $_GET['justifie'] === '1'
            ? "a.justification_id IS NOT NULL AND j.statut = 'validee'"
            : "(a.justification_id IS NULL OR j.statut != 'validee')";
    }

    $sql = SELECT_ABSENCE;
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY a.date_evenement DESC, a.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    $utilisateur = exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_SAISIE);
    $d = entreeJSON();

    $inscriptionId = (int)($d['inscription_id'] ?? 0);
    $type          = trim((string)($d['type'] ?? ''));
    $dateEvenement = trim((string)($d['date_evenement'] ?? ''));

    if (!$inscriptionId) {
        erreur('inscription_id est obligatoire.');
    }
    if (!in_array($type, ['absence', 'retard'], true)) {
        erreur('Le type doit être « absence » ou « retard ».');
    }
    if (!$dateEvenement) {
        erreur('La date est obligatoire.');
    }

    $inscription = $pdo->prepare('SELECT classe_id FROM inscriptions WHERE id = ?');
    $inscription->execute([$inscriptionId]);
    $classeId = $inscription->fetchColumn();
    if ($classeId === false) {
        erreur('Inscription introuvable.', 404);
    }

    verifierProfesseurPrincipal($pdo, (int)$classeId);

    $matiereId = !empty($d['matiere_id']) ? (int)$d['matiere_id'] : null;
    $heureDebut = !empty($d['heure_debut']) ? $d['heure_debut'] : null;
    $heureFin   = !empty($d['heure_fin']) ? $d['heure_fin'] : null;
    $motif      = !empty($d['motif']) ? trim((string)$d['motif']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO absences (inscription_id, type, date_evenement, heure_debut, heure_fin, matiere_id, motif, signale_par_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$inscriptionId, $type, $dateEvenement, $heureDebut, $heureFin, $matiereId, $motif, $utilisateur['id']]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'PUT') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_SAISIE);
    $id = idRequis();
    $d  = entreeJSON();

    $absence = $pdo->prepare('SELECT i.classe_id FROM absences a JOIN inscriptions i ON i.id = a.inscription_id WHERE a.id = ?');
    $absence->execute([$id]);
    $classeId = $absence->fetchColumn();
    if ($classeId === false) {
        erreur('Absence introuvable.', 404);
    }

    verifierProfesseurPrincipal($pdo, (int)$classeId);

    $matiereId = array_key_exists('matiere_id', $d) && $d['matiere_id'] !== '' ? (int)$d['matiere_id'] : null;
    $heureDebut = !empty($d['heure_debut']) ? $d['heure_debut'] : null;
    $heureFin   = !empty($d['heure_fin']) ? $d['heure_fin'] : null;
    $motif      = !empty($d['motif']) ? trim((string)$d['motif']) : null;

    $pdo->prepare(
        'UPDATE absences SET date_evenement = ?, heure_debut = ?, heure_fin = ?, matiere_id = ?, motif = ? WHERE id = ?'
    )->execute([
        $d['date_evenement'] ?? date('Y-m-d'), $heureDebut, $heureFin, $matiereId, $motif, $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    exigerRoleVieScolaire(ROLES_VIE_SCOLAIRE_SAISIE);
    $id = idRequis();

    $absence = $pdo->prepare('SELECT i.classe_id FROM absences a JOIN inscriptions i ON i.id = a.inscription_id WHERE a.id = ?');
    $absence->execute([$id]);
    $classeId = $absence->fetchColumn();
    if ($classeId === false) {
        erreur('Absence introuvable.', 404);
    }

    verifierProfesseurPrincipal($pdo, (int)$classeId);

    $pdo->prepare('DELETE FROM absences WHERE id = ?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
