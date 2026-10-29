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
  PRE_CONVERSION_SUFFIX,
  projectBackupDir,
  rotateBackups,
  sanitizeVersionLabel,
  writeBackupFile
} from '../backup-files';
import { readBackupProjectData } from '../backup-read';
import type { BackupEntry, ProjectData } from '../../shared/types';

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

export function registerBackupIpc(): void {
  ipcMain.handle(
    'backup:create',
    (_e, payload: { projectName: string; projectData: ProjectData }) => {
      if (
        !payload ||
        typeof payload.projectName !== 'string' ||
        !payload.projectData ||
        typeof payload.projectData !== 'object'
      ) {
        throw new Error('Données de sauvegarde invalides.');
      }

      const { projectName, projectData } = payload;
      const dir = projectBackupDir(backupsDir(), projectName);

      const now = new Date();
      const timestamp = backupTimestamp(now);
      const fileName = isPreConversionData(projectData)
        ? timestamp + PRE_CONVERSION_SUFFIX
        : timestamp + '.json';

      // Écriture sécurisée : fichier temporaire, puis renommage.
      writeBackupFile(
        dir,
        fileName,
        JSON.stringify({ projectName, projectData, savedAt: now.toISOString() }, null, 2)
      );

      rotateBackups(dir);

      return { fileName };
    }
  );

  // Version nommée : créée par l'auteur, jamais supprimée automatiquement.
  ipcMain.handle(
    'backup:create-version',
    (_e, payload: { projectName: string; projectData: ProjectData; label: unknown }) => {
      if (
        !payload ||
        typeof payload.projectName !== 'string' ||
        !payload.projectData ||
        typeof payload.projectData !== 'object'
      ) {
        throw new Error('Données de version invalides.');
      }

      const label = sanitizeVersionLabel(payload.label);
      if (!label) throw new Error('Le nom de la version est vide.');

      const { projectName, projectData } = payload;
      const dir = projectBackupDir(backupsDir(), projectName);
      const now = new Date();
      const fileName = backupTimestamp(now) + NAMED_SUFFIX;

      writeBackupFile(
        dir,
        fileName,
        JSON.stringify(
          { projectName, projectData, savedAt: now.toISOString(), kind: 'named', label },
          null,
          2
        )
      );

      return { fileName };
    }
  );

  // Liste rapide : la date est lue dans le nom du fichier.
  ipcMain.handle('backup:list', (_e, projectName: string): BackupEntry[] => {
    if (typeof projectName !== 'string') return [];

    return listBackupEntries(projectBackupDir(backupsDir(), projectName));
  });

  ipcMain.handle(
    'backup:restore',
    (_e, payload: { projectName: string; fileName: string }): ProjectData => {
      if (!payload || typeof payload.projectName !== 'string') {
        throw new Error('Données de restauration invalides.');
      }

      const { projectName, fileName } = payload;

      // Sécurité : refuse tout nom de fichier contenant un chemin (par exemple "../").
      if (!isSafeBackupFileName(fileName)) {
        throw new Error('Nom de sauvegarde invalide.');
      }

      const dir = projectBackupDir(backupsDir(), projectName);
      const filePath = path.join(dir, fileName);
      if (!fs.existsSync(filePath)) throw new Error('Sauvegarde introuvable.');

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { projectData?: unknown };
      return sanitizeProjectData(data.projectData);
    }
  );

  // Lecture d'une sauvegarde pour l'aperçu : rien n'est modifié ni restauré.
  ipcMain.handle(
    'backup:read',
    (_e, payload: { projectName: string; fileName: string }): ProjectData => {
      if (!payload || typeof payload.projectName !== 'string') {
        throw new Error('Données de lecture invalides.');
      }

      const dir = projectBackupDir(backupsDir(), payload.projectName);
      return sanitizeProjectData(readBackupProjectData(dir, payload.fileName));
    }
  );

  // Suppression d'une version nommée (les sauvegardes automatiques sont refusées).
  ipcMain.handle('backup:delete-version', (_e, payload: unknown): boolean => {
    const record = (payload && typeof payload === 'object' ? payload : {}) as {
      projectName?: unknown;
      fileName?: unknown;
    };

    if (typeof record.projectName !== 'string') {
      throw new Error('Nom de projet invalide.');
    }

    return deleteNamedVersion(projectBackupDir(backupsDir(), record.projectName), record.fileName);
  });

  // Renommage d'un projet : ses sauvegardes suivent le nouveau nom.
  ipcMain.handle('backup:rename-project', (_e, payload: unknown): boolean => {
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
      throw new Error('Noms de projet invalides.');
    }

    const root = backupsDir();
    if (!fs.existsSync(root)) return true;

    const result = moveProjectBackups(root, oldName, newName);

    if (result.kept > 0) {
      console.warn("Sauvegardes laissées sous l'ancien nom (nom déjà pris) :", result.kept);
    }

    return true;
  });
}
