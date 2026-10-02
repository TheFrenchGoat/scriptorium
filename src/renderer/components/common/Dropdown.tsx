// src/renderer/components/common/Dropdown.tsx
// Menu déroulant réutilisable, reprenant le balisage CSS existant
// (.dropdown-container / .dropdown-btn / .dropdown-menu / .dropdown-item).
//
// - clic extérieur : ferme le menu
// - Échap : ferme le menu
// - items activables au clavier (Tab pour s'y déplacer, Entrée/Espace pour
//   choisir), sans dupliquer la logique de clic

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface DropdownProps {
  label: React.ReactNode;
  /** Classe du bouton déclencheur (défaut : "dropdown-btn"). */
  buttonClassName?: string;
  buttonId?: string;
  buttonTitle?: string;
  menuClassName?: string;
  menuStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  children: (close: () => void) => React.ReactNode;
}

export function Dropdown({
  label,
  buttonClassName = 'dropdown-btn',
  buttonId,
  buttonTitle,
  menuClassName = 'dropdown-menu',
  menuStyle,
  containerStyle,
  containerClassName = 'dropdown-container',
  children
}: DropdownProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{ position: 'relative', ...containerStyle }}
    >
      <button
        type="button"
        id={buttonId}
        title={buttonTitle}
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label}
      </button>
      <div className={`${menuClassName}${open ? ' show' : ''}`} style={menuStyle}>
        {children(close)}
      </div>
    </div>
  );
}

export interface DropdownItemProps {
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Empêche le clic de déplacer le focus hors de l'éditeur, ce qui
   *  détruirait la sélection de texte AVANT que l'action ne soit traitée.
   *  Sans ça, "police"/"taille" ne s'appliquaient à rien : au moment où le
   *  code lisait window.getSelection(), elle avait déjà disparu. C'est la
   *  technique qu'utilisent Google Docs, Quill, TinyMCE pour leurs barres
   *  d'outils. */
  preserveSelection?: boolean;
  children: React.ReactNode;
}

export function DropdownItem({
  onSelect,
  className = 'dropdown-item',
  style,
  title,
  preserveSelection,
  children
}: DropdownItemProps): React.ReactElement {
  return (
    <div
      className={className}
      style={style}
      title={title}
      role="menuitem"
      tabIndex={0}
      onMouseDown={preserveSelection ? (e) => e.preventDefault() : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </div>
  );
}
