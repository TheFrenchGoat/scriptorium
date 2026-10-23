// src/renderer/components/settings/SettingsTabs.tsx
// Onglets verticaux des deux fenêtres « Paramètres » (accueil et éditeur) :
// la liste des onglets à gauche, le contenu de l'onglet choisi à droite.
// Le dernier onglet consulté est mémorisé (localStorage) : la fenêtre se
// rouvre au même endroit. Chaque fenêtre a sa propre clé.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import { useI18n, type TranslationKey } from '../../i18n';

export interface SettingsTabDef<T extends string> {
  id: T;
  labelKey: TranslationKey;
}

function readStoredTab<T extends string>(
  storageKey: string,
  tabs: readonly SettingsTabDef<T>[]
): T {
  const first = tabs[0];
  if (!first) throw new Error('Aucun onglet de paramètres défini.');
  try {
    const saved = window.localStorage.getItem(storageKey);
    const found = tabs.find((tab) => tab.id === saved);
    if (found) return found.id;
  } catch {
    // localStorage indisponible : premier onglet.
  }
  return first.id;
}

/** Onglet affiché, relu puis mémorisé dans localStorage. */
export function useSettingsTab<T extends string>(
  storageKey: string,
  tabs: readonly SettingsTabDef<T>[]
): [T, (tab: T) => void] {
  const [tab, setTabState] = useState<T>(() => readStoredTab(storageKey, tabs));

  const setTab = useCallback(
    (next: T): void => {
      setTabState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // localStorage indisponible : le choix n'est pas mémorisé.
      }
    },
    [storageKey]
  );

  return [tab, setTab];
}

export interface SettingsTabsLayoutProps<T extends string> {
  tabs: readonly SettingsTabDef<T>[];
  active: T;
  onSelect: (tab: T) => void;
  children?: ReactNode;
}

/** Onglets à gauche (flèches haut/bas au clavier), contenu à droite. */
export function SettingsTabsLayout<T extends string>({
  tabs,
  active,
  onSelect,
  children
}: SettingsTabsLayoutProps<T>): ReactElement {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Chaque onglet s'affiche depuis le haut.
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [active]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    onSelect(next.id);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)
      ?.focus();
  };

  return (
    <div className="settings-layout">
      <div
        className="settings-tabs"
        role="tablist"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={tab.id === active}
            tabIndex={tab.id === active ? 0 : -1}
            className={`settings-tab${tab.id === active ? ' active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div ref={panelRef} className="settings-panel" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
