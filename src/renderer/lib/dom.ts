// src/renderer/lib/dom.ts
// Utilitaires DOM partagés par l'éditeur : position du curseur dans un
// contentEditable, échappement, conversion HTML -> texte, remplacement sûr
// (nœuds texte uniquement), et debounce typé.

export function debounce<A extends unknown[]>(
  func: (...args: A) => void,
  wait: number
): (...args: A) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/** Échappement générique, pour toute valeur (nom de fiche, icône libre...)
 *  injectée dans un attribut ou un fragment HTML. */
export function escapeHtmlAttr(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripHtmlToText(html: string | undefined | null): string {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

// --- UTILITAIRES CURSEUR ---

export function getCaretCharacterOffsetWithin(element: HTMLElement): number {
  let caretOffset = 0;
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  const sel = win?.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preCaretRange.toString().length;
  }
  return caretOffset;
}

export function setCaretPosition(element: HTMLElement, offset: number): void {
  const createRange = (node: Node, chars: { count: number }, range?: Range): Range => {
    let currentRange = range;
    if (!currentRange) {
      currentRange = document.createRange();
      currentRange.selectNode(node);
      currentRange.setStart(node, 0);
    }
    if (chars.count === 0) {
      currentRange.setEnd(node, chars.count);
    }
    if (node && chars.count > 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (length < chars.count) {
          chars.count -= length;
        } else {
          currentRange.setEnd(node, chars.count);
          chars.count = 0;
        }
      } else {
        for (let lp = 0; lp < node.childNodes.length; lp++) {
          currentRange = createRange(node.childNodes[lp], chars, currentRange);
          if (chars.count === 0) break;
        }
      }
    }
    return currentRange;
  };

  if (offset >= 0) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = createRange(element, { count: offset });
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
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
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html || '';

  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
  const nodesToUpdate: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue?.includes(findStr)) nodesToUpdate.push(node);
  }

  let count = 0;
  nodesToUpdate.forEach((n) => {
    const value = n.nodeValue ?? '';
    count += value.split(findStr).length - 1;
    n.nodeValue = value.split(findStr).join(repStr);
  });

  return { html: tempDiv.innerHTML, count };
}
