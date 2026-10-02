// src/renderer/lib/grammar-check.ts
// Applique/retire le surlignage des fautes détectées par LanguageTool dans le
// contentEditable, sans jamais toucher aux balises existantes (mentions WB,
// mise en forme...). Suit le même principe de sécurité que le surlignage World
// Building : on ne travaille que sur les nœuds texte, on reconstruit un texte
// brut "à plat" avec sa carte d'offsets, et on ne modifie le DOM que pour les
// correspondances qui tiennent entièrement dans un seul nœud texte (cas qui
// couvre l'immense majorité des fautes réelles ; les rares cas à cheval sur
// deux nœuds sont ignorés plutôt que risquer de corrompre le contenu).

import type { GrammarMatch } from '../../shared/types';

export interface TextNodeEntry {
  node: Text;
  start: number;
  end: number;
}

export interface PlainTextMap {
  text: string;
  nodes: TextNodeEntry[];
}

/** Construit le texte brut complet d'un conteneur (ce que LanguageTool doit
 *  analyser) ainsi que la liste ordonnée des nœuds texte avec leurs bornes,
 *  pour retrouver ensuite quel nœud contient tel offset. */
export function getPlainTextWithMap(root: HTMLElement): PlainTextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  const nodes: TextNodeEntry[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // Un nœud texte peut être vide (ex: entre deux balises) : on l'inclut
    // quand même dans la carte pour ne pas décaler les offsets suivants.
    const start = text.length;
    text += node.nodeValue ?? '';
    nodes.push({ node, start, end: text.length });
  }

  return { text, nodes };
}

/** Retire tous les surlignages de grammaire précédemment posés, en
 *  réinjectant leur contenu texte à la place du <mark>. */
export function clearGrammarMarks(root: HTMLElement): boolean {
  const marks = Array.from(root.querySelectorAll('.grammar-error'));
  if (marks.length === 0) return false;

  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  root.normalize();
  return true;
}

/** Applique les correspondances LanguageTool au contenu du conteneur.
 *  IMPORTANT : à appeler juste après clearGrammarMarks() + un nouveau
 *  getPlainTextWithMap() sur le MÊME contenu (les offsets ne sont valables que
 *  pour le texte brut envoyé à LanguageTool). */
export function applyGrammarMatches(
  _root: HTMLElement,
  matches: GrammarMatch[],
  nodesMap: TextNodeEntry[]
): void {
  if (!matches || matches.length === 0) return;

  // On traite les correspondances de la fin vers le début : modifier le DOM
  // (splitText) invalide les offsets des nœuds suivants dans le document, mais
  // pas ceux qui les précèdent, donc partir de la fin évite tout recalcul.
  const sorted = [...matches].sort((a, b) => b.offset - a.offset);

  sorted.forEach((match) => {
    const matchStart = match.offset;
    const matchEnd = match.offset + match.length;

    const entry = nodesMap.find((n) => matchStart >= n.start && matchEnd <= n.end);
    if (!entry) return; // à cheval sur plusieurs nœuds : on ignore, par sécurité

    const localStart = matchStart - entry.start;
    const localEnd = matchEnd - entry.start;
    const textNode = entry.node;
    if (!textNode.parentNode) return; // nœud déjà détaché par une correspondance précédente

    const matchedText = (textNode.nodeValue ?? '').slice(localStart, localEnd);
    if (!matchedText.trim()) return;

    // Découpe le nœud texte en 3 : avant / correspondance / après.
    const afterNode = textNode.splitText(localStart);
    afterNode.splitText(localEnd - localStart);

    const mark = document.createElement('mark');
    mark.className = 'grammar-error';
    mark.setAttribute('spellcheck', 'false');
    mark.dataset.message = match.message || '';
    mark.dataset.ruleId = match.ruleId || '';
    mark.dataset.replacements = JSON.stringify(match.replacements || []);

    afterNode.parentNode?.insertBefore(mark, afterNode);
    mark.appendChild(afterNode);
  });
}
