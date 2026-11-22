// src/shared/typography.ts
// Typographie : regles de l'edition francaise et anglaise.
//
// Module pur, sans DOM ni Electron : il examine le texte d'UN paragraphe
// et renvoie les corrections proposees. Il sert a la verification du
// projet, puis servira a l'import, a l'export et a la frappe.
//
// - Chaque correction remplace la plage [start, end) du texte ; une plage
//   vide est une insertion. Les plages renvoyees ne se chevauchent jamais.
// - replacement === null : cas seulement signale, jamais corrige.
// - Adresses web, e-mails, heures, nombres decimaux et emoticones ne sont
//   jamais modifies.
// - Les caracteres speciaux sont ecrits par leur code : ce fichier reste
//   en ASCII.

export type TypoLanguage = 'fr' | 'en';

/**
 * Espaces du francais :
 * - standard : fine insecable avant ; ! ?, insecable avant : et dans les guillemets ;
 * - thin : fine insecable partout ;
 * - quebec : aucune espace avant ; ! ?, insecable avant : et dans les guillemets.
 */
export type TypoSpacing = 'standard' | 'thin' | 'quebec';

/** Style des dialogues attendu (francais). any : aucun controle. */
export type TypoDialogueStyle = 'any' | 'quotes' | 'dash';

export type TypoCategory =
  | 'apostrophes'
  | 'quotes'
  | 'punctuation'
  | 'spaces'
  | 'ellipsis'
  | 'dashes'
  | 'numbers'
  | 'digits'
  | 'dialogue';

export const TYPO_CATEGORIES: readonly TypoCategory[] = [
  'apostrophes',
  'quotes',
  'punctuation',
  'spaces',
  'ellipsis',
  'dashes',
  'numbers',
  'digits',
  'dialogue'
];

/** Categories seulement signalees : aucune correction automatique. */
export const TYPO_REPORT_ONLY: readonly TypoCategory[] = ['digits', 'dialogue'];

export interface TypoOptions {
  language: TypoLanguage;
  /** Francais seulement. Absent : standard. */
  spacing?: TypoSpacing;
  /** Francais seulement. Absent : any. */
  dialogueStyle?: TypoDialogueStyle;
  /** Categories examinees. Absent : toutes. */
  categories?: readonly TypoCategory[];
}

export interface TypoIssue {
  category: TypoCategory;
  /** Code stable de la regle (messages, cas ignores). */
  rule: string;
  start: number;
  end: number;
  /** Texte remplace (vide pour une insertion). */
  original: string;
  /** Texte propose, ou null si le cas est seulement signale. */
  replacement: string | null;
}

// ----- Caracteres -----

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const THIN = String.fromCharCode(0x2009);
const TAB = String.fromCharCode(9);
const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);
const APOS = String.fromCharCode(0x2019);
const LSQUO = String.fromCharCode(0x2018);
const LDQUO = String.fromCharCode(0x201c);
const RDQUO = String.fromCharCode(0x201d);
const LAQUO = String.fromCharCode(0xab);
const RAQUO = String.fromCharCode(0xbb);
const ELLIPSIS = String.fromCharCode(0x2026);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DEGREE = String.fromCharCode(0xb0);
const E_GRAVE = String.fromCharCode(0xe8);
const E_ACUTE = String.fromCharCode(0xe9);
const CURRENCIES = String.fromCharCode(36, 0x20ac, 0xa3);
const BACKSLASH = String.fromCharCode(92);

const LETTER_PATTERN = new RegExp('[' + BACKSLASH + 'p{L}' + BACKSLASH + 'p{M}]', 'u');

function isLetter(ch: string): boolean {
  return ch.length === 1 && LETTER_PATTERN.test(ch);
}

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= '0' && ch <= '9';
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === NBSP || ch === NNBSP || ch === THIN || ch === TAB;
}

function isAsciiLetter(ch: string): boolean {
  return ch.length === 1 && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

/** Vrai si ch est UN caractere present dans set (jamais vrai pour ''). */
function inSet(ch: string, set: string): boolean {
  return ch.length === 1 && set.indexOf(ch) >= 0;
}

/** Debut de la suite d'espaces qui precede index. */
function spacesBefore(text: string, index: number): number {
  let k = index;
  while (k > 0 && isSpace(text.charAt(k - 1))) k--;
  return k;
}

/** Fin de la suite d'espaces qui commence a index. */
function spacesAfter(text: string, index: number): number {
  let j = index;
  while (j < text.length && isSpace(text.charAt(j))) j++;
  return j;
}

// ----- Zones protegees -----

interface Span {
  start: number;
  end: number;
}

const URL_PREFIXES: readonly string[] = ['http://', 'https://', 'www.'];
const URL_TRAILING = '.,;:!?)]}' + DQ + SQ + RAQUO + RDQUO + APOS + ELLIPSIS;
const EMAIL_CHARS = '._%+-';
const EMOTICON_EYES = ':;';
const EMOTICON_MOUTHS = ')(DPpOo/|][';

function isEmailChar(ch: string): boolean {
  return isAsciiLetter(ch) || isDigit(ch) || inSet(ch, EMAIL_CHARS);
}

/** Adresses web, e-mails, heures, nombres decimaux et emoticones. */
function findProtectedSpans(text: string): Span[] {
  const spans: Span[] = [];
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const before = text.charAt(i - 1);
    if (isLetter(before) || isDigit(before)) continue;
    for (const prefix of URL_PREFIXES) {
      if (text.slice(i, i + prefix.length).toLowerCase() !== prefix) continue;
      let end = i + prefix.length;
      while (end < n) {
        const ch = text.charAt(end);
        if (ch.trim() === '' || ch === LAQUO || ch === RAQUO || ch === DQ) break;
        end++;
      }
      while (end > i + prefix.length && inSet(text.charAt(end - 1), URL_TRAILING)) end--;
      spans.push({ start: i, end });
    }
  }

  for (let i = 0; i < n; i++) {
    if (text.charAt(i) !== '@') continue;
    let a = i;
    while (a > 0 && isEmailChar(text.charAt(a - 1))) a--;
    let b = i + 1;
    while (b < n && isEmailChar(text.charAt(b))) b++;
    while (b > i + 1 && text.charAt(b - 1) === '.') b--;
    if (a < i && b > i + 1) spans.push({ start: a, end: b });
  }

  for (let i = 0; i < n; i++) {
    if (!isDigit(text.charAt(i)) || isDigit(text.charAt(i - 1))) continue;
    let j = i;
    while (isDigit(text.charAt(j))) j++;
    let end = j;
    while (inSet(text.charAt(end), ':.,') && isDigit(text.charAt(end + 1))) {
      end++;
      while (isDigit(text.charAt(end))) end++;
    }
    if (end > j) spans.push({ start: i, end });
    i = end - 1;
  }

  for (let i = 0; i < n; i++) {
    if (!inSet(text.charAt(i), EMOTICON_EYES)) continue;
    let j = i + 1;
    if (text.charAt(j) === '-' || text.charAt(j) === SQ) j++;
    if (!inSet(text.charAt(j), EMOTICON_MOUTHS)) continue;
    const after = text.charAt(j + 1);
    if (isLetter(after) || isDigit(after)) continue;
    spans.push({ start: i, end: j + 1 });
  }

  return spans;
}

/** Une insertion est protegee si elle tombe a l'interieur d'une zone. */
function isProtected(spans: readonly Span[], start: number, end: number): boolean {
  for (const span of spans) {
    if (start === end) {
      if (span.start < start && start < span.end) return true;
    } else if (span.start < end && start < span.end) {
      return true;
    }
  }
  return false;
}

// ----- Contexte d'analyse -----

interface Candidate extends TypoIssue {
  order: number;
}

interface Context {
  text: string;
  n: number;
  fr: boolean;
  dialogueStyle: TypoDialogueStyle;
  /** Espace a l'interieur des guillemets francais. */
  quoteSpace: string;
  /** Espace avant les deux-points. */
  colonSpace: string;
  /** Espace avant ; ! ? (vide pour l'usage quebecois). */
  punctSpace: string;
  enabled: Set<TypoCategory>;
  spans: Span[];
  found: Candidate[];
}

function createContext(text: string, options: TypoOptions): Context {
  const opts = (options || {}) as Partial<TypoOptions>;
  const fr = opts.language !== 'en';
  const spacing: TypoSpacing =
    opts.spacing === 'thin' || opts.spacing === 'quebec' ? opts.spacing : 'standard';
  const dialogueStyle: TypoDialogueStyle =
    opts.dialogueStyle === 'quotes' || opts.dialogueStyle === 'dash' ? opts.dialogueStyle : 'any';
  const wanted = opts.categories ? opts.categories : TYPO_CATEGORIES;
  const enabled = new Set<TypoCategory>();
  for (const category of wanted) {
    if (TYPO_CATEGORIES.indexOf(category) >= 0) enabled.add(category);
  }
  return {
    text,
    n: text.length,
    fr,
    dialogueStyle,
    quoteSpace: spacing === 'thin' ? NNBSP : NBSP,
    colonSpace: spacing === 'thin' ? NNBSP : NBSP,
    punctSpace: spacing === 'quebec' ? '' : NNBSP,
    enabled,
    spans: findProtectedSpans(text),
    found: []
  };
}

function add(
  ctx: Context,
  category: TypoCategory,
  rule: string,
  start: number,
  end: number,
  replacement: string | null
): void {
  if (!ctx.enabled.has(category)) return;
  if (start < 0 || end > ctx.n || start > end) return;
  const original = ctx.text.slice(start, end);
  if (replacement !== null && replacement === original) return;
  if (isProtected(ctx.spans, start, end)) return;
  ctx.found.push({ category, rule, start, end, original, replacement, order: ctx.found.length });
}

// ----- Regles -----

const OPENERS = '([{' + EM + EN + LAQUO + LDQUO + LSQUO;
const CLOSING_FOLLOWERS = '.,;:!?)]}' + ELLIPSIS + EM + EN + RAQUO + RDQUO + APOS + SQ;

/** Guillemets droits : francais, guillemets ; anglais, guillemets courbes. */
function checkQuotes(ctx: Context): void {
  if (!ctx.enabled.has('quotes')) return;
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    if (t.charAt(i) !== DQ) continue;
    const prev = t.charAt(i - 1);
    const next = t.charAt(i + 1);
    const openSide = prev === '' || isSpace(prev) || inSet(prev, OPENERS);
    const closeSide = next === '' || isSpace(next) || inSet(next, CLOSING_FOLLOWERS);
    let opening: boolean;
    if (openSide && !closeSide) {
      opening = true;
    } else if (!openSide && closeSide) {
      opening = false;
    } else if (openSide && isSpace(prev) && (next === '' || inSet(next, CLOSING_FOLLOWERS))) {
      opening = false;
    } else {
      continue;
    }
    if (opening) {
      const j = spacesAfter(t, i + 1);
      if (j >= ctx.n) continue;
      add(ctx, 'quotes', 'quote-open', i, j, ctx.fr ? LAQUO + ctx.quoteSpace : LDQUO);
    } else {
      const k = spacesBefore(t, i);
      if (k === 0) continue;
      add(ctx, 'quotes', 'quote-close', k, i + 1, ctx.fr ? ctx.quoteSpace + RAQUO : RDQUO);
    }
  }
}

/** Trois points ou points espaces : points de suspension. */
function checkEllipsis(ctx: Context): void {
  if (!ctx.enabled.has('ellipsis')) return;
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    if (t.charAt(i) !== '.' || t.charAt(i - 1) === '.') continue;
    let j = i;
    while (t.charAt(j) === '.') j++;
    if (j - i === 3) {
      add(ctx, 'ellipsis', 'ellipsis', i, j, ELLIPSIS);
    } else if (j - i === 1 && t.slice(i, i + 5) === '. . .' && t.slice(i + 5, i + 7) !== ' .') {
      add(ctx, 'ellipsis', 'ellipsis-spaced', i, i + 5, ELLIPSIS);
      j = i + 5;
    }
    i = j - 1;
  }
}

/** Apostrophe droite apres une lettre ; en anglais, guillemet simple ouvrant. */
function checkApostrophes(ctx: Context): void {
  if (!ctx.enabled.has('apostrophes')) return;
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    if (t.charAt(i) !== SQ) continue;
    const prev = t.charAt(i - 1);
    if (isLetter(prev)) {
      add(ctx, 'apostrophes', 'apostrophe', i, i + 1, APOS);
    } else if (
      !ctx.fr &&
      (prev === '' || isSpace(prev) || inSet(prev, OPENERS)) &&
      isLetter(t.charAt(i + 1))
    ) {
      add(ctx, 'apostrophes', 'single-quote-open', i, i + 1, LSQUO);
    }
  }
}

/** Tirets de dialogue et d'incise (francais), double trait d'union (anglais). */
function checkDashes(ctx: Context): void {
  if (!ctx.enabled.has('dashes')) return;
  const t = ctx.text;
  const n = ctx.n;
  if (ctx.fr) {
    const p = spacesAfter(t, 0);
    const first = t.charAt(p);
    let q = p;
    if (first === '-' && t.charAt(p + 1) === '-') q = p + 2;
    else if (first === '-' || first === EN) q = p + 1;
    if (q > p && t.charAt(q) !== '-') {
      const r = spacesAfter(t, q);
      const after = t.charAt(r);
      if (after !== '' && !isDigit(after)) add(ctx, 'dashes', 'dialogue-dash', p, r, EM + NBSP);
    } else if (first === EM) {
      const after = t.charAt(p + 1);
      if (after !== '' && !isSpace(after) && after !== EM && after !== '-') {
        add(ctx, 'dashes', 'dialogue-space', p + 1, p + 1, NBSP);
      }
    }
    for (let i = p + 1; i < n; i++) {
      if (t.charAt(i) !== '-' || t.charAt(i - 1) === '-') continue;
      let j = i;
      while (t.charAt(j) === '-') j++;
      if (j - i <= 2 && isSpace(t.charAt(i - 1)) && isSpace(t.charAt(j))) {
        const k = spacesBefore(t, i);
        const before = t.charAt(k - 1);
        if (k > 0 && before !== RAQUO && before !== DQ) add(ctx, 'dashes', 'incise-dash', i, j, EN);
      }
      i = j - 1;
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    if (t.charAt(i) !== '-' || t.charAt(i - 1) === '-') continue;
    let j = i;
    while (t.charAt(j) === '-') j++;
    if (j - i === 2) {
      const k = spacesBefore(t, i);
      const r = spacesAfter(t, j);
      if (k > 0 && r < n) add(ctx, 'dashes', 'double-hyphen', k, r, EM);
    }
    i = j - 1;
  }
}

const PUNCT_SKIP_BEFORE = ';:!?([' + LAQUO + LDQUO + EM + EN;

/** Espaces avant ; : ! ? et dans les guillemets francais. */
function checkPunctuation(ctx: Context): void {
  if (!ctx.enabled.has('punctuation')) return;
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    const ch = t.charAt(i);
    if (ctx.fr && ch === LAQUO) {
      const j = spacesAfter(t, i + 1);
      if (j < ctx.n && t.charAt(j) !== RAQUO) {
        add(ctx, 'punctuation', 'space-inside-quotes', i + 1, j, ctx.quoteSpace);
      }
      continue;
    }
    if (ctx.fr && ch === RAQUO) {
      const k = spacesBefore(t, i);
      if (k > 0 && t.charAt(k - 1) !== LAQUO) {
        add(ctx, 'punctuation', 'space-inside-quotes', k, i, ctx.quoteSpace);
      }
      continue;
    }
    if (!inSet(ch, ';:!?')) continue;
    if (isProtected(ctx.spans, i, i + 1)) continue;
    const k = spacesBefore(t, i);
    if (k === 0) continue;
    const before = t.charAt(k - 1);
    if (inSet(before, PUNCT_SKIP_BEFORE)) continue;
    if (ctx.fr) {
      add(ctx, 'punctuation', 'space-before-punct', k, i, ch === ':' ? ctx.colonSpace : ctx.punctSpace);
    } else if (k < i) {
      add(ctx, 'punctuation', 'no-space-before-punct', k, i, '');
    }
  }
}

const NUMBER_BEFORE_BLOCK = '.,-/+#_@:=' + DEGREE + CURRENCIES;
const NUMBER_AFTER_BLOCK = '-/_@';
const GROUP_SEPARATORS = ' ' + NBSP + NNBSP + THIN;

const ORDINAL_FIXES = new Map<string, string>();

function addOrdinalForms(forms: readonly string[], fixed: string): void {
  for (const form of forms) {
    ORDINAL_FIXES.set(form, fixed);
    ORDINAL_FIXES.set(form + 's', fixed + 's');
  }
}

addOrdinalForms(['i' + E_GRAVE + 'me', 'ieme', E_GRAVE + 'me', 'eme', E_ACUTE + 'me', E_GRAVE], 'e');
addOrdinalForms([E_GRAVE + 're', 'ere', 'i' + E_GRAVE + 're', 'iere'], 're');
addOrdinalForms(['ier'], 'er');
addOrdinalForms(['nd'], 'd');
addOrdinalForms(['nde'], 'de');

function groupDigits(digits: string): string {
  let out = '';
  let count = 0;
  for (let k = digits.length - 1; k >= 0; k--) {
    if (count > 0 && count % 3 === 0) out = NNBSP + out;
    out = digits.charAt(k) + out;
    count++;
  }
  return out;
}

function numberEndsCleanly(t: string, end: number): boolean {
  const next = t.charAt(end);
  if (isLetter(next) || isDigit(next) || inSet(next, NUMBER_AFTER_BLOCK)) return false;
  return !(inSet(next, '.,') && isDigit(t.charAt(end + 1)));
}

/** Code postal suivi d'une ville, numero (n<degre>, no, #). */
function looksLikeCode(t: string, i: number, j: number): boolean {
  if (j - i === 5) {
    const after = t.charAt(spacesAfter(t, j));
    if (after.length === 1 && after !== after.toLowerCase()) return true;
  }
  const k = spacesBefore(t, i);
  const before = t.slice(Math.max(0, k - 3), k).toLowerCase();
  const last = before.slice(-1);
  if (last === DEGREE || last === '#') return true;
  return before.slice(-2) === 'no' && !isLetter(t.charAt(k - 3));
}

/** Separateur des milliers (francais). Renvoie la fin du nombre examine. */
function checkThousands(ctx: Context, i: number, j: number): number {
  const t = ctx.text;
  const prev = t.charAt(i - 1);
  if (isLetter(prev) || inSet(prev, NUMBER_BEFORE_BLOCK)) return j;
  if (isSpace(prev) && isDigit(t.charAt(i - 2))) return j;
  if (j - i <= 3) {
    let end = j;
    let grouped = t.slice(i, j);
    while (
      inSet(t.charAt(end), GROUP_SEPARATORS) &&
      isDigit(t.charAt(end + 1)) &&
      isDigit(t.charAt(end + 2)) &&
      isDigit(t.charAt(end + 3)) &&
      !isDigit(t.charAt(end + 4))
    ) {
      grouped += NNBSP + t.slice(end + 1, end + 4);
      end += 4;
    }
    if (end === j || !numberEndsCleanly(t, end)) return j;
    add(ctx, 'numbers', 'thousands', i, end, grouped);
    return end;
  }
  if (j - i >= 5 && t.charAt(i) !== '0' && numberEndsCleanly(t, j) && !looksLikeCode(t, i, j)) {
    add(ctx, 'numbers', 'thousands', i, j, groupDigits(t.slice(i, j)));
  }
  return j;
}

function checkPercent(ctx: Context, end: number): void {
  const k = spacesAfter(ctx.text, end);
  if (ctx.text.charAt(k) !== '%') return;
  add(ctx, 'numbers', 'percent', end, k, ctx.fr ? NNBSP : '');
}

function checkOrdinal(ctx: Context, i: number, j: number): void {
  const t = ctx.text;
  if (isLetter(t.charAt(i - 1))) return;
  let e = j;
  while (isLetter(t.charAt(e))) e++;
  if (e === j || isDigit(t.charAt(e))) return;
  const fixed = ORDINAL_FIXES.get(t.slice(j, e));
  if (fixed !== undefined) add(ctx, 'numbers', 'ordinal', j, e, fixed);
}

const ROMAN = 'IVXLCDM';

/** Mere, Meme, Lere... ne sont jamais pris pour des chiffres romains. */
function romanOrdinalAllowed(roman: string, fixed: string): boolean {
  if (fixed === 're' || fixed === 'res') return roman === 'I';
  if (fixed !== 'e' && fixed !== 'es') return false;
  if (roman.length === 1) return roman === 'V' || roman === 'X';
  return true;
}

function checkRomanOrdinals(ctx: Context): void {
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    if (!isLetter(t.charAt(i)) || isLetter(t.charAt(i - 1))) continue;
    let j = i;
    while (isLetter(t.charAt(j))) j++;
    let r = i;
    while (r < j && inSet(t.charAt(r), ROMAN)) r++;
    if (r > i && r < j && !isDigit(t.charAt(j)) && !isDigit(t.charAt(i - 1))) {
      const fixed = ORDINAL_FIXES.get(t.slice(r, j));
      if (fixed !== undefined && romanOrdinalAllowed(t.slice(i, r), fixed)) {
        add(ctx, 'numbers', 'ordinal', r, j, fixed);
      }
    }
    i = j - 1;
  }
}

/** Milliers, pourcentages et abreviations des ordinaux. */
function checkNumbers(ctx: Context): void {
  if (!ctx.enabled.has('numbers')) return;
  const t = ctx.text;
  for (let i = 0; i < ctx.n; i++) {
    if (!isDigit(t.charAt(i)) || isDigit(t.charAt(i - 1))) continue;
    let j = i;
    while (isDigit(t.charAt(j))) j++;
    const end = ctx.fr ? checkThousands(ctx, i, j) : j;
    checkPercent(ctx, end);
    if (ctx.fr && end === j) checkOrdinal(ctx, i, j);
    i = end - 1;
  }
  if (ctx.fr) checkRomanOrdinals(ctx);
}

function strongestSpace(run: string): string {
  if (run.indexOf(NNBSP) >= 0) return NNBSP;
  if (run.indexOf(NBSP) >= 0) return NBSP;
  return ' ';
}

/** Espaces en trop : debut, fin, doubles, avant une virgule ou un point. */
function checkSpaces(ctx: Context): void {
  if (!ctx.enabled.has('spaces')) return;
  const t = ctx.text;
  const n = ctx.n;
  const a = spacesAfter(t, 0);
  if (a === n) {
    add(ctx, 'spaces', 'blank-paragraph', 0, n, '');
    return;
  }
  if (a > 0) add(ctx, 'spaces', 'leading-spaces', 0, a, '');
  const z = spacesBefore(t, n);
  if (z < n) add(ctx, 'spaces', 'trailing-spaces', z, n, '');
  for (let i = a; i < z; i++) {
    if (!isSpace(t.charAt(i))) continue;
    const j = spacesAfter(t, i);
    const prev = t.charAt(i - 1);
    const next = t.charAt(j);
    if (next === ',') {
      add(ctx, 'spaces', 'space-before-comma', i, j, '');
    } else if (next === '.' && prev !== '.' && t.charAt(j + 1) !== '.' && !isDigit(t.charAt(j + 1))) {
      add(ctx, 'spaces', 'space-before-period', i, j, '');
    } else if (j - i >= 2 && !inSet(next, ';:!?%' + RAQUO) && prev !== LAQUO && prev !== DQ) {
      add(ctx, 'spaces', 'double-space', i, j, strongestSpace(t.slice(i, j)));
    }
    i = j - 1;
  }
}

const UNITS = new Set<string>([
  'h', 'min', 'mn', 's', 'ms', 'km', 'm', 'cm', 'mm', 'kg', 'g', 'mg', 'l', 'cl', 'ml', 't', 'ha'
]);

const NUMBERED_WORDS = new Set<string>([
  'chapitre', 'chapter', 'partie', 'part', 'tome', 'livre', 'book', 'page', 'pages',
  'acte', 'act', 'sc' + E_GRAVE + 'ne', 'scene', 'volume', 'vol', 'num' + E_ACUTE + 'ro',
  'numero', 'number', 'no', 'article', 'verset', 'tableau'
]);

const DIGIT_BEFORE_BLOCK = '.,:/-+#_@=' + DEGREE + CURRENCIES;
const DIGIT_AFTER_BLOCK = ':/-_@%)=' + DEGREE + CURRENCIES;

function smallNumberInText(t: string, i: number, j: number): boolean {
  const prev = t.charAt(i - 1);
  const next = t.charAt(j);
  if (isLetter(prev) || inSet(prev, DIGIT_BEFORE_BLOCK)) return false;
  if (isLetter(next) || inSet(next, DIGIT_AFTER_BLOCK)) return false;
  if (inSet(next, '.,') && isDigit(t.charAt(j + 1))) return false;
  const k = spacesAfter(t, j);
  const after = t.charAt(k);
  if (isDigit(after) || inSet(after, '%' + DEGREE + CURRENCIES)) return false;
  const b = spacesBefore(t, i);
  if (isDigit(t.charAt(b - 1))) return false;
  if (k > j && isLetter(after)) {
    let e = k;
    while (isLetter(t.charAt(e))) e++;
    if (UNITS.has(t.slice(k, e).toLowerCase())) return false;
  }
  let w = b;
  while (w > 0 && isLetter(t.charAt(w - 1))) w--;
  return !NUMBERED_WORDS.has(t.slice(w, b).toLowerCase());
}

/** Petits nombres en chiffres dans le recit : seulement signales. */
function checkDigits(ctx: Context): void {
  if (!ctx.enabled.has('digits')) return;
  const t = ctx.text;
  const trimmed = t.trim();
  for (let i = 0; i < ctx.n; i++) {
    if (!isDigit(t.charAt(i)) || isDigit(t.charAt(i - 1))) continue;
    let j = i;
    while (isDigit(t.charAt(j))) j++;
    if (j - i <= 2 && trimmed !== t.slice(i, j) && smallNumberInText(t, i, j)) {
      add(ctx, 'digits', 'digits', i, j, null);
    }
    i = j - 1;
  }
}

/** Replique qui ne suit pas le style choisi : seulement signalee. */
function checkDialogue(ctx: Context): void {
  if (!ctx.enabled.has('dialogue') || !ctx.fr || ctx.dialogueStyle === 'any') return;
  const t = ctx.text;
  const p = spacesAfter(t, 0);
  const first = t.charAt(p);
  if (ctx.dialogueStyle === 'dash' && (first === LAQUO || first === DQ || first === LDQUO)) {
    add(ctx, 'dialogue', 'dialogue-style', p, p + 1, null);
  }
  if (
    ctx.dialogueStyle === 'quotes' &&
    (first === EM || first === EN || (first === '-' && !isDigit(t.charAt(p + 1))))
  ) {
    add(ctx, 'dialogue', 'dialogue-style', p, p + 1, null);
  }
}

// ----- Resultat -----

function compareRanges(x: TypoIssue, y: TypoIssue): number {
  if (x.start !== y.start) return x.start - y.start;
  return (x.start === x.end ? 0 : 1) - (y.start === y.end ? 0 : 1);
}

/** Tri par position ; en cas de chevauchement, la regle examinee en premier l'emporte. */
function resolve(found: Candidate[]): TypoIssue[] {
  const sorted = found.slice().sort((x, y) => compareRanges(x, y) || x.order - y.order);
  const issues: TypoIssue[] = [];
  let lastEnd = 0;
  let lastInsert = -1;
  for (const c of sorted) {
    if (c.start < lastEnd) continue;
    if (c.start === c.end) {
      if (c.start === lastInsert) continue;
      lastInsert = c.start;
    }
    issues.push({
      category: c.category,
      rule: c.rule,
      start: c.start,
      end: c.end,
      original: c.original,
      replacement: c.replacement
    });
    lastEnd = c.end;
  }
  return issues;
}

/** Cas typographiques d'un paragraphe, tries par position, sans chevauchement. */
export function findTypoIssues(text: string, options: TypoOptions): TypoIssue[] {
  if (typeof text !== 'string' || text === '') return [];
  const ctx = createContext(text, options);
  checkQuotes(ctx);
  checkEllipsis(ctx);
  checkApostrophes(ctx);
  checkDashes(ctx);
  checkPunctuation(ctx);
  checkNumbers(ctx);
  checkSpaces(ctx);
  checkDigits(ctx);
  checkDialogue(ctx);
  return resolve(ctx.found);
}

/**
 * Applique des corrections. Les cas seulement signales, ceux qui se
 * chevauchent et ceux qui ne correspondent plus au texte sont ignores.
 */
export function applyTypoIssues(text: string, issues: readonly TypoIssue[]): string {
  const source = typeof text === 'string' ? text : '';
  const usable: TypoIssue[] = [];
  for (const issue of issues || []) {
    if (!issue || typeof issue.replacement !== 'string') continue;
    if (issue.start < 0 || issue.end > source.length || issue.start > issue.end) continue;
    if (source.slice(issue.start, issue.end) !== issue.original) continue;
    usable.push(issue);
  }
  usable.sort(compareRanges);
  let out = '';
  let pos = 0;
  for (const issue of usable) {
    if (issue.start < pos) continue;
    out += source.slice(pos, issue.start) + (issue.replacement ?? '');
    pos = issue.end;
  }
  return out + source.slice(pos);
}

/** Corrige tout ce qui peut l'etre (quelques passes, jusqu'a stabilite). */
export function fixTypography(text: string, options: TypoOptions): { text: string; count: number } {
  let current = typeof text === 'string' ? text : '';
  let count = 0;
  for (let pass = 0; pass < 5; pass++) {
    const fixes = findTypoIssues(current, options).filter((issue) => issue.replacement !== null);
    if (fixes.length === 0) break;
    current = applyTypoIssues(current, fixes);
    count += fixes.length;
  }
  return { text: current, count };
}
