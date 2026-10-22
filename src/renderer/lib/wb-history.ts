// src/renderer/lib/wb-history.ts
// Historique d'annulation commun à tout le World Building : atelier
// (Cartes, Relations, Frise), partie World Building de la barre latérale,
// panneau latéral et fiches ouvertes en onglet.
//
// - chaque modification est enregistrée avec `pushWbHistory`, en fournissant
//   de quoi revenir en arrière (undo) et refaire (redo) ;
// - les modifications successives de même `mergeKey` (frappe dans un champ
//   de fiche) forment une seule étape, tant que le focus ne change pas ;
// - pendant une annulation ou un rétablissement, les nouveaux
//   enregistrements sont ignorés : une action refaite par le contrôleur ne
//   crée pas d'étape en double ;
// - `useWbHistoryShortcuts()` (appelé par l'atelier, toujours monté pendant
//   l'édition d'un projet) gère Ctrl+Z, Ctrl+Y et Ctrl+Maj+Z quand l'atelier
//   est ouvert ou quand le dernier clic a eu lieu dans le World Building ;
// - `performWbHistory()` annule ou rétablit, puis émet un événement que
//   l'atelier utilise pour changer d'onglet et afficher un message ;
// - les vues appellent `useWbHistoryVersion()` pour se redessiner après une
//   annulation ou un rétablissement ; la barre d'outils appelle
//   `useWbHistoryScopeVersion()` pour suivre aussi les changements de zone.
//
// Les états « avant » et « après » doivent être des copies indépendantes :
// utilisez `cloneWbData` à l'enregistrement ET à la restauration.

import { useEffect, useState } from 'react';
import type { TranslationKey } from '../i18n/dict';
import type { WbWorkspaceTab } from './wb-workspace';

export interface WbHistoryEntry {
  /**
   * Onglet de l'atelier où l'action a été faite.
   * Absent pour les actions faites hors de l'atelier (barre latérale, fiche).
   */
  tab?: WbWorkspaceTab;
  /** Description de l'action, affichée après annulation ou rétablissement. */
  labelKey: TranslationKey;
  /** Remet les données dans l'état d'avant l'action. */
  undo: () => void;
  /** Remet les données dans l'état d'après l'action. */
  redo: () => void;
  /**
   * Deux actions successives de même clé, sans changement de focus entre
   * elles, sont fusionnées en une seule étape (ex. : `field:id:nom`).
   */
  mergeKey?: string;
}

export type WbHistoryDirection = 'undo' | 'redo';

export interface WbHistoryAppliedDetail {
  direction: WbHistoryDirection;
  /** Action annulée ou rétablie, ou null s'il n'y avait rien à faire. */
  entry: WbHistoryEntry | null;
}

/** Événement window émis à chaque changement de l'historique. */
export const WB_HISTORY_EVENT = 'scriptorium:wb-history';

/** Événement window émis après chaque Ctrl+Z / Ctrl+Y (ou bouton ↶ / ↷). */
export const WB_HISTORY_APPLIED_EVENT = 'scriptorium:wb-history-applied';

/** Événement window émis quand la zone active (World Building / texte) change. */
export const WB_HISTORY_SCOPE_EVENT = 'scriptorium:wb-history-scope';

/** Nombre maximal d'étapes conservées. */
const WB_HISTORY_LIMIT = 100;

/** Atelier ouvert. */
const WORKSPACE_SELECTOR = '.wb-ws';

/** Éléments du World Building : toute classe qui commence par « wb- ». */
const WB_ZONE_SELECTOR = '[class^="wb-"], [class*=" wb-"]';

/** Zones d'écriture : chapitres, scènes. */
const TEXT_ZONE_SELECTOR = '[contenteditable]:not([contenteditable="false"]), .screenplay-editor';

/** Fenêtres ouvertes : les raccourcis sont alors laissés au navigateur. */
const MODAL_SELECTOR = '.modal, .modal-overlay, .modal-backdrop';

/** Types de champs où Ctrl+Z ne concerne pas du texte. */
const NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'];

interface StackItem {
  entry: WbHistoryEntry;
  /** Numéro de focus au moment de l'enregistrement (fusion), -1 si figé. */
  focusToken: number;
}

let undoStack: StackItem[] = [];
let redoStack: StackItem[] = [];

/** Vrai pendant l'exécution d'un undo / redo. */
let replaying = false;

/** Zone du dernier clic ou du dernier focus. */
let zone: 'wb' | 'text' = 'text';

/** Augmente à chaque changement de focus : arrête la fusion des étapes. */
let focusToken = 0;

function notify(): void {
  window.dispatchEvent(new CustomEvent(WB_HISTORY_EVENT));
}

function notifyScope(): void {
  window.dispatchEvent(new CustomEvent(WB_HISTORY_SCOPE_EVENT));
}

/** Copie profonde de données sérialisables (tableaux, objets simples). */
export function cloneWbData<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Vrai pendant une annulation ou un rétablissement. */
export function isReplayingWbHistory(): boolean {
  return replaying;
}

/**
 * Enregistre une action ; efface ce qui pouvait être rétabli.
 * Ignoré pendant une annulation ou un rétablissement.
 */
export function pushWbHistory(entry: WbHistoryEntry): void {
  if (replaying) return;

  const top = undoStack[undoStack.length - 1];
  if (
    entry.mergeKey &&
    top &&
    redoStack.length === 0 &&
    top.entry.mergeKey === entry.mergeKey &&
    top.focusToken === focusToken
  ) {
    // Même champ, sans changement de focus : on garde l'état « avant »
    // de la première frappe et on met à jour l'état « après ».
    top.entry = { ...top.entry, labelKey: entry.labelKey, redo: entry.redo };
    notify();
    return;
  }

  undoStack.push({ entry, focusToken });
  if (undoStack.length > WB_HISTORY_LIMIT) {
    undoStack.splice(0, undoStack.length - WB_HISTORY_LIMIT);
  }
  redoStack = [];
  notify();
}

function apply(direction: WbHistoryDirection): WbHistoryEntry | null {
  const source = direction === 'undo' ? undoStack : redoStack;
  const item = source.pop();
  if (!item) return null;

  replaying = true;
  try {
    if (direction === 'undo') item.entry.undo();
    else item.entry.redo();
  } catch (error) {
    console.error('[wb-history] ' + direction + ' impossible', error);
    // Historique incohérent : on repart de zéro plutôt que d'aggraver.
    undoStack = [];
    redoStack = [];
    notify();
    return null;
  } finally {
    replaying = false;
  }

  // Une étape annulée puis rétablie n'absorbe plus de nouvelles frappes.
  item.focusToken = -1;
  if (direction === 'undo') redoStack.push(item);
  else undoStack.push(item);
  notify();
  return item.entry;
}

/** Annule la dernière action ; null s'il n'y avait rien à annuler. */
export function undoWbHistory(): WbHistoryEntry | null {
  return apply('undo');
}

/** Rétablit la dernière action annulée ; null s'il n'y avait rien à rétablir. */
export function redoWbHistory(): WbHistoryEntry | null {
  return apply('redo');
}

/**
 * Annule ou rétablit, puis prévient l'atelier (changement d'onglet, message).
 * À utiliser par les raccourcis et les boutons ↶ / ↷.
 */
export function performWbHistory(direction: WbHistoryDirection): WbHistoryEntry | null {
  const entry = apply(direction);
  const detail: WbHistoryAppliedDetail = { direction, entry };
  window.dispatchEvent(new CustomEvent<WbHistoryAppliedDetail>(WB_HISTORY_APPLIED_EVENT, { detail }));
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

// ---------------------------------------------------------------------------
// Zone active : World Building ou texte
// ---------------------------------------------------------------------------

function zoneOf(target: EventTarget | null): 'wb' | 'text' | null {
  if (!(target instanceof Element)) return null;
  // Les fenêtres (confirmation, etc.) ne changent pas la zone.
  if (target.closest(MODAL_SELECTOR)) return null;
  if (target.closest(WORKSPACE_SELECTOR)) return 'wb';
  if (target.closest(TEXT_ZONE_SELECTOR)) return 'text';
  if (target.closest(WB_ZONE_SELECTOR)) return 'wb';
  // Barre d'outils, onglets, etc. : la zone ne change pas.
  return null;
}

function trackZone(target: EventTarget | null, isFocus: boolean): void {
  if (isFocus) focusToken += 1;
  const next = zoneOf(target);
  if (next && next !== zone) {
    zone = next;
    notifyScope();
  }
}

/** Prévient la barre d'outils qu'il faut relire la zone (atelier ouvert / fermé). */
export function refreshWbHistoryScope(): void {
  notifyScope();
}

/**
 * Vrai si Ctrl+Z et les boutons ↶ / ↷ doivent agir sur l'historique World
 * Building : atelier ouvert, ou dernier clic dans le World Building alors
 * qu'aucune zone d'écriture n'a le focus.
 */
export function isWbHistoryScope(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector(WORKSPACE_SELECTOR)) return true;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) return false;
  return zone === 'wb';
}

/** Vrai si la touche est destinée à un champ de saisie (annulation du navigateur). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUTS.includes((target as HTMLInputElement).type);
  }
  return false;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
  const key = event.key.toLowerCase();
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
  if (!isUndo && !isRedo) return;

  // Champ de saisie ou fenêtre ouverte : annulation habituelle.
  if (isEditableTarget(event.target)) return;
  if (document.querySelector(MODAL_SELECTOR)) return;
  if (!isWbHistoryScope()) return;

  // L'éditeur et la règle ne reçoivent pas la touche : le chapitre n'est
  // jamais touché, même quand l'historique est vide.
  event.preventDefault();
  event.stopImmediatePropagation();
  performWbHistory(isUndo ? 'undo' : 'redo');
}

/**
 * Installe le suivi de la zone active et les raccourcis Ctrl+Z / Ctrl+Y du
 * World Building. À appeler une seule fois, dans un composant monté pendant
 * toute l'édition du projet (l'atelier).
 */
export function useWbHistoryShortcuts(): void {
  useEffect(() => {
    const onPointerDown = (event: Event) => trackZone(event.target, false);
    const onFocusIn = (event: Event) => trackZone(event.target, true);

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      zone = 'text';
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Rafraîchissement des composants
// ---------------------------------------------------------------------------

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

/**
 * Comme `useWbHistoryVersion`, mais change aussi quand la zone active
 * change (barre d'outils : boutons ↶ / ↷ grisés ou non).
 */
export function useWbHistoryScopeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setVersion((previous) => previous + 1);
    window.addEventListener(WB_HISTORY_EVENT, onChange);
    window.addEventListener(WB_HISTORY_SCOPE_EVENT, onChange);
    return () => {
      window.removeEventListener(WB_HISTORY_EVENT, onChange);
      window.removeEventListener(WB_HISTORY_SCOPE_EVENT, onChange);
    };
  }, []);
  return version;
}
