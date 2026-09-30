<?php
ini_set('display_errors', '1');
error_reporting(E_ALL);
echo 'PHP ' . PHP_VERSION . "<br>";
try {
    $pdo = new PDO(
        'mysql:host=sql211.infinityfree.com;dbname=if0_43000325_scolaris;charset=utf8mb4',
        'if0_43000325',
        'kgqzjelodQbtn'
    );
    echo 'Connexion MySQL OK<br>';
    $n = $pdo->query('SELECT COUNT(*) FROM utilisateurs')->fetchColumn();
    echo 'Comptes utilisateurs : ' . $n;
} catch (Throwable $e) {
    echo 'ERREUR : ' . htmlspecialchars($e->getMessage());
}
