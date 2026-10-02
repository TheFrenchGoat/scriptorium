// src/renderer/lib/highlight.ts
// Détection et surlignage des mentions World Building dans le texte du
// chapitre ouvert. On ne touche QU'aux nœuds texte (jamais aux balises
// existantes), et on restaure la position du curseur après coup — c'est ce qui
// permet au surlignage automatique de tourner pendant l'écriture sans
// perturber la frappe.

import { getCaretCharacterOffsetWithin, setCaretPosition } from './dom';
import { applyMentionColorStyle, type WbRegistry } from './wb-registry';
import type { ProjectData } from '../../shared/types';

/** Retire les mentions dont le texte ne correspond plus à aucune fiche
 *  (fiche supprimée ou renommée). */
export function cleanInvalidMentions(rootNode: HTMLElement, wbItems: string[]): void {
  const mentions = Array.from(rootNode.querySelectorAll('.wb-mention'));
  let cleaned = false;

  mentions.forEach((span) => {
    const text = span.textContent ?? '';
    const isValid = wbItems.some((key) => key.toLowerCase() === text.toLowerCase());

    if (!isValid) {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      cleaned = true;
    }
  });
  if (cleaned) rootNode.normalize();
}

export function highlightWorldBuilding(
  editor: HTMLElement,
  projectData: ProjectData,
  registry: WbRegistry
): void {
  const wbItems = Object.keys(projectData.world).sort((a, b) => b.length - a.length);
  if (wbItems.length === 0) return;

  cleanInvalidMentions(editor, wbItems);

  const escapedItems = wbItems.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(?<![\\w\\u00C0-\\u00FF'-])(${escapedItems.join('|')})(?![\\w\\u00C0-\\u00FF'-])`,
    'giu'
  );

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodesToProcess: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (parent?.classList.contains('wb-mention')) continue;
    nodesToProcess.push(node);
  }

  const caretOffset = getCaretCharacterOffsetWithin(editor);
  let hasModified = false;

  nodesToProcess.forEach((textNode) => {
    // On traite TOUTES les correspondances du nœud d'origine, pas seulement la
    // première : après chaque split, on continue de chercher dans le nœud
    // restant (« après »), sinon un paragraphe contenant plusieurs mentions
    // différentes ne surlignait que la première.
    // On réinitialise aussi lastIndex à chaque nouveau nœud : comme `pattern`
    // est global et réutilisé d'un nœud à l'autre, un lastIndex hérité pouvait
    // faire manquer entièrement les correspondances d'un nœud plus court.
    let node: Text = textNode;
    pattern.lastIndex = 0;
    let text = node.nodeValue ?? '';
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      hasModified = true;

      const matchStartNode = node.splitText(match.index);
      const afterNode = matchStartNode.splitText(match[0].length);

      const matchedName = match[0];
      const realKey = wbItems.find((k) => k.toLowerCase() === matchedName.toLowerCase());

      if (realKey && projectData.world[realKey]) {
        const itemData = projectData.world[realKey];
        const config = registry.configFor(itemData.wbType);

        const span = document.createElement('span');
        span.className = `wb-mention ${config.colorClass}`;
        span.dataset.wbKey = realKey;
        span.dataset.typeLabel = config.label;
        span.setAttribute('spellcheck', 'false');
        applyMentionColorStyle(span, registry.colorFor(itemData));

        matchStartNode.parentNode?.insertBefore(span, matchStartNode);
        span.appendChild(matchStartNode);
      }

      node = afterNode;
      text = node.nodeValue ?? '';
      pattern.lastIndex = 0;
    }
  });

  if (hasModified) {
    editor.normalize();
    try {
      setCaretPosition(editor, caretOffset);
    } catch {
      /* curseur hors texte, on ignore */
    }
  }
}

/** Resynchronise la couleur des mentions déjà posées avec l'état actuel des
 *  fiches (une couleur a pu être changée pendant que ce chapitre était fermé).
 *  Volontairement PAS appelée depuis highlightWorldBuilding (qui tourne à
 *  chaque pause de frappe) : reparcourir tout l'éditeur à chaque frappe serait
 *  coûteux pour un bénéfice quasi nul. */
export function syncMentionColors(
  editor: HTMLElement,
  projectData: ProjectData,
  registry: WbRegistry
): void {
  editor.querySelectorAll<HTMLElement>('.wb-mention').forEach((span) => {
    const key = span.dataset.wbKey;
    const itemData = key ? projectData.world[key] : undefined;
    if (itemData) applyMentionColorStyle(span, registry.colorFor(itemData));
  });
}

/** Renomme les mentions déjà posées dans le HTML stocké de chaque chapitre.
 *  Sans ça, au prochain surlignage, cleanInvalidMentions les considérerait
 *  invalides et les dé-surlignerait en laissant l'ANCIEN nom en texte brut. */
export function renameWorldMentionsAcrossChapters(
  projectData: ProjectData,
  oldName: string,
  newName: string
): void {
  Object.keys(projectData.chapters).forEach((chapName) => {
    const html = projectData.chapters[chapName];
    if (!html || typeof html !== 'string') return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const mentions = Array.from(tempDiv.querySelectorAll<HTMLElement>('.wb-mention')).filter(
      (span) => span.dataset.wbKey && span.dataset.wbKey.toLowerCase() === oldName.toLowerCase()
    );
    if (mentions.length === 0) return;

    mentions.forEach((span) => {
      span.dataset.wbKey = newName;
      span.textContent = newName;
    });

    projectData.chapters[chapName] = tempDiv.innerHTML;
  });
}

/** Retire, dans tous les chapitres, les mentions d'une fiche supprimée. */
export function removeMentionsAcrossChapters(projectData: ProjectData, name: string): void {
  Object.keys(projectData.chapters).forEach((chapName) => {
    const html = projectData.chapters[chapName];
    if (!html || typeof html !== 'string') return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const mentions = tempDiv.querySelectorAll<HTMLElement>('.wb-mention');
    let touched = false;

    mentions.forEach((m) => {
      if (m.dataset.wbKey !== name) return;
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      touched = true;
    });

    if (touched) projectData.chapters[chapName] = tempDiv.innerHTML;
  });
}
