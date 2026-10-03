// src/main/odt-importer.ts
// Import d'un document LibreOffice Writer (.odt).
//
// Un fichier ODT est une archive ZIP contenant notamment content.xml et
// styles.xml. Le document est converti en projet Scriptorium puis découpé
// automatiquement en chapitres.
//
// Règles de découpage :
// - les paragraphes nommés "Chapitre 1", "Chapitre II", "Chapter 3", etc.
//   deviennent des séparateurs de chapitres ;
// - Prologue et Épilogue sont également reconnus ;
// - si aucun titre explicite n'est trouvé, les titres de niveau 1 sont utilisés ;
// - tout texte situé avant le premier chapitre devient "Introduction" ;
// - le paragraphe contenant le titre du chapitre n'est pas ajouté au contenu
//   du chapitre.
//
// La conversion ne cherche pas à reproduire toute la mise en page de
// LibreOffice. Elle conserve les éléments utiles à l'éditeur : paragraphes,
// sauts de ligne, gras, italique, souligné, couleur, police et taille.

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { sanitizeChapterHtml } from './sanitize';
import type {
  ImportedProject,
  ProjectData
} from '../shared/types';

interface OdtStyle {
  name: string;
  parentStyleName?: string;
  family?: string;
  outlineLevel?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  textAlign?: string;
}

interface ParsedBlock {
  text: string;
  html: string;
  headingLevel: number | null;
}

interface RenderedInline {
  text: string;
  html: string;
}

interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
}

const CHAPTER_NUMBER_PATTERN =
  String.raw`(?:\d+|[ivxlcdm]+|premier|première|premiere|one)`;

/**
 * Décode les entités XML les plus courantes.
 */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = parseInt(hex, 16);

      if (!Number.isFinite(codePoint)) {
        return '';
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return '';
      }
    })
    .replace(/&#([0-9]+);/g, (_match, decimal: string) => {
      const codePoint = parseInt(decimal, 10);

      if (!Number.isFinite(codePoint)) {
        return '';
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return '';
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Protège du texte destiné à être inséré dans le HTML de l'éditeur.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Protège une valeur destinée à un attribut HTML.
 */
function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/**
 * Normalise le texte provenant du XML LibreOffice.
 *
 * LibreOffice peut insérer :
 * - des espaces insécables ;
 * - des espaces insécables fines ;
 * - des caractères de largeur nulle ;
 * - des césures conditionnelles ;
 * - des retours à la ligne autour des balises XML.
 *
 * Sans cette normalisation, un texte visuellement égal à "Chapitre 1" peut
 * ne pas correspondre à l'expression régulière de détection.
 */
function normalizeVisibleText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00AD/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Normalise un nom de police destiné au style HTML.
 */
function normalizeFontFamily(value: string): string {
  return value
    .replace(/^["']+|["']+$/g, '')
    .replace(/[;{}]/g, '')
    .trim();
}

/**
 * Lit la valeur d'un attribut XML.
 */
function getXmlAttribute(
  source: string,
  attributeName: string
): string | undefined {
  const escapedName = attributeName.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  const doubleQuoted = source.match(
    new RegExp(
      `${escapedName}\\s*=\\s*"([^"]*)"`,
      'i'
    )
  );

  if (doubleQuoted) {
    return decodeXmlEntities(doubleQuoted[1]);
  }

  const singleQuoted = source.match(
    new RegExp(
      `${escapedName}\\s*=\\s*'([^']*)'`,
      'i'
    )
  );

  if (singleQuoted) {
    return decodeXmlEntities(singleQuoted[1]);
  }

  return undefined;
}

/**
 * Transforme une couleur ODT valide en couleur CSS.
 */
function normalizeColor(
  value: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) {
    return normalized;
  }

  if (/^rgba?$[0-9, .]+$$/i.test(normalized)) {
    return normalized;
  }

  return undefined;
}

/**
 * Transforme une taille ODT en taille CSS acceptée par le sanitizer.
 */
function normalizeFontSize(
  value: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (/^[0-9.]+(?:pt|px)$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

/**
 * Extrait les styles déclarés dans styles.xml et content.xml.
 */
function parseStyles(
  ...xmlDocuments: string[]
): Map<string, OdtStyle> {
  const styles = new Map<string, OdtStyle>();

  const stylePattern =
    /<style:style\b([^>]*)>([\s\S]*?)<\/style:style>/gi;

  xmlDocuments.forEach((xml) => {
    let match: RegExpExecArray | null;

    while ((match = stylePattern.exec(xml)) !== null) {
      const attributes = match[1];
      const body = match[2];

      const name = getXmlAttribute(
        attributes,
        'style:name'
      );

      if (!name) {
        continue;
      }

      const parentStyleName = getXmlAttribute(
        attributes,
        'style:parent-style-name'
      );

      const family = getXmlAttribute(
        attributes,
        'style:family'
      );

      const outlineLevelRaw = getXmlAttribute(
        attributes,
        'style:default-outline-level'
      );

      const textPropertiesMatch = body.match(
        /<style:text-properties\b([^>]*)\/?>/i
      );

      const paragraphPropertiesMatch = body.match(
        /<style:paragraph-properties\b([^>]*)\/?>/i
      );

      const textProperties =
        textPropertiesMatch?.[1] ?? '';

      const paragraphProperties =
        paragraphPropertiesMatch?.[1] ?? '';

      const fontWeight =
        getXmlAttribute(
          textProperties,
          'fo:font-weight'
        ) ??
        getXmlAttribute(
          textProperties,
          'style:font-weight-asian'
        );

      const fontStyle =
        getXmlAttribute(
          textProperties,
          'fo:font-style'
        ) ??
        getXmlAttribute(
          textProperties,
          'style:font-style-asian'
        );

      const underlineStyle = getXmlAttribute(
        textProperties,
        'style:text-underline-style'
      );

      const fontFamilyRaw =
        getXmlAttribute(
          textProperties,
          'fo:font-family'
        ) ??
        getXmlAttribute(
          textProperties,
          'style:font-name'
        );

      const fontSizeRaw = getXmlAttribute(
        textProperties,
        'fo:font-size'
      );

      const colorRaw = getXmlAttribute(
        textProperties,
        'fo:color'
      );

      const textAlign = getXmlAttribute(
        paragraphProperties,
        'fo:text-align'
      );

      const parsedOutlineLevel = outlineLevelRaw
        ? parseInt(outlineLevelRaw, 10)
        : NaN;

      styles.set(name, {
        name,
        parentStyleName,
        family,
        outlineLevel: Number.isFinite(
          parsedOutlineLevel
        )
          ? parsedOutlineLevel
          : undefined,
        bold:
          fontWeight === 'bold' ||
          (
            fontWeight !== undefined &&
            Number(fontWeight) >= 600
          ),
        italic: fontStyle === 'italic',
        underline:
          underlineStyle !== undefined &&
          underlineStyle !== 'none',
        color: normalizeColor(colorRaw),
        fontFamily: fontFamilyRaw
          ? normalizeFontFamily(fontFamilyRaw)
          : undefined,
        fontSize: normalizeFontSize(fontSizeRaw),
        textAlign:
          textAlign &&
          /^(left|right|center|justify)$/i.test(
            textAlign
          )
            ? textAlign.toLowerCase()
            : undefined
      });
    }
  });

  return styles;
}

/**
 * Fusionne un style et ses éventuels styles parents.
 */
function resolveStyle(
  styleName: string | undefined,
  styles: Map<string, OdtStyle>,
  visited = new Set<string>()
): OdtStyle | undefined {
  if (!styleName || visited.has(styleName)) {
    return undefined;
  }

  const ownStyle = styles.get(styleName);

  if (!ownStyle) {
    return undefined;
  }

  visited.add(styleName);

  const parentStyle = resolveStyle(
    ownStyle.parentStyleName,
    styles,
    visited
  );

  return {
    ...(parentStyle ?? { name: styleName }),
    ...Object.fromEntries(
      Object.entries(ownStyle).filter(
        ([, value]) => value !== undefined
      )
    ),
    name: ownStyle.name
  };
}

/**
 * Retourne les propriétés de texte utiles pour une balise <span>.
 */
function inlineStyleFromOdtStyle(
  style: OdtStyle | undefined
): InlineStyle {
  if (!style) {
    return {};
  }

  return {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize
  };
}

/**
 * Construit le style CSS d'une portion de texte.
 */
function inlineStyleToCss(style: InlineStyle): string {
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
    declarations.push(
      `font-family: ${style.fontFamily}`
    );
  }

  if (style.fontSize) {
    declarations.push(
      `font-size: ${style.fontSize}`
    );
  }

  return declarations.join('; ');
}

/**
 * Convertit le contenu XML d'un paragraphe en HTML compatible avec l'éditeur.
 */
function renderInlineXml(
  xml: string,
  styles: Map<string, OdtStyle>,
  inheritedStyle: InlineStyle = {}
): RenderedInline {
  let plainText = '';
  let html = '';
  let cursor = 0;

  const tokenPattern =
    /<text:span\b([^>]*)>([\s\S]*?)<\/text:span>|<text:a\b[^>]*>([\s\S]*?)<\/text:a>|<text:s\b([^>]*)\/?>|<text:tab\b[^>]*\/?>|<text:line-break\b[^>]*\/?>|<text:soft-page-break\b[^>]*\/?>|<[^>]+>/gi;

  let match: RegExpExecArray | null;

  const appendText = (rawText: string): void => {
    if (!rawText) {
      return;
    }

    const decoded = decodeXmlEntities(rawText);

    plainText += decoded;
    html += escapeHtml(decoded);
  };

  while ((match = tokenPattern.exec(xml)) !== null) {
    appendText(xml.slice(cursor, match.index));

    const fullToken = match[0];

    if (/^<text:span\b/i.test(fullToken)) {
      const spanAttributes = match[1] ?? '';
      const spanContent = match[2] ?? '';

      const spanStyleName = getXmlAttribute(
        spanAttributes,
        'text:style-name'
      );

      const resolvedSpanStyle = resolveStyle(
        spanStyleName,
        styles
      );

      const mergedStyle: InlineStyle = {
        ...inheritedStyle,
        ...Object.fromEntries(
          Object.entries(
            inlineStyleFromOdtStyle(
              resolvedSpanStyle
            )
          ).filter(
            ([, value]) => value !== undefined
          )
        )
      };

      const renderedSpan = renderInlineXml(
        spanContent,
        styles,
        mergedStyle
      );

      const css = inlineStyleToCss(mergedStyle);

      plainText += renderedSpan.text;

      if (css) {
        html += `<span style="${escapeHtmlAttribute(
          css
        )}">${renderedSpan.html}</span>`;
      } else {
        html += renderedSpan.html;
      }
    } else if (/^<text:a\b/i.test(fullToken)) {
      const linkContent = match[3] ?? '';

      const renderedLink = renderInlineXml(
        linkContent,
        styles,
        inheritedStyle
      );

      plainText += renderedLink.text;
      html += renderedLink.html;
    } else if (/^<text:s\b/i.test(fullToken)) {
      const spaceAttributes = match[4] ?? '';

      const countRaw = getXmlAttribute(
        spaceAttributes,
        'text:c'
      );

      const parsedCount = countRaw
        ? parseInt(countRaw, 10)
        : 1;

      const count =
        Number.isFinite(parsedCount) &&
        parsedCount > 0
          ? Math.min(parsedCount, 100)
          : 1;

      const spaces = ' '.repeat(count);

      plainText += spaces;
      html += spaces;
    } else if (/^<text:tab\b/i.test(fullToken)) {
      plainText += '\t';
      html += '    ';
    } else if (
      /^<text:line-break\b/i.test(fullToken)
    ) {
      plainText += '\n';
      html += '<br>';
    } else if (
      /^<text:soft-page-break\b/i.test(
        fullToken
      )
    ) {
      plainText += '\n';
      html += '<br>';
    }

    cursor = tokenPattern.lastIndex;
  }

  appendText(xml.slice(cursor));

  const ownCss = inlineStyleToCss(inheritedStyle);

  if (ownCss && html) {
    return {
      text: plainText,
      html: `<span style="${escapeHtmlAttribute(
        ownCss
      )}">${html}</span>`
    };
  }

  return {
    text: plainText,
    html
  };
}

/**
 * Détecte un titre explicite de chapitre.
 *
 * La valeur retournée devient le nom du chapitre. Une valeur null signifie
 * que le bloc n'est pas un séparateur.
 */
function getExplicitChapterTitle(
  rawText: string
): string | null {
  let text = normalizeVisibleText(rawText);

  if (!text) {
    return null;
  }

  /*
   * Supprime les décorations parfois utilisées autour des titres :
   * "— Chapitre 1 —", "• Chapitre 1", etc.
   */
  text = text
    .replace(/^[•·▪◦\-–—]+\s*/u, '')
    .replace(/\s*[•·▪◦\-–—]+$/u, '')
    .trim();

  if (/^prologue(?:\s*[:.\-–—]\s*)?$/iu.test(text)) {
    return 'Prologue';
  }

  if (
    /^épilogue(?:\s*[:.\-–—]\s*)?$/iu.test(text) ||
    /^epilogue(?:\s*[:.\-–—]\s*)?$/iu.test(text)
  ) {
    return 'Épilogue';
  }

  /*
   * Formes reconnues :
   *
   * Chapitre 1
   * Chapitre 1 :
   * Chapitre 1 : Le départ
   * Chapitre 1 — Le départ
   * Chapitre 1 Le départ
   * Chapitre I
   * CHAPTER 1
   * Chapitre n° 1
   */
  const pattern = new RegExp(
    String.raw`^(chapitre|chapter)\s*(?:n\s*[°ºo]?\s*)?(${CHAPTER_NUMBER_PATTERN})(?:\s*(?:[:.\-–—]\s*(.*)|\s+(.+)))?$`,
    'iu'
  );

  const match = text.match(pattern);

  if (!match) {
    return null;
  }

  const languageWord = match[1];
  const number = match[2];
  const subtitle = normalizeVisibleText(
    match[3] ?? match[4] ?? ''
  )
    .replace(/^[\-–—:.\s]+/u, '')
    .replace(/[\-–—:.\s]+$/u, '')
    .trim();

  const baseTitle = `${languageWord} ${number}`;

  return subtitle
    ? `${baseTitle} — ${subtitle}`
    : baseTitle;
}

/**
 * Retourne le niveau de titre d'un paragraphe ODT.
 */
function getHeadingLevel(
  tagName: string,
  attributes: string,
  style: OdtStyle | undefined
): number | null {
  const directOutlineLevel = getXmlAttribute(
    attributes,
    'text:outline-level'
  );

  if (directOutlineLevel) {
    const parsed = parseInt(
      directOutlineLevel,
      10
    );

    if (
      Number.isFinite(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  if (
    style?.outlineLevel &&
    style.outlineLevel > 0
  ) {
    return style.outlineLevel;
  }

  if (tagName.toLowerCase() === 'text:h') {
    return 1;
  }

  return null;
}

/**
 * Construit l'attribut style du bloc de paragraphe.
 */
function buildBlockStyle(
  style: OdtStyle | undefined
): string {
  const declarations: string[] = [];

  if (
    style?.textAlign &&
    /^(left|right|center|justify)$/.test(
      style.textAlign
    )
  ) {
    declarations.push(
      `text-align: ${style.textAlign}`
    );
  }

  return declarations.join('; ');
}

/**
 * Ajoute un bloc analysé à la liste.
 */
function pushRenderedBlock(
  blocks: ParsedBlock[],
  rendered: RenderedInline,
  headingLevel: number | null,
  blockStyle: string
): void {
  const text = normalizeVisibleText(
    rendered.text
  );

  const styleAttribute = blockStyle
    ? ` style="${escapeHtmlAttribute(
        blockStyle
      )}"`
    : '';

  /*
   * Les paragraphes entièrement vides sont conservés afin de ne pas supprimer
   * volontairement les espacements du document.
   */
  blocks.push({
    text,
    headingLevel,
    html: `<div${styleAttribute}>${
      rendered.html || '<br>'
    }</div>`
  });
}

/**
 * Analyse les paragraphes et titres contenus dans content.xml.
 */
function parseBlocks(
  contentXml: string,
  styles: Map<string, OdtStyle>
): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  const blockPattern =
    /<(text:p|text:h)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = blockPattern.exec(contentXml)) !==
    null
  ) {
    const tagName = match[1];
    const attributes = match[2] ?? '';
    const innerXml = match[3] ?? '';

    const styleName = getXmlAttribute(
      attributes,
      'text:style-name'
    );

    const resolvedStyle = resolveStyle(
      styleName,
      styles
    );

    const headingLevel = getHeadingLevel(
      tagName,
      attributes,
      resolvedStyle
    );

    const blockStyle = buildBlockStyle(
      resolvedStyle
    );

    const baseInlineStyle =
      inlineStyleFromOdtStyle(resolvedStyle);

    /*
     * LibreOffice peut placer "Chapitre 1" après un saut de ligne manuel dans
     * le même paragraphe que le texte précédent. Dans ce cas, analyser tout le
     * paragraphe d'un bloc empêcherait la reconnaissance du chapitre.
     *
     * On teste donc chaque portion séparée par un saut manuel. On ne découpe
     * réellement le paragraphe que si l'une de ces portions est un titre de
     * chapitre explicite.
     */
    const manualLineParts = innerXml.split(
      /<text:(?:line-break|soft-page-break)\b[^>]*\/?>/gi
    );

    if (manualLineParts.length > 1) {
      const renderedParts = manualLineParts.map(
        (part) =>
          renderInlineXml(
            part,
            styles,
            baseInlineStyle
          )
      );

      const containsExplicitChapter =
        renderedParts.some(
          (part) =>
            getExplicitChapterTitle(
              part.text
            ) !== null
        );

      if (containsExplicitChapter) {
        renderedParts.forEach(
          (renderedPart) => {
            /*
             * Une portion totalement vide issue d'un saut adjacent n'a pas
             * besoin de devenir un paragraphe séparé.
             */
            if (
              !normalizeVisibleText(
                renderedPart.text
              ) &&
              !renderedPart.html.trim()
            ) {
              return;
            }

            pushRenderedBlock(
              blocks,
              renderedPart,
              headingLevel,
              blockStyle
            );
          }
        );

        continue;
      }
    }

    const rendered = renderInlineXml(
      innerXml,
      styles,
      baseInlineStyle
    );

    pushRenderedBlock(
      blocks,
      rendered,
      headingLevel,
      blockStyle
    );
  }

  return blocks;
}

/**
 * Nettoie le nom proposé pour un chapitre.
 */
function cleanChapterName(
  value: string,
  fallback: string
): string {
  const normalized = normalizeVisibleText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || fallback;
}

/**
 * Empêche deux chapitres importés de porter exactement le même nom.
 */
function uniqueChapterName(
  chapters: Record<string, string>,
  requestedName: string
): string {
  if (!(requestedName in chapters)) {
    return requestedName;
  }

  let index = 2;

  while (
    `${requestedName} (${index})` in chapters
  ) {
    index++;
  }

  return `${requestedName} (${index})`;
}

/**
 * Découpe les blocs du document en chapitres.
 */
function splitIntoChapters(
  blocks: ParsedBlock[]
): Record<string, string> {
  const chapters: Record<string, string> = {};

  const explicitTitles = blocks.map(
    (block) =>
      getExplicitChapterTitle(block.text)
  );

  const hasExplicitTitles =
    explicitTitles.some(
      (title) => title !== null
    );

  /*
   * Si aucun "Chapitre X" n'est présent, on utilise les titres de niveau 1.
   */
  const isSeparator = (
    block: ParsedBlock,
    index: number
  ): boolean => {
    if (hasExplicitTitles) {
      return explicitTitles[index] !== null;
    }

    return (
      block.headingLevel === 1 &&
      block.text.length > 0
    );
  };

  const separatorTitle = (
    block: ParsedBlock,
    index: number
  ): string => {
    const explicitTitle =
      explicitTitles[index];

    if (explicitTitle) {
      return cleanChapterName(
        explicitTitle,
        `Chapitre ${
          Object.keys(chapters).length + 1
        }`
      );
    }

    return cleanChapterName(
      block.text,
      `Chapitre ${
        Object.keys(chapters).length + 1
      }`
    );
  };

  let currentChapterName: string | null =
    null;

  let currentChapterBlocks: string[] = [];

  const introductionBlocks: string[] = [];

  const flushCurrentChapter = (): void => {
    if (!currentChapterName) {
      return;
    }

    const uniqueName = uniqueChapterName(
      chapters,
      currentChapterName
    );

    chapters[uniqueName] =
      sanitizeChapterHtml(
        currentChapterBlocks.join('')
      );

    currentChapterName = null;
    currentChapterBlocks = [];
  };

  blocks.forEach((block, index) => {
    if (isSeparator(block, index)) {
      flushCurrentChapter();

      currentChapterName =
        separatorTitle(block, index);

      /*
       * Le bloc du titre sert uniquement de séparateur. Il ne doit pas être
       * placé dans l'Introduction ni dans le contenu du nouveau chapitre.
       */
      return;
    }

    if (!currentChapterName) {
      introductionBlocks.push(block.html);
      return;
    }

    currentChapterBlocks.push(block.html);
  });

  flushCurrentChapter();

  const introductionHtml =
    sanitizeChapterHtml(
      introductionBlocks.join('')
    );

  /*
   * L'Introduction est insérée avant tous les chapitres uniquement lorsqu'il
   * existe réellement du contenu visible avant le premier séparateur.
   */
  const introductionText =
    normalizeVisibleText(
      introductionHtml.replace(/<[^>]+>/g, ' ')
    );

  if (introductionText) {
    return {
      Introduction: introductionHtml,
      ...chapters
    };
  }

  /*
   * Si aucun séparateur n'a été trouvé, tout le document devient un chapitre.
   */
  if (Object.keys(chapters).length === 0) {
    const completeHtml =
      sanitizeChapterHtml(
        blocks
          .map((block) => block.html)
          .join('')
      );

    return {
      'Chapitre 1': completeHtml
    };
  }

  return chapters;
}

/**
 * Détermine le nom de projet à partir du nom du fichier ODT.
 */
function projectNameFromFilePath(
  filePath: string
): string {
  const baseName = path.basename(
    filePath,
    path.extname(filePath)
  );

  const normalized = normalizeVisibleText(
    baseName
  );

  return normalized || 'Document importé';
}

/**
 * Importe un fichier ODT et le transforme en projet Scriptorium.
 */
export function importOdtProject(
  filePath: string
): ImportedProject {
  if (
    typeof filePath !== 'string' ||
    path.extname(filePath).toLowerCase() !==
      '.odt'
  ) {
    throw new Error(
      "Le fichier sélectionné n'est pas un document ODT valide."
    );
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Le fichier ODT sélectionné est introuvable.'
    );
  }

  let archive: AdmZip;

  try {
    archive = new AdmZip(filePath);
  } catch {
    throw new Error(
      "Impossible d'ouvrir le document ODT. Le fichier est peut-être endommagé."
    );
  }

  const contentEntry =
    archive.getEntry('content.xml');

  if (!contentEntry) {
    throw new Error(
      "Document ODT invalide : le fichier content.xml est absent."
    );
  }

  const contentXml =
    contentEntry.getData().toString('utf-8');

  const stylesEntry =
    archive.getEntry('styles.xml');

  const stylesXml = stylesEntry
    ? stylesEntry.getData().toString('utf-8')
    : '';

  const styles = parseStyles(
    stylesXml,
    contentXml
  );

  const blocks = parseBlocks(
    contentXml,
    styles
  );

  if (blocks.length === 0) {
    throw new Error(
      'Le document ODT ne contient aucun texte importable.'
    );
  }

  const chapters = splitIntoChapters(
    blocks
  );

  const projectData: ProjectData = {
    chapters,
    world: {},
    customWbTypes: {},
    writingSessions: [],
    goals: []
  };

  return {
    projectName:
      projectNameFromFilePath(filePath),
    projectData
  };
}
