<?php
declare(strict_types=1);

require_once __DIR__ . '/_aide.php';

$pdo     = db();
$methode = $_SERVER['REQUEST_METHOD'];

/* Sauvegarde/restauration réelles, en PHP pur (ne dépend pas de mysqldump,
   pas toujours disponible depuis PHP selon la configuration du serveur).
   Fichiers stockés hors de portée du web (voir sauvegardes/.htaccess). */
const DOSSIER_SAUVEGARDES = __DIR__ . '/../sauvegardes';
const PREFIXE_SAUVEGARDE  = 'lycee_classic_';

function nomValide(string $nom): bool
{
    return (bool)preg_match('/^' . PREFIXE_SAUVEGARDE . '[0-9_-]+\.sql$/', $nom);
}

if ($methode === 'GET') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);

    $fichiers = glob(DOSSIER_SAUVEGARDES . '/' . PREFIXE_SAUVEGARDE . '*.sql') ?: [];
    $liste = array_map(fn($chemin) => [
        'nom'    => basename($chemin),
        'taille' => filesize($chemin),
        'cree_le' => date('Y-m-d H:i:s', filemtime($chemin)),
    ], $fichiers);

    usort($liste, fn($a, $b) => strcmp($b['cree_le'], $a['cree_le']));
    repondre($liste);
}

/** Génère une nouvelle sauvegarde complète de la base (structure + données). */
if ($methode === 'POST') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);

    if (!is_dir(DOSSIER_SAUVEGARDES) && !mkdir(DOSSIER_SAUVEGARDES, 0755, true)) {
        erreur('Impossible de créer le dossier de sauvegardes.', 500);
    }

    $nomFichier = PREFIXE_SAUVEGARDE . date('Y-m-d_His') . '.sql';
    $chemin     = DOSSIER_SAUVEGARDES . '/' . $nomFichier;

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    $sql = "-- Sauvegarde SCOLARIS — " . date('Y-m-d H:i:s') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
    foreach ($tables as $table) {
        $creation = $pdo->query("SHOW CREATE TABLE `$table`")->fetch();
        $sql .= "DROP TABLE IF EXISTS `$table`;\n" . $creation['Create Table'] . ";\n\n";

        $lignes = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($lignes as $ligne) {
            $colonnes = implode(',', array_map(fn($c) => "`$c`", array_keys($ligne)));
            $valeurs  = implode(',', array_map(
                fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v),
                array_values($ligne)
            ));
            $sql .= "INSERT INTO `$table` ($colonnes) VALUES ($valeurs);\n";
        }
        $sql .= "\n";
    }
    $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

    if (file_put_contents($chemin, $sql) === false) {
        erreur('Échec de l\'écriture de la sauvegarde.', 500);
    }

    repondre(['nom' => $nomFichier, 'taille' => filesize($chemin), 'cree_le' => date('Y-m-d H:i:s')], 201);
}

/** Restaure la base à partir d'une sauvegarde existante (destructif). */
if ($methode === 'PUT') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);
    $d   = entreeJSON();
    $nom = trim((string)($d['nom'] ?? ''));

    if (!$nom || !nomValide($nom)) {
        erreur('Nom de sauvegarde invalide.');
    }
    $chemin = DOSSIER_SAUVEGARDES . '/' . $nom;
    if (!is_file($chemin)) {
        erreur('Sauvegarde introuvable.', 404);
    }

    /* Exécuté via mysqli::multi_query (pas un simple explode(";") sur le
       texte) : un champ contenant lui-même un point-virgule suivi d'un
       retour à la ligne (motif, observation...) couperait autrement une
       instruction en deux fragments invalides. multi_query respecte les
       chaînes entre guillemets comme un vrai client SQL.
       Note : le CREATE/DROP TABLE provoque de toute façon un commit
       implicite en MySQL — pas de transaction globale possible ici. */
    $sql = file_get_contents($chemin);

    $mysqli = mysqli_init();
    if (!$mysqli->real_connect('127.0.0.1', 'root', '', 'lycee_classic')) {
        erreur('Connexion à la base impossible pour la restauration.', 500);
    }
    $mysqli->set_charset('utf8mb4');

    if (!$mysqli->multi_query($sql)) {
        $messageErreur = $mysqli->error;
        $mysqli->close();
        erreur('Échec de la restauration : ' . $messageErreur, 500);
    }

    do {
        if ($mysqli->errno) {
            $messageErreur = $mysqli->error;
            $mysqli->close();
            erreur('Échec de la restauration (instruction partielle) : ' . $messageErreur, 500);
        }
        if (!$mysqli->more_results()) {
            break;
        }
    } while ($mysqli->next_result());

    $mysqli->close();
    repondre(['ok' => true]);
}

/** Supprime un fichier de sauvegarde. */
if ($methode === 'DELETE') {
    exigerRoleParametres(ROLES_PARAMETRES_GESTION);
    $nom = trim((string)($_GET['nom'] ?? ''));

    if (!$nom || !nomValide($nom)) {
        erreur('Nom de sauvegarde invalide.');
    }
    $chemin = DOSSIER_SAUVEGARDES . '/' . $nom;
    if (!is_file($chemin)) {
        erreur('Sauvegarde introuvable.', 404);
    }

    unlink($chemin);
    repondre(['ok' => true]);
}

erreur('Méthode non autorisée.', 405);
