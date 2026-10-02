// src/main/ipc/backups.ts
// SAUVEGARDES AUTOMATIQUES HORODATÉES
// Un instantané complet du projet est écrit dans un dossier dédié du profil
// utilisateur, avec rotation (on ne garde que les N dernières par projet).
// Objectif : pouvoir revenir en arrière après une suppression ou un
// remplacement malheureux, indépendamment du fichier de travail courant.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import { sanitizeProjectData } from '../sanitize';
import type { BackupEntry, ProjectData } from '../../shared/types';

const MAX_BACKUPS_PER_PROJECT = 10;

function backupsDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function ensureBackupsDir(): void {
  const dir = backupsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Les noms de projet peuvent contenir des caractères invalides pour un nom de
// fichier/dossier (/ \ : * ? " < > |) : on les neutralise pour créer un nom de
// dossier sûr, tout en gardant le nom d'origine dans les métadonnées.
function sanitizeForFilesystem(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'projet';
}

function projectBackupDir(projectName: string): string {
  return path.join(backupsDir(), sanitizeForFilesystem(projectName));
}

export function registerBackupIpc(): void {
  ipcMain.handle(
    'backup:create',
    (_e, { projectName, projectData }: { projectName: string; projectData: ProjectData }) => {
      ensureBackupsDir();
      const dir = projectBackupDir(projectName);
      fs.mkdirSync(dir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${timestamp}.json`;
      fs.writeFileSync(
        path.join(dir, fileName),
        JSON.stringify({ projectName, projectData, savedAt: new Date().toISOString() }, null, 2),
        'utf-8'
      );

      // Rotation : on ne garde que les MAX_BACKUPS_PER_PROJECT plus récentes.
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      const excess = files.length - MAX_BACKUPS_PER_PROJECT;
      if (excess > 0) {
        files.slice(0, excess).forEach((f) => fs.unlinkSync(path.join(dir, f)));
      }

      return { fileName };
    }
  );

  ipcMain.handle('backup:list', (_e, projectName: string): BackupEntry[] => {
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
    (_e, { projectName, fileName }: { projectName: string; fileName: string }): ProjectData => {
      const dir = projectBackupDir(projectName);
      const filePath = path.join(dir, fileName);
      if (!fs.existsSync(filePath)) throw new Error('Sauvegarde introuvable.');

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { projectData?: unknown };
      return sanitizeProjectData(data.projectData);
    }
  );
}
