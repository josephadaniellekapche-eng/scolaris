/* =========================================================
   SCOLARIS — Module Paiements
   Recherche d'un élève pour encaisser un versement (partiel ou total,
   ciblé sur un frais ou global), et historique de tous les paiements
   déjà enregistrés. Ne duplique jamais l'identité de l'élève : tout
   passe par inscription_id (voir php/paiements.php, php/_aide.php).
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
function argent(n){
  return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

let inscriptions = [];
let paiements = [];

/* =========================================================
   1. CHARGEMENT INITIAL
   ========================================================= */
async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const classes = (await reponse.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('filtreClasse').innerHTML = '<option value="">Toutes les classes</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
}

async function chargerInscriptions(){
  const reponse = await fetch('php/inscriptions.php');
  inscriptions = (await reponse.json()).filter(i => i.statut === 'validee');
  $('rechercheEleve').innerHTML = '<option value="">Choisir un élève…</option>' +
    inscriptions
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .map(i => `<option value="${i.id}">${echapperHTML(i.nom)} ${echapperHTML(i.prenom)} — ${echapperHTML(i.classe_nom)} (${echapperHTML(i.matricule)})</option>`)
      .join('');
}

/* =========================================================
   2. FORMULAIRE D'ENCAISSEMENT
   ========================================================= */
$('btnNouveauPaiement').addEventListener('click', () => {
  $('carteNouveauPaiement').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('btnAnnulerNouveauPaiement').addEventListener('click', () => {
  $('carteNouveauPaiement').hidden = true;
});

$('rechercheEleve').addEventListener('change', async () => {
  const inscriptionId = $('rechercheEleve').value;
  if (!inscriptionId) {
    $('npFrais').innerHTML = '<option value="">Choisissez d\'abord un élève</option>';
    return;
  }
  const reponse = await fetch(`php/inscription_frais.php?inscription_id=${inscriptionId}`);
  const detail = await reponse.json();
  const fraisRestants = detail.frais.filter(f => f.solde > 0);
  $('npFrais').innerHTML = '<option value="">Versement global (réparti automatiquement)</option>' +
    fraisRestants.map(f => `<option value="${f.id}">${echapperHTML(f.nom)} — reste ${argent(f.solde)}</option>`).join('');
  // Présélectionne le frais impayé le plus prioritaire plutôt que « Versement
  // global » (voir eleves.js, même logique) — reste choisissable manuellement.
  if (fraisRestants.length) $('npFrais').selectedIndex = 1;
});

$('btnEnregistrerPaiement').addEventListener('click', async () => {
  const inscriptionId = $('rechercheEleve').value;
  const montant = Number($('npMontant').value || 0);
  if (!inscriptionId) { notifier('Choisissez un élève.'); return; }
  if (montant <= 0) { notifier('Le montant doit être positif.'); return; }

  try {
    const reponse = await fetch('php/paiements.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscription_id: inscriptionId,
        inscription_frais_id: $('npFrais').value || null,
        montant,
        mode_paiement: $('npMode').value,
        reference: $('npReference').value.trim()
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    notifier(`Paiement enregistré — reçu ${resultat.numero_recu}.`);
    $('carteNouveauPaiement').hidden = true;
    $('rechercheEleve').value = '';
    $('npFrais').innerHTML = '<option value="">Choisissez d\'abord un élève</option>';
    $('npMontant').value = '';
    $('npReference').value = '';
    await chargerListe();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   3. LISTE / HISTORIQUE
   ========================================================= */
function ligneHTML(p){
  return `
    <tr>
      <td>${dateFr(p.date_paiement)}</td>
      <td>
        <div class="identite">
          <span class="avatar">${(p.eleve_prenom[0] || '') + (p.eleve_nom[0] || '')}</span>
          <div><b>${echapperHTML(p.eleve_prenom)} ${echapperHTML(p.eleve_nom)}</b><small>${echapperHTML(p.matricule)}</small></div>
        </div>
      </td>
      <td>${echapperHTML(p.classe_nom)}</td>
      <td>${p.frais_nom ? echapperHTML(p.frais_nom) : 'Versement global'}</td>
      <td>${echapperHTML(p.mode_paiement)}</td>
      <td>${echapperHTML(p.reference || '—')}</td>
      <td class="fin-centre">${p.numero_recu ? `<a href="recu.html?numero=${encodeURIComponent(p.numero_recu)}" class="lien-recu">${p.numero_recu}</a>` : '—'}</td>
      <td class="fin"><b>${argent(p.montant)}</b></td>
    </tr>`;
}

async function chargerListe(){
  const parametres = new URLSearchParams();
  if ($('filtreClasse').value) parametres.set('classe_id', $('filtreClasse').value);
  if ($('filtreDu').value) parametres.set('du', $('filtreDu').value);
  if ($('filtreAu').value) parametres.set('au', $('filtreAu').value);

  const reponse = await fetch(`php/paiements.php?${parametres.toString()}`);
  paiements = await reponse.json();
  afficherListe();
}

function afficherListe(){
  const texte = $('filtreRecherche').value.trim().toLowerCase();
  const visibles = paiements.filter(p => !texte
    || `${p.eleve_nom} ${p.eleve_prenom} ${p.matricule}`.toLowerCase().includes(texte));

  $('corpsPaiements').innerHTML = visibles.length
    ? visibles.map(ligneHTML).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--texte-doux);padding:26px">Aucun paiement trouvé.</td></tr>';

  $('kpiNombre').textContent = visibles.length;
  $('kpiTotal').textContent  = argent(visibles.reduce((s, p) => s + p.montant, 0));
  $('compteResultats').textContent = `${visibles.length} paiement${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''}.`;
}

$('filtreClasse').addEventListener('change', chargerListe);
$('filtreDu').addEventListener('change', chargerListe);
$('filtreAu').addEventListener('change', chargerListe);
$('filtreRecherche').addEventListener('input', afficherListe);

/* =========================================================
   4. MENU LATÉRAL
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
  lien.addEventListener('click', fermerMenu);
});

document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

/* =========================================================
   5. DÉMARRAGE
   ========================================================= */
Promise.all([chargerClasses(), chargerInscriptions()]).then(chargerListe);

});
