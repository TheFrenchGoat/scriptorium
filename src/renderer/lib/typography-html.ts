// src/renderer/lib/typography-html.ts
// Typographie dans le HTML d'un chapitre.
//
// Le chapitre est decoupe en paragraphes (blocs et sauts de ligne). Le
// texte de chaque paragraphe est analyse en entier ; les corrections sont
// ensuite rendues aux noeuds de texte (voir shared/typography-project.ts) :
// gras, italique et surlignages restent en place. Le contenu non modifiable
// (contenteditable="false") n'est jamais touche.

import { findTypoIssues, type TypoIssue, type TypoOptions } from '../../shared/typography';
import { applyTypoIssuesToSegments, fixTypoSegments, type TypoKeep } from '../../shared/typography-project';

/** Un cas trouve : numero du paragraphe, texte du paragraphe, correction. */
export interface TypoHtmlIssue {
  paragraph: number;
  text: string;
  issue: TypoIssue;
}

interface Paragraph {
  nodes: Text[];
  segments: string[];
}

const BLOCK_TAGS = new Set<string>([
  'P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'PRE', 'TABLE', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER'
]);

const SKIPPED_TAGS = new Set<string>(['SCRIPT', 'STYLE', 'TEMPLATE', 'TEXTAREA']);

function parse(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = typeof html === 'string' ? html : '';
  return template;
}

/** Bloc qui contient le noeud, ou null si le noeud ne doit pas etre touche. */
function blockOf(node: Node, root: Node): Node | null {
  let block: Node | null = null;
  let current: Node | null = node.parentNode;
  while (current && current !== root) {
    if (current.nodeType === 1) {
      const element = current as Element;
      if (SKIPPED_TAGS.has(element.tagName) || element.getAttribute('contenteditable') === 'false') return null;
      if (!block && BLOCK_TAGS.has(element.tagName)) block = element;
    }
    current = current.parentNode;
  }
  return block ?? root;
}

/** Paragraphes du fragment (les paragraphes vides sont laisses de cote). */
function collectParagraphs(root: Node): Paragraph[] {
  const all: Paragraph[] = [];
  let current: Paragraph | null = null;
  let currentBlock: Node | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 1) {
      const tag = (node as Element).tagName;
      if (tag === 'BR' || BLOCK_TAGS.has(tag)) current = null;
      continue;
    }
    if (node.nodeType !== 3) continue;
    const block = blockOf(node, root);
    if (block === null) {
      current = null;
      continue;
    }
    if (!current || block !== currentBlock) {
      current = { nodes: [], segments: [] };
      currentBlock = block;
      all.push(current);
    }
    current.nodes.push(node as Text);
    current.segments.push(node.nodeValue ?? '');
  }
  return all.filter((paragraph) => paragraph.segments.join('').trim() !== '');
}

function writeSegments(paragraph: Paragraph, segments: readonly string[]): void {
  paragraph.nodes.forEach((node, k) => {
    const value = segments[k];
    if (typeof value === 'string' && node.nodeValue !== value) node.nodeValue = value;
  });
}

/** Cas typographiques d'un chapitre, dans l'ordre du texte. */
export function findTypoInHtml(html: string, options: TypoOptions, keep?: TypoKeep): TypoHtmlIssue[] {
  const result: TypoHtmlIssue[] = [];
  const paragraphs = collectParagraphs(parse(html).content);
  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.segments.join('');
    for (const issue of findTypoIssues(text, options)) {
      if (keep && !keep(text, issue)) continue;
      result.push({ paragraph: index, text, issue });
    }
  });
  return result;
}

/** Corrige tout ce qui peut l'etre dans un chapitre (HTML inchange si rien a faire). */
export function fixTypoInHtml(html: string, options: TypoOptions, keep?: TypoKeep): { html: string; count: number } {
  const source = typeof html === 'string' ? html : '';
  const template = parse(source);
  let count = 0;
  for (const paragraph of collectParagraphs(template.content)) {
    const fixed = fixTypoSegments(paragraph.segments, options, keep);
    if (fixed.count === 0) continue;
    count += fixed.count;
    writeSegments(paragraph, fixed.segments);
  }
  return count === 0 ? { html: source, count: 0 } : { html: template.innerHTML, count };
}

/** Corrige un seul cas, s'il correspond encore au texte du chapitre. */
export function fixOneTypoInHtml(html: string, found: TypoHtmlIssue): { html: string; count: number } {
  const source = typeof html === 'string' ? html : '';
  if (!found || !found.issue || typeof found.issue.replacement !== 'string') return { html: source, count: 0 };
  const template = parse(source);
  const paragraph = collectParagraphs(template.content)[found.paragraph];
  if (!paragraph || paragraph.segments.join('') !== found.text) return { html: source, count: 0 };
  const next = applyTypoIssuesToSegments(paragraph.segments, [found.issue]);
  if (next.join('') === found.text) return { html: source, count: 0 };
  writeSegments(paragraph, next);
  return { html: template.innerHTML, count: 1 };
}

/** Position d'un caractere du paragraphe dans ses segments (noeuds de texte). */
export function segmentOffset(
  segments: readonly string[],
  position: number,
  atEnd: boolean
): { index: number; offset: number } | null {
  if (segments.length === 0 || position < 0) return null;
  let start = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const end = start + (segments[index] ?? '').length;
    if (atEnd ? position <= end : position < end) return { index, offset: position - start };
    start = end;
  }
  if (position !== start) return null;
  const last = segments.length - 1;
  return { index: last, offset: (segments[last] ?? '').length };
}

/** Passage d'un cas dans un element affiche, ou null s'il ne correspond plus au texte. */
export function rangeForTypoIssue(root: Node, found: TypoHtmlIssue): Range | null {
  const paragraph = collectParagraphs(root)[found.paragraph];
  if (!paragraph || paragraph.segments.join('') !== found.text) return null;
  const from = segmentOffset(paragraph.segments, found.issue.start, false);
  const to =
    found.issue.end === found.issue.start ? from : segmentOffset(paragraph.segments, found.issue.end, true);
  if (!from || !to) return null;
  const startNode = paragraph.nodes[from.index];
  const endNode = paragraph.nodes[to.index];
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, from.offset);
  range.setEnd(endNode, to.offset);
  return range;
}
