// tests/e2e/separateurs.spec.ts
// Separateurs de scene (onglet Typographie) : Reperer, Uniformiser,
// Ctrl+Z / Ctrl+Y et Aller a dans un autre chapitre.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { launchApp } from './app';
import {
  caretAtEnd,
  chapterHtml,
  diskParagraphs,
  editorParagraphs,
  htmlParagraphs,
  novelConfig,
  novelConfigChapters,
  openProject,
  openTypography,
} from './projet';

const PROJECT = 'Roman separateurs';
const CHAPTER = 'Chapitre 1';
const CHAPTER_ONE = 'Chapitre un';
const CHAPTER_TWO = 'Chapitre deux';
const EM_DASH = String.fromCharCode(0x2014);
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const DISK_TIMEOUT = 15000;

// 4 separateurs (***, * * *, ***, ~ ~ ~) ; la ligne avec *** au milieu
// d'une phrase et le tiret seul ne sont pas des separateurs.
const ORIGINAL: string[] = [
  'Premiere scene.',
  '***',
  'Deuxieme scene.',
  '* * *',
  'Troisieme scene, avec une ligne *** au milieu.',
  '***',
  'Quatrieme scene.',
  '~ ~ ~',
  'Cinquieme scene.',
  EM_DASH,
  'Fin.',
];

const UNIFIED: string[] = [
  'Premiere scene.',
  '* * *',
  'Deuxieme scene.',
  '* * *',
  'Troisieme scene, avec une ligne *** au milieu.',
  '* * *',
  'Quatrieme scene.',
  '* * *',
  'Cinquieme scene.',
  EM_DASH,
  'Fin.',
];

const CHAPTER_ONE_TEXT: string[] = ['Texte un.', 'Rien ici.'];
const CHAPTER_TWO_TEXT: string[] = ['Debut.', '***', 'Milieu.', '~ ~ ~', 'Fin.'];

function clean(list: readonly string[] | null): string[] {
  if (!list) return [];
  return list
    .map((text) => text.split(NBSP).join(' ').split(NNBSP).join(' ').trim())
    .filter((text) => text !== '');
}

function separators(page: Page): Locator {
  return page.locator('.typo-separators');
}

function styleButton(page: Page, symbol: string): Locator {
  return separators(page).getByRole('button', { name: symbol, exact: true });
}

async function findSeparators(page: Page): Promise<void> {
  await separators(page).getByRole('button', { name: /^Rep.rer/ }).click();
}

async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  try {
    await expect(separators(page)).toBeHidden({ timeout: 3000 });
  } catch {
    await page.getByRole('button', { name: /Fermer|Close/ }).first().click();
    await expect(separators(page)).toBeHidden({ timeout: 5000 });
  }
}

async function chooseWholeBook(page: Page): Promise<void> {
  const candidates = page.locator('.modal-content button, .modal-content label');
  const texts = await candidates.evaluateAll((elements) =>
    elements.map((element) => {
      if (element.closest('.typo-separators')) return '';
      const box = (element as HTMLElement).getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return '';
      return (element.textContent || '').trim();
    }),
  );
    const index = texts.findIndex((text) => /livre|projet/i.test(text) && text.length < 40);
  if (index < 0) {
    throw new Error(
      'Choix de portee "tout le livre" introuvable. Textes vus : ' +
        texts.filter((text) => text !== '').join(' | '),
    );
  }
  await candidates.nth(index).click();
}

async function selectedText(page: Page): Promise<string> {
  const text = await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    const editor = document.getElementById('editor');
    const node = selection.anchorNode;
    if (!editor || !node || !editor.contains(node)) return '(hors de l editeur)';
    return selection.toString();
  });
  return clean([text]).join('');
}

test('Separateurs : Reperer trouve les separateurs et leurs formes sans rien modifier', async () => {
  test.setTimeout(120000);
  const launched = await launchApp(novelConfig(PROJECT, CHAPTER, ORIGINAL));
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(ORIGINAL);

    await openTypography(page);
    const sep = separators(page);
    await findSeparators(page);
    await expect(sep.locator('.replace-count')).toHaveText(/4 s.parateur.*3 forme/);
    await expect(sep.locator('.typo-item-head > span:first-child')).toHaveText(['***', '* * *', '~ ~ ~']);
    await expect(sep.locator('.typo-group-count')).toHaveText(['2', '1', '1']);
    await expect(sep.getByRole('button', { name: /^Aller/ })).toHaveCount(3);

    // Modele propose : la forme la plus frequente.
    await expect(styleButton(page, '***')).toHaveAttribute('aria-pressed', 'true');
    await expect(sep.getByRole('button', { name: 'Uniformiser', exact: true })).toBeEnabled();

    await styleButton(page, '* * *').click();
    await expect(styleButton(page, '* * *')).toHaveAttribute('aria-pressed', 'true');
    await expect(styleButton(page, '***')).toHaveAttribute('aria-pressed', 'false');

    await closeDialog(page);
    expect(clean(await editorParagraphs(page))).toEqual(ORIGINAL);

    const config = await launched.closeAndRead();
    closed = true;
    expect(clean(htmlParagraphs(chapterHtml(config, PROJECT, CHAPTER) ?? ''))).toEqual(ORIGINAL);
  } finally {
    if (!closed) {
      try {
        await launched.close();
      } catch {
        // Deja fermee.
      }
    }
  }
});

test('Separateurs : Uniformiser, Ctrl+Z, Ctrl+Y et enregistrement', async () => {
  test.setTimeout(120000);
  const launched = await launchApp(novelConfig(PROJECT, CHAPTER, ORIGINAL));
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(ORIGINAL);

    await openTypography(page);
    const sep = separators(page);
    await findSeparators(page);
    await expect(sep.locator('.replace-count')).toHaveText(/4 s.parateur.*3 forme/);

    await styleButton(page, '* * *').click();
    const unify = sep.getByRole('button', { name: 'Uniformiser', exact: true });
    await expect(unify).toBeEnabled();
    await unify.click();

    await expect(sep.locator('.typo-message').filter({ hasText: /3 s.parateur.*1 chapitre/ })).toBeVisible();
    await expect(sep.locator('.replace-count')).toHaveText(/4 s.parateur.*1 forme/);
    await expect(unify).toBeDisabled();

    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(UNIFIED);
    await expect
      .poll(() => clean(diskParagraphs(launched.dataDir, PROJECT, CHAPTER)), { timeout: DISK_TIMEOUT })
      .toEqual(UNIFIED);

    // Ctrl+Z dans l'editeur : les formes d'origine reviennent.
    await closeDialog(page);
    await caretAtEnd(page);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(ORIGINAL);
    await expect
      .poll(() => clean(diskParagraphs(launched.dataDir, PROJECT, CHAPTER)), { timeout: DISK_TIMEOUT })
      .toEqual(ORIGINAL);

    // Ctrl+Y : l'uniformisation est retablie.
    await page.keyboard.press('Control+y');
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(UNIFIED);
    await expect
      .poll(() => clean(diskParagraphs(launched.dataDir, PROJECT, CHAPTER)), { timeout: DISK_TIMEOUT })
      .toEqual(UNIFIED);

    const config = await launched.closeAndRead();
    closed = true;
    expect(clean(htmlParagraphs(chapterHtml(config, PROJECT, CHAPTER) ?? ''))).toEqual(UNIFIED);
  } finally {
    if (!closed) {
      try {
        await launched.close();
      } catch {
        // Deja fermee.
      }
    }
  }
});

test('Separateurs : portee, Aller a ouvre le bon chapitre et selectionne le separateur', async () => {
  test.setTimeout(120000);
  const launched = await launchApp(
    novelConfigChapters(PROJECT, [
      [CHAPTER_ONE, CHAPTER_ONE_TEXT],
      [CHAPTER_TWO, CHAPTER_TWO_TEXT],
    ]),
  );
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(CHAPTER_ONE_TEXT);

    await openTypography(page);
    const sep = separators(page);

    // Portee "chapitre ouvert" : rien dans le chapitre un.
    await findSeparators(page);
    await expect(sep.locator('.replace-count')).toHaveText(/Aucun s.parateur/);

    // Portee "tout le livre" : les deux separateurs du chapitre deux.
    await chooseWholeBook(page);
    await findSeparators(page);
    await expect(sep.locator('.replace-count')).toHaveText(/2 s.parateur.*2 forme/);
    await expect(sep.locator('.typo-item-head > span:first-child')).toHaveText(['***', '~ ~ ~']);

    await sep.locator('.typo-item').nth(1).getByRole('button', { name: /^Aller/ }).click();
    await expect(separators(page)).toBeHidden();
    await expect(page.locator('#tabs [role="tab"][aria-selected="true"]')).toContainText(CHAPTER_TWO);
    await expect.poll(async () => clean(await editorParagraphs(page))).toEqual(CHAPTER_TWO_TEXT);
    await expect.poll(() => selectedText(page), { timeout: 10000 }).toBe('~ ~ ~');

    const config = await launched.closeAndRead();
    closed = true;
    expect(clean(htmlParagraphs(chapterHtml(config, PROJECT, CHAPTER_ONE) ?? ''))).toEqual(CHAPTER_ONE_TEXT);
    expect(clean(htmlParagraphs(chapterHtml(config, PROJECT, CHAPTER_TWO) ?? ''))).toEqual(CHAPTER_TWO_TEXT);
  } finally {
    if (!closed) {
      try {
        await launched.close();
      } catch {
 // Deja fermee.
      }
    }
  }
});