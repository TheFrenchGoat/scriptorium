// src/renderer/lib/screenplay-export.ts
// Scenario du projet -> document intermediaire d'export Word / ODT
// (voir src/shared/screenplay-export.ts). Meme contenu que le PDF :
// titres de travail exclus, elements vides ignores.

import { getSceneHeadingText, screenplayHtmlToPlainText } from './screenplay';
import type { ProjectData } from '../../shared/types';
import type {
  ScreenplayExportDocument,
  ScreenplayExportElement,
  ScreenplayExportElementType,
  ScreenplayExportScene
} from '../../shared/screenplay-export';

type ScreenplayDocument = NonNullable<ProjectData['screenplay']>;

/** Types ecrits en majuscules, comme dans le PDF. */
const UPPERCASE_TYPES: ReadonlySet<string> = new Set(['character', 'transition', 'shot']);

/** Champ de la page de titre (texte ou liste de lignes), nettoye. */
function field(value: unknown): string {
  if (typeof value === 'string') return value.trim();

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function cleanBlock(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
}

export function buildScreenplayExportDocument(
  projectName: string,
  screenplay: ScreenplayDocument
): ScreenplayExportDocument {
  const settings = screenplay.settings;
  const language: 'fr' | 'en' = settings.conventionLanguage === 'en' ? 'en' : 'fr';
  const upper = (value: string): string => value.toLocaleUpperCase(language);

  const page = screenplay.titlePage;
  const title = field(page?.title) || projectName;
  const authors = field(page?.authors);

  const scenes: ScreenplayExportScene[] = screenplay.scenes.map((scene, index) => {
    const elements: ScreenplayExportElement[] = [];

    for (const element of scene.elements) {
      const type = element.type as ScreenplayExportElementType;
      const text = cleanBlock(screenplayHtmlToPlainText(element.html));

      if (text.trim() === '') continue;

      elements.push({ type, text: UPPERCASE_TYPES.has(type) ? upper(text) : text });
    }

    return {
      number: index + 1,
      heading: upper(
        getSceneHeadingText(scene, settings.conventionLanguage).replace(/\s+/g, ' ').trim()
      ),
      elements
    };
  });

  return {
    language,
    pageFormat: settings.pageFormat === 'letter' ? 'letter' : 'a4',
    boldSceneHeadings: settings.boldSceneHeadings === true,
    sceneNumbers: settings.showSceneNumbersInExport === true,
    title,
    author: authors.replace(/\n+/g, ', '),
    titlePage:
      page && page.enabled
        ? {
            title: upper(title),
            writtenBy: authors !== '' ? (language === 'en' ? 'Written by' : 'Écrit par') : '',
            authors,
            source: field(page.sourceNote),
            contact: field(page.contact),
            version: [field(page.version), field(page.date)].filter(Boolean).join('\n')
          }
        : null,
    scenes
  };
}