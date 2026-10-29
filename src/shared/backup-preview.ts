// src/shared/backup-preview.ts
//
// Aperçu d'une sauvegarde : comparaison des chapitres avec le projet
// actuel, texte lisible d'un chapitre, et copie d'un chapitre récupéré.
// Aucune dépendance (ni Electron ni DOM) : testable avec Node.

/** État d'un chapitre de la sauvegarde par rapport au projet actuel. */
export type BackupChapterState = 'identical' | 'modified' | 'removed';

export interface BackupChapterRow {
  /** Titre du chapitre dans la sauvegarde. */
  name: string;
  /** Mots dans la sauvegarde. */
  words: number;
  /** Mots aujourd'hui (null : chapitre supprimé depuis). */
  currentWords: number | null;
  state: BackupChapterState;
  /** Mots d'aujourd'hui moins mots de la sauvegarde (0 si supprimé). */
  diff: number;
}

export interface BackupChapterComparison {
  /** Chapitres de la sauvegarde, dans leur ordre. */
  rows: BackupChapterRow[];
  /** Chapitres ajoutés depuis la sauvegarde. */
  added: { name: string; words: number }[];
  backupTotal: number;
  currentTotal: number;
}

const FORBIDDEN_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

function ownString(map: Record<string, string>, name: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(map, name)) return undefined;
  const value: unknown = map[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Compare les chapitres d'une sauvegarde avec ceux d'aujourd'hui.
 * Les chapitres sont reliés par leur titre (ils n'ont pas d'identifiant).
 */
export function compareChapters(
  backupChapters: Record<string, string>,
  currentChapters: Record<string, string>,
  countWords: (html: string) => number
): BackupChapterComparison {
  const rows: BackupChapterRow[] = [];
  const currentCounts = new Map<string, number>();
  let backupTotal = 0;

  for (const name of Object.keys(backupChapters)) {
    const html = ownString(backupChapters, name) ?? '';
    const words = countWords(html);
    backupTotal += words;

    const current = ownString(currentChapters, name);
    if (current === undefined) {
      rows.push({ name, words, currentWords: null, state: 'removed', diff: 0 });
      continue;
    }

    const identical = current === html;
    const currentWords = identical ? words : countWords(current);
    currentCounts.set(name, currentWords);
    rows.push({
      name,
      words,
      currentWords,
      state: identical ? 'identical' : 'modified',
      diff: currentWords - words
    });
  }

  const added: { name: string; words: number }[] = [];
  let currentTotal = 0;

  for (const name of Object.keys(currentChapters)) {
    const known = currentCounts.get(name);
    if (known !== undefined) {
      currentTotal += known;
      continue;
    }
    const words = countWords(ownString(currentChapters, name) ?? '');
    currentTotal += words;
    added.push({ name, words });
  }

  return { rows, added, backupTotal, currentTotal };
}

/**
 * Nom libre pour la copie d'un chapitre : « Titre (suffixe) », puis
 * « Titre (suffixe) (2) », « (3) »... si ce nom est déjà pris.
 */
export function uniqueChapterCopyName(
  sourceName: string,
  suffix: string,
  existingNames: readonly string[]
): string {
  const source = sourceName.replace(/\s+/g, ' ').trim();
  const cleanSuffix = suffix.replace(/\s+/g, ' ').trim();
  const base = cleanSuffix ? (source ? source + ' ' : '') + '(' + cleanSuffix + ')' : source;
  const taken = new Set(existingNames);

  if (base && !taken.has(base) && !FORBIDDEN_NAMES.has(base)) {
    return base;
  }

  for (let n = 2; ; n += 1) {
    const candidate = (base ? base + ' ' : '') + '(' + n + ')';
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Nouvelle liste de chapitres avec la copie placée juste après
 * `afterName` (ou à la fin s'il n'existe pas). La liste d'origine n'est
 * pas modifiée. Renvoie null si le nom est vide, interdit ou déjà pris.
 */
export function insertChapterAfter(
  chapters: Record<string, string>,
  afterName: string | null,
  newName: string,
  html: string
): Record<string, string> | null {
  if (!newName.trim() || FORBIDDEN_NAMES.has(newName) || Object.prototype.hasOwnProperty.call(chapters, newName)) {
    return null;
  }

  const next: Record<string, string> = {};
  let inserted = false;

  for (const key of Object.keys(chapters)) {
    next[key] = chapters[key];
    if (!inserted && afterName !== null && key === afterName) {
      next[newName] = html;
      inserted = true;
    }
  }

  if (!inserted) next[newName] = html;
  return next;
}

/**
 * Retire les ancres de commentaires d'un HTML de chapitre : la copie n'a pas
 * de commentaires, ses passages ne doivent donc pas rester marqués.
 */
export function stripCommentAnchors(html: string): string {
  if (typeof html !== 'string') return '';
  return html.replace(/\s+data-comment-id\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

function safeChar(code: number, original: string): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
}

/** Texte lisible d'un chapitre : un paragraphe par ligne, sans mise en forme. */
export function htmlToReadableText(html: string): string {
  if (typeof html !== 'string' || !html) return '';

  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match: string, code: string) => safeChar(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match: string, hex: string) => safeChar(parseInt(hex, 16), match))
    .replace(/&amp;/gi, '&');

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
