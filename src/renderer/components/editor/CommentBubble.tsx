/**
 * Bulle au survol d'un passage commente (romans).
 *
 * Apres une courte pause de la souris sur un passage surligne, affiche le
 * texte du commentaire et un bouton qui ouvre le panneau Notes sur lui.
 * Jamais pendant la frappe, ni en mode concentration, ni pour un
 * commentaire resolu.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import type { ChapterComment } from '../../../shared/types';
import { COMMENT_ATTR, isCommentId } from '../../lib/comments';

const SHOW_DELAY = 450;
const SWITCH_DELAY = 150;
const HIDE_DELAY = 250;
const TYPING_PAUSE = 800;
const MAX_CHARS = 280;
const BUBBLE_WIDTH = 320;

interface BubbleState {
  id: string;
  left: number;
  top: number;
  above: boolean;
}

interface CommentBubbleProps {
  comments: ChapterComment[];
  onShowInPanel: (id: string) => void;
}

/** Rectangle de la ligne survolee (un passage peut tenir sur plusieurs lignes). */
function lineRectAt(span: HTMLElement, y: number): DOMRect {
  const rects = Array.from(span.getClientRects());
  for (const rect of rects) {
    if (y >= rect.top - 2 && y <= rect.bottom + 2) return rect;
  }
  return rects[0] ?? span.getBoundingClientRect();
}

export function CommentBubble({ comments, onShowInPanel }: CommentBubbleProps): React.ReactElement | null {
  const { t } = useI18n();
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const targetId = useRef<string | null>(null);
  const shown = useRef(false);
  const lastKey = useRef(0);

  const clearTimers = (): void => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    showTimer.current = undefined;
    hideTimer.current = undefined;
  };

  const hideNow = (): void => {
    clearTimers();
    targetId.current = null;
    shown.current = false;
    setBubble(null);
  };

  useEffect(() => {
    const cancelHide = (): void => {
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    };
    const scheduleHide = (): void => {
      if (showTimer.current !== undefined) {
        window.clearTimeout(showTimer.current);
        showTimer.current = undefined;
      }
      if (!shown.current) {
        targetId.current = null;
        return;
      }
      if (hideTimer.current !== undefined) return;
      hideTimer.current = window.setTimeout(hideNow, HIDE_DELAY);
    };
    const onMove = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && bubbleRef.current && bubbleRef.current.contains(target)) {
        cancelHide();
        return;
      }
      const span = target ? target.closest<HTMLElement>(`#editor [${COMMENT_ATTR}]`) : null;
      const id = span ? span.getAttribute(COMMENT_ATTR) : null;
      if (!span || !id || !isCommentId(id)) {
        scheduleHide();
        return;
      }
      if (
        event.buttons !== 0 ||
        document.documentElement.classList.contains('focus-mode') ||
        Date.now() - lastKey.current < TYPING_PAUSE
      ) {
        return;
      }
      cancelHide();
      if (targetId.current === id) return;
      if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
      targetId.current = id;
      const x = event.clientX;
      const y = event.clientY;
      showTimer.current = window.setTimeout(() => {
        showTimer.current = undefined;
        if (!span.isConnected || targetId.current !== id) return;
        const rect = lineRectAt(span, y);
        const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 16);
        const left = Math.max(8, Math.min(x - 24, window.innerWidth - width - 8));
        const above = rect.bottom + 180 > window.innerHeight && rect.top > 180;
        shown.current = true;
        setBubble({ id, left, top: above ? rect.top - 6 : rect.bottom + 6, above });
      }, shown.current ? SWITCH_DELAY : SHOW_DELAY);
    };
    const onDown = (event: MouseEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && bubbleRef.current && bubbleRef.current.contains(target)) return;
      hideNow();
    };
    const onKey = (): void => {
      lastKey.current = Date.now();
      hideNow();
    };
    const onOut = (event: MouseEvent): void => {
      if (!event.relatedTarget) scheduleHide();
    };
    const onScroll = (): void => {
      hideNow();
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hideNow);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hideNow);
      clearTimers();
    };
  }, []);

  if (!bubble) return null;
  const comment = comments.find((item) => item.id === bubble.id);
  if (!comment || comment.resolved) return null;
  const text = comment.text.length > MAX_CHARS ? `${comment.text.slice(0, MAX_CHARS).trimEnd()}\u2026` : comment.text;

  return createPortal(
    <div
      ref={bubbleRef}
      className={`comment-bubble${bubble.above ? ' above' : ''}`}
      style={{ left: bubble.left, top: bubble.top }}
      role="tooltip"
    >
      <div className="comment-bubble-label">{t('commentBubbleLabel')}</div>
      <div className="comment-bubble-text">{text}</div>
      <button
        type="button"
        className="comment-bubble-btn"
        onMouseDown={(event) => { event.preventDefault(); }}
        onClick={() => {
          const id = bubble.id;
          hideNow();
          onShowInPanel(id);
        }}
      >
        {t('commentBubbleShow')}
      </button>
    </div>,
    document.body
  );
}
