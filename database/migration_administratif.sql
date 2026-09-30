-- =========================================================
-- SCOLARIS — Migration additive : module Administratif
-- (personnel administratif, rattachement des comptes utilisateurs).
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni perte
-- de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_administratif.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- Personnel non-enseignant (secrétariat, comptabilité, surveillance…).
-- Pool à part des enseignants — jamais fusionné (voir schema.sql).
CREATE TABLE IF NOT EXISTS personnel_administratif (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(20) NOT NULL UNIQUE,
  civilite ENUM('M.','Mme') NOT NULL,
  nom VARCHAR(60) NOT NULL,
  prenom VARCHAR(60) NOT NULL,
  sexe ENUM('Masculin','Féminin') NOT NULL,
  fonction VARCHAR(60) NOT NULL,
  telephone VARCHAR(30) DEFAULT NULL,
  date_embauche DATE DEFAULT NULL,
  statut ENUM('Actif','Inactif') NOT NULL DEFAULT 'Actif'
) ENGINE=InnoDB;

-- Un compte utilisateurs peut se rattacher à une fiche personnel_administratif,
-- exactement comme enseignant_id le fait déjà pour les enseignants — jamais
-- de nom ressaisi en double dans utilisateurs.
SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'utilisateurs' AND COLUMN_NAME = 'personnel_id'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE utilisateurs
     ADD COLUMN personnel_id INT DEFAULT NULL UNIQUE AFTER enseignant_id,
     ADD FOREIGN KEY (personnel_id) REFERENCES personnel_administratif(id) ON DELETE SET NULL',
  'SELECT ''utilisateurs.personnel_id déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
