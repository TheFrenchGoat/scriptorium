// src/renderer/components/menu/ProjectCard.tsx
// Carte d’un projet dans la liste d’accueil.
//
// Affiche :
// - le nombre de chapitres et de mots du projet ;
// - l’objectif principal du projet, lorsqu’il existe ;
// - sa progression et le temps restant avant l’échéance ;
// - le menu d’actions permettant de renommer, exporter ou supprimer.
//
// Le menu d’actions est rendu dans un portail React directement sous <body>.
// Il ne peut donc pas être coupé par une carte, une grille ou un conteneur
// possédant overflow:hidden. Sa position est calculée relativement au bouton
// « ⋮ » et il s’ouvre automatiquement au-dessus lorsqu’il manque de la place
// sous la carte.
//
// Les projets provenant d’anciennes versions, qui ne possèdent pas encore
// l’enveloppe { chapters, world }, restent pris en charge.

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
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

interface MenuPosition {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

const PROJECT_MENU_OPEN_EVENT =
  'scriptorium:project-menu-open';

const MENU_WIDTH = 220;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

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

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [menuPosition, setMenuPosition] =
    useState<MenuPosition | null>(null);

  /**
   * Conteneur du bouton « ⋮ » dans la carte.
   */
  const optionsRef =
    useRef<HTMLDivElement | null>(null);

  /**
   * Bouton servant de point d’ancrage au menu rendu dans le portail.
   */
  const optionsButtonRef =
    useRef<HTMLButtonElement | null>(null);

  /**
   * Le menu n’est plus un enfant DOM de la carte puisqu’il est rendu sous
   * document.body. Une référence séparée est donc nécessaire pour détecter
   * correctement les clics réalisés à l’intérieur du menu.
   */
  const menuRef =
    useRef<HTMLDivElement | null>(null);

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
      goalProgress.find(
        (entry) => !entry.completed
      ) ??
      goalProgress[0] ??
      null
    );
  }, [goalProgress]);

  /**
   * Positionne le menu relativement au bouton « ⋮ ».
   *
   * Le menu est aligné sur le bord droit du bouton. Lorsqu’il n’y a pas assez
   * de place sous le bouton, mais davantage de place au-dessus, il est ouvert
   * vers le haut. La position finale est toujours limitée aux dimensions de
   * la fenêtre afin qu’aucune action ne sorte de l’écran.
   */
  const updateMenuPosition =
    useCallback((): void => {
      const button =
        optionsButtonRef.current;

      const menu = menuRef.current;

      if (!button || !menu) {
        return;
      }

      const buttonRect =
        button.getBoundingClientRect();

      const menuWidth =
        menu.offsetWidth || MENU_WIDTH;

      const menuHeight =
        menu.offsetHeight || 130;

      const viewportWidth =
        window.innerWidth;

      const viewportHeight =
        window.innerHeight;

      const availableBelow =
        viewportHeight -
        buttonRect.bottom -
        MENU_GAP -
        VIEWPORT_PADDING;

      const availableAbove =
        buttonRect.top -
        MENU_GAP -
        VIEWPORT_PADDING;

      const shouldOpenAbove =
        availableBelow < menuHeight &&
        availableAbove > availableBelow;

      const desiredTop =
        shouldOpenAbove
          ? buttonRect.top -
            MENU_GAP -
            menuHeight
          : buttonRect.bottom +
            MENU_GAP;

      const maximumTop = Math.max(
        VIEWPORT_PADDING,
        viewportHeight -
          menuHeight -
          VIEWPORT_PADDING
      );

      const top = Math.min(
        Math.max(
          desiredTop,
          VIEWPORT_PADDING
        ),
        maximumTop
      );

      const desiredLeft =
        buttonRect.right - menuWidth;

      const maximumLeft = Math.max(
        VIEWPORT_PADDING,
        viewportWidth -
          menuWidth -
          VIEWPORT_PADDING
      );

      const left = Math.min(
        Math.max(
          desiredLeft,
          VIEWPORT_PADDING
        ),
        maximumLeft
      );

      setMenuPosition({
        top,
        left,
        placement: shouldOpenAbove
          ? 'above'
          : 'below'
      });
    }, []);

  /**
   * Une seule carte peut garder son menu ouvert.
   *
   * Lorsqu’une autre carte annonce l’ouverture de son menu, toutes les cartes
   * portant un autre nom ferment immédiatement le leur.
   */
  useEffect(() => {
    const closeWhenAnotherMenuOpens = (
      event: Event
    ): void => {
      const customEvent =
        event as CustomEvent<{
          projectName?: string;
        }>;

      if (
        customEvent.detail?.projectName !==
        name
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      PROJECT_MENU_OPEN_EVENT,
      closeWhenAnotherMenuOpens
    );

    return () => {
      document.removeEventListener(
        PROJECT_MENU_OPEN_EVENT,
        closeWhenAnotherMenuOpens
      );
    };
  }, [name]);

  /**
   * Le portail doit être rendu une première fois avant que sa hauteur réelle
   * puisse être mesurée. useLayoutEffect effectue ensuite le positionnement
   * avant l’affichage visuel de la nouvelle frame.
   */
  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    const animationFrame =
      window.requestAnimationFrame(() => {
        updateMenuPosition();
      });

    return () => {
      window.cancelAnimationFrame(
        animationFrame
      );
    };
  }, [menuOpen, updateMenuPosition]);

  /**
   * Ferme le menu lors d’un clic extérieur ou avec Échap.
   *
   * Le bouton et le menu se trouvent dans deux branches DOM différentes à
   * cause du portail : les deux références doivent donc être vérifiées.
   */
  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsidePointerDown = (
      event: PointerEvent
    ): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        optionsRef.current?.contains(
          target
        ) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setMenuOpen(false);
    };

    const closeOnEscape = (
      event: KeyboardEvent
    ): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        optionsButtonRef.current?.focus();
      }
    };

    /*
     * Le menu utilise position:fixed. Il doit donc être recalculé si la
     * fenêtre change de taille ou si un conteneur parent est défilé.
     */
    const repositionMenu = (): void => {
      updateMenuPosition();
    };

    document.addEventListener(
      'pointerdown',
      closeOnOutsidePointerDown,
      true
    );

    document.addEventListener(
      'keydown',
      closeOnEscape
    );

    window.addEventListener(
      'resize',
      repositionMenu
    );

    window.addEventListener(
      'scroll',
      repositionMenu,
      true
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        closeOnOutsidePointerDown,
        true
      );

      document.removeEventListener(
        'keydown',
        closeOnEscape
      );

      window.removeEventListener(
        'resize',
        repositionMenu
      );

      window.removeEventListener(
        'scroll',
        repositionMenu,
        true
      );
    };
  }, [
    menuOpen,
    updateMenuPosition
  ]);

  /**
   * Indique si une interaction appartient au bouton d’options.
   *
   * Le menu rendu dans le portail arrête lui-même la propagation de ses
   * événements. Ce test empêche principalement le bouton « ⋮ » d’ouvrir
   * aussi le projet.
   */
  const isInOptions = (
    target: EventTarget | null
  ): boolean => {
    return target instanceof Node
      ? Boolean(
          optionsRef.current?.contains(
            target
          )
        )
      : false;
  };

  const activateMenuAction = (
    event: React.KeyboardEvent<HTMLElement>,
    action: () => void
  ): void => {
    if (
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setMenuOpen(false);
    action();
  };

  const openOptionsMenu = (): void => {
    setMenuPosition(null);

    document.dispatchEvent(
      new CustomEvent(
        PROJECT_MENU_OPEN_EVENT,
        {
          detail: {
            projectName: name
          }
        }
      )
    );

    setMenuOpen(true);
  };

  const toggleOptionsMenu = (): void => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    openOptionsMenu();
  };

  const progressPercent = displayedGoal
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            displayedGoal.percent
          )
        )
      )
    : 0;

  const deadlineText = (() => {
    if (!displayedGoal) return '';

    if (displayedGoal.completed) {
      return t('goalCompleted');
    }

    if (
      displayedGoal.daysRemaining ===
      null
    ) {
      return t(
        'projectGoalNoDeadline'
      );
    }

    if (
      displayedGoal.daysRemaining === 0
    ) {
      return t(
        'projectGoalDueToday'
      );
    }

    if (
      displayedGoal.daysRemaining < 0
    ) {
      return t(
        'projectGoalDaysOverdue',
        {
          days: Math.abs(
            displayedGoal.daysRemaining
          )
        }
      );
    }

    return t(
      'projectGoalDaysRemaining',
      {
        days:
          displayedGoal.daysRemaining
      }
    );
  })();

  const progressDescription = (() => {
    if (!displayedGoal) return '';

    if (
      displayedGoal.goal
        .progressMode === 'words'
    ) {
      return `${displayedGoal.currentValue.toLocaleString()} / ${displayedGoal.targetValue.toLocaleString()} ${t(
        'statsWordsUnit'
      )}`;
    }

    return `${progressPercent}%`;
  })();

  const optionsMenu =
    menuOpen
      ? createPortal(
          <div
            ref={menuRef}
            className="options-menu dropdown-menu show"
            role="menu"
            data-placement={
              menuPosition?.placement ??
              'below'
            }
            style={{
              position: 'fixed',
              top:
                menuPosition?.top ?? 0,
              left:
                menuPosition?.left ?? 0,
              width: MENU_WIDTH,
              minWidth: MENU_WIDTH,
              margin: 0,
              zIndex: 10000,

              /*
               * Le menu est d’abord rendu invisiblement pour permettre sa
               * mesure, puis devient visible dès que sa position exacte a
               * été calculée.
               */
              visibility: menuPosition
                ? 'visible'
                : 'hidden'
            }}
            onClick={(event) => {
              /*
               * Les événements des portails remontent aussi dans l’arbre
               * React. Sans cet arrêt, un clic dans le menu pourrait atteindre
               * le gestionnaire de la carte et ouvrir le projet.
               */
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div
              className="dropdown-item btn-rename"
              role="menuitem"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onRename();
              }}
              onKeyDown={(event) => {
                activateMenuAction(
                  event,
                  onRename
                );
              }}
            >
              {t('optionRename')}
            </div>

            <div
              className="dropdown-item btn-export-project"
              role="menuitem"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onExport();
              }}
              onKeyDown={(event) => {
                activateMenuAction(
                  event,
                  onExport
                );
              }}
            >
              {t('optionExport')}
            </div>

            <div
              className="dropdown-item btn-delete"
              role="menuitem"
              tabIndex={0}
              style={{
                color: '#ef4444'
              }}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              onKeyDown={(event) => {
                activateMenuAction(
                  event,
                  onDelete
                );
              }}
            >
              {t('optionDelete')}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className="project-card"
        tabIndex={0}
        role="button"
        aria-label={name}
        onClick={(event) => {
          if (
            isInOptions(event.target)
          ) {
            return;
          }

          onOpen();
        }}
        onKeyDown={(event) => {
          if (
            isInOptions(event.target)
          ) {
            return;
          }

          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'flex-start',
            gap: 12
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1
            }}
          >
            <h3
              style={{
                overflow: 'hidden',
                textOverflow:
                  'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {name}
            </h3>

            <p>
              {t('projectStats', {
                chapters:
                  stats.chapters,
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
              ref={optionsButtonRef}
              type="button"
              className="btn-options"
              title={t(
                'projectOptionsTitle'
              )}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                toggleOptionsMenu();
              }}
            >
              ⋮
            </button>
          </div>
        </div>

        {displayedGoal && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop:
                '1px solid var(--border)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 8
              }}
            >
              <strong
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13
                }}
                title={
                  displayedGoal.goal
                    .title
                }
              >
                🎯{' '}
                {
                  displayedGoal.goal
                    .title
                }
              </strong>

              <span
                style={{
                  color:
                    displayedGoal.overdue
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
              aria-label={
                displayedGoal.goal.title
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                progressPercent
              }
              style={{
                width: '100%',
                height: 7,
                overflow: 'hidden',
                borderRadius: 999,
                background:
                  'var(--bg-input)',
                border:
                  '1px solid var(--border)'
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  background:
                    displayedGoal.completed
                      ? '#10b981'
                      : displayedGoal.overdue
                        ? '#ef4444'
                        : 'var(--accent)',
                  transition:
                    'width 0.25s ease'
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                gap: 10,
                marginTop: 8,
                color:
                  'var(--text-muted)',
                fontSize: 12
              }}
            >
              <span>
                {progressDescription}
              </span>

              <span
                style={{
                  color:
                    displayedGoal.overdue
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

      {optionsMenu}
    </>
  );
}
