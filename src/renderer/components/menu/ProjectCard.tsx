// src/renderer/components/menu/ProjectCard.tsx
// Carte d’un projet dans la liste d’accueil.
//
// Affiche :
// - le nombre de chapitres et de mots du projet ;
// - l’objectif principal du projet, lorsqu’il existe ;
// - sa progression et le temps restant avant l’échéance ;
// - le menu d’actions permettant de renommer, exporter ou supprimer.
//
// Les projets provenant d’anciennes versions, qui ne possèdent pas encore
// l’enveloppe { chapters, world }, restent pris en charge.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { getAllProjectGoalProgress } from '../../lib/stats';
import type { ProjectData } from '../../../shared/types';

export interface ProjectCardProps {
  name: string;
  data: ProjectData;
  onOpen: () => void;
  onRename: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/**
 * Calcule le nombre de chapitres et de mots du projet.
 *
 * Les anciennes versions de Scriptorium stockaient parfois les chapitres
 * directement dans l’objet du projet, sans propriété `chapters`. Le repli
 * ci-dessous permet de continuer à afficher correctement ces projets.
 */
function countProject(data: ProjectData): {
  chapters: number;
  words: number;
} {
  const chapters =
    data?.chapters ??
    (data as unknown as Record<string, string>) ??
    {};

  let words = 0;
  let chapterCount = 0;

  Object.values(chapters).forEach((content) => {
    if (typeof content !== 'string') return;

    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (plainText) {
      words += plainText
        .split(/\s+/)
        .filter((word) => word.length > 0).length;
    }

    chapterCount += 1;
  });

  return {
    chapters: chapterCount,
    words
  };
}

export function ProjectCard({
  name,
  data,
  onOpen,
  onRename,
  onExport,
  onDelete
}: ProjectCardProps): React.ReactElement {
  const { t } = useI18n();

  const [menuOpen, setMenuOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(
    () => countProject(data),
    [data]
  );

  const goalProgress = useMemo(
    () => getAllProjectGoalProgress(data),
    [data]
  );

  /**
   * La carte présente en priorité le premier objectif non terminé.
   * Si tous les objectifs sont terminés, le premier objectif reste affiché
   * afin de conserver une indication de progression sur la page d’accueil.
   */
  const displayedGoal = useMemo(() => {
    return (
      goalProgress.find((entry) => !entry.completed) ??
      goalProgress[0] ??
      null
    );
  }, [goalProgress]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !optionsRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const isInOptions = (
    target: EventTarget | null
  ): boolean => {
    return target instanceof Node
      ? Boolean(optionsRef.current?.contains(target))
      : false;
  };

  const activateMenuAction = (
    event: React.KeyboardEvent<HTMLElement>,
    action: () => void
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const progressPercent = displayedGoal
    ? Math.max(
        0,
        Math.min(100, Math.round(displayedGoal.percent))
      )
    : 0;

  const deadlineText = (() => {
    if (!displayedGoal) return '';

    if (displayedGoal.completed) {
      return t('goalCompleted');
    }

    if (displayedGoal.daysRemaining === null) {
      return t('projectGoalNoDeadline');
    }

    if (displayedGoal.daysRemaining === 0) {
      return t('projectGoalDueToday');
    }

    if (displayedGoal.daysRemaining < 0) {
      return t('projectGoalDaysOverdue', {
        days: Math.abs(displayedGoal.daysRemaining)
      });
    }

    return t('projectGoalDaysRemaining', {
      days: displayedGoal.daysRemaining
    });
  })();

  const progressDescription = (() => {
    if (!displayedGoal) return '';

    if (displayedGoal.goal.progressMode === 'words') {
      return `${displayedGoal.currentValue.toLocaleString()} / ${displayedGoal.targetValue.toLocaleString()} ${t(
        'statsWordsUnit'
      )}`;
    }

    return `${progressPercent}%`;
  })();

  return (
    <div
      className="project-card"
      tabIndex={0}
      role="button"
      aria-label={name}
      onClick={(event) => {
        if (isInOptions(event.target)) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (isInOptions(event.target)) return;

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {name}
          </h3>

          <p>
            {t('projectStats', {
              chapters: stats.chapters,
              words: stats.words
            })}
          </p>
        </div>

        <div
          ref={optionsRef}
          className="project-options"
          style={{
            position: 'relative',
            flexShrink: 0
          }}
        >
          <button
            type="button"
            className="btn-options"
            title={t('projectOptionsTitle')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
          >
            ⋮
          </button>

          <div
            className={`options-menu dropdown-menu${
              menuOpen ? ' show' : ''
            }`}
            role="menu"
          >
            <div
              className="dropdown-item btn-rename"
              role="menuitem"
              tabIndex={menuOpen ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onRename();
              }}
              onKeyDown={(event) => {
                activateMenuAction(event, onRename);
              }}
            >
              {t('optionRename')}
            </div>

            <div
              className="dropdown-item btn-export-project"
              role="menuitem"
              tabIndex={menuOpen ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onExport();
              }}
              onKeyDown={(event) => {
                activateMenuAction(event, onExport);
              }}
            >
              {t('optionExport')}
            </div>

            <div
              className="dropdown-item btn-delete"
              role="menuitem"
              tabIndex={menuOpen ? 0 : -1}
              style={{ color: '#ef4444' }}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              onKeyDown={(event) => {
                activateMenuAction(event, onDelete);
              }}
            >
              {t('optionDelete')}
            </div>
          </div>
        </div>
      </div>

      {displayedGoal && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--border)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8
            }}
          >
            <strong
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13
              }}
              title={displayedGoal.goal.title}
            >
              🎯 {displayedGoal.goal.title}
            </strong>

            <span
              style={{
                color: displayedGoal.overdue
                  ? '#ef4444'
                  : displayedGoal.completed
                    ? '#10b981'
                    : 'var(--accent)',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}
            >
              {progressPercent} %
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={displayedGoal.goal.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            style={{
              width: '100%',
              height: 7,
              overflow: 'hidden',
              borderRadius: 999,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)'
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                borderRadius: 999,
                background: displayedGoal.completed
                  ? '#10b981'
                  : displayedGoal.overdue
                    ? '#ef4444'
                    : 'var(--accent)',
                transition: 'width 0.25s ease'
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              marginTop: 8,
              color: 'var(--text-muted)',
              fontSize: 12
            }}
          >
            <span>{progressDescription}</span>

            <span
              style={{
                color: displayedGoal.overdue
                  ? '#ef4444'
                  : displayedGoal.completed
                    ? '#10b981'
                    : 'var(--text-muted)',
                textAlign: 'right'
              }}
            >
              {deadlineText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
