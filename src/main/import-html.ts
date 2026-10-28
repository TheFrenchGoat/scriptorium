// src/main/import-html.ts
// Outils communs aux imports de documents (ODT et Word).
//
// Un même document doit donner le même projet, quel que soit son format :
// les imports utilisent donc les mêmes fonctions pour lire les attributs
// XML, convertir la mise en forme en CSS et construire les paragraphes
// HTML de l'éditeur.

import path from 'node:path';
import {
  normalizeVisibleText,
  type ImportBlock
} from './import-chapters';

/** Texte brut et HTML d'une portion de paragraphe. */
export interface RenderedInline {
  text: string;
  html: string;
}

/** Mise en forme d'une portion de texte (undefined : non précisé). */
export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
}

/** Mise en forme utile pour détecter les titres visuels. */
export interface BlockFormat {
  centered: boolean;
  bold: boolean;
  fontSizePt: number | null;
}

/**
 * Caractères ayant un sens particulier dans une expression régulière.
 * Écrits sous forme de chaîne pour éviter toute séquence fragile au
 * copier-coller.
 */
const REGEX_SPECIAL_CHARS = '.*+?^${}()|[]\\';

/** Protège un texte pour l'insérer tel quel dans une expression régulière. */
function escapeRegExp(value: string): string {
  return Array.from(value)
    .map((char) => (REGEX_SPECIAL_CHARS.includes(char) ? '\\' + char : char))
    .join('');
}

function decodeCodePoint(codePoint: number): string {
  if (!Number.isFinite(codePoint)) {
    return '';
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '';
  }
}

/** Décode les entités XML les plus courantes. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => decodeCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal: string) => decodeCodePoint(parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Protège du texte destiné au HTML de l'éditeur. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Protège une valeur destinée à un attribut HTML. */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/** Remplace les polices LibreOffice par leurs équivalents Windows (mêmes métriques). */
export function mapLibreOfficeFontStack(value: string): string {
  const first = (value.split(',')[0] ?? '').replace(/["']/g, '').trim().toLowerCase();

  switch (first) {
    case 'liberation sans':
    case 'liberation sans narrow':
    case 'arimo':
      return 'Arial, sans-serif';
    case 'liberation serif':
    case 'tinos':
      return "'Times New Roman', serif";
    case 'liberation mono':
    case 'cousine':
      return "'Courier New', monospace";
    default:
      return value;
  }
}

/** Normalise un nom de police destiné au style HTML. */
export function normalizeFontFamily(value: string): string {
  return value
    .replace(/^["']+|["']+$/g, '')
    .replace(/[;{}]/g, '')
    .trim();
}

/** Lit la valeur d'un attribut XML. */
export function getXmlAttribute(source: string, attributeName: string): string | undefined {
  const escapedName = escapeRegExp(attributeName);
  const doubleQuoted = source.match(new RegExp(`${escapedName}\\s*=\\s*"([^"]*)"`, 'i'));

  if (doubleQuoted) {
    return decodeXmlEntities(doubleQuoted[1] ?? '');
  }

  const singleQuoted = source.match(new RegExp(`${escapedName}\\s*=\\s*'([^']*)'`, 'i'));

  if (singleQuoted) {
    return decodeXmlEntities(singleQuoted[1] ?? '');
  }

  return undefined;
}

/**
 * Transforme une couleur valide en couleur CSS.
 * Formes acceptées : #rgb, #rrggbb (avec ou sans transparence), rgb() et rgba().
 */
export function normalizeColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) {
    return normalized;
  }

  if (/^rgba?[(][0-9, .]+[)]$/i.test(normalized)) {
    return normalized;
  }

  return undefined;
}

/** Transforme une taille en taille CSS acceptée par le sanitizer (pt ou px). */
export function normalizeFontSize(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return /^[0-9.]+(?:pt|px)$/.test(normalized) ? normalized : undefined;
}

/**
 * Normalise un alignement de paragraphe (ODT : start/end ; Word : both...).
 * Retourne left, center, right, justify ou undefined.
 */
export function normalizeTextAlign(value: string | undefined): string | undefined {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'left':
    case 'start':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'justify':
    case 'both':
    case 'distribute':
      return 'justify';
    default:
      return undefined;
  }
}

/** Construit le style CSS d'une portion de texte. */
export function inlineStyleToCss(style: InlineStyle): string {
  const declarations: string[] = [];

  if (style.bold) {
    declarations.push('font-weight: bold');
  }

  if (style.italic) {
    declarations.push('font-style: italic');
  }

  if (style.underline) {
    declarations.push('text-decoration: underline');
  }

  if (style.color) {
    declarations.push(`color: ${style.color}`);
  }

  if (style.fontFamily) {
    declarations.push(`font-family: ${style.fontFamily}`);
  }

  if (style.fontSize) {
    declarations.push(`font-size: ${style.fontSize}`);
  }

  return declarations.join('; ');
}

/** Convertit une taille CSS ("20pt", "16px") en points. */
export function fontSizeToPt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^([0-9.]+)(pt|px)$/.exec(value);

  if (!match) {
    return null;
  }

  const size = parseFloat(match[1] ?? '');

  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  return match[2] === 'px' ? Math.round(size * 7.5) / 10 : size;
}

/**
 * Ajoute un paragraphe analysé à la liste.
 * Les paragraphes entièrement vides sont conservés afin de garder les
 * espacements du document.
 */
export function pushRenderedBlock(
  blocks: ImportBlock[],
  rendered: RenderedInline,
  headingLevel: number | null,
  blockStyle: string,
  format: BlockFormat
): void {
  const styleAttribute = blockStyle ? ` style="${escapeHtmlAttribute(blockStyle)}"` : '';

  blocks.push({
    text: normalizeVisibleText(rendered.text),
    headingLevel,
    centered: format.centered,
    bold: format.bold,
    fontSizePt: format.fontSizePt,
    html: `<div${styleAttribute}>${rendered.html || '<br>'}</div>`
  });
}

/** Détermine le nom du projet à partir du nom du fichier importé. */
export function projectNameFromFilePath(filePath: string): string {
  const baseName = path.basename(filePath, path.extname(filePath));

  return normalizeVisibleText(baseName) || 'Document importé';
}
