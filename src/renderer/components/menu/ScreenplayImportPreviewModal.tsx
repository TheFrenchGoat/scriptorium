// src/renderer/components/menu/ScreenplayImportPreviewModal.tsx
// Aperçu avant import d'un scénario Fountain (.fountain).
//
// Le projet n'est créé qu'à la validation : Annuler ne laisse aucune
// trace. L'auteur peut renommer le projet ; le scénario est affiché en
// lecture seule, scène par scène (texte brut, sans HTML inséré).

import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import { countWordsInHtml } from '../../lib/stats';
import { getSceneHeadingText, screenplayHtmlToPlainText } from '../../lib/screenplay';
import type { ImportedProject, ProjectData } from '../../../shared/types';

export interface ScreenplayImportPreviewModalProps {
  /** Fichier choisi. */
  filePath: string;
  /** Résultat de l'analyse du fichier. */
  imported: ImportedProject;
  /** Noms des projets existants. */
  existingNames: string[];
  onCancel: () => void;
  /** Nom saisi (le suffixe " (2)" est ajouté ensuite) et scénario importé. */
  onConfirm: (name: string, projectData: ProjectData) => void;
}

/** Nombre maximal d'éléments affichés pour une scène. */
const PREVIEW_MAX_ELEMENTS = 400;

/** Nom d'un personnage sans extension (V.O.), (OFF)… */
function characterName(text: string): string {
  return text
    .replace(/$[^)]*$/g, ' ')
    .replace(/\^/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase();
}

export function ScreenplayImportPreviewModal({
  filePath,
  imported,
  existingNames,
  onCancel,
  onConfirm
}: ScreenplayImportPreviewModalProps) {
  const { t, lang } = useI18n();
  const screenplay = imported.projectData.screenplay;
  const scenes = useMemo(() => (screenplay ? screenplay.scenes : []), [screenplay]);
  const language = screenplay && screenplay.settings.conventionLanguage === 'en' ? 'en' : 'fr';

  const [projectName, setProjectName] = useState<string>(imported.projectName);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const fileName = useMemo(() => {
    const parts = filePath.split(/[\\\x2F]/);
    return parts[parts.length - 1] || filePath;
  }, [filePath]);

  const taken = useMemo(() => new Set(existingNames), [existingNames]);
  const baseName = projectName.trim() || t('defaultProjectName');
  let finalName = baseName;
  if (taken.has(finalName)) {
    let index = 2;
    while (taken.has(baseName + ' (' + index + ')')) index++;
    finalName = baseName + ' (' + index + ')';
  }

  const stats = useMemo(() => {
    const names = new Set<string>();
    let words = 0;
    for (const scene of scenes) {
      for (const element of scene.elements) {
        words += countWordsInHtml(element.html);
        if (element.type === 'character') {
          const name = characterName(screenplayHtmlToPlainText(element.html));
          if (name !== '') names.add(name);
        }
      }
    }
    return { characters: names.size, words };
  }, [scenes]);

  const headingLabel = (index: number): string => {
    const scene = scenes[index];
    const text = scene ? getSceneHeadingText(scene, language).trim() : '';
    return text || t('screenplayImportNoHeading');
  };

  const selected = selectedIndex >= 0 && selectedIndex < scenes.length ? scenes[selectedIndex] : null;

  const selectedElements = useMemo(
    () =>
      selected
        ? selected.elements
            .map((element) => ({
              id: element.id,
              type: element.type,
              text: screenplayHtmlToPlainText(element.html).trim()
            }))
            .filter((entry) => entry.text !== '')
        : [],
    [selected]
  );

  return (
    <Modal
      open
      title={t('importPreviewTitle')}
      width="min(1000px, 94vw)"
      maxHeight="94vh"
      onCancel={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onConfirm(projectName, imported.projectData);
            }}
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
          {t('screenplayImportSummary', {
            scenes: String(scenes.length),
            characters: String(stats.characters),
            words: stats.words.toLocaleString()
          })}
        </div>

        <div className="import-preview-hint screenplay-import-language">
          {t(language === 'en' ? 'screenplayImportLanguageEn' : 'screenplayImportLanguageFr')}
        </div>

        <div className="import-preview-body">
          <div className="import-preview-list" aria-label={t('screenplayImportScenes')}>
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                role="button"
                tabIndex={0}
                className={
                  'import-preview-item screenplay-import-scene' +
                  (index === selectedIndex ? ' selected' : '')
                }
                onClick={() => {
                  setSelectedIndex(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedIndex(index);
                  }
                }}
              >
                <span className="screenplay-import-number">{index + 1}</span>
                <span className="screenplay-import-heading">
                  {headingLabel(index)}
                  {scene.workingTitle ? (
                    <span className="screenplay-import-working">{scene.workingTitle}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          <div className="import-preview-text screenplay-import-text">
            {selected === null ? (
              <p className="import-preview-muted">{t('screenplayImportSelect')}</p>
            ) : (
              <>
                <h4 className="screenplay-import-scene-heading">{headingLabel(selectedIndex)}</h4>
                {selectedElements.length === 0 && (
                  <p className="import-preview-muted">{t('screenplayImportEmptyScene')}</p>
                )}
                {selectedElements.slice(0, PREVIEW_MAX_ELEMENTS).map((entry) => (
                  <p key={entry.id} className={'screenplay-import-' + entry.type}>
                    {entry.text}
                  </p>
                ))}
                {selectedElements.length > PREVIEW_MAX_ELEMENTS && (
                  <p className="import-preview-muted">{t('screenplayImportTruncated')}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
