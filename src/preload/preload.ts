// src/preload/preload.ts
// Pont sécurisé entre le renderer React et le processus principal.
//
// Le renderer n'accède jamais directement à Node.js, au système de fichiers
// ou à Electron. Seules les méthodes explicitement déclarées ici sont
// accessibles via window.api.

import {
  contextBridge,
  ipcRenderer
} from 'electron';

import type {
  DocxParagraph,
  EditorPrefs,
  GrammarInstallProgress,
  GrammarPrefs,
  LanguageCode,
  LegacyData,
  OpenDialogOptions,
  ProjectData,
  ProjectsMap,
  SaveDialogOptions,
  ScriptoriumApi,
  ThemeName,
  UiState,
  WritingStats
} from '../shared/types';

const api: ScriptoriumApi = {
  // -----------------------------------------------------------------------
  // PERSISTANCE DES PROJETS
  // -----------------------------------------------------------------------

  getProjects: () =>
    ipcRenderer.invoke(
      'store:get-projects'
    ),

  saveProjects: (
    projects: ProjectsMap
  ) =>
    ipcRenderer.invoke(
      'store:save-projects',
      projects
    ),

  /**
   * Sauvegarde uniquement le contenu d'un chapitre.
   *
   * Cela évite d'envoyer tous les projets depuis le renderer à chaque
   * modification du texte.
   */
  saveProjectChapter: (
    projectName: string,
    chapterName: string,
    html: string
  ) =>
    ipcRenderer.invoke(
      'store:save-project-chapter',
      {
        projectName,
        chapterName,
        html
      }
    ),

  // -----------------------------------------------------------------------
  // ÉTAT D'INTERFACE
  // -----------------------------------------------------------------------

  getUiState: () =>
    ipcRenderer.invoke(
      'store:get-ui-state'
    ),

  saveUiState: (
    uiState: UiState
  ) =>
    ipcRenderer.invoke(
      'store:save-ui-state',
      uiState
    ),

  // -----------------------------------------------------------------------
  // THÈME ET LANGUE
  // -----------------------------------------------------------------------

  getTheme: () =>
    ipcRenderer.invoke(
      'store:get-theme'
    ),

  saveTheme: (
    theme: ThemeName
  ) =>
    ipcRenderer.invoke(
      'store:save-theme',
      theme
    ),

  getLanguage: () =>
    ipcRenderer.invoke(
      'store:get-language'
    ),

  saveLanguage: (
    lang: LanguageCode
  ) =>
    ipcRenderer.invoke(
      'store:save-language',
      lang
    ),

  // -----------------------------------------------------------------------
  // PRÉFÉRENCES DE L'ÉDITEUR
  // -----------------------------------------------------------------------

  getEditorPrefs: () =>
    ipcRenderer.invoke(
      'store:get-editor-prefs'
    ),

  saveEditorPrefs: (
    prefs: EditorPrefs
  ) =>
    ipcRenderer.invoke(
      'store:save-editor-prefs',
      prefs
    ),

  // -----------------------------------------------------------------------
  // STATISTIQUES HISTORIQUES
  // -----------------------------------------------------------------------

  getWritingStats: () =>
    ipcRenderer.invoke(
      'store:get-writing-stats'
    ),

  saveWritingStats: (
    stats: WritingStats
  ) =>
    ipcRenderer.invoke(
      'store:save-writing-stats',
      stats
    ),

  // -----------------------------------------------------------------------
  // CORRECTEUR ORTHOGRAPHIQUE NATIF
  // -----------------------------------------------------------------------

  getNativeSpellcheck: () =>
    ipcRenderer.invoke(
      'store:get-native-spellcheck'
    ),

  setNativeSpellcheck: (
    enabled: boolean
  ) =>
    ipcRenderer.invoke(
      'store:set-native-spellcheck',
      enabled
    ),

  // -----------------------------------------------------------------------
  // PROJET COURANT
  // -----------------------------------------------------------------------

  getCurrentProject: () =>
    ipcRenderer.invoke(
      'store:get-current-project'
    ),

  setCurrentProject: (
    name: string
  ) =>
    ipcRenderer.invoke(
      'store:set-current-project',
      name
    ),

  clearCurrentProject: () =>
    ipcRenderer.invoke(
      'store:clear-current-project'
    ),

  // -----------------------------------------------------------------------
  // MIGRATION DEPUIS LOCALSTORAGE
  // -----------------------------------------------------------------------

  migrateFromLocalStorage: (
    legacyData: LegacyData
  ) =>
    ipcRenderer.invoke(
      'store:migrate',
      legacyData
    ),

  // -----------------------------------------------------------------------
  // DIALOGUES NATIFS
  // -----------------------------------------------------------------------

  showSaveDialog: (
    options: SaveDialogOptions
  ) =>
    ipcRenderer.invoke(
      'dialog:show-save',
      options
    ),

  showOpenDialog: (
    options: OpenDialogOptions
  ) =>
    ipcRenderer.invoke(
      'dialog:show-open',
      options
    ),

  // -----------------------------------------------------------------------
  // EXPORTS
  // -----------------------------------------------------------------------

  exportTxt: (
    filePath: string,
    text: string
  ) =>
    ipcRenderer.invoke(
      'export:txt',
      {
        filePath,
        text
      }
    ),

  exportDocx: (
    filePath: string,
    docxData: DocxParagraph[]
  ) =>
    ipcRenderer.invoke(
      'export:docx',
      {
        filePath,
        docxData
      }
    ),

  exportPdf: (
    filePath: string,
    htmlContent: string
  ) =>
    ipcRenderer.invoke(
      'export:pdf',
      {
        filePath,
        htmlContent
      }
    ),

  // -----------------------------------------------------------------------
  // IMPORT / EXPORT DE PROJETS
  // -----------------------------------------------------------------------

  exportProject: (
    filePath: string,
    projectName: string,
    projectData: ProjectData
  ) =>
    ipcRenderer.invoke(
      'project:export',
      {
        filePath,
        projectName,
        projectData
      }
    ),

  importProject: (
    filePath: string
  ) =>
    ipcRenderer.invoke(
      'project:import',
      filePath
    ),

  // -----------------------------------------------------------------------
  // SAUVEGARDES HORODATÉES
  // -----------------------------------------------------------------------

  createBackup: (
    projectName: string,
    projectData: ProjectData
  ) =>
    ipcRenderer.invoke(
      'backup:create',
      {
        projectName,
        projectData
      }
    ),

  listBackups: (
    projectName: string
  ) =>
    ipcRenderer.invoke(
      'backup:list',
      projectName
    ),

  restoreBackup: (
    projectName: string,
    fileName: string
  ) =>
    ipcRenderer.invoke(
      'backup:restore',
      {
        projectName,
        fileName
      }
    ),

  // -----------------------------------------------------------------------
  // DÉSINFECTION HTML
  // -----------------------------------------------------------------------

  sanitizeHtml: (
    html: string
  ) =>
    ipcRenderer.invoke(
      'sanitize:html',
      html
    ),

  // -----------------------------------------------------------------------
  // CORRECTEUR DE GRAMMAIRE LANGUAGETOOL
  // -----------------------------------------------------------------------

  getGrammarPrefs: () =>
    ipcRenderer.invoke(
      'store:get-grammar-prefs'
    ),

  saveGrammarPrefs: (
    prefs: Partial<GrammarPrefs>
  ) =>
    ipcRenderer.invoke(
      'store:save-grammar-prefs',
      prefs
    ),

  selectLanguageToolFolder: () =>
    ipcRenderer.invoke(
      'dialog:select-languagetool-folder'
    ),

  checkJavaAvailable: () =>
    ipcRenderer.invoke(
      'grammar:check-java'
    ),

  startGrammarServer: () =>
    ipcRenderer.invoke(
      'grammar:start-server'
    ),

  checkGrammar: (
    text: string,
    language: string
  ) =>
    ipcRenderer.invoke(
      'grammar:check-text',
      {
        text,
        language
      }
    ),

  installLanguageToolAuto: () =>
    ipcRenderer.invoke(
      'grammar:auto-install'
    ),

  onGrammarInstallProgress: (
    callback: (
      data: GrammarInstallProgress
    ) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: GrammarInstallProgress
    ): void => {
      callback(data);
    };

    ipcRenderer.on(
      'grammar:install-progress',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'grammar:install-progress',
        listener
      );
    };
  },

  onGrammarServerStopped: (
    callback: () => void
  ) => {
    const listener = (): void => {
      callback();
    };

    ipcRenderer.on(
      'grammar:server-stopped',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'grammar:server-stopped',
        listener
      );
    };
  },

  openExternalLink: (
    url: string
  ) =>
    ipcRenderer.invoke(
      'shell:open-external',
      url
    ),

  // -----------------------------------------------------------------------
  // MISES À JOUR AUTOMATIQUES
  // -----------------------------------------------------------------------

  checkForUpdates: () =>
    ipcRenderer.invoke(
      'updater:check'
    ),

  getAppVersion: () =>
    ipcRenderer.invoke(
      'updater:get-version'
    ),

  confirmUpdateDownload: () =>
    ipcRenderer.invoke(
      'updater:confirm-download'
    ),

  quitAndInstall: () =>
    ipcRenderer.invoke(
      'updater:quit-and-install'
    ),

  onUpdateAvailable: (
    callback: (info: {
      version: string;
    }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      info: {
        version: string;
      }
    ): void => {
      callback(info);
    };

    ipcRenderer.on(
      'updater:update-available',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'updater:update-available',
        listener
      );
    };
  },

  onUpdateNotAvailable: (
    callback: () => void
  ) => {
    const listener = (): void => {
      callback();
    };

    ipcRenderer.on(
      'updater:update-not-available',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'updater:update-not-available',
        listener
      );
    };
  },

  onUpdateDownloaded: (
    callback: (info: {
      version: string;
    }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      info: {
        version: string;
      }
    ): void => {
      callback(info);
    };

    ipcRenderer.on(
      'updater:update-downloaded',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'updater:update-downloaded',
        listener
      );
    };
  },

  onUpdateError: (
    callback: (
      message: string
    ) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      message: string
    ): void => {
      callback(message);
    };

    ipcRenderer.on(
      'updater:error',
      listener
    );

    return () => {
      ipcRenderer.removeListener(
        'updater:error',
        listener
      );
    };
  }
};

contextBridge.exposeInMainWorld(
  'api',
  api
);
