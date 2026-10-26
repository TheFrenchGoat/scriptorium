// src/renderer/components/editor/ChapterStatusMenu.tsx
//
// Menu ouvert par la pastille de couleur d’un chapitre (barre latérale) :
// état d’avancement, couleur libre et objectif de mots.
//
// Le menu est rendu dans un portail sous <body> pour ne pas être coupé par le
// défilement de la barre latérale. Il se ferme avec Échap, par un clic à
// l’extérieur, au défilement ou quand un autre menu s’ouvre.
// Les modifications en attente (couleur, objectif) sont enregistrées à la
// fermeture.

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../../i18n';
import { useExclusiveDropdown } from '../../lib/wb-workspace';
import {
  CHAPTER_STATUSES,
  CHAPTER_STATUS_COLORS,
  CHAPTER_TARGET_MAX,
  chapterColorOf,
  chapterProgress,
  chapterStatusOf
} from '../../lib/chapter-status';
import type {
  ChapterMeta,
  ChapterMetaPatch,
  ChapterStatus
} from '../../../shared/types';

type Translate = ReturnType<typeof useI18n>['t'];

const STATUS_KEYS = {
  todo: 'chapterStatusTodo',
  draft: 'chapterStatusDraft',
  revision: 'chapterStatusRevision',
  done: 'chapterStatusDone'
} as const;

const MENU_WIDTH = 240;
const COLOR_DELAY_MS = 300;

/** Nom de l’état dans la langue de l’interface. */
export function chapterStatusText(
  t: Translate,
  status: ChapterStatus
): string {
  return t(STATUS_KEYS[status]);
}

/** Texte du type : 1 200 / 3 000 mots (40 %). */
export function chapterTargetText(
  t: Translate,
  lang: string,
  words: number,
  target: number
): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const percent =
    target > 0
      ? Math.min(999, Math.round((words / target) * 100))
      : 0;

  return t('chapterTargetProgress')
    .replace('{words}', words.toLocaleString(locale))
    .replace('{target}', target.toLocaleString(locale))
    .replace('{percent}', String(percent));
}

/** Objectif saisi : entier positif, ou undefined si le champ est vide. */
function parseTarget(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');

  if (!digits) {
    return undefined;
  }

  const parsed = Math.min(Number(digits), CHAPTER_TARGET_MAX);
  return parsed >= 1 ? parsed : undefined;
}

/** Position du menu sous la pastille, sans sortir de la fenêtre. */
function computePosition(
  anchor: HTMLElement,
  height: number
): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - MENU_WIDTH - margin);
  const left = Math.min(Math.max(margin, rect.left - 4), maxLeft);
  let top = rect.bottom + 6;

  if (height > 0 && top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - height - 6);
  }

  return { top, left };
}

export interface ChapterStatusMenuProps {
  /** Pastille qui a ouvert le menu. */
  anchor: HTMLElement;
  chapterName: string;
  meta: ChapterMeta;
  /** Nombre de mots actuel du chapitre. */
  words: number;
  onChange: (chapterName: string, patch: ChapterMetaPatch) => void;
  onClose: () => void;
}

export function ChapterStatusMenu({
  anchor,
  chapterName,
  meta,
  words,
  onChange,
  onClose
}: ChapterStatusMenuProps): React.ReactElement {
  const { t, lang } = useI18n();

  const menuRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState(() =>
    computePosition(anchor, 0)
  );

  const status = chapterStatusOf(meta);
  const color = chapterColorOf(meta);
  const target = meta.targetWords;
  const progress = chapterProgress(words, meta);

  const [colorDraft, setColorDraft] = useState(color);
  const [targetDraft, setTargetDraft] = useState(
    target ? String(target) : ''
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pendingColorRef = useRef<string | null>(null);
  const colorTimerRef = useRef<number | null>(null);

  const targetDraftRef = useRef(targetDraft);
  targetDraftRef.current = targetDraft;

  const savedTargetRef = useRef<number | undefined>(target);

  const flushColor = (): void => {
    if (colorTimerRef.current !== null) {
      window.clearTimeout(colorTimerRef.current);
      colorTimerRef.current = null;
    }

    const pending = pendingColorRef.current;

    if (pending === null) {
      return;
    }

    pendingColorRef.current = null;
    onChangeRef.current(chapterName, { color: pending });
  };

  const flushTarget = (): void => {
    const next = parseTarget(targetDraftRef.current);

    if (next === savedTargetRef.current) {
      return;
    }

    savedTargetRef.current = next;
    onChangeRef.current(chapterName, { targetWords: next ?? null });
  };

  const flushColorRef = useRef(flushColor);
  flushColorRef.current = flushColor;

  const flushTargetRef = useRef(flushTarget);
  flushTargetRef.current = flushTarget;

  /* Un seul menu déroulant ouvert à la fois dans l’application. */
  useExclusiveDropdown(true, onClose);

  useLayoutEffect(() => {
    setPosition(
      computePosition(anchor, menuRef.current?.offsetHeight ?? 0)
    );
  }, [anchor]);

  /* Suit la couleur de l’état quand aucune couleur n’est en cours de choix. */
  useEffect(() => {
    if (pendingColorRef.current === null) {
      setColorDraft(color);
    }
  }, [color]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      const node = event.target;

      if (!(node instanceof Node)) {
        return;
      }

      if (menuRef.current?.contains(node) || anchor.contains(node)) {
        return;
      }

      onCloseRef.current();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      event.stopPropagation();
      onCloseRef.current();

      if (anchor.isConnected) {
        anchor.focus();
      }
    };

    const onScroll = (event: Event): void => {
      const node = event.target;

      if (node instanceof Node && menuRef.current?.contains(node)) {
        return;
      }

      onCloseRef.current();
    };

    const onResize = (): void => {
      onCloseRef.current();
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchor]);

  /* Enregistre la couleur et l’objectif en attente à la fermeture. */
  useEffect(() => {
    return () => {
      flushColorRef.current();
      flushTargetRef.current();
    };
  }, []);

  const selectStatus = (next: ChapterStatus): void => {
    if (next === status) {
      return;
    }

    onChange(chapterName, { status: next === 'todo' ? null : next });
  };

  const onColorInput = (value: string): void => {
    setColorDraft(value);
    pendingColorRef.current = value;

    if (colorTimerRef.current !== null) {
      window.clearTimeout(colorTimerRef.current);
    }

    colorTimerRef.current = window.setTimeout(() => {
      flushColorRef.current();
    }, COLOR_DELAY_MS);
  };

  const resetColor = (): void => {
    if (colorTimerRef.current !== null) {
      window.clearTimeout(colorTimerRef.current);
      colorTimerRef.current = null;
    }

    pendingColorRef.current = null;
    setColorDraft(CHAPTER_STATUS_COLORS[status]);
    onChange(chapterName, { color: null });
  };

  const commitTarget = (): void => {
    flushTarget();
    const saved = savedTargetRef.current;
    setTargetDraft(saved ? String(saved) : '');
  };

  return createPortal(
    <div
      ref={menuRef}
      className="chapter-status-menu"
      role="dialog"
      aria-label={`${t('chapterStatusMenuTitle')} : ${chapterName}`}
      style={{
        top: position.top,
        left: position.left,
        width: MENU_WIDTH
      }}
    >
      <div
        className="chapter-status-menu-title"
        title={chapterName}
      >
        {chapterName}
      </div>

      <div className="chapter-status-menu-section">
        {t('chapterStatusMenuTitle')}
      </div>

      <div
        className="chapter-status-menu-list"
        role="radiogroup"
        aria-label={t('chapterStatusMenuTitle')}
      >
        {CHAPTER_STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === status}
            className={`chapter-status-option${
              option === status ? ' active' : ''
            }`}
            onClick={() => {
              selectStatus(option);
            }}
          >
            <span
              className="chapter-status-swatch"
              style={{ background: CHAPTER_STATUS_COLORS[option] }}
              aria-hidden="true"
            />
            <span>{chapterStatusText(t, option)}</span>
            {option === status ? (
              <span
                className="chapter-status-check"
                aria-hidden="true"
              >
                {'\u2713'}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="chapter-status-menu-section">
        {t('chapterColorLabel')}
      </div>

      <div className="chapter-status-menu-row">
        <input
          type="color"
          className="chapter-status-color"
          value={colorDraft}
          aria-label={t('chapterColorLabel')}
          onChange={(event) => {
            onColorInput(event.target.value);
          }}
        />

        {meta.color !== undefined ? (
          <button
            type="button"
            className="chapter-status-link"
            onClick={resetColor}
          >
            {t('chapterColorReset')}
          </button>
        ) : null}
      </div>

      <div className="chapter-status-menu-section">
        {t('chapterTargetLabel')}
      </div>

      <div className="chapter-status-menu-row">
        <input
          type="text"
          inputMode="numeric"
          className="chapter-status-target"
          value={targetDraft}
          placeholder={t('chapterTargetPlaceholder')}
          aria-label={t('chapterTargetLabel')}
          onChange={(event) => {
            setTargetDraft(
              event.target.value.replace(/\D/g, '').slice(0, 8)
            );
          }}
          onBlur={commitTarget}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTarget();
            }
          }}
        />

        <span className="chapter-status-unit">
          {t('chapterTargetUnit')}
        </span>
      </div>

      {progress !== null && target ? (
        <div className="chapter-status-progress">
          <div className="chapter-status-track">
            <span
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: color
              }}
            />
          </div>

          <div className="chapter-status-progress-text">
            {chapterTargetText(t, lang, words, target)}
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
