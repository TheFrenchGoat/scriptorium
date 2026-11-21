// src/shared/typography-typing.ts
// Typographie pendant la frappe (etape 2d).
//
// Module pur, sans DOM ni Electron. Il recoit le texte du paragraphe situe
// avant le curseur et la touche tapee, et dit ce qu'il faut ecrire a la place :
// - remove : nombre de caracteres a retirer juste avant le curseur ;
// - insert : texte ecrit a la place de la touche (peut etre vide).
// null : la touche est inseree telle quelle.
//
// Regles :
// - apostrophe courbe apres une lettre ; en anglais, guillemet simple
//   ouvrant en debut de citation ;
// - guillemets francais (avec l'espace du reglage) ou anglais, ouvrants ou
//   fermants selon le contexte et les guillemets deja ouverts ;
// - trois points deviennent des points de suspension ;
// - en francais, l'espace tapee avant : ; ! ? prend la forme du reglage
//   (aucune espace n'est ajoutee si l'auteur n'en a pas mis) ;
// - en francais, une espace tapee juste apres un guillemet ouvrant (deja
//   suivi de son espace) est ignoree.
// Un chiffre suivi de ' ou " (pieds, pouces) n'est jamais modifie.

import type { TypoLanguage, TypoSpacing } from './typography';

export interface TypingFixOptions {
  language: TypoLanguage;
  /** Francais seulement. Absent : standard. */
  spacing?: TypoSpacing;
}

export interface TypingFix {
  /** Caracteres retires juste avant le curseur. */
  remove: number;
  /** Texte ecrit a la place de la touche (peut etre vide). */
  insert: string;
}

/** Texte avant le curseur pris en compte (guillemets ouverts). */
export const TYPING_CONTEXT_LENGTH = 2000;

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);
const APOS = String.fromCharCode(0x2019);
const LSQUO = String.fromCharCode(0x2018);
const LDQUO = String.fromCharCode(0x201c);
const RDQUO = String.fromCharCode(0x201d);
const LAQUO = String.fromCharCode(0xab);
const RAQUO = String.fromCharCode(0xbb);
const ELLIPSIS = String.fromCharCode(0x2026);
const SPACES = ' ' + NBSP + NNBSP + String.fromCharCode(0x2009, 9);
const NEWLINES = String.fromCharCode(10, 13);
const OPENERS = '([{/' + String.fromCharCode(0x2014, 0x2013) + LSQUO + LDQUO + LAQUO;
const FRENCH_MARKS = ':;!?';
const BACKSLASH = String.fromCharCode(92);
const LETTER_PATTERN = new RegExp('[' + BACKSLASH + 'p{L}' + BACKSLASH + 'p{M}]', 'u');

function isLetter(ch: string): boolean {
  return ch.length === 1 && LETTER_PATTERN.test(ch);
}

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= '0' && ch <= '9';
}

/** Vrai si ch est UN caractere present dans set (jamais vrai pour ''). */
function inSet(ch: string, set: string): boolean {
  return ch.length === 1 && set.indexOf(ch) >= 0;
}

/** Vrai si un guillemet tape apres ce caractere ouvre une citation. */
function opensQuote(prev: string): boolean {
  return prev === '' || inSet(prev, SPACES) || inSet(prev, NEWLINES) || inSet(prev, OPENERS);
}

function countOf(text: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === ch) n += 1;
  }
  return n;
}

/** Espace attendue avant une ponctuation haute (francais) ; '' : aucune. */
function markSpace(mark: string, spacing: TypoSpacing): string {
  if (spacing === 'thin') return NNBSP;
  if (mark === ':') return NBSP;
  return spacing === 'quebec' ? '' : NNBSP;
}

/** Ce qu'il faut ecrire a la place de la touche, ou null. */
export function typingFix(before: string, key: string, options: TypingFixOptions): TypingFix | null {
  if (typeof before !== 'string' || typeof key !== 'string' || key.length !== 1) return null;
  const french = !(options && options.language === 'en');
  const wanted = options ? options.spacing : undefined;
  const spacing: TypoSpacing = wanted === 'thin' || wanted === 'quebec' ? wanted : 'standard';
  const text =
    before.length > TYPING_CONTEXT_LENGTH ? before.slice(before.length - TYPING_CONTEXT_LENGTH) : before;
  const prev = text.charAt(text.length - 1);
  const prev2 = text.charAt(text.length - 2);

  if (key === SQ) {
    if (isDigit(prev)) return null;
    if (isLetter(prev)) return { remove: 0, insert: APOS };
    if (french) return null;
    return { remove: 0, insert: opensQuote(prev) ? LSQUO : APOS };
  }

  if (key === DQ) {
    if (isDigit(prev)) return null;
    if (!french) {
      const openEn = countOf(text, LDQUO) > countOf(text, RDQUO);
      return { remove: 0, insert: openEn || !opensQuote(prev) ? RDQUO : LDQUO };
    }
    const space = spacing === 'thin' ? NNBSP : NBSP;
    const openFr = countOf(text, LAQUO) > countOf(text, RAQUO);
    if (!openFr && opensQuote(prev)) return { remove: 0, insert: LAQUO + space };
    if (inSet(prev, SPACES) && prev2 !== '' && !inSet(prev2, SPACES)) {
      return { remove: 1, insert: space + RAQUO };
    }
    return { remove: 0, insert: space + RAQUO };
  }

  if (key === '.') {
    if (text.slice(-2) === '..' && text.charAt(text.length - 3) !== '.') {
      return { remove: 2, insert: ELLIPSIS };
    }
    return null;
  }

  if (!french) return null;

  if (inSet(key, FRENCH_MARKS)) {
    if (!inSet(prev, SPACES) || prev2 === '' || inSet(prev2, SPACES) || inSet(prev2, NEWLINES)) return null;
    const markSp = markSpace(key, spacing);
    if (prev === markSp) return null;
    return { remove: 1, insert: markSp + key };
  }

  if (key === ' ') {
    if ((prev === NBSP || prev === NNBSP) && prev2 === LAQUO) return { remove: 0, insert: '' };
    return null;
  }

  return null;
}
