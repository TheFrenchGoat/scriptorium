// src/renderer/lib/wb-workspace.ts
// Outils partagés de l'atelier World Building (cartes, relations, frise).
//
// - Ouverture / fermeture de l'atelier par événement global : n'importe quel
//   fichier peut l'ouvrir sans connaître le composant.
// - Mémorisation du dernier onglet utilisé (localStorage).
// - Menus déroulants exclusifs : quand un menu s'ouvre, il prévient les
//   autres, qui se ferment.
//
// Ce fichier n'importe aucun composant : il évite les imports circulaires
// entre WbWorkspace, WbCardsView, WbRelationsView et Sidebar.

import { useEffect, useId, useRef } from 'react';

// ---------------------------------------------------------------------------
// ONGLETS
// ---------------------------------------------------------------------------

export type WbWorkspaceTab = 'cards' | 'relations' | 'timeline';

/** Onglets réellement disponibles (la frise arrivera au lot 8). */
export const WB_WORKSPACE_TABS: WbWorkspaceTab[] = ['cards', 'relations'];

const TAB_STORAGE_KEY = 'scriptorium.wbWorkspace.tab';

function isAvailableTab(value: unknown): value is WbWorkspaceTab {
  return typeof value === 'string' && (WB_WORKSPACE_TABS as string[]).includes(value);
}

/** Dernier onglet utilisé, ou le premier disponible. */
export function loadLastWbWorkspaceTab(): WbWorkspaceTab {
  try {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (isAvailableTab(saved)) return saved;
  } catch {
    // localStorage indisponible : on garde la valeur par défaut.
  }
  return WB_WORKSPACE_TABS[0];
}

export function saveLastWbWorkspaceTab(tab: WbWorkspaceTab): void {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Sans gravité : l'onglet ne sera simplement pas mémorisé.
  }
}

// ---------------------------------------------------------------------------
// OUVERTURE / FERMETURE
// ---------------------------------------------------------------------------

/** Demande envoyée à l'atelier (ouvrir, fermer, basculer). */
export const WB_WORKSPACE_EVENT = 'scriptorium:wb-workspace';

/** Annonce émise par l'atelier quand son état change (bouton actif, etc.). */
export const WB_WORKSPACE_STATE_EVENT = 'scriptorium:wb-workspace-state';

export type WbWorkspaceAction = 'open' | 'close' | 'toggle';

export interface WbWorkspaceEventDetail {
  action: WbWorkspaceAction;
  tab?: WbWorkspaceTab;
}

export interface WbWorkspaceState {
  open: boolean;
  tab: WbWorkspaceTab;
}

let currentState: WbWorkspaceState = { open: false, tab: 'cards' };

function dispatchRequest(detail: WbWorkspaceEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<WbWorkspaceEventDetail>(WB_WORKSPACE_EVENT, { detail })
  );
}

/** Ouvre l'atelier (sur l'onglet demandé, sinon le dernier utilisé). */
export function openWbWorkspace(tab?: WbWorkspaceTab): void {
  dispatchRequest({ action: 'open', tab });
}

export function closeWbWorkspace(): void {
  dispatchRequest({ action: 'close' });
}

/**
 * Bascule l'atelier :
 * - fermé : il s'ouvre (sur `tab` si fourni) ;
 * - ouvert sur un autre onglet que `tab` : il change d'onglet ;
 * - ouvert sur le même onglet (ou sans `tab`) : il se ferme.
 */
export function toggleWbWorkspace(tab?: WbWorkspaceTab): void {
  dispatchRequest({ action: 'toggle', tab });
}

export function isWbWorkspaceOpen(): boolean {
  return currentState.open;
}

export function getWbWorkspaceTab(): WbWorkspaceTab {
  return currentState.tab;
}

/** Appelé uniquement par WbWorkspace pour publier son état. */
export function reportWbWorkspaceState(state: WbWorkspaceState): void {
  if (state.open === currentState.open && state.tab === currentState.tab) return;
  currentState = { open: state.open, tab: state.tab };
  window.dispatchEvent(
    new CustomEvent<WbWorkspaceState>(WB_WORKSPACE_STATE_EVENT, { detail: currentState })
  );
}

/** Écoute les demandes d'ouverture / fermeture (utilisé par WbWorkspace). */
export function useWbWorkspaceRequests(
  handler: (detail: WbWorkspaceEventDetail) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<WbWorkspaceEventDetail>).detail;
      if (!detail || typeof detail.action !== 'string') return;
      handlerRef.current(detail);
    };
    window.addEventListener(WB_WORKSPACE_EVENT, onRequest);
    return () => window.removeEventListener(WB_WORKSPACE_EVENT, onRequest);
  }, []);
}

/** Suit l'état de l'atelier (utilisé par la barre latérale pour le bouton actif). */
export function useWbWorkspaceState(onChange: (state: WbWorkspaceState) => void): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<WbWorkspaceState>).detail;
      if (detail) onChangeRef.current(detail);
    };
    window.addEventListener(WB_WORKSPACE_STATE_EVENT, onState);
    onChangeRef.current(currentState);
    return () => window.removeEventListener(WB_WORKSPACE_STATE_EVENT, onState);
  }, []);
}

// ---------------------------------------------------------------------------
// MENUS DÉROULANTS EXCLUSIFS
// ---------------------------------------------------------------------------

/** Émis quand un menu déroulant s'ouvre ; le détail est son identifiant. */
export const DROPDOWN_OPEN_EVENT = 'scriptorium:dd-open';

export function announceDropdownOpen(id: string): void {
  window.dispatchEvent(new CustomEvent<string>(DROPDOWN_OPEN_EVENT, { detail: id }));
}

/** Ferme tous les menus déroulants (par exemple au changement d'onglet). */
export function closeAllDropdowns(): void {
  announceDropdownOpen('');
}

/**
 * Rend un menu déroulant exclusif : quand il s'ouvre, les autres se ferment,
 * et il se ferme lui-même quand un autre s'ouvre.
 *
 * Utilisation : useExclusiveDropdown(open, () => setOpen(false));
 */
export function useExclusiveDropdown(open: boolean, close: () => void): void {
  const id = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) announceDropdownOpen(id);
  }, [open, id]);

  useEffect(() => {
    const onOtherOpen = (event: Event) => {
      const otherId = (event as CustomEvent<string>).detail;
      if (otherId === id) return;
      if (openRef.current) closeRef.current();
    };
    window.addEventListener(DROPDOWN_OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(DROPDOWN_OPEN_EVENT, onOtherOpen);
  }, [id]);
}
