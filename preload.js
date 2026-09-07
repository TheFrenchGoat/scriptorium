// preload.js
// Pont sécurisé entre le processus principal (Node/Electron) et le renderer.
// Avec contextIsolation: true, le renderer n'a AUCUN accès direct à Node ou à Electron :
// il ne peut appeler que les fonctions explicitement exposées ici via contextBridge.
// Chaque fonction correspond à un canal IPC précis et limité (pas d'accès générique
// à ipcRenderer.invoke depuis le code de la page).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Persistance des projets ---
  getProjects: () => ipcRenderer.invoke('store:get-projects'),
  saveProjects: (projects) => ipcRenderer.invoke('store:save-projects', projects),

  // --- État d'interface (onglets ouverts, onglet actif...) ---
  getUiState: () => ipcRenderer.invoke('store:get-ui-state'),
  saveUiState: (uiState) => ipcRenderer.invoke('store:save-ui-state', uiState),

  // --- Thème ---
  getTheme: () => ipcRenderer.invoke('store:get-theme'),
  saveTheme: (theme) => ipcRenderer.invoke('store:save-theme', theme),

  // --- Langue de l'interface ---
  getLanguage: () => ipcRenderer.invoke('store:get-language'),
  saveLanguage: (lang) => ipcRenderer.invoke('store:save-language', lang),

  // --- Préférences d'affichage de l'éditeur (largeur, police, interligne) ---
  getEditorPrefs: () => ipcRenderer.invoke('store:get-editor-prefs'),
  saveEditorPrefs: (prefs) => ipcRenderer.invoke('store:save-editor-prefs', prefs),

  // --- Statistiques d'écriture (mots écrits par jour, tous projets confondus) ---
  getWritingStats: () => ipcRenderer.invoke('store:get-writing-stats'),
  saveWritingStats: (stats) => ipcRenderer.invoke('store:save-writing-stats', stats),

  // --- Correcteur orthographique natif (Chromium), indépendant de LanguageTool ---
  getNativeSpellcheck: () => ipcRenderer.invoke('store:get-native-spellcheck'),
  setNativeSpellcheck: (enabled) => ipcRenderer.invoke('store:set-native-spellcheck', enabled),

  // --- Projet actuellement ouvert ---
  getCurrentProject: () => ipcRenderer.invoke('store:get-current-project'),
  setCurrentProject: (name) => ipcRenderer.invoke('store:set-current-project', name),
  clearCurrentProject: () => ipcRenderer.invoke('store:clear-current-project'),

  // --- Migration ponctuelle depuis l'ancien système localStorage ---
  migrateFromLocalStorage: (legacyData) => ipcRenderer.invoke('store:migrate', legacyData),

  // --- Boîtes de dialogue natives ---
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open', options),

  // --- Export de fichiers (le renderer prépare les données, le main écrit sur disque) ---
  exportTxt: (filePath, text) => ipcRenderer.invoke('export:txt', { filePath, text }),
  exportDocx: (filePath, docxData) => ipcRenderer.invoke('export:docx', { filePath, docxData }),
  exportPdf: (filePath, htmlContent) => ipcRenderer.invoke('export:pdf', { filePath, htmlContent }),

  // --- Export/Import de projet complet (.scriptorium), portable et indépendant du store ---
  exportProject: (filePath, projectName, projectData) =>
    ipcRenderer.invoke('project:export', { filePath, projectName, projectData }),
  importProject: (filePath) => ipcRenderer.invoke('project:import', filePath),

  // --- Sauvegardes automatiques horodatées (avec rotation côté main) ---
  createBackup: (projectName, projectData) => ipcRenderer.invoke('backup:create', { projectName, projectData }),
  listBackups: (projectName) => ipcRenderer.invoke('backup:list', projectName),
  restoreBackup: (projectName, fileName) => ipcRenderer.invoke('backup:restore', { projectName, fileName }),

  // Désinfection HTML à la demande (collage depuis une source externe)
  sanitizeHtml: (html) => ipcRenderer.invoke('sanitize:html', html),

  // --- Correcteur de grammaire hors ligne (LanguageTool) ---
  getGrammarPrefs: () => ipcRenderer.invoke('store:get-grammar-prefs'),
  saveGrammarPrefs: (prefs) => ipcRenderer.invoke('store:save-grammar-prefs', prefs),
  selectLanguageToolFolder: () => ipcRenderer.invoke('dialog:select-languagetool-folder'),
  checkJavaAvailable: () => ipcRenderer.invoke('grammar:check-java'),
  startGrammarServer: () => ipcRenderer.invoke('grammar:start-server'),
  checkGrammar: (text, language) => ipcRenderer.invoke('grammar:check-text', { text, language }),
  installLanguageToolAuto: () => ipcRenderer.invoke('grammar:auto-install'),
  onGrammarInstallProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('grammar:install-progress', listener);
    return () => ipcRenderer.removeListener('grammar:install-progress', listener);
  },
  openExternalLink: (url) => ipcRenderer.invoke('shell:open-external', url),
});
