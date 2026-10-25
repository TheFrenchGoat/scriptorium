// src/main/export-docx.ts
// Document intermédiaire d'export -> fichier Word (.docx).
//
// Romans : format de page, marges, police du modèle, interligne, retrait,
// en-tête courant et numéros de page.

import fs from 'node:fs';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type ISectionOptions
} from 'docx';
import { decodeImageDataUrl } from './export-images';
import type { ExportBlock, ExportDocument, ExportRun } from '../shared/export-document';
import {
  chapterStartsNewPage,
  getRunningHeaderText,
  hasTableOfContents
} from '../shared/export-document';
import { EXPORT_PAGE_SIZES_MM } from '../shared/export-settings';

const TWIPS_PER_CM = 1440 / 2.54;

function cmToTwips(cm: number): number {
  return Math.round(cm * TWIPS_PER_CM);
}

interface BaseStyle {
  font: string;
  /** Demi-points (24 = 12 pt). */
  size: number;
  /** Interligne en 240e de ligne (240 = simple). */
  line: number;
}

function makeRun(run: ExportRun, base: BaseStyle): TextRun {
  if (run.text === '\n') {
    return new TextRun({ break: 1 });
  }

  return new TextRun({
    text: run.text,
    bold: run.bold === true,
    italics: run.italic === true,
    underline: run.underline ? {} : undefined,
    font: run.font ?? base.font,
    size: run.sizePt !== undefined ? Math.round(run.sizePt * 2) : base.size,
    color: run.color ?? '000000'
  });
}

interface CenteredOptions {
  sizeFactor: number;
  bold?: boolean;
  italic?: boolean;
  before?: number;
  after?: number;
  pageBreakBefore?: boolean;
}

function centered(text: string, base: BaseStyle, options: CenteredOptions): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    pageBreakBefore: options.pageBreakBefore === true,
    spacing: { before: options.before ?? 0, after: options.after ?? 0 },
    children: [
      new TextRun({
        text,
        bold: options.bold === true,
        italics: options.italic === true,
        font: base.font,
        size: Math.round(base.size * options.sizeFactor),
        color: '000000'
      })
    ]
  });
}

function makeBlock(block: ExportBlock, doc: ExportDocument, base: BaseStyle): Paragraph {
  if (block.kind === 'image') {
    const image = decodeImageDataUrl(block.dataUrl);
    if (image === null) {
      return new Paragraph({ children: [] });
    }

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { firstLine: 0 },
      spacing: { before: 120, after: 120 },
      keepNext: true,
      children: [
        new ImageRun({
          type: image.extension,
          data: image.data,
          transformation: {
            width: Math.round((block.widthCm / 2.54) * 96),
            height: Math.round((block.heightCm / 2.54) * 96)
          }
        })
      ]
    });
  }

  if (block.kind === 'empty') {
    return new Paragraph({
      spacing: { line: base.line },
      children: [new TextRun({ text: '', font: base.font, size: base.size })]
    });
  }

  if (block.kind === 'separator') {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: base.line, before: 240, after: 240 },
      children: [new TextRun({ text: block.symbol, font: base.font, size: base.size, color: '000000' })]
    });
  }

  const layout = doc.layout;
  const alignment =
    block.align === 'center'
      ? AlignmentType.CENTER
      : block.align === 'right'
        ? AlignmentType.RIGHT
        : layout.justify
          ? AlignmentType.JUSTIFIED
          : AlignmentType.LEFT;
  const indented = !block.noIndent && block.align === undefined && layout.firstLineIndentCm > 0;

  return new Paragraph({
    alignment,
    spacing: { line: base.line },
    indent: indented ? { firstLine: cmToTwips(layout.firstLineIndentCm) } : undefined,
    children: block.runs.map((run) => makeRun(run, base))
  });
}

export async function generateExportDocx(filePath: string, doc: ExportDocument): Promise<void> {
  const layout = doc.layout;
  const base: BaseStyle = {
    font: layout.fontFamily,
    size: Math.round(layout.fontSize * 2),
    line: Math.round(240 * layout.lineHeight)
  };
  const children: Paragraph[] = [];

  // Page de titre
  if (doc.titlePage) {
    children.push(centered(doc.title, base, { sizeFactor: 2, bold: true, before: cmToTwips(6), after: 240 }));
    if (doc.subtitle) children.push(centered(doc.subtitle, base, { sizeFactor: 1.3, italic: true }));
    if (doc.author) children.push(centered(doc.author, base, { sizeFactor: 1, before: 720 }));
  }

  // Table des matières (liste des titres)
  if (hasTableOfContents(doc)) {
    children.push(
      centered(doc.labels.tableOfContents, base, {
        sizeFactor: 1.5,
        bold: true,
        after: 480,
        pageBreakBefore: doc.titlePage
      })
    );
    for (const chapter of doc.chapters) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: chapter.title, font: base.font, size: base.size, color: '000000' })]
        })
      );
    }
  }

  // Chapitres : style Titre 1 pour le volet de navigation de Word.
  doc.chapters.forEach((chapter, index) => {
    const newPage = chapterStartsNewPage(doc, index);

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: newPage,
        keepNext: true,
        spacing: { before: newPage ? cmToTwips(3) : cmToTwips(1.5), after: cmToTwips(1) },
        children: [
          new TextRun({
            text: chapter.title,
            bold: true,
            font: base.font,
            size: Math.round(base.size * 1.5),
            color: '000000'
          })
        ]
      })
    );

    for (const block of chapter.blocks) {
      children.push(makeBlock(block, doc, base));
    }
  });

  if (children.length === 0) {
    children.push(new Paragraph({}));
  }

  // En-tête et pied de page (absents de la page de titre)
  const smallSize = Math.max(16, base.size - 4);
  const headerText = getRunningHeaderText(doc);
  const headers: { default?: Header; first?: Header } = {};
  const footers: { default?: Footer; first?: Footer } = {};

  if (doc.runningHeader && headerText !== '') {
    headers.default = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: headerText, font: base.font, size: smallSize, color: '000000' })]
        })
      ]
    });
    if (doc.titlePage) headers.first = new Header({ children: [new Paragraph({})] });
  }

  if (layout.pageNumbers) {
    footers.default = new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ children: [PageNumber.CURRENT], font: base.font, size: smallSize, color: '000000' })
          ]
        })
      ]
    });
    if (doc.titlePage) footers.first = new Footer({ children: [new Paragraph({})] });
  }

  const pageSize = EXPORT_PAGE_SIZES_MM[layout.pageSize];
  const margin = cmToTwips(layout.marginCm);

  const section: ISectionOptions = {
    properties: {
      titlePage: doc.titlePage,
      page: {
        size: {
          width: cmToTwips(pageSize.width / 10),
          height: cmToTwips(pageSize.height / 10)
        },
        margin: {
          top: margin,
          right: margin,
          bottom: margin,
          left: margin,
          header: cmToTwips(layout.marginCm / 2),
          footer: cmToTwips(layout.marginCm / 2)
        }
      }
    },
    headers,
    footers,
    children
  };

  const wordDocument = new Document({
    creator: doc.author || 'Scriptorium',
    title: doc.title,
    sections: [section]
  });

  const buffer = await Packer.toBuffer(wordDocument);
  await fs.promises.writeFile(filePath, buffer);
}