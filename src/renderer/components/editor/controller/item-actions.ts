// Actions sur les éléments du projet : chapitres, scènes du scénario,
// fiches du Worldbuilding et ordre de la barre latérale.
// Code déplacé tel quel depuis useEditorController.ts (étape 4c-8 du découpage).
// Les valeurs du hook arrivent par le contexte ; les appels ctrl.xxx passent par des relais.

import type { ProjectData } from '../../../../shared/types';
import { t } from '../../../i18n';
import type { EditHistory } from '../../../lib/edit-history';
import {
  removeMentionsAcrossChapters,
  removeMentionsIn,
  renameMentionsIn,
  renameWorldMentionsAcrossChapters,
} from '../../../lib/highlight';
import { transformScenesHtml } from '../../../lib/mention-index';
import type { MentionIndex } from '../../../lib/mention-index';
import { invalidateProjectWordCache } from '../../../lib/project-word-cache';
import { createScreenplayScene, getSceneDisplayTitle } from '../../../lib/screenplay';
import { withPreservedSelection } from '../../../lib/selection';
import type { WbHistoryEntry } from '../../../lib/wb-history';
import { createWbItemRecord, findWbItemByName } from '../../../lib/wb-migration';
import type { WbRegistry } from '../../../lib/wb-registry';
import { detachWbItem, isScreenplayData, touchWbItem } from './utils';
import type {
  EditorController,
  EditorControllerDeps,
  MutableState,
  PendingHistoryCommit,
} from './types';

export interface ItemActionsContext {
  projectName: EditorControllerDeps['projectName'];
  showInfo: EditorControllerDeps['showInfo'];
  showConfirm: EditorControllerDeps['showConfirm'];
  bump: () => void;
  s: MutableState;
  historyTimerRef: { current: ReturnType<typeof setTimeout> | null };
  pendingHistoryRef: { current: PendingHistoryCommit | null };
  history: EditHistory;
  registry: WbRegistry;
  mentionIndex: MentionIndex;
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  updateUndoRedo: () => void;
  updateStats: () => void;
  cancelPendingChapterSave: (chapterName: string) => void;
  saveAll: () => Promise<void>;
  scheduleScreenplaySave: () => void;
  highlight: () => boolean;
  flushPendingHistoryCommit: () => void;
  activeChapterEditor: () => { name: string; editor: HTMLElement } | null;
  takeWbSnapshot: () => Record<string, unknown>;
  renameWbMentionsEverywhere: (key: string, fromName: string, toName: string) => void;
  recordWbChange: (
    labelKey: WbHistoryEntry['labelKey'],
    before: Record<string, unknown>,
    extras?: { undoExtra?: () => void; redoExtra?: () => void },
  ) => void;
  resyncChapters: (changedChapters: string[], openChapter: string | null) => void;
  ctrl: Pick<EditorController, 'deleteItem' | 'openItem' | 'renameScene' | 'reorderSidebar'>;
}

export type ItemActions = Pick<
  EditorController,
  | 'createChapter'
  | 'createScene'
  | 'updateScreenplay'
  | 'renameScene'
  | 'deleteScene'
  | 'reorderScenes'
  | 'createWbItem'
  | 'deleteItem'
  | 'renameItem'
  | 'reorderSidebar'
>;

export function createItemActions(ctx: ItemActionsContext): ItemActions {
  const {
    projectName,
    showInfo,
    showConfirm,
    bump,
    s,
    historyTimerRef,
    pendingHistoryRef,
    history,
    registry,
    mentionIndex,
    setSaveStatus,
    updateUndoRedo,
    updateStats,
    cancelPendingChapterSave,
    saveAll,
    scheduleScreenplaySave,
    highlight,
    flushPendingHistoryCommit,
    activeChapterEditor,
    takeWbSnapshot,
    renameWbMentionsEverywhere,
    recordWbChange,
    resyncChapters,
    ctrl,
  } = ctx;

  return {
    createChapter(name) {
      if (isScreenplayData(s.projectData)) {
        return false;
      }

      const trimmed = name.trim();

      if (!trimmed || s.projectData.chapters[trimmed] !== undefined) {
        return false;
      }

      s.projectData.chapters[trimmed] = '';

      mentionIndex.rebuildChapterOrder();

      setSaveStatus('pending');

      void saveAll();

      ctrl.openItem(trimmed, 'chapter');

      return true;
    },

    createScene(options = {}) {
      if (!isScreenplayData(s.projectData)) {
        return null;
      }

      const scene = createScreenplayScene(options);

      s.projectData.screenplay = {
        ...s.projectData.screenplay,
        scenes: [...s.projectData.screenplay.scenes, scene]
      };

      s.projects[projectName] = s.projectData;
      s.hasUnsavedChangesSinceLastBackup = true;

      setSaveStatus('pending');

      ctrl.openItem(scene.id, 'scene');

      bump();

      void saveAll();

      return scene.id;
    },

    updateScreenplay(screenplay) {
      if (s.projectData.projectType !== 'screenplay') {
        return;
      }

      s.projectData.screenplay = screenplay;
      s.projects[projectName] = s.projectData;
      s.hasUnsavedChangesSinceLastBackup = true;

      setSaveStatus('pending');

      updateStats();
      scheduleScreenplaySave();

      bump();
    },

    renameScene(sceneId, workingTitle) {
      if (!isScreenplayData(s.projectData)) {
        return false;
      }

      const sceneExists = s.projectData.screenplay.scenes.some(
        (scene) => scene.id === sceneId
      );

      if (!sceneExists) {
        return false;
      }

      s.projectData.screenplay = {
        ...s.projectData.screenplay,
        scenes: s.projectData.screenplay.scenes.map((scene) =>
          scene.id === sceneId
            ? { ...scene, workingTitle: workingTitle.trim() }
            : scene
        )
      };

      s.projects[projectName] = s.projectData;

      setSaveStatus('pending');

      bump();

      void saveAll();

      return true;
    },

    async deleteScene(sceneId) {
      await ctrl.deleteItem(sceneId, 'scene');
    },

    reorderScenes(sceneIds) {
      ctrl.reorderSidebar('scene', sceneIds);
    },

    createWbItem(name, type) {
      const trimmed = name.trim();

      if (!trimmed) {
        return null;
      }

      if (findWbItemByName(s.projectData.world, trimmed)) {
        return null;
      }

      const item = createWbItemRecord(
        trimmed,
        type,
        registry.cloneCategoryDefinitions()[type] ?? { ...registry.categoryFor(type), builtin: undefined }
      );

      const wbBefore = takeWbSnapshot();

      s.projectData.world[item.id] = item;

      recordWbChange('wbHistItemCreate', wbBefore);

      mentionIndex.refreshItem(item.id);
      registry.bumpVersion();

      setSaveStatus('pending');

      void saveAll();

      ctrl.openItem(item.id, 'world');

      return item.id;
    },

    async deleteItem(key, type) {
      let displayName = key;

      if (type === 'world') {
        const item = s.projectData.world[key];

        if (!item) {
          return;
        }

        displayName = item.name;
      } else if (type === 'scene' && isScreenplayData(s.projectData)) {
        const sceneIndex = s.projectData.screenplay.scenes.findIndex(
          (scene) => scene.id === key
        );

        const scene = s.projectData.screenplay.scenes[sceneIndex];

        if (scene) {
          displayName = getSceneDisplayTitle(
            scene,
            sceneIndex,
            s.projectData.screenplay.settings.conventionLanguage
          );
        }
      }

      const confirmed = await showConfirm(
        t('confirmDeleteItem', { name: displayName })
      );

      if (!confirmed) {
        return;
      }

      if (type === 'scene') {
        if (!isScreenplayData(s.projectData)) {
          return;
        }

        const currentScenes = s.projectData.screenplay.scenes;

        const sceneIndex = currentScenes.findIndex(
          (scene) => scene.id === key
        );

        if (sceneIndex < 0) {
          return;
        }

        let nextScenes = currentScenes.filter((scene) => scene.id !== key);

        if (nextScenes.length === 0) {
          const replacementScene = createScreenplayScene({
            interiorExterior: 'INT.',
            time:
              s.projectData.screenplay.settings.conventionLanguage === 'en'
                ? 'DAY'
                : 'JOUR'
          });

          nextScenes = [replacementScene];
        }

        s.projectData.screenplay = {
          ...s.projectData.screenplay,
          scenes: nextScenes
        };

        s.openTabs = s.openTabs.filter(
          (tab) => !(tab.type === 'scene' && tab.name === key)
        );

        if (s.activeType === 'scene' && s.activeTab === key) {
          const nextScene =
            nextScenes[Math.min(sceneIndex, nextScenes.length - 1)];

          s.activeTab = nextScene.id;
          s.activeType = 'scene';

          if (
            !s.openTabs.some(
              (tab) => tab.type === 'scene' && tab.name === nextScene.id
            )
          ) {
            s.openTabs = [...s.openTabs, { name: nextScene.id, type: 'scene' }];
          }
        }

        setSaveStatus('pending');

        updateStats();
        bump();

        await saveAll();
        return;
      }

      if (type === 'chapter') {
        if (s.activeTab === key && s.activeType === 'chapter') {
          s.activeTab = null;
        }

        cancelPendingChapterSave(key);

        if (pendingHistoryRef.current?.name === key) {
          if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
          }

          pendingHistoryRef.current = null;
        }

        delete s.projectData.chapters[key];

        history.remove(key);
        if (s.projectData.chapterMeta) delete s.projectData.chapterMeta[key];
        if (s.projectData.chapterNotes) delete s.projectData.chapterNotes[key];
        if (s.projectData.chapterComments) delete s.projectData.chapterComments[key];
        mentionIndex.removeChapter(key);
      } else {
        const wbBefore = takeWbSnapshot();

        // Fiche : les mentions deviennent du texte simple partout.
        flushPendingHistoryCommit();

        const open = activeChapterEditor();

        if (open) {
          s.projectData.chapters[open.name] = open.editor.innerHTML;
        }

        if (s.activeTab === key && s.activeType === 'world') {
          s.activeTab = null;
        }

        delete s.projectData.world[key];

        detachWbItem(s.projectData, key);

        recordWbChange('wbHistItemDelete', wbBefore);

        const changedChapters = removeMentionsAcrossChapters(
          s.projectData,
          key
        );

        if (open) {
          withPreservedSelection(open.editor, () => {
            removeMentionsIn(open.editor, key);
          });

          s.projectData.chapters[open.name] = open.editor.innerHTML;
        }

        resyncChapters(changedChapters, open?.name ?? null);

        // Les mentions de la fiche deviennent du texte simple dans les scènes.
        if (isScreenplayData(s.projectData)) {
          const nextScenes = transformScenesHtml(
            s.projectData.screenplay.scenes,
            (container) => removeMentionsIn(container, key)
          );

          if (nextScenes) {
            s.projectData.screenplay = {
              ...s.projectData.screenplay,
              scenes: nextScenes
            };
            s.projects[projectName] = s.projectData;
            scheduleScreenplaySave();
          }
        }
        mentionIndex.removeItem(key);
        registry.bumpVersion();
      }

      const index = s.openTabs.findIndex(
        (tab) => tab.name === key && tab.type === type
      );

      if (index !== -1) {
        const nextTabs = s.openTabs.slice();
        nextTabs.splice(index, 1);

        s.openTabs = nextTabs;

        if (!s.activeTab && nextTabs.length > 0) {
          const next = nextTabs[Math.max(0, index - 1)];

          s.activeTab = next.name;
          s.activeType = next.type;
        }
      }

      setSaveStatus('pending');

      updateStats();
      updateUndoRedo();
      bump();

      await saveAll();
    },

    async renameItem(key, newName, type) {
      if (type === 'scene') {
        return ctrl.renameScene(key, newName);
      }

      const trimmed = newName.trim();

      if (!trimmed) {
        return false;
      }

      if (type === 'chapter') {
        if (trimmed === key) {
          return false;
        }

        if (s.projectData.chapters[trimmed] !== undefined) {
          showInfo(t('alreadyExists'));
          return false;
        }

        cancelPendingChapterSave(key);
        flushPendingHistoryCommit();

        const nextChapters: Record<string, string> = {};

        Object.keys(s.projectData.chapters).forEach((chapterKey) => {
          if (chapterKey === key) {
            nextChapters[trimmed] = s.projectData.chapters[key];
          } else {
            nextChapters[chapterKey] = s.projectData.chapters[chapterKey];
          }
        });

        s.projectData.chapters = nextChapters;

        history.rename(key, trimmed);
        if (s.projectData.chapterMeta && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterMeta, key)) {
          s.projectData.chapterMeta[trimmed] = s.projectData.chapterMeta[key];
          delete s.projectData.chapterMeta[key];
        }
        if (s.projectData.chapterNotes && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterNotes, key)) {
          s.projectData.chapterNotes[trimmed] = s.projectData.chapterNotes[key];
          delete s.projectData.chapterNotes[key];
        }
        if (s.projectData.chapterComments && key !== trimmed && Object.prototype.hasOwnProperty.call(s.projectData.chapterComments, key)) {
          s.projectData.chapterComments[trimmed] = s.projectData.chapterComments[key];
          delete s.projectData.chapterComments[key];
        }
        mentionIndex.renameChapter(key, trimmed);

        s.openTabs = s.openTabs.map((tab) =>
          tab.name === key && tab.type === 'chapter'
            ? { ...tab, name: trimmed }
            : tab
        );

        if (s.activeTab === key && s.activeType === 'chapter') {
          s.activeTab = trimmed;
        }

        setSaveStatus('pending');

        bump();

        await saveAll();

        return true;
      }

      // Fiche : l'identifiant ne change pas, seul le nom change.
      const item = s.projectData.world[key];

      if (!item) {
        return false;
      }

      const oldName = item.name;

      if (trimmed === oldName) {
        return false;
      }

      const duplicate = findWbItemByName(s.projectData.world, trimmed);

      if (duplicate && duplicate.id !== key) {
        showInfo(t('alreadyExists'));
        return false;
      }

      const affectedChapters = mentionIndex.chaptersContaining(key);
      const affectedScenes = isScreenplayData(s.projectData)
        ? mentionIndex.scenesContaining(key, s.projectData.screenplay.scenes)
        : [];
      const affectedCount = affectedChapters.length + affectedScenes.length;

      if (affectedCount > 0) {
        const proceed = await showConfirm(
          t(isScreenplayData(s.projectData) ? 'renameWbMentionsWarningScenes' : 'renameWbMentionsWarning', {
            oldName,
            newName: trimmed,
            count: affectedCount
          })
        );

        if (!proceed) {
          return false;
        }
      }

      flushPendingHistoryCommit();

      const open = activeChapterEditor();

      if (open) {
        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      const wbBefore = takeWbSnapshot();

      item.name = trimmed;
      touchWbItem(item);

      recordWbChange('wbHistItemRename', wbBefore, {
        undoExtra: () => renameWbMentionsEverywhere(key, trimmed, oldName),
        redoExtra: () => renameWbMentionsEverywhere(key, oldName, trimmed)
      });

      const changedChapters = renameWorldMentionsAcrossChapters(
        s.projectData,
        key,
        oldName,
        trimmed
      );

      if (open) {
        withPreservedSelection(open.editor, () => {
          renameMentionsIn(open.editor, key, oldName, trimmed);
        });

        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      registry.bumpVersion();
      mentionIndex.refreshItem(key);

      // Le nouveau nom peut apparaître ailleurs dans le chapitre ouvert.
      if (open) {
        highlight();
        s.projectData.chapters[open.name] = open.editor.innerHTML;
      }

      resyncChapters(changedChapters, open?.name ?? null);

      // Met à jour les mentions de la fiche dans les paragraphes des scènes.
      if (isScreenplayData(s.projectData)) {
        const nextScenes = transformScenesHtml(
          s.projectData.screenplay.scenes,
          (container) => renameMentionsIn(container, key, oldName, trimmed)
        );

        if (nextScenes) {
          s.projectData.screenplay = {
            ...s.projectData.screenplay,
            scenes: nextScenes
          };
          s.projects[projectName] = s.projectData;
          scheduleScreenplaySave();
        }
      }

      if (!isScreenplayData(s.projectData)) {
        invalidateProjectWordCache(s.projectData);
      }

      setSaveStatus('pending');

      updateStats();
      updateUndoRedo();
      bump();

      await saveAll();

      return true;
    },

    reorderSidebar(type, newOrder) {
      if (type === 'scene') {
        if (!isScreenplayData(s.projectData)) {
          return;
        }

        const sceneMap = new Map(
          s.projectData.screenplay.scenes.map((scene) => [scene.id, scene])
        );

        const orderedScenes = newOrder
          .map((sceneId) => sceneMap.get(sceneId))
          .filter((scene): scene is NonNullable<typeof scene> =>
            Boolean(scene)
          );

        s.projectData.screenplay.scenes.forEach((scene) => {
          if (!newOrder.includes(scene.id)) {
            orderedScenes.push(scene);
          }
        });

        s.projectData.screenplay = {
          ...s.projectData.screenplay,
          scenes: orderedScenes
        };
      } else if (type === 'chapter') {
        const next: Record<string, string> = {};

        newOrder.forEach((key) => {
          if (s.projectData.chapters[key] !== undefined) {
            next[key] = s.projectData.chapters[key];
          }
        });

        // Les chapitres absents de la nouvelle liste ne sont jamais perdus.
        Object.keys(s.projectData.chapters).forEach((key) => {
          if (next[key] === undefined) {
            next[key] = s.projectData.chapters[key];
          }
        });

        s.projectData.chapters = next;

        mentionIndex.rebuildChapterOrder();
      } else {
        const next: ProjectData['world'] = {};

        newOrder.forEach((itemId) => {
          const item = s.projectData.world[itemId];

          if (item) {
            next[itemId] = item;
          }
        });

        // Les fiches absentes de la nouvelle liste ne sont jamais perdues.
        Object.keys(s.projectData.world).forEach((itemId) => {
          if (!next[itemId]) {
            next[itemId] = s.projectData.world[itemId];
          }
        });

        const wbBefore = takeWbSnapshot();

        s.projectData.world = next;

        recordWbChange('wbHistItemReorder', wbBefore);
      }

      setSaveStatus('pending');

      bump();

      void saveAll();
    },
  };
}
