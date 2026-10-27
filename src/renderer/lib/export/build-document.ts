// src/renderer/lib/export/build-document.ts
// Transforme le HTML des chapitres en document intermédiaire d'export
// (voir shared/export-document.ts) en appliquant les réglages choisis.
//
// Nettoyage effectué :
// - caractères invisibles (U+200B, U+FEFF...) et de contrôle retirés ;
// - mentions de fiches (.wb-mention) et erreurs de grammaire
//   (mark.grammar-error) réduites à leur texte ;
// - lignes « *** », « * * * », « # » ou « \u2042 » remplacées par un séparateur.
//
// Le HTML est lu avec DOMParser : le document obtenu est inerte (aucune
// image chargée, aucun script exécuté).

import type { ExportSettings, ProjectData } from '../../../shared/types';
import type {
  ExportAlign,
  ExportBlock,
  ExportChapter,
  ExportDocument,
  ExportDocumentLabels,
  ExportParagraphBlock,
  ExportRun
} from '../../../shared/export-document';
import { EXPORT_SEPARATOR_SYMBOLS } from '../../../shared/export-settings';
import { buildBibleChapters, type BibleSource } from './build-bible';

const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SEPARATOR_LINE = /^(?:\*(?:\s*\*){2,}|#|\u2042)$/;
const SAFE_FONT_NAME = /^[A-Za-z0-9 \-]{1,60}$/;

const BLOCK_TAGS = new Set([
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'ul', 'ol', 'blockquote', 'pre', 'section', 'article'
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_TAGS = new Set([
  'script', 'style', 'template', 'noscript', 'head', 'title', 'meta', 'link',
  'img', 'svg', 'video', 'audio', 'iframe', 'object', 'canvas'
]);

/** Taille de l'attribut <font size> (1 à 7) en pixels. */
const FONT_SIZE_PX: Record<string, number> = {
  '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48
};

type RunStyle = Omit<ExportRun, 'text'>;

interface ParseOptions {
  /** Retire les lignes vides avant le calcul des retraits. */
  ignoreEmptyLines?: boolean;
  keepFormatting: boolean;
  separators: boolean;
  separatorSymbol: string;
}

interface Collector extends ParseOptions {
  blocks: ExportBlock[];
  pending: ExportRun[];
  pendingAlign: ExportAlign | undefined;
}

export interface BuildExportOptions {
  /** Utilisé comme titre quand le champ Titre est vide. */
  projectName: string;
  language: string;
  labels: ExportDocumentLabels;
  /** Bible de l'univers ; absente, elle n'est jamais exportée. */
  bible?: BibleSource;
}

// ----------------------------------------------------------------------------
// Lecture des styles
// ----------------------------------------------------------------------------

let colorContext: CanvasRenderingContext2D | null | undefined;

/** Couleur CSS -> hexadécimal sans #, ou undefined si invalide/transparente. */
function colorToHex(value: string): string | undefined {
  const color = value.trim().toLowerCase();
  if (color === '' || color === 'transparent' || color === 'inherit' || color === 'currentcolor') {
    return undefined;
  }

  if (colorContext === undefined) {
    colorContext = document.createElement('canvas').getContext('2d');
  }
  if (!colorContext) return undefined;

  const sentinel = '#010203';
  colorContext.fillStyle = sentinel;
  colorContext.fillStyle = color;
  const computed = String(colorContext.fillStyle).toLowerCase();

  if (computed === sentinel && color !== sentinel) return undefined;
  if (/^#[0-9a-f]{6}$/.test(computed)) return computed.slice(1);

  const match = /^rgba?[(]\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?[)]$/.exec(computed);
  if (!match) return undefined;
  if (match[4] !== undefined && parseFloat(match[4]) === 0) return undefined;

  return [match[1], match[2], match[3]]
    .map((part) => Math.min(255, parseInt(part, 10)).toString(16).padStart(2, '0'))
    .join('');
}

function cleanFontName(value: string): string | undefined {
  const first = value.split(',')[0].replace(/['"]/g, '').trim();
  return SAFE_FONT_NAME.test(first) ? first : undefined;
}

function roundPt(pt: number): number {
  return Math.round(Math.min(96, Math.max(4, pt)) * 2) / 2;
}

function cssSizeToPt(value: string): number | undefined {
  const match = /^([\d.]+)\s*(px|pt)?$/i.exec(value.trim());
  if (!match) return undefined;

  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = (match[2] ?? 'px').toLowerCase();
  return roundPt(unit === 'pt' ? amount : amount * 0.75);
}

function isTransparentWrapper(el: HTMLElement): boolean {
  return el.classList.contains('wb-mention') || el.classList.contains('grammar-error') || el.hasAttribute('data-comment-id');
}

function readStyle(el: HTMLElement, parent: RunStyle, keepFormatting: boolean): RunStyle {
  const tag = el.tagName.toLowerCase();
  const style: RunStyle = { ...parent };
  if (isTransparentWrapper(el)) return style; // mentions/fautes : aucun style propre
  const weight = el.style.fontWeight;

  if (
    tag === 'b' || tag === 'strong' || HEADING_TAGS.has(tag) ||
    weight === 'bold' || weight === 'bolder' || (weight !== '' && Number(weight) >= 600)
  ) {
    style.bold = true;
  } else if (weight === 'normal' || weight === 'lighter' || (weight !== '' && Number(weight) < 600)) {
    style.bold = false;
  }

  const fontStyle = el.style.fontStyle;
  if (tag === 'i' || tag === 'em' || fontStyle === 'italic' || fontStyle === 'oblique') {
    style.italic = true;
  } else if (fontStyle === 'normal') {
    style.italic = false;
  }

  const decoration = `${el.style.textDecoration} ${el.style.textDecorationLine}`;
  if (tag === 'u' || decoration.includes('underline')) {
    style.underline = true;
  }

  if (!keepFormatting) {
    return style;
  }

  if (tag === 'font') {
    const face = el.getAttribute('face');
    const size = el.getAttribute('size');
    const color = el.getAttribute('color');

    if (face) {
      const font = cleanFontName(face);
      if (font) style.font = font;
    }
    if (size) {
      const px = FONT_SIZE_PX[size.trim()];
      if (px) style.sizePt = roundPt(px * 0.75);
    }
    if (color) {
      const hex = colorToHex(color);
      if (hex) style.color = hex;
    }
  }

  if (el.style.fontFamily) {
    const font = cleanFontName(el.style.fontFamily);
    if (font) style.font = font;
  }
  if (el.style.fontSize) {
    const pt = cssSizeToPt(el.style.fontSize);
    if (pt) style.sizePt = pt;
  }
  if (el.style.color) {
    const hex = colorToHex(el.style.color);
    if (hex) style.color = hex;
  }

  return style;
}

function readAlign(el: HTMLElement, inherited: ExportAlign | undefined): ExportAlign | undefined {
  const value = (el.style.textAlign || el.getAttribute('align') || '').toLowerCase();

  if (value === 'center') return 'center';
  if (value === 'right' || value === 'end') return 'right';
  if (value === 'left' || value === 'start' || value === 'justify') return undefined;

  return inherited;
}

// ----------------------------------------------------------------------------
// Construction des paragraphes
// ----------------------------------------------------------------------------

function cleanText(raw: string): string {
  return raw
    .replace(INVISIBLE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ');
}

function createRun(text: string, style: RunStyle): ExportRun {
  const run: ExportRun = { text };
  if (style.bold) run.bold = true;
  if (style.italic) run.italic = true;
  if (style.underline) run.underline = true;
  if (style.font) run.font = style.font;
  if (style.sizePt) run.sizePt = style.sizePt;
  if (style.color) run.color = style.color;
  return run;
}

function sameStyle(a: ExportRun, b: ExportRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    a.font === b.font &&
    a.sizePt === b.sizePt &&
    a.color === b.color
  );
}

function trimEdges(runs: ExportRun[]): ExportRun[] {
  const result = runs.map((run) => ({ ...run }));
  const first = result[0];
  const last = result[result.length - 1];

  if (first && first.text !== '\n') first.text = first.text.replace(/^ +/, '');
  if (last && last.text !== '\n') last.text = last.text.replace(/ +$/, '');

  return result.filter((run) => run.text !== '');
}

function mergeRuns(runs: ExportRun[]): ExportRun[] {
  const result: ExportRun[] = [];

  for (const run of runs) {
    const previous = result[result.length - 1];
    if (previous && run.text !== '\n' && previous.text !== '\n' && sameStyle(previous, run)) {
      previous.text += run.text;
    } else {
      result.push({ ...run });
    }
  }

  return result;
}

function pushRun(c: Collector, run: ExportRun, align: ExportAlign | undefined): void {
  if (c.pending.length === 0) c.pendingAlign = align;
  c.pending.push(run);
}

/** Termine le paragraphe en cours (s'il contient du texte). */
function flush(c: Collector): void {
  const runs = c.pending;
  const align = c.pendingAlign;
  c.pending = [];
  c.pendingAlign = undefined;

  while (runs.length > 0 && runs[runs.length - 1].text === '\n') runs.pop();
  if (runs.length === 0) return;

  const plain = runs.map((run) => run.text).join('').replace(/\s+/g, ' ').trim();
  if (plain === '') return;

  if (c.separators && SEPARATOR_LINE.test(plain)) {
    c.blocks.push({ kind: 'separator', symbol: c.separatorSymbol });
    return;
  }

  const paragraph: ExportParagraphBlock = { kind: 'paragraph', runs: mergeRuns(trimEdges(runs)) };
  if (align) paragraph.align = align;
  c.blocks.push(paragraph);
}

function walk(node: Node, style: RunStyle, align: ExportAlign | undefined, c: Collector): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = cleanText(node.textContent ?? '');
    if (text !== '') pushRun(c, createRun(text, style), align);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tag)) return;

  if (tag === 'br') {
    pushRun(c, { text: '\n' }, align);
    return;
  }

  if (tag === 'hr') {
    flush(c);
    c.blocks.push({ kind: 'separator', symbol: c.separatorSymbol });
    return;
  }

  const childStyle = readStyle(el, style, c.keepFormatting);

  if (!BLOCK_TAGS.has(tag)) {
    el.childNodes.forEach((child) => walk(child, childStyle, align, c));
    return;
  }

  const blockAlign = readAlign(el, align);
  flush(c);
  const before = c.blocks.length;

  el.childNodes.forEach((child) => walk(child, childStyle, blockAlign, c));
  flush(c);

  // <div><br></div> : ligne vide volontaire.
  if (c.blocks.length === before && (tag === 'div' || tag === 'p')) {
    c.blocks.push({ kind: 'empty' });
  }
}

/** Retire les lignes vides du début et de la fin, et calcule les retraits. */
function finishBlocks(blocks: ExportBlock[]): ExportBlock[] {
  let start = 0;
  let end = blocks.length;

  while (start < end && blocks[start].kind === 'empty') start++;
  while (end > start && blocks[end - 1].kind === 'empty') end--;

  const result = blocks.slice(start, end);
  let previous: ExportBlock['kind'] | null = null;

  for (const block of result) {
    if (block.kind === 'paragraph' && previous !== 'paragraph') {
      block.noIndent = true;
    }
    previous = block.kind;
  }

  return result;
}

export function parseChapterHtml(html: string, options: ParseOptions): ExportBlock[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const c: Collector = { ...options, blocks: [], pending: [], pendingAlign: undefined };

  parsed.body.childNodes.forEach((child) => walk(child, {}, undefined, c));
  flush(c);

  return finishBlocks(
    options.ignoreEmptyLines
      ? c.blocks.filter((block) => block.kind !== 'empty')
      : c.blocks
  );
}

// ----------------------------------------------------------------------------
// Document complet
// ----------------------------------------------------------------------------

export function buildExportDocument(
  projectData: ProjectData,
  settings: ExportSettings,
  options: BuildExportOptions
): ExportDocument {
  const excluded = new Set(settings.content.excludedChapters);
  const parseOptions: ParseOptions = {
    keepFormatting: settings.content.keepEditorFormatting,
    ignoreEmptyLines: settings.content.ignoreEmptyLines,
    separators: settings.content.sceneSeparators,
    separatorSymbol: EXPORT_SEPARATOR_SYMBOLS[settings.content.sceneSeparator]
  };

  // Même ordre que la barre latérale.
  const bibleSource = settings.bible.mode === 'none' ? undefined : options.bible;
  const novelNames: string[] =
    bibleSource !== undefined && settings.bible.mode === 'only'
      ? []
      : Object.keys(projectData.chapters);

  const chapters: ExportChapter[] = novelNames
    .filter((name) => !excluded.has(name))
    .map((name) => ({
      title: name,
      blocks: parseChapterHtml(projectData.chapters[name] ?? '', parseOptions)
    }));

  // La bible (si elle est demandée) suit le roman.
  if (bibleSource !== undefined) {
    chapters.push(...buildBibleChapters(projectData, settings.bible, bibleSource));
  }

  const titlePage = settings.titlePage;

  return {
    language: options.language,
    title: titlePage.title.trim() || options.projectName,
    subtitle: titlePage.subtitle.trim(),
    author: titlePage.showAuthor ? titlePage.author.trim() : '',
    titlePage: titlePage.enabled,
    tableOfContents: settings.content.tableOfContents,
    runningHeader: settings.runningHeader,
    chapterOnNewPage: settings.content.chapterOnNewPage,
    layout: { ...settings.layout },
    labels: { ...options.labels },
    chapters
  };
}