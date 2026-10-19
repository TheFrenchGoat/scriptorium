// src/renderer/lib/wb-migration.ts
// MIGRATION ET VÉRIFICATION DU WORLD BUILDING
//
// Ce module :
// - convertit un projet du format 1 (fiches indexées par leur nom, types
//   personnalisés dans `customWbTypes`) vers le format 2 (identifiants
//   stables, catégories unifiées, dossiers, relations, frise) ;
// - vérifie et répare les données du format 2 à chaque ouverture ;
// - relie les mentions des chapitres et des scènes aux identifiants ;
// - reconnecte les onglets de fiches ouverts.
//
// Toutes les fonctions publiques travaillent sur une copie : les données
// d'origine restent intactes, ce qui permet d'en faire une sauvegarde avant
// d'enregistrer le résultat.

import { WB_FORMAT_VERSION } from '../../shared/types';
import type {
  LanguageCode,
  ProjectData,
  ProjectsMap,
  ProjectUiState,
  TabRef,
  WbCategoryDef,
  WbField,
  WbFieldType,
  WbFolder,
  WbItem,
  WbRelation,
  WbRelationKind,
  WbRelationTypeDef,
  WbTimelineEvent
} from '../../shared/types';
import {
  WB_BUILTIN_RELATION_TYPES,
  WB_FALLBACK_COLOR,
  WB_FALLBACK_ICON,
  WB_UNTITLED_NAME,
  createBuiltinCategory,
  createDefaultCategories,
  isBuiltinWbType,
  pickText
} from './wb-config';

// ============================================================================
// CONSTANTES
// ============================================================================

/*
 * Clés refusées : elles permettraient de modifier le prototype des objets.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_KEY_LENGTH = 128;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

/*
 * Une clé composée uniquement de chiffres serait rangée en premier par
 * JavaScript, ce qui casserait l'ordre d'affichage des fiches.
 */
const INTEGER_LIKE_PATTERN = /^[0-9]+$/;

const IMAGE_PATTERN = new RegExp(
  '^data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$'
);

const IMAGE_MAX_LENGTH = 2_800_000;

const FIELD_TYPES: readonly WbFieldType[] = ['text', 'textarea', 'number', 'select', 'reference'];

const RELATION_KINDS: readonly WbRelationKind[] = ['family', 'social', 'other'];

const BUILTIN_RELATION_PREFIX = 'rel-';

const LIMITS = {
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
  description: 50_000,
  maxChapterLinks: 500
} as const;

// ============================================================================
// OUTILS GÉNÉRAUX
// ============================================================================

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isUsableKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH && !FORBIDDEN_KEYS.has(key);
}

function isOrderSafeKey(key: string): boolean {
  return isUsableKey(key) && !INTEGER_LIKE_PATTERN.test(key);
}

/**
 * Supprime les caractères de contrôle invisibles.
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
 */
function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return removeControlCharacters(value, false).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Texte long : les retours à la ligne sont conservés.
 */
function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return removeControlCharacters(value.replace(/\r\n?/g, '\n'), true).slice(0, maxLength);
}

/**
 * Liste de courtes chaînes sans doublon.
 *
 * `foldCase` : les doublons sont détectés sans tenir compte de la casse.
 */
function cleanList(
  value: unknown,
  maxItems: number,
  maxLength: number,
  foldCase = true
): string[] {
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

    const normalized = foldCase ? cleaned.toLocaleLowerCase() : cleaned;

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(cleaned);
  }

  return result;
}

function cleanColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function cleanIcon(value: unknown): string | undefined {
  const cleaned = cleanLine(value, LIMITS.icon);

  return cleaned || undefined;
}

function cleanImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > IMAGE_MAX_LENGTH) {
    return undefined;
  }

  return IMAGE_PATTERN.test(value) ? value : undefined;
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

/**
 * Sérialisation indépendante de l'ordre des propriétés.
 *
 * Sert uniquement à détecter si la vérification a modifié quelque chose.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return '[' + value.map((entry) => stableStringify(entry ?? null)).join(',') + ']';
  }

  const record = value as UnknownRecord;

  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();

  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(record[key])).join(',') + '}';
}

// ============================================================================
// IDENTIFIANTS
// ============================================================================

/**
 * Préfixes des identifiants :
 * - `wb` : fiche ;
 * - `wbf` : dossier ;
 * - `wbr` : relation ;
 * - `wbe` : événement de la frise ;
 * - `wbt` : type de relation créé par l'auteur.
 *
 * Commencer par une lettre garantit que l'ordre des clés est respecté.
 */
export type WbIdPrefix = 'wb' | 'wbf' | 'wbr' | 'wbe' | 'wbt';

export function createWbId(prefix: WbIdPrefix): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return prefix + '-' + cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);

  return prefix + '-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function uniqueId(requested: unknown, used: Set<string>, prefix: WbIdPrefix): string {
  const candidate = typeof requested === 'string' ? requested.trim() : '';

  if (candidate && isOrderSafeKey(candidate) && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  let generated = createWbId(prefix);

  while (used.has(generated)) {
    generated = createWbId(prefix);
  }

  used.add(generated);

  return generated;
}

// ============================================================================
// CATÉGORIES ET CHAMPS
// ============================================================================

function fixCategorySlug(slug: string): string {
  return INTEGER_LIKE_PATTERN.test(slug) ? 'cat-' + slug : slug;
}

/**
 * Lit une référence à une catégorie. Retourne une chaîne vide si invalide.
 */
function readCategoryRef(value: unknown): string {
  const cleaned = cleanLine(value, MAX_KEY_LENGTH);

  return isUsableKey(cleaned) ? fixCategorySlug(cleaned) : '';
}

function normalizeFields(value: unknown): WbField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedKeys = new Set<string>();
  const fields: WbField[] = [];

  for (const entry of value) {
    if (fields.length >= LIMITS.maxFields) {
      break;
    }

    if (!isRecord(entry)) {
      continue;
    }

    const key = cleanLine(entry.key, MAX_KEY_LENGTH);

    if (!isUsableKey(key) || usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);

    const type: WbFieldType = FIELD_TYPES.includes(entry.type as WbFieldType)
      ? (entry.type as WbFieldType)
      : 'text';

    /*
     * Un libellé vide est permis : pour une catégorie d'origine, il signifie
     * « utiliser la traduction » (voir resolveFieldLabel).
     */
    const field: WbField = {
      key,
      label: cleanLine(entry.label, LIMITS.label),
      type
    };

    if (type === 'select') {
      field.options = cleanList(entry.options, LIMITS.maxOptions, LIMITS.option);
    }

    if (type === 'reference') {
      const referenceCategory = readCategoryRef(entry.referenceCategory);

      if (referenceCategory) {
        field.referenceCategory = referenceCategory;
      }
    }

    fields.push(field);
  }

  return fields;
}

/**
 * Catégories au format 2.
 *
 * Absentes : catégories par défaut. Un objet vide est conservé tel quel
 * (les catégories manquantes seront recréées d'après les fiches).
 */
function normalizeCategories(value: unknown): Record<string, WbCategoryDef> {
  if (!isRecord(value)) {
    return createDefaultCategories();
  }

  const categories: Record<string, WbCategoryDef> = {};

  for (const [rawSlug, entry] of Object.entries(value)) {
    const slug = readCategoryRef(rawSlug);

    if (!slug || hasOwn(categories, slug) || !isRecord(entry)) {
      continue;
    }

    const category: WbCategoryDef = {
      label: cleanLine(entry.label, LIMITS.label),
      icon: cleanIcon(entry.icon) ?? WB_FALLBACK_ICON,
      color: cleanColor(entry.color) ?? WB_FALLBACK_COLOR,
      fields: normalizeFields(entry.fields)
    };

    if (isBuiltinWbType(slug)) {
      category.builtin = slug;
    }

    const presetId = cleanLine(entry.presetId, MAX_KEY_LENGTH);

    if (presetId) {
      category.presetId = presetId;
    }

    categories[slug] = category;
  }

  return categories;
}

/**
 * Format 1 : catégories d'origine + anciens types personnalisés.
 */
function convertLegacyCategories(customTypes: unknown): Record<string, WbCategoryDef> {
  const categories = createDefaultCategories();

  if (!isRecord(customTypes)) {
    return categories;
  }

  for (const [rawSlug, entry] of Object.entries(customTypes)) {
    const slug = readCategoryRef(rawSlug);

    if (!slug || !isRecord(entry)) {
      continue;
    }

    const fields = normalizeFields(entry.fields);

    /*
     * Un type personnalisé portant le même identifiant qu'une catégorie
     * d'origine : ses champs supplémentaires sont ajoutés à celle-ci afin
     * qu'aucune valeur ne soit perdue.
     */
    if (hasOwn(categories, slug)) {
      const existing = categories[slug];
      const existingKeys = new Set(existing.fields.map((field) => field.key));

      fields.forEach((field) => {
        if (!existingKeys.has(field.key)) {
          existing.fields.push(field);
        }
      });

      continue;
    }

    categories[slug] = {
      label: cleanLine(entry.label, LIMITS.label) || slug,
      icon: cleanIcon(entry.icon) ?? WB_FALLBACK_ICON,
      color: cleanColor(entry.defaultColor) ?? cleanColor(entry.color) ?? WB_FALLBACK_COLOR,
      fields
    };
  }

  return categories;
}

/**
 * Recrée les catégories utilisées par des fiches mais absentes.
 *
 * Les champs sont déduits du contenu des fiches : aucune valeur n'est perdue.
 */
function ensureCategoriesForItems(
  world: Record<string, WbItem>,
  categories: Record<string, WbCategoryDef>
): void {
  const missing = new Map<string, Set<string>>();

  Object.values(world).forEach((item) => {
    if (hasOwn(categories, item.wbType)) {
      return;
    }

    let keys = missing.get(item.wbType);

    if (!keys) {
      keys = new Set<string>();
      missing.set(item.wbType, keys);
    }

    Object.keys(item.content).forEach((key) => keys?.add(key));
  });

  missing.forEach((contentKeys, slug) => {
    if (isBuiltinWbType(slug)) {
      const category = createBuiltinCategory(slug);
      const known = new Set(category.fields.map((field) => field.key));

      contentKeys.forEach((key) => {
        if (!known.has(key)) {
          category.fields.push({ key, label: key, type: 'textarea' });
        }
      });

      categories[slug] = category;
      return;
    }

    categories[slug] = {
      label: slug,
      icon: WB_FALLBACK_ICON,
      color: WB_FALLBACK_COLOR,
      fields: Array.from(contentKeys).map((key) => ({ key, label: key, type: 'textarea' }))
    };
  });
}

// ============================================================================
// FICHES
// ============================================================================

function normalizeContent(value: unknown): Record<string, string> {
  const content: Record<string, string> = {};

  if (!isRecord(value)) {
    return content;
  }

  for (const [rawKey, fieldValue] of Object.entries(value)) {
    const key = rawKey.trim();

    if (!isUsableKey(key)) {
      continue;
    }

    if (typeof fieldValue === 'string') {
      content[key] = cleanText(fieldValue, LIMITS.fieldValue);
    } else if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) {
      content[key] = String(fieldValue);
    }
  }

  return content;
}

function applyItemAppearance(item: WbItem, entry: UnknownRecord): void {
  const icon = cleanIcon(entry.icon);
  const color = cleanColor(entry.color);

  if (icon) {
    item.icon = icon;
  }

  if (color) {
    item.color = color;
  }
}

/**
 * Format 1 : fiches indexées par leur nom.
 *
 * `keyMap` reçoit la correspondance « ancien nom -> nouvel identifiant ».
 */
function convertLegacyWorld(
  value: unknown,
  untitled: string,
  now: string,
  keyMap: Map<string, string>
): Record<string, WbItem> {
  const world: Record<string, WbItem> = {};

  if (!isRecord(value)) {
    return world;
  }

  const usedIds = new Set<string>();

  for (const [rawName, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = uniqueId(undefined, usedIds, 'wb');

    const item: WbItem = {
      id,
      name: cleanLine(rawName, LIMITS.name) || untitled,
      wbType: readCategoryRef(entry.wbType) || 'other',
      content: normalizeContent(entry.content),
      folderId: null,
      tags: [],
      aliases: [],
      createdAt: now,
      updatedAt: now
    };

    applyItemAppearance(item, entry);

    world[id] = item;
    keyMap.set(rawName, id);
  }

  return world;
}

/**
 * Format 2 : vérification des fiches.
 *
 * `keyMap` reçoit les identifiants qui ont dû être remplacés.
 */
function normalizeWorld(
  value: unknown,
  untitled: string,
  now: string,
  keyMap: Map<string, string>
): Record<string, WbItem> {
  const world: Record<string, WbItem> = {};

  if (!isRecord(value)) {
    return world;
  }

  const usedIds = new Set<string>();

  for (const [rawKey, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = uniqueId(rawKey, usedIds, 'wb');

    if (id !== rawKey) {
      keyMap.set(rawKey, id);
    }

    const createdAt = cleanTimestamp(entry.createdAt, now);

    const item: WbItem = {
      id,
      name: cleanLine(entry.name, LIMITS.name) || untitled,
      wbType: readCategoryRef(entry.wbType) || 'other',
      content: normalizeContent(entry.content),
      folderId: typeof entry.folderId === 'string' ? entry.folderId : null,
      tags: cleanList(entry.tags, LIMITS.maxTags, LIMITS.tag),
      aliases: cleanList(entry.aliases, LIMITS.maxAliases, LIMITS.alias),
      createdAt,
      updatedAt: cleanTimestamp(entry.updatedAt, createdAt)
    };

    const image = cleanImage(entry.image);

    if (image) {
      item.image = image;
    }

    applyItemAppearance(item, entry);

    if (entry.readMode === true) {
      item.readMode = true;
    }

    world[id] = item;
  }

  return world;
}

/**
 * Crée une nouvelle fiche vide.
 */
export function createWbItemRecord(
  name: string,
  wbType: string,
  category: WbCategoryDef | undefined
): WbItem {
  const now = new Date().toISOString();
  const content: Record<string, string> = {};

  category?.fields.forEach((field) => {
    content[field.key] = '';
  });

  return {
    id: createWbId('wb'),
    name: name.trim(),
    wbType,
    content,
    folderId: null,
    tags: [],
    aliases: [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Recherche une fiche par son nom : d'abord à l'identique, puis sans tenir
 * compte de la casse ni des espaces en bordure.
 */
export function findWbItemByName(
  world: Record<string, WbItem>,
  name: string
): WbItem | undefined {
  const items = Object.values(world);

  const exact = items.find((item) => item.name === name);

  if (exact) {
    return exact;
  }

  const normalized = name.trim().toLocaleLowerCase();

  if (!normalized) {
    return undefined;
  }

  return items.find((item) => item.name.trim().toLocaleLowerCase() === normalized);
}

// ============================================================================
// DOSSIERS
// ============================================================================

function normalizeFolders(
  value: unknown,
  categories: Record<string, WbCategoryDef>
): WbFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const folders: WbFolder[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const category = readCategoryRef(entry.category);

    if (!category || !hasOwn(categories, category)) {
      continue;
    }

    const folder: WbFolder = {
      id: uniqueId(entry.id, usedIds, 'wbf'),
      name: cleanLine(entry.name, LIMITS.name) || '…',
      category,
      parentId: typeof entry.parentId === 'string' ? entry.parentId : null
    };

    if (entry.collapsed === true) {
      folder.collapsed = true;
    }

    folders.push(folder);
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  /*
   * Un parent doit exister, être différent du dossier et appartenir à la
   * même catégorie.
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
   * Rupture des boucles : le dossier qui ferme la boucle remonte à la racine.
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

/**
 * Une fiche ne peut être rangée que dans un dossier existant de sa catégorie.
 */
function fixItemFolders(world: Record<string, WbItem>, folders: WbFolder[]): void {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  Object.values(world).forEach((item) => {
    if (item.folderId === null) {
      return;
    }

    const folder = byId.get(item.folderId);

    if (!folder || folder.category !== item.wbType) {
      item.folderId = null;
    }
  });
}

// ============================================================================
// RELATIONS
// ============================================================================

function normalizeRelationTypes(
  value: unknown,
  typeIdMap: Map<string, string>
): WbRelationTypeDef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const types: WbRelationTypeDef[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const label = cleanLine(entry.label, LIMITS.label);

    if (!label) {
      continue;
    }

    const rawId = typeof entry.id === 'string' ? entry.id.trim() : '';

    /*
     * Le préfixe `rel-` est réservé aux types intégrés.
     */
    const id = uniqueId(
      rawId.startsWith(BUILTIN_RELATION_PREFIX) ? undefined : rawId,
      usedIds,
      'wbt'
    );

    if (rawId && rawId !== id) {
      typeIdMap.set(rawId, id);
    }

    const symmetric = entry.symmetric === true;

    types.push({
      id,
      label,
      inverseLabel: symmetric ? label : cleanLine(entry.inverseLabel, LIMITS.label) || label,
      symmetric,
      kind: RELATION_KINDS.includes(entry.kind as WbRelationKind)
        ? (entry.kind as WbRelationKind)
        : 'other'
    });
  }

  return types;
}

function normalizeRelations(
  value: unknown,
  world: Record<string, WbItem>,
  customTypes: WbRelationTypeDef[],
  typeIdMap: Map<string, string>
): WbRelation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const symmetricIds = new Set<string>([
    ...WB_BUILTIN_RELATION_TYPES.filter((type) => type.symmetric).map((type) => type.id),
    ...customTypes.filter((type) => type.symmetric).map((type) => type.id)
  ]);

  const usedIds = new Set<string>();
  const seenLinks = new Set<string>();
  const relations: WbRelation[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const sourceId = typeof entry.sourceId === 'string' ? entry.sourceId : '';
    const targetId = typeof entry.targetId === 'string' ? entry.targetId : '';

    if (
      !sourceId ||
      !targetId ||
      sourceId === targetId ||
      !hasOwn(world, sourceId) ||
      !hasOwn(world, targetId)
    ) {
      continue;
    }

    const rawTypeId = cleanLine(entry.typeId, MAX_KEY_LENGTH);
    const typeId = typeIdMap.get(rawTypeId) ?? rawTypeId;

    if (!typeId) {
      continue;
    }

    /*
     * Pour une relation symétrique, « A ami de B » et « B ami de A » sont la
     * même relation.
     */
    const pair =
      symmetricIds.has(typeId) && targetId < sourceId
        ? targetId + '|' + sourceId
        : sourceId + '|' + targetId;

    const linkKey = pair + '|' + typeId;

    if (seenLinks.has(linkKey)) {
      continue;
    }

    seenLinks.add(linkKey);

    const relation: WbRelation = {
      id: uniqueId(entry.id, usedIds, 'wbr'),
      sourceId,
      targetId,
      typeId
    };

    const note = cleanText(entry.note, LIMITS.note).trim();

    if (note) {
      relation.note = note;
    }

    relations.push(relation);
  }

  return relations;
}

// ============================================================================
// FRISE CHRONOLOGIQUE
// ============================================================================

function normalizeTimeline(value: unknown, world: Record<string, WbItem>): WbTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();
  const events: WbTimelineEvent[] = [];

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    const itemIds: string[] = [];

    if (Array.isArray(entry.itemIds)) {
      entry.itemIds.forEach((itemId) => {
        if (typeof itemId === 'string' && hasOwn(world, itemId) && !itemIds.includes(itemId)) {
          itemIds.push(itemId);
        }
      });
    }

    const event: WbTimelineEvent = {
      id: uniqueId(entry.id, usedIds, 'wbe'),
      title: cleanLine(entry.title, LIMITS.name),
      dateLabel: cleanLine(entry.dateLabel, LIMITS.dateLabel),
      sortKey: cleanSortKey(entry.sortKey, index),
      description: cleanText(entry.description, LIMITS.description),
      itemIds,

      /*
       * Un chapitre absent est ignoré à l'affichage plutôt que supprimé :
       * il peut s'agir d'un chapitre renommé en cours de route.
       */
      chapterNames: cleanList(entry.chapterNames, LIMITS.maxChapterLinks, LIMITS.name, false)
    };

    const color = cleanColor(entry.color);

    if (color) {
      event.color = color;
    }

    events.push(event);
  });

  return events;
}

// ============================================================================
// MENTIONS DANS LE TEXTE
// ============================================================================

/**
 * Retourne l'identifiant à placer dans `data-wb-key`, ou `null` si la
 * mention ne correspond à aucune fiche (elle est alors retirée, son texte
 * étant conservé).
 */
export type MentionKeyResolver = (key: string) => string | null;

/**
 * Examen rapide, sans analyser le HTML : la réécriture n'a lieu que si au
 * moins une mention doit changer.
 */
function htmlNeedsMentionRewrite(html: string, resolve: MentionKeyResolver): boolean {
  if (html.indexOf('data-wb-key') === -1) {
    return false;
  }

  const pattern = /data-wb-key="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (resolve(match[1]) !== match[1]) {
      return true;
    }
  }

  return false;
}

/**
 * Met à jour les clés des mentions d'un fragment HTML.
 *
 * Un élément `template` est utilisé : son contenu n'est jamais exécuté ni
 * affiché, ce qui rend l'opération sûre.
 */
export function rewriteMentionKeys(html: string, resolve: MentionKeyResolver): string {
  if (typeof html !== 'string' || !htmlNeedsMentionRewrite(html, resolve)) {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  let modified = false;

  template.content.querySelectorAll<HTMLElement>('span[data-wb-key]').forEach((span) => {
    const oldKey = span.getAttribute('data-wb-key') ?? '';
    const newKey = resolve(oldKey);

    if (newKey === oldKey) {
      return;
    }

    modified = true;

    if (newKey) {
      span.setAttribute('data-wb-key', newKey);
      return;
    }

    /*
     * Mention orpheline : on garde le texte, on retire l'habillage.
     */
    const parent = span.parentNode;

    if (!parent) {
      return;
    }

    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }

    parent.removeChild(span);
  });

  return modified ? template.innerHTML : html;
}

/**
 * Applique la réécriture aux chapitres et aux scènes de scénario.
 *
 * Retourne `true` si au moins un texte a changé.
 */
function rewriteProjectMentions(data: ProjectData, resolve: MentionKeyResolver): boolean {
  let changed = false;

  const rewrite = (html: string): string => {
    const result = rewriteMentionKeys(html, resolve);

    if (result !== html) {
      changed = true;
    }

    return result;
  };

  if (isRecord(data.chapters)) {
    Object.keys(data.chapters).forEach((chapterName) => {
      data.chapters[chapterName] = rewrite(data.chapters[chapterName]);
    });
  }

  const screenplay = data.screenplay;

  if (screenplay && Array.isArray(screenplay.scenes)) {
    screenplay.scenes.forEach((scene) => {
      if (!scene) {
        return;
      }

      if (scene.heading && scene.heading.mode === 'free') {
        scene.heading.html = rewrite(scene.heading.html);
      }

      if (Array.isArray(scene.elements)) {
        scene.elements.forEach((element) => {
          if (element) {
            element.html = rewrite(element.html);
          }
        });
      }
    });
  }

  return changed;
}

// ============================================================================
// POINT D'ENTRÉE : UN PROJET
// ============================================================================

export interface WbPreparationResult {
  /** Copie du projet, convertie et vérifiée. */
  data: ProjectData;

  /** Le projet était au format 1 : une sauvegarde est recommandée. */
  upgraded: boolean;

  /** Le projet doit être enregistré. */
  changed: boolean;
}

export function needsWbUpgrade(data: ProjectData): boolean {
  return !(typeof data.wbFormat === 'number' && data.wbFormat >= WB_FORMAT_VERSION);
}

function pickWorldBuilding(data: ProjectData): UnknownRecord {
  return {
    wbFormat: data.wbFormat,
    world: data.world,
    wbCategories: data.wbCategories,
    wbFolders: data.wbFolders,
    wbRelationTypes: data.wbRelationTypes,
    wbRelations: data.wbRelations,
    wbTimeline: data.wbTimeline,
    customWbTypes: data.customWbTypes
  };
}

/**
 * Convertit (si nécessaire) et vérifie le World Building d'un projet.
 *
 * Le projet reçu n'est jamais modifié.
 */
export function prepareWorldBuilding(
  source: ProjectData,
  lang: LanguageCode
): WbPreparationResult {
  const upgraded = needsWbUpgrade(source);
  const before = upgraded ? '' : stableStringify(pickWorldBuilding(source));

  const data = structuredClone(source) as ProjectData;
  const untitled = pickText(WB_UNTITLED_NAME, lang);
  const now = new Date().toISOString();
  const keyMap = new Map<string, string>();

  let categories: Record<string, WbCategoryDef>;
  let world: Record<string, WbItem>;
  let resolve: MentionKeyResolver;

  if (upgraded) {
    categories = convertLegacyCategories(data.customWbTypes);
    world = convertLegacyWorld(data.world, untitled, now, keyMap);

    /*
     * Les anciennes mentions contiennent le nom de la fiche, parfois avec
     * une casse différente.
     */
    const lowerMap = new Map<string, string>();

    Object.values(world).forEach((item) => {
      const lower = item.name.trim().toLocaleLowerCase();

      if (!lowerMap.has(lower)) {
        lowerMap.set(lower, item.id);
      }
    });

    resolve = (key) => keyMap.get(key) ?? lowerMap.get(key.trim().toLocaleLowerCase()) ?? null;
  } else {
    categories = normalizeCategories(data.wbCategories);
    world = normalizeWorld(data.world, untitled, now, keyMap);

    resolve = (key) => (hasOwn(world, key) ? key : keyMap.get(key) ?? null);
  }

  ensureCategoriesForItems(world, categories);

  const folders = upgraded ? [] : normalizeFolders(data.wbFolders, categories);
  fixItemFolders(world, folders);

  const typeIdMap = new Map<string, string>();

  const relationTypes = upgraded ? [] : normalizeRelationTypes(data.wbRelationTypes, typeIdMap);

  const relations = upgraded
    ? []
    : normalizeRelations(data.wbRelations, world, relationTypes, typeIdMap);

  const timeline = upgraded ? [] : normalizeTimeline(data.wbTimeline, world);

  const mentionsChanged = rewriteProjectMentions(data, resolve);

  data.wbFormat = WB_FORMAT_VERSION;
  data.world = world;
  data.wbCategories = categories;
  data.wbFolders = folders;
  data.wbRelationTypes = relationTypes;
  data.wbRelations = relations;
  data.wbTimeline = timeline;
  delete data.customWbTypes;

  const changed =
    upgraded || mentionsChanged || stableStringify(pickWorldBuilding(data)) !== before;

  return { data, upgraded, changed };
}

// ============================================================================
// POINT D'ENTRÉE : TOUS LES PROJETS
// ============================================================================

export interface WbProjectsPreparationResult {
  /** Projets convertis et vérifiés. */
  projects: ProjectsMap;

  /** Version d'origine des projets convertis, pour la sauvegarde. */
  originals: Record<string, ProjectData>;

  /** Noms des projets modifiés, à enregistrer. */
  changedNames: string[];
}

export function prepareAllProjects(
  projects: ProjectsMap,
  lang: LanguageCode
): WbProjectsPreparationResult {
  const result: ProjectsMap = {};
  const originals: Record<string, ProjectData> = {};
  const changedNames: string[] = [];

  Object.entries(projects).forEach(([projectName, projectData]) => {
    if (!isRecord(projectData)) {
      result[projectName] = projectData;
      return;
    }

    const prepared = prepareWorldBuilding(projectData, lang);

    result[projectName] = prepared.data;

    if (prepared.upgraded) {
      originals[projectName] = projectData;
    }

    if (prepared.changed) {
      changedNames.push(projectName);
    }
  });

  return { projects: result, originals, changedNames };
}

// ============================================================================
// ONGLETS
// ============================================================================

/**
 * Reconnecte les onglets de fiches à leur identifiant.
 *
 * Un onglet ouvert sous l'ancien nom (format 1) retrouve sa fiche ; un
 * onglet dont la fiche n'existe plus est fermé. Le projet doit avoir été
 * préparé auparavant (prepareWorldBuilding).
 */
export function migrateUiTabs(
  ui: ProjectUiState,
  data: ProjectData
): { ui: ProjectUiState; changed: boolean } {
  const world = isRecord(data.world) ? data.world : {};
  let changed = false;

  const resolveTab = (name: string): string | null => {
    if (hasOwn(world, name)) {
      return name;
    }

    return findWbItemByName(world, name)?.id ?? null;
  };

  const seen = new Set<string>();
  const openTabs: TabRef[] = [];

  (Array.isArray(ui.openTabs) ? ui.openTabs : []).forEach((tab) => {
    if (!tab || typeof tab.name !== 'string') {
      changed = true;
      return;
    }

    let name = tab.name;

    if (tab.type === 'world') {
      const resolved = resolveTab(name);

      if (!resolved) {
        changed = true;
        return;
      }

      if (resolved !== name) {
        changed = true;
        name = resolved;
      }
    }

    const tabKey = tab.type + '|' + name;

    if (seen.has(tabKey)) {
      changed = true;
      return;
    }

    seen.add(tabKey);
    openTabs.push({ name, type: tab.type });
  });

  let activeTab = ui.activeTab;
  let activeType = ui.activeType;

  if (activeType === 'world' && typeof activeTab === 'string') {
    const resolved = resolveTab(activeTab);

    if (resolved !== activeTab) {
      changed = true;
      activeTab = resolved;
    }

    if (activeTab === null) {
      const fallback = openTabs[openTabs.length - 1];

      activeTab = fallback ? fallback.name : null;
      activeType = fallback ? fallback.type : 'chapter';
    }
  }

  if (!changed) {
    return { ui, changed: false };
  }

  return {
    ui: { ...ui, openTabs, activeTab, activeType },
    changed: true
  };
}
