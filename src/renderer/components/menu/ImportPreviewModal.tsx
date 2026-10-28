// src/renderer/components/menu/ImportPreviewModal.tsx
// Aperçu avant import d'un document (LibreOffice, Word, texte, Markdown).
//
// Le projet n'est créé qu'à la validation : Annuler ne laisse aucune
// trace. L'auteur peut renommer le projet, écarter, renommer ou fusionner
// des chapitres. Pour un texte brut, l'option "Recoller les lignes coupées"
// relance l'analyse du fichier.
//
// Le texte est affiché en lecture seule, sans insérer de HTML dans la page :
// DOMParser produit un document inerte (aucun script, aucune image chargée).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import { describeError } from '../../lib/errors';
import { countWordsInHtml } from '../../lib/stats';
import type { ImportedProject, ProjectData } from '../../../shared/types';

export interface ImportPreviewModalProps {
  /** Fichier choisi (nouvelle analyse d'un texte brut). */
  filePath: string;
  /** Résultat de la première analyse. */
  imported: ImportedProject;
  /** Noms des projets existants. */
  existingNames: string[];
  onCancel: () => void;
  /** Nom saisi (le suffixe " (2)" est ajouté ensuite) et chapitres retenus. */
  onConfirm: (name: string, projectData: ProjectData) => void;
}

interface PreviewChapter {
  id: string;
  /** Nom trouvé dans le document. */
  sourceName: string;
  /** Nom modifiable. */
  name: string;
  html: string;
  words: number;
  included: boolean;
}

interface PreviewBlock {
  text: string;
  heading: boolean;
}

/** Nombre maximal de paragraphes affichés dans l'aperçu d'un chapitre. */
const PREVIEW_MAX_BLOCKS = 400;

/** Balises de bloc : tout le reste (gras, italique, liensè) fait partie du paragraphe. */
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'SECTION',
  'ARTICLE',
  'TABLE',
  'TBODY',
  'THEAD',
  'TFOOT',
  'TR',
  'TD',
  'TH',
  'PRE',
  'HR',
  'FIGURE'
]);

let nextChapterId = 0;

function buildChapters(imported: ImportedProject): PreviewChapter[] {
  const chapters = imported.projectData.chapters ?? {};

  return Object.keys(chapters).map((name) => {
    const html = chapters[name] ?? '';
    nextChapterId += 1;

    return {
      id: 'import-chapter-' + nextChapterId,
      sourceName: name,
      name,
      html,
      words: countWordsInHtml(html),
      included: true
    };
  });
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }

  let index = 2;

  while (taken.has(base + ' (' + index + ')')) {
    index++;
  }

  return base + ' (' + index + ')';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasBlockChild(element: Element): boolean {
  return Array.from(element.children).some((child) => BLOCK_TAGS.has(child.tagName.toUpperCase()));
}

/* Texte d'un contenu en ligne : les espaces du code HTML deviennent un seul
   espace, seul <br> donne un retour à la ligne. */
function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;

  if (element.tagName.toUpperCase() === 'BR') {
    return '\n';
  }

  return Array.from(element.childNodes).map(inlineText).join('');
}

function cleanText(raw: string): string {
  return raw.replace(/ *\n */g, '\n').trim();
}

/* Un paragraphe = un bloc sans sous-bloc, ou une suite de contenus en ligne
   entre deux blocs. */
function collectBlocks(parent: Node, out: PreviewBlock[]): void {
  let buffer = '';

  const flush = (): void => {
    const text = cleanText(buffer);
    buffer = '';

    if (text) {
      out.push({ text, heading: false });
    }
  };

  for (const child of Array.from(parent.childNodes)) {
    if (out.length > PREVIEW_MAX_BLOCKS) {
      return;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      const tag = element.tagName.toUpperCase();

      if (BLOCK_TAGS.has(tag)) {
        flush();

        if (hasBlockChild(element)) {
          collectBlocks(element, out);
        } else {
          const text = cleanText(inlineText(element));

          if (text) {
            out.push({ text, heading: /^H[1-6]$/.test(tag) });
          }
        }

        continue;
      }
    }

    buffer += inlineText(child);
  }

  flush();
}

function htmlToBlocks(html: string): PreviewBlock[] {
  if (!html) {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: PreviewBlock[] = [];
  collectBlocks(doc.body, out);
  return out;
}

export function ImportPreviewModal({
  filePath,
  imported,
  existingNames,
  onCancel,
  onConfirm
}: ImportPreviewModalProps): React.ReactElement {
  const { t, lang } = useI18n();

  const [source, setSource] = useState<ImportedProject>(imported);
  const [projectName, setProjectName] = useState<string>(imported.projectName);
  const [chapters, setChapters] = useState<PreviewChapter[]>(() => buildChapters(imported));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const formatNumber = (value: number): string =>
    value.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');

  const fileName = useMemo(() => {
    const parts = filePath.split('\\').join('/').split('/');
    return parts[parts.length - 1] || filePath;
  }, [filePath]);

  const taken = useMemo(() => new Set(existingNames), [existingNames]);
  const baseName = projectName.trim() || t('defaultProjectName');
  const finalName = uniqueName(baseName, taken);

  const selected = chapters.find((chapter) => chapter.id === selectedId) ?? chapters[0] ?? null;
  const selectedIndex = selected ? chapters.indexOf(selected) : -1;
  const selectedHtml = selected ? selected.html : '';
  const previewBlocks = useMemo(() => htmlToBlocks(selectedHtml), [selectedHtml]);

  const includedCount = chapters.filter((chapter) => chapter.included).length;
  const includedWords = chapters.reduce(
    (sum, chapter) => sum + (chapter.included ? chapter.words : 0),
    0
  );

  const formatLabel =
    source.format === 'odt'
      ? 'LibreOffice (.odt)'
      : source.format === 'docx'
        ? 'Word (.docx)'
        : source.format === 'md'
          ? 'Markdown (.md)'
          : source.format === 'txt'
            ? t('importPreviewFormatTxt')
            : 'Scriptorium';

  const chapterLabel = (chapter: PreviewChapter, index: number): string =>
    chapter.name.trim() || t('importPreviewDefaultChapter', { n: String(index + 1) });

  const updateChapter = (id: string, patch: Partial<PreviewChapter>): void => {
    setChapters((previous) =>
      previous.map((chapter) => (chapter.id === id ? { ...chapter, ...patch } : chapter))
    );
  };

  const mergeWithPrevious = (id: string): void => {
    const index = chapters.findIndex((chapter) => chapter.id === id);
    const before = index > 0 ? chapters[index - 1] : undefined;
    const current = index > 0 ? chapters[index] : undefined;

    if (!before || !current) {
      return;
    }

    /* Le titre du chapitre fusionné devient un paragraphe du texte,
       sauf s'il y figure déjà. */
    const title = current.name.trim() || current.sourceName.trim();
    const first = htmlToBlocks(current.html)[0];
    const titleHtml =
      title && !(first && first.text === title) ? '<p>' + escapeHtml(title) + '</p>' : '';
    const html = before.html + titleHtml + current.html;
    const merged: PreviewChapter = { ...before, html, words: countWordsInHtml(html) };
    const next = chapters.slice();
    next.splice(index - 1, 2, merged);
    setChapters(next);
    setSelectedId(before.id);
  };

  const reset = (): void => {
    setProjectName(source.projectName);
    setChapters(buildChapters(source));
    setSelectedId(null);
    setReloadError(null);
  };

  const changeRejoin = async (value: boolean): Promise<void> => {
    setReloading(true);
    setReloadError(null);

    try {
      const next = await window.api.importProject(filePath, { rejoinLines: value });

      if (!aliveRef.current) {
        return;
      }

      /* Nom laissé intact s'il a été modifié par l'auteur. */
      if (projectName === source.projectName) {
        setProjectName(next.projectName);
      }

      setSource(next);
      setChapters(buildChapters(next));
      setSelectedId(null);
    } catch (error) {
      if (aliveRef.current) {
        setReloadError(describeError(error));
      }
    } finally {
      if (aliveRef.current) {
        setReloading(false);
      }
    }
  };

  const confirm = (): void => {
    if (includedCount === 0 || reloading) {
      return;
    }

    const used = new Set<string>();
    const result: Record<string, string> = {};

    chapters.forEach((chapter, index) => {
      if (!chapter.included) {
        return;
      }

      const name = uniqueName(chapterLabel(chapter, index), used);
      used.add(name);
      result[name] = chapter.html;
    });

    onConfirm(projectName, { ...source.projectData, chapters: result });
  };

  return (
    <Modal
      open
      title={t('importPreviewTitle')}
      width="min(1000px, 94vw)"
      maxHeight="94vh"
      onCancel={onCancel}
      footer={
        <>
          <button
            type="button"
            className="import-preview-reset"
            disabled={reloading}
            onClick={reset}
          >
            {t('importPreviewReset')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={includedCount === 0 || reloading}
            title={includedCount === 0 ? t('importPreviewNoneSelected') : undefined}
            onClick={confirm}
          >
            {t('importPreviewImport')}
          </button>
        </>
      }
    >
      <div className="import-preview">
        <div className="import-preview-file">{fileName}</div>

        <label className="import-preview-name">
          <span>{t('importPreviewProjectName')}</span>
          <input
            type="text"
            value={projectName}
            placeholder={t('defaultProjectName')}
            onChange={(event) => {
              setProjectName(event.target.value);
            }}
          />
        </label>

        {finalName !== baseName && (
          <div className="import-preview-warning">
            {t('importPreviewNameTaken', { name: finalName })}
          </div>
        )}

        <div className="import-preview-summary">
          {t('importPreviewSummary', {
            format: formatLabel,
            count: String(includedCount),
            total: String(chapters.length),
            words: formatNumber(includedWords)
          })}
        </div>

        {source.format === 'txt' && (
          <div className="import-preview-option">
            <label>
              <input
                type="checkbox"
                checked={source.rejoinLines === true}
                disabled={reloading}
                onChange={(event) => {
                  void changeRejoin(event.target.checked);
                }}
              />
              <span>{t('importPreviewRejoin')}</span>
              {source.rejoinSuggested === true && (
                <span className="import-preview-muted">{t('importPreviewRejoinSuggested')}</span>
              )}
            </label>
            <div className="import-preview-hint">{t('importPreviewRejoinHint')}</div>
          </div>
        )}

        {reloading && <div className="import-preview-muted">{t('importPreviewReloading')}</div>}

        {reloadError !== null && <div className="import-preview-warning">{reloadError}</div>}

        <div className="import-preview-body">
          <div className="import-preview-list" aria-label={t('importPreviewChapters')}>
            {chapters.map((chapter, index) => (
              <div
                key={chapter.id}
                className={
                  'import-preview-item' +
                  (selected !== null && chapter.id === selected.id ? ' selected' : '') +
                  (chapter.included ? '' : ' excluded')
                }
                onClick={() => {
                  setSelectedId(chapter.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={chapter.included}
                  title={t('importPreviewInclude')}
                  onChange={(event) => {
                    updateChapter(chapter.id, { included: event.target.checked });
                  }}
                />
                <input
                  type="text"
                  value={chapter.name}
                  placeholder={t('importPreviewDefaultChapter', { n: String(index + 1) })}
                  onFocus={() => {
                    setSelectedId(chapter.id);
                  }}
                  onChange={(event) => {
                    updateChapter(chapter.id, { name: event.target.value });
                  }}
                />
                <span className="import-preview-words">
                  {t('importPreviewWords', { count: formatNumber(chapter.words) })}
                </span>
                <button
                  type="button"
                  className="import-preview-merge"
                  disabled={index === 0 || reloading}
                  title={t('importPreviewMergeHint')}
                  onClick={(event) => {
                    event.stopPropagation();
                    mergeWithPrevious(chapter.id);
                  }}
                >
                  {t('importPreviewMerge')}
                </button>
              </div>
            ))}
          </div>

          <div className="import-preview-text">
            {selected === null ? (
              <p className="import-preview-muted">{t('importPreviewSelect')}</p>
            ) : (
              <>
                <h4>{chapterLabel(selected, selectedIndex)}</h4>
                {previewBlocks.length === 0 && (
                  <p className="import-preview-muted">{t('importPreviewEmptyChapter')}</p>
                )}
                {previewBlocks.slice(0, PREVIEW_MAX_BLOCKS).map((block, blockIndex) =>
                  block.heading ? (
                    <h5 key={blockIndex}>{block.text}</h5>
                  ) : (
                    <p key={blockIndex}>{block.text}</p>
                  )
                )}
                {previewBlocks.length > PREVIEW_MAX_BLOCKS && (
                  <p className="import-preview-muted">{t('importPreviewTruncated')}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
