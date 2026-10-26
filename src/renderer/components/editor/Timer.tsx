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
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
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
  /** Compteur de frappe au début de la session. */
  typedAtStart: { total: number; byChapter: Record<string, number>; tracked: boolean };
}

export interface TimerProps {
  controller: EditorController;

  /** Fenêtre « Session et statistiques » ouverte. */
  statsOpen: boolean;
  onStatsOpenChange: (open: boolean) => void;

  /**
   * Emplacement du bouton dans la barre d'outils (fourni par Toolbar).
   * Tant qu'il n'existe pas, le bouton reste dans l'en-tête.
   */
  sessionSlot?: HTMLElement | null;
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

/** Position du panneau : fixe, aligné à droite sur le bouton Session. */
interface PopoverPosition {
  top: number;
  right: number;
}

function measurePopover(
  anchor: HTMLElement | null
): PopoverPosition | null {
  if (!anchor) {
    return null;
  }

  const rect = anchor.getBoundingClientRect();

  return {
    top: Math.round(rect.bottom + 8),
    right: Math.max(8, Math.round(window.innerWidth - rect.right))
  };
}

interface RatingInputProps {
  id: string;
  label: string;
  value: number;
  scale: SessionRatingScale;
  onChange: (value: number) => void;
}

/**
 * Note du bilan. Echelle sur 5 : des boutons (un second clic efface la note).
 * Sur 10 ou 20 : un curseur, 0 signifiant "pas de note".
 */
function RatingInput({
  id,
  label,
  value,
  scale,
  onChange
}: RatingInputProps): React.ReactElement {
  if (scale === 5) {
    return (
      <div className="session-review-row">
        <span className="session-review-label" id={id}>
          {label}
        </span>

        <div
          className="session-rating-buttons"
          role="group"
          aria-labelledby={id}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              className={value === n ? 'settings-choice-btn active' : 'settings-choice-btn'}
              onClick={() => {
                onChange(value === n ? 0 : n);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="session-review-row">
      <label className="session-review-label" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        className="session-rating-range"
        type="range"
        min={0}
        max={scale}
        step={1}
        value={value}
        onChange={(event) => {
          onChange(parseInt(event.target.value, 10));
        }}
      />

      <span className="session-rating-value">
        {value > 0 ? value : '\u2014'}/{scale}
      </span>
    </div>
  );
}

export function Timer({
  controller,
  statsOpen,
  onStatsOpenChange, sessionSlot
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

  // Petit panneau sous le bouton Session, et sa position à l'écran.
  const [panelOpen, setPanelOpen] =
    useState(false);

  const [popPos, setPopPos] =
    useState<PopoverPosition | null>(null);

  const anchorRef =
    useRef<HTMLDivElement | null>(null);

  const popRef =
    useRef<HTMLDivElement | null>(null);

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

  /*
   * Mots écrits pendant la session.
   * Roman : seuls les mots tapés comptent. Ouvrir, créer ou supprimer un
   * chapitre et coller du texte ne changent rien.
   * Scénario : différence du total du projet, comme avant.
   * Le résultat n'est jamais négatif.
   */
  const getSessionWords = (
    activeSession: ActiveWritingSession
  ): number => {
    const typed = controller.typedWords();

    if (!typed.tracked) {
      return Math.max(
        0,
        countProjectWords(controller.data()) - activeSession.wordsBefore
      );
    }

    return Math.max(0, typed.total - activeSession.typedAtStart.total);
  };

  const getDocumentSessionWords = (
    activeSession: ActiveWritingSession,
    documentName: string,
    fallback: number
  ): number => {
    const typed = controller.typedWords();

    if (!typed.tracked) {
      return Math.max(0, fallback);
    }

    return Math.max(
      0,
      (typed.byChapter[documentName] ?? 0) -
        (activeSession.typedAtStart.byChapter[documentName] ?? 0)
    );
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
              getDocumentSessionWords(activeSession, documentName, documentWordsFinal - documentWordsBefore)
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
        getSessionWords(activeSession),
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
          getSessionWords(activeSession)
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
        typedAtStart: controller.typedWords(),
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

  // Panneau ouvert : Echap ou un clic à côté le ferme.
  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        anchorRef.current?.contains(target) ||
        popRef.current?.contains(target)
      ) {
        return;
      }

      setPanelOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setPanelOpen(false);
      focusEditor();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  // Le panneau et l'encart se placent sous le bouton (et suivent la fenêtre).
  const popoverVisible = panelOpen || timeUp;

  useLayoutEffect(() => {
    if (!popoverVisible) {
      return;
    }

    const update = (): void => {
      setPopPos(measurePopover(anchorRef.current));
    };

    update();
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
    };
  }, [popoverVisible, sessionSlot]);

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

  let panelState: string = t('sessionPanelIdle');
  let panelTone = 'idle';

  if (currentSession) {
    if (timeUp) {
      panelTone = 'time-up';
      panelState = t('sessionStateTimeUp');
    } else if (isRunning) {
      panelTone = 'running';
      panelState = t('sessionStateRunning');
    } else {
      panelTone = 'paused';
      panelState = t('sessionStatePaused');
    }
  }

  const customChosen =
    customValue.trim().length > 0;

  const presetClass = (value: number): string =>
    !customChosen && selectedPreset === value
      ? 'settings-choice-btn active'
      : 'settings-choice-btn';

  // Progression du minuteur (0 à 100), seulement avec une durée choisie.
  const plannedTotal = currentSession?.plannedSeconds ?? 0;
  const progressPercent =
    activeSource === 'pomodoro' && plannedTotal > 0
      ? Math.min(100, (elapsedSeconds / plannedTotal) * 100)
      : null;

  const currentChapter = getCurrentChapterName(controller);

  const startFromMiniPanel = (): void => {
    setPanelOpen(false);
    startFromPanel();
  };

  const finishFromPanel = (): void => {
    setPanelOpen(false);
    stopSession();
  };

  const continueFromPanel = (): void => {
    setPanelOpen(false);
    continueAfterTimeUp();
  };

  const openStats = (): void => {
    setPanelOpen(false);
    onStatsOpenChange(true);
  };

  const popStyle: React.CSSProperties | undefined = popPos
    ? { top: popPos.top, right: popPos.right }
    : undefined;

  const chapterLine = currentChapter ? (
    <p className="session-pop-doc" title={currentChapter}>
      {t('sessionCurrentDocument').replace('{name}', currentChapter)}
    </p>
  ) : null;

  // Petit panneau sous le bouton Session (affiché par-dessus la page).
  const sessionPopover = (
    <div
      ref={popRef}
      className={`session-pop session-pop-${panelTone}`}
      role="dialog"
      aria-label={t('sessionPanelTitle')}
      style={popStyle}
    >
      <div className="session-pop-head">
        <strong>
          {currentSession ? t('sessionPanelTitle') : t('sessionNewTitle')}
        </strong>

        {currentSession && (
          <span className="session-pop-state">{panelState}</span>
        )}
      </div>

      {currentSession ? (
        <>
          <div className="session-pop-figures">
            <div className="session-pop-figure">
              <strong>{displayedTime}</strong>
              <span>
                {showRemaining
                  ? t('sessionRemainingLabel')
                  : t('sessionDurationLabel')}
              </span>
            </div>

            <div className="session-pop-figure">
              <strong style={{ color: getWordsColor(liveWords) }}>
                {signedLiveWords}
              </strong>
              <span>{t('sessionWordsLabel')}</span>
            </div>
          </div>

          {progressPercent !== null && (
            <div className="session-pop-progress" aria-hidden="true">
              <div style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          {chapterLine}

          <div className="session-pop-actions">
            {timeUp ? (
              <button type="button" onClick={continueFromPanel}>
                {t('sessionContinueBtn')}
              </button>
            ) : isRunning ? (
              <button type="button" onClick={pauseSession}>
                {t('sessionPauseBtn')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPanelOpen(false);
                  resumeSession(true);
                }}
              >
                {t('sessionResumeBtn')}
              </button>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={finishFromPanel}
            >
              {t('sessionFinishBtn')}
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="session-pop-label">
            {t('sessionTimerLabel')}
          </span>

          <div className="session-pop-presets">
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
                title={t(preset.key)}
                className={presetClass(preset.value)}
                onClick={() => {
                  setSelectedPreset(preset.value);
                  setCustomValue('');
                }}
              >
                {preset.value >= 60
                  ? `${preset.value / 60} h`
                  : `${preset.value} min`}
              </button>
            ))}
          </div>

          <label className="session-pop-custom">
            <span>{t('timerCustomLabel')}</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={t('timerCustomPlaceholder')}
              value={customValue}
              onChange={(event) => {
                setCustomValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  startFromMiniPanel();
                }
              }}
            />
          </label>

          {chapterLine}

          <div className="session-pop-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={startFromMiniPanel}
            >
              {t('sessionStartBtn')}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        className="session-pop-link"
        onClick={openStats}
      >
        {t('sessionPanelStatsLink')}
      </button>
    </div>
  );

  // Encart "Temps écoulé" : la session continue tant qu'elle n'est pas terminée.
  const timeUpPopover = (
    <div
      ref={popRef}
      className="session-pop session-pop-time-up"
      role="alert"
      style={popStyle}
    >
      <div className="session-pop-head">
        <strong>{t('sessionStateTimeUp')}</strong>
      </div>

      <p className="session-pop-summary">
        {formatTimer(elapsedSeconds)}
        {' \u00B7 '}
        {signedLiveWords} {t('statsWordsUnit')}
      </p>

      <div className="session-pop-actions">
        <button type="button" onClick={continueAfterTimeUp}>
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

  // Bouton Session et encart « Temps écoulé ». Le chronomètre reste dans ce
  // composant : la session ne repart jamais à zéro si la barre d'outils change.
  const sessionButton = (
    <div
      className="session-anchor"
      ref={anchorRef}
    >
      <button
        id="btnSession"
        type="button"
        className={buttonClassName || undefined}
        title={t('sessionBtnTitle')}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={() => {
          setPanelOpen((open) => !open);
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );

  // Le panneau passe en premier. Sinon, encart "Temps écoulé", masqué
  // quand une fenêtre est ouverte par-dessus.
  const popover = panelOpen
    ? sessionPopover
    : timeUp && !statsOpen && feedbackSession === null
      ? timeUpPopover
      : null;

  // Barre d'outils affichée : le bouton y est placé par un portail.
  // Sinon, il reste ici, dans l'en-tête.
  return (
    <>
      {sessionSlot
        ? createPortal(sessionButton, sessionSlot)
        : sessionButton}

      {popover && popPos
        ? createPortal(popover, document.body)
        : null}

      <StatsModal
        open={statsOpen}
        controller={controller}
        onClose={() => {
          onStatsOpenChange(false);
        }}
      />

      <Modal
        open={feedbackSession !== null}
        title={t('sessionReviewTitle')}
        width={500}
        onCancel={closeFeedbackWithoutDetails}
        footer={
          <>
            <button
              type="button"
              onClick={closeFeedbackWithoutDetails}
            >
              {t('sessionSkipShort')}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={saveFeedback}
            >
              {t('sessionSaveFeedback')}
            </button>
          </>
        }
      >
        <div className="session-review">
          <div className="session-review-summary">
            <span className="session-review-chip">
              {'\u23F1'} {feedbackDuration}
            </span>

            <span
              className="session-review-chip"
              style={{ color: getWordsColor(feedbackWords) }}
            >
              {formatSignedWords(feedbackWords)} {t('statsWordsUnit')}
            </span>
          </div>

          {feedbackDocuments.length > 0 && (
            <ul className="session-review-docs">
              {feedbackDocuments.map((documentName) => {
                const stats = feedbackSession
                  ? getDocumentStats(feedbackSession, documentName)
                  : null;

                return (
                  <li key={documentName} title={documentName}>
                    <span className="session-review-doc-name">
                      {documentName}
                    </span>

                    {stats && (
                      <span
                        className="session-review-doc-words"
                        style={{ color: getWordsColor(stats.wordsWritten) }}
                      >
                        {formatSignedWords(stats.wordsWritten)} {t('statsWordsUnit')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="session-review-hint">
            {t('sessionReviewHint')}
          </p>

          <div className="session-review-block">
            <span className="session-review-label">
              {t('sessionMoodQuestion')}
            </span>

            <div className="session-review-moods">
              {MOODS.map((mood) => {
                const selected = selectedMood === mood.value;

                return (
                  <button
                    key={mood.value}
                    type="button"
                    title={t(mood.key)}
                    aria-pressed={selected}
                    className={selected ? 'session-mood-btn active' : 'session-mood-btn'}
                    onClick={() => {
                      setSelectedMood(selected ? null : mood.value);
                    }}
                  >
                    <span className="session-mood-emoji">{mood.emoji}</span>
                    <span className="session-mood-text">{t(mood.key)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <RatingInput
            id="sessionConcentrationInput"
            label={t('sessionConcentrationLabel')}
            value={concentration}
            scale={concentrationScale}
            onChange={setConcentration}
          />

          <RatingInput
            id="sessionEnergyInput"
            label={t('sessionEnergyLabel')}
            value={energy}
            scale={energyScale}
            onChange={setEnergy}
          />

          <div className="session-review-block">
            <label
              className="session-review-label"
              htmlFor="sessionNoteInput"
            >
              {t('sessionNoteLabel')}
            </label>

            <textarea
              id="sessionNoteInput"
              className="wb-textarea session-review-note"
              placeholder={t('sessionNotePlaceholder')}
              value={sessionNote}
              onChange={(event) => {
                setSessionNote(event.target.value);
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Rendu dans l'en-tête et redessiné souvent : version mémorisée. */
export const MemoTimer = React.memo(Timer);
