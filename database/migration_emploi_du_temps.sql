-- =========================================================
-- SCOLARIS — Migration additive : Emploi du temps
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_emploi_du_temps.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- Une séance = un créneau hebdomadaire récurrent (pas de date : le même
-- gabarit sert toute l'année scolaire). Rattachée à affectation_id (jamais
-- classe_id/matiere_id/enseignant_id séparément) : on ne peut donc jamais
-- programmer un cours avec un enseignant ou une matière qui n'est pas déjà
-- affecté à cette classe (voir affectations dans schema.sql). La classe et
-- l'année scolaire se déduisent de l'affectation, sans duplication.
CREATE TABLE IF NOT EXISTS seances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  affectation_id INT NOT NULL,
  jour ENUM('lundi','mardi','mercredi','jeudi','vendredi') NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  salle VARCHAR(20) DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affectation_id) REFERENCES affectations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
