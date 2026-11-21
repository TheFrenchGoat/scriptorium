// playwright.config.ts
// Tests automatiques de Scriptorium (Electron), un test a la fois.
// Lancement : npm run test:e2e (construit l'application puis lance les tests).

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  globalTimeout: 900000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results'
});
