/* =========================================================
   SCOLARIS — Module Matières
   Catalogue des disciplines. Le rattachement d'une matière à
   une classe (coefficient, volume horaire, enseignant) est une
   affectation — géré depuis l'onglet « Matières » de la fiche
   de chaque classe (module Classes), pas ici.
   ========================================================= */

if (!sessionStorage.getItem('lyceeclassic.session')) {
  window.location.replace('connexion.html');
}

document.addEventListener('DOMContentLoaded', () => {

const nomsNiveaux = {
  '6e':'Sixième', '5e':'Cinquième', '4e':'Quatrième', '3e':'Troisième',
  '2nde':'Seconde', '1ère':'Première', 'Tle':'Terminale'
};
const ordreNiveaux = ['6e','5e','4e','3e','2nde','1ère','Tle'];

/* =========================================================
   1. DONNÉES — chargées depuis la base de données
   ========================================================= */
async function chargerMatieres(){
  const reponse = await fetch('php/matieres.php');
  const donnees = await reponse.json();

  return donnees.map(m => {
    const occurrences = (m.occurrences || []).map(o => ({
      classeId: o.classe_id, classeNom: o.classe_nom, filiere: o.filiere,
      niveau: o.niveau_code, niveauNom: o.niveau_nom,
      coef: Number(o.coefficient), heures: Number(o.volume_horaire),
      enseignantId: o.enseignant_id,
      enseignant: `${o.civilite} ${o.enseignant_nom}`
    }));
    const coefs = occurrences.map(o => o.coef);
    const enseignantsDistincts = [...new Map(
      occurrences.map(o => [o.enseignantId, o.enseignant])
    ).values()];

    return {
      id: m.id, code: m.code, nom: m.nom,
      categorie: m.categorie, description: m.description || '',
      groupe: m.groupe || 'Général', ordreBulletin: Number(m.ordre_bulletin) || 1,
      occurrences, enseignantsDistincts,
      coefMin: coefs.length ? Math.min(...coefs) : null,
      coefMax: coefs.length ? Math.max(...coefs) : null,
      heuresTotal: occurrences.reduce((s, o) => s + o.heures, 0)
    };
  });
}

let matieres = [];

/* =========================================================
   2. OUTILS
   ========================================================= */
const $ = id => document.getElementById(id);

function coefficientAffiche(m){
  if (m.coefMin === null) return '—';
  return m.coefMin === m.coefMax ? String(m.coefMin) : `${m.coefMin}–${m.coefMax}`;
}

let minuterie;
function notifier(texte){
  $('toastTexte').textContent = texte;
  $('toast').classList.add('visible');
  clearTimeout(minuterie);
  minuterie = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

function echapperHTML(valeur){
  const support = document.createElement('div');
  support.textContent = valeur || '';
  return support.innerHTML;
}

const couleurCategorie = {
  'Fondamentale':'bleue', 'Langue vivante':'ambre', 'Complémentaire':'verte'
};

/* =========================================================
   3. LISTE DES MATIÈRES
   ========================================================= */
function afficherListe(){
  const texte     = $('filtreNom').value.trim().toLowerCase();
  const categorie = $('filtreCategorie').value;
  const niveau    = $('filtreNiveau').value;

  const visibles = matieres.filter(m => {
    if (texte && !(`${m.nom} ${m.code} ${m.enseignantsDistincts.join(' ')}`.toLowerCase().includes(texte))) return false;
    if (categorie && m.categorie !== categorie) return false;
    if (niveau && !m.occurrences.some(o => o.niveau === niveau)) return false;
    return true;
  });

  $('corpsMatieres').innerHTML = visibles.map(m => {
    const couleur = couleurCategorie[m.categorie] || 'bleue';
    return `
      <tr class="cliquable" data-code="${m.code}">
        <td><span class="code-matiere">${m.code}</span></td>
        <td>
          <div class="identite">
            <span class="avatar avatar-matiere ${couleur}">${echapperHTML(m.nom[0])}</span>
            <div><b>${echapperHTML(m.nom)}</b></div>
          </div>
        </td>
        <td><span class="puce-categorie ${couleur}">${m.categorie}</span></td>
        <td class="fin-centre">${coefficientAffiche(m)}</td>
        <td>${m.occurrences.length ? `${m.occurrences.length} classe(s)` : 'Non affectée'}</td>
        <td>${echapperHTML(m.enseignantsDistincts.length === 1 ? m.enseignantsDistincts[0] : (m.enseignantsDistincts.length > 1 ? `${m.enseignantsDistincts.length} enseignants` : '')) || '—'}</td>
        <td class="fin"><button class="action" data-ouvrir="${m.code}">Ouvrir</button></td>
      </tr>`;
  }).join('');

  $('messageVide').classList.toggle('visible', visibles.length === 0);
  $('compteResultats').textContent =
    `${visibles.length} matière${visibles.length > 1 ? 's' : ''} affichée${visibles.length > 1 ? 's' : ''} sur ${matieres.length}.`;
}

function majIndicateurs(){
  const fondamentales = matieres.filter(m => m.categorie === 'Fondamentale').length;
  const langues       = matieres.filter(m => m.categorie === 'Langue vivante').length;
  const sansEnseignant = matieres.filter(m => m.enseignantsDistincts.length === 0).length;

  $('kpiTotal').textContent          = matieres.length;
  $('kpiFondamentales').textContent  = fondamentales;
  $('kpiLangues').textContent        = langues;
  $('kpiSansEnseignant').textContent = sansEnseignant;

  $('jaugeFondamentales').style.width = (matieres.length ? Math.round(fondamentales / matieres.length * 100) : 0) + '%';
  $('jaugeLangues').style.width       = (matieres.length ? Math.round(langues / matieres.length * 100) : 0) + '%';
}

['filtreNom', 'filtreCategorie', 'filtreNiveau'].forEach(id => {
  $(id).addEventListener('input', afficherListe);
  $(id).addEventListener('change', afficherListe);
});

$('rechercheGlobale').addEventListener('input', e => {
  $('filtreNom').value = e.target.value;
  afficherListe();
});

$('corpsMatieres').addEventListener('click', e => {
  const ligne = e.target.closest('tr[data-code]');
  if (ligne) ouvrirFiche(ligne.dataset.code);
});

/* =========================================================
   4. FICHE MATIÈRE
   ========================================================= */
let codeAffiche = null;

function ouvrirFiche(code){
  const m = matieres.find(x => x.code === code);
  if (!m) return;
  codeAffiche = code;

  const couleur = couleurCategorie[m.categorie] || 'bleue';

  $('fichePastille').textContent = m.nom[0];
  $('fichePastille').className = `portrait avatar-matiere ${couleur}`;
  $('ficheNom').textContent = m.nom;
  $('ficheResume').textContent =
    `${m.code} · ${m.categorie}${m.occurrences.length ? ` · ${m.occurrences.length} classe(s) concernée(s)` : ' · Non affectée à une classe'}`;

  const etiquettes = [`<span class="ambre">${m.categorie}</span>`];
  etiquettes.push(`<span>${m.occurrences.length ? `Coefficient ${coefficientAffiche(m)}` : 'Pas encore programmée'}</span>`);
  if (m.enseignantsDistincts.length === 1) etiquettes.push(`<span class="vert">${echapperHTML(m.enseignantsDistincts[0])}</span>`);
  else if (m.enseignantsDistincts.length > 1) etiquettes.push(`<span class="vert">${m.enseignantsDistincts.length} enseignants</span>`);
  else etiquettes.push('<span class="rouge">Aucun enseignant affecté</span>');
  $('ficheEtiquettes').innerHTML = etiquettes.join('');

  /* --- Onglet Classes & coefficients --- */
  if (m.occurrences.length){
    const tri = [...m.occurrences].sort((a, b) =>
      ordreNiveaux.indexOf(a.niveau) - ordreNiveaux.indexOf(b.niveau));
    $('corpsEnseignement').innerHTML = tri.map(o => `
      <tr>
        <td>${o.classeNom}</td>
        <td>${o.filiere}</td>
        <td class="fin-centre">${o.coef}</td>
        <td>${o.heures} h / semaine</td>
        <td class="fin">${echapperHTML(o.enseignant)}</td>
      </tr>`).join('');
    $('totalEnseignement').textContent =
      `${m.occurrences.length} classe(s) · ${m.heuresTotal} h cumulées par semaine`;
  } else {
    $('corpsEnseignement').innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--texte-doux);padding:26px">Cette matière n\'est encore rattachée à aucune classe. Ouvrez la fiche d\'une classe, onglet « Matières », pour l\'y affecter.</td></tr>';
    $('totalEnseignement').textContent = '';
  }

  /* --- Onglet Enseignant --- */
  if (m.enseignantsDistincts.length){
    const lignesEnseignants = m.enseignantsDistincts.map(nom => {
      const niveaux = [...new Set(m.occurrences.filter(o => o.enseignant === nom).map(o => o.niveau))]
        .sort((a, b) => ordreNiveaux.indexOf(a) - ordreNiveaux.indexOf(b))
        .map(n => nomsNiveaux[n] || n);
      return `<tr><td>${echapperHTML(nom)}</td><td class="fin">${niveaux.join(', ')}</td></tr>`;
    }).join('');
    $('panEnseignant').innerHTML = `
      <div class="carte">
        <div class="carte-entete">
          <h3>Enseignant${m.enseignantsDistincts.length > 1 ? 's' : ''} responsable${m.enseignantsDistincts.length > 1 ? 's' : ''}</h3>
          <span>${echapperHTML(m.nom)}</span>
        </div>
        <div class="table-defile">
          <table class="tableau">
            <thead><tr><th>Nom</th><th class="fin">Niveaux couverts</th></tr></thead>
            <tbody>${lignesEnseignants}</tbody>
          </table>
        </div>
      </div>`;
  } else {
    $('panEnseignant').innerHTML = `
      <div class="carte">
        <div class="carte-entete"><h3>Enseignant responsable</h3></div>
        <p class="vide visible">Aucun enseignant n'est encore affecté à cette matière.</p>
      </div>`;
  }

  /* --- Onglet Informations --- */
  $('listeInfos').innerHTML = ligne([
    ['Code', m.code],
    ['Catégorie', m.categorie],
    ['Description', m.description || '—'],
    ['Groupe (bulletin)', `${m.groupe} · ordre ${m.ordreBulletin}`],
    ['Coefficient', coefficientAffiche(m)],
    ['Volume horaire cumulé', m.heuresTotal ? `${m.heuresTotal} h / semaine` : '—']
  ]);

  $('vueListe').hidden = true;
  $('vueFiche').hidden = false;
  $('filSection').textContent = `Matières · ${m.nom}`;
  choisirOnglet('enseignement');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ligne(paires){
  return paires.map(([cle, valeur]) =>
    `<div><dt>${cle}</dt><dd>${valeur ? echapperHTML(valeur) : '—'}</dd></div>`).join('');
}

$('btnRetour').addEventListener('click', () => {
  $('vueFiche').hidden = true;
  $('vueListe').hidden = false;
  $('filSection').textContent = 'Matières';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* =========================================================
   5. ONGLETS
   ========================================================= */
const panneaux = { enseignement:'panEnseignement', enseignant:'panEnseignant', infos:'panInfos' };

function choisirOnglet(nom){
  document.querySelectorAll('.onglet').forEach(o =>
    o.classList.toggle('actif', o.dataset.onglet === nom));
  Object.entries(panneaux).forEach(([cle, id]) =>
    $(id).classList.toggle('visible', cle === nom));
}

document.querySelectorAll('.onglet').forEach(o =>
  o.addEventListener('click', () => choisirOnglet(o.dataset.onglet)));

/* =========================================================
   6. CRÉATION, MODIFICATION ET SUPPRESSION D'UNE MATIÈRE
   ========================================================= */
const fenetre = $('fenetreMatiere');
let codeEnEdition = null;

async function rafraichirTout(){
  matieres = await chargerMatieres();
  afficherListe();
  majIndicateurs();
  rafraichirListeGroupes();
}

function rafraichirListeGroupes(){
  const groupes = [...new Set(matieres.map(m => m.groupe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('listeGroupes').innerHTML = groupes.map(g => `<option value="${echapperHTML(g)}"></option>`).join('');
}

$('btnNouvelle').addEventListener('click', () => {
  codeEnEdition = null;
  $('formMatiere').reset();
  document.querySelectorAll('#formMatiere .invalide').forEach(c => c.classList.remove('invalide'));
  $('mCode').disabled = false;
  $('mGroupe').value = 'Général';
  $('mOrdreBulletin').value = '1';
  $('btnValiderMatiere').textContent = 'Ajouter la matière';
  fenetre.querySelector('.fenetre-barre b').textContent = 'Ajouter une matière';
  fenetre.classList.add('visible');
  $('mNom').focus();
});

$('btnModifierMatiere').addEventListener('click', () => {
  const m = matieres.find(x => x.code === codeAffiche);
  if (!m) return;
  codeEnEdition = m.code;

  $('formMatiere').reset();
  document.querySelectorAll('#formMatiere .invalide').forEach(c => c.classList.remove('invalide'));
  $('mNom').value = m.nom;
  $('mCode').value = m.code;
  $('mCode').disabled = true;
  $('mCategorie').value = m.categorie;
  $('mDescription').value = m.description || '';
  $('mGroupe').value = m.groupe || 'Général';
  $('mOrdreBulletin').value = String(m.ordreBulletin || 1);

  $('btnValiderMatiere').textContent = 'Enregistrer les modifications';
  fenetre.querySelector('.fenetre-barre b').textContent = `Modifier ${m.nom}`;
  fenetre.classList.add('visible');
  $('mNom').focus();
});

$('btnSupprimerMatiere').addEventListener('click', async () => {
  const m = matieres.find(x => x.code === codeAffiche);
  if (!m) return;
  if (!confirm(`Supprimer définitivement la matière « ${m.nom} » ?`)) return;

  const reponse = await fetch(`php/matieres.php?id=${m.id}`, { method: 'DELETE' });
  if (!reponse.ok){
    const { erreur } = await reponse.json();
    notifier(erreur || 'Impossible de supprimer cette matière.');
    return;
  }

  await rafraichirTout();
  $('btnRetour').click();
  notifier(`La matière « ${m.nom} » a été supprimée.`);
});

function fermerFenetre(){ fenetre.classList.remove('visible'); }
$('fermerFenetre').addEventListener('click', fermerFenetre);
$('annulerMatiere').addEventListener('click', fermerFenetre);
fenetre.addEventListener('click', e => { if (e.target === fenetre) fermerFenetre(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fenetre.classList.contains('visible')) fermerFenetre();
});

$('formMatiere').addEventListener('submit', async e => {
  e.preventDefault();

  const champs = ['mNom', 'mCode', 'mCategorie'];
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

  const code = $('mCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code){
    $('mCode').classList.add('invalide');
    notifier('Le code ne peut contenir que des lettres et des chiffres.');
    return;
  }

  const valeurs = {
    nom: $('mNom').value.trim(),
    code,
    categorie: $('mCategorie').value,
    description: $('mDescription').value.trim(),
    groupe: $('mGroupe').value.trim() || 'Général',
    ordre_bulletin: parseInt($('mOrdreBulletin').value, 10) || 1
  };

  const url    = codeEnEdition ? `php/matieres.php?id=${matieres.find(m => m.code === codeEnEdition).id}` : 'php/matieres.php';
  const methode = codeEnEdition ? 'PUT' : 'POST';
  const reponse = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valeurs)
  });

  if (!reponse.ok){
    const { erreur } = await reponse.json();
    notifier(erreur || 'Échec de l\'enregistrement.');
    return;
  }

  fermerFenetre();
  await rafraichirTout();
  if (codeEnEdition){
    ouvrirFiche(code);
    notifier(`La matière « ${valeurs.nom} » a été mise à jour.`);
  } else {
    notifier(`La matière « ${valeurs.nom} » a été ajoutée.`);
  }
});

/* Les champs se nettoient dès qu'on les corrige */
['mNom', 'mCode', 'mCategorie'].forEach(id => {
  $(id).addEventListener('input',  () => $(id).classList.remove('invalide'));
  $(id).addEventListener('change', () => $(id).classList.remove('invalide'));
});

/* =========================================================
   7. EXPORT CSV
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

$('btnExporter').addEventListener('click', () => {
  const lignes = matieres.map(m => [
    m.code, m.nom, m.categorie, coefficientAffiche(m),
    m.occurrences.length, m.heuresTotal, m.enseignantsDistincts.join(' / ') || '—'
  ]);
  exporterCSV(
    `matieres-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Code','Matière','Catégorie','Coefficient','Classes concernées','Volume horaire cumulé','Enseignant'],
    lignes
  );
  notifier(`${lignes.length} matières exportées.`);
});

/* =========================================================
   8. MENU LATÉRAL
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
   9. DÉMARRAGE
   ========================================================= */
rafraichirTout();

});
