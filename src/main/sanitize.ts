// src/main/sanitize.ts
// SÉCURITÉ : désinfection du HTML provenant de sources externes.
// Le contenu des chapitres est injecté en innerHTML dans un contentEditable
// (voir ChapterEditor.tsx). Un fichier .scriptorium reçu d'un tiers, ou un
// collage depuis une page web, pourrait sinon contenir du JavaScript
// exécutable (<img onerror>, <script>, gestionnaires d'événements...). Seules
// les balises et attributs réellement produits par l'éditeur sont autorisés.

import sanitizeHtml from 'sanitize-html';
import type { ProjectData } from '../shared/types';

export const CHAPTER_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['div', 'p', 'span', 'b', 'strong', 'i', 'em', 'u', 'font', 'br', 'mark'],
  allowedAttributes: {
    span: ['class', 'data-wb-key', 'data-type-label', 'style', 'spellcheck'],
    mark: ['class', 'spellcheck'],
    font: ['face', 'size', 'color'],
    div: ['style'],
    p: ['style']
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([0-9, .]+\)$/],
      // Auparavant /.*/ (tout accepté) : une valeur CSS forgée aurait pu
      // introduire du contenu inattendu (ex: url(), parenthèses, points-virgules).
      'font-family': [/^[a-zA-Z0-9\s,'"-]+$/],
      'font-size': [/^[0-9.]+(px|pt)$/],
      'font-weight': [/^(bold|normal|[0-9]+)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|none)$/],
      'text-align': [/^(left|right|center|justify)$/],
      'border-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([0-9, .]+\)$/]
    }
  },
  disallowedTagsMode: 'discard'
};

export function sanitizeChapterHtml(html: string): string {
  return sanitizeHtml(html, CHAPTER_HTML_SANITIZE_OPTIONS);
}

export function sanitizeProjectData(projectData: unknown): ProjectData {
  if (!projectData || typeof projectData !== 'object') {
    return { chapters: {}, world: {}, customWbTypes: {} };
  }

  const data = projectData as Partial<ProjectData>;
  const chapters = data.chapters ?? {};
  const sanitizedChapters: Record<string, string> = {};

  Object.keys(chapters).forEach((name) => {
    const content = chapters[name];
    sanitizedChapters[name] = typeof content === 'string' ? sanitizeChapterHtml(content) : '';
  });

  // Le contenu World Building est du texte brut (champs <input>/<textarea>,
  // jamais injecté en innerHTML côté renderer) : pas de risque équivalent.
  return {
    chapters: sanitizedChapters,
    world: data.world ?? {},
    customWbTypes: data.customWbTypes ?? {}
  };
}
