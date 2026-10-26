// src/renderer/components/editor/modals/ReplaceModal.tsx
// Fenêtre « Rechercher / Remplacer » (bouton de la barre d'outils, Ctrl+F).
// Deux onglets :
// - Rechercher / Remplacer : remplacement dans le chapitre ou tout le projet ;
// - Remplacements automatiques : liste propre au livre (mot tapé -> texte),
//   appliquée pendant la frappe (voir lib/auto-replace.ts).
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import type { EditorController } from '../useEditorController';
import { isAutoReplaceWord, type AutoReplaceRule } from '../../../lib/auto-replace';

export interface ReplaceModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

type ReplaceTab = 'search' | 'auto';

const ARROW = String.fromCharCode(0x2192);
const CROSS = String.fromCharCode(0x2715);

function isBlankRule(rule: AutoReplaceRule): boolean {
  return rule.from.trim() === '' && rule.to.trim() === '';
}

export function ReplaceModal({ open, controller, onClose }: ReplaceModalProps): React.ReactElement {
  const { t } = useI18n();
  const [tab, setTab] = useState<ReplaceTab>('search');
  const [findStr, setFindStr] = useState('');
  const [repStr, setRepStr] = useState('');
  const [wholeProject, setWholeProject] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [rules, setRules] = useState<AutoReplaceRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // À chaque ouverture, on recharge la liste du livre ouvert.
  useEffect(() => {
    if (!open) return;
    const current = controller.getAutoReplace();
    setAutoEnabled(current.enabled);
    setRules(current.rules.map((rule) => ({ ...rule })));
    setDirty(false);
    setFocusIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveAuto = (nextEnabled: boolean, nextRules: AutoReplaceRule[]) => {
    controller.setAutoReplace({ enabled: nextEnabled, rules: nextRules });
    setDirty(false);
  };

  const saveIfDirty = () => {
    if (dirty) saveAuto(autoEnabled, rules);
  };

  const close = () => {
    if (dirty || rules.some(isBlankRule)) {
      saveAuto(autoEnabled, rules.filter((rule) => !isBlankRule(rule)));
    }
    setFindStr('');
    setRepStr('');
    setWholeProject(false);
    setTab('search');
    onClose();
  };

  const runReplace = () => {
    controller.replaceAll(findStr, repStr, wholeProject);
    close();
  };

  const switchTab = (next: ReplaceTab) => {
    saveIfDirty();
    setTab(next);
  };

  const updateRule = (index: number, field: 'from' | 'to', value: string) => {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)));
    setDirty(true);
  };

  const addRule = () => {
    setFocusIndex(rules.length);
    setRules((current) => [...current, { from: '', to: '' }]);
  };

  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
    setFocusIndex(null);
    saveAuto(autoEnabled, next);
  };

  const toggleEnabled = (value: boolean) => {
    setAutoEnabled(value);
    saveAuto(value, rules);
  };

  const warningFor = (rule: AutoReplaceRule, index: number): string | null => {
    const from = rule.from.trim();
    if (!from) return null;
    if (!isAutoReplaceWord(from)) return t('autoRepWarnWord');
    const key = from.toLocaleLowerCase();
    if (rules.findIndex((other) => other.from.trim().toLocaleLowerCase() === key) !== index) {
      return t('autoRepWarnDuplicate');
    }
    if (rule.to === '') return t('autoRepWarnEmpty');
    return null;
  };

  const footer =
    tab === 'search' ? (
      <>
        <button onClick={close}>{t('close')}</button>
        <button onClick={runReplace}>{t('replaceAllBtn')}</button>
      </>
    ) : (
      <button onClick={close}>{t('close')}</button>
    );

  return (
    <Modal
      open={open}
      title={t('replaceModalTitle')}
      onCancel={close}
      onPrimary={tab === 'search' ? runReplace : saveIfDirty}
      footer={footer}
    >
      <div className="autorep-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          className={tab === 'search' ? 'autorep-tab active' : 'autorep-tab'}
          onClick={() => switchTab('search')}
        >
          {t('autoRepTabSearch')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'auto'}
          className={tab === 'auto' ? 'autorep-tab active' : 'autorep-tab'}
          onClick={() => switchTab('auto')}
        >
          {t('autoRepTabAuto')}
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <input
            type="text"
            placeholder={t('findPlaceholder')}
            value={findStr}
            onChange={(e) => setFindStr(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder={t('replacePlaceholder')}
            value={repStr}
            onChange={(e) => setRepStr(e.target.value)}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '-10px 0 20px',
              fontSize: 13,
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={wholeProject}
              onChange={(e) => setWholeProject(e.target.checked)}
            />
            <span>{t('replaceScopeAllLabel')}</span>
          </label>
        </>
      ) : (
        <div className="autorep-panel">
          <label className="autorep-toggle">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
            />
            <span>{t('autoRepEnabled')}</span>
          </label>
          <p className="autorep-hint">{t('autoRepHint')}</p>

          {rules.length === 0 ? (
            <p className="autorep-empty">{t('autoRepEmpty')}</p>
          ) : (
            <div className="autorep-list">
              <div className="autorep-head">
                <span>{t('autoRepFrom')}</span>
                <span />
                <span>{t('autoRepTo')}</span>
                <span />
              </div>
              {rules.map((rule, index) => {
                const warning = warningFor(rule, index);
                return (
                  <div key={index} className="autorep-item">
                    <div className="autorep-row">
                      <input
                        type="text"
                        value={rule.from}
                        placeholder={t('autoRepFromPlaceholder')}
                        autoFocus={focusIndex === index}
                        onChange={(e) => updateRule(index, 'from', e.target.value)}
                        onBlur={saveIfDirty}
                      />
                      <span className="autorep-arrow" aria-hidden="true">{ARROW}</span>
                      <input
                        type="text"
                        value={rule.to}
                        placeholder={t('autoRepToPlaceholder')}
                        onChange={(e) => updateRule(index, 'to', e.target.value)}
                        onBlur={saveIfDirty}
                      />
                      <button
                        type="button"
                        className="autorep-del"
                        title={t('autoRepDelete')}
                        aria-label={t('autoRepDelete')}
                        onClick={() => removeRule(index)}
                      >
                        {CROSS}
                      </button>
                    </div>
                    {warning ? <div className="autorep-warn">{warning}</div> : null}
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" className="autorep-add" onClick={addRule}>
            {t('autoRepAdd')}
          </button>
        </div>
      )}
    </Modal>
  );
}
