// src/main/sanitize.ts
// SÉCURITÉ : désinfection du HTML provenant de sources externes.
//
// Ce module désinfecte :
// - le HTML des chapitres de roman ;
// - le HTML des éléments de scénario ;
// - les projets importés depuis un fichier .scriptorium, .json ou .odt.
//
// Les anciens projets sans `projectType` restent considérés comme des romans.

import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import type {
  ProjectData,
  ProjectGoal,
  ProjectType,
  ScreenplayConventionLanguage,
  ScreenplayElement,
  ScreenplayElementType,
  ScreenplayInteriorExterior,
  ScreenplayPageFormat,
  ScreenplayProjectData,
  ScreenplayScene,
  ScreenplaySceneHeading,
  ScreenplaySettings,
  ScreenplayTitlePage,
  WritingSession
} from '../shared/types';

// ---------------------------------------------------------------------------
// CONFIGURATION HTML
// ---------------------------------------------------------------------------

const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgba?$\s*[0-9.,%\s]+\s*$$/
];

const FONT_FAMILY_PATTERN =
  /^[a-zA-Z0-9À-ÿ\s,'"-]+$/;

const FONT_SIZE_PATTERN =
  /^[0-9]+(?:\.[0-9]+)?(?:px|pt)$/;

export const CHAPTER_HTML_SANITIZE_OPTIONS:
  sanitizeHtml.IOptions = {
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
      div: [
        'class',
        'style',
        'data-screenplay-element',
        'data-screenplay-type'
      ],

      p: [
        'class',
        'style',
        'data-screenplay-element',
        'data-screenplay-type'
      ],

      span: [
        'class',
        'data-wb-key',
        'data-type-label',
        'data-screenplay-element',
        'data-screenplay-type',
        'style',
        'spellcheck'
      ],

      mark: [
        'class',
        'spellcheck'
      ],

      font: [
        'face',
        'size',
        'color'
      ]
    },

    allowedStyles: {
      '*': {
        color: COLOR_PATTERNS,

        /*
         * Une police ne peut contenir que des caractères ordinaires utilisés
         * dans un nom de police CSS.
         *
         * On refuse notamment :
         * - url(...) ;
         * - les points-virgules ;
         * - les accolades ;
         * - toute construction CSS qui ne serait pas produite par l’éditeur.
         */
        'font-family': [
          FONT_FAMILY_PATTERN
        ],

        'font-size': [
          FONT_SIZE_PATTERN
        ],

        'font-weight': [
          /^(normal|bold|[1-9]00)$/
        ],

        'font-style': [
          /^(normal|italic|oblique)$/
        ],

        'text-decoration': [
          /^(none|underline|line-through)(\s+(underline|line-through))*$/
        ],

        'text-decoration-line': [
          /^(none|underline|line-through)(\s+(underline|line-through))*$/
        ],

        'text-align': [
          /^(left|right|center|justify|start|end)$/
        ],

        'border-color': COLOR_PATTERNS,

        'background-color':
          COLOR_PATTERNS
      }
    },

    disallowedTagsMode: 'discard'
  };

/**
 * Options plus strictes pour un élément de scénario.
 *
 * La disposition d’un scénario doit provenir du type explicite de l’élément,
 * et non de marges ou de retraits arbitraires stockés dans le HTML.
 */
export const SCREENPLAY_HTML_SANITIZE_OPTIONS:
  sanitizeHtml.IOptions = {
    allowedTags: [
      'span',
      'b',
      'strong',
      'i',
      'em',
      'u',
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

      mark: [
        'class',
        'spellcheck'
      ]
    },

    allowedStyles: {
      '*': {
        color: COLOR_PATTERNS,

        'font-weight': [
          /^(normal|bold|[1-9]00)$/
        ],

        'font-style': [
          /^(normal|italic|oblique)$/
        ],

        'text-decoration': [
          /^(none|underline|line-through)(\s+(underline|line-through))*$/
        ],

        'text-decoration-line': [
          /^(none|underline|line-through)(\s+(underline|line-through))*$/
        ],

        'background-color':
          COLOR_PATTERNS
      }
    },

    disallowedTagsMode: 'discard'
  };

// ---------------------------------------------------------------------------
// OUTILS GÉNÉRAUX
// ---------------------------------------------------------------------------

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
 * Retourne une chaîne ou une valeur de repli.
 */
function getString(
  value: unknown,
  fallback = ''
): string {
  return typeof value === 'string'
    ? value
    : fallback;
}

/**
 * Retourne un booléen ou une valeur de repli.
 */
function getBoolean(
  value: unknown,
  fallback: boolean
): boolean {
  return typeof value === 'boolean'
    ? value
    : fallback;
}

/**
 * Génère ou conserve un identifiant unique.
 *
 * Les doublons sont remplacés afin qu’une scène, un en-tête et un élément ne
 * puissent pas partager accidentellement le même identifiant.
 */
function getUniqueId(
  value: unknown,
  usedIds: Set<string>
): string {
  const requested =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (
    requested &&
    !usedIds.has(requested)
  ) {
    usedIds.add(requested);
    return requested;
  }

  let generated = randomUUID();

  while (usedIds.has(generated)) {
    generated = randomUUID();
  }

  usedIds.add(generated);

  return generated;
}

/**
 * Désinfecte le HTML d’un chapitre de roman.
 */
export function sanitizeChapterHtml(
  html: string
): string {
  return sanitizeHtml(
    typeof html === 'string'
      ? html
      : '',
    CHAPTER_HTML_SANITIZE_OPTIONS
  );
}

/**
 * Désinfecte le contenu interne d’un élément de scénario.
 */
export function sanitizeScreenplayHtml(
  html: string
): string {
  return sanitizeHtml(
    typeof html === 'string'
      ? html
      : '',
    SCREENPLAY_HTML_SANITIZE_OPTIONS
  );
}

/**
 * Transforme une chaîne en texte brut.
 *
 * Cette fonction est utilisée pour les valeurs qui ne doivent jamais contenir
 * de HTML, par exemple le lieu d’un en-tête de scène.
 */
function sanitizePlainText(
  value: unknown
): string {
  const source = getString(value);

  if (!source) {
    return '';
  }

  return sanitizeHtml(source, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
  })
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// VALIDATION DES VALEURS SCÉNARIO
// ---------------------------------------------------------------------------

const SCREENPLAY_ELEMENT_TYPES: readonly ScreenplayElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
];


function isScreenplayElementType(
  value: unknown
): value is ScreenplayElementType {
  return (
    typeof value === 'string' &&
    SCREENPLAY_ELEMENT_TYPES.includes(
      value as ScreenplayElementType
    )
  );
}

const SCREENPLAY_INTERIOR_EXTERIOR_VALUES:
  readonly ScreenplayInteriorExterior[] = [
    'INT.',
    'EXT.',
    'INT./EXT.',
    'EXT./INT.',
    'OTHER'
  ];

function isScreenplayInteriorExterior(
  value: unknown
): value is ScreenplayInteriorExterior {
  return (
    typeof value === 'string' &&
    SCREENPLAY_INTERIOR_EXTERIOR_VALUES.includes(
      value as ScreenplayInteriorExterior
    )
  );
}

/**
 * Compatibilité avec quelques anciennes valeurs internes susceptibles d’avoir
 * été enregistrées pendant le développement du mode scénario.
 */
function normalizeInteriorExterior(
  value: unknown
): ScreenplayInteriorExterior {
  if (
    isScreenplayInteriorExterior(
      value
    )
  ) {
    return value;
  }

  switch (value) {
    case 'INT':
      return 'INT.';

    case 'EXT':
      return 'EXT.';

    case 'INT_EXT':
      return 'INT./EXT.';

    case 'EXT_INT':
      return 'EXT./INT.';

    default:
      return 'INT.';
  }
}

function normalizeConventionLanguage(
  value: unknown
): ScreenplayConventionLanguage {
  return value === 'en'
    ? 'en'
    : 'fr';
}

function normalizePageFormat(
  value: unknown
): ScreenplayPageFormat {
  return value === 'letter'
    ? 'letter'
    : 'a4';
}

// ---------------------------------------------------------------------------
// DÉSINFECTION DU SCÉNARIO
// ---------------------------------------------------------------------------

function sanitizeScreenplayElement(
  value: unknown,
  usedIds: Set<string>
): ScreenplayElement | null {
  if (!isRecord(value)) {
    return null;
  }

  const requestedType =
    value.type;

  if (
    !isScreenplayElementType(
      requestedType
    )
  ) {
    return null;
  }

  /*
   * L’en-tête principal d’une scène est stocké séparément dans `heading`.
   * Si un ancien fichier contient tout de même un élément de ce type, on le
   * conserve pour ne pas supprimer silencieusement du texte.
   */
  return {
    id: getUniqueId(
      value.id,
      usedIds
    ),

    type: requestedType,

    html: sanitizeScreenplayHtml(
      getString(value.html)
    )
  };
}

function sanitizeScreenplayHeading(
  value: unknown,
  usedIds: Set<string>
): ScreenplaySceneHeading {
  if (
    isRecord(value) &&
    value.mode === 'free'
  ) {
    return {
      id: getUniqueId(
        value.id,
        usedIds
      ),

      type: 'scene-heading',

      mode: 'free',

      html: sanitizeScreenplayHtml(
        getString(value.html)
      )
    };
  }

  const heading =
    isRecord(value)
      ? value
      : {};

  return {
    id: getUniqueId(
      heading.id,
      usedIds
    ),

    type: 'scene-heading',

    mode: 'structured',

    interiorExterior:
      normalizeInteriorExterior(
        heading.interiorExterior
      ),

    customInteriorExterior:
      sanitizePlainText(
        heading.customInteriorExterior
      ),

    location:
      sanitizePlainText(
        heading.location
      ),

    timeOfDay:
      sanitizePlainText(
        heading.timeOfDay
      )
  };
}

function sanitizeScreenplayScene(
  value: unknown,
  usedIds: Set<string>
): ScreenplayScene | null {
  if (!isRecord(value)) {
    return null;
  }

  const elements: ScreenplayElement[] =
    [];

  if (Array.isArray(value.elements)) {
    value.elements.forEach(
      (elementValue) => {
        const element =
          sanitizeScreenplayElement(
            elementValue,
            usedIds
          );

        if (element) {
          elements.push(element);
        }
      }
    );
  }

  /*
   * Une scène doit toujours pouvoir recevoir du texte immédiatement.
   */
  if (elements.length === 0) {
    elements.push({
      id: getUniqueId(
        undefined,
        usedIds
      ),
      type: 'action',
      html: ''
    });
  }

  return {
    id: getUniqueId(
      value.id,
      usedIds
    ),

    workingTitle:
      sanitizePlainText(
        value.workingTitle
      ),

    heading:
      sanitizeScreenplayHeading(
        value.heading,
        usedIds
      ),

    elements
  };
}

function sanitizeScreenplayTitlePage(
  value: unknown,
  legacySettings?: Record<
    string,
    unknown
  >
): ScreenplayTitlePage {
  const titlePage =
    isRecord(value)
      ? value
      : {};

  /*
   * `adaptationNote` était un ancien nom envisagé pour `sourceNote`.
   * Il est accepté uniquement pour assurer la compatibilité.
   */
  const sourceNote =
    titlePage.sourceNote ??
    titlePage.adaptationNote;

  return {
    enabled: getBoolean(
      titlePage.enabled,
      getBoolean(
        legacySettings?.includeTitlePage,
        true
      )
    ),

    title:
      sanitizePlainText(
        titlePage.title
      ),

    authors:
      sanitizePlainText(
        titlePage.authors
      ),

    contact:
      sanitizePlainText(
        titlePage.contact
      ),

    version:
      sanitizePlainText(
        titlePage.version
      ),

    date:
      sanitizePlainText(
        titlePage.date
      ),

    sourceNote:
      sanitizePlainText(
        sourceNote
      )
  };
}

function sanitizeScreenplaySettings(
  value: unknown
): ScreenplaySettings {
  const settings =
    isRecord(value)
      ? value
      : {};

  /*
   * `continuation` au singulier correspond à une ancienne variante de la
   * structure utilisée pendant le développement.
   */
  const continuationsValue =
    isRecord(settings.continuations)
      ? settings.continuations
      : isRecord(settings.continuation)
        ? settings.continuation
        : {};

  const conventionLanguage =
    normalizeConventionLanguage(
      settings.conventionLanguage
    );

  const defaultBottomLabel =
    conventionLanguage === 'en'
      ? '(MORE)'
      : '(À SUIVRE)';

  const defaultCharacterSuffix =
    conventionLanguage === 'en'
      ? "(CONT'D)"
      : '(SUITE)';

  return {
    conventionLanguage,

    pageFormat:
      normalizePageFormat(
        settings.pageFormat
      ),

    showSceneNumbersInExport:
      getBoolean(
        settings.showSceneNumbersInExport,
        getBoolean(
          settings.showSceneNumbers,
          false
        )
      ),

    boldSceneHeadings:
      getBoolean(
        settings.boldSceneHeadings,
        false
      ),

    enableShotElement:
      getBoolean(
        settings.enableShotElement,
        false
      ),

    continuations: {
      enabled: getBoolean(
        continuationsValue.enabled,
        true
      ),

      bottomLabel:
        sanitizePlainText(
          continuationsValue.bottomLabel
        ) || defaultBottomLabel,

      characterSuffix:
        sanitizePlainText(
          continuationsValue.characterSuffix ??
            continuationsValue.nextPageSuffix
        ) || defaultCharacterSuffix
    }
  };
}

function createFallbackScreenplayScene(
  usedIds: Set<string>
): ScreenplayScene {
  return {
    id: getUniqueId(
      undefined,
      usedIds
    ),

    workingTitle: '',

    heading: {
      id: getUniqueId(
        undefined,
        usedIds
      ),

      type: 'scene-heading',

      mode: 'structured',

      interiorExterior: 'INT.',

      customInteriorExterior: '',

      location: '',

      timeOfDay:
        'JOUR'
    },

    elements: [
      {
        id: getUniqueId(
          undefined,
          usedIds
        ),

        type: 'action',

        html: ''
      }
    ]
  };
}

function sanitizeScreenplayData(
  value: unknown
): ScreenplayProjectData {
  const screenplay =
    isRecord(value)
      ? value
      : {};

  const settingsRecord =
    isRecord(screenplay.settings)
      ? screenplay.settings
      : {};

  const usedIds =
    new Set<string>();

  const scenes: ScreenplayScene[] =
    [];

  if (Array.isArray(screenplay.scenes)) {
    screenplay.scenes.forEach(
      (sceneValue) => {
        const scene =
          sanitizeScreenplayScene(
            sceneValue,
            usedIds
          );

        if (scene) {
          scenes.push(scene);
        }
      }
    );
  }

  if (scenes.length === 0) {
    scenes.push(
      createFallbackScreenplayScene(
        usedIds
      )
    );
  }

  return {
    version: 1,

    settings:
      sanitizeScreenplaySettings(
        screenplay.settings
      ),

    titlePage:
      sanitizeScreenplayTitlePage(
        screenplay.titlePage,
        settingsRecord
      ),

    scenes
  };
}

// ---------------------------------------------------------------------------
// DÉSINFECTION DU PROJET COMPLET
// ---------------------------------------------------------------------------

function sanitizeProjectType(
  value: unknown
): ProjectType {
  return value === 'screenplay'
    ? 'screenplay'
    : 'novel';
}

function sanitizeChapters(
  value: unknown
): Record<string, string> {
  const chapters: Record<
    string,
    string
  > = {};

  if (!isRecord(value)) {
    return chapters;
  }

  Object.entries(value).forEach(
    ([name, content]) => {
      const safeName =
        name.trim();

      if (!safeName) {
        return;
      }

      chapters[safeName] =
        sanitizeChapterHtml(
          getString(content)
        );
    }
  );

  return chapters;
}

function sanitizeWritingSessions(
  value: unknown
): WritingSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  /*
   * Les sessions ne sont jamais injectées dans innerHTML.
   * On conserve uniquement les entrées de forme objet pour éviter les valeurs
   * primitives manifestement invalides.
   */
  return value.filter(
    (entry): entry is WritingSession =>
      isRecord(entry)
  );
}

function sanitizeGoals(
  value: unknown
): ProjectGoal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is ProjectGoal =>
      isRecord(entry)
  );
}

/**
 * Désinfecte et normalise les données d’un projet importé.
 *
 * Règles de compatibilité :
 * - absence de `projectType` : roman ;
 * - absence de `screenplay` dans un projet scénario : structure créée ;
 * - anciennes variantes des paramètres scénario : converties ;
 * - tableaux de sessions et d’objectifs absents : tableaux vides.
 */
export function sanitizeProjectData(
  projectData: unknown
): ProjectData {
  if (!isRecord(projectData)) {
    return {
      projectType: 'novel',
      chapters: {},
      world: {},
      customWbTypes: {},
      writingSessions: [],
      goals: []
    };
  }

  const projectType =
    sanitizeProjectType(
      projectData.projectType
    );

  const world =
    isRecord(projectData.world)
      ? projectData.world
      : {};

  const customWbTypes =
    isRecord(
      projectData.customWbTypes
    )
      ? projectData.customWbTypes
      : {};

  const result: ProjectData = {
    projectType,

    chapters:
      sanitizeChapters(
        projectData.chapters
      ),

    world:
      world as ProjectData['world'],

    customWbTypes:
      customWbTypes as NonNullable<
        ProjectData['customWbTypes']
      >,

    writingSessions:
      sanitizeWritingSessions(
        projectData.writingSessions
      ),

    goals:
      sanitizeGoals(
        projectData.goals
      )
  };

  if (projectType === 'screenplay') {
    result.screenplay =
      sanitizeScreenplayData(
        projectData.screenplay
      );

    /*
     * Un scénario utilise `screenplay.scenes` comme source principale.
     * On conserve néanmoins les chapitres éventuellement présents afin de ne
     * jamais supprimer silencieusement des données provenant d’un fichier
     * expérimental ou d’une ancienne version.
     */
  }

  return result;
}
