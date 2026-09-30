/* =========================================================
   SCOLARIS — Reçu de paiement
   Lecture seule : reconstitue un reçu à partir d'un paiement déjà
   enregistré (php/recus.php), sur le modèle de bulletins.js.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

function dateFr(iso){
  if (!iso) return '—';
  const [a, m, j] = iso.split(/[- ]/);
  return `${j}/${m}/${a}`;
}

function argent(n){
  return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

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

async function chargerRecu(){
  const parametres = new URLSearchParams(location.search);
  const numero = parametres.get('numero');
  const paiementId = parametres.get('paiement_id');

  if (!numero && !paiementId) {
    $('messageVide').textContent = 'Aucun reçu demandé.';
    return;
  }

  const requete = numero ? `numero=${encodeURIComponent(numero)}` : `paiement_id=${paiementId}`;
  const reponse = await fetch(`php/recus.php?${requete}`);
  if (!reponse.ok) {
    const { erreur } = await reponse.json().catch(() => ({}));
    $('messageVide').textContent = erreur || 'Reçu introuvable.';
    return;
  }
  const r = await reponse.json();

  $('recuNumero').textContent  = r.numero;
  $('recuAnnee').textContent   = r.annee_scolaire;
  $('recuEleve').textContent   = `${r.eleve_prenom} ${r.eleve_nom}`;
  $('recuMatricule').textContent = r.matricule;
  $('recuClasse').textContent  = r.classe_nom;
  $('recuFrais').textContent   = r.frais_nom || 'Versement global (réparti automatiquement)';
  $('recuDate').textContent    = dateFr(r.date_paiement);
  $('recuMode').textContent    = r.mode_paiement;
  $('recuReference').textContent = r.reference || '—';
  $('recuObservation').textContent = r.observation || '—';
  $('recuMontant').textContent = argent(r.montant);
  $('recuSolde').textContent   = argent(Math.max(0, r.solde_apres_paiement));
  $('recuSaisiPar').textContent = r.saisi_par || '—';
  $('recuCodeVerification').textContent = r.code_verification || '—';

  if (r.statut === 'annule') {
    notifier('Ce paiement a été annulé — reçu conservé pour la traçabilité.');
  }

  $('messageVide').classList.remove('visible');
  $('zoneRecu').hidden = false;
  document.title = `Reçu ${r.numero} — SCOLARIS`;
}

$('btnImprimer').addEventListener('click', () => {
  if ($('zoneRecu').hidden) { notifier('Aucun reçu à imprimer.'); return; }
  window.print();
});

/* =========================================================
   MENU LATÉRAL (minimal sur cette page dédiée)
   ========================================================= */
const rail = $('rail'), voile = $('voile');
$('burger').addEventListener('click', () => {
  rail.classList.add('ouvert');
  voile.classList.add('visible');
});
voile.addEventListener('click', () => {
  rail.classList.remove('ouvert');
  voile.classList.remove('visible');
});

document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

chargerRecu();

});
