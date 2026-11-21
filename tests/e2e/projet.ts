// tests/e2e/projet.ts
// Projets d'essai et gestes courants pour les tests automatiques : reglages
// initiaux, ouverture d'un projet, texte de l'editeur, texte enregistre sur
// le disque, onglet Typographie de Rechercher / Remplacer.

import { expect, type Locator, type Page } from '@playwright/test';
import { readConfig } from './app';

const NBSP = String.fromCharCode(160);
const WHATS_NEW_KEY = 'scriptorium.whatsNew.lastSeenVersion';

function escapeHtml(text: string): string {
  return text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

/** Reglages initiaux : un roman d'un chapitre (un paragraphe par texte), chapitre ouvert, interface en francais. */
export function novelConfig(name: string, chapter: string, paragraphs: readonly string[]): Record<string, unknown> {
  const html = paragraphs.map((text) => '<p>' + escapeHtml(text) + '</p>').join('');
  return {
    language: 'fr',
    theme: 'dark',
    currentProject: null,
    nativeSpellcheckEnabled: false,
    projects: {
      [name]: {
        projectType: 'novel',
 chapters: { [chapter]: html },
        world: {},
        wbFolders: [],
 wbRelationTypes: [],
        wbRelations: [],
 wbTimeline: [],
        writingSessions: [],
        goals: []
      }
    },
    uiState: {
      [name]: {
        openTabs: [{ name: chapter, type: 'chapter' }],
        activeTab: chapter,
 activeType: 'chapter'
      }
    }
  };
}

/** Ouvre un projet depuis l'ecran d'accueil et renvoie la zone d'ecriture. */
export async function openProject(page: Page, name: string): Promise<Locator> {
  const card = page.locator('#projectsList [role="button"][aria-label="' + name + '"]');
  await expect(card).toBeVisible({ timeout: 30000 });
  // La fenetre Nouveautes s'afficherait (projet present, aucune version vue)
  // et bloquerait les clics : une version future est marquee comme vue.
  await page.evaluate((key) => window.localStorage.setItem(key, '999.0.0'), WHATS_NEW_KEY);
  await page.reload();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.focus();
  await card.press('Enter');
  await expect(page.locator('body')).toHaveClass(/editor-page/, { timeout: 30000 });
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible({ timeout: 30000 });
  return editor;
}

/** Texte de chaque paragraphe non vide de la zone d'ecriture. */
export async function editorParagraphs(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#editor p')).map((p) => p.textContent || '')
  );
  return texts.filter((text) => text !== '');
}

export interface EditorSelection {
  paragraph: number;
  offset: number;
  text: string;
}

/** Selection courante dans la zone d'ecriture (paragraphe, position, texte), ou null. */
export async function editorSelection(page: Page): Promise<EditorSelection | null> {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const editorEl = document.getElementById('editor');
    if (!selection || selection.rangeCount === 0 || !editorEl) return null;
    const range = selection.getRangeAt(0);
    if (!editorEl.contains(range.startContainer)) return null;
    const paragraphs = Array.from(editorEl.querySelectorAll('p'));
    const index = paragraphs.findIndex((p) => p.contains(range.startContainer));
    if (index < 0) return null;
    const before = document.createRange();
    before.setStart(paragraphs[index], 0);
    before.setEnd(range.startContainer, range.startOffset);
    return { paragraph: index, offset: before.toString().length, text: range.toString() };
  });
}

/** Ouvre Rechercher / Remplacer sur l'onglet Typographie. */
export async function openTypography(page: Page): Promise<void> {
  await page.locator('button').filter({ hasText: 'Remplacer' }).filter({ hasNotText: 'Tout' }).first().click();
  const tab = page.locator('.autorep-tab').filter({ hasText: 'Typographie' });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('.typo-analyze-btn')).toBeVisible();
}

/** Nombre de cas affiche par l'onglet Typographie (0 : aucun ; -1 : pas encore analyse). */
export async function typoCount(page: Page): Promise<number> {
  const text = ((await page.locator('.typo-summary').first().textContent()) || '').trim();
  if (text.startsWith('Aucun')) return 0;
  const value = parseInt(text, 10);
  return Number.isNaN(value) ? -1 : value;
}

function stripTags(html: string): string {
  let out = '';
  let inTag = false;
  for (const ch of html) {
    if (ch === '<') inTag = true;
    else if (ch === '>') inTag = false;
    else if (!inTag) out += ch;
  }
  return out;
}

function decodeEntities(text: string): string {
  return text
    .split('&nbsp;').join(NBSP)
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&quot;').join('"')
    .split('&#39;').join("'")
    .split('&amp;').join('&');
}

/** Texte de chaque paragraphe non vide d'un chapitre enregistre (HTML). */
export function htmlParagraphs(html: string): string[] {
  const result: string[] = [];
  for (const part of html.split('</p>')) {
    const open = part.lastIndexOf('<p');
    if (open < 0) continue;
    const close = part.indexOf('>', open);
    if (close < 0) continue;
    const text = decodeEntities(stripTags(part.slice(close + 1)));
    if (text !== '') result.push(text);
  }
  return result;
}

interface StoredConfig {
  projects?: Record<string, { chapters?: Record<string, unknown>; typography?: { ignored?: unknown } }>;
}

/** HTML enregistre d'un chapitre, ou null. */
export function chapterHtml(config: unknown, project: string, chapter: string): string | null {
  const root = config as StoredConfig | null;
  const html = root?.projects?.[project]?.chapters?.[chapter];
  return typeof html === 'string' ? html : null;
}

/** Paragraphes du chapitre tel qu'il est enregistre sur le disque, ou null. */
export function diskParagraphs(dataDir: string, project: string, chapter: string): string[] | null {
  const html = chapterHtml(readConfig(dataDir), project, chapter);
  return html === null ? null : htmlParagraphs(html);
}

/** Nombre de cas typographiques ignores enregistres pour un projet (-1 : absent). */
export function ignoredCases(config: unknown, project: string): number {
  const root = config as StoredConfig | null;
  const list = root?.projects?.[project]?.typography?.ignored;
  return Array.isArray(list) ? list.length : -1;
}

/** Reglages initiaux : un roman de plusieurs chapitres (tous ouverts en onglets, le premier affiche). */
export function novelConfigChapters(
  name: string,
  chapters: ReadonlyArray<readonly [string, readonly string[]]>,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const html: Record<string, string> = {};
  for (const [chapter, paragraphs] of chapters) {
    html[chapter] = paragraphs.map((text) => '<p>' + escapeHtml(text) + '</p>').join('');
  }
  return {
    language: 'fr',
    theme: 'dark',
    currentProject: null,
    nativeSpellcheckEnabled: false,
    projects: {
      [name]: {
        projectType: 'novel',
 chapters: html,
        world: {},
        wbFolders: [],
 wbRelationTypes: [],
        wbRelations: [],
 wbTimeline: [],
        writingSessions: [],
        goals: [],
        ...(extra || {})
      }
    },
    uiState: {
      [name]: {
        openTabs: chapters.map(([chapter]) => ({ name: chapter, type: 'chapter' })),
        activeTab: chapters[0][0],
 activeType: 'chapter'
      }
    }
  };
}

/** Donne le focus a la zone d'ecriture et place le curseur a la fin du dernier texte. */
export async function caretAtEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editorEl = document.getElementById('editor');
    if (!editorEl) throw new Error('zone d ecriture absente');
    editorEl.focus();
    const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent || '') !== '') last = node as Text;
    }
    if (!last) throw new Error('aucun texte dans la zone d ecriture');
    const range = document.createRange();
    range.setStart(last, last.length);
    range.collapse(true);
    const selection = window.getSelection();
    if (!selection) throw new Error('selection indisponible');
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

export interface EditorBlocks {
  paragraphs: number;
  divs: number;
}

/** Nombre de paragraphes (vides compris) et de div dans la zone d'ecriture. */
export async function editorBlocks(page: Page): Promise<EditorBlocks> {
  return page.evaluate(() => {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return { paragraphs: -1, divs: -1 };
    return {
      paragraphs: editorEl.querySelectorAll('p').length,
      divs: editorEl.querySelectorAll('div').length
    };
  });
}

/** Affiche un chapitre deja ouvert en onglet (clic sur l'onglet). */
export async function switchToChapter(page: Page, chapter: string): Promise<void> {
  const tab = page.locator('#tabs [role="tab"]').filter({ hasText: chapter });
  await expect(tab).toHaveCount(1);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
