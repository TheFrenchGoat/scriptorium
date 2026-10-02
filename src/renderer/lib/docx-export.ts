// src/renderer/lib/docx-export.ts
// Transforme le HTML produit par l'éditeur (contentEditable) en une structure
// de données neutre (tableau de paragraphes/runs) que le processus principal
// utilisera pour générer le .docx. Cette conversion utilise l'API Canvas du
// navigateur pour normaliser les couleurs CSS : elle doit donc rester côté
// renderer, pas côté main.

import type { DocxParagraph, DocxRun, ProjectData } from '../../shared/types';

function htmlSizeToPt(sizeStr: string): number {
  const map: Record<string, number> = { '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
  return map[sizeStr] || 12;
}

function colorToHex(colorStr: string | undefined | null): string | undefined {
  if (!colorStr) return undefined;
  const c = colorStr.trim().toLowerCase();

  if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || c === '#00000000') return undefined;

  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = c;
      const computed = ctx.fillStyle as string;

      if (computed.startsWith('#')) {
        let hex = computed.substring(1);
        if (hex.length === 8) {
          if (hex.substring(6, 8) === '00') return undefined;
          hex = hex.substring(0, 6);
        }
        if (hex.length === 6) return hex;
      }

      if (computed.startsWith('rgba')) {
        const match = computed.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
        if (match) {
          if (parseFloat(match[4]) === 0) return undefined;
          return (
            parseInt(match[1], 10).toString(16).padStart(2, '0') +
            parseInt(match[2], 10).toString(16).padStart(2, '0') +
            parseInt(match[3], 10).toString(16).padStart(2, '0')
          );
        }
      }
    }
  } catch {
    /* ignore, on tente le repli regex ci-dessous */
  }

  if (c.startsWith('rgb')) {
    const match = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      if (match[4] !== undefined && parseFloat(match[4]) === 0) return undefined;
      return (
        parseInt(match[1], 10).toString(16).padStart(2, '0') +
        parseInt(match[2], 10).toString(16).padStart(2, '0') +
        parseInt(match[3], 10).toString(16).padStart(2, '0')
      );
    }
  }

  return undefined;
}

type RunStyles = Omit<DocxRun, 'text'>;

function isParagraph(item: DocxRun | DocxParagraph): item is DocxParagraph {
  return (item as DocxParagraph).runs !== undefined;
}

function parseEditorToDocxData(node: Node, currentStyles: RunStyles = {}): (DocxRun | DocxParagraph)[] {
  let paragraphs: DocxParagraph[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) return [{ text: node.textContent, ...currentStyles }];
    return [];
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const newStyles: RunStyles = { ...currentStyles };

    if (tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold') newStyles.bold = true;
    if (tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic') newStyles.italic = true;
    if (tag === 'u' || el.style.textDecoration === 'underline') newStyles.underline = true;

    if (tag === 'font') {
      const fontEl = el as HTMLFontElement;
      if (fontEl.face) newStyles.font = fontEl.face.replace(/['"]/g, '');
      if (fontEl.size) newStyles.size = htmlSizeToPt(String(fontEl.size));
      if (fontEl.color) {
        const hexColor = colorToHex(fontEl.color);
        if (hexColor) newStyles.color = hexColor;
      }
    }
    if (el.style.fontFamily) newStyles.font = el.style.fontFamily.replace(/['"]/g, '');
    if (el.style.fontSize) {
      const px = parseInt(el.style.fontSize, 10);
      if (!Number.isNaN(px)) newStyles.size = px * 0.75;
    }
    if (el.style.color) {
      const hexColor = colorToHex(el.style.color);
      if (hexColor) newStyles.color = hexColor;
    }

    const collectChildren = (): DocxRun[] => {
      let childRuns: DocxRun[] = [];
      el.childNodes.forEach((child) => {
        const res = parseEditorToDocxData(child, newStyles);
        if (res.length > 0 && isParagraph(res[0])) {
          paragraphs = paragraphs.concat(res as DocxParagraph[]);
        } else {
          childRuns = childRuns.concat(res as DocxRun[]);
        }
      });
      return childRuns;
    };

    if (['div', 'p', 'h1', 'h2', 'h3', 'li'].includes(tag)) {
      const childRuns = collectChildren();
      if (childRuns.length > 0) {
        paragraphs.push({ runs: childRuns, isBlock: true });
      } else if (tag === 'p' || tag === 'div') {
        paragraphs.push({ runs: [], isBlock: true });
      }
    } else {
      return collectChildren();
    }
  }
  return paragraphs;
}

// parseEditorToDocxData() peut renvoyer un MÉLANGE de deux formes d'objets :
// - des paragraphes déjà formés ({ runs: [...], isBlock: true })
// - des "runs" de texte isolés ({ text, bold, ... }), quand du texte se
//   retrouve directement à la racine du chapitre sans être enveloppé dans un
//   <div>/<p>.
// L'ancienne logique ne regardait que le premier élément du tableau pour
// décider : un mélange faisait passer des objets paragraphe pour des runs, et
// la génération produisait des TextRun({ text: undefined }) — DOCX corrompu.
// On regroupe donc uniquement les runs isolés consécutifs.
function wrapBareRuns(items: (DocxRun | DocxParagraph)[]): DocxParagraph[] {
  const result: DocxParagraph[] = [];
  let pendingRuns: DocxRun[] = [];

  const flushPending = () => {
    if (pendingRuns.length > 0) {
      result.push({ runs: pendingRuns, isBlock: true });
      pendingRuns = [];
    }
  };

  items.forEach((item) => {
    const asParagraph = item as DocxParagraph;
    const isParagraphLike =
      !!item && (asParagraph.runs !== undefined || asParagraph.isBlock || asParagraph.isPageBreak || asParagraph.isChapterTitle);
    if (isParagraphLike) {
      flushPending();
      result.push(asParagraph);
    } else {
      pendingRuns.push(item as DocxRun);
    }
  });
  flushPending();

  return result;
}

/** Construit le tableau final attendu par le processus principal, à partir de
 *  l'ensemble des chapitres du projet. */
export function buildDocxData(projectData: ProjectData): DocxParagraph[] {
  const chapterNames = Object.keys(projectData.chapters);
  let finalDocxData: DocxParagraph[] = [];

  chapterNames.forEach((chapName, i) => {
    if (i > 0) finalDocxData.push({ isPageBreak: true });
    finalDocxData.push({ isChapterTitle: true, text: chapName });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = projectData.chapters[chapName] || '';

    const parsed = parseEditorToDocxData(tempDiv);
    finalDocxData = finalDocxData.concat(wrapBareRuns(parsed));
  });

  return finalDocxData;
}
