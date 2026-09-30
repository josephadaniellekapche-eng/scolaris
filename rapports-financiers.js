/* =========================================================
   SCOLARIS — Rapports financiers
   Synthèse (recettes/dépenses/taux de recouvrement) et détail par
   classe, filtrables par année scolaire et par période. Lecture
   seule (php/rapports_financiers.php).
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
function argent(n){
  return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

async function chargerAnnees(){
  const reponse = await fetch('php/annees_scolaires.php');
  const annees = await reponse.json();
  $('filtreAnnee').innerHTML = '<option value="">Toutes les années</option>' +
    annees.map(a => `<option value="${a.id}" ${a.statut === 'active' ? 'selected' : ''}>${a.libelle}</option>`).join('');
}

async function chargerRapports(){
  const parametres = new URLSearchParams();
  if ($('filtreAnnee').value) parametres.set('annee_scolaire_id', $('filtreAnnee').value);
  if ($('filtreDu').value) parametres.set('du', $('filtreDu').value);
  if ($('filtreAu').value) parametres.set('au', $('filtreAu').value);

  const [synthese, parClasse] = await Promise.all([
    fetch(`php/rapports_financiers.php?vue=synthese&${parametres.toString()}`).then(r => r.json()),
    fetch(`php/rapports_financiers.php?vue=par_classe&${parametres.toString()}`).then(r => r.json())
  ]);

  $('kpiDu').textContent = argent(synthese.montant_du);
  $('kpiRecettes').textContent = argent(synthese.recettes);
  $('kpiNbPaiements').textContent = `${synthese.nombre_paiements} paiement${synthese.nombre_paiements > 1 ? 's' : ''}`;
  $('kpiTaux').textContent = synthese.taux_recouvrement !== null ? `${synthese.taux_recouvrement} %` : '—';
  $('kpiResultat').textContent = argent(synthese.resultat_net);
  $('kpiDepenses').textContent = `Dépenses : ${argent(synthese.depenses)}`;

  const classesAvecActivite = parClasse.filter(c => c.montant_du > 0);
  $('corpsClasses').innerHTML = classesAvecActivite.length
    ? classesAvecActivite.map(c => `
        <tr>
          <td>${echapperHTML(c.classe_nom)}</td>
          <td class="fin-centre">${argent(c.montant_du)}</td>
          <td class="fin-centre">${argent(c.montant_paye)}</td>
          <td class="fin"><b>${argent(c.solde)}</b></td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune donnée pour ce périmètre.</td></tr>';
}

$('filtreAnnee').addEventListener('change', chargerRapports);
$('filtreDu').addEventListener('change', chargerRapports);
$('filtreAu').addEventListener('change', chargerRapports);

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

chargerAnnees().then(chargerRapports);

});
