// js/docx-export.js
// Transforme le HTML produit par l'éditeur (contentEditable) en une structure
// de données neutre (tableau de paragraphes/runs) que le processus principal
// utilisera pour générer le .docx via la librairie 'docx' (voir utils.js).
// Cette conversion utilise l'API Canvas du navigateur pour normaliser les
// couleurs CSS : elle doit donc rester côté renderer, pas côté main.

function htmlSizeToPt(sizeStr) {
  const map = { '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
  return map[sizeStr] || 12;
}

function colorToHex(colorStr) {
  if (!colorStr) return undefined;
  let c = colorStr.trim().toLowerCase();

  if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || c === '#00000000') {
    return undefined;
  }

  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = c;
    const computed = ctx.fillStyle;

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
        const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
        const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
        const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
        return r + g + b;
      }
    }
  } catch (e) { /* ignore, on tente le fallback regex ci-dessous */ }

  if (c.startsWith('rgb')) {
    const match = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      if (match[4] !== undefined && parseFloat(match[4]) === 0) return undefined;
      const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
      const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
      const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
      return r + g + b;
    }
  }

  return undefined;
}

function parseEditorToDocxData(node, currentStyles = {}) {
  let paragraphs = [];

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      return [{ text: node.textContent, ...currentStyles }];
    }
    return [];
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    let newStyles = { ...currentStyles };

    if (tag === 'b' || tag === 'strong' || node.style.fontWeight === 'bold') newStyles.bold = true;
    if (tag === 'i' || tag === 'em' || node.style.fontStyle === 'italic') newStyles.italic = true;
    if (tag === 'u' || node.style.textDecoration === 'underline') newStyles.underline = true;

    if (tag === 'font') {
      if (node.face) newStyles.font = node.face.replace(/['"]/g, '');
      if (node.size) newStyles.size = htmlSizeToPt(node.size);
      if (node.color) {
        const hexColor = colorToHex(node.color);
        if (hexColor) newStyles.color = hexColor;
      }
    }
    if (node.style.fontFamily) newStyles.font = node.style.fontFamily.replace(/['"]/g, '');
    if (node.style.fontSize) {
      const px = parseInt(node.style.fontSize);
      if (!isNaN(px)) newStyles.size = px * 0.75;
    }
    if (node.style.color) {
      const hexColor = colorToHex(node.style.color);
      if (hexColor) newStyles.color = hexColor;
    }

    if (['div', 'p', 'h1', 'h2', 'h3', 'li'].includes(tag)) {
      let childRuns = [];
      node.childNodes.forEach(child => {
        const res = parseEditorToDocxData(child, newStyles);
        if (res.length > 0 && res[0].runs) {
          paragraphs = paragraphs.concat(res);
        } else {
          childRuns = childRuns.concat(res);
        }
      });
      if (childRuns.length > 0) {
        paragraphs.push({ runs: childRuns, isBlock: true });
      } else if (tag === 'p' || tag === 'div') {
        paragraphs.push({ runs: [], isBlock: true });
      }
    } else {
      let childRuns = [];
      node.childNodes.forEach(child => {
        const res = parseEditorToDocxData(child, newStyles);
        if (res.length > 0 && res[0].runs) {
          paragraphs = paragraphs.concat(res);
        } else {
          childRuns = childRuns.concat(res);
        }
      });
      return childRuns;
    }
  }
  return paragraphs;
}

// Construit le tableau final de "paragraphesData" (titres de chapitres,
// sauts de page, paragraphes stylés) attendu par utils.js#generateDocx,
// à partir de l'ensemble des chapitres du projet.
export function buildDocxData(projectData) {
  const chapterNames = Object.keys(projectData.chapters);
  let finalDocxData = [];

  chapterNames.forEach((chapName, i) => {
    if (i > 0) {
      finalDocxData.push({ isPageBreak: true });
    }

    finalDocxData.push({ isChapterTitle: true, text: chapName });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = projectData.chapters[chapName] || '';

    const parsed = parseEditorToDocxData(tempDiv);
    finalDocxData = finalDocxData.concat(wrapBareRuns(parsed));
  });

  return finalDocxData;
}

// parseEditorToDocxData() peut renvoyer un MÉLANGE de deux formes d'objets :
// - des paragraphes déjà formés ({ runs: [...], isBlock: true })
// - des "runs" de texte isolés ({ text, bold, italic, ... }), quand du texte
//   se retrouve directement à la racine du chapitre sans être enveloppé dans
//   un <div>/<p> (arrive avec certains contentEditable avant leur première
//   mise en forme automatique par le navigateur).
// L'ancienne logique ne regardait que le premier élément du tableau pour
// décider s'il fallait "tout emballer en un seul paragraphe" ou "tout passer
// tel quel" : un mélange (texte orphelin suivi d'un vrai <div>) faisait
// passer des objets paragraphe pour des runs, et utils.js générait alors des
// TextRun({ text: undefined }) — DOCX corrompu ou texte manquant.
// On regroupe donc uniquement les runs isolés consécutifs, sans jamais les
// mélanger avec un objet paragraphe déjà formé.
function wrapBareRuns(items) {
  const result = [];
  let pendingRuns = [];

  const flushPending = () => {
    if (pendingRuns.length > 0) {
      result.push({ runs: pendingRuns, isBlock: true });
      pendingRuns = [];
    }
  };

  items.forEach(item => {
    const isParagraphLike = item && (item.runs || item.isBlock || item.isPageBreak || item.isChapterTitle);
    if (isParagraphLike) {
      flushPending();
      result.push(item);
    } else {
      pendingRuns.push(item);
    }
  });
  flushPending();

  return result;
}
