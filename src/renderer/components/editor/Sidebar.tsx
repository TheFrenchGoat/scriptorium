// src/renderer/components/editor/Sidebar.tsx
//
// Barre latérale de l’éditeur.
//
// Pour un roman, la première section contient les chapitres.
// Pour un scénario, elle contient les scènes.
//
// Les scènes utilisent leur identifiant interne stable pour les onglets et
// les opérations. Leur numéro visible est recalculé depuis leur ordre actuel.
//
// La seconde section contient les fiches World Building dans les deux modes.
// Elle affiche le panneau des fiches (recherche, filtre, compteur, création,
// liste réordonnable) ; un clic sur une fiche l’affiche en version compacte
// directement dans la section.
// Les fiches sont identifiées par leur identifiant stable (clé de
// `data.world`) ; leur nom affiché provient de `item.name`.
//
// L’en-tête World Building contient aussi le bouton « 🧭 Atelier », qui
// ouvre ou ferme l’atelier (WbWorkspace) : vue en cartes, vue des relations
// et, plus tard, frise chronologique, réunies en onglets. Le bouton reste
// en surbrillance tant que l’atelier est ouvert.
//
// Le menu « + » des fiches est exclusif : il se ferme dès qu’un autre menu
// déroulant s’ouvre ailleurs dans l’application.

import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';

import {
  getSceneDisplaySubtitle,
  getSceneDisplayTitle
} from '../../lib/screenplay';

import {
  isWbWorkspaceOpen,
  toggleWbWorkspace,
  useExclusiveDropdown,
  useWbWorkspaceState
} from '../../lib/wb-workspace';

import type {
  EditorController
} from './useEditorController';

import {
  WbSidePanel,
  useWbPanelListener
} from './WbSidePanel';

import type {
  ItemType,
  ScreenplayInteriorExterior,
  WbType
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// STYLE DU BOUTON DE L’ATELIER
// ---------------------------------------------------------------------------

const WB_VIEW_BTN_STYLE: React.CSSProperties = {
  flex: '0 0 auto',
  marginRight: 4,
  padding: '2px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-input)',
  color: 'var(--text-main)',
  font: 'inherit',
  fontSize: '0.85em',
  lineHeight: 1.4,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

/**
 * Complément de style quand l’atelier est ouvert.
 */
const WB_VIEW_BTN_ACTIVE_STYLE: React.CSSProperties = {
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
  color: '#fff'
};

// ---------------------------------------------------------------------------
// PROPRIÉTÉS
// ---------------------------------------------------------------------------

export interface SidebarProps {
  controller: EditorController;

  onOpenCustomTypeModal: (
    slug: string | null
  ) => void;

  pendingNewWbType: WbType | null;

  onConsumePendingNewWbType: () => void;
}

// ---------------------------------------------------------------------------
// ÉTATS LOCAUX
// ---------------------------------------------------------------------------

interface RenameState {
  /**
   * Nom du chapitre, identifiant de la fiche ou identifiant stable de la
   * scène.
   */
  oldName: string;

  type: ItemType;
  value: string;
}

interface NewSceneState {
  workingTitle: string;

  interiorExterior:
    ScreenplayInteriorExterior;

  customInteriorExterior: string;
  location: string;
  time: string;
}

// ---------------------------------------------------------------------------
// COMPOSANT
// ---------------------------------------------------------------------------

export function Sidebar({
  controller,
  onOpenCustomTypeModal,
  pendingNewWbType,
  onConsumePendingNewWbType
}: SidebarProps): React.ReactElement {
  const {
    t,
    lang
  } = useI18n();

  const data = controller.data();

  const activeTab =
    controller.activeTab();

  const activeType =
    controller.activeType();

  const isScreenplay =
    controller.isScreenplayProject();

  const screenplay =
    data.screenplay;

  const scenes =
    screenplay?.scenes ?? [];

  const screenplayLanguage =
    screenplay?.settings
      .conventionLanguage ??
    (lang === 'en' ? 'en' : 'fr');

  const chapterNames =
    Object.keys(data.chapters);

  const registry =
    controller.registry;

  /**
   * Catégories du projet (intégrées et personnalisées).
   */
  const allCategories =
    registry
      .categorySlugs()
      .map((slug) =>
        registry.categoryFor(slug)
      );

  const builtinCategories =
    allCategories.filter(
      (category) => category.builtin
    );

  const customCategories =
    allCategories.filter(
      (category) => !category.builtin
    );

  const [
    wbMenuOpen,
    setWbMenuOpen
  ] = useState(false);

  /**
   * L’atelier est-il ouvert ? (surbrillance du bouton « 🧭 Atelier »)
   */
  const [
    workspaceOpen,
    setWorkspaceOpen
  ] = useState<boolean>(
    isWbWorkspaceOpen
  );

  const [
    newChapterName,
    setNewChapterName
  ] = useState<string | null>(
    null
  );

  const [
    newSceneState,
    setNewSceneState
  ] = useState<NewSceneState | null>(
    null
  );

  const [
    newWbState,
    setNewWbState
  ] = useState<{
    type: WbType;
    name: string;
  } | null>(null);

  const [
    renaming,
    setRenaming
  ] = useState<RenameState | null>(
    null
  );

  /**
   * Pour un roman, cette valeur contient le nom du chapitre.
   *
   * Pour un scénario, elle contient l’identifiant stable de la scène.
   */
  const [
    draggedPrimaryItem,
    setDraggedPrimaryItem
  ] = useState<string | null>(
    null
  );

  /**
   * Identifiant de la fiche affichée en version compacte dans la section
   * World Building. `null` : la liste des fiches est affichée.
   */
  const [
    selectedWbId,
    setSelectedWbId
  ] = useState<string | null>(
    null
  );

  const [
    primarySectionCollapsed,
    setPrimarySectionCollapsed
  ] = useState(false);

  const [
    worldCollapsed,
    setWorldCollapsed
  ] = useState(false);

  const wbMenuRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const newChapterInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const newSceneTitleInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const newWbInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const renameInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  /**
   * Liste des lieux déjà utilisés par les en-têtes structurés.
   *
   * Elle alimente les suggestions du formulaire de création d’une scène.
   */
  const usedSceneLocations =
    useMemo(() => {
      const locations =
        new Set<string>();

      scenes.forEach((scene) => {
        if (
          scene.heading.mode !==
          'structured'
        ) {
          return;
        }

        const location =
          scene.heading.location.trim();

        if (location) {
          locations.add(location);
        }
      });

      return Array.from(
        locations
      ).sort((left, right) =>
        left.localeCompare(
          right,
          screenplayLanguage
        )
      );
    }, [scenes, screenplayLanguage]);

  // -----------------------------------------------------------------------
  // ATELIER : ÉTAT DU BOUTON
  // -----------------------------------------------------------------------

  /*
   * L’atelier signale chaque ouverture, fermeture ou changement d’onglet ;
   * on relit simplement son état pour mettre le bouton à jour.
   */
  useWbWorkspaceState(() => {
    setWorkspaceOpen(
      isWbWorkspaceOpen()
    );
  });

  // -----------------------------------------------------------------------
  // PANNEAU DES FICHES : ÉVÉNEMENTS EXTERNES
  // -----------------------------------------------------------------------

  /*
   * openWbPanel(id), closeWbPanel() et toggleWbPanel() peuvent être appelés
   * depuis n’importe quel endroit de l’application (clic sur un nom
   * surligné, champ référence d’une fiche, raccourci…).
   */
  useWbPanelListener((detail) => {
    if (detail.action === 'open') {
      setWorldCollapsed(false);

      setSelectedWbId(
        detail.itemId ?? null
      );

      return;
    }

    if (detail.action === 'close') {
      setSelectedWbId(null);
      return;
    }

    if (detail.action === 'toggle') {
      setWorldCollapsed(
        (collapsed) => !collapsed
      );
    }
  });

  /*
   * Si la fiche affichée est supprimée, on revient à la liste.
   */
  useEffect(() => {
    if (
      selectedWbId !== null &&
      !data.world[selectedWbId]
    ) {
      setSelectedWbId(null);
    }
  }, [selectedWbId, data.world]);

  // -----------------------------------------------------------------------
  // MENU WORLD BUILDING
  // -----------------------------------------------------------------------

  /*
   * Un seul menu déroulant ouvert à la fois dans toute l’application.
   */
  useExclusiveDropdown(
    wbMenuOpen,
    () => {
      setWbMenuOpen(false);
    }
  );

  useEffect(() => {
    if (!wbMenuOpen) {
      return;
    }

    const close = (
      event: MouseEvent
    ): void => {
      if (
        !wbMenuRef.current?.contains(
          event.target as Node
        )
      ) {
        setWbMenuOpen(false);
      }
    };

    document.addEventListener(
      'click',
      close
    );

    return () => {
      document.removeEventListener(
        'click',
        close
      );
    };
  }, [wbMenuOpen]);

  // -----------------------------------------------------------------------
  // REDIMENSIONNEMENT DES SECTIONS
  // -----------------------------------------------------------------------

  useEffect(() => {
    /*
     * Les identifiants historiques sont conservés afin de rester compatibles
     * avec le système de redimensionnement présent dans EditorPage.
     *
     * sectionChapters désigne donc la première section, qu’elle affiche des
     * chapitres ou des scènes.
     */
    const primarySection =
      document.getElementById(
        'sectionChapters'
      );

    const worldSection =
      document.getElementById(
        'sectionWorld'
      );

    if (primarySection) {
      primarySection.style.height =
        '';

      primarySection.style.flex =
        primarySectionCollapsed
          ? '0 0 auto'
          : '';
    }

    if (worldSection) {
      worldSection.style.height =
        '';

      worldSection.style.flex =
        worldCollapsed
          ? '0 0 auto'
          : '';
    }
  }, [primarySectionCollapsed, worldCollapsed]);

  useEffect(() => {
    if (worldCollapsed) {
      setWbMenuOpen(false);
    }
  }, [worldCollapsed]);

  // -----------------------------------------------------------------------
  // LIBELLÉS
  // -----------------------------------------------------------------------

  const primarySectionTitle =
    isScreenplay
      ? lang === 'en'
        ? 'Scenes'
        : 'Scènes'
      : t('chaptersHeader');

  const worldHeader =
    t('worldBuildingHeader');

  const collapseTitle = (
    sectionName: string
  ): string => {
    return lang === 'en'
      ? `Hide ${sectionName}`
      : `Masquer ${sectionName}`;
  };

  const expandTitle = (
    sectionName: string
  ): string => {
    return lang === 'en'
      ? `Show ${sectionName}`
      : `Afficher ${sectionName}`;
  };

  // -----------------------------------------------------------------------
  // CRÉATION D’UN CHAPITRE
  // -----------------------------------------------------------------------

  const openNewChapter =
    (): void => {
      setPrimarySectionCollapsed(
        false
      );

      const count =
        chapterNames.length;

      setNewChapterName(
        `${t('defaultChapterName')} ${
          count + 1
        }`
      );

      window.setTimeout(() => {
        newChapterInputRef.current
          ?.focus();

        newChapterInputRef.current
          ?.select();
      }, 0);
    };

  const confirmNewChapter =
    (): void => {
      if (
        newChapterName &&
        controller.createChapter(
          newChapterName
        )
      ) {
        setNewChapterName(null);
      }
    };

  // -----------------------------------------------------------------------
  // CRÉATION D’UNE SCÈNE
  // -----------------------------------------------------------------------

  const openNewScene =
    (): void => {
      setPrimarySectionCollapsed(
        false
      );

      setNewSceneState({
        workingTitle: '',
        interiorExterior: 'INT.',
        customInteriorExterior: '',
        location: '',
        time:
          screenplayLanguage === 'en'
            ? 'DAY'
            : 'JOUR'
      });

      window.setTimeout(() => {
        newSceneTitleInputRef.current
          ?.focus();
      }, 0);
    };

  const confirmNewScene =
    (): void => {
      if (!newSceneState) {
        return;
      }

      const createdSceneId =
        controller.createScene({
          workingTitle:
            newSceneState
              .workingTitle.trim(),

          interiorExterior:
            newSceneState
              .interiorExterior,

          customInteriorExterior:
            newSceneState
              .interiorExterior ===
            'OTHER'
              ? newSceneState
                  .customInteriorExterior
                  .trim()
              : '',

          location:
            newSceneState
              .location.trim(),

          time:
            newSceneState
              .time.trim()
        });

      if (createdSceneId) {
        setNewSceneState(null);
      }
    };

  const openNewPrimaryItem =
    (): void => {
      if (isScreenplay) {
        openNewScene();
        return;
      }

      openNewChapter();
    };

  // -----------------------------------------------------------------------
  // CRÉATION WORLD BUILDING
  // -----------------------------------------------------------------------

  const openNewWbModal = (
    type: WbType
  ): void => {
    setWorldCollapsed(false);
    setWbMenuOpen(false);

    setNewWbState({
      type,
      name: ''
    });

    window.setTimeout(() => {
      newWbInputRef.current
        ?.focus();
    }, 0);
  };

  const confirmNewWb =
    (): void => {
      if (!newWbState) {
        return;
      }

      const createdId =
        controller.createWbItem(
          newWbState.name,
          newWbState.type
        );

      if (createdId) {
        setNewWbState(null);

        /*
         * La nouvelle fiche s’affiche directement dans la section.
         */
        setWorldCollapsed(false);
        setSelectedWbId(createdId);
      }
    };

  /**
   * Bouton « + Ajouter élément » du panneau des fiches.
   *
   * Si un type est filtré, la fenêtre de création s’ouvre directement pour
   * ce type ; sinon, le menu des types s’ouvre.
   */
  const handlePanelCreateItem = (
    type: WbType | null
  ): void => {
    if (type) {
      openNewWbModal(type);
      return;
    }

    setWorldCollapsed(false);

    /*
     * Le délai évite que le clic en cours ne referme aussitôt le menu
     * (écouteur de clic extérieur).
     */
    window.setTimeout(() => {
      setWbMenuOpen(true);
    }, 0);
  };

  useEffect(() => {
    if (
      pendingNewWbType === null
    ) {
      return;
    }

    openNewWbModal(
      pendingNewWbType
    );

    onConsumePendingNewWbType();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewWbType]);

  // -----------------------------------------------------------------------
  // RENOMMAGE
  // -----------------------------------------------------------------------

  const openRename = (
    state: RenameState
  ): void => {
    setRenaming(state);

    window.setTimeout(() => {
      renameInputRef.current
        ?.focus();

      renameInputRef.current
        ?.select();
    }, 0);
  };

  const confirmRename =
    (): void => {
      if (!renaming) {
        return;
      }

      if (
        renaming.type === 'scene'
      ) {
        const renamed =
          controller.renameScene(
            renaming.oldName,
            renaming.value
          );

        if (renamed) {
          setRenaming(null);
        }

        return;
      }

      void controller
        .renameItem(
          renaming.oldName,
          renaming.value,
          renaming.type
        )
        .then((renamed) => {
          if (renamed) {
            setRenaming(null);
          }
        });
    };

  /**
   * Bouton ✏️ d’une ligne du panneau des fiches.
   */
  const handlePanelRenameItem = (
    itemId: string
  ): void => {
    const item =
      data.world[itemId];

    if (!item) {
      return;
    }

    openRename({
      oldName: itemId,
      type: 'world',
      value: item.name
    });
  };

  // -----------------------------------------------------------------------
  // LIBELLÉS WORLD BUILDING
  // -----------------------------------------------------------------------

  const wbTypeLabel = (
    type: WbType
  ): string => {
    return registry.categoryFor(
      type
    ).label;
  };

  // -----------------------------------------------------------------------
  // RÉORDONNANCEMENT DES CHAPITRES OU DES SCÈNES
  // -----------------------------------------------------------------------

  const handlePrimaryItemDrop = (
    targetIdentifier: string
  ): void => {
    if (
      !draggedPrimaryItem ||
      draggedPrimaryItem ===
        targetIdentifier
    ) {
      setDraggedPrimaryItem(
        null
      );

      return;
    }

    const currentOrder =
      isScreenplay
        ? scenes.map(
            (scene) => scene.id
          )
        : chapterNames.slice();

    const from =
      currentOrder.indexOf(
        draggedPrimaryItem
      );

    const to =
      currentOrder.indexOf(
        targetIdentifier
      );

    if (
      from < 0 ||
      to < 0
    ) {
      setDraggedPrimaryItem(
        null
      );

      return;
    }

    currentOrder.splice(
      from,
      1
    );

    currentOrder.splice(
      to,
      0,
      draggedPrimaryItem
    );

    if (isScreenplay) {
      controller.reorderScenes(
        currentOrder
      );
    } else {
      controller.reorderSidebar(
        'chapter',
        currentOrder
      );
    }

    setDraggedPrimaryItem(null);
  };

  const sectionsResizeDisabled =
    primarySectionCollapsed ||
    worldCollapsed;

  const newPrimaryItemTitle =
    isScreenplay
      ? lang === 'en'
        ? 'New scene'
        : 'Nouvelle scène'
      : t('newChapterTitle');

  const renameModalTitle =
    renaming?.type === 'scene'
      ? lang === 'en'
        ? 'Rename scene'
        : 'Renommer la scène'
      : t('renameModalTitle');

  const renamePlaceholder =
    renaming?.type === 'scene'
      ? lang === 'en'
        ? 'Optional working title'
        : 'Titre de travail facultatif'
      : t('newNamePlaceholder');

  const workspaceBtnStyle:
    React.CSSProperties =
    workspaceOpen
      ? {
          ...WB_VIEW_BTN_STYLE,
          ...WB_VIEW_BTN_ACTIVE_STYLE
        }
      : WB_VIEW_BTN_STYLE;

  // -----------------------------------------------------------------------
  // AFFICHAGE
  // -----------------------------------------------------------------------

  return (
    <>
      <aside
        className="sidebar"
        id="sidebar"
      >
        {/* --------------------------------------------------------------- */}
        {/* CHAPITRES OU SCÈNES                                             */}
        {/* --------------------------------------------------------------- */}

        <div
          className={`sidebar-section${
            primarySectionCollapsed
              ? ' collapsed'
              : ''
          }`}
          id="sectionChapters"
        >
          <div className="sidebar-header">
            <button
              type="button"
              className="sidebar-section-toggle"
              title={
                primarySectionCollapsed
                  ? expandTitle(
                      primarySectionTitle
                    )
                  : collapseTitle(
                      primarySectionTitle
                    )
              }
              aria-label={
                primarySectionCollapsed
                  ? expandTitle(
                      primarySectionTitle
                    )
                  : collapseTitle(
                      primarySectionTitle
                    )
              }
              aria-expanded={
                !primarySectionCollapsed
              }
              aria-controls="chapterList"
              onClick={() => {
                setPrimarySectionCollapsed(
                  (collapsed) =>
                    !collapsed
                );
              }}
            >
              <span
                className="sidebar-section-chevron"
                aria-hidden="true"
              >
                {primarySectionCollapsed
                  ? '▸'
                  : '▾'}
              </span>

              <span className="sidebar-section-title">
                {primarySectionTitle}
              </span>
            </button>

            <button
              id="btnNewChapter"
              type="button"
              className="btn-add-mini"
              title={newPrimaryItemTitle}
              aria-label={
                newPrimaryItemTitle
              }
              onClick={
                openNewPrimaryItem
              }
            >
              +
            </button>
          </div>

          {!primarySectionCollapsed && (
            <ul
              id="chapterList"
              className="item-list"
            >
              {isScreenplay
                ? scenes.map(
                    (
                      scene,
                      sceneIndex
                    ) => {
                      const title =
                        getSceneDisplayTitle(
                          scene,
                          sceneIndex,
                          screenplayLanguage
                        );

                      const subtitle =
                        getSceneDisplaySubtitle(
                          scene,
                          screenplayLanguage
                        );

                      return (
                        <SidebarItem
                          key={
                            scene.id
                          }
                          name={title}
                          subtitle={
                            subtitle
                          }
                          number={
                            sceneIndex +
                            1
                          }
                          type="scene"
                          current={
                            activeTab ===
                              scene.id &&
                            activeType ===
                              'scene'
                          }
                          onOpen={() => {
                            controller.openItem(
                              scene.id,
                              'scene'
                            );
                          }}
                          onRename={() => {
                            openRename({
                              oldName:
                                scene.id,
                              type: 'scene',
                              value:
                                scene.workingTitle
                            });
                          }}
                          onDelete={() => {
                            void controller.deleteScene(
                              scene.id
                            );
                          }}
                          draggable
                          onDragStart={() => {
                            setDraggedPrimaryItem(
                              scene.id
                            );
                          }}
                          onDragEnd={() => {
                            setDraggedPrimaryItem(
                              null
                            );
                          }}
                          onDropOn={() => {
                            handlePrimaryItemDrop(
                              scene.id
                            );
                          }}
                        />
                      );
                    }
                  )
                : chapterNames.map(
                    (name) => (
                      <SidebarItem
                        key={name}
                        name={name}
                        type="chapter"
                        current={
                          activeTab ===
                            name &&
                          activeType ===
                            'chapter'
                        }
                        onOpen={() => {
                          controller.openItem(
                            name,
                            'chapter'
                          );
                        }}
                        onRename={() => {
                          openRename({
                            oldName:
                              name,
                            type:
                              'chapter',
                            value:
                              name
                          });
                        }}
                        onDelete={() => {
                          void controller.deleteItem(
                            name,
                            'chapter'
                          );
                        }}
                        draggable
                        onDragStart={() => {
                          setDraggedPrimaryItem(
                            name
                          );
                        }}
                        onDragEnd={() => {
                          setDraggedPrimaryItem(
                            null
                          );
                        }}
                        onDropOn={() => {
                          handlePrimaryItemDrop(
                            name
                          );
                        }}
                      />
                    )
                  )}
            </ul>
          )}
        </div>

        <div
          className={`resize-handle-h${
            sectionsResizeDisabled
              ? ' disabled'
              : ''
          }`}
          id="sidebarSectionsResizeHandle"
          aria-hidden="true"
        />

        {/* --------------------------------------------------------------- */}
        {/* WORLD BUILDING                                                   */}
        {/* --------------------------------------------------------------- */}

        <div
          className={`sidebar-section${
            worldCollapsed
              ? ' collapsed'
              : ''
          }`}
          id="sectionWorld"
        >
          <div className="sidebar-header">
            <button
              type="button"
              className="sidebar-section-toggle"
              title={
                worldCollapsed
                  ? expandTitle(
                      worldHeader
                    )
                  : collapseTitle(
                      worldHeader
                    )
              }
              aria-label={
                worldCollapsed
                  ? expandTitle(
                      worldHeader
                    )
                  : collapseTitle(
                      worldHeader
                    )
              }
              aria-expanded={
                !worldCollapsed
              }
              aria-controls="wbSectionBody"
              onClick={() => {
                setWorldCollapsed(
                  (collapsed) =>
                    !collapsed
                );
              }}
            >
              <span
                className="sidebar-section-chevron"
                aria-hidden="true"
              >
                {worldCollapsed
                  ? '▸'
                  : '▾'}
              </span>

              <span className="sidebar-section-title">
                {worldHeader}
              </span>
            </button>

            {/* Atelier : cartes, relations (et bientôt frise) en onglets */}
            <button
              id="btnWbWorkspace"
              type="button"
              className="wb-ws-open-btn"
              title={t('wbWsBtnTitle')}
              aria-label={t('wbWsBtnTitle')}
              aria-pressed={
                workspaceOpen
              }
              onClick={(event) => {
                event.stopPropagation();
                setWbMenuOpen(false);
                toggleWbWorkspace();
              }}
              style={workspaceBtnStyle}
            >
              {t('wbWsBtn')}
            </button>

            <div
              className="sidebar-header-action"
              ref={wbMenuRef}
            >
              <button
                id="btnNewWB"
                type="button"
                className="btn-add-mini"
                title={t('addWBTitle')}
                onClick={(event) => {
                  event.stopPropagation();

                  if (worldCollapsed) {
                    setWorldCollapsed(
                      false
                    );

                    window.setTimeout(
                      () => {
                        setWbMenuOpen(
                          true
                        );
                      },
                      0
                    );

                    return;
                  }

                  setWbMenuOpen(
                    (opened) =>
                      !opened
                  );
                }}
              >
                +
              </button>

              <div
                id="wbMenu"
                className={`wb-menu${
                  wbMenuOpen
                    ? ' show'
                    : ''
                }`}
                role="menu"
              >
                {builtinCategories.map(
                  (category) => (
                    <div
                      key={
                        category.slug
                      }
                      className="wb-menu-item"
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        openNewWbModal(
                          category.slug
                        );
                      }}
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key ===
                            ' '
                        ) {
                          event.preventDefault();

                          openNewWbModal(
                            category.slug
                          );
                        }
                      }}
                    >
                      {category.icon}{' '}

                      <span>
                        {
                          category.label
                        }
                      </span>
                    </div>
                  )
                )}

                <div id="wbCustomTypeMenuItems">
                  {customCategories.map(
                    (category) => (
                      <div
                        className="wb-menu-item wb-menu-item-custom"
                        key={
                          category.slug
                        }
                      >
                        <button
                          type="button"
                          className="wb-menu-item-main"
                          onClick={() => {
                            openNewWbModal(
                              category.slug
                            );
                          }}
                        >
                          {category.icon ||
                            '📁'}{' '}

                          <span>
                            {
                              category.label
                            }
                          </span>
                        </button>

                        <div className="wb-menu-item-actions">
                          <button
                            type="button"
                            title={t(
                              'customTypeEditTitle'
                            )}
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              setWbMenuOpen(
                                false
                              );

                              onOpenCustomTypeModal(
                                category.slug
                              );
                            }}
                          >
                            ✏️
                          </button>

                          <button
                            type="button"
                            title={t(
                              'customTypeDeleteTitle'
                            )}
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              setWbMenuOpen(
                                false
                              );

                              void controller.deleteCustomType(
                                category.slug
                              );
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="wb-menu-item wb-menu-item-new-type"
                  id="btnNewCustomWbType"
                  role="menuitem"
                  onClick={() => {
                    setWbMenuOpen(
                      false
                    );

                    onOpenCustomTypeModal(
                      null
                    );
                  }}
                >
                  ➕{' '}

                  <span>
                    {t(
                      'wbNewCustomTypeBtn'
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {!worldCollapsed && (
            <div
              id="wbSectionBody"
              className="wb-section-body"
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: '1 1 auto',
                minHeight: 0
              }}
            >
              <WbSidePanel
                controller={controller}
                itemId={selectedWbId}
                onSelectItem={
                  setSelectedWbId
                }
                onCreateItem={
                  handlePanelCreateItem
                }
                onRenameItem={
                  handlePanelRenameItem
                }
              />
            </div>
          )}
        </div>
      </aside>

      {/* ----------------------------------------------------------------- */}
      {/* NOUVEAU CHAPITRE                                                  */}
      {/* ----------------------------------------------------------------- */}

      <Modal
        open={
          newChapterName !== null
        }
        title={t(
          'newChapterModalTitle'
        )}
        onCancel={() => {
          setNewChapterName(null);
        }}
        onPrimary={
          confirmNewChapter
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setNewChapterName(
                  null
                );
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={
                confirmNewChapter
              }
            >
              {t('create')}
            </button>
          </>
        }
      >
        <input
          ref={newChapterInputRef}
          type="text"
          placeholder={t(
            'chapterNamePlaceholder'
          )}
          value={
            newChapterName ?? ''
          }
          onChange={(event) => {
            setNewChapterName(
              event.target.value
            );
          }}
        />
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* NOUVELLE SCÈNE                                                    */}
      {/* ----------------------------------------------------------------- */}

      <Modal
        open={
          newSceneState !== null
        }
        title={
          lang === 'en'
            ? 'New scene'
            : 'Nouvelle scène'
        }
        width={620}
        onCancel={() => {
          setNewSceneState(null);
        }}
        onPrimary={
          confirmNewScene
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setNewSceneState(
                  null
                );
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={
                confirmNewScene
              }
            >
              {t('create')}
            </button>
          </>
        }
      >
        {newSceneState && (
          <div
            style={{
              display: 'grid',
              gap: 16
            }}
          >
            <label
              style={{
                display: 'grid',
                gap: 6
              }}
            >
              <span>
                {lang === 'en'
                  ? 'Optional working title'
                  : 'Titre de travail facultatif'}
              </span>

              <input
                ref={
                  newSceneTitleInputRef
                }
                type="text"
                placeholder={
                  lang === 'en'
                    ? 'E.g. The meeting'
                    : 'Ex. La rencontre'
                }
                value={
                  newSceneState
                    .workingTitle
                }
                onChange={(event) => {
                  const value =
                    event.target.value;

                  setNewSceneState(
                    (previous) =>
                      previous
                        ? {
                            ...previous,
                            workingTitle:
                              value
                          }
                        : previous
                  );
                }}
              />
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 14
              }}
            >
              <label
                style={{
                  display: 'grid',
                  gap: 6
                }}
              >
                <span>
                  {lang === 'en'
                    ? 'Interior / exterior'
                    : 'Intérieur / extérieur'}
                </span>

                <select
                  value={
                    newSceneState
                      .interiorExterior
                  }
                  onChange={(event) => {
                    const value =
                      event.target
                        .value as ScreenplayInteriorExterior;

                    setNewSceneState(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              interiorExterior:
                                value
                            }
                          : previous
                    );
                  }}
                >
                  <option value="INT.">
                    INT.
                  </option>

                  <option value="EXT.">
                    EXT.
                  </option>

                  <option value="INT./EXT.">
                    INT./EXT.
                  </option>

                  <option value="EXT./INT.">
                    EXT./INT.
                  </option>

                  <option value="OTHER">
                    {lang === 'en'
                      ? 'Other…'
                      : 'Autre…'}
                  </option>
                </select>
              </label>

              {newSceneState
                .interiorExterior ===
              'OTHER' ? (
                <label
                  style={{
                    display: 'grid',
                    gap: 6
                  }}
                >
                  <span>
                    {lang === 'en'
                      ? 'Custom prefix'
                      : 'Mention personnalisée'}
                  </span>

                  <input
                    type="text"
                    placeholder="I/E."
                    value={
                      newSceneState
                        .customInteriorExterior
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setNewSceneState(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                customInteriorExterior:
                                  value
                              }
                            : previous
                      );
                    }}
                  />
                </label>
              ) : (
                <label
                  style={{
                    display: 'grid',
                    gap: 6
                  }}
                >
                  <span>
                    {lang === 'en'
                      ? 'Time'
                      : 'Moment'}
                  </span>

                  <input
                    type="text"
                    placeholder={
                      screenplayLanguage ===
                      'en'
                        ? 'DAY'
                        : 'JOUR'
                    }
                    value={
                      newSceneState.time
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setNewSceneState(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                time:
                                  value
                              }
                            : previous
                      );
                    }}
                  />
                </label>
              )}

              <label
                style={{
                  display: 'grid',
                  gap: 6,
                  gridColumn:
                    newSceneState
                      .interiorExterior ===
                    'OTHER'
                      ? undefined
                      : '1 / -1'
                }}
              >
                <span>
                  {lang === 'en'
                    ? 'Location'
                    : 'Lieu'}
                </span>

                <input
                  type="text"
                  list="screenplayLocationSuggestions"
                  placeholder={
                    screenplayLanguage ===
                    'en'
                      ? 'APARTMENT'
                      : 'APPARTEMENT'
                  }
                  value={
                    newSceneState.location
                  }
                  onChange={(
                    event
                  ) => {
                    const value =
                      event.target.value;

                    setNewSceneState(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              location:
                                value
                            }
                          : previous
                    );
                  }}
                />

                <datalist id="screenplayLocationSuggestions">
                  {usedSceneLocations.map(
                    (location) => (
                      <option
                        key={
                          location
                        }
                        value={
                          location
                        }
                      />
                    )
                  )}
                </datalist>
              </label>

              {newSceneState
                .interiorExterior ===
              'OTHER' && (
                <label
                  style={{
                    display: 'grid',
                    gap: 6
                  }}
                >
                  <span>
                    {lang === 'en'
                      ? 'Time'
                      : 'Moment'}
                  </span>

                  <input
                    type="text"
                    placeholder={
                      screenplayLanguage ===
                      'en'
                        ? 'DAY'
                        : 'JOUR'
                    }
                    value={
                      newSceneState.time
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setNewSceneState(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                time:
                                  value
                              }
                            : previous
                      );
                    }}
                  />
                </label>
              )}
            </div>

            <p
              style={{
                margin: 0,
                color:
                  'var(--text-muted)',
                fontSize: 13,
                lineHeight: 1.5
              }}
            >
              {lang === 'en'
                ? 'All these fields can be changed later. A scene may also be created with incomplete information.'
                : 'Tous ces champs pourront être modifiés ensuite. Une scène peut également être créée avec des informations incomplètes.'}
            </p>
          </div>
        )}
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* NOUVELLE FICHE WORLD BUILDING                                     */}
      {/* ----------------------------------------------------------------- */}

      <Modal
        open={newWbState !== null}
        title={
          newWbState
            ? t(
                'newWBModalTitle',
                {
                  type: wbTypeLabel(
                    newWbState.type
                  )
                }
              )
            : ''
        }
        onCancel={() => {
          setNewWbState(null);
        }}
        onPrimary={confirmNewWb}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setNewWbState(null);
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={confirmNewWb}
            >
              {t('create')}
            </button>
          </>
        }
      >
        <input
          ref={newWbInputRef}
          type="text"
          placeholder={t(
            'wbNamePlaceholder'
          )}
          value={
            newWbState?.name ?? ''
          }
          onChange={(event) => {
            setNewWbState(
              (previous) =>
                previous
                  ? {
                      ...previous,
                      name:
                        event.target
                          .value
                    }
                  : previous
            );
          }}
        />
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* RENOMMAGE                                                         */}
      {/* ----------------------------------------------------------------- */}

      <Modal
        open={renaming !== null}
        title={renameModalTitle}
        onCancel={() => {
          setRenaming(null);
        }}
        onPrimary={confirmRename}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRenaming(null);
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={confirmRename}
            >
              {t('rename')}
            </button>
          </>
        }
      >
        <input
          ref={renameInputRef}
          type="text"
          placeholder={
            renamePlaceholder
          }
          value={
            renaming?.value ?? ''
          }
          onChange={(event) => {
            setRenaming(
              (previous) =>
                previous
                  ? {
                      ...previous,
                      value:
                        event.target
                          .value
                    }
                  : previous
            );
          }}
        />

        {renaming?.type ===
          'scene' && (
          <p
            style={{
              margin:
                '10px 0 0',
              color:
                'var(--text-muted)',
              fontSize: 13,
              lineHeight: 1.5
            }}
          >
            {lang === 'en'
              ? 'This is an internal working title. It is not included in screenplay exports by default.'
              : "Il s’agit d’un titre de travail interne. Il n’est pas inclus par défaut dans les exports du scénario."}
          </p>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// ÉLÉMENT DE LISTE
// ---------------------------------------------------------------------------

interface SidebarItemProps {
  name: string;
  subtitle?: string;
  number?: number;
  type: ItemType;
  icon?: string;
  current: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}

function SidebarItem({
  name,
  subtitle,
  number,
  type,
  icon,
  current,
  onOpen,
  onRename,
  onDelete,
  draggable,
  onDragStart,
  onDragEnd,
  onDropOn
}: SidebarItemProps): React.ReactElement {
  const {
    t,
    lang
  } = useI18n();

  const [
    dragOver,
    setDragOver
  ] = useState(false);

  const itemKindLabel =
    type === 'scene'
      ? lang === 'en'
        ? 'Scene'
        : 'Scène'
      : type === 'chapter'
        ? t('ariaChapter')
        : t('ariaSheet');

  const renameTitle =
    type === 'scene'
      ? lang === 'en'
        ? 'Rename scene'
        : 'Renommer la scène'
      : t('renameItemTitle');

  const deleteTitle =
    type === 'scene'
      ? lang === 'en'
        ? 'Delete scene'
        : 'Supprimer la scène'
      : t('deleteItemTitle');

  return (
    <li
      className={`${
        current ? 'current' : ''
      }${
        dragOver
          ? ' drag-over'
          : ''
      }`}
      tabIndex={0}
      role="button"
      aria-label={`${itemKindLabel} : ${name}${
        subtitle
          ? ` — ${subtitle}`
          : ''
      }`}
      draggable={draggable}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          onOpen();
        }

        if (
          event.key === 'Delete'
        ) {
          event.preventDefault();
          onDelete();
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={() => {
        onDragEnd();
        setDragOver(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        onDropOn();
      }}
    >
      <span
        className="sidebar-item-label"
        style={
          subtitle
            ? {
                display: 'flex',
                minWidth: 0,
                flex: 1,
                alignItems:
                  'flex-start',
                gap: 8
              }
            : undefined
        }
      >
        {icon ? (
          <span className="item-icon">
            {icon}
          </span>
        ) : null}

        {number !== undefined ? (
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              minWidth: 22,
              color:
                'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.35,
              textAlign: 'right'
            }}
          >
            {number}
          </span>
        ) : null}

        {subtitle ? (
          <span
            style={{
              display: 'grid',
              minWidth: 0,
              gap: 2
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                fontWeight:
                  current
                    ? 700
                    : 600,
                lineHeight: 1.25,
                textOverflow:
                  'ellipsis',
                whiteSpace:
                  'nowrap'
              }}
            >
              {name}
            </span>

            <span
              title={subtitle}
              style={{
                overflow: 'hidden',
                color:
                  'var(--text-muted)',
                fontFamily:
                  "'Courier Prime', 'Courier New', Courier, monospace",
                fontSize: 10,
                lineHeight: 1.25,
                textOverflow:
                  'ellipsis',
                whiteSpace:
                  'nowrap'
              }}
            >
              {subtitle}
            </span>
          </span>
        ) : (
          <span
            style={{
              overflow: 'hidden',
              textOverflow:
                'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {name}
          </span>
        )}
      </span>

      <div className="item-actions">
        <button
          type="button"
          className="rename-btn"
          title={renameTitle}
          aria-label={renameTitle}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        >
          ✏️
        </button>

        <button
          type="button"
          className="delete-btn"
          title={deleteTitle}
          aria-label={deleteTitle}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          🗑
        </button>
      </div>
    </li>
  );
}
