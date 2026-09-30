/* =========================================================
   SCOLARIS — Profil administrateur & notifications
   Script partagé, inclus sur toutes les pages protégées.
   Alimente dynamiquement l'avatar, le nom, le rôle (rail
   latéral + barre supérieure) à partir de la session ouverte,
   et fournit le menu « compte » et le panneau de notifications.
   ========================================================= */

/* =========================================================
   CONTRÔLE D'ACCÈS PAR RÔLE
   Chaque page correspond à une « clé » de module. `null` dans
   ACCES_PAR_ROLE signifie un accès total (administrateur, direction —
   leur expérience ne change jamais). Une page absente de PAGE_ROLE_CLE
   (tableau-de-bord.html, profil.html…) reste accessible à tous.
   Sécurité réelle : les API vérifient déjà les rôles côté serveur
   (voir php/_aide.php) — ceci n'évite que la confusion côté écran.
   ========================================================= */
const PAGE_ROLE_CLE = {
  'inscription.html':        'inscription',
  'eleves.html':              'eleves',
  'classes.html':             'classes',
  'matieres.html':            'matieres',
  'enseignants.html':         'enseignants',
  'emploi-du-temps.html':     'emploi',
  'Notes.html':                'notes',
  'absences.html':             'vie',
  'paiements.html':            'finances',
  'livret-caisse.html':        'finances',
  'impayes.html':              'finances',
  'depenses.html':             'finances',
  'rapports-financiers.html':  'finances',
  'recu.html':                 'finances',
  'resultats.html':            'resultats',
  'bulletins.html':            'resultats',
  'administratif.html':        'administratif',
  'utilisateurs.html':         'administratif',
  'personnel.html':            'administratif',
  'communication.html':        'administratif',
  'parametres.html':           'parametres',
};

const ACCES_PAR_ROLE = {
  administrateur: null,
  direction: null,
  secretaire: ['inscription', 'eleves', 'classes', 'matieres', 'enseignants', 'emploi', 'notes', 'vie', 'finances', 'resultats', 'administratif'],
  comptable:  ['eleves', 'classes', 'finances'],
  enseignant: ['eleves', 'classes', 'matieres', 'enseignants', 'emploi', 'notes', 'vie', 'resultats'],
};

/* Exécuté immédiatement (avant DOMContentLoaded, comme la garde de
   session de chaque page) pour rediriger le plus tôt possible un rôle
   non autorisé qui accéderait directement à l'URL d'une page interdite. */
(function appliquerControleAccesRole(){
  let utilisateur = null;
  try { utilisateur = JSON.parse(sessionStorage.getItem('lyceeclassic.utilisateur') || 'null'); }
  catch (erreur) { utilisateur = null; }
  if (!utilisateur) return;

  const listeAutorisee = ACCES_PAR_ROLE[utilisateur.role];
  if (listeAutorisee === undefined || listeAutorisee === null) return; // rôle inconnu ou accès total

  const fichier = location.pathname.split('/').pop() || 'tableau-de-bord.html';
  const cle = PAGE_ROLE_CLE[fichier];
  if (cle && !listeAutorisee.includes(cle)) {
    window.location.replace('tableau-de-bord.html');
  }
})();

document.addEventListener('DOMContentLoaded', () => {

/* =========================================================
   1. UTILISATEUR CONNECTÉ
   ========================================================= */
const UTILISATEUR_PAR_DEFAUT = {
  prenom: 'Josepha', nom: 'Kapche',
  email: 'admin@lyceeclassic.edu', role: 'administrateur'
};

function utilisateurConnecte(){
  try {
    const brut = sessionStorage.getItem('lyceeclassic.utilisateur');
    if (brut) return JSON.parse(brut);
  } catch (erreur) { /* stockage corrompu : on retombe sur la valeur par défaut */ }
  return null;
}

function initiales(prenom, nom){
  return `${(prenom || '?').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();
}

/* Remplace l'année affichée en dur dans l'en-tête de chaque page
   (« Année scolaire 2026 – 2027 ») par la vraie année active en base,
   et tient à jour le détail correspondant dans le menu « compte ».
   Partagé par toutes les pages puisque compte.js y est chargé partout. */
async function chargerAnneeActive(){
  try {
    const reponse = await fetch('php/annees_scolaires.php');
    if (!reponse.ok) throw new Error();
    const annees = await reponse.json();
    const active = annees.find(a => a.statut === 'active');
    const libelle = active ? active.libelle.replace('-', ' – ') : '—';

    document.querySelectorAll('.fil b').forEach(bloc => {
      bloc.textContent = `Année scolaire ${libelle}`;
    });
    const detail = document.getElementById('popoverDetailAnnee');
    if (detail) detail.textContent = libelle;
  } catch (erreur) { /* en-tête laissé tel quel si l'API est indisponible */ }
}

const utilisateur = utilisateurConnecte() || UTILISATEUR_PAR_DEFAUT;

/* Masque les entrées du menu latéral que ce rôle ne peut pas ouvrir
   (la redirection ci-dessus couvre l'accès direct par URL). Ne touche à
   rien pour administrateur/direction (accès total, ACCES_PAR_ROLE vaut
   null) — leur menu reste strictement identique à aujourd'hui. */
function filtrerMenuParRole(role){
  const listeAutorisee = ACCES_PAR_ROLE[role];
  if (listeAutorisee === undefined || listeAutorisee === null) return;

  document.querySelectorAll('.menu > a.menu-lien[href]').forEach(lien => {
    const fichier = lien.getAttribute('href').split('/').pop();
    const cle = PAGE_ROLE_CLE[fichier];
    if (cle && !listeAutorisee.includes(cle)) lien.remove();
  });

  document.querySelectorAll('.menu > .groupe').forEach(groupe => {
    const premierLien = groupe.querySelector('.sous-lien[href]');
    if (!premierLien) return;
    const fichier = premierLien.getAttribute('href').split('/').pop();
    const cle = PAGE_ROLE_CLE[fichier];
    if (cle && !listeAutorisee.includes(cle)) groupe.remove();
  });
}
filtrerMenuParRole(utilisateur.role);

/* =========================================================
   2. APPLICATION DU PROFIL SUR LA PAGE
   ========================================================= */
function appliquerProfil(u){
  const nomComplet = `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur';
  const initiale    = initiales(u.prenom, u.nom);

  document.querySelectorAll('.rail-pied .compte').forEach(compte => {
    const avatar = compte.querySelector('.avatar');
    const nomEl  = compte.querySelector('b');
    if (avatar) avatar.textContent = initiale;
    if (nomEl)  nomEl.textContent  = nomComplet;
  });

  document.querySelectorAll('.barre-actions .avatar').forEach(avatar => {
    avatar.textContent = initiale;
  });

  const prenomEl = document.getElementById('prenomUtilisateur');
  if (prenomEl) prenomEl.textContent = (u.prenom || 'Utilisateur').toLowerCase();
}

appliquerProfil(utilisateur);

/* =========================================================
   3. NOTIFICATION FLOTTANTE (toast) PARTAGÉE
   ========================================================= */
let minuterieToast;
function notifierCompte(texte){
  let toast = document.getElementById('toastCompte');
  if (!toast){
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'toastCompte';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
      <span></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector('span').textContent = texte;
  toast.classList.add('visible');
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/* =========================================================
   4. MENU « COMPTE »
   ========================================================= */
/* Icônes SVG (même style trait que le menu latéral : viewBox 24x24, trait
   currentColor) plutôt que des emojis — rendu identique sur toutes les
   plateformes, pas de dépendance à la police système. */
const ICONES_POPOVER = {
  profil:      '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5C5 16.5 8 15 12 15s7 1.5 7 4.5V21"/>',
  etablissement: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/>',
  calendrier:  '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v3M16 3v3"/>',
  parametres:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 17.6a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 13a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 2.28V2a2 2 0 0 1 4 0v.09c0 .67.39 1.27 1 1.51.61.24 1.31.13 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.46.51-.57 1.21-.33 1.82.24.61.84 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.67 0-1.27.39-1.51 1Z"/>',
  reglages:    '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="18" r="2"/>',
  cloche:      '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  cadenas:     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ecran:       '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  deconnexion: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alerte:      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};
function svgPopover(cle){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES_POPOVER[cle] || ICONES_POPOVER.cloche}</svg>`;
}

const sectionsCompte = [
  { titre: 'Informations', items: [
      { icone: svgPopover('profil'),       titre: 'Profil',         details: 'Voir et modifier mon profil',        action: 'profil' },
      { icone: svgPopover('etablissement'), titre: 'Établissement',  details: "Informations de l'établissement",     action: 'etablissement' },
      { icone: svgPopover('calendrier'),   titre: 'Année scolaire', details: '<span id="popoverDetailAnnee">Chargement…</span>', action: 'annee' }
  ]},
  { titre: 'Préférences', items: [
      { icone: svgPopover('parametres'), titre: 'Paramètres du compte', details: 'Gérer mon compte',              action: 'parametres-compte' },
      { icone: svgPopover('reglages'),   titre: 'Préférences',          details: "Personnaliser l'application",   action: 'preferences' },
      { icone: svgPopover('cloche'),     titre: 'Notifications',        details: 'Gérer les notifications',        action: 'notifications' }
  ]},
  { titre: 'Sécurité', items: [
      { icone: svgPopover('cadenas'), titre: 'Changer le mot de passe', details: 'Sécuriser mon compte',          action: 'mot-de-passe' },
      { icone: svgPopover('ecran'),   titre: 'Sessions actives',        details: 'Voir les connexions actives',   action: 'sessions' }
  ]}
];

function construirePopoverCompte(u){
  const popover = document.createElement('div');
  popover.className = 'popover popover-compte';
  popover.id = 'popoverCompte';

  const initiale   = initiales(u.prenom, u.nom);
  const nomComplet  = `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur';

  popover.innerHTML = `
    <div class="popover-entete">
      <span class="avatar">${initiale}</span>
      <div>
        <b>${nomComplet}</b>
        <span>${u.email || ''}</span>
      </div>
    </div>
    ${sectionsCompte.map(section => `
      <p class="popover-titre">${section.titre}</p>
      ${section.items.map(item => `
        <a class="popover-item" href="profil.html#${item.action}">
          <span class="popover-icone">${item.icone}</span>
          <span>
            <b>${item.titre}</b>
            <small>${item.details}</small>
          </span>
        </a>
      `).join('')}
    `).join('')}
    <button type="button" class="popover-item popover-deconnexion" data-action="deconnexion">
      <span class="popover-icone">${svgPopover('deconnexion')}</span>
      <span><b>Se déconnecter</b></span>
    </button>
  `;

  popover.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('.popover-item');
    if (!bouton) return;

    if (bouton.dataset.action === 'deconnexion'){
      fermerPopover(popover);
      seDeconnecter();
      return;
    }

    // Les autres éléments sont de vrais liens : on ferme juste le panneau,
    // la navigation vers profil.html suit son cours normalement.
    fermerPopover(popover);
  });

  return popover;
}

function seDeconnecter(){
  fetch('php/connexion.php', { method: 'DELETE' }).catch(() => {});
  sessionStorage.removeItem('lyceeclassic.session');
  sessionStorage.removeItem('lyceeclassic.utilisateur');
  window.location.href = 'connexion.html';
}

/* Le lien « Se déconnecter » du rail latéral efface aussi les données utilisateur */
document.querySelectorAll('.deconnexion').forEach(lien => {
  lien.addEventListener('click', () => {
    sessionStorage.removeItem('lyceeclassic.utilisateur');
  });
});

/* =========================================================
   5. PANNEAU DE NOTIFICATIONS
   Diffusées via php/notifications.php : une notification créée
   par un compte administrateur/direction est visible par tout
   le personnel (table partagée, pas un stockage par navigateur).
   ========================================================= */
let notifications = [];
const peutDiffuser = ['administrateur', 'direction'].includes(utilisateur.role);

function quandAffiche(dateISO){
  const date = new Date(dateISO.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function chargerNotifications(){
  try {
    const reponse = await fetch('php/notifications.php');
    if (!reponse.ok) throw new Error('Échec du chargement.');
    notifications = await reponse.json();
  } catch (erreur) {
    notifications = [];
  }
  rafraichirNotifications();
  majBadgeCloche();
}

async function marquerLu(id){
  const notif = notifications.find(n => n.id === id);
  if (!notif || notif.lue) return;
  notif.lue = true;
  rafraichirNotifications();
  majBadgeCloche();
  fetch(`php/notifications.php?id=${id}`, { method: 'PUT' }).catch(() => {});
}

async function marquerToutLu(){
  notifications.forEach(n => { n.lue = true; });
  rafraichirNotifications();
  majBadgeCloche();
  fetch('php/notifications.php?tout=1', { method: 'PUT' }).catch(() => {});
}

async function diffuserNotification(titre, message){
  const reponse = await fetch('php/notifications.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titre, message })
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la diffusion.');

  notifications.unshift(donnees);
  rafraichirNotifications();
  majBadgeCloche();
}

function construirePopoverNotifications(){
  const popover = document.createElement('div');
  popover.className = 'popover popover-notifications';
  popover.id = 'popoverNotifications';

  popover.innerHTML = `
    <div class="popover-notif-entete">
      <b>Notifications</b>
      <div class="popover-notif-actions">
        ${peutDiffuser ? '<button type="button" id="boutonNouvelleNotif" title="Diffuser une notification">+ Nouvelle</button>' : ''}
        <button type="button" id="boutonToutLu">Tout marquer comme lu</button>
      </div>
    </div>
    ${peutDiffuser ? `
      <form class="form-diffusion" id="formDiffusion" hidden>
        <input type="text" id="diffusionTitre" placeholder="Titre de la notification" maxlength="120" required>
        <textarea id="diffusionMessage" placeholder="Message à diffuser à tout le personnel…" maxlength="500" required></textarea>
        <div class="form-diffusion-actions">
          <button type="button" id="boutonAnnulerDiffusion">Annuler</button>
          <button type="submit" class="btn plein">Diffuser</button>
        </div>
      </form>
    ` : ''}
    <ul class="liste-notifications" id="listeNotifications"></ul>
  `;

  popover.querySelector('#boutonToutLu').addEventListener('click', () => {
    marquerToutLu();
  });

  if (peutDiffuser){
    const formulaire   = popover.querySelector('#formDiffusion');
    const boutonNouvel = popover.querySelector('#boutonNouvelleNotif');
    const champTitre   = popover.querySelector('#diffusionTitre');
    const champMessage = popover.querySelector('#diffusionMessage');

    boutonNouvel.addEventListener('click', () => {
      formulaire.hidden = !formulaire.hidden;
      if (!formulaire.hidden) champTitre.focus();
      positionnerPopover(popover, declencheurActifNotifications());
    });

    popover.querySelector('#boutonAnnulerDiffusion').addEventListener('click', () => {
      formulaire.reset();
      formulaire.hidden = true;
      positionnerPopover(popover, declencheurActifNotifications());
    });

    formulaire.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      const titre   = champTitre.value.trim();
      const message = champMessage.value.trim();
      if (!titre || !message) return;

      const bouton = formulaire.querySelector('button[type="submit"]');
      bouton.disabled = true;
      try {
        await diffuserNotification(titre, message);
        formulaire.reset();
        formulaire.hidden = true;
        notifierCompte('Notification diffusée à tout le personnel.');
      } catch (erreur) {
        notifierCompte(erreur.message);
      } finally {
        bouton.disabled = false;
        positionnerPopover(popover, declencheurActifNotifications());
      }
    });
  }

  popover.querySelector('#listeNotifications').addEventListener('click', (evenement) => {
    const item = evenement.target.closest('.notif-item');
    if (!item) return;
    marquerLu(Number(item.dataset.id));
  });

  return popover;
}

function declencheurActifNotifications(){
  return document.getElementById('cloche');
}

/* Les notifications stockent encore un emoji en base (colonne `icone`,
   voir php/notifications.php et _aide.php::verifierEcheancesEnRetard()) —
   on le traduit ici en icône SVG plutôt que de l'afficher tel quel, sans
   avoir à toucher au schéma ni aux données déjà enregistrées. */
const ICONES_NOTIF_PAR_EMOJI = { '⚠️': 'alerte' };
function svgNotification(emoji){
  return svgPopover(ICONES_NOTIF_PAR_EMOJI[emoji] || 'cloche');
}

function rafraichirNotifications(){
  const liste = document.getElementById('listeNotifications');
  if (!liste) return;

  liste.innerHTML = notifications.length ? notifications.map(n => `
    <li>
      <button type="button" class="notif-item ${n.lue ? '' : 'non-lu'}" data-id="${n.id}">
        <span class="notif-icone ${n.icone === '⚠️' ? 'notif-icone-alerte' : ''}">${svgNotification(n.icone)}</span>
        <span>
          <b>${n.titre}</b>
          <p>${n.message}</p>
          <small>${n.auteur ? `${n.auteur} · ` : ''}${quandAffiche(n.cree_le)}</small>
        </span>
      </button>
    </li>
  `).join('') : `<li class="notif-vide">Aucune notification.</li>`;
}

function majBadgeCloche(){
  const badge = document.getElementById('badgeCloche');
  if (!badge) return;
  const nonLues = notifications.filter(n => !n.lue).length;
  badge.textContent = nonLues;
  badge.style.display = nonLues === 0 ? 'none' : '';
}

/* =========================================================
   6. OUVERTURE / FERMETURE DES PANNEAUX (POPOVERS)
   ========================================================= */
const popoverCompte        = construirePopoverCompte(utilisateur);
const popoverNotifications = construirePopoverNotifications();
document.body.append(popoverCompte, popoverNotifications);
chargerNotifications();
chargerAnneeActive();

const tousLesPopovers = [popoverCompte, popoverNotifications];

function positionnerPopover(popover, declencheur){
  const rectangle = declencheur.getBoundingClientRect();
  const marge = 12;

  popover.style.left = '-9999px';
  popover.style.top  = '-9999px';
  const largeur = popover.offsetWidth;
  const hauteur = popover.offsetHeight;

  let gauche = rectangle.right - largeur;
  gauche = Math.max(marge, Math.min(gauche, window.innerWidth - largeur - marge));

  let haut = rectangle.bottom + 8;
  if (haut + hauteur > window.innerHeight - marge){
    haut = rectangle.top - hauteur - 8;
  }
  haut = Math.max(marge, haut);

  popover.style.left = `${gauche}px`;
  popover.style.top  = `${haut}px`;
}

function ouvrirPopover(popover, declencheur){
  tousLesPopovers.filter(p => p !== popover).forEach(fermerPopover);
  popover.style.display = 'flex';
  positionnerPopover(popover, declencheur);
  requestAnimationFrame(() => popover.classList.add('ouvert'));
}

function fermerPopover(popover){
  if (!popover.classList.contains('ouvert')) { popover.style.display = 'none'; return; }
  popover.classList.remove('ouvert');
  setTimeout(() => { popover.style.display = 'none'; }, 160);
}

function basculerPopover(popover, declencheur){
  if (popover.classList.contains('ouvert')) fermerPopover(popover);
  else ouvrirPopover(popover, declencheur);
}

document.addEventListener('click', (evenement) => {
  tousLesPopovers.forEach(popover => {
    if (popover.classList.contains('ouvert')
        && !popover.contains(evenement.target)
        && !evenement.target.closest('.rail-pied .compte, .barre-actions .avatar, #cloche')){
      fermerPopover(popover);
    }
  });
});

document.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Escape') tousLesPopovers.forEach(fermerPopover);
});

/* ---------- Déclencheurs du menu compte ---------- */
document.querySelectorAll('.rail-pied .compte, .barre-actions .avatar').forEach(declencheur => {
  if (declencheur.tagName !== 'BUTTON'){
    declencheur.setAttribute('role', 'button');
    if (!declencheur.hasAttribute('tabindex')) declencheur.setAttribute('tabindex', '0');
    declencheur.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter' || evenement.key === ' '){
        evenement.preventDefault();
        declencheur.click();
      }
    });
  }
  declencheur.addEventListener('click', (evenement) => {
    evenement.stopPropagation();
    basculerPopover(popoverCompte, declencheur);
  });
});

/* ---------- Déclencheur du panneau de notifications ---------- */
const boutonCloche = document.getElementById('cloche');
if (boutonCloche){
  boutonCloche.addEventListener('click', (evenement) => {
    evenement.stopPropagation();
    basculerPopover(popoverNotifications, boutonCloche);
  });
}

});
