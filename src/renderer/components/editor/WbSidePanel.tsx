import { useI18n } from '../../i18n';
import type { EditorController } from './useEditorController';
import { WbSheet } from './WbSheet';

/**
 * Événement window qui pilote le panneau latéral des fiches.
 * N'importe quel composant (barre d'outils, chapitres, scénario)
 * peut l'envoyer sans dépendre de EditorPage.
 */
export const WB_PANEL_EVENT = 'scriptorium:wb-panel';

export type WbPanelAction = 'open' | 'close' | 'toggle';

export interface WbPanelEventDetail {
  action: WbPanelAction;
  itemId?: string | null;
}

export function dispatchWbPanelEvent(detail: WbPanelEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<WbPanelEventDetail>(WB_PANEL_EVENT, {
      detail,
    }),
  );
}

export function openWbPanel(itemId?: string | null): void {
  dispatchWbPanelEvent({
    action: 'open',
    itemId,
  });
}

export function closeWbPanel(): void {
  dispatchWbPanelEvent({
    action: 'close',
  });
}

export function toggleWbPanel(): void {
  dispatchWbPanelEvent({
    action: 'toggle',
  });
}

interface WbSidePanelProps {
  controller: EditorController;
  itemId: string | null;
  onClose: () => void;
  onSelectItem: (itemId: string | null) => void;
}

export function WbSidePanel({
  controller,
  itemId,
  onClose,
  onSelectItem,
}: WbSidePanelProps) {
  const { t } = useI18n();

  const world = controller.data().world;
  const currentId = itemId && world?.[itemId] ? itemId : null;

  function handleOpenInTab(): void {
    if (!currentId) return;
    controller.openItem(
      currentId,
      'world',
    );
  }

  return (
    <div
      className="wb-side-panel"
      role="complementary"
      aria-label={t('wbPanelTitle')}
    >
      <div className="wb-side-panel-header">
        <span className="wb-side-panel-title">
          {t('wbPanelTitle')}
        </span>
        <button
          type="button"
          className="wb-side-panel-close"
          title={t('wbPanelClose')}
          aria-label={t('wbPanelClose')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {currentId ? (
        <>
          <div className="wb-side-panel-actions">
            <button
              type="button"
              className="wb-side-panel-action-btn"
              onClick={() => onSelectItem(null)}
            >
              {t('wbPanelBackToList')}
            </button>
            <button
              type="button"
              className="wb-side-panel-action-btn"
              onClick={handleOpenInTab}
            >
              {t('wbPanelOpenInTab')}
            </button>
          </div>
          <div className="wb-side-panel-body">
            <WbSheet
              key={currentId}
              controller={controller}
              name={currentId}
            />
          </div>
        </>
      ) : (
        <div className="wb-side-panel-empty">
          {t('wbPanelEmpty')}
        </div>
      )}
    </div>
  );
}
