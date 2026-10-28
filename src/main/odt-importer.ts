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
  normalizeVisibleText,
  splitDocument,
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
  normalizeColor,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeTextAlign,
  projectNameFromFilePath,
  pushRenderedBlock,
  type BlockFormat,
  type InlineStyle,
  type RenderedInline
} from './import-html';
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
          fontWeight === undefined
            ? undefined
            : fontWeight === 'bold' || Number(fontWeight) >= 600,
        italic:
          fontStyle === undefined
            ? undefined
            : fontStyle === 'italic' || fontStyle === 'oblique',
        underline:
          underlineStyle === undefined
            ? undefined
            : underlineStyle !== 'none',
        color: normalizeColor(colorRaw),
        fontFamily: fontFamilyRaw
          ? mapLibreOfficeFontStack(normalizeFontFamily(fontFamilyRaw))
          : undefined,
        fontSize: normalizeFontSize(fontSizeRaw),
        textAlign: normalizeTextAlign(textAlign)
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
      /<text:line-break\b[^>]*\/?>/gi
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

  const split = splitDocument(
    blocks
  );

  const projectData: ProjectData = {
    chapters: split.chapters,
    world: {},
    customWbTypes: {},
    writingSessions: [],
    goals: []
  };

  return {
    projectName:
      split.bookTitle ||
      projectNameFromFilePath(filePath),
    projectData
  };
}
