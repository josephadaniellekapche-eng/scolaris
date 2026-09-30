SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS annees_scolaires, niveaux, matieres, enseignants, classes, affectations, seances, eleves, inscriptions, types_frais, inscription_frais, paiements, recus, categories_depenses, depenses, evaluations, notes, personnel_administratif, utilisateurs, parametres_academiques, parametres_financiers, connexions_historique, justifications, absences, justifications_enseignants, absences_enseignants, notifications, notifications_lues, modeles_messages, communications, communications_destinataires, etablissement;


-- ---------------------------------------------------------
-- Références communes
-- ---------------------------------------------------------
CREATE TABLE annees_scolaires (
  id INT AUTO_INCREMENT PRIMARY KEY,
  libelle VARCHAR(20) NOT NULL UNIQUE,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  statut ENUM('a_venir','active','cloturee') NOT NULL DEFAULT 'a_venir'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE niveaux (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  nom VARCHAR(30) NOT NULL,
  cycle ENUM('college','lycee') NOT NULL,
  ordre TINYINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE matieres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  nom VARCHAR(60) NOT NULL,
  categorie ENUM('Fondamentale','Langue vivante','Complémentaire') NOT NULL DEFAULT 'Fondamentale',
  description VARCHAR(255) DEFAULT NULL,
  -- Regroupement d'affichage du bulletin (ex. « Scientifique », « Littéraire »,
  -- « Sport »), distinct de la catégorie ci-dessus. « Général » par défaut ;
  -- à reclasser depuis le module Matières. ordre_bulletin ordonne les
  -- matières (et, par transitivité, les groupes) sur le bulletin.
  groupe VARCHAR(60) NOT NULL DEFAULT 'Général',
  ordre_bulletin TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Personnel
-- ---------------------------------------------------------
CREATE TABLE enseignants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(20) NOT NULL UNIQUE,
  civilite ENUM('M.','Mme') NOT NULL,
  nom VARCHAR(60) NOT NULL,
  prenom VARCHAR(60) NOT NULL,
  sexe ENUM('Masculin','Féminin') NOT NULL,
  telephone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  diplome VARCHAR(120) DEFAULT NULL,
  date_embauche DATE DEFAULT NULL,
  statut ENUM('Actif','Inactif') NOT NULL DEFAULT 'Actif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Structure pédagogique
-- ---------------------------------------------------------
CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  nom VARCHAR(40) NOT NULL,
  niveau_id INT NOT NULL,
  filiere VARCHAR(10) NOT NULL,
  annee_scolaire_id INT NOT NULL,
  capacite SMALLINT NOT NULL DEFAULT 40,
  salle VARCHAR(20) DEFAULT NULL,
  professeur_principal_id INT DEFAULT NULL,
  frais_inscription INT NOT NULL DEFAULT 0,
  frais_scolarite INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_code_annee (code, annee_scolaire_id),
  FOREIGN KEY (niveau_id) REFERENCES niveaux(id),
  FOREIGN KEY (annee_scolaire_id) REFERENCES annees_scolaires(id),
  FOREIGN KEY (professeur_principal_id) REFERENCES enseignants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE affectations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enseignant_id INT NOT NULL,
  matiere_id INT NOT NULL,
  classe_id INT NOT NULL,
  coefficient TINYINT NOT NULL,
  volume_horaire TINYINT NOT NULL,
  UNIQUE KEY uniq_affectation (matiere_id, classe_id),
  FOREIGN KEY (enseignant_id) REFERENCES enseignants(id),
  FOREIGN KEY (matiere_id) REFERENCES matieres(id),
  FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Une séance = un créneau hebdomadaire récurrent (pas de date : le même
-- gabarit sert toute l'année scolaire, de lundi à vendredi). Rattachée à
-- affectation_id (jamais classe_id/matiere_id/enseignant_id séparément) :
-- impossible de programmer un cours avec un enseignant ou une matière qui
-- n'est pas déjà affecté à cette classe. La classe se déduit de l'affectation,
-- sans duplication. Les deux pauses quotidiennes (09:45-10:15, 12:00-12:30)
-- sont des constantes de l'établissement, vérifiées côté API à la saisie.
CREATE TABLE seances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  affectation_id INT NOT NULL,
  jour ENUM('lundi','mardi','mercredi','jeudi','vendredi') NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  salle VARCHAR(20) DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affectation_id) REFERENCES affectations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Élèves et scolarité
-- ---------------------------------------------------------
CREATE TABLE eleves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(20) NOT NULL UNIQUE,
  nom VARCHAR(60) NOT NULL,
  prenom VARCHAR(60) NOT NULL,
  sexe ENUM('F','M') NOT NULL,
  date_naissance DATE DEFAULT NULL,
  lieu_naissance VARCHAR(60) DEFAULT NULL,
  nationalite VARCHAR(40) DEFAULT NULL,
  pere VARCHAR(80) DEFAULT NULL,
  mere VARCHAR(80) DEFAULT NULL,
  tuteur VARCHAR(80) DEFAULT NULL,
  contact VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  adresse VARCHAR(160) DEFAULT NULL,
  origine VARCHAR(120) DEFAULT NULL,
  groupe_sanguin VARCHAR(5) DEFAULT NULL,
  statut ENUM('actif','inactif','diplome','exclu','transfere') NOT NULL DEFAULT 'actif',
  pieces_fournies SET('extrait_naissance','bulletin_precedent','photo_identite',
                       'certificat_medical','carnet_vaccination','fiche_responsable')
                  NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- L'inscription est le pivot Élève ⇄ Classe ⇄ Année scolaire :
-- un élève ne peut avoir qu'une inscription active par année.
CREATE TABLE inscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eleve_id INT NOT NULL,
  classe_id INT NOT NULL,
  annee_scolaire_id INT NOT NULL,
  type ENUM('Nouvel élève','Réinscription','Transfert') NOT NULL,
  statut ENUM('en_attente','validee','rejetee','annulee') NOT NULL DEFAULT 'validee',
  date_inscription DATE NOT NULL,
  montant_du INT NOT NULL DEFAULT 0,
  montant_verse INT NOT NULL DEFAULT 0,
  mode_paiement VARCHAR(30) DEFAULT NULL,
  reference_paiement VARCHAR(60) DEFAULT NULL,
  UNIQUE KEY uniq_eleve_annee (eleve_id, annee_scolaire_id),
  FOREIGN KEY (eleve_id) REFERENCES eleves(id) ON DELETE CASCADE,
  FOREIGN KEY (classe_id) REFERENCES classes(id),
  FOREIGN KEY (annee_scolaire_id) REFERENCES annees_scolaires(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Finance : catalogue des frais, frais dus par inscription,
-- paiements, reçus, dépenses de l'établissement.
-- Ne référence jamais eleves directement : toujours via
-- inscriptions, pour ne pas dupliquer l'identité de l'élève.
-- ---------------------------------------------------------
CREATE TABLE types_frais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  nom VARCHAR(80) NOT NULL,
  categorie ENUM('obligatoire','optionnel') NOT NULL DEFAULT 'obligatoire',
  -- NULL pour scolarite/inscription : leur montant réel vient de
  -- classes.frais_scolarite / classes.frais_inscription (seule source
  -- de vérité, gérée depuis le module Classes).
  montant_defaut INT DEFAULT NULL,
  statut ENUM('actif','inactif') NOT NULL DEFAULT 'actif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Frais effectivement dus par un élève inscrit (recopiés/adaptés depuis
-- types_frais au moment de l'inscription, avec réduction éventuelle).
CREATE TABLE inscription_frais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inscription_id INT NOT NULL,
  type_frais_id INT NOT NULL,
  montant_du INT NOT NULL,
  reduction_pourcentage TINYINT NOT NULL DEFAULT 0,
  motif_reduction VARCHAR(150) DEFAULT NULL,
  date_echeance DATE DEFAULT NULL,
  -- Renseignée dès qu'une alerte de retard a été diffusée au personnel pour
  -- ce frais (voir verifierEcheancesEnRetard() dans api/_aide.php), pour ne
  -- jamais la répéter tant que le solde reste dû.
  notifie_retard_le DATETIME DEFAULT NULL,
  statut ENUM('actif','annule') NOT NULL DEFAULT 'actif',
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_inscription_type (inscription_id, type_frais_id),
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (type_frais_id) REFERENCES types_frais(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Encaissements. Jamais de suppression physique : annuler un paiement
-- passe statut='annule' (traçabilité). inscription_frais_id NULL = un
-- versement global, réparti virtuellement pour le calcul par frais.
CREATE TABLE paiements (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un reçu par paiement, généré automatiquement dans la même transaction.
CREATE TABLE recus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paiement_id INT NOT NULL UNIQUE,
  numero VARCHAR(30) NOT NULL UNIQUE,
  genere_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paiement_id) REFERENCES paiements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dépenses de l'établissement (flux séparé, non lié à un élève).
CREATE TABLE categories_depenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE depenses (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Notes
-- ---------------------------------------------------------
-- Chaque trimestre compte 2 séquences (1 et 2 pour le trimestre 1,
-- 3 et 4 pour le 2, 5 et 6 pour le 3). Une évaluation est une « colonne »
-- de notation partagée par toute la classe pour une matière et une
-- séquence données (ex. « Devoir 1 », « Composition »), avec son propre
-- coefficient. La moyenne de séquence d'un élève dans une matière se
-- calcule à partir de ses notes pondérées par le coefficient de chaque
-- évaluation ; la moyenne trimestrielle est la moyenne des deux séquences.
CREATE TABLE evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classe_id INT NOT NULL,
  matiere_id INT NOT NULL,
  sequence TINYINT NOT NULL,
  libelle VARCHAR(40) NOT NULL,
  coefficient TINYINT NOT NULL DEFAULT 1,
  ordre TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (classe_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (matiere_id) REFERENCES matieres(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- La note d'un élève (via son inscription) pour une évaluation donnée.
CREATE TABLE notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id INT NOT NULL,
  inscription_id INT NOT NULL,
  note DECIMAL(4,2) NOT NULL,
  UNIQUE KEY uniq_note (evaluation_id, inscription_id),
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
  FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Comptes et accès
-- ---------------------------------------------------------
-- Personnel non-enseignant (secrétariat, comptabilité, surveillance…).
-- Pool à part des enseignants — jamais fusionné, jamais recréé ailleurs.
CREATE TABLE personnel_administratif (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(20) NOT NULL UNIQUE,
  civilite ENUM('M.','Mme') NOT NULL,
  nom VARCHAR(60) NOT NULL,
  prenom VARCHAR(60) NOT NULL,
  sexe ENUM('Masculin','Féminin') NOT NULL,
  fonction VARCHAR(60) NOT NULL,
  telephone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  date_embauche DATE DEFAULT NULL,
  statut ENUM('Actif','Inactif') NOT NULL DEFAULT 'Actif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE utilisateurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(60) NOT NULL,
  prenom VARCHAR(60) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  mot_de_passe_hash VARCHAR(255) NOT NULL,
  role ENUM('administrateur','direction','secretaire','enseignant','comptable') NOT NULL,
  enseignant_id INT DEFAULT NULL UNIQUE,
  personnel_id INT DEFAULT NULL UNIQUE,
  statut ENUM('actif','desactive') NOT NULL DEFAULT 'actif',
  derniere_connexion DATETIME DEFAULT NULL,
  FOREIGN KEY (enseignant_id) REFERENCES enseignants(id) ON DELETE SET NULL,
  FOREIGN KEY (personnel_id) REFERENCES personnel_administratif(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Paramètres et historique de connexion
-- ---------------------------------------------------------

-- Réglages académiques : informatifs pour l'instant (affichés dans
-- l'application), ne pilotent pas encore les calculs de Notes/Bulletins
-- (qui restent sur 3 trimestres de 2 séquences, /20 — voir api/_aide.php).
CREATE TABLE parametres_academiques (
  id TINYINT PRIMARY KEY DEFAULT 1,
  systeme_evaluation VARCHAR(20) NOT NULL DEFAULT 'Sur 20',
  moyenne_passage DECIMAL(4,2) NOT NULL DEFAULT 10.00,
  nombre_trimestres TINYINT NOT NULL DEFAULT 3,
  afficher_rangs TINYINT(1) NOT NULL DEFAULT 1,
  afficher_moyennes_ponderees TINYINT(1) NOT NULL DEFAULT 1,
  autoriser_decimales TINYINT(1) NOT NULL DEFAULT 1,
  arrondir_moyennes TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Réglages financiers : la devise et le mode de paiement par défaut
-- préremplissent réellement les formulaires de Paiements/Inscription ;
-- les pénalités de retard sont enregistrées mais pas encore appliquées
-- dans les calculs du module Finance.
CREATE TABLE parametres_financiers (
  id TINYINT PRIMARY KEY DEFAULT 1,
  devise_defaut VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  mode_paiement_defaut VARCHAR(30) NOT NULL DEFAULT 'Espèces',
  penalites_retard_actif TINYINT(1) NOT NULL DEFAULT 0,
  taux_penalite DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historique de connexion : une ligne par connexion, complétée à la
-- déconnexion. Remplace la liste factice de « sessions actives »
-- affichée jusqu'ici dans profil.html.
CREATE TABLE connexions_historique (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NOT NULL,
  adresse_ip VARCHAR(45) DEFAULT NULL,
  navigateur VARCHAR(255) DEFAULT NULL,
  connecte_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deconnecte_le DATETIME DEFAULT NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Vie scolaire : absences, retards, justifications
-- Toujours rattachées à inscription_id (jamais eleve_id directement),
-- comme le module Finance. Absences et retards partagent la même table
-- (discriminée par `type`) : mêmes champs, même workflow de
-- justification, même historique d'assiduité.
-- ---------------------------------------------------------

-- Un justificatif peut couvrir plusieurs absences/retards à la fois
-- (ex. un seul certificat médical pour une semaine d'absence).
CREATE TABLE justifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE absences (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Vie scolaire des enseignants : absences, retards, justifications.
-- Structure identique à celle des élèves ci-dessus, mais volontairement
-- séparée (tables et écrans distincts) : un enseignant n'est pas un élève,
-- il n'a pas d'inscription, et son suivi relève de la direction/RH plutôt
-- que du professeur principal d'une classe.
-- ---------------------------------------------------------
CREATE TABLE justifications_enseignants (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE absences_enseignants (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Notifications diffusées (visibles par tous les comptes)
-- ---------------------------------------------------------
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  icone VARCHAR(10) NOT NULL DEFAULT '🔔',
  auteur_id INT DEFAULT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lecture par utilisateur : une notification est diffusée à tout le monde,
-- chaque compte garde sa propre marque « lue ».
CREATE TABLE notifications_lues (
  notification_id INT NOT NULL,
  utilisateur_id INT NOT NULL,
  lue_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, utilisateur_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Communication : SMS / e-mail vers élèves, parents, enseignants,
-- personnel — modèles réutilisables, historique et statut par
-- destinataire. Voir api/communications.php et api/modeles_messages.php.
-- ---------------------------------------------------------
CREATE TABLE modeles_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(80) NOT NULL,
  canal ENUM('sms','email','sms_email','whatsapp') NOT NULL DEFAULT 'sms_email',
  sujet VARCHAR(150) DEFAULT NULL,
  contenu TEXT NOT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un envoi (ou un brouillon) vers une sélection de destinataires
-- (individuel, une classe, ou toute une catégorie). Les critères de
-- sélection restent posés sur la ligne pour garder l'historique exact.
CREATE TABLE communications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Destinataires résolus au moment de l'envoi (nom/contact copiés ici pour
-- que l'historique reste lisible même si la fiche source change ensuite),
-- avec le statut d'envoi par canal. individu_id n'a pas de clé étrangère :
-- sa table dépend de `categorie` (eleves, enseignants ou
-- personnel_administratif).
CREATE TABLE communications_destinataires (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Établissement (fiche unique, modifiable depuis « Mon compte »)
-- ---------------------------------------------------------
CREATE TABLE etablissement (
  id TINYINT PRIMARY KEY DEFAULT 1,
  nom VARCHAR(150) NOT NULL,
  adresse VARCHAR(200) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  email VARCHAR(120) NOT NULL,
  delegation_regionale VARCHAR(150) DEFAULT NULL,
  delegation_regionale_en VARCHAR(150) DEFAULT NULL,
  delegation_departementale VARCHAR(150) DEFAULT NULL,
  delegation_departementale_en VARCHAR(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Données de référence (seed)
-- =========================================================
INSERT INTO annees_scolaires (libelle, date_debut, date_fin, statut) VALUES
  ('2026-2027', '2026-09-01', '2027-07-15', 'active'),
  ('2025-2026', '2025-09-01', '2026-07-15', 'cloturee'),
  ('2024-2025', '2024-09-01', '2025-07-15', 'cloturee');

INSERT INTO niveaux (code, nom, cycle, ordre) VALUES
  ('6e',   'Sixième',   'college', 1),
  ('5e',   'Cinquième', 'college', 2),
  ('4e',   'Quatrième', 'college', 3),
  ('3e',   'Troisième', 'college', 4),
  ('2nde', 'Seconde',   'lycee',   5),
  ('1ère', 'Première',  'lycee',   6),
  ('Tle',  'Terminale', 'lycee',   7);

-- Compte administrateur de démonstration : admin@lyceeclassic.edu / lycee2026
-- (mot de passe haché avec password_hash() de PHP — à changer une fois en production).
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role, statut) VALUES
  ('Kapche', 'Josepha', 'admin@lyceeclassic.edu',
   '$2y$10$i5aRc9Gr3EgAHfs4rNK/3OuaFJ4DNcI4uMzJZLRz8Jcr.jSddWiXW',
   'administrateur', 'actif');

INSERT INTO notifications (titre, message, icone, auteur_id) VALUES
  ('Bienvenue sur SCOLARIS', 'Le centre de notifications est prêt : vous pouvez désormais en diffuser à tout le personnel.', '🔔', 1);

INSERT INTO etablissement (id, nom, adresse, telephone, email, delegation_regionale, delegation_regionale_en, delegation_departementale, delegation_departementale_en) VALUES
  (1, 'SCOLARIS', 'Mobile omnisport, Yaoundé', '+237 6 95 46 77 33', 'contact@lyceeclassic.edu',
   'Délégation Régionale du Centre', 'Centre Regional Delegation',
   'Délégation Départementale du Mfoundi', 'Mfoundi Divisional Delegation');

INSERT INTO parametres_academiques (id) VALUES (1);
INSERT INTO parametres_financiers (id) VALUES (1);

INSERT INTO types_frais (code, nom, categorie, montant_defaut) VALUES
  ('inscription', 'Frais d\'inscription', 'obligatoire', NULL),
  ('scolarite',   'Frais de scolarité',   'obligatoire', NULL),
  ('cantine',     'Cantine',              'optionnel',   60000),
  ('transport',   'Transport',            'optionnel',   75000),
  ('tenue',       'Tenue scolaire',       'optionnel',   15000);

INSERT INTO categories_depenses (nom) VALUES
  ('Salaires'), ('Fournitures scolaires'), ('Entretien et maintenance'),
  ('Électricité et eau'), ('Transport et carburant'), ('Autres charges');

INSERT INTO modeles_messages (titre, canal, sujet, contenu) VALUES
  ('Rappel de paiement', 'sms_email', 'Rappel : solde de scolarité',
   'Bonjour, nous vous rappelons qu''un solde reste dû sur les frais de scolarité. Merci de régulariser votre situation auprès du secrétariat dans les meilleurs délais.'),
  ('Convocation réunion parents', 'sms_email', 'Convocation - Réunion parents-professeurs',
   'Bonjour, vous êtes convié(e) à la réunion parents-professeurs. Votre présence est vivement souhaitée. Merci de confirmer votre disponibilité auprès du secrétariat.'),
  ('Fermeture exceptionnelle', 'sms_email', 'Information - Fermeture de l''établissement',
   'Bonjour, nous vous informons que l''établissement sera exceptionnellement fermé. Merci de votre compréhension.');

SET FOREIGN_KEY_CHECKS=1;
