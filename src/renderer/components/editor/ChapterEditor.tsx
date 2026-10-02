// src/renderer/components/editor/ChapterEditor.tsx
//
// Composant impératif du contentEditable du chapitre.
//
// React ne pilote que le montage et le démontage du composant. Le contenu
// éditable est ensuite manipulé directement par le navigateur et par le
// contrôleur.
//
// Ce composant prend également en charge la copie et le collage afin de :
// - copier uniquement la sélection réelle ;
// - éviter les lignes vides ajoutées autour de la sélection ;
// - conserver l'emplacement du collage pendant la désinfection asynchrone ;
// - empêcher le contenu collé de dépasser horizontalement de la page.

import React, { useEffect, useRef } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties
} from 'react';
import type { EditorController } from './useEditorController';

export interface ChapterEditorProps {
  controller: EditorController;
  chapterName: string;
  initialHtml: string;
  placeholder: string;
  nativeSpellcheck: boolean;
  zoom: number;
}

/**
 * Vérifie que la sélection appartient réellement à l'éditeur.
 *
 * Une sélection globale peut encore exister dans window.getSelection()
 * alors que l'utilisateur a cliqué ailleurs. Il ne faut jamais copier,
 * supprimer ou insérer du contenu si le Range n'appartient pas à cet
 * éditeur.
 */
function isRangeInsideEditor(editor: HTMLElement, range: Range): boolean {
  return (
    editor.contains(range.startContainer) &&
    editor.contains(range.endContainer)
  );
}

/**
 * Supprime uniquement les nœuds texte blancs ajoutés à la racine du
 * fragment HTML.
 *
 * On ne fait volontairement pas de trim() sur le texte sélectionné :
 * les espaces réellement sélectionnés par l'utilisateur doivent être
 * conservés. Cette fonction ne touche qu'aux espaces de mise en forme
 * HTML situés autour du fragment.
 */
function removeRootWhitespace(fragment: DocumentFragment): void {
  while (
    fragment.firstChild?.nodeType === Node.TEXT_NODE &&
    !(fragment.firstChild.textContent || '').trim()
  ) {
    fragment.removeChild(fragment.firstChild);
  }

  while (
    fragment.lastChild?.nodeType === Node.TEXT_NODE &&
    !(fragment.lastChild.textContent || '').trim()
  ) {
    fragment.removeChild(fragment.lastChild);
  }
}

/**
 * Retire un éventuel bloc vide ajouté au début ou à la fin par Chromium
 * lors de la copie d'une sélection située à la limite de deux paragraphes.
 *
 * Le bloc n'est retiré que si le texte brut confirme que la sélection ne
 * commence ou ne se termine pas réellement par un retour à la ligne.
 */
function removeUnselectedEmptyEdgeBlocks(
  container: HTMLElement,
  plainText: string
): void {
  const isEmptyBlock = (node: ChildNode | null): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;

    const tag = node.tagName;
    if (tag !== 'DIV' && tag !== 'P') return false;

    const clone = node.cloneNode(true) as HTMLElement;

    clone
      .querySelectorAll('br, wbr')
      .forEach((element) => element.remove());

    return (clone.textContent || '').trim() === '';
  };

  if (!plainText.startsWith('\n')) {
    while (isEmptyBlock(container.firstChild)) {
      container.firstChild.remove();
    }
  }

  if (!plainText.endsWith('\n')) {
    while (isEmptyBlock(container.lastChild)) {
      container.lastChild.remove();
    }
  }
}

/**
 * Certains presse-papiers placent le véritable fragment copié entre les
 * marqueurs StartFragment et EndFragment.
 *
 * On extrait uniquement cette partie lorsqu'elle existe afin de ne pas
 * insérer les balises html/head/body ou les espaces de mise en forme
 * fournis par l'application source.
 */
function extractClipboardHtmlFragment(html: string): string {
  const startMarker = '<!--StartFragment-->';
  const endMarker = '<!--EndFragment-->';

  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);

  if (start !== -1 && end !== -1 && end >= start) {
    return html.slice(start + startMarker.length, end);
  }

  return html;
}

/**
 * Applique des contraintes aux éléments qui peuvent imposer une largeur
 * supérieure à celle de la feuille.
 *
 * Les styles sont posés directement sur les éléments afin qu'ils restent
 * valables après sauvegarde, fermeture puis réouverture du chapitre.
 */
function constrainWideContent(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>('img, video, canvas, svg, iframe')
    .forEach((element) => {
      element.style.maxWidth = '100%';
      element.style.height = 'auto';
    });

  root.querySelectorAll<HTMLElement>('pre').forEach((element) => {
    element.style.maxWidth = '100%';
    element.style.whiteSpace = 'pre-wrap';
    element.style.overflowWrap = 'anywhere';
    element.style.wordBreak = 'break-word';
  });

  root.querySelectorAll<HTMLElement>('table').forEach((element) => {
    element.style.maxWidth = '100%';
    element.style.tableLayout = 'fixed';
    element.style.overflowWrap = 'anywhere';
    element.style.wordBreak = 'break-word';
  });

  root
    .querySelectorAll<HTMLElement>('td, th, code, a')
    .forEach((element) => {
      element.style.maxWidth = '100%';
      element.style.overflowWrap = 'anywhere';
      element.style.wordBreak = 'break-word';
    });
}

/**
 * Crée un fragment DOM à partir du HTML désinfecté.
 */
function createHtmlFragment(
  documentRef: Document,
  html: string
): DocumentFragment {
  const template = documentRef.createElement('template');
  template.innerHTML = html;

  constrainWideContent(template.content);

  return template.content;
}

/**
 * Place le curseur immédiatement après le dernier nœud inséré.
 */
function placeCaretAfterNode(node: Node): void {
  const documentRef: Document = node.ownerDocument ?? document;
  const selection = documentRef.defaultView?.getSelection();

  if (!selection || !node.parentNode) return;

  const range = documentRef.createRange();
  range.setStartAfter(node);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Place le curseur juste après un marqueur temporaire.
 *
 * Cela permet à l'utilisateur de continuer à écrire pendant que le HTML du
 * presse-papiers est désinfecté par le processus principal.
 */
function placeCaretAfterMarker(marker: Comment): void {
  const documentRef = marker.ownerDocument;
  const selection = documentRef.defaultView?.getSelection();

  if (!selection || !marker.parentNode) return;

  const range = documentRef.createRange();
  range.setStartAfter(marker);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

const editorStyle: CSSProperties = {
  /**
   * Nécessaire dans un parent flex : sans minWidth: 0, la largeur minimale
   * intrinsèque d'un mot ou d'un élément très long peut agrandir la feuille.
   */
  minWidth: 0,

  /**
   * La hauteur doit suivre le contenu. Elle ne doit pas devenir une hauteur
   * fixe après certaines manipulations ou certains collages.
   */
  height: 'auto',

  /**
   * Évite l'étirement vertical provoqué par align-items: stretch dans le
   * conteneur flex.
   */
  alignSelf: 'flex-start',

  /**
   * Coupe les URL, mots ou chaînes sans espaces qui seraient plus larges que
   * la zone d'écriture.
   */
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',

  /**
   * Filet de sécurité visuel : aucun élément ne doit être dessiné en dehors
   * des limites horizontales de la feuille.
   */
  overflowX: 'hidden'
};

export function ChapterEditor({
  controller,
  chapterName,
  initialHtml,
  placeholder,
  nativeSpellcheck,
  zoom
}: ChapterEditorProps): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;

    editor.innerHTML = initialHtml;
    editor.style.zoom = String(zoom);

    // `placeholder` n'est pas un attribut HTML standard sur un <div>.
    // Le CSS #editor:empty:before utilise néanmoins cet attribut.
    editor.setAttribute('placeholder', placeholder);

    // Corrige également les anciens contenus déjà sauvegardés qui peuvent
    // contenir des images, tableaux ou blocs préformatés trop larges.
    constrainWideContent(editor);

    /**
     * Les deux parents sont des éléments flex. min-width: 0 est indispensable
     * pour autoriser leur rétrécissement sous la largeur intrinsèque de leur
     * contenu.
     */
    const editorArea = editor.closest<HTMLElement>('.editor-area');
    const scrollContainer = editor.closest<HTMLElement>(
      '.editor-scroll-container'
    );

    const previousEditorAreaMinWidth = editorArea?.style.minWidth ?? '';
    const previousContainerMinWidth = scrollContainer?.style.minWidth ?? '';
    const previousContainerOverflowX =
      scrollContainer?.style.overflowX ?? '';
    const previousContainerAlignItems =
      scrollContainer?.style.alignItems ?? '';

    if (editorArea) {
      editorArea.style.minWidth = '0';
    }

    if (scrollContainer) {
      scrollContainer.style.minWidth = '0';

      // Si un contenu externe ne peut malgré tout pas être replié, le
      // débordement reste contenu dans la zone de défilement et ne sort
      // jamais de l'application.
      scrollContainer.style.overflowX = 'auto';

      // Empêche la feuille de s'étirer verticalement à la hauteur complète
      // du conteneur.
      scrollContainer.style.alignItems = 'flex-start';
    }

    controller.attachEditor(editor);
    controller.onChapterMounted(chapterName);

    return () => {
      controller.attachEditor(null);

      if (editorArea) {
        editorArea.style.minWidth = previousEditorAreaMinWidth;
      }

      if (scrollContainer) {
        scrollContainer.style.minWidth = previousContainerMinWidth;
        scrollContainer.style.overflowX = previousContainerOverflowX;
        scrollContainer.style.alignItems = previousContainerAlignItems;
      }
    };

    // chapterName est également utilisé comme key par le parent. Chaque
    // changement de chapitre provoque donc un démontage/remontage complet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Copie exactement le Range sélectionné.
   *
   * On ne copie pas innerHTML de l'éditeur ou du paragraphe parent, car cela
   * inclurait les lignes et blocs situés autour de la sélection.
   */
  const handleCopy = (
    event: ReactClipboardEvent<HTMLDivElement>
  ): void => {
    const editor = ref.current;
    const selection = window.getSelection();

    if (
      !editor ||
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed
    ) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!isRangeInsideEditor(editor, range)) {
      return;
    }

    const plainText = range.toString();
    const copiedFragment = range.cloneContents();

    removeRootWhitespace(copiedFragment);

    const temporaryContainer = document.createElement('div');
    temporaryContainer.appendChild(copiedFragment);

    removeUnselectedEmptyEdgeBlocks(
      temporaryContainer,
      plainText
    );

    event.preventDefault();

    event.clipboardData.setData('text/plain', plainText);
    event.clipboardData.setData(
      'text/html',
      temporaryContainer.innerHTML
    );
  };

  /**
   * Colle le contenu à l'emplacement exact où l'événement paste a eu lieu.
   *
   * La désinfection HTML est asynchrone. Utiliser document.execCommand après
   * le await insérerait le texte à la position courante du curseur, qui peut
   * avoir changé entre-temps.
   *
   * Un commentaire invisible est donc inséré immédiatement dans le DOM. Il
   * sert de marqueur stable pendant la désinfection.
   */
  const handlePaste = (
    event: ReactClipboardEvent<HTMLDivElement>
  ): void => {
    const editor = ref.current;
    const selection = window.getSelection();

    if (
      !editor ||
      !selection ||
      selection.rangeCount === 0
    ) {
      return;
    }

    const selectedRange = selection.getRangeAt(0);

    if (!isRangeInsideEditor(editor, selectedRange)) {
      return;
    }

    event.preventDefault();

    // Les données du presse-papiers ne sont garanties que pendant
    // l'événement. Elles doivent être copiées avant de démarrer l'opération
    // asynchrone.
    const clipboardHtml = event.clipboardData.getData('text/html');
    const clipboardPlain = event.clipboardData.getData('text/plain');

    const documentRef = editor.ownerDocument;

    /**
     * On supprime immédiatement la sélection, comme lors d'un collage natif,
     * puis on pose un marqueur invisible à l'endroit exact de l'insertion.
     */
    const marker = documentRef.createComment(
      'scriptorium-paste-position'
    );

    const insertionRange = selectedRange.cloneRange();
    insertionRange.deleteContents();
    insertionRange.insertNode(marker);

    placeCaretAfterMarker(marker);
    editor.focus();

    void (async () => {
      let sanitizedHtml = '';

      if (clipboardHtml) {
        try {
          const exactFragment =
            extractClipboardHtmlFragment(clipboardHtml);

          sanitizedHtml = await window.api.sanitizeHtml(
            exactFragment
          );
        } catch (error) {
          console.error(
            'Échec de la désinfection du collage, repli en texte brut :',
            error
          );
        }
      }

      /**
       * Le chapitre peut avoir été fermé ou remplacé pendant l'attente. Dans
       * ce cas, le marqueur n'appartient plus au document et il ne faut rien
       * insérer dans le nouveau chapitre.
       */
      if (
        !marker.isConnected ||
        !editor.isConnected ||
        !editor.contains(marker)
      ) {
        return;
      }

      const finalRange = documentRef.createRange();
      finalRange.setStartBefore(marker);
      finalRange.collapse(true);

      let fragment: DocumentFragment;

      if (sanitizedHtml.trim()) {
        fragment = createHtmlFragment(
          documentRef,
          sanitizedHtml
        );
      } else {
        fragment = documentRef.createDocumentFragment();

        /**
         * Le texte brut est inséré sous forme de vrai nœud texte et non sous
         * forme de HTML fabriqué avec des <br>. Avec white-space: pre-wrap,
         * les retours à la ligne sont correctement affichés sans générer de
         * blocs vides supplémentaires.
         */
        fragment.appendChild(
          documentRef.createTextNode(clipboardPlain)
        );
      }

      const lastInsertedNode = fragment.lastChild;

      marker.parentNode?.removeChild(marker);

      if (lastInsertedNode) {
        finalRange.insertNode(fragment);
        placeCaretAfterNode(lastInsertedNode);
      } else {
        const currentSelection =
          documentRef.defaultView?.getSelection();

        if (currentSelection) {
          currentSelection.removeAllRanges();
          currentSelection.addRange(finalRange);
        }
      }

      editor.normalize();
      constrainWideContent(editor);
      editor.focus();

      /**
       * Une insertion manuelle avec Range n'émet pas automatiquement
       * d'événement input. On appelle donc explicitement le contrôleur pour
       * synchroniser :
       * - le HTML du chapitre ;
       * - les statistiques ;
       * - l'historique ;
       * - la sauvegarde ;
       * - le surlignage ;
       * - la vérification grammaticale.
       */
      controller.handleInput();
    })();
  };

  return (
    <div
      ref={ref}
      id="editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck={nativeSpellcheck}
      style={editorStyle}
      onInput={() => controller.handleInput()}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onClick={(event) => controller.handleEditorClick(event)}
    />
  );
}
