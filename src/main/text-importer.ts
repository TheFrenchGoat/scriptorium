// src/main/text-importer.ts
// Import d'un fichier texte brut (.txt) ou Markdown (.md, .markdown).
//
// Encodage détecté automatiquement : UTF-8 (avec ou sans BOM), UTF-16
// (avec BOM), sinon Windows-1252.
//
// Texte brut : une ligne donne un paragraphe. Titres de chapitres reconnus :
// 1. table des matières dont les lignes réapparaissent plus loin ;
// 2. mise en page de l'export Scriptorium : ligne courte précédée d'au moins
//    trois lignes vides (ou en tête du texte) et suivie d'une ligne
//    vide, au moins deux fois dans le fichier ;
// 3. "Chapitre X", "Prologue", "Épilogue" (règle commune).
// Une page de titre en tête du fichier donne le nom du projet.
//
// Markdown : titres #, ## ou soulignés (=== / ---), **gras**, *italique*,
// _italique_, <u>souligné</u>. Liens : texte seul. Images et en-tête
// technique ignorés. La table des matières est retirée.
//
// Le découpage final est commun aux autres imports (import-chapters.ts).

import fs from 'node:fs';
import path from 'node:path';
import {
  getExplicitChapterTitle,
  normalizeVisibleText,
  splitDocument,
  splitIntoChapters,
  type ImportBlock,
  type SplitDocumentResult
} from './import-chapters';
import { escapeHtml, projectNameFromFilePath, type RenderedInline } from './import-html';
import type { ImportedProject, ProjectData } from '../shared/types';

/** Taille maximale acceptée (50 Mo). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Longueur maximale d'un titre de chapitre ou d'une ligne de page de titre. */
const TITLE_MAX_LENGTH = 120;

/** Lignes non vides d'une page de titre : titre, sous-titre, auteur. */
const TITLE_PAGE_MAX_LINES = 4;

/** Lignes vides placées par l'export Scriptorium avant chaque chapitre. */
const LAYOUT_BLANK_LINES = 3;

/** Nombre minimal de titres reconnus par la mise en page. */
const LAYOUT_TITLE_MIN_COUNT = 2;

/** Retour à la ligne forcé dans un paragraphe Markdown (absent du texte lu). */
const HARD_BREAK = '\u0000';

/** Caractères 0x80 à 0x9F de Windows-1252. */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
];

// -----------------------------------------------------------------------------
// Lecture du fichier
// -----------------------------------------------------------------------------

function decodeWindows1252(buffer: Buffer): string {
  const parts: string[] = [];
  let codes: number[] = [];

  for (let index = 0; index < buffer.length; index++) {
    const byte = buffer[index] ?? 0;
    codes.push(byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH[byte - 0x80] ?? byte : byte);

    if (codes.length >= 8192) {
      parts.push(String.fromCharCode(...codes));
      codes = [];
    }
  }

  parts.push(String.fromCharCode(...codes));
  return parts.join('');
}

/** UTF-8 (avec ou sans BOM), UTF-16 (avec BOM), sinon Windows-1252. */
function decodeTextFile(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const evenLength = (buffer.length - 2) - ((buffer.length - 2) % 2);
    return Buffer.from(buffer.subarray(2, 2 + evenLength)).swap16().toString('utf16le');
  }

  const utf8 = buffer.toString('utf8');

  if (!utf8.includes('\uFFFD') || Buffer.from(utf8, 'utf8').equals(buffer)) {
    return utf8;
  }

  return decodeWindows1252(buffer);
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === '';
}

/** Ligne de séparation de scène : "***", "* * *", "###", "~ ~ ~"... */
function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 30 &&
    /^[*#~=_\-\u2013\u2014\u2022\u00B7\u2042\u2051\s]+$/.test(trimmed)
  );
}

/** Ligne pouvant servir de titre : courte, sans ponctuation de fin de phrase. */
function isTitleLike(line: string): boolean {
  const trimmed = line.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= TITLE_MAX_LENGTH &&
    !isSeparatorLine(trimmed) &&
    !/[,;:]$/.test(trimmed) &&
    !/(^|[^.])\.$/.test(trimmed)
  );
}

/**
 * Bloc d'import. "centered" reste false : sinon les séparateurs centrés
 * pourraient passer pour des titres visuels. Le centrage est dans le HTML.
 */
function makeBlock(
  text: string,
  html: string,
  headingLevel: number | null,
  centered = false
): ImportBlock {
  const visible = normalizeVisibleText(text);
  const style = centered && visible ? ' style="text-align: center"' : '';

  return {
    text: visible,
    html: `<div${style}>${visible ? html : '<br>'}</div>`,
    headingLevel,
    centered: false,
    bold: false,
    fontSizePt: null
  };
}

function ensureText(blocks: ImportBlock[]): void {
  if (!blocks.some((block) => block.text.length > 0)) {
    throw new Error('Le fichier ne contient aucun texte importable.');
  }
}

// -----------------------------------------------------------------------------
// Texte brut
// -----------------------------------------------------------------------------

function countBlankBefore(lines: string[], index: number): number {
  let count = 0;

  for (let line = index - 1; line >= 0 && isBlank(lines[line]); line--) {
    count++;
  }

  return count;
}

function firstNonBlank(lines: string[], from: number): number {
  for (let index = from; index < lines.length; index++) {
    if (!isBlank(lines[index])) {
      return index;
    }
  }

  return -1;
}

/** Prochaine ligne non vide précédée d'au moins trois lignes vides. */
function nextSectionStart(lines: string[], from: number): number {
  for (let index = from; index < lines.length; index++) {
    if (!isBlank(lines[index]) && countBlankBefore(lines, index) >= LAYOUT_BLANK_LINES) {
      return index;
    }
  }

  return -1;
}

interface TxtTableOfContents {
  /** Ligne "Table des matières". */
  start: number;
  /** Première ligne du texte après la table. */
  bodyStart: number;
  /** Lignes des titres de chapitres dans le texte. */
  titles: number[];
}

/**
 * Table des matières : un intitulé, une ligne vide, une ligne par chapitre,
 * puis au moins trois lignes vides. Chaque entrée doit se retrouver plus loin,
 * dans le même ordre, comme titre de chapitre.
 */
function readTxtTableOfContents(lines: string[], start: number): TxtTableOfContents | null {
  if (!isTitleLike(lines[start] ?? '') || !isBlank(lines[start + 1])) {
    return null;
  }

  const entries: string[] = [];
  let index = start + 2;

  while (index < lines.length && !isBlank(lines[index])) {
    const entry = (lines[index] ?? '').trim();

    if (!isTitleLike(entry)) {
      return null;
    }

    entries.push(entry);
    index++;
  }

  const blankStart = index;

  while (index < lines.length && isBlank(lines[index])) {
    index++;
  }

  if (entries.length === 0 || index - blankStart < LAYOUT_BLANK_LINES || index >= lines.length) {
    return null;
  }

  const bodyStart = index;
  const titles: number[] = [];
  let searchFrom = bodyStart;

  for (const entry of entries) {
    let found = -1;

    for (let line = searchFrom; line < lines.length; line++) {
      if (
        (lines[line] ?? '').trim() === entry &&
        isBlank(lines[line + 1]) &&
        (line === bodyStart || countBlankBefore(lines, line) >= LAYOUT_BLANK_LINES)
      ) {
        found = line;
        break;
      }
    }

    if (found < 0) {
      return null;
    }

    titles.push(found);
    searchFrom = found + 1;
  }

  return { start, bodyStart, titles };
}

/** La table des matières est cherchée en tête ou juste après la page de titre. */
function findTxtTableOfContents(lines: string[], first: number): TxtTableOfContents | null {
  let start = first;

  for (let attempt = 0; attempt < 2 && start >= 0; attempt++) {
    const toc = readTxtTableOfContents(lines, start);

    if (toc) {
      return toc;
    }

    start = nextSectionStart(lines, start + 1);
  }

  return null;
}

function filledLines(lines: string[], start: number, end: number): string[] {
  const result: string[] = [];

  for (let index = start; index < end; index++) {
    const value = (lines[index] ?? '').trim();

    if (value) {
      result.push(value);
    }
  }

  return result;
}

/** Page de titre : 1 à 4 lignes courtes, la première n'est pas "Chapitre X". */
function isTitlePageRange(lines: string[], start: number, end: number): boolean {
  const filled = filledLines(lines, start, end);
  const titleLine = filled[0];

  return (
    titleLine !== undefined &&
    filled.length <= TITLE_PAGE_MAX_LINES &&
    filled.every((value) => isTitleLike(value)) &&
    getExplicitChapterTitle(normalizeVisibleText(titleLine)) === null
  );
}

/**
 * Page de titre sans table des matières : lignes suivies d'au moins trois
 * lignes vides, avec une seule ligne ou un sous-titre juste sous le titre
 * (un chapitre exporté a toujours une ligne vide sous son titre).
 * Renvoie la première ligne du texte qui suit, ou -1.
 */
function readTxtTitlePage(lines: string[], first: number): number {
  let index = first;
  let filled = 0;

  while (index < lines.length) {
    if (!isBlank(lines[index])) {
      filled++;

      if (filled > TITLE_PAGE_MAX_LINES) {
        return -1;
      }

      index++;
      continue;
    }

    let end = index;

    while (end < lines.length && isBlank(lines[end])) {
      end++;
    }

    if (end - index >= LAYOUT_BLANK_LINES) {
      const singleLine = filled === 1;
      const subtitleBelow = !isBlank(lines[first + 1]);

      return end < lines.length &&
        isTitlePageRange(lines, first, index) &&
        (singleLine || subtitleBelow)
        ? end
        : -1;
    }

    index = end;
  }

  return -1;
}

/** Titres placés comme dans l'export Scriptorium (au moins deux). */
function findLayoutTitles(lines: string[], bodyStart: number): number[] {
  const found: number[] = [];

  for (let index = bodyStart; index < lines.length; index++) {
    if (
      isTitleLike(lines[index] ?? '') &&
      isBlank(lines[index + 1]) &&
      (index === bodyStart || countBlankBefore(lines, index) >= LAYOUT_BLANK_LINES)
    ) {
      found.push(index);
    }
  }

  return found.length >= LAYOUT_TITLE_MIN_COUNT ? found : [];
}

function importPlainText(text: string): SplitDocumentResult {
  const lines = splitLines(text).map((line) => line.replace(/\s+$/, ''));
  const first = firstNonBlank(lines, 0);

  if (first < 0) {
    throw new Error('Le fichier ne contient aucun texte importable.');
  }

  let titlePageEnd = first;
  let bodyStart = first;
  let titles: number[];

  const toc = findTxtTableOfContents(lines, first);

  if (toc) {
    titlePageEnd = toc.start;
    bodyStart = toc.bodyStart;
    titles = toc.titles;
  } else {
    const afterTitlePage = readTxtTitlePage(lines, first);

    if (afterTitlePage > first) {
      titlePageEnd = afterTitlePage;
      bodyStart = afterTitlePage;
    }

    titles = findLayoutTitles(lines, bodyStart);
  }

  const bookTitleIndex =
    titlePageEnd > first && isTitlePageRange(lines, first, titlePageEnd) ? first : -1;

  const titleSet = new Set(titles);

  /* L'export entoure chaque séparateur d'une ligne vide : on les retire. */
  const dropped = new Set<number>();

  for (let index = bodyStart; index < lines.length; index++) {
    if (titleSet.has(index) || !isSeparatorLine(lines[index] ?? '')) {
      continue;
    }

    if (index - 1 >= bodyStart && isBlank(lines[index - 1])) {
      dropped.add(index - 1);
    }

    if (index + 1 < lines.length && isBlank(lines[index + 1])) {
      dropped.add(index + 1);
    }
  }

  const blocks: ImportBlock[] = [];

  const pushLine = (index: number, headingLevel: number | null): void => {
    const value = (lines[index] ?? '').trim();
    blocks.push(makeBlock(value, escapeHtml(value), headingLevel, isSeparatorLine(value)));
  };

  /* Sous-titre et auteur de la page de titre : avant le premier chapitre. */
  for (let index = first; index < titlePageEnd; index++) {
    if (index !== bookTitleIndex) {
      pushLine(index, null);
    }
  }

  for (let index = bodyStart; index < lines.length; index++) {
    if (!dropped.has(index)) {
      pushLine(index, titleSet.has(index) ? 1 : null);
    }
  }

  ensureText(blocks);

  return {
    chapters: splitIntoChapters(blocks),
    bookTitle:
      bookTitleIndex >= 0 ? normalizeVisibleText(lines[bookTitleIndex] ?? '') || null : null
  };
}

// -----------------------------------------------------------------------------
// Markdown
// -----------------------------------------------------------------------------

type MdItem =
  | { kind: 'heading'; level: number; source: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'separator'; text: string }
  | { kind: 'empty' };

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-{2,})[ \t]*$/;
const LIST_OR_QUOTE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\S|^ {0,3}>/;
const LIST_ITEM = /^ {0,3}[-+*][ \t]+(.*)$/;

/** Bloc d'en-tête technique (--- titre: ... ---) en haut du fichier. */
function stripFrontMatter(lines: string[]): string[] {
  if ((lines[0] ?? '').trim() !== '---') {
    return lines;
  }

  for (let index = 1; index < lines.length && index < 200; index++) {
    const value = (lines[index] ?? '').trim();

    if (value === '---' || value === '...') {
      const inner = lines.slice(1, index);
      const looksLikeMetadata =
        inner.some((line) => /^[A-Za-z0-9_-]+[ \t]*:/.test(line)) &&
        inner.every(
          (line) => line.trim() === '' || /^[A-Za-z0-9_-]+[ \t]*:|^[ \t]|^-[ \t]/.test(line)
        );

      return looksLikeMetadata ? lines.slice(index + 1) : lines;
    }
  }

  return lines;
}

function parseMarkdown(lines: string[]): MdItem[] {
  const items: MdItem[] = [];
  const paragraph: string[] = [];

  const flush = (): void => {
    if (paragraph.length > 0) {
      items.push({ kind: 'paragraph', lines: paragraph.splice(0) });
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      flush();
      continue;
    }

    if (
      paragraph.length > 0 &&
      SETEXT_UNDERLINE.test(raw) &&
      !LIST_OR_QUOTE.test(paragraph[0] ?? '')
    ) {
      const level = trimmed.startsWith('=') ? 1 : 2;
      const source = paragraph.splice(0).map((part) => part.trim()).join(' ');
      items.push({ kind: 'heading', level, source });
      continue;
    }

    if (trimmed === '&nbsp;') {
      flush();
      items.push({ kind: 'empty' });
      continue;
    }

    if (isSeparatorLine(raw)) {
      flush();
      items.push({ kind: 'separator', text: trimmed });
      continue;
    }

    const heading = ATX_HEADING.exec(raw);

    if (heading) {
      flush();
      const source = (heading[2] ?? '').replace(/[ \t]+#+$/, '').trim();
      items.push({ kind: 'heading', level: (heading[1] ?? '#').length, source });
      continue;
    }

    /* Listes et citations : un paragraphe par ligne, marqueur conservé. */
    if (LIST_OR_QUOTE.test(raw)) {
      flush();
    }

    paragraph.push(raw);
  }

  flush();
  return items;
}

/** Lignes d'un paragraphe : espace simple, ou retour à la ligne forcé. */
function paragraphSource(lines: string[]): string {
  return lines
    .map((raw, index) => {
      const value = raw.replace(/^[ \t]+/, '');

      if (index === lines.length - 1) {
        return value.replace(/[ \t]+$/, '');
      }

      if (/ {2,}$/.test(value)) {
        return value.replace(/[ \t]+$/, '') + HARD_BREAK;
      }

      if (/(^|[^\\])\\$/.test(value)) {
        return value.slice(0, -1) + HARD_BREAK;
      }

      return value.replace(/[ \t]+$/, '') + ' ';
    })
    .join('');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  laquo: '\u00AB',
  raquo: '\u00BB',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D'
};

function decodeEntity(body: string): string | null {
  if (body.startsWith('#')) {
    const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
    const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);

    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return null;
    }

    return String.fromCodePoint(code);
  }

  return NAMED_ENTITIES[body] ?? null;
}

/**
 * Caractères qu'une barre oblique inversée peut protéger (ponctuation
 * ASCII). Comparaison par codes : aucune expression régulière fragile.
 */
function isEscapable(ch: string): boolean {
  const code = ch.charCodeAt(0);

  return (
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  );
}

/* Crochets et barre oblique écrits en code (\x5B, \x5D, \x2F) par sécurité. */
const PLAIN_RUN = /[^\\&<!\x5B*_\u0000]+/y;
const ENTITY = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/y;
const HTML_TAG = /<(\x2F?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/y;
const IMAGE = /!\x5B[^\x5D]*\x5D$[^)]*$/y;
const LINK = /\x5B([^\x5D]*)\x5D$[^)]*$/y;

function execAt(pattern: RegExp, source: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(source);
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9\u00C0-\u024F]/.test(ch);
}

function isSpaceOrEdge(ch: string | undefined): boolean {
  return ch === undefined || ch === HARD_BREAK || /\s/.test(ch);
}

type Marker = 'b' | 'i';

interface InlinePiece {
  html: string;
  text: string;
  /** Marqueur d'ouverture gras/italique, null pour du texte. */
  marker: Marker | null;
  /** Marqueur refermé plus loin ; sinon il est affiché tel quel. */
  matched: boolean;
}

/** Texte Markdown d'un paragraphe ou d'un titre -> texte visible et HTML. */
function renderInline(source: string): RenderedInline {
  const pieces: InlinePiece[] = [];
  const openMarkers: number[] = [];
  let underlineDepth = 0;

  const pushPiece = (html: string, text: string): void => {
    pieces.push({ html, text, marker: null, matched: false });
  };

  const pushText = (value: string): void => {
    if (value) {
      pushPiece(escapeHtml(value), value);
    }
  };

  const findOpen = (marker: Marker): number => {
    for (let k = openMarkers.length - 1; k >= 0; k--) {
      const piece = pieces[openMarkers[k] ?? -1];

      if (piece && piece.marker === marker) {
        return k;
      }
    }

    return -1;
  };

  let index = 0;

  while (index < source.length) {
    const plain = execAt(PLAIN_RUN, source, index);

    if (plain) {
      pushText(plain[0]);
      index += plain[0].length;
      continue;
    }

    const ch = source.charAt(index);

    if (ch === HARD_BREAK) {
      pushPiece('<br>', ' ');
      index++;
      continue;
    }

    if (ch === '\\') {
      const next = source.charAt(index + 1);

      if (next && isEscapable(next)) {
        pushText(next);
        index += 2;
        continue;
      }
    }

    if (ch === '&') {
      const entity = execAt(ENTITY, source, index);
      const decoded = entity ? decodeEntity(entity[1] ?? '') : null;

      if (entity && decoded !== null) {
        pushText(decoded);
        index += entity[0].length;
        continue;
      }
    }

    if (ch === '<') {
      const tag = execAt(HTML_TAG, source, index);

      if (tag) {
        const closing = tag[1] === '/';
        const name = (tag[2] ?? '').toLowerCase();

        if (name === 'u' && !closing) {
          pushPiece('<u>', '');
          underlineDepth++;
        } else if (name === 'u' && underlineDepth > 0) {
          pushPiece('</u>', '');
          underlineDepth--;
        } else if (name === 'br') {
          pushPiece('<br>', ' ');
        }

        index += tag[0].length;
        continue;
      }
    }

    if (ch === '!') {
      const image = execAt(IMAGE, source, index);

      if (image) {
        index += image[0].length;
        continue;
      }
    }

    if (ch === '[') {
      const link = execAt(LINK, source, index);

      if (link) {
        const inner = renderInline(link[1] ?? '');
        pushPiece(inner.html, inner.text);
        index += link[0].length;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      let end = index;

      while (source.charAt(end) === ch) {
        end++;
      }

      const before = index > 0 ? source.charAt(index - 1) : undefined;
      const after = end < source.length ? source.charAt(end) : undefined;
      const intraWord = ch === '_' && isWordChar(before) && isWordChar(after);
      const canOpen = !intraWord && !isSpaceOrEdge(after);
      const canClose = !intraWord && !isSpaceOrEdge(before);
      let count = end - index;
      const kinds: Marker[] = [];

      if (count >= 3) {
        const top = pieces[openMarkers[openMarkers.length - 1] ?? -1];
        const closingBoth = canClose && findOpen('b') >= 0 && findOpen('i') >= 0;

        if (closingBoth && top && top.marker === 'b') {
          kinds.push('b', 'i');
        } else if (closingBoth) {
          kinds.push('i', 'b');
        } else {
          kinds.push('b', 'i');
        }

        count -= 3;
      } else if (count === 2) {
        kinds.push('b');
        count = 0;
      } else {
        kinds.push('i');
        count = 0;
      }

      for (const kind of kinds) {
        const literal = kind === 'b' ? ch + ch : ch;
        const openIndex = canClose ? findOpen(kind) : -1;

        if (openIndex >= 0) {
          const opener = pieces[openMarkers[openIndex] ?? -1];

          if (opener) {
            opener.matched = true;
          }

          openMarkers.splice(openIndex, 1);
          pushPiece(kind === 'b' ? '</b>' : '</i>', '');
        } else if (canOpen) {
          openMarkers.push(pieces.length);
          pieces.push({ html: escapeHtml(literal), text: literal, marker: kind, matched: false });
        } else {
          pushText(literal);
        }
      }

      if (count > 0) {
        pushText(ch.repeat(count));
      }

      index = end;
      continue;
    }

    pushText(ch);
    index++;
  }

  let html = '';
  let text = '';

  for (const piece of pieces) {
    if (piece.marker !== null && piece.matched) {
      html += piece.marker === 'b' ? '<b>' : '<i>';
    } else {
      html += piece.html;
      text += piece.text;
    }
  }

  for (; underlineDepth > 0; underlineDepth--) {
    html += '</u>';
  }

  return { html, text };
}

/**
 * Table des matières : un titre suivi uniquement d'une liste dont chaque
 * élément correspond, dans l'ordre, à un titre placé plus loin.
 */
function removeMarkdownTableOfContents(items: MdItem[]): MdItem[] {
  const headingText = (item: MdItem | undefined): string | null =>
    item && item.kind === 'heading' ? normalizeVisibleText(renderInline(item.source).text) : null;

  for (let start = 0; start < items.length; start++) {
    if (headingText(items[start]) === null) {
      continue;
    }

    const entries: string[] = [];
    let end = start + 1;

    for (; end < items.length; end++) {
      const item = items[end];

      if (!item || item.kind !== 'paragraph' || item.lines.length !== 1) {
        break;
      }

      const entry = LIST_ITEM.exec(item.lines[0] ?? '');

      if (!entry) {
        break;
      }

      entries.push(normalizeVisibleText(renderInline(entry[1] ?? '').text));
    }

    if (entries.length === 0 || headingText(items[end]) === null) {
      continue;
    }

    let position = end;
    let matched = true;

    for (const entry of entries) {
      while (position < items.length && headingText(items[position]) !== entry) {
        position++;
      }

      if (position >= items.length) {
        matched = false;
        break;
      }

      position++;
    }

    if (matched) {
      return items.slice(0, start).concat(items.slice(end));
    }
  }

  return items;
}

function markdownToBlocks(items: MdItem[]): ImportBlock[] {
  const blocks: ImportBlock[] = [];

  for (const item of items) {
    if (item.kind === 'heading') {
      const rendered = renderInline(item.source);
      blocks.push(makeBlock(rendered.text, '<b>' + rendered.html + '</b>', item.level));
    } else if (item.kind === 'separator') {
      blocks.push(makeBlock(item.text, escapeHtml(item.text), null, true));
    } else if (item.kind === 'empty') {
      blocks.push(makeBlock('', '', null));
    } else {
      const rendered = renderInline(paragraphSource(item.lines));

      if (normalizeVisibleText(rendered.text)) {
        blocks.push(makeBlock(rendered.text, rendered.html, null));
      }
    }
  }

  return blocks;
}

function importMarkdownText(text: string): SplitDocumentResult {
  const items = removeMarkdownTableOfContents(parseMarkdown(stripFrontMatter(splitLines(text))));
  const blocks = markdownToBlocks(items);

  ensureText(blocks);
  return splitDocument(blocks);
}

// -----------------------------------------------------------------------------
// Point d'entrée
// -----------------------------------------------------------------------------

/** Importe un fichier texte (.txt) ou Markdown (.md) en projet Scriptorium. */
export function importTextProject(filePath: string): ImportedProject {
  const extension = typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
  const markdown = extension === '.md' || extension === '.markdown';

  if (!markdown && extension !== '.txt') {
    throw new Error("Le fichier sélectionné n'est pas un fichier texte (.txt) ou Markdown (.md).");
  }

  const stats = fs.statSync(filePath);

  if (stats.size > MAX_FILE_BYTES) {
    throw new Error('Le fichier est trop volumineux (50 Mo au maximum).');
  }

  const buffer = fs.readFileSync(filePath);

  if (buffer.length === 0) {
    throw new Error('Le fichier est vide.');
  }

  const text = decodeTextFile(buffer);

  if (text.includes('\u0000')) {
    throw new Error("Le fichier sélectionné n'est pas un fichier texte lisible.");
  }

  const split = markdown ? importMarkdownText(text) : importPlainText(text);

  const projectData: ProjectData = {
    chapters: split.chapters,
    world: {},
    customWbTypes: {},
    writingSessions: [],
    goals: []
  };

  return {
    projectName: split.bookTitle || projectNameFromFilePath(filePath),
    projectData
  };
}
