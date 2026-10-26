// Modèle de données et contrat IPC, partagés par le processus principal, le
// preload et le renderer.
//
// Toute évolution des données persistées doit être décrite ici afin que le
// processus principal, le preload et le renderer utilisent exactement les
// mêmes structures.

// ============================================================================
// WORLD BUILDING
// ============================================================================

/**
 * Version actuelle du format du World Building.
 *
 * - 1 (implicite, propriété absente) : `world` indexé par le nom de la fiche,
 *   types personnalisés dans `customWbTypes`.
 * - 2 : `world` indexé par un identifiant stable, catégories unifiées dans
 *   `wbCategories`, dossiers, étiquettes, alias, portraits, relations et
 *   frise chronologique.
 */
export const WB_FORMAT_VERSION = 2;

export type BuiltinWbType =
  | 'character'
  | 'place'
  | 'object'
  | 'animal'
  | 'other';

/**
 * Identifiant (slug) d’une catégorie de fiche.
 *
 * Les catégories intégrées gardent leur identifiant historique ; les
 * catégories créées par l’auteur utilisent un slug libre.
 */
export type WbType =
  | BuiltinWbType
  | string;

/**
 * - `text` : texte court sur une ligne ;
 * - `textarea` : texte long ;
 * - `number` : valeur numérique (stockée sous forme de chaîne) ;
 * - `select` : un choix parmi `options` ;
 * - `reference` : lien vers une autre fiche (stocke son identifiant).
 */
export type WbFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'reference';

export interface WbField {
  key: string;
  label: string;
  type: WbFieldType;

  /**
   * Choix proposés lorsque `type` vaut `select`.
   */
  options?: string[];

  /**
   * Catégorie des fiches proposées lorsque `type` vaut `reference`.
   *
   * Absente : toutes les fiches sont proposées.
   */
  referenceCategory?: string;
}

export interface WbTemplate {
  icon: string;
  label: string;
  fields: WbField[];
}

/**
 * Définition d’une catégorie de fiches (Personnage, Lieu, Faction…).
 *
 * Les catégories intégrées sont elles aussi stockées ici afin que l’auteur
 * puisse les personnaliser (icône, couleur, champs, libellé).
 */
export interface WbCategoryDef {
  /**
   * Libellé affiché.
   *
   * Pour une catégorie intégrée, une chaîne vide signifie « utiliser le
   * libellé traduit dans la langue de l’interface ».
   */
  label: string;

  icon: string;

  /**
   * Couleur par défaut des fiches de la catégorie (#rrggbb).
   */
  color: string;

  fields: WbField[];

  /**
   * Présent uniquement pour les quatre catégories d’origine.
   *
   * Permet de retrouver les libellés traduits des champs et de proposer une
   * réinitialisation.
   */
  builtin?: BuiltinWbType;

  /**
   * Identifiant du modèle prêt à l’emploi dont la catégorie est issue.
   */
  presetId?: string;
}

/**
 * Ancien format des types personnalisés (format 1).
 *
 * @deprecated Utilisé uniquement par la migration vers `wbCategories`.
 */
export interface CustomWbTypeDef {
  label: string;
  icon: string;
  defaultColor: string;
  fields: WbField[];
}

/**
 * Dossier de rangement des fiches.
 *
 * Un dossier appartient à une catégorie et peut contenir des sous-dossiers
 * (`parentId`). L’ordre du tableau `wbFolders` est l’ordre d’affichage.
 */
export interface WbFolder {
  id: string;
  name: string;
  category: WbType;
  parentId: string | null;
  collapsed?: boolean;
}

export interface WbItem {
  /**
   * Identifiant stable, identique à la clé dans `ProjectData.world`.
   *
   * Il est aussi utilisé dans l’attribut `data-wb-key` des mentions et dans
   * `TabRef.name` des onglets de fiche.
   */
  id: string;

  /**
   * Nom affiché de la fiche.
   */
  name: string;

  /**
   * Catégorie de la fiche (clé de `wbCategories`).
   */
  wbType: WbType;

  /**
   * Valeurs des champs, indexées par `WbField.key`.
   */
  content: Record<string, string>;

  folderId: string | null;

  tags: string[];

  /**
   * Autres noms détectés dans le texte (surnoms, titres, diminutifs).
   */
  aliases: string[];

  /**
   * Portrait ou illustration, sous forme d’URL de données
   * (`data:image/jpeg;base64,…` ou `data:image/webp;base64,…`).
   *
   * L’image est réduite à 512 px et compressée lors de l’import.
   */
  image?: string;

  /**
   * Icône personnalisée ; à défaut, celle de la catégorie.
   */
  icon?: string;

  /**
   * Photo ronde affichée à la place de l’icône (URL de données, 128 px).
   */
  iconImage?: string;

  /**
   * Couleur personnalisée ; à défaut, celle de la catégorie.
   */
  color?: string;

  /**
   * Fiche ouverte en mode lecture.
   */
  readMode?: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Ancien format d’une fiche (format 1), indexée par son nom.
 *
 * @deprecated Utilisé uniquement par la migration.
 */
export interface LegacyWbItem {
  wbType: WbType;
  content: Record<string, string>;
  icon?: string;
  color?: string;
}

/**
 * Famille d’une relation, utilisée pour le filtrage et l’arbre généalogique.
 */
export type WbRelationKind =
  | 'family'
  | 'social'
  | 'other';

/**
 * Type de relation créé par l’auteur.
 *
 * Les types intégrés (parent, conjoint, allié…) sont définis dans la
 * configuration du renderer et ne sont pas stockés dans le projet.
 */
export interface WbRelationTypeDef {
  id: string;

  /**
   * Libellé vu depuis la source : « A est <label> de B ».
   */
  label: string;

  /**
   * Libellé vu depuis la cible : « B est <inverseLabel> de A ».
   *
   * Identique à `label` pour une relation symétrique.
   */
  inverseLabel: string;

  symmetric: boolean;
  kind: WbRelationKind;
}

/**
 * Relation entre deux fiches, stockée une seule fois.
 *
 * Le sens inverse est calculé à l’affichage, ce qui garantit la cohérence.
 */
export interface WbRelation {
  id: string;
  sourceId: string;
  targetId: string;

  /**
   * Identifiant d’un type intégré ou d’un `WbRelationTypeDef`.
   */
  typeId: string;

  note?: string;
}

/**
 * Événement de la frise chronologique.
 *
 * Les calendriers de fiction étant libres, la date affichée est un texte et
 * l’ordre est déterminé par `sortKey`.
 */
export interface WbTimelineEvent {
  id: string;
  title: string;

  /**
   * Date affichée, par exemple « An 342, Ère des Rois ».
   */
  dateLabel: string;

  /**
   * Valeur numérique servant uniquement au tri.
   */
  sortKey: number;

  description: string;

  /**
   * Fiches concernées.
   */
  itemIds: string[];

  /**
   * Chapitres où l’événement est raconté.
   */
  chapterNames: string[];

  color?: string;
}

// ============================================================================
// SESSIONS D’ÉCRITURE
// ============================================================================

export type SessionRatingScale =
  | 5
  | 10
  | 20;

export type WritingSessionMood =
  | 'very-good'
  | 'good'
  | 'neutral'
  | 'difficult'
  | 'very-difficult';

export type WritingSessionSource =
  | 'pomodoro'
  | 'manual';

export interface PomodoroSessionInfo {
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  activeSeconds: number;
  completed: boolean;
}

export interface WritingSessionDocumentStats {
  /**
   * Nom du chapitre ou de la scène au moment de la session.
   */
  documentName: string;

  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;
}

export interface WritingSession {
  id: string;
  projectName: string;

  /**
   * Premier document actif au démarrage de la session.
   *
   * Il peut s’agir d’un chapitre ou d’une scène.
   */
  documentName: string | null;

  documentNames?: string[];
  documentStats?: WritingSessionDocumentStats[];

  startedAt: string;
  endedAt: string;
  durationSeconds: number;

  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;

  source: WritingSessionSource;
  pomodoro?: PomodoroSessionInfo;

  mood?: WritingSessionMood | null;

  concentration?: number | null;
  concentrationScale?: SessionRatingScale;

  energy?: number | null;
  energyScale?: SessionRatingScale;

  note?: string;
}

// ============================================================================
// OBJECTIFS DE PROJET
// ============================================================================

export type ProjectGoalProgressMode =
  | 'words'
  | 'manual';

export interface ProjectGoal {
  id: string;
  title: string;

  /**
   * Date locale au format YYYY-MM-DD.
   */
  deadline: string | null;

  progressMode: ProjectGoalProgressMode;

  targetWords?: number | null;
  manualProgress?: number;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// MODE SCÉNARIO
// ============================================================================

/**
 * Type général d’un projet.
 *
 * `projectType` reste facultatif dans ProjectData pour assurer la
 * compatibilité avec les anciens projets. Son absence signifie `novel`.
 */
export type ProjectType =
  | 'novel'
  | 'screenplay';

/**
 * Langue des conventions de scénario.
 *
 * Cette préférence est indépendante de la langue de l’interface.
 */
export type ScreenplayConventionLanguage =
  | 'fr'
  | 'en';

/**
 * Format physique utilisé pour l’éditeur paginé et les exports.
 */
export type ScreenplayPageFormat =
  | 'a4'
  | 'letter';

/**
 * Mode de gestion de l’en-tête d’une scène.
 *
 * - `structured` : l’en-tête est généré à partir de champs séparés ;
 * - `free` : l’auteur saisit librement l’en-tête complet.
 */
export type ScreenplayHeadingMode =
  | 'structured'
  | 'free';

/**
 * Préfixes courants d’un en-tête de scène.
 *
 * La valeur `OTHER` permet de conserver une formulation personnalisée.
 */
export type ScreenplayInteriorExterior =
  | 'INT.'
  | 'EXT.'
  | 'INT./EXT.'
  | 'EXT./INT.'
  | 'OTHER';

/**
 * Les six types principaux sont toujours disponibles.
 *
 * `shot` correspond au type facultatif « Plan / indication technique ».
 */
export type ScreenplayElementType =
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot';

/**
 * Type comprenant aussi l’en-tête de scène.
 *
 * L’en-tête est stocké séparément du corps de la scène afin d’éviter une
 * divergence entre ses champs structurés et son texte affiché.
 */
export type ScreenplayParagraphType =
  | 'scene-heading'
  | ScreenplayElementType;

/**
 * Paragraphe du corps d’une scène.
 *
 * Le type est enregistré explicitement. La présentation visuelle est calculée
 * à partir de ce type et ne constitue donc pas la source de vérité.
 *
 * `html` contient uniquement la mise en forme en ligne autorisée par
 * Scriptorium. Il sera désinfecté lors des imports et sauvegardes.
 */
export interface ScreenplayElement {
  /**
   * Identifiant interne stable.
   */
  id: string;

  type: ScreenplayElementType;

  /**
   * Contenu HTML en ligne du paragraphe.
   */
  html: string;
}

/**
 * En-tête structuré, par exemple :
 *
 * INT. APPARTEMENT — JOUR
 *
 * Le texte visible est généré depuis ces champs. Il n’est volontairement pas
 * stocké une seconde fois afin d’éviter les désynchronisations.
 */
export interface StructuredScreenplayHeading {
  id: string;
  type: 'scene-heading';
  mode: 'structured';

  interiorExterior: ScreenplayInteriorExterior;

  /**
   * Valeur utilisée lorsque `interiorExterior` vaut `OTHER`.
   */
  customInteriorExterior?: string;

  location: string;
  timeOfDay: string;
}

/**
 * En-tête entièrement libre.
 */
export interface FreeScreenplayHeading {
  id: string;
  type: 'scene-heading';
  mode: 'free';

  /**
   * Contenu HTML en ligne de l’en-tête libre.
   */
  html: string;
}

export type ScreenplaySceneHeading =
  | StructuredScreenplayHeading
  | FreeScreenplayHeading;

/**
 * Une scène possède un identifiant stable indépendant de sa position.
 *
 * Son numéro visible est calculé à partir de son index dans `scenes`. Il n’est
 * donc pas enregistré ici et se recalcule automatiquement après déplacement.
 */
export interface ScreenplayScene {
  id: string;

  /**
   * Titre interne facultatif, par exemple « La dispute ».
   *
   * Il est affiché dans la barre latérale mais exclu des exports par défaut.
   */
  workingTitle: string;

  heading: ScreenplaySceneHeading;

  /**
   * Paragraphes suivant l’en-tête.
   */
  elements: ScreenplayElement[];
}

/**
 * Informations de la page de titre.
 *
 * La page de titre est non numérotée et exclue du compteur des pages du
 * scénario.
 */
export interface ScreenplayTitlePage {
  enabled: boolean;

  title: string;
  authors: string;

  /**
   * Coordonnées facultatives.
   */
  contact: string;

  /**
   * Version saisie manuellement.
   */
  version: string;

  /**
   * Date saisie manuellement.
   *
   * Elle n’est pas automatiquement remplacée lors d’un export.
   */
  date: string;

  /**
   * Mention facultative d’adaptation ou d’œuvre originale.
   */
  sourceNote: string;
}

/**
 * Réglages des continuations lorsqu’un dialogue traverse un changement de
 * page.
 *
 * Les mentions sont générées par la pagination et ne sont jamais enregistrées
 * dans le texte de l’auteur.
 */
export interface ScreenplayContinuationSettings {
  enabled: boolean;

  /**
   * Mention placée en bas de page.
   *
   * Valeur française par défaut : `(À SUIVRE)`.
   * Valeur anglaise par défaut : `(MORE)`.
   */
  bottomLabel: string;

  /**
   * Suffixe ajouté au personnage au début de la page suivante.
   *
   * Valeur française par défaut : `(SUITE)`.
   * Valeur anglaise par défaut : `(CONT'D)`.
   */
  characterSuffix: string;
}

export interface ScreenplaySettings {
  conventionLanguage: ScreenplayConventionLanguage;

  /**
   * A4 par défaut. US Letter reste disponible dans les paramètres.
   */
  pageFormat: ScreenplayPageFormat;

  /**
   * Affichage des numéros dans les exports.
   *
   * Les numéros restent visibles dans la barre latérale indépendamment de ce
   * réglage.
   */
  showSceneNumbersInExport: boolean;

  /**
   * Le gras des en-têtes reste facultatif.
   */
  boldSceneHeadings: boolean;

  /**
   * Active ou masque le type facultatif « Plan / indication technique » dans
   * le sélecteur de types.
   */
  enableShotElement: boolean;

  continuations: ScreenplayContinuationSettings;
}

/**
 * Données spécifiques à un projet de type scénario.
 */
export interface ScreenplayProjectData {
  /**
   * Version du format interne pour permettre de futures migrations.
   */
  version: 1;

  settings: ScreenplaySettings;
  titlePage: ScreenplayTitlePage;

  /**
   * L’ordre du tableau correspond à l’ordre du scénario.
   */
  scenes: ScreenplayScene[];
}

// ============================================================================
// PROJET
// ============================================================================

/** État d’avancement d’un chapitre. */
export type ChapterStatus = 'todo' | 'draft' | 'revision' | 'done';

/** Réglages propres à un chapitre (jamais exportés). */
export interface ChapterMeta {
  /** État d’avancement (à écrire si absent). */
  status?: ChapterStatus;
  /** Couleur libre (#rrggbb) qui remplace la couleur de l’état. */
  color?: string;
  /** Objectif de mots du chapitre (entier positif). */
  targetWords?: number;
}

/** Modification partielle des réglages d’un chapitre : null efface la valeur. */
export type ChapterMetaPatch = {
  [K in keyof ChapterMeta]?: ChapterMeta[K] | null;
};

export interface ProjectData {
  /**
   * Type du projet.
   *
   * Facultatif pour la compatibilité : un ancien projet sans cette propriété
   * est toujours interprété comme un roman.
   */
  projectType?: ProjectType;

  /**
   * Nom du chapitre -> HTML du chapitre.
   *
   * Cette structure reste utilisée par les romans et par les anciennes
   * versions de Scriptorium.
   *
   * Dans un projet scénario, elle est normalement vide. Elle reste présente
   * pour conserver une enveloppe ProjectData compatible avec les fonctions
   * communes et les anciens imports.
   */
  chapters: Record<string, string>;

  /**
   * Données spécifiques au scénario.
   *
   * Présentes uniquement lorsque `projectType` vaut `screenplay`.
   */
  screenplay?: ScreenplayProjectData;

  // --------------------------------------------------------------------------
  // World Building
  // --------------------------------------------------------------------------

  /**
   * Version du format du World Building (voir `WB_FORMAT_VERSION`).
   *
   * Absente : ancien format 1, converti automatiquement à l’ouverture.
   */
  wbFormat?: number;

  /**
   * Identifiant de fiche -> fiche.
   *
   * L’ordre d’insertion des clés est l’ordre d’affichage dans un même
   * dossier. Les identifiants commencent par une lettre afin que cet ordre
   * soit toujours respecté par JavaScript.
   */
  world: Record<string, WbItem>;

  /**
   * Slug de catégorie -> définition.
   *
   * L’ordre d’insertion des clés est l’ordre d’affichage.
   */
  wbCategories?: Record<string, WbCategoryDef>;

  wbFolders?: WbFolder[];

  /**
   * Types de relations ajoutés par l’auteur.
   */
  wbRelationTypes?: WbRelationTypeDef[];

  wbRelations?: WbRelation[];

  wbTimeline?: WbTimelineEvent[];

  /**
   * Ancien emplacement des types personnalisés (format 1).
   *
   * @deprecated Converti dans `wbCategories` puis supprimé par la migration.
   */
  customWbTypes?: Record<
    string,
    CustomWbTypeDef
  >;

  // --------------------------------------------------------------------------
  // Suivi
  // --------------------------------------------------------------------------

  writingSessions?: WritingSession[];
  goals?: ProjectGoal[];

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  /**
   * Réglages de la fenêtre d’export, mémorisés par projet.
   *
   * Absent : valeurs du modèle « Manuscrit standard ».
   */
  exportSettings?: ExportSettings;
  /** Réglages par chapitre (état, couleur, objectif), indexés par nom de chapitre. */
  chapterMeta?: Record<string, ChapterMeta>;
}
// ----------------------------------------------------------------------------
// Export (fenêtre d’export)
// ----------------------------------------------------------------------------

/** Format de fichier produit par la fenêtre d’export. */
export type ExportFormat = 'pdf' | 'docx' | 'odt' | 'txt' | 'md';

/** Modèle de mise en page appliqué à un roman. */
export type ExportTemplateId = 'manuscript' | 'novel';

export type ExportPageSize = 'a4' | 'a5' | 'letter';

/** Place de la bible de l’univers dans l’export. */
export type ExportBibleMode = 'none' | 'appendix' | 'only';

/** Symbole des séparateurs de scène (voir EXPORT_SEPARATOR_SYMBOLS). */
export type ExportSceneSeparator =
  | 'asterism'
  | 'stars'
  | 'spaced-stars'
  | 'hash'
  | 'blank';

export interface ExportTitlePageSettings {
  enabled: boolean;
  /** Vide : le nom du projet est utilisé. */
  title: string;
  subtitle: string;
  showAuthor: boolean;
  author: string;
}

export interface ExportContentSettings {
  /**
   * Chapitres décochés.
   *
   * On mémorise les exclusions plutôt que les inclusions : un chapitre créé
   * après le dernier export est ainsi inclus par défaut.
   */
  excludedChapters: string[];
  tableOfContents: boolean;
  chapterOnNewPage: boolean;
  /** Remplace les lignes « *** », « * * * », « # »… par un séparateur centré. */
  sceneSeparators: boolean;
  sceneSeparator: ExportSceneSeparator;
  /**
   * Faux : le modèle remplace polices, tailles et couleurs de l’éditeur
   * (gras, italique et souligné sont toujours conservés).
   */
  keepEditorFormatting: boolean;
  /**
   * Vrai : les lignes laissées vides entre les paragraphes sont retirées,
   * et les paragraphes reçoivent leur retrait de première ligne.
   */
  ignoreEmptyLines: boolean;
}

export interface ExportBibleSettings {
  mode: ExportBibleMode;
  /** Catégories décochées (même principe que les chapitres). */
  excludedCategories: string[];
  portraits: boolean;
  relations: boolean;
  timeline: boolean;
}

export interface ExportLayoutSettings {
  pageSize: ExportPageSize;
  fontFamily: string;
  /** Taille du texte, en points. */
  fontSize: number;
  /** Multiplicateur d’interligne (1 = simple, 2 = double). */
  lineHeight: number;
  /** Marge identique sur les quatre côtés, en centimètres. */
  marginCm: number;
  justify: boolean;
  /** Retrait de première ligne, en centimètres (0 = aucun). */
  firstLineIndentCm: number;
  pageNumbers: boolean;
}

export interface ExportSettings {
  format: ExportFormat;
  template: ExportTemplateId;
  titlePage: ExportTitlePageSettings;
  /** Auteur et titre en en-tête de page. */
  runningHeader: boolean;
  content: ExportContentSettings;
  bible: ExportBibleSettings;
  layout: ExportLayoutSettings;
}
export type ProjectsMap = Record<

  string,
  ProjectData
>;

// ============================================================================
// ÉTAT D’INTERFACE
// ============================================================================

/**
 * `chapter` reste le nom interne historique du type de document.
 *
 * Pour un scénario, les scènes seront identifiées séparément grâce à leur
 * identifiant stable dans les évolutions du contrôleur.
 */
export type ItemType =
  | 'chapter'
  | 'scene'
  | 'world';

export interface TabRef {
  /**
   * Pour un roman : nom du chapitre.
   * Pour un scénario : identifiant stable de la scène.
   * Pour le World Building : identifiant stable de la fiche (format 2).
   */
  name: string;

  type: ItemType;
}

export interface ProjectUiState {
  openTabs: TabRef[];
  activeTab: string | null;
  activeType: ItemType;
}

export type UiState = Record<
  string,
  ProjectUiState
>;

export type ThemeName =
  | 'dark'
  | 'light'
  | 'sepia'
  | 'midnight'
  | 'forest'
  | 'contrast'
  | 'rose'
  | 'lavender'
  | 'ocean';

export type LanguageCode =
  | 'fr'
  | 'en';

export interface EditorPrefs {
  width: number;
  fontFamily?: string;
  lineHeight?: number;

  uiFontSize?: number;
  uiFontFamily?: string;

  timerSoundEnabled?: boolean;
  timerVolume?: number;
  timerSoundId?: string;

  marginLeft?: number;
  marginRight?: number;
  firstLineIndent?: number;

  sessionConcentrationScale?: SessionRatingScale;
  sessionEnergyScale?: SessionRatingScale;

  /** Largeur du panneau gauche (Chapitres / World Building), en pixels. */
  sidebarWidth?: number;

  /**
   * Liens de la bible dans le texte : noms des fiches colorés et cliquables.
   * Absent = activé (comportement des versions précédentes).
   */
  wbLinksInText?: boolean;
}

// ============================================================================
// STATISTIQUES D’ÉCRITURE HISTORIQUES
// ============================================================================

export interface WritingStatsBucket {
  baselineDate: string | null;
  baselineWords: number;

  history: Record<string, number>;

  dailyGoal?: number | null;
}

export interface WritingStats {
  projects?: Record<
    string,
    WritingStatsBucket
  >;

  baselineDate?: string | null;
  baselineWords?: number;
  history?: Record<string, number>;
}

// ============================================================================
// GRAMMAIRE
// ============================================================================

export interface GrammarPrefs {
  enabled: boolean;
  languageToolPath: string | null;
  port: number;

  /**
   * Correction exigeante (niveau « picky » de LanguageTool).
   *
   * Signale aussi les remarques de style : répétitions, tournures lourdes,
   * typographie, etc.
   *
   * Activée par défaut : une valeur absente (anciennes préférences) est
   * considérée comme `true`. Seule la valeur `false` la désactive.
   */
  picky?: boolean;
}

export interface JavaInfo {
  available: boolean;
  major: number | null;
  outdated: boolean;
}

export interface GrammarMatch {
  offset: number;
  length: number;
  message: string;
  ruleId: string;
  replacements: string[];
}

export interface GrammarInstallProgress {
  phase:
    | 'download'
    | 'extract';

  percent: number;
}

export interface LanguageToolFolderResult {
  canceled: boolean;
  valid?: boolean;
  folderPath?: string;
}

// ============================================================================
// EXPORT / IMPORT / SAUVEGARDES
// ============================================================================

export interface ImportedProject {
  projectName: string;
  projectData: ProjectData;
}

export interface BackupEntry {
  fileName: string;
  savedAt: string | null;
}

export interface LegacyData {
  projects?: ProjectsMap;
  uiState?: UiState;
  theme?: string;
  currentProject?: string;
}

// ============================================================================
// DOCX
// ============================================================================

// ============================================================================
// DIALOGUES NATIFS
// ============================================================================

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;

  filters?: {
    name: string;
    extensions: string[];
  }[];
}

export interface OpenDialogOptions
  extends SaveDialogOptions {
  properties?: (
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
  )[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

// ============================================================================
// CONTRAT EXPOSÉ AU RENDERER
// ============================================================================

export interface ScriptoriumApi {
  // ------------------------------------------------------------------------
  // Persistance des projets
  // ------------------------------------------------------------------------

  getProjects(): Promise<ProjectsMap>;

  saveProjects(
    projects: ProjectsMap
  ): Promise<boolean>;

  /**
   * Sauvegarde uniquement le contenu d’un chapitre de roman.
   *
   * Le processus principal met à jour le projet concerné sans que le renderer
   * ait besoin de lui renvoyer la totalité des projets.
   */
  saveProjectChapter(
    projectName: string,
    chapterName: string,
    html: string
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // État d’interface
  // ------------------------------------------------------------------------

  getUiState(): Promise<UiState>;

  saveUiState(
    uiState: UiState
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Thème et langue
  // ------------------------------------------------------------------------

  getTheme(): Promise<ThemeName>;

  saveTheme(
    theme: ThemeName
  ): Promise<boolean>;

  getLanguage(): Promise<LanguageCode>;

  saveLanguage(
    lang: LanguageCode
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Préférences
  // ------------------------------------------------------------------------

  getEditorPrefs(): Promise<EditorPrefs>;

  saveEditorPrefs(
    prefs: EditorPrefs
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Anciennes statistiques quotidiennes
  // ------------------------------------------------------------------------

  getWritingStats(): Promise<WritingStats>;

  saveWritingStats(
    stats: WritingStats
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Fermeture de l'application
  // ------------------------------------------------------------------------

  /**
   * Ajoute une tâche à terminer avant la fermeture de la fenêtre
   * (enregistrement). Retourne la fonction qui la retire.
   */
  setFullScreen(enabled: boolean): Promise<void>;
  onBeforeClose(
    handler: () => Promise<void> | void
  ): () => void;

  // ------------------------------------------------------------------------
  // Correcteur orthographique natif
  // ------------------------------------------------------------------------

  getNativeSpellcheck(): Promise<boolean>;

  setNativeSpellcheck(
    enabled: boolean
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Projet courant
  // ------------------------------------------------------------------------

  getCurrentProject(): Promise<
    string | null
  >;

  setCurrentProject(
    name: string
  ): Promise<boolean>;

  clearCurrentProject(): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Migration depuis localStorage
  // ------------------------------------------------------------------------

  migrateFromLocalStorage(
    legacyData: LegacyData
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Dialogues natifs
  // ------------------------------------------------------------------------

  showSaveDialog(
    options: SaveDialogOptions
  ): Promise<SaveDialogResult>;

  showOpenDialog(
    options: OpenDialogOptions
  ): Promise<OpenDialogResult>;

  // ------------------------------------------------------------------------
  // Exports de fichiers
  // ------------------------------------------------------------------------

  exportTxt(
    filePath: string,
    text: string
  ): Promise<boolean>;

  exportDocumentOdt(filePath: string, doc: import('./export-document').ExportDocument): Promise<void>;
  exportScreenplayDocx(filePath: string, doc: import('./screenplay-export').ScreenplayExportDocument): Promise<void>;
  exportScreenplayOdt(filePath: string, doc: import('./screenplay-export').ScreenplayExportDocument): Promise<void>;
  exportDocumentDocx(filePath: string, doc: import('./export-document').ExportDocument): Promise<void>;

  exportPdf(
    filePath: string,
    htmlContent: string
  ): Promise<boolean>;

  // ------------------------------------------------------------------------
  // Export et import de projet
  // ------------------------------------------------------------------------

  exportProject(
    filePath: string,
    projectName: string,
    projectData: ProjectData
  ): Promise<boolean>;

  importProject(
    filePath: string
  ): Promise<ImportedProject>;

  // ------------------------------------------------------------------------
  // Sauvegardes horodatées
  // ------------------------------------------------------------------------

  createBackup(
    projectName: string,
    projectData: ProjectData
  ): Promise<{
    fileName: string;
  }>;

  listBackups(
    projectName: string
  ): Promise<BackupEntry[]>;

  restoreBackup(
    projectName: string,
    fileName: string
  ): Promise<ProjectData>;

  // ------------------------------------------------------------------------
  // Désinfection HTML
  // ------------------------------------------------------------------------

  sanitizeHtml(
    html: string
  ): Promise<string>;

  // ------------------------------------------------------------------------
  // Correcteur de grammaire hors ligne
  // ------------------------------------------------------------------------

  getGrammarPrefs(): Promise<GrammarPrefs>;

  saveGrammarPrefs(
    prefs: Partial<GrammarPrefs>
  ): Promise<GrammarPrefs>;

  selectLanguageToolFolder(): Promise<LanguageToolFolderResult>;

  checkJavaAvailable(): Promise<JavaInfo>;

  startGrammarServer(): Promise<{
    port: number;
  }>;

  checkGrammar(
    text: string,
    language: string
  ): Promise<GrammarMatch[]>;

  installLanguageToolAuto(): Promise<{
    success: boolean;
    folderPath: string;
  }>;

  onGrammarInstallProgress(
    callback: (
      data: GrammarInstallProgress
    ) => void
  ): () => void;

  onGrammarServerStopped(
    callback: () => void
  ): () => void;

  openExternalLink(
    url: string
  ): Promise<void>;

  // ------------------------------------------------------------------------
  // Mise à jour automatique
  // ------------------------------------------------------------------------

  checkForUpdates(): Promise<void>;

  getPendingUpdate(): Promise<PendingUpdateInfo | null>;


  getAppVersion(): Promise<string>;

  confirmUpdateDownload(): Promise<void>;

  quitAndInstall(): Promise<void>;

  onUpdateAvailable(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  onUpdateNotAvailable(
    callback: () => void
  ): () => void;

  onUpdateDownloadProgress(
    callback: (info: UpdateDownloadProgress) => void
  ): () => void;

  onUpdateDownloaded(
    callback: (info: {
      version: string;
    }) => void
  ): () => void;

  onUpdateError(
    callback: (
      message: string,
      during: UpdateErrorPhase
    ) => void
  ): () => void;
}

// ------------------------------------------------------------------------
// Mise à jour automatique : état partagé entre main et renderer
// ------------------------------------------------------------------------

/** Étape d'une mise à jour trouvée : proposée, en téléchargement ou prête. */
export type UpdateState = 'available' | 'downloading' | 'downloaded';

export interface PendingUpdateInfo {
  version: string;
  state: UpdateState;
  /** Avancement du téléchargement, de 0 à 100. */
  percent: number;
}

export interface UpdateDownloadProgress {
  version: string;
  percent: number;
}

/** Moment où une erreur de mise à jour s'est produite. */
export type UpdateErrorPhase = 'check' | 'download';

declare global {
  interface Window {
    api: ScriptoriumApi;
  }
}
