/* =========================================================
   SCOLARIS — Module Paramètres
   Établissement, années scolaires, réglages académiques/financiers,
   notifications, sauvegarde des données, sécurité. Réutilise les mêmes
   API que Mon compte (php/etablissement.php, php/annees_scolaires.php,
   php/mot_de_passe.php) : une seule source de vérité en base, jamais
   de doublon entre les deux écrans.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
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
function dateHeureFr(iso){
  if (!iso) return '—';
  const date = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function taille(octets){
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

function utilisateurEnregistre(){
  try {
    const brut = sessionStorage.getItem('lyceeclassic.utilisateur');
    if (brut) return JSON.parse(brut);
  } catch (erreur) { /* stockage corrompu */ }
  return { role: 'administrateur' };
}
const ROLES_GESTION = ['administrateur', 'direction'];
const peutGerer = ROLES_GESTION.includes(utilisateurEnregistre().role);

/* =========================================================
   NAVIGATION ANCRÉE : mise en avant de la section visée
   ========================================================= */
function mettreEnAvant(){
  const id = decodeURIComponent(location.hash.replace('#', ''));
  if (!id) return;
  const cible = $(id);
  if (!cible) return;

  document.querySelectorAll('.sommaire-profil a').forEach(lien => {
    lien.classList.toggle('actif', lien.getAttribute('href') === `#${id}`);
  });

  cible.classList.add('mis-en-avant');
  const decalage = 90;
  const y = cible.getBoundingClientRect().top + window.scrollY - decalage;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  setTimeout(() => cible.classList.remove('mis-en-avant'), 1600);
}
if (document.readyState === 'complete') mettreEnAvant();
else window.addEventListener('load', mettreEnAvant);
window.addEventListener('hashchange', mettreEnAvant);

/* =========================================================
   1. ÉTABLISSEMENT
   ========================================================= */
const etabLecture = $('etablissementLecture');
const etabEdition = $('etablissementEdition');
const etabActions = $('etablissementActions');
let etablissement = null;

function afficherEtablissement(e){
  $('etabNom').textContent       = e.nom || '—';
  $('etabAdresse').textContent   = e.adresse || '—';
  $('etabTelephone').textContent = e.telephone || '—';
  $('etabEmail').textContent     = e.email || '—';
}

async function chargerEtablissement(){
  try {
    const reponse = await fetch('php/etablissement.php');
    if (!reponse.ok) throw new Error();
    etablissement = await reponse.json();
    afficherEtablissement(etablissement);
  } catch (erreur) {
    etablissement = { nom: '—', adresse: '—', telephone: '—', email: '—' };
  }
}

if (peutGerer){
  etabActions.hidden = false;

  $('btnModifierEtab').addEventListener('click', () => {
    $('editEtabNom').value       = etablissement.nom || '';
    $('editEtabAdresse').value   = etablissement.adresse || '';
    $('editEtabTelephone').value = etablissement.telephone || '';
    $('editEtabEmail').value     = etablissement.email || '';
    etabLecture.hidden = true;
    etabEdition.hidden = false;
    $('btnModifierEtab').hidden = true;
    $('btnEnregistrerEtab').hidden = false;
    $('btnAnnulerEtab').hidden = false;
  });

  function fermerEditionEtab(){
    etabLecture.hidden = false;
    etabEdition.hidden = true;
    $('btnModifierEtab').hidden = false;
    $('btnEnregistrerEtab').hidden = true;
    $('btnAnnulerEtab').hidden = true;
  }
  $('btnAnnulerEtab').addEventListener('click', fermerEditionEtab);

  $('btnEnregistrerEtab').addEventListener('click', async () => {
    const nom       = $('editEtabNom').value.trim();
    const adresse   = $('editEtabAdresse').value.trim();
    const telephone = $('editEtabTelephone').value.trim();
    const email     = $('editEtabEmail').value.trim();
    if (!nom || !adresse || !telephone || !email){
      notifier('Tous les champs sont obligatoires.');
      return;
    }
    try {
      const reponse = await fetch('php/etablissement.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, adresse, telephone, email })
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la mise à jour.');
      etablissement = donnees;
      afficherEtablissement(etablissement);
      fermerEditionEtab();
      notifier('Fiche établissement mise à jour.');
    } catch (erreur) {
      notifier(erreur.message);
    }
  });
} else {
  $('etabLectureSeule').hidden = false;
}

chargerEtablissement();

/* =========================================================
   2. ANNÉES SCOLAIRES
   ========================================================= */
function ligneAnneeHTML(a){
  const statutClasse = a.statut === 'active' ? 'validee' : a.statut === 'cloturee' ? 'incomplet' : 'attente';
  const statutLibelle = a.statut === 'active' ? 'Active' : a.statut === 'cloturee' ? 'Clôturée' : 'À venir';
  return `
    <tr data-id="${a.id}">
      <td><b>${echapperHTML(a.libelle)}</b></td>
      <td>${dateFr(a.date_debut)}</td>
      <td>${dateFr(a.date_fin)}</td>
      <td><span class="statut ${statutClasse}">${statutLibelle}</span></td>
      <td class="fin">
        ${peutGerer ? `
          <button type="button" class="action" data-modifier-annee="${a.id}">Modifier</button>
          ${a.statut !== 'active' ? `<button type="button" class="action valider" data-activer-annee="${a.id}">Activer</button>` : ''}
        ` : ''}
      </td>
    </tr>`;
}

async function chargerAnnees(){
  const reponse = await fetch('php/annees_scolaires.php');
  const annees = await reponse.json();
  $('corpsAnnees').innerHTML = annees.length
    ? annees.map(ligneAnneeHTML).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune année scolaire.</td></tr>';
  return annees;
}

if (peutGerer){
  $('btnNouvelleAnnee').addEventListener('click', () => {
    $('naLibelle').value = '';
    $('naDebut').value = '';
    $('naFin').value = '';
    $('carteNouvelleAnnee').hidden = false;
    delete $('carteNouvelleAnnee').dataset.editionId;
    $('btnEnregistrerAnnee').textContent = 'Créer';
  });
  $('btnAnnulerNouvelleAnnee').addEventListener('click', () => { $('carteNouvelleAnnee').hidden = true; });

  $('btnEnregistrerAnnee').addEventListener('click', async () => {
    const libelle = $('naLibelle').value.trim();
    const debut   = $('naDebut').value;
    const fin     = $('naFin').value;
    if (!libelle || !debut || !fin){ notifier('Le libellé et les deux dates sont obligatoires.'); return; }

    const idEdition = $('carteNouvelleAnnee').dataset.editionId;
    try {
      const reponse = await fetch(
        idEdition ? `php/annees_scolaires.php?id=${idEdition}` : 'php/annees_scolaires.php',
        {
          method: idEdition ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libelle, date_debut: debut, date_fin: fin })
        }
      );
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');

      notifier(idEdition ? 'Année scolaire modifiée.' : 'Année scolaire créée.');
      $('carteNouvelleAnnee').hidden = true;
      await chargerAnnees();
    } catch (erreur) {
      notifier(erreur.message);
    }
  });

  $('corpsAnnees').addEventListener('click', async (evenement) => {
    const boutonModifier = evenement.target.closest('[data-modifier-annee]');
    if (boutonModifier){
      const ligne = boutonModifier.closest('tr');
      $('naLibelle').value = ligne.children[0].textContent.trim();
      $('naDebut').value = dateEnISO(ligne.children[1].textContent.trim());
      $('naFin').value = dateEnISO(ligne.children[2].textContent.trim());
      $('carteNouvelleAnnee').dataset.editionId = boutonModifier.dataset.modifierAnnee;
      $('btnEnregistrerAnnee').textContent = 'Enregistrer';
      $('carteNouvelleAnnee').hidden = false;
      window.scrollTo({ top: $('carteNouvelleAnnee').getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
      return;
    }

    const boutonActiver = evenement.target.closest('[data-activer-annee]');
    if (boutonActiver){
      if (!confirm('Activer cette année scolaire pour toute l\'application ?')) return;
      try {
        const reponse = await fetch(`php/annees_scolaires.php?id=${boutonActiver.dataset.activerAnnee}`, { method: 'PUT' });
        const resultat = await reponse.json();
        if (!reponse.ok) throw new Error(resultat.erreur || 'Échec du changement.');
        notifier('Année scolaire active mise à jour.');
        await chargerAnnees();
      } catch (erreur) {
        notifier(erreur.message);
      }
    }
  });
}

/* jj/mm/aaaa affiché -> aaaa-mm-jj pour préremplir un input date. */
function dateEnISO(jjmmaaaa){
  const [j, m, a] = jjmmaaaa.split('/');
  return `${a}-${m}-${j}`;
}

chargerAnnees();

/* =========================================================
   3. PARAMÈTRES ACADÉMIQUES
   ========================================================= */
async function chargerAcademique(){
  const reponse = await fetch('php/parametres_academiques.php');
  const p = await reponse.json();
  $('acSysteme').value = p.systeme_evaluation || 'Sur 20';
  $('acMoyennePassage').value = p.moyenne_passage ?? 10;
  $('acTrimestres').value = p.nombre_trimestres ?? 3;
  $('acRangs').checked = Boolean(Number(p.afficher_rangs));
  $('acMoyennesPonderees').checked = Boolean(Number(p.afficher_moyennes_ponderees));
  $('acDecimales').checked = Boolean(Number(p.autoriser_decimales));
  $('acArrondir').checked = Boolean(Number(p.arrondir_moyennes));
}

$('btnEnregistrerAcademique').addEventListener('click', async () => {
  try {
    const reponse = await fetch('php/parametres_academiques.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systeme_evaluation: $('acSysteme').value,
        moyenne_passage: $('acMoyennePassage').value,
        nombre_trimestres: $('acTrimestres').value,
        afficher_rangs: $('acRangs').checked,
        afficher_moyennes_ponderees: $('acMoyennesPonderees').checked,
        autoriser_decimales: $('acDecimales').checked,
        arrondir_moyennes: $('acArrondir').checked
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');
    notifier('Paramètres académiques enregistrés.');
  } catch (erreur) {
    notifier(erreur.message);
  }
});

chargerAcademique();

/* =========================================================
   4. PARAMÈTRES FINANCIERS
   ========================================================= */
async function chargerFinancier(){
  const reponse = await fetch('php/parametres_financiers.php');
  const p = await reponse.json();
  $('fiDevise').value = p.devise_defaut || 'FCFA';
  $('fiMode').value = p.mode_paiement_defaut || 'Espèces';
  $('fiPenalitesActif').checked = Boolean(Number(p.penalites_retard_actif));
  $('fiTauxPenalite').value = p.taux_penalite ?? 0;
}

$('btnEnregistrerFinancier').addEventListener('click', async () => {
  try {
    const reponse = await fetch('php/parametres_financiers.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        devise_defaut: $('fiDevise').value.trim(),
        mode_paiement_defaut: $('fiMode').value,
        penalites_retard_actif: $('fiPenalitesActif').checked,
        taux_penalite: $('fiTauxPenalite').value
      })
    });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de l\'enregistrement.');
    notifier('Paramètres financiers enregistrés.');
  } catch (erreur) {
    notifier(erreur.message);
  }
});

chargerFinancier();

/* =========================================================
   5. NOTIFICATIONS — mêmes préférences que Mon compte (localStorage
   partagé, une seule source de vérité entre les deux écrans).
   ========================================================= */
const CLE_PREFERENCES = 'lyceeclassic.preferences';
function preferencesEnregistrees(){
  try { return JSON.parse(localStorage.getItem(CLE_PREFERENCES) || '{}'); }
  catch (erreur) { return {}; }
}
const preferences = preferencesEnregistrees();
document.querySelectorAll('#notifications-parametres [data-pref]').forEach(interrupteur => {
  const cle = interrupteur.dataset.pref;
  if (Object.prototype.hasOwnProperty.call(preferences, cle)) interrupteur.checked = preferences[cle];
  interrupteur.addEventListener('change', () => {
    const actuelles = preferencesEnregistrees();
    actuelles[cle] = interrupteur.checked;
    localStorage.setItem(CLE_PREFERENCES, JSON.stringify(actuelles));
    notifier(interrupteur.checked ? 'Préférence activée.' : 'Préférence désactivée.');
  });
});

/* =========================================================
   6. SAUVEGARDE DES DONNÉES
   ========================================================= */
async function chargerSauvegardes(){
  const reponse = await fetch('php/sauvegardes.php');
  if (!reponse.ok){ $('corpsSauvegardes').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--texte-doux);padding:26px">Réservé à l\'administration et à la direction.</td></tr>'; return; }
  const sauvegardes = await reponse.json();
  $('corpsSauvegardes').innerHTML = sauvegardes.length
    ? sauvegardes.map(s => `
        <tr>
          <td>${echapperHTML(s.nom)}</td>
          <td>${dateHeureFr(s.cree_le)}</td>
          <td>${taille(s.taille)}</td>
          <td class="fin">
            <button type="button" class="action" data-restaurer="${echapperHTML(s.nom)}">Restaurer</button>
            <button type="button" class="action" data-supprimer-sauvegarde="${echapperHTML(s.nom)}">Supprimer</button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--texte-doux);padding:26px">Aucune sauvegarde pour le moment.</td></tr>';
}

$('btnSauvegarderMaintenant').addEventListener('click', async () => {
  const bouton = $('btnSauvegarderMaintenant');
  bouton.disabled = true;
  bouton.textContent = 'Sauvegarde en cours…';
  try {
    const reponse = await fetch('php/sauvegardes.php', { method: 'POST' });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la sauvegarde.');
    notifier(`Sauvegarde créée : ${resultat.nom}`);
    await chargerSauvegardes();
  } catch (erreur) {
    notifier(erreur.message);
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Sauvegarder maintenant';
  }
});

$('corpsSauvegardes').addEventListener('click', async (evenement) => {
  const boutonRestaurer = evenement.target.closest('[data-restaurer]');
  if (boutonRestaurer){
    if (!confirm(`Restaurer « ${boutonRestaurer.dataset.restaurer} » ? Toutes les données actuelles seront remplacées.`)) return;
    try {
      const reponse = await fetch('php/sauvegardes.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: boutonRestaurer.dataset.restaurer })
      });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la restauration.');
      notifier('Base restaurée. Rechargement…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (erreur) {
      notifier(erreur.message);
    }
    return;
  }

  const boutonSupprimer = evenement.target.closest('[data-supprimer-sauvegarde]');
  if (boutonSupprimer){
    if (!confirm('Supprimer définitivement ce fichier de sauvegarde ?')) return;
    try {
      const reponse = await fetch(`php/sauvegardes.php?nom=${encodeURIComponent(boutonSupprimer.dataset.supprimerSauvegarde)}`, { method: 'DELETE' });
      const resultat = await reponse.json();
      if (!reponse.ok) throw new Error(resultat.erreur || 'Échec de la suppression.');
      notifier('Sauvegarde supprimée.');
      await chargerSauvegardes();
    } catch (erreur) {
      notifier(erreur.message);
    }
  }
});

chargerSauvegardes();

/* =========================================================
   7. SÉCURITÉ : mot de passe + connexions récentes
   ========================================================= */
$('formMotDePasseParam').addEventListener('submit', async (evenement) => {
  evenement.preventDefault();
  const erreurEl = $('erreurMdpParam');
  erreurEl.classList.remove('visible');

  const actuel     = $('pMdpActuel').value;
  const nouveau    = $('pMdpNouveau').value;
  const confirmation = $('pMdpConfirmation').value;

  if (!actuel){ erreurEl.textContent = 'Saisissez votre mot de passe actuel.'; erreurEl.classList.add('visible'); return; }
  if (nouveau.length < 6){ erreurEl.textContent = 'Le nouveau mot de passe doit compter au moins 6 caractères.'; erreurEl.classList.add('visible'); return; }
  if (nouveau !== confirmation){ erreurEl.textContent = 'La confirmation ne correspond pas au nouveau mot de passe.'; erreurEl.classList.add('visible'); return; }

  try {
    const reponse = await fetch('php/mot_de_passe.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mot_de_passe_actuel: actuel, nouveau_mot_de_passe: nouveau })
    });
    const donnees = await reponse.json();
    if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la mise à jour.');
    $('formMotDePasseParam').reset();
    notifier('Mot de passe mis à jour.');
  } catch (erreur) {
    erreurEl.textContent = erreur.message;
    erreurEl.classList.add('visible');
  }
});

/* =========================================================
   8. MENU LATÉRAL
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
  lien.addEventListener('click', fermerMenu);
});

document.querySelector('.deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem('lyceeclassic.session');
});

});
