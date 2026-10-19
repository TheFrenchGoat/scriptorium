// src/main/ipc/backups.ts
// SAUVEGARDES AUTOMATIQUES HORODATÉES
// Un instantané complet du projet est écrit dans un dossier dédié du profil
// utilisateur, avec rotation (on ne garde que les N dernières par projet).
// Objectif : pouvoir revenir en arrière après une suppression ou un
// remplacement malheureux, indépendamment du fichier de travail courant.
//
// Cas particulier : la sauvegarde faite juste avant la conversion du World
// Building au format 2 porte le suffixe « -avant-conversion ». Elle échappe à
// la rotation normale, pour ne pas être effacée par les sauvegardes suivantes.
// On en garde au plus MAX_PRE_CONVERSION_BACKUPS par projet.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import { sanitizeProjectData } from '../sanitize';
import type { BackupEntry, ProjectData } from '../../shared/types';

const MAX_BACKUPS_PER_PROJECT = 10;
const MAX_PRE_CONVERSION_BACKUPS = 3;

/** Suffixe des sauvegardes faites avant la conversion du World Building. */
const PRE_CONVERSION_SUFFIX = '-avant-conversion.json';

/** Version actuelle du format du World Building (identique à WB_FORMAT_VERSION). */
const WB_FORMAT_CURRENT = 2;

/** Caractères interdits dans un nom de dossier (la barre oblique inverse est le code 92). */
const FORBIDDEN_FILENAME_CHARS = '/' + String.fromCharCode(92) + ':*?"<>|';

function backupsDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function ensureBackupsDir(): void {
  const dir = backupsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Les noms de projet peuvent contenir des caractères invalides pour un nom de
// dossier : on les neutralise, tout en gardant le nom d'origine dans les
// métadonnées. Les points et espaces finaux sont retirés (Windows les ignore),
// ce qui empêche aussi les noms « . » et « .. » de désigner un dossier parent.
function sanitizeForFilesystem(name: string): string {
  let result = '';

  for (const char of String(name)) {
    const code = char.charCodeAt(0);
    result += code < 32 || FORBIDDEN_FILENAME_CHARS.includes(char) ? '_' : char;
  }

  result = result.trim();

  while (result.endsWith('.')) {
    result = result.slice(0, -1).trimEnd();
  }

  return result || 'projet';
}

function projectBackupDir(projectName: string): string {
  const root = backupsDir();
  const dir = path.join(root, sanitizeForFilesystem(projectName));

  // Sécurité : le dossier doit être directement dans le dossier des sauvegardes.
  if (path.dirname(dir) !== root) {
    throw new Error('Nom de projet invalide pour une sauvegarde.');
  }

  return dir;
}

/** Vérifie qu'un nom de fichier de sauvegarde ne contient aucun chemin. */
function isSafeBackupFileName(fileName: unknown): fileName is string {
  return (
    typeof fileName === 'string' &&
    fileName.length > '.json'.length &&
    fileName.endsWith('.json') &&
    path.basename(fileName) === fileName &&
    !fileName.startsWith('.')
  );
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

/** Supprime les fichiers les plus anciens au-delà de la limite. */
function removeOldest(dir: string, files: string[], max: number): void {
  const sorted = [...files].sort();
  const excess = sorted.length - max;

  if (excess <= 0) return;

  sorted.slice(0, excess).forEach((f) => {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch (error) {
      console.error('Impossible de supprimer une ancienne sauvegarde :', f, error);
    }
  });
}

function rotateBackups(dir: string): void {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  const preConversion = files.filter((f) => f.endsWith(PRE_CONVERSION_SUFFIX));
  const regular = files.filter((f) => !f.endsWith(PRE_CONVERSION_SUFFIX));

  removeOldest(dir, regular, MAX_BACKUPS_PER_PROJECT);
  removeOldest(dir, preConversion, MAX_PRE_CONVERSION_BACKUPS);
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

      ensureBackupsDir();
      const dir = projectBackupDir(projectName);
      fs.mkdirSync(dir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = isPreConversionData(projectData)
        ? `${timestamp}${PRE_CONVERSION_SUFFIX}`
        : `${timestamp}.json`;

      fs.writeFileSync(
        path.join(dir, fileName),
        JSON.stringify({ projectName, projectData, savedAt: new Date().toISOString() }, null, 2),
        'utf-8'
      );

      rotateBackups(dir);

      return { fileName };
    }
  );

  ipcMain.handle('backup:list', (_e, projectName: string): BackupEntry[] => {
    if (typeof projectName !== 'string') return [];

    const dir = projectBackupDir(projectName);
    if (!fs.existsSync(dir)) return [];

    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((fileName) => {
        let savedAt: string | null = null;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf-8')) as {
            savedAt?: string;
          };
          savedAt = data.savedAt ?? null;
        } catch {
          /* fichier corrompu : on l'ignore silencieusement dans la liste */
        }
        return { fileName, savedAt };
      });
  });

  ipcMain.handle(
    'backup:restore',
    (_e, payload: { projectName: string; fileName: string }): ProjectData => {
      if (!payload || typeof payload.projectName !== 'string') {
        throw new Error('Données de restauration invalides.');
      }

      const { projectName, fileName } = payload;

      // Sécurité : refuse tout nom de fichier contenant un chemin (par exemple « ../ »).
      if (!isSafeBackupFileName(fileName)) {
        throw new Error('Nom de sauvegarde invalide.');
      }

      const dir = projectBackupDir(projectName);
      const filePath = path.join(dir, fileName);
      if (!fs.existsSync(filePath)) throw new Error('Sauvegarde introuvable.');

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { projectData?: unknown };
      return sanitizeProjectData(data.projectData);
    }
  );
}
