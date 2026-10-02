// src/renderer/components/editor/modals/GrammarSetupModal.tsx
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import { useEditorStatus } from '../editor-status';
import { describeError } from '../../../lib/errors';
import type { EditorController } from '../useEditorController';
import type { GrammarInstallProgress } from '../../../../shared/types';

export interface GrammarSetupModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

export function GrammarSetupModal({ open, controller, onClose }: GrammarSetupModalProps): React.ReactElement {
  const { t } = useI18n();
  const status = useEditorStatus(controller.status);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<GrammarInstallProgress | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(controller.grammarPrefs().languageToolPath);
  const [folderError, setFolderError] = useState('');

  useEffect(() => {
    const unsubscribe = window.api.onGrammarInstallProgress((data) => setProgress(data));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (open) {
      setFolderPath(controller.grammarPrefs().languageToolPath);
      setFolderError('');
      void controller.refreshGrammarStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const javaInfo = status.javaInfo;
  const javaOk = !!javaInfo && javaInfo.available && !javaInfo.outdated;

  const javaStatusText = !javaInfo
    ? '…'
    : !javaInfo.available
      ? t('grammarJavaMissing')
      : javaInfo.outdated
        ? t('grammarJavaOutdated', { version: javaInfo.major ?? '?' })
        : t('grammarJavaOk');

  const javaHint = javaInfo?.outdated ? t('grammarJavaOutdatedHint') : t('grammarJavaMissingHint');

  const autoInstall = async () => {
    setInstalling(true);
    setProgress(null);
    setFolderError('');
    try {
      const result = await window.api.installLanguageToolAuto();
      setFolderPath(result.folderPath);
      await window.api.saveGrammarPrefs({ enabled: true });
      await controller.setGrammarEnabled(true);
    } catch (err) {
      setFolderError(t('grammarInstallError', { error: describeError(err) }));
    } finally {
      setInstalling(false);
    }
  };

  const selectFolder = async () => {
    const result = await window.api.selectLanguageToolFolder();
    if (result.canceled) return;
    if (!result.valid) {
      setFolderError(t('grammarInvalidFolder'));
      return;
    }
    setFolderPath(result.folderPath ?? null);
    await controller.refreshGrammarStatus();
  };

  const recheck = () => {
    controller.resetGrammarError();
    void controller.refreshGrammarStatus();
  };

  const progressLabel = progress
    ? progress.phase === 'download'
      ? t('grammarInstallDownloading', { percent: progress.percent })
      : t('grammarInstallExtracting')
    : '';

  return (
    <Modal
      open={open}
      title={t('grammarModalTitle')}
      width={480}
      onCancel={onClose}
      footer={
        <>
          <button onClick={recheck}>{t('grammarRecheckBtn')}</button>
          <button onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 15 }}>{t('grammarModalIntro')}</p>

      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 15 }}>
        <div>
          <span>{t('grammarJavaLabel')}</span> <strong>{javaStatusText}</strong>
        </div>
        <div>
          <span>{t('grammarFolderLabel')}</span>{' '}
          <strong style={{ wordBreak: 'break-all' }}>{folderPath || t('grammarFolderNotSet')}</strong>
        </div>
      </div>

      {!javaOk && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>{javaHint}</p>
          <button
            style={{ width: '100%', marginBottom: 15 }}
            onClick={() => void window.api.openExternalLink('https://www.java.com/fr/download/')}
          >
            {t('grammarOpenJavaBtn')}
          </button>
        </>
      )}

      <button style={{ width: '100%', marginBottom: 6 }} disabled={installing} onClick={() => void autoInstall()}>
        {t('grammarAutoInstallBtn')}
      </button>
      {progress && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ background: 'var(--bg-input)', borderRadius: 6, overflow: 'hidden', height: 8 }}>
            <div
              style={{
                background: 'var(--accent)',
                height: '100%',
                width: `${progress.phase === 'download' ? progress.percent : 100}%`,
                transition: 'width 0.2s'
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{progressLabel}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span>{t('grammarOrManualLabel')}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <button style={{ width: '100%', marginBottom: 10 }} onClick={() => void selectFolder()}>
        {t('grammarSelectFolderBtn')}
      </button>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 15 }}>{t('grammarDownloadHint')}</p>

      <div style={{ fontSize: 13, marginBottom: 10, minHeight: 18 }}>{folderError || status.grammarMessage}</div>
    </Modal>
  );
}
