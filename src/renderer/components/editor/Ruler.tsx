// src/renderer/components/editor/Ruler.tsx
// Règle horizontale façon LibreOffice/Word, affichée au-dessus de la feuille
// d'écriture : deux triangles en bas de règle règlent les marges gauche/
// droite, un petit triangle sur la règle elle-même règle le retrait de
// première ligne de chaque paragraphe. Les graduations sont en centimètres,
// selon la correspondance standard du Web (1cm = 37.795px) : purement
// indicatif (l'éditeur n'imprime pas une page physique), mais cohérent avec
// les repères d'un vrai traitement de texte, et 800px (largeur par défaut)
// tombe tout près des 21cm d'une page A4.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import type { EditorController } from './useEditorController';

const PX_PER_CM = 37.795275591;
const SNAP_PX = PX_PER_CM / 10; // 1mm : valeurs rondes, faciles à comparer d'un côté à l'autre
const MARGIN_MIN = 20;
const MARGIN_MAX_RATIO = 0.4; // une marge ne peut pas dévorer plus de 40% de la feuille
const INDENT_MIN = -60;
const INDENT_MAX = 150;

function snapToMm(value: number): number {
  return Math.round(value / SNAP_PX) * SNAP_PX;
}

export interface RulerProps {
  controller: EditorController;
}

type DragTarget = 'marginLeft' | 'marginRight' | 'indent' | null;
interface DragValues {
  marginLeft: number;
  marginRight: number;
  indent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Ruler({ controller }: RulerProps): React.ReactElement {
  const { t } = useI18n();
  const prefs = controller.prefs();
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [rulerWidth, setRulerWidth] = useState(prefs.width);

  // Pendant un glisser-déposer, l'affichage suit la souris en direct
  // (dragValues) sans attendre la persistance ; au relâchement, la valeur
  // finale est écrite dans les préférences (voir onMouseUp) et dragValues
  // redevient null, l'affichage retombant alors sur `prefs`.
  const [dragValues, setDragValues] = useState<DragValues | null>(null);
  const dragTargetRef = useRef<DragTarget>(null);
  const dragStartRef = useRef({ x: 0, marginLeft: 0, marginRight: 0, indent: 0, width: 0 });

  const marginLeft = dragValues?.marginLeft ?? prefs.marginLeft ?? 80;
  const marginRight = dragValues?.marginRight ?? prefs.marginRight ?? 80;
  const indent = dragValues?.indent ?? prefs.firstLineIndent ?? 0;

  // La règle épouse la largeur RÉELLEMENT rendue de la feuille (même
  // variable CSS --editor-width, même conteneur centré) : sur une fenêtre
  // étroite, la feuille peut être plus fine que --editor-width, et les
  // positions de glisser-déposer doivent suivre cette largeur réelle, pas la
  // valeur théorique.
  useEffect(() => {
    const el = rulerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setRulerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pendant le glisser-déposer, applique tout de suite les valeurs en cours
  // sur la feuille elle-même (variables CSS), pour un retour visuel immédiat
  // — sans attendre l'écriture disque (qui n'a lieu qu'au relâchement).
  useEffect(() => {
    if (!dragValues) return;
    document.body.style.setProperty('--editor-margin-left', `${dragValues.marginLeft}px`);
    document.body.style.setProperty('--editor-margin-right', `${dragValues.marginRight}px`);
    document.body.style.setProperty('--editor-indent', `${dragValues.indent}px`);
  }, [dragValues]);

  const applyDrag = useCallback((clientX: number) => {
    const target = dragTargetRef.current;
    if (!target) return;
    const start = dragStartRef.current;
    const deltaX = clientX - start.x;
    const maxMargin = start.width * MARGIN_MAX_RATIO;

    if (target === 'marginLeft') {
      setDragValues({
        marginLeft: snapToMm(clamp(start.marginLeft + deltaX, MARGIN_MIN, maxMargin)),
        marginRight: start.marginRight,
        indent: start.indent
      });
    } else if (target === 'marginRight') {
      setDragValues({
        marginLeft: start.marginLeft,
        marginRight: snapToMm(clamp(start.marginRight - deltaX, MARGIN_MIN, maxMargin)),
        indent: start.indent
      });
    } else if (target === 'indent') {
      setDragValues({
        marginLeft: start.marginLeft,
        marginRight: start.marginRight,
        indent: snapToMm(clamp(start.indent + deltaX, INDENT_MIN, INDENT_MAX))
      });
    }
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragTargetRef.current) return;
      applyDrag(e.clientX);
    };
    const onMouseUp = () => {
      if (!dragTargetRef.current) return;
      dragTargetRef.current = null;
      setDragValues((current) => {
        if (current) {
          controller.updatePrefs({
            ...controller.prefs(),
            marginLeft: Math.round(current.marginLeft),
            marginRight: Math.round(current.marginRight),
            firstLineIndent: Math.round(current.indent)
          });
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [applyDrag, controller]);

  const startDrag = (target: DragTarget) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragTargetRef.current = target;
    dragStartRef.current = { x: e.clientX, marginLeft, marginRight, indent, width: rulerWidth };
    setDragValues({ marginLeft, marginRight, indent });
  };

  const rightHandleX = rulerWidth - marginRight;
  const totalCm = Math.max(0, Math.floor(rulerWidth / PX_PER_CM));
  const ticks = Array.from({ length: totalCm + 1 }, (_, i) => i);
  // La largeur de la feuille n'est presque jamais un nombre rond de
  // centimètres (800px ≈ 21,16cm) : sans repère dédié, la règle s'arrête
  // "dans le vide" après la dernière graduation entière, plusieurs
  // millimètres avant le bord réel de la feuille — ce qui rendait quasiment
  // impossible de régler des marges visuellement identiques des deux côtés.
  // Ce repère de bord, avec sa valeur exacte à la décimale près, marque la
  // vraie limite droite.
  const exactTotalCm = rulerWidth / PX_PER_CM;
  const showEdgeTick = exactTotalCm - totalCm > 0.05;

  return (
    <div className="editor-ruler-wrap">
      <div className="editor-ruler" ref={rulerRef}>
        {ticks.map((cm) => (
          <div key={cm} className="editor-ruler-tick" style={{ left: cm * PX_PER_CM }}>
            <span>{cm}</span>
          </div>
        ))}
        {showEdgeTick && (
          <div className="editor-ruler-tick editor-ruler-tick-edge" style={{ left: rulerWidth - 1 }}>
            <span>{exactTotalCm.toFixed(1)}</span>
          </div>
        )}

        <div className="editor-ruler-margin-zone" style={{ left: 0, width: Math.max(0, marginLeft) }} />
        <div
          className="editor-ruler-margin-zone"
          style={{ left: Math.max(0, rightHandleX), width: Math.max(0, marginRight) }}
        />

        {/* Info-bulles avec la valeur exacte (en cm) des deux marges,
            affichées ensemble pendant TOUT glisser-déposer : le seul moyen
            fiable de les rendre identiques des deux côtés est de comparer
            les nombres, pas d'aligner des graduations à l'œil. */}
        {dragValues && (
          <>
            <div className="editor-ruler-value-tip" style={{ left: marginLeft }}>
              {(marginLeft / PX_PER_CM).toFixed(1)} cm
            </div>
            <div className="editor-ruler-value-tip" style={{ left: rightHandleX }}>
              {(marginRight / PX_PER_CM).toFixed(1)} cm
            </div>
          </>
        )}

        <div
          className="editor-ruler-handle"
          style={{ left: marginLeft }}
          onMouseDown={startDrag('marginLeft')}
          title={t('rulerMarginLeftTitle')}
        />
        <div
          className="editor-ruler-handle"
          style={{ left: rightHandleX }}
          onMouseDown={startDrag('marginRight')}
          title={t('rulerMarginRightTitle')}
        />
        <div
          className="editor-ruler-indent-handle"
          style={{ left: marginLeft + indent }}
          onMouseDown={startDrag('indent')}
          title={t('rulerIndentTitle')}
        />
      </div>
    </div>
  );
}
