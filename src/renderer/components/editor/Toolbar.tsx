// Barre d’outils de mise en forme de l’éditeur.
//
// La sélection de texte est mémorisée avant qu’un bouton ou un menu prenne le
// focus. Cela permet notamment à Ctrl+A, puis au changement de police, de
// taille ou de couleur, de fonctionner correctement.
//
// La couleur est appliquée directement avec une valeur CSS hexadécimale afin
// que la couleur choisie corresponde exactement à celle du texte. Les
// mentions World Building (.wb-mention) sont volontairement exclues : leur
// couleur reste gérée par le système World Building.
//
// Pour éviter les ralentissements pendant le déplacement dans le sélecteur
// natif de couleur, aucune modification du document n’est effectuée pendant
// les événements "input". La couleur n’est appliquée qu’une seule fois, lors
// de l’événement natif "change", lorsque le choix est validé.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import {
  Dropdown,
  DropdownItem
} from '../common/Dropdown';
import { useEditorStatus } from './editor-status';
import type { EditorController } from './useEditorController';

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

interface SelectedTextPart {
  textNode: Text;
  startOffset: number;
  endOffset: number;
}

const FONTS: FontChoice[] = [
  {
    label: 'Roboto',
    css: "'Roboto', sans-serif"
  },
  {
    label: 'Arial',
    css: 'Arial, sans-serif'
  },
  {
    label: 'Georgia',
    css: 'Georgia, serif'
  },
  {
    label: 'Times New Roman',
    css: "'Times New Roman', serif"
  },
  {
    label: 'Courier New',
    css: "'Courier New', monospace"
  },
  {
    label: 'Verdana',
    css: 'Verdana, sans-serif'
  },
  {
    label: 'Trebuchet MS',
    css: "'Trebuchet MS', sans-serif"
  },
  {
    label: 'Merriweather',
    css: "'Merriweather', serif"
  }
];

const SPECIAL_CHARACTERS = [
  'À',
  'Â',
  'Ä',
  'Ç',
  'É',
  'È',
  'Ê',
  'Ë',
  'Î',
  'Ï',
  'Ô',
  'Ö',
  'Ù',
  'Û',
  'Ü',
  'Ÿ',
  'Æ',
  'Œ',
  'à',
  'â',
  'ä',
  'ç',
  'é',
  'è',
  'ê',
  'ë',
  'î',
  'ï',
  'ô',
  'ö',
  'ù',
  'û',
  'ü',
  'ÿ',
  'æ',
  'œ',
  '«',
  '»',
  '—',
  '…',
  '’',
  '“',
  '”'
];

const DEFAULT_FONT = 'Roboto';
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 96;

function getEditor(): HTMLElement | null {
  const editor = document.getElementById('editor');

  return editor instanceof HTMLElement
    ? editor
    : null;
}

function getElementFromNode(
  node: Node | null
): HTMLElement | null {
  if (!node) {
    return null;
  }

  if (node instanceof HTMLElement) {
    return node;
  }

  return node.parentElement;
}

function rangeBelongsToEditor(
  range: Range,
  editor: HTMLElement
): boolean {
  return (
    editor.contains(range.startContainer) &&
    editor.contains(range.endContainer)
  );
}

function normalizeFontFamily(
  value: string
): string {
  return value
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getReadableFontName(
  fontFamily: string
): string {
  const normalized =
    normalizeFontFamily(fontFamily);

  const exactChoice = FONTS.find(
    (font) =>
      normalizeFontFamily(font.css) ===
      normalized
  );

  if (exactChoice) {
    return exactChoice.label;
  }

  const firstFont = fontFamily
    .split(',')[0]
    ?.replace(/["']/g, '')
    .trim();

  return firstFont || DEFAULT_FONT;
}

function parseFontSize(
  value: string
): number | null {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function clampFontSize(
  value: number
): number {
  return Math.min(
    MAX_FONT_SIZE,
    Math.max(MIN_FONT_SIZE, value)
  );
}

function isWorldBuildingNode(
  node: Node
): boolean {
  const element = getElementFromNode(node);

  return Boolean(
    element?.closest('.wb-mention')
  );
}

function getSelectedTextParts(
  range: Range,
  editor: HTMLElement
): SelectedTextPart[] {
  const parts: SelectedTextPart[] = [];

  const walker =
    document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT
    );

  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const textLength =
      textNode.textContent?.length ?? 0;

    if (textLength > 0) {
      let intersects = false;

      try {
        intersects =
          range.intersectsNode(textNode);
      } catch {
        intersects = false;
      }

      if (intersects) {
        const startOffset =
          textNode === range.startContainer
            ? range.startOffset
            : 0;

        const endOffset =
          textNode === range.endContainer
            ? range.endOffset
            : textLength;

        const safeStart = Math.max(
          0,
          Math.min(startOffset, textLength)
        );

        const safeEnd = Math.max(
          safeStart,
          Math.min(endOffset, textLength)
        );

        if (safeEnd > safeStart) {
          parts.push({
            textNode,
            startOffset: safeStart,
            endOffset: safeEnd
          });
        }
      }
    }

    currentNode = walker.nextNode();
  }

  return parts;
}

/**
 * Applique un style CSS aux portions de texte sélectionnées.
 *
 * Les portions sont traitées de la fin vers le début afin que les mutations
 * du DOM ne rendent pas invalides les offsets des nœuds suivants.
 */
function applyInlineStyleToSelection(
  editor: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
  options?: {
    skipWorldBuilding?: boolean;
  }
): boolean {
  const selection =
    window.getSelection();

  if (
    !selection ||
    selection.rangeCount === 0
  ) {
    return false;
  }

  const sourceRange =
    selection.getRangeAt(0);

  if (
    sourceRange.collapsed ||
    !rangeBelongsToEditor(
      sourceRange,
      editor
    )
  ) {
    return false;
  }

  let parts = getSelectedTextParts(
    sourceRange,
    editor
  );

  if (options?.skipWorldBuilding) {
    parts = parts.filter(
      (part) =>
        !isWorldBuildingNode(
          part.textNode
        )
    );
  }

  if (parts.length === 0) {
    return false;
  }

  const insertedSpans: HTMLSpanElement[] =
    [];

  for (
    let index = parts.length - 1;
    index >= 0;
    index -= 1
  ) {
    const part = parts[index];

    if (!part.textNode.isConnected) {
      continue;
    }

    const partRange =
      document.createRange();

    try {
      partRange.setStart(
        part.textNode,
        part.startOffset
      );

      partRange.setEnd(
        part.textNode,
        part.endOffset
      );
    } catch {
      continue;
    }

    const selectedContent =
      partRange.extractContents();

    const span =
      document.createElement('span');

    Object.assign(span.style, styles);
    span.appendChild(selectedContent);

    partRange.insertNode(span);
    insertedSpans.unshift(span);
  }

  if (insertedSpans.length === 0) {
    return false;
  }

  const firstSpan = insertedSpans[0];
  const lastSpan =
    insertedSpans[
      insertedSpans.length - 1
    ];

  const restoredRange =
    document.createRange();

  restoredRange.setStartBefore(firstSpan);
  restoredRange.setEndAfter(lastSpan);

  selection.removeAllRanges();
  selection.addRange(restoredRange);

  return true;
}

function getSelectionFormatting(
  editor: HTMLElement
): SelectionFormatting | null {
  const selection =
    window.getSelection();

  if (
    !selection ||
    selection.rangeCount === 0
  ) {
    return null;
  }

  const range =
    selection.getRangeAt(0);

  if (
    !rangeBelongsToEditor(
      range,
      editor
    )
  ) {
    return null;
  }

  const fontFamilies = new Set<string>();
  const fontSizes = new Set<number>();

  let firstComputedStyle:
    | CSSStyleDeclaration
    | null = null;

  if (!range.collapsed) {
    const parts =
      getSelectedTextParts(
        range,
        editor
      );

    parts.forEach((part) => {
      const element =
        getElementFromNode(
          part.textNode
        );

      if (!element) {
        return;
      }

      const computedStyle =
        window.getComputedStyle(
          element
        );

      if (!firstComputedStyle) {
        firstComputedStyle =
          computedStyle;
      }

      fontFamilies.add(
        getReadableFontName(
          computedStyle.fontFamily
        )
      );

      const size = parseFontSize(
        computedStyle.fontSize
      );

      if (size !== null) {
        fontSizes.add(size);
      }
    });
  }

  if (!firstComputedStyle) {
    const element =
      getElementFromNode(
        selection.anchorNode
      ) ?? editor;

    firstComputedStyle =
      window.getComputedStyle(element);

    fontFamilies.add(
      getReadableFontName(
        firstComputedStyle.fontFamily
      )
    );

    const size = parseFontSize(
      firstComputedStyle.fontSize
    );

    if (size !== null) {
      fontSizes.add(size);
    }
  }

  const fontValues =
    Array.from(fontFamilies);

  const sizeValues =
    Array.from(fontSizes);

  const decoration =
    firstComputedStyle
      .textDecorationLine ||
    firstComputedStyle.textDecoration ||
    '';

  const numericWeight =
    Number.parseInt(
      firstComputedStyle.fontWeight,
      10
    );

  return {
    fontFamily:
      fontValues[0] ?? DEFAULT_FONT,
    fontSize:
      sizeValues[0] ??
      DEFAULT_FONT_SIZE,
    fontMixed:
      fontValues.length > 1,
    sizeMixed:
      sizeValues.length > 1,
    bold:
      firstComputedStyle.fontWeight ===
        'bold' ||
      (!Number.isNaN(numericWeight) &&
        numericWeight >= 600),
    italic:
      firstComputedStyle.fontStyle ===
      'italic',
    underline:
      decoration.includes('underline')
  };
}

function AlignLeftIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
    >
      <path
        d="M2 3.5H16M2 7.2H11.5M2 10.8H16M2 14.5H10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlignCenterIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
    >
      <path
        d="M2 3.5H16M4.5 7.2H13.5M2 10.8H16M5 14.5H13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlignRightIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
    >
      <path
        d="M2 3.5H16M6.5 7.2H16M2 10.8H16M8 14.5H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlignJustifyIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
    >
      <path
        d="M2 3.5H16M2 7.2H16M2 10.8H16M2 14.5H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Toolbar({
  controller,
  onOpenGlobalSearch,
  onOpenReplace
}: ToolbarProps): React.ReactElement {
  const { t } = useI18n();
  const status =
    useEditorStatus(controller.status);

  const savedRangeRef =
    useRef<Range | null>(null);

  /*
   * Référence directe vers le sélecteur de couleur.
   *
   * Elle permet d’écouter le véritable événement DOM "change". Contrairement
   * au onChange synthétique de React, cet événement n’est déclenché qu’après
   * validation du choix dans la palette native de Chromium.
   */
  const colorInputRef =
    useRef<HTMLInputElement | null>(null);

  const [formatting, setFormatting] =
    useState<SelectionFormatting>({
      fontFamily: DEFAULT_FONT,
      fontSize: DEFAULT_FONT_SIZE,
      fontMixed: false,
      sizeMixed: false,
      bold: false,
      italic: false,
      underline: false
    });

  const [sizeDraft, setSizeDraft] =
    useState(
      String(DEFAULT_FONT_SIZE)
    );

  const rememberCurrentSelection =
    useCallback((): void => {
      const editor = getEditor();
      const selection =
        window.getSelection();

      if (
        !editor ||
        !selection ||
        selection.rangeCount === 0
      ) {
        return;
      }

      const range =
        selection.getRangeAt(0);

      if (
        !rangeBelongsToEditor(
          range,
          editor
        )
      ) {
        return;
      }

      savedRangeRef.current =
        range.cloneRange();
    }, []);

  const restoreSavedSelection =
    useCallback((): boolean => {
      const editor = getEditor();
      const range =
        savedRangeRef.current;

      if (
        !editor ||
        !range ||
        !range.startContainer.isConnected ||
        !range.endContainer.isConnected ||
        !rangeBelongsToEditor(
          range,
          editor
        )
      ) {
        return false;
      }

      const selection =
        window.getSelection();

      if (!selection) {
        return false;
      }

      editor.focus({
        preventScroll: true
      });

      selection.removeAllRanges();
      selection.addRange(range);

      return true;
    }, []);

  const refreshFormatting =
    useCallback((): void => {
      const editor = getEditor();

      if (!editor) {
        return;
      }

      const next =
        getSelectionFormatting(editor);

      if (!next) {
        return;
      }

      setFormatting(next);

      setSizeDraft(
        next.sizeMixed ||
          next.fontSize === null
          ? ''
          : String(next.fontSize)
      );
    }, []);

  useEffect(() => {
    const update = (): void => {
      rememberCurrentSelection();
      refreshFormatting();
    };

    document.addEventListener(
      'selectionchange',
      update
    );

    document.addEventListener(
      'keyup',
      update,
      true
    );

    document.addEventListener(
      'mouseup',
      update,
      true
    );

    return () => {
      document.removeEventListener(
        'selectionchange',
        update
      );

      document.removeEventListener(
        'keyup',
        update,
        true
      );

      document.removeEventListener(
        'mouseup',
        update,
        true
      );
    };
  }, [
    refreshFormatting,
    rememberCurrentSelection
  ]);

  const finalizeCustomFormatting =
    useCallback((): void => {
      controller.handleInput();
      rememberCurrentSelection();
      refreshFormatting();

      document.dispatchEvent(
        new Event('selectionchange')
      );
    }, [
      controller,
      refreshFormatting,
      rememberCurrentSelection
    ]);

  const runCommand = useCallback(
    (
      command: string,
      value?: string
    ): void => {
      restoreSavedSelection();
      controller.format(
        command,
        value
      );

      window.setTimeout(() => {
        rememberCurrentSelection();
        refreshFormatting();
      }, 0);
    },
    [
      controller,
      refreshFormatting,
      rememberCurrentSelection,
      restoreSavedSelection
    ]
  );

  const applyFontFamily =
    useCallback(
      (font: FontChoice): void => {
        restoreSavedSelection();

        const editor = getEditor();
        const selection =
          window.getSelection();

        if (
          !editor ||
          !selection ||
          selection.rangeCount === 0
        ) {
          return;
        }

        const range =
          selection.getRangeAt(0);

        if (
          !rangeBelongsToEditor(
            range,
            editor
          )
        ) {
          return;
        }

        if (range.collapsed) {
          controller.setFontFamily(
            font.css
          );

          window.setTimeout(() => {
            rememberCurrentSelection();
            refreshFormatting();
          }, 0);

          return;
        }

        const changed =
          applyInlineStyleToSelection(
            editor,
            {
              fontFamily: font.css
            }
          );

        if (changed) {
          finalizeCustomFormatting();
        }
      },
      [
        controller,
        finalizeCustomFormatting,
        refreshFormatting,
        rememberCurrentSelection,
        restoreSavedSelection
      ]
    );

  const applyFontSize =
    useCallback(
      (requestedSize: number): void => {
        if (
          !Number.isFinite(
            requestedSize
          )
        ) {
          return;
        }

        const size =
          clampFontSize(
            Math.round(requestedSize)
          );

        setSizeDraft(String(size));
        restoreSavedSelection();

        const editor = getEditor();
        const selection =
          window.getSelection();

        if (
          !editor ||
          !selection ||
          selection.rangeCount === 0
        ) {
          return;
        }

        const range =
          selection.getRangeAt(0);

        if (
          !rangeBelongsToEditor(
            range,
            editor
          )
        ) {
          return;
        }

        if (range.collapsed) {
          controller.setFontSizePx(
            size
          );

          window.setTimeout(() => {
            rememberCurrentSelection();
            refreshFormatting();
          }, 0);

          return;
        }

        const changed =
          applyInlineStyleToSelection(
            editor,
            {
              fontSize: `${size}px`
            }
          );

        if (changed) {
          finalizeCustomFormatting();
        }
      },
      [
        controller,
        finalizeCustomFormatting,
        refreshFormatting,
        rememberCurrentSelection,
        restoreSavedSelection
      ]
    );

  const changeFontSize = (
    amount: number
  ): void => {
    const parsed =
      Number.parseInt(
        sizeDraft,
        10
      );

    const current =
      Number.isFinite(parsed)
        ? parsed
        : formatting.fontSize ??
          DEFAULT_FONT_SIZE;

    applyFontSize(
      current + amount
    );
  };

  const commitSizeDraft =
    (): void => {
      const parsed =
        Number.parseInt(
          sizeDraft,
          10
        );

      if (!Number.isFinite(parsed)) {
        setSizeDraft(
          formatting.sizeMixed
            ? ''
            : String(
                formatting.fontSize ??
                  DEFAULT_FONT_SIZE
              )
        );

        return;
      }

      applyFontSize(parsed);
    };

  /**
   * Applique la couleur uniquement au texte ordinaire.
   *
   * Les nœuds situés dans un élément .wb-mention sont exclus pour conserver
   * la couleur définie par la fiche World Building.
   */
  const applyTextColor =
    useCallback(
      (color: string): void => {
        restoreSavedSelection();

        const editor = getEditor();
        const selection =
          window.getSelection();

        if (
          !editor ||
          !selection ||
          selection.rangeCount === 0
        ) {
          return;
        }

        const range =
          selection.getRangeAt(0);

        if (
          !rangeBelongsToEditor(
            range,
            editor
          )
        ) {
          return;
        }

        if (range.collapsed) {
          if (
            isWorldBuildingNode(
              range.startContainer
            )
          ) {
            return;
          }

          controller.format(
            'foreColor',
            color
          );

          window.setTimeout(() => {
            rememberCurrentSelection();
            refreshFormatting();
          }, 0);

          return;
        }

        const changed =
          applyInlineStyleToSelection(
            editor,
            {
              color
            },
            {
              skipWorldBuilding: true
            }
          );

        if (changed) {
          finalizeCustomFormatting();
        }
      },
      [
        controller,
        finalizeCustomFormatting,
        refreshFormatting,
        rememberCurrentSelection,
        restoreSavedSelection
      ]
    );

  /*
   * React traite onChange de certains champs comme un événement "input".
   * Pour <input type="color">, cela peut déclencher le traitement à chaque
   * déplacement dans la palette et reconstruire de nombreux spans dans le
   * chapitre.
   *
   * L’écoute directe de l’événement DOM "change" garantit que l’application
   * de la couleur ne se produit qu’une seule fois, après validation.
   */
  useEffect(() => {
    const colorInput =
      colorInputRef.current;

    if (!colorInput) {
      return;
    }

    const commitColor = (
      event: Event
    ): void => {
      const target =
        event.currentTarget;

      if (
        !(target instanceof HTMLInputElement)
      ) {
        return;
      }

      applyTextColor(target.value);
    };

    colorInput.addEventListener(
      'change',
      commitColor
    );

    return () => {
      colorInput.removeEventListener(
        'change',
        commitColor
      );
    };
  }, [applyTextColor]);

  const insertSpecialCharacter =
    useCallback(
      (character: string): void => {
        restoreSavedSelection();
        controller.insertText(character);

        window.setTimeout(() => {
          rememberCurrentSelection();
          refreshFormatting();
        }, 0);
      },
      [
        controller,
        refreshFormatting,
        rememberCurrentSelection,
        restoreSavedSelection
      ]
    );

  const fontButtonLabel =
    formatting.fontMixed
      ? 'Mixte'
      : formatting.fontFamily ||
        DEFAULT_FONT;

  return (
    <div
      className="toolbar"
      onMouseDownCapture={(event) => {
        const target =
          event.target as HTMLElement;

        if (
          target.closest(
            'button, .dropdown-item, input'
          )
        ) {
          rememberCurrentSelection();
        }
      }}
    >
      <button
        type="button"
        title={t('undoTitle')}
        disabled={!status.canUndo}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          controller.undo();
        }}
      >
        ↶
      </button>

      <button
        type="button"
        title={t('redoTitle')}
        disabled={!status.canRedo}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          controller.redo();
        }}
      >
        ↷
      </button>

      <span
        className="toolbar-separator"
        aria-hidden="true"
      />

      <button
        type="button"
        className={
          formatting.bold
            ? 'active'
            : undefined
        }
        title={t('boldTitle')}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand('bold');
        }}
      >
        <strong>B</strong>
      </button>

      <button
        type="button"
        className={
          formatting.italic
            ? 'active'
            : undefined
        }
        title={t('italicTitle')}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand('italic');
        }}
      >
        <em>I</em>
      </button>

      <button
        type="button"
        className={
          formatting.underline
            ? 'active'
            : undefined
        }
        title={t('underlineTitle')}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand('underline');
        }}
      >
        <u>U</u>
      </button>

      <span
        className="toolbar-separator"
        aria-hidden="true"
      />

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
        buttonTitle={
          formatting.fontMixed
            ? 'Mixte'
            : fontButtonLabel
        }
        containerStyle={{
          width: 142,
          minWidth: 142,
          maxWidth: 142,
          flex: '0 0 142px'
        }}
        menuStyle={{
          minWidth: 190
        }}
      >
        {(close) => (
          <>
            {FONTS.map((font) => (
              <DropdownItem
                key={font.css}
                preserveSelection
                style={{
                  fontFamily:
                    font.css
                }}
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
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: '0 0 auto'
        }}
      >
        <button
          type="button"
          aria-label="Réduire la taille"
          title="Réduire la taille"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            changeFontSize(-1);
          }}
          style={{
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0
          }}
        >
          −
        </button>

        <input
          type="text"
          inputMode="numeric"
          aria-label={t(
            'sizeDropdown'
          )}
          title={
            formatting.sizeMixed
              ? 'Mixte'
              : `${formatting.fontSize ?? DEFAULT_FONT_SIZE} px`
          }
          placeholder={
            formatting.sizeMixed
              ? 'Mixte'
              : undefined
          }
          value={sizeDraft}
          onChange={(event) => {
            const value =
              event.target.value;

            if (
              value === '' ||
              /^\d{0,2}$/.test(value)
            ) {
              setSizeDraft(value);
            }
          }}
          onFocus={() => {
            rememberCurrentSelection();
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter'
            ) {
              event.preventDefault();
              commitSizeDraft();
              event.currentTarget.blur();
            }

            if (
              event.key === 'Escape'
            ) {
              event.preventDefault();

              setSizeDraft(
                formatting.sizeMixed
                  ? ''
                  : String(
                      formatting.fontSize ??
                        DEFAULT_FONT_SIZE
                    )
              );

              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            commitSizeDraft();
          }}
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
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            changeFontSize(1);
          }}
          style={{
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0
          }}
        >
          +
        </button>
      </div>

      <div
        className="toolbar-color-control"
        title={t(
          'colorPickerTitle'
        )}
        style={{
          position: 'relative',
          width: 32,
          minWidth: 32,
          height: 30
        }}
      >
        <input
          ref={colorInputRef}
          id="colorPicker"
          type="color"
          aria-label={t(
            'colorPickerTitle'
          )}
          title={t(
            'colorPickerTitle'
          )}
          defaultValue="#000000"
          onMouseDown={() => {
            rememberCurrentSelection();
          }}
          style={{
            width: 32,
            height: 30,
            padding: 2,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer'
          }}
        />
      </div>

      <Dropdown
        label={t('specialCharsBtn')}
        buttonTitle={t(
          'specialCharsBtnTitle'
        )}
        menuStyle={{
          width: 244,
          padding: 8
        }}
      >
        {(close) => (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(7, 1fr)',
              gap: 4
            }}
          >
            {SPECIAL_CHARACTERS.map(
              (character, index) => (
                <DropdownItem
                  key={`${character}-${index}`}
                  preserveSelection
                  title={character}
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    minWidth: 28,
                    minHeight: 28,
                    padding: 2,
                    fontSize: 16
                  }}
                  onSelect={() => {
                    insertSpecialCharacter(
                      character
                    );
                    close();
                  }}
                >
                  {character}
                </DropdownItem>
              )
            )}
          </div>
        )}
      </Dropdown>

      <span
        className="toolbar-separator"
        aria-hidden="true"
      />

      <button
        type="button"
        title={t(
          'alignLeftTitle'
        )}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand(
            'justifyLeft'
          );
        }}
      >
        <AlignLeftIcon />
      </button>

      <button
        type="button"
        title={t(
          'alignCenterTitle'
        )}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand(
            'justifyCenter'
          );
        }}
      >
        <AlignCenterIcon />
      </button>

      <button
        type="button"
        title={t(
          'alignRightTitle'
        )}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand(
            'justifyRight'
          );
        }}
      >
        <AlignRightIcon />
      </button>

      <button
        type="button"
        title={t(
          'alignJustifyTitle'
        )}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          runCommand(
            'justifyFull'
          );
        }}
      >
        <AlignJustifyIcon />
      </button>

      <span
        className="toolbar-separator"
        aria-hidden="true"
      />

      <button
        type="button"
        title={t(
          'globalSearchBtnTitle'
        )}
        onClick={
          onOpenGlobalSearch
        }
      >
        {t('globalSearchBtn')}
      </button>

      <button
        type="button"
        title={t(
          'replaceBtnTitle'
        )}
        onClick={onOpenReplace}
      >
        {t('replaceBtn')}
      </button>
    </div>
  );
}
