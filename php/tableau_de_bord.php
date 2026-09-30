<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : agrège des données déjà stockées par les autres modules
 * (inscriptions, classes, eleves, absences, paiements, notes) pour nourrir
 * le tableau de bord. N'écrit jamais rien, ne duplique aucune donnée —
 * uniquement des requêtes d'agrégation, sur le modèle d'php/rapports_financiers.php.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

$utilisateur = utilisateurConnecte();
if (!$utilisateur) {
    erreur('Connexion requise.', 401);
}

$anneeActive = $pdo->query("SELECT id, libelle FROM annees_scolaires WHERE statut = 'active' LIMIT 1")->fetch();
if (!$anneeActive) {
    repondre([
        'annee_active'      => null,
        'inscriptions'      => ['dossiers_recus' => 0, 'validees' => 0, 'en_attente' => 0, 'rejetees' => 0, 'annulees' => 0, 'places_restantes' => 0],
        'effectifs'         => ['total' => 0, 'par_niveau' => []],
        'presence_jour'     => ['taux' => null, 'absents' => 0],
        'finance'           => ['taux_recouvrement' => null],
        'moyenne_generale'  => null,
        'activite_recente'  => [],
    ]);
}
$anneeId = (int)$anneeActive['id'];

/* ---------- Inscriptions ---------- */
$parStatut = $pdo->prepare('SELECT statut, COUNT(*) AS total FROM inscriptions WHERE annee_scolaire_id = ? GROUP BY statut');
$parStatut->execute([$anneeId]);
$comptes = array_column($parStatut->fetchAll(), 'total', 'statut');

$capacite = $pdo->prepare('SELECT COALESCE(SUM(capacite), 0) FROM classes WHERE annee_scolaire_id = ?');
$capacite->execute([$anneeId]);
$capaciteTotal = (int)$capacite->fetchColumn();

$validees = (int)($comptes['validee'] ?? 0);

$inscriptions = [
    'dossiers_recus'   => array_sum($comptes),
    'validees'         => $validees,
    'en_attente'       => (int)($comptes['en_attente'] ?? 0),
    'rejetees'         => (int)($comptes['rejetee'] ?? 0),
    'annulees'         => (int)($comptes['annulee'] ?? 0),
    'places_restantes' => max(0, $capaciteTotal - $validees),
];

/* ---------- Effectifs par niveau (élèves inscrits et validés) ---------- */
$parNiveau = $pdo->prepare(
    "SELECT n.nom AS niveau, n.ordre, el.sexe, COUNT(*) AS total
     FROM inscriptions i
     JOIN eleves el  ON el.id = i.eleve_id
     JOIN classes c  ON c.id = i.classe_id
     JOIN niveaux n  ON n.id = c.niveau_id
     WHERE i.annee_scolaire_id = ? AND i.statut = 'validee'
     GROUP BY n.id, n.nom, n.ordre, el.sexe
     ORDER BY n.ordre"
);
$parNiveau->execute([$anneeId]);

$niveaux = [];
foreach ($parNiveau->fetchAll() as $ligne) {
    $nom = $ligne['niveau'];
    if (!isset($niveaux[$nom])) {
        $niveaux[$nom] = ['niveau' => $nom, 'garcons' => 0, 'filles' => 0];
    }
    if ($ligne['sexe'] === 'M') $niveaux[$nom]['garcons'] = (int)$ligne['total'];
    else                        $niveaux[$nom]['filles']  = (int)$ligne['total'];
}
$effectifs = ['total' => $validees, 'par_niveau' => array_values($niveaux)];

/* ---------- Présence du jour ---------- */
$absentsAujourdhui = $pdo->prepare(
    "SELECT COUNT(DISTINCT a.inscription_id) FROM absences a
     JOIN inscriptions i ON i.id = a.inscription_id
     WHERE a.type = 'absence' AND a.date_evenement = CURDATE() AND i.annee_scolaire_id = ?"
);
$absentsAujourdhui->execute([$anneeId]);
$absents = (int)$absentsAujourdhui->fetchColumn();

$presence = [
    'absents' => $absents,
    'taux'    => $validees > 0 ? round(($validees - $absents) / $validees * 100, 1) : null,
];

/* ---------- Recouvrement financier ---------- */
$du = $pdo->prepare(
    "SELECT COALESCE(SUM(f.montant_du), 0) FROM inscription_frais f
     JOIN inscriptions i ON i.id = f.inscription_id
     WHERE i.annee_scolaire_id = ? AND f.statut = 'actif'"
);
$du->execute([$anneeId]);
$montantDu = (int)$du->fetchColumn();

$paye = $pdo->prepare(
    "SELECT COALESCE(SUM(p.montant), 0) FROM paiements p
     JOIN inscriptions i ON i.id = p.inscription_id
     WHERE i.annee_scolaire_id = ? AND p.statut = 'valide'"
);
$paye->execute([$anneeId]);
$montantPaye = (int)$paye->fetchColumn();

$finance = ['taux_recouvrement' => $montantDu > 0 ? round($montantPaye / $montantDu * 100, 1) : null];

/* ---------- Moyenne générale (moyenne brute de toutes les notes saisies) ---------- */
$moyenne = $pdo->prepare(
    "SELECT AVG(n.note) FROM notes n
     JOIN evaluations ev ON ev.id = n.evaluation_id
     JOIN classes c ON c.id = ev.classe_id
     WHERE c.annee_scolaire_id = ?"
);
$moyenne->execute([$anneeId]);
$moyenneGenerale = $moyenne->fetchColumn();

/* ---------- Activité récente (paiements + absences élèves/enseignants) ---------- */
$activite = [];

$paiementsRecents = $pdo->query(
    "SELECT p.montant, p.cree_le, el.nom, el.prenom, c.nom AS classe_nom
     FROM paiements p
     JOIN inscriptions i ON i.id = p.inscription_id
     JOIN eleves el ON el.id = i.eleve_id
     JOIN classes c ON c.id = i.classe_id
     WHERE p.statut = 'valide'
     ORDER BY p.cree_le DESC LIMIT 5"
)->fetchAll();
foreach ($paiementsRecents as $p) {
    $activite[] = [
        'type'  => 'paiement',
        'texte' => "<b>{$p['prenom']} {$p['nom']}</b> ({$p['classe_nom']}) : paiement de " . number_format((float)$p['montant'], 0, ',', ' ') . ' FCFA',
        'quand' => $p['cree_le'],
    ];
}

$absencesRecentes = $pdo->query(
    "SELECT a.type, a.cree_le, el.nom, el.prenom, c.nom AS classe_nom
     FROM absences a
     JOIN inscriptions i ON i.id = a.inscription_id
     JOIN eleves el ON el.id = i.eleve_id
     JOIN classes c ON c.id = i.classe_id
     ORDER BY a.cree_le DESC LIMIT 5"
)->fetchAll();
foreach ($absencesRecentes as $a) {
    $mot = $a['type'] === 'absence' ? 'une absence' : 'un retard';
    $activite[] = [
        'type'  => $a['type'] === 'absence' ? 'absence_eleve' : 'retard_eleve',
        'texte' => "<b>{$a['prenom']} {$a['nom']}</b> ({$a['classe_nom']}) : $mot enregistré(e)",
        'quand' => $a['cree_le'],
    ];
}

$absencesEnsRecentes = $pdo->query(
    "SELECT a.type, a.cree_le, ens.nom, ens.prenom
     FROM absences_enseignants a
     JOIN enseignants ens ON ens.id = a.enseignant_id
     ORDER BY a.cree_le DESC LIMIT 5"
)->fetchAll();
foreach ($absencesEnsRecentes as $a) {
    $mot = $a['type'] === 'absence' ? 'une absence' : 'un retard';
    $activite[] = [
        'type'  => $a['type'] === 'absence' ? 'absence_enseignant' : 'retard_enseignant',
        'texte' => "<b>{$a['prenom']} {$a['nom']}</b> (enseignant) : $mot enregistré(e)",
        'quand' => $a['cree_le'],
    ];
}

usort($activite, static fn($a, $b) => strcmp($b['quand'], $a['quand']));
$activite = array_slice($activite, 0, 6);

repondre([
    'annee_active'     => ['id' => $anneeId, 'libelle' => $anneeActive['libelle']],
    'inscriptions'     => $inscriptions,
    'effectifs'        => $effectifs,
    'presence_jour'    => $presence,
    'finance'          => $finance,
    'moyenne_generale' => $moyenneGenerale !== null ? round((float)$moyenneGenerale, 2) : null,
    'activite_recente' => $activite,
]);
