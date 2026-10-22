// src/renderer/components/editor/WbWorkspace.tsx
// Atelier World Building : un seul espace, au-dessus de la zone d'écriture,
// qui regroupe les vues en onglets (Cartes, Relations, Frise).
//
// L'atelier ne connaît pas les vues : EditorPage les lui fournit via la prop
// `views`. Il gère l'ouverture / fermeture (événements de lib/wb-workspace),
// l'onglet mémorisé, la touche Échap, et se ferme tout seul quand un document
// devient actif dans les onglets de l'éditeur (prop `activeDocKey`).
//
// Il gère aussi l'historique commun (lib/wb-history) : Ctrl+Z annule,
// Ctrl+Y ou Ctrl+Maj+Z rétablit, avec bascule sur l'onglet concerné et un
// court message en bas. Tant que l'atelier est ouvert, ces raccourcis ne
// touchent jamais au chapitre ; ils sont laissés au navigateur dans les
// champs de saisie et quand une fenêtre (modal) est ouverte.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useI18n } from '../../i18n';
import type { TranslationKey } from '../../i18n/dict';
import {
  WB_WORKSPACE_TABS,
  closeAllDropdowns,
  loadLastWbWorkspaceTab,
  reportWbWorkspaceState,
  saveLastWbWorkspaceTab,
  useWbWorkspaceRequests
} from '../../lib/wb-workspace';
import type { WbWorkspaceTab } from '../../lib/wb-workspace';
import { clearWbHistory, redoWbHistory, undoWbHistory } from '../../lib/wb-history';
import './wb-workspace.css';

const TAB_LABELS: Record<WbWorkspaceTab, TranslationKey> = {
  cards: 'wbWsTabCards',
  relations: 'wbWsTabRelations',
  timeline: 'wbWsTabTimeline'
};

/** Fenêtres ouvertes : les raccourcis de l'atelier sont alors désactivés. */
const MODAL_SELECTOR = '.modal, .modal-overlay, .modal-backdrop';

/** Durée d'affichage du message « Annulé : … » (ms). */
const TOAST_DURATION = 2500;

/** Types de champs où Ctrl+Z ne concerne pas du texte. */
const NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'];

/** Vrai si la touche est destinée à un champ de saisie (annulation du navigateur). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUTS.includes((target as HTMLInputElement).type);
  }
  return false;
}

interface WbToast {
  id: number;
  text: string;
}

export interface WbWorkspaceProps {
  /** Contenu de chaque onglet. Un onglet sans contenu n'est pas affiché. */
  views: Partial<Record<WbWorkspaceTab, ReactNode>>;
  /**
   * Valeur qui change dès qu'un autre document devient actif dans les
   * onglets de l'éditeur. L'atelier se ferme alors, pour ne pas cacher
   * le document qu'on vient d'ouvrir.
   */
  activeDocKey?: string | null;
}

export function WbWorkspace({ views, activeDocKey }: WbWorkspaceProps) {
  const { t } = useI18n();

  const availableTabs = WB_WORKSPACE_TABS.filter(
    (key) => views[key] !== undefined && views[key] !== null
  );

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WbWorkspaceTab>(() => loadLastWbWorkspaceTab());
  const [visited, setVisited] = useState<WbWorkspaceTab[]>([]);
  const [toast, setToast] = useState<WbToast | null>(null);

  const currentTab: WbWorkspaceTab = availableTabs.includes(tab)
    ? tab
    : availableTabs[0] ?? 'cards';

  const openRef = useRef(open);
  openRef.current = open;
  const tabRef = useRef(currentTab);
  tabRef.current = currentTab;
  const availableRef = useRef(availableTabs);
  availableRef.current = availableTabs;

  const tabRefs = useRef<Partial<Record<WbWorkspaceTab, HTMLButtonElement | null>>>({});
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // ONGLETS
  // -------------------------------------------------------------------------

  const selectTab = useCallback((next: WbWorkspaceTab) => {
    closeAllDropdowns();
    setTab(next);
    saveLastWbWorkspaceTab(next);
  }, []);

  const focusTab = useCallback((key: WbWorkspaceTab) => {
    const button = tabRefs.current[key];
    if (button) button.focus();
  }, []);

  const onTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = availableRef.current;
    if (list.length === 0) return;
    const index = Math.max(0, list.indexOf(tabRef.current));
    let next: WbWorkspaceTab | null = null;
    if (event.key === 'ArrowRight') next = list[(index + 1) % list.length];
    else if (event.key === 'ArrowLeft') next = list[(index - 1 + list.length) % list.length];
    else if (event.key === 'Home') next = list[0];
    else if (event.key === 'End') next = list[list.length - 1];
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    focusTab(next);
  };

  // -------------------------------------------------------------------------
  // OUVERTURE / FERMETURE
  // -------------------------------------------------------------------------

  const close = useCallback(() => {
    closeAllDropdowns();
    setOpen(false);
  }, []);

  useWbWorkspaceRequests((detail) => {
    const requested =
      detail.tab && availableRef.current.includes(detail.tab) ? detail.tab : undefined;

    if (detail.action === 'close') {
      close();
      return;
    }

    if (detail.action === 'open') {
      if (requested) selectTab(requested);
      setOpen(true);
      return;
    }

    // Bascule.
    if (!openRef.current) {
      if (requested) selectTab(requested);
      setOpen(true);
      return;
    }
    if (requested && requested !== tabRef.current) {
      selectTab(requested);
      return;
    }
    close();
  });

  // Publie l'état (bouton actif dans la barre latérale, autres fichiers).
  useEffect(() => {
    reportWbWorkspaceState({ open, tab: currentTab });
  }, [open, currentTab]);

  useEffect(() => {
    return () => {
      reportWbWorkspaceState({ open: false, tab: tabRef.current });
    };
  }, []);

  // Garde montées les vues déjà visitées tant que l'atelier est ouvert
  // (le graphe garde son zoom quand on revient dessus) ; tout est libéré
  // à la fermeture.
  useEffect(() => {
    if (!open) {
      setVisited((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setVisited((prev) => (prev.includes(currentTab) ? prev : prev.concat(currentTab)));
  }, [open, currentTab]);

  // Fermeture automatique quand un document devient actif dans l'éditeur.
  const docKeyAtOpenRef = useRef(activeDocKey);
  useEffect(() => {
    if (!open) {
      docKeyAtOpenRef.current = activeDocKey;
      return;
    }
    if (activeDocKey !== docKeyAtOpenRef.current) {
      docKeyAtOpenRef.current = activeDocKey;
      close();
    }
  }, [activeDocKey, open, close]);

  // Focus : sur l'onglet actif à l'ouverture, retour à l'élément d'origine
  // à la fermeture.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    restoreFocusRef.current = previous instanceof HTMLElement ? previous : null;
    const frame = window.requestAnimationFrame(() => focusTab(tabRef.current));
    return () => {
      window.cancelAnimationFrame(frame);
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (target && target.isConnected) {
        try {
          target.focus();
        } catch {
          // Sans gravité.
        }
      }
    };
  }, [open, focusTab]);

  // Échap : ferme l'atelier, sauf si une fenêtre est ouverte ou si une vue
  // a déjà utilisé la touche (fermeture d'un menu, par exemple).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector(MODAL_SELECTOR)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // -------------------------------------------------------------------------
  // ANNULER / RÉTABLIR
  // -------------------------------------------------------------------------

  const showToast = useCallback((text: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, TOAST_DURATION);
  }, []);

  // Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z, écoutés en capture sur window : l'atelier
  // passe avant l'éditeur et la règle, qui ne reçoivent pas la touche.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
      if (!isUndo && !isRedo) return;

      // Champ de saisie ou fenêtre ouverte : annulation habituelle du navigateur.
      if (isEditableTarget(event.target)) return;
      if (document.querySelector(MODAL_SELECTOR)) return;

      // Atelier ouvert : le chapitre n'est jamais touché, même sans historique.
      event.preventDefault();
      event.stopImmediatePropagation();

      const entry = isUndo ? undoWbHistory() : redoWbHistory();
      if (!entry) {
        showToast(t(isUndo ? 'wbHistNothingUndo' : 'wbHistNothingRedo'));
        return;
      }
      if (entry.tab !== tabRef.current && availableRef.current.includes(entry.tab)) {
        selectTab(entry.tab);
      }
      showToast(t(isUndo ? 'wbHistUndone' : 'wbHistRedone', { action: t(entry.labelKey) }));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, selectTab, showToast, t]);

  // Fermeture de l'atelier : le message disparaît.
  useEffect(() => {
    if (open) return;
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, [open]);

  // Démontage (fermeture du projet) : historique vidé.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      clearWbHistory();
    };
  }, []);

  // -------------------------------------------------------------------------
  // AFFICHAGE
  // -------------------------------------------------------------------------

  if (!open || availableTabs.length === 0) return null;

  const mountedTabs = availableTabs.filter(
    (key) => key === currentTab || visited.includes(key)
  );

  return (
    <div className="wb-ws" role="region" aria-label={t('wbWsTitle')}>
      <div className="wb-ws-header">
        <span className="wb-ws-title">
          <span className="wb-ws-title-icon" aria-hidden="true">🧭</span>
          {t('wbWsTitle')}
        </span>

        <div
          className="wb-ws-tabs"
          role="tablist"
          aria-label={t('wbWsTabsLabel')}
          onKeyDown={onTabsKeyDown}
        >
          {availableTabs.map((key) => {
            const active = key === currentTab;
            return (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                type="button"
                role="tab"
                id={`wb-ws-tab-${key}`}
                aria-selected={active}
                aria-controls={`wb-ws-pane-${key}`}
                tabIndex={active ? 0 : -1}
                className={'wb-ws-tab' + (active ? ' is-active' : '')}
                onClick={() => selectTab(key)}
              >
                {t(TAB_LABELS[key])}
              </button>
            );
          })}
        </div>

        <div className="wb-ws-spacer" />

        <button
          type="button"
          className="wb-ws-close"
          onClick={close}
          title={t('wbWsClose')}
          aria-label={t('wbWsClose')}
        >
          ✕
        </button>
      </div>

      <div className="wb-ws-body">
        {mountedTabs.map((key) => {
          const active = key === currentTab;
          return (
            <div
              key={key}
              id={`wb-ws-pane-${key}`}
              role="tabpanel"
              aria-labelledby={`wb-ws-tab-${key}`}
              className={'wb-ws-pane' + (active ? ' is-active' : '')}
              hidden={!active}
            >
              {views[key]}
            </div>
          );
        })}
      </div>

      {toast && (
        <div key={toast.id} className="wb-ws-toast" role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default WbWorkspace;
