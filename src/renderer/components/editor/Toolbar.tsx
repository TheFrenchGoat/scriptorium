// src/renderer/components/editor/Toolbar.tsx
// Barre d'outils de mise en forme. Undo/Redo affichent leur état actif/inactif
// via useEditorStatus (re-rendu à chaque frappe, ce composant reste donc
// volontairement petit).

import React from 'react';
import { useI18n } from '../../i18n';
import { Dropdown, DropdownItem } from '../common/Dropdown';
import { useEditorStatus } from './editor-status';
import type { EditorController } from './useEditorController';

const FONTS: { label: string; value: string; family: string }[] = [
  { label: 'Roboto', value: 'Roboto', family: 'Roboto' },
  { label: 'Arial', value: 'Arial', family: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman', family: "'Times New Roman'" },
  { label: 'Georgia', value: 'Georgia', family: 'Georgia' },
  { label: 'Courier', value: 'Courier New', family: "'Courier New'" },
  { label: 'Verdana', value: 'Verdana', family: 'Verdana' },
  { label: 'Tahoma', value: 'Tahoma', family: 'Tahoma' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS', family: "'Trebuchet MS'" },
  { label: 'Merriweather', value: 'Merriweather', family: "'Merriweather'" }
];

const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

// Caractères difficiles ou impossibles à taper directement sur un clavier
// AZERTY/QWERTY standard (majuscules accentuées notamment), plus quelques
// signes typographiques utiles pour un texte soigné (guillemets français,
// tiret cadratin/demi-cadratin, points de suspension).
const SPECIAL_CHARS = [
  'À', 'Â', 'Ä', 'Æ', 'Ç', 'É', 'È', 'Ê', 'Ë', 'Î', 'Ï', 'Ô', 'Œ', 'Ù', 'Û', 'Ü', 'Ÿ',
  'à', 'â', 'ä', 'æ', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'œ', 'ù', 'û', 'ü', 'ÿ',
  '«', '»', '—', '–', '…', '·', '•', '°'
];

export interface ToolbarProps {
  controller: EditorController;
  onOpenGlobalSearch: () => void;
  onOpenReplace: () => void;
}

export function Toolbar({ controller, onOpenGlobalSearch, onOpenReplace }: ToolbarProps): React.ReactElement {
  const { t } = useI18n();
  const status = useEditorStatus(controller.status);

  return (
    <div className="toolbar">
      <button id="undoBtn" title={t('undoTitle')} disabled={!status.canUndo} onClick={() => controller.undo()}>
        ↶
      </button>
      <button id="redoBtn" title={t('redoTitle')} disabled={!status.canRedo} onClick={() => controller.redo()}>
        ↷
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />

      <button id="boldBtn" title={t('boldTitle')} onClick={() => controller.format('bold')}>
        <b>B</b>
      </button>
      <button id="italicBtn" title={t('italicTitle')} onClick={() => controller.format('italic')}>
        <i>I</i>
      </button>
      <button id="underlineBtn" title={t('underlineTitle')} onClick={() => controller.format('underline')}>
        <u>U</u>
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />

      <Dropdown label={<>{t('fontDropdown')}</>}>
        {(close) => (
          <>
            {FONTS.map((font) => (
              <DropdownItem
                key={font.value}
                style={{ fontFamily: font.family }}
                preserveSelection
                onSelect={() => {
                  controller.setFontFamily(font.value);
                  close();
                }}
              >
                {font.label}
              </DropdownItem>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown label={<>{t('sizeDropdown')}</>}>
        {(close) => (
          <>
            {SIZES.map((size) => (
              <DropdownItem
                key={size}
                preserveSelection
                onSelect={() => {
                  controller.setFontSizePx(size);
                  close();
                }}
              >
                {size === 16 ? t('sizeNormalPx') : `${size} px`}
              </DropdownItem>
            ))}
          </>
        )}
      </Dropdown>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />
      <button id="alignLeftBtn" title={t('alignLeftTitle')} onClick={() => controller.format('justifyLeft')}>
        ⇤
      </button>
      <button id="alignCenterBtn" title={t('alignCenterTitle')} onClick={() => controller.format('justifyCenter')}>
        ⇹
      </button>
      <button id="alignRightBtn" title={t('alignRightTitle')} onClick={() => controller.format('justifyRight')}>
        ⇥
      </button>
      <button id="alignJustifyBtn" title={t('alignJustifyTitle')} onClick={() => controller.format('justifyFull')}>
        ▤
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />

      <input
        type="color"
        id="colorPicker"
        title={t('colorPickerTitle')}
        defaultValue="#f8fafc"
        style={{ height: 30, width: 30, border: 'none', background: 'transparent', cursor: 'pointer' }}
        onInput={(e) => controller.format('foreColor', (e.target as HTMLInputElement).value)}
      />

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />
      <Dropdown label={<>Ω {t('specialCharsBtn')}</>} buttonTitle={t('specialCharsBtnTitle')}>
        {(close) => (
          <div className="wb-icon-grid" style={{ gridTemplateColumns: 'repeat(9, 1fr)', width: 260 }}>
            {SPECIAL_CHARS.map((char, i) => (
              <button
                key={`${char}-${i}`}
                type="button"
                className="wb-icon-choice"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  controller.insertText(char);
                  close();
                }}
              >
                {char}
              </button>
            ))}
          </div>
        )}
      </Dropdown>

      <div style={{ flexGrow: 1 }} />
      <button id="btnGlobalSearch" title={t('globalSearchBtnTitle')} onClick={onOpenGlobalSearch}>
        {t('globalSearchBtn')}
      </button>
      <button id="btnReplace" title={t('replaceBtnTitle')} onClick={onOpenReplace}>
        {t('replaceBtn')}
      </button>
    </div>
  );
}
