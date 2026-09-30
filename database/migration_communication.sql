-- =========================================================
-- SCOLARIS — Migration additive : module Communication
-- (SMS / e-mail vers élèves, parents, enseignants, personnel — historique,
-- statuts par destinataire, modèles de messages). Idempotente : peut être
-- exécutée plusieurs fois sans erreur ni perte de données.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_communication.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- ---------------------------------------------------------
-- Adresses e-mail : absentes du schéma initial (seuls les comptes
-- `utilisateurs` avaient un e-mail). Ajoutées ici pour permettre le canal
-- Email vers élèves/parents (contact familial unique, comme `contact`),
-- enseignants et personnel administratif — jamais de nouvelle table
-- d'identité, juste le champ manquant sur les fiches existantes.
-- ---------------------------------------------------------
SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eleves' AND COLUMN_NAME = 'email'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE eleves ADD COLUMN email VARCHAR(120) DEFAULT NULL AFTER contact',
  'SELECT ''eleves.email déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enseignants' AND COLUMN_NAME = 'email'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE enseignants ADD COLUMN email VARCHAR(120) DEFAULT NULL AFTER telephone',
  'SELECT ''enseignants.email déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @colonne_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel_administratif' AND COLUMN_NAME = 'email'
);
SET @sql := IF(@colonne_existe = 0,
  'ALTER TABLE personnel_administratif ADD COLUMN email VARCHAR(120) DEFAULT NULL AFTER telephone',
  'SELECT ''personnel_administratif.email déjà présente'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- Modèles de messages réutilisables (SMS et/ou e-mail).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS modeles_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(80) NOT NULL,
  canal ENUM('sms','email','sms_email','whatsapp') NOT NULL DEFAULT 'sms_email',
  sujet VARCHAR(150) DEFAULT NULL,
  contenu TEXT NOT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Une communication = un envoi (ou un brouillon) vers une sélection de
-- destinataires (individuel, une classe, ou toute une catégorie). Les
-- critères de sélection restent posés sur la ligne (jamais recalculés a
-- posteriori) pour garder l'historique exact, même si la classe ou la
-- fiche visée change ensuite.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS communications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  canal ENUM('sms','email','sms_email','whatsapp') NOT NULL,
  categorie ENUM('eleves','parents','enseignants','personnel','tous') NOT NULL,
  portee ENUM('tous','classe','individuel') NOT NULL DEFAULT 'tous',
  classe_id INT DEFAULT NULL,
  individu_type ENUM('eleve','enseignant','personnel') DEFAULT NULL,
  individu_id INT DEFAULT NULL,
  sujet VARCHAR(150) DEFAULT NULL,
  contenu TEXT NOT NULL,
  statut ENUM('brouillon','envoye','partiel','echec') NOT NULL DEFAULT 'brouillon',
  nb_destinataires SMALLINT NOT NULL DEFAULT 0,
  nb_reussis SMALLINT NOT NULL DEFAULT 0,
  nb_echecs SMALLINT NOT NULL DEFAULT 0,
  auteur_id INT DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  envoye_le DATETIME DEFAULT NULL,
  FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Destinataires résolus au moment de l'envoi (photographie : nom/contact
-- copiés ici pour que l'historique reste lisible même si la fiche source
-- est ensuite modifiée ou supprimée), avec le statut d'envoi par canal.
-- individu_id n'a pas de clé étrangère : sa table dépend de `categorie`
-- (eleves, enseignants ou personnel_administratif).
CREATE TABLE IF NOT EXISTS communications_destinataires (
  id INT AUTO_INCREMENT PRIMARY KEY,
  communication_id INT NOT NULL,
  categorie ENUM('eleve','parent','enseignant','personnel') NOT NULL,
  reference_id INT DEFAULT NULL,
  nom VARCHAR(120) NOT NULL,
  telephone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  statut_sms ENUM('non_concerne','envoye','simule','echec','whatsapp') NOT NULL DEFAULT 'non_concerne',
  erreur_sms VARCHAR(200) DEFAULT NULL,
  statut_email ENUM('non_concerne','envoye','echec') NOT NULL DEFAULT 'non_concerne',
  erreur_email VARCHAR(200) DEFAULT NULL,
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Élargissement des ENUM canal / statut_sms pour le canal WhatsApp (bases
-- déjà migrées avant son introduction : CREATE TABLE IF NOT EXISTS ci-dessus
-- ne les aurait pas mises à jour). MODIFY COLUMN est sans risque à rejouer.
ALTER TABLE modeles_messages
  MODIFY canal ENUM('sms','email','sms_email','whatsapp') NOT NULL DEFAULT 'sms_email';
ALTER TABLE communications
  MODIFY canal ENUM('sms','email','sms_email','whatsapp') NOT NULL;
ALTER TABLE communications_destinataires
  MODIFY statut_sms ENUM('non_concerne','envoye','simule','echec','whatsapp') NOT NULL DEFAULT 'non_concerne';

-- Modèles de départ, uniquement si la table vient d'être créée sur une
-- base existante (une base déjà utilisée ne doit jamais être re-semée).
INSERT INTO modeles_messages (titre, canal, sujet, contenu)
SELECT 'Rappel de paiement', 'sms_email', 'Rappel : solde de scolarité',
       'Bonjour, nous vous rappelons qu''un solde reste dû sur les frais de scolarité. Merci de régulariser votre situation auprès du secrétariat dans les meilleurs délais.'
WHERE NOT EXISTS (SELECT 1 FROM modeles_messages);

INSERT INTO modeles_messages (titre, canal, sujet, contenu)
SELECT 'Convocation réunion parents', 'sms_email', 'Convocation - Réunion parents-professeurs',
       'Bonjour, vous êtes convié(e) à la réunion parents-professeurs. Votre présence est vivement souhaitée. Merci de confirmer votre disponibilité auprès du secrétariat.'
WHERE (SELECT COUNT(*) FROM modeles_messages) = 1;

INSERT INTO modeles_messages (titre, canal, sujet, contenu)
SELECT 'Fermeture exceptionnelle', 'sms_email', 'Information - Fermeture de l''établissement',
       'Bonjour, nous vous informons que l''établissement sera exceptionnellement fermé. Merci de votre compréhension.'
WHERE (SELECT COUNT(*) FROM modeles_messages) = 2;
