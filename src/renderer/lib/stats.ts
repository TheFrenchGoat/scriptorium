// src/renderer/lib/stats.ts
// Outils de calcul pour les statistiques d’écriture.
//
// Ce module conserve les anciennes statistiques quotidiennes basées sur le
// nombre total de mots, tout en ajoutant les outils nécessaires au journal
// des sessions d’écriture :
// - filtrage par période ;
// - résumés de sessions ;
// - activité par jour et par heure ;
// - concentration et énergie moyennes ;
// - humeur et productivité ;
// - progression des objectifs de projet.

import { getLanguage, t } from '../i18n';
import type {
  ProjectData,
  ProjectGoal,
  WritingSession,
  WritingSessionMood,
  WritingStats,
  WritingStatsBucket
} from '../../shared/types';

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export type SessionStatsPeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export interface StatsDateRange {
  start: Date;
  end: Date;
}

export interface SessionSummary {
  sessionCount: number;
  durationSeconds: number;
  wordsWritten: number;
  averageDurationSeconds: number;
  averageWordsPerSession: number;
  /**
   * Moyenne normalisée sur 10 afin de pouvoir comparer des sessions
   * enregistrées avec des échelles différentes (/5, /10 ou /20).
   */
  averageConcentration10: number | null;
  /**
   * Moyenne normalisée sur 10 afin de pouvoir comparer des sessions
   * enregistrées avec des échelles différentes (/5, /10 ou /20).
   */
  averageEnergy10: number | null;
}

export interface SessionActivityBucket {
  key: string;
  sessionCount: number;
  durationSeconds: number;
  wordsWritten: number;
  averageConcentration10: number | null;
  averageEnergy10: number | null;
}

export interface MoodStatsBucket {
  mood: WritingSessionMood;
  sessionCount: number;
  durationSeconds: number;
  wordsWritten: number;
  averageWordsPerSession: number;
}

export interface ProjectGoalProgress {
  goal: ProjectGoal;
  currentValue: number;
  targetValue: number;
  percent: number;
  remainingWords: number | null;
  daysRemaining: number | null;
  overdue: boolean;
  completed: boolean;
}

/**
 * Retourne le compartiment de statistiques historiques d’un projet.
 *
 * Les anciens fichiers de données ne possèdent pas forcément `projects`.
 * La structure est donc créée à la demande pour assurer la compatibilité.
 */
export function getStatsBucket(
  stats: WritingStats,
  projectName: string
): WritingStatsBucket {
  if (!stats.projects) {
    stats.projects = {};
  }

  if (!stats.projects[projectName]) {
    stats.projects[projectName] = {
      baselineDate: null,
      baselineWords: 0,
      history: {},
      dailyGoal: null
    };
  }

  return stats.projects[projectName];
}

/**
 * Transforme une date locale en clé YYYY-MM-DD.
 *
 * On n’utilise pas toISOString(), car celui-ci travaille en UTC et peut
 * déplacer la date au jour précédent ou suivant selon le fuseau horaire.
 */
export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Construit une date locale à partir d’une clé YYYY-MM-DD.
 */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Clé de semaine ISO 8601, par exemple "2026-S36".
 */
export function getIsoWeekKey(date: Date): string {
  const utcDate = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const dayNumber = (utcDate.getUTCDay() + 6) % 7;

  utcDate.setUTCDate(
    utcDate.getUTCDate() - dayNumber + 3
  );

  const isoYear = utcDate.getUTCFullYear();

  const firstThursday = new Date(
    Date.UTC(isoYear, 0, 4)
  );

  const firstThursdayDayNumber =
    (firstThursday.getUTCDay() + 6) % 7;

  firstThursday.setUTCDate(
    firstThursday.getUTCDate() -
      firstThursdayDayNumber +
      3
  );

  const weekNumber =
    1 +
    Math.round(
      (utcDate.getTime() - firstThursday.getTime()) /
        604800000
    );

  return `${isoYear}-S${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Compte les mots et caractères d’un projet.
 */
export function getTotalStats(
  projectData: ProjectData
): { words: number; chars: number } {
  let totalWords = 0;
  let totalChars = 0;

  Object.values(projectData.chapters || {}).forEach(
    (htmlContent) => {
      if (typeof htmlContent !== 'string') return;

      const plainText = htmlContent
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(?:div|p|li|h[1-6])>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();

      if (!plainText) return;

      totalWords += plainText
        .split(/\s+/)
        .filter((word) => word.length > 0).length;

      totalChars += plainText.length;
    }
  );

  return {
    words: totalWords,
    chars: totalChars
  };
}

/**
 * Formate l’étiquette d’une ligne de l’ancien historique de mots.
 */
export function formatStatsLabel(
  key: string,
  period: StatsPeriod
): string {
  const locale =
    getLanguage() === 'en' ? 'en-US' : 'fr-FR';

  if (period === 'day') {
    const date = parseDateKey(key);

    if (!date) return key;

    const label = date.toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      label.charAt(0).toUpperCase() + label.slice(1)
    );
  }

  if (period === 'week') {
    const [year, week] = key.split('-S');

    return `${t('statsWeekPrefix')} ${week} — ${year}`;
  }

  if (period === 'month') {
    const [year, month] = key
      .split('-')
      .map(Number);

    if (!year || !month) return key;

    const label = new Date(
      year,
      month - 1,
      1
    ).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric'
    });

    return (
      label.charAt(0).toUpperCase() + label.slice(1)
    );
  }

  return key;
}

/**
 * Regroupe l’ancien historique quotidien selon la période demandée.
 */
export function bucketHistory(
  history: Record<string, number>,
  period: StatsPeriod
): { key: string; words: number }[] {
  const buckets: Record<string, number> = {};

  Object.keys(history).forEach((dayKey) => {
    const date = parseDateKey(dayKey);

    if (!date) return;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    let bucketKey: string;

    if (period === 'day') {
      bucketKey = dayKey;
    } else if (period === 'week') {
      bucketKey = getIsoWeekKey(date);
    } else if (period === 'month') {
      bucketKey = `${year}-${String(month).padStart(
        2,
        '0'
      )}`;
    } else {
      bucketKey = String(year);
    }

    buckets[bucketKey] =
      (buckets[bucketKey] || 0) +
      (history[dayKey] || 0);
  });

  return Object.keys(buckets)
    .sort()
    .reverse()
    .map((key) => ({
      key,
      words: buckets[key]
    }));
}

/**
 * Retourne le début d’une journée locale.
 */
export function startOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

/**
 * Retourne la fin d’une journée locale.
 */
export function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

/**
 * Retourne le lundi de la semaine contenant la date.
 */
export function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + difference);

  return result;
}

/**
 * Retourne le dimanche de la semaine contenant la date.
 */
export function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);

  result.setDate(result.getDate() + 6);

  return endOfDay(result);
}

/**
 * Produit la plage de dates correspondant au filtre choisi.
 */
export function getSessionDateRange(
  period: SessionStatsPeriod,
  referenceDate = new Date(),
  customStart?: Date | null,
  customEnd?: Date | null
): StatsDateRange {
  if (
    period === 'custom' &&
    customStart &&
    customEnd
  ) {
    const first =
      customStart.getTime() <= customEnd.getTime()
        ? customStart
        : customEnd;

    const last =
      customStart.getTime() <= customEnd.getTime()
        ? customEnd
        : customStart;

    return {
      start: startOfDay(first),
      end: endOfDay(last)
    };
  }

  if (period === 'today') {
    return {
      start: startOfDay(referenceDate),
      end: endOfDay(referenceDate)
    };
  }

  if (period === 'week') {
    return {
      start: startOfWeek(referenceDate),
      end: endOfWeek(referenceDate)
    };
  }

  if (period === 'month') {
    return {
      start: new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        1,
        0,
        0,
        0,
        0
      ),
      end: new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )
    };
  }

  return {
    start: new Date(
      referenceDate.getFullYear(),
      0,
      1,
      0,
      0,
      0,
      0
    ),
    end: new Date(
      referenceDate.getFullYear(),
      11,
      31,
      23,
      59,
      59,
      999
    )
  };
}

/**
 * Vérifie si une session appartient à une plage de dates.
 *
 * Le classement est effectué selon son heure de début.
 */
export function isSessionInRange(
  session: WritingSession,
  range: StatsDateRange
): boolean {
  const startedAt = new Date(session.startedAt).getTime();

  if (!Number.isFinite(startedAt)) return false;

  return (
    startedAt >= range.start.getTime() &&
    startedAt <= range.end.getTime()
  );
}

/**
 * Filtre les sessions d’un projet pour une période.
 */
export function filterSessionsByRange(
  sessions: WritingSession[],
  range: StatsDateRange
): WritingSession[] {
  return sessions
    .filter((session) =>
      isSessionInRange(session, range)
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() -
        new Date(a.startedAt).getTime()
    );
}

/**
 * Filtre les sessions d’un projet à partir du type de période.
 */
export function filterSessionsByPeriod(
  sessions: WritingSession[],
  period: SessionStatsPeriod,
  referenceDate = new Date(),
  customStart?: Date | null,
  customEnd?: Date | null
): WritingSession[] {
  const range = getSessionDateRange(
    period,
    referenceDate,
    customStart,
    customEnd
  );

  return filterSessionsByRange(sessions, range);
}

/**
 * Normalise une note sur une échelle de 10.
 *
 * Une concentration de 4/5 devient ainsi 8/10 et une concentration de
 * 16/20 devient également 8/10.
 */
export function normalizeRatingToTen(
  value: number | null | undefined,
  scale: number | null | undefined
): number | null {
  if (
    value === null ||
    value === undefined ||
    scale === null ||
    scale === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return null;
  }

  const boundedValue = Math.max(
    0,
    Math.min(scale, value)
  );

  return (boundedValue / scale) * 10;
}

/**
 * Calcule la moyenne d’une liste de nombres.
 */
function average(
  values: number[]
): number | null {
  if (values.length === 0) return null;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

/**
 * Calcule le résumé d’un ensemble de sessions.
 */
export function summarizeSessions(
  sessions: WritingSession[]
): SessionSummary {
  const durationSeconds = sessions.reduce(
    (sum, session) =>
      sum +
      Math.max(
        0,
        Number(session.durationSeconds) || 0
      ),
    0
  );

  const wordsWritten = sessions.reduce(
    (sum, session) =>
      sum + (Number(session.wordsWritten) || 0),
    0
  );

  const concentrationValues = sessions
    .map((session) =>
      normalizeRatingToTen(
        session.concentration,
        session.concentrationScale
      )
    )
    .filter(
      (value): value is number => value !== null
    );

  const energyValues = sessions
    .map((session) =>
      normalizeRatingToTen(
        session.energy,
        session.energyScale
      )
    )
    .filter(
      (value): value is number => value !== null
    );

  return {
    sessionCount: sessions.length,
    durationSeconds,
    wordsWritten,
    averageDurationSeconds:
      sessions.length > 0
        ? durationSeconds / sessions.length
        : 0,
    averageWordsPerSession:
      sessions.length > 0
        ? wordsWritten / sessions.length
        : 0,
    averageConcentration10: average(
      concentrationValues
    ),
    averageEnergy10: average(energyValues)
  };
}

/**
 * Construit les statistiques d’un groupe de sessions.
 */
function createActivityBucket(
  key: string,
  sessions: WritingSession[]
): SessionActivityBucket {
  const summary = summarizeSessions(sessions);

  return {
    key,
    sessionCount: summary.sessionCount,
    durationSeconds: summary.durationSeconds,
    wordsWritten: summary.wordsWritten,
    averageConcentration10:
      summary.averageConcentration10,
    averageEnergy10: summary.averageEnergy10
  };
}

/**
 * Regroupe les sessions par date locale.
 */
export function groupSessionsByDay(
  sessions: WritingSession[],
  includeEmptyRange?: StatsDateRange
): SessionActivityBucket[] {
  const grouped = new Map<
    string,
    WritingSession[]
  >();

  sessions.forEach((session) => {
    const date = new Date(session.startedAt);

    if (!Number.isFinite(date.getTime())) return;

    const key = getDateKey(date);
    const current = grouped.get(key) || [];

    current.push(session);
    grouped.set(key, current);
  });

  if (includeEmptyRange) {
    const cursor = startOfDay(includeEmptyRange.start);
    const finalDay = startOfDay(includeEmptyRange.end);

    while (cursor.getTime() <= finalDay.getTime()) {
      const key = getDateKey(cursor);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) =>
      left.localeCompare(right)
    )
    .map(([key, bucketSessions]) =>
      createActivityBucket(key, bucketSessions)
    );
}

/**
 * Regroupe les sessions selon l’heure à laquelle elles ont commencé.
 *
 * Les 24 heures sont toujours renvoyées afin que les graphiques conservent
 * une échelle stable, même lorsqu’aucune session n’existe à certaines heures.
 */
export function groupSessionsByHour(
  sessions: WritingSession[]
): SessionActivityBucket[] {
  const grouped = new Map<
    number,
    WritingSession[]
  >();

  for (let hour = 0; hour < 24; hour++) {
    grouped.set(hour, []);
  }

  sessions.forEach((session) => {
    const date = new Date(session.startedAt);

    if (!Number.isFinite(date.getTime())) return;

    const hour = date.getHours();
    const current = grouped.get(hour) || [];

    current.push(session);
    grouped.set(hour, current);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([hour, bucketSessions]) =>
      createActivityBucket(
        `${String(hour).padStart(2, '0')}h`,
        bucketSessions
      )
    );
}

/**
 * Regroupe les sessions par jour de la semaine.
 *
 * L’ordre commence par lundi et se termine par dimanche.
 */
export function groupSessionsByWeekday(
  sessions: WritingSession[]
): SessionActivityBucket[] {
  const grouped = new Map<
    number,
    WritingSession[]
  >();

  for (let weekday = 0; weekday < 7; weekday++) {
    grouped.set(weekday, []);
  }

  sessions.forEach((session) => {
    const date = new Date(session.startedAt);

    if (!Number.isFinite(date.getTime())) return;

    const nativeDay = date.getDay();
    const mondayBasedDay =
      nativeDay === 0 ? 6 : nativeDay - 1;

    const current =
      grouped.get(mondayBasedDay) || [];

    current.push(session);
    grouped.set(mondayBasedDay, current);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([weekday, bucketSessions]) =>
      createActivityBucket(
        String(weekday),
        bucketSessions
      )
    );
}

/**
 * Regroupe les sessions selon l’humeur renseignée.
 */
export function groupSessionsByMood(
  sessions: WritingSession[]
): MoodStatsBucket[] {
  const moods: WritingSessionMood[] = [
    'very-good',
    'good',
    'neutral',
    'difficult',
    'very-difficult'
  ];

  return moods.map((mood) => {
    const moodSessions = sessions.filter(
      (session) => session.mood === mood
    );

    const summary = summarizeSessions(moodSessions);

    return {
      mood,
      sessionCount: summary.sessionCount,
      durationSeconds: summary.durationSeconds,
      wordsWritten: summary.wordsWritten,
      averageWordsPerSession:
        summary.averageWordsPerSession
    };
  });
}

/**
 * Retourne l’emoji associé à une humeur.
 */
export function getMoodEmoji(
  mood: WritingSessionMood | null | undefined
): string {
  switch (mood) {
    case 'very-good':
      return '😄';

    case 'good':
      return '🙂';

    case 'neutral':
      return '😐';

    case 'difficult':
      return '😕';

    case 'very-difficult':
      return '😫';

    default:
      return '—';
  }
}

/**
 * Formate une durée en version compacte.
 *
 * Exemples :
 * - 45 secondes -> "45 s"
 * - 50 minutes -> "50 min"
 * - 1 h 20 -> "1 h 20"
 */
export function formatDuration(
  totalSeconds: number
): string {
  const safeSeconds = Math.max(
    0,
    Math.round(totalSeconds || 0)
  );

  if (safeSeconds < 60) {
    return `${safeSeconds} s`;
  }

  const totalMinutes = Math.floor(
    safeSeconds / 60
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes} min`;
  }

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${String(minutes).padStart(
    2,
    '0'
  )}`;
}

/**
 * Formate une date et une heure de session.
 */
export function formatSessionDateTime(
  isoDate: string
): string {
  const date = new Date(isoDate);

  if (!Number.isFinite(date.getTime())) {
    return isoDate;
  }

  const locale =
    getLanguage() === 'en' ? 'en-US' : 'fr-FR';

  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Formate uniquement l’heure d’une session.
 */
export function formatSessionTime(
  isoDate: string
): string {
  const date = new Date(isoDate);

  if (!Number.isFinite(date.getTime())) {
    return isoDate;
  }

  const locale =
    getLanguage() === 'en' ? 'en-US' : 'fr-FR';

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Génère un identifiant suffisamment unique pour une session créée dans le
 * renderer, sans dépendance externe.
 */
export function createWritingSessionId(): string {
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

/**
 * Retourne les sessions enregistrées dans un projet, triées de la plus
 * récente à la plus ancienne.
 */
export function getProjectSessions(
  projectData: ProjectData
): WritingSession[] {
  return [...(projectData.writingSessions || [])].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() -
      new Date(left.startedAt).getTime()
  );
}

/**
 * Calcule le nombre de jours restant avant une date limite.
 *
 * Une valeur négative signifie que l’échéance est dépassée.
 */
export function getDaysUntilDeadline(
  deadline: string | null | undefined,
  referenceDate = new Date()
): number | null {
  if (!deadline) return null;

  const deadlineDate = parseDateKey(deadline);

  if (!deadlineDate) return null;

  const start = startOfDay(referenceDate);
  const end = startOfDay(deadlineDate);

  return Math.ceil(
    (end.getTime() - start.getTime()) / 86400000
  );
}

/**
 * Calcule la progression d’un objectif.
 */
export function getProjectGoalProgress(
  goal: ProjectGoal,
  projectData: ProjectData,
  referenceDate = new Date()
): ProjectGoalProgress {
  let currentValue = 0;
  let targetValue = 100;
  let remainingWords: number | null = null;

  if (goal.progressMode === 'words') {
    currentValue = getTotalStats(projectData).words;
    targetValue = Math.max(
      1,
      goal.targetWords || 1
    );
    remainingWords = Math.max(
      0,
      targetValue - currentValue
    );
  } else {
    currentValue = Math.max(
      0,
      Math.min(100, goal.manualProgress || 0)
    );
    targetValue = 100;
  }

  const percent = Math.max(
    0,
    Math.min(
      100,
      (currentValue / targetValue) * 100
    )
  );

  const daysRemaining = getDaysUntilDeadline(
    goal.deadline,
    referenceDate
  );

  const completed = percent >= 100;

  return {
    goal,
    currentValue,
    targetValue,
    percent,
    remainingWords,
    daysRemaining,
    overdue:
      daysRemaining !== null &&
      daysRemaining < 0 &&
      !completed,
    completed
  };
}

/**
 * Calcule la progression de tous les objectifs d’un projet.
 */
export function getAllProjectGoalProgress(
  projectData: ProjectData,
  referenceDate = new Date()
): ProjectGoalProgress[] {
  return (projectData.goals || []).map((goal) =>
    getProjectGoalProgress(
      goal,
      projectData,
      referenceDate
    )
  );
}
