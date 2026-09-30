/* =========================================================
   GARDE D'ACCÈS
   ========================================================= */
if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

/* Le navigateur restaure parfois une ancienne position de défilement pour
   cette page ; on désactive cette restauration automatique pour que seul
   notre calcul (mettreEnAvant, plus bas) décide de la position finale. */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

/* =========================================================
   SCOLARIS — Mon compte
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {

  const libellesRoles = {
    administrateur: 'Administrateur',
    direction:      'Direction',
    secretaire:     'Secrétaire',
    enseignant:     'Enseignant',
    comptable:      'Comptable'
  };
  const ROLES_GESTION = ['administrateur', 'direction'];

  function utilisateurEnregistre(){
    try {
      const brut = sessionStorage.getItem('lyceeclassic.utilisateur');
      if (brut) return JSON.parse(brut);
    } catch (erreur) { /* stockage corrompu */ }
    return { prenom: 'Josepha', nom: 'Kapche', email: 'admin@lyceeclassic.edu', role: 'administrateur' };
  }

  let utilisateur = utilisateurEnregistre();
  const peutGerer = ROLES_GESTION.includes(utilisateur.role);

  /* =========================================================
     NOTIFICATION FLOTTANTE
     ========================================================= */
  let minuterieToast;
  function notifier(texte){
    let toast = document.getElementById('toastProfil');
    if (!toast){
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.id = 'toastProfil';
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
     IDENTITÉ AFFICHÉE (carte Profil + rail + barre du haut)
     ========================================================= */
  function appliquerIdentite(u){
    const initiale   = `${(u.prenom || '?').charAt(0)}${(u.nom || '').charAt(0)}`.toUpperCase();
    const nomComplet = `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur';
    const role       = libellesRoles[u.role] || u.role || '';

    document.getElementById('avatarGrand').textContent      = initiale;
    document.getElementById('profilNomComplet').textContent = nomComplet;
    document.getElementById('profilRole').textContent       = role;
    document.getElementById('profilPrenom').textContent     = u.prenom || '—';
    document.getElementById('profilNom').textContent        = u.nom || '—';
    document.getElementById('profilEmail').textContent      = u.email || '—';
    document.getElementById('profilRoleChamp').textContent  = role || '—';

    // Même logique que compte.js, pour que le rail et la barre du haut
    // reflètent immédiatement un changement sans recharger la page.
    document.querySelectorAll('.rail-pied .compte').forEach(compte => {
      const avatar = compte.querySelector('.avatar');
      const nomEl  = compte.querySelector('b');
      if (avatar) avatar.textContent = initiale;
      if (nomEl)  nomEl.textContent  = nomComplet;
    });
    document.querySelectorAll('.barre-actions .avatar').forEach(avatar => {
      avatar.textContent = initiale;
    });
  }
  appliquerIdentite(utilisateur);

  /* =========================================================
     NAVIGATION ANCRÉE : mise en avant de la section visée
     ========================================================= */
  function mettreEnAvant(){
    const id = decodeURIComponent(location.hash.replace('#', ''));
    if (!id) return;
    const cible = document.getElementById(id);
    if (!cible) return;

    document.querySelectorAll('.sommaire-profil a').forEach(lien => {
      lien.classList.toggle('actif', lien.getAttribute('href') === `#${id}`);
    });

    cible.classList.add('mis-en-avant');
    // Calcul manuel de la position (plutôt que scrollIntoView) : la colonne de
    // sommaire en position sticky perturbe le calcul automatique du navigateur.
    const decalage = 90;
    const y = cible.getBoundingClientRect().top + window.scrollY - decalage;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    setTimeout(() => cible.classList.remove('mis-en-avant'), 1600);
  }
  // Attendre le chargement complet (feuilles de style incluses) pour que la
  // mise en page soit stable avant de calculer la position de défilement.
  if (document.readyState === 'complete') mettreEnAvant();
  else window.addEventListener('load', mettreEnAvant);
  window.addEventListener('hashchange', mettreEnAvant);

  /* =========================================================
     PROFIL : MODIFIER / ENREGISTRER / ANNULER
     ========================================================= */
  const profilLecture   = document.getElementById('profilLecture');
  const profilEdition   = document.getElementById('profilEdition');
  const btnModifierProfil    = document.getElementById('btnModifierProfil');
  const btnEnregistrerProfil = document.getElementById('btnEnregistrerProfil');
  const btnAnnulerProfil     = document.getElementById('btnAnnulerProfil');
  const editPrenom = document.getElementById('editPrenom');
  const editNom    = document.getElementById('editNom');
  const editEmail  = document.getElementById('editEmail');

  function ouvrirEditionProfil(){
    editPrenom.value = utilisateur.prenom || '';
    editNom.value    = utilisateur.nom || '';
    editEmail.value  = utilisateur.email || '';
    profilLecture.hidden = true;
    profilEdition.hidden = false;
    btnModifierProfil.hidden = true;
    btnEnregistrerProfil.hidden = false;
    btnAnnulerProfil.hidden = false;
    editPrenom.focus();
  }
  function fermerEditionProfil(){
    profilLecture.hidden = false;
    profilEdition.hidden = true;
    btnModifierProfil.hidden = false;
    btnEnregistrerProfil.hidden = true;
    btnAnnulerProfil.hidden = true;
  }

  btnModifierProfil.addEventListener('click', ouvrirEditionProfil);
  btnAnnulerProfil.addEventListener('click', fermerEditionProfil);

  btnEnregistrerProfil.addEventListener('click', async () => {
    const prenom = editPrenom.value.trim();
    const nom    = editNom.value.trim();
    const email  = editEmail.value.trim();
    if (!prenom || !nom || !email){
      notifier('Le prénom, le nom et l\'adresse e-mail sont obligatoires.');
      return;
    }

    btnEnregistrerProfil.disabled = true;
    try {
      const reponse = await fetch('php/profil.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prenom, nom, email })
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la mise à jour.');

      utilisateur = donnees;
      sessionStorage.setItem('lyceeclassic.utilisateur', JSON.stringify(utilisateur));
      appliquerIdentite(utilisateur);
      fermerEditionProfil();
      notifier('Profil mis à jour.');
    } catch (erreur) {
      notifier(erreur.message);
    } finally {
      btnEnregistrerProfil.disabled = false;
    }
  });

  /* =========================================================
     ÉTABLISSEMENT : chargement + MODIFIER / ENREGISTRER / ANNULER
     (réservé à l'administration et à la direction)
     ========================================================= */
  const etabLecture  = document.getElementById('etablissementLecture');
  const etabEdition  = document.getElementById('etablissementEdition');
  const etabActions  = document.getElementById('etablissementActions');
  const btnModifierEtab    = document.getElementById('btnModifierEtab');
  const btnEnregistrerEtab = document.getElementById('btnEnregistrerEtab');
  const btnAnnulerEtab     = document.getElementById('btnAnnulerEtab');
  const editEtabNom       = document.getElementById('editEtabNom');
  const editEtabAdresse   = document.getElementById('editEtabAdresse');
  const editEtabTelephone = document.getElementById('editEtabTelephone');
  const editEtabEmail     = document.getElementById('editEtabEmail');
  const editEtabDelegationRegionale       = document.getElementById('editEtabDelegationRegionale');
  const editEtabDelegationRegionaleEn     = document.getElementById('editEtabDelegationRegionaleEn');
  const editEtabDelegationDepartementale   = document.getElementById('editEtabDelegationDepartementale');
  const editEtabDelegationDepartementaleEn = document.getElementById('editEtabDelegationDepartementaleEn');

  let etablissement = null;

  function afficherEtablissement(e){
    document.getElementById('etabNom').textContent       = e.nom || '—';
    document.getElementById('etabAdresse').textContent   = e.adresse || '—';
    document.getElementById('etabTelephone').textContent = e.telephone || '—';
    document.getElementById('etabEmail').textContent     = e.email || '—';
    document.getElementById('etabDelegationRegionale').textContent       = e.delegation_regionale || '—';
    document.getElementById('etabDelegationRegionaleEn').textContent     = e.delegation_regionale_en || '—';
    document.getElementById('etabDelegationDepartementale').textContent   = e.delegation_departementale || '—';
    document.getElementById('etabDelegationDepartementaleEn').textContent = e.delegation_departementale_en || '—';
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

    btnModifierEtab.addEventListener('click', () => {
      editEtabNom.value       = etablissement.nom || '';
      editEtabAdresse.value   = etablissement.adresse || '';
      editEtabTelephone.value = etablissement.telephone || '';
      editEtabEmail.value     = etablissement.email || '';
      editEtabDelegationRegionale.value       = etablissement.delegation_regionale || '';
      editEtabDelegationRegionaleEn.value     = etablissement.delegation_regionale_en || '';
      editEtabDelegationDepartementale.value   = etablissement.delegation_departementale || '';
      editEtabDelegationDepartementaleEn.value = etablissement.delegation_departementale_en || '';
      etabLecture.hidden = true;
      etabEdition.hidden = false;
      btnModifierEtab.hidden = true;
      btnEnregistrerEtab.hidden = false;
      btnAnnulerEtab.hidden = false;
      editEtabNom.focus();
    });

    function fermerEditionEtab(){
      etabLecture.hidden = false;
      etabEdition.hidden = true;
      btnModifierEtab.hidden = false;
      btnEnregistrerEtab.hidden = true;
      btnAnnulerEtab.hidden = true;
    }
    btnAnnulerEtab.addEventListener('click', fermerEditionEtab);

    btnEnregistrerEtab.addEventListener('click', async () => {
      const nom       = editEtabNom.value.trim();
      const adresse   = editEtabAdresse.value.trim();
      const telephone = editEtabTelephone.value.trim();
      const email     = editEtabEmail.value.trim();
      const delegation_regionale         = editEtabDelegationRegionale.value.trim();
      const delegation_regionale_en      = editEtabDelegationRegionaleEn.value.trim();
      const delegation_departementale    = editEtabDelegationDepartementale.value.trim();
      const delegation_departementale_en = editEtabDelegationDepartementaleEn.value.trim();
      if (!nom || !adresse || !telephone || !email){
        notifier('Tous les champs sont obligatoires.');
        return;
      }

      btnEnregistrerEtab.disabled = true;
      try {
        const reponse = await fetch('php/etablissement.php', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nom, adresse, telephone, email,
            delegation_regionale, delegation_regionale_en,
            delegation_departementale, delegation_departementale_en,
          })
        });
        const donnees = await reponse.json();
        if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la mise à jour.');

        etablissement = donnees;
        afficherEtablissement(etablissement);
        fermerEditionEtab();
        notifier('Fiche établissement mise à jour.');
      } catch (erreur) {
        notifier(erreur.message);
      } finally {
        btnEnregistrerEtab.disabled = false;
      }
    });
  }

  chargerEtablissement();

  /* =========================================================
     ANNÉE SCOLAIRE : sélection + activation
     (réservé à l'administration et à la direction)
     ========================================================= */
  const selectAnnee   = document.getElementById('selectAnnee');
  const anneeAstuce   = document.getElementById('anneeAstuce');
  const anneeActions  = document.getElementById('anneeActions');
  const btnEnregistrerAnnee = document.getElementById('btnEnregistrerAnnee');
  let anneeActiveId = null;

  async function chargerAnnees(){
    try {
      const reponse = await fetch('php/annees_scolaires.php');
      if (!reponse.ok) throw new Error();
      const annees = await reponse.json();

      selectAnnee.innerHTML = annees.map(a => {
        const libelle = a.libelle.replace('-', ' – ');
        if (a.statut === 'active') anneeActiveId = a.id;
        return `<option value="${a.id}" ${a.statut === 'active' ? 'selected' : ''}>${libelle}${a.statut === 'active' ? ' (active)' : ''}</option>`;
      }).join('');
    } catch (erreur) {
      selectAnnee.innerHTML = '<option>2026 – 2027</option>';
    }
  }

  if (peutGerer){
    anneeActions.hidden = false;
    anneeAstuce.textContent = "Le changement prend effet immédiatement pour toute l'application.";
    selectAnnee.disabled = false;
  } else {
    selectAnnee.disabled = true;
  }

  btnEnregistrerAnnee.addEventListener('click', async () => {
    const id = Number(selectAnnee.value);
    if (!id || id === anneeActiveId){
      notifier('Cette année scolaire est déjà active.');
      return;
    }

    btnEnregistrerAnnee.disabled = true;
    try {
      const reponse = await fetch(`php/annees_scolaires.php?id=${id}`, { method: 'PUT' });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.erreur || 'Échec du changement.');

      await chargerAnnees();
      notifier('Année scolaire active mise à jour.');
    } catch (erreur) {
      notifier(erreur.message);
    } finally {
      btnEnregistrerAnnee.disabled = false;
    }
  });

  chargerAnnees();

  /* =========================================================
     PARAMÈTRES DU COMPTE (langue, fuseau) — persistés localement
     ========================================================= */
  const CLE_PARAMETRES_COMPTE = 'lyceeclassic.parametresCompte';
  const champLangue = document.getElementById('champLangue');
  const champFuseau = document.getElementById('champFuseau');

  try {
    const enregistres = JSON.parse(localStorage.getItem(CLE_PARAMETRES_COMPTE) || '{}');
    if (enregistres.langue) champLangue.value = enregistres.langue;
    if (enregistres.fuseau) champFuseau.value = enregistres.fuseau;
  } catch (erreur) { /* stockage corrompu : on garde les valeurs par défaut */ }

  document.getElementById('btnEnregistrerParametres').addEventListener('click', () => {
    localStorage.setItem(CLE_PARAMETRES_COMPTE, JSON.stringify({
      langue: champLangue.value,
      fuseau: champFuseau.value
    }));
    notifier('Paramètres du compte enregistrés.');
  });

  /* =========================================================
     PRÉFÉRENCES & NOTIFICATIONS : interrupteurs persistants
     ========================================================= */
  const CLE_PREFERENCES = 'lyceeclassic.preferences';

  function preferencesEnregistrees(){
    try { return JSON.parse(localStorage.getItem(CLE_PREFERENCES) || '{}'); }
    catch (erreur) { return {}; }
  }

  const preferences = preferencesEnregistrees();
  document.querySelectorAll('[data-pref]').forEach(interrupteur => {
    const cle = interrupteur.dataset.pref;
    if (Object.prototype.hasOwnProperty.call(preferences, cle)){
      interrupteur.checked = preferences[cle];
    }
    interrupteur.addEventListener('change', () => {
      const actuelles = preferencesEnregistrees();
      actuelles[cle] = interrupteur.checked;
      localStorage.setItem(CLE_PREFERENCES, JSON.stringify(actuelles));
      notifier(interrupteur.checked ? 'Préférence activée.' : 'Préférence désactivée.');
    });
  });

  /* =========================================================
     FORMULAIRE : CHANGER LE MOT DE PASSE
     ========================================================= */
  const formMdp        = document.getElementById('formMotDePasse');
  const champActuel    = document.getElementById('mdpActuel');
  const champNouveau   = document.getElementById('mdpNouveau');
  const champConfirme  = document.getElementById('mdpConfirmation');
  const erreurMdp      = document.getElementById('erreurMdp');

  formMdp.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    erreurMdp.classList.remove('visible');

    if (!champActuel.value){
      erreurMdp.textContent = 'Saisissez votre mot de passe actuel.';
      erreurMdp.classList.add('visible');
      champActuel.focus();
      return;
    }
    if (champNouveau.value.length < 6){
      erreurMdp.textContent = 'Le nouveau mot de passe doit compter au moins 6 caractères.';
      erreurMdp.classList.add('visible');
      champNouveau.focus();
      return;
    }
    if (champNouveau.value !== champConfirme.value){
      erreurMdp.textContent = 'La confirmation ne correspond pas au nouveau mot de passe.';
      erreurMdp.classList.add('visible');
      champConfirme.focus();
      return;
    }

    const bouton = formMdp.querySelector('button[type="submit"]');
    bouton.disabled = true;
    try {
      const reponse = await fetch('php/mot_de_passe.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mot_de_passe_actuel: champActuel.value,
          nouveau_mot_de_passe: champNouveau.value
        })
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.erreur || 'Échec de la mise à jour.');

      formMdp.reset();
      notifier('Mot de passe mis à jour.');
    } catch (erreur) {
      erreurMdp.textContent = erreur.message;
      erreurMdp.classList.add('visible');
    } finally {
      bouton.disabled = false;
    }
  });

  /* =========================================================
     SESSIONS ACTIVES — historique réel des connexions (module
     Paramètres) : voir php/connexions.php, alimenté à chaque connexion/
     déconnexion par php/connexion.php.
     ========================================================= */
  function dateHeureFr(iso){
    if (!iso) return '—';
    const date = new Date(iso.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function echapperHTML(valeur){
    const support = document.createElement('div');
    support.textContent = valeur || '';
    return support.innerHTML;
  }

  async function chargerConnexions(){
    const liste = document.getElementById('listeConnexions');
    try {
      const reponse = await fetch('php/connexions.php');
      const connexions = await reponse.json();
      liste.innerHTML = connexions.length
        ? connexions.map((c, index) => `
            <li>
              <span class="notif-icone">🖥️</span>
              <div>
                <b>${c.navigateur ? echapperHTML(c.navigateur.slice(0, 60)) : 'Navigateur inconnu'} ${index === 0 && !c.deconnecte_le ? '<span class="etiquette-actuelle">Actuelle</span>' : ''}</b>
                <small>${echapperHTML(c.adresse_ip || 'IP inconnue')} · Connecté le ${dateHeureFr(c.connecte_le)}${c.deconnecte_le ? ` · Déconnecté le ${dateHeureFr(c.deconnecte_le)}` : ''}</small>
              </div>
            </li>`).join('')
        : '<li><div><p>Aucune connexion enregistrée.</p></div></li>';
    } catch (erreur) {
      liste.innerHTML = '<li><div><p>Impossible de charger l\'historique des connexions.</p></div></li>';
    }
  }
  chargerConnexions();

});
