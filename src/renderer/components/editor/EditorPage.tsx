// src/renderer/components/editor/EditorPage.tsx
//
// Assemblage principal de la page d'édition.
//
// Cette page prend en charge :
// - les projets roman avec ChapterEditor ;
// - les projets scénario avec ScreenplayEditor ;
// - les fiches World Building communes aux deux modes ;
// - les raccourcis clavier ;
// - le zoom de la feuille ;
// - le redimensionnement de la barre latérale ;
// - le menu de propositions du correcteur grammatical.
//
// Le panneau des fiches est intégré à la section World Building de la barre
// latérale (voir Sidebar.tsx et WbSidePanel.tsx).
//
// L'atelier (WbWorkspace.tsx) s'affiche par-dessus la zone d'écriture. Il
// réunit trois onglets : la vue en cartes des fiches (WbCardsView.tsx), la
// vue des relations (WbRelationsView.tsx : graphe des liens et arbre
// généalogique) et la frise chronologique (WbTimelineView.tsx). Il s'ouvre
// avec le bouton « 🧭 Atelier » de la barre latérale et se ferme tout seul
// dès qu'un autre onglet d'écriture devient actif.
//
// L'aperçu d'une fiche au survol d'un nom surligné (WbHoverPreview.tsx)
// s'affiche par-dessus toute la fenêtre ; il ne modifie pas le texte.

import { applyWbLinksPref } from '../../lib/wb-links';
import {
  applySidebarWidth,
  restoreSidebarWidth,
  saveSidebarWidth,
  setSidebarWidthPersister
} from './sidebarWidth';
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
import { ExportModal } from './modals/ExportModal';

import { Sidebar } from './Sidebar';
import { TabsBar } from './TabsBar';
import { Ruler } from './Ruler';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { CommentBubble } from './CommentBubble';
import { CommentHighlights, NotesPanel, readNotesPanelOpen, saveNotesPanelOpen } from './NotesPanel';
import { captureCommentSelection, isCommentId, type CommentCapture } from '../../lib/comments';
import { ChapterEditor } from './ChapterEditor';
import { ScreenplayEditor } from './ScreenplayEditor';
import { WbSheet } from './WbSheet';
import { WbCardsView } from './WbCardsView';
import { WbRelationsView } from './WbRelationsView';
import { WbTimelineView } from './WbTimelineView';
import { WbWorkspace } from './WbWorkspace';
import { WbHoverPreview } from './WbHoverPreview';

import { GrammarPopup } from './GrammarPopup';

import {
  useEditorController,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN
} from './useEditorController';

import { ReplaceModal } from './modals/ReplaceModal';
import { GlobalSearchModal } from './modals/GlobalSearchModal';
import { MemoTimer } from './Timer';
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
  | 'replace'
  | 'globalSearch'
  | 'stats'
  | 'settings'
  | 'grammarSetup'
  | 'customWbType'
  | null;

/**
 * Indique si le focus se trouve dans une zone d'écriture.
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

  const screenplaySelector = [
    '.screenplay-element-content',
    '.screenplay-scene-heading'
  ].join(', ');

  const screenplay = Boolean(
    activeElement?.matches(
      screenplaySelector
    ) ||
      activeElement?.closest(
        screenplaySelector
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

        // Liens de la bible dans le texte (Paramètres > Écriture).
        applyWbLinksPref(prefs.wbLinksInText !== false);

        // Mode concentration : estomper les autres paragraphes (Paramètres > Écriture).
        document.documentElement.setAttribute('data-focus-dim', prefs.focusDimParagraphs === true ? 'on' : 'off');
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

  const [exportModalOpen, setExportModalOpen] = useState(false);

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

  // Fenêtre « Session et statistiques », ouverte par le bouton Session.
  const setStatsOpen =
    useCallback((statsOpen: boolean): void => {
      setOpenModal(statsOpen ? 'stats' : null);
    }, []);

  // Emplacement du bouton Session dans la barre d'outils (rempli par Toolbar).
  const [sessionSlot, setSessionSlot] =
    useState<HTMLElement | null>(null);

  const handleBack =
    useCallback((): void => {
      void controller
        .save()
        .then(() => {
          onBack();
        });
    }, [controller, onBack]);

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
      [controller, onRenamed, renameProjectValue]
    );

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

    // Largeur du panneau gauche : préférences du logiciel (fichier sur le
    // disque), sinon stockage local de la fenêtre.
    if (!applySidebarWidth(controller.prefs().sidebarWidth)) {
      restoreSidebarWidth();
    }

    setSidebarWidthPersister((width) => {
      const currentPrefs = controller.prefs();

      if (currentPrefs.sidebarWidth === width) {
        return;
      }

      controller.updatePrefs({ ...currentPrefs, sidebarWidth: width });
    });

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
          'resizing-panel',
          'resizing-row'
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
        'resizing-panel',
        'resizing-row'
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

        saveSidebarWidth(newWidth);
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
  }, [controller, controller.ready]);

  // -----------------------------------------------------------------------
  // MODE CONCENTRATION
  // -----------------------------------------------------------------------
  const [focusMode, setFocusMode] = useState(false);

  // Panneau Notes (romans) : reste ouvert ou ferme comme l'auteur l'a laisse.
  const [notesOpen, setNotesOpen] = useState<boolean>(() => readNotesPanelOpen());
  useEffect(() => {
    saveNotesPanelOpen(notesOpen);
  }, [notesOpen]);

  // Commentaires : Ctrl+Alt+M commente la selection du chapitre (le panneau s'ouvre).
  const [commentRequest, setCommentRequest] = useState<CommentCapture | null>(null);

  // Commentaire mis en evidence dans le panneau (clic sur son passage, bulle).
  const [commentFocus, setCommentFocus] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!notesOpen) {
      setCommentFocus(null);
      return undefined;
    }
    const onPassageClick = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const span = target ? target.closest<HTMLElement>('#editor [data-comment-id]') : null;
      const id = span ? span.getAttribute('data-comment-id') : null;
      if (!id || !isCommentId(id)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      setCommentFocus((previous) => ({ id, n: (previous ? previous.n : 0) + 1 }));
    };
    window.addEventListener('click', onPassageClick);
    return () => {
      window.removeEventListener('click', onPassageClick);
    };
  }, [notesOpen]);

  useEffect(() => {
    const onCommentKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      // Ctrl+Alt+M, ou Ctrl+Maj+M si un autre logiciel capte Ctrl+Alt+M.
      if (event.altKey === event.shiftKey) return;
      if (!(event.key.toLowerCase() === 'm' || (event.key.length !== 1 && event.code === 'KeyM'))) return;
      if (document.documentElement.classList.contains('focus-mode')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.notes-panel')) return;
      if (!document.getElementById('editor')) return;
      event.preventDefault();
      event.stopPropagation();
      setCommentRequest(captureCommentSelection());
      setNotesOpen(true);
    };
    window.addEventListener('keydown', onCommentKey, true);
    // Clic droit "Ajouter un commentaire" (menu natif) : meme chemin que le raccourci.
    const offMenu = window.api.onAddCommentRequest(() => {
      if (document.documentElement.classList.contains('focus-mode')) return;
      if (!document.getElementById('editor')) return;
      setCommentRequest(captureCommentSelection());
      setNotesOpen(true);
    });
    return () => {
      window.removeEventListener('keydown', onCommentKey, true);
      offMenu();
    };
  }, []);

  useEffect(() => {
    const rootEl = document.documentElement;
    if (focusMode) {
      rootEl.classList.add('focus-mode');
    } else {
      rootEl.classList.remove('focus-mode');
    }
    window.api.setFullScreen(focusMode).catch(() => undefined);
  }, [focusMode]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('focus-mode');
      window.api.setFullScreen(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    // F11 : entrer / sortir. Échap : sortir, sauf si une modale ou le panneau Session est ouvert.
    // Phase de capture : ce gestionnaire passe en premier (avant la fermeture des modales).
    const onFocusKey = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault();
        if (!event.repeat) setFocusMode((value) => !value);
        return;
      }
      if (event.key !== 'Escape' || !focusMode) return;
      if (document.querySelector('.modal, .session-pop')) return;
      setFocusMode(false);
    };
    window.addEventListener('keydown', onFocusKey, true);
    return () => window.removeEventListener('keydown', onFocusKey, true);
  }, [focusMode]);

  useEffect(() => {
    // Option estomper les autres paragraphes : surlignage CSS (API Highlight),
    // comme la sélection. Rien n'est ajouté dans le texte, le chapitre n'est jamais modifié.
    // Un paragraphe = le texte entre deux retours (ou deux blocs). Curseur hors de la page : rien n'est estompé.
    if (!focusMode) return undefined;
    const registry = (CSS as unknown as { highlights?: { set(name: string, value: unknown): void; delete(name: string): void } }).highlights;
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!registry || !HighlightCtor) return undefined;
    const NAME = 'focus-dim';
    // Couleur pâle calculée à partir de la couleur réelle du texte (thème clair ou sombre).
    const colorEl = document.createElement('style');
    colorEl.id = 'focus-dim-color';
    document.head.appendChild(colorEl);
    let lastColor = '';
    const applyColor = (editorEl: HTMLElement) => {
      const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(getComputedStyle(editorEl).color);
      const color = match ? 'rgba(' + match[1] + ', ' + match[2] + ', ' + match[3] + ', 0.3)' : 'rgba(128, 128, 128, 0.5)';
      if (color === lastColor) return;
      lastColor = color;
      colorEl.textContent = 'html.focus-mode[data-focus-dim="on"] #editor::highlight(focus-dim), html.focus-mode[data-focus-dim="on"] #editor *::highlight(focus-dim) { color: ' + color + '; }';
    };
    const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE']);
    type Point = { node: Node; offset: number };
    type Break = { end: Point; start: Point };
    const before = (target: Node): Point => {
      const parent = target.parentNode as Node;
      return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, target) };
    };
    const after = (target: Node): Point => {
      const point = before(target);
      return { node: point.node, offset: point.offset + 1 };
    };
    const collect = (parent: Node, out: Break[]): void => {
      for (let k = 0; k < parent.childNodes.length; k++) {
        const child = parent.childNodes[k];
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent || '';
          for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
            out.push({ end: { node: child, offset: i }, start: { node: child, offset: i + 1 } });
          }
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = (child as Element).tagName;
        if (tag === 'BR') {
          out.push({ end: before(child), start: after(child) });
          continue;
        }
        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock) out.push({ end: before(child), start: { node: child, offset: 0 } });
        collect(child, out);
        if (isBlock) out.push({ end: { node: child, offset: child.childNodes.length }, start: after(child) });
      }
    };
    let active = false;
    const clear = () => {
      if (!active) return;
      registry.delete(NAME);
      active = false;
    };
    const update = () => {
      const editorEl = document.getElementById('editor');
      const selection = document.getSelection();
      if (document.documentElement.getAttribute('data-focus-dim') !== 'on' || !editorEl || !selection || selection.rangeCount === 0) {
        clear();
        return;
      }
      const current = selection.getRangeAt(0);
      if (!editorEl.contains(current.startContainer)) {
        clear();
        return;
      }
      const caret = document.createRange();
      caret.setStart(current.startContainer, current.startOffset);
      caret.collapse(true);
      const breaks: Break[] = [];
      collect(editorEl, breaks);
      let paraStart: Point = { node: editorEl, offset: 0 };
      let paraEnd: Point = { node: editorEl, offset: editorEl.childNodes.length };
      for (let b = 0; b < breaks.length; b++) {
        const item = breaks[b];
        if (caret.comparePoint(item.start.node, item.start.offset) <= 0) {
          paraStart = item.start;
          continue;
        }
        paraEnd = item.end;
        break;
      }
      const ranges: Range[] = [];
      const head = document.createRange();
      head.setStart(editorEl, 0);
      head.setEnd(paraStart.node, paraStart.offset);
      if (!head.collapsed) ranges.push(head);
      const tail = document.createRange();
      tail.setStart(paraEnd.node, paraEnd.offset);
      tail.setEnd(editorEl, editorEl.childNodes.length);
      if (!tail.collapsed) ranges.push(tail);
      if (ranges.length === 0) {
        clear();
        return;
      }
      applyColor(editorEl);
      registry.set(NAME, new HighlightCtor(...ranges));
      active = true;
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          update();
        } catch {
          clear();
        }
      });
    };
    schedule();
    const eventNames = ['selectionchange', 'input', 'keyup', 'mouseup', 'focusin'];
    eventNames.forEach((name) => document.addEventListener(name, schedule, true));
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-focus-dim'] });
    return () => {
      eventNames.forEach((name) => document.removeEventListener(name, schedule, true));
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      registry.delete(NAME);
      colorEl.remove();
    };
  }, [focusMode]);

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
              : ACCENT_MAP[pending][lower];

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
       * Annuler / rétablir dans les zones d'écriture uniquement.
       */
      // Dans le scénario, Ctrl+Z et Ctrl+Y sont laissés au navigateur :
      // l'historique des chapitres ne connaît pas les scènes.
      const focusInScreenplay =
        document.activeElement?.closest(
          '.screenplay-editor'
        ) != null;

      if (
        ctrlOrCmd &&
        focusState.anyEditor &&
        !focusInScreenplay
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
       * l'alignement des paragraphes sont toujours déterminés par leur type.
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
       * Dans un scénario, l'alignement dépend du type explicite du
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
       * Ctrl+Tab change d'onglet.
       *
       * Tab seul reste disponible dans l'éditeur scénario pour changer le
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

  /**
   * Document affiché (type et identifiant). L'atelier se ferme quand il
   * change, pour que l'onglet ouvert ne reste pas caché derrière lui.
   */
  const activeDocKey =
    activeTab
      ? String(activeType) +
        ':' +
        activeTab
      : null;

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
      data.chapters[activeTab] ?? '';
  }

  const exportActions: {
    key:
      | 'txt'
      | 'md'
      | 'pdf'
      | 'docx'
      | 'odt'
      | 'fountain'
      | 'project';

    labelKey:
      | 'exportTxtItem'
      | 'exportMdItem'
      | 'exportPdfItem'
      | 'exportDocxItem'
      | 'exportOdtItem'
      | 'exportFountainItem'
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
      key: 'odt',
      labelKey:
        'exportOdtItem'
    },
    {
      key: 'fountain',
      labelKey:
        'exportFountainItem'
    },
    {
      key: 'project',
      labelKey:
        'exportProjectItem'
    }];

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

          <h2
            id="projectTitle"
            title={t('renameProjectHint')}
            onDoubleClick={() => {
              setRenameProjectValue(projectName);
            }}
          >
            {projectName}
          </h2>
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
                {!controller.isScreenplayProject() && (
                  <DropdownItem
                    onSelect={() => {
                      close();
                      setExportModalOpen(true);
                    }}
                  >
                    {t('exportDocumentItem')}
                  </DropdownItem>
                )}
                {exportActions
                  .filter(
                    (action) =>
                      controller.isScreenplayProject() ||
                      action.key === 'project'
                  )
                  .map(
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

          <MemoTimer
            controller={controller}
            statsOpen={openModal === 'stats'}
            onStatsOpenChange={setStatsOpen}
            sessionSlot={sessionSlot}
          />

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
        sessionSlotRef={setSessionSlot}
        focusMode={focusMode}
        onToggleFocusMode={() => { setFocusMode((value) => !value); }}
        notesOpen={notesOpen}
        notesHasContent={Boolean(activeTab && activeType === 'chapter' && (controller.getChapterNote(activeTab).trim() || controller.getChapterComments(activeTab).some((comment) => !comment.resolved)))}
        onToggleNotes={controller.isScreenplayProject() ? undefined : () => { setNotesOpen((value) => !value); }}
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

        {/*
          position: relative : l'atelier (WbWorkspace : cartes, relations, frise)
          recouvre uniquement cette zone, pas la barre latérale.
        */}
        <main
          className="editor-area"
          style={{
            position: 'relative'
          }}
        >
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
                  projectData={controller.data()}
                  wbRegistry={controller.registry}
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

          {/* Atelier : cartes et relations en onglets (par-dessus la zone d'écriture) */}
          <WbWorkspace
            views={{
              cards: (
                <WbCardsView
                  controller={controller}
                />
              ),
              relations: (
                <WbRelationsView
                  controller={controller}
                />
              ),
              timeline: (
                <WbTimelineView
                  controller={controller}
                />
              )
            }}
            activeDocKey={
              activeDocKey
            }
          />
        </main>

        <CommentHighlights
          ids={activeTab && activeType === 'chapter' ? controller.getChapterComments(activeTab).filter((comment) => !comment.resolved).map((comment) => comment.id) : []}
        />
        {activeTab && activeType === 'chapter' && !controller.isScreenplayProject() && (
          <CommentBubble
            comments={controller.getChapterComments(activeTab)}
            onShowInPanel={(id) => {
              setNotesOpen(true);
              setCommentFocus((previous) => ({ id, n: (previous ? previous.n : 0) + 1 }));
            }}
          />
        )}
        {notesOpen && !controller.isScreenplayProject() && (
          <NotesPanel
            controller={controller}
            chapterName={activeTab && activeType === 'chapter' ? activeTab : null}
            onClose={() => { setNotesOpen(false); }}
            request={commentRequest}
            onRequestHandled={() => { setCommentRequest(null); }}
            focusRequest={commentFocus}
          />
        )}
      </div>

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

      <GrammarPopup
        controller={controller}
      />

      {/* Aperçu d'une fiche au survol d'un nom surligné */}
      <WbHoverPreview
        controller={controller}
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

      {exportModalOpen && (
        <ExportModal
          projectName={projectName}
          chapterNames={controller.exportChapterNames()}
          bibleCategories={controller.exportBibleCategories()}
          initialSettings={controller.getExportSettings()}
          buildPreview={(settings) => controller.buildExportPreview(settings)}
          onCancel={() => {
            setExportModalOpen(false);
          }}
          onExport={(settings) => {
            setExportModalOpen(false);

            void (async () => {
              try {
                await controller.saveExportSettings(settings);
              } catch (error) {
                console.error('Enregistrement des reglages d export impossible :', error);
              }

              await controller.exportAs(settings.format);
            })();
          }}
        />
      )}

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
