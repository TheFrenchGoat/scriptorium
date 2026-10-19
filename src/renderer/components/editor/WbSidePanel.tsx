import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n';
import type { BuiltinWbType, WbCategoryDef, WbItem } from '../../../shared/types';
import type { EditorController } from './useEditorController';
import { WbSheet } from './WbSheet';
import '../../styles/wb-compact.css';

/**
 * Événement window qui pilote le panneau latéral des fiches.
 * N'importe quel composant (barre d'outils, chapitres, scénario)
 * peut l'envoyer sans dépendre de EditorPage.
 */
export const WB_PANEL_EVENT = 'scriptorium:wb-panel';

export type WbPanelAction = 'open' | 'close' | 'toggle';

export interface WbPanelEventDetail {
  action: WbPanelAction;
  itemId?: string | null;
}

export function dispatchWbPanelEvent(detail: WbPanelEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<WbPanelEventDetail>(WB_PANEL_EVENT, {
      detail,
    }),
  );
}

export function openWbPanel(itemId?: string | null): void {
  dispatchWbPanelEvent({
    action: 'open',
    itemId,
  });
}

export function closeWbPanel(): void {
  dispatchWbPanelEvent({
    action: 'close',
  });
}

export function toggleWbPanel(): void {
  dispatchWbPanelEvent({
    action: 'toggle',
  });
}

/**
 * Valeur du filtre qui affiche tous les types.
 */
const FILTER_ALL = '__all__';

/**
 * Largeur du panneau : valeur par défaut, limites, et clé d'enregistrement.
 */
const PANEL_WIDTH_STORAGE_KEY = 'scriptorium.wbPanelWidth';
const PANEL_WIDTH_DEFAULT = 340;
const PANEL_WIDTH_MIN = 240;
const PANEL_WIDTH_MAX_RATIO = 0.6;

/**
 * Garde la largeur entre 240 px et 60 % de la fenêtre.
 */
function clampPanelWidth(width: number): number {
  const max = Math.max(
    PANEL_WIDTH_MIN,
    Math.floor(window.innerWidth * PANEL_WIDTH_MAX_RATIO),
  );
  return Math.min(max, Math.max(PANEL_WIDTH_MIN, Math.round(width)));
}

/**
 * Lit la largeur enregistrée, ou la largeur par défaut.
 */
function readStoredPanelWidth(): number {
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value)) {
      return clampPanelWidth(value);
    }
  } catch {
    // Stockage indisponible : largeur par défaut.
  }
  return clampPanelWidth(PANEL_WIDTH_DEFAULT);
}

/**
 * Enregistre la largeur pour les prochaines ouvertures.
 */
function storePanelWidth(width: number): void {
  try {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Stockage indisponible : la largeur ne sera simplement pas retenue.
  }
}

/**
 * Prépare un texte pour la recherche : sans accents et en minuscules.
 * « Éléa » et « elea » deviennent identiques.
 */
function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

interface WbSidePanelProps {
  controller: EditorController;
  itemId: string | null;
  onClose: () => void;
  onSelectItem: (itemId: string | null) => void;
}

export function WbSidePanel({
  controller,
  itemId,
  onClose,
  onSelectItem,
}: WbSidePanelProps) {
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(FILTER_ALL);

  // -------------------------------------------------------------------------
  // Largeur réglable du panneau
  // -------------------------------------------------------------------------

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(readStoredPanelWidth);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(panelWidth);

  useEffect(() => {
    widthRef.current = panelWidth;
  }, [panelWidth]);

  // Pendant le glissement : suivre la souris, puis enregistrer au relâchement.
  useEffect(() => {
    if (!resizing) return;

    const finish = (): void => {
      setResizing(false);
    };

    const onMove = (event: globalThis.MouseEvent): void => {
      if ((event.buttons & 1) === 0) {
        finish();
        return;
      }
      const panel = panelRef.current;
      if (!panel) return;
      const right = panel.getBoundingClientRect().right;
      const next = clampPanelWidth(right - event.clientX);
      widthRef.current = next;
      setPanelWidth(next);
    };

    document.body.classList.add('resizing-panel');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', finish);
    window.addEventListener('blur', finish);

    return () => {
      document.body.classList.remove('resizing-panel');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', finish);
      storePanelWidth(widthRef.current);
    };
  }, [resizing]);

  // Fenêtre redimensionnée : le panneau ne dépasse jamais 60 %.
  useEffect(() => {
    const onWindowResize = (): void => {
      setPanelWidth((width) => clampPanelWidth(width));
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  function handleResizeMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    setResizing(true);
  }

  function handleResizeDoubleClick(): void {
    const next = clampPanelWidth(PANEL_WIDTH_DEFAULT);
    widthRef.current = next;
    setPanelWidth(next);
    storePanelWidth(next);
  }

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  const data = controller.data();
  const world = data.world;
  const currentId = itemId && world?.[itemId] ? itemId : null;

  const categories: Record<string, WbCategoryDef> = data.wbCategories ?? {};

  const builtinLabels: Record<BuiltinWbType, string> = {
    character: t('wbLabel_character'),
    place: t('wbLabel_place'),
    object: t('wbLabel_object'),
    other: t('wbLabel_other'),
  };

  function isBuiltinSlug(slug: string): slug is BuiltinWbType {
    return Object.prototype.hasOwnProperty.call(builtinLabels, slug);
  }

  function categoryLabel(slug: string): string {
    const def = categories[slug];
    if (def && def.label && def.label.trim()) {
      return def.label;
    }
    const builtin = def?.builtin ?? (isBuiltinSlug(slug) ? slug : undefined);
    if (builtin) {
      return builtinLabels[builtin];
    }
    return slug;
  }

  function itemIcon(item: WbItem): string {
    return item.icon || categories[item.wbType]?.icon || '📄';
  }

  function itemColor(item: WbItem): string {
    return item.color || categories[item.wbType]?.color || 'transparent';
  }

  function handleOpenInTab(): void {
    if (!currentId) return;
    controller.openItem(
      currentId,
      'world',
    );
  }

  // -------------------------------------------------------------------------
  // Liste des fiches (aucune fiche sélectionnée)
  // -------------------------------------------------------------------------

  const allItems: WbItem[] = Object.values(world ?? {});

  const typeSlugs: string[] = Object.keys(categories);
  for (const item of allItems) {
    if (item.wbType && !typeSlugs.includes(item.wbType)) {
      typeSlugs.push(item.wbType);
    }
  }

  const activeFilter =
    filterType === FILTER_ALL || typeSlugs.includes(filterType)
      ? filterType
      : FILTER_ALL;

  const needle = normalizeForSearch(query.trim());

  /**
   * Alias qui correspond à la recherche, si le nom lui-même ne correspond pas.
   * Retourne null si le nom correspond ou si rien ne correspond.
   */
  function matchedAlias(item: WbItem): string | null {
    if (!needle) return null;
    if (normalizeForSearch(item.name).includes(needle)) return null;
    const aliases = item.aliases ?? [];
    for (const alias of aliases) {
      if (normalizeForSearch(alias).includes(needle)) {
        return alias;
      }
    }
    return null;
  }

  function matchesSearch(item: WbItem): boolean {
    if (!needle) return true;
    if (normalizeForSearch(item.name).includes(needle)) return true;
    const aliases = item.aliases ?? [];
    return aliases.some((alias) => normalizeForSearch(alias).includes(needle));
  }

  const visibleItems = allItems
    .filter(
      (item) =>
        (activeFilter === FILTER_ALL || item.wbType === activeFilter) &&
        matchesSearch(item),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
      }),
    );

  function handleItemClick(
    event: MouseEvent<HTMLButtonElement>,
    id: string,
  ): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      controller.openItem(
        id,
        'world',
      );
      return;
    }
    onSelectItem(id);
  }

  function handleItemAuxClick(
    event: MouseEvent<HTMLButtonElement>,
    id: string,
  ): void {
    if (event.button !== 1) return;
    event.preventDefault();
    controller.openItem(
      id,
      'world',
    );
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  }

  function renderList() {
    if (allItems.length === 0) {
      return (
        <div className="wb-side-panel-empty">
          {t('wbPanelNoSheets')}
        </div>
      );
    }

    return (
      <>
        <div className="wb-side-panel-list-tools">
          <input
            type="search"
            className="wb-side-panel-search"
            placeholder={t('wbPanelSearchPlaceholder')}
            aria-label={t('wbPanelSearchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <div className="wb-side-panel-filter-row">
            <select
              className="wb-side-panel-filter"
              aria-label={t('wbPanelFilterAll')}
              value={activeFilter}
              onChange={(event) => setFilterType(event.target.value)}
            >
              <option value={FILTER_ALL}>
                {t('wbPanelFilterAll')}
              </option>
              {typeSlugs.map((slug) => (
                <option
                  key={slug}
                  value={slug}
                >
                  {(categories[slug]?.icon ?? '') + ' ' + categoryLabel(slug)}
                </option>
              ))}
            </select>
            <span className="wb-side-panel-count">
              {visibleItems.length} / {allItems.length}
            </span>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="wb-side-panel-empty">
            {t('wbPanelNoResults')}
          </div>
        ) : (
          <ul className="wb-side-panel-list">
            {visibleItems.map((item) => {
              const alias = matchedAlias(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="wb-side-panel-item"
                    style={{ borderLeftColor: itemColor(item) }}
                    title={item.name}
                    onClick={(event) => handleItemClick(event, item.id)}
                    onAuxClick={(event) => handleItemAuxClick(event, item.id)}
                    onMouseDown={(event) => {
                      if (event.button === 1) event.preventDefault();
                    }}
                  >
                    <span className="wb-side-panel-item-icon">
                      {itemIcon(item)}
                    </span>
                    <span className="wb-side-panel-item-text">
                      <span className="wb-side-panel-item-name">
                        {item.name}
                      </span>
                      <span className="wb-side-panel-item-type">
                        {alias ? '« ' + alias + ' »' : categoryLabel(item.wbType)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="wb-side-panel-hint">
          {t('wbPanelEmpty')}
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      className="wb-side-panel"
      role="complementary"
      aria-label={t('wbPanelTitle')}
      style={{
        width: panelWidth,
        flex: `0 0 ${panelWidth}px`,
      }}
    >
      <div
        className={`wb-side-panel-resize-handle${resizing ? ' dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        title={t('wbPanelResizeTitle')}
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleResizeDoubleClick}
      />

      <div className="wb-side-panel-header">
        <span className="wb-side-panel-title">
          {t('wbPanelTitle')}
        </span>
        <button
          type="button"
          className="wb-side-panel-close"
          title={t('wbPanelClose')}
          aria-label={t('wbPanelClose')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {currentId ? (
        <>
          <div className="wb-side-panel-actions">
            <button
              type="button"
              className="wb-side-panel-action-btn"
              onClick={() => onSelectItem(null)}
            >
              {t('wbPanelBackToList')}
            </button>
            <button
              type="button"
              className="wb-side-panel-action-btn"
              onClick={handleOpenInTab}
            >
              {t('wbPanelOpenInTab')}
            </button>
          </div>
          <div className="wb-side-panel-body">
            <WbSheet
              key={currentId}
              controller={controller}
              name={currentId}
              compact
            />
          </div>
        </>
      ) : (
        <div className="wb-side-panel-body">
          {renderList()}
        </div>
      )}
    </div>
  );
}
