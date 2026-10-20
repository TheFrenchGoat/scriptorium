// src/renderer/components/editor/WbCardsView.tsx
// Vue en cartes des fiches World Building, affichée dans l'onglet « Cartes »
// de l'atelier (WbWorkspace).
//
// - Recherche (nom, alias, contenu ; sans accents ni majuscules).
// - Filtre par type, tri par nom, type ou date de modification (inversable).
// - Regroupement par type avec titres et compteurs.
// - Taille des cartes (petite, moyenne, grande), mémorisée.
//
// Clic sur une carte : la fiche s'affiche dans la section de gauche,
// les cartes restent ouvertes.
// Ctrl+clic ou clic molette : ouverture dans un onglet et fermeture de l'atelier.
// L'atelier gère lui-même Échap et le bouton ✕.
//
// Les menus déroulants (CardsSelect) sont dessinés par l'application pour
// suivre les couleurs du thème ; ils se pilotent aussi au clavier, et un seul
// peut être ouvert à la fois dans toute l'application.
//
// N'importe quel composant peut ouvrir l'atelier sur les cartes avec `openWbCards()`.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { useI18n } from '../../i18n';
import type { BuiltinWbType, WbCategoryDef, WbField, WbItem } from '../../../shared/types';
import type { EditorController } from './useEditorController';
import { openWbPanel } from './WbSidePanel';
import {
  closeWbWorkspace,
  openWbWorkspace,
  toggleWbWorkspace,
  useExclusiveDropdown
} from '../../lib/wb-workspace';
import './wb-cards.css';

/**
 * Ancien événement de la vue en cartes. Il est toujours émis (pour les
 * fichiers qui l'écoutent éventuellement), mais c'est l'atelier qui
 * ouvre et ferme désormais la vue.
 */
export const WB_CARDS_EVENT = 'scriptorium:wb-cards';

export type WbCardsAction = 'open' | 'close' | 'toggle';

export interface WbCardsEventDetail {
  action: WbCardsAction;
}

export function dispatchWbCardsEvent(detail: WbCardsEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<WbCardsEventDetail>(WB_CARDS_EVENT, {
      detail,
    }),
  );
  if (detail.action === 'open') openWbWorkspace('cards');
  else if (detail.action === 'close') closeWbWorkspace();
  else toggleWbWorkspace('cards');
}

export function openWbCards(): void {
  dispatchWbCardsEvent({ action: 'open' });
}

export function closeWbCards(): void {
  dispatchWbCardsEvent({ action: 'close' });
}

export function toggleWbCards(): void {
  dispatchWbCardsEvent({ action: 'toggle' });
}

/** Valeur du filtre qui affiche tous les types. */
const FILTER_ALL = '__all__';

/** Clé de mémorisation de la taille des cartes. */
const SIZE_STORAGE_KEY = 'scriptorium.wbCards.size';

type CardSize = 'small' | 'medium' | 'large';
type SortMode = 'name' | 'type' | 'date';

/** Nombre de champs affichés et longueur maximale de chaque extrait. */
const EXCERPT_LIMITS: Record<CardSize, { count: number; length: number }> = {
  small: { count: 1, length: 60 },
  medium: { count: 3, length: 120 },
  large: { count: 3, length: 240 },
};

/**
 * Réglages gardés en mémoire pendant la session : la vue est démontée
 * à la fermeture de l'atelier, mais on retrouve sa recherche et ses filtres.
 */
interface CardsMemory {
  query: string;
  filterType: string;
  sortMode: SortMode;
  reversed: boolean;
  grouped: boolean;
}

const cardsMemory: CardsMemory = {
  query: '',
  filterType: FILTER_ALL,
  sortMode: 'name',
  reversed: false,
  grouped: false,
};

function readStoredSize(): CardSize {
  try {
    const value = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (value === 'small' || value === 'medium' || value === 'large') {
      return value;
    }
  } catch {
    // localStorage indisponible : taille par défaut.
  }
  return 'medium';
}

function storeSize(size: CardSize): void {
  try {
    window.localStorage.setItem(SIZE_STORAGE_KEY, size);
  } catch {
    // Sans conséquence.
  }
}

/**
 * Prépare un texte pour la recherche : sans accents et en minuscules.
 */
function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

/**
 * Remplace {nom} par sa valeur dans un texte traduit.
 */
function fill(text: string, vars: Record<string, string | number>): string {
  let result = text;
  for (const key of Object.keys(vars)) {
    result = result.split('{' + key + '}').join(String(vars[key]));
  }
  return result;
}

/**
 * Retire les balises éventuelles et les espaces en trop.
 */
function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Menu déroulant aux couleurs du thème
// ---------------------------------------------------------------------------

interface CardsSelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface CardsSelectProps {
  value: string;
  options: CardsSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}

/**
 * Menu déroulant dessiné par l'application.
 * Clic ou Entrée : ouvre la liste. Flèches : déplacent la surbrillance.
 * Entrée : valide. Échap : ferme la liste (sans fermer l'atelier).
 * Quand il s'ouvre, tous les autres menus déroulants se ferment.
 */
function CardsSelect({ value, options, onChange, ariaLabel }: CardsSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Un seul menu ouvert à la fois.
  useExclusiveDropdown(open, () => setOpen(false));

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  // Fermeture au clic en dehors du menu.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: globalThis.MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  // L'option en surbrillance reste visible dans la liste.
  useEffect(() => {
    if (!open || highlight < 0) return;
    const element = listRef.current?.children[highlight] as HTMLElement | undefined;
    element?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  function openList(): void {
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number): void {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      if (open) {
        // preventDefault : l'atelier ne se ferme pas en même temps.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((previous) => {
        const count = options.length;
        if (count === 0) return -1;
        return (previous + step + count) % count;
      });
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && highlight >= 0) {
        choose(highlight);
      } else {
        openList();
      }
      return;
    }

    if (event.key === 'Tab' && open) {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={'wb-cards-dd' + (open ? ' open' : '')}
    >
      <button
        type="button"
        className="wb-cards-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openList();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {selected?.icon && (
          <span className="wb-cards-dd-icon">{selected.icon}</span>
        )}
        <span className="wb-cards-dd-label">{selected?.label ?? ''}</span>
        <span className="wb-cards-dd-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul
          ref={listRef}
          className="wb-cards-dd-list"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const optionClass =
              'wb-cards-dd-option' +
              (isSelected ? ' selected' : '') +
              (index === highlight ? ' highlighted' : '');
            return (
              <li
                key={option.value}
                className={optionClass}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span className="wb-cards-dd-check" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
                {option.icon && (
                  <span className="wb-cards-dd-icon">{option.icon}</span>
                )}
                <span className="wb-cards-dd-label">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue en cartes
// ---------------------------------------------------------------------------

interface WbCardsViewProps {
  controller: EditorController;
}

export function WbCardsView({ controller }: WbCardsViewProps) {
  const { t } = useI18n();

  /** Traduction d'une clé construite (ex. wbField_<key>). */
  const tr = (key: string): string => (t as unknown as (k: string) => string)(key);

  const [query, setQuery] = useState(() => cardsMemory.query);
  const [filterType, setFilterType] = useState<string>(() => cardsMemory.filterType);
  const [sortMode, setSortMode] = useState<SortMode>(() => cardsMemory.sortMode);
  const [reversed, setReversed] = useState(() => cardsMemory.reversed);
  const [grouped, setGrouped] = useState(() => cardsMemory.grouped);
  const [size, setSize] = useState<CardSize>(readStoredSize);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  // Mémorise les réglages pour la prochaine ouverture de l'atelier.
  useEffect(() => {
    cardsMemory.query = query;
    cardsMemory.filterType = filterType;
    cardsMemory.sortMode = sortMode;
    cardsMemory.reversed = reversed;
    cardsMemory.grouped = grouped;
  }, [query, filterType, sortMode, reversed, grouped]);

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  const data = controller.data();
  const world: Record<string, WbItem> = data.world ?? {};
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

  function categoryIcon(slug: string): string {
    return categories[slug]?.icon || '📄';
  }

  function itemIcon(item: WbItem): string {
    return item.icon || categories[item.wbType]?.icon || '📄';
  }

  function itemColor(item: WbItem): string {
    return item.color || categories[item.wbType]?.color || 'var(--accent)';
  }

  function fieldLabel(slug: string, field: WbField): string {
    const def = categories[slug];
    if (def?.builtin) {
      const key = 'wbField_' + field.key;
      const translated = tr(key);
      if (translated && translated !== key) return translated;
    }
    return field.label || field.key;
  }

  /** Champs de la catégorie, ou champs déduits du contenu si elle manque. */
  function fieldsOf(item: WbItem): WbField[] {
    const def = categories[item.wbType];
    if (def && Array.isArray(def.fields) && def.fields.length > 0) {
      return def.fields;
    }
    return Object.keys(item.content ?? {}).map((key) => ({
      key,
      label: key,
      type: 'text' as const,
    }));
  }

  /** Valeur lisible d'un champ (nom de la fiche liée pour une référence). */
  function fieldValue(item: WbItem, field: WbField): string {
    const raw = item.content?.[field.key];
    if (typeof raw !== 'string' || !raw.trim()) return '';
    if (field.type === 'reference') {
      return world[raw]?.name ?? '';
    }
    return plainText(raw);
  }

  // -------------------------------------------------------------------------
  // Filtrage et tri
  // -------------------------------------------------------------------------

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

  function matchesSearch(item: WbItem): boolean {
    if (!needle) return true;
    if (normalizeForSearch(item.name).includes(needle)) return true;
    const aliases = item.aliases ?? [];
    if (aliases.some((alias) => normalizeForSearch(alias).includes(needle))) return true;
    for (const field of fieldsOf(item)) {
      const value = fieldValue(item, field);
      if (value && normalizeForSearch(value).includes(needle)) return true;
    }
    return false;
  }

  const visibleItems: WbItem[] = orderedIds
    .map((id) => world[id])
    .filter((item): item is WbItem => Boolean(item))
    .filter((item) => activeFilter === FILTER_ALL || item.wbType === activeFilter)
    .filter(matchesSearch);

  function compareNames(a: WbItem, b: WbItem): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  }

  function compareItems(a: WbItem, b: WbItem): number {
    let result = 0;
    if (sortMode === 'type') {
      result = typeSlugs.indexOf(a.wbType) - typeSlugs.indexOf(b.wbType);
      if (result === 0) result = compareNames(a, b);
    } else if (sortMode === 'date') {
      const dateA = a.updatedAt || a.createdAt || '';
      const dateB = b.updatedAt || b.createdAt || '';
      result = dateB.localeCompare(dateA);
      if (result === 0) result = compareNames(a, b);
    } else {
      result = compareNames(a, b);
    }
    return reversed ? -result : result;
  }

  const sortedItems = visibleItems.slice().sort(compareItems);

  const filtersActive = Boolean(needle) || activeFilter !== FILTER_ALL;

  function resetFilters(): void {
    setQuery('');
    setFilterType(FILTER_ALL);
    searchRef.current?.focus();
  }

  // -------------------------------------------------------------------------
  // Options des menus déroulants
  // -------------------------------------------------------------------------

  const filterOptions: CardsSelectOption[] = [{ value: FILTER_ALL, label: t('wbCardsFilterAll') }];
  for (const slug of typeSlugs) {
    filterOptions.push({
      value: slug,
      label: categoryLabel(slug),
      icon: categoryIcon(slug),
    });
  }

  const sortOptions: CardsSelectOption[] = [{ value: 'name', label: t('wbCardsSortName') }, { value: 'type', label: t('wbCardsSortType') }, { value: 'date', label: t('wbCardsSortDate') }];

  const sizeOptions: CardsSelectOption[] = [{ value: 'small', label: t('wbCardsSizeSmall') }, { value: 'medium', label: t('wbCardsSizeMedium') }, { value: 'large', label: t('wbCardsSizeLarge') }];

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Ouvre la fiche dans un onglet et ferme l'atelier pour la montrer. */
  function openInTab(id: string): void {
    controller.openItem(id, 'world');
    closeWbWorkspace();
  }

  function handleCardClick(event: MouseEvent<HTMLButtonElement>, id: string): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      openInTab(id);
      return;
    }
    setSelectedId(id);
    openWbPanel(id);
  }

  function handleCardAuxClick(event: MouseEvent<HTMLButtonElement>, id: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    openInTab(id);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  }

  function handleSizeChange(value: string): void {
    if (value === 'small' || value === 'medium' || value === 'large') {
      setSize(value);
      storeSize(value);
    }
  }

  function handleSortChange(value: string): void {
    if (value === 'name' || value === 'type' || value === 'date') {
      setSortMode(value);
    }
  }

  // -------------------------------------------------------------------------
  // Affichage
  // -------------------------------------------------------------------------

  function renderCard(item: WbItem) {
    const color = itemColor(item);
    const fields = fieldsOf(item);
    const limits = EXCERPT_LIMITS[size];

    let filled = 0;
    const excerpt: { key: string; label: string; value: string }[] = [];
    for (const field of fields) {
      const value = fieldValue(item, field);
      if (!value) continue;
      filled += 1;
      if (excerpt.length < limits.count) {
        excerpt.push({
          key: field.key,
          label: fieldLabel(item.wbType, field),
          value: truncate(value, limits.length),
        });
      }
    }

    const aliases = (item.aliases ?? []).filter((alias) => alias.trim());
    const isSelected = selectedId === item.id;
    const cardClass = 'wb-card' + (isSelected ? ' selected' : '');
    const cardStyle = { '--wb-card-color': color } as CSSProperties;

    return (
      <li key={item.id} className="wb-cards-cell">
        <button
          type="button"
          className={cardClass}
          style={cardStyle}
          title={t('wbCardsCardTitle')}
          onClick={(event) => handleCardClick(event, item.id)}
          onAuxClick={(event) => handleCardAuxClick(event, item.id)}
          onMouseDown={(event) => {
            if (event.button === 1) event.preventDefault();
          }}
        >
          <span className="wb-card-band" />
          {item.image && size !== 'small' && (
            <span className="wb-card-portrait">
              <img src={item.image} alt="" draggable={false} />
            </span>
          )}
          <span className="wb-card-head">
            <span className="wb-card-icon">{itemIcon(item)}</span>
            <span className="wb-card-titles">
              <span className="wb-card-name">{item.name}</span>
              <span className="wb-card-type">{categoryLabel(item.wbType)}</span>
            </span>
          </span>
          {aliases.length > 0 && (
            <span className="wb-card-aliases">
              {aliases.map((alias) => '« ' + alias + ' »').join(', ')}
            </span>
          )}
          {excerpt.length > 0 ? (
            <span className="wb-card-excerpt">
              {excerpt.map((entry) => (
                <span key={entry.key} className="wb-card-field">
                  <span className="wb-card-field-label">{entry.label}</span>
                  <span className="wb-card-field-value">{entry.value}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="wb-card-excerpt wb-card-excerpt-empty">
              {t('wbCardsNoContent')}
            </span>
          )}
          {fields.length > 0 && (
            <span className="wb-card-footer">
              <span
                className={'wb-card-filled' + (filled === fields.length ? ' complete' : '')}
                title={t('wbCardsFilledTitle')}
              >
                {fill(t('wbCardsFilled'), { filled, total: fields.length })}
              </span>
            </span>
          )}
        </button>
      </li>
    );
  }

  function renderGrid(items: WbItem[]) {
    return (
      <ul className={'wb-cards-grid size-' + size}>
        {items.map((item) => renderCard(item))}
      </ul>
    );
  }

  function renderGroups() {
    const slugs = activeFilter === FILTER_ALL ? typeSlugs : [activeFilter];
    return (
      <>
        {slugs.map((slug) => {
          const items = sortedItems.filter((item) => item.wbType === slug);
          if (items.length === 0) return null;
          return (
            <section key={slug} className="wb-cards-group">
              <h3 className="wb-cards-group-title">
                <span className="wb-cards-group-icon">{categoryIcon(slug)}</span>
                <span className="wb-cards-group-label">{categoryLabel(slug)}</span>
                <span className="wb-cards-group-count">
                  {fill(t('wbCardsGroupCount'), { count: items.length })}
                </span>
              </h3>
              {renderGrid(items)}
            </section>
          );
        })}
      </>
    );
  }

  function renderBody() {
    if (allCount === 0) {
      return (
        <div className="wb-cards-message">
          {t('wbCardsEmpty')}
        </div>
      );
    }
    if (sortedItems.length === 0) {
      return (
        <div className="wb-cards-message">
          <p>{t('wbCardsNoResults')}</p>
          {filtersActive && (
            <button
              type="button"
              className="wb-cards-btn"
              onClick={resetFilters}
            >
              {t('wbCardsResetFilters')}
            </button>
          )}
        </div>
      );
    }
    return grouped ? renderGroups() : renderGrid(sortedItems);
  }

  const countText =
    sortedItems.length === allCount
      ? fill(t('wbCardsCount'), { count: allCount })
      : fill(t('wbCardsCountFiltered'), { shown: sortedItems.length, total: allCount });

  return (
    <div className="wb-cards-overlay">
      <div className="wb-cards-header">
        <h2 className="wb-cards-title">{t('wbCardsTitle')}</h2>
        <span className="wb-cards-count">{countText}</span>
      </div>

      <div className="wb-cards-toolbar">
        <input
          ref={searchRef}
          type="search"
          className="wb-cards-search"
          placeholder={t('wbCardsSearchPlaceholder')}
          aria-label={t('wbCardsSearchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />

        <div className="wb-cards-control">
          <span className="wb-cards-control-label">{t('wbCardsFilterLabel')}</span>
          <CardsSelect
            value={activeFilter}
            options={filterOptions}
            onChange={setFilterType}
            ariaLabel={t('wbCardsFilterLabel')}
          />
        </div>

        <div className="wb-cards-control">
          <span className="wb-cards-control-label">{t('wbCardsSortLabel')}</span>
          <CardsSelect
            value={sortMode}
            options={sortOptions}
            onChange={handleSortChange}
            ariaLabel={t('wbCardsSortLabel')}
          />
          <button
            type="button"
            className={'wb-cards-btn wb-cards-reverse' + (reversed ? ' active' : '')}
            title={t('wbCardsSortReverseTitle')}
            aria-label={t('wbCardsSortReverseTitle')}
            aria-pressed={reversed}
            onClick={() => setReversed((previous) => !previous)}
          >
            ⇅
          </button>
        </div>

        <label className="wb-cards-control wb-cards-check">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => setGrouped(event.target.checked)}
          />
          <span>{t('wbCardsGroupByType')}</span>
        </label>

        <div className="wb-cards-control">
          <span className="wb-cards-control-label">{t('wbCardsSizeLabel')}</span>
          <CardsSelect
            value={size}
            options={sizeOptions}
            onChange={handleSizeChange}
            ariaLabel={t('wbCardsSizeLabel')}
          />
        </div>
      </div>

      <div className="wb-cards-body">
        {renderBody()}
      </div>
    </div>
  );
}
