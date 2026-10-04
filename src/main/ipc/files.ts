// src/main/ipc/files.ts
//
// Gestion IPC des fichiers :
// - boîtes de dialogue ;
// - export TXT, DOCX et PDF ;
// - export/import des projets Scriptorium ;
// - import ODT ;
// - désinfection HTML ;
// - ouverture des liens externes.

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

import {
  generateDocx
} from '../docx-generator';

import {
  importOdtProject
} from '../odt-importer';

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
 * Construit le nom de projet à partir du nom du fichier.
 */
function getProjectNameFromFile(
  filePath: string
): string {
  const extension =
    path.extname(filePath);

  return path
    .basename(
      filePath,
      extension
    )
    .trim();
}

/**
 * Charge un projet Scriptorium ou JSON.
 */
function importScriptoriumProject(
  filePath: string
): ImportedProject {
  const rawContent =
    fs.readFileSync(
      filePath,
      'utf8'
    );

  const parsed =
    JSON.parse(rawContent) as
      | {
          schemaVersion?: number;
          projectName?: string;
          projectData?: ProjectData;
        }
      | ProjectData;

  /*
   * Format d’export actuel :
   *
   * {
   *   schemaVersion,
   *   projectName,
   *   projectData
   * }
   */
  if (
    parsed &&
    typeof parsed === 'object' &&
    'projectData' in parsed &&
    parsed.projectData
  ) {
    return {
      projectName:
        typeof parsed.projectName ===
          'string' &&
        parsed.projectName.trim()
          ? parsed.projectName.trim()
          : getProjectNameFromFile(
              filePath
            ),

      projectData:
        sanitizeProjectData(
          parsed.projectData
        )
    };
  }

  /*
   * Compatibilité avec les anciens fichiers JSON qui contenaient directement
   * les données du projet.
   */
  return {
    projectName:
      getProjectNameFromFile(
        filePath
      ),

    projectData:
      sanitizeProjectData(
        parsed as ProjectData
      )
  };
}

/**
 * Charge un fichier pris en charge selon son extension.
 */
async function importSupportedProject(
  filePath: string
): Promise<ImportedProject> {
  const extension =
    path
      .extname(filePath)
      .toLowerCase();

  if (extension === '.odt') {
    const imported =
      await importOdtProject(
        filePath
      );

    return {
      projectName:
        imported.projectName ||
        getProjectNameFromFile(
          filePath
        ),

      projectData:
        sanitizeProjectData(
          imported.projectData
        )
    };
  }

  if (
    extension === '.scriptorium' ||
    extension === '.json'
  ) {
    return importScriptoriumProject(
      filePath
    );
  }

  throw new Error(
    `Format de fichier non pris en charge : ${
      extension || 'sans extension'
    }`
  );
}

/**
 * Attend le chargement des polices du document d’impression.
 */
async function waitForPrintFonts(
  pdfWindow: BrowserWindow
): Promise<void> {
  await pdfWindow.webContents.executeJavaScript(`
    (async () => {
      if (
        document.fonts &&
        typeof document.fonts.ready !== 'undefined'
      ) {
        try {
          await document.fonts.ready;
        } catch {
          // Le PDF peut être généré avec la police de repli.
        }
      }

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
    })();
  `);
}

/**
 * Corrige le document temporaire avant sa conversion en PDF.
 *
 * Les retours à la ligne et l’indentation placés autour du texte dans le HTML
 * peuvent créer des espaces supplémentaires dans les blocs de scénario.
 * Les nœuds texte directs sont donc nettoyés avant l’impression.
 */
async function preparePrintDocument(
  pdfWindow: BrowserWindow
): Promise<void> {
  await pdfWindow.webContents.executeJavaScript(`
    (() => {
      document
        .querySelectorAll(
          '.scene-heading, .element, .screenplay-scene-heading, .screenplay-element-content'
        )
        .forEach((element) => {
          Array
            .from(element.childNodes)
            .forEach((node) => {
              if (node.nodeType !== Node.TEXT_NODE) {
                return;
              }

              if (!node.textContent) {
                return;
              }

              node.textContent = node.textContent
                .replace(/^\\s+/, '')
                .replace(/\\s+$/, '');
            });
        });

      const style =
        document.createElement('style');

      style.dataset.scriptoriumPdfFix =
        'true';

      style.textContent = \`
        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        body {
          color: #111 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .screenplay-print-document {
          width: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          color: #111 !important;
          background: #fff !important;
          box-shadow: none !important;
          border: 0 !important;
        }

        .screenplay-scene {
          break-inside: auto;
          page-break-inside: auto;
        }

        .scene-heading,
        .screenplay-scene-heading {
          margin-top: 1.2em !important;
          margin-bottom: 1.2em !important;
          padding: 0 !important;
          color: #111 !important;
          background: transparent !important;
          break-after: avoid !important;
          page-break-after: avoid !important;
        }

        .screenplay-scene:first-child
        .scene-heading,
        .screenplay-scene:first-child
        .screenplay-scene-heading {
          margin-top: 0 !important;
        }

        .element,
        .screenplay-element-content {
          min-height: 1.2em;
          padding: 0 !important;
          color: #111 !important;
          background: transparent !important;
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
        }

        .screenplay-scene-meta,
        .screenplay-element-type-indicator,
        .screenplay-scene::before,
        .screenplay-scene::after,
        .screenplay-element::before,
        .screenplay-scene-heading::before {
          display: none !important;
        }
      \`;

      document.head.appendChild(style);
    })();
  `);

  await waitForPrintFonts(
    pdfWindow
  );
}

/**
 * Enregistre tous les gestionnaires IPC relatifs aux fichiers.
 */
export function registerFileIpc(): void {
  ipcMain.handle(
    'dialog:show-save',
    async (
      _event,
      options: SaveDialogOptions
    ) => {
      return dialog.showSaveDialog(
        options
      );
    }
  );

  ipcMain.handle(
    'dialog:show-open',
    async (
      _event,
      options: OpenDialogOptions
    ) => {
      return dialog.showOpenDialog(
        options
      );
    }
  );

  ipcMain.handle(
    'export:txt',
    async (
      _event,
      payload: {
        filePath: string;
        text: string;
      }
    ): Promise<void> => {
      await fs.promises.writeFile(
        payload.filePath,
        payload.text,
        'utf8'
      );
    }
  );

  ipcMain.handle(
    'export:docx',
    async (
      _event,
      payload: {
        filePath: string;
        docxData: DocxParagraph[];
      }
    ): Promise<void> => {
      await generateDocx(
        payload.filePath,
        payload.docxData
      );
    }
  );

  ipcMain.handle(
    'export:pdf',
    async (
      _event,
      payload: {
        filePath: string;
        htmlContent: string;
      }
    ): Promise<void> => {
      const temporaryDirectory =
        await fs.promises.mkdtemp(
          path.join(
            os.tmpdir(),
            'scriptorium-pdf-'
          )
        );

      const temporaryHtmlPath =
        path.join(
          temporaryDirectory,
          'document.html'
        );

      let pdfWindow:
        | BrowserWindow
        | null = null;

      try {
        await fs.promises.writeFile(
          temporaryHtmlPath,
          payload.htmlContent,
          'utf8'
        );

        pdfWindow =
          new BrowserWindow({
            show: false,

            webPreferences: {
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false
            }
          });

        await pdfWindow.loadFile(
          temporaryHtmlPath
        );

        await preparePrintDocument(
          pdfWindow
        );

        /*
         * Ne pas utiliser marginType ici.
         *
         * Cette propriété appartient à webContents.print(), pas aux marges de
         * printToPDF dans la version actuelle d’Electron. Les dimensions et
         * marges sont définies par la règle CSS @page du document.
         */
        const pdfBuffer =
          await pdfWindow.webContents.printToPDF(
            {
              printBackground: true,
              preferCSSPageSize: true
            }
          );

        await fs.promises.writeFile(
          payload.filePath,
          pdfBuffer
        );
      } finally {
        if (
          pdfWindow &&
          !pdfWindow.isDestroyed()
        ) {
          pdfWindow.destroy();
        }

        await fs.promises.rm(
          temporaryDirectory,
          {
            recursive: true,
            force: true
          }
        );
      }
    }
  );

  ipcMain.handle(
    'project:export',
    async (
      _event,
      payload: {
        filePath: string;
        projectName: string;
        projectData: ProjectData;
      }
    ): Promise<void> => {
      const exportData = {
        schemaVersion:
          SCHEMA_VERSION,

        projectName:
          payload.projectName,

        projectData:
          sanitizeProjectData(
            payload.projectData
          )
      };

      await fs.promises.writeFile(
        payload.filePath,
        JSON.stringify(
          exportData,
          null,
          2
        ),
        'utf8'
      );
    }
  );

  ipcMain.handle(
    'project:import',
    async (
      _event,
      filePath: string
    ): Promise<ImportedProject> => {
      return importSupportedProject(
        filePath
      );
    }
  );

  ipcMain.handle(
    'sanitize:html',
    (
      _event,
      html: string
    ): string => {
      return sanitizeHtml(
        typeof html === 'string'
          ? html
          : '',
        CHAPTER_HTML_SANITIZE_OPTIONS
      );
    }
  );

  ipcMain.handle(
    'shell:open-external',
    async (
      _event,
      url: string
    ): Promise<void> => {
      if (
        typeof url !== 'string' ||
        !/^https?:\/\//i.test(url)
      ) {
        throw new Error(
          'URL externe invalide.'
        );
      }

      await shell.openExternal(url);
    }
  );
}
