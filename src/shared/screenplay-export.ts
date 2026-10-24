// src/shared/screenplay-export.ts
// Document intermediaire de l'export Word / ODT des scenarios : texte brut
// deja mis en majuscules la ou l'usage le demande, numeros de scene et page
// de titre. Prepare par le renderer, verifie puis mis en page par le
// processus principal (src/main/export-screenplay.ts).
//
// Ne doit dependre ni de Node ni du DOM.

export type ScreenplayExportElementType =
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot';

export interface ScreenplayExportElement {
  type: ScreenplayExportElementType;
  /** Texte brut ; '\n' = retour a la ligne. */
  text: string;
}

export interface ScreenplayExportScene {
  number: number;
  heading: string;
  elements: ScreenplayExportElement[];
}

export interface ScreenplayExportTitlePage {
  title: string;
  /** « Écrit par » ou « Written by » ; vide sans auteur. */
  writtenBy: string;
  authors: string;
  source: string;
  contact: string;
  /** Version puis date, sur des lignes separees. */
  version: string;
}

export interface ScreenplayExportDocument {
  language: 'fr' | 'en';
  pageFormat: 'a4' | 'letter';
  boldSceneHeadings: boolean;
  sceneNumbers: boolean;
  /** Proprietes du fichier (titre, auteur). */
  title: string;
  author: string;
  titlePage: ScreenplayExportTitlePage | null;
  scenes: ScreenplayExportScene[];
}

export interface ScreenplayExportPage {
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
}

/** Memes dimensions que SCREENPLAY_PAGE_PRESETS (renderer/lib/screenplay.ts). */
export const SCREENPLAY_EXPORT_PAGES: Readonly<Record<'a4' | 'letter', ScreenplayExportPage>> = {
  a4: {
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 25.4,
    marginRightMm: 20,
    marginBottomMm: 25.4,
    marginLeftMm: 38
  },
  letter: {
    widthMm: 215.9,
    heightMm: 279.4,
    marginTopMm: 25.4,
    marginRightMm: 25.4,
    marginBottomMm: 25.4,
    marginLeftMm: 38.1
  }
};

export interface ScreenplayElementLayout {
  /** Retrait gauche, en fraction de la largeur utile. */
  left: number;
  /** Retrait droit, en fraction de la largeur utile. */
  right: number;
  alignRight: boolean;
  /** Espace avant le paragraphe, en points (12 = une ligne blanche). */
  spaceBeforePt: number;
  /** Ne pas laisser ce paragraphe seul en bas de page. */
  keepWithNext: boolean;
}

/** Retraits repris du PDF (renderer/lib/screenplay-print.ts). */
export const SCREENPLAY_ELEMENT_LAYOUT: Readonly<
  Record<ScreenplayExportElementType, ScreenplayElementLayout>
> = {
  action: { left: 0, right: 0, alignRight: false, spaceBeforePt: 12, keepWithNext: false },
  character: { left: 0.38, right: 0.2, alignRight: false, spaceBeforePt: 12, keepWithNext: true },
  parenthetical: { left: 0.28, right: 0.24, alignRight: false, spaceBeforePt: 0, keepWithNext: true },
  dialogue: { left: 0.2, right: 0.22, alignRight: false, spaceBeforePt: 0, keepWithNext: false },
  transition: { left: 0.46, right: 0, alignRight: true, spaceBeforePt: 12, keepWithNext: true },
  shot: { left: 0, right: 0, alignRight: false, spaceBeforePt: 12, keepWithNext: true }
};

export const SCREENPLAY_ELEMENT_TYPES_FOR_EXPORT: readonly ScreenplayExportElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
];

export const SCREENPLAY_FONT = 'Courier New';
export const SCREENPLAY_FONT_SIZE_PT = 12;
/** Espace avant un en-tete de scene, en points (deux lignes blanches). */
export const SCREENPLAY_HEADING_SPACE_PT = 24;
/** Place du numero de scene, dans la marge gauche. */
export const SCREENPLAY_NUMBER_OFFSET_CM = 1.5;

const LIMITS = {
  shortText: 2000,
  longText: 50000,
  scenes: 20000,
  elements: 20000
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texte nettoye : fins de ligne unifiees, caracteres de controle retires. */
function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

function cleanLine(value: unknown): string {
  return cleanText(value, LIMITS.shortText).replace(/\s*\n\s*/g, ' ');
}

/** Verifie un document recu par IPC et renvoie une copie sure. */
export function normalizeScreenplayExportDocument(value: unknown): ScreenplayExportDocument {
  if (!isRecord(value)) {
    throw new Error('Document de scenario invalide.');
  }

  const rawScenes = value.scenes;

  if (!Array.isArray(rawScenes)) {
    throw new Error('Document de scenario invalide.');
  }

  const scenes: ScreenplayExportScene[] = [];

  for (const raw of rawScenes.slice(0, LIMITS.scenes)) {
    if (!isRecord(raw)) continue;

    const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
    const elements: ScreenplayExportElement[] = [];

    for (const entry of rawElements.slice(0, LIMITS.elements)) {
      if (!isRecord(entry)) continue;

      const type =
        SCREENPLAY_ELEMENT_TYPES_FOR_EXPORT.find((candidate) => candidate === entry.type) ?? 'action';
      const text = cleanText(entry.text, LIMITS.longText);

      if (text.trim() === '') continue;

      elements.push({ type, text });
    }

    const number =
      typeof raw.number === 'number' && Number.isFinite(raw.number)
        ? Math.max(1, Math.round(raw.number))
        : scenes.length + 1;

    scenes.push({ number, heading: cleanLine(raw.heading), elements });
  }

  const page = isRecord(value.titlePage) ? value.titlePage : null;

  return {
    language: value.language === 'en' ? 'en' : 'fr',
    pageFormat: value.pageFormat === 'letter' ? 'letter' : 'a4',
    boldSceneHeadings: value.boldSceneHeadings === true,
    sceneNumbers: value.sceneNumbers === true,
    title: cleanLine(value.title),
    author: cleanLine(value.author),
    titlePage:
      page === null
        ? null
        : {
            title: cleanText(page.title, LIMITS.shortText),
            writtenBy: cleanLine(page.writtenBy),
            authors: cleanText(page.authors, LIMITS.shortText),
            source: cleanText(page.source, LIMITS.shortText),
            contact: cleanText(page.contact, LIMITS.shortText),
            version: cleanText(page.version, LIMITS.shortText)
          },
    scenes
  };
}