// src/renderer/components/editor/modals/BackupsModal.tsx
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useDialogs } from '../../common/Dialogs';
import { Modal } from '../../common/Modal';
import { describeError } from '../../../lib/errors';
import type { EditorController } from '../useEditorController';
import type { BackupEntry } from '../../../../shared/types';

export interface BackupsModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

export function BackupsModal({ open, controller, onClose }: BackupsModalProps): React.ReactElement {
  const { t, lang } = useI18n();
  const { showInfo, showConfirm } = useDialogs();
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setBackups(null);
    void (async () => {
      try {
        setBackups(await window.api.listBackups(controller.projectName));
      } catch (err) {
        console.error('Erreur ouverture sauvegardes:', err);
        showInfo(t('backupRestoreError') + (describeError(err)));
      }
    })();
  }, [open, controller.projectName, showInfo, t]);

  const formatDate = (iso: string | null): string => {
    if (!iso) return t('unknownDate');
    const d = new Date(iso);
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const restore = async (backup: BackupEntry) => {
    if (!(await showConfirm(t('backupConfirmRestore', { date: formatDate(backup.savedAt) })))) return;
    try {
      await controller.restoreBackup(backup.fileName);
      onClose();
      showInfo(t('backupRestoreSuccess'));
    } catch (err) {
      console.error(err);
      showInfo(t('backupRestoreError') + (describeError(err)));
    }
  };

  return (
    <Modal
      open={open}
      title={t('backupsModalTitle')}
      width={480}
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 15 }}>{t('backupsDescription')}</p>
      <ul
        id="backupsList"
        className="item-list"
        style={{ maxHeight: 300, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
      >
        {backups === null ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('loadingBackups')}</li>
        ) : backups.length === 0 ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('backupNoneYet')}</li>
        ) : (
          backups.map((backup) => (
            <li className="backup-item" key={backup.fileName}>
              <span>{formatDate(backup.savedAt)}</span>
              <button className="btn-restore-backup" onClick={() => void restore(backup)}>
                {t('backupRestoreBtn')}
              </button>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}
