// src/main/docx-importer.ts
// Import d'un document Word (.docx).
//
// Un fichier DOCX est une archive ZIP contenant notamment word/document.xml
// (le texte) et word/styles.xml (les styles). Le document est converti en
// projet Scriptorium puis découpé en chapitres par import-chapters.ts,
// comme un document ODT.
//
// Un même document doit donner le même projet en ODT et en Word. La mise en
// forme est donc lue comme pour l'ODT :
// - les réglages par défaut du document (w:docDefaults) sont ignorés, comme
//   le style par défaut de LibreOffice ;
// - priorité : style de paragraphe, puis style de caractère, puis mise en
//   forme directe ;
// - les images, zones de texte, notes, commentaires, en-têtes, pieds de
//   page, suppressions suivies et textes masqués sont ignorés.

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  getExplicitChapterTitle,
  normalizeVisibleText,
  splitIntoChapters,
  type ImportBlock
} from './import-chapters';
import {
  decodeXmlEntities,
  escapeHtml,
  escapeHtmlAttribute,
  fontSizeToPt,
  getXmlAttribute,
  inlineStyleToCss,
  mapLibreOfficeFontStack,
  normalizeFontFamily,
  normalizeTextAlign,
  projectNameFromFilePath,
  pushRenderedBlock,
  type BlockFormat,
  type InlineStyle,
  type RenderedInline
} from './import-html';
import type { ImportedProject, ProjectData } from '../shared/types';

/** Style Word tel qu'il est déclaré dans styles.xml. */
interface DocxStyle {
  id: string;
  type: string;
  name: string;
  basedOn?: string;
  isDefault: boolean;
  outlineLevel?: number;
  textAlign?: string;
  run: InlineStyle;
}

/** Style Word après prise en compte de ses styles parents (w:basedOn). */
interface ResolvedDocxStyle {
  run: InlineStyle;
  textAlign?: string;
  outlineLevel?: number;
  nameLevel: number | null;
}

interface DocxStyles {
  styles: Map<string, DocxStyle>;
  defaultParagraphStyleId?: string;
  cache: Map<string, ResolvedDocxStyle | undefined>;
}

/** Portion de paragraphe : texte mis en forme ou saut de ligne manuel. */
type DocxPiece =
  | { kind: 'text'; text: string; html: string; style: InlineStyle; own: boolean }
  | { kind: 'break' };

/** Attributs de la première balise <tagName ...> trouvée (undefined si absente). */
function findElement(xml: string, tagName: string): string | undefined {
  const match = new RegExp(`<${tagName}(?=[\\s/>])([^>]*)>`, 'i').exec(xml);

  return match ? (match[1] ?? '') : undefined;
}

/** Contenu de la première balise <tagName>...</tagName> (undefined si absente). */
function findElementBody(xml: string, tagName: string): string | undefined {
  const match = new RegExp(
    `<${tagName}(?:\\s(?:[^>]*[^/>])?)?>([\\s\\S]*?)</${tagName}>`,
    'i'
  ).exec(xml);

  return match ? (match[1] ?? '') : undefined;
}

/** Supprime une balise et tout son contenu. */
function removeElement(xml: string, tagName: string): string {
  return xml
    .replace(new RegExp(`<${tagName}(?:\\s[^>]*)?/>`, 'gi'), '')
    .replace(
      new RegExp(`<${tagName}(?:\\s(?:[^>]*[^/>])?)?>[\\s\\S]*?</${tagName}>`, 'gi'),
      ''
    );
}

/** Retire du XML la portion correspondant à une recherche. */
function withoutMatch(xml: string, match: RegExpExecArray | null): string {
  if (!match) {
    return xml;
  }

  return xml.slice(0, match.index) + xml.slice(match.index + match[0].length);
}

/** Propriété Word activée ? (<w:b/> oui, <w:b w:val="0"/> non). */
function isOn(attributes: string): boolean {
  const value = getXmlAttribute(attributes, 'w:val');

  return value === undefined || !/^(?:0|false|off|none)$/i.test(value.trim());
}

/** Lit la mise en forme d'un bloc w:rPr. Les propriétés absentes restent undefined. */
function parseRunProperties(xml: string): InlineStyle {
  const style: InlineStyle = {};

  const bold = findElement(xml, 'w:b');
  if (bold !== undefined) {
    style.bold = isOn(bold);
  }

  const italic = findElement(xml, 'w:i');
  if (italic !== undefined) {
    style.italic = isOn(italic);
  }

  const underline = findElement(xml, 'w:u');
  if (underline !== undefined) {
    const value = getXmlAttribute(underline, 'w:val');
    style.underline = value === undefined || value.trim().toLowerCase() !== 'none';
  }

  const color = findElement(xml, 'w:color');
  if (color !== undefined) {
    const value = (getXmlAttribute(color, 'w:val') ?? '').trim();
    if (/^[0-9a-f]{6}$/i.test(value)) {
      style.color = '#' + value.toLowerCase();
    }
  }

  const fonts = findElement(xml, 'w:rFonts');
  if (fonts !== undefined) {
    const name = getXmlAttribute(fonts, 'w:ascii') ?? getXmlAttribute(fonts, 'w:hAnsi');
    const normalized = name ? normalizeFontFamily(name) : '';
    if (normalized) {
      style.fontFamily = mapLibreOfficeFontStack(normalized);
    }
  }

  const size = findElement(xml, 'w:sz');
  if (size !== undefined) {
    const halfPoints = Number.parseFloat(getXmlAttribute(size, 'w:val') ?? '');
    if (Number.isFinite(halfPoints) && halfPoints > 0) {
      style.fontSize = `${halfPoints / 2}pt`;
    }
  }

  return style;
}

/** Superpose deux mises en forme : les valeurs précisées de extra l'emportent. */
function mergeInline(base: InlineStyle, extra: InlineStyle): InlineStyle {
  return {
    bold: extra.bold ?? base.bold,
    italic: extra.italic ?? base.italic,
    underline: extra.underline ?? base.underline,
    color: extra.color ?? base.color,
    fontFamily: extra.fontFamily ?? base.fontFamily,
    fontSize: extra.fontSize ?? base.fontSize
  };
}

function hasInlineStyle(style: InlineStyle): boolean {
  return Object.values(style).some((value) => value !== undefined);
}

function readOutlineLevel(paragraphProps: string): number | undefined {
  const element = findElement(paragraphProps, 'w:outlineLvl');

  if (element === undefined) {
    return undefined;
  }

  const value = Number.parseInt(getXmlAttribute(element, 'w:val') ?? '', 10);

  return Number.isFinite(value) ? value : undefined;
}

function readTextAlign(paragraphProps: string): string | undefined {
  const element = findElement(paragraphProps, 'w:jc');

  return element === undefined ? undefined : normalizeTextAlign(getXmlAttribute(element, 'w:val'));
}

/** Niveau de titre d'après le nom du style ("heading 1", "Titre 2"...). */
function headingLevelFromName(name: string): number | null {
  const match = /^(?:heading|titre)\s*([1-9])$/i.exec(name.trim());

  if (!match) {
    return null;
  }

  const level = Number.parseInt(match[1] ?? '', 10);

  return Number.isFinite(level) ? level : null;
}

/** Lit les styles de paragraphe et de caractère de word/styles.xml. */
function parseDocxStyles(stylesXml: string): DocxStyles {
  const styles = new Map<string, DocxStyle>();
  let defaultParagraphStyleId: string | undefined;
  const stylePattern = /<w:style(\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:style>/gi;
  let match: RegExpExecArray | null;

  while ((match = stylePattern.exec(stylesXml)) !== null) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const id = getXmlAttribute(attributes, 'w:styleId');

    if (!id) {
      continue;
    }

    const type = (getXmlAttribute(attributes, 'w:type') ?? '').toLowerCase();
    const defaultRaw = getXmlAttribute(attributes, 'w:default');
    const isDefault = defaultRaw !== undefined && /^(?:1|true|on)$/i.test(defaultRaw.trim());
    const nameElement = findElement(body, 'w:name');
    const name = (nameElement === undefined ? undefined : getXmlAttribute(nameElement, 'w:val')) ?? id;
    const basedOnElement = findElement(body, 'w:basedOn');
    const basedOn = basedOnElement === undefined ? undefined : getXmlAttribute(basedOnElement, 'w:val');
    const paragraphProps = findElementBody(body, 'w:pPr') ?? '';
    const runProps = findElementBody(body, 'w:rPr') ?? '';

    styles.set(id, {
      id,
      type,
      name,
      basedOn,
      isDefault,
      outlineLevel: readOutlineLevel(paragraphProps),
      textAlign: readTextAlign(paragraphProps),
      run: parseRunProperties(runProps)
    });

    if (type === 'paragraph' && isDefault && defaultParagraphStyleId === undefined) {
      defaultParagraphStyleId = id;
    }
  }

  return { styles, defaultParagraphStyleId, cache: new Map() };
}

/** Fusionne un style et ses styles parents (w:basedOn). */
function resolveDocxStyle(
  styleId: string | undefined,
  data: DocxStyles,
  visited: Set<string>
): ResolvedDocxStyle | undefined {
  if (!styleId || visited.has(styleId)) {
    return undefined;
  }

  const own = data.styles.get(styleId);

  if (!own) {
    return undefined;
  }

  visited.add(styleId);

  const parent = resolveDocxStyle(own.basedOn, data, visited);

  return {
    run: mergeInline(parent?.run ?? {}, own.run),
    textAlign: own.textAlign ?? parent?.textAlign,
    outlineLevel: own.outlineLevel ?? parent?.outlineLevel,
    nameLevel: headingLevelFromName(own.name) ?? headingLevelFromName(own.id) ?? parent?.nameLevel ?? null
  };
}

function getResolvedStyle(styleId: string | undefined, data: DocxStyles): ResolvedDocxStyle | undefined {
  if (!styleId) {
    return undefined;
  }

  if (data.cache.has(styleId)) {
    return data.cache.get(styleId);
  }

  const resolved = resolveDocxStyle(styleId, data, new Set<string>());
  data.cache.set(styleId, resolved);

  return resolved;
}

/** Niveau de titre : w:outlineLvl (0-8 donne 1-9), sinon nom du style. */
function getHeadingLevel(directOutline: number | undefined, style: ResolvedDocxStyle | undefined): number | null {
  const outline = directOutline ?? style?.outlineLevel;

  if (outline !== undefined) {
    return outline >= 0 && outline <= 8 ? outline + 1 : null;
  }

  return style?.nameLevel ?? null;
}

/**
 * Retire du document ce qui n'est pas importé : zones de texte, images,
 * objets, suppressions suivies, codes de champs, historique de mise en forme.
 * Pour les contenus alternatifs (mc:AlternateContent), seul mc:Choice est
 * gardé afin d'éviter les doublons. Les liens gardent leur texte, sans le
 * style de lien.
 */
function cleanDocumentXml(xml: string): string {
  let result = xml;

  [
    'w:txbxContent',
    'mc:Fallback',
    'w:drawing',
    'w:pict',
    'w:object',
    'w:del',
    'w:moveFrom',
    'w:pPrChange',
    'w:rPrChange',
    'w:instrText',
    'w:delText'
  ].forEach((tagName) => {
    result = removeElement(result, tagName);
  });

  result = result.replace(/<\/?mc:(?:AlternateContent|Choice)(?:\s[^>]*)?>/gi, '');

  return result.replace(
    /<w:hyperlink(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:hyperlink>/gi,
    (_match, inner: string) => inner.replace(/<w:rStyle(?:\s[^>]*)?\/?>/gi, '')
  );
}

/** Ajoute le contenu d'un run (texte, tabulations, sauts de ligne). */
function appendRunContent(pieces: DocxPiece[], runBody: string, style: InlineStyle, own: boolean): void {
  const tokenPattern =
    /<w:t(?:\s[^>]*)?\/>|<w:t(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:t>|<w:p?tab(?:\s[^>]*)?\/?>|<w:(?:br|cr)(?:\s[^>]*)?\/?>|<w:noBreakHyphen(?:\s[^>]*)?\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(runBody)) !== null) {
    const token = match[0];

    if (/^<w:t[\s\/>]/i.test(token)) {
      const text = decodeXmlEntities(match[1] ?? '');

      if (text) {
        pieces.push({ kind: 'text', text, html: escapeHtml(text), style, own });
      }
    } else if (/^<w:p?tab/i.test(token)) {
      pieces.push({ kind: 'text', text: '\t', html: '    ', style, own });
    } else if (/^<w:br/i.test(token)) {
      const type = (getXmlAttribute(token, 'w:type') ?? '').toLowerCase();

      /* Les sauts de page et de colonne sont ignorés. */
      if (type === '' || type === 'textwrapping') {
        pieces.push({ kind: 'break' });
      }
    } else if (/^<w:cr/i.test(token)) {
      pieces.push({ kind: 'break' });
    } else {
      pieces.push({ kind: 'text', text: '-', html: '-', style, own });
    }
  }
}

/** Analyse les runs d'un paragraphe (y compris dans les liens et insertions). */
function parseRuns(content: string, data: DocxStyles, base: InlineStyle): DocxPiece[] {
  const pieces: DocxPiece[] = [];
  const runPattern = /<w:r(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:r>/gi;
  let match: RegExpExecArray | null;

  while ((match = runPattern.exec(content)) !== null) {
    const runXml = match[1] ?? '';
    const runPropsMatch = /<w:rPr(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:rPr>/i.exec(runXml);
    const runProps = runPropsMatch?.[1] ?? '';
    const vanish = findElement(runProps, 'w:vanish');

    if (vanish !== undefined && isOn(vanish)) {
      continue;
    }

    const charStyleElement = findElement(runProps, 'w:rStyle');
    const charStyleId = charStyleElement === undefined ? undefined : getXmlAttribute(charStyleElement, 'w:val');
    const charStyle = getResolvedStyle(charStyleId, data);
    const ownStyle = mergeInline(charStyle?.run ?? {}, parseRunProperties(runProps));

    appendRunContent(
      pieces,
      withoutMatch(runXml, runPropsMatch),
      mergeInline(base, ownStyle),
      hasInlineStyle(ownStyle)
    );
  }

  return pieces;
}

function splitAtBreaks(pieces: DocxPiece[]): DocxPiece[][] {
  const parts: DocxPiece[][] = [[]];

  pieces.forEach((piece) => {
    if (piece.kind === 'break') {
      parts.push([]);
    } else {
      parts[parts.length - 1]?.push(piece);
    }
  });

  return parts;
}

/**
 * Mesure le gras et la taille dominante (même règle que l'ODT) : gras si
 * plus de la moitié du texte l'est ; taille couvrant le plus de caractères.
 */
function measurePieces(pieces: DocxPiece[]): { bold: boolean; fontSizePt: number | null } {
  let total = 0;
  let boldChars = 0;
  const sizes = new Map<number, number>();

  pieces.forEach((piece) => {
    if (piece.kind !== 'text') {
      return;
    }

    const length = normalizeVisibleText(piece.text).length;

    if (length === 0) {
      return;
    }

    total += length;

    if (piece.style.bold === true) {
      boldChars += length;
    }

    const pt = fontSizeToPt(piece.style.fontSize);

    if (pt !== null) {
      sizes.set(pt, (sizes.get(pt) ?? 0) + length);
    }
  });

  let fontSizePt: number | null = null;
  let bestCount = 0;

  sizes.forEach((count, size) => {
    if (count > bestCount) {
      bestCount = count;
      fontSizePt = size;
    }
  });

  return { bold: total > 0 && boldChars * 2 > total, fontSizePt };
}

/**
 * Construit le HTML d'un paragraphe : le style du paragraphe englobe le tout,
 * chaque run mis en forme reçoit son propre span (les runs voisins identiques
 * sont regroupés).
 */
function renderPieces(pieces: DocxPiece[], base: InlineStyle): RenderedInline {
  let text = '';
  let html = '';
  let openCss = '';

  const closeSpan = (): void => {
    if (openCss) {
      html += '</span>';
      openCss = '';
    }
  };

  pieces.forEach((piece) => {
    if (piece.kind === 'break') {
      closeSpan();
      text += '\n';
      html += '<br>';
      return;
    }

    const css = piece.own ? inlineStyleToCss(piece.style) : '';

    if (css !== openCss) {
      closeSpan();

      if (css) {
        html += `<span style="${escapeHtmlAttribute(css)}">`;
        openCss = css;
      }
    }

    text += piece.text;
    html += piece.html;
  });

  closeSpan();

  const baseCss = inlineStyleToCss(base);

  if (baseCss && html) {
    return { text, html: `<span style="${escapeHtmlAttribute(baseCss)}">${html}</span>` };
  }

  return { text, html };
}

/** Analyse les paragraphes de word/document.xml (tableaux compris). */
function parseDocxBlocks(documentXml: string, data: DocxStyles): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  const xml = cleanDocumentXml(documentXml);
  const paragraphPattern = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:p>/gi;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(xml)) !== null) {
    const inner = match[1] ?? '';
    const paragraphPropsMatch = /<w:pPr(?:\s(?:[^>]*[^\/>])?)?>([\s\S]*?)<\/w:pPr>/i.exec(inner);
    const paragraphProps = paragraphPropsMatch?.[1] ?? '';
    const content = withoutMatch(inner, paragraphPropsMatch);

    const styleElement = findElement(paragraphProps, 'w:pStyle');
    const styleId = styleElement === undefined ? undefined : getXmlAttribute(styleElement, 'w:val');
    const style = getResolvedStyle(styleId, data) ?? getResolvedStyle(data.defaultParagraphStyleId, data);

    const textAlign = readTextAlign(paragraphProps) ?? style?.textAlign;
    const headingLevel = getHeadingLevel(readOutlineLevel(paragraphProps), style);
    const blockStyle = textAlign ? `text-align: ${textAlign}` : '';
    const base = style?.run ?? {};
    const centered = textAlign === 'center';
    const pieces = parseRuns(content, data, base);

    const formatOf = (part: DocxPiece[]): BlockFormat => ({
      centered,
      ...measurePieces(part)
    });

    /*
     * Comme pour l'ODT : un "Chapitre X" placé après un saut de ligne manuel
     * dans le même paragraphe est séparé du reste. Sinon le paragraphe reste
     * entier.
     */
    const parts = splitAtBreaks(pieces);

    if (parts.length > 1) {
      const renderedParts = parts.map((part) => renderPieces(part, base));

      if (renderedParts.some((part) => getExplicitChapterTitle(part.text) !== null)) {
        renderedParts.forEach((renderedPart, partIndex) => {
          if (!normalizeVisibleText(renderedPart.text) && !renderedPart.html.trim()) {
            return;
          }

          pushRenderedBlock(blocks, renderedPart, headingLevel, blockStyle, formatOf(parts[partIndex] ?? []));
        });

        continue;
      }
    }

    pushRenderedBlock(blocks, renderPieces(pieces, base), headingLevel, blockStyle, formatOf(pieces));
  }

  return blocks;
}

/** Importe un fichier Word (.docx) et le transforme en projet Scriptorium. */
export function importDocxProject(filePath: string): ImportedProject {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error("Le fichier sélectionné n'est pas un document Word (.docx) valide.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error('Le fichier Word sélectionné est introuvable.');
  }

  let archive: AdmZip;

  try {
    archive = new AdmZip(filePath);
  } catch {
    throw new Error("Impossible d'ouvrir le document Word. Le fichier est peut-être endommagé.");
  }

  const documentEntry = archive.getEntry('word/document.xml');

  if (!documentEntry) {
    throw new Error('Document Word invalide : le fichier word/document.xml est absent.');
  }

  let documentXml: string;
  let stylesXml: string;

  try {
    documentXml = documentEntry.getData().toString('utf-8');
    const stylesEntry = archive.getEntry('word/styles.xml');
    stylesXml = stylesEntry ? stylesEntry.getData().toString('utf-8') : '';
  } catch {
    throw new Error("Impossible de lire le document Word. Le fichier est peut-être endommagé.");
  }

  const blocks = parseDocxBlocks(documentXml, parseDocxStyles(stylesXml));

  if (!blocks.some((block) => block.text.length > 0)) {
    throw new Error('Le document Word ne contient aucun texte importable.');
  }

  const projectData: ProjectData = {
    chapters: splitIntoChapters(blocks),
    world: {},
    customWbTypes: {},
    writingSessions: [],
    goals: []
  };

  return {
    projectName: projectNameFromFilePath(filePath),
    projectData
  };
}
