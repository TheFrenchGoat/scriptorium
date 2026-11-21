// src/shared/scene-separators.ts
// Separateurs de scene (etape 2e) : reperage des paragraphes faits uniquement
// de symboles (***, * * *, #, ~ ~ ~...) et modeles proposes.
//
// Module pur, sans DOM ni Electron : utilise par l'onglet Typographie et par
// l'export, qui reconnaissent ainsi exactement les memes separateurs.

export type SceneSeparatorStyle = 'asterism' | 'stars' | 'spaced-stars' | 'hash';

/** Modeles proposes, dans l'ordre d'affichage. */
export const SCENE_SEPARATOR_STYLES: readonly SceneSeparatorStyle[] = ['spaced-stars', 'stars', 'asterism', 'hash'];

/** Texte de chaque modele (memes symboles que l'export). */
export const SCENE_SEPARATOR_SYMBOLS: Readonly<Record<SceneSeparatorStyle, string>> = {
  asterism: String.fromCharCode(0x2042),
  stars: '***',
  'spaced-stars': '* * *',
  hash: '#'
};

/** Longueur maximale d'un separateur (espaces reduites). */
export const SCENE_SEPARATOR_MAX_LENGTH = 30;

/** Nombre maximal de separateurs gardes dans un rapport (le total reste exact). */
export const SCENE_SEPARATOR_REPORT_LIMIT = 5000;

// * # ~ = _ - , tiret demi-cadratin, tiret cadratin, puce, point median, asterisme, deux asterisques
const SYMBOLS = new Set<number>([0x2a, 0x23, 0x7e, 0x3d, 0x5f, 0x2d, 0x2013, 0x2014, 0x2022, 0xb7, 0x2042, 0x2051]);
// Symboles acceptes seuls. Un tiret seul peut ouvrir un dialogue : il est exclu.
const ALONE = new Set<number>([0x2a, 0x23, 0x7e, 0x2022, 0x2042, 0x2051]);

function isSpace(code: number): boolean {
  if (code === 0x20 || code === 0xa0 || code === 0x202f || code === 0x3000 || code === 0xfeff) return true;
  if (code >= 0x09 && code <= 0x0d) return true;
  if (code >= 0x2000 && code <= 0x200b) return true;
  return code === 0x2060;
}

export interface SceneSeparatorFound {
  /** Rang du separateur dans le chapitre (0 pour le premier). */
  paragraph: number;
  text: string;
}

export interface SceneSeparatorVariant {
  /** Forme du separateur, espaces reduites a une seule. */
  text: string;
  count: number;
}

export interface SceneSeparatorItem {
  chapter: string;
  paragraph: number;
  text: string;
}

export interface SceneSeparatorReport {
  /** Vrai : tout le livre ; faux : chapitre ouvert. */
  whole: boolean;
  items: SceneSeparatorItem[];
  /** Formes trouvees, de la plus frequente a la moins frequente. */
  variants: SceneSeparatorVariant[];
  total: number;
  chapters: number;
  truncated: boolean;
  noChapter: boolean;
  unavailable: boolean;
}

export interface SceneSeparatorResult {
  count: number;
  chapters: number;
  noChapter: boolean;
  unavailable: boolean;
}

/** Texte du separateur, espaces reduites a une seule et retirees aux bords. */
export function sceneSeparatorKey(text: string): string {
  if (typeof text !== 'string') return '';
  let out = '';
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isSpace(code)) {
      pendingSpace = out !== '';
      continue;
    }
    if (pendingSpace) out += ' ';
    pendingSpace = false;
    out += text.charAt(i);
  }
  return out;
}

/** Vrai si le texte d'un paragraphe est un separateur de scene. */
export function isSceneSeparatorText(text: string): boolean {
  const key = sceneSeparatorKey(text);
  if (key === '' || key.length > SCENE_SEPARATOR_MAX_LENGTH) return false;
  let symbols = 0;
  let first = -1;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code === 0x20) continue;
    if (!SYMBOLS.has(code)) return false;
    symbols += 1;
    if (first < 0) first = code;
  }
  if (symbols === 0) return false;
  if (symbols === 1) return ALONE.has(first);
  return true;
}

export function emptySceneSeparatorReport(whole: boolean): SceneSeparatorReport {
  return {
    whole,
    items: [],
    variants: [],
    total: 0,
    chapters: 0,
    truncated: false,
    noChapter: false,
    unavailable: false
  };
}

/** Ajoute au rapport les separateurs trouves dans un chapitre. */
export function addSceneSeparators(
  report: SceneSeparatorReport,
  chapter: string,
  found: readonly SceneSeparatorFound[]
): void {
  if (found.length === 0) return;
  report.chapters += 1;
  for (const item of found) {
    const key = sceneSeparatorKey(item.text);
    report.total += 1;
    const variant = report.variants.find((entry) => entry.text === key);
    if (variant) variant.count += 1;
    else report.variants.push({ text: key, count: 1 });
    if (report.items.length < SCENE_SEPARATOR_REPORT_LIMIT) {
      report.items.push({ chapter, paragraph: item.paragraph, text: key });
    } else {
      report.truncated = true;
    }
  }
  report.variants.sort((a, b) => b.count - a.count);
}

/** Modele propose : celui de la forme la plus frequente qui en est un, sinon * * *. */
export function suggestedSceneSeparator(variants: readonly SceneSeparatorVariant[]): SceneSeparatorStyle {
  for (const variant of variants) {
    for (const style of SCENE_SEPARATOR_STYLES) {
      if (SCENE_SEPARATOR_SYMBOLS[style] === variant.text) return style;
    }
  }
  return 'spaced-stars';
}

/** Nombre de separateurs a remplacer pour obtenir le modele. */
export function sceneSeparatorsToChange(variants: readonly SceneSeparatorVariant[], style: SceneSeparatorStyle): number {
  const target = SCENE_SEPARATOR_SYMBOLS[style];
  let count = 0;
  for (const variant of variants) {
    if (variant.text !== target) count += variant.count;
  }
  return count;
}
