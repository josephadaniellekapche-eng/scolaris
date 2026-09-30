<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

/**
 * Lecture seule : reconstitue les données d'un reçu à partir d'un paiement
 * déjà enregistré (comme php/bulletins.php le fait pour les bulletins).
 * Rien n'est généré ni stocké en PDF côté serveur.
 */

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode !== 'GET') {
    erreur('Méthode non autorisée.', 405);
}

exigerRoleFinance(ROLES_FINANCE_LECTURE);

$numero     = $_GET['numero'] ?? null;
$paiementId = (int)($_GET['paiement_id'] ?? 0);

if (!$numero && !$paiementId) {
    erreur('numero ou paiement_id est obligatoire.');
}

$sql = "
    SELECT r.numero, r.genere_le,
           p.id AS paiement_id, p.inscription_id, p.montant, p.mode_paiement, p.reference,
           p.observation, p.date_paiement, p.statut,
           t.nom AS frais_nom,
           el.matricule, el.nom AS eleve_nom, el.prenom AS eleve_prenom,
           c.nom AS classe_nom,
           an.libelle AS annee_scolaire,
           CONCAT(u.prenom, ' ', u.nom) AS saisi_par
    FROM recus r
    JOIN paiements p           ON p.id = r.paiement_id
    JOIN inscriptions i         ON i.id = p.inscription_id
    JOIN eleves el                ON el.id = i.eleve_id
    JOIN classes c                 ON c.id = i.classe_id
    JOIN annees_scolaires an       ON an.id = i.annee_scolaire_id
    LEFT JOIN inscription_frais f  ON f.id = p.inscription_frais_id
    LEFT JOIN types_frais t        ON t.id = f.type_frais_id
    LEFT JOIN utilisateurs u       ON u.id = p.saisi_par_id
    WHERE " . ($numero ? 'r.numero = ?' : 'r.paiement_id = ?');

$stmt = $pdo->prepare($sql);
$stmt->execute([$numero ?: $paiementId]);
$recu = $stmt->fetch();

if (!$recu) {
    erreur('Reçu introuvable.', 404);
}

$recu['solde_apres_paiement'] = soldeInscription($pdo, (int)$recu['inscription_id'])['solde'];
$recu['code_verification']    = codeVerificationRecu($recu['numero'], (int)$recu['montant'], $recu['date_paiement']);

repondre($recu);
