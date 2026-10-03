// src/renderer/components/editor/StatusBar.tsx
// Barre de statut basse : compteur de mots/caractères, statut de sauvegarde,
// indicateur du correcteur de grammaire, timer et lecteur de musique.
//
// C'est l'un des rares endroits qui se re-rend à chaque frappe (via
// useEditorStatus) : Timer et MusicPlayer sont mémoïsés pour ne pas être
// recréés inutilement à chaque frappe dans le chapitre.
//
// Le compteur de sélection vérifie explicitement que les deux extrémités de
// la sélection se trouvent dans #editor. Une sélection faite dans la barre
// d'outils, la sidebar ou une modale ne doit jamais remplacer les statistiques
// du chapitre.

import React, {
  memo,
  useEffect,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import { useEditorStatus } from './editor-status';
import { Timer } from './Timer';
import { MusicPlayer } from './MusicPlayer';
import type { EditorController } from './useEditorController';

export interface StatusBarProps {
  controller: EditorController;
  onOpenGrammarSetup: () => void;
}

interface SelectedTextStats {
  words: number;
  chars: number;
}

const MemoTimer = memo(Timer);
const MemoMusicPlayer = memo(MusicPlayer);

/**
 * Vérifie qu'un nœud appartient bien à la page d'écriture.
 *
 * La sélection complète doit être contenue dans #editor. Cela empêche par
 * exemple le texte sélectionné dans un bouton, un menu ou la sidebar d'être
 * compté comme une sélection du chapitre.
 */
function isNodeInsideEditor(
  editor: HTMLElement,
  node: Node
): boolean {
  return node === editor || editor.contains(node);
}

/**
 * Calcule le nombre de mots contenus dans une sélection.
 */
function countSelectedWords(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export function StatusBar({
  controller,
  onOpenGrammarSetup
}: StatusBarProps): React.ReactElement {
  const { t } = useI18n();
  const status = useEditorStatus(controller.status);

  const timerAnchorRef =
    useRef<HTMLDivElement | null>(null);

  const [
    selectedTextStats,
    setSelectedTextStats
  ] = useState<SelectedTextStats | null>(
    null
  );

  /*
   * activeTab() permet de recréer les écouteurs lorsque l'utilisateur change
   * de chapitre. Le contrôleur reste stable, mais le nœud #editor peut être
   * remplacé lors d'un changement d'onglet.
   */
  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

  useEffect(() => {
    let animationFrame: number | null =
      null;

    const updateSelectedTextStats =
      (): void => {
        if (animationFrame !== null) {
          cancelAnimationFrame(
            animationFrame
          );
        }

        animationFrame =
          requestAnimationFrame(() => {
            animationFrame = null;

            const editor =
              document.getElementById(
                'editor'
              );

            const selection =
              window.getSelection();

            if (
              activeType !== 'chapter' ||
              !editor ||
              !selection ||
              selection.rangeCount === 0 ||
              selection.isCollapsed
            ) {
              setSelectedTextStats(
                null
              );
              return;
            }

            const range =
              selection.getRangeAt(0);

            /*
             * Les deux extrémités doivent se trouver dans l'éditeur.
             * Cela couvre également Ctrl+A lorsque le Range commence ou se
             * termine directement sur le nœud #editor.
             */
            const selectionIsInsideEditor =
              isNodeInsideEditor(
                editor,
                range.startContainer
              ) &&
              isNodeInsideEditor(
                editor,
                range.endContainer
              );

            if (
              !selectionIsInsideEditor
            ) {
              setSelectedTextStats(
                null
              );
              return;
            }

            const selectedText =
              range.toString();

            if (
              selectedText.length === 0
            ) {
              setSelectedTextStats(
                null
              );
              return;
            }

            const nextStats: SelectedTextStats =
              {
                words:
                  countSelectedWords(
                    selectedText
                  ),

                /*
                 * Pour les caractères, on conserve les espaces et les sauts
                 * de ligne réellement présents dans la sélection.
                 */
                chars:
                  selectedText.length
              };

            setSelectedTextStats(
              (previous) => {
                if (
                  previous &&
                  previous.words ===
                    nextStats.words &&
                  previous.chars ===
                    nextStats.chars
                ) {
                  return previous;
                }

                return nextStats;
              }
            );
          });
      };

    const editor =
      document.getElementById(
        'editor'
      );

    document.addEventListener(
      'selectionchange',
      updateSelectedTextStats
    );

    /*
     * selectionchange couvre normalement ces situations. Les événements
     * supplémentaires rendent cependant la mise à jour plus fiable après une
     * modification du contenu ou un changement de sélection au clavier.
     */
    editor?.addEventListener(
      'input',
      updateSelectedTextStats
    );

    editor?.addEventListener(
      'keyup',
      updateSelectedTextStats
    );

    editor?.addEventListener(
      'mouseup',
      updateSelectedTextStats
    );

    updateSelectedTextStats();

    return () => {
      document.removeEventListener(
        'selectionchange',
        updateSelectedTextStats
      );

      editor?.removeEventListener(
        'input',
        updateSelectedTextStats
      );

      editor?.removeEventListener(
        'keyup',
        updateSelectedTextStats
      );

      editor?.removeEventListener(
        'mouseup',
        updateSelectedTextStats
      );

      if (
        animationFrame !== null
      ) {
        cancelAnimationFrame(
          animationFrame
        );
      }
    };
  }, [
    activeTab,
    activeType
  ]);

  /*
   * Ajoute l'espacement du groupe Timer/Session directement depuis son
   * conteneur parent. Timer.tsx n'a donc pas besoin d'être modifié uniquement
   * pour une règle de présentation.
   */
  useEffect(() => {
    const timerContainer =
      timerAnchorRef.current
        ?.querySelector<HTMLElement>(
          '#timerContainer'
        );

    if (!timerContainer) {
      return;
    }

    const previousDisplay =
      timerContainer.style.display;

    const previousAlignItems =
      timerContainer.style.alignItems;

    const previousGap =
      timerContainer.style.gap;

    const previousPadding =
      timerContainer.style.padding;

    const previousMargin =
      timerContainer.style.margin;

    timerContainer.style.display =
      'flex';

    timerContainer.style.alignItems =
      'center';

    timerContainer.style.gap = '6px';

    timerContainer.style.padding =
      '2px 6px';

    timerContainer.style.margin =
      '0 4px';

    return () => {
      timerContainer.style.display =
        previousDisplay;

      timerContainer.style.alignItems =
        previousAlignItems;

      timerContainer.style.gap =
        previousGap;

      timerContainer.style.padding =
        previousPadding;

      timerContainer.style.margin =
        previousMargin;
    };
  }, []);

  const statsText =
    status.sheetMode
      ? t('statsSheetMode')
      : selectedTextStats
        ? t('statsSelected', {
            words:
              selectedTextStats.words,
            chars:
              selectedTextStats.chars,
            total:
              status.totalWords
          })
        : t('statsNormal', {
            words: status.words,
            chars: status.chars,
            total:
              status.totalWords
          });

  const saveStatusText =
    status.saveState === 'pending'
      ? t('saveStatusPending')
      : status.saveState === 'error'
        ? t('saveStatusError')
        : status.savedAt
          ? t('saveStatusSavedAt', {
              time: status.savedAt
            })
          : t('saveStatusSaved');

  const grammarLabel =
    !status.grammarEnabled
      ? null
      : status.grammarStarting
        ? {
            text: t(
              'grammarStatusBarStarting'
            ),
            title: t(
              'grammarStatusBarStartingTitle'
            ),
            cls: 'status-starting'
          }
        : status.grammarReady
          ? {
              text: t(
                'grammarStatusBarReady'
              ),
              title: t(
                'grammarStatusBarReadyTitle'
              ),
              cls: 'status-ready'
            }
          : {
              text: t(
                'grammarStatusBarError'
              ),
              title: t(
                'grammarStatusBarErrorTitle'
              ),
              cls: 'status-error'
            };

  return (
    <div className="status">
      <div className="status-left">
        <span id="stats">
          {statsText}
        </span>

        <span
          id="saveStatus"
          className={`save-status ${status.saveState}`}
        >
          {saveStatusText}
        </span>

        {grammarLabel && (
          <button
            id="grammarStatusIndicator"
            type="button"
            className={`grammar-status-indicator ${grammarLabel.cls}`}
            title={
              grammarLabel.title
            }
            onClick={
              onOpenGrammarSetup
            }
          >
            {grammarLabel.text}
          </button>
        )}
      </div>

      <div
        ref={timerAnchorRef}
        className="status-timer-anchor"
      >
        <MemoTimer
          controller={controller}
        />
      </div>

      <MemoMusicPlayer />
    </div>
  );
}
