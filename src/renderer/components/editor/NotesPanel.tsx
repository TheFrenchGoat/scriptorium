// src/renderer/components/editor/NotesPanel.tsx
//
// Panneau Notes (romans seulement), a droite de la zone d'ecriture.
// - Note libre du chapitre ouvert (ProjectData.chapterNotes).
// - Commentaires poses sur des passages (ProjectData.chapterComments) ;
//   le passage est marque dans le texte par <span data-comment-id>.
// Rien de tout cela n'est exporte.

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import type { ChapterComment } from '../../../shared/types';
import {
  captureCommentSelection,
  collapseExcerpt,
  readCommentAnchors,
  selectCommentPassage,
  type CommentCapture
} from '../../lib/comments';
import type { EditorController } from './useEditorController';

const OPEN_KEY = 'scriptorium.notesPanelOpen';
const HIDE_RESOLVED_KEY = 'scriptorium.notesHideResolved';
const SAVE_DELAY_MS = 600;
const ANCHOR_DELAY_MS = 300;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Stockage indisponible : valeur par defaut au prochain lancement.
  }
}

/** Le panneau etait-il ouvert la derniere fois ? */
export function readNotesPanelOpen(): boolean {
  return readFlag(OPEN_KEY);
}

/** Memorise l'etat ouvert / ferme du panneau. */
export function saveNotesPanelOpen(open: boolean): void {
  writeFlag(OPEN_KEY, open);
}

/** Surlignage des passages commentes (non resolus) du chapitre ouvert. */
export function CommentHighlights({ ids }: { ids: string[] }): React.ReactElement | null {
  const safe = ids.filter((id) => /^c[a-z0-9]{4,40}$/.test(id));
  if (safe.length === 0) return null;
  const selector = safe.map((id) => `#editor [data-comment-id="${id}"]`).join(', ');
  return (
    <style>
      {`${selector} { background-color: rgba(250, 204, 21, 0.22); border-bottom: 1px solid rgba(217, 119, 6, 0.55); border-radius: 2px; }`}
    </style>
  );
}

/** Les raccourcis de l'editeur (annuler, accents...) ne doivent pas agir sur le chapitre. */
function stopEditorKeys(event: React.KeyboardEvent): void {
  if (event.key !== 'F11') event.stopPropagation();
}

/** Ordre du texte ; les passages effaces viennent a la fin, par date. */
function sortByText(comments: ChapterComment[], order: string[]): ChapterComment[] {
  return [...comments].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.created - b.created;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

interface NotesPanelProps {
  controller: EditorController;
  /** Chapitre ouvert, ou null (aucun chapitre ouvert). */
  chapterName: string | null;
  onClose: () => void;
  /** Demande d'ajout venue du raccourci Ctrl+Alt+M. */
  request?: CommentCapture | null;
  onRequestHandled?: () => void;
}

interface Draft {
  range: Range;
  excerpt: string;
}

export function NotesPanel({
  controller,
  chapterName,
  onClose,
  request = null,
  onRequestHandled
}: NotesPanelProps): React.ReactElement {
  const { t, lang } = useI18n();

  // ------------------------------------------------------------ note du chapitre
  const [text, setText] = useState<string>(() => (chapterName ? controller.getChapterNote(chapterName) : ''));
  const pendingRef = useRef<{ name: string; text: string } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const flushRef = useRef<() => void>(() => undefined);

  flushRef.current = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) controller.setChapterNote(pending.name, pending.text);
  };

  // Changement de chapitre : on enregistre la note precedente puis on charge la nouvelle.
  useEffect(() => {
    setText(chapterName ? controller.getChapterNote(chapterName) : '');
    return () => {
      flushRef.current();
    };
  }, [chapterName]);

  const handleChange = (value: string): void => {
    setText(value);
    if (!chapterName) return;
    pendingRef.current = { name: chapterName, text: value };
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      flushRef.current();
    }, SAVE_DELAY_MS);
  };

  // ------------------------------------------------------------ commentaires
  const [anchors, setAnchors] = useState<Map<string, string> | null>(null);
  const anchorsKeyRef = useRef('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hideResolved, setHideResolved] = useState<boolean>(() => readFlag(HIDE_RESOLVED_KEY));
  const [, setVersion] = useState(0);
  const refreshView = (): void => {
    setVersion((value) => value + 1);
  };

  // Passages presents dans le texte : relus peu apres chaque modification du chapitre.
  useEffect(() => {
    setDraft(null);
    setDraftText('');
    setMessage('');
    setEditingId(null);
    setConfirmId(null);
    setAnchors(null);
    anchorsKeyRef.current = '';
    if (!chapterName) return undefined;
    let observed: HTMLElement | null = null;
    let timer: number | undefined;
    const refresh = (): void => {
      const editor = document.getElementById('editor');
      if (editor !== observed) {
        observer.disconnect();
        observed = editor;
        if (editor) observer.observe(editor, { childList: true, subtree: true, characterData: true });
      }
      const next = editor ? readCommentAnchors(editor) : new Map<string, string>();
      const key = JSON.stringify(Array.from(next.entries()));
      if (key === anchorsKeyRef.current) return;
      anchorsKeyRef.current = key;
      setAnchors(next);
    };
    const observer = new MutationObserver(() => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        refresh();
      }, ANCHOR_DELAY_MS);
    });
    refresh();
    const first = window.setTimeout(refresh, 60);
    return () => {
      observer.disconnect();
      window.clearTimeout(first);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [chapterName]);

  const applyCapture = (capture: CommentCapture): void => {
    setConfirmId(null);
    if (capture.error === 'overlap') {
      setDraft(null);
      setMessage(t('commentErrOverlap'));
      return;
    }
    if (!capture.range) {
      setDraft(null);
      setMessage(t('commentErrNoSelection'));
      return;
    }
    setMessage('');
    setDraft({ range: capture.range, excerpt: capture.excerpt });
    setDraftText('');
  };

  // Raccourci Ctrl+Alt+M (gere par EditorPage) : la demande arrive ici.
  useEffect(() => {
    if (!request) return;
    applyCapture(request);
    onRequestHandled?.();
  }, [request]);

  const cancelDraft = (): void => {
    setDraft(null);
    setDraftText('');
    setMessage('');
  };

  const saveDraft = (): void => {
    const current = draft;
    if (!current || !chapterName) return;
    if (!draftText.trim()) {
      cancelDraft();
      return;
    }
    const id = controller.addChapterComment(chapterName, current.range, draftText, current.excerpt);
    setDraft(null);
    setDraftText('');
    setMessage(id ? '' : t('commentErrLost'));
    refreshView();
  };

  const startEdit = (comment: ChapterComment): void => {
    setConfirmId(null);
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const saveEdit = (): void => {
    if (chapterName && editingId && editText.trim()) {
      controller.updateChapterComment(chapterName, editingId, { text: editText });
    }
    setEditingId(null);
    setEditText('');
    refreshView();
  };

  const toggleResolved = (comment: ChapterComment): void => {
    if (!chapterName) return;
    setConfirmId(null);
    controller.updateChapterComment(chapterName, comment.id, { resolved: !comment.resolved });
    refreshView();
  };

  const removeComment = (id: string): void => {
    if (!chapterName) return;
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    controller.deleteChapterComment(chapterName, id);
    refreshView();
  };

  const goTo = (id: string): void => {
    const editor = document.getElementById('editor');
    if (editor) selectCommentPassage(editor, id);
  };

  const formatDate = (ms: number): string => {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleString(String(lang).startsWith('en') ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const comments = chapterName ? controller.getChapterComments(chapterName) : [];
  const order = anchors ? Array.from(anchors.keys()) : [];
  const sorted = sortByText(comments, order);
  const visible = hideResolved ? sorted.filter((comment) => !comment.resolved) : sorted;
  const resolvedCount = comments.filter((comment) => comment.resolved === true).length;

  return (
    <aside className="notes-panel" aria-label={t('notesPanelTitle')}>
      <div className="notes-panel-head">
        <span className="notes-panel-title">{t('notesPanelTitle')}</span>
        <button
          type="button"
          className="notes-panel-close"
          title={t('notesPanelClose')}
          aria-label={t('notesPanelClose')}
          onClick={() => {
            flushRef.current();
            onClose();
          }}
        >
          {'\u2715'}
        </button>
      </div>
      {chapterName ? (
        <div className="notes-panel-body">
          <label className="notes-panel-label" htmlFor="notesChapterText">
            {t('notesChapterLabel')}
          </label>
          <div className="notes-panel-chapter" title={chapterName}>{chapterName}</div>
          <textarea
            id="notesChapterText"
            className="notes-panel-textarea"
            value={text}
            placeholder={t('notesChapterPlaceholder')}
            spellCheck
            onChange={(event) => { handleChange(event.target.value); }}
            onBlur={() => { flushRef.current(); }}
            onKeyDown={stopEditorKeys}
          />
          <p className="notes-panel-hint">{t('notesChapterHint')}</p>

          <div className="notes-comments">
            <div className="notes-comments-head">
              <span className="notes-panel-label">{t('commentsLabel')} ({comments.length})</span>
              {resolvedCount > 0 && (
                <label className="notes-comments-hide">
                  <input
                    type="checkbox"
                    checked={hideResolved}
                    onChange={(event) => {
                      setHideResolved(event.target.checked);
                      writeFlag(HIDE_RESOLVED_KEY, event.target.checked);
                    }}
                  />
                  {t('commentHideResolved')}
                </label>
              )}
            </div>

            {!draft && (
              <button
                type="button"
                className="notes-comment-add"
                title={t('commentAddTitle')}
                onMouseDown={(event) => { event.preventDefault(); }}
                onClick={() => { applyCapture(captureCommentSelection()); }}
              >
                {t('commentAddBtn')}
              </button>
            )}

            {message && <p className="notes-comment-msg">{message}</p>}

            {draft && (
              <div className="notes-comment draft">
                <div className="notes-comment-excerpt">{'\u00AB '}{collapseExcerpt(draft.excerpt, 120)}{' \u00BB'}</div>
                <textarea
                  className="notes-comment-input"
                  autoFocus
                  value={draftText}
                  placeholder={t('commentPlaceholder')}
                  spellCheck
                  onChange={(event) => { setDraftText(event.target.value); }}
                  onKeyDown={(event) => {
                    stopEditorKeys(event);
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      saveDraft();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelDraft();
                    }
                  }}
                />
                <div className="notes-comment-actions">
                  <button type="button" onClick={saveDraft}>{t('commentSave')}</button>
                  <button type="button" onClick={cancelDraft}>{t('commentCancel')}</button>
                </div>
              </div>
            )}

            {visible.map((comment) => {
              const live = anchors ? anchors.get(comment.id) : undefined;
              const missing = anchors !== null && live === undefined;
              const editing = editingId === comment.id;
              return (
                <div
                  key={comment.id}
                  className={`notes-comment${comment.resolved ? ' resolved' : ''}`}
                  title={missing ? undefined : t('commentGoTitle')}
                  onClick={() => {
                    if (!missing && !editing) goTo(comment.id);
                  }}
                >
                  <div className="notes-comment-excerpt">{'\u00AB '}{collapseExcerpt(live ?? comment.excerpt, 120)}{' \u00BB'}</div>
                  {missing && <span className="notes-comment-missing">{t('commentMissing')}</span>}
                  {editing ? (
                    <div onClick={(event) => { event.stopPropagation(); }}>
                      <textarea
                        className="notes-comment-input"
                        autoFocus
                        value={editText}
                        spellCheck
                        onChange={(event) => { setEditText(event.target.value); }}
                        onKeyDown={(event) => {
                          stopEditorKeys(event);
                          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            saveEdit();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingId(null);
                          }
                        }}
                      />
                      <div className="notes-comment-actions">
                        <button type="button" onClick={saveEdit}>{t('commentSave')}</button>
                        <button type="button" onClick={() => { setEditingId(null); }}>{t('commentCancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="notes-comment-text">{comment.text}</div>
                  )}
                  <div className="notes-comment-meta">
                    {formatDate(comment.created)}
                    {comment.updated ? ` \u00B7 ${t('commentEdited')}` : ''}
                  </div>
                  {!editing && (
                    <div className="notes-comment-actions" onClick={(event) => { event.stopPropagation(); }}>
                      <button type="button" onClick={() => { startEdit(comment); }}>{t('commentEdit')}</button>
                      <button type="button" onClick={() => { toggleResolved(comment); }}>
                        {comment.resolved ? t('commentReopen') : t('commentResolve')}
                      </button>
                      <button
                        type="button"
                        className={confirmId === comment.id ? 'danger' : undefined}
                        title={t('commentDelete')}
                        aria-label={t('commentDelete')}
                        onClick={() => { removeComment(comment.id); }}
                      >
                        {confirmId === comment.id ? t('commentDeleteConfirm') : '\u{1F5D1}\u{FE0F}'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {comments.length === 0 && !draft && <p className="notes-comment-empty">{t('commentEmpty')}</p>}
          </div>
        </div>
      ) : (
        <p className="notes-panel-empty">{t('notesPanelEmpty')}</p>
      )}
    </aside>
  );
}
