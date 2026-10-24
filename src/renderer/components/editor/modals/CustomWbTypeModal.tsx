// src/renderer/components/editor/modals/CustomWbTypeModal.tsx
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useDialogs } from '../../common/Dialogs';
import { Modal } from '../../common/Modal';
import { Select } from '../../common/Select';
import { EmojiPicker } from '../../common/EmojiPicker';
import { buildCustomTypeFields } from '../useEditorController';
import type { EditorController } from '../useEditorController';
import type { BuiltinWbType, WbCategoryDef, WbFieldType } from '../../../../shared/types';

export interface CustomWbTypeModalProps {
  open: boolean;
  controller: EditorController;
  /** null = création d'un nouveau type ; sinon, clé du type en cours de modification. */
  editingSlug: string | null;
  onClose: () => void;
  /** Appelé uniquement à la CRÉATION (pas à la modification), pour enchaîner
   *  sur la création d'une première fiche de ce type. */
  onCreated: (slug: string) => void;
}

interface FieldDraft {
  id: number;
  label: string;
  type: WbFieldType;
  existingKey?: string;
  /** Choix d'une liste de choix, un par ligne (type 'select'). */
  optionsText: string;
  /** Type des fiches proposées (type 'reference') ; chaîne vide = toutes. */
  referenceCategory: string;
}

/** Champ transmis à buildCustomTypeFields. */
interface RawField {
  label: string;
  type: WbFieldType;
  existingKey?: string;
  options?: string[];
  referenceCategory?: string;
}

let fieldIdSeq = 0;

const DEFAULT_ICON = '📁';
const DEFAULT_COLOR = '#94a3b8';

/**
 * Découpe le texte saisi en choix : un par ligne, sans lignes vides ni
 * doublons (majuscules et minuscules confondues).
 */
function textToOptions(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of text.split('\n')) {
    const option = line.trim();
    if (!option) continue;
    const lower = option.toLocaleLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(option);
  }
  return result;
}

export function CustomWbTypeModal({
  open,
  controller,
  editingSlug,
  onClose,
  onCreated
}: CustomWbTypeModalProps): React.ReactElement {
  const { t } = useI18n();
  const { showInfo } = useDialogs();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [fields, setFields] = useState<FieldDraft[]>([]);

  useEffect(() => {
    if (!open) return;

    if (editingSlug) {
      // Depuis le format 2, toutes les catégories (intégrées et personnalisées)
      // sont rangées dans wbCategories. L'ancien champ customWbTypes ne sert
      // plus qu'à la lecture des projets avant conversion.
      const def = controller.data().wbCategories?.[editingSlug];
      if (def) {
        setName(def.label);
        setIcon(def.icon || DEFAULT_ICON);
        setColor(def.color || DEFAULT_COLOR);
        setFields(
          def.fields.map((f) => ({
            id: fieldIdSeq++,
            label: f.label,
            type: f.type,
            existingKey: f.key,
            optionsText: (f.options ?? []).join('\n'),
            referenceCategory: f.referenceCategory ?? ''
          }))
        );
        return;
      }
    }

    setName('');
    setIcon(DEFAULT_ICON);
    setColor(DEFAULT_COLOR);
    setFields([
      {
        id: fieldIdSeq++,
        label: t('customTypeDefaultFieldLabel'),
        type: 'textarea',
        optionsText: '',
        referenceCategory: ''
      }
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingSlug]);

  // Types de fiches proposés pour un champ Référence.
  const builtinLabels: Record<BuiltinWbType, string> = {
    character: t('wbLabel_character'),
    place: t('wbLabel_place'),
    object: t('wbLabel_object'),
    other: t('wbLabel_other')
  };

  function categoryDisplayLabel(slug: string, def: WbCategoryDef | undefined): string {
    if (def && def.label && def.label.trim()) return def.label;
    const builtin =
      def?.builtin ??
      (Object.prototype.hasOwnProperty.call(builtinLabels, slug) ? (slug as BuiltinWbType) : undefined);
    if (builtin) return builtinLabels[builtin];
    return slug;
  }

  const categoryChoices = Object.entries(controller.data().wbCategories ?? {}).map(([slug, def]) => ({
    slug,
    icon: def.icon,
    label: categoryDisplayLabel(slug, def)
  }));

  const addField = () =>
    setFields((prev) => [
      ...prev,
      { id: fieldIdSeq++, label: '', type: 'text', optionsText: '', referenceCategory: '' }
    ]);
  const removeField = (id: number) => setFields((prev) => prev.filter((f) => f.id !== id));
  const updateField = (id: number, patch: Partial<FieldDraft>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const confirm = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showInfo(t('customTypeNameRequired'));
      return;
    }

    const rawFields: RawField[] = fields
      .map((f): RawField => {
        const base: RawField = { label: f.label.trim(), type: f.type, existingKey: f.existingKey };
        if (f.type === 'select') {
          return { ...base, options: textToOptions(f.optionsText) };
        }
        if (f.type === 'reference' && f.referenceCategory) {
          return { ...base, referenceCategory: f.referenceCategory };
        }
        return base;
      })
      .filter((f) => f.label);

    if (rawFields.length === 0) {
      showInfo(t('customTypeFieldsRequired'));
      return;
    }

    // Deux champs avec le même libellé généreraient des clés distinctes sans
    // que rien ne le signale, ce qui porterait à confusion sur la fiche
    // elle-même (deux champs affichant le même nom). On bloque plutôt que de
    // deviner une intention.
    const labelCounts = new Map<string, number>();
    rawFields.forEach((f) => {
      const key = f.label.toLowerCase();
      labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
    });
    const duplicate = rawFields.find((f) => (labelCounts.get(f.label.toLowerCase()) ?? 0) > 1);
    if (duplicate) {
      showInfo(t('customTypeDuplicateField', { label: duplicate.label }));
      return;
    }

    // Une liste de choix doit proposer au moins un choix.
    const emptySelect = rawFields.find((f) => f.type === 'select' && (f.options?.length ?? 0) === 0);
    if (emptySelect) {
      showInfo(t('customTypeOptionsRequired', { label: emptySelect.label }));
      return;
    }

    const wasEditing = !!editingSlug;
    const finalFields = buildCustomTypeFields(rawFields);
    const finalSlug = controller.saveCustomType(editingSlug, {
      label: trimmedName,
      icon: icon || DEFAULT_ICON,
      color,
      fields: finalFields
    });

    onClose();
    // À la création (pas à la modification), enchaîne directement sur la
    // création d'une première fiche de ce nouveau type.
    if (!wasEditing) onCreated(finalSlug);
  };

  const subSettingStyle: React.CSSProperties = {
    margin: '6px 0 12px 12px',
    paddingLeft: 10,
    borderLeft: '2px solid var(--border)'
  };

  const subLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 4
  };

  return (
    <Modal
      open={open}
      title={editingSlug ? t('customTypeEditModalTitle') : t('customTypeModalTitle')}
      width={520}
      maxHeight="85vh"
      onCancel={onClose}
      footer={
        <>
          <button onClick={onClose}>{t('cancel')}</button>
          <button onClick={confirm}>{editingSlug ? t('save') : t('create')}</button>
        </>
      }
    >
      <div className="wb-form-group">
        <label className="wb-label">{t('customTypeNameLabel')}</label>
        <input
          type="text"
          placeholder={t('customTypeNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 15 }}>
        <div className="wb-form-group" style={{ flex: '0 0 auto' }}>
          <label className="wb-label">{t('customTypeIconLabel')}</label>
          <EmojiPicker value={icon} onSelect={setIcon} />
        </div>
        <div className="wb-form-group" style={{ flex: 1 }}>
          <label className="wb-label">{t('customTypeColorLabel')}</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{
              width: '100%',
              height: 52,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-input)'
            }}
          />
        </div>
      </div>

      <div className="wb-form-group">
        <label className="wb-label">{t('customTypeFieldsLabel')}</label>
        <p className="custom-type-fields-hint">{t('customTypeFieldsHint')}</p>
        <div className="custom-type-fields-list">
          {fields.map((field) => (
            <div key={field.id}>
              <div className="custom-type-field-row">
                <input
                  type="text"
                  className="custom-type-field-label"
                  placeholder={t('customTypeFieldLabelPlaceholder')}
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                />
                <Select
                  block
                  className="custom-type-field-type"
                  ariaLabel={t('customTypeFieldsLabel')}
                  value={field.type}
                  options={[
                    { value: 'text', label: t('customTypeFieldTypeText') },
                    { value: 'textarea', label: t('customTypeFieldTypeTextarea') },
                    { value: 'number', label: t('customTypeFieldTypeNumber') },
                    { value: 'select', label: t('customTypeFieldTypeSelect') },
                    { value: 'reference', label: t('customTypeFieldTypeReference') }
                  ]}
                  onChange={(value) => updateField(field.id, { type: value as WbFieldType })}
                />
                <button
                  type="button"
                  className="btn-remove-field"
                  title={t('customTypeRemoveFieldTitle')}
                  onClick={() => removeField(field.id)}
                >
                  ✕
                </button>
              </div>

              {field.type === 'select' && (
                <div style={subSettingStyle}>
                  <label style={subLabelStyle}>{t('customTypeOptionsLabel')}</label>
                  <textarea
                    value={field.optionsText}
                    placeholder={t('customTypeOptionsPlaceholder')}
                    rows={4}
                    onChange={(e) => updateField(field.id, { optionsText: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      fontSize: 13
                    }}
                  />
                </div>
              )}

              {field.type === 'reference' && (
                <div style={subSettingStyle}>
                  <label style={subLabelStyle}>{t('customTypeReferenceLabel')}</label>
                  <Select
                    block
                    ariaLabel={t('customTypeReferenceLabel')}
                    value={field.referenceCategory}
                    options={[
                      { value: '', label: t('customTypeReferenceAll') },
                      ...categoryChoices.map((choice) => ({
                        value: choice.slug,
                        label: choice.label,
                        icon: choice.icon || undefined
                      }))
                    ]}
                    onChange={(value) => updateField(field.id, { referenceCategory: value })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" style={{ width: '100%', marginTop: 8 }} onClick={addField}>
          {t('customTypeAddFieldBtn')}
        </button>
      </div>
    </Modal>
  );
}
