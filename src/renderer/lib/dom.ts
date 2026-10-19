// src/renderer/lib/dom.ts
// Utilitaires DOM partagés par l'éditeur : position du curseur dans un
// contentEditable, échappement, conversion HTML -> texte, remplacement sûr
// (nœuds texte uniquement), et debounce typé.
//
// Règle du projet : aucune barre oblique inverse suivie d'une parenthèse ou
// d'un crochet dans ce fichier.

// ---------------------------------------------------------------------------
// DEBOUNCE
// ---------------------------------------------------------------------------

/**
 * Fonction différée. Elle s'appelle comme avant, mais offre aussi :
 * - cancel() : annule l'appel en attente ;
 * - flush() : exécute tout de suite l'appel en attente, s'il y en a un ;
 * - pending() : indique si un appel est en attente.
 */
export type Debounced<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
};

export function debounce<A extends unknown[]>(
  func: (...args: A) => void,
  wait: number
): Debounced<A> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | null = null;

  const run = (): void => {
    timeout = undefined;
    const args = lastArgs;
    lastArgs = null;
    if (args) func(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(run, wait);
  }) as Debounced<A>;

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    lastArgs = null;
  };

  debounced.flush = () => {
    if (!timeout) return;
    clearTimeout(timeout);
    run();
  };

  debounced.pending = () => timeout !== undefined;

  return debounced;
}

// ---------------------------------------------------------------------------
// ÉCHAPPEMENT
// ---------------------------------------------------------------------------

/** Échappement générique, pour toute valeur (nom de fiche, icône libre...)
 *  injectée dans un attribut ou un fragment HTML. */
export function escapeHtmlAttr(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Caractères spéciaux des expressions régulières (la barre oblique inverse est le code 92). */
const BACKSLASH = String.fromCharCode(92);
const REGEXP_SPECIAL_CHARS = '.*+?^$|{}()[]' + BACKSLASH;

/** Échappe un texte pour l'utiliser tel quel dans une expression régulière. */
export function escapeRegExp(str: string): string {
  let result = '';
  for (const char of String(str)) {
    result += REGEXP_SPECIAL_CHARS.includes(char) ? BACKSLASH + char : char;
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/**
 * Analyse un fragment HTML sans l'exécuter.
 * Un élément template ne charge aucune image et n'exécute aucun gestionnaire
 * (onerror, onload...), contrairement à une div créée par le document.
 */
function parseHtmlFragment(html: string | undefined | null): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return template;
}

export function stripHtmlToText(html: string | undefined | null): string {
  return parseHtmlFragment(html).content.textContent || '';
}

// --- UTILITAIRES CURSEUR ---

/**
 * Position du curseur, en nombre de caractères depuis le début de l'élément.
 * Retourne 0 si le curseur n'est pas dans l'élément.
 */
export function getCaretCharacterOffsetWithin(element: HTMLElement): number {
  const sel = element.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  if (!element.contains(range.endContainer)) return 0;

  try {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  } catch {
    return 0;
  }
}

/**
 * Place le curseur à `offset` caractères du début de l'élément.
 * Si la position dépasse la longueur du texte, le curseur va à la fin
 * de l'élément (et non plus après lui, comme auparavant).
 */
export function setCaretPosition(element: HTMLElement, offset: number): void {
  if (!(offset >= 0)) return;

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let placed = false;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.nodeValue?.length ?? 0;

    if (remaining <= length) {
      range.setStart(node, remaining);
      placed = true;
      break;
    }

    remaining -= length;
  }

  if (!placed) {
    range.selectNodeContents(element);
    range.collapse(false);
  } else {
    range.collapse(true);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

export function placeCaretAtEnd(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Remplace toutes les occurrences d'une chaîne dans un fragment HTML, en ne
 *  touchant qu'aux nœuds texte (jamais aux balises). Réutilisé pour le
 *  remplacement dans le chapitre ouvert ET dans les chapitres non affichés. */
export function replaceInHtmlString(
  html: string | undefined,
  findStr: string,
  repStr: string
): { html: string; count: number } {
  const source = html || '';

  // Une recherche vide remplacerait entre chaque caractère : on l'ignore.
  if (!findStr) return { html: source, count: 0 };

  const template = parseHtmlFragment(source);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodesToUpdate: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue?.includes(findStr)) nodesToUpdate.push(node);
  }

  if (nodesToUpdate.length === 0) return { html: source, count: 0 };

  let count = 0;
  nodesToUpdate.forEach((n) => {
    const parts = (n.nodeValue ?? '').split(findStr);
    count += parts.length - 1;
    n.nodeValue = parts.join(repStr);
  });

  return { html: template.innerHTML, count };
}
