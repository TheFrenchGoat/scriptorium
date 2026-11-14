// src/renderer/components/editor/controller/typography-actions.ts
// Typographie du livre (etape 2b-1) : reglages, analyse, correction d'un cas,
// du chapitre ouvert ou de tout le livre, cas ignores.
// Chaque chapitre modifie passe par son historique de frappe (Ctrl+Z dans le
// chapitre). Une correction de tout le livre est aussi annulable d'un coup
// depuis l'historique de projet (entree 'chapter-text').

import { getLanguage } from '../../../i18n';
import type { EditHistory } from '../../../lib/edit-history';
import type { MentionIndex } from '../../../lib/mention-index';
import {
  chapterOrder,
  type ChapterStore,
  type ChapterTextChange,
  type ProjectHistory,
} from '../../../lib/project-history';
import { invalidateProjectWordCache } from '../../../lib/project-word-cache';
import { findTypoInHtml, fixOneTypoInHtml, fixTypoInHtml } from '../../../lib/typography-html';
import type { TypoCategory, TypoLanguage } from '../../../../shared/typography';
import {
  addTypoIgnored,
  clearTypoIgnored,
  createTypoKeep,
  normalizeTypoSettings,
  typoIgnoredCase,
  typoOptionsFor,
  type TypoProjectSettings,
} from '../../../../shared/typography-project';
import { isScreenplayData } from './utils';
import type {
  EditorController,
  MutableState,
  TypoFixResult,
  TypoReport,
  TypoReportItem,
} from './types';

/** Nombre maximal de cas renvoyes par une analyse (le total reste exact). */
export const TYPO_REPORT_LIMIT = 5000;

export interface TypographyActionsContext {
  s: MutableState;
  bump: () => void;
  history: EditHistory;
  projectHistory: ProjectHistory;
  mentionIndex: MentionIndex;
  highlight: () => boolean;
  flushPendingHistoryCommit: () => void;
  saveAll: () => Promise<void>;
  scheduleChapterSave: (chapterName: string, html: string) => void;
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  updateStats: () => void;
  updateUndoRedo: () => void;
}

export type TypographyActions = Pick<
  EditorController,
  | 'getTypography'
  | 'setTypography'
  | 'getTypographyLanguage'
  | 'analyzeTypography'
  | 'fixTypographyCase'
  | 'ignoreTypographyCase'
  | 'fixAllTypography'
  | 'restoreTypographyIgnored'
>;

export function createTypographyActions(ctx: TypographyActionsContext): TypographyActions {
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

  /** Reglages du livre, toujours complets. */
  function settings(): TypoProjectSettings {
    return normalizeTypoSettings(s.projectData?.typography);
  }

  /** Langue du texte : reglage du livre, sinon langue de l'interface. */
  function language(): TypoLanguage {
    const own = settings().language;
    if (own === 'fr' || own === 'en') return own;
    return String(getLanguage()) === 'en' ? 'en' : 'fr';
  }

  function storeSettings(next: TypoProjectSettings): void {
    const data = s.projectData;
    if (!data) return;
    data.typography = normalizeTypoSettings(next);
    s.hasUnsavedChangesSinceLastBackup = true;
    setSaveStatus('pending');
    bump();
    void saveAll();
  }

  /** Les scenarios n'ont pas de chapitres : rien a analyser pour l'instant. */
  function available(): boolean {
    return Boolean(s.projectData) && !isScreenplayData(s.projectData);
  }

  function hasChapter(name: string): boolean {
    const chapters = s.projectData ? s.projectData.chapters : undefined;
    if (!chapters || typeof name !== 'string') return false;
    return Object.prototype.hasOwnProperty.call(chapters, name) && typeof chapters[name] === 'string';
  }

  /** Chapitre affiche dans l'editeur, ou null. */
  function openEditor(): { name: string; editor: HTMLElement } | null {
    const editor = s.editorEl;
    const name = s.activeTab;
    if (s.activeType !== 'chapter' || !name || !editor || !hasChapter(name)) return null;
    return { name, editor };
  }

  /** Texte d'un chapitre : celui de l'editeur s'il est affiche. */
  function chapterHtml(name: string): string {
    const open = openEditor();
    if (open && open.name === name) return open.editor.innerHTML;
    const html = s.projectData.chapters[name];
    return typeof html === 'string' ? html : '';
  }

  /** Chapitres concernes (ordre du livre), ou null sans chapitre ouvert. */
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

  /** Ecrit le nouveau texte d'un chapitre et l'ajoute a son historique de frappe. */
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
    getTypography(): TypoProjectSettings {
      return settings();
    },

    setTypography(next: TypoProjectSettings): void {
      if (!s.projectData) return;
      const clean = normalizeTypoSettings(next);
      storeSettings({ ...clean, ignored: settings().ignored });
    },

    getTypographyLanguage(): TypoLanguage {
      return language();
    },

    analyzeTypography(wholeProject: boolean, categories?: readonly TypoCategory[]): TypoReport {
      const report: TypoReport = {
 items: [],
 counts: {},
 total: 0,
        chapters: 0,
        truncated: false,
        noChapter: false,
        unavailable: false,
      };
      if (!available()) {
 report.unavailable = true;
 return report;
      }
      const names = targetChapters(wholeProject);
      if (!names) {
 report.noChapter = true;
 return report;
      }
      const current = settings();
      const options = typoOptionsFor(current, language(), categories);
      for (const name of names) {
 const found = findTypoInHtml(chapterHtml(name), options, createTypoKeep(current, name));
 if (found.length === 0) continue;
 report.chapters += 1;
        for (const item of found) {
   const category = item.issue.category;
   report.counts[category] = (report.counts[category] ?? 0) + 1;
          report.total += 1;
          if (report.items.length < TYPO_REPORT_LIMIT) {
     report.items.push({ ...item, chapter: name });
          } else {
            report.truncated = true;
   }
        }
      }
      return report;
    },

    fixTypographyCase(item: TypoReportItem): boolean {
      if (!available() || !item || !item.issue || !hasChapter(item.chapter)) return false;
      if (typeof item.issue.replacement !== 'string') return false;
      flushPendingHistoryCommit();
      const oldHtml = chapterHtml(item.chapter);
      const fixed = fixOneTypoInHtml(oldHtml, item);
      if (fixed.count === 0 || fixed.html === oldHtml) return false;
      writeChapter(item.chapter, oldHtml, fixed.html);
      afterWrite();
      return true;
    },

    ignoreTypographyCase(item: TypoReportItem): void {
      if (!s.projectData || !item || !item.issue || typeof item.chapter !== 'string') return;
      storeSettings(addTypoIgnored(settings(), typoIgnoredCase(item.chapter, item.text, item.issue)));
    },

    fixAllTypography(wholeProject: boolean, categories?: readonly TypoCategory[]): TypoFixResult {
      const result: TypoFixResult = { count: 0, chapters: 0, noChapter: false, unavailable: false };
      if (!available()) {
        result.unavailable = true;
 return result;
      }
      const names = targetChapters(wholeProject);
      if (!names) {
 result.noChapter = true;
        return result;
      }
      flushPendingHistoryCommit();
      const current = settings();
      const options = typoOptionsFor(current, language(), categories);
      const changes: ChapterTextChange[] = [];
      for (const name of names) {
        const oldHtml = chapterHtml(name);
 const fixed = fixTypoInHtml(oldHtml, options, createTypoKeep(current, name));
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

    restoreTypographyIgnored(): number {
      if (!s.projectData) return 0;
      const count = settings().ignored.length;
      if (count === 0) return 0;
      storeSettings(clearTypoIgnored(settings()));
      return count;
    },
  };
}
