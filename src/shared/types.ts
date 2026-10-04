// Modèle de données et contrat IPC, partagés par le processus principal, le
// preload et le renderer.
//
// Toute évolution des données persistées doit être décrite ici afin que le
// processus principal, le preload et le renderer utilisent exactement les
// mêmes structures.

// ============================================================================
// WORLD BUILDING
// ============================================================================

export type BuiltinWbType =
  | 'character'
  | 'place'
  | 'object'
  | 'other';

export type WbType =
  | BuiltinWbType
  | string;

export type WbFieldType =
  | 'text'
  | 'textarea';

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
   * Icône personnalisée ; à défaut, celle du type de fiche.
   */
  icon?: string;

  /**
   * Couleur personnalisée ; à défaut, celle du type de fiche.
   */
  color?: string;
}

// ============================================================================
// SESSIONS D’ÉCRITURE
// ============================================================================

export type SessionRatingScale =
  | 5
  | 10
  | 20;

export type WritingSessionMood =
  | 'very-good'
  | 'good'
  | 'neutral'
  | 'difficult'
  | 'very-difficult';

export type WritingSessionSource =
  | 'pomodoro'
  | 'manual';

export interface PomodoroSessionInfo {
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  activeSeconds: number;
  completed: boolean;
}

export interface WritingSessionDocumentStats {
  /**
   * Nom du chapitre ou de la scène au moment de la session.
   */
  documentName: string;

  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;
}

export interface WritingSession {
  id: string;
  projectName: string;

  /**
   * Premier document actif au démarrage de la session.
   *
   * Il peut s’agir d’un chapitre ou d’une scène.
   */
  documentName: string | null;

  documentNames?: string[];
  documentStats?: WritingSessionDocumentStats[];

  startedAt: string;
  endedAt: string;
  durationSeconds: number;

  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;

  source: WritingSessionSource;
  pomodoro?: PomodoroSessionInfo;

  mood?: WritingSessionMood | null;

  concentration?: number | null;
  concentrationScale?: SessionRatingScale;

  energy?: number | null;
  energyScale?: SessionRatingScale;

  note?: string;
}

// ============================================================================
// OBJECTIFS DE PROJET
// ============================================================================

export type ProjectGoalProgressMode =
  | 'words'
  | 'manual';

export interface ProjectGoal {
  id: string;
  title: string;

  /**
   * Date locale au format YYYY-MM-DD.
   */
  deadline: string | null;

  progressMode: ProjectGoalProgressMode;

  targetWords?: number | null;
  manualProgress?: number;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// MODE SCÉNARIO
// ============================================================================

/**
 * Type général d’un projet.
 *
 * `projectType` reste facultatif dans ProjectData pour assurer la
 * compatibilité avec les anciens projets. Son absence signifie `novel`.
 */
export type ProjectType =
  | 'novel'
  | 'screenplay';

/**
 * Langue des conventions de scénario.
 *
 * Cette préférence est indépendante de la langue de l’interface.
 */
export type ScreenplayConventionLanguage =
  | 'fr'
  | 'en';

/**
 * Format physique utilisé pour l’éditeur paginé et les exports.
 */
export type ScreenplayPageFormat =
  | 'a4'
  | 'letter';

/**
 * Mode de gestion de l’en-tête d’une scène.
 *
 * - `structured` : l’en-tête est généré à partir de champs séparés ;
 * - `free` : l’auteur saisit librement l’en-tête complet.
 */
export type ScreenplayHeadingMode =
  | 'structured'
  | 'free';

/**
 * Préfixes courants d’un en-tête de scène.
 *
 * La valeur `OTHER` permet de conserver une formulation personnalisée.
 */
export type ScreenplayInteriorExterior =
  | 'INT.'
  | 'EXT.'
  | 'INT./EXT.'
  | 'EXT./INT.'
  | 'OTHER';

/**
 * Les six types principaux sont toujours disponibles.
 *
 * `shot` correspond au type facultatif « Plan / indication technique ».
 */
export type ScreenplayElementType =
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot';

/**
 * Type comprenant aussi l’en-tête de scène.
 *
 * L’en-tête est stocké séparément du corps de la scène afin d’éviter une
 * divergence entre ses champs structurés et son texte affiché.
 */
export type ScreenplayParagraphType =
  | 'scene-heading'
  | ScreenplayElementType;

/**
 * Paragraphe du corps d’une scène.
 *
 * Le type est enregistré explicitement. La présentation visuelle est calculée
 * à partir de ce type et ne constitue donc pas la source de vérité.
 *
 * `html` contient uniquement la mise en forme en ligne autorisée par
 * Scriptorium. Il sera désinfecté lors des imports et sauvegardes.
 */
export interface ScreenplayElement {
  /**
   * Identifiant interne stable.
   */
  id: string;

  type: ScreenplayElementType;

  /**
   * Contenu HTML en ligne du paragraphe.
   */
  html: string;
}

/**
 * En-tête structuré, par exemple :
 *
 * INT. APPARTEMENT — JOUR
 *
 * Le texte visible est généré depuis ces champs. Il n’est volontairement pas
 * stocké une seconde fois afin d’éviter les désynchronisations.
 */
export interface StructuredScreenplayHeading {
  id: string;
  type: 'scene-heading';
  mode: 'structured';

  interiorExterior: ScreenplayInteriorExterior;

  /**
   * Valeur utilisée lorsque `interiorExterior` vaut `OTHER`.
   */
  customInteriorExterior?: string;

  location: string;
  timeOfDay: string;
}

/**
 * En-tête entièrement libre.
 */
export interface FreeScreenplayHeading {
  id: string;
  type: 'scene-heading';
  mode: 'free';

  /**
   * Contenu HTML en ligne de l’en-tête libre.
   */
  html: string;
}

export type ScreenplaySceneHeading =
  | StructuredScreenplayHeading
  | FreeScreenplayHeading;

/**
 * Une scène possède un identifiant stable indépendant de sa position.
 *
 * Son numéro visible est calculé à partir de son index dans `scenes`. Il n’est
 * donc pas enregistré ici et se recalcule automatiquement après déplacement.
 */
export interface ScreenplayScene {
  id: string;

  /**
   * Titre interne facultatif, par exemple « La dispute ».
   *
   * Il est affiché dans la barre latérale mais exclu des exports par défaut.
   */
  workingTitle: string;

  heading: ScreenplaySceneHeading;

  /**
   * Paragraphes suivant l’en-tête.
   */
  elements: ScreenplayElement[];
}

/**
 * Informations de la page de titre.
 *
 * La page de titre est non numérotée et exclue du compteur des pages du
 * scénario.
 */
export interface ScreenplayTitlePage {
  enabled: boolean;

  title: string;
  authors: string;

  /**
   * Coordonnées facultatives.
   */
  contact: string;

  /**
   * Version saisie manuellement.
   */
  version: string;

  /**
   * Date saisie manuellement.
   *
   * Elle n’est pas automatiquement remplacée lors d’un export.
   */
  date: string;

  /**
   * Mention facultative d’adaptation ou d’œuvre originale.
   */
  sourceNote: string;
}

/**
 * Réglages des continuations lorsqu’un dialogue traverse un changement de
 * page.
 *
 * Les mentions sont générées par la pagination et ne sont jamais enregistrées
 * dans le texte de l’auteur.
 */
export interface ScreenplayContinuationSettings {
  enabled: boolean;

  /**
   * Mention placée en bas de page.
   *
   * Valeur française par défaut : `(À SUIVRE)`.
   * Valeur anglaise par défaut : `(MORE)`.
   */
  bottomLabel: string;

  /**
   * Suffixe ajouté au personnage au début de la page suivante.
   *
   * Valeur française par défaut : `(SUITE)`.
   * Valeur anglaise par défaut : `(CONT'D)`.
   */
  characterSuffix: string;
}

export interface ScreenplaySettings {
  conventionLanguage: ScreenplayConventionLanguage;

  /**
   * A4 par défaut. US Letter reste disponible dans les paramètres.
   */
  pageFormat: ScreenplayPageFormat;

  /**
   * Affichage des numéros dans les exports.
   *
   * Les numéros restent visibles dans la barre latérale indépendamment de ce
   * réglage.
   */
  showSceneNumbersInExport: boolean;

  /**
   * Le gras des en-têtes reste facultatif.
   */
  boldSceneHeadings: boolean;

  /**
   * Active ou masque le type facultatif « Plan / indication technique » dans
   * le sélecteur de types.
   */
  enableShotElement: boolean;

  continuations: ScreenplayContinuationSettings;
}

/**
 * Données spécifiques à un projet de type scénario.
 */
export interface ScreenplayProjectData {
  /**
   * Version du format interne pour permettre de futures migrations.
   */
  version: 1;

  settings: ScreenplaySettings;
  titlePage: ScreenplayTitlePage;

  /**
   * L’ordre du tableau correspond à l’ordre du scénario.
   */
  scenes: ScreenplayScene[];
}

// ============================================================================
// PROJET
// ============================================================================

export interface ProjectData {
  /**
   * Type du projet.
   *
   * Facultatif pour la compatibilité : un ancien projet sans cette propriété
   * est toujours interprété comme un roman.
   */
  projectType?: ProjectType;

  /**
   * Nom du chapitre -> HTML du chapitre.
   *
   * Cette structure reste utilisée par les romans et par les anciennes
   * versions de Scriptorium.
   *
   * Dans un projet scénario, elle est normalement vide. Elle reste présente
   * pour conserver une enveloppe ProjectData compatible avec les fonctions
   * communes et les anciens imports.
   */
  chapters: Record<string, string>;

  /**
   * Données spécifiques au scénario.
   *
   * Présentes uniquement lorsque `projectType` vaut `screenplay`.
   */
  screenplay?: ScreenplayProjectData;

  world: Record<string, WbItem>;

  customWbTypes?: Record<
    string,
    CustomWbTypeDef
  >;

  writingSessions?: WritingSession[];
  goals?: ProjectGoal[];
}

export type ProjectsMap = Record<
  string,
  ProjectData
>;

// ============================================================================
// ÉTAT D’INTERFACE
// ============================================================================

/**
 * `chapter` reste le nom interne historique du type de document.
 *
 * Pour un scénario, les scènes seront identifiées séparément grâce à leur
 * identifiant stable dans les évolutions du contrôleur.
 */
export type ItemType =
  | 'chapter'
  | 'scene'
  | 'world';

export interface TabRef {
  /**
   * Pour un roman : nom du chapitre.
   * Pour un scénario : identifiant stable de la scène.
   * Pour le World Building : nom de la fiche.
   */
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

export type LanguageCode =
  | 'fr'
  | 'en';

export interface EditorPrefs {
  width: number;
  fontFamily?: string;
  lineHeight?: number;

  uiFontSize?: number;
  uiFontFamily?: string;

  timerSoundEnabled?: boolean;
  timerVolume?: number;
  timerSoundId?: string;

  marginLeft?: number;
  marginRight?: number;
  firstLineIndent?: number;

  sessionConcentrationScale?: SessionRatingScale;
  sessionEnergyScale?: SessionRatingScale;
}

// ============================================================================
// STATISTIQUES D’ÉCRITURE HISTORIQUES
// ============================================================================

export interface WritingStatsBucket {
  baselineDate: string | null;
  baselineWords: number;

  history: Record<string, number>;

  dailyGoal?: number | null;
}

export interface WritingStats {
  projects?: Record<
    string,
    WritingStatsBucket
  >;

  baselineDate?: string | null;
  baselineWords?: number;
  history?: Record<string, number>;
}

// ============================================================================
// GRAMMAIRE
// ============================================================================

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
  phase:
    | 'download'
    | 'extract';

  percent: number;
}

export interface LanguageToolFolderResult {
  canceled: boolean;
  valid?: boolean;
  folderPath?: string;
}

// ============================================================================
// EXPORT / IMPORT / SAUVEGARDES
// ============================================================================

export interface ImportedProject {
  projectName: string;
  projectData: ProjectData;
}

export interface BackupEntry {
  fileName: string;
  savedAt: string | null;
}

export interface LegacyData {
  projects?: ProjectsMap;
  uiState?: UiState;
  theme?: string;
  currentProject?: string;
}

// ============================================================================
// DOCX
// ============================================================================

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

  /**
   * Type de paragraphe scénario.
   *
   * Facultatif afin de conserver la compatibilité avec les exports de romans.
   */
  screenplayType?: ScreenplayParagraphType;

  /**
   * Demande au générateur DOCX de conserver ce paragraphe avec le suivant.
   *
   * Utilisé notamment pour les en-têtes et les noms de personnages.
   */
  keepWithNext?: boolean;

  text?: string;
}

// ============================================================================
// DIALOGUES NATIFS
// ============================================================================

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

// ============================================================================
// CONTRAT EXPOSÉ AU RENDERER
// ============================================================================

export interface ScriptoriumApi {
  // ------------------------------------------------------------------------
  // Persistance des projets
  // ------------------------------------------------------------------------

  getProjects(): Promise<ProjectsMap>;

  saveProjects(
    projects: ProjectsMap
  ): Promise<boolean>;

  /**
   * Sauvegarde uniquement le contenu d’un chapitre de roman.
   *
   * Le processus principal met à jour le projet concerné sans que le renderer
   * ait besoin de lui renvoyer la totalité des projets.
   */
  saveProjectChapter(
    projectName: string,
    chapterName: string,
    html: string
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // État d’interface
  // ------------------------------------------------------------------------

  getUiState(): Promise<UiState>;

  saveUiState(
    uiState: UiState
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Thème et langue
  // ------------------------------------------------------------------------

  getTheme(): Promise<ThemeName>;

  saveTheme(
    theme: ThemeName
  ): Promise<boolean>;

  getLanguage(): Promise<LanguageCode>;

  saveLanguage(
    lang: LanguageCode
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Préférences
  // ------------------------------------------------------------------------

  getEditorPrefs(): Promise<EditorPrefs>;

  saveEditorPrefs(
    prefs: EditorPrefs
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Anciennes statistiques quotidiennes
  // ------------------------------------------------------------------------

  getWritingStats(): Promise<WritingStats>;

  saveWritingStats(
    stats: WritingStats
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Correcteur orthographique natif
  // ------------------------------------------------------------------------

  getNativeSpellcheck(): Promise<boolean>;

  setNativeSpellcheck(
    enabled: boolean
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Projet courant
  // ------------------------------------------------------------------------

  getCurrentProject(): Promise<
    string | null
  >;

  setCurrentProject(
    name: string
  ): Promise<boolean>;

  clearCurrentProject(): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Migration depuis localStorage
  // ------------------------------------------------------------------------

  migrateFromLocalStorage(
    legacyData: LegacyData
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Dialogues natifs
  // ------------------------------------------------------------------------

  showSaveDialog(
    options: SaveDialogOptions
  ): Promise<SaveDialogResult>;

  showOpenDialog(
    options: OpenDialogOptions
  ): Promise<OpenDialogResult>;

  // ------------------------------------------------------------------------
  // Exports de fichiers
  // ------------------------------------------------------------------------

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

  // ------------------------------------------------------------------------
  // Export et import de projet
  // ------------------------------------------------------------------------

  exportProject(
    filePath: string,
    projectName: string,
    projectData: ProjectData
  ): Promise<boolean>;

  importProject(
    filePath: string
  ): Promise<ImportedProject>;

  // ------------------------------------------------------------------------
  // Sauvegardes horodatées
  // ------------------------------------------------------------------------

  createBackup(
    projectName: string,
    projectData: ProjectData
  ): Promise<{
    fileName: string;
  }>;

  listBackups(
    projectName: string
  ): Promise<BackupEntry[]>;

  restoreBackup(
    projectName: string,
    fileName: string
  ): Promise<ProjectData>;

  // ------------------------------------------------------------------------
  // Désinfection HTML
  // ------------------------------------------------------------------------

  sanitizeHtml(
    html: string
  ): Promise<string>;

  // ------------------------------------------------------------------------
  // Correcteur de grammaire hors ligne
  // ------------------------------------------------------------------------

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

  onGrammarInstallProgress(
    callback: (
      data: GrammarInstallProgress
    ) => void
  ): () => void;

  onGrammarServerStopped(
    callback: () => void
  ): () => void;

  openExternalLink(
    url: string
  ): Promise<void>;

  // ------------------------------------------------------------------------
  // Mise à jour automatique
  // ------------------------------------------------------------------------

  checkForUpdates(): Promise<void>;

  getAppVersion(): Promise<string>;

  confirmUpdateDownload(): Promise<void>;

  quitAndInstall(): Promise<void>;

  onUpdateAvailable(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  onUpdateNotAvailable(
    callback: () => void
  ): () => void;

  onUpdateDownloaded(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  onUpdateError(
    callback: (
      message: string
    ) => void
  ): () => void;
}

declare global {
  interface Window {
    api: ScriptoriumApi;
  }
}
