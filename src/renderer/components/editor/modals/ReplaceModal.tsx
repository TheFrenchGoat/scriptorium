// src/renderer/components/editor/modals/ReplaceModal.tsx
import React, { useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import type { EditorController } from '../useEditorController';

export interface ReplaceModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

export function ReplaceModal({ open, controller, onClose }: ReplaceModalProps): React.ReactElement {
  const { t } = useI18n();
  const [findStr, setFindStr] = useState('');
  const [repStr, setRepStr] = useState('');
  const [wholeProject, setWholeProject] = useState(false);

  const close = () => {
    setFindStr('');
    setRepStr('');
    setWholeProject(false);
    onClose();
  };

  const runReplace = () => {
    controller.replaceAll(findStr, repStr, wholeProject);
    close();
  };

  return (
    <Modal
      open={open}
      title={t('replaceModalTitle')}
      onCancel={close}
      onPrimary={runReplace}
      footer={
        <>
          <button onClick={close}>{t('close')}</button>
          <button onClick={runReplace}>{t('replaceAllBtn')}</button>
        </>
      }
    >
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
    </Modal>
  );
}
