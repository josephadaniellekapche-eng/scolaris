-- =========================================================
-- SCOLARIS — Migration additive : en-tête ministériel du bulletin
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_entete_bulletin.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'etablissement' AND COLUMN_NAME = 'delegation_regionale'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE etablissement ADD COLUMN delegation_regionale VARCHAR(150) DEFAULT NULL AFTER email',
  'SELECT ''etablissement.delegation_regionale déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'etablissement' AND COLUMN_NAME = 'delegation_regionale_en'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE etablissement ADD COLUMN delegation_regionale_en VARCHAR(150) DEFAULT NULL AFTER delegation_regionale',
  'SELECT ''etablissement.delegation_regionale_en déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'etablissement' AND COLUMN_NAME = 'delegation_departementale'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE etablissement ADD COLUMN delegation_departementale VARCHAR(150) DEFAULT NULL AFTER delegation_regionale_en',
  'SELECT ''etablissement.delegation_departementale déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'etablissement' AND COLUMN_NAME = 'delegation_departementale_en'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE etablissement ADD COLUMN delegation_departementale_en VARCHAR(150) DEFAULT NULL AFTER delegation_departementale',
  'SELECT ''etablissement.delegation_departementale_en déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE etablissement SET
  delegation_regionale = COALESCE(delegation_regionale, 'Délégation Régionale du Centre'),
  delegation_regionale_en = COALESCE(delegation_regionale_en, 'Centre Regional Delegation'),
  delegation_departementale = COALESCE(delegation_departementale, 'Délégation Départementale du Mfoundi'),
  delegation_departementale_en = COALESCE(delegation_departementale_en, 'Mfoundi Divisional Delegation')
WHERE id = 1;
