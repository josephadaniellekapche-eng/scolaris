/* =========================================================
   SCOLARIS — Module Administratif : Personnel administratif
   Répertoire du personnel non-enseignant (secrétariat, comptabilité,
   surveillance…), distinct des enseignants (voir php/personnel_administratif.php).
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
function dateFr(iso){
  if (!iso) return '—';
  const [a, m, j] = iso.split(/[- ]/);
  return `${j}/${m}/${a}`;
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

let personnel = [];
let utilisateursLies = new Set();

/* =========================================================
   1. CHARGEMENT
   ========================================================= */
async function chargerPersonnel(){
  const [reponsePersonnel, reponseUtilisateurs] = await Promise.all([
    fetch('php/personnel_administratif.php'),
    fetch('php/utilisateurs.php').catch(() => null)
  ]);
  personnel = await reponsePersonnel.json();

  utilisateursLies = new Set();
  if (reponseUtilisateurs && reponseUtilisateurs.ok) {
    const utilisateurs = await reponseUtilisateurs.json();
    utilisateurs.forEach(u => { if (u.personnel_id) utilisateursLies.add(u.personnel_id); });
  }

  rafraichirListeFonctions();
  afficherListe();
  majIndicateurs();
}

function rafraichirListeFonctions(){
  const fonctions = [...new Set(personnel.map(p => p.fonction))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('listeFonctions').innerHTML = fonctions.map(f => `<option value="${echapperHTML(f)}"></option>`).join('');
  $('filtreFonction').innerHTML = '<option value="">Toutes les fonctions</option>' +
    fonctions.map(f => `<option value="${echapperHTML(f)}">${echapperHTML(f)}</option>`).join('');
}

/* =========================================================
   2. LISTE
   ========================================================= */
function afficherListe(){
  const texte    = $('filtreNom').value.trim().toLowerCase();
  const fonction = $('filtreFonction').value;
  const statut   = $('filtreStatut').value;

  const visibles = personnel.filter(p => {
    if (texte && !`${p.nom} ${p.prenom} ${p.matricule} ${p.fonction}`.toLowerCase().includes(texte)) return false;
    if (fonction && p.fonction !== fonction) return false;
    if (statut && p.statut !== statut) return false;
    return true;
  });

  $('corpsPersonnel').innerHTML = visibles.map(p => `
    <tr>
      <td>${echapperHTML(p.matricule)}</td>
      <td>
        <div class="identite">
          <span class="avatar">${(p.prenom[0] || '') + (p.nom[0] || '')}</span>
          <div><b>${echapperHTML(p.civilite)} ${echapperHTML(p.nom)} ${echapperHTML(p.prenom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(p.fonction)}</td>
      <td>${p.telephone ? echapperHTML(p.telephone) : '—'}</td>
      <td>${dateFr(p.date_embauche)}</td>
      <td><span class="statut ${p.statut === 'Actif' ? 'validee' : 'incomplet'}">${p.statut}</span></td>
      <td class="fin">
        <button type="button" class="action" data-modifier="${p.id}">Modifier</button>
        <button type="button" class="action" data-supprimer="${p.id}">Supprimer</button>
      </td>
    </tr>`).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
  $('compteResultats').textContent =
    `${visibles.length} agent${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''} sur ${personnel.length}.`;
}

function majIndicateurs(){
  const actifs    = personnel.filter(p => p.statut === 'Actif').length;
  const fonctions = new Set(personnel.map(p => p.fonction)).size;
  const sansCompte = personnel.filter(p => !utilisateursLies.has(p.id)).length;

  $('kpiTotal').textContent     = personnel.length;
  $('kpiActifs').textContent    = actifs;
  $('kpiFonctions').textContent = fonctions;
  $('kpiSansCompte').textContent = sansCompte;
  $('jaugeActifs').style.width  = (personnel.length ? Math.round(actifs / personnel.length * 100) : 0) + '%';
}

['filtreNom', 'filtreFonction', 'filtreStatut'].forEach(id => {
  $(id).addEventListener('input', afficherListe);
  $(id).addEventListener('change', afficherListe);
});
$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherListe();
});

/* =========================================================
   3. AJOUT / MODIFICATION
   ========================================================= */
const fenetre = $('fenetreAgent');
let idEnEdition = null;

$('btnNouveau').addEventListener('click', () => {
  idEnEdition = null;
  $('formAgent').reset();
  document.querySelectorAll('#formAgent .invalide').forEach(c => c.classList.remove('invalide'));
  $('champStatutAgent').hidden = true;
  $('titreFenetre').textContent = 'Ajouter un agent';
  $('btnValiderAgent').textContent = "Ajouter l'agent";
  fenetre.classList.add('visible');
  $('aNom').focus();
});

$('corpsPersonnel').addEventListener('click', async (evenement) => {
  const boutonModifier = evenement.target.closest('[data-modifier]');
  if (boutonModifier) {
    const p = personnel.find(x => x.id === Number(boutonModifier.dataset.modifier));
    if (!p) return;
    idEnEdition = p.id;

    $('formAgent').reset();
    document.querySelectorAll('#formAgent .invalide').forEach(c => c.classList.remove('invalide'));
    $('aCivilite').value = p.civilite;
    $('aSexe').value = p.sexe;
    $('aNom').value = p.nom;
    $('aPrenom').value = p.prenom;
    $('aFonction').value = p.fonction;
    $('aTelephone').value = p.telephone || '';
    $('aEmail').value = p.email || '';
    $('aDateEmbauche').value = p.date_embauche || '';
    $('aStatut').value = p.statut;
    $('champStatutAgent').hidden = false;

    $('titreFenetre').textContent = `Modifier ${p.prenom} ${p.nom}`;
    $('btnValiderAgent').textContent = 'Enregistrer les modifications';
    fenetre.classList.add('visible');
    $('aNom').focus();
    return;
  }

  const boutonSupprimer = evenement.target.closest('[data-supprimer]');
  if (boutonSupprimer) {
    const p = personnel.find(x => x.id === Number(boutonSupprimer.dataset.supprimer));
    if (!p) return;
    if (!confirm(`Supprimer définitivement l'agent « ${p.prenom} ${p.nom} » ?`)) return;

    const reponse = await fetch(`php/personnel_administratif.php?id=${p.id}`, { method: 'DELETE' });
    const resultat = await reponse.json();
    if (!reponse.ok) { notifier(resultat.erreur || 'Échec de la suppression.'); return; }

    await chargerPersonnel();
    notifier(`L'agent « ${p.prenom} ${p.nom} » a été supprimé.`);
  }
});

function fermerFenetre(){ fenetre.classList.remove('visible'); }
$('fermerFenetre').addEventListener('click', fermerFenetre);
$('annulerAgent').addEventListener('click', fermerFenetre);
fenetre.addEventListener('click', e => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetre.classList.contains('visible')) fermerFenetre();
});

$('formAgent').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();

  let premierFautif = null;
  [['aNom', $('aNom')], ['aPrenom', $('aPrenom')], ['aFonction', $('aFonction')]].forEach(([, champ]) => {
    const vide = !champ.value.trim();
    champ.classList.toggle('invalide', vide);
    if (vide && !premierFautif) premierFautif = champ;
  });
  if (premierFautif) {
    premierFautif.focus();
    notifier('Certains champs obligatoires sont vides.');
    return;
  }

  const valeurs = {
    civilite: $('aCivilite').value,
    sexe: $('aSexe').value,
    nom: $('aNom').value.trim(),
    prenom: $('aPrenom').value.trim(),
    fonction: $('aFonction').value.trim(),
    telephone: $('aTelephone').value.trim(),
    email: $('aEmail').value.trim(),
    date_embauche: $('aDateEmbauche').value || null,
  };
  if (idEnEdition) valeurs.statut = $('aStatut').value;

  const url     = idEnEdition ? `php/personnel_administratif.php?id=${idEnEdition}` : 'php/personnel_administratif.php';
  const methode = idEnEdition ? 'PUT' : 'POST';

  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valeurs)
  });
  const resultat = await reponse.json();
  if (!reponse.ok) { notifier(resultat.erreur || "Échec de l'enregistrement."); return; }

  fermerFenetre();
  await chargerPersonnel();
  notifier(idEnEdition ? 'Agent mis à jour.' : 'Agent ajouté.');
});

['aNom', 'aPrenom', 'aFonction'].forEach(id => {
  $(id).addEventListener('input', () => $(id).classList.remove('invalide'));
});

/* =========================================================
   4. EXPORT CSV
   ========================================================= */
function exporterCSV(nomFichier, entetes, lignes){
  const echapper = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenu = [entetes, ...lignes].map(l => l.map(echapper).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(lien.href);
}

$('btnExporter').addEventListener('click', () => {
  const lignes = personnel.map(p => [p.matricule, `${p.civilite} ${p.nom} ${p.prenom}`, p.fonction, p.telephone || '—', dateFr(p.date_embauche), p.statut]);
  exporterCSV(`personnel-administratif-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Matricule', 'Agent', 'Fonction', 'Téléphone', 'Embauche', 'Statut'], lignes);
  notifier(`${lignes.length} agents exportés.`);
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
chargerPersonnel();

});
