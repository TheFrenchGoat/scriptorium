// tests/e2e/frappe.spec.ts
// Frappe dans un chapitre : texte, touche Entree, Ctrl+Z / Ctrl+Y, correction
// typographique pendant la frappe, changement de chapitre, puis enregistrement
// sur le disque et a la fermeture.
// Reperes du code : une etape d'annulation est enregistree apres 0,7 s sans
// frappe (HISTORY_DEBOUNCE_MS) ; le chapitre est enregistre 2,5 s apres la
// derniere frappe (CHAPTER_SAVE_DEBOUNCE_MS) ; l'historique est propre a
// chaque chapitre (src/renderer/lib/edit-history.ts).
// Les espaces insecables que Chromium met parfois pendant la frappe sont
// comptes comme des espaces simples (aucune ponctuation double ici).

import { expect, test, type Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from './app';
import {
  caretAtEnd,
  chapterHtml,
  diskParagraphs,
  editorBlocks,
  editorParagraphs,
  htmlParagraphs,
  novelConfig,
  novelConfigChapters,
  openProject,
  switchToChapter
} from './projet';

const Q = String.fromCharCode(39);
const RQ = String.fromCharCode(8217);
const NBSP = String.fromCharCode(160);
/** Pause plus longue que le regroupement de l'historique (0,7 s). */
const HISTORY_PAUSE_MS = 1200;
/** Attente maximale de l'enregistrement sur le disque (2,5 s prevues). */
const DISK_TIMEOUT_MS = 15000;

function plain(list: readonly string[] | null): string[] | null {
  return list === null ? null : list.map((text) => text.split(NBSP).join(' '));
}

async function shown(page: Page): Promise<string[] | null> {
  return plain(await editorParagraphs(page));
}

/** Attend que la frappe precedente devienne une etape d'annulation. */
async function pause(page: Page): Promise<void> {
  await page.waitForTimeout(HISTORY_PAUSE_MS);
}

/** Attend que le chapitre enregistre sur le disque ait le texte attendu. */
async function expectDisk(
  launched: LaunchedApp,
  project: string,
  chapter: string,
  expected: readonly string[]
): Promise<void> {
  await expect
    .poll(() => plain(diskParagraphs(launched.dataDir, project, chapter)), {
      timeout: DISK_TIMEOUT_MS,
      message: 'enregistrement sur le disque : ' + chapter
    })
    .toEqual(expected);
}

function savedParagraphs(config: unknown, project: string, chapter: string): string[] | null {
  const html = chapterHtml(config, project, chapter);
  return html === null ? null : plain(htmlParagraphs(html));
}

test('Frappe : texte, Entree, Ctrl+Z, Ctrl+Y, enregistrement', async () => {
  const PROJECT = 'Essai frappe';
  const CHAPTER = 'Chapitre 1';
  const START = ['Premier paragraphe.'];
  const STEP1 = ['Premier paragraphe. Suite.'];
  const STEP2 = ['Premier paragraphe. Suite.', 'Second paragraphe.'];
  const launched = await launchApp(novelConfig(PROJECT, CHAPTER, START));
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(() => shown(page)).toEqual(START);

    // Frappe simple
    await caretAtEnd(page);
    await page.keyboard.type(' Suite.');
    await expect.poll(() => shown(page)).toEqual(STEP1);
    await pause(page);

    // Entree : un nouveau paragraphe, sans paragraphe vide ni div parasite.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second paragraphe.');
    await expect.poll(() => shown(page)).toEqual(STEP2);
    await expect.poll(() => editorBlocks(page)).toEqual({ paragraphs: 2, divs: 0 });
    await expectDisk(launched, PROJECT, CHAPTER, STEP2);
    await pause(page);

    // Ctrl+Z : une etape a la fois, puis enregistrement de l'etat annule.
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown(page)).toEqual(STEP1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown(page)).toEqual(START);
    await expectDisk(launched, PROJECT, CHAPTER, START);

    // Ctrl+Y : retour au texte complet, enregistre a nouveau.
    await page.keyboard.press('Control+y');
    await expect.poll(() => shown(page)).toEqual(STEP1);
    await page.keyboard.press('Control+y');
    await expect.poll(() => shown(page)).toEqual(STEP2);
    await expect.poll(() => editorBlocks(page)).toEqual({ paragraphs: 2, divs: 0 });
    await expectDisk(launched, PROJECT, CHAPTER, STEP2);

    // Fermeture : le texte enregistre est le texte final.
    closed = true;
    const saved = await launched.closeAndRead();
    expect(savedParagraphs(saved, PROJECT, CHAPTER)).toEqual(STEP2);
  } finally {
    if (!closed) await launched.close();
  }
});

test('Frappe : correction typographique pendant la frappe et Ctrl+Z juste apres', async () => {
  const PROJECT = 'Essai frappe typo';
  const CHAPTER = 'Chapitre 1';
  const START = ['Debut.'];
  const FIXED = 'Debut. L' + RQ + 'ami';
  const FINAL = FIXED + ' d' + Q + 'Henri.';
  const launched = await launchApp(
    novelConfigChapters(PROJECT, [[CHAPTER, START]], {
      typography: { ignored: [], fixWhileTyping: true }
    })
  );
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(() => shown(page)).toEqual(START);

    // L'apostrophe droite tapee devient une apostrophe typographique.
    await caretAtEnd(page);
    await page.keyboard.type(' L' + Q + 'ami');
    await expect.poll(() => shown(page)).toEqual([FIXED]);
    await pause(page);

    // Ctrl+Z juste apres la correction : seule l'apostrophe redevient droite.
    await page.keyboard.type(' d' + Q);
    await expect.poll(() => shown(page)).toEqual([FIXED + ' d' + RQ]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown(page)).toEqual([FIXED + ' d' + Q]);

    // La frappe continue normalement apres l'apostrophe remise.
    await page.keyboard.type('Henri.');
    await expect.poll(() => shown(page)).toEqual([FINAL]);
    await expectDisk(launched, PROJECT, CHAPTER, [FINAL]);

    closed = true;
    const saved = await launched.closeAndRead();
    expect(savedParagraphs(saved, PROJECT, CHAPTER)).toEqual([FINAL]);
  } finally {
    if (!closed) await launched.close();
  }
});

test('Frappe : changement de chapitre, Ctrl+Z propre a chaque chapitre', async () => {
  const PROJECT = 'Essai chapitres';
  const C1 = 'Chapitre 1';
  const C2 = 'Chapitre 2';
  const ONE = ['Texte un.'];
  const TWO = ['Texte deux.'];
  const ONE_PLUS = ['Texte un. Ajout un.'];
  const TWO_PLUS = ['Texte deux. Ajout deux.'];
  const launched = await launchApp(novelConfigChapters(PROJECT, [[C1, ONE], [C2, TWO]]));
  let closed = false;
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(() => shown(page)).toEqual(ONE);

    // Frappe dans le chapitre 1, puis dans le chapitre 2.
    await caretAtEnd(page);
    await page.keyboard.type(' Ajout un.');
    await expect.poll(() => shown(page)).toEqual(ONE_PLUS);
    await pause(page);
    await switchToChapter(page, C2);
    await expect.poll(() => shown(page)).toEqual(TWO);
    await caretAtEnd(page);
    await page.keyboard.type(' Ajout deux.');
    await expect.poll(() => shown(page)).toEqual(TWO_PLUS);
    await pause(page);

    // Retour au chapitre 1 : texte intact ; Ctrl+Z n'annule que ce chapitre.
    await switchToChapter(page, C1);
    await expect.poll(() => shown(page)).toEqual(ONE_PLUS);
    await caretAtEnd(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown(page)).toEqual(ONE);

    // Chapitre 2 : toujours complet ; Ctrl+Z annule sa propre frappe.
    await switchToChapter(page, C2);
    await expect.poll(() => shown(page)).toEqual(TWO_PLUS);
    await caretAtEnd(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown(page)).toEqual(TWO);

    // Plus rien a annuler : un Ctrl+Z de plus ne change rien.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await shown(page)).toEqual(TWO);

    // Le chapitre 1 n'a pas ete touche par les Ctrl+Z du chapitre 2.
    await switchToChapter(page, C1);
    await expect.poll(() => shown(page)).toEqual(ONE);
    await expectDisk(launched, PROJECT, C1, ONE);
    await expectDisk(launched, PROJECT, C2, TWO);

    closed = true;
    const saved = await launched.closeAndRead();
    expect(savedParagraphs(saved, PROJECT, C1)).toEqual(ONE);
    expect(savedParagraphs(saved, PROJECT, C2)).toEqual(TWO);
  } finally {
    if (!closed) await launched.close();
  }
});
