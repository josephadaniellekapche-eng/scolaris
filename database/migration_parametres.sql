-- =========================================================
-- SCOLARIS — Migration additive : Paramètres
-- (paramètres académiques/financiers informatifs, historique de
-- connexion). Idempotente : peut être exécutée plusieurs fois sans
-- erreur ni perte de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_parametres.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- Réglages académiques : informatifs pour l'instant (affichés dans
-- l'application), ne pilotent pas encore les calculs de Notes/Bulletins
-- (qui restent sur 3 trimestres de 2 séquences, /20 — voir api/_aide.php).
CREATE TABLE IF NOT EXISTS parametres_academiques (
  id TINYINT PRIMARY KEY DEFAULT 1,
  systeme_evaluation VARCHAR(20) NOT NULL DEFAULT 'Sur 20',
  moyenne_passage DECIMAL(4,2) NOT NULL DEFAULT 10.00,
  nombre_trimestres TINYINT NOT NULL DEFAULT 3,
  afficher_rangs TINYINT(1) NOT NULL DEFAULT 1,
  afficher_moyennes_ponderees TINYINT(1) NOT NULL DEFAULT 1,
  autoriser_decimales TINYINT(1) NOT NULL DEFAULT 1,
  arrondir_moyennes TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT IGNORE INTO parametres_academiques (id) VALUES (1);

-- Réglages financiers : la devise et le mode de paiement par défaut
-- préremplissent réellement les formulaires de Paiements/Inscription ;
-- les pénalités de retard sont enregistrées mais pas encore appliquées
-- dans les calculs du module Finance.
CREATE TABLE IF NOT EXISTS parametres_financiers (
  id TINYINT PRIMARY KEY DEFAULT 1,
  devise_defaut VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  mode_paiement_defaut VARCHAR(30) NOT NULL DEFAULT 'Espèces',
  penalites_retard_actif TINYINT(1) NOT NULL DEFAULT 0,
  taux_penalite DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT IGNORE INTO parametres_financiers (id) VALUES (1);

-- Historique de connexion : une ligne par connexion, complétée à la
-- déconnexion. Remplace la liste factice de « sessions actives »
-- affichée jusqu'ici dans profil.html.
CREATE TABLE IF NOT EXISTS connexions_historique (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NOT NULL,
  adresse_ip VARCHAR(45) DEFAULT NULL,
  navigateur VARCHAR(255) DEFAULT NULL,
  connecte_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deconnecte_le DATETIME DEFAULT NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
