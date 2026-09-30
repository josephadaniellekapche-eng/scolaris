/* =========================================================
   SCOLARIS — Module Emploi du temps
   Planning hebdomadaire par classe (lundi-vendredi), gabarit unique
   valable toute l'année scolaire — pas de dates. Chaque séance est
   rattachée à une affectation déjà existante (classe + matière +
   enseignant) : impossible de programmer un cours en dehors des
   affectations du module Enseignants (voir php/seances.php, php/_aide.php).
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
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

/* =========================================================
   0. CONSTANTES DE LA GRILLE
   Les bornes de journée et les pauses doivent rester identiques à
   HEURE_DEBUT_JOURNEE/HEURE_FIN_JOURNEE/PAUSES_EMPLOI_DU_TEMPS
   (php/_aide.php) — ce sont les mêmes, côté affichage seulement.
   ========================================================= */
const DEBUT_JOURNEE = 7 * 60 + 30;   // 07:30
const FIN_JOURNEE    = 15 * 60 + 30;  // 15:30
const PX_PAR_MINUTE  = 1.4;
const PAUSES = [[9 * 60 + 45, 10 * 60 + 15], [12 * 60, 12 * 60 + 30]];
const JOURS  = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const PALETTE = ['et-c0', 'et-c1', 'et-c2', 'et-c3', 'et-c4', 'et-c5'];

function versMinutes(hhmm){
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function versHHMM(minutes){
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

let classes = [];
let affectationsClasse = [];
let seances = [];
let classeSelectionneeId = '';
let seanceEnEdition = null;

/* =========================================================
   1. CHARGEMENT INITIAL
   ========================================================= */
async function chargerClasses(){
  const reponse = await fetch('php/classes.php');
  classes = (await reponse.json()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('filtreClasse').innerHTML = '<option value="">Choisir une classe…</option>' +
    classes.map(c => `<option value="${c.id}">${echapperHTML(c.nom)}</option>`).join('');
}

/* =========================================================
   2. SÉLECTION D'UNE CLASSE
   ========================================================= */
async function chargerAffectationsClasse(classeId){
  const reponse = await fetch(`php/affectations.php?classe_id=${classeId}`);
  affectationsClasse = await reponse.json();
  $('sAffectation').innerHTML = affectationsClasse.length
    ? affectationsClasse.map(a => `<option value="${a.id}">${echapperHTML(a.matiere_nom)} — ${echapperHTML(a.civilite)} ${echapperHTML(a.enseignant_nom)} ${echapperHTML(a.enseignant_prenom)}</option>`).join('')
    : '<option value="">Aucune affectation pour cette classe</option>';
}

async function chargerSeances(classeId){
  const reponse = await fetch(`php/seances.php?classe_id=${classeId}`);
  seances = await reponse.json();
}

$('filtreClasse').addEventListener('change', async () => {
  classeSelectionneeId = $('filtreClasse').value;
  $('carteSeance').hidden = true;

  if (!classeSelectionneeId){
    $('videClasse').hidden = false;
    $('etGrille').hidden = true;
    return;
  }

  const classe = classes.find(c => String(c.id) === classeSelectionneeId);
  $('sSalle').placeholder = classe && classe.salle ? `${classe.salle} (par défaut)` : 'Salle de la classe par défaut';

  await Promise.all([chargerAffectationsClasse(classeSelectionneeId), chargerSeances(classeSelectionneeId)]);
  $('videClasse').hidden = true;
  $('etGrille').hidden = false;
  afficherGrille();
});

/* =========================================================
   3. FORMULAIRE : AJOUTER / MODIFIER UNE SÉANCE
   ========================================================= */
function ouvrirFormulaire(seance){
  seanceEnEdition = seance ? seance.id : null;
  $('btnSupprimerSeance').hidden = !seance;

  $('sAffectation').value = seance ? seance.affectation_id : '';
  $('sJour').value        = seance ? seance.jour : 'lundi';
  $('sHeureDebut').value  = seance ? seance.heure_debut.slice(0, 5) : '';
  $('sHeureFin').value    = seance ? seance.heure_fin.slice(0, 5) : '';
  $('sSalle').value       = seance && seance.salle ? seance.salle : '';

  $('carteSeance').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('btnNouvelleSeance').addEventListener('click', () => {
  if (!classeSelectionneeId){ notifier('Choisissez d\'abord une classe.'); return; }
  ouvrirFormulaire(null);
});
$('btnAnnulerSeance').addEventListener('click', () => { $('carteSeance').hidden = true; });

$('btnEnregistrerSeance').addEventListener('click', async () => {
  const affectationId = $('sAffectation').value;
  const heureDebut = $('sHeureDebut').value;
  const heureFin   = $('sHeureFin').value;
  if (!affectationId){ notifier('Choisissez une matière / un enseignant.'); return; }
  if (!heureDebut || !heureFin){ notifier('Renseignez l\'heure de début et de fin.'); return; }

  const corps = {
    affectation_id: affectationId,
    jour: $('sJour').value,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    salle: $('sSalle').value.trim()
  };

  try {
    const reponse = await fetch(seanceEnEdition ? `php/seances.php?id=${seanceEnEdition}` : 'php/seances.php', {
      method: seanceEnEdition ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

    notifier(seanceEnEdition ? 'Cours modifié.' : 'Cours ajouté.');
    $('carteSeance').hidden = true;
    await chargerSeances(classeSelectionneeId);
    afficherGrille();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

$('btnSupprimerSeance').addEventListener('click', async () => {
  if (!seanceEnEdition) return;
  if (!confirm('Supprimer ce cours de l\'emploi du temps ?')) return;
  try {
    const reponse = await fetch(`php/seances.php?id=${seanceEnEdition}`, { method: 'DELETE' });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la suppression.');
    notifier('Cours supprimé.');
    $('carteSeance').hidden = true;
    await chargerSeances(classeSelectionneeId);
    afficherGrille();
  } catch (erreur) {
    notifier(erreur.message);
  }
});

/* =========================================================
   4. AFFICHAGE DE LA GRILLE
   ========================================================= */
function afficherGrille(){
  const hauteurTotale = (FIN_JOURNEE - DEBUT_JOURNEE) * PX_PAR_MINUTE;
  $('etCorps').style.height = `${hauteurTotale}px`;

  /* ---- Axe des heures ---- */
  let axeHTML = '';
  for (let minute = DEBUT_JOURNEE; minute <= FIN_JOURNEE; minute += 60){
    const top = (minute - DEBUT_JOURNEE) * PX_PAR_MINUTE;
    axeHTML += `<span class="et-heure" style="top:${top}px">${versHHMM(minute)}</span>`;
  }
  PAUSES.forEach(([debut]) => {
    const top = (debut - DEBUT_JOURNEE) * PX_PAR_MINUTE;
    axeHTML += `<span class="et-pause-label" style="top:${top}px">pause</span>`;
  });
  $('etAxe').innerHTML = axeHTML;

  /* ---- Colonnes des jours ---- */
  JOURS.forEach(jour => {
    const colonne = document.querySelector(`.et-colonne[data-jour="${jour}"]`);
    let html = '';

    PAUSES.forEach(([debut, fin]) => {
      const top    = (debut - DEBUT_JOURNEE) * PX_PAR_MINUTE;
      const hauteur = (fin - debut) * PX_PAR_MINUTE;
      html += `<div class="et-pause" style="top:${top}px;height:${hauteur}px"></div>`;
    });

    seances.filter(s => s.jour === jour).forEach(s => {
      const debutMin = versMinutes(s.heure_debut.slice(0, 5));
      const finMin   = versMinutes(s.heure_fin.slice(0, 5));
      const top      = (debutMin - DEBUT_JOURNEE) * PX_PAR_MINUTE;
      const hauteur  = Math.max(24, (finMin - debutMin) * PX_PAR_MINUTE);
      const couleur  = PALETTE[s.matiere_id % PALETTE.length];
      const salle    = s.salle || s.classe_salle || '—';

      html += `
        <div class="et-seance ${couleur}" style="top:${top}px;height:${hauteur}px" data-id="${s.id}">
          <b>${echapperHTML(s.matiere_nom)}</b>
          <small>${echapperHTML(s.enseignant_nom)} ${echapperHTML(s.enseignant_prenom)}</small>
          <small>${salle ? echapperHTML(salle) + ' · ' : ''}${s.heure_debut.slice(0, 5)} – ${s.heure_fin.slice(0, 5)}</small>
        </div>`;
    });

    colonne.innerHTML = html;
  });
}

document.querySelectorAll('.et-colonne').forEach(colonne => {
  colonne.addEventListener('click', (evenement) => {
    const bloc = evenement.target.closest('.et-seance');
    if (!bloc) return;
    const seance = seances.find(s => s.id === Number(bloc.dataset.id));
    if (seance) ouvrirFormulaire(seance);
  });
});

/* =========================================================
   5. IMPRESSION
   ========================================================= */
$('btnImprimer').addEventListener('click', () => window.print());

/* =========================================================
   6. MENU LATÉRAL
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
   7. DÉMARRAGE
   ========================================================= */
chargerClasses();

});
