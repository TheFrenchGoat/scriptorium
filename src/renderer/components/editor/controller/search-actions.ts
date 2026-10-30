// src/renderer/components/editor/controller/search-actions.ts
// Actions de recherche du controleur de l'editeur : compter les occurrences
// et tout remplacer (chapitre actif, projet entier ou scenario).
// Code sorti de useEditorController.ts (etape 4c-3) sans reecriture :
// seul le retrait a change (2 espaces de moins).

import { countInHtmlString, replaceInHtmlString } from '../../../lib/dom';
import type { ReplaceMatchInfo } from '../../../lib/dom';
import { invalidateProjectWordCache } from '../../../lib/project-word-cache';
import { t } from '../../../i18n';
import type { EditHistory } from '../../../lib/edit-history';
import type { MentionIndex } from '../../../lib/mention-index';
import { isScreenplayData } from './utils';
import type { EditorController, EditorControllerDeps, MutableState } from './types';

/**
 * Ce dont les actions de recherche ont besoin ; fourni par useEditorController.
 * ctrl est un relais : il n'est appele qu'au moment d'un remplacement dans
 * un scenario, quand le controleur est entierement construit.
 */
export interface SearchActionsContext {
  s: MutableState;
  showInfo: EditorControllerDeps['showInfo'];
  history: EditHistory;
  mentionIndex: MentionIndex;
  highlight: () => boolean;
  flushPendingHistoryCommit: () => void;
  saveAll: () => Promise<void>;
  scheduleChapterSave: (chapterName: string, html: string) => void;
  setSaveStatus: EditorController['setSaveStatus'];
  updateStats: () => void;
  updateUndoRedo: () => void;
  ctrl: Pick<EditorController, 'updateScreenplay'>;
}

/** Les 2 methodes de recherche du controleur. */
export type SearchActions = Pick<EditorController, 'countMatches' | 'replaceAll'>;

export function createSearchActions(ctx: SearchActionsContext): SearchActions {
  const { s, showInfo, history, mentionIndex, highlight, flushPendingHistoryCommit, saveAll, scheduleChapterSave, setSaveStatus, updateStats, updateUndoRedo, ctrl } = ctx;
  return {
    countMatches(findText, wholeProject, options) {
      const info: ReplaceMatchInfo = { count: 0, places: 0, scenes: false, noChapter: false };
      if (!findText) return info;

      if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
        info.scenes = true;
        for (const scene of s.projectData.screenplay.scenes) {
          if (!wholeProject && scene.id !== s.activeTab) continue;
          let n = 0;
          for (const element of scene.elements) n += countInHtmlString(element.html, findText, options);
          if (n > 0) {
            info.count += n;
            info.places += 1;
          }
        }
        return info;
      }

      const addChapter = (html: string | undefined): void => {
        const n = countInHtmlString(html, findText, options);
        if (n > 0) {
          info.count += n;
          info.places += 1;
        }
      };

      if (!wholeProject) {
        if (s.activeType !== 'chapter' || !s.activeTab) {
          info.noChapter = true;
          return info;
        }
        addChapter(s.projectData.chapters[s.activeTab]);
        return info;
      }

      for (const html of Object.values(s.projectData.chapters)) addChapter(html);
      return info;
    },

    replaceAll(findText, replacementText, wholeProject, options) {
      if (!findText) {
        return;
      }

      if (s.activeType === 'scene' && isScreenplayData(s.projectData)) {
        const screenplay = s.projectData.screenplay;

        let totalCount = 0;

        const nextScenes = screenplay.scenes.map((scene) => {
          if (!wholeProject && scene.id !== s.activeTab) {
            return scene;
          }

          const nextElements = scene.elements.map((element) => {
            const result = replaceInHtmlString(
              element.html,
              findText,
              replacementText,
              options
            );

            totalCount += result.count;

            return result.count > 0
              ? { ...element, html: result.html }
              : element;
          });

          return { ...scene, elements: nextElements };
        });

        if (totalCount === 0) {
          showInfo(
            wholeProject
              ? t('replaceNoneInProject')
              : t('replaceNoneInChapter')
          );

          return;
        }

        ctrl.updateScreenplay({ ...screenplay, scenes: nextScenes });

        void saveAll();

        showInfo(
          wholeProject
            ? t('replaceDoneInProject', {
                count: totalCount,
                chapters: nextScenes.length
              })
            : t('replaceDoneInChapter', { count: totalCount })
        );

        return;
      }

      // La frappe en attente devient une étape d'historique à part entière.
      flushPendingHistoryCommit();

      if (!wholeProject) {
        if (s.activeType !== 'chapter' || !s.activeTab) {
          showInfo(t('replaceNoChapterOpen'));
          return;
        }

        const chapterName = s.activeTab;
        const oldHtml = s.projectData.chapters[chapterName];

        const { html: newHtml, count } = replaceInHtmlString(
          oldHtml,
          findText,
          replacementText,
          options
        );

        if (count === 0) {
          showInfo(t('replaceNoneInChapter'));
          return;
        }

        history.sync(chapterName, oldHtml);

        s.projectData.chapters[chapterName] = newHtml;

        const editor = s.editorEl;

        let finalHtml = newHtml;

        if (editor) {
          editor.innerHTML = newHtml;

          highlight();

          finalHtml = editor.innerHTML;

          s.projectData.chapters[chapterName] = finalHtml;

          history.commit(chapterName, finalHtml);
          mentionIndex.updateForChapter(chapterName, finalHtml);
        }

        updateUndoRedo();

        setSaveStatus('pending');

        updateStats();

        scheduleChapterSave(chapterName, finalHtml);

        showInfo(t('replaceDoneInChapter', { count }));

        return;
      }

      let totalCount = 0;
      let chaptersAffected = 0;

      Object.keys(s.projectData.chapters).forEach((chapterName) => {
        const oldHtml = s.projectData.chapters[chapterName];

        const { html: newHtml, count } = replaceInHtmlString(
          oldHtml,
          findText,
          replacementText,
          options
        );

        if (count === 0) {
          return;
        }

        chaptersAffected += 1;
        totalCount += count;

        history.sync(chapterName, oldHtml);

        s.projectData.chapters[chapterName] = newHtml;

        history.commit(chapterName, newHtml);

        if (
          chapterName === s.activeTab &&
          s.activeType === 'chapter' &&
          s.editorEl
        ) {
          s.editorEl.innerHTML = newHtml;

          highlight();

          const finalHtml = s.editorEl.innerHTML;

          history.resyncOnly(chapterName, finalHtml);

          s.projectData.chapters[chapterName] = finalHtml;
        }
      });

      mentionIndex.rebuildAll();

      if (!isScreenplayData(s.projectData)) {
        invalidateProjectWordCache(s.projectData);
      }

      updateUndoRedo();

      setSaveStatus('pending');

      updateStats();

      void saveAll();

      showInfo(
        totalCount > 0
          ? t('replaceDoneInProject', {
              count: totalCount,
              chapters: chaptersAffected
            })
          : t('replaceNoneInProject')
      );
    },
  };
}
