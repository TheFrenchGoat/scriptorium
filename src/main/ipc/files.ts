// src/main/ipc/files.ts
// Dialogues natifs + écriture disque. L'écriture se fait UNIQUEMENT côté main,
// le renderer n'ayant aucun accès à 'fs' (voir contextIsolation dans main.ts).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell
} from 'electron';
import sanitizeHtml from 'sanitize-html';
import { generateDocx } from '../docx-generator';
import { importOdtProject } from '../odt-importer';
import {
  CHAPTER_HTML_SANITIZE_OPTIONS,
  sanitizeProjectData
} from '../sanitize';
import type {
  DocxParagraph,
  ImportedProject,
  OpenDialogOptions,
  ProjectData,
  SaveDialogOptions
} from '../../shared/types';

const SCHEMA_VERSION = 1;

/**
 * Importe un projet Scriptorium depuis son format JSON portable.
 */
function importScriptoriumProject(
  filePath: string
): ImportedProject {
  const raw = fs.readFileSync(filePath, 'utf-8');

  const payload = JSON.parse(raw) as {
    projectName?: string;
    projectData?: unknown;
  };

  if (
    !payload ||
    typeof payload !== 'object' ||
    !payload.projectData
  ) {
    throw new Error(
      "Fichier invalide : ce n'est pas un export Scriptorium reconnu."
    );
  }

  return {
    projectName:
      typeof payload.projectName === 'string' &&
      payload.projectName.trim()
        ? payload.projectName.trim()
        : 'Projet importé',
    projectData: sanitizeProjectData(
      payload.projectData
    )
  };
}

/**
 * Sélectionne automatiquement l'importateur correspondant à l'extension du
 * fichier choisi sur la page d'accueil.
 *
 * Formats pris en charge :
 * - .scriptorium et .json : projet Scriptorium complet ;
 * - .odt : document LibreOffice découpé automatiquement en chapitres.
 */
function importSupportedProject(
  filePath: string
): ImportedProject {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  if (extension === '.odt') {
    return importOdtProject(filePath);
  }

  if (
    extension === '.scriptorium' ||
    extension === '.json'
  ) {
    return importScriptoriumProject(filePath);
  }

  throw new Error(
    `Format de fichier non pris en charge : ${
      extension || 'extension absente'
    }.`
  );
}

export function registerFileIpc(): void {
  // -----------------------------------------------------------------------
  // BOÎTES DE DIALOGUE
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'dialog:show-save',
    async (
      _event,
      options: SaveDialogOptions
    ) => dialog.showSaveDialog(options)
  );

  ipcMain.handle(
    'dialog:show-open',
    async (
      _event,
      options: OpenDialogOptions
    ) =>
      dialog.showOpenDialog(
        options as Electron.OpenDialogOptions
      )
  );

  // -----------------------------------------------------------------------
  // EXPORTS SIMPLES
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'export:txt',
    (
      _event,
      {
        filePath,
        text
      }: {
        filePath: string;
        text: string;
      }
    ) => {
      fs.writeFileSync(
        filePath,
        text,
        'utf-8'
      );

      return true;
    }
  );

  ipcMain.handle(
    'export:docx',
    async (
      _event,
      {
        filePath,
        docxData
      }: {
        filePath: string;
        docxData: DocxParagraph[];
      }
    ) => {
      await generateDocx(
        filePath,
        docxData
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // EXPORT PDF
  //
  // Le rendu est effectué avec une fenêtre Electron invisible. Le PDF
  // correspond donc à la mise en page HTML/CSS réelle.
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'export:pdf',
    async (
      _event,
      {
        filePath,
        htmlContent
      }: {
        filePath: string;
        htmlContent: string;
      }
    ) => {
      const tempHtmlPath = path.join(
        os.tmpdir(),
        `scriptorium-print-${Date.now()}.html`
      );

      fs.writeFileSync(
        tempHtmlPath,
        htmlContent,
        'utf-8'
      );

      const pdfWindow =
        new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true
          }
        });

      try {
        await pdfWindow.loadFile(
          tempHtmlPath
        );

        const pdfBuffer =
          await pdfWindow.webContents.printToPDF(
            {
              printBackground: true,
              preferCSSPageSize: true
            }
          );

        fs.writeFileSync(
          filePath,
          Buffer.from(pdfBuffer)
        );

        return true;
      } finally {
        pdfWindow.destroy();

        fs.unlink(
          tempHtmlPath,
          () => {
            /*
             * Suppression best-effort : un éventuel échec de nettoyage du
             * fichier temporaire ne doit pas faire échouer l'export terminé.
             */
          }
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // EXPORT D'UN PROJET COMPLET
  //
  // Sauvegarde manuelle portable et indépendante du store interne.
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'project:export',
    (
      _event,
      {
        filePath,
        projectName,
        projectData
      }: {
        filePath: string;
        projectName: string;
        projectData: ProjectData;
      }
    ) => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        appName: 'Scriptorium',
        exportedAt:
          new Date().toISOString(),
        projectName,
        projectData
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(
          payload,
          null,
          2
        ),
        'utf-8'
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // IMPORT DE PROJET OU DE DOCUMENT LIBREOFFICE
  //
  // Le même canal IPC est conservé afin que le renderer puisse utiliser le
  // bouton Importer existant. Le format est détecté à partir de l'extension.
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'project:import',
    (
      _event,
      filePath: string
    ): ImportedProject => {
      if (
        typeof filePath !== 'string' ||
        filePath.trim().length === 0
      ) {
        throw new Error(
          "Aucun fichier n'a été sélectionné."
        );
      }

      return importSupportedProject(
        filePath
      );
    }
  );

  // -----------------------------------------------------------------------
  // DÉSINFECTION HTML
  //
  // Utilisée notamment lors d'un collage dans l'éditeur.
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'sanitize:html',
    (
      _event,
      html: string
    ) =>
      sanitizeHtml(
        html,
        CHAPTER_HTML_SANITIZE_OPTIONS
      )
  );

  // -----------------------------------------------------------------------
  // LIENS EXTERNES
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'shell:open-external',
    (
      _event,
      url: string
    ) => {
      if (
        typeof url === 'string' &&
        /^https?:\/\//i.test(url)
      ) {
        void shell.openExternal(url);
      }
    }
  );
}
