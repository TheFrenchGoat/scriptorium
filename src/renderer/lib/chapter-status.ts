import type { ChapterMeta, ChapterMetaPatch, ChapterStatus } from '../../shared/types';

/** Ordre d’affichage des états d’un chapitre. */
export const CHAPTER_STATUSES: readonly ChapterStatus[] = ['todo', 'draft', 'revision', 'done'];

/** État retenu quand aucun n’est défini. */
export const DEFAULT_CHAPTER_STATUS: ChapterStatus = 'todo';

/** Couleur par défaut de chaque état ; une couleur libre peut la remplacer. */
export const CHAPTER_STATUS_COLORS: Readonly<Record<ChapterStatus, string>> = {
  todo: '#9ca3af',
  draft: '#f97316',
  revision: '#3b82f6',
  done: '#22c55e',
};

/** Objectif de mots maximal accepté. */
export const CHAPTER_TARGET_MAX = 10000000;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isChapterStatus(value: unknown): value is ChapterStatus {
  return typeof value === 'string' && (CHAPTER_STATUSES as readonly string[]).includes(value);
}

/** Couleur au format #rrggbb en minuscules, ou null si la valeur n’est pas valable. */
export function normalizeChapterColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null;
}

/** État du chapitre (à écrire par défaut). */
export function chapterStatusOf(meta: ChapterMeta | undefined): ChapterStatus {
  const status = meta?.status;
  return isChapterStatus(status) ? status : DEFAULT_CHAPTER_STATUS;
}

/** Couleur affichée : la couleur libre si elle existe, sinon celle de l’état. */
export function chapterColorOf(meta: ChapterMeta | undefined): string {
  return normalizeChapterColor(meta?.color) ?? CHAPTER_STATUS_COLORS[chapterStatusOf(meta)];
}

/** Progression vers l’objectif, de 0 à 1 ; null s’il n’y a pas d’objectif. */
export function chapterProgress(words: number, meta: ChapterMeta | undefined): number | null {
  const target = meta?.targetWords;
  if (typeof target !== 'number' || !(target > 0)) return null;
  const ratio = words / target;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return ratio >= 1 ? 1 : ratio;
}

/**
 * Applique une modification aux réglages d’un chapitre.
 * null efface une valeur ; une valeur non valable est ignorée.
 * Renvoie null quand il ne reste aucun réglage.
 */
export function applyChapterMetaPatch(current: ChapterMeta | undefined, patch: ChapterMetaPatch): ChapterMeta | null {
  const next: ChapterMeta = { ...(current ?? {}) };
  const status = patch.status;
  if (status === null) delete next.status;
  else if (isChapterStatus(status)) next.status = status;
  const color = patch.color;
  if (color === null) delete next.color;
  else if (color !== undefined) {
    const normalized = normalizeChapterColor(color);
    if (normalized) next.color = normalized;
  }
  const target = patch.targetWords;
  if (target === null) delete next.targetWords;
  else if (typeof target === 'number' && Number.isFinite(target)) {
    const rounded = Math.floor(target);
    if (rounded >= 1) next.targetWords = Math.min(rounded, CHAPTER_TARGET_MAX);
    else delete next.targetWords;
  }
  return Object.keys(next).length > 0 ? next : null;
}
