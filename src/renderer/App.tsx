// src/renderer/App.tsx
// Racine de l'application. Les deux anciennes pages HTML (index.html et
// editor.html) deviennent deux vues d'une même application React : la
// navigation par `window.location.href` est remplacée par un simple état.
// `currentProject` reste persisté côté store exactement comme avant, donc
// rien ne change du point de vue des données.

import React, { useCallback, useEffect, useState } from 'react';
import { I18nProvider } from './i18n';
import { DialogsProvider } from './components/common/Dialogs';
import { UpdateNotifier } from './components/common/UpdateNotifier';
import { ProjectsPage } from './components/menu/ProjectsPage';
import { EditorPage } from './components/editor/EditorPage';
import type { EditorPrefs, LanguageCode, ThemeName } from '../shared/types';

/** Migration ponctuelle : si l'utilisateur avait des projets stockés dans
 *  l'ancien système localStorage (versions précédentes de l'appli), on les
 *  transfère une fois vers le store persistant, puis on nettoie localStorage. */
async function migrateLegacyDataIfNeeded(): Promise<void> {
  const legacyProjectsRaw = localStorage.getItem('codwriter_projects');
  if (!legacyProjectsRaw) return;

  try {
    const migrated = await window.api.migrateFromLocalStorage({
      projects: JSON.parse(legacyProjectsRaw || '{}'),
      uiState: JSON.parse(localStorage.getItem('codwriter_state') || '{}'),
      theme: localStorage.getItem('codwriter_theme') || undefined,
      currentProject: localStorage.getItem('currentProject') || undefined
    });
    if (migrated) {
      localStorage.removeItem('codwriter_projects');
      localStorage.removeItem('codwriter_state');
      localStorage.removeItem('codwriter_theme');
      localStorage.removeItem('currentProject');
      console.log('Anciennes données locales migrées vers le stockage persistant.');
    }
  } catch (e) {
    console.error('Échec de la migration des données locales :', e);
  }
}

/** Applique les préférences d'affichage de l'INTERFACE (taille et police des
 *  menus, sidebar, modales). La feuille d'écriture a ses propres variables
 *  (--editor-*), appliquées par l'éditeur. */
export function applyUiPrefs(prefs: EditorPrefs): void {
  document.body.style.setProperty('--ui-font-size', `${prefs.uiFontSize ?? 14}px`);
  document.body.style.setProperty('--ui-font-family', prefs.uiFontFamily ?? "'Roboto', sans-serif");
}

type View = 'menu' | 'editor';

interface BootState {
  lang: LanguageCode;
  theme: ThemeName;
}

export function App(): React.ReactElement | null {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [view, setView] = useState<View>('menu');
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [openedProject, setOpenedProject] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await migrateLegacyDataIfNeeded();
      const [savedTheme, savedLang, prefs] = await Promise.all([
        window.api.getTheme(),
        window.api.getLanguage(),
        window.api.getEditorPrefs()
      ]);
      applyUiPrefs(prefs ?? { width: 800 });
      setTheme(savedTheme || 'dark');
      setBoot({ lang: savedLang || 'fr', theme: savedTheme || 'dark' });
    })();
  }, []);

  // Le thème et la vue courante pilotent ensemble la classe du <body>, comme
  // le faisaient les deux anciens fichiers HTML ("dark menu-page" / "dark
  // editor-page").
  useEffect(() => {
    document.body.className = `${theme} ${view === 'menu' ? 'menu-page' : 'editor-page'}`;
  }, [theme, view]);

  const changeTheme = useCallback((next: ThemeName) => {
    setTheme(next);
    void window.api.saveTheme(next);
  }, []);

  const openProject = useCallback(async (name: string) => {
    await window.api.setCurrentProject(name);
    setOpenedProject(name);
    setView('editor');
  }, []);

  const backToMenu = useCallback(() => {
    setOpenedProject(null);
    setView('menu');
  }, []);

  // Le Ctrl+molette de la feuille d'écriture est un zoom APPLICATIF dédié
  // (voir EditorPage.tsx), pas le zoom de page natif du navigateur/Electron.
  // Sans garde-fou, faire Ctrl+molette n'importe où AILLEURS dans
  // l'application (sidebar, barre d'outils, page d'accueil, modales...)
  // laisserait Chromium zoomer toute la fenêtre, comme un onglet de
  // navigateur classique. Ce listener global, non passif, neutralise cette
  // fonctionnalité PARTOUT ; EditorPage.tsx pose son propre listener
  // (également non passif) sur la seule zone de la feuille, qui, lui,
  // déclenche le vrai zoom applicatif en plus d'empêcher le zoom natif.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  if (!boot) return null; // amorçage très court : pas d'écran de chargement

  return (
    <I18nProvider initialLang={boot.lang}>
      <DialogsProvider>
        {view === 'menu' || !openedProject ? (
          <ProjectsPage onOpenProject={openProject} />
        ) : (
          <EditorPage
            projectName={openedProject}
            theme={theme}
            onChangeTheme={changeTheme}
            onBack={backToMenu}
            onRenamed={setOpenedProject}
          />
        )}
        <UpdateNotifier />
      </DialogsProvider>
    </I18nProvider>
  );
}
