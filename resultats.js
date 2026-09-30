/* =========================================================
   SCOLARIS — Module Résultats
   Lecture seule : classement d'une classe sur une matière et un
   trimestre, calculé côté serveur (php/resultats.php) à partir
   des mêmes notes que le module Notes. Aucune saisie ici.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

let trimestreActif = 1;
let chargementEnCours = 0;

function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

function initiales(nom, prenom){ return ((prenom[0] || '') + (nom[0] || '')).toUpperCase(); }

function formatMoyenne(valeur){
  return (valeur === null || valeur === undefined) ? '—' : valeur.toFixed(2).replace('.', ',');
}

function classeAppreciation(texte){
  if (texte === 'Très faible' || texte === 'Faible') return 'ko';
  if (texte === 'Bien' || texte === 'Très bien' || texte === 'Excellent') return 'ok';
  return 'neutre';
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

/* =========================================================
   1. CLASSES ET MATIÈRES (filtres)
   ========================================================= */
async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const classes = (await reponse.json())
    .filter(c => c.inscrits > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  $('filtreClasse').innerHTML = '<option value="">Choisir une classe…</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)} · ${c.inscrits} élève${c.inscrits > 1 ? 's' : ''}</option>`).join('');
}

async function chargerMatieres(){
  const classeId = $('filtreClasse').value;
  const select = $('filtreMatiere');

  if (!classeId) {
    select.innerHTML = '<option value="">Choisir une matière…</option>';
    select.disabled = true;
    return;
  }

  const reponse = await fetch(`php/affectations.php?classe_id=${classeId}`);
  const affectations = (await reponse.json())
    .sort((a, b) => a.matiere_nom.localeCompare(b.matiere_nom, 'fr'));

  select.disabled = false;
  select.innerHTML = affectations.length
    ? affectations.map(a => `<option value="${a.matiere_id}">${echapperHTML(a.matiere_nom)} (Coef ${a.coefficient})</option>`).join('')
    : '<option value="">Aucune matière affectée à cette classe</option>';
}

function libelleFiltres(){
  const classe  = $('filtreClasse').selectedOptions[0];
  const matiere = $('filtreMatiere').selectedOptions[0];
  if (!classe || !classe.value) return 'Sélectionnez une classe et une matière';
  if (!matiere || !matiere.value) return classe.textContent.split('·')[0].trim();
  return `${classe.textContent.split('·')[0].trim()} · ${matiere.textContent}`;
}

/* =========================================================
   2. CLASSEMENT
   ========================================================= */
function afficherVide(message){
  $('corpsResultats').innerHTML = '';
  $('carteResultats').hidden = true;
  $('messageVide').classList.add('visible');
  $('messageVide').textContent = message;
  $('compteResultats').textContent = '';
  $('kpiEffectif').textContent  = '—';
  $('kpiMoyenne').textContent   = '—';
  $('kpiMeilleure').textContent = '—';
  $('kpiNotees').textContent    = '—';
}

function ligneResultatHTML(eleve){
  return `
    <tr>
      <td class="fin-centre"><b>${eleve.rang ?? '—'}</b></td>
      <td>
        <div class="identite">
          <span class="avatar">${initiales(eleve.nom, eleve.prenom)}</span>
          <div><b>${echapperHTML(eleve.prenom)} ${echapperHTML(eleve.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(eleve.matricule)}</td>
      <td class="fin-centre">${formatMoyenne(eleve.sequence1)}</td>
      <td class="fin-centre">${formatMoyenne(eleve.sequence2)}</td>
      <td class="fin-centre entete-moyenne">${formatMoyenne(eleve.moyenne)}</td>
      <td class="fin"><span class="puce ${classeAppreciation(eleve.appreciation)}">${eleve.appreciation}</span></td>
    </tr>`;
}

async function chargerResultats(){
  const classeId  = $('filtreClasse').value;
  const matiereId = $('filtreMatiere').value;

  $('kpiClasseLibelle').textContent = libelleFiltres();

  if (!classeId || !matiereId) {
    afficherVide('Choisissez une classe et une matière pour voir le classement.');
    return;
  }

  const jeton = ++chargementEnCours;
  const reponse = await fetch(`php/resultats.php?classe_id=${classeId}&matiere_id=${matiereId}&trimestre=${trimestreActif}`);
  if (jeton !== chargementEnCours) return;

  if (!reponse.ok) {
    const { erreur } = await reponse.json().catch(() => ({}));
    afficherVide(erreur || 'Échec du chargement des résultats.');
    return;
  }

  const donnees = await reponse.json();

  if (!donnees.effectif) { afficherVide('Aucun élève inscrit et validé dans cette classe.'); return; }

  $('kpiEffectif').textContent  = donnees.effectif;
  $('kpiMoyenne').textContent   = formatMoyenne(donnees.moyenne_classe);
  $('kpiMeilleure').textContent = formatMoyenne(donnees.meilleure);
  $('kpiNotees').textContent    = `${donnees.notes_saisies} / ${donnees.effectif}`;

  $('carteResultats').hidden = false;
  $('messageVide').classList.remove('visible');
  $('corpsResultats').innerHTML = donnees.eleves.map(ligneResultatHTML).join('');
  $('compteResultats').textContent =
    `${donnees.eleves.length} élève${donnees.eleves.length > 1 ? 's' : ''} classé${donnees.eleves.length > 1 ? 's' : ''}.`;
}

/* =========================================================
   3. FILTRES
   ========================================================= */
$('filtreClasse').addEventListener('change', async () => {
  await chargerMatieres();
  await chargerResultats();
});

$('filtreMatiere').addEventListener('change', chargerResultats);

$('segmentsTrimestre').addEventListener('click', e => {
  const bouton = e.target.closest('.segment');
  if (!bouton || bouton.classList.contains('actif')) return;
  trimestreActif = parseInt(bouton.dataset.trimestre, 10);
  document.querySelectorAll('#segmentsTrimestre .segment').forEach(s => s.classList.toggle('actif', s === bouton));
  chargerResultats();
});

/* =========================================================
   4. MENU LATÉRAL
   ========================================================= */
const rail = $('rail'), voile = $('voile');

$('burger').addEventListener('click', () => {
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
    const groupe = $(entete.dataset.groupe);
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
   5. DÉMARRAGE
   ========================================================= */
chargerClasses();
afficherVide('Choisissez une classe et une matière pour voir le classement.');

});
