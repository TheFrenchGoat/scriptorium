import { SCREENPLAY_HISTORY_EVENT } from './ScreenplayEditor';
// src/renderer/components/editor/Toolbar.tsx
//
// Barre d’outils commune aux romans et aux scénarios.
//
// En mode roman :
// - police ;
// - taille ;
// - gras, italique, souligné ;
// - couleur ;
// - caractères spéciaux ;
// - alignement.
//
// En mode scénario :
// - type du paragraphe actif ;
// - gras, italique, souligné ;
// - couleur ;
// - caractères spéciaux.
//
// Les réglages de police, de taille et d’alignement sont volontairement
// masqués en mode scénario afin de préserver sa mise en page normalisée.
//
// La commande de couleur (bouton A + panneau ▾) est dans TextColorControl.
// Chaque couleur appliquée est marquée data-user-color : le nettoyage des
// couleurs parasites de Chromium ne la retire donc jamais.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  getAvailableScreenplayElementTypes,
  getScreenplayElementLabel
} from '../../lib/screenplay';
import {
  USER_COLOR_ATTRIBUTE,
  getSelectedTextParts,
  isInsideWorldBuildingMention,
  removeTextColorFromSelection,
  stripAutomaticTextColors
} from '../../lib/text-color';
import { Dropdown, DropdownItem } from '../common/Dropdown';
import { TextColorControl } from './TextColorControl';
import { useEditorStatus } from './editor-status';
import type { EditorController } from './useEditorController';
import type {
  ScreenplayElementType,
  ScreenplayParagraphType
} from '../../../shared/types';

export interface ToolbarProps {
  controller: EditorController;
  onOpenGlobalSearch: () => void;
  onOpenReplace: () => void;
}

interface FontChoice {
  label: string;
  css: string;
}

interface SelectionFormatting {
  fontFamily: string;
  fontSize: number | null;
  fontMixed: boolean;
  sizeMixed: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface ActiveScreenplayElement {
  id: string;
  type: ScreenplayElementType;
  editable: HTMLElement | null;
}

interface InlineStyleOptions {
  skipWorldBuilding?: boolean;
  attributes?: Record<string, string>;
}

const FONTS: FontChoice[] = [
  { label: 'Roboto', css: "'Roboto', sans-serif" },
  { label: 'Arial', css: 'Arial, sans-serif' },
  { label: 'Georgia', css: 'Georgia, serif' },
  { label: 'Times New Roman', css: "'Times New Roman', serif" },
  { label: 'Courier New', css: "'Courier New', monospace" },
  { label: 'Verdana', css: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', css: "'Trebuchet MS', sans-serif" },
  { label: 'Merriweather', css: "'Merriweather', serif" }
];

const SPECIAL_CHARACTERS = [
  'À', 'Â', 'Ä', 'Ç', 'É', 'È', 'Ê', 'Ë', 'Î', 'Ï', 'Ô', 'Ö', 'Ù', 'Û', 'Ü',
  'Ÿ', 'Æ', 'Œ', 'à', 'â', 'ä', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ö',
  'ù', 'û', 'ü', 'ÿ', 'æ', 'œ', '«', '»', '—', '…', '’', '“', '”'
];

const SCREENPLAY_ELEMENT_TYPES: readonly ScreenplayElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
];

const SCREENPLAY_ROOT_SELECTOR =
  '.screenplay-element-content, .screenplay-scene-heading';

const DEFAULT_FONT = 'Roboto';
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 96;

// ---------------------------------------------------------------------------
// RECHERCHE DES ÉLÉMENTS D’ÉDITION
// ---------------------------------------------------------------------------

function getNovelEditor(): HTMLElement | null {
  const editor = document.getElementById('editor');
  return editor instanceof HTMLElement ? editor : null;
}

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  if (node instanceof HTMLElement) {
    return node;
  }

  return node.parentElement;
}

function isScreenplayElementType(
  value: string | undefined
): value is ScreenplayElementType {
  return SCREENPLAY_ELEMENT_TYPES.includes(value as ScreenplayElementType);
}

/** Retourne le contentEditable auquel appartient une sélection. */
function getWritingRootForRange(range: Range): HTMLElement | null {
  const novelEditor = getNovelEditor();

  if (
    novelEditor &&
    novelEditor.contains(range.startContainer) &&
    novelEditor.contains(range.endContainer)
  ) {
    return novelEditor;
  }

  const startElement = getElementFromNode(range.startContainer);
  const endElement = getElementFromNode(range.endContainer);

  if (!startElement || !endElement) {
    return null;
  }

  const screenplayRoot =
    startElement.closest<HTMLElement>(SCREENPLAY_ROOT_SELECTOR);

  if (!screenplayRoot) {
    return null;
  }

  const endBelongsToRoot =
    endElement === screenplayRoot || screenplayRoot.contains(endElement);

  return endBelongsToRoot ? screenplayRoot : null;
}

function getCurrentWritingRoot(): HTMLElement | null {
  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0) {
    const root = getWritingRootForRange(selection.getRangeAt(0));

    if (root) {
      return root;
    }
  }

  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement) {
    if (activeElement.id === 'editor') {
      return activeElement;
    }

    const screenplayEditable =
      activeElement.closest<HTMLElement>(SCREENPLAY_ROOT_SELECTOR);

    if (screenplayEditable) {
      return screenplayEditable;
    }
  }

  return null;
}

function rangeBelongsToRoot(range: Range, root: HTMLElement): boolean {
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

/** Recherche l’élément de scénario associé à la sélection ou au focus. */
function getActiveScreenplayElement(): ActiveScreenplayElement | null {
  const selection = window.getSelection();
  let sourceElement: HTMLElement | null = null;

  if (selection && selection.rangeCount > 0) {
    sourceElement = getElementFromNode(selection.anchorNode);
  }

  if (!sourceElement && document.activeElement instanceof HTMLElement) {
    sourceElement = document.activeElement;
  }

  const wrapper = sourceElement?.closest<HTMLElement>(
    '[data-screenplay-element-id]'
  );

  if (!wrapper) {
    return null;
  }

  const id = wrapper.dataset.screenplayElementId;

  if (!id) {
    return null;
  }

  let type = wrapper.dataset.screenplayElementType;

  // Certains composants posent le type sur le contentEditable plutôt que
  // sur son conteneur. On vérifie donc également l’enfant éditable.
  const editable = wrapper.matches('.screenplay-element-content')
    ? wrapper
    : wrapper.querySelector<HTMLElement>('.screenplay-element-content');

  if (!isScreenplayElementType(type)) {
    type = editable?.dataset.screenplayElementType;
  }

  if (!isScreenplayElementType(type)) {
    return null;
  }

  return { id, type, editable };
}

function isSceneHeadingFocused(): boolean {
  const selection = window.getSelection();

  const sourceElement = selection?.anchorNode
    ? getElementFromNode(selection.anchorNode)
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  return Boolean(sourceElement?.closest('.screenplay-scene-heading'));
}

// ---------------------------------------------------------------------------
// MESURE ET APPLICATION DE LA MISE EN FORME
// ---------------------------------------------------------------------------

function normalizeFontFamily(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getReadableFontName(fontFamily: string): string {
  const normalized = normalizeFontFamily(fontFamily);

  const exactChoice = FONTS.find(
    (font) => normalizeFontFamily(font.css) === normalized
  );

  if (exactChoice) {
    return exactChoice.label;
  }

  const firstFont = fontFamily.split(',')[0]?.replace(/["']/g, '').trim();

  return firstFont || DEFAULT_FONT;
}

function parseFontSize(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

/** Applique un style CSS directement aux portions de texte sélectionnées. */
function applyInlineStyleToSelection(
  root: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
  options?: InlineStyleOptions
): boolean {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const sourceRange = selection.getRangeAt(0);

  if (sourceRange.collapsed || !rangeBelongsToRoot(sourceRange, root)) {
    return false;
  }

  let parts = getSelectedTextParts(sourceRange, root);

  if (options?.skipWorldBuilding) {
    parts = parts.filter((part) => !isInsideWorldBuildingMention(part.textNode));
  }

  if (parts.length === 0) {
    return false;
  }

  const insertedSpans: HTMLSpanElement[] = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];

    if (!part.textNode.isConnected) {
      continue;
    }

    const partRange = document.createRange();

    try {
      partRange.setStart(part.textNode, part.startOffset);
      partRange.setEnd(part.textNode, part.endOffset);
    } catch {
      continue;
    }

    const selectedContent = partRange.extractContents();
    const span = document.createElement('span');

    Object.assign(span.style, styles);

    if (options?.attributes) {
      Object.entries(options.attributes).forEach(([name, value]) => {
        span.setAttribute(name, value);
      });
    }

    span.appendChild(selectedContent);
    partRange.insertNode(span);
    insertedSpans.unshift(span);
  }

  if (insertedSpans.length === 0) {
    return false;
  }

  const restoredRange = document.createRange();
  restoredRange.setStartBefore(insertedSpans[0]);
  restoredRange.setEndAfter(insertedSpans[insertedSpans.length - 1]);

  selection.removeAllRanges();
  selection.addRange(restoredRange);

  return true;
}

function getSelectionFormatting(root: HTMLElement): SelectionFormatting | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!rangeBelongsToRoot(range, root)) {
    return null;
  }

  const fontFamilies = new Set<string>();
  const fontSizes = new Set<number>();
  let firstComputedStyle: CSSStyleDeclaration | null = null;

  if (!range.collapsed) {
    for (const part of getSelectedTextParts(range, root)) {
      const element = getElementFromNode(part.textNode);

      if (!element) {
        continue;
      }

      const computedStyle = window.getComputedStyle(element);

      if (!firstComputedStyle) {
        firstComputedStyle = computedStyle;
      }

      fontFamilies.add(getReadableFontName(computedStyle.fontFamily));

      const size = parseFontSize(computedStyle.fontSize);

      if (size !== null) {
        fontSizes.add(size);
      }
    }
  }

  if (!firstComputedStyle) {
    const element = getElementFromNode(selection.anchorNode) ?? root;
    const computedStyle = window.getComputedStyle(element);

    firstComputedStyle = computedStyle;
    fontFamilies.add(getReadableFontName(computedStyle.fontFamily));

    const size = parseFontSize(computedStyle.fontSize);

    if (size !== null) {
      fontSizes.add(size);
    }
  }

  const style: CSSStyleDeclaration = firstComputedStyle;
  const fontValues = Array.from(fontFamilies);
  const sizeValues = Array.from(fontSizes);
  const decoration = style.textDecorationLine || style.textDecoration || '';
  const numericWeight = Number.parseInt(style.fontWeight, 10);

  return {
    fontFamily: fontValues[0] ?? DEFAULT_FONT,
    fontSize: sizeValues[0] ?? DEFAULT_FONT_SIZE,
    fontMixed: fontValues.length > 1,
    sizeMixed: sizeValues.length > 1,
    bold:
      style.fontWeight === 'bold' ||
      (!Number.isNaN(numericWeight) && numericWeight >= 600),
    italic: style.fontStyle === 'italic',
    underline: decoration.includes('underline')
  };
}

// ---------------------------------------------------------------------------
// ICÔNES
// ---------------------------------------------------------------------------

function AlignIcon({ path }: { path: string }): React.ReactElement {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 18 18" fill="none">
      <path d={path} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const ALIGN_LEFT_PATH = 'M2 3.5H16M2 7.2H11.5M2 10.8H16M2 14.5H10';
const ALIGN_CENTER_PATH = 'M2 3.5H16M4.5 7.2H13.5M2 10.8H16M5 14.5H13';
const ALIGN_RIGHT_PATH = 'M2 3.5H16M6.5 7.2H16M2 10.8H16M8 14.5H16';
const ALIGN_JUSTIFY_PATH = 'M2 3.5H16M2 7.2H16M2 10.8H16M2 14.5H16';

// ---------------------------------------------------------------------------
// COMPOSANT
// ---------------------------------------------------------------------------

export function Toolbar({
  controller,
  onOpenGlobalSearch,
  onOpenReplace
}: ToolbarProps): React.ReactElement {
  const { t, lang } = useI18n();
  const status = useEditorStatus(controller.status);

  const data = controller.data();
  const screenplay = data.screenplay;
  const activeTab = controller.activeTab();

  const isScreenplayMode =
    controller.isScreenplayProject() &&
    controller.activeType() === 'scene' &&
    Boolean(screenplay);

  const screenplayLanguage =
    screenplay?.settings.conventionLanguage ?? (lang === 'en' ? 'en' : 'fr');

  const availableScreenplayTypes = useMemo(
    () =>
      screenplay ? getAvailableScreenplayElementTypes(screenplay.settings) : [],
    [screenplay]
  );

  const savedRangeRef = useRef<Range | null>(null);
  const activeScreenplayElementIdRef = useRef<string | null>(null);

  /**
   * Couleur choisie avec un simple curseur (sans sélection) : Chromium crée
   * l’élément coloré lui-même pendant la frappe. Le nettoyage le reconnaît
   * grâce à cette couleur et le marque comme choix de l’utilisateur.
   */
  const pendingUserColorRef = useRef<string | null>(null);

  const [activeScreenplayParagraphType, setActiveScreenplayParagraphType] =
    useState<ScreenplayParagraphType>('action');

  const [formatting, setFormatting] = useState<SelectionFormatting>({
    fontFamily: DEFAULT_FONT,
    fontSize: DEFAULT_FONT_SIZE,
    fontMixed: false,
    sizeMixed: false,
    bold: false,
    italic: false,
    underline: false
  });

  const [sizeDraft, setSizeDraft] = useState(String(DEFAULT_FONT_SIZE));

  // -----------------------------------------------------------------------
  // SÉLECTION
  // -----------------------------------------------------------------------

  const refreshScreenplayElement = useCallback((): void => {
    if (!isScreenplayMode) {
      activeScreenplayElementIdRef.current = null;
      return;
    }

    if (isSceneHeadingFocused()) {
      activeScreenplayElementIdRef.current = null;
      setActiveScreenplayParagraphType('scene-heading');
      return;
    }

    const active = getActiveScreenplayElement();

    if (!active) {
      return;
    }

    activeScreenplayElementIdRef.current = active.id;
    setActiveScreenplayParagraphType(active.type);
  }, [isScreenplayMode]);

  const rememberCurrentSelection = useCallback((): void => {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!getWritingRootForRange(range)) {
      return;
    }

    savedRangeRef.current = range.cloneRange();
    refreshScreenplayElement();
  }, [refreshScreenplayElement]);

  const restoreSavedSelection = useCallback((): boolean => {
    const range = savedRangeRef.current;

    if (
      !range ||
      !range.startContainer.isConnected ||
      !range.endContainer.isConnected
    ) {
      return false;
    }

    const root = getWritingRootForRange(range);
    const selection = window.getSelection();

    if (!root || !selection) {
      return false;
    }

    root.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  }, []);

  const refreshFormatting = useCallback((): void => {
    const root = getCurrentWritingRoot();

    if (!root) {
      return;
    }

    const next = getSelectionFormatting(root);

    if (!next) {
      return;
    }

    setFormatting(next);

    if (!isScreenplayMode) {
      setSizeDraft(
        next.sizeMixed || next.fontSize === null ? '' : String(next.fontSize)
      );
    }
  }, [isScreenplayMode]);

  const scheduleRefresh = useCallback((): void => {
    window.setTimeout(() => {
      rememberCurrentSelection();
      refreshFormatting();
    }, 0);
  }, [refreshFormatting, rememberCurrentSelection]);

  useEffect(() => {
    const update = (): void => {
      rememberCurrentSelection();
      refreshFormatting();
      refreshScreenplayElement();
    };

    document.addEventListener('selectionchange', update);
    document.addEventListener('focusin', update, true);
    document.addEventListener('keyup', update, true);
    document.addEventListener('mouseup', update, true);

    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('focusin', update, true);
      document.removeEventListener('keyup', update, true);
      document.removeEventListener('mouseup', update, true);
    };
  }, [refreshFormatting, refreshScreenplayElement, rememberCurrentSelection]);

  /**
   * Retire les couleurs parasites ajoutées par Chromium (couleur du thème ou
   * d’une mention recopiée sur du texte ordinaire). Les couleurs choisies par
   * l’utilisateur (data-user-color) ne sont jamais touchées. Exécuté à
   * l’ouverture du chapitre puis après chaque pause de frappe ; seuls des
   * attributs sont modifiés, le curseur ne bouge pas.
   */
  useEffect(() => {
    pendingUserColorRef.current = null;

    if (isScreenplayMode) {
      return;
    }

    let timer: number | null = null;

    const clean = (): void => {
      timer = null;
      const editor = getNovelEditor();

      if (editor) {
        stripAutomaticTextColors(editor, {
          adoptColor: pendingUserColorRef.current
        });
      }
    };

    const schedule = (delay: number): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(clean, delay);
    };

    const onInput = (event: Event): void => {
      const target = event.target;

      if (target instanceof HTMLElement && target.id === 'editor') {
        schedule(150);
      }
    };

    document.addEventListener('input', onInput, true);
    schedule(50);

    return () => {
      document.removeEventListener('input', onInput, true);

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, isScreenplayMode]);

  /**
   * Signale au contentEditable de scénario qu’une modification directe du DOM
   * vient d’être réalisée.
   */
  const notifyScreenplayInput = useCallback(
    (root: HTMLElement | null): void => {
      if (!isScreenplayMode || !root) {
        return;
      }

      root.dispatchEvent(new Event('input', { bubbles: true }));
      controller.updateStats();
    },
    [controller, isScreenplayMode]
  );

  const finalizeCustomFormatting = useCallback(
    (root?: HTMLElement | null): void => {
      if (isScreenplayMode) {
        notifyScreenplayInput(root ?? getCurrentWritingRoot());
      } else {
        controller.handleInput();
      }

      rememberCurrentSelection();
      refreshFormatting();
      document.dispatchEvent(new Event('selectionchange'));
    },
    [
      controller,
      isScreenplayMode,
      notifyScreenplayInput,
      refreshFormatting,
      rememberCurrentSelection
    ]
  );

  const runCommand = useCallback(
    (command: string, value?: string): void => {
      restoreSavedSelection();

      const root = getCurrentWritingRoot();

      controller.format(command, value);

      if (isScreenplayMode) {
        notifyScreenplayInput(root);
      }

      scheduleRefresh();
    },
    [
      controller,
      isScreenplayMode,
      notifyScreenplayInput,
      restoreSavedSelection,
      scheduleRefresh
    ]
  );

  // -----------------------------------------------------------------------
  // POLICE ET TAILLE — ROMAN UNIQUEMENT
  // -----------------------------------------------------------------------

  const applyFontFamily = useCallback(
    (font: FontChoice): void => {
      restoreSavedSelection();

      const editor = getNovelEditor();
      const selection = window.getSelection();

      if (!editor || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (!rangeBelongsToRoot(range, editor)) {
        return;
      }

      if (range.collapsed) {
        controller.setFontFamily(font.css);
        scheduleRefresh();
        return;
      }

      if (applyInlineStyleToSelection(editor, { fontFamily: font.css })) {
        finalizeCustomFormatting(editor);
      }
    },
    [controller, finalizeCustomFormatting, restoreSavedSelection, scheduleRefresh]
  );

  const applyFontSize = useCallback(
    (requestedSize: number): void => {
      if (!Number.isFinite(requestedSize)) {
        return;
      }

      const size = clampFontSize(Math.round(requestedSize));

      setSizeDraft(String(size));
      restoreSavedSelection();

      const editor = getNovelEditor();
      const selection = window.getSelection();

      if (!editor || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (!rangeBelongsToRoot(range, editor)) {
        return;
      }

      if (range.collapsed) {
        controller.setFontSizePx(size);
        scheduleRefresh();
        return;
      }

      if (applyInlineStyleToSelection(editor, { fontSize: `${size}px` })) {
        finalizeCustomFormatting(editor);
      }
    },
    [controller, finalizeCustomFormatting, restoreSavedSelection, scheduleRefresh]
  );

  const changeFontSize = (amount: number): void => {
    const parsed = Number.parseInt(sizeDraft, 10);
    const current = Number.isFinite(parsed)
      ? parsed
      : formatting.fontSize ?? DEFAULT_FONT_SIZE;

    applyFontSize(current + amount);
  };

  const resetSizeDraft = (): void => {
    setSizeDraft(
      formatting.sizeMixed
        ? ''
        : String(formatting.fontSize ?? DEFAULT_FONT_SIZE)
    );
  };

  const commitSizeDraft = (): void => {
    const parsed = Number.parseInt(sizeDraft, 10);

    if (!Number.isFinite(parsed)) {
      resetSizeDraft();
      return;
    }

    applyFontSize(parsed);
  };

  // -----------------------------------------------------------------------
  // TYPE DE PARAGRAPHE — SCÉNARIO UNIQUEMENT
  // -----------------------------------------------------------------------

  const changeScreenplayElementType = useCallback(
    (type: ScreenplayElementType): void => {
      if (!screenplay || !isScreenplayMode) {
        return;
      }

      restoreSavedSelection();

      const currentElement = getActiveScreenplayElement();
      const elementId =
        currentElement?.id ?? activeScreenplayElementIdRef.current;

      if (!elementId) {
        return;
      }

      let changed = false;

      const nextScreenplay = {
        ...screenplay,
        scenes: screenplay.scenes.map((scene) => {
          const containsElement = scene.elements.some(
            (element) => element.id === elementId
          );

          if (!containsElement) {
            return scene;
          }

          changed = true;

          return {
            ...scene,
            elements: scene.elements.map((element) =>
              element.id === elementId ? { ...element, type } : element
            )
          };
        })
      };

      if (!changed) {
        return;
      }

      controller.updateScreenplay(nextScreenplay);
      setActiveScreenplayParagraphType(type);
      activeScreenplayElementIdRef.current = elementId;

      window.requestAnimationFrame(() => {
        const escapedId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(elementId)
            : elementId.replace(/"/g, '\\"');

        const wrapper = document.querySelector<HTMLElement>(
          `[data-screenplay-element-id="${escapedId}"]`
        );

        const editable = wrapper?.matches('.screenplay-element-content')
          ? wrapper
          : wrapper?.querySelector<HTMLElement>('.screenplay-element-content');

        editable?.focus({ preventScroll: true });
        rememberCurrentSelection();
        refreshFormatting();
      });
    },
    [
      controller,
      isScreenplayMode,
      refreshFormatting,
      rememberCurrentSelection,
      restoreSavedSelection,
      screenplay
    ]
  );

  // -----------------------------------------------------------------------
  // COULEUR
  // -----------------------------------------------------------------------

  const applyTextColor = useCallback(
    (color: string): void => {
      restoreSavedSelection();

      const root = getCurrentWritingRoot();
      const selection = window.getSelection();

      if (!root || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (!rangeBelongsToRoot(range, root)) {
        return;
      }

      const skipWorldBuilding = !isScreenplayMode;

      // Curseur simple : la couleur s’appliquera au texte tapé ensuite.
      if (range.collapsed) {
        if (skipWorldBuilding && isInsideWorldBuildingMention(range.startContainer)) {
          return;
        }

        pendingUserColorRef.current = color;
        controller.format('foreColor', color);

        if (isScreenplayMode) {
          notifyScreenplayInput(root);
        }

        scheduleRefresh();
        return;
      }

      pendingUserColorRef.current = null;

      // On retire d’abord l’ancienne couleur : évite l’empilement de <span>
      // colorés à chaque changement de couleur.
      const removed = removeTextColorFromSelection(root, { skipWorldBuilding });
      const applied = applyInlineStyleToSelection(
        root,
        { color },
        {
          skipWorldBuilding,
          attributes: { [USER_COLOR_ATTRIBUTE]: 'true' }
        }
      );

      if (removed || applied) {
        finalizeCustomFormatting(root);
      }
    },
    [
      controller,
      finalizeCustomFormatting,
      isScreenplayMode,
      notifyScreenplayInput,
      restoreSavedSelection,
      scheduleRefresh
    ]
  );

  /** Rend au texte sélectionné la couleur du thème. */
  const applyAutomaticTextColor = useCallback((): void => {
    pendingUserColorRef.current = null;
    restoreSavedSelection();

    const root = getCurrentWritingRoot();
    const selection = window.getSelection();

    if (!root || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (range.collapsed || !rangeBelongsToRoot(range, root)) {
      return;
    }

    if (
      removeTextColorFromSelection(root, {
        skipWorldBuilding: !isScreenplayMode
      })
    ) {
      finalizeCustomFormatting(root);
    }
  }, [finalizeCustomFormatting, isScreenplayMode, restoreSavedSelection]);

  // -----------------------------------------------------------------------
  // CARACTÈRES SPÉCIAUX
  // -----------------------------------------------------------------------

  const insertSpecialCharacter = useCallback(
    (character: string): void => {
      restoreSavedSelection();
      controller.insertText(character);
      scheduleRefresh();
    },
    [controller, restoreSavedSelection, scheduleRefresh]
  );

  // -----------------------------------------------------------------------
  // RENDU
  // -----------------------------------------------------------------------

  const fontButtonLabel = formatting.fontMixed
    ? 'Mixte'
    : formatting.fontFamily || DEFAULT_FONT;

  const screenplayTypeLabel = getScreenplayElementLabel(
    activeScreenplayParagraphType,
    screenplayLanguage
  );

  const isEnglish = lang === 'en';

  const preventFocusLoss = (event: React.MouseEvent): void => {
    event.preventDefault();
  };

  return (
    <div
      className={`toolbar${isScreenplayMode ? ' screenplay-toolbar' : ''}`}
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement;

        if (target.closest('button, .dropdown-item, input')) {
          rememberCurrentSelection();
        }
      }}
    >
      <button
        type="button"
        title={t('undoTitle')}
        disabled={!isScreenplayMode && !status.canUndo}
        onMouseDown={preventFocusLoss}
                onClick={() => {
          if (isScreenplayMode) {
            window.dispatchEvent(
              new CustomEvent(
                SCREENPLAY_HISTORY_EVENT,
                { detail: 'undo' }
              )
            );
            return;
          }

          controller.undo();
        }}
      >
        ↶
      </button>

      <button
        type="button"
        title={t('redoTitle')}
        disabled={!isScreenplayMode && !status.canRedo}
        onMouseDown={preventFocusLoss}
                onClick={() => {
          if (isScreenplayMode) {
            window.dispatchEvent(
              new CustomEvent(
                SCREENPLAY_HISTORY_EVENT,
                { detail: 'redo' }
              )
            );
            return;
          }

          controller.redo();
        }}
      >
        ↷
      </button>

      <span className="toolbar-separator" aria-hidden="true" />

      {isScreenplayMode && (
        <>
          <Dropdown
            label={
              <span
                title={screenplayTypeLabel}
                style={{
                  display: 'block',
                  width: 150,
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left'
                }}
              >
                {screenplayTypeLabel}
              </span>
            }
            buttonClassName="dropdown-btn screenplay-type-button"
            buttonTitle={isEnglish ? 'Paragraph type' : 'Type de paragraphe'}
            containerStyle={{
              width: 182,
              minWidth: 182,
              maxWidth: 182,
              flex: '0 0 182px'
            }}
            menuStyle={{ minWidth: 220 }}
          >
            {(close) => (
              <>
                {availableScreenplayTypes.map((type) => (
                  <DropdownItem
                    key={type}
                    preserveSelection
                    onSelect={() => {
                      changeScreenplayElementType(type);
                      close();
                    }}
                  >
                    {getScreenplayElementLabel(type, screenplayLanguage)}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>

          <span className="toolbar-separator" aria-hidden="true" />
        </>
      )}

      <button
        type="button"
        className={formatting.bold ? 'active' : undefined}
        title={t('boldTitle')}
        onMouseDown={preventFocusLoss}
        onClick={() => runCommand('bold')}
      >
        <strong>B</strong>
      </button>

      <button
        type="button"
        className={formatting.italic ? 'active' : undefined}
        title={t('italicTitle')}
        onMouseDown={preventFocusLoss}
        onClick={() => runCommand('italic')}
      >
        <em>I</em>
      </button>

      <button
        type="button"
        className={formatting.underline ? 'active' : undefined}
        title={t('underlineTitle')}
        onMouseDown={preventFocusLoss}
        onClick={() => runCommand('underline')}
      >
        <u>U</u>
      </button>

      <span className="toolbar-separator" aria-hidden="true" />

      {!isScreenplayMode && (
        <>
          <Dropdown
            label={
              <span
                title={fontButtonLabel}
                style={{
                  display: 'block',
                  width: 110,
                  maxWidth: 110,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left'
                }}
              >
                {fontButtonLabel}
              </span>
            }
            buttonClassName="dropdown-btn toolbar-font-button"
            buttonTitle={fontButtonLabel}
            containerStyle={{
              width: 142,
              minWidth: 142,
              maxWidth: 142,
              flex: '0 0 142px'
            }}
            menuStyle={{ minWidth: 190 }}
          >
            {(close) => (
              <>
                {FONTS.map((font) => (
                  <DropdownItem
                    key={font.css}
                    preserveSelection
                    style={{ fontFamily: font.css }}
                    onSelect={() => {
                      applyFontFamily(font);
                      close();
                    }}
                  >
                    {font.label}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>

          <div
            className="toolbar-font-size-control"
            style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}
          >
            <button
              type="button"
              aria-label="Réduire la taille"
              title="Réduire la taille"
              onMouseDown={preventFocusLoss}
              onClick={() => changeFontSize(-1)}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              −
            </button>

            <input
              type="text"
              inputMode="numeric"
              aria-label={t('sizeDropdown')}
              title={
                formatting.sizeMixed
                  ? 'Mixte'
                  : `${formatting.fontSize ?? DEFAULT_FONT_SIZE} px`
              }
              placeholder={formatting.sizeMixed ? 'Mixte' : undefined}
              value={sizeDraft}
              onChange={(event) => {
                const value = event.target.value;

                if (value === '' || /^\d{0,2}$/.test(value)) {
                  setSizeDraft(value);
                }
              }}
              onFocus={() => rememberCurrentSelection()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitSizeDraft();
                  event.currentTarget.blur();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  resetSizeDraft();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => commitSizeDraft()}
              style={{
                width: 46,
                minWidth: 46,
                height: 30,
                boxSizing: 'border-box',
                padding: '0 4px',
                textAlign: 'center',
                borderRadius: 0
              }}
            />

            <button
              type="button"
              aria-label="Augmenter la taille"
              title="Augmenter la taille"
              onMouseDown={preventFocusLoss}
              onClick={() => changeFontSize(1)}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              +
            </button>
          </div>
        </>
      )}

      <TextColorControl
        lang={lang}
        onApplyColor={applyTextColor}
        onApplyAutomatic={applyAutomaticTextColor}
      />

      <Dropdown
        label={t('specialCharsBtn')}
        buttonTitle={t('specialCharsBtnTitle')}
        menuStyle={{ width: 244, padding: 8 }}
      >
        {(close) => (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4
            }}
          >
            {SPECIAL_CHARACTERS.map((character, index) => (
              <DropdownItem
                key={`${character}-${index}`}
                preserveSelection
                title={character}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 28,
                  minHeight: 28,
                  padding: 2,
                  fontSize: 16
                }}
                onSelect={() => {
                  insertSpecialCharacter(character);
                  close();
                }}
              >
                {character}
              </DropdownItem>
            ))}
          </div>
        )}
      </Dropdown>

      {!isScreenplayMode && (
        <>
          <span className="toolbar-separator" aria-hidden="true" />

          <button
            type="button"
            title={t('alignLeftTitle')}
            onMouseDown={preventFocusLoss}
            onClick={() => runCommand('justifyLeft')}
          >
            <AlignIcon path={ALIGN_LEFT_PATH} />
          </button>

          <button
            type="button"
            title={t('alignCenterTitle')}
            onMouseDown={preventFocusLoss}
            onClick={() => runCommand('justifyCenter')}
          >
            <AlignIcon path={ALIGN_CENTER_PATH} />
          </button>

          <button
            type="button"
            title={t('alignRightTitle')}
            onMouseDown={preventFocusLoss}
            onClick={() => runCommand('justifyRight')}
          >
            <AlignIcon path={ALIGN_RIGHT_PATH} />
          </button>

          <button
            type="button"
            title={t('alignJustifyTitle')}
            onMouseDown={preventFocusLoss}
            onClick={() => runCommand('justifyFull')}
          >
            <AlignIcon path={ALIGN_JUSTIFY_PATH} />
          </button>
        </>
      )}

      <span className="toolbar-separator" aria-hidden="true" />

      <button
        type="button"
        title={t('globalSearchBtnTitle')}
        onClick={onOpenGlobalSearch}
      >
        {t('globalSearchBtn')}
      </button>

      <button type="button" title={t('replaceBtnTitle')} onClick={onOpenReplace}>
        {t('replaceBtn')}
      </button>
    </div>
  );
}
