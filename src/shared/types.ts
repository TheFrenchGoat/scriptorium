// src/shared/types.ts
// Modèle de données et contrat IPC, partagés par le processus principal, le
// preload et le renderer. C'est le seul endroit où la forme des données
// persistées est décrite : toute évolution du store doit passer par ici, ce
// qui garantit que main et renderer ne peuvent plus diverger silencieusement.

// --- WORLD BUILDING ---

/**
 * Types de fiches intégrés.
 *
 * Les types personnalisés d'un projet utilisent une clé libre (`custom_xxx`),
 * d'où l'union avec `string`.
 */
export type BuiltinWbType =
  | 'character'
  | 'place'
  | 'object'
  | 'other';

export type WbType = BuiltinWbType | string;

export type WbFieldType = 'text' | 'textarea';

export interface WbField {
  key: string;
  label: string;
  type: WbFieldType;
}

export interface WbTemplate {
  icon: string;
  label: string;
  fields: WbField[];
}

/**
 * Définition d'un type de fiche personnalisé, propre à un projet.
 */
export interface CustomWbTypeDef {
  label: string;
  icon: string;
  defaultColor: string;
  fields: WbField[];
}

export interface WbItem {
  wbType: WbType;
  content: Record<string, string>;

  /**
   * Icône personnalisée ; à défaut, celle du type.
   */
  icon?: string;

  /**
   * Couleur de surlignage personnalisée ; à défaut, celle du type.
   */
  color?: string;
}

// --- SESSIONS D'ÉCRITURE ---

/**
 * Échelles disponibles pour les évaluations de concentration et d'énergie.
 */
export type SessionRatingScale = 5 | 10 | 20;

/**
 * Ressenti général choisi par l'utilisateur à la fin d'une session.
 */
export type WritingSessionMood =
  | 'very-good'
  | 'good'
  | 'neutral'
  | 'difficult'
  | 'very-difficult';

/**
 * Origine de la session.
 *
 * - `pomodoro` : session démarrée automatiquement avec le minuteur ;
 * - `manual` : session démarrée manuellement sans minuteur.
 */
export type WritingSessionSource =
  | 'pomodoro'
  | 'manual';

/**
 * Informations propres au Pomodoro associé à une session.
 */
export interface PomodoroSessionInfo {
  /**
   * Date et heure ISO du démarrage du Pomodoro.
   */
  startedAt: string;

  /**
   * Date et heure ISO de fin ou d'arrêt du Pomodoro.
   */
  endedAt: string;

  /**
   * Durée initialement prévue, en secondes.
   */
  plannedSeconds: number;

  /**
   * Temps réellement écoulé pendant lequel le Pomodoro était actif,
   * hors périodes de pause.
   */
  activeSeconds: number;

  /**
   * `true` si le minuteur est arrivé naturellement à zéro.
   * `false` s'il a été arrêté manuellement.
   */
  completed: boolean;
}

/**
 * Statistiques d'un chapitre travaillé pendant une session.
 *
 * Elles permettent de connaître précisément le nombre de mots ajoutés ou
 * supprimés dans chaque chapitre, indépendamment du total global du projet.
 */
export interface WritingSessionDocumentStats {
  /**
   * Nom du chapitre au moment de la session.
   */
  documentName: string;

  /**
   * Nombre de mots du chapitre au début de la session.
   */
  wordsBefore: number;

  /**
   * Nombre de mots du chapitre à la fin de la session.
   */
  wordsAfter: number;

  /**
   * Différence nette entre `wordsAfter` et `wordsBefore`.
   *
   * Cette valeur peut être négative si du texte a été supprimé.
   */
  wordsWritten: number;
}

/**
 * Session d'écriture enregistrée dans l'historique d'un projet.
 */
export interface WritingSession {
  /**
   * Identifiant unique et stable de la session.
   */
  id: string;

  /**
   * Nom du projet au moment de la session.
   *
   * Cette valeur est conservée dans la session pour garder un historique
   * compréhensible même si le projet est renommé plus tard.
   */
  projectName: string;

  /**
   * Premier chapitre ou document actif au démarrage de la session.
   *
   * Peut être `null` si aucun chapitre n'était ouvert.
   *
   * Ce champ reste conservé pour assurer la compatibilité avec les sessions
   * créées avant l'ajout du suivi de plusieurs documents.
   */
  documentName: string | null;

  /**
   * Liste de tous les chapitres travaillés pendant la session.
   *
   * Facultatif pour assurer la compatibilité avec les anciennes sessions qui
   * ne possèdent que `documentName`.
   */
  documentNames?: string[];

  /**
   * Statistiques détaillées des mots écrits dans chaque chapitre travaillé.
   *
   * Facultatif pour assurer la compatibilité avec les sessions enregistrées
   * avant l'ajout du suivi des mots par chapitre.
   */
  documentStats?: WritingSessionDocumentStats[];

  /**
   * Date et heure ISO du début de la session.
   */
  startedAt: string;

  /**
   * Date et heure ISO de fin de la session.
   */
  endedAt: string;

  /**
   * Durée totale de la session, en secondes.
   *
   * Pour une session avec pauses, il s'agit du temps réellement consacré
   * à la session, sans les périodes pendant lesquelles elle était en pause.
   */
  durationSeconds: number;

  /**
   * Nombre total de mots du projet au début de la session.
   */
  wordsBefore: number;

  /**
   * Nombre total de mots du projet à la fin de la session.
   */
  wordsAfter: number;

  /**
   * Différence nette entre le nombre de mots final et initial.
   *
   * Cette valeur peut être négative si l'utilisateur a supprimé du texte.
   */
  wordsWritten: number;

  /**
   * Origine de la session : Pomodoro ou démarrage manuel.
   */
  source: WritingSessionSource;

  /**
   * Informations du minuteur lorsque la session provient d'un Pomodoro.
   */
  pomodoro?: PomodoroSessionInfo;

  /**
   * Humeur choisie à la fin de la session.
   */
  mood?: WritingSessionMood | null;

  /**
   * Note de concentration choisie par l'utilisateur.
   */
  concentration?: number | null;

  /**
   * Échelle utilisée pour la note de concentration.
   */
  concentrationScale?: SessionRatingScale;

  /**
   * Niveau d'énergie choisi par l'utilisateur.
   */
  energy?: number | null;

  /**
   * Échelle utilisée pour le niveau d'énergie.
   */
  energyScale?: SessionRatingScale;

  /**
   * Note libre facultative concernant la session.
   */
  note?: string;
}

// --- OBJECTIFS DE PROJET ---

/**
 * Méthode utilisée pour calculer l'avancement d'un objectif.
 *
 * - `words` : progression calculée avec le nombre de mots du projet ;
 * - `manual` : pourcentage défini manuellement par l'utilisateur.
 */
export type ProjectGoalProgressMode =
  | 'words'
  | 'manual';

/**
 * Objectif d'écriture associé à un projet.
 *
 * Un projet peut posséder plusieurs objectifs simultanément.
 */
export interface ProjectGoal {
  /**
   * Identifiant unique et stable de l'objectif.
   */
  id: string;

  /**
   * Nom de l'objectif, par exemple « Premier jet ».
   */
  title: string;

  /**
   * Date limite au format local `YYYY-MM-DD`.
   *
   * `null` signifie qu'aucune date limite n'est définie.
   */
  deadline: string | null;

  /**
   * Méthode de calcul de la progression.
   */
  progressMode: ProjectGoalProgressMode;

  /**
   * Objectif de mots lorsque `progressMode` vaut `words`.
   *
   * `null` ou `undefined` signifie qu'aucune cible n'est définie.
   */
  targetWords?: number | null;

  /**
   * Pourcentage manuel compris entre 0 et 100 lorsque `progressMode`
   * vaut `manual`.
   */
  manualProgress?: number;

  /**
   * Date et heure ISO de création de l'objectif.
   */
  createdAt: string;

  /**
   * Date et heure ISO de dernière modification.
   */
  updatedAt: string;
}

// --- PROJET ---

export interface ProjectData {
  /**
   * Nom du chapitre -> HTML du chapitre.
   *
   * L'ordre des clés correspond à l'ordre affiché.
   */
  chapters: Record<string, string>;

  /**
   * Nom de la fiche -> contenu de la fiche.
   */
  world: Record<string, WbItem>;

  /**
   * Types de fiches World Building personnalisés du projet.
   */
  customWbTypes?: Record<
    string,
    CustomWbTypeDef
  >;

  /**
   * Historique complet des sessions d'écriture du projet.
   *
   * Facultatif pour assurer la compatibilité avec les projets créés avant
   * l'ajout du suivi des sessions.
   */
  writingSessions?: WritingSession[];

  /**
   * Objectifs d'écriture du projet.
   *
   * Facultatif pour assurer la compatibilité avec les anciens projets.
   */
  goals?: ProjectGoal[];
}

export type ProjectsMap = Record<
  string,
  ProjectData
>;

// --- ÉTAT D'INTERFACE ---

export type ItemType = 'chapter' | 'world';

export interface TabRef {
  name: string;
  type: ItemType;
}

export interface ProjectUiState {
  openTabs: TabRef[];
  activeTab: string | null;
  activeType: ItemType;
}

export type UiState = Record<
  string,
  ProjectUiState
>;

export type ThemeName =
  | 'dark'
  | 'light'
  | 'sepia'
  | 'midnight'
  | 'forest'
  | 'contrast'
  | 'rose'
  | 'lavender'
  | 'ocean';

export type LanguageCode = 'fr' | 'en';

export interface EditorPrefs {
  /**
   * Largeur de la feuille d'écriture, en px.
   */
  width: number;

  /**
   * Police de la feuille d'écriture.
   */
  fontFamily?: string;

  /**
   * Interligne de la feuille d'écriture.
   */
  lineHeight?: number;

  /**
   * Taille du texte DE L'INTERFACE, distincte de la feuille d'écriture.
   */
  uiFontSize?: number;

  /**
   * Police utilisée par l'interface.
   */
  uiFontFamily?: string;

  /**
   * Son joué à la fin du minuteur d'écriture.
   */
  timerSoundEnabled?: boolean;

  /**
   * Volume du son de fin de minuteur, compris entre 0 et 1.
   */
  timerVolume?: number;

  /**
   * Sonnerie choisie.
   *
   * Les valeurs précises sont définies et validées côté renderer dans
   * `lib/sound.ts`.
   */
  timerSoundId?: string;

  /**
   * Marges gauche et droite de la feuille d'écriture, en pixels.
   *
   * Elles sont réglables avec la règle graduée.
   */
  marginLeft?: number;
  marginRight?: number;

  /**
   * Retrait de première ligne de chaque paragraphe, en pixels.
   *
   * Peut être négatif pour un retrait inversé.
   */
  firstLineIndent?: number;

  /**
   * Échelle utilisée par défaut pour évaluer la concentration à la fin
   * d'une session.
   */
  sessionConcentrationScale?: SessionRatingScale;

  /**
   * Échelle utilisée par défaut pour évaluer le niveau d'énergie à la fin
   * d'une session.
   */
  sessionEnergyScale?: SessionRatingScale;
}

// --- STATISTIQUES D'ÉCRITURE HISTORIQUES ---

/**
 * Ancien système de statistiques quotidiennes.
 *
 * Il reste conservé pour assurer la compatibilité avec les données déjà
 * enregistrées. Les nouvelles statistiques détaillées utilisent également
 * les sessions stockées directement dans chaque projet.
 */
export interface WritingStatsBucket {
  baselineDate: string | null;
  baselineWords: number;

  /**
   * `YYYY-MM-DD` -> nombre net de mots écrits ce jour-là.
   */
  history: Record<string, number>;

  /**
   * Objectif quotidien historique, en nombre de mots.
   */
  dailyGoal?: number | null;
}

export interface WritingStats {
  /**
   * Statistiques historiques regroupées par projet.
   *
   * Elles restent séparées pour ne pas mélanger plusieurs romans ou
   * documents sans rapport.
   */
  projects?: Record<
    string,
    WritingStatsBucket
  >;

  /**
   * Champs de l'ancien format global, conservés pour compatibilité.
   */
  baselineDate?: string | null;
  baselineWords?: number;
  history?: Record<string, number>;
}

// --- GRAMMAIRE (LanguageTool) ---

export interface GrammarPrefs {
  enabled: boolean;
  languageToolPath: string | null;
  port: number;
}

export interface JavaInfo {
  available: boolean;
  major: number | null;
  outdated: boolean;
}

export interface GrammarMatch {
  offset: number;
  length: number;
  message: string;
  ruleId: string;
  replacements: string[];
}

export interface GrammarInstallProgress {
  phase: 'download' | 'extract';
  percent: number;
}

export interface LanguageToolFolderResult {
  canceled: boolean;
  valid?: boolean;
  folderPath?: string;
}

// --- EXPORT / IMPORT / SAUVEGARDES ---

export interface ImportedProject {
  projectName: string;
  projectData: ProjectData;
}

export interface BackupEntry {
  fileName: string;
  savedAt: string | null;
}

/**
 * Données transmises une seule fois par le renderer lors de la migration
 * depuis l'ancien système localStorage.
 */
export interface LegacyData {
  projects?: ProjectsMap;
  uiState?: UiState;
  theme?: string;
  currentProject?: string;
}

// --- DOCX ---

/**
 * Structure neutre produite par le renderer puis consommée par le processus
 * principal pour générer un document Word.
 */
export interface DocxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: string;

  /**
   * Taille en points.
   */
  size?: number;

  /**
   * Couleur hexadécimale sans `#`.
   */
  color?: string;
}

export interface DocxParagraph {
  runs?: DocxRun[];
  isBlock?: boolean;
  isPageBreak?: boolean;
  isChapterTitle?: boolean;
  text?: string;
}

// --- DIALOGUES NATIFS ---

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: {
    name: string;
    extensions: string[];
  }[];
}

export interface OpenDialogOptions
  extends SaveDialogOptions {
  properties?: (
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
  )[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

// --- CONTRAT EXPOSÉ AU RENDERER (window.api) ---

export interface ScriptoriumApi {
  // Persistance des projets
  getProjects(): Promise<ProjectsMap>;

  saveProjects(
    projects: ProjectsMap
  ): Promise<boolean>;

  // État d'interface
  getUiState(): Promise<UiState>;

  saveUiState(
    uiState: UiState
  ): Promise<boolean>;

  // Thème / langue
  getTheme(): Promise<ThemeName>;

  saveTheme(
    theme: ThemeName
  ): Promise<boolean>;

  getLanguage(): Promise<LanguageCode>;

  saveLanguage(
    lang: LanguageCode
  ): Promise<boolean>;

  // Préférences d'affichage et de sessions
  getEditorPrefs(): Promise<EditorPrefs>;

  saveEditorPrefs(
    prefs: EditorPrefs
  ): Promise<boolean>;

  // Anciennes statistiques quotidiennes
  getWritingStats(): Promise<WritingStats>;

  saveWritingStats(
    stats: WritingStats
  ): Promise<boolean>;

  // Correcteur orthographique natif
  getNativeSpellcheck(): Promise<boolean>;

  setNativeSpellcheck(
    enabled: boolean
  ): Promise<boolean>;

  // Projet courant
  getCurrentProject(): Promise<
    string | null
  >;

  setCurrentProject(
    name: string
  ): Promise<boolean>;

  clearCurrentProject(): Promise<boolean>;

  // Migration ponctuelle depuis localStorage
  migrateFromLocalStorage(
    legacyData: LegacyData
  ): Promise<boolean>;

  // Dialogues natifs
  showSaveDialog(
    options: SaveDialogOptions
  ): Promise<SaveDialogResult>;

  showOpenDialog(
    options: OpenDialogOptions
  ): Promise<OpenDialogResult>;

  // Exports de fichiers
  exportTxt(
    filePath: string,
    text: string
  ): Promise<boolean>;

  exportDocx(
    filePath: string,
    docxData: DocxParagraph[]
  ): Promise<boolean>;

  exportPdf(
    filePath: string,
    htmlContent: string
  ): Promise<boolean>;

  // Export / import de projet complet
  exportProject(
    filePath: string,
    projectName: string,
    projectData: ProjectData
  ): Promise<boolean>;

  importProject(
    filePath: string
  ): Promise<ImportedProject>;

  // Sauvegardes horodatées
  createBackup(
    projectName: string,
    projectData: ProjectData
  ): Promise<{ fileName: string }>;

  listBackups(
    projectName: string
  ): Promise<BackupEntry[]>;

  restoreBackup(
    projectName: string,
    fileName: string
  ): Promise<ProjectData>;

  // Désinfection HTML à la demande
  sanitizeHtml(
    html: string
  ): Promise<string>;

  // Correcteur de grammaire hors ligne
  getGrammarPrefs(): Promise<GrammarPrefs>;

  saveGrammarPrefs(
    prefs: Partial<GrammarPrefs>
  ): Promise<GrammarPrefs>;

  selectLanguageToolFolder(): Promise<LanguageToolFolderResult>;

  checkJavaAvailable(): Promise<JavaInfo>;

  startGrammarServer(): Promise<{
    port: number;
  }>;

  checkGrammar(
    text: string,
    language: string
  ): Promise<GrammarMatch[]>;

  installLanguageToolAuto(): Promise<{
    success: boolean;
    folderPath: string;
  }>;

  /**
   * Renvoie une fonction de désabonnement.
   */
  onGrammarInstallProgress(
    callback: (
      data: GrammarInstallProgress
    ) => void
  ): () => void;

  /**
   * Renvoie une fonction de désabonnement.
   */
  onGrammarServerStopped(
    callback: () => void
  ): () => void;

  openExternalLink(
    url: string
  ): Promise<void>;

  // Mise à jour automatique
  checkForUpdates(): Promise<void>;

  getAppVersion(): Promise<string>;

  /**
   * Démarre le téléchargement d'une mise à jour annoncée par
   * `onUpdateAvailable`.
   */
  confirmUpdateDownload(): Promise<void>;

  /**
   * Redémarre l'application pour installer la mise à jour téléchargée.
   */
  quitAndInstall(): Promise<void>;

  /**
   * Une mise à jour a été trouvée.
   *
   * Renvoie une fonction de désabonnement.
   */
  onUpdateAvailable(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  /**
   * Aucune mise à jour n'a été trouvée.
   *
   * Renvoie une fonction de désabonnement.
   */
  onUpdateNotAvailable(
    callback: () => void
  ): () => void;

  /**
   * La mise à jour est téléchargée et prête à être installée.
   *
   * Renvoie une fonction de désabonnement.
   */
  onUpdateDownloaded(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  /**
   * Échec de la vérification ou du téléchargement.
   *
   * Renvoie une fonction de désabonnement.
   */
  onUpdateError(
    callback: (message: string) => void
  ): () => void;
}

declare global {
  interface Window {
    api: ScriptoriumApi;
  }
}
