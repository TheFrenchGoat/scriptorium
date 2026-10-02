// js/grammar-check.js
// Applique/retire le surlignage des fautes détectées par LanguageTool dans le
// contentEditable, sans jamais toucher aux balises existantes (mentions WB,
// mise en forme...). Suit le même principe de sécurité que
// highlightWorldBuilding() dans editor.js : on ne travaille que sur les
// nœuds texte, on reconstruit un texte brut "à plat" avec sa carte
// d'offsets, et on ne modifie le DOM que pour les correspondances qui
// tiennent entièrement dans un seul nœud texte (cas qui couvre l'immense
// majorité des fautes réelles ; les rares cas à cheval sur deux nœuds -
// ex: faute à cheval sur une mention WB - sont ignorés plutôt que risquer
// de corrompre le contenu).

// Construit le texte brut complet d'un containeur (ce que LanguageTool doit
// analyser) ainsi que la liste ordonnée des nœuds texte avec leurs bornes
// dans ce texte brut, pour pouvoir retrouver ensuite quel nœud contient tel
// offset.
export function getPlainTextWithMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let text = '';
  const nodes = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    // Un nœud texte peut être vide (ex: entre deux balises) : on l'inclut
    // quand même dans la carte pour ne pas décaler les offsets suivants,
    // mais il ne pourra jamais contenir de correspondance.
    const start = text.length;
    text += node.nodeValue;
    nodes.push({ node, start, end: text.length });
  }

  return { text, nodes };
}

// Retire tous les surlignages de grammaire précédemment posés, en réinjectant
// leur contenu texte à la place du <mark>, comme cleanInvalidMentions() le
// fait pour les mentions WB devenues invalides.
export function clearGrammarMarks(root) {
  const marks = Array.from(root.querySelectorAll('.grammar-error'));
  if (marks.length === 0) return false;

  marks.forEach(mark => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  root.normalize();
  return true;
}

// Applique les correspondances LanguageTool (format simplifié : offset,
// length, message, replacements[], ruleId) au contenu du containeur.
// IMPORTANT : à appeler juste après clearGrammarMarks() + un nouveau
// getPlainTextWithMap() sur le MÊME contenu (les offsets ne sont valables
// que pour le texte brut qui a été envoyé à LanguageTool).
export function applyGrammarMatches(root, matches, nodesMap) {
  if (!matches || matches.length === 0) return;

  // On traite les correspondances de la fin vers le début : modifier le DOM
  // (splitText) invalide les offsets des nœuds suivants dans le document,
  // mais pas ceux qui les précèdent, donc partir de la fin évite tout recalcul.
  const sorted = [...matches].sort((a, b) => b.offset - a.offset);

  sorted.forEach(match => {
    const matchStart = match.offset;
    const matchEnd = match.offset + match.length;

    // Trouve le(s) nœud(s) texte couvrant cette plage.
    const entry = nodesMap.find(n => matchStart >= n.start && matchEnd <= n.end);
    if (!entry) return; // à cheval sur plusieurs nœuds (ou mention WB) : on ignore, par sécurité

    const localStart = matchStart - entry.start;
    const localEnd = matchEnd - entry.start;
    const textNode = entry.node;
    if (!textNode.parentNode) return; // nœud déjà détaché par une correspondance précédente qui le chevauchait

    const matchedText = textNode.nodeValue.slice(localStart, localEnd);
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

    afterNode.parentNode.insertBefore(mark, afterNode);
    mark.appendChild(afterNode);
  });
}
