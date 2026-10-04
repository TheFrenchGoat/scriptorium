// src/main/ipc/persistence.ts
// Canaux IPC de persistance.
//
// Les sauvegardes structurelles utilisent toujours `store:save-projects`
// (création, suppression, renommage, fiches World Building, sessions, etc.).
//
// Pendant la saisie d’un chapitre, le renderer peut désormais utiliser
// `store:save-project-chapter`. Seuls le nom du projet, le nom du chapitre et
// son HTML traversent alors IPC.
//
// Important : electron-store réécrit toujours physiquement son fichier JSON.
// Cette optimisation évite surtout de transférer et de reconstruire tous les
// projets dans le renderer à chaque sauvegarde automatique.

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
  applyNativeSpellcheckPreference?: (
    enabled: boolean
  ) => void;
}

interface SaveProjectChapterPayload {
  projectName: string;
  chapterName: string;
  html: string;
}

function isSaveProjectChapterPayload(
  value: unknown
): value is SaveProjectChapterPayload {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const payload =
    value as Partial<SaveProjectChapterPayload>;

  return (
    typeof payload.projectName ===
      'string' &&
    payload.projectName.length > 0 &&
    typeof payload.chapterName ===
      'string' &&
    payload.chapterName.length > 0 &&
    typeof payload.html === 'string'
  );
}

export function registerPersistenceIpc(
  getWindow: () =>
    | NativeSpellcheckHost
    | null
): void {
  // -----------------------------------------------------------------------
  // PROJETS
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-projects',
    () => store.get('projects')
  );

  /**
   * Sauvegarde complète de tous les projets.
   *
   * Ce canal reste nécessaire pour les opérations qui modifient la structure
   * globale : création, importation, suppression ou renommage d’un projet.
   */
  ipcMain.handle(
    'store:save-projects',
    (
      _event,
      projects: ProjectsMap
    ) => {
      store.set(
        'projects',
        projects
      );

      return true;
    }
  );

  /**
   * Sauvegarde uniquement le contenu HTML d’un chapitre.
   *
   * Le renderer n’envoie plus l’intégralité des projets à chaque frappe.
   * On reconstruit cependant les objets avant de les transmettre à
   * electron-store afin de ne pas modifier directement les références
   * retournées par le store.
   *
   * On n’utilise volontairement pas une clé electron-store telle que :
   *
   * projects.Mon projet.chapters.Chapitre 1
   *
   * car les noms de projets et de chapitres sont libres et peuvent contenir
   * des points. Ces points seraient interprétés comme des séparateurs de
   * chemin par electron-store.
   */
  ipcMain.handle(
    'store:save-project-chapter',
    (
      _event,
      payload: unknown
    ) => {
      if (
        !isSaveProjectChapterPayload(
          payload
        )
      ) {
        throw new Error(
          'Données de sauvegarde du chapitre invalides.'
        );
      }

      const {
        projectName,
        chapterName,
        html
      } = payload;

      const projects =
        store.get('projects') || {};

      const project =
        projects[projectName];

      if (!project) {
        throw new Error(
          `Le projet « ${projectName} » est introuvable.`
        );
      }

      const currentChapters =
        project.chapters &&
        typeof project.chapters ===
          'object'
          ? project.chapters
          : {};

      const nextProjects: ProjectsMap = {
        ...projects,
        [projectName]: {
          ...project,
          chapters: {
            ...currentChapters,
            [chapterName]: html
          }
        }
      };

      store.set(
        'projects',
        nextProjects
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // ÉTAT D’INTERFACE
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-ui-state',
    () => store.get('uiState')
  );

  ipcMain.handle(
    'store:save-ui-state',
    (
      _event,
      uiState: UiState
    ) => {
      store.set(
        'uiState',
        uiState
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // THÈME ET LANGUE
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-theme',
    () => store.get('theme')
  );

  ipcMain.handle(
    'store:save-theme',
    (
      _event,
      theme: ThemeName
    ) => {
      store.set(
        'theme',
        theme
      );

      return true;
    }
  );

  ipcMain.handle(
    'store:get-language',
    () => store.get('language')
  );

  ipcMain.handle(
    'store:save-language',
    (
      _event,
      lang: LanguageCode
    ) => {
      store.set(
        'language',
        lang
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // PRÉFÉRENCES DE L’ÉDITEUR
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-editor-prefs',
    () =>
      store.get('editorPrefs')
  );

  ipcMain.handle(
    'store:save-editor-prefs',
    (
      _event,
      prefs: EditorPrefs
    ) => {
      store.set(
        'editorPrefs',
        prefs
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // STATISTIQUES HISTORIQUES
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-writing-stats',
    () =>
      store.get('writingStats')
  );

  ipcMain.handle(
    'store:save-writing-stats',
    (
      _event,
      stats: WritingStats
    ) => {
      store.set(
        'writingStats',
        stats
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // CORRECTEUR ORTHOGRAPHIQUE NATIF
  // -----------------------------------------------------------------------

  /*
   * Le correcteur natif de Chromium reste indépendant de LanguageTool.
   * setSpellCheckerEnabled() prend effet immédiatement, sans recharger la
   * page.
   */
  ipcMain.handle(
    'store:get-native-spellcheck',
    () =>
      store.get(
        'nativeSpellcheckEnabled'
      )
  );

  ipcMain.handle(
    'store:set-native-spellcheck',
    (
      _event,
      enabled: boolean
    ) => {
      store.set(
        'nativeSpellcheckEnabled',
        enabled
      );

      const win = getWindow();

      win?.applyNativeSpellcheckPreference?.(
        enabled
      );

      return enabled;
    }
  );

  // -----------------------------------------------------------------------
  // PROJET COURANT
  // -----------------------------------------------------------------------

  ipcMain.handle(
    'store:get-current-project',
    () =>
      store.get('currentProject')
  );

  ipcMain.handle(
    'store:set-current-project',
    (
      _event,
      name: string
    ) => {
      store.set(
        'currentProject',
        name
      );

      return true;
    }
  );

  ipcMain.handle(
    'store:clear-current-project',
    () => {
      store.set(
        'currentProject',
        null
      );

      return true;
    }
  );

  // -----------------------------------------------------------------------
  // MIGRATION DEPUIS LOCALSTORAGE
  // -----------------------------------------------------------------------

  /*
   * Migration ponctuelle : au premier lancement de cette version, on récupère
   * les anciennes données localStorage transmises par le renderer et on les
   * copie dans le store persistant si celui-ci est encore vide.
   */
  ipcMain.handle(
    'store:migrate',
    (
      _event,
      legacyData: LegacyData
    ) => {
      const projects =
        store.get('projects') || {};

      const hasExistingData =
        Object.keys(projects).length >
        0;

      if (
        !hasExistingData &&
        legacyData &&
        legacyData.projects
      ) {
        store.set(
          'projects',
          legacyData.projects
        );

        if (legacyData.uiState) {
          store.set(
            'uiState',
            legacyData.uiState
          );
        }

        if (legacyData.theme) {
          store.set(
            'theme',
            legacyData.theme as ThemeName
          );
        }

        if (
          legacyData.currentProject
        ) {
          store.set(
            'currentProject',
            legacyData.currentProject
          );
        }

        return true;
      }

      return false;
    }
  );
}
