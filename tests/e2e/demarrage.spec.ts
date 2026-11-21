// tests/e2e/demarrage.spec.ts
// Premier test : Scriptorium demarre avec un dossier de donnees temporaire,
// affiche l'ecran des projets, puis se ferme proprement.

import { expect, test } from '@playwright/test';
import { launchApp } from './app';

test('Scriptorium demarre avec un dossier de donnees temporaire', async () => {
  const launched = await launchApp();
  try {
    const page = launched.page;
    await expect(page.locator('#btnNewProject')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#btnImportProject')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/menu-page/);
  } finally {
    await launched.close();
  }
});
