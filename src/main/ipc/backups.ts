// src/main/ipc/backups.ts
// SAUVEGARDES AUTOMATIQUES HORODATÉES ET VERSIONS NOMMÉES
// Un instantané complet du projet est écrit dans un dossier dédié du profil
// utilisateur (userData/backups/nom du projet), avec rotation.
// Les opérations sur les fichiers (écriture sécurisée, liste, rotation,
// versions nommées, déplacement lors d'un renommage) sont dans
// ../backup-files.ts, testable sans Electron.
//
// Cas particuliers :
// - la sauvegarde faite juste avant la conversion du World Building au
//   format 2 porte le suffixe "-avant-conversion" (au plus
//   MAX_PRE_CONVERSION_BACKUPS par projet) ;
// - les versions nommées par l'auteur portent le suffixe "-version" et ne
//   sont jamais supprimées automatiquement.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import { sanitizeProjectData } from '../sanitize';
import {
  backupTimestamp,
  deleteNamedVersion,
  isSafeBackupFileName,
  listBackupEntries,
  moveProjectBackups,
  NAMED_SUFFIX,
  pathExists,
  PRE_CONVERSION_SUFFIX,
  projectBackupDir,
  rotateBackups,
  sanitizeVersionLabel,
  writeBackupFile
} from '../backup-files';
import { readBackupProjectData } from '../backup-read';
import type { BackupEntry, ProjectData } from '../../shared/types';
import { mainMessage } from '../main-texts';

/** Version actuelle du format du World Building (identique à WB_FORMAT_VERSION). */
const WB_FORMAT_CURRENT = 2;

function backupsDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

/** Indique si un projet contient des fiches au format 1 (sauvegarde avant conversion). */
function isPreConversionData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const record = data as { wbFormat?: unknown; world?: unknown };
  const format = typeof record.wbFormat === 'number' ? record.wbFormat : 1;

  if (format >= WB_FORMAT_CURRENT) return false;

  return (
    !!record.world &&
    typeof record.world === 'object' &&
    Object.keys(record.world as object).length > 0
  );
}

/**
 * File d'attente des opérations sur les sauvegardes : elles passent une par
 * une, dans l'ordre des demandes. Les fichiers sont lus et écrits sans bloquer
 * le processus principal ; sans cette file, deux sauvegardes simultanées
 * pourraient se gêner (fichier temporaire supprimé par l'autre, rotation
 * pendant une écriture).
 */
let backupQueue: Promise<unknown> = Promise.resolve();

function runInBackupQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = backupQueue.then(() => task());
  backupQueue = run.catch(() => undefined);
  return run;
}

export function registerBackupIpc(): void {
  ipcMain.handle(
    'backup:create',
    async (_e, payload: { projectName: string; projectData: ProjectData }) => {
      if (
 !payload ||
 typeof payload.projectName !== 'string' ||
        !payload.projectData ||
        typeof payload.projectData !== 'object'
      ) {
        throw new Error(mainMessage('backupDataInvalid'));
      }

      const { projectName, projectData } = payload;
      const dir = projectBackupDir(backupsDir(), projectName);

      const now = new Date();
      const timestamp = backupTimestamp(now);
      const fileName = isPreConversionData(projectData)
        ? timestamp + PRE_CONVERSION_SUFFIX
        : timestamp + '.json';
      const content = JSON.stringify({ projectName, projectData, savedAt: now.toISOString() }, null, 2);

      // Écriture sécurisée (fichier temporaire, puis renommage), puis rotation.
      await runInBackupQueue(async () => {
 await writeBackupFile(dir, fileName, content);
 await rotateBackups(dir);
      });

      return { fileName };
    }
  );

  // Version nommée : créée par l'auteur, jamais supprimée automatiquement.
  ipcMain.handle(
    'backup:create-version',
    async (_e, payload: { projectName: string; projectData: ProjectData; label: unknown }) => {
      if (
        !payload ||
        typeof payload.projectName !== 'string' ||
        !payload.projectData ||
        typeof payload.projectData !== 'object'
      ) {
 throw new Error(mainMessage('backupVersionDataInvalid'));
      }

      const label = sanitizeVersionLabel(payload.label);
      if (!label) throw new Error(mainMessage('backupVersionNameEmpty'));

      const { projectName, projectData } = payload;
      const dir = projectBackupDir(backupsDir(), projectName);
      const now = new Date();
      const fileName = backupTimestamp(now) + NAMED_SUFFIX;
      const content = JSON.stringify(
        { projectName, projectData, savedAt: now.toISOString(), kind: 'named', label },
        null,
        2
      );

      await runInBackupQueue(() => writeBackupFile(dir, fileName, content));

      return { fileName };
    }
  );

  // Liste rapide : la date est lue dans le nom du fichier.
  ipcMain.handle('backup:list', async (_e, projectName: string): Promise<BackupEntry[]> => {
    if (typeof projectName !== 'string') return [];

    const dir = projectBackupDir(backupsDir(), projectName);
    return runInBackupQueue(() => listBackupEntries(dir));
  });

  ipcMain.handle(
    'backup:restore',
    async (_e, payload: { projectName: string; fileName: string }): Promise<ProjectData> => {
      if (!payload || typeof payload.projectName !== 'string') {
        throw new Error(mainMessage('backupRestoreDataInvalid'));
      }

      const { projectName, fileName } = payload;

      // Sécurité : refuse tout nom de fichier contenant un chemin (par exemple "../").
      if (!isSafeBackupFileName(fileName)) {
        throw new Error(mainMessage('backupInvalidName'));
      }

      const dir = projectBackupDir(backupsDir(), projectName);
      const filePath = path.join(dir, fileName);

      const rawData = await runInBackupQueue(async () => {
        if (!(await pathExists(filePath))) throw new Error(mainMessage('backupNotFound'));
        const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) as { projectData?: unknown };
        return data.projectData;
      });

      return sanitizeProjectData(rawData);
    }
  );

  // Lecture d'une sauvegarde pour l'aperçu : rien n'est modifié ni restauré.
  ipcMain.handle(
    'backup:read',
    async (_e, payload: { projectName: string; fileName: string }): Promise<ProjectData> => {
      if (!payload || typeof payload.projectName !== 'string') {
        throw new Error(mainMessage('backupReadDataInvalid'));
      }

      const dir = projectBackupDir(backupsDir(), payload.projectName);
      const fileName = payload.fileName;
      const rawData = await runInBackupQueue(() => readBackupProjectData(dir, fileName));
      return sanitizeProjectData(rawData);
    }
  );

  // Suppression d'une version nommée (les sauvegardes automatiques sont refusées).
  ipcMain.handle('backup:delete-version', async (_e, payload: unknown): Promise<boolean> => {
    const record = (payload && typeof payload === 'object' ? payload : {}) as {
      projectName?: unknown;
      fileName?: unknown;
    };

    if (typeof record.projectName !== 'string') {
      throw new Error(mainMessage('backupProjectNameInvalid'));
    }

    const dir = projectBackupDir(backupsDir(), record.projectName);
    const fileName = record.fileName;
    return runInBackupQueue(() => deleteNamedVersion(dir, fileName));
  });

  // Renommage d'un projet : ses sauvegardes suivent le nouveau nom.
  ipcMain.handle('backup:rename-project', async (_e, payload: unknown): Promise<boolean> => {
    const record = (payload && typeof payload === 'object' ? payload : {}) as {
      oldName?: unknown;
      newName?: unknown;
    };
    const { oldName, newName } = record;

    if (
      typeof oldName !== 'string' ||
      typeof newName !== 'string' ||
      !oldName.trim() ||
      !newName.trim()
    ) {
      throw new Error(mainMessage('backupProjectNamesInvalid'));
    }

    const root = backupsDir();

    return runInBackupQueue(async () => {
      if (!(await pathExists(root))) return true;

      const result = await moveProjectBackups(root, oldName, newName);

      if (result.kept > 0) {
        console.warn("Sauvegardes laissées sous l'ancien nom (nom déjà pris) :", result.kept);
      }

      return true;
    });
  });
}
