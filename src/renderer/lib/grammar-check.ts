// src/renderer/lib/grammar-check.ts
// Applique/retire le surlignage des fautes détectées par LanguageTool dans le
// contentEditable, sans jamais toucher aux balises existantes (mentions WB,
// mise en forme...). On ne travaille que sur les nœuds texte : on reconstruit
// un texte brut "à plat" avec sa carte d'offsets, puis on enveloppe les
// portions fautives dans des <mark>.
//
// Points importants :
// - les paragraphes (blocs) et les <br> produisent un séparateur virtuel
//   "\n\n" dans le texte envoyé à LanguageTool : sinon les phrases de deux
//   paragraphes étaient collées ("fin.Début") et l'analyse était faussée ;
// - les caractères invisibles (U+200B, U+FEFF) sont retirés du texte envoyé,
//   avec une table de correspondance pour retrouver les positions réelles ;
// - une faute à cheval sur plusieurs nœuds texte (gras, couleur, police,
//   mention WB...) est marquée par PLUSIEURS <mark> partageant le même
//   data-grammar-id, au lieu d'être ignorée.

import type { GrammarMatch } from '../../shared/types';

export interface TextNodeEntry {
  node: Text;
  /** Début dans le texte brut envoyé à LanguageTool. */
  start: number;
  /** Fin (exclue) dans le texte brut envoyé à LanguageTool. */
  end: number;
  /**
   * Présent uniquement si le nœud contient des caractères invisibles retirés :
   * offsets[i] = position, dans le nœud, du i-ème caractère conservé.
   */
  offsets?: number[];
}

export interface PlainTextMap {
  text: string;
  nodes: TextNodeEntry[];
}

interface MatchPiece {
  node: Text;
  localStart: number;
  localEnd: number;
}

interface PreparedMatch {
  match: GrammarMatch;
  pieces: MatchPiece[];
}

const INVISIBLE_CHARS = /[\u200B\uFEFF]/g;
const INVISIBLE_CHAR_TEST = /[\u200B\uFEFF]/;

/** Séparateur virtuel inséré entre deux paragraphes (absent du DOM). */
const PARAGRAPH_SEPARATOR = '\n\n';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]);

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

let grammarGroupCounter = 0;

export function stripInvisibleChars(value: string): string {
  return value.replace(INVISIBLE_CHARS, '');
}

/** Clé utilisée pour mémoriser une faute ignorée (règle + texte fautif). */
export function grammarIgnoreKey(ruleId: string, text: string): string {
  return `${ruleId}::${stripInvisibleChars(text)}`;
}

/** Construit le texte brut complet d'un conteneur (ce que LanguageTool doit
 *  analyser) ainsi que la liste ordonnée des nœuds texte avec leurs bornes. */
export function getPlainTextWithMap(root: HTMLElement): PlainTextMap {
  const nodes: TextNodeEntry[] = [];
  const parts: string[] = [];
  let length = 0;
  let pendingBreak = false;

  const append = (value: string): void => {
    parts.push(value);
    length += value.length;
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const raw = textNode.nodeValue ?? '';

      let kept = raw;
      let offsets: number[] | undefined;

      if (INVISIBLE_CHAR_TEST.test(raw)) {
        offsets = [];
        let built = '';

        for (let index = 0; index < raw.length; index += 1) {
          const char = raw[index];

          if (char === '\u200B' || char === '\uFEFF') {
            continue;
          }

          offsets.push(index);
          built += char;
        }

        kept = built;
      }

      if (kept.length > 0 && pendingBreak) {
        if (length > 0) {
          append(PARAGRAPH_SEPARATOR);
        }

        pendingBreak = false;
      }

      const start = length;
      append(kept);
      nodes.push({ node: textNode, start, end: length, offsets });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = (node as Element).tagName;

    if (SKIPPED_TAGS.has(tag)) {
      return;
    }

    if (tag === 'BR') {
      pendingBreak = true;
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);

    if (isBlock) {
      pendingBreak = true;
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }

    if (isBlock) {
      pendingBreak = true;
    }
  };

  for (let child = root.firstChild; child; child = child.nextSibling) {
    visit(child);
  }

  return { text: parts.join(''), nodes };
}

/** Retire tous les surlignages de grammaire précédemment posés. */
export function clearGrammarMarks(root: HTMLElement): boolean {
  const marks = Array.from(root.querySelectorAll('.grammar-error'));

  if (marks.length === 0) {
    return false;
  }

  marks.forEach((mark) => {
    const parent = mark.parentNode;

    if (!parent) {
      return;
    }

    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }

    parent.removeChild(mark);
  });

  root.normalize();
  return true;
}

/** Convertit une position du texte brut en position dans le nœud texte. */
function toNodeOffset(
  entry: TextNodeEntry,
  plainOffset: number,
  isEnd: boolean
): number {
  const relative = plainOffset - entry.start;

  if (!entry.offsets) {
    return relative;
  }

  if (isEnd) {
    return relative <= 0 ? 0 : entry.offsets[relative - 1] + 1;
  }

  return relative >= entry.offsets.length
    ? (entry.node.nodeValue ?? '').length
    : entry.offsets[relative];
}

/** Premier nœud dont la fin dépasse `offset` (recherche dichotomique). */
function findFirstEntryIndex(nodes: TextNodeEntry[], offset: number): number {
  let low = 0;
  let high = nodes.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (nodes[middle].end > offset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

/** Découpe une faute en morceaux, un par nœud texte traversé. Renvoie null
 *  si la faute traverse un séparateur de paragraphe ou ne contient rien de
 *  visible. */
function collectPieces(
  nodes: TextNodeEntry[],
  matchStart: number,
  matchEnd: number
): MatchPiece[] | null {
  const pieces: MatchPiece[] = [];
  let cursor = matchStart;
  let matchedText = '';

  for (
    let index = findFirstEntryIndex(nodes, matchStart);
    index < nodes.length;
    index += 1
  ) {
    const entry = nodes[index];

    if (entry.start >= matchEnd) {
      break;
    }

    if (entry.end <= entry.start) {
      continue;
    }

    if (entry.start > cursor) {
      return null;
    }

    const from = Math.max(matchStart, entry.start);
    const to = Math.min(matchEnd, entry.end);

    if (to <= from) {
      continue;
    }

    const localStart = toNodeOffset(entry, from, false);
    const localEnd = toNodeOffset(entry, to, true);

    if (localEnd <= localStart || !entry.node.parentNode) {
      return null;
    }

    pieces.push({ node: entry.node, localStart, localEnd });
    matchedText += (entry.node.nodeValue ?? '').slice(localStart, localEnd);
    cursor = to;
  }

  if (pieces.length === 0 || cursor < matchEnd) {
    return null;
  }

  if (!stripInvisibleChars(matchedText).trim()) {
    return null;
  }

  return pieces;
}

function createGrammarMark(match: GrammarMatch, groupId: string): HTMLElement {
  const mark = document.createElement('mark');

  mark.className = 'grammar-error';
  mark.setAttribute('spellcheck', 'false');
  mark.dataset.grammarId = groupId;
  mark.dataset.message = match.message || '';
  mark.dataset.ruleId = match.ruleId || '';
  mark.dataset.replacements = JSON.stringify(match.replacements || []);

  return mark;
}

function wrapPiece(piece: MatchPiece, match: GrammarMatch, groupId: string): void {
  const { node, localStart, localEnd } = piece;

  if (!node.parentNode) {
    return;
  }

  if (localEnd > (node.nodeValue ?? '').length) {
    return;
  }

  const target = localStart > 0 ? node.splitText(localStart) : node;

  if (localEnd - localStart < target.length) {
    target.splitText(localEnd - localStart);
  }

  const mark = createGrammarMark(match, groupId);

  target.parentNode?.insertBefore(mark, target);
  mark.appendChild(target);
}

/** Applique les correspondances LanguageTool au contenu du conteneur.
 *  IMPORTANT : `nodesMap` doit provenir d'un getPlainTextWithMap() fait sur
 *  le MÊME texte que celui envoyé à LanguageTool, sans marques présentes. */
export function applyGrammarMatches(
  _root: HTMLElement,
  matches: GrammarMatch[],
  nodesMap: TextNodeEntry[]
): void {
  if (!matches || matches.length === 0 || nodesMap.length === 0) {
    return;
  }

  const sorted = matches
    .filter(
      (match) =>
        Number.isFinite(match.offset) &&
        Number.isFinite(match.length) &&
        match.offset >= 0 &&
        match.length > 0
    )
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

  // 1. Préparation (DOM intact) + élimination des chevauchements.
  const prepared: PreparedMatch[] = [];
  let lastEnd = -1;

  sorted.forEach((match) => {
    const matchStart = match.offset;
    const matchEnd = match.offset + match.length;

    if (matchStart < lastEnd) {
      return;
    }

    const pieces = collectPieces(nodesMap, matchStart, matchEnd);

    if (!pieces) {
      return;
    }

    prepared.push({ match, pieces });
    lastEnd = matchEnd;
  });

  // 2. Application de la fin vers le début : splitText() conserve le début
  //    du nœud d'origine, donc les positions des morceaux précédents restent
  //    valables.
  for (let index = prepared.length - 1; index >= 0; index -= 1) {
    const { match, pieces } = prepared[index];

    grammarGroupCounter += 1;
    const groupId = `g${grammarGroupCounter}`;

    for (let pieceIndex = pieces.length - 1; pieceIndex >= 0; pieceIndex -= 1) {
      wrapPiece(pieces[pieceIndex], match, groupId);
    }
  }
}

/** Tous les <mark> d'une même faute, dans l'ordre du document. */
export function getGrammarMarkGroup(
  root: ParentNode | null,
  mark: HTMLElement
): HTMLElement[] {
  const groupId = mark.dataset.grammarId;

  if (!groupId || !root) {
    return [mark];
  }

  const group = Array.from(
    root.querySelectorAll<HTMLElement>('.grammar-error')
  ).filter((element) => element.dataset.grammarId === groupId);

  return group.includes(mark) ? group : [mark];
}

/** Texte complet d'une faute (tous ses morceaux). */
export function getGrammarGroupText(
  root: ParentNode | null,
  mark: HTMLElement
): string {
  return getGrammarMarkGroup(root, mark)
    .map((element) => stripInvisibleChars(element.textContent ?? ''))
    .join('');
}

/** Retire les <mark> d'une faute sans toucher au texte. Renvoie le texte. */
export function removeGrammarGroup(
  root: ParentNode | null,
  mark: HTMLElement
): string {
  const group = getGrammarMarkGroup(root, mark);
  const text = group
    .map((element) => stripInvisibleChars(element.textContent ?? ''))
    .join('');

  const parents = new Set<Node>();

  group.forEach((element) => {
    const parent = element.parentNode;

    if (!parent) {
      return;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parents.add(parent);
  });

  parents.forEach((parent) => parent.normalize());

  return text;
}

/**
 * Remplace le texte d'une faute par une suggestion en conservant la mise en
 * forme : seule la partie qui diffère (après préfixe et suffixe communs) est
 * remplacée, dans le morceau où elle se trouve.
 *
 * Renvoie une plage repliée juste après le texte inséré (pour le curseur).
 */
export function replaceGrammarGroup(
  root: ParentNode | null,
  mark: HTMLElement,
  replacement: string
): Range | null {
  const group = getGrammarMarkGroup(root, mark);
  const texts = group.map((element) =>
    stripInvisibleChars(element.textContent ?? '')
  );
  const original = texts.join('');
  const shortest = Math.min(original.length, replacement.length);

  let prefix = 0;

  while (prefix < shortest && original[prefix] === replacement[prefix]) {
    prefix += 1;
  }

  let suffix = 0;

  while (
    suffix < shortest - prefix &&
    original[original.length - 1 - suffix] ===
      replacement[replacement.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const changeStart = prefix;
  const changeEnd = original.length - suffix;
  const inserted = replacement.slice(prefix, replacement.length - suffix);

  let position = 0;

  const bounds = texts.map((text) => {
    const bound = { start: position, end: position + text.length };
    position += text.length;
    return bound;
  });

  let insertIndex = group.length - 1;

  for (let index = 0; index < bounds.length; index += 1) {
    if (changeStart >= bounds[index].start && changeStart < bounds[index].end) {
      insertIndex = index;
      break;
    }
  }

  const documentRef = mark.ownerDocument;
  const caret = documentRef.createRange();
  let caretSet = false;
  const parents = new Set<Node>();

  group.forEach((element, index) => {
    const parent = element.parentNode;

    if (!parent) {
      return;
    }

    const piece = texts[index];
    const pieceStart = bounds[index].start;
    const clamp = (value: number): number =>
      Math.min(Math.max(value, 0), piece.length);

    const head = piece.slice(0, clamp(changeStart - pieceStart));
    const tail = piece.slice(clamp(changeEnd - pieceStart));
    const isInsertPiece = index === insertIndex;
    const nextText = isInsertPiece ? head + inserted + tail : head + tail;

    if (nextText) {
      const textNode = documentRef.createTextNode(nextText);

      parent.insertBefore(textNode, element);

      if (isInsertPiece) {
        caret.setStart(textNode, head.length + inserted.length);
        caretSet = true;
      }
    } else if (isInsertPiece) {
      caret.setStartBefore(element);
      caretSet = true;
    }

    parent.removeChild(element);
    parents.add(parent);
  });

  if (caretSet) {
    caret.collapse(true);
  }

  // Les plages (Range) sont mises à jour automatiquement par normalize().
  parents.forEach((parent) => parent.normalize());

  return caretSet ? caret : null;
}