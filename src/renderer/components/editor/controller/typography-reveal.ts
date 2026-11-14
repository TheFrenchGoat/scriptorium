// src/renderer/components/editor/controller/typography-reveal.ts
// Typographie (etape 2b-2) : montrer un cas dans l'editeur (bouton "Aller a").
// La fenetre ouvre le chapitre avec openItem, puis appelle
// revealTypographyCase jusqu'a ce que l'editeur affiche ce chapitre.

import { rangeForTypoIssue } from '../../../lib/typography-html';
import type { EditorController, TypoReportItem } from './types';

export interface TypographyRevealContext {
  s: {
    readonly activeType?: string;
    readonly activeTab?: string | null;
    readonly editorEl?: HTMLElement | null;
  };
}

export type TypographyRevealActions = Pick<EditorController, 'revealTypographyCase'>;

export function createTypographyReveal(ctx: TypographyRevealContext): TypographyRevealActions {
  const { s } = ctx;

  function revealTypographyCase(item: TypoReportItem): boolean {
    const editor = s.editorEl;
    if (s.activeType !== 'chapter' || s.activeTab !== item.chapter || !editor || !editor.isConnected) {
      return false;
    }
    const range = rangeForTypoIssue(editor, item);
    if (!range) return false;
    try {
      editor.focus({ preventScroll: true });
    } catch {
      // Focus impossible : la selection est tout de meme posee.
    }
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    const node = range.startContainer;
    const target = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (target) target.scrollIntoView({ block: 'center' });
    return true;
  }

  return { revealTypographyCase };
}
