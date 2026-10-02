// src/renderer/lib/markdown-export.ts
// Convertit le HTML des chapitres en Markdown. Les couleurs et polices ne sont
// pas transposables en Markdown standard : seule la mise en forme structurelle
// (gras, italique, souligné, paragraphes) est conservée.

import type { ProjectData } from '../../shared/types';

interface MdStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function escapeMarkdown(text: string): string {
  // On n'échappe que ce qui pourrait créer accidentellement de la syntaxe
  // (gras/italique/code). Les autres caractères (# - . etc.) sont laissés tels
  // quels : les échapper systématiquement rendrait le texte illisible.
  return text.replace(/([\\`*_])/g, '\\$1');
}

function nodeToMarkdown(node: Node, styles: MdStyles = {}): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = escapeMarkdown(node.textContent ?? '');
    if (styles.bold) text = `**${text}**`;
    if (styles.italic) text = `*${text}*`;
    if (styles.underline) text = `<u>${text}</u>`;
    return text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '  \n';

  const newStyles: MdStyles = { ...styles };
  if (tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold') newStyles.bold = true;
  if (tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic') newStyles.italic = true;
  if (tag === 'u' || el.style.textDecoration === 'underline') newStyles.underline = true;

  const childrenMd = Array.from(el.childNodes)
    .map((c) => nodeToMarkdown(c, newStyles))
    .join('');

  if (tag === 'div' || tag === 'p') return childrenMd + '\n\n';
  return childrenMd;
}

export function buildMarkdown(projectData: ProjectData): string {
  const chapterNames = Object.keys(projectData.chapters);
  let md = '';

  chapterNames.forEach((name, i) => {
    if (i > 0) md += '\n\n---\n\n';
    md += `# ${name}\n\n`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = projectData.chapters[name] || '';
    md += nodeToMarkdown(tempDiv).trim();
  });

  // Nettoyage des sauts de ligne multiples générés par les lignes vides du
  // contentEditable.
  return (md + '\n').replace(/\n{3,}/g, '\n\n');
}
