<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_GESTION);

    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM personnel_administratif WHERE id = ?');
        $stmt->execute([(int)$_GET['id']]);
        $agent = $stmt->fetch();
        if (!$agent) {
            erreur('Agent introuvable.', 404);
        }
        repondre($agent);
    }

    repondre($pdo->query('SELECT * FROM personnel_administratif ORDER BY nom, prenom')->fetchAll());
}

if ($methode === 'POST') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_GESTION);
    $p = entreeJSON();
    if (empty($p['nom']) || empty($p['prenom']) || empty($p['fonction'])) {
        erreur('Nom, prénom et fonction sont obligatoires.');
    }

    $annee     = (int)date('Y');
    $matricule = 'PA-' . $annee . '-' . str_pad((string)random_int(1, 999), 3, '0', STR_PAD_LEFT);

    $stmt = $pdo->prepare(
        'INSERT INTO personnel_administratif (matricule, civilite, nom, prenom, sexe, fonction, telephone, email, date_embauche, statut)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Actif")'
    );
    $stmt->execute([
        $matricule,
        $p['civilite'] ?? ($p['sexe'] === 'Féminin' ? 'Mme' : 'M.'),
        $p['nom'],
        $p['prenom'],
        $p['sexe'] ?? 'Masculin',
        $p['fonction'],
        $p['telephone'] ?? null,
        $p['email'] ?? null,
        $p['date_embauche'] ?? null,
    ]);

    repondre(['id' => (int)$pdo->lastInsertId(), 'matricule' => $matricule], 201);
}

if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_GESTION);
    $id = idRequis();
    $p  = entreeJSON();

    $stmt = $pdo->prepare(
        'UPDATE personnel_administratif SET nom=?, prenom=?, sexe=?, civilite=?, fonction=?, telephone=?, email=?, date_embauche=?, statut=?
         WHERE id=?'
    );
    $stmt->execute([
        $p['nom'] ?? '',
        $p['prenom'] ?? '',
        $p['sexe'] ?? 'Masculin',
        $p['civilite'] ?? ($p['sexe'] === 'Féminin' ? 'Mme' : 'M.'),
        $p['fonction'] ?? '',
        $p['telephone'] ?? null,
        $p['email'] ?? null,
        $p['date_embauche'] ?? null,
        $p['statut'] ?? 'Actif',
        $id,
    ]);

    repondre(['ok' => true]);
}

if ($methode === 'DELETE') {
    exigerRoleParametres(ROLES_ADMINISTRATIF_GESTION);
    $id = idRequis();
    try {
        $pdo->prepare('DELETE FROM personnel_administratif WHERE id=?')->execute([$id]);
    } catch (PDOException $e) {
        erreur('Impossible de supprimer : cet agent est encore lié à un compte utilisateur.', 409);
    }
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
