// src/renderer/components/editor/WbTimelineView.tsx
// Frise chronologique des fiches World Building, affichée dans l'onglet
// « Frise » de l'atelier (WbWorkspace), par-dessus la zone d'écriture.
//
// - les événements sont rangés sur un axe horizontal, triés par `sortKey` ;
// - chaque carte montre la date libre, le titre, la description, les fiches
//   concernées (pastilles) et les chapitres où l'événement est raconté ;
// - clic sur une pastille : fiche dans le panneau latéral ;
//   Ctrl+clic ou clic molette : ouverture dans un onglet (l'atelier se ferme) ;
// - glisser-déposer d'une carte à la souris : nouvelle place dans la frise
//   (trait de dépôt, défilement automatique près des bords, Échap annule) ;
// - ◀ / ▶ : échange de position avec l'événement voisin ;
// - double-clic sur une carte ou ✎ : modification ; 🗑 : suppression ;
// - filtre par fiche : seuls les événements où elle apparaît sont affichés.
//
// Au dépôt, seul l'événement déplacé reçoit une nouvelle `sortKey` (les
// valeurs des autres sont conservées) ; en cas d'égalité, l'ordre du tableau
// enregistré départage, et le tableau est réécrit dans l'ordre affiché.
//
// Les événements sont enregistrés dans le projet (wbTimeline) avec
// `controller.saveWholeProject()`, quel que soit l'onglet actif.
// Chaque modification est ajoutée à l'historique commun de l'atelier
// (wb-history) : Ctrl+Z / Ctrl+Y, gérés par WbWorkspace, la défont ou la
// refont. L'ouverture, la fermeture et la touche Échap sont gérées par l'atelier.

import { Select } from '../common/Select';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useI18n } from '../../i18n';
import type { TranslationKey } from '../../i18n/dict';
import type { WbCategoryDef, WbItem, WbTimelineEvent } from '../../../shared/types';
import { pickText, WB_COLOR_PALETTE, WB_FALLBACK_ICON, WB_UNTITLED_NAME } from '../../lib/wb-config';
import { cloneWbData, pushWbHistory, useWbHistoryVersion } from '../../lib/wb-history';
import { closeWbWorkspace } from '../../lib/wb-workspace';
import { Modal } from '../common/Modal';
import type { EditorController } from './useEditorController';
import { openWbPanel } from './WbSidePanel';
import './wb-timeline.css';

interface WbTimelineViewProps {
  controller: EditorController;
}

/** Brouillon édité dans la fenêtre de création ou de modification. */
interface EventDraft {
  /** null : nouvel événement. */
  id: string | null;
  title: string;
  dateLabel: string;
  /** Gardé en texte pendant la saisie ; converti en nombre à l'enregistrement. */
  sortKey: string;
  description: string;
  itemIds: string[];
  chapterNames: string[];
  /** Chaîne vide : aucune couleur. */
  color: string;
}

/** Glissement en cours (ou simplement préparé, tant que `active` est faux). */
interface DragState {
  id: string;
  startX: number;
  startY: number;
  lastX: number;
  active: boolean;
  /** Vitesse de défilement automatique (px par image), 0 si aucun. */
  speed: number;
  raf: number;
}

/** Écart de position donné aux nouveaux événements. */
const SORT_STEP = 10;

/** Nombre maximal de fiches proposées dans la liste de recherche. */
const PICKER_LIMIT = 200;

/** Distance (px) à parcourir avant que le glissement commence. */
const DRAG_THRESHOLD = 5;

/** Largeur (px) de la zone de défilement automatique près des bords. */
const AUTOSCROLL_EDGE = 70;

/** Vitesse maximale du défilement automatique (px par image). */
const AUTOSCROLL_MAX = 18;

const DRAGGING_BODY_CLASS = 'wb-tl-dragging';

function makeEventId(existing: Set<string>): string {
  let id = '';
  do {
    const random =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    id = 'tl-' + random;
  } while (existing.has(id));
  return id;
}

/** Tri stable : position, puis ordre d'enregistrement. */
function sortEvents(events: WbTimelineEvent[]): WbTimelineEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.sortKey - b.event.sortKey || a.index - b.index)
    .map((entry) => entry.event);
}

/** Texte sans accents ni majuscules, pour la recherche. */
function foldText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function parseSortKey(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Position à donner à un événement déposé entre `prev` et `next`.
 * La valeur actuelle est gardée si elle convient déjà ; sinon on prend une
 * valeur entière intermédiaire, ou à défaut celle du précédent (égalité
 * départagée par l'ordre du tableau).
 */
function keyBetween(current: number, prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return current;
  if (prev === undefined && next !== undefined) {
    return current <= next ? current : next - SORT_STEP;
  }
  if (next === undefined && prev !== undefined) {
    return current >= prev ? current : prev + SORT_STEP;
  }
  const low = prev as number;
  const high = next as number;
  if (current >= low && current <= high) return current;
  if (high - low >= 2) return low + Math.floor((high - low) / 2);
  return low;
}

export function WbTimelineView({ controller }: WbTimelineViewProps) {
  const { t, lang } = useI18n();

  // Redessine la frise après chaque annulation ou rétablissement.
  useWbHistoryVersion();

  // Contrôleur à jour, utilisé par les actions d'annulation et de rétablissement.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const [, setVersion] = useState(0);
  const [filterId, setFilterId] = useState('');
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<WbTimelineEvent | null>(null);

  // Glisser-déposer
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const eventElsRef = useRef(new Map<string, HTMLDivElement>());
  const visibleRef = useRef<WbTimelineEvent[]>([]);

  function redraw(): void {
    setVersion((previous) => previous + 1);
  }

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  const data = controller.data();
  const world: Record<string, WbItem> = data.world ?? {};
  const categories: Record<string, WbCategoryDef> = data.wbCategories ?? {};
  const rawEvents: WbTimelineEvent[] = data.wbTimeline ?? [];
  const events = sortEvents(rawEvents);
  const chapterList: string[] = Object.keys(data.chapters ?? {});
  const chapterSet = new Set(chapterList);

  function itemName(item: WbItem): string {
    return item.name.trim() || pickText(WB_UNTITLED_NAME, lang);
  }

  function itemIcon(item: WbItem): string {
    return item.icon || categories[item.wbType]?.icon || WB_FALLBACK_ICON;
  }

  function itemColor(item: WbItem): string {
    return item.color || categories[item.wbType]?.color || 'var(--accent)';
  }

  function byName(a: WbItem, b: WbItem): number {
    return itemName(a).localeCompare(itemName(b), lang, { sensitivity: 'base' });
  }

  // Fiches proposées dans le filtre : celles qui apparaissent dans la frise.
  const filterIds = new Set<string>();
  for (const event of events) {
    for (const id of event.itemIds) {
      if (world[id]) filterIds.add(id);
    }
  }
  const filterItems = Array.from(filterIds, (id) => world[id]).sort(byName);

  const activeFilter = filterId && filterIds.has(filterId) ? filterId : '';
  const visibleEvents = activeFilter
    ? events.filter((event) => event.itemIds.includes(activeFilter))
    : events;
  visibleRef.current = visibleEvents;

  // -------------------------------------------------------------------------
  // Enregistrement et historique
  // -------------------------------------------------------------------------

  /** Écrit les événements dans le projet et lance la sauvegarde. */
  function writeTimeline(next: WbTimelineEvent[]): void {
    const current = controllerRef.current;
    const projectData = current.data();
    projectData.wbTimeline = next;
    current.setSaveStatus('pending');
    void current.saveWholeProject();
  }

  /** Enregistre `next` et l'ajoute à l'historique de l'atelier. */
  function commit(next: WbTimelineEvent[], labelKey: TranslationKey): void {
    const before = cloneWbData(controllerRef.current.data().wbTimeline ?? []);
    const after = cloneWbData(next);

    // Rien n'a changé (ex. : fenêtre validée sans modification) : pas d'étape.
    if (JSON.stringify(before) === JSON.stringify(after)) {
      redraw();
      return;
    }

    writeTimeline(next);
    pushWbHistory({
      tab: 'timeline',
      labelKey,
      undo: () => writeTimeline(cloneWbData(before)),
      redo: () => writeTimeline(cloneWbData(after)),
    });
    redraw();
  }

  // -------------------------------------------------------------------------
  // Création, modification, suppression, déplacement par les flèches
  // -------------------------------------------------------------------------

  function openCreate(): void {
    const last = events[events.length - 1];
    setItemSearch('');
    setDraft({
      id: null,
      title: '',
      dateLabel: '',
      sortKey: String(last ? last.sortKey + SORT_STEP : SORT_STEP),
      description: '',
      itemIds: activeFilter ? [activeFilter] : [],
      chapterNames: [],
      color: '',
    });
  }

  function openEdit(event: WbTimelineEvent): void {
    setItemSearch('');
    setDraft({
      id: event.id,
      title: event.title,
      dateLabel: event.dateLabel,
      sortKey: String(event.sortKey),
      description: event.description,
      itemIds: [...event.itemIds],
      chapterNames: [...event.chapterNames],
      color: event.color ?? '',
    });
  }

  function closeDraft(): void {
    setDraft(null);
    setItemSearch('');
  }

  function saveDraft(): void {
    if (!draft) return;

    const existing = draft.id ? rawEvents.find((event) => event.id === draft.id) : undefined;
    const last = events[events.length - 1];
    const fallbackKey = existing ? existing.sortKey : last ? last.sortKey + SORT_STEP : SORT_STEP;
    const sortKey = parseSortKey(draft.sortKey) ?? fallbackKey;

    const event: WbTimelineEvent = {
      id: existing ? existing.id : makeEventId(new Set(rawEvents.map((entry) => entry.id))),
      title: draft.title.trim(),
      dateLabel: draft.dateLabel.trim(),
      sortKey,
      description: draft.description.trim(),
      itemIds: draft.itemIds.filter((id) => Boolean(world[id])),
      chapterNames: draft.chapterNames,
    };
    if (draft.color) event.color = draft.color;

    const next = existing
      ? rawEvents.map((entry) => (entry.id === existing.id ? event : entry))
      : [...rawEvents, event];

    commit(next, existing ? 'wbHistTlEdit' : 'wbHistTlCreate');
    closeDraft();
  }

  function confirmDelete(): void {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    commit(
      rawEvents.filter((event) => event.id !== id),
      'wbHistTlDelete'
    );
  }

  /** direction : -1 = plus tôt, 1 = plus tard. */
  function moveEvent(event: WbTimelineEvent, direction: -1 | 1): void {
    const index = events.findIndex((entry) => entry.id === event.id);
    const neighbor = events[index + direction];
    if (index < 0 || !neighbor) return;

    let movedKey = neighbor.sortKey;
    let neighborKey = event.sortKey;
    if (event.sortKey === neighbor.sortKey) {
      // Même position : on décale seulement l'événement déplacé.
      movedKey = neighbor.sortKey + direction;
      neighborKey = neighbor.sortKey;
    }

    commit(
      rawEvents.map((entry) => {
        if (entry.id === event.id) return { ...entry, sortKey: movedKey };
        if (entry.id === neighbor.id) return { ...entry, sortKey: neighborKey };
        return entry;
      }),
      'wbHistTlMove'
    );
  }

  // -------------------------------------------------------------------------
  // Glisser-déposer des cartes
  // -------------------------------------------------------------------------

  /** Nombre de cartes visibles (hors carte déplacée) situées à gauche du pointeur. */
  function computeDropIndex(clientX: number, movingId: string): number {
    let index = 0;
    for (const event of visibleRef.current) {
      if (event.id === movingId) continue;
      const element = eventElsRef.current.get(event.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (clientX > rect.left + rect.width / 2) index += 1;
    }
    return index;
  }

  function stopDragEffects(drag: DragState | null): void {
    if (drag && drag.raf) cancelAnimationFrame(drag.raf);
    document.body.classList.remove(DRAGGING_BODY_CLASS);
  }

  function autoScrollTick(): void {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;
    const scroller = scrollRef.current;
    if (scroller && drag.speed !== 0) {
      const before = scroller.scrollLeft;
      scroller.scrollLeft = before + drag.speed;
      if (scroller.scrollLeft !== before) {
        setDropIndex(computeDropIndex(drag.lastX, drag.id));
      }
    }
    drag.raf = requestAnimationFrame(autoScrollTick);
  }

  function updateAutoScroll(drag: DragState, clientX: number): void {
    const scroller = scrollRef.current;
    if (!scroller) {
      drag.speed = 0;
      return;
    }
    const rect = scroller.getBoundingClientRect();
    if (clientX < rect.left + AUTOSCROLL_EDGE) {
      const ratio = Math.min(1, (rect.left + AUTOSCROLL_EDGE - clientX) / AUTOSCROLL_EDGE);
      drag.speed = -Math.ceil(ratio * AUTOSCROLL_MAX);
    } else if (clientX > rect.right - AUTOSCROLL_EDGE) {
      const ratio = Math.min(1, (clientX - (rect.right - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE);
      drag.speed = Math.ceil(ratio * AUTOSCROLL_MAX);
    } else {
      drag.speed = 0;
    }
  }

  function handleCardPointerDown(event: ReactPointerEvent<HTMLDivElement>, timelineEvent: WbTimelineEvent): void {
    if (event.button !== 0 || dragRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, label')) return;
    // Titre et description : sélection du texte (et barre de défilement), pas de glissement.
    if (target.closest('.wb-tl-desc, .wb-tl-title')) return;

    event.preventDefault();
    dragRef.current = {
      id: timelineEvent.id,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      active: false,
      speed: 0,
      raf: 0,
    };
  }

  function handleWindowPointerMove(event: PointerEvent): void {
    const drag = dragRef.current;
    if (!drag) return;
    drag.lastX = event.clientX;

    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < DRAG_THRESHOLD) return;
      drag.active = true;
      setDragId(drag.id);
      document.body.classList.add(DRAGGING_BODY_CLASS);
      window.getSelection()?.removeAllRanges();
      drag.raf = requestAnimationFrame(autoScrollTick);
    }

    updateAutoScroll(drag, event.clientX);
    setDropIndex(computeDropIndex(event.clientX, drag.id));
  }

  function handleWindowPointerUp(event: PointerEvent): void {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    stopDragEffects(drag);
    if (!drag.active) return;

    const index = computeDropIndex(event.clientX, drag.id);
    setDragId(null);
    setDropIndex(null);
    dropAt(drag.id, index);
  }

  function cancelDrag(): void {
    const drag = dragRef.current;
    dragRef.current = null;
    stopDragEffects(drag);
    setDragId(null);
    setDropIndex(null);
  }

  function handleWindowKeyDown(event: KeyboardEvent): void {
    const drag = dragRef.current;
    if (!drag || !drag.active || event.key !== 'Escape') return;
    // Échap annule le glissement sans fermer l'atelier.
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelDrag();
  }

  /** Dépose l'événement `id` à la place `index` parmi les autres cartes visibles. */
  function dropAt(id: string, index: number): void {
    const visibleOthers = visibleRef.current.filter((event) => event.id !== id);
    const before = visibleOthers[index - 1];
    const after = visibleOthers[index];

    const all = sortEvents(controller.data().wbTimeline ?? []);
    const originalIndex = all.findIndex((event) => event.id === id);
    if (originalIndex < 0) return;
    const moved = all[originalIndex];
    const ordered = all.filter((event) => event.id !== id);

    let insertAt = 0;
    if (after) {
      insertAt = ordered.findIndex((event) => event.id === after.id);
    } else if (before) {
      const beforeIndex = ordered.findIndex((event) => event.id === before.id);
      insertAt = beforeIndex < 0 ? -1 : beforeIndex + 1;
    }
    if (insertAt < 0 || insertAt === originalIndex) return;

    const prev = ordered[insertAt - 1];
    const next = ordered[insertAt];
    const sortKey = keyBetween(moved.sortKey, prev?.sortKey, next?.sortKey);

    ordered.splice(insertAt, 0, { ...moved, sortKey });
    commit(ordered, 'wbHistTlMove');
  }

  // Les écouteurs globaux appellent toujours la version à jour des fonctions.
  const windowHandlersRef = useRef({
    move: handleWindowPointerMove,
    up: handleWindowPointerUp,
    cancel: cancelDrag,
    key: handleWindowKeyDown,
  });
  windowHandlersRef.current = {
    move: handleWindowPointerMove,
    up: handleWindowPointerUp,
    cancel: cancelDrag,
    key: handleWindowKeyDown,
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => windowHandlersRef.current.move(event);
    const onUp = (event: PointerEvent) => windowHandlersRef.current.up(event);
    const onCancel = () => windowHandlersRef.current.cancel();
    const onKey = (event: KeyboardEvent) => windowHandlersRef.current.key(event);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag && drag.raf) cancelAnimationFrame(drag.raf);
      document.body.classList.remove(DRAGGING_BODY_CLASS);
    };
  }, []);

  // Repère de dépôt : avant la carte `dropBeforeId`, ou après la dernière.
  const dragOthers = dragId ? visibleEvents.filter((event) => event.id !== dragId) : [];
  let dropBeforeId: string | null = null;
  let dropAfterId: string | null = null;
  if (dragId && dropIndex !== null) {
    if (dropIndex < dragOthers.length) {
      dropBeforeId = dragOthers[dropIndex].id;
    } else if (dragOthers.length > 0) {
      dropAfterId = dragOthers[dragOthers.length - 1].id;
    }
  }

  // -------------------------------------------------------------------------
  // Pastilles de fiches
  // -------------------------------------------------------------------------

  function openInTab(id: string): void {
    void controller.openItem(id, 'world');
    closeWbWorkspace();
  }

  function handleChipClick(event: ReactMouseEvent<HTMLButtonElement>, id: string): void {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      openInTab(id);
      return;
    }
    openWbPanel(id);
  }

  function handleChipAuxClick(event: ReactMouseEvent<HTMLButtonElement>, id: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    openInTab(id);
  }

  function renderChip(item: WbItem, onRemove?: () => void) {
    const style = { '--wb-tl-chip-color': itemColor(item) } as CSSProperties;
    if (onRemove) {
      return (
        <span key={item.id} className="wb-tl-chip" style={style}>
          <span className="wb-tl-chip-icon">{itemIcon(item)}</span>
          <span className="wb-tl-chip-name">{itemName(item)}</span>
          <button type="button" className="wb-tl-chip-remove" onClick={onRemove} aria-label="×">
            ×
          </button>
        </span>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        className="wb-tl-chip"
        style={style}
        onClick={(event) => handleChipClick(event, item.id)}
        onAuxClick={(event) => handleChipAuxClick(event, item.id)}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <span className="wb-tl-chip-icon">{itemIcon(item)}</span>
        <span className="wb-tl-chip-name">{itemName(item)}</span>
      </button>
    );
  }

  // -------------------------------------------------------------------------
  // Fenêtre d'édition : fiches et chapitres
  // -------------------------------------------------------------------------

  function toggleDraftItem(id: string): void {
    setDraft((previous) => {
      if (!previous) return previous;
      const has = previous.itemIds.includes(id);
      return {
        ...previous,
        itemIds: has ? previous.itemIds.filter((entry) => entry !== id) : [...previous.itemIds, id],
      };
    });
  }

  function toggleDraftChapter(name: string): void {
    setDraft((previous) => {
      if (!previous) return previous;
      const has = previous.chapterNames.includes(name);
      return {
        ...previous,
        chapterNames: has
          ? previous.chapterNames.filter((entry) => entry !== name)
          : [...previous.chapterNames, name],
      };
    });
  }

  function updateDraft(patch: Partial<EventDraft>): void {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  }

  const search = foldText(itemSearch.trim());
  const pickerItems = draft
    ? Object.values(world)
        .filter((item) => !draft.itemIds.includes(item.id))
        .filter((item) => !search || foldText(itemName(item)).includes(search))
        .sort(byName)
        .slice(0, PICKER_LIMIT)
    : [];
  const draftItems = draft
    ? draft.itemIds.map((id) => world[id]).filter((item): item is WbItem => Boolean(item))
    : [];

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  return (
    <div className="wb-tl-root">
      <div className="wb-tl-toolbar">
        <button type="button" className="wb-tl-btn wb-tl-btn-primary" onClick={openCreate}>
          + {t('wbTlAdd')}
        </button>

        {filterItems.length > 0 && (
          <label className="wb-tl-filter">
            <span>{t('wbTlFilterLabel')}</span>
            <Select
              ariaLabel={t('wbTlFilterLabel')}
              value={activeFilter}
              options={[
                { value: '', label: t('wbTlFilterAll') },
                ...filterItems.map((item) => ({
                  value: item.id,
                  label: String(itemName(item)),
                  icon: String(itemIcon(item) ?? '')
                }))
              ]}
              onChange={setFilterId}
            />
          </label>
        )}
      </div>

      {events.length === 0 ? (
        <div className="wb-tl-empty">
          <p>{t('wbTlEmpty')}</p>
          <button type="button" className="wb-tl-btn wb-tl-btn-primary" onClick={openCreate}>
            + {t('wbTlAdd')}
          </button>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="wb-tl-empty">
          <p>{t('wbTlNoMatch')}</p>
        </div>
      ) : (
        <div className="wb-tl-scroll" ref={scrollRef}>
          <div className={'wb-tl-track' + (dragId ? ' is-drag-active' : '')}>
            <div className="wb-tl-axis" aria-hidden="true" />
            {visibleEvents.map((event) => {
              const position = events.findIndex((entry) => entry.id === event.id);
              const isFirst = position <= 0;
              const isLast = position >= events.length - 1;
              const style = { '--wb-tl-color': event.color || 'var(--accent)' } as CSSProperties;
              const items = event.itemIds
                .map((id) => world[id])
                .filter((item): item is WbItem => Boolean(item));
              const chapters = event.chapterNames.filter((name) => chapterSet.has(name));

              let className = 'wb-tl-event';
              if (event.id === dragId) className += ' is-dragging';
              if (event.id === dropBeforeId) className += ' is-drop-before';
              if (event.id === dropAfterId) className += ' is-drop-after';

              return (
                <div
                  key={event.id}
                  className={className}
                  style={style}
                  ref={(element) => {
                    if (element) eventElsRef.current.set(event.id, element);
                    else eventElsRef.current.delete(event.id);
                  }}
                >
                  <div className="wb-tl-dot" aria-hidden="true" />
                  <div
                    className="wb-tl-card"
                    onPointerDown={(pointerEvent) => handleCardPointerDown(pointerEvent, event)}
                    onDoubleClick={() => openEdit(event)}
                  >
                    <div className="wb-tl-date">{event.dateLabel || t('wbTlNoDate')}</div>
                    <div className="wb-tl-title">{event.title || t('wbTlUntitled')}</div>
                    {event.description && <div className="wb-tl-desc">{event.description}</div>}
                    {items.length > 0 && (
                      <div className="wb-tl-chips">{items.map((item) => renderChip(item))}</div>
                    )}
                    {chapters.length > 0 && (
                      <div className="wb-tl-chapters">{'📖 ' + chapters.join(', ')}</div>
                    )}
                    <div className="wb-tl-actions">
                      <button
                        type="button"
                        className="wb-tl-icon-btn"
                        title={t('wbTlMoveEarlier')}
                        aria-label={t('wbTlMoveEarlier')}
                        disabled={isFirst}
                        onClick={() => moveEvent(event, -1)}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        className="wb-tl-icon-btn"
                        title={t('wbTlMoveLater')}
                        aria-label={t('wbTlMoveLater')}
                        disabled={isLast}
                        onClick={() => moveEvent(event, 1)}
                      >
                        ▶
                      </button>
                      <span className="wb-tl-actions-spacer" />
                      <button
                        type="button"
                        className="wb-tl-icon-btn"
                        title={t('wbTlEdit')}
                        aria-label={t('wbTlEdit')}
                        onClick={() => openEdit(event)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="wb-tl-icon-btn wb-tl-icon-danger"
                        title={t('wbTlDelete')}
                        aria-label={t('wbTlDelete')}
                        onClick={() => setPendingDelete(event)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={draft !== null}
        title={draft?.id ? t('wbTlModalEdit') : t('wbTlModalNew')}
        width={560}
        maxHeight="85vh"
        onCancel={closeDraft}
        onPrimary={saveDraft}
        footer={
          <>
            <button type="button" className="wb-tl-btn" onClick={closeDraft}>
              {t('wbTlCancel')}
            </button>
            <button type="button" className="wb-tl-btn wb-tl-btn-primary" onClick={saveDraft}>
              {t('wbTlSave')}
            </button>
          </>
        }
      >
        {draft && (
          <div className="wb-tl-form">
            <label className="wb-tl-field">
              <span>{t('wbTlFieldTitle')}</span>
              <input
                type="text"
                autoFocus
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </label>

            <div className="wb-tl-row">
              <label className="wb-tl-field">
                <span>{t('wbTlFieldDate')}</span>
                <input
                  type="text"
                  placeholder={t('wbTlFieldDatePh')}
                  value={draft.dateLabel}
                  onChange={(event) => updateDraft({ dateLabel: event.target.value })}
                />
              </label>
              <label className="wb-tl-field wb-tl-field-small">
                <span>{t('wbTlFieldSortKey')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.sortKey}
                  onChange={(event) => updateDraft({ sortKey: event.target.value })}
                />
              </label>
            </div>
            <div className="wb-tl-hint">{t('wbTlFieldSortKeyHint')}</div>

            <label className="wb-tl-field">
              <span>{t('wbTlFieldDescription')}</span>
              <textarea
                rows={4}
                value={draft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
              />
            </label>

            <div className="wb-tl-field">
              <span>{t('wbTlFieldColor')}</span>
              <div className="wb-tl-swatches">
                <button
                  type="button"
                  className={'wb-tl-swatch wb-tl-swatch-none' + (draft.color === '' ? ' is-selected' : '')}
                  title={t('wbTlColorNone')}
                  aria-label={t('wbTlColorNone')}
                  onClick={() => updateDraft({ color: '' })}
                />
                {WB_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={'wb-tl-swatch' + (draft.color === color ? ' is-selected' : '')}
                    style={{ background: color }}
                    title={color}
                    aria-label={color}
                    onClick={() => updateDraft({ color })}
                  />
                ))}
              </div>
            </div>

            <div className="wb-tl-field">
              <span>{t('wbTlFieldItems')}</span>
              {draftItems.length > 0 && (
                <div className="wb-tl-chips">
                  {draftItems.map((item) => renderChip(item, () => toggleDraftItem(item.id)))}
                </div>
              )}
              <input
                type="text"
                placeholder={t('wbTlFieldItemsSearch')}
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
              {pickerItems.length > 0 && (
                <div className="wb-tl-picker-list">
                  {pickerItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="wb-tl-picker-item"
                      style={{ '--wb-tl-chip-color': itemColor(item) } as CSSProperties}
                      onClick={() => toggleDraftItem(item.id)}
                    >
                      <span className="wb-tl-chip-icon">{itemIcon(item)}</span>
                      <span>{itemName(item)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {chapterList.length > 0 && (
              <div className="wb-tl-field">
                <span>{t('wbTlFieldChapters')}</span>
                <div className="wb-tl-checks">
                  {chapterList.map((name) => (
                    <label key={name} className="wb-tl-check">
                      <input
                        type="checkbox"
                        checked={draft.chapterNames.includes(name)}
                        onChange={() => toggleDraftChapter(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title={t('confirmModalTitle')}
        onCancel={() => setPendingDelete(null)}
        onPrimary={confirmDelete}
        footer={
          <>
            <button type="button" className="wb-tl-btn" onClick={() => setPendingDelete(null)}>
              {t('wbTlCancel')}
            </button>
            <button type="button" className="wb-tl-btn wb-tl-btn-danger" onClick={confirmDelete}>
              {t('wbTlDelete')}
            </button>
          </>
        }
      >
        <p>{t('wbTlDeleteConfirm')}</p>
      </Modal>
    </div>
  );
}
