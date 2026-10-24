// src/shared/export-document.ts
// Document intermédiaire de l'export : une représentation simple du texte
// (chapitres, paragraphes, morceaux de texte mis en forme), produite par le
// renderer à partir du HTML de l'éditeur, puis transformée en PDF, Word,
// texte ou Markdown. Tous les formats partent ainsi du même contenu.

import type { ExportLayoutSettings } from './types';

/**
 * Morceau de texte d'une même mise en forme.
 *
 * `text === '\n'` représente un retour à la ligne forcé dans un paragraphe.
 */
export interface ExportRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Présents seulement si « garder la mise en forme de l'éditeur » est coché. */
  font?: string;
  sizePt?: number;
  /** Couleur hexadécimale sans # (6 caractères). */
  color?: string;
}

export type ExportAlign = 'center' | 'right';

export interface ExportParagraphBlock {
  kind: 'paragraph';
  runs: ExportRun[];
  /** Absent : alignement du modèle (gauche ou justifié). */
  align?: ExportAlign;
  /** Premier paragraphe d'une suite : pas de retrait de première ligne. */
  noIndent?: boolean;
}

export interface ExportEmptyBlock {
  kind: 'empty';
}

export interface ExportSeparatorBlock {
  kind: 'separator';
  /** Vide : simple ligne blanche. */
  symbol: string;
}

export type ExportBlock = ExportParagraphBlock | ExportEmptyBlock | ExportSeparatorBlock;

export interface ExportChapter {
  title: string;
  blocks: ExportBlock[];
}

/** Textes traduits insérés dans le document. */
export interface ExportDocumentLabels {
  tableOfContents: string;
}

export interface ExportDocument {
  /** Langue du document (attribut lang du HTML), par exemple 'fr'. */
  language: string;
  title: string;
  subtitle: string;
  /** Vide si l'auteur ne doit pas apparaître. */
  author: string;
  titlePage: boolean;
  tableOfContents: boolean;
  runningHeader: boolean;
  chapterOnNewPage: boolean;
  layout: ExportLayoutSettings;
  labels: ExportDocumentLabels;
  chapters: ExportChapter[];
}

export function hasTableOfContents(doc: ExportDocument): boolean {
  return doc.tableOfContents && doc.chapters.length > 0;
}

/** Le chapitre commence-t-il sur une nouvelle page ? */
export function chapterStartsNewPage(doc: ExportDocument, index: number): boolean {
  if (index === 0) {
    return doc.titlePage || hasTableOfContents(doc);
  }

  return doc.chapterOnNewPage;
}

/** Texte de l'en-tête de page : « Auteur - Titre » (tiret cadratin). */
export function getRunningHeaderText(doc: ExportDocument): string {
  return [doc.author, doc.title].filter((part) => part.trim() !== '').join(' \u2014 ');
}