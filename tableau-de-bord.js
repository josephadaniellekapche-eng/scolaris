/* =========================================================
   GARDE D'ACCÈS
   Sans session ouverte, on renvoie vers la page de connexion.
   (Protection de confort uniquement — la vraie vérification
    se fera côté serveur.)
   ========================================================= */
if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

/* =========================================================
   SCOLARIS — Tableau de bord administrateur
   Toutes les données viennent des mêmes API que les modules
   Inscription/Élèves/Classes/Vie scolaire/Finance/Notes — jamais de
   valeurs écrites en dur : voir php/tableau_de_bord.php (agrégats) et
   php/inscriptions.php (liste des dossiers).
   ========================================================= */

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
function quandFr(iso){
  if (!iso) return '';
  const date = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return iso;
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1)   return "À l'instant";
  if (diffMin < 60)  return `Il y a ${diffMin} min`;
  if (diffMin < 1440) return `Il y a ${Math.round(diffMin / 60)} h`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUT_VISUEL   = { en_attente: 'attente', validee: 'validee', rejetee: 'rejete', annulee: 'incomplet' };
const STATUT_LIBELLE  = { en_attente: 'En attente', validee: 'Validée', rejetee: 'Rejetée', annulee: 'Annulée' };
const PIECES_ATTENDUES = 6; // mêmes 6 pièces que le module Élèves (voir eleves.js)

function scolariteLabel(i){
  const du   = Number(i.montant_du_actuel);
  const paye = Number(i.montant_paye_actuel);
  if (du <= 0) return 'Non ouverte';
  if (paye >= du) return 'Soldée';
  if (paye > 0) return 'Acompte';
  return 'Impayée';
}

/* =========================================================
   1. RÉFÉRENCES
   ========================================================= */
const corps        = $('corpsInscriptions');
const messageVide  = $('messageVide');
const filtreNom    = $('filtreNom');
const filtreEtat   = $('filtreEtat');
const rechercheGlo = $('rechercheGlobale');
const sousTitre    = $('sousTitre');
const toast        = $('toast');
const toastTexte   = $('toastTexte');

let inscriptions = [];

/* =========================================================
   2. TABLEAU DES INSCRIPTIONS (php/inscriptions.php)
   ========================================================= */
function initiales(nom, prenom){
  return `${(prenom || '?')[0] || ''}${(nom || '?')[0] || ''}`.toUpperCase();
}

function afficherTableau(){
  const texte = (filtreNom.value || '').trim().toLowerCase();
  const etat  = filtreEtat.value;

  const visibles = inscriptions.filter(i => {
    const correspondTexte = !texte
      || i.nom.toLowerCase().includes(texte)
      || i.matricule.toLowerCase().includes(texte)
      || i.classe_nom.toLowerCase().includes(texte);
    const correspondEtat = etat === 'tous' || i.statut === etat;
    return correspondTexte && correspondEtat;
  });

  corps.innerHTML = visibles.map(i => {
    const nbPieces = i.pieces_fournies ? i.pieces_fournies.split(',').filter(Boolean).length : 0;
    return `
    <tr data-id="${i.id}">
      <td>
        <div class="identite">
          <span class="avatar">${initiales(i.nom, i.prenom)}</span>
          <div>
            <b>${echapperHTML(i.prenom)} ${echapperHTML(i.nom)}</b>
            <small>${echapperHTML(i.matricule)}</small>
          </div>
        </div>
      </td>
      <td>${echapperHTML(i.classe_nom)}</td>
      <td>${echapperHTML(i.type)}</td>
      <td>${nbPieces}/${PIECES_ATTENDUES} pièces</td>
      <td>${scolariteLabel(i)}</td>
      <td><span class="statut ${STATUT_VISUEL[i.statut] || 'attente'}">${STATUT_LIBELLE[i.statut] || i.statut}</span></td>
      <td class="fin">
        ${ i.statut === 'en_attente'
            ? `<button class="action valider" data-action="valider">Valider</button>`
            : `<button class="action" data-action="ouvrir">Ouvrir</button>` }
      </td>
    </tr>`;
  }).join('');

  messageVide.classList.toggle('visible', visibles.length === 0);
}

corps.addEventListener('click', async (evenement) => {
  const bouton = evenement.target.closest('button[data-action]');
  if (!bouton) return;

  const ligne   = bouton.closest('tr');
  const id      = Number(ligne.dataset.id);
  const dossier = inscriptions.find(i => i.id === id);
  if (!dossier) return;

  if (bouton.dataset.action === 'valider'){
    bouton.disabled = true;
    try {
      const reponse = await fetch(`php/inscriptions.php?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'validee' })
      });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la validation.');

      notifier(`Inscription de ${dossier.prenom} ${dossier.nom} validée.`);
      await Promise.all([chargerInscriptions(), chargerAgregats()]);
    } catch (erreur) {
      notifier(erreur.message);
      bouton.disabled = false;
    }
  } else {
    window.location.href = 'eleves.html';
  }
});

filtreNom.addEventListener('input', afficherTableau);
filtreEtat.addEventListener('change', afficherTableau);
rechercheGlo.addEventListener('input', () => {
  filtreNom.value = rechercheGlo.value;
  afficherTableau();
});

async function chargerInscriptions(){
  const reponse = await fetch('php/inscriptions.php');
  const toutes  = await reponse.json();
  // php/inscriptions.php ne renvoie pas annee_scolaire_id directement : les
  // compteurs (KPI) se fient à l'agrégat serveur, déjà filtré sur l'année
  // active ; cette table affiche les dossiers les plus récents tous statuts
  // confondus, déjà triés par date par l'API.
  inscriptions = toutes.slice(0, 30);
  afficherTableau();
}

/* =========================================================
   3. AGRÉGATS DU TABLEAU DE BORD (php/tableau_de_bord.php)
   ========================================================= */
function definirCompteur(id, valeur, suffixe){
  const element = $(id);
  if (!element) return;
  element.dataset.compteur = valeur;
  if (suffixe !== undefined) element.dataset.suffixe = suffixe;
}
function definirJauge(id, pourcentage){
  const element = $(id);
  if (element) element.style.width = `${Math.max(0, Math.min(100, pourcentage))}%`;
}

async function chargerAgregats(){
  const reponse = await fetch('php/tableau_de_bord.php');
  const d = await reponse.json();

  const libelleAnnee = d.annee_active ? d.annee_active.libelle.replace('-', ' – ') : '—';
  $('rappelAnnee').textContent = `Année ${libelleAnnee}`;

  /* --- Inscriptions --- */
  const { dossiers_recus, validees, en_attente, places_restantes } = d.inscriptions;
  definirCompteur('valRecus', dossiers_recus);
  definirCompteur('valValidees', validees);
  definirCompteur('valAttente', en_attente);
  definirCompteur('valPlaces', places_restantes);
  definirJauge('jaugeRecus', dossiers_recus ? 100 : 0);
  definirJauge('jaugeValidees', dossiers_recus ? (validees / dossiers_recus) * 100 : 0);
  definirJauge('jaugeAttente', dossiers_recus ? (en_attente / dossiers_recus) * 100 : 0);
  definirJauge('jaugePlaces', (places_restantes + validees) > 0 ? (places_restantes / (places_restantes + validees)) * 100 : 0);
  $('tendanceValidees').textContent = dossiers_recus ? `${Math.round(validees / dossiers_recus * 100)} % des dossiers` : '—';

  sousTitre.textContent = en_attente === 0
    ? "Tous les dossiers d'inscription sont traités."
    : `${en_attente} dossier${en_attente > 1 ? 's' : ''} d'inscription attendent votre validation.`;

  /* --- Vue d'ensemble --- */
  definirCompteur('valEffectif', d.effectifs.total);
  definirJauge('jaugeEffectif', places_restantes + validees > 0 ? (validees / (places_restantes + validees)) * 100 : 0);

  if (d.presence_jour.taux === null){
    $('valPresence').textContent = '—';
    $('tendancePresence').textContent = 'Aucun élève inscrit';
  } else {
    definirCompteur('valPresence', d.presence_jour.taux, ' %');
    definirJauge('jaugePresence', d.presence_jour.taux);
    $('tendancePresence').textContent = d.presence_jour.absents
      ? `${d.presence_jour.absents} absent(s) aujourd'hui`
      : "Aucune absence aujourd'hui";
  }

  if (d.finance.taux_recouvrement === null){
    $('valRecouvrement').textContent = '—';
  } else {
    definirCompteur('valRecouvrement', d.finance.taux_recouvrement, ' %');
    definirJauge('jaugeRecouvrement', d.finance.taux_recouvrement);
  }

  if (d.moyenne_generale === null){
    $('valMoyenne').textContent = '—';
  } else {
    definirCompteur('valMoyenne', d.moyenne_generale);
    definirJauge('jaugeMoyenne', d.moyenne_generale / 20 * 100);
  }

  animerValeurs();
  construireGraphe(d.effectifs.par_niveau);
  construireJournal(d.activite_recente);
}

/* Animation des valeurs (déclenchée une fois les vraies données reçues) */
function animerValeurs(){
  document.querySelectorAll('[data-compteur]').forEach(element => {
    const cible     = parseFloat(element.dataset.compteur);
    if (Number.isNaN(cible)) return;
    const decimales = Number(element.dataset.decimales || 0);
    const suffixe   = element.dataset.suffixe || '';
    const duree     = 900;
    const debut     = performance.now();

    function pas(maintenant){
      const avancement = Math.min((maintenant - debut) / duree, 1);
      const adouci     = 1 - Math.pow(1 - avancement, 3);
      const valeur     = cible * adouci;

      element.textContent = valeur
        .toFixed(decimales)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + suffixe;

      if (avancement < 1) requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  });
}

/* =========================================================
   4. GRAPHIQUE DES EFFECTIFS PAR NIVEAU
   ========================================================= */
function construireGraphe(parNiveau){
  const graphe  = $('graphe');
  const maximum = Math.max(1, ...parNiveau.flatMap(e => [e.garcons, e.filles]));

  if (!parNiveau.length){
    graphe.innerHTML = '<p class="vide visible">Aucun élève inscrit pour le moment.</p>';
    return;
  }

  graphe.innerHTML = parNiveau.map(e => `
    <div class="colonne">
      <div class="paire">
        <i data-hauteur="${(e.garcons / maximum) * 100}" title="${e.niveau} — ${e.garcons} garçons"></i>
        <i class="claire" data-hauteur="${(e.filles / maximum) * 100}" title="${e.niveau} — ${e.filles} filles"></i>
      </div>
      <span>${echapperHTML(e.niveau)}</span>
    </div>
  `).join('');

  requestAnimationFrame(() => {
    graphe.querySelectorAll('[data-hauteur]').forEach(barre => {
      barre.style.height = barre.dataset.hauteur + '%';
    });
  });
}

/* =========================================================
   5. JOURNAL D'ACTIVITÉ RÉCENTE
   Icônes SVG (même style que le menu latéral) plutôt que des emojis :
   rendu identique sur toutes les plateformes, pas de dépendance à la
   police système. La couleur porte le sens (vert = paiement, rouge =
   absence, ocre = retard), la forme porte l'entité (argent/élève/
   enseignant) — voir php/tableau_de_bord.php pour la valeur `type`.
   ========================================================= */
const ICONES_JOURNAL = {
  paiement: { couleur: 'verte', svg: '<path d="M20 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3"/><path d="M16 12.5h.01"/><path d="M3 9V6a2 2 0 0 1 2-2h11"/>' },
  absence_eleve: { couleur: 'rouge', svg: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>' },
  retard_eleve: { couleur: 'ocre', svg: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>' },
  absence_enseignant: { couleur: 'rouge', svg: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5C5 16.5 8 15 12 15s7 1.5 7 4.5V21"/>' },
  retard_enseignant: { couleur: 'ocre', svg: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.5C5 16.5 8 15 12 15s7 1.5 7 4.5V21"/>' },
};

function marqueurJournalHTML(type){
  const config = ICONES_JOURNAL[type] || ICONES_JOURNAL.paiement;
  return `<span class="marqueur ${config.couleur}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${config.svg}</svg>
  </span>`;
}

function construireJournal(activites){
  const journal = $('journal');
  journal.innerHTML = activites.length
    ? activites.map(a => `
      <li>
        ${marqueurJournalHTML(a.type)}
        <div>
          <p>${a.texte}</p>
          <small>${quandFr(a.quand)}</small>
        </div>
      </li>`).join('')
    : '<li><div><p>Aucune activité récente.</p></div></li>';
}

/* =========================================================
   6. NOTIFICATION FLOTTANTE
   ========================================================= */
let minuterie;
function notifier(texte){
  toastTexte.textContent = texte;
  toast.classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/* =========================================================
   7. NAVIGATION ET MENU MOBILE
   ========================================================= */
const rail  = $('rail');
const voile = $('voile');

$('burger').addEventListener('click', () => {
  rail.classList.add('ouvert');
  voile.classList.add('visible');
});
voile.addEventListener('click', fermerMenu);

function fermerMenu(){
  rail.classList.remove('ouvert');
  voile.classList.remove('visible');
}

function selectionner(element, nom){
  document.querySelectorAll('.menu-lien, .sous-lien').forEach(l => l.classList.remove('actif'));
  element.classList.add('actif');
  $('filSection').textContent = nom;
}

document.querySelectorAll('.menu-lien:not(.deroulant)').forEach(lien => {
  lien.addEventListener('click', () => {
    if (lien.tagName === 'A') return;
    const nom = lien.querySelector('.texte').textContent.trim();
    selectionner(lien, nom);
    fermerMenu();
    notifier(`Le module « ${nom} » reste à développer.`);
  });
});

document.querySelectorAll('.menu-lien.deroulant').forEach(entete => {
  entete.addEventListener('click', () => {
    const groupe = $(entete.dataset.groupe);
    const etaitOuvert = groupe.classList.contains('ouvert');
    document.querySelectorAll('.groupe').forEach(g => g.classList.remove('ouvert'));
    if (!etaitOuvert) groupe.classList.add('ouvert');
  });
});

document.querySelectorAll('.sous-lien').forEach(lien => {
  lien.addEventListener('click', () => {
    if (lien.tagName === 'A') { fermerMenu(); return; }
    const nom = lien.textContent.trim();
    selectionner(lien, nom);
    fermerMenu();
    notifier(`Le module « ${nom} » reste à développer.`);
  });
});

document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

/* =========================================================
   8. EXPORT CSV (dossiers actuellement affichés)
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

$('btnExport').addEventListener('click', () => {
  const lignes = inscriptions.map(i => [
    i.matricule, `${i.prenom} ${i.nom}`, i.classe_nom, i.type,
    `${i.pieces_fournies ? i.pieces_fournies.split(',').filter(Boolean).length : 0}/${PIECES_ATTENDUES}`,
    scolariteLabel(i), STATUT_LIBELLE[i.statut] || i.statut
  ]);

  exporterCSV(
    `inscriptions-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Matricule', 'Élève', 'Classe', 'Type', 'Pièces', 'Scolarité', 'Statut'],
    lignes
  );

  notifier(`${lignes.length} dossiers exportés.`);
});

/* =========================================================
   9. DÉMARRAGE
   ========================================================= */
$('rappelDate').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

chargerAgregats();
chargerInscriptions();

});
