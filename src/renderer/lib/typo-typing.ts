// src/renderer/lib/typo-typing.ts
// Typographie pendant la frappe (etape 2d) : branchement dans l'editeur.
//
// Appele quand une touche est enfoncee, AVANT son insertion par le
// navigateur (comme les remplacements automatiques, voir auto-replace.ts).
// Si la touche doit etre ecrite autrement (shared/typography-typing.ts),
// le texte est modifie ici ; l'appelant annule alors la touche
// (preventDefault). Le texte colle n'est jamais modifie.
// revertTypingUndo() remet ce que l'auteur a tape (Ctrl+Z juste apres).

import type { TypoLanguage, TypoSpacing } from '../../shared/typography';
import { TYPING_CONTEXT_LENGTH, typingFix } from '../../shared/typography-typing';
import { revertAutoReplace, type AutoReplaceUndo } from './auto-replace';

/** Touches examinees : toutes les autres sont inserees sans calcul. */
const TYPING_KEYS = String.fromCharCode(39, 34) + '.:;!? ';

/** Elements qui terminent un paragraphe ou une ligne. */
const BLOCK_TAGS = new Set<string>([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'TD', 'TH', 'BR', 'HR'
]);

interface CaretSpot {
  /** Noeud texte ou ecrire, ou null s'il faut en creer un. */
  node: Text | null;
  offset: number;
  /** Ou creer le noeud texte (si node est null). */
  parent: Node;
  index: number;
  /** Texte du paragraphe avant le curseur. */
  before: string;
}

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);
}

function previousInEditor(editor: HTMLElement, node: Node): Node | null {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  walker.currentNode = node;
  return walker.previousNode();
}

/** Ajoute devant prefix le texte qui precede (last compris), jusqu'au debut du paragraphe. */
function textUpTo(editor: HTMLElement, last: Node | null, prefix: string): string {
  let text = prefix;
  if (!last) return text;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  walker.currentNode = last;
  let current: Node | null = last;
  while (current && current !== editor && text.length < TYPING_CONTEXT_LENGTH) {
    if (current.nodeType === Node.TEXT_NODE) {
      text = (current as Text).data + text;
    } else if (isBlock(current)) {
      break;
    }
    current = walker.previousNode();
  }
  return text;
}

/** Position du curseur (selection vide dans l'editeur), ou null. */
function caretSpot(editor: HTMLElement): CaretSpot | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const anchor = selection.anchorNode;
  const offset = selection.anchorOffset;
  if (!anchor || !editor.contains(anchor)) return null;
  if (anchor.nodeType === Node.TEXT_NODE) {
    const text = anchor as Text;
    const head = text.data.slice(0, offset);
    return {
      node: text,
      offset,
      parent: anchor,
      index: 0,
      before: textUpTo(editor, previousInEditor(editor, text), head)
    };
  }
  if (anchor.nodeType !== Node.ELEMENT_NODE) return null;
  let child: Node | null = offset > 0 ? anchor.childNodes[offset - 1] ?? null : null;
  while (child && child.nodeType === Node.ELEMENT_NODE && !isBlock(child) && child.lastChild) {
    child = child.lastChild;
  }
  if (child && child.nodeType === Node.TEXT_NODE) {
    const text = child as Text;
    return {
      node: text,
      offset: text.data.length,
      parent: anchor,
      index: offset,
      before: textUpTo(editor, previousInEditor(editor, text), text.data)
    };
  }
  const last = child ?? (anchor === editor ? null : anchor);
  return { node: null, offset: 0, parent: anchor, index: offset, before: textUpTo(editor, last, '') };
}

/** Espacement du livre si la correction pendant la frappe est active, sinon null. */
function typingSpacing(value: unknown): TypoSpacing | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { fixWhileTyping?: unknown; spacing?: unknown };
  if (raw.fixWhileTyping !== true) return null;
  const spacing = raw.spacing;
  if (spacing === 'thin' || spacing === 'quebec') return spacing;
  return 'standard';
}

/**
 * Ecrit la touche sous sa forme typographique si besoin. Renvoie de quoi
 * revenir a la touche tapee, ou null (la touche est alors inseree
 * normalement par le navigateur).
 */
export function applyTypingFix(
  editor: HTMLElement,
  event: KeyboardEvent,
  settings: unknown,
  language: () => TypoLanguage,
  beforeChange?: () => void
): AutoReplaceUndo | null {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return null;
  const key = event.key;
  if (typeof key !== 'string' || key.length !== 1 || TYPING_KEYS.indexOf(key) < 0) return null;
  const spacing = typingSpacing(settings);
  if (spacing === null) return null;
  const spot = caretSpot(editor);
  if (!spot) return null;
  const fix = typingFix(spot.before, key, { language: language(), spacing });
  if (!fix || fix.remove > spot.offset) return null;
  // Juste avant de modifier le texte (ex. : figer l'historique d'annulation).
  beforeChange?.();
  let node = spot.node;
  if (!node) {
    node = document.createTextNode('');
    spot.parent.insertBefore(node, spot.parent.childNodes[spot.index] ?? null);
  }
  const start = spot.offset - fix.remove;
  const original = node.data.slice(start, spot.offset) + key;
  node.replaceData(start, fix.remove, fix.insert);
  window.getSelection()?.collapse(node, start + fix.insert.length);
  return { node, start, original, replacement: fix.insert };
}

/**
 * Remet le texte tape (correction pendant la frappe ou remplacement
 * automatique). Si le curseur etait juste apres la correction, il reste
 * juste apres le texte remis. Faux si c'est impossible.
 */
export function revertTypingUndo(editor: HTMLElement, undo: AutoReplaceUndo): boolean {
  const selection = window.getSelection();
  const end = undo.start + undo.replacement.length;
  const atEnd =
    selection !== null &&
    selection.rangeCount > 0 &&
    selection.isCollapsed &&
    selection.anchorNode === undo.node &&
    selection.anchorOffset === end;
  if (!revertAutoReplace(editor, undo)) return false;
  if (atEnd && selection) selection.collapse(undo.node, undo.start + undo.original.length);
  return true;
}
