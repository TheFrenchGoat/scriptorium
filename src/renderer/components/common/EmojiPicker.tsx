// src/renderer/components/common/EmojiPicker.tsx
// Une seule implémentation, utilisée à la fois pour l'icône d'une fiche World
// Building et pour l'icône d'un type de fiche personnalisé, plutôt que deux
// versions dupliquées. Un panneau d'emojis courants + un champ libre pour tout
// emoji/texte non listé (le clavier système fonctionne aussi dans ce champ,
// ex: Win+. sous Windows).

import React, { useEffect, useRef, useState } from 'react';
import { WB_EMOJI_CHOICES } from '../../lib/wb-config';
import { useI18n } from '../../i18n';

export interface EmojiPickerProps {
  value: string;
  onSelect: (icon: string) => void;
  disabled?: boolean;
  buttonTitle?: string;
  buttonId?: string;
  buttonClassName?: string;
}

export function EmojiPicker({
  value,
  onSelect,
  disabled,
  buttonTitle,
  buttonId,
  buttonClassName = 'wb-icon-btn'
}: EmojiPickerProps): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (icon: string) => {
    onSelect(icon);
    setOpen(false);
  };

  const applyCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    pick(trimmed);
    setCustom('');
  };

  return (
    <div className="wb-icon-picker-container" ref={containerRef}>
      <button
        type="button"
        id={buttonId}
        className={buttonClassName}
        title={buttonTitle}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {value}
      </button>

      {/* Un clic à l'intérieur du panneau (ex: pour se placer dans le champ
          libre) ne doit pas remonter jusqu'aux gestionnaires globaux qui
          ferment les menus déroulants. */}
      <div
        className={`wb-icon-picker dropdown-menu${open ? ' show' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wb-icon-grid">
          {WB_EMOJI_CHOICES.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              className="wb-icon-choice"
              onClick={() => pick(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="wb-icon-custom-row">
          <input
            type="text"
            className="wb-icon-custom-input"
            maxLength={4}
            placeholder={t('wbIconCustomPlaceholder')}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                applyCustom();
              }
            }}
          />
          <button type="button" className="wb-icon-custom-apply" onClick={applyCustom}>
            {t('wbIconCustomApply')}
          </button>
        </div>
      </div>
    </div>
  );
}
