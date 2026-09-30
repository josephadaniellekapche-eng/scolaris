/* =========================================================
   SCOLARIS — Module Administratif : Utilisateurs & rôles
   Réservé à l'administrateur (voir php/utilisateurs.php). Un compte se
   rattache toujours à une fiche enseignant/personnel déjà existante —
   jamais de nom ressaisi ici.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}
function quandFr(iso){
  if (!iso) return 'Jamais';
  const date = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

const LIBELLES_ROLE = {
  administrateur: 'Administrateur', direction: 'Direction', secretaire: 'Secrétaire',
  enseignant: 'Enseignant', comptable: 'Comptable'
};

let utilisateurs = [];
let enseignants  = [];
let personnel    = [];

/* =========================================================
   1. CHARGEMENT
   ========================================================= */
async function chargerReferentiels(){
  const [reponseEns, reponsePers] = await Promise.all([
    fetch('php/enseignants.php'),
    fetch('php/personnel_administratif.php')
  ]);
  enseignants = (await reponseEns.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  personnel   = (await reponsePers.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  $('cEnseignant').innerHTML = '<option value="">Aucune (à rattacher plus tard)</option>' +
    enseignants.map(e => `<option value="${e.id}">${echapperHTML(e.civilite)} ${echapperHTML(e.nom)} ${echapperHTML(e.prenom)} (${echapperHTML(e.matricule)})</option>`).join('');
  $('cPersonnel').innerHTML = '<option value="">Aucune</option>' +
    personnel.map(p => `<option value="${p.id}">${echapperHTML(p.civilite)} ${echapperHTML(p.nom)} ${echapperHTML(p.prenom)} — ${echapperHTML(p.fonction)}</option>`).join('');
}

async function chargerUtilisateurs(){
  const reponse = await fetch('php/utilisateurs.php');
  if (!reponse.ok) {
    if (reponse.status === 403) {
      notifier('Accès réservé à l\'administrateur.');
      $('corpsUtilisateurs').innerHTML = '';
      $('messageVide').classList.add('visible');
      $('messageVide').textContent = 'Cette page est réservée aux comptes administrateur.';
    }
    return;
  }
  utilisateurs = await reponse.json();
  afficherListe();
  majIndicateurs();
}

/* =========================================================
   2. LISTE
   ========================================================= */
function rattachementAffiche(u){
  if (u.role === 'enseignant') {
    return u.enseignant_id ? `${echapperHTML(u.enseignant_nom)} ${echapperHTML(u.enseignant_prenom)} (Enseignants)` : '—';
  }
  return u.personnel_id ? `${echapperHTML(u.personnel_nom)} ${echapperHTML(u.personnel_prenom)} (${echapperHTML(u.personnel_fonction)})` : '—';
}

function afficherListe(){
  const texte  = $('filtreNom').value.trim().toLowerCase();
  const role   = $('filtreRole').value;
  const statut = $('filtreStatut').value;

  const visibles = utilisateurs.filter(u => {
    if (texte && !`${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(texte)) return false;
    if (role && u.role !== role) return false;
    if (statut && u.statut !== statut) return false;
    return true;
  });

  $('corpsUtilisateurs').innerHTML = visibles.map(u => `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${(u.prenom[0] || '') + (u.nom[0] || '')}</span>
          <div><b>${echapperHTML(u.prenom)} ${echapperHTML(u.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(u.email)}</td>
      <td>${LIBELLES_ROLE[u.role] || u.role}</td>
      <td>${rattachementAffiche(u)}</td>
      <td>${quandFr(u.derniere_connexion)}</td>
      <td><span class="statut ${u.statut === 'actif' ? 'validee' : 'incomplet'}">${u.statut === 'actif' ? 'Actif' : 'Désactivé'}</span></td>
      <td class="fin">
        <button type="button" class="action" data-modifier="${u.id}">Modifier</button>
        <button type="button" class="action" data-basculer="${u.id}">${u.statut === 'actif' ? 'Désactiver' : 'Réactiver'}</button>
      </td>
    </tr>`).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
  $('messageVide').textContent = 'Aucun utilisateur ne correspond à cette recherche.';
  $('compteResultats').textContent =
    `${visibles.length} compte${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''} sur ${utilisateurs.length}.`;
}

function majIndicateurs(){
  const actifs     = utilisateurs.filter(u => u.statut === 'actif').length;
  const desactives = utilisateurs.length - actifs;
  const admins     = utilisateurs.filter(u => u.role === 'administrateur').length;

  $('kpiTotal').textContent      = utilisateurs.length;
  $('kpiActifs').textContent     = actifs;
  $('kpiDesactives').textContent = desactives;
  $('kpiAdmins').textContent     = admins;
  $('jaugeActifs').style.width     = (utilisateurs.length ? Math.round(actifs / utilisateurs.length * 100) : 0) + '%';
  $('jaugeDesactives').style.width = (utilisateurs.length ? Math.round(desactives / utilisateurs.length * 100) : 0) + '%';
}

['filtreNom', 'filtreRole', 'filtreStatut'].forEach(id => {
  $(id).addEventListener('input', afficherListe);
  $(id).addEventListener('change', afficherListe);
});
$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherListe();
});

/* =========================================================
   3. FORMULAIRE : RÔLE → RATTACHEMENT DYNAMIQUE
   ========================================================= */
function appliquerVisibiliteRattachement(){
  const estEnseignant = $('cRole').value === 'enseignant';
  $('champEnseignant').hidden = !estEnseignant;
  $('champPersonnel').hidden  = estEnseignant;
}
$('cRole').addEventListener('change', appliquerVisibiliteRattachement);

/* =========================================================
   4. AJOUT / MODIFICATION
   ========================================================= */
const fenetre = $('fenetreCompte');
let idEnEdition = null;

$('btnNouveau').addEventListener('click', () => {
  idEnEdition = null;
  $('formCompte').reset();
  document.querySelectorAll('#formCompte .invalide').forEach(c => c.classList.remove('invalide'));
  $('cEmail').disabled = false;
  $('champMotDePasse').hidden = false;
  $('champStatutCompte').hidden = true;
  appliquerVisibiliteRattachement();
  $('titreFenetre').textContent = 'Nouveau compte';
  $('btnValiderCompte').textContent = 'Créer le compte';
  fenetre.classList.add('visible');
  $('cNom').focus();
});

$('corpsUtilisateurs').addEventListener('click', async (evenement) => {
  const boutonModifier = evenement.target.closest('[data-modifier]');
  if (boutonModifier) {
    const u = utilisateurs.find(x => x.id === Number(boutonModifier.dataset.modifier));
    if (!u) return;
    idEnEdition = u.id;

    $('formCompte').reset();
    document.querySelectorAll('#formCompte .invalide').forEach(c => c.classList.remove('invalide'));
    $('cNom').value = u.nom;
    $('cPrenom').value = u.prenom;
    $('cEmail').value = u.email;
    $('cEmail').disabled = true;
    $('champMotDePasse').hidden = true;
    $('cRole').value = u.role;
    $('champStatutCompte').hidden = false;
    $('cStatut').value = u.statut;
    appliquerVisibiliteRattachement();
    $('cEnseignant').value = u.enseignant_id || '';
    $('cPersonnel').value = u.personnel_id || '';

    $('titreFenetre').textContent = `Modifier ${u.prenom} ${u.nom}`;
    $('btnValiderCompte').textContent = 'Enregistrer les modifications';
    fenetre.classList.add('visible');
    return;
  }

  const boutonBasculer = evenement.target.closest('[data-basculer]');
  if (boutonBasculer) {
    const u = utilisateurs.find(x => x.id === Number(boutonBasculer.dataset.basculer));
    if (!u) return;
    const nouveauStatut = u.statut === 'actif' ? 'desactive' : 'actif';
    if (!confirm(`${nouveauStatut === 'actif' ? 'Réactiver' : 'Désactiver'} le compte de ${u.prenom} ${u.nom} ?`)) return;

    const reponse = await fetch(`php/utilisateurs.php?id=${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: u.role, statut: nouveauStatut, enseignant_id: u.enseignant_id, personnel_id: u.personnel_id })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) { notifier(resultat.erreur || 'Échec de la mise à jour.'); return; }

    await chargerUtilisateurs();
    notifier(`Compte ${nouveauStatut === 'actif' ? 'réactivé' : 'désactivé'}.`);
  }
});

function fermerFenetre(){ fenetre.classList.remove('visible'); }
$('fermerFenetre').addEventListener('click', fermerFenetre);
$('annulerCompte').addEventListener('click', fermerFenetre);
fenetre.addEventListener('click', e => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetre.classList.contains('visible')) fermerFenetre();
});

$('formCompte').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();

  const champsObligatoires = [$('cNom'), $('cPrenom'), $('cEmail')];
  if (!idEnEdition) champsObligatoires.push($('cMotDePasse'));

  let premierFautif = null;
  champsObligatoires.forEach(champ => {
    const vide = !champ.value.trim();
    champ.classList.toggle('invalide', vide);
    if (vide && !premierFautif) premierFautif = champ;
  });
  if (!idEnEdition && $('cMotDePasse').value && $('cMotDePasse').value.length < 6) {
    $('cMotDePasse').classList.add('invalide');
    premierFautif = premierFautif || $('cMotDePasse');
    notifier('Le mot de passe doit compter au moins 6 caractères.');
  }
  if (premierFautif) {
    premierFautif.focus();
    return;
  }

  const estEnseignant = $('cRole').value === 'enseignant';
  const valeurs = {
    nom: $('cNom').value.trim(),
    prenom: $('cPrenom').value.trim(),
    email: $('cEmail').value.trim(),
    role: $('cRole').value,
    enseignant_id: estEnseignant ? ($('cEnseignant').value || null) : null,
    personnel_id: !estEnseignant ? ($('cPersonnel').value || null) : null,
  };
  if (!idEnEdition) valeurs.mot_de_passe = $('cMotDePasse').value;
  else valeurs.statut = $('cStatut').value;

  const url     = idEnEdition ? `php/utilisateurs.php?id=${idEnEdition}` : 'php/utilisateurs.php';
  const methode = idEnEdition ? 'PUT' : 'POST';

  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valeurs)
  });
  const resultat = await reponse.json();
  if (!reponse.ok) { notifier(resultat.erreur || "Échec de l'enregistrement."); return; }

  fermerFenetre();
  await chargerUtilisateurs();
  notifier(idEnEdition ? 'Compte mis à jour.' : 'Compte créé.');
});

['cNom', 'cPrenom', 'cEmail', 'cMotDePasse'].forEach(id => {
  $(id).addEventListener('input', () => $(id).classList.remove('invalide'));
});

/* =========================================================
   5. MENU LATÉRAL
   ========================================================= */
const rail = $('rail'), voile = $('voile');
$('burger').addEventListener('click', () => { rail.classList.add('ouvert'); voile.classList.add('visible'); });
voile.addEventListener('click', fermerMenu);
function fermerMenu(){ rail.classList.remove('ouvert'); voile.classList.remove('visible'); }

document.querySelectorAll('.menu-lien.deroulant').forEach(entete => {
  entete.addEventListener('click', () => {
    const groupe = $(entete.dataset.groupe);
    const ouvert = groupe.classList.contains('ouvert');
    document.querySelectorAll('.groupe').forEach(g => g.classList.remove('ouvert'));
    if (!ouvert) groupe.classList.add('ouvert');
  });
});
document.querySelectorAll('.sous-lien, .menu-lien:not(.deroulant)').forEach(lien => {
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
   6. DÉMARRAGE
   ========================================================= */
Promise.all([chargerReferentiels(), chargerUtilisateurs()]);

});
