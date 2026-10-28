// src/main/import-chapters.ts
// Découpage en chapitres commun aux imports de documents (ODT, Word…).
//
// Chaque importeur transforme le document en blocs (un par paragraphe).
// Les règles sont essayées dans cet ordre :
// 1. "Chapitre 1", "Chapter II", "Prologue", "Épilogue" ou titre de niveau 1 ;
// 2. sinon, titres de niveau 2 ;
// 3. sinon, titres visuels : paragraphe court, centré, en gras ou plus grand
//    que le texte courant (au moins deux trouvés) ;
// 4. sinon, tout le document devient "Chapitre 1".
// Le texte placé avant le premier titre devient "Introduction". Le titre donne
// son nom au chapitre et n'est pas repris dans son contenu. Les lignes vides
// au début et à la fin de chaque chapitre sont retirées.
//
// splitDocument() ajoute la règle du "titre du livre" : un seul titre de
// niveau 1 en tête du document, suivi d'au moins deux titres de niveau 2,
// donne le nom du projet ; les titres de niveau 2 deviennent les chapitres.

import { sanitizeChapterHtml } from './sanitize';

export interface ImportBlock {
  /** Texte visible normalisé (vide pour une ligne vide). */
  text: string;
  /** HTML du paragraphe pour l'éditeur. */
  html: string;
  /** Niveau de titre du document (1, 2…) ou null. */
  headingLevel: number | null;
  /** Paragraphe centré. */
  centered: boolean;
  /** Paragraphe majoritairement en gras. */
  bold: boolean;
  /** Taille dominante en points, ou null si elle n'est pas précisée. */
  fontSizePt: number | null;
}

interface Section {
  name: string;
  explicit: boolean;
  merged: boolean;
  blocks: ImportBlock[];
}

const CHAPTER_NUMBER_PATTERN =
  String.raw`(?:\d+|[ivxlcdm]+|premier|premi\u00E8re|premiere|one)`;

const DECORATION_START = /^[\u2022\u00B7\u25AA\u25E6\-\u2013\u2014]+\s*/u;
const DECORATION_END = /\s*[\u2022\u00B7\u25AA\u25E6\-\u2013\u2014]+$/u;

const VISUAL_TITLE_MAX_LENGTH = 80;
const VISUAL_TITLE_MIN_COUNT = 2;
const DEFAULT_BODY_SIZE_PT = 12;
const LARGER_THAN_BODY_PT = 2;

/**
 * Normalise le texte visible : espaces insécables, caractères de largeur
 * nulle, césures conditionnelles et espaces multiples.
 */
export function normalizeVisibleText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00AD/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Détecte un titre explicite : "Chapitre 1", "Chapitre I : Le départ",
 * "CHAPTER 3", "Chapitre n\u00B0 1", "Prologue", "Épilogue".
 * Renvoie le nom du chapitre, ou null.
 */
export function getExplicitChapterTitle(rawText: string): string | null {
  let text = normalizeVisibleText(rawText);

  if (!text) {
    return null;
  }

  text = text.replace(DECORATION_START, '').replace(DECORATION_END, '').trim();

  if (/^prologue(?:\s*[:.\-\u2013\u2014]\s*)?$/iu.test(text)) {
    return 'Prologue';
  }

  if (/^[e\u00E9]pilogue(?:\s*[:.\-\u2013\u2014]\s*)?$/iu.test(text)) {
    return '\u00C9pilogue';
  }

  const pattern = new RegExp(
    String.raw`^(chapitre|chapter)\s*(?:n\s*[\u00B0\u00BAo]?\s*)?(${CHAPTER_NUMBER_PATTERN})(?:\s*(?:[:.\-\u2013\u2014]\s*(.*)|\s+(.+)))?$`,
    'iu'
  );

  const match = text.match(pattern);

  if (!match) {
    return null;
  }

  const subtitle = normalizeVisibleText(match[3] ?? match[4] ?? '')
    .replace(/^[\-\u2013\u2014:.\s]+/u, '')
    .replace(/[\-\u2013\u2014:.\s]+$/u, '')
    .trim();

  const baseTitle = `${match[1] ?? ''} ${match[2] ?? ''}`;

  return subtitle ? `${baseTitle} \u2014 ${subtitle}` : baseTitle;
}

/** Nettoie le nom proposé pour un chapitre. */
function cleanChapterName(value: string, fallback: string): string {
  const normalized = normalizeVisibleText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || fallback;
}

/** Empêche deux chapitres de porter exactement le même nom. */
function uniqueChapterName(chapters: Record<string, string>, requestedName: string): string {
  if (!(requestedName in chapters)) {
    return requestedName;
  }

  let index = 2;

  while (`${requestedName} (${index})` in chapters) {
    index++;
  }

  return `${requestedName} (${index})`;
}

/** Ligne vide : aucun texte visible et aucune image. */
function isBlankBlock(block: ImportBlock | undefined): boolean {
  if (!block) {
    return false;
  }

  return block.text === '' && !/<img\b/i.test(block.html);
}

/** Retire les lignes vides au début et à la fin. */
function trimBlankBlocks(blocks: ImportBlock[]): ImportBlock[] {
  let start = 0;
  let end = blocks.length;

  while (start < end && isBlankBlock(blocks[start])) {
    start++;
  }

  while (end > start && isBlankBlock(blocks[end - 1])) {
    end--;
  }

  return blocks.slice(start, end);
}

/** Taille du texte courant : celle qui couvre le plus de caractères. */
function bodyFontSize(blocks: ImportBlock[]): number {
  const counts = new Map<number, number>();

  blocks.forEach((block) => {
    if (!block.text) {
      return;
    }

    const key = block.fontSizePt ?? 0;
    counts.set(key, (counts.get(key) ?? 0) + block.text.length);
  });

  let bestKey = 0;
  let bestCount = 0;

  counts.forEach((count, key) => {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  });

  return bestKey > 0 ? bestKey : DEFAULT_BODY_SIZE_PT;
}

/**
 * Titre visuel : court, avec au moins une lettre ("***" est exclu), sans
 * point final, centré, en gras ou plus grand que le texte courant.
 */
function isVisualTitle(block: ImportBlock, bodySizePt: number): boolean {
  const text = block.text;

  if (!text || text.length > VISUAL_TITLE_MAX_LENGTH) {
    return false;
  }

  if (!/[A-Za-z\u00C0-\u024F]/.test(text)) {
    return false;
  }

  if (text.endsWith('.') && !text.endsWith('...')) {
    return false;
  }

  if (!block.centered) {
    return false;
  }

  const larger =
    block.fontSizePt !== null &&
    block.fontSizePt >= bodySizePt + LARGER_THAN_BODY_PT;

  return block.bold || larger;
}

/** Fusionne un titre et un "Chapitre X" qui se suivent directement. */
function mergeTitles(first: string, second: string): string {
  const a = first.toLowerCase();
  const b = second.toLowerCase();

  if (a.includes(b)) {
    return first;
  }

  if (b.includes(a)) {
    return second;
  }

  return `${first} \u2014 ${second}`;
}

/** Découpe les blocs du document en chapitres (ordre conservé). */
export function splitIntoChapters(blocks: ImportBlock[]): Record<string, string> {
  const explicitTitles = blocks.map((block) => getExplicitChapterTitle(block.text));
  const hasExplicit = explicitTitles.some((title) => title !== null);
  const hasLevel = (level: number): boolean =>
    blocks.some((block) => block.headingLevel === level && block.text.length > 0);

  let isSeparator: (block: ImportBlock, index: number) => boolean;

  if (hasExplicit || hasLevel(1)) {
    isSeparator = (block, index) =>
      (explicitTitles[index] ?? null) !== null ||
      (block.headingLevel === 1 && block.text.length > 0);
  } else if (hasLevel(2)) {
    isSeparator = (block) => block.headingLevel === 2 && block.text.length > 0;
  } else {
    const bodySizePt = bodyFontSize(blocks);
    const visualCount = blocks.filter((block) => isVisualTitle(block, bodySizePt)).length;

    isSeparator =
      visualCount >= VISUAL_TITLE_MIN_COUNT
        ? (block) => isVisualTitle(block, bodySizePt)
        : () => false;
  }

  const introduction: ImportBlock[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];

    if (!block) {
      continue;
    }

    if (!isSeparator(block, index)) {
      if (current) {
        current.blocks.push(block);
      } else {
        introduction.push(block);
      }

      continue;
    }

    const explicitTitle = explicitTitles[index] ?? null;
    const explicit = explicitTitle !== null;
    const name = explicitTitle ?? block.text;

    /*
     * Un titre du document suivi directement d'un "Chapitre X" (ou l'inverse)
     * ne donne qu'un seul chapitre.
     */
    if (
      current &&
      !current.merged &&
      current.explicit !== explicit &&
      current.blocks.length === 0
    ) {
      current.name = mergeTitles(current.name, name);
      current.merged = true;
      continue;
    }

    current = { name, explicit, merged: false, blocks: [] };
    sections.push(current);
  }

  const toHtml = (list: ImportBlock[]): string =>
    sanitizeChapterHtml(trimBlankBlocks(list).map((block) => block.html).join(''));

  const result: Record<string, string> = {};

  if (sections.length === 0) {
    result['Chapitre 1'] = toHtml(blocks);
    return result;
  }

  if (trimBlankBlocks(introduction).length > 0) {
    result['Introduction'] = toHtml(introduction);
  }

  sections.forEach((section) => {
    const name = uniqueChapterName(
      result,
      cleanChapterName(section.name, `Chapitre ${Object.keys(result).length + 1}`)
    );

    result[name] = toHtml(section.blocks);
  });

  return result;
}

/** Résultat du découpage, avec le titre du livre s'il a été trouvé. */
export interface SplitDocumentResult {
  chapters: Record<string, string>;
  /** Titre du livre (nom de projet proposé), ou null. */
  bookTitle: string | null;
}

/**
 * Découpe le document en appliquant d'abord la règle du "titre du livre" :
 * un seul titre de niveau 1, placé avant tout texte, qui n'est pas un
 * "Chapitre X", suivi d'au moins deux titres de niveau 2. Ce titre devient le
 * nom du projet et ne crée pas de chapitre ; les titres de niveau 2 servent
 * alors de titres de chapitres. Sinon, le découpage habituel s'applique.
 */
export function splitDocument(blocks: ImportBlock[]): SplitDocumentResult {
  const isHeading = (block: ImportBlock, level: number): boolean =>
    block.headingLevel === level && block.text.length > 0;

  const level1Indexes: number[] = [];
  let level2Count = 0;

  blocks.forEach((block, index) => {
    if (isHeading(block, 1)) {
      level1Indexes.push(index);
    } else if (isHeading(block, 2)) {
      level2Count++;
    }
  });

  const titleIndex = level1Indexes.length === 1 ? level1Indexes[0] : undefined;
  const titleBlock = titleIndex === undefined ? undefined : blocks[titleIndex];

  if (
    titleIndex === undefined ||
    !titleBlock ||
    level2Count < 2 ||
    titleIndex !== blocks.findIndex((block) => block.text.length > 0) ||
    getExplicitChapterTitle(titleBlock.text) !== null
  ) {
    return { chapters: splitIntoChapters(blocks), bookTitle: null };
  }

  const rest = blocks
    .slice(titleIndex + 1)
    .map((block) => (block.headingLevel === 2 ? { ...block, headingLevel: 1 } : block));

  return {
    chapters: splitIntoChapters(rest),
    bookTitle: titleBlock.text || null
  };
}
