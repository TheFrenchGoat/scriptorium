// src/shared/typography-project.ts
// Typographie : reglages d'un projet, cas ignores et correction d'un
// paragraphe decoupe en morceaux.
//
// Module pur, sans DOM ni Electron. Dans l'editeur, un paragraphe est fait
// de plusieurs noeuds de texte (un par mise en forme : gras, italique...).
// On analyse le texte complet du paragraphe, puis chaque correction est
// rendue au morceau ou elle commence ; les caracteres supprimes sont
// retires des morceaux qui les contiennent. La mise en forme est conservee.

import {
  findTypoIssues,
  type TypoCategory,
  type TypoDialogueStyle,
  type TypoIssue,
  type TypoLanguage,
  type TypoOptions,
  type TypoSpacing
} from './typography';

/** Cas ignore par l'auteur : reconnu par son chapitre, sa regle et son entourage. */
export interface TypoIgnoredCase {
  chapter: string;
  rule: string;
  original: string;
  /** Quelques caracteres avant le cas. */
  before: string;
  /** Quelques caracteres apres le cas. */
  after: string;
}

/** Reglages typographiques d'un projet. */
export interface TypoProjectSettings {
  /** Langue du texte. Absent : langue de l'interface. */
  language?: TypoLanguage;
  spacing: TypoSpacing;
  dialogueStyle: TypoDialogueStyle;
  ignored: TypoIgnoredCase[];
}

/** Garde un cas (true) ou l'ecarte parce qu'il est ignore (false). */
export type TypoKeep = (text: string, issue: TypoIssue) => boolean;

export const TYPO_IGNORED_LIMIT = 5000;
export const TYPO_CONTEXT_LENGTH = 12;

const LIMITS = { chapter: 500, rule: 60, original: 200, context: 40 };
const SEP = String.fromCharCode(1);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shortString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

function ignoredKey(item: TypoIgnoredCase): string {
  return [item.chapter, item.rule, item.original, item.before, item.after].join(SEP);
}

export function defaultTypoSettings(): TypoProjectSettings {
  return { spacing: 'standard', dialogueStyle: 'any', ignored: [] };
}

/** Reglages propres et complets, quelle que soit la valeur recue. */
export function normalizeTypoSettings(value: unknown): TypoProjectSettings {
  const result = defaultTypoSettings();
  if (!isObject(value)) return result;
  const language = value['language'];
  if (language === 'fr' || language === 'en') result.language = language;
  const spacing = value['spacing'];
  if (spacing === 'thin' || spacing === 'quebec') result.spacing = spacing;
  const style = value['dialogueStyle'];
  if (style === 'quotes' || style === 'dash') result.dialogueStyle = style;
  const list: unknown[] = Array.isArray(value['ignored']) ? value['ignored'] : [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const chapter = shortString(raw['chapter'], LIMITS.chapter);
    const rule = shortString(raw['rule'], LIMITS.rule);
    const original = shortString(raw['original'], LIMITS.original);
    const before = shortString(raw['before'], LIMITS.context);
    const after = shortString(raw['after'], LIMITS.context);
    if (chapter === null || rule === null || rule === '' || original === null) continue;
    if (before === null || after === null) continue;
    const item: TypoIgnoredCase = { chapter, rule, original, before, after };
    const key = ignoredKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.ignored.push(item);
    if (result.ignored.length >= TYPO_IGNORED_LIMIT) break;
  }
  return result;
}

/** Options du module de regles pour ce projet. */
export function typoOptionsFor(
  settings: unknown,
  fallbackLanguage: TypoLanguage,
  categories?: readonly TypoCategory[]
): TypoOptions {
  const normalized = normalizeTypoSettings(settings);
  const options: TypoOptions = {
    language: normalized.language ?? (fallbackLanguage === 'en' ? 'en' : 'fr'),
    spacing: normalized.spacing,
    dialogueStyle: normalized.dialogueStyle
  };
  if (categories) options.categories = categories;
  return options;
}

/** Description d'un cas a ignorer (text : texte complet du paragraphe). */
export function typoIgnoredCase(chapter: string, text: string, issue: TypoIssue): TypoIgnoredCase {
  return {
    chapter,
    rule: issue.rule,
    original: issue.original.slice(0, LIMITS.original),
    before: text.slice(Math.max(0, issue.start - TYPO_CONTEXT_LENGTH), issue.start),
    after: text.slice(issue.end, issue.end + TYPO_CONTEXT_LENGTH)
  };
}

/** Ajoute un cas ignore (sans doublon ; les plus anciens partent au-dela de la limite). */
export function addTypoIgnored(settings: unknown, item: TypoIgnoredCase): TypoProjectSettings {
  const base = normalizeTypoSettings(settings);
  const first = normalizeTypoSettings({ ignored: [item] }).ignored[0];
  if (!first) return base;
  const key = ignoredKey(first);
  if (base.ignored.some((x) => ignoredKey(x) === key)) return base;
  const ignored = base.ignored.concat([first]);
  while (ignored.length > TYPO_IGNORED_LIMIT) ignored.shift();
  return { ...base, ignored };
}

/** Suit le renommage d'un chapitre. */
export function renameTypoIgnoredChapter(settings: unknown, from: string, to: string): TypoProjectSettings {
  const base = normalizeTypoSettings(settings);
  const ignored = base.ignored.map((item) => (item.chapter === from ? { ...item, chapter: to } : item));
  return normalizeTypoSettings({ ...base, ignored });
}

/** Restaure tous les cas ignores. */
export function clearTypoIgnored(settings: unknown): TypoProjectSettings {
  return { ...normalizeTypoSettings(settings), ignored: [] };
}

/** Filtre des cas ignores d'un chapitre. */
export function createTypoKeep(settings: unknown, chapter: string): TypoKeep {
  const keys = new Set<string>();
  for (const item of normalizeTypoSettings(settings).ignored) {
    if (item.chapter === chapter) keys.add(ignoredKey(item));
  }
  return (text, issue) => keys.size === 0 || !keys.has(ignoredKey(typoIgnoredCase(chapter, text, issue)));
}

function rangeOrder(x: TypoIssue, y: TypoIssue): number {
  if (x.start !== y.start) return x.start - y.start;
  return (x.start === x.end ? 0 : 1) - (y.start === y.end ? 0 : 1);
}

/**
 * Applique des corrections a un paragraphe decoupe en morceaux. Les
 * positions des corrections portent sur le texte complet (morceaux mis
 * bout a bout). Renvoie autant de morceaux qu'en entree.
 */
export function applyTypoIssuesToSegments(segments: readonly string[], issues: readonly TypoIssue[]): string[] {
  const parts: string[] = Array.isArray(segments)
    ? segments.map((part) => (typeof part === 'string' ? part : ''))
    : [];
  const starts: number[] = [];
  let total = 0;
  for (const part of parts) {
    starts.push(total);
    total += part.length;
  }
  const joined = parts.join('');
  const usable: TypoIssue[] = [];
  for (const issue of issues || []) {
    if (!issue || typeof issue.replacement !== 'string') continue;
    if (issue.start < 0 || issue.end > total || issue.start > issue.end) continue;
    if (joined.slice(issue.start, issue.end) !== issue.original) continue;
    usable.push(issue);
  }
  usable.sort(rangeOrder);
  const out: string[] = parts.map(() => '');
  const copy = (from: number, to: number): void => {
    for (let k = 0; k < parts.length; k++) {
      const begin = starts[k] ?? 0;
      const a = Math.max(from, begin);
      const b = Math.min(to, begin + (parts[k] ?? '').length);
      if (a < b) out[k] = (out[k] ?? '') + joined.slice(a, b);
    }
  };
  const hostOf = (position: number): number => {
    let last = -1;
    for (let k = 0; k < parts.length; k++) {
      const length = (parts[k] ?? '').length;
      if (length === 0) continue;
      if (position < (starts[k] ?? 0) + length) return k;
      last = k;
    }
    return last;
  };
  let cursor = 0;
  for (const issue of usable) {
    if (issue.start < cursor) continue;
    copy(cursor, issue.start);
    const host = hostOf(issue.start);
    if (host >= 0) out[host] = (out[host] ?? '') + (issue.replacement ?? '');
    cursor = issue.end;
  }
  copy(cursor, total);
  return out;
}

/** Corrige un paragraphe decoupe en morceaux (quelques passes, jusqu'a stabilite). */
export function fixTypoSegments(
  segments: readonly string[],
  options: TypoOptions,
  keep?: TypoKeep
): { segments: string[]; count: number } {
  let current: string[] = Array.isArray(segments)
    ? segments.map((part) => (typeof part === 'string' ? part : ''))
    : [];
  let count = 0;
  for (let pass = 0; pass < 5; pass++) {
    const text = current.join('');
    const fixes = findTypoIssues(text, options).filter(
      (issue) => issue.replacement !== null && (!keep || keep(text, issue))
    );
    if (fixes.length === 0) break;
    current = applyTypoIssuesToSegments(current, fixes);
    count += fixes.length;
  }
  return { segments: current, count };
}
