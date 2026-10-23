// src/renderer/components/settings/SettingsSections.tsx
// Sections communes aux deux fenêtres « Paramètres » (accueil et éditeur) :
// thème et langue, police de l'interface, correction et mises à jour.
// Chaque fenêtre fournit les valeurs et la façon de les enregistrer ;
// l'affichage est ainsi identique partout.

import { useEffect, useState, type ReactElement } from 'react';
import { useI18n } from '../../i18n';
import { THEMES, UI_FONTS, UI_SIZES } from '../../lib/settings-options';
import type { LanguageCode, ThemeName } from '../../../shared/types';

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
                'settings-choice-btn' +
                (theme === choice.value ? ' active' : '')
              }
              onClick={() => onChangeTheme(choice.value)}
            >
              {t(choice.key)}
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
  /** Fenêtre ouverte : la version est relue et l'état remis à zéro. */
  open: boolean;
}

type UpdateStatus = 'idle' | 'checking' | 'done' | 'error';

/** Section « Mises à jour » (dernière section de la fenêtre). */
export function UpdatesSection({ open }: UpdatesSectionProps): ReactElement {
  const { t } = useI18n();
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<UpdateStatus>('idle');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('idle');

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

    return () => {
      cancelled = true;
    };
  }, [open]);

  const check = async (): Promise<void> => {
    setStatus('checking');
    try {
      await window.api.checkForUpdates();
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  const statusText =
    status === 'checking'
      ? t('updateChecking')
      : status === 'done'
        ? t('updateCheckDone')
        : status === 'error'
          ? t('updateCheckError')
          : '';

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

        <button
          type="button"
          disabled={status === 'checking'}
          onClick={() => void check()}
        >
          {t('checkUpdatesMenuBtn')}
        </button>
      </div>

      {statusText && (
        <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>
          {statusText}
        </div>
      )}
    </div>
  );
}
