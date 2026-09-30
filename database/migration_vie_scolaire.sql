-- =========================================================
-- SCOLARIS — Migration additive : Vie scolaire (absences & retards)
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_vie_scolaire.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- Un justificatif peut couvrir plusieurs absences/retards à la fois
-- (ex. un seul certificat médical pour une semaine d'absence).
CREATE TABLE IF NOT EXISTS justifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  motif VARCHAR(200) NOT NULL,
  type_piece VARCHAR(60) DEFAULT NULL,
  statut ENUM('en_attente','validee','rejetee') NOT NULL DEFAULT 'validee',
  traite_par_id INT DEFAULT NULL,
  traite_le DATETIME DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (traite_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Absences et retards partagent la même table (discriminée par `type`) :
-- mêmes champs, même workflow de justification, même historique
-- d'assiduité. Toujours rattachée à inscription_id, jamais à eleve_id
-- directement (voir la règle déjà en place dans le module Finance).
CREATE TABLE IF NOT EXISTS absences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  type ENUM('absence','retard') NOT NULL,
  date_evenement DATE NOT NULL,
  heure_debut TIME DEFAULT NULL,
  heure_fin TIME DEFAULT NULL,
  matiere_id INT DEFAULT NULL,
  motif VARCHAR(200) DEFAULT NULL,
  justification_id INT DEFAULT NULL,
  signale_par_id INT DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE SET NULL,
  FOREIGN KEY (justification_id) REFERENCES justifications(id) ON DELETE SET NULL,
  FOREIGN KEY (signale_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;
