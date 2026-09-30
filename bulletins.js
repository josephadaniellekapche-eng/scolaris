/* =========================================================
   SCOLARIS — Module Bulletins
   Lecture seule : reconstitue le bulletin d'un élève (matières
   groupées, moyenne, coefficient, total, rang, appréciation),
   calculé côté serveur (php/bulletins.php) à partir des mêmes
   notes que le module Notes. Aucune saisie ici.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

let trimestreActif = 1;
let chargementEnCours = 0;
let dernierBulletin = null;

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
   0. ÉTABLISSEMENT (en-tête ministériel bilingue, statique)
   ========================================================= */
async function chargerEtablissement(){
  try {
    const reponse = await fetch('php/etablissement.php');
    const e = await reponse.json();
    $('bulletinNomEtablissement').textContent       = e.nom || 'SCOLARIS';
    $('bulletinAdresseEtablissement').textContent   = [e.adresse, e.telephone, e.email].filter(Boolean).join(' · ');
    $('bulletinDelegationRegionaleFr').textContent       = e.delegation_regionale || '';
    $('bulletinDelegationRegionaleEn').textContent       = e.delegation_regionale_en || '';
    $('bulletinDelegationDepartementaleFr').textContent   = e.delegation_departementale || '';
    $('bulletinDelegationDepartementaleEn').textContent   = e.delegation_departementale_en || '';
  } catch (erreur) { /* en-tête laissé avec ses valeurs par défaut */ }
}

/* =========================================================
   1. CLASSES ET ÉLÈVES (filtres)
   ========================================================= */
async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const classes = (await reponse.json())
    .filter(c => c.inscrits > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  $('filtreClasse').innerHTML = '<option value="">Choisir une classe…</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)} · ${c.inscrits} élève${c.inscrits > 1 ? 's' : ''}</option>`).join('');
}

async function chargerEleves(){
  const classeId = $('filtreClasse').value;
  const select = $('filtreEleve');

  if (!classeId) {
    select.innerHTML = '<option value="">Choisir un élève…</option>';
    select.disabled = true;
    return;
  }

  const reponse = await fetch(`php/bulletins.php?classe_id=${classeId}`);
  const eleves = await reponse.json();

  select.disabled = false;
  select.innerHTML = eleves.length
    ? '<option value="">Choisir un élève…</option>' +
      eleves.map(e => `<option value="${e.inscription_id}">${echapperHTML(e.nom)} ${echapperHTML(e.prenom)} (${echapperHTML(e.matricule)})</option>`).join('')
    : '<option value="">Aucun élève inscrit et validé dans cette classe</option>';
}

/* =========================================================
   2. RENDU DU BULLETIN
   ========================================================= */
function afficherVide(message){
  $('zoneBulletin').hidden = true;
  $('messageVide').classList.add('visible');
  $('messageVide').textContent = message;
  $('btnEnvoyerParents').disabled = true;
  dernierBulletin = null;
}

function ligneMatiereHTML(m){
  return `
    <tr>
      <td>${echapperHTML(m.matiere)}</td>
      <td class="fin-centre">${formatMoyenne(m.sequence1)}</td>
      <td class="fin-centre">${formatMoyenne(m.sequence2)}</td>
      <td class="fin-centre entete-moyenne">${formatMoyenne(m.moyenne)}</td>
      <td class="fin-centre">${m.coefficient}</td>
      <td class="fin-centre"><b>${formatMoyenne(m.total)}</b></td>
      <td class="fin-centre">${m.rang ?? '—'}</td>
      <td class="fin"><span class="puce ${classeAppreciation(m.appreciation)}">${m.appreciation}</span></td>
    </tr>`;
}

function carteGroupeHTML(groupe){
  return `
    <div class="carte carte-groupe">
      <div class="carte-entete"><h3>${echapperHTML(groupe.groupe)}</h3></div>
      <div class="table-defile">
        <table class="tableau">
          <thead>
            <tr>
              <th>Discipline</th>
              <th class="fin-centre">Séquence 1</th>
              <th class="fin-centre">Séquence 2</th>
              <th class="fin-centre">Moyenne</th>
              <th class="fin-centre">Coef.</th>
              <th class="fin-centre">Total</th>
              <th class="fin-centre">Rang</th>
              <th class="fin">Appréciation</th>
            </tr>
          </thead>
          <tbody>${groupe.matieres.map(ligneMatiereHTML).join('')}</tbody>
          <tfoot>
            <tr class="ligne-moyenne-groupe">
              <td colspan="5">Moyenne du groupe</td>
              <td colspan="3"><b>${formatMoyenne(groupe.moyenne_groupe)}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

async function chargerBulletin(){
  const classeId      = $('filtreClasse').value;
  const inscriptionId = $('filtreEleve').value;

  if (!classeId || !inscriptionId) {
    afficherVide('Choisissez une classe puis un élève pour afficher son bulletin.');
    return;
  }

  const jeton = ++chargementEnCours;
  const reponse = await fetch(`php/bulletins.php?classe_id=${classeId}&inscription_id=${inscriptionId}&trimestre=${trimestreActif}`);
  if (jeton !== chargementEnCours) return;

  if (!reponse.ok) {
    const { erreur } = await reponse.json().catch(() => ({}));
    afficherVide(erreur || 'Échec du chargement du bulletin.');
    return;
  }

  const donnees = await reponse.json();

  if (!donnees.groupes.length) { afficherVide('Aucune matière n\'est encore affectée à cette classe.'); return; }

  $('bulletinPortrait').textContent = initiales(donnees.eleve.nom, donnees.eleve.prenom);
  $('bulletinNom').textContent = `${donnees.eleve.prenom} ${donnees.eleve.nom}`;
  $('bulletinResume').textContent =
    `${donnees.eleve.matricule} · ${donnees.eleve.sexe === 'F' ? 'Féminin' : 'Masculin'} · Trimestre ${donnees.trimestre} · Classe de ${donnees.effectif} élève${donnees.effectif > 1 ? 's' : ''}`;

  $('bulletinTitreDoc').textContent = `BULLETIN DE NOTES — TRIMESTRE ${donnees.trimestre}${donnees.annee_scolaire ? ' — ' + donnees.annee_scolaire : ''}`;
  $('bulletinNumero').textContent = donnees.numero_bulletin || '—';

  $('zoneGroupes').innerHTML = donnees.groupes.map(carteGroupeHTML).join('');

  $('syntheseMoyenne').textContent      = formatMoyenne(donnees.moyenne_generale);
  $('syntheseRang').textContent         = donnees.rang_general ? `${donnees.rang_general} / ${donnees.effectif}` : '—';
  $('syntheseAppreciation').textContent = donnees.appreciation_generale;

  $('messageVide').classList.remove('visible');
  $('zoneBulletin').hidden = false;

  dernierBulletin = donnees;
  $('btnEnvoyerParents').disabled = false;
}

/* =========================================================
   2 bis. ENVOI DU BULLETIN AUX PARENTS
   Construit un résumé texte du bulletin (moyenne, rang, appréciation,
   détail par matière) et ouvre le module Communication déjà pré-rempli
   sur ce parent — jamais de second circuit d'envoi SMS/e-mail en double,
   voir communication.html / php/communications.php.
   ========================================================= */
function resumeBulletinTexte(donnees){
  const lignes = [
    `Bonjour,`,
    ``,
    `Voici le bulletin de ${donnees.eleve.prenom} ${donnees.eleve.nom} pour le Trimestre ${donnees.trimestre} :`,
    ``,
    `Moyenne générale : ${formatMoyenne(donnees.moyenne_generale)}/20`,
    `Rang : ${donnees.rang_general ? `${donnees.rang_general}/${donnees.effectif}` : '—'}`,
    `Appréciation générale : ${donnees.appreciation_generale}`,
    ``,
    `Détail par matière :`,
  ];
  donnees.groupes.forEach(groupe => {
    groupe.matieres.forEach(m => {
      lignes.push(`- ${m.matiere} : ${formatMoyenne(m.moyenne)}/20 (${m.appreciation})`);
    });
  });
  lignes.push('', 'Cordialement,', 'SCOLARIS');
  return lignes.join('\n');
}

$('btnEnvoyerParents').addEventListener('click', () => {
  if (!dernierBulletin) { notifier('Choisissez d\'abord un élève.'); return; }

  const parametres = new URLSearchParams({
    canal: 'whatsapp',
    categorie: 'parents',
    portee: 'individuel',
    individu_id: dernierBulletin.eleve.eleve_id,
    sujet: `Bulletin de ${dernierBulletin.eleve.prenom} ${dernierBulletin.eleve.nom} — Trimestre ${dernierBulletin.trimestre}`,
    contenu: resumeBulletinTexte(dernierBulletin),
  });
  window.location.href = `communication.html?${parametres}`;
});

/* =========================================================
   3. FILTRES
   ========================================================= */
$('filtreClasse').addEventListener('change', async () => {
  await chargerEleves();
  await chargerBulletin();
});

$('filtreEleve').addEventListener('change', chargerBulletin);

$('segmentsTrimestre').addEventListener('click', e => {
  const bouton = e.target.closest('.segment');
  if (!bouton || bouton.classList.contains('actif')) return;
  trimestreActif = parseInt(bouton.dataset.trimestre, 10);
  document.querySelectorAll('#segmentsTrimestre .segment').forEach(s => s.classList.toggle('actif', s === bouton));
  chargerBulletin();
});

/* Le titre de l'onglet est repris par le navigateur dans l'en-tête imprimée
   (« SCOLARIS — Bulletins », à côté de la date) : on le vide le temps de
   l'impression pour qu'il n'apparaisse pas sur le bulletin. La date/heure et
   l'URL restent affichées par certains navigateurs (Chrome) indépendamment du
   titre — seule la case « En-têtes et pieds de page » de la boîte de dialogue
   d'impression (Plus de paramètres) les retire complètement, ce qu'aucune
   page web ne peut piloter à sa place. */
const titrePage = document.title;
window.addEventListener('beforeprint', () => { document.title = ''; });
window.addEventListener('afterprint', () => { document.title = titrePage; });

$('btnImprimer').addEventListener('click', () => {
  if ($('zoneBulletin').hidden) { notifier('Choisissez d\'abord un élève.'); return; }
  window.print();
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
chargerEtablissement();
chargerClasses();
afficherVide('Choisissez une classe puis un élève pour afficher son bulletin.');

});
