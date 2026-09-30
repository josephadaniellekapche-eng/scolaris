-- =========================================================
-- SCOLARIS — Migration additive : Notifications diffusées
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_notifications.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  icone VARCHAR(10) NOT NULL DEFAULT '🔔',
  auteur_id INT DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications_lues (
  notification_id INT NOT NULL,
  utilisateur_id INT NOT NULL,
  lue_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, utilisateur_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET @notification_existe := (SELECT COUNT(*) FROM notifications);
SET @sql := IF(@notification_existe = 0,
  'INSERT INTO notifications (titre, message, icone, auteur_id)
   VALUES (''Bienvenue sur SCOLARIS'', ''Le centre de notifications est prêt : vous pouvez désormais en diffuser à tout le personnel.'', ''🔔'', 1)',
  'SELECT ''notifications déjà initialisée'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
