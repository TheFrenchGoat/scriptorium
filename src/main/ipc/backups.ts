// src/main/ipc/backups.ts
// SAUVEGARDES AUTOMATIQUES HORODATÉES
// Un instantané complet du projet est écrit dans un dossier dédié du profil
// utilisateur, avec rotation : les 10 dernières, plus la dernière de chaque
// heure sur 24 h et de chaque jour sur 14 jours (voir removeRegularBackups).
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

/** En plus des plus récentes : la dernière sauvegarde de chaque heure sur cette durée… */
const KEEP_HOURLY_HOURS = 24;
/** … et la dernière de chaque jour sur cette durée. */
const KEEP_DAILY_DAYS = 14;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

/** Format des noms de sauvegarde ordinaires : 2026-10-22T14-30-05-123Z.json */
const BACKUP_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

/** Date d'une sauvegarde d'après son nom, ou null si le nom n'a pas le format attendu. */
function backupTime(fileName: string): number | null {
  const match = BACKUP_NAME_PATTERN.exec(fileName);
  if (!match) return null;
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
  return Number.isNaN(time) ? null : time;
}

/**
 * Rotation des sauvegardes ordinaires. On garde :
 * - les MAX_BACKUPS_PER_PROJECT plus récentes ;
 * - la plus récente de chaque heure sur les KEEP_HOURLY_HOURS dernières heures ;
 * - la plus récente de chaque jour sur les KEEP_DAILY_DAYS derniers jours.
 * Un fichier dont le nom n'a pas le format attendu n'est jamais supprimé.
 */
function removeRegularBackups(dir: string, files: string[]): void {
  const now = Date.now();
  const dated = files
    .map((fileName) => ({ fileName, time: backupTime(fileName) }))
    .filter((entry): entry is { fileName: string; time: number } => entry.time !== null)
    .sort((a, b) => b.time - a.time);

  const keep = new Set<string>();
  const seenHours = new Set<string>();
  const seenDays = new Set<string>();

  // Du plus récent au plus ancien : la première sauvegarde rencontrée pour une
  // heure (ou un jour) est donc la plus récente de cette heure (ou ce jour).
  dated.forEach((entry, index) => {
    if (index < MAX_BACKUPS_PER_PROJECT) keep.add(entry.fileName);

    // Jour et heure locaux : « hier » et « 14 h » au sens de l'utilisateur.
    const date = new Date(entry.time);
    const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const hourKey = `${dayKey} ${date.getHours()}`;
    const age = now - entry.time;

    if (age < KEEP_HOURLY_HOURS * HOUR_MS && !seenHours.has(hourKey)) {
      seenHours.add(hourKey);
      keep.add(entry.fileName);
    }

    if (age < KEEP_DAILY_DAYS * DAY_MS && !seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      keep.add(entry.fileName);
    }
  });

  dated.forEach((entry) => {
    if (keep.has(entry.fileName)) return;

    try {
      fs.unlinkSync(path.join(dir, entry.fileName));
    } catch (error) {
      console.error('Impossible de supprimer une ancienne sauvegarde :', entry.fileName, error);
    }
  });
}

function rotateBackups(dir: string): void {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  const preConversion = files.filter((f) => f.endsWith(PRE_CONVERSION_SUFFIX));
  const regular = files.filter((f) => !f.endsWith(PRE_CONVERSION_SUFFIX));

  removeRegularBackups(dir, regular);
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
