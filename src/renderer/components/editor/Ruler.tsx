// src/renderer/components/editor/Ruler.tsx
//
// Règle horizontale de la page d’écriture.
//
// La règle se cale directement sur les dimensions visuelles de #editor.
// Elle reste donc alignée avec la page lorsque :
// - la page est centrée dans la zone d’écriture ;
// - la fenêtre est redimensionnée ;
// - la barre latérale change de largeur ;
// - la page est zoomée ;
// - la zone d’écriture défile horizontalement.
//
// Les valeurs enregistrées dans les préférences restent exprimées dans les
// coordonnées logiques de la page, indépendamment du zoom.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import type { EditorController } from './useEditorController';
import './Ruler.css';

const PX_PER_CM = 37.7952755906;
const PX_PER_MM = PX_PER_CM / 10;

const DEFAULT_LEFT_MARGIN = 80;
const DEFAULT_RIGHT_MARGIN = 80;
const DEFAULT_FIRST_LINE_INDENT = 0;

const MIN_MARGIN = 0;
const MIN_WRITING_WIDTH = 80;
const MIN_INDENT = -80;

const MAX_RULER_HISTORY = 50;

type RulerMarker =
  | 'left-margin'
  | 'right-margin'
  | 'first-line-indent';

interface RulerValues {
  marginLeft: number;
  marginRight: number;
  firstLineIndent: number;
}

interface RulerHistory {
  undo: RulerValues[];
  redo: RulerValues[];
}

interface RulerMetrics {
  /**
   * Largeur logique de la page, avant application du zoom.
   */
  baseWidth: number;

  /**
   * Facteur de zoom réellement appliqué à la page.
   */
  zoom: number;

  /**
   * Largeur visuelle de la page après application du zoom.
   */
  visualWidth: number;

  /**
   * Position horizontale de la page par rapport à la zone de la règle.
   *
   * Cette valeur peut devenir négative lorsque la page zoomée défile vers la
   * gauche. La règle suit ainsi exactement le mouvement de la page.
   */
  visualLeft: number;
}

interface DragState {
  marker: RulerMarker;
  startClientX: number;
  startValues: RulerValues;
}

export interface RulerProps {
  controller: EditorController;
}

function normalizeNumber(
  value: number | undefined,
  fallback: number
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function roundValue(value: number): number {
  return Math.round(value * 10) / 10;
}

function sameValues(
  first: RulerValues,
  second: RulerValues
): boolean {
  return (
    first.marginLeft === second.marginLeft &&
    first.marginRight === second.marginRight &&
    first.firstLineIndent === second.firstLineIndent
  );
}

function cloneValues(values: RulerValues): RulerValues {
  return {
    marginLeft: values.marginLeft,
    marginRight: values.marginRight,
    firstLineIndent: values.firstLineIndent
  };
}

function readZoom(editor: HTMLElement): number {
  const inlineZoom = parseFloat(editor.style.zoom);

  if (
    Number.isFinite(inlineZoom) &&
    inlineZoom > 0
  ) {
    return inlineZoom;
  }

  const computedZoom = parseFloat(
    window.getComputedStyle(editor).zoom
  );

  if (
    Number.isFinite(computedZoom) &&
    computedZoom > 0
  ) {
    return computedZoom;
  }

  return 1;
}

function getValuesFromController(
  controller: EditorController
): RulerValues {
  const prefs = controller.prefs();

  return {
    marginLeft: normalizeNumber(
      prefs.marginLeft,
      DEFAULT_LEFT_MARGIN
    ),
    marginRight: normalizeNumber(
      prefs.marginRight,
      DEFAULT_RIGHT_MARGIN
    ),
    firstLineIndent: normalizeNumber(
      prefs.firstLineIndent,
      DEFAULT_FIRST_LINE_INDENT
    )
  };
}

/**
 * Applique immédiatement les valeurs sur la page.
 *
 * Cela permet de voir le résultat pendant le déplacement d’un repère, avant
 * même l’enregistrement définitif dans les préférences.
 */
function applyValuesToDocument(
  values: RulerValues
): void {
  document.body.style.setProperty(
    '--editor-margin-left',
    `${values.marginLeft}px`
  );

  document.body.style.setProperty(
    '--editor-margin-right',
    `${values.marginRight}px`
  );

  document.body.style.setProperty(
    '--editor-indent',
    `${values.firstLineIndent}px`
  );
}

function isUnrelatedEditableElement(
  target: EventTarget | null
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  /*
   * Les raccourcis doivent fonctionner quand le focus est dans l’éditeur,
   * mais pas lorsqu’il est dans un champ de formulaire de l’interface.
   */
  if (target.id === 'editor') {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  return target.isContentEditable;
}

function markerLabel(
  marker: RulerMarker,
  lang: string
): string {
  if (lang === 'en') {
    if (marker === 'left-margin') {
      return 'Left margin';
    }

    if (marker === 'right-margin') {
      return 'Right margin';
    }

    return 'First-line indent';
  }

  if (marker === 'left-margin') {
    return 'Marge gauche';
  }

  if (marker === 'right-margin') {
    return 'Marge droite';
  }

  return 'Retrait de première ligne';
}

function formatCentimeters(valueInPixels: number): string {
  const centimeters = valueInPixels / PX_PER_CM;

  return `${centimeters.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })} cm`;
}

export function Ruler({
  controller
}: RulerProps): React.ReactElement | null {
  const { lang } = useI18n();

  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

  const rulerSectionRef =
    useRef<HTMLDivElement | null>(null);

  const dragRef =
    useRef<DragState | null>(null);

  const animationFrameRef =
    useRef<number | null>(null);

  const valuesRef = useRef<RulerValues>(
    getValuesFromController(controller)
  );

  const historyRef = useRef<RulerHistory>({
    undo: [],
    redo: []
  });

  const rulerHistoryActiveRef =
    useRef(false);

  const [values, setValuesState] =
    useState<RulerValues>(
      getValuesFromController(controller)
    );

  const [metrics, setMetrics] =
    useState<RulerMetrics>({
      baseWidth: controller.prefs().width || 800,
      zoom: 1,
      visualWidth: controller.prefs().width || 800,
      visualLeft: 0
    });

  const [activeMarker, setActiveMarker] =
    useState<RulerMarker | null>(null);

  const setValues = useCallback(
    (nextValues: RulerValues): void => {
      valuesRef.current = nextValues;
      setValuesState(nextValues);
    },
    []
  );

  /**
   * Mesure la page réelle et place la règle exactement au même endroit.
   *
   * On utilise getBoundingClientRect() plutôt qu’une largeur calculée à partir
   * des préférences. Cette mesure inclut directement le zoom CSS ainsi que la
   * position réelle après centrage ou défilement horizontal.
   */
  const measureEditor = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(
        animationFrameRef.current
      );
    }

    animationFrameRef.current =
      requestAnimationFrame(() => {
        animationFrameRef.current = null;

        const editor =
          document.getElementById('editor');

        const rulerSection =
          rulerSectionRef.current;

        if (
          !(editor instanceof HTMLElement) ||
          !rulerSection
        ) {
          return;
        }

        const editorRect =
          editor.getBoundingClientRect();

        const rulerSectionRect =
          rulerSection.getBoundingClientRect();

        const zoom = readZoom(editor);

        const measuredBaseWidth =
          editor.offsetWidth > 0
            ? editor.offsetWidth
            : editorRect.width / zoom;

        const measuredVisualWidth =
          editorRect.width > 0
            ? editorRect.width
            : measuredBaseWidth * zoom;

        const nextMetrics: RulerMetrics = {
          baseWidth: measuredBaseWidth,
          zoom,
          visualWidth: measuredVisualWidth,
          visualLeft:
            editorRect.left -
            rulerSectionRect.left
        };

        setMetrics((previous) => {
          const unchanged =
            Math.abs(
              previous.baseWidth -
                nextMetrics.baseWidth
            ) < 0.1 &&
            Math.abs(
              previous.zoom -
                nextMetrics.zoom
            ) < 0.001 &&
            Math.abs(
              previous.visualWidth -
                nextMetrics.visualWidth
            ) < 0.1 &&
            Math.abs(
              previous.visualLeft -
                nextMetrics.visualLeft
            ) < 0.1;

          return unchanged
            ? previous
            : nextMetrics;
        });
      });
  }, []);

  /**
   * Synchronise les valeurs locales lorsqu’on ouvre un autre chapitre ou
   * lorsque les préférences changent ailleurs dans l’application.
   */
  useEffect(() => {
    const nextValues =
      getValuesFromController(controller);

    valuesRef.current = nextValues;
    setValuesState(nextValues);
    applyValuesToDocument(nextValues);

    historyRef.current = {
      undo: [],
      redo: []
    };

    rulerHistoryActiveRef.current = false;
  }, [
    controller,
    activeTab,
    activeType
  ]);

  /**
   * Observe toutes les causes possibles d’un déplacement de la page :
   * redimensionnement, zoom, modification de largeur et défilement.
   */
  useEffect(() => {
    if (
      activeType !== 'chapter' ||
      !activeTab
    ) {
      return;
    }

    const editor =
      document.getElementById('editor');

    const editorScrollContainer =
      document.querySelector(
        '.editor-scroll-container'
      );

    const rulerSection =
      rulerSectionRef.current;

    if (
      !(editor instanceof HTMLElement) ||
      !(editorScrollContainer instanceof HTMLElement) ||
      !rulerSection
    ) {
      return;
    }

    measureEditor();

    const onResize = (): void => {
      measureEditor();
    };

    const onScroll = (): void => {
      measureEditor();
    };

    window.addEventListener(
      'resize',
      onResize
    );

    editorScrollContainer.addEventListener(
      'scroll',
      onScroll,
      {
        passive: true
      }
    );

    const resizeObserver =
      new ResizeObserver(() => {
        measureEditor();
      });

    resizeObserver.observe(editor);
    resizeObserver.observe(
      editorScrollContainer
    );
    resizeObserver.observe(rulerSection);

    /*
     * Le zoom est appliqué via l’attribut style de #editor. Le MutationObserver
     * permet donc de réaligner immédiatement la règle après Ctrl+molette ou
     * après l’utilisation des raccourcis de zoom.
     */
    const mutationObserver =
      new MutationObserver(() => {
        measureEditor();
      });

    mutationObserver.observe(editor, {
      attributes: true,
      attributeFilter: [
        'style',
        'class'
      ]
    });

    return () => {
      window.removeEventListener(
        'resize',
        onResize
      );

      editorScrollContainer.removeEventListener(
        'scroll',
        onScroll
      );

      resizeObserver.disconnect();
      mutationObserver.disconnect();

      if (
        animationFrameRef.current !== null
      ) {
        cancelAnimationFrame(
          animationFrameRef.current
        );

        animationFrameRef.current = null;
      }
    };
  }, [
    activeTab,
    activeType,
    measureEditor
  ]);

  const constrainValues = useCallback(
    (
      candidate: RulerValues,
      changedMarker: RulerMarker
    ): RulerValues => {
      const pageWidth = Math.max(
        metrics.baseWidth,
        1
      );

      let marginLeft = Math.max(
        MIN_MARGIN,
        candidate.marginLeft
      );

      let marginRight = Math.max(
        MIN_MARGIN,
        candidate.marginRight
      );

      if (
        changedMarker === 'left-margin'
      ) {
        marginLeft = Math.min(
          marginLeft,
          Math.max(
            MIN_MARGIN,
            pageWidth -
              marginRight -
              MIN_WRITING_WIDTH
          )
        );
      }

      if (
        changedMarker === 'right-margin'
      ) {
        marginRight = Math.min(
          marginRight,
          Math.max(
            MIN_MARGIN,
            pageWidth -
              marginLeft -
              MIN_WRITING_WIDTH
          )
        );
      }

      const maximumIndent = Math.max(
        MIN_INDENT,
        pageWidth -
          marginLeft -
          marginRight -
          20
      );

      const firstLineIndent = Math.min(
        maximumIndent,
        Math.max(
          MIN_INDENT,
          candidate.firstLineIndent
        )
      );

      return {
        marginLeft:
          roundValue(marginLeft),
        marginRight:
          roundValue(marginRight),
        firstLineIndent:
          roundValue(firstLineIndent)
      };
    },
    [metrics.baseWidth]
  );

  const persistValues = useCallback(
    (nextValues: RulerValues): void => {
      controller.updatePrefs({
        ...controller.prefs(),
        marginLeft:
          nextValues.marginLeft,
        marginRight:
          nextValues.marginRight,
        firstLineIndent:
          nextValues.firstLineIndent
      });
    },
    [controller]
  );

  const pushHistory = useCallback(
    (
      previousValues: RulerValues,
      nextValues: RulerValues
    ): void => {
      if (
        sameValues(
          previousValues,
          nextValues
        )
      ) {
        return;
      }

      const history =
        historyRef.current;

      history.undo.push(
        cloneValues(previousValues)
      );

      if (
        history.undo.length >
        MAX_RULER_HISTORY
      ) {
        history.undo.shift();
      }

      history.redo = [];
      rulerHistoryActiveRef.current = true;
    },
    []
  );

  const applyHistoryValues =
    useCallback(
      (nextValues: RulerValues): void => {
        setValues(nextValues);
        applyValuesToDocument(nextValues);
        persistValues(nextValues);
      },
      [
        persistValues,
        setValues
      ]
    );

  const undoRulerChange =
    useCallback((): boolean => {
      const history =
        historyRef.current;

      const previous =
        history.undo.pop();

      if (!previous) {
        rulerHistoryActiveRef.current =
          false;

        return false;
      }

      history.redo.push(
        cloneValues(valuesRef.current)
      );

      applyHistoryValues(previous);

      rulerHistoryActiveRef.current =
        history.undo.length > 0;

      return true;
    }, [applyHistoryValues]);

  const redoRulerChange =
    useCallback((): boolean => {
      const history =
        historyRef.current;

      const next = history.redo.pop();

      if (!next) {
        return false;
      }

      history.undo.push(
        cloneValues(valuesRef.current)
      );

      applyHistoryValues(next);
      rulerHistoryActiveRef.current = true;

      return true;
    }, [applyHistoryValues]);

  /**
   * Ctrl+Z annule en priorité le dernier changement de règle.
   *
   * Ctrl+Maj+Z et Ctrl+Y rétablissent le changement. L’écoute se fait en phase
   * de capture afin d’intervenir avant le gestionnaire d’historique du texte.
   */
  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent
    ): void => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        (!event.ctrlKey && !event.metaKey) ||
        isUnrelatedEditableElement(
          event.target
        )
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      const wantsUndo =
        key === 'z' && !event.shiftKey;

      const wantsRedo =
        (key === 'z' &&
          event.shiftKey) ||
        key === 'y';

      if (
        wantsUndo &&
        rulerHistoryActiveRef.current &&
        undoRulerChange()
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (
        wantsRedo &&
        historyRef.current.redo.length >
          0 &&
        redoRulerChange()
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    document.addEventListener(
      'keydown',
      onKeyDown,
      true
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKeyDown,
        true
      );
    };
  }, [
    redoRulerChange,
    undoRulerChange
  ]);

  /**
   * Une modification du contenu du chapitre rend à nouveau l’historique du
   * texte prioritaire sur celui de la règle.
   */
  useEffect(() => {
    const editor =
      document.getElementById('editor');

    if (!(editor instanceof HTMLElement)) {
      return;
    }

    const onEditorInput = (): void => {
      rulerHistoryActiveRef.current =
        false;
    };

    editor.addEventListener(
      'input',
      onEditorInput
    );

    return () => {
      editor.removeEventListener(
        'input',
        onEditorInput
      );
    };
  }, [activeTab]);

  const beginDrag = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      marker: RulerMarker
    ): void => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const startValues =
        cloneValues(valuesRef.current);

      dragRef.current = {
        marker,
        startClientX: event.clientX,
        startValues
      };

      setActiveMarker(marker);

      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    },
    []
  );

  const updateDrag = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>
    ): void => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      event.preventDefault();

      const visualDelta =
        event.clientX -
        drag.startClientX;

      let logicalDelta =
        visualDelta /
        Math.max(metrics.zoom, 0.01);

      /*
       * Le déplacement est aimanté au millimètre. Maintenir Alt permet un
       * déplacement libre plus précis.
       */
      if (!event.altKey) {
        logicalDelta =
          Math.round(
            logicalDelta / PX_PER_MM
          ) * PX_PER_MM;
      }

      let candidate =
        cloneValues(drag.startValues);

      if (
        drag.marker === 'left-margin'
      ) {
        candidate.marginLeft =
          drag.startValues.marginLeft +
          logicalDelta;
      } else if (
        drag.marker === 'right-margin'
      ) {
        candidate.marginRight =
          drag.startValues.marginRight -
          logicalDelta;
      } else {
        candidate.firstLineIndent =
          drag.startValues
            .firstLineIndent +
          logicalDelta;
      }

      candidate = constrainValues(
        candidate,
        drag.marker
      );

      setValues(candidate);
      applyValuesToDocument(candidate);
    },
    [
      constrainValues,
      metrics.zoom,
      setValues
    ]
  );

  const finishDrag = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>
    ): void => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      event.preventDefault();

      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      }

      dragRef.current = null;
      setActiveMarker(null);

      const finalValues =
        cloneValues(valuesRef.current);

      if (
        !sameValues(
          drag.startValues,
          finalValues
        )
      ) {
        pushHistory(
          drag.startValues,
          finalValues
        );

        persistValues(finalValues);
      }
    },
    [
      persistValues,
      pushHistory
    ]
  );

  const cancelDrag = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>
    ): void => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      event.preventDefault();

      dragRef.current = null;
      setActiveMarker(null);

      setValues(drag.startValues);
      applyValuesToDocument(
        drag.startValues
      );
    },
    [setValues]
  );

  const ticks = useMemo(() => {
    const count = Math.ceil(
      metrics.baseWidth / PX_PER_MM
    );

    /*
     * Lorsque la page est fortement dézoomée, un numéro tous les deux
     * centimètres évite que les valeurs se superposent.
     */
    const numberedCentimeterStep =
      metrics.zoom < 0.7 ? 2 : 1;

    return Array.from(
      {
        length: count + 1
      },
      (_, index) => {
        const isCentimeter =
          index % 10 === 0;

        const isHalfCentimeter =
          index % 5 === 0;

        const centimeter =
          index / 10;

        const showNumber =
          isCentimeter &&
          centimeter %
            numberedCentimeterStep ===
            0;

        return {
          index,
          left:
            index *
            PX_PER_MM *
            metrics.zoom,
          isCentimeter,
          isHalfCentimeter,
          showNumber,
          centimeter
        };
      }
    );
  }, [
    metrics.baseWidth,
    metrics.zoom
  ]);

  const leftMarginPosition =
    values.marginLeft *
    metrics.zoom;

  const rightMarginPosition =
    (metrics.baseWidth -
      values.marginRight) *
    metrics.zoom;

  const indentPosition =
    (values.marginLeft +
      values.firstLineIndent) *
    metrics.zoom;

  const activeMarkerPosition =
    activeMarker === 'left-margin'
      ? leftMarginPosition
      : activeMarker ===
          'right-margin'
        ? rightMarginPosition
        : activeMarker ===
            'first-line-indent'
          ? indentPosition
          : 0;

  const activeMarkerValue =
    activeMarker === 'left-margin'
      ? values.marginLeft
      : activeMarker ===
          'right-margin'
        ? values.marginRight
        : activeMarker ===
            'first-line-indent'
          ? values.firstLineIndent
          : 0;

  if (
    activeType !== 'chapter' ||
    !activeTab
  ) {
    return null;
  }

  return (
    <div
      ref={rulerSectionRef}
      className="editor-ruler-section"
      aria-label={
        lang === 'en'
          ? 'Page ruler'
          : 'Règle de la page'
      }
    >
      <div className="editor-ruler-viewport">
        <div
          className="editor-ruler"
          style={{
            width: `${metrics.visualWidth}px`,
            left: `${metrics.visualLeft}px`
          }}
        >
          <div
            className="ruler-margin-zone ruler-margin-zone-left"
            style={{
              width: `${Math.max(
                0,
                leftMarginPosition
              )}px`
            }}
          />

          <div
            className="ruler-margin-zone ruler-margin-zone-right"
            style={{
              width: `${Math.max(
                0,
                values.marginRight *
                  metrics.zoom
              )}px`
            }}
          />

          <div className="ruler-ticks">
            {ticks.map((tick) => (
              <span
                key={tick.index}
                className={[
                  'ruler-tick',
                  tick.isCentimeter
                    ? 'ruler-tick-centimeter'
                    : '',
                  tick.isHalfCentimeter
                    ? 'ruler-tick-half'
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: `${tick.left}px`
                }}
              >
                {tick.showNumber && (
                  <span className="ruler-tick-number">
                    {tick.centimeter}
                  </span>
                )}
              </span>
            ))}
          </div>

          <button
            type="button"
            className={[
              'ruler-marker',
              'ruler-marker-left',
              activeMarker ===
              'left-margin'
                ? 'active'
                : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: `${leftMarginPosition}px`
            }}
            title={`${markerLabel(
              'left-margin',
              lang
            )} : ${formatCentimeters(
              values.marginLeft
            )}`}
            aria-label={markerLabel(
              'left-margin',
              lang
            )}
            onPointerDown={(event) =>
              beginDrag(
                event,
                'left-margin'
              )
            }
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          />

          <button
            type="button"
            className={[
              'ruler-marker',
              'ruler-marker-right',
              activeMarker ===
              'right-margin'
                ? 'active'
                : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: `${rightMarginPosition}px`
            }}
            title={`${markerLabel(
              'right-margin',
              lang
            )} : ${formatCentimeters(
              values.marginRight
            )}`}
            aria-label={markerLabel(
              'right-margin',
              lang
            )}
            onPointerDown={(event) =>
              beginDrag(
                event,
                'right-margin'
              )
            }
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          />

          <button
            type="button"
            className={[
              'ruler-marker',
              'ruler-marker-indent',
              activeMarker ===
              'first-line-indent'
                ? 'active'
                : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: `${indentPosition}px`
            }}
            title={`${markerLabel(
              'first-line-indent',
              lang
            )} : ${formatCentimeters(
              values.firstLineIndent
            )}`}
            aria-label={markerLabel(
              'first-line-indent',
              lang
            )}
            onPointerDown={(event) =>
              beginDrag(
                event,
                'first-line-indent'
              )
            }
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          />

          {activeMarker && (
            <div
              className="ruler-drag-tooltip"
              style={{
                left: `${activeMarkerPosition}px`
              }}
            >
              {formatCentimeters(
                activeMarkerValue
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
