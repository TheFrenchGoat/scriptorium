// src/renderer/components/settings/BackupPreview.tsx
// Aperçu d'une sauvegarde ou d'une version : chapitres et nombre de mots,
// écart avec le projet actuel, lecture du texte, récupération d'un chapitre
// sous forme de copie (le chapitre actuel n'est jamais modifié).

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useI18n } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { describeError } from '../../lib/errors';
import { countWordsInHtml } from '../../lib/stats';
import { countScreenplayProjectWords } from '../../lib/screenplay';
import {
  compareChapters,
  htmlToReadableText,
  type BackupChapterRow
} from '../../../shared/backup-preview';
import type { BackupEntry, ProjectData } from '../../../shared/types';

export interface BackupPreviewProps {
  projectName: string;
  backup: BackupEntry;
  /** Nom de la version, ou date d'une sauvegarde automatique. */
  title: string;
  dateText: string;
  /** Données actuelles du projet. */
  getCurrentData: () => ProjectData;
  onBack: () => void;
  /** Restaure tout le projet (avec confirmation). */
  onRestore: () => void;
  /** Ajoute la copie d'un chapitre ; renvoie le nom de la copie, ou null. */
  onRecoverChapter?: (name: string, html: string, suffix: string) => string | null;
}

export function BackupPreview({
  projectName,
  backup,
  title,
  dateText,
  getCurrentData,
  onBack,
  onRestore,
  onRecoverChapter
}: BackupPreviewProps): ReactElement {
  const { t, lang } = useI18n();
  const { showInfo } = useDialogs();
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setReading(null);

    void (async () => {
      try {
        const result = await window.api.readBackup(projectName, backup.fileName);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Erreur lecture sauvegarde:', err);
        if (!cancelled) setError(describeError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectName, backup.fileName]);

  // Données actuelles, relues après chaque récupération.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const current = useMemo(() => getCurrentData(), [refreshKey]);

  const isScreenplay = data !== null && data.projectType === 'screenplay';

  const comparison = useMemo(
    () => (data && !isScreenplay ? compareChapters(data.chapters, current.chapters, countWordsInHtml) : null),
    [data, current, isScreenplay]
  );

  const fmt = (n: number): string => n.toLocaleString(locale);
  const signed = (n: number): string => (n > 0 ? '+' + fmt(n) : n < 0 ? '\u2212' + fmt(-n) : '0');

  let backupWords = 0;
  let currentWords = 0;
  if (data && isScreenplay) {
    backupWords = countScreenplayProjectWords(data);
    currentWords = current.projectType === 'screenplay' ? countScreenplayProjectWords(current) : 0;
  } else if (comparison) {
    backupWords = comparison.backupTotal;
    currentWords = comparison.currentTotal;
  }

  const copySuffix =
    backup.kind === 'named' && backup.label
      ? backup.label
      : t('backupCopySuffixDate', {
          date: backup.savedAt ? new Date(backup.savedAt).toLocaleDateString(locale) : t('unknownDate')
        });

  const recover = (name: string): void => {
    if (!data || !onRecoverChapter) return;
    const raw = Object.prototype.hasOwnProperty.call(data.chapters, name) ? data.chapters[name] : undefined;
    if (typeof raw !== 'string') return;
    try {
      const created = onRecoverChapter(name, raw, copySuffix);
      setRefreshKey((key) => key + 1);
      showInfo(created ? t('backupPreviewRecovered', { name: created }) : t('backupPreviewRecoverError'));
    } catch (err) {
      console.error(err);
      showInfo(t('backupPreviewRecoverError') + ' ' + describeError(err));
    }
  };

  const diffLabel = (row: BackupChapterRow): string => {
    if (row.state === 'removed') return t('backupDiffRemoved');
    if (row.state === 'identical') return t('backupDiffIdentical');
    return t('backupDiffModified', { diff: signed(row.diff) });
  };

  const diffClass = (row: BackupChapterRow): string =>
    'backup-diff' +
    (row.state === 'removed' ? ' is-removed' : row.diff > 0 ? ' is-more' : row.diff < 0 ? ' is-less' : '');

  const header = (
    <div className="backup-preview-header">
      <button type="button" onClick={reading === null ? onBack : () => setReading(null)}>
        {reading === null ? t('backupPreviewBack') : t('backupPreviewReadBack')}
      </button>
      <h4 className="settings-section-title">{reading === null ? title : reading}</h4>
    </div>
  );

  // Lecture d'un chapitre : texte seul, sans mise en forme, non modifiable.
  if (data && reading !== null) {
    const raw = Object.prototype.hasOwnProperty.call(data.chapters, reading) ? data.chapters[reading] : undefined;
    const text = htmlToReadableText(typeof raw === 'string' ? raw : '');
    const chapterName = reading;
    return (
      <div className="settings-section backup-preview">
        {header}
        <p className="backup-section-hint">{title === dateText ? dateText : title + ' \u2014 ' + dateText}</p>
        <div className="backup-preview-text">{text || t('backupPreviewEmptyChapter')}</div>
        {onRecoverChapter && (
          <div className="backup-preview-actions">
            <button type="button" onClick={() => recover(chapterName)}>
              {t('backupPreviewRecoverBtn')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="settings-section backup-preview">
      {header}
      {title !== dateText && <p className="backup-section-hint">{dateText}</p>}
      {error !== null ? (
        <p className="backup-section-hint">{t('backupPreviewError') + error}</p>
      ) : data === null ? (
        <p className="backup-section-hint">{t('backupPreviewLoading')}</p>
      ) : (
        <>
          <div className="backup-preview-summary">
            <p>
              {t('backupPreviewTotal', {
                words: fmt(backupWords),
                current: fmt(currentWords),
                diff: signed(currentWords - backupWords)
              })}
            </p>
            {isScreenplay && (
              <p>
                {t('backupPreviewScenes', {
                  count: fmt(data.screenplay ? data.screenplay.scenes.length : 0),
                  current: fmt(current.screenplay ? current.screenplay.scenes.length : 0)
                })}
              </p>
            )}
            <p>
              {t('backupPreviewWorld', {
                count: fmt(Object.keys(data.world ?? {}).length),
                current: fmt(Object.keys(current.world ?? {}).length)
              })}
            </p>
          </div>

          {isScreenplay ? (
            <p className="backup-section-hint">{t('backupPreviewScreenplayHint')}</p>
          ) : (
            comparison && (
              <>
                <h4 className="settings-section-title">{t('backupPreviewChaptersTitle')}</h4>
                {onRecoverChapter && <p className="backup-section-hint">{t('backupPreviewRecoverHint')}</p>}
                <ul className="item-list backup-list">
                  {comparison.rows.length === 0 ? (
                    <li className="backup-empty">{t('backupPreviewNoChapter')}</li>
                  ) : (
                    comparison.rows.map((row) => (
                      <li className="backup-item" key={row.name}>
                        <span className="backup-item-text">
                          <span className="backup-item-label">{row.name}</span>
                          <span className="backup-item-date">
                            {t('backupPreviewWords', { count: fmt(row.words) })}
                            {' \u2014 '}
                            <span className={diffClass(row)}>{diffLabel(row)}</span>
                          </span>
                        </span>
                        <span className="backup-item-actions">
                          <button type="button" onClick={() => setReading(row.name)}>
                            {t('backupPreviewReadBtn')}
                          </button>
                          {onRecoverChapter && (
                            <button type="button" onClick={() => recover(row.name)}>
                              {t('backupPreviewRecoverBtn')}
                            </button>
                          )}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
                {comparison.added.length > 0 && (
                  <>
                    <h4 className="settings-section-title">{t('backupPreviewAddedTitle')}</h4>
                    <ul className="item-list backup-list">
                      {comparison.added.map((item) => (
                        <li className="backup-item" key={item.name}>
                          <span className="backup-item-label">{item.name}</span>
                          <span className="backup-item-date">
                            {t('backupPreviewWords', { count: fmt(item.words) })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )
          )}

          <div className="backup-preview-actions">
            <button type="button" className="btn-restore-backup" onClick={onRestore}>
              {t('backupPreviewRestoreAll')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
