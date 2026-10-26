// src/main/sanitize.ts
// SÉCURITÉ : désinfection du HTML provenant de sources externes.
//
// Ce module désinfecte :
// - le HTML des chapitres de roman ;
// - le HTML des éléments de scénario ;
// - les données du World Building ;
// - les projets importés depuis un fichier .scriptorium, .json ou .odt.
//
// Les anciens projets sans `projectType` restent considérés comme des romans.
//
// Les anciens projets sans `wbFormat` (World Building au format 1) sont
// validés dans leur format d'origine : leur conversion vers le format 2 est
// réalisée par le renderer (lib/wb-migration.ts), qui dispose des libellés
// traduits et des modèles de fiches.

import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import type {
  ChapterMeta,
  ChapterStatus,
  BuiltinWbType,
  CustomWbTypeDef,
  LegacyWbItem,
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
  WbCategoryDef,
  WbField,
  WbFieldType,
  WbFolder,
  WbItem,
  WbRelation,
  WbRelationKind,
  WbRelationTypeDef,
  WbTimelineEvent,
  WritingSession
} from '../shared/types';
import { normalizeExportSettings } from '../shared/export-settings';

// ---------------------------------------------------------------------------
// CONFIGURATION HTML
// ---------------------------------------------------------------------------

/*
 * Couleurs acceptées :
 * - hexadécimal : #abc, #aabbcc, #aabbccdd ;
 * - rgb / rgba, avec virgules ou en syntaxe moderne :
 *   rgb(229, 57, 53), rgba(0, 0, 0, 0.5), rgb(229 57 53 / 50%).
 *
 * Les parenthèses sont écrites [(] et [)] (équivalent exact de leur forme
 * échappée) pour éviter qu'elles soient abîmées lors d'un copier-coller.
 */
const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgba?[(]\s*[0-9.,%\s/]+\s*[)]$/
];

const FONT_FAMILY_PATTERN = /^[a-zA-Z0-9À-ÿ\s,'"-]+$/;

const FONT_SIZE_PATTERN = /^[0-9]+(?:\.[0-9]+)?(?:px|pt)$/;

const TEXT_DECORATION_PATTERN =
  /^(none|underline|line-through)(\s+(underline|line-through))*$/;

export const CHAPTER_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['div', 'p', 'span', 'b', 'strong', 'i', 'em', 'u', 'font', 'br', 'mark'],

  allowedAttributes: {
    div: ['class', 'style', 'data-screenplay-element', 'data-screenplay-type'],

    p: ['class', 'style', 'data-screenplay-element', 'data-screenplay-type'],

    span: [
      'class',
      'data-wb-key',
      'data-type-label',
      'data-screenplay-element',
      'data-screenplay-type',
      // Couleur choisie volontairement par l'auteur (voir lib/text-color.ts).
      'data-user-color',
      'style',
      'spellcheck'
    ],

    mark: ['class', 'spellcheck'],

    font: ['face', 'size', 'color', 'data-user-color']
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
      'font-family': [FONT_FAMILY_PATTERN],

      'font-size': [FONT_SIZE_PATTERN],

      'font-weight': [/^(normal|bold|[1-9]00)$/],

      'font-style': [/^(normal|italic|oblique)$/],

      'text-decoration': [TEXT_DECORATION_PATTERN],

      'text-decoration-line': [TEXT_DECORATION_PATTERN],

      'text-align': [/^(left|right|center|justify|start|end)$/],

      'border-color': COLOR_PATTERNS,

      'background-color': COLOR_PATTERNS
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
export const SCREENPLAY_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['span', 'b', 'strong', 'i', 'em', 'u', 'br', 'mark'],

  allowedAttributes: {
    span: ['class', 'data-wb-key', 'data-type-label', 'data-user-color', 'style', 'spellcheck'],

    mark: ['class', 'spellcheck']
  },

  allowedStyles: {
    '*': {
      color: COLOR_PATTERNS,

      'font-weight': [/^(normal|bold|[1-9]00)$/],

      'font-style': [/^(normal|italic|oblique)$/],

      'text-decoration': [TEXT_DECORATION_PATTERN],

      'text-decoration-line': [TEXT_DECORATION_PATTERN],

      'border-color': COLOR_PATTERNS,

      'background-color': COLOR_PATTERNS
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Retourne une chaîne ou une valeur de repli.
 */
function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Retourne un booléen ou une valeur de repli.
 */
function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Génère ou conserve un identifiant unique.
 *
 * Les doublons sont remplacés afin qu’une scène, un en-tête et un élément ne
 * puissent pas partager accidentellement le même identifiant.
 */
function getUniqueId(value: unknown, usedIds: Set<string>): string {
  const requested = typeof value === 'string' ? value.trim() : '';

  if (requested && requested.length <= 128 && !usedIds.has(requested)) {
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
export function sanitizeChapterHtml(html: string): string {
  return sanitizeHtml(typeof html === 'string' ? html : '', CHAPTER_HTML_SANITIZE_OPTIONS);
}

/**
 * Désinfecte le contenu interne d’un élément de scénario.
 */
export function sanitizeScreenplayHtml(html: string): string {
  return sanitizeHtml(typeof html === 'string' ? html : '', SCREENPLAY_HTML_SANITIZE_OPTIONS);
}

/**
 * Transforme une chaîne en texte brut.
 *
 * Cette fonction est utilisée pour les valeurs qui ne doivent jamais contenir
 * de HTML, par exemple le lieu d’un en-tête de scène.
 */
function sanitizePlainText(value: unknown): string {
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

function isScreenplayElementType(value: unknown): value is ScreenplayElementType {
  return (
    typeof value === 'string' &&
    SCREENPLAY_ELEMENT_TYPES.includes(value as ScreenplayElementType)
  );
}

const SCREENPLAY_INTERIOR_EXTERIOR_VALUES: readonly ScreenplayInteriorExterior[] = [
  'INT.',
  'EXT.',
  'INT./EXT.',
  'EXT./INT.',
  'OTHER'
];

function isScreenplayInteriorExterior(value: unknown): value is ScreenplayInteriorExterior {
  return (
    typeof value === 'string' &&
    SCREENPLAY_INTERIOR_EXTERIOR_VALUES.includes(value as ScreenplayInteriorExterior)
  );
}

/**
 * Compatibilité avec quelques anciennes valeurs internes susceptibles d’avoir
 * été enregistrées pendant le développement du mode scénario.
 */
function normalizeInteriorExterior(value: unknown): ScreenplayInteriorExterior {
  if (isScreenplayInteriorExterior(value)) {
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

function normalizeConventionLanguage(value: unknown): ScreenplayConventionLanguage {
  return value === 'en' ? 'en' : 'fr';
}

function normalizePageFormat(value: unknown): ScreenplayPageFormat {
  return value === 'letter' ? 'letter' : 'a4';
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

  const requestedType = value.type;

  if (!isScreenplayElementType(requestedType)) {
    return null;
  }

  /*
   * L’en-tête principal d’une scène est stocké séparément dans `heading`.
   * Si un ancien fichier contient tout de même un élément de ce type, on le
   * conserve pour ne pas supprimer silencieusement du texte.
   */
  return {
    id: getUniqueId(value.id, usedIds),
    type: requestedType,
    html: sanitizeScreenplayHtml(getString(value.html))
  };
}

function sanitizeScreenplayHeading(
  value: unknown,
  usedIds: Set<string>
): ScreenplaySceneHeading {
  if (isRecord(value) && value.mode === 'free') {
    return {
      id: getUniqueId(value.id, usedIds),
      type: 'scene-heading',
      mode: 'free',
      html: sanitizeScreenplayHtml(getString(value.html))
    };
  }

  const heading = isRecord(value) ? value : {};

  return {
    id: getUniqueId(heading.id, usedIds),
    type: 'scene-heading',
    mode: 'structured',
    interiorExterior: normalizeInteriorExterior(heading.interiorExterior),
    customInteriorExterior: sanitizePlainText(heading.customInteriorExterior),
    location: sanitizePlainText(heading.location),
    timeOfDay: sanitizePlainText(heading.timeOfDay)
  };
}

function sanitizeScreenplayScene(
  value: unknown,
  usedIds: Set<string>
): ScreenplayScene | null {
  if (!isRecord(value)) {
    return null;
  }

  const elements: ScreenplayElement[] = [];

  if (Array.isArray(value.elements)) {
    value.elements.forEach((elementValue) => {
      const element = sanitizeScreenplayElement(elementValue, usedIds);

      if (element) {
        elements.push(element);
      }
    });
  }

  /*
   * Une scène doit toujours pouvoir recevoir du texte immédiatement.
   */
  if (elements.length === 0) {
    elements.push({
      id: getUniqueId(undefined, usedIds),
      type: 'action',
      html: ''
    });
  }

  return {
    id: getUniqueId(value.id, usedIds),
    workingTitle: sanitizePlainText(value.workingTitle),
    heading: sanitizeScreenplayHeading(value.heading, usedIds),
    elements
  };
}

function sanitizeScreenplayTitlePage(
  value: unknown,
  legacySettings?: Record<string, unknown>
): ScreenplayTitlePage {
  const titlePage = isRecord(value) ? value : {};

  /*
   * `adaptationNote` était un ancien nom envisagé pour `sourceNote`.
   * Il est accepté uniquement pour assurer la compatibilité.
   */
  const sourceNote = titlePage.sourceNote ?? titlePage.adaptationNote;

  return {
    enabled: getBoolean(
      titlePage.enabled,
      getBoolean(legacySettings?.includeTitlePage, true)
    ),
    title: sanitizePlainText(titlePage.title),
    authors: sanitizePlainText(titlePage.authors),
    contact: sanitizePlainText(titlePage.contact),
    version: sanitizePlainText(titlePage.version),
    date: sanitizePlainText(titlePage.date),
    sourceNote: sanitizePlainText(sourceNote)
  };
}

function sanitizeScreenplaySettings(value: unknown): ScreenplaySettings {
  const settings = isRecord(value) ? value : {};

  /*
   * `continuation` au singulier correspond à une ancienne variante de la
   * structure utilisée pendant le développement.
   */
  const continuationsValue = isRecord(settings.continuations)
    ? settings.continuations
    : isRecord(settings.continuation)
      ? settings.continuation
      : {};

  const conventionLanguage = normalizeConventionLanguage(settings.conventionLanguage);

  const defaultBottomLabel = conventionLanguage === 'en' ? '(MORE)' : '(À SUIVRE)';

  const defaultCharacterSuffix = conventionLanguage === 'en' ? "(CONT'D)" : '(SUITE)';

  return {
    conventionLanguage,

    pageFormat: normalizePageFormat(settings.pageFormat),

    showSceneNumbersInExport: getBoolean(
      settings.showSceneNumbersInExport,
      getBoolean(settings.showSceneNumbers, false)
    ),

    boldSceneHeadings: getBoolean(settings.boldSceneHeadings, false),

    enableShotElement: getBoolean(settings.enableShotElement, false),

    continuations: {
      enabled: getBoolean(continuationsValue.enabled, true),

      bottomLabel:
        sanitizePlainText(continuationsValue.bottomLabel) || defaultBottomLabel,

      characterSuffix:
        sanitizePlainText(
          continuationsValue.characterSuffix ?? continuationsValue.nextPageSuffix
        ) || defaultCharacterSuffix
    }
  };
}

function createFallbackScreenplayScene(usedIds: Set<string>): ScreenplayScene {
  return {
    id: getUniqueId(undefined, usedIds),

    workingTitle: '',

    heading: {
      id: getUniqueId(undefined, usedIds),
      type: 'scene-heading',
      mode: 'structured',
      interiorExterior: 'INT.',
      customInteriorExterior: '',
      location: '',
      timeOfDay: 'JOUR'
    },

    elements: [
      {
        id: getUniqueId(undefined, usedIds),
        type: 'action',
        html: ''
      }
    ]
  };
}

function sanitizeScreenplayData(value: unknown): ScreenplayProjectData {
  const screenplay = isRecord(value) ? value : {};

  const settingsRecord = isRecord(screenplay.settings) ? screenplay.settings : {};

  const usedIds = new Set<string>();

  const scenes: ScreenplayScene[] = [];

  if (Array.isArray(screenplay.scenes)) {
    screenplay.scenes.forEach((sceneValue) => {
      const scene = sanitizeScreenplayScene(sceneValue, usedIds);

      if (scene) {
        scenes.push(scene);
      }
    });
  }

  if (scenes.length === 0) {
    scenes.push(createFallbackScreenplayScene(usedIds));
  }

  return {
    version: 1,
    settings: sanitizeScreenplaySettings(screenplay.settings),
    titlePage: sanitizeScreenplayTitlePage(screenplay.titlePage, settingsRecord),
    scenes
  };
}

// ---------------------------------------------------------------------------
// WORLD BUILDING : CONSTANTES
// ---------------------------------------------------------------------------

/*
 * Doit rester égal à WB_FORMAT_VERSION (shared/types.ts).
 *
 * La valeur est recopiée ici plutôt qu’importée afin que ce module n’importe
 * que des types depuis `shared`, comme auparavant.
 */
const WB_FORMAT_CURRENT = 2;

/*
 * Clés refusées dans tous les objets indexés : elles permettraient à un
 * fichier piégé de modifier le prototype des objets JavaScript.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const BUILTIN_WB_TYPES: readonly BuiltinWbType[] = ['character', 'place', 'object', 'animal', 'other'];

const WB_FIELD_TYPES: readonly WbFieldType[] = [
  'text',
  'textarea',
  'number',
  'select',
  'reference'
];

const WB_RELATION_KINDS: readonly WbRelationKind[] = ['family', 'social', 'other'];

const WB_HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

/*
 * Image en base64 uniquement. Construite à partir d’une chaîne pour éviter
 * toute barre oblique dans un littéral d’expression régulière.
 */
const WB_IMAGE_PATTERN = new RegExp(
  '^data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$'
);

/*
 * Environ 2 Mo d’image une fois décodée. Les portraits produits par
 * Scriptorium (512 px compressés) pèsent quelques dizaines de Ko.
 */
const WB_IMAGE_MAX_LENGTH = 2_800_000;

const WB_FALLBACK_COLOR = '#94a3b8';

const WB_FALLBACK_ICON = '📄';

const WB_LIMITS = {
  key: 128,
  legacyName: 200,
  name: 200,
  label: 120,
  icon: 32,
  tag: 60,
  maxTags: 100,
  alias: 120,
  maxAliases: 50,
  fieldValue: 200_000,
  option: 120,
  maxOptions: 100,
  maxFields: 100,
  note: 5_000,
  dateLabel: 200,
  description: 50_000
} as const;

// ---------------------------------------------------------------------------
// WORLD BUILDING : OUTILS
// ---------------------------------------------------------------------------

function isSafeKey(key: string, maxLength: number): boolean {
  return key.length > 0 && key.length <= maxLength && !FORBIDDEN_KEYS.has(key);
}

/**
 * Supprime les caractères de contrôle invisibles.
 *
 * Les tabulations et retours à la ligne sont conservés si demandé, ou
 * remplacés par une espace sinon.
 */
function removeControlCharacters(value: string, keepLineBreaks: boolean): string {
  let output = '';

  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code === 10 || code === 9) {
      output += keepLineBreaks ? char : ' ';
      continue;
    }

    if (code < 32 || code === 127) {
      continue;
    }

    output += char;
  }

  return output;
}

/**
 * Texte sur une seule ligne.
 *
 * Contrairement à `sanitizePlainText`, les caractères `&`, `<` et `>` sont
 * conservés tels quels : ces valeurs sont affichées par React, jamais
 * injectées comme HTML.
 */
function cleanLine(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const cleaned = removeControlCharacters(value, false)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

  return cleaned || fallback;
}

/**
 * Texte long : les retours à la ligne sont conservés.
 */
function cleanMultiline(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return removeControlCharacters(value.replace(/\r\n?/g, '\n'), true).slice(0, maxLength);
}

/**
 * Liste de courtes chaînes, sans doublon (insensible à la casse).
 */
function cleanStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (result.length >= maxItems) {
      break;
    }

    const cleaned = cleanLine(entry, maxLength);

    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLocaleLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(cleaned);
  }

  return result;
}

/**
 * Liste d’identifiants existants, sans doublon.
 */
function cleanIdList(value: unknown, allowedIds: Set<string>): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry === 'string' && allowedIds.has(entry) && !result.includes(entry)) {
      result.push(entry);
    }
  }

  return result;
}

function cleanColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return WB_HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function cleanIcon(value: unknown): string | undefined {
  const cleaned = cleanLine(value, WB_LIMITS.icon);

  return cleaned || undefined;
}

function cleanImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > WB_IMAGE_MAX_LENGTH) {
    return undefined;
  }

  return WB_IMAGE_PATTERN.test(value) ? value : undefined;
}

function cleanTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length > 64) {
    return fallback;
  }

  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function cleanSortKey(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function isBuiltinWbType(value: unknown): value is BuiltinWbType {
  return typeof value === 'string' && BUILTIN_WB_TYPES.includes(value as BuiltinWbType);
}

function cleanCategoryRef(value: unknown, fallback: string): string {
  const cleaned = cleanLine(value, WB_LIMITS.key);

  return cleaned && isSafeKey(cleaned, WB_LIMITS.key) ? cleaned : fallback;
}

// ---------------------------------------------------------------------------
// WORLD BUILDING : CHAMPS ET CATÉGORIES
// ---------------------------------------------------------------------------

function sanitizeWbFields(value: unknown): WbField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedKeys = new Set<string>();
  const fields: WbField[] = [];

  for (const entry of value) {
    if (fields.length >= WB_LIMITS.maxFields) {
      break;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const key = cleanLine(entry.key, WB_LIMITS.key);

    if (!isSafeKey(key, WB_LIMITS.key) || usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);

    const type: WbFieldType = WB_FIELD_TYPES.includes(entry.type as WbFieldType)
      ? (entry.type as WbFieldType)
      : 'text';

    const field: WbField = {
      key,
      label: cleanLine(entry.label, WB_LIMITS.label, key),
      type
    };

    if (type === 'select') {
      field.options = cleanStringList(entry.options, WB_LIMITS.maxOptions, WB_LIMITS.option);
    }

    if (type === 'reference') {
      const referenceCategory = cleanLine(entry.referenceCategory, WB_LIMITS.key);

      if (referenceCategory && isSafeKey(referenceCategory, WB_LIMITS.key)) {
        field.referenceCategory = referenceCategory;
      }
    }

    fields.push(field);
  }

  return fields;
}

function sanitizeWbCategories(value: unknown): Record<string, WbCategoryDef> {
  const categories: Record<string, WbCategoryDef> = {};

  if (!isRecord(value)) {
    return categories;
  }

  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim();

    if (!isSafeKey(key, WB_LIMITS.key) || !isRecord(entry)) {
      continue;
    }

    const category: WbCategoryDef = {
      label: cleanLine(entry.label, WB_LIMITS.label),
      icon: cleanIcon(entry.icon) ?? WB_FALLBACK_ICON,
      color: cleanColor(entry.color) ?? WB_FALLBACK_COLOR,
      fields: sanitizeWbFields(entry.fields)
    };

    /*
     * Une catégorie n’est « intégrée » que si son identifiant correspond
     * réellement à l’une des quatre catégories d’origine.
     */
    if (isBuiltinWbType(entry.builtin) && entry.builtin === key) {
      category.builtin = entry.builtin;
    }

    const presetId = cleanLine(entry.presetId, WB_LIMITS.key);

    if (presetId) {
      category.presetId = presetId;
    }

    categories[key] = category;
  }

  return categories;
}

// ---------------------------------------------------------------------------
// WORLD BUILDING : FORMAT 1 (ANCIENS PROJETS)
// ---------------------------------------------------------------------------

function sanitizeContent(value: unknown): Record<string, string> {
  const content: Record<string, string> = {};

  if (!isRecord(value)) {
    return content;
  }

  for (const [rawKey, fieldValue] of Object.entries(value)) {
    const key = rawKey.trim();

    if (!isSafeKey(key, WB_LIMITS.key)) {
      continue;
    }

    if (typeof fieldValue === 'string') {
      content[key] = cleanMultiline(fieldValue, WB_LIMITS.fieldValue);
    } else if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) {
      content[key] = String(fieldValue);
    }
  }

  return content;
}

function sanitizeLegacyWorld(value: unknown): Record<string, LegacyWbItem> {
  const world: Record<string, LegacyWbItem> = {};

  if (!isRecord(value)) {
    return world;
  }

  for (const [rawName, entry] of Object.entries(value)) {
    const name = cleanLine(rawName, WB_LIMITS.legacyName);

    if (!isSafeKey(name, WB_LIMITS.legacyName) || !isRecord(entry) || world[name]) {
      continue;
    }

    const item: LegacyWbItem = {
      wbType: cleanCategoryRef(entry.wbType, 'other'),
      content: sanitizeContent(entry.content)
    };

    const icon = cleanIcon(entry.icon);
    const color = cleanColor(entry.color);

    if (icon) {
      item.icon = icon;
    }

    if (color) {
      item.color = color;
    }

    world[name] = item;
  }

  return world;
}

function sanitizeLegacyCustomTypes(value: unknown): Record<string, CustomWbTypeDef> {
  const types: Record<string, CustomWbTypeDef> = {};

  if (!isRecord(value)) {
    return types;
  }

  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim();

    if (!isSafeKey(key, WB_LIMITS.key) || !isRecord(entry)) {
      continue;
    }

    types[key] = {
      label: cleanLine(entry.label, WB_LIMITS.label, key),
      icon: cleanIcon(entry.icon) ?? WB_FALLBACK_ICON,
      defaultColor: cleanColor(entry.defaultColor) ?? WB_FALLBACK_COLOR,
      fields: sanitizeWbFields(entry.fields)
    };
  }

  return types;
}

// ---------------------------------------------------------------------------
// WORLD BUILDING : FORMAT 2
// ---------------------------------------------------------------------------

function sanitizeWbFolders(value: unknown): WbFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const folders: WbFolder[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const folder: WbFolder = {
      id: getUniqueId(entry.id, usedIds),
      name: cleanLine(entry.name, WB_LIMITS.name, '…'),
      category: cleanCategoryRef(entry.category, 'other'),
      parentId: typeof entry.parentId === 'string' ? entry.parentId : null
    };

    if (entry.collapsed === true) {
      folder.collapsed = true;
    }

    folders.push(folder);
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  /*
   * 1. Un parent doit exister, être différent du dossier et appartenir à la
   *    même catégorie.
   */
  for (const folder of folders) {
    if (folder.parentId === null) {
      continue;
    }

    const parent = byId.get(folder.parentId);

    if (!parent || parent.id === folder.id || parent.category !== folder.category) {
      folder.parentId = null;
    }
  }

  /*
   * 2. Rupture des boucles (A dans B, B dans A) : le dossier qui ferme la
   *    boucle est remonté à la racine.
   */
  for (const folder of folders) {
    const visited = new Set<string>([folder.id]);
    let current = folder.parentId ? byId.get(folder.parentId) : undefined;

    while (current) {
      if (visited.has(current.id)) {
        folder.parentId = null;
        break;
      }

      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }

  return folders;
}

function sanitizeWorldItems(
  value: unknown,
  folderIds: Set<string>,
  now: string
): Record<string, WbItem> {
  const world: Record<string, WbItem> = {};

  if (!isRecord(value)) {
    return world;
  }

  for (const [rawId, entry] of Object.entries(value)) {
    const id = rawId.trim();

    if (!isSafeKey(id, WB_LIMITS.key) || !isRecord(entry) || world[id]) {
      continue;
    }

    const folderId =
      typeof entry.folderId === 'string' && folderIds.has(entry.folderId)
        ? entry.folderId
        : null;

    const createdAt = cleanTimestamp(entry.createdAt, now);

    /*
     * Un nom vide est conservé tel quel : la migration du renderer le
     * remplace par un libellé traduit (« Sans nom »).
     */
    const item: WbItem = {
      id,
      name: cleanLine(entry.name, WB_LIMITS.name),
      wbType: cleanCategoryRef(entry.wbType, 'other'),
      content: sanitizeContent(entry.content),
      folderId,
      tags: cleanStringList(entry.tags, WB_LIMITS.maxTags, WB_LIMITS.tag),
      aliases: cleanStringList(entry.aliases, WB_LIMITS.maxAliases, WB_LIMITS.alias),
      createdAt,
      updatedAt: cleanTimestamp(entry.updatedAt, createdAt)
    };

    const image = cleanImage(entry.image);
    const icon = cleanIcon(entry.icon);
    const color = cleanColor(entry.color);

    if (image) {
      item.image = image;
    }

    if (icon) {
      item.icon = icon;
    }

    if (color) {
      item.color = color;
    }

    const iconImage = cleanImage(entry.iconImage);

    if (iconImage) {
      item.iconImage = iconImage;
    }

    if (entry.readMode === true) {
      item.readMode = true;
    }

    world[id] = item;
  }

  return world;
}

function sanitizeWbRelationTypes(value: unknown): WbRelationTypeDef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const types: WbRelationTypeDef[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const label = cleanLine(entry.label, WB_LIMITS.label);

    if (!label) {
      continue;
    }

    const symmetric = entry.symmetric === true;

    types.push({
      id: getUniqueId(entry.id, usedIds),
      label,
      inverseLabel: symmetric ? label : cleanLine(entry.inverseLabel, WB_LIMITS.label, label),
      symmetric,
      kind: WB_RELATION_KINDS.includes(entry.kind as WbRelationKind)
        ? (entry.kind as WbRelationKind)
        : 'other'
    });
  }

  return types;
}

function sanitizeWbRelations(value: unknown, itemIds: Set<string>): WbRelation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const seenLinks = new Set<string>();
  const relations: WbRelation[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const sourceId = typeof entry.sourceId === 'string' ? entry.sourceId : '';
    const targetId = typeof entry.targetId === 'string' ? entry.targetId : '';
    const typeId = cleanLine(entry.typeId, WB_LIMITS.key);

    /*
     * Une relation doit relier deux fiches existantes et distinctes.
     */
    if (!itemIds.has(sourceId) || !itemIds.has(targetId) || sourceId === targetId || !typeId) {
      continue;
    }

    const linkKey = sourceId + '|' + targetId + '|' + typeId;

    if (seenLinks.has(linkKey)) {
      continue;
    }

    seenLinks.add(linkKey);

    const relation: WbRelation = {
      id: getUniqueId(entry.id, usedIds),
      sourceId,
      targetId,
      typeId
    };

    const note = cleanMultiline(entry.note, WB_LIMITS.note).trim();

    if (note) {
      relation.note = note;
    }

    relations.push(relation);
  }

  return relations;
}

function sanitizeWbTimeline(value: unknown, itemIds: Set<string>): WbTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const events: WbTimelineEvent[] = [];

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    const event: WbTimelineEvent = {
      id: getUniqueId(entry.id, usedIds),
      title: cleanLine(entry.title, WB_LIMITS.name),
      dateLabel: cleanLine(entry.dateLabel, WB_LIMITS.dateLabel),
      sortKey: cleanSortKey(entry.sortKey, index),
      description: cleanMultiline(entry.description, WB_LIMITS.description),
      itemIds: cleanIdList(entry.itemIds, itemIds),

      /*
       * Les noms de chapitres sont seulement nettoyés : un chapitre absent
       * est ignoré à l’affichage plutôt que supprimé ici.
       */
      chapterNames: cleanStringList(entry.chapterNames, 500, WB_LIMITS.legacyName)
    };

    const color = cleanColor(entry.color);

    if (color) {
      event.color = color;
    }

    events.push(event);
  });

  return events;
}

// ---------------------------------------------------------------------------
// WORLD BUILDING : POINT D’ENTRÉE
// ---------------------------------------------------------------------------

type WorldBuildingData = Pick<
  ProjectData,
  | 'wbFormat'
  | 'world'
  | 'wbCategories'
  | 'wbFolders'
  | 'wbRelationTypes'
  | 'wbRelations'
  | 'wbTimeline'
  | 'customWbTypes'
>;

function createEmptyWorldBuilding(): WorldBuildingData {
  return {
    wbFormat: WB_FORMAT_CURRENT,
    world: {},
    wbCategories: {},
    wbFolders: [],
    wbRelationTypes: [],
    wbRelations: [],
    wbTimeline: []
  };
}

/**
 * Valide les données du World Building d’un projet.
 *
 * - Format 1 (pas de `wbFormat`) : les données restent au format 1, nettoyées.
 *   Elles seront converties par le renderer à l’ouverture du projet.
 * - Format 2 ou supérieur : validation complète du format 2.
 */
function sanitizeWorldBuilding(projectData: Record<string, unknown>): WorldBuildingData {
  const format =
    typeof projectData.wbFormat === 'number' && Number.isFinite(projectData.wbFormat)
      ? projectData.wbFormat
      : 1;

  if (format < WB_FORMAT_CURRENT) {
    return {
      /*
       * Les fiches au format 1 sont indexées par leur nom. Le transtypage est
       * volontaire : `wbFormat` absent signale au renderer qu’une migration
       * est nécessaire.
       */
      world: sanitizeLegacyWorld(projectData.world) as unknown as ProjectData['world'],
      customWbTypes: sanitizeLegacyCustomTypes(projectData.customWbTypes)
    };
  }

  const now = new Date().toISOString();

  const wbFolders = sanitizeWbFolders(projectData.wbFolders);

  const world = sanitizeWorldItems(
    projectData.world,
    new Set(wbFolders.map((folder) => folder.id)),
    now
  );

  const itemIds = new Set(Object.keys(world));

  return {
    wbFormat: WB_FORMAT_CURRENT,
    world,
    wbCategories: sanitizeWbCategories(projectData.wbCategories),
    wbFolders,
    wbRelationTypes: sanitizeWbRelationTypes(projectData.wbRelationTypes),
    wbRelations: sanitizeWbRelations(projectData.wbRelations, itemIds),
    wbTimeline: sanitizeWbTimeline(projectData.wbTimeline, itemIds)
  };
}

// ---------------------------------------------------------------------------
// DÉSINFECTION DU PROJET COMPLET
// ---------------------------------------------------------------------------

function sanitizeProjectType(value: unknown): ProjectType {
  return value === 'screenplay' ? 'screenplay' : 'novel';
}

function sanitizeChapters(value: unknown): Record<string, string> {
  const chapters: Record<string, string> = {};

  if (!isRecord(value)) {
    return chapters;
  }

  Object.entries(value).forEach(([name, content]) => {
    const safeName = name.trim();

    if (!safeName || FORBIDDEN_KEYS.has(safeName)) {
      return;
    }

    chapters[safeName] = sanitizeChapterHtml(getString(content));
  });

  return chapters;
}

function sanitizeWritingSessions(value: unknown): WritingSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  /*
   * Les sessions ne sont jamais injectées dans innerHTML.
   * On conserve uniquement les entrées de forme objet pour éviter les valeurs
   * primitives manifestement invalides.
   */
  return value.filter((entry): entry is WritingSession => isRecord(entry));
}

const CHAPTER_STATUS_VALUES: readonly ChapterStatus[] = ['todo', 'draft', 'revision', 'done'];
const CHAPTER_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CHAPTER_TARGET_MAX = 10000000;

/**
 * Nettoie les réglages des chapitres : seuls les chapitres existants, les états connus,
 * les couleurs #rrggbb et les objectifs entiers positifs sont conservés.
 */
function sanitizeChapterMeta(value: unknown, chapters: Record<string, string>): Record<string, ChapterMeta> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, ChapterMeta> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
    if (!Object.prototype.hasOwnProperty.call(chapters, name) || !isRecord(raw)) continue;
    const meta: ChapterMeta = {};
    const status = raw['status'];
    if (typeof status === 'string' && (CHAPTER_STATUS_VALUES as readonly string[]).includes(status)) {
      meta.status = status as ChapterStatus;
    }
    const color = raw['color'];
    if (typeof color === 'string' && CHAPTER_COLOR_PATTERN.test(color)) {
      meta.color = color.toLowerCase();
    }
    const target = raw['targetWords'];
    if (typeof target === 'number' && Number.isFinite(target) && target >= 1) {
      meta.targetWords = Math.min(Math.floor(target), CHAPTER_TARGET_MAX);
    }
    if (Object.keys(meta).length > 0) result[name] = meta;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeGoals(value: unknown): ProjectGoal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is ProjectGoal => isRecord(entry));
}

/**
 * Désinfecte et normalise les données d’un projet importé.
 *
 * Règles de compatibilité :
 * - absence de `projectType` : roman ;
 * - absence de `screenplay` dans un projet scénario : structure créée ;
 * - anciennes variantes des paramètres scénario : converties ;
 * - absence de `wbFormat` : World Building au format 1, conservé tel quel
 *   (nettoyé) pour être converti par le renderer ;
 * - tableaux de sessions et d’objectifs absents : tableaux vides.
 */
export function sanitizeProjectData(projectData: unknown): ProjectData {
  if (!isRecord(projectData)) {
    return {
      projectType: 'novel',
      chapters: {},
      ...createEmptyWorldBuilding(),
      writingSessions: [],
      goals: []
    };
  }

  const projectType = sanitizeProjectType(projectData.projectType);

  const result: ProjectData = {
    projectType,
    chapters: sanitizeChapters(projectData.chapters),
    ...sanitizeWorldBuilding(projectData),
    writingSessions: sanitizeWritingSessions(projectData.writingSessions),
    goals: sanitizeGoals(projectData.goals)
  };

  if (projectData.chapterMeta !== undefined) {
    const chapterMeta = sanitizeChapterMeta(projectData.chapterMeta, result.chapters);
    if (chapterMeta) result.chapterMeta = chapterMeta;
  }
  if (projectData.exportSettings !== undefined) {
    result.exportSettings = normalizeExportSettings(projectData.exportSettings);
  }

  if (projectType === 'screenplay') {
    result.screenplay = sanitizeScreenplayData(projectData.screenplay);

    /*
     * Un scénario utilise `screenplay.scenes` comme source principale.
     * On conserve néanmoins les chapitres éventuellement présents afin de ne
     * jamais supprimer silencieusement des données provenant d’un fichier
     * expérimental ou d’une ancienne version.
     */
  }

  return result;
}
