/* =========================================================
   SCOLARIS — Module Classes
   Structure par NIVEAU et par FILIÈRE — données réelles
   (php/classes.php, php/inscriptions.php, php/enseignants.php,
   php/niveaux.php, php/annees_scolaires.php, php/affectations.php)
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

/* =========================================================
   1. RÉFÉRENCES DE PRÉSENTATION
   Structure du curriculum (niveaux, filières autorisées) : fixe
   pour l'établissement, indépendante des données en base.
   ========================================================= */
const nomsFilieres = { TC:'Tronc commun', ESP:'Espagnol', ALL:'Allemand', C:'Série C', D:'Série D' };
const nomsNiveaux = {
  '6e':'Sixième', '5e':'Cinquième', '4e':'Quatrième', '3e':'Troisième',
  '2nde':'Seconde', '1ère':'Première', 'Tle':'Terminale'
};
const filieresParNiveau = {
  '6e':   ['TC'],
  '5e':   ['TC'],
  '4e':   ['ESP','ALL'],
  '3e':   ['ESP','ALL'],
  '2nde': ['C','ESP','ALL'],
  '1ère': ['C','D','ESP','ALL'],
  'Tle':  ['C','D','ESP','ALL']
};
const ordreNiveaux = ['6e','5e','4e','3e','2nde','1ère','Tle'];

/* =========================================================
   2. DONNÉES — chargées depuis la base de données
   ========================================================= */
let classes = [];
let enseignants = [];
let catalogueMatieres = [];
let niveauIdParCode = {};
let anneeActiveId = null;

async function chargerTout(){
  const [rClasses, rInscriptions, rEnseignants, rNiveaux, rAnnees, rAffectations, rMatieres] = await Promise.all([
    fetch('php/classes.php'),
    fetch('php/inscriptions.php'),
    fetch('php/enseignants.php'),
    fetch('php/niveaux.php'),
    fetch('php/annees_scolaires.php'),
    fetch('php/affectations.php'),
    fetch('php/matieres.php')
  ]);
  const [donneesClasses, inscriptions, donneesEnseignants, donneesNiveaux, annees, affectations, donneesMatieres] = await Promise.all([
    rClasses.json(), rInscriptions.json(), rEnseignants.json(), rNiveaux.json(), rAnnees.json(), rAffectations.json(), rMatieres.json()
  ]);

  enseignants = donneesEnseignants;
  catalogueMatieres = donneesMatieres;
  niveauIdParCode = {};
  donneesNiveaux.forEach(n => { niveauIdParCode[n.code] = n.id; });

  const active = annees.find(a => a.statut === 'active') || annees[0] || null;
  anneeActiveId = active ? active.id : null;

  const inscriptionsValidees = inscriptions.filter(i => i.statut === 'validee');
  const affectationsParClasse = {};
  affectations.forEach(a => { (affectationsParClasse[a.classe_id] ||= []).push(a); });

  classes = donneesClasses.map(c => ({
    id: c.id, code: c.code, nom: c.nom, niveau: c.niveau_code, niveauNom: c.niveau_nom,
    filiere: c.filiere, capacite: c.capacite, salle: c.salle || '—',
    fraisInscription: c.frais_inscription, fraisScolarite: c.frais_scolarite,
    principalId: c.professeur_principal_id,
    principalNom: c.professeur_principal_id ? `${c.pp_civilite} ${c.pp_nom}` : 'Non désigné',
    eleves: inscriptionsValidees.filter(i => i.classe_id === c.id).map(i => ({
      nom: i.nom, prenom: i.prenom, sexe: i.sexe, matricule: i.matricule, type: i.type,
      montantDu: i.montant_du, montantVerse: i.montant_verse
    })),
    matieres: (affectationsParClasse[c.id] || []).map(a => ({
      id: a.id, matiereId: a.matiere_id, enseignantId: a.enseignant_id,
      matiere: a.matiere_nom, coef: a.coefficient, heures: a.volume_horaire,
      enseignant: `${a.civilite} ${a.enseignant_nom}`
    }))
  }));
}

async function rafraichirTout(){
  await chargerTout();
  afficherClasses();
  majIndicateurs();
}

/* =========================================================
   3. OUTILS
   ========================================================= */
const $ = id => document.getElementById(id);

const argent = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
const nombre = (n, d = 2) => n.toFixed(d).replace('.', ',');
const initiales = (prenom, nom) => (prenom[0] + nom[0]).toUpperCase();

const tauxRemplissage = c => Math.round(c.eleves.length / c.capacite * 100);

/* Pastille de filière : en tronc commun (6e/5e), les classes ne se
   distinguent que par leur lettre (6e A, 6e B…) — afficher « TC » partout
   ne permettrait pas de les différencier d'un coup d'œil, donc on affiche
   plutôt cette lettre (dernier mot du nom, ex. « A » pour « 6ᵉ A »). Les
   autres filières (ESP, ALL, C, D) restent affichées telles quelles. */
function libellePastille(c){
  if (c.filiere !== 'TC') return c.filiere;
  const mots = c.nom.trim().split(/\s+/);
  return mots[mots.length - 1] || c.filiere;
}

function financesClasse(c){
  const du     = c.eleves.reduce((s, e) => s + e.montantDu, 0);
  const verse  = c.eleves.reduce((s, e) => s + e.montantVerse, 0);
  const taux   = du > 0 ? Math.round(verse / du * 100) : 100;
  return { du, verse, taux };
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

/* =========================================================
   4. LISTE DES CLASSES
   ========================================================= */
function afficherClasses(){
  const texte   = $('filtreNom').value.trim().toLowerCase();
  const niveau  = $('filtreNiveau').value;
  const filiere = $('filtreFiliere').value;
  const tri     = $('filtreTri').value;

  const visibles = classes.filter(c => {
    if (texte && !(`${c.nom} ${c.principalNom} ${c.salle}`.toLowerCase().includes(texte))) return false;
    if (niveau && c.niveau !== niveau) return false;
    if (filiere && c.filiere !== filiere) return false;
    return true;
  });

  visibles.sort((a, b) => {
    if (tri === 'effectif')      return b.eleves.length - a.eleves.length;
    if (tri === 'recouvrement')  return financesClasse(b).taux - financesClasse(a).taux;
    const d = ordreNiveaux.indexOf(a.niveau) - ordreNiveaux.indexOf(b.niveau);
    return d !== 0 ? d : a.nom.localeCompare(b.nom, 'fr');
  });

  $('grilleClasses').innerHTML = visibles.map(c => {
    const taux = tauxRemplissage(c);
    const etatBarre = taux >= 100 ? 'complet' : taux >= 90 ? 'tendu' : '';
    const filles = c.eleves.filter(e => e.sexe === 'F').length;
    const ajour  = c.eleves.filter(e => e.montantDu - e.montantVerse <= 0).length;
    const heures = c.matieres.reduce((s, m) => s + m.heures, 0);

    return `
      <button class="classe" data-id="${c.id}">
        ${taux >= 100 ? '<span class="marqueur-complet">Complète</span>' : ''}
        <div class="classe-tete">
          <span class="pastille-classe ${c.filiere === 'TC' ? '' : 'lycee'}">${libellePastille(c)}</span>
          <div>
            <b>${c.nom}</b>
            <small>${nomsFilieres[c.filiere] || c.filiere} · Salle ${c.salle}</small>
          </div>
        </div>

        <div class="classe-ligne"><span>Professeur principal</span><b>${c.principalNom}</b></div>
        <div class="classe-ligne"><span>Filles / Garçons</span><b>${filles} / ${c.eleves.length - filles}</b></div>
        <div class="classe-ligne"><span>Matières · heures</span><b>${c.matieres.length} · ${heures} h</b></div>
        <div class="classe-ligne"><span>Scolarité à jour</span><b>${ajour} / ${c.eleves.length}</b></div>

        <div class="remplissage">
          <div class="remplissage-tete">
            <span>Effectif</span>
            <span><b>${c.eleves.length}</b> / ${c.capacite} places</span>
          </div>
          <div class="rail-remplissage"><i class="${etatBarre}" style="width:${Math.min(taux, 100)}%"></i></div>
        </div>
      </button>`;
  }).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
}

function majIndicateurs(){
  const totalEleves = classes.reduce((s, c) => s + c.eleves.length, 0);
  const totalPlaces = classes.reduce((s, c) => s + c.capacite, 0);
  const premier = classes.filter(c => ['6e','5e','4e','3e'].includes(c.niveau)).length;
  const saturees = classes.filter(c => tauxRemplissage(c) >= 90).length;

  $('kpiClasses').textContent = classes.length;
  $('kpiCycles').textContent  = `${premier} au premier cycle · ${classes.length - premier} au second`;
  $('kpiEleves').textContent  = totalEleves;
  $('kpiPlaces').textContent  = `${totalPlaces - totalEleves} places restantes`;
  $('kpiMoyenneEffectif').textContent = classes.length ? Math.round(totalEleves / classes.length) : 0;
  $('kpiSaturees').textContent = saturees;

  $('jaugeRemplissage').style.width = (totalPlaces ? Math.round(totalEleves / totalPlaces * 100) : 0) + '%';
  $('jaugeSaturees').style.width    = (classes.length ? Math.round(saturees / classes.length * 100) : 0) + '%';
}

['filtreNom', 'filtreNiveau', 'filtreFiliere', 'filtreTri'].forEach(id => {
  $(id).addEventListener('input', afficherClasses);
  $(id).addEventListener('change', afficherClasses);
});

$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherClasses();
});

$('grilleClasses').addEventListener('click', e => {
  const carte = e.target.closest('.classe');
  if (carte) ouvrirFiche(Number(carte.dataset.id));
});

/* =========================================================
   5. FICHE DE CLASSE
   ========================================================= */
let idAffiche = null;
let trimestreStatsActif = 1;

/* ---------- Assimilation des cours (évaluations, php/statistiques_classe.php) ---------- */
function classeAppreciation(texte){
  if (texte === 'Très faible' || texte === 'Faible') return 'ko';
  if (texte === 'Bien' || texte === 'Très bien' || texte === 'Excellent') return 'ok';
  return 'neutre';
}

async function chargerAssimilation(classeId, trimestre){
  const reponse = await fetch(`php/statistiques_classe.php?classe_id=${classeId}&trimestre=${trimestre}`);
  if (!reponse.ok) return;
  const d = await reponse.json();

  const vide = $('assimilationVide');
  const contenu = $('assimilationContenu');

  if (!d.effectif_note){
    vide.classList.add('visible');
    contenu.hidden = true;
    return;
  }
  vide.classList.remove('visible');
  contenu.hidden = false;

  $('listeAssimilation').innerHTML = ligne([
    ['Moyenne générale de la classe', nombre(d.moyenne_classe) + ' / 20'],
    ['Taux de réussite (≥ 10/20)', `${d.taux_reussite} %`],
    ['Élèves notés ce trimestre', `${d.effectif_note} / ${d.effectif}`]
  ]);

  const maxMatiere = Math.max(...d.par_matiere.map(m => m.moyenne_classe || 0), 1);
  $('grapheMatieres').innerHTML = d.par_matiere.map(m => `
    <div class="colonne">
      <div class="paire"><i style="height:${(m.moyenne_classe || 0) / maxMatiere * 100}%" title="${m.matiere} : ${m.moyenne_classe !== null ? nombre(m.moyenne_classe) : '—'}/20"></i></div>
      <span title="${m.matiere}">${m.matiere}</span>
    </div>`).join('');

  const maxAppreciation = Math.max(...d.repartition_appreciations.map(a => a.effectif), 1);
  $('grapheAppreciations').innerHTML = d.repartition_appreciations.map(a => `
    <div class="colonne">
      <div class="paire"><i class="${classeAppreciation(a.appreciation)}" style="height:${a.effectif / maxAppreciation * 100}%" title="${a.effectif} élève(s)"></i></div>
      <span>${a.appreciation}</span>
    </div>`).join('');
}

$('segmentsTrimestreStats').addEventListener('click', e => {
  const bouton = e.target.closest('.segment');
  if (!bouton || bouton.classList.contains('actif') || !idAffiche) return;
  trimestreStatsActif = parseInt(bouton.dataset.trimestre, 10);
  document.querySelectorAll('#segmentsTrimestreStats .segment').forEach(s => s.classList.toggle('actif', s === bouton));
  chargerAssimilation(idAffiche, trimestreStatsActif);
});

function ouvrirFiche(id){
  const c = classes.find(x => x.id === id);
  if (!c) return;
  idAffiche = id;

  const taux   = tauxRemplissage(c);
  const filles = c.eleves.filter(e => e.sexe === 'F').length;
  const { du, verse, taux: recouvrement } = financesClasse(c);

  /* --- En-tête --- */
  $('fichePastille').textContent = libellePastille(c);
  $('fichePastille').classList.add('classe-pastille');
  $('ficheNom').textContent = c.nom;
  $('ficheResume').textContent =
    `${nomsNiveaux[c.niveau] || c.niveauNom} · ${nomsFilieres[c.filiere] || c.filiere} · Salle ${c.salle} · Professeur principal : ${c.principalNom}`;

  const etiquettes = [
    `<span class="ambre">${c.eleves.length} / ${c.capacite} élèves</span>`,
    `<span>${recouvrement} % recouvrés</span>`
  ];
  if (taux >= 100)      etiquettes.push('<span class="rouge">Classe complète</span>');
  else if (taux >= 90)  etiquettes.push('<span class="rouge">Presque saturée</span>');
  else                  etiquettes.push(`<span class="vert">${c.capacite - c.eleves.length} places libres</span>`);
  $('ficheEtiquettes').innerHTML = etiquettes.join('');

  /* --- Effectif --- */
  const classement = [...c.eleves].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('compteEffectif').textContent = `${filles} filles · ${c.eleves.length - filles} garçons`;
  $('corpsEffectif').innerHTML = classement.length ? classement.map((e, i) => {
    const reste = e.montantDu - e.montantVerse;
    const etat = reste <= 0
      ? '<span class="puce ok">À jour</span>'
      : (e.montantVerse === 0
          ? '<span class="puce ko">Rien versé</span>'
          : `<span class="puce att">${argent(reste)} dus</span>`);
    return `
      <tr>
        <td class="numero">${String(i + 1).padStart(2, '0')}</td>
        <td>
          <div class="identite">
            <span class="avatar">${initiales(e.prenom, e.nom)}</span>
            <div><b>${e.prenom} ${e.nom}</b></div>
          </div>
        </td>
        <td>${e.matricule}</td>
        <td>${e.sexe === 'F' ? 'Féminin' : 'Masculin'}</td>
        <td class="fin colonne-ecran">${etat}</td>
        <td class="fin colonne-impression"><span class="case-presence"></span></td>
      </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--texte-doux);padding:26px">Aucun élève inscrit dans cette classe pour le moment.</td></tr>';

  /* --- Matières affectées --- */
  const totalCoef   = c.matieres.reduce((s, m) => s + m.coef, 0);
  const totalHeures = c.matieres.reduce((s, m) => s + m.heures, 0);
  $('totalCoef').textContent = c.matieres.length
    ? `${c.matieres.length} matières · ${totalCoef} points de coefficient · ${totalHeures} h par semaine`
    : 'Aucune matière affectée';

  $('corpsMatieres').innerHTML = c.matieres.length ? c.matieres.map(m => `
    <tr>
      <td><b>${m.matiere}</b></td>
      <td>${m.coef}</td>
      <td>${m.heures} h / semaine</td>
      <td>${m.enseignant}</td>
      <td class="fin"><button class="action" data-retirer="${m.id}">Retirer</button></td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune matière n\'a encore été affectée à cette classe.</td></tr>';

  $('afMatiere').innerHTML = '<option value="">Matière</option>'
    + catalogueMatieres.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
  $('afEnseignant').innerHTML = '<option value="">Enseignant</option>'
    + enseignants.map(e => `<option value="${e.id}">${e.civilite} ${e.nom} ${e.prenom}</option>`).join('');
  $('afCoef').value = '';
  $('afHeures').value = '';

  /* --- Situation financière --- */
  const repartition = [
    { libelle:'À jour',  valeur: c.eleves.filter(e => e.montantDu - e.montantVerse <= 0).length },
    { libelle:'Partiel', valeur: c.eleves.filter(e => e.montantVerse > 0 && e.montantDu - e.montantVerse > 0).length },
    { libelle:'Impayé',  valeur: c.eleves.filter(e => e.montantVerse === 0 && e.montantDu > 0).length }
  ];
  const maximum = Math.max(...repartition.map(r => r.valeur), 1);

  $('moyenneClasse').innerHTML = `<span class="moyenne-generale">${recouvrement} % recouvrés</span>`;
  $('grapheMoyennes').innerHTML = repartition.map(r => `
    <div class="colonne">
      <div class="paire"><i style="height:${r.valeur / maximum * 100}%" title="${r.valeur} élève(s)"></i></div>
      <span>${r.libelle}</span>
    </div>`).join('');

  /* --- Assimilation des cours (repart toujours du trimestre 1 à l'ouverture) --- */
  trimestreStatsActif = 1;
  document.querySelectorAll('#segmentsTrimestreStats .segment').forEach(s => s.classList.toggle('actif', s.dataset.trimestre === '1'));
  chargerAssimilation(c.id, trimestreStatsActif);

  if (c.eleves.length){
    const nouveaux       = c.eleves.filter(e => e.type === 'Nouvel élève').length;
    const reinscriptions = c.eleves.filter(e => e.type === 'Réinscription').length;
    const transferts     = c.eleves.filter(e => e.type === 'Transfert').length;

    $('listeStats').innerHTML = ligne([
      ['Taux de remplissage', `${taux} % (${c.eleves.length} / ${c.capacite})`],
      ['Nouveaux élèves', nouveaux],
      ['Réinscriptions', reinscriptions],
      ['Transferts', transferts],
      ['Total des frais dus', argent(du)],
      ['Total déjà versé', argent(verse)],
      ['Reste à recouvrer', argent(Math.max(0, du - verse))]
    ]);
  } else {
    $('listeStats').innerHTML = ligne([['Taux de remplissage', `0 % (0 / ${c.capacite})`]])
      + '<p class="vide visible">Aucun élève inscrit dans cette classe pour le moment.</p>';
  }

  /* --- Informations --- */
  $('listeInfos').innerHTML = ligne([
    ['Niveau', nomsNiveaux[c.niveau] || c.niveauNom],
    ['Filière', nomsFilieres[c.filiere] || c.filiere],
    ['Code interne', c.code],
    ['Salle attribuée', c.salle],
    ['Professeur principal', c.principalNom],
    ['Capacité maximale', `${c.capacite} élèves`],
    ['Effectif actuel', `${c.eleves.length} élèves (${taux} %)`],
    ['Volume hebdomadaire', `${totalHeures} heures`]
  ]);

  $('listeFrais').innerHTML = ligne([
    ['Frais d\'inscription', argent(c.fraisInscription)],
    ['Scolarité annuelle', argent(c.fraisScolarite)],
    ['Total par élève', argent(c.fraisInscription + c.fraisScolarite)],
    ['Recette attendue', argent((c.fraisInscription + c.fraisScolarite) * c.eleves.length)]
  ]);

  /* --- Bascule --- */
  $('vueListe').hidden = true;
  $('vueFiche').hidden = false;
  $('filSection').textContent = `Classes · ${c.nom}`;
  choisirOnglet('effectif');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ligne(paires){
  return paires.map(([cle, valeur]) => `<div><dt>${cle}</dt><dd>${valeur}</dd></div>`).join('');
}

$('btnRetour').addEventListener('click', () => {
  $('vueFiche').hidden = true;
  $('vueListe').hidden = false;
  $('filSection').textContent = 'Classes';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* =========================================================
   6. ONGLETS
   ========================================================= */
const panneaux = {
  effectif:'panEffectif', matieres:'panMatieres',
  stats:'panStats', infos:'panInfos'
};

function choisirOnglet(nom){
  document.querySelectorAll('.onglet').forEach(o =>
    o.classList.toggle('actif', o.dataset.onglet === nom));
  Object.entries(panneaux).forEach(([cle, id]) =>
    $(id).classList.toggle('visible', cle === nom));
}

document.querySelectorAll('.onglet').forEach(o =>
  o.addEventListener('click', () => choisirOnglet(o.dataset.onglet)));

/* =========================================================
   7. ACTIONS
   ========================================================= */
$('btnListeAppel').addEventListener('click', () => {
  choisirOnglet('effectif');
  setTimeout(() => window.print(), 200);
});

/* ---------- Affectation d'une matière à la classe ouverte ---------- */
$('formAffectation').addEventListener('submit', async e => {
  e.preventDefault();
  const matiereId    = $('afMatiere').value;
  const enseignantId = $('afEnseignant').value;
  const coef         = Number($('afCoef').value);
  const heures       = Number($('afHeures').value);

  if (!matiereId || !enseignantId || !coef || !heures){
    notifier('Choisissez une matière, un enseignant, un coefficient et un volume horaire.');
    return;
  }

  const reponse = await fetch('php/affectations.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enseignant_id: Number(enseignantId), matiere_id: Number(matiereId),
      classe_id: idAffiche, coefficient: coef, volume_horaire: heures
    })
  });
  const resultat = await reponse.json();
  if (!reponse.ok){
    notifier(resultat.erreur || 'Échec de l\'affectation.');
    return;
  }

  const id = idAffiche;
  await rafraichirTout();
  ouvrirFiche(id);
  choisirOnglet('matieres');
  notifier('La matière a été affectée à la classe.');
});

$('corpsMatieres').addEventListener('click', async e => {
  const bouton = e.target.closest('button[data-retirer]');
  if (!bouton) return;
  if (!confirm('Retirer cette matière de la classe ?')) return;

  const reponse = await fetch(`php/affectations.php?id=${bouton.dataset.retirer}`, { method: 'DELETE' });
  if (!reponse.ok){
    const { erreur } = await reponse.json();
    notifier(erreur || 'Échec du retrait.');
    return;
  }

  const id = idAffiche;
  await rafraichirTout();
  ouvrirFiche(id);
  choisirOnglet('matieres');
  notifier('La matière a été retirée de la classe.');
});

/* ---------- Création et modification d'une classe ---------- */
const fenetre = $('fenetreClasse');
let idEnEdition = null;

$('btnNouvelle').addEventListener('click', () => ouvrirFenetre(null));
$('btnModifier').addEventListener('click', () => {
  const c = classes.find(x => x.id === idAffiche);
  if (c) ouvrirFenetre(c);
});

$('btnSupprimerClasse').addEventListener('click', async () => {
  const c = classes.find(x => x.id === idAffiche);
  if (!c) return;

  const avertissement = c.eleves.length
    ? ` Elle compte actuellement ${c.eleves.length} élève(s) inscrit(s) : la suppression sera refusée tant qu'ils y sont rattachés.`
    : '';
  if (!confirm(`Supprimer définitivement la classe ${c.nom} ?${avertissement}`)) return;

  try {
    const reponse = await fetch(`php/classes.php?id=${c.id}`, { method: 'DELETE' });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la suppression.');

    await rafraichirTout();
    $('btnRetour').click();
    notifier(`La classe ${c.nom} a été supprimée.`);
  } catch (erreur) {
    notifier(erreur.message);
  }
});

function remplirSelectPrincipal(idActuel){
  $('cPrincipal').innerHTML = '<option value="">— Aucun pour l\'instant —</option>'
    + enseignants.map(e => `<option value="${e.id}">${e.civilite} ${e.nom} ${e.prenom}</option>`).join('');
  $('cPrincipal').value = idActuel || '';
}

function ouvrirFenetre(classeAModifier){
  $('formClasse').reset();
  document.querySelectorAll('#formClasse .invalide').forEach(e => e.classList.remove('invalide'));
  idEnEdition = classeAModifier ? classeAModifier.id : null;
  $('boutonValiderClasse').textContent = classeAModifier ? 'Enregistrer les modifications' : 'Créer la classe';

  if (classeAModifier){
    $('titreFenetre').textContent = `Modifier ${classeAModifier.nom}`;
    $('cNiveau').innerHTML = `<option value="${classeAModifier.niveau}">${nomsNiveaux[classeAModifier.niveau] || classeAModifier.niveauNom}</option>`;
    $('cNiveau').value = classeAModifier.niveau;
    $('cNiveau').disabled = true;
    $('cFiliere').innerHTML = `<option value="${classeAModifier.filiere}">${nomsFilieres[classeAModifier.filiere] || classeAModifier.filiere}</option>`;
    $('cFiliere').value = classeAModifier.filiere;
    $('cFiliere').disabled = true;
    $('cNom').value = classeAModifier.nom;
    $('cNom').disabled = true;
    $('cCapacite').value = classeAModifier.capacite;
    $('cSalle').value = classeAModifier.salle === '—' ? '' : classeAModifier.salle;
    remplirSelectPrincipal(classeAModifier.principalId);
    $('cInscription').value = classeAModifier.fraisInscription;
    $('cScolarite').value = classeAModifier.fraisScolarite;
    $('noteModifierClasse').hidden = false;
    $('apercuProgramme').className = 'apercu-programme';
    $('apercuProgramme').textContent =
      'Le programme (matières, coefficients, enseignants) se configure depuis l\'onglet « Matières » de la fiche de cette classe.';
  } else {
    $('cNiveau').innerHTML = '<option value="">— Choisir —</option>'
      + Object.keys(filieresParNiveau).map(n => `<option value="${n}">${nomsNiveaux[n]}</option>`).join('');
    $('cNiveau').disabled = false;
    $('cFiliere').innerHTML = '<option value="">Choisissez d\'abord un niveau</option>';
    $('cFiliere').disabled = true;
    $('cNom').disabled = false;
    $('titreFenetre').textContent = 'Créer une classe';
    remplirSelectPrincipal(null);
    $('apercuProgramme').className = 'apercu-programme';
    $('apercuProgramme').textContent =
      'Le programme (matières, coefficients, enseignants) sera à configurer depuis l\'onglet « Matières » de la fiche de la classe, une fois celle-ci créée.';
    $('noteModifierClasse').hidden = true;
  }

  fenetre.classList.add('visible');
  $('cNiveau').focus();
}

function fermerFenetre(){ fenetre.classList.remove('visible'); }

$('fermerFenetre').addEventListener('click', fermerFenetre);
$('annulerClasse').addEventListener('click', fermerFenetre);
fenetre.addEventListener('click', e => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetre.classList.contains('visible')) fermerFenetre();
});

/* Le niveau détermine les filières proposées */
$('cNiveau').addEventListener('change', () => {
  const niveau = $('cNiveau').value;
  const select = $('cFiliere');

  if (!niveau){
    select.innerHTML = '<option value="">Choisissez d\'abord un niveau</option>';
    select.disabled = true;
    return;
  }

  const possibles = filieresParNiveau[niveau];
  select.disabled = false;
  select.innerHTML = (possibles.length > 1 ? '<option value="">— Choisir —</option>' : '')
    + possibles.map(f => `<option value="${f}">${nomsFilieres[f]}</option>`).join('');

  proposerNom();
});

$('cFiliere').addEventListener('change', proposerNom);

/* Nom proposé automatiquement */
function proposerNom(){
  const niveau  = $('cNiveau').value;
  const filiere = $('cFiliere').value;
  if (!niveau || !filiere) return;

  const affichage = { '6e':'6ᵉ', '5e':'5ᵉ', '4e':'4ᵉ', '3e':'3ᵉ',
                      '2nde':'2ⁿᵈᵉ', '1ère':'1ʳᵉ', 'Tle':'Tle' }[niveau];

  const suffixe = filiere === 'TC'
    ? String.fromCharCode(65 + classes.filter(c => c.niveau === niveau).length)
    : (filiere === 'C' || filiere === 'D' ? filiere : nomsFilieres[filiere]);

  $('cNom').value = `${affichage} ${suffixe}`;

  /* Frais repris d'une classe du même niveau, si elle existe */
  const soeur = classes.find(c => c.niveau === niveau);
  if (soeur){
    $('cInscription').value = soeur.fraisInscription;
    $('cScolarite').value   = soeur.fraisScolarite;
  }
}

/* Enregistrement (création ou modification) */
$('formClasse').addEventListener('submit', async e => {
  e.preventDefault();

  const champs = idEnEdition
    ? ['cCapacite']
    : ['cNiveau', 'cFiliere', 'cNom', 'cCapacite'];
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

  const boutonValider = $('boutonValiderClasse');
  boutonValider.disabled = true;

  try {
    /* --- Modification d'une classe existante --- */
    if (idEnEdition){
      const reponse = await fetch(`php/classes.php?id=${idEnEdition}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capacite: Number($('cCapacite').value),
          salle: $('cSalle').value.trim(),
          professeur_principal_id: $('cPrincipal').value || null,
          frais_inscription: Number($('cInscription').value) || 0,
          frais_scolarite: Number($('cScolarite').value) || 0
        })
      });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la mise à jour.');

      const nomClasse = $('cNom').value.trim();
      fermerFenetre();
      await rafraichirTout();
      ouvrirFiche(idEnEdition);
      notifier(`La classe ${nomClasse} a été mise à jour.`);
      return;
    }

    /* --- Création d'une nouvelle classe --- */
    if (!anneeActiveId){
      notifier('Aucune année scolaire active n\'est configurée.');
      return;
    }

    const niveau = $('cNiveau').value;
    const reponse = await fetch('php/classes.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        niveau_id: niveauIdParCode[niveau],
        filiere: $('cFiliere').value,
        nom: $('cNom').value.trim(),
        annee_scolaire_id: anneeActiveId,
        capacite: Number($('cCapacite').value),
        salle: $('cSalle').value.trim(),
        professeur_principal_id: $('cPrincipal').value || null,
        frais_inscription: Number($('cInscription').value) || 0,
        frais_scolarite: Number($('cScolarite').value) || 0
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la création.');

    const nomClasse = $('cNom').value.trim();
    fermerFenetre();
    await rafraichirTout();
    notifier(`La classe ${nomClasse} a été créée.`);
  } catch (erreur) {
    notifier(erreur.message);
  } finally {
    boutonValider.disabled = false;
  }
});

/* Les champs se nettoient dès qu'on les corrige */
['cNiveau','cFiliere','cNom','cCapacite'].forEach(id => {
  $(id).addEventListener('input',  () => $(id).classList.remove('invalide'));
  $(id).addEventListener('change', () => $(id).classList.remove('invalide'));
});

function exporterCSV(nomFichier, entetes, lignes){
  const echapper = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenu = [entetes, ...lignes]
    .map(l => l.map(echapper).join(';'))
    .join('\r\n');

  // Le BOM garantit les accents corrects à l'ouverture dans Excel
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
  const lignes = classes.map(c => {
    const { du, verse } = financesClasse(c);
    return [
      c.nom, nomsNiveaux[c.niveau] || c.niveauNom, nomsFilieres[c.filiere] || c.filiere, c.salle, c.principalNom,
      c.eleves.length, c.capacite, tauxRemplissage(c) + ' %',
      c.eleves.filter(x => x.sexe === 'F').length,
      c.eleves.filter(x => x.sexe === 'M').length,
      c.matieres.length, c.matieres.reduce((s, m) => s + m.heures, 0) + ' h',
      c.fraisInscription, c.fraisScolarite, du, verse
    ];
  });

  exporterCSV(
    `classes-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Classe','Niveau','Filière','Salle','Professeur principal',
     'Effectif','Capacité','Remplissage','Filles','Garçons',
     'Matières affectées','Volume hebdo','Frais inscription','Frais scolarité','Total dû','Total versé'],
    lignes
  );

  notifier(`${lignes.length} classes exportées.`);
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
chargerTout().then(() => {
  afficherClasses();
  majIndicateurs();
});

});
