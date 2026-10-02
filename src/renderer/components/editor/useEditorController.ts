// src/renderer/components/editor/useEditorController.ts
// Orchestrateur de la page d'édition : c'est le pendant React de l'ancien
// editor.js. Toute la logique métier (données, onglets, sauvegarde,
// historique, surlignage, grammaire, exports) vit ici ; les composants ne font
// que l'afficher et appeler ses méthodes.
//
// CHOIX D'ARCHITECTURE — pourquoi des refs plutôt que du state React pour les
// données du projet : le contenu des chapitres est un contentEditable
// manipulé impérativement (splitText, TreeWalker, restauration du curseur).
// Le piloter de façon déclarative détruirait la position du curseur à chaque
// frappe. `projectData` est donc un objet mutable, exactement comme dans
// l'ancienne closure, et `bump()` signale à React les changements qui, eux,
// doivent se voir (liste des chapitres, onglets, fiches). Cela évite aussi
// toute closure périmée : chaque fonction lit toujours l'état courant.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { getLanguage, t } from '../../i18n';
import { createEditHistory, type EditHistory } from '../../lib/edit-history';
import { createMentionIndex, type MentionIndex } from '../../lib/mention-index';
import { createWbRegistry, type WbRegistry } from '../../lib/wb-registry';
import {
  cleanInvalidMentions,
  highlightWorldBuilding,
  removeMentionsAcrossChapters,
  renameWorldMentionsAcrossChapters,
  syncMentionColors
} from '../../lib/highlight';
import {
  applyGrammarMatches,
  clearGrammarMarks,
  getPlainTextWithMap
} from '../../lib/grammar-check';
import {
  debounce,
  getCaretCharacterOffsetWithin,
  placeCaretAtEnd,
  replaceInHtmlString,
  setCaretPosition
} from '../../lib/dom';
import { buildDocxData } from '../../lib/docx-export';
import { buildMarkdown } from '../../lib/markdown-export';
import { buildPrintHtml } from '../../lib/pdf-export';
import { getDateKey, getStatsBucket, getTotalStats } from '../../lib/stats';
import { describeError } from '../../lib/errors';
import { createStatusStore, type StatusStore } from './editor-status';
import type { InfoAction } from '../common/Dialogs';
import type {
  CustomWbTypeDef,
  EditorPrefs,
  GrammarPrefs,
  ItemType,
  ProjectData,
  ProjectsMap,
  TabRef,
  UiState,
  WbField,
  WbType
} from '../../../shared/types';

// Au-delà de ce seuil de caractères, le recalcul du surlignage à CHAQUE pause
// de frappe (TreeWalker + regex sur tout le chapitre) devient coûteux. On ne le
// refait plus qu'occasionnellement pour ces gros chapitres. Une vraie solution
// (recalcul incrémental limité au paragraphe modifié) demanderait de réécrire
// le surlignage en profondeur ; ceci est un garde-fou pragmatique.
const HIGHLIGHT_SIZE_THRESHOLD = 50000;
const HIGHLIGHT_MANY_ITEMS_THRESHOLD = 60;
const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5;

const HISTORY_DEBOUNCE_MS = 700; // regrouper une rafale de frappe en une seule étape d'annulation
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

export const EDITOR_ZOOM_MIN = 0.5;
export const EDITOR_ZOOM_MAX = 2.5;
export const EDITOR_ZOOM_STEP = 0.1;

const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  width: 800,
  fontFamily: "'Roboto', sans-serif",
  lineHeight: 1.6,
  uiFontSize: 14,
  uiFontFamily: "'Roboto', sans-serif",
  timerSoundEnabled: true,
  timerVolume: 0.5,
  timerSoundId: 'chime',
  marginLeft: 80,
  marginRight: 80,
  firstLineIndent: 0
};

interface MutableState {
  projects: ProjectsMap;
  projectData: ProjectData;
  uiState: UiState;
  openTabs: TabRef[];
  activeTab: string | null;
  activeType: ItemType;
  editorEl: HTMLElement | null;
  zoom: number;
  nativeSpellcheck: boolean;
  wbReadMode: boolean;
  editorPrefs: EditorPrefs;
  grammarPrefs: GrammarPrefs;
  grammarServerReady: boolean;
  grammarStarting: boolean;
  grammarCheckInFlight: boolean;
  lastGrammarErrorShown: string | null;
  lastBackupAt: number;
  hasUnsavedChangesSinceLastBackup: boolean;
  largeChapterHighlightCounter: number;
  wbColorVersion: number;
  chapterColorSyncVersion: Map<string, number>;
  ready: boolean;
}

export interface EditorController {
  projectName: string;
  ready: boolean;
  status: StatusStore;
  registry: WbRegistry;

  // Lecture de l'état (toujours à jour)
  data(): ProjectData;
  tabs(): TabRef[];
  activeTab(): string | null;
  activeType(): ItemType;
  isReadMode(): boolean;
  prefs(): EditorPrefs;
  grammarPrefs(): GrammarPrefs;
  nativeSpellcheckEnabled(): boolean;
  zoom(): number;

  // Cycle de vie du contentEditable
  attachEditor(el: HTMLElement | null): void;
  onChapterMounted(name: string): void;
  handleInput(): void;
  handlePaste(e: ReactClipboardEvent<HTMLElement>): void;
  handleEditorClick(e: ReactMouseEvent<HTMLElement>): void;

  // Onglets et navigation
  openItem(name: string, type: ItemType): void;
  switchTab(name: string, type: ItemType): void;
  closeTab(index: number): Promise<void>;
  moveTab(from: number, to: number): void;
  cycleTab(delta: number): void;

  // Sauvegarde
  save(): Promise<void>;
  setSaveStatus(state: 'saved' | 'pending' | 'error'): void;
  updateStats(): void;

  // Mise en forme
  format(cmd: string, val?: string): void;
  setFontFamily(font: string): void;
  setFontSizePx(px: number): void;
  /** Insère un caractère (ou une courte chaîne) au point du curseur dans le
   *  chapitre actif, par ex. depuis le panneau de caractères spéciaux. */
  insertText(text: string): void;
  undo(): void;
  redo(): void;
  setZoom(next: number): void;
  zoomBy(direction: number): void;

  // Contenu du projet
  createChapter(name: string): boolean;
  createWbItem(name: string, type: WbType): boolean;
  deleteItem(name: string, type: ItemType): Promise<void>;
  renameItem(oldName: string, newName: string, type: ItemType): Promise<boolean>;
  reorderSidebar(type: ItemType, newOrder: string[]): void;
  updateWbField(name: string, fieldKey: string, value: string): void;
  setWbIcon(name: string, icon: string): void;
  setWbColor(name: string, color: string): void;
  toggleReadMode(): void;
  chaptersContaining(name: string): string[];

  // Types de fiches personnalisés
  saveCustomType(slug: string | null, def: CustomWbTypeDef): string;
  deleteCustomType(slug: string, def: CustomWbTypeDef): Promise<void>;
  itemsUsingType(slug: string): string[];

  // Recherche / remplacement
  replaceAll(findStr: string, repStr: string, wholeProject: boolean): void;

  // Préférences
  updatePrefs(prefs: EditorPrefs): void;
  setNativeSpellcheck(enabled: boolean): Promise<void>;

  // Grammaire
  setGrammarEnabled(enabled: boolean): Promise<void>;
  refreshGrammarStatus(): Promise<void>;
  resetGrammarError(): void;
  applyGrammarSuggestion(mark: HTMLElement, replacement: string): void;
  ignoreGrammarMark(mark: HTMLElement): void;

  // Exports
  exportAs(kind: 'txt' | 'md' | 'pdf' | 'docx' | 'project'): Promise<void>;

  // Sauvegardes horodatées
  restoreBackup(fileName: string): Promise<void>;

  // Statistiques
  recordWritingStats(): Promise<void>;

  // Projet
  /** Renomme le projet courant. Met à jour le store (projects, uiState,
   *  currentProject) ; le composant appelant doit ensuite répercuter le
   *  nouveau nom vers le haut (App.tsx) pour que `projectName` reste correct
   *  au prochain rendu. */
  renameProject(newName: string): Promise<boolean>;
}

export interface EditorControllerDeps {
  projectName: string;
  showInfo: (message: string, actions?: InfoAction[]) => void;
  showConfirm: (message: string) => Promise<boolean>;
  onApplyPrefs: (prefs: EditorPrefs) => void;
}

export function useEditorController({
  projectName,
  showInfo,
  showConfirm,
  onApplyPrefs
}: EditorControllerDeps): EditorController {
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const stateRef = useRef<MutableState>({
    projects: {},
    projectData: { chapters: {}, world: {}, customWbTypes: {} },
    uiState: {},
    openTabs: [],
    activeTab: null,
    activeType: 'chapter',
    editorEl: null,
    zoom: 1,
    nativeSpellcheck: true,
    wbReadMode: false,
    editorPrefs: DEFAULT_EDITOR_PREFS,
    grammarPrefs: { enabled: false, languageToolPath: null, port: 8081 },
    grammarServerReady: false,
    grammarStarting: false,
    grammarCheckInFlight: false,
    lastGrammarErrorShown: null,
    lastBackupAt: 0,
    hasUnsavedChangesSinceLastBackup: false,
    largeChapterHighlightCounter: 0,
    wbColorVersion: 0,
    chapterColorSyncVersion: new Map(),
    ready: false
  });
  const s = stateRef.current;

  const status = useMemo(() => createStatusStore(), []);
  const historyRef = useRef<EditHistory>(createEditHistory());
  const registryRef = useRef<WbRegistry>(createWbRegistry(() => stateRef.current.projectData));
  const indexRef = useRef<MentionIndex>(createMentionIndex(() => stateRef.current.projectData));
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = historyRef.current;
  const registry = registryRef.current;
  const mentionIndex = indexRef.current;

  // Les fonctions ci-dessous sont définies une seule fois (refs stables) et
  // lisent toujours `stateRef.current` : aucune closure périmée possible.
  const api = useRef<EditorController | null>(null);

  // ---------------------------------------------------------------------
  // STATUT / STATISTIQUES
  // ---------------------------------------------------------------------
  const setSaveStatus = useCallback(
    (state: 'saved' | 'pending' | 'error') => {
      if (state === 'saved') {
        const now = new Date();
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        status.set({ saveState: 'saved', savedAt: `${hh}:${mm}` });
      } else {
        status.set({ saveState: state });
      }
    },
    [status]
  );

  const updateUndoRedo = useCallback(() => {
    const enabled = s.activeType === 'chapter' && !!s.activeTab;
    status.set({
      canUndo: enabled && history.canUndo(s.activeTab),
      canRedo: enabled && history.canRedo(s.activeTab)
    });
  }, [history, s, status]);

  const updateStats = useCallback(() => {
    if (s.activeType !== 'chapter') {
      status.set({ sheetMode: true });
      return;
    }
    const editor = s.editorEl;
    if (!editor) return;

    const selection = window.getSelection();
    let words = 0;
    let chars = 0;
    let selectionActive = false;

    if (selection && selection.rangeCount > 0) {
      const selectedText = selection.getRangeAt(0).toString().trim();
      if (selectedText) {
        selectionActive = true;
        words = selectedText.split(/\s+/).filter(Boolean).length;
        chars = selectedText.length;
      }
    }

    if (!selectionActive) {
      const text = (editor as HTMLElement).innerText.trim();
      words = text === '' ? 0 : text.split(/\s+/).filter(Boolean).length;
      chars = text.length;
    }

    status.set({
      sheetMode: false,
      words,
      chars,
      selectionActive,
      totalWords: getTotalStats(s.projectData).words
    });
  }, [s, status]);

  // Enregistre la progression du nombre de mots pour la journée en cours, pour
  // LE PROJET COURANT uniquement. Un "baseline" (total au début de la journée)
  // permet de calculer à tout moment le solde net écrit aujourd'hui.
  const recordWritingStats = useCallback(async () => {
    try {
      const stats = (await window.api.getWritingStats()) || {};
      const bucket = getStatsBucket(stats, projectName);

      const todayKey = getDateKey(new Date());
      const currentTotal = getTotalStats(s.projectData).words;

      if (bucket.baselineDate !== todayKey) {
        // Premier enregistrement du jour : on fige le solde d'hier (déjà dans
        // l'historique) et on redémarre un nouveau point de référence.
        bucket.baselineDate = todayKey;
        bucket.baselineWords = currentTotal;
        if (bucket.history[todayKey] === undefined) bucket.history[todayKey] = 0;
      } else {
        bucket.history[todayKey] = currentTotal - bucket.baselineWords;
      }

      await window.api.saveWritingStats(stats);
    } catch (err) {
      console.error("Échec de l'enregistrement des statistiques d'écriture:", err);
    }
  }, [projectName, s]);

  // ---------------------------------------------------------------------
  // SAUVEGARDE
  // ---------------------------------------------------------------------
  const maybeCreateBackup = useCallback(async () => {
    if (!s.hasUnsavedChangesSinceLastBackup) return;
    const now = Date.now();
    if (now - s.lastBackupAt < BACKUP_INTERVAL_MS) return;

    try {
      await window.api.createBackup(projectName, s.projectData);
      s.lastBackupAt = now;
      s.hasUnsavedChangesSinceLastBackup = false;
    } catch (err) {
      console.error('Échec de la sauvegarde automatique horodatée:', err);
    }
  }, [projectName, s]);

  const save = useCallback(async () => {
    // Sécurité : si on est en train de supprimer (activeTab null), ne pas
    // sauvegarder un contenu qui n'a plus de destination.
    if (!s.activeTab) return;

    if (s.activeType === 'chapter' && s.editorEl) {
      s.projectData.chapters[s.activeTab] = s.editorEl.innerHTML;
    }
    s.projects[projectName] = s.projectData;
    s.hasUnsavedChangesSinceLastBackup = true;
    void recordWritingStats(); // best-effort, ne bloque pas la sauvegarde

    try {
      await window.api.saveProjects(s.projects);
      s.uiState[projectName] = {
        openTabs: s.openTabs,
        activeTab: s.activeTab,
        activeType: s.activeType
      };
      await window.api.saveUiState(s.uiState);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Échec de la sauvegarde:', err);
      setSaveStatus('error');
      return;
    }

    void maybeCreateBackup();
  }, [maybeCreateBackup, projectName, recordWritingStats, s, setSaveStatus]);

  // Sauvegarde disque : délibérément sur un timer SÉPARÉ et plus long que le
  // recalcul du surlignage. Avant, save() était appelé dans le même debounce
  // (1s après une pause de frappe) : en écriture continue avec de courtes
  // pauses, ça déclenchait une écriture disque à quasiment chaque pause.
  // Le statut affiché, lui, reste instantané (setSaveStatus('pending') est
  // posé dès la frappe) : seule l'écriture réelle est différée et groupée.
  const debouncedSave = useMemo(() => debounce(() => void save(), 2500), [save]);

  // ---------------------------------------------------------------------
  // GRAMMAIRE
  // ---------------------------------------------------------------------
  const updateGrammarStatus = useCallback(() => {
    status.set({
      grammarEnabled: s.grammarPrefs.enabled,
      grammarReady: s.grammarServerReady,
      grammarStarting: s.grammarStarting
    });
  }, [s, status]);

  const runGrammarCheck = useCallback(async () => {
    if (!s.grammarPrefs.enabled || !s.grammarServerReady) return;
    if (s.activeType !== 'chapter' || !s.activeTab) return;
    const editor = s.editorEl;
    if (!editor || s.grammarCheckInFlight) return;

    s.grammarCheckInFlight = true;
    try {
      const caretOffset = getCaretCharacterOffsetWithin(editor);
      const hadMarks = clearGrammarMarks(editor);

      const { text } = getPlainTextWithMap(editor);
      if (text.trim().length > 0) {
        const lang = getLanguage() === 'en' ? 'en-US' : 'fr';
        const matches = await window.api.checkGrammar(text, lang);
        // Le chapitre actif a pu changer pendant l'attente : on n'applique le
        // résultat que s'il correspond toujours à ce qui est affiché.
        if (s.activeType === 'chapter' && s.editorEl === editor) {
          applyGrammarMatches(editor, matches, getPlainTextWithMap(editor).nodes);
        }
      }

      if (hadMarks || text.trim().length > 0) {
        try {
          setCaretPosition(editor, caretOffset);
        } catch {
          /* curseur hors texte, on ignore */
        }
      }
    } catch (err) {
      const message = describeError(err);
      console.error('Erreur du correcteur de grammaire :', err);
      // On ne signale qu'une seule fois par message (pas à chaque frappe), et
      // on coupe la vérification jusqu'au prochain succès pour éviter de
      // marteler un serveur en échec toutes les 1,5s.
      if (s.lastGrammarErrorShown !== message) {
        s.lastGrammarErrorShown = message;
        s.grammarServerReady = false;
        updateGrammarStatus();
        showInfo(t('grammarCheckFailedAlert', { error: message }));
      }
    } finally {
      s.grammarCheckInFlight = false;
    }
  }, [s, showInfo, updateGrammarStatus]);

  const debouncedGrammarCheck = useMemo(
    () => debounce(() => void runGrammarCheck(), 1500),
    [runGrammarCheck]
  );

  const refreshGrammarStatus = useCallback(async () => {
    status.set({ grammarMessage: t('grammarStatusChecking') });

    const javaInfo = await window.api.checkJavaAvailable();
    status.set({ javaInfo });
    const javaOk = javaInfo.available && !javaInfo.outdated;

    if (!s.grammarPrefs.enabled) {
      status.set({ grammarMessage: t('grammarStatusDisabled') });
      updateGrammarStatus();
      return;
    }
    if (!javaOk || !s.grammarPrefs.languageToolPath) {
      status.set({ grammarMessage: '' });
      updateGrammarStatus();
      return;
    }

    status.set({ grammarMessage: t('grammarStatusStarting') });
    s.grammarStarting = true;
    updateGrammarStatus();
    try {
      const result = await window.api.startGrammarServer();
      s.grammarServerReady = true;
      status.set({ grammarMessage: t('grammarStatusReady', { port: result.port }) });
      debouncedGrammarCheck();
    } catch (err) {
      s.grammarServerReady = false;
      status.set({
        grammarMessage: t('grammarStatusError', {
          error: describeError(err)
        })
      });
    } finally {
      s.grammarStarting = false;
      updateGrammarStatus();
    }
  }, [debouncedGrammarCheck, s, status, updateGrammarStatus]);

  // ---------------------------------------------------------------------
  // SURLIGNAGE
  // ---------------------------------------------------------------------
  const highlight = useCallback(() => {
    if (s.activeType !== 'chapter' || !s.editorEl) return;
    highlightWorldBuilding(s.editorEl, s.projectData, registry);
  }, [registry, s]);

  const debouncedHighlight = useMemo(
    () =>
      debounce(() => {
        const editor = s.editorEl;
        const chapterSize = editor ? (editor as HTMLElement).innerText.length : 0;
        const wbItemCount = Object.keys(s.projectData.world).length;

        let shouldHighlightNow = true;
        if (chapterSize > HIGHLIGHT_SIZE_THRESHOLD || wbItemCount > HIGHLIGHT_MANY_ITEMS_THRESHOLD) {
          s.largeChapterHighlightCounter++;
          shouldHighlightNow = s.largeChapterHighlightCounter % HIGHLIGHT_LARGE_CHAPTER_EVERY_N === 0;
        }

        if (shouldHighlightNow) highlight();

        if (editor && s.activeTab && s.activeType === 'chapter') {
          mentionIndex.updateForChapter(s.activeTab, editor.innerHTML);
          history.resyncOnly(s.activeTab, editor.innerHTML);
          updateUndoRedo();
        }
      }, 1000),
    [highlight, history, mentionIndex, s, updateUndoRedo]
  );

  const scheduleHistoryCommit = useCallback(
    (name: string | null, html: string) => {
      if (!name) return;
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(() => {
        history.commit(name, html);
        updateUndoRedo();
      }, HISTORY_DEBOUNCE_MS);
    },
    [history, updateUndoRedo]
  );

  // ---------------------------------------------------------------------
  // INITIALISATION
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const projects = await window.api.getProjects();
      let projectData = projects[projectName];

      if (projectData && !projectData.chapters && !projectData.world) {
        // Migration d'anciens projets stockés sans la structure {chapters, world}
        projectData = { chapters: projectData as unknown as Record<string, string>, world: {} };
        projects[projectName] = projectData;
        await window.api.saveProjects(projects);
      } else if (!projectData) {
        projectData = { chapters: {}, world: {} };
      }
      // Migration : absent sur les projets créés avant les types personnalisés
      if (!projectData.customWbTypes) projectData.customWbTypes = {};

      const uiState = await window.api.getUiState();
      const projectState = uiState[projectName] || {
        openTabs: [],
        activeTab: null,
        activeType: 'chapter' as ItemType
      };

      const prefs = (await window.api.getEditorPrefs()) || DEFAULT_EDITOR_PREFS;
      const nativeSpellcheck = await window.api.getNativeSpellcheck();
      const grammarPrefs = await window.api.getGrammarPrefs();

      if (cancelled) return;

      s.projects = projects;
      s.projectData = projectData;
      s.uiState = uiState;
      s.openTabs = projectState.openTabs || [];
      s.activeTab = projectState.activeTab;
      s.activeType = projectState.activeType || 'chapter';
      s.editorPrefs = { ...DEFAULT_EDITOR_PREFS, ...prefs };
      s.nativeSpellcheck = nativeSpellcheck;
      s.grammarPrefs = grammarPrefs;
      s.ready = true;

      mentionIndex.rebuildAll();
      onApplyPrefs(s.editorPrefs);
      updateGrammarStatus();
      bump();

      // Si aucun onglet actif n'était mémorisé mais que des onglets restent
      // ouverts, on rouvre le premier (comme l'ancienne version).
      if (!s.activeTab && s.openTabs.length > 0) {
        s.activeTab = s.openTabs[0].name;
        s.activeType = s.openTabs[0].type;
        bump();
      }

      if (grammarPrefs.enabled) void refreshGrammarStatus();
    })();

    return () => {
      cancelled = true;
    };
    // Volontairement monté une seule fois par projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  // Le processus main prévient le renderer si le serveur LanguageTool meurt
  // après coup (crash, tué manuellement, port repris). Sans ça, le renderer
  // continuait de croire le serveur prêt et la prochaine vérification échouait
  // avec un message confus ("pas démarré") alors qu'il avait bien démarré.
  useEffect(() => {
    const unsubscribe = window.api.onGrammarServerStopped(() => {
      s.grammarServerReady = false;
      s.lastGrammarErrorShown = null;
      updateGrammarStatus();
      if (s.grammarPrefs.enabled) void refreshGrammarStatus();
    });
    return unsubscribe;
  }, [refreshGrammarStatus, s, updateGrammarStatus]);

  // ---------------------------------------------------------------------
  // CONSTRUCTION DE L'API
  // ---------------------------------------------------------------------
  if (!api.current) {
    const ctrl: EditorController = {
      projectName,
      ready: false,
      status,
      registry,

      data: () => stateRef.current.projectData,
      tabs: () => stateRef.current.openTabs,
      activeTab: () => stateRef.current.activeTab,
      activeType: () => stateRef.current.activeType,
      isReadMode: () => stateRef.current.wbReadMode,
      prefs: () => stateRef.current.editorPrefs,
      grammarPrefs: () => stateRef.current.grammarPrefs,
      nativeSpellcheckEnabled: () => stateRef.current.nativeSpellcheck,
      zoom: () => stateRef.current.zoom,

      // --- contentEditable ---
      attachEditor(el) {
        s.editorEl = el;
      },

      onChapterMounted(name) {
        const editor = s.editorEl;
        if (!editor) return;
        history.sync(name, editor.innerHTML);
        s.largeChapterHighlightCounter = 0;
        highlight();
        // La couleur d'une fiche a pu changer pendant que ce chapitre était
        // fermé : on ne resynchronise que si c'est le cas.
        if (s.chapterColorSyncVersion.get(name) !== s.wbColorVersion) {
          syncMentionColors(editor, s.projectData, registry);
          s.chapterColorSyncVersion.set(name, s.wbColorVersion);
        }
        debouncedGrammarCheck();
        updateStats();
        updateUndoRedo();
      },

      handleInput() {
        const editor = s.editorEl;
        if (!editor || !s.activeTab) return;
        s.projectData.chapters[s.activeTab] = editor.innerHTML;
        setSaveStatus('pending');
        updateStats();
        scheduleHistoryCommit(s.activeTab, editor.innerHTML);
        debouncedHighlight();
        debouncedSave();
        debouncedGrammarCheck();
      },

      // SÉCURITÉ : le presse-papiers peut contenir du HTML copié depuis
      // n'importe quelle page web (potentiellement piégé : gestionnaires
      // d'événements, scripts). On le fait désinfecter par le processus
      // principal avant insertion.
      handlePaste(e) {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const plain = e.clipboardData.getData('text/plain');
        const escapeHtml = (str: string) =>
          str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        void (async () => {
          let toInsert: string;
          if (html) {
            try {
              toInsert = await window.api.sanitizeHtml(html);
            } catch (err) {
              console.error('Échec de la désinfection du collage, repli en texte brut:', err);
              toInsert = escapeHtml(plain).replace(/\n/g, '<br>');
            }
          } else {
            toInsert = escapeHtml(plain).replace(/\n/g, '<br>');
          }
          document.execCommand('insertHTML', false, toInsert);
        })();
      },

      handleEditorClick(e) {
        const target = e.target as HTMLElement;
        const mention = target.closest<HTMLElement>('.wb-mention');
        if (!mention) return;
        if (!(e.ctrlKey || e.metaKey)) return;

        e.preventDefault();
        e.stopPropagation();
        const wbKey = mention.dataset.wbKey;
        if (wbKey && s.projectData.world[wbKey]) {
          ctrl.openItem(wbKey, 'world');
        } else {
          showInfo(t('itemNotFound'));
          if (s.editorEl) cleanInvalidMentions(s.editorEl, Object.keys(s.projectData.world));
        }
      },

      // --- Onglets ---
      openItem(name, type) {
        const existing = s.openTabs.find((tab) => tab.name === name && tab.type === type);
        if (!existing) s.openTabs = [...s.openTabs, { name, type }];
        ctrl.switchTab(name, type);
      },

      switchTab(name, type) {
        if (s.activeTab === name && s.activeType === type) {
          bump();
          return;
        }
        void save(); // la partie synchrone capture le HTML courant avant démontage
        s.activeTab = name;
        s.activeType = type;
        bump();
      },

      async closeTab(index) {
        const closed = s.openTabs[index];
        if (!closed) return;

        await save();

        // Si la dernière sauvegarde a échoué, fermer l'onglet sans rien dire
        // ferait perdre silencieusement le texte non écrit sur disque.
        if (status.get().saveState === 'error') {
          if (!(await showConfirm(t('closeTabUnsavedWarning', { name: closed.name })))) return;
        }

        const nextTabs = s.openTabs.slice();
        nextTabs.splice(index, 1);
        s.openTabs = nextTabs;

        if (s.activeTab === closed.name && s.activeType === closed.type) {
          if (nextTabs.length > 0) {
            const next = nextTabs[Math.max(0, index - 1)];
            s.activeTab = next.name;
            s.activeType = next.type;
          } else {
            s.activeTab = null;
          }
        }
        bump();
        void save();
      },

      moveTab(from, to) {
        if (from === to) return;
        const next = s.openTabs.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        s.openTabs = next;
        void save();
        bump();
      },

      cycleTab(delta) {
        if (s.openTabs.length <= 1) return;
        const currentIndex = s.openTabs.findIndex(
          (tab) => tab.name === s.activeTab && tab.type === s.activeType
        );
        const nextIndex = (currentIndex + delta + s.openTabs.length) % s.openTabs.length;
        ctrl.switchTab(s.openTabs[nextIndex].name, s.openTabs[nextIndex].type);
      },

      save,
      setSaveStatus,
      updateStats,
      recordWritingStats,

      // --- Mise en forme ---
      format(cmd, val) {
        if (s.activeType !== 'chapter') return;
        document.execCommand(cmd, false, val);
        s.editorEl?.focus();
        void save();
        updateStats();
      },

      setFontFamily(font) {
        applyStyleToSelection({ fontFamily: font });
      },

      setFontSizePx(px) {
        applyStyleToSelection({ fontSize: `${px}px` });
      },

      insertText(text) {
        if (s.activeType !== 'chapter') return;
        const editor = s.editorEl;
        if (!editor) return;
        editor.focus();
        // execCommand('insertText') insère au point du curseur (ou remplace
        // la sélection) et déclenche un événement 'input' natif, capté par le
        // listener déjà branché sur l'éditeur (handleInput) : sauvegarde,
        // historique et surlignage restent donc cohérents sans code
        // supplémentaire, exactement comme pour une frappe clavier normale.
        document.execCommand('insertText', false, text);
      },

      undo() {
        if (s.activeType !== 'chapter' || !s.activeTab) return;
        const editor = s.editorEl;
        if (!editor) return;

        // Ne pas laisser un commit différé écraser la restauration.
        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        const previous = history.undo(s.activeTab, editor.innerHTML);
        if (previous === null) return;

        editor.innerHTML = previous;
        s.projectData.chapters[s.activeTab] = previous;
        highlight();
        history.resyncOnly(s.activeTab, editor.innerHTML);

        placeCaretAtEnd(editor);
        updateStats();
        updateUndoRedo();
        setSaveStatus('pending');
        void save();
      },

      redo() {
        if (s.activeType !== 'chapter' || !s.activeTab) return;
        const editor = s.editorEl;
        if (!editor) return;

        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        const next = history.redo(s.activeTab, editor.innerHTML);
        if (next === null) return;

        editor.innerHTML = next;
        s.projectData.chapters[s.activeTab] = next;
        highlight();
        history.resyncOnly(s.activeTab, editor.innerHTML);

        placeCaretAtEnd(editor);
        updateStats();
        updateUndoRedo();
        setSaveStatus('pending');
        void save();
      },

      setZoom(next) {
        s.zoom = Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, +next.toFixed(2)));
        if (s.editorEl) s.editorEl.style.zoom = String(s.zoom);
      },

      zoomBy(direction) {
        ctrl.setZoom(s.zoom + direction * EDITOR_ZOOM_STEP);
      },

      // --- Contenu du projet ---
      createChapter(name) {
        const trimmed = name.trim();
        if (!trimmed || s.projectData.chapters[trimmed] !== undefined) return false;
        s.projectData.chapters[trimmed] = '';
        mentionIndex.rebuildChapterOrder();
        void save();
        ctrl.openItem(trimmed, 'chapter');
        return true;
      },

      createWbItem(name, type) {
        const trimmed = name.trim();
        if (!trimmed || s.projectData.world[trimmed]) return false;
        s.projectData.world[trimmed] = { wbType: type, content: {} };
        mentionIndex.addEntryForNewItem(trimmed);
        void save();
        ctrl.openItem(trimmed, 'world');
        if (s.activeType === 'chapter') highlight();
        return true;
      },

      async deleteItem(name, type) {
        if (!(await showConfirm(t('confirmDeleteItem', { name })))) return;

        if (s.activeTab === name && s.activeType === type) s.activeTab = null;

        if (type === 'chapter') {
          delete s.projectData.chapters[name];
          history.remove(name);
          mentionIndex.removeChapter(name);
        } else {
          delete s.projectData.world[name];
          removeMentionsAcrossChapters(s.projectData, name);
          mentionIndex.removeItem(name);
        }

        const idx = s.openTabs.findIndex((tab) => tab.name === name && tab.type === type);
        if (idx !== -1) {
          const nextTabs = s.openTabs.slice();
          nextTabs.splice(idx, 1);
          s.openTabs = nextTabs;
          if (!s.activeTab && nextTabs.length > 0) {
            const next = nextTabs[Math.max(0, idx - 1)];
            s.activeTab = next.name;
            s.activeType = next.type;
          }
        }

        bump();
        void save();
      },

      async renameItem(oldName, newName, type) {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return false;

        if (type === 'chapter') {
          if (s.projectData.chapters[trimmed] !== undefined) {
            showInfo(t('alreadyExists'));
            return false;
          }
          // On reconstruit l'objet pour préserver l'ordre des chapitres.
          const nextChapters: Record<string, string> = {};
          Object.keys(s.projectData.chapters).forEach((key) => {
            if (key === oldName) nextChapters[trimmed] = s.projectData.chapters[oldName];
            else nextChapters[key] = s.projectData.chapters[key];
          });
          s.projectData.chapters = nextChapters;
          history.rename(oldName, trimmed);
          mentionIndex.renameChapter(oldName, trimmed);
        } else {
          if (s.projectData.world[trimmed]) {
            showInfo(t('alreadyExists'));
            return false;
          }

          // Renommer une fiche réécrit aussi son nom partout où il apparaît
          // dans le texte des chapitres (pour garder le récit cohérent) : un
          // changement bien plus large qu'un simple renommage de fiche, donc
          // on prévient avant de le faire silencieusement.
          const affectedChapters = mentionIndex.chaptersContaining(oldName);
          if (affectedChapters.length > 0) {
            const proceed = await showConfirm(
              t('renameWbMentionsWarning', {
                oldName,
                newName: trimmed,
                count: affectedChapters.length
              })
            );
            if (!proceed) return false;
          }

          const nextWorld: ProjectData['world'] = {};
          Object.keys(s.projectData.world).forEach((key) => {
            if (key === oldName) nextWorld[trimmed] = s.projectData.world[oldName];
            else nextWorld[key] = s.projectData.world[key];
          });
          s.projectData.world = nextWorld;

          if (affectedChapters.length > 0) {
            renameWorldMentionsAcrossChapters(s.projectData, oldName, trimmed);
          }
          mentionIndex.renameItem(oldName, trimmed);
        }

        const tab = s.openTabs.find((item) => item.name === oldName && item.type === type);
        if (tab) {
          s.openTabs = s.openTabs.map((item) =>
            item.name === oldName && item.type === type ? { ...item, name: trimmed } : item
          );
        }
        if (s.activeTab === oldName && s.activeType === type) s.activeTab = trimmed;

        // Si un chapitre est affiché, son HTML stocké a pu changer (mention
        // renommée) : on rafraîchit l'éditeur AVANT save(), sinon save()
        // écraserait ce changement avec le contenu encore affiché à l'écran
        // (qui, lui, contient toujours l'ancien nom).
        if (s.activeType === 'chapter' && s.activeTab && s.editorEl) {
          s.editorEl.innerHTML = s.projectData.chapters[s.activeTab] || '';
          highlight();
          history.resyncOnly(s.activeTab, s.editorEl.innerHTML);
          updateStats();
        }

        bump();
        void save();
        return true;
      },

      reorderSidebar(type, newOrder) {
        if (type === 'chapter') {
          const next: Record<string, string> = {};
          newOrder.forEach((key) => {
            next[key] = s.projectData.chapters[key];
          });
          s.projectData.chapters = next;
          mentionIndex.rebuildChapterOrder();
        } else {
          const next: ProjectData['world'] = {};
          newOrder.forEach((key) => {
            next[key] = s.projectData.world[key];
          });
          s.projectData.world = next;
        }
        bump();
        void save();
      },

      updateWbField(name, fieldKey, value) {
        const item = s.projectData.world[name];
        if (!item) return;
        item.content[fieldKey] = value;
        setSaveStatus('pending');
        void save();
      },

      setWbIcon(name, icon) {
        const item = s.projectData.world[name];
        if (!item) return;
        item.icon = icon;
        setSaveStatus('pending');
        void save();
        bump();
      },

      setWbColor(name, color) {
        const item = s.projectData.world[name];
        if (!item) return;
        item.color = color;
        // Invalide le cache de resynchro : tous les chapitres seront
        // revérifiés à leur prochaine ouverture.
        s.wbColorVersion++;
        setSaveStatus('pending');
        void save();
      },

      toggleReadMode() {
        s.wbReadMode = !s.wbReadMode;
        bump();
      },

      chaptersContaining(name) {
        return mentionIndex.chaptersContaining(name);
      },

      // --- Types de fiches personnalisés ---
      itemsUsingType(slug) {
        return Object.keys(s.projectData.world).filter(
          (name) => s.projectData.world[name].wbType === slug
        );
      },

      saveCustomType(slug, def) {
        if (!s.projectData.customWbTypes) s.projectData.customWbTypes = {};
        let finalSlug = slug;

        if (!finalSlug) {
          // Clé interne unique pour ce nouveau type (base = nom slugifié,
          // désambiguïsée en cas de collision).
          const baseSlug = 'custom_' + slugify(def.label, 'type');
          finalSlug = baseSlug;
          let i = 2;
          while (s.projectData.customWbTypes[finalSlug]) {
            finalSlug = `${baseSlug}_${i}`;
            i++;
          }
        }

        s.projectData.customWbTypes[finalSlug] = def;
        registry.bumpVersion();
        void save();
        bump();
        return finalSlug;
      },

      async deleteCustomType(slug, def) {
        // Suppression bloquée tant que des fiches utilisent ce type, pour ne
        // jamais laisser une fiche pointer vers un type inexistant. La liste
        // est cliquable : chaque entrée ouvre directement la fiche concernée.
        const itemsUsingType = ctrl.itemsUsingType(slug);
        if (itemsUsingType.length > 0) {
          showInfo(
            t('customTypeDeleteBlocked', { count: itemsUsingType.length, label: def.label }),
            itemsUsingType.map((name) => ({
              label: `${def.icon || '📁'} ${name}`,
              onClick: () => ctrl.openItem(name, 'world')
            }))
          );
          return;
        }
        if (!(await showConfirm(t('customTypeConfirmDelete', { label: def.label })))) return;

        delete s.projectData.customWbTypes?.[slug];
        registry.bumpVersion();
        void save();
        bump();
      },

      // --- Rechercher / remplacer ---
      replaceAll(findStr, repStr, wholeProject) {
        if (!findStr) return;
        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);

        if (!wholeProject) {
          if (s.activeType !== 'chapter' || !s.activeTab) {
            showInfo(t('replaceNoChapterOpen'));
            return;
          }

          const oldHtml = s.projectData.chapters[s.activeTab];
          const { html: newHtml, count } = replaceInHtmlString(oldHtml, findStr, repStr);
          if (count === 0) {
            showInfo(t('replaceNoneInChapter'));
            return;
          }

          history.sync(s.activeTab, oldHtml);
          s.projectData.chapters[s.activeTab] = newHtml;

          const editor = s.editorEl;
          if (editor) {
            editor.innerHTML = newHtml;
            highlight();
            history.commit(s.activeTab, editor.innerHTML);
            mentionIndex.updateForChapter(s.activeTab, editor.innerHTML);
          }

          updateUndoRedo();
          setSaveStatus('pending');
          void save();
          updateStats();
          showInfo(t('replaceDoneInChapter', { count }));
          return;
        }

        let totalCount = 0;
        let chaptersAffected = 0;

        Object.keys(s.projectData.chapters).forEach((chapName) => {
          const oldHtml = s.projectData.chapters[chapName];
          const { html: newHtml, count } = replaceInHtmlString(oldHtml, findStr, repStr);
          if (count === 0) return;

          chaptersAffected++;
          totalCount += count;

          history.sync(chapName, oldHtml);
          s.projectData.chapters[chapName] = newHtml;
          history.commit(chapName, newHtml);

          // Si ce chapitre est affiché, on met aussi à jour le DOM visible.
          if (chapName === s.activeTab && s.editorEl) {
            s.editorEl.innerHTML = newHtml;
            highlight();
            history.resyncOnly(chapName, s.editorEl.innerHTML);
            s.projectData.chapters[chapName] = s.editorEl.innerHTML;
          }
        });

        mentionIndex.rebuildAll();
        updateUndoRedo();
        setSaveStatus('pending');
        void save();
        updateStats();
        showInfo(
          totalCount > 0
            ? t('replaceDoneInProject', { count: totalCount, chapters: chaptersAffected })
            : t('replaceNoneInProject')
        );
      },

      // --- Préférences ---
      updatePrefs(prefs) {
        s.editorPrefs = prefs;
        onApplyPrefs(prefs);
        void window.api.saveEditorPrefs(prefs);
        bump();
      },

      async setNativeSpellcheck(enabled) {
        s.nativeSpellcheck = enabled;
        await window.api.setNativeSpellcheck(enabled);
        // On applique directement l'attribut spellcheck sur l'élément éditable
        // (mécanisme fiable, standard web honoré par le moteur de rendu) en
        // plus de l'appel à session.setSpellCheckerEnabled() côté main, qui
        // reste utile mais pas toujours suffisant seul.
        if (s.editorEl) s.editorEl.spellcheck = enabled;
        bump();
      },

      // --- Grammaire ---
      async setGrammarEnabled(enabled) {
        s.grammarPrefs = await window.api.saveGrammarPrefs({ enabled });
        if (!s.grammarPrefs.enabled) {
          s.grammarServerReady = false;
          const editor = s.editorEl;
          if (editor && clearGrammarMarks(editor) && s.activeTab) {
            s.projectData.chapters[s.activeTab] = editor.innerHTML;
          }
        }
        updateGrammarStatus();
        await refreshGrammarStatus();
        bump();
      },

      refreshGrammarStatus,

      resetGrammarError() {
        s.lastGrammarErrorShown = null;
      },

      applyGrammarSuggestion(mark, replacement) {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.insertBefore(document.createTextNode(replacement), mark);
        parent.removeChild(mark);
        parent.normalize();

        const editor = s.editorEl;
        if (editor && s.activeTab) {
          s.projectData.chapters[s.activeTab] = editor.innerHTML;
          setSaveStatus('pending');
          updateStats();
          scheduleHistoryCommit(s.activeTab, editor.innerHTML);
          void save();
        }
      },

      ignoreGrammarMark(mark) {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      },

      // --- Exports ---
      async exportAs(kind) {
        const chapterNames = Object.keys(s.projectData.chapters);
        if (kind !== 'project' && chapterNames.length === 0) {
          showInfo(t('nothingToExport'));
          return;
        }

        // S'assurer que le chapitre en cours d'édition est bien à jour.
        await save();

        try {
          if (kind === 'txt') {
            const result = await window.api.showSaveDialog({
              title: 'Exporter en TXT',
              defaultPath: `${projectName} - Complet.txt`,
              filters: [{ name: 'Fichier Texte', extensions: ['txt'] }]
            });
            if (result.canceled || !result.filePath) return;

            let fullText = '';
            chapterNames.forEach((chapName) => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = s.projectData.chapters[chapName] || '';
              fullText += `--- ${chapName} ---\n\n` + tempDiv.innerText + '\n\n\n';
            });

            await window.api.exportTxt(result.filePath, fullText);
            showInfo(t('exportTxtSuccess'));
          } else if (kind === 'md') {
            const result = await window.api.showSaveDialog({
              title: 'Exporter en Markdown',
              defaultPath: `${projectName}.md`,
              filters: [{ name: 'Markdown', extensions: ['md'] }]
            });
            if (result.canceled || !result.filePath) return;
            await window.api.exportTxt(result.filePath, buildMarkdown(s.projectData));
            showInfo(t('exportMdSuccess'));
          } else if (kind === 'pdf') {
            const result = await window.api.showSaveDialog({
              title: 'Exporter en PDF',
              defaultPath: `${projectName}.pdf`,
              filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (result.canceled || !result.filePath) return;
            await window.api.exportPdf(result.filePath, buildPrintHtml(s.projectData, projectName));
            showInfo(t('exportPdfSuccess'));
          } else if (kind === 'docx') {
            const result = await window.api.showSaveDialog({
              title: 'Exporter en DOCX',
              defaultPath: `${projectName} - Complet.docx`,
              filters: [{ name: 'Word', extensions: ['docx'] }]
            });
            if (result.canceled || !result.filePath) return;
            await window.api.exportDocx(result.filePath, buildDocxData(s.projectData));
            showInfo(t('exportDocxSuccess'));
          } else {
            const result = await window.api.showSaveDialog({
              title: 'Exporter le projet complet',
              defaultPath: `${projectName}.scriptorium`,
              filters: [{ name: 'Projet Scriptorium', extensions: ['scriptorium'] }]
            });
            if (result.canceled || !result.filePath) return;
            await window.api.exportProject(result.filePath, projectName, s.projectData);
            showInfo(t('exportSuccess'));
          }
        } catch (err) {
          const message = describeError(err);
          console.error(`Erreur export ${kind}:`, err);
          const prefix = {
            txt: 'exportTxtError',
            md: 'exportMdError',
            pdf: 'exportPdfError',
            docx: 'exportDocxError',
            project: 'exportProjectError'
          } as const;
          showInfo(t(prefix[kind]) + message);
        }
      },

      // --- Sauvegardes horodatées ---
      async restoreBackup(fileName) {
        // Filet de sécurité : on sauvegarde l'état actuel avant d'écraser.
        await window.api.createBackup(projectName, s.projectData);

        const restored = await window.api.restoreBackup(projectName, fileName);
        s.projectData = restored;
        // Migration : sauvegardes antérieures aux types personnalisés
        if (!s.projectData.customWbTypes) s.projectData.customWbTypes = {};
        // projectData remplacé en bloc : les caches ne sont plus fiables.
        registry.bumpVersion();
        s.wbColorVersion++;
        s.chapterColorSyncVersion.clear();
        mentionIndex.rebuildAll();

        s.projects[projectName] = s.projectData;
        await window.api.saveProjects(s.projects);

        s.activeTab = null;
        s.openTabs = [];
        bump();
      },

      // --- Renommage du projet ---
      async renameProject(newName) {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === projectName) return false;

        // S'assurer que le contenu en cours d'édition est bien flushé et
        // persisté sous l'ancien nom avant de déplacer les données.
        await save();

        const allProjects = await window.api.getProjects();
        if (allProjects[trimmed]) {
          showInfo(t('alreadyExists'));
          return false;
        }

        // On reconstruit l'objet en conservant l'ordre des clés (comme pour
        // un renommage depuis la page d'accueil), en utilisant les données en
        // mémoire (les plus à jour) pour l'entrée renommée.
        const next: ProjectsMap = {};
        Object.keys(allProjects).forEach((key) => {
          next[key === projectName ? trimmed : key] = key === projectName ? s.projectData : allProjects[key];
        });
        await window.api.saveProjects(next);

        const uiState = await window.api.getUiState();
        if (uiState[projectName]) {
          uiState[trimmed] = uiState[projectName];
          delete uiState[projectName];
          await window.api.saveUiState(uiState);
        }

        await window.api.setCurrentProject(trimmed);

        // On ne mute pas `projectName` ici (c'est un paramètre figé de ce
        // rendu) : le composant appelant doit répercuter le nouveau nom vers
        // App.tsx, qui redescendra une prop `projectName` mise à jour. Toutes
        // les closures qui en dépendent (save, exportAs, recordWritingStats...)
        // en tiennent compte via leurs tableaux de dépendances React.
        return true;
      }
    };

    // Police et taille de texte N'UTILISENT PLUS document.execCommand(
    // 'fontName'/'fontSize') : cette API est dépréciée et son comportement
    // exact (quelle balise ou quel style elle produit) varie selon la version
    // de Chromium embarquée par Electron, ce qui la rendait peu fiable
    // (parfois silencieusement sans effet). On applique donc le style
    // nous-mêmes, directement sur la sélection, via l'API Range/Selection.
    function applyStyleToSelection(styles: Partial<CSSStyleDeclaration>): void {
      if (s.activeType !== 'chapter') return;
      const editor = s.editorEl;
      if (!editor) return;
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;

      const span = document.createElement('span');
      Object.assign(span.style, styles);

      if (range.collapsed) {
        // Rien n'est sélectionné : comme dans Google Docs/Word, le réglage
        // s'applique à la PROCHAINE frappe. On insère un span vide au point du
        // curseur (avec un caractère de largeur nulle pour que le navigateur y
        // ancre réellement le curseur) et on y place le curseur.
        span.appendChild(document.createTextNode('\u200B'));
        range.insertNode(span);

        const caretRange = document.createRange();
        if (span.firstChild) {
          caretRange.setStart(span.firstChild, 1);
          caretRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caretRange);
        }
      } else {
        // Sélection existante : on en extrait le contenu et on le réinsère à
        // l'intérieur du span. Plus robuste que Range.surroundContents (qui
        // échoue dès que la sélection chevauche plusieurs éléments).
        span.appendChild(range.extractContents());
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      editor.focus();

      // Contrairement à document.execCommand (qui émet un événement 'input'
      // natif), une manipulation manuelle du DOM n'émet rien : on réplique
      // donc ce que ferait le gestionnaire d'input, pour que la sauvegarde,
      // l'historique et le surlignage restent cohérents.
      if (s.activeTab) s.projectData.chapters[s.activeTab] = editor.innerHTML;
      setSaveStatus('pending');
      updateStats();
      scheduleHistoryCommit(s.activeTab, editor.innerHTML);
      debouncedHighlight();
      debouncedSave();
    }

    api.current = ctrl;
  }

  // `ready` est le seul champ de l'API qui change d'un rendu à l'autre.
  api.current.ready = s.ready;
  return api.current;
}

export function slugify(str: string, fallback: string): string {
  return (
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // enlève les accents
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

/** Attribue une clé interne aux champs d'un type personnalisé. Les clés déjà
 *  existantes (mode édition) sont réutilisées telles quelles pour préserver le
 *  contenu déjà saisi par les fiches de ce type ; seuls les champs
 *  nouvellement ajoutés reçoivent une clé fraîche. */
export function buildCustomTypeFields(
  rawFields: { label: string; type: WbField['type']; existingKey?: string }[]
): WbField[] {
  const usedKeys = new Set(rawFields.map((f) => f.existingKey).filter(Boolean) as string[]);
  return rawFields.map((f) => {
    if (f.existingKey) return { key: f.existingKey, label: f.label, type: f.type };
    const base = slugify(f.label, 'champ');
    let uniqueKey = base;
    let j = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${base}_${j}`;
      j++;
    }
    usedKeys.add(uniqueKey);
    return { key: uniqueKey, label: f.label, type: f.type };
  });
}
