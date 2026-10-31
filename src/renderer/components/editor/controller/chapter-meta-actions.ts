// src/renderer/components/editor/controller/chapter-meta-actions.ts
// Notes, métadonnées et commentaires de chapitre (sortis de useEditorController, étape 4c-4).

import type { ChapterComment, ChapterMeta, ChapterMetaPatch } from '../../../../shared/types';
import { applyChapterMetaPatch } from '../../../lib/chapter-status';
import {
  isCommentId,
  newCommentId,
  rangeTouchesComment,
  unwrapComment,
  unwrapCommentInHtml,
  wrapRangeWithComment,
} from '../../../lib/comments';
import type { EditorController, MutableState } from './types';

export interface ChapterMetaActionsContext {
  s: MutableState;
  bump: () => void;
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  saveAll: () => Promise<void>;
  flushPendingHistoryCommit: () => void;
  /** Relais vers ctrl, qui n’existe pas encore quand ces actions sont créées. */
  ctrl: Pick<EditorController, 'handleInput'>;
}

export type ChapterMetaActions = Pick<
  EditorController,
  | 'getChapterMeta'
  | 'setChapterMeta'
  | 'getChapterNote'
  | 'setChapterNote'
  | 'getChapterComments'
  | 'addChapterComment'
  | 'updateChapterComment'
  | 'deleteChapterComment'
>;

export function createChapterMetaActions(ctx: ChapterMetaActionsContext): ChapterMetaActions {
  const { s, bump, setSaveStatus, saveAll, flushPendingHistoryCommit, ctrl } = ctx;
  return {
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
  };
}
