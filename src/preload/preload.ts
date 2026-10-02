// src/preload/preload.ts
// Pont sécurisé entre le processus principal (Node/Electron) et le renderer.
// Avec contextIsolation: true, le renderer n'a AUCUN accès direct à Node ou à
// Electron : il ne peut appeler que les fonctions explicitement exposées ici.
// Chaque fonction correspond à un canal IPC précis et limité (pas d'accès
// générique à ipcRenderer.invoke depuis le code de la page).
//
// Le typage `const api: ScriptoriumApi` garantit que toute évolution du
// contrat partagé (src/shared/types.ts) casse la compilation ici tant que le
// pont n'a pas été mis à jour — impossible d'oublier un canal.

import { contextBridge, ipcRenderer } from 'electron';
import type {
  DocxParagraph,
  EditorPrefs,
  GrammarInstallProgress,
  LanguageCode,
  LegacyData,
  OpenDialogOptions,
  ProjectData,
  ProjectsMap,
  SaveDialogOptions,
  ScriptoriumApi,
  ThemeName,
  UiState,
  WritingStats,
  GrammarPrefs
} from '../shared/types';

const api: ScriptoriumApi = {
  // --- Persistance des projets ---
  getProjects: () => ipcRenderer.invoke('store:get-projects'),
  saveProjects: (projects: ProjectsMap) => ipcRenderer.invoke('store:save-projects', projects),

  // --- État d'interface (onglets ouverts, onglet actif...) ---
  getUiState: () => ipcRenderer.invoke('store:get-ui-state'),
  saveUiState: (uiState: UiState) => ipcRenderer.invoke('store:save-ui-state', uiState),

  // --- Thème ---
  getTheme: () => ipcRenderer.invoke('store:get-theme'),
  saveTheme: (theme: ThemeName) => ipcRenderer.invoke('store:save-theme', theme),

  // --- Langue de l'interface ---
  getLanguage: () => ipcRenderer.invoke('store:get-language'),
  saveLanguage: (lang: LanguageCode) => ipcRenderer.invoke('store:save-language', lang),

  // --- Préférences d'affichage (largeur, police, interligne) ---
  getEditorPrefs: () => ipcRenderer.invoke('store:get-editor-prefs'),
  saveEditorPrefs: (prefs: EditorPrefs) => ipcRenderer.invoke('store:save-editor-prefs', prefs),

  // --- Statistiques d'écriture ---
  getWritingStats: () => ipcRenderer.invoke('store:get-writing-stats'),
  saveWritingStats: (stats: WritingStats) => ipcRenderer.invoke('store:save-writing-stats', stats),

  // --- Correcteur orthographique natif (Chromium) ---
  getNativeSpellcheck: () => ipcRenderer.invoke('store:get-native-spellcheck'),
  setNativeSpellcheck: (enabled: boolean) => ipcRenderer.invoke('store:set-native-spellcheck', enabled),

  // --- Projet actuellement ouvert ---
  getCurrentProject: () => ipcRenderer.invoke('store:get-current-project'),
  setCurrentProject: (name: string) => ipcRenderer.invoke('store:set-current-project', name),
  clearCurrentProject: () => ipcRenderer.invoke('store:clear-current-project'),

  // --- Migration ponctuelle depuis l'ancien système localStorage ---
  migrateFromLocalStorage: (legacyData: LegacyData) => ipcRenderer.invoke('store:migrate', legacyData),

  // --- Boîtes de dialogue natives ---
  showSaveDialog: (options: SaveDialogOptions) => ipcRenderer.invoke('dialog:show-save', options),
  showOpenDialog: (options: OpenDialogOptions) => ipcRenderer.invoke('dialog:show-open', options),

  // --- Export de fichiers (le renderer prépare, le main écrit sur disque) ---
  exportTxt: (filePath: string, text: string) => ipcRenderer.invoke('export:txt', { filePath, text }),
  exportDocx: (filePath: string, docxData: DocxParagraph[]) =>
    ipcRenderer.invoke('export:docx', { filePath, docxData }),
  exportPdf: (filePath: string, htmlContent: string) =>
    ipcRenderer.invoke('export:pdf', { filePath, htmlContent }),

  // --- Export/Import de projet complet (.scriptorium) ---
  exportProject: (filePath: string, projectName: string, projectData: ProjectData) =>
    ipcRenderer.invoke('project:export', { filePath, projectName, projectData }),
  importProject: (filePath: string) => ipcRenderer.invoke('project:import', filePath),

  // --- Sauvegardes automatiques horodatées (rotation côté main) ---
  createBackup: (projectName: string, projectData: ProjectData) =>
    ipcRenderer.invoke('backup:create', { projectName, projectData }),
  listBackups: (projectName: string) => ipcRenderer.invoke('backup:list', projectName),
  restoreBackup: (projectName: string, fileName: string) =>
    ipcRenderer.invoke('backup:restore', { projectName, fileName }),

  // --- Désinfection HTML à la demande (collage depuis une source externe) ---
  sanitizeHtml: (html: string) => ipcRenderer.invoke('sanitize:html', html),

  // --- Correcteur de grammaire hors ligne (LanguageTool) ---
  getGrammarPrefs: () => ipcRenderer.invoke('store:get-grammar-prefs'),
  saveGrammarPrefs: (prefs: Partial<GrammarPrefs>) => ipcRenderer.invoke('store:save-grammar-prefs', prefs),
  selectLanguageToolFolder: () => ipcRenderer.invoke('dialog:select-languagetool-folder'),
  checkJavaAvailable: () => ipcRenderer.invoke('grammar:check-java'),
  startGrammarServer: () => ipcRenderer.invoke('grammar:start-server'),
  checkGrammar: (text: string, language: string) =>
    ipcRenderer.invoke('grammar:check-text', { text, language }),
  installLanguageToolAuto: () => ipcRenderer.invoke('grammar:auto-install'),
  onGrammarInstallProgress: (callback: (data: GrammarInstallProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: GrammarInstallProgress) => callback(data);
    ipcRenderer.on('grammar:install-progress', listener);
    return () => {
      ipcRenderer.removeListener('grammar:install-progress', listener);
    };
  },
  onGrammarServerStopped: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('grammar:server-stopped', listener);
    return () => {
      ipcRenderer.removeListener('grammar:server-stopped', listener);
    };
  },
  openExternalLink: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // --- Mise à jour automatique (electron-updater) ---
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getAppVersion: () => ipcRenderer.invoke('updater:get-version'),
  confirmUpdateDownload: () => ipcRenderer.invoke('updater:confirm-download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('updater:available', listener);
    return () => {
      ipcRenderer.removeListener('updater:available', listener);
    };
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('updater:not-available', listener);
    return () => {
      ipcRenderer.removeListener('updater:not-available', listener);
    };
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('updater:downloaded', listener);
    return () => {
      ipcRenderer.removeListener('updater:downloaded', listener);
    };
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('updater:error', listener);
    return () => {
      ipcRenderer.removeListener('updater:error', listener);
    };
  }
};

contextBridge.exposeInMainWorld('api', api);
