// src/renderer/components/editor/modals/CustomWbTypeModal.tsx
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useDialogs } from '../../common/Dialogs';
import { Modal } from '../../common/Modal';
import { EmojiPicker } from '../../common/EmojiPicker';
import { buildCustomTypeFields } from '../useEditorController';
import type { EditorController } from '../useEditorController';
import type { WbFieldType } from '../../../../shared/types';

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
}

let fieldIdSeq = 0;

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
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#94a3b8');
  const [fields, setFields] = useState<FieldDraft[]>([]);

  useEffect(() => {
    if (!open) return;

    if (editingSlug) {
      const def = controller.data().customWbTypes?.[editingSlug];
      if (def) {
        setName(def.label);
        setIcon(def.icon || '📁');
        setColor(def.defaultColor || '#94a3b8');
        setFields(
          def.fields.map((f) => ({ id: fieldIdSeq++, label: f.label, type: f.type, existingKey: f.key }))
        );
        return;
      }
    }

    setName('');
    setIcon('📁');
    setColor('#94a3b8');
    setFields([{ id: fieldIdSeq++, label: t('customTypeDefaultFieldLabel'), type: 'textarea' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingSlug]);

  const addField = () => setFields((prev) => [...prev, { id: fieldIdSeq++, label: '', type: 'text' }]);
  const removeField = (id: number) => setFields((prev) => prev.filter((f) => f.id !== id));
  const updateField = (id: number, patch: Partial<FieldDraft>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const confirm = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showInfo(t('customTypeNameRequired'));
      return;
    }

    const rawFields = fields
      .map((f) => ({ label: f.label.trim(), type: f.type, existingKey: f.existingKey }))
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

    const wasEditing = !!editingSlug;
    const finalFields = buildCustomTypeFields(rawFields);
    const finalSlug = controller.saveCustomType(editingSlug, {
      label: trimmedName,
      icon: icon || '📁',
      defaultColor: color,
      fields: finalFields
    });

    onClose();
    // À la création (pas à la modification), enchaîne directement sur la
    // création d'une première fiche de ce nouveau type.
    if (!wasEditing) onCreated(finalSlug);
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
            <div className="custom-type-field-row" key={field.id}>
              <input
                type="text"
                className="custom-type-field-label"
                placeholder={t('customTypeFieldLabelPlaceholder')}
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
              />
              <select
                className="custom-type-field-type"
                value={field.type}
                onChange={(e) => updateField(field.id, { type: e.target.value as WbFieldType })}
              >
                <option value="text">{t('customTypeFieldTypeText')}</option>
                <option value="textarea">{t('customTypeFieldTypeTextarea')}</option>
              </select>
              <button
                type="button"
                className="btn-remove-field"
                title={t('customTypeRemoveFieldTitle')}
                onClick={() => removeField(field.id)}
              >
                ✕
              </button>
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
