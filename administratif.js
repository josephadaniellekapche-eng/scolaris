/* =========================================================
   SCOLARIS — Module Administratif : tableau de bord
   Agrège les données déjà réelles des modules Utilisateurs, Personnel
   administratif, Enseignants et du tableau de bord général — jamais de
   valeur écrite en dur.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const $ = id => document.getElementById(id);

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

async function chargerIndicateurs(){
  const [reponseUtilisateurs, reponsePersonnel, reponseEnseignants, reponseAgregats] = await Promise.all([
    fetch('php/utilisateurs.php').catch(() => null),
    fetch('php/personnel_administratif.php').catch(() => null),
    fetch('php/enseignants.php').catch(() => null),
    fetch('php/tableau_de_bord.php').catch(() => null),
  ]);

  if (reponseUtilisateurs && reponseUtilisateurs.ok) {
    const utilisateurs = await reponseUtilisateurs.json();
    const actifs = utilisateurs.filter(u => u.statut === 'actif').length;
    $('kpiUtilisateurs').textContent = utilisateurs.length;
    $('tendanceUtilisateurs').textContent = `${actifs} actif(s)`;
  } else {
    $('kpiUtilisateurs').textContent = '—';
    $('tendanceUtilisateurs').textContent = 'Réservé à l\'administrateur';
  }

  if (reponsePersonnel && reponsePersonnel.ok) {
    const personnel = await reponsePersonnel.json();
    $('kpiPersonnel').textContent = personnel.filter(p => p.statut === 'Actif').length;
  }

  if (reponseEnseignants && reponseEnseignants.ok) {
    const enseignants = await reponseEnseignants.json();
    $('kpiEnseignants').textContent = enseignants.filter(e => e.statut === 'Actif').length;
  }

  if (reponseAgregats && reponseAgregats.ok) {
    const d = await reponseAgregats.json();
    $('kpiEleves').textContent = d.effectifs ? d.effectifs.total : '—';
    $('tendanceAnnee').textContent = d.annee_active ? `Année ${d.annee_active.libelle.replace('-', ' – ')}` : 'Aucune année active';
  }
}

/* =========================================================
   MENU LATÉRAL
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

document.querySelectorAll('.raccourci.desactive').forEach(carte => {
  carte.addEventListener('click', () => notifier('Ce sous-module arrive dans une prochaine mise à jour.'));
});

chargerIndicateurs();

});
