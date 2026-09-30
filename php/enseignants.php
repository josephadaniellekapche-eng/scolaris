<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    $enseignants = $pdo->query(
        'SELECT id, matricule, civilite, nom, prenom, sexe, telephone, email, diplome, date_embauche, statut
         FROM enseignants ORDER BY nom, prenom'
    )->fetchAll();
    repondre($enseignants);
}

if ($methode === 'POST') {
    $e = entreeJSON();
    if (empty($e['nom']) || empty($e['prenom'])) {
        erreur('Nom et prénom obligatoires.');
    }

    $annee     = (int)date('Y');
    $matricule = 'ENS-' . $annee . '-' . str_pad((string)random_int(1, 999), 3, '0', STR_PAD_LEFT);

    $stmt = $pdo->prepare(
        'INSERT INTO enseignants (matricule, civilite, nom, prenom, sexe, telephone, email, diplome, date_embauche, statut)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Actif")'
    );
    $stmt->execute([
        $matricule,
        $e['civilite'] ?? ($e['sexe'] === 'Féminin' ? 'Mme' : 'M.'),
        $e['nom'],
        $e['prenom'],
        $e['sexe'] ?? 'Masculin',
        $e['telephone'] ?? null,
        $e['email'] ?? null,
        $e['diplome'] ?? null,
        $e['date_embauche'] ?? null,
    ]);

    repondre(['id' => (int)$pdo->lastInsertId(), 'matricule' => $matricule], 201);
}

if ($methode === 'PUT') {
    $id = idRequis();
    $e  = entreeJSON();

    $stmt = $pdo->prepare(
        'UPDATE enseignants SET nom=?, prenom=?, sexe=?, civilite=?, telephone=?, email=?, diplome=?, date_embauche=?, statut=?
         WHERE id=?'
    );
    $stmt->execute([
        $e['nom'] ?? '',
        $e['prenom'] ?? '',
        $e['sexe'] ?? 'Masculin',
        $e['civilite'] ?? ($e['sexe'] === 'Féminin' ? 'Mme' : 'M.'),
        $e['telephone'] ?? null,
        $e['email'] ?? null,
        $e['diplome'] ?? null,
        $e['date_embauche'] ?? null,
        $e['statut'] ?? 'Actif',
        $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    $id = idRequis();
    try {
        $pdo->prepare('DELETE FROM enseignants WHERE id=?')->execute([$id]);
    } catch (PDOException $e) {
        erreur('Impossible de supprimer : cet enseignant est encore affecté à des classes.', 409);
    }
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
