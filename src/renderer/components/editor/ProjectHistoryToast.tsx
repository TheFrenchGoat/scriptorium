// src/renderer/components/editor/ProjectHistoryToast.tsx
//
// Message temporaire en bas de la fenêtre après une action sur les chapitres
// (suppression, création, renommage, réorganisation), avec un bouton pour
// l'annuler, puis pour la rétablir. Il disparaît après 10 secondes ; le
// survol de la souris le garde affiché.
//
// Le message est déclenché par l'historique des actions de projet
// (événement PROJECT_HISTORY_EVENT de lib/project-history.ts).
// Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z) agissent aussi quand le focus est dans la
// liste des chapitres, ou nulle part ; l'éditeur, les champs de saisie et
// les fiches gardent leur propre Ctrl+Z.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { isEditableTarget, isWbHistoryScope } from '../../lib/wb-history';
import {
  PROJECT_HISTORY_EVENT,
  type ProjectHistoryDirection,
  type ProjectHistoryEventDetail,
} from '../../lib/project-history';
import {
  PROJECT_TOAST_DURATION,
  confirmMessageKey,
  doneMessage,
  failureMessage,
  projectShortcutTarget,
  resultMessage,
  shortcutDirection,
  type ProjectToastSpec,
} from '../../lib/project-history-messages';
import type { EditorController } from './controller/types';
import './project-history-toast.css';

interface ToastState {
  id: number;
  text: string;
  action: ProjectHistoryDirection | null;
}

export interface ProjectHistoryToastProps {
  controller: Pick<EditorController, 'undoProjectAction' | 'redoProjectAction'>;
}

export function ProjectHistoryToast({ controller }: ProjectHistoryToastProps) {
  const { t } = useI18n();
  const { showConfirm } = useDialogs();
  const [toast, setToast] = useState<ToastState | null>(null);
  const controllerRef = useRef(controller);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const countRef = useRef(0);

  controllerRef.current = controller;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, PROJECT_TOAST_DURATION);
  }, [stopTimer]);

  const hide = useCallback(() => {
    stopTimer();
    setToast(null);
  }, [stopTimer]);

  const show = useCallback(
    (spec: ProjectToastSpec | null) => {
      if (!spec) return;
      const vars: Record<string, string> = { ...spec.vars };
      if (spec.reasonKey) vars['reason'] = t(spec.reasonKey);
      countRef.current += 1;
      setToast({ id: countRef.current, text: t(spec.key, vars), action: spec.action });
      startTimer();
    },
    [startTimer, t]
  );

  /** Annule ou rétablit ; quietIfEmpty : aucun message s'il n'y a rien à faire. */
  const run = useCallback(
    async (direction: ProjectHistoryDirection, quietIfEmpty: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        const perform = (confirmed: boolean) =>
          direction === 'undo'
            ? controllerRef.current.undoProjectAction(confirmed)
            : controllerRef.current.redoProjectAction(confirmed);

        let result = perform(false);

        if (result.status === 'needs-confirm') {
          const accepted = await showConfirm(t(confirmMessageKey(direction)));
          // Refus : rien ne change.
          if (!accepted) return;
          result = perform(true);
        }

        if (result.status === 'empty' && quietIfEmpty) return;
        show(resultMessage(result));
      } catch (error) {
        console.error('[project-history]', error);
        show(failureMessage(direction, 'error'));
      } finally {
        busyRef.current = false;
      }
    },
    [show, showConfirm, t]
  );

  // Nouvelle action mémorisée : message avec [Annuler] ; historique vidé : plus de message.
  useEffect(() => {
    const onHistory = (event: Event) => {
      const detail = (event as CustomEvent<ProjectHistoryEventDetail>).detail;
      if (!detail) return;
      if (detail.type === 'clear') {
        hide();
        return;
      }
      if (detail.entry) show(doneMessage(detail.entry));
    };

    window.addEventListener(PROJECT_HISTORY_EVENT, onHistory);
    return () => window.removeEventListener(PROJECT_HISTORY_EVENT, onHistory);
  }, [hide, show]);

  // Ctrl+Z / Ctrl+Y dans la liste des chapitres, ou quand rien n’a le focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const direction = shortcutDirection(event);
      if (!direction) return;
      const place = projectShortcutTarget(
        event.target,
        isEditableTarget(event.target),
        isWbHistoryScope()
      );
      if (!place) return;
      event.preventDefault();
      void run(direction, place === 'free');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  if (!toast) return null;

  const action = toast.action;

  return (
    <div
      key={toast.id}
      className="project-history-toast"
      role="status"
      aria-live="polite"
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
    >
      <span className="project-history-toast-text">{toast.text}</span>
      {action ? (
        <button
          type="button"
          className="project-history-toast-action"
          onClick={() => {
            void run(action, false);
          }}
        >
          {action === 'undo' ? t('phUndo') : t('phRedo')}
        </button>
      ) : null}
      <button
        type="button"
        className="project-history-toast-close"
        aria-label={t('close')}
        title={t('close')}
        onClick={hide}
      >
        {'\u00d7'}
      </button>
    </div>
  );
}
