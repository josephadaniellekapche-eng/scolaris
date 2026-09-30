/* =========================================================
   SCOLARIS — Module Inscriptions
   Calcul des frais, validation, certificat d'inscription
   ========================================================= */

/* Garde d'accès (démonstration) */
if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

/* =========================================================
   1. CLASSES ET ANNÉES SCOLAIRES
   Chargées depuis la base de données (php/classes.php et
   php/annees_scolaires.php) plutôt que codées en dur.
   ========================================================= */
const classes = {};

async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const liste = await reponse.json();

  const groupeCollege = document.querySelector('#classe optgroup:nth-of-type(1)');
  const groupeLycee   = document.querySelector('#classe optgroup:nth-of-type(2)');
  groupeCollege.innerHTML = '';
  groupeLycee.innerHTML = '';

  liste.forEach(c => {
    classes[c.id] = {
      nom: c.nom,
      inscription: c.frais_inscription,
      scolarite: c.frais_scolarite,
      capacite: c.capacite,
      inscrits: c.inscrits
    };
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.nom;
    (c.cycle === 'college' ? groupeCollege : groupeLycee).appendChild(option);
  });
}

async function chargerAnneesScolaires(){
  const reponse = await fetch('php/annees_scolaires.php');
  const liste = await reponse.json();
  document.getElementById('annee').innerHTML = liste.map(a =>
    `<option value="${a.id}" ${a.statut === 'active' ? 'selected' : ''}>${a.libelle}</option>`
  ).join('');
}

/* =========================================================
   2. RÉFÉRENCES
   ========================================================= */
const formulaire  = document.getElementById('formInscription');
const selClasse   = document.getElementById('classe');
const selReduc    = document.getElementById('reduction');
const listeFrais  = document.getElementById('fraisObligatoires');
const optionsCoch = document.querySelectorAll('#optionsFrais input');
const zonePlaces  = document.getElementById('places');
const montantTot  = document.getElementById('montantTotal');
const detailTot   = document.getElementById('detailTotal');
const rappelInsc  = document.getElementById('rappelInscription');
const champVerse  = document.getElementById('verse');
const fenetre     = document.getElementById('fenetreCertificat');
const toast       = document.getElementById('toast');
const toastTexte  = document.getElementById('toastTexte');

/* =========================================================
   3. OUTILS
   ========================================================= */
/* Échappe le texte saisi librement (père, mère...) avant de l'insérer
   via innerHTML, pour empêcher toute injection de balises. */
function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

function argent(montant){
  return montant.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

function dateFrancaise(valeur){
  if (!valeur) return '—';
  const [a, m, j] = valeur.split('-');
  return `${j}/${m}/${a}`;
}

function aujourdhui(){
  return new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

let minuterie;
function notifier(texte){
  toastTexte.textContent = texte;
  toast.classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/* =========================================================
   4. CALCUL DES FRAIS
   ========================================================= */
/* Montant total retenu lors du dernier calcul, réutilisé à l'enregistrement
   (le texte affiché à l'écran est formaté et ne peut pas être reconverti en nombre). */
let dernierTotal = 0;

function calculer(){
  const cle = selClasse.value;

  /* --- Aucune classe choisie --- */
  if (!cle){
    listeFrais.innerHTML = '<li class="attente">Choisissez d\'abord une classe pour afficher les frais.</li>';
    zonePlaces.textContent = '';
    zonePlaces.classList.remove('complet');
    montantTot.textContent = '0 FCFA';
    detailTot.textContent = '';
    rappelInsc.textContent = '—';
    champVerse.max = 0;
    dernierTotal = 0;
    return;
  }

  const c = classes[cle];

  /* --- Frais obligatoires --- */
  listeFrais.innerHTML = `
    <li>Frais d'inscription <b>${argent(c.inscription)}</b></li>
    <li>Scolarité annuelle <b>${argent(c.scolarite)}</b></li>
  `;

  /* --- Places disponibles --- */
  const restantes = c.capacite - c.inscrits;
  if (restantes <= 0){
    zonePlaces.textContent = `Classe complète : ${c.inscrits} inscrits sur ${c.capacite} places.`;
    zonePlaces.classList.add('complet');
  } else {
    zonePlaces.innerHTML = `Places disponibles : <b>${restantes}</b> sur ${c.capacite}.`;
    zonePlaces.classList.remove('complet');
  }

  /* --- Options cochées --- */
  let options = 0;
  const libelles = [];
  optionsCoch.forEach(o => {
    if (o.checked){
      options += Number(o.dataset.montant);
      libelles.push(o.dataset.libelle);
    }
  });

  /* --- Réduction (appliquée sur la scolarité uniquement) --- */
  const taux = Number(selReduc.value);
  const remise = Math.round(c.scolarite * taux / 100);

  const total = c.inscription + c.scolarite + options - remise;
  dernierTotal = total;

  montantTot.textContent = argent(total);

  let detail = `Inscription ${argent(c.inscription)} + scolarité ${argent(c.scolarite)}`;
  if (options) detail += ` + options ${argent(options)} (${libelles.join(', ')})`;
  if (remise)  detail += ` − réduction ${argent(remise)}`;
  detailTot.textContent = detail;

  /* --- Rappel dans la section paiement --- */
  rappelInsc.textContent = argent(c.inscription);
  champVerse.max = c.inscription;
}

selClasse.addEventListener('change', calculer);
selReduc.addEventListener('change', calculer);
optionsCoch.forEach(o => o.addEventListener('change', calculer));

/* Le montant versé ne peut dépasser les frais d'inscription */
champVerse.addEventListener('input', () => {
  const cle = selClasse.value;
  if (!cle) return;
  const maximum = classes[cle].inscription;
  if (Number(champVerse.value) > maximum){
    champVerse.value = maximum;
    notifier('Le versement ne peut dépasser les frais d\'inscription.');
  }
});

/* =========================================================
   5. VALIDATION
   ========================================================= */
const obligatoires = ['nom', 'prenom', 'naissance', 'tuteur', 'contact', 'classe'];

function valider(){
  let premierFautif = null;

  obligatoires.forEach(id => {
    const champ = document.getElementById(id);
    const vide  = !champ.value.trim();
    champ.classList.toggle('invalide', vide);
    if (vide && !premierFautif) premierFautif = champ;
  });

  if (premierFautif){
    premierFautif.focus();
    premierFautif.scrollIntoView({ behavior: 'smooth', block: 'center' });
    notifier('Certains champs obligatoires sont vides.');
    return false;
  }
  return true;
}

/* Retirer le signalement dès que l'utilisateur corrige */
obligatoires.forEach(id => {
  document.getElementById(id).addEventListener('input', function(){
    this.classList.remove('invalide');
  });
});

/* =========================================================
   6. ENREGISTREMENT ET CERTIFICAT
   ========================================================= */
formulaire.addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  if (!valider()) return;

  const c = classes[selClasse.value];
  const boutonEnregistrer = document.getElementById('btnEnregistrer');

  const dossier = {
    nom:                document.getElementById('nom').value.trim().toUpperCase(),
    prenom:             document.getElementById('prenom').value.trim(),
    date_naissance:     document.getElementById('naissance').value,
    lieu_naissance:     document.getElementById('lieu').value.trim(),
    sexe:               document.getElementById('sexe').value === 'Masculin' ? 'M' : 'F',
    pere:               document.getElementById('pere').value.trim(),
    mere:               document.getElementById('mere').value.trim(),
    tuteur:             document.getElementById('tuteur').value.trim(),
    contact:            document.getElementById('contact').value.trim(),
    email:              document.getElementById('email').value.trim(),
    adresse:            document.getElementById('adresse').value.trim(),
    origine:            document.getElementById('origine').value.trim(),
    annee_scolaire_id:  document.getElementById('annee').value,
    classe_id:          selClasse.value,
    type:               document.getElementById('statut').value,
    reduction_pourcentage: Number(selReduc.value || 0),
    motif_reduction:    document.getElementById('motifReduction').value.trim(),
    frais_optionnels:   [...optionsCoch].filter(o => o.checked).map(o => ({
      code:    o.dataset.code,
      montant: Number(o.dataset.montant)
    })),
    montant_verse:      Number(champVerse.value || 0),
    mode_paiement:      document.getElementById('mode').value,
    reference_paiement: document.getElementById('reference').value.trim(),
    observation:        document.getElementById('observation').value.trim()
  };

  boutonEnregistrer.disabled = true;

  try {
    const reponse = await fetch('php/inscriptions.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dossier)
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'inscription.');

    /* Champs propres à l'affichage du certificat, pas envoyés à l'API */
    const dossierAffichage = {
      ...dossier,
      matricule: resultat.matricule,
      naissance: dossier.date_naissance,
      lieu:      dossier.lieu_naissance,
      sexe:      document.getElementById('sexe').value,
      annee:     document.getElementById('annee').selectedOptions[0].textContent,
      verse:     dossier.montant_verse,
      mode:      dossier.mode_paiement,
      reference: dossier.reference_paiement
    };

    remplirCertificat(dossierAffichage, c);

    const lienRecu = document.getElementById('lienRecu');
    if (resultat.numero_recu) {
      lienRecu.href = `recu.html?numero=${encodeURIComponent(resultat.numero_recu)}`;
      lienRecu.hidden = false;
    } else {
      lienRecu.hidden = true;
    }

    fenetre.classList.add('visible');
    notifier(`Inscription de ${dossier.prenom} ${dossier.nom} enregistrée.`);
    await chargerClasses();
  } catch (erreur) {
    notifier(erreur.message);
  } finally {
    boutonEnregistrer.disabled = false;
  }
});

function remplirCertificat(d, c){
  const annee = d.annee.replace('-', ' / ');

  document.getElementById('certAnnee').textContent  = annee;
  document.getElementById('certAnnee2').textContent = annee;
  document.getElementById('certEleve').textContent  = `${d.nom} ${d.prenom}`;
  document.getElementById('certNaissance').textContent = dateFrancaise(d.naissance);
  document.getElementById('certLieu').textContent   = d.lieu || '……………………';
  document.getElementById('certClasse').textContent = c.nom;
  document.getElementById('certDate').textContent   = aujourdhui();
  document.getElementById('certNumero').textContent = d.matricule;
  document.getElementById('certFait').textContent   = `Fait à Yaoundé, le ${aujourdhui()}`;

  const lien = d.sexe === 'Masculin' ? 'Fils' : 'Fille';
  const pere = d.pere ? echapperHTML(d.pere) : '……………………';
  const mere = d.mere ? echapperHTML(d.mere) : '……………………';
  document.getElementById('certFiliation').innerHTML =
    `${lien} de <b>${pere}</b> et de <b>${mere}</b>,`;

  document.getElementById('certPaiement').textContent = d.verse > 0
    ? `Versement de ${argent(d.verse)} par ${d.mode.toLowerCase()}${d.reference ? ' — réf. ' + d.reference : ''}`
    : 'Aucun versement à la date d\'inscription';
}

/* =========================================================
   7. ACTIONS DE LA FENÊTRE
   ========================================================= */
document.getElementById('fermerCertificat').addEventListener('click', fermerFenetre);
document.getElementById('btnImprimer').addEventListener('click', () => window.print());

document.getElementById('btnNouveau').addEventListener('click', () => {
  fermerFenetre();
  viderFormulaire();
});

fenetre.addEventListener('click', (e) => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerFenetre(); });

function fermerFenetre(){ fenetre.classList.remove('visible'); }

/* =========================================================
   8. VIDER LE FORMULAIRE
   ========================================================= */
document.getElementById('btnVider').addEventListener('click', viderFormulaire);

function viderFormulaire(){
  formulaire.reset();
  document.querySelectorAll('.invalide').forEach(c => c.classList.remove('invalide'));
  calculer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   9. MENU LATÉRAL
   ========================================================= */
const rail  = document.getElementById('rail');
const voile = document.getElementById('voile');

document.getElementById('burger').addEventListener('click', () => {
  rail.classList.add('ouvert');
  voile.classList.add('visible');
});
voile.addEventListener('click', fermerMenu);
function fermerMenu(){
  rail.classList.remove('ouvert');
  voile.classList.remove('visible');
}

document.querySelectorAll('.menu-lien:not(.deroulant)').forEach(lien => {
  lien.addEventListener('click', () => {
    if (lien.tagName === 'A') return;
    notifier(`Le module « ${lien.querySelector('.texte').textContent.trim()} » reste à développer.`);
    fermerMenu();
  });
});

document.querySelectorAll('.menu-lien.deroulant').forEach(entete => {
  entete.addEventListener('click', () => {
    const groupe = document.getElementById(entete.dataset.groupe);
    const ouvert = groupe.classList.contains('ouvert');
    document.querySelectorAll('.groupe').forEach(g => g.classList.remove('ouvert'));
    if (!ouvert) groupe.classList.add('ouvert');
  });
});

document.querySelectorAll('.sous-lien').forEach(lien => {
  lien.addEventListener('click', () => {
    if (lien.tagName === 'A') { fermerMenu(); return; }
    notifier(`Le module « ${lien.textContent.trim()} » reste à développer.`);
    fermerMenu();
  });
});

document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

/* =========================================================
   10. DÉMARRAGE
   ========================================================= */
Promise.all([chargerClasses(), chargerAnneesScolaires()]).then(calculer);

});
