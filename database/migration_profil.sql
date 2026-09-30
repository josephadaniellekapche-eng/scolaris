-- =========================================================
-- SCOLARIS — Migration additive : Établissement & années
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_profil.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

CREATE TABLE IF NOT EXISTS etablissement (
  id TINYINT PRIMARY KEY DEFAULT 1,
  nom VARCHAR(150) NOT NULL,
  adresse VARCHAR(200) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  email VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

SET @etablissement_existe := (SELECT COUNT(*) FROM etablissement);
SET @sql := IF(@etablissement_existe = 0,
  'INSERT INTO etablissement (id, nom, adresse, telephone, email) VALUES
   (1, ''SCOLARIS'', ''Mobile omnisport, Yaoundé'', ''+237 6 95 46 77 33'', ''contact@lyceeclassic.edu'')',
  'SELECT ''etablissement déjà initialisé'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Années scolaires antérieures (démonstration), pour que le sélecteur
-- « Année scolaire » du profil ait plusieurs options réelles.
SET @annee_existe := (SELECT COUNT(*) FROM annees_scolaires WHERE libelle = '2025-2026');
SET @sql := IF(@annee_existe = 0,
  'INSERT INTO annees_scolaires (libelle, date_debut, date_fin, statut) VALUES (''2025-2026'', ''2025-09-01'', ''2026-07-15'', ''cloturee'')',
  'SELECT ''2025-2026 déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @annee_existe := (SELECT COUNT(*) FROM annees_scolaires WHERE libelle = '2024-2025');
SET @sql := IF(@annee_existe = 0,
  'INSERT INTO annees_scolaires (libelle, date_debut, date_fin, statut) VALUES (''2024-2025'', ''2024-09-01'', ''2025-07-15'', ''cloturee'')',
  'SELECT ''2024-2025 déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
