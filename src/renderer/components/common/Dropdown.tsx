// src/renderer/components/common/Dropdown.tsx
// Menu déroulant réutilisable.
//
// Fonctionnalités :
// - fermeture lors d'un clic extérieur ;
// - fermeture avec Échap ;
// - navigation clavier avec Entrée/Espace ;
// - conservation facultative de la sélection de l'éditeur ;
// - personnalisation complète du bouton déclencheur.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

export interface DropdownProps {
  label: React.ReactNode;

  /** Classe CSS du bouton déclencheur. */
  buttonClassName?: string;

  /** Styles appliqués directement au bouton déclencheur. */
  buttonStyle?: React.CSSProperties;

  buttonId?: string;
  buttonTitle?: string;

  menuClassName?: string;
  menuStyle?: React.CSSProperties;

  containerStyle?: React.CSSProperties;
  containerClassName?: string;

  /**
   * Empêche le bouton déclencheur de retirer le focus de l'éditeur.
   *
   * Cette option est indispensable pour les menus Police et Taille :
   * sans elle, cliquer sur le bouton détruit la sélection avant que
   * l'utilisateur ne choisisse une valeur.
   */
  preserveSelection?: boolean;

  children: (
    close: () => void
  ) => React.ReactNode;
}

export function Dropdown({
  label,
  buttonClassName = 'dropdown-btn',
  buttonStyle,
  buttonId,
  buttonTitle,
  menuClassName = 'dropdown-menu',
  menuStyle,
  containerStyle,
  containerClassName = 'dropdown-container',
  preserveSelection = false,
  children
}: DropdownProps): React.ReactElement {
  const [open, setOpen] =
    useState(false);

  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const buttonRef =
    useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onDocumentMouseDown = (
      event: MouseEvent
    ): void => {
      const target = event.target;

      if (
        target instanceof Node &&
        !containerRef.current?.contains(target)
      ) {
        close();
      }
    };

    const onDocumentKeyDown = (
      event: KeyboardEvent
    ): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();

        /*
         * Le bouton ne reprend le focus que si la sélection de l'éditeur
         * n'a pas besoin d'être conservée.
         */
        if (!preserveSelection) {
          buttonRef.current?.focus();
        }
      }
    };

    document.addEventListener(
      'mousedown',
      onDocumentMouseDown
    );

    document.addEventListener(
      'keydown',
      onDocumentKeyDown
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        onDocumentMouseDown
      );

      document.removeEventListener(
        'keydown',
        onDocumentKeyDown
      );
    };
  }, [
    open,
    close,
    preserveSelection
  ]);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{
        position: 'relative',
        ...containerStyle
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        title={buttonTitle}
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        style={buttonStyle}
        onMouseDown={
          preserveSelection
            ? (event) => {
                /*
                 * Conserve le Range actif dans le contentEditable.
                 * Le clic continue ensuite normalement et ouvre le menu.
                 */
                event.preventDefault();
              }
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();

          setOpen(
            (currentOpen) =>
              !currentOpen
          );
        }}
      >
        {label}
      </button>

      <div
        className={`${menuClassName}${
          open ? ' show' : ''
        }`}
        style={menuStyle}
        role="menu"
        aria-hidden={!open}
      >
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

  /**
   * Empêche le clic de déplacer le focus hors de l'éditeur et de détruire
   * sa sélection avant l'application de la commande.
   */
  preserveSelection?: boolean;

  children: React.ReactNode;
}

export function DropdownItem({
  onSelect,
  className = 'dropdown-item',
  style,
  title,
  preserveSelection = false,
  children
}: DropdownItemProps): React.ReactElement {
  const activate = (): void => {
    onSelect();
  };

  return (
    <div
      className={className}
      style={style}
      title={title}
      role="menuitem"
      tabIndex={0}
      onMouseDown={
        preserveSelection
          ? (event) => {
              /*
               * Empêche Chromium de placer le focus sur l'élément du menu,
               * ce qui ferait disparaître la sélection du contentEditable.
               */
              event.preventDefault();
            }
          : undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        activate();
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }
      }}
    >
      {children}
    </div>
  );
}
