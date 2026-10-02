// src/renderer/components/editor/StatusBar.tsx
// Barre de statut basse : compteur de mots/caractères, statut de sauvegarde,
// indicateur du correcteur de grammaire, timer et lecteur de musique.
// C'est l'un des rares endroits qui se re-rend à chaque frappe (via
// useEditorStatus) : Timer et MusicPlayer sont mémoïsés pour ne pas être
// recréés inutilement à chaque frappe dans le chapitre.

import React, { memo } from 'react';
import { useI18n } from '../../i18n';
import { useEditorStatus } from './editor-status';
import { Timer } from './Timer';
import { MusicPlayer } from './MusicPlayer';
import type { EditorController } from './useEditorController';

export interface StatusBarProps {
  controller: EditorController;
  onOpenGrammarSetup: () => void;
}

const MemoTimer = memo(Timer);
const MemoMusicPlayer = memo(MusicPlayer);

export function StatusBar({ controller, onOpenGrammarSetup }: StatusBarProps): React.ReactElement {
  const { t } = useI18n();
  const status = useEditorStatus(controller.status);

  const statsText = status.sheetMode
    ? t('statsSheetMode')
    : status.selectionActive
      ? t('statsSelected', { words: status.words, chars: status.chars, total: status.totalWords })
      : t('statsNormal', { words: status.words, chars: status.chars, total: status.totalWords });

  const saveStatusText =
    status.saveState === 'pending'
      ? t('saveStatusPending')
      : status.saveState === 'error'
        ? t('saveStatusError')
        : status.savedAt
          ? t('saveStatusSavedAt', { time: status.savedAt })
          : t('saveStatusSaved');

  const grammarLabel = !status.grammarEnabled
    ? null
    : status.grammarStarting
      ? { text: t('grammarStatusBarStarting'), title: t('grammarStatusBarStartingTitle'), cls: 'status-starting' }
      : status.grammarReady
        ? { text: t('grammarStatusBarReady'), title: t('grammarStatusBarReadyTitle'), cls: 'status-ready' }
        : { text: t('grammarStatusBarError'), title: t('grammarStatusBarErrorTitle'), cls: 'status-error' };

  return (
    <div className="status">
      <div className="status-left">
        <span id="stats">{statsText}</span>
        <span id="saveStatus" className={`save-status ${status.saveState}`}>
          {saveStatusText}
        </span>
        {grammarLabel && (
          <button
            id="grammarStatusIndicator"
            className={`grammar-status-indicator ${grammarLabel.cls}`}
            title={grammarLabel.title}
            onClick={onOpenGrammarSetup}
          >
            {grammarLabel.text}
          </button>
        )}
      </div>
      <div className="status-timer-anchor">
        <MemoTimer controller={controller} />
      </div>
      <MemoMusicPlayer />
    </div>
  );
}
