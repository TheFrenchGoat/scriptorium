import { useExportBusy } from '../../lib/export/export-busy';
import { useI18n } from '../../i18n';

export function ExportBusyOverlay() {
  const busy = useExportBusy();
  const { t } = useI18n();
  if (!busy) return null;
  return (
    <div className="export-busy-overlay" role="status" aria-live="polite">
      <div className="export-busy-box">
        <span className="export-busy-spinner" aria-hidden="true" />
        <span>{t('exportInProgress')}</span>
      </div>
    </div>
  );
}
