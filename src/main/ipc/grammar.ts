// src/main/ipc/grammar.ts
// CORRECTEUR DE GRAMMAIRE HORS LIGNE — intégration LanguageTool
//
// LanguageTool n'est PAS embarqué dans Scriptorium (l'archive officielle pèse
// ~200 Mo et nécessite un Runtime Java) : soit l'utilisateur la télécharge et
// la dézippe lui-même puis indique le dossier, soit il utilise l'installation
// automatique ci-dessous. Scriptorium lance ensuite `languagetool-server.jar`
// comme process enfant Java et interroge ce serveur local (127.0.0.1) en HTTP
// — tout reste sur la machine, aucune donnée n'est envoyée en ligne.

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import AdmZip from 'adm-zip';
import { store } from '../store';
import type { GrammarMatch, GrammarPrefs, JavaInfo, LanguageToolFolderResult } from '../../shared/types';

/** Le process est lancé avec stdio: ['ignore', 'pipe', 'pipe'] : stdin est
 *  donc null (pas de type ChildProcessWithoutNullStreams, qui exige les trois
 *  flux ouverts), stdout/stderr sont des flux lisibles. */
type LanguageToolProcess = ChildProcessByStdio<null, Readable, Readable>;

const LANGUAGETOOL_DOWNLOAD_URL = 'https://languagetool.org/download/LanguageTool-stable.zip';

let languageToolProcess: LanguageToolProcess | null = null;
let languageToolReadyPort: number | null = null;

/** Cherche languagetool-server.jar directement dans le dossier choisi, ou dans
 *  l'un de ses sous-dossiers immédiats (cas typique : l'utilisateur sélectionne
 *  le dossier parent dans lequel il a dézippé "LanguageTool-6.x/"). */
function findLanguageToolJar(folderPath: string): string | null {
  try {
    const direct = path.join(folderPath, 'languagetool-server.jar');
    if (fs.existsSync(direct)) return direct;

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = path.join(folderPath, entry.name, 'languagetool-server.jar');
        if (fs.existsSync(nested)) return nested;
      }
    }
  } catch {
    /* dossier illisible ou inexistant : pas de jar trouvé */
  }
  return null;
}

/** Traduit les codes d'erreur réseau Node.js bruts (peu clairs pour un
 *  utilisateur non technique) en messages compréhensibles. Le message brut
 *  d'origine reste utilisé si le code n'est pas reconnu. */
function friendlyNetworkError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code;
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return "Impossible de joindre languagetool.org : vérifiez votre connexion Internet (ou un pare-feu/proxy qui bloquerait l'accès), puis réessayez.";
    case 'ECONNREFUSED':
      return 'Connexion refusée par le serveur de téléchargement. Réessayez plus tard.';
    case 'ECONNRESET':
      return 'La connexion a été interrompue pendant le téléchargement. Réessayez.';
    case 'ETIMEDOUT':
      return 'Le téléchargement a expiré (délai dépassé). Vérifiez votre connexion et réessayez.';
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return 'Le certificat de sécurité du site de téléchargement est invalide (réseau ou proxy suspect).';
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (fraction: number) => void,
  redirectCount = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Trop de redirections lors du téléchargement.'));
      return;
    }

    const request = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve(downloadFile(res.headers.location, destPath, onProgress, redirectCount + 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`Téléchargement échoué (HTTP ${status}).`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) onProgress(downloadedBytes / totalBytes);
      });
      res.on('error', (err) => reject(new Error(friendlyNetworkError(err))));
      fileStream.on('error', (err) => reject(new Error(friendlyNetworkError(err))));
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => resolve()));
    });

    // Sans timeout explicite, une connexion qui ne répond jamais (réseau
    // filtré, proxy captif...) laisserait la promesse indéfiniment en
    // attente, avec une barre de progression bloquée à 0% sans aucun message.
    request.setTimeout(20000, () => {
      const timeoutError = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
      request.destroy(timeoutError);
    });
    request.on('error', (err) => reject(new Error(friendlyNetworkError(err))));
  });
}

function waitForServerReady(
  proc: LanguageToolProcess,
  port: number,
  timeoutMs = 60000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let stderrTail = '';

  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000); // on ne garde que la fin
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    // Si le process Java meurt avant d'avoir répondu (port déjà utilisé, jar
    // corrompu, classe introuvable...), on le signale IMMÉDIATEMENT avec le
    // vrai message d'erreur, au lieu d'attendre bêtement le timeout de 60s.
    const onExit = (code: number | null) => {
      if (settled) return;
      settled = true;
      const detail = stderrTail.trim();
      reject(
        new Error(
          `Le serveur LanguageTool s'est arrêté avant d'être prêt (code ${code}).` +
            (detail ? `\nDétail : ${detail}` : " Aucune sortie d'erreur capturée.")
        )
      );
    };
    proc.once('exit', onExit);

    void (async function poll(): Promise<void> {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        proc.removeListener('exit', onExit);
        reject(new Error('Délai dépassé (le serveur met parfois du temps à démarrer la première fois).'));
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/v2/languages`);
        if (res.ok) {
          settled = true;
          proc.removeListener('exit', onExit);
          resolve(true);
          return;
        }
      } catch {
        /* pas encore prêt, on réessaie */
      }
      setTimeout(() => void poll(), 500);
    })();
  });
}

export function registerGrammarIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('store:get-grammar-prefs', () => store.get('grammarPrefs'));
  ipcMain.handle('store:save-grammar-prefs', (_e, prefs: Partial<GrammarPrefs>) => {
    store.set('grammarPrefs', { ...store.get('grammarPrefs'), ...prefs });
    return store.get('grammarPrefs');
  });

  ipcMain.handle('dialog:select-languagetool-folder', async (): Promise<LanguageToolFolderResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner le dossier LanguageTool',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const folderPath = result.filePaths[0];
    const jarPath = findLanguageToolJar(folderPath);
    if (!jarPath) return { canceled: false, valid: false };

    store.set('grammarPrefs', { ...store.get('grammarPrefs'), languageToolPath: folderPath });
    return { canceled: false, valid: true, folderPath };
  });

  // --- INSTALLATION AUTOMATIQUE — un seul bouton télécharge l'archive
  // "stable" officielle, l'extrait dans le dossier de données de
  // l'application et configure le chemin. Java reste à la charge de
  // l'utilisateur (impossible à embarquer proprement multiplateforme).
  ipcMain.handle('grammar:auto-install', async () => {
    const installDir = path.join(app.getPath('userData'), 'languagetool');
    const zipPath = path.join(app.getPath('temp'), `scriptorium-languagetool-${Date.now()}.zip`);

    const sendProgress = (phase: 'download' | 'extract', percent: number) => {
      getWindow()?.webContents.send('grammar:install-progress', { phase, percent });
    };

    try {
      fs.mkdirSync(installDir, { recursive: true });

      sendProgress('download', 0);
      await downloadFile(LANGUAGETOOL_DOWNLOAD_URL, zipPath, (fraction) => {
        sendProgress('download', Math.round(fraction * 100));
      });

      sendProgress('extract', 0);
      const zip = new AdmZip(zipPath);

      // Défense en profondeur contre le "Zip Slip" : même si adm-zip bloque
      // déjà les chemins qui sortent du dossier cible via des "../", on
      // revérifie nous-mêmes chaque entrée avant extraction.
      const resolvedInstallDir = path.resolve(installDir) + path.sep;
      zip.getEntries().forEach((entry) => {
        const resolvedEntryPath = path.resolve(installDir, entry.entryName);
        if (
          !resolvedEntryPath.startsWith(resolvedInstallDir) &&
          resolvedEntryPath !== path.resolve(installDir)
        ) {
          throw new Error(`Archive LanguageTool invalide : entrée suspecte "${entry.entryName}".`);
        }
      });

      zip.extractAllTo(installDir, true);
      sendProgress('extract', 100);

      fs.unlink(zipPath, () => {}); // best-effort

      const jarPath = findLanguageToolJar(installDir);
      if (!jarPath) {
        throw new Error(
          "L'archive téléchargée ne contient pas languagetool-server.jar (format inattendu, réessayez plus tard)."
        );
      }

      store.set('grammarPrefs', { ...store.get('grammarPrefs'), languageToolPath: installDir });
      return { success: true, folderPath: installDir };
    } catch (err) {
      fs.unlink(zipPath, () => {});
      throw err;
    }
  });

  // `java -version` écrit sur stderr (comportement historique de la JVM). On ne
  // se contente pas de vérifier que Java existe : LanguageTool récent nécessite
  // Java 17+, en dessous le .jar ne charge même pas.
  ipcMain.handle(
    'grammar:check-java',
    () =>
      new Promise<JavaInfo>((resolve) => {
        execFile('java', ['-version'], (error, stdout, stderr) => {
          if (error) {
            resolve({ available: false, major: null, outdated: false });
            return;
          }

          const output = stderr || stdout || '';
          const match = output.match(/version "(\d+)(?:\.(\d+))?/);
          let major: number | null = null;
          if (match) {
            const first = parseInt(match[1], 10);
            // Ancien schéma ("1.8.0_301" -> Java 8) vs nouveau schéma depuis
            // Java 9/JEP 223 ("17.0.2" -> 17, "21" -> 21).
            major = first === 1 ? parseInt(match[2] ?? '0', 10) : first;
          }

          resolve({ available: true, major, outdated: major !== null && major < 17 });
        });
      })
  );

  ipcMain.handle('grammar:start-server', async () => {
    const prefs = store.get('grammarPrefs');
    if (!prefs.languageToolPath) throw new Error('Aucun dossier LanguageTool configuré.');

    const jarPath = findLanguageToolJar(prefs.languageToolPath);
    if (!jarPath) throw new Error('languagetool-server.jar introuvable dans le dossier configuré.');

    // Déjà démarré sur ce port : rien à refaire.
    if (languageToolProcess && languageToolReadyPort === prefs.port) {
      return { port: prefs.port };
    }

    if (languageToolProcess) {
      languageToolProcess.kill();
      languageToolProcess = null;
      languageToolReadyPort = null;
      // Laisser le temps au précédent process de libérer le port.
      await new Promise((r) => setTimeout(r, 300));
    }

    languageToolProcess = spawn(
      'java',
      ['-cp', jarPath, 'org.languagetool.server.HTTPServer', '--port', String(prefs.port)],
      // On capture stdout/stderr (au lieu de 'ignore') pour pouvoir
      // diagnostiquer un échec de démarrage au lieu de le passer sous silence.
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const currentProcess = languageToolProcess;

    const clearIfCurrent = () => {
      if (languageToolProcess === currentProcess) {
        languageToolProcess = null;
        languageToolReadyPort = null;
        // Le renderer garde son propre état "serveur prêt" en mémoire : sans
        // ce signal, un crash du process Java après un démarrage réussi
        // laissait le renderer croire le serveur toujours en ligne.
        getWindow()?.webContents.send('grammar:server-stopped');
      }
    };
    currentProcess.on('error', clearIfCurrent);
    currentProcess.on('exit', clearIfCurrent);

    try {
      await waitForServerReady(currentProcess, prefs.port);
    } catch (err) {
      if (languageToolProcess === currentProcess) {
        currentProcess.kill();
        languageToolProcess = null;
        languageToolReadyPort = null;
      }
      throw err;
    }

    languageToolReadyPort = prefs.port;
    return { port: prefs.port };
  });

  ipcMain.handle(
    'grammar:check-text',
    async (_e, { text, language }: { text: string; language: string }): Promise<GrammarMatch[]> => {
      const prefs = store.get('grammarPrefs');
      if (!languageToolProcess || languageToolReadyPort !== prefs.port) {
        throw new Error("Le serveur LanguageTool local n'est pas démarré.");
      }

      const body = new URLSearchParams({
        text: text || '',
        language: language || 'fr',
        enabledOnly: 'false'
      });

      const res = await fetch(`http://127.0.0.1:${prefs.port}/v2/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!res.ok) {
        // LanguageTool répond en général avec un corps JSON {"message": "..."}
        // bien plus utile que le simple code HTTP pour diagnostiquer.
        let detail = '';
        try {
          const errBody = (await res.json()) as { message?: string };
          detail = errBody?.message ? ` : ${errBody.message}` : '';
        } catch {
          /* corps non-JSON, on garde juste le code HTTP */
        }
        throw new Error(`Réponse HTTP ${res.status} du serveur LanguageTool${detail}`);
      }

      const data = (await res.json()) as {
        matches?: {
          offset: number;
          length: number;
          message?: string;
          shortMessage?: string;
          rule?: { id?: string };
          replacements?: { value: string }[];
        }[];
      };

      return (data.matches ?? []).map((m) => ({
        offset: m.offset,
        length: m.length,
        message: m.shortMessage || m.message || '',
        ruleId: m.rule?.id ?? '',
        replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value)
      }));
    }
  );
}

export function stopGrammarServer(): void {
  if (languageToolProcess) {
    languageToolProcess.kill();
    languageToolProcess = null;
    languageToolReadyPort = null;
  }
}
