// src/renderer/components/editor/EditorPage.tsx
//
// Assemblage principal de la page d’édition.
//
// Cette page prend en charge :
// - les projets roman avec ChapterEditor ;
// - les projets scénario avec ScreenplayEditor ;
// - les fiches World Building communes aux deux modes ;
// - les raccourcis clavier ;
// - le zoom de la feuille ;
// - le redimensionnement de la barre latérale.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { useI18n } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import {
  Dropdown,
  DropdownItem
} from '../common/Dropdown';
import { Modal } from '../common/Modal';

import { Sidebar } from './Sidebar';
import { TabsBar } from './TabsBar';
import { Ruler } from './Ruler';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { ChapterEditor } from './ChapterEditor';
import { ScreenplayEditor } from './ScreenplayEditor';
import { WbSheet } from './WbSheet';

import {
  useEditorController,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN
} from './useEditorController';

import { HelpModal } from './modals/HelpModal';
import { ReplaceModal } from './modals/ReplaceModal';
import { GlobalSearchModal } from './modals/GlobalSearchModal';
import { StatsModal } from './modals/StatsModal';
import { BackupsModal } from './modals/BackupsModal';
import { SettingsModal } from './modals/SettingsModal';
import { GrammarSetupModal } from './modals/GrammarSetupModal';
import { CustomWbTypeModal } from './modals/CustomWbTypeModal';

import type {
  EditorPrefs,
  ThemeName,
  WbType
} from '../../../shared/types';

import './ScreenplayEditor.css';

type AccentMode =
  | 'grave'
  | 'acute'
  | 'circumflex'
  | 'dieresis'
  | 'cedilla'
  | null;

const ACCENT_MAP: Record<
  Exclude<AccentMode, 'cedilla' | null>,
  Record<string, string>
> = {
  grave: {
    a: 'à',
    e: 'è',
    i: 'ì',
    o: 'ò',
    u: 'ù'
  },

  acute: {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú'
  },

  circumflex: {
    a: 'â',
    e: 'ê',
    i: 'î',
    o: 'ô',
    u: 'û'
  },

  dieresis: {
    a: 'ä',
    e: 'ë',
    i: 'ï',
    o: 'ö',
    u: 'ü'
  }
};

export interface EditorPageProps {
  projectName: string;
  theme: ThemeName;

  onChangeTheme: (
    theme: ThemeName
  ) => void;

  onBack: () => void;

  onRenamed: (
    newName: string
  ) => void;
}

type ModalKey =
  | 'help'
  | 'replace'
  | 'globalSearch'
  | 'stats'
  | 'backups'
  | 'settings'
  | 'grammarSetup'
  | 'customWbType'
  | null;

/**
 * Indique si le focus se trouve dans une zone d’écriture.
 */
function getEditorFocusState(): {
  chapter: boolean;
  screenplay: boolean;
  anyEditor: boolean;
} {
  const activeElement =
    document.activeElement as HTMLElement | null;

  const chapter =
    activeElement?.id === 'editor';

  const screenplay = Boolean(
    activeElement?.matches(


[
'.screenplay-element-content',
        '.screenplay-scene-heading'
      ].join(', ')
    ) ||
      activeElement?.closest(
        [
          '.screenplay-element-content',
          '.screenplay-scene-heading'
        ].join(', ')
      )
  );

  return {
    chapter,
    screenplay,
    anyEditor:
      chapter || screenplay
  };
}

export function EditorPage({
  projectName,
  theme,
  onChangeTheme,
  onBack,
  onRenamed
}: EditorPageProps): React.ReactElement {
  const { t } = useI18n();

  const {
    showInfo,
    showConfirm
  } = useDialogs();

  const applyEditorPrefsToBody =
    useCallback(
      (
        prefs: EditorPrefs
      ): void => {
        document.body.style.setProperty(
          '--editor-width',
          `${prefs.width}px`
        );

        document.body.style.setProperty(
          '--editor-font',
          prefs.fontFamily ||
            "'Roboto', sans-serif"
        );

        document.body.style.setProperty(
          '--editor-line-height',
          String(
            prefs.lineHeight ?? 1.6
          )
        );

        document.body.style.setProperty(
          '--ui-font-size',
          `${
            prefs.uiFontSize ?? 14
          }px`
        );

        document.body.style.setProperty(
          '--ui-font-family',
          prefs.uiFontFamily ??
            "'Roboto', sans-serif"
        );

        document.body.style.setProperty(
          '--editor-margin-left',
          `${
            prefs.marginLeft ?? 80
          }px`
        );

        document.body.style.setProperty(
          '--editor-margin-right',
          `${
            prefs.marginRight ?? 80
          }px`
        );

        document.body.style.setProperty(
          '--editor-indent',
          `${
            prefs.firstLineIndent ?? 0
          }px`
        );
      },
      []
    );

  const controller =
    useEditorController({
      projectName,
      showInfo,
      showConfirm,
      onApplyPrefs:
        applyEditorPrefsToBody
    });

  const [
    openModal,
    setOpenModal
  ] = useState<ModalKey>(null);

  const [
    editingTypeSlug,
    setEditingTypeSlug
  ] = useState<string | null>(
    null
  );

  const [
    pendingNewWbType,
    setPendingNewWbType
  ] = useState<WbType | null>(
    null
  );

  const [
    renameProjectValue,
    setRenameProjectValue
  ] = useState<string | null>(
    null
  );

  const editorContainerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const pendingAccentRef =
    useRef<AccentMode>(null);

  const chapterHtmlRef =
    useRef<string>('');

  const closeModal =
    useCallback((): void => {
      setOpenModal(null);
    }, []);

  const handleBack =
    useCallback((): void => {
      void controller
        .save()
        .then(() => {
          onBack();
        });
    }, [
      controller,
      onBack
    ]);

  const confirmRenameProject =
    useCallback(
      async (): Promise<void> => {
        if (
          renameProjectValue ===
          null
        ) {
          return;
        }

        const trimmed =
          renameProjectValue.trim();

        const renamed =
          await controller.renameProject(
            trimmed
          );

        if (!renamed) {
          return;
        }

        onRenamed(trimmed);

        setRenameProjectValue(
          null
        );
      },
      [
        controller,
        onRenamed,
        renameProjectValue


    ]);

  // -----------------------------------------------------------------------
  // REDIMENSIONNEMENT DE LA BARRE LATÉRALE
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!controller.ready) {
      return;
    }

    const sidebar =
      document.getElementById(
        'sidebar'
      );

    const sidebarHandle =
      document.getElementById(
        'sidebarResizeHandle'
      );

    const firstSection =
      document.getElementById(
        'sectionChapters'
      );

    const sectionsHandle =
      document.getElementById(
        'sidebarSectionsResizeHandle'
      );

    if (
      !sidebar ||
      !sidebarHandle ||
      !firstSection ||
      !sectionsHandle
    ) {
      return;
    }

    const SIDEBAR_MIN = 160;
    const SIDEBAR_MAX = 500;
    const SECTION_MIN = 60;

    let resizingSidebar = false;
    let resizingSections = false;

    const endAnyResize =
      (): void => {
        resizingSidebar = false;
        resizingSections = false;

        sidebarHandle.classList.remove(
          'dragging'
        );

        sectionsHandle.classList.remove(
          'dragging'
        );

        document.body.classList.remove(
          'resizing-panel'
        );
      };

    const onSidebarMouseDown = (
      event: MouseEvent
    ): void => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();

      resizingSidebar = true;

      sidebarHandle.classList.add(
        'dragging'
      );

      document.body.classList.add(
        'resizing-panel'
      );
    };

    const onSectionsMouseDown = (
      event: MouseEvent
    ): void => {
      if (
        event.button !== 0 ||
        sectionsHandle.classList.contains(
          'disabled'
        )
      ) {
        return;
      }

      event.preventDefault();

      resizingSections = true;

      sectionsHandle.classList.add(
        'dragging'
      );

      document.body.classList.add(
        'resizing-panel'
      );

      firstSection.style.flex =
        '0 0 auto';
    };

    const onMouseMove = (
      event: MouseEvent
    ): void => {
      if (
        !resizingSidebar &&
        !resizingSections
      ) {
        return;
      }

      if (
        (event.buttons & 1) === 0
      ) {
        endAnyResize();
        return;
      }

      if (resizingSidebar) {
        const rect =
          sidebar.getBoundingClientRect();

        const newWidth = Math.min(
          SIDEBAR_MAX,
          Math.max(
            SIDEBAR_MIN,
            event.clientX -
              rect.left
          )
        );

        document.body.style.setProperty(
          '--sidebar-width',
          `${newWidth}px`
        );
      }

      if (resizingSections) {
        const parent =
          firstSection.parentElement;

        if (!parent) {
          return;
        }

        const parentRect =
          parent.getBoundingClientRect();

        const maximumHeight =
          parentRect.height -
          SECTION_MIN -
          sectionsHandle.offsetHeight;

        const newHeight =
          Math.min(
            maximumHeight,
            Math.max(
              SECTION_MIN,
              event.clientY -
                parentRect.top
            )
          );

        firstSection.style.height =
          `${newHeight}px`;
      }
    };

    sidebarHandle.addEventListener(
      'mousedown',
      onSidebarMouseDown
    );

    sectionsHandle.addEventListener(
      'mousedown',
      onSectionsMouseDown
    );

    window.addEventListener(
      'mousemove',
      onMouseMove
    );

    window.addEventListener(
      'mouseup',
      endAnyResize
    );

    window.addEventListener(
      'blur',
      endAnyResize
    );

    document.addEventListener(
      'mouseleave',
      endAnyResize
    );

    return () => {
      sidebarHandle.removeEventListener(
        'mousedown',
        onSidebarMouseDown
      );

      sectionsHandle.removeEventListener(
        'mousedown',
        onSectionsMouseDown
      );

      window.removeEventListener(
        'mousemove',
        onMouseMove
      );

      window.removeEventListener(
        'mouseup',
        endAnyResize
      );

      window.removeEventListener(
        'blur',
        endAnyResize
      );

      document.removeEventListener(
        'mouseleave',
        endAnyResize
      );
    };
  }, [controller.ready]);

  // -----------------------------------------------------------------------
  // ZOOM AVEC CTRL + MOLETTE
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!controller.ready) {
      return;
    }

    const container =
      editorContainerRef.current;

    if (!container) {
      return;
    }

    const onWheel = (
      event: WheelEvent
    ): void => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();

      controller.zoomBy(
        event.deltaY < 0
          ? 1
          : -1
      );
    };

    container.addEventListener(
      'wheel',
      onWheel,
      {
        passive: false
      }
    );

    return () => {
      container.removeEventListener(
        'wheel',
        onWheel
      );
    };
  }, [
    controller,
    controller.ready
  ]);

  // -----------------------------------------------------------------------
  // RACCOURCIS CLAVIER
  // -----------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent
    ): void => {
      const focusState =
        getEditorFocusState();

      const ctrlOrCmd =
        event.ctrlKey ||
        event.metaKey;

      /*
       * Composition des accents Word/LibreOffice.
       */
      if (
        focusState.anyEditor &&
        pendingAccentRef.current
      ) {
        const pending =
          pendingAccentRef.current;

        pendingAccentRef.current =
          null;

        if (
          !ctrlOrCmd &&
          !event.altKey &&
          event.key.length === 1
        ) {
          const lower =
            event.key.toLowerCase();

          const composed =
            pending === 'cedilla'
              ? lower === 'c'
                ? 'ç'
                : undefined
              : ACCENT_MAP[pending][
                  lower
                ];

          if (composed) {
            event.preventDefault();

            controller.insertText(
              event.key !== lower
                ? composed.toUpperCase()
                : composed
            );

            return;
          }
        }
      }

      /*
       * Annuler / rétablir dans les zones d’écriture uniquement.
       */
      if (
        ctrlOrCmd &&
        focusState.anyEditor
      ) {
        if (
          !event.shiftKey &&
          event.key.toLowerCase() ===
            'z'
        ) {
          event.preventDefault();
          controller.undo();
          return;
        }

        if (
          event.key.toLowerCase() ===
            'y' ||
          (
            event.shiftKey &&
            event.key.toLowerCase() ===
              'z'
          )
        ) {
          event.preventDefault();
          controller.redo();
          return;
        }
      }

      /*
       * Amorce des accents.
       */
      if (
        focusState.anyEditor &&
        ctrlOrCmd &&
        !event.altKey
      ) {
        if (
          !event.shiftKey &&
          event.key === '`'
        ) {
          event.preventDefault();

          pendingAccentRef.current =
            'grave';

          return;
        }

        if (
          !event.shiftKey &&
          event.key === "'"
        ) {
          event.preventDefault();

          pendingAccentRef.current =
            'acute';

          return;
        }

        if (
          event.shiftKey &&
          event.key === '^'
        ) {
          event.preventDefault();

          pendingAccentRef.current =
            'circumflex';

          return;
        }

        if (
          event.shiftKey &&
          (
            event.key === ':' ||
            event.key === ';'
          )
        ) {
          event.preventDefault();

          pendingAccentRef.current =
            'dieresis';

          return;
        }

        if (
          !event.shiftKey &&
          event.key === ','
        ) {
          event.preventDefault();

          pendingAccentRef.current =
            'cedilla';

          return;
        }
      }

      if (!ctrlOrCmd) {
        return;
      }

      const key =
        event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();

        void controller.save();

        return;
      }

      /*
       * Mise en forme en ligne.
       *
       * Elle reste disponible pour le scénario, mais la structure et
       * l’alignement des paragraphes sont toujours déterminés par leur type.
       */
      if (
        focusState.anyEditor &&
        key === 'b'
      ) {
        event.preventDefault();

        controller.format(
          'bold'
        );

        return;
      }

      if (
        focusState.anyEditor &&
        key === 'i'
      ) {
        event.preventDefault();

        controller.format(
          'italic'
        );

        return;
      }

      if (
        focusState.anyEditor &&
        key === 'u'
      ) {
        event.preventDefault();

        controller.format(
          'underline'
        );

        return;
      }

      /*
       * Les alignements libres sont réservés au roman.
       *
       * Dans un scénario, l’alignement dépend du type explicite du
       * paragraphe : action, personnage, dialogue, transition, etc.
       */
      if (focusState.chapter) {
        if (key === 'l') {
          event.preventDefault();

          controller.format(
            'justifyLeft'
          );

          return;
        }

        if (key === 'e') {
          event.preventDefault();

          controller.format(
            'justifyCenter'
          );

          return;
        }

        if (key === 'r') {
          event.preventDefault();

          controller.format(
            'justifyRight'
          );

          return;
        }

        if (key === 'j') {
          event.preventDefault();

          controller.format(
            'justifyFull'
          );

          return;
        }
      }

      if (key === 'f') {
        event.preventDefault();

        setOpenModal(
          event.shiftKey
            ? 'globalSearch'
            : 'replace'
        );

        return;
      }

      /*
       * Ctrl+Tab change d’onglet.
       *
       * Tab seul reste disponible dans l’éditeur scénario pour changer le
       * type du paragraphe.
       */
      if (
        event.key === 'Tab' &&
        controller.tabs().length > 1
      ) {
        event.preventDefault();

        controller.cycleTab(
          event.shiftKey
            ? -1
            : 1
        );

        return;
      }

      if (
        event.key === '=' ||
        event.key === '+'
      ) {
        event.preventDefault();

        controller.zoomBy(1);

        return;
      }

      if (event.key === '-') {
        event.preventDefault();

        controller.zoomBy(-1);

        return;
      }

      if (event.key === '0') {
        event.preventDefault();

        controller.setZoom(1);
      }
    };

    document.addEventListener(
      'keydown',
      onKeyDown
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKeyDown
      );
    };
  }, [controller]);

  const activeTab =
    controller.activeTab();

  const activeType =
    controller.activeType();

  const data =
    controller.data();

  const zoom =
    controller.zoom();

  const screenplay =
    data.projectType ===
      'screenplay'
      ? data.screenplay
      : undefined;

  if (
    activeType === 'chapter' &&
    activeTab
  ) {
    chapterHtmlRef.current =
      data.chapters[
        activeTab
      ] ?? '';
  }

  const exportActions: {
    key:
      | 'txt'
      | 'md'
      | 'pdf'
      | 'docx'
      | 'project';

    labelKey:
      | 'exportTxtItem'
      | 'exportMdItem'
      | 'exportPdfItem'
      | 'exportDocxItem'
      | 'exportProjectItem';
  }[] = [
    {
      key: 'txt',
      labelKey:
        'exportTxtItem'
    },
    {
      key: 'md',
      labelKey:
        'exportMdItem'
    },
    {
      key: 'pdf',
      labelKey:
        'exportPdfItem'
    },
    {
      key: 'docx',
      labelKey:
        'exportDocxItem'
    },
    {
      key: 'project',
      labelKey:
        'exportProjectItem'
    }
  ];

  if (!controller.ready) {
    return (
      <div className="editor-page" />
    );
  }

  return (
    <>
      <header className="editor-header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <button
            id="btnBack"
            type="button"
            title={t(
              'backToProjects'
            )}
            onClick={handleBack}
          >
            ←
          </button>

          <h2 id="projectTitle">
            {projectName}
          </h2>

          <button
            type="button"
            title={t(
              'renameProjectModalTitle'
            )}
            onClick={() => {
              setRenameProjectValue(
                projectName
              );
            }}
            style={{
              padding: '4px 8px',
              fontSize: 13
            }}
          >
            ✏️
          </button>
        </div>

        <div className="header-actions">
          <Dropdown
            label={
              <>
                {t(
                  'exportMenuBtn'
                )}
              </>
            }
            buttonId="btnExportMenu"
            containerStyle={{
              position: 'relative'
            }}
          >
            {(close) => (
              <>
                {exportActions.map(
                  (action) => (
                    <DropdownItem
                      key={
                        action.key
                      }
                      onSelect={() => {
                        close();

                        void controller.exportAs(
                          action.key
                        );
                      }}
                    >
                      {t(
                        action.labelKey
                      )}
                    </DropdownItem>
                  )
                )}
              </>
            )}
          </Dropdown>

          <button
            id="btnBackups"
            type="button"
            title={t(
              'backupsBtnTitle'
            )}
            onClick={() => {
              setOpenModal(
                'backups'
              );
            }}
          >
            {t('backupsBtn')}
          </button>

          <button
            id="btnStats"
            type="button"
            onClick={() => {
              setOpenModal(
                'stats'
              );
            }}
          >
            {t('statsMenuBtn')}
          </button>

          <button
            id="btnHelp"
            type="button"
            title={t(
              'helpMenuBtnTitle'
            )}
            onClick={() => {
              setOpenModal(
                'help'
              );
            }}
          >
            {t('helpMenuBtn')}
          </button>

          <button
            id="btnSettingsToggle"
            type="button"
            onClick={() => {
              setOpenModal(
                'settings'
              );
            }}
          >
            {t('settingsToggle')}
          </button>
        </div>
      </header>

      <Toolbar
        controller={controller}
        onOpenGlobalSearch={() => {
          setOpenModal(
            'globalSearch'
          );
        }}
        onOpenReplace={() => {
          setOpenModal(
            'replace'
          );
        }}
      />

      <div className="workspace">
        <Sidebar
          controller={controller}
          onOpenCustomTypeModal={(
            slug
          ) => {
            setEditingTypeSlug(
              slug
            );

            setOpenModal(
              'customWbType'
            );
          }}
          pendingNewWbType={
            pendingNewWbType
          }
          onConsumePendingNewWbType={() => {
            setPendingNewWbType(
              null
            );
          }}
        />

        <div
          className="resize-handle-v"
          id="sidebarResizeHandle"
        />

        <main className="editor-area">
          <TabsBar
            controller={controller}
          />

          {activeTab &&
            activeType ===
              'chapter' && (
              <Ruler
                controller={
                  controller
                }
              />
            )}

          <div
            className={`editor-scroll-container${
              data.projectType ===
              'screenplay'
                ? ' screenplay-scroll-container'
                : ''
            }`}
            id="editorContainer"
            ref={editorContainerRef}
          >
            {activeTab &&
              activeType ===
                'chapter' && (
                <ChapterEditor
                  key={activeTab}
                  controller={
                    controller
                  }
                  chapterName={
                    activeTab
                  }
                  initialHtml={
                    chapterHtmlRef.current
                  }
                  placeholder={t(
                    'editorPlaceholder'
                  )}
                  nativeSpellcheck={controller.nativeSpellcheckEnabled()}
                  zoom={zoom}
                />
              )}

            {activeType ===
              'scene' &&
              screenplay && (
                <ScreenplayEditor
                  screenplay={
                    screenplay
                  }
                  activeSceneId={
                    activeTab
                  }
                  zoom={zoom}
                  nativeSpellcheck={controller.nativeSpellcheckEnabled()}
                  onChange={(
                    nextScreenplay
                  ) => {
                    controller.updateScreenplay(
                      nextScreenplay
                    );
                  }}
                  onSelectScene={(
                    sceneId
                  ) => {
                    if (
                      controller.activeTab() ===
                        sceneId &&
                      controller.activeType() ===
                        'scene'
                    ) {
                      return;
                    }

                    controller.openItem(
                      sceneId,
                      'scene'
                    );
                  }}
                />
              )}

            {activeTab &&
              activeType ===
                'world' && (
                <WbSheet
                  controller={
                    controller
                  }
                  name={activeTab}
                />
              )}

            {activeType ===
              'scene' &&
              !screenplay && (
                <div className="screenplay-empty-state">
                  <span
                    className="screenplay-empty-state-icon"
                    aria-hidden="true"
                  >
                    ⚠️
                  </span>

                  <h3>
                    Données du
                    scénario
                    indisponibles
                  </h3>

                  <p>
                    Le projet est
                    identifié comme un
                    scénario, mais ses
                    données de scénario
                    sont absentes.
                  </p>
                </div>
              )}
          </div>

          <StatusBar
            controller={controller}
            onOpenGrammarSetup={() => {
              setOpenModal(
                'grammarSetup'
              );
            }}
          />
        </main>
      </div>

      <HelpModal
        open={
          openModal === 'help'
        }
        onClose={closeModal}
      />

      <ReplaceModal
        open={
          openModal === 'replace'
        }
        controller={controller}
        onClose={closeModal}
      />

      <GlobalSearchModal
        open={
          openModal ===
          'globalSearch'
        }
        controller={controller}
        onClose={closeModal}
      />

      <StatsModal
        open={
          openModal === 'stats'
        }
        controller={controller}
        onClose={closeModal}
      />

      <BackupsModal
        open={
          openModal === 'backups'
        }
        controller={controller}
        onClose={closeModal}
      />

      <SettingsModal
        open={
          openModal === 'settings'
        }
        controller={controller}
        theme={theme}
        onChangeTheme={
          onChangeTheme
        }
        onOpenGrammarSetup={() => {
          setOpenModal(
            'grammarSetup'
          );
        }}
        onClose={closeModal}
      />

      <GrammarSetupModal
        open={
          openModal ===
          'grammarSetup'
        }
        controller={controller}
        onClose={closeModal}
      />

      <CustomWbTypeModal
        open={
          openModal ===
          'customWbType'
        }
        controller={controller}
        editingSlug={
          editingTypeSlug
        }
        onClose={closeModal}
        onCreated={(slug) => {
          setPendingNewWbType(
            slug
          );
        }}
      />

      <Modal
        open={
          renameProjectValue !==
          null
        }
        title={t(
          'renameProjectModalTitle'
        )}
        onCancel={() => {
          setRenameProjectValue(
            null
          );
        }}
        onPrimary={() => {
          void confirmRenameProject();
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRenameProjectValue(
                  null
                );
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={() => {
                void confirmRenameProject();
              }}
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
            renameProjectValue ??
            ''
          }
          onChange={(event) => {
            setRenameProjectValue(
              event.target.value
            );
          }}
        />
      </Modal>

      <span
        style={{
          display: 'none'
        }}
        data-zoom-min={
          EDITOR_ZOOM_MIN
        }
        data-zoom-max={
          EDITOR_ZOOM_MAX
        }
      />
    </>
  );
}
