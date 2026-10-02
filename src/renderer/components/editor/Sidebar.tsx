// src/renderer/components/editor/Sidebar.tsx
//
// Barre latérale de l’éditeur.
//
// Elle contient deux sections indépendantes :
// - les chapitres ;
// - les fiches World Building.
//
// Chaque section peut être repliée ou rouverte. Lorsque les deux sections
// sont ouvertes, leur hauteur peut toujours être ajustée avec la poignée
// horizontale placée entre elles.
//
// Les chapitres et les fiches restent réordonnables par glisser-déposer.

import React, {
  useEffect,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import type { EditorController } from './useEditorController';
import type {
  ItemType,
  WbType
} from '../../../shared/types';

export interface SidebarProps {
  controller: EditorController;

  onOpenCustomTypeModal: (
    slug: string | null
  ) => void;

  pendingNewWbType: WbType | null;

  onConsumePendingNewWbType: () => void;
}

interface RenameState {
  oldName: string;
  type: ItemType;
  value: string;
}

export function Sidebar({
  controller,
  onOpenCustomTypeModal,
  pendingNewWbType,
  onConsumePendingNewWbType
}: SidebarProps): React.ReactElement {
  const { t, lang } = useI18n();

  const data = controller.data();
  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

  const [wbMenuOpen, setWbMenuOpen] =
    useState(false);

  const [
    newChapterName,
    setNewChapterName
  ] = useState<string | null>(null);

  const [
    newWbState,
    setNewWbState
  ] = useState<{
    type: WbType;
    name: string;
  } | null>(null);

  const [renaming, setRenaming] =
    useState<RenameState | null>(null);

  const [
    draggedChapter,
    setDraggedChapter
  ] = useState<string | null>(null);

  const [
    draggedWb,
    setDraggedWb
  ] = useState<string | null>(null);

  /*
   * Les deux panneaux sont ouverts par défaut.
   *
   * Ils restent indépendants : l’utilisateur peut masquer uniquement les
   * chapitres, uniquement le World Building, ou les deux.
   */
  const [
    chaptersCollapsed,
    setChaptersCollapsed
  ] = useState(false);

  const [
    worldCollapsed,
    setWorldCollapsed
  ] = useState(false);

  const wbMenuRef =
    useRef<HTMLDivElement | null>(null);

  const newChapterInputRef =
    useRef<HTMLInputElement | null>(null);

  const newWbInputRef =
    useRef<HTMLInputElement | null>(null);

  const chapterNames = Object.keys(
    data.chapters
  );

  const wbNames = Object.keys(data.world);

  const customTypes = Object.entries(
    data.customWbTypes ?? {}
  );

  /*
   * Ferme le menu de création World Building lorsqu’un clic est effectué
   * ailleurs dans la fenêtre.
   */
  useEffect(() => {
    if (!wbMenuOpen) return;

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

  /*
   * EditorPage redimensionne les sections avec des styles inline.
   *
   * Quand une section est repliée ou rouverte, ces anciennes dimensions
   * doivent être supprimées afin que la section encore visible puisse
   * automatiquement reprendre tout l’espace disponible.
   */
  useEffect(() => {
    const chaptersSection =
      document.getElementById(
        'sectionChapters'
      );

    const worldSection =
      document.getElementById(
        'sectionWorld'
      );

    if (chaptersSection) {
      chaptersSection.style.height = '';

      chaptersSection.style.flex =
        chaptersCollapsed
          ? '0 0 auto'
          : '';
    }

    if (worldSection) {
      worldSection.style.height = '';

      worldSection.style.flex =
        worldCollapsed
          ? '0 0 auto'
          : '';
    }
  }, [
    chaptersCollapsed,
    worldCollapsed
  ]);

  /*
   * Si le panneau World Building est replié alors que son menu de création
   * est ouvert, le menu est fermé pour éviter de laisser un élément flottant
   * visible en dehors de sa section.
   */
  useEffect(() => {
    if (worldCollapsed) {
      setWbMenuOpen(false);
    }
  }, [worldCollapsed]);

  const collapseTitle = (
    sectionName: string
  ): string => {
    if (lang === 'en') {
      return `Hide ${sectionName}`;
    }

    return `Masquer ${sectionName}`;
  };

  const expandTitle = (
    sectionName: string
  ): string => {
    if (lang === 'en') {
      return `Show ${sectionName}`;
    }

    return `Afficher ${sectionName}`;
  };

  const openNewChapter = (): void => {
    /*
     * Si la création est déclenchée depuis un autre endroit alors que la
     * section est repliée, elle est automatiquement rouverte.
     */
    setChaptersCollapsed(false);

    const count = chapterNames.length;

    setNewChapterName(
      `${t('defaultChapterName')} ${
        count + 1
      }`
    );

    window.setTimeout(() => {
      newChapterInputRef.current?.focus();
      newChapterInputRef.current?.select();
    }, 0);
  };

  const confirmNewChapter = (): void => {
    if (
      newChapterName &&
      controller.createChapter(
        newChapterName
      )
    ) {
      setNewChapterName(null);
    }
  };

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
      newWbInputRef.current?.focus();
    }, 0);
  };

  const confirmNewWb = (): void => {
    if (
      newWbState &&
      controller.createWbItem(
        newWbState.name,
        newWbState.type
      )
    ) {
      setNewWbState(null);
    }
  };

  /*
   * Lorsqu’un nouveau type personnalisé vient d’être créé, la fenêtre de
   * création d’une première fiche de ce type est ouverte immédiatement.
   */
  useEffect(() => {
    if (pendingNewWbType === null) {
      return;
    }

    openNewWbModal(
      pendingNewWbType
    );

    onConsumePendingNewWbType();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewWbType]);

  const confirmRename = (): void => {
    if (!renaming) return;

    void controller
      .renameItem(
        renaming.oldName,
        renaming.value,
        renaming.type
      )
      .then((ok) => {
        if (ok) {
          setRenaming(null);
        }
      });
  };

  const wbTypeLabel = (
    type: WbType
  ): string => {
    const custom =
      data.customWbTypes?.[type];

    if (custom) {
      return custom.label;
    }

    return t(
      `wbLabel_${type}` as never
    );
  };

  const handleChapterDrop = (
    targetName: string
  ): void => {
    if (
      !draggedChapter ||
      draggedChapter === targetName
    ) {
      return;
    }

    const order =
      chapterNames.slice();

    const from = order.indexOf(
      draggedChapter
    );

    const to = order.indexOf(
      targetName
    );

    if (from < 0 || to < 0) {
      setDraggedChapter(null);
      return;
    }

    order.splice(from, 1);
    order.splice(
      to,
      0,
      draggedChapter
    );

    controller.reorderSidebar(
      'chapter',
      order
    );

    setDraggedChapter(null);
  };

  const handleWbDrop = (
    targetName: string
  ): void => {
    if (
      !draggedWb ||
      draggedWb === targetName
    ) {
      return;
    }

    const order = wbNames.slice();

    const from = order.indexOf(
      draggedWb
    );

    const to = order.indexOf(
      targetName
    );

    if (from < 0 || to < 0) {
      setDraggedWb(null);
      return;
    }

    order.splice(from, 1);
    order.splice(
      to,
      0,
      draggedWb
    );

    controller.reorderSidebar(
      'world',
      order
    );

    setDraggedWb(null);
  };

  const chaptersHeader =
    t('chaptersHeader');

  const worldHeader =
    t('worldBuildingHeader');

  const sectionsResizeDisabled =
    chaptersCollapsed ||
    worldCollapsed;

  return (
    <>
      <aside
        className="sidebar"
        id="sidebar"
      >
        <div
          className={`sidebar-section${
            chaptersCollapsed
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
                chaptersCollapsed
                  ? expandTitle(
                      chaptersHeader
                    )
                  : collapseTitle(
                      chaptersHeader
                    )
              }
              aria-label={
                chaptersCollapsed
                  ? expandTitle(
                      chaptersHeader
                    )
                  : collapseTitle(
                      chaptersHeader
                    )
              }
              aria-expanded={
                !chaptersCollapsed
              }
              aria-controls="chapterList"
              onClick={() => {
                setChaptersCollapsed(
                  (collapsed) =>
                    !collapsed
                );
              }}
            >
              <span
                className="sidebar-section-chevron"
                aria-hidden="true"
              >
                {chaptersCollapsed
                  ? '▸'
                  : '▾'}
              </span>

              <span className="sidebar-section-title">
                {chaptersHeader}
              </span>
            </button>

            <button
              id="btnNewChapter"
              type="button"
              className="btn-add-mini"
              title={t(
                'newChapterTitle'
              )}
              onClick={openNewChapter}
            >
              +
            </button>
          </div>

          {!chaptersCollapsed && (
            <ul
              id="chapterList"
              className="item-list"
            >
              {chapterNames.map(
                (name) => (
                  <SidebarItem
                    key={name}
                    name={name}
                    type="chapter"
                    current={
                      activeTab === name &&
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
                      setRenaming({
                        oldName: name,
                        type: 'chapter',
                        value: name
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
                      setDraggedChapter(
                        name
                      );
                    }}
                    onDragEnd={() => {
                      setDraggedChapter(
                        null
                      );
                    }}
                    onDropOn={() => {
                      handleChapterDrop(
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
                  ? expandTitle(worldHeader)
                  : collapseTitle(
                      worldHeader
                    )
              }
              aria-label={
                worldCollapsed
                  ? expandTitle(worldHeader)
                  : collapseTitle(
                      worldHeader
                    )
              }
              aria-expanded={
                !worldCollapsed
              }
              aria-controls="wbList"
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

                  /*
                   * Le bouton reste accessible même si la section est
                   * repliée. Dans ce cas, elle est d’abord rouverte.
                   */
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
                {(
                  [
                    'character',
                    'place',
                    'object',
                    'other'
                  ] as const
                ).map((builtin) => (
                  <div
                    key={builtin}
                    className="wb-menu-item"
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => {
                      openNewWbModal(
                        builtin
                      );
                    }}
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                          'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault();

                        openNewWbModal(
                          builtin
                        );
                      }
                    }}
                  >
                    {
                      {
                        character:
                          '👤',
                        place: '🏰',
                        object: '💎',
                        other: '📝'
                      }[builtin]
                    }{' '}
                    <span>
                      {t(
                        `wbLabel_${builtin}`
                      )}
                    </span>
                  </div>
                ))}

                <div id="wbCustomTypeMenuItems">
                  {customTypes.map(
                    ([slug, def]) => (
                      <div
                        className="wb-menu-item wb-menu-item-custom"
                        key={slug}
                      >
                        <button
                          type="button"
                          className="wb-menu-item-main"
                          onClick={() => {
                            openNewWbModal(
                              slug
                            );
                          }}
                        >
                          {def.icon ||
                            '📁'}{' '}
                          <span>
                            {def.label}
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
                                slug
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
                                slug,
                                def
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
            <ul
              id="wbList"
              className="item-list"
            >
              {wbNames.map((name) => {
                const item =
                  data.world[name];

                const icon =
                  item.icon ||
                  controller.registry.templateFor(
                    item.wbType
                  ).icon;

                return (
                  <SidebarItem
                    key={name}
                    name={name}
                    type="world"
                    icon={icon}
                    current={
                      activeTab === name &&
                      activeType ===
                        'world'
                    }
                    onOpen={() => {
                      controller.openItem(
                        name,
                        'world'
                      );
                    }}
                    onRename={() => {
                      setRenaming({
                        oldName: name,
                        type: 'world',
                        value: name
                      });
                    }}
                    onDelete={() => {
                      void controller.deleteItem(
                        name,
                        'world'
                      );
                    }}
                    draggable
                    onDragStart={() => {
                      setDraggedWb(
                        name
                      );
                    }}
                    onDragEnd={() => {
                      setDraggedWb(
                        null
                      );
                    }}
                    onDropOn={() => {
                      handleWbDrop(name);
                    }}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </aside>

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
                setNewWbState(
                  null
                );
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

      <Modal
        open={renaming !== null}
        title={t(
          'renameModalTitle'
        )}
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
          type="text"
          autoFocus
          placeholder={t(
            'newNamePlaceholder'
          )}
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
      </Modal>
    </>
  );
}

interface SidebarItemProps {
  name: string;
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
  const { t } = useI18n();

  const [dragOver, setDragOver] =
    useState(false);

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
      aria-label={`${
        type === 'chapter'
          ? t('ariaChapter')
          : t('ariaSheet')
      } : ${name}`}
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
      <span className="sidebar-item-label">
        {icon ? (
          <span className="item-icon">
            {icon}
          </span>
        ) : null}{' '}
        {name}
      </span>

      <div className="item-actions">
        <button
          type="button"
          className="rename-btn"
          title={t(
            'renameItemTitle'
          )}
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
          title={t(
            'deleteItemTitle'
          )}
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
