// Actions de projet du contrôleur d'édition : version nommée, récupération
// d'une copie de chapitre, restauration d'une sauvegarde et renommage du projet.
// Code déplacé tel quel depuis useEditorController.ts (étape 4c-6) ; les valeurs
// du hook arrivent par le contexte et sont déstructurées au début de
// createProjectActions pour que le code reste identique.

import type { ProjectsMap } from '../../../../shared/types';
import {
  insertChapterAfter,
  stripCommentAnchors,
  uniqueChapterCopyName,
} from '../../../../shared/backup-preview';
import { createScreenplayScene } from '../../../lib/screenplay';
import { invalidateProjectWordCache } from '../../../lib/project-word-cache';
import { prepareWorldBuilding } from '../../../lib/wb-migration';
import { renameWritingStatsProject } from '../../../lib/writing-stats-rename';
import type { EditHistory } from '../../../lib/edit-history';
import type { MentionIndex } from '../../../lib/mention-index';
import type { WbRegistry } from '../../../lib/wb-registry';
import { t } from '../../../i18n';
import { currentWbLang, ensureProjectDefaults, isScreenplayData } from './utils';
import type {
  EditorController,
  EditorControllerDeps,
  MutableState,
  PendingHistoryCommit,
} from './types';

/** Ce dont les actions de projet ont besoin ; fourni par useEditorController. */
export interface ProjectActionsContext {
  projectName: EditorControllerDeps['projectName'];
  showInfo: EditorControllerDeps['showInfo'];
  bump: () => void;
  s: MutableState;
  historyTimerRef: { current: ReturnType<typeof setTimeout> | null };
  pendingHistoryRef: { current: PendingHistoryCommit | null };
  /** Vrai une fois le projet renommé : plus aucune sauvegarde sous l'ancien nom. */
  renamedRef: { current: boolean };
  history: EditHistory;
  registry: WbRegistry;
  mentionIndex: MentionIndex;
  enqueuePersistence: <T>(operation: () => Promise<T>) => Promise<T>;
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  updateUndoRedo: () => void;
  updateStats: () => void;
  persistUiState: () => Promise<void>;
  cancelAllPendingChapterSaves: () => void;
  cancelPendingScreenplaySave: () => void;
  cancelPendingWbSave: () => void;
  saveAll: () => Promise<void>;
}

/** Les 4 méthodes de projet du contrôleur. */
export type ProjectActions = Pick<
  EditorController,
  'createNamedVersion' | 'recoverChapterCopy' | 'restoreBackup' | 'renameProject'
>;

export function createProjectActions(ctx: ProjectActionsContext): ProjectActions {
  const {
    projectName,
    showInfo,
    bump,
    s,
    historyTimerRef,
    pendingHistoryRef,
    renamedRef,
    history,
    registry,
    mentionIndex,
    enqueuePersistence,
    setSaveStatus,
    updateUndoRedo,
    updateStats,
    persistUiState,
    cancelAllPendingChapterSaves,
    cancelPendingScreenplaySave,
    cancelPendingWbSave,
    saveAll,
  } = ctx;

  return {
    async createNamedVersion(label) {
      // Les modifications en attente sont d'abord enregistrées : la version
      // contient exactement ce qui est affiché.
      await saveAll();
      await window.api.createNamedVersion(projectName, s.projectData, label);
    },

    recoverChapterCopy(sourceName, html, suffix) {
      if (isScreenplayData(s.projectData)) {
        return null;
      }

      // La copie porte un nom libre et prend place juste après l'original
      // (à la fin s'il n'existe plus). Le chapitre actuel ne change pas.
      const newName = uniqueChapterCopyName(
        sourceName,
        suffix,
        Object.keys(s.projectData.chapters)
      );

      const next = insertChapterAfter(
        s.projectData.chapters,
        sourceName,
        newName,
        stripCommentAnchors(html)
      );

      if (!next) {
        return null;
      }

      s.projectData.chapters = next;
      s.projects[projectName] = s.projectData;
      s.hasUnsavedChangesSinceLastBackup = true;

      invalidateProjectWordCache(s.projectData);
      mentionIndex.rebuildChapterOrder();
      mentionIndex.rebuildAll();

      setSaveStatus('pending');
      updateStats();
      bump();

      void saveAll();

      return newName;
    },

    async restoreBackup(fileName) {
      await window.api.createBackup(projectName, s.projectData);

      const restored = await window.api.restoreBackup(projectName, fileName);

      cancelAllPendingChapterSaves();
      cancelPendingScreenplaySave();
      cancelPendingWbSave();

      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }

      pendingHistoryRef.current = null;

      // L'historique d'annulation portait sur l'ancien contenu.
      Object.keys(s.projectData.chapters).forEach((chapterName) => {
        history.remove(chapterName);
      });

      ensureProjectDefaults(restored);

      // Une sauvegarde ancienne peut être au format 1 : on la convertit.
      let nextData = prepareWorldBuilding(restored, currentWbLang()).data;

      ensureProjectDefaults(nextData);

      if (
        nextData.projectType === 'screenplay' &&
        nextData.screenplay &&
        nextData.screenplay.scenes.length === 0
      ) {
        nextData = {
          ...nextData,
          screenplay: {
            ...nextData.screenplay,
            scenes: [createScreenplayScene()]
          }
        };
      }

      s.projectData = nextData;

      registry.bumpVersion();

      s.wbColorVersion += 1;
      s.chapterColorSyncVersion.clear();

      if (!isScreenplayData(s.projectData)) {
        invalidateProjectWordCache(s.projectData);
      }

      mentionIndex.rebuildAll();

      s.projects[projectName] = s.projectData;

      await window.api.saveProjects(s.projects);

      s.activeTab = null;
      s.openTabs = [];

      if (isScreenplayData(s.projectData)) {
        const firstScene = s.projectData.screenplay.scenes[0];

        if (firstScene) {
          s.activeTab = firstScene.id;
          s.activeType = 'scene';
          s.openTabs = [{ name: firstScene.id, type: 'scene' }];
        }
      } else {
        s.activeType = 'chapter';
      }

      await persistUiState();

      updateStats();
      updateUndoRedo();
      bump();
    },

    async renameProject(newName) {
      const trimmed = newName.trim();

      if (!trimmed || trimmed === projectName) {
        return false;
      }

      await saveAll();

      const allProjects = await window.api.getProjects();

      if (allProjects[trimmed]) {
        showInfo(t('alreadyExists'));
        return false;
      }

      // Comme le renommage depuis la page des projets : les sessions et le
      // titre du scénario (s'il est vide) prennent le nouveau nom.
      s.projectData.writingSessions = (s.projectData.writingSessions || []).map(
        (session) => ({ ...session, projectName: trimmed })
      );

      if (s.projectData.screenplay && !s.projectData.screenplay.titlePage.title) {
        s.projectData.screenplay.titlePage.title = trimmed;
      }

      const next: ProjectsMap = {};

      Object.keys(allProjects).forEach((key) => {
        next[key === projectName ? trimmed : key] =
          key === projectName ? s.projectData : allProjects[key];
      });

      await window.api.saveProjects(next);

      // Le projet est enregistré sous son nouveau nom : plus aucune
      // sauvegarde ne doit partir avec l'ancien (elle échouerait ou
      // recréerait l'ancien projet). L'éditeur est ensuite recréé
      // sous le nouveau nom (key dans App.tsx).
      renamedRef.current = true;
      cancelAllPendingChapterSaves();
      cancelPendingScreenplaySave();
      cancelPendingWbSave();
      delete s.projects[projectName];
      s.projects[trimmed] = s.projectData;

      const uiState = await window.api.getUiState();

      if (uiState[projectName]) {
        uiState[trimmed] = uiState[projectName];
        delete uiState[projectName];

        await window.api.saveUiState(uiState);
      }

      // Historique quotidien des statistiques : déplacé vers le nouveau nom,
      // dans la file pour passer après les enregistrements en cours.
      await enqueuePersistence(() =>
        renameWritingStatsProject(projectName, trimmed)
      );

      // Sauvegardes horodatées : déplacées vers le nouveau nom (sans bloquer).
      try {
        await window.api.renameProjectBackups(projectName, trimmed);
      } catch (error) {
        console.error('Échec du déplacement des sauvegardes du projet renommé :', error);
      }

      await window.api.setCurrentProject(trimmed);

      return true;
    }
  };
}
