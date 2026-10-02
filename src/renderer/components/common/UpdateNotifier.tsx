// src/renderer/components/common/UpdateNotifier.tsx
// Écoute les événements de mise à jour envoyés par le processus principal et
// affiche une modale interne cohérente avec le thème — jamais de boîte de
// dialogue système (voir main/updater.ts). Monté une seule fois au niveau de
// l'application, indépendamment de l'écran affiché (accueil ou éditeur).
//
// Le téléchargement ne démarre qu'après confirmation explicite de
// l'utilisateur (autoDownload est désactivé côté main) : trouver une mise à
// jour ne déclenche donc jamais de trafic réseau ou d'écriture disque sans
// action de sa part.

import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { Modal } from './Modal';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'downloaded'; version: string }
  | { kind: 'upToDate' }
  | { kind: 'error'; message: string };

export function UpdateNotifier(): React.ReactElement {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    const unsubs = [
      window.api.onUpdateAvailable((info) => setPhase({ kind: 'available', version: info.version })),
      window.api.onUpdateNotAvailable(() => setPhase({ kind: 'upToDate' })),
      window.api.onUpdateDownloaded((info) => setPhase({ kind: 'downloaded', version: info.version })),
      window.api.onUpdateError((message) => setPhase({ kind: 'error', message }))
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const close = () => setPhase({ kind: 'idle' });

  if (phase.kind === 'idle') return <></>;

  if (phase.kind === 'available') {
    return (
      <Modal
        open
        title={t('updateAvailableTitle')}
        onCancel={close}
        footer={
          <>
            <button onClick={close}>{t('updateLaterBtn')}</button>
            <button
              onClick={() => {
                void window.api.confirmUpdateDownload();
                close();
              }}
            >
              {t('updateDownloadBtn')}
            </button>
          </>
        }
      >
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>
          {t('updateAvailableMessage', { version: phase.version })}
        </p>
      </Modal>
    );
  }

  if (phase.kind === 'downloaded') {
    return (
      <Modal
        open
        title={t('updateReadyTitle')}
        onCancel={close}
        footer={
          <>
            <button onClick={close}>{t('updateLaterBtn')}</button>
            <button onClick={() => void window.api.quitAndInstall()}>{t('updateRestartNowBtn')}</button>
          </>
        }
      >
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>
          {t('updateReadyMessage', { version: phase.version })}
        </p>
      </Modal>
    );
  }

  if (phase.kind === 'upToDate') {
    return (
      <Modal open title={t('updateUpToDateTitle')} onCancel={close} footer={<button onClick={close}>{t('close')}</button>}>
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>{t('updateUpToDateMessage')}</p>
      </Modal>
    );
  }

  return (
    <Modal open title={t('updateErrorTitle')} onCancel={close} footer={<button onClick={close}>{t('close')}</button>}>
      <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>{t('updateErrorMessage', { error: phase.message })}</p>
    </Modal>
  );
}
