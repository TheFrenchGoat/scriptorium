// src/renderer/components/editor/NotesPanel.tsx
//
// Panneau Notes (romans seulement), a droite de la zone d'ecriture.
// Etape 1 : note libre du chapitre ouvert, enregistree automatiquement
// dans le livre (ProjectData.chapterNotes). Jamais exportee.

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import type { EditorController } from './useEditorController';

const OPEN_KEY = 'scriptorium.notesPanelOpen';
const SAVE_DELAY_MS = 600;

/** Le panneau etait-il ouvert la derniere fois ? */
export function readNotesPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Memorise l'etat ouvert / ferme du panneau. */
export function saveNotesPanelOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Stockage indisponible : le panneau sera ferme au prochain lancement.
  }
}

interface NotesPanelProps {
  controller: EditorController;
  /** Chapitre ouvert, ou null (aucun chapitre ouvert). */
  chapterName: string | null;
  onClose: () => void;
}

export function NotesPanel({ controller, chapterName, onClose }: NotesPanelProps): React.ReactElement {
  const { t } = useI18n();
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
            onKeyDown={(event) => {
              // Les raccourcis de l'editeur (annuler, accents...) ne doivent pas agir sur le chapitre.
              if (event.key !== 'F11') event.stopPropagation();
            }}
          />
          <p className="notes-panel-hint">{t('notesChapterHint')}</p>
        </div>
      ) : (
        <p className="notes-panel-empty">{t('notesPanelEmpty')}</p>
      )}
    </aside>
  );
}
