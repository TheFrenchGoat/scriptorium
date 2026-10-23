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
import type { ThemeName } from '../../../../shared/types';
import {
  LINE_HEIGHTS,
  normalizeSessionRatingScale,
  READING_FONTS,
  SESSION_RATING_SCALES,
  TIMER_SOUND_LABEL_KEYS,
  WIDTHS
} from '../../../lib/settings-options';
import {
  CorrectionSection,
  ReadingPreview,
  ThemeLanguageFields,
  UiFontFields,
  UpdatesSection
} from '../../settings/SettingsSections';
import {
  SettingsTabsLayout,
  useSettingsTab,
  type SettingsTabDef
} from '../../settings/SettingsTabs';

type EditorSettingsTab =
  | 'appearance'
  | 'writing'
  | 'correction'
  | 'timer'
  | 'sessions'
  | 'updates';

/** Onglets de la fenêtre, dans l'ordre d'affichage. */
const EDITOR_TABS: SettingsTabDef<EditorSettingsTab>[] = [
  { id: 'appearance', labelKey: 'settingsSectionAppearance' },
  { id: 'writing', labelKey: 'settingsSectionWriting' },
  { id: 'correction', labelKey: 'settingsSectionCorrection' },
  { id: 'timer', labelKey: 'settingsSectionTimer' },
  { id: 'sessions', labelKey: 'settingsSectionSessions' },
  { id: 'updates', labelKey: 'settingsSectionUpdates' }
];

export interface SettingsModalProps {
  open: boolean;
  controller: EditorController;
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
  onOpenGrammarSetup: () => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  controller,
  theme,
  onChangeTheme,
  onOpenGrammarSetup,
  onClose
}: SettingsModalProps): React.ReactElement {
  const { t } = useI18n();
  const [tab, setTab] = useSettingsTab('scriptorium.settingsTab.editor', EDITOR_TABS);
  const prefs = controller.prefs();
  const grammarPrefs = controller.grammarPrefs();

  // Correction exigeante (level=picky de LanguageTool) : activée par défaut.
  // Lue directement dans les réglages enregistrés (elle a pu être modifiée
  // depuis l'accueil) ; le processus principal la relit à chaque
  // vérification, l'éditeur n'a donc rien d'autre à faire.
  const [picky, setPicky] = useState(true);

  useEffect(() => {
    if (!open) return;

    void window.api
      .getGrammarPrefs()
      .then((value) => setPicky(value.picky !== false))
      .catch((error) => {
        console.error(
          'Impossible de lire les réglages du correcteur :',
          error
        );
      });
  }, [open]);

  const patchPrefs = (patch: Partial<typeof prefs>): void => {
    controller.updatePrefs({
      ...prefs,
      ...patch
    });
  };

  const togglePicky = (value: boolean): void => {
    setPicky(value);
    void window.api.saveGrammarPrefs({ picky: value });
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
      width="min(720px, 95vw)"
      maxHeight="90vh"
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      <SettingsTabsLayout tabs={EDITOR_TABS} active={tab} onSelect={setTab}>
        {tab === 'appearance' && (
          <div className="settings-section">
            <h4 className="settings-section-title">
              {t('settingsSectionAppearance')}
            </h4>

            <ThemeLanguageFields
              theme={theme}
              onChangeTheme={onChangeTheme}
            />

            <UiFontFields
              uiFontSize={prefs.uiFontSize ?? 14}
              uiFontFamily={prefs.uiFontFamily ?? "'Roboto', sans-serif"}
              onChange={patchPrefs}
            />
          </div>
        )}

        {tab === 'writing' && (
          <div className="settings-section">
            <h4 className="settings-section-title">
              {t('settingsSectionWriting')}
            </h4>

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
                style={{ width: '100%', fontFamily: prefs.fontFamily ?? "'Roboto', sans-serif" }}
                value={prefs.fontFamily ?? "'Roboto', sans-serif"}
                onChange={(event) =>
                  patchPrefs({
                    fontFamily: event.target.value
                  })
                }
              >
                {READING_FONTS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
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

            <ReadingPreview
              fontFamily={prefs.fontFamily ?? "'Roboto', sans-serif"}
              lineHeight={prefs.lineHeight ?? 1.6}
              width={prefs.width ?? 800}
            />
          </div>
        )}

        {tab === 'correction' && (
          <CorrectionSection
            grammarEnabled={grammarPrefs.enabled}
            onToggleGrammar={(enabled) => {
              void (async () => {
                await controller.setGrammarEnabled(enabled);

                // Précaution : si le contrôleur enregistre ses préférences
                // gardées en mémoire, il pourrait remettre une ancienne
                // valeur de « Correction exigeante ». On réaffirme donc le
                // choix affiché dans cette fenêtre.
                await window.api.saveGrammarPrefs({ picky });
              })();
            }}
            picky={picky}
            onTogglePicky={togglePicky}
            nativeSpellcheck={{
              enabled: controller.nativeSpellcheckEnabled(),
              onToggle: (enabled) => {
                void controller.setNativeSpellcheck(enabled);
              }
            }}
            onConfigureGrammar={() => {
              onClose();
              onOpenGrammarSetup();
            }}
          />
        )}

        {tab === 'timer' && (
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
        )}

        {tab === 'sessions' && (
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
        )}

        {tab === 'updates' && <UpdatesSection open={open} />}
      </SettingsTabsLayout>
    </Modal>
  );
}
