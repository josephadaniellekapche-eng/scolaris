-- =========================================================
-- SCOLARIS — Migration additive : Résultats & Bulletins
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_bulletin.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matieres' AND COLUMN_NAME = 'groupe'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE matieres ADD COLUMN groupe VARCHAR(60) NOT NULL DEFAULT ''Général'' AFTER description',
  'SELECT ''matieres.groupe déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matieres' AND COLUMN_NAME = 'ordre_bulletin'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE matieres ADD COLUMN ordre_bulletin TINYINT NOT NULL DEFAULT 1 AFTER groupe',
  'SELECT ''matieres.ordre_bulletin déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
