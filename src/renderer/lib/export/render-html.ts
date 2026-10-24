// src/renderer/lib/export/render-html.ts
// Document intermédiaire -> HTML imprimable (export PDF et aperçu).
//
// Les numéros de page et l'en-tête courant ne sont pas dans ce HTML : ils
// sont ajoutés par le processus principal lors de l'impression en PDF.

import type { ExportBlock, ExportDocument, ExportRun } from '../../../shared/export-document';
import { chapterStartsNewPage, hasTableOfContents } from '../../../shared/export-document';
import { EXPORT_PAGE_SIZES_MM } from '../../../shared/export-settings';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Nom de police déjà validé (lettres, chiffres, espaces, tirets). */
export function cssFontStack(name: string): string {
  let generic = 'serif';
  if (/courier|mono/i.test(name)) generic = 'monospace';
  else if (/arial|calibri|helvetica|verdana|segoe/i.test(name)) generic = 'sans-serif';
  return `'${name}', ${generic}`;
}

function runToHtml(run: ExportRun): string {
  if (run.text === '\n') return '<br>';

  let html = escapeHtml(run.text);
  const css: string[] = [];

  if (run.font) css.push(`font-family:${cssFontStack(run.font)}`);
  if (run.sizePt) css.push(`font-size:${run.sizePt}pt`);
  if (run.color && /^[0-9a-f]{6}$/i.test(run.color)) css.push(`color:#${run.color}`);

  if (css.length > 0) html = `<span style="${css.join(';')}">${html}</span>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;

  return html;
}

function blockToHtml(block: ExportBlock): string {
  if (block.kind === 'empty') {
    return '<p class="empty"><br></p>';
  }

  if (block.kind === 'separator') {
    return `<p class="separator">${block.symbol ? escapeHtml(block.symbol) : '&nbsp;'}</p>`;
  }

  const classes: string[] = [];
  if (block.noIndent) classes.push('no-indent');
  if (block.align) classes.push(`align-${block.align}`);
  const attr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';

  return `<p${attr}>${block.runs.map(runToHtml).join('')}</p>`;
}

function buildCss(doc: ExportDocument): string {
  const L = doc.layout;
  const page = EXPORT_PAGE_SIZES_MM[L.pageSize];
  const fs = L.fontSize;

  return `
@page { size: ${page.width}mm ${page.height}mm; margin: ${L.marginCm}cm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: ${cssFontStack(L.fontFamily)};
  font-size: ${fs}pt;
  line-height: ${L.lineHeight};
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
p {
  margin: 0;
  text-indent: ${L.firstLineIndentCm}cm;
  text-align: ${L.justify ? 'justify' : 'left'};
  orphans: 2;
  widows: 2;
}
p.no-indent, p.empty, p.separator, p.align-center, p.align-right { text-indent: 0; }
p.align-center { text-align: center; }
p.align-right { text-align: right; }
p.separator { text-align: center; margin: 1em 0; }
.page-break { break-before: page; page-break-before: always; }
.title-page { padding-top: 6cm; text-align: center; }
.title-page p { text-indent: 0; text-align: center; }
.doc-title { font-size: ${Math.round(fs * 2)}pt; font-weight: bold; line-height: 1.2; margin: 0 0 0.6em; }
.doc-subtitle { font-size: ${Math.round(fs * 1.3)}pt; font-style: italic; }
.doc-author { margin-top: 3em; }
.toc-title, .chapter-title {
  font-size: ${Math.round(fs * 1.5)}pt;
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  margin: 0 0 2em;
  break-after: avoid;
  page-break-after: avoid;
}
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc li { margin: 0.3em 0; }
.chapter.page-break .chapter-title { padding-top: 3cm; }
.chapter:not(.page-break):not(:first-child) { margin-top: 3em; }
`;
}

export function renderExportHtml(doc: ExportDocument): string {
  const sections: string[] = [];

  if (doc.titlePage) {
    const parts = [`<h1 class="doc-title">${escapeHtml(doc.title)}</h1>`];
    if (doc.subtitle) parts.push(`<p class="doc-subtitle">${escapeHtml(doc.subtitle)}</p>`);
    if (doc.author) parts.push(`<p class="doc-author">${escapeHtml(doc.author)}</p>`);
    sections.push(`<section class="title-page">${parts.join('')}</section>`);
  }

  if (hasTableOfContents(doc)) {
    const items = doc.chapters.map((chapter) => `<li>${escapeHtml(chapter.title)}</li>`).join('');
    sections.push(
      `<section class="toc${doc.titlePage ? ' page-break' : ''}">` +
        `<h2 class="toc-title">${escapeHtml(doc.labels.tableOfContents)}</h2>` +
        `<ul>${items}</ul></section>`
    );
  }

  doc.chapters.forEach((chapter, index) => {
    const pageBreak = chapterStartsNewPage(doc, index) ? ' page-break' : '';
    sections.push(
      `<section class="chapter${pageBreak}">` +
        `<h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>` +
        chapter.blocks.map(blockToHtml).join('\n') +
        '</section>'
    );
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(doc.language)}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(doc.title)}</title>
<style>${buildCss(doc)}</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
}