/* =========================================================
   SCOLARIS — Dépenses de l'établissement
   Flux indépendant des élèves (php/depenses.php, php/categories_depenses.php).
   La saisie/annulation est réservée à administrateur/comptable ; la
   direction peut consulter (voir la matrice de permissions du module).
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

function utilisateurConnecte(){
  try { return JSON.parse(sessionStorage.getItem('lyceeclassic.utilisateur') || '{}'); }
  catch (erreur) { return {}; }
}
const peutSaisir = ['administrateur', 'comptable'].includes(utilisateurConnecte().role);
if (!peutSaisir) $('btnNouvelleDepense').hidden = true;

/* =========================================================
   1. RÉFÉRENCES
   ========================================================= */
async function chargerCategories(){
  const reponse = await fetch('php/categories_depenses.php');
  const categories = await reponse.json();
  $('ndCategorie').innerHTML = categories.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
  $('filtreCategorie').innerHTML = '<option value="">Toutes les catégories</option>' +
    categories.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
}

/* =========================================================
   2. FORMULAIRE
   ========================================================= */
$('btnNouvelleDepense').addEventListener('click', () => {
  $('carteNouvelleDepense').hidden = false;
  $('ndDate').value = new Date().toISOString().slice(0, 10);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('btnAnnulerNouvelleDepense').addEventListener('click', () => { $('carteNouvelleDepense').hidden = true; });

$('btnEnregistrerDepense').addEventListener('click', async () => {
  const montant = Number($('ndMontant').value || 0);
  const libelle = $('ndLibelle').value.trim();
  if (!libelle) { notifier('Le libellé est obligatoire.'); return; }
  if (montant <= 0) { notifier('Le montant doit être positif.'); return; }

  try {
    const reponse = await fetch('php/depenses.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorie_id: $('ndCategorie').value,
        libelle,
        montant,
        date_depense: $('ndDate').value || null,
        beneficiaire: $('ndBeneficiaire').value.trim(),
        mode_paiement: $('ndMode').value,
        reference: $('ndReference').value.trim()
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    notifier('Dépense enregistrée.');
    $('carteNouvelleDepense').hidden = true;
    $('ndLibelle').value = '';
    $('ndMontant').value = '';
    $('ndBeneficiaire').value = '';
    $('ndReference').value = '';
    await chargerListe();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   3. LISTE
   ========================================================= */
function ligneHTML(d){
  return `
    <tr>
      <td>${dateFr(d.date_depense)}</td>
      <td>${echapperHTML(d.categorie_nom)}</td>
      <td>${echapperHTML(d.libelle)}</td>
      <td>${echapperHTML(d.beneficiaire || '—')}</td>
      <td>${echapperHTML(d.mode_paiement)}</td>
      <td class="fin-centre"><b>${argent(d.montant)}</b></td>
      <td class="fin">${peutSaisir ? `<button type="button" class="action" data-id="${d.id}">Annuler</button>` : '—'}</td>
    </tr>`;
}

async function chargerListe(){
  const parametres = new URLSearchParams();
  if ($('filtreCategorie').value) parametres.set('categorie_id', $('filtreCategorie').value);
  if ($('filtreDu').value) parametres.set('du', $('filtreDu').value);
  if ($('filtreAu').value) parametres.set('au', $('filtreAu').value);

  const reponse = await fetch(`php/depenses.php?${parametres.toString()}`);
  const depenses = await reponse.json();

  $('corpsDepenses').innerHTML = depenses.length
    ? depenses.map(ligneHTML).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune dépense enregistrée.</td></tr>';

  $('kpiNombre').textContent = depenses.length;
  $('kpiTotal').textContent  = argent(depenses.reduce((s, d) => s + d.montant, 0));
  $('compteResultats').textContent = `${depenses.length} dépense${depenses.length > 1 ? 's' : ''}.`;
}

$('corpsDepenses').addEventListener('click', async (evenement) => {
  const bouton = evenement.target.closest('button[data-id]');
  if (!bouton) return;
  if (!confirm('Annuler cette dépense ?')) return;

  try {
    const reponse = await fetch(`php/depenses.php?id=${bouton.dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'annuler' })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'annulation.');
    notifier('Dépense annulée.');
    await chargerListe();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

$('filtreCategorie').addEventListener('change', chargerListe);
$('filtreDu').addEventListener('change', chargerListe);
$('filtreAu').addEventListener('change', chargerListe);

/* Menu latéral */
const rail = $('rail'), voile = $('voile');
$('burger').addEventListener('click', () => { rail.classList.add('ouvert'); voile.classList.add('visible'); });
voile.addEventListener('click', () => { rail.classList.remove('ouvert'); voile.classList.remove('visible'); });
document.querySelectorAll('.menu-lien.deroulant').forEach(entete => {
  entete.addEventListener('click', () => {
    const groupe = $(entete.dataset.groupe);
    const ouvert = groupe.classList.contains('ouvert');
    document.querySelectorAll('.groupe').forEach(g => g.classList.remove('ouvert'));
    if (!ouvert) groupe.classList.add('ouvert');
  });
});
document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

Promise.all([chargerCategories()]).then(chargerListe);

});
