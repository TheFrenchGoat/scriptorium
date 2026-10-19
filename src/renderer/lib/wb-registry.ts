// src/renderer/lib/wb-registry.ts
//
// Registre du World Building.
// Point d'accès unique aux catégories, champs, icônes, couleurs et types de
// relations du projet ouvert.
//
// Les données sont lues à la demande via getProjectData(), puis mises en cache.
// Le cache se renouvelle tout seul quand :
//   - la langue de l'interface change ;
//   - l'objet wbCategories ou le tableau wbRelationTypes est remplacé.
// Après une modification « sur place » (mutation directe de ces objets),
// il faut appeler bumpVersion().
//
// Les objets renvoyés sont en lecture seule. Pour modifier les catégories :
// partir de cloneCategoryDefinitions(), modifier la copie, puis l'enregistrer
// dans le projet (data.wbCategories = copie), et appeler bumpVersion().

import type { ProjectData, WbCategoryDef, WbField, WbItem } from '../../shared/types';
import {
  WB_FALLBACK_COLOR,
  WB_FALLBACK_ICON,
  createDefaultCategories,
  relationLabelFrom,
  resolveCategoryLabel,
  resolveFieldLabel,
  resolveRelationTypes,
} from './wb-config';
import type { ResolvedRelationType } from './wb-config';

/** Langue acceptée par les fonctions de wb-config (déduite automatiquement). */
export type WbLang = NonNullable<Parameters<typeof resolveCategoryLabel>[2]>;

const DEFAULT_LANG = 'fr' as WbLang;

/** Catégorie prête à afficher. */
export interface WbCategoryInfo {
  /** Clé dans wbCategories, et valeur de WbItem.wbType. */
  slug: string;
  /** Libellé affiché (traduction automatique pour les catégories intégrées). */
  label: string;
  icon: string;
  color: string;
  /** Champs tels qu'enregistrés. Utiliser fieldLabel() pour leur libellé. */
  fields: WbField[];
  builtin: boolean;
  presetId?: string;
  /** false si la catégorie n'existe pas dans le projet (fiche orpheline). */
  known: boolean;
}

/** Forme renvoyée par templateFor(), conservée pour compatibilité. */
export interface WbTemplateView {
  fields: WbField[];
}

export type WbProjectGetter = () => ProjectData | null | undefined;
export type WbLangGetter = () => WbLang | null | undefined;

export interface WbRegistry {
  /** Numéro de version, incrémenté par bumpVersion(). */
  readonly version: number;
  /** Vide les caches après une modification sur place des catégories ou des types de relations. */
  bumpVersion(): void;
  currentLang(): WbLang;

  // Catégories
  categories(): WbCategoryInfo[];
  categorySlugs(): string[];
  hasCategory(slug: string | null | undefined): boolean;
  categoryFor(slug: string | null | undefined): WbCategoryInfo;
  labelFor(slug: string | null | undefined): string;
  isBuiltinCategory(slug: string | null | undefined): boolean;
  cloneCategoryDefinitions(): Record<string, WbCategoryDef>;

  // Champs
  fieldsFor(slug: string | null | undefined): WbField[];
  fieldLabel(slug: string | null | undefined, field: WbField): string;

  // Apparence d'une fiche (ou d'une catégorie si on passe un slug)
  iconFor(target: WbItem | string | null | undefined): string;
  colorFor(target: WbItem | string | null | undefined): string;

  // Relations
  relationTypes(): ResolvedRelationType[];
  relationType(id: string | null | undefined): ResolvedRelationType | undefined;
  relationLabel(typeId: string, fromSource: boolean): string;

  // Compatibilité avec l'ancien registre
  readonly config: Record<string, WbCategoryInfo>;
  configFor(slug: string | null | undefined): WbCategoryInfo;
  templateFor(slug: string | null | undefined): WbTemplateView;
  isCustomType(slug: string | null | undefined): boolean;
}

interface CategoryEntry {
  info: WbCategoryInfo;
  def: WbCategoryDef;
}

interface CategoryCache {
  version: number;
  lang: WbLang;
  source: ProjectData['wbCategories'];
  list: WbCategoryInfo[];
  slugs: string[];
  record: Record<string, WbCategoryInfo>;
  bySlug: Map<string, CategoryEntry>;
  orphans: Map<string, CategoryEntry>;
}

interface RelationCache {
  version: number;
  lang: WbLang;
  source: ProjectData['wbRelationTypes'];
  list: ResolvedRelationType[];
  byId: Map<string, ResolvedRelationType>;
}

// ---------------------------------------------------------------------------
// Outils internes
// ---------------------------------------------------------------------------

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function hasEntries<T>(value: Record<string, T> | null | undefined): value is Record<string, T> {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

let defaultCategoriesCache: Record<string, WbCategoryDef> | null = null;

/** Catégories par défaut, créées une seule fois (ne jamais les modifier directement). */
function getDefaultCategories(): Record<string, WbCategoryDef> {
  if (!defaultCategoriesCache) {
    const created: Record<string, WbCategoryDef> = createDefaultCategories();
    defaultCategoriesCache = created;
  }
  return defaultCategoriesCache;
}

function defaultCategoryFor(slug: string): WbCategoryDef | undefined {
  const defaults = getDefaultCategories();
  return hasOwn(defaults, slug) ? defaults[slug] : undefined;
}

function buildCategoryInfo(
  slug: string,
  def: WbCategoryDef,
  lang: WbLang,
  known: boolean,
): WbCategoryInfo {
  const fallback = defaultCategoryFor(slug);

  let icon: string = WB_FALLBACK_ICON;
  if (isFilled(def.icon)) icon = def.icon;
  else if (fallback && isFilled(fallback.icon)) icon = fallback.icon;

  let color: string = WB_FALLBACK_COLOR;
  if (isFilled(def.color)) color = def.color;
  else if (fallback && isFilled(fallback.color)) color = fallback.color;

  const label = resolveCategoryLabel(def, slug, lang);

  return {
    slug,
    label: isFilled(label) ? label : slug || '?',
    icon,
    color,
    fields: Array.isArray(def.fields) ? def.fields : [],
    builtin: Boolean(def.builtin),
    presetId: isFilled(def.presetId) ? def.presetId : undefined,
    known,
  };
}

// ---------------------------------------------------------------------------
// Couleur des mentions dans le texte
// ---------------------------------------------------------------------------

/** Opacité du soulignement des mentions (4d en hexadécimal, soit environ 30 %). */
const MENTION_BORDER_ALPHA = '4d';

/** Couleur semi-transparente utilisée pour le soulignement d'une mention. */
export function mentionBorderColor(color: string): string {
  const value = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value + MENTION_BORDER_ALPHA;
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7) + MENTION_BORDER_ALPHA;
  if (/^#[0-9a-fA-F]{3,4}$/.test(value)) {
    const r = value.charAt(1);
    const g = value.charAt(2);
    const b = value.charAt(3);
    return '#' + r + r + g + g + b + b + MENTION_BORDER_ALPHA;
  }
  return 'color-mix(in srgb, ' + value + ' 30%, transparent)';
}

/** Applique la couleur d'une fiche à une mention (texte + soulignement). */
export function applyMentionColorStyle(span: HTMLElement, color: string): void {
  const value = isFilled(color) ? color.trim() : WB_FALLBACK_COLOR;
  span.style.color = value;
  span.style.borderColor = mentionBorderColor(value);
}

/** Retire la couleur posée par applyMentionColorStyle. */
export function clearMentionColorStyle(span: HTMLElement): void {
  span.style.removeProperty('color');
  span.style.removeProperty('border-color');
}

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

export function createWbRegistry(
  getProjectData: WbProjectGetter,
  getLang?: WbLangGetter,
): WbRegistry {
  let version = 0;
  let categoryCache: CategoryCache | null = null;
  let relationCache: RelationCache | null = null;

  function currentLang(): WbLang {
    const value = getLang ? getLang() : null;
    return value || DEFAULT_LANG;
  }

  function readProject(): ProjectData | null {
    return getProjectData() || null;
  }

  function getCategoryCache(): CategoryCache {
    const data = readProject();
    const source = data ? data.wbCategories : undefined;
    const lang = currentLang();

    if (
      categoryCache &&
      categoryCache.version === version &&
      categoryCache.lang === lang &&
      categoryCache.source === source
    ) {
      return categoryCache;
    }

    // Filet de sécurité : un projet sans aucune catégorie reçoit les catégories par défaut.
    const definitions = hasEntries(source) ? source : getDefaultCategories();

    const list: WbCategoryInfo[] = [];
    const slugs: string[] = [];
    const record: Record<string, WbCategoryInfo> = {};
    const bySlug = new Map<string, CategoryEntry>();

    for (const [slug, def] of Object.entries(definitions)) {
      if (!def || typeof def !== 'object') continue;
      const info = buildCategoryInfo(slug, def, lang, true);
      list.push(info);
      slugs.push(slug);
      record[slug] = info;
      bySlug.set(slug, { info, def });
    }

    categoryCache = {
      version,
      lang,
      source,
      list,
      slugs,
      record,
      bySlug,
      orphans: new Map(),
    };
    return categoryCache;
  }

  function entryFor(slug: string | null | undefined): CategoryEntry {
    const key = typeof slug === 'string' ? slug : '';
    const cache = getCategoryCache();

    const found = cache.bySlug.get(key);
    if (found) return found;

    const orphan = cache.orphans.get(key);
    if (orphan) return orphan;

    // Catégorie absente du projet : on reprend la définition par défaut si elle existe,
    // sinon une définition minimale avec l'icône et la couleur de secours.
    const def: WbCategoryDef = defaultCategoryFor(key) || {
      label: key,
      icon: WB_FALLBACK_ICON,
      color: WB_FALLBACK_COLOR,
      fields: [],
    };
    const entry: CategoryEntry = { def, info: buildCategoryInfo(key, def, cache.lang, false) };
    cache.orphans.set(key, entry);
    return entry;
  }

  function getRelationCache(): RelationCache {
    const data = readProject();
    const source = data ? data.wbRelationTypes : undefined;
    const lang = currentLang();

    if (
      relationCache &&
      relationCache.version === version &&
      relationCache.lang === lang &&
      relationCache.source === source
    ) {
      return relationCache;
    }

    const list = resolveRelationTypes(Array.isArray(source) ? source : [], lang);
    const byId = new Map<string, ResolvedRelationType>();
    for (const type of list) {
      if (!byId.has(type.id)) byId.set(type.id, type);
    }

    relationCache = { version, lang, source, list, byId };
    return relationCache;
  }

  const registry: WbRegistry = {
    get version() {
      return version;
    },

    bumpVersion() {
      version += 1;
      categoryCache = null;
      relationCache = null;
    },

    currentLang,

    // --- Catégories --------------------------------------------------------

    categories: () => getCategoryCache().list,

    categorySlugs: () => getCategoryCache().slugs,

    hasCategory: (slug) => typeof slug === 'string' && getCategoryCache().bySlug.has(slug),

    categoryFor: (slug) => entryFor(slug).info,

    labelFor: (slug) => entryFor(slug).info.label,

    isBuiltinCategory: (slug) => entryFor(slug).info.builtin,

    cloneCategoryDefinitions() {
      const data = readProject();
      const source = data ? data.wbCategories : undefined;
      return structuredClone(hasEntries(source) ? source : getDefaultCategories());
    },

    // --- Champs ------------------------------------------------------------

    fieldsFor: (slug) => entryFor(slug).info.fields,

    fieldLabel(slug, field) {
      if (!field) return '';
      const label = resolveFieldLabel(entryFor(slug).def, field, currentLang());
      return isFilled(label) ? label : field.key || '';
    },

    // --- Apparence ---------------------------------------------------------

    iconFor(target) {
      if (target && typeof target === 'object') {
        if (isFilled(target.icon)) return target.icon;
        return entryFor(target.wbType).info.icon;
      }
      return entryFor(target).info.icon;
    },

    colorFor(target) {
      if (target && typeof target === 'object') {
        if (isFilled(target.color)) return target.color;
        return entryFor(target.wbType).info.color;
      }
      return entryFor(target).info.color;
    },

    // --- Relations ---------------------------------------------------------

    relationTypes: () => getRelationCache().list,

    relationType: (id) => (typeof id === 'string' ? getRelationCache().byId.get(id) : undefined),

    relationLabel(typeId, fromSource) {
      const type = getRelationCache().byId.get(typeId);
      return type ? relationLabelFrom(type, fromSource) : typeId;
    },

    // --- Compatibilité -----------------------------------------------------

    get config() {
      return getCategoryCache().record;
    },

    configFor: (slug) => entryFor(slug).info,

    templateFor: (slug) => ({ fields: entryFor(slug).info.fields }),

    isCustomType(slug) {
      const info = entryFor(slug).info;
      return info.known && !info.builtin;
    },
  };

  return registry;
}
