// src/renderer/lib/export/render-html.ts
// Document intermédiaire -> HTML imprimable (export PDF et aperçu).
//
// Les numéros de page et l'en-tête courant sont des cases de marge CSS
// (@page), masquées sur la page de titre. Elles n'apparaissent qu'à
// l'impression (PDF), pas dans un affichage à l'écran.

import type { ExportBlock, ExportDocument, ExportRun } from '../../../shared/export-document';
import {
  chapterStartsNewPage,
  getRunningHeaderText,
  hasTableOfContents
} from '../../../shared/export-document';
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
  if (block.kind === 'image') {
    const box = `max-width:${block.widthCm}cm;max-height:${block.heightCm}cm`;
    return `<p class="bible-image"><img src="${escapeHtml(block.dataUrl)}" alt="" style="${box}"></p>`;
  }

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

/** Chaîne CSS entre guillemets (sans possibilité de sortir de la balise style). */
function cssString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\3C ')
    .replace(/[\r\n]+/g, ' ');
  return `"${escaped}"`;
}

/** Format de page, marges, numéros de page et en-tête courant. */
function buildPageRules(doc: ExportDocument): string {
  const L = doc.layout;
  const page = EXPORT_PAGE_SIZES_MM[L.pageSize];
  const boxFont =
    `font-family: ${cssFontStack(L.fontFamily)}; ` +
    `font-size: ${Math.max(8, L.fontSize - 2)}pt; color: #000;`;
  const header = getRunningHeaderText(doc);
  const boxes: string[] = [];

  if (L.pageNumbers) {
    boxes.push(`@bottom-center { content: counter(page); ${boxFont} }`);
  }
  if (doc.runningHeader && header !== '') {
    boxes.push(`@top-right { content: ${cssString(header)}; ${boxFont} }`);
  }

  let css =
    `@page { size: ${page.width}mm ${page.height}mm; margin: ${L.marginCm}cm; ` +
    `${boxes.join(' ')} }`;

  if (doc.titlePage && boxes.length > 0) {
    css += '\n@page :first { @bottom-center { content: none; } @top-right { content: none; } }';
  }

  return css;
}

function buildCss(doc: ExportDocument): string {
  const L = doc.layout;
  const fs = L.fontSize;

  return `
${buildPageRules(doc)}
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
.bible-image { text-align: center; text-indent: 0; margin: 0.6em 0; }
.bible-image img { display: inline-block; width: auto; height: auto; }
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

// ----------------------------------------------------------------------------
// Aperçu dans la fenêtre d'export
// ----------------------------------------------------------------------------

/** Début du document, préparé pour l'aperçu (voir buildExportPreview). */
export interface ExportPreviewSource {
  document: ExportDocument;
  /** Tous les chapitres exportés, pour la table des matières. */
  tocTitles: string[];
  /** Vrai si l'aperçu ne montre que le début du texte. */
  truncated: boolean;
}

export interface ExportPreviewOptions {
  /** Largeur d'affichage d'une feuille, en pixels. */
  sheetWidthPx: number;
  /** Titres de la table des matières (par défaut : chapitres du document). */
  tocTitles?: string[];
}

const PX_PER_MM = 96 / 25.4;

/**
 * Feuilles blanches à la bonne largeur, avec les marges, la police,
 * l'interligne et les retraits du fichier final. Le texte n'est pas découpé
 * en pages : une nouvelle feuille commence seulement là où le fichier final
 * change de page (page de titre, table des matières, chapitres).
 *
 * Le résultat est inséré dans un shadow DOM (voir ExportPreview.tsx).
 */
export function renderExportPreview(
  doc: ExportDocument,
  options: ExportPreviewOptions
): { css: string; html: string } {
  const L = doc.layout;
  const page = EXPORT_PAGE_SIZES_MM[L.pageSize];
  const zoom = Math.min(1, options.sheetWidthPx / (page.width * PX_PER_MM));
  const sheets: string[][] = [];

  const add = (html: string, newSheet: boolean): void => {
    if (newSheet || sheets.length === 0) sheets.push([]);
    sheets[sheets.length - 1].push(html);
  };

  if (doc.titlePage) {
    const parts = [`<h1 class="doc-title">${escapeHtml(doc.title)}</h1>`];
    if (doc.subtitle) parts.push(`<p class="doc-subtitle">${escapeHtml(doc.subtitle)}</p>`);
    if (doc.author) parts.push(`<p class="doc-author">${escapeHtml(doc.author)}</p>`);
    add(`<section class="title-page">${parts.join('')}</section>`, true);
  }

  const tocTitles = options.tocTitles ?? doc.chapters.map((chapter) => chapter.title);

  if (doc.tableOfContents && tocTitles.length > 0) {
    const items = tocTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join('');
    add(
      `<section class="toc">` +
        `<h2 class="toc-title">${escapeHtml(doc.labels.tableOfContents)}</h2>` +
        `<ul>${items}</ul></section>`,
      true
    );
  }

  doc.chapters.forEach((chapter, index) => {
    const newPage = chapterStartsNewPage(doc, index);
    add(
      `<section class="chapter${newPage ? ' page-break' : ''}">` +
        `<h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>` +
        chapter.blocks.map(blockToHtml).join('\n') +
        '</section>',
      newPage
    );
  });

  const body = (sheets.length > 0 ? sheets : [[]])
    .map((parts) => `<div class="sheet">${parts.join('\n')}</div>`)
    .join('\n');

  const css = `${buildCss(doc)}
:host { all: initial; display: block; }
.preview { zoom: ${zoom.toFixed(4)}; padding: 16px 0; }
.sheet {
  width: ${page.width}mm;
  min-height: ${page.height}mm;
  padding: ${L.marginCm}cm;
  margin: 0 auto 16px;
  background: #fff;
  color: #000;
  font-family: ${cssFontStack(L.fontFamily)};
  font-size: ${L.fontSize}pt;
  line-height: ${L.lineHeight};
  overflow-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
`;

  return { css, html: `<div class="preview">${body}</div>` };
}