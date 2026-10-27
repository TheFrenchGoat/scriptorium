// src/renderer/lib/comments.ts
//
// Commentaires poses sur des passages d'un chapitre.
//
// Le passage est marque dans le HTML du chapitre par un ou plusieurs
// <span data-comment-id="..."> (un par morceau de texte : un passage peut
// couvrir plusieurs paragraphes). Le texte du commentaire est enregistre a
// part, dans ProjectData.chapterComments. Ces span ne portent aucun style :
// le surlignage est ajoute a l'affichage seulement (voir NotesPanel.tsx).

export const COMMENT_ATTR = 'data-comment-id';
const ID_PATTERN = /^c[a-z0-9]{4,40}$/;

/** Identifiant valide (sans danger dans un selecteur CSS). */
export function isCommentId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function newCommentId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Texte sur une ligne, raccourci si besoin. */
export function collapseExcerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '\u2026' : clean;
}

interface Segment {
  node: Text;
  start: number;
  end: number;
}

function textNodesInRange(range: Range): Text[] {
  const rootNode = range.commonAncestorContainer;
  if (rootNode.nodeType === Node.TEXT_NODE) return [rootNode as Text];
  const result: Text[] = [];
  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node as Text).length > 0 && range.intersectsNode(node)) result.push(node as Text);
    node = walker.nextNode();
  }
  return result;
}

/** Morceaux de texte reellement selectionnes. */
function segmentsOf(range: Range): Segment[] {
  return textNodesInRange(range)
    .map((node) => ({
      node,
      start: node === range.startContainer ? range.startOffset : 0,
      end: node === range.endContainer ? range.endOffset : node.length
    }))
    .filter((segment) => segment.end > segment.start);
}

/** La selection contient-elle du texte deja commente ? */
export function rangeTouchesComment(editor: HTMLElement, range: Range): boolean {
  return segmentsOf(range).some((segment) => {
    const hit = segment.node.parentElement?.closest(`[${COMMENT_ATTR}]`);
    return Boolean(hit && editor.contains(hit));
  });
}

/** Entoure chaque morceau de texte selectionne d'un span portant l'identifiant. */
export function wrapRangeWithComment(editor: HTMLElement, range: Range, id: string): boolean {
  if (!isCommentId(id)) return false;
  const segments = segmentsOf(range).filter((segment) => editor.contains(segment.node));
  if (!segments.some((segment) => segment.node.data.slice(segment.start, segment.end).trim())) return false;
  for (const segment of segments) {
    let target = segment.node;
    if (segment.end < target.length) target.splitText(segment.end);
    if (segment.start > 0) target = target.splitText(segment.start);
    const parent = target.parentNode;
    if (!parent) continue;
    const span = document.createElement('span');
    span.setAttribute(COMMENT_ATTR, id);
    parent.insertBefore(span, target);
    span.appendChild(target);
  }
  return true;
}

/** Retire le marquage d'un commentaire ; le texte reste en place. */
export function unwrapComment(root: ParentNode, id: string): boolean {
  if (!isCommentId(id)) return false;
  const spans = Array.from(root.querySelectorAll<HTMLElement>(`[${COMMENT_ATTR}="${id}"]`));
  spans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
  return spans.length > 0;
}

/** Meme chose sur le HTML enregistre d'un chapitre ferme. */
export function unwrapCommentInHtml(html: string, id: string): string {
  if (!isCommentId(id) || !html.includes(id)) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  return unwrapComment(template.content, id) ? template.innerHTML : html;
}

/** Passages presents dans l'editeur, dans l'ordre du texte : identifiant -> texte. */
export function readCommentAnchors(editor: HTMLElement): Map<string, string> {
  const map = new Map<string, string>();
  const lastBlock = new Map<string, Element | null>();
  editor.querySelectorAll<HTMLElement>(`[${COMMENT_ATTR}]`).forEach((span) => {
    const id = span.getAttribute(COMMENT_ATTR) || '';
    if (!isCommentId(id)) return;
    const text = span.textContent || '';
    const block = span.closest('div, p');
    const previous = map.get(id);
    if (previous === undefined) {
      map.set(id, text);
    } else {
      map.set(id, previous + (lastBlock.get(id) !== block ? ' ' : '') + text);
    }
    lastBlock.set(id, block);
  });
  return map;
}

export interface CommentCapture {
  range: Range | null;
  excerpt: string;
  error: 'none' | 'noSelection' | 'overlap';
}

/** Lit la selection du chapitre pour y poser un commentaire. */
export function captureCommentSelection(): CommentCapture {
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  const empty: CommentCapture = { range: null, excerpt: '', error: 'noSelection' };
  if (!editor || !selection || selection.rangeCount === 0) return empty;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return empty;
  const text = range.toString();
  if (!text.trim()) return empty;
  if (rangeTouchesComment(editor, range)) return { range: null, excerpt: '', error: 'overlap' };
  return { range: range.cloneRange(), excerpt: collapseExcerpt(text, 300), error: 'none' };
}

/** Fait defiler jusqu'au passage et le selectionne. */
export function selectCommentPassage(editor: HTMLElement, id: string): boolean {
  if (!isCommentId(id)) return false;
  const spans = editor.querySelectorAll<HTMLElement>(`[${COMMENT_ATTR}="${id}"]`);
  const first = spans[0];
  const last = spans[spans.length - 1];
  if (!first || !last) return false;
  first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.childNodes.length);
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}
