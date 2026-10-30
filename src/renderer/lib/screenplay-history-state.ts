// src/renderer/lib/screenplay-history-state.ts
// État des boutons Annuler / Rétablir de la barre d'outils en mode scène.
//
// L'historique du scénario vit dans ScreenplayEditor (piles internes). Ce petit
// store observable publie seulement deux booléens : la barre d'outils se
// redessine quand ils changent, sans que l'éditeur ait à la connaître.

import { useSyncExternalStore } from 'react';

export interface ScreenplayHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY_STATE: ScreenplayHistoryState = { canUndo: false, canRedo: false };

let currentState: ScreenplayHistoryState = EMPTY_STATE;
const listeners = new Set<() => void>();

/**
 * Règle des boutons, identique à performHistory :
 * - Annuler : une étape existe, ou le curseur est dans un en-tête de scène
 *   (sa modification en cours devient une étape quand on le quitte) ;
 * - Rétablir : une étape annulée existe.
 */
export function computeScreenplayHistoryState(
  undoCount: number,
  redoCount: number,
  headingFocused: boolean
): ScreenplayHistoryState {
  return {
    canUndo: undoCount > 0 || headingFocused,
    canRedo: redoCount > 0
  };
}

export function getScreenplayHistoryState(): ScreenplayHistoryState {
  return currentState;
}

/** Publie un nouvel état ; ne prévient les abonnés que s'il a changé. */
export function publishScreenplayHistoryState(next: ScreenplayHistoryState): void {
  if (next.canUndo === currentState.canUndo && next.canRedo === currentState.canRedo) {
    return;
  }

  currentState = { canUndo: next.canUndo, canRedo: next.canRedo };
  listeners.forEach((listener) => listener());
}

/** Éditeur de scénario fermé : rien à annuler ni à rétablir. */
export function resetScreenplayHistoryState(): void {
  publishScreenplayHistoryState(EMPTY_STATE);
}

export function subscribeScreenplayHistoryState(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Pour la barre d'outils : se redessine quand l'état change. */
export function useScreenplayHistoryState(): ScreenplayHistoryState {
  return useSyncExternalStore(
    subscribeScreenplayHistoryState,
    getScreenplayHistoryState,
    getScreenplayHistoryState
  );
}
