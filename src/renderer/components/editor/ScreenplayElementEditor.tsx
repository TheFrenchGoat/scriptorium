// src/renderer/components/editor/ScreenplayElementEditor.tsx
//
// Éditeur d’un paragraphe de scénario.
//
// Le contentEditable est volontairement non contrôlé par React.
// React ne réinjecte donc jamais element.html pendant la saisie, ce qui
// empêche le curseur de revenir au début après chaque caractère.

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react';

import {
  escapeScreenplayHtml,
  getNextScreenplayTypeAfterEnter,
  normalizeCharacterCue,
  normalizeParenthetical,
  normalizeTransition,
  screenplayHtmlToPlainText
} from '../../lib/screenplay';

import type {
  ScreenplayConventionLanguage,
  ScreenplayElement,
  ScreenplayElementType
} from '../../../shared/types';

export interface ScreenplayElementEditorProps {
  element: ScreenplayElement;
  conventionLanguage: ScreenplayConventionLanguage;
  enableShotElement: boolean;
  active: boolean;

  onFocus: () => void;

  onChangeHtml: (
    elementId: string,
    html: string
  ) => void;

  onChangeType: (
    elementId: string,
    type: ScreenplayElementType
  ) => void;

  onInsertAfter: (
    elementId: string,
    type: ScreenplayElementType,
    html: string
  ) => void;

  onDelete: (
    elementId: string
  ) => void;
}

const TAB_ORDER: readonly ScreenplayElementType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot'
] as const;

function getAvailableTypes(
  enableShotElement: boolean
): ScreenplayElementType[] {
  return TAB_ORDER.filter(
    (type) =>
      type !== 'shot' ||
      enableShotElement
  );
}

function cycleType(
  currentType: ScreenplayElementType,
  direction: 1 | -1,
  availableTypes: ScreenplayElementType[]
): ScreenplayElementType {
  if (availableTypes.length === 0) {
    return 'action';
  }

  const currentIndex =
    availableTypes.indexOf(
      currentType
    );

  if (currentIndex < 0) {
    return availableTypes[0];
  }

  const nextIndex =
    (
      currentIndex +
      direction +
      availableTypes.length
    ) %
    availableTypes.length;

  return availableTypes[nextIndex];
}

function getRangeInsideEditor(
  editor: HTMLElement
): Range | null {
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
    !editor.contains(
      range.startContainer
    ) ||
    !editor.contains(
      range.endContainer
    )
  ) {
    return null;
  }

  return range;
}

function fragmentToHtml(
  fragment: DocumentFragment
): string {
  const container =
    document.createElement('div');

  container.appendChild(
    fragment.cloneNode(true)
  );

  return container.innerHTML;
}

function normalizeEmptyHtml(
  html: string
): string {
  const plainText =
    screenplayHtmlToPlainText(html);

  if (!plainText) {
    return '';
  }

  return html;
}

function normalizeElementHtml(
  type: ScreenplayElementType,
  html: string
): string {
  const plainText =
    screenplayHtmlToPlainText(html);

  switch (type) {
    case 'character':
      return escapeScreenplayHtml(
        normalizeCharacterCue(
          plainText
        )
      );

    case 'parenthetical':
      return escapeScreenplayHtml(
        normalizeParenthetical(
          plainText
        )
      );

    case 'transition':
      return escapeScreenplayHtml(
        normalizeTransition(
          plainText
        )
      );

    case 'action':
    case 'dialogue':
    case 'shot':
    default:
      return normalizeEmptyHtml(
        html
      );
  }
}

function isRangeAtStart(
  editor: HTMLElement,
  range: Range
): boolean {
  const beforeRange =
    document.createRange();

  beforeRange.selectNodeContents(
    editor
  );

  beforeRange.setEnd(
    range.startContainer,
    range.startOffset
  );

  return (
    beforeRange
      .toString()
      .replace(/\u200b/g, '')
      .length === 0
  );
}

function getPlaceholder(
  type: ScreenplayElementType,
  language: ScreenplayConventionLanguage
): string {
  if (language === 'en') {
    switch (type) {
      case 'action':
        return 'Describe the action…';

      case 'character':
        return 'CHARACTER';

      case 'parenthetical':
        return '(parenthetical)';

      case 'dialogue':
        return 'Dialogue…';

      case 'transition':
        return 'CUT TO:';

      case 'shot':
        return 'SHOT / TECHNICAL DIRECTION';
    }
  }

  switch (type) {
    case 'action':
      return "Décrivez l'action…";

    case 'character':
      return 'PERSONNAGE';

    case 'parenthetical':
      return '(indication de jeu)';

    case 'dialogue':
      return 'Dialogue…';

    case 'transition':
      return 'COUPE À :';

    case 'shot':
      return 'PLAN / INDICATION TECHNIQUE';
  }
}

export function ScreenplayElementEditor({
  element,
  conventionLanguage,
  enableShotElement,
  active,
  onFocus,
  onChangeHtml,
  onChangeType,
  onInsertAfter,
  onDelete
}: ScreenplayElementEditorProps): React.ReactElement {
  const editorRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const focusedRef =
    useRef(false);

  const lastReportedHtmlRef =
    useRef(element.html);

  const availableTypes =
    useMemo(
      () =>
        getAvailableTypes(
          enableShotElement
        ),
      [enableShotElement]
    );

  /*
   * Synchronisation impérative du HTML.
   *
   * Le DOM n’est jamais remplacé pendant que l’utilisateur écrit. C’est ce
   * qui évite la perte de sélection et le retour du curseur au début.
   */
  useLayoutEffect(() => {
    const editor =
      editorRef.current;

    if (
      !editor ||
      focusedRef.current
    ) {
      return;
    }

    if (
      editor.innerHTML !==
      element.html
    ) {
      editor.innerHTML =
        element.html;
    }

    lastReportedHtmlRef.current =
      element.html;
  }, [
    element.html,
    element.id
  ]);

  const reportHtml =
    useCallback(
      (html: string): void => {
        if (
          html ===
          lastReportedHtmlRef.current
        ) {
          return;
        }

        lastReportedHtmlRef.current =
          html;

        onChangeHtml(
          element.id,
          html
        );
      },
      [
        element.id,
        onChangeHtml
      ]
    );

  const commitCurrentContent =
    useCallback((): void => {
      const editor =
        editorRef.current;

      if (!editor) {
        return;
      }

      const normalizedHtml =
        normalizeElementHtml(
          element.type,
          editor.innerHTML
        );

      if (
        editor.innerHTML !==
        normalizedHtml
      ) {
        editor.innerHTML =
          normalizedHtml;
      }

      reportHtml(
        normalizedHtml
      );
    }, [
      element.type,
      reportHtml
    ]);

  const changeType =
    useCallback(
      (
        nextType: ScreenplayElementType
      ): void => {
        if (
          nextType === element.type
        ) {
          return;
        }

        commitCurrentContent();

        onChangeType(
          element.id,
          nextType
        );
      },
      [
        commitCurrentContent,
        element.id,
        element.type,
        onChangeType
      ]
    );

  const splitAtSelection =
    useCallback(
      (
        range: Range
      ): {
        beforeHtml: string;
        afterHtml: string;
      } => {
        const editor =
          editorRef.current;

        if (!editor) {
          return {
            beforeHtml: '',
            afterHtml: ''
          };
        }

        const beforeRange =
          document.createRange();

        beforeRange.selectNodeContents(
          editor
        );

        beforeRange.setEnd(
          range.startContainer,
          range.startOffset
        );

        const afterRange =
          document.createRange();

        afterRange.selectNodeContents(
          editor
        );

        afterRange.setStart(
          range.endContainer,
          range.endOffset
        );

        return {
          beforeHtml:
            normalizeEmptyHtml(
              fragmentToHtml(
                beforeRange.cloneContents()
              )
            ),

          afterHtml:
            normalizeEmptyHtml(
              fragmentToHtml(
                afterRange.cloneContents()
              )
            )
        };
      },
      []
    );

  const handleEnter =
    useCallback((): void => {
      const editor =
        editorRef.current;

      if (!editor) {
        return;
      }

      const range =
        getRangeInsideEditor(
          editor
        );

      if (!range) {
        return;
      }

      const {
        beforeHtml,
        afterHtml
      } = splitAtSelection(
        range
      );

      const normalizedBefore =
        normalizeElementHtml(
          element.type,
          beforeHtml
        );

      editor.innerHTML =
        normalizedBefore;

      lastReportedHtmlRef.current =
        normalizedBefore;

      onChangeHtml(
        element.id,
        normalizedBefore
      );

      const nextType =
        screenplayHtmlToPlainText(
          afterHtml
        )
          ? element.type
          : getNextScreenplayTypeAfterEnter(
              element.type
            );

      onInsertAfter(
        element.id,
        nextType,
        normalizeElementHtml(
          nextType,
          afterHtml
        )
      );
    }, [
      element.id,
      element.type,
      onChangeHtml,
      onInsertAfter,
      splitAtSelection
    ]);

  const handlePaste =
    useCallback(
      (
        event:
          React.ClipboardEvent<HTMLDivElement>
      ): void => {
        event.preventDefault();

        const plainText =
          event.clipboardData.getData(
            'text/plain'
          );

        document.execCommand(
          'insertText',
          false,
          plainText
        );

        const editor =
          editorRef.current;

        if (editor) {
          reportHtml(
            editor.innerHTML
          );
        }
      },
      [reportHtml]
    );

  return (
    <div
      className={[
        'screenplay-element',
        `screenplay-element-${element.type}`,
        active
          ? 'active'
          : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-screenplay-element-type={
        element.type
      }
    >
      <span
        className="screenplay-element-type-indicator"
        aria-hidden="true"
      />

      <div
        ref={editorRef}
        className="screenplay-element-content"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        tabIndex={0}
        data-screenplay-element-id={
          element.id
        }
        data-placeholder={getPlaceholder(
          element.type,
          conventionLanguage
        )}
        onFocus={() => {
          focusedRef.current = true;
          onFocus();
        }}
        onBlur={() => {
          focusedRef.current = false;
          commitCurrentContent();
        }}
        onInput={(event) => {
          reportHtml(
            event.currentTarget
              .innerHTML
          );
        }}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (
            event.key === 'Tab'
          ) {
            event.preventDefault();

            const direction:
              | 1
              | -1 =
              event.shiftKey
                ? -1
                : 1;

            changeType(
              cycleType(
                element.type,
                direction,
                availableTypes
              )
            );

            return;
          }

          if (
            event.key === 'Enter' &&
            !event.shiftKey
          ) {
            event.preventDefault();
            handleEnter();
            return;
          }

          if (
            event.key ===
              'Backspace' ||
            event.key === 'Delete'
          ) {
            const editor =
              editorRef.current;

            if (!editor) {
              return;
            }

            const range =
              getRangeInsideEditor(
                editor
              );

            if (!range) {
              return;
            }

            const empty =
              screenplayHtmlToPlainText(
                editor.innerHTML
              ).length === 0;

            if (
              empty &&
              range.collapsed &&
              isRangeAtStart(
                editor,
                range
              )
            ) {
              event.preventDefault();

              onDelete(
                element.id
              );
            }
          }
        }}
      />
    </div>
  );
}
