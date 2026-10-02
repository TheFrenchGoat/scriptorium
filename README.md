# Scriptorium (TypeScript + React)

Portage complet de Scriptorium (Electron + JS vanilla) vers **TypeScript strict
+ React 18**, à fonctionnalités égales. Les deux anciennes pages HTML
(`index.html`/`menu.js` et `editor.html`/`editor.js`) sont désormais deux vues
d'une seule application React.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Lance Vite (serveur de dev du renderer, avec Hot Module Replacement) et
Electron en parallèle (`concurrently`), Electron pointant vers
`http://localhost:5173`.

## Build de production

```bash
npm run build   # compile src/main + src/preload (tsc) et src/renderer (vite)
npm start       # build puis lance electron .
```

## Vérification des types

```bash
npm run typecheck
```

## Empaqueter un installeur (Windows/NSIS)

```bash
npm run dist
```

## Architecture

```
src/
  shared/types.ts        Modèle de données + contrat IPC (ScriptoriumApi),
                          partagé par main, preload et renderer.
  main/                   Processus principal Electron (store, sanitize,
                          docx, IPC, updater, CSP, fenêtre).
  preload/                Pont contextBridge implémentant ScriptoriumApi.
  renderer/
    lib/                  Logique métier indépendante de React (surlignage
                          World Building, historique undo/redo, index des
                          mentions, exports docx/md/pdf, stats, recherche).
    i18n/                 Dictionnaire FR/EN typé (TranslationKey dérivé du
                          français : oublier une traduction casse le build).
    components/
      common/             Modal, Dialogs (remplace alert/confirm), Dropdown,
                          EmojiPicker : briques réutilisées partout.
      menu/                Écran d'accueil (liste des projets).
      editor/              Écran d'édition : Sidebar, TabsBar, Toolbar,
                          StatusBar, ChapterEditor, WbSheet, Timer,
                          MusicPlayer, et toutes les modales.
```

### Choix d'architecture notables

- **`ChapterEditor` reste impératif.** Le contentEditable (splitText,
  TreeWalker, restauration du curseur) ne peut pas être piloté de façon
  déclarative sans casser la position du curseur à chaque frappe. Ce
  composant pose le HTML une seule fois au montage (`key={chapterName}` côté
  parent force un remount complet à chaque changement de chapitre) ; ensuite,
  toutes les mutations passent par `useEditorController`, jamais par un
  re-rendu React.
- **`useEditorController`** est le cœur de l'application : c'est le pendant
  direct de l'ancien `editor.js`. Il garde l'état du projet dans une ref
  mutable (comme l'ancienne closure) et déclenche `bump()` pour signaler à
  React les changements qui doivent se voir. Cela évite toute fermeture
  périmée tout en laissant le contentEditable tranquille.
- **État transient séparé du contexte React** (`editor-status.ts`) : statut de
  sauvegarde, compteur de mots, undo/redo, état de la grammaire changent à
  chaque frappe. Un petit store observable (`useSyncExternalStore`) permet à
  seule la barre d'outils/barre de statut de se re-rendre, sans re-rendre
  toute la sidebar à chaque caractère tapé.
- **Sans `<React.StrictMode>`** : en dev, StrictMode double l'exécution des
  effets, ce qui ferait tourner deux fois la mise en place impérative du
  contentEditable. Documenté dans `main.tsx`.
- **Préférences d'interface globalisées.** Dans l'original, la taille/police
  de l'interface (menus, sidebar, modales) n'étaient appliquées que sur la
  page éditeur. Ici, `App.tsx` les applique globalement (y compris sur
  l'écran d'accueil), pour une cohérence visuelle across les deux vues. Léger
  écart volontaire par rapport à l'original.
- **i18n typé** : `TranslationKey = keyof typeof fr`, et le dictionnaire
  anglais est typé `Record<TranslationKey, string>` — toute clé manquante ou
  mal orthographiée casse la compilation au lieu de retomber silencieusement
  sur la clé brute à l'exécution.

### Polices

L'original chargeait Roboto localement (`fonts/roboto/roboto.css`, non fourni
dans les fichiers source). Ce portage charge Roboto (et les polices de lecture
additionnelles : Merriweather, Lora, Open Sans, Montserrat) depuis Google
Fonts, comme le faisait déjà `editor.html`. Pour un fonctionnement
entièrement hors ligne, placez les fichiers de police dans
`src/renderer/public/fonts/` et remplacez les balises `<link>` dans
`src/renderer/index.html`.

### Fonctionnalités portées à l'identique

Projets (création/renommage/suppression/import/export `.scriptorium`),
chapitres et fiches World Building (types intégrés + types personnalisés avec
champs sur mesure), surlignage automatique des mentions dans le texte,
undo/redo maison par chapitre, recherche/remplacement (chapitre ou projet
entier), recherche globale avec extraits, statistiques d'écriture (objectif
quotidien, historique par jour/semaine/mois/année), sauvegardes automatiques
horodatées avec restauration, correcteur de grammaire hors ligne
(LanguageTool : détection Java, installation automatique, démarrage du
serveur local), correcteur orthographique natif, exports TXT/Markdown/PDF/DOCX/
projet complet, thèmes (sombre/clair/sépia), FR/EN, minuteur Pomodoro, lecteur
de musique d'ambiance, raccourcis clavier, glisser-déposer (onglets, sidebar),
redimensionnement des panneaux, zoom de la page, mise à jour automatique
(electron-updater).

## Corrections et nouveautés (2e itération)

### Corrections
- **Page d'accueil / mise en page cassée** : `index.html` contient un `<div id="root">` qui n'existait pas dans la version d'origine. Comme `.menu-page` centre ses enfants au lieu de les étirer, `#root` ne prenait jamais toute la largeur/hauteur disponible, ce qui rendait le conteneur minuscule ET empêchait `.editor-scroll-container` de calculer une hauteur bornée (donc **aucune barre de défilement** dans la page d'écriture). Corrigé par `#root { display: contents; }` dans `style.css`.
- **Zoom Ctrl+molette qui zoomait toute l'interface** au lieu de la seule feuille : React attache ses gestionnaires `onWheel` en mode passif, ce qui rend `preventDefault()` inopérant et laisse Chromium appliquer son propre zoom de page. Remplacé par un vrai listener DOM natif (`{ passive: false }}`) dans `EditorPage.tsx`, plus désactivation du pinch-to-zoom natif d'Electron dans `main.ts`.
- **Erreurs réseau LanguageTool illisibles** (`getaddrinfo ENOTFOUND ...`) : messages désormais explicites (DNS, timeout, connexion refusée...) et le boilerplate `Error invoking remote method '...'` d'Electron est nettoyé avant affichage (`lib/errors.ts`).
- **Recherche globale peu lisible** : en-tête tronqué proprement (au lieu de se scinder sur plusieurs lignes), extraits présentés comme des « cartouches » avec surlignage plus visible.

### Nouveautés
- **Mises à jour repensées** : plus aucune boîte de dialogue système — tout passe par des modales internes (`UpdateNotifier.tsx`). Le téléchargement ne démarre plus automatiquement : une mise à jour trouvée (au démarrage ou manuellement) est **proposée** à l'utilisateur ; une vérification manuelle sans mise à jour l'indique clairement ; une vérification automatique silencieuse ne dit rien si tout est à jour.
- **Lecteur de musique** : « Précédent » remet d'abord la piste en cours à zéro ; un second appui rapproché passe réellement à la piste antérieure (comme Spotify). « Suivant » inchangé.
- **Renommer un projet depuis l'éditeur** (icône ✏️ à côté du titre), en plus du renommage depuis la page d'accueil.
- **Caractères spéciaux** : menu dédié dans la barre d'outils (Ω) pour insérer majuscules accentuées (À, É, Ç...) et signes typographiques (« », —, …).
- **Minuteur** : son de fin (bip généré, sans fichier audio) + animation de clignotement, réglables (activer/désactiver, volume, bouton de test) dans Paramètres.
- **4 nouveaux thèmes** : Nuit bleutée, Forêt, Contraste élevé (accessibilité), Rosé — en plus de Sombre/Clair/Sépia.
- **Règle graduée** (façon LibreOffice/Word) au-dessus de la feuille : marges gauche/droite et retrait de première ligne réglables par glisser-déposer, avec graduations en centimètres.
