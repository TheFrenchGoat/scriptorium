// src/renderer/components/editor/modals/StatsModal.tsx
//
// Tableau de bord des statistiques d’écriture.
//
// Fonctionnalités :
// - résumé des sessions ;
// - séries de jours consécutifs ;
// - calendrier d’écriture par mots ou durée ;
// - graphiques d’activité ;
// - historique détaillé des sessions ;
// - mots écrits par chapitre lorsque ces données sont disponibles ;
// - gestion des objectifs du projet.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import {
  calculateWritingStreak,
  filterSessionsByRange,
  formatDuration,
  formatSessionDateTime,
  formatSessionTime,
  getAllProjectGoalProgress,
  getDateKey,
  getMoodEmoji,
  getProjectSessions,
  getSessionDateRange,
  getWritingCalendarDays,
  getWritingCalendarMonthSummary,
  groupSessionsByDay,
  groupSessionsByHour,
  groupSessionsByMood,
  groupSessionsByWeekday,
  parseDateKey,
  summarizeSessions,
  type SessionActivityBucket,
  type SessionStatsPeriod,
  type WritingCalendarDay,
  type WritingCalendarMetric
} from '../../../lib/stats';
import type {
  ProjectGoal,
  ProjectGoalProgressMode,
  WritingSession,
  WritingSessionMood
} from '../../../../shared/types';
import type { EditorController } from '../useEditorController';
import './stats.css';

export interface StatsModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

type StatsTab =
  | 'overview'
  | 'calendar'
  | 'sessions'
  | 'goals';

interface GoalDraft {
  id: string | null;
  title: string;
  deadline: string;
  progressMode: ProjectGoalProgressMode;
  targetWords: string;
  manualProgress: string;
}

interface SessionDocumentStat {
  documentName: string;
  wordsBefore: number;
  wordsAfter: number;
  wordsWritten: number;
}

const EMPTY_GOAL_DRAFT: GoalDraft = {
  id: null,
  title: '',
  deadline: '',
  progressMode: 'words',
  targetWords: '',
  manualProgress: '0'
};

const PERIODS: {
  value: SessionStatsPeriod;
  labelKey:
    | 'statsRangeToday'
    | 'statsRangeWeek'
    | 'statsRangeMonth'
    | 'statsRangeYear'
    | 'statsRangeCustom';
}[] = [
  {
    value: 'today',
    labelKey: 'statsRangeToday'
  },
  {
    value: 'week',
    labelKey: 'statsRangeWeek'
  },
  {
    value: 'month',
    labelKey: 'statsRangeMonth'
  },
  {
    value: 'year',
    labelKey: 'statsRangeYear'
  },
  {
    value: 'custom',
    labelKey: 'statsRangeCustom'
  }
];

const STATS_TABS: {
  value: StatsTab;
  labelKey:
    | 'statsTabOverview'
    | 'statsWritingCalendar'
    | 'statsTabSessions'
    | 'statsTabGoals';
}[] = [
  { value: 'overview', labelKey: 'statsTabOverview' },
  { value: 'calendar', labelKey: 'statsWritingCalendar' },
  { value: 'sessions', labelKey: 'statsTabSessions' },
  { value: 'goals', labelKey: 'statsTabGoals' }
];

const CARD_STYLE: React.CSSProperties = {
  padding: 14,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-input)'
};

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(max, Math.max(min, value));
}

function inputDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function createGoalId(): string {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID ===
      'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `goal_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getSessionDocumentNames(
  session: WritingSession
): string[] {
  const names: string[] = [];

  const extendedSession =
    session as WritingSession & {
      documentNames?: string[];
    };

  if (
    Array.isArray(
      extendedSession.documentNames
    )
  ) {
    names.push(
      ...extendedSession.documentNames
    );
  }

  if (session.documentName) {
    names.push(session.documentName);
  }

  return Array.from(
    new Set(
      names
        .filter(
          (name): name is string =>
            typeof name === 'string'
        )
        .map((name) => name.trim())
        .filter(
          (name) => name.length > 0
        )
    )
  );
}

/**
 * Accepte plusieurs anciens formats possibles pour les statistiques par
 * chapitre afin de ne pas rendre les projets existants incompatibles.
 */
function getSessionDocumentStats(
  session: WritingSession
): SessionDocumentStat[] {
  const extendedSession =
    session as WritingSession & {
      documentStats?: unknown;
      chapterStats?: unknown;
      documentWordCounts?: unknown;
    };

  const source =
    extendedSession.documentStats ??
    extendedSession.chapterStats ??
    extendedSession.documentWordCounts;

  if (Array.isArray(source)) {
    return source
      .map((entry): SessionDocumentStat | null => {
        if (
          !entry ||
          typeof entry !== 'object'
        ) {
          return null;
        }

        const value = entry as Record<
          string,
          unknown
        >;

        const documentName =
          typeof value.documentName ===
          'string'
            ? value.documentName
            : typeof value.chapterName ===
                'string'
              ? value.chapterName
              : typeof value.name === 'string'
                ? value.name
                : '';

        if (!documentName.trim()) {
          return null;
        }

        const wordsBefore = Number(
          value.wordsBefore ?? 0
        );

        const wordsAfter = Number(
          value.wordsAfter ?? 0
        );

        const explicitWordsWritten =
          Number(value.wordsWritten);

        const wordsWritten =
          Number.isFinite(
            explicitWordsWritten
          )
            ? explicitWordsWritten
            : wordsAfter - wordsBefore;

        return {
          documentName:
            documentName.trim(),
          wordsBefore:
            Number.isFinite(wordsBefore)
              ? wordsBefore
              : 0,
          wordsAfter:
            Number.isFinite(wordsAfter)
              ? wordsAfter
              : 0,
          wordsWritten:
            Number.isFinite(wordsWritten)
              ? wordsWritten
              : 0
        };
      })
      .filter(
        (
          entry
        ): entry is SessionDocumentStat =>
          entry !== null
      );
  }

  if (
    source &&
    typeof source === 'object'
  ) {
    return Object.entries(
      source as Record<string, unknown>
    )
      .map(
        ([
          documentName,
          rawValue
        ]): SessionDocumentStat | null => {
          if (
            typeof rawValue === 'number'
          ) {
            return {
              documentName,
              wordsBefore: 0,
              wordsAfter: rawValue,
              wordsWritten: rawValue
            };
          }

          if (
            !rawValue ||
            typeof rawValue !== 'object'
          ) {
            return null;
          }

          const value =
            rawValue as Record<
              string,
              unknown
            >;

          const wordsBefore = Number(
            value.wordsBefore ?? 0
          );

          const wordsAfter = Number(
            value.wordsAfter ?? 0
          );

          const explicitWordsWritten =
            Number(value.wordsWritten);

          const wordsWritten =
            Number.isFinite(
              explicitWordsWritten
            )
              ? explicitWordsWritten
              : wordsAfter - wordsBefore;

          return {
            documentName,
            wordsBefore:
              Number.isFinite(
                wordsBefore
              )
                ? wordsBefore
                : 0,
            wordsAfter:
              Number.isFinite(wordsAfter)
                ? wordsAfter
                : 0,
            wordsWritten:
              Number.isFinite(
                wordsWritten
              )
                ? wordsWritten
                : 0
          };
        }
      )
      .filter(
        (
          entry
        ): entry is SessionDocumentStat =>
          entry !== null
      );
  }

  return [];
}

function moodTranslationKey(
  mood: WritingSessionMood
):
  | 'sessionMoodVeryGood'
  | 'sessionMoodGood'
  | 'sessionMoodNeutral'
  | 'sessionMoodDifficult'
  | 'sessionMoodVeryDifficult' {
  switch (mood) {
    case 'very-good':
      return 'sessionMoodVeryGood';

    case 'good':
      return 'sessionMoodGood';

    case 'difficult':
      return 'sessionMoodDifficult';

    case 'very-difficult':
      return 'sessionMoodVeryDifficult';

    case 'neutral':
    default:
      return 'sessionMoodNeutral';
  }
}

function MetricCard({
  label,
  value,
  accent
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: string;
}): React.ReactElement {
  return (
    <div style={CARD_STYLE}>
      <div
        style={{
          marginBottom: 7,
          color: 'var(--text-muted)',
          fontSize: 12
        }}
      >
        {label}
      </div>

      <div
        style={{
          overflowWrap: 'anywhere',
          color:
            accent ??
            'var(--text-main)',
          fontSize: 20,
          fontWeight: 700
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyPanel({
  children
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: '26px 15px',
        border:
          '1px dashed var(--border)',
        borderRadius:
          'var(--radius)',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }}
    >
      {children}
    </div>
  );
}

function ActivityChart({
  rows,
  value,
  formatValue,
  emptyText
}: {
  rows: {
    key: string;
    label: string;
    bucket: SessionActivityBucket;
  }[];
  value: (
    bucket: SessionActivityBucket
  ) => number;
  formatValue: (
    value: number,
    bucket: SessionActivityBucket
  ) => string;
  emptyText: string;
}): React.ReactElement {
  const maxValue = Math.max(
    0,
    ...rows.map((row) =>
      value(row.bucket)
    )
  );

  if (
    rows.length === 0 ||
    maxValue <= 0
  ) {
    return (
      <EmptyPanel>{emptyText}</EmptyPanel>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9
      }}
    >
      {rows.map((row) => {
        const currentValue = value(
          row.bucket
        );

        const width =
          currentValue > 0 &&
          maxValue > 0
            ? Math.max(
                2,
                Math.round(
                  (currentValue /
                    maxValue) *
                    100
                )
              )
            : 0;

        return (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns:
                '115px minmax(100px, 1fr) 110px',
              alignItems: 'center',
              gap: 10
            }}
          >
            <span
              title={row.label}
              style={{
                overflow: 'hidden',
                color:
                  'var(--text-muted)',
                fontSize: 12,
                textOverflow:
                  'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {row.label}
            </span>

            <div
              style={{
                height: 11,
                overflow: 'hidden',
                border:
                  '1px solid var(--border)',
                borderRadius: 999,
                background:
                  'var(--bg-app)'
              }}
            >
              <div
                style={{
                  width: `${width}%`,
                  height: '100%',
                  borderRadius: 999,
                  background:
                    'var(--accent)',
                  transition:
                    'width 0.2s ease'
                }}
              />
            </div>

            <span
              style={{
                color:
                  'var(--text-main)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'right',
                whiteSpace: 'nowrap'
              }}
            >
              {formatValue(
                currentValue,
                row.bucket
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsList({
  session,
  fallback
}: {
  session: WritingSession;
  fallback: string;
}): React.ReactElement {
  const documents =
    getSessionDocumentNames(session);

  if (documents.length === 0) {
    return <>{fallback}</>;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 7
      }}
    >
      {documents.map(
        (documentName) => (
          <span
            key={documentName}
            title={documentName}
            style={{
              display: 'inline-flex',
              maxWidth: '100%',
              alignItems: 'center',
              overflow: 'hidden',
              padding: '4px 8px',
              border:
                '1px solid var(--border)',
              borderRadius: 999,
              background:
                'var(--bg-app)',
              color:
                'var(--text-main)',
              fontSize: 12,
              textOverflow:
                'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            📄 {documentName}
          </span>
        )
      )}
    </div>
  );
}

function DocumentStatsList({
  session,
  wordsLabel
}: {
  session: WritingSession;
  wordsLabel: string;
}): React.ReactElement | null {
  const stats =
    getSessionDocumentStats(session);

  if (stats.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        marginTop: 10
      }}
    >
      {stats.map((entry) => (
        <div
          key={entry.documentName}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: 12,
            padding: '8px 10px',
            border:
              '1px solid var(--border)',
            borderRadius: 6,
            background:
              'var(--bg-app)'
          }}
        >
          <span
            title={entry.documentName}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow:
                'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            📄 {entry.documentName}
          </span>

          <strong
            style={{
              flexShrink: 0,
              color:
                entry.wordsWritten > 0
                  ? '#10b981'
                  : entry.wordsWritten <
                      0
                    ? '#ef4444'
                    : 'var(--text-muted)'
            }}
          >
            {entry.wordsWritten > 0
              ? '+'
              : ''}
            {entry.wordsWritten}{' '}
            {wordsLabel}
          </strong>
        </div>
      ))}
    </div>
  );
}

function CalendarCell({
  day,
  todayKey,
  metric,
  locale
}: {
  day: WritingCalendarDay;
  todayKey: string;
  metric: WritingCalendarMetric;
  locale: string;
}): React.ReactElement {
  const isToday =
    day.key === todayKey;

  const formattedDate =
    day.date.toLocaleDateString(
      locale,
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }
    );

  const activityText =
    metric === 'words'
      ? `${day.wordsWritten} mots`
      : formatDuration(
          day.durationSeconds
        );

  const intensityOpacity = [
    0,
    0.18,
    0.35,
    0.58,
    0.85
  ][day.intensity];

  return (
    <div
      title={`${formattedDate} — ${activityText}`}
      style={{
        position: 'relative',
        minHeight: 78,
        padding: 8,
        border: isToday
          ? '2px solid var(--accent)'
          : '1px solid var(--border)',
        borderRadius: 7,
        background:
          day.intensity > 0
            ? `color-mix(in srgb, var(--accent) ${
                Math.round(
                  intensityOpacity * 100
                )
              }%, var(--bg-input))`
            : 'var(--bg-input)',
        opacity:
          day.inDisplayedMonth
            ? 1
            : 0.42
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 5
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight:
              isToday ? 800 : 600
          }}
        >
          {day.date.getDate()}
        </span>

        {day.sessionCount > 0 && (
          <span
            style={{
              fontSize: 10,
              opacity: 0.8
            }}
          >
            {day.sessionCount}×
          </span>
        )}
      </div>

      {day.sessionCount > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 7,
            bottom: 7,
            left: 7,
            overflow: 'hidden',
            fontSize: 10,
            fontWeight: 700,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {metric === 'words'
            ? `${day.wordsWritten > 0 ? '+' : ''}${day.wordsWritten}`
            : formatDuration(
                day.durationSeconds
              )}
        </div>
      )}
    </div>
  );
}

export function StatsModal({
  open,
  controller,
  onClose
}: StatsModalProps): React.ReactElement {
  const { t, lang } = useI18n();

  const [tab, setTab] =
    useState<StatsTab>('overview');

  const [period, setPeriod] =
    useState<SessionStatsPeriod>(
      'week'
    );

  const [customStart, setCustomStart] =
    useState('');

  const [customEnd, setCustomEnd] =
    useState('');

  const [revision, setRevision] =
    useState(0);

  const [
    selectedSessionId,
    setSelectedSessionId
  ] = useState<string | null>(null);

  const [
    sessionToDelete,
    setSessionToDelete
  ] =
    useState<WritingSession | null>(
      null
    );

  const [goalDraft, setGoalDraft] =
    useState<GoalDraft | null>(null);

  const [
    goalToDelete,
    setGoalToDelete
  ] = useState<ProjectGoal | null>(
    null
  );

  const [saving, setSaving] =
    useState(false);

  const [
    calendarMonth,
    setCalendarMonth
  ] = useState(
    () =>
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
  );

  const [
    calendarMetric,
    setCalendarMetric
  ] =
    useState<WritingCalendarMetric>(
      'words'
    );

  useEffect(() => {
    if (!open) return;

    const now = new Date();
    const thirtyDaysAgo =
      new Date(now);

    thirtyDaysAgo.setDate(
      thirtyDaysAgo.getDate() - 29
    );

    setCustomStart(
      inputDateValue(thirtyDaysAgo)
    );

    setCustomEnd(
      inputDateValue(now)
    );

    setCalendarMonth(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      )
    );

    setSelectedSessionId(null);
    setSessionToDelete(null);
    setGoalDraft(null);
    setGoalToDelete(null);

    setRevision(
      (value) => value + 1
    );
  }, [open]);

  const projectData =
    controller.data();

  const allSessions = useMemo(
    () =>
      getProjectSessions(
        projectData
      ),
    // Le contrôleur conserve la référence du projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectData, revision, open]
  );

  const dateRange = useMemo(() => {
    const start =
      period === 'custom' &&
      customStart
        ? parseDateKey(customStart)
        : null;

    const end =
      period === 'custom' &&
      customEnd
        ? parseDateKey(customEnd)
        : null;

    return getSessionDateRange(
      period,
      new Date(),
      start,
      end
    );
  }, [
    period,
    customStart,
    customEnd
  ]);

  const filteredSessions = useMemo(
    () =>
      filterSessionsByRange(
        allSessions,
        dateRange
      ),
    [allSessions, dateRange]
  );

  const sortedSessions = useMemo(
    () =>
      [...filteredSessions].sort(
        (left, right) =>
          new Date(
            right.startedAt
          ).getTime() -
          new Date(
            left.startedAt
          ).getTime()
      ),
    [filteredSessions]
  );

  const summary = useMemo(
    () =>
      summarizeSessions(
        filteredSessions
      ),
    [filteredSessions]
  );

  const streakStats = useMemo(
    () => calculateWritingStreak(allSessions),
    [allSessions]
  );

  const goalProgress = useMemo(
    () =>
      getAllProjectGoalProgress(
        projectData
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectData, revision, open]
  );

  const calendarDays = useMemo(
    () =>
      getWritingCalendarDays(
        allSessions,
        calendarMonth,
        calendarMetric
      ),
    [
      allSessions,
      calendarMonth,
      calendarMetric
    ]
  );

  const calendarSummary = useMemo(
    () =>
      getWritingCalendarMonthSummary(
        calendarDays
      ),
    [calendarDays]
  );

  const dayBuckets = useMemo(() => {
    const rangeDurationDays =
      Math.ceil(
        (dateRange.end.getTime() -
          dateRange.start.getTime()) /
          86_400_000
      );

    return groupSessionsByDay(
      filteredSessions,
      rangeDurationDays <= 40
        ? dateRange
        : undefined
    );
  }, [
    filteredSessions,
    dateRange
  ]);

  const hourBuckets = useMemo(
    () =>
      groupSessionsByHour(
        filteredSessions
      ),
    [filteredSessions]
  );

  const weekdayBuckets = useMemo(
    () =>
      groupSessionsByWeekday(
        filteredSessions
      ),
    [filteredSessions]
  );

  const moodBuckets = useMemo(
    () =>
      groupSessionsByMood(
        filteredSessions
      ),
    [filteredSessions]
  );

  const locale =
    lang === 'en'
      ? 'en-US'
      : 'fr-FR';

  const weekdayLabels =
    lang === 'en'
      ? [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ]
      : [
          'Lundi',
          'Mardi',
          'Mercredi',
          'Jeudi',
          'Vendredi',
          'Samedi',
          'Dimanche'
        ];

  const calendarWeekdayLabels =
    lang === 'en'
      ? [
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun'
        ]
      : [
          'Lun',
          'Mar',
          'Mer',
          'Jeu',
          'Ven',
          'Sam',
          'Dim'
        ];

  const dayRows = dayBuckets.map(
    (bucket) => {
      const date = parseDateKey(
        bucket.key
      );

      return {
        key: bucket.key,
        label: date
          ? date.toLocaleDateString(
              locale,
              {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit'
              }
            )
          : bucket.key,
        bucket
      };
    }
  );

  const hourRows = hourBuckets
    .filter(
      (bucket) =>
        bucket.sessionCount > 0 ||
        bucket.durationSeconds > 0 ||
        bucket.wordsWritten !== 0
    )
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.key,
      bucket
    }));

  const weekdayRows =
    weekdayBuckets.map(
      (bucket) => ({
        key: bucket.key,
        label:
          weekdayLabels[
            parseInt(
              bucket.key,
              10
            )
          ] ?? bucket.key,
        bucket
      })
    );

  const concentrationHourRows =
    hourBuckets
      .filter(
        (bucket) =>
          bucket.averageConcentration10 !==
          null
      )
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.key,
        bucket
      }));

  const periodLabel =
    PERIODS.find(
      (item) =>
        item.value === period
    )?.labelKey ??
    'statsRangeWeek';

  const todayKey =
    getDateKey(new Date());

  const calendarMonthTitle =
    calendarMonth.toLocaleDateString(
      locale,
      {
        month: 'long',
        year: 'numeric'
      }
    );

  const persistProjectMetadata =
    useCallback(
      async (): Promise<void> => {
        setSaving(true);

        try {
          // Enregistre le document ouvert, puis tout le projet (sessions,
          // objectifs) par la file d'enregistrement commune.
          await controller.save();
          await controller.saveWholeProject();
        } finally {
          setSaving(false);
        }
      },
      [controller]
    );

  const deleteSession =
    useCallback(
      async (): Promise<void> => {
        if (!sessionToDelete) return;

        const data =
          controller.data();

        const sessions =
          getProjectSessions(data);

        data.writingSessions =
          sessions.filter(
            (session) =>
              session.id !==
              sessionToDelete.id
          );

        if (
          selectedSessionId ===
          sessionToDelete.id
        ) {
          setSelectedSessionId(
            null
          );
        }

        setSessionToDelete(null);

        setRevision(
          (value) => value + 1
        );

        try {
          await persistProjectMetadata();
        } catch (error) {
          console.error(
            "Impossible de supprimer la session d’écriture :",
            error
          );
        }
      },
      [
        controller,
        persistProjectMetadata,
        selectedSessionId,
        sessionToDelete
      ]
    );

  const openNewGoal = (): void => {
    setGoalDraft({
      ...EMPTY_GOAL_DRAFT
    });
  };

  const openGoalEdition = (
    goal: ProjectGoal
  ): void => {
    setGoalDraft({
      id: goal.id,
      title: goal.title,
      deadline:
        goal.deadline ?? '',
      progressMode:
        goal.progressMode,
      targetWords:
        goal.targetWords !==
          undefined &&
        goal.targetWords !== null
          ? String(
              goal.targetWords
            )
          : '',
      manualProgress:
        goal.manualProgress !==
        undefined
          ? String(
              goal.manualProgress
            )
          : '0'
    });
  };

  const saveGoal =
    useCallback(
      async (): Promise<void> => {
        if (!goalDraft) return;

        const title =
          goalDraft.title.trim();

        if (!title) return;

        const now =
          new Date().toISOString();

        const parsedTargetWords =
          parseInt(
            goalDraft.targetWords,
            10
          );

        const parsedManualProgress =
          parseFloat(
            goalDraft.manualProgress.replace(
              ',',
              '.'
            )
          );

        const existingGoals =
          controller.data().goals ??
          [];

        const existingGoal =
          goalDraft.id
            ? existingGoals.find(
                (goal) =>
                  goal.id ===
                  goalDraft.id
              )
            : undefined;

        const goal: ProjectGoal = {
          id:
            goalDraft.id ??
            createGoalId(),
          title,
          deadline:
            goalDraft.deadline ||
            null,
          progressMode:
            goalDraft.progressMode,
          targetWords:
            goalDraft.progressMode ===
              'words' &&
            Number.isFinite(
              parsedTargetWords
            ) &&
            parsedTargetWords > 0
              ? parsedTargetWords
              : null,
          manualProgress:
            goalDraft.progressMode ===
            'manual'
              ? clamp(
                  Number.isFinite(
                    parsedManualProgress
                  )
                    ? parsedManualProgress
                    : 0,
                  0,
                  100
                )
              : undefined,
          createdAt:
            existingGoal?.createdAt ??
            now,
          updatedAt: now
        };

        if (existingGoal) {
          controller.data().goals =
            existingGoals.map(
              (item) =>
                item.id === goal.id
                  ? goal
                  : item
            );
        } else {
          controller.data().goals =
            [
              ...existingGoals,
              goal
            ];
        }

        setGoalDraft(null);

        setRevision(
          (value) => value + 1
        );

        try {
          await persistProjectMetadata();
        } catch (error) {
          console.error(
            "Impossible d’enregistrer l’objectif :",
            error
          );
        }
      },
      [
        controller,
        goalDraft,
        persistProjectMetadata
      ]
    );

  const deleteGoal =
    useCallback(
      async (): Promise<void> => {
        if (!goalToDelete) return;

        const goals =
          controller.data().goals ??
          [];

        controller.data().goals =
          goals.filter(
            (goal) =>
              goal.id !==
              goalToDelete.id
          );

        if (
          goalDraft?.id ===
          goalToDelete.id
        ) {
          setGoalDraft(null);
        }

        setGoalToDelete(null);

        setRevision(
          (value) => value + 1
        );

        try {
          await persistProjectMetadata();
        } catch (error) {
          console.error(
            "Impossible de supprimer l’objectif :",
            error
          );
        }
      },
      [
        controller,
        goalDraft,
        goalToDelete,
        persistProjectMetadata
      ]
    );

  const previousCalendarMonth =
    (): void => {
      setCalendarMonth(
        (current) =>
          new Date(
            current.getFullYear(),
            current.getMonth() - 1,
            1
          )
      );
    };

  const nextCalendarMonth =
    (): void => {
      setCalendarMonth(
        (current) =>
          new Date(
            current.getFullYear(),
            current.getMonth() + 1,
            1
          )
      );
    };

  const goToCurrentMonth =
    (): void => {
      const now = new Date();

      setCalendarMonth(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        )
      );
    };

  const overview = (
    <>
      <section
        style={{
          marginBottom: 22
        }}
      >
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t('statsStreakTitle')}
        </h4>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10
          }}
        >
          <MetricCard
            label={t(
              'statsCurrentStreak'
            )}
            value={t(
              'statsStreakDays',
              {
                count:
                  streakStats.currentStreak
              }
            )}
            accent={
              streakStats.currentStreak >
              0
                ? '#10b981'
                : undefined
            }
          />

          <MetricCard
            label={t(
              'statsLongestStreak'
            )}
            value={t(
              'statsStreakDays',
              {
                count:
                  streakStats.bestStreak
              }
            )}
          />

          <MetricCard
            label={t(
              'statsActiveDays'
            )}
            value={
              streakStats.totalActiveDays
            }
          />
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(145px, 1fr))',
          gap: 10,
          marginBottom: 22
        }}
      >
        <MetricCard
          label={t(
            'statsSessionsCount'
          )}
          value={
            summary.sessionCount
          }
        />

        <MetricCard
          label={t(
            'statsWritingTime'
          )}
          value={formatDuration(
            summary.durationSeconds
          )}
        />

        <MetricCard
          label={t(
            'statsWrittenWords'
          )}
          value={
            summary.wordsWritten > 0
              ? `+${summary.wordsWritten}`
              : summary.wordsWritten
          }
          accent={
            summary.wordsWritten > 0
              ? '#10b981'
              : summary.wordsWritten <
                  0
                ? '#ef4444'
                : undefined
          }
        />

        <MetricCard
          label={t(
            'statsAverageSession'
          )}
          value={formatDuration(
            summary.averageDurationSeconds
          )}
        />

        <MetricCard
          label={t(
            'statsAverageConcentration'
          )}
          value={
            summary.averageConcentration10 ===
            null
              ? '—'
              : `${summary.averageConcentration10.toFixed(
                  1
                )}/10`
          }
        />

        <MetricCard
          label={t(
            'statsAverageEnergy'
          )}
          value={
            summary.averageEnergy10 ===
            null
              ? '—'
              : `${summary.averageEnergy10.toFixed(
                  1
                )}/10`
          }
        />
      </div>

      <section
        style={{ marginBottom: 25 }}
      >
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t('statsActivityByDay')}
        </h4>

        <ActivityChart
          rows={dayRows}
          value={(bucket) =>
            bucket.durationSeconds
          }
          formatValue={(value) =>
            formatDuration(value)
          }
          emptyText={t(
            'statsNoData'
          )}
        />
      </section>

      <section
        style={{ marginBottom: 25 }}
      >
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t(
            'statsActivityByHour'
          )}
        </h4>

        <ActivityChart
          rows={hourRows}
          value={(bucket) =>
            bucket.durationSeconds
          }
          formatValue={(value) =>
            formatDuration(value)
          }
          emptyText={t(
            'statsNoData'
          )}
        />
      </section>

      <section
        style={{ marginBottom: 25 }}
      >
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t(
            'statsProductivityByWeekday'
          )}
        </h4>

        <ActivityChart
          rows={weekdayRows}
          value={(bucket) =>
            Math.max(
              0,
              bucket.wordsWritten
            )
          }
          formatValue={(value) =>
            `${Math.round(value)} ${t(
              'statsWordsUnit'
            )}`
          }
          emptyText={t(
            'statsNoData'
          )}
        />
      </section>

      <section
        style={{ marginBottom: 25 }}
      >
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t(
            'statsConcentrationByHour'
          )}
        </h4>

        <ActivityChart
          rows={
            concentrationHourRows
          }
          value={(bucket) =>
            bucket.averageConcentration10 ??
            0
          }
          formatValue={(
            _value,
            bucket
          ) =>
            bucket.averageConcentration10 ===
            null
              ? '—'
              : `${bucket.averageConcentration10.toFixed(
                  1
                )}/10`
          }
          emptyText={t(
            'statsNoData'
          )}
        />
      </section>

      <section>
        <h4
          style={{
            marginBottom: 14
          }}
        >
          {t(
            'statsMoodProductivity'
          )}
        </h4>

        {moodBuckets.every(
          (bucket) =>
            bucket.sessionCount === 0
        ) ? (
          <EmptyPanel>
            {t('statsNoData')}
          </EmptyPanel>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10
            }}
          >
            {moodBuckets
              .filter(
                (bucket) =>
                  bucket.sessionCount >
                  0
              )
              .map((bucket) => (
                <div
                  key={bucket.mood}
                  style={CARD_STYLE}
                >
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 26
                    }}
                  >
                    {getMoodEmoji(
                      bucket.mood
                    )}
                  </div>

                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 700
                    }}
                  >
                    {t(
                      moodTranslationKey(
                        bucket.mood
                      )
                    )}
                  </div>

                  <div
                    style={{
                      color:
                        'var(--text-muted)',
                      fontSize: 12,
                      lineHeight: 1.6
                    }}
                  >
                    <div>
                      {
                        bucket.sessionCount
                      }{' '}
                      {t(
                        'statsSessionsCount'
                      ).toLowerCase()}
                    </div>

                    <div>
                      {formatDuration(
                        bucket.durationSeconds
                      )}
                    </div>

                    <div>
                      {bucket.wordsWritten >
                      0
                        ? '+'
                        : ''}
                      {bucket.wordsWritten}{' '}
                      {t(
                        'statsWordsUnit'
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </>
  );

  const calendarPanel = (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16
        }}
      >
        <div>
          <h4>
            {t(
              'statsWritingCalendar'
            )}
          </h4>

          <div
            style={{
              marginTop: 4,
              color:
                'var(--text-muted)',
              fontSize: 12,
              textTransform:
                'capitalize'
            }}
          >
            {calendarMonthTitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7
          }}
        >
          <button
            type="button"
            title={t(
              'statsCalendarPreviousMonth'
            )}
            onClick={
              previousCalendarMonth
            }
          >
            ←
          </button>

          <button
            type="button"
            onClick={
              goToCurrentMonth
            }
          >
            {t(
              'statsCalendarToday'
            )}
          </button>

          <button
            type="button"
            title={t(
              'statsCalendarNextMonth'
            )}
            onClick={
              nextCalendarMonth
            }
          >
            →
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16
        }}
      >
        <button
          type="button"
          className={
            calendarMetric ===
            'words'
              ? 'settings-choice-btn active'
              : 'settings-choice-btn'
          }
          onClick={() =>
            setCalendarMetric(
              'words'
            )
          }
        >
          {t(
            'statsCalendarWords'
          )}
        </button>

        <button
          type="button"
          className={
            calendarMetric ===
            'duration'
              ? 'settings-choice-btn active'
              : 'settings-choice-btn'
          }
          onClick={() =>
            setCalendarMetric(
              'duration'
            )
          }
        >
          {t(
            'statsCalendarDuration'
          )}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(145px, 1fr))',
          gap: 10,
          marginBottom: 18
        }}
      >
        <MetricCard
          label={t(
            'statsSessionsCount'
          )}
          value={
            calendarSummary.sessionCount
          }
        />

        <MetricCard
          label={t(
            'statsWrittenWords'
          )}
          value={
            calendarSummary.wordsWritten >
            0
              ? `+${calendarSummary.wordsWritten}`
              : calendarSummary.wordsWritten
          }
        />

        <MetricCard
          label={t(
            'statsWritingTime'
          )}
          value={formatDuration(
            calendarSummary.durationSeconds
          )}
        />

        <MetricCard
          label={t(
            'statsActiveDays'
          )}
          value={
            calendarSummary.activeDays
          }
        />
      </div>

      <div
        style={{
          minWidth: 620
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(7, minmax(70px, 1fr))',
            gap: 6,
            marginBottom: 6
          }}
        >
          {calendarWeekdayLabels.map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: '4px 0',
                  color:
                    'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'center'
                }}
              >
                {label}
              </div>
            )
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(7, minmax(70px, 1fr))',
            gap: 6
          }}
        >
          {calendarDays.map((day) => (
            <CalendarCell
              key={day.key}
              day={day}
              todayKey={todayKey}
              metric={
                calendarMetric
              }
              locale={locale}
            />
          ))}
        </div>
      </div>
    </section>
  );

  const sessionsHistory = (
    <section>
      <h4 className="stats-section-title">
        {t('statsSessionHistory')}
      </h4>

      {sortedSessions.length === 0 ? (
        <EmptyPanel>
          {t('statsNoSessions')}
        </EmptyPanel>
      ) : (
        <div className="stats-history">
          {sortedSessions.map(
            (session: WritingSession) => {
              const isSelected =
                selectedSessionId === session.id;

              const documentNames =
                getSessionDocumentNames(session);

              const documentsSummary =
                documentNames.length > 0
                  ? documentNames.join(', ')
                  : t('sessionNoDocument');

              const wordsClass =
                session.wordsWritten > 0
                  ? 'stats-positive'
                  : session.wordsWritten < 0
                    ? 'stats-negative'
                    : '';

              const signedWords = `${
                session.wordsWritten > 0 ? '+' : ''
              }${session.wordsWritten}`;

              const moodText = session.mood
                ? `${getMoodEmoji(session.mood)} ${t(
                    moodTranslationKey(session.mood)
                  )}`
                : '\u2014';

              const concentrationText =
                session.concentration !== undefined &&
                session.concentration !== null &&
                session.concentrationScale
                  ? `${session.concentration}/${session.concentrationScale}`
                  : '\u2014';

              const energyText =
                session.energy !== undefined &&
                session.energy !== null &&
                session.energyScale
                  ? `${session.energy}/${session.energyScale}`
                  : '\u2014';

              const detailItem = (
                label: string,
                value: React.ReactNode
              ): React.ReactElement => (
                <div>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              );

              return (
                <div
                  key={session.id}
                  className={
                    isSelected
                      ? 'stats-session open'
                      : 'stats-session'
                  }
                >
                  <button
                    type="button"
                    className="stats-session-row"
                    aria-expanded={isSelected}
                    onClick={() =>
                      setSelectedSessionId(
                        isSelected ? null : session.id
                      )
                    }
                  >
                    <span
                      className="stats-session-chevron"
                      aria-hidden="true"
                    >
                      {'\u25B8'}
                    </span>

                    <span className="stats-session-main">
                      <span className="stats-session-date">
                        {formatSessionDateTime(session.startedAt)}
                      </span>
                      <span
                        className="stats-session-docs"
                        title={documentsSummary}
                      >
                        {documentsSummary}
                      </span>
                    </span>

                    {session.mood && (
                      <span
                        className="stats-session-mood"
                        title={t(moodTranslationKey(session.mood))}
                      >
                        {getMoodEmoji(session.mood)}
                      </span>
                    )}

                    <span className="stats-session-figures">
                      <span>
                        {formatDuration(session.durationSeconds)}
                      </span>
                      <span className={wordsClass}>
                        {signedWords} {t('statsWordsUnit')}
                      </span>
                    </span>
                  </button>

                  {isSelected && (
                    <div className="stats-session-detail">
                      <dl className="stats-session-grid">
                        {detailItem(t('statsSessionProject'), session.projectName)}
                        {detailItem(t('statsSessionStartedAt'), formatSessionDateTime(session.startedAt))}
                        {detailItem(t('statsSessionEndedAt'), formatSessionDateTime(session.endedAt))}
                        {detailItem(t('statsSessionDuration'), formatDuration(session.durationSeconds))}
                        {detailItem(t('statsSessionWords'), signedWords)}
                        {detailItem(t('statsSessionMood'), moodText)}
                        {detailItem(t('statsSessionConcentration'), concentrationText)}
                        {detailItem(t('statsSessionEnergy'), energyText)}
                        {detailItem(
                          t('statsSessionDetails'),
                          session.source === 'pomodoro'
                            ? t('statsSessionPomodoro')
                            : t('statsSessionManual')
                        )}
                      </dl>

                      <div className="stats-card">
                        <div className="stats-card-title">
                          {t('statsSessionDocument')}
                        </div>
                        <DocumentsList
                          session={session}
                          fallback={t('sessionNoDocument')}
                        />
                        <DocumentStatsList
                          session={session}
                          wordsLabel={t('statsWordsUnit')}
                        />
                      </div>

                      {session.pomodoro && (
                        <div className="stats-card stats-session-pomodoro">
                          <div className="stats-card-title">
                            {t('statsSessionPomodoro')}
                          </div>
                          <div>
                            {t('statsSessionStartedAt')}
                            {' : '}
                            {formatSessionTime(session.pomodoro.startedAt)}
                          </div>
                          <div>
                            {t('statsSessionEndedAt')}
                            {' : '}
                            {formatSessionTime(session.pomodoro.endedAt)}
                          </div>
                          <div>
                            {t('statsSessionDuration')}
                            {' : '}
                            {formatDuration(session.pomodoro.activeSeconds)}
                          </div>
                        </div>
                      )}

                      {session.note && (
                        <div className="stats-card stats-session-note">
                          <div className="stats-card-title">
                            {t('statsSessionNote')}
                          </div>
                          <div>{session.note}</div>
                        </div>
                      )}

                      <div className="stats-session-actions">
                        <button
                          type="button"
                          className="stats-danger-btn"
                          onClick={() =>
                            setSessionToDelete(session)
                          }
                        >
                          {t('statsDeleteSession')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      )}
    </section>
  );

  const goalsPanel = (
    <section>
      <div className="stats-section-head">
        <h4 className="stats-section-title">
          {t('goalsTitle')}
        </h4>

        <button
          type="button"
          className="btn-primary"
          onClick={openNewGoal}
        >
          {t('goalNew')}
        </button>
      </div>

      {goalProgress.length === 0 ? (
        <EmptyPanel>
          {t('goalsNone')}
        </EmptyPanel>
      ) : (
        <div className="stats-goals">
          {goalProgress.map(
            (progress) => {
              const { goal } = progress;

              let deadlineText = t('goalNoDeadline');

              if (progress.completed) {
                deadlineText = t('goalCompleted');
              } else if (progress.overdue) {
                deadlineText = t('goalOverdue', {
                  days: Math.abs(
                    progress.daysRemaining ?? 0
                  )
                });
              } else if (
                progress.daysRemaining === 0
              ) {
                deadlineText = t('goalDueToday');
              } else if (
                progress.daysRemaining !== null
              ) {
                deadlineText = t('goalDaysRemaining', {
                  days: progress.daysRemaining
                });
              }

              const percent = clamp(
                progress.percent,
                0,
                100
              );

              const goalClass = progress.completed
                ? 'stats-goal done'
                : progress.overdue
                  ? 'stats-goal overdue'
                  : 'stats-goal';

              return (
                <div
                  key={goal.id}
                  className={goalClass}
                >
                  <div className="stats-goal-head">
                    <div className="stats-goal-info">
                      <div className="stats-goal-title">
                        {goal.title}
                      </div>
                      <div className="stats-goal-deadline">
                        {goal.deadline
                          ? `${goal.deadline} \u2014 ${deadlineText}`
                          : deadlineText}
                      </div>
                    </div>

                    <div className="stats-goal-percent">
                      {Math.round(progress.percent)}%
                    </div>

                    <div className="stats-goal-actions">
                      <button
                        type="button"
                        className="stats-icon-btn"
                        title={t('edit')}
                        aria-label={t('edit')}
                        onClick={() =>
                          openGoalEdition(goal)
                        }
                      >
                        {'\u270F\uFE0F'}
                      </button>

                      <button
                        type="button"
                        className="stats-icon-btn danger"
                        title={t('delete')}
                        aria-label={t('delete')}
                        onClick={() =>
                          setGoalToDelete(goal)
                        }
                      >
                        {'\uD83D\uDDD1'}
                      </button>
                    </div>
                  </div>

                  <div
                    className="stats-goal-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent)}
                  >
                    <div
                      className="stats-goal-fill"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="stats-goal-foot">
                    {goal.progressMode === 'words' &&
                    progress.targetValue !== null
                      ? t('goalWordsProgress', {
                          current: progress.currentValue,
                          target: progress.targetValue
                        })
                      : t('goalManualProgressLabel', {
                          progress: Math.round(
                            progress.percent
                          )
                        })}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </section>
  );

  return (
    <>
      <Modal
        open={open}
        title={t(
          'statsModalTitle'
        )}
        width="min(960px, 94vw)"
        maxHeight="90vh"
        onCancel={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
          >
            {t('close')}
          </button>
        }
      >
        <div
          className="stats-tabs"
          role="tablist"
        >
          {STATS_TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              className={
                tab === item.value
                  ? 'stats-tab active'
                  : 'stats-tab'
              }
              onClick={() => setTab(item.value)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        {(tab === 'overview' ||
          tab === 'sessions') && (
          <div className="stats-period">
            <label
              className="wb-label"
              style={{
                marginBottom: 10
              }}
            >
              {t(
                'statsRangeLabel'
              )}
            </label>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}
            >
              {PERIODS.map(
                (item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={
                      period ===
                      item.value
                        ? 'settings-choice-btn active'
                        : 'settings-choice-btn'
                    }
                    onClick={() =>
                      setPeriod(
                        item.value
                      )
                    }
                  >
                    {t(
                      item.labelKey
                    )}
                  </button>
                )
              )}
            </div>

            {period === 'custom' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  marginTop: 14
                }}
              >
                <label>
                  <span
                    className="wb-label"
                    style={{
                      marginBottom: 6
                    }}
                  >
                    {t(
                      'statsCustomStart'
                    )}
                  </span>

                  <input
                    type="date"
                    value={
                      customStart
                    }
                    max={
                      customEnd ||
                      undefined
                    }
                    onChange={(
                      event
                    ) =>
                      setCustomStart(
                        event.target
                          .value
                      )
                    }
                    style={{
                      width: '100%'
                    }}
                  />
                </label>

                <label>
                  <span
                    className="wb-label"
                    style={{
                      marginBottom: 6
                    }}
                  >
                    {t(
                      'statsCustomEnd'
                    )}
                  </span>

                  <input
                    type="date"
                    value={customEnd}
                    min={
                      customStart ||
                      undefined
                    }
                    onChange={(
                      event
                    ) =>
                      setCustomEnd(
                        event.target
                          .value
                      )
                    }
                    style={{
                      width: '100%'
                    }}
                  />
                </label>
              </div>
            )}

            <div
              style={{
                marginTop: 10,
                color:
                  'var(--text-muted)',
                fontSize: 12
              }}
            >
              {t(periodLabel)}
            </div>
          </div>
        )}

        {tab === 'overview' &&
          overview}

        {tab === 'calendar' &&
          calendarPanel}

        {tab === 'sessions' &&
          sessionsHistory}

        {tab === 'goals' &&
          goalsPanel}
      </Modal>

      <Modal
        open={
          sessionToDelete !== null
        }
        title={t(
          'statsDeleteSession'
        )}
        width={430}
        onCancel={() =>
          setSessionToDelete(null)
        }
        onPrimary={() =>
          void deleteSession()
        }
        footer={
          <>
            <button
              type="button"
              onClick={() =>
                setSessionToDelete(
                  null
                )
              }
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              style={{
                color: '#ef4444'
              }}
              disabled={saving}
              onClick={() =>
                void deleteSession()
              }
            >
              {t(
                'statsDeleteSession'
              )}
            </button>
          </>
        }
      >
        <p
          style={{
            margin: '15px 0',
            lineHeight: 1.6
          }}
        >
          {t(
            'statsConfirmDeleteSession'
          )}
        </p>
      </Modal>

      <Modal
        open={goalDraft !== null}
        title={
          goalDraft?.id
            ? t('goalEdit')
            : t('goalNew')
        }
        width={500}
        maxHeight="85vh"
        onCancel={() =>
          setGoalDraft(null)
        }
        onPrimary={() =>
          void saveGoal()
        }
        footer={
          <>
            <button
              type="button"
              onClick={() =>
                setGoalDraft(null)
              }
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              className="btn-primary"
              disabled={
                saving ||
                !goalDraft?.title.trim()
              }
              onClick={() =>
                void saveGoal()
              }
            >
              {t('goalSave')}
            </button>
          </>
        }
      >
        {goalDraft && (
          <>
            <div className="wb-form-group">
              <label className="wb-label">
                {t('goalName')}
              </label>

              <input
                type="text"
                autoFocus
                placeholder={t(
                  'goalNamePlaceholder'
                )}
                value={
                  goalDraft.title
                }
                onChange={(event) =>
                  setGoalDraft(
                    (current) =>
                      current
                        ? {
                            ...current,
                            title:
                              event.target
                                .value
                          }
                        : current
                  )
                }
              />
            </div>

            <div className="wb-form-group">
              <label className="wb-label">
                {t(
                  'goalDeadline'
                )}
              </label>

              <input
                type="date"
                value={
                  goalDraft.deadline
                }
                onChange={(event) =>
                  setGoalDraft(
                    (current) =>
                      current
                        ? {
                            ...current,
                            deadline:
                              event.target
                                .value
                          }
                        : current
                  )
                }
                style={{
                  width: '100%'
                }}
              />
            </div>

            <div className="wb-form-group">
              <label className="wb-label">
                {t(
                  'goalProgressMode'
                )}
              </label>

              <div
                className="settings-choice-row"
              >
                <button
                  type="button"
                  className={
                    goalDraft.progressMode ===
                    'words'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() =>
                    setGoalDraft(
                      (current) =>
                        current
                          ? {
                              ...current,
                              progressMode:
                                'words'
                            }
                          : current
                    )
                  }
                >
                  {t(
                    'goalModeWords'
                  )}
                </button>

                <button
                  type="button"
                  className={
                    goalDraft.progressMode ===
                    'manual'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() =>
                    setGoalDraft(
                      (current) =>
                        current
                          ? {
                              ...current,
                              progressMode:
                                'manual'
                            }
                          : current
                    )
                  }
                >
                  {t(
                    'goalModeManual'
                  )}
                </button>
              </div>
            </div>

            {goalDraft.progressMode ===
            'words' ? (
              <div
                className="wb-form-group"
                style={{
                  marginBottom: 0
                }}
              >
                <label className="wb-label">
                  {t(
                    'goalTargetWords'
                  )}
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t(
                    'goalTargetWordsPlaceholder'
                  )}
                  value={
                    goalDraft.targetWords
                  }
                  onChange={(event) =>
                    setGoalDraft(
                      (current) =>
                        current
                          ? {
                              ...current,
                              targetWords:
                                event.target.value.replace(
                                  /[^\d]/g,
                                  ''
                                )
                            }
                          : current
                    )
                  }
                />
              </div>
            ) : (
              <div
                className="wb-form-group"
                style={{
                  marginBottom: 0
                }}
              >
                <label className="wb-label">
                  {t(
                    'goalManualProgress'
                  )}
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    gap: 12
                  }}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={clamp(
                      parseInt(
                        goalDraft.manualProgress,
                        10
                      ) || 0,
                      0,
                      100
                    )}
                    onChange={(
                      event
                    ) =>
                      setGoalDraft(
                        (current) =>
                          current
                            ? {
                                ...current,
                                manualProgress:
                                  event
                                    .target
                                    .value
                              }
                            : current
                      )
                    }
                    style={{
                      flex: 1
                    }}
                  />

                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      goalDraft.manualProgress
                    }
                    onChange={(
                      event
                    ) => {
                      const raw =
                        event.target.value.replace(
                          /[^\d]/g,
                          ''
                        );

                      const value =
                        raw === ''
                          ? ''
                          : String(
                              clamp(
                                parseInt(
                                  raw,
                                  10
                                ) || 0,
                                0,
                                100
                              )
                            );

                      setGoalDraft(
                        (current) =>
                          current
                            ? {
                                ...current,
                                manualProgress:
                                  value
                              }
                            : current
                      );
                    }}
                    style={{
                      width: 70
                    }}
                  />

                  <span>%</span>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={
          goalToDelete !== null
        }
        title={t('goalDelete')}
        width={430}
        onCancel={() =>
          setGoalToDelete(null)
        }
        onPrimary={() =>
          void deleteGoal()
        }
        footer={
          <>
            <button
              type="button"
              onClick={() =>
                setGoalToDelete(null)
              }
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              style={{
                color: '#ef4444'
              }}
              disabled={saving}
              onClick={() =>
                void deleteGoal()
              }
            >
              {t('goalDelete')}
            </button>
          </>
        }
      >
        <p
          style={{
            margin: '15px 0',
            lineHeight: 1.6
          }}
        >
          {t(
            'goalConfirmDelete',
            {
              name:
                goalToDelete?.title ??
                ''
            }
          )}
        </p>
      </Modal>
    </>
  );
}