// src/renderer/lib/wb-history.ts
// Historique d'annulation commun à tout l'atelier World Building
// (Cartes, Relations, Frise).
//
// - chaque vue enregistre ses modifications avec `pushWbHistory`, en
//   fournissant de quoi revenir en arrière (undo) et refaire (redo) ;
// - l'atelier (WbWorkspace) gère les raccourcis Ctrl+Z, Ctrl+Y et
//   Ctrl+Maj+Z, bascule sur l'onglet concerné et affiche un message ;
// - les vues appellent `useWbHistoryVersion()` pour se redessiner après
//   une annulation ou un rétablissement ;
// - l'historique est vidé quand l'atelier est démonté (fermeture du projet).
//
// Les états « avant » et « après » doivent être des copies indépendantes :
// utilisez `cloneWbData` à l'enregistrement ET à la restauration, pour que
// l'historique ne soit jamais modifié par la suite.

import { useEffect, useState } from 'react';
import type { TranslationKey } from '../i18n/dict';
import type { WbWorkspaceTab } from './wb-workspace';

export interface WbHistoryEntry {
  /** Onglet de l'atelier où l'action a été faite. */
  tab: WbWorkspaceTab;
  /** Description de l'action, affichée après annulation ou rétablissement. */
  labelKey: TranslationKey;
  /** Remet les données dans l'état d'avant l'action. */
  undo: () => void;
  /** Remet les données dans l'état d'après l'action. */
  redo: () => void;
}

/** Événement window émis à chaque changement de l'historique. */
export const WB_HISTORY_EVENT = 'scriptorium:wb-history';

/** Nombre maximal d'étapes conservées. */
const WB_HISTORY_LIMIT = 100;

let undoStack: WbHistoryEntry[] = [];
let redoStack: WbHistoryEntry[] = [];

function notify(): void {
  window.dispatchEvent(new CustomEvent(WB_HISTORY_EVENT));
}

/** Copie profonde de données sérialisables (tableaux, objets simples). */
export function cloneWbData<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Enregistre une action ; efface ce qui pouvait être rétabli. */
export function pushWbHistory(entry: WbHistoryEntry): void {
  undoStack.push(entry);
  if (undoStack.length > WB_HISTORY_LIMIT) {
    undoStack.splice(0, undoStack.length - WB_HISTORY_LIMIT);
  }
  redoStack = [];
  notify();
}

/**
 * Annule la dernière action.
 * Retourne l'action annulée, ou null s'il n'y avait rien à annuler.
 */
export function undoWbHistory(): WbHistoryEntry | null {
  const entry = undoStack.pop();
  if (!entry) return null;
  try {
    entry.undo();
  } catch (error) {
    console.error('[wb-history] annulation impossible', error);
    // Historique incohérent : on repart de zéro plutôt que d'aggraver.
    undoStack = [];
    redoStack = [];
    notify();
    return null;
  }
  redoStack.push(entry);
  notify();
  return entry;
}

/**
 * Rétablit la dernière action annulée.
 * Retourne l'action rétablie, ou null s'il n'y avait rien à rétablir.
 */
export function redoWbHistory(): WbHistoryEntry | null {
  const entry = redoStack.pop();
  if (!entry) return null;
  try {
    entry.redo();
  } catch (error) {
    console.error('[wb-history] rétablissement impossible', error);
    undoStack = [];
    redoStack = [];
    notify();
    return null;
  }
  undoStack.push(entry);
  notify();
  return entry;
}

export function canUndoWbHistory(): boolean {
  return undoStack.length > 0;
}

export function canRedoWbHistory(): boolean {
  return redoStack.length > 0;
}

/** Vide l'historique (fermeture du projet). */
export function clearWbHistory(): void {
  if (undoStack.length === 0 && redoStack.length === 0) return;
  undoStack = [];
  redoStack = [];
  notify();
}

/**
 * Numéro qui change à chaque modification de l'historique.
 * Une vue qui l'appelle est redessinée après chaque annulation ou
 * rétablissement, et relit donc les données à jour du projet.
 */
export function useWbHistoryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setVersion((previous) => previous + 1);
    window.addEventListener(WB_HISTORY_EVENT, onChange);
    return () => window.removeEventListener(WB_HISTORY_EVENT, onChange);
  }, []);
  return version;
}
