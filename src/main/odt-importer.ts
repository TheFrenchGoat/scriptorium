// src/main/odt-importer.ts
// Import d'un document LibreOffice Writer (.odt).
//
// Un fichier ODT est une archive ZIP contenant notamment content.xml et
// styles.xml. Le document est converti en projet Scriptorium puis découpé
// automatiquement en chapitres.
//
// Le découpage en chapitres est commun à tous les imports de documents :
// voir import-chapters.ts (Chapitre X, titres du document, puis titres
// visuels centrés, en gras ou en grand).
//
// La conversion ne cherche pas à reproduire toute la mise en page de
// LibreOffice. Elle conserve les éléments utiles à l'éditeur : paragraphes,
// sauts de ligne, gras, italique, souligné, couleur, police et taille.

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  getExplicitChapterTitle,
  splitIntoChapters,
  type ImportBlock
} from './import-chapters';
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

/** Bloc commun aux imports : texte, HTML, niveau de titre et mise en forme. */
type ParsedBlock = ImportBlock;

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

/**
 * Caractères ayant un sens particulier dans une expression régulière.
 * Écrits sous forme de chaîne pour éviter toute séquence fragile au
 * copier-coller.
 */
const REGEX_SPECIAL_CHARS = '.*+?^${}()|[]\\';

/**
 * Protège un texte pour l'insérer tel quel dans une expression régulière.
 */
function escapeRegExp(value: string): string {
  return Array.from(value)
    .map((char) =>
      REGEX_SPECIAL_CHARS.includes(char)
        ? '\\' + char
        : char
    )
    .join('');
}

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
/** Remplace les polices LibreOffice par leurs équivalents Windows (mêmes métriques). */
function mapLibreOfficeFontStack(value: string): string {
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
  const escapedName = escapeRegExp(attributeName);

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
 * Formes acceptées : #rgb, #rrggbb (avec ou sans transparence),
 * rgb(…) et rgba(…).
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

  if (/^rgba?[(][0-9, .]+[)]$/i.test(normalized)) {
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
    /<style:style\b([^>]*?)(?:\/>|>([\s\S]*?)<\/style:style>)/gi;

  xmlDocuments.forEach((xml) => {
    let match: RegExpExecArray | null;

    while ((match = stylePattern.exec(xml)) !== null) {
      const attributes = match[1];
      const body = match[2] ?? '';

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
          ? mapLibreOfficeFontStack(normalizeFontFamily(fontFamilyRaw))
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

/** Mise en forme utile pour détecter les titres visuels. */
interface BlockFormat {
  centered: boolean;
  bold: boolean;
  fontSizePt: number | null;
}

/** Convertit une taille CSS ("20pt", "16px") en points. */
function fontSizeToPt(value: string | undefined): number | null {
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
 * Mesure le gras et la taille dominante d'un paragraphe.
 * Le paragraphe est en gras si plus de la moitié du texte l'est. La taille
 * retenue est celle qui couvre le plus de caractères.
 */
function measureFormatting(
  xml: string,
  styles: Map<string, OdtStyle>,
  base: InlineStyle
): { bold: boolean; fontSizePt: number | null } {
  let total = 0;
  let boldChars = 0;
  const sizes = new Map<number, number>();

  const add = (fragment: string, bold: boolean, fontSize: string | undefined): void => {
    const length = normalizeVisibleText(
      decodeXmlEntities(fragment.replace(/<[^>]+>/g, ''))
    ).length;

    if (length === 0) {
      return;
    }

    total += length;

    if (bold) {
      boldChars += length;
    }

    const pt = fontSizeToPt(fontSize);

    if (pt !== null) {
      sizes.set(pt, (sizes.get(pt) ?? 0) + length);
    }
  };

  const spanPattern = /<text:span\b([^>]*)>([\s\S]*?)<\/text:span>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = spanPattern.exec(xml)) !== null) {
    add(xml.slice(cursor, match.index), base.bold === true, base.fontSize);

    const spanStyle = resolveStyle(
      getXmlAttribute(match[1] ?? '', 'text:style-name'),
      styles
    );

    add(
      match[2] ?? '',
      base.bold === true || spanStyle?.bold === true,
      spanStyle?.fontSize ?? base.fontSize
    );

    cursor = spanPattern.lastIndex;
  }

  add(xml.slice(cursor), base.bold === true, base.fontSize);

  let fontSizePt: number | null = null;
  let bestCount = 0;

  sizes.forEach((count, size) => {
    if (count > bestCount) {
      bestCount = count;
      fontSizePt = size;
    }
  });

  return {
    bold: total > 0 && boldChars * 2 > total,
    fontSizePt
  };
}

/**
 * Ajoute un bloc analysé à la liste.
 */
function pushRenderedBlock(
  blocks: ParsedBlock[],
  rendered: RenderedInline,
  headingLevel: number | null,
  blockStyle: string,
  format: BlockFormat
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
    centered: format.centered,
    bold: format.bold,
    fontSizePt: format.fontSizePt,
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
    /<(text:p|text:h)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;

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

    /* Mise en forme du paragraphe, pour la détection des titres visuels. */
    const centered = resolvedStyle?.textAlign === 'center';
    const formatOf = (xml: string): BlockFormat => ({
      centered,
      ...measureFormatting(xml, styles, baseInlineStyle)
    });

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
          (renderedPart, partIndex) => {
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
              blockStyle,
              formatOf(manualLineParts[partIndex] ?? '')
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
      blockStyle,
      formatOf(innerXml)
    );
  }

  return blocks;
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
