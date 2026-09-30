<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

/* Session PHP partagée par toutes les routes (démarrée une seule fois par
   connexion.php à la connexion, relue ici pour appliquer les restrictions
   par rôle : voir verifierAffectation()). */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

/** Lit et décode le corps JSON de la requête. */
function entreeJSON(): array
{
    $brut = file_get_contents('php://input');
    if (!$brut) {
        return [];
    }
    $donnees = json_decode($brut, true);
    return is_array($donnees) ? $donnees : [];
}

/** Envoie une réponse JSON et termine le script. */
function repondre($donnees, int $statut = 200): void
{
    http_response_code($statut);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Envoie une erreur JSON et termine le script. */
function erreur(string $message, int $statut = 400): void
{
    repondre(['erreur' => $message], $statut);
}

/** Récupère l'identifiant numérique passé en ?id=, ou stoppe avec une erreur. */
function idRequis(): int
{
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        erreur('Identifiant manquant.');
    }
    return $id;
}

/** Utilisateur actuellement connecté (session PHP posée par connexion.php), ou null. */
function utilisateurConnecte(): ?array
{
    return $_SESSION['utilisateur'] ?? null;
}

/**
 * Vérifie qu'un enseignant connecté est bien affecté à la classe+matière
 * visée avant de le laisser créer une évaluation ou saisir des notes.
 * Les autres rôles (administrateur, direction, secrétaire, comptable) ne
 * sont pas restreints. Termine la requête en 403 si le contrôle échoue.
 */
function verifierAffectation(PDO $pdo, int $classeId, int $matiereId): void
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur || $utilisateur['role'] !== 'enseignant') {
        return;
    }
    if (empty($utilisateur['enseignant_id'])) {
        erreur('Ce compte enseignant n\'est rattaché à aucune fiche enseignant.', 403);
    }

    $stmt = $pdo->prepare('SELECT enseignant_id FROM affectations WHERE classe_id = ? AND matiere_id = ?');
    $stmt->execute([$classeId, $matiereId]);
    $enseignantId = $stmt->fetchColumn();

    if ($enseignantId === false || (int)$enseignantId !== (int)$utilisateur['enseignant_id']) {
        erreur('Vous n\'êtes pas affecté à cette matière pour cette classe.', 403);
    }
}

/** Élèves actifs d'une classe (roster de base, sans les notes). */
function roster(PDO $pdo, int $classeId): array
{
    $stmt = $pdo->prepare(
        'SELECT i.id AS inscription_id, e.id AS eleve_id, e.matricule, e.nom, e.prenom, e.sexe
         FROM inscriptions i
         JOIN eleves e ON e.id = i.eleve_id
         WHERE i.classe_id = ? AND i.statut = \'validee\'
         ORDER BY e.nom, e.prenom'
    );
    $stmt->execute([$classeId]);
    return $stmt->fetchAll();
}

/** Évaluations d'une séquence (classe + matière + séquence). */
function evaluationsSequence(PDO $pdo, int $classeId, int $matiereId, int $sequence): array
{
    $stmt = $pdo->prepare(
        'SELECT id, libelle, coefficient, ordre FROM evaluations
         WHERE classe_id = ? AND matiere_id = ? AND sequence = ?
         ORDER BY ordre, id'
    );
    $stmt->execute([$classeId, $matiereId, $sequence]);
    return $stmt->fetchAll();
}

/** Notes existantes pour un ensemble d'évaluations, groupées par inscription puis évaluation. */
function notesParEvaluations(PDO $pdo, array $evaluations): array
{
    if (!$evaluations) {
        return [];
    }
    $ids = array_column($evaluations, 'id');
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT evaluation_id, inscription_id, note FROM notes WHERE evaluation_id IN ($in)");
    $stmt->execute($ids);

    $parInscription = [];
    foreach ($stmt->fetchAll() as $n) {
        $parInscription[$n['inscription_id']][$n['evaluation_id']] = (float)$n['note'];
    }
    return $parInscription;
}

/** Moyenne pondérée d'un élève sur une liste d'évaluations, ou null si aucune note. */
function moyennePonderee(array $evaluations, array $notesEleve): ?float
{
    $somme = 0.0;
    $poids = 0;
    foreach ($evaluations as $ev) {
        if (isset($notesEleve[$ev['id']])) {
            $somme += $notesEleve[$ev['id']] * $ev['coefficient'];
            $poids += $ev['coefficient'];
        }
    }
    return $poids > 0 ? round($somme / $poids, 2) : null;
}

/**
 * Moyennes des deux séquences et moyenne trimestrielle (moyenne des deux
 * séquences) de chaque élève d'une classe, pour une matière donnée.
 * Retourne [inscription_id => ['sequence1' => ?float, 'sequence2' => ?float,
 * 'trimestre' => ?float]] pour tout le roster de la classe.
 */
function moyennesTrimestreParClasseMatiere(PDO $pdo, int $classeId, int $matiereId, int $trimestre): array
{
    $seq1 = $trimestre * 2 - 1;
    $seq2 = $trimestre * 2;

    $evals1 = evaluationsSequence($pdo, $classeId, $matiereId, $seq1);
    $evals2 = evaluationsSequence($pdo, $classeId, $matiereId, $seq2);
    $notes1 = notesParEvaluations($pdo, $evals1);
    $notes2 = notesParEvaluations($pdo, $evals2);

    $resultat = [];
    foreach (roster($pdo, $classeId) as $eleve) {
        $id   = $eleve['inscription_id'];
        $moy1 = moyennePonderee($evals1, $notes1[$id] ?? []);
        $moy2 = moyennePonderee($evals2, $notes2[$id] ?? []);
        $resultat[$id] = [
            'sequence1' => $moy1,
            'sequence2' => $moy2,
            'trimestre' => ($moy1 !== null && $moy2 !== null) ? round(($moy1 + $moy2) / 2, 2) : null,
        ];
    }
    return $resultat;
}

/** Appréciation littérale associée à une moyenne sur 20 (barème unique du bulletin). */
function appreciation(?float $moyenne): string
{
    if ($moyenne === null) return '—';
    if ($moyenne < 8)  return 'Très faible';
    if ($moyenne < 10) return 'Faible';
    if ($moyenne < 12) return 'Passable';
    if ($moyenne < 14) return 'Assez bien';
    if ($moyenne < 16) return 'Bien';
    if ($moyenne < 18) return 'Très bien';
    return 'Excellent';
}

/**
 * Classement standard à partir de [clé => moyenne|null] : la meilleure
 * moyenne obtient le rang 1, les ex æquo partagent le même rang, et le
 * rang suivant saute du nombre d'ex æquo. Les clés à moyenne null n'ont
 * pas de rang (absentes du résultat).
 * Retourne [clé => rang].
 */
function classement(array $moyennes): array
{
    $notees = array_filter($moyennes, fn($m) => $m !== null);
    arsort($notees);

    $rangs = [];
    $position   = 0;
    $rangAffiche = 0;
    $precedente  = null;
    foreach ($notees as $cle => $valeur) {
        $position++;
        if ($valeur !== $precedente) {
            $rangAffiche = $position;
            $precedente  = $valeur;
        }
        $rangs[$cle] = $rangAffiche;
    }
    return $rangs;
}

/* =========================================================
 * FINANCE — helpers partagés par types_frais.php, inscription_frais.php,
 * paiements.php, recus.php, depenses.php, rapports_financiers.php et
 * inscriptions.php. On accède toujours à l'élève via inscription_id ->
 * inscriptions -> eleves : jamais de duplication de son identité ici.
 * ========================================================= */

const ROLES_FINANCE_LECTURE  = ['administrateur', 'comptable', 'secretaire', 'direction'];
const ROLES_FINANCE_ECRITURE = ['administrateur', 'comptable', 'secretaire'];
const ROLES_FINANCE_ADMIN    = ['administrateur', 'comptable'];
/* Rapports financiers et livret de caisse : direction inclue (supervision),
   secrétaire exclue (accès limité à la consultation par élève). */
const ROLES_FINANCE_RAPPORTS = ['administrateur', 'comptable', 'direction'];

/** Vérifie que l'utilisateur connecté a l'un des rôles autorisés, sinon arrête la requête. */
function exigerRoleFinance(array $rolesAutorises): array
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }
    if (!in_array($utilisateur['role'], $rolesAutorises, true)) {
        erreur('Action non autorisée pour votre rôle.', 403);
    }
    return $utilisateur;
}

/**
 * Solde d'une inscription : montant dû (frais actifs), montant payé
 * (paiements valides), solde restant. Seule source de vérité pour le
 * calcul financier — inscriptions.montant_du/montant_verse ne sont plus
 * mis à jour depuis le module Finance, conservés uniquement en historique.
 */
function soldeInscription(PDO $pdo, int $inscriptionId): array
{
    $du = $pdo->prepare(
        "SELECT COALESCE(SUM(montant_du), 0) FROM inscription_frais
         WHERE inscription_id = ? AND statut = 'actif'"
    );
    $du->execute([$inscriptionId]);
    $montantDu = (int)$du->fetchColumn();

    $paye = $pdo->prepare(
        "SELECT COALESCE(SUM(montant), 0) FROM paiements
         WHERE inscription_id = ? AND statut = 'valide'"
    );
    $paye->execute([$inscriptionId]);
    $montantPaye = (int)$paye->fetchColumn();

    return [
        'montant_du'   => $montantDu,
        'montant_paye' => $montantPaye,
        'solde'        => $montantDu - $montantPaye,
    ];
}

/** Numéro de reçu séquentiel et lisible : REC-<année>-<6 chiffres>. */
function genererNumeroRecu(PDO $pdo): string
{
    $annee  = date('Y');
    $compte = (int)$pdo->query("SELECT COUNT(*) FROM recus WHERE numero LIKE 'REC-$annee-%'")->fetchColumn();
    return sprintf('REC-%s-%06d', $annee, $compte + 1);
}

/**
 * Clé secrète servant uniquement à signer les reçus (jamais transmise au
 * navigateur). À remplacer par une valeur propre à l'établissement en
 * production — voir codeVerificationRecu().
 */
const CLE_SIGNATURE_RECUS = 'KSSQUmxKEwhTC4JF7BBPHSSqlZO82K5rXE0+cAj1BOk=';

/**
 * Code de vérification d'un reçu : une empreinte calculée côté serveur à
 * partir des données réelles enregistrées (numéro, montant, date), avec une
 * clé secrète jamais exposée au client. Impossible à recalculer sans cette
 * clé — donc impossible à falsifier en modifiant simplement l'affichage
 * (inspecteur du navigateur, capture d'écran retouchée…) : si le montant
 * imprimé a été trafiqué, ce code ne correspondra plus à celui recalculé en
 * rouvrant le même reçu dans l'application (source de vérité = la base).
 */
function codeVerificationRecu(string $numero, int $montant, string $datePaiement): string
{
    $empreinte = hash_hmac('sha256', $numero . '|' . $montant . '|' . $datePaiement, CLE_SIGNATURE_RECUS);
    return strtoupper(substr($empreinte, 0, 4) . '-' . substr($empreinte, 4, 4));
}

/**
 * Numéro d'immatriculation unique d'un bulletin : même principe que
 * codeVerificationRecu() (empreinte HMAC calculée côté serveur à partir des
 * données réelles du bulletin, avec une clé secrète jamais exposée au
 * client), appliqué ici au trio matricule/trimestre/année scolaire + à la
 * moyenne générale affichée. Si l'un de ces éléments a été trafiqué sur un
 * bulletin imprimé, recalculer ce numéro en rouvrant le même bulletin dans
 * l'application ne donnera plus le même résultat.
 */
function codeVerificationBulletin(string $matricule, int $trimestre, string $anneeLibelle, ?float $moyenneGenerale): string
{
    $moyenneTexte = $moyenneGenerale !== null ? number_format($moyenneGenerale, 2, '.', '') : 'NA';
    $empreinte = hash_hmac('sha256', $matricule . '|' . $trimestre . '|' . $anneeLibelle . '|' . $moyenneTexte, CLE_SIGNATURE_RECUS);
    return strtoupper(substr($empreinte, 0, 4) . '-' . substr($empreinte, 4, 4) . '-' . substr($empreinte, 8, 4));
}

/**
 * Crée automatiquement les frais obligatoires (scolarité + inscription)
 * d'une inscription à partir des montants de sa classe, avec réduction
 * éventuelle. Appelée une seule fois, à la création de l'inscription —
 * c'est « l'association automatique des frais » du module Finance.
 */
function creerFraisObligatoires(PDO $pdo, int $inscriptionId, int $classeId, int $reductionPourcentage = 0, ?string $motifReduction = null): void
{
    $classe = $pdo->prepare('SELECT frais_inscription, frais_scolarite FROM classes WHERE id = ?');
    $classe->execute([$classeId]);
    $montants = $classe->fetch();
    if (!$montants) {
        return;
    }

    $types     = $pdo->query("SELECT id, code FROM types_frais WHERE code IN ('inscription','scolarite')")->fetchAll();
    $idParCode = array_column($types, 'id', 'code');

    $montantsParCode = [
        'inscription' => (int)$montants['frais_inscription'],
        'scolarite'   => (int)$montants['frais_scolarite'],
    ];

    $inserer = $pdo->prepare(
        'INSERT INTO inscription_frais (inscription_id, type_frais_id, montant_du, reduction_pourcentage, motif_reduction)
         VALUES (?, ?, ?, ?, ?)'
    );

    foreach ($montantsParCode as $code => $montantBrut) {
        if (!isset($idParCode[$code])) {
            continue;
        }
        /* La réduction ne s'applique qu'à la scolarité, jamais aux frais
           d'inscription (règle déjà en place côté formulaire, voir la
           fonction calculer() d'inscription.js — on ne fait que la
           reporter fidèlement ici). */
        $tauxApplique = $code === 'scolarite' ? $reductionPourcentage : 0;
        $montantApresReduction = (int)round($montantBrut * (100 - $tauxApplique) / 100);
        $inserer->execute([$inscriptionId, $idParCode[$code], $montantApresReduction, $tauxApplique, $tauxApplique > 0 ? $motifReduction : null]);
    }
}

/**
 * Détail des frais actifs d'une inscription avec leur solde individuel.
 * Les paiements ciblés (inscription_frais_id renseigné) s'imputent
 * directement à leur frais ; les versements globaux sont répartis
 * virtuellement par priorité : frais obligatoires d'abord, puis échéance
 * la plus proche, puis ordre de création. Le solde global de l'inscription
 * (soldeInscription) ne dépend jamais de cet ordre — cette répartition ne
 * sert qu'à afficher un état par frais (soldé/partiel/impayé).
 */
function fraisAvecSoldes(PDO $pdo, int $inscriptionId): array
{
    $frais = $pdo->prepare(
        "SELECT f.id, f.type_frais_id, t.code, t.nom, t.categorie,
                f.montant_du, f.reduction_pourcentage, f.motif_reduction,
                f.date_echeance, f.cree_le
         FROM inscription_frais f
         JOIN types_frais t ON t.id = f.type_frais_id
         WHERE f.inscription_id = ? AND f.statut = 'actif'
         ORDER BY (t.categorie = 'obligatoire') DESC,
                  (f.date_echeance IS NULL), f.date_echeance ASC,
                  f.cree_le ASC, f.id ASC"
    );
    $frais->execute([$inscriptionId]);
    $lignes = $frais->fetchAll();

    $paiementsCibles = $pdo->prepare(
        "SELECT inscription_frais_id, COALESCE(SUM(montant),0) AS total
         FROM paiements
         WHERE inscription_id = ? AND statut = 'valide' AND inscription_frais_id IS NOT NULL
         GROUP BY inscription_frais_id"
    );
    $paiementsCibles->execute([$inscriptionId]);
    $parFrais = array_column($paiementsCibles->fetchAll(), 'total', 'inscription_frais_id');

    $globalStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(montant),0) FROM paiements
         WHERE inscription_id = ? AND statut = 'valide' AND inscription_frais_id IS NULL"
    );
    $globalStmt->execute([$inscriptionId]);
    $enveloppeGlobale = (int)$globalStmt->fetchColumn();

    $aujourdhui = date('Y-m-d');
    foreach ($lignes as &$ligne) {
        $paye    = (int)($parFrais[$ligne['id']] ?? 0);
        $resteDu = max(0, $ligne['montant_du'] - $paye);

        if ($enveloppeGlobale > 0 && $resteDu > 0) {
            $prelevement       = min($enveloppeGlobale, $resteDu);
            $paye             += $prelevement;
            $enveloppeGlobale -= $prelevement;
            $resteDu          -= $prelevement;
        }

        $ligne['montant_paye'] = $paye;
        $ligne['solde']        = $resteDu;
        $ligne['etat']         = $resteDu <= 0 ? 'solde' : ($paye > 0 ? 'partiel' : 'impaye');
        $ligne['en_retard']    = $resteDu > 0 && $ligne['date_echeance'] !== null && $ligne['date_echeance'] < $aujourdhui;
    }
    unset($ligne);

    return ['frais' => $lignes, 'excedent_non_affecte' => $enveloppeGlobale];
}

/**
 * Diffuse une notification interne (visible du personnel finance dans la
 * cloche existante) pour chaque frais dont l'échéance vient d'être dépassée
 * et dont le solde reste dû, afin de signaler un retard de paiement à
 * relancer auprès du parent/tuteur. Ne notifie jamais deux fois le même
 * frais (notifie_retard_le posée dès l'envoi) : si un paiement partiel
 * couvre entre-temps le solde, fraisAvecSoldes() ne le retient plus comme
 * en_retard et aucune alerte n'est créée. Il n'y a pas de tâche planifiée
 * dans cette appli : la vérification se fait "à la demande", à chaque
 * ouverture de la cloche de notifications (voir php/notifications.php).
 */
function verifierEcheancesEnRetard(PDO $pdo): void
{
    $candidats = $pdo->query(
        "SELECT id, inscription_id FROM inscription_frais
         WHERE statut = 'actif' AND notifie_retard_le IS NULL
           AND date_echeance IS NOT NULL AND date_echeance < CURDATE()"
    )->fetchAll();

    if (!$candidats) {
        return;
    }

    $fraisParInscription = [];
    foreach ($candidats as $c) {
        $fraisParInscription[$c['inscription_id']][] = (int)$c['id'];
    }

    $infoEleve = $pdo->prepare(
        "SELECT e.nom, e.prenom, e.pere, e.mere, e.tuteur, e.contact, c.nom AS classe
         FROM inscriptions i
         JOIN eleves e ON e.id = i.eleve_id
         JOIN classes c ON c.id = i.classe_id
         WHERE i.id = ?"
    );
    $marquer  = $pdo->prepare('UPDATE inscription_frais SET notifie_retard_le = NOW() WHERE id = ?');
    $inserer  = $pdo->prepare('INSERT INTO notifications (titre, message, icone) VALUES (?, ?, ?)');

    foreach ($fraisParInscription as $inscriptionId => $fraisIds) {
        $infoEleve->execute([$inscriptionId]);
        $eleve = $infoEleve->fetch();
        if (!$eleve) {
            continue;
        }

        $responsable = $eleve['tuteur'] ?: ($eleve['pere'] ?: ($eleve['mere'] ?: 'responsable légal'));
        $contact     = $eleve['contact'] ?: 'contact non renseigné';

        $detail = fraisAvecSoldes($pdo, (int)$inscriptionId);
        foreach ($detail['frais'] as $f) {
            if (!$f['en_retard'] || !in_array($f['id'], $fraisIds, true)) {
                continue;
            }

            $message = sprintf(
                '%s %s (%s) : %s de %s FCFA en retard, échéance dépassée le %s. Responsable : %s — %s.',
                $eleve['prenom'], $eleve['nom'], $eleve['classe'],
                $f['nom'], number_format((float)$f['solde'], 0, ',', ' '),
                (new DateTime($f['date_echeance']))->format('d/m/Y'),
                $responsable, $contact
            );

            $inserer->execute(['Retard de paiement', $message, '⚠️']);
            $marquer->execute([$f['id']]);
        }
    }
}

/* =========================================================
 * VIE SCOLAIRE — helpers partagés par absences.php et justifications.php.
 * Comme pour la Finance, on accède toujours à l'élève via inscription_id
 * -> inscriptions -> eleves : jamais de duplication de son identité ici.
 * ========================================================= */

const ROLES_VIE_SCOLAIRE_LECTURE = ['administrateur', 'direction', 'secretaire', 'enseignant', 'comptable'];
const ROLES_VIE_SCOLAIRE_SAISIE  = ['administrateur', 'direction', 'secretaire', 'enseignant'];

/* Vie scolaire des enseignants : relève de la direction/RH, jamais des
   enseignants eux-mêmes (ni entre collègues) — lecture et saisie réservées
   au même petit groupe de rôles. */
const ROLES_VIE_SCOLAIRE_ENSEIGNANTS = ['administrateur', 'direction', 'secretaire'];

/* =========================================================
 * EMPLOI DU TEMPS — helpers partagés par php/seances.php.
 * Consultation ouverte à tout le personnel connecté (un enseignant doit
 * pouvoir voir son propre planning) ; la saisie reste réservée au
 * secrétariat/direction, comme les autres plannings de l'établissement.
 * ========================================================= */

const ROLES_EMPLOI_DU_TEMPS_LECTURE = ['administrateur', 'direction', 'secretaire', 'enseignant', 'comptable'];
const ROLES_EMPLOI_DU_TEMPS_SAISIE  = ['administrateur', 'direction', 'secretaire'];

/* Les deux pauses quotidiennes, identiques pour toutes les classes toute
   l'année (voir la consigne à l'origine de ce module) : aucune séance ne
   doit les chevaucher. */
const PAUSES_EMPLOI_DU_TEMPS = [
    ['09:45:00', '10:15:00'],
    ['12:00:00', '12:30:00'],
];

/* Les cours ont lieu de 07:30 à 15:30, toutes classes confondues : aucune
   séance ne peut commencer avant ni finir après. */
const HEURE_DEBUT_JOURNEE = '07:30:00';
const HEURE_FIN_JOURNEE   = '15:30:00';

/* =========================================================
 * PARAMÈTRES — helpers partagés par parametres_academiques.php,
 * parametres_financiers.php, sauvegardes.php et connexions.php.
 * ========================================================= */

const ROLES_PARAMETRES_GESTION = ['administrateur', 'direction'];

/* =========================================================
 * ADMINISTRATIF — helpers partagés par php/personnel_administratif.php
 * et php/utilisateurs.php.
 * ========================================================= */

const ROLES_ADMINISTRATIF_GESTION      = ['administrateur', 'direction', 'secretaire'];
const ROLES_ADMINISTRATIF_UTILISATEURS = ['administrateur'];

/** Vérifie que l'utilisateur connecté a l'un des rôles autorisés, sinon arrête la requête. */
function exigerRoleParametres(array $rolesAutorises): array
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }
    if (!in_array($utilisateur['role'], $rolesAutorises, true)) {
        erreur('Action non autorisée pour votre rôle.', 403);
    }
    return $utilisateur;
}

/** Vérifie que l'utilisateur connecté a l'un des rôles autorisés, sinon arrête la requête. */
function exigerRoleVieScolaire(array $rolesAutorises): array
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }
    if (!in_array($utilisateur['role'], $rolesAutorises, true)) {
        erreur('Action non autorisée pour votre rôle.', 403);
    }
    return $utilisateur;
}

/**
 * Un enseignant connecté ne peut signaler une absence/un retard que pour
 * les classes dont il est le professeur principal (le registre de vie
 * scolaire au quotidien revient au professeur principal, pas à tous les
 * enseignants affectés). Les autres rôles ne sont pas restreints.
 */
function verifierProfesseurPrincipal(PDO $pdo, int $classeId): void
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur || $utilisateur['role'] !== 'enseignant') {
        return;
    }
    if (empty($utilisateur['enseignant_id'])) {
        erreur('Ce compte enseignant n\'est rattaché à aucune fiche enseignant.', 403);
    }

    $stmt = $pdo->prepare('SELECT professeur_principal_id FROM classes WHERE id = ?');
    $stmt->execute([$classeId]);
    $professeurPrincipalId = $stmt->fetchColumn();

    if ($professeurPrincipalId === false || (int)$professeurPrincipalId !== (int)$utilisateur['enseignant_id']) {
        erreur('Vous n\'êtes pas professeur principal de cette classe.', 403);
    }
}

/* =========================================================
 * COMMUNICATION — helpers partagés par php/communications.php et
 * php/modeles_messages.php (SMS / e-mail vers élèves, parents,
 * enseignants, personnel).
 * ========================================================= */

const ROLES_COMMUNICATION_GESTION = ['administrateur', 'direction', 'secretaire'];

const CANAUX_VALIDES     = ['sms', 'email', 'sms_email', 'whatsapp'];
const CATEGORIES_VALIDES = ['eleves', 'parents', 'enseignants', 'personnel', 'tous'];
const PORTEES_VALIDES    = ['tous', 'classe', 'individuel'];

/** Vérifie que l'utilisateur connecté a l'un des rôles autorisés, sinon arrête la requête. */
function exigerRoleCommunication(array $rolesAutorises): array
{
    $utilisateur = utilisateurConnecte();
    if (!$utilisateur) {
        erreur('Connexion requise.', 401);
    }
    if (!in_array($utilisateur['role'], $rolesAutorises, true)) {
        erreur('Action non autorisée pour votre rôle.', 403);
    }
    return $utilisateur;
}

/**
 * Élèves (ou leurs parents/tuteurs) à contacter : le schéma ne modélise
 * qu'un seul contact familial par élève (champs `contact`/`email` sur
 * `eleves`, comme `pere`/`mere`/`tuteur`) — « Élèves » et « Parents »
 * ciblent donc le même canal, seul le nom affiché diffère. Filtré sur
 * une classe (via l'inscription validée) ou un élève précis si fourni,
 * sinon tous les élèves actifs.
 */
function destinatairesEleves(PDO $pdo, ?int $classeId, ?int $individuId, bool $commeParent): array
{
    $sql = 'SELECT e.id, e.nom, e.prenom, e.contact, e.email, e.pere, e.mere, e.tuteur
            FROM eleves e';
    $params = [];

    if ($individuId) {
        $sql .= ' WHERE e.id = ?';
        $params[] = $individuId;
    } elseif ($classeId) {
        $sql .= ' JOIN inscriptions i ON i.eleve_id = e.id AND i.statut = \'validee\'
                  WHERE i.classe_id = ? AND e.statut = \'actif\'';
        $params[] = $classeId;
    } else {
        $sql .= ' WHERE e.statut = \'actif\'';
    }
    $sql .= ' ORDER BY e.nom, e.prenom';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $destinataires = [];
    foreach ($stmt->fetchAll() as $e) {
        $nomEleve = trim($e['prenom'] . ' ' . $e['nom']);
        $destinataires[] = [
            'categorie'     => $commeParent ? 'parent' : 'eleve',
            'reference_id'  => (int)$e['id'],
            'nom'           => $commeParent
                ? trim(($e['tuteur'] ?: ($e['pere'] ?: ($e['mere'] ?: 'Responsable'))) . ' (parent de ' . $nomEleve . ')')
                : $nomEleve,
            'telephone'     => $e['contact'] ?: null,
            'email'         => $e['email'] ?: null,
        ];
    }
    return $destinataires;
}

/** Enseignants actifs à contacter, ou un enseignant précis. */
function destinatairesEnseignants(PDO $pdo, ?int $individuId): array
{
    $sql = 'SELECT id, civilite, nom, prenom, telephone, email FROM enseignants';
    $params = [];
    if ($individuId) {
        $sql .= ' WHERE id = ?';
        $params[] = $individuId;
    } else {
        $sql .= ' WHERE statut = \'Actif\'';
    }
    $sql .= ' ORDER BY nom, prenom';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $destinataires = [];
    foreach ($stmt->fetchAll() as $ens) {
        $destinataires[] = [
            'categorie'    => 'enseignant',
            'reference_id' => (int)$ens['id'],
            'nom'          => trim($ens['civilite'] . ' ' . $ens['nom'] . ' ' . $ens['prenom']),
            'telephone'    => $ens['telephone'] ?: null,
            'email'        => $ens['email'] ?: null,
        ];
    }
    return $destinataires;
}

/** Personnel administratif actif à contacter, ou un agent précis. */
function destinatairesPersonnel(PDO $pdo, ?int $individuId): array
{
    $sql = 'SELECT id, civilite, nom, prenom, telephone, email FROM personnel_administratif';
    $params = [];
    if ($individuId) {
        $sql .= ' WHERE id = ?';
        $params[] = $individuId;
    } else {
        $sql .= ' WHERE statut = \'Actif\'';
    }
    $sql .= ' ORDER BY nom, prenom';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $destinataires = [];
    foreach ($stmt->fetchAll() as $agent) {
        $destinataires[] = [
            'categorie'    => 'personnel',
            'reference_id' => (int)$agent['id'],
            'nom'          => trim($agent['civilite'] . ' ' . $agent['nom'] . ' ' . $agent['prenom']),
            'telephone'    => $agent['telephone'] ?: null,
            'email'        => $agent['email'] ?: null,
        ];
    }
    return $destinataires;
}

/**
 * Résout la liste des destinataires d'une communication à partir de sa
 * catégorie (eleves/parents/enseignants/personnel/tous) et de sa portée
 * (tous/classe/individuel). `classeId` n'est pris en compte que pour
 * élèves/parents ; `individuId` seulement en portée « individuel ».
 * La catégorie « tous » ignore toujours classe/individuel (diffusion
 * générale) et cible les parents plutôt que les élèves eux-mêmes, pour ne
 * pas doubler l'envoi sur le même contact familial.
 */
function resoudreDestinataires(PDO $pdo, string $categorie, string $portee, ?int $classeId, ?int $individuId): array
{
    $classeId   = $portee === 'classe' ? $classeId : null;
    $individuId = $portee === 'individuel' ? $individuId : null;

    switch ($categorie) {
        case 'eleves':
            return destinatairesEleves($pdo, $classeId, $individuId, false);
        case 'parents':
            return destinatairesEleves($pdo, $classeId, $individuId, true);
        case 'enseignants':
            return destinatairesEnseignants($pdo, $individuId);
        case 'personnel':
            return destinatairesPersonnel($pdo, $individuId);
        case 'tous':
            return array_merge(
                destinatairesEleves($pdo, null, null, true),
                destinatairesEnseignants($pdo, null),
                destinatairesPersonnel($pdo, null)
            );
        default:
            return [];
    }
}

/**
 * Envoi e-mail réel via mail() (fonctionne si un relais SMTP local est
 * configuré dans php.ini — sinon échec proprement remonté, jamais
 * silencieux).
 */
function envoyerEmail(string $destinataire, string $sujet, string $contenu): array
{
    $enTetes = "Content-Type: text/plain; charset=utf-8\r\nFrom: SCOLARIS <no-reply@lyceeclassic.edu>";
    $ok = @mail($destinataire, $sujet, $contenu, $enTetes);
    return $ok
        ? ['statut' => 'envoye', 'erreur' => null]
        : ['statut' => 'echec', 'erreur' => "Échec de l'envoi (serveur SMTP local non configuré)."];
}

/**
 * Envoi SMS : aucune passerelle n'est configurée pour l'instant, le
 * message est donc enregistré et journalisé en mode simulation (statut
 * distinct « simule », jamais confondu avec un envoi réel). Pour brancher
 * un vrai fournisseur (Twilio, Nexmo, un agrégateur local…), remplacer le
 * corps de cette fonction par son appel API et retourner
 * 'envoye'/'echec' selon sa réponse — le reste de l'application (statuts,
 * historique, aperçu) n'a rien à changer.
 */
function envoyerSMS(string $destinataire, string $contenu): array
{
    return ['statut' => 'simule', 'erreur' => null];
}
