// src/renderer/components/editor/controller/types.ts
// Types du contrôleur de l'éditeur.
// Extraits de useEditorController.ts (étape 4c-1), sans changement de comportement.

import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';
import type { ExportBibleCategory } from '../../../lib/export/build-bible';
import type { ExportPreviewSource } from '../../../lib/export/render-html';
import type { AutoReplaceSettings } from '../../../lib/auto-replace';
import type { TypoHtmlIssue } from '../../../lib/typography-html';
import type { TypoCategory, TypoLanguage } from '../../../../shared/typography';
import type { TypoProjectSettings } from '../../../../shared/typography-project';
import type { WbRegistry } from '../../../lib/wb-registry';
import type { ProjectHistoryResult } from '../../../lib/project-history';
import type { ReplaceMatchInfo, ReplaceOptions } from '../../../lib/dom';
import type { CreateScreenplaySceneOptions } from '../../../lib/screenplay';
import type { StatusStore } from '../editor-status';
import type { InfoAction } from '../../common/Dialogs';
import type {
  ChapterComment,
  ChapterMeta,
  ChapterMetaPatch,
  EditorPrefs,
  ExportSettings,
  GrammarPrefs,
  ItemType,
  ProjectData,
  ProjectsMap,
  ScreenplayProjectData,
  TabRef,
  UiState,
  WbCategoryDef,
  WbItem,
  WbType
} from '../../../../shared/types';

export interface MutableState {
  projects: ProjectsMap;
  projectData: ProjectData;
  uiState: UiState;
  openTabs: TabRef[];
  activeTab: string | null;
  activeType: ItemType;
  editorEl: HTMLElement | null;
  zoom: number;
  nativeSpellcheck: boolean;
  editorPrefs: EditorPrefs;
  grammarPrefs: GrammarPrefs;
  grammarServerReady: boolean;
  grammarStarting: boolean;
  grammarCheckInFlight: boolean;
  /** Une vérification a été demandée pendant qu'une autre était en cours. */
  grammarCheckPending: boolean;
  lastGrammarErrorShown: string | null;
  lastBackupAt: number;
  hasUnsavedChangesSinceLastBackup: boolean;
  largeChapterHighlightCounter: number;
  wbColorVersion: number;
  chapterColorSyncVersion: Map<string, number>;
  ready: boolean;
}

export interface PendingChapterSave {
  html: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Instantané d'historique programmé mais pas encore enregistré. */
export interface PendingHistoryCommit {
  name: string;
  html: string;
}

/** Un cas typographique trouve dans un chapitre. */
export interface TypoReportItem extends TypoHtmlIssue {
  chapter: string;
}

/** Resultat d'une analyse typographique. */
export interface TypoReport {
  /** Cas trouves, dans l'ordre du livre (au plus TYPO_REPORT_LIMIT). */
  items: TypoReportItem[];
  /** Nombre de cas par categorie. */
  counts: Partial<Record<TypoCategory, number>>;
  /** Nombre total de cas (meme au-dela de la limite). */
  total: number;
  /** Nombre de chapitres concernes. */
  chapters: number;
  /** Liste coupee a TYPO_REPORT_LIMIT. */
  truncated: boolean;
  /** Portee chapitre sans chapitre ouvert. */
  noChapter: boolean;
  /** Projet sans chapitres (scenario). */
  unavailable: boolean;
}

/** Resultat d'une correction de toute la portee. */
export interface TypoFixResult {
  count: number;
  chapters: number;
  noChapter: boolean;
  unavailable: boolean;
}

export interface EditorController {
  projectName: string;
  ready: boolean;
  status: StatusStore;
  registry: WbRegistry;

  data(): ProjectData;
  tabs(): TabRef[];
  activeTab(): string | null;
  activeType(): ItemType;
  /** Mode lecture de la fiche active (propre à chaque fiche). */
  isReadMode(): boolean;
  isScreenplayProject(): boolean;
  prefs(): EditorPrefs;
  grammarPrefs(): GrammarPrefs;
  nativeSpellcheckEnabled(): boolean;
  zoom(): number;

  /** Fiche à partir de son identifiant. */
  wbItem(itemId: string): WbItem | undefined;
  /** Texte à afficher pour un onglet (nom du chapitre, titre de scène, nom de fiche). */
  tabLabel(tab: TabRef): string;

  attachEditor(element: HTMLElement | null): void;
  onChapterMounted(name: string): void;
  handleInput(options?: { pasted?: boolean }): void;
  /** Remplacements automatiques : appelé à chaque touche dans l’éditeur de chapitre. */
  handleEditorKeyDown(event: KeyboardEvent): void;
  /** Remplacements automatiques du livre (copie normalisée). */
  getAutoReplace(): AutoReplaceSettings;
  /** Enregistre les remplacements automatiques du livre. */
  setAutoReplace(next: AutoReplaceSettings): void;
  /** Reglages typographiques du livre (copie normalisee). */
  getTypography(): TypoProjectSettings;
  /** Enregistre les reglages typographiques (les cas ignores sont conserves). */
  setTypography(next: TypoProjectSettings): void;
  /** Langue du texte : reglage du livre, sinon langue de l'interface. */
  getTypographyLanguage(): TypoLanguage;
  /** Cas typographiques du chapitre ouvert ou de tout le livre. */
  analyzeTypography(wholeProject: boolean, categories?: readonly TypoCategory[]): TypoReport;
  /** Corrige un seul cas (false s'il ne correspond plus au texte). */
  fixTypographyCase(item: TypoReportItem): boolean;
  /** Ignore un cas : il ne sera plus signale. */
  ignoreTypographyCase(item: TypoReportItem): void;
  /** Corrige tout ce qui peut l'etre dans le chapitre ouvert ou dans tout le livre. */
  fixAllTypography(wholeProject: boolean, categories?: readonly TypoCategory[]): TypoFixResult;
  /** Restaure tous les cas ignores ; renvoie leur nombre. */
  restoreTypographyIgnored(): number;
  handlePaste(event: ReactClipboardEvent<HTMLElement>): void;
  handleEditorClick(event: ReactMouseEvent<HTMLElement>): void;

  /** Pour une fiche, `key` est son identifiant. */
  openItem(key: string, type: ItemType): void;
  switchTab(key: string, type: ItemType): void;
  closeTab(index: number): Promise<void>;
  moveTab(from: number, to: number): void;
  cycleTab(delta: number): void;

  save(): Promise<void>;
  /** Enregistre tout le projet sur le disque (fiches, relations, frise), quel que soit le document actif. */
  saveWholeProject(): Promise<void>;
  setSaveStatus(state: 'saved' | 'pending' | 'error'): void;
  updateStats(): void;

  format(command: string, value?: string): void;
  setFontFamily(font: string): void;
  setFontSizePx(px: number): void;
  insertText(text: string): void;
  undo(): void;
  redo(): void;
  /** Annule la dernière action de projet (chapitres) ; confirmed : création remplie acceptée. */
  undoProjectAction(confirmed?: boolean): ProjectHistoryResult;
  /** Rétablit la dernière action de projet annulée. */
  redoProjectAction(confirmed?: boolean): ProjectHistoryResult;
  setZoom(next: number): void;
  zoomBy(direction: number): void;

  /** Réglages du chapitre (état, couleur, objectif) ; objet vide si rien n’est défini. */
  getChapterMeta(name: string): ChapterMeta;
  /** Modifie les réglages du chapitre puis sauvegarde ; null efface une valeur. */
  setChapterMeta(name: string, patch: ChapterMetaPatch): void;
  /** Note libre du chapitre (texte simple) ; vide si aucune. */
  getChapterNote(name: string): string;
  /** Modifie la note du chapitre puis sauvegarde ; un texte vide supprime la note. */
  setChapterNote(name: string, text: string): void;
  /** Commentaires du chapitre (copies), dans l'ordre de creation. */
  getChapterComments(name: string): ChapterComment[];
  /** Commente un passage du chapitre ouvert ; renvoie l'identifiant, ou null si impossible. */
  addChapterComment(name: string, range: Range, text: string, excerpt: string): string | null;
  /** Modifie le texte ou l'etat (resolu) d'un commentaire, puis sauvegarde. */
  updateChapterComment(name: string, id: string, patch: { text?: string; resolved?: boolean }): void;
  /** Supprime un commentaire et retire son marquage (le texte du chapitre ne change pas). */
  deleteChapterComment(name: string, id: string): void;
  createChapter(name: string): boolean;
  createScene(options?: CreateScreenplaySceneOptions): string | null;
  updateScreenplay(screenplay: ScreenplayProjectData): void;
  renameScene(sceneId: string, workingTitle: string): boolean;
  deleteScene(sceneId: string): Promise<void>;
  reorderScenes(sceneIds: string[]): void;

  /** Crée une fiche et renvoie son identifiant (null si le nom est vide ou déjà pris). */
  createWbItem(name: string, type: WbType): string | null;
  deleteItem(key: string, type: ItemType): Promise<void>;
  renameItem(key: string, newName: string, type: ItemType): Promise<boolean>;
  reorderSidebar(type: ItemType, newOrder: string[]): void;
  updateWbField(itemId: string, fieldKey: string, value: string): void;
  setWbIcon(itemId: string, icon: string): void;
  setWbIconImage(itemId: string, image: string | undefined): void;
  setWbColor(itemId: string, color: string): void;
  setWbAliases(itemId: string, aliases: string[]): boolean;
  /**
   * Bascule le mode lecture d'une fiche. Sans identifiant : la fiche de
   * l'onglet actif. Avec identifiant : cette fiche (utile au panneau latéral).
   */
  toggleReadMode(itemId?: string): void;
  chaptersContaining(itemId: string): string[];
  scenesContaining(itemId: string): { id: string; title: string }[];

  /** Crée ou modifie une catégorie. Renvoie son identifiant (slug). */
  saveCustomType(slug: string | null, definition: WbCategoryDef): string;
  deleteCustomType(slug: string): Promise<void>;
  /** Identifiants des fiches de cette catégorie. */
  itemsUsingType(slug: string): string[];

  replaceAll(findText: string, replacementText: string, wholeProject: boolean, options?: ReplaceOptions): void;
  /** Nombre d'occurrences que replaceAll remplacerait (meme portee, memes options). */
  countMatches(findText: string, wholeProject: boolean, options?: ReplaceOptions): ReplaceMatchInfo;

  updatePrefs(prefs: EditorPrefs): void;
  setNativeSpellcheck(enabled: boolean): Promise<void>;
  setGrammarEnabled(enabled: boolean): Promise<void>;
  refreshGrammarStatus(): Promise<void>;
  resetGrammarError(): void;
  applyGrammarSuggestion(mark: HTMLElement, replacement: string): void;
  ignoreGrammarMark(mark: HTMLElement): void;

  exportAs(kind: 'txt' | 'md' | 'pdf' | 'docx' | 'odt' | 'epub' | 'fountain' | 'project'): Promise<void>;
  /** Reglages d'export du projet (completes si besoin). */
  getExportSettings(): ExportSettings;
  /** Chapitres du roman, dans l'ordre de la barre laterale. */
  exportChapterNames(): string[];
  /** Categories de la bible (avec nombre de fiches) pour la fenetre d'export. */
  exportBibleCategories(): ExportBibleCategory[];
  /** Enregistre les reglages d'export dans le projet. */
  saveExportSettings(settings: ExportSettings): Promise<void>;
  /** Debut du document pour l'apercu de la fenetre d'export. */
  buildExportPreview(settings: ExportSettings): ExportPreviewSource;
  restoreBackup(fileName: string): Promise<void>;
  /** Crée une version nommée du projet (enregistre d'abord les modifications). */
  createNamedVersion(label: string): Promise<void>;
  /** Ajoute la copie d'un chapitre récupéré dans une sauvegarde ; renvoie son nom, ou null. */
  recoverChapterCopy(sourceName: string, html: string, suffix: string): string | null;
  recordWritingStats(): Promise<void>;
  renameProject(newName: string): Promise<boolean>;
}

export interface EditorControllerDeps {
  projectName: string;
  showInfo: (message: string, actions?: InfoAction[]) => void;
  showConfirm: (message: string) => Promise<boolean>;
  onApplyPrefs: (prefs: EditorPrefs) => void;
}
