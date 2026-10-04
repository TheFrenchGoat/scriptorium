// src/renderer/components/editor/ScreenplayEditor.tsx
//
// Éditeur principal d’un scénario.
//
// Les éléments contentEditable sont laissés maîtres de leur DOM pendant la
// saisie. La navigation vers une scène active ne se relance pas après chaque
// caractère.

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

import {
  ScreenplayElementEditor
} from './ScreenplayElementEditor';

import type {
  FreeScreenplayHeading,
  ScreenplayConventionLanguage,
  ScreenplayElement,
  ScreenplayElementType,
  ScreenplayParagraphType,
  ScreenplayProjectData,
  ScreenplayScene,
  ScreenplaySceneHeading,
  StructuredScreenplayHeading
} from '../../../shared/types';

export const SCREENPLAY_POSITION_EVENT =
  'scriptorium:screenplay-position';

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

  onChange: (
    screenplay: ScreenplayProjectData
  ) => void;

  onSelectScene: (
    sceneId: string
  ) => void;
}

interface ParsedStructuredHeading {
  interiorExterior:
    StructuredScreenplayHeading['interiorExterior'];

  customInteriorExterior?: string;
  location: string;
  timeOfDay: string;
}

function dispatchScreenplayPosition(
  detail:
    | ScreenplayPositionDetail
    | null
): void {
  window.dispatchEvent(
    new CustomEvent(
      SCREENPLAY_POSITION_EVENT,
      {
        detail
      }
    )
  );
}

function focusElementById(
  elementId: string,
  placeAtEnd = true
): void {
  window.requestAnimationFrame(() => {
    const selector =
      `[data-screenplay-element-id="${CSS.escape(
        elementId
      )}"]`;

    const editor =
      document.querySelector<HTMLElement>(
        selector
      );

    if (!editor) {
      return;
    }

    editor.focus({
      preventScroll: true
    });

    const selection =
      window.getSelection();

    if (!selection) {
      return;
    }

    const range =
      document.createRange();

    range.selectNodeContents(
      editor
    );

    range.collapse(
      !placeAtEnd
    );

    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function getHeadingText(
  heading: ScreenplaySceneHeading,
  language: ScreenplayConventionLanguage
): string {
  if (
    heading.mode === 'free'
  ) {
    return screenplayHtmlToPlainText(
      heading.html
    );
  }

  return getDefaultSceneHeading(
    {
      interiorExterior:
        heading.interiorExterior,

      customInteriorExterior:
        heading.customInteriorExterior,

      location:
        heading.location,

      time:
        heading.timeOfDay
    },
    language
  );
}

function parseStructuredHeading(
  rawText: string
): ParsedStructuredHeading | null {
  const normalized =
    rawText
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (!normalized) {
    return null;
  }

  const prefixMatch =
    /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.)\s*(.*)$/i.exec(
      normalized
    );

  let interiorExterior:
    StructuredScreenplayHeading['interiorExterior'] =
    'OTHER';

  let customInteriorExterior:
    | string
    | undefined;

  let remainder =
    normalized;

  if (prefixMatch) {
    const prefix =
      prefixMatch[1]
        .toUpperCase();

    if (
      prefix === 'INT.' ||
      prefix === 'EXT.' ||
      prefix ===
        'INT./EXT.' ||
      prefix ===
        'EXT./INT.'
    ) {
      interiorExterior =
        prefix;
    }

    remainder =
      prefixMatch[2].trim();
  } else {
    const customMatch =
      /^([A-ZÀ-ÖØ-Ý0-9./ ]{1,20}\.)\s+(.+)$/i.exec(
        normalized
      );

    if (customMatch) {
      interiorExterior =
        'OTHER';

      customInteriorExterior =
        customMatch[1].trim();

      remainder =
        customMatch[2].trim();
    }
  }

  const separatorMatch =
    /^(.*?)\s+(?:—|–|-)\s+(.+)$/.exec(
      remainder
    );

  const location =
    (
      separatorMatch?.[1] ??
      remainder
    ).trim();

  const timeOfDay =
    (
      separatorMatch?.[2] ??
      ''
    ).trim();

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
  update: (
    scene: ScreenplayScene
  ) => ScreenplayScene
): ScreenplayProjectData {
  return {
    ...screenplay,

    scenes:
      screenplay.scenes.map(
        (scene) =>
          scene.id === sceneId
            ? update(scene)
            : scene
      )
  };
}

function replaceElement(
  scene: ScreenplayScene,
  elementId: string,
  update: (
    element: ScreenplayElement
  ) => ScreenplayElement
): ScreenplayScene {
  return {
    ...scene,

    elements:
      scene.elements.map(
        (element) =>
          element.id === elementId
            ? update(element)
            : element
      )
  };
}

interface SceneHeadingEditorProps {
  scene: ScreenplayScene;
  language: ScreenplayConventionLanguage;
  nativeSpellcheck: boolean;
  active: boolean;

  onFocus: () => void;

  onChange: (
    heading: ScreenplaySceneHeading
  ) => void;

  onFocusFirstElement: () => void;
}

function SceneHeadingEditor({
  scene,
  language,
  nativeSpellcheck,
  active,
  onFocus,
  onChange,
  onFocusFirstElement
}: SceneHeadingEditorProps): React.ReactElement {
  const editorRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const focusedRef =
    useRef(false);

  const headingText =
    useMemo(
      () =>
        getHeadingText(
          scene.heading,
          language
        ),
      [
        language,
        scene.heading
      ]
    );

  useEffect(() => {
    const editor =
      editorRef.current;

    if (
      !editor ||
      focusedRef.current
    ) {
      return;
    }

    if (
      editor.innerText !==
      headingText
    ) {
      editor.innerText =
        headingText;
    }
  }, [headingText]);

  const commit =
    useCallback((): void => {
      const editor =
        editorRef.current;

      if (!editor) {
        return;
      }

      const text =
        editor.innerText
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLocaleUpperCase();

      const structured =
        parseStructuredHeading(
          text
        );

      if (structured) {
        const nextHeading:
          StructuredScreenplayHeading =
          {
            id:
              scene.heading.id,

            type:
              'scene-heading',

            mode:
              'structured',

            interiorExterior:
              structured
                .interiorExterior,

            customInteriorExterior:
              structured
                .customInteriorExterior,

            location:
              structured.location,

            timeOfDay:
              structured.timeOfDay
          };

        onChange(
          nextHeading
        );

        return;
      }

      const nextHeading:
        FreeScreenplayHeading =
        {
          id:
            scene.heading.id,

          type:
            'scene-heading',

          mode:
            'free',

          html:
            escapeScreenplayHtml(
              text
            )
        };

      onChange(
        nextHeading
      );
    }, [
      onChange,
      scene.heading.id
    ]);

  return (
    <div
      ref={editorRef}
      className={[
        'screenplay-scene-heading',
        active
          ? 'active'
          : ''
      ]
        .filter(Boolean)
        .join(' ')}
      contentEditable
      suppressContentEditableWarning
      spellCheck={
        nativeSpellcheck
      }
      role="textbox"
      aria-label={
        language === 'en'
          ? 'Scene heading'
          : 'En-tête de scène'
      }
      data-screenplay-heading-id={
        scene.heading.id
      }
      onFocus={() => {
        focusedRef.current = true;
        onFocus();
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter'
        ) {
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
  onChange,
  onSelectScene
}: ScreenplayEditorProps): React.ReactElement {
  const [
    activeElementId,
    setActiveElementId
  ] = useState<string | null>(
    null
  );

  const [
    activeHeadingId,
    setActiveHeadingId
  ] = useState<string | null>(
    null
  );

  const highlightTimerRef =
    useRef<number | null>(
      null
    );

  const scenes =
    screenplay.scenes ?? [];

  const language =
    screenplay.settings
      .conventionLanguage;

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

    const selector =
      `[data-screenplay-scene-id="${CSS.escape(
        activeSceneId
      )}"]`;

    const sceneElement =
      document.querySelector<HTMLElement>(
        selector
      );

    if (!sceneElement) {
      return;
    }

    sceneElement.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth'
    });

    sceneElement.classList.add(
      'navigation-highlight'
    );

    if (
      highlightTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        highlightTimerRef.current
      );
    }

    highlightTimerRef.current =
      window.setTimeout(() => {
        sceneElement.classList.remove(
          'navigation-highlight'
        );

        highlightTimerRef.current =
          null;
      }, 900);
  }, [activeSceneId]);

  useEffect(() => {
    return () => {
      if (
        highlightTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          highlightTimerRef.current
        );
      }

      dispatchScreenplayPosition(
        null
      );
    };
  }, []);

  const updateScene =
    useCallback(
      (
        sceneId: string,
        update: (
          scene: ScreenplayScene
        ) => ScreenplayScene
      ): void => {
        onChange(
          replaceScene(
            screenplay,
            sceneId,
            update
          )
        );
      },
      [
        onChange,
        screenplay
      ]
    );

  const changeHeading =
    useCallback(
      (
        sceneId: string,
        heading:
          ScreenplaySceneHeading
      ): void => {
        updateScene(
          sceneId,
          (scene) => ({
            ...scene,
            heading
          })
        );
      },
      [updateScene]
    );

  const changeElementHtml =
    useCallback(
      (
        sceneId: string,
        elementId: string,
        html: string
      ): void => {
        updateScene(
          sceneId,
          (scene) =>
            replaceElement(
              scene,
              elementId,
              (element) => ({
                ...element,
                html
              })
            )
        );
      },
      [updateScene]
    );

  const changeElementType =
    useCallback(
      (
        sceneId: string,
        elementId: string,
        type:
          ScreenplayElementType
      ): void => {
        updateScene(
          sceneId,
          (scene) =>
            replaceElement(
              scene,
              elementId,
              (element) => ({
                ...element,
                type
              })
            )
        );
      },
      [updateScene]
    );

  const insertElementAfter =
    useCallback(
      (
        sceneId: string,
        sourceElementId: string,
        type:
          ScreenplayElementType,
        html: string
      ): void => {
        const newElement =
          createScreenplayElement({
            type,
            html
          });

        updateScene(
          sceneId,
          (scene) => {
            const index =
              scene.elements.findIndex(
                (element) =>
                  element.id ===
                  sourceElementId
              );

            const nextElements =
              scene.elements.slice();

            nextElements.splice(
              index >= 0
                ? index + 1
                : nextElements.length,
              0,
              newElement
            );

            return {
              ...scene,
              elements:
                nextElements
            };
          }
        );

        setActiveHeadingId(
          null
        );

        setActiveElementId(
          newElement.id
        );

        focusElementById(
          newElement.id
        );
      },
      [updateScene]
    );

  const deleteElement =
    useCallback(
      (
        sceneId: string,
        elementId: string
      ): void => {
        const scene =
          scenes.find(
            (entry) =>
              entry.id ===
              sceneId
          );

        if (!scene) {
          return;
        }

        const index =
          scene.elements.findIndex(
            (element) =>
              element.id ===
              elementId
          );

        if (index < 0) {
          return;
        }

        if (
          scene.elements.length === 1
        ) {
          changeElementHtml(
            sceneId,
            elementId,
            ''
          );

          changeElementType(
            sceneId,
            elementId,
            'action'
          );

          setActiveElementId(
            elementId
          );

          focusElementById(
            elementId,
            false
          );

          return;
        }

        const targetIndex =
          Math.max(
            0,
            index - 1
          );

        const targetElement =
          scene.elements[
            targetIndex
          ];

        updateScene(
          sceneId,
          (currentScene) => ({
            ...currentScene,

            elements:
              currentScene.elements.filter(
                (element) =>
                  element.id !==
                  elementId
              )
          })
        );

        setActiveHeadingId(
          null
        );

        setActiveElementId(
          targetElement.id
        );

        focusElementById(
          targetElement.id
        );
      },
      [
        changeElementHtml,
        changeElementType,
        scenes,
        updateScene
      ]
    );

  const selectHeading =
    useCallback(
      (
        scene: ScreenplayScene,
        sceneIndex: number
      ): void => {
        onSelectScene(
          scene.id
        );

        setActiveElementId(
          null
        );

        setActiveHeadingId(
          scene.heading.id
        );

        dispatchScreenplayPosition({
          sceneId:
            scene.id,

          sceneIndex,

          sceneCount:
            scenes.length,

          elementId:
            null,

          elementIndex:
            null,

          elementCount:
            scene.elements.length,

          type:
            'scene-heading'
        });
      },
      [
        onSelectScene,
        scenes.length
      ]
    );

  const selectElement =
    useCallback(
      (
        scene: ScreenplayScene,
        sceneIndex: number,
        element:
          ScreenplayElement,
        elementIndex: number
      ): void => {
        onSelectScene(
          scene.id
        );

        setActiveHeadingId(
          null
        );

        setActiveElementId(
          element.id
        );

        dispatchScreenplayPosition({
          sceneId:
            scene.id,

          sceneIndex,

          sceneCount:
            scenes.length,

          elementId:
            element.id,

          elementIndex,

          elementCount:
            scene.elements.length,

          type:
            element.type
        });
      },
      [
        onSelectScene,
        scenes.length
      ]
    );

  if (
    scenes.length === 0
  ) {
    return (
      <div className="screenplay-empty-state">
        <span
          className="screenplay-empty-state-icon"
          aria-hidden="true"
        >
          🎬
        </span>

        <h3>
          {language === 'en'
            ? 'No scenes'
            : 'Aucune scène'}
        </h3>

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
      data-page-format={
        screenplay.settings
          .pageFormat
      }
      data-convention-language={
        language
      }
      data-bold-scene-headings={
        screenplay.settings
          .boldSceneHeadings
          ? 'true'
          : 'false'
      }
      style={{
        zoom
      }}
    >
      <div className="screenplay-document">
        {scenes.map(
          (
            scene,
            sceneIndex
          ) => {
            const firstElement =
              scene.elements[0];

            return (
              <section
                key={scene.id}
                className={[
                  'screenplay-scene',
                  activeSceneId ===
                  scene.id
                    ? 'active'
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-screenplay-scene-id={
                  scene.id
                }
              >
                <SceneHeadingEditor
                  scene={scene}
                  language={language}
                  nativeSpellcheck={
                    nativeSpellcheck
                  }
                  active={
                    activeHeadingId ===
                    scene.heading.id
                  }
                  onFocus={() => {
                    selectHeading(
                      scene,
                      sceneIndex
                    );
                  }}
                  onChange={(
                    heading
                  ) => {
                    changeHeading(
                      scene.id,
                      heading
                    );
                  }}
                  onFocusFirstElement={() => {
                    if (
                      !firstElement
                    ) {
                      return;
                    }

                    selectElement(
                      scene,
                      sceneIndex,
                      firstElement,
                      0
                    );

                    focusElementById(
                      firstElement.id,
                      true
                    );
                  }}
                />

                <div className="screenplay-scene-elements">
                  {scene.elements.map(
                    (
                      element,
                      elementIndex
                    ) => (
                      <ScreenplayElementEditor
                        key={
                          element.id
                        }
                        element={
                          element
                        }
                        conventionLanguage={
                          language
                        }
                        enableShotElement={
                          screenplay
                            .settings
                            .enableShotElement
                        }
                        active={
                          activeElementId ===
                          element.id
                        }
                        onFocus={() => {
                          selectElement(
                            scene,
                            sceneIndex,
                            element,
                            elementIndex
                          );
                        }}
                        onChangeHtml={(
                          elementId,
                          html
                        ) => {
                          changeElementHtml(
                            scene.id,
                            elementId,
                            html
                          );
                        }}
                        onChangeType={(
                          elementId,
                          type
                        ) => {
                          changeElementType(
                            scene.id,
                            elementId,
                            type
                          );
                        }}
                        onInsertAfter={(
                          elementId,
                          type,
                          html
                        ) => {
                          insertElementAfter(
                            scene.id,
                            elementId,
                            type,
                            html
                          );
                        }}
                        onDelete={(
                          elementId
                        ) => {
                          deleteElement(
                            scene.id,
                            elementId
                          );
                        }}
                      />
                    )
                  )}
                </div>
              </section>
            );
          }
        )}
      </div>
    </div>
  );
}
