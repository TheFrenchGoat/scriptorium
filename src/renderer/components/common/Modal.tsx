// src/renderer/components/common/Modal.tsx
// Modale générique, reprenant exactement le balisage CSS existant
// (.modal / .modal-content / .modal-buttons).
//
// PORTAIL REACT (createPortal) : la modale est physiquement déplacée dans le
// DOM sous <body>, plutôt que rendue à l'endroit où <Modal> apparaît dans
// l'arborescence React.
//
// Cela garantit que son `position: fixed` reste toujours relatif à la fenêtre,
// même si un ancêtre du composant React utilise transform, filter ou
// perspective.
//
// ACCESSIBILITÉ ET GESTION DU FOCUS :
// - Échap ferme la dernière modale ouverte.
// - Entrée valide l'action principale depuis un champ <input>.
// - le focus et la sélection du contentEditable sont mémorisés à l'ouverture ;
// - ils sont restaurés à la fermeture de la modale.
//
// La restauration est particulièrement importante pour le minuteur : lorsque
// le bouton de fermeture ou de lancement disparaît avec la modale, le
// navigateur peut sinon laisser le focus sur <body>. Le texte reste alors
// parfois sélectionnable et supprimable, mais aucune frappe ne s'insère dans
// l'éditeur et le curseur d'écriture n'est plus visible.

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const modalStack: string[] = [];

interface FocusSnapshot {
  /**
   * Élément qui possédait le focus avant l'ouverture de la modale.
   */
  focusedElement: HTMLElement | null;

  /**
   * contentEditable auquel appartenait éventuellement la sélection.
   */
  editableElement: HTMLElement | null;

  /**
   * Copie de la sélection ou de la position du curseur dans le
   * contentEditable.
   */
  editableRange: Range | null;
}

/**
 * Retourne l'élément contentEditable contenant entièrement le Range.
 */
function getEditableContainingRange(range: Range): HTMLElement | null {
  const startNode = range.startContainer;

  const startElement =
    startNode.nodeType === Node.ELEMENT_NODE
      ? (startNode as Element)
      : startNode.parentElement;

  const editable = startElement?.closest<HTMLElement>(
    '[contenteditable="true"]'
  );

  if (!editable) return null;

  if (
    !editable.contains(range.startContainer) ||
    !editable.contains(range.endContainer)
  ) {
    return null;
  }

  return editable;
}

/**
 * Mémorise le focus courant ainsi que la sélection présente dans un
 * contentEditable.
 *
 * La sélection peut encore appartenir à l'éditeur alors que le bouton ayant
 * ouvert la modale possède déjà le focus. On ne se contente donc pas de
 * regarder document.activeElement.
 */
function captureFocusSnapshot(): FocusSnapshot {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return {
      focusedElement: activeElement,
      editableElement: null,
      editableRange: null
    };
  }

  const range = selection.getRangeAt(0);
  const editableElement = getEditableContainingRange(range);

  if (!editableElement) {
    return {
      focusedElement: activeElement,
      editableElement: null,
      editableRange: null
    };
  }

  return {
    focusedElement: activeElement,
    editableElement,
    editableRange: range.cloneRange()
  };
}

/**
 * Restaure en priorité le curseur ou la sélection du contentEditable.
 *
 * Si aucune sélection d'éditeur n'avait été mémorisée, le focus revient sur
 * l'élément qui le possédait avant l'ouverture de la modale.
 */
function restoreFocusSnapshot(snapshot: FocusSnapshot): void {
  const {
    focusedElement,
    editableElement,
    editableRange
  } = snapshot;

  if (
    editableElement &&
    editableRange &&
    editableElement.isConnected &&
    editableRange.startContainer.isConnected &&
    editableRange.endContainer.isConnected &&
    editableElement.contains(editableRange.startContainer) &&
    editableElement.contains(editableRange.endContainer)
  ) {
    try {
      /**
       * focus() est appelé avant de remettre le Range, car Chromium peut
       * déplacer le curseur lorsqu'un contentEditable récupère le focus.
       */
      editableElement.focus({ preventScroll: true });

      const selection =
        editableElement.ownerDocument.defaultView?.getSelection();

      if (selection) {
        selection.removeAllRanges();
        selection.addRange(editableRange);
      }

      return;
    } catch (error) {
      console.warn(
        'Impossible de restaurer la sélection de l’éditeur :',
        error
      );
    }
  }

  if (focusedElement?.isConnected) {
    try {
      focusedElement.focus({ preventScroll: true });
    } catch {
      /**
       * Certains éléments ne peuvent plus recevoir le focus après une
       * modification du DOM. Ce cas n'est pas bloquant.
       */
    }
  }
}

export interface ModalProps {
  open: boolean;
  title?: React.ReactNode;

  /**
   * Largeur du .modal-content.
   * Par défaut, la largeur définie dans le CSS est utilisée.
   */
  width?: number | string;

  /**
   * Hauteur maximale ; le contenu devient défilable au-delà.
   */
  maxHeight?: string;

  /**
   * Appelé avec Échap, un clic sur l'arrière-plan ou le bouton de fermeture.
   */
  onCancel?: () => void;

  /**
   * Appelé avec Entrée depuis un champ <input>.
   */
  onPrimary?: () => void;

  /**
   * Contenu rendu dans .modal-buttons.
   */
  footer?: React.ReactNode;

  children?: React.ReactNode;
}

export function Modal({
  open,
  title,
  width,
  maxHeight,
  onCancel,
  onPrimary,
  footer,
  children
}: ModalProps): React.ReactElement | null {
  const id = useId();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const focusSnapshotRef = useRef<FocusSnapshot | null>(null);

  /**
   * Les gestionnaires restent toujours à jour sans obliger l'effet clavier à
   * être recréé à chaque rendu.
   */
  const handlersRef = useRef({
    onCancel,
    onPrimary
  });

  handlersRef.current = {
    onCancel,
    onPrimary
  };

  useEffect(() => {
    if (!open) return;

    /**
     * La capture doit avoir lieu avant que la modale ne déplace le focus.
     */
    focusSnapshotRef.current = captureFocusSnapshot();

    modalStack.push(id);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Escape' &&
        event.key !== 'Enter'
      ) {
        return;
      }

      /**
       * Seule la dernière modale ouverte réagit au clavier.
       */
      if (modalStack[modalStack.length - 1] !== id) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handlersRef.current.onCancel?.();
        return;
      }

      /**
       * Entrée ne valide que depuis un input. Dans un textarea, Entrée doit
       * rester un retour à la ligne normal.
       */
      const activeElement = document.activeElement;

      if (
        activeElement instanceof HTMLInputElement &&
        handlersRef.current.onPrimary
      ) {
        event.preventDefault();
        event.stopPropagation();
        handlersRef.current.onPrimary();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    /**
     * Si aucun champ autoFocus n'a pris le focus, la boîte de dialogue
     * elle-même le reçoit. Cela évite que les raccourcis de l'éditeur restent
     * actifs derrière une modale visible.
     */
    const focusFrame = window.requestAnimationFrame(() => {
      const content = contentRef.current;

      if (!content) return;
      if (modalStack[modalStack.length - 1] !== id) return;

      const activeElement = document.activeElement;

      if (!activeElement || !content.contains(activeElement)) {
        content.focus({ preventScroll: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);

      /**
       * On retire la dernière occurrence de cet identifiant. Cette approche
       * reste sûre avec le double montage des effets en React StrictMode.
       */
      const index = modalStack.lastIndexOf(id);

      if (index !== -1) {
        modalStack.splice(index, 1);
      }

      const snapshot = focusSnapshotRef.current;
      focusSnapshotRef.current = null;

      if (!snapshot) return;

      /**
       * On attend que React ait réellement retiré la modale et son bouton
       * actuellement focalisé avant de restaurer le focus.
       */
      window.requestAnimationFrame(() => {
        /**
         * Si la même modale a été immédiatement rouverte, notamment pendant
         * le double passage des effets en développement, il ne faut pas
         * déplacer le focus derrière elle.
         */
        if (modalStack.includes(id)) return;

        /**
         * Une autre modale peut avoir été ouverte entre-temps. Dans ce cas,
         * elle est prioritaire et conserve le focus.
         */
        if (modalStack.length > 0) return;

        restoreFocusSnapshot(snapshot);
      });
    };
  }, [open, id]);

  if (!open) return null;

  const contentStyle: React.CSSProperties = {};

  if (width !== undefined) {
    contentStyle.width =
      typeof width === 'number'
        ? `${width}px`
        : width;
  }

  if (maxHeight) {
    contentStyle.maxHeight = maxHeight;
    contentStyle.overflowY = 'auto';
  }

  return createPortal(
    <div
      className="modal"
      role="presentation"
      style={{ display: 'flex' }}
      onMouseDown={(event) => {
        /**
         * Seul un clic direct sur l'arrière-plan ferme la modale. Les clics
         * dans son contenu ne doivent pas remonter jusqu'ici.
         */
        if (event.target === event.currentTarget) {
          handlersRef.current.onCancel?.();
        }
      }}
    >
      <div
        ref={contentRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={contentStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title !== undefined && <h3>{title}</h3>}

        {children}

        {footer && (
          <div className="modal-buttons">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
