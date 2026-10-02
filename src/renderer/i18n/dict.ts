// src/renderer/i18n/dict.ts
// Dictionnaire de traduction. Le français fait autorité : `TranslationKey`
// est dérivé de ses clés. Le dictionnaire anglais doit donc obligatoirement
// contenir exactement les mêmes entrées.

export const fr = {
  // -------------------------------------------------------------------------
  // COMMUN
  // -------------------------------------------------------------------------

  cancel: 'Annuler',
  create: 'Créer',
  rename: 'Renommer',
  close: 'Fermer',
  launch: 'Lancer',
  save: 'Enregistrer',
  delete: 'Supprimer',
  edit: 'Modifier',
  confirmModalOk: 'Confirmer',
  confirmModalTitle: 'Confirmer',
  alreadyExists: 'Ce nom existe déjà',
  nameRequired: 'Le nom est obligatoire',
  renameWbMentionsWarning:
    'Renommer "{oldName}" en "{newName}" remplacera aussi ce nom partout où il apparaît dans le texte de {count} chapitre(s). Continuer ?',

  // -------------------------------------------------------------------------
  // PAGE PROJETS
  // -------------------------------------------------------------------------

  importProject: '📥 Importer',
  importProjectTitle: 'Importer un fichier .scriptorium',
  newProject: '+ Nouveau Projet',
  noProjects: 'Aucun projet pour le moment. Créez-en un !',
  noProjectsHint:
    'Commencez à écrire votre prochaine histoire dès maintenant.',
  projectCountSubtitle: '{count} projet(s)',
  newProjectModalTitle: 'Nouveau Projet',
  projectNamePlaceholder: 'Nom du projet',
  renameProjectModalTitle: 'Renommer le projet',
  newNamePlaceholder: 'Nouveau nom',
  optionRename: '✏️ Renommer',
  optionExport: '📤 Exporter (.scriptorium)',
  optionDelete: '🗑 Supprimer le projet',
  projectOptionsTitle: 'Personnaliser',
  projectStats: '{chapters} chapitres • {words} mots',
  projectGoalSummary: '🎯 {progress}% • {remaining}',
  projectGoalNoDeadline: 'sans échéance',
  projectGoalDueToday: 'échéance aujourd’hui',
  projectGoalDaysRemaining: '{days} j restant(s)',
  projectGoalDaysOverdue: '{days} j de retard',
  confirmDeleteProject:
    'Voulez-vous vraiment supprimer définitivement le projet "{name}" ?',
  exportSuccess: 'Projet exporté avec succès !',
  exportError: "Erreur lors de l'export : ",
  importSuccess: 'Projet "{name}" importé avec succès !',
  importError:
    "Erreur lors de l'import : ce fichier n'est peut-être pas un export Scriptorium valide.\n\n",
  defaultProjectName: 'Projet',

  // -------------------------------------------------------------------------
  // EN-TÊTE ÉDITEUR
  // -------------------------------------------------------------------------

  exportMenuBtn: '📤 Exporter ▾',
  exportTxtItem: '📄 Texte (.txt)',
  exportMdItem: '📑 Markdown (.md)',
  exportPdfItem: '📕 PDF (.pdf)',
  exportDocxItem: '📝 Word (.docx)',
  exportProjectItem: '💾 Projet complet (.scriptorium)',
  backupsBtn: '🕐 Sauvegardes',
  backupsBtnTitle: 'Voir et restaurer les sauvegardes automatiques',
  displayPrefsBtn: '⚙️ Affichage',
  displayPrefsBtnTitle:
    "Personnaliser l'affichage de la page d'écriture",
  rulerMarginLeftTitle: 'Marge gauche (glisser pour ajuster)',
  rulerMarginRightTitle: 'Marge droite (glisser pour ajuster)',
  rulerIndentTitle: 'Retrait de première ligne (glisser pour ajuster)',
  backToProjects: 'Retour aux projets',

  // -------------------------------------------------------------------------
  // MINUTEUR ET SESSIONS
  // -------------------------------------------------------------------------

  timerBtn: '⏱ Timer',
  timerPauseTitle: 'Mettre en pause',
  timerStopTitle: 'Arrêter le timer',
  timerFinished: 'Fini !',
  timerFinishedTitle: '⏱ Minuteur terminé',

  sessionManualStartTitle: 'Démarrer une session sans minuteur',
  sessionResumeTitle: 'Reprendre la session',
  sessionStopTitle: 'Terminer et enregistrer la session',
  sessionFinishedTitle: 'Session terminée',
  sessionSkipFeedback: 'Ignorer le ressenti',
  sessionSaveFeedback: 'Enregistrer la session',
  sessionFeedbackIntro:
    'Votre session a été enregistrée. Vous pouvez maintenant ajouter votre ressenti.',
  sessionDurationLabel: 'Durée',
  sessionWordsLabel: 'Mots écrits',
  sessionDocumentLabel: 'Document travaillé',
  sessionNoDocument: 'Aucun chapitre ouvert',
  sessionMoodLabel: 'Humeur',
  sessionConcentrationLabel: 'Concentration',
  sessionEnergyLabel: 'Énergie',
  sessionNoteLabel: 'Note personnelle',
  sessionNotePlaceholder:
    'Comment s’est passée cette session ? Facultatif.',
  sessionMoodVeryGood: 'Très bonne session',
  sessionMoodGood: 'Bonne session',
  sessionMoodNeutral: 'Session normale',
  sessionMoodDifficult: 'Session difficile',
  sessionMoodVeryDifficult: 'Très mauvaise session',

  // -------------------------------------------------------------------------
  // THÈMES ET PARAMÈTRES
  // -------------------------------------------------------------------------

  themeToggle: 'Thème ▾',
  themeDark: '🌙 Sombre',
  themeLight: '☀️ Clair',
  themeSepia: '📜 Sépia',
  themeMidnight: '🌌 Nuit bleutée',
  themeForest: '🌲 Forêt',
  themeContrast: '⬛ Contraste élevé',
  themeRose: '🌸 Rosé',
  themeLavender: '💜 Lavande',
  themeOcean: '🌊 Océan',

  timerSoundChime: 'Carillon',
  timerSoundBell: 'Cloche',
  timerSoundSoft: 'Douce',
  timerSoundAlarm: 'Alarme',

  langToggle: '🌐 Langue ▾',
  langFr: 'Français',
  langEn: 'English',

  settingsToggle: '⚙️ Paramètres',
  themeSubmenuLabel: '🎨 Thème',
  langSubmenuLabel: '🌐 Langue',
  settingsModalTitle: 'Paramètres',
  settingsSectionAppearance: 'Apparence',
  settingsSectionCorrection: 'Correction',
  settingsSectionUpdates: 'Mises à jour',
  settingsSectionTimer: 'Minuteur',
  settingsSectionSessions: 'Sessions d’écriture',

  timerSoundEnabledLabel: '🔔 Son de fin de minuteur',
  timerSoundChoiceLabel: 'Sonnerie',
  timerVolumeLabel: 'Volume',
  timerVolumeTestBtn: '🔊 Tester',

  sessionScaleDescription:
    'Choisissez l’échelle utilisée pour noter votre concentration et votre énergie à la fin d’une session.',
  sessionConcentrationScaleLabel: 'Échelle de concentration',
  sessionEnergyScaleLabel: 'Échelle d’énergie',

  // -------------------------------------------------------------------------
  // AIDE
  // -------------------------------------------------------------------------

  helpMenuBtn: '❓ Aide',
  helpMenuBtnTitle: 'Raccourcis clavier',
  helpModalTitle: 'Raccourcis clavier',
  shortcutSave: 'Enregistrer',
  shortcutUndo: 'Annuler',
  shortcutRedo: 'Rétablir',
  shortcutBold: 'Gras',
  shortcutItalic: 'Italique',
  shortcutUnderline: 'Souligné',
  shortcutZoom: 'Zoom de la page',
  shortcutWbOpen: 'Ouvrir une fiche World Building',
  shortcutAlign: 'Aligner (gauche/centre/droite/justifié)',
  shortcutAccents:
    'Accents (façon Word) : `/\'/^/¨ + voyelle, , + c',
  shortcutReplace: 'Rechercher / Remplacer',
  shortcutGlobalSearch: 'Recherche globale',
  shortcutSwitchTab: 'Onglet suivant / précédent',
  shortcutZoomKeys: 'Zoom avant / arrière / réinitialiser',
  shortcutCloseTab: "Fermer l'onglet actif",
  shortcutMiddleClose: 'Fermer un onglet',
  shortcutNavigate: 'Naviguer sans souris',
  shortcutActivate: 'Activer un élément survolé au clavier',
  shortcutCloseModal: 'Fermer une fenêtre',

  // -------------------------------------------------------------------------
  // BARRE D’OUTILS
  // -------------------------------------------------------------------------

  undoTitle: 'Annuler (Ctrl+Z)',
  redoTitle: 'Rétablir (Ctrl+Y)',
  boldTitle: 'Gras',
  italicTitle: 'Italique',
  underlineTitle: 'Souligné',
  fontDropdown: 'Police ▾',
  sizeDropdown: 'Taille ▾',
  sizeXS: 'Très Petit (1)',
  sizeS: 'Petit (2)',
  sizeNormal: 'Normal (3)',
  sizeM: 'Moyen (4)',
  sizeL: 'Grand (5)',
  sizeXL: 'Très Grand (6)',
  sizeTitle: 'Titre (7)',
  colorPickerTitle: 'Couleur de texte',
  specialCharsBtn: 'Caractères ▾',
  specialCharsBtnTitle:
    'Insérer un caractère spécial (accents majuscules, guillemets français...)',
  alignLeftTitle: 'Aligner à gauche',
  alignCenterTitle: 'Centrer',
  alignRightTitle: 'Aligner à droite',
  alignJustifyTitle: 'Justifier',
  sizeNormalPx: '16 px (Normal)',
  globalSearchBtn: '🔎 Recherche globale',
  globalSearchBtnTitle: 'Rechercher dans tout le projet',
  replaceBtn: '🔍 Remplacer',
  replaceBtnTitle:
    'Rechercher / Remplacer dans le chapitre actuel',
  editorPlaceholder: 'Écrivez votre histoire...',

  // -------------------------------------------------------------------------
  // SIDEBAR
  // -------------------------------------------------------------------------

  chaptersHeader: 'Chapitres',
  newChapterTitle: 'Nouveau chapitre',
  worldBuildingHeader: 'World Building',
  addWBTitle: 'Ajouter élément',
  renameItemTitle: 'Renommer',
  deleteItemTitle: 'Supprimer',
  closeTabTitle: 'Fermer',
  ariaChapter: 'Chapitre',
  ariaSheet: 'Fiche',
  ariaTab: 'Onglet {name}',

  wbLabel_character: 'Personnage',
  wbLabel_place: 'Lieu',
  wbLabel_object: 'Objet',
  wbLabel_other: 'Autre',

  wbNewCustomTypeBtn: 'Nouveau type…',
  customTypeModalTitle: 'Nouveau type de fiche',
  customTypeNameLabel: 'Nom du type',
  customTypeNamePlaceholder: 'ex : Faction, Créature, Artefact…',
  customTypeIconLabel: 'Icône',
  customTypeColorLabel: 'Couleur par défaut',
  customTypeFieldsLabel: 'Champs de la fiche',
  customTypeAddFieldBtn: '+ Ajouter un champ',
  customTypeFieldLabelPlaceholder: 'Nom du champ',
  customTypeFieldTypeText: 'Ligne simple',
  customTypeFieldTypeTextarea: 'Texte long',
  customTypeRemoveFieldTitle: 'Retirer ce champ',
  customTypeDefaultFieldLabel: 'Description',
  customTypeNameRequired: 'Donnez un nom à ce type de fiche.',
  customTypeFieldsRequired:
    'Ajoutez au moins un champ avec un nom.',
  customTypeFieldsHint:
    'Chaque champ est une information de la fiche (comme "Prénom" ou "Âge" pour un Personnage). Ajoutez-en autant que nécessaire ; le ✕ retire un champ que vous ne voulez plus.',
  customTypeDuplicateField:
    'Le champ "{label}" est utilisé plusieurs fois : donnez un nom différent à chacun.',
  customTypeEditTitle: 'Modifier ce type',
  customTypeDeleteTitle: 'Supprimer ce type',
  customTypeEditModalTitle: 'Modifier le type de fiche',
  customTypeDeleteBlocked:
    'Impossible de supprimer "{label}" : {count} fiche(s) utilisent encore ce type. Supprimez-les ou changez leur type d\'abord.',
  customTypeConfirmDelete:
    'Supprimer définitivement le type "{label}" ? Cette action est irréversible.',

  wbIconInputTitle:
    'Icône de la fiche (change dans la sidebar et les onglets)',
  wbIconCustomPlaceholder: 'Autre…',
  wbIconCustomApply: 'OK',
  wbColorLabel: 'Couleur de surlignage dans les chapitres',
  wbMentionedInLabel: '📖 Mentionné dans',
  wbMentionedInNone:
    'Pas encore mentionné dans un chapitre.',
  wbReadModeTitle:
    'Basculer en mode lecture (fige la fiche contre les modifications accidentelles)',
  wbReadModeLabel: 'Mode lecture',

  // -------------------------------------------------------------------------
  // CHAMPS WORLD BUILDING
  // -------------------------------------------------------------------------

  wbField_firstname: 'Prénom',
  wbField_lastname: 'Nom',
  wbField_age: 'Âge',
  wbField_home: 'Habitation',
  wbField_family: 'Famille',
  wbField_physical: 'Physique',
  wbField_moral: 'Moral / Psychologie',
  wbField_background: 'Histoire / Background',
  wbField_notes: 'Notes libres',
  wbField_type: 'Type',
  wbField_location: 'Localisation',
  wbField_description: 'Description',
  wbField_atmosphere: 'Atmosphère / Ambiance',
  wbField_history: 'Histoire',
  wbField_inhabitants: 'Habitants / Faune',
  wbField_owner: 'Propriétaire',
  wbField_power: 'Pouvoir / Utilité',

  // -------------------------------------------------------------------------
  // BARRE DE STATUT
  // -------------------------------------------------------------------------

  loadMusicTitle: 'Charger des musiques',
  noTrack: 'Aucune musique',
  prevTrackTitle: 'Piste précédente',
  playPauseTitle: 'Lecture / Pause',
  nextTrackTitle: 'Piste suivante',

  statsNormal: '{words} mots | {chars} car. | Total: {total} m',
  statsSelected:
    '{words} mots sél. | {chars} car. sél. | Total: {total} m',
  statsSheetMode: 'Mode Fiche',

  saveStatusPending: '● Modifications non enregistrées',
  saveStatusSavedAt: '✓ Enregistré à {time}',
  saveStatusSaved: '✓ Enregistré',
  saveStatusError: '⚠ Échec de la sauvegarde',
  closeTabUnsavedWarning:
    'La dernière sauvegarde de "{name}" a échoué : fermer cet onglet risque de perdre les modifications non enregistrées. Fermer quand même ?',

  // -------------------------------------------------------------------------
  // MODALES GÉNÉRALES
  // -------------------------------------------------------------------------

  newChapterModalTitle: 'Nouveau Chapitre',
  chapterNamePlaceholder: 'Nom du chapitre',
  newWBModalTitle: 'Nouveau {type}',
  wbNamePlaceholder: "Nom de l'élément",
  renameModalTitle: 'Renommer',

  timerModalTitle: 'Configurer le minuteur',
  timer5: '5 minutes',
  timer15: '15 minutes',
  timer25: '25 minutes (Pomodoro)',
  timer60: '1 heure',
  timerCustomLabel: 'Ou durée personnalisée (minutes)',
  timerCustomPlaceholder: 'ex : 45',

  replaceModalTitle: 'Rechercher / Remplacer',
  findPlaceholder: 'Rechercher...',
  replacePlaceholder: 'Remplacer par...',
  replaceScopeAllLabel:
    'Remplacer dans tout le projet (tous les chapitres)',
  replaceAllBtn: 'Tout remplacer',

  globalSearchModalTitle: 'Recherche dans tout le projet',
  globalSearchPlaceholder:
    'Rechercher un mot, un nom, une phrase...',
  globalSearchHint:
    'Tapez au moins un caractère pour lancer la recherche.',
  globalSearchNoResults: 'Aucun résultat.',
  occurrences: '{count} occurrence(s)',

  displayPrefsTitle: "Affichage de la page d'écriture",
  prefWidthLabel: 'Largeur de page',
  prefWidthNarrow: 'Étroite (confort de lecture)',
  prefWidthNormal: 'Normale',
  prefWidthLarge: 'Large',
  prefWidthXLarge: 'Très large',
  prefFontLabel: 'Police de lecture',
  prefLineHeightLabel: 'Interligne',
  prefLineCompact: 'Compact (1.4)',
  prefLineNormal: 'Normal (1.6)',
  prefLineAiry: 'Aéré (1.8)',
  prefLineVeryAiry: 'Très aéré (2.2)',
  prefUiFontSizeLabel: "Taille du texte de l'interface",
  prefUiFontLabel: "Police de l'interface",
  prefUiSizeSmall: 'Petite',
  prefUiSizeNormal: 'Normale',
  prefUiSizeLarge: 'Grande',
  prefUiSizeXLarge: 'Très grande',
  infoModalTitle: 'Information',
  defaultChapterName: 'Chapitre',

  // -------------------------------------------------------------------------
  // STATISTIQUES
  // -------------------------------------------------------------------------

  statsMenuBtn: '📊 Statistiques',
  statsModalTitle: "Statistiques et journal d'écriture",

  statsTabOverview: 'Vue d’ensemble',
  statsTabSessions: 'Historique',
  statsTabGoals: 'Objectifs',

  statsGoalLabel: '🎯 Objectif quotidien (mots)',
  statsGoalPlaceholder: 'ex : 500',
  statsGoalSaveBtn: 'Enregistrer',
  statsGoalProgress: '{words} / {goal} mots aujourd’hui',

  statsPeriodDay: 'Par jour',
  statsPeriodWeek: 'Par semaine',
  statsPeriodMonth: 'Par mois',
  statsPeriodYear: 'Par année',
  statsWeekPrefix: 'Semaine',
  statsWordsUnit: 'mots',

  statsRangeLabel: 'Période',
  statsRangeToday: 'Aujourd’hui',
  statsRangeWeek: 'Cette semaine',
  statsRangeMonth: 'Ce mois',
  statsRangeYear: 'Cette année',
  statsRangeCustom: 'Période personnalisée',
  statsCustomStart: 'Date de début',
  statsCustomEnd: 'Date de fin',
  statsApplyRange: 'Appliquer',

  statsSessionsCount: 'Sessions',
  statsWritingTime: 'Temps d’écriture',
  statsWrittenWords: 'Mots écrits',
  statsAverageSession: 'Moyenne par session',
  statsAverageConcentration: 'Concentration moyenne',
  statsAverageEnergy: 'Énergie moyenne',

  statsActivityByDay: 'Activité par jour',
  statsActivityByHour: 'Activité selon l’heure',
  statsProductivityByWeekday: 'Productivité selon le jour',
  statsConcentrationByHour: 'Concentration selon l’heure',
  statsMoodProductivity: 'Humeur et productivité',

  statsSessionHistory: 'Historique des sessions',
  statsSessionProject: 'Projet',
  statsSessionDocument: 'Document',
  statsSessionDuration: 'Durée',
  statsSessionWords: 'Mots',
  statsSessionConcentration: 'Concentration',
  statsSessionEnergy: 'Énergie',
  statsSessionMood: 'Humeur',
  statsSessionPomodoro: 'Pomodoro',
  statsSessionManual: 'Session libre',
  statsSessionStartedAt: 'Début',
  statsSessionEndedAt: 'Fin',
  statsSessionNote: 'Note',
  statsSessionDetails: 'Détails de la session',
  statsDeleteSession: 'Supprimer cette session',
  statsConfirmDeleteSession:
    'Supprimer définitivement cette session de l’historique ?',
  statsNoSessions:
    'Aucune session d’écriture pour cette période.',

  loadingStats: 'Chargement des statistiques…',
  statsNoData: "Pas encore de données d'écriture.",

  // -------------------------------------------------------------------------
  // OBJECTIFS DE PROJET
  // -------------------------------------------------------------------------

  goalsTitle: 'Objectifs du projet',
  goalNew: '+ Nouvel objectif',
  goalEdit: 'Modifier l’objectif',
  goalName: 'Nom de l’objectif',
  goalNamePlaceholder: 'ex : Premier jet',
  goalDeadline: 'Date limite',
  goalNoDeadline: 'Aucune date limite',
  goalProgressMode: 'Calcul de la progression',
  goalModeWords: 'Nombre de mots',
  goalModeManual: 'Progression manuelle',
  goalTargetWords: 'Objectif de mots',
  goalTargetWordsPlaceholder: 'ex : 80000',
  goalManualProgress: 'Progression actuelle',
  goalManualProgressLabel: '{progress} %',
  goalSave: 'Enregistrer l’objectif',
  goalDelete: 'Supprimer l’objectif',
  goalConfirmDelete:
    'Supprimer définitivement l’objectif "{name}" ?',
  goalsNone:
    'Aucun objectif pour ce projet. Ajoutez une échéance ou un objectif de mots pour suivre votre progression.',
  goalDaysRemaining: '{days} jour(s) restant(s)',
  goalDueToday: 'Échéance aujourd’hui',
  goalOverdue: 'En retard de {days} jour(s)',
  goalCompleted: 'Objectif terminé',
  goalWordsProgress: '{current} / {target} mots',

  // -------------------------------------------------------------------------
  // MISES À JOUR
  // -------------------------------------------------------------------------

  checkUpdatesMenuBtn: '🔄 Rechercher les mises à jour…',
  updateAvailableTitle: 'Mise à jour disponible',
  updateAvailableMessage:
    'La version {version} de Scriptorium est disponible. Voulez-vous la télécharger et l’installer ?',
  updateDownloadBtn: 'Télécharger et installer',
  updateLaterBtn: 'Plus tard',
  updateReadyTitle: 'Mise à jour prête',
  updateReadyMessage:
    'La version {version} a été téléchargée. Elle sera installée au prochain démarrage. Redémarrer maintenant ?',
  updateRestartNowBtn: 'Redémarrer maintenant',
  updateUpToDateTitle: 'Mises à jour',
  updateUpToDateMessage:
    'Vous utilisez déjà la dernière version.',
  updateErrorTitle: 'Mises à jour',
  updateErrorMessage:
    'Impossible de vérifier les mises à jour : {error}',

  // -------------------------------------------------------------------------
  // SAUVEGARDES
  // -------------------------------------------------------------------------

  backupsModalTitle: 'Sauvegardes automatiques',
  backupsDescription:
    "Une sauvegarde horodatée est créée automatiquement pendant que vous travaillez. Restaurer une version antérieure remplace le contenu actuel du projet (une sauvegarde de l'état actuel est créée avant, par sécurité).",
  backupNoneYet:
    'Aucune sauvegarde pour le moment. Elles se créent automatiquement pendant que vous écrivez.',
  backupRestoreBtn: 'Restaurer',
  backupConfirmRestore:
    "Restaurer la sauvegarde du {date} ?\n\nLe contenu actuel du projet sera remplacé (une sauvegarde de l'état actuel sera créée juste avant, par sécurité).",
  backupRestoreSuccess: 'Sauvegarde restaurée avec succès.',
  backupRestoreError: 'Erreur lors de la restauration : ',
  unknownDate: 'Date inconnue',

  // -------------------------------------------------------------------------
  // CORRECTEUR DE GRAMMAIRE
  // -------------------------------------------------------------------------

  grammarSubmenuLabel: '✔️ Grammaire',
  nativeSpellcheckLabel: '🔤 Correcteur orthographique natif',
  grammarToggleLabel: 'Correction grammaticale',
  grammarConfigureBtn: 'Configurer…',
  grammarModalTitle: 'Correcteur de grammaire (LanguageTool)',
  grammarModalIntro:
    "Scriptorium peut utiliser LanguageTool en local, entièrement hors ligne, pour détecter les fautes de grammaire, d'accord et de conjugaison (en plus du correcteur d'orthographe déjà intégré).",
  grammarEnableLabel: 'Activer la correction grammaticale',
  grammarJavaLabel: 'Java :',
  grammarJavaOk: '✅ détecté',
  grammarJavaMissing: '❌ introuvable',
  grammarJavaOutdated:
    '⚠️ version {version} trop ancienne (17+ requis)',
  grammarJavaMissingHint:
    'LanguageTool nécessite Java 17 ou supérieur. Installez-le depuis java.com, puis relancez la vérification.',
  grammarJavaOutdatedHint:
    'LanguageTool nécessite Java 17 ou supérieur ; la version installée est trop ancienne et ne peut pas le faire fonctionner. Installez un Java 17+ (par ex. Eclipse Temurin), puis relancez la vérification.',
  grammarFolderLabel: 'Dossier LanguageTool :',
  grammarFolderNotSet: 'non configuré',
  grammarSelectFolderBtn:
    '📂 Choisir le dossier LanguageTool…',
  grammarAutoInstallBtn:
    '📥 Installer LanguageTool automatiquement (~200 Mo)',
  grammarOrManualLabel: 'ou manuellement',
  grammarOpenJavaBtn: '☕ Ouvrir java.com pour installer Java',
  grammarInstallDownloading:
    'Téléchargement de LanguageTool… {percent}%',
  grammarInstallExtracting: "Extraction de l'archive…",
  grammarInstallDone:
    '✅ LanguageTool installé avec succès !',
  grammarInstallError:
    "❌ Échec de l'installation automatique : {error}",
  grammarDownloadHint:
    'Téléchargez LanguageTool Desktop/Server (languagetool-server.jar) depuis languagetool.org/download, dézippez-le où vous voulez, puis sélectionnez ce dossier ici.',
  grammarInvalidFolder:
    'Ce dossier ne contient pas de fichier languagetool-server.jar valide.',
  grammarRecheckBtn: '🔄 Revérifier',
  grammarStatusChecking: 'Vérification en cours…',
  grammarStatusStarting:
    'Démarrage du serveur LanguageTool local…',
  grammarStatusReady:
    '✅ Serveur LanguageTool actif (hors ligne, port {port}).',
  grammarStatusError:
    '❌ Impossible de démarrer LanguageTool : {error}',
  grammarStatusDisabled: 'Correction grammaticale désactivée.',
  grammarCheckFailedAlert:
    'La vérification grammaticale a échoué et a été désactivée : {error}\n\nCorrigez le problème puis cliquez sur "Revérifier" dans les Paramètres.',
  grammarIgnoreBtn: 'Ignorer',
  grammarNoSuggestions: 'Aucune suggestion',
  grammarScanningTooltip: 'Vérification grammaticale…',
  grammarStatusBarReady: 'Grammaire ✓',
  grammarStatusBarReadyTitle:
    'Correction grammaticale active (cliquer pour configurer)',
  grammarStatusBarStarting: 'Grammaire…',
  grammarStatusBarStartingTitle:
    'Démarrage du serveur LanguageTool…',
  grammarStatusBarError: 'Grammaire ⚠',
  grammarStatusBarErrorTitle:
    'Correction grammaticale activée mais indisponible (cliquer pour diagnostiquer)',

  // -------------------------------------------------------------------------
  // ALERTES ET ERREURS
  // -------------------------------------------------------------------------

  nothingToExport: 'Rien à exporter.',
  exportTxtSuccess: 'Export TXT réussi !',
  exportTxtError: "Erreur lors de l'export TXT : ",
  exportMdSuccess: 'Export Markdown réussi !',
  exportMdError: "Erreur lors de l'export Markdown : ",
  exportPdfSuccess: 'Export PDF réussi !',
  exportPdfError: "Erreur lors de l'export PDF : ",
  exportDocxSuccess: 'Export DOCX réussi !',
  exportDocxError: "Erreur lors de l'export DOCX : ",
  exportProjectError: "Erreur lors de l'export du projet : ",
  confirmDeleteItem: 'Voulez-vous vraiment supprimer "{name}" ?',
  replaceNoChapterOpen:
    "Ouvrez d'abord un chapitre, ou cochez « tout le projet ».",
  replaceNoneInChapter:
    'Aucune occurrence trouvée dans ce chapitre.',
  replaceNoneInProject:
    'Aucune occurrence trouvée dans le projet.',
  replaceDoneInChapter:
    '{count} occurrence(s) remplacée(s).',
  replaceDoneInProject:
    '{count} occurrence(s) remplacée(s) dans {chapters} chapitre(s).',
  loadingBackups: 'Chargement...',
  itemNotFound: 'Élément introuvable (supprimé ?)',
  initErrorPrefix:
    "Une erreur est survenue au chargement de l'éditeur :\n\n",
  initErrorSuffix:
    '\n\nOuvrez la console (Ctrl+Shift+I) pour plus de détails.',
  menuInitErrorPrefix:
    'Une erreur est survenue au chargement de la liste des projets :\n\n'
};

export type TranslationKey = keyof typeof fr;

export const en: Record<TranslationKey, string> = {
  // -------------------------------------------------------------------------
  // COMMON
  // -------------------------------------------------------------------------

  cancel: 'Cancel',
  create: 'Create',
  rename: 'Rename',
  close: 'Close',
  launch: 'Start',
  save: 'Save',
  delete: 'Delete',
  edit: 'Edit',
  confirmModalOk: 'Confirm',
  confirmModalTitle: 'Confirm',
  alreadyExists: 'This name already exists',
  nameRequired: 'Name is required',
  renameWbMentionsWarning:
    'Renaming "{oldName}" to "{newName}" will also replace this name everywhere it appears in the text of {count} chapter(s). Continue?',

  // -------------------------------------------------------------------------
  // PROJECTS PAGE
  // -------------------------------------------------------------------------

  importProject: '📥 Import',
  importProjectTitle: 'Import a .scriptorium file',
  newProject: '+ New Project',
  noProjects: 'No projects yet. Create one!',
  noProjectsHint:
    'Start writing your next story right now.',
  projectCountSubtitle: '{count} project(s)',
  newProjectModalTitle: 'New Project',
  projectNamePlaceholder: 'Project name',
  renameProjectModalTitle: 'Rename project',
  newNamePlaceholder: 'New name',
  optionRename: '✏️ Rename',
  optionExport: '📤 Export (.scriptorium)',
  optionDelete: '🗑 Delete project',
  projectOptionsTitle: 'Customize',
  projectStats: '{chapters} chapters • {words} words',
  projectGoalSummary: '🎯 {progress}% • {remaining}',
  projectGoalNoDeadline: 'no deadline',
  projectGoalDueToday: 'due today',
  projectGoalDaysRemaining: '{days} day(s) remaining',
  projectGoalDaysOverdue: '{days} day(s) overdue',
  confirmDeleteProject:
    'Do you really want to permanently delete the project "{name}"?',
  exportSuccess: 'Project exported successfully!',
  exportError: 'Error during export: ',
  importSuccess: 'Project "{name}" imported successfully!',
  importError:
    'Error during import: this file may not be a valid Scriptorium export.\n\n',
  defaultProjectName: 'Project',

  // -------------------------------------------------------------------------
  // EDITOR HEADER
  // -------------------------------------------------------------------------

  exportMenuBtn: '📤 Export ▾',
  exportTxtItem: '📄 Text (.txt)',
  exportMdItem: '📑 Markdown (.md)',
  exportPdfItem: '📕 PDF (.pdf)',
  exportDocxItem: '📝 Word (.docx)',
  exportProjectItem: '💾 Full project (.scriptorium)',
  backupsBtn: '🕐 Backups',
  backupsBtnTitle: 'View and restore automatic backups',
  displayPrefsBtn: '⚙️ Display',
  displayPrefsBtnTitle:
    'Customize the writing page display',
  rulerMarginLeftTitle: 'Left margin (drag to adjust)',
  rulerMarginRightTitle: 'Right margin (drag to adjust)',
  rulerIndentTitle: 'First-line indent (drag to adjust)',
  backToProjects: 'Back to projects',

  // -------------------------------------------------------------------------
  // TIMER AND WRITING SESSIONS
  // -------------------------------------------------------------------------

  timerBtn: '⏱ Timer',
  timerPauseTitle: 'Pause',
  timerStopTitle: 'Stop timer',
  timerFinished: 'Time is up!',
  timerFinishedTitle: '⏱ Timer finished',

  sessionManualStartTitle:
    'Start a writing session without a timer',
  sessionResumeTitle: 'Resume the session',
  sessionStopTitle: 'Finish and save the session',
  sessionFinishedTitle: 'Session finished',
  sessionSkipFeedback: 'Skip feedback',
  sessionSaveFeedback: 'Save session',
  sessionFeedbackIntro:
    'Your session has been saved. You can now add how you felt.',
  sessionDurationLabel: 'Duration',
  sessionWordsLabel: 'Words written',
  sessionDocumentLabel: 'Document',
  sessionNoDocument: 'No chapter open',
  sessionMoodLabel: 'Mood',
  sessionConcentrationLabel: 'Concentration',
  sessionEnergyLabel: 'Energy',
  sessionNoteLabel: 'Personal note',
  sessionNotePlaceholder:
    'How did this session go? Optional.',
  sessionMoodVeryGood: 'Very good session',
  sessionMoodGood: 'Good session',
  sessionMoodNeutral: 'Normal session',
  sessionMoodDifficult: 'Difficult session',
  sessionMoodVeryDifficult: 'Very difficult session',

  // -------------------------------------------------------------------------
  // THEMES AND SETTINGS
  // -------------------------------------------------------------------------

  themeToggle: 'Theme ▾',
  themeDark: '🌙 Dark',
  themeLight: '☀️ Light',
  themeSepia: '📜 Sepia',
  themeMidnight: '🌌 Midnight',
  themeForest: '🌲 Forest',
  themeContrast: '⬛ High contrast',
  themeRose: '🌸 Rose',
  themeLavender: '💜 Lavender',
  themeOcean: '🌊 Ocean',

  timerSoundChime: 'Chime',
  timerSoundBell: 'Bell',
  timerSoundSoft: 'Soft',
  timerSoundAlarm: 'Alarm',

  langToggle: '🌐 Language ▾',
  langFr: 'Français',
  langEn: 'English',

  settingsToggle: '⚙️ Settings',
  themeSubmenuLabel: '🎨 Theme',
  langSubmenuLabel: '🌐 Language',
  settingsModalTitle: 'Settings',
  settingsSectionAppearance: 'Appearance',
  settingsSectionCorrection: 'Proofing',
  settingsSectionUpdates: 'Updates',
  settingsSectionTimer: 'Timer',
  settingsSectionSessions: 'Writing sessions',

  timerSoundEnabledLabel: '🔔 Timer end sound',
  timerSoundChoiceLabel: 'Ringtone',
  timerVolumeLabel: 'Volume',
  timerVolumeTestBtn: '🔊 Test',

  sessionScaleDescription:
    'Choose the scale used to rate your concentration and energy at the end of a session.',
  sessionConcentrationScaleLabel: 'Concentration scale',
  sessionEnergyScaleLabel: 'Energy scale',

  // -------------------------------------------------------------------------
  // HELP
  // -------------------------------------------------------------------------

  helpMenuBtn: '❓ Help',
  helpMenuBtnTitle: 'Keyboard shortcuts',
  helpModalTitle: 'Keyboard shortcuts',
  shortcutSave: 'Save',
  shortcutUndo: 'Undo',
  shortcutRedo: 'Redo',
  shortcutBold: 'Bold',
  shortcutItalic: 'Italic',
  shortcutUnderline: 'Underline',
  shortcutZoom: 'Zoom the page',
  shortcutWbOpen: 'Open a World Building sheet',
  shortcutAlign: 'Align (left/center/right/justify)',
  shortcutAccents:
    'Accents (Word-style): `/\'/^/¨ + vowel, , + c',
  shortcutReplace: 'Find / Replace',
  shortcutGlobalSearch: 'Global search',
  shortcutSwitchTab: 'Next / previous tab',
  shortcutZoomKeys: 'Zoom in / out / reset',
  shortcutCloseTab: 'Close the active tab',
  shortcutMiddleClose: 'Close a tab',
  shortcutNavigate: 'Navigate without a mouse',
  shortcutActivate: 'Activate a focused element',
  shortcutCloseModal: 'Close a window',

  // -------------------------------------------------------------------------
  // TOOLBAR
  // -------------------------------------------------------------------------

  undoTitle: 'Undo (Ctrl+Z)',
  redoTitle: 'Redo (Ctrl+Y)',
  boldTitle: 'Bold',
  italicTitle: 'Italic',
  underlineTitle: 'Underline',
  fontDropdown: 'Font ▾',
  sizeDropdown: 'Size ▾',
  sizeXS: 'Extra Small (1)',
  sizeS: 'Small (2)',
  sizeNormal: 'Normal (3)',
  sizeM: 'Medium (4)',
  sizeL: 'Large (5)',
  sizeXL: 'Extra Large (6)',
  sizeTitle: 'Title (7)',
  colorPickerTitle: 'Text color',
  specialCharsBtn: 'Characters ▾',
  specialCharsBtnTitle:
    'Insert a special character (accented capitals, French quotation marks...)',
  alignLeftTitle: 'Align left',
  alignCenterTitle: 'Center',
  alignRightTitle: 'Align right',
  alignJustifyTitle: 'Justify',
  sizeNormalPx: '16 px (Normal)',
  globalSearchBtn: '🔎 Global Search',
  globalSearchBtnTitle: 'Search across the whole project',
  replaceBtn: '🔍 Replace',
  replaceBtnTitle:
    'Find / Replace in the current chapter',
  editorPlaceholder: 'Write your story...',

  // -------------------------------------------------------------------------
  // SIDEBAR
  // -------------------------------------------------------------------------

  chaptersHeader: 'Chapters',
  newChapterTitle: 'New chapter',
  worldBuildingHeader: 'World Building',
  addWBTitle: 'Add item',
  renameItemTitle: 'Rename',
  deleteItemTitle: 'Delete',
  closeTabTitle: 'Close',
  ariaChapter: 'Chapter',
  ariaSheet: 'Sheet',
  ariaTab: 'Tab {name}',

  wbLabel_character: 'Character',
  wbLabel_place: 'Place',
  wbLabel_object: 'Object',
  wbLabel_other: 'Other',

  wbNewCustomTypeBtn: 'New type…',
  customTypeModalTitle: 'New sheet type',
  customTypeNameLabel: 'Type name',
  customTypeNamePlaceholder:
    'e.g. Faction, Creature, Artifact…',
  customTypeIconLabel: 'Icon',
  customTypeColorLabel: 'Default color',
  customTypeFieldsLabel: 'Sheet fields',
  customTypeAddFieldBtn: '+ Add a field',
  customTypeFieldLabelPlaceholder: 'Field name',
  customTypeFieldTypeText: 'Single line',
  customTypeFieldTypeTextarea: 'Long text',
  customTypeRemoveFieldTitle: 'Remove this field',
  customTypeDefaultFieldLabel: 'Description',
  customTypeNameRequired: 'Give this sheet type a name.',
  customTypeFieldsRequired:
    'Add at least one field with a name.',
  customTypeFieldsHint:
    'Each field is a piece of information on the sheet (like "First name" or "Age" for a Character). Add as many as you need; ✕ removes a field you no longer want.',
  customTypeDuplicateField:
    'The field "{label}" is used more than once: give each one a different name.',
  customTypeEditTitle: 'Edit this type',
  customTypeDeleteTitle: 'Delete this type',
  customTypeEditModalTitle: 'Edit sheet type',
  customTypeDeleteBlocked:
    'Cannot delete "{label}": {count} sheet(s) still use this type. Delete them or change their type first.',
  customTypeConfirmDelete:
    'Permanently delete the "{label}" type? This cannot be undone.',

  wbIconInputTitle:
    'Sheet icon (updates in the sidebar and tabs)',
  wbIconCustomPlaceholder: 'Other…',
  wbIconCustomApply: 'OK',
  wbColorLabel: 'Highlight color in chapters',
  wbMentionedInLabel: '📖 Mentioned in',
  wbMentionedInNone:
    'Not mentioned in any chapter yet.',
  wbReadModeTitle:
    'Switch to read mode (locks the sheet against accidental edits)',
  wbReadModeLabel: 'Read mode',

  // -------------------------------------------------------------------------
  // WORLD BUILDING FIELDS
  // -------------------------------------------------------------------------

  wbField_firstname: 'First name',
  wbField_lastname: 'Last name',
  wbField_age: 'Age',
  wbField_home: 'Home',
  wbField_family: 'Family',
  wbField_physical: 'Physical appearance',
  wbField_moral: 'Personality / Psychology',
  wbField_background: 'Backstory',
  wbField_notes: 'Free notes',
  wbField_type: 'Type',
  wbField_location: 'Location',
  wbField_description: 'Description',
  wbField_atmosphere: 'Atmosphere / Mood',
  wbField_history: 'History',
  wbField_inhabitants: 'Inhabitants / Wildlife',
  wbField_owner: 'Owner',
  wbField_power: 'Power / Purpose',

  // -------------------------------------------------------------------------
  // STATUS BAR
  // -------------------------------------------------------------------------

  loadMusicTitle: 'Load music',
  noTrack: 'No track',
  prevTrackTitle: 'Previous track',
  playPauseTitle: 'Play / Pause',
  nextTrackTitle: 'Next track',

  statsNormal: '{words} words | {chars} ch. | Total: {total} w',
  statsSelected:
    '{words} sel. words | {chars} sel. ch. | Total: {total} w',
  statsSheetMode: 'Sheet mode',

  saveStatusPending: '● Unsaved changes',
  saveStatusSavedAt: '✓ Saved at {time}',
  saveStatusSaved: '✓ Saved',
  saveStatusError: '⚠ Save failed',
  closeTabUnsavedWarning:
    'The last save of "{name}" failed: closing this tab may lose unsaved changes. Close anyway?',

  // -------------------------------------------------------------------------
  // GENERAL MODALS
  // -------------------------------------------------------------------------

  newChapterModalTitle: 'New Chapter',
  chapterNamePlaceholder: 'Chapter name',
  newWBModalTitle: 'New {type}',
  wbNamePlaceholder: 'Item name',
  renameModalTitle: 'Rename',

  timerModalTitle: 'Set up the timer',
  timer5: '5 minutes',
  timer15: '15 minutes',
  timer25: '25 minutes (Pomodoro)',
  timer60: '1 hour',
  timerCustomLabel: 'Or custom duration (minutes)',
  timerCustomPlaceholder: 'e.g. 45',

  replaceModalTitle: 'Find / Replace',
  findPlaceholder: 'Search...',
  replacePlaceholder: 'Replace with...',
  replaceScopeAllLabel:
    'Replace across the whole project (all chapters)',
  replaceAllBtn: 'Replace all',

  globalSearchModalTitle: 'Search across the project',
  globalSearchPlaceholder:
    'Search for a word, a name, a phrase...',
  globalSearchHint:
    'Type at least one character to start searching.',
  globalSearchNoResults: 'No results.',
  occurrences: '{count} occurrence(s)',

  displayPrefsTitle: 'Writing page display',
  prefWidthLabel: 'Page width',
  prefWidthNarrow: 'Narrow (reading comfort)',
  prefWidthNormal: 'Normal',
  prefWidthLarge: 'Large',
  prefWidthXLarge: 'Extra large',
  prefFontLabel: 'Reading font',
  prefLineHeightLabel: 'Line spacing',
  prefLineCompact: 'Compact (1.4)',
  prefLineNormal: 'Normal (1.6)',
  prefLineAiry: 'Airy (1.8)',
  prefLineVeryAiry: 'Very airy (2.2)',
  prefUiFontSizeLabel: 'Interface text size',
  prefUiFontLabel: 'Interface font',
  prefUiSizeSmall: 'Small',
  prefUiSizeNormal: 'Normal',
  prefUiSizeLarge: 'Large',
  prefUiSizeXLarge: 'Extra large',
  infoModalTitle: 'Information',
  defaultChapterName: 'Chapter',

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  statsMenuBtn: '📊 Statistics',
  statsModalTitle: 'Writing statistics and journal',

  statsTabOverview: 'Overview',
  statsTabSessions: 'History',
  statsTabGoals: 'Goals',

  statsGoalLabel: '🎯 Daily goal (words)',
  statsGoalPlaceholder: 'e.g. 500',
  statsGoalSaveBtn: 'Save',
  statsGoalProgress: '{words} / {goal} words today',

  statsPeriodDay: 'By day',
  statsPeriodWeek: 'By week',
  statsPeriodMonth: 'By month',
  statsPeriodYear: 'By year',
  statsWeekPrefix: 'Week',
  statsWordsUnit: 'words',

  statsRangeLabel: 'Period',
  statsRangeToday: 'Today',
  statsRangeWeek: 'This week',
  statsRangeMonth: 'This month',
  statsRangeYear: 'This year',
  statsRangeCustom: 'Custom period',
  statsCustomStart: 'Start date',
  statsCustomEnd: 'End date',
  statsApplyRange: 'Apply',

  statsSessionsCount: 'Sessions',
  statsWritingTime: 'Writing time',
  statsWrittenWords: 'Words written',
  statsAverageSession: 'Average per session',
  statsAverageConcentration: 'Average concentration',
  statsAverageEnergy: 'Average energy',

  statsActivityByDay: 'Activity by day',
  statsActivityByHour: 'Activity by hour',
  statsProductivityByWeekday: 'Productivity by weekday',
  statsConcentrationByHour: 'Concentration by hour',
  statsMoodProductivity: 'Mood and productivity',

  statsSessionHistory: 'Session history',
  statsSessionProject: 'Project',
  statsSessionDocument: 'Document',
  statsSessionDuration: 'Duration',
  statsSessionWords: 'Words',
  statsSessionConcentration: 'Concentration',
  statsSessionEnergy: 'Energy',
  statsSessionMood: 'Mood',
  statsSessionPomodoro: 'Pomodoro',
  statsSessionManual: 'Free session',
  statsSessionStartedAt: 'Start',
  statsSessionEndedAt: 'End',
  statsSessionNote: 'Note',
  statsSessionDetails: 'Session details',
  statsDeleteSession: 'Delete this session',
  statsConfirmDeleteSession:
    'Permanently delete this session from the history?',
  statsNoSessions:
    'No writing sessions for this period.',

  loadingStats: 'Loading statistics…',
  statsNoData: 'No writing data yet.',

  // -------------------------------------------------------------------------
  // PROJECT GOALS
  // -------------------------------------------------------------------------

  goalsTitle: 'Project goals',
  goalNew: '+ New goal',
  goalEdit: 'Edit goal',
  goalName: 'Goal name',
  goalNamePlaceholder: 'e.g. First draft',
  goalDeadline: 'Deadline',
  goalNoDeadline: 'No deadline',
  goalProgressMode: 'Progress calculation',
  goalModeWords: 'Word count',
  goalModeManual: 'Manual progress',
  goalTargetWords: 'Word goal',
  goalTargetWordsPlaceholder: 'e.g. 80000',
  goalManualProgress: 'Current progress',
  goalManualProgressLabel: '{progress}%',
  goalSave: 'Save goal',
  goalDelete: 'Delete goal',
  goalConfirmDelete:
    'Permanently delete the goal "{name}"?',
  goalsNone:
    'No goals for this project. Add a deadline or word target to track your progress.',
  goalDaysRemaining: '{days} day(s) remaining',
  goalDueToday: 'Due today',
  goalOverdue: '{days} day(s) overdue',
  goalCompleted: 'Goal completed',
  goalWordsProgress: '{current} / {target} words',

  // -------------------------------------------------------------------------
  // UPDATES
  // -------------------------------------------------------------------------

  checkUpdatesMenuBtn: '🔄 Check for updates…',
  updateAvailableTitle: 'Update available',
  updateAvailableMessage:
    'Version {version} of Scriptorium is available. Do you want to download and install it?',
  updateDownloadBtn: 'Download and install',
  updateLaterBtn: 'Later',
  updateReadyTitle: 'Update ready',
  updateReadyMessage:
    'Version {version} has been downloaded. It will be installed on next launch. Restart now?',
  updateRestartNowBtn: 'Restart now',
  updateUpToDateTitle: 'Updates',
  updateUpToDateMessage:
    'You are already using the latest version.',
  updateErrorTitle: 'Updates',
  updateErrorMessage:
    'Could not check for updates: {error}',

  // -------------------------------------------------------------------------
  // BACKUPS
  // -------------------------------------------------------------------------

  backupsModalTitle: 'Automatic backups',
  backupsDescription:
    "A timestamped backup is created automatically while you work. Restoring an earlier version replaces the project's current content (a backup of the current state is created first, as a safety net).",
  backupNoneYet:
    'No backups yet. They are created automatically while you write.',
  backupRestoreBtn: 'Restore',
  backupConfirmRestore:
    "Restore the backup from {date}?\n\nThe project's current content will be replaced (a backup of the current state will be created first, as a safety net).",
  backupRestoreSuccess: 'Backup restored successfully.',
  backupRestoreError: 'Error while restoring: ',
  unknownDate: 'Unknown date',

  // -------------------------------------------------------------------------
  // GRAMMAR CHECKER
  // -------------------------------------------------------------------------

  grammarSubmenuLabel: '✔️ Grammar',
  nativeSpellcheckLabel: '🔤 Native spellchecker',
  grammarToggleLabel: 'Grammar checking',
  grammarConfigureBtn: 'Configure…',
  grammarModalTitle: 'Grammar checker (LanguageTool)',
  grammarModalIntro:
    'Scriptorium can use LanguageTool locally, fully offline, to detect grammar, agreement and conjugation mistakes (in addition to the built-in spell checker).',
  grammarEnableLabel: 'Enable grammar checking',
  grammarJavaLabel: 'Java:',
  grammarJavaOk: '✅ detected',
  grammarJavaMissing: '❌ not found',
  grammarJavaOutdated:
    '⚠️ version {version} too old (17+ required)',
  grammarJavaMissingHint:
    'LanguageTool requires Java 17 or higher. Install it from java.com, then check again.',
  grammarJavaOutdatedHint:
    'LanguageTool requires Java 17 or higher; the installed version is too old to run it. Install Java 17+ (e.g. Eclipse Temurin), then check again.',
  grammarFolderLabel: 'LanguageTool folder:',
  grammarFolderNotSet: 'not configured',
  grammarSelectFolderBtn:
    '📂 Choose the LanguageTool folder…',
  grammarAutoInstallBtn:
    '📥 Install LanguageTool automatically (~200 MB)',
  grammarOrManualLabel: 'or manually',
  grammarOpenJavaBtn:
    '☕ Open java.com to install Java',
  grammarInstallDownloading:
    'Downloading LanguageTool… {percent}%',
  grammarInstallExtracting: 'Extracting the archive…',
  grammarInstallDone:
    '✅ LanguageTool installed successfully!',
  grammarInstallError:
    '❌ Automatic install failed: {error}',
  grammarDownloadHint:
    'Download LanguageTool Desktop/Server (languagetool-server.jar) from languagetool.org/download, unzip it anywhere, then select that folder here.',
  grammarInvalidFolder:
    'This folder does not contain a valid languagetool-server.jar file.',
  grammarRecheckBtn: '🔄 Recheck',
  grammarStatusChecking: 'Checking…',
  grammarStatusStarting:
    'Starting the local LanguageTool server…',
  grammarStatusReady:
    '✅ LanguageTool server running (offline, port {port}).',
  grammarStatusError:
    '❌ Could not start LanguageTool: {error}',
  grammarStatusDisabled: 'Grammar checking is disabled.',
  grammarCheckFailedAlert:
    'Grammar checking failed and was disabled: {error}\n\nFix the issue then click "Recheck" in Settings.',
  grammarIgnoreBtn: 'Ignore',
  grammarNoSuggestions: 'No suggestions',
  grammarScanningTooltip: 'Checking grammar…',
  grammarStatusBarReady: 'Grammar ✓',
  grammarStatusBarReadyTitle:
    'Grammar checking active (click to configure)',
  grammarStatusBarStarting: 'Grammar…',
  grammarStatusBarStartingTitle:
    'Starting the LanguageTool server…',
  grammarStatusBarError: 'Grammar ⚠',
  grammarStatusBarErrorTitle:
    'Grammar checking enabled but unavailable (click to diagnose)',

  // -------------------------------------------------------------------------
  // ALERTS AND ERRORS
  // -------------------------------------------------------------------------

  nothingToExport: 'Nothing to export.',
  exportTxtSuccess: 'TXT export successful!',
  exportTxtError: 'Error during TXT export: ',
  exportMdSuccess: 'Markdown export successful!',
  exportMdError: 'Error during Markdown export: ',
  exportPdfSuccess: 'PDF export successful!',
  exportPdfError: 'Error during PDF export: ',
  exportDocxSuccess: 'DOCX export successful!',
  exportDocxError: 'Error during DOCX export: ',
  exportProjectError: 'Error during project export: ',
  confirmDeleteItem:
    'Do you really want to delete "{name}"?',
  replaceNoChapterOpen:
    'Open a chapter first, or check "whole project".',
  replaceNoneInChapter:
    'No occurrence found in this chapter.',
  replaceNoneInProject:
    'No occurrence found in the project.',
  replaceDoneInChapter:
    '{count} occurrence(s) replaced.',
  replaceDoneInProject:
    '{count} occurrence(s) replaced across {chapters} chapter(s).',
  loadingBackups: 'Loading...',
  itemNotFound: 'Item not found (deleted?)',
  initErrorPrefix:
    'An error occurred while loading the editor:\n\n',
  initErrorSuffix:
    '\n\nOpen the console (Ctrl+Shift+I) for more details.',
  menuInitErrorPrefix:
    'An error occurred while loading the project list:\n\n'
};

export const dict = { fr, en };
