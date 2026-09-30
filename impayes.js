/* =========================================================
   SCOLARIS — Impayés
   Liste les élèves dont le solde (module Finance) reste positif,
   via php/rapports_financiers.php?vue=impayes. Lecture seule — pour
   encaisser, direction vers la fiche élève (module Élèves).
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
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}
function argent(n){
  return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const classes = (await reponse.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('filtreClasse').innerHTML = '<option value="">Toutes les classes</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
}

function ligneHTML(e){
  return `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${(e.prenom[0] || '') + (e.nom[0] || '')}</span>
          <div><b>${echapperHTML(e.prenom)} ${echapperHTML(e.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(e.matricule)}</td>
      <td>${echapperHTML(e.classe_nom)}</td>
      <td class="fin-centre">${argent(e.montant_du)}</td>
      <td class="fin-centre">${argent(e.montant_paye)}</td>
      <td class="fin-centre"><b>${argent(e.solde)}</b></td>
      <td class="fin">${e.en_retard ? `<span class="puce ko">Dépassée le ${dateFr(e.echeance_depassee)}</span>` : '<span class="puce neutre">À venir</span>'}</td>
    </tr>`;
}

async function chargerImpayes(){
  const parametres = new URLSearchParams();
  if ($('filtreClasse').value) parametres.set('classe_id', $('filtreClasse').value);

  const reponse = await fetch(`php/rapports_financiers.php?vue=impayes&${parametres.toString()}`);
  const lignes = await reponse.json();

  $('corpsImpayes').innerHTML = lignes.length
    ? lignes.map(ligneHTML).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--texte-doux);padding:26px">Aucun impayé — tout est à jour.</td></tr>';

  $('kpiNombre').textContent = lignes.length;
  $('kpiMontant').textContent = argent(lignes.reduce((s, e) => s + e.solde, 0));
  $('kpiRetard').textContent = lignes.filter(e => e.en_retard).length;
  $('compteResultats').textContent = `${lignes.length} élève${lignes.length > 1 ? 's' : ''} en impayé.`;
}

$('filtreClasse').addEventListener('change', chargerImpayes);

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

Promise.all([chargerClasses()]).then(chargerImpayes);

});
