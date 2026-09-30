-- =========================================================
-- SCOLARIS — Migration additive : alertes internes de retard
-- de paiement (module Finance / Élèves).
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_alertes_retard.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- Marque la date à laquelle une alerte de retard a déjà été diffusée
-- au personnel pour ce frais, afin de ne jamais la répéter (voir
-- verifierEcheancesEnRetard() dans api/_aide.php, appelée à chaque
-- ouverture de la cloche de notifications).
SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscription_frais' AND COLUMN_NAME = 'notifie_retard_le'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE inscription_frais ADD COLUMN notifie_retard_le DATETIME DEFAULT NULL AFTER date_echeance',
  'SELECT ''notifie_retard_le déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
