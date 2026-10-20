// src/renderer/components/editor/WbHoverPreview.tsx
// Aperçu d'une fiche World Building au survol d'un nom surligné.
//
// Le composant écoute la souris sur toute la fenêtre. Quand elle reste sur un
// élément .wb-mention (posé par lib/highlight.ts), il lit l'identifiant de la
// fiche dans data-wb-key et affiche une petite carte à côté du mot.
//
// - Il ne modifie ni le texte ni le surlignage.
// - Pas d'aperçu pendant la frappe, une sélection à la souris ou une modale.
// - Clic sur la carte : fiche dans la section de gauche.
//   Ctrl+clic ou clic molette : fiche dans un onglet.
//
// Règle du projet : aucune barre oblique inverse suivie d'une parenthèse ou
// d'un crochet dans ce fichier.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import type { BuiltinWbType, WbCategoryDef, WbField, WbItem } from '../../../shared/types';
import type { EditorController } from './useEditorController';
import { openWbPanel } from './WbSidePanel';
import './wb-hover.css';

/** Délai avant l'affichage de la carte (millisecondes). */
const SHOW_DELAY = 400;

/** Délai quand une carte est déjà affichée et qu'on passe à un autre nom. */
const SWITCH_DELAY = 150;

/** Délai avant la fermeture : laisse le temps d'aller du mot à la carte. */
const HIDE_DELAY = 200;

/** Pas d'aperçu pendant ce temps après la dernière touche. */
const TYPING_PAUSE = 800;

/** Écart entre le mot et la carte, et marge avec les bords de la fenêtre. */
const GAP = 6;
const MARGIN = 8;

/** Nombre de champs affichés et longueur maximale de chaque extrait. */
const EXCERPT_COUNT = 3;
const EXCERPT_LENGTH = 140;

/** Touches qui ne ferment pas l'aperçu (Ctrl+clic doit rester possible). */
const MODIFIER_KEYS = ['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'CapsLock'];

/** Classe posée sur <body> : masque l'ancienne info-bulle CSS des mentions. */
const BODY_CLASS = 'wb-hover-enabled';

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

interface HoverState {
  id: string;
  rect: AnchorRect;
}

interface CardPosition {
  top: number;
  left: number;
  placement: 'below' | 'above';
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

/**
 * Rectangle du mot survolé. Un nom coupé en fin de ligne a plusieurs
 * rectangles : on garde celui qui est sous la souris.
 */
function pickRect(element: HTMLElement, x: number, y: number): AnchorRect {
  const rects = Array.from(element.getClientRects());
  let chosen: DOMRect | undefined = rects.find(
    (r) => y >= r.top - 2 && y <= r.bottom + 2 && x >= r.left - 2 && x <= r.right + 2,
  );
  if (!chosen) chosen = rects.find((r) => y >= r.top - 2 && y <= r.bottom + 2);
  if (!chosen) chosen = rects[0] ?? element.getBoundingClientRect();
  return { top: chosen.top, bottom: chosen.bottom, left: chosen.left };
}

interface WbHoverPreviewProps {
  controller: EditorController;
}

export function WbHoverPreview({ controller }: WbHoverPreviewProps) {
  const { t } = useI18n();

  /** Traduction d'une clé construite (ex. wbField_<key>). */
  const tr = (key: string): string => (t as unknown as (k: string) => string)(key);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [position, setPosition] = useState<CardPosition | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const pendingEl = useRef<HTMLElement | null>(null);
  const currentEl = useRef<HTMLElement | null>(null);
  const lastKeyAt = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // -------------------------------------------------------------------------
  // Minuteries (n'utilisent que des refs : sûres dans les écouteurs)
  // -------------------------------------------------------------------------

  function clearShow(): void {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    pendingEl.current = null;
  }

  function clearHide(): void {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function hideNow(): void {
    clearShow();
    clearHide();
    currentEl.current = null;
    hoverRef.current = null;
    setHover(null);
  }

  function scheduleHide(): void {
    clearShow();
    if (!hoverRef.current || hideTimer.current !== null) return;
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      hideNow();
    }, HIDE_DELAY);
  }

  function show(element: HTMLElement): void {
    const id = element.dataset.wbKey;
    if (!id || !element.isConnected) return;
    const world = controllerRef.current.data().world ?? {};
    if (!world[id]) return;
    const next: HoverState = {
      id,
      rect: pickRect(element, pointer.current.x, pointer.current.y),
    };
    currentEl.current = element;
    hoverRef.current = next;
    setHover(next);
  }

  // -------------------------------------------------------------------------
  // Masque l'ancienne info-bulle CSS tant que l'aperçu est actif
  // -------------------------------------------------------------------------

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Écouteurs globaux
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onMouseMove = (event: globalThis.MouseEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };

    const onMouseOver = (event: globalThis.MouseEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Souris sur la carte : elle reste ouverte.
      if (cardRef.current && cardRef.current.contains(target)) {
        clearHide();
        clearShow();
        return;
      }

      const mention = target.closest<HTMLElement>('.wb-mention[data-wb-key]');
      if (!mention) {
        scheduleHide();
        return;
      }

      if (mention === currentEl.current) {
        clearHide();
        return;
      }
      if (mention === pendingEl.current) return;

      // Pas d'aperçu pendant une sélection, la frappe ou une modale.
      if (event.buttons !== 0) return;
      if (Date.now() - lastKeyAt.current < TYPING_PAUSE) return;
      if (document.querySelector('.modal-overlay, .modal-backdrop')) return;

      clearShow();
      pendingEl.current = mention;
      const delay = hoverRef.current ? SWITCH_DELAY : SHOW_DELAY;
      showTimer.current = window.setTimeout(() => {
        showTimer.current = null;
        const element = pendingEl.current;
        pendingEl.current = null;
        if (element) {
          clearHide();
          show(element);
        }
      }, delay);
    };

    const onMouseOut = (event: globalThis.MouseEvent): void => {
      // Souris sortie de la fenêtre.
      if (!event.relatedTarget) scheduleHide();
    };

    const onMouseDown = (event: globalThis.MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && cardRef.current && cardRef.current.contains(target)) return;
      if (hoverRef.current || pendingEl.current) hideNow();
    };

    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (MODIFIER_KEYS.includes(event.key)) return;
      lastKeyAt.current = Date.now();
      if (hoverRef.current || pendingEl.current) hideNow();
    };

    const onScroll = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && cardRef.current && cardRef.current.contains(target)) return;
      if (hoverRef.current || pendingEl.current) hideNow();
    };

    const onBlur = (): void => {
      if (hoverRef.current || pendingEl.current) hideNow();
    };

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onBlur);
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
    // Les fonctions utilisées ne lisent que des refs : un seul abonnement suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Placement : sous le mot, ou au-dessus s'il manque de place en bas
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    if (!hover) {
      setPosition(null);
      return;
    }
    const card = cardRef.current;
    if (!card) return;

    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    let placement: CardPosition['placement'] = 'below';
    let top = hover.rect.bottom + GAP;

    if (top + height > viewHeight - MARGIN && hover.rect.top - GAP - height >= MARGIN) {
      placement = 'above';
      top = hover.rect.top - GAP - height;
    }
    if (top + height > viewHeight - MARGIN) {
      top = Math.max(MARGIN, viewHeight - MARGIN - height);
    }

    let left = hover.rect.left;
    left = Math.min(left, viewWidth - MARGIN - width);
    left = Math.max(MARGIN, left);

    setPosition({ top, left, placement });
  }, [hover]);

  // -------------------------------------------------------------------------
  // Affichage
  // -------------------------------------------------------------------------

  if (!hover) return null;

  const data = controller.data();
  const world: Record<string, WbItem> = data.world ?? {};
  const categories: Record<string, WbCategoryDef> = data.wbCategories ?? {};
  const item = world[hover.id];
  if (!item) return null;

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

  function fieldLabel(slug: string, field: WbField): string {
    const def = categories[slug];
    if (def?.builtin) {
      const key = 'wbField_' + field.key;
      const translated = tr(key);
      if (translated && translated !== key) return translated;
    }
    return field.label || field.key;
  }

  function fieldsOf(target: WbItem): WbField[] {
    const def = categories[target.wbType];
    if (def && Array.isArray(def.fields) && def.fields.length > 0) {
      return def.fields;
    }
    return Object.keys(target.content ?? {}).map((key) => ({
      key,
      label: key,
      type: 'text' as const,
    }));
  }

  function fieldValue(target: WbItem, field: WbField): string {
    const raw = target.content?.[field.key];
    if (typeof raw !== 'string' || !raw.trim()) return '';
    if (field.type === 'reference') {
      return world[raw]?.name ?? '';
    }
    return plainText(raw);
  }

  const icon = item.icon || categories[item.wbType]?.icon || '📄';
  const color = item.color || categories[item.wbType]?.color || 'var(--accent)';
  const aliases = (item.aliases ?? []).filter((alias) => alias.trim());

  const excerpt: { key: string; label: string; value: string }[] = [];
  for (const field of fieldsOf(item)) {
    if (excerpt.length >= EXCERPT_COUNT) break;
    const value = fieldValue(item, field);
    if (!value) continue;
    excerpt.push({
      key: field.key,
      label: fieldLabel(item.wbType, field),
      value: truncate(value, EXCERPT_LENGTH),
    });
  }

  const itemId = item.id || hover.id;

  function handleClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.ctrlKey || event.metaKey) {
      controller.openItem(itemId, 'world');
    } else {
      openWbPanel(itemId);
    }
    hideNow();
  }

  function handleAuxClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 1) return;
    event.preventDefault();
    controller.openItem(itemId, 'world');
    hideNow();
  }

  const cardStyle = {
    top: position ? position.top : 0,
    left: position ? position.left : 0,
    visibility: position ? 'visible' : 'hidden',
    '--wb-card-color': color,
  } as CSSProperties;

  const cardClass =
    'wb-hover-card' + (position ? ' placement-' + position.placement : '');

  return createPortal(
    <div
      ref={cardRef}
      className={cardClass}
      style={cardStyle}
      role="tooltip"
      title={t('wbCardsCardTitle')}
      onMouseDown={(event) => {
        // Le curseur reste à sa place dans le texte.
        event.preventDefault();
      }}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
    >
      <span className="wb-hover-band" />
      {item.image && (
        <span className="wb-hover-portrait">
          <img src={item.image} alt="" draggable={false} />
        </span>
      )}
      <span className="wb-hover-head">
        <span className="wb-hover-icon">{icon}</span>
        <span className="wb-hover-titles">
          <span className="wb-hover-name">{item.name}</span>
          <span className="wb-hover-type">{categoryLabel(item.wbType)}</span>
        </span>
      </span>
      {aliases.length > 0 && (
        <span className="wb-hover-aliases">
          {aliases.map((alias) => '« ' + alias + ' »').join(', ')}
        </span>
      )}
      {excerpt.length > 0 ? (
        <span className="wb-hover-excerpt">
          {excerpt.map((entry) => (
            <span key={entry.key} className="wb-hover-field">
              <span className="wb-hover-field-label">{entry.label}</span>
              <span className="wb-hover-field-value">{entry.value}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="wb-hover-empty">{t('wbCardsNoContent')}</span>
      )}
      <span className="wb-hover-hint">{t('wbCardsCardTitle')}</span>
    </div>,
    document.body,
  );
}
