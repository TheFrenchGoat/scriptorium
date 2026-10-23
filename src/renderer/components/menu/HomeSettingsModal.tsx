// src/renderer/components/menu/HomeSettingsModal.tsx
// FENÊTRE « PARAMÈTRES » DE LA PAGE D'ACCUEIL
//
// Ne contient que les réglages généraux, valables pour toute l'application :
// thème, langue de l'interface, police de l'interface, correcteur
// (activation + correction exigeante) et mises à jour.
// Les réglages propres à l'écriture (largeur, police du texte, minuteur...)
// restent dans les paramètres de l'éditeur.
// Les sections sont partagées avec l'éditeur (components/settings).

import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useI18n } from '../../i18n';
import { applyUiPrefs } from '../../App';
import type { EditorPrefs, ThemeName } from '../../../shared/types';
import {
  CorrectionSection,
  ThemeLanguageFields,
  UiFontFields,
  UpdatesSection
} from '../settings/SettingsSections';

interface HomeSettingsModalProps {
  open: boolean;
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
  onClose: () => void;
}

export function HomeSettingsModal({ open, theme, onChangeTheme, onClose }: HomeSettingsModalProps) {
  const { t } = useI18n();

  const [prefs, setPrefs] = useState<EditorPrefs | null>(null);
  const [grammarEnabled, setGrammarEnabled] = useState(false);
  const [picky, setPicky] = useState(true);

  // Chargement des réglages à chaque ouverture (ils ont pu changer dans
  // l'éditeur depuis la dernière fois).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const [editorPrefs, grammarPrefs] = await Promise.all([
          window.api.getEditorPrefs(),
          window.api.getGrammarPrefs()
        ]);
        if (cancelled) return;
        setPrefs(editorPrefs);
        setGrammarEnabled(grammarPrefs.enabled);
        // Activée par défaut : seule la valeur false la désactive.
        setPicky(grammarPrefs.picky !== false);
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
        <h4 className="settings-section-title">
          {t('settingsSectionAppearance')}
        </h4>

        <ThemeLanguageFields theme={theme} onChangeTheme={onChangeTheme} />

        {prefs && (
          <UiFontFields
            uiFontSize={prefs.uiFontSize ?? 14}
            uiFontFamily={prefs.uiFontFamily ?? "'Roboto', sans-serif"}
            onChange={updateUiPrefs}
          />
        )}
      </div>

      {/* --- CORRECTION --- */}
      <CorrectionSection
        grammarEnabled={grammarEnabled}
        onToggleGrammar={toggleGrammar}
        picky={picky}
        onTogglePicky={togglePicky}
      />

      {/* --- MISES À JOUR --- */}
      <UpdatesSection open={open} />
    </Modal>
  );
}
