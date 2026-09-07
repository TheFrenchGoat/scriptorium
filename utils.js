const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, PageBreak, HeadingLevel } = require('docx');

function generateDocx(filePath, paragraphsData) {
  return new Promise((resolve, reject) => {
    try {
      const docChildren = paragraphsData.map(pData => {
        // Ajouter un saut de page si demandé
        if (pData.isPageBreak) {
          // Important: PageBreak doit être dans un paragraphe ou en tant qu'enfant direct
          return new Paragraph({ children: [new PageBreak()] });
        }
        
        // Ajouter un gros Titre de chapitre
        if (pData.isChapterTitle) {
          return new Paragraph({
            text: pData.text,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 400, before: 200 } 
          });
        }

        // Paragraphe normal avec la police stylisée
        const runs = pData.runs.map(rData => {
          return new TextRun({
            text: rData.text,
            bold: rData.bold || false,
            italics: rData.italic || false,
            underline: rData.underline ? {} : undefined,
            font: rData.font || "Calibri", // Police par défaut si undefined
            size: rData.size ? rData.size * 2 : 24, // docx utilise des demi-points (24 = 12pt)
            color: rData.color || "000000"
          });
        });
        
        return new Paragraph({ children: runs });
      });

      const doc = new Document({
        sections: [{ children: docChildren }]
      });
      
      Packer.toBuffer(doc).then(buffer => {
        fs.writeFileSync(filePath, buffer);
        resolve(filePath);
      }).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateDocx };