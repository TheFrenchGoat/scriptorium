// src/renderer/lib/writing-stats-rename.ts
//
// L'historique quotidien des statistiques est rangé sous le nom du projet.
// Fonction commune aux deux renommages (page des projets et éditeur).

import type { WritingStats } from '../../shared/types';

/**
 * Déplace l'ancien historique quotidien vers le nouveau nom du projet.
 */
export async function renameWritingStatsProject(
  oldName: string,
  newName: string
): Promise<void> {
  let stats: WritingStats;

  try {
    stats =
      (await window.api.getWritingStats()) ||
      {};
  } catch (error) {
    console.error(
      'Impossible de charger les statistiques pendant le renommage :',
      error
    );

    return;
  }

  if (!stats.projects?.[oldName]) {
    return;
  }

  const projects = {
    ...(stats.projects || {})
  };

  projects[newName] =
    projects[oldName];

  delete projects[oldName];

  try {
    await window.api.saveWritingStats({
      ...stats,
      projects
    });
  } catch (error) {
    console.error(
      'Impossible de déplacer les statistiques vers le nouveau nom :',
      error
    );
  }
}
