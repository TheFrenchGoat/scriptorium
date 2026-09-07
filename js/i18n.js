// js/i18n.js
// Système d'internationalisation léger, sans dépendance externe.
// - `t(key, vars)` traduit une clé vers la langue courante (repli sur le
//   français puis sur la clé elle-même si rien n'est trouvé).
// - `applyStaticTranslations()` parcourt le DOM et remplace le texte des
//   éléments porteurs de data-i18n / data-i18n-title / data-i18n-placeholder.
// - Le contenu généré dynamiquement (JS) doit appeler `t()` lui-même.

const dict = {
  fr: {
    // Commun
    cancel: 'Annuler', create: 'Créer', rename: 'Renommer', close: 'Fermer', launch: 'Lancer',
    alreadyExists: 'Ce nom existe déjà', nameRequired: 'Le nom est obligatoire',

    // Page Projets (index.html)
    importProject: '📥 Importer', importProjectTitle: 'Importer un fichier .scriptorium',
    newProject: '+ Nouveau Projet',
    noProjects: 'Aucun projet pour le moment. Créez-en un !',
    newProjectModalTitle: 'Nouveau Projet', projectNamePlaceholder: 'Nom du projet',
    renameProjectModalTitle: 'Renommer le projet', newNamePlaceholder: 'Nouveau nom',
    optionRename: '✏️ Renommer', optionExport: '📤 Exporter (.scriptorium)', optionDelete: '🗑 Supprimer le projet',
    projectStats: '{chapters} chapitres • {words} mots',
    confirmDeleteProject: 'Voulez-vous vraiment supprimer définitivement le projet "{name}" ?',
    exportSuccess: 'Projet exporté avec succès !', exportError: "Erreur lors de l'export : ",
    importSuccess: 'Projet "{name}" importé avec succès !',
    importError: "Erreur lors de l'import : ce fichier n'est peut-être pas un export Scriptorium valide.\n\n",

    // En-tête éditeur
    exportMenuBtn: '📤 Exporter ▾', exportTxtItem: '📄 Texte (.txt)', exportMdItem: '📑 Markdown (.md)',
    exportPdfItem: '📕 PDF (.pdf)', exportDocxItem: '📝 Word (.docx)', exportProjectItem: '💾 Projet complet (.scriptorium)',
    backupsBtn: '🕐 Sauvegardes', backupsBtnTitle: 'Voir et restaurer les sauvegardes automatiques',
    displayPrefsBtn: '⚙️ Affichage', displayPrefsBtnTitle: "Personnaliser l'affichage de la page d'écriture",
    timerPauseTitle: 'Mettre en pause', timerStopTitle: 'Arrêter le timer',
    themeToggle: 'Thème ▾', themeDark: '🌙 Sombre', themeLight: '☀️ Clair', themeSepia: '📜 Sépia',
    langToggle: '🌐 Langue ▾', langFr: 'Français', langEn: 'English',
    settingsToggle: '⚙️ Paramètres ▾', themeSubmenuLabel: '🎨 Thème', langSubmenuLabel: '🌐 Langue',

    // Barre d'outils
    undoTitle: 'Annuler (Ctrl+Z)', redoTitle: 'Rétablir (Ctrl+Y)',
    boldTitle: 'Gras', italicTitle: 'Italique', underlineTitle: 'Souligné',
    fontDropdown: 'Police ▾', sizeDropdown: 'Taille ▾',
    sizeXS: 'Très Petit (1)', sizeS: 'Petit (2)', sizeNormal: 'Normal (3)', sizeM: 'Moyen (4)',
    sizeL: 'Grand (5)', sizeXL: 'Très Grand (6)', sizeTitle: 'Titre (7)',
    colorPickerTitle: 'Couleur de texte',
    globalSearchBtn: '🔎 Recherche globale', globalSearchBtnTitle: 'Rechercher dans tout le projet',
    replaceBtn: '🔍 Remplacer', replaceBtnTitle: 'Rechercher / Remplacer dans le chapitre actuel',

    // Sidebar
    chaptersHeader: 'Chapitres', newChapterTitle: 'Nouveau chapitre',
    worldBuildingHeader: 'World Building', addWBTitle: 'Ajouter élément',
    wbLabel_character: 'Personnage', wbLabel_place: 'Lieu', wbLabel_object: 'Objet', wbLabel_other: 'Autre',

    // Champs des fiches World Building
    wbField_firstname: 'Prénom', wbField_lastname: 'Nom', wbField_age: 'Âge', wbField_home: 'Habitation',
    wbField_family: 'Famille', wbField_physical: 'Physique', wbField_moral: 'Moral / Psychologie',
    wbField_background: 'Histoire / Background', wbField_notes: 'Notes libres',
    wbField_type: 'Type', wbField_location: 'Localisation', wbField_description: 'Description',
    wbField_atmosphere: 'Atmosphère / Ambiance', wbField_history: 'Histoire', wbField_inhabitants: 'Habitants / Faune',
    wbField_owner: 'Propriétaire', wbField_power: 'Pouvoir / Utilité',

    // Statut / stats
    loadMusicTitle: 'Charger des musiques', noTrack: 'Aucune musique',
    statsNormal: '{words} mots | {chars} car. | Total: {total} m',
    statsSelected: '{words} mots sél. | {chars} car. sél. | Total: {total} m',
    statsSheetMode: 'Mode Fiche',
    saveStatusPending: '● Modifications non enregistrées',
    saveStatusSavedAt: '✓ Enregistré à {time}',
    saveStatusError: '⚠ Échec de la sauvegarde',

    // Modales
    newChapterModalTitle: 'Nouveau Chapitre', chapterNamePlaceholder: 'Nom du chapitre',
    newWBModalTitle: 'Nouveau {type}', wbNamePlaceholder: "Nom de l'élément",
    renameModalTitle: 'Renommer',
    timerModalTitle: 'Configurer le minuteur',
    timer5: '5 minutes', timer15: '15 minutes', timer25: '25 minutes (Pomodoro)', timer60: '1 heure',
    replaceModalTitle: 'Rechercher / Remplacer', findPlaceholder: 'Rechercher...', replacePlaceholder: 'Remplacer par...',
    replaceScopeAllLabel: 'Remplacer dans tout le projet (tous les chapitres)', replaceAllBtn: 'Tout remplacer',
    globalSearchModalTitle: 'Recherche dans tout le projet',
    globalSearchPlaceholder: 'Rechercher un mot, un nom, une phrase...',
    globalSearchHint: 'Tapez au moins un caractère pour lancer la recherche.',
    globalSearchNoResults: 'Aucun résultat.',
    occurrences: '{count} occurrence(s)',
    displayPrefsTitle: "Affichage de la page d'écriture",
    prefWidthLabel: 'Largeur de page', prefWidthNarrow: 'Étroite (confort de lecture)', prefWidthNormal: 'Normale',
    prefWidthLarge: 'Large', prefWidthXLarge: 'Très large',
    prefFontLabel: 'Police de lecture',
    prefLineHeightLabel: 'Interligne', prefLineCompact: 'Compact (1.4)', prefLineNormal: 'Normal (1.6)',
    prefLineAiry: 'Aéré (1.8)', prefLineVeryAiry: 'Très aéré (2.2)',
    prefUiFontSizeLabel: "Taille du texte de l'interface", prefUiFontLabel: "Police de l'interface",
    prefUiSizeSmall: 'Petite', prefUiSizeNormal: 'Normale', prefUiSizeLarge: 'Grande', prefUiSizeXLarge: 'Très grande',
    infoModalTitle: 'Information',
    defaultChapterName: 'Chapitre',
    statsMenuBtn: '📊 Statistiques',
    statsModalTitle: "Statistiques d'écriture",
    statsPeriodDay: 'Par jour', statsPeriodWeek: 'Par semaine', statsPeriodMonth: 'Par mois', statsPeriodYear: 'Par année',
    statsWeekPrefix: 'Semaine',
    statsWordsUnit: 'mots',
    loadingStats: 'Chargement des statistiques…',
    statsNoData: "Pas encore de données d'écriture.",
    backupsModalTitle: 'Sauvegardes automatiques',
    backupsDescription: "Une sauvegarde horodatée est créée automatiquement pendant que vous travaillez. Restaurer une version antérieure remplace le contenu actuel du projet (une sauvegarde de l'état actuel est créée avant, par sécurité).",
    backupNoneYet: 'Aucune sauvegarde pour le moment. Elles se créent automatiquement pendant que vous écrivez.',
    backupRestoreBtn: 'Restaurer',
    backupConfirmRestore: "Restaurer la sauvegarde du {date} ?\n\nLe contenu actuel du projet sera remplacé (une sauvegarde de l'état actuel sera créée juste avant, par sécurité).",
    backupRestoreSuccess: 'Sauvegarde restaurée avec succès.',
    backupRestoreError: 'Erreur lors de la restauration : ',
    unknownDate: 'Date inconnue',

    // Correcteur de grammaire hors ligne (LanguageTool)
    grammarSubmenuLabel: '✔️ Grammaire',
    nativeSpellcheckLabel: '🔤 Correcteur orthographique natif',
    grammarToggleLabel: 'Correction grammaticale',
    grammarConfigureBtn: 'Configurer…',
    grammarModalTitle: 'Correcteur de grammaire (LanguageTool)',
    grammarModalIntro: "Scriptorium peut utiliser LanguageTool en local, entièrement hors ligne, pour détecter les fautes de grammaire, d'accord et de conjugaison (en plus du correcteur d'orthographe déjà intégré).",
    grammarEnableLabel: 'Activer la correction grammaticale',
    grammarJavaLabel: 'Java :', grammarJavaOk: '✅ détecté', grammarJavaMissing: '❌ introuvable',
    grammarJavaOutdated: '⚠️ version {version} trop ancienne (17+ requis)',
    grammarJavaMissingHint: "LanguageTool nécessite Java 17 ou supérieur. Installez-le depuis java.com, puis relancez la vérification.",
    grammarJavaOutdatedHint: "LanguageTool nécessite Java 17 ou supérieur ; la version installée est trop ancienne et ne peut pas le faire fonctionner. Installez un Java 17+ (par ex. Eclipse Temurin), puis relancez la vérification.",
    grammarFolderLabel: 'Dossier LanguageTool :', grammarFolderNotSet: 'non configuré',
    grammarSelectFolderBtn: '📂 Choisir le dossier LanguageTool…',
    grammarAutoInstallBtn: '📥 Installer LanguageTool automatiquement (~200 Mo)',
    grammarOrManualLabel: 'ou manuellement',
    grammarOpenJavaBtn: '☕ Ouvrir java.com pour installer Java',
    grammarInstallDownloading: 'Téléchargement de LanguageTool… {percent}%',
    grammarInstallExtracting: 'Extraction de l\'archive…',
    grammarInstallDone: '✅ LanguageTool installé avec succès !',
    grammarInstallError: "❌ Échec de l'installation automatique : {error}",
    grammarDownloadHint: "Téléchargez LanguageTool Desktop/Server (languagetool-server.jar) depuis languagetool.org/download, dézippez-le où vous voulez, puis sélectionnez ce dossier ici.",
    grammarInvalidFolder: "Ce dossier ne contient pas de fichier languagetool-server.jar valide.",
    grammarRecheckBtn: '🔄 Revérifier', 
    grammarStatusChecking: 'Vérification en cours…',
    grammarStatusStarting: 'Démarrage du serveur LanguageTool local…',
    grammarStatusReady: '✅ Serveur LanguageTool actif (hors ligne, port {port}).',
    grammarStatusError: "❌ Impossible de démarrer LanguageTool : {error}",
    grammarStatusDisabled: 'Correction grammaticale désactivée.',
    grammarCheckFailedAlert: "La vérification grammaticale a échoué et a été désactivée : {error}\n\nCorrigez le problème puis cliquez sur \"Revérifier\" dans les Paramètres.",
    grammarIgnoreBtn: 'Ignorer', grammarNoSuggestions: 'Aucune suggestion',
    grammarScanningTooltip: 'Vérification grammaticale…',

    // Alertes / confirmations diverses (editor.js)
    nothingToExport: 'Rien à exporter.',
    exportTxtSuccess: 'Export TXT réussi !', exportTxtError: "Erreur lors de l'export TXT : ",
    exportMdSuccess: 'Export Markdown réussi !', exportMdError: "Erreur lors de l'export Markdown : ",
    exportPdfSuccess: 'Export PDF réussi !', exportPdfError: "Erreur lors de l'export PDF : ",
    exportDocxSuccess: 'Export DOCX réussi !', exportDocxError: "Erreur lors de l'export DOCX : ",
    exportProjectError: "Erreur lors de l'export du projet : ",
    confirmDeleteItem: 'Voulez-vous vraiment supprimer "{name}" ?',
    replaceNoChapterOpen: "Ouvrez d'abord un chapitre, ou cochez « tout le projet ».",
    replaceNoneInChapter: 'Aucune occurrence trouvée dans ce chapitre.',
    replaceNoneInProject: 'Aucune occurrence trouvée dans le projet.',
    replaceDoneInChapter: '{count} occurrence(s) remplacée(s).',
    replaceDoneInProject: '{count} occurrence(s) remplacée(s) dans {chapters} chapitre(s).',
    loadingBackups: 'Chargement...',
    itemNotFound: 'Élément introuvable (supprimé ?)',
    initErrorPrefix: "Une erreur est survenue au chargement de l'éditeur :\n\n",
    initErrorSuffix: '\n\nOuvrez la console (Ctrl+Shift+I) pour plus de détails.',
    menuInitErrorPrefix: "Une erreur est survenue au chargement de la liste des projets :\n\n",
  },

  en: {
    cancel: 'Cancel', create: 'Create', rename: 'Rename', close: 'Close', launch: 'Start',
    alreadyExists: 'This name already exists', nameRequired: 'Name is required',

    importProject: '📥 Import', importProjectTitle: 'Import a .scriptorium file',
    newProject: '+ New Project',
    noProjects: 'No projects yet. Create one!',
    newProjectModalTitle: 'New Project', projectNamePlaceholder: 'Project name',
    renameProjectModalTitle: 'Rename project', newNamePlaceholder: 'New name',
    optionRename: '✏️ Rename', optionExport: '📤 Export (.scriptorium)', optionDelete: '🗑 Delete project',
    projectStats: '{chapters} chapters • {words} words',
    confirmDeleteProject: 'Do you really want to permanently delete the project "{name}"?',
    exportSuccess: 'Project exported successfully!', exportError: 'Error during export: ',
    importSuccess: 'Project "{name}" imported successfully!',
    importError: 'Error during import: this file may not be a valid Scriptorium export.\n\n',

    exportMenuBtn: '📤 Export ▾', exportTxtItem: '📄 Text (.txt)', exportMdItem: '📑 Markdown (.md)',
    exportPdfItem: '📕 PDF (.pdf)', exportDocxItem: '📝 Word (.docx)', exportProjectItem: '💾 Full project (.scriptorium)',
    backupsBtn: '🕐 Backups', backupsBtnTitle: 'View and restore automatic backups',
    displayPrefsBtn: '⚙️ Display', displayPrefsBtnTitle: 'Customize the writing page display',
    timerPauseTitle: 'Pause', timerStopTitle: 'Stop timer',
    themeToggle: 'Theme ▾', themeDark: '🌙 Dark', themeLight: '☀️ Light', themeSepia: '📜 Sepia',
    langToggle: '🌐 Language ▾', langFr: 'Français', langEn: 'English',
    settingsToggle: '⚙️ Settings ▾', themeSubmenuLabel: '🎨 Theme', langSubmenuLabel: '🌐 Language',

    undoTitle: 'Undo (Ctrl+Z)', redoTitle: 'Redo (Ctrl+Y)',
    boldTitle: 'Bold', italicTitle: 'Italic', underlineTitle: 'Underline',
    fontDropdown: 'Font ▾', sizeDropdown: 'Size ▾',
    sizeXS: 'Extra Small (1)', sizeS: 'Small (2)', sizeNormal: 'Normal (3)', sizeM: 'Medium (4)',
    sizeL: 'Large (5)', sizeXL: 'Extra Large (6)', sizeTitle: 'Title (7)',
    colorPickerTitle: 'Text color',
    globalSearchBtn: '🔎 Global Search', globalSearchBtnTitle: 'Search across the whole project',
    replaceBtn: '🔍 Replace', replaceBtnTitle: 'Find / Replace in the current chapter',

    chaptersHeader: 'Chapters', newChapterTitle: 'New chapter',
    worldBuildingHeader: 'World Building', addWBTitle: 'Add item',
    wbLabel_character: 'Character', wbLabel_place: 'Place', wbLabel_object: 'Object', wbLabel_other: 'Other',

    wbField_firstname: 'First name', wbField_lastname: 'Last name', wbField_age: 'Age', wbField_home: 'Home',
    wbField_family: 'Family', wbField_physical: 'Physical appearance', wbField_moral: 'Personality / Psychology',
    wbField_background: 'Backstory', wbField_notes: 'Free notes',
    wbField_type: 'Type', wbField_location: 'Location', wbField_description: 'Description',
    wbField_atmosphere: 'Atmosphere / Mood', wbField_history: 'History', wbField_inhabitants: 'Inhabitants / Wildlife',
    wbField_owner: 'Owner', wbField_power: 'Power / Purpose',

    loadMusicTitle: 'Load music', noTrack: 'No track',
    statsNormal: '{words} words | {chars} ch. | Total: {total} w',
    statsSelected: '{words} sel. words | {chars} sel. ch. | Total: {total} w',
    statsSheetMode: 'Sheet mode',
    saveStatusPending: '● Unsaved changes',
    saveStatusSavedAt: '✓ Saved at {time}',
    saveStatusError: '⚠ Save failed',

    newChapterModalTitle: 'New Chapter', chapterNamePlaceholder: 'Chapter name',
    newWBModalTitle: 'New {type}', wbNamePlaceholder: 'Item name',
    renameModalTitle: 'Rename',
    timerModalTitle: 'Set up the timer',
    timer5: '5 minutes', timer15: '15 minutes', timer25: '25 minutes (Pomodoro)', timer60: '1 hour',
    replaceModalTitle: 'Find / Replace', findPlaceholder: 'Search...', replacePlaceholder: 'Replace with...',
    replaceScopeAllLabel: 'Replace across the whole project (all chapters)', replaceAllBtn: 'Replace all',
    globalSearchModalTitle: 'Search across the project',
    globalSearchPlaceholder: 'Search for a word, a name, a phrase...',
    globalSearchHint: 'Type at least one character to start searching.',
    globalSearchNoResults: 'No results.',
    occurrences: '{count} occurrence(s)',
    displayPrefsTitle: 'Writing page display',
    prefWidthLabel: 'Page width', prefWidthNarrow: 'Narrow (reading comfort)', prefWidthNormal: 'Normal',
    prefWidthLarge: 'Large', prefWidthXLarge: 'Extra large',
    prefFontLabel: 'Reading font',
    prefLineHeightLabel: 'Line spacing', prefLineCompact: 'Compact (1.4)', prefLineNormal: 'Normal (1.6)',
    prefLineAiry: 'Airy (1.8)', prefLineVeryAiry: 'Very airy (2.2)',
    prefUiFontSizeLabel: 'Interface text size', prefUiFontLabel: 'Interface font',
    prefUiSizeSmall: 'Small', prefUiSizeNormal: 'Normal', prefUiSizeLarge: 'Large', prefUiSizeXLarge: 'Extra large',
    infoModalTitle: 'Information',
    defaultChapterName: 'Chapter',
    statsMenuBtn: '📊 Statistics',
    statsModalTitle: 'Writing statistics',
    statsPeriodDay: 'By day', statsPeriodWeek: 'By week', statsPeriodMonth: 'By month', statsPeriodYear: 'By year',
    statsWeekPrefix: 'Week',
    statsWordsUnit: 'words',
    loadingStats: 'Loading statistics…',
    statsNoData: 'No writing data yet.',
    backupsModalTitle: 'Automatic backups',
    backupsDescription: 'A timestamped backup is created automatically while you work. Restoring an earlier version replaces the project\'s current content (a backup of the current state is created first, as a safety net).',
    backupNoneYet: 'No backups yet. They are created automatically while you write.',
    backupRestoreBtn: 'Restore',
    backupConfirmRestore: 'Restore the backup from {date}?\n\nThe project\'s current content will be replaced (a backup of the current state will be created first, as a safety net).',
    backupRestoreSuccess: 'Backup restored successfully.',
    backupRestoreError: 'Error while restoring: ',
    unknownDate: 'Unknown date',

    // Offline grammar checker (LanguageTool)
    grammarSubmenuLabel: '✔️ Grammar',
    nativeSpellcheckLabel: '🔤 Native spellchecker',
    grammarToggleLabel: 'Grammar checking',
    grammarConfigureBtn: 'Configure…',
    grammarModalTitle: 'Grammar checker (LanguageTool)',
    grammarModalIntro: 'Scriptorium can use LanguageTool locally, fully offline, to detect grammar, agreement and conjugation mistakes (in addition to the built-in spell checker).',
    grammarEnableLabel: 'Enable grammar checking',
    grammarJavaLabel: 'Java:', grammarJavaOk: '✅ detected', grammarJavaMissing: '❌ not found',
    grammarJavaOutdated: '⚠️ version {version} too old (17+ required)',
    grammarJavaMissingHint: 'LanguageTool requires Java 17 or higher. Install it from java.com, then check again.',
    grammarJavaOutdatedHint: 'LanguageTool requires Java 17 or higher; the installed version is too old to run it. Install Java 17+ (e.g. Eclipse Temurin), then check again.',
    grammarFolderLabel: 'LanguageTool folder:', grammarFolderNotSet: 'not configured',
    grammarSelectFolderBtn: '📂 Choose the LanguageTool folder…',
    grammarAutoInstallBtn: '📥 Install LanguageTool automatically (~200 MB)',
    grammarOrManualLabel: 'or manually',
    grammarOpenJavaBtn: '☕ Open java.com to install Java',
    grammarInstallDownloading: 'Downloading LanguageTool… {percent}%',
    grammarInstallExtracting: 'Extracting the archive…',
    grammarInstallDone: '✅ LanguageTool installed successfully!',
    grammarInstallError: '❌ Automatic install failed: {error}',
    grammarDownloadHint: 'Download LanguageTool Desktop/Server (languagetool-server.jar) from languagetool.org/download, unzip it anywhere, then select that folder here.',
    grammarInvalidFolder: 'This folder does not contain a valid languagetool-server.jar file.',
    grammarRecheckBtn: '🔄 Recheck',
    grammarStatusChecking: 'Checking…',
    grammarStatusStarting: 'Starting the local LanguageTool server…',
    grammarStatusReady: '✅ LanguageTool server running (offline, port {port}).',
    grammarStatusError: '❌ Could not start LanguageTool: {error}',
    grammarStatusDisabled: 'Grammar checking is disabled.',
    grammarCheckFailedAlert: 'Grammar checking failed and was disabled: {error}\n\nFix the issue then click "Recheck" in Settings.',
    grammarIgnoreBtn: 'Ignore', grammarNoSuggestions: 'No suggestions',
    grammarScanningTooltip: 'Checking grammar…',

    nothingToExport: 'Nothing to export.',
    exportTxtSuccess: 'TXT export successful!', exportTxtError: 'Error during TXT export: ',
    exportMdSuccess: 'Markdown export successful!', exportMdError: 'Error during Markdown export: ',
    exportPdfSuccess: 'PDF export successful!', exportPdfError: 'Error during PDF export: ',
    exportDocxSuccess: 'DOCX export successful!', exportDocxError: 'Error during DOCX export: ',
    exportProjectError: 'Error during project export: ',
    confirmDeleteItem: 'Do you really want to delete "{name}"?',
    replaceNoChapterOpen: 'Open a chapter first, or check "whole project".',
    replaceNoneInChapter: 'No occurrence found in this chapter.',
    replaceNoneInProject: 'No occurrence found in the project.',
    replaceDoneInChapter: '{count} occurrence(s) replaced.',
    replaceDoneInProject: '{count} occurrence(s) replaced across {chapters} chapter(s).',
    loadingBackups: 'Loading...',
    itemNotFound: 'Item not found (deleted?)',
    initErrorPrefix: 'An error occurred while loading the editor:\n\n',
    initErrorSuffix: '\n\nOpen the console (Ctrl+Shift+I) for more details.',
    menuInitErrorPrefix: 'An error occurred while loading the project list:\n\n',
  }
};

let currentLang = 'fr';

export function setLanguage(lang) {
  currentLang = dict[lang] ? lang : 'fr';
}

export function getLanguage() {
  return currentLang;
}

export function t(key, vars) {
  let str = (dict[currentLang] && dict[currentLang][key]) ?? dict.fr[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach(k => { str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]); });
  }
  return str;
}

// Applique les traductions aux éléments statiques du DOM porteurs de
// data-i18n (texte), data-i18n-title (attribut title) ou
// data-i18n-placeholder (attribut placeholder).
export function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
