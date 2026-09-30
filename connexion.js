/* =========================================================
   SCOLARIS — Page de connexion
   Comportements : affichage du mot de passe, validation,
   mémorisation de l'identifiant, envoi du formulaire.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Références ---------- */
  const formulaire   = document.getElementById('formConnexion');
  const email        = document.getElementById('email');
  const motdepasse   = document.getElementById('motdepasse');
  const boiteEmail   = document.getElementById('boiteEmail');
  const boiteMdp     = document.getElementById('boiteMdp');
  const erreurEmail  = document.getElementById('erreurEmail');
  const erreurMdp    = document.getElementById('erreurMdp');
  const basculeMdp   = document.getElementById('basculeMdp');
  const souvenir     = document.getElementById('souvenir');
  const bouton       = document.getElementById('boutonConnexion');
  const texteBouton  = document.getElementById('texteBouton');
  const message      = document.getElementById('message');
  const lienOubli    = document.getElementById('lienOubli');

  const CLE_STOCKAGE = 'lyceeclassic.identifiant';

  /* ---------- 1. Restaurer l'identifiant mémorisé ---------- */
  const memorise = localStorage.getItem(CLE_STOCKAGE);
  if (memorise) {
    email.value = memorise;
    souvenir.checked = true;
    motdepasse.focus();
  } else {
    email.focus();
  }

  /* ---------- 2. Afficher / masquer le mot de passe ---------- */
  basculeMdp.addEventListener('click', () => {
    const cache = motdepasse.type === 'password';
    motdepasse.type = cache ? 'text' : 'password';
    basculeMdp.setAttribute(
      'aria-label',
      cache ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
    );
    motdepasse.focus();
  });

  /* ---------- 3. Gestion des erreurs ---------- */
  function signaler(boite, bloc, texte) {
    boite.classList.add('invalide');
    bloc.textContent = texte;
    bloc.classList.add('visible');
  }

  function reinitialiser() {
    [boiteEmail, boiteMdp].forEach(b => b.classList.remove('invalide'));
    [erreurEmail, erreurMdp].forEach(b => b.classList.remove('visible'));
    message.className = 'message';
    message.textContent = '';
  }

  email.addEventListener('input', reinitialiser);
  motdepasse.addEventListener('input', reinitialiser);

  /* ---------- 4. Validation ---------- */
  const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function valider() {
    let valide = true;

    const valeurEmail = email.value.trim();
    if (!valeurEmail) {
      signaler(boiteEmail, erreurEmail, 'Renseignez votre adresse e-mail.');
      valide = false;
    } else if (!FORMAT_EMAIL.test(valeurEmail)) {
      signaler(boiteEmail, erreurEmail, "Cette adresse n'est pas au bon format.");
      valide = false;
    }

    if (!motdepasse.value) {
      signaler(boiteMdp, erreurMdp, 'Saisissez votre mot de passe.');
      valide = false;
    } else if (motdepasse.value.length < 6) {
      signaler(boiteMdp, erreurMdp, 'Le mot de passe compte au moins 6 caractères.');
      valide = false;
    }

    return valide;
  }

  /* ---------- 5. Envoi du formulaire ---------- */
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    reinitialiser();

    if (!valider()) {
      // Placer le curseur sur le premier champ en erreur
      const premier = document.querySelector('.boite.invalide input');
      if (premier) premier.focus();
      return;
    }

    // Mémorisation de l'identifiant
    if (souvenir.checked) {
      localStorage.setItem(CLE_STOCKAGE, email.value.trim());
    } else {
      localStorage.removeItem(CLE_STOCKAGE);
    }

    // État de chargement
    bouton.disabled = true;
    texteBouton.textContent = 'Vérification…';

    /* ------------------------------------------------------
       Vérification auprès de la base de données (php/connexion.php).
       ------------------------------------------------------ */
    fetch('php/connexion.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim(),
        mot_de_passe: motdepasse.value
      })
    })
      .then(async (reponse) => {
        const donnees = await reponse.json();
        if (!reponse.ok) throw new Error(donnees.erreur || 'Identifiants incorrects.');
        return donnees;
      })
      .then((utilisateur) => {
        // Le back-end tient désormais la vraie session ; on garde ce repère
        // pour les pages qui n'ont pas encore été rebranchées sur l'API.
        sessionStorage.setItem('lyceeclassic.session', utilisateur.email);
        sessionStorage.setItem('lyceeclassic.utilisateur', JSON.stringify(utilisateur));
        afficherMessage('Identité vérifiée, ouverture de votre espace…', true);

        setTimeout(() => {
          window.location.href = 'tableau-de-bord.html';
        }, 600);
      })
      .catch((erreur) => {
        afficherMessage(erreur.message || 'Identifiants incorrects. Réessayez.', false);
        bouton.disabled = false;
        texteBouton.textContent = 'Se connecter';
      });
  });

  function afficherMessage(texte, reussi) {
    message.textContent = texte;
    message.className = 'message visible ' + (reussi ? 'succes' : 'echec');
  }

  /* ---------- 6. Mot de passe oublié ---------- */
  lienOubli.addEventListener('click', (evenement) => {
    evenement.preventDefault();
    afficherMessage(
      "Contactez l'administration pour réinitialiser votre mot de passe.",
      true
    );
  });

});