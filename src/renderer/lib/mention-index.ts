// src/renderer/lib/mention-index.ts
// INDEX INVERSÉ DES MENTIONS (fiche -> chapitres où elle apparaît)
// Avant : chaque ouverture de fiche World Building reparcourait TOUT le texte
// de TOUS les chapitres pour savoir où elle est mentionnée — coûteux sur un
// roman à 40+ chapitres. On maintient à la place un index tenu à jour de façon
// incrémentale (un seul chapitre à la fois, au fil de l'écriture) ; ouvrir une
// fiche devient alors une simple lecture.

import { stripHtmlToText } from './dom';
import type { ProjectData } from '../../shared/types';

export interface MentionIndex {
  /** Recalcule les entrées pour UN SEUL chapitre. C'est la seule opération qui
   *  tourne au fil de la frappe ; son coût est proportionnel au nombre de
   *  fiches, pas au nombre de chapitres du projet. */
  updateForChapter(chapterName: string, html: string): void;
  /** Ajoute l'index d'UNE SEULE fiche fraîchement créée (scanne tous les
   *  chapitres, mais pour ce seul nom). */
  addEntryForNewItem(name: string): void;
  /** Reconstruction complète : uniquement pour les actions rares et globales
   *  (import, restauration de sauvegarde, remplacement projet entier). */
  rebuildAll(): void;
  /** Chapitres où le nom apparaît, triés dans l'ordre du projet. */
  chaptersContaining(name: string): string[];
  removeChapter(chapterName: string): void;
  renameChapter(oldName: string, newName: string): void;
  removeItem(name: string): void;
  renameItem(oldName: string, newName: string): void;
  rebuildChapterOrder(): void;
}

/** Teste si un nom de fiche apparaît dans un texte, en respectant les
 *  frontières de mot (accents et apostrophes compris). */
export function chapterTextMentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w\\u00C0-\\u00FF'-])(${escaped})(?![\\w\\u00C0-\\u00FF'-])`, 'iu');
  return re.test(text);
}

export function createMentionIndex(getProjectData: () => ProjectData): MentionIndex {
  /** clé en minuscule -> Set(noms de chapitres) */
  let index = new Map<string, Set<string>>();
  /** nom de chapitre -> position, pour trier les résultats sans reparcourir
   *  la liste complète des chapitres à chaque appel. */
  let chapterOrder = new Map<string, number>();

  const api: MentionIndex = {
    updateForChapter(chapterName, html) {
      const projectData = getProjectData();
      const text = stripHtmlToText(html);
      Object.keys(projectData.world).forEach((itemName) => {
        const key = itemName.toLowerCase();
        let set = index.get(key);
        if (!set) {
          set = new Set<string>();
          index.set(key, set);
        }
        if (chapterTextMentions(text, itemName)) set.add(chapterName);
        else set.delete(chapterName);
      });
    },

    addEntryForNewItem(name) {
      const projectData = getProjectData();
      const set = new Set<string>();
      Object.keys(projectData.chapters).forEach((chapName) => {
        if (chapterTextMentions(stripHtmlToText(projectData.chapters[chapName]), name)) {
          set.add(chapName);
        }
      });
      index.set(name.toLowerCase(), set);
    },

    rebuildAll() {
      const projectData = getProjectData();
      index = new Map();
      Object.keys(projectData.chapters).forEach((chapName) => {
        api.updateForChapter(chapName, projectData.chapters[chapName]);
      });
      api.rebuildChapterOrder();
    },

    chaptersContaining(name) {
      const set = index.get(name.toLowerCase());
      if (!set || set.size === 0) return [];
      return Array.from(set).sort(
        (a, b) => (chapterOrder.get(a) ?? 0) - (chapterOrder.get(b) ?? 0)
      );
    },

    removeChapter(chapterName) {
      // Il suffit de le retirer du Set de chaque fiche qui le mentionnait.
      index.forEach((set) => set.delete(chapterName));
      chapterOrder.delete(chapterName);
    },

    renameChapter(oldName, newName) {
      // Le texte ne change pas, seul le nom du chapitre change : on migre sa
      // clé dans chaque Set plutôt que de tout reparcourir.
      index.forEach((set) => {
        if (set.has(oldName)) {
          set.delete(oldName);
          set.add(newName);
        }
      });
      const order = chapterOrder.get(oldName);
      chapterOrder.delete(oldName);
      if (order !== undefined) chapterOrder.set(newName, order);
    },

    removeItem(name) {
      index.delete(name.toLowerCase());
    },

    renameItem(oldName, newName) {
      // L'ensemble des chapitres qui mentionnent cette fiche ne change pas (le
      // texte a été remplacé 1:1 dans exactement les mêmes chapitres) : on
      // migre juste la clé, sans reparcourir aucun texte.
      const oldKey = oldName.toLowerCase();
      const newKey = newName.toLowerCase();
      const set = index.get(oldKey);
      index.delete(oldKey);
      index.set(newKey, set ?? new Set<string>());
    },

    rebuildChapterOrder() {
      chapterOrder = new Map();
      Object.keys(getProjectData().chapters).forEach((name, i) => chapterOrder.set(name, i));
    }
  };

  return api;
}
