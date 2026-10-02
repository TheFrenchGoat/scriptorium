// src/renderer/components/editor/editor-status.ts
// État "transient" de l'éditeur : statut de sauvegarde, compteur de mots,
// disponibilité de l'annulation, état du correcteur de grammaire.
//
// Pourquoi un petit store observable plutôt qu'un simple useState dans le
// contexte ? Parce que ces valeurs changent à CHAQUE frappe. Les mettre dans
// la valeur du contexte re-rendrait toute l'arborescence de l'éditeur (barre
// latérale comprise) plusieurs fois par seconde. Avec useSyncExternalStore,
// seuls la barre de statut et la barre d'outils se re-rendent.

import { useSyncExternalStore } from 'react';
import type { JavaInfo } from '../../../shared/types';

export type SaveState = 'saved' | 'pending' | 'error';

export interface EditorStatus {
  saveState: SaveState;
  /** Heure du dernier enregistrement réussi, "HH:MM" (vide au démarrage). */
  savedAt: string;
  /** Mode fiche : le compteur de mots n'a pas de sens. */
  sheetMode: boolean;
  words: number;
  chars: number;
  totalWords: number;
  selectionActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  grammarEnabled: boolean;
  grammarReady: boolean;
  grammarStarting: boolean;
  /** Message détaillé affiché dans la modale de configuration LanguageTool. */
  grammarMessage: string;
  javaInfo: JavaInfo | null;
}

const initialStatus: EditorStatus = {
  saveState: 'saved',
  savedAt: '',
  sheetMode: false,
  words: 0,
  chars: 0,
  totalWords: 0,
  selectionActive: false,
  canUndo: false,
  canRedo: false,
  grammarEnabled: false,
  grammarReady: false,
  grammarStarting: false,
  grammarMessage: '',
  javaInfo: null
};

export interface StatusStore {
  get(): EditorStatus;
  set(patch: Partial<EditorStatus>): void;
  subscribe(listener: () => void): () => void;
}

export function createStatusStore(): StatusStore {
  let value = initialStatus;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(patch) {
      const next = { ...value, ...patch };
      // Évite de notifier pour rien (ex: setSaveStatus('pending') à chaque
      // frappe alors que l'état est déjà 'pending').
      const changed = (Object.keys(patch) as (keyof EditorStatus)[]).some((k) => value[k] !== next[k]);
      if (!changed) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function useEditorStatus(store: StatusStore): EditorStatus {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
