// src/renderer/components/common/Dialogs.tsx
// Remplacent alert()/confirm() natifs du navigateur : ces fenêtres système
// sont hors thème, incohérentes avec le reste de l'application, et sur
// certaines configurations Electron/Windows une boîte native déclenchée depuis
// un callback asynchrone peut laisser le focus clavier dans un état incohérent
// une fois fermée (plus aucun champ ne reçoit la frappe).
//
// showConfirm() renvoie une Promise : `if (!(await showConfirm(msg))) return;`

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../../i18n';

/** Actions optionnelles rendues en boutons sous le message — ex: liste de
 *  fiches à ouvrir directement plutôt que de mentionner seulement leur nombre. */
export interface InfoAction {
  label: string;
  onClick: () => void;
}

interface DialogsContextValue {
  showInfo: (message: string, actions?: InfoAction[]) => void;
  showConfirm: (message: string) => Promise<boolean>;
}

const DialogsContext = createContext<DialogsContextValue | null>(null);

interface InfoState {
  open: boolean;
  message: string;
  actions: InfoAction[];
}

interface ConfirmState {
  open: boolean;
  message: string;
}

export function DialogsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { t } = useI18n();
  const [info, setInfo] = useState<InfoState>({ open: false, message: '', actions: [] });
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, message: '' });
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);

  const showInfo = useCallback((message: string, actions: InfoAction[] = []) => {
    setInfo({ open: true, message, actions });
  }, []);

  const showConfirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        // Un seul clic doit compter : le résolveur précédent est toujours
        // remplacé, et `settle` le remet à null après usage.
        confirmResolver.current = resolve;
        setConfirm({ open: true, message });
      }),
    []
  );

  const settleConfirm = useCallback((result: boolean) => {
    setConfirm({ open: false, message: '' });
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    resolve?.(result);
  }, []);

  const value = useMemo<DialogsContextValue>(() => ({ showInfo, showConfirm }), [showInfo, showConfirm]);

  const closeInfo = () => setInfo({ open: false, message: '', actions: [] });

  return (
    <DialogsContext.Provider value={value}>
      {children}

      <Modal
        open={info.open}
        title={t('infoModalTitle')}
        width={420}
        onCancel={closeInfo}
        onPrimary={closeInfo}
        footer={<button onClick={closeInfo}>{t('close')}</button>}
      >
        <p
          id="infoModalMessage"
          style={{
            color: 'var(--text-main)',
            fontSize: 14,
            lineHeight: 1.5,
            margin: '15px 0 20px',
            whiteSpace: 'pre-line'
          }}
        >
          {info.message}
        </p>
        {info.actions.length > 0 && (
          <div className="info-modal-actions">
            {info.actions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  closeInfo();
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={confirm.open}
        title={t('confirmModalTitle')}
        width={440}
        onCancel={() => settleConfirm(false)}
        onPrimary={() => settleConfirm(true)}
        footer={
          <>
            <button onClick={() => settleConfirm(false)}>{t('cancel')}</button>
            <button onClick={() => settleConfirm(true)}>{t('confirmModalOk')}</button>
          </>
        }
      >
        <p
          style={{
            color: 'var(--text-main)',
            fontSize: 14,
            lineHeight: 1.5,
            margin: '15px 0 20px',
            whiteSpace: 'pre-line'
          }}
        >
          {confirm.message}
        </p>
      </Modal>
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsContextValue {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs doit être utilisé à l’intérieur de <DialogsProvider>');
  return ctx;
}
