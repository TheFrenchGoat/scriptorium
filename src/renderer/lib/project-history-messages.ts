// src/renderer/lib/project-history-messages.ts
//
// Textes du message affiché après une action sur les chapitres et règles des
// raccourcis Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z) de la liste des chapitres.
// Fonctions pures : la traduction et l'affichage sont faits par
// components/editor/ProjectHistoryToast.tsx.

import type { TranslationKey } from '../i18n/dict';
import {
  describeEntry,
  type ProjectHistoryInfo,
  type ProjectHistoryDirection,
  type ProjectHistoryEntry,
  type ProjectHistoryReason,
  type ProjectHistoryResult,
} from './project-history';

/** Durée d'affichage du message, en millisecondes. */
export const PROJECT_TOAST_DURATION = 10000;

/** Zones où Ctrl+Z / Ctrl+Y agissent sur les chapitres. */
export const PROJECT_SHORTCUT_ZONE = '#sectionChapters, .project-history-toast';

/** Fenêtres : les raccourcis n'y agissent jamais. */
const MODAL_ZONE = '.modal, .modal-overlay, .modal-backdrop';

/** Message à afficher : clé de traduction, variables et bouton proposé. */
export interface ProjectToastSpec {
  key: TranslationKey;
  vars: Record<string, string>;
  /** Raison d'un échec : traduite puis placée dans {reason}. */
  reasonKey: TranslationKey | null;
  /** Bouton proposé : annuler (undo) ou rétablir (redo). */
  action: ProjectHistoryDirection | null;
}

/** Touches utiles d'un événement clavier. */
export interface ShortcutKeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Endroit où le raccourci est accepté : liste des chapitres, ou aucun focus. */
export type ProjectShortcutPlace = 'zone' | 'free';

function toastSpec(
  key: TranslationKey,
  vars: Record<string, string>,
  action: ProjectHistoryDirection | null,
  reasonKey: TranslationKey | null = null
): ProjectToastSpec {
  return { key, vars, reasonKey, action };
}

/** Message pour une action sur une scène (faite, rétablie ou annulée). */
function sceneMessage(info: ProjectHistoryInfo, undone: boolean): ProjectToastSpec | null {
  const action: ProjectHistoryDirection = undone ? 'redo' : 'undo';

  switch (info.action) {
    case 'delete':
      return toastSpec(undone ? 'phSceneDeleteUndone' : 'phSceneDeleted', { name: info.label }, action);
    case 'create':
      return toastSpec(undone ? 'phSceneCreateUndone' : 'phSceneCreated', { name: info.label }, action);
    case 'rename': {
      const previous = info.previous ?? '';
      if (!info.label || !previous) {
        return toastSpec(undone ? 'phSceneTitleUndone' : 'phSceneTitleChanged', {}, action);
      }
      return toastSpec(undone ? 'phSceneRenameUndone' : 'phSceneRenamed', { name: info.label, previous }, action);
    }
    case 'reorder':
      return toastSpec(undone ? 'phScenesReorderUndone' : 'phScenesReordered', {}, action);
    default:
      return null;
  }
}

/** Message après une action (ou son rétablissement) : propose de l'annuler. */
export function doneMessage(entry: ProjectHistoryEntry): ProjectToastSpec | null {
  const info = describeEntry(entry);
  if (info.target === 'scene') return sceneMessage(info, false);

  switch (info.action) {
    case 'delete':
      return toastSpec('phChapterDeleted', { name: info.label }, 'undo');
    case 'create':
      return toastSpec('phChapterCreated', { name: info.label }, 'undo');
    case 'rename':
      return toastSpec('phChapterRenamed', { name: info.label, previous: info.previous ?? '' }, 'undo');
    case 'reorder':
      return toastSpec('phChaptersReordered', {}, 'undo');
    default:
      return null;
  }
}

/** Message après une annulation : propose de rétablir. */
export function undoneMessage(entry: ProjectHistoryEntry): ProjectToastSpec | null {
  const info = describeEntry(entry);
  if (info.target === 'scene') return sceneMessage(info, true);

  switch (info.action) {
    case 'delete':
      return toastSpec('phChapterDeleteUndone', { name: info.label }, 'redo');
    case 'create':
      return toastSpec('phChapterCreateUndone', { name: info.label }, 'redo');
    case 'rename':
      return toastSpec('phChapterRenameUndone', { name: info.label, previous: info.previous ?? '' }, 'redo');
    case 'reorder':
      return toastSpec('phChaptersReorderUndone', {}, 'redo');
    default:
      return null;
  }
}

/** Clé de traduction de la raison d'un échec. */
export function failureReasonKey(
  reason: ProjectHistoryReason | null,
  target: ProjectHistoryInfo['target'] = 'chapter'
): TranslationKey {
  if (target === 'scene') {
    switch (reason) {
      case 'not-empty':
        return 'phSceneReasonNotEmpty';
      case 'name-exists':
        return 'phSceneReasonNameExists';
      case 'missing':
        return 'phSceneReasonMissing';
      case 'changed':
        return 'phSceneReasonChanged';
      default:
        break;
    }
  }

  switch (reason) {
    case 'not-empty':
      return 'phReasonNotEmpty';
    case 'name-exists':
      return 'phReasonNameExists';
    case 'missing':
      return 'phReasonMissing';
    case 'changed':
      return 'phReasonChanged';
    case 'unavailable':
      return 'phReasonUnavailable';
    default:
      return 'phReasonError';
  }
}

/** Message d'échec (l'historique a été vidé). */
export function failureMessage(
  direction: ProjectHistoryDirection,
  reason: ProjectHistoryReason | null,
  target: ProjectHistoryInfo['target'] = 'chapter'
): ProjectToastSpec {
  let key: TranslationKey = direction === 'undo' ? 'phUndoFailed' : 'phRedoFailed';
  if (target === 'scene') {
    key = direction === 'undo' ? 'phSceneUndoFailed' : 'phSceneRedoFailed';
  }
  return toastSpec(key, {}, null, failureReasonKey(reason, target));
}

/** Message après Annuler / Rétablir ; null : rien à afficher. */
export function resultMessage(result: ProjectHistoryResult): ProjectToastSpec | null {
  switch (result.status) {
    case 'ok':
      if (!result.entry) return null;
      return result.direction === 'undo' ? undoneMessage(result.entry) : doneMessage(result.entry);
    case 'empty':
      return toastSpec(result.direction === 'undo' ? 'wbHistNothingUndo' : 'wbHistNothingRedo', {}, null);
    case 'failed':
      return failureMessage(
        result.direction,
        result.reason,
        result.entry ? describeEntry(result.entry).target : 'chapter'
      );
    default:
      return null;
  }
}

/** Question posée quand un chapitre rempli serait supprimé. */
export function confirmMessageKey(
  direction: ProjectHistoryDirection,
  entry: ProjectHistoryEntry | null = null
): TranslationKey {
  if (entry && describeEntry(entry).target === 'scene') {
    return direction === 'undo' ? 'phSceneConfirmUndoCreate' : 'phSceneConfirmRedo';
  }
  return direction === 'undo' ? 'phConfirmUndoCreate' : 'phConfirmRedo';
}

/** Ctrl+Z : annuler ; Ctrl+Y ou Ctrl+Maj+Z : rétablir ; sinon null. */
export function shortcutDirection(event: ShortcutKeyInfo): ProjectHistoryDirection | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/**
 * Le raccourci agit-il sur les chapitres ? Non dans un champ de saisie, une
 * fenêtre ou la zone des fiches ; oui dans la liste des chapitres (zone) ou
 * quand rien n’a le focus (free).
 */
export function projectShortcutTarget(
  target: unknown,
  editable: boolean,
  wbScope: boolean
): ProjectShortcutPlace | null {
  if (editable || wbScope) return null;
  if (!target || typeof target !== 'object') return null;

  const element = target as { closest?: (selector: string) => unknown; tagName?: unknown };

  if (typeof element.closest === 'function') {
    if (element.closest(MODAL_ZONE)) return null;
    if (element.closest(PROJECT_SHORTCUT_ZONE)) return 'zone';
  }

  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'BODY' || tag === 'HTML' ? 'free' : null;
}
