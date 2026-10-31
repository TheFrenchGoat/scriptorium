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

import type {
  EditorController,
  EditorControllerDeps,
  MutableState,
  PendingChapterSave,
  PendingHistoryCommit
} from './controller/types';
import {
  BACKUP_INTERVAL_MS,
  CHAPTER_SAVE_DEBOUNCE_MS,
  DEFAULT_EDITOR_PREFS,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  EDITOR_ZOOM_STEP,
  GRAMMAR_LANGUAGE,
  HIGHLIGHT_LARGE_CHAPTER_EVERY_N,
  HIGHLIGHT_MANY_ITEMS_THRESHOLD,
  HIGHLIGHT_SIZE_THRESHOLD,
  HISTORY_DEBOUNCE_MS,
  SCREENPLAY_SAVE_DEBOUNCE_MS,
  WB_SAVE_DEBOUNCE_MS
} from './controller/constants';
import {
  activeEditableElement,
  countText,
  createBlankNovelData,
  currentWbLang,
  detachWbItem,
  ensureProjectDefaults,
  getProjectWordTotal,
  isScreenplayData,
  slugify,
  touchWbItem
} from './controller/utils';
import { createExportActions } from './controller/export-actions';
import { createSearchActions } from './controller/search-actions';
import { createChapterMetaActions } from './controller/chapter-meta-actions';
import { createGrammarActions } from './controller/grammar-actions';
import { createProjectActions } from './controller/project-actions';
import { createWorldbuildingActions } from './controller/worldbuilding-actions';

// Ré-exports : les autres fichiers continuent d'importer depuis useEditorController.
export type { EditorController, EditorControllerDeps } from './controller/types';
export { EDITOR_ZOOM_MAX, EDITOR_ZOOM_MIN, EDITOR_ZOOM_STEP } from './controller/constants';
export { buildCustomTypeFields, slugify } from './controller/utils';

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

        if (bucket.baselineDate !== todayKey) {
          // Nouveau jour : la référence devient le dernier total enregistré
          // (référence précédente + mots de ce jour-là), pour ne pas perdre
          // les mots écrits avant le premier enregistrement de la journée.
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
          bucket.baselineWords = lastKnownTotal;
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

        debouncedGrammarCheck();
        updateStats();
        updateUndoRedo();
      },

      handleInput(_options?: { pasted?: boolean }) {
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

        // Couleur : Chromium produit alors un <span style="color: ..."> au lieu
        // d'une balise <font>, obsolète. Le mode CSS est remis à false juste
        // après : gras, italique et souligné restent des balises <b>, <i>, <u>.
        const useCssForColor = command === 'foreColor';

        if (useCssForColor) {
          document.execCommand('styleWithCSS', false, 'true');
        }

        try {
          document.execCommand(command, false, value);
        } finally {
          if (useCssForColor) {
            document.execCommand('styleWithCSS', false, 'false');
          }
        }

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

      ...createChapterMetaActions({
        s,
        bump,
        setSaveStatus,
        saveAll,
        flushPendingHistoryCommit,
        ctrl: { handleInput: (options) => ctrl.handleInput(options) },
      }),

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

      ...createWorldbuildingActions({
        showInfo,
        showConfirm,
        bump,
        s,
        registry,
        mentionIndex,
        setSaveStatus,
        saveAll,
        scheduleWbSave,
        highlight,
        flushPendingHistoryCommit,
        activeChapterEditor,
        takeWbSnapshot,
        recordWbChange,
        recordWbItemChange,
        resyncChapters,
        ctrl: {
          itemsUsingType: (slug) => ctrl.itemsUsingType(slug),
          openItem: (...args) => ctrl.openItem(...args),
        },
      }),

      ...createSearchActions({
        s,
        showInfo,
        history,
        mentionIndex,
        highlight,
        flushPendingHistoryCommit,
        saveAll,
        scheduleChapterSave,
        setSaveStatus,
        updateStats,
        updateUndoRedo,
        ctrl: { updateScreenplay: (screenplay) => ctrl.updateScreenplay(screenplay) },
      }),

      ...createGrammarActions({
        s,
        bump,
        projectName,
        onApplyPrefs,
        setSaveStatus,
        updateStats,
        flushPendingHistoryCommit,
        scheduleHistoryCommit,
        scheduleChapterSave,
        updateGrammarStatus,
        refreshGrammarStatus,
        debouncedHighlight,
        debouncedGrammarCheck,
        ignoredGrammarRef,
      }),

      ...createExportActions({ projectName, s, registry, showInfo, save }),

      ...createProjectActions({
        projectName,
        showInfo,
        bump,
        s,
        historyTimerRef,
        pendingHistoryRef,
        renamedRef,
        history,
        registry,
        mentionIndex,
        enqueuePersistence,
        setSaveStatus,
        updateUndoRedo,
        updateStats,
        persistUiState,
        cancelAllPendingChapterSaves,
        cancelPendingScreenplaySave,
        cancelPendingWbSave,
        saveAll,
      }),
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
