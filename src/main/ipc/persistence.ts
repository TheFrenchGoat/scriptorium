// src/main/ipc/persistence.ts
// Canaux IPC de persistance (remplacent les anciens appels localStorage du
// renderer). Chaque handler est une simple lecture/écriture du store typé.

import { ipcMain } from 'electron';
import { store } from '../store';
import type {
  EditorPrefs,
  LanguageCode,
  LegacyData,
  ProjectsMap,
  ThemeName,
  UiState,
  WritingStats
} from '../../shared/types';

export interface NativeSpellcheckHost {
  /** Appliqué à la fenêtre courante quand la préférence change. */
  applyNativeSpellcheckPreference?: (enabled: boolean) => void;
}

export function registerPersistenceIpc(getWindow: () => NativeSpellcheckHost | null): void {
  ipcMain.handle('store:get-projects', () => store.get('projects'));
  ipcMain.handle('store:save-projects', (_e, projects: ProjectsMap) => {
    store.set('projects', projects);
    return true;
  });

  ipcMain.handle('store:get-ui-state', () => store.get('uiState'));
  ipcMain.handle('store:save-ui-state', (_e, uiState: UiState) => {
    store.set('uiState', uiState);
    return true;
  });

  ipcMain.handle('store:get-theme', () => store.get('theme'));
  ipcMain.handle('store:save-theme', (_e, theme: ThemeName) => {
    store.set('theme', theme);
    return true;
  });

  ipcMain.handle('store:get-language', () => store.get('language'));
  ipcMain.handle('store:save-language', (_e, lang: LanguageCode) => {
    store.set('language', lang);
    return true;
  });

  ipcMain.handle('store:get-editor-prefs', () => store.get('editorPrefs'));
  ipcMain.handle('store:save-editor-prefs', (_e, prefs: EditorPrefs) => {
    store.set('editorPrefs', prefs);
    return true;
  });

  ipcMain.handle('store:get-writing-stats', () => store.get('writingStats'));
  ipcMain.handle('store:save-writing-stats', (_e, stats: WritingStats) => {
    store.set('writingStats', stats);
    return true;
  });

  // --- CORRECTEUR ORTHOGRAPHIQUE NATIF (Chromium), indépendant de LanguageTool.
  // setSpellCheckerEnabled() prend effet immédiatement, sans recharger la page.
  ipcMain.handle('store:get-native-spellcheck', () => store.get('nativeSpellcheckEnabled'));
  ipcMain.handle('store:set-native-spellcheck', (_e, enabled: boolean) => {
    store.set('nativeSpellcheckEnabled', enabled);
    const win = getWindow();
    win?.applyNativeSpellcheckPreference?.(enabled);
    return enabled;
  });

  ipcMain.handle('store:get-current-project', () => store.get('currentProject'));
  ipcMain.handle('store:set-current-project', (_e, name: string) => {
    store.set('currentProject', name);
    return true;
  });
  ipcMain.handle('store:clear-current-project', () => {
    store.set('currentProject', null);
    return true;
  });

  // Migration ponctuelle : au premier lancement de cette version, on récupère
  // les anciennes données localStorage (transmises une fois par le renderer)
  // et on les copie dans le store persistant si celui-ci est encore vide.
  ipcMain.handle('store:migrate', (_e, legacyData: LegacyData) => {
    const hasExistingData = Object.keys(store.get('projects') || {}).length > 0;
    if (!hasExistingData && legacyData && legacyData.projects) {
      store.set('projects', legacyData.projects);
      if (legacyData.uiState) store.set('uiState', legacyData.uiState);
      if (legacyData.theme) store.set('theme', legacyData.theme as ThemeName);
      if (legacyData.currentProject) store.set('currentProject', legacyData.currentProject);
      return true;
    }
    return false;
  });
}
