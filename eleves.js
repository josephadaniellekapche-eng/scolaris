/* =========================================================
   SCOLARIS — Module Élèves
   Répertoire filtrable + fiche individuelle à onglets
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

/* =========================================================
   1. DONNÉES — chargées depuis la base de données
   La classe, le type d'inscription et le solde ne sont pas des
   champs de l'élève : ils viennent de son inscription active
   (module Inscription), rejointe ici côté client.
   ========================================================= */
let listeClasses = [];

/* Les 6 pièces attendues pour tout dossier d'élève. Le code est la valeur
   stockée dans la colonne SET `pieces_fournies` de la table eleves. */
const PIECES_DOSSIER = [
  { code: 'extrait_naissance',  libelle: 'Extrait de naissance' },
  { code: 'bulletin_precedent', libelle: 'Bulletin de l\'année précédente' },
  { code: 'photo_identite',     libelle: 'Photo d\'identité' },
  { code: 'certificat_medical', libelle: 'Certificat médical' },
  { code: 'carnet_vaccination', libelle: 'Carnet de vaccination' },
  { code: 'fiche_responsable',  libelle: 'Fiche du responsable légal' }
];

async function chargerEleves(){
  const [reponseEleves, reponseInscriptions, reponseClasses] = await Promise.all([
    fetch('php/eleves.php'),
    fetch('php/inscriptions.php'),
    fetch('php/classes.php')
  ]);
  const [donneesEleves, inscriptions, classes] = await Promise.all([
    reponseEleves.json(), reponseInscriptions.json(), reponseClasses.json()
  ]);
  listeClasses = classes;

  return donneesEleves.map(e => {
    const inscriptionsEleve = inscriptions.filter(i => i.eleve_id === e.id);
    const active = inscriptionsEleve[0] || null;
    const piecesFournies = e.pieces_fournies ? e.pieces_fournies.split(',').filter(Boolean) : [];

    return {
      id: e.id, matricule: e.matricule, nom: e.nom, prenom: e.prenom,
      sexe: e.sexe === 'M' ? 'Masculin' : 'Féminin',
      naissance: e.date_naissance, lieu: e.lieu_naissance || '—',
      nationalite: e.nationalite || '—', groupe: e.groupe_sanguin || '—',
      pere: e.pere || '—', mere: e.mere || '—', tuteur: e.tuteur || '—',
      contact: e.contact || '—', email: e.email || '—', adresse: e.adresse || '—',
      origine: e.origine || '—', statut: e.statut,
      inscriptionId: active ? active.id : null,
      classeId: active ? active.classe_id : null,
      classe: active ? active.classe_nom : 'Non affecté',
      type: active ? active.type : '—',
      entree: active ? active.date_inscription.slice(0, 4) : '—',
      piecesFournies, dossier: piecesFournies.length,
      /* Solde à jour, calculé côté serveur par le module Finance (jamais
         les colonnes historiques inscriptions.montant_du/montant_verse,
         figées — voir php/inscriptions.php et php/_aide.php). */
      du: active ? Number(active.montant_du_actuel) : 0,
      verse: active ? Number(active.montant_paye_actuel) : 0,
      parcours: inscriptionsEleve.map(i => ({
        annee: i.annee_scolaire, classe: i.classe_nom,
        mention: i.id === (active && active.id) ? 'En cours' : 'Inscription enregistrée'
      }))
    };
  });
}

let eleves = [];

/* =========================================================
   2. OUTILS
   ========================================================= */
const $ = id => document.getElementById(id);

/* Échappe le texte saisi librement (nom, tuteur, adresse...) avant de
   l'insérer via innerHTML, pour empêcher toute injection de balises. */
function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

function initiales(e){ return (e.prenom[0] + e.nom[0]).toUpperCase(); }

function age(dateISO){
  if (!dateISO) return '—';
  const n = new Date(dateISO), a = new Date();
  let ans = a.getFullYear() - n.getFullYear();
  const m = a.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < n.getDate())) ans--;
  return ans + ' ans';
}

function dateFr(iso){
  if (!iso) return '—';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function argent(n){
  return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' FCFA';
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

/* =========================================================
   3. RÉPERTOIRE
   ========================================================= */
function remplirFiltreClasses(){
  const classes = [...new Set(eleves.map(e => e.classe))].sort();
  $('filtreClasse').innerHTML =
    '<option value="">Toutes les classes</option>' +
    classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

function afficherListe(){
  const texte   = $('filtreNom').value.trim().toLowerCase();
  const classe  = $('filtreClasse').value;
  const sexe    = $('filtreSexe').value;
  const finance = $('filtreFinance').value;

  const visibles = eleves.filter(e => {
    const reste = e.du - e.verse;
    if (texte && !(`${e.prenom} ${e.nom} ${e.matricule}`.toLowerCase().includes(texte))) return false;
    if (classe && e.classe !== classe) return false;
    if (sexe && e.sexe !== sexe) return false;
    if (finance === 'ajour' && reste > 0) return false;
    if (finance === 'retard' && reste <= 0) return false;
    return true;
  });

  $('corpsEleves').innerHTML = visibles.map(e => {
    const reste = e.du - e.verse;
    const etat = reste <= 0
      ? '<span class="puce ok">À jour</span>'
      : (e.verse === 0
          ? '<span class="puce ko">Rien versé</span>'
          : `<span class="puce att">${argent(reste)} dus</span>`);

    return `
      <tr class="cliquable" data-matricule="${e.matricule}">
        <td>
          <div class="identite">
            <span class="avatar">${initiales(e)}</span>
            <div><b>${echapperHTML(e.prenom)} ${echapperHTML(e.nom)}</b><small>${e.matricule}</small></div>
          </div>
        </td>
        <td>${e.classe}</td>
        <td>${e.sexe}</td>
        <td>${age(e.naissance)}</td>
        <td>${echapperHTML(e.tuteur)}<br><small style="color:var(--texte-doux)">${echapperHTML(e.contact)}</small></td>
        <td>${etat}</td>
        <td class="fin"><button class="action" data-ouvrir="${e.matricule}">Ouvrir</button></td>
      </tr>`;
  }).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
  $('compteResultats').textContent =
    `${visibles.length} élève${visibles.length > 1 ? 's' : ''} affiché${visibles.length > 1 ? 's' : ''} sur ${eleves.length}.`;
}

function majIndicateurs(){
  const filles  = eleves.filter(e => e.sexe === 'Féminin').length;
  const garcons = eleves.length - filles;
  const ajour   = eleves.filter(e => e.du - e.verse <= 0).length;
  const dus     = eleves.reduce((s, e) => s + Math.max(0, e.du - e.verse), 0);

  $('kpiTotal').textContent       = eleves.length;
  $('kpiRepartition').textContent = `${garcons} garçons · ${filles} filles`;
  $('kpiNouveaux').textContent    = eleves.filter(e => e.type === 'Nouvel élève' || e.type === 'Transfert').length;
  $('kpiAJour').textContent       = ajour;
  $('kpiSolde').textContent       = dus > 0 ? `${argent(dus)} restants` : 'Aucun impayé';
  $('kpiIncomplets').textContent  = eleves.filter(e => e.dossier < PIECES_DOSSIER.length).length;
}

['filtreNom', 'filtreClasse', 'filtreSexe', 'filtreFinance'].forEach(id => {
  $(id).addEventListener('input', afficherListe);
  $(id).addEventListener('change', afficherListe);
});

$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherListe();
});

/* Ouverture d'une fiche au clic sur la ligne */
$('corpsEleves').addEventListener('click', e => {
  const ligne = e.target.closest('tr[data-matricule]');
  if (ligne) ouvrirFiche(ligne.dataset.matricule);
});

/* =========================================================
   4. FICHE INDIVIDUELLE
   ========================================================= */
let matriculeAffiche = null;

function afficherEtiquettes(e){
  const reste = e.du - e.verse;
  const etiquettes = [`<span class="ambre">${e.classe}</span>`, `<span>${e.type}</span>`];
  if (reste > 0) etiquettes.push(`<span class="rouge">${argent(reste)} dus</span>`);
  else etiquettes.push('<span class="vert">Scolarité à jour</span>');
  if (e.dossier < PIECES_DOSSIER.length) etiquettes.push(`<span class="rouge">Dossier ${e.dossier}/${PIECES_DOSSIER.length}</span>`);
  $('ficheEtiquettes').innerHTML = etiquettes.join('');
}

function afficherPieces(e){
  $('listePieces').innerHTML = PIECES_DOSSIER.map(p => {
    const fournie = e.piecesFournies.includes(p.code);
    return `
      <li class="${fournie ? 'fournie' : 'manquante'}">
        <label><input type="checkbox" data-piece="${p.code}" ${fournie ? 'checked' : ''}> ${p.libelle}</label>
        <small>${fournie ? 'Fournie' : 'À réclamer'}</small>
      </li>`;
  }).join('');
}

/* Coche/décoche une pièce du dossier : enregistrement immédiat en base,
   sans recharger toute la fiche (pour ne pas perdre l'onglet ni le défilement). */
$('listePieces').addEventListener('change', async evenement => {
  const case_ = evenement.target.closest('input[type="checkbox"][data-piece]');
  if (!case_) return;

  const e = eleves.find(x => x.matricule === matriculeAffiche);
  if (!e) return;

  const avant = e.piecesFournies.slice();
  const ensemble = new Set(e.piecesFournies);
  if (case_.checked) ensemble.add(case_.dataset.piece);
  else ensemble.delete(case_.dataset.piece);
  e.piecesFournies = PIECES_DOSSIER.map(p => p.code).filter(c => ensemble.has(c));
  e.dossier = e.piecesFournies.length;

  try {
    const reponse = await fetch(`php/eleves.php?id=${e.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pieces_fournies: e.piecesFournies })
    });
    if (!reponse.ok) throw new Error((await reponse.json()).erreur || 'Échec de la mise à jour.');
    afficherEtiquettes(e);
    afficherPieces(e);
    majIndicateurs();
  } catch (erreur) {
    e.piecesFournies = avant;
    e.dossier = avant.length;
    notifier(erreur.message);
    afficherPieces(e);
  }
});

function ouvrirFiche(matricule){
  const e = eleves.find(x => x.matricule === matricule);
  if (!e) return;
  matriculeAffiche = matricule;

  /* --- En-tête --- */
  $('fichePortrait').textContent = initiales(e);
  $('ficheNom').textContent      = `${e.prenom} ${e.nom}`;
  $('ficheResume').textContent   = `${e.classe} · Matricule ${e.matricule} · ${age(e.naissance)}`;

  afficherEtiquettes(e);

  /* --- Identité --- */
  $('listeIdentite').innerHTML = ligne([
    ['Nom', e.nom], ['Prénom', e.prenom], ['Sexe', e.sexe],
    ['Date de naissance', dateFr(e.naissance)], ['Lieu de naissance', e.lieu],
    ['Nationalité', e.nationalite], ['Groupe sanguin', e.groupe]
  ]);

  $('listeParents').innerHTML = ligne([
    ['Père', e.pere], ['Mère', e.mere],
    ['Responsable légal', e.tuteur], ['Téléphone', e.contact], ['E-mail', e.email], ['Adresse', e.adresse]
  ]);

  /* --- Scolarité --- */
  $('listeScolarite').innerHTML = ligne([
    ['Classe', e.classe], ['Matricule', e.matricule],
    ['Type d\'inscription', e.type], ['Entré en', e.entree],
    ['Établissement d\'origine', e.origine]
  ]);

  $('listeParcours').innerHTML = e.parcours.map(p => `
    <li><b>${p.classe} — ${p.annee}</b><small>${p.mention}</small></li>
  `).join('');

  afficherPieces(e);

  /* --- Absences (module Vie scolaire) et Finances (module Finance) :
     chargement asynchrone separe, tous deux dependant de l'inscription
     active plutot que des champs deja charges avec la liste des eleves. --- */
  chargerAbsencesEleve(e);
  chargerFinancesEleve(e);

  /* --- Bascule d'affichage --- */
  $('vueListe').hidden = true;
  $('vueFiche').hidden = false;
  $('filSection').textContent = `Élèves · ${e.prenom} ${e.nom}`;
  choisirOnglet('identite');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ligne(paires){
  return paires.map(([cle, valeur]) =>
    `<div><dt>${cle}</dt><dd>${valeur ? echapperHTML(valeur) : '—'}</dd></div>`).join('');
}

/* =========================================================
   4bis. FINANCES — module Finance, branché sur les vraies données
   (php/inscription_frais.php, php/paiements.php, php/types_frais.php).
   Ne duplique jamais l'identité de l'élève : tout passe par inscriptionId.
   ========================================================= */
function eleveOuvert(){ return eleves.find(x => x.matricule === matriculeAffiche); }

let typesFraisDisponibles = null;

async function typesFrais(){
  if (!typesFraisDisponibles){
    const reponse = await fetch('php/types_frais.php?actifs');
    typesFraisDisponibles = await reponse.json();
  }
  return typesFraisDisponibles;
}

function etatPuce(etat){
  if (etat === 'solde')   return '<span class="puce ok">Soldé</span>';
  if (etat === 'partiel') return '<span class="puce att">Partiel</span>';
  return '<span class="puce ko">Impayé</span>';
}

/* Absences/retards de l'élève ouvert (module Vie scolaire), rechargés à
   chaque ouverture de fiche pour toujours refléter les derniers événements
   saisis depuis absences.html — voir php/absences.php. */
async function chargerAbsencesEleve(e){
  if (!e.inscriptionId){
    $('bilanAbsences').textContent = 'Aucune inscription active';
    $('listeAbsences').innerHTML = '<li><div><p>Aucune inscription active.</p></div></li>';
    return;
  }

  const reponse = await fetch(`php/absences.php?inscription_id=${e.inscriptionId}`);
  const evenements = await reponse.json();

  const estJustifie = a => Boolean(a.justification_id) && a.justification_statut === 'validee';
  const nonJustifiees = evenements.filter(a => !estJustifie(a)).length;

  $('bilanAbsences').textContent = evenements.length === 0
    ? 'Aucune absence'
    : `${evenements.length} événement${evenements.length > 1 ? 's' : ''} · ${nonJustifiees} non justifié${nonJustifiees > 1 ? 's' : ''}`;

  const horaire = a => a.heure_debut
    ? (a.heure_fin ? `${a.heure_debut.slice(0, 5)} – ${a.heure_fin.slice(0, 5)}` : a.heure_debut.slice(0, 5))
    : 'Journée entière';

  $('listeAbsences').innerHTML = evenements.length
    ? evenements.map(a => `
        <li>
          <span class="marqueur ${estJustifie(a) ? 'verte' : 'rouge'}">${estJustifie(a) ? '✓' : '!'}</span>
          <div>
            <p>${a.type === 'absence' ? 'Absence' : 'Retard'}${a.motif ? ' : ' + echapperHTML(a.motif) : ''} : <b>${horaire(a)}</b></p>
            <small>${dateFr(a.date_evenement)} · ${estJustifie(a) ? 'Justifiée' : 'Non justifiée'}</small>
          </div>
        </li>`).join('')
    : '<li><div><p>Aucune absence enregistrée.</p><small>Assiduité exemplaire</small></div></li>';
}

async function chargerFinancesEleve(e){
  if (!e.inscriptionId){
    $('bilanFinance').textContent = 'Aucune inscription active';
    $('blocSolde').innerHTML = '';
    $('corpsFrais').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune inscription active.</td></tr>';
    $('corpsPaiements').innerHTML = '';
    $('btnAjouterFrais').disabled = true;
    $('btnEncaisser').disabled = true;
    return;
  }
  $('btnAjouterFrais').disabled = false;
  $('btnEncaisser').disabled = false;

  const [detail, paiements, types] = await Promise.all([
    fetch(`php/inscription_frais.php?inscription_id=${e.inscriptionId}`).then(r => r.json()),
    fetch(`php/paiements.php?inscription_id=${e.inscriptionId}`).then(r => r.json()),
    typesFrais()
  ]);

  const solde = detail.solde;
  $('bilanFinance').textContent = solde <= 0 ? 'Scolarité soldée' : 'Solde en cours';
  $('blocSolde').innerHTML = `
    <div><span>Montant dû</span><b>${argent(detail.montant_du)}</b></div>
    <div><span>Déjà versé</span><b class="regle">${argent(detail.montant_paye)}</b></div>
    <div><span>Reste à payer</span><b class="${solde > 0 ? 'du' : 'regle'}">${argent(Math.max(0, solde))}</b></div>
  `;

  $('corpsFrais').innerHTML = detail.frais.length
    ? detail.frais.map(f => `
        <tr>
          <td>${echapperHTML(f.nom)}${f.reduction_pourcentage > 0 ? ` <small>(-${f.reduction_pourcentage}%)</small>` : ''}</td>
          <td class="fin-centre"><input type="date" class="echeance-frais" data-id="${f.id}" value="${f.date_echeance || ''}" title="Échéance de ce frais"></td>
          <td class="fin-centre">${argent(f.montant_du)}</td>
          <td class="fin-centre">${argent(f.montant_paye)}</td>
          <td class="fin-centre">${argent(f.solde)}</td>
          <td class="fin">${etatPuce(f.etat)}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--texte-doux);padding:26px">Aucun frais associé.</td></tr>';

  const fraisRestants = detail.frais.filter(f => f.solde > 0);
  $('paiementFrais').innerHTML = '<option value="">Versement global (réparti automatiquement)</option>' +
    fraisRestants.map(f => `<option value="${f.id}">${echapperHTML(f.nom)} — reste ${argent(f.solde)}</option>`).join('');
  // Présélectionne le frais impayé le plus prioritaire (obligatoire, échéance
  // la plus proche — voir fraisAvecSoldes() dans php/_aide.php, qui trie déjà
  // dans cet ordre) plutôt que « Versement global » : c'est le cas d'usage le
  // plus courant, « Versement global » reste choisissable manuellement.
  if (fraisRestants.length) $('paiementFrais').selectedIndex = 1;

  const codesExistants = new Set(detail.frais.map(f => f.code));
  const optionsDisponibles = types.filter(t => t.categorie === 'optionnel' && !codesExistants.has(t.code));
  $('fraisType').innerHTML = optionsDisponibles.length
    ? optionsDisponibles.map(t => `<option value="${t.id}" data-montant="${t.montant_defaut || 0}">${echapperHTML(t.nom)} (${argent(t.montant_defaut || 0)})</option>`).join('')
    : '<option value="">Aucun frais optionnel disponible</option>';
  $('fraisMontant').value = optionsDisponibles.length ? (optionsDisponibles[0].montant_defaut || '') : '';

  $('corpsPaiements').innerHTML = paiements.length
    ? paiements.map(p => `
        <tr>
          <td>${dateFr(p.date_paiement)}</td>
          <td>${p.frais_nom ? echapperHTML(p.frais_nom) : 'Versement global'}</td>
          <td>${echapperHTML(p.mode_paiement)}</td>
          <td>${echapperHTML(p.reference || '—')}</td>
          <td class="fin-centre">${p.numero_recu ? `<a href="recu.html?numero=${encodeURIComponent(p.numero_recu)}" class="lien-recu">${p.numero_recu}</a>` : '—'}</td>
          <td class="fin"><b>${argent(p.montant)}</b></td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--texte-doux);padding:26px">Aucun versement enregistré.</td></tr>';
}

$('fraisType').addEventListener('change', () => {
  const option = $('fraisType').selectedOptions[0];
  $('fraisMontant').value = option ? (option.dataset.montant || '') : '';
});

/* Échéance modifiable en un clic directement dans le tableau, pour tout
   frais déjà existant (y compris scolarité/inscription, créés sans date
   par creerFraisObligatoires() et donc invisibles au formulaire d'ajout
   ci-dessus, qui ne gère que les nouveaux frais optionnels). */
$('corpsFrais').addEventListener('change', async evenement => {
  const champ = evenement.target.closest('.echeance-frais');
  if (!champ) return;

  const avant = champ.defaultValue;
  champ.disabled = true;
  try {
    const reponse = await fetch(`php/inscription_frais.php?id=${champ.dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_echeance: champ.value || null })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement de l\'échéance.');
    notifier('Échéance enregistrée.');
    await chargerFinancesEleve(eleveOuvert());
  } catch (erreur) {
    champ.value = avant;
    champ.disabled = false;
    notifier(erreur.message);
  }
});

$('btnAjouterFrais').addEventListener('click', () => { $('formFrais').hidden = false; });
$('btnAnnulerFrais').addEventListener('click', () => { $('formFrais').hidden = true; $('formFrais').reset(); });

$('formFrais').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const typeFraisId = $('fraisType').value;
  const montant = Number($('fraisMontant').value || 0);
  if (!typeFraisId){ notifier('Aucun frais optionnel à ajouter.'); return; }
  if (montant <= 0){ notifier('Le montant doit être positif.'); return; }

  try {
    const reponse = await fetch('php/inscription_frais.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscription_id: eleveOuvert().inscriptionId,
        type_frais_id: typeFraisId,
        montant_du: montant,
        date_echeance: $('fraisEcheance').value || null
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'ajout du frais.');

    $('formFrais').hidden = true;
    $('formFrais').reset();
    notifier('Frais ajouté.');
    await chargerFinancesEleve(eleveOuvert());
  } catch (erreur) {
    notifier(erreur.message);
  }
});

$('btnEncaisser').addEventListener('click', () => { $('formEncaissement').hidden = false; });
$('btnAnnulerEncaissement').addEventListener('click', () => { $('formEncaissement').hidden = true; $('formEncaissement').reset(); });

$('formEncaissement').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const montant = Number($('paiementMontant').value || 0);
  if (montant <= 0){ notifier('Le montant doit être positif.'); return; }

  try {
    const reponse = await fetch('php/paiements.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscription_id: eleveOuvert().inscriptionId,
        inscription_frais_id: $('paiementFrais').value || null,
        montant,
        mode_paiement: $('paiementMode').value,
        reference: $('paiementReference').value.trim(),
        observation: $('paiementObservation').value.trim()
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement du paiement.');

    $('formEncaissement').hidden = true;
    $('formEncaissement').reset();
    notifier(`Paiement enregistré — reçu ${resultat.numero_recu}.`);
    await chargerFinancesEleve(eleveOuvert());
    await chargerEtRafraichir();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* Recharge silencieusement la liste (solde à jour dans la liste/KPI)
   sans perdre l'affichage de la fiche actuellement ouverte. */
async function chargerEtRafraichir(){
  eleves = await chargerEleves();
  afficherListe();
  majIndicateurs();
  if (matriculeAffiche) afficherEtiquettes(eleveOuvert());
}

$('btnRetour').addEventListener('click', () => {
  $('vueFiche').hidden = true;
  $('vueListe').hidden = false;
  $('filSection').textContent = 'Élèves';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* =========================================================
   5. ONGLETS
   ========================================================= */
const panneaux = {
  identite:'panIdentite', scolarite:'panScolarite',
  absences:'panAbsences', finances:'panFinances'
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
   6. ACTIONS
   ========================================================= */
$('btnImprimerFiche').addEventListener('click', () => {
  document.querySelectorAll('.panneau').forEach(p => p.classList.add('visible'));
  window.print();
  setTimeout(() => {
    document.querySelectorAll('.panneau').forEach(p => p.classList.remove('visible'));
    choisirOnglet(document.querySelector('.onglet.actif').dataset.onglet);
  }, 400);
});

/* =========================================================
   6bis. MODIFICATION D'UN ÉLÈVE
   ========================================================= */
const fenetreEleve = $('fenetreEleve');

function remplirSelectClasse(idActuel){
  $('fClasse').innerHTML = listeClasses.map(c =>
    `<option value="${c.id}">${c.nom}</option>`).join('');
  $('fClasse').value = idActuel || '';
}

async function rafraichirTout(){
  eleves = await chargerEleves();
  afficherListe();
  majIndicateurs();
}

$('btnModifier').addEventListener('click', () => {
  const e = eleves.find(x => x.matricule === matriculeAffiche);
  if (!e) return;

  document.querySelectorAll('#formEleve .invalide').forEach(c => c.classList.remove('invalide'));
  $('fNom').value = e.nom;
  $('fPrenom').value = e.prenom;
  $('fNaissance').value = e.naissance || '';
  $('fLieu').value = e.lieu === '—' ? '' : e.lieu;
  $('fSexe').value = e.sexe === 'Masculin' || e.sexe === 'M' ? 'M' : 'F';
  $('fGroupe').value = e.groupe === '—' ? '' : e.groupe;
  $('fNationalite').value = e.nationalite === '—' ? '' : e.nationalite;
  $('fPere').value = e.pere === '—' ? '' : e.pere;
  $('fMere').value = e.mere === '—' ? '' : e.mere;
  $('fTuteur').value = e.tuteur || '';
  $('fContact').value = e.contact || '';
  $('fEmail').value = e.email === '—' ? '' : e.email;
  $('fAdresse').value = e.adresse === '—' ? '' : e.adresse;
  $('fOrigine').value = e.origine === '—' ? '' : e.origine;
  remplirSelectClasse(e.classeId);

  fenetreEleve.classList.add('visible');
  $('fNom').focus();
});

function fermerFenetreEleve(){ fenetreEleve.classList.remove('visible'); }
$('fermerFenetre').addEventListener('click', fermerFenetreEleve);
$('annulerEleve').addEventListener('click', fermerFenetreEleve);
fenetreEleve.addEventListener('click', e => { if (e.target === fenetreEleve) fermerFenetreEleve(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetreEleve.classList.contains('visible')) fermerFenetreEleve();
});

$('formEleve').addEventListener('submit', async e => {
  e.preventDefault();

  const champs = ['fNom', 'fPrenom', 'fTuteur', 'fContact', 'fClasse'];
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

  const eleveActuel = eleves.find(x => x.matricule === matriculeAffiche);
  const nouvelleClasseId = $('fClasse').value;

  const valeurs = {
    nom: $('fNom').value.trim(),
    prenom: $('fPrenom').value.trim(),
    date_naissance: $('fNaissance').value,
    lieu_naissance: $('fLieu').value.trim(),
    sexe: $('fSexe').value,
    groupe_sanguin: $('fGroupe').value.trim(),
    nationalite: $('fNationalite').value.trim(),
    pere: $('fPere').value.trim(),
    mere: $('fMere').value.trim(),
    tuteur: $('fTuteur').value.trim(),
    contact: $('fContact').value.trim(),
    email: $('fEmail').value.trim(),
    adresse: $('fAdresse').value.trim(),
    origine: $('fOrigine').value.trim(),
    statut: eleveActuel.statut
  };

  try {
    const reponse = await fetch(`php/eleves.php?id=${eleveActuel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valeurs)
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la mise à jour.');

    if (eleveOuvert().inscriptionId && String(nouvelleClasseId) !== String(eleveActuel.classeId)) {
      const reponseClasse = await fetch(`php/inscriptions.php?id=${eleveOuvert().inscriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classe_id: nouvelleClasseId })
      });
      const resultatClasse = await reponseClasse.json();
      if (!reponseClasse.ok) throw new Error(resultatClasse.erreur || 'Échec du changement de classe.');
    }

    fermerFenetreEleve();
    await rafraichirTout();
    ouvrirFiche(matriculeAffiche);
    notifier(`La fiche de ${valeurs.prenom} ${valeurs.nom} a été mise à jour.`);
  } catch (erreur) {
    notifier(erreur.message);
  }
});


/* =========================================================
   EXPORT CSV
   Génère un fichier téléchargeable, ouvrable dans Excel.
   ========================================================= */
function exporterCSV(nomFichier, entetes, lignes){
  const echapper = v => {
    const t = String(v ?? '').replace(/"/g, '""');
    return `"${t}"`;
  };

  const contenu = [entetes, ...lignes]
    .map(ligne => ligne.map(echapper).join(';'))
    .join('\r\n');

  // Le BOM garantit les accents corrects à l'ouverture dans Excel
  const blob = new Blob(['\uFEFF' + contenu], { type: 'text/csv;charset=utf-8;' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(lien.href);
}

$('btnExporter').addEventListener('click', () => {
  // On exporte ce qui est affiché, filtres compris
  const visibles = [...document.querySelectorAll('#corpsEleves tr[data-matricule]')]
    .map(tr => eleves.find(x => x.matricule === tr.dataset.matricule));

  const lignes = visibles.map(el => [
    el.matricule, el.nom, el.prenom, el.classe, el.sexe,
    dateFr(el.naissance), el.lieu, el.tuteur, el.contact, el.adresse,
    el.du, el.verse, el.du - el.verse
  ]);

  exporterCSV(
    `eleves-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Matricule','Nom','Prénom','Classe','Sexe','Naissance','Lieu',
     'Responsable','Contact','Adresse','Dû (FCFA)','Versé (FCFA)','Reste (FCFA)'],
    lignes
  );

  notifier(`${lignes.length} élèves exportés.`);
});

/* =========================================================
   7. MENU LATÉRAL
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
   8. DÉMARRAGE
   ========================================================= */
chargerEleves().then(liste => {
  eleves = liste;
  remplirFiltreClasses();
  afficherListe();
  majIndicateurs();
});

});
