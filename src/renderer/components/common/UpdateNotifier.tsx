// src/renderer/components/common/UpdateNotifier.tsx
// Écoute les événements de mise à jour envoyés par le processus principal et
// affiche une modale interne cohérente avec le thème, jamais de boîte de
// dialogue système (voir main/updater.ts). Monté une seule fois au niveau de
// l'application, indépendamment de l'écran affiché (accueil ou éditeur).
//
// Le téléchargement ne démarre qu'après confirmation explicite de
// l'utilisateur (autoDownload est désactivé côté main). Pendant le
// téléchargement, un petit encart non bloquant en indique l'avancement.
//
// Quand l'onglet « Mises à jour » des Paramètres est affiché, c'est lui qui
// montre le résultat : aucune fenêtre ne s'ouvre alors par-dessus.

import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { isUpdatesPanelShown } from '../../lib/update-panel';
import { Modal } from './Modal';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'downloaded'; version: string }
  | { kind: 'upToDate' }
  | { kind: 'error'; message: string; during: 'check' | 'download' };

export function UpdateNotifier(): React.ReactElement {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Avancement du téléchargement en cours ; null quand rien ne se télécharge.
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const show = (next: Phase): void => {
      if (!isUpdatesPanelShown()) setPhase(next);
    };

    const unsubs = [
      window.api.onUpdateAvailable((info) => show({ kind: 'available', version: info.version })),
      window.api.onUpdateNotAvailable(() => show({ kind: 'upToDate' })),
      window.api.onUpdateDownloadProgress((info) => setProgress(info.percent)),
      window.api.onUpdateDownloaded((info) => {
        setProgress(null);
        show({ kind: 'downloaded', version: info.version });
      }),
      window.api.onUpdateError((message, during) => {
        if (during === 'download') setProgress(null);
        show({ kind: 'error', message, during });
      })
    ];

    // Rattrape un état connu AVANT que ce composant écoute (vérification
    // lancée très tôt au démarrage).
    void window.api
      .getPendingUpdate()
      .then((pending) => {
        if (!pending) return;
        if (pending.state === 'downloading') setProgress(pending.percent);
        else if (pending.state === 'downloaded') show({ kind: 'downloaded', version: pending.version });
        else show({ kind: 'available', version: pending.version });
      })
      .catch(() => {
        // Ne jamais bloquer l'interface si le main ne connaît pas ce canal.
      });

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const close = (): void => setPhase({ kind: 'idle' });

  // La suite (progression, fin, échec) arrive par les événements du main.
  const startDownload = (): void => {
    close();
    window.api.confirmUpdateDownload().catch((error: unknown) => {
      setProgress(null);
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
        during: 'download'
      });
    });
  };

  let dialog: React.ReactElement | null = null;

  if (phase.kind === 'available') {
    dialog = (
      <Modal
        open
        title={t('updateAvailableTitle')}
        onCancel={close}
        footer={
          <>
            <button onClick={close}>{t('updateLaterBtn')}</button>
            <button onClick={startDownload}>{t('updateDownloadBtn')}</button>
          </>
        }
      >
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>
          {t('updateAvailableMessage', { version: phase.version })}
        </p>
      </Modal>
    );
  } else if (phase.kind === 'downloaded') {
    dialog = (
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
  } else if (phase.kind === 'upToDate') {
    dialog = (
      <Modal open title={t('updateUpToDateTitle')} onCancel={close} footer={<button onClick={close}>{t('close')}</button>}>
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5 }}>{t('updateUpToDateMessage')}</p>
      </Modal>
    );
  } else if (phase.kind === 'error') {
    const failedDownload = phase.during === 'download';
    dialog = (
      <Modal
        open
        title={t('updateErrorTitle')}
        onCancel={close}
        footer={
          failedDownload ? (
            <>
              <button onClick={close}>{t('close')}</button>
              <button onClick={startDownload}>{t('updateRetryBtn')}</button>
            </>
          ) : (
            <button onClick={close}>{t('close')}</button>
          )
        }
      >
        <p style={{ margin: '15px 0 20px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {failedDownload
            ? t('updateDownloadErrorMessage', { error: phase.message })
            : t('updateErrorMessage', { error: phase.message })}
        </p>
      </Modal>
    );
  }

  return (
    <>
      {dialog}
      {progress !== null && (
        <div className="update-toast">
          <div>{t('updateDownloadingToast', { percent: String(progress) })}</div>
          <div
            className="update-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="update-progress-bar" style={{ width: progress + '%' }} />
          </div>
        </div>
      )}
    </>
  );
}
