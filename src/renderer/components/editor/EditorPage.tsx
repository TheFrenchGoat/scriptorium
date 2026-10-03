// src/renderer/components/editor/EditorPage.tsx
// Assemblage de la page d'édition (ex-editor.html + editor.js). Ce composant
// se contente de brancher le contrôleur aux vues ; toute la logique métier vit
// dans useEditorController.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { Dropdown, DropdownItem } from '../common/Dropdown';
import { Modal } from '../common/Modal';
import { Sidebar } from './Sidebar';
import { TabsBar } from './TabsBar';
import { Ruler } from './Ruler';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { ChapterEditor } from './ChapterEditor';
import { WbSheet } from './WbSheet';
import { useEditorController, EDITOR_ZOOM_MAX, EDITOR_ZOOM_MIN } from './useEditorController';
import { HelpModal } from './modals/HelpModal';
import { ReplaceModal } from './modals/ReplaceModal';
import { GlobalSearchModal } from './modals/GlobalSearchModal';
import { StatsModal } from './modals/StatsModal';
import { BackupsModal } from './modals/BackupsModal';
import { SettingsModal } from './modals/SettingsModal';
import { GrammarSetupModal } from './modals/GrammarSetupModal';
import { CustomWbTypeModal } from './modals/CustomWbTypeModal';
import type { EditorPrefs, ThemeName, WbType } from '../../../shared/types';

// Raccourcis d'accents façon Word/LibreOffice (voir le gestionnaire de
// raccourcis clavier plus bas) : un premier appui (Ctrl+`, Ctrl+', etc.)
// arme un accent, la touche suivante (une voyelle) le compose.
type AccentMode = 'grave' | 'acute' | 'circumflex' | 'dieresis' | 'cedilla' | null;

const ACCENT_MAP: Record<Exclude<AccentMode, 'cedilla' | null>, Record<string, string>> = {
  grave: { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' },
  acute: { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' },
  circumflex: { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  dieresis: { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü' }
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

  const applyEditorPrefsToBody = useCallback((prefs: EditorPrefs) => {
    // La feuille d'écriture (#editor) a ses propres variables ; l'interface
    // (menus, sidebar, modales) a les siennes, appliquées globalement dans
    // App.tsx. Ici on ne pose que celles de la feuille d'écriture.
    document.body.style.setProperty('--editor-width', `${prefs.width}px`);
    document.body.style.setProperty('--editor-font', prefs.fontFamily || "'Roboto', sans-serif");
    document.body.style.setProperty('--editor-line-height', String(prefs.lineHeight ?? 1.6));
    document.body.style.setProperty('--ui-font-size', `${prefs.uiFontSize ?? 14}px`);
    document.body.style.setProperty('--ui-font-family', prefs.uiFontFamily ?? "'Roboto', sans-serif");
    // Marges et retrait de première ligne, réglables via la règle graduée
    // (voir Ruler.tsx) : appliqués ici aussi pour que la valeur persistée
    // soit immédiatement visible à l'ouverture, sans attendre un glisser.
    document.body.style.setProperty('--editor-margin-left', `${prefs.marginLeft ?? 80}px`);
    document.body.style.setProperty('--editor-margin-right', `${prefs.marginRight ?? 80}px`);
    document.body.style.setProperty('--editor-indent', `${prefs.firstLineIndent ?? 0}px`);
  }, []);

  const controller = useEditorController({
    projectName,
    showInfo,
    showConfirm,
    onApplyPrefs: applyEditorPrefsToBody
  });

  const [openModal, setOpenModal] = useState<ModalKey>(null);
  const [editingTypeSlug, setEditingTypeSlug] = useState<string | null>(null);
  const [pendingNewWbType, setPendingNewWbType] = useState<WbType | null>(null);
  const [renameProjectValue, setRenameProjectValue] = useState<string | null>(null);

  const closeModal = useCallback(() => setOpenModal(null), []);

  // --- Retour au menu : sauvegarde d'abord, comme l'ancien btnBack ---
  const handleBack = useCallback(() => {
    void controller.save().then(() => onBack());
  }, [controller, onBack]);

  // --- Renommage du projet depuis la page d'édition elle-même ---
  const confirmRenameProject = useCallback(async () => {
    if (renameProjectValue === null) return;
    const ok = await controller.renameProject(renameProjectValue);
    if (ok) {
      onRenamed(renameProjectValue.trim());
      setRenameProjectValue(null);
    }
  }, [controller, onRenamed, renameProjectValue]);

  // --- REDIMENSIONNEMENT DES PANNEAUX (façon Premiere Pro) ---
  // Sidebar entière (largeur) et sections Chapitres/World Building (hauteur
  // relative), ajustables par glisser-déposer. On travaille par ID DOM plutôt
  // que par refs React : ce sont des éléments purement visuels, jamais
  // reconstruits par un re-rendu React (Sidebar ne recrée pas ces nœuds),
  // donc les ID stables du HTML suffisent, comme dans l'original.
  useEffect(() => {
    const sidebar = document.getElementById('sidebar');
    const sidebarHandle = document.getElementById('sidebarResizeHandle');
    const sectionChapters = document.getElementById('sectionChapters');
    const sectionsHandle = document.getElementById('sidebarSectionsResizeHandle');
    if (!sidebar || !sidebarHandle || !sectionChapters || !sectionsHandle) return;

    const SIDEBAR_MIN = 160;
    const SIDEBAR_MAX = 500;
    const SECTION_MIN = 60;

    let resizingSidebar = false;
    let resizingSections = false;

    // Point unique d'activation/désactivation du mode "redimensionnement" :
    // pose/retire la classe CSS plutôt qu'un style inline, et est appelé
    // depuis plusieurs filets de sécurité pour qu'on ne reste JAMAIS bloqué en
    // "sélection de texte désactivée" si un mouseup est manqué (relâché hors
    // fenêtre par ex.).
    const endAnyResize = () => {
      resizingSidebar = false;
      resizingSections = false;
      sidebarHandle.classList.remove('dragging');
      sectionsHandle.classList.remove('dragging');
      document.body.classList.remove('resizing-panel');
    };

    const onSidebarMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      resizingSidebar = true;
      sidebarHandle.classList.add('dragging');
      document.body.classList.add('resizing-panel');
    };

    const onSectionsMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      resizingSections = true;
      sectionsHandle.classList.add('dragging');
      document.body.classList.add('resizing-panel');
      sectionChapters.style.flex = '0 0 auto';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingSidebar && !resizingSections) return;
      // Filet de sécurité : si le bouton gauche n'est plus enfoncé, un
      // mouseup a eu lieu sans être capté.
      if ((e.buttons & 1) === 0) {
        endAnyResize();
        return;
      }

      if (resizingSidebar) {
        const rect = sidebar.getBoundingClientRect();
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - rect.left));
        document.body.style.setProperty('--sidebar-width', `${newWidth}px`);
      }

      if (resizingSections) {
        const parent = sectionChapters.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const maxHeight = parentRect.height - SECTION_MIN - sectionsHandle.offsetHeight;
        const newHeight = Math.min(maxHeight, Math.max(SECTION_MIN, e.clientY - parentRect.top));
        sectionChapters.style.height = `${newHeight}px`;
      }
    };

    sidebarHandle.addEventListener('mousedown', onSidebarMouseDown);
    sectionsHandle.addEventListener('mousedown', onSectionsMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endAnyResize);
    window.addEventListener('blur', endAnyResize);
    document.addEventListener('mouseleave', endAnyResize);

    return () => {
      sidebarHandle.removeEventListener('mousedown', onSidebarMouseDown);
      sectionsHandle.removeEventListener('mousedown', onSectionsMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endAnyResize);
      window.removeEventListener('blur', endAnyResize);
      document.removeEventListener('mouseleave', endAnyResize);
    };
  }, [controller.ready]);

  // --- ZOOM DE LA FEUILLE D'ÉCRITURE (Ctrl + molette, comme dans Word) ---
  // IMPORTANT : on ne peut pas utiliser la prop React `onWheel` pour ça. React
  // attache ses gestionnaires wheel/touch en mode PASSIF par défaut (pour ne
  // jamais bloquer le défilement natif), ce qui rend e.preventDefault()
  // totalement inopérant sur un onWheel React. Résultat observé : Chromium
  // continue d'appliquer son propre zoom de PAGE au Ctrl+molette (comme dans
  // un navigateur classique), qui zoome TOUTE la fenêtre au lieu de la seule
  // feuille. On attache donc nous-mêmes un vrai listener DOM natif, avec
  // { passive: false }, seul moyen d'empêcher effectivement ce zoom natif.
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      controller.zoomBy(e.deltaY < 0 ? 1 : -1);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
    // BUG CORRIGÉ : cet effet ne dépendait auparavant que de `controller`
    // (référence stable, ne change jamais). Comme le composant retourne un
    // simple placeholder tant que `controller.ready` est faux (voir plus
    // bas), le <div ref={editorContainerRef}> réel n'existe pas encore lors
    // du tout premier passage de cet effet : `editorContainerRef.current`
    // valait alors `null`, et l'effet ne se relançait plus jamais une fois le
    // vrai contenu monté puisque sa seule dépendance n'avait pas changé. Le
    // Ctrl+molette ne faisait donc jamais rien. Ajouter `controller.ready`
    // aux dépendances force un nouvel essai d'attachement au bon moment.
  }, [controller, controller.ready]);

  // Raccourcis d'accents façon Word/LibreOffice : Ctrl+` puis une voyelle =
  // accent grave, Ctrl+' = aigu, Ctrl+Maj+^ = circonflexe, Ctrl+Maj+: =
  // tréma, Ctrl+, puis "c" = cédille. Un ref (pas un state) car il doit
  // survivre entre deux appuis de touche consécutifs sans provoquer de
  // re-rendu.
  const pendingAccentRef = useRef<AccentMode>(null);

  // --- RACCOURCIS CLAVIER GLOBAUX ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isEditorFocused = document.activeElement?.id === 'editor';
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // Si un raccourci d'accent vient d'être amorcé, cette frappe-ci est
      // celle qui doit le composer (ou, si elle ne correspond à rien,
      // reprendre son cours normal de frappe classique).
      if (isEditorFocused && pendingAccentRef.current) {
        const pending = pendingAccentRef.current;
        pendingAccentRef.current = null;
        if (!ctrlOrCmd && !e.altKey && e.key.length === 1) {
          const lower = e.key.toLowerCase();
          const composed = pending === 'cedilla' ? (lower === 'c' ? 'ç' : undefined) : ACCENT_MAP[pending]?.[lower];
          if (composed) {
            e.preventDefault();
            controller.insertText(e.key !== lower ? composed.toUpperCase() : composed);
            return;
          }
        }
        // Touche non gérée par cet accent : on laisse la frappe normale
        // suivre son cours (pas de preventDefault, pas de retour anticipé).
      }

      // Undo/Redo : uniquement quand le focus est dans l'éditeur de chapitre.
      // Ailleurs (champs des modales, fiches World Building...), on laisse le
      // navigateur gérer Ctrl+Z nativement pour ces champs.
      if (ctrlOrCmd && isEditorFocused) {
        if (!e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          controller.undo();
          return;
        }
        if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
          e.preventDefault();
          controller.redo();
          return;
        }
      }

      // Amorce d'un raccourci d'accent (voir plus haut) : seule la touche
      // SUIVANTE, sans Ctrl, compose réellement le caractère.
      if (isEditorFocused && ctrlOrCmd && !e.altKey) {
        if (!e.shiftKey && e.key === '`') {
          e.preventDefault();
          pendingAccentRef.current = 'grave';
          return;
        }
        if (!e.shiftKey && e.key === "'") {
          e.preventDefault();
          pendingAccentRef.current = 'acute';
          return;
        }
        if (e.shiftKey && e.key === '^') {
          e.preventDefault();
          pendingAccentRef.current = 'circumflex';
          return;
        }
        if (e.shiftKey && (e.key === ':' || e.key === ';')) {
          e.preventDefault();
          pendingAccentRef.current = 'dieresis';
          return;
        }
        if (!e.shiftKey && e.key === ',') {
          e.preventDefault();
          pendingAccentRef.current = 'cedilla';
          return;
        }
      }

      if (!ctrlOrCmd) return;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void controller.save();
      }
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        controller.format('bold');
      }
      if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        controller.format('italic');
      }
      if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        controller.format('underline');
      }

      // Alignement : uniquement dans l'éditeur de chapitre.
      if (isEditorFocused) {
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          controller.format('justifyLeft');
        }
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          controller.format('justifyCenter');
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          controller.format('justifyRight');
        }
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault();
          controller.format('justifyFull');
        }
      }

      // Ctrl+F : Rechercher/Remplacer (chapitre courant). Ctrl+Maj+F :
      // recherche globale (tout le projet).
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setOpenModal(e.shiftKey ? 'globalSearch' : 'replace');
      }

      // Navigation entre onglets.
      if (e.key === 'Tab' && controller.tabs().length > 1) {
        e.preventDefault();
        controller.cycleTab(e.shiftKey ? -1 : 1);
      }

      // Zoom de la page (complète le Ctrl+molette déjà existant).
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        controller.zoomBy(1);
      }
      if (e.key === '-') {
        e.preventDefault();
        controller.zoomBy(-1);
      }
      if (e.key === '0') {
        e.preventDefault();
        controller.setZoom(1);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [controller]);

  const activeTab = controller.activeTab();
  const activeType = controller.activeType();
  const data = controller.data();
  const zoom = controller.zoom();

  const chapterHtmlRef = useRef<string>('');
  if (activeType === 'chapter' && activeTab) {
    chapterHtmlRef.current = data.chapters[activeTab] ?? '';
  }

  const exportActions: {
    key: 'txt' | 'md' | 'pdf' | 'docx' | 'project';
    labelKey: 'exportTxtItem' | 'exportMdItem' | 'exportPdfItem' | 'exportDocxItem' | 'exportProjectItem';
  }[] = [
    { key: 'txt', labelKey: 'exportTxtItem' },
    { key: 'md', labelKey: 'exportMdItem' },
    { key: 'pdf', labelKey: 'exportPdfItem' },
    { key: 'docx', labelKey: 'exportDocxItem' },
    { key: 'project', labelKey: 'exportProjectItem' }
  ];

  if (!controller.ready) return <div className="editor-page" />;

  return (
    <>
      <header className="editor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button id="btnBack" title={t('backToProjects')} onClick={handleBack}>
            ←
          </button>
          <h2 id="projectTitle">{projectName}</h2>
          <button
            title={t('renameProjectModalTitle')}
            onClick={() => setRenameProjectValue(projectName)}
            style={{ padding: '4px 8px', fontSize: 13 }}
          >
            ✏️
          </button>
        </div>

        <div className="header-actions">
          <Dropdown label={<>{t('exportMenuBtn')}</>} buttonId="btnExportMenu" containerStyle={{ position: 'relative' }}>
            {(close) => (
              <>
                {exportActions.map((action) => (
                  <DropdownItem
                    key={action.key}
                    onSelect={() => {
                      close();
                      void controller.exportAs(action.key);
                    }}
                  >
                    {t(action.labelKey)}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
          <button id="btnBackups" title={t('backupsBtnTitle')} onClick={() => setOpenModal('backups')}>
            {t('backupsBtn')}
          </button>
          <button id="btnStats" onClick={() => setOpenModal('stats')}>
            {t('statsMenuBtn')}
          </button>
          <button id="btnHelp" title={t('helpMenuBtnTitle')} onClick={() => setOpenModal('help')}>
            {t('helpMenuBtn')}
          </button>
          <button id="btnSettingsToggle" onClick={() => setOpenModal('settings')}>
            {t('settingsToggle')}
          </button>
        </div>
      </header>

      <Toolbar
        controller={controller}
        onOpenGlobalSearch={() => setOpenModal('globalSearch')}
        onOpenReplace={() => setOpenModal('replace')}
      />

      <div className="workspace">
        <Sidebar
          controller={controller}
          onOpenCustomTypeModal={(slug) => {
            setEditingTypeSlug(slug);
            setOpenModal('customWbType');
          }}
          pendingNewWbType={pendingNewWbType}
          onConsumePendingNewWbType={() => setPendingNewWbType(null)}
        />

        <div className="resize-handle-v" id="sidebarResizeHandle" />

        <main className="editor-area">
          <TabsBar controller={controller} />

          {activeTab && activeType === 'chapter' && <Ruler controller={controller} />}

          <div className="editor-scroll-container" id="editorContainer" ref={editorContainerRef}>
            {activeTab && activeType === 'chapter' && (
              <ChapterEditor
                key={activeTab}
                controller={controller}
                chapterName={activeTab}
                initialHtml={chapterHtmlRef.current}
                placeholder={t('editorPlaceholder')}
                nativeSpellcheck={controller.nativeSpellcheckEnabled()}
                zoom={zoom}
              />
            )}
            {activeTab && activeType === 'world' && <WbSheet controller={controller} name={activeTab} />}
          </div>

          <StatusBar controller={controller} onOpenGrammarSetup={() => setOpenModal('grammarSetup')} />
        </main>
      </div>

      <HelpModal open={openModal === 'help'} onClose={closeModal} />
      <ReplaceModal open={openModal === 'replace'} controller={controller} onClose={closeModal} />
      <GlobalSearchModal open={openModal === 'globalSearch'} controller={controller} onClose={closeModal} />
      <StatsModal open={openModal === 'stats'} controller={controller} onClose={closeModal} />
      <BackupsModal open={openModal === 'backups'} controller={controller} onClose={closeModal} />
      <SettingsModal
        open={openModal === 'settings'}
        controller={controller}
        theme={theme}
        onChangeTheme={onChangeTheme}
        onOpenGrammarSetup={() => setOpenModal('grammarSetup')}
        onClose={closeModal}
      />
      <GrammarSetupModal open={openModal === 'grammarSetup'} controller={controller} onClose={closeModal} />
      <CustomWbTypeModal
        open={openModal === 'customWbType'}
        controller={controller}
        editingSlug={editingTypeSlug}
        onClose={closeModal}
        onCreated={(slug) => setPendingNewWbType(slug)}
      />

      <Modal
        open={renameProjectValue !== null}
        title={t('renameProjectModalTitle')}
        onCancel={() => setRenameProjectValue(null)}
        onPrimary={() => void confirmRenameProject()}
        footer={
          <>
            <button onClick={() => setRenameProjectValue(null)}>{t('cancel')}</button>
            <button onClick={() => void confirmRenameProject()}>{t('rename')}</button>
          </>
        }
      >
        <input
          type="text"
          autoFocus
          placeholder={t('newNamePlaceholder')}
          value={renameProjectValue ?? ''}
          onChange={(e) => setRenameProjectValue(e.target.value)}
        />
      </Modal>

      {/* Bornes de zoom documentées ici ; appliquées dans le contrôleur via
          setZoom/zoomBy. */}
      <span style={{ display: 'none' }} data-zoom-min={EDITOR_ZOOM_MIN} data-zoom-max={EDITOR_ZOOM_MAX} />
    </>
  );
}
