// src/renderer/components/editor/useEditorController.ts

import { wbLinksEnabled } from '../../lib/wb-links';
import { isExportBusy, setExportBusy } from '../../lib/export/export-busy';
import { buildScreenplayExportDocument } from '../../lib/screenplay-export';
import { buildExportDocument } from '../../lib/export/build-document';
import {
  createBibleSource,
  listBibleCategories,
  type ExportBibleCategory
} from '../../lib/export/build-bible';
import { prepareExportImages } from '../../lib/export/prepare-images';
import { renderExportHtml, type ExportPreviewSource } from '../../lib/export/render-html';
import { renderExportMarkdown, renderExportText } from '../../lib/export/render-text';
import { normalizeExportSettings } from '../../../shared/export-settings';
import { buildFountainText } from '../../../shared/fountain';
import { getSceneHeadingText as getFountainSceneHeading } from '../../lib/screenplay';
import type { ChapterMeta, ChapterMetaPatch, ExportSettings } from '../../../shared/types';
import { applyChapterMetaPatch } from '../../lib/chapter-status';
import type { ChapterComment } from '../../../shared/types';
import { isCommentId, newCommentId, rangeTouchesComment, unwrapComment, unwrapCommentInHtml, wrapRangeWithComment } from '../../lib/comments';
import { removeGrammarMarksOnMentions } from '../../lib/grammar-check';
import { countWordsInHtml } from '../../lib/stats';
import { insertChapterAfter, stripCommentAnchors, uniqueChapterCopyName } from '../../../shared/backup-preview';
import { replaceLibreOfficeFontsInHtml } from './fontAliases';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import { getLanguage, t } from '../../i18n';
import { createEditHistory, type EditHistory } from '../../lib/edit-history';
import {
  applyAutoReplaceBeforeCaret,
  isAutoReplaceTrigger,
  normalizeAutoReplace,
  revertAutoReplace,
  type AutoReplaceSettings,
  type AutoReplaceUndo
} from '../../lib/auto-replace';
import { createMentionIndex, type MentionIndex } from '../../lib/mention-index';
import {
  createWbRegistry,
  type WbLang,
  type WbRegistry
} from '../../lib/wb-registry';
import {
  createWbItemRecord,
  findWbItemByName,
  migrateUiTabs,
  needsWbUpgrade,
  prepareWorldBuilding
} from '../../lib/wb-migration';
import {
  cleanInvalidMentions,
  highlightWorldBuilding,
  removeMentionsAcrossChapters,
  removeMentionsIn,
  renameMentionsIn,
  renameWorldMentionsAcrossChapters,
  syncMentionColors
} from '../../lib/highlight';
import { transformScenesHtml } from '../../lib/mention-index';
import {
  applyGrammarMatches,
  clearGrammarMarks,
  getPlainTextWithMap,
  grammarIgnoreKey,
  removeGrammarGroup,
  replaceGrammarGroup
} from '../../lib/grammar-check';
import { countInHtmlString, debounce, replaceInHtmlString, type ReplaceMatchInfo, type ReplaceOptions } from '../../lib/dom';
import { withPreservedSelection } from '../../lib/selection';
import {
  captureHistoryCaretState,
  placeCaretAfterHistoryJump
} from '../../lib/history-caret';
import {
  getCachedTotalStats,
  invalidateProjectWordCache
} from '../../lib/project-word-cache';
import { getDateKey, getStatsBucket } from '../../lib/stats';
import { renameWritingStatsProject } from '../../lib/writing-stats-rename';
import { describeError } from '../../lib/errors';
import {
  buildBasicScreenplayPrintHtml,
  buildScreenplayPlainText,
  getScenePlainText
} from '../../lib/screenplay-print';
import {
  createScreenplayProject,
  createScreenplayScene,
  getSceneDisplayTitle,
  getScreenplayTextStatistics,
  type CreateScreenplaySceneOptions
} from '../../lib/screenplay';
import { createStatusStore, type StatusStore } from './editor-status';
import { openWbPanel } from './WbSidePanel';
import { WB_OPEN_TAB_EVENT, type WbOpenTabEventDetail } from './ScreenplayElementEditor';
import { cloneWbData, pushWbHistory, type WbHistoryEntry } from '../../lib/wb-history';
import type { InfoAction } from '../common/Dialogs';
import type {
  EditorPrefs,
  GrammarPrefs,
  ItemType,
  ProjectData,
  ProjectsMap,
  ScreenplayProjectData,
  TabRef,
  UiState,
  WbCategoryDef,
  WbField,
  WbItem,
  WbType
} from '../../../shared/types';

const HIGHLIGHT_SIZE_THRESHOLD = 50000;
const HIGHLIGHT_MANY_ITEMS_THRESHOLD = 60;
const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5;
const HISTORY_DEBOUNCE_MS = 700;
const CHAPTER_SAVE_DEBOUNCE_MS = 2500;
const SCREENPLAY_SAVE_DEBOUNCE_MS = 1500;
/** Délai avant d'enregistrer les modifications d'une fiche (champs, mode lecture). */
const WB_SAVE_DEBOUNCE_MS = 800;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Langue de vérification grammaticale.
 *
 * Volontairement indépendante de la langue de l'interface : un roman français
 * reste vérifié en français même si l'interface est en anglais. Un réglage
 * dédié pourra remplacer cette constante plus tard.
 */
const GRAMMAR_LANGUAGE = 'fr';

export const EDITOR_ZOOM_MIN = 0.5;
export const EDITOR_ZOOM_MAX = 2.5;
export const EDITOR_ZOOM_STEP = 0.1;

const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  width: 800,
  fontFamily: "'Roboto', sans-serif",
  lineHeight: 1.6,
  uiFontSize: 14,
  uiFontFamily: "'Roboto', sans-serif",
  timerSoundEnabled: true,
  timerVolume: 0.5,
  timerSoundId: 'chime',
  marginLeft: 80,
  marginRight: 80,
  firstLineIndent: 0
};

interface MutableState {
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

interface PendingChapterSave {
  html: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Instantané d'historique programmé mais pas encore enregistré. */
interface PendingHistoryCommit {
  name: string;
  html: string;
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
  typedWords(): { total: number; byChapter: Record<string, number>; tracked: boolean };
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

function currentWbLang(): WbLang {
  return getLanguage() === 'en' ? 'en' : 'fr';
}

/** Projet roman vide. Le World Building est complété par prepareWorldBuilding. */
function createBlankNovelData(): ProjectData {
  return {
    projectType: 'novel',
    chapters: {},
    world: {},
    writingSessions: [],
    goals: []
  };
}

function isScreenplayData(
  projectData: ProjectData | null | undefined
): projectData is ProjectData & { screenplay: ScreenplayProjectData } {
  return (
    projectData?.projectType === 'screenplay' &&
    Boolean(projectData.screenplay)
  );
}

function getProjectWordTotal(projectData: ProjectData): number {
  if (isScreenplayData(projectData)) {
    return getScreenplayTextStatistics(projectData.screenplay).words;
  }

  return getCachedTotalStats(projectData).words;
}

function countText(text: string): { words: number; chars: number } {
  const normalized = text.trim();

  return {
    words: normalized ? normalized.split(/\s+/).filter(Boolean).length : 0,
    chars: normalized.length
  };
}

function activeEditableElement(): HTMLElement | null {
  const active = document.activeElement;

  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }

  return null;
}

function touchWbItem(item: WbItem): void {
  item.updatedAt = new Date().toISOString();
}

/**
 * Retire une fiche supprimée des relations et de la frise.
 * (Les dossiers ne référencent pas les fiches : c'est la fiche qui porte
 * son folderId, il n'y a donc rien à nettoyer de ce côté.)
 */
function detachWbItem(data: ProjectData, itemId: string): void {
  if (Array.isArray(data.wbRelations)) {
    data.wbRelations = data.wbRelations.filter(
      (relation) =>
        relation.sourceId !== itemId && relation.targetId !== itemId
    );
  }

  if (Array.isArray(data.wbTimeline)) {
    data.wbTimeline = data.wbTimeline.map((event) =>
      event.itemIds.includes(itemId)
        ? { ...event, itemIds: event.itemIds.filter((id) => id !== itemId) }
        : event
    );
  }
}

/** Valeurs par défaut communes au chargement et à la restauration. */
function ensureProjectDefaults(projectData: ProjectData): void {
  if (!projectData.projectType) {
    projectData.projectType = projectData.screenplay ? 'screenplay' : 'novel';
  }

  projectData.chapters = projectData.chapters || {};
  projectData.world = projectData.world || {};
  projectData.writingSessions = Array.isArray(projectData.writingSessions)
    ? projectData.writingSessions
    : [];
  const rawChapterMeta: unknown = projectData.chapterMeta;
  if (rawChapterMeta !== undefined && (typeof rawChapterMeta !== 'object' || rawChapterMeta === null || Array.isArray(rawChapterMeta))) {
    delete projectData.chapterMeta;
  }
  const rawChapterNotes: unknown = projectData.chapterNotes;
  if (rawChapterNotes !== undefined && (typeof rawChapterNotes !== 'object' || rawChapterNotes === null || Array.isArray(rawChapterNotes))) {
    delete projectData.chapterNotes;
  }
  const rawChapterComments: unknown = projectData.chapterComments;
  if (rawChapterComments !== undefined && (typeof rawChapterComments !== 'object' || rawChapterComments === null || Array.isArray(rawChapterComments))) {
    delete projectData.chapterComments;
  }
  projectData.goals = Array.isArray(projectData.goals) ? projectData.goals : [];
}

export function useEditorController({
  projectName,
  showInfo,
  showConfirm,
  onApplyPrefs
}: EditorControllerDeps): EditorController {
  const [, bump] = useReducer((value: number) => value + 1, 0);

  const stateRef = useRef<MutableState>({
    projects: {},
    projectData: createBlankNovelData(),
    uiState: {},
    openTabs: [],
    activeTab: null,
    activeType: 'chapter',
    editorEl: null,
    zoom: 1,
    nativeSpellcheck: true,
    editorPrefs: DEFAULT_EDITOR_PREFS,
    grammarPrefs: {
      enabled: false,
      languageToolPath: null,
      port: 8081
    },
    grammarServerReady: false,
    grammarStarting: false,
    grammarCheckInFlight: false,
    grammarCheckPending: false,
    lastGrammarErrorShown: null,
    lastBackupAt: 0,
    hasUnsavedChangesSinceLastBackup: false,
    largeChapterHighlightCounter: 0,
    wbColorVersion: 0,
    chapterColorSyncVersion: new Map(),
    ready: false
  });

  const s = stateRef.current;

  const status = useMemo(() => createStatusStore(), []);

  const historyRef = useRef<EditHistory>(createEditHistory());

  const registryRef = useRef<WbRegistry>(
    createWbRegistry(() => stateRef.current.projectData, currentWbLang)
  );

  const indexRef = useRef<MentionIndex>(
    createMentionIndex(() => stateRef.current.projectData)
  );

  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Instantané en attente d'enregistrement dans l'historique. */
  const pendingHistoryRef = useRef<PendingHistoryCommit | null>(null);
  // Dernier remplacement automatique, pour que Ctrl+Z puisse le défaire.
  const autoReplaceRef = useRef<(AutoReplaceUndo & { chapter: string; inputs: number }) | null>(null);

  /**
   * Fautes ignorées pendant la session (clé : règle + texte fautif). Sans
   * cette mémoire, une faute ignorée réapparaissait à la frappe suivante.
   */
  const ignoredGrammarRef = useRef<Set<string>>(new Set());

  const screenplaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /** Sauvegarde différée des fiches (champs, mode lecture). */
  const wbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingChapterSavesRef = useRef<Map<string, PendingChapterSave>>(
    new Map()
  );

  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * Permet à runGrammarCheck de reprogrammer une vérification sans dépendre
   * directement de debouncedGrammarCheck (qui est défini après lui).
   */
  const requestGrammarCheckRef = useRef<() => void>(() => undefined);

  /** Utilisé au démontage pour enregistrer ce qui était encore en attente. */
  const saveAllRef = useRef<() => Promise<void>>(async () => undefined);

  /** Vrai une fois le projet renommé : plus aucune sauvegarde sous l'ancien nom. */
  const renamedRef = useRef(false);

  const api = useRef<EditorController | null>(null);

  const history = historyRef.current;
  const registry = registryRef.current;
  const mentionIndex = indexRef.current;

  const enqueuePersistence = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = persistenceQueueRef.current.then(operation, operation);

      persistenceQueueRef.current = result.then(
        () => undefined,
        () => undefined
      );

      return result;
    },
    []
  );

  const setSaveStatus = useCallback(
    (state: 'saved' | 'pending' | 'error'): void => {
      if (state === 'saved') {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');

        status.set({
          saveState: 'saved',
          savedAt: `${hours}:${minutes}`
        });

        return;
      }

      status.set({ saveState: state });
    },
    [status]
  );

  const updateUndoRedo = useCallback((): void => {
    const enabled = s.activeType === 'chapter' && Boolean(s.activeTab);

    status.set({
      canUndo: enabled && history.canUndo(s.activeTab),
      canRedo: enabled && history.canRedo(s.activeTab)
    });
  }, [history, s, status]);

  const updateStats = useCallback((): void => {
    if (s.activeType === 'world') {
      status.set({
        sheetMode: true,
        selectionActive: false,
        totalWords: getProjectWordTotal(s.projectData)
      });

      return;
    }

    if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
      const screenplay = s.projectData.screenplay;
      const selection = window.getSelection();

      let text = '';
      let selectionActive = false;

      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const startElement = range.startContainer.parentElement;
        const endElement = range.endContainer.parentElement;

        const belongsToScreenplay =
          Boolean(startElement?.closest('.screenplay-editor')) &&
          Boolean(endElement?.closest('.screenplay-editor'));

        if (belongsToScreenplay) {
          text = range.toString();
          selectionActive = Boolean(text.trim());
        }
      }

      if (!selectionActive && s.activeTab) {
        text = getScenePlainText(screenplay, s.activeTab);
      }

      const current = countText(text);

      status.set({
        sheetMode: false,
        words: current.words,
        chars: current.chars,
        selectionActive,
        totalWords: getScreenplayTextStatistics(screenplay).words,
        canUndo: false,
        canRedo: false
      });

      return;
    }

    const editor = s.editorEl;

    if (!editor) {
      status.set({
        sheetMode: false,
        words: 0,
        chars: 0,
        selectionActive: false,
        totalWords: getProjectWordTotal(s.projectData)
      });

      return;
    }

    const selection = window.getSelection();

    let words = 0;
    let chars = 0;
    let selectionActive = false;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      const belongsToEditor =
        editor.contains(range.startContainer) &&
        editor.contains(range.endContainer);

      if (belongsToEditor && !range.collapsed) {
        const selectedText = range.toString().trim();

        if (selectedText) {
          selectionActive = true;
          words = selectedText.split(/\s+/).filter(Boolean).length;
          chars = selectedText.length;
        }
      }
    }

    if (!selectionActive) {
      const text = editor.innerText.trim();

      words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      chars = text.length;
    }

    const totalStats = getCachedTotalStats(s.projectData);

    status.set({
      sheetMode: false,
      words,
      chars,
      selectionActive,
      totalWords: totalStats.words
    });
  }, [s, status]);

  /*
   * Compteur des mots tapés, utilisé par les sessions d'écriture.
   * Seules les frappes dans le chapitre ouvert comptent : ouvrir, créer
   * ou synchroniser un chapitre ne change rien. Les mots collés sont mis
   * de côté pour être retirés des statistiques du jour.
   */
  const typedWordsRef = useRef<{
    chapter: string | null;
    total: number;
    byChapter: Record<string, number>;
  }>({ chapter: null, total: 0, byChapter: {} });

  const pendingPastedWordsRef = useRef(0);

  const recordTypedWords = (
    chapterName: string,
    previousHtml: string | undefined,
    nextHtml: string,
    pasted: boolean
  ): void => {
    const tracker = typedWordsRef.current;

    // Premier changement vu dans ce chapitre : on prend seulement la référence.
    if (tracker.chapter !== chapterName) {
      tracker.chapter = chapterName;
      return;
    }

    if (previousHtml === undefined || previousHtml === nextHtml) {
      return;
    }

    const delta = countWordsInHtml(nextHtml) - countWordsInHtml(previousHtml);

    if (delta === 0) {
      return;
    }

    if (pasted) {
      pendingPastedWordsRef.current += delta;
      return;
    }

    tracker.total += delta;
    tracker.byChapter[chapterName] = (tracker.byChapter[chapterName] ?? 0) + delta;
  };

  const recordWritingStats = useCallback(async (): Promise<void> => {
    if (renamedRef.current) {
      return;
    }

    try {
      // Dans la file d'enregistrement : deux appels rapprochés ne peuvent plus
      // lire la même valeur puis s'écraser l'un l'autre.
      await enqueuePersistence(async () => {
        const stats = (await window.api.getWritingStats()) || {};
        const bucket = getStatsBucket(stats, projectName);
        const todayKey = getDateKey(new Date());
        const currentTotal = getProjectWordTotal(s.projectData);

        // Les mots collés depuis le dernier enregistrement ne comptent pas
        // comme des mots écrits aujourd'hui.
        const pastedWords = pendingPastedWordsRef.current;
        pendingPastedWordsRef.current = 0;

        if (
          pastedWords !== 0 &&
          bucket.baselineDate === todayKey &&
          typeof bucket.baselineWords === 'number'
        ) {
          bucket.baselineWords += pastedWords;
        }

        if (bucket.baselineDate !== todayKey) {
          // Nouveau jour : la référence devient le dernier total enregistré
          // (référence précédente + mots de ce jour-là), pour ne pas perdre
          // les mots tapés avant le premier enregistrement de la journée.
          const previousKey = bucket.baselineDate;
          const previousWords =
            previousKey &&
            typeof bucket.baselineWords === 'number' &&
            typeof bucket.history[previousKey] === 'number'
              ? bucket.history[previousKey]
              : null;
          const lastKnownTotal =
            previousWords === null
              ? currentTotal
              : bucket.baselineWords + previousWords;

          bucket.baselineDate = todayKey;
          bucket.baselineWords =
            previousWords === null ? lastKnownTotal : lastKnownTotal + pastedWords;
          bucket.history[todayKey] = currentTotal - bucket.baselineWords;

          if (bucket.history[todayKey] === undefined) {
            bucket.history[todayKey] = 0;
          }
        } else {
          bucket.history[todayKey] = currentTotal - bucket.baselineWords;
        }

        await window.api.saveWritingStats(stats);
      });
    } catch (error) {
      console.error(
        "Échec de l'enregistrement des statistiques d'écriture :",
        error
      );
    }
  }, [enqueuePersistence, projectName, s]);

  const maybeCreateBackup = useCallback(async (): Promise<void> => {
    if (!s.hasUnsavedChangesSinceLastBackup) {
      return;
    }

    const now = Date.now();

    if (now - s.lastBackupAt < BACKUP_INTERVAL_MS) {
      return;
    }

    try {
      await window.api.createBackup(projectName, s.projectData);

      s.lastBackupAt = now;
      s.hasUnsavedChangesSinceLastBackup = false;
    } catch (error) {
      console.error('Échec de la sauvegarde automatique horodatée :', error);
    }
  }, [projectName, s]);

  const persistUiState = useCallback(async (): Promise<void> => {
    s.uiState[projectName] = {
      openTabs: s.openTabs,
      activeTab: s.activeTab,
      activeType: s.activeType
    };

    await window.api.saveUiState(s.uiState);
  }, [projectName, s]);

  const cancelPendingChapterSave = useCallback((chapterName: string): void => {
    const pending = pendingChapterSavesRef.current.get(chapterName);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    pendingChapterSavesRef.current.delete(chapterName);
  }, []);

  const cancelAllPendingChapterSaves = useCallback((): void => {
    pendingChapterSavesRef.current.forEach((pending) => {
      clearTimeout(pending.timer);
    });

    pendingChapterSavesRef.current.clear();
  }, []);

  const cancelPendingScreenplaySave = useCallback((): void => {
    if (screenplaySaveTimerRef.current) {
      clearTimeout(screenplaySaveTimerRef.current);
      screenplaySaveTimerRef.current = null;
    }
  }, []);

  const cancelPendingWbSave = useCallback((): void => {
    if (wbSaveTimerRef.current) {
      clearTimeout(wbSaveTimerRef.current);
      wbSaveTimerRef.current = null;
    }
  }, []);

  const saveChapterSnapshot = useCallback(
    async (
      chapterName: string,
      html: string,
      options?: { saveUiState?: boolean }
    ): Promise<void> => {
      if (renamedRef.current) {
        return;
      }

      if (s.projectData.chapters[chapterName] === undefined) {
        return;
      }

      cancelPendingChapterSave(chapterName);

      s.projectData.chapters[chapterName] = html;
      s.projects[projectName] = s.projectData;
      s.hasUnsavedChangesSinceLastBackup = true;

      try {
        await enqueuePersistence(async () => {
          await window.api.saveProjectChapter(projectName, chapterName, html);

          if (options?.saveUiState) {
            await persistUiState();
          }
        });

        const currentHtml = s.projectData.chapters[chapterName];
        const stillPending = pendingChapterSavesRef.current.has(chapterName);

        if (currentHtml === html && !stillPending) {
          setSaveStatus('saved');
        }

        void recordWritingStats();
        void maybeCreateBackup();
      } catch (error) {
        console.error(
          `Échec de la sauvegarde du chapitre "${chapterName}" :`,
          error
        );

        setSaveStatus('error');
      }
    },
    [cancelPendingChapterSave, enqueuePersistence, maybeCreateBackup, persistUiState, projectName, recordWritingStats, s, setSaveStatus]
  );

  const scheduleChapterSave = useCallback(
    (chapterName: string, html: string): void => {
      cancelPendingChapterSave(chapterName);

      const timer = setTimeout(() => {
        pendingChapterSavesRef.current.delete(chapterName);
        void saveChapterSnapshot(chapterName, html);
      }, CHAPTER_SAVE_DEBOUNCE_MS);

      pendingChapterSavesRef.current.set(chapterName, { html, timer });
    },
    [cancelPendingChapterSave, saveChapterSnapshot]
  );

  const saveAll = useCallback(async (): Promise<void> => {
    if (renamedRef.current) {
      return;
    }

    cancelAllPendingChapterSaves();
    cancelPendingScreenplaySave();
    cancelPendingWbSave();

    if (s.activeType === 'chapter' && s.activeTab && s.editorEl) {
      s.projectData.chapters[s.activeTab] = s.editorEl.innerHTML;
    }

    s.projects[projectName] = s.projectData;
    s.hasUnsavedChangesSinceLastBackup = true;

    try {
      await enqueuePersistence(async () => {
        await window.api.saveProjects(s.projects);
        await persistUiState();
      });

      setSaveStatus('saved');

      void recordWritingStats();
      void maybeCreateBackup();
    } catch (error) {
      console.error('Échec de la sauvegarde complète :', error);
      setSaveStatus('error');
    }
  }, [cancelAllPendingChapterSaves, cancelPendingScreenplaySave, cancelPendingWbSave, enqueuePersistence, maybeCreateBackup, persistUiState, projectName, recordWritingStats, s, setSaveStatus]);

  saveAllRef.current = saveAll;

  const scheduleScreenplaySave = useCallback((): void => {
    cancelPendingScreenplaySave();

    screenplaySaveTimerRef.current = setTimeout(() => {
      screenplaySaveTimerRef.current = null;
      void saveAll();
    }, SCREENPLAY_SAVE_DEBOUNCE_MS);
  }, [cancelPendingScreenplaySave, saveAll]);

  const scheduleWbSave = useCallback((): void => {
    cancelPendingWbSave();

    wbSaveTimerRef.current = setTimeout(() => {
      wbSaveTimerRef.current = null;
      void saveAll();
    }, WB_SAVE_DEBOUNCE_MS);
  }, [cancelPendingWbSave, saveAll]);

  const save = useCallback(async (): Promise<void> => {
    // Une modification de fiche en attente : on enregistre tout de suite.
    if (wbSaveTimerRef.current) {
      await saveAll();
      return;
    }

    if (s.activeType === 'chapter' && s.activeTab && s.editorEl) {
      const chapterName = s.activeTab;
      const html = s.editorEl.innerHTML;

      s.projectData.chapters[chapterName] = html;

      await saveChapterSnapshot(chapterName, html, { saveUiState: true });
      return;
    }

    if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
      await saveAll();
      return;
    }

    try {
      await enqueuePersistence(persistUiState);
      setSaveStatus('saved');
    } catch (error) {
      console.error("Échec de la sauvegarde de l'état de l'éditeur :", error);
      setSaveStatus('error');
    }
  }, [enqueuePersistence, persistUiState, s, saveAll, saveChapterSnapshot, setSaveStatus]);

  const updateGrammarStatus = useCallback((): void => {
    status.set({
      grammarEnabled: s.grammarPrefs.enabled,
      grammarReady: s.grammarServerReady,
      grammarStarting: s.grammarStarting
    });
  }, [s, status]);

  /**
   * Vérification grammaticale.
   *
   * - le texte est lu SANS retirer les soulignements existants (les <mark>
   *   ne changent pas le texte) : plus de clignotement pendant la requête ;
   * - la langue de vérification est le français, quelle que soit la langue
   *   de l'interface ;
   * - les fautes ignorées pendant la session sont filtrées ;
   * - si le texte a changé pendant la requête, les résultats (devenus
   *   faux) sont ignorés et une nouvelle vérification est programmée ;
   * - une demande reçue pendant une vérification en cours n'est plus perdue.
   */
  const runGrammarCheck = useCallback(async (): Promise<void> => {
    if (!s.grammarPrefs.enabled || !s.grammarServerReady) {
      return;
    }

    if (s.activeType !== 'chapter' || !s.activeTab) {
      return;
    }

    const editor = s.editorEl;

    if (!editor) {
      return;
    }

    if (s.grammarCheckInFlight) {
      s.grammarCheckPending = true;
      return;
    }

    const checkedChapter = s.activeTab;

    s.grammarCheckInFlight = true;
    s.grammarCheckPending = false;

    let needsRerun = false;

    try {
      const text = getPlainTextWithMap(editor).text;

      if (text.trim().length === 0) {
        withPreservedSelection(editor, () => {
          clearGrammarMarks(editor);
        });
        return;
      }

      const matches = await window.api.checkGrammar(text, GRAMMAR_LANGUAGE);

      const stillSameEditor =
        s.activeType === 'chapter' &&
        s.activeTab === checkedChapter &&
        s.editorEl === editor &&
        editor.isConnected;

      if (!stillSameEditor) {
        return;
      }

      const currentText = getPlainTextWithMap(editor).text;

      if (currentText !== text) {
        // Le texte a été modifié pendant la requête : les positions renvoyées
        // par LanguageTool ne correspondent plus. On revérifiera.
        needsRerun = true;
        return;
      }

      const ignored = ignoredGrammarRef.current;

      const visibleMatches =
        ignored.size === 0
          ? matches
          : matches.filter(
              (match) =>
                !ignored.has(
                  grammarIgnoreKey(
                    match.ruleId,
                    text.slice(match.offset, match.offset + match.length)
                  )
                )
            );

      withPreservedSelection(editor, () => {
        clearGrammarMarks(editor);
        applyGrammarMatches(
          editor,
          visibleMatches,
          getPlainTextWithMap(editor).nodes
        );
      });
    } catch (error) {
      const message = describeError(error);

      console.error('Erreur du correcteur de grammaire :', error);

      if (s.lastGrammarErrorShown !== message) {
        s.lastGrammarErrorShown = message;
        s.grammarServerReady = false;

        updateGrammarStatus();

        showInfo(t('grammarCheckFailedAlert', { error: message }));
      }
    } finally {
      s.grammarCheckInFlight = false;

      if (needsRerun || s.grammarCheckPending) {
        s.grammarCheckPending = false;
        requestGrammarCheckRef.current();
      }
    }
  }, [s, showInfo, updateGrammarStatus]);

  const debouncedGrammarCheck = useMemo(
    () =>
      debounce(() => {
        void runGrammarCheck();
      }, 1500),
    [runGrammarCheck]
  );

  requestGrammarCheckRef.current = debouncedGrammarCheck;

  const refreshGrammarStatus = useCallback(async (): Promise<void> => {
    status.set({ grammarMessage: t('grammarStatusChecking') });

    const javaInfo = await window.api.checkJavaAvailable();

    status.set({ javaInfo });

    const javaAvailable = javaInfo.available && !javaInfo.outdated;

    if (!s.grammarPrefs.enabled) {
      status.set({ grammarMessage: t('grammarStatusDisabled') });
      updateGrammarStatus();
      return;
    }

    if (!javaAvailable || !s.grammarPrefs.languageToolPath) {
      status.set({ grammarMessage: '' });
      updateGrammarStatus();
      return;
    }

    status.set({ grammarMessage: t('grammarStatusStarting') });

    s.grammarStarting = true;
    updateGrammarStatus();

    try {
      const result = await window.api.startGrammarServer();

      s.grammarServerReady = true;

      status.set({
        grammarMessage: t('grammarStatusReady', { port: result.port })
      });

      debouncedGrammarCheck();
    } catch (error) {
      s.grammarServerReady = false;

      status.set({
        grammarMessage: t('grammarStatusError', {
          error: describeError(error)
        })
      });
    } finally {
      s.grammarStarting = false;
      updateGrammarStatus();
    }
  }, [debouncedGrammarCheck, s, status, updateGrammarStatus]);

  /**
   * Surlignage World Building. Renvoie vrai si le contenu a changé.
   *
   * highlightWorldBuilding ajoute / retire des <span> : on préserve la
   * sélection de l'utilisateur autour de cette mutation.
   */
  const highlight = useCallback((): boolean => {
    if (s.activeType !== 'chapter' || !s.editorEl) {
      return false;
    }

    const editor = s.editorEl;

    return Boolean(
      withPreservedSelection(editor, () =>
        highlightWorldBuilding(editor, s.projectData, registry)
      )
    );
  }, [registry, s]);

  const debouncedHighlight = useMemo(
    () =>
      debounce(() => {
        const editor = s.editorEl;
        const chapterName = s.activeType === 'chapter' ? s.activeTab : null;
        const chapterSize = editor ? editor.innerText.length : 0;
        const worldItemCount = Object.keys(s.projectData.world).length;

        let shouldHighlightNow = true;

        if (
          chapterSize > HIGHLIGHT_SIZE_THRESHOLD ||
          worldItemCount > HIGHLIGHT_MANY_ITEMS_THRESHOLD
        ) {
          s.largeChapterHighlightCounter += 1;

          shouldHighlightNow =
            s.largeChapterHighlightCounter %
              HIGHLIGHT_LARGE_CHAPTER_EVERY_N ===
            0;
        }

        if (shouldHighlightNow) {
          highlight();
        }

        if (
          editor &&
          chapterName &&
          s.activeType === 'chapter' &&
          s.activeTab === chapterName
        ) {
          const finalHtml = editor.innerHTML;

          s.projectData.chapters[chapterName] = finalHtml;

          mentionIndex.updateForChapter(chapterName, finalHtml);
          history.resyncOnly(chapterName, finalHtml);

          updateUndoRedo();
          scheduleChapterSave(chapterName, finalHtml);
        }
      }, 1000),
    [highlight, history, mentionIndex, s, scheduleChapterSave, updateUndoRedo]
  );

  /**
   * Enregistre immédiatement l'instantané d'historique en attente, s'il y en
   * a un. Pour le chapitre affiché, on prend le contenu le plus récent de
   * l'éditeur (frappe des dernières millisecondes comprise).
   */
  const flushPendingHistoryCommit = useCallback((): void => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    const pending = pendingHistoryRef.current;
    pendingHistoryRef.current = null;

    if (!pending) {
      return;
    }

    const editor = s.editorEl;

    const isDisplayed =
      Boolean(editor) &&
      s.activeType === 'chapter' &&
      s.activeTab === pending.name;

    history.commit(
      pending.name,
      isDisplayed && editor ? editor.innerHTML : pending.html
    );
  }, [history, s]);

  const scheduleHistoryCommit = useCallback(
    (name: string | null, html: string): void => {
      if (!name) {
        return;
      }

      // Un instantané en attente pour un AUTRE chapitre (changement d'onglet
      // pendant le délai) est enregistré tout de suite au lieu d'être perdu.
      const previous = pendingHistoryRef.current;

      if (previous && previous.name !== name) {
        history.commit(previous.name, previous.html);
      }

      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
      }

      pendingHistoryRef.current = { name, html };

      historyTimerRef.current = setTimeout(() => {
        historyTimerRef.current = null;
        pendingHistoryRef.current = null;

        history.commit(name, html);
        updateUndoRedo();
      }, HISTORY_DEBOUNCE_MS);
    },
    [history, updateUndoRedo]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const projects = await window.api.getProjects();

      const existed = Boolean(projects[projectName]);
      let projectData = projects[projectName];
      let mustSaveProjects = false;

      if (projectData && !projectData.chapters && !projectData.world) {
        // Très ancien format : le projet ne contenait que les chapitres.
        projectData = {
          ...createBlankNovelData(),
          chapters: projectData as unknown as Record<string, string>
        };

        mustSaveProjects = true;
      } else if (!projectData) {
        projectData = createBlankNovelData();
      }

      ensureProjectDefaults(projectData);

      if (projectData.projectType === 'screenplay') {
        if (!projectData.screenplay) {
          projectData.screenplay = createScreenplayProject({
            title: projectName
          }).screenplay;
        }

        if (
          projectData.screenplay &&
          !Array.isArray(projectData.screenplay.scenes)
        ) {
          projectData.screenplay.scenes = [];
        }

        if (
          projectData.screenplay &&
          projectData.screenplay.scenes.length === 0
        ) {
          projectData.screenplay.scenes.push(
            createScreenplayScene({
              interiorExterior: 'INT.',
              time:
                projectData.screenplay.settings.conventionLanguage === 'en'
                  ? 'DAY'
                  : 'JOUR'
            })
          );
        }
      }

      // World Building : conversion au format 2 (filet de sécurité, la page
      // des projets la fait normalement déjà) puis valeurs par défaut.
      if (
        needsWbUpgrade(projectData) &&
        Object.keys(projectData.world).length > 0
      ) {
        try {
          await window.api.createBackup(projectName, projectData);
        } catch (error) {
          console.error(
            'Échec de la sauvegarde avant conversion du World Building :',
            error
          );
        }
      }

      const prepared = prepareWorldBuilding(projectData, currentWbLang());

      projectData = prepared.data;

      if (prepared.changed) {
        mustSaveProjects = true;
      }

      if (mustSaveProjects && existed) {
        projects[projectName] = projectData;

        try {
          await window.api.saveProjects(projects);
        } catch (error) {
          console.error('Échec de la sauvegarde du projet converti :', error);
        }
      }

      const uiState = await window.api.getUiState();

      if (uiState[projectName]) {
        const migrated = migrateUiTabs(uiState[projectName], projectData);

        if (migrated.changed) {
          uiState[projectName] = migrated.ui;
        }
      }

      const savedProjectState = uiState[projectName];

      let openTabs = savedProjectState?.openTabs || [];
      let activeTab = savedProjectState?.activeTab || null;
      let activeType: ItemType = savedProjectState?.activeType || 'chapter';

      if (isScreenplayData(projectData)) {
        const sceneIds = new Set(
          projectData.screenplay.scenes.map((scene) => scene.id)
        );

        openTabs = openTabs.filter((tab) => {
          if (tab.type === 'scene') {
            return sceneIds.has(tab.name);
          }

          if (tab.type === 'world') {
            return Boolean(projectData.world[tab.name]);
          }

          return false;
        });

        if (activeType === 'scene' && activeTab && !sceneIds.has(activeTab)) {
          activeTab = null;
        }

        if (
          activeType === 'world' &&
          activeTab &&
          !projectData.world[activeTab]
        ) {
          activeTab = null;
        }

        if (activeType === 'chapter') {
          activeTab = null;
        }

        if (!activeTab) {
          const firstScene = projectData.screenplay.scenes[0];

          if (firstScene) {
            activeTab = firstScene.id;
            activeType = 'scene';

            if (
              !openTabs.some(
                (tab) => tab.type === 'scene' && tab.name === firstScene.id
              )
            ) {
              openTabs = [{ name: firstScene.id, type: 'scene' }, ...openTabs];
            }
          }
        }
      } else {
        openTabs = openTabs.filter((tab) => {
          if (tab.type === 'chapter') {
            return projectData.chapters[tab.name] !== undefined;
          }

          if (tab.type === 'world') {
            return Boolean(projectData.world[tab.name]);
          }

          return false;
        });

        if (
          activeType === 'chapter' &&
          activeTab &&
          projectData.chapters[activeTab] === undefined
        ) {
          activeTab = null;
        }

        if (
          activeType === 'world' &&
          activeTab &&
          !projectData.world[activeTab]
        ) {
          activeTab = null;
        }

        if (activeType === 'scene') {
          activeTab = null;
          activeType = 'chapter';
        }
      }

      if (!activeTab && openTabs.length > 0) {
        activeTab = openTabs[0].name;
        activeType = openTabs[0].type;
      }

      const prefs =
        (await window.api.getEditorPrefs()) || DEFAULT_EDITOR_PREFS;

      const nativeSpellcheck = await window.api.getNativeSpellcheck();
      const grammarPrefs = await window.api.getGrammarPrefs();

      if (cancelled) {
        return;
      }

      projects[projectName] = projectData;

      s.projects = projects;
      s.projectData = projectData;
      s.uiState = uiState;
      s.openTabs = openTabs;
      s.activeTab = activeTab;
      s.activeType = activeType;
      s.editorPrefs = { ...DEFAULT_EDITOR_PREFS, ...prefs };
      s.nativeSpellcheck = nativeSpellcheck;
      s.grammarPrefs = grammarPrefs;
      s.ready = true;

      registry.bumpVersion();

      if (!isScreenplayData(projectData)) {
        invalidateProjectWordCache(projectData);
        getCachedTotalStats(projectData);
      }

      mentionIndex.rebuildAll();

      onApplyPrefs(s.editorPrefs);

      updateGrammarStatus();
      updateStats();

      bump();

      void persistUiState();

      if (grammarPrefs.enabled) {
        void refreshGrammarStatus();
      }
    })();

    return () => {
      cancelled = true;
    };

    // Le contrôleur est réinitialisé à chaque changement de projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  useEffect(() => {
    const unsubscribe = window.api.onGrammarServerStopped(() => {
      s.grammarServerReady = false;
      s.lastGrammarErrorShown = null;

      updateGrammarStatus();

      if (s.grammarPrefs.enabled) {
        void refreshGrammarStatus();
      }
    });

    return unsubscribe;
  }, [refreshGrammarStatus, s, updateGrammarStatus]);

  /**
   * Ctrl+clic sur une mention dans une scène : ScreenplayElementEditor
   * envoie un signal, et la fiche s'ouvre ici dans un onglet.
   */
  useEffect(() => {
    const handleOpenTab = (event: Event): void => {
      const itemId = (event as CustomEvent<WbOpenTabEventDetail>).detail?.itemId;

      if (!itemId || !stateRef.current.projectData.world[itemId]) {
        return;
      }

      api.current?.openItem(itemId, 'world');
    };

    window.addEventListener(WB_OPEN_TAB_EVENT, handleOpenTab);

    return () => {
      window.removeEventListener(WB_OPEN_TAB_EVENT, handleOpenTab);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }

      pendingHistoryRef.current = null;

      // Ce qui attendait encore d'être enregistré est sauvegardé maintenant
      // au lieu d'être perdu à la fermeture de l'éditeur.
      const hadPendingWork =
        pendingChapterSavesRef.current.size > 0 ||
        screenplaySaveTimerRef.current !== null ||
        wbSaveTimerRef.current !== null;

      if (screenplaySaveTimerRef.current) {
        clearTimeout(screenplaySaveTimerRef.current);
        screenplaySaveTimerRef.current = null;
      }

      if (wbSaveTimerRef.current) {
        clearTimeout(wbSaveTimerRef.current);
        wbSaveTimerRef.current = null;
      }

      pendingChapterSavesRef.current.forEach((pending) => {
        clearTimeout(pending.timer);
      });

      pendingChapterSavesRef.current.clear();

      if (hadPendingWork && stateRef.current.ready) {
        void saveAllRef.current();
      }
    };
  }, []);

  /*
   * Fermeture de la fenêtre : le processus principal attend la fin de cet
   * enregistrement complet (5 secondes au maximum) avant de fermer.
   */
  useEffect(() => {
    return window.api.onBeforeClose(async () => {
      if (!stateRef.current.ready) {
        return;
      }

      await saveAllRef.current();
    });
  }, []);

  if (!api.current) {
    const ctrl: EditorController = {
      projectName,
      ready: false,
      status,
      registry,

      data: () => stateRef.current.projectData,
      tabs: () => stateRef.current.openTabs,
      activeTab: () => stateRef.current.activeTab,
      activeType: () => stateRef.current.activeType,

      isReadMode: () => {
        const state = stateRef.current;

        if (state.activeType !== 'world' || !state.activeTab) {
          return false;
        }

        return Boolean(state.projectData.world[state.activeTab]?.readMode);
      },

      isScreenplayProject: () => isScreenplayData(stateRef.current.projectData),
      prefs: () => stateRef.current.editorPrefs,
      grammarPrefs: () => stateRef.current.grammarPrefs,
      nativeSpellcheckEnabled: () => stateRef.current.nativeSpellcheck,
      zoom: () => stateRef.current.zoom,

      wbItem: (itemId) => stateRef.current.projectData.world[itemId],

      tabLabel(tab) {
        if (tab.type === 'world') {
          return s.projectData.world[tab.name]?.name || tab.name;
        }

        if (tab.type === 'scene' && isScreenplayData(s.projectData)) {
          const scenes = s.projectData.screenplay.scenes;
          const index = scenes.findIndex((scene) => scene.id === tab.name);

          if (index >= 0) {
            return getSceneDisplayTitle(
              scenes[index],
              index,
              s.projectData.screenplay.settings.conventionLanguage
            );
          }
        }

        return tab.name;
      },

      attachEditor(element) {
        s.editorEl = element;

        if (element) {
          element.style.zoom = String(s.zoom);
        }
      },

      onChapterMounted(name) {
        const editor = s.editorEl;

        if (!editor) {
          return;
        }

        history.sync(name, editor.innerHTML);

        s.largeChapterHighlightCounter = 0;

        highlight();

        if (s.chapterColorSyncVersion.get(name) !== s.wbColorVersion) {
          withPreservedSelection(editor, () => {
            syncMentionColors(editor, s.projectData, registry);
          });

          s.chapterColorSyncVersion.set(name, s.wbColorVersion);
        }

        // Anciens soulignements enregistrés sur des noms de l'Atelier : retirés.
        removeGrammarMarksOnMentions(editor);

        const finalHtml = editor.innerHTML;

        s.projectData.chapters[name] = finalHtml;
        // Chapitre chargé : nouvelle référence pour le compteur de frappe.
        typedWordsRef.current.chapter = name;

        debouncedGrammarCheck();
        updateStats();
        updateUndoRedo();
      },

      handleInput(options?: { pasted?: boolean }) {
        // Un remplacement automatique ne se défait que juste après (la frappe du séparateur compte pour 1).
        const autoUndo = autoReplaceRef.current;
        if (autoUndo) {
          autoUndo.inputs += 1;
          if (autoUndo.inputs > 1) autoReplaceRef.current = null;
        }
        const editor = s.editorEl;
        const chapterName = s.activeTab;

        if (!editor || !chapterName || s.activeType !== 'chapter') {
          return;
        }

        const html = editor.innerHTML;

        recordTypedWords(chapterName, s.projectData.chapters[chapterName], html, options?.pasted === true);

        s.projectData.chapters[chapterName] = html;
        s.projects[projectName] = s.projectData;
        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');
        updateStats();

        scheduleHistoryCommit(chapterName, html);
        scheduleChapterSave(chapterName, html);

        debouncedHighlight();
        debouncedGrammarCheck();
      },

      handleEditorKeyDown(event: KeyboardEvent) {
        const editor = s.editorEl;
        const chapterName = s.activeTab;
        if (!editor || !chapterName || s.activeType !== 'chapter') return;
        if (!isAutoReplaceTrigger(event)) return;
        const done = applyAutoReplaceBeforeCaret(editor, s.projectData.autoReplace, () =>
          flushPendingHistoryCommit()
        );
        if (done) {
          // Le remplacement devient une étape d'annulation à part entière :
          // des Ctrl+Z successifs finissent toujours par remettre le mot tapé.
          historyRef.current.commit(chapterName, editor.innerHTML);
          updateUndoRedo();
        }
        autoReplaceRef.current = done ? { ...done, chapter: chapterName, inputs: 0 } : null;
      },

      getAutoReplace(): AutoReplaceSettings {
        return normalizeAutoReplace(s.projectData?.autoReplace);
      },

      setAutoReplace(next: AutoReplaceSettings): void {
        const data = s.projectData;
        if (!data) return;
        data.autoReplace = normalizeAutoReplace(next);
        setSaveStatus('pending');
        bump();
        void saveAll();
      },
      typedWords() {
        const tracker = typedWordsRef.current;

        return {
          total: tracker.total,
          byChapter: { ...tracker.byChapter },
          tracked: !isScreenplayData(s.projectData)
        };
      },

      handlePaste(event) {
        event.preventDefault();

        const html = replaceLibreOfficeFontsInHtml(event.clipboardData.getData('text/html'));
        const plainText = event.clipboardData.getData('text/plain');

        const escapeHtml = (value: string): string =>
          value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        void (async () => {
          let contentToInsert: string;

          if (html) {
            try {
              contentToInsert = await window.api.sanitizeHtml(html);
            } catch (error) {
              console.error(
                'Échec de la désinfection du collage, repli en texte brut :',
                error
              );

              contentToInsert = escapeHtml(plainText).replace(/\n/g, '<br>');
            }
          } else {
            contentToInsert = escapeHtml(plainText).replace(/\n/g, '<br>');
          }

          document.execCommand('insertHTML', false, contentToInsert);
        })();
      },

      /**
       * Clic dans le texte d'un chapitre.
       *
       * - Clic simple sur une mention : la fiche s'ouvre dans le panneau
       *   latéral, et le curseur se place normalement dans le texte. Rien
       *   ne s'ouvre si l'utilisateur est en train de sélectionner du texte.
       * - Ctrl+clic (Cmd+clic sur Mac) : la fiche s'ouvre dans un onglet.
       * - Mention d'une fiche disparue : message, puis nettoyage du texte.
       */
      handleEditorClick(event) {
        const target = event.target as HTMLElement;
        const mention = target.closest<HTMLElement>('.wb-mention');

        // Liens de la bible désactivés : le clic reste un clic normal.
        if (!mention || !wbLinksEnabled()) {
          return;
        }

        const itemId = mention.dataset.wbKey;
        const itemExists = Boolean(itemId && s.projectData.world[itemId]);
        const withModifier = event.ctrlKey || event.metaKey;

        if (!withModifier) {
          const selection = window.getSelection();

          if (selection && !selection.isCollapsed) {
            return;
          }

          if (itemId && itemExists) {
            openWbPanel(itemId);
            return;
          }

          showInfo(t('itemNotFound'));
          cleanMentionsInEditor();
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (itemId && itemExists) {
          ctrl.openItem(itemId, 'world');
          return;
        }

        showInfo(t('itemNotFound'));
        cleanMentionsInEditor();
      },

      openItem(key, type) {
        const existing = s.openTabs.find(
          (tab) => tab.name === key && tab.type === type
        );

        if (!existing) {
          s.openTabs = [...s.openTabs, { name: key, type }];
        }

        ctrl.switchTab(key, type);
      },

      switchTab(key, type) {
        if (s.activeTab === key && s.activeType === type) {
          bump();
          return;
        }

        void save();

        s.activeTab = key;
        s.activeType = type;

        updateStats();
        updateUndoRedo();

        bump();

        void persistUiState();
      },

      async closeTab(index) {
        const closed = s.openTabs[index];

        if (!closed) {
          return;
        }

        await save();

        if (status.get().saveState === 'error') {
          const confirmed = await showConfirm(
            t('closeTabUnsavedWarning', { name: ctrl.tabLabel(closed) })
          );

          if (!confirmed) {
            return;
          }
        }

        const nextTabs = s.openTabs.slice();
        nextTabs.splice(index, 1);

        s.openTabs = nextTabs;

        if (s.activeTab === closed.name && s.activeType === closed.type) {
          if (nextTabs.length > 0) {
            const next = nextTabs[Math.max(0, index - 1)];

            s.activeTab = next.name;
            s.activeType = next.type;
          } else {
            s.activeTab = null;
          }
        }

        updateStats();
        updateUndoRedo();

        bump();

        try {
          await persistUiState();
        } catch (error) {
          console.error("Échec de la sauvegarde de l'état des onglets :", error);
        }
      },

      moveTab(from, to) {
        if (from === to) {
          return;
        }

        const next = s.openTabs.slice();
        const [moved] = next.splice(from, 1);

        if (!moved) {
          return;
        }

        next.splice(to, 0, moved);

        s.openTabs = next;

        void persistUiState();
        bump();
      },

      cycleTab(delta) {
        if (s.openTabs.length <= 1) {
          return;
        }

        const currentIndex = s.openTabs.findIndex(
          (tab) => tab.name === s.activeTab && tab.type === s.activeType
        );

        const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

        const nextIndex =
          (safeCurrentIndex + delta + s.openTabs.length) % s.openTabs.length;

        const next = s.openTabs[nextIndex];

        ctrl.switchTab(next.name, next.type);
      },

      save,
      saveWholeProject: () => saveAllRef.current(),
      setSaveStatus,
      updateStats,
      recordWritingStats,

      format(command, value) {
        if (s.activeType === 'world') {
          return;
        }

        document.execCommand(command, false, value);

        if (s.activeType === 'chapter') {
          s.editorEl?.focus();
          ctrl.handleInput();
          return;
        }

        const editable = activeEditableElement();
        editable?.focus();
      },

      setFontFamily(font) {
        if (s.activeType !== 'chapter') {
          return;
        }

        applyStyleToSelection({ fontFamily: font });
      },

      setFontSizePx(px) {
        if (s.activeType !== 'chapter') {
          return;
        }

        applyStyleToSelection({ fontSize: `${px}px` });
      },

      insertText(text) {
        if (s.activeType === 'chapter') {
          const editor = s.editorEl;

          if (!editor) {
            return;
          }

          editor.focus();
          document.execCommand('insertText', false, text);
          ctrl.handleInput();
          return;
        }

        if (s.activeType === 'scene') {
          const editable = activeEditableElement();

          if (!editable) {
            return;
          }

          editable.focus();
          document.execCommand('insertText', false, text);
        }
      },

      undo() {
        // Ctrl+Z juste après un remplacement automatique : on remet le mot tapé.
        const autoUndo = autoReplaceRef.current;
        autoReplaceRef.current = null;
        if (
          autoUndo &&
          s.editorEl &&
          s.activeType === 'chapter' &&
          s.activeTab === autoUndo.chapter &&
          revertAutoReplace(s.editorEl, autoUndo)
        ) {
          ctrl.handleInput();
          return;
        }
        jumpInHistory('undo');
      },

      redo() {
        jumpInHistory('redo');
      },

      setZoom(next) {
        s.zoom = Math.min(
          EDITOR_ZOOM_MAX,
          Math.max(EDITOR_ZOOM_MIN, Number(next.toFixed(2)))
        );

        if (s.editorEl) {
          s.editorEl.style.zoom = String(s.zoom);
        }

        bump();
      },

      zoomBy(direction) {
        ctrl.setZoom(s.zoom + direction * EDITOR_ZOOM_STEP);
      },

      /** Réglages du chapitre (copie) ; objet vide si rien n’est défini. */
      getChapterMeta(name: string): ChapterMeta {
        const meta = s.projectData?.chapterMeta?.[name];
        return meta ? { ...meta } : {};
      },

      /** Modifie l’état, la couleur ou l’objectif d’un chapitre, puis sauvegarde. */
      setChapterMeta(name: string, patch: ChapterMetaPatch): void {
        const data = s.projectData;
        if (!data || !Object.prototype.hasOwnProperty.call(data.chapters, name)) return;
        const map: Record<string, ChapterMeta> = { ...(data.chapterMeta ?? {}) };
        const next = applyChapterMetaPatch(map[name], patch);
        if (next) map[name] = next;
        else delete map[name];
        data.chapterMeta = map;
        setSaveStatus('pending');
        bump();
        void saveAll();
      },

      /** Note libre du chapitre (texte simple) ; vide si aucune. */
      getChapterNote(name: string): string {
        const note = s.projectData?.chapterNotes?.[name];
        return typeof note === 'string' ? note : '';
      },

      /** Modifie la note du chapitre puis sauvegarde ; un texte vide supprime la note. */
      setChapterNote(name: string, text: string): void {
        const data = s.projectData;
        if (!data || !Object.prototype.hasOwnProperty.call(data.chapters, name)) return;
        const nextText = text.trim().length > 0 ? text : '';
        const before = data.chapterNotes?.[name] ?? '';
        if (before === nextText) return;
        const map: Record<string, string> = { ...(data.chapterNotes ?? {}) };
        if (nextText) map[name] = nextText;
        else delete map[name];
        if (Object.keys(map).length > 0) data.chapterNotes = map;
        else delete data.chapterNotes;
        setSaveStatus('pending');
        bump();
        void saveAll();
      },

      /** Commentaires du chapitre (copies), dans l'ordre de creation. */
      getChapterComments(name: string): ChapterComment[] {
        const list = s.projectData?.chapterComments?.[name];
        return Array.isArray(list) ? list.map((comment) => ({ ...comment })) : [];
      },

      /** Commente un passage du chapitre ouvert ; renvoie l'identifiant, ou null si impossible. */
      addChapterComment(name: string, range: Range, text: string, excerpt: string): string | null {
        const data = s.projectData;
        const editor = s.editorEl;
        const body = text.trim();
        if (!data || !editor || !body || s.activeType !== 'chapter' || s.activeTab !== name) return null;
        if (range.collapsed || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
        if (rangeTouchesComment(editor, range)) return null;
        const id = newCommentId();
        flushPendingHistoryCommit();
        if (!wrapRangeWithComment(editor, range, id)) return null;
        const comment: ChapterComment = { id, text: body, excerpt: excerpt.slice(0, 300), created: Date.now() };
        const map: Record<string, ChapterComment[]> = { ...(data.chapterComments ?? {}) };
        map[name] = [...(map[name] ?? []), comment];
        data.chapterComments = map;
        ctrl.handleInput();
        bump();
        void saveAll();
        return id;
      },

      /** Modifie le texte ou l'etat (resolu) d'un commentaire, puis sauvegarde. */
      updateChapterComment(name: string, id: string, patch: { text?: string; resolved?: boolean }): void {
        const data = s.projectData;
        const list = data?.chapterComments?.[name];
        if (!data || !Array.isArray(list)) return;
        let changed = false;
        const next = list.map((comment) => {
          if (comment.id !== id) return comment;
          const updated: ChapterComment = { ...comment };
          const newText = typeof patch.text === 'string' ? patch.text.trim() : '';
          if (newText && newText !== comment.text) {
            updated.text = newText;
            updated.updated = Date.now();
            changed = true;
          }
          if (typeof patch.resolved === 'boolean' && patch.resolved !== (comment.resolved === true)) {
            if (patch.resolved) updated.resolved = true;
            else delete updated.resolved;
            changed = true;
          }
          return updated;
        });
        if (!changed) return;
        data.chapterComments = { ...(data.chapterComments ?? {}), [name]: next };
        setSaveStatus('pending');
        bump();
        void saveAll();
      },

      /** Supprime un commentaire et retire son marquage (le texte du chapitre ne change pas). */
      deleteChapterComment(name: string, id: string): void {
        const data = s.projectData;
        const list = data?.chapterComments?.[name];
        if (!data || !Array.isArray(list)) return;
        const map: Record<string, ChapterComment[]> = { ...(data.chapterComments ?? {}) };
        const rest = list.filter((comment) => comment.id !== id);
        if (rest.length > 0) map[name] = rest;
        else delete map[name];
        if (Object.keys(map).length > 0) data.chapterComments = map;
        else delete data.chapterComments;
        if (isCommentId(id)) {
          if (s.activeType === 'chapter' && s.activeTab === name && s.editorEl) {
            flushPendingHistoryCommit();
            if (unwrapComment(s.editorEl, id)) ctrl.handleInput();
          } else {
            const html = data.chapters[name];
            if (typeof html === 'string') data.chapters[name] = unwrapCommentInHtml(html, id);
          }
        }
        setSaveStatus('pending');
        bump();
        void saveAll();
      },

      createChapter(name) {
        if (isScreenplayData(s.projectData)) {
          return false;
        }

        const trimmed = name.trim();

        if (!trimmed || s.projectData.chapters[trimmed] !== undefined) {
          return false;
        }

        s.projectData.chapters[trimmed] = '';

        mentionIndex.rebuildChapterOrder();

        setSaveStatus('pending');

        void saveAll();

        ctrl.openItem(trimmed, 'chapter');

        return true;
      },

      createScene(options = {}) {
        if (!isScreenplayData(s.projectData)) {
          return null;
        }

        const scene = createScreenplayScene(options);

        s.projectData.screenplay = {
          ...s.projectData.screenplay,
          scenes: [...s.projectData.screenplay.scenes, scene]
        };

        s.projects[projectName] = s.projectData;
        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');

        ctrl.openItem(scene.id, 'scene');

        bump();

        void saveAll();

        return scene.id;
      },

      updateScreenplay(screenplay) {
        if (s.projectData.projectType !== 'screenplay') {
          return;
        }

        s.projectData.screenplay = screenplay;
        s.projects[projectName] = s.projectData;
        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');

        updateStats();
        scheduleScreenplaySave();

        bump();
      },

      renameScene(sceneId, workingTitle) {
        if (!isScreenplayData(s.projectData)) {
          return false;
        }

        const sceneExists = s.projectData.screenplay.scenes.some(
          (scene) => scene.id === sceneId
        );

        if (!sceneExists) {
          return false;
        }

        s.projectData.screenplay = {
          ...s.projectData.screenplay,
          scenes: s.projectData.screenplay.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, workingTitle: workingTitle.trim() }
              : scene
          )
        };

        s.projects[projectName] = s.projectData;

        setSaveStatus('pending');

        bump();

        void saveAll();

        return true;
      },

      async deleteScene(sceneId) {
        await ctrl.deleteItem(sceneId, 'scene');
      },

      reorderScenes(sceneIds) {
        ctrl.reorderSidebar('scene', sceneIds);
      },

      createWbItem(name, type) {
        const trimmed = name.trim();

        if (!trimmed) {
          return null;
        }

        if (findWbItemByName(s.projectData.world, trimmed)) {
          return null;
        }

        const item = createWbItemRecord(
          trimmed,
          type,
          registry.cloneCategoryDefinitions()[type] ?? { ...registry.categoryFor(type), builtin: undefined }
        );

        const wbBefore = takeWbSnapshot();

        s.projectData.world[item.id] = item;

        recordWbChange('wbHistItemCreate', wbBefore);

        mentionIndex.refreshItem(item.id);
        registry.bumpVersion();

        setSaveStatus('pending');

        void saveAll();

        ctrl.openItem(item.id, 'world');

        return item.id;
      },

      async deleteItem(key, type) {
        let displayName = key;

        if (type === 'world') {
          const item = s.projectData.world[key];

          if (!item) {
            return;
          }

          displayName = item.name;
        } else if (type === 'scene' && isScreenplayData(s.projectData)) {
          const sceneIndex = s.projectData.screenplay.scenes.findIndex(
            (scene) => scene.id === key
          );

          const scene = s.projectData.screenplay.scenes[sceneIndex];

          if (scene) {
            displayName = getSceneDisplayTitle(
              scene,
              sceneIndex,
              s.projectData.screenplay.settings.conventionLanguage
            );
          }
        }

        const confirmed = await showConfirm(
          t('confirmDeleteItem', { name: displayName })
        );

        if (!confirmed) {
          return;
        }

        if (type === 'scene') {
          if (!isScreenplayData(s.projectData)) {
            return;
          }

          const currentScenes = s.projectData.screenplay.scenes;

          const sceneIndex = currentScenes.findIndex(
            (scene) => scene.id === key
          );

          if (sceneIndex < 0) {
            return;
          }

          let nextScenes = currentScenes.filter((scene) => scene.id !== key);

          if (nextScenes.length === 0) {
            const replacementScene = createScreenplayScene({
              interiorExterior: 'INT.',
              time:
                s.projectData.screenplay.settings.conventionLanguage === 'en'
                  ? 'DAY'
                  : 'JOUR'
            });

            nextScenes = [replacementScene];
          }

          s.projectData.screenplay = {
            ...s.projectData.screenplay,
            scenes: nextScenes
          };

          s.openTabs = s.openTabs.filter(
            (tab) => !(tab.type === 'scene' && tab.name === key)
          );

          if (s.activeType === 'scene' && s.activeTab === key) {
            const nextScene =
              nextScenes[Math.min(sceneIndex, nextScenes.length - 1)];

            s.activeTab = nextScene.id;
            s.activeType = 'scene';

            if (
              !s.openTabs.some(
                (tab) => tab.type === 'scene' && tab.name === nextScene.id
              )
            ) {
              s.openTabs = [...s.openTabs, { name: nextScene.id, type: 'scene' }];
            }
          }

          setSaveStatus('pending');

          updateStats();
          bump();

          await saveAll();
          return;
        }

        if (type === 'chapter') {
          if (s.activeTab === key && s.activeType === 'chapter') {
            s.activeTab = null;
          }

          cancelPendingChapterSave(key);

          if (pendingHistoryRef.current?.name === key) {
            if (historyTimerRef.current) {
              clearTimeout(historyTimerRef.current);
              historyTimerRef.current = null;
            }

            pendingHistoryRef.current = null;
          }

          delete s.projectData.chapters[key];

          history.remove(key);
          if (s.projectData.chapterMeta) delete s.projectData.chapterMeta[key];
          if (s.projectData.chapterNotes) delete s.projectData.chapterNotes[key];
          if (s.projectData.chapterComments) delete s.projectData.chapterComments[key];
          mentionIndex.removeChapter(key);
        } else {
          const wbBefore = takeWbSnapshot();

          // Fiche : les mentions deviennent du texte simple partout.
          flushPendingHistoryCommit();

          const open = activeChapterEditor();

          if (open) {
            s.projectData.chapters[open.name] = open.editor.innerHTML;
          }

          if (s.activeTab === key && s.activeType === 'world') {
            s.activeTab = null;
          }

          delete s.projectData.world[key];

          detachWbItem(s.projectData, key);

          recordWbChange('wbHistItemDelete', wbBefore);

          const changedChapters = removeMentionsAcrossChapters(
            s.projectData,
            key
          );

          if (open) {
            withPreservedSelection(open.editor, () => {
              removeMentionsIn(open.editor, key);
            });

            s.projectData.chapters[open.name] = open.editor.innerHTML;
          }

          resyncChapters(changedChapters, open?.name ?? null);

          // Les mentions de la fiche deviennent du texte simple dans les scènes.
          if (isScreenplayData(s.projectData)) {
            const nextScenes = transformScenesHtml(
              s.projectData.screenplay.scenes,
              (container) => removeMentionsIn(container, key)
            );

            if (nextScenes) {
              s.projectData.screenplay = {
                ...s.projectData.screenplay,
                scenes: nextScenes
              };
              s.projects[projectName] = s.projectData;
              scheduleScreenplaySave();
            }
          }
          mentionIndex.removeItem(key);
          registry.bumpVersion();
        }

        const index = s.openTabs.findIndex(
          (tab) => tab.name === key && tab.type === type
        );

        if (index !== -1) {
          const nextTabs = s.openTabs.slice();
          nextTabs.splice(index, 1);

          s.openTabs = nextTabs;

          if (!s.activeTab && nextTabs.length > 0) {
            const next = nextTabs[Math.max(0, index - 1)];

            s.activeTab = next.name;
            s.activeType = next.type;
          }
        }

        setSaveStatus('pending');

        updateStats();
        updateUndoRedo();
        bump();

        await saveAll();
      },

      async renameItem(key, newName, type) {
        if (type === 'scene') {
          return ctrl.renameScene(key, newName);
        }

        const trimmed = newName.trim();

        if (!trimmed) {
          return false;
        }

        if (type === 'chapter') {
          if (trimmed === key) {
            return false;
          }

          if (s.projectData.chapters[trimmed] !== undefined) {
            showInfo(t('alreadyExists'));
            return false;
          }

          cancelPendingChapterSave(key);
          flushPendingHistoryCommit();

          const nextChapters: Record<string, string> = {};

          Object.keys(s.projectData.chapters).forEach((chapterKey) => {
            if (chapterKey === key) {
              nextChapters[trimmed] = s.projectData.chapters[key];
            } else {
              nextChapters[chapterKey] = s.projectData.chapters[chapterKey];
            }
          });

          s.projectData.chapters = nextChapters;

          history.rename(key, trimmed);
          if (s.projectData.chapterMeta && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterMeta, key)) {
            s.projectData.chapterMeta[trimmed] = s.projectData.chapterMeta[key];
            delete s.projectData.chapterMeta[key];
          }
          if (s.projectData.chapterNotes && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterNotes, key)) {
            s.projectData.chapterNotes[trimmed] = s.projectData.chapterNotes[key];
            delete s.projectData.chapterNotes[key];
          }
          if (s.projectData.chapterComments && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterComments, key)) {
            s.projectData.chapterComments[trimmed] = s.projectData.chapterComments[key];
            delete s.projectData.chapterComments[key];
          }
          mentionIndex.renameChapter(key, trimmed);

          s.openTabs = s.openTabs.map((tab) =>
            tab.name === key && tab.type === 'chapter'
              ? { ...tab, name: trimmed }
              : tab
          );

          if (s.activeTab === key && s.activeType === 'chapter') {
            s.activeTab = trimmed;
          }

          setSaveStatus('pending');

          bump();

          await saveAll();

          return true;
        }

        // Fiche : l'identifiant ne change pas, seul le nom change.
        const item = s.projectData.world[key];

        if (!item) {
          return false;
        }

        const oldName = item.name;

        if (trimmed === oldName) {
          return false;
        }

        const duplicate = findWbItemByName(s.projectData.world, trimmed);

        if (duplicate && duplicate.id !== key) {
          showInfo(t('alreadyExists'));
          return false;
        }

        const affectedChapters = mentionIndex.chaptersContaining(key);
        const affectedScenes = isScreenplayData(s.projectData)
          ? mentionIndex.scenesContaining(key, s.projectData.screenplay.scenes)
          : [];
        const affectedCount = affectedChapters.length + affectedScenes.length;

        if (affectedCount > 0) {
          const proceed = await showConfirm(
            t(isScreenplayData(s.projectData) ? 'renameWbMentionsWarningScenes' : 'renameWbMentionsWarning', {
              oldName,
              newName: trimmed,
              count: affectedCount
            })
          );

          if (!proceed) {
            return false;
          }
        }

        flushPendingHistoryCommit();

        const open = activeChapterEditor();

        if (open) {
          s.projectData.chapters[open.name] = open.editor.innerHTML;
        }

        const wbBefore = takeWbSnapshot();

        item.name = trimmed;
        touchWbItem(item);

        recordWbChange('wbHistItemRename', wbBefore, {
          undoExtra: () => renameWbMentionsEverywhere(key, trimmed, oldName),
          redoExtra: () => renameWbMentionsEverywhere(key, oldName, trimmed)
        });

        const changedChapters = renameWorldMentionsAcrossChapters(
          s.projectData,
          key,
          oldName,
          trimmed
        );

        if (open) {
          withPreservedSelection(open.editor, () => {
            renameMentionsIn(open.editor, key, oldName, trimmed);
          });

          s.projectData.chapters[open.name] = open.editor.innerHTML;
        }

        registry.bumpVersion();
        mentionIndex.refreshItem(key);

        // Le nouveau nom peut apparaître ailleurs dans le chapitre ouvert.
        if (open) {
          highlight();
          s.projectData.chapters[open.name] = open.editor.innerHTML;
        }

        resyncChapters(changedChapters, open?.name ?? null);

        // Met à jour les mentions de la fiche dans les paragraphes des scènes.
        if (isScreenplayData(s.projectData)) {
          const nextScenes = transformScenesHtml(
            s.projectData.screenplay.scenes,
            (container) => renameMentionsIn(container, key, oldName, trimmed)
          );

          if (nextScenes) {
            s.projectData.screenplay = {
              ...s.projectData.screenplay,
              scenes: nextScenes
            };
            s.projects[projectName] = s.projectData;
            scheduleScreenplaySave();
          }
        }

        if (!isScreenplayData(s.projectData)) {
          invalidateProjectWordCache(s.projectData);
        }

        setSaveStatus('pending');

        updateStats();
        updateUndoRedo();
        bump();

        await saveAll();

        return true;
      },

      reorderSidebar(type, newOrder) {
        if (type === 'scene') {
          if (!isScreenplayData(s.projectData)) {
            return;
          }

          const sceneMap = new Map(
            s.projectData.screenplay.scenes.map((scene) => [scene.id, scene])
          );

          const orderedScenes = newOrder
            .map((sceneId) => sceneMap.get(sceneId))
            .filter((scene): scene is NonNullable<typeof scene> =>
              Boolean(scene)
            );

          s.projectData.screenplay.scenes.forEach((scene) => {
            if (!newOrder.includes(scene.id)) {
              orderedScenes.push(scene);
            }
          });

          s.projectData.screenplay = {
            ...s.projectData.screenplay,
            scenes: orderedScenes
          };
        } else if (type === 'chapter') {
          const next: Record<string, string> = {};

          newOrder.forEach((key) => {
            if (s.projectData.chapters[key] !== undefined) {
              next[key] = s.projectData.chapters[key];
            }
          });

          // Les chapitres absents de la nouvelle liste ne sont jamais perdus.
          Object.keys(s.projectData.chapters).forEach((key) => {
            if (next[key] === undefined) {
              next[key] = s.projectData.chapters[key];
            }
          });

          s.projectData.chapters = next;

          mentionIndex.rebuildChapterOrder();
        } else {
          const next: ProjectData['world'] = {};

          newOrder.forEach((itemId) => {
            const item = s.projectData.world[itemId];

            if (item) {
              next[itemId] = item;
            }
          });

          // Les fiches absentes de la nouvelle liste ne sont jamais perdues.
          Object.keys(s.projectData.world).forEach((itemId) => {
            if (!next[itemId]) {
              next[itemId] = s.projectData.world[itemId];
            }
          });

          const wbBefore = takeWbSnapshot();

          s.projectData.world = next;

          recordWbChange('wbHistItemReorder', wbBefore);
        }

        setSaveStatus('pending');

        bump();

        void saveAll();
      },

      updateWbField(itemId, fieldKey, value) {
        const item = s.projectData.world[itemId];

        if (!item) {
          return;
        }

        if (item.content[fieldKey] === value) {
          return;
        }

        const wbBefore = cloneWbData(item);

        item.content[fieldKey] = value;
        touchWbItem(item);

        recordWbItemChange('wbHistItemEdit', itemId, wbBefore, 'field:' + itemId + ':' + fieldKey);

        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');

        scheduleWbSave();

        // Sans ce rafraîchissement, le champ (piloté par React) réaffiche
        // aussitôt l'ancienne valeur : la frappe semble ne rien faire.
        bump();
      },

      setWbIcon(itemId, icon) {
        const item = s.projectData.world[itemId];

        if (!item) {
          return;
        }

        const wbBefore = cloneWbData(item);

        item.icon = icon;
        touchWbItem(item);

        recordWbItemChange('wbHistItemIcon', itemId, wbBefore);

        setSaveStatus('pending');

        void saveAll();
        bump();
      },

      setWbIconImage(itemId, image) {
        const item = s.projectData.world[itemId];

        if (!item) {
          return;
        }

        const wbBefore = cloneWbData(item);

        if (image) { item.iconImage = image; } else { delete item.iconImage; }
        touchWbItem(item);

        recordWbItemChange('wbHistItemIcon', itemId, wbBefore);

        setSaveStatus('pending');

        void saveAll();
        bump();
      },

      setWbColor(itemId, color) {
        const item = s.projectData.world[itemId];

        if (!item) {
          return;
        }

        const wbBefore = cloneWbData(item);

        item.color = color;
        touchWbItem(item);

        recordWbItemChange('wbHistItemColor', itemId, wbBefore, 'color:' + itemId);

        s.wbColorVersion += 1;

        setSaveStatus('pending');

        void saveAll();
        bump();
      },

      setWbAliases(itemId, aliases) {
        const item = s.projectData.world[itemId];

        if (!item) {
          return false;
        }

        const keyOf = (value: string): string =>
          value.normalize('NFC').trim().toLocaleLowerCase();

        // Nettoyage : sans vide, sans doublon, sans le nom de la fiche.
        const ownNameKey = keyOf(item.name);
        const seen = new Set<string>();
        const cleaned: string[] = [];

        aliases.forEach((raw) => {
          const alias = typeof raw === 'string' ? raw.trim() : '';
          const key = keyOf(alias);

          if (!alias || key === ownNameKey || seen.has(key)) {
            return;
          }

          seen.add(key);
          cleaned.push(alias);
        });

        // Un alias ne doit pas être le nom ou l'alias d'une autre fiche.
        for (const otherId of Object.keys(s.projectData.world)) {
          if (otherId === itemId) {
            continue;
          }

          const other = s.projectData.world[otherId];

          if (!other) {
            continue;
          }

          const otherKeys = new Set<string>([keyOf(other.name)]);

          if (Array.isArray(other.aliases)) {
            other.aliases.forEach((alias) => otherKeys.add(keyOf(alias)));
          }

          const conflict = cleaned.find((alias) => otherKeys.has(keyOf(alias)));

          if (conflict) {
            showInfo(
              t('wbAliasConflict', { alias: conflict, name: other.name })
            );
            return false;
          }
        }

        const previous = Array.isArray(item.aliases) ? item.aliases : [];

        const unchanged =
          previous.length === cleaned.length &&
          previous.every((alias, index) => alias === cleaned[index]);

        if (unchanged) {
          return true;
        }

        const wbBefore = cloneWbData(item);

        item.aliases = cleaned;

        recordWbItemChange('wbHistItemAliases', itemId, wbBefore);
        touchWbItem(item);

        mentionIndex.refreshItem(itemId);
        registry.bumpVersion();

        // Chapitre ouvert : les nouveaux alias sont surlignés tout de suite,
        // et les mentions d'un alias retiré redeviennent du texte simple.
        const open = activeChapterEditor();

        if (open) {
          flushPendingHistoryCommit();
          highlight();
          s.projectData.chapters[open.name] = open.editor.innerHTML;
          resyncChapters([], open.name);
        }

        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');

        void saveAll();
        bump();

        return true;
      },

      /**
       * Mode lecture d'une fiche.
       *
       * - Avec un identifiant (panneau latéral, ou fiche affichée dans un
       *   onglet) : c'est cette fiche qui bascule.
       * - Sans identifiant (barre d'outils, raccourci) : la fiche de l'onglet
       *   actif, comme avant.
       */
      toggleReadMode(itemId) {
        const targetId =
          itemId ?? (s.activeType === 'world' ? s.activeTab : null);

        if (!targetId) {
          return;
        }

        const item = s.projectData.world[targetId];

        if (!item) {
          return;
        }

        item.readMode = !item.readMode;

        scheduleWbSave();
        bump();
      },

      chaptersContaining(itemId) {
        return mentionIndex.chaptersContaining(itemId);
      },

      scenesContaining(itemId) {
        if (!isScreenplayData(s.projectData)) {
          return [];
        }

        const screenplay = s.projectData.screenplay;
        const sceneIds = mentionIndex.scenesContaining(
          itemId,
          screenplay.scenes
        );

        return sceneIds.flatMap((sceneId) => {
          const index = screenplay.scenes.findIndex(
            (scene) => scene.id === sceneId
          );

          if (index < 0) {
            return [];
          }

          const title = getSceneDisplayTitle(
            screenplay.scenes[index],
            index,
            screenplay.settings.conventionLanguage
          );

          return [{ id: sceneId, title }];
        });
      },

      itemsUsingType(slug) {
        return Object.keys(s.projectData.world).filter(
          (itemId) => s.projectData.world[itemId].wbType === slug
        );
      },

      saveCustomType(slug, definition) {
        const categories = registry.cloneCategoryDefinitions();

        let finalSlug = slug;

        if (!finalSlug) {
          const baseSlug = `custom_${slugify(definition.label, 'type')}`;

          finalSlug = baseSlug;

          let index = 2;

          while (categories[finalSlug]) {
            finalSlug = `${baseSlug}_${index}`;
            index += 1;
          }
        }

        const previous = categories[finalSlug];

        categories[finalSlug] = previous
          ? { ...previous, ...definition, builtin: previous.builtin }
          : { ...definition };

        const wbBefore = takeWbSnapshot();

        s.projectData.wbCategories = categories;

        recordWbChange(previous ? 'wbHistCategoryEdit' : 'wbHistCategoryCreate', wbBefore);

        registry.bumpVersion();

        // L'icône ou la couleur de la catégorie a pu changer.
        s.wbColorVersion += 1;

        setSaveStatus('pending');

        void saveAll();
        bump();

        return finalSlug;
      },

      async deleteCustomType(slug) {
        const label = registry.labelFor(slug);
        const usedBy = ctrl.itemsUsingType(slug);

        if (usedBy.length > 0) {
          showInfo(
            t('customTypeDeleteBlocked', {
              count: usedBy.length,
              label
            }),
            usedBy.map((itemId) => {
              const item = s.projectData.world[itemId];

              return {
                label: `${registry.iconFor(item)} ${item.name}`,
                onClick: () => {
                  ctrl.openItem(itemId, 'world');
                }
              };
            })
          );

          return;
        }

        const confirmed = await showConfirm(
          t('customTypeConfirmDelete', { label })
        );

        if (!confirmed) {
          return;
        }

        const categories = registry.cloneCategoryDefinitions();

        delete categories[slug];

        const wbBefore = takeWbSnapshot();

        s.projectData.wbCategories = categories;

        recordWbChange('wbHistCategoryDelete', wbBefore);

        registry.bumpVersion();

        setSaveStatus('pending');

        bump();

        await saveAll();
      },

      countMatches(findText, wholeProject, options) {
        const info: ReplaceMatchInfo = { count: 0, places: 0, scenes: false, noChapter: false };
        if (!findText) return info;

        if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
          info.scenes = true;
          for (const scene of s.projectData.screenplay.scenes) {
            if (!wholeProject && scene.id !== s.activeTab) continue;
            let n = 0;
            for (const element of scene.elements) n += countInHtmlString(element.html, findText, options);
            if (n > 0) {
              info.count += n;
              info.places += 1;
            }
          }
          return info;
        }

        const addChapter = (html: string | undefined): void => {
          const n = countInHtmlString(html, findText, options);
          if (n > 0) {
            info.count += n;
            info.places += 1;
          }
        };

        if (!wholeProject) {
          if (s.activeType !== 'chapter' || !s.activeTab) {
            info.noChapter = true;
            return info;
          }
          addChapter(s.projectData.chapters[s.activeTab]);
          return info;
        }

        for (const html of Object.values(s.projectData.chapters)) addChapter(html);
        return info;
      },

      replaceAll(findText, replacementText, wholeProject, options) {
        if (!findText) {
          return;
        }

        if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
          const screenplay = s.projectData.screenplay;

          let totalCount = 0;

          const nextScenes = screenplay.scenes.map((scene) => {
            if (!wholeProject && scene.id !== s.activeTab) {
              return scene;
            }

            const nextElements = scene.elements.map((element) => {
              const result = replaceInHtmlString(
                element.html,
                findText,
                replacementText,
                options
              );

              totalCount += result.count;

              return result.count > 0
                ? { ...element, html: result.html }
                : element;
            });

            return { ...scene, elements: nextElements };
          });

          if (totalCount === 0) {
            showInfo(
              wholeProject
                ? t('replaceNoneInProject')
                : t('replaceNoneInChapter')
            );

            return;
          }

          ctrl.updateScreenplay({ ...screenplay, scenes: nextScenes });

          void saveAll();

          showInfo(
            wholeProject
              ? t('replaceDoneInProject', {
                  count: totalCount,
                  chapters: nextScenes.length
                })
              : t('replaceDoneInChapter', { count: totalCount })
          );

          return;
        }

        // La frappe en attente devient une étape d'historique à part entière.
        flushPendingHistoryCommit();

        if (!wholeProject) {
          if (s.activeType !== 'chapter' || !s.activeTab) {
            showInfo(t('replaceNoChapterOpen'));
            return;
          }

          const chapterName = s.activeTab;
          const oldHtml = s.projectData.chapters[chapterName];

          const { html: newHtml, count } = replaceInHtmlString(
            oldHtml,
            findText,
            replacementText,
            options
          );

          if (count === 0) {
            showInfo(t('replaceNoneInChapter'));
            return;
          }

          history.sync(chapterName, oldHtml);

          s.projectData.chapters[chapterName] = newHtml;

          const editor = s.editorEl;

          let finalHtml = newHtml;

          if (editor) {
            editor.innerHTML = newHtml;

            highlight();

            finalHtml = editor.innerHTML;

            s.projectData.chapters[chapterName] = finalHtml;

            history.commit(chapterName, finalHtml);
            mentionIndex.updateForChapter(chapterName, finalHtml);
          }

          updateUndoRedo();

          setSaveStatus('pending');

          updateStats();

          scheduleChapterSave(chapterName, finalHtml);

          showInfo(t('replaceDoneInChapter', { count }));

          return;
        }

        let totalCount = 0;
        let chaptersAffected = 0;

        Object.keys(s.projectData.chapters).forEach((chapterName) => {
          const oldHtml = s.projectData.chapters[chapterName];

          const { html: newHtml, count } = replaceInHtmlString(
            oldHtml,
            findText,
            replacementText,
            options
          );

          if (count === 0) {
            return;
          }

          chaptersAffected += 1;
          totalCount += count;

          history.sync(chapterName, oldHtml);

          s.projectData.chapters[chapterName] = newHtml;

          history.commit(chapterName, newHtml);

          if (
            chapterName === s.activeTab &&
            s.activeType === 'chapter' &&
            s.editorEl
          ) {
            s.editorEl.innerHTML = newHtml;

            highlight();

            const finalHtml = s.editorEl.innerHTML;

            history.resyncOnly(chapterName, finalHtml);

            s.projectData.chapters[chapterName] = finalHtml;
          }
        });

        mentionIndex.rebuildAll();

        if (!isScreenplayData(s.projectData)) {
          invalidateProjectWordCache(s.projectData);
        }

        updateUndoRedo();

        setSaveStatus('pending');

        updateStats();

        void saveAll();

        showInfo(
          totalCount > 0
            ? t('replaceDoneInProject', {
                count: totalCount,
                chapters: chaptersAffected
              })
            : t('replaceNoneInProject')
        );
      },

      updatePrefs(prefs) {
        s.editorPrefs = prefs;

        onApplyPrefs(prefs);

        void window.api.saveEditorPrefs(prefs);

        bump();
      },

      async setNativeSpellcheck(enabled) {
        s.nativeSpellcheck = enabled;

        await window.api.setNativeSpellcheck(enabled);

        if (s.editorEl) {
          s.editorEl.spellcheck = enabled;
        }

        bump();
      },

      async setGrammarEnabled(enabled) {
        s.grammarPrefs = await window.api.saveGrammarPrefs({ enabled });

        if (!s.grammarPrefs.enabled) {
          s.grammarServerReady = false;

          const editor = s.editorEl;

          if (editor && s.activeTab && s.activeType === 'chapter') {
            const hadMarks = withPreservedSelection(editor, () =>
              clearGrammarMarks(editor)
            );

            if (hadMarks) {
              const chapterName = s.activeTab;
              const html = editor.innerHTML;

              s.projectData.chapters[chapterName] = html;

              scheduleChapterSave(chapterName, html);
            }
          }
        }

        updateGrammarStatus();

        await refreshGrammarStatus();

        bump();
      },

      refreshGrammarStatus,

      resetGrammarError() {
        s.lastGrammarErrorShown = null;
      },

      /**
       * Applique une suggestion à TOUS les morceaux de la faute, en ne
       * remplaçant que la partie qui change (la mise en forme est conservée),
       * puis place le curseur juste après la correction.
       */
      applyGrammarSuggestion(mark, replacement) {
        if (!mark.isConnected) {
          return;
        }

        const editor = s.editorEl;

        // La frappe en cours devient d'abord une étape : Ctrl+Z annule
        // ensuite la correction seule.
        flushPendingHistoryCommit();

        const caretRange = replaceGrammarGroup(editor, mark, replacement);

        if (!editor || !s.activeTab || s.activeType !== 'chapter') {
          return;
        }

        if (caretRange && editor.contains(caretRange.startContainer)) {
          editor.focus();

          const selection = window.getSelection();

          if (selection) {
            selection.removeAllRanges();
            selection.addRange(caretRange);
          }
        }

        const chapterName = s.activeTab;
        const html = editor.innerHTML;

        s.projectData.chapters[chapterName] = html;
        s.projects[projectName] = s.projectData;
        s.hasUnsavedChangesSinceLastBackup = true;

        setSaveStatus('pending');

        updateStats();

        scheduleHistoryCommit(chapterName, html);
        scheduleChapterSave(chapterName, html);

        debouncedHighlight();
        debouncedGrammarCheck();
      },

      /**
       * Ignore une faute : retire tous ses morceaux et la mémorise pour la
       * session, afin qu'elle ne réapparaisse pas à la frappe suivante.
       */
      ignoreGrammarMark(mark) {
        if (!mark.isConnected) {
          return;
        }

        const editor = s.editorEl;
        const ruleId = mark.dataset.ruleId || '';

        const text = editor
          ? withPreservedSelection(editor, () =>
              removeGrammarGroup(editor, mark)
            )
          : removeGrammarGroup(null, mark);

        ignoredGrammarRef.current.add(grammarIgnoreKey(ruleId, text));
      },

      getExportSettings() {
        return normalizeExportSettings(s.projectData.exportSettings);
      },

      exportChapterNames() {
        return Object.keys(s.projectData.chapters);
      },

      exportBibleCategories() {
        return listBibleCategories(s.projectData, registry);
      },

      buildExportPreview(settings) {
        // Seul le debut du roman est analyse : l'apercu reste fluide meme
        // pour un long manuscrit.
        const maxChapters = 3;
        const maxBlocks = 150;

        const normalized = normalizeExportSettings(settings);
        const allNames = Object.keys(s.projectData.chapters);
        const excluded = new Set(normalized.content.excludedChapters);
        const included = allNames.filter((name) => !excluded.has(name));
        const shown = new Set(included.slice(0, maxChapters));

        const full = buildExportDocument(
          s.projectData,
          {
            ...normalized,
            content: {
              ...normalized.content,
              excludedChapters: allNames.filter((name) => !shown.has(name))
            }
          },
          {
            projectName,
            bible: createBibleSource(registry, t, getLanguage()),
            language: getLanguage(),
            labels: { tableOfContents: t('exportTableOfContents') }
          }
        );

        let budget = maxBlocks;
        const bibleOnly = normalized.bible.mode === 'only';
        const novelShown = bibleOnly ? 0 : shown.size;
        let truncated = !bibleOnly && included.length > shown.size;
        const chapters: typeof full.chapters = [];

        let chapterIndex = -1;
        for (const chapter of full.chapters) {
          chapterIndex += 1;

          // La bible a son propre budget : elle reste visible dans l'apercu.
          if (chapterIndex === novelShown && chapterIndex > 0) budget = maxBlocks;

          if (budget <= 0) {
            truncated = true;
            continue;
          }

          const blocks = chapter.blocks.slice(0, budget);
          if (blocks.length < chapter.blocks.length) truncated = true;
          budget -= blocks.length;
          chapters.push({ ...chapter, blocks });
        }

        const tocTitles = [
          ...(bibleOnly ? [] : included),
          ...full.chapters.slice(novelShown).map((chapter) => chapter.title)
        ];

        return { document: { ...full, chapters }, tocTitles, truncated };
      },

      async saveExportSettings(settings) {
        s.projectData.exportSettings = normalizeExportSettings(settings);
        s.projects[projectName] = s.projectData;
        await window.api.saveProjects(s.projects);
      },

      async exportAs(kind) {
        if (isExportBusy()) {
          showInfo(t('exportAlreadyRunning'));
          return;
        }
        const pickExportPath = async (...dialogArgs: Parameters<typeof window.api.showSaveDialog>) => {
          const picked = await window.api.showSaveDialog(...dialogArgs);
          if (!picked.canceled && picked.filePath) setExportBusy(true);
          return picked;
        };
        try { // indicateur export : debut
        const screenplay = isScreenplayData(s.projectData)
          ? s.projectData.screenplay
          : null;

        if (kind === 'fountain') {
          // Fountain : scenario uniquement (texte brut UTF-8).
          if (!screenplay) {
            showInfo(t('nothingToExport'));
            return;
          }

          const result = await pickExportPath({
            defaultPath: screenplay
              ? `${projectName}.fountain`
              : projectName + t('exportFullSuffix') + '.fountain',
            filters: [{ name: 'Fountain', extensions: ['fountain'] }]
          });

          if (result.canceled || !result.filePath) return;

          const fountainLanguage = screenplay.settings.conventionLanguage;
          const fountainText = buildFountainText(screenplay, (scene) =>
            getFountainSceneHeading(scene, fountainLanguage)
          );

          await window.api.exportTxt(result.filePath, fountainText);
          showInfo(t('exportFountainSuccess'));
          return;
        }

        const chapterNames = Object.keys(s.projectData.chapters);

        const bibleOnly =
          !screenplay &&
          normalizeExportSettings(s.projectData.exportSettings).bible.mode === 'only';
        const hasContent = bibleOnly
          ? Object.keys(s.projectData.world ?? {}).length > 0
          : chapterNames.length > 0;

        if (kind !== 'project' && !screenplay && !hasContent) {
          showInfo(t('nothingToExport'));
          return;
        }

        if (
          kind !== 'project' &&
          screenplay &&
          screenplay.scenes.length === 0
        ) {
          showInfo(t('nothingToExport'));
          return;
        }

        await save();

        const buildNovelExportDocument = () =>
          buildExportDocument(
            s.projectData,
            normalizeExportSettings(s.projectData.exportSettings),
            {
              projectName,
              bible: createBibleSource(registry, t, getLanguage()),
              language: getLanguage(),
              labels: { tableOfContents: t('exportTableOfContents') }
            }
          );

        try {
          if (kind === 'txt') {
            const result = await pickExportPath({
              title: t('exportDialogTxt'),
              defaultPath: screenplay
                ? `${projectName}.txt`
                : projectName + t('exportFullSuffix') + '.txt',
              filters: [{ name: t('exportFilterText'), extensions: ['txt'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            let fullText = '';

            if (screenplay) {
              fullText = buildScreenplayPlainText(screenplay);
            } else {
              fullText = renderExportText(buildNovelExportDocument());
            }

            await window.api.exportTxt(result.filePath, fullText);

            showInfo(t('exportTxtSuccess'));

            return;
          }

          if (kind === 'md') {
            const result = await pickExportPath({
              title: t('exportDialogMd'),
              defaultPath: `${projectName}.md`,
              filters: [{ name: 'Markdown', extensions: ['md'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            const markdown = screenplay
              ? buildScreenplayPlainText(screenplay)
              : renderExportMarkdown(buildNovelExportDocument());

            await window.api.exportTxt(result.filePath, markdown);

            showInfo(t('exportMdSuccess'));

            return;
          }

          if (kind === 'pdf') {
            const result = await pickExportPath({
              title: t('exportDialogPdf'),
              defaultPath: `${projectName}.pdf`,
              filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            const html = screenplay
              ? buildBasicScreenplayPrintHtml(projectName, screenplay)
              : renderExportHtml(buildNovelExportDocument());

            await window.api.exportPdf(result.filePath, html);

            showInfo(t('exportPdfSuccess'));

            return;
          }

          if (kind === 'docx') {
            if (screenplay) {
              const screenplayResult = await pickExportPath({
                title: t('exportDialogDocx'),
                defaultPath: `${projectName}.docx`,
                filters: [{ name: 'Word', extensions: ['docx'] }]
              });

              if (!screenplayResult.canceled && screenplayResult.filePath) {
                await window.api.exportScreenplayDocx(
                  screenplayResult.filePath,
                  buildScreenplayExportDocument(projectName, screenplay)
                );

                showInfo(t('exportDocxSuccess'));
              }

              return;
            }

            const result = await pickExportPath({
              title: t('exportDialogDocx'),
              defaultPath: projectName + t('exportFullSuffix') + '.docx',
              filters: [{ name: 'Word', extensions: ['docx'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            await window.api.exportDocumentDocx(
              result.filePath,
              await prepareExportImages(buildNovelExportDocument())
            );

            showInfo(t('exportDocxSuccess'));

            return;
          }

          if (kind === 'odt') {
            if (screenplay) {
              const screenplayResult = await pickExportPath({
                title: t('exportDialogOdt'),
                defaultPath: `${projectName}.odt`,
                filters: [{ name: 'OpenDocument', extensions: ['odt'] }]
              });

              if (!screenplayResult.canceled && screenplayResult.filePath) {
                await window.api.exportScreenplayOdt(
                  screenplayResult.filePath,
                  buildScreenplayExportDocument(projectName, screenplay)
                );

                showInfo(t('exportOdtSuccess'));
              }

              return;
            }

            const result = await pickExportPath({
              title: t('exportDialogOdt'),
              defaultPath: projectName + t('exportFullSuffix') + '.odt',
              filters: [{ name: 'OpenDocument', extensions: ['odt'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            await window.api.exportDocumentOdt(
              result.filePath,
              await prepareExportImages(buildNovelExportDocument())
            );

            showInfo(t('exportOdtSuccess'));

            return;
          }

          if (kind === 'epub') {
            if (screenplay) {
              showInfo(t('nothingToExport'));
              return;
            }

            const result = await pickExportPath({
              title: t('exportDialogEpub'),
              defaultPath: `${projectName}.epub`,
              filters: [{ name: 'ePub', extensions: ['epub'] }]
            });

            if (result.canceled || !result.filePath) {
              return;
            }

            // Identifiant du livre : créé au premier export, puis conservé.
            const epubSettings = normalizeExportSettings(s.projectData.exportSettings);
            let identifier = epubSettings.epub.identifier;

            if (identifier === '') {
              identifier =
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                  ? crypto.randomUUID()
                  : '';

              if (identifier !== '') {
                s.projectData.exportSettings = {
                  ...epubSettings,
                  epub: { ...epubSettings.epub, identifier }
                };
                await save();
              }
            }

            const epubResult = await window.api.exportDocumentEpub(
              result.filePath,
              await prepareExportImages(buildNovelExportDocument()),
              { identifier, coverPath: epubSettings.epub.coverPath }
            );

            showInfo(
              t(epubResult.coverMissing ? 'exportEpubSuccessNoCover' : 'exportEpubSuccess')
            );

            return;
          }

          const result = await pickExportPath({
            title: t('exportDialogProject'),
            defaultPath: `${projectName}.scriptorium`,
            filters: [{ name: t('exportFilterProject'), extensions: ['scriptorium'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          await window.api.exportProject(
            result.filePath,
            projectName,
            s.projectData
          );

          showInfo(t('exportSuccess'));
        } catch (error) {
          const message = describeError(error);

          console.error(`Erreur export ${kind} :`, error);

          const prefix = {
            fountain: 'exportFountainError',
            txt: 'exportTxtError',
            md: 'exportMdError',
            pdf: 'exportPdfError',
            docx: 'exportDocxError',
            odt: 'exportOdtError',
            epub: 'exportEpubError',
            project: 'exportProjectError'
          } as const;

          showInfo(t(prefix[kind]) + message);
        }
        } finally {
          setExportBusy(false);
        }
      },

      async createNamedVersion(label) {
        // Les modifications en attente sont d'abord enregistrées : la version
        // contient exactement ce qui est affiché.
        await saveAll();
        await window.api.createNamedVersion(projectName, s.projectData, label);
      },

      recoverChapterCopy(sourceName, html, suffix) {
        if (isScreenplayData(s.projectData)) {
          return null;
        }

        // La copie porte un nom libre et prend place juste après l'original
        // (à la fin s'il n'existe plus). Le chapitre actuel ne change pas.
        const newName = uniqueChapterCopyName(
          sourceName,
          suffix,
          Object.keys(s.projectData.chapters)
        );

        const next = insertChapterAfter(
          s.projectData.chapters,
          sourceName,
          newName,
          stripCommentAnchors(html)
        );

        if (!next) {
          return null;
        }

        s.projectData.chapters = next;
        s.projects[projectName] = s.projectData;
        s.hasUnsavedChangesSinceLastBackup = true;

        invalidateProjectWordCache(s.projectData);
        mentionIndex.rebuildChapterOrder();
        mentionIndex.rebuildAll();

        setSaveStatus('pending');
        updateStats();
        bump();

        void saveAll();

        return newName;
      },

      async restoreBackup(fileName) {
        await window.api.createBackup(projectName, s.projectData);

        const restored = await window.api.restoreBackup(projectName, fileName);

        cancelAllPendingChapterSaves();
        cancelPendingScreenplaySave();
        cancelPendingWbSave();

        if (historyTimerRef.current) {
          clearTimeout(historyTimerRef.current);
          historyTimerRef.current = null;
        }

        pendingHistoryRef.current = null;

        // L'historique d'annulation portait sur l'ancien contenu.
        Object.keys(s.projectData.chapters).forEach((chapterName) => {
          history.remove(chapterName);
        });

        ensureProjectDefaults(restored);

        // Une sauvegarde ancienne peut être au format 1 : on la convertit.
        let nextData = prepareWorldBuilding(restored, currentWbLang()).data;

        ensureProjectDefaults(nextData);

        if (
          nextData.projectType === 'screenplay' &&
          nextData.screenplay &&
          nextData.screenplay.scenes.length === 0
        ) {
          nextData = {
            ...nextData,
            screenplay: {
              ...nextData.screenplay,
              scenes: [createScreenplayScene()]
            }
          };
        }

        s.projectData = nextData;

        registry.bumpVersion();

        s.wbColorVersion += 1;
        s.chapterColorSyncVersion.clear();

        if (!isScreenplayData(s.projectData)) {
          invalidateProjectWordCache(s.projectData);
        }

        mentionIndex.rebuildAll();

        s.projects[projectName] = s.projectData;

        await window.api.saveProjects(s.projects);

        s.activeTab = null;
        s.openTabs = [];

        if (isScreenplayData(s.projectData)) {
          const firstScene = s.projectData.screenplay.scenes[0];

          if (firstScene) {
            s.activeTab = firstScene.id;
            s.activeType = 'scene';
            s.openTabs = [{ name: firstScene.id, type: 'scene' }];
          }
        } else {
          s.activeType = 'chapter';
        }

        await persistUiState();

        updateStats();
        updateUndoRedo();
        bump();
      },

      async renameProject(newName) {
        const trimmed = newName.trim();

        if (!trimmed || trimmed === projectName) {
          return false;
        }

        await saveAll();

        const allProjects = await window.api.getProjects();

        if (allProjects[trimmed]) {
          showInfo(t('alreadyExists'));
          return false;
        }

        // Comme le renommage depuis la page des projets : les sessions et le
        // titre du scénario (s'il est vide) prennent le nouveau nom.
        s.projectData.writingSessions = (s.projectData.writingSessions || []).map(
          (session) => ({ ...session, projectName: trimmed })
        );

        if (s.projectData.screenplay && !s.projectData.screenplay.titlePage.title) {
          s.projectData.screenplay.titlePage.title = trimmed;
        }

        const next: ProjectsMap = {};

        Object.keys(allProjects).forEach((key) => {
          next[key === projectName ? trimmed : key] =
            key === projectName ? s.projectData : allProjects[key];
        });

        await window.api.saveProjects(next);

        // Le projet est enregistré sous son nouveau nom : plus aucune
        // sauvegarde ne doit partir avec l'ancien (elle échouerait ou
        // recréerait l'ancien projet). L'éditeur est ensuite recréé
        // sous le nouveau nom (key dans App.tsx).
        renamedRef.current = true;
        cancelAllPendingChapterSaves();
        cancelPendingScreenplaySave();
        cancelPendingWbSave();
        delete s.projects[projectName];
        s.projects[trimmed] = s.projectData;

        const uiState = await window.api.getUiState();

        if (uiState[projectName]) {
          uiState[trimmed] = uiState[projectName];
          delete uiState[projectName];

          await window.api.saveUiState(uiState);
        }

        // Historique quotidien des statistiques : déplacé vers le nouveau nom,
        // dans la file pour passer après les enregistrements en cours.
        await enqueuePersistence(() =>
          renameWritingStatsProject(projectName, trimmed)
        );

        // Sauvegardes horodatées : déplacées vers le nouveau nom (sans bloquer).
        try {
          await window.api.renameProjectBackups(projectName, trimmed);
        } catch (error) {
          console.error('Échec du déplacement des sauvegardes du projet renommé :', error);
        }

        await window.api.setCurrentProject(trimmed);

        return true;
      }
    };

    /** Chapitre affiché dans l'éditeur, s'il y en a un. */
    function activeChapterEditor(): { name: string; editor: HTMLElement } | null {
      if (s.activeType !== 'chapter' || !s.activeTab || !s.editorEl) {
        return null;
      }

      return { name: s.activeTab, editor: s.editorEl };
    }

    /** Copie des données World Building annulables : fiches, catégories, relations, frise. */
    function takeWbSnapshot(): Record<string, unknown> {
      const data = s.projectData as unknown as Record<string, unknown>;
      const snapshot: Record<string, unknown> = {};

      ['world', 'wbCategories', 'wbRelations', 'wbTimeline'].forEach((key) => {
        snapshot[key] = cloneWbData(data[key]);
      });

      return snapshot;
    }

    /** Remet les données World Building dans l'état de la copie. */
    function restoreWbSnapshot(snapshot: Record<string, unknown>, extra?: () => void): void {
      const previousWorld = s.projectData.world;
      const data = s.projectData as unknown as Record<string, unknown>;

      Object.keys(snapshot).forEach((key) => {
        if (snapshot[key] === undefined) {
          delete data[key];
        } else {
          data[key] = cloneWbData(snapshot[key]);
        }
      });

      extra?.();

      refreshAfterWbRestore(previousWorld);
    }

    /** Remet une seule fiche dans l'état de la copie. */
    function restoreWbItem(itemId: string, snapshot: WbItem): void {
      const previousWorld = { ...s.projectData.world };

      s.projectData.world[itemId] = cloneWbData(snapshot);

      refreshAfterWbRestore(previousWorld);
    }

    /**
     * Après une annulation ou un rétablissement : onglets, mentions, index,
     * surlignage du chapitre ouvert, statistiques et sauvegarde.
     */
    function refreshAfterWbRestore(previousWorld: ProjectData['world']): void {
      const world = s.projectData.world;
      const removed: string[] = [];
      const changed: string[] = [];

      new Set([...Object.keys(previousWorld), ...Object.keys(world)]).forEach((itemId) => {
        if (!world[itemId]) {
          removed.push(itemId);
        } else if (JSON.stringify(previousWorld[itemId]) !== JSON.stringify(world[itemId])) {
          changed.push(itemId);
        }
      });

      // Fiches disparues : onglets fermés, mentions remises en texte simple.
      s.openTabs = s.openTabs.filter(
        (tab) => tab.type !== 'world' || Boolean(world[tab.name])
      );

      if (s.activeType === 'world' && s.activeTab && !world[s.activeTab]) {
        s.activeTab = null;
      }

      removed.forEach((itemId) => {
        removeWbMentionsEverywhere(itemId);
        mentionIndex.removeItem(itemId);
      });

      changed.forEach((itemId) => {
        mentionIndex.refreshItem(itemId);
      });

      registry.bumpVersion();
      s.wbColorVersion += 1;

      const open = activeChapterEditor();

      if (open) {
        highlight();
        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      if (!isScreenplayData(s.projectData)) {
        invalidateProjectWordCache(s.projectData);
      }

      s.hasUnsavedChangesSinceLastBackup = true;

      setSaveStatus('pending');

      updateStats();
      updateUndoRedo();
      bump();

      void saveAll();
    }

    /** Les mentions d'une fiche deviennent du texte simple partout. */
    function removeWbMentionsEverywhere(key: string): void {
      flushPendingHistoryCommit();

      const open = activeChapterEditor();

      if (open) {
        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      const changedChapters = removeMentionsAcrossChapters(s.projectData, key);

      if (open) {
        withPreservedSelection(open.editor, () => {
          removeMentionsIn(open.editor, key);
        });

        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      resyncChapters(changedChapters, open?.name ?? null);

      if (isScreenplayData(s.projectData)) {
        const nextScenes = transformScenesHtml(
          s.projectData.screenplay.scenes,
          (container) => removeMentionsIn(container, key)
        );

        if (nextScenes) {
          s.projectData.screenplay = {
            ...s.projectData.screenplay,
            scenes: nextScenes
          };
          s.projects[projectName] = s.projectData;
          scheduleScreenplaySave();
        }
      }
    }

    /** Renomme les mentions d'une fiche dans les chapitres et les scènes. */
    function renameWbMentionsEverywhere(key: string, fromName: string, toName: string): void {
      flushPendingHistoryCommit();

      const open = activeChapterEditor();

      if (open) {
        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      const changedChapters = renameWorldMentionsAcrossChapters(
        s.projectData,
        key,
        fromName,
        toName
      );

      if (open) {
        withPreservedSelection(open.editor, () => {
          renameMentionsIn(open.editor, key, fromName, toName);
        });

        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      resyncChapters(changedChapters, open?.name ?? null);

      if (isScreenplayData(s.projectData)) {
        const nextScenes = transformScenesHtml(
          s.projectData.screenplay.scenes,
          (container) => renameMentionsIn(container, key, fromName, toName)
        );

        if (nextScenes) {
          s.projectData.screenplay = {
            ...s.projectData.screenplay,
            scenes: nextScenes
          };
          s.projects[projectName] = s.projectData;
          scheduleScreenplaySave();
        }
      }
    }

    /** Enregistre une action World Building (copie complète avant / après). */
    function recordWbChange(
      labelKey: WbHistoryEntry['labelKey'],
      before: Record<string, unknown>,
      extras: { undoExtra?: () => void; redoExtra?: () => void } = {}
    ): void {
      const after = takeWbSnapshot();

      if (JSON.stringify(before) === JSON.stringify(after)) {
        return;
      }

      pushWbHistory({
        labelKey,
        undo: () => restoreWbSnapshot(before, extras.undoExtra),
        redo: () => restoreWbSnapshot(after, extras.redoExtra)
      });
    }

    /** Enregistre la modification d'une seule fiche (copie de la fiche). */
    function recordWbItemChange(
      labelKey: WbHistoryEntry['labelKey'],
      itemId: string,
      before: WbItem,
      mergeKey?: string
    ): void {
      const current = s.projectData.world[itemId];

      if (!current) {
        return;
      }

      const after = cloneWbData(current);

      pushWbHistory({
        labelKey,
        ...(mergeKey ? { mergeKey } : {}),
        undo: () => restoreWbItem(itemId, before),
        redo: () => restoreWbItem(itemId, after)
      });
    }

    /**
     * Retire du chapitre affiché les mentions de fiches qui n'existent plus,
     * puis enregistre le changement comme une frappe normale.
     */
    function cleanMentionsInEditor(): void {
      const editor = s.editorEl;

      if (!editor) {
        return;
      }

      const cleaned = withPreservedSelection(editor, () =>
        cleanInvalidMentions(editor, s.projectData.world)
      );

      if (cleaned) {
        ctrl.handleInput();
      }
    }

    /**
     * Après une modification des mentions dans plusieurs chapitres :
     * l'historique et l'index sont remis en phase avec le nouveau contenu,
     * sans créer d'étape d'annulation.
     */
    function resyncChapters(
      changedChapters: string[],
      openChapter: string | null
    ): void {
      const names = new Set(changedChapters);

      if (openChapter) {
        names.add(openChapter);
      }

      names.forEach((chapterName) => {
        const html = s.projectData.chapters[chapterName];

        if (html === undefined) {
          return;
        }

        history.resyncOnly(chapterName, html);
        mentionIndex.updateForChapter(chapterName, html);
      });
    }

    /**
     * Annuler / rétablir.
     *
     * - Mode scène : historique propre du scénario (SCREENPLAY_HISTORY_EVENT).
     * - Mode chapitre : historique Scriptorium (instantanés HTML). Le curseur
     *   est replacé à l'endroit de la modification (comme dans Word) au lieu
     *   d'être envoyé à la fin du chapitre.
     */
    function jumpInHistory(direction: 'undo' | 'redo'): void {
      if (s.activeType === 'scene') {
        // Historique propre du scénario. Nom identique à SCREENPLAY_HISTORY_EVENT
        // (ScreenplayEditor.tsx), écrit en dur pour éviter un import circulaire.
        window.dispatchEvent(
          new CustomEvent('scriptorium:screenplay-history', { detail: direction })
        );
        return;
      }

      if (s.activeType !== 'chapter' || !s.activeTab) {
        return;
      }

      const editor = s.editorEl;

      if (!editor) {
        return;
      }

      const chapterName = s.activeTab;

      // 1. La frappe des dernières millisecondes devient une étape : Ctrl+Z
      //    ne saute plus d'étape et Ctrl+Y ne l'efface plus.
      flushPendingHistoryCommit();

      // 2. Texte et sélection AVANT le saut, pour replacer le curseur.
      const caretState = captureHistoryCaretState(editor);

      const target =
        direction === 'undo'
          ? history.undo(chapterName, editor.innerHTML)
          : history.redo(chapterName, editor.innerHTML);

      if (target === null) {
        updateUndoRedo();
        return;
      }

      editor.innerHTML = target;
      s.projectData.chapters[chapterName] = target;

      highlight();

      const finalHtml = editor.innerHTML;

      s.projectData.chapters[chapterName] = finalHtml;
      s.projects[projectName] = s.projectData;
      s.hasUnsavedChangesSinceLastBackup = true;

      history.resyncOnly(chapterName, finalHtml);
      mentionIndex.updateForChapter(chapterName, finalHtml);

      // 3. Curseur à l'endroit de la modification + défilement si besoin.
      placeCaretAfterHistoryJump(editor, caretState);

      updateStats();
      updateUndoRedo();

      setSaveStatus('pending');
      scheduleChapterSave(chapterName, finalHtml);

      debouncedGrammarCheck();
    }

    function applyStyleToSelection(styles: Partial<CSSStyleDeclaration>): void {
      if (s.activeType !== 'chapter') {
        return;
      }

      const editor = s.editorEl;

      if (!editor) {
        return;
      }

      const selection = window.getSelection();

      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (
        !editor.contains(range.startContainer) ||
        !editor.contains(range.endContainer)
      ) {
        return;
      }

      const span = document.createElement('span');

      Object.assign(span.style, styles);

      if (range.collapsed) {
        span.appendChild(document.createTextNode('\u200B'));

        range.insertNode(span);

        const caretRange = document.createRange();

        if (span.firstChild) {
          caretRange.setStart(span.firstChild, 1);
          caretRange.collapse(true);

          selection.removeAllRanges();
          selection.addRange(caretRange);
        }
      } else {
        span.appendChild(range.extractContents());

        range.insertNode(span);

        const newRange = document.createRange();

        newRange.selectNodeContents(span);

        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      editor.focus();

      const chapterName = s.activeTab;

      if (!chapterName) {
        return;
      }

      const html = editor.innerHTML;

      s.projectData.chapters[chapterName] = html;

      setSaveStatus('pending');

      updateStats();

      scheduleHistoryCommit(chapterName, html);
      scheduleChapterSave(chapterName, html);

      debouncedHighlight();
      debouncedGrammarCheck();
    }

    api.current = ctrl;
  }

  api.current.ready = s.ready;

  return api.current;
}

export function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

export function buildCustomTypeFields(
  rawFields: {
    label: string;
    type: WbField['type'];
    existingKey?: string;
    options?: WbField['options'];
    referenceCategory?: WbField['referenceCategory'];
  }[]
): WbField[] {
  const usedKeys = new Set(
    rawFields.map((field) => field.existingKey).filter(Boolean) as string[]
  );

  return rawFields.map((field) => {
    let key = field.existingKey;

    if (!key) {
      const base = slugify(field.label, 'champ');

      key = base;

      let index = 2;

      while (usedKeys.has(key)) {
        key = `${base}_${index}`;
        index += 1;
      }

      usedKeys.add(key);
    }

    const result: WbField = {
      key,
      label: field.label,
      type: field.type
    };

    if (field.options !== undefined) {
      result.options = field.options;
    }

    if (field.referenceCategory !== undefined) {
      result.referenceCategory = field.referenceCategory;
    }

    return result;
  });
}
