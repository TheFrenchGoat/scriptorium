// src/renderer/components/editor/WbSheet.tsx
// Formulaire d'une fiche World Building : icône, nom, couleur de surlignage,
// mode lecture, champs du gabarit (intégré ou personnalisé), et liste des
// chapitres où la fiche est mentionnée.

import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { EmojiPicker } from '../common/EmojiPicker';
import type { EditorController } from './useEditorController';

export interface WbSheetProps {
  controller: EditorController;
  name: string;
}

export function WbSheet({ controller, name }: WbSheetProps): React.ReactElement | null {
  const { t } = useI18n();
  const data = controller.data().world[name];
  const [nameDraft, setNameDraft] = useState(name);
  const readMode = controller.isReadMode();

  useEffect(() => setNameDraft(name), [name]);

  if (!data) return null;

  const template = controller.registry.templateFor(data.wbType);
  const isCustomType = controller.registry.isCustomType(data.wbType);
  const color = controller.registry.colorFor(data);
  const chaptersWithMention = controller.chaptersContaining(name);

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setNameDraft(name);
      return;
    }
    void controller.renameItem(name, trimmed, 'world').then((ok) => {
      if (!ok) setNameDraft(name);
    });
  };

  return (
    <div className="wb-container">
      <div className="wb-header">
        <EmojiPicker
          buttonId="wbIconBtn"
          buttonTitle={t('wbIconInputTitle')}
          value={data.icon || template.icon}
          disabled={readMode}
          onSelect={(icon) => controller.setWbIcon(name, icon)}
        />

        <input
          type="text"
          id="wbNameInput_live"
          className="wb-title-input"
          value={nameDraft}
          readOnly={readMode}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={commitRename}
        />

        <label className="wb-color-label" title={t('wbColorLabel')}>
          <input
            type="color"
            id="wbColorInput"
            value={color}
            disabled={readMode}
            onChange={(e) => controller.setWbColor(name, e.target.value)}
          />
        </label>

        <button
          type="button"
          id="wbReadModeBtn"
          className={`wb-readmode-btn${readMode ? ' active' : ''}`}
          title={t('wbReadModeTitle')}
          onClick={() => controller.toggleReadMode()}
        >
          {readMode ? '🔒' : '👁'} <span>{t('wbReadModeLabel')}</span>
        </button>
      </div>

      <div id="wbFormFields">
        {template.fields.map((field) => (
          <div className="wb-form-group" key={field.key}>
            <label className="wb-label">{isCustomType ? field.label : t(`wbField_${field.key}` as never)}</label>
            {field.type === 'textarea' ? (
              <textarea
                className="wb-textarea"
                value={data.content[field.key] || ''}
                readOnly={readMode}
                onChange={(e) => controller.updateWbField(name, field.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className="wb-input"
                value={data.content[field.key] || ''}
                readOnly={readMode}
                onChange={(e) => controller.updateWbField(name, field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div id="wbMentionsSection">
        <div className="wb-form-group">
          <label className="wb-label">{t('wbMentionedInLabel')}</label>
          {chaptersWithMention.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('wbMentionedInNone')}</div>
          ) : (
            <div className="wb-mentioned-chapters">
              {chaptersWithMention.map((chapName) => (
                <button
                  key={chapName}
                  type="button"
                  className="wb-mentioned-chapter-btn"
                  onClick={() => controller.openItem(chapName, 'chapter')}
                >
                  📖 {chapName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
