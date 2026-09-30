/* =========================================================
   SCOLARIS — Module Administratif : Communication
   SMS / e-mail vers élèves, parents, enseignants et personnel —
   destinataires résolus depuis les fiches existantes (aucune donnée
   ressaisie), aperçu avant envoi, historique et modèles réutilisables.
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
function dateFrHeure(iso){
  if (!iso) return '—';
  const date = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}

const LIBELLES_CANAL = { sms: '📱 SMS', email: '✉️ Email', sms_email: '📱✉️ SMS + Email', whatsapp: '💬 WhatsApp' };
function canalUtiliseSms(canal){ return canal === 'sms' || canal === 'sms_email' || canal === 'whatsapp'; }
function canalUtiliseEmail(canal){ return canal === 'email' || canal === 'sms_email'; }

/** Numéro au format international sans espaces/+, tel qu'attendu par wa.me
    (ex. "+237 6 58 79 42 56" -> "237658794256"). Un numéro local à 9
    chiffres sans indicatif est supposé camerounais (+237), seul pays vu
    dans les fiches actuelles de l'établissement. */
function numeroWhatsApp(telephone){
  let n = (telephone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (n.length <= 9) n = '237' + n;
  return n;
}
const LIBELLES_CATEGORIE = {
  eleves: 'Élèves', parents: 'Parents / tuteurs', enseignants: 'Enseignants',
  personnel: 'Personnel administratif', tous: 'Tous',
};
const LIBELLES_STATUT = { brouillon: 'Brouillon', envoye: 'Envoyé', partiel: 'Partiel', echec: 'Échec' };
const CLASSES_STATUT = { brouillon: 'attente', envoye: 'validee', partiel: 'incomplet', echec: 'rejete' };

function libellePortee(comm){
  if (comm.portee === 'classe') return `Classe : ${comm.classe_nom || '—'}`;
  if (comm.portee === 'individuel') return comm.premier_destinataire ? `Individuel : ${comm.premier_destinataire}` : 'Destinataire précis';
  return 'Toute la catégorie';
}

let modeles = [];
let classesListe = [];
let historique = [];
let brouillonEnEdition = null;
let modeleEnEdition = null;

/* =========================================================
   1. CHARGEMENT INITIAL
   ========================================================= */
async function chargerClasses(){
  try {
    const reponse = await fetch('php/classes.php');
    if (!reponse.ok) throw new Error();
    classesListe = await reponse.json();
  } catch (erreur) {
    classesListe = [];
  }
  $('mClasse').innerHTML = '<option value="">Choisir une classe…</option>' +
    classesListe.map(c => `<option value="${c.id}">${echapperHTML(c.nom)} (${echapperHTML(c.niveau_nom)})</option>`).join('');
}

async function chargerModeles(){
  try {
    const reponse = await fetch('php/modeles_messages.php');
    if (!reponse.ok) throw new Error();
    modeles = await reponse.json();
  } catch (erreur) {
    modeles = [];
  }
  $('mModele').innerHTML = '<option value="">Utiliser un modèle…</option>' +
    modeles.map(m => `<option value="${m.id}">${echapperHTML(m.titre)}</option>`).join('');
  afficherModeles();
}

/* =========================================================
   2. FORMULAIRE — DESTINATAIRES
   ========================================================= */
function canalSelectionne(){
  const bouton = document.querySelector('input[name="canal"]:checked');
  return bouton ? bouton.value : 'sms';
}

function majApparenceCanal(){
  document.querySelectorAll('.option-canal').forEach(etiquette => {
    const coche = etiquette.querySelector('input').checked;
    etiquette.classList.toggle('coche', coche);
  });
  const canal = canalSelectionne();
  $('champObjet').hidden = !canalUtiliseEmail(canal);
  $('noteWhatsApp').hidden = canal !== 'whatsapp';
}

function individuIdSaisi(){
  const valeur = $('mIndividu').value;
  return valeur ? Number(valeur) : null;
}

async function peuplerListeIndividus(categorie){
  $('mIndividu').innerHTML = '<option value="">Chargement…</option>';
  try {
    const reponse = await fetch(`php/communications.php?destinataires=1&categorie=${encodeURIComponent(categorie)}&portee=tous`);
    if (!reponse.ok) throw new Error();
    const donnees = await reponse.json();
    $('mIndividu').innerHTML = '<option value="">— Choisir un destinataire —</option>' +
      donnees.destinataires.map(d => `<option value="${d.reference_id}">${echapperHTML(d.nom)}</option>`).join('');
  } catch (erreur) {
    $('mIndividu').innerHTML = '<option value="">— Choisir un destinataire —</option>';
  }
}

function majVisibiliteChamps(){
  // WhatsApp n'a de sens que pour un destinataire précis (lien wa.me
  // individuel) : on verrouille catégorie/portée en conséquence.
  const whatsapp = canalSelectionne() === 'whatsapp';
  $('mCategorie').querySelector('option[value="tous"]').hidden = whatsapp;
  if (whatsapp && $('mCategorie').value === 'tous') {
    $('mCategorie').value = 'parents';
  }

  const categorie = $('mCategorie').value;
  const classeAutorisee = ['eleves', 'parents'].includes(categorie) && !whatsapp;

  $('mPortee').querySelector('option[value="classe"]').hidden = !classeAutorisee;
  $('mPortee').querySelector('option[value="tous"]').hidden = whatsapp;
  if (whatsapp) {
    $('mPortee').value = 'individuel';
  } else if (categorie === 'tous') {
    $('mPortee').value = 'tous';
  } else if (!classeAutorisee && $('mPortee').value === 'classe') {
    $('mPortee').value = 'tous';
  }
  $('mPortee').disabled = categorie === 'tous' || whatsapp;

  const portee = $('mPortee').value;
  $('champClasse').hidden = portee !== 'classe';
  $('champIndividuel').hidden = portee !== 'individuel';

  if (portee === 'individuel') peuplerListeIndividus(categorie).then(rafraichirApercuDestinataires);
  else rafraichirApercuDestinataires();
}

let minuterieApercu;
function rafraichirApercuDestinataires(){
  clearTimeout(minuterieApercu);
  minuterieApercu = setTimeout(async () => {
    const categorie = $('mCategorie').value;
    const portee    = $('mPortee').value;
    const conteneur = $('apercuDestinataires');

    if (portee === 'classe' && !$('mClasse').value) {
      conteneur.innerHTML = '<span class="chargement">Choisissez une classe…</span>';
      return;
    }
    if (portee === 'individuel' && individuIdSaisi() === null) {
      conteneur.innerHTML = '<span class="chargement">Choisissez un destinataire dans la liste…</span>';
      return;
    }

    conteneur.innerHTML = '<span class="chargement">Chargement des destinataires…</span>';
    const parametres = new URLSearchParams({ destinataires: '1', categorie, portee });
    if (portee === 'classe') parametres.set('classe_id', $('mClasse').value);
    if (portee === 'individuel') parametres.set('individu_id', individuIdSaisi());

    try {
      const reponse = await fetch(`php/communications.php?${parametres}`);
      if (!reponse.ok) throw new Error();
      const donnees = await reponse.json();
      const canal = canalSelectionne();

      if (donnees.total === 0) {
        conteneur.innerHTML = '<div class="avertissement-destinataires critique">Aucun destinataire ne correspond à cette sélection.</div>';
        return;
      }

      const details = [];
      if (canalUtiliseSms(canal) && donnees.sans_telephone > 0) details.push(`${donnees.sans_telephone} sans téléphone`);
      if (canalUtiliseEmail(canal) && donnees.sans_email > 0) details.push(`${donnees.sans_email} sans e-mail`);

      conteneur.innerHTML = `
        <div class="resume-destinataires">
          <span><b>${donnees.total}</b> destinataire${donnees.total > 1 ? 's' : ''}</span>
        </div>
        ${details.length ? `<div class="avertissement-destinataires">⚠️ ${details.join(' · ')} — ces destinataires seront marqués en échec sur le canal concerné.</div>` : ''}`;
    } catch (erreur) {
      conteneur.innerHTML = '<span class="chargement">Impossible de charger les destinataires.</span>';
    }
  }, 300);
}

document.querySelectorAll('input[name="canal"]').forEach(bouton => {
  bouton.addEventListener('change', () => { majApparenceCanal(); majVisibiliteChamps(); });
});
$('mCategorie').addEventListener('change', majVisibiliteChamps);
$('mPortee').addEventListener('change', majVisibiliteChamps);
$('mClasse').addEventListener('change', rafraichirApercuDestinataires);
$('mIndividu').addEventListener('change', rafraichirApercuDestinataires);

/* =========================================================
   3. FORMULAIRE — MESSAGE
   ========================================================= */
$('mContenu').addEventListener('input', () => {
  $('compteurCaracteres').textContent = `${$('mContenu').value.length} caractère(s)`;
});

$('mModele').addEventListener('change', () => {
  const id = Number($('mModele').value);
  if (!id) return;
  const modele = modeles.find(m => m.id === id);
  if (!modele) return;

  $('mObjet').value = modele.sujet || '';
  $('mContenu').value = modele.contenu || '';
  $('compteurCaracteres').textContent = `${$('mContenu').value.length} caractère(s)`;
  const bouton = document.querySelector(`input[name="canal"][value="${modele.canal}"]`);
  if (bouton) { bouton.checked = true; majApparenceCanal(); }
  rafraichirApercuDestinataires();
});

function appliquerModele(modele){
  choisirOnglet('nouveau');
  $('mModele').value = String(modele.id);
  $('mModele').dispatchEvent(new Event('change'));
}

function reinitialiserFormulaire(){
  brouillonEnEdition = null;
  document.querySelector('input[name="canal"][value="sms"]').checked = true;
  $('mCategorie').value = 'eleves';
  $('mPortee').value = 'tous';
  $('mClasse').value = '';
  $('mIndividu').value = '';
  $('mModele').value = '';
  $('mObjet').value = '';
  $('mContenu').value = '';
  $('mEnregistrerModele').checked = false;
  $('compteurCaracteres').textContent = '0 caractère(s)';
  $('btnApercu').textContent = '';
  $('btnApercu').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
    Aperçu avant envoi`;
  majApparenceCanal();
  majVisibiliteChamps();
}
$('btnReinitialiser').addEventListener('click', reinitialiserFormulaire);

function validerFormulaire(){
  const canal      = canalSelectionne();
  const categorie  = $('mCategorie').value;
  const portee     = $('mPortee').value;
  const sujet      = $('mObjet').value.trim();
  const contenu    = $('mContenu').value.trim();

  if (!contenu) { notifier('Le contenu du message est obligatoire.'); return null; }
  if (canalUtiliseEmail(canal) && !sujet) { notifier("L'objet est obligatoire pour un envoi par e-mail."); return null; }
  if (portee === 'classe' && !$('mClasse').value) { notifier('Choisissez une classe.'); return null; }
  if (portee === 'individuel' && individuIdSaisi() === null) { notifier('Choisissez un destinataire valide dans la liste.'); return null; }

  const valeurs = { canal, categorie, portee, sujet, contenu };
  if (portee === 'classe') valeurs.classe_id = Number($('mClasse').value);
  if (portee === 'individuel') valeurs.individu_id = individuIdSaisi();
  return valeurs;
}

async function enregistrerModeleDepuisFormulaire(canal, sujet, contenu){
  const titre = (sujet || contenu.slice(0, 40)).trim();
  try {
    await fetch('php/modeles_messages.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre, canal, sujet, contenu }),
    });
    await chargerModeles();
  } catch (erreur) { /* l'échec de l'enregistrement du modèle n'empêche pas l'envoi */ }
}

/* ---------- Brouillon ---------- */
$('btnBrouillon').addEventListener('click', async () => {
  const valeurs = validerFormulaire();
  if (!valeurs) return;

  const url    = brouillonEnEdition ? `php/communications.php?id=${brouillonEnEdition}` : 'php/communications.php';
  const methode = brouillonEnEdition ? 'PUT' : 'POST';

  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valeurs, action: 'brouillon' }),
  });
  const resultat = await reponse.json();
  if (!reponse.ok) { notifier(resultat.erreur || "Échec de l'enregistrement du brouillon."); return; }

  notifier('Brouillon enregistré.');
  reinitialiserFormulaire();
  chargerHistorique();
});

/* ---------- Aperçu avant envoi ---------- */
let envoiEnCours = null;
let telephoneWhatsAppEnCours = null;

$('btnApercu').addEventListener('click', async () => {
  const valeurs = validerFormulaire();
  if (!valeurs) return;

  const parametres = new URLSearchParams({ destinataires: '1', categorie: valeurs.categorie, portee: valeurs.portee });
  if (valeurs.classe_id) parametres.set('classe_id', valeurs.classe_id);
  if (valeurs.individu_id) parametres.set('individu_id', valeurs.individu_id);

  let donnees;
  try {
    const reponse = await fetch(`php/communications.php?${parametres}`);
    donnees = await reponse.json();
  } catch (erreur) { notifier('Impossible de vérifier les destinataires.'); return; }

  if (!donnees.total) { notifier('Aucun destinataire ne correspond à cette sélection.'); return; }

  envoiEnCours = valeurs;

  const canal = valeurs.canal;
  $('apercuResume').textContent =
    `${LIBELLES_CANAL[canal]} · ${LIBELLES_CATEGORIE[valeurs.categorie]} · ${donnees.total} destinataire${donnees.total > 1 ? 's' : ''}`;
  $('apercuObjet').hidden = !canalUtiliseEmail(canal);
  $('apercuObjet').textContent = valeurs.sujet;
  $('apercuContenu').textContent = valeurs.contenu;

  $('apercuListe').innerHTML = donnees.destinataires.slice(0, 30).map(d => {
    const manque = (canalUtiliseSms(canal) && !d.telephone) || (canalUtiliseEmail(canal) && !d.email);
    const contact = [
      canalUtiliseSms(canal) ? (d.telephone || 'sans téléphone') : null,
      canalUtiliseEmail(canal) ? (d.email || 'sans e-mail') : null,
    ].filter(Boolean).join(' · ');
    return `<li class="${manque ? 'manque' : ''}"><span>${echapperHTML(d.nom)}</span><small>${echapperHTML(contact)}</small></li>`;
  }).join('') + (donnees.total > 30 ? `<li><small>… et ${donnees.total - 30} autre(s).</small></li>` : '');

  // Pour WhatsApp, seul un envoi individuel est permis (validerFormulaire /
  // l'API l'imposent déjà) : on garde le téléphone du destinataire unique
  // sous la main pour ouvrir wa.me après confirmation.
  telephoneWhatsAppEnCours = canal === 'whatsapp' ? (donnees.destinataires[0]?.telephone || null) : null;

  $('fenetreApercu').classList.add('visible');
});

function fermerApercu(){ $('fenetreApercu').classList.remove('visible'); }
$('fermerApercu').addEventListener('click', fermerApercu);
$('annulerApercu').addEventListener('click', fermerApercu);
$('fenetreApercu').addEventListener('click', e => { if (e.target === $('fenetreApercu')) fermerApercu(); });

$('confirmerEnvoi').addEventListener('click', async () => {
  if (!envoiEnCours) return;
  const bouton = $('confirmerEnvoi');
  bouton.disabled = true;

  /* L'onglet WhatsApp doit s'ouvrir de façon SYNCHRONE, avant le moindre
     "await" : une fois l'attente réseau passée, le navigateur ne considère
     plus l'appel comme déclenché par un geste utilisateur et bloque le
     popup. On ouvre donc tout de suite un onglet vierge, qu'on redirige
     vers wa.me une fois l'envoi confirmé (ou qu'on referme en cas d'échec). */
  let fenetreWhatsApp = null;
  if (envoiEnCours.canal === 'whatsapp' && telephoneWhatsAppEnCours) {
    fenetreWhatsApp = window.open('', '_blank');
  }

  const enregistrerModele = $('mEnregistrerModele').checked;
  const url     = brouillonEnEdition ? `php/communications.php?id=${brouillonEnEdition}` : 'php/communications.php';
  const methode = brouillonEnEdition ? 'PUT' : 'POST';

  try {
    const reponse = await fetch(url, {
      method: methode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envoiEnCours, action: 'envoyer' }),
    });
    const resultat = await reponse.json();
    if (!reponse.ok) {
      if (fenetreWhatsApp) fenetreWhatsApp.close();
      notifier(resultat.erreur || "Échec de l'envoi.");
      return;
    }

    if (enregistrerModele) await enregistrerModeleDepuisFormulaire(envoiEnCours.canal, envoiEnCours.sujet, envoiEnCours.contenu);

    if (fenetreWhatsApp) {
      fenetreWhatsApp.location.href = `https://wa.me/${numeroWhatsApp(telephoneWhatsAppEnCours)}?text=${encodeURIComponent(envoiEnCours.contenu)}`;
    }

    fermerApercu();
    reinitialiserFormulaire();
    chargerHistorique();

    if (envoiEnCours.canal === 'whatsapp') {
      notifier(telephoneWhatsAppEnCours
        ? 'WhatsApp ouvert dans un nouvel onglet — appuyez sur Envoyer pour finaliser.'
        : 'Ce destinataire n\'a pas de téléphone renseigné : WhatsApp n\'a pas pu être ouvert.');
    } else if (resultat.statut === 'envoye') notifier(`Message envoyé à ${resultat.nb_reussis}/${resultat.nb_destinataires} destinataire(s).`);
    else if (resultat.statut === 'partiel') notifier(`Envoi partiel : ${resultat.nb_reussis}/${resultat.nb_destinataires} destinataire(s) atteint(s).`);
    else notifier(`Échec de l'envoi pour l'ensemble des ${resultat.nb_destinataires} destinataire(s).`);
  } catch (erreur) {
    if (fenetreWhatsApp) fenetreWhatsApp.close();
    notifier("Échec de l'envoi.");
  } finally {
    bouton.disabled = false;
    envoiEnCours = null;
    telephoneWhatsAppEnCours = null;
  }
});

/* =========================================================
   4. HISTORIQUE
   ========================================================= */
async function chargerHistorique(){
  const parametres = new URLSearchParams();
  if ($('filtreRecherche').value.trim()) parametres.set('recherche', $('filtreRecherche').value.trim());
  if ($('filtreCanal').value) parametres.set('canal', $('filtreCanal').value);
  if ($('filtreStatut').value) parametres.set('statut', $('filtreStatut').value);
  if ($('filtreCategorie').value) parametres.set('categorie', $('filtreCategorie').value);
  if ($('filtreDateDebut').value) parametres.set('date_debut', $('filtreDateDebut').value);
  if ($('filtreDateFin').value) parametres.set('date_fin', $('filtreDateFin').value);

  try {
    const reponse = await fetch(`php/communications.php?${parametres}`);
    if (!reponse.ok) throw new Error();
    historique = await reponse.json();
  } catch (erreur) {
    historique = [];
  }

  afficherHistorique();
  majIndicateurs();
}

function afficherHistorique(){
  $('corpsHistorique').innerHTML = historique.map(c => {
    const contenuTronque = (c.contenu || '').slice(0, 90) + (c.contenu && c.contenu.length > 90 ? '…' : '');
    const actions = c.statut === 'brouillon'
      ? `<button type="button" class="action" data-modifier="${c.id}">Modifier</button>`
      : `<button type="button" class="action" data-details="${c.id}">Détails</button>`;
    return `
    <tr>
      <td class="apercu-message"><b>${echapperHTML(c.sujet || '(sans objet)')}</b><small>${echapperHTML(contenuTronque)}</small></td>
      <td>${LIBELLES_CATEGORIE[c.categorie] || c.categorie}<br><small style="color:var(--texte-doux)">${echapperHTML(libellePortee(c))}</small></td>
      <td><span class="badge-canal">${LIBELLES_CANAL[c.canal] || c.canal}</span></td>
      <td>${dateFrHeure(c.cree_le)}</td>
      <td class="fin" style="text-align:center"><span class="statut ${CLASSES_STATUT[c.statut] || ''}">${LIBELLES_STATUT[c.statut] || c.statut}</span></td>
      <td class="fin">
        ${actions}
        <button type="button" class="action" data-supprimer="${c.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');

  $('messageVide').classList.toggle('visible', historique.length === 0);
  $('compteResultats').textContent = `${historique.length} message${historique.length > 1 ? 's' : ''} affiché${historique.length > 1 ? 's' : ''}.`;
}

function majIndicateurs(){
  const envoyes = historique.filter(c => c.statut !== 'brouillon');
  const brouillons = historique.filter(c => c.statut === 'brouillon');
  const totalDestinataires = envoyes.reduce((s, c) => s + (c.nb_destinataires || 0), 0);
  const totalReussis = envoyes.reduce((s, c) => s + (c.nb_reussis || 0), 0);
  const taux = totalDestinataires ? Math.round(totalReussis / totalDestinataires * 100) : null;

  $('kpiTotal').textContent = envoyes.length;
  $('kpiReussite').textContent = taux === null ? '—' : `${taux}%`;
  $('jaugeReussite').style.width = `${taux ?? 0}%`;
  $('kpiDestinataires').textContent = totalDestinataires;
  $('kpiBrouillons').textContent = brouillons.length;
}

['filtreRecherche', 'filtreCanal', 'filtreStatut', 'filtreCategorie', 'filtreDateDebut', 'filtreDateFin'].forEach(id => {
  $(id).addEventListener('input', chargerHistorique);
  $(id).addEventListener('change', chargerHistorique);
});

$('corpsHistorique').addEventListener('click', async (evenement) => {
  const boutonDetails = evenement.target.closest('[data-details]');
  if (boutonDetails) { ouvrirDetails(Number(boutonDetails.dataset.details)); return; }

  const boutonModifier = evenement.target.closest('[data-modifier]');
  if (boutonModifier) { await chargerBrouillonDansFormulaire(Number(boutonModifier.dataset.modifier)); return; }

  const boutonSupprimer = evenement.target.closest('[data-supprimer]');
  if (boutonSupprimer) {
    if (!confirm('Supprimer définitivement ce message de l\'historique ?')) return;
    const reponse = await fetch(`php/communications.php?id=${boutonSupprimer.dataset.supprimer}`, { method: 'DELETE' });
    if (!reponse.ok) { notifier('Échec de la suppression.'); return; }
    chargerHistorique();
    notifier('Message supprimé.');
  }
});

async function ouvrirDetails(id){
  const reponse = await fetch(`php/communications.php?id=${id}`);
  if (!reponse.ok) { notifier('Impossible de charger ce message.'); return; }
  const communication = await reponse.json();

  $('titreDetails').textContent = LIBELLES_STATUT[communication.statut] || 'Détails du message';
  $('detailsObjet').hidden = !communication.sujet;
  $('detailsObjet').textContent = communication.sujet || '';
  $('detailsContenu').textContent = communication.contenu;

  const LIBELLES_STATUT_CANAL = { non_concerne: '—', envoye: '✅ Envoyé', simule: '🧪 Simulé', echec: '❌ Échec', whatsapp: '💬 Ouvert dans WhatsApp' };
  $('corpsDetails').innerHTML = communication.destinataires.map(d => `
    <tr>
      <td>${echapperHTML(d.nom)}</td>
      <td title="${echapperHTML(d.erreur_sms || '')}">${LIBELLES_STATUT_CANAL[d.statut_sms] || d.statut_sms}</td>
      <td title="${echapperHTML(d.erreur_email || '')}">${LIBELLES_STATUT_CANAL[d.statut_email] || d.statut_email}</td>
    </tr>`).join('') || '<tr><td colspan="3">Aucun destinataire enregistré.</td></tr>';

  $('fenetreDetails').classList.add('visible');
}
function fermerDetails(){ $('fenetreDetails').classList.remove('visible'); }
$('fermerDetails').addEventListener('click', fermerDetails);
$('fermerDetails2').addEventListener('click', fermerDetails);
$('fenetreDetails').addEventListener('click', e => { if (e.target === $('fenetreDetails')) fermerDetails(); });

async function chargerBrouillonDansFormulaire(id){
  const reponse = await fetch(`php/communications.php?id=${id}`);
  if (!reponse.ok) { notifier('Impossible de charger ce brouillon.'); return; }
  const c = await reponse.json();

  brouillonEnEdition = c.id;
  document.querySelector(`input[name="canal"][value="${c.canal}"]`).checked = true;
  majApparenceCanal();
  $('mCategorie').value = c.categorie;
  $('mPortee').value = c.portee;
  majVisibiliteChamps();
  if (c.portee === 'classe') $('mClasse').value = c.classe_id || '';
  if (c.portee === 'individuel' && c.individu_id) {
    await peuplerListeIndividus(c.categorie);
    $('mIndividu').value = String(c.individu_id);
  }
  $('mObjet').value = c.sujet || '';
  $('mContenu').value = c.contenu;
  $('compteurCaracteres').textContent = `${c.contenu.length} caractère(s)`;
  rafraichirApercuDestinataires();

  choisirOnglet('nouveau');
  notifier('Brouillon chargé : modifiez-le puis envoyez-le ou ré-enregistrez.');
}

/* =========================================================
   5. MODÈLES
   ========================================================= */
function afficherModeles(){
  $('corpsModeles').innerHTML = modeles.map(m => `
    <tr>
      <td><b>${echapperHTML(m.titre)}</b></td>
      <td><span class="badge-canal">${LIBELLES_CANAL[m.canal] || m.canal}</span></td>
      <td>${echapperHTML(m.sujet || '—')}</td>
      <td class="fin">
        <button type="button" class="action" data-utiliser="${m.id}">Utiliser</button>
        <button type="button" class="action" data-modifier-modele="${m.id}">Modifier</button>
        <button type="button" class="action" data-supprimer-modele="${m.id}">Supprimer</button>
      </td>
    </tr>`).join('');
  $('modelesVide').classList.toggle('visible', modeles.length === 0);
}

$('corpsModeles').addEventListener('click', async (evenement) => {
  const boutonUtiliser = evenement.target.closest('[data-utiliser]');
  if (boutonUtiliser) {
    const modele = modeles.find(m => m.id === Number(boutonUtiliser.dataset.utiliser));
    if (modele) appliquerModele(modele);
    return;
  }

  const boutonModifier = evenement.target.closest('[data-modifier-modele]');
  if (boutonModifier) {
    const modele = modeles.find(m => m.id === Number(boutonModifier.dataset.modifierModele));
    if (!modele) return;
    modeleEnEdition = modele.id;
    $('modTitre').value = modele.titre;
    $('modCanal').value = modele.canal;
    $('modSujet').value = modele.sujet || '';
    $('modContenu').value = modele.contenu;
    $('titreFenetreModele').textContent = 'Modifier le modèle';
    $('btnValiderModele').textContent = 'Enregistrer les modifications';
    $('fenetreModele').classList.add('visible');
    return;
  }

  const boutonSupprimer = evenement.target.closest('[data-supprimer-modele]');
  if (boutonSupprimer) {
    if (!confirm('Supprimer définitivement ce modèle ?')) return;
    const reponse = await fetch(`php/modeles_messages.php?id=${boutonSupprimer.dataset.supprimerModele}`, { method: 'DELETE' });
    if (!reponse.ok) { notifier('Échec de la suppression.'); return; }
    await chargerModeles();
    notifier('Modèle supprimé.');
  }
});

$('btnNouveauModele').addEventListener('click', () => {
  modeleEnEdition = null;
  $('formModele').reset();
  $('modCanal').value = 'sms_email';
  $('titreFenetreModele').textContent = 'Nouveau modèle';
  $('btnValiderModele').textContent = 'Enregistrer';
  $('fenetreModele').classList.add('visible');
  $('modTitre').focus();
});

function fermerFenetreModele(){ $('fenetreModele').classList.remove('visible'); }
$('fermerFenetreModele').addEventListener('click', fermerFenetreModele);
$('annulerModele').addEventListener('click', fermerFenetreModele);
$('fenetreModele').addEventListener('click', e => { if (e.target === $('fenetreModele')) fermerFenetreModele(); });

$('formModele').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const titre = $('modTitre').value.trim();
  const contenu = $('modContenu').value.trim();
  if (!titre || !contenu) { notifier('Le titre et le contenu sont obligatoires.'); return; }

  const valeurs = { titre, canal: $('modCanal').value, sujet: $('modSujet').value.trim(), contenu };
  const url     = modeleEnEdition ? `php/modeles_messages.php?id=${modeleEnEdition}` : 'php/modeles_messages.php';
  const methode = modeleEnEdition ? 'PUT' : 'POST';

  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valeurs),
  });
  const resultat = await reponse.json();
  if (!reponse.ok) { notifier(resultat.erreur || "Échec de l'enregistrement."); return; }

  fermerFenetreModele();
  await chargerModeles();
  notifier(modeleEnEdition ? 'Modèle mis à jour.' : 'Modèle créé.');
});

/* =========================================================
   6. ONGLETS
   ========================================================= */
const panneaux = { nouveau: 'panNouveau', historique: 'panHistorique', modeles: 'panModeles' };

function choisirOnglet(nom){
  document.querySelectorAll('.onglet').forEach(o => o.classList.toggle('actif', o.dataset.onglet === nom));
  Object.entries(panneaux).forEach(([cle, id]) => $(id).classList.toggle('visible', cle === nom));
}
document.querySelectorAll('.onglet').forEach(o => o.addEventListener('click', () => choisirOnglet(o.dataset.onglet)));

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
   8. PRÉ-REMPLISSAGE DEPUIS UNE AUTRE PAGE (ex. « Envoyer aux parents »
      du module Bulletins) : ?categorie=&portee=&individu_id=&classe_id=&
      sujet=&contenu=&canal= dans l'URL pré-remplissent directement le
      formulaire de composition, sans dupliquer le circuit d'envoi.
   ========================================================= */
async function appliquerPrefiltrageURL(){
  const parametres = new URLSearchParams(location.search);
  if (!parametres.has('categorie') && !parametres.has('individu_id')) return;

  const canal = parametres.get('canal');
  if (canal) {
    const boutonCanal = document.querySelector(`input[name="canal"][value="${canal}"]`);
    if (boutonCanal) boutonCanal.checked = true;
  }
  majApparenceCanal();

  const categorie = parametres.get('categorie') || 'eleves';
  const portee    = parametres.get('portee') || 'tous';
  $('mCategorie').value = categorie;
  $('mPortee').value = portee;
  majVisibiliteChamps();

  if (portee === 'classe' && parametres.get('classe_id')) {
    $('mClasse').value = parametres.get('classe_id');
  }
  if (portee === 'individuel' && parametres.get('individu_id')) {
    await peuplerListeIndividus(categorie);
    $('mIndividu').value = parametres.get('individu_id');
  }

  if (parametres.has('sujet'))   $('mObjet').value = parametres.get('sujet');
  if (parametres.has('contenu')) $('mContenu').value = parametres.get('contenu');
  $('compteurCaracteres').textContent = `${$('mContenu').value.length} caractère(s)`;

  rafraichirApercuDestinataires();

  // Nettoie l'URL pour qu'un rechargement ne réapplique pas ce pré-remplissage.
  history.replaceState(null, '', location.pathname);
}

/* =========================================================
   9. DÉMARRAGE
   ========================================================= */
majApparenceCanal();
majVisibiliteChamps();
chargerClasses().then(appliquerPrefiltrageURL);
chargerModeles();
chargerHistorique();

});
