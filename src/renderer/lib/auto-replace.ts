// src/renderer/lib/auto-replace.ts
// Remplacements automatiques propres à chaque livre.
//
// Quand l'auteur termine un mot (espace, ponctuation ou Entrée) et que ce mot
// figure dans la liste du livre, il est remplacé JUSTE AVANT que la touche ne
// soit insérée par le navigateur. Le texte déjà écrit n'est jamais modifié.
//
// - seuls les mots entiers sont reconnus, sans tenir compte des majuscules ;
// - un mot tapé avec une majuscule initiale donne un remplacement avec une
//   majuscule initiale ;
// - revertAutoReplace() remet le mot tapé (utilisé par Ctrl+Z).

import type { AutoReplaceRule, AutoReplaceSettings } from '../../shared/types';

export type { AutoReplaceRule, AutoReplaceSettings };

/** Ce qu'il faut pour défaire le dernier remplacement. */
export interface AutoReplaceUndo {
  node: Text;
  start: number;
  original: string;
  replacement: string;
}

// Caractères typographiques écrits par leur code : points de suspension,
// apostrophe courbe, guillemets anglais ouvrant et fermant.
const TYPO = String.fromCharCode(0x2026, 0x2019, 0x201c, 0x201d);

/** Touches qui terminent un mot et déclenchent le remplacement. */
const TRIGGER_KEYS = new Set<string>([
  ' ', '.', ',', ';', ':', '!', '?', ')', ']', '}', '"', '»', 'Enter',
  String.fromCharCode(0x2026)
]);

/** Caractères qui séparent deux mots (en plus des espaces). */
const BOUNDARY_CHARS = new Set<string>([
  ...'.,;:!?()[]{}"«»/'.split(''),
  "'",
  ...TYPO.split('')
]);

function isBoundary(ch: string): boolean {
  return ch.trim() === '' || BOUNDARY_CHARS.has(ch);
}

/** Vrai si le texte est un seul mot (ni espace ni ponctuation). */
export function isAutoReplaceWord(value: string): boolean {
  const word = value.trim();
  if (!word) return false;
  for (const ch of word) {
    if (isBoundary(ch)) return false;
  }
  return true;
}

/** Réglages toujours complets, quelle que soit la donnée enregistrée. */
export function normalizeAutoReplace(value: unknown): AutoReplaceSettings {
  const raw = (value !== null && typeof value === 'object' ? value : {}) as {
    enabled?: unknown;
    rules?: unknown;
  };
  const list: unknown[] = Array.isArray(raw.rules) ? raw.rules : [];
  const rules: AutoReplaceRule[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const rule = item as { from?: unknown; to?: unknown };
    if (typeof rule.from !== 'string' || typeof rule.to !== 'string') continue;
    rules.push({ from: rule.from, to: rule.to });
  }
  return { enabled: raw.enabled !== false, rules };
}

/** Vrai si la touche termine un mot (sans Ctrl, Alt ni composition en cours). */
export function isAutoReplaceTrigger(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return false;
  return TRIGGER_KEYS.has(event.key);
}

function findReplacement(rules: AutoReplaceRule[], typed: string): string | null {
  const key = typed.toLocaleLowerCase();
  for (const rule of rules) {
    const from = rule.from.trim();
    if (!from || rule.to === '' || !isAutoReplaceWord(from)) continue;
    if (from.toLocaleLowerCase() === key) return rule.to;
  }
  return null;
}

function matchCase(typed: string, replacement: string): string {
  const first = typed.charAt(0);
  const isUpper = first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase();
  if (!isUpper || !replacement) return replacement;
  return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
}

/** Position du curseur ramenée à un nœud texte (ou null). */
function caretTextPosition(editor: HTMLElement): { node: Text; offset: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  let node: Node | null = selection.anchorNode;
  let offset = selection.anchorOffset;
  if (!node || !editor.contains(node)) return null;
  if (node.nodeType !== Node.TEXT_NODE) {
    if (offset === 0) return null;
    let child: Node | null = node.childNodes[offset - 1] ?? null;
    while (child && child.nodeType === Node.ELEMENT_NODE) child = child.lastChild;
    if (!child || child.nodeType !== Node.TEXT_NODE) return null;
    node = child;
    offset = (child as Text).data.length;
  }
  return { node: node as Text, offset };
}

/** Vrai si le texte précédent colle au mot (le mot commencerait plus tôt). */
function joinsPreviousText(editor: HTMLElement, text: Text): boolean {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  walker.currentNode = text;
  let prev = walker.previousNode() as Text | null;
  while (prev && prev.data.length === 0) prev = walker.previousNode() as Text | null;
  if (!prev) return false;
  if (isBoundary(prev.data.charAt(prev.data.length - 1))) return false;
  const range = document.createRange();
  range.setStart(prev, prev.data.length);
  range.setEnd(text, 0);
  const between = range.cloneContents();
  return between.querySelector('br, div, p, li, h1, h2, h3, h4, h5, h6, blockquote') === null;
}

/**
 * Remplace le mot qui précède le curseur s'il est dans la liste.
 * À appeler au moment où la touche est enfoncée, AVANT son insertion.
 */
export function applyAutoReplaceBeforeCaret(
  editor: HTMLElement,
  value: unknown,
  beforeChange?: () => void
): AutoReplaceUndo | null {
  const settings = normalizeAutoReplace(value);
  if (!settings.enabled || settings.rules.length === 0) return null;
  const caret = caretTextPosition(editor);
  if (!caret) return null;
  const { node, offset } = caret;
  const data = node.data;
  // On ne coupe jamais un mot en deux : le caractère après le curseur doit aussi le terminer.
  if (offset < data.length && !isBoundary(data.charAt(offset))) return null;
  let start = offset;
  while (start > 0 && !isBoundary(data.charAt(start - 1))) start -= 1;
  if (start === offset) return null;
  if (start === 0 && joinsPreviousText(editor, node)) return null;
  const original = data.slice(start, offset);
  const found = findReplacement(settings.rules, original);
  if (found === null) return null;
  const replacement = matchCase(original, found);
  if (replacement === original) return null;
  // Juste avant de modifier le texte (ex. : figer l'historique d'annulation).
  beforeChange?.();
  node.replaceData(start, original.length, replacement);
  window.getSelection()?.collapse(node, start + replacement.length);
  return { node, start, original, replacement };
}

/** Remet le mot tapé à la place du remplacement. Faux si c'est impossible. */
export function revertAutoReplace(editor: HTMLElement, undo: AutoReplaceUndo): boolean {
  const { node, start, original, replacement } = undo;
  if (!node.isConnected || !editor.contains(node)) return false;
  if (node.data.slice(start, start + replacement.length) !== replacement) return false;
  node.replaceData(start, replacement.length, original);
  return true;
}
