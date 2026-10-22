// src/renderer/components/editor/ScreenplayEditor.tsx
//
// Éditeur principal d’un scénario.
//
// Les éléments contentEditable sont laissés maîtres de leur DOM pendant la
// saisie. La navigation vers une scène active ne se relance pas après chaque
// caractère.
//
// Modifications successives : chaque modification part de la version la plus
// récente du scénario (screenplayRef). Sans cela, deux modifications envoyées
// coup sur coup (Entrée au milieu d'un paragraphe) s'écrasaient.
//
// Surlignage World Building : les fiches et le registre des couleurs sont
// transmis aux paragraphes. Une « signature » des fiches (noms, alias,
// couleurs, catégories) permet de relancer le surlignage quand une fiche change.
//
// Annuler / rétablir (version 2) : historique propre au scénario.
// - les frappes successives dans un même paragraphe forment une seule étape ;
// - les retouches automatiques (couleurs, majuscules) ne créent pas d'étape ;
// - seuls le texte et les en-têtes des scènes sont restaurés : les scènes
//   créées, supprimées ou renommées depuis la barre latérale ne sont pas touchées.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  createScreenplayElement,
  escapeScreenplayHtml,
  getDefaultSceneHeading,
  screenplayHtmlToPlainText
} from '../../lib/screenplay';

import type { WbRegistry } from '../../lib/wb-registry';

import { highlightWorldBuilding } from '../../lib/highlight';

import { ScreenplayElementEditor } from './ScreenplayElementEditor';

import type {
  FreeScreenplayHeading,
  ProjectData,
  ScreenplayConventionLanguage,
  ScreenplayElement,
  ScreenplayElementType,
  ScreenplayParagraphType,
  ScreenplayProjectData,
  ScreenplayScene,
  ScreenplaySceneHeading,
  StructuredScreenplayHeading
} from '../../../shared/types';

export const SCREENPLAY_POSITION_EVENT = 'scriptorium:screenplay-position';

/** Événement pour annuler / rétablir depuis l'extérieur (barre d'outils). Détail : 'undo' ou 'redo'. */
export const SCREENPLAY_HISTORY_EVENT = 'scriptorium:screenplay-history';

/** Frappes dans un même paragraphe séparées de moins de ce délai : une seule étape. */
const HISTORY_GROUP_MS = 1000;

/** Nombre maximal d'étapes conservées. */
const HISTORY_LIMIT = 200;

export interface ScreenplayPositionDetail {
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  elementId: string | null;
  elementIndex: number | null;
  elementCount: number;
  type: ScreenplayParagraphType;
}

export interface ScreenplayEditorProps {
  screenplay: ScreenplayProjectData;
  activeSceneId: string | null;
  zoom: number;
  nativeSpellcheck: boolean;

  /** Données du projet (fiches World Building), pour le surlignage. */
  projectData?: ProjectData;

  /** Registre des couleurs et catégories, pour le surlignage. */
  wbRegistry?: WbRegistry;

  onChange: (screenplay: ScreenplayProjectData) => void;

  onSelectScene: (sceneId: string) => void;
}

interface ParsedStructuredHeading {
  interiorExterior: StructuredScreenplayHeading['interiorExterior'];
  customInteriorExterior?: string;
  location: string;
  timeOfDay: string;
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

interface SceneSnapshot {
  id: string;
  heading: ScreenplaySceneHeading;
  elements: ScreenplayElement[];
}

type HistorySnapshot = SceneSnapshot[];

/** Photo du contenu des scènes (en-tête et paragraphes). */
function takeSnapshot(screenplay: ScreenplayProjectData): HistorySnapshot {
  return (screenplay.scenes ?? []).map((scene) => ({
    id: scene.id,
    heading: scene.heading,
    elements: scene.elements
  }));
}

/** Remet le contenu photographié dans les scènes qui existent encore. */
function applySnapshot(screenplay: ScreenplayProjectData, snapshot: HistorySnapshot): ScreenplayProjectData {
  const saved = new Map<string, SceneSnapshot>();

  snapshot.forEach((entry) => {
    saved.set(entry.id, entry);
  });

  return {
    ...screenplay,
    scenes: (screenplay.scenes ?? []).map((scene) => {
      const entry = saved.get(scene.id);

      return entry ? { ...scene, heading: entry.heading, elements: entry.elements } : scene;
    })
  };
}

/** Deux photos identiques (aucun changement entre elles). */
function sameSnapshot(a: HistorySnapshot, b: HistorySnapshot): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((entry, index) => {
    const other = b.at(index);

    return (
      !!other &&
      other.id === entry.id &&
      other.heading === entry.heading &&
      other.elements === entry.elements
    );
  });
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function dispatchScreenplayPosition(detail: ScreenplayPositionDetail | null): void {
  window.dispatchEvent(new CustomEvent(SCREENPLAY_POSITION_EVENT, { detail }));
}

function focusElementById(elementId: string, placeAtEnd = true): void {
  window.requestAnimationFrame(() => {
    const selector = '[data-screenplay-element-id="' + CSS.escape(elementId) + '"]';
    const editor = document.querySelector<HTMLElement>(selector);

    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });

    const selection = window.getSelection();

    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(!placeAtEnd);

    selection.removeAllRanges();
    selection.addRange(range);
  });
}

/**
 * Résumé des fiches utile au surlignage : identifiant, nom, alias, couleur et
 * catégorie. Change dès qu'une de ces informations change.
 */
function computeWorldSignature(projectData?: ProjectData, registry?: WbRegistry): string {
  if (!projectData || !registry) {
    return '';
  }

  const world = projectData.world || {};
  const parts: string[] = ['ready'];

  Object.keys(world)
    .sort()
    .forEach((id) => {
      const item = world[id];

      if (!item || typeof item !== 'object') {
        return;
      }

      const aliases = Array.isArray(item.aliases) ? item.aliases.join('|') : '';
      const color = String(JSON.stringify(registry.colorFor(item)));
      const label = registry.labelFor(item.wbType);

      parts.push(id + ':' + item.name + ':' + aliases + ':' + color + ':' + label);
    });

  return parts.join(String.fromCharCode(30));
}

function getHeadingText(heading: ScreenplaySceneHeading, language: ScreenplayConventionLanguage): string {
  if (heading.mode === 'free') {
    return screenplayHtmlToPlainText(heading.html);
  }

  return getDefaultSceneHeading(
    {
      interiorExterior: heading.interiorExterior,
      customInteriorExterior: heading.customInteriorExterior,
      location: heading.location,
      time: heading.timeOfDay
    },
    language
  );
}

function parseStructuredHeading(rawText: string): ParsedStructuredHeading | null {
  const normalized = rawText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  const prefixMatch = /^(INT[.][/]EXT[.]|EXT[.][/]INT[.]|INT[.]|EXT[.])\s*(.*)$/i.exec(normalized);

  let interiorExterior: StructuredScreenplayHeading['interiorExterior'] = 'OTHER';
  let customInteriorExterior: string | undefined;
  let remainder = normalized;

  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();

    if (prefix === 'INT.' || prefix === 'EXT.' || prefix === 'INT./EXT.' || prefix === 'EXT./INT.') {
      interiorExterior = prefix;
    }

    remainder = prefixMatch[2].trim();
  } else {
    const customMatch = /^([A-ZÀ-ÖØ-Ý0-9./ ]{1,20}[.])\s+(.+)$/i.exec(normalized);

    if (customMatch) {
      interiorExterior = 'OTHER';
      customInteriorExterior = customMatch[1].trim();
      remainder = customMatch[2].trim();
    }
  }

  const separatorMatch = /^(.*?)\s+(?:—|–|-)\s+(.+)$/.exec(remainder);

  const location = (separatorMatch?.[1] ?? remainder).trim();
  const timeOfDay = (separatorMatch?.[2] ?? '').trim();

  if (!location) {
    return null;
  }

  return {
    interiorExterior,
    customInteriorExterior,
    location,
    timeOfDay
  };
}

function replaceScene(
  screenplay: ScreenplayProjectData,
  sceneId: string,
  update: (scene: ScreenplayScene) => ScreenplayScene
): ScreenplayProjectData {
  return {
    ...screenplay,
    scenes: screenplay.scenes.map((scene) => (scene.id === sceneId ? update(scene) : scene))
  };
}

function replaceElement(
  scene: ScreenplayScene,
  elementId: string,
  update: (element: ScreenplayElement) => ScreenplayElement
): ScreenplayScene {
  return {
    ...scene,
    elements: scene.elements.map((element) => (element.id === elementId ? update(element) : element))
  };
}

interface SceneHeadingEditorProps {
  scene: ScreenplayScene;
  language: ScreenplayConventionLanguage;
  nativeSpellcheck: boolean;
  active: boolean;
  /** Fiches et registre des couleurs, pour le surlignage World Building. */
  projectData?: ProjectData | null;
  wbRegistry?: WbRegistry;
  /** Change quand une fiche change : le surlignage est alors relancé. */
  worldSignature: string;
  onFocus: () => void;
  onChange: (heading: ScreenplaySceneHeading) => void;
  onFocusFirstElement: () => void;
}

/** Délai du surlignage pendant la saisie de l'en-tête. */
const HEADING_HIGHLIGHT_DELAY_MS = 400;

function SceneHeadingEditor({
  scene,
  language,
  nativeSpellcheck,
  active,
  projectData,
  wbRegistry,
  worldSignature,
  onFocus,
  onChange,
  onFocusFirstElement
}: SceneHeadingEditorProps): React.ReactElement {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);

  // Version à jour des fiches, lue par la minuterie du surlignage.
  const worldRef = useRef({ projectData, wbRegistry });

  worldRef.current = { projectData, wbRegistry };

  const headingText = useMemo(() => getHeadingText(scene.heading, language), [language, scene.heading]);

  /*
   * Surlignage World Building de l'en-tête. Les marques ne sont jamais
   * enregistrées : commit() relit l'en-tête par innerText (texte seul).
   */
  const applyHighlight = useCallback((): void => {
    const editor = editorRef.current;
    const data = worldRef.current.projectData;
    const registry = worldRef.current.wbRegistry;

    if (!editor || !data || !registry) {
      return;
    }

    try {
      highlightWorldBuilding(editor, data, registry);
    } catch (error) {
      console.error('Scénario : surlignage impossible (en-tête).', error);
    }
  }, []);

  const cancelHighlightTimer = useCallback((): void => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  // Nettoyage de la minuterie quand l'en-tête disparaît.
  useEffect(() => {
    return () => {
      cancelHighlightTimer();
    };
  }, [cancelHighlightTimer]);

  /*
   * En-tête sans le focus : texte à jour, puis surlignage (à l'ouverture,
   * quand l'en-tête change de l'extérieur, ou quand une fiche change).
   */
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || focusedRef.current) {
      return;
    }

    if (editor.innerText !== headingText) {
      editor.innerText = headingText;
    }

    applyHighlight();
  }, [applyHighlight, headingText, worldSignature, projectData, wbRegistry]);

  const commit = useCallback((): void => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const text = editor.innerText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase();

    const structured = parseStructuredHeading(text);

    if (structured) {
      const nextHeading: StructuredScreenplayHeading = {
        id: scene.heading.id,
        type: 'scene-heading',
        mode: 'structured',
        interiorExterior: structured.interiorExterior,
        customInteriorExterior: structured.customInteriorExterior,
        location: structured.location,
        timeOfDay: structured.timeOfDay
      };

      onChange(nextHeading);
      return;
    }

    const nextHeading: FreeScreenplayHeading = {
      id: scene.heading.id,
      type: 'scene-heading',
      mode: 'free',
      html: escapeScreenplayHtml(text)
    };

    onChange(nextHeading);
  }, [onChange, scene.heading.id]);

  return (
    <div
      ref={editorRef}
      className={active ? 'screenplay-scene-heading active' : 'screenplay-scene-heading'}
      contentEditable
      suppressContentEditableWarning
      spellCheck={nativeSpellcheck}
      role="textbox"
      aria-label={language === 'en' ? 'Scene heading' : 'En-tête de scène'}
      data-screenplay-heading-id={scene.heading.id}
      onFocus={() => {
        focusedRef.current = true;
        onFocus();
      }}
      onBlur={() => {
        focusedRef.current = false;
        cancelHighlightTimer();
        commit();
        applyHighlight();
      }}
      onInput={() => {
        // Surlignage différé pendant la saisie (le curseur est conservé).
        cancelHighlightTimer();
        highlightTimerRef.current = window.setTimeout(() => {
          highlightTimerRef.current = null;
          applyHighlight();
        }, HEADING_HIGHLIGHT_DELAY_MS);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          onFocusFirstElement();
        }
      }}
    />
  );
}

export function ScreenplayEditor({
  screenplay,
  activeSceneId,
  zoom,
  nativeSpellcheck,
  projectData,
  wbRegistry,
  onChange,
  onSelectScene
}: ScreenplayEditorProps): React.ReactElement {
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const highlightTimerRef = useRef<number | null>(null);

  // Version la plus récente du scénario, mise à jour à chaque modification
  // (voir updateScene).
  const screenplayRef = useRef(screenplay);
  screenplayRef.current = screenplay;

  // Historique d'annulation.
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const lastGroupRef = useRef<{ key: string; time: number } | null>(null);
  const suppressHistoryRef = useRef(false);

  const scenes = screenplay.scenes ?? [];
  const language = screenplay.settings.conventionLanguage;

  /*
   * Signature des fiches, recalculée à chaque affichage (c'est une simple
   * chaîne). Les fiches et le registre ne sont retransmis aux paragraphes que
   * lorsque cette signature change : taper du texte ne relance donc pas le
   * surlignage de tous les paragraphes.
   */
  const worldSignature = computeWorldSignature(projectData, wbRegistry);

  const worldContext = useMemo(
    () => ({ projectData, wbRegistry }),
    // Volontairement limité à la signature.
    [worldSignature]
  );

  /*
   * La navigation dépend uniquement de l’identifiant de scène.
   *
   * Elle ne dépend surtout pas de `scenes`, car ce tableau change à chaque
   * frappe. L’ancienne dépendance provoquait un scroll et une animation après
   * chaque caractère.
   */
  useEffect(() => {
    if (!activeSceneId) {
      return;
    }

    const selector = '[data-screenplay-scene-id="' + CSS.escape(activeSceneId) + '"]';
    const sceneElement = document.querySelector<HTMLElement>(selector);

    if (!sceneElement) {
      return;
    }

    sceneElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    sceneElement.classList.add('navigation-highlight');

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      sceneElement.classList.remove('navigation-highlight');
      highlightTimerRef.current = null;
    }, 900);
  }, [activeSceneId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }

      dispatchScreenplayPosition(null);
    };
  }, []);

  /**
   * Applique une modification à une scène.
   * historyKey :
   * - absent : nouvelle étape d'annulation ;
   * - texte : même clé que la modification précédente, dans le délai = même étape ;
   * - null : pas d'étape (retouche automatique).
   */
  const updateScene = useCallback(
    (sceneId: string, update: (scene: ScreenplayScene) => ScreenplayScene, historyKey?: string | null): void => {
      const current = screenplayRef.current;
      const next = replaceScene(current, sceneId, update);

      if (historyKey !== null && !suppressHistoryRef.current) {
        const now = Date.now();
        const last = lastGroupRef.current;

        const merge =
          typeof historyKey === 'string' &&
          last !== null &&
          last.key === historyKey &&
          now - last.time < HISTORY_GROUP_MS;

        if (!merge) {
          undoStackRef.current.push(takeSnapshot(current));

          if (undoStackRef.current.length > HISTORY_LIMIT) {
            undoStackRef.current.shift();
          }
        }

        redoStackRef.current = [];
        lastGroupRef.current = typeof historyKey === 'string' ? { key: historyKey, time: now } : null;
      }

      // Une deuxième modification envoyée tout de suite après partira de
      // celle-ci, et non de l'ancienne version.
      screenplayRef.current = next;
      onChange(next);
    },
    [onChange]
  );

  const changeHeading = useCallback(
    (sceneId: string, heading: ScreenplaySceneHeading): void => {
      const scene = (screenplayRef.current.scenes ?? []).find((entry) => entry.id === sceneId);

      // En-tête quitté sans modification : pas d'étape d'annulation.
      const unchanged =
        !!scene && getHeadingText(scene.heading, language) === getHeadingText(heading, language);

      updateScene(sceneId, (current) => ({ ...current, heading }), unchanged ? null : undefined);
    },
    [language, updateScene]
  );

  const changeElementHtml = useCallback(
    (sceneId: string, elementId: string, html: string): void => {
      const scene = (screenplayRef.current.scenes ?? []).find((entry) => entry.id === sceneId);
      const previous = scene?.elements.find((element) => element.id === elementId);

      // Seules les balises changent (couleurs) : pas d'étape d'annulation.
      const textChanged =
        !previous || screenplayHtmlToPlainText(previous.html) !== screenplayHtmlToPlainText(html);

      updateScene(
        sceneId,
        (current) => replaceElement(current, elementId, (element) => ({ ...element, html })),
        textChanged ? 'html:' + elementId : null
      );
    },
    [updateScene]
  );

  const changeElementType = useCallback(
    (sceneId: string, elementId: string, type: ScreenplayElementType): void => {
      updateScene(sceneId, (scene) => replaceElement(scene, elementId, (element) => ({ ...element, type })));
    },
    [updateScene]
  );

  const insertElementAfter = useCallback(
    (sceneId: string, sourceElementId: string, type: ScreenplayElementType, html: string): void => {
      const newElement = createScreenplayElement({ type, html });

      // Même clé que le texte du paragraphe coupé : Entrée forme une seule
      // étape avec la coupe (sinon, annuler ferait disparaître la fin du texte).
      updateScene(
        sceneId,
        (scene) => {
          const index = scene.elements.findIndex((element) => element.id === sourceElementId);
          const nextElements = scene.elements.slice();

          nextElements.splice(index >= 0 ? index + 1 : nextElements.length, 0, newElement);

          return { ...scene, elements: nextElements };
        },
        'html:' + sourceElementId
      );

      setActiveHeadingId(null);
      setActiveElementId(newElement.id);
      focusElementById(newElement.id);
    },
    [updateScene]
  );

  const deleteElement = useCallback(
    (sceneId: string, elementId: string): void => {
      const currentScenes = screenplayRef.current.scenes ?? [];
      const scene = currentScenes.find((entry) => entry.id === sceneId);

      if (!scene) {
        return;
      }

      const index = scene.elements.findIndex((element) => element.id === elementId);

      if (index < 0) {
        return;
      }

      if (scene.elements.length === 1) {
        changeElementHtml(sceneId, elementId, '');
        changeElementType(sceneId, elementId, 'action');
        setActiveElementId(elementId);
        focusElementById(elementId, false);
        return;
      }

      const targetIndex = Math.max(0, index - 1);
      const targetElement = scene.elements.at(targetIndex) ?? scene.elements.at(0);

      updateScene(sceneId, (currentScene) => ({
        ...currentScene,
        elements: currentScene.elements.filter((element) => element.id !== elementId)
      }));

      setActiveHeadingId(null);

      if (targetElement) {
        setActiveElementId(targetElement.id);
        focusElementById(targetElement.id);
      }
    },
    [changeElementHtml, changeElementType, updateScene]
  );

  /** Annule ou rétablit la dernière étape. */
  const performHistory = useCallback(
    (direction: 'undo' | 'redo'): void => {
      const active = document.activeElement;
      const activeHtml = active instanceof HTMLElement ? active : null;
      const insideEditor = !!activeHtml && !!activeHtml.closest('.screenplay-editor');
      const focusId = insideEditor && activeHtml ? activeHtml.dataset.screenplayElementId ?? null : null;
      const inHeading = insideEditor && !!activeHtml && !!activeHtml.dataset.screenplayHeadingId;

      const sourceLength = direction === 'undo' ? undoStackRef.current.length : redoStackRef.current.length;

      // Rien à faire (un en-tête en cours de modification peut encore créer une étape).
      if (sourceLength === 0 && !inHeading) {
        return;
      }

      // On quitte d'abord la zone active : elle enregistre son contenu et pourra
      // être réaffichée. Pour un paragraphe, ses retouches automatiques
      // (majuscules, couleurs) ne créent pas d'étape.
      if (insideEditor && activeHtml) {
        suppressHistoryRef.current = focusId !== null;

        try {
          activeHtml.blur();
        } finally {
          suppressHistoryRef.current = false;
        }
      }

      const from = direction === 'undo' ? undoStackRef.current : redoStackRef.current;
      const to = direction === 'undo' ? redoStackRef.current : undoStackRef.current;

      const current = screenplayRef.current;
      const currentSnapshot = takeSnapshot(current);

      // On saute les étapes qui ne changeraient rien.
      let snapshot = from.pop();

      while (snapshot && sameSnapshot(snapshot, currentSnapshot)) {
        snapshot = from.pop();
      }

      if (snapshot) {
        to.push(currentSnapshot);
        lastGroupRef.current = null;

        const next = applySnapshot(current, snapshot);
        screenplayRef.current = next;
        onChange(next);
      }

      if (focusId) {
        focusElementById(focusId);
      }
    },
    [onChange]
  );

  /** Ctrl+Z, Ctrl+Y et Ctrl+Maj+Z dans le scénario. */
  const handleHistoryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsUndo = key === 'z' && !event.shiftKey;
      const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey);

      if (!wantsUndo && !wantsRedo) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      performHistory(wantsUndo ? 'undo' : 'redo');
    },
    [performHistory]
  );

  // Annuler / rétablir demandé de l'extérieur (barre d'outils).
  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;

      if (detail === 'undo' || detail === 'redo') {
        performHistory(detail);
      }
    };

    window.addEventListener(SCREENPLAY_HISTORY_EVENT, listener);

    return () => {
      window.removeEventListener(SCREENPLAY_HISTORY_EVENT, listener);
    };
  }, [performHistory]);

  const selectHeading = useCallback(
    (scene: ScreenplayScene, sceneIndex: number): void => {
      onSelectScene(scene.id);
      setActiveElementId(null);
      setActiveHeadingId(scene.heading.id);

      dispatchScreenplayPosition({
        sceneId: scene.id,
        sceneIndex,
        sceneCount: scenes.length,
        elementId: null,
        elementIndex: null,
        elementCount: scene.elements.length,
        type: 'scene-heading'
      });
    },
    [onSelectScene, scenes.length]
  );

  const selectElement = useCallback(
    (scene: ScreenplayScene, sceneIndex: number, element: ScreenplayElement, elementIndex: number): void => {
      onSelectScene(scene.id);
      setActiveHeadingId(null);
      setActiveElementId(element.id);

      dispatchScreenplayPosition({
        sceneId: scene.id,
        sceneIndex,
        sceneCount: scenes.length,
        elementId: element.id,
        elementIndex,
        elementCount: scene.elements.length,
        type: element.type
      });
    },
    [onSelectScene, scenes.length]
  );

  if (scenes.length === 0) {
    return (
      <div className="screenplay-empty-state">
        <span className="screenplay-empty-state-icon" aria-hidden="true">
          🎬
        </span>

        <h3>{language === 'en' ? 'No scenes' : 'Aucune scène'}</h3>

        <p>
          {language === 'en'
            ? 'Create a scene from the sidebar to begin the screenplay.'
            : 'Créez une scène depuis la barre latérale pour commencer le scénario.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="screenplay-editor"
      data-page-format={screenplay.settings.pageFormat}
      data-convention-language={language}
      data-bold-scene-headings={screenplay.settings.boldSceneHeadings ? 'true' : 'false'}
      style={{ zoom }}
      onKeyDown={handleHistoryKeyDown}
    >
      <div className="screenplay-document">
        {scenes.map((scene, sceneIndex) => {
          const firstElement = scene.elements.at(0);
          const sceneClassName = activeSceneId === scene.id ? 'screenplay-scene active' : 'screenplay-scene';

          return (
            <section key={scene.id} className={sceneClassName} data-screenplay-scene-id={scene.id}>
              <SceneHeadingEditor
                scene={scene}
                language={language}
                nativeSpellcheck={nativeSpellcheck}
                projectData={worldContext.projectData}
                wbRegistry={worldContext.wbRegistry}
                worldSignature={worldSignature}
                active={activeHeadingId === scene.heading.id}
                onFocus={() => {
                  selectHeading(scene, sceneIndex);
                }}
                onChange={(heading) => {
                  changeHeading(scene.id, heading);
                }}
                onFocusFirstElement={() => {
                  if (!firstElement) {
                    return;
                  }

                  selectElement(scene, sceneIndex, firstElement, 0);
                  focusElementById(firstElement.id, true);
                }}
              />

              <div className="screenplay-scene-elements">
                {scene.elements.map((element, elementIndex) => (
                  <ScreenplayElementEditor
                    key={element.id}
                    element={element}
                    conventionLanguage={language}
                    enableShotElement={screenplay.settings.enableShotElement}
                    active={activeElementId === element.id}
                    projectData={worldContext.projectData}
                    wbRegistry={worldContext.wbRegistry}
                    worldSignature={worldSignature}
                    onFocus={() => {
                      selectElement(scene, sceneIndex, element, elementIndex);
                    }}
                    onChangeHtml={(elementId, html) => {
                      changeElementHtml(scene.id, elementId, html);
                    }}
                    onChangeType={(elementId, type) => {
                      changeElementType(scene.id, elementId, type);
                    }}
                    onInsertAfter={(elementId, type, html) => {
                      insertElementAfter(scene.id, elementId, type, html);
                    }}
                    onDelete={(elementId) => {
                      deleteElement(scene.id, elementId);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
