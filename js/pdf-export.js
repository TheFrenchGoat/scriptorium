// js/pdf-export.js
// Construit un document HTML autonome et imprimable (une section par
// chapitre, saut de page CSS entre chaque). Ce HTML est envoyé au processus
// principal, qui le charge dans une fenêtre invisible et utilise
// webContents.printToPDF() pour produire le fichier — voir app.js.

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildPrintHtml(projectData, projectName) {
  const chapterNames = Object.keys(projectData.chapters);

  const chaptersHtml = chapterNames.map((name, i) => `
    <section style="${i > 0 ? 'page-break-before: always;' : ''}">
      <h1>${escapeHtml(name)}</h1>
      <div class="chapter-content">${projectData.chapters[name] || ''}</div>
    </section>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(projectName)}</title>
<style>
  @page { margin: 2.5cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 20pt; margin-bottom: 1.2em; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; }
  .chapter-content div, .chapter-content p { margin: 0 0 0.8em 0; }
  .wb-mention { color: inherit !important; border-bottom: none !important; }
</style>
</head>
<body>
  <h1 style="text-align:center; font-size:28pt; border:none; margin-bottom:2em;">${escapeHtml(projectName)}</h1>
  ${chaptersHtml}
</body>
</html>`;
}
