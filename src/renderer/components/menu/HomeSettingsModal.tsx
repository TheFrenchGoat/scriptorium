// src/renderer/components/menu/HomeSettingsModal.tsx
// FENÊTRE « PARAMÈTRES » DE LA PAGE D'ACCUEIL
//
// Ne contient que les réglages généraux, valables pour toute l'application :
// thème, langue de l'interface, police de l'interface, correcteur
// (activation + correction exigeante) et mises à jour.
// Les réglages propres à l'écriture (largeur, police du texte, minuteur...)
// restent dans les paramètres de l'éditeur.

import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useI18n, type TranslationKey } from '../../i18n';
import { applyUiPrefs } from '../../App';
import type { EditorPrefs, ThemeName } from '../../../shared/types';

interface HomeSettingsModalProps {
  open: boolean;
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
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

const UI_SIZES: { value: number; key: TranslationKey }[] = [
  { value: 12, key: 'prefUiSizeSmall' },
  { value: 14, key: 'prefUiSizeNormal' },
  { value: 16, key: 'prefUiSizeLarge' },
  { value: 18, key: 'prefUiSizeXLarge' }
];

const UI_FONTS: { label: string; value: string }[] = [
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Segoe UI', value: "'Segoe UI', sans-serif" },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' }
];

export function HomeSettingsModal({ open, theme, onChangeTheme, onClose }: HomeSettingsModalProps) {
  const { t, lang, changeLanguage } = useI18n();
  const fr = lang === 'fr';

  const [prefs, setPrefs] = useState<EditorPrefs | null>(null);
  const [grammarEnabled, setGrammarEnabled] = useState(false);
  const [picky, setPicky] = useState(true);
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');

  // Chargement des réglages à chaque ouverture (ils ont pu changer dans
  // l'éditeur depuis la dernière fois).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUpdateStatus('idle');

    void (async () => {
      try {
        const [editorPrefs, grammarPrefs, appVersion] = await Promise.all([
          window.api.getEditorPrefs(),
          window.api.getGrammarPrefs(),
          window.api.getAppVersion()
        ]);
        if (cancelled) return;
        setPrefs(editorPrefs);
        setGrammarEnabled(grammarPrefs.enabled);
        // Activée par défaut : seule la valeur false la désactive.
        setPicky(grammarPrefs.picky !== false);
        setVersion(appVersion);
      } catch (err) {
        console.error('[HomeSettings] Chargement des réglages impossible :', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Modifie la police de l'interface : appliquée immédiatement puis enregistrée. */
  const updateUiPrefs = (patch: Partial<EditorPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyUiPrefs(next);
    void window.api.saveEditorPrefs(next);
  };

  const toggleGrammar = (enabled: boolean) => {
    setGrammarEnabled(enabled);
    void window.api.saveGrammarPrefs({ enabled });
  };

  const togglePicky = (value: boolean) => {
    setPicky(value);
    void window.api.saveGrammarPrefs({ picky: value });
  };

  const checkUpdates = async () => {
    setUpdateStatus('checking');
    try {
      await window.api.checkForUpdates();
      setUpdateStatus('done');
    } catch {
      setUpdateStatus('error');
    }
  };

  const updateStatusText =
    updateStatus === 'checking'
      ? fr ? 'Vérification en cours…' : 'Checking…'
      : updateStatus === 'done'
        ? fr ? 'Vérification terminée.' : 'Check complete.'
        : updateStatus === 'error'
          ? fr ? 'Impossible de vérifier les mises à jour.' : 'Unable to check for updates.'
          : '';

  return (
    <Modal
      open={open}
      title={t('settingsModalTitle')}
      width={460}
      maxHeight="85vh"
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      {/* --- APPARENCE --- */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settingsSectionAppearance')}</div>

        <div className="wb-form-group">
          <label className="wb-label">{t('themeSubmenuLabel')}</label>
          <div className="settings-choice-grid">
            {THEMES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={'settings-choice-btn' + (theme === item.value ? ' active' : '')}
                onClick={() => onChangeTheme(item.value)}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">{t('langSubmenuLabel')}</label>
          <div className="settings-choice-row">
            <button
              type="button"
              className={'settings-choice-btn' + (lang === 'fr' ? ' active' : '')}
              onClick={() => changeLanguage('fr')}
            >
              {t('langFr')}
            </button>
            <button
              type="button"
              className={'settings-choice-btn' + (lang === 'en' ? ' active' : '')}
              onClick={() => changeLanguage('en')}
            >
              {t('langEn')}
            </button>
          </div>
        </div>

        {prefs && (
          <>
            <div className="wb-form-group">
              <label className="wb-label">{t('prefUiFontSizeLabel')}</label>
              <div className="settings-choice-row">
                {UI_SIZES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={'settings-choice-btn' + (prefs.uiFontSize === item.value ? ' active' : '')}
                    onClick={() => updateUiPrefs({ uiFontSize: item.value })}
                  >
                    {t(item.key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="wb-form-group">
              <label className="wb-label">{t('prefUiFontLabel')}</label>
              <select
                className="modal-dropdown-btn"
                value={prefs.uiFontFamily}
                onChange={(e) => updateUiPrefs({ uiFontFamily: e.target.value })}
              >
                {UI_FONTS.map((font) => (
                  <option key={font.label} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* --- CORRECTION --- */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settingsSectionCorrection')}</div>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={grammarEnabled}
            onChange={(e) => toggleGrammar(e.target.checked)}
          />
          {t('grammarToggleLabel')}
        </label>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={picky}
            onChange={(e) => togglePicky(e.target.checked)}
          />
          {fr
            ? 'Correction exigeante (style, typographie, répétitions)'
            : 'Picky mode (style, typography, repetitions)'}
        </label>

        <p style={{ opacity: 0.7, fontSize: '0.9em', marginTop: 6 }}>
          {fr
            ? "L'installation de LanguageTool se fait depuis l'éditeur."
            : 'LanguageTool is installed from the editor.'}
        </p>
      </div>

      {/* --- MISES À JOUR --- */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settingsSectionUpdates')}</div>

        <div className="wb-form-group">
          {version && (
            <div style={{ marginBottom: 8 }}>
              {fr ? 'Version installée : ' : 'Installed version: '}v{version}
            </div>
          )}
          <button
            type="button"
            className="modal-dropdown-btn"
            disabled={updateStatus === 'checking'}
            onClick={() => void checkUpdates()}
          >
            {t('checkUpdatesMenuBtn')}
          </button>
          {updateStatusText && <div style={{ marginTop: 6, opacity: 0.8 }}>{updateStatusText}</div>}
        </div>
      </div>
    </Modal>
  );
}
