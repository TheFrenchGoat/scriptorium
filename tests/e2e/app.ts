// tests/e2e/app.ts
// Lancement de Scriptorium pour les tests automatiques (Playwright).
// Chaque lancement utilise un dossier de donnees temporaire, neuf, supprime a
// la fermeture : les vrais projets de l'utilisateur ne sont jamais lus ni
// modifies. Si l'application n'utilise pas ce dossier, elle est arretee
// immediatement et le test echoue.

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  close: () => Promise<void>;
}

function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // Dossier temporaire laisse en place (fichier encore verrouille).
  }
}

function kill(app: ElectronApplication): void {
  try {
    app.process().kill();
  } catch {
    // Processus deja arrete.
  }
}

/** Lance Scriptorium. config : contenu initial du fichier de reglages (projets...). */
export async function launchApp(config?: Record<string, unknown>): Promise<LaunchedApp> {
  const mainFile = path.join(ROOT, 'dist', 'main', 'main.js');
  if (!fs.existsSync(mainFile)) throw new Error('dist/main/main.js absent : lancez npm run build.');
  const dataDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'scriptorium-e2e-')));
  if (config) fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config), 'utf8');

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  delete env.SCRIPTORIUM_DEV_SERVER;
  delete env.SCRIPTORIUM_DEBUG;
  delete env.ELECTRON_RUN_AS_NODE;
  env.SCRIPTORIUM_USER_DATA = dataDir;

  let app: ElectronApplication | null = null;
  try {
    app = await electron.launch({ args: [ROOT], cwd: ROOT, env });
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    if (path.resolve(userData).toLowerCase() !== path.resolve(dataDir).toLowerCase()) {
      kill(app);
      app = null;
      throw new Error('Dossier de donnees inattendu : ' + userData);
    }
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const launched = app;
    return {
      app: launched,
      page,
      dataDir,
      close: async () => {
        try {
          await launched.close();
        } finally {
          removeDir(dataDir);
 }
      }
    };
  } catch (error) {
    if (app) kill(app);
    removeDir(dataDir);
    throw error;
  }
}
