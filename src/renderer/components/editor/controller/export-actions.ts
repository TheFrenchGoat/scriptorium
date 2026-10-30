// src/renderer/components/editor/controller/export-actions.ts
// Actions d'export du controleur de l'editeur : reglages et apercu d'export,
// export Word, PDF, ePub, texte, Markdown, Fountain et projet.
// Code sorti de useEditorController.ts (etape 4c-2) sans reecriture :
// seul le retrait a change (2 espaces de moins).

import { buildBasicScreenplayPrintHtml, buildScreenplayPlainText } from '../../../lib/screenplay-print';
import { buildExportDocument } from '../../../lib/export/build-document';
import { buildFountainText } from '../../../../shared/fountain';
import { buildScreenplayExportDocument } from '../../../lib/screenplay-export';
import { createBibleSource, listBibleCategories } from '../../../lib/export/build-bible';
import { describeError } from '../../../lib/errors';
import { getSceneHeadingText as getFountainSceneHeading } from '../../../lib/screenplay';
import { getLanguage, t } from '../../../i18n';
import { isExportBusy, setExportBusy } from '../../../lib/export/export-busy';
import { normalizeExportSettings } from '../../../../shared/export-settings';
import { prepareExportImages } from '../../../lib/export/prepare-images';
import { renderExportHtml } from '../../../lib/export/render-html';
import { renderExportMarkdown, renderExportText } from '../../../lib/export/render-text';
import type { WbRegistry } from '../../../lib/wb-registry';
import { isScreenplayData } from './utils';
import type { EditorController, EditorControllerDeps, MutableState } from './types';

/** Ce dont les actions d'export ont besoin ; fourni par useEditorController. */
export interface ExportActionsContext {
  projectName: EditorControllerDeps['projectName'];
  s: MutableState;
  registry: WbRegistry;
  showInfo: EditorControllerDeps['showInfo'];
  save: () => Promise<void>;
}

/** Les 6 methodes d'export du controleur. */
export type ExportActions = Pick<
  EditorController,
  | 'getExportSettings'
  | 'exportChapterNames'
  | 'exportBibleCategories'
  | 'buildExportPreview'
  | 'saveExportSettings'
  | 'exportAs'
>;

export function createExportActions(ctx: ExportActionsContext): ExportActions {
  const { projectName, s, registry, showInfo, save } = ctx;
  return {
    getExportSettings() {
      return normalizeExportSettings(s.projectData.exportSettings);
    },

    exportChapterNames() {
      return Object.keys(s.projectData.chapters);
    },

    exportBibleCategories() {
      return listBibleCategories(s.projectData, registry);
    },

    buildExportPreview(settings) {
      // Seul le debut du roman est analyse : l'apercu reste fluide meme
      // pour un long manuscrit.
      const maxChapters = 3;
      const maxBlocks = 150;

      const normalized = normalizeExportSettings(settings);
      const allNames = Object.keys(s.projectData.chapters);
      const excluded = new Set(normalized.content.excludedChapters);
      const included = allNames.filter((name) => !excluded.has(name));
      const shown = new Set(included.slice(0, maxChapters));

      const full = buildExportDocument(
        s.projectData,
        {
          ...normalized,
          content: {
            ...normalized.content,
            excludedChapters: allNames.filter((name) => !shown.has(name))
          }
        },
        {
          projectName,
          bible: createBibleSource(registry, t, getLanguage()),
          language: getLanguage(),
          labels: { tableOfContents: t('exportTableOfContents') }
        }
      );

      let budget = maxBlocks;
      const bibleOnly = normalized.bible.mode === 'only';
      const novelShown = bibleOnly ? 0 : shown.size;
      let truncated = !bibleOnly && included.length > shown.size;
      const chapters: typeof full.chapters = [];

      let chapterIndex = -1;
      for (const chapter of full.chapters) {
        chapterIndex += 1;

        // La bible a son propre budget : elle reste visible dans l'apercu.
        if (chapterIndex === novelShown && chapterIndex > 0) budget = maxBlocks;

        if (budget <= 0) {
          truncated = true;
          continue;
        }

        const blocks = chapter.blocks.slice(0, budget);
        if (blocks.length < chapter.blocks.length) truncated = true;
        budget -= blocks.length;
        chapters.push({ ...chapter, blocks });
      }

      const tocTitles = [
        ...(bibleOnly ? [] : included),
        ...full.chapters.slice(novelShown).map((chapter) => chapter.title)
      ];

      return { document: { ...full, chapters }, tocTitles, truncated };
    },

    async saveExportSettings(settings) {
      s.projectData.exportSettings = normalizeExportSettings(settings);
      s.projects[projectName] = s.projectData;
      await window.api.saveProjects(s.projects);
    },

    async exportAs(kind) {
      if (isExportBusy()) {
        showInfo(t('exportAlreadyRunning'));
        return;
      }
      const pickExportPath = async (...dialogArgs: Parameters<typeof window.api.showSaveDialog>) => {
        const picked = await window.api.showSaveDialog(...dialogArgs);
        if (!picked.canceled && picked.filePath) setExportBusy(true);
        return picked;
      };
      try { // indicateur export : debut
      const screenplay = isScreenplayData(s.projectData)
        ? s.projectData.screenplay
        : null;

      if (kind === 'fountain') {
        // Fountain : scenario uniquement (texte brut UTF-8).
        if (!screenplay) {
          showInfo(t('nothingToExport'));
          return;
        }

        const result = await pickExportPath({
          defaultPath: screenplay
            ? `${projectName}.fountain`
            : projectName + t('exportFullSuffix') + '.fountain',
          filters: [{ name: 'Fountain', extensions: ['fountain'] }]
        });

        if (result.canceled || !result.filePath) return;

        const fountainLanguage = screenplay.settings.conventionLanguage;
        const fountainText = buildFountainText(screenplay, (scene) =>
          getFountainSceneHeading(scene, fountainLanguage)
        );

        await window.api.exportTxt(result.filePath, fountainText);
        showInfo(t('exportFountainSuccess'));
        return;
      }

      const chapterNames = Object.keys(s.projectData.chapters);

      const bibleOnly =
        !screenplay &&
        normalizeExportSettings(s.projectData.exportSettings).bible.mode === 'only';
      const hasContent = bibleOnly
        ? Object.keys(s.projectData.world ?? {}).length > 0
        : chapterNames.length > 0;

      if (kind !== 'project' && !screenplay && !hasContent) {
        showInfo(t('nothingToExport'));
        return;
      }

      if (
        kind !== 'project' &&
        screenplay &&
        screenplay.scenes.length === 0
      ) {
        showInfo(t('nothingToExport'));
        return;
      }

      await save();

      const buildNovelExportDocument = () =>
        buildExportDocument(
          s.projectData,
          normalizeExportSettings(s.projectData.exportSettings),
          {
            projectName,
            bible: createBibleSource(registry, t, getLanguage()),
            language: getLanguage(),
            labels: { tableOfContents: t('exportTableOfContents') }
          }
        );

      try {
        if (kind === 'txt') {
          const result = await pickExportPath({
            title: t('exportDialogTxt'),
            defaultPath: screenplay
              ? `${projectName}.txt`
              : projectName + t('exportFullSuffix') + '.txt',
            filters: [{ name: t('exportFilterText'), extensions: ['txt'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          let fullText = '';

          if (screenplay) {
            fullText = buildScreenplayPlainText(screenplay);
          } else {
            fullText = renderExportText(buildNovelExportDocument());
          }

          await window.api.exportTxt(result.filePath, fullText);

          showInfo(t('exportTxtSuccess'));

          return;
        }

        if (kind === 'md') {
          const result = await pickExportPath({
            title: t('exportDialogMd'),
            defaultPath: `${projectName}.md`,
            filters: [{ name: 'Markdown', extensions: ['md'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          const markdown = screenplay
            ? buildScreenplayPlainText(screenplay)
            : renderExportMarkdown(buildNovelExportDocument());

          await window.api.exportTxt(result.filePath, markdown);

          showInfo(t('exportMdSuccess'));

          return;
        }

        if (kind === 'pdf') {
          const result = await pickExportPath({
            title: t('exportDialogPdf'),
            defaultPath: `${projectName}.pdf`,
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          const html = screenplay
            ? buildBasicScreenplayPrintHtml(projectName, screenplay)
            : renderExportHtml(buildNovelExportDocument());

          await window.api.exportPdf(result.filePath, html);

          showInfo(t('exportPdfSuccess'));

          return;
        }

        if (kind === 'docx') {
          if (screenplay) {
            const screenplayResult = await pickExportPath({
              title: t('exportDialogDocx'),
              defaultPath: `${projectName}.docx`,
              filters: [{ name: 'Word', extensions: ['docx'] }]
            });

            if (!screenplayResult.canceled && screenplayResult.filePath) {
              await window.api.exportScreenplayDocx(
                screenplayResult.filePath,
                buildScreenplayExportDocument(projectName, screenplay)
              );

              showInfo(t('exportDocxSuccess'));
            }

            return;
          }

          const result = await pickExportPath({
            title: t('exportDialogDocx'),
            defaultPath: projectName + t('exportFullSuffix') + '.docx',
            filters: [{ name: 'Word', extensions: ['docx'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          await window.api.exportDocumentDocx(
            result.filePath,
            await prepareExportImages(buildNovelExportDocument())
          );

          showInfo(t('exportDocxSuccess'));

          return;
        }

        if (kind === 'odt') {
          if (screenplay) {
            const screenplayResult = await pickExportPath({
              title: t('exportDialogOdt'),
              defaultPath: `${projectName}.odt`,
              filters: [{ name: 'OpenDocument', extensions: ['odt'] }]
            });

            if (!screenplayResult.canceled && screenplayResult.filePath) {
              await window.api.exportScreenplayOdt(
                screenplayResult.filePath,
                buildScreenplayExportDocument(projectName, screenplay)
              );

              showInfo(t('exportOdtSuccess'));
            }

            return;
          }

          const result = await pickExportPath({
            title: t('exportDialogOdt'),
            defaultPath: projectName + t('exportFullSuffix') + '.odt',
            filters: [{ name: 'OpenDocument', extensions: ['odt'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          await window.api.exportDocumentOdt(
            result.filePath,
            await prepareExportImages(buildNovelExportDocument())
          );

          showInfo(t('exportOdtSuccess'));

          return;
        }

        if (kind === 'epub') {
          if (screenplay) {
            showInfo(t('nothingToExport'));
            return;
          }

          const result = await pickExportPath({
            title: t('exportDialogEpub'),
            defaultPath: `${projectName}.epub`,
            filters: [{ name: 'ePub', extensions: ['epub'] }]
          });

          if (result.canceled || !result.filePath) {
            return;
          }

          // Identifiant du livre : créé au premier export, puis conservé.
          const epubSettings = normalizeExportSettings(s.projectData.exportSettings);
          let identifier = epubSettings.epub.identifier;

          if (identifier === '') {
            identifier =
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : '';

            if (identifier !== '') {
              s.projectData.exportSettings = {
                ...epubSettings,
                epub: { ...epubSettings.epub, identifier }
              };
              await save();
            }
          }

          const epubResult = await window.api.exportDocumentEpub(
            result.filePath,
            await prepareExportImages(buildNovelExportDocument()),
            { identifier, coverPath: epubSettings.epub.coverPath }
          );

          showInfo(
            t(epubResult.coverMissing ? 'exportEpubSuccessNoCover' : 'exportEpubSuccess')
          );

          return;
        }

        const result = await pickExportPath({
          title: t('exportDialogProject'),
          defaultPath: `${projectName}.scriptorium`,
          filters: [{ name: t('exportFilterProject'), extensions: ['scriptorium'] }]
        });

        if (result.canceled || !result.filePath) {
          return;
        }

        await window.api.exportProject(
          result.filePath,
          projectName,
          s.projectData
        );

        showInfo(t('exportSuccess'));
      } catch (error) {
        const message = describeError(error);

        console.error(`Erreur export ${kind} :`, error);

        const prefix = {
          fountain: 'exportFountainError',
          txt: 'exportTxtError',
          md: 'exportMdError',
          pdf: 'exportPdfError',
          docx: 'exportDocxError',
          odt: 'exportOdtError',
          epub: 'exportEpubError',
          project: 'exportProjectError'
        } as const;

        showInfo(t(prefix[kind]) + message);
      }
      } finally {
        setExportBusy(false);
      }
    },
  };
}
