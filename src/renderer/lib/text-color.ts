// src/renderer/lib/text-color.ts
//
// Outils de couleur du texte pour les zones d'écriture (contentEditable).
//
// Principe :
// - toute couleur appliquée volontairement par l'utilisateur porte l'attribut
//   data-user-color="true" ;
// - stripAutomaticTextColors ne retire QUE les couleurs sans cette marque qui
//   correspondent à une couleur de thème ou de fiche World Building : ce sont
//   celles que Chromium ajoute tout seul (fusion de paragraphes,
//   copier-coller, effacement d'une mention).
//
// Une couleur choisie par l'utilisateur n'est donc jamais retirée, même si
// elle est identique à la couleur d'un thème (blanc pur, par exemple).

export interface SelectedTextPart {
  textNode: Text;
  startOffset: number;
  endOffset: number;
}

/** Marque posée sur les couleurs choisies par l'utilisateur. */
export const USER_COLOR_ATTRIBUTE = 'data-user-color';

/** Couleurs de texte des thèmes (variable --text-main de style.css). */
const THEME_TEXT_COLORS: readonly string[] = [
  '#f8fafc',
  '#0f172a',
  '#5c4033',
  '#e8ecff',
  '#eaf5ec',
  '#ffffff',
  '#4a1d2b',
  '#362a52',
  '#e3f6fb'
];

/** Couleurs par défaut des mentions World Building. */
const DEFAULT_WB_COLORS: readonly string[] = [
  '#ef4444',
  '#10b981',
  '#3b82f6',
  '#a855f7'
];

const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TD',
  'TH',
  'SECTION',
  'ARTICLE'
]);

// ---------------------------------------------------------------------------
// CONVERSION DES COULEURS
// ---------------------------------------------------------------------------

/**
 * Convertit une couleur CSS en clé « r,g,b » comparable.
 * Retourne null pour une couleur inconnue ou partiellement transparente.
 */
export function colorToRgbKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const color = value.trim().toLowerCase();

  if (color === 'white') {
    return '255,255,255';
  }

  if (color === 'black') {
    return '0,0,0';
  }

  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(color);

  if (shortHex) {
    return [shortHex[1], shortHex[2], shortHex[3]]
      .map((digit) => parseInt(digit + digit, 16))
      .join(',');
  }

  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(color);

  if (longHex) {
    return [longHex[1], longHex[2], longHex[3]]
      .map((pair) => parseInt(pair, 16))
      .join(',');
  }

  // Formes acceptées : rgb(r, g, b), rgba(r, g, b, a), rgb(r g b / a).
  // Les parenthèses sont écrites [(] et [)] pour résister au copier-coller.
  const rgb =
    /^rgba?[(]\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*(?:[,/]\s*([0-9.]+%?)\s*)?[)]$/.exec(
      color
    );

  if (rgb) {
    if (rgb[4] !== undefined) {
      const alpha = rgb[4].endsWith('%')
        ? parseFloat(rgb[4]) / 100
        : parseFloat(rgb[4]);

      if (alpha < 1) {
        return null;
      }
    }

    return [rgb[1], rgb[2], rgb[3]]
      .map((channel) => Math.round(parseFloat(channel)))
      .join(',');
  }

  return null;
}

/** Convertit une couleur CSS en notation #rrggbb. */
export function colorToHex(value: string | null | undefined): string | null {
  const key = colorToRgbKey(value);

  if (!key) {
    return null;
  }

  return (
    '#' +
    key
      .split(',')
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')
  );
}

// ---------------------------------------------------------------------------
// SÉLECTION
// ---------------------------------------------------------------------------

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  if (node instanceof HTMLElement) {
    return node;
  }

  return node.parentElement;
}

export function isInsideWorldBuildingMention(node: Node): boolean {
  const element = getElementFromNode(node);

  return Boolean(element?.closest('.wb-mention'));
}

/** Retourne les portions de nœuds texte couvertes par la sélection. */
export function getSelectedTextParts(
  range: Range,
  root: HTMLElement
): SelectedTextPart[] {
  const parts: SelectedTextPart[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const textLength = textNode.textContent?.length ?? 0;

    if (textLength > 0) {
      let intersects = false;

      try {
        intersects = range.intersectsNode(textNode);
      } catch {
        intersects = false;
      }

      if (intersects) {
        const startOffset =
          textNode === range.startContainer ? range.startOffset : 0;
        const endOffset =
          textNode === range.endContainer ? range.endOffset : textLength;

        const safeStart = Math.max(0, Math.min(startOffset, textLength));
        const safeEnd = Math.max(safeStart, Math.min(endOffset, textLength));

        if (safeEnd > safeStart) {
          parts.push({
            textNode,
            startOffset: safeStart,
            endOffset: safeEnd
          });
        }
      }
    }

    currentNode = walker.nextNode();
  }

  return parts;
}

// ---------------------------------------------------------------------------
// MANIPULATION DES ÉLÉMENTS COLORÉS
// ---------------------------------------------------------------------------

function isBlockElement(element: HTMLElement): boolean {
  return BLOCK_TAGS.has(element.tagName);
}

function hasInlineColor(element: HTMLElement): boolean {
  if (element.style.color !== '') {
    return true;
  }

  return element.tagName === 'FONT' && element.hasAttribute('color');
}

function cleanStyleAttribute(element: HTMLElement): void {
  const style = element.getAttribute('style');

  if (style !== null && style.trim() === '') {
    element.removeAttribute('style');
  }
}

function removeInlineColor(element: HTMLElement): void {
  if (element.style.color !== '') {
    element.style.removeProperty('color');
    cleanStyleAttribute(element);
  }

  if (element.tagName === 'FONT') {
    element.removeAttribute('color');
  }

  element.removeAttribute(USER_COLOR_ATTRIBUTE);
}

/** Un <span> ou <font> sans aucun attribut ne sert plus à rien. */
function isEmptyWrapper(element: HTMLElement): boolean {
  return (
    (element.tagName === 'SPAN' || element.tagName === 'FONT') &&
    element.attributes.length === 0
  );
}

function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode;

  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function fragmentHasContent(fragment: DocumentFragment): boolean {
  return (
    (fragment.textContent ?? '').length > 0 ||
    fragment.querySelector('br, img') !== null
  );
}

/** Supprime les coquilles vides laissées par extractContents(). */
function removeEmptyInlineShells(fragment: DocumentFragment): void {
  fragment
    .querySelectorAll<HTMLElement>('span, font, b, i, u, strong, em, mark')
    .forEach((element) => {
      if (
        (element.textContent ?? '').length === 0 &&
        element.querySelector('br, img') === null
      ) {
        element.remove();
      }
    });
}

/**
 * Découpe « ancestor » en trois : avant le nœud, le nœud, après le nœud.
 * Les parties avant/après gardent la mise en forme d'origine.
 */
function splitAround(ancestor: HTMLElement, node: Node): void {
  const parent = ancestor.parentNode;

  if (!parent) {
    return;
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(ancestor, 0);
  beforeRange.setEndBefore(node);
  const beforeFragment = beforeRange.extractContents();

  const afterRange = document.createRange();
  afterRange.setStartAfter(node);
  afterRange.setEnd(ancestor, ancestor.childNodes.length);
  const afterFragment = afterRange.extractContents();

  if (fragmentHasContent(beforeFragment)) {
    removeEmptyInlineShells(beforeFragment);
    const beforeClone = ancestor.cloneNode(false);
    beforeClone.appendChild(beforeFragment);
    parent.insertBefore(beforeClone, ancestor);
  }

  if (fragmentHasContent(afterFragment)) {
    removeEmptyInlineShells(afterFragment);
    const afterClone = ancestor.cloneNode(false);
    afterClone.appendChild(afterFragment);
    parent.insertBefore(afterClone, ancestor.nextSibling);
  }
}

/**
 * Sort un nœud texte de tous ses parents colorés (jusqu'au paragraphe).
 * Retourne true si une couleur a été retirée.
 */
function clearColorAroundTextNode(root: HTMLElement, textNode: Text): boolean {
  const path: HTMLElement[] = [];
  let outermostColored: HTMLElement | null = null;
  let element = textNode.parentElement;

  while (element && element !== root && !isBlockElement(element)) {
    if (element.classList.contains('wb-mention')) {
      return false;
    }

    path.push(element);

    if (hasInlineColor(element)) {
      outermostColored = element;
    }

    element = element.parentElement;
  }

  if (!outermostColored) {
    return false;
  }

  splitAround(outermostColored, textNode);

  const affected = path.slice(0, path.indexOf(outermostColored) + 1);

  affected.forEach((item) => removeInlineColor(item));
  affected.forEach((item) => {
    if (isEmptyWrapper(item)) {
      unwrapElement(item);
    }
  });

  return true;
}

// ---------------------------------------------------------------------------
// API PUBLIQUE
// ---------------------------------------------------------------------------

/**
 * Rend sa couleur automatique (celle du thème) au texte sélectionné.
 * La sélection est rétablie sur le même texte après l'opération.
 */
export function removeTextColorFromSelection(
  root: HTMLElement,
  options?: { skipWorldBuilding?: boolean }
): boolean {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);

  if (
    range.collapsed ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return false;
  }

  let parts = getSelectedTextParts(range, root);

  if (options?.skipWorldBuilding) {
    parts = parts.filter((part) => !isInsideWorldBuildingMention(part.textNode));
  }

  if (parts.length === 0) {
    return false;
  }

  const isolatedNodes: Text[] = [];
  let changed = false;

  // Du dernier au premier : les découpages n'invalident pas les positions
  // des portions précédentes.
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    let node = part.textNode;

    if (!node.isConnected) {
      continue;
    }

    if (part.endOffset < node.length) {
      node.splitText(part.endOffset);
    }

    if (part.startOffset > 0) {
      node = node.splitText(part.startOffset);
    }

    if (clearColorAroundTextNode(root, node)) {
      changed = true;
    }

    isolatedNodes.unshift(node);
  }

  const first = isolatedNodes[0];
  const last = isolatedNodes[isolatedNodes.length - 1];

  if (first && last && first.isConnected && last.isConnected) {
    const restoredRange = document.createRange();
    restoredRange.setStart(first, 0);
    restoredRange.setEnd(last, last.length);
    selection.removeAllRanges();
    selection.addRange(restoredRange);
  }

  return changed;
}

/**
 * Retire les couleurs ajoutées automatiquement par Chromium.
 *
 * - Les éléments marqués data-user-color ne sont jamais touchés.
 * - adoptColor : couleur que l'utilisateur vient de choisir sans sélection
 *   (curseur simple). Chromium crée alors lui-même l'élément coloré au
 *   moment de la frappe ; on le reconnaît à sa couleur et on lui pose la
 *   marque au lieu de le nettoyer.
 *
 * Seuls des attributs sont modifiés (aucun nœud déplacé) : la sélection et
 * le curseur ne bougent pas.
 */
export function stripAutomaticTextColors(
  root: HTMLElement,
  options?: { adoptColor?: string | null }
): boolean {
  const automaticColors = new Set<string>();

  [...THEME_TEXT_COLORS, ...DEFAULT_WB_COLORS].forEach((color) => {
    const key = colorToRgbKey(color);

    if (key) {
      automaticColors.add(key);
    }
  });

  // Couleurs personnalisées des fiches présentes dans le chapitre.
  root.querySelectorAll<HTMLElement>('.wb-mention').forEach((mention) => {
    const key = colorToRgbKey(window.getComputedStyle(mention).color);

    if (key) {
      automaticColors.add(key);
    }
  });

  const adoptKey = colorToRgbKey(options?.adoptColor);
  let changed = false;

  root
    .querySelectorAll<HTMLElement>('[style], font[color]')
    .forEach((element) => {
      if (element.closest('.wb-mention')) {
        return;
      }

      if (element.hasAttribute(USER_COLOR_ATTRIBUTE)) {
        return;
      }

      const styleKey = colorToRgbKey(element.style.color);
      const fontKey =
        element.tagName === 'FONT'
          ? colorToRgbKey(element.getAttribute('color'))
          : null;

      if (adoptKey && (styleKey === adoptKey || fontKey === adoptKey)) {
        element.setAttribute(USER_COLOR_ATTRIBUTE, 'true');
        changed = true;
        return;
      }

      if (styleKey && automaticColors.has(styleKey)) {
        element.style.removeProperty('color');
        cleanStyleAttribute(element);
        changed = true;
      }

      if (fontKey && automaticColors.has(fontKey)) {
        element.removeAttribute('color');
        changed = true;
      }
    });

  return changed;
}
