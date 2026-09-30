/* =========================================================
   SCOLARIS — Livret de caisse
   Journal chronologique combinant les encaissements (php/paiements.php)
   et les décaissements (php/depenses.php), avec solde cumulé. Lecture
   seule : aucune écriture ne se fait ici.
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

function premierJourDuMois(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function aujourdhuiISO(){
  return new Date().toISOString().slice(0, 10);
}

async function chargerJournal(){
  const du = $('filtreDu').value;
  const au = $('filtreAu').value;
  const parametres = `du=${du}&au=${au}`;

  const [paiements, depenses] = await Promise.all([
    fetch(`php/paiements.php?${parametres}`).then(r => r.json()),
    fetch(`php/depenses.php?${parametres}`).then(r => r.json())
  ]);

  const lignes = [
    ...paiements.map(p => ({
      date: p.date_paiement, type: 'encaissement',
      libelle: `${p.eleve_prenom} ${p.eleve_nom} : ${p.frais_nom || 'Versement global'}`,
      mode: p.mode_paiement, montant: p.montant
    })),
    ...depenses.map(d => ({
      date: d.date_depense, type: 'decaissement',
      libelle: `${d.categorie_nom} : ${d.libelle}`,
      mode: d.mode_paiement, montant: d.montant
    }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  let solde = 0;
  const totalEncaisse = lignes.filter(l => l.type === 'encaissement').reduce((s, l) => s + l.montant, 0);
  const totalDecaisse  = lignes.filter(l => l.type === 'decaissement').reduce((s, l) => s + l.montant, 0);

  $('corpsJournal').innerHTML = lignes.length
    ? lignes.map(l => {
        solde += l.type === 'encaissement' ? l.montant : -l.montant;
        return `
          <tr>
            <td>${dateFr(l.date)}</td>
            <td><span class="puce ${l.type === 'encaissement' ? 'ok' : 'ko'}">${l.type === 'encaissement' ? 'Encaissement' : 'Décaissement'}</span></td>
            <td>${echapperHTML(l.libelle)}</td>
            <td>${echapperHTML(l.mode)}</td>
            <td class="fin-centre ${l.type === 'encaissement' ? 'montant-positif' : 'montant-negatif'}">
              ${l.type === 'encaissement' ? '+' : '−'}${argent(l.montant)}
            </td>
            <td class="fin"><b>${argent(solde)}</b></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune opération sur cette période.</td></tr>';

  $('kpiEncaissements').textContent = argent(totalEncaisse);
  $('kpiDecaissements').textContent = argent(totalDecaisse);
  $('kpiSoldeNet').textContent      = argent(totalEncaisse - totalDecaisse);
  $('compteResultats').textContent  = `${lignes.length} opération${lignes.length > 1 ? 's' : ''}.`;
}

$('filtreDu').addEventListener('change', chargerJournal);
$('filtreAu').addEventListener('change', chargerJournal);

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

/* Démarrage : le mois en cours par défaut */
$('filtreDu').value = premierJourDuMois();
$('filtreAu').value = aujourdhuiISO();
chargerJournal();

});
