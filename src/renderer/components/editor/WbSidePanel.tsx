// src/renderer/components/editor/WbSidePanel.tsx
// Contenu de la section des fiches World Building, dans la colonne de gauche.
//
// - Accueil : liste des fiches, avec recherche (sans accents ni majuscules),
//   filtre par type, compteur, création, renommage, suppression et
//   glisser-déposer pour changer l'ordre.
// - Fiche sélectionnée : affichage compact de la fiche, avec un retour à la
//   liste et un bouton pour l'ouvrir dans un onglet.
//
// Clic sur une fiche : affichage dans la section.
// Ctrl+clic ou clic molette : ouverture dans un onglet.
//
// Ouvrir une fiche dans un onglet ferme aussi l'atelier (cartes, relations),
// même si cette fiche était déjà l'onglet actif : l'onglet doit être visible.
//
// N'importe quel composant peut demander l'affichage d'une fiche avec
// `openWbPanel(id)` (nom surligné dans le texte, champ « référence »...).
// La barre latérale écoute ces demandes avec `useWbPanelListener`.

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useI18n } from '../../i18n';
import type { BuiltinWbType, WbCategoryDef, WbItem, WbType } from '../../../shared/types';
import type { EditorController } from './useEditorController';
import { WbSheet } from './WbSheet';
import { closeWbWorkspace } from '../../lib/wb-workspace';
import '../../styles/wb-compact.css';

/**
 * Événement window qui pilote l'affichage des fiches.
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
 * Écoute les demandes d'affichage de fiche (openWbPanel, closeWbPanel,
 * toggleWbPanel). La fonction reçue peut changer à chaque affichage :
 * c'est toujours la dernière version qui est appelée.
 */
export function useWbPanelListener(handler: (detail: WbPanelEventDetail) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<WbPanelEventDetail>).detail;
      if (detail) {
        handlerRef.current(detail);
      }
    };
    window.addEventListener(WB_PANEL_EVENT, listener);
    return () => {
      window.removeEventListener(WB_PANEL_EVENT, listener);
    };
  }, []);
}

/**
 * Valeur du filtre qui affiche tous les types.
 */
const FILTER_ALL = '__all__';

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
  /** Fiche affichée, ou null pour la liste. */
  itemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  /**
   * Création d'une fiche : type choisi dans le filtre, ou null pour
   * laisser l'auteur choisir le type.
   */
  onCreateItem?: (wbType: WbType | null) => void;
  /** Renommage d'une fiche (fenêtre de renommage de la barre latérale). */
  onRenameItem?: (itemId: string) => void;
}

export function WbSidePanel({
  controller,
  itemId,
  onSelectItem,
  onCreateItem,
  onRenameItem,
}: WbSidePanelProps) {
  const { t } = useI18n();

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(FILTER_ALL);

  // Glisser-déposer : fiche déplacée et fiche survolée.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  const data = controller.data();
  const world = data.world ?? {};
  const currentId = itemId && world[itemId] ? itemId : null;

  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

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

  /**
   * Ouvre une fiche dans un onglet et ferme l'atelier. La fermeture est
   * explicite : si la fiche était déjà l'onglet actif, le document affiché
   * ne change pas et l'atelier ne se fermerait pas tout seul.
   */
  function openInTab(id: string): void {
    controller.openItem(
      id,
      'world',
    );
    closeWbWorkspace();
  }

  function handleOpenInTab(): void {
    if (!currentId) return;
    openInTab(currentId);
  }

  // -------------------------------------------------------------------------
  // Liste des fiches (aucune fiche sélectionnée)
  // -------------------------------------------------------------------------

  /** Identifiants des fiches, dans l'ordre du projet. */
  const orderedIds: string[] = Object.keys(world).filter((id) => Boolean(world[id]));
  const allCount = orderedIds.length;

  const typeSlugs: string[] = Object.keys(categories);
  for (const id of orderedIds) {
    const item = world[id];
    if (item && item.wbType && !typeSlugs.includes(item.wbType)) {
      typeSlugs.push(item.wbType);
    }
  }

  const activeFilter =
    filterType === FILTER_ALL || typeSlugs.includes(filterType)
      ? filterType
      : FILTER_ALL;

  const needle = normalizeForSearch(query.trim());

  /** L'ordre ne peut être changé que sur la liste complète. */
  const canReorder = !needle && activeFilter === FILTER_ALL;

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

  const visibleIds = orderedIds.filter((id) => {
    const item = world[id];
    if (!item) return false;
    return (activeFilter === FILTER_ALL || item.wbType === activeFilter) && matchesSearch(item);
  });

  function handleItemClick(
    event: MouseEvent<HTMLButtonElement>,
    id: string,
  ): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      openInTab(id);
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
    openInTab(id);
  }

  function handleDelete(id: string): void {
    void controller.deleteItem(
      id,
      'world',
    );
  }

  function handleItemKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    id: string,
  ): void {
    if (event.key === 'Delete') {
      event.preventDefault();
      handleDelete(id);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  }

  function handleCreate(): void {
    if (!onCreateItem) return;
    onCreateItem(activeFilter === FILTER_ALL ? null : (activeFilter as WbType));
  }

  // -------------------------------------------------------------------------
  // Glisser-déposer
  // -------------------------------------------------------------------------

  function resetDrag(): void {
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, id: string): void {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, id: string): void {
    if (!canReorder || !draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, targetId: string): void {
    event.preventDefault();
    const fromId = draggedId;
    resetDrag();
    if (!canReorder || !fromId || fromId === targetId) return;

    const order = Object.keys(world);
    const fromIndex = order.indexOf(fromId);
    const toIndex = order.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, fromId);
    controller.reorderSidebar('world', order);
  }

  // -------------------------------------------------------------------------
  // Affichage de la liste
  // -------------------------------------------------------------------------

  function renderCreateButton() {
    if (!onCreateItem) return null;
    return (
      <button
        type="button"
        className="wb-side-panel-create-btn"
        title={t('addWBTitle')}
        onClick={handleCreate}
      >
        + {t('addWBTitle')}
      </button>
    );
  }

  function renderList() {
    if (allCount === 0) {
      return (
        <>
          <div className="wb-side-panel-list-tools">
            {renderCreateButton()}
          </div>
          <div className="wb-side-panel-empty">
            {t('wbPanelNoSheets')}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="wb-side-panel-list-tools">
          {renderCreateButton()}
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
              {visibleIds.length} / {allCount}
            </span>
          </div>
        </div>

        {visibleIds.length === 0 ? (
          <div className="wb-side-panel-empty">
            {t('wbPanelNoResults')}
          </div>
        ) : (
          <ul className="wb-side-panel-list">
            {visibleIds.map((id) => {
              const item = world[id];
              if (!item) return null;
              const alias = matchedAlias(item);
              const isCurrent = activeTab === id && activeType === 'world';
              const rowClass =
                'wb-side-panel-row' +
                (isCurrent ? ' current' : '') +
                (dragOverId === id && draggedId !== id ? ' drag-over' : '') +
                (draggedId === id ? ' dragging' : '');
              return (
                <li
                  key={id}
                  className={rowClass}
                  draggable={canReorder}
                  style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}
                  onDragStart={(event) => handleDragStart(event, id)}
                  onDragEnd={resetDrag}
                  onDragOver={(event) => handleDragOver(event, id)}
                  onDragLeave={() => {
                    if (dragOverId === id) setDragOverId(null);
                  }}
                  onDrop={(event) => handleDrop(event, id)}
                >
                  <button
                    type="button"
                    className="wb-side-panel-item"
                    style={{ borderLeftColor: itemColor(item), flex: '1 1 auto', minWidth: 0 }}
                    title={item.name}
                    onClick={(event) => handleItemClick(event, id)}
                    onAuxClick={(event) => handleItemAuxClick(event, id)}
                    onKeyDown={(event) => handleItemKeyDown(event, id)}
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
                  <span
                    className="wb-side-panel-row-actions"
                    style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
                  >
                    {onRenameItem && (
                      <button
                        type="button"
                        className="wb-side-panel-row-btn"
                        title={t('renameItemTitle')}
                        aria-label={t('renameItemTitle')}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRenameItem(id);
                        }}
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      className="wb-side-panel-row-btn"
                      title={t('deleteItemTitle')}
                      aria-label={t('deleteItemTitle')}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(id);
                      }}
                    >
                      🗑
                    </button>
                  </span>
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

  const bodyStyle = {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto' as const,
  };

  return (
    <div
      className="wb-section"
      role="region"
      aria-label={t('wbPanelTitle')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
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
          <div
            className="wb-side-panel-body"
            style={bodyStyle}
          >
            <WbSheet
              key={currentId}
              controller={controller}
              name={currentId}
              compact
            />
          </div>
        </>
      ) : (
        <div
          className="wb-side-panel-body"
          style={bodyStyle}
        >
          {renderList()}
        </div>
      )}
    </div>
  );
}
