// src/main/export-odt.ts
// Document intermédiaire d'export -> fichier OpenDocument texte (.odt),
// lisible par LibreOffice, OpenOffice, Word et Google Docs.
//
// Même rendu que export-docx.ts : format de page, marges, police du
// modèle, interligne, retrait de première ligne, page de titre sans
// en-tête ni numéro, en-tête courant et numéros de page.
//
// Un .odt est une archive ZIP de fichiers XML :
// - mimetype : en premier et non compressé ;
// - META-INF/manifest.xml : liste des fichiers ;
// - styles.xml : styles communs, format de page, en-tête et pied de page ;
// - content.xml : le texte et ses styles automatiques ;
// - meta.xml : titre, auteur et langue.

import fs from 'node:fs';

import type { ExportBlock, ExportDocument, ExportRun } from '../shared/export-document';
import {
  chapterStartsNewPage,
  getRunningHeaderText,
  hasTableOfContents
} from '../shared/export-document';
import { EXPORT_PAGE_SIZES_MM } from '../shared/export-settings';
import { buildZip } from './zip-writer';
import { decodeImageDataUrl } from './export-images';

const ODT_MIME_TYPE = 'application/vnd.oasis.opendocument.text';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

const NAMESPACES = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"'
].join(' ');

/** Taille d'un point typographique, en centimètres. */
const CM_PER_PT = 2.54 / 72;

/** Espacements repris de export-docx.ts (240, 480, 720 et 120 twips). */
const SPACE_12PT = 12 * CM_PER_PT;
const SPACE_24PT = 24 * CM_PER_PT;
const SPACE_36PT = 36 * CM_PER_PT;
const SPACE_6PT = 6 * CM_PER_PT;

/** Pays utilisé quand la langue est donnée sans région (ex. 'fr'). */
const DEFAULT_COUNTRIES: Record<string, string> = {
  fr: 'FR',
  en: 'US',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  nl: 'NL'
};

const MANIFEST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
  ` <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${ODT_MIME_TYPE}"/>`,
  ' <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
  ' <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
  ' <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>',
  '</manifest:manifest>'
].join('\n');

/** Image du dossier Pictures/ de l'archive. */
interface OdtPicture {
  name: string;
  data: Buffer;
  mediaType: string;
}

function buildManifest(pictures: OdtPicture[]): string {
  if (pictures.length === 0) return MANIFEST;

  const entries = pictures
    .map((picture) => ` <manifest:file-entry manifest:full-path="${picture.name}" manifest:media-type="${picture.mediaType}"/>`)
    .join('\n');

  return MANIFEST.replace('</manifest:manifest>', `${entries}\n</manifest:manifest>`);
}

function cm(value: number): string {
  return `${Math.round(value * 1000) / 1000}cm`;
}

function pt(value: number): string {
  return `${Math.round(value * 10) / 10}pt`;
}

/** Échappe le texte pour XML et retire les caractères interdits. */
function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Texte d'un paragraphe : en ODF, les espaces multiples sont fusionnés,
 * il faut donc les écrire avec text:s ; tabulations et retours à la ligne
 * ont aussi leurs propres balises.
 */
function encodeText(value: string): string {
  return escapeXml(value)
    .replace(/\r\n?|\n/g, '<text:line-break/>')
    .replace(/\t/g, '<text:tab/>')
    .replace(/^ +| {2,}/g, (match: string, offset: number) =>
      offset === 0
        ? `<text:s text:c="${match.length}"/>`
        : ` <text:s text:c="${match.length - 1}"/>`
    );
}

function cleanFontName(font: string): string {
  return String(font ?? '').replace(/['"<>&]/g, '').trim();
}

function fontFamilyAttribute(font: string): string {
  return `'${cleanFontName(font)}'`;
}

function parseLanguage(value: string): { language: string; country: string } | null {
  const parts = String(value || '').trim().split(/[-_]/);
  const language = (parts[0] ?? '').toLowerCase();

  if (!/^[a-z]{2,3}$/.test(language)) {
    return null;
  }

  const region = (parts[1] ?? '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(region) ? region : (DEFAULT_COUNTRIES[language] ?? '');

  return { language, country };
}

function languageAttributes(value: string): string {
  const parsed = parseLanguage(value);

  if (parsed === null) {
    return '';
  }

  return (
    ` fo:language="${parsed.language}"` +
    (parsed.country !== '' ? ` fo:country="${parsed.country}"` : '')
  );
}

/** Styles automatiques de content.xml, créés à la demande et partagés. */
class AutomaticStyles {
  private readonly names = new Map<string, string>();
  private readonly definitions: string[] = [];
  private readonly prefix: string;
  private readonly family: 'paragraph' | 'text';

  constructor(prefix: string, family: 'paragraph' | 'text') {
    this.prefix = prefix;
    this.family = family;
  }

  use(properties: string, parent = '', attributes = ''): string {
    const key = `${parent}|${attributes}|${properties}`;
    const known = this.names.get(key);

    if (known !== undefined) {
      return known;
    }

    const name = `${this.prefix}${this.definitions.length + 1}`;
    const parentAttribute = parent !== '' ? ` style:parent-style-name="${parent}"` : '';

    this.names.set(key, name);
    this.definitions.push(
      `<style:style style:name="${name}" style:family="${this.family}"${parentAttribute}${attributes}>${properties}</style:style>`
    );

    return name;
  }

  toXml(): string {
    return this.definitions.join('\n');
  }
}

function runTextProperties(run: ExportRun): string {
  const properties: string[] = [];

  if (run.bold === true) properties.push('fo:font-weight="bold"');
  if (run.italic === true) properties.push('fo:font-style="italic"');
  if (run.underline) {
    properties.push(
      'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"'
    );
  }
  if (typeof run.font === 'string' && cleanFontName(run.font) !== '') {
    properties.push(`fo:font-family="${fontFamilyAttribute(run.font)}"`);
  }
  if (typeof run.sizePt === 'number' && Number.isFinite(run.sizePt) && run.sizePt > 0) {
    properties.push(`fo:font-size="${pt(Math.min(200, run.sizePt))}"`);
  }
  if (typeof run.color === 'string' && /^[0-9a-fA-F]{6}$/.test(run.color)) {
    properties.push(`fo:color="#${run.color.toLowerCase()}"`);
  }

  return properties.length > 0 ? `<style:text-properties ${properties.join(' ')}/>` : '';
}

function buildContent(doc: ExportDocument, pictures: OdtPicture[] = []): string {
  const layout = doc.layout;
  const paragraphStyles = new AutomaticStyles('P', 'paragraph');
  const textStyles = new AutomaticStyles('T', 'text');
  const body: string[] = [];
  let isFirstParagraph = true;

  /**
   * Style d'un paragraphe. Le tout premier paragraphe d'un document avec
   * page de titre utilise la page maîtresse « First Page » (sans en-tête
   * ni numéro) ; les pages suivantes reprennent la page « Standard ».
   */
  const paragraphStyle = (parent: string, properties: string[], pageBreak: boolean): string => {
    const onFirstPage = isFirstParagraph && doc.titlePage;
    isFirstParagraph = false;

    const all = [...properties];
    if (pageBreak && !onFirstPage) all.push('fo:break-before="page"');

    const attributes = onFirstPage ? ' style:master-page-name="First_20_Page"' : '';

    if (all.length === 0 && attributes === '') {
      return parent;
    }

    const props = all.length > 0 ? `<style:paragraph-properties ${all.join(' ')}/>` : '';
    return paragraphStyles.use(props, parent, attributes);
  };

  const paragraph = (styleName: string, inner: string): string =>
    inner === ''
      ? `<text:p text:style-name="${styleName}"/>`
      : `<text:p text:style-name="${styleName}">${inner}</text:p>`;

  const renderRuns = (runs: ExportRun[]): string =>
    runs
      .map((run) => {
        if (run.text === '\n') {
          return '<text:line-break/>';
        }

        const content = encodeText(run.text);
        if (content === '') return '';

        const properties = runTextProperties(run);
        if (properties === '') return content;

        return `<text:span text:style-name="${textStyles.use(properties)}">${content}</text:span>`;
      })
      .join('');

  const renderBlock = (block: ExportBlock): string => {
    if (block.kind === 'image') {
      const image = decodeImageDataUrl(block.dataUrl);
      if (image === null) return '';

      const index = pictures.length + 1;
      const name = `Pictures/image${index}.${image.extension}`;
      pictures.push({ name, data: image.data, mediaType: image.mediaType });

      const frame =
        `<draw:frame draw:name="Image${index}" text:anchor-type="as-char" ` +
        `svg:width="${cm(block.widthCm)}" svg:height="${cm(block.heightCm)}" draw:z-index="0">` +
        `<draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
        '</draw:frame>';

      return paragraph(
        paragraphStyle('Text_20_body', ['fo:text-align="center"', 'fo:text-indent="0cm"'], false),
        frame
      );
    }

    if (block.kind === 'empty') {
      return paragraph(paragraphStyle('Text_20_body', [], false), '');
    }

    if (block.kind === 'separator') {
      return paragraph(paragraphStyle('Scene_20_Separator', [], false), encodeText(block.symbol));
    }

    const properties: string[] = [];
    if (block.align === 'center') properties.push('fo:text-align="center"');
    if (block.align === 'right') properties.push('fo:text-align="end"');

    const indented = !block.noIndent && block.align === undefined && layout.firstLineIndentCm > 0;
    if (!indented && layout.firstLineIndentCm > 0) properties.push('fo:text-indent="0cm"');

    return paragraph(paragraphStyle('Text_20_body', properties, false), renderRuns(block.runs));
  };

  // Page de titre
  if (doc.titlePage) {
    body.push(paragraph(paragraphStyle('Title', [], false), encodeText(doc.title)));
    if (doc.subtitle) body.push(paragraph(paragraphStyle('Subtitle', [], false), encodeText(doc.subtitle)));
    if (doc.author) body.push(paragraph(paragraphStyle('Title_20_Author', [], false), encodeText(doc.author)));
  }

  // Table des matières (liste des titres, comme pour Word)
  if (hasTableOfContents(doc)) {
    body.push(
      paragraph(
        paragraphStyle('Contents_20_Heading', [], doc.titlePage),
        encodeText(doc.labels.tableOfContents)
      )
    );

    for (const chapter of doc.chapters) {
      body.push(paragraph(paragraphStyle('Contents_20_1', [], false), encodeText(chapter.title)));
    }
  }

  // Chapitres : style Titre 1, visible dans le Navigateur de LibreOffice.
  doc.chapters.forEach((chapter, index) => {
    const newPage = chapterStartsNewPage(doc, index);
    const styleName = paragraphStyle(
      'Heading_20_1',
      newPage ? [`fo:margin-top="${cm(3)}"`] : [],
      newPage
    );

    body.push(
      `<text:h text:style-name="${styleName}" text:outline-level="1">${encodeText(chapter.title)}</text:h>`
    );

    for (const block of chapter.blocks) {
      body.push(renderBlock(block));
    }
  });

  if (body.length === 0) {
    body.push('<text:p text:style-name="Standard"/>');
  }

  return (
    XML_DECLARATION +
    `<office:document-content ${NAMESPACES} office:version="1.2">\n` +
    `<office:automatic-styles>\n${paragraphStyles.toXml()}\n${textStyles.toXml()}\n</office:automatic-styles>\n` +
    `<office:body>\n<office:text>\n${body.join('\n')}\n</office:text>\n</office:body>\n` +
    '</office:document-content>\n'
  );
}

function buildStyles(doc: ExportDocument): string {
  const layout = doc.layout;
  const fontName = cleanFontName(layout.fontFamily) || 'Times New Roman';
  const fontFamily = fontFamilyAttribute(fontName);
  const size = layout.fontSize;
  const smallSize = Math.max(8, size - 2);
  const lineHeight = `${Math.round(layout.lineHeight * 100)}%`;
  const language = languageAttributes(doc.language);
  const indent = layout.firstLineIndentCm > 0 ? cm(layout.firstLineIndentCm) : '0cm';
  const align = layout.justify ? 'justify' : 'start';

  const pageSize = EXPORT_PAGE_SIZES_MM[layout.pageSize];
  const margin = layout.marginCm;
  const headerText = getRunningHeaderText(doc);
  const hasHeader = doc.runningHeader && headerText !== '';
  const hasFooter = layout.pageNumbers;

  // L'en-tête est placé à mi-marge (comme dans Word) et le texte commence
  // à la marge choisie : l'écart compense la hauteur de la ligne d'en-tête.
  const smallLine = smallSize * CM_PER_PT * 1.2;
  const gap = Math.max(0.2, margin / 2 - smallLine);

  const pageProperties = (top: number, bottom: number): string =>
    `<style:page-layout-properties fo:page-width="${cm(pageSize.width / 10)}" fo:page-height="${cm(pageSize.height / 10)}" style:print-orientation="portrait" fo:margin-top="${cm(top)}" fo:margin-bottom="${cm(bottom)}" fo:margin-left="${cm(margin)}" fo:margin-right="${cm(margin)}"/>`;

  const mainLayout = [
    '<style:page-layout style:name="pm1">',
    pageProperties(hasHeader ? margin / 2 : margin, hasFooter ? margin / 2 : margin),
    hasHeader
      ? `<style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="${cm(gap)}"/></style:header-style>`
      : '<style:header-style/>',
    hasFooter
      ? `<style:footer-style><style:header-footer-properties fo:min-height="0cm" fo:margin-top="${cm(gap)}"/></style:footer-style>`
      : '<style:footer-style/>',
    '</style:page-layout>'
  ].join('');

  const firstLayout =
    `<style:page-layout style:name="pm2">${pageProperties(margin, margin)}` +
    '<style:header-style/><style:footer-style/></style:page-layout>';

  const header = hasHeader
    ? `<style:header><text:p text:style-name="Header">${encodeText(headerText)}</text:p></style:header>`
    : '';
  const footer = hasFooter
    ? '<style:footer><text:p text:style-name="Footer"><text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>'
    : '';

  const style = (
    name: string,
    displayName: string,
    attributes: string,
    paragraphProperties: string,
    textProperties = ''
  ): string =>
    `<style:style style:name="${name}" style:display-name="${displayName}" style:family="paragraph"${attributes}>` +
    (paragraphProperties !== '' ? `<style:paragraph-properties ${paragraphProperties}/>` : '') +
    (textProperties !== '' ? `<style:text-properties ${textProperties}/>` : '') +
    '</style:style>';

  const child = ' style:parent-style-name="Standard"';

  const commonStyles = [
    '<style:default-style style:family="paragraph">' +
      '<style:paragraph-properties fo:orphans="2" fo:widows="2" style:writing-mode="lr-tb"/>' +
      `<style:text-properties style:font-name="${escapeXml(fontName)}" fo:font-size="${pt(size)}" fo:color="#000000"${language}/>` +
      '</style:default-style>',
    style('Standard', 'Standard', ' style:class="text"', ''),
    style(
      'Text_20_body',
      'Text body',
      `${child} style:class="text"`,
      `fo:line-height="${lineHeight}" fo:text-align="${align}" fo:text-indent="${indent}" fo:margin-top="0cm" fo:margin-bottom="0cm"`
    ),
    style(
      'Heading_20_1',
      'Heading 1',
      `${child} style:next-style-name="Text_20_body" style:default-outline-level="1" style:class="text"`,
      `fo:text-align="center" fo:margin-top="${cm(1.5)}" fo:margin-bottom="${cm(1)}" fo:keep-with-next="always"`,
      `fo:font-size="${pt(size * 1.5)}" fo:font-weight="bold"`
    ),
    style(
      'Title',
      'Title',
      `${child} style:next-style-name="Subtitle" style:class="chapter"`,
      `fo:text-align="center" fo:margin-top="${cm(6)}" fo:margin-bottom="${cm(SPACE_12PT)}"`,
      `fo:font-size="${pt(size * 2)}" fo:font-weight="bold"`
    ),
    style(
      'Subtitle',
      'Subtitle',
      `${child} style:class="chapter"`,
      'fo:text-align="center"',
      `fo:font-size="${pt(size * 1.3)}" fo:font-style="italic"`
    ),
    style(
      'Title_20_Author',
      'Title Author',
      `${child} style:class="chapter"`,
      `fo:text-align="center" fo:margin-top="${cm(SPACE_36PT)}"`
    ),
    style(
      'Contents_20_Heading',
      'Contents Heading',
      `${child} style:class="index"`,
      `fo:text-align="center" fo:margin-bottom="${cm(SPACE_24PT)}"`,
      `fo:font-size="${pt(size * 1.5)}" fo:font-weight="bold"`
    ),
    style(
      'Contents_20_1',
      'Contents 1',
      `${child} style:class="index"`,
      `fo:margin-bottom="${cm(SPACE_6PT)}"`
    ),
    style(
      'Scene_20_Separator',
      'Scene Separator',
      `${child} style:class="text"`,
      `fo:line-height="${lineHeight}" fo:text-align="center" fo:text-indent="0cm" fo:margin-top="${cm(SPACE_12PT)}" fo:margin-bottom="${cm(SPACE_12PT)}"`
    ),
    style(
      'Header',
      'Header',
      `${child} style:class="extra"`,
      'fo:text-align="end"',
      `fo:font-size="${pt(smallSize)}"`
    ),
    style(
      'Footer',
      'Footer',
      `${child} style:class="extra"`,
      'fo:text-align="center"',
      `fo:font-size="${pt(smallSize)}"`
    )
  ].join('\n');

  return (
    XML_DECLARATION +
    `<office:document-styles ${NAMESPACES} office:version="1.2">\n` +
    `<office:font-face-decls><style:font-face style:name="${escapeXml(fontName)}" svg:font-family="${fontFamily}"/></office:font-face-decls>\n` +
    `<office:styles>\n${commonStyles}\n</office:styles>\n` +
    `<office:automatic-styles>${mainLayout}${firstLayout}</office:automatic-styles>\n` +
    '<office:master-styles>' +
    `<style:master-page style:name="Standard" style:page-layout-name="pm1">${header}${footer}</style:master-page>` +
    '<style:master-page style:name="First_20_Page" style:display-name="First Page" style:page-layout-name="pm2" style:next-style-name="Standard"/>' +
    '</office:master-styles>\n' +
    '</office:document-styles>\n'
  );
}

function buildMeta(doc: ExportDocument): string {
  const parsed = parseLanguage(doc.language);
  const languageTag =
    parsed === null ? '' : parsed.country !== '' ? `${parsed.language}-${parsed.country}` : parsed.language;
  const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const author = escapeXml(doc.author);

  return (
    XML_DECLARATION +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">' +
    '<office:meta>' +
    '<meta:generator>Scriptorium</meta:generator>' +
    (doc.title ? `<dc:title>${escapeXml(doc.title)}</dc:title>` : '') +
    (author !== '' ? `<meta:initial-creator>${author}</meta:initial-creator><dc:creator>${author}</dc:creator>` : '') +
    `<meta:creation-date>${created}</meta:creation-date>` +
    (languageTag !== '' ? `<dc:language>${languageTag}</dc:language>` : '') +
    '</office:meta>' +
    '</office:document-meta>\n'
  );
}

export async function generateExportOdt(filePath: string, doc: ExportDocument): Promise<void> {
  const pictures: OdtPicture[] = [];
  const content = buildContent(doc, pictures);

  const archive = buildZip([
    { name: 'mimetype', data: ODT_MIME_TYPE, store: true },
    { name: 'META-INF/manifest.xml', data: buildManifest(pictures) },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: buildStyles(doc) },
    { name: 'meta.xml', data: buildMeta(doc) },
    ...pictures.map((picture) => ({ name: picture.name, data: picture.data }))
  ]);

  await fs.promises.writeFile(filePath, archive);
}