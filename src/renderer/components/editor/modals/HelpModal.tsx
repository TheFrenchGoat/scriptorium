// src/renderer/components/editor/modals/HelpModal.tsx
import React from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import type { TranslationKey } from '../../../i18n';

export interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { labelKey: TranslationKey; kbd: string }[] = [
  { labelKey: 'shortcutSave', kbd: 'Ctrl+S' },
  { labelKey: 'shortcutUndo', kbd: 'Ctrl+Z' },
  { labelKey: 'shortcutRedo', kbd: 'Ctrl+Y' },
  { labelKey: 'shortcutBold', kbd: 'Ctrl+B' },
  { labelKey: 'shortcutItalic', kbd: 'Ctrl+I' },
  { labelKey: 'shortcutUnderline', kbd: 'Ctrl+U' },
  { labelKey: 'shortcutAlign', kbd: 'Ctrl+L / Ctrl+E / Ctrl+R / Ctrl+J' },
  { labelKey: 'shortcutAccents', kbd: 'Ctrl+` Ctrl+\' Ctrl+Maj+^ Ctrl+Maj+: Ctrl+,' },
  { labelKey: 'shortcutReplace', kbd: 'Ctrl+F' },
  { labelKey: 'shortcutGlobalSearch', kbd: 'Ctrl+Maj+F' },
  { labelKey: 'shortcutSwitchTab', kbd: 'Ctrl+Tab / Ctrl+Maj+Tab' },
  { labelKey: 'shortcutZoomKeys', kbd: 'Ctrl++ / Ctrl+- / Ctrl+0' },
  { labelKey: 'shortcutZoom', kbd: 'Ctrl+Molette' },
  { labelKey: 'shortcutWbOpen', kbd: 'Ctrl+Clic' },
  { labelKey: 'shortcutCloseTab', kbd: 'Delete' },
  { labelKey: 'shortcutMiddleClose', kbd: 'Clic molette' },
  { labelKey: 'shortcutNavigate', kbd: 'Tab' },
  { labelKey: 'shortcutActivate', kbd: 'Entrée / Espace' },
  { labelKey: 'shortcutCloseModal', kbd: 'Échap' }
];

export function HelpModal({ open, onClose }: HelpModalProps): React.ReactElement {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      title={t('helpModalTitle')}
      width={480}
      maxHeight="80vh"
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      <ul className="shortcut-list">
        {SHORTCUTS.map((item) => (
          <li key={item.labelKey}>
            <span>{t(item.labelKey)}</span>
            <kbd>{item.kbd}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
