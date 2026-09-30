-- =========================================================
-- SCOLARIS — Migration additive : Module Finance
-- Idempotente : peut être exécutée plusieurs fois sans erreur ni
-- perte de données. N'ajoute que ce qui manque encore.
-- Exécuter avec : mysql --default-character-set=utf8mb4 -u root lycee_classic < migration_finance.sql
-- =========================================================

SET NAMES utf8mb4;
USE lycee_classic;

-- ---------------------------------------------------------
-- Catalogue des frais
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS types_frais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  nom VARCHAR(80) NOT NULL,
  categorie ENUM('obligatoire','optionnel') NOT NULL DEFAULT 'obligatoire',
  montant_defaut INT DEFAULT NULL,
  statut ENUM('actif','inactif') NOT NULL DEFAULT 'actif'
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Frais associés à une inscription (le "dû")
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS inscription_frais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  type_frais_id INT NOT NULL,
  montant_du INT NOT NULL,
  reduction_pourcentage TINYINT NOT NULL DEFAULT 0,
  motif_reduction VARCHAR(150) DEFAULT NULL,
  date_echeance DATE DEFAULT NULL,
  statut ENUM('actif','annule') NOT NULL DEFAULT 'actif',
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inscription_type (inscription_id, type_frais_id),
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (type_frais_id) REFERENCES types_frais(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Paiements (encaissements)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS paiements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  inscription_frais_id INT DEFAULT NULL,
  montant INT NOT NULL,
  mode_paiement ENUM('Espèces','MTN Mobile Money','Orange Money','Virement bancaire','Chèque') NOT NULL,
  reference VARCHAR(60) DEFAULT NULL,
  observation VARCHAR(200) DEFAULT NULL,
  date_paiement DATE NOT NULL,
  saisi_par_id INT DEFAULT NULL,
  statut ENUM('valide','annule') NOT NULL DEFAULT 'valide',
  annule_par_id INT DEFAULT NULL,
  annule_le DATETIME DEFAULT NULL,
  motif_annulation VARCHAR(200) DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (inscription_frais_id) REFERENCES inscription_frais(id) ON DELETE SET NULL,
  FOREIGN KEY (saisi_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
  FOREIGN KEY (annule_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Reçus (un par paiement, numérotation automatique)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS recus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paiement_id INT NOT NULL UNIQUE,
  numero VARCHAR(30) NOT NULL UNIQUE,
  genere_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paiement_id) REFERENCES paiements(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Dépenses de l'établissement
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories_depenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS depenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categorie_id INT NOT NULL,
  libelle VARCHAR(150) NOT NULL,
  montant INT NOT NULL,
  date_depense DATE NOT NULL,
  beneficiaire VARCHAR(120) DEFAULT NULL,
  mode_paiement ENUM('Espèces','MTN Mobile Money','Orange Money','Virement bancaire','Chèque') NOT NULL,
  reference VARCHAR(60) DEFAULT NULL,
  saisi_par_id INT DEFAULT NULL,
  statut ENUM('valide','annule') NOT NULL DEFAULT 'valide',
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categorie_id) REFERENCES categories_depenses(id),
  FOREIGN KEY (saisi_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Données de référence (seed, une seule fois)
-- ---------------------------------------------------------
SET @types_existent := (SELECT COUNT(*) FROM types_frais);
SET @sql := IF(@types_existent = 0,
  'INSERT INTO types_frais (code, nom, categorie, montant_defaut) VALUES
     (''inscription'', ''Frais d\'\'inscription'', ''obligatoire'', NULL),
     (''scolarite'',   ''Frais de scolarité'',      ''obligatoire'', NULL),
     (''cantine'',     ''Cantine'',                 ''optionnel'',   60000),
     (''transport'',   ''Transport'',                ''optionnel'',   75000),
     (''tenue'',       ''Tenue scolaire'',           ''optionnel'',   15000)',
  'SELECT ''types_frais déjà initialisé'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @categories_existent := (SELECT COUNT(*) FROM categories_depenses);
SET @sql := IF(@categories_existent = 0,
  'INSERT INTO categories_depenses (nom) VALUES
     (''Salaires''), (''Fournitures scolaires''), (''Entretien et maintenance''),
     (''Électricité et eau''), (''Transport et carburant''), (''Autres charges'')',
  'SELECT ''categories_depenses déjà initialisée'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- Rétro-remplissage (idempotent) : les inscriptions créées avant le
-- module Finance n'ont ni frais obligatoires ni historique de paiement.
-- On les reconstitue une seule fois à partir des colonnes héritées
-- (classes.frais_*, inscriptions.montant_verse), sans jamais dupliquer
-- si cette migration est rejouée. Aucun reçu n'est généré pour ces
-- versements historiques : ils n'en ont jamais eu.
-- ---------------------------------------------------------
INSERT INTO inscription_frais (inscription_id, type_frais_id, montant_du)
SELECT i.id, t.id, c.frais_inscription
FROM inscriptions i
JOIN classes c ON c.id = i.classe_id
JOIN types_frais t ON t.code = 'inscription'
WHERE NOT EXISTS (SELECT 1 FROM inscription_frais f WHERE f.inscription_id = i.id AND f.type_frais_id = t.id);

INSERT INTO inscription_frais (inscription_id, type_frais_id, montant_du)
SELECT i.id, t.id, c.frais_scolarite
FROM inscriptions i
JOIN classes c ON c.id = i.classe_id
JOIN types_frais t ON t.code = 'scolarite'
WHERE NOT EXISTS (SELECT 1 FROM inscription_frais f WHERE f.inscription_id = i.id AND f.type_frais_id = t.id);

INSERT INTO paiements (inscription_id, montant, mode_paiement, reference, observation, date_paiement)
SELECT i.id, i.montant_verse,
       CASE WHEN i.mode_paiement IN ('Espèces','MTN Mobile Money','Orange Money','Virement bancaire','Chèque')
            THEN i.mode_paiement ELSE 'Espèces' END,
       NULLIF(i.reference_paiement, ''),
       'Versement antérieur au module Finance (import automatique)',
       i.date_inscription
FROM inscriptions i
WHERE i.montant_verse > 0
  AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.inscription_id = i.id);
