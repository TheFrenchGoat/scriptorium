// src/renderer/lib/highlight.ts
//
// Détection et surlignage des mentions World Building dans le texte du
// chapitre ouvert. On ne touche QU'aux nœuds texte (jamais aux balises
// existantes), et on restaure la position du curseur après coup : c'est ce qui
// permet au surlignage automatique de tourner pendant l'écriture sans
// perturber la frappe.
//
// Format 2 :
// - chaque mention porte l'IDENTIFIANT de sa fiche dans data-wb-key ;
// - une fiche est reconnue par son nom ET par ses alias ;
// - la couleur vient du registre (couleur de la fiche, sinon de sa catégorie).
//
// Règle du projet : aucune barre oblique inverse suivie d'une parenthèse ou
// d'un crochet dans ce fichier. Les termes sont échappés par escapeRegExp.

import { getCaretCharacterOffsetWithin, setCaretPosition } from './dom';
import { escapeRegExp, WB_WORD_CHARS } from './mention-index';
import { applyMentionColorStyle, type WbRegistry } from './wb-registry';
import type { ProjectData, WbItem } from '../../shared/types';

type WorldMap = ProjectData['world'];

/** Racine sur laquelle on peut travailler : l'éditeur ou un fragment HTML. */
type MentionRoot = Element | DocumentFragment;

// ---------------------------------------------------------------------------
// Termes reconnus (noms et alias)
// ---------------------------------------------------------------------------

/** Clé de comparaison d'un terme : sans espaces autour, sans casse, en NFC. */
function termKey(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase();
}

function cleanTerm(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

interface TermMatcher {
  /** Expression qui trouve tous les termes, ou null s'il n'y en a aucun. */
  pattern: RegExp | null;
  /** Terme (clé de comparaison) vers identifiant de fiche. */
  termToId: Map<string, string>;
  /** Identifiant de fiche vers l'ensemble de ses termes (clés de comparaison). */
  termsById: Map<string, Set<string>>;
}

/** Cache de l'expression compilée : on ne la recompile que si les termes changent. */
let patternCache: { signature: string; pattern: RegExp | null } | null = null;

function compilePattern(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;

  const signature = terms.join(String.fromCharCode(0));
  if (patternCache && patternCache.signature === signature) {
    return patternCache.pattern;
  }

  const boundary = '[' + WB_WORD_CHARS + ']';
  const alternatives = terms.map((term) => escapeRegExp(term)).join('|');
  const source = '(?<!' + boundary + ')(?:' + alternatives + ')(?!' + boundary + ')';

  let pattern: RegExp | null = null;
  try {
    pattern = new RegExp(source, 'giu');
  } catch (error) {
    console.error('World Building : expression de surlignage invalide.', error);
  }

  patternCache = { signature, pattern };
  return pattern;
}

/**
 * Prépare la correspondance entre termes et fiches.
 * En cas de doublon, le NOM d'une fiche passe avant l'ALIAS d'une autre.
 */
function getTermMatcher(world: WorldMap): TermMatcher {
  const termToId = new Map<string, string>();
  const termsById = new Map<string, Set<string>>();
  const terms: string[] = [];

  const source = world && typeof world === 'object' ? world : {};
  const ids = Object.keys(source).sort();
  const items: Array<{ id: string; item: WbItem }> = [];

  for (const id of ids) {
    const item = source[id];
    if (!item || typeof item !== 'object') continue;
    items.push({ id, item });
    termsById.set(id, new Set());
  }

  const register = (id: string, raw: unknown): void => {
    const term = cleanTerm(raw);
    if (!term) return;
    const key = termKey(term);
    termsById.get(id)?.add(key);
    if (!termToId.has(key)) {
      termToId.set(key, id);
      terms.push(term);
    }
  };

  // 1er passage : les noms.
  for (const { id, item } of items) register(id, item.name);

  // 2e passage : les alias.
  for (const { id, item } of items) {
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) register(id, alias);
    }
  }

  // Les termes les plus longs d'abord (« Jean-Pierre » avant « Jean »).
  terms.sort((a, b) => b.length - a.length || a.localeCompare(b));

  return { pattern: compilePattern(terms), termToId, termsById };
}

// ---------------------------------------------------------------------------
// Outils DOM
// ---------------------------------------------------------------------------

/** Remplace un élément par son contenu. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

/** Position du curseur dans l'éditeur, ou null si le curseur est ailleurs. */
function captureCaret(editor: HTMLElement): number | null {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !editor.contains(selection.anchorNode)
  ) {
    return null;
  }

  try {
    return getCaretCharacterOffsetWithin(editor);
  } catch {
    return null;
  }
}

function restoreCaret(editor: HTMLElement, offset: number | null): void {
  if (offset === null) return;
  try {
    setCaretPosition(editor, offset);
  } catch {
    /* curseur hors texte, on ignore */
  }
}

function decorateMention(span: HTMLElement, item: WbItem, registry: WbRegistry): void {
  span.dataset.typeLabel = registry.labelFor(item.wbType);
  applyMentionColorStyle(span, registry.colorFor(item));
}

// ---------------------------------------------------------------------------
// Nettoyage des mentions invalides
// ---------------------------------------------------------------------------

function cleanWithMatcher(root: MentionRoot, world: WorldMap, matcher: TermMatcher): boolean {
  let changed = false;

  root.querySelectorAll<HTMLElement>('.wb-mention').forEach((span) => {
    // Mention imbriquée dans une autre : on la retire.
    if (span.parentElement && span.parentElement.closest('.wb-mention')) {
      unwrap(span);
      changed = true;
      return;
    }

    let id = span.dataset.wbKey || '';
    let item = id && hasOwn(world, id) ? world[id] : undefined;

    // Ancienne mention qui porte encore un NOM au lieu d'un identifiant.
    if (!item && id) {
      const legacyId = matcher.termToId.get(termKey(id));
      if (legacyId && hasOwn(world, legacyId)) {
        id = legacyId;
        item = world[legacyId];
        span.dataset.wbKey = legacyId;
        changed = true;
      }
    }

    // Fiche supprimée, ou texte qui ne correspond plus ni au nom ni à un alias.
    const terms = item ? matcher.termsById.get(id) : undefined;
    if (!item || !terms || !terms.has(termKey(span.textContent || ''))) {
      unwrap(span);
      changed = true;
    }
  });

  return changed;
}

/**
 * Retire les mentions dont la fiche n'existe plus, ou dont le texte ne
 * correspond plus au nom ni à un alias de leur fiche.
 * Retourne true si quelque chose a changé.
 */
export function cleanInvalidMentions(root: MentionRoot, world: WorldMap): boolean {
  const changed = cleanWithMatcher(root, world || {}, getTermMatcher(world || {}));
  if (changed) root.normalize();
  return changed;
}

// ---------------------------------------------------------------------------
// Surlignage
// ---------------------------------------------------------------------------

function wrapMatches(
  editor: HTMLElement,
  world: WorldMap,
  matcher: TermMatcher,
  registry: WbRegistry,
): boolean {
  const pattern = matcher.pattern;
  if (!pattern) return false;

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodesToProcess: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.nodeValue) continue;
    const parent = node.parentElement;
    if (parent && parent.closest('.wb-mention')) continue;
    nodesToProcess.push(node);
  }

  let changed = false;

  nodesToProcess.forEach((textNode) => {
    // On traite TOUTES les correspondances du nœud : après chaque découpe, on
    // continue dans le morceau restant. lastIndex est remis à zéro à chaque
    // fois, car l'expression est globale et partagée.
    let node: Text = textNode;
    let text = node.nodeValue || '';
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];

      // Sécurité contre une correspondance vide (boucle infinie).
      if (!matched) {
        pattern.lastIndex += 1;
        continue;
      }

      const id = matcher.termToId.get(termKey(matched));
      const item = id && hasOwn(world, id) ? world[id] : undefined;

      const matchNode = node.splitText(match.index);
      const afterNode = matchNode.splitText(matched.length);

      if (id && item && matchNode.parentNode) {
        const span = document.createElement('span');
        span.className = 'wb-mention';
        span.dataset.wbKey = id;
        span.setAttribute('spellcheck', 'false');
        decorateMention(span, item, registry);

        matchNode.parentNode.insertBefore(span, matchNode);
        span.appendChild(matchNode);
        changed = true;
      }

      node = afterNode;
      text = node.nodeValue || '';
      pattern.lastIndex = 0;
    }
  });

  return changed;
}

/**
 * Nettoie puis surligne toutes les mentions du texte de l'éditeur.
 * Retourne true si le contenu de l'éditeur a été modifié.
 */
export function highlightWorldBuilding(
  editor: HTMLElement,
  projectData: ProjectData,
  registry: WbRegistry,
): boolean {
  const world: WorldMap = projectData.world || {};
  const matcher = getTermMatcher(world);
  const caret = captureCaret(editor);

  const cleaned = cleanWithMatcher(editor, world, matcher);

  // On fusionne les nœuds texte avant de chercher : un nom qui vient d'être
  // « libéré » peut être coupé en deux morceaux.
  if (cleaned) editor.normalize();

  const wrapped = wrapMatches(editor, world, matcher, registry);

  if (wrapped) editor.normalize();

  const changed = cleaned || wrapped;
  if (changed) restoreCaret(editor, caret);

  return changed;
}

/**
 * Resynchronise la couleur et la catégorie des mentions déjà posées avec
 * l'état actuel des fiches. Volontairement PAS appelée à chaque frappe.
 */
export function syncMentionColors(
  editor: HTMLElement,
  projectData: ProjectData,
  registry: WbRegistry,
): void {
  const world: WorldMap = projectData.world || {};

  editor.querySelectorAll<HTMLElement>('.wb-mention').forEach((span) => {
    const id = span.dataset.wbKey;
    const item = id && hasOwn(world, id) ? world[id] : undefined;
    if (item) decorateMention(span, item, registry);
  });
}

// ---------------------------------------------------------------------------
// Renommage et suppression (éditeur ou HTML stocké)
// ---------------------------------------------------------------------------

function mentionsOf(root: MentionRoot, itemId: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.wb-mention')).filter(
    (span) => span.dataset.wbKey === itemId,
  );
}

/**
 * Remplace le texte des mentions d'une fiche qui affichent l'ANCIEN nom.
 * Les mentions écrites avec un alias ne sont pas modifiées.
 */
export function renameMentionsIn(
  root: MentionRoot,
  itemId: string,
  oldName: string,
  newName: string,
): boolean {
  const oldKey = termKey(oldName);
  const next = newName.trim();
  if (!oldKey || !next || oldKey === termKey(next)) return false;

  let changed = false;

  mentionsOf(root, itemId).forEach((span) => {
    if (termKey(span.textContent || '') === oldKey) {
      span.textContent = next;
      changed = true;
    }
  });

  return changed;
}

/** Retire les mentions d'une fiche (le texte est conservé). */
export function removeMentionsIn(root: MentionRoot, itemId: string): boolean {
  const spans = mentionsOf(root, itemId);
  spans.forEach(unwrap);
  if (spans.length > 0) root.normalize();
  return spans.length > 0;
}

/**
 * Applique une transformation au HTML stocké de chaque chapitre.
 * Modifie projectData.chapters sur place et retourne les chapitres modifiés.
 */
function transformChapters(
  projectData: ProjectData,
  transform: (root: DocumentFragment) => boolean,
): string[] {
  const changedChapters: string[] = [];
  const chapters = projectData.chapters || {};

  Object.keys(chapters).forEach((chapterName) => {
    const html = chapters[chapterName];
    if (!html || typeof html !== 'string' || !html.includes('wb-mention')) return;

    // Un élément template n'exécute rien et ne charge aucune image.
    const template = document.createElement('template');
    template.innerHTML = html;

    if (transform(template.content)) {
      chapters[chapterName] = template.innerHTML;
      changedChapters.push(chapterName);
    }
  });

  return changedChapters;
}

/**
 * Après le renommage d'une fiche : met à jour, dans tous les chapitres
 * stockés, le texte des mentions qui affichaient l'ancien nom.
 * Retourne la liste des chapitres modifiés.
 */
export function renameWorldMentionsAcrossChapters(
  projectData: ProjectData,
  itemId: string,
  oldName: string,
  newName: string,
): string[] {
  return transformChapters(projectData, (root) =>
    renameMentionsIn(root, itemId, oldName, newName),
  );
}

/**
 * Après la suppression d'une fiche : retire ses mentions de tous les
 * chapitres stockés. Retourne la liste des chapitres modifiés.
 */
export function removeMentionsAcrossChapters(projectData: ProjectData, itemId: string): string[] {
  return transformChapters(projectData, (root) => removeMentionsIn(root, itemId));
}
