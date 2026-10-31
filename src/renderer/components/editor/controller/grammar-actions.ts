// src/renderer/components/editor/controller/grammar-actions.ts
// Réglages d’écriture, orthographe et grammaire (sortis de useEditorController, étape 4c-5).

import {
  clearGrammarMarks,
  grammarIgnoreKey,
  removeGrammarGroup,
  replaceGrammarGroup,
} from '../../../lib/grammar-check';
import { withPreservedSelection } from '../../../lib/selection';
import type { EditorController, EditorControllerDeps, MutableState } from './types';

export interface GrammarActionsContext {
  s: MutableState;
  bump: () => void;
  projectName: EditorControllerDeps['projectName'];
  onApplyPrefs: EditorControllerDeps['onApplyPrefs'];
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  updateStats: () => void;
  flushPendingHistoryCommit: () => void;
  scheduleHistoryCommit: (name: string | null, html: string) => void;
  scheduleChapterSave: (chapterName: string, html: string) => void;
  updateGrammarStatus: () => void;
  refreshGrammarStatus: () => Promise<void>;
  debouncedHighlight: () => void;
  debouncedGrammarCheck: () => void;
  /** Fautes ignorées pendant la session (voir ignoreGrammarMark). */
  ignoredGrammarRef: { current: Set<string> };
}

export type GrammarActions = Pick<
  EditorController,
  | 'updatePrefs'
  | 'setNativeSpellcheck'
  | 'setGrammarEnabled'
  | 'refreshGrammarStatus'
  | 'resetGrammarError'
  | 'applyGrammarSuggestion'
  | 'ignoreGrammarMark'
>;

export function createGrammarActions(ctx: GrammarActionsContext): GrammarActions {
  const {
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
  } = ctx;
  return {
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
  };
}
