// src/main/export-screenplay.ts
// Scenario -> Word (.docx) et OpenDocument (.odt), mise en page
// professionnelle identique au PDF : Courier New 12 pt, marges et retraits
// de renderer/lib/screenplay-print.ts, page de titre sans numero, numeros
// de page en haut a droite (« 2. ») a partir de la deuxieme page du
// scenario, numeros de scene dans la marge gauche (option).
//
// Les mentions de continuation (SUITE / A SUIVRE) ne sont pas ajoutees :
// la coupure des pages est decidee par Word ou LibreOffice.

import fs from 'node:fs';
import {
  AlignmentType,
  Document,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type ISectionOptions
} from 'docx';

import {
  SCREENPLAY_ELEMENT_LAYOUT,
  SCREENPLAY_ELEMENT_TYPES_FOR_EXPORT,
  SCREENPLAY_EXPORT_PAGES,
  SCREENPLAY_FONT,
  SCREENPLAY_FONT_SIZE_PT,
  SCREENPLAY_HEADING_SPACE_PT,
  SCREENPLAY_NUMBER_OFFSET_CM,
  type ScreenplayExportDocument,
  type ScreenplayExportElementType,
  type ScreenplayExportTitlePage
} from '../shared/screenplay-export';
import { buildZip } from './zip-writer';

const CM_PER_PT = 2.54 / 72;
/** Hauteur d'une ligne de Courier New 12 pt en interligne simple. */
const LINE_CM = 13.6 * CM_PER_PT;
/** Largeur d'un caractere de Courier 12 pt. */
const CHAR_CM = 7.2 * CM_PER_PT;
/** Distance entre le haut de la feuille et la ligne du numero de page. */
const HEADER_DISTANCE_CM = 1.27;

// ----------------------------------------------------------------------------
// Geometrie commune
// ----------------------------------------------------------------------------

interface PageGeometry {
  widthCm: number;
  heightCm: number;
  topCm: number;
  rightCm: number;
  bottomCm: number;
  leftCm: number;
  contentWidthCm: number;
  contentHeightCm: number;
}

function getGeometry(doc: ScreenplayExportDocument): PageGeometry {
  const page = SCREENPLAY_EXPORT_PAGES[doc.pageFormat];
  const widthCm = page.widthMm / 10;
  const heightCm = page.heightMm / 10;
  const topCm = page.marginTopMm / 10;
  const rightCm = page.marginRightMm / 10;
  const bottomCm = page.marginBottomMm / 10;
  const leftCm = page.marginLeftMm / 10;

  return {
    widthCm,
    heightCm,
    topCm,
    rightCm,
    bottomCm,
    leftCm,
    contentWidthCm: widthCm - leftCm - rightCm,
    contentHeightCm: heightCm - topCm - bottomCm
  };
}

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

/** Nombre de lignes affichees, coupures automatiques comprises (estimation). */
function wrappedLineCount(lines: string[], widthCm: number): number {
  const perLine = Math.max(10, Math.floor(widthCm / CHAR_CM));
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

interface TitleRow {
  left: string;
  right: string;
}

interface TitleLayout {
  /** Espace avant le titre (le bloc principal commence a 38 % de la page). */
  topCm: number;
  /** Espace avant le bloc contact / version, pour le placer en bas. */
  bottomBeforeCm: number;
  /** Lignes du bas : contact a gauche, version et date a droite. */
  rows: TitleRow[];
}

function getTitleLayout(page: ScreenplayExportTitlePage, g: PageGeometry): TitleLayout {
  const topCm = g.contentHeightCm * 0.38;
  const width = g.contentWidthCm * 0.8;

  let mainCm = wrappedLineCount(splitLines(page.title), width) * LINE_CM + 24 * CM_PER_PT;

  if (page.authors) {
    mainCm += LINE_CM + 12 * CM_PER_PT + wrappedLineCount(splitLines(page.authors), width) * LINE_CM;
  }
  if (page.source) {
    mainCm += 12 * CM_PER_PT + wrappedLineCount(splitLines(page.source), width) * LINE_CM;
  }

  const contact = splitLines(page.contact);
  const version = splitLines(page.version);
  const rows: TitleRow[] = [];

  for (let i = 0; i < Math.max(contact.length, version.length); i++) {
    rows.push({ left: contact[i] ?? '', right: version[i] ?? '' });
  }

  const bottomCm =
    wrappedLineCount(rows.map((row) => `${row.left}    ${row.right}`), g.contentWidthCm) * LINE_CM;

  return {
    topCm,
    bottomBeforeCm: Math.max(0.5, g.contentHeightCm - topCm - mainCm - bottomCm - 1.5),
    rows
  };
}

// ----------------------------------------------------------------------------
// Word (.docx)
// ----------------------------------------------------------------------------

const HALF_POINTS = SCREENPLAY_FONT_SIZE_PT * 2;

function twips(cm: number): number {
  return Math.round((cm * 1440) / 2.54);
}

function ptTwips(pt: number): number {
  return Math.round(pt * 20);
}

function docxRuns(text: string, bold = false): TextRun[] {
  return text.split('\n').map(
    (line, index) =>
      new TextRun({
        text: line,
        break: index > 0 ? 1 : undefined,
        bold,
        font: SCREENPLAY_FONT,
        size: HALF_POINTS,
        color: '000000'
      })
  );
}

function docxTitlePage(page: ScreenplayExportTitlePage, g: PageGeometry): Paragraph[] {
  const layout = getTitleLayout(page, g);
  const side = twips(g.contentWidthCm * 0.1);
  const indent = { left: side, right: side };

  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent,
      spacing: { before: twips(layout.topCm), after: ptTwips(24) },
      children: docxRuns(page.title)
    })
  ];

  if (page.authors) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, indent, children: docxRuns(page.writtenBy) }));
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent,
        spacing: { before: ptTwips(12) },
        children: docxRuns(page.authors)
      })
    );
  }

  if (page.source) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent,
        spacing: { before: ptTwips(12) },
        children: docxRuns(page.source)
      })
    );
  }

  if (layout.rows.length > 0) {
    const children: TextRun[] = [];

    layout.rows.forEach((row, index) => {
      children.push(
        new TextRun({
          text: row.left,
          break: index > 0 ? 1 : undefined,
          font: SCREENPLAY_FONT,
          size: HALF_POINTS,
          color: '000000'
        })
      );

      if (row.right) {
        children.push(
          new TextRun({
            children: [new Tab(), row.right],
            font: SCREENPLAY_FONT,
            size: HALF_POINTS,
            color: '000000'
          })
        );
      }
    });

    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: twips(g.contentWidthCm) }],
        spacing: { before: twips(layout.bottomBeforeCm) },
        children
      })
    );
  }

  return out;
}

function docxScenes(doc: ScreenplayExportDocument, g: PageGeometry): Paragraph[] {
  const out: Paragraph[] = [];

  doc.scenes.forEach((scene, index) => {
    const headingChildren = doc.sceneNumbers
      ? [
          new TextRun({
            children: [String(scene.number), new Tab(), scene.heading],
            bold: doc.boldSceneHeadings,
            font: SCREENPLAY_FONT,
            size: HALF_POINTS,
            color: '000000'
          })
        ]
      : docxRuns(scene.heading, doc.boldSceneHeadings);

    out.push(
      new Paragraph({
        outlineLevel: 0,
        keepNext: true,
        keepLines: true,
        spacing: { before: index === 0 ? 0 : ptTwips(SCREENPLAY_HEADING_SPACE_PT) },
        indent: doc.sceneNumbers ? { left: 0, hanging: twips(SCREENPLAY_NUMBER_OFFSET_CM) } : undefined,
        children: headingChildren
      })
    );

    for (const element of scene.elements) {
      const layout = SCREENPLAY_ELEMENT_LAYOUT[element.type];

      out.push(
        new Paragraph({
          alignment: layout.alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
          keepNext: layout.keepWithNext,
          keepLines: true,
          spacing: { before: ptTwips(layout.spaceBeforePt) },
          indent: {
            left: twips(g.contentWidthCm * layout.left),
            right: twips(g.contentWidthCm * layout.right)
          },
          children: docxRuns(element.text)
        })
      );
    }
  });

  if (out.length === 0) {
    out.push(new Paragraph({}));
  }

  return out;
}

export async function generateScreenplayDocx(
  filePath: string,
  doc: ScreenplayExportDocument
): Promise<void> {
  const g = getGeometry(doc);

  const page = {
    size: { width: twips(g.widthCm), height: twips(g.heightCm) },
    margin: {
      top: twips(g.topCm),
      right: twips(g.rightCm),
      bottom: twips(g.bottomCm),
      left: twips(g.leftCm),
      header: twips(HEADER_DISTANCE_CM),
      footer: twips(HEADER_DISTANCE_CM)
    }
  };

  const sections: ISectionOptions[] = [];

  if (doc.titlePage) {
    sections.push({ properties: { page }, children: docxTitlePage(doc.titlePage, g) });
  }

  sections.push({
    properties: {
      titlePage: true,
      page: { ...page, pageNumbers: { start: 1 } }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                children: [PageNumber.CURRENT, '.'],
                font: SCREENPLAY_FONT,
                size: HALF_POINTS,
                color: '000000'
              })
            ]
          })
        ]
      }),
      first: new Header({ children: [new Paragraph({})] })
    },
    children: docxScenes(doc, g)
  });

  const wordDocument = new Document({
    creator: doc.author || 'Scriptorium',
    title: doc.title,
    sections
  });

  const buffer = await Packer.toBuffer(wordDocument);
  await fs.promises.writeFile(filePath, buffer);
}

// ----------------------------------------------------------------------------
// OpenDocument (.odt)
// ----------------------------------------------------------------------------

const ODT_MIME_TYPE = 'application/vnd.oasis.opendocument.text';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

const NAMESPACES = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'
].join(' ');

const MANIFEST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
  ` <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${ODT_MIME_TYPE}"/>`,
  ' <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
  ' <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
  ' <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>',
  '</manifest:manifest>'
].join('\n');

const ODT_ELEMENT_STYLES: Readonly<
  Record<ScreenplayExportElementType, { name: string; display: string }>
> = {
  action: { name: 'Screenplay_20_Action', display: 'Screenplay Action' },
  character: { name: 'Screenplay_20_Character', display: 'Screenplay Character' },
  parenthetical: { name: 'Screenplay_20_Parenthetical', display: 'Screenplay Parenthetical' },
  dialogue: { name: 'Screenplay_20_Dialogue', display: 'Screenplay Dialogue' },
  transition: { name: 'Screenplay_20_Transition', display: 'Screenplay Transition' },
  shot: { name: 'Screenplay_20_Shot', display: 'Screenplay Shot' }
};

function cm(value: number): string {
  return `${Math.round(value * 1000) / 1000}cm`;
}

function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Espaces multiples, tabulations et retours a la ligne en balises ODF. */
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

function odtStyle(
  name: string,
  display: string,
  extraAttributes: string,
  paragraphProperties: string,
  tabStops: string,
  textProperties: string
): string {
  const paragraph =
    tabStops !== ''
      ? `<style:paragraph-properties ${paragraphProperties}><style:tab-stops>${tabStops}</style:tab-stops></style:paragraph-properties>`
      : `<style:paragraph-properties ${paragraphProperties}/>`;

  return (
    `<style:style style:name="${name}" style:display-name="${display}" style:family="paragraph" style:parent-style-name="Standard"${extraAttributes}>` +
    paragraph +
    (textProperties !== '' ? `<style:text-properties ${textProperties}/>` : '') +
    '</style:style>'
  );
}

function buildOdtStyles(
  doc: ScreenplayExportDocument,
  g: PageGeometry,
  title: TitleLayout | null
): string {
  const language =
    doc.language === 'en' ? 'fo:language="en" fo:country="US"' : 'fo:language="fr" fo:country="FR"';
  const width = g.contentWidthCm;
  const side = cm(width * 0.1);

  const styles: string[] = [
    '<style:default-style style:family="paragraph">' +
      '<style:paragraph-properties fo:orphans="2" fo:widows="2" style:writing-mode="lr-tb"/>' +
      `<style:text-properties style:font-name="${SCREENPLAY_FONT}" fo:font-size="${SCREENPLAY_FONT_SIZE_PT}pt" fo:color="#000000" ${language}/>` +
      '</style:default-style>',
    '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
  ];

  const headingProperties = [
    `fo:margin-top="${cm(SCREENPLAY_HEADING_SPACE_PT * CM_PER_PT)}"`,
    'fo:margin-bottom="0cm"',
    'fo:margin-left="0cm"',
    'fo:margin-right="0cm"',
    'fo:keep-with-next="always"',
    'fo:keep-together="always"'
  ];

  if (doc.sceneNumbers) {
    headingProperties.push(`fo:text-indent="${cm(-SCREENPLAY_NUMBER_OFFSET_CM)}"`);
  }

  styles.push(
    odtStyle(
      'Screenplay_20_Heading',
      'Screenplay Heading',
      ' style:next-style-name="Screenplay_20_Action" style:default-outline-level="1" style:class="text"',
      headingProperties.join(' '),
      doc.sceneNumbers ? '<style:tab-stop style:position="0cm"/>' : '',
      doc.boldSceneHeadings ? 'fo:font-weight="bold"' : ''
    )
  );

  for (const type of SCREENPLAY_ELEMENT_TYPES_FOR_EXPORT) {
    const layout = SCREENPLAY_ELEMENT_LAYOUT[type];
    const style = ODT_ELEMENT_STYLES[type];
    const properties = [
      `fo:margin-left="${cm(width * layout.left)}"`,
      `fo:margin-right="${cm(width * layout.right)}"`,
      `fo:margin-top="${cm(layout.spaceBeforePt * CM_PER_PT)}"`,
      'fo:margin-bottom="0cm"',
      `fo:text-align="${layout.alignRight ? 'end' : 'start'}"`,
      'fo:keep-together="always"'
    ];

    if (layout.keepWithNext) properties.push('fo:keep-with-next="always"');

    styles.push(odtStyle(style.name, style.display, ' style:class="text"', properties.join(' '), '', ''));
  }

  if (title !== null) {
    const centered = `fo:text-align="center" fo:margin-left="${side}" fo:margin-right="${side}"`;

    styles.push(
      odtStyle(
        'Screenplay_20_Title',
        'Screenplay Title',
        ' style:class="chapter"',
        `${centered} fo:margin-top="${cm(title.topCm)}" fo:margin-bottom="${cm(24 * CM_PER_PT)}"`,
        '',
        ''
      ),
      odtStyle('Screenplay_20_Title_20_Line', 'Screenplay Title Line', ' style:class="chapter"', centered, '', ''),
      odtStyle(
        'Screenplay_20_Title_20_Block',
        'Screenplay Title Block',
        ' style:class="chapter"',
        `${centered} fo:margin-top="${cm(12 * CM_PER_PT)}"`,
        '',
        ''
      ),
      odtStyle(
        'Screenplay_20_Title_20_Bottom',
        'Screenplay Title Bottom',
        ' style:class="chapter"',
        `fo:margin-top="${cm(title.bottomBeforeCm)}"`,
        `<style:tab-stop style:position="${cm(width)}" style:type="right"/>`,
        ''
      )
    );
  }

  styles.push(odtStyle('Header', 'Header', ' style:class="extra"', 'fo:text-align="end"', '', ''));

  const pageProperties = (top: number): string =>
    `<style:page-layout-properties fo:page-width="${cm(g.widthCm)}" fo:page-height="${cm(g.heightCm)}" style:print-orientation="portrait" fo:margin-top="${cm(top)}" fo:margin-bottom="${cm(g.bottomCm)}" fo:margin-left="${cm(g.leftCm)}" fo:margin-right="${cm(g.rightCm)}"/>`;

  const headerGap = Math.max(0.2, g.topCm - HEADER_DISTANCE_CM - LINE_CM);

  const layouts =
    `<style:page-layout style:name="pm1">${pageProperties(HEADER_DISTANCE_CM)}` +
    `<style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="${cm(headerGap)}"/></style:header-style>` +
    '<style:footer-style/></style:page-layout>' +
    `<style:page-layout style:name="pm2">${pageProperties(g.topCm)}<style:header-style/><style:footer-style/></style:page-layout>`;

  const masters =
    '<style:master-page style:name="Standard" style:page-layout-name="pm1">' +
    '<style:header><text:p text:style-name="Header"><text:page-number text:select-page="current">1</text:page-number>.</text:p></style:header>' +
    '</style:master-page>' +
    '<style:master-page style:name="First_20_Page" style:display-name="First Page" style:page-layout-name="pm2" style:next-style-name="Standard"/>' +
    '<style:master-page style:name="Screenplay_20_First" style:display-name="Screenplay First Page" style:page-layout-name="pm2" style:next-style-name="Standard"/>';

  return (
    XML_DECLARATION +
    `<office:document-styles ${NAMESPACES} office:version="1.2">\n` +
    `<office:font-face-decls><style:font-face style:name="${SCREENPLAY_FONT}" svg:font-family="'${SCREENPLAY_FONT}'" style:font-family-generic="modern" style:font-pitch="fixed"/></office:font-face-decls>\n` +
    `<office:styles>\n${styles.join('\n')}\n</office:styles>\n` +
    `<office:automatic-styles>${layouts}</office:automatic-styles>\n` +
    `<office:master-styles>${masters}</office:master-styles>\n` +
    '</office:document-styles>\n'
  );
}

function buildOdtContent(doc: ScreenplayExportDocument, title: TitleLayout | null): string {
  const automatic: string[] = [
    '<style:style style:name="P2" style:family="paragraph" style:parent-style-name="Screenplay_20_Heading" style:master-page-name="Screenplay_20_First">' +
      '<style:paragraph-properties fo:margin-top="0cm" style:page-number="1"/></style:style>'
  ];
  const body: string[] = [];

  const paragraph = (styleName: string, inner: string): string =>
    inner === ''
      ? `<text:p text:style-name="${styleName}"/>`
      : `<text:p text:style-name="${styleName}">${inner}</text:p>`;

  const page = doc.titlePage;

  if (page !== null && title !== null) {
    automatic.push(
      '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Screenplay_20_Title" style:master-page-name="First_20_Page"/>'
    );

    body.push(paragraph('P1', encodeText(page.title)));

    if (page.authors) {
      body.push(paragraph('Screenplay_20_Title_20_Line', encodeText(page.writtenBy)));
      body.push(paragraph('Screenplay_20_Title_20_Block', encodeText(page.authors)));
    }

    if (page.source) {
      body.push(paragraph('Screenplay_20_Title_20_Block', encodeText(page.source)));
    }

    if (title.rows.length > 0) {
      body.push(
        paragraph(
          'Screenplay_20_Title_20_Bottom',
          title.rows
            .map((row) => encodeText(row.left) + (row.right ? `<text:tab/>${encodeText(row.right)}` : ''))
            .join('<text:line-break/>')
        )
      );
    }
  }

  doc.scenes.forEach((scene, index) => {
    const styleName = index === 0 ? 'P2' : 'Screenplay_20_Heading';
    const inner = (doc.sceneNumbers ? `${scene.number}<text:tab/>` : '') + encodeText(scene.heading);

    body.push(`<text:h text:style-name="${styleName}" text:outline-level="1">${inner}</text:h>`);

    for (const element of scene.elements) {
      body.push(paragraph(ODT_ELEMENT_STYLES[element.type].name, encodeText(element.text)));
    }
  });

  if (body.length === 0) {
    body.push('<text:p text:style-name="Standard"/>');
  }

  return (
    XML_DECLARATION +
    `<office:document-content ${NAMESPACES} office:version="1.2">\n` +
    `<office:automatic-styles>\n${automatic.join('\n')}\n</office:automatic-styles>\n` +
    `<office:body>\n<office:text>\n${body.join('\n')}\n</office:text>\n</office:body>\n` +
    '</office:document-content>\n'
  );
}

function buildOdtMeta(doc: ScreenplayExportDocument): string {
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
    `<dc:language>${doc.language === 'en' ? 'en-US' : 'fr-FR'}</dc:language>` +
    '</office:meta>' +
    '</office:document-meta>\n'
  );
}

export async function generateScreenplayOdt(
  filePath: string,
  doc: ScreenplayExportDocument
): Promise<void> {
  const g = getGeometry(doc);
  const title = doc.titlePage ? getTitleLayout(doc.titlePage, g) : null;

  const archive = buildZip([
    { name: 'mimetype', data: ODT_MIME_TYPE, store: true },
    { name: 'META-INF/manifest.xml', data: MANIFEST },
    { name: 'content.xml', data: buildOdtContent(doc, title) },
    { name: 'styles.xml', data: buildOdtStyles(doc, g, title) },
    { name: 'meta.xml', data: buildOdtMeta(doc) }
  ]);

  await fs.promises.writeFile(filePath, archive);
}