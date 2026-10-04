// src/renderer/lib/project-word-cache.ts
//
// Cache des statistiques textuelles d’un projet.
//
// Le contrôleur de l’éditeur demande régulièrement le nombre total de mots,
// notamment après chaque frappe. Recompter intégralement plusieurs centaines
// de chapitres à chaque modification deviendrait coûteux sur un gros projet.
//
// Ce cache mémorise donc, pour chaque chapitre :
// - sa dernière version HTML connue ;
// - son nombre de mots ;
// - son nombre de caractères.
//
// Lors d’une nouvelle demande, tous les noms de chapitres sont parcourus, mais
// le texte d’un chapitre n’est réellement retraité que si sa chaîne HTML a
// changé. Avec un chapitre actif d’environ 2 000 mots, une frappe ne provoque
// donc plus le recomptage des 500 000 mots du projet.
//
// WeakMap permet au cache d’être automatiquement libéré lorsque l’objet
// ProjectData correspondant n’est plus utilisé.

import type { ProjectData } from '../../shared/types';
import { htmlToPlainText } from './stats';

interface CachedChapterStats {
  /**
   * Dernière chaîne HTML utilisée pour calculer les statistiques.
   *
   * Les chaînes JavaScript étant immuables, une modification du chapitre
   * produit nécessairement une nouvelle valeur, même si l’objet ProjectData
   * lui-même est conservé.
   */
  html: string;

  words: number;
  chars: number;
}

interface CachedProjectStats {
  chapters: Map<string, CachedChapterStats>;
  totalWords: number;
  totalChars: number;
}

export interface CachedTextStats {
  words: number;
  chars: number;
}

const projectCaches =
  new WeakMap<ProjectData, CachedProjectStats>();

/**
 * Compte les mots d’un texte déjà converti en texte simple.
 */
function countPlainTextWords(
  plainText: string
): number {
  if (!plainText) {
    return 0;
  }

  return plainText
    .split(/\s+/)
    .filter(
      (word) => word.length > 0
    ).length;
}

/**
 * Calcule les statistiques d’un seul chapitre.
 */
function calculateChapterStats(
  html: string
): CachedChapterStats {
  const plainText =
    htmlToPlainText(html);

  return {
    html,
    words:
      countPlainTextWords(
        plainText
      ),
    chars: plainText.length
  };
}

/**
 * Retourne le cache du projet en le créant si nécessaire.
 */
function getProjectCache(
  projectData: ProjectData
): CachedProjectStats {
  const existing =
    projectCaches.get(projectData);

  if (existing) {
    return existing;
  }

  const created: CachedProjectStats = {
    chapters: new Map(),
    totalWords: 0,
    totalChars: 0
  };

  projectCaches.set(
    projectData,
    created
  );

  return created;
}

/**
 * Synchronise le cache avec l’état actuel du projet.
 *
 * Cette opération parcourt les noms des chapitres, mais ne reconvertit en
 * texte et ne recompte que les chapitres dont le HTML a réellement changé.
 */
function synchronizeProjectCache(
  projectData: ProjectData
): CachedProjectStats {
  const cache =
    getProjectCache(projectData);

  const chapters =
    projectData.chapters || {};

  const existingNames =
    new Set(cache.chapters.keys());

  Object.entries(chapters).forEach(
    ([chapterName, content]) => {
      const html =
        typeof content === 'string'
          ? content
          : '';

      existingNames.delete(
        chapterName
      );

      const previous =
        cache.chapters.get(
          chapterName
        );

      /*
       * Le contenu n’a pas changé : les nombres précédemment calculés sont
       * encore valides et aucun parcours du texte n’est nécessaire.
       */
      if (
        previous &&
        previous.html === html
      ) {
        return;
      }

      const next =
        calculateChapterStats(
          html
        );

      if (previous) {
        cache.totalWords -=
          previous.words;

        cache.totalChars -=
          previous.chars;
      }

      cache.chapters.set(
        chapterName,
        next
      );

      cache.totalWords +=
        next.words;

      cache.totalChars +=
        next.chars;
    }
  );

  /*
   * Les entrées encore présentes correspondent à des chapitres qui ont été
   * supprimés ou dont le projet ne contient plus le nom.
   */
  existingNames.forEach(
    (chapterName) => {
      const previous =
        cache.chapters.get(
          chapterName
        );

      if (!previous) {
        return;
      }

      cache.totalWords -=
        previous.words;

      cache.totalChars -=
        previous.chars;

      cache.chapters.delete(
        chapterName
      );
    }
  );

  /*
   * Protection contre une éventuelle valeur négative liée à des données
   * anciennes ou malformées. Dans un projet valide, ces deux valeurs sont
   * naturellement toujours positives ou nulles.
   */
  cache.totalWords = Math.max(
    0,
    cache.totalWords
  );

  cache.totalChars = Math.max(
    0,
    cache.totalChars
  );

  return cache;
}

/**
 * Retourne le nombre total de mots et de caractères du projet.
 *
 * Après l’initialisation du cache, seuls les chapitres modifiés sont
 * réellement recomptés.
 */
export function getCachedTotalStats(
  projectData: ProjectData
): CachedTextStats {
  const cache =
    synchronizeProjectCache(
      projectData
    );

  return {
    words: cache.totalWords,
    chars: cache.totalChars
  };
}

/**
 * Retourne le nombre de mots de chaque chapitre en utilisant le même cache.
 *
 * Un nouvel objet est renvoyé afin que l’appelant ne puisse pas modifier
 * directement les valeurs internes du cache.
 */
export function getCachedChapterWordCounts(
  projectData: ProjectData
): Record<string, number> {
  const cache =
    synchronizeProjectCache(
      projectData
    );

  const result: Record<
    string,
    number
  > = {};

  Object.keys(
    projectData.chapters || {}
  ).forEach((chapterName) => {
    result[chapterName] =
      cache.chapters.get(
        chapterName
      )?.words ?? 0;
  });

  return result;
}

/**
 * Retourne les statistiques d’un chapitre particulier.
 */
export function getCachedChapterStats(
  projectData: ProjectData,
  chapterName: string
): CachedTextStats {
  const cache =
    synchronizeProjectCache(
      projectData
    );

  const chapter =
    cache.chapters.get(
      chapterName
    );

  return {
    words: chapter?.words ?? 0,
    chars: chapter?.chars ?? 0
  };
}

/**
 * Invalide entièrement le cache d’un projet.
 *
 * Cette fonction est principalement utile après le remplacement massif des
 * données d’un projet, par exemple lors de la restauration d’une sauvegarde.
 * Elle n’est pas nécessaire pour une modification normale de chapitre :
 * le changement de la chaîne HTML est automatiquement détecté.
 */
export function invalidateProjectWordCache(
  projectData: ProjectData
): void {
  projectCaches.delete(
    projectData
  );
}
