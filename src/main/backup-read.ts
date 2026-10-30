// src/main/backup-read.ts
// Lecture d'une sauvegarde sans la restaurer (aperçu). Aucun fichier n'est
// modifié. Sans Electron : testable avec Node.

import fs from 'node:fs';
import path from 'node:path';
import { isSafeBackupFileName } from './backup-files';
import { mainMessage } from './main-texts';

/** Données brutes du projet contenues dans une sauvegarde (à désinfecter ensuite). */
export function readBackupProjectData(dir: string, fileName: unknown): unknown {
  // Sécurité : refuse tout nom de fichier contenant un chemin (par exemple "../").
  if (!isSafeBackupFileName(fileName)) {
    throw new Error(mainMessage('backupInvalidName'));
  }

  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) throw new Error(mainMessage('backupNotFound'));

  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!parsed || typeof parsed !== 'object') throw new Error(mainMessage('backupUnreadable'));

  return (parsed as { projectData?: unknown }).projectData;
}
