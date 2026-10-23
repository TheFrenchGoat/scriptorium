// src/renderer/components/common/Select.tsx
// Menu de choix dessiné par l'application, à utiliser à la place de <select>.
//
// Le <select> natif ouvre une liste dessinée par Windows, que le CSS ne peut
// presque pas modifier : elle ne suit donc pas le thème. Ce composant reprend
// l'aspect des menus de l'atelier (CardsSelect) :
// - clic, Entrée, Espace ou flèches : ouvre la liste ;
// - flèches, Début, Fin : déplacent la surbrillance ; Entrée valide ;
// - Échap ferme la liste sans fermer la fenêtre ou l'atelier ;
// - un seul menu ouvert à la fois (useExclusiveDropdown).
//
// La liste est rendue dans <body> (portail) en position fixe : elle n'est
// jamais coupée par un panneau qui défile (paramètres, atelier). Elle s'ouvre
// vers le haut s'il manque de place en bas, et se ferme si la page défile.

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { createPortal } from 'react-dom';
import { useExclusiveDropdown } from '../../lib/wb-workspace';

export interface SelectOption {
  value: string;
  label: string;
  /** Petite icône (emoji) affichée avant le libellé. */
  icon?: string;
  /** Style propre à l'option (par exemple sa police). */
  style?: CSSProperties;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  /** Occupe toute la largeur disponible (formulaires). */
  block?: boolean;
  className?: string;
  buttonStyle?: CSSProperties;
  id?: string;
}

const LIST_MAX_HEIGHT = 300;
const LIST_GAP = 4;
const SCREEN_MARGIN = 8;

export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  block = false,
  className,
  buttonStyle,
  id
}: SelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [listStyle, setListStyle] = useState<CSSProperties | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Un seul menu ouvert à la fois.
  useExclusiveDropdown(open, () => setOpen(false));

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Un menu désactivé pendant qu'il est ouvert se referme.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Position de la liste, calculée d'après le bouton.
  useLayoutEffect(() => {
    if (!open) {
      setListStyle(null);
      return;
    }

    const place = (): void => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - LIST_GAP - SCREEN_MARGIN;
      const spaceAbove = rect.top - LIST_GAP - SCREEN_MARGIN;
      const wanted = Math.min(LIST_MAX_HEIGHT, options.length * 34 + 10);
      const openAbove = spaceBelow < wanted && spaceAbove > spaceBelow;
      const room = openAbove ? spaceAbove : spaceBelow;

      const style: CSSProperties = {
        left: rect.left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, window.innerWidth - rect.left - SCREEN_MARGIN),
        maxHeight: Math.max(80, Math.min(LIST_MAX_HEIGHT, room))
      };
      if (openAbove) {
        style.bottom = window.innerHeight - rect.top + LIST_GAP;
      } else {
        style.top = rect.bottom + LIST_GAP;
      }
      setListStyle(style);
    };

    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
    };
  }, [open, options.length]);

  // Fermeture : clic en dehors, ou défilement de la page.
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onScroll = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // L'option en surbrillance reste visible dans la liste.
  useEffect(() => {
    if (!open || highlight < 0) return;
    const element = listRef.current?.children[highlight] as HTMLElement | undefined;
    element?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight, listStyle]);

  function openList(): void {
    if (disabled || options.length === 0) return;
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number): void {
    const option = options[index];
    if (option && option.value !== value) {
      onChange(option.value);
    }
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      if (open) {
        // La fenêtre ou l'atelier ne se ferme pas en même temps.
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

    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setHighlight(event.key === 'Home' ? 0 : options.length - 1);
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

  const rootClass =
    'ui-select' +
    (block ? ' ui-select-block' : '') +
    (open ? ' open' : '') +
    (className ? ' ' + className : '');

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className="ui-select-btn"
        style={buttonStyle}
        disabled={disabled}
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
        {selected?.icon && <span className="ui-select-icon">{selected.icon}</span>}
        <span className="ui-select-label">{selected ? selected.label : '\u00a0'}</span>
        <span className="ui-select-chevron" aria-hidden="true">▾</span>
      </button>

      {open &&
        listStyle &&
        createPortal(
          <ul
            ref={listRef}
            className="ui-select-list"
            role="listbox"
            aria-label={ariaLabel}
            style={listStyle}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const optionClass =
                'ui-select-option' +
                (isSelected ? ' selected' : '') +
                (index === highlight ? ' highlighted' : '');
              return (
                <li
                  key={option.value}
                  className={optionClass}
                  style={option.style}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span className="ui-select-check" aria-hidden="true">
                    {isSelected ? '✓' : ''}
                  </span>
                  {option.icon && <span className="ui-select-icon">{option.icon}</span>}
                  <span className="ui-select-label">{option.label}</span>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
