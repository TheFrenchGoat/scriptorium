// src/renderer/lib/scene-separators-html.ts
// Separateurs de scene (etape 2e) dans le HTML d'un chapitre : reperage,
// remplacement par un modele et selection dans l'editeur.
// Un separateur est un paragraphe (bloc sans autre bloc a l'interieur) dont le
// texte ne contient que des symboles (voir shared/scene-separators.ts). Le
// remplacement change seulement le texte : le bloc garde ses attributs
// (centrage...) et le premier morceau de texte garde sa mise en forme.

import {
  isSceneSeparatorText,
  sceneSeparatorKey,
  type SceneSeparatorFound
} from '../../shared/scene-separators';

const BLOCK_SELECTOR = 'div, p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, section, article';
const INNER_BLOCK_SELECTOR = BLOCK_SELECTOR + ', ul, ol, table';
const UNSAFE_SELECTOR = 'img, hr, svg, video, audio, iframe, object, canvas, input, textarea, [contenteditable="false"]';

/** Paragraphes separateurs, dans l'ordre du texte. */
export function sceneSeparatorBlocks(root: ParentNode): HTMLElement[] {
  const result: HTMLElement[] = [];
  const blocks = root.querySelectorAll(BLOCK_SELECTOR);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    if (block.querySelector(INNER_BLOCK_SELECTOR)) continue;
    if (block.querySelector(UNSAFE_SELECTOR)) continue;
    if (isSceneSeparatorText(block.textContent ?? '')) result.push(block);
  }
  return result;
}

function parse(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = typeof html === 'string' ? html : '';
  return template;
}

export function findSceneSeparatorsInHtml(html: string): SceneSeparatorFound[] {
  return sceneSeparatorBlocks(parse(html).content).map((block, index) => ({
    paragraph: index,
    text: sceneSeparatorKey(block.textContent ?? '')
  }));
}

/** Remplace le texte du bloc par le symbole, dans son premier morceau de texte. */
function setBlockText(block: HTMLElement, symbol: string): void {
  const owner = block.ownerDocument;
  const walker = owner.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    texts.push(node as Text);
    node = walker.nextNode();
  }
  const target = texts.find((text) => sceneSeparatorKey(text.data) !== '') ?? texts[0];
  if (!target) {
    block.insertBefore(owner.createTextNode(symbol), block.firstChild);
    return;
  }
  for (const text of texts) text.data = text === target ? symbol : '';
}

/** Remplace tous les separateurs qui n'ont pas deja la forme du symbole. */
export function unifySceneSeparatorsInHtml(html: string, symbol: string): { html: string; count: number } {
  const source = typeof html === 'string' ? html : '';
  if (!isSceneSeparatorText(symbol)) return { html: source, count: 0 };
  const template = parse(source);
  let count = 0;
  for (const block of sceneSeparatorBlocks(template.content)) {
    if (sceneSeparatorKey(block.textContent ?? '') === symbol) continue;
    setBlockText(block, symbol);
    count += 1;
  }
  return count === 0 ? { html: source, count: 0 } : { html: template.innerHTML, count };
}

/** Plage couvrant un separateur de l'editeur (null s'il ne correspond plus). */
export function sceneSeparatorRange(root: HTMLElement, paragraph: number, text: string): Range | null {
  const block = sceneSeparatorBlocks(root)[paragraph];
  if (!block) return null;
  if (sceneSeparatorKey(block.textContent ?? '') !== text) return null;
  const range = document.createRange();
  range.selectNodeContents(block);
  return range;
}
