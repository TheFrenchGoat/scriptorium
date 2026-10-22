// src/renderer/components/editor/WbRelationsView.tsx
// Vue des relations entre fiches World Building, affichée dans l'onglet
// « Relations » de l'atelier (WbWorkspace), par-dessus la zone d'écriture.
//
// Onglet « Graphe » :
// - un rond par fiche (icône, nom, couleur) et un trait par relation ;
// - disposition automatique ; les ronds se déplacent à la souris et leurs
//   positions sont mémorisées dans localStorage (pas dans le projet) ;
// - molette : zoom ; glisser le fond : déplacement ;
// - filtres par type de fiche et par genre de relation ;
// - clic sur un rond : fiche à gauche et mise en évidence de ses liens ;
//   Ctrl+clic : ouverture dans un onglet (l'atelier se ferme) ;
// - clic ou clic droit sur un trait : modifier ou supprimer la relation.
//
// Onglet « Arbre généalogique » :
// - liens familiaux seulement (parent, conjoint, couple, frère ou sœur) ;
// - générations en lignes, parents en haut, couples côte à côte ;
// - double-clic sur une personne : l'arbre se recentre sur elle.
//
// Les relations sont enregistrées dans le projet (wbRelations).
// L'ouverture, la fermeture et la touche Échap sont gérées par l'atelier.
// N'importe quel composant peut ouvrir la vue avec `openWbRelations()`.

import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../../i18n';
import type { LanguageCode, WbCategoryDef, WbItem, WbRelation, WbRelationKind } from '../../../shared/types';
import { pickText, relationLabelFrom, resolveCategoryLabel, resolveRelationTypes, WB_FALLBACK_ICON, WB_RELATION_KIND_LABELS, type ResolvedRelationType, type WbTreeRole } from '../../lib/wb-config';
import { closeWbWorkspace, openWbWorkspace, toggleWbWorkspace, useExclusiveDropdown } from '../../lib/wb-workspace';
import { cloneWbData, pushWbHistory, useWbHistoryVersion } from '../../lib/wb-history';
import { Modal } from '../common/Modal';
import type { EditorController } from './useEditorController';
import { openWbPanel } from './WbSidePanel';
import './wb-relations.css';

/**
 * Événement window émis à chaque demande d'ouverture ou de fermeture de la
 * vue des relations (gardé pour compatibilité ; l'atelier fait le travail).
 */
export const WB_RELATIONS_EVENT = 'scriptorium:wb-relations';

export type WbRelationsAction = 'open' | 'close' | 'toggle';

export interface WbRelationsEventDetail {
  action: WbRelationsAction;
}

export function dispatchWbRelationsEvent(detail: WbRelationsEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<WbRelationsEventDetail>(WB_RELATIONS_EVENT, {
      detail,
    }),
  );
  if (detail.action === 'open') {
    openWbWorkspace('relations');
  } else if (detail.action === 'close') {
    closeWbWorkspace();
  } else {
    toggleWbWorkspace('relations');
  }
}

export function openWbRelations(): void {
  dispatchWbRelationsEvent({ action: 'open' });
}

export function closeWbRelations(): void {
  dispatchWbRelationsEvent({ action: 'close' });
}

export function toggleWbRelations(): void {
  dispatchWbRelationsEvent({ action: 'toggle' });
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Valeur des filtres qui affiche tout. */
const FILTER_ALL = '__all__';

/** Positions des ronds du graphe (une seule clé, indexée par id de fiche). */
const POSITIONS_STORAGE_KEY = 'scriptorium.wbRelations.positions';

/** Affichage des fiches sans relation. */
const ISOLATED_STORAGE_KEY = 'scriptorium.wbRelations.showIsolated';

const KIND_ORDER: WbRelationKind[] = ['family', 'social', 'other'];

const NODE_RADIUS = 26;
const SPRING_LENGTH = 190;
const REPULSION = 45000;
const GRAVITY = 0.004;
const LAYOUT_ITERATIONS = 300;

const TREE_BOX_W = 170;
const TREE_BOX_H = 54;
const TREE_ROW_H = 130;
const TREE_GAP = 40;
const TREE_PARTNER_GAP = 28;
const TREE_MAX_NODES = 400;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

/** Distance (px) en dessous de laquelle un appui reste un simple clic. */
const CLICK_TOLERANCE = 4;

/** Délai maximal entre deux clics pour un double-clic (ms). */
const DOUBLE_TAP_DELAY = 350;

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface ViewBox {
  x: number;
  y: number;
  k: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Tab = 'graph' | 'tree';

interface RelationDraft {
  id: string | null;
  sourceId: string;
  typeId: string;
  targetId: string;
  note: string;
}

interface EdgeMenu {
  relationId: string;
  x: number;
  y: number;
}

interface DragState {
  mode: 'pan' | 'node';
  id: string | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  ctrl: boolean;
  pointerId: number;
}

interface FamilyMaps {
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  partners: Map<string, Set<string>>;
  siblings: Map<string, Set<string>>;
  members: Set<string>;
}

interface TreeNode {
  id: string;
  x: number;
  y: number;
}

interface TreeLink {
  key: string;
  d: string;
  role: WbTreeRole;
}

interface TreeLayout {
  nodes: TreeNode[];
  links: TreeLink[];
  bounds: Bounds;
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function readPositions(): Record<string, Point> {
  try {
    const raw = window.localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, Point> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const point = value as Partial<Point> | null;
      if (point && typeof point.x === 'number' && typeof point.y === 'number' && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        result[id] = { x: point.x, y: point.y };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function storePositions(positions: Record<string, Point>): void {
  try {
    const rounded: Record<string, Point> = {};
    for (const [id, point] of Object.entries(positions)) {
      rounded[id] = { x: Math.round(point.x), y: Math.round(point.y) };
    }
    window.localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(rounded));
  } catch {
    // Sans conséquence : la disposition sera recalculée.
  }
}

/**
 * Modifie les positions enregistrées : un point remplace la position,
 * null la supprime (elle sera recalculée). Sert à annuler / rétablir.
 */
function patchStoredPositions(patch: Record<string, Point | null>): void {
  const stored = readPositions();
  for (const [id, point] of Object.entries(patch)) {
    if (point) stored[id] = { x: point.x, y: point.y };
    else delete stored[id];
  }
  storePositions(stored);
}

function readShowIsolated(): boolean {
  try {
    return window.localStorage.getItem(ISOLATED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeShowIsolated(value: boolean): void {
  try {
    window.localStorage.setItem(ISOLATED_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Sans conséquence.
  }
}

/**
 * Remplace {nom} par sa valeur dans un texte traduit.
 */
function fill(text: string, vars: Record<string, string | number>): string {
  let result = text;
  for (const key of Object.keys(vars)) {
    result = result.split('{' + key + '}').join(String(vars[key]));
  }
  return result;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}

function newRelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Zoom autour d'un point de l'écran (coordonnées locales au SVG). */
function zoomAt(view: ViewBox, px: number, py: number, factor: number): ViewBox {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return {
    k,
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
  };
}

function extendBounds(bounds: Bounds | null, minX: number, minY: number, maxX: number, maxY: number): Bounds {
  if (!bounds) return { minX, minY, maxX, maxY };
  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
  };
}

function moveToward(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return from;
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}

/**
 * Tracé d'un trait entre deux ronds. `offset` courbe le trait (relations
 * multiples entre les deux mêmes fiches).
 */
function edgeGeometry(a: Point, b: Point, offset: number, arrow: boolean): { path: string; label: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const control: Point = {
    x: (a.x + b.x) / 2 + (-dy / length) * offset,
    y: (a.y + b.y) / 2 + (dx / length) * offset,
  };
  const start = moveToward(a, control, NODE_RADIUS);
  const end = moveToward(b, control, NODE_RADIUS + (arrow ? 3 : 0));
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: {
      x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    },
  };
}

/**
 * Disposition par forces. Les fiches qui ont déjà une position (`fixed`)
 * ne bougent pas ; seules les nouvelles sont placées.
 */
function layoutGraph(ids: string[], edges: Array<[string, string]>, fixed: Record<string, Point>): Record<string, Point> {
  const result: Record<string, Point> = {};
  const idSet = new Set(ids);
  const neighbors = new Map<string, string[]>();
  for (const id of ids) neighbors.set(id, []);

  const links: Array<[string, string]> = [];
  for (const edge of edges) {
    const a = edge[0];
    const b = edge[1];
    if (!idSet.has(a) || !idSet.has(b) || a === b) continue;
    links.push(edge);
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  }

  let sumX = 0;
  let sumY = 0;
  let fixedCount = 0;
  for (const id of ids) {
    const point = fixed[id];
    if (point) {
      result[id] = { x: point.x, y: point.y };
      sumX += point.x;
      sumY += point.y;
      fixedCount += 1;
    }
  }
  const center: Point = fixedCount > 0 ? { x: sumX / fixedCount, y: sumY / fixedCount } : { x: 0, y: 0 };

  // Placement initial : près d'un voisin déjà placé, sinon en spirale.
  const free: string[] = [];
  let index = 0;
  for (const id of ids) {
    if (result[id]) continue;
    free.push(id);
    const anchorId = (neighbors.get(id) ?? []).find((other) => Boolean(result[other]));
    const anchor = anchorId ? result[anchorId] : undefined;
    const base = anchor ?? center;
    const angle = index * 2.39996;
    const radius = anchor ? SPRING_LENGTH * 0.8 : 60 + 45 * Math.sqrt(index + 1) + (fixedCount > 0 ? 220 : 0);
    result[id] = {
      x: base.x + Math.cos(angle) * radius,
      y: base.y + Math.sin(angle) * radius,
    };
    index += 1;
  }

  if (free.length === 0) return result;

  const isFree = new Set(free);

  for (let step = 0; step < LAYOUT_ITERATIONS; step += 1) {
    const limit = 40 * (1 - step / LAYOUT_ITERATIONS) + 2;
    const moves = new Map<string, Point>();
    for (const id of free) moves.set(id, { x: 0, y: 0 });

    // Répulsion entre toutes les fiches.
    for (let i = 0; i < ids.length; i += 1) {
      const a = ids[i] as string;
      const pa = result[a] as Point;
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = ids[j] as string;
        if (!isFree.has(a) && !isFree.has(b)) continue;
        const pb = result[b] as Point;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          dx = 0.1 * (j - i);
          dy = 0.1;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const force = REPULSION / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const ma = moves.get(a);
        if (ma) {
          ma.x += fx;
          ma.y += fy;
        }
        const mb = moves.get(b);
        if (mb) {
          mb.x -= fx;
          mb.y -= fy;
        }
      }
    }

    // Ressorts le long des relations.
    for (const link of links) {
      const a = link[0];
      const b = link[1];
      const pa = result[a] as Point;
      const pb = result[b] as Point;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - SPRING_LENGTH) * 0.06;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const ma = moves.get(a);
      if (ma) {
        ma.x += fx;
        ma.y += fy;
      }
      const mb = moves.get(b);
      if (mb) {
        mb.x -= fx;
        mb.y -= fy;
      }
    }

    // Légère attraction vers le centre, puis déplacement limité.
    for (const id of free) {
      const move = moves.get(id);
      const point = result[id];
      if (!move || !point) continue;
      move.x += (center.x - point.x) * GRAVITY;
      move.y += (center.y - point.y) * GRAVITY;
      const length = Math.hypot(move.x, move.y);
      if (length > limit) {
        move.x *= limit / length;
        move.y *= limit / length;
      }
      point.x += move.x;
      point.y += move.y;
    }
  }

  return result;
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Liens familiaux (seuls les types ayant un rôle d'arbre comptent).
 */
function buildFamily(relations: WbRelation[], roleOf: (typeId: string) => WbTreeRole | undefined): FamilyMaps {
  const family: FamilyMaps = {
    parents: new Map(),
    children: new Map(),
    partners: new Map(),
    siblings: new Map(),
    members: new Set(),
  };
  for (const relation of relations) {
    const role = roleOf(relation.typeId);
    if (!role) continue;
    const a = relation.sourceId;
    const b = relation.targetId;
    if (role === 'parent') {
      addTo(family.parents, b, a);
      addTo(family.children, a, b);
    } else if (role === 'partner') {
      addTo(family.partners, a, b);
      addTo(family.partners, b, a);
    } else {
      addTo(family.siblings, a, b);
      addTo(family.siblings, b, a);
    }
    family.members.add(a);
    family.members.add(b);
  }
  return family;
}

function toUnits(row: string[], partners: Map<string, Set<string>>): string[][] {
  const used = new Set<string>();
  const units: string[][] = [];
  for (const id of row) {
    if (used.has(id)) continue;
    const unit: string[] = [id];
    used.add(id);
    partners.get(id)?.forEach((partner) => {
      if (row.includes(partner) && !used.has(partner)) {
        unit.push(partner);
        used.add(partner);
      }
    });
    units.push(unit);
  }
  return units;
}

/**
 * Arbre généalogique autour d'une personne : générations en lignes,
 * couples côte à côte, ordre ajusté pour limiter les croisements.
 */
function buildTree(rootId: string, family: FamilyMaps): TreeLayout {
  const generation = new Map<string, number>();
  const order: string[] = [];
  const queue: string[] = [rootId];
  generation.set(rootId, 0);

  while (queue.length > 0 && order.length < TREE_MAX_NODES) {
    const id = queue.shift() as string;
    order.push(id);
    const level = generation.get(id) ?? 0;
    const visit = (set: Set<string> | undefined, delta: number): void => {
      set?.forEach((other) => {
        if (!generation.has(other)) {
          generation.set(other, level + delta);
          queue.push(other);
        }
      });
    };
    visit(family.parents.get(id), -1);
    visit(family.partners.get(id), 0);
    visit(family.siblings.get(id), 0);
    visit(family.children.get(id), 1);
  }

  const inTree = new Set(order);
  const levels = Array.from(new Set(order.map((id) => generation.get(id) ?? 0))).sort((a, b) => a - b);
  const unitRows: string[][][] = levels.map((level) => toUnits(order.filter((id) => generation.get(id) === level), family.partners));

  const rankIn = (units: string[][]): Map<string, number> => {
    const ranks = new Map<string, number>();
    let rank = 0;
    for (const unit of units) {
      for (const id of unit) {
        ranks.set(id, rank);
        rank += 1;
      }
    }
    return ranks;
  };

  const reorder = (rowIndex: number, refIndex: number, related: Map<string, Set<string>>): void => {
    const current = unitRows[rowIndex];
    const reference = unitRows[refIndex];
    if (!current || !reference) return;
    const ranks = rankIn(reference);
    const scored = current.map((unit, position) => {
      let sum = 0;
      let count = 0;
      for (const id of unit) {
        related.get(id)?.forEach((other) => {
          const rank = ranks.get(other);
          if (rank !== undefined) {
            sum += rank;
            count += 1;
          }
        });
      }
      return { unit, score: count > 0 ? sum / count : position };
    });
    scored.sort((a, b) => a.score - b.score);
    unitRows[rowIndex] = scored.map((entry) => entry.unit);
  };

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 1; i < unitRows.length; i += 1) reorder(i, i - 1, family.parents);
    for (let i = unitRows.length - 2; i >= 0; i -= 1) reorder(i, i + 1, family.children);
  }

  // Coordonnées : chaque ligne est centrée sur 0.
  const nodes: TreeNode[] = [];
  const positions = new Map<string, Point>();
  unitRows.forEach((units, rowIndex) => {
    let width = 0;
    units.forEach((unit, unitIndex) => {
      width += unit.length * TREE_BOX_W + (unit.length - 1) * TREE_PARTNER_GAP;
      if (unitIndex > 0) width += TREE_GAP;
    });
    let x = -width / 2;
    const y = rowIndex * TREE_ROW_H;
    units.forEach((unit, unitIndex) => {
      if (unitIndex > 0) x += TREE_GAP;
      unit.forEach((id, memberIndex) => {
        if (memberIndex > 0) x += TREE_PARTNER_GAP;
        const point = { x: x + TREE_BOX_W / 2, y };
        positions.set(id, point);
        nodes.push({ id, x: point.x, y: point.y });
        x += TREE_BOX_W;
      });
    });
  });

  const links: TreeLink[] = [];
  const halfW = TREE_BOX_W / 2;
  const halfH = TREE_BOX_H / 2;

  // Couples : trait horizontal entre les deux cadres.
  family.partners.forEach((set, a) => {
    set.forEach((b) => {
      if (a >= b || !inTree.has(a) || !inTree.has(b)) return;
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (!pa || !pb || pa.y !== pb.y) return;
      const left = pa.x < pb.x ? pa : pb;
      const right = pa.x < pb.x ? pb : pa;
      links.push({ key: 'p-' + a + '-' + b, d: `M ${left.x + halfW} ${left.y} H ${right.x - halfW}`, role: 'partner' });
    });
  });

  // Parents vers enfants (depuis le milieu du couple quand les deux parents
  // sont ensemble).
  for (const childId of order) {
    const child = positions.get(childId);
    if (!child) continue;
    const parentIds = Array.from(family.parents.get(childId) ?? new Set<string>()).filter((id) => inTree.has(id));
    if (parentIds.length === 0) continue;
    const childTop = child.y - halfH;
    const midY = childTop - (TREE_ROW_H - TREE_BOX_H) / 2;
    const first = parentIds[0] as string;
    const second = parentIds[1];
    const p1 = positions.get(first);
    const p2 = second ? positions.get(second) : undefined;
    const isCouple = parentIds.length === 2 && second !== undefined && Boolean(family.partners.get(first)?.has(second)) && p1 !== undefined && p2 !== undefined && p1.y === p2.y && p1.y < child.y;
    if (isCouple && p1 && p2) {
      const startX = (p1.x + p2.x) / 2;
      links.push({ key: 'c-' + childId, d: `M ${startX} ${p1.y} V ${midY} H ${child.x} V ${childTop}`, role: 'parent' });
      continue;
    }
    for (const parentId of parentIds) {
      const parent = positions.get(parentId);
      if (!parent) continue;
      if (parent.y >= child.y) {
        links.push({ key: 'c-' + parentId + '-' + childId, d: `M ${parent.x} ${parent.y} L ${child.x} ${child.y}`, role: 'parent' });
      } else {
        links.push({ key: 'c-' + parentId + '-' + childId, d: `M ${parent.x} ${parent.y + halfH} V ${midY} H ${child.x} V ${childTop}`, role: 'parent' });
      }
    }
  }

  // Frères et sœurs sans parent commun affiché : crochet au-dessus.
  family.siblings.forEach((set, a) => {
    set.forEach((b) => {
      if (a >= b || !inTree.has(a) || !inTree.has(b)) return;
      const parentsA = family.parents.get(a);
      const parentsB = family.parents.get(b);
      let shared = false;
      parentsA?.forEach((parentId) => {
        if (parentsB?.has(parentId) && inTree.has(parentId)) shared = true;
      });
      if (shared) return;
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (!pa || !pb || pa.y !== pb.y) return;
      const top = pa.y - halfH;
      links.push({ key: 's-' + a + '-' + b, d: `M ${pa.x} ${top} V ${top - 16} H ${pb.x} V ${top}`, role: 'sibling' });
    });
  });

  let bounds: Bounds = { minX: -halfW, minY: -halfH, maxX: halfW, maxY: halfH };
  for (const node of nodes) {
    bounds = extendBounds(bounds, node.x - halfW, node.y - halfH - 20, node.x + halfW, node.y + halfH);
  }

  return { nodes, links, bounds };
}

/**
 * Une fenêtre (Modal) est-elle visible ? Les fonds de modale sont `.modal`
 * (Modal.tsx) ; les autres classes couvrent d'éventuelles anciennes fenêtres.
 */
function isAnyModalOpen(): boolean {
  const elements = document.querySelectorAll<HTMLElement>('.modal, .modal-overlay, .modal-backdrop');
  for (const element of Array.from(elements)) {
    if (window.getComputedStyle(element).display !== 'none') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Menu déroulant aux couleurs du thème (mêmes classes que la vue en cartes)
// ---------------------------------------------------------------------------

interface RelSelectOption {
  value: string;
  label: string;
  icon?: string;
  group?: string;
}

interface RelSelectProps {
  value: string;
  options: RelSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

/**
 * Menu déroulant dessiné par l'application.
 * Clic ou Entrée : ouvre la liste. Flèches : déplacent la surbrillance.
 * Entrée : valide. Échap : ferme la liste seulement.
 * Un seul menu déroulant ouvert à la fois dans toute l'application.
 */
function RelSelect({ value, options, onChange, ariaLabel, placeholder }: RelSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useExclusiveDropdown(open, () => setOpen(false));

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: globalThis.MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const element = listRef.current?.querySelector<HTMLElement>('[data-index="' + highlight + '"]');
    element?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  function openList(): void {
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number): void {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((previous) => {
        const count = options.length;
        if (count === 0) return -1;
        return (previous + step + count) % count;
      });
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (open && highlight >= 0) {
        choose(highlight);
      } else {
        openList();
      }
      return;
    }

    if (event.key === 'Tab' && open) {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={'wb-cards-dd wb-rel-dd' + (open ? ' open' : '')}
    >
      <button
        type="button"
        className="wb-cards-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openList();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {selected?.icon && (
          <span className="wb-cards-dd-icon">{selected.icon}</span>
        )}
        <span className={'wb-cards-dd-label' + (selected ? '' : ' wb-rel-dd-placeholder')}>
          {selected ? selected.label : placeholder ?? ''}
        </span>
        <span className="wb-cards-dd-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul
          ref={listRef}
          className="wb-cards-dd-list"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const optionClass =
              'wb-cards-dd-option' +
              (isSelected ? ' selected' : '') +
              (index === highlight ? ' highlighted' : '');
            const showGroup = Boolean(option.group) && option.group !== options[index - 1]?.group;
            return (
              <Fragment key={option.value}>
                {showGroup && (
                  <li className="wb-rel-dd-group" role="presentation">
                    {option.group}
                  </li>
                )}
                <li
                  data-index={index}
                  className={optionClass}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span className="wb-cards-dd-check" aria-hidden="true">
                    {isSelected ? '✓' : ''}
                  </span>
                  {option.icon && (
                    <span className="wb-cards-dd-icon">{option.icon}</span>
                  )}
                  <span className="wb-cards-dd-label">{option.label}</span>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue des relations
// ---------------------------------------------------------------------------

interface WbRelationsViewProps {
  controller: EditorController;
}

export function WbRelationsView({ controller }: WbRelationsViewProps) {
  const { t } = useI18n();

  /** Langue de l'interface, déduite d'une traduction connue. */
  const lang: LanguageCode = t('cancel') === 'Cancel' ? 'en' : 'fr';

  const [tab, setTab] = useState<Tab>('graph');
  const [filterType, setFilterType] = useState<string>(FILTER_ALL);
  const [filterKind, setFilterKind] = useState<string>(FILTER_ALL);
  const [showIsolated, setShowIsolated] = useState<boolean>(readShowIsolated);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeRoot, setTreeRoot] = useState<string | null>(null);
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, k: 1 });
  const [draft, setDraft] = useState<RelationDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<WbRelation | null>(null);
  const [menu, setMenu] = useState<EdgeMenu | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const [, setVersion] = useState(0);
  // Historique de l'atelier : redessine la vue après Ctrl+Z / Ctrl+Y.
  const historyVersion = useWbHistoryVersion();
  const historySeenRef = useRef(historyVersion);
  // Positions des ronds au repos (avant un glissement), pour l'historique.
  const restPositionsRef = useRef<Record<string, Point>>({});

  // Les positions sont lues une seule fois, au montage (l'atelier démonte
  // la vue à sa fermeture : elles sont donc relues à chaque ouverture).
  const [initialPositions] = useState<Record<string, Point>>(readPositions);
  const positionsRef = useRef<Record<string, Point>>(initialPositions);
  const dragRef = useRef<DragState | null>(null);
  const fitPendingRef = useRef(true);
  const boundsRef = useRef<Bounds | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Le menu contextuel compte comme un menu déroulant : un seul ouvert.
  useExclusiveDropdown(menu !== null, () => setMenu(null));

  function redraw(): void {
    setVersion((previous) => previous + 1);
  }

  /** Cadre la vue sur tout le contenu dessiné. */
  function fitView(): void {
    const bounds = boundsRef.current;
    if (!svgEl || !bounds) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const padding = 40;
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    const k = clampZoom(Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height, 1.4));
    setView({
      k,
      x: rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
      y: rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
    });
  }

  // -------------------------------------------------------------------------
  // Clavier, molette, clics en dehors
  // -------------------------------------------------------------------------

  // Échap ferme le menu contextuel. Écouteur en phase de capture : il passe
  // avant celui de l'atelier, qui ignore ensuite la touche (defaultPrevented).
  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (isAnyModalOpen()) return;
      event.preventDefault();
      setMenu(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);

  // Molette : zoom autour du curseur (écouteur non passif pour bloquer le
  // défilement de la page d'écriture derrière).
  useEffect(() => {
    if (!svgEl) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((previous) => zoomAt(previous, px, py, factor));
    };
    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', onWheel);
    };
  }, [svgEl]);

  // Fermeture du menu contextuel au clic en dehors.
  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (event: globalThis.MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menu]);

  // Cadrage automatique demandé (ouverture, changement d'onglet...). La
  // demande reste en attente tant que le graphe n'est pas visible.
  useEffect(() => {
    if (!fitPendingRef.current || !svgEl || !boundsRef.current) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    fitPendingRef.current = false;
    fitView();
  });

  // -------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------

  const data = controller.data();
  const world: Record<string, WbItem> = data.world ?? {};
  const categories: Record<string, WbCategoryDef> = data.wbCategories ?? {};
  const relationTypes: ResolvedRelationType[] = resolveRelationTypes(data.wbRelationTypes, lang);
  const typeById = new Map<string, ResolvedRelationType>(relationTypes.map((type) => [type.id, type] as const));

  function itemOf(id: string): WbItem | undefined {
    return world[id];
  }

  function nameOf(id: string): string {
    return itemOf(id)?.name ?? '';
  }

  function itemIcon(item: WbItem): string {
    return item.icon || categories[item.wbType]?.icon || WB_FALLBACK_ICON;
  }

  function itemColor(item: WbItem): string {
    return item.color || categories[item.wbType]?.color || 'var(--accent)';
  }

  function categoryLabel(slug: string): string {
    return resolveCategoryLabel(categories[slug], slug, lang);
  }

  function categoryIcon(slug: string): string {
    return categories[slug]?.icon || WB_FALLBACK_ICON;
  }

  function kindOf(relation: WbRelation): WbRelationKind {
    return typeById.get(relation.typeId)?.kind ?? 'other';
  }

  function relationLabel(relation: WbRelation): string {
    const type = typeById.get(relation.typeId);
    return type ? relationLabelFrom(type, true) : relation.typeId;
  }

  function isDirected(relation: WbRelation): boolean {
    const type = typeById.get(relation.typeId);
    return Boolean(type) && type?.symmetric === false;
  }

  const itemIds: string[] = Object.keys(world)
    .filter((id) => Boolean(world[id]))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base', numeric: true }));

  const allRelations: WbRelation[] = (data.wbRelations ?? []).filter(
    (relation) => Boolean(world[relation.sourceId]) && Boolean(world[relation.targetId]) && relation.sourceId !== relation.targetId,
  );

  const typeSlugs: string[] = Object.keys(categories);
  for (const id of itemIds) {
    const item = itemOf(id);
    if (item && item.wbType && !typeSlugs.includes(item.wbType)) {
      typeSlugs.push(item.wbType);
    }
  }

  // -------------------------------------------------------------------------
  // Graphe : filtres et disposition
  // -------------------------------------------------------------------------

  const activeType = filterType === FILTER_ALL || typeSlugs.includes(filterType) ? filterType : FILTER_ALL;

  function typeMatches(id: string): boolean {
    return activeType === FILTER_ALL || itemOf(id)?.wbType === activeType;
  }

  const graphRelations: WbRelation[] = allRelations.filter(
    (relation) => (filterKind === FILTER_ALL || kindOf(relation) === filterKind) && typeMatches(relation.sourceId) && typeMatches(relation.targetId),
  );

  const linkedIds = new Set<string>();
  for (const relation of graphRelations) {
    linkedIds.add(relation.sourceId);
    linkedIds.add(relation.targetId);
  }

  const graphNodeIds: string[] = itemIds.filter((id) => typeMatches(id) && (showIsolated || linkedIds.has(id)));

  // Après une annulation ou un rétablissement : positions relues (hors glissement).
  if (historySeenRef.current !== historyVersion && !dragRef.current) {
    historySeenRef.current = historyVersion;
    positionsRef.current = readPositions();
  }

  if (tab === 'graph' && graphNodeIds.some((id) => !positionsRef.current[id])) {
    const edges: Array<[string, string]> = allRelations.map((relation) => [relation.sourceId, relation.targetId] as [string, string]);
    const computed = layoutGraph(graphNodeIds, edges, positionsRef.current);
    positionsRef.current = { ...positionsRef.current, ...computed };
    storePositions(positionsRef.current);
  }

  // Positions au repos, mémorisées pour pouvoir annuler un déplacement de rond.
  if (!dragRef.current) restPositionsRef.current = cloneWbData(positionsRef.current);

  // Fiche sélectionnée et ses voisins directs.
  const activeSelection = selectedId && graphNodeIds.includes(selectedId) ? selectedId : null;
  const neighborIds = new Set<string>();
  if (activeSelection) {
    for (const relation of graphRelations) {
      if (relation.sourceId === activeSelection) neighborIds.add(relation.targetId);
      if (relation.targetId === activeSelection) neighborIds.add(relation.sourceId);
    }
  }

  // -------------------------------------------------------------------------
  // Arbre généalogique
  // -------------------------------------------------------------------------

  const family = buildFamily(allRelations, (typeId) => typeById.get(typeId)?.treeRole);
  const familyIds: string[] = itemIds.filter((id) => family.members.has(id));
  const rootId: string | null = treeRoot && family.members.has(treeRoot) ? treeRoot : familyIds[0] ?? null;
  const tree: TreeLayout | null = tab === 'tree' && rootId ? buildTree(rootId, family) : null;

  // -------------------------------------------------------------------------
  // Contenu dessiné et cadrage
  // -------------------------------------------------------------------------

  let message: 'noSheets' | 'empty' | 'noMatch' | 'treeNoFamily' | 'treeEmpty' | null = null;
  if (tab === 'graph') {
    if (allRelations.length === 0 && itemIds.length < 2) message = 'noSheets';
    else if (allRelations.length === 0 && !showIsolated) message = 'empty';
    else if (graphNodeIds.length === 0) message = 'noMatch';
  } else if (familyIds.length === 0) {
    message = 'treeNoFamily';
  } else if (!tree) {
    message = 'treeEmpty';
  }

  let bounds: Bounds | null = null;
  if (!message) {
    if (tab === 'graph') {
      for (const id of graphNodeIds) {
        const point = positionsRef.current[id];
        if (!point) continue;
        bounds = extendBounds(bounds, point.x - NODE_RADIUS - 50, point.y - NODE_RADIUS - 10, point.x + NODE_RADIUS + 50, point.y + NODE_RADIUS + 28);
      }
    } else if (tree) {
      bounds = tree.bounds;
    }
  }
  boundsRef.current = bounds;

  // -------------------------------------------------------------------------
  // Enregistrement des relations
  // -------------------------------------------------------------------------

  function writeRelations(next: WbRelation[]): void {
    const projectData = controller.data();
    projectData.wbRelations = next;
    controller.setSaveStatus('pending');
    void controller.saveWholeProject();
  }

  /** Enregistre les relations et ajoute l'action à l'historique de l'atelier. */
  function commitRelations(next: WbRelation[]): void {
    const before = cloneWbData(controller.data().wbRelations ?? []);
    const after = cloneWbData(next);
    writeRelations(next);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      pushWbHistory({
        tab: 'relations',
        labelKey:
          after.length > before.length
            ? 'wbHistRelCreate'
            : after.length < before.length
              ? 'wbHistRelDelete'
              : 'wbHistRelEdit',
        undo: () => writeRelations(cloneWbData(before)),
        redo: () => writeRelations(cloneWbData(after)),
      });
    }
    redraw();
  }

  function openAdd(sourceId?: string): void {
    if (itemIds.length < 2) return;
    setMenu(null);
    setDraft({
      id: null,
      sourceId: sourceId ?? activeSelection ?? '',
      typeId: relationTypes[0]?.id ?? '',
      targetId: '',
      note: '',
    });
    setDraftError('');
  }

  function openEdit(relation: WbRelation): void {
    setMenu(null);
    setDraft({
      id: relation.id,
      sourceId: relation.sourceId,
      typeId: relation.typeId,
      targetId: relation.targetId,
      note: relation.note ?? '',
    });
    setDraftError('');
  }

  function closeDraft(): void {
    setDraft(null);
    setDraftError('');
  }

  function updateDraft(changes: Partial<RelationDraft>): void {
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));
    setDraftError('');
  }

  function saveDraft(): void {
    if (!draft) return;
    if (!draft.sourceId || !draft.targetId || !draft.typeId) {
      setDraftError(t('wbRelSelectRequired'));
      return;
    }
    if (draft.sourceId === draft.targetId) {
      setDraftError(t('wbRelSameItem'));
      return;
    }
    const type = typeById.get(draft.typeId);
    const existing = controller.data().wbRelations ?? [];
    const duplicate = existing.some((relation) => {
      if (relation.id === draft.id || relation.typeId !== draft.typeId) return false;
      if (relation.sourceId === draft.sourceId && relation.targetId === draft.targetId) return true;
      return Boolean(type?.symmetric) && relation.sourceId === draft.targetId && relation.targetId === draft.sourceId;
    });
    if (duplicate) {
      setDraftError(t('wbRelDuplicate'));
      return;
    }

    const note = draft.note.trim();
    const relation: WbRelation = {
      id: draft.id ?? newRelationId(),
      sourceId: draft.sourceId,
      targetId: draft.targetId,
      typeId: draft.typeId,
    };
    if (note) relation.note = note;

    if (draft.id) {
      commitRelations(existing.map((entry) => (entry.id === draft.id ? relation : entry)));
    } else {
      commitRelations(existing.concat(relation));
    }
    closeDraft();
  }

  function askDelete(relation: WbRelation): void {
    setMenu(null);
    setDraft(null);
    setPendingDelete(relation);
  }

  function confirmDelete(): void {
    if (!pendingDelete) return;
    const existing = controller.data().wbRelations ?? [];
    commitRelations(existing.filter((entry) => entry.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  // -------------------------------------------------------------------------
  // Souris : déplacement, zoom, clics
  // -------------------------------------------------------------------------

  function zoomBy(factor: number): void {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    setView((previous) => zoomAt(previous, rect.width / 2, rect.height / 2, factor));
  }

  function resetLayout(): void {
    const removed: Record<string, Point> = {};
    const next = { ...positionsRef.current };
    for (const id of itemIds) {
      if (next[id]) removed[id] = { x: next[id].x, y: next[id].y };
      delete next[id];
    }
    positionsRef.current = next;
    storePositions(next);
    fitPendingRef.current = true;
    if (Object.keys(removed).length > 0) {
      const cleared: Record<string, Point | null> = {};
      for (const id of Object.keys(removed)) cleared[id] = null;
      pushWbHistory({
        tab: 'relations',
        labelKey: 'wbHistRelLayout',
        undo: () => patchStoredPositions(removed),
        redo: () => patchStoredPositions(cleared),
      });
    }
    redraw();
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0) return;
    setMenu(null);
    dragRef.current = {
      mode: 'pan',
      id: null,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      moved: false,
      ctrl: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleNodePointerDown(event: ReactPointerEvent<SVGGElement>, id: string): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    setMenu(null);
    const point = tab === 'graph' ? positionsRef.current[id] : undefined;
    dragRef.current = {
      mode: point ? 'node' : 'pan',
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: point ? point.x : view.x,
      originY: point ? point.y : view.y,
      moved: false,
      ctrl: event.ctrlKey || event.metaKey,
      pointerId: event.pointerId,
    };
    svgEl?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_TOLERANCE) return;
    drag.moved = true;
    if (drag.mode === 'pan') {
      setView((previous) => ({ ...previous, x: drag.originX + dx, y: drag.originY + dy }));
      return;
    }
    if (drag.id) {
      positionsRef.current[drag.id] = {
        x: drag.originX + dx / view.k,
        y: drag.originY + dy / view.k,
      };
      redraw();
    }
  }

  /** Fin du déplacement d'un rond : enregistre la position et l'ajoute à l'historique. */
  function finishNodeMove(id: string | null): void {
    storePositions(positionsRef.current);
    if (!id) return;
    const nodeId = id;
    const before = restPositionsRef.current[nodeId];
    const after = positionsRef.current[nodeId];
    if (!before || !after) return;
    if (Math.round(before.x) === Math.round(after.x) && Math.round(before.y) === Math.round(after.y)) return;
    const from: Point = { x: before.x, y: before.y };
    const to: Point = { x: after.x, y: after.y };
    pushWbHistory({
      tab: 'relations',
      labelKey: 'wbHistRelMoveNode',
      undo: () => patchStoredPositions({ [nodeId]: from }),
      redo: () => patchStoredPositions({ [nodeId]: to }),
    });
  }

  function releasePointer(pointerId: number): void {
    if (svgEl && svgEl.hasPointerCapture(pointerId)) {
      svgEl.releasePointerCapture(pointerId);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releasePointer(event.pointerId);
    if (drag.moved) {
      if (drag.mode === 'node') finishNodeMove(drag.id);
      return;
    }
    if (!drag.id) {
      setSelectedId(null);
      return;
    }
    handleNodeTap(drag.id, drag.ctrl);
  }

  function handlePointerCancel(event: ReactPointerEvent<SVGSVGElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releasePointer(event.pointerId);
    if (drag.moved && drag.mode === 'node') finishNodeMove(drag.id);
  }

  function handleNodeTap(id: string, ctrl: boolean): void {
    if (ctrl) {
      controller.openItem(id, 'world');
      closeWbWorkspace();
      return;
    }
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble = Boolean(last) && last?.id === id && now - (last?.time ?? 0) < DOUBLE_TAP_DELAY;
    lastTapRef.current = { id, time: now };
    if (isDouble && tab === 'tree') {
      setTreeRoot(id);
      fitPendingRef.current = true;
      return;
    }
    setSelectedId(id);
    openWbPanel(id);
  }

  function handleEdgeClick(event: ReactMouseEvent<SVGGElement>, relation: WbRelation): void {
    event.stopPropagation();
    openEdit(relation);
  }

  function handleEdgeContextMenu(event: ReactMouseEvent<SVGGElement>, relation: WbRelation): void {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      relationId: relation.id,
      x: Math.min(event.clientX, window.innerWidth - 200),
      y: Math.min(event.clientY, window.innerHeight - 100),
    });
  }

  function switchTab(next: Tab): void {
    if (next === tab) return;
    if (next === 'tree' && selectedId && family.members.has(selectedId)) {
      setTreeRoot(selectedId);
    }
    setTab(next);
    setMenu(null);
    fitPendingRef.current = true;
  }

  // -------------------------------------------------------------------------
  // Options des menus déroulants
  // -------------------------------------------------------------------------

  const typeFilterOptions: RelSelectOption[] = [{ value: FILTER_ALL, label: t('wbRelFilterAll') }];
  for (const slug of typeSlugs) {
    typeFilterOptions.push({ value: slug, label: categoryLabel(slug), icon: categoryIcon(slug) });
  }

  const kindFilterOptions: RelSelectOption[] = [{ value: FILTER_ALL, label: t('wbRelFilterAll') }];
  for (const kind of KIND_ORDER) {
    kindFilterOptions.push({ value: kind, label: pickText(WB_RELATION_KIND_LABELS[kind], lang) });
  }

  const itemOptions: RelSelectOption[] = itemIds.map((id) => {
    const item = itemOf(id) as WbItem;
    return { value: id, label: item.name, icon: itemIcon(item) };
  });

  const familyOptions: RelSelectOption[] = itemOptions.filter((option) => family.members.has(option.value));

  const relationTypeOptions: RelSelectOption[] = [];
  for (const kind of KIND_ORDER) {
    for (const type of relationTypes) {
      if (type.kind === kind) {
        relationTypeOptions.push({ value: type.id, label: type.label, group: pickText(WB_RELATION_KIND_LABELS[kind], lang) });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Affichage : graphe
  // -------------------------------------------------------------------------

  function renderGraph() {
    // Relations multiples entre deux mêmes fiches : traits courbés.
    const pairCounts = new Map<string, number>();
    const pairKey = (relation: WbRelation): string =>
      relation.sourceId < relation.targetId ? relation.sourceId + '|' + relation.targetId : relation.targetId + '|' + relation.sourceId;
    for (const relation of graphRelations) {
      const key = pairKey(relation);
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    const pairSeen = new Map<string, number>();

    const edges = graphRelations.map((relation) => {
      const a = positionsRef.current[relation.sourceId];
      const b = positionsRef.current[relation.targetId];
      if (!a || !b) return null;
      const key = pairKey(relation);
      const total = pairCounts.get(key) ?? 1;
      const rank = pairSeen.get(key) ?? 0;
      pairSeen.set(key, rank + 1);
      const sign = relation.sourceId < relation.targetId ? 1 : -1;
      const offset = (rank - (total - 1) / 2) * 46 * sign;
      const directed = isDirected(relation);
      const geometry = edgeGeometry(a, b, offset, directed);
      const kind = kindOf(relation);
      const label = relationLabel(relation);
      const touches = activeSelection !== null && (relation.sourceId === activeSelection || relation.targetId === activeSelection);
      const edgeClass =
        'wb-rel-edge kind-' + kind +
        (activeSelection && !touches ? ' dim' : '') +
        (touches ? ' highlighted' : '');
      const titleLines = [nameOf(relation.sourceId) + ' — ' + label + ' — ' + nameOf(relation.targetId)];
      if (relation.note) titleLines.push(relation.note);
      titleLines.push(t('wbRelEdgeTitle'));
      return (
        <g
          key={relation.id}
          className={edgeClass}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => handleEdgeClick(event, relation)}
          onContextMenu={(event) => handleEdgeContextMenu(event, relation)}
        >
          <title>{titleLines.join('\n')}</title>
          <path className="wb-rel-edge-hit" d={geometry.path} />
          <path
            className="wb-rel-edge-line"
            d={geometry.path}
            markerEnd={directed ? 'url(#wb-rel-arrow-' + kind + ')' : undefined}
          />
          <text
            className="wb-rel-edge-label"
            x={geometry.label.x}
            y={geometry.label.y}
            textAnchor="middle"
            dy="-0.35em"
          >
            {truncate(label, 28)}
          </text>
        </g>
      );
    });

    const nodes = graphNodeIds.map((id) => {
      const item = itemOf(id);
      const point = positionsRef.current[id];
      if (!item || !point) return null;
      const isSelected = activeSelection === id;
      const isDim = activeSelection !== null && !isSelected && !neighborIds.has(id);
      const nodeClass = 'wb-rel-node' + (isSelected ? ' selected' : '') + (isDim ? ' dim' : '');
      const nodeStyle = { '--wb-rel-color': itemColor(item) } as CSSProperties;
      return (
        <g
          key={id}
          className={nodeClass}
          style={nodeStyle}
          transform={`translate(${point.x} ${point.y})`}
          onPointerDown={(event) => handleNodePointerDown(event, id)}
        >
          <title>{item.name + ' — ' + categoryLabel(item.wbType)}</title>
          <circle className="wb-rel-node-circle" r={NODE_RADIUS} />
          <text className="wb-rel-node-icon" textAnchor="middle" dy="0.35em">
            {itemIcon(item)}
          </text>
          <text className="wb-rel-node-name" textAnchor="middle" y={NODE_RADIUS + 17}>
            {truncate(item.name, 24)}
          </text>
        </g>
      );
    });

    return (
      <>
        <g className="wb-rel-edges">{edges}</g>
        <g className="wb-rel-nodes">{nodes}</g>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Affichage : arbre
  // -------------------------------------------------------------------------

  function renderTree() {
    if (!tree) return null;
    const halfW = TREE_BOX_W / 2;
    const halfH = TREE_BOX_H / 2;
    return (
      <>
        <g className="wb-rel-tree-links">
          {tree.links.map((link) => (
            <path key={link.key} className={'wb-rel-tree-link role-' + link.role} d={link.d} />
          ))}
        </g>
        <g className="wb-rel-tree-nodes">
          {tree.nodes.map((node) => {
            const item = itemOf(node.id);
            if (!item) return null;
            const nodeClass =
              'wb-rel-tree-node' +
              (node.id === rootId ? ' root' : '') +
              (node.id === selectedId ? ' selected' : '');
            const nodeStyle = { '--wb-rel-color': itemColor(item) } as CSSProperties;
            return (
              <g
                key={node.id}
                className={nodeClass}
                style={nodeStyle}
                transform={`translate(${node.x - halfW} ${node.y - halfH})`}
                onPointerDown={(event) => handleNodePointerDown(event, node.id)}
              >
                <title>{item.name + ' — ' + categoryLabel(item.wbType)}</title>
                <rect className="wb-rel-tree-box" width={TREE_BOX_W} height={TREE_BOX_H} rx={8} />
                <rect className="wb-rel-tree-band" width={6} height={TREE_BOX_H} rx={3} />
                <text className="wb-rel-tree-icon" x={22} y={halfH} textAnchor="middle" dy="0.35em">
                  {itemIcon(item)}
                </text>
                <text className="wb-rel-tree-name" x={40} y={halfH - 8} dy="0.35em">
                  {truncate(item.name, 17)}
                </text>
                <text className="wb-rel-tree-type" x={40} y={halfH + 10} dy="0.35em">
                  {truncate(categoryLabel(item.wbType), 22)}
                </text>
              </g>
            );
          })}
        </g>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Affichage : corps de la vue
  // -------------------------------------------------------------------------

  function renderMessage() {
    if (message === 'noSheets') {
      return <div className="wb-rel-message">{t('wbRelNoSheets')}</div>;
    }
    if (message === 'empty') {
      return (
        <div className="wb-rel-message">
          <p>{t('wbRelEmpty')}</p>
          <button type="button" className="wb-rel-btn wb-rel-add" onClick={() => openAdd()}>
            {t('wbRelAdd')}
          </button>
        </div>
      );
    }
    if (message === 'noMatch') {
      return <div className="wb-rel-message">{t('wbRelNoMatch')}</div>;
    }
    if (message === 'treeNoFamily') {
      return <div className="wb-rel-message">{t('wbRelTreeNoFamily')}</div>;
    }
    return <div className="wb-rel-message">{t('wbRelTreeEmpty')}</div>;
  }

  function renderBody() {
    if (message) return renderMessage();
    return (
      <svg
        ref={setSvgEl}
        className="wb-rel-svg"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          {KIND_ORDER.map((kind) => (
            <marker
              key={kind}
              id={'wb-rel-arrow-' + kind}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="11"
              markerHeight="11"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path className={'wb-rel-arrow kind-' + kind} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {tab === 'graph' ? renderGraph() : renderTree()}
        </g>
      </svg>
    );
  }

  // -------------------------------------------------------------------------
  // Fenêtres : création, modification, suppression
  // -------------------------------------------------------------------------

  const draftType = draft ? typeById.get(draft.typeId) : undefined;
  const previewText =
    draft && draftType && draft.sourceId && draft.targetId
      ? fill(t('wbRelPreview'), { source: nameOf(draft.sourceId), label: relationLabelFrom(draftType, true), target: nameOf(draft.targetId) })
      : '';

  const menuRelation = menu ? allRelations.find((relation) => relation.id === menu.relationId) : undefined;

  const countText = fill(t('wbRelCount'), { count: allRelations.length });

  return (
    <div className="wb-rel-overlay">
      <div className="wb-rel-header">
        <h2 className="wb-rel-title">{t('wbRelTitle')}</h2>
        <span className="wb-rel-count">{countText}</span>

        <div className="wb-rel-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'graph'}
            className={'wb-rel-tab' + (tab === 'graph' ? ' active' : '')}
            onClick={() => switchTab('graph')}
          >
            {t('wbRelTabGraph')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tree'}
            className={'wb-rel-tab' + (tab === 'tree' ? ' active' : '')}
            onClick={() => switchTab('tree')}
          >
            {t('wbRelTabTree')}
          </button>
        </div>

        <button
          type="button"
          className="wb-rel-btn wb-rel-add"
          title={t('wbRelAddTitle')}
          disabled={itemIds.length < 2}
          onClick={() => openAdd()}
        >
          {t('wbRelAdd')}
        </button>
      </div>

      <div className="wb-rel-toolbar">
        {tab === 'graph' ? (
          <>
            <div className="wb-rel-control">
              <span className="wb-rel-control-label">{t('wbRelFilterTypeLabel')}</span>
              <RelSelect
                value={activeType}
                options={typeFilterOptions}
                onChange={(value) => {
                  setFilterType(value);
                  fitPendingRef.current = true;
                }}
                ariaLabel={t('wbRelFilterTypeLabel')}
              />
            </div>
            <div className="wb-rel-control">
              <span className="wb-rel-control-label">{t('wbRelFilterKindLabel')}</span>
              <RelSelect
                value={filterKind}
                options={kindFilterOptions}
                onChange={(value) => {
                  setFilterKind(value);
                  fitPendingRef.current = true;
                }}
                ariaLabel={t('wbRelFilterKindLabel')}
              />
            </div>
            <label className="wb-rel-control wb-rel-check">
              <input
                type="checkbox"
                checked={showIsolated}
                onChange={(event) => {
                  setShowIsolated(event.target.checked);
                  storeShowIsolated(event.target.checked);
                  fitPendingRef.current = true;
                }}
              />
              <span>{t('wbRelShowIsolated')}</span>
            </label>
            <button
              type="button"
              className="wb-rel-btn"
              title={t('wbRelResetLayoutTitle')}
              onClick={resetLayout}
            >
              {t('wbRelResetLayout')}
            </button>
          </>
        ) : (
          <div className="wb-rel-control">
            <span className="wb-rel-control-label">{t('wbRelTreeRootLabel')}</span>
            <RelSelect
              value={rootId ?? ''}
              options={familyOptions}
              onChange={(value) => {
                setTreeRoot(value);
                fitPendingRef.current = true;
              }}
              ariaLabel={t('wbRelTreeRootLabel')}
              placeholder={t('wbRelSelectItem')}
            />
          </div>
        )}

        <div className="wb-rel-zoom">
          <button
            type="button"
            className="wb-rel-btn"
            title={t('wbRelZoomOut')}
            aria-label={t('wbRelZoomOut')}
            disabled={Boolean(message)}
            onClick={() => zoomBy(1 / 1.25)}
          >
            −
          </button>
          <button
            type="button"
            className="wb-rel-btn"
            title={t('wbRelZoomIn')}
            aria-label={t('wbRelZoomIn')}
            disabled={Boolean(message)}
            onClick={() => zoomBy(1.25)}
          >
            +
          </button>
          <button
            type="button"
            className="wb-rel-btn"
            title={t('wbRelFit')}
            disabled={Boolean(message)}
            onClick={fitView}
          >
            ⤢ {t('wbRelFit')}
          </button>
        </div>
      </div>

      <div className="wb-rel-body">
        {renderBody()}
      </div>

      {!message && (
        <div className="wb-rel-hint">
          {tab === 'graph' ? t('wbRelGraphHint') : t('wbRelTreeHint')}
        </div>
      )}

      {menu && menuRelation && (
        <div
          ref={menuRef}
          className="wb-rel-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="wb-rel-menu-item"
            onClick={() => openEdit(menuRelation)}
          >
            {t('wbRelEdit')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="wb-rel-menu-item danger"
            onClick={() => askDelete(menuRelation)}
          >
            {t('wbRelDelete')}
          </button>
        </div>
      )}

      <Modal
        open={draft !== null}
        title={draft?.id ? t('wbRelModalEditTitle') : t('wbRelModalAddTitle')}
        width={480}
        onCancel={closeDraft}
        onPrimary={saveDraft}
        footer={
          <>
            {draft?.id && (
              <button
                type="button"
                className="wb-rel-modal-danger"
                onClick={() => {
                  const current = allRelations.find((relation) => relation.id === draft.id);
                  if (current) askDelete(current);
                }}
              >
                {t('wbRelDelete')}
              </button>
            )}
            <button type="button" onClick={closeDraft}>
              {t('cancel')}
            </button>
            <button type="button" className="wb-rel-modal-primary" onClick={saveDraft}>
              {draft?.id ? t('save') : t('create')}
            </button>
          </>
        }
      >
        {draft && (
          <div className="wb-rel-form">
            <div className="wb-rel-field">
              <span className="wb-rel-field-label">{t('wbRelSourceLabel')}</span>
              <RelSelect
                value={draft.sourceId}
                options={itemOptions}
                onChange={(value) => updateDraft({ sourceId: value })}
                ariaLabel={t('wbRelSourceLabel')}
                placeholder={t('wbRelSelectItem')}
              />
            </div>

            <div className="wb-rel-field">
              <span className="wb-rel-field-label">{t('wbRelTypeLabel')}</span>
              <RelSelect
                value={draft.typeId}
                options={relationTypeOptions}
                onChange={(value) => updateDraft({ typeId: value })}
                ariaLabel={t('wbRelTypeLabel')}
              />
            </div>

            <div className="wb-rel-field">
              <span className="wb-rel-field-label">{t('wbRelTargetLabel')}</span>
              <RelSelect
                value={draft.targetId}
                options={itemOptions}
                onChange={(value) => updateDraft({ targetId: value })}
                ariaLabel={t('wbRelTargetLabel')}
                placeholder={t('wbRelSelectItem')}
              />
            </div>

            <button
              type="button"
              className="wb-rel-btn wb-rel-swap"
              title={t('wbRelSwapTitle')}
              onClick={() => updateDraft({ sourceId: draft.targetId, targetId: draft.sourceId })}
            >
              {t('wbRelSwap')}
            </button>

            <label className="wb-rel-field">
              <span className="wb-rel-field-label">{t('wbRelNoteLabel')}</span>
              <input
                type="text"
                className="wb-rel-note"
                placeholder={t('wbRelNotePlaceholder')}
                value={draft.note}
                onChange={(event) => updateDraft({ note: event.target.value })}
              />
            </label>

            {previewText && <p className="wb-rel-preview">{previewText}</p>}
            {draftError && <p className="wb-rel-error">{draftError}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title={t('confirmModalTitle')}
        onCancel={() => setPendingDelete(null)}
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)}>
              {t('cancel')}
            </button>
            <button type="button" className="wb-rel-modal-danger" onClick={confirmDelete}>
              {t('wbRelDelete')}
            </button>
          </>
        }
      >
        {pendingDelete && (
          <p className="wb-rel-confirm-text">
            {fill(t('wbRelConfirmDelete'), { source: nameOf(pendingDelete.sourceId), target: nameOf(pendingDelete.targetId) })}
          </p>
        )}
      </Modal>
    </div>
  );
}
