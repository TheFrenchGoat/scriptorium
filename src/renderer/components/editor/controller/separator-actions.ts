// src/renderer/components/editor/controller/separator-actions.ts
// Separateurs de scene (etape 2e) : reperage dans le chapitre ouvert ou dans
// tout le livre, remplacement par un seul modele, selection dans l'editeur.
// Meme fonctionnement que la typographie : chaque chapitre modifie passe par
// son historique de frappe (Ctrl+Z), et un remplacement dans tout le livre est
// aussi annulable d'un coup depuis l'historique de projet.

import { chapterOrder, type ChapterStore, type ChapterTextChange } from '../../../lib/project-history';
import { invalidateProjectWordCache } from '../../../lib/project-word-cache';
import {
  findSceneSeparatorsInHtml,
  sceneSeparatorRange,
  unifySceneSeparatorsInHtml,
} from '../../../lib/scene-separators-html';
import {
  addSceneSeparators,
  emptySceneSeparatorReport,
  SCENE_SEPARATOR_STYLES,
  SCENE_SEPARATOR_SYMBOLS,
  type SceneSeparatorItem,
  type SceneSeparatorReport,
  type SceneSeparatorResult,
  type SceneSeparatorStyle,
} from '../../../../shared/scene-separators';
import { isScreenplayData } from './utils';
import type { TypographyActionsContext } from './typography-actions';
import type { EditorController } from './types';

export type SeparatorActions = Pick<
  EditorController,
  'analyzeSceneSeparators' | 'unifySceneSeparators' | 'revealSceneSeparator'
>;

export function createSeparatorActions(ctx: TypographyActionsContext): SeparatorActions {
  const {
    s,
    bump,
    history,
    projectHistory,
    mentionIndex,
    highlight,
    flushPendingHistoryCommit,
    saveAll,
    scheduleChapterSave,
    setSaveStatus,
    updateStats,
    updateUndoRedo,
  } = ctx;

  function available(): boolean {
    return Boolean(s.projectData) && !isScreenplayData(s.projectData);
  }

  function hasChapter(name: string): boolean {
    const chapters = s.projectData ? s.projectData.chapters : undefined;
    if (!chapters || typeof name !== 'string') return false;
    return Object.prototype.hasOwnProperty.call(chapters, name) && typeof chapters[name] === 'string';
  }

  function openEditor(): { name: string; editor: HTMLElement } | null {
    const editor = s.editorEl;
    const name = s.activeTab;
    if (s.activeType !== 'chapter' || !name || !editor || !hasChapter(name)) return null;
    return { name, editor };
  }

  function chapterHtml(name: string): string {
    const open = openEditor();
    if (open && open.name === name) return open.editor.innerHTML;
    const html = s.projectData.chapters[name];
    return typeof html === 'string' ? html : '';
  }

  function targetChapters(wholeProject: boolean): string[] | null {
    if (!wholeProject) {
      const open = openEditor();
      return open ? [open.name] : null;
    }
    const names = chapterOrder(s.projectData as unknown as ChapterStore).filter((name) => hasChapter(name));
    for (const name of Object.keys(s.projectData.chapters)) {
      if (!names.includes(name) && hasChapter(name)) names.push(name);
    }
    return names;
  }

  function writeChapter(name: string, oldHtml: string, newHtml: string): string {
    history.sync(name, oldHtml);
    let finalHtml = newHtml;
    const open = openEditor();
    if (open && open.name === name) {
      open.editor.innerHTML = newHtml;
      highlight();
      finalHtml = open.editor.innerHTML;
    }
    s.projectData.chapters[name] = finalHtml;
    history.commit(name, finalHtml);
    if (open && open.name === name) scheduleChapterSave(name, finalHtml);
    return finalHtml;
  }

  function afterWrite(): void {
    mentionIndex.rebuildAll();
    invalidateProjectWordCache(s.projectData);
    s.hasUnsavedChangesSinceLastBackup = true;
    setSaveStatus('pending');
    updateUndoRedo();
    updateStats();
    bump();
    void saveAll();
  }

  return {
    analyzeSceneSeparators(wholeProject: boolean): SceneSeparatorReport {
      const report = emptySceneSeparatorReport(wholeProject);
      if (!available()) {
        report.unavailable = true;
        return report;
      }
      const names = targetChapters(wholeProject);
      if (!names) {
        report.noChapter = true;
        return report;
      }
      for (const name of names) {
 addSceneSeparators(report, name, findSceneSeparatorsInHtml(chapterHtml(name)));
      }
      return report;
    },

    unifySceneSeparators(wholeProject: boolean, style: SceneSeparatorStyle): SceneSeparatorResult {
      const result: SceneSeparatorResult = { count: 0, chapters: 0, noChapter: false, unavailable: false };
      if (!available() || !SCENE_SEPARATOR_STYLES.includes(style)) {
        result.unavailable = true;
        return result;
      }
      const names = targetChapters(wholeProject);
      if (!names) {
        result.noChapter = true;
        return result;
      }
      flushPendingHistoryCommit();
      const symbol = SCENE_SEPARATOR_SYMBOLS[style];
      const changes: ChapterTextChange[] = [];
      for (const name of names) {
 const oldHtml = chapterHtml(name);
        const fixed = unifySceneSeparatorsInHtml(oldHtml, symbol);
 if (fixed.count === 0 || fixed.html === oldHtml) continue;
        const finalHtml = writeChapter(name, oldHtml, fixed.html);
        changes.push({ name, before: oldHtml, after: finalHtml });
        result.count += fixed.count;
      }
      result.chapters = changes.length;
      if (changes.length === 0) return result;
      if (wholeProject) {
        projectHistory.record({ kind: 'chapter-text', reason: 'typography', changes, count: result.count });
      }
      afterWrite();
      return result;
    },

    revealSceneSeparator(item: SceneSeparatorItem): boolean {
      const editor = s.editorEl;
      if (!item || s.activeType !== 'chapter' || s.activeTab !== item.chapter || !editor || !editor.isConnected) {
        return false;
      }
      const range = sceneSeparatorRange(editor, item.paragraph, item.text);
      if (!range) return false;
      try {
        editor.focus({ preventScroll: true });
      } catch {
 // Focus impossible : la selection est tout de meme posee.
      }
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      const node = range.startContainer;
      const target = node.nodeType === 1 ? (node as Element) : node.parentElement;
      if (target) target.scrollIntoView({ block: 'center' });
      return true;
    },
  };
}
