// src/renderer/components/settings/SettingsSections.tsx
// Sections communes aux deux fenêtres « Paramètres » (accueil et éditeur) :
// thème et langue, police de l'interface, correction et mises à jour.
// Chaque fenêtre fournit les valeurs et la façon de les enregistrer ;
// l'affichage est ainsi identique partout.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useI18n, type TranslationKey } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { Select } from '../common/Select';
import { describeError } from '../../lib/errors';
import { registerUpdatesPanel } from '../../lib/update-panel';
import { THEMES, UI_FONTS, UI_SIZES } from '../../lib/settings-options';
import type { BackupEntry, LanguageCode, ProjectData, ThemeName } from '../../../shared/types';
import { BackupPreview } from './BackupPreview';

const LANGUAGES: LanguageCode[] = ['fr', 'en'];

// ---------- Thème et langue ----------

export interface ThemeLanguageFieldsProps {
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
}

/** Choix du thème et de la langue de l'interface. */
export function ThemeLanguageFields({
  theme,
  onChangeTheme
}: ThemeLanguageFieldsProps): ReactElement {
  const { t, lang, changeLanguage } = useI18n();

  return (
    <>
      <div className="wb-form-group">
        <label className="wb-label">{t('themeSubmenuLabel')}</label>
        <div className="settings-choice-grid">
          {THEMES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className={
                'settings-choice-btn settings-theme-btn' +
                (theme === choice.value ? ' active' : '')
              }
              onClick={() => onChangeTheme(choice.value)}
            >
              <span
                className={'theme-swatch theme-swatch-' + choice.value}
                aria-hidden="true"
              >
                Aa
                <span className="theme-swatch-accent" />
              </span>
              <span className="settings-theme-name">{t(choice.key)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="wb-form-group">
        <label className="wb-label">{t('langSubmenuLabel')}</label>
        <div className="settings-choice-row">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className={
                'settings-choice-btn' + (lang === code ? ' active' : '')
              }
              onClick={() => changeLanguage(code)}
            >
              {t(code === 'fr' ? 'langFr' : 'langEn')}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Police de l'interface ----------

export interface UiFontPatch {
  uiFontSize?: number;
  uiFontFamily?: string;
}

export interface UiFontFieldsProps {
  uiFontSize: number;
  uiFontFamily: string;
  onChange: (patch: UiFontPatch) => void;
}

/** Taille et police de l'interface. */
export function UiFontFields({
  uiFontSize,
  uiFontFamily,
  onChange
}: UiFontFieldsProps): ReactElement {
  const { t } = useI18n();

  return (
    <>
      <div className="wb-form-group">
        <label className="wb-label">{t('prefUiFontSizeLabel')}</label>
        <div className="settings-choice-row">
          {UI_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              className={
                'settings-choice-btn' +
                (uiFontSize === size.value ? ' active' : '')
              }
              onClick={() => onChange({ uiFontSize: size.value })}
            >
              {t(size.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="wb-form-group" style={{ marginBottom: 0 }}>
        <label className="wb-label">{t('prefUiFontLabel')}</label>
        <Select
          block
          ariaLabel={t('prefUiFontLabel')}
          value={uiFontFamily}
          buttonStyle={{ fontFamily: uiFontFamily }}
          options={UI_FONTS.map((font) => ({
            value: font.value,
            label: font.label,
            style: { fontFamily: font.value }
          }))}
          onChange={(value) => onChange({ uiFontFamily: value })}
        />
      </div>
    </>
  );
}

// ---------- Correction ----------

export interface CorrectionSectionProps {
  grammarEnabled: boolean;
  onToggleGrammar: (enabled: boolean) => void;
  picky: boolean;
  onTogglePicky: (picky: boolean) => void;
  /** Correcteur orthographique intégré (fourni par l'éditeur seulement). */
  nativeSpellcheck?: {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
  };
  /** Ouvre l'installation de LanguageTool (fourni par l'éditeur seulement). */
  onConfigureGrammar?: () => void;
}

/** Section « Correction ». */
export function CorrectionSection({
  grammarEnabled,
  onToggleGrammar,
  picky,
  onTogglePicky,
  nativeSpellcheck,
  onConfigureGrammar
}: CorrectionSectionProps): ReactElement {
  const { t } = useI18n();

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">
        {t('settingsSectionCorrection')}
      </h4>

      {nativeSpellcheck && (
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={nativeSpellcheck.enabled}
            onChange={(event) => nativeSpellcheck.onToggle(event.target.checked)}
          />
          <span>{t('nativeSpellcheckLabel')}</span>
        </label>
      )}

      <label className="settings-checkbox-row">
        <input
          type="checkbox"
          checked={grammarEnabled}
          onChange={(event) => onToggleGrammar(event.target.checked)}
        />
        <span>{t('grammarToggleLabel')}</span>
      </label>

      <label className="settings-checkbox-row">
        <input
          type="checkbox"
          checked={picky}
          onChange={(event) => onTogglePicky(event.target.checked)}
        />
        <span>{t('grammarPickyLabel')}</span>
      </label>

      {onConfigureGrammar ? (
        <button
          type="button"
          style={{ width: '100%', marginTop: 4 }}
          onClick={onConfigureGrammar}
        >
          {t('grammarConfigureBtn')}
        </button>
      ) : (
        <p style={{ opacity: 0.7, fontSize: '0.9em', marginTop: 6 }}>
          {t('grammarInstallFromEditor')}
        </p>
      )}
    </div>
  );
}

// ---------- Mises à jour ----------

export interface UpdatesSectionProps {
  /** Vrai quand la fenêtre Paramètres est ouverte. */
  open: boolean;
}

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string };

/** Au-delà de ce délai sans réponse, la vérification est considérée comme échouée. */
const CHECK_TIMEOUT_MS = 60_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Version installée, bouton de vérification et résultat réel de celle-ci.
 * Le résultat arrive par les événements du processus principal (main/updater.ts) ;
 * UpdateNotifier les reçoit aussi, mais n'ouvre aucune fenêtre tant que
 * cette section est visible (voir lib/update-panel.ts).
 */
export function UpdatesSection({ open }: UpdatesSectionProps): ReactElement {
  const { t } = useI18n();
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  // Avancement du téléchargement (0 à 100), affiché pendant « downloading ».
  const [percent, setPercent] = useState(0);
  // Version dont le téléchargement a échoué : permet de proposer « Réessayer ».
  const [retryVersion, setRetryVersion] = useState('');
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Dernière version dont le téléchargement a été suivi ici.
  const downloadTargetRef = useRef('');

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus({ kind: 'idle' });
    setPercent(0);
    setRetryVersion('');

    void window.api
      .getAppVersion()
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch((error) => {
        console.error(
          "Impossible de récupérer la version de l'application :",
          error
        );
      });

    // État déjà connu du processus principal : mise à jour trouvée au
    // démarrage, téléchargement lancé depuis la fenêtre de notification, etc.
    void window.api
      .getPendingUpdate()
      .then((pending) => {
        if (cancelled || !pending) return;
        if (pending.state === 'downloading') {
          downloadTargetRef.current = pending.version;
          setPercent(pending.percent);
          setStatus({ kind: 'downloading', version: pending.version });
        } else if (pending.state === 'downloaded') {
          setStatus({ kind: 'downloaded', version: pending.version });
        } else {
          setStatus({ kind: 'available', version: pending.version });
        }
      })
      .catch(() => {
        // Sans importance : le bouton de vérification reste disponible.
      });

    // Tant que cette section est visible, UpdateNotifier n'ouvre aucune
    // fenêtre : le résultat s'affiche ici, une seule fois.
    const unregister = registerUpdatesPanel(() => {
      const el = rootRef.current;
      return el !== null && el.isConnected && el.getClientRects().length > 0;
    });

    const unsubs = [
      window.api.onUpdateAvailable((info) => {
        clearTimer();
        setRetryVersion('');
        setStatus({ kind: 'available', version: info.version });
      }),
      window.api.onUpdateNotAvailable(() => {
        clearTimer();
        setStatus({ kind: 'upToDate' });
      }),
      window.api.onUpdateDownloadProgress((info) => {
        clearTimer();
        downloadTargetRef.current = info.version;
        setRetryVersion('');
        setPercent(info.percent);
        setStatus({ kind: 'downloading', version: info.version });
      }),
      window.api.onUpdateDownloaded((info) => {
        clearTimer();
        setStatus({ kind: 'downloaded', version: info.version });
      }),
      window.api.onUpdateError((message, during) => {
        clearTimer();
        setRetryVersion(during === 'download' ? downloadTargetRef.current : '');
        setStatus({ kind: 'error', message });
      })
    ];

    return () => {
      cancelled = true;
      clearTimer();
      unregister();
      unsubs.forEach((unsub) => unsub());
    };
  }, [open]);

  const check = async (): Promise<void> => {
    clearTimer();
    setRetryVersion('');
    setStatus({ kind: 'checking' });
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setStatus((current) =>
        current.kind === 'checking' ? { kind: 'error', message: '' } : current
      );
    }, CHECK_TIMEOUT_MS);
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      clearTimer();
      setStatus({ kind: 'error', message: errorText(error) });
    }
  };

  const download = async (target: string): Promise<void> => {
    downloadTargetRef.current = target;
    setRetryVersion('');
    setPercent(0);
    setStatus({ kind: 'downloading', version: target });
    try {
      // La suite (progression, fin, échec) arrive par les événements du main.
      await window.api.confirmUpdateDownload();
    } catch (error) {
      setRetryVersion(target);
      setStatus({ kind: 'error', message: errorText(error) });
    }
  };

  let statusText = '';
  let detail = '';
  if (status.kind === 'checking') statusText = t('updateChecking');
  else if (status.kind === 'upToDate') statusText = t('updateStatusUpToDate');
  else if (status.kind === 'available')
    statusText = t('updateStatusAvailable', { version: status.version });
  else if (status.kind === 'downloading')
    statusText = t('updateStatusDownloading', { percent: String(percent) });
  else if (status.kind === 'downloaded')
    statusText = t('updateStatusDownloaded', { version: status.version });
  else if (status.kind === 'error') {
    statusText = retryVersion ? t('updateDownloadFailed') : t('updateCheckError');
    detail = status.message;
  }

  const availableVersion = status.kind === 'available' ? status.version : '';
  const retryTarget = status.kind === 'error' ? retryVersion : '';
  const busy = status.kind === 'checking' || status.kind === 'downloading';

  return (
    <div
      ref={rootRef}
      className="settings-section"
      style={{ borderBottom: 'none', marginBottom: 0 }}
    >
      <h4 className="settings-section-title">
        {t('settingsSectionUpdates')}
      </h4>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {version
            ? t('updateInstalledVersion') + ' v' + version
            : ''}
        </span>

        <button type="button" disabled={busy} onClick={() => void check()}>
          {t('checkUpdatesMenuBtn')}
        </button>
      </div>

      {statusText && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10
          }}
        >
          <div style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            <div>{statusText}</div>
            {status.kind === 'downloading' && (
              <div
                className="update-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="update-progress-bar" style={{ width: percent + '%' }} />
              </div>
            )}
            {detail && (
              <div style={{ marginTop: 2, fontSize: 12, overflowWrap: 'anywhere' }}>{detail}</div>
            )}
          </div>

          {availableVersion && (
            <button type="button" onClick={() => void download(availableVersion)}>
              {t('updateDownloadBtn')}
            </button>
          )}

          {retryTarget && (
            <button type="button" onClick={() => void download(retryTarget)}>
              {t('updateRetryBtn')}
            </button>
          )}

          {status.kind === 'downloaded' && (
            <button type="button" onClick={() => void window.api.quitAndInstall()}>
              {t('updateRestartNowBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Aperçu du texte ----------

export interface ReadingPreviewProps {
  fontFamily: string;
  lineHeight: number;
  /** Largeur de la page d'écriture (px). */
  width: number;
}

/** Plus grande largeur proposée : elle occupe toute la largeur de l'aperçu. */
const PREVIEW_MAX_WIDTH = 1300;

/**
 * Paragraphe d'exemple affiché avec la police et l'interligne choisis, sur
 * une page aux couleurs du thème ; la largeur de la page est représentée à
 * l'échelle.
 */
export function ReadingPreview({
  fontFamily,
  lineHeight,
  width
}: ReadingPreviewProps): ReactElement {
  const { t } = useI18n();
  const ratio = Math.min(1, Math.max(0.3, width / PREVIEW_MAX_WIDTH));

  return (
    <div className="wb-form-group">
      <label className="wb-label">{t('settingsPreviewLabel')}</label>
      <div className="settings-preview">
        <div
          className="settings-preview-page"
          style={{ width: `${Math.round(ratio * 100)}%`, fontFamily, lineHeight }}
        >
          <p>{t('settingsPreviewSample')}</p>
        </div>
        <div className="settings-preview-width">{width} px</div>
      </div>
    </div>
  );
}

// ---------- Sauvegardes (éditeur uniquement) ----------

/** Longueur maximale du nom d'une version (identique au processus principal). */
const VERSION_LABEL_MAX = 80;

export interface BackupsSectionProps {
  open: boolean;
  /** Projet dont on affiche les sauvegardes et les versions. */
  projectName: Parameters<typeof window.api.listBackups>[0];
  /** Restaure une sauvegarde ou une version (fourni par l'éditeur). */
  onRestore: (fileName: string) => unknown;
  /** Appelé après une restauration réussie (ferme les paramètres). */
  onRestored?: () => void;
  /** Crée une version nommée (fourni par l'éditeur). */
  onCreateVersion?: (label: string) => Promise<unknown>;
  /** Données actuelles du projet (comparaison dans l'aperçu). */
  getCurrentData?: () => ProjectData;
  /** Ajoute la copie d'un chapitre récupéré ; renvoie le nom de la copie. */
  onRecoverChapter?: (name: string, html: string, suffix: string) => string | null;
}

export function BackupsSection({
  open,
  projectName,
  onRestore,
  onRestored,
  onCreateVersion,
  getCurrentData,
  onRecoverChapter
}: BackupsSectionProps): ReactElement {
  const { t, lang } = useI18n();
  const { showInfo, showConfirm } = useDialogs();
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [versionLabel, setVersionLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<BackupEntry | null>(null);

  // La fenêtre se referme : retour à la liste à la prochaine ouverture.
  useEffect(() => {
    if (!open) setPreview(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBackups(null);

    void (async () => {
      try {
        const list = await window.api.listBackups(projectName);
        if (!cancelled) setBackups(list);
      } catch (err) {
        console.error('Erreur ouverture sauvegardes:', err);
        if (!cancelled) showInfo(t('backupRestoreError') + describeError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectName, reloadKey, showInfo, t]);

  const formatDate = (iso: string | null): string => {
    if (!iso) return t('unknownDate');
    const d = new Date(iso);
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const restore = async (backup: BackupEntry): Promise<void> => {
    const date = formatDate(backup.savedAt);
    const message =
      backup.kind === 'named'
        ? t('backupConfirmRestoreVersion', {
            name: backup.label || t('backupUnnamedVersion'),
            date
          })
        : t('backupConfirmRestore', { date });
    if (!(await showConfirm(message))) return;
    try {
      await onRestore(backup.fileName);
      onRestored?.();
      showInfo(t('backupRestoreSuccess'));
    } catch (err) {
      console.error(err);
      showInfo(t('backupRestoreError') + describeError(err));
    }
  };

  const createVersion = async (): Promise<void> => {
    if (!onCreateVersion || creating) return;
    const label = versionLabel.replace(/\s+/g, ' ').trim();
    if (!label) {
      showInfo(t('backupVersionNameRequired'));
      return;
    }
    setCreating(true);
    try {
      await onCreateVersion(label);
      setVersionLabel('');
      setReloadKey((key) => key + 1);
      showInfo(t('backupVersionCreated', { name: label }));
    } catch (err) {
      console.error(err);
      showInfo(t('backupVersionCreateError') + describeError(err));
    } finally {
      setCreating(false);
    }
  };

  const removeVersion = async (backup: BackupEntry): Promise<void> => {
    const name = backup.label || formatDate(backup.savedAt);
    if (!(await showConfirm(t('backupConfirmDeleteVersion', { name })))) return;
    try {
      await window.api.deleteNamedVersion(projectName, backup.fileName);
      setReloadKey((key) => key + 1);
    } catch (err) {
      console.error(err);
      showInfo(t('backupDeleteVersionError') + describeError(err));
    }
  };

  const versions = backups ? backups.filter((backup) => backup.kind === 'named') : null;
  const automatic = backups ? backups.filter((backup) => backup.kind !== 'named') : null;

  if (preview && getCurrentData) {
    const shown = preview;
    return (
      <BackupPreview
        projectName={projectName}
        backup={shown}
        title={shown.kind === 'named' ? shown.label || t('backupUnnamedVersion') : formatDate(shown.savedAt)}
        dateText={formatDate(shown.savedAt)}
        getCurrentData={getCurrentData}
        onBack={() => setPreview(null)}
        onRestore={() => void restore(shown)}
        onRecoverChapter={onRecoverChapter}
      />
    );
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">{t('backupVersionsTitle')}</h4>
      <p className="backup-section-hint">{t('backupVersionsDescription')}</p>
      {onCreateVersion && (
        <div className="backup-version-form">
          <input
            type="text"
            value={versionLabel}
            maxLength={VERSION_LABEL_MAX}
            placeholder={t('backupVersionPlaceholder')}
            disabled={creating}
            onChange={(e) => setVersionLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void createVersion();
              }
            }}
          />
          <button type="button" disabled={creating} onClick={() => void createVersion()}>
            {t('backupCreateVersionBtn')}
          </button>
        </div>
      )}
      <ul className="item-list backup-list">
        {versions === null ? (
          <li className="backup-empty">{t('loadingBackups')}</li>
        ) : versions.length === 0 ? (
          <li className="backup-empty">{t('backupNoVersionYet')}</li>
        ) : (
          versions.map((backup) => (
            <li className="backup-item" key={backup.fileName}>
              <span className="backup-item-text">
                <span className="backup-item-label">
                  {backup.label || t('backupUnnamedVersion')}
                </span>
                <span className="backup-item-date">{formatDate(backup.savedAt)}</span>
              </span>
              <span className="backup-item-actions">
                {getCurrentData && (
                  <button type="button" onClick={() => setPreview(backup)}>
                    {t('backupPreviewBtn')}
                  </button>
                )}
                <button className="btn-restore-backup" onClick={() => void restore(backup)}>
                  {t('backupRestoreBtn')}
                </button>
                <button className="danger" onClick={() => void removeVersion(backup)}>
                  {t('backupDeleteVersionBtn')}
                </button>
              </span>
            </li>
          ))
        )}
      </ul>

      <h4 className="settings-section-title">{t('backupsModalTitle')}</h4>
      <p className="backup-section-hint">{t('backupsDescription')}</p>
      <ul id="backupsList" className="item-list backup-list">
        {automatic === null ? (
          <li className="backup-empty">{t('loadingBackups')}</li>
        ) : automatic.length === 0 ? (
          <li className="backup-empty">{t('backupNoneYet')}</li>
        ) : (
          automatic.map((backup) => (
            <li className="backup-item" key={backup.fileName}>
              <span>{formatDate(backup.savedAt)}</span>
              <span className="backup-item-actions">
                {getCurrentData && (
                  <button type="button" onClick={() => setPreview(backup)}>
                    {t('backupPreviewBtn')}
                  </button>
                )}
                <button className="btn-restore-backup" onClick={() => void restore(backup)}>
                  {t('backupRestoreBtn')}
                </button>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---------- Aide : raccourcis clavier ----------

/** Raccourcis affichés dans l'onglet Aide. */
const SHORTCUTS: { labelKey: TranslationKey; kbd?: string; kbdKey?: TranslationKey }[] = [
  { labelKey: 'shortcutSave', kbd: 'Ctrl+S' },
  { labelKey: 'shortcutUndo', kbd: 'Ctrl+Z' },
  { labelKey: 'shortcutRedo', kbd: 'Ctrl+Y' },
  { labelKey: 'shortcutBold', kbd: 'Ctrl+B' },
  { labelKey: 'shortcutItalic', kbd: 'Ctrl+I' },
  { labelKey: 'shortcutUnderline', kbd: 'Ctrl+U' },
  { labelKey: 'shortcutAlign', kbd: 'Ctrl+L / Ctrl+E / Ctrl+R / Ctrl+J' },
  { labelKey: 'shortcutAccents', kbdKey: 'kbdAccents' },
  { labelKey: 'shortcutReplace', kbd: 'Ctrl+F' },
  { labelKey: 'shortcutGlobalSearch', kbdKey: 'kbdGlobalSearch' },
  { labelKey: 'shortcutSwitchTab', kbdKey: 'kbdSwitchTab' },
  { labelKey: 'shortcutZoomKeys', kbd: 'Ctrl++ / Ctrl+- / Ctrl+0' },
  { labelKey: 'shortcutZoom', kbdKey: 'kbdZoomWheel' },
  { labelKey: 'shortcutWbOpen', kbdKey: 'kbdCtrlClick' },
  { labelKey: 'shortcutCloseTab', kbdKey: 'kbdDelete' },
  { labelKey: 'shortcutMiddleClose', kbdKey: 'kbdMiddleClick' },
  { labelKey: 'shortcutNavigate', kbd: 'Tab' },
  { labelKey: 'shortcutActivate', kbdKey: 'kbdActivate' },
  { labelKey: 'shortcutCloseModal', kbdKey: 'kbdEscape' }
];

export function HelpSection(): ReactElement {
  const { t } = useI18n();

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">{t('helpModalTitle')}</h4>
      <ul className="shortcut-list">
        {SHORTCUTS.map((item) => (
          <li key={item.labelKey}>
            <span>{t(item.labelKey)}</span>
            <kbd>{item.kbdKey ? t(item.kbdKey) : item.kbd}</kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
