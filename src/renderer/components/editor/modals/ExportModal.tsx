// src/renderer/components/editor/modals/ExportModal.tsx
//
// Fenêtre « Exporter le document » des romans.
//
// Elle modifie une copie des réglages d'export du projet : rien n'est
// enregistré tant que l'auteur n'a pas cliqué sur « Exporter ». Les réglages
// sont alors mémorisés dans le projet, puis le fichier est produit (voir
// saveExportSettings et exportAs dans useEditorController).
//
// Formats proposés : PDF, Word, OpenDocument (.odt), texte brut et Markdown.

import React, { useEffect, useMemo, useState } from 'react';
import type { ExportBibleMode, ExportBibleSettings } from '../../../../shared/types';
import type { ExportBibleCategory } from '../../../lib/export/build-bible';

import { getLanguage, useI18n, type TranslationKey } from '../../../i18n';
import { Modal } from '../../common/Modal';
import { Select, type SelectOption } from '../../common/Select';
import { ExportPreview } from './ExportPreview';
import type { ExportPreviewSource } from '../../../lib/export/render-html';
import {
  applyExportTemplate,
  EXPORT_FONT_FAMILIES,
  EXPORT_LIMITS,
  EXPORT_SCENE_SEPARATORS,
  EXPORT_SEPARATOR_SYMBOLS,
  EXPORT_TEMPLATES
} from '../../../../shared/export-settings';
import type {
  ExportContentSettings,
  ExportFormat,
  ExportLayoutSettings,
  ExportPageSize,
  ExportSceneSeparator,
  ExportSettings,
  ExportTemplateId,
  ExportTitlePageSettings
} from '../../../../shared/types';

interface Choice<T> {
  value: T;
  labelKey: TranslationKey;
}

const FORMAT_CHOICES: Choice<ExportFormat>[] = [
  { value: 'pdf', labelKey: 'exportFormatPdf' },
  { value: 'docx', labelKey: 'exportFormatDocx' },
  { value: 'odt', labelKey: 'exportFormatOdt' },
  { value: 'txt', labelKey: 'exportFormatTxt' },
  { value: 'md', labelKey: 'exportFormatMd' }
];

const TEMPLATE_CHOICES: Choice<ExportTemplateId>[] = [
  { value: 'manuscript', labelKey: 'exportTemplateManuscript' },
  { value: 'novel', labelKey: 'exportTemplateNovel' }
];

const PAGE_SIZE_CHOICES: Choice<ExportPageSize>[] = [
  { value: 'a4', labelKey: 'exportPageA4' },
  { value: 'a5', labelKey: 'exportPageA5' },
  { value: 'letter', labelKey: 'exportPageLetter' }
];

const LINE_HEIGHT_CHOICES: Choice<number>[] = [
  { value: 1, labelKey: 'exportLineSingle' },
  { value: 1.15, labelKey: 'exportLine115' },
  { value: 1.5, labelKey: 'exportLine15' },
  { value: 2, labelKey: 'exportLineDouble' }
];

const CUSTOM_LINE_HEIGHT = 'custom';

function isPresetLineHeight(value: number): boolean {
  return LINE_HEIGHT_CHOICES.some((choice) => choice.value === value);
}

/** Affiche « 1,5 » en français et « 1.5 » en anglais. */
function formatNumber(value: number): string {
  const text = String(value);
  return getLanguage() === 'fr' ? text.replace('.', ',') : text;
}

// ----------------------------------------------------------------------------
// Petits composants
// ----------------------------------------------------------------------------

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}

/**
 * Champ numérique tolérant : l'auteur peut taper librement (virgule ou
 * point) ; la valeur est vérifiée et ramenée dans les limites quand le champ
 * perd le focus ou à l'appui sur Entrée.
 */
function NumberField({ value, min, max, ariaLabel, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatNumber(value));

  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }

    const clamped = Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
    setDraft(formatNumber(clamped));

    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className="export-number"
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

interface CheckRowProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}

function CheckRow({ checked, disabled, onChange, children }: CheckRowProps) {
  return (
    <label className="export-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="export-row">
      <span className="export-row-label">{label}</span>
      <div className="export-row-control">{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Fenêtre
// ----------------------------------------------------------------------------

const NO_BIBLE_CATEGORIES: ExportBibleCategory[] = [];

export interface ExportModalProps {
  projectName: string;
  chapterNames: string[];
  /** Categories de la bible de l'univers (avec nombre de fiches). */
  bibleCategories?: ExportBibleCategory[];
  initialSettings: ExportSettings;
  onCancel: () => void;
  onExport: (settings: ExportSettings) => void;
  /** Début du document pour l'aperçu (voir buildExportPreview). */
  buildPreview: (settings: ExportSettings) => ExportPreviewSource;
}

export function ExportModal({
  projectName,
  chapterNames,
  bibleCategories = NO_BIBLE_CATEGORIES,
  initialSettings,
  onCancel,
  onExport,
  buildPreview
}: ExportModalProps) {
  const { t } = useI18n();

  const [settings, setSettings] = useState<ExportSettings>(initialSettings);

  const [customLineHeight, setCustomLineHeight] = useState(
    () => !isPresetLineHeight(initialSettings.layout.lineHeight)
  );

  const { titlePage, content, layout } = settings;
  const L = EXPORT_LIMITS;

  const setTitlePage = (patch: Partial<ExportTitlePageSettings>) =>
    setSettings((prev) => ({ ...prev, titlePage: { ...prev.titlePage, ...patch } }));

  const setContent = (patch: Partial<ExportContentSettings>) =>
    setSettings((prev) => ({ ...prev, content: { ...prev.content, ...patch } }));

  const setLayout = (patch: Partial<ExportLayoutSettings>) =>
    setSettings((prev) => ({ ...prev, layout: { ...prev.layout, ...patch } }));

  const setBible = (patch: Partial<ExportBibleSettings>) =>
    setSettings((prev) => ({ ...prev, bible: { ...prev.bible, ...patch } }));

  const excluded = useMemo(
    () => new Set(content.excludedChapters),
    [content.excludedChapters]
  );

  const fontOptions: SelectOption[] = useMemo(() => {
    const names = EXPORT_FONT_FAMILIES.includes(layout.fontFamily)
      ? [...EXPORT_FONT_FAMILIES]
      : [layout.fontFamily, ...EXPORT_FONT_FAMILIES];

    return names.map((name) => ({
      value: name,
      label: name,
      style: { fontFamily: `"${name}"` }
    }));
  }, [layout.fontFamily]);

  const includedCount = chapterNames.filter((name) => !excluded.has(name)).length;
  const bibleSettings = settings.bible;
  const bibleItemCount = bibleCategories
    .filter((category) => !bibleSettings.excludedCategories.includes(category.slug))
    .reduce((sum, category) => sum + category.count, 0);
  const canExport = bibleSettings.mode === 'only' ? bibleItemCount > 0 : includedCount > 0;

  const bibleModeOptions: SelectOption[] = [
    { value: 'none', label: t('exportBibleModeNone') },
    { value: 'appendix', label: t('exportBibleModeAppendix') },
    { value: 'only', label: t('exportBibleModeOnly') }
  ];

  const toggleBibleCategory = (slug: string, checked: boolean) =>
    setBible({
      excludedCategories: checked
        ? bibleSettings.excludedCategories.filter((name) => name !== slug)
        : [...bibleSettings.excludedCategories, slug]
    });
  const showLayout =
    settings.format === 'pdf' || settings.format === 'docx' || settings.format === 'odt';

  const formatOptions: SelectOption[] = FORMAT_CHOICES.map((choice) => ({
    value: choice.value,
    label: t(choice.labelKey)
  }));

  const templateOptions: SelectOption[] = TEMPLATE_CHOICES.map((choice) => ({
    value: choice.value,
    label: t(choice.labelKey)
  }));

  const pageSizeOptions: SelectOption[] = PAGE_SIZE_CHOICES.map((choice) => ({
    value: choice.value,
    label: t(choice.labelKey)
  }));

  const lineHeightOptions: SelectOption[] = [
    ...LINE_HEIGHT_CHOICES.map((choice) => ({
      value: String(choice.value),
      label: t(choice.labelKey)
    })),
    { value: CUSTOM_LINE_HEIGHT, label: t('exportLineCustom') }
  ];

  const separatorOptions: SelectOption[] = EXPORT_SCENE_SEPARATORS.map((id) => ({
    value: id,
    label: EXPORT_SEPARATOR_SYMBOLS[id] || t('exportSeparatorBlank')
  }));

  const toggleChapter = (name: string, include: boolean) => {
    setSettings((prev) => {
      const next = new Set(prev.content.excludedChapters);

      if (include) next.delete(name);
      else next.add(name);

      return { ...prev, content: { ...prev.content, excludedChapters: Array.from(next) } };
    });
  };

  const changeTemplate = (value: string) => {
    const id = value as ExportTemplateId;
    setSettings((prev) => applyExportTemplate(prev, id));
    setCustomLineHeight(!isPresetLineHeight(EXPORT_TEMPLATES[id].layout.lineHeight));
  };

  const changeLineHeight = (value: string) => {
    if (value === CUSTOM_LINE_HEIGHT) {
      setCustomLineHeight(true);
      return;
    }

    setCustomLineHeight(false);
    setLayout({ lineHeight: Number(value) });
  };

  const footer = (
    <>
      <button type="button" onClick={onCancel}>
        {t('exportCancelBtn')}
      </button>
      <button
        type="button"
        className="export-confirm"
        disabled={!canExport}
        onClick={() => onExport(settings)}
      >
        {t('exportConfirmBtn')}
      </button>
    </>
  );

  return (
    <Modal
      open
      title={t('exportModalTitle')}
      width="min(1080px, 95vw)"
      onCancel={onCancel}
      footer={footer}
    >
      <div className="export-layout">
      <div className="export-modal">
        <section className="export-section">
          <h4>{t('exportSectionDocument')}</h4>

          <FieldRow label={t('exportFormatLabel')}>
            <Select
              block
              value={settings.format}
              options={formatOptions}
              ariaLabel={t('exportFormatLabel')}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, format: value as ExportFormat }))
              }
            />
          </FieldRow>

          <FieldRow label={t('exportTemplateLabel')}>
            <Select
              block
              value={settings.template}
              options={templateOptions}
              ariaLabel={t('exportTemplateLabel')}
              onChange={changeTemplate}
            />
          </FieldRow>

          <p className="export-hint">{t('exportTemplateHint')}</p>
        </section>

        <section className="export-section">
          <h4>{t('exportSectionTitlePage')}</h4>

          <CheckRow
            checked={titlePage.enabled}
            onChange={(checked) => setTitlePage({ enabled: checked })}
          >
            {t('exportTitlePageEnabled')}
          </CheckRow>

          <FieldRow label={t('exportTitleLabel')}>
            <input
              type="text"
              value={titlePage.title}
              placeholder={projectName}
              maxLength={L.textLength}
              aria-label={t('exportTitleLabel')}
              onChange={(event) => setTitlePage({ title: event.target.value })}
            />
          </FieldRow>

          <FieldRow label={t('exportSubtitleLabel')}>
            <input
              type="text"
              value={titlePage.subtitle}
              maxLength={L.textLength}
              aria-label={t('exportSubtitleLabel')}
              onChange={(event) => setTitlePage({ subtitle: event.target.value })}
            />
          </FieldRow>

          <CheckRow
            checked={titlePage.showAuthor}
            onChange={(checked) => setTitlePage({ showAuthor: checked })}
          >
            {t('exportShowAuthor')}
          </CheckRow>

          <FieldRow label={t('exportAuthorLabel')}>
            <input
              type="text"
              value={titlePage.author}
              disabled={!titlePage.showAuthor}
              placeholder={t('exportAuthorPlaceholder')}
              maxLength={L.textLength}
              aria-label={t('exportAuthorLabel')}
              onChange={(event) => setTitlePage({ author: event.target.value })}
            />
          </FieldRow>
        </section>

        <section className="export-section">
          <h4>{t('exportSectionContent')}</h4>

          {chapterNames.length === 0 ? (
            <p className="export-hint">{t('exportNoChapters')}</p>
          ) : (
            <>
              <div className="export-chapters-head">
                <span>
                  {t('exportChaptersLabel', {
                    count: includedCount,
                    total: chapterNames.length
                  })}
                </span>
                <div className="export-chapter-tools">
                  <button type="button" onClick={() => setContent({ excludedChapters: [] })}>
                    {t('exportCheckAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContent({ excludedChapters: [...chapterNames] })}
                  >
                    {t('exportUncheckAll')}
                  </button>
                </div>
              </div>

              <div className="export-chapters">
                {chapterNames.map((name) => (
                  <CheckRow
                    key={name}
                    checked={!excluded.has(name)}
                    onChange={(checked) => toggleChapter(name, checked)}
                  >
                    {name}
                  </CheckRow>
                ))}
              </div>
            </>
          )}

          <CheckRow
            checked={content.tableOfContents}
            onChange={(checked) => setContent({ tableOfContents: checked })}
          >
            {t('exportTocOption')}
          </CheckRow>

          <CheckRow
            checked={content.chapterOnNewPage}
            onChange={(checked) => setContent({ chapterOnNewPage: checked })}
          >
            {t('exportChapterNewPage')}
          </CheckRow>

          <div className="export-inline">
            <CheckRow
              checked={content.sceneSeparators}
              onChange={(checked) => setContent({ sceneSeparators: checked })}
            >
              {t('exportSceneSeparators')}
            </CheckRow>
            <Select
              value={content.sceneSeparator}
              options={separatorOptions}
              ariaLabel={t('exportSceneSeparators')}
              disabled={!content.sceneSeparators}
              onChange={(value) =>
                setContent({ sceneSeparator: value as ExportSceneSeparator })
              }
            />
          </div>

          <CheckRow
            checked={content.ignoreEmptyLines}
            onChange={(checked) => setContent({ ignoreEmptyLines: checked })}
          >
            {t('exportIgnoreEmptyLines')}
          </CheckRow>

          <CheckRow
            checked={content.keepEditorFormatting}
            onChange={(checked) => setContent({ keepEditorFormatting: checked })}
          >
            {t('exportKeepFormatting')}
          </CheckRow>
        </section>

        <section className="export-section">
          <h4>{t('exportSectionBible')}</h4>

          <FieldRow label={t('exportBibleMode')}>
            <Select
              block
              value={bibleSettings.mode}
              options={bibleModeOptions}
              ariaLabel={t('exportBibleMode')}
              onChange={(value) => setBible({ mode: value as ExportBibleMode })}
            />
          </FieldRow>

          {bibleSettings.mode === 'none' ? null : bibleCategories.length === 0 ? (
            <p className="export-hint">{t('exportBibleEmpty')}</p>
          ) : (
            <>
              <p className="export-hint">{t('exportBibleCategories')}</p>
              <div className="export-chapters">
                {bibleCategories.map((category) => (
                  <CheckRow
                    key={category.slug}
                    checked={!bibleSettings.excludedCategories.includes(category.slug)}
                    disabled={false}
                    onChange={(checked) => toggleBibleCategory(category.slug, checked)}
                  >
                    {`${category.label} (${category.count})`}
                  </CheckRow>
                ))}
              </div>

              <CheckRow
                checked={bibleSettings.portraits}
                disabled={false}
                onChange={(checked) => setBible({ portraits: checked })}
              >
                {t('exportBiblePortraits')}
              </CheckRow>

              <CheckRow
                checked={bibleSettings.relations}
                disabled={false}
                onChange={(checked) => setBible({ relations: checked })}
              >
                {t('exportBibleRelations')}
              </CheckRow>

              <CheckRow
                checked={bibleSettings.timeline}
                disabled={false}
                onChange={(checked) => setBible({ timeline: checked })}
              >
                {t('exportBibleTimeline')}
              </CheckRow>
            </>
          )}
        </section>

        <section className="export-section">
          <h4>{t('exportSectionLayout')}</h4>

          {showLayout ? (
            <>
              <FieldRow label={t('exportPageSize')}>
                <Select
                  block
                  value={layout.pageSize}
                  options={pageSizeOptions}
                  ariaLabel={t('exportPageSize')}
                  onChange={(value) => setLayout({ pageSize: value as ExportPageSize })}
                />
              </FieldRow>

              <FieldRow label={t('exportFontFamily')}>
                <Select
                  block
                  value={layout.fontFamily}
                  options={fontOptions}
                  ariaLabel={t('exportFontFamily')}
                  onChange={(value) => setLayout({ fontFamily: value })}
                />
              </FieldRow>

              <FieldRow label={t('exportFontSize')}>
                <NumberField
                  value={layout.fontSize}
                  min={L.fontSize.min}
                  max={L.fontSize.max}
                  ariaLabel={t('exportFontSize')}
                  onChange={(value) => setLayout({ fontSize: value })}
                />
              </FieldRow>

              <FieldRow label={t('exportLineHeight')}>
                <div className="export-inline">
                  <Select
                    value={customLineHeight ? CUSTOM_LINE_HEIGHT : String(layout.lineHeight)}
                    options={lineHeightOptions}
                    ariaLabel={t('exportLineHeight')}
                    onChange={changeLineHeight}
                  />
                  {customLineHeight && (
                    <NumberField
                      value={layout.lineHeight}
                      min={L.lineHeight.min}
                      max={L.lineHeight.max}
                      ariaLabel={t('exportLineCustomValue')}
                      onChange={(value) => setLayout({ lineHeight: value })}
                    />
                  )}
                </div>
              </FieldRow>

              <FieldRow label={t('exportMargins')}>
                <NumberField
                  value={layout.marginCm}
                  min={L.marginCm.min}
                  max={L.marginCm.max}
                  ariaLabel={t('exportMargins')}
                  onChange={(value) => setLayout({ marginCm: value })}
                />
              </FieldRow>

              <FieldRow label={t('exportIndent')}>
                <NumberField
                  value={layout.firstLineIndentCm}
                  min={L.indentCm.min}
                  max={L.indentCm.max}
                  ariaLabel={t('exportIndent')}
                  onChange={(value) => setLayout({ firstLineIndentCm: value })}
                />
              </FieldRow>

              <CheckRow
                checked={layout.justify}
                onChange={(checked) => setLayout({ justify: checked })}
              >
                {t('exportJustify')}
              </CheckRow>

              <CheckRow
                checked={layout.pageNumbers}
                onChange={(checked) => setLayout({ pageNumbers: checked })}
              >
                {t('exportPageNumbers')}
              </CheckRow>

              <CheckRow
                checked={settings.runningHeader}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, runningHeader: checked }))
                }
              >
                {t('exportRunningHeader')}
              </CheckRow>
            </>
          ) : (
            <p className="export-hint">{t('exportLayoutTextHint')}</p>
          )}
        </section>
      </div>
      <ExportPreview settings={settings} buildPreview={buildPreview} />
      </div>
    </Modal>
  );
}