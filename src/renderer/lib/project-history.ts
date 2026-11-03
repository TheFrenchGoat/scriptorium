// Historique des actions de projet (chapitres et scenes).
//
// Annulation ciblee : chaque action ne defait que ce qu'elle a change
// (un chapitre, une scene, un nom ou un ordre). Aucune copie complete du
// projet n'est jamais remise en place : ce qui a ete ecrit ailleurs entre
// temps est conserve.
//
// Si une action ne peut plus etre defaite proprement (nom deja pris,
// element introuvable, ordre modifie entre temps), rien n'est modifie, la
// raison est renvoyee et l'historique est vide : on n'annule jamais sur un
// etat qui ne correspond plus a celui de l'action.
//
// Ce module ne touche ni a l'ecran ni a la sauvegarde. Apres une annulation
// reussie, l'appelant resynchronise (index des mentions, onglets, compteurs
// de mots, sauvegarde).

export const PROJECT_HISTORY_LIMIT = 50;

// ----- Donnees manipulees -----

/** Vue minimale des donnees d'un roman : l'ordre des chapitres est celui des cles. */
export interface ChapterStore {
  chapters: Record<string, string>;
  chapterMeta?: Record<string, unknown>;
  chapterNotes?: Record<string, unknown>;
  chapterComments?: Record<string, unknown>;
}

/** Valeur d'une table associee (fiche, notes, commentaires) pour un chapitre. */
export interface SideValue {
  present: boolean;
  value: unknown;
}

export interface ChapterSides {
  chapterMeta: SideValue;
  chapterNotes: SideValue;
  chapterComments: SideValue;
}

/** Tout ce qu'il faut pour remettre un chapitre a sa place. */
export interface ChapterSnapshot {
  name: string;
  html: string;
  index: number;
  prev: string | null;
  next: string | null;
  sides: ChapterSides;
}

export interface SceneLike {
  id: string;
  workingTitle?: string;
}

/** Tout ce qu'il faut pour remettre une scene a sa place. */
export interface SceneSnapshot {
  item: SceneLike;
  index: number;
  prev: string | null;
  next: string | null;
}

/** Acces aux scenes fourni par l'appelant (les listes ne sont jamais modifiees en place). */
export interface SceneAccess<S extends SceneLike> {
  get: () => readonly S[];
  set: (scenes: S[]) => void;
  /** Vrai si la scene n'a recu aucun contenu (titre et texte par defaut). */
  isPristine: (scene: S) => boolean;
  /** Cree la scene vide de remplacement quand il n'en reste plus aucune. */
  makeReplacement: () => S;
}

export interface ProjectHistoryTarget<S extends SceneLike = SceneLike> {
  chapters: ChapterStore | null;
  scenes: SceneAccess<S> | null;
}

// ----- Actions enregistrees -----

export interface ChapterDeleteEntry {
  kind: 'chapter-delete';
  name: string;
  snap: ChapterSnapshot;
}

export interface ChapterCreateEntry {
  kind: 'chapter-create';
  name: string;
  snap: ChapterSnapshot | null;
}

export interface ChapterRenameEntry {
  kind: 'chapter-rename';
  from: string;
  to: string;
}

export interface ChapterReorderEntry {
  kind: 'chapter-reorder';
  before: string[];
  after: string[];
}

export interface SceneDeleteEntry {
  kind: 'scene-delete';
  id: string;
  label: string;
  snap: SceneSnapshot;
  replacementId: string | null;
}

export interface SceneCreateEntry {
  kind: 'scene-create';
  id: string;
  label: string;
  snap: SceneSnapshot | null;
  replacementId: string | null;
}

export interface SceneRenameEntry {
  kind: 'scene-rename';
  id: string;
  from: string;
  to: string;
}

export interface SceneReorderEntry {
  kind: 'scene-reorder';
  before: string[];
  after: string[];
}

export type ProjectHistoryEntry =
  | ChapterDeleteEntry
  | ChapterCreateEntry
  | ChapterRenameEntry
  | ChapterReorderEntry
  | SceneDeleteEntry
  | SceneCreateEntry
  | SceneRenameEntry
  | SceneReorderEntry;

export type ProjectHistoryDirection = 'undo' | 'redo';
export type ProjectHistoryStatus = 'ok' | 'empty' | 'needs-confirm' | 'failed';
export type ProjectHistoryReason =
  | 'not-empty'
  | 'name-exists'
  | 'missing'
  | 'changed'
  | 'unavailable'
  | 'error';

export interface ProjectHistoryResult {
  status: ProjectHistoryStatus;
  direction: ProjectHistoryDirection;
  entry: ProjectHistoryEntry | null;
  reason: ProjectHistoryReason | null;
}

export interface ProjectHistoryInfo {
  target: 'chapter' | 'scene';
  action: 'delete' | 'create' | 'rename' | 'reorder';
  label: string;
  previous: string | null;
}

// ----- Outils internes -----

type SideMap = Record<string, unknown> | undefined;

interface ChapterMaps {
  chapters: Record<string, string>;
  chapterMeta: SideMap;
  chapterNotes: SideMap;
  chapterComments: SideMap;
}

interface Applied {
  status: 'ok' | 'needs-confirm' | 'failed';
  entry: ProjectHistoryEntry;
  reason: ProjectHistoryReason | null;
}

function hasOwn(obj: object | null | undefined, key: string): boolean {
  return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== a.length || new Set(b).size !== b.length) return false;
  return b.every((key) => setA.has(key));
}

function insertionIndex(
  order: readonly string[],
  prev: string | null,
  next: string | null,
  index: number,
): number {
  if (prev !== null) {
    const at = order.indexOf(prev);
    if (at >= 0) return at + 1;
  }
  if (next !== null) {
    const at = order.indexOf(next);
    if (at >= 0) return at;
  }
  return Math.max(0, Math.min(index, order.length));
}

function readSide(map: SideMap, name: string): SideValue {
  if (map && hasOwn(map, name)) return { present: true, value: map[name] };
  return { present: false, value: undefined };
}

function readSides(store: ChapterStore, name: string): ChapterSides {
  return {
    chapterMeta: readSide(store.chapterMeta, name),
    chapterNotes: readSide(store.chapterNotes, name),
    chapterComments: readSide(store.chapterComments, name),
  };
}

function sideWithout(map: SideMap, name: string): SideMap {
  if (!map || !hasOwn(map, name)) return map;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(map)) {
    if (key !== name) copy[key] = map[key];
  }
  return copy;
}

function sideWith(map: SideMap, name: string, side: SideValue): SideMap {
  if (!side.present) return map;
  const copy: Record<string, unknown> = {};
  if (map) {
    for (const key of Object.keys(map)) copy[key] = map[key];
  }
  copy[name] = side.value;
  return copy;
}

function sideRenamed(map: SideMap, from: string, to: string): SideMap {
  if (!map || !hasOwn(map, from)) return map;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(map)) {
    if (key === from) copy[to] = map[key];
    else if (key !== to) copy[key] = map[key];
  }
  return copy;
}

function rebuildChapters(
  source: Record<string, string>,
  order: readonly string[],
  extraName: string | null,
  extraHtml: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of order) {
    out[key] = key === extraName ? extraHtml : (source[key] ?? '');
  }
  return out;
}

function commitMaps(store: ChapterStore, maps: ChapterMaps): void {
  if (maps.chapterMeta && maps.chapterMeta !== store.chapterMeta) store.chapterMeta = maps.chapterMeta;
  if (maps.chapterNotes && maps.chapterNotes !== store.chapterNotes) store.chapterNotes = maps.chapterNotes;
  if (maps.chapterComments && maps.chapterComments !== store.chapterComments) {
    store.chapterComments = maps.chapterComments;
  }
  store.chapters = maps.chapters;
}

// ----- Contenu vide -----

const MEDIA_PATTERN = /<(img|hr|table|video|audio|iframe|svg|canvas|object|embed)\b/i;

/** Vrai si le HTML ne contient ni texte ni image (paragraphes vides, espaces). */
export function isHtmlBlank(html: string): boolean {
  if (!html) return true;
  if (MEDIA_PATTERN.test(html)) return false;
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/\u200b/g, '');
  return text.trim().length === 0;
}

function isValueBlank(value: unknown, depth: number): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return isHtmlBlank(value);
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'boolean') return !value;
  if (depth > 6) return false;
  if (Array.isArray(value)) return value.every((item: unknown) => isValueBlank(item, depth + 1));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).every((key) => isValueBlank(record[key], depth + 1));
  }
  return false;
}

function isSideBlank(side: SideValue): boolean {
  return !side.present || isValueBlank(side.value, 0);
}

/** Vrai si le chapitre n'a ni texte, ni fiche, ni notes, ni commentaires remplis. */
export function isChapterBlank(store: ChapterStore, name: string): boolean {
  if (!hasOwn(store.chapters, name)) return true;
  if (!isHtmlBlank(store.chapters[name] ?? '')) return false;
  const sides = readSides(store, name);
  return isSideBlank(sides.chapterMeta) && isSideBlank(sides.chapterNotes) && isSideBlank(sides.chapterComments);
}

// ----- Chapitres -----

export function chapterOrder(store: ChapterStore): string[] {
  return Object.keys(store.chapters);
}

/** Photographie d'un chapitre (texte, position, voisins, tables associees). */
export function captureChapter(store: ChapterStore, name: string): ChapterSnapshot | null {
  if (!hasOwn(store.chapters, name)) return null;
  const order = Object.keys(store.chapters);
  const index = order.indexOf(name);
  return {
    name,
    html: store.chapters[name] ?? '',
    index,
    prev: index > 0 ? (order[index - 1] ?? null) : null,
    next: order[index + 1] ?? null,
    sides: readSides(store, name),
  };
}

/** Retire un chapitre et ses tables associees ; renvoie sa photographie. */
export function removeChapterData(store: ChapterStore, name: string): ChapterSnapshot | null {
  const snap = captureChapter(store, name);
  if (!snap) return null;
  const order = Object.keys(store.chapters).filter((key) => key !== name);
  commitMaps(store, {
    chapters: rebuildChapters(store.chapters, order, null, ''),
    chapterMeta: sideWithout(store.chapterMeta, name),
    chapterNotes: sideWithout(store.chapterNotes, name),
    chapterComments: sideWithout(store.chapterComments, name),
  });
  return snap;
}

/** Remet un chapitre a sa place (apres son ancien voisin) ; refuse si le nom existe. */
export function insertChapterData(store: ChapterStore, snap: ChapterSnapshot): boolean {
  if (!snap.name || hasOwn(store.chapters, snap.name)) return false;
  const order = Object.keys(store.chapters);
  order.splice(insertionIndex(order, snap.prev, snap.next, snap.index), 0, snap.name);
  commitMaps(store, {
    chapters: rebuildChapters(store.chapters, order, snap.name, snap.html),
    chapterMeta: sideWith(store.chapterMeta, snap.name, snap.sides.chapterMeta),
    chapterNotes: sideWith(store.chapterNotes, snap.name, snap.sides.chapterNotes),
    chapterComments: sideWith(store.chapterComments, snap.name, snap.sides.chapterComments),
  });
  return true;
}

/** Renomme un chapitre sans changer sa place ; refuse si la cible existe. */
export function renameChapterData(store: ChapterStore, from: string, to: string): boolean {
  if (to.trim().length === 0 || from === to) return false;
  if (!hasOwn(store.chapters, from) || hasOwn(store.chapters, to)) return false;
  const chapters: Record<string, string> = {};
  for (const key of Object.keys(store.chapters)) {
    if (key === from) chapters[to] = store.chapters[from] ?? '';
    else chapters[key] = store.chapters[key] ?? '';
  }
  commitMaps(store, {
    chapters,
    chapterMeta: sideRenamed(store.chapterMeta, from, to),
    chapterNotes: sideRenamed(store.chapterNotes, from, to),
    chapterComments: sideRenamed(store.chapterComments, from, to),
  });
  return true;
}

/** Change l'ordre des chapitres seulement si la liste demandee contient exactement les memes. */
export function reorderChapterData(store: ChapterStore, order: readonly string[]): boolean {
  if (!sameMembers(Object.keys(store.chapters), order)) return false;
  store.chapters = rebuildChapters(store.chapters, order, null, '');
  return true;
}

// ----- Scenes (listes jamais modifiees en place) -----

export function sceneOrder(scenes: readonly SceneLike[]): string[] {
  return scenes.map((scene) => scene.id);
}

export function removeSceneItem<S extends SceneLike>(
  scenes: readonly S[],
  id: string,
): { scenes: S[]; snap: SceneSnapshot } | null {
  const index = scenes.findIndex((scene) => scene.id === id);
  const item = index >= 0 ? scenes[index] : undefined;
  if (!item) return null;
  const before = index > 0 ? scenes[index - 1] : undefined;
  const after = scenes[index + 1];
  return {
    scenes: scenes.slice(0, index).concat(scenes.slice(index + 1)),
    snap: {
      item,
      index,
      prev: before ? before.id : null,
      next: after ? after.id : null,
    },
  };
}

export function insertSceneItem<S extends SceneLike>(scenes: readonly S[], snap: SceneSnapshot): S[] | null {
  const id = snap.item.id;
  if (!id || scenes.some((scene) => scene.id === id)) return null;
  const out = scenes.slice();
  out.splice(insertionIndex(sceneOrder(scenes), snap.prev, snap.next, snap.index), 0, snap.item as S);
  return out;
}

export function renameSceneItem<S extends SceneLike>(
  scenes: readonly S[],
  id: string,
  expected: string,
  title: string,
): S[] | null {
  const index = scenes.findIndex((scene) => scene.id === id);
  const item = index >= 0 ? scenes[index] : undefined;
  if (!item || (item.workingTitle ?? '') !== expected) return null;
  const out = scenes.slice();
  out[index] = { ...item, workingTitle: title };
  return out;
}

export function reorderSceneItems<S extends SceneLike>(scenes: readonly S[], order: readonly string[]): S[] | null {
  if (!sameMembers(sceneOrder(scenes), order)) return null;
  const byId = new Map<string, S>();
  for (const scene of scenes) byId.set(scene.id, scene);
  const out: S[] = [];
  for (const id of order) {
    const scene = byId.get(id);
    if (!scene) return null;
    out.push(scene);
  }
  return out;
}

// ----- Application d'une action -----

function done(entry: ProjectHistoryEntry): Applied {
  return { status: 'ok', entry, reason: null };
}

function refused(entry: ProjectHistoryEntry, reason: ProjectHistoryReason): Applied {
  return { status: 'failed', entry, reason };
}

function askConfirm(entry: ProjectHistoryEntry): Applied {
  return { status: 'needs-confirm', entry, reason: 'not-empty' };
}

function addChapter(entry: ChapterDeleteEntry | ChapterCreateEntry, store: ChapterStore | null): Applied {
  if (!store) return refused(entry, 'unavailable');
  const snap = entry.snap;
  if (!snap || snap.name !== entry.name) return refused(entry, 'missing');
  if (hasOwn(store.chapters, entry.name)) return refused(entry, 'name-exists');
  if (!insertChapterData(store, snap)) return refused(entry, 'error');
  return done(entry);
}

function dropChapter(
  entry: ChapterDeleteEntry | ChapterCreateEntry,
  store: ChapterStore | null,
  askIfFilled: boolean,
  confirmed: boolean,
): Applied {
  if (!store) return refused(entry, 'unavailable');
  if (!hasOwn(store.chapters, entry.name)) return refused(entry, 'missing');
  if (askIfFilled && !confirmed && !isChapterBlank(store, entry.name)) return askConfirm(entry);
  const snap = removeChapterData(store, entry.name);
  if (!snap) return refused(entry, 'missing');
  entry.snap = snap;
  return done(entry);
}

function renameChapter(entry: ChapterRenameEntry, store: ChapterStore | null, from: string, to: string): Applied {
  if (!store) return refused(entry, 'unavailable');
  if (!hasOwn(store.chapters, from)) return refused(entry, 'missing');
  if (hasOwn(store.chapters, to)) return refused(entry, 'name-exists');
  if (!renameChapterData(store, from, to)) return refused(entry, 'error');
  return done(entry);
}

function reorderChapters(entry: ChapterReorderEntry, store: ChapterStore | null, wanted: readonly string[]): Applied {
  if (!store) return refused(entry, 'unavailable');
  const current = Object.keys(store.chapters);
  if (!sameMembers(current, wanted)) return refused(entry, 'changed');
  if (sameOrder(current, wanted)) return done(entry);
  if (!reorderChapterData(store, wanted)) return refused(entry, 'changed');
  return done(entry);
}

function addScene<S extends SceneLike>(
  entry: SceneDeleteEntry | SceneCreateEntry,
  access: SceneAccess<S> | null,
): Applied {
  if (!access) return refused(entry, 'unavailable');
  const snap = entry.snap;
  if (!snap || snap.item.id !== entry.id) return refused(entry, 'missing');
  const current = access.get();
  if (current.some((scene) => scene.id === entry.id)) return refused(entry, 'name-exists');
  let base: readonly S[] = current;
  const replacementId = entry.replacementId;
  if (replacementId !== null) {
    const replacement = current.find((scene) => scene.id === replacementId);
    if (replacement && access.isPristine(replacement)) {
      base = current.filter((scene) => scene.id !== replacementId);
    }
  }
  const next = insertSceneItem(base, snap);
  if (!next) return refused(entry, 'error');
  access.set(next);
  entry.replacementId = null;
  return done(entry);
}

function dropScene<S extends SceneLike>(
  entry: SceneDeleteEntry | SceneCreateEntry,
  access: SceneAccess<S> | null,
  askIfFilled: boolean,
  confirmed: boolean,
): Applied {
  if (!access) return refused(entry, 'unavailable');
  const current = access.get();
  const item = current.find((scene) => scene.id === entry.id);
  if (!item) return refused(entry, 'missing');
  if (askIfFilled && !confirmed && !access.isPristine(item)) return askConfirm(entry);
  const removed = removeSceneItem(current, entry.id);
  if (!removed) return refused(entry, 'missing');
  let next: S[] = removed.scenes;
  let replacementId: string | null = null;
  if (next.length === 0) {
    const replacement = access.makeReplacement();
    next = [replacement];
    replacementId = replacement.id;
  }
  access.set(next);
  entry.snap = removed.snap;
  entry.replacementId = replacementId;
  return done(entry);
}

function renameScene<S extends SceneLike>(
  entry: SceneRenameEntry,
  access: SceneAccess<S> | null,
  expected: string,
  title: string,
): Applied {
  if (!access) return refused(entry, 'unavailable');
  const current = access.get();
  const item = current.find((scene) => scene.id === entry.id);
  if (!item) return refused(entry, 'missing');
  if ((item.workingTitle ?? '') !== expected) return refused(entry, 'changed');
  const next = renameSceneItem(current, entry.id, expected, title);
  if (!next) return refused(entry, 'error');
  access.set(next);
  return done(entry);
}

function reorderScenes<S extends SceneLike>(
  entry: SceneReorderEntry,
  access: SceneAccess<S> | null,
  wanted: readonly string[],
): Applied {
  if (!access) return refused(entry, 'unavailable');
  const current = access.get();
  const ids = sceneOrder(current);
  if (!sameMembers(ids, wanted)) return refused(entry, 'changed');
  if (sameOrder(ids, wanted)) return done(entry);
  const next = reorderSceneItems(current, wanted);
  if (!next) return refused(entry, 'changed');
  access.set(next);
  return done(entry);
}

function applyEntry<S extends SceneLike>(
  entry: ProjectHistoryEntry,
  direction: ProjectHistoryDirection,
  target: ProjectHistoryTarget<S>,
  confirmed: boolean,
): Applied {
  const undo = direction === 'undo';
  switch (entry.kind) {
    case 'chapter-delete':
      return undo ? addChapter(entry, target.chapters) : dropChapter(entry, target.chapters, false, confirmed);
    case 'chapter-create':
      return undo ? dropChapter(entry, target.chapters, true, confirmed) : addChapter(entry, target.chapters);
    case 'chapter-rename':
      return undo
        ? renameChapter(entry, target.chapters, entry.to, entry.from)
        : renameChapter(entry, target.chapters, entry.from, entry.to);
    case 'chapter-reorder':
      return reorderChapters(entry, target.chapters, undo ? entry.before : entry.after);
    case 'scene-delete':
      return undo ? addScene(entry, target.scenes) : dropScene(entry, target.scenes, false, confirmed);
    case 'scene-create':
      return undo ? dropScene(entry, target.scenes, true, confirmed) : addScene(entry, target.scenes);
    case 'scene-rename':
      return undo
        ? renameScene(entry, target.scenes, entry.to, entry.from)
        : renameScene(entry, target.scenes, entry.from, entry.to);
    case 'scene-reorder':
      return reorderScenes(entry, target.scenes, undo ? entry.before : entry.after);
    default:
      return refused(entry, 'error');
  }
}

/** Description d'une action pour le message affiche a l'ecran. */
export function describeEntry(entry: ProjectHistoryEntry): ProjectHistoryInfo {
  switch (entry.kind) {
    case 'chapter-delete':
      return { target: 'chapter', action: 'delete', label: entry.name, previous: null };
    case 'chapter-create':
      return { target: 'chapter', action: 'create', label: entry.name, previous: null };
    case 'chapter-rename':
      return { target: 'chapter', action: 'rename', label: entry.to, previous: entry.from };
    case 'chapter-reorder':
      return { target: 'chapter', action: 'reorder', label: '', previous: null };
    case 'scene-delete':
      return { target: 'scene', action: 'delete', label: entry.label, previous: null };
    case 'scene-create':
      return { target: 'scene', action: 'create', label: entry.label, previous: null };
    case 'scene-rename':
      return { target: 'scene', action: 'rename', label: entry.to, previous: entry.from };
    case 'scene-reorder':
      return { target: 'scene', action: 'reorder', label: '', previous: null };
    default:
      return { target: 'chapter', action: 'reorder', label: '', previous: null };
  }
}

// ----- Historique -----

export class ProjectHistory {
  private undoStack: ProjectHistoryEntry[] = [];
  private redoStack: ProjectHistoryEntry[] = [];
  private readonly limit: number;

  constructor(limit: number = PROJECT_HISTORY_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  /** Enregistre une action deja faite ; vide Retablir. */
  record(entry: ProjectHistoryEntry): void {
    this.undoStack.push(entry);
    while (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  count(direction: ProjectHistoryDirection): number {
    return this.stackFor(direction).length;
  }

  peek(direction: ProjectHistoryDirection): ProjectHistoryEntry | null {
    const stack = this.stackFor(direction);
    return stack[stack.length - 1] ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  undo<S extends SceneLike>(target: ProjectHistoryTarget<S>, confirmed = false): ProjectHistoryResult {
    return this.step('undo', target, confirmed);
  }

  redo<S extends SceneLike>(target: ProjectHistoryTarget<S>, confirmed = false): ProjectHistoryResult {
    return this.step('redo', target, confirmed);
  }

  private stackFor(direction: ProjectHistoryDirection): ProjectHistoryEntry[] {
    return direction === 'undo' ? this.undoStack : this.redoStack;
  }

  private step<S extends SceneLike>(
    direction: ProjectHistoryDirection,
    target: ProjectHistoryTarget<S>,
    confirmed: boolean,
  ): ProjectHistoryResult {
    const source = this.stackFor(direction);
    const entry = source[source.length - 1];
    if (!entry) return { status: 'empty', direction, entry: null, reason: null };
    let applied: Applied;
    try {
      applied = applyEntry(entry, direction, target, confirmed);
    } catch {
      applied = refused(entry, 'error');
    }
    if (applied.status === 'ok') {
      source.pop();
      const destination = this.stackFor(direction === 'undo' ? 'redo' : 'undo');
      destination.push(applied.entry);
      while (destination.length > this.limit) destination.shift();
    } else if (applied.status === 'failed') {
      this.clear();
    }
    return { status: applied.status, direction, entry: applied.entry, reason: applied.reason };
  }
}
