// src/renderer/components/editor/WbSheet.tsx
// Formulaire d'une fiche World Building : icône, nom, couleur de surlignage,
// mode lecture, alias, champs de la catégorie (intégrée ou personnalisée), et
// liste des chapitres où la fiche est mentionnée.
//
// La propriété `name` contient l'IDENTIFIANT stable de la fiche (clé de
// `data.world`, identique à `TabRef.name` pour un onglet de type 'world').
// Le nom affiché provient de `item.name`.
//
// La propriété `compact` sert à l'affichage dans le panneau latéral : mise en
// page resserrée, et identifiants HTML suffixés pour ne pas entrer en conflit
// avec la même fiche ouverte dans un onglet.
//
// Le nom et les alias sont édités dans un brouillon, enregistré quand la case
// perd le focus. Si la fiche disparaît avant (changement d'onglet, fermeture
// du panneau...), le brouillon est enregistré juste avant : rien n'est perdu.
//
// Types de champs pris en charge :
// - 'text'      : ligne simple ;
// - 'textarea'  : texte long ;
// - 'number'    : nombre (la case peut rester vide) ;
// - 'select'    : liste de choix (un choix retiré du type reste affiché) ;
// - 'reference' : lien vers une autre fiche (valeur = identifiant de la
//                 fiche), avec un bouton pour l'ouvrir.

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { EmojiPicker } from '../common/EmojiPicker';
import { openWbPanel } from './WbSidePanel';
import type { EditorController } from './useEditorController';

export interface WbSheetProps {
  controller: EditorController;
  /** Identifiant stable de la fiche. */
  name: string;
  /** Affichage resserré (panneau latéral). */
  compact?: boolean;
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

/** Brouillons non encore enregistrés d'une fiche. */
interface PendingDrafts {
  controller: EditorController;
  itemId: string;
  nameDraft: string;
  aliasesDraft: string;
}

/**
 * Enregistre le nom et les alias encore en brouillon, si la fiche se ferme
 * avant que leur case ait perdu le focus.
 */
function flushPendingDrafts(pending: PendingDrafts, renameInFlight: boolean): void {
  const { controller, itemId, nameDraft, aliasesDraft } = pending;
  const item = controller.wbItem(itemId);
  if (!item) return;

  // Alias d'abord : ils ne dépendent pas d'un éventuel renommage.
  const draftAliases = textToAliases(aliasesDraft);
  if (draftAliases.join(', ') !== aliasesToText(item.aliases)) {
    controller.setWbAliases(itemId, draftAliases);
  }

  const trimmed = nameDraft.trim();
  if (!renameInFlight && trimmed && trimmed !== item.name) {
    void controller.renameItem(itemId, trimmed, 'world');
  }
}

/** Fiche proposée dans un champ « référence ». */
interface ReferenceChoice {
  id: string;
  label: string;
}

export function WbSheet({ controller, name, compact = false }: WbSheetProps): React.ReactElement | null {
  const { t } = useI18n();
  const itemId = name;
  const data = controller.data().world[itemId];
  const currentName = data ? data.name : '';
  const currentAliases = data ? aliasesToText(data.aliases) : '';
  const [nameDraft, setNameDraft] = useState(currentName);
  const [aliasesDraft, setAliasesDraft] = useState(currentAliases);

  // Le mode lecture est propre à chaque fiche : on le lit directement sur
  // elle, que la fiche soit affichée dans un onglet ou dans le panneau.
  const readMode = Boolean(data?.readMode);

  // Identifiants HTML distincts dans le panneau (la même fiche peut être
  // ouverte en même temps dans un onglet).
  const idSuffix = compact ? '_panel' : '';

  // Derniers brouillons affichés, et renommage en cours (évite de lancer
  // deux fois le même renommage).
  const pendingRef = useRef<PendingDrafts>({ controller, itemId, nameDraft, aliasesDraft });
  const renameInFlightRef = useRef(false);

  // Mis à jour après chaque affichage : au moment où la fiche se ferme,
  // la référence contient encore les brouillons de cette fiche.
  useEffect(() => {
    pendingRef.current = { controller, itemId, nameDraft, aliasesDraft };
  });

  // Fiche fermée ou remplacée par une autre : on enregistre les brouillons.
  useEffect(() => {
    return () => {
      flushPendingDrafts(pendingRef.current, renameInFlightRef.current);
    };
  }, [itemId]);

  useEffect(() => setNameDraft(currentName), [itemId, currentName]);
  useEffect(() => setAliasesDraft(currentAliases), [itemId, currentAliases]);

  if (!data) return null;

  const registry = controller.registry;
  const template = registry.templateFor(data.wbType);
  const category = registry.categoryFor(data.wbType);
  const isCustomType = registry.isCustomType(data.wbType);
  const color = registry.colorFor(data);
  const chaptersWithMention = controller.chaptersContaining(itemId);
  const scenesWithMention = controller.scenesContaining(itemId);

  type SheetField = (typeof template.fields)[number];

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentName) {
      setNameDraft(currentName);
      return;
    }
    if (renameInFlightRef.current) return;
    renameInFlightRef.current = true;
    void controller
      .renameItem(itemId, trimmed, 'world')
      .then((ok) => {
        if (!ok) setNameDraft(currentName);
      })
      .finally(() => {
        renameInFlightRef.current = false;
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

  /**
   * Libellé d'un champ : nom choisi par l'auteur pour un type personnalisé,
   * traduction pour un type intégré (ou le nom du champ si aucune
   * traduction n'existe, par exemple pour un champ issu d'un modèle).
   */
  const fieldLabel = (field: SheetField): string => {
    if (isCustomType) return field.label;
    const key = `wbField_${field.key}`;
    const translated = t(key as never);
    if ((!translated || translated === key) && field.label) return field.label;
    return translated;
  };

  /** Fiches proposées dans un champ « référence », triées par nom. */
  const referenceChoices = (referenceCategory: string | undefined): ReferenceChoice[] => {
    const world = controller.data().world;
    return Object.entries(world)
      .filter(([id, item]) => {
        if (id === itemId || !item) return false;
        return !referenceCategory || item.wbType === referenceCategory;
      })
      .map(([id, item]) => {
        const icon = item.icon || registry.categoryFor(item.wbType).icon || '';
        return { id, label: icon ? `${icon} ${item.name}` : item.name };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  };

  /** Ouvre la fiche liée : panneau (clic) ou onglet (Ctrl+clic, clic molette). */
  const openLinked = (targetId: string, inTab: boolean) => {
    if (!controller.wbItem(targetId)) return;
    if (inTab) {
      controller.openItem(targetId, 'world');
    } else {
      openWbPanel(targetId);
    }
  };

  /** Case de saisie d'un champ, selon son type. */
  const renderFieldInput = (field: SheetField, inputId: string): React.ReactElement => {
    const value = data.content[field.key] || '';
    const update = (next: string) => controller.updateWbField(itemId, field.key, next);

    if (field.type === 'textarea') {
      return (
        <textarea
          id={inputId}
          className="wb-textarea"
          value={value}
          readOnly={readMode}
          onChange={(e) => update(e.target.value)}
        />
      );
    }

    if (field.type === 'number') {
      return (
        <input
          type="number"
          id={inputId}
          className="wb-input"
          step="any"
          value={value}
          readOnly={readMode}
          onChange={(e) => update(e.target.value)}
        />
      );
    }

    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      const isRemoved = value !== '' && !options.includes(value);
      return (
        <select
          id={inputId}
          className="wb-input"
          value={value}
          disabled={readMode}
          onChange={(e) => update(e.target.value)}
        >
          <option value="">{t('wbSelectEmpty')}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {isRemoved && (
            <option value={value}>{t('wbSelectRemovedOption').replace('{value}', value)}</option>
          )}
        </select>
      );
    }

    if (field.type === 'reference') {
      const choices = referenceChoices(field.referenceCategory);
      const linked = value ? controller.wbItem(value) : undefined;
      const isMissing = value !== '' && !linked;
      const isOutsideChoices = value !== '' && !!linked && !choices.some((choice) => choice.id === value);
      return (
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              id={inputId}
              className="wb-input"
              style={{ flex: 1, minWidth: 0 }}
              value={value}
              disabled={readMode}
              onChange={(e) => update(e.target.value)}
            >
              <option value="">{t('wbReferenceNone')}</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
              {isOutsideChoices && linked && <option value={value}>{linked.name}</option>}
              {isMissing && <option value={value}>{t('wbReferenceMissing')}</option>}
            </select>
            <button
              type="button"
              className="wb-mentioned-chapter-btn"
              style={{ flexShrink: 0, opacity: linked ? 1 : 0.4, cursor: linked ? 'pointer' : 'default' }}
              title={t('wbReferenceOpenTitle')}
              disabled={!linked}
              onClick={(e) => openLinked(value, e.ctrlKey || e.metaKey)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  openLinked(value, true);
                }
              }}
            >
              ↗
            </button>
          </div>
          {isMissing && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
              ⚠ {t('wbReferenceMissing')}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        id={inputId}
        className="wb-input"
        value={value}
        readOnly={readMode}
        onChange={(e) => update(e.target.value)}
      />
    );
  };

  return (
    <div className={`wb-container${compact ? ' wb-container-compact' : ''}`}>
      <div className="wb-header">
        <EmojiPicker
          buttonId={`wbIconBtn${idSuffix}`}
          buttonTitle={t('wbIconInputTitle')}
          value={data.icon || category.icon}
          disabled={readMode}
          onSelect={(icon) => controller.setWbIcon(itemId, icon)}
        />

        <input
          type="text"
          id={`wbNameInput_live${idSuffix}`}
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
            id={`wbColorInput${idSuffix}`}
            value={color}
            disabled={readMode}
            onChange={(e) => controller.setWbColor(itemId, e.target.value)}
          />
        </label>

        <button
          type="button"
          id={`wbReadModeBtn${idSuffix}`}
          className={`wb-readmode-btn${readMode ? ' active' : ''}`}
          title={t('wbReadModeTitle')}
          onClick={() => controller.toggleReadMode(itemId)}
        >
          {readMode ? '🔒' : '👁'} <span>{t('wbReadModeLabel')}</span>
        </button>
      </div>

      <div id={`wbAliasesSection${idSuffix}`}>
        <div className="wb-form-group">
          <label className="wb-label" htmlFor={`wbAliasesInput${idSuffix}`}>
            {t('wbAliasesLabel')}
          </label>
          <input
            type="text"
            id={`wbAliasesInput${idSuffix}`}
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

      <div id={`wbFormFields${idSuffix}`}>
        {template.fields.map((field) => {
          const inputId = `wbField_${field.key}${idSuffix}`;
          return (
            <div className="wb-form-group" key={field.key}>
              <label className="wb-label" htmlFor={inputId}>
                {fieldLabel(field)}
              </label>
              {renderFieldInput(field, inputId)}
            </div>
          );
        })}
      </div>

      <div id={`wbMentionsSection${idSuffix}`}>
        <div className="wb-form-group">
          <label className="wb-label">{t('wbMentionedInLabel')}</label>
          {chaptersWithMention.length === 0 && scenesWithMention.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(controller.isScreenplayProject() ? 'wbMentionedInNoneScenes' : 'wbMentionedInNone')}</div>
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
              {scenesWithMention.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  className="wb-mentioned-chapter-btn"
                  onClick={() => controller.openItem(scene.id, 'scene')}
                >
                  🎬 {scene.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
