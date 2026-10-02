// src/renderer/components/editor/EditorPage.tsx
// Assemblage de la page d'édition (ex-editor.html + editor.js). Ce composant
// se contente de brancher le contrôleur aux vues ; toute la logique métier vit
// dans useEditorController.

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

// Raccourcis d'accents façon Word/LibreOffice : un premier appui
// (Ctrl+`, Ctrl+', etc.) arme un accent, puis la touche suivante le compose.
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
  onChangeTheme: (theme: ThemeName) => void;
  onBack: () => void;
  onRenamed: (newName: string) => void;
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

export function EditorPage({
  projectName,
  theme,
  onChangeTheme,
  onBack,
  onRenamed
}: EditorPageProps): React.ReactElement {
  const { t } = useI18n();
  const { showInfo, showConfirm } = useDialogs();

  const applyEditorPrefsToBody = useCallback(
    (prefs: EditorPrefs) => {
      // La feuille d'écriture (#editor) possède ses propres variables.
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
        String(prefs.lineHeight ?? 1.6)
      );

      document.body.style.setProperty(
        '--ui-font-size',
        `${prefs.uiFontSize ?? 14}px`
      );

      document.body.style.setProperty(
        '--ui-font-family',
        prefs.uiFontFamily ??
          "'Roboto', sans-serif"
      );

      document.body.style.setProperty(
        '--editor-margin-left',
        `${prefs.marginLeft ?? 80}px`
      );

      document.body.style.setProperty(
        '--editor-margin-right',
        `${prefs.marginRight ?? 80}px`
      );

      document.body.style.setProperty(
        '--editor-indent',
        `${prefs.firstLineIndent ?? 0}px`
      );
    },
    []
  );

  const controller = useEditorController({
    projectName,
    showInfo,
    showConfirm,
    onApplyPrefs: applyEditorPrefsToBody
  });

  const [openModal, setOpenModal] =
    useState<ModalKey>(null);

  const [
    editingTypeSlug,
    setEditingTypeSlug
  ] = useState<string | null>(null);

  const [
    pendingNewWbType,
    setPendingNewWbType
  ] = useState<WbType | null>(null);

  const [
    renameProjectValue,
    setRenameProjectValue
  ] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setOpenModal(null);
  }, []);

  // Retour au menu : sauvegarde du projet avant de quitter l'éditeur.
  const handleBack = useCallback(() => {
    void controller
      .save()
      .then(() => onBack());
  }, [controller, onBack]);

  // Renommage du projet depuis la page d'édition.
  const confirmRenameProject =
    useCallback(async () => {
      if (renameProjectValue === null) {
        return;
      }

      const newName =
        renameProjectValue.trim();

      const ok =
        await controller.renameProject(
          newName
        );

      if (ok) {
        onRenamed(newName);
        setRenameProjectValue(null);
      }
    }, [
      controller,
      onRenamed,
      renameProjectValue
    ]);

  // -------------------------------------------------------------------------
  // REDIMENSIONNEMENT DES PANNEAUX
  // -------------------------------------------------------------------------
  //
  // La sidebar entière peut être redimensionnée horizontalement.
  //
  // Les sections Chapitres et World Building peuvent être redimensionnées
  // verticalement uniquement lorsqu'elles sont toutes les deux ouvertes.
  // Quand une section est repliée, Sidebar.tsx ajoute la classe `collapsed`
  // à la section et la classe `disabled` à la poignée horizontale.
  useEffect(() => {
    const sidebar =
      document.getElementById('sidebar');

    const sidebarHandle =
      document.getElementById(
        'sidebarResizeHandle'
      );

    const sectionChapters =
      document.getElementById(
        'sectionChapters'
      );

    const sectionWorld =
      document.getElementById(
        'sectionWorld'
      );

    const sectionsHandle =
      document.getElementById(
        'sidebarSectionsResizeHandle'
      );

    if (
      !sidebar ||
      !sidebarHandle ||
      !sectionChapters ||
      !sectionWorld ||
      !sectionsHandle
    ) {
      return;
    }

    const SIDEBAR_MIN = 160;
    const SIDEBAR_MAX = 500;
    const SECTION_MIN = 60;

    let resizingSidebar = false;
    let resizingSections = false;

    /**
     * Vérifie si la séparation verticale entre les deux sections peut être
     * déplacée. Le redimensionnement est désactivé dès qu'une section est
     * repliée.
     */
    const canResizeSections = (): boolean =>
      !sectionsHandle.classList.contains(
        'disabled'
      ) &&
      !sectionChapters.classList.contains(
        'collapsed'
      ) &&
      !sectionWorld.classList.contains(
        'collapsed'
      );

    /**
     * Termine tous les redimensionnements en cours.
     *
     * Cette fonction est également appelée si la souris quitte la fenêtre ou
     * si la fenêtre perd le focus, afin de ne jamais laisser l'interface dans
     * un état bloqué.
     */
    const endAnyResize = (): void => {
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
        !canResizeSections()
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

      // On retire temporairement la répartition automatique de Flexbox pour
      // appliquer une hauteur précise à la section Chapitres.
      sectionChapters.style.flex =
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

      // Si le bouton gauche n'est plus enfoncé, le mouseup s'est probablement
      // produit hors de la fenêtre.
      if ((event.buttons & 1) === 0) {
        endAnyResize();
        return;
      }

      if (resizingSidebar) {
        const rect =
          sidebar.getBoundingClientRect();

        const requestedWidth =
          event.clientX - rect.left;

        const newWidth = Math.min(
          SIDEBAR_MAX,
          Math.max(
            SIDEBAR_MIN,
            requestedWidth
          )
        );

        document.body.style.setProperty(
          '--sidebar-width',
          `${newWidth}px`
        );
      }

      if (resizingSections) {
        // Une section peut avoir été repliée pendant le déplacement.
        if (!canResizeSections()) {
          endAnyResize();
          return;
        }

        const parent =
          sectionChapters.parentElement;

        if (!parent) {
          endAnyResize();
          return;
        }

        const parentRect =
          parent.getBoundingClientRect();

        const availableHeight =
          parentRect.height -
          sectionsHandle.offsetHeight;

        const maxHeight = Math.max(
          SECTION_MIN,
          availableHeight - SECTION_MIN
        );

        const requestedHeight =
          event.clientY - parentRect.top;

        const newHeight = Math.min(
          maxHeight,
          Math.max(
            SECTION_MIN,
            requestedHeight
          )
        );

        sectionChapters.style.height =
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

      endAnyResize();
    };
  }, [controller.ready]);

  // -------------------------------------------------------------------------
  // ZOOM DE LA FEUILLE D'ÉCRITURE
  // -------------------------------------------------------------------------

  const editorContainerRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
        event.deltaY < 0 ? 1 : -1
      );
    };

    container.addEventListener(
      'wheel',
      onWheel,
      { passive: false }
    );

    return () => {
      container.removeEventListener(
        'wheel',
        onWheel
      );
    };
  }, [controller, controller.ready]);

  // Raccourcis d'accents façon Word/LibreOffice.
  const pendingAccentRef =
    useRef<AccentMode>(null);

  // -------------------------------------------------------------------------
  // RACCOURCIS CLAVIER GLOBAUX
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent
    ): void => {
      const isEditorFocused =
        document.activeElement?.id ===
        'editor';

      const ctrlOrCmd =
        event.ctrlKey ||
        event.metaKey;

      // Composition de l'accent précédemment amorcé.
      if (
        isEditorFocused &&
        pendingAccentRef.current
      ) {
        const pending =
          pendingAccentRef.current;

        pendingAccentRef.current = null;

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
              : ACCENT_MAP[pending]?.[
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

      // Annuler/rétablir uniquement dans l'éditeur de chapitre.
      if (
        ctrlOrCmd &&
        isEditorFocused
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
          (event.shiftKey &&
            event.key.toLowerCase() ===
              'z')
        ) {
          event.preventDefault();
          controller.redo();
          return;
        }
      }

      // Amorce d'un raccourci d'accent.
      if (
        isEditorFocused &&
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
          (event.key === ':' ||
            event.key === ';')
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
      }

      if (key === 'b') {
        event.preventDefault();
        controller.format('bold');
      }

      if (key === 'i') {
        event.preventDefault();
        controller.format('italic');
      }

      if (key === 'u') {
        event.preventDefault();
        controller.format('underline');
      }

      // Alignement uniquement dans l'éditeur de chapitre.
      if (isEditorFocused) {
        if (key === 'l') {
          event.preventDefault();
          controller.format(
            'justifyLeft'
          );
        }

        if (key === 'e') {
          event.preventDefault();
          controller.format(
            'justifyCenter'
          );
        }

        if (key === 'r') {
          event.preventDefault();
          controller.format(
            'justifyRight'
          );
        }

        if (key === 'j') {
          event.preventDefault();
          controller.format(
            'justifyFull'
          );
        }
      }

      // Ctrl+F : rechercher/remplacer.
      // Ctrl+Maj+F : recherche globale.
      if (key === 'f') {
        event.preventDefault();

        setOpenModal(
          event.shiftKey
            ? 'globalSearch'
            : 'replace'
        );
      }

      // Navigation entre les onglets.
      if (
        event.key === 'Tab' &&
        controller.tabs().length > 1
      ) {
        event.preventDefault();

        controller.cycleTab(
          event.shiftKey ? -1 : 1
        );
      }

      // Zoom de la feuille d'écriture.
      if (
        event.key === '=' ||
        event.key === '+'
      ) {
        event.preventDefault();
        controller.zoomBy(1);
      }

      if (event.key === '-') {
        event.preventDefault();
        controller.zoomBy(-1);
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

  const data = controller.data();
  const zoom = controller.zoom();

  const chapterHtmlRef =
    useRef<string>('');

  if (
    activeType === 'chapter' &&
    activeTab
  ) {
    chapterHtmlRef.current =
      data.chapters[activeTab] ?? '';
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
      labelKey: 'exportTxtItem'
    },
    {
      key: 'md',
      labelKey: 'exportMdItem'
    },
    {
      key: 'pdf',
      labelKey: 'exportPdfItem'
    },
    {
      key: 'docx',
      labelKey: 'exportDocxItem'
    },
    {
      key: 'project',
      labelKey: 'exportProjectItem'
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
            title={t('backToProjects')}
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
                {t('exportMenuBtn')}
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
                      key={action.key}
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
              setOpenModal('backups');
            }}
          >
            {t('backupsBtn')}
          </button>

          <button
            id="btnStats"
            type="button"
            onClick={() => {
              setOpenModal('stats');
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
              setOpenModal('help');
            }}
          >
            {t('helpMenuBtn')}
          </button>

          <button
            id="btnSettingsToggle"
            type="button"
            onClick={() => {
              setOpenModal('settings');
            }}
          >
            {t('settingsToggle')}
          </button>
        </div>
      </header>

      <Toolbar
        controller={controller}
        onOpenGlobalSearch={() => {
          setOpenModal('globalSearch');
        }}
        onOpenReplace={() => {
          setOpenModal('replace');
        }}
      />

      <div className="workspace">
        <Sidebar
          controller={controller}
          onOpenCustomTypeModal={(
            slug
          ) => {
            setEditingTypeSlug(slug);
            setOpenModal(
              'customWbType'
            );
          }}
          pendingNewWbType={
            pendingNewWbType
          }
          onConsumePendingNewWbType={() => {
            setPendingNewWbType(null);
          }}
        />

        <div
          className="resize-handle-v"
          id="sidebarResizeHandle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner la barre latérale"
        />

        <main className="editor-area">
          <TabsBar
            controller={controller}
          />

          {activeTab &&
            activeType === 'chapter' && (
              <Ruler
                controller={controller}
              />
            )}

          <div
            className="editor-scroll-container"
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
        open={openModal === 'help'}
        onClose={closeModal}
      />

      <ReplaceModal
        open={openModal === 'replace'}
        controller={controller}
        onClose={closeModal}
      />

      <GlobalSearchModal
        open={
          openModal === 'globalSearch'
        }
        controller={controller}
        onClose={closeModal}
      />

      <StatsModal
        open={openModal === 'stats'}
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
        onChangeTheme={onChangeTheme}
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
          setPendingNewWbType(slug);
        }}
      />

      <Modal
        open={
          renameProjectValue !== null
        }
        title={t(
          'renameProjectModalTitle'
        )}
        onCancel={() => {
          setRenameProjectValue(null);
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
            renameProjectValue ?? ''
          }
          onChange={(event) => {
            setRenameProjectValue(
              event.target.value
            );
          }}
        />
      </Modal>

      {/* Bornes de zoom utilisées et documentées par le contrôleur. */}
      <span
        style={{ display: 'none' }}
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
