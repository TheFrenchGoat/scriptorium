// src/renderer/components/editor/controller/utils.ts
// Fonctions indépendantes de React utilisées par le contrôleur de l'éditeur.
// Extraites de useEditorController.ts (étape 4c-1), sans changement de comportement.

import { getLanguage } from '../../../i18n';
import { getCachedTotalStats } from '../../../lib/project-word-cache';
import { getScreenplayTextStatistics } from '../../../lib/screenplay';
import type { WbLang } from '../../../lib/wb-registry';
import type {
  ProjectData,
  ScreenplayProjectData,
  WbField,
  WbItem
} from '../../../../shared/types';

export function currentWbLang(): WbLang {
  return getLanguage() === 'en' ? 'en' : 'fr';
}

/** Projet roman vide. Le World Building est complété par prepareWorldBuilding. */
export function createBlankNovelData(): ProjectData {
  return {
    projectType: 'novel',
    chapters: {},
    world: {},
    writingSessions: [],
    goals: []
  };
}

export function isScreenplayData(
  projectData: ProjectData | null | undefined
): projectData is ProjectData & { screenplay: ScreenplayProjectData } {
  return (
    projectData?.projectType === 'screenplay' &&
    Boolean(projectData.screenplay)
  );
}

export function getProjectWordTotal(projectData: ProjectData): number {
  if (isScreenplayData(projectData)) {
    return getScreenplayTextStatistics(projectData.screenplay).words;
  }

  return getCachedTotalStats(projectData).words;
}

export function countText(text: string): { words: number; chars: number } {
  const normalized = text.trim();

  return {
    words: normalized ? normalized.split(/\s+/).filter(Boolean).length : 0,
    chars: normalized.length
  };
}

export function activeEditableElement(): HTMLElement | null {
  const active = document.activeElement;

  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }

  return null;
}

export function touchWbItem(item: WbItem): void {
  item.updatedAt = new Date().toISOString();
}

/**
 * Retire une fiche supprimée des relations et de la frise.
 * (Les dossiers ne référencent pas les fiches : c'est la fiche qui porte
 * son folderId, il n'y a donc rien à nettoyer de ce côté.)
 */
export function detachWbItem(data: ProjectData, itemId: string): void {
  if (Array.isArray(data.wbRelations)) {
    data.wbRelations = data.wbRelations.filter(
      (relation) =>
        relation.sourceId !== itemId && relation.targetId !== itemId
    );
  }

  if (Array.isArray(data.wbTimeline)) {
    data.wbTimeline = data.wbTimeline.map((event) =>
      event.itemIds.includes(itemId)
        ? { ...event, itemIds: event.itemIds.filter((id) => id !== itemId) }
        : event
    );
  }
}

/** Valeurs par défaut communes au chargement et à la restauration. */
export function ensureProjectDefaults(projectData: ProjectData): void {
  if (!projectData.projectType) {
    projectData.projectType = projectData.screenplay ? 'screenplay' : 'novel';
  }

  projectData.chapters = projectData.chapters || {};
  projectData.world = projectData.world || {};
  projectData.writingSessions = Array.isArray(projectData.writingSessions)
    ? projectData.writingSessions
    : [];
  const rawChapterMeta: unknown = projectData.chapterMeta;
  if (rawChapterMeta !== undefined && (typeof rawChapterMeta !== 'object' || rawChapterMeta === null || Array.isArray(rawChapterMeta))) {
    delete projectData.chapterMeta;
  }
  const rawChapterNotes: unknown = projectData.chapterNotes;
  if (rawChapterNotes !== undefined && (typeof rawChapterNotes !== 'object' || rawChapterNotes === null || Array.isArray(rawChapterNotes))) {
    delete projectData.chapterNotes;
  }
  const rawChapterComments: unknown = projectData.chapterComments;
  if (rawChapterComments !== undefined && (typeof rawChapterComments !== 'object' || rawChapterComments === null || Array.isArray(rawChapterComments))) {
    delete projectData.chapterComments;
  }
  projectData.goals = Array.isArray(projectData.goals) ? projectData.goals : [];
}

export function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

export function buildCustomTypeFields(
  rawFields: {
    label: string;
    type: WbField['type'];
    existingKey?: string;
    options?: WbField['options'];
    referenceCategory?: WbField['referenceCategory'];
  }[]
): WbField[] {
  const usedKeys = new Set(
    rawFields.map((field) => field.existingKey).filter(Boolean) as string[]
  );

  return rawFields.map((field) => {
    let key = field.existingKey;

    if (!key) {
      const base = slugify(field.label, 'champ');

      key = base;

      let index = 2;

      while (usedKeys.has(key)) {
        key = `${base}_${index}`;
        index += 1;
      }

      usedKeys.add(key);
    }

    const result: WbField = {
      key,
      label: field.label,
      type: field.type
    };

    if (field.options !== undefined) {
      result.options = field.options;
    }

    if (field.referenceCategory !== undefined) {
      result.referenceCategory = field.referenceCategory;
    }

    return result;
  });
}
