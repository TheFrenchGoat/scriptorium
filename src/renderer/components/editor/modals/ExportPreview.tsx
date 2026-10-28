// src/renderer/components/editor/modals/ExportPreview.tsx
//
// Aperçu de la fenêtre d'export (colonne de droite).
//
// Le HTML de l'aperçu est inséré dans un shadow DOM : les styles de
// l'application (thème sombre, champs de formulaire…) ne s'y appliquent
// pas, et ceux du document n'en sortent pas. La feuille de style est donnée
// par adoptedStyleSheets. Le texte de l'auteur est échappé par
// renderExportPreview.
//
// L'aperçu est recalculé peu après le dernier changement de réglage, pour
// rester fluide pendant la saisie d'un titre.

import React, { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../i18n';
import {
  renderExportPreview,
  type ExportPreviewSource
} from '../../../lib/export/render-html';
import type { ExportSettings } from '../../../../shared/types';

/** Largeur d'une feuille dans la colonne d'aperçu, en pixels. */
const PREVIEW_SHEET_WIDTH = 380;

/** Délai avant de recalculer l'aperçu, en millisecondes. */
const PREVIEW_DELAY_MS = 250;

export interface ExportPreviewProps {
  settings: ExportSettings;
  buildPreview: (settings: ExportSettings) => ExportPreviewSource;
}

export function ExportPreview({ settings, buildPreview }: ExportPreviewProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);

  // La fonction change à chaque rendu de la page : on garde la dernière sans
  // relancer le calcul pour autant.
  const buildRef = useRef(buildPreview);
  buildRef.current = buildPreview;

  const [source, setSource] = useState<ExportPreviewSource | null>(null);
  const [failed, setFailed] = useState(false);

  const hasLayout =
    settings.format === 'pdf' || settings.format === 'docx' || settings.format === 'odt' || settings.format === 'epub';

  useEffect(() => {
    if (!hasLayout) return;

    const timer = window.setTimeout(() => {
      try {
        setSource(buildRef.current(settings));
        setFailed(false);
      } catch (error) {
        console.error('Apercu d export impossible :', error);
        setFailed(true);
      }
    }, PREVIEW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [settings, hasLayout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !source) return;

    try {
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      const markup = renderExportPreview(source.document, {
        sheetWidthPx: PREVIEW_SHEET_WIDTH,
        tocTitles: source.tocTitles
      });

      const sheet = new CSSStyleSheet();
      sheet.replaceSync(markup.css);
      root.adoptedStyleSheets = [sheet];
      root.innerHTML = markup.html;
    } catch (error) {
      console.error('Affichage de l apercu impossible :', error);
      setFailed(true);
    }
  }, [source, hasLayout]);

  return (
    <aside className="export-preview" aria-label={t('exportPreviewTitle')}>
      <div className="export-preview-head">
        <strong>{t('exportPreviewTitle')}</strong>
        {hasLayout ? t('exportPreviewHint') : t('exportPreviewNoLayout')}
        {hasLayout && source?.truncated && (
          <span className="export-preview-note">{t('exportPreviewTruncated')}</span>
        )}
      </div>

      {hasLayout && (
        <div className="export-preview-body">
          {failed && <p className="export-preview-empty">{t('exportPreviewError')}</p>}
          <div ref={hostRef} />
        </div>
      )}
    </aside>
  );
}