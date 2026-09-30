-- =========================================================
-- SCOLARIS — Migration additive : Vie scolaire des enseignants
-- (absences & retards des enseignants), distincte de celle des élèves
-- (voir migration_vie_scolaire.sql). Idempotente : peut être exécutée
-- plusieurs fois sans erreur ni perte de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_vie_scolaire_enseignants.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

CREATE TABLE IF NOT EXISTS justifications_enseignants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enseignant_id INT NOT NULL,
  motif VARCHAR(200) NOT NULL,
  type_piece VARCHAR(60) DEFAULT NULL,
  statut ENUM('en_attente','validee','rejetee') NOT NULL DEFAULT 'validee',
  traite_par_id INT DEFAULT NULL,
  traite_le DATETIME DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enseignant_id) REFERENCES enseignants(id) ON DELETE CASCADE,
  FOREIGN KEY (traite_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS absences_enseignants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enseignant_id INT NOT NULL,
  type ENUM('absence','retard') NOT NULL,
  date_evenement DATE NOT NULL,
  heure_debut TIME DEFAULT NULL,
  heure_fin TIME DEFAULT NULL,
  classe_id INT DEFAULT NULL,
  matiere_id INT DEFAULT NULL,
  motif VARCHAR(200) DEFAULT NULL,
  justification_id INT DEFAULT NULL,
  signale_par_id INT DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enseignant_id) REFERENCES enseignants(id) ON DELETE CASCADE,
  FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE SET NULL,
  FOREIGN KEY (justification_id) REFERENCES justifications_enseignants(id) ON DELETE SET NULL,
  FOREIGN KEY (signale_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;
