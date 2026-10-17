/**
 * src/renderer/lib/history-caret.ts
 *
 * Place le curseur au bon endroit après un Ctrl+Z / Ctrl+Y en mode chapitre,
 * au lieu de l'envoyer à la fin du chapitre.
 *
 * Principe (comme dans Word) :
 *  1. Avant de remplacer le contenu, captureHistoryCaretState() mémorise le
 *     texte « à plat » de l'éditeur et la sélection (en positions logiques).
 *  2. Après le remplacement, placeCaretAfterHistoryJump() compare l'ancien et
 *     le nouveau texte (préfixe commun + suffixe commun) pour trouver la zone
 *     modifiée, puis place le curseur à la fin de cette zone :
 *       - annuler une frappe      : curseur là où la frappe avait commencé ;
 *       - rétablir une frappe     : curseur juste après le texte rétabli ;
 *       - annuler une suppression : curseur juste après le texte restauré.
 *  3. Si le texte n'a pas changé (annulation de gras, couleur...), la
 *     sélection est remise exactement au même endroit.
 *  4. L'éditeur reprend le focus et la page défile jusqu'au curseur si besoin.
 *
 * Positions logiques : 1 par caractère, 1 par <br>, 1 par début de bloc
 * (p, div, h1...). Module autonome : il ne dépend pas de selection.ts.
 */

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/** Marge (px) sous laquelle on considère que le curseur est hors de vue. */
const SCROLL_MARGIN = 24;

type Segment =
  | { kind: 'text'; node: Text; start: number; length: number }
  | { kind: 'br'; node: HTMLElement; start: number }
  | { kind: 'block'; node: HTMLElement; start: number };

interface Linearized {
  text: string;
  segments: Segment[];
}

interface DomPoint {
  node: Node;
  offset: number;
}

export interface HistoryCaretState {
  /** Texte « à plat » de l'éditeur avant le saut dans l'historique. */
  text: string;
  /** Sélection avant le saut, en positions logiques (null si hors éditeur). */
  selection: { anchor: number; focus: number } | null;
}

/* ------------------------------------------------------------------ */
/* Mise à plat du contenu                                              */
/* ------------------------------------------------------------------ */

function linearize(root: HTMLElement): Linearized {
  const segments: Segment[] = [];
  const parts: string[] = [];
  let position = 0;

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const length = textNode.data.length;
      if (length > 0) {
        segments.push({ kind: 'text', node: textNode, start: position, length });
        parts.push(textNode.data);
        position += length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (element.tagName === 'BR') {
      segments.push({ kind: 'br', node: element, start: position });
      parts.push('\n');
      position += 1;
      return;
    }
    if (element !== root && BLOCK_TAGS.has(element.tagName)) {
      segments.push({ kind: 'block', node: element, start: position });
      parts.push('\n');
      position += 1;
    }
    for (let child = element.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };

  visit(root);
  return { text: parts.join(''), segments };
}

function childIndex(node: Node): number {
  let index = 0;
  for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
    index += 1;
  }
  return index;
}

function depthOf(node: Node, root: HTMLElement): number {
  let depth = 0;
  for (let current = node.parentNode; current && current !== root; current = current.parentNode) {
    depth += 1;
  }
  return depth;
}

/* ------------------------------------------------------------------ */
/* Conversion position logique <-> point DOM                           */
/* ------------------------------------------------------------------ */

function pointFromPosition(root: HTMLElement, lin: Linearized, target: number): DomPoint {
  const position = Math.max(0, Math.min(target, lin.text.length));

  // 1. Dans un nœud texte. À la frontière entre deux nœuds texte, on préfère
  //    le moins imbriqué (pour ne pas entrer dans une mention surlignée) et,
  //    à égalité, la fin du nœud précédent (on prolonge sa mise en forme).
  let best: { node: Text; offset: number; depth: number; ending: boolean } | null = null;
  for (const segment of lin.segments) {
    if (segment.start > position) break;
    if (segment.kind !== 'text') continue;
    const end = segment.start + segment.length;
    if (position > end) continue;
    if (position > segment.start && position < end) {
      return { node: segment.node, offset: position - segment.start };
    }
    const ending = position === end;
    const depth = depthOf(segment.node, root);
    if (!best || depth < best.depth || (depth === best.depth && ending && !best.ending)) {
      best = { node: segment.node, offset: position - segment.start, depth, ending };
    }
  }
  if (best) return { node: best.node, offset: best.offset };

  // 2. Début d'un bloc vide ou qui commence par un élément (ex. <p><br></p>).
  for (const segment of lin.segments) {
    if (segment.start > position) break;
    if (segment.kind === 'block' && segment.start + 1 === position) {
      return { node: segment.node, offset: 0 };
    }
  }

  // 3. Juste avant ou juste après un <br>.
  for (const segment of lin.segments) {
    if (segment.start > position) break;
    if (segment.kind !== 'br') continue;
    const parent = segment.node.parentNode;
    if (!parent) continue;
    if (segment.start === position) {
      return { node: parent, offset: childIndex(segment.node) };
    }
    if (segment.start + 1 === position) {
      const index = childIndex(segment.node);
      // Un <br> final ne crée pas de ligne visible : on reste devant lui.
      const isTrailing = segment.node.nextSibling === null;
      return { node: parent, offset: isTrailing ? index : index + 1 };
    }
  }

  // 4. Secours : fin de l'éditeur.
  return { node: root, offset: root.childNodes.length };
}

function positionFromPoint(
  root: HTMLElement,
  lin: Linearized,
  node: Node,
  offset: number,
): number | null {
  if (node !== root && !root.contains(node)) return null;

  if (node.nodeType === Node.TEXT_NODE) {
    for (const segment of lin.segments) {
      if (segment.kind === 'text' && segment.node === node) {
        return segment.start + Math.min(offset, segment.length);
      }
    }
  }

  const point = document.createRange();
  try {
    point.setStart(node, offset);
  } catch {
    return null;
  }
  point.collapse(true);

  // Premier segment qui commence au niveau du point ou après lui.
  const boundary = document.createRange();
  for (const segment of lin.segments) {
    try {
      if (segment.kind === 'text') boundary.setStart(segment.node, 0);
      else boundary.setStartBefore(segment.node);
      boundary.collapse(true);
      if (boundary.compareBoundaryPoints(Range.START_TO_START, point) >= 0) {
        return segment.start;
      }
    } catch {
      // nœud détaché : on l'ignore
    }
  }
  return lin.text.length;
}

/* ------------------------------------------------------------------ */
/* Zone modifiée entre deux états                                      */
/* ------------------------------------------------------------------ */

/**
 * Renvoie la position (dans le nouveau texte) où placer le curseur : la fin
 * de la zone qui diffère entre l'ancien et le nouveau texte.
 * hint = position du curseur dans l'ancien texte ; elle sert à lever
 * l'ambiguïté quand le texte se répète (ex. « le le chat »).
 */
function caretAfterChange(oldText: string, newText: string, hint: number | null): number {
  const oldLength = oldText.length;
  const newLength = newText.length;
  const shortest = Math.min(oldLength, newLength);

  let prefix = 0;
  while (prefix < shortest && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < shortest &&
    oldText.charCodeAt(oldLength - 1 - suffix) === newText.charCodeAt(newLength - 1 - suffix)
  ) {
    suffix += 1;
  }

  if (prefix + suffix < shortest) {
    // Remplacement : la zone modifiée du nouveau texte va de prefix à newLength - suffix.
    return newLength - suffix;
  }

  // Insertion ou suppression pure : le point de coupure peut « glisser »
  // entre minSplit et maxSplit quand le texte autour se répète.
  const delta = Math.abs(newLength - oldLength);
  const grew = newLength > oldLength;
  const minSplit = shortest - suffix;
  const maxSplit = prefix;
  let split = maxSplit;
  if (hint !== null) {
    const wanted = grew ? hint : hint - delta;
    split = Math.max(minSplit, Math.min(maxSplit, wanted));
  }
  return grew ? split + delta : split;
}

/* ------------------------------------------------------------------ */
/* Défilement jusqu'au curseur                                         */
/* ------------------------------------------------------------------ */

function findScrollContainer(start: HTMLElement): HTMLElement | null {
  for (let element: HTMLElement | null = start; element; element = element.parentElement) {
    const overflowY = window.getComputedStyle(element).overflowY;
    const scrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (scrollable && element.scrollHeight > element.clientHeight) return element;
  }
  return null;
}

function caretRect(root: HTMLElement, selection: Selection): DOMRect | null {
  const node = selection.focusNode;
  if (!node) return null;

  const range = document.createRange();
  try {
    range.setStart(node, selection.focusOffset);
  } catch {
    return null;
  }
  range.collapse(true);
  const rect = range.getClientRects().item(0);
  if (rect) return rect;

  // Curseur entre deux éléments (ligne vide...) : boîte de l'élément voisin.
  let element: Element | null;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes.item(selection.focusOffset) ?? node.lastChild;
    element = child && child.nodeType === Node.ELEMENT_NODE ? (child as Element) : (node as Element);
  } else {
    element = node.parentElement;
  }
  if (!element || element === root) return null;
  return element.getBoundingClientRect();
}

function scrollCaretIntoView(root: HTMLElement, selection: Selection): void {
  const rect = caretRect(root, selection);
  if (!rect) return;

  const scroller = findScrollContainer(root);
  const box = scroller ? scroller.getBoundingClientRect() : null;
  const viewTop = box ? box.top : 0;
  const viewBottom = box ? box.bottom : window.innerHeight;

  const visible = rect.top >= viewTop + SCROLL_MARGIN && rect.bottom <= viewBottom - SCROLL_MARGIN;
  if (visible) return;

  // On amène le curseur au tiers supérieur de la zone visible.
  const delta = rect.top - (viewTop + (viewBottom - viewTop) / 3);
  if (scroller) scroller.scrollTop += delta;
  else window.scrollBy(0, delta);
}

/* ------------------------------------------------------------------ */
/* API publique                                                        */
/* ------------------------------------------------------------------ */

/** À appeler AVANT de remplacer le contenu de l'éditeur (undo / redo). */
export function captureHistoryCaretState(root: HTMLElement): HistoryCaretState {
  const lin = linearize(root);
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) {
    return { text: lin.text, selection: null };
  }
  const anchor = positionFromPoint(root, lin, selection.anchorNode, selection.anchorOffset);
  const focus = positionFromPoint(root, lin, selection.focusNode, selection.focusOffset);
  return {
    text: lin.text,
    selection: anchor !== null && focus !== null ? { anchor, focus } : null,
  };
}

/** À appeler APRÈS le remplacement du contenu (et après highlight()). */
export function placeCaretAfterHistoryJump(root: HTMLElement, before: HistoryCaretState): void {
  const lin = linearize(root);
  let anchor: number;
  let focus: number;

  if (before.text === lin.text) {
    // Seule la mise en forme a changé : même sélection qu'avant.
    if (before.selection) {
      anchor = before.selection.anchor;
      focus = before.selection.focus;
    } else {
      anchor = lin.text.length;
      focus = anchor;
    }
  } else {
    const hint = before.selection ? before.selection.focus : null;
    anchor = caretAfterChange(before.text, lin.text, hint);
    focus = anchor;
  }

  const anchorPoint = pointFromPosition(root, lin, anchor);
  const focusPoint = focus === anchor ? anchorPoint : pointFromPosition(root, lin, focus);

  root.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;

  try {
    selection.setBaseAndExtent(
      anchorPoint.node,
      anchorPoint.offset,
      focusPoint.node,
      focusPoint.offset,
    );
  } catch {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  scrollCaretIntoView(root, selection);
}
