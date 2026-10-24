// src/shared/export-settings.ts
// Réglages de la fenêtre d’export : modèles, valeurs par défaut et
// réparation des valeurs lues dans un fichier projet.
//
// Ce fichier est utilisé par le processus principal (désinfection à
// l’ouverture et à l’enregistrement) et par le renderer (fenêtre
// d’export). Il ne doit dépendre ni de Node ni du DOM.

import type {
  ExportBibleMode,
  ExportFormat,
  ExportLayoutSettings,
  ExportPageSize,
  ExportSceneSeparator,
  ExportSettings,
  ExportTemplateId
} from './types';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['pdf', 'docx', 'odt', 'txt', 'md'];

export const EXPORT_TEMPLATE_IDS: readonly ExportTemplateId[] = ['manuscript', 'novel'];

export const EXPORT_PAGE_SIZES: readonly ExportPageSize[] = ['a4', 'a5', 'letter'];

export const EXPORT_BIBLE_MODES: readonly ExportBibleMode[] = ['none', 'appendix', 'only'];

export const EXPORT_SCENE_SEPARATORS: readonly ExportSceneSeparator[] = [
  'asterism',
  'stars',
  'spaced-stars',
  'hash',
  'blank'
];

/** Texte affiché pour chaque séparateur de scène. */
export const EXPORT_SEPARATOR_SYMBOLS: Readonly<Record<ExportSceneSeparator, string>> = {
  asterism: '\u2042',
  stars: '***',
  'spaced-stars': '* * *',
  hash: '#',
  blank: ''
};

/** Dimensions des pages, en millimètres. */
export const EXPORT_PAGE_SIZES_MM: Readonly<
  Record<ExportPageSize, { width: number; height: number }>
> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  letter: { width: 215.9, height: 279.4 }
};

/** Polices proposées dans la fenêtre d’export. */
export const EXPORT_FONT_FAMILIES: readonly string[] = [
  'Times New Roman',
  'Georgia',
  'Garamond',
  'Book Antiqua',
  'Palatino Linotype',
  'Cambria',
  'Calibri',
  'Arial',
  'Courier New'
];

export const EXPORT_LIMITS = {
  fontSize: { min: 8, max: 24 },
  lineHeight: { min: 1, max: 3 },
  marginCm: { min: 1, max: 5 },
  indentCm: { min: 0, max: 3 },
  textLength: 300,
  fontFamilyLength: 60,
  maxListItems: 5000,
  listItemLength: 500
} as const;

/** Valeurs imposées par un modèle (le reste dépend de l’auteur). */
export interface ExportTemplatePreset {
  layout: ExportLayoutSettings;
  runningHeader: boolean;
  chapterOnNewPage: boolean;
  sceneSeparator: ExportSceneSeparator;
}

export const EXPORT_TEMPLATES: Readonly<Record<ExportTemplateId, ExportTemplatePreset>> = {
  /** Manuscrit à envoyer à un éditeur ou à un correcteur. */
  manuscript: {
    layout: {
      pageSize: 'a4',
      fontFamily: 'Times New Roman',
      fontSize: 12,
      lineHeight: 1.5,
      marginCm: 2.5,
      justify: false,
      firstLineIndentCm: 1.25,
      pageNumbers: true
    },
    runningHeader: true,
    chapterOnNewPage: true,
    sceneSeparator: 'hash'
  },

  /** Mise en page proche d’un livre imprimé. */
  novel: {
    layout: {
      pageSize: 'a4',
      fontFamily: 'Georgia',
      fontSize: 11,
      lineHeight: 1.3,
      marginCm: 2,
      justify: true,
      firstLineIndentCm: 0.8,
      pageNumbers: true
    },
    runningHeader: false,
    chapterOnNewPage: true,
    sceneSeparator: 'asterism'
  }
};

export function createDefaultExportSettings(
  template: ExportTemplateId = 'manuscript'
): ExportSettings {
  const preset = EXPORT_TEMPLATES[template];

  return {
    format: 'pdf',
    template,
    titlePage: {
      enabled: true,
      title: '',
      subtitle: '',
      showAuthor: true,
      author: ''
    },
    runningHeader: preset.runningHeader,
    content: {
      excludedChapters: [],
      tableOfContents: false,
      chapterOnNewPage: preset.chapterOnNewPage,
      sceneSeparators: true,
      sceneSeparator: preset.sceneSeparator,
      keepEditorFormatting: false
    },
    bible: {
      mode: 'none',
      excludedCategories: [],
      portraits: true,
      relations: true,
      timeline: true
    },
    layout: { ...preset.layout }
  };
}

/**
 * Applique un modèle : la mise en page, l’en-tête, les sauts de page et le
 * séparateur de scène sont remplacés ; le reste (format, page de titre,
 * chapitres cochés, bible…) est conservé.
 */
export function applyExportTemplate(
  settings: ExportSettings,
  template: ExportTemplateId
): ExportSettings {
  const preset = EXPORT_TEMPLATES[template];

  return {
    ...settings,
    template,
    runningHeader: preset.runningHeader,
    content: {
      ...settings.content,
      chapterOnNewPage: preset.chapterOnNewPage,
      sceneSeparator: preset.sceneSeparator
    },
    layout: { ...preset.layout }
  };
}

// ----------------------------------------------------------------------------
// Réparation des valeurs lues dans un fichier
// ----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.min(max, Math.max(min, rounded));
}

/** Texte d’une ligne : caractères de contrôle et espaces multiples retirés. */
function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Nom de police : lettres, chiffres, espaces et tirets uniquement, car il
 * sera inséré dans du CSS et dans des fichiers Word/ODT.
 */
function cleanFontFamily(value: unknown, fallback: string): string {
  const text = cleanText(value, EXPORT_LIMITS.fontFamilyLength);
  return /^[A-Za-z0-9 \-]+$/.test(text) ? text : fallback;
}

/** Liste de noms (chapitres, catégories) conservés tels quels, sans doublon. */
function cleanNameList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    if (entry.length === 0 || entry.length > EXPORT_LIMITS.listItemLength) continue;

    names.add(entry);

    if (names.size >= EXPORT_LIMITS.maxListItems) break;
  }

  return Array.from(names);
}

/**
 * Renvoie toujours des réglages complets et valides : toute valeur absente
 * ou incorrecte est remplacée par celle du modèle choisi.
 */
export function normalizeExportSettings(value: unknown): ExportSettings {
  const source = isRecord(value) ? value : {};
  const template = pickOne(source.template, EXPORT_TEMPLATE_IDS, 'manuscript');
  const defaults = createDefaultExportSettings(template);

  const titlePage = isRecord(source.titlePage) ? source.titlePage : {};
  const content = isRecord(source.content) ? source.content : {};
  const bible = isRecord(source.bible) ? source.bible : {};
  const layout = isRecord(source.layout) ? source.layout : {};

  const L = EXPORT_LIMITS;
  const d = defaults.layout;

  return {
    format: pickOne(source.format, EXPORT_FORMATS, defaults.format),
    template,
    titlePage: {
      enabled: pickBoolean(titlePage.enabled, defaults.titlePage.enabled),
      title: cleanText(titlePage.title, L.textLength),
      subtitle: cleanText(titlePage.subtitle, L.textLength),
      showAuthor: pickBoolean(titlePage.showAuthor, defaults.titlePage.showAuthor),
      author: cleanText(titlePage.author, L.textLength)
    },
    runningHeader: pickBoolean(source.runningHeader, defaults.runningHeader),
    content: {
      excludedChapters: cleanNameList(content.excludedChapters),
      tableOfContents: pickBoolean(content.tableOfContents, defaults.content.tableOfContents),
      chapterOnNewPage: pickBoolean(content.chapterOnNewPage, defaults.content.chapterOnNewPage),
      sceneSeparators: pickBoolean(content.sceneSeparators, defaults.content.sceneSeparators),
      sceneSeparator: pickOne(
        content.sceneSeparator,
        EXPORT_SCENE_SEPARATORS,
        defaults.content.sceneSeparator
      ),
      keepEditorFormatting: pickBoolean(
        content.keepEditorFormatting,
        defaults.content.keepEditorFormatting
      )
    },
    bible: {
      mode: pickOne(bible.mode, EXPORT_BIBLE_MODES, defaults.bible.mode),
      excludedCategories: cleanNameList(bible.excludedCategories),
      portraits: pickBoolean(bible.portraits, defaults.bible.portraits),
      relations: pickBoolean(bible.relations, defaults.bible.relations),
      timeline: pickBoolean(bible.timeline, defaults.bible.timeline)
    },
    layout: {
      pageSize: pickOne(layout.pageSize, EXPORT_PAGE_SIZES, d.pageSize),
      fontFamily: cleanFontFamily(layout.fontFamily, d.fontFamily),
      fontSize: pickNumber(layout.fontSize, L.fontSize.min, L.fontSize.max, d.fontSize),
      lineHeight: pickNumber(layout.lineHeight, L.lineHeight.min, L.lineHeight.max, d.lineHeight),
      marginCm: pickNumber(layout.marginCm, L.marginCm.min, L.marginCm.max, d.marginCm),
      justify: pickBoolean(layout.justify, d.justify),
      firstLineIndentCm: pickNumber(
        layout.firstLineIndentCm,
        L.indentCm.min,
        L.indentCm.max,
        d.firstLineIndentCm
      ),
      pageNumbers: pickBoolean(layout.pageNumbers, d.pageNumbers)
    }
  };
}