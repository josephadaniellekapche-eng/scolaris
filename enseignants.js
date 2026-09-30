/* =========================================================
   SCOLARIS — Module Enseignants
   Fiches du personnel enseignant. L'affectation à une classe
   (matière, coefficient, volume horaire) se fait depuis l'onglet
   « Matières » de la fiche de la classe concernée (module Classes).
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const nomsNiveaux = {
  '6e':'Sixième', '5e':'Cinquième', '4e':'Quatrième', '3e':'Troisième',
  '2nde':'Seconde', '1ère':'Première', 'Tle':'Terminale'
};
const ordreNiveaux = ['6e','5e','4e','3e','2nde','1ère','Tle'];

/* =========================================================
   1. DONNÉES — chargées depuis la base de données
   Une affectation lie un enseignant, une matière et une classe
   (coefficient, volume horaire) : c'est la table `affectations`,
   croisée ici avec les classes pour en afficher niveau/filière.
   ========================================================= */
let toutesMatieres = [];

async function chargerEnseignants(){
  const [rEns, rAff, rClasses, rMatieres] = await Promise.all([
    fetch('php/enseignants.php'), fetch('php/affectations.php'),
    fetch('php/classes.php'), fetch('php/matieres.php')
  ]);
  const [ens, affectations, classes, matieres] = await Promise.all([
    rEns.json(), rAff.json(), rClasses.json(), rMatieres.json()
  ]);

  toutesMatieres = matieres.map(m => m.nom).sort((a, b) => a.localeCompare(b, 'fr'));
  const classesParId = Object.fromEntries(classes.map(c => [c.id, c]));

  return ens.map(e => {
    const mesAffectations = affectations
      .filter(a => a.enseignant_id === e.id)
      .map(a => {
        const c = classesParId[a.classe_id];
        return {
          matiere: a.matiere_nom, coef: Number(a.coefficient), heures: Number(a.volume_horaire),
          classeNom: c ? c.nom : '—', filiere: c ? c.filiere : '—', niveau: c ? c.niveau_code : '',
          classeId: a.classe_id, matiereId: a.matiere_id
        };
      });

    return {
      id: e.id, matricule: e.matricule, civilite: e.civilite, nom: e.nom, prenom: e.prenom,
      sexe: e.sexe, telephone: e.telephone || '—', email: e.email || '—', diplome: e.diplome || '—',
      embauche: e.date_embauche, statut: e.statut,
      nomComplet: `${e.prenom} ${e.nom}`,
      affectations: mesAffectations,
      matieres: [...new Set(mesAffectations.map(a => a.matiere))],
      niveaux: [...new Set(mesAffectations.map(a => a.niveau))].filter(Boolean)
        .sort((a, b) => ordreNiveaux.indexOf(a) - ordreNiveaux.indexOf(b)),
      heuresTotal: mesAffectations.reduce((s, a) => s + a.heures, 0)
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

let enseignants = [];

/* =========================================================
   2. OUTILS
   ========================================================= */
const $ = id => document.getElementById(id);

function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

function initiales(e){ return (e.prenom[0] + e.nom[0]).toUpperCase(); }

function dateFr(iso){
  if (!iso) return '—';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function anciennete(iso){
  if (!iso) return '—';
  const debut = new Date(iso), auj = new Date();
  let ans = auj.getFullYear() - debut.getFullYear();
  const mois = auj.getMonth() - debut.getMonth();
  if (mois < 0 || (mois === 0 && auj.getDate() < debut.getDate())) ans--;
  return ans <= 0 ? 'Moins d\'un an' : `${ans} an${ans > 1 ? 's' : ''}`;
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

/* =========================================================
   3. LISTE DES ENSEIGNANTS
   ========================================================= */
function afficherListe(){
  const texte  = $('filtreNom').value.trim().toLowerCase();
  const matiere = $('filtreMatiere').value;
  const niveau  = $('filtreNiveau').value;

  const visibles = enseignants.filter(e => {
    if (texte && !(`${e.nomComplet} ${e.matricule} ${e.matieres.join(' ')}`.toLowerCase().includes(texte))) return false;
    if (matiere && !e.matieres.includes(matiere)) return false;
    if (niveau && !e.niveaux.includes(niveau)) return false;
    return true;
  });

  $('corpsEnseignants').innerHTML = visibles.map(e => `
    <tr class="cliquable" data-matricule="${e.matricule}">
      <td>
        <div class="identite">
          <span class="avatar">${initiales(e)}</span>
          <div><b>${echapperHTML(e.nomComplet)}</b><small>${e.matricule}</small></div>
        </div>
      </td>
      <td>${e.matieres.length ? echapperHTML(e.matieres.join(', ')) : '—'}</td>
      <td>${e.niveaux.length ? e.niveaux.map(n => nomsNiveaux[n] || n).join(', ') : 'Non affecté'}</td>
      <td class="fin-centre">${e.heuresTotal ? `${e.heuresTotal} h` : '—'}</td>
      <td>${echapperHTML(e.telephone)}</td>
      <td><span class="puce ok">${e.statut}</span></td>
      <td class="fin"><button class="action" data-ouvrir="${e.matricule}">Ouvrir</button></td>
    </tr>`).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
  $('compteResultats').textContent =
    `${visibles.length} enseignant${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''} sur ${enseignants.length}.`;
}

function majIndicateurs(){
  const femmes = enseignants.filter(e => e.sexe === 'Féminin').length;
  const hommes = enseignants.length - femmes;
  const sansAffectation = enseignants.filter(e => e.affectations.length === 0).length;
  const heuresMoyen = enseignants.length
    ? Math.round(enseignants.reduce((s, e) => s + e.heuresTotal, 0) / enseignants.length) : 0;

  $('kpiTotal').textContent        = enseignants.length;
  $('kpiRepartition').textContent  = `${hommes} hommes · ${femmes} femmes`;
  $('kpiHeuresMoyen').textContent  = `${heuresMoyen} h`;
  $('kpiSansAffectation').textContent = sansAffectation;
}

function remplirFiltreMatiere(){
  $('filtreMatiere').innerHTML =
    '<option value="">Toutes les matières</option>' +
    toutesMatieres.map(m => `<option value="${m}">${m}</option>`).join('');
}

['filtreNom', 'filtreMatiere', 'filtreNiveau'].forEach(id => {
  $(id).addEventListener('input', afficherListe);
  $(id).addEventListener('change', afficherListe);
});

$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherListe();
});

$('corpsEnseignants').addEventListener('click', e => {
  const ligne = e.target.closest('tr[data-matricule]');
  if (ligne) ouvrirFiche(ligne.dataset.matricule);
});

/* =========================================================
   4. FICHE ENSEIGNANT
   ========================================================= */
let matriculeAffiche = null;

function ouvrirFiche(matricule){
  const e = enseignants.find(x => x.matricule === matricule);
  if (!e) return;
  matriculeAffiche = matricule;

  $('fichePortrait').textContent = initiales(e);
  $('ficheNom').textContent = `${e.civilite} ${e.nomComplet}`;
  $('ficheResume').textContent =
    `${e.matricule} · ${e.matieres.length ? e.matieres.join(', ') : 'Aucune matière affectée'}`;

  const etiquettes = [`<span class="ambre">${e.matieres.length ? e.matieres.join(' / ') : 'Non affecté'}</span>`];
  etiquettes.push(`<span>${anciennete(e.embauche)} d'ancienneté</span>`);
  etiquettes.push(e.heuresTotal ? `<span class="vert">${e.heuresTotal} h / semaine</span>` : '<span class="rouge">Aucune classe</span>');
  $('ficheEtiquettes').innerHTML = etiquettes.join('');

  /* --- Profil --- */
  $('listeProfil').innerHTML = ligne([
    ['Nom', e.nom], ['Prénom', e.prenom], ['Sexe', e.sexe],
    ['Téléphone', e.telephone], ['E-mail', e.email], ['Diplôme', e.diplome],
    ["Date d'embauche", dateFr(e.embauche)], ['Ancienneté', anciennete(e.embauche)]
  ]);

  /* --- Affectations --- */
  if (e.affectations.length){
    const tri = [...e.affectations].sort((a, b) =>
      ordreNiveaux.indexOf(a.niveau) - ordreNiveaux.indexOf(b.niveau));
    $('corpsAffectations').innerHTML = tri.map(a => `
      <tr>
        <td><b>${echapperHTML(a.matiere)}</b></td>
        <td>${a.classeNom}</td>
        <td>${a.filiere}</td>
        <td class="fin-centre">${a.coef}</td>
        <td class="fin">${a.heures} h / semaine</td>
      </tr>`).join('');
    $('totalAffectations').textContent =
      `${e.affectations.length} classe(s) · ${e.heuresTotal} h cumulées par semaine`;
  } else {
    $('corpsAffectations').innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune classe affectée pour le moment. Ouvrez la fiche d\'une classe, onglet « Matières », pour l\'y affecter.</td></tr>';
    $('totalAffectations').textContent = '';
  }

  /* --- Emploi du temps (module Emploi du temps : chargement asynchrone
     séparé, comme Absences/Finances côté élèves) --- */
  chargerEmploiEnseignant(e);

  /* --- Notes --- */
  remplirSelectNotesEns(e);

  $('vueListe').hidden = true;
  $('vueFiche').hidden = false;
  $('filSection').textContent = `Enseignants · ${e.nomComplet}`;
  choisirOnglet('profil');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const JOURS_ORDRE  = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const JOURS_LIBELLE = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi' };

async function chargerEmploiEnseignant(e){
  const reponse = await fetch(`php/seances.php?enseignant_id=${e.id}`);
  const seances = await reponse.json();

  const triees = [...seances].sort((a, b) =>
    JOURS_ORDRE.indexOf(a.jour) - JOURS_ORDRE.indexOf(b.jour) || a.heure_debut.localeCompare(b.heure_debut));

  $('panEmploi').innerHTML = `
    <div class="carte">
      <div class="carte-entete">
        <h3>Emploi du temps</h3>
        <span>${seances.length} cours / semaine</span>
      </div>
      <ul class="journal">
        ${triees.length ? triees.map(s => `
          <li>
            <span class="marqueur">${JOURS_LIBELLE[s.jour].slice(0, 2)}</span>
            <div>
              <p><b>${JOURS_LIBELLE[s.jour]}</b> ${s.heure_debut.slice(0, 5)}–${s.heure_fin.slice(0, 5)} — ${echapperHTML(s.matiere_nom)}</p>
              <small>${echapperHTML(s.classe_nom)} · ${echapperHTML(s.salle || s.classe_salle || 'Salle non précisée')}</small>
            </div>
          </li>`).join('') : '<li><div><p>Aucun cours programmé pour cet enseignant.</p></div></li>'}
      </ul>
    </div>`;
}

function ligne(paires){
  return paires.map(([cle, valeur]) =>
    `<div><dt>${cle}</dt><dd>${valeur ? echapperHTML(valeur) : '—'}</dd></div>`).join('');
}

$('btnRetour').addEventListener('click', () => {
  $('vueFiche').hidden = true;
  $('vueListe').hidden = false;
  $('filSection').textContent = 'Enseignants';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* =========================================================
   5. ONGLETS
   ========================================================= */
const panneaux = { profil:'panProfil', affectations:'panAffectations', emploi:'panEmploi', notes:'panNotes' };

function choisirOnglet(nom){
  document.querySelectorAll('.onglet').forEach(o =>
    o.classList.toggle('actif', o.dataset.onglet === nom));
  Object.entries(panneaux).forEach(([cle, id]) =>
    $(id).classList.toggle('visible', cle === nom));
}

document.querySelectorAll('.onglet').forEach(o =>
  o.addEventListener('click', () => choisirOnglet(o.dataset.onglet)));

/* =========================================================
   5bis. NOTES — saisie par l'enseignant, limitée à ses propres
   affectations (sa matière, dans ses classes). Une seule note par
   séquence (avec flèches +/−) ; réutilise les mêmes API que le
   module Notes (php/notes.php, php/evaluations.php).
   ========================================================= */
let ensAffectations   = [];
let ensClasseId       = null;
let ensMatiereId      = null;
let ensTrimestre      = 1;
let ensModifie        = false;
let ensChargement     = 0;
let ensEvaluationSeq1Id = null;
let ensEvaluationSeq2Id = null;

function confirmerAbandonEns(){
  return !ensModifie || confirm('Des notes n\'ont pas été enregistrées. Continuer sans enregistrer ?');
}

function formatMoyenneEns(valeur){
  return (valeur === null || valeur === undefined) ? '—' : valeur.toFixed(2).replace('.', ',');
}

function classeNoteEns(valeur){
  if (valeur === null || isNaN(valeur)) return '';
  if (valeur < 10) return 'faible';
  if (valeur >= 14) return 'bonne';
  return '';
}

function statutPuceEns(valeur){
  if (valeur === null || valeur === undefined) return '<span class="puce neutre">À saisir</span>';
  return valeur < 10
    ? '<span class="puce ko">Note faible</span>'
    : '<span class="puce ok">Notée</span>';
}

function initialesEleve(nom, prenom){ return ((prenom[0] || '') + (nom[0] || '')).toUpperCase(); }

/* Réinitialise l'onglet Notes pour l'enseignant dont la fiche vient de s'ouvrir :
   le menu déroulant ne propose que SES propres affectations (classe + matière). */
function remplirSelectNotesEns(enseignant){
  ensAffectations = enseignant.affectations;

  $('filtreAffectationNotes').innerHTML = '<option value="">Choisir une classe et une matière…</option>' +
    ensAffectations.map(a => `<option value="${a.classeId}:${a.matiereId}">${echapperHTML(a.matiere)} · ${echapperHTML(a.classeNom)} (Coef ${a.coef})</option>`).join('');

  ensClasseId = null;
  ensMatiereId = null;
  ensTrimestre = 1;
  ensModifie = false;

  document.querySelectorAll('#segmentsTrimestreEns .segment').forEach((s, i) => s.classList.toggle('actif', i === 0));

  afficherVideEns(ensAffectations.length
    ? 'Choisissez une classe et une matière pour saisir les notes.'
    : 'Aucune classe affectée pour le moment : rien à noter tant que cet enseignant n\'est pas affecté à une classe.');
}

function afficherVideEns(message){
  $('corpsNotesEns').innerHTML = '';
  $('enteteNotesEns').innerHTML = '';
  $('carteNotesEns').hidden = true;
  $('carteRecapAnnuelEns').hidden = true;
  $('messageVideEns').classList.add('visible');
  $('messageVideEns').textContent = message;
}

/* Une séquence n'a plus qu'une seule évaluation (coefficient 1) :
   on réutilise la première trouvée, ou on la crée à la volée. */
async function assurerEvaluationUniqueEns(classeId, matiereId, sequence){
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

function construireEnteteEns(){
  $('enteteNotesEns').innerHTML = `
    <tr>
      <th>Élève</th>
      <th>Matricule</th>
      <th class="fin-centre">Séquence ${ensTrimestre * 2 - 1}</th>
      <th class="fin-centre">Séquence ${ensTrimestre * 2}</th>
      <th class="fin-centre entete-moyenne">Moyenne</th>
      <th class="fin">Statut</th>
    </tr>`;
}

function celluleNoteEns(valeur, inscriptionId, evaluationId){
  return `
    <td class="cellule-note">
      <div class="compteur-note">
        <button type="button" class="compteur-note-btn" data-role="moins" tabindex="-1" aria-label="Diminuer la note">−</button>
        <input type="number" class="champ-note ${classeNoteEns(valeur !== null ? valeur : null)}" min="0" max="20" step="0.25"
               data-evaluation="${evaluationId}" data-inscription="${inscriptionId}"
               value="${valeur !== null ? valeur : ''}" placeholder="--">
        <button type="button" class="compteur-note-btn" data-role="plus" tabindex="-1" aria-label="Augmenter la note">+</button>
      </div>
    </td>`;
}

function ligneHTMLEns(eleve){
  return `
    <tr data-inscription="${eleve.inscription_id}">
      <td>
        <div class="identite">
          <span class="avatar">${initialesEleve(eleve.nom, eleve.prenom)}</span>
          <div><b>${echapperHTML(eleve.prenom)} ${echapperHTML(eleve.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(eleve.matricule)}</td>
      ${celluleNoteEns(eleve.sequence1, eleve.inscription_id, ensEvaluationSeq1Id)}
      ${celluleNoteEns(eleve.sequence2, eleve.inscription_id, ensEvaluationSeq2Id)}
      <td class="fin-centre entete-moyenne" data-moyenne>${formatMoyenneEns(eleve.trimestre)}</td>
      <td class="fin" data-statut>${statutPuceEns(eleve.trimestre)}</td>
    </tr>`;
}

function recalcLigneEns(tr){
  const champs = [...tr.querySelectorAll('.champ-note')];
  let somme = 0, nb = 0;

  champs.forEach(champ => {
    champ.classList.remove('faible', 'bonne');
    const brut = champ.value.trim();
    if (brut === '') return;
    const val = parseFloat(brut);
    if (isNaN(val)) return;

    const classe = classeNoteEns(val);
    if (classe) champ.classList.add(classe);
    somme += val;
    nb++;
  });

  const moyenne = nb === champs.length ? Math.round((somme / nb) * 100) / 100 : null;
  tr.querySelector('[data-moyenne]').textContent = formatMoyenneEns(moyenne);
  tr.querySelector('[data-statut]').innerHTML = statutPuceEns(moyenne);
  return moyenne;
}

/* --- Récapitulatif annuel (affiché uniquement au trimestre 3) --- */
function ligneRecapAnnuelHTMLEns(eleve){
  return `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${initialesEleve(eleve.nom, eleve.prenom)}</span>
          <div><b>${echapperHTML(eleve.prenom)} ${echapperHTML(eleve.nom)}</b></div>
        </div>
      </td>
      <td>${echapperHTML(eleve.matricule)}</td>
      <td class="fin-centre">${formatMoyenneEns(eleve.t1)}</td>
      <td class="fin-centre">${formatMoyenneEns(eleve.t2)}</td>
      <td class="fin-centre">${formatMoyenneEns(eleve.t3)}</td>
      <td class="fin-centre entete-moyenne">${formatMoyenneEns(eleve.annuelle)}</td>
    </tr>`;
}

async function chargerRecapAnnuelEns(classeId, matiereId){
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

  $('corpsRecapAnnuelEns').innerHTML = eleves.map(ligneRecapAnnuelHTMLEns).join('');
  $('carteRecapAnnuelEns').hidden = eleves.length === 0;
}

async function chargerGrilleEns(){
  ensModifie = false;

  if (!ensClasseId || !ensMatiereId) {
    afficherVideEns('Choisissez une classe et une matière pour saisir les notes.');
    return;
  }

  const jeton = ++ensChargement;
  const seq1 = ensTrimestre * 2 - 1;
  const seq2 = ensTrimestre * 2;

  const [id1, id2] = await Promise.all([
    assurerEvaluationUniqueEns(ensClasseId, ensMatiereId, seq1),
    assurerEvaluationUniqueEns(ensClasseId, ensMatiereId, seq2)
  ]);
  if (jeton !== ensChargement) return;
  ensEvaluationSeq1Id = id1;
  ensEvaluationSeq2Id = id2;

  const reponse = await fetch(`php/notes.php?classe_id=${ensClasseId}&matiere_id=${ensMatiereId}&trimestre=${ensTrimestre}`);
  const eleves  = await reponse.json();
  if (jeton !== ensChargement) return;

  if (!eleves.length) { afficherVideEns('Aucun élève inscrit et validé dans cette classe.'); return; }

  $('carteNotesEns').hidden      = false;
  $('messageVideEns').classList.remove('visible');

  construireEnteteEns();
  $('corpsNotesEns').innerHTML = eleves.map(ligneHTMLEns).join('');
  $('compteResultatsEns').textContent = `${eleves.length} élève${eleves.length > 1 ? 's' : ''}.`;

  if (ensTrimestre === 3) await chargerRecapAnnuelEns(ensClasseId, ensMatiereId);
  else $('carteRecapAnnuelEns').hidden = true;
}

$('filtreAffectationNotes').addEventListener('change', () => {
  const valeurPrecedente = ensClasseId ? `${ensClasseId}:${ensMatiereId}` : '';
  if (!confirmerAbandonEns()) { $('filtreAffectationNotes').value = valeurPrecedente; return; }

  const [classeId, matiereId] = $('filtreAffectationNotes').value.split(':');
  ensClasseId  = classeId || null;
  ensMatiereId = matiereId || null;
  chargerGrilleEns();
});

$('segmentsTrimestreEns').addEventListener('click', e => {
  const bouton = e.target.closest('.segment');
  if (!bouton || bouton.classList.contains('actif')) return;
  if (!confirmerAbandonEns()) return;
  ensTrimestre = parseInt(bouton.dataset.trimestre, 10);
  document.querySelectorAll('#segmentsTrimestreEns .segment').forEach(s => s.classList.toggle('actif', s === bouton));
  chargerGrilleEns();
});

$('corpsNotesEns').addEventListener('input', e => {
  const champ = e.target.closest('.champ-note');
  if (!champ) return;
  ensModifie = true;
  recalcLigneEns(champ.closest('tr'));
});

$('corpsNotesEns').addEventListener('click', e => {
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

$('btnEnregistrerEns').addEventListener('click', async () => {
  const champs = [...document.querySelectorAll('#corpsNotesEns .champ-note')];
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

    ensModifie = false;
    notifier('Les notes ont été enregistrées.');
    await chargerGrilleEns();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   6. AJOUT, MODIFICATION ET SUPPRESSION D'UN ENSEIGNANT
   ========================================================= */
const fenetre = $('fenetreEnseignant');
let matriculeEnEdition = null;

async function rafraichirTout(){
  enseignants = await chargerEnseignants();
  remplirFiltreMatiere();
  afficherListe();
  majIndicateurs();
}

$('btnNouveau').addEventListener('click', () => {
  matriculeEnEdition = null;
  $('formEnseignant').reset();
  document.querySelectorAll('#formEnseignant .invalide').forEach(c => c.classList.remove('invalide'));
  $('btnValiderEnseignant').textContent = "Ajouter l'enseignant";
  fenetre.querySelector('.fenetre-barre b').textContent = 'Ajouter un enseignant';
  fenetre.classList.add('visible');
  $('eNom').focus();
});

$('btnModifierEnseignant').addEventListener('click', () => {
  const e = enseignants.find(x => x.matricule === matriculeAffiche);
  if (!e) return;
  matriculeEnEdition = e.matricule;

  $('formEnseignant').reset();
  document.querySelectorAll('#formEnseignant .invalide').forEach(c => c.classList.remove('invalide'));
  $('eNom').value = e.nom;
  $('ePrenom').value = e.prenom;
  $('eSexe').value = e.sexe;
  $('eTelephone').value = e.telephone === '—' ? '' : e.telephone;
  $('eEmail').value = e.email === '—' ? '' : e.email;
  $('eDiplome').value = e.diplome === '—' ? '' : e.diplome;
  $('eEmbauche').value = e.embauche || '';

  $('btnValiderEnseignant').textContent = 'Enregistrer les modifications';
  fenetre.querySelector('.fenetre-barre b').textContent = `Modifier ${e.prenom} ${e.nom}`;
  fenetre.classList.add('visible');
  $('eNom').focus();
});

$('btnSupprimerEnseignant').addEventListener('click', async () => {
  const e = enseignants.find(x => x.matricule === matriculeAffiche);
  if (!e) return;
  if (!confirm(`Supprimer définitivement ${e.prenom} ${e.nom} (${e.matricule}) ?`)) return;

  const reponse = await fetch(`php/enseignants.php?id=${e.id}`, { method: 'DELETE' });
  if (!reponse.ok){
    const { erreur } = await reponse.json();
    notifier(erreur || 'Impossible de supprimer cet enseignant.');
    return;
  }

  await rafraichirTout();
  $('btnRetour').click();
  notifier(`${e.prenom} ${e.nom} a été supprimé(e).`);
});

function fermerFenetre(){ fenetre.classList.remove('visible'); }
$('fermerFenetre').addEventListener('click', fermerFenetre);
$('annulerEnseignant').addEventListener('click', fermerFenetre);
fenetre.addEventListener('click', e => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetre.classList.contains('visible')) fermerFenetre();
});

$('formEnseignant').addEventListener('submit', async e => {
  e.preventDefault();

  const champs = ['eNom', 'ePrenom', 'eTelephone'];
  let premierFautif = null;
  champs.forEach(id => {
    const champ = $(id);
    const vide = !champ.value.trim();
    champ.classList.toggle('invalide', vide);
    if (vide && !premierFautif) premierFautif = champ;
  });
  if (premierFautif){
    premierFautif.focus();
    notifier('Certains champs obligatoires sont vides.');
    return;
  }

  const profil = {
    civilite: $('eSexe').value === 'Masculin' ? 'M.' : 'Mme',
    nom: $('eNom').value.trim(),
    prenom: $('ePrenom').value.trim(),
    sexe: $('eSexe').value,
    telephone: $('eTelephone').value.trim(),
    email: $('eEmail').value.trim(),
    diplome: $('eDiplome').value.trim(),
    date_embauche: $('eEmbauche').value || null
  };

  const url    = matriculeEnEdition ? `php/enseignants.php?id=${enseignants.find(x => x.matricule === matriculeEnEdition).id}` : 'php/enseignants.php';
  const methode = matriculeEnEdition ? 'PUT' : 'POST';
  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profil)
  });

  if (!reponse.ok){
    const { erreur } = await reponse.json();
    notifier(erreur || 'Échec de l\'enregistrement.');
    return;
  }

  fermerFenetre();
  await rafraichirTout();
  if (matriculeEnEdition){
    ouvrirFiche(matriculeEnEdition);
    notifier(`${profil.prenom} ${profil.nom} a été mis(e) à jour.`);
  } else {
    notifier(`${profil.prenom} ${profil.nom} a été ajouté(e).`);
  }
});

/* =========================================================
   7. EXPORT CSV
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
  const lignes = enseignants.map(e => [
    e.matricule, e.nomComplet, e.sexe, e.matieres.join(' / ') || '—',
    e.niveaux.map(n => nomsNiveaux[n] || n).join(', ') || '—',
    e.heuresTotal, e.telephone, dateFr(e.embauche)
  ]);
  exporterCSV(
    `enseignants-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Matricule','Nom complet','Sexe','Matière(s)','Niveaux','Volume horaire','Téléphone',"Date d'embauche"],
    lignes
  );
  notifier(`${lignes.length} enseignants exportés.`);
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
rafraichirTout();

});
