// src/renderer/lib/export/build-bible.ts
// Bible de l'univers -> chapitres du document d'export.
//
// Mode « annexe » : une page « Bible de l’univers » après le roman, puis un
// chapitre par catégorie. Mode « seule » : les chapitres de catégories.
// Chaque fiche : nom, portrait, champs remplis, relations et chronologie.

import type { ExportBlock, ExportChapter, ExportRun } from '../../../shared/export-document';
import type { ExportBibleSettings, ProjectData } from '../../../shared/types';
import type { WbRegistry } from '../wb-registry';

type BibleItem = NonNullable<ProjectData['world']>[string];
type BibleField = ReturnType<WbRegistry['fieldsFor']>[number];

/** Boîte maximale d'un portrait ; prepareExportImages() l'ajuste aux proportions réelles. */
const PORTRAIT_MAX_WIDTH_CM = 5;
const PORTRAIT_MAX_HEIGHT_CM = 6.5;

export interface BibleLabels {
  title: string;
  relations: string;
  timeline: string;
  /** Entre un libellé et sa valeur (« : » avec espace insécable en français). */
  separator: string;
}

export interface BibleSource {
  registry: WbRegistry;
  labels: BibleLabels;
}

/** Catégorie proposée dans la fenêtre d'export. */
export interface ExportBibleCategory {
  slug: string;
  label: string;
  count: number;
}

type BibleLabelKey = 'exportBibleTitle' | 'exportBibleRelationsTitle' | 'exportBibleTimelineTitle';

export function createBibleSource(
  registry: WbRegistry,
  translate: (key: BibleLabelKey) => string,
  language: string
): BibleSource {
  return {
    registry,
    labels: {
      title: translate('exportBibleTitle'),
      relations: translate('exportBibleRelationsTitle'),
      timeline: translate('exportBibleTimelineTitle'),
      separator: language.toLowerCase().startsWith('fr') ? '\u00a0: ' : ': '
    }
  };
}

/** Catégories qui contiennent au moins une fiche, dans l'ordre du registre. */
export function listBibleCategories(projectData: ProjectData, registry: WbRegistry): ExportBibleCategory[] {
  const counts = new Map<string, number>();
  for (const item of Object.values(projectData.world ?? {})) {
    counts.set(item.wbType, (counts.get(item.wbType) ?? 0) + 1);
  }

  const result: ExportBibleCategory[] = [];
  for (const category of registry.categories()) {
    const count = counts.get(category.slug) ?? 0;
    if (count > 0) result.push({ slug: category.slug, label: category.label, count });
  }
  return result;
}

const BLOCK_TAGS = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr';

/** Texte brut d'une valeur de champ (qui peut contenir du HTML). */
function plainText(raw: string): string {
  if (!/[<&]/.test(raw)) return raw;

  const parsed = new DOMParser().parseFromString(raw, 'text/html');
  parsed.body.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  parsed.body.querySelectorAll(BLOCK_TAGS).forEach((element) => element.append('\n'));
  return parsed.body.textContent ?? '';
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function paragraph(runs: ExportRun[]): ExportBlock {
  return { kind: 'paragraph', runs, noIndent: true };
}

function subTitle(text: string): ExportBlock {
  return paragraph([{ text, bold: true, italic: true }]);
}

/** « Libellé : valeur » ; les lignes suivantes forment des paragraphes à part. */
function pushLabelled(blocks: ExportBlock[], label: string, value: string, separator: string): void {
  const lines = splitLines(value);
  if (lines.length === 0) return;

  blocks.push(paragraph([{ text: label + separator, bold: true }, { text: lines[0] }]));
  for (const line of lines.slice(1)) {
    blocks.push(paragraph([{ text: line }]));
  }
}

function fieldValue(field: BibleField, raw: string, world: Record<string, BibleItem>): string {
  if (field.type === 'reference') return world[raw]?.name ?? '';
  return plainText(raw);
}

function itemBlocks(
  item: BibleItem,
  projectData: ProjectData,
  settings: ExportBibleSettings,
  source: BibleSource
): ExportBlock[] {
  const { registry, labels } = source;
  const world: Record<string, BibleItem> = projectData.world ?? {};
  const blocks: ExportBlock[] = [paragraph([{ text: item.name.trim() || '\u2014', bold: true }])];

  if (settings.portraits && typeof item.image === 'string' && item.image.startsWith('data:image/')) {
    blocks.push({
      kind: 'image',
      dataUrl: item.image,
      widthCm: PORTRAIT_MAX_WIDTH_CM,
      heightCm: PORTRAIT_MAX_HEIGHT_CM
    });
  }

  const content: Record<string, string> = item.content ?? {};
  for (const field of registry.fieldsFor(item.wbType)) {
    const raw = content[field.key];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    pushLabelled(blocks, registry.fieldLabel(item.wbType, field), fieldValue(field, raw, world), labels.separator);
  }

  if (settings.relations) {
    const lines: ExportBlock[] = [];
    for (const relation of projectData.wbRelations ?? []) {
      const fromSource = relation.sourceId === item.id;
      if (!fromSource && relation.targetId !== item.id) continue;

      const other = world[fromSource ? relation.targetId : relation.sourceId];
      if (!other) continue;

      const note = (relation.note ?? '').trim();
      lines.push(
        paragraph([
          { text: registry.relationLabel(relation.typeId, fromSource) + labels.separator },
          { text: other.name + (note !== '' ? ` (${note})` : '') }
        ])
      );
    }

    if (lines.length > 0) {
      blocks.push(subTitle(labels.relations), ...lines);
    }
  }

  if (settings.timeline) {
    const events = (projectData.wbTimeline ?? [])
      .filter((event) => Array.isArray(event.itemIds) && event.itemIds.includes(item.id))
      .sort((a, b) => (Number(a.sortKey) || 0) - (Number(b.sortKey) || 0));

    if (events.length > 0) {
      blocks.push(subTitle(labels.timeline));
      for (const event of events) {
        const date = (event.dateLabel ?? '').trim();
        const title = (event.title ?? '').trim();
        if (date !== '') {
          blocks.push(paragraph([{ text: date + labels.separator, bold: true }, { text: title }]));
        } else {
          blocks.push(paragraph([{ text: title }]));
        }
        for (const line of splitLines(plainText(event.description ?? ''))) {
          blocks.push(paragraph([{ text: line, italic: true }]));
        }
      }
    }
  }

  return blocks;
}

/** Chapitres de la bible (vide si aucune fiche n'est retenue). */
export function buildBibleChapters(
  projectData: ProjectData,
  settings: ExportBibleSettings,
  source: BibleSource
): ExportChapter[] {
  if (settings.mode === 'none') return [];

  const excluded = new Set(settings.excludedCategories);
  const items = Object.values(projectData.world ?? {});
  const chapters: ExportChapter[] = [];

  for (const category of source.registry.categories()) {
    if (excluded.has(category.slug)) continue;

    const members = items.filter((item) => item.wbType === category.slug);
    if (members.length === 0) continue;

    const blocks: ExportBlock[] = [];
    members.forEach((item, index) => {
      if (index > 0) blocks.push({ kind: 'empty' });
      blocks.push(...itemBlocks(item, projectData, settings, source));
    });

    chapters.push({ title: category.label, blocks });
  }

  if (chapters.length === 0) return [];

  if (settings.mode === 'appendix') {
    return [{ title: source.labels.title, blocks: [], pageBreak: true }, ...chapters];
  }

  return chapters;
}