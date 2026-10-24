// src/renderer/components/common/EmojiPicker.tsx
// Une seule implémentation, utilisée à la fois pour l'icône d'une fiche World
// Building et pour l'icône d'un type de fiche personnalisé, plutôt que deux
// versions dupliquées. Un panneau d'emojis courants + un champ libre pour tout
// emoji/texte non listé (le clavier système fonctionne aussi dans ce champ,
// ex: Win+. sous Windows).
// Pour une fiche, le panneau propose aussi une photo à la place de l'emoji
// (props imageValue / onSelectImage).

import React, { useEffect, useRef, useState } from 'react';
import { WB_EMOJI_CHOICES } from '../../lib/wb-config';
import { fileToIconImage } from '../../lib/icon-image';
import { useI18n } from '../../i18n';
import { WbIconContent } from './WbItemIcon';

export interface EmojiPickerProps {
  value: string;
  onSelect: (icon: string) => void;
  disabled?: boolean;
  buttonTitle?: string;
  buttonId?: string;
  buttonClassName?: string;
  /** Photo affichée à la place de l'emoji (URL de données). */
  imageValue?: string;
  /** Si fourni : boutons « Choisir une photo » et « Retirer la photo ». */
  onSelectImage?: (image: string | undefined) => void;
}

export function EmojiPicker({
  value,
  onSelect,
  disabled,
  buttonTitle,
  buttonId,
  buttonClassName = 'wb-icon-btn',
  imageValue,
  onSelectImage
}: EmojiPickerProps): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    // Choisir un emoji remplace la photo.
    if (imageValue && onSelectImage) onSelectImage(undefined);
    setOpen(false);
  };

  const applyCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    pick(trimmed);
    setCustom('');
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onSelectImage) return;
    try {
      const image = await fileToIconImage(file);
      onSelectImage(image);
      setOpen(false);
    } catch (err) {
      console.error('[EmojiPicker] photo illisible', err);
    }
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
        <WbIconContent icon={value} image={imageValue} />
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
        {onSelectImage && (
          <div className="wb-icon-photo-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => void onFileChange(e)}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {t('wbIconPhotoChoose')}
            </button>
            {imageValue && (
              <button
                type="button"
                onClick={() => {
                  onSelectImage(undefined);
                  setOpen(false);
                }}
              >
                {t('wbIconPhotoRemove')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}