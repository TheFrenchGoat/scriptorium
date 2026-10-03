// src/main/sanitize.ts
// SÉCURITÉ : désinfection du HTML provenant de sources externes.
//
// Le contenu des chapitres est injecté avec innerHTML dans un contentEditable.
// Un fichier .scriptorium ou .odt reçu d’un tiers pourrait contenir du HTML
// dangereux. Seules les balises, les classes et les propriétés CSS réellement
// nécessaires à l’éditeur sont donc conservées.

import sanitizeHtml from 'sanitize-html';
import type { ProjectData } from '../shared/types';

export const CHAPTER_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'div',
    'p',
    'span',
    'b',
    'strong',
    'i',
    'em',
    'u',
    'font',
    'br',
    'mark'
  ],

  allowedAttributes: {
    span: [
      'class',
      'data-wb-key',
      'data-type-label',
      'style',
      'spellcheck'
    ],
    mark: ['class', 'spellcheck'],
    font: ['face', 'size', 'color'],
    div: ['style'],
    p: ['style']
  },

  allowedStyles: {
    '*': {
      color: [
        /^#[0-9a-fA-F]{3,8}$/,
        /^rgba?$[0-9, .]+$$/
      ],

      /*
       * La police ne peut contenir que des lettres, chiffres, espaces,
       * apostrophes, guillemets, virgules et tirets.
       *
       * Une expression CSS entièrement permissive accepterait également
       * des URL, des points-virgules et d’autres constructions qui ne sont
       * jamais produites par l’éditeur.
       */
      'font-family': [
        /^[a-zA-Z0-9\s,'"-]+$/
      ],

      'font-size': [
        /^[0-9.]+(px|pt)$/
      ],

      'font-weight': [
        /^(bold|normal|[0-9]+)$/
      ],

      'font-style': [
        /^(italic|normal)$/
      ],

      'text-decoration': [
        /^(underline|none)$/
      ],

      'text-align': [
        /^(left|right|center|justify)$/
      ],

      'border-color': [
        /^#[0-9a-fA-F]{3,8}$/,
        /^rgba?$[0-9, .]+$$/
      ]
    }
  },

  disallowedTagsMode: 'discard'
};

/**
 * Désinfecte le HTML d’un chapitre avant qu’il soit enregistré ou affiché
 * dans l’éditeur.
 */
export function sanitizeChapterHtml(
  html: string
): string {
  return sanitizeHtml(
    html,
    CHAPTER_HTML_SANITIZE_OPTIONS
  );
}

/**
 * Vérifie qu’une valeur est un objet simple exploitable.
 */
function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

/**
 * Désinfecte et normalise les données d’un projet importé.
 *
 * Cette fonction conserve également les sessions d’écriture et les objectifs
 * lorsqu’ils sont présents dans le fichier importé.
 */
export function sanitizeProjectData(
  projectData: unknown
): ProjectData {
  if (!isRecord(projectData)) {
    return {
      chapters: {},
      world: {},
      customWbTypes: {},
      writingSessions: [],
      goals: []
    };
  }

  const data =
    projectData as Partial<ProjectData>;

  const sanitizedChapters: Record<
    string,
    string
  > = {};

  const chaptersValue: unknown =
    data.chapters;

  if (isRecord(chaptersValue)) {
    Object.entries(chaptersValue).forEach(
      ([name, content]) => {
        sanitizedChapters[name] =
          typeof content === 'string'
            ? sanitizeChapterHtml(content)
            : '';
      }
    );
  }

  /*
   * Le contenu World Building est constitué de texte brut affiché dans des
   * champs input ou textarea. Il n’est pas injecté dans innerHTML.
   */
  const world = isRecord(data.world)
    ? data.world
    : {};

  const customWbTypes = isRecord(
    data.customWbTypes
  )
    ? data.customWbTypes
    : {};

  return {
    chapters: sanitizedChapters,

    world:
      world as ProjectData['world'],

    customWbTypes:
      customWbTypes as NonNullable<
        ProjectData['customWbTypes']
      >,

    writingSessions: Array.isArray(
      data.writingSessions
    )
      ? data.writingSessions
      : [],

    goals: Array.isArray(data.goals)
      ? data.goals
      : []
  };
}
