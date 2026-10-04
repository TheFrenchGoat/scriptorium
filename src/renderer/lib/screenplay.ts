// src/renderer/lib/screenplay.ts
//
// Fonctions communes au mode scénario.
//
// Ce module ne manipule pas directement l’état React. Il fournit uniquement
// des fonctions déterministes pour :
// - créer un projet scénario et ses premières données ;
// - créer des scènes et des paragraphes typés ;
// - construire le texte visible d’un en-tête de scène ;
// - gérer l’enchaînement des types avec Entrée, Tab et Maj+Tab ;
// - normaliser les textes particuliers du scénario ;
// - calculer quelques statistiques propres au scénario.

import type {
  ProjectData,
  ScreenplayConventionLanguage,
  ScreenplayElement,
  ScreenplayElementType,
  ScreenplayHeadingMode,
  ScreenplayInteriorExterior,
  ScreenplayPageFormat,
  ScreenplayParagraphType,
  ScreenplayProjectData,
  ScreenplayScene,
  ScreenplaySceneHeading,
  ScreenplaySettings
} from '../../shared/types';

// ---------------------------------------------------------------------------
// TYPES LOCAUX
// ---------------------------------------------------------------------------

export interface SceneHeadingValues {
  interiorExterior?: ScreenplayInteriorExterior;
  customInteriorExterior?: string;
  location?: string;
  time?: string;
}

export interface CreateScreenplayElementOptions {
  id?: string;
  type?: ScreenplayElementType;
  html?: string;
}

export interface CreateScreenplaySceneOptions {
  id?: string;
  workingTitle?: string;

  /**
   * Mode structuré par défaut.
   */
  headingMode?: ScreenplayHeadingMode;

  interiorExterior?: ScreenplayInteriorExterior;
  customInteriorExterior?: string;
  location?: string;
  time?: string;

  /**
   * Texte utilisé lorsque l’en-tête est en mode libre.
   *
   * `heading` est conservé comme alias pratique pour les appels existants.
   */
  freeHeading?: string;
  heading?: string;

  elements?: ScreenplayElement[];
}

export interface CreateScreenplayProjectOptions {
  title: string;
  author?: string;
  conventionLanguage?: ScreenplayConventionLanguage;
  pageFormat?: ScreenplayPageFormat;

  firstScene?: CreateScreenplaySceneOptions;
}

export interface ScreenplayPagePreset {
  format: ScreenplayPageFormat;
  label: string;

  /**
   * Dimensions physiques utilisées par l’éditeur paginé et les exports.
   */
  widthMm: number;
  heightMm: number;

  /**
   * Marges générales du scénario.
   *
   * Les retraits spécifiques à chaque type de paragraphe sont appliqués
   * séparément par les feuilles de style.
   */
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
}

export interface ScreenplayTextStatistics {
  sceneCount: number;
  words: number;
  characters: number;
  actionWords: number;
  dialogueWords: number;
  dialogueCount: number;
  characterCueCount: number;
}

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

export const SCREENPLAY_ELEMENT_TYPES: readonly ScreenplayElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
] as const;

/**
 * Ordre utilisé par Tab et Maj+Tab.
 *
 * L’en-tête de scène n’est pas inclus : il appartient aux métadonnées
 * structurées de la scène et n’est pas un élément ordinaire de son contenu.
 */
export const SCREENPLAY_TAB_ORDER: readonly ScreenplayElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
] as const;

export const SCREENPLAY_PAGE_PRESETS: Record<
  ScreenplayPageFormat,
  ScreenplayPagePreset
> = {
  a4: {
    format: 'a4',
    label: 'A4',
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 25.4,
    marginRightMm: 20,
    marginBottomMm: 25.4,
    marginLeftMm: 38
  },

  letter: {
    format: 'letter',
    label: 'US Letter',
    widthMm: 215.9,
    heightMm: 279.4,
    marginTopMm: 25.4,
    marginRightMm: 25.4,
    marginBottomMm: 25.4,
    marginLeftMm: 38.1
  }
};

const FRENCH_DEFAULT_HEADING: SceneHeadingValues = {
  interiorExterior: 'INT.',
  location: '',
  time: 'JOUR'
};

const ENGLISH_DEFAULT_HEADING: SceneHeadingValues = {
  interiorExterior: 'INT.',
  location: '',
  time: 'DAY'
};

// ---------------------------------------------------------------------------
// IDENTIFIANTS
// ---------------------------------------------------------------------------

/**
 * Génère un identifiant stable pour une scène ou un paragraphe.
 */
export function createScreenplayId(
  prefix: 'scene' | 'element' | 'heading' = 'element'
): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// NORMALISATION DE TEXTE
// ---------------------------------------------------------------------------

/**
 * Supprime les balises HTML et transforme le contenu en texte simple.
 */
export function screenplayHtmlToPlainText(
  html: string
): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const container =
    document.createElement('div');

  container.innerHTML = html;

  return (container.innerText || container.textContent || '')
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/**
 * Échappe un texte avant son insertion dans du HTML.
 */
export function escapeScreenplayHtml(
  value: string
): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Nettoie les espaces d’un texte d’en-tête.
 */
export function normalizeScreenplayHeadingPart(
  value: string
): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les noms de personnages sont traditionnellement affichés en majuscules.
 */
export function normalizeCharacterCue(
  value: string
): string {
  return normalizeScreenplayHeadingPart(value)
    .toLocaleUpperCase();
}

/**
 * Les transitions sont traditionnellement affichées en majuscules.
 */
export function normalizeTransition(
  value: string
): string {
  return normalizeScreenplayHeadingPart(value)
    .toLocaleUpperCase();
}

/**
 * Ajoute les parenthèses d’une indication de jeu sans les doubler.
 */
export function normalizeParenthetical(
  value: string
): string {
  const trimmed =
    normalizeScreenplayHeadingPart(value);

  if (!trimmed) {
    return '';
  }

  const withoutOpening =
    trimmed.startsWith('(')
      ? trimmed.slice(1)
      : trimmed;

  const withoutBoth =
    withoutOpening.endsWith(')')
      ? withoutOpening.slice(0, -1)
      : withoutOpening;

  return `(${withoutBoth.trim()})`;
}

// ---------------------------------------------------------------------------
// EN-TÊTES DE SCÈNE
// ---------------------------------------------------------------------------

export function normalizeInteriorExterior(
  value: unknown
): ScreenplayInteriorExterior {
  switch (value) {
    case 'INT.':
    case 'EXT.':
    case 'INT./EXT.':
    case 'EXT./INT.':
    case 'OTHER':
      return value;

    /*
     * Compatibilité avec d’éventuelles données créées pendant le
     * développement avant la stabilisation des valeurs avec un point.
     */
    case 'INT':
      return 'INT.';

    case 'EXT':
      return 'EXT.';

    case 'INT/EXT':
      return 'INT./EXT.';

    case 'EXT/INT':
      return 'EXT./INT.';

    default:
      return 'INT.';
  }
}

/**
 * Retourne la valeur textuelle à afficher au début de l’en-tête.
 */
export function getVisibleInteriorExterior(
  interiorExterior: ScreenplayInteriorExterior,
  customInteriorExterior = ''
): string {
  if (interiorExterior === 'OTHER') {
    return normalizeScreenplayHeadingPart(
      customInteriorExterior
    ).toLocaleUpperCase();
  }

  return interiorExterior;
}

/**
 * Construit un en-tête structuré, par exemple :
 *
 * INT. APPARTEMENT — JOUR
 */
export function getDefaultSceneHeading(
  values: SceneHeadingValues = {},
  language: ScreenplayConventionLanguage = 'fr'
): string {
  const defaults =
    language === 'en'
      ? ENGLISH_DEFAULT_HEADING
      : FRENCH_DEFAULT_HEADING;

  const interiorExterior =
    normalizeInteriorExterior(
      values.interiorExterior ??
        defaults.interiorExterior
    );

  const prefix =
    getVisibleInteriorExterior(
      interiorExterior,
      values.customInteriorExterior
    );

  const location =
    normalizeScreenplayHeadingPart(
      values.location ??
        defaults.location ??
        ''
    ).toLocaleUpperCase();

  const time =
    normalizeScreenplayHeadingPart(
      values.time ??
        defaults.time ??
        ''
    ).toLocaleUpperCase();

  const firstPart = [
    prefix,
    location
  ]
    .filter(Boolean)
    .join(' ');

  if (firstPart && time) {
    return `${firstPart} — ${time}`;
  }

  return firstPart || time;
}

/**
 * Retourne le texte visible d’un en-tête de scène.
 */
export function getSceneHeadingText(
  value:
    | ScreenplayScene
    | ScreenplaySceneHeading,
  language: ScreenplayConventionLanguage = 'fr'
): string {
  const heading: ScreenplaySceneHeading =
    'heading' in value
      ? value.heading
      : value;

  if (heading.mode === 'free') {
    return screenplayHtmlToPlainText(
      heading.html
    ).toLocaleUpperCase();
  }

  return getDefaultSceneHeading(
    {
      interiorExterior:
        heading.interiorExterior,
      customInteriorExterior:
        heading.customInteriorExterior,
      location: heading.location,
      time: heading.timeOfDay
    },
    language
  );
}

/**
 * Crée l’objet d’en-tête d’une nouvelle scène.
 */
export function createSceneHeading(
  options: CreateScreenplaySceneOptions = {}
): ScreenplaySceneHeading {
  const id =
    createScreenplayId('heading');

  if (options.headingMode === 'free') {
    const freeText =
      options.freeHeading ??
      options.heading ??
      '';

    return {
      id,
      type: 'scene-heading',
      mode: 'free',
      html: escapeScreenplayHtml(
        normalizeScreenplayHeadingPart(
          freeText
        ).toLocaleUpperCase()
      )
    };
  }

  return {
    id,
    type: 'scene-heading',
    mode: 'structured',
    interiorExterior:
      normalizeInteriorExterior(
        options.interiorExterior
      ),
    customInteriorExterior:
      normalizeScreenplayHeadingPart(
        options.customInteriorExterior ??
          ''
      ),
    location:
      normalizeScreenplayHeadingPart(
        options.location ?? ''
      ),
    timeOfDay:
      normalizeScreenplayHeadingPart(
        options.time ?? ''
      )
  };
}

// ---------------------------------------------------------------------------
// CRÉATION DES ÉLÉMENTS ET DES SCÈNES
// ---------------------------------------------------------------------------

export function createScreenplayElement(
  options: CreateScreenplayElementOptions = {}
): ScreenplayElement {
  return {
    id:
      options.id ||
      createScreenplayId('element'),

    type:
      options.type || 'action',

    html:
      typeof options.html === 'string'
        ? options.html
        : ''
  };
}

export function createScreenplayScene(
  options: CreateScreenplaySceneOptions = {}
): ScreenplayScene {
  const elements =
    Array.isArray(options.elements) &&
    options.elements.length > 0
      ? options.elements.map(
          (element) =>
            createScreenplayElement(
              element
            )
        )
      : [
          createScreenplayElement({
            type: 'action',
            html: ''
          })
        ];

  return {
    id:
      options.id ||
      createScreenplayId('scene'),

    workingTitle:
      normalizeScreenplayHeadingPart(
        options.workingTitle ?? ''
      ),

    heading:
      createSceneHeading(options),

    elements
  };
}

// ---------------------------------------------------------------------------
// PARAMÈTRES ET CRÉATION DU PROJET
// ---------------------------------------------------------------------------

export function getDefaultScreenplaySettings(
  conventionLanguage: ScreenplayConventionLanguage = 'fr',
  pageFormat: ScreenplayPageFormat = 'a4'
): ScreenplaySettings {
  return {
    conventionLanguage,
    pageFormat,
    showSceneNumbersInExport: false,
    boldSceneHeadings: false,
    enableShotElement: false,

    continuations: {
      enabled: true,

      bottomLabel:
        conventionLanguage === 'fr'
          ? '(À SUIVRE)'
          : '(MORE)',

      characterSuffix:
        conventionLanguage === 'fr'
          ? '(SUITE)'
          : "(CONT'D)"
    }
  };
}

export function createScreenplayProject(
  options: CreateScreenplayProjectOptions
): ProjectData {
  const conventionLanguage =
    options.conventionLanguage ?? 'fr';

  const pageFormat =
    options.pageFormat ?? 'a4';

  const screenplay: ScreenplayProjectData = {
    version: 1,

    settings:
      getDefaultScreenplaySettings(
        conventionLanguage,
        pageFormat
      ),

    titlePage: {
      enabled: true,
      title:
        normalizeScreenplayHeadingPart(
          options.title
        ),
      authors:
        normalizeScreenplayHeadingPart(
          options.author ?? ''
        ),
      contact: '',
      version: '',
      date: '',
      sourceNote: ''
    },

    scenes: [
      createScreenplayScene({
        ...options.firstScene,
        interiorExterior:
          options.firstScene
            ?.interiorExterior ??
          'INT.',

        time:
          options.firstScene?.time ??
          (conventionLanguage === 'fr'
            ? 'JOUR'
            : 'DAY')
      })
    ]
  };

  return {
    projectType: 'screenplay',

    /*
     * Ces objets restent présents pour que les outils communs et les anciens
     * composants puissent manipuler le projet sans erreur.
     *
     * Le contenu réel du scénario est stocké dans `screenplay.scenes`.
     */
    chapters: {},
    world: {},
    customWbTypes: {},
    writingSessions: [],
    goals: [],
    screenplay
  };
}

export function isScreenplayProject(
  projectData:
    | ProjectData
    | null
    | undefined
): boolean {
  return (
    projectData?.projectType ===
      'screenplay' &&
    Boolean(projectData.screenplay)
  );
}

export function getScreenplayData(
  projectData:
    | ProjectData
    | null
    | undefined
): ScreenplayProjectData | null {
  if (!isScreenplayProject(projectData)) {
    return null;
  }

  return projectData?.screenplay ?? null;
}

export function getScreenplayPagePreset(
  format: ScreenplayPageFormat
): ScreenplayPagePreset {
  return (
    SCREENPLAY_PAGE_PRESETS[format] ??
    SCREENPLAY_PAGE_PRESETS.a4
  );
}

// ---------------------------------------------------------------------------
// ENCHAÎNEMENT DES TYPES
// ---------------------------------------------------------------------------

/**
 * Type créé par Entrée lorsque le curseur est à la fin du paragraphe.
 */
export function getNextScreenplayTypeAfterEnter(
  currentType: ScreenplayParagraphType
): ScreenplayElementType {
  switch (currentType) {
    case 'character':
      return 'dialogue';

    case 'parenthetical':
      return 'dialogue';

    case 'scene-heading':
    case 'action':
    case 'dialogue':
    case 'transition':
    case 'shot':
    default:
      return 'action';
  }
}

/**
 * Alias explicite utilisable par l’éditeur.
 */
export const getNextScreenplayElementType =
  getNextScreenplayTypeAfterEnter;

/**
 * Retourne les types disponibles dans le sélecteur.
 *
 * Le type Plan est masqué lorsque l’option correspondante est désactivée.
 */
export function getAvailableScreenplayElementTypes(
  settings: ScreenplaySettings
): ScreenplayElementType[] {
  return SCREENPLAY_TAB_ORDER.filter(
    (type) =>
      type !== 'shot' ||
      settings.enableShotElement
  );
}

/**
 * Change de type avec Tab ou Maj+Tab.
 */
export function cycleScreenplayElementType(
  currentType: ScreenplayElementType,
  direction: 1 | -1,
  settings: ScreenplaySettings
): ScreenplayElementType {
  const available =
    getAvailableScreenplayElementTypes(
      settings
    );

  if (available.length === 0) {
    return 'action';
  }

  const currentIndex =
    available.indexOf(currentType);

  if (currentIndex < 0) {
    return available[0];
  }

  const nextIndex =
    (currentIndex +
      direction +
      available.length) %
    available.length;

  return available[nextIndex];
}

// ---------------------------------------------------------------------------
// LIBELLÉS D’INTERFACE
// ---------------------------------------------------------------------------

export function getScreenplayElementLabel(
  type: ScreenplayParagraphType,
  language: ScreenplayConventionLanguage
): string {
  if (language === 'en') {
    switch (type) {
      case 'scene-heading':
        return 'Scene heading';

      case 'action':
        return 'Action';

      case 'character':
        return 'Character';

      case 'parenthetical':
        return 'Parenthetical';

      case 'dialogue':
        return 'Dialogue';

      case 'transition':
        return 'Transition';

      case 'shot':
        return 'Shot / technical direction';
    }
  }

  switch (type) {
    case 'scene-heading':
      return 'En-tête de scène';

    case 'action':
      return 'Action';

    case 'character':
      return 'Personnage';

    case 'parenthetical':
      return 'Indication de jeu';

    case 'dialogue':
      return 'Dialogue';

    case 'transition':
      return 'Transition';

    case 'shot':
      return 'Plan / indication technique';
  }
}

export function getSceneDisplayTitle(
  scene: ScreenplayScene,
  sceneIndex: number,
  language: ScreenplayConventionLanguage
): string {
  const workingTitle =
    normalizeScreenplayHeadingPart(
      scene.workingTitle
    );

  if (workingTitle) {
    return workingTitle;
  }

  return language === 'en'
    ? `Scene ${sceneIndex + 1}`
    : `Scène ${sceneIndex + 1}`;
}

export function getSceneDisplaySubtitle(
  scene: ScreenplayScene,
  language: ScreenplayConventionLanguage
): string {
  return getSceneHeadingText(
    scene,
    language
  );
}

// ---------------------------------------------------------------------------
// STATISTIQUES
// ---------------------------------------------------------------------------

function countWords(
  value: string
): number {
  const text =
    normalizeScreenplayHeadingPart(
      value
    );

  if (!text) {
    return 0;
  }

  return text
    .split(/\s+/)
    .filter(Boolean).length;
}

export function getScreenplayTextStatistics(
  screenplay: ScreenplayProjectData
): ScreenplayTextStatistics {
  let words = 0;
  let characters = 0;
  let actionWords = 0;
  let dialogueWords = 0;
  let dialogueCount = 0;
  let characterCueCount = 0;

  screenplay.scenes.forEach(
    (scene) => {
      scene.elements.forEach(
        (element) => {
          const plainText =
            screenplayHtmlToPlainText(
              element.html
            );

          const elementWords =
            countWords(plainText);

          words += elementWords;
          characters +=
            plainText.length;

          if (
            element.type === 'action' ||
            element.type ===
              'transition' ||
            element.type === 'shot'
          ) {
            actionWords +=
              elementWords;
          }

          if (
            element.type ===
            'dialogue'
          ) {
            dialogueWords +=
              elementWords;
            dialogueCount += 1;
          }

          if (
            element.type ===
            'character'
          ) {
            characterCueCount += 1;
          }
        }
      );
    }
  );

  return {
    sceneCount:
      screenplay.scenes.length,
    words,
    characters,
    actionWords,
    dialogueWords,
    dialogueCount,
    characterCueCount
  };
}

/**
 * Retourne le nombre total de mots d’un projet, quel que soit son mode.
 *
 * Cette fonction peut être utilisée progressivement par les cartes de projet,
 * les objectifs et la barre de statut pendant l’intégration du mode scénario.
 */
export function countScreenplayProjectWords(
  projectData: ProjectData
): number {
  if (!projectData.screenplay) {
    return 0;
  }

  return getScreenplayTextStatistics(
    projectData.screenplay
  ).words;
}
