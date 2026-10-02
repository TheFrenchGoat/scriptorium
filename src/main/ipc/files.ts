// src/main/ipc/files.ts
// Dialogues natifs + écriture disque. L'écriture se fait UNIQUEMENT côté main,
// le renderer n'ayant aucun accès à 'fs' (voir contextIsolation dans main.ts).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { generateDocx } from '../docx-generator';
import { CHAPTER_HTML_SANITIZE_OPTIONS, sanitizeProjectData } from '../sanitize';
import sanitizeHtml from 'sanitize-html';
import type {
  DocxParagraph,
  ImportedProject,
  OpenDialogOptions,
  ProjectData,
  SaveDialogOptions
} from '../../shared/types';

const SCHEMA_VERSION = 1;

export function registerFileIpc(): void {
  // --- Boîtes de dialogue ---
  ipcMain.handle('dialog:show-save', async (_e, options: SaveDialogOptions) => dialog.showSaveDialog(options));
  ipcMain.handle('dialog:show-open', async (_e, options: OpenDialogOptions) =>
    dialog.showOpenDialog(options as Electron.OpenDialogOptions)
  );

  // --- Exports simples ---
  ipcMain.handle('export:txt', (_e, { filePath, text }: { filePath: string; text: string }) => {
    fs.writeFileSync(filePath, text, 'utf-8');
    return true;
  });

  ipcMain.handle(
    'export:docx',
    async (_e, { filePath, docxData }: { filePath: string; docxData: DocxParagraph[] }) => {
      await generateDocx(filePath, docxData);
      return true;
    }
  );

  // --- EXPORT PDF — rendu via une fenêtre Electron invisible (le PDF est le
  // résultat de la mise en page HTML/CSS réelle, pas une approximation). ---
  ipcMain.handle(
    'export:pdf',
    async (_e, { filePath, htmlContent }: { filePath: string; htmlContent: string }) => {
      const tempHtmlPath = path.join(os.tmpdir(), `scriptorium-print-${Date.now()}.html`);
      fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

      const pdfWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      try {
        await pdfWindow.loadFile(tempHtmlPath);
        const pdfBuffer = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true
        });
        fs.writeFileSync(filePath, Buffer.from(pdfBuffer));
        return true;
      } finally {
        pdfWindow.destroy();
        fs.unlink(tempHtmlPath, () => {}); // best-effort
      }
    }
  );

  // --- EXPORT / IMPORT DE PROJET COMPLET (.scriptorium) ---
  // Sauvegarde manuelle portable, indépendante du store interne : changer de
  // PC, envoyer son projet à quelqu'un, garder une copie hors-ligne.
  ipcMain.handle(
    'project:export',
    (
      _e,
      {
        filePath,
        projectName,
        projectData
      }: { filePath: string; projectName: string; projectData: ProjectData }
    ) => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        appName: 'Scriptorium',
        exportedAt: new Date().toISOString(),
        projectName,
        projectData
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return true;
    }
  );

  ipcMain.handle('project:import', (_e, filePath: string): ImportedProject => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const payload = JSON.parse(raw) as { projectName?: string; projectData?: unknown };

    if (!payload || typeof payload !== 'object' || !payload.projectData) {
      throw new Error("Fichier invalide : ce n'est pas un export Scriptorium reconnu.");
    }

    return {
      projectName: payload.projectName || 'Projet importé',
      projectData: sanitizeProjectData(payload.projectData)
    };
  });

  // Désinfection à la demande, utilisée lors d'un collage dans l'éditeur.
  ipcMain.handle('sanitize:html', (_e, html: string) => sanitizeHtml(html, CHAPTER_HTML_SANITIZE_OPTIONS));

  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) void shell.openExternal(url);
  });
}
