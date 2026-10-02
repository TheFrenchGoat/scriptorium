// src/renderer/components/editor/modals/SettingsModal.tsx
// Fenêtre des paramètres de Scriptorium : apparence, correction,
// minuteur, suivi des sessions d'écriture et mises à jour.

import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import {
  playTimerSound,
  TIMER_SOUND_IDS,
  type TimerSoundId
} from '../../../lib/sound';
import type { EditorController } from '../useEditorController';
import type {
  LanguageCode,
  SessionRatingScale,
  ThemeName
} from '../../../../shared/types';
import type { TranslationKey } from '../../../i18n';

export interface SettingsModalProps {
  open: boolean;
  controller: EditorController;
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
  onOpenGrammarSetup: () => void;
  onClose: () => void;
}

const THEMES: { value: ThemeName; key: TranslationKey }[] = [
  { value: 'dark', key: 'themeDark' },
  { value: 'light', key: 'themeLight' },
  { value: 'sepia', key: 'themeSepia' },
  { value: 'midnight', key: 'themeMidnight' },
  { value: 'forest', key: 'themeForest' },
  { value: 'contrast', key: 'themeContrast' },
  { value: 'rose', key: 'themeRose' },
  { value: 'lavender', key: 'themeLavender' },
  { value: 'ocean', key: 'themeOcean' }
];

const TIMER_SOUND_LABEL_KEYS: Record<TimerSoundId, TranslationKey> = {
  chime: 'timerSoundChime',
  bell: 'timerSoundBell',
  soft: 'timerSoundSoft',
  alarm: 'timerSoundAlarm'
};

const WIDTHS = [
  { value: 650, key: 'prefWidthNarrow' as const },
  { value: 800, key: 'prefWidthNormal' as const },
  { value: 1000, key: 'prefWidthLarge' as const },
  { value: 1300, key: 'prefWidthXLarge' as const }
];

const READING_FONTS = [
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Merriweather', serif", label: 'Merriweather' }
];

const LINE_HEIGHTS = [
  { value: 1.4, key: 'prefLineCompact' as const },
  { value: 1.6, key: 'prefLineNormal' as const },
  { value: 1.8, key: 'prefLineAiry' as const },
  { value: 2.2, key: 'prefLineVeryAiry' as const }
];

const UI_SIZES = [
  { value: 12, key: 'prefUiSizeSmall' as const },
  { value: 14, key: 'prefUiSizeNormal' as const },
  { value: 16, key: 'prefUiSizeLarge' as const },
  { value: 18, key: 'prefUiSizeXLarge' as const }
];

const UI_FONTS = [
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Segoe UI', sans-serif", label: 'Segoe UI' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' }
];

const SESSION_RATING_SCALES: SessionRatingScale[] = [5, 10, 20];

function normalizeSessionRatingScale(
  value: number | undefined
): SessionRatingScale {
  if (value === 5 || value === 20) return value;
  return 10;
}

export function SettingsModal({
  open,
  controller,
  theme,
  onChangeTheme,
  onOpenGrammarSetup,
  onClose
}: SettingsModalProps): React.ReactElement {
  const { t, lang, changeLanguage } = useI18n();
  const prefs = controller.prefs();
  const grammarPrefs = controller.grammarPrefs();
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!open) return;

    void window.api
      .getAppVersion()
      .then((value) => setVersion(value))
      .catch((error) => {
        console.error(
          "Impossible de récupérer la version de l'application :",
          error
        );
        setVersion('');
      });
  }, [open]);

  const patchPrefs = (patch: Partial<typeof prefs>): void => {
    controller.updatePrefs({
      ...prefs,
      ...patch
    });
  };

  const concentrationScale = normalizeSessionRatingScale(
    prefs.sessionConcentrationScale
  );

  const energyScale = normalizeSessionRatingScale(
    prefs.sessionEnergyScale
  );

  return (
    <Modal
      open={open}
      title={t('settingsModalTitle')}
      width={460}
      maxHeight="85vh"
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      <div className="settings-section">
        <h4 className="settings-section-title">
          {t('settingsSectionAppearance')}
        </h4>

        <div className="wb-form-group">
          <label className="wb-label">{t('themeSubmenuLabel')}</label>

          <div className="settings-choice-grid">
            {THEMES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={`settings-choice-btn${
                  theme === choice.value ? ' active' : ''
                }`}
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
            {(['fr', 'en'] as LanguageCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`settings-choice-btn${
                  lang === code ? ' active' : ''
                }`}
                onClick={() => changeLanguage(code)}
              >
                {t(code === 'fr' ? 'langFr' : 'langEn')}
              </button>
            ))}
          </div>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">{t('prefWidthLabel')}</label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            value={prefs.width}
            onChange={(event) =>
              patchPrefs({
                width: parseInt(event.target.value, 10)
              })
            }
          >
            {WIDTHS.map((width) => (
              <option key={width.value} value={width.value}>
                {t(width.key)}
              </option>
            ))}
          </select>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">{t('prefFontLabel')}</label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            value={prefs.fontFamily ?? "'Roboto', sans-serif"}
            onChange={(event) =>
              patchPrefs({
                fontFamily: event.target.value
              })
            }
          >
            {READING_FONTS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">
            {t('prefLineHeightLabel')}
          </label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            value={prefs.lineHeight ?? 1.6}
            onChange={(event) =>
              patchPrefs({
                lineHeight: parseFloat(event.target.value)
              })
            }
          >
            {LINE_HEIGHTS.map((lineHeight) => (
              <option
                key={lineHeight.value}
                value={lineHeight.value}
              >
                {t(lineHeight.key)}
              </option>
            ))}
          </select>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">
            {t('prefUiFontSizeLabel')}
          </label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            value={prefs.uiFontSize ?? 14}
            onChange={(event) =>
              patchPrefs({
                uiFontSize: parseInt(event.target.value, 10)
              })
            }
          >
            {UI_SIZES.map((size) => (
              <option key={size.value} value={size.value}>
                {t(size.key)}
              </option>
            ))}
          </select>
        </div>

        <div
          className="wb-form-group"
          style={{ marginBottom: 0 }}
        >
          <label className="wb-label">
            {t('prefUiFontLabel')}
          </label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            value={prefs.uiFontFamily ?? "'Roboto', sans-serif"}
            onChange={(event) =>
              patchPrefs({
                uiFontFamily: event.target.value
              })
            }
          >
            {UI_FONTS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section-title">
          {t('settingsSectionCorrection')}
        </h4>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={controller.nativeSpellcheckEnabled()}
            onChange={(event) => {
              void controller.setNativeSpellcheck(
                event.target.checked
              );
            }}
          />

          <span>{t('nativeSpellcheckLabel')}</span>
        </label>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={grammarPrefs.enabled}
            onChange={(event) => {
              void controller.setGrammarEnabled(
                event.target.checked
              );
            }}
          />

          <span>{t('grammarToggleLabel')}</span>
        </label>

        <button
          type="button"
          style={{
            width: '100%',
            marginTop: 4
          }}
          onClick={() => {
            onClose();
            onOpenGrammarSetup();
          }}
        >
          {t('grammarConfigureBtn')}
        </button>
      </div>

      <div className="settings-section">
        <h4 className="settings-section-title">
          {t('settingsSectionTimer')}
        </h4>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={prefs.timerSoundEnabled !== false}
            onChange={(event) =>
              patchPrefs({
                timerSoundEnabled: event.target.checked
              })
            }
          />

          <span>{t('timerSoundEnabledLabel')}</span>
        </label>

        <div
          className="wb-form-group"
          style={{ marginTop: 10 }}
        >
          <label className="wb-label">
            {t('timerSoundChoiceLabel')}
          </label>

          <select
            className="modal-dropdown-btn"
            style={{ width: '100%' }}
            disabled={prefs.timerSoundEnabled === false}
            value={
              (prefs.timerSoundId as TimerSoundId) || 'chime'
            }
            onChange={(event) =>
              patchPrefs({
                timerSoundId: event.target.value
              })
            }
          >
            {TIMER_SOUND_IDS.map((id) => (
              <option key={id} value={id}>
                {t(TIMER_SOUND_LABEL_KEYS[id])}
              </option>
            ))}
          </select>
        </div>

        <div
          className="wb-form-group"
          style={{
            marginTop: 10,
            marginBottom: 0
          }}
        >
          <label className="wb-label">
            {t('timerVolumeLabel')}
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={prefs.timerSoundEnabled === false}
              value={prefs.timerVolume ?? 0.5}
              onChange={(event) =>
                patchPrefs({
                  timerVolume: parseFloat(event.target.value)
                })
              }
              style={{ flex: 1 }}
            />

            <button
              type="button"
              disabled={prefs.timerSoundEnabled === false}
              onClick={() =>
                playTimerSound(
                  (prefs.timerSoundId as TimerSoundId) ||
                    'chime',
                  prefs.timerVolume ?? 0.5
                )
              }
            >
              {t('timerVolumeTestBtn')}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section-title">
          {t('settingsSectionSessions')}
        </h4>

        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 16
          }}
        >
          {t('sessionScaleDescription')}
        </p>

        <div className="wb-form-group">
          <label className="wb-label">
            {t('sessionConcentrationScaleLabel')}
          </label>

          <div className="settings-choice-row">
            {SESSION_RATING_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`settings-choice-btn${
                  concentrationScale === scale ? ' active' : ''
                }`}
                onClick={() =>
                  patchPrefs({
                    sessionConcentrationScale: scale
                  })
                }
              >
                /{scale}
              </button>
            ))}
          </div>
        </div>

        <div
          className="wb-form-group"
          style={{ marginBottom: 0 }}
        >
          <label className="wb-label">
            {t('sessionEnergyScaleLabel')}
          </label>

          <div className="settings-choice-row">
            {SESSION_RATING_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`settings-choice-btn${
                  energyScale === scale ? ' active' : ''
                }`}
                onClick={() =>
                  patchPrefs({
                    sessionEnergyScale: scale
                  })
                }
              >
                /{scale}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="settings-section"
        style={{
          borderBottom: 'none',
          marginBottom: 0
        }}
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
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: 13
            }}
          >
            {version ? `v${version}` : ''}
          </span>

          <button
            type="button"
            onClick={() => {
              void window.api.checkForUpdates();
            }}
          >
            {t('checkUpdatesMenuBtn')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
