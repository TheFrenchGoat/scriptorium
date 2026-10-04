// src/renderer/components/editor/StatusBar.tsx
//
// Barre de statut commune aux projets roman et scénario.

import React, {
  memo,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  useI18n
} from '../../i18n';

import {
  getSceneHeadingText,
  screenplayHtmlToPlainText
} from '../../lib/screenplay';

import {
  useEditorStatus
} from './editor-status';

import {
  SCREENPLAY_POSITION_EVENT
} from './ScreenplayEditor';

import type {
  ScreenplayPositionDetail
} from './ScreenplayEditor';

import type {
  EditorController
} from './useEditorController';

import {
  Timer
} from './Timer';

import {
  MusicPlayer
} from './MusicPlayer';

export interface StatusBarProps {
  controller: EditorController;

  /*
   * Cette propriété est déjà fournie par EditorPage.
   * Elle reste facultative pour que StatusBar puisse aussi être utilisé sans
   * fenêtre de configuration du correcteur.
   */
  onOpenGrammarSetup?: () => void;
}

const MemoTimer =
  memo(Timer);

const MemoMusicPlayer =
  memo(MusicPlayer);

function countWords(
  value: string
): number {
  const normalized =
    value
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (!normalized) {
    return 0;
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function getScreenplayTotalWords(
  controller: EditorController
): number {
  const data =
    controller.data();

  const screenplay =
    data.screenplay;

  if (!screenplay) {
    return 0;
  }

  let total = 0;

  screenplay.scenes.forEach(
    (scene) => {
      total += countWords(
        getSceneHeadingText(
          scene,
          screenplay.settings
            .conventionLanguage
        )
      );

      scene.elements.forEach(
        (element) => {
          total += countWords(
            screenplayHtmlToPlainText(
              element.html
            )
          );
        }
      );
    }
  );

  return total;
}

function getScreenplayElementLabel(
  type:
    ScreenplayPositionDetail['type'],
  language: 'fr' | 'en'
): string {
  if (
    language === 'en'
  ) {
    switch (type) {
      case 'scene-heading':
        return 'Scene heading';

      case 'action':
        return 'Action';

      case 'character':
        return 'Character';

      case 'parenthetical':
        return 'Parenthetical';

      case 'dialogue':
        return 'Dialogue';

      case 'transition':
        return 'Transition';

      case 'shot':
        return 'Shot';
    }
  }

  switch (type) {
    case 'scene-heading':
      return 'En-tête';

    case 'action':
      return 'Action';

    case 'character':
      return 'Personnage';

    case 'parenthetical':
      return 'Indication';

    case 'dialogue':
      return 'Dialogue';

    case 'transition':
      return 'Transition';

    case 'shot':
      return 'Plan';
  }
}

function getScreenplayPositionText(
  position:
    ScreenplayPositionDetail,
  language: 'fr' | 'en'
): string {
  const sceneText =
    language === 'en'
      ? `Scene ${position.sceneIndex + 1}/${position.sceneCount}`
      : `Scène ${position.sceneIndex + 1}/${position.sceneCount}`;

  const typeText =
    getScreenplayElementLabel(
      position.type,
      language
    );

  if (
    position.type ===
      'scene-heading' ||
    position.elementIndex ===
      null ||
    position.elementCount <= 0
  ) {
    return `${sceneText} · ${typeText}`;
  }

  const elementText =
    language === 'en'
      ? `Element ${position.elementIndex + 1}/${position.elementCount}`
      : `Élément ${position.elementIndex + 1}/${position.elementCount}`;

  return `${sceneText} · ${elementText} · ${typeText}`;
}

export function StatusBar({
  controller,
  onOpenGrammarSetup
}: StatusBarProps): React.ReactElement {
  const {
    t,
    lang
  } = useI18n();

  const status =
    useEditorStatus(
      controller.status
    );

  const activeType =
    controller.activeType();

  const isScreenplay =
    controller.data()
      .projectType ===
    'screenplay';

  const [
    screenplayPosition,
    setScreenplayPosition
  ] = useState<
    ScreenplayPositionDetail | null
  >(null);

  useEffect(() => {
    let animationFrame:
      | number
      | null = null;

    const updateSelectionStats =
      (): void => {
        if (
          animationFrame !==
          null
        ) {
          window.cancelAnimationFrame(
            animationFrame
          );
        }

        animationFrame =
          window.requestAnimationFrame(
            () => {
              animationFrame =
                null;

              controller.updateStats();
            }
          );
      };

    document.addEventListener(
      'selectionchange',
      updateSelectionStats
    );

    return () => {
      document.removeEventListener(
        'selectionchange',
        updateSelectionStats
      );

      if (
        animationFrame !== null
      ) {
        window.cancelAnimationFrame(
          animationFrame
        );
      }
    };
  }, [controller]);

  useEffect(() => {
    const updatePosition =
      (
        event: Event
      ): void => {
        const customEvent =
          event as CustomEvent<
            ScreenplayPositionDetail | null
          >;

        setScreenplayPosition(
          customEvent.detail ??
          null
        );
      };

    window.addEventListener(
      SCREENPLAY_POSITION_EVENT,
      updatePosition
    );

    return () => {
      window.removeEventListener(
        SCREENPLAY_POSITION_EVENT,
        updatePosition
      );
    };
  }, []);

  useEffect(() => {
    if (
      !isScreenplay ||
      activeType !== 'scene'
    ) {
      setScreenplayPosition(
        null
      );
    }
  }, [
    activeType,
    isScreenplay
  ]);

  /*
   * Le calcul du total inclut les en-têtes de scène. Cela évite par exemple
   * d’afficher "8 mots dans la scène / 4 mots dans le projet".
   */
  const totalWords =
    isScreenplay
      ? getScreenplayTotalWords(
          controller
        )
      : status.totalWords;

  const statisticsText =
    useMemo((): string => {
      if (status.sheetMode) {
        return t(
          'statsSheetMode'
        );
      }

      if (
        status.selectionActive
      ) {
        return t(
          'statsSelected',
          {
            words:
              status.words,

            chars:
              status.chars
          }
        );
      }

      return t(
        'statsNormal',
        {
          words:
            status.words,

          chars:
            status.chars,

          total:
            Math.max(
              totalWords,
              status.words
            )
        }
      );
    }, [
      status.chars,
      status.selectionActive,
      status.sheetMode,
      status.words,
      t,
      totalWords
    ]);

  const saveStatusText =
    useMemo((): string => {
      switch (
        status.saveState
      ) {
        case 'pending':
          return t(
            'saveStatusPending'
          );

        case 'error':
          return t(
            'saveStatusError'
          );

        case 'saved':
        default:
          return status.savedAt
            ? t(
                'saveStatusSavedAt',
                {
                  time:
                    status.savedAt
                }
              )
            : t(
                'saveStatusSaved'
              );
      }
    }, [
      status.saveState,
      status.savedAt,
      t
    ]);

  const saveStatusClassName =
    status.saveState ===
    'error'
      ? 'error'
      : status.saveState ===
          'pending'
        ? 'pending'
        : 'saved';

  const grammarStatus =
    useMemo((): {
      text: string;
      title: string;
      className: string;
    } | null => {
      if (
        !status.grammarEnabled
      ) {
        return null;
      }

      if (
        status.grammarStarting
      ) {
        return {
          text:
            t(
              'grammarStatusBarStarting'
            ),

          title:
            status.grammarMessage ||
            t(
              'grammarStatusBarStartingTitle'
            ),

          className:
            'starting'
        };
      }

      if (
        status.grammarReady
      ) {
        return {
          text:
            t(
              'grammarStatusBarReady'
            ),

          title:
            status.grammarMessage ||
            t(
              'grammarStatusBarReadyTitle'
            ),

          className:
            'ready'
        };
      }

      return {
        text:
          t(
            'grammarStatusBarError'
          ),

        title:
          status.grammarMessage ||
          t(
            'grammarStatusBarErrorTitle'
          ),

        className:
          'error'
      };
    }, [
      status.grammarEnabled,
      status.grammarMessage,
      status.grammarReady,
      status.grammarStarting,
      t
    ]);

  const positionText =
    screenplayPosition
      ? getScreenplayPositionText(
          screenplayPosition,
          lang === 'en'
            ? 'en'
            : 'fr'
        )
      : '';

  return (
    <div
      className="status"
      role="status"
      aria-live="polite"
    >
      <div className="status-left">
        <span
          id="stats"
          className="status-stats"
        >
          {statisticsText}
        </span>

        {positionText && (
          <>
            <span
              className="status-bar-divider"
              aria-hidden="true"
            >
              ·
            </span>

            <span
              className="screenplay-status-position"
              title={positionText}
            >
              {positionText}
            </span>
          </>
        )}

        <span
          className="status-bar-divider"
          aria-hidden="true"
        >
          ·
        </span>

        <span
          id="saveStatus"
          className={`save-status ${saveStatusClassName}`}
        >
          {saveStatusText}
        </span>

        {grammarStatus && (
          <>
            <span
              className="status-bar-divider"
              aria-hidden="true"
            >
              ·
            </span>

            <button
              type="button"
              className={`grammar-status ${grammarStatus.className}`}
              title={
                grammarStatus.title
              }
              onClick={() => {
                onOpenGrammarSetup?.();
              }}
              style={{
                border: 0,
                padding: 0,
                background:
                  'transparent',
                color:
                  'inherit',
                font:
                  'inherit',
                cursor:
                  onOpenGrammarSetup
                    ? 'pointer'
                    : 'default'
              }}
            >
              {grammarStatus.text}
            </button>
          </>
        )}
      </div>

      <div className="status-timer-anchor">
        <MemoTimer
          controller={
            controller
          }
        />
      </div>

      <MemoMusicPlayer />
    </div>
  );
}
