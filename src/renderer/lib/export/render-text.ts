// src/renderer/lib/export/render-text.ts
// Document intermédiaire -> texte brut (.txt) et Markdown (.md).

import type { ExportDocument, ExportRun } from '../../../shared/export-document';
import { hasTableOfContents } from '../../../shared/export-document';

// ----------------------------------------------------------------------------
// Texte brut
// ----------------------------------------------------------------------------

export function renderExportText(doc: ExportDocument): string {
  const lines: string[] = [];

  if (doc.titlePage) {
    lines.push(doc.title);
    if (doc.subtitle) lines.push(doc.subtitle);
    if (doc.author) lines.push('', doc.author);
    lines.push('', '', '');
  }

  if (hasTableOfContents(doc)) {
    lines.push(doc.labels.tableOfContents, '');
    for (const chapter of doc.chapters) lines.push(chapter.title);
    lines.push('', '', '');
  }

  doc.chapters.forEach((chapter, index) => {
    if (index > 0) lines.push('', '', '');
    lines.push(chapter.title, '');

    for (const block of chapter.blocks) {
      if (block.kind === 'paragraph') {
        lines.push(block.runs.map((run) => run.text).join(''));
      } else if (block.kind === 'separator') {
        lines.push('', block.symbol, '');
      } else {
        lines.push('');
      }
    }
  });

  // Fins de ligne Windows : le fichier s'ouvre proprement partout.
  return (lines.join('\n').replace(/\s+$/, '') + '\n').replace(/\n/g, '\r\n');
}

// ----------------------------------------------------------------------------
// Markdown
// ----------------------------------------------------------------------------

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<])/g, '\\$1');
}

/** Empêche « - Bonjour » (dialogue) de devenir une liste, « # » un titre... */
function protectLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3');
}

/** Place les marqueurs contre le texte : « ** mot** » ne serait pas reconnu. */
function wrap(text: string, open: string, close: string = open): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match || match[2] === '') return text;
  return `${match[1]}${open}${match[2]}${close}${match[3]}`;
}

function runsToMarkdown(runs: ExportRun[]): string {
  // Le Markdown ignore polices, tailles et couleurs : on fusionne les
  // morceaux qui ont le même gras/italique/souligné.
  const merged: ExportRun[] = [];

  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (
      previous && run.text !== '\n' && previous.text !== '\n' &&
      !!previous.bold === !!run.bold &&
      !!previous.italic === !!run.italic &&
      !!previous.underline === !!run.underline
    ) {
      previous.text += run.text;
    } else {
      merged.push({ text: run.text, bold: run.bold, italic: run.italic, underline: run.underline });
    }
  }

  return merged
    .map((run) => {
      if (run.text === '\n') return '  \n';
      let text = escapeMarkdown(run.text);
      if (run.italic) text = wrap(text, '*');
      if (run.bold) text = wrap(text, '**');
      if (run.underline) text = wrap(text, '<u>', '</u>');
      return text;
    })
    .join('');
}

export function renderExportMarkdown(doc: ExportDocument): string {
  const parts: string[] = [];
  const chapterLevel = doc.titlePage ? '##' : '#';

  if (doc.titlePage) {
    parts.push(`# ${escapeMarkdown(doc.title)}`);
    if (doc.subtitle) parts.push(wrap(escapeMarkdown(doc.subtitle), '*'));
    if (doc.author) parts.push(escapeMarkdown(doc.author));
  }

  if (hasTableOfContents(doc)) {
    parts.push(`${chapterLevel} ${escapeMarkdown(doc.labels.tableOfContents)}`);
    parts.push(doc.chapters.map((chapter) => `- ${escapeMarkdown(chapter.title)}`).join('\n'));
  }

  for (const chapter of doc.chapters) {
    parts.push(`${chapterLevel} ${escapeMarkdown(chapter.title)}`);

    for (const block of chapter.blocks) {
      if (block.kind === 'paragraph') {
        parts.push(runsToMarkdown(block.runs).split('\n').map(protectLineStart).join('\n'));
      } else if (block.kind === 'separator') {
        parts.push(block.symbol === '' ? '&nbsp;' : '* * *');
      }
      // Les lignes vides n'ont pas d'équivalent en Markdown.
    }
  }

  return parts.join('\n\n') + '\n';
}