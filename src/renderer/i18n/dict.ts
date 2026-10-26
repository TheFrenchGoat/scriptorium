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
  renameWbMentionsWarningScenes:
    'Renommer "{oldName}" en "{newName}" remplacera aussi ce nom partout où il apparaît dans le texte de {count} scène(s). Continuer ?',

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
  renameProjectHint: 'Double-cliquer pour renommer le projet',
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
  projectTypeNovel: 'Roman',
  projectTypeScreenplay: 'Scénario',
  projectStatsScreenplay: '{scenes} scènes • {words} mots',

  // -------------------------------------------------------------------------
  // EN-TÊTE ÉDITEUR
  // -------------------------------------------------------------------------

  exportMenuBtn: '📤 Exporter ▾',
  exportTxtItem: '📄 Texte (.txt)',
  exportMdItem: '📑 Markdown (.md)',
  exportPdfItem: '📕 PDF (.pdf)',
  exportDocxItem: '📝 Word (.docx)',
  exportOdtItem: '\uD83D\uDCC4 OpenDocument (.odt)',
  exportProjectItem: '💾 Projet complet (.scriptorium)',
  displayPrefsBtn: '⚙️ Affichage',
  displayPrefsBtnTitle:
    "Personnaliser l'affichage de la page d'écriture",
  rulerMarginLeftTitle:
    'Marge gauche (glisser pour ajuster)',
  rulerMarginRightTitle:
    'Marge droite (glisser pour ajuster)',
  rulerIndentTitle:
    'Retrait de première ligne (glisser pour ajuster)',
  backToProjects: 'Retour aux projets',

  // -------------------------------------------------------------------------
  // MINUTEUR ET SESSIONS
  // -------------------------------------------------------------------------

  timerBtn: '⏱ Timer',
  timerPauseTitle: 'Mettre en pause',
  timerStopTitle: 'Arrêter le timer',
  timerFinished: 'Fini !',
  timerFinishedTitle: '⏱ Minuteur terminé',

  sessionManualButton: '✍ Session',
  sessionManualStartTitle:
    'Démarrer une session sans minuteur',
  sessionResumeTitle: 'Reprendre la session',
  sessionStopTitle:
    'Terminer et enregistrer la session',
  sessionFinishedTitle: 'Session terminée',
  sessionBtn: '⏱ Session',
  sessionBtnTitle: 'Session d’écriture et statistiques',
  sessionBtnRunning: '⏱ {time} · {words}',
  sessionBtnPaused: '⏸ {time} · {words}',
  sessionPanelTitle: 'Session d’écriture',
  sessionPanelIdle: 'Aucune session en cours',
  sessionStateRunning: 'En cours',
  sessionStatePaused: 'En pause',
  sessionStateTimeUp: 'Temps écoulé',
  sessionTimerLabel: 'Minuteur (facultatif)',
  sessionTimerNone: 'Aucun',
  sessionRemainingLabel: 'Restant',
  sessionStartBtn: '▶ Démarrer',
  sessionPauseBtn: '⏸ Pause',
  sessionResumeBtn: '▶ Reprendre',
  sessionFinishBtn: '⏹ Terminer',
  sessionContinueBtn: 'Continuer',
  sessionTimeUpMessage: 'Le temps prévu est écoulé. La session continue de compter vos mots tant que vous ne la terminez pas.',
  sessionSkipFeedback: 'Ignorer le ressenti',
  sessionSaveFeedback: 'Enregistrer la session',
  sessionFeedbackIntro:
    'Votre session a été enregistrée. Vous pouvez maintenant ajouter votre ressenti.',
  sessionDurationLabel: 'Durée',
  sessionWordsLabel: 'Mots écrits',
  sessionDocumentLabel: 'Documents travaillés',
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
  settingsSectionWriting: 'Écriture',
  settingsSectionCorrection: 'Correction',
  settingsSectionUpdates: 'Mises à jour',
  settingsSectionBackups: 'Sauvegardes',
  settingsSectionHelp: 'Aide',
  updateInstalledVersion: 'Version installée :',
  updateChecking: 'Vérification en cours…',
  updateCheckError: 'Impossible de vérifier les mises à jour.',
  updateStatusUpToDate: 'Vous utilisez la dernière version.',
  updateStatusAvailable: 'La version {version} est disponible.',
  updateStatusDownloading: 'Téléchargement en cours… {percent} %',
  updateStatusDownloaded: 'La version {version} est téléchargée : elle sera installée au redémarrage.',
  updateDownloadFailed: 'Le téléchargement de la mise à jour a échoué.',
  updateDownloadErrorMessage: 'Le téléchargement de la mise à jour a échoué : {error}',
  updateDownloadingToast: 'Téléchargement de la mise à jour… {percent} %',
  updateRetryBtn: 'Réessayer',
  settingsSectionTimer: 'Minuteur',
  settingsSectionSessions: 'Sessions d’écriture',

  timerSoundEnabledLabel:
    '🔔 Son de fin de minuteur',
  timerSoundChoiceLabel: 'Sonnerie',
  timerVolumeLabel: 'Volume',
  timerVolumeTestBtn: '🔊 Tester',

  sessionScaleDescription:
    'Choisissez l’échelle utilisée pour noter votre concentration et votre énergie à la fin d’une session.',
  sessionConcentrationScaleLabel:
    'Échelle de concentration',
  sessionEnergyScaleLabel:
    'Échelle d’énergie',

  // -------------------------------------------------------------------------
  // AIDE
  // -------------------------------------------------------------------------

  helpModalTitle: 'Raccourcis clavier',
  shortcutSave: 'Enregistrer',
  shortcutUndo: 'Annuler',
  shortcutRedo: 'Rétablir',
  shortcutBold: 'Gras',
  shortcutItalic: 'Italique',
  shortcutUnderline: 'Souligné',
  shortcutZoom: 'Zoom de la page',
  shortcutWbOpen:
    'Ouvrir une fiche World Building',
  shortcutAlign:
    'Aligner (gauche/centre/droite/justifié)',
  shortcutAccents:
    'Accents (façon Word) : `/\'/^/¨ + voyelle, , + c',
  shortcutReplace: 'Rechercher / Remplacer',
  shortcutGlobalSearch: 'Recherche globale',
  shortcutSwitchTab:
    'Onglet suivant / précédent',
  shortcutZoomKeys:
    'Zoom avant / arrière / réinitialiser',
  shortcutCloseTab: "Fermer l'onglet actif",
  shortcutMiddleClose: 'Fermer un onglet',
  shortcutNavigate: 'Naviguer sans souris',
  shortcutActivate:
    'Activer un élément survolé au clavier',
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
  globalSearchBtnTitle:
    'Rechercher dans tout le projet',
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

  sidebarCollapseChapters:
    'Fermer le panneau des chapitres',
  sidebarExpandChapters:
    'Ouvrir le panneau des chapitres',
  sidebarCollapseWorld:
    'Fermer le panneau World Building',
  sidebarExpandWorld:
    'Ouvrir le panneau World Building',

  wbLabel_character: 'Personnage',
  wbLabel_place: 'Lieu',
  wbLabel_object: 'Objet',
  wbLabel_animal: 'Animal',
  wbLabel_other: 'Autre',

  wbNewCustomTypeBtn: 'Nouveau type…',
  customTypeModalTitle:
    'Nouveau type de fiche',
  customTypeNameLabel: 'Nom du type',
  customTypeNamePlaceholder:
    'ex : Faction, Créature, Artefact…',
  customTypeIconLabel: 'Icône',
  customTypeColorLabel: 'Couleur par défaut',
  customTypeFieldsLabel:
    'Champs de la fiche',
  customTypeAddFieldBtn:
    '+ Ajouter un champ',
  customTypeFieldLabelPlaceholder:
    'Nom du champ',
  customTypeFieldTypeText: 'Ligne simple',
  customTypeFieldTypeTextarea: 'Texte long',
  customTypeFieldTypeNumber: 'Nombre',
  customTypeFieldTypeSelect: 'Liste de choix',
  customTypeFieldTypeReference:
    'Référence à une fiche',
  customTypeRemoveFieldTitle:
    'Retirer ce champ',
  customTypeDefaultFieldLabel: 'Description',
  customTypeNameRequired:
    'Donnez un nom à ce type de fiche.',
  customTypeFieldsRequired:
    'Ajoutez au moins un champ avec un nom.',
  customTypeFieldsHint:
    'Chaque champ est une information de la fiche (comme "Prénom" ou "Âge" pour un Personnage). Ajoutez-en autant que nécessaire ; le ✕ retire un champ que vous ne voulez plus.',
  customTypeDuplicateField:
    'Le champ "{label}" est utilisé plusieurs fois : donnez un nom différent à chacun.',
  customTypeEditTitle: 'Modifier ce type',
  customTypeDeleteTitle: 'Supprimer ce type',
  customTypeEditModalTitle:
    'Modifier le type de fiche',
  customTypeDeleteBlocked:
    'Impossible de supprimer "{label}" : {count} fiche(s) utilisent encore ce type. Supprimez-les ou changez leur type d\'abord.',
  customTypeConfirmDelete:
    'Supprimer définitivement le type "{label}" ? Cette action est irréversible.',
  customTypeOptionsLabel:
    'Choix proposés (un par ligne)',
  customTypeOptionsPlaceholder:
    'ex :\nAllié\nNeutre\nEnnemi',
  customTypeOptionsRequired:
    'La liste de choix "{label}" doit proposer au moins un choix.',
  customTypeReferenceLabel: 'Fiches proposées',
  customTypeReferenceAll: 'Toutes les fiches',

  wbIconInputTitle:
    'Icône de la fiche (change dans la sidebar et les onglets)',
  wbIconCustomPlaceholder: 'Autre…',
  wbIconCustomApply: 'OK',
  wbIconPhotoChoose: 'Choisir une photo…',
  wbIconPhotoRemove: 'Retirer la photo',
  wbColorLabel:
    'Couleur de surlignage dans le texte',
  wbMentionedInLabel: '📖 Mentionné dans',
  wbMentionedInNone:
    'Pas encore mentionné dans un chapitre.',
  wbMentionedInNoneScenes:
    'Pas encore mentionné dans une scène.',
  wbReadModeTitle:
    'Basculer en mode lecture (fige la fiche contre les modifications accidentelles)',
  wbReadModeLabel: 'Mode lecture',

  wbAliasesLabel: 'Alias',
  wbAliasesPlaceholder:
    'ex : Jeannot, le Vieux Jean',
  wbAliasesHint:
    'Autres noms sous lesquels cette fiche apparaît dans le texte, séparés par des virgules. Ils sont surlignés comme le nom.',
  wbAliasConflict:
    'L’alias "{alias}" est déjà utilisé par la fiche "{name}". Choisissez-en un autre.',

  wbSelectEmpty: '—',
  wbSelectRemovedOption:
    '{value} (choix retiré)',
  wbReferenceNone: '— Aucune —',
  wbReferenceMissing: 'Fiche introuvable',
  wbReferenceOpenTitle:
    'Ouvrir la fiche liée (Ctrl+clic : dans un onglet)',

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
  // PANNEAU DES FICHES
  // -------------------------------------------------------------------------

  wbPanelTitle: 'Fiches',
  wbPanelEmpty:
    'Cliquez sur un nom surligné dans le texte pour afficher sa fiche ici. Ctrl+clic l’ouvre dans un onglet.',
  wbPanelOpenInTab: '↗ Ouvrir en onglet',
  wbPanelBackToList: '← Toutes les fiches',
  wbPanelSearchPlaceholder:
    'Rechercher une fiche (nom ou alias)…',
  wbPanelFilterAll: 'Tous les types',
  wbPanelNoResults:
    'Aucune fiche ne correspond à la recherche.',
  wbPanelNoSheets:
    'Aucune fiche pour le moment.',

  // -------------------------------------------------------------------------
  // VUE EN CARTES
  // -------------------------------------------------------------------------

  wbCardsTitle: 'Toutes les fiches',
  wbCardsSearchPlaceholder:
    'Rechercher (nom, alias ou contenu des fiches)…',
  wbCardsFilterAll: 'Tous les types',
  wbCardsFilterLabel: 'Type',
  wbCardsSortLabel: 'Trier par',
  wbCardsSortName: 'Nom',
  wbCardsSortType: 'Type',
  wbCardsSortDate: 'Date',
  wbCardsSortReverseTitle: 'Inverser l’ordre',
  wbCardsGroupByType: 'Grouper par type',
  wbCardsSizeLabel: 'Taille des cartes',
  wbCardsSizeSmall: 'Petites',
  wbCardsSizeMedium: 'Moyennes',
  wbCardsSizeLarge: 'Grandes',
  wbCardsCount: '{count} fiche(s)',
  wbCardsCountFiltered: '{shown} sur {total} fiche(s)',
  wbCardsEmpty:
    'Aucune fiche pour le moment. Créez-en une avec le bouton + de la section World Building.',
  wbCardsNoResults:
    'Aucune fiche ne correspond à la recherche ou au filtre.',
  wbCardsResetFilters: 'Effacer la recherche et les filtres',
  wbCardsFilled: '{filled}/{total} champs',
  wbCardsFilledTitle:
    'Nombre de champs remplis dans cette fiche',
  wbCardsNoContent: 'Fiche encore vide.',
  wbCardsCardTitle:
    'Clic : ouvrir à gauche • Ctrl+clic : ouvrir dans un onglet',
  wbCardsGroupCount: '{count} fiche(s)',

  // -------------------------------------------------------------------------
  // VUE RELATIONS
  // -------------------------------------------------------------------------

  wbRelTitle: 'Relations',
  wbRelTabGraph: 'Graphe',
  wbRelTabTree: 'Arbre généalogique',
  wbRelAdd: '+ Relation',
  wbRelAddTitle: 'Créer une relation entre deux fiches',
  wbRelModalAddTitle: 'Nouvelle relation',
  wbRelModalEditTitle: 'Modifier la relation',
  wbRelSourceLabel: 'Fiche de départ',
  wbRelTypeLabel: 'Type de relation',
  wbRelTargetLabel: 'Fiche liée',
  wbRelNoteLabel: 'Note (facultative)',
  wbRelNotePlaceholder:
    'ex : se sont rencontrés pendant la guerre',
  wbRelSwap: '⇅ Inverser',
  wbRelSwapTitle:
    'Échanger la fiche de départ et la fiche liée',
  wbRelPreview: '« {source} » → {label} → « {target} »',
  wbRelSelectItem: '— Choisir une fiche —',
  wbRelSelectRequired:
    'Choisissez les deux fiches à relier.',
  wbRelSameItem:
    'Une fiche ne peut pas être reliée à elle-même.',
  wbRelDuplicate:
    'Cette relation existe déjà entre ces deux fiches.',
  wbRelEdit: '✏️ Modifier',
  wbRelDelete: '🗑 Supprimer',
  wbRelConfirmDelete:
    'Supprimer la relation entre "{source}" et "{target}" ?',
  wbRelEmpty:
    'Aucune relation pour le moment. Cliquez sur « + Relation » pour relier deux fiches.',
  wbRelNoSheets:
    'Il faut au moins deux fiches pour créer une relation.',
  wbRelNoMatch:
    'Aucune relation ne correspond aux filtres.',
  wbRelFilterTypeLabel: 'Fiches',
  wbRelFilterKindLabel: 'Relations',
  wbRelFilterAll: 'Toutes',
  wbRelShowIsolated:
    'Afficher les fiches sans relation',
  wbRelResetLayout: '↻ Réorganiser',
  wbRelResetLayoutTitle:
    'Recalculer la disposition (oublie les positions déplacées à la main)',
  wbRelZoomIn: 'Zoom avant',
  wbRelZoomOut: 'Zoom arrière',
  wbRelFit: 'Tout afficher',
  wbRelGraphHint:
    'Clic : ouvrir la fiche • Ctrl+clic : onglet • Clic droit sur un lien : modifier • Molette : zoom • Glisser le fond : se déplacer',
  wbRelTreeRootLabel: 'Personne de départ',
  wbRelTreeEmpty:
    'Choisissez une personne pour afficher son arbre.',
  wbRelTreeNoFamily:
    'Aucun lien familial (parent, conjoint, frère ou sœur) pour le moment.',
  wbRelTreeHint:
    'Clic : ouvrir la fiche • Double-clic : centrer l’arbre sur cette personne',
  wbRelCount: '{count} relation(s)',
  wbRelEdgeTitle:
    'Clic droit : modifier ou supprimer',

  // -------------------------------------------------------------------------
  // ESPACE ATELIER
  // -------------------------------------------------------------------------

  wbWsBtn: '🧭 Atelier',
  wbWsBtnTitle:
    'Ouvrir l’atelier World Building (cartes, relations, frise)',
  wbWsTitle: 'Atelier',
  wbWsClose: 'Fermer l’atelier (Échap)',
  wbWsTabsLabel: 'Vues de l’atelier',
  wbWsTabCards: '▦ Cartes',
  wbWsTabRelations: '🕸 Relations',
  wbWsTabTimeline: '⏳ Frise',
  wbTlAdd: 'Nouvel événement',
  wbTlEmpty: 'Aucun événement pour l’instant. Créez le premier pour commencer la frise.',
  wbTlFilterLabel: 'Filtrer par fiche',
  wbTlFilterAll: 'Toutes les fiches',
  wbTlNoMatch: 'Aucun événement pour cette fiche.',
  wbTlUntitled: 'Événement sans titre',
  wbTlNoDate: 'Date non précisée',
  wbTlEdit: 'Modifier',
  wbTlDelete: 'Supprimer',
  wbTlDeleteConfirm: 'Supprimer cet événement ? Cette action est définitive.',
  wbTlMoveEarlier: 'Placer plus tôt',
  wbTlMoveLater: 'Placer plus tard',
  wbTlModalNew: 'Nouvel événement',
  wbTlModalEdit: 'Modifier l’événement',
  wbTlFieldTitle: 'Titre',
  wbTlFieldDate: 'Date (texte libre)',
  wbTlFieldDatePh: 'Ex. : An 342, printemps',
  wbTlFieldSortKey: 'Position chronologique',
  wbTlFieldSortKeyHint: 'Nombre servant uniquement au tri : plus il est petit, plus l’événement est tôt.',
  wbTlFieldDescription: 'Description',
  wbTlFieldItems: 'Fiches concernées',
  wbTlFieldItemsSearch: 'Rechercher une fiche…',
  wbTlFieldChapters: 'Chapitres où il est raconté',
  wbTlFieldColor: 'Couleur',
  wbTlColorNone: 'Aucune',
  wbTlSave: 'Enregistrer',
  wbTlCancel: 'Annuler',
  // Atelier : annuler / rétablir (Ctrl+Z / Ctrl+Y)
  wbHistUndone: 'Annulé : {action}',
  wbHistRedone: 'Rétabli : {action}',
  wbHistNothingUndo: 'Rien à annuler',
  wbHistNothingRedo: 'Rien à rétablir',
  wbHistTlCreate: 'nouvel événement',
  wbHistTlEdit: 'événement modifié',
  wbHistTlDelete: 'événement supprimé',
  wbHistTlMove: 'événement déplacé',
  wbHistRelCreate: 'nouvelle relation',
  wbHistRelEdit: 'relation modifiée',
  wbHistRelDelete: 'relation supprimée',
  wbHistRelMoveNode: 'fiche déplacée',
  wbHistRelLayout: 'réorganisation du graphe',
  wbHistItemCreate: 'fiche créée',
  wbHistItemDelete: 'fiche supprimée',
  wbHistItemRename: 'fiche renommée',
  wbHistItemEdit: 'fiche modifiée',
  wbHistItemIcon: 'icône modifiée',
  wbHistItemColor: 'couleur modifiée',
  wbHistItemAliases: 'alias modifiés',
  wbHistItemReorder: 'fiches réordonnées',
  wbHistCategoryCreate: 'catégorie créée',
  wbHistCategoryEdit: 'catégorie modifiée',
  wbHistCategoryDelete: 'catégorie supprimée',

  // -------------------------------------------------------------------------
  // BARRE DE STATUT
  // -------------------------------------------------------------------------

  loadMusicTitle: 'Charger des musiques',
  noTrack: 'Aucune musique',
  prevTrackTitle: 'Piste précédente',
  playPauseTitle: 'Lecture / Pause',
  nextTrackTitle: 'Piste suivante',

  statsNormal:
    '{words} mots | {chars} car. | Total: {total} m',
  statsSelected:
    '{words} mots sél. | {chars} car. sél. | Total: {total} m',
  statsSheetMode: 'Mode Fiche',

  saveStatusPending:
    '● Modifications non enregistrées',
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
  timerCustomLabel:
    'Ou durée personnalisée (minutes)',
  timerCustomPlaceholder: 'ex : 45',

  replaceModalTitle: 'Rechercher / Remplacer',
  findPlaceholder: 'Rechercher...',
  replacePlaceholder: 'Remplacer par...',
  replaceScopeAllLabel:
    'Remplacer dans tout le projet (tous les chapitres)',
  replaceAllBtn: 'Tout remplacer',

  globalSearchModalTitle:
    'Recherche dans tout le projet',
  globalSearchPlaceholder:
    'Rechercher un mot, un nom, une phrase...',
  globalSearchHint:
    'Tapez au moins un caractère pour lancer la recherche.',
  globalSearchNoResults: 'Aucun résultat.',
  occurrences: '{count} occurrence(s)',

  displayPrefsTitle:
    "Affichage de la page d'écriture",
  prefWidthLabel: 'Largeur de page',
  prefWidthNarrow:
    'Étroite (confort de lecture)',
  prefWidthNormal: 'Normale',
  prefWidthLarge: 'Large',
  prefWidthXLarge: 'Très large',
  prefFontLabel: 'Police de lecture',
  prefLineHeightLabel: 'Interligne',
  settingsPreviewLabel: 'Aperçu',
  settingsPreviewSample: 'Il était une fois, au bord d’une mer grise, une petite ville où personne ne fermait jamais sa porte. Les soirs d’hiver, on s’y racontait des histoires jusqu’à ce que la dernière bougie s’éteigne.',
  prefLineCompact: 'Compact (1.4)',
  prefLineNormal: 'Normal (1.6)',
  prefLineAiry: 'Aéré (1.8)',
  prefLineVeryAiry: 'Très aéré (2.2)',
  prefUiFontSizeLabel:
    "Taille du texte de l'interface",
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
  statsModalTitle:
    "Statistiques et journal d'écriture",

  statsTabOverview: 'Vue d’ensemble',
  statsTabSessions: 'Historique',
  statsTabGoals: 'Objectifs',

  statsGoalLabel:
    '🎯 Objectif quotidien (mots)',
  statsGoalPlaceholder: 'ex : 500',
  statsGoalSaveBtn: 'Enregistrer',
  statsGoalProgress:
    '{words} / {goal} mots aujourd’hui',

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
  statsAverageConcentration:
    'Concentration moyenne',
  statsAverageEnergy: 'Énergie moyenne',

  statsStreakTitle: 'Séries d’écriture',
  statsCurrentStreak: 'Série actuelle',
  statsLongestStreak: 'Meilleure série',
  statsActiveDays: 'Jours actifs',
  statsStreakDays:
    '{count} jour(s) d’écriture consécutif(s)',

  statsWritingCalendar:
    'Calendrier d’écriture',
  statsCalendarWords: 'Mots',
  statsCalendarDuration: 'Durée',
  statsCalendarPreviousMonth:
    'Mois précédent',
  statsCalendarNextMonth: 'Mois suivant',
  statsCalendarToday: 'Aujourd’hui',

  statsActivityByDay: 'Activité par jour',
  statsActivityByHour:
    'Activité selon l’heure',
  statsProductivityByWeekday:
    'Productivité selon le jour',
  statsConcentrationByHour:
    'Concentration selon l’heure',
  statsMoodProductivity:
    'Humeur et productivité',

  statsSessionHistory:
    'Historique des sessions',
  statsSessionProject: 'Projet',
  statsSessionDocument: 'Documents',
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
  statsSessionDetails:
    'Détails de la session',
  statsDeleteSession:
    'Supprimer cette session',
  statsConfirmDeleteSession:
    'Supprimer définitivement cette session de l’historique ?',
  statsNoSessions:
    'Aucune session d’écriture pour cette période.',

  statsSessionChapterBreakdown:
    'Mots écrits par chapitre',
  statsSessionChapterWordsBefore:
    'Mots au début',
  statsSessionChapterWordsAfter:
    'Mots à la fin',
  statsSessionChapterWordsWritten:
    'Variation',

  loadingStats:
    'Chargement des statistiques…',
  statsNoData:
    "Pas encore de données d'écriture.",

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
  goalProgressMode:
    'Calcul de la progression',
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
  goalDaysRemaining:
    '{days} jour(s) restant(s)',
  goalDueToday: 'Échéance aujourd’hui',
  goalOverdue:
    'En retard de {days} jour(s)',
  goalCompleted: 'Objectif terminé',
  goalWordsProgress:
    '{current} / {target} mots',

  // -------------------------------------------------------------------------
  // MISES À JOUR
  // -------------------------------------------------------------------------

  checkUpdatesMenuBtn:
    '🔄 Rechercher les mises à jour…',
  updateAvailableTitle:
    'Mise à jour disponible',
  updateAvailableMessage:
    'La version {version} de Scriptorium est disponible. Voulez-vous la télécharger et l’installer ?',
  updateDownloadBtn:
    'Télécharger et installer',
  updateLaterBtn: 'Plus tard',
  updateReadyTitle: 'Mise à jour prête',
  updateReadyMessage:
    'La version {version} a été téléchargée. Elle sera installée au prochain démarrage. Redémarrer maintenant ?',
  updateRestartNowBtn:
    'Redémarrer maintenant',
  updateUpToDateTitle: 'Mises à jour',
  updateUpToDateMessage:
    'Vous utilisez déjà la dernière version.',
  updateErrorTitle: 'Mises à jour',
  updateErrorMessage:
    'Impossible de vérifier les mises à jour : {error}',

  // -------------------------------------------------------------------------
  // SAUVEGARDES
  // -------------------------------------------------------------------------

  backupsModalTitle:
    'Sauvegardes automatiques',
  backupsDescription:
    "Une sauvegarde horodatée est créée automatiquement pendant que vous travaillez. Restaurer une version antérieure remplace le contenu actuel du projet (une sauvegarde de l'état actuel est créée avant, par sécurité).",
  backupNoneYet:
    'Aucune sauvegarde pour le moment. Elles se créent automatiquement pendant que vous écrivez.',
  backupRestoreBtn: 'Restaurer',
  backupConfirmRestore:
    "Restaurer la sauvegarde du {date} ?\n\nLe contenu actuel du projet sera remplacé (une sauvegarde de l'état actuel sera créée juste avant, par sécurité).",
  backupRestoreSuccess:
    'Sauvegarde restaurée avec succès.',
  backupRestoreError:
    'Erreur lors de la restauration : ',
  unknownDate: 'Date inconnue',

  // -------------------------------------------------------------------------
  // CORRECTEUR DE GRAMMAIRE
  // -------------------------------------------------------------------------

  grammarSubmenuLabel: '✔️ Grammaire',
  nativeSpellcheckLabel:
    '🔤 Correcteur orthographique natif',
  grammarToggleLabel:
    'Correction grammaticale',
  grammarConfigureBtn: 'Configurer…',
  grammarPickyLabel: 'Correction exigeante (style, typographie, répétitions)',
  grammarInstallFromEditor:
    "L'installation de LanguageTool se fait depuis l'éditeur.",
  grammarModalTitle:
    'Correcteur de grammaire (LanguageTool)',
  grammarModalIntro:
    "Scriptorium peut utiliser LanguageTool en local, entièrement hors ligne, pour détecter les fautes de grammaire, d'accord et de conjugaison (en plus du correcteur d'orthographe déjà intégré).",
  grammarEnableLabel:
    'Activer la correction grammaticale',
  grammarJavaLabel: 'Java :',
  grammarJavaOk: '✅ détecté',
  grammarJavaMissing: '❌ introuvable',
  grammarJavaOutdated:
    '⚠️ version {version} trop ancienne (17+ requis)',
  grammarJavaMissingHint:
    'LanguageTool nécessite Java 17 ou supérieur. Installez-le depuis java.com, puis relancez la vérification.',
  grammarJavaOutdatedHint:
    'LanguageTool nécessite Java 17 ou supérieur ; la version installée est trop ancienne et ne peut pas le faire fonctionner. Installez un Java 17+ (par ex. Eclipse Temurin), puis relancez la vérification.',
  grammarFolderLabel:
    'Dossier LanguageTool :',
  grammarFolderNotSet: 'non configuré',
  grammarSelectFolderBtn:
    '📂 Choisir le dossier LanguageTool…',
  grammarAutoInstallBtn:
    '📥 Installer LanguageTool automatiquement (~200 Mo)',
  grammarOrManualLabel: 'ou manuellement',
  grammarOpenJavaBtn:
    '☕ Ouvrir java.com pour installer Java',
  grammarInstallDownloading:
    'Téléchargement de LanguageTool… {percent}%',
  grammarInstallExtracting:
    "Extraction de l'archive…",
  grammarInstallDone:
    '✅ LanguageTool installé avec succès !',
  grammarInstallError:
    "❌ Échec de l'installation automatique : {error}",
  grammarDownloadHint:
    'Téléchargez LanguageTool Desktop/Server (languagetool-server.jar) depuis languagetool.org/download, dézippez-le où vous voulez, puis sélectionnez ce dossier ici.',
  grammarInvalidFolder:
    'Ce dossier ne contient pas de fichier languagetool-server.jar valide.',
  grammarRecheckBtn: '🔄 Revérifier',
  grammarStatusChecking:
    'Vérification en cours…',
  grammarStatusStarting:
    'Démarrage du serveur LanguageTool local…',
  grammarStatusReady:
    '✅ Serveur LanguageTool actif (hors ligne, port {port}).',
  grammarStatusError:
    '❌ Impossible de démarrer LanguageTool : {error}',
  grammarStatusDisabled:
    'Correction grammaticale désactivée.',
  grammarCheckFailedAlert:
    'La vérification grammaticale a échoué et a été désactivée : {error}\n\nCorrigez le problème puis cliquez sur "Revérifier" dans les Paramètres.',
  grammarIgnoreBtn: 'Ignorer',
  grammarNoSuggestions: 'Aucune suggestion',
  grammarScanningTooltip:
    'Vérification grammaticale…',
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
  exportTxtError:
    "Erreur lors de l'export TXT : ",
  exportMdSuccess: 'Export Markdown réussi !',
  exportMdError:
    "Erreur lors de l'export Markdown : ",
  exportTableOfContents: 'Table des matières',
  exportDocumentItem: 'Exporter le document…',
  exportModalTitle: 'Exporter le document',
  exportSectionDocument: 'Document',
  exportFormatLabel: 'Format de fichier',
  exportFormatPdf: 'PDF (.pdf)',
  exportFormatDocx: 'Word (.docx)',
  exportFormatTxt: 'Texte brut (.txt)',
  exportFormatMd: 'Markdown (.md)',
  exportTemplateLabel: 'Modèle',
  exportTemplateManuscript: 'Manuscrit standard',
  exportTemplateNovel: 'Roman (mise en page de livre)',
  exportTemplateHint: 'Changer de modèle remplace les réglages de mise en page.',
  exportSectionTitlePage: 'Page de titre',
  exportTitlePageEnabled: 'Ajouter une page de titre',
  exportTitleLabel: 'Titre',
  exportSubtitleLabel: 'Sous-titre',
  exportShowAuthor: "Afficher l'auteur",
  exportAuthorLabel: 'Auteur',
  exportAuthorPlaceholder: 'Votre nom ou pseudonyme',
  exportSectionContent: 'Contenu',
  exportChaptersLabel: 'Chapitres à exporter ({count}/{total})',
  exportCheckAll: 'Tout cocher',
  exportUncheckAll: 'Tout décocher',
  exportNoChapters: 'Ce projet ne contient aucun chapitre.',
  exportTocOption: 'Table des matières',
  exportChapterNewPage: 'Chaque chapitre commence sur une nouvelle page',
  exportSceneSeparators: 'Remplacer les séparateurs de scène (***, #…) par',
  exportSeparatorBlank: 'Ligne vide',
  exportIgnoreEmptyLines: 'Ignorer les lignes vides entre les paragraphes',
  exportKeepFormatting: "Garder les polices, tailles et couleurs de l'éditeur",
  exportSectionLayout: 'Mise en page',
  exportLayoutTextHint: "La mise en page ne s'applique qu'aux formats PDF et Word.",
  exportPageSize: 'Format de page',
  exportPageA4: 'A4',
  exportPageA5: 'A5',
  exportPageLetter: 'Lettre US',
  exportFontFamily: 'Police',
  exportFontSize: 'Taille du texte (pt)',
  exportLineHeight: 'Interligne',
  exportLineSingle: 'Simple (1)',
  exportLine115: '1,15',
  exportLine15: '1,5',
  exportLineDouble: 'Double (2)',
  exportLineCustom: 'Autre valeur…',
  exportLineCustomValue: "Valeur d'interligne",
  exportMargins: 'Marges (cm)',
  exportIndent: 'Retrait de première ligne (cm)',
  exportJustify: 'Texte justifié',
  exportPageNumbers: 'Numéros de page',
  exportRunningHeader: 'Auteur et titre en haut des pages',
  exportCancelBtn: 'Annuler',
  exportConfirmBtn: 'Exporter',
  exportPreviewTitle: 'Aperçu',
  exportPreviewHint: "Aperçu approximatif : le texte n'est pas découpé en pages, et les numéros de page et l'en-tête n'apparaissent que dans le fichier final.",
  exportPreviewTruncated: 'Seul le début du document est affiché.',
  exportPreviewNoLayout: "Pas d'aperçu pour le texte brut et le Markdown : ces formats n'ont pas de mise en page.",
  exportPreviewError: "L'aperçu n'a pas pu être affiché. L'export reste possible.",
  exportFormatOdt: 'OpenDocument (.odt)',
  exportOdtSuccess: 'Export ODT réussi !',
  exportOdtError:
    "Erreur lors de l'export ODT : ",
  exportSectionBible: 'Bible de l’univers',
  exportBibleMode: 'Inclure la bible',
  exportBibleModeNone: 'Non',
  exportBibleModeAppendix: 'En annexe, après le roman',
  exportBibleModeOnly: 'Seule (sans les chapitres)',
  exportBibleCategories: 'Catégories à inclure :',
  exportBiblePortraits: 'Portraits (aperçu, PDF, Word et ODT)',
  exportBibleRelations: 'Relations entre les fiches',
  exportBibleTimeline: 'Événements de la chronologie',
  exportBibleTitle: 'Bible de l’univers',
  exportBibleRelationsTitle: 'Relations',
  exportBibleTimelineTitle: 'Chronologie',
  exportBibleEmpty: 'Aucune fiche dans la bible de l’univers.',
  exportInProgress: 'Export en cours…',
  exportAlreadyRunning: 'Un export est déjà en cours. Patientez jusqu’à la fin.',
  whatsNewTitle: 'Quoi de neuf ?',
  whatsNewIntro: 'Scriptorium a été mis à jour. Voici les nouveautés :',
  chapterStatusMenuTitle: 'État du chapitre',
  chapterStatusTodo: 'À écrire',
  chapterStatusDraft: 'Brouillon',
  chapterStatusRevision: 'En révision',
  chapterStatusDone: 'Terminé',
  chapterColorLabel: 'Couleur',
  chapterColorReset: 'Revenir à la couleur de l’état',
  chapterTargetLabel: 'Objectif de mots',
  chapterTargetPlaceholder: 'Aucun',
  chapterTargetUnit: 'mots',
  chapterTargetProgress: '{words} / {target} mots ({percent} %)',
  prefWbLinksLabel: 'Liens de la bible dans le texte',
  prefWbLinksHint:
    'Les noms des fiches sont colorés et cliquables, avec un aperçu au survol. Désactivé, le texte reste neutre, mais la liste « Mentionné dans » de chaque fiche continue de fonctionner.',
  sessionNewTitle: 'Nouvelle session',
  sessionPanelStatsLink: 'Statistiques et objectifs \u2192',
  sessionCurrentDocument: 'Chapitre : {name}',
  sessionReviewTitle: 'Bilan de la session',
  sessionMoodQuestion: 'Comment s’est passée cette session ?',
  sessionSkipShort: 'Passer',
  sessionReviewHint: 'La session est déjà enregistrée. Ces détails sont facultatifs.',
  focusModeBtn: 'Concentration',
  focusModeBtnTitle: 'Mode concentration : masque tout sauf la page (F11)',
  focusModeExit: 'Quitter',
  focusModeExitTitle: 'Quitter le mode concentration (F11 ou Échap)',
  prefFocusDimLabel: 'Mode concentration : estomper les autres paragraphes',
  autoRepTabSearch: 'Rechercher / Remplacer',
  autoRepTabAuto: 'Remplacements automatiques',
  autoRepEnabled: 'Activer les remplacements automatiques dans ce livre',
  autoRepHint: 'Quand vous terminez un mot de la liste (espace, ponctuation ou Entrée), il est remplacé. Ctrl+Z annule le remplacement. Chaque livre a sa propre liste.',
  autoRepFrom: 'Mot tapé',
  autoRepTo: 'Remplacé par',
  autoRepFromPlaceholder: 'ex : tjrs',
  autoRepToPlaceholder: 'ex : toujours',
  autoRepAdd: '+ Ajouter',
  autoRepDelete: 'Supprimer',
  autoRepEmpty: 'Aucun remplacement pour le moment.',
  autoRepWarnWord: 'Un seul mot, sans espace ni ponctuation : sinon il ne sera jamais remplacé.',
  autoRepWarnDuplicate: 'Ce mot est déjà dans la liste : seule la première ligne compte.',
  autoRepWarnEmpty: 'Le texte de remplacement est vide : cette ligne est ignorée.',
  exportPdfSuccess: 'Export PDF réussi !',
  exportPdfError:
    "Erreur lors de l'export PDF : ",
  exportDocxSuccess: 'Export DOCX réussi !',
  exportDocxError:
    "Erreur lors de l'export DOCX : ",
  exportProjectError:
    "Erreur lors de l'export du projet : ",
  confirmDeleteItem:
    'Voulez-vous vraiment supprimer "{name}" ?',
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
  itemNotFound:
    'Élément introuvable (supprimé ?)',
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
  renameWbMentionsWarningScenes:
    'Renaming "{oldName}" to "{newName}" will also replace this name everywhere it appears in the text of {count} scene(s). Continue?',

  // -------------------------------------------------------------------------
  // PROJECTS PAGE
  // -------------------------------------------------------------------------

  importProject: '📥 Import',
  importProjectTitle:
    'Import a .scriptorium file',
  newProject: '+ New Project',
  noProjects: 'No projects yet. Create one!',
  noProjectsHint:
    'Start writing your next story right now.',
  projectCountSubtitle: '{count} project(s)',
  newProjectModalTitle: 'New Project',
  projectNamePlaceholder: 'Project name',
  renameProjectHint: 'Double-click to rename the project',
  renameProjectModalTitle: 'Rename project',
  newNamePlaceholder: 'New name',
  optionRename: '✏️ Rename',
  optionExport: '📤 Export (.scriptorium)',
  optionDelete: '🗑 Delete project',
  projectOptionsTitle: 'Customize',
  projectStats:
    '{chapters} chapters • {words} words',
  projectGoalSummary:
    '🎯 {progress}% • {remaining}',
  projectGoalNoDeadline: 'no deadline',
  projectGoalDueToday: 'due today',
  projectGoalDaysRemaining:
    '{days} day(s) remaining',
  projectGoalDaysOverdue:
    '{days} day(s) overdue',
  confirmDeleteProject:
    'Do you really want to permanently delete the project "{name}"?',
  exportSuccess:
    'Project exported successfully!',
  exportError: 'Error during export: ',
  importSuccess:
    'Project "{name}" imported successfully!',
  importError:
    'Error during import: this file may not be a valid Scriptorium export.\n\n',
  defaultProjectName: 'Project',
  projectTypeNovel: 'Novel',
  projectTypeScreenplay: 'Screenplay',
  projectStatsScreenplay: '{scenes} scenes • {words} words',

  // -------------------------------------------------------------------------
  // EDITOR HEADER
  // -------------------------------------------------------------------------

  exportMenuBtn: '📤 Export ▾',
  exportTxtItem: '📄 Text (.txt)',
  exportMdItem: '📑 Markdown (.md)',
  exportPdfItem: '📕 PDF (.pdf)',
  exportDocxItem: '📝 Word (.docx)',
  exportOdtItem: '\uD83D\uDCC4 OpenDocument (.odt)',
  exportProjectItem:
    '💾 Full project (.scriptorium)',
  displayPrefsBtn: '⚙️ Display',
  displayPrefsBtnTitle:
    'Customize the writing page display',
  rulerMarginLeftTitle:
    'Left margin (drag to adjust)',
  rulerMarginRightTitle:
    'Right margin (drag to adjust)',
  rulerIndentTitle:
    'First-line indent (drag to adjust)',
  backToProjects: 'Back to projects',

  // -------------------------------------------------------------------------
  // TIMER AND WRITING SESSIONS
  // -------------------------------------------------------------------------

  timerBtn: '⏱ Timer',
  timerPauseTitle: 'Pause',
  timerStopTitle: 'Stop timer',
  timerFinished: 'Time is up!',
  timerFinishedTitle: '⏱ Timer finished',

  sessionManualButton: '✍ Session',
  sessionManualStartTitle:
    'Start a writing session without a timer',
  sessionResumeTitle: 'Resume the session',
  sessionStopTitle:
    'Finish and save the session',
  sessionFinishedTitle: 'Session finished',
  sessionBtn: '⏱ Session',
  sessionBtnTitle: 'Writing session and statistics',
  sessionBtnRunning: '⏱ {time} · {words}',
  sessionBtnPaused: '⏸ {time} · {words}',
  sessionPanelTitle: 'Writing session',
  sessionPanelIdle: 'No session in progress',
  sessionStateRunning: 'In progress',
  sessionStatePaused: 'Paused',
  sessionStateTimeUp: 'Time is up',
  sessionTimerLabel: 'Timer (optional)',
  sessionTimerNone: 'None',
  sessionRemainingLabel: 'Remaining',
  sessionStartBtn: '▶ Start',
  sessionPauseBtn: '⏸ Pause',
  sessionResumeBtn: '▶ Resume',
  sessionFinishBtn: '⏹ Finish',
  sessionContinueBtn: 'Keep going',
  sessionTimeUpMessage: 'The planned time is up. The session keeps counting your words until you finish it.',
  sessionSkipFeedback: 'Skip feedback',
  sessionSaveFeedback: 'Save session',
  sessionFeedbackIntro:
    'Your session has been saved. You can now add how you felt.',
  sessionDurationLabel: 'Duration',
  sessionWordsLabel: 'Words written',
  sessionDocumentLabel: 'Documents worked on',
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
  sessionMoodVeryDifficult:
    'Very difficult session',

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
  settingsSectionWriting: 'Writing',
  settingsSectionCorrection: 'Proofing',
  settingsSectionUpdates: 'Updates',
  settingsSectionBackups: 'Backups',
  settingsSectionHelp: 'Help',
  updateInstalledVersion: 'Installed version:',
  updateChecking: 'Checking…',
  updateCheckError: 'Unable to check for updates.',
  updateStatusUpToDate: 'You are using the latest version.',
  updateStatusAvailable: 'Version {version} is available.',
  updateStatusDownloading: 'Downloading… {percent}%',
  updateStatusDownloaded: 'Version {version} has been downloaded and will be installed on restart.',
  updateDownloadFailed: 'The update download failed.',
  updateDownloadErrorMessage: 'The update download failed: {error}',
  updateDownloadingToast: 'Downloading update… {percent}%',
  updateRetryBtn: 'Retry',
  settingsSectionTimer: 'Timer',
  settingsSectionSessions:
    'Writing sessions',

  timerSoundEnabledLabel:
    '🔔 Timer end sound',
  timerSoundChoiceLabel: 'Ringtone',
  timerVolumeLabel: 'Volume',
  timerVolumeTestBtn: '🔊 Test',

  sessionScaleDescription:
    'Choose the scale used to rate your concentration and energy at the end of a session.',
  sessionConcentrationScaleLabel:
    'Concentration scale',
  sessionEnergyScaleLabel: 'Energy scale',

  // -------------------------------------------------------------------------
  // HELP
  // -------------------------------------------------------------------------

  helpModalTitle: 'Keyboard shortcuts',
  shortcutSave: 'Save',
  shortcutUndo: 'Undo',
  shortcutRedo: 'Redo',
  shortcutBold: 'Bold',
  shortcutItalic: 'Italic',
  shortcutUnderline: 'Underline',
  shortcutZoom: 'Zoom the page',
  shortcutWbOpen:
    'Open a World Building sheet',
  shortcutAlign:
    'Align (left/center/right/justify)',
  shortcutAccents:
    'Accents (Word-style): `/\'/^/¨ + vowel, , + c',
  shortcutReplace: 'Find / Replace',
  shortcutGlobalSearch: 'Global search',
  shortcutSwitchTab: 'Next / previous tab',
  shortcutZoomKeys:
    'Zoom in / out / reset',
  shortcutCloseTab: 'Close the active tab',
  shortcutMiddleClose: 'Close a tab',
  shortcutNavigate:
    'Navigate without a mouse',
  shortcutActivate:
    'Activate a focused element',
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
  globalSearchBtnTitle:
    'Search across the whole project',
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

  sidebarCollapseChapters:
    'Close the chapters panel',
  sidebarExpandChapters:
    'Open the chapters panel',
  sidebarCollapseWorld:
    'Close the World Building panel',
  sidebarExpandWorld:
    'Open the World Building panel',

  wbLabel_character: 'Character',
  wbLabel_place: 'Place',
  wbLabel_object: 'Object',
  wbLabel_animal: 'Animal',
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
  customTypeFieldLabelPlaceholder:
    'Field name',
  customTypeFieldTypeText: 'Single line',
  customTypeFieldTypeTextarea: 'Long text',
  customTypeFieldTypeNumber: 'Number',
  customTypeFieldTypeSelect: 'Choice list',
  customTypeFieldTypeReference:
    'Link to a sheet',
  customTypeRemoveFieldTitle:
    'Remove this field',
  customTypeDefaultFieldLabel: 'Description',
  customTypeNameRequired:
    'Give this sheet type a name.',
  customTypeFieldsRequired:
    'Add at least one field with a name.',
  customTypeFieldsHint:
    'Each field is a piece of information on the sheet (like "First name" or "Age" for a Character). Add as many as you need; ✕ removes a field you no longer want.',
  customTypeDuplicateField:
    'The field "{label}" is used more than once: give each one a different name.',
  customTypeEditTitle: 'Edit this type',
  customTypeDeleteTitle: 'Delete this type',
  customTypeEditModalTitle:
    'Edit sheet type',
  customTypeDeleteBlocked:
    'Cannot delete "{label}": {count} sheet(s) still use this type. Delete them or change their type first.',
  customTypeConfirmDelete:
    'Permanently delete the "{label}" type? This cannot be undone.',
  customTypeOptionsLabel:
    'Choices (one per line)',
  customTypeOptionsPlaceholder:
    'e.g.\nAlly\nNeutral\nEnemy',
  customTypeOptionsRequired:
    'The choice list "{label}" must offer at least one choice.',
  customTypeReferenceLabel: 'Available sheets',
  customTypeReferenceAll: 'All sheets',

  wbIconInputTitle:
    'Sheet icon (updates in the sidebar and tabs)',
  wbIconCustomPlaceholder: 'Other…',
  wbIconCustomApply: 'OK',
  wbIconPhotoChoose: 'Choose a photo…',
  wbIconPhotoRemove: 'Remove photo',
  wbColorLabel:
    'Highlight color in the text',
  wbMentionedInLabel: '📖 Mentioned in',
  wbMentionedInNone:
    'Not mentioned in any chapter yet.',
  wbMentionedInNoneScenes:
    'Not mentioned in any scene yet.',
  wbReadModeTitle:
    'Switch to read mode (locks the sheet against accidental edits)',
  wbReadModeLabel: 'Read mode',

  wbAliasesLabel: 'Aliases',
  wbAliasesPlaceholder:
    'e.g. Johnny, Old John',
  wbAliasesHint:
    'Other names this sheet goes by in the text, separated by commas. They are highlighted just like the name.',
  wbAliasConflict:
    'The alias "{alias}" is already used by the sheet "{name}". Please choose another one.',

  wbSelectEmpty: '—',
  wbSelectRemovedOption:
    '{value} (removed choice)',
  wbReferenceNone: '— None —',
  wbReferenceMissing: 'Sheet not found',
  wbReferenceOpenTitle:
    'Open linked sheet (Ctrl+click: in a tab)',

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
  wbField_inhabitants:
    'Inhabitants / Wildlife',
  wbField_owner: 'Owner',
  wbField_power: 'Power / Purpose',

  // -------------------------------------------------------------------------
  // SHEETS PANEL
  // -------------------------------------------------------------------------

  wbPanelTitle: 'Sheets',
  wbPanelEmpty:
    'Click a highlighted name in the text to show its sheet here. Ctrl+click opens it in a tab.',
  wbPanelOpenInTab: '↗ Open in a tab',
  wbPanelBackToList: '← All sheets',
  wbPanelSearchPlaceholder:
    'Search a sheet (name or alias)…',
  wbPanelFilterAll: 'All types',
  wbPanelNoResults:
    'No sheet matches your search.',
  wbPanelNoSheets: 'No sheets yet.',

  // -------------------------------------------------------------------------
  // CARDS VIEW
  // -------------------------------------------------------------------------

  wbCardsTitle: 'All sheets',
  wbCardsSearchPlaceholder:
    'Search (name, alias or sheet content)…',
  wbCardsFilterAll: 'All types',
  wbCardsFilterLabel: 'Type',
  wbCardsSortLabel: 'Sort by',
  wbCardsSortName: 'Name',
  wbCardsSortType: 'Type',
  wbCardsSortDate: 'Date',
  wbCardsSortReverseTitle: 'Reverse order',
  wbCardsGroupByType: 'Group by type',
  wbCardsSizeLabel: 'Card size',
  wbCardsSizeSmall: 'Small',
  wbCardsSizeMedium: 'Medium',
  wbCardsSizeLarge: 'Large',
  wbCardsCount: '{count} sheet(s)',
  wbCardsCountFiltered: '{shown} of {total} sheet(s)',
  wbCardsEmpty:
    'No sheets yet. Create one with the + button in the World Building section.',
  wbCardsNoResults:
    'No sheet matches your search or filter.',
  wbCardsResetFilters: 'Clear search and filters',
  wbCardsFilled: '{filled}/{total} fields',
  wbCardsFilledTitle:
    'Number of filled fields in this sheet',
  wbCardsNoContent: 'This sheet is still empty.',
  wbCardsCardTitle:
    'Click: open on the left • Ctrl+click: open in a tab',
  wbCardsGroupCount: '{count} sheet(s)',

  // -------------------------------------------------------------------------
  // RELATIONS VIEW
  // -------------------------------------------------------------------------

  wbRelTitle: 'Relationships',
  wbRelTabGraph: 'Graph',
  wbRelTabTree: 'Family tree',
  wbRelAdd: '+ Relationship',
  wbRelAddTitle: 'Create a relationship between two sheets',
  wbRelModalAddTitle: 'New relationship',
  wbRelModalEditTitle: 'Edit relationship',
  wbRelSourceLabel: 'From sheet',
  wbRelTypeLabel: 'Relationship type',
  wbRelTargetLabel: 'Linked sheet',
  wbRelNoteLabel: 'Note (optional)',
  wbRelNotePlaceholder:
    'e.g. met during the war',
  wbRelSwap: '⇅ Swap',
  wbRelSwapTitle:
    'Swap the starting sheet and the linked sheet',
  wbRelPreview: '“{source}” → {label} → “{target}”',
  wbRelSelectItem: '— Choose a sheet —',
  wbRelSelectRequired:
    'Choose both sheets to link.',
  wbRelSameItem:
    'A sheet cannot be linked to itself.',
  wbRelDuplicate:
    'This relationship already exists between these two sheets.',
  wbRelEdit: '✏️ Edit',
  wbRelDelete: '🗑 Delete',
  wbRelConfirmDelete:
    'Delete the relationship between "{source}" and "{target}"?',
  wbRelEmpty:
    'No relationships yet. Click "+ Relationship" to link two sheets.',
  wbRelNoSheets:
    'You need at least two sheets to create a relationship.',
  wbRelNoMatch:
    'No relationship matches the filters.',
  wbRelFilterTypeLabel: 'Sheets',
  wbRelFilterKindLabel: 'Relationships',
  wbRelFilterAll: 'All',
  wbRelShowIsolated:
    'Show sheets without relationships',
  wbRelResetLayout: '↻ Rearrange',
  wbRelResetLayoutTitle:
    'Recompute the layout (forgets manually moved positions)',
  wbRelZoomIn: 'Zoom in',
  wbRelZoomOut: 'Zoom out',
  wbRelFit: 'Fit to view',
  wbRelGraphHint:
    'Click: open the sheet • Ctrl+click: tab • Right-click a link: edit • Wheel: zoom • Drag the background: pan',
  wbRelTreeRootLabel: 'Starting person',
  wbRelTreeEmpty:
    'Choose a person to display their tree.',
  wbRelTreeNoFamily:
    'No family links (parent, spouse, sibling) yet.',
  wbRelTreeHint:
    'Click: open the sheet • Double-click: center the tree on this person',
  wbRelCount: '{count} relationship(s)',
  wbRelEdgeTitle:
    'Right-click: edit or delete',

  // -------------------------------------------------------------------------
  // WORKSPACE
  // -------------------------------------------------------------------------

  wbWsBtn: '🧭 Workshop',
  wbWsBtnTitle:
    'Open the World Building workshop (cards, relationships, timeline)',
  wbWsTitle: 'Workshop',
  wbWsClose: 'Close the workshop (Esc)',
  wbWsTabsLabel: 'Workshop views',
  wbWsTabCards: '▦ Cards',
  wbWsTabRelations: '🕸 Relationships',
  wbWsTabTimeline: '⏳ Timeline',
  wbTlAdd: 'New event',
  wbTlEmpty: 'No events yet. Create the first one to start the timeline.',
  wbTlFilterLabel: 'Filter by entry',
  wbTlFilterAll: 'All entries',
  wbTlNoMatch: 'No events for this entry.',
  wbTlUntitled: 'Untitled event',
  wbTlNoDate: 'No date',
  wbTlEdit: 'Edit',
  wbTlDelete: 'Delete',
  wbTlDeleteConfirm: 'Delete this event? This cannot be undone.',
  wbTlMoveEarlier: 'Move earlier',
  wbTlMoveLater: 'Move later',
  wbTlModalNew: 'New event',
  wbTlModalEdit: 'Edit event',
  wbTlFieldTitle: 'Title',
  wbTlFieldDate: 'Date (free text)',
  wbTlFieldDatePh: 'E.g. Year 342, spring',
  wbTlFieldSortKey: 'Chronological position',
  wbTlFieldSortKeyHint: 'Number used only for sorting: the smaller it is, the earlier the event.',
  wbTlFieldDescription: 'Description',
  wbTlFieldItems: 'Related entries',
  wbTlFieldItemsSearch: 'Search entries…',
  wbTlFieldChapters: 'Chapters where it is told',
  wbTlFieldColor: 'Color',
  wbTlColorNone: 'None',
  wbTlSave: 'Save',
  wbTlCancel: 'Cancel',
  // Workspace: undo / redo (Ctrl+Z / Ctrl+Y)
  wbHistUndone: 'Undone: {action}',
  wbHistRedone: 'Redone: {action}',
  wbHistNothingUndo: 'Nothing to undo',
  wbHistNothingRedo: 'Nothing to redo',
  wbHistTlCreate: 'new event',
  wbHistTlEdit: 'event edited',
  wbHistTlDelete: 'event deleted',
  wbHistTlMove: 'event moved',
  wbHistRelCreate: 'new relationship',
  wbHistRelEdit: 'relationship edited',
  wbHistRelDelete: 'relationship deleted',
  wbHistRelMoveNode: 'item moved',
  wbHistRelLayout: 'graph rearranged',
  wbHistItemCreate: 'item created',
  wbHistItemDelete: 'item deleted',
  wbHistItemRename: 'item renamed',
  wbHistItemEdit: 'item edited',
  wbHistItemIcon: 'icon changed',
  wbHistItemColor: 'color changed',
  wbHistItemAliases: 'aliases changed',
  wbHistItemReorder: 'items reordered',
  wbHistCategoryCreate: 'category created',
  wbHistCategoryEdit: 'category edited',
  wbHistCategoryDelete: 'category deleted',

  // -------------------------------------------------------------------------
  // STATUS BAR
  // -------------------------------------------------------------------------

  loadMusicTitle: 'Load music',
  noTrack: 'No track',
  prevTrackTitle: 'Previous track',
  playPauseTitle: 'Play / Pause',
  nextTrackTitle: 'Next track',

  statsNormal:
    '{words} words | {chars} ch. | Total: {total} w',
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
  timerCustomLabel:
    'Or custom duration (minutes)',
  timerCustomPlaceholder: 'e.g. 45',

  replaceModalTitle: 'Find / Replace',
  findPlaceholder: 'Search...',
  replacePlaceholder: 'Replace with...',
  replaceScopeAllLabel:
    'Replace across the whole project (all chapters)',
  replaceAllBtn: 'Replace all',

  globalSearchModalTitle:
    'Search across the project',
  globalSearchPlaceholder:
    'Search for a word, a name, a phrase...',
  globalSearchHint:
    'Type at least one character to start searching.',
  globalSearchNoResults: 'No results.',
  occurrences: '{count} occurrence(s)',

  displayPrefsTitle: 'Writing page display',
  prefWidthLabel: 'Page width',
  prefWidthNarrow:
    'Narrow (reading comfort)',
  prefWidthNormal: 'Normal',
  prefWidthLarge: 'Large',
  prefWidthXLarge: 'Extra large',
  prefFontLabel: 'Reading font',
  prefLineHeightLabel: 'Line spacing',
  settingsPreviewLabel: 'Preview',
  settingsPreviewSample: 'Once upon a time, on the shore of a grey sea, there was a small town where no one ever locked their door. On winter evenings, people told each other stories until the last candle went out.',
  prefLineCompact: 'Compact (1.4)',
  prefLineNormal: 'Normal (1.6)',
  prefLineAiry: 'Airy (1.8)',
  prefLineVeryAiry: 'Very airy (2.2)',
  prefUiFontSizeLabel:
    'Interface text size',
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
  statsModalTitle:
    'Writing statistics and journal',

  statsTabOverview: 'Overview',
  statsTabSessions: 'History',
  statsTabGoals: 'Goals',

  statsGoalLabel:
    '🎯 Daily goal (words)',
  statsGoalPlaceholder: 'e.g. 500',
  statsGoalSaveBtn: 'Save',
  statsGoalProgress:
    '{words} / {goal} words today',

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
  statsAverageSession:
    'Average per session',
  statsAverageConcentration:
    'Average concentration',
  statsAverageEnergy: 'Average energy',

  statsStreakTitle: 'Writing streaks',
  statsCurrentStreak: 'Current streak',
  statsLongestStreak: 'Longest streak',
  statsActiveDays: 'Active days',
  statsStreakDays:
    '{count} consecutive writing day(s)',

  statsWritingCalendar: 'Writing calendar',
  statsCalendarWords: 'Words',
  statsCalendarDuration: 'Duration',
  statsCalendarPreviousMonth:
    'Previous month',
  statsCalendarNextMonth: 'Next month',
  statsCalendarToday: 'Today',

  statsActivityByDay: 'Activity by day',
  statsActivityByHour: 'Activity by hour',
  statsProductivityByWeekday:
    'Productivity by weekday',
  statsConcentrationByHour:
    'Concentration by hour',
  statsMoodProductivity:
    'Mood and productivity',

  statsSessionHistory: 'Session history',
  statsSessionProject: 'Project',
  statsSessionDocument: 'Documents',
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

  statsSessionChapterBreakdown:
    'Words written by chapter',
  statsSessionChapterWordsBefore:
    'Words at start',
  statsSessionChapterWordsAfter:
    'Words at end',
  statsSessionChapterWordsWritten:
    'Change',

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
  goalDaysRemaining:
    '{days} day(s) remaining',
  goalDueToday: 'Due today',
  goalOverdue: '{days} day(s) overdue',
  goalCompleted: 'Goal completed',
  goalWordsProgress:
    '{current} / {target} words',

  // -------------------------------------------------------------------------
  // UPDATES
  // -------------------------------------------------------------------------

  checkUpdatesMenuBtn:
    '🔄 Check for updates…',
  updateAvailableTitle: 'Update available',
  updateAvailableMessage:
    'Version {version} of Scriptorium is available. Do you want to download and install it?',
  updateDownloadBtn:
    'Download and install',
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
  backupRestoreSuccess:
    'Backup restored successfully.',
  backupRestoreError:
    'Error while restoring: ',
  unknownDate: 'Unknown date',

  // -------------------------------------------------------------------------
  // GRAMMAR CHECKER
  // -------------------------------------------------------------------------

  grammarSubmenuLabel: '✔️ Grammar',
  nativeSpellcheckLabel:
    '🔤 Native spellchecker',
  grammarToggleLabel: 'Grammar checking',
  grammarConfigureBtn: 'Configure…',
  grammarPickyLabel: 'Picky mode (style, typography, repetitions)',
  grammarInstallFromEditor:
    'LanguageTool is installed from the editor.',
  grammarModalTitle:
    'Grammar checker (LanguageTool)',
  grammarModalIntro:
    'Scriptorium can use LanguageTool locally, fully offline, to detect grammar, agreement and conjugation mistakes (in addition to the built-in spell checker).',
  grammarEnableLabel:
    'Enable grammar checking',
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
  grammarInstallExtracting:
    'Extracting the archive…',
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
  grammarStatusDisabled:
    'Grammar checking is disabled.',
  grammarCheckFailedAlert:
    'Grammar checking failed and was disabled: {error}\n\nFix the issue then click "Recheck" in Settings.',
  grammarIgnoreBtn: 'Ignore',
  grammarNoSuggestions: 'No suggestions',
  grammarScanningTooltip:
    'Checking grammar…',
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
  exportTxtSuccess:
    'TXT export successful!',
  exportTxtError: 'Error during TXT export: ',
  exportMdSuccess:
    'Markdown export successful!',
  exportMdError:
    'Error during Markdown export: ',
  exportTableOfContents: 'Contents',
  exportDocumentItem: 'Export document…',
  exportModalTitle: 'Export document',
  exportSectionDocument: 'Document',
  exportFormatLabel: 'File format',
  exportFormatPdf: 'PDF (.pdf)',
  exportFormatDocx: 'Word (.docx)',
  exportFormatTxt: 'Plain text (.txt)',
  exportFormatMd: 'Markdown (.md)',
  exportTemplateLabel: 'Template',
  exportTemplateManuscript: 'Standard manuscript',
  exportTemplateNovel: 'Novel (book layout)',
  exportTemplateHint: 'Changing the template replaces the layout settings.',
  exportSectionTitlePage: 'Title page',
  exportTitlePageEnabled: 'Add a title page',
  exportTitleLabel: 'Title',
  exportSubtitleLabel: 'Subtitle',
  exportShowAuthor: 'Show the author',
  exportAuthorLabel: 'Author',
  exportAuthorPlaceholder: 'Your name or pen name',
  exportSectionContent: 'Content',
  exportChaptersLabel: 'Chapters to export ({count}/{total})',
  exportCheckAll: 'Select all',
  exportUncheckAll: 'Deselect all',
  exportNoChapters: 'This project has no chapters.',
  exportTocOption: 'Table of contents',
  exportChapterNewPage: 'Start each chapter on a new page',
  exportSceneSeparators: 'Replace scene breaks (***, #…) with',
  exportSeparatorBlank: 'Blank line',
  exportIgnoreEmptyLines: 'Ignore blank lines between paragraphs',
  exportKeepFormatting: "Keep the editor's fonts, sizes and colours",
  exportSectionLayout: 'Layout',
  exportLayoutTextHint: 'Layout settings only apply to PDF and Word.',
  exportPageSize: 'Page size',
  exportPageA4: 'A4',
  exportPageA5: 'A5',
  exportPageLetter: 'US Letter',
  exportFontFamily: 'Font',
  exportFontSize: 'Text size (pt)',
  exportLineHeight: 'Line spacing',
  exportLineSingle: 'Single (1)',
  exportLine115: '1.15',
  exportLine15: '1.5',
  exportLineDouble: 'Double (2)',
  exportLineCustom: 'Other value…',
  exportLineCustomValue: 'Line spacing value',
  exportMargins: 'Margins (cm)',
  exportIndent: 'First-line indent (cm)',
  exportJustify: 'Justified text',
  exportPageNumbers: 'Page numbers',
  exportRunningHeader: 'Author and title at the top of pages',
  exportCancelBtn: 'Cancel',
  exportConfirmBtn: 'Export',
  exportPreviewTitle: 'Preview',
  exportPreviewHint: 'Approximate preview: the text is not split into pages, and page numbers and the header only appear in the final file.',
  exportPreviewTruncated: 'Only the beginning of the document is shown.',
  exportPreviewNoLayout: 'No preview for plain text and Markdown: these formats have no layout.',
  exportPreviewError: 'The preview could not be displayed. You can still export.',
  exportFormatOdt: 'OpenDocument (.odt)',
  exportOdtSuccess: 'ODT export successful!',
  exportOdtError: 'Error during ODT export: ',
  exportSectionBible: 'World bible',
  exportBibleMode: 'Include the world bible',
  exportBibleModeNone: 'No',
  exportBibleModeAppendix: 'As an appendix, after the novel',
  exportBibleModeOnly: 'Alone (without the chapters)',
  exportBibleCategories: 'Categories to include:',
  exportBiblePortraits: 'Portraits (preview, PDF, Word and ODT)',
  exportBibleRelations: 'Relations between entries',
  exportBibleTimeline: 'Timeline events',
  exportBibleTitle: 'World bible',
  exportBibleRelationsTitle: 'Relations',
  exportBibleTimelineTitle: 'Timeline',
  exportBibleEmpty: 'The world bible has no entries yet.',
  exportInProgress: 'Exporting…',
  exportAlreadyRunning: 'An export is already running. Please wait until it finishes.',
  whatsNewTitle: 'What’s new?',
  whatsNewIntro: 'Scriptorium has been updated. Here is what’s new:',
  chapterStatusMenuTitle: 'Chapter status',
  chapterStatusTodo: 'To write',
  chapterStatusDraft: 'Draft',
  chapterStatusRevision: 'In revision',
  chapterStatusDone: 'Done',
  chapterColorLabel: 'Color',
  chapterColorReset: 'Back to the status color',
  chapterTargetLabel: 'Word goal',
  chapterTargetPlaceholder: 'None',
  chapterTargetUnit: 'words',
  chapterTargetProgress: '{words} / {target} words ({percent}%)',
  prefWbLinksLabel: 'World bible links in the text',
  prefWbLinksHint:
    'Entry names are coloured and clickable, with a preview on hover. When turned off, the text stays plain, but the "Mentioned in" list of each entry keeps working.',
  sessionNewTitle: 'New session',
  sessionPanelStatsLink: 'Statistics and goals \u2192',
  sessionCurrentDocument: 'Chapter: {name}',
  sessionReviewTitle: 'Session review',
  sessionMoodQuestion: 'How did this session go?',
  sessionSkipShort: 'Skip',
  sessionReviewHint: 'The session is already saved. These details are optional.',
  focusModeBtn: 'Focus',
  focusModeBtnTitle: 'Focus mode: hides everything but the page (F11)',
  focusModeExit: 'Exit',
  focusModeExitTitle: 'Exit focus mode (F11 or Esc)',
  prefFocusDimLabel: 'Focus mode: dim the other paragraphs',
  autoRepTabSearch: 'Find / Replace',
  autoRepTabAuto: 'Auto-replace',
  autoRepEnabled: 'Enable auto-replace in this book',
  autoRepHint: 'When you finish a word from the list (space, punctuation or Enter), it is replaced. Ctrl+Z undoes the replacement. Each book has its own list.',
  autoRepFrom: 'Typed word',
  autoRepTo: 'Replaced with',
  autoRepFromPlaceholder: 'e.g. btw',
  autoRepToPlaceholder: 'e.g. by the way',
  autoRepAdd: '+ Add',
  autoRepDelete: 'Delete',
  autoRepEmpty: 'No replacements yet.',
  autoRepWarnWord: 'A single word, without spaces or punctuation: otherwise it will never be replaced.',
  autoRepWarnDuplicate: 'This word is already in the list: only the first line counts.',
  autoRepWarnEmpty: 'The replacement text is empty: this line is ignored.',
  exportPdfSuccess:
    'PDF export successful!',
  exportPdfError:
    'Error during PDF export: ',
  exportDocxSuccess:
    'DOCX export successful!',
  exportDocxError:
    'Error during DOCX export: ',
  exportProjectError:
    'Error during project export: ',
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
  itemNotFound:
    'Item not found (deleted?)',
  initErrorPrefix:
    'An error occurred while loading the editor:\n\n',
  initErrorSuffix:
    '\n\nOpen the console (Ctrl+Shift+I) for more details.',
  menuInitErrorPrefix:
    'An error occurred while loading the project list:\n\n'
};

export const dict = {
  fr,
  en
};
