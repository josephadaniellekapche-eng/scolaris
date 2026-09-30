<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Toujours joint via affectations -> classes/matieres/enseignants : une
   séance ne stocke jamais elle-même la classe, la matière ou l'enseignant,
   uniquement l'affectation qui les lie déjà (voir migration_emploi_du_temps.sql). */
const SELECT_SEANCE = "
    SELECT s.id, s.affectation_id, s.jour, s.heure_debut, s.heure_fin, s.salle,
           c.id AS classe_id, c.nom AS classe_nom, c.salle AS classe_salle,
           m.id AS matiere_id, m.nom AS matiere_nom,
           ens.id AS enseignant_id, ens.nom AS enseignant_nom, ens.prenom AS enseignant_prenom
    FROM seances s
    JOIN affectations a ON a.id = s.affectation_id
    JOIN classes c      ON c.id = a.classe_id
    JOIN matieres m     ON m.id = a.matiere_id
    JOIN enseignants ens ON ens.id = a.enseignant_id";

const ORDRE_JOURS = "FIELD(s.jour,'lundi','mardi','mercredi','jeudi','vendredi')";

/**
 * Vérifie qu'une séance (jour + heure_debut + heure_fin) ne chevauche ni
 * les pauses de l'établissement, ni une autre séance de la même classe,
 * ni une autre séance du même enseignant (il ne peut pas être dans deux
 * salles à la fois). Termine la requête en erreur si un conflit est trouvé.
 * $ignorerId exclut la séance elle-même lors d'une modification.
 */
function verifierCreneauLibre(PDO $pdo, int $classeId, int $enseignantId, string $jour, string $heureDebut, string $heureFin, ?int $ignorerId): void
{
    /* Normalise en H:i:s pour que les comparaisons de chaînes ci-dessous
       soient fiables (sinon "07:30" < "07:30:00" à cause du préfixe). */
    if (strlen($heureDebut) === 5) $heureDebut .= ':00';
    if (strlen($heureFin) === 5) $heureFin .= ':00';

    if ($heureDebut < HEURE_DEBUT_JOURNEE || $heureFin > HEURE_FIN_JOURNEE) {
        erreur('Les cours ont lieu de ' . substr(HEURE_DEBUT_JOURNEE, 0, 5) . ' à ' . substr(HEURE_FIN_JOURNEE, 0, 5) . '.');
    }

    foreach (PAUSES_EMPLOI_DU_TEMPS as [$debutPause, $finPause]) {
        if ($heureDebut < $finPause && $debutPause < $heureFin) {
            erreur("Ce créneau chevauche une pause ($debutPause - $finPause).");
        }
    }

    $conditionIgnorer = $ignorerId ? 'AND s.id != ?' : '';

    $conflitClasse = $pdo->prepare(
        "SELECT s.id FROM seances s JOIN affectations a ON a.id = s.affectation_id
         WHERE a.classe_id = ? AND s.jour = ? AND s.heure_debut < ? AND ? < s.heure_fin $conditionIgnorer"
    );
    $valeurs = [$classeId, $jour, $heureFin, $heureDebut];
    if ($ignorerId) $valeurs[] = $ignorerId;
    $conflitClasse->execute($valeurs);
    if ($conflitClasse->fetch()) {
        erreur('Cette classe a déjà un cours sur ce créneau.', 409);
    }

    $conflitEnseignant = $pdo->prepare(
        "SELECT s.id FROM seances s JOIN affectations a ON a.id = s.affectation_id
         WHERE a.enseignant_id = ? AND s.jour = ? AND s.heure_debut < ? AND ? < s.heure_fin $conditionIgnorer"
    );
    $valeurs = [$enseignantId, $jour, $heureFin, $heureDebut];
    if ($ignorerId) $valeurs[] = $ignorerId;
    $conflitEnseignant->execute($valeurs);
    if ($conflitEnseignant->fetch()) {
        erreur('Cet enseignant est déjà occupé sur ce créneau (autre classe).', 409);
    }
}

if ($methode === 'GET') {
    exigerRoleVieScolaire(ROLES_EMPLOI_DU_TEMPS_LECTURE);

    $conditions = [];
    $valeurs    = [];

    if (!empty($_GET['classe_id'])) {
        $conditions[] = 'c.id = ?';
        $valeurs[]    = (int)$_GET['classe_id'];
    }
    if (!empty($_GET['enseignant_id'])) {
        $conditions[] = 'ens.id = ?';
        $valeurs[]    = (int)$_GET['enseignant_id'];
    }

    $sql = SELECT_SEANCE;
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY ' . ORDRE_JOURS . ', s.heure_debut';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($valeurs);
    repondre($stmt->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleVieScolaire(ROLES_EMPLOI_DU_TEMPS_SAISIE);
    $d = entreeJSON();

    $affectationId = (int)($d['affectation_id'] ?? 0);
    $jour          = trim((string)($d['jour'] ?? ''));
    $heureDebut    = trim((string)($d['heure_debut'] ?? ''));
    $heureFin      = trim((string)($d['heure_fin'] ?? ''));
    $joursValides  = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

    if (!$affectationId) {
        erreur('affectation_id est obligatoire.');
    }
    if (!in_array($jour, $joursValides, true)) {
        erreur('Jour invalide.');
    }
    if (!$heureDebut || !$heureFin || $heureFin <= $heureDebut) {
        erreur('L\'heure de fin doit être après l\'heure de début.');
    }

    $affectation = $pdo->prepare('SELECT classe_id, enseignant_id FROM affectations WHERE id = ?');
    $affectation->execute([$affectationId]);
    $aff = $affectation->fetch();
    if (!$aff) {
        erreur('Affectation introuvable.', 404);
    }

    verifierCreneauLibre($pdo, (int)$aff['classe_id'], (int)$aff['enseignant_id'], $jour, $heureDebut, $heureFin, null);

    $salle = !empty($d['salle']) ? trim((string)$d['salle']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO seances (affectation_id, jour, heure_debut, heure_fin, salle) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$affectationId, $jour, $heureDebut, $heureFin, $salle]);

    repondre(['id' => (int)$pdo->lastInsertId()], 201);
}

if ($methode === 'PUT') {
    exigerRoleVieScolaire(ROLES_EMPLOI_DU_TEMPS_SAISIE);
    $id = idRequis();
    $d  = entreeJSON();

    $seance = $pdo->prepare(
        'SELECT s.affectation_id, a.classe_id, a.enseignant_id FROM seances s JOIN affectations a ON a.id = s.affectation_id WHERE s.id = ?'
    );
    $seance->execute([$id]);
    $s = $seance->fetch();
    if (!$s) {
        erreur('Séance introuvable.', 404);
    }

    $jour       = trim((string)($d['jour'] ?? ''));
    $heureDebut = trim((string)($d['heure_debut'] ?? ''));
    $heureFin   = trim((string)($d['heure_fin'] ?? ''));
    $joursValides = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

    if (!in_array($jour, $joursValides, true)) {
        erreur('Jour invalide.');
    }
    if (!$heureDebut || !$heureFin || $heureFin <= $heureDebut) {
        erreur('L\'heure de fin doit être après l\'heure de début.');
    }

    verifierCreneauLibre($pdo, (int)$s['classe_id'], (int)$s['enseignant_id'], $jour, $heureDebut, $heureFin, $id);

    $salle = !empty($d['salle']) ? trim((string)$d['salle']) : null;

    $pdo->prepare('UPDATE seances SET jour=?, heure_debut=?, heure_fin=?, salle=? WHERE id=?')
        ->execute([$jour, $heureDebut, $heureFin, $salle, $id]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    exigerRoleVieScolaire(ROLES_EMPLOI_DU_TEMPS_SAISIE);
    $id = idRequis();
    $pdo->prepare('DELETE FROM seances WHERE id=?')->execute([$id]);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
