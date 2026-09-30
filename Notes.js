/* =========================================================
   SCOLARIS — Module Notes
   Une seule note par séquence (avec flèches +/− pour la saisie),
   moyenne trimestrielle calculée automatiquement (moyenne des
   deux séquences). Au trimestre 3, un récapitulatif annuel
   (T1, T2, T3, moyenne annuelle) s'affiche sous la grille.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

let trimestreActif    = 1;
let modifie            = false;
let chargementEnCours  = 0;

let evaluationSeq1Id = null;   // id de l'évaluation unique de la séquence 1 du trimestre
let evaluationSeq2Id = null;   // id de l'évaluation unique de la séquence 2 du trimestre
let lignesKPI         = [];    // [{ inscription, nom, valeur }] pour les indicateurs (moyenne du trimestre)

/* Empêche de perdre des notes saisies mais non enregistrées en changeant
   de filtre. Revient à la valeur précédente si l'utilisateur annule. */
function confirmerAbandon(){
  return !modifie || confirm('Des notes n\'ont pas été enregistrées. Continuer sans enregistrer ?');
}

/* =========================================================
   OUTILS
   ========================================================= */
function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

function initiales(nom, prenom){ return ((prenom[0] || '') + (nom[0] || '')).toUpperCase(); }

function formatMoyenne(valeur){
  return (valeur === null || valeur === undefined) ? '—' : valeur.toFixed(2).replace('.', ',');
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

function classeNote(valeur){
  if (valeur === null || isNaN(valeur)) return '';
  if (valeur < 10) return 'faible';
  if (valeur >= 14) return 'bonne';
  return '';
}

function statutPuce(valeur){
  if (valeur === null || valeur === undefined) return '<span class="puce neutre">À saisir</span>';
  return valeur < 10
    ? '<span class="puce ko">Note faible</span>'
    : '<span class="puce ok">Notée</span>';
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
  if (!classe || !classe.value) return 'Sélectionnez une classe';
  if (!matiere || !matiere.value) return classe.textContent.split('·')[0].trim();
  return `${classe.textContent.split('·')[0].trim()} · ${matiere.textContent}`;
}

/* =========================================================
   2. ÉVALUATION UNIQUE PAR SÉQUENCE
   Une séquence n'a plus qu'une seule évaluation (coefficient 1) :
   on réutilise la première trouvée, ou on la crée à la volée.
   ========================================================= */
async function assurerEvaluationUnique(classeId, matiereId, sequence){
  const reponse = await fetch(`php/evaluations.php?classe_id=${classeId}&matiere_id=${matiereId}&sequence=${sequence}`);
  const existantes = await reponse.json();
  if (existantes.length) return existantes[0].id;

  const creation = await fetch('php/evaluations.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classe_id: classeId, matiere_id: matiereId, sequence, libelle: 'Note', coefficient: 1 })
  });
  const resultat = await creation.json();
  return resultat.id;
}

/* =========================================================
   3. GRILLE DE SAISIE (Séquence 1 · Séquence 2 · Moyenne)
   ========================================================= */
function construireEntete(){
  $('enteteNotes').innerHTML = `
    <tr>
      <th>Élève</th>
      <th>Matricule</th>
      <th class="fin-centre">Séquence ${trimestreActif * 2 - 1}</th>
      <th class="fin-centre">Séquence ${trimestreActif * 2}</th>
      <th class="fin-centre entete-moyenne">Moyenne</th>
      <th class="fin">Statut</th>
    </tr>`;
}

function celluleNote(valeur, inscriptionId, evaluationId){
  return `
    <td class="cellule-note">
      <div class="compteur-note">
        <button type="button" class="compteur-note-btn" data-role="moins" tabindex="-1" aria-label="Diminuer la note">−</button>
        <input type="number" class="champ-note ${classeNote(valeur !== null ? valeur : null)}" min="0" max="20" step="0.25"
               data-evaluation="${evaluationId}" data-inscription="${inscriptionId}"
               value="${valeur !== null ? valeur : ''}" placeholder="--">
        <button type="button" class="compteur-note-btn" data-role="plus" tabindex="-1" aria-label="Augmenter la note">+</button>
      </div>
    </td>`;
}

function ligneHTML(eleve){
  return `
    <tr data-inscription="${eleve.inscription_id}">
      <td>
        <div class="identite">
          <span class="avatar">${initiales(eleve.nom, eleve.prenom)}</span>
          <div><b>${echapperHTML(eleve.prenom)} ${echapperHTML(eleve.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(eleve.matricule)}</td>
      ${celluleNote(eleve.sequence1, eleve.inscription_id, evaluationSeq1Id)}
      ${celluleNote(eleve.sequence2, eleve.inscription_id, evaluationSeq2Id)}
      <td class="fin-centre entete-moyenne" data-moyenne>${formatMoyenne(eleve.trimestre)}</td>
      <td class="fin" data-statut>${statutPuce(eleve.trimestre)}</td>
    </tr>`;
}

/* Recalcule la moyenne trimestrielle d'une ligne (moyenne simple des deux
   séquences) à partir des champs affichés et met à jour moyenne + statut. */
function recalcLigne(tr){
  const champs = [...tr.querySelectorAll('.champ-note')];
  let somme = 0, nb = 0;

  champs.forEach(champ => {
    champ.classList.remove('faible', 'bonne');
    const brut = champ.value.trim();
    if (brut === '') return;
    const val = parseFloat(brut);
    if (isNaN(val)) return;

    const classe = classeNote(val);
    if (classe) champ.classList.add(classe);
    somme += val;
    nb++;
  });

  const moyenne = nb === champs.length ? Math.round((somme / nb) * 100) / 100 : null;
  tr.querySelector('[data-moyenne]').textContent = formatMoyenne(moyenne);
  tr.querySelector('[data-statut]').innerHTML = statutPuce(moyenne);
  return moyenne;
}

/* =========================================================
   4. RÉCAPITULATIF ANNUEL (affiché uniquement au trimestre 3)
   ========================================================= */
function ligneRecapAnnuelHTML(eleve){
  return `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${initiales(eleve.nom, eleve.prenom)}</span>
          <div><b>${echapperHTML(eleve.prenom)} ${echapperHTML(eleve.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(eleve.matricule)}</td>
      <td class="fin-centre">${formatMoyenne(eleve.t1)}</td>
      <td class="fin-centre">${formatMoyenne(eleve.t2)}</td>
      <td class="fin-centre">${formatMoyenne(eleve.t3)}</td>
      <td class="fin-centre entete-moyenne">${formatMoyenne(eleve.annuelle)}</td>
    </tr>`;
}

async function chargerRecapAnnuel(classeId, matiereId){
  const [r1, r2, r3] = await Promise.all([1, 2, 3].map(t =>
    fetch(`php/notes.php?classe_id=${classeId}&matiere_id=${matiereId}&trimestre=${t}`).then(r => r.json())
  ));

  const parEleve = new Map();
  r1.forEach(e => parEleve.set(e.inscription_id, { ...e, t1: e.trimestre, t2: null, t3: null }));
  r2.forEach(e => {
    const l = parEleve.get(e.inscription_id) || { ...e, t1: null, t2: null, t3: null };
    l.t2 = e.trimestre;
    parEleve.set(e.inscription_id, l);
  });
  r3.forEach(e => {
    const l = parEleve.get(e.inscription_id) || { ...e, t1: null, t2: null, t3: null };
    l.t3 = e.trimestre;
    parEleve.set(e.inscription_id, l);
  });

  const eleves = [...parEleve.values()].map(e => {
    const notes = [e.t1, e.t2, e.t3].filter(v => v !== null && v !== undefined);
    e.annuelle = notes.length ? Math.round((notes.reduce((s, v) => s + v, 0) / notes.length) * 100) / 100 : null;
    return e;
  });

  $('corpsRecapAnnuel').innerHTML = eleves.map(ligneRecapAnnuelHTML).join('');
  $('carteRecapAnnuel').hidden = eleves.length === 0;
}

/* =========================================================
   5. CHARGEMENT DE LA GRILLE
   ========================================================= */
function afficherVide(message){
  $('corpsNotes').innerHTML = '';
  $('enteteNotes').innerHTML = '';
  $('carteGrille').hidden = true;
  $('carteRecapAnnuel').hidden = true;
  $('messageVide').classList.add('visible');
  $('messageVide').textContent = message;
  $('compteResultats').textContent = '';
  lignesKPI = [];
  majIndicateurs();
}

async function chargerGrille(){
  const classeId  = $('filtreClasse').value;
  const matiereId = $('filtreMatiere').value;

  modifie = false;
  $('kpiClasseLibelle').textContent = libelleFiltres();

  if (!classeId || !matiereId) {
    afficherVide('Choisissez une classe et une matière pour saisir les notes.');
    return;
  }

  const jeton = ++chargementEnCours;
  const seq1 = trimestreActif * 2 - 1;
  const seq2 = trimestreActif * 2;

  const [id1, id2] = await Promise.all([
    assurerEvaluationUnique(classeId, matiereId, seq1),
    assurerEvaluationUnique(classeId, matiereId, seq2)
  ]);
  if (jeton !== chargementEnCours) return;
  evaluationSeq1Id = id1;
  evaluationSeq2Id = id2;

  const reponse = await fetch(`php/notes.php?classe_id=${classeId}&matiere_id=${matiereId}&trimestre=${trimestreActif}`);
  const eleves  = await reponse.json();
  if (jeton !== chargementEnCours) return;

  if (!eleves.length) { afficherVide('Aucun élève inscrit et validé dans cette classe.'); return; }

  lignesKPI = eleves.map(e => ({ inscription: String(e.inscription_id), nom: `${e.prenom} ${e.nom}`, valeur: e.trimestre }));

  $('carteGrille').hidden = false;
  $('messageVide').classList.remove('visible');

  construireEntete();
  $('corpsNotes').innerHTML = eleves.map(ligneHTML).join('');
  filtrerRecherche();
  majIndicateurs();

  if (trimestreActif === 3) await chargerRecapAnnuel(classeId, matiereId);
  else $('carteRecapAnnuel').hidden = true;
}

/* Recherche : affiche/masque les lignes sans toucher aux valeurs saisies. */
function filtrerRecherche(){
  const texte  = $('rechercheGlobale').value.trim().toLowerCase();
  const lignes = [...document.querySelectorAll('#corpsNotes tr')];
  let visibles = 0;

  lignes.forEach(tr => {
    const correspond = !texte || tr.textContent.toLowerCase().includes(texte);
    tr.hidden = !correspond;
    if (correspond) visibles++;
  });

  $('compteResultats').textContent = lignes.length
    ? `${visibles} élève${visibles > 1 ? 's' : ''} affiché${visibles > 1 ? 's' : ''} sur ${lignes.length}.`
    : '';
}

function majIndicateurs(){
  const notees = lignesKPI.filter(l => l.valeur !== null && l.valeur !== undefined);

  $('kpiEffectif').textContent = lignesKPI.length || '—';
  $('kpiSansNote').textContent = lignesKPI.length ? lignesKPI.length - notees.length : '—';

  if (notees.length) {
    const moyenne   = notees.reduce((s, d) => s + d.valeur, 0) / notees.length;
    const meilleure = notees.reduce((a, b) => (b.valeur > a.valeur ? b : a));
    $('kpiMoyenne').textContent        = moyenne.toFixed(2).replace('.', ',');
    $('kpiMeilleure').textContent      = meilleure.valeur.toFixed(2).replace('.', ',');
    $('kpiMeilleureEleve').textContent = meilleure.nom;
  } else {
    $('kpiMoyenne').textContent        = '—';
    $('kpiMeilleure').textContent      = '—';
    $('kpiMeilleureEleve').textContent = lignesKPI.length ? 'Aucune note saisie' : '—';
  }
}

$('corpsNotes').addEventListener('input', e => {
  const champ = e.target.closest('.champ-note');
  if (!champ) return;

  modifie = true;
  const tr      = champ.closest('tr');
  const moyenne = recalcLigne(tr);
  const ligne   = lignesKPI.find(l => l.inscription === tr.dataset.inscription);
  if (ligne) ligne.valeur = moyenne;
  majIndicateurs();
});

$('corpsNotes').addEventListener('click', e => {
  const bouton = e.target.closest('.compteur-note-btn');
  if (!bouton) return;
  const champ = bouton.parentElement.querySelector('.champ-note');
  if (!champ) return;

  const pas = parseFloat(champ.step) || 1;
  const min = parseFloat(champ.min);
  const max = parseFloat(champ.max);
  let valeur = parseFloat(champ.value);
  if (isNaN(valeur)) valeur = min;
  valeur += bouton.dataset.role === 'plus' ? pas : -pas;

  champ.value = Math.round(Math.min(max, Math.max(min, valeur)) * 100) / 100;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
});

/* =========================================================
   6. ENREGISTREMENT DES NOTES
   ========================================================= */
$('btnEnregistrer').addEventListener('click', async () => {
  const champs = [...document.querySelectorAll('#corpsNotes .champ-note')];
  if (!champs.length) return;

  const cellules = champs.map(champ => {
    const brut = champ.value.trim();
    return {
      evaluation_id: parseInt(champ.dataset.evaluation, 10),
      inscription_id: parseInt(champ.dataset.inscription, 10),
      note: brut === '' ? null : parseFloat(brut)
    };
  });

  const horsBornes = cellules.some(c => c.note !== null && (c.note < 0 || c.note > 20));
  if (horsBornes) {
    notifier('Les notes doivent être comprises entre 0 et 20.');
    return;
  }

  try {
    const reponse = await fetch('php/notes.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellules })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    modifie = false;
    notifier('Les notes ont été enregistrées.');
    await chargerGrille();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   7. FILTRES (classe, matière, trimestre)
   ========================================================= */
let classePrecedente = '', matierePrecedente = '';

$('filtreClasse').addEventListener('change', async () => {
  if (!confirmerAbandon()) { $('filtreClasse').value = classePrecedente; return; }
  classePrecedente = $('filtreClasse').value;
  await chargerMatieres();
  matierePrecedente = $('filtreMatiere').value;
  await chargerGrille();
});

$('filtreMatiere').addEventListener('change', async () => {
  if (!confirmerAbandon()) { $('filtreMatiere').value = matierePrecedente; return; }
  matierePrecedente = $('filtreMatiere').value;
  await chargerGrille();
});

$('segmentsTrimestre').addEventListener('click', e => {
  const bouton = e.target.closest('.segment');
  if (!bouton || bouton.classList.contains('actif')) return;
  if (!confirmerAbandon()) return;
  trimestreActif = parseInt(bouton.dataset.trimestre, 10);
  document.querySelectorAll('#segmentsTrimestre .segment').forEach(s => s.classList.toggle('actif', s === bouton));
  chargerGrille();
});

$('rechercheGlobale').addEventListener('input', filtrerRecherche);

window.addEventListener('beforeunload', e => {
  if (!modifie) return;
  e.preventDefault();
  e.returnValue = '';
});

/* =========================================================
   8. MENU LATÉRAL
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
   9. DÉMARRAGE
   ========================================================= */
chargerClasses();
majIndicateurs();

});
