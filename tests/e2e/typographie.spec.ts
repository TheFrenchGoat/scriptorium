// tests/e2e/typographie.spec.ts
// Onglet Typographie de Rechercher / Remplacer, sur un projet d'essai (un
// chapitre de trois paragraphes) : Analyser, Corriger, Ignorer, Tout corriger,
// Ctrl+Z, Aller a, puis enregistrement sur le disque.
// Les resultats attendus sont calcules avec le module de regles
// (src/shared/typography.ts, deja teste a part) : ces tests verifient le
// branchement dans l'editeur (liste, texte, annulation, sauvegarde).

import { expect, test } from '@playwright/test';
import { applyTypoIssues, findTypoIssues, type TypoIssue } from '../../src/shared/typography';
import { typoOptionsFor } from '../../src/shared/typography-project';
import { launchApp } from './app';
import {
  chapterHtml,
  diskParagraphs,
  editorParagraphs,
  editorSelection,
  htmlParagraphs,
  ignoredCases,
  novelConfig,
  openProject,
  openTypography,
  typoCount
} from './projet';

const PROJECT = 'Essai typo';
const CHAPTER = 'Chapitre 1';
const Q = String.fromCharCode(39);
const DQ = String.fromCharCode(34);

const P1 = 'L' + Q + 'ami d' + Q + 'Henri arrive ; il dit : bonjour !';
const P2 = 'Il  regarde le ciel...';
const P3 = 'Elle murmure ' + DQ + 'viens' + DQ + ' doucement.';
const ORIGINAL = [P1, P2, P3];

interface Plan {
  total: number;
  firstApostrophe: TypoIssue;
  afterFixOne: string[];
  afterFixAll: string[];
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Resultats attendus, calcules avec le module de regles (francais, reglages par defaut). */
function buildPlan(): Plan {
  const options = typoOptionsFor(undefined, 'fr');
  const issues = ORIGINAL.map((text) => findTypoIssues(text, options));
  const total = issues.reduce((sum, list) => sum + list.length, 0);
  const reportOnly = issues.reduce(
    (sum, list) => sum + list.filter((issue) => issue.replacement === null).length,
    0
  );
  expect(reportOnly, 'texte d essai : aucun cas seulement signale').toBe(0);
  for (const list of issues) {
    expect(list.length, 'texte d essai : au moins un cas par paragraphe').toBeGreaterThan(0);
  }
  const apostrophes = issues[0]
    .filter((issue) => issue.category === 'apostrophes')
    .sort((a, b) => a.start - b.start);
  expect(apostrophes.length, 'texte d essai : deux apostrophes droites').toBe(2);
  // Corriger : premier cas de la liste (apostrophe de L'ami).
  const afterFixOne = [applyTypoIssues(P1, [apostrophes[0]]), P2, P3];
  // Tout corriger : tout, sauf le cas ignore (apostrophe de d'Henri).
  const afterFixAll = ORIGINAL.map((text, index) =>
    applyTypoIssues(text, issues[index].filter((issue) => issue !== apostrophes[1]))
  );
  expect(afterFixOne[0]).not.toBe(P1);
  expect(afterFixAll[0]).toContain('d' + Q + 'Henri');
  console.log(
    'Cas attendus : ' + total + ' (' +
      issues.map((list) => list.map((issue) => issue.rule).join(', ')).join(' / ') + ')'
  );
  return { total, firstApostrophe: apostrophes[0], afterFixOne, afterFixAll };
}

test('Typographie : Analyser, Corriger, Ignorer, Tout corriger, Ctrl+Z, enregistrement', async () => {
  const plan = buildPlan();
  const launched = await launchApp(novelConfig(PROJECT, CHAPTER, ORIGINAL));
  let closed = false;
  try {
    const page = launched.page;
    const editor = await openProject(page, PROJECT);
    await expect.poll(() => editorParagraphs(page)).toEqual(ORIGINAL);

    // Analyser
    await openTypography(page);
    await page.locator('.typo-analyze-btn').click();
    await expect.poll(() => typoCount(page)).toBe(plan.total);
    const firstGroup = page.locator('.typo-group').first();
    await expect(firstGroup.locator('.typo-group-title')).toContainText('Apostrophes');

    // Corriger : seul le premier cas change.
    await firstGroup.locator('.typo-item').first().locator('.typo-item-actions button')
      .filter({ hasText: 'Corriger' }).click();
    await expect.poll(() => typoCount(page)).toBe(plan.total - 1);
    await expect.poll(() => editorParagraphs(page)).toEqual(plan.afterFixOne);

    // Ignorer : le cas quitte la liste, le texte ne change pas.
    await page.locator('.typo-group').first().locator('.typo-item').first()
      .locator('.typo-item-actions button').filter({ hasText: 'Ignorer' }).click();
    await expect.poll(() => typoCount(page)).toBe(plan.total - 2);
    await expect.poll(() => editorParagraphs(page)).toEqual(plan.afterFixOne);
    await expect(page.locator('.typo-restore-btn')).toContainText('(1)');

    // Tout corriger : tout sauf le cas ignore, puis enregistrement sur le disque.
    await page.locator('.replace-run-btn').click();
    await expect.poll(() => typoCount(page)).toBe(0);
    await expect.poll(() => editorParagraphs(page)).toEqual(plan.afterFixAll);
    await expect
      .poll(() => diskParagraphs(launched.dataDir, PROJECT, CHAPTER), { timeout: 20000 })
      .toEqual(plan.afterFixAll);

    // Ctrl+Z annule Tout corriger.
    await page.locator('.replace-close-btn').click();
    await expect(page.locator('.autorep-tab')).toHaveCount(0);
    await editor.click();
    await page.keyboard.press('Control+z');
    await expect.poll(() => editorParagraphs(page)).toEqual(plan.afterFixOne);

    // Ctrl+Z encore : annule Corriger (au plus deux appuis de plus, comptes).
    let presses = 1;
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(1000);
    while (presses < 3 && !same(await editorParagraphs(page), ORIGINAL)) {
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(1000);
      presses += 1;
    }
    console.log('Appuis sur Ctrl+Z pour annuler Corriger : ' + presses);
    expect(await editorParagraphs(page)).toEqual(ORIGINAL);
    await expect
      .poll(() => diskParagraphs(launched.dataDir, PROJECT, CHAPTER), { timeout: 20000 })
      .toEqual(ORIGINAL);

    // Fermeture : texte et cas ignore bien enregistres.
    closed = true;
    const config = await launched.closeAndRead();
    const html = chapterHtml(config, PROJECT, CHAPTER);
    expect(html === null ? null : htmlParagraphs(html)).toEqual(ORIGINAL);
    expect(ignoredCases(config, PROJECT)).toBe(1);
  } finally {
    if (!closed) await launched.close();
  }
});

test('Typographie : Aller a selectionne le passage dans l editeur', async () => {
  const plan = buildPlan();
  const launched = await launchApp(novelConfig(PROJECT, CHAPTER, ORIGINAL));
  try {
    const page = launched.page;
    await openProject(page, PROJECT);
    await expect.poll(() => editorParagraphs(page)).toEqual(ORIGINAL);

    await openTypography(page);
    await page.locator('.typo-analyze-btn').click();
    await expect.poll(() => typoCount(page)).toBe(plan.total);
    const firstGroup = page.locator('.typo-group').first();
    await expect(firstGroup.locator('.typo-group-title')).toContainText('Apostrophes');

    await firstGroup.locator('.typo-item').first().locator('.typo-item-actions button')
      .filter({ hasText: 'Aller' }).click();
    await expect(page.locator('.autorep-tab')).toHaveCount(0);
    await expect
      .poll(() => editorSelection(page))
      .toEqual({ paragraph: 0, offset: plan.firstApostrophe.start, text: Q });
    expect(await editorParagraphs(page)).toEqual(ORIGINAL);
  } finally {
    await launched.close();
  }
});
