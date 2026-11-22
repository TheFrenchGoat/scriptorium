// src/main/backup-files.ts
// SAUVEGARDES HORODATÉES : opérations sur les fichiers.
// Ce module ne dépend pas d'Electron : le test automatique le charge
// directement avec Node.
// - écriture sécurisée : fichier temporaire, puis renommage (une coupure
//   pendant l'écriture ne laisse jamais une sauvegarde endommagée) ;
// - liste rapide : la date est lue dans le nom du fichier ;
// - rotation : les 10 plus récentes, plus la dernière de chaque heure sur
//   24 h et de chaque jour sur 14 jours ;
// - versions nommées (suffixe -version) : créées par l'auteur, jamais
//   supprimées automatiquement ; seules elles peuvent être supprimées ;
// - renommage d'un projet : ses sauvegardes suivent le nouveau nom, sans
//   jamais écraser un fichier existant.

import fs from 'node:fs';
import path from 'node:path';
import type { BackupEntry, BackupKind } from '../shared/types';
import { mainMessage } from './main-texts';

export const MAX_BACKUPS_PER_PROJECT = 10;
export const MAX_PRE_CONVERSION_BACKUPS = 3;

/** Durée (en heures) pendant laquelle on garde une sauvegarde par heure. */
export const KEEP_HOURLY_HOURS = 24;
/** Durée (en jours) pendant laquelle on garde une sauvegarde par jour. */
export const KEEP_DAILY_DAYS = 14;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Suffixe des sauvegardes faites avant la conversion du World Building. */
export const PRE_CONVERSION_SUFFIX = '-avant-conversion.json';

/** Suffixe des versions nommées créées par l'auteur. */
export const NAMED_SUFFIX = '-version.json';

/** Longueur maximale du nom d'une version. */
export const VERSION_LABEL_MAX = 80;

/** Suffixe des fichiers temporaires (jamais listés ni restaurés). */
export const TEMP_SUFFIX = '.tmp';

/** Caractères interdits dans un nom de dossier (la barre oblique inverse est le code 92). */
const FORBIDDEN_FILENAME_CHARS = '/' + String.fromCharCode(92) + ':*?"<>|';

/**
 * Nom de dossier valide pour un projet : les caractères interdits deviennent
 * des soulignés ; les points et espaces finaux sont retirés (Windows les
 * ignore), ce qui empêche aussi les noms "." et ".." de désigner un
 * dossier parent.
 */
export function sanitizeForFilesystem(name: string): string {
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

/** Dossier des sauvegardes d'un projet, toujours directement dans root. */
export function projectBackupDir(root: string, projectName: string): string {
  const base = path.resolve(root);
  const dir = path.join(base, sanitizeForFilesystem(projectName));

  if (path.dirname(dir) !== base) {
    throw new Error(mainMessage('backupInvalidProjectName'));
  }

  return dir;
}

/** Vérifie qu'un nom de fichier de sauvegarde ne contient aucun chemin. */
export function isSafeBackupFileName(fileName: unknown): fileName is string {
  return (
    typeof fileName === 'string' &&
    fileName.length > '.json'.length &&
    fileName.endsWith('.json') &&
    path.basename(fileName) === fileName &&
    !fileName.startsWith('.')
  );
}

/** Partie horodatée d'un nom de sauvegarde : 2026-10-22T14-30-05-123Z. */
export function backupTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

/** Format des noms : 2026-10-22T14-30-05-123Z.json (ou -avant-conversion.json, -version.json). */
const BACKUP_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(-avant-conversion|-version)?\.json$/;

/** Date d'une sauvegarde d'après son nom, ou null si le nom n'a pas le format attendu. */
export function backupTime(fileName: string): number | null {
  const match = BACKUP_NAME_PATTERN.exec(fileName);
  if (!match) return null;
  const time = Date.parse(
    match[1] + 'T' + match[2] + ':' + match[3] + ':' + match[4] + '.' + match[5] + 'Z'
  );
  return Number.isNaN(time) ? null : time;
}

/** Type d'une sauvegarde d'après son nom. */
export function backupKind(fileName: string): BackupKind {
  if (fileName.endsWith(NAMED_SUFFIX)) return 'named';
  if (fileName.endsWith(PRE_CONVERSION_SUFFIX)) return 'pre-conversion';
  return 'auto';
}

/** Caractères de contrôle et caractères invisibles (espaces sans largeur, etc.). */
function isInvisibleChar(code: number): boolean {
  return (
    code < 32 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    code === 0xfeff
  );
}

/**
 * Nom d'une version : espaces regroupés, caractères invisibles retirés,
 * au plus VERSION_LABEL_MAX caractères. Renvoie '' si rien ne reste.
 */
export function sanitizeVersionLabel(label: unknown): string {
  const text = typeof label === 'string' ? label : '';
  let cleaned = '';

  for (const char of text.replace(/\s+/g, ' ')) {
    if (!isInvisibleChar(char.charCodeAt(0))) cleaned += char;
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, VERSION_LABEL_MAX).join('').trim();
}

/** Supprime les fichiers temporaires laissés par une écriture interrompue. */
export async function removeStaleTempFiles(dir: string): Promise<void> {
  let files: string[];

  try {
    files = await fs.promises.readdir(dir);
  } catch {
    return;
  }

  for (const fileName of files) {
    if (!fileName.endsWith(TEMP_SUFFIX)) continue;
    try {
      await fs.promises.unlink(path.join(dir, fileName));
    } catch (error) {
      console.error('Impossible de supprimer un fichier temporaire :', fileName, error);
    }
  }
}

/**
 * Écriture sécurisée : le contenu est écrit dans un fichier temporaire, forcé
 * sur le disque, puis renommé. Le fichier final est donc soit absent, soit
 * complet. Aucune de ces opérations ne bloque le processus principal.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = filePath + TEMP_SUFFIX;
  const data = Buffer.from(content, 'utf-8');
  let handle: Awaited<ReturnType<typeof fs.promises.open>> | null = null;

  try {
    handle = await fs.promises.open(tempPath, 'w');
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    if (handle !== null) {
      try {
 await handle.close();
      } catch {
 /* déjà fermé */
      }
    }
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      /* absent */
    }
    throw error;
  }
}

/** Écrit une sauvegarde de façon sécurisée (le dossier est créé si besoin). */
export async function writeBackupFile(dir: string, fileName: string, content: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
  await removeStaleTempFiles(dir);
  await writeFileAtomic(path.join(dir, fileName), content);
}

/** Indique si un fichier ou un dossier existe, sans bloquer le processus principal. */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sauvegardes automatiques à supprimer. On garde :
 * - les MAX_BACKUPS_PER_PROJECT plus récentes ;
 * - la plus récente de chaque heure sur les KEEP_HOURLY_HOURS dernières heures ;
 * - la plus récente de chaque jour sur les KEEP_DAILY_DAYS derniers jours.
 * Les versions nommées et les sauvegardes avant conversion ne sont jamais
 * sélectionnées, ni un fichier dont le nom n'a pas le format attendu.
 */
export function selectRegularBackupsToRemove(files: string[], now: number): string[] {
  const dated = files
    .filter((fileName) => backupKind(fileName) === 'auto')
    .map((fileName) => ({ fileName, time: backupTime(fileName) }))
    .filter((entry): entry is { fileName: string; time: number } => entry.time !== null)
    .sort((a, b) => b.time - a.time);

  const keep = new Set<string>();
  const seenHours = new Set<string>();
  const seenDays = new Set<string>();

  // Du plus récent au plus ancien : la première sauvegarde rencontrée pour
  // une heure (ou un jour) est donc la plus récente de cette heure (ou ce jour).
  dated.forEach((entry, index) => {
    if (index < MAX_BACKUPS_PER_PROJECT) keep.add(entry.fileName);

    // Jour et heure locaux : "hier" et "14 h" au sens de l'utilisateur.
    const date = new Date(entry.time);
    const dayKey = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
    const hourKey = dayKey + ' ' + date.getHours();
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

  return dated.filter((entry) => !keep.has(entry.fileName)).map((entry) => entry.fileName);
}

/** Applique la rotation dans le dossier de sauvegardes d'un projet (versions nommées intactes). */
export async function rotateBackups(dir: string, now: number = Date.now()): Promise<void> {
  const files = (await fs.promises.readdir(dir)).filter((fileName) => fileName.endsWith('.json'));
  const preConversion = files.filter((fileName) => backupKind(fileName) === 'pre-conversion').sort();
  const regular = files.filter((fileName) => backupKind(fileName) === 'auto');

  const toRemove = selectRegularBackupsToRemove(regular, now);
  const excess = preConversion.length - MAX_PRE_CONVERSION_BACKUPS;
  if (excess > 0) toRemove.push(...preConversion.slice(0, excess));

  for (const fileName of toRemove) {
    try {
      await fs.promises.unlink(path.join(dir, fileName));
    } catch (error) {
      console.error('Impossible de supprimer une ancienne sauvegarde :', fileName, error);
    }
  }
}

/**
 * Liste des sauvegardes, de la plus récente à la plus ancienne. La date vient
 * du nom du fichier ; le fichier n'est ouvert que si son nom n'a pas le
 * format habituel, ou pour lire le nom d'une version.
 */
export async function listBackupEntries(dir: string): Promise<BackupEntry[]> {
  if (!(await pathExists(dir))) return [];

  const fileNames = (await fs.promises.readdir(dir)).filter((fileName) => fileName.endsWith('.json'));
  const entries: BackupEntry[] = [];

  for (const fileName of fileNames) {
    const kind = backupKind(fileName);
    const time = backupTime(fileName);
    let savedAt: string | null = time !== null ? new Date(time).toISOString() : null;
    let label = '';

    if (time === null || kind === 'named') {
      try {
 const data = JSON.parse(await fs.promises.readFile(path.join(dir, fileName), 'utf-8')) as {
          savedAt?: unknown;
   label?: unknown;
        };
        if (savedAt === null && typeof data.savedAt === 'string') savedAt = data.savedAt;
        if (kind === 'named') label = sanitizeVersionLabel(data.label);
      } catch {
        /* fichier illisible : date ou nom inconnu */
      }
    }

    const entry: BackupEntry = { fileName, savedAt, kind };
    if (label) entry.label = label;
    entries.push(entry);
  }

  const timeOf = (entry: BackupEntry): number =>
    entry.savedAt ? Date.parse(entry.savedAt) : Number.NaN;

  return entries.sort((a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

/**
 * Supprime une version nommée. Toute autre sauvegarde (automatique, avant
 * conversion) ou tout nom contenant un chemin est refusé.
 * Renvoie false si le fichier n'existe déjà plus.
 */
export async function deleteNamedVersion(dir: string, fileName: unknown): Promise<boolean> {
  if (!isSafeBackupFileName(fileName) || !fileName.endsWith(NAMED_SUFFIX)) {
    throw new Error(mainMessage('backupOnlyNamedVersionsDeletable'));
  }

  const filePath = path.join(dir, fileName);
  if (!(await pathExists(filePath))) return false;

  await fs.promises.unlink(filePath);
  return true;
}

export interface MoveBackupsResult {
  /** Sauvegardes déplacées vers le nouveau nom. */
  moved: number;
  /** Sauvegardes laissées sous l'ancien nom (un fichier du même nom existait). */
  kept: number;
}

/**
 * Renommage d'un projet : ses sauvegardes suivent le nouveau nom. Si un
 * dossier existe déjà sous le nouveau nom, les fichiers sont réunis sans
 * jamais en écraser un.
 */
export async function moveProjectBackups(
  root: string,
  oldName: string,
  newName: string
): Promise<MoveBackupsResult> {
  const result: MoveBackupsResult = { moved: 0, kept: 0 };
  const oldDir = projectBackupDir(root, oldName);
  const newDir = projectBackupDir(root, newName);

  if (oldDir === newDir || !(await pathExists(oldDir))) return result;

  const files = (await fs.promises.readdir(oldDir)).filter((fileName) => fileName.endsWith('.json'));

  // Même dossier à la casse près (Windows), ou nouveau nom libre :
  // simple renommage du dossier.
  if (oldDir.toLowerCase() === newDir.toLowerCase() || !(await pathExists(newDir))) {
    await fs.promises.rename(oldDir, newDir);
    result.moved = files.length;
    return result;
  }

  // Réunion : aucun fichier existant n'est écrasé.
  for (const fileName of files) {
    const target = path.join(newDir, fileName);
    if (await pathExists(target)) {
      result.kept++;
      continue;
    }
    await fs.promises.rename(path.join(oldDir, fileName), target);
    result.moved++;
  }

  // Dossier de l'ancien nom retiré s'il est vide (sinon il reste, sans risque).
  try {
    await fs.promises.rmdir(oldDir);
  } catch {
    /* pas vide */
  }

  return result;
}
