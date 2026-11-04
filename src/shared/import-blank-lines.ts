// src/shared/import-blank-lines.ts
// Lignes vides entre les paragraphes d'un document importé.
//
// Les importeurs gardent les vraies lignes vides du document sous la forme
// <div><br></div>. Les lignes fantômes (image retirée, saut de page, texte
// masqué...) sont déjà écartées. L'aperçu d'import applique ensuite le
// réglage choisi, sans relire le fichier :
// - 'auto' : si la plupart des paragraphes sont séparés par des lignes vides,
//   ces séparations ordinaires sont retirées ; un blanc plus grand que
//   d'habitude (changement de scène) est gardé une seule fois ;
// - 'remove' : toutes les lignes vides sont retirées ;
// - 'keep' : rien ne change.
// Le HTML d'un chapitre importé est une suite de paragraphes <div> ou <p> sans
// imbrication ; sinon il est rendu tel quel.

export type BlankLineMode = 'auto' | 'remove' | 'keep';

/** Résultat de l'analyse des lignes vides d'un document. */
export interface BlankLineAnalysis {
  /** Nombre de lignes vides dans le document. */
  blankLines: number;
  /** Lignes vides qui séparent habituellement deux paragraphes (0 : aucune). */
  usualRun: number;
}

interface HtmlBlock {
  html: string;
  blank: boolean;
}

const SPACE = '[' + String.fromCharCode(32, 9, 10, 12, 13) + ']';
const BLOCK_SOURCE = '<(?:div|p)(?:' + SPACE + '[^>]*)?>([^]*?)</(?:div|p)>';
const NESTED_BLOCK = new RegExp('<(?:div|p)(?:' + SPACE + '|/|>)', 'i');
const INVISIBLE = String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0xad);

/** Contenu sans texte visible ni image. */
function isBlankContent(inner: string): boolean {
  if (/<img/i.test(inner)) {
    return false;
  }

  const text = inner.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#(?:0*160|x0*a0);/gi, ' ');

  return Array.from(text).every((char) => char.trim() === '' || INVISIBLE.includes(char));
}

/** Découpe le HTML en paragraphes, ou null s'il n'a pas la forme attendue. */
function splitBlocks(html: string): HtmlBlock[] | null {
  const pattern = new RegExp(BLOCK_SOURCE, 'gi');
  const blocks: HtmlBlock[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const inner = match[1] ?? '';

    if (html.slice(cursor, match.index).trim() !== '' || NESTED_BLOCK.test(inner)) {
      return null;
    }

    blocks.push({ html: match[0], blank: isBlankContent(inner) });
    cursor = match.index + match[0].length;
  }

  return html.slice(cursor).trim() === '' ? blocks : null;
}

/** Analyse les lignes vides de tous les chapitres du document. */
export function analyzeBlankLines(chapterHtmls: string[]): BlankLineAnalysis {
  let blankLines = 0;
  const gaps: number[] = [];

  chapterHtmls.forEach((html) => {
    const blocks = splitBlocks(html);

    if (!blocks) {
      return;
    }

    let seenText = false;
    let run = 0;

    blocks.forEach((block) => {
      if (block.blank) {
        blankLines++;
        run++;
        return;
      }

      if (seenText) {
        gaps.push(run);
      }

      seenText = true;
      run = 0;
    });
  });

  const separated = gaps.filter((gap) => gap > 0);

  /* Séparations ordinaires seulement si plus de la moitié des paragraphes en ont une. */
  if (separated.length === 0 || separated.length * 2 <= gaps.length) {
    return { blankLines, usualRun: 0 };
  }

  const counts = new Map<number, number>();

  separated.forEach((gap) => {
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  });

  let usualRun = 0;
  let best = 0;

  counts.forEach((count, gap) => {
    if (count > best || (count === best && gap < usualRun)) {
      best = count;
      usualRun = gap;
    }
  });

  return { blankLines, usualRun };
}

/** Applique le réglage choisi au HTML d'un chapitre. */
export function applyBlankLines(html: string, mode: BlankLineMode, analysis: BlankLineAnalysis): string {
  if (mode === 'keep') {
    return html;
  }

  const blocks = splitBlocks(html);

  if (!blocks) {
    return html;
  }

  const kept: string[] = [];
  let runFirst: string | null = null;
  let runLength = 0;

  blocks.forEach((block) => {
    if (block.blank) {
      runFirst = runFirst ?? block.html;
      runLength++;
      return;
    }

    if (mode === 'auto' && kept.length > 0 && runFirst !== null && runLength > analysis.usualRun) {
      kept.push(runFirst);
    }

    runFirst = null;
    runLength = 0;
    kept.push(block.html);
  });

  return kept.join('');
}
