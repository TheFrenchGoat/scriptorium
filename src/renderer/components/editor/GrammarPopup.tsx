import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../i18n';

/**
 * Menu de propositions du correcteur grammatical.
 *
 * S'ouvre au clic gauche ou au clic droit sur un <mark class="grammar-error">
 * situé dans #editor. Affiche le message de LanguageTool, jusqu'à 5 propositions
 * de remplacement et un bouton « Ignorer ».
 *
 * Se ferme avec Échap, un clic à l'extérieur, la frappe, le défilement,
 * le redimensionnement de la fenêtre, la perte de focus de la fenêtre,
 * ou si la faute disparaît du document.
 */

interface GrammarPopupController {
  applyGrammarSuggestion: (mark: HTMLElement, replacement: string) => void;
  ignoreGrammarMark: (mark: HTMLElement) => void;
}

interface GrammarPopupProps {
  controller: GrammarPopupController;
}

interface PopupAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface PopupState {
  mark: HTMLElement;
  message: string;
  replacements: string[];
  anchor: PopupAnchor;
}

interface PopupPosition {
  left: number;
  top: number;
}

const MAX_SUGGESTIONS = 5;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

function readReplacements(mark: HTMLElement): string[] {
  const raw = mark.getAttribute('data-replacements');
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const result: string[] = [];
  for (const item of parsed) {
    let value: string | null = null;
    if (typeof item === 'string') {
      value = item;
    } else if (item && typeof item === 'object') {
      const candidate = (item as { value?: unknown }).value;
      if (typeof candidate === 'string') value = candidate;
    }
    if (value === null || result.includes(value)) continue;
    result.push(value);
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  return result;
}

function findGrammarMark(target: EventTarget | null): HTMLElement | null {
  let node: Node | null = target instanceof Node ? target : null;
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  if (!(node instanceof Element)) return null;

  const mark = node.closest('mark.grammar-error');
  if (!(mark instanceof HTMLElement)) return null;
  if (!mark.closest('#editor')) return null;
  return mark;
}

function computeAnchor(mark: HTMLElement, clientX: number, clientY: number): PopupAnchor {
  const rects = Array.from(mark.getClientRects());
  const hit = rects.find(
    (r) => clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom,
  );
  const chosen = hit ?? rects[0] ?? mark.getBoundingClientRect();
  return { left: chosen.left, top: chosen.top, bottom: chosen.bottom };
}

function suggestionLabel(value: string): string {
  if (value === '') return t('grammarSuggDelete');
  if (value.trim() === '') return t('grammarSuggSpace');
  return value;
}

function suggestionTitle(value: string): string {
  if (value === '') return t('grammarSuggDeleteTitle');
  if (value.trim() === '') return t('grammarSuggSpaceTitle');
  return t('grammarSuggReplaceWith').split('{value}').join(value);
}

function isInside(container: HTMLElement | null, target: EventTarget | null): boolean {
  return !!container && target instanceof Node && container.contains(target);
}

function isModifierKey(key: string): boolean {
  return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta' || key === 'AltGraph';
}

export function GrammarPopup({ controller }: GrammarPopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setPopup(null);
    setPosition(null);
  }, []);

  // Ouverture : clic gauche ou clic droit sur une faute soulignée dans #editor.
  useEffect(() => {
    const open = (event: MouseEvent, mark: HTMLElement) => {
      setPosition(null);
      setPopup({
        mark,
        message: mark.getAttribute('data-message') ?? '',
        replacements: readReplacements(mark),
        anchor: computeAnchor(mark, event.clientX, event.clientY),
      });
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      // Ctrl+clic reste réservé aux mentions du worldbuilding, Maj+clic à la sélection.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const mark = findGrammarMark(event.target);
      if (!mark) return;
      // Pas de menu si l'utilisateur vient de sélectionner du texte.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      open(event, mark);
    };

    const handleContextMenu = (event: MouseEvent) => {
      const mark = findGrammarMark(event.target);
      if (!mark) return;
      event.preventDefault();
      open(event, mark);
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, []);

  // Positionnement : sous la faute, ou au-dessus s'il n'y a pas la place.
  useLayoutEffect(() => {
    if (!popup) return;
    const element = popupRef.current;
    if (!element) return;

    const box = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = popup.anchor.left;
    if (left + box.width > viewportWidth - VIEWPORT_MARGIN) {
      left = viewportWidth - VIEWPORT_MARGIN - box.width;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    let top = popup.anchor.bottom + ANCHOR_GAP;
    if (top + box.height > viewportHeight - VIEWPORT_MARGIN) {
      const above = popup.anchor.top - ANCHOR_GAP - box.height;
      top =
        above >= VIEWPORT_MARGIN
          ? above
          : Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - box.height);
    }

    setPosition({ left, top });
  }, [popup]);

  // Fermeture automatique tant que le menu est ouvert.
  useEffect(() => {
    if (!popup) return;
    const { mark } = popup;

    if (!mark.isConnected) {
      close();
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (isInside(popupRef.current, event.target)) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (isInside(popupRef.current, event.target)) return;
      if (isModifierKey(event.key)) return;
      close();
    };

    const handleScroll = (event: Event) => {
      if (isInside(popupRef.current, event.target)) return;
      close();
    };

    const handleClose = () => close();

    const observer = new MutationObserver(() => {
      if (!mark.isConnected) close();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('input', handleClose, true);
    window.addEventListener('resize', handleClose);
    window.addEventListener('blur', handleClose);

    return () => {
      observer.disconnect();
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('input', handleClose, true);
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('blur', handleClose);
    };
  }, [popup, close]);

  if (!popup) return null;

  const applySuggestion = (replacement: string) => {
    const current = popup;
    close();
    if (!current.mark.isConnected) return;
    controller.applyGrammarSuggestion(current.mark, replacement);
  };

  const ignoreMark = () => {
    const current = popup;
    close();
    if (!current.mark.isConnected) return;
    controller.ignoreGrammarMark(current.mark);
  };

  // Empêche les boutons de voler le focus de l'éditeur.
  const keepEditorFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  const style: CSSProperties = {
    position: 'fixed',
    left: position ? position.left : popup.anchor.left,
    top: position ? position.top : popup.anchor.bottom + ANCHOR_GAP,
    visibility: position ? 'visible' : 'hidden',
  };

  return (
    <div
      ref={popupRef}
      className="grammar-suggest-popup"
      role="menu"
      style={style}
      onMouseDown={keepEditorFocus}
      onContextMenu={keepEditorFocus}
    >
      <div className="gsp-message">{popup.message || t('grammarSuggPossibleError')}</div>

      {popup.replacements.length > 0 ? (
        <div className="gsp-suggestions">
          {popup.replacements.map((value, index) => (
            <button
              key={`${index}-${value}`}
              type="button"
              role="menuitem"
              className="gsp-suggestion"
              title={suggestionTitle(value)}
              onClick={() => applySuggestion(value)}
            >
              {suggestionLabel(value)}
            </button>
          ))}
        </div>
      ) : (
        <div className="gsp-empty" style={{ opacity: 0.7, fontStyle: 'italic', margin: '6px 0' }}>
          {t('grammarNoSuggestions')}
        </div>
      )}

      <button type="button" role="menuitem" className="gsp-ignore" onClick={ignoreMark}>
        {t('grammarIgnoreBtn')}
      </button>
    </div>
  );
}

export default GrammarPopup;
