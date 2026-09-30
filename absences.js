/* =========================================================
   SCOLARIS — Module Absences & Retards
   Enregistrement quotidien des absences et retards, justification
   (éventuellement groupée sur plusieurs événements), historique
   filtrable. Ne duplique jamais l'identité de l'élève : tout passe
   par inscription_id (voir php/absences.php, php/justifications.php,
   php/_aide.php).
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
function horaireFr(a){
  if (!a.heure_debut) return a.type === 'absence' ? 'Journée entière' : '—';
  const court = h => h.slice(0, 5);
  return a.heure_fin ? `${court(a.heure_debut)} – ${court(a.heure_fin)}` : court(a.heure_debut);
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

let inscriptions = [];
let evenements = [];
let justifierPreselection = null;

let enseignants = [];
let evenementsEns = [];
let justifierPreselectionEns = null;

/* =========================================================
   1. CHARGEMENT INITIAL
   ========================================================= */
async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  const classes = (await reponse.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('filtreClasse').innerHTML = '<option value="">Toutes les classes</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
  $('naEnsClasse').innerHTML = '<option value="">—</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
}

async function chargerInscriptions(){
  const reponse = await fetch('php/inscriptions.php');
  inscriptions = (await reponse.json()).filter(i => i.statut === 'validee');
  const options = '<option value="">Choisir un élève…</option>' +
    inscriptions
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .map(i => `<option value="${i.id}">${echapperHTML(i.nom)} ${echapperHTML(i.prenom)} — ${echapperHTML(i.classe_nom)} (${echapperHTML(i.matricule)})</option>`)
      .join('');
  $('naEleve').innerHTML = options;
  $('jEleve').innerHTML  = options;
}

async function chargerMatieres(){
  const reponse = await fetch('php/matieres.php');
  const matieres = (await reponse.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('naMatiere').innerHTML = '<option value="">Journée entière</option>' +
    matieres.map(m => `<option value="${m.id}">${echapperHTML(m.nom)}</option>`).join('');
  $('naEnsMatiere').innerHTML = '<option value="">—</option>' +
    matieres.map(m => `<option value="${m.id}">${echapperHTML(m.nom)}</option>`).join('');
}

async function chargerEnseignants(){
  const reponse = await fetch('php/enseignants.php');
  enseignants = (await reponse.json()).filter(e => e.statut === 'Actif');
  const options = '<option value="">Choisir un enseignant…</option>' +
    enseignants
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .map(e => `<option value="${e.id}">${echapperHTML(e.civilite)} ${echapperHTML(e.nom)} ${echapperHTML(e.prenom)} (${echapperHTML(e.matricule)})</option>`)
      .join('');
  $('naEnsEnseignant').innerHTML = options;
  $('jEnsEnseignant').innerHTML  = options;
}

/* =========================================================
   2. FORMULAIRE : ENREGISTRER UNE ABSENCE / UN RETARD
   ========================================================= */
function ouvrirNouvelleAbsence(){
  $('carteJustifier').hidden = true;
  $('carteNouvelleAbsence').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('btnNouvelleAbsence').addEventListener('click', ouvrirNouvelleAbsence);
$('btnAnnulerNouvelleAbsence').addEventListener('click', () => {
  $('carteNouvelleAbsence').hidden = true;
});

$('naType').addEventListener('change', () => {
  $('champHeureFin').hidden = $('naType').value === 'retard';
});

$('btnEnregistrerAbsence').addEventListener('click', async () => {
  const inscriptionId = $('naEleve').value;
  const date = $('naDate').value;
  if (!inscriptionId) { notifier('Choisissez un élève.'); return; }
  if (!date) { notifier('La date est obligatoire.'); return; }

  try {
    const reponse = await fetch('php/absences.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscription_id: inscriptionId,
        type: $('naType').value,
        date_evenement: date,
        heure_debut: $('naHeureDebut').value || null,
        heure_fin: $('naType').value === 'retard' ? null : ($('naHeureFin').value || null),
        matiere_id: $('naMatiere').value || null,
        motif: $('naMotif').value.trim()
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    notifier('Enregistré.');
    $('carteNouvelleAbsence').hidden = true;
    $('naEleve').value = '';
    $('naDate').value = '';
    $('naHeureDebut').value = '';
    $('naHeureFin').value = '';
    $('naMatiere').value = '';
    $('naMotif').value = '';
    await chargerListe();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   3. FORMULAIRE : JUSTIFIER
   ========================================================= */
function ouvrirJustifier(inscriptionId, absenceIdAPreselectionner){
  $('carteNouvelleAbsence').hidden = true;
  $('carteJustifier').hidden = false;
  justifierPreselection = absenceIdAPreselectionner || null;
  if (inscriptionId){
    $('jEleve').value = inscriptionId;
    $('jEleve').dispatchEvent(new Event('change'));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('btnJustifier').addEventListener('click', () => ouvrirJustifier(null, null));
$('btnAnnulerJustifier').addEventListener('click', () => {
  $('carteJustifier').hidden = true;
});

$('jEleve').addEventListener('change', async () => {
  const inscriptionId = $('jEleve').value;
  const liste = $('listeAJustifier');
  if (!inscriptionId) {
    liste.innerHTML = '<li class="vide-selection">Choisissez d\'abord un élève.</li>';
    return;
  }

  const reponse = await fetch(`php/absences.php?inscription_id=${inscriptionId}&justifie=0`);
  const nonJustifies = await reponse.json();

  liste.innerHTML = nonJustifies.length
    ? nonJustifies.map(a => `
        <li class="item-a-justifier">
          <input type="checkbox" value="${a.id}" id="chk${a.id}" ${a.id === justifierPreselection ? 'checked' : ''}>
          <label for="chk${a.id}">
            <b>${a.type === 'absence' ? 'Absence' : 'Retard'}</b> : ${dateFr(a.date_evenement)}
            <small>${a.matiere_nom ? echapperHTML(a.matiere_nom) + ' · ' : ''}${horaireFr(a)}</small>
          </label>
        </li>`).join('')
    : '<li class="vide-selection">Aucune absence ou retard non justifié pour cet élève.</li>';
});

$('btnEnregistrerJustification').addEventListener('click', async () => {
  const inscriptionId = $('jEleve').value;
  const motif = $('jMotif').value.trim();
  const absenceIds = [...document.querySelectorAll('#listeAJustifier input:checked')].map(c => Number(c.value));

  if (!inscriptionId) { notifier('Choisissez un élève.'); return; }
  if (!absenceIds.length) { notifier('Sélectionnez au moins une absence ou un retard.'); return; }
  if (!motif) { notifier('Le motif est obligatoire.'); return; }

  try {
    const reponse = await fetch('php/justifications.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscription_id: inscriptionId,
        motif,
        type_piece: $('jTypePiece').value || null,
        absence_ids: absenceIds
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la justification.');

    notifier(`${resultat.absences_justifiees} événement(s) justifié(s).`);
    $('carteJustifier').hidden = true;
    $('jEleve').value = '';
    $('jMotif').value = '';
    $('jTypePiece').value = '';
    justifierPreselection = null;
    await chargerListe();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   4. LISTE / HISTORIQUE
   ========================================================= */
function ligneHTML(a){
  const justifie = a.justification_id && a.justification_statut === 'validee';
  return `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${(a.eleve_prenom[0] || '') + (a.eleve_nom[0] || '')}</span>
          <div><b>${echapperHTML(a.eleve_prenom)} ${echapperHTML(a.eleve_nom)}</b><small>${echapperHTML(a.matricule)}</small></div>
        </div>
      </td>
      <td>${echapperHTML(a.classe_nom)}</td>
      <td>${a.type === 'absence' ? 'Absence' : 'Retard'}</td>
      <td>${dateFr(a.date_evenement)}</td>
      <td>${horaireFr(a)}</td>
      <td>${a.matiere_nom ? echapperHTML(a.matiere_nom) : '—'}</td>
      <td>${a.motif ? echapperHTML(a.motif) : '—'}</td>
      <td><span class="statut ${justifie ? 'validee' : 'attente'}">${justifie ? 'Justifiée' : 'Non justifiée'}</span></td>
      <td class="fin">
        ${justifie ? '' : `<button type="button" class="action" data-justifier="${a.id}" data-inscription="${a.inscription_id}">Justifier</button>`}
        <button type="button" class="action" data-supprimer="${a.id}">Supprimer</button>
      </td>
    </tr>`;
}

async function chargerListe(){
  const parametres = new URLSearchParams();
  if ($('filtreClasse').value) parametres.set('classe_id', $('filtreClasse').value);
  if ($('filtreType').value) parametres.set('type', $('filtreType').value);
  if ($('filtreJustifie').value !== '') parametres.set('justifie', $('filtreJustifie').value);
  if ($('filtreDu').value) parametres.set('du', $('filtreDu').value);
  if ($('filtreAu').value) parametres.set('au', $('filtreAu').value);

  const reponse = await fetch(`php/absences.php?${parametres.toString()}`);
  evenements = await reponse.json();
  afficherListe();
}

function afficherListe(){
  const texte = $('filtreRecherche').value.trim().toLowerCase();
  const visibles = evenements.filter(a => !texte
    || `${a.eleve_nom} ${a.eleve_prenom} ${a.matricule}`.toLowerCase().includes(texte));

  $('corpsAbsences').innerHTML = visibles.length
    ? visibles.map(ligneHTML).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune absence ni retard trouvé.</td></tr>';

  $('compteResultats').textContent = `${visibles.length} événement${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''}.`;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  $('kpiJour').textContent = evenements.filter(a => a.date_evenement === aujourdhui).length;
  $('kpiJustifiees').textContent = visibles.filter(a => a.justification_id && a.justification_statut === 'validee').length;
  $('kpiNonJustifiees').textContent = visibles.filter(a => !(a.justification_id && a.justification_statut === 'validee')).length;
}

$('corpsAbsences').addEventListener('click', async (evenement) => {
  const boutonJustifier = evenement.target.closest('[data-justifier]');
  if (boutonJustifier){
    ouvrirJustifier(boutonJustifier.dataset.inscription, Number(boutonJustifier.dataset.justifier));
    return;
  }

  const boutonSupprimer = evenement.target.closest('[data-supprimer]');
  if (boutonSupprimer){
    if (!confirm('Supprimer cet événement ?')) return;
    try {
      const reponse = await fetch(`php/absences.php?id=${boutonSupprimer.dataset.supprimer}`, { method: 'DELETE' });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la suppression.');
      notifier('Événement supprimé.');
      await chargerListe();
    } catch (erreur) {
      notifier(erreur.message);
    }
  }
});

$('filtreClasse').addEventListener('change', chargerListe);
$('filtreType').addEventListener('change', chargerListe);
$('filtreJustifie').addEventListener('change', chargerListe);
$('filtreDu').addEventListener('change', chargerListe);
$('filtreAu').addEventListener('change', chargerListe);
$('filtreRecherche').addEventListener('input', afficherListe);

/* =========================================================
   5. VOLET ENSEIGNANTS — mêmes principes que le volet Élèves,
   mais sur enseignant_id (php/absences_enseignants.php,
   php/justifications_enseignants.php) : jamais mélangé aux données
   des élèves (pas d'inscription, pas de professeur principal).
   ========================================================= */
function ouvrirNouvelleAbsenceEns(){
  $('carteJustifierEns').hidden = true;
  $('carteNouvelleAbsenceEns').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('btnNouvelleAbsenceEns').addEventListener('click', ouvrirNouvelleAbsenceEns);
$('btnAnnulerNouvelleAbsenceEns').addEventListener('click', () => {
  $('carteNouvelleAbsenceEns').hidden = true;
});

$('naEnsType').addEventListener('change', () => {
  $('champHeureFinEns').hidden = $('naEnsType').value === 'retard';
});

$('btnEnregistrerAbsenceEns').addEventListener('click', async () => {
  const enseignantId = $('naEnsEnseignant').value;
  const date = $('naEnsDate').value;
  if (!enseignantId) { notifier('Choisissez un enseignant.'); return; }
  if (!date) { notifier('La date est obligatoire.'); return; }

  try {
    const reponse = await fetch('php/absences_enseignants.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enseignant_id: enseignantId,
        type: $('naEnsType').value,
        date_evenement: date,
        heure_debut: $('naEnsHeureDebut').value || null,
        heure_fin: $('naEnsType').value === 'retard' ? null : ($('naEnsHeureFin').value || null),
        classe_id: $('naEnsClasse').value || null,
        matiere_id: $('naEnsMatiere').value || null,
        motif: $('naEnsMotif').value.trim()
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    notifier('Enregistré.');
    $('carteNouvelleAbsenceEns').hidden = true;
    $('naEnsEnseignant').value = '';
    $('naEnsDate').value = '';
    $('naEnsHeureDebut').value = '';
    $('naEnsHeureFin').value = '';
    $('naEnsClasse').value = '';
    $('naEnsMatiere').value = '';
    $('naEnsMotif').value = '';
    await chargerListeEns();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

function ouvrirJustifierEns(enseignantId, absenceIdAPreselectionner){
  $('carteNouvelleAbsenceEns').hidden = true;
  $('carteJustifierEns').hidden = false;
  justifierPreselectionEns = absenceIdAPreselectionner || null;
  if (enseignantId){
    $('jEnsEnseignant').value = enseignantId;
    $('jEnsEnseignant').dispatchEvent(new Event('change'));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('btnJustifierEns').addEventListener('click', () => ouvrirJustifierEns(null, null));
$('btnAnnulerJustifierEns').addEventListener('click', () => {
  $('carteJustifierEns').hidden = true;
});

$('jEnsEnseignant').addEventListener('change', async () => {
  const enseignantId = $('jEnsEnseignant').value;
  const liste = $('listeAJustifierEns');
  if (!enseignantId) {
    liste.innerHTML = '<li class="vide-selection">Choisissez d\'abord un enseignant.</li>';
    return;
  }

  const reponse = await fetch(`php/absences_enseignants.php?enseignant_id=${enseignantId}&justifie=0`);
  const nonJustifies = await reponse.json();

  liste.innerHTML = nonJustifies.length
    ? nonJustifies.map(a => `
        <li class="item-a-justifier">
          <input type="checkbox" value="${a.id}" id="chkEns${a.id}" ${a.id === justifierPreselectionEns ? 'checked' : ''}>
          <label for="chkEns${a.id}">
            <b>${a.type === 'absence' ? 'Absence' : 'Retard'}</b> : ${dateFr(a.date_evenement)}
            <small>${a.matiere_nom ? echapperHTML(a.matiere_nom) + ' · ' : ''}${horaireFr(a)}</small>
          </label>
        </li>`).join('')
    : '<li class="vide-selection">Aucune absence ou retard non justifié pour cet enseignant.</li>';
});

$('btnEnregistrerJustificationEns').addEventListener('click', async () => {
  const enseignantId = $('jEnsEnseignant').value;
  const motif = $('jEnsMotif').value.trim();
  const absenceIds = [...document.querySelectorAll('#listeAJustifierEns input:checked')].map(c => Number(c.value));

  if (!enseignantId) { notifier('Choisissez un enseignant.'); return; }
  if (!absenceIds.length) { notifier('Sélectionnez au moins une absence ou un retard.'); return; }
  if (!motif) { notifier('Le motif est obligatoire.'); return; }

  try {
    const reponse = await fetch('php/justifications_enseignants.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enseignant_id: enseignantId,
        motif,
        type_piece: $('jEnsTypePiece').value || null,
        absence_ids: absenceIds
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la justification.');

    notifier(`${resultat.absences_justifiees} événement(s) justifié(s).`);
    $('carteJustifierEns').hidden = true;
    $('jEnsEnseignant').value = '';
    $('jEnsMotif').value = '';
    $('jEnsTypePiece').value = '';
    justifierPreselectionEns = null;
    await chargerListeEns();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

function ligneHTMLEns(a){
  const justifie = a.justification_id && a.justification_statut === 'validee';
  return `
    <tr>
      <td>
        <div class="identite">
          <span class="avatar">${(a.enseignant_prenom[0] || '') + (a.enseignant_nom[0] || '')}</span>
          <div><b>${echapperHTML(a.enseignant_prenom)} ${echapperHTML(a.enseignant_nom)}</b><small>${echapperHTML(a.matricule)}</small></div>
        </div>
      </td>
      <td>${a.type === 'absence' ? 'Absence' : 'Retard'}</td>
      <td>${dateFr(a.date_evenement)}</td>
      <td>${horaireFr(a)}</td>
      <td>${a.classe_nom ? echapperHTML(a.classe_nom) : '—'}</td>
      <td>${a.matiere_nom ? echapperHTML(a.matiere_nom) : '—'}</td>
      <td>${a.motif ? echapperHTML(a.motif) : '—'}</td>
      <td><span class="statut ${justifie ? 'validee' : 'attente'}">${justifie ? 'Justifiée' : 'Non justifiée'}</span></td>
      <td class="fin">
        ${justifie ? '' : `<button type="button" class="action" data-justifier-ens="${a.id}" data-enseignant="${a.enseignant_id}">Justifier</button>`}
        <button type="button" class="action" data-supprimer-ens="${a.id}">Supprimer</button>
      </td>
    </tr>`;
}

async function chargerListeEns(){
  const parametres = new URLSearchParams();
  if ($('filtreTypeEns').value) parametres.set('type', $('filtreTypeEns').value);
  if ($('filtreJustifieEns').value !== '') parametres.set('justifie', $('filtreJustifieEns').value);
  if ($('filtreDuEns').value) parametres.set('du', $('filtreDuEns').value);
  if ($('filtreAuEns').value) parametres.set('au', $('filtreAuEns').value);

  const reponse = await fetch(`php/absences_enseignants.php?${parametres.toString()}`);
  evenementsEns = await reponse.json();
  afficherListeEns();
}

function afficherListeEns(){
  const texte = $('filtreRechercheEns').value.trim().toLowerCase();
  const visibles = evenementsEns.filter(a => !texte
    || `${a.enseignant_nom} ${a.enseignant_prenom} ${a.matricule}`.toLowerCase().includes(texte));

  $('corpsAbsencesEns').innerHTML = visibles.length
    ? visibles.map(ligneHTMLEns).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune absence ni retard trouvé.</td></tr>';

  $('compteResultatsEns').textContent = `${visibles.length} événement${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''}.`;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  $('kpiJourEns').textContent = evenementsEns.filter(a => a.date_evenement === aujourdhui).length;
  $('kpiJustifieesEns').textContent = visibles.filter(a => a.justification_id && a.justification_statut === 'validee').length;
  $('kpiNonJustifieesEns').textContent = visibles.filter(a => !(a.justification_id && a.justification_statut === 'validee')).length;
}

$('corpsAbsencesEns').addEventListener('click', async (evenement) => {
  const boutonJustifier = evenement.target.closest('[data-justifier-ens]');
  if (boutonJustifier){
    ouvrirJustifierEns(boutonJustifier.dataset.enseignant, Number(boutonJustifier.dataset.justifierEns));
    return;
  }

  const boutonSupprimer = evenement.target.closest('[data-supprimer-ens]');
  if (boutonSupprimer){
    if (!confirm('Supprimer cet événement ?')) return;
    try {
      const reponse = await fetch(`php/absences_enseignants.php?id=${boutonSupprimer.dataset.supprimerEns}`, { method: 'DELETE' });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la suppression.');
      notifier('Événement supprimé.');
      await chargerListeEns();
    } catch (erreur) {
      notifier(erreur.message);
    }
  }
});

$('filtreTypeEns').addEventListener('change', chargerListeEns);
$('filtreJustifieEns').addEventListener('change', chargerListeEns);
$('filtreDuEns').addEventListener('change', chargerListeEns);
$('filtreAuEns').addEventListener('change', chargerListeEns);
$('filtreRechercheEns').addEventListener('input', afficherListeEns);

/* =========================================================
   6. ONGLETS ÉLÈVES / ENSEIGNANTS
   ========================================================= */
document.querySelectorAll('.onglet').forEach(onglet => {
  onglet.addEventListener('click', () => {
    document.querySelectorAll('.onglet').forEach(o => o.classList.remove('actif'));
    onglet.classList.add('actif');
    $('voletEleves').hidden = onglet.dataset.volet !== 'voletEleves';
    $('voletEnseignants').hidden = onglet.dataset.volet !== 'voletEnseignants';
  });
});

/* =========================================================
   7. MENU LATÉRAL
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
   8. DÉMARRAGE
   ========================================================= */
Promise.all([chargerClasses(), chargerInscriptions(), chargerMatieres()]).then(chargerListe);
chargerEnseignants().then(chargerListeEns);

});
