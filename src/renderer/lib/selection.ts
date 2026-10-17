// src/renderer/lib/selection.ts
//
// Sauvegarde et restauration de la sélection dans un contentEditable.
//
// Les traitements automatiques (surlignage des mentions World Building,
// marques du correcteur grammatical) ajoutent ou retirent des <span> dans
// l'éditeur. Ces mutations détruisent la sélection du navigateur.
//
// On mémorise donc la sélection complète (ancre + focus, donc aussi son sens)
// sous deux formes :
// - les nœuds DOM d'origine, utilisés tels quels s'ils sont toujours valides ;
// - une position "logique" qui compte le texte, les <br> et les débuts de
//   blocs. Elle reste stable tant que les mutations n'ajoutent que des
//   éléments en ligne, ce qui est le cas du surlignage et du correcteur.

interface SavedSelectionPoint {
  node: Node;
  offset: number;
  position: number;
}

export interface SavedSelection {
  anchor: SavedSelectionPoint;
  focus: SavedSelectionPoint;
}

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY',
  'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]);

function nodeWeight(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node as Text).length;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = (node as Element).tagName;

    if (tag === 'BR' || BLOCK_TAGS.has(tag)) {
      return 1;
    }
  }

  return 0;
}

function createWalker(root: HTMLElement): TreeWalker {
  return root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ALL);
}

function indexInParent(node: Node): number {
  let index = 0;
  let current = node.previousSibling;

  while (current) {
    index += 1;
    current = current.previousSibling;
  }

  return index;
}

/**
 * Convertit un point DOM (nœud + offset) en position logique.
 */
function computePosition(
  root: HTMLElement,
  node: Node,
  offset: number
): number | null {
  if (node !== root && !root.contains(node)) {
    return null;
  }

  const walker = createWalker(root);
  let accumulated = 0;

  if (node.nodeType === Node.TEXT_NODE) {
    let current = walker.nextNode();

    while (current) {
      if (current === node) {
        return accumulated + Math.min(offset, (node as Text).length);
      }

      accumulated += nodeWeight(current);
      current = walker.nextNode();
    }

    return null;
  }

  const children = node.childNodes;
  const stopBefore: Node | null =
    offset < children.length ? children[offset] : null;

  let passedContainer = node === root;
  let current = walker.nextNode();

  while (current) {
    if (stopBefore && current === stopBefore) {
      return accumulated;
    }

    if (!stopBefore) {
      if (current === node) {
        passedContainer = true;
      } else if (passedContainer && !node.contains(current)) {
        return accumulated;
      }
    }

    accumulated += nodeWeight(current);
    current = walker.nextNode();
  }

  return accumulated;
}

/**
 * Convertit une position logique en point DOM.
 */
function resolvePosition(
  root: HTMLElement,
  target: number
): { node: Node; offset: number } {
  const walker = createWalker(root);
  let accumulated = 0;
  let current = walker.nextNode();

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const length = (current as Text).length;

      if (target <= accumulated + length) {
        return {
          node: current,
          offset: Math.max(0, target - accumulated)
        };
      }
    } else if (accumulated >= target && current.parentNode) {
      return {
        node: current.parentNode,
        offset: indexInParent(current)
      };
    }

    accumulated += nodeWeight(current);
    current = walker.nextNode();
  }

  return {
    node: root,
    offset: root.childNodes.length
  };
}

function resolvePoint(
  root: HTMLElement,
  point: SavedSelectionPoint
): { node: Node; offset: number } {
  const { node, offset, position } = point;

  if (node.isConnected && (node === root || root.contains(node))) {
    const maximum =
      node.nodeType === Node.TEXT_NODE
        ? (node as Text).length
        : node.childNodes.length;

    if (
      offset <= maximum &&
      computePosition(root, node, offset) === position
    ) {
      return { node, offset };
    }
  }

  return resolvePosition(root, position);
}

/**
 * Mémorise la sélection courante si elle se trouve dans `root`.
 */
export function saveSelection(root: HTMLElement): SavedSelection | null {
  const selection = root.ownerDocument.defaultView?.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;

  if (
    !anchorNode ||
    !focusNode ||
    !root.contains(anchorNode) ||
    !root.contains(focusNode)
  ) {
    return null;
  }

  const anchorPosition = computePosition(root, anchorNode, anchorOffset);
  const focusPosition = computePosition(root, focusNode, focusOffset);

  if (anchorPosition === null || focusPosition === null) {
    return null;
  }

  return {
    anchor: {
      node: anchorNode,
      offset: anchorOffset,
      position: anchorPosition
    },
    focus: {
      node: focusNode,
      offset: focusOffset,
      position: focusPosition
    }
  };
}

/**
 * Restaure une sélection mémorisée par saveSelection().
 */
export function restoreSelection(
  root: HTMLElement,
  saved: SavedSelection | null
): void {
  if (!saved || !root.isConnected) {
    return;
  }

  const selection = root.ownerDocument.defaultView?.getSelection();

  if (!selection) {
    return;
  }

  try {
    const anchor = resolvePoint(root, saved.anchor);
    const focus = resolvePoint(root, saved.focus);

    selection.setBaseAndExtent(
      anchor.node,
      anchor.offset,
      focus.node,
      focus.offset
    );
  } catch {
    // Le contenu a trop changé : on laisse la sélection telle quelle.
  }
}

/**
 * Exécute une mutation du DOM en conservant la sélection de l'utilisateur.
 */
export function withPreservedSelection<T>(
  root: HTMLElement,
  operation: () => T
): T {
  const saved = saveSelection(root);

  try {
    return operation();
  } finally {
    if (saved) {
      restoreSelection(root, saved);
    }
  }
}