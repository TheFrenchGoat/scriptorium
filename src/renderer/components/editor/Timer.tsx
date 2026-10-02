// src/renderer/components/editor/Timer.tsx
// Minuteur et suivi des sessions d’écriture.
//
// Deux modes sont disponibles :
// - session avec minuteur/Pomodoro ;
// - session libre sans limite de temps.
//
// Tous les chapitres travaillés pendant une même session sont mémorisés.
// Le nombre de mots ajouté ou supprimé est également enregistré pour chaque
// chapitre travaillé.
//
// À la fin de la session, l’utilisateur peut renseigner son humeur, sa
// concentration, son énergie et une note facultative.

import React, {
  useEffect,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import {
  Dropdown,
  DropdownItem
} from '../common/Dropdown';
import {
  startTimerSoundLoop,
  type TimerSoundId
} from '../../lib/sound';
import {
  getChapterWordCounts,
  getTotalStats
} from '../../lib/stats';
import type {
  SessionRatingScale,
  WritingSession,
  WritingSessionDocumentStats,
  WritingSessionMood,
  WritingSessionSource
} from '../../../shared/types';
import type { EditorController } from './useEditorController';

const PRESETS = [
  {
    value: 5,
    key: 'timer5' as const
  },
  {
    value: 15,
    key: 'timer15' as const
  },
  {
    value: 25,
    key: 'timer25' as const
  },
  {
    value: 60,
    key: 'timer60' as const
  }
];

const MOODS: {
  value: WritingSessionMood;
  emoji: string;
  key:
    | 'sessionMoodVeryGood'
    | 'sessionMoodGood'
    | 'sessionMoodNeutral'
    | 'sessionMoodDifficult'
    | 'sessionMoodVeryDifficult';
}[] = [
  {
    value: 'very-good',
    emoji: '😄',
    key: 'sessionMoodVeryGood'
  },
  {
    value: 'good',
    emoji: '🙂',
    key: 'sessionMoodGood'
  },
  {
    value: 'neutral',
    emoji: '😐',
    key: 'sessionMoodNeutral'
  },
  {
    value: 'difficult',
    emoji: '😕',
    key: 'sessionMoodDifficult'
  },
  {
    value: 'very-difficult',
    emoji: '😫',
    key: 'sessionMoodVeryDifficult'
  }
];

interface ActiveWritingSession {
  id: string;
  source: WritingSessionSource;
  startedAt: string;

  /**
   * Premier chapitre ouvert au début de la session.
   *
   * Ce champ reste conservé pour assurer la compatibilité avec les anciennes
   * sessions qui ne mémorisaient qu’un seul document.
   */
  documentName: string | null;

  /**
   * Ensemble des chapitres travaillés pendant la session.
   *
   * Un Set évite qu’un chapitre apparaisse plusieurs fois si l’utilisateur
   * revient plusieurs fois dessus.
   */
  documentNames: Set<string>;

  /**
   * Nombre de mots de chaque chapitre au démarrage de la session.
   *
   * Tous les chapitres sont enregistrés dès le départ. Cela permet de calculer
   * correctement la différence même si le chapitre est ouvert plus tard
   * pendant la session.
   */
  documentWordsBefore: Record<string, number>;

  wordsBefore: number;
  activeSeconds: number;
  plannedSeconds?: number;
}

export interface TimerProps {
  controller: EditorController;
}

function createSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(
    0,
    Math.floor(seconds)
  );

  const hours = Math.floor(
    safeSeconds / 3600
  );

  const minutes = Math.floor(
    (safeSeconds % 3600) / 60
  );

  const remainingSeconds =
    safeSeconds % 60;

  if (hours > 0) {
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds
        .toString()
        .padStart(2, '0')
    ].join(':');
  }

  return [
    minutes.toString().padStart(2, '0'),
    remainingSeconds
      .toString()
      .padStart(2, '0')
  ].join(':');
}

function formatSignedWords(
  words: number
): string {
  if (words > 0) {
    return `+${words}`;
  }

  return String(words);
}

function getWordsColor(
  words: number
): string {
  if (words > 0) {
    return '#10b981';
  }

  if (words < 0) {
    return '#ef4444';
  }

  return 'var(--text-muted)';
}

function normalizeScale(
  value: number | undefined
): SessionRatingScale {
  if (value === 5 || value === 20) {
    return value;
  }

  return 10;
}

function getCurrentChapterName(
  controller: EditorController
): string | null {
  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

  if (
    activeType !== 'chapter' ||
    !activeTab
  ) {
    return null;
  }

  return activeTab;
}

/**
 * Retourne tous les chapitres enregistrés dans une session.
 *
 * `documentName` reste utilisé en solution de repli pour les anciennes
 * sessions ne possédant pas encore `documentNames`.
 */
function getSessionDocumentNames(
  session: WritingSession
): string[] {
  const names: string[] = [];

  if (Array.isArray(session.documentNames)) {
    names.push(...session.documentNames);
  }

  if (session.documentName) {
    names.push(session.documentName);
  }

  if (Array.isArray(session.documentStats)) {
    session.documentStats.forEach((stats) => {
      names.push(stats.documentName);
    });
  }

  return Array.from(
    new Set(
      names
        .filter(
          (name): name is string =>
            typeof name === 'string'
        )
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    )
  );
}

/**
 * Retourne les statistiques d’un chapitre dans une session.
 */
function getDocumentStats(
  session: WritingSession,
  documentName: string
): WritingSessionDocumentStats | null {
  return (
    session.documentStats?.find(
      (stats) =>
        stats.documentName ===
        documentName
    ) ?? null
  );
}

export function Timer({
  controller
}: TimerProps): React.ReactElement {
  const { t } = useI18n();

  const [modalOpen, setModalOpen] =
    useState(false);

  const [
    selectedPreset,
    setSelectedPreset
  ] = useState(25);

  const [customValue, setCustomValue] =
    useState('');

  const [
    timeRemaining,
    setTimeRemaining
  ] = useState(0);

  const [
    elapsedSeconds,
    setElapsedSeconds
  ] = useState(0);

  const [isRunning, setIsRunning] =
    useState(false);

  const [
    activeSource,
    setActiveSource
  ] =
    useState<WritingSessionSource | null>(
      null
    );

  const [
    justFinished,
    setJustFinished
  ] = useState(false);

  const [
    feedbackSession,
    setFeedbackSession
  ] =
    useState<WritingSession | null>(null);

  const [
    selectedMood,
    setSelectedMood
  ] =
    useState<WritingSessionMood | null>(
      null
    );

  const [
    concentration,
    setConcentration
  ] = useState(0);

  const [energy, setEnergy] =
    useState(0);

  const [
    sessionNote,
    setSessionNote
  ] = useState('');

  const intervalRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const flashTimeoutRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const soundLoopStopRef =
    useRef<(() => void) | null>(null);

  const activeSessionRef =
    useRef<ActiveWritingSession | null>(
      null
    );

  const remainingSecondsRef =
    useRef(0);

  const finishingRef =
    useRef(false);

  const lastTrackedDocumentRef =
    useRef<string | null>(null);

  const prefs = controller.prefs();

  const concentrationScale =
    normalizeScale(
      prefs.sessionConcentrationScale
    );

  const energyScale =
    normalizeScale(
      prefs.sessionEnergyScale
    );

  const clearTimerInterval = (): void => {
    if (!intervalRef.current) {
      return;
    }

    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const stopSoundLoop = (): void => {
    soundLoopStopRef.current?.();
    soundLoopStopRef.current = null;
  };

  const focusEditor = (): void => {
    window.setTimeout(() => {
      const editor =
        document.getElementById('editor');

      if (
        editor instanceof HTMLElement
      ) {
        editor.focus();
      }
    }, 0);
  };

  /**
   * Ajoute le chapitre actuellement ouvert aux documents travaillés.
   */
  const trackCurrentDocument =
    (): void => {
      const activeSession =
        activeSessionRef.current;

      if (!activeSession) {
        lastTrackedDocumentRef.current =
          null;
        return;
      }

      const documentName =
        getCurrentChapterName(controller);

      if (
        !documentName ||
        documentName ===
          lastTrackedDocumentRef.current
      ) {
        return;
      }

      activeSession.documentNames.add(
        documentName
      );

      if (!activeSession.documentName) {
        activeSession.documentName =
          documentName;
      }

      /*
       * Si le chapitre a été créé pendant la session, il n’existait pas dans
       * la photographie initiale. Sa valeur de départ est donc zéro.
       */
      if (
        activeSession.documentWordsBefore[
          documentName
        ] === undefined
      ) {
        activeSession.documentWordsBefore[
          documentName
        ] = 0;
      }

      lastTrackedDocumentRef.current =
        documentName;
    };

  const persistSession = (
    session: WritingSession
  ): void => {
    const projectData =
      controller.data();

    if (
      !projectData.writingSessions
    ) {
      projectData.writingSessions = [];
    }

    const existingIndex =
      projectData.writingSessions.findIndex(
        (item) =>
          item.id === session.id
      );

    if (existingIndex === -1) {
      projectData.writingSessions.push(
        session
      );
    } else {
      projectData.writingSessions[
        existingIndex
      ] = session;
    }

    void controller.save();
  };

  /**
   * Termine la session et construit les statistiques globales ainsi que les
   * statistiques propres à chaque chapitre travaillé.
   */
  const createFinishedSession = (
    activeSession: ActiveWritingSession,
    completed: boolean
  ): WritingSession => {
    /*
     * Synchronise les toutes dernières modifications de l’éditeur avant de
     * calculer les nombres de mots définitifs.
     */
    controller.handleInput();
    trackCurrentDocument();

    const projectData =
      controller.data();

    const wordsAfter = getTotalStats(
      projectData
    ).words;

    const documentWordsAfter =
      getChapterWordCounts(projectData);

    const endedAt =
      new Date().toISOString();

    const activeSeconds = Math.max(
      1,
      activeSession.activeSeconds
    );

    const documentNames = Array.from(
      activeSession.documentNames
    );

    const firstDocumentName =
      activeSession.documentName ??
      documentNames[0] ??
      null;

    const documentStats: WritingSessionDocumentStats[] =
      documentNames.map(
        (documentName) => {
          const documentWordsBefore =
            activeSession
              .documentWordsBefore[
              documentName
            ] ?? 0;

          const documentWordsFinal =
            documentWordsAfter[
              documentName
            ] ?? 0;

          return {
            documentName,
            wordsBefore:
              documentWordsBefore,
            wordsAfter:
              documentWordsFinal,
            wordsWritten:
              documentWordsFinal -
              documentWordsBefore
          };
        }
      );

    const session: WritingSession = {
      id: activeSession.id,
      projectName:
        controller.projectName,
      documentName: firstDocumentName,
      documentNames,
      documentStats,
      startedAt:
        activeSession.startedAt,
      endedAt,
      durationSeconds: activeSeconds,
      wordsBefore:
        activeSession.wordsBefore,
      wordsAfter,
      wordsWritten:
        wordsAfter -
        activeSession.wordsBefore,
      source: activeSession.source
    };

    if (
      activeSession.source ===
        'pomodoro' &&
      activeSession.plannedSeconds
    ) {
      session.pomodoro = {
        startedAt:
          activeSession.startedAt,
        endedAt,
        plannedSeconds:
          activeSession.plannedSeconds,
        activeSeconds,
        completed
      };
    }

    return session;
  };

  const openFeedback = (
    session: WritingSession
  ): void => {
    setSelectedMood(null);
    setConcentration(0);
    setEnergy(0);
    setSessionNote('');
    setFeedbackSession(session);
  };

  const finishSession = (
    completed: boolean,
    playEndSound: boolean
  ): void => {
    if (finishingRef.current) {
      return;
    }

    const activeSession =
      activeSessionRef.current;

    if (!activeSession) {
      return;
    }

    finishingRef.current = true;

    clearTimerInterval();

    const session =
      createFinishedSession(
        activeSession,
        completed
      );

    activeSessionRef.current = null;
    remainingSecondsRef.current = 0;
    lastTrackedDocumentRef.current =
      null;

    setIsRunning(false);
    setActiveSource(null);
    setTimeRemaining(0);
    setElapsedSeconds(0);

    persistSession(session);
    openFeedback(session);

    if (playEndSound) {
      stopSoundLoop();

      const currentPrefs =
        controller.prefs();

      if (
        currentPrefs.timerSoundEnabled !==
        false
      ) {
        const soundId =
          (currentPrefs.timerSoundId as TimerSoundId) ||
          'chime';

        soundLoopStopRef.current =
          startTimerSoundLoop(
            soundId,
            currentPrefs.timerVolume ??
              0.5
          );
      }

      setJustFinished(true);

      if (
        flashTimeoutRef.current
      ) {
        clearTimeout(
          flashTimeoutRef.current
        );
      }

      flashTimeoutRef.current =
        setTimeout(() => {
          setJustFinished(false);
        }, 4000);
    }

    finishingRef.current = false;
  };

  const startInterval = (): void => {
    clearTimerInterval();

    intervalRef.current = setInterval(
      () => {
        const activeSession =
          activeSessionRef.current;

        if (!activeSession) {
          clearTimerInterval();
          return;
        }

        trackCurrentDocument();

        activeSession.activeSeconds +=
          1;

        setElapsedSeconds(
          activeSession.activeSeconds
        );

        if (
          activeSession.source !==
          'pomodoro'
        ) {
          return;
        }

        const nextRemaining =
          Math.max(
            0,
            remainingSecondsRef.current -
              1
          );

        remainingSecondsRef.current =
          nextRemaining;

        setTimeRemaining(
          nextRemaining
        );

        if (nextRemaining === 0) {
          finishSession(true, true);
        }
      },
      1000
    );
  };

  const beginSession = (
    source: WritingSessionSource,
    plannedSeconds?: number
  ): void => {
    if (
      activeSessionRef.current
    ) {
      return;
    }

    /*
     * Enregistre les dernières modifications du chapitre avant de créer la
     * photographie initiale du projet.
     */
    controller.handleInput();

    const projectData =
      controller.data();

    const wordsBefore =
      getTotalStats(projectData).words;

    const documentWordsBefore =
      getChapterWordCounts(projectData);

    const initialDocumentName =
      getCurrentChapterName(controller);

    const normalizedPlannedSeconds =
      source === 'pomodoro'
        ? Math.max(
            1,
            plannedSeconds ?? 1
          )
        : undefined;

    const activeSession: ActiveWritingSession =
      {
        id: createSessionId(),
        source,
        startedAt:
          new Date().toISOString(),
        documentName:
          initialDocumentName,
        documentNames: new Set(
          initialDocumentName
            ? [initialDocumentName]
            : []
        ),
        documentWordsBefore,
        wordsBefore,
        activeSeconds: 0,
        plannedSeconds:
          normalizedPlannedSeconds
      };

    activeSessionRef.current =
      activeSession;

    lastTrackedDocumentRef.current =
      initialDocumentName;

    remainingSecondsRef.current =
      normalizedPlannedSeconds ?? 0;

    setActiveSource(source);
    setElapsedSeconds(0);
    setTimeRemaining(
      normalizedPlannedSeconds ?? 0
    );
    setJustFinished(false);
    setIsRunning(true);

    startInterval();
    focusEditor();
  };

  const pauseSession = (): void => {
    if (
      !activeSessionRef.current
    ) {
      return;
    }

    controller.handleInput();
    trackCurrentDocument();
    clearTimerInterval();
    setIsRunning(false);
  };

  const resumeSession = (): void => {
    if (
      !activeSessionRef.current ||
      isRunning
    ) {
      return;
    }

    trackCurrentDocument();
    setIsRunning(true);
    startInterval();
    focusEditor();
  };

  const stopSession = (): void => {
    finishSession(false, false);
  };

  const confirmTimerModal =
    (): void => {
      const custom = parseInt(
        customValue,
        10
      );

      const minutes =
        Number.isFinite(custom) &&
        custom > 0
          ? custom
          : selectedPreset;

      setCustomValue('');
      setModalOpen(false);

      beginSession(
        'pomodoro',
        minutes * 60
      );
    };

  const closeTimerModal = (): void => {
    setCustomValue('');
    setModalOpen(false);
    focusEditor();
  };

  const resetFeedback = (): void => {
    setFeedbackSession(null);
    setSelectedMood(null);
    setConcentration(0);
    setEnergy(0);
    setSessionNote('');
  };

  const closeFeedbackWithoutDetails =
    (): void => {
      stopSoundLoop();
      resetFeedback();
      focusEditor();
    };

  const saveFeedback = (): void => {
    if (!feedbackSession) {
      return;
    }

    const updatedSession: WritingSession =
      {
        ...feedbackSession,
        mood:
          selectedMood || undefined,
        concentration:
          concentration > 0
            ? concentration
            : undefined,
        concentrationScale:
          concentration > 0
            ? concentrationScale
            : undefined,
        energy:
          energy > 0
            ? energy
            : undefined,
        energyScale:
          energy > 0
            ? energyScale
            : undefined,
        note:
          sessionNote.trim() ||
          undefined
      };

    persistSession(updatedSession);
    stopSoundLoop();
    resetFeedback();
    focusEditor();
  };

  /*
   * Le suivi principal est réalisé chaque seconde, mais ces événements
   * permettent également de détecter immédiatement un changement de chapitre.
   */
  useEffect(() => {
    const onDocumentInteraction =
      (): void => {
        trackCurrentDocument();
      };

    document.addEventListener(
      'click',
      onDocumentInteraction,
      true
    );

    document.addEventListener(
      'focusin',
      onDocumentInteraction,
      true
    );

    return () => {
      document.removeEventListener(
        'click',
        onDocumentInteraction,
        true
      );

      document.removeEventListener(
        'focusin',
        onDocumentInteraction,
        true
      );
    };

    // Le contrôleur reste stable pendant toute la vie de l’éditeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      clearTimerInterval();

      if (
        flashTimeoutRef.current
      ) {
        clearTimeout(
          flashTimeoutRef.current
        );
      }

      stopSoundLoop();

      /*
       * Si l’utilisateur quitte l’éditeur pendant une session active,
       * la session est automatiquement terminée et enregistrée.
       */
      const activeSession =
        activeSessionRef.current;

      if (activeSession) {
        const session =
          createFinishedSession(
            activeSession,
            false
          );

        activeSessionRef.current =
          null;

        persistSession(session);
      }
    };

    // Le contrôleur reste stable pendant toute la vie de l’éditeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPresetLabel =
    PRESETS.find(
      (preset) =>
        preset.value ===
        selectedPreset
    )?.key ?? 'timer25';

  let mainLabel = t('timerBtn');

  if (
    activeSource === 'pomodoro'
  ) {
    mainLabel = `⏱ ${formatTimer(
      timeRemaining
    )}`;
  } else if (
    activeSource === 'manual'
  ) {
    mainLabel = `✍ ${formatTimer(
      elapsedSeconds
    )}`;
  }

  const feedbackDuration =
    feedbackSession
      ? formatTimer(
          feedbackSession.durationSeconds
        )
      : '00:00';

  const feedbackWords =
    feedbackSession?.wordsWritten ?? 0;

  const feedbackDocuments =
    feedbackSession
      ? getSessionDocumentNames(
          feedbackSession
        )
      : [];

  return (
    <div
      id="timerContainer"
      className="timer-container"
    >
      <button
        id="btnTimer"
        type="button"
        className={`${
          isRunning ? 'running' : ''
        } ${
          justFinished
            ? 'timer-finished-flash'
            : ''
        }`.trim()}
        title={
          activeSessionRef.current
            ? undefined
            : t('timerModalTitle')
        }
        onClick={() => {
          if (
            !activeSessionRef.current
          ) {
            setModalOpen(true);
            return;
          }

          if (!isRunning) {
            resumeSession();
          }
        }}
      >
        {mainLabel}
      </button>

      {!activeSessionRef.current && (
        <button
          id="btnWritingSession"
          type="button"
          title={t(
            'sessionManualStartTitle'
          )}
          onClick={() =>
            beginSession('manual')
          }
        >
          {t('sessionManualButton')}
        </button>
      )}

      {activeSessionRef.current && (
        <button
          id="btnTimerPause"
          type="button"
          title={
            isRunning
              ? t('timerPauseTitle')
              : t(
                  'sessionResumeTitle'
                )
          }
          onClick={() => {
            if (isRunning) {
              pauseSession();
            } else {
              resumeSession();
            }
          }}
        >
          {isRunning ? '⏸' : '▶'}
        </button>
      )}

      {activeSessionRef.current && (
        <button
          id="btnTimerStop"
          type="button"
          title={t(
            'sessionStopTitle'
          )}
          onClick={stopSession}
        >
          ⏹
        </button>
      )}

      <Modal
        open={modalOpen}
        title={t('timerModalTitle')}
        onCancel={closeTimerModal}
        onPrimary={confirmTimerModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeTimerModal}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={
                confirmTimerModal
              }
            >
              {t('launch')}
            </button>
          </>
        }
      >
        <Dropdown
          label={
            <>
              {t(
                currentPresetLabel
              )}{' '}
              ▾
            </>
          }
          buttonClassName="dropdown-btn modal-dropdown-btn"
          containerStyle={{
            width: '100%',
            margin: '12px 0 20px'
          }}
          menuStyle={{
            width: '100%'
          }}
        >
          {(close) => (
            <>
              {PRESETS.map(
                (preset) => (
                  <DropdownItem
                    key={
                      preset.value
                    }
                    className="dropdown-item timer-option"
                    onSelect={() => {
                      setSelectedPreset(
                        preset.value
                      );
                      close();
                    }}
                  >
                    {t(preset.key)}
                  </DropdownItem>
                )
              )}
            </>
          )}
        </Dropdown>

        <div
          className="wb-form-group"
          style={{
            margin: '0 0 20px'
          }}
        >
          <label className="wb-label">
            {t('timerCustomLabel')}
          </label>

          <input
            type="text"
            inputMode="numeric"
            placeholder={t(
              'timerCustomPlaceholder'
            )}
            value={customValue}
            onChange={(event) => {
              setCustomValue(
                event.target.value
              );
            }}
          />
        </div>
      </Modal>

      <Modal
        open={
          feedbackSession !== null
        }
        title={t(
          'sessionFinishedTitle'
        )}
        width={520}
        onCancel={
          closeFeedbackWithoutDetails
        }
        footer={
          <>
            <button
              type="button"
              onClick={
                closeFeedbackWithoutDetails
              }
            >
              {t(
                'sessionSkipFeedback'
              )}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={saveFeedback}
            >
              {t(
                'sessionSaveFeedback'
              )}
            </button>
          </>
        }
      >
        <p
          style={{
            margin: '10px 0 18px',
            color:
              'var(--text-muted)',
            lineHeight: 1.5
          }}
        >
          {t(
            'sessionFeedbackIntro'
          )}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 22
          }}
        >
          <div
            style={{
              padding: 10,
              border:
                '1px solid var(--border)',
              borderRadius:
                'var(--radius)',
              background:
                'var(--bg-input)'
            }}
          >
            <div
              style={{
                color:
                  'var(--text-muted)',
                fontSize: 12,
                marginBottom: 4
              }}
            >
              {t(
                'sessionDurationLabel'
              )}
            </div>

            <strong>
              {feedbackDuration}
            </strong>
          </div>

          <div
            style={{
              padding: 10,
              border:
                '1px solid var(--border)',
              borderRadius:
                'var(--radius)',
              background:
                'var(--bg-input)'
            }}
          >
            <div
              style={{
                color:
                  'var(--text-muted)',
                fontSize: 12,
                marginBottom: 4
              }}
            >
              {t(
                'sessionWordsLabel'
              )}
            </div>

            <strong
              style={{
                color:
                  getWordsColor(
                    feedbackWords
                  )
              }}
            >
              {formatSignedWords(
                feedbackWords
              )}
            </strong>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              padding: 10,
              border:
                '1px solid var(--border)',
              borderRadius:
                'var(--radius)',
              background:
                'var(--bg-input)',
              minWidth: 0
            }}
          >
            <div
              style={{
                color:
                  'var(--text-muted)',
                fontSize: 12,
                marginBottom: 7
              }}
            >
              {t(
                'sessionDocumentLabel'
              )}
            </div>

            {feedbackDocuments.length >
            0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection:
                    'column',
                  gap: 6
                }}
              >
                {feedbackDocuments.map(
                  (documentName) => {
                    const stats =
                      feedbackSession
                        ? getDocumentStats(
                            feedbackSession,
                            documentName
                          )
                        : null;

                    return (
                      <div
                        key={documentName}
                        title={
                          documentName
                        }
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'space-between',
                          gap: 10,
                          width: '100%',
                          minWidth: 0,
                          padding:
                            '7px 9px',
                          borderRadius:
                            'var(--radius)',
                          background:
                            'var(--bg-hover)',
                          border:
                            '1px solid var(--border)',
                          fontSize: 12
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflow:
                              'hidden',
                            textOverflow:
                              'ellipsis',
                            whiteSpace:
                              'nowrap',
                            fontWeight: 600
                          }}
                        >
                          📄 {documentName}
                        </span>

                        {stats && (
                          <span
                            style={{
                              flexShrink: 0,
                              color:
                                getWordsColor(
                                  stats.wordsWritten
                                ),
                              fontWeight: 700,
                              whiteSpace:
                                'nowrap'
                            }}
                          >
                            {formatSignedWords(
                              stats.wordsWritten
                            )}{' '}
                            {t(
                              'statsWordsUnit'
                            )}
                          </span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <strong>
                {t(
                  'sessionNoDocument'
                )}
              </strong>
            )}
          </div>
        </div>

        <div className="wb-form-group">
          <label className="wb-label">
            {t(
              'sessionMoodLabel'
            )}
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(5, minmax(0, 1fr))',
              gap: 8
            }}
          >
            {MOODS.map((mood) => {
              const selected =
                selectedMood ===
                mood.value;

              return (
                <button
                  key={mood.value}
                  type="button"
                  title={t(mood.key)}
                  aria-label={t(
                    mood.key
                  )}
                  className={
                    selected
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() => {
                    setSelectedMood(
                      mood.value
                    );
                  }}
                  style={{
                    minWidth: 0,
                    padding:
                      '10px 4px',
                    fontSize: 24
                  }}
                >
                  {mood.emoji}
                </button>
              );
            })}
          </div>
        </div>

        <div className="wb-form-group">
          <label
            className="wb-label"
            htmlFor="sessionConcentrationInput"
          >
            {t(
              'sessionConcentrationLabel'
            )}{' '}
            :{' '}
            {concentration > 0
              ? `${concentration}/${concentrationScale}`
              : `—/${concentrationScale}`}
          </label>

          <input
            id="sessionConcentrationInput"
            type="range"
            min={0}
            max={
              concentrationScale
            }
            step={1}
            value={concentration}
            onChange={(event) => {
              setConcentration(
                parseInt(
                  event.target.value,
                  10
                )
              );
            }}
            style={{
              width: '100%',
              accentColor:
                'var(--accent)'
            }}
          />
        </div>

        <div className="wb-form-group">
          <label
            className="wb-label"
            htmlFor="sessionEnergyInput"
          >
            {t(
              'sessionEnergyLabel'
            )}{' '}
            :{' '}
            {energy > 0
              ? `${energy}/${energyScale}`
              : `—/${energyScale}`}
          </label>

          <input
            id="sessionEnergyInput"
            type="range"
            min={0}
            max={energyScale}
            step={1}
            value={energy}
            onChange={(event) => {
              setEnergy(
                parseInt(
                  event.target.value,
                  10
                )
              );
            }}
            style={{
              width: '100%',
              accentColor:
                'var(--accent)'
            }}
          />
        </div>

        <div
          className="wb-form-group"
          style={{
            marginBottom: 0
          }}
        >
          <label
            className="wb-label"
            htmlFor="sessionNoteInput"
          >
            {t(
              'sessionNoteLabel'
            )}
          </label>

          <textarea
            id="sessionNoteInput"
            className="wb-textarea"
            placeholder={t(
              'sessionNotePlaceholder'
            )}
            value={sessionNote}
            onChange={(event) => {
              setSessionNote(
                event.target.value
              );
            }}
            style={{
              minHeight: 90
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
