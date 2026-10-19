// src/renderer/lib/wb-config.ts
// Constantes de configuration du "World Building" (personnages, lieux...).
// Isolé dans son propre module car ce sont des données statiques, réutilisées
// à plusieurs endroits (rendu de l'éditeur, sidebar, formulaires de fiches,
// migration des anciens projets).
//
// Contenu :
// - catégories d'origine (libellés et champs bilingues) ;
// - modèles de catégories prêts à l'emploi ;
// - types de relations intégrés ;
// - palettes de couleurs et d'icônes.

import type {
  BuiltinWbType,
  LanguageCode,
  WbCategoryDef,
  WbField,
  WbFieldType,
  WbRelationKind,
  WbRelationTypeDef,
  WbTemplate
} from '../../shared/types';

// ============================================================================
// TEXTES BILINGUES
// ============================================================================

export interface LocalizedText {
  fr: string;
  en: string;
}

export function pickText(text: LocalizedText, lang: LanguageCode): string {
  return lang === 'en' ? text.en : text.fr;
}

/** Nom donné à une fiche dont le nom est vide. */
export const WB_UNTITLED_NAME: LocalizedText = { fr: 'Sans nom', en: 'Untitled' };

// ============================================================================
// CATÉGORIES D'ORIGINE
// ============================================================================

export const BUILTIN_WB_TYPES: BuiltinWbType[] = ['character', 'place', 'object', 'other'];

export function isBuiltinWbType(value: unknown): value is BuiltinWbType {
  return typeof value === 'string' && BUILTIN_WB_TYPES.includes(value as BuiltinWbType);
}

export interface WbConfigEntry {
  label: string;
  colorClass: string;
  icon: string;
}

export const WB_CONFIG: Record<BuiltinWbType, WbConfigEntry> = {
  character: { label: 'Personnage', colorClass: 'type-character', icon: '👤' },
  place: { label: 'Lieu', colorClass: 'type-place', icon: '🏰' },
  object: { label: 'Objet', colorClass: 'type-object', icon: '💎' },
  other: { label: 'Autre', colorClass: 'type-other', icon: '📝' }
};

export const WB_BUILTIN_LABELS: Record<BuiltinWbType, LocalizedText> = {
  character: { fr: 'Personnage', en: 'Character' },
  place: { fr: 'Lieu', en: 'Place' },
  object: { fr: 'Objet', en: 'Object' },
  other: { fr: 'Autre', en: 'Other' }
};

/** Couleurs par défaut par type (reprises des variables CSS --wb-*), utilisées
 *  tant qu'une fiche n'a pas de couleur personnalisée. */
export const WB_DEFAULT_COLORS: Record<BuiltinWbType, string> = {
  character: '#ef4444',
  place: '#10b981',
  object: '#3b82f6',
  other: '#a855f7'
};

export const WB_FALLBACK_COLOR = '#94a3b8';

export const WB_FALLBACK_ICON = '📄';

export interface WbBuiltinFieldDef {
  key: string;
  type: WbFieldType;
  label: LocalizedText;
}

/**
 * Champs des catégories d'origine.
 *
 * Les clés sont identiques à celles des anciennes versions : les fiches
 * existantes conservent donc toutes leurs valeurs.
 */
export const WB_BUILTIN_FIELDS: Record<BuiltinWbType, WbBuiltinFieldDef[]> = {
  character: [
    { key: 'firstname', type: 'text', label: { fr: 'Prénom', en: 'First name' } },
    { key: 'lastname', type: 'text', label: { fr: 'Nom', en: 'Last name' } },
    { key: 'age', type: 'text', label: { fr: 'Âge', en: 'Age' } },
    { key: 'home', type: 'text', label: { fr: 'Habitation', en: 'Residence' } },
    { key: 'family', type: 'textarea', label: { fr: 'Famille', en: 'Family' } },
    { key: 'physical', type: 'textarea', label: { fr: 'Physique', en: 'Appearance' } },
    {
      key: 'moral',
      type: 'textarea',
      label: { fr: 'Moral / Psychologie', en: 'Personality / Psychology' }
    },
    {
      key: 'background',
      type: 'textarea',
      label: { fr: 'Histoire / Background', en: 'History / Background' }
    },
    { key: 'notes', type: 'textarea', label: { fr: 'Notes libres', en: 'Free notes' } }
  ],
  place: [
    { key: 'type', type: 'text', label: { fr: 'Type de lieu', en: 'Place type' } },
    { key: 'location', type: 'text', label: { fr: 'Localisation', en: 'Location' } },
    {
      key: 'description',
      type: 'textarea',
      label: { fr: 'Description visuelle', en: 'Visual description' }
    },
    {
      key: 'atmosphere',
      type: 'textarea',
      label: { fr: 'Atmosphère / Ambiance', en: 'Atmosphere / Mood' }
    },
    { key: 'history', type: 'textarea', label: { fr: 'Histoire', en: 'History' } },
    {
      key: 'inhabitants',
      type: 'textarea',
      label: { fr: 'Habitants / Faune', en: 'Inhabitants / Wildlife' }
    },
    { key: 'notes', type: 'textarea', label: { fr: 'Notes', en: 'Notes' } }
  ],
  object: [
    { key: 'type', type: 'text', label: { fr: "Type d'objet", en: 'Object type' } },
    { key: 'owner', type: 'text', label: { fr: 'Propriétaire', en: 'Owner' } },
    { key: 'description', type: 'textarea', label: { fr: 'Description', en: 'Description' } },
    { key: 'power', type: 'textarea', label: { fr: 'Pouvoir / Utilité', en: 'Power / Use' } },
    {
      key: 'history',
      type: 'textarea',
      label: { fr: 'Origine / Histoire', en: 'Origin / History' }
    },
    { key: 'notes', type: 'textarea', label: { fr: 'Notes', en: 'Notes' } }
  ],
  other: [
    {
      key: 'description',
      type: 'textarea',
      label: { fr: 'Description libre', en: 'Free description' }
    }
  ]
};

function buildLegacyTemplates(): Record<BuiltinWbType, WbTemplate> {
  const templates = {} as Record<BuiltinWbType, WbTemplate>;

  for (const type of BUILTIN_WB_TYPES) {
    templates[type] = {
      icon: WB_CONFIG[type].icon,
      label: WB_BUILTIN_LABELS[type].fr,
      fields: WB_BUILTIN_FIELDS[type].map((field) => ({
        key: field.key,
        label: field.label.fr,
        type: field.type
      }))
    };
  }

  return templates;
}

/**
 * Gabarits historiques (libellés français).
 *
 * Conservés pour la compatibilité du code existant et pour la migration.
 */
export const WB_TEMPLATES: Record<BuiltinWbType, WbTemplate> = buildLegacyTemplates();

/**
 * Crée la définition d'une catégorie d'origine.
 *
 * Les libellés sont laissés vides : ils sont alors traduits à l'affichage
 * dans la langue de l'interface (voir resolveCategoryLabel et
 * resolveFieldLabel). Dès que l'auteur les modifie, sa valeur est conservée.
 */
export function createBuiltinCategory(type: BuiltinWbType): WbCategoryDef {
  return {
    label: '',
    icon: WB_CONFIG[type].icon,
    color: WB_DEFAULT_COLORS[type],
    fields: WB_BUILTIN_FIELDS[type].map((field) => ({
      key: field.key,
      label: '',
      type: field.type
    })),
    builtin: type
  };
}

/**
 * Catégories présentes dans un nouveau projet, dans l'ordre d'affichage.
 */
export function createDefaultCategories(): Record<string, WbCategoryDef> {
  const categories: Record<string, WbCategoryDef> = {};

  for (const type of BUILTIN_WB_TYPES) {
    categories[type] = createBuiltinCategory(type);
  }

  return categories;
}

/**
 * Libellé affiché d'une catégorie.
 */
export function resolveCategoryLabel(
  category: WbCategoryDef | undefined,
  slug: string,
  lang: LanguageCode
): string {
  const label = category?.label.trim() ?? '';

  if (label) {
    return label;
  }

  if (category?.builtin) {
    return pickText(WB_BUILTIN_LABELS[category.builtin], lang);
  }

  if (isBuiltinWbType(slug)) {
    return pickText(WB_BUILTIN_LABELS[slug], lang);
  }

  return slug;
}

/**
 * Libellé affiché d'un champ.
 *
 * Pour une catégorie d'origine, un libellé vide (ou égal à la clé, valeur de
 * repli appliquée lors d'un import) est remplacé par la traduction.
 */
export function resolveFieldLabel(
  category: WbCategoryDef | undefined,
  field: WbField,
  lang: LanguageCode
): string {
  const label = field.label.trim();

  if (category?.builtin && (label === '' || label === field.key)) {
    const builtinField = WB_BUILTIN_FIELDS[category.builtin].find(
      (entry) => entry.key === field.key
    );

    if (builtinField) {
      return pickText(builtinField.label, lang);
    }
  }

  return label || field.key;
}

// ============================================================================
// TYPES DE CHAMPS
// ============================================================================

export const WB_FIELD_TYPES: WbFieldType[] = ['text', 'textarea', 'number', 'select', 'reference'];

export const WB_FIELD_TYPE_LABELS: Record<WbFieldType, LocalizedText> = {
  text: { fr: 'Texte court', en: 'Short text' },
  textarea: { fr: 'Texte long', en: 'Long text' },
  number: { fr: 'Nombre', en: 'Number' },
  select: { fr: 'Liste de choix', en: 'Choice list' },
  reference: { fr: 'Lien vers une fiche', en: 'Link to an entry' }
};

// ============================================================================
// MODÈLES DE CATÉGORIES PRÊTS À L'EMPLOI
// ============================================================================

export interface WbPresetField {
  key: string;
  type: WbFieldType;
  label: LocalizedText;
  options?: LocalizedText[];
  referenceCategory?: string;
}

export interface WbCategoryPreset {
  id: string;
  icon: string;
  color: string;
  label: LocalizedText;
  description: LocalizedText;
  fields: WbPresetField[];
}

function presetField(
  key: string,
  type: WbFieldType,
  fr: string,
  en: string,
  extra: Partial<Pick<WbPresetField, 'options' | 'referenceCategory'>> = {}
): WbPresetField {
  return { key, type, label: { fr, en }, ...extra };
}

function choices(...pairs: [string, string][]): LocalizedText[] {
  return pairs.map(([fr, en]) => ({ fr, en }));
}

const NOTES_FIELD = presetField('notes', 'textarea', 'Notes', 'Notes');

export const WB_CATEGORY_PRESETS: WbCategoryPreset[] = [
  {
    id: 'faction',
    icon: '🏴',
    color: '#f59e0b',
    label: { fr: 'Faction / Organisation', en: 'Faction / Organization' },
    description: {
      fr: 'Guildes, ordres, royaumes, sectes, entreprises…',
      en: 'Guilds, orders, kingdoms, cults, companies…'
    },
    fields: [
      presetField('kind', 'select', 'Type', 'Type', {
        options: choices(
          ['Guilde', 'Guild'],
          ['Ordre', 'Order'],
          ['Royaume / État', 'Kingdom / State'],
          ['Secte', 'Cult'],
          ['Entreprise', 'Company'],
          ['Armée', 'Army'],
          ['Famille / Clan', 'Family / Clan'],
          ['Autre', 'Other']
        )
      }),
      presetField('leader', 'reference', 'Chef', 'Leader', { referenceCategory: 'character' }),
      presetField('headquarters', 'reference', 'Quartier général', 'Headquarters', {
        referenceCategory: 'place'
      }),
      presetField('goals', 'textarea', 'Objectifs', 'Goals'),
      presetField('members', 'textarea', 'Membres notables', 'Notable members'),
      presetField('resources', 'textarea', 'Ressources / Influence', 'Resources / Influence'),
      presetField('history', 'textarea', 'Histoire', 'History'),
      NOTES_FIELD
    ]
  },
  {
    id: 'creature',
    icon: '🐉',
    color: '#84cc16',
    label: { fr: 'Créature / Espèce', en: 'Creature / Species' },
    description: {
      fr: 'Animaux, monstres, races et espèces de ton monde.',
      en: 'Animals, monsters, races and species of your world.'
    },
    fields: [
      presetField('habitat', 'reference', 'Habitat', 'Habitat', { referenceCategory: 'place' }),
      presetField('size', 'text', 'Taille', 'Size'),
      presetField('lifespan', 'number', 'Espérance de vie (années)', 'Lifespan (years)'),
      presetField('diet', 'text', 'Alimentation', 'Diet'),
      presetField('danger', 'select', 'Niveau de danger', 'Danger level', {
        options: choices(
          ['Inoffensif', 'Harmless'],
          ['Faible', 'Low'],
          ['Moyen', 'Medium'],
          ['Élevé', 'High'],
          ['Mortel', 'Deadly']
        )
      }),
      presetField('appearance', 'textarea', 'Apparence', 'Appearance'),
      presetField('abilities', 'textarea', 'Capacités', 'Abilities'),
      presetField('behavior', 'textarea', 'Comportement', 'Behavior'),
      NOTES_FIELD
    ]
  },
  {
    id: 'magic',
    icon: '🔮',
    color: '#8b5cf6',
    label: { fr: 'Système de magie', en: 'Magic system' },
    description: {
      fr: 'Source, règles, coûts et limites d’un pouvoir.',
      en: 'Source, rules, costs and limits of a power.'
    },
    fields: [
      presetField('source', 'text', 'Source du pouvoir', 'Source of power'),
      presetField('practitioners', 'textarea', 'Qui peut l’utiliser', 'Who can use it'),
      presetField('rules', 'textarea', 'Règles', 'Rules'),
      presetField('costs', 'textarea', 'Coût / Contrepartie', 'Cost / Price'),
      presetField('limits', 'textarea', 'Limites', 'Limits'),
      presetField('perception', 'textarea', 'Perception par la société', 'How society sees it'),
      NOTES_FIELD
    ]
  },
  {
    id: 'culture',
    icon: '🎭',
    color: '#ec4899',
    label: { fr: 'Peuple / Culture', en: 'People / Culture' },
    description: {
      fr: 'Peuples, nations et coutumes.',
      en: 'Peoples, nations and customs.'
    },
    fields: [
      presetField('region', 'reference', 'Région', 'Region', { referenceCategory: 'place' }),
      presetField('language', 'text', 'Langue', 'Language'),
      presetField('religion', 'text', 'Religion', 'Religion'),
      presetField('government', 'text', 'Gouvernement', 'Government'),
      presetField('values', 'textarea', 'Valeurs', 'Values'),
      presetField('customs', 'textarea', 'Coutumes / Traditions', 'Customs / Traditions'),
      presetField('appearance', 'textarea', 'Apparence / Vêtements', 'Appearance / Clothing'),
      NOTES_FIELD
    ]
  },
  {
    id: 'religion',
    icon: '⛩️',
    color: '#eab308',
    label: { fr: 'Religion / Croyance', en: 'Religion / Belief' },
    description: {
      fr: 'Divinités, dogmes, rites et clergé.',
      en: 'Deities, doctrine, rites and clergy.'
    },
    fields: [
      presetField('deities', 'textarea', 'Divinités', 'Deities'),
      presetField('doctrine', 'textarea', 'Dogme / Enseignements', 'Doctrine / Teachings'),
      presetField('rites', 'textarea', 'Rites / Fêtes', 'Rites / Holidays'),
      presetField('clergy', 'textarea', 'Clergé', 'Clergy'),
      presetField('holyPlaces', 'textarea', 'Lieux sacrés', 'Holy places'),
      presetField('followers', 'textarea', 'Fidèles', 'Followers'),
      NOTES_FIELD
    ]
  },
  {
    id: 'language',
    icon: '🗣️',
    color: '#06b6d4',
    label: { fr: 'Langue', en: 'Language' },
    description: {
      fr: 'Langues inventées, dialectes, écritures.',
      en: 'Invented languages, dialects, scripts.'
    },
    fields: [
      presetField('speakers', 'textarea', 'Locuteurs', 'Speakers'),
      presetField('writing', 'text', 'Système d’écriture', 'Writing system'),
      presetField('sound', 'textarea', 'Sonorités / Prononciation', 'Sound / Pronunciation'),
      presetField('grammar', 'textarea', 'Grammaire', 'Grammar'),
      presetField('vocabulary', 'textarea', 'Lexique', 'Vocabulary'),
      NOTES_FIELD
    ]
  },
  {
    id: 'event',
    icon: '📅',
    color: '#f97316',
    label: { fr: 'Événement historique', en: 'Historical event' },
    description: {
      fr: 'Guerres, catastrophes, fondations, découvertes…',
      en: 'Wars, disasters, foundings, discoveries…'
    },
    fields: [
      presetField('date', 'text', 'Date', 'Date'),
      presetField('place', 'reference', 'Lieu', 'Place', { referenceCategory: 'place' }),
      presetField('participants', 'textarea', 'Participants', 'Participants'),
      presetField('causes', 'textarea', 'Causes', 'Causes'),
      presetField('course', 'textarea', 'Déroulement', 'What happened'),
      presetField('consequences', 'textarea', 'Conséquences', 'Consequences'),
      NOTES_FIELD
    ]
  },
  {
    id: 'legend',
    icon: '📜',
    color: '#a16207',
    label: { fr: 'Légende / Mythe', en: 'Legend / Myth' },
    description: {
      fr: 'Récits, prophéties et rumeurs de ton monde.',
      en: 'Tales, prophecies and rumors of your world.'
    },
    fields: [
      presetField('origin', 'text', 'Origine', 'Origin'),
      presetField('tellers', 'textarea', 'Qui la raconte', 'Who tells it'),
      presetField('story', 'textarea', 'Récit', 'Story'),
      presetField('truth', 'textarea', 'Part de vérité', 'Grain of truth'),
      NOTES_FIELD
    ]
  },
  {
    id: 'technology',
    icon: '⚙️',
    color: '#64748b',
    label: { fr: 'Technologie / Invention', en: 'Technology / Invention' },
    description: {
      fr: 'Machines, inventions, savoirs techniques.',
      en: 'Machines, inventions, technical knowledge.'
    },
    fields: [
      presetField('inventor', 'reference', 'Inventeur', 'Inventor', {
        referenceCategory: 'character'
      }),
      presetField('era', 'text', 'Époque', 'Era'),
      presetField('availability', 'select', 'Diffusion', 'Availability', {
        options: choices(
          ['Unique', 'Unique'],
          ['Rare', 'Rare'],
          ['Répandue', 'Common'],
          ['Perdue', 'Lost']
        )
      }),
      presetField('functioning', 'textarea', 'Fonctionnement', 'How it works'),
      presetField('impact', 'textarea', 'Impact sur le monde', 'Impact on the world'),
      NOTES_FIELD
    ]
  },
  {
    id: 'vehicle',
    icon: '🚀',
    color: '#0ea5e9',
    label: { fr: 'Véhicule / Monture', en: 'Vehicle / Mount' },
    description: {
      fr: 'Vaisseaux, navires, montures, véhicules.',
      en: 'Ships, vessels, mounts, vehicles.'
    },
    fields: [
      presetField('kind', 'text', 'Type', 'Type'),
      presetField('owner', 'reference', 'Propriétaire', 'Owner', {
        referenceCategory: 'character'
      }),
      presetField('capacity', 'text', 'Capacité', 'Capacity'),
      presetField('speed', 'text', 'Vitesse', 'Speed'),
      presetField('description', 'textarea', 'Description', 'Description'),
      NOTES_FIELD
    ]
  }
];

/**
 * Crée une catégorie à partir d'un modèle, dans la langue de l'interface.
 *
 * Les libellés sont recopiés : l'auteur peut ensuite les modifier librement.
 */
export function createCategoryFromPreset(
  preset: WbCategoryPreset,
  lang: LanguageCode
): WbCategoryDef {
  return {
    label: pickText(preset.label, lang),
    icon: preset.icon,
    color: preset.color,
    presetId: preset.id,
    fields: preset.fields.map((field) => {
      const result: WbField = {
        key: field.key,
        label: pickText(field.label, lang),
        type: field.type
      };

      if (field.options) {
        result.options = field.options.map((option) => pickText(option, lang));
      }

      if (field.referenceCategory) {
        result.referenceCategory = field.referenceCategory;
      }

      return result;
    })
  };
}

// ============================================================================
// RELATIONS
// ============================================================================

/**
 * Rôle d'une relation dans l'arbre généalogique.
 *
 * - `parent` : la source est parent de la cible ;
 * - `partner` : conjoints ou couple ;
 * - `sibling` : frères et sœurs.
 */
export type WbTreeRole = 'parent' | 'partner' | 'sibling';

export interface WbBuiltinRelationType {
  id: string;

  /** Libellé vu depuis la source, préposition comprise (« Parent de »). */
  label: LocalizedText;

  /** Libellé vu depuis la cible (« Enfant de »). */
  inverseLabel: LocalizedText;

  symmetric: boolean;
  kind: WbRelationKind;
  treeRole?: WbTreeRole;
}

function symmetricRelation(
  id: string,
  fr: string,
  en: string,
  kind: WbRelationKind,
  treeRole?: WbTreeRole
): WbBuiltinRelationType {
  const label = { fr, en };

  return { id, label, inverseLabel: label, symmetric: true, kind, treeRole };
}

function directedRelation(
  id: string,
  label: LocalizedText,
  inverseLabel: LocalizedText,
  kind: WbRelationKind,
  treeRole?: WbTreeRole
): WbBuiltinRelationType {
  return { id, label, inverseLabel, symmetric: false, kind, treeRole };
}

/**
 * Types de relations intégrés.
 *
 * Leurs identifiants commencent par `rel-` ; ceux créés par l'auteur sont des
 * identifiants aléatoires, ce qui évite toute collision.
 */
export const WB_BUILTIN_RELATION_TYPES: WbBuiltinRelationType[] = [
  // Famille
  directedRelation(
    'rel-parent',
    { fr: 'Parent de', en: 'Parent of' },
    { fr: 'Enfant de', en: 'Child of' },
    'family',
    'parent'
  ),
  symmetricRelation('rel-spouse', 'Conjoint(e) de', 'Spouse of', 'family', 'partner'),
  symmetricRelation('rel-partner', 'En couple avec', 'In a relationship with', 'family', 'partner'),
  symmetricRelation('rel-sibling', 'Frère ou sœur de', 'Sibling of', 'family', 'sibling'),
  symmetricRelation('rel-relative', 'Apparenté(e) à', 'Related to', 'family'),

  // Relations sociales
  symmetricRelation('rel-friend', 'Ami(e) de', 'Friend of', 'social'),
  symmetricRelation('rel-ally', 'Allié(e) de', 'Ally of', 'social'),
  symmetricRelation('rel-enemy', 'Ennemi(e) de', 'Enemy of', 'social'),
  symmetricRelation('rel-rival', 'Rival(e) de', 'Rival of', 'social'),
  directedRelation(
    'rel-love',
    { fr: 'Amoureux(se) de', en: 'In love with' },
    { fr: 'Aimé(e) par', en: 'Loved by' },
    'social'
  ),
  directedRelation(
    'rel-mentor',
    { fr: 'Mentor de', en: 'Mentor of' },
    { fr: 'Élève de', en: 'Student of' },
    'social'
  ),
  directedRelation(
    'rel-master',
    { fr: 'Maître de', en: 'Master of' },
    { fr: 'Au service de', en: 'Serves' },
    'social'
  ),
  directedRelation(
    'rel-leader',
    { fr: 'Dirige', en: 'Leads' },
    { fr: 'Dirigé(e) par', en: 'Led by' },
    'social'
  ),
  directedRelation(
    'rel-member',
    { fr: 'Membre de', en: 'Member of' },
    { fr: 'Compte parmi ses membres', en: 'Has as member' },
    'social'
  ),

  // Lieux et objets
  directedRelation(
    'rel-located',
    { fr: 'Situé(e) dans', en: 'Located in' },
    { fr: 'Contient', en: 'Contains' },
    'other'
  ),
  directedRelation(
    'rel-origin',
    { fr: 'Originaire de', en: 'Comes from' },
    { fr: "Lieu d'origine de", en: 'Homeland of' },
    'other'
  ),
  directedRelation(
    'rel-owner',
    { fr: 'Possède', en: 'Owns' },
    { fr: 'Appartient à', en: 'Belongs to' },
    'other'
  ),
  directedRelation(
    'rel-creator',
    { fr: 'Créateur de', en: 'Creator of' },
    { fr: 'Créé(e) par', en: 'Created by' },
    'other'
  )
];

export const WB_RELATION_KIND_LABELS: Record<WbRelationKind, LocalizedText> = {
  family: { fr: 'Famille', en: 'Family' },
  social: { fr: 'Relations', en: 'Relationships' },
  other: { fr: 'Autres liens', en: 'Other links' }
};

/**
 * Type de relation prêt à l'affichage (intégré ou créé par l'auteur).
 */
export interface ResolvedRelationType extends WbRelationTypeDef {
  builtin: boolean;
  treeRole?: WbTreeRole;
}

/**
 * Liste complète des types de relations, dans la langue de l'interface.
 *
 * Les types de l'auteur dont l'identifiant entrerait en collision avec un
 * type intégré sont ignorés.
 */
export function resolveRelationTypes(
  custom: WbRelationTypeDef[] | undefined,
  lang: LanguageCode
): ResolvedRelationType[] {
  const builtinIds = new Set(WB_BUILTIN_RELATION_TYPES.map((type) => type.id));

  const builtin: ResolvedRelationType[] = WB_BUILTIN_RELATION_TYPES.map((type) => ({
    id: type.id,
    label: pickText(type.label, lang),
    inverseLabel: pickText(type.inverseLabel, lang),
    symmetric: type.symmetric,
    kind: type.kind,
    treeRole: type.treeRole,
    builtin: true
  }));

  const own: ResolvedRelationType[] = (custom ?? [])
    .filter((type) => !builtinIds.has(type.id))
    .map((type) => ({ ...type, builtin: false }));

  return [...builtin, ...own];
}

/**
 * Libellé d'une relation selon le point de vue.
 *
 * `fromSource` vaut `true` quand on regarde la relation depuis sa source.
 */
export function relationLabelFrom(type: ResolvedRelationType, fromSource: boolean): string {
  if (type.symmetric || fromSource) {
    return type.label;
  }

  return type.inverseLabel;
}

// ============================================================================
// PALETTES
// ============================================================================

/** Couleurs proposées dans les sélecteurs (catégories, fiches, frise). */
export const WB_COLOR_PALETTE: string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#a16207', '#64748b'
];

export const WB_EMOJI_CHOICES: string[] = [
  // Personnages
  '👤', '👥', '🧙', '🧝', '🧝‍♀️', '🦸', '🦹', '🧛', '🧟', '🧞', '🧚', '🧜‍♀️',
  '👑', '💂', '🥷', '👸', '🤴', '👻', '💀', '👹', '👺', '🧌', '🤖', '👽',
  // Créatures / animaux
  '🐺', '🦊', '🐉', '🐲', '🦅', '🦉', '🐍', '🐴', '🦄', '🐗', '🐻', '🦁',
  '🐘', '🐬', '🦂', '🕷️', '🐸', '🦇', '🐈', '🐕', '🦌', '🐙',
  // Lieux
  '🏰', '🏯', '🏛️', '🏠', '🏚️', '⛩️', '🕌', '🕍', '🌲', '🌳', '🏞️', '🏔️',
  '🌋', '🏝️', '🌊', '🏜️', '🌾', '🌆', '🌌', '🌉', '🏙️', '🗺️', '⛰️', '🪐',
  // Objets / artefacts
  '⚔️', '🗡️', '🛡️', '🏹', '💣', '🪓', '🔱', '💍', '🔮', '📜', '📖',
  '🕯️', '💎', '🗝️', '⚰️', '🚪', '⚗️', '🧪', '🪄', '🧭', '⌛', '🪙', '🏺',
  '⚙️', '🚀', '⛵', '🛸', '📿', '🎻',
  // Groupes / cultures / concepts
  '🏴', '🚩', '⚜️', '🎭', '🗣️', '📅', '🧬', '✨',
  '🌙', '⭐', '☀️', '🔥', '❄️', '⚡', '🌪️', '☠️', '❤️', '⚖️', '📝', '❓'
];
