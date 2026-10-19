// src/renderer/components/editor/WbSheet.tsx
// Formulaire d'une fiche World Building : icône, nom, couleur de surlignage,
// mode lecture, alias, champs de la catégorie (intégrée ou personnalisée), et
// liste des chapitres où la fiche est mentionnée.
//
// La propriété `name` contient l'IDENTIFIANT stable de la fiche (clé de
// `data.world`, identique à `TabRef.name` pour un onglet de type 'world').
// Le nom affiché provient de `item.name`.

import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { EmojiPicker } from '../common/EmojiPicker';
import type { EditorController } from './useEditorController';

export interface WbSheetProps {
  controller: EditorController;
  /** Identifiant stable de la fiche. */
  name: string;
}

/** Texte affiché dans la case des alias : les alias séparés par des virgules. */
function aliasesToText(aliases: unknown): string {
  return Array.isArray(aliases) ? aliases.join(', ') : '';
}

/** Découpe le texte de la case en liste d'alias (les vides sont retirés). */
function textToAliases(text: string): string[] {
  return text
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

export function WbSheet({ controller, name }: WbSheetProps): React.ReactElement | null {
  const { t } = useI18n();
  const itemId = name;
  const data = controller.data().world[itemId];
  const currentName = data ? data.name : '';
  const currentAliases = data ? aliasesToText(data.aliases) : '';
  const [nameDraft, setNameDraft] = useState(currentName);
  const [aliasesDraft, setAliasesDraft] = useState(currentAliases);
  const readMode = controller.isReadMode();

  useEffect(() => setNameDraft(currentName), [itemId, currentName]);
  useEffect(() => setAliasesDraft(currentAliases), [itemId, currentAliases]);

  if (!data) return null;

  const registry = controller.registry;
  const template = registry.templateFor(data.wbType);
  const category = registry.categoryFor(data.wbType);
  const isCustomType = registry.isCustomType(data.wbType);
  const color = registry.colorFor(data);
  const chaptersWithMention = controller.chaptersContaining(itemId);

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentName) {
      setNameDraft(currentName);
      return;
    }
    void controller.renameItem(itemId, trimmed, 'world').then((ok) => {
      if (!ok) setNameDraft(currentName);
    });
  };

  const commitAliases = () => {
    if (aliasesDraft === currentAliases) return;

    controller.setWbAliases(itemId, textToAliases(aliasesDraft));

    // On réaffiche la liste réellement enregistrée : doublons et nom de la
    // fiche retirés, ou ancienne liste en cas de conflit.
    const fresh = controller.wbItem(itemId);
    setAliasesDraft(fresh ? aliasesToText(fresh.aliases) : '');
  };

  return (
    <div className="wb-container">
      <div className="wb-header">
        <EmojiPicker
          buttonId="wbIconBtn"
          buttonTitle={t('wbIconInputTitle')}
          value={data.icon || category.icon}
          disabled={readMode}
          onSelect={(icon) => controller.setWbIcon(itemId, icon)}
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
            onChange={(e) => controller.setWbColor(itemId, e.target.value)}
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

      <div id="wbAliasesSection">
        <div className="wb-form-group">
          <label className="wb-label" htmlFor="wbAliasesInput">
            {t('wbAliasesLabel')}
          </label>
          <input
            type="text"
            id="wbAliasesInput"
            className="wb-input"
            value={aliasesDraft}
            placeholder={t('wbAliasesPlaceholder')}
            readOnly={readMode}
            onChange={(e) => setAliasesDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={commitAliases}
          />
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
            {t('wbAliasesHint')}
          </div>
        </div>
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
                onChange={(e) => controller.updateWbField(itemId, field.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className="wb-input"
                value={data.content[field.key] || ''}
                readOnly={readMode}
                onChange={(e) => controller.updateWbField(itemId, field.key, e.target.value)}
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
