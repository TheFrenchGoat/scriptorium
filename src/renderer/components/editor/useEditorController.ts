// src/renderer/components/editor/useEditorController.ts

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

import {
  getLanguage,
  t
} from '../../i18n';

import {
  createEditHistory,
  type EditHistory
} from '../../lib/edit-history';

import {
  createMentionIndex,
  type MentionIndex
} from '../../lib/mention-index';

import {
  createWbRegistry,
  type WbRegistry
} from '../../lib/wb-registry';

import {
  cleanInvalidMentions,
  highlightWorldBuilding,
  removeMentionsAcrossChapters,
  renameWorldMentionsAcrossChapters,
  syncMentionColors
} from '../../lib/highlight';

import {
  applyGrammarMatches,
  clearGrammarMarks,
  getPlainTextWithMap
} from '../../lib/grammar-check';

import {
  debounce,
  getCaretCharacterOffsetWithin,
  placeCaretAtEnd,
  replaceInHtmlString,
  setCaretPosition
} from '../../lib/dom';

import {
  getCachedTotalStats,
  invalidateProjectWordCache
} from '../../lib/project-word-cache';

import {
  getDateKey,
  getStatsBucket
} from '../../lib/stats';

import { buildDocxData } from '../../lib/docx-export';
import { buildMarkdown } from '../../lib/markdown-export';
import { buildPrintHtml } from '../../lib/pdf-export';
import { describeError } from '../../lib/errors';

import {
  createStatusStore,
  type StatusStore
} from './editor-status';

import type { InfoAction } from '../common/Dialogs';

import type {
  CustomWbTypeDef,
  EditorPrefs,
  GrammarPrefs,
  ItemType,
  ProjectData,
  ProjectsMap,
  TabRef,
  UiState,
  WbField,
  WbType
} from '../../../shared/types';

const HIGHLIGHT_SIZE_THRESHOLD = 50000;
const HIGHLIGHT_MANY_ITEMS_THRESHOLD = 60;
const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5;

const HISTORY_DEBOUNCE_MS = 700;
const CHAPTER_SAVE_DEBOUNCE_MS = 2500;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

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
  wbReadMode: boolean;
  editorPrefs: EditorPrefs;
  grammarPrefs: GrammarPrefs;
  grammarServerReady: boolean;
  grammarStarting: boolean;
  grammarCheckInFlight: boolean;
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

export interface EditorController {
  projectName: string;
  ready: boolean;
  status: StatusStore;
  registry: WbRegistry;

  data(): ProjectData;
  tabs(): TabRef[];
  activeTab(): string | null;
  activeType(): ItemType;
  isReadMode(): boolean;
  prefs(): EditorPrefs;
  grammarPrefs(): GrammarPrefs;
  nativeSpellcheckEnabled(): boolean;
  zoom(): number;

  attachEditor(el: HTMLElement | null): void;
  onChapterMounted(name: string): void;
  handleInput(): void;
  handlePaste(
    event: ReactClipboardEvent<HTMLElement>
  ): void;
  handleEditorClick(
    event: ReactMouseEvent<HTMLElement>
  ): void;

  openItem(name: string, type: ItemType): void;
  switchTab(name: string, type: ItemType): void;
  closeTab(index: number): Promise<void>;
  moveTab(from: number, to: number): void;
  cycleTab(delta: number): void;

  save(): Promise<void>;
  setSaveStatus(
    state: 'saved' | 'pending' | 'error'
  ): void;
  updateStats(): void;

  format(command: string, value?: string): void;
  setFontFamily(font: string): void;
  setFontSizePx(px: number): void;
  insertText(text: string): void;
  undo(): void;
  redo(): void;
  setZoom(next: number): void;
  zoomBy(direction: number): void;

  createChapter(name: string): boolean;
  createWbItem(name: string, type: WbType): boolean;

  deleteItem(
    name: string,
    type: ItemType
  ): Promise<void>;

  renameItem(
    oldName: string,
    newName: string,
    type: ItemType
  ): Promise<boolean>;

  reorderSidebar(
    type: ItemType,
    newOrder: string[]
  ): void;

  updateWbField(
    name: string,
    fieldKey: string,
    value: string
  ): void;

  setWbIcon(name: string, icon: string): void;
  setWbColor(name: string, color: string): void;
  toggleReadMode(): void;
  chaptersContaining(name: string): string[];

  saveCustomType(
    slug: string | null,
    definition: CustomWbTypeDef
  ): string;

  deleteCustomType(
    slug: string,
    definition: CustomWbTypeDef
  ): Promise<void>;

  itemsUsingType(slug: string): string[];

  replaceAll(
    findText: string,
    replacementText: string,
    wholeProject: boolean
  ): void;

  updatePrefs(prefs: EditorPrefs): void;

  setNativeSpellcheck(
    enabled: boolean
  ): Promise<void>;

  setGrammarEnabled(
    enabled: boolean
  ): Promise<void>;

  refreshGrammarStatus(): Promise<void>;
  resetGrammarError(): void;

  applyGrammarSuggestion(
    mark: HTMLElement,
    replacement: string
  ): void;

  ignoreGrammarMark(mark: HTMLElement): void;

  exportAs(
    kind:
      | 'txt'
      | 'md'
      | 'pdf'
      | 'docx'
      | 'project'
  ): Promise<void>;

  restoreBackup(fileName: string): Promise<void>;
  recordWritingStats(): Promise<void>;

  renameProject(
    newName: string
  ): Promise<boolean>;
}

export interface EditorControllerDeps {
  projectName: string;

  showInfo: (
    message: string,
    actions?: InfoAction[]
  ) => void;

  showConfirm: (
    message: string
  ) => Promise<boolean>;

  onApplyPrefs: (
    prefs: EditorPrefs
  ) => void;
}

export function useEditorController({
  projectName,
  showInfo,
  showConfirm,
  onApplyPrefs
}: EditorControllerDeps): EditorController {
  const [, bump] = useReducer(
    (value: number) => value + 1,
    0
  );

  const stateRef = useRef<MutableState>({
    projects: {},
    projectData: {
      chapters: {},
      world: {},
      customWbTypes: {}
    },
    uiState: {},
    openTabs: [],
    activeTab: null,
    activeType: 'chapter',
    editorEl: null,
    zoom: 1,
    nativeSpellcheck: true,
    wbReadMode: false,
    editorPrefs: DEFAULT_EDITOR_PREFS,
    grammarPrefs: {
      enabled: false,
      languageToolPath: null,
      port: 8081
    },
    grammarServerReady: false,
    grammarStarting: false,
    grammarCheckInFlight: false,
    lastGrammarErrorShown: null,
    lastBackupAt: 0,
    hasUnsavedChangesSinceLastBackup: false,
    largeChapterHighlightCounter: 0,
    wbColorVersion: 0,
    chapterColorSyncVersion: new Map(),
    ready: false
  });

  const s = stateRef.current;

  const status = useMemo(
    () => createStatusStore(),
    []
  );

  const historyRef = useRef<EditHistory>(
    createEditHistory()
  );

  const registryRef = useRef<WbRegistry>(
    createWbRegistry(
      () => stateRef.current.projectData
    )
  );

  const indexRef = useRef<MentionIndex>(
    createMentionIndex(
      () => stateRef.current.projectData
    )
  );

  const historyTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const pendingChapterSavesRef = useRef<
    Map<string, PendingChapterSave>
  >(new Map());

  /*
   * Toutes les écritures IPC passent par cette file.
   *
   * Cela empêche une sauvegarde automatique ancienne de terminer après une
   * sauvegarde complète plus récente et d'écraser le dernier contenu.
   */
  const persistenceQueueRef = useRef<
    Promise<void>
  >(Promise.resolve());

  const history = historyRef.current;
  const registry = registryRef.current;
  const mentionIndex = indexRef.current;

  const api =
    useRef<EditorController | null>(null);

  const enqueuePersistence =
    useCallback(
      <T,>(
        operation: () => Promise<T>
      ): Promise<T> => {
        const result =
          persistenceQueueRef.current.then(
            operation,
            operation
          );

        persistenceQueueRef.current =
          result.then(
            () => undefined,
            () => undefined
          );

        return result;
      },
      []
    );

  const setSaveStatus = useCallback(
    (
      state:
        | 'saved'
        | 'pending'
        | 'error'
    ): void => {
      if (state === 'saved') {
        const now = new Date();

        const hours = now
          .getHours()
          .toString()
          .padStart(2, '0');

        const minutes = now
          .getMinutes()
          .toString()
          .padStart(2, '0');

        status.set({
          saveState: 'saved',
          savedAt: `${hours}:${minutes}`
        });

        return;
      }

      status.set({
        saveState: state
      });
    },
    [status]
  );

  const updateUndoRedo =
    useCallback((): void => {
      const enabled =
        s.activeType === 'chapter' &&
        Boolean(s.activeTab);

      status.set({
        canUndo:
          enabled &&
          history.canUndo(s.activeTab),
        canRedo:
          enabled &&
          history.canRedo(s.activeTab)
      });
    }, [history, s, status]);

  const updateStats =
    useCallback((): void => {
      if (
        s.activeType !== 'chapter'
      ) {
        status.set({
          sheetMode: true,
          selectionActive: false
        });

        return;
      }

      const editor = s.editorEl;

      if (!editor) {
        return;
      }

      const selection =
        window.getSelection();

      let words = 0;
      let chars = 0;
      let selectionActive = false;

      if (
        selection &&
        selection.rangeCount > 0
      ) {
        const range =
          selection.getRangeAt(0);

        const belongsToEditor =
          editor.contains(
            range.startContainer
          ) &&
          editor.contains(
            range.endContainer
          );

        if (
          belongsToEditor &&
          !range.collapsed
        ) {
          const selectedText =
            range.toString().trim();

          if (selectedText) {
            selectionActive = true;

            words = selectedText
              .split(/\s+/)
              .filter(Boolean).length;

            chars =
              selectedText.length;
          }
        }
      }

      if (!selectionActive) {
        const text =
          editor.innerText.trim();

        words = text
          ? text
              .split(/\s+/)
              .filter(Boolean).length
          : 0;

        chars = text.length;
      }

      /*
       * Le total du projet vient du cache par chapitre. Seul le chapitre dont
       * le HTML a changé est recompté.
       */
      const totalStats =
        getCachedTotalStats(
          s.projectData
        );

      status.set({
        sheetMode: false,
        words,
        chars,
        selectionActive,
        totalWords: totalStats.words
      });
    }, [s, status]);

  const recordWritingStats =
    useCallback(async (): Promise<void> => {
      try {
        const stats =
          (await window.api.getWritingStats()) ||
          {};

        const bucket =
          getStatsBucket(
            stats,
            projectName
          );

        const todayKey =
          getDateKey(new Date());

        const currentTotal =
          getCachedTotalStats(
            s.projectData
          ).words;

        if (
          bucket.baselineDate !==
          todayKey
        ) {
          bucket.baselineDate =
            todayKey;

          bucket.baselineWords =
            currentTotal;

          if (
            bucket.history[
              todayKey
            ] === undefined
          ) {
            bucket.history[
              todayKey
            ] = 0;
          }
        } else {
          bucket.history[
            todayKey
          ] =
            currentTotal -
            bucket.baselineWords;
        }

        await window.api.saveWritingStats(
          stats
        );
      } catch (error) {
        console.error(
          "Échec de l'enregistrement des statistiques d'écriture :",
          error
        );
      }
    }, [projectName, s]);

  const maybeCreateBackup =
    useCallback(async (): Promise<void> => {
      if (
        !s.hasUnsavedChangesSinceLastBackup
      ) {
        return;
      }

      const now = Date.now();

      if (
        now - s.lastBackupAt <
        BACKUP_INTERVAL_MS
      ) {
        return;
      }

      try {
        await window.api.createBackup(
          projectName,
          s.projectData
        );

        s.lastBackupAt = now;
        s.hasUnsavedChangesSinceLastBackup =
          false;
      } catch (error) {
        console.error(
          'Échec de la sauvegarde automatique horodatée :',
          error
        );
      }
    }, [projectName, s]);

  const persistUiState =
    useCallback(async (): Promise<void> => {
      s.uiState[projectName] = {
        openTabs: s.openTabs,
        activeTab: s.activeTab,
        activeType: s.activeType
      };

      await window.api.saveUiState(
        s.uiState
      );
    }, [projectName, s]);

  const cancelPendingChapterSave =
    useCallback(
      (chapterName: string): void => {
        const pending =
          pendingChapterSavesRef.current.get(
            chapterName
          );

        if (!pending) {
          return;
        }

        clearTimeout(pending.timer);

        pendingChapterSavesRef.current.delete(
          chapterName
        );
      },
      []
    );

  const cancelAllPendingChapterSaves =
    useCallback((): void => {
      pendingChapterSavesRef.current.forEach(
        (pending) => {
          clearTimeout(
            pending.timer
          );
        }
      );

      pendingChapterSavesRef.current.clear();
    }, []);

  /*
   * Sauvegarde ciblée d'un seul chapitre.
   *
   * Le nom et le HTML sont fournis explicitement : un changement d'onglet
   * pendant la sauvegarde ne peut donc pas envoyer le contenu dans le mauvais
   * chapitre.
   */
  const saveChapterSnapshot =
    useCallback(
      async (
        chapterName: string,
        html: string,
        options?: {
          saveUiState?: boolean;
        }
      ): Promise<void> => {
        if (
          s.projectData.chapters[
            chapterName
          ] === undefined
        ) {
          return;
        }

        cancelPendingChapterSave(
          chapterName
        );

        s.projectData.chapters[
          chapterName
        ] = html;

        s.projects[projectName] =
          s.projectData;

        s.hasUnsavedChangesSinceLastBackup =
          true;

        try {
          await enqueuePersistence(
            async () => {
              await window.api.saveProjectChapter(
                projectName,
                chapterName,
                html
              );

              if (
                options?.saveUiState
              ) {
                await persistUiState();
              }
            }
          );

          /*
           * On n'affiche "Enregistré" que si le chapitre n'a pas été modifié
           * pendant l'appel IPC.
           */
          const currentHtml =
            s.projectData.chapters[
              chapterName
            ];

          const stillPending =
            pendingChapterSavesRef.current.has(
              chapterName
            );

          if (
            currentHtml === html &&
            !stillPending
          ) {
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
      [
        cancelPendingChapterSave,
        enqueuePersistence,
        maybeCreateBackup,
        persistUiState,
        projectName,
        recordWritingStats,
        s,
        setSaveStatus
      ]
    );

  const scheduleChapterSave =
    useCallback(
      (
        chapterName: string,
        html: string
      ): void => {
        cancelPendingChapterSave(
          chapterName
        );

        const timer = setTimeout(
          () => {
            pendingChapterSavesRef.current.delete(
              chapterName
            );

            void saveChapterSnapshot(
              chapterName,
              html
            );
          },
          CHAPTER_SAVE_DEBOUNCE_MS
        );

        pendingChapterSavesRef.current.set(
          chapterName,
          {
            html,
            timer
          }
        );
      },
      [
        cancelPendingChapterSave,
        saveChapterSnapshot
      ]
    );

  /*
   * Sauvegarde complète réservée aux changements structurels :
   * création, suppression, renommage, ordre des chapitres, fiches World
   * Building, restauration d'une sauvegarde, etc.
   */
  const saveAll =
    useCallback(async (): Promise<void> => {
      cancelAllPendingChapterSaves();

      if (
        s.activeType === 'chapter' &&
        s.activeTab &&
        s.editorEl
      ) {
        s.projectData.chapters[
          s.activeTab
        ] = s.editorEl.innerHTML;
      }

      s.projects[projectName] =
        s.projectData;

      s.hasUnsavedChangesSinceLastBackup =
        true;

      try {
        await enqueuePersistence(
          async () => {
            await window.api.saveProjects(
              s.projects
            );

            await persistUiState();
          }
        );

        setSaveStatus('saved');

        void recordWritingStats();
        void maybeCreateBackup();
      } catch (error) {
        console.error(
          'Échec de la sauvegarde complète :',
          error
        );

        setSaveStatus('error');
      }
    }, [
      cancelAllPendingChapterSaves,
      enqueuePersistence,
      maybeCreateBackup,
      persistUiState,
      projectName,
      recordWritingStats,
      s,
      setSaveStatus
    ]);

  /*
   * Sauvegarde normale de l'éditeur.
   *
   * Pour un chapitre, seul le chapitre actif est transmis au processus main.
   * Les données complètes ne sont plus sérialisées à chaque sauvegarde.
   */
  const save =
    useCallback(async (): Promise<void> => {
      if (
        s.activeType === 'chapter' &&
        s.activeTab &&
        s.editorEl
      ) {
        const chapterName =
          s.activeTab;

        const html =
          s.editorEl.innerHTML;

        s.projectData.chapters[
          chapterName
        ] = html;

        await saveChapterSnapshot(
          chapterName,
          html,
          {
            saveUiState: true
          }
        );

        return;
      }

      try {
        await enqueuePersistence(
          persistUiState
        );

        setSaveStatus('saved');
      } catch (error) {
        console.error(
          "Échec de la sauvegarde de l'état de l'éditeur :",
          error
        );

        setSaveStatus('error');
      }
    }, [
      enqueuePersistence,
      persistUiState,
      s,
      saveChapterSnapshot,
      setSaveStatus
    ]);

  const updateGrammarStatus =
    useCallback((): void => {
      status.set({
        grammarEnabled:
          s.grammarPrefs.enabled,
        grammarReady:
          s.grammarServerReady,
        grammarStarting:
          s.grammarStarting
      });
    }, [s, status]);

  const runGrammarCheck =
    useCallback(async (): Promise<void> => {
      if (
        !s.grammarPrefs.enabled ||
        !s.grammarServerReady
      ) {
        return;
      }

      if (
        s.activeType !== 'chapter' ||
        !s.activeTab
      ) {
        return;
      }

      const editor = s.editorEl;

      if (
        !editor ||
        s.grammarCheckInFlight
      ) {
        return;
      }

      const checkedChapter =
        s.activeTab;

      s.grammarCheckInFlight = true;

      try {
        const caretOffset =
          getCaretCharacterOffsetWithin(
            editor
          );

        const hadMarks =
          clearGrammarMarks(editor);

        const { text } =
          getPlainTextWithMap(editor);

        if (text.trim().length > 0) {
          const language =
            getLanguage() === 'en'
              ? 'en-US'
              : 'fr';

          const matches =
            await window.api.checkGrammar(
              text,
              language
            );

          if (
            s.activeType ===
              'chapter' &&
            s.activeTab ===
              checkedChapter &&
            s.editorEl === editor
          ) {
            applyGrammarMatches(
              editor,
              matches,
              getPlainTextWithMap(
                editor
              ).nodes
            );
          }
        }

        if (
          hadMarks ||
          text.trim().length > 0
        ) {
          try {
            setCaretPosition(
              editor,
              caretOffset
            );
          } catch {
            // Le curseur peut ne plus correspondre au contenu courant.
          }
        }
      } catch (error) {
        const message =
          describeError(error);

        console.error(
          'Erreur du correcteur de grammaire :',
          error
        );

        if (
          s.lastGrammarErrorShown !==
          message
        ) {
          s.lastGrammarErrorShown =
            message;

          s.grammarServerReady =
            false;

          updateGrammarStatus();

          showInfo(
            t(
              'grammarCheckFailedAlert',
              {
                error: message
              }
            )
          );
        }
      } finally {
        s.grammarCheckInFlight =
          false;
      }
    }, [
      s,
      showInfo,
      updateGrammarStatus
    ]);

  const debouncedGrammarCheck =
    useMemo(
      () =>
        debounce(
          () => {
            void runGrammarCheck();
          },
          1500
        ),
      [runGrammarCheck]
    );

  const refreshGrammarStatus =
    useCallback(async (): Promise<void> => {
      status.set({
        grammarMessage: t(
          'grammarStatusChecking'
        )
      });

      const javaInfo =
        await window.api.checkJavaAvailable();

      status.set({
        javaInfo
      });

      const javaAvailable =
        javaInfo.available &&
        !javaInfo.outdated;

      if (
        !s.grammarPrefs.enabled
      ) {
        status.set({
          grammarMessage: t(
            'grammarStatusDisabled'
          )
        });

        updateGrammarStatus();
        return;
      }

      if (
        !javaAvailable ||
        !s.grammarPrefs
          .languageToolPath
      ) {
        status.set({
          grammarMessage: ''
        });

        updateGrammarStatus();
        return;
      }

      status.set({
        grammarMessage: t(
          'grammarStatusStarting'
        )
      });

      s.grammarStarting = true;
      updateGrammarStatus();

      try {
        const result =
          await window.api.startGrammarServer();

        s.grammarServerReady = true;

        status.set({
          grammarMessage: t(
            'grammarStatusReady',
            {
              port: result.port
            }
          )
        });

        debouncedGrammarCheck();
      } catch (error) {
        s.grammarServerReady = false;

        status.set({
          grammarMessage: t(
            'grammarStatusError',
            {
              error:
                describeError(error)
            }
          )
        });
      } finally {
        s.grammarStarting = false;
        updateGrammarStatus();
      }
    }, [
      debouncedGrammarCheck,
      s,
      status,
      updateGrammarStatus
    ]);

  const highlight =
    useCallback((): void => {
      if (
        s.activeType !== 'chapter' ||
        !s.editorEl
      ) {
        return;
      }

      highlightWorldBuilding(
        s.editorEl,
        s.projectData,
        registry
      );
    }, [registry, s]);

  const debouncedHighlight =
    useMemo(
      () =>
        debounce(() => {
          const editor =
            s.editorEl;

          const chapterName =
            s.activeType ===
              'chapter'
              ? s.activeTab
              : null;

          const chapterSize =
            editor
              ? editor.innerText
                  .length
              : 0;

          const worldItemCount =
            Object.keys(
              s.projectData.world
            ).length;

          let shouldHighlightNow =
            true;

          if (
            chapterSize >
              HIGHLIGHT_SIZE_THRESHOLD ||
            worldItemCount >
              HIGHLIGHT_MANY_ITEMS_THRESHOLD
          ) {
            s.largeChapterHighlightCounter +=
              1;

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
            s.activeType ===
              'chapter' &&
            s.activeTab ===
              chapterName
          ) {
            const finalHtml =
              editor.innerHTML;

            s.projectData.chapters[
              chapterName
            ] = finalHtml;

            mentionIndex.updateForChapter(
              chapterName,
              finalHtml
            );

            history.resyncOnly(
              chapterName,
              finalHtml
            );

            updateUndoRedo();

            /*
             * Le surlignage World Building peut modifier le DOM après la
             * frappe. On remplace donc le snapshot précédent par le HTML
             * final, sans recompter les autres chapitres.
             */
            scheduleChapterSave(
              chapterName,
              finalHtml
            );
          }
        }, 1000),
      [
        highlight,
        history,
        mentionIndex,
        s,
        scheduleChapterSave,
        updateUndoRedo
      ]
    );

  const scheduleHistoryCommit =
    useCallback(
      (
        name: string | null,
        html: string
      ): void => {
        if (!name) {
          return;
        }

        if (
          historyTimerRef.current
        ) {
          clearTimeout(
            historyTimerRef.current
          );
        }

        historyTimerRef.current =
          setTimeout(() => {
            history.commit(
              name,
              html
            );

            updateUndoRedo();
          }, HISTORY_DEBOUNCE_MS);
      },
      [history, updateUndoRedo]
    );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const projects =
        await window.api.getProjects();

      let projectData =
        projects[projectName];

      if (
        projectData &&
        !projectData.chapters &&
        !projectData.world
      ) {
        projectData = {
          chapters:
            projectData as unknown as Record<
              string,
              string
            >,
          world: {}
        };

        projects[projectName] =
          projectData;

        await window.api.saveProjects(
          projects
        );
      } else if (!projectData) {
        projectData = {
          chapters: {},
          world: {}
        };
      }

      if (
        !projectData.customWbTypes
      ) {
        projectData.customWbTypes =
          {};
      }

      const uiState =
        await window.api.getUiState();

      const projectState =
        uiState[projectName] || {
          openTabs: [],
          activeTab: null,
          activeType:
            'chapter' as ItemType
        };

      const prefs =
        (await window.api.getEditorPrefs()) ||
        DEFAULT_EDITOR_PREFS;

      const nativeSpellcheck =
        await window.api.getNativeSpellcheck();

      const grammarPrefs =
        await window.api.getGrammarPrefs();

      if (cancelled) {
        return;
      }

      s.projects = projects;
      s.projectData = projectData;
      s.uiState = uiState;

      s.openTabs =
        projectState.openTabs || [];

      s.activeTab =
        projectState.activeTab;

      s.activeType =
        projectState.activeType ||
        'chapter';

      s.editorPrefs = {
        ...DEFAULT_EDITOR_PREFS,
        ...prefs
      };

      s.nativeSpellcheck =
        nativeSpellcheck;

      s.grammarPrefs =
        grammarPrefs;

      s.ready = true;

      invalidateProjectWordCache(
        projectData
      );

      /*
       * Premier calcul unique à l'ouverture. Les frappes suivantes ne
       * recomptent que le chapitre modifié.
       */
      getCachedTotalStats(
        projectData
      );

      mentionIndex.rebuildAll();
      onApplyPrefs(s.editorPrefs);
      updateGrammarStatus();
      bump();

      if (
        !s.activeTab &&
        s.openTabs.length > 0
      ) {
        s.activeTab =
          s.openTabs[0].name;

        s.activeType =
          s.openTabs[0].type;

        bump();
      }

      if (
        grammarPrefs.enabled
      ) {
        void refreshGrammarStatus();
      }
    })();

    return () => {
      cancelled = true;
    };

    // Le contrôleur est recréé pour chaque projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  useEffect(() => {
    const unsubscribe =
      window.api.onGrammarServerStopped(
        () => {
          s.grammarServerReady =
            false;

          s.lastGrammarErrorShown =
            null;

          updateGrammarStatus();

          if (
            s.grammarPrefs.enabled
          ) {
            void refreshGrammarStatus();
          }
        }
      );

    return unsubscribe;
  }, [
    refreshGrammarStatus,
    s,
    updateGrammarStatus
  ]);

  useEffect(() => {
    return () => {
      if (
        historyTimerRef.current
      ) {
        clearTimeout(
          historyTimerRef.current
        );
      }

      pendingChapterSavesRef.current.forEach(
        (pending) => {
          clearTimeout(
            pending.timer
          );
        }
      );

      pendingChapterSavesRef.current.clear();
    };
  }, []);

  if (!api.current) {
    const ctrl: EditorController = {
      projectName,
      ready: false,
      status,
      registry,

      data: () =>
        stateRef.current.projectData,

      tabs: () =>
        stateRef.current.openTabs,

      activeTab: () =>
        stateRef.current.activeTab,

      activeType: () =>
        stateRef.current.activeType,

      isReadMode: () =>
        stateRef.current.wbReadMode,

      prefs: () =>
        stateRef.current.editorPrefs,

      grammarPrefs: () =>
        stateRef.current.grammarPrefs,

      nativeSpellcheckEnabled: () =>
        stateRef.current.nativeSpellcheck,

      zoom: () =>
        stateRef.current.zoom,

      attachEditor(element) {
        s.editorEl = element;

        if (element) {
          element.style.zoom =
            String(s.zoom);
        }
      },

      onChapterMounted(name) {
        const editor = s.editorEl;

        if (!editor) {
          return;
        }

        history.sync(
          name,
          editor.innerHTML
        );

        s.largeChapterHighlightCounter =
          0;

        highlight();

        if (
          s.chapterColorSyncVersion.get(
            name
          ) !== s.wbColorVersion
        ) {
          syncMentionColors(
            editor,
            s.projectData,
            registry
          );

          s.chapterColorSyncVersion.set(
            name,
            s.wbColorVersion
          );
        }

        const finalHtml =
          editor.innerHTML;

        s.projectData.chapters[
          name
        ] = finalHtml;

        debouncedGrammarCheck();
        updateStats();
        updateUndoRedo();
      },

      handleInput() {
        const editor = s.editorEl;
        const chapterName =
          s.activeTab;

        if (
          !editor ||
          !chapterName ||
          s.activeType !== 'chapter'
        ) {
          return;
        }

        const html =
          editor.innerHTML;

        s.projectData.chapters[
          chapterName
        ] = html;

        s.projects[projectName] =
          s.projectData;

        s.hasUnsavedChangesSinceLastBackup =
          true;

        setSaveStatus('pending');
        updateStats();

        scheduleHistoryCommit(
          chapterName,
          html
        );

        scheduleChapterSave(
          chapterName,
          html
        );

        debouncedHighlight();
        debouncedGrammarCheck();
      },

      handlePaste(event) {
        event.preventDefault();

        const html =
          event.clipboardData.getData(
            'text/html'
          );

        const plainText =
          event.clipboardData.getData(
            'text/plain'
          );

        const escapeHtml = (
          value: string
        ): string =>
          value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        void (async () => {
          let contentToInsert: string;

          if (html) {
            try {
              contentToInsert =
                await window.api.sanitizeHtml(
                  html
                );
            } catch (error) {
              console.error(
                'Échec de la désinfection du collage, repli en texte brut :',
                error
              );

              contentToInsert =
                escapeHtml(
                  plainText
                ).replace(
                  /\n/g,
                  '<br>'
                );
            }
          } else {
            contentToInsert =
              escapeHtml(
                plainText
              ).replace(
                /\n/g,
                '<br>'
              );
          }

          document.execCommand(
            'insertHTML',
            false,
            contentToInsert
          );
        })();
      },

      handleEditorClick(event) {
        const target =
          event.target as HTMLElement;

        const mention =
          target.closest<HTMLElement>(
            '.wb-mention'
          );

        if (!mention) {
          return;
        }

        if (
          !event.ctrlKey &&
          !event.metaKey
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const worldKey =
          mention.dataset.wbKey;

        if (
          worldKey &&
          s.projectData.world[
            worldKey
          ]
        ) {
          ctrl.openItem(
            worldKey,
            'world'
          );
        } else {
          showInfo(
            t('itemNotFound')
          );

          if (s.editorEl) {
            cleanInvalidMentions(
              s.editorEl,
              Object.keys(
                s.projectData.world
              )
            );
          }
        }
      },

      openItem(name, type) {
        const existing =
          s.openTabs.find(
            (tab) =>
              tab.name === name &&
              tab.type === type
          );

        if (!existing) {
          s.openTabs = [
            ...s.openTabs,
            {
              name,
              type
            }
          ];
        }

        ctrl.switchTab(
          name,
          type
        );
      },

      switchTab(name, type) {
        if (
          s.activeTab === name &&
          s.activeType === type
        ) {
          bump();
          return;
        }

        /*
         * La partie synchrone capture le HTML avant le démontage de l'ancien
         * contentEditable. Seul ce chapitre est ensuite envoyé au main.
         */
        void save();

        s.activeTab = name;
        s.activeType = type;

        bump();
      },

      async closeTab(index) {
        const closed =
          s.openTabs[index];

        if (!closed) {
          return;
        }

        await save();

        if (
          status.get().saveState ===
          'error'
        ) {
          const confirmed =
            await showConfirm(
              t(
                'closeTabUnsavedWarning',
                {
                  name: closed.name
                }
              )
            );

          if (!confirmed) {
            return;
          }
        }

        const nextTabs =
          s.openTabs.slice();

        nextTabs.splice(
          index,
          1
        );

        s.openTabs = nextTabs;

        if (
          s.activeTab ===
            closed.name &&
          s.activeType === closed.type
        ) {
          if (
            nextTabs.length > 0
          ) {
            const next =
              nextTabs[
                Math.max(
                  0,
                  index - 1
                )
              ];

            s.activeTab =
              next.name;

            s.activeType =
              next.type;
          } else {
            s.activeTab = null;
          }
        }

        bump();

        try {
          await persistUiState();
        } catch (error) {
          console.error(
            "Échec de la sauvegarde de l'état des onglets :",
            error
          );
        }
      },

      moveTab(from, to) {
        if (from === to) {
          return;
        }

        const next =
          s.openTabs.slice();

        const [moved] =
          next.splice(from, 1);

        if (!moved) {
          return;
        }

        next.splice(
          to,
          0,
          moved
        );

        s.openTabs = next;

        void persistUiState();
        bump();
      },

      cycleTab(delta) {
        if (
          s.openTabs.length <= 1
        ) {
          return;
        }

        const currentIndex =
          s.openTabs.findIndex(
            (tab) =>
              tab.name ===
                s.activeTab &&
              tab.type ===
                s.activeType
          );

        const safeCurrentIndex =
          currentIndex >= 0
            ? currentIndex
            : 0;

        const nextIndex =
          (
            safeCurrentIndex +
            delta +
            s.openTabs.length
          ) %
          s.openTabs.length;

        const next =
          s.openTabs[nextIndex];

        ctrl.switchTab(
          next.name,
          next.type
        );
      },

      save,
      setSaveStatus,
      updateStats,
      recordWritingStats,

      format(command, value) {
        if (
          s.activeType !==
          'chapter'
        ) {
          return;
        }

        document.execCommand(
          command,
          false,
          value
        );

        s.editorEl?.focus();

        /*
         * execCommand ne déclenche pas toujours input de manière identique
         * selon la version de Chromium. On synchronise explicitement.
         */
        ctrl.handleInput();
      },

      setFontFamily(font) {
        applyStyleToSelection({
          fontFamily: font
        });
      },

      setFontSizePx(px) {
        applyStyleToSelection({
          fontSize: `${px}px`
        });
      },

      insertText(text) {
        if (
          s.activeType !==
          'chapter'
        ) {
          return;
        }

        const editor =
          s.editorEl;

        if (!editor) {
          return;
        }

        editor.focus();

        document.execCommand(
          'insertText',
          false,
          text
        );
      },

      undo() {
        if (
          s.activeType !==
            'chapter' ||
          !s.activeTab
        ) {
          return;
        }

        const editor =
          s.editorEl;

        if (!editor) {
          return;
        }

        if (
          historyTimerRef.current
        ) {
          clearTimeout(
            historyTimerRef.current
          );
        }

        const chapterName =
          s.activeTab;

        const previous =
          history.undo(
            chapterName,
            editor.innerHTML
          );

        if (previous === null) {
          return;
        }

        editor.innerHTML =
          previous;

        s.projectData.chapters[
          chapterName
        ] = previous;

        highlight();

        const finalHtml =
          editor.innerHTML;

        s.projectData.chapters[
          chapterName
        ] = finalHtml;

        history.resyncOnly(
          chapterName,
          finalHtml
        );

        mentionIndex.updateForChapter(
          chapterName,
          finalHtml
        );

        placeCaretAtEnd(editor);
        updateStats();
        updateUndoRedo();
        setSaveStatus('pending');

        scheduleChapterSave(
          chapterName,
          finalHtml
        );
      },

      redo() {
        if (
          s.activeType !==
            'chapter' ||
          !s.activeTab
        ) {
          return;
        }

        const editor =
          s.editorEl;

        if (!editor) {
          return;
        }

        if (
          historyTimerRef.current
        ) {
          clearTimeout(
            historyTimerRef.current
          );
        }

        const chapterName =
          s.activeTab;

        const next =
          history.redo(
            chapterName,
            editor.innerHTML
          );

        if (next === null) {
          return;
        }

        editor.innerHTML = next;

        s.projectData.chapters[
          chapterName
        ] = next;

        highlight();

        const finalHtml =
          editor.innerHTML;

        s.projectData.chapters[
          chapterName
        ] = finalHtml;

        history.resyncOnly(
          chapterName,
          finalHtml
        );

        mentionIndex.updateForChapter(
          chapterName,
          finalHtml
        );

        placeCaretAtEnd(editor);
        updateStats();
        updateUndoRedo();
        setSaveStatus('pending');

        scheduleChapterSave(
          chapterName,
          finalHtml
        );
      },

      setZoom(next) {
        s.zoom = Math.min(
          EDITOR_ZOOM_MAX,
          Math.max(
            EDITOR_ZOOM_MIN,
            Number(
              next.toFixed(2)
            )
          )
        );

        if (s.editorEl) {
          s.editorEl.style.zoom =
            String(s.zoom);
        }

        bump();
      },

      zoomBy(direction) {
        ctrl.setZoom(
          s.zoom +
            direction *
              EDITOR_ZOOM_STEP
        );
      },

      createChapter(name) {
        const trimmed =
          name.trim();

        if (
          !trimmed ||
          s.projectData.chapters[
            trimmed
          ] !== undefined
        ) {
          return false;
        }

        s.projectData.chapters[
          trimmed
        ] = '';

        mentionIndex.rebuildChapterOrder();

        setSaveStatus('pending');
        void saveAll();

        ctrl.openItem(
          trimmed,
          'chapter'
        );

        return true;
      },

      createWbItem(name, type) {
        const trimmed =
          name.trim();

        if (
          !trimmed ||
          s.projectData.world[
            trimmed
          ]
        ) {
          return false;
        }

        s.projectData.world[
          trimmed
        ] = {
          wbType: type,
          content: {}
        };

        mentionIndex.addEntryForNewItem(
          trimmed
        );

        setSaveStatus('pending');
        void saveAll();

        ctrl.openItem(
          trimmed,
          'world'
        );

        return true;
      },

      async deleteItem(
        name,
        type
      ) {
        const confirmed =
          await showConfirm(
            t(
              'confirmDeleteItem',
              {
                name
              }
            )
          );

        if (!confirmed) {
          return;
        }

        if (
          s.activeTab === name &&
          s.activeType === type
        ) {
          s.activeTab = null;
        }

        if (
          type === 'chapter'
        ) {
          cancelPendingChapterSave(
            name
          );

          delete s.projectData
            .chapters[name];

          history.remove(name);

          mentionIndex.removeChapter(
            name
          );
        } else {
          delete s.projectData
            .world[name];

          removeMentionsAcrossChapters(
            s.projectData,
            name
          );

          mentionIndex.removeItem(
            name
          );
        }

        const index =
          s.openTabs.findIndex(
            (tab) =>
              tab.name === name &&
              tab.type === type
          );

        if (index !== -1) {
          const nextTabs =
            s.openTabs.slice();

          nextTabs.splice(
            index,
            1
          );

          s.openTabs = nextTabs;

          if (
            !s.activeTab &&
            nextTabs.length > 0
          ) {
            const next =
              nextTabs[
                Math.max(
                  0,
                  index - 1
                )
              ];

            s.activeTab =
              next.name;

            s.activeType =
              next.type;
          }
        }

        setSaveStatus('pending');
        bump();

        await saveAll();
      },

      async renameItem(
        oldName,
        newName,
        type
      ) {
        const trimmed =
          newName.trim();

        if (
          !trimmed ||
          trimmed === oldName
        ) {
          return false;
        }

        if (
          type === 'chapter'
        ) {
          if (
            s.projectData.chapters[
              trimmed
            ] !== undefined
          ) {
            showInfo(
              t('alreadyExists')
            );

            return false;
          }

          cancelPendingChapterSave(
            oldName
          );

          const nextChapters: Record<
            string,
            string
          > = {};

          Object.keys(
            s.projectData.chapters
          ).forEach((key) => {
            if (key === oldName) {
              nextChapters[
                trimmed
              ] =
                s.projectData.chapters[
                  oldName
                ];
            } else {
              nextChapters[key] =
                s.projectData.chapters[
                  key
                ];
            }
          });

          s.projectData.chapters =
            nextChapters;

          history.rename(
            oldName,
            trimmed
          );

          mentionIndex.renameChapter(
            oldName,
            trimmed
          );
        } else {
          if (
            s.projectData.world[
              trimmed
            ]
          ) {
            showInfo(
              t('alreadyExists')
            );

            return false;
          }

          const affectedChapters =
            mentionIndex.chaptersContaining(
              oldName
            );

          if (
            affectedChapters.length >
            0
          ) {
            const proceed =
              await showConfirm(
                t(
                  'renameWbMentionsWarning',
                  {
                    oldName,
                    newName: trimmed,
                    count:
                      affectedChapters.length
                  }
                )
              );

            if (!proceed) {
              return false;
            }
          }

          const nextWorld: ProjectData['world'] =
            {};

          Object.keys(
            s.projectData.world
          ).forEach((key) => {
            if (key === oldName) {
              nextWorld[
                trimmed
              ] =
                s.projectData.world[
                  oldName
                ];
            } else {
              nextWorld[key] =
                s.projectData.world[
                  key
                ];
            }
          });

          s.projectData.world =
            nextWorld;

          if (
            affectedChapters.length >
            0
          ) {
            renameWorldMentionsAcrossChapters(
              s.projectData,
              oldName,
              trimmed
            );
          }

          mentionIndex.renameItem(
            oldName,
            trimmed
          );
        }

        const tab =
          s.openTabs.find(
            (item) =>
              item.name === oldName &&
              item.type === type
          );

        if (tab) {
          s.openTabs =
            s.openTabs.map(
              (item) =>
                item.name ===
                  oldName &&
                item.type === type
                  ? {
                      ...item,
                      name: trimmed
                    }
                  : item
            );
        }

        if (
          s.activeTab === oldName &&
          s.activeType === type
        ) {
          s.activeTab = trimmed;
        }

        if (
          s.activeType ===
            'chapter' &&
          s.activeTab &&
          s.editorEl
        ) {
          s.editorEl.innerHTML =
            s.projectData.chapters[
              s.activeTab
            ] || '';

          highlight();

          const finalHtml =
            s.editorEl.innerHTML;

          s.projectData.chapters[
            s.activeTab
          ] = finalHtml;

          history.resyncOnly(
            s.activeTab,
            finalHtml
          );

          updateStats();
        }

        setSaveStatus('pending');
        bump();

        await saveAll();

        return true;
      },

      reorderSidebar(
        type,
        newOrder
      ) {
        if (
          type === 'chapter'
        ) {
          const next: Record<
            string,
            string
          > = {};

          newOrder.forEach(
            (key) => {
              next[key] =
                s.projectData.chapters[
                  key
                ];
            }
          );

          s.projectData.chapters =
            next;

          mentionIndex.rebuildChapterOrder();
        } else {
          const next: ProjectData['world'] =
            {};

          newOrder.forEach(
            (key) => {
              next[key] =
                s.projectData.world[
                  key
                ];
            }
          );

          s.projectData.world =
            next;
        }

        setSaveStatus('pending');
        bump();

        void saveAll();
      },

      updateWbField(
        name,
        fieldKey,
        value
      ) {
        const item =
          s.projectData.world[
            name
          ];

        if (!item) {
          return;
        }

        item.content[
          fieldKey
        ] = value;

        setSaveStatus('pending');

        /*
         * Les fiches World Building restent dans le projet global. Leur
         * optimisation pourra être faite ensuite avec un canal IPC dédié.
         */
        void saveAll();
      },

      setWbIcon(name, icon) {
        const item =
          s.projectData.world[
            name
          ];

        if (!item) {
          return;
        }

        item.icon = icon;

        setSaveStatus('pending');
        void saveAll();
        bump();
      },

      setWbColor(name, color) {
        const item =
          s.projectData.world[
            name
          ];

        if (!item) {
          return;
        }

        item.color = color;

        s.wbColorVersion += 1;

        setSaveStatus('pending');
        void saveAll();
        bump();
      },

      toggleReadMode() {
        s.wbReadMode =
          !s.wbReadMode;

        bump();
      },

      chaptersContaining(name) {
        return mentionIndex.chaptersContaining(
          name
        );
      },

      itemsUsingType(slug) {
        return Object.keys(
          s.projectData.world
        ).filter(
          (name) =>
            s.projectData.world[
              name
            ].wbType === slug
        );
      },

      saveCustomType(
        slug,
        definition
      ) {
        if (
          !s.projectData
            .customWbTypes
        ) {
          s.projectData.customWbTypes =
            {};
        }

        let finalSlug = slug;

        if (!finalSlug) {
          const baseSlug =
            `custom_${slugify(
              definition.label,
              'type'
            )}`;

          finalSlug = baseSlug;

          let index = 2;

          while (
            s.projectData
              .customWbTypes[
              finalSlug
            ]
          ) {
            finalSlug =
              `${baseSlug}_${index}`;

            index += 1;
          }
        }

        s.projectData.customWbTypes[
          finalSlug
        ] = definition;

        registry.bumpVersion();

        setSaveStatus('pending');
        void saveAll();
        bump();

        return finalSlug;
      },

      async deleteCustomType(
        slug,
        definition
      ) {
        const usedBy =
          ctrl.itemsUsingType(
            slug
          );

        if (usedBy.length > 0) {
          showInfo(
            t(
              'customTypeDeleteBlocked',
              {
                count:
                  usedBy.length,
                label:
                  definition.label
              }
            ),
            usedBy.map((name) => ({
              label:
                `${
                  definition.icon ||
                  '📁'
                } ${name}`,
              onClick: () => {
                ctrl.openItem(
                  name,
                  'world'
                );
              }
            }))
          );

          return;
        }

        const confirmed =
          await showConfirm(
            t(
              'customTypeConfirmDelete',
              {
                label:
                  definition.label
              }
            )
          );

        if (!confirmed) {
          return;
        }

        delete s.projectData
          .customWbTypes?.[
          slug
        ];

        registry.bumpVersion();

        setSaveStatus('pending');
        bump();

        await saveAll();
      },

      replaceAll(
        findText,
        replacementText,
        wholeProject
      ) {
        if (!findText) {
          return;
        }

        if (
          historyTimerRef.current
        ) {
          clearTimeout(
            historyTimerRef.current
          );
        }

        if (!wholeProject) {
          if (
            s.activeType !==
              'chapter' ||
            !s.activeTab
          ) {
            showInfo(
              t(
                'replaceNoChapterOpen'
              )
            );

            return;
          }

          const chapterName =
            s.activeTab;

          const oldHtml =
            s.projectData.chapters[
              chapterName
            ];

          const {
            html: newHtml,
            count
          } = replaceInHtmlString(
            oldHtml,
            findText,
            replacementText
          );

          if (count === 0) {
            showInfo(
              t(
                'replaceNoneInChapter'
              )
            );

            return;
          }

          history.sync(
            chapterName,
            oldHtml
          );

          s.projectData.chapters[
            chapterName
          ] = newHtml;

          const editor =
            s.editorEl;

          let finalHtml =
            newHtml;

          if (editor) {
            editor.innerHTML =
              newHtml;

            highlight();

            finalHtml =
              editor.innerHTML;

            s.projectData.chapters[
              chapterName
            ] = finalHtml;

            history.commit(
              chapterName,
              finalHtml
            );

            mentionIndex.updateForChapter(
              chapterName,
              finalHtml
            );
          }

          updateUndoRedo();
          setSaveStatus('pending');
          updateStats();

          scheduleChapterSave(
            chapterName,
            finalHtml
          );

          showInfo(
            t(
              'replaceDoneInChapter',
              {
                count
              }
            )
          );

          return;
        }

        let totalCount = 0;
        let chaptersAffected = 0;

        Object.keys(
          s.projectData.chapters
        ).forEach(
          (chapterName) => {
            const oldHtml =
              s.projectData.chapters[
                chapterName
              ];

            const {
              html: newHtml,
              count
            } = replaceInHtmlString(
              oldHtml,
              findText,
              replacementText
            );

            if (count === 0) {
              return;
            }

            chaptersAffected += 1;
            totalCount += count;

            history.sync(
              chapterName,
              oldHtml
            );

            s.projectData.chapters[
              chapterName
            ] = newHtml;

            history.commit(
              chapterName,
              newHtml
            );

            if (
              chapterName ===
                s.activeTab &&
              s.editorEl
            ) {
              s.editorEl.innerHTML =
                newHtml;

              highlight();

              const finalHtml =
                s.editorEl.innerHTML;

              history.resyncOnly(
                chapterName,
                finalHtml
              );

              s.projectData.chapters[
                chapterName
              ] = finalHtml;
            }
          }
        );

        mentionIndex.rebuildAll();
        updateUndoRedo();
        setSaveStatus('pending');
        updateStats();

        void saveAll();

        showInfo(
          totalCount > 0
            ? t(
                'replaceDoneInProject',
                {
                  count: totalCount,
                  chapters:
                    chaptersAffected
                }
              )
            : t(
                'replaceNoneInProject'
              )
        );
      },

      updatePrefs(prefs) {
        s.editorPrefs = prefs;

        onApplyPrefs(prefs);

        void window.api.saveEditorPrefs(
          prefs
        );

        bump();
      },

      async setNativeSpellcheck(
        enabled
      ) {
        s.nativeSpellcheck =
          enabled;

        await window.api.setNativeSpellcheck(
          enabled
        );

        if (s.editorEl) {
          s.editorEl.spellcheck =
            enabled;
        }

        bump();
      },

      async setGrammarEnabled(
        enabled
      ) {
        s.grammarPrefs =
          await window.api.saveGrammarPrefs(
            {
              enabled
            }
          );

        if (
          !s.grammarPrefs.enabled
        ) {
          s.grammarServerReady =
            false;

          const editor =
            s.editorEl;

          if (
            editor &&
            clearGrammarMarks(
              editor
            ) &&
            s.activeTab
          ) {
            const chapterName =
              s.activeTab;

            const html =
              editor.innerHTML;

            s.projectData.chapters[
              chapterName
            ] = html;

            scheduleChapterSave(
              chapterName,
              html
            );
          }
        }

        updateGrammarStatus();

        await refreshGrammarStatus();

        bump();
      },

      refreshGrammarStatus,

      resetGrammarError() {
        s.lastGrammarErrorShown =
          null;
      },

      applyGrammarSuggestion(
        mark,
        replacement
      ) {
        const parent =
          mark.parentNode;

        if (!parent) {
          return;
        }

        parent.insertBefore(
          document.createTextNode(
            replacement
          ),
          mark
        );

        parent.removeChild(mark);
        parent.normalize();

        const editor =
          s.editorEl;

        if (
          editor &&
          s.activeTab
        ) {
          const chapterName =
            s.activeTab;

          const html =
            editor.innerHTML;

          s.projectData.chapters[
            chapterName
          ] = html;

          setSaveStatus('pending');
          updateStats();

          scheduleHistoryCommit(
            chapterName,
            html
          );

          scheduleChapterSave(
            chapterName,
            html
          );
        }
      },

      ignoreGrammarMark(mark) {
        const parent =
          mark.parentNode;

        if (!parent) {
          return;
        }

        while (
          mark.firstChild
        ) {
          parent.insertBefore(
            mark.firstChild,
            mark
          );
        }

        parent.removeChild(mark);
        parent.normalize();
      },

      async exportAs(kind) {
        const chapterNames =
          Object.keys(
            s.projectData.chapters
          );

        if (
          kind !== 'project' &&
          chapterNames.length === 0
        ) {
          showInfo(
            t('nothingToExport')
          );

          return;
        }

        await save();

        try {
          if (kind === 'txt') {
            const result =
              await window.api.showSaveDialog(
                {
                  title:
                    'Exporter en TXT',
                  defaultPath:
                    `${projectName} - Complet.txt`,
                  filters: [
                    {
                      name:
                        'Fichier Texte',
                      extensions: [
                        'txt'
                      ]
                    }
                  ]
                }
              );

            if (
              result.canceled ||
              !result.filePath
            ) {
              return;
            }

            let fullText = '';

            chapterNames.forEach(
              (chapterName) => {
                const temporary =
                  document.createElement(
                    'div'
                  );

                temporary.innerHTML =
                  s.projectData
                    .chapters[
                    chapterName
                  ] || '';

                fullText +=
                  `--- ${chapterName} ---\n\n` +
                  temporary.innerText +
                  '\n\n\n';
              }
            );

            await window.api.exportTxt(
              result.filePath,
              fullText
            );

            showInfo(
              t('exportTxtSuccess')
            );

            return;
          }

          if (kind === 'md') {
            const result =
              await window.api.showSaveDialog(
                {
                  title:
                    'Exporter en Markdown',
                  defaultPath:
                    `${projectName}.md`,
                  filters: [
                    {
                      name:
                        'Markdown',
                      extensions: [
                        'md'
                      ]
                    }
                  ]
                }
              );

            if (
              result.canceled ||
              !result.filePath
            ) {
              return;
            }

            await window.api.exportTxt(
              result.filePath,
              buildMarkdown(
                s.projectData
              )
            );

            showInfo(
              t('exportMdSuccess')
            );

            return;
          }

          if (kind === 'pdf') {
            const result =
              await window.api.showSaveDialog(
                {
                  title:
                    'Exporter en PDF',
                  defaultPath:
                    `${projectName}.pdf`,
                  filters: [
                    {
                      name: 'PDF',
                      extensions: [
                        'pdf'
                      ]
                    }
                  ]
                }
              );

            if (
              result.canceled ||
              !result.filePath
            ) {
              return;
            }

            await window.api.exportPdf(
              result.filePath,
              buildPrintHtml(
                s.projectData,
                projectName
              )
            );

            showInfo(
              t('exportPdfSuccess')
            );

            return;
          }

          if (kind === 'docx') {
            const result =
              await window.api.showSaveDialog(
                {
                  title:
                    'Exporter en DOCX',
                  defaultPath:
                    `${projectName} - Complet.docx`,
                  filters: [
                    {
                      name: 'Word',
                      extensions: [
                        'docx'
                      ]
                    }
                  ]
                }
              );

            if (
              result.canceled ||
              !result.filePath
            ) {
              return;
            }

            await window.api.exportDocx(
              result.filePath,
              buildDocxData(
                s.projectData
              )
            );

            showInfo(
              t('exportDocxSuccess')
            );

            return;
          }

          const result =
            await window.api.showSaveDialog(
              {
                title:
                  'Exporter le projet complet',
                defaultPath:
                  `${projectName}.scriptorium`,
                filters: [
                  {
                    name:
                      'Projet Scriptorium',
                    extensions: [
                      'scriptorium'
                    ]
                  }
                ]
              }
            );

          if (
            result.canceled ||
            !result.filePath
          ) {
            return;
          }

          await window.api.exportProject(
            result.filePath,
            projectName,
            s.projectData
          );

          showInfo(
            t('exportSuccess')
          );
        } catch (error) {
          const message =
            describeError(error);

          console.error(
            `Erreur export ${kind} :`,
            error
          );

          const prefix = {
            txt: 'exportTxtError',
            md: 'exportMdError',
            pdf: 'exportPdfError',
            docx: 'exportDocxError',
            project:
              'exportProjectError'
          } as const;

          showInfo(
            t(prefix[kind]) +
              message
          );
        }
      },

      async restoreBackup(
        fileName
      ) {
        await window.api.createBackup(
          projectName,
          s.projectData
        );

        const restored =
          await window.api.restoreBackup(
            projectName,
            fileName
          );

        s.projectData =
          restored;

        if (
          !s.projectData
            .customWbTypes
        ) {
          s.projectData.customWbTypes =
            {};
        }

        registry.bumpVersion();

        s.wbColorVersion += 1;

        s.chapterColorSyncVersion.clear();

        invalidateProjectWordCache(
          s.projectData
        );

        mentionIndex.rebuildAll();

        s.projects[projectName] =
          s.projectData;

        cancelAllPendingChapterSaves();

        await window.api.saveProjects(
          s.projects
        );

        s.activeTab = null;
        s.openTabs = [];

        await persistUiState();

        bump();
      },

      async renameProject(
        newName
      ) {
        const trimmed =
          newName.trim();

        if (
          !trimmed ||
          trimmed === projectName
        ) {
          return false;
        }

        /*
         * Le renommage déplace tout le projet : une sauvegarde complète est
         * donc obligatoire ici.
         */
        await saveAll();

        const allProjects =
          await window.api.getProjects();

        if (
          allProjects[trimmed]
        ) {
          showInfo(
            t('alreadyExists')
          );

          return false;
        }

        const next: ProjectsMap =
          {};

        Object.keys(
          allProjects
        ).forEach((key) => {
          next[
            key === projectName
              ? trimmed
              : key
          ] =
            key === projectName
              ? s.projectData
              : allProjects[key];
        });

        await window.api.saveProjects(
          next
        );

        const uiState =
          await window.api.getUiState();

        if (
          uiState[projectName]
        ) {
          uiState[trimmed] =
            uiState[projectName];

          delete uiState[
            projectName
          ];

          await window.api.saveUiState(
            uiState
          );
        }

        await window.api.setCurrentProject(
          trimmed
        );

        return true;
      }
    };

    function applyStyleToSelection(
      styles: Partial<CSSStyleDeclaration>
    ): void {
      if (
        s.activeType !==
        'chapter'
      ) {
        return;
      }

      const editor =
        s.editorEl;

      if (!editor) {
        return;
      }

      const selection =
        window.getSelection();

      if (
        !selection ||
        selection.rangeCount === 0
      ) {
        return;
      }

      const range =
        selection.getRangeAt(0);

      if (
        !editor.contains(
          range.startContainer
        ) ||
        !editor.contains(
          range.endContainer
        )
      ) {
        return;
      }

      const span =
        document.createElement(
          'span'
        );

      Object.assign(
        span.style,
        styles
      );

      if (range.collapsed) {
        span.appendChild(
          document.createTextNode(
            '\u200B'
          )
        );

        range.insertNode(span);

        const caretRange =
          document.createRange();

        if (span.firstChild) {
          caretRange.setStart(
            span.firstChild,
            1
          );

          caretRange.collapse(
            true
          );

          selection.removeAllRanges();

          selection.addRange(
            caretRange
          );
        }
      } else {
        span.appendChild(
          range.extractContents()
        );

        range.insertNode(span);

        const newRange =
          document.createRange();

        newRange.selectNodeContents(
          span
        );

        selection.removeAllRanges();

        selection.addRange(
          newRange
        );
      }

      editor.focus();

      const chapterName =
        s.activeTab;

      if (!chapterName) {
        return;
      }

      const html =
        editor.innerHTML;

      s.projectData.chapters[
        chapterName
      ] = html;

      setSaveStatus('pending');
      updateStats();

      scheduleHistoryCommit(
        chapterName,
        html
      );

      scheduleChapterSave(
        chapterName,
        html
      );

      debouncedHighlight();
      debouncedGrammarCheck();
    }

    api.current = ctrl;
  }

  api.current.ready =
    s.ready;

  return api.current;
}

export function slugify(
  value: string,
  fallback: string
): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-z0-9]+/g,
        '_'
      )
      .replace(
        /^_+|_+$/g,
        ''
      ) || fallback
  );
}

export function buildCustomTypeFields(
  rawFields: {
    label: string;
    type: WbField['type'];
    existingKey?: string;
  }[]
): WbField[] {
  const usedKeys =
    new Set(
      rawFields
        .map(
          (field) =>
            field.existingKey
        )
        .filter(
          Boolean
        ) as string[]
    );

  return rawFields.map(
    (field) => {
      if (
        field.existingKey
      ) {
        return {
          key:
            field.existingKey,
          label:
            field.label,
          type:
            field.type
        };
      }

      const base =
        slugify(
          field.label,
          'champ'
        );

      let uniqueKey =
        base;

      let index = 2;

      while (
        usedKeys.has(
          uniqueKey
        )
      ) {
        uniqueKey =
          `${base}_${index}`;

        index += 1;
      }

      usedKeys.add(
        uniqueKey
      );

      return {
        key: uniqueKey,
        label:
          field.label,
        type:
          field.type
      };
    }
  );
}
