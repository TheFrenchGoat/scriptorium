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
  startTimerSoundLoop,
  type TimerSoundId
} from '../../lib/sound';
import {
  getChapterWordCounts,
} from '../../lib/stats';
import type {
  SessionRatingScale,
  WritingSession,
  WritingSessionDocumentStats,
  WritingSessionMood,
  WritingSessionSource
} from '../../../shared/types';
import type { EditorController } from './useEditorController';
import { StatsModal } from './modals/StatsModal';
import { getCachedTotalStats } from '../../lib/project-word-cache';
import { getScreenplayTextStatistics } from '../../lib/screenplay';
import './session.css';

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

/**
 * Écart maximal compté entre deux relevés du chronomètre (90 s). Au-delà
 * (ordinateur en veille), le temps n'est pas compté comme temps d'écriture.
 */
const MAX_TICK_MS = 90000;

/**
 * Total de mots du projet, compté comme l'historique quotidien : paragraphes
 * des scènes (sans les en-têtes) pour un scénario, chapitres pour un roman.
 */
function countProjectWords(
  projectData: ReturnType<EditorController['data']>
): number {
  if (projectData.projectType === 'screenplay' && projectData.screenplay) {
    return getScreenplayTextStatistics(projectData.screenplay).words;
  }

  return getCachedTotalStats(projectData).words;
}

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

  /**
   * Temps actif mesuré à l'horloge, en millisecondes, et heure du dernier
   * relevé : la durée reste juste même si la fenêtre est réduite.
   */
  activeMs: number;
  lastTickAt: number;
}

export interface TimerProps {
  controller: EditorController;

  /** Fenêtre « Session et statistiques » ouverte. */
  statsOpen: boolean;
  onStatsOpenChange: (open: boolean) => void;
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

/**
 * Session démarrée par erreur : moins d'une minute et aucun mot changé.
 * Elle n'est ni enregistrée ni proposée au bilan (sauf minuteur terminé).
 */
function isEmptySession(
  session: WritingSession,
  completed: boolean
): boolean {
  if (completed || session.durationSeconds >= 60 || session.wordsWritten !== 0) {
    return false;
  }

  return (session.documentStats || []).every(
    (item) => item.wordsWritten === 0
  );
}

export function Timer({
  controller,
  statsOpen,
  onStatsOpenChange
}: TimerProps): React.ReactElement {
  const { t } = useI18n();


  const [
    selectedPreset,
    setSelectedPreset
  ] = useState(0);

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

  // Mots écrits depuis le début de la session (affichés dans l'en-tête).
  const [liveWords, setLiveWords] =
    useState(0);

  // Minuteur arrivé à zéro : encart « Continuer / Terminer » affiché.
  const [timeUp, setTimeUp] =
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

  // Le temps prévu est dépassé (l'utilisateur a choisi de continuer).
  const overtimeRef =
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

    void controller.saveWholeProject();
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
    try {
      controller.handleInput();
    } catch (error) {
      // Éditeur déjà retiré (sortie de l'éditeur) : derniers mots connus.
      console.error('[session] synchronisation impossible :', error);
    }
    trackCurrentDocument();

    const projectData =
      controller.data();

    const wordsAfter =
      countProjectWords(projectData);

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
    setLiveWords(0);
    setTimeUp(false);
    overtimeRef.current = false;

    if (!isEmptySession(session, completed)) {
      persistSession(session);
      openFeedback(session);
    }

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

  /**
   * Temps prévu écoulé : sonnerie, clignotement et encart. La session
   * continue jusqu'à ce que l'utilisateur la termine.
   */
  const signalTimeUp = (): void => {
    setTimeUp(true);
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

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    flashTimeoutRef.current =
      setTimeout(() => {
        setJustFinished(false);
      }, 4000);
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

        // Temps mesuré à l'horloge : les minuteries ralenties quand la
        // fenêtre est réduite ne faussent plus la durée.
        const tickNow = Date.now();
        const tickDelta = Math.min(
          Math.max(0, tickNow - activeSession.lastTickAt),
          MAX_TICK_MS
        );
        activeSession.lastTickAt = tickNow;
        activeSession.activeMs += tickDelta;
        activeSession.activeSeconds = Math.floor(
          activeSession.activeMs / 1000
        );

        setElapsedSeconds(
          activeSession.activeSeconds
        );

        setLiveWords(
          countProjectWords(controller.data()) -
            activeSession.wordsBefore
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
            (activeSession.plannedSeconds ?? 0) -
              activeSession.activeSeconds
          );

        remainingSecondsRef.current =
          nextRemaining;

        setTimeRemaining(
          nextRemaining
        );

        if (
          nextRemaining === 0 &&
          !overtimeRef.current
        ) {
          // Temps prévu écoulé : signal, mais la session continue.
          overtimeRef.current = true;
          signalTimeUp();
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
      countProjectWords(projectData);

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
        activeMs: 0,
        lastTickAt: Date.now(),
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
    setLiveWords(0);
    setTimeUp(false);
    overtimeRef.current = false;
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

  const resumeSession = (focusAfter = true): void => {
    if (
      !activeSessionRef.current ||
      isRunning
    ) {
      return;
    }

    activeSessionRef.current.lastTickAt = Date.now();
    trackCurrentDocument();
    setIsRunning(true);
    startInterval();

    if (focusAfter) {
      focusEditor();
    }
  };

  const stopSession = (): void => {
    const activeSession =
      activeSessionRef.current;

    // Minuteur allé au bout : la session est notée « terminée ».
    const reached =
      overtimeRef.current ||
      Boolean(
        activeSession?.plannedSeconds &&
          activeSession.activeSeconds >=
            activeSession.plannedSeconds
      );

    stopSoundLoop();

    if (statsOpen) {
      onStatsOpenChange(false);
    }

    finishSession(reached, false);
  };

  /** Durée choisie dans le bloc Session, en minutes (0 : sans minuteur). */
  const getChosenMinutes = (): number => {
    const custom = parseInt(
      customValue,
      10
    );

    if (Number.isFinite(custom) && custom > 0) {
      return Math.min(custom, 1440);
    }

    return selectedPreset;
  };

  const startFromPanel = (): void => {
    const minutes = getChosenMinutes();

    setCustomValue('');
    onStatsOpenChange(false);

    if (minutes > 0) {
      beginSession(
        'pomodoro',
        minutes * 60
      );
    } else {
      beginSession('manual');
    }
  };

  /** Minuteur à zéro : on coupe la sonnerie, la session continue. */
  const continueAfterTimeUp = (): void => {
    stopSoundLoop();
    setTimeUp(false);

    if (!statsOpen) {
      focusEditor();
    }
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

        if (!isEmptySession(session, false)) {
          persistSession(session);
        }
      }
    };

    // Le contrôleur reste stable pendant toute la vie de l’éditeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fermeture de la fenêtre : la session en cours est terminée puis enregistrée
  // avec le projet. La référence suit la version à jour des fonctions utilisées.
  const beforeCloseRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    beforeCloseRef.current = async () => {
      const activeSession = activeSessionRef.current;

      if (!activeSession) {
        return;
      }

      clearTimerInterval();

      const session = createFinishedSession(activeSession, false);

      activeSessionRef.current = null;

      if (isEmptySession(session, false)) {
        return;
      }

      persistSession(session);

      await controller.saveWholeProject();
    };
  });

  useEffect(() => {
    return window.api.onBeforeClose(() => beforeCloseRef.current());
  }, []);

  const currentSession =
    activeSessionRef.current;

  // Avec minuteur : temps restant. Sans minuteur ou après « Continuer » :
  // temps écoulé.
  const showRemaining =
    activeSource === 'pomodoro' &&
    !timeUp &&
    !overtimeRef.current;

  const displayedTime = formatTimer(
    showRemaining
      ? timeRemaining
      : elapsedSeconds
  );

  const signedLiveWords =
    formatSignedWords(liveWords);

  let buttonLabel: string = t('sessionBtn');

  if (currentSession) {
    buttonLabel = t(
      isRunning
        ? 'sessionBtnRunning'
        : 'sessionBtnPaused'
    )
      .replace('{time}', displayedTime)
      .replace('{words}', signedLiveWords);
  }

  const buttonClassName = [
    currentSession
      ? isRunning
        ? 'running'
        : 'paused'
      : '',
    justFinished ? 'finished-flash' : ''
  ]
    .filter(Boolean)
    .join(' ');

  let panelClassName = 'session-panel';
  let panelState: string = t('sessionPanelIdle');

  if (currentSession) {
    if (timeUp) {
      panelClassName = 'session-panel time-up';
      panelState = t('sessionStateTimeUp');
    } else if (isRunning) {
      panelClassName = 'session-panel active';
      panelState = t('sessionStateRunning');
    } else {
      panelClassName = 'session-panel paused';
      panelState = t('sessionStatePaused');
    }
  }

  const customChosen =
    customValue.trim().length > 0;

  const presetClass = (value: number): string =>
    !customChosen && selectedPreset === value
      ? 'settings-choice-btn active'
      : 'settings-choice-btn';

  const sessionPanel = (
    <section className={panelClassName}>
      <div className="session-panel-head">
        <strong>{t('sessionPanelTitle')}</strong>
        <span className="session-panel-state">
          {panelState}
        </span>
      </div>

      {currentSession ? (
        <>
          <div className="session-panel-figures">
            <div className="session-figure">
              <span>{t('sessionDurationLabel')}</span>
              <strong>{formatTimer(elapsedSeconds)}</strong>
            </div>

            {showRemaining && (
              <div className="session-figure">
                <span>{t('sessionRemainingLabel')}</span>
                <strong>{formatTimer(timeRemaining)}</strong>
              </div>
            )}

            <div className="session-figure">
              <span>{t('sessionWordsLabel')}</span>
              <strong
                style={{
                  color: getWordsColor(liveWords)
                }}
              >
                {signedLiveWords}
              </strong>
            </div>
          </div>

          <div className="session-actions">
            {timeUp ? (
              <button
                type="button"
                onClick={continueAfterTimeUp}
              >
                {t('sessionContinueBtn')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isRunning) {
                    pauseSession();
                  } else {
                    resumeSession(false);
                  }
                }}
              >
                {isRunning
                  ? t('sessionPauseBtn')
                  : t('sessionResumeBtn')}
              </button>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={stopSession}
            >
              {t('sessionFinishBtn')}
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="session-label">
            {t('sessionTimerLabel')}
          </span>

          <div className="session-presets">
            <button
              type="button"
              className={presetClass(0)}
              onClick={() => {
                setSelectedPreset(0);
                setCustomValue('');
              }}
            >
              {t('sessionTimerNone')}
            </button>

            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={presetClass(preset.value)}
                onClick={() => {
                  setSelectedPreset(preset.value);
                  setCustomValue('');
                }}
              >
                {t(preset.key)}
              </button>
            ))}

            <input
              type="text"
              inputMode="numeric"
              aria-label={t('timerCustomLabel')}
              title={t('timerCustomLabel')}
              placeholder={t('timerCustomPlaceholder')}
              value={customValue}
              onChange={(event) => {
                setCustomValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  startFromPanel();
                }
              }}
            />
          </div>

          <div className="session-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={startFromPanel}
            >
              {t('sessionStartBtn')}
            </button>
          </div>
        </>
      )}
    </section>
  );

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
    <div className="session-anchor">
      <button
        id="btnSession"
        type="button"
        className={buttonClassName || undefined}
        title={t('sessionBtnTitle')}
        onClick={() => {
          onStatsOpenChange(true);
        }}
      >
        {buttonLabel}
      </button>

      {timeUp && (
        <div
          className="session-timeup"
          role="alert"
        >
          <strong>{t('timerFinishedTitle')}</strong>
          <p>{t('sessionTimeUpMessage')}</p>

          <div className="session-actions">
            <button
              type="button"
              onClick={continueAfterTimeUp}
            >
              {t('sessionContinueBtn')}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={stopSession}
            >
              {t('sessionFinishBtn')}
            </button>
          </div>
        </div>
      )}

      <StatsModal
        open={statsOpen}
        controller={controller}
        sessionPanel={sessionPanel}
        onClose={() => {
          onStatsOpenChange(false);
        }}
      />

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

/** Le bouton est dans l'en-tête, redessiné souvent : version mémorisée. */
export const MemoTimer = React.memo(Timer);
