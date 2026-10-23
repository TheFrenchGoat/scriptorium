// src/renderer/components/settings/SettingsSections.tsx
// Sections communes aux deux fenêtres « Paramètres » (accueil et éditeur) :
// thème et langue, police de l'interface, correction et mises à jour.
// Chaque fenêtre fournit les valeurs et la façon de les enregistrer ;
// l'affichage est ainsi identique partout.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useI18n, type TranslationKey } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { describeError } from '../../lib/errors';
import { THEMES, UI_FONTS, UI_SIZES } from '../../lib/settings-options';
import type { BackupEntry, LanguageCode, ThemeName } from '../../../shared/types';

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
        <select
          className="modal-dropdown-btn"
          style={{ width: '100%' }}
          value={uiFontFamily}
          onChange={(event) => onChange({ uiFontFamily: event.target.value })}
        >
          {UI_FONTS.map((font) => (
            <option
              key={font.value}
              value={font.value}
              style={{ fontFamily: font.value }}
            >
              {font.label}
            </option>
          ))}
        </select>
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
 * UpdateNotifier les reçoit aussi et affiche ses propres fenêtres.
 */
export function UpdatesSection({ open }: UpdatesSectionProps): ReactElement {
  const { t } = useI18n();
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const timerRef = useRef<number | null>(null);

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

    // Mise à jour déjà trouvée (par exemple au démarrage) avant l'ouverture.
    void window.api
      .getPendingUpdate()
      .then((pending) => {
        if (!cancelled && pending) {
          setStatus({ kind: 'available', version: pending.version });
        }
      })
      .catch(() => {
        // Sans importance : le bouton de vérification reste disponible.
      });

    const unsubs = [
      window.api.onUpdateAvailable((info) => {
        clearTimer();
        setStatus({ kind: 'available', version: info.version });
      }),
      window.api.onUpdateNotAvailable(() => {
        clearTimer();
        setStatus({ kind: 'upToDate' });
      }),
      window.api.onUpdateDownloaded((info) => {
        clearTimer();
        setStatus({ kind: 'downloaded', version: info.version });
      }),
      window.api.onUpdateError((message) => {
        clearTimer();
        setStatus({ kind: 'error', message });
      })
    ];

    return () => {
      cancelled = true;
      clearTimer();
      unsubs.forEach((unsub) => unsub());
    };
  }, [open]);

  const check = async (): Promise<void> => {
    clearTimer();
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
    setStatus({ kind: 'downloading', version: target });
    try {
      await window.api.confirmUpdateDownload();
      setStatus({ kind: 'downloaded', version: target });
    } catch (error) {
      setStatus({ kind: 'error', message: errorText(error) });
    }
  };

  let statusText = '';
  let detail = '';
  if (status.kind === 'checking') statusText = t('updateChecking');
  else if (status.kind === 'upToDate') statusText = t('updateStatusUpToDate');
  else if (status.kind === 'available')
    statusText = t('updateStatusAvailable', { version: status.version });
  else if (status.kind === 'downloading') statusText = t('updateStatusDownloading');
  else if (status.kind === 'downloaded')
    statusText = t('updateStatusDownloaded', { version: status.version });
  else if (status.kind === 'error') {
    statusText = t('updateCheckError');
    detail = status.message;
  }

  const availableVersion = status.kind === 'available' ? status.version : '';
  const busy = status.kind === 'checking' || status.kind === 'downloading';

  return (
    <div
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
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <div>{statusText}</div>
            {detail && <div style={{ marginTop: 2, fontSize: 12 }}>{detail}</div>}
          </div>

          {availableVersion && (
            <button type="button" onClick={() => void download(availableVersion)}>
              {t('updateDownloadBtn')}
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

export interface BackupsSectionProps {
  open: boolean;
  /** Projet dont on affiche les sauvegardes automatiques. */
  projectName: Parameters<typeof window.api.listBackups>[0];
  /** Restaure une sauvegarde (fourni par l'éditeur). */
  onRestore: (fileName: string) => unknown;
  /** Appelé après une restauration réussie (ferme les paramètres). */
  onRestored?: () => void;
}

export function BackupsSection({
  open,
  projectName,
  onRestore,
  onRestored
}: BackupsSectionProps): ReactElement {
  const { t, lang } = useI18n();
  const { showInfo, showConfirm } = useDialogs();
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);

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
  }, [open, projectName, showInfo, t]);

  const formatDate = (iso: string | null): string => {
    if (!iso) return t('unknownDate');
    const d = new Date(iso);
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const restore = async (backup: BackupEntry): Promise<void> => {
    if (!(await showConfirm(t('backupConfirmRestore', { date: formatDate(backup.savedAt) })))) return;
    try {
      await onRestore(backup.fileName);
      onRestored?.();
      showInfo(t('backupRestoreSuccess'));
    } catch (err) {
      console.error(err);
      showInfo(t('backupRestoreError') + describeError(err));
    }
  };

  return (
    <div className="settings-section">
      <h4 className="settings-section-title">{t('backupsModalTitle')}</h4>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 15 }}>
        {t('backupsDescription')}
      </p>
      <ul
        id="backupsList"
        className="item-list"
        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
      >
        {backups === null ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('loadingBackups')}</li>
        ) : backups.length === 0 ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('backupNoneYet')}</li>
        ) : (
          backups.map((backup) => (
            <li className="backup-item" key={backup.fileName}>
              <span>{formatDate(backup.savedAt)}</span>
              <button className="btn-restore-backup" onClick={() => void restore(backup)}>
                {t('backupRestoreBtn')}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---------- Aide : raccourcis clavier ----------

/** Raccourcis affichés dans l'onglet Aide. */
const SHORTCUTS: { labelKey: TranslationKey; kbd: string }[] = [
  { labelKey: 'shortcutSave', kbd: 'Ctrl+S' },
  { labelKey: 'shortcutUndo', kbd: 'Ctrl+Z' },
  { labelKey: 'shortcutRedo', kbd: 'Ctrl+Y' },
  { labelKey: 'shortcutBold', kbd: 'Ctrl+B' },
  { labelKey: 'shortcutItalic', kbd: 'Ctrl+I' },
  { labelKey: 'shortcutUnderline', kbd: 'Ctrl+U' },
  { labelKey: 'shortcutAlign', kbd: 'Ctrl+L / Ctrl+E / Ctrl+R / Ctrl+J' },
  { labelKey: 'shortcutAccents', kbd: 'Ctrl+` Ctrl+\' Ctrl+Maj+^ Ctrl+Maj+: Ctrl+,' },
  { labelKey: 'shortcutReplace', kbd: 'Ctrl+F' },
  { labelKey: 'shortcutGlobalSearch', kbd: 'Ctrl+Maj+F' },
  { labelKey: 'shortcutSwitchTab', kbd: 'Ctrl+Tab / Ctrl+Maj+Tab' },
  { labelKey: 'shortcutZoomKeys', kbd: 'Ctrl++ / Ctrl+- / Ctrl+0' },
  { labelKey: 'shortcutZoom', kbd: 'Ctrl+Molette' },
  { labelKey: 'shortcutWbOpen', kbd: 'Ctrl+Clic' },
  { labelKey: 'shortcutCloseTab', kbd: 'Delete' },
  { labelKey: 'shortcutMiddleClose', kbd: 'Clic molette' },
  { labelKey: 'shortcutNavigate', kbd: 'Tab' },
  { labelKey: 'shortcutActivate', kbd: 'Entrée / Espace' },
  { labelKey: 'shortcutCloseModal', kbd: 'Échap' }
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
            <kbd>{item.kbd}</kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
