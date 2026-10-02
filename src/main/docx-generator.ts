// src/main/docx-generator.ts
// Port de l'ancien utils.js : construit le fichier .docx à partir de la
// structure neutre (paragraphes/runs) préparée par le renderer.

import fs from 'node:fs';
import {
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
  type ISectionOptions
} from 'docx';
import type { DocxParagraph } from '../shared/types';

export async function generateDocx(filePath: string, paragraphsData: DocxParagraph[]): Promise<string> {
  const docChildren: Paragraph[] = paragraphsData.map((pData) => {
    // Saut de page (PageBreak doit être dans un paragraphe)
    if (pData.isPageBreak) {
      return new Paragraph({ children: [new PageBreak()] });
    }

    // Titre de chapitre
    if (pData.isChapterTitle) {
      return new Paragraph({
        text: pData.text ?? '',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400, before: 200 }
      });
    }

    // Paragraphe normal avec la police stylisée
    const runs = (pData.runs ?? []).map(
      (rData) =>
        new TextRun({
          text: rData.text,
          bold: rData.bold || false,
          italics: rData.italic || false,
          underline: rData.underline ? {} : undefined,
          font: rData.font || 'Calibri',
          // docx utilise des demi-points (24 = 12pt)
          size: rData.size ? Math.round(rData.size * 2) : 24,
          color: rData.color || '000000'
        })
    );

    return new Paragraph({ children: runs });
  });

  const section: ISectionOptions = { children: docChildren };
  const doc = new Document({ sections: [section] });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
