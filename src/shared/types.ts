// src/shared/types.ts
// Modèle de données et contrat IPC partagés entre le processus principal,
// le preload et le renderer.

// -----------------------------------------------------------------------------
// WORLD BUILDING
// -----------------------------------------------------------------------------

export type BuiltinWbType =
  | 'character'
  | 'place'
  | 'object'
  | 'other';

export type WbType = BuiltinWbType | string;

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
  icon?: string;
  color?: string;
}

// -----------------------------------------------------------------------------
// SESSIONS D’ÉCRITURE
// -----------------------------------------------------------------------------

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
  documentName: string;
  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;
}

export interface WritingSession {
  id: string;
  projectName: string;
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

// -----------------------------------------------------------------------------
// OBJECTIFS DE PROJET
// -----------------------------------------------------------------------------

export type ProjectGoalProgressMode =
  | 'words'
  | 'manual';

export interface ProjectGoal {
  id: string;
  title: string;
  deadline: string | null;
  progressMode: ProjectGoalProgressMode;
  targetWords?: number | null;
  manualProgress?: number;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// PROJETS
// -----------------------------------------------------------------------------

export interface ProjectData {
  /**
   * Nom du chapitre -> contenu HTML.
   *
   * L’ordre des clés correspond à l’ordre affiché dans l’interface.
   */
  chapters: Record<string, string>;

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

// -----------------------------------------------------------------------------
// ÉTAT D’INTERFACE
// -----------------------------------------------------------------------------

export type ItemType =
  | 'chapter'
  | 'world';

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

export type LanguageCode =
  | 'fr'
  | 'en';

export interface EditorPrefs {
  /**
   * Largeur de la feuille d’écriture, en pixels.
   */
  width: number;

  /**
   * Police de la feuille d’écriture.
   */
  fontFamily?: string;

  /**
   * Interligne de la feuille d’écriture.
   */
  lineHeight?: number;

  /**
   * Taille du texte de l’interface.
   */
  uiFontSize?: number;

  /**
   * Police utilisée par l’interface.
   */
  uiFontFamily?: string;

  timerSoundEnabled?: boolean;

  /**
   * Volume compris entre 0 et 1.
   */
  timerVolume?: number;

  timerSoundId?: string;

  /**
   * Marges de la feuille d’écriture, en pixels.
   */
  marginLeft?: number;
  marginRight?: number;

  /**
   * Retrait de première ligne, en pixels.
   */
  firstLineIndent?: number;

  sessionConcentrationScale?: SessionRatingScale;
  sessionEnergyScale?: SessionRatingScale;
}

// -----------------------------------------------------------------------------
// STATISTIQUES HISTORIQUES
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// GRAMMAIRE
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// EXPORT, IMPORT ET SAUVEGARDES
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// DOCX
// -----------------------------------------------------------------------------

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
   * Couleur hexadécimale sans le caractère #.
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

// -----------------------------------------------------------------------------
// DIALOGUES NATIFS
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// CONTRAT EXPOSÉ AU RENDERER PAR LE PRELOAD
// -----------------------------------------------------------------------------

export interface ScriptoriumApi {
  // ---------------------------------------------------------------------------
  // Persistance des projets
  // ---------------------------------------------------------------------------

  getProjects(): Promise<ProjectsMap>;

  /**
   * Sauvegarde l’ensemble des projets.
   *
   * Cette méthode reste utilisée pour les opérations structurelles :
   * création, suppression, renommage, importation, fiches World Building,
   * objectifs et sessions.
   */
  saveProjects(
    projects: ProjectsMap
  ): Promise<boolean>;

  /**
   * Sauvegarde uniquement le contenu d’un chapitre.
   *
   * Le renderer n’a ainsi plus besoin d’envoyer tous les projets à chaque
   * frappe. Le processus principal met à jour uniquement le chapitre ciblé
   * dans les données conservées par electron-store.
   *
   * electron-store réécrit toujours physiquement son fichier JSON, mais le
   * transfert IPC et les copies de données côté renderer sont fortement
   * réduits.
   */
  saveProjectChapter(
    projectName: string,
    chapterName: string,
    html: string
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // État d’interface
  // ---------------------------------------------------------------------------

  getUiState(): Promise<UiState>;

  saveUiState(
    uiState: UiState
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Thème et langue
  // ---------------------------------------------------------------------------

  getTheme(): Promise<ThemeName>;

  saveTheme(
    theme: ThemeName
  ): Promise<boolean>;

  getLanguage(): Promise<LanguageCode>;

  saveLanguage(
    lang: LanguageCode
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Préférences d’affichage et de sessions
  // ---------------------------------------------------------------------------

  getEditorPrefs(): Promise<EditorPrefs>;

  saveEditorPrefs(
    prefs: EditorPrefs
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Anciennes statistiques quotidiennes
  // ---------------------------------------------------------------------------

  getWritingStats(): Promise<WritingStats>;

  saveWritingStats(
    stats: WritingStats
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Correcteur orthographique natif
  // ---------------------------------------------------------------------------

  getNativeSpellcheck(): Promise<boolean>;

  setNativeSpellcheck(
    enabled: boolean
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Projet courant
  // ---------------------------------------------------------------------------

  getCurrentProject(): Promise<
    string | null
  >;

  setCurrentProject(
    name: string
  ): Promise<boolean>;

  clearCurrentProject(): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Migration depuis l’ancien localStorage
  // ---------------------------------------------------------------------------

  migrateFromLocalStorage(
    legacyData: LegacyData
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Dialogues natifs
  // ---------------------------------------------------------------------------

  showSaveDialog(
    options: SaveDialogOptions
  ): Promise<SaveDialogResult>;

  showOpenDialog(
    options: OpenDialogOptions
  ): Promise<OpenDialogResult>;

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Export et import de projets
  // ---------------------------------------------------------------------------

  exportProject(
    filePath: string,
    projectName: string,
    projectData: ProjectData
  ): Promise<boolean>;

  importProject(
    filePath: string
  ): Promise<ImportedProject>;

  // ---------------------------------------------------------------------------
  // Sauvegardes horodatées
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Désinfection HTML
  // ---------------------------------------------------------------------------

  sanitizeHtml(
    html: string
  ): Promise<string>;

  // ---------------------------------------------------------------------------
  // Correcteur grammatical hors ligne
  // ---------------------------------------------------------------------------

  getGrammarPrefs(): Promise<GrammarPrefs>;

  saveGrammarPrefs(
    prefs: Partial<GrammarPrefs>
  ): Promise<GrammarPrefs>;

  selectLanguageToolFolder(): Promise<
    LanguageToolFolderResult
  >;

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

  // ---------------------------------------------------------------------------
  // Mise à jour automatique
  // ---------------------------------------------------------------------------

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
