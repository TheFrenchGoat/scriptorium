// src/main/ipc/grammar.ts
// CORRECTEUR DE GRAMMAIRE HORS LIGNE — intégration LanguageTool
//
// LanguageTool n'est PAS embarqué dans Scriptorium (l'archive officielle pèse
// plusieurs centaines de Mo et nécessite un Runtime Java) : soit l'utilisateur
// la télécharge et la dézippe lui-même puis indique le dossier, soit il utilise
// l'installation automatique ci-dessous. Scriptorium lance ensuite
// `languagetool-server.jar` comme process enfant Java et interroge ce serveur
// local (127.0.0.1) en HTTP — tout reste sur la machine, aucune donnée n'est
// envoyée en ligne.
//
// CORRECTION EXIGEANTE : le réglage `picky` des préférences (activé par
// défaut) ajoute `level=picky` à chaque requête, ce qui active les règles
// supplémentaires de LanguageTool (style, typographie, répétitions...).

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

/** Taille maximale d'un envoi : les longs chapitres sont découpés entre deux
 *  paragraphes pour garder des temps de réponse raisonnables. */
const MAX_CHUNK_LENGTH = 20000;

/** Délai maximal d'une requête de vérification. */
const CHECK_TIMEOUT_MS = 60000;

/** Délai maximal de l'extraction de l'archive (10 minutes). */
const EXTRACT_TIMEOUT_MS = 10 * 60 * 1000;

/** Après un échec de démarrage, on attend avant de relancer Java pour le même
 *  dossier : évite les boucles de relance qui s'annulent entre elles. */
const START_FAILURE_COOLDOWN_MS = 15000;

/** Préfixe des dossiers temporaires d'installation (dans userData). */
const STAGING_PREFIX = 'languagetool-install-';

interface LanguageToolRawMatch {
  offset: number;
  length: number;
  message?: string;
  shortMessage?: string;
  rule?: { id?: string };
  replacements?: { value: string }[];
}

let languageToolProcess: LanguageToolProcess | null = null;
let languageToolReadyPort: number | null = null;

/** Démarrage en cours : les appels simultanés partagent la même promesse. */
let startPromise: Promise<{ port: number }> | null = null;

/** Vrai pendant l'installation automatique : aucun démarrage autorisé. */
let installInProgress = false;

/** Dernier échec de démarrage (pour la pause anti-boucle). */
let lastStartFailure: { key: string; time: number; error: Error } | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Supprime un dossier sans jamais lever d'erreur (best-effort). */
async function removeQuietly(target: string): Promise<void> {
  try {
    await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  } catch {
    /* fichier verrouillé (antivirus, indexation...) : tant pis */
  }
}

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

/** Une installation utilisable contient, à côté du jar serveur, un dossier
 *  libs/ rempli de bibliothèques .jar (slf4j, etc.). Sans lui, Java plante au
 *  démarrage avec des erreurs incompréhensibles pour l'utilisateur. */
function isInstallComplete(jarDir: string): boolean {
  try {
    const libsDir = path.join(jarDir, 'libs');
    return fs.readdirSync(libsDir).some((name) => name.toLowerCase().endsWith('.jar'));
  } catch {
    return false;
  }
}

/** Vrai si le dossier contient une installation complète de LanguageTool. */
function hasCompleteInstall(folderPath: string): boolean {
  const jarPath = findLanguageToolJar(folderPath);
  return !!jarPath && isInstallComplete(path.dirname(jarPath));
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

/** Chemin de tar. Sous Windows, on force celui de System32 (bsdtar, qui sait
 *  lire les .zip) : le tar de Git, souvent présent dans le PATH, ne sait pas
 *  lire les .zip et confond "C:" avec un nom de machine distante. */
function getTarPath(): string {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    return path.join(systemRoot, 'System32', 'tar.exe');
  }
  return 'tar';
}

/** Extraction rapide via tar, dans un process séparé : le processus principal
 *  d'Electron reste réactif pendant toute l'opération. bsdtar refuse par
 *  défaut les chemins absolus et les "..", ce qui protège du "Zip Slip". */
function extractWithTar(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderrTail = '';

    const proc = spawn(getTarPath(), ['-xf', zipPath, '-C', destDir], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => {
      proc.kill();
      finish(new Error("L'extraction de l'archive a dépassé le délai maximal."));
    }, EXTRACT_TIMEOUT_MS);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-1000);
    });
    proc.on('error', (err) => finish(err));
    proc.on('exit', (code) => {
      if (code === 0) {
        finish();
      } else {
        const detail = stderrTail.trim();
        finish(new Error(`tar a échoué (code ${code})` + (detail ? ` : ${detail}` : '')));
      }
    });
  });
}

/** Solution de secours (Linux, ou tar absent/défaillant) : adm-zip en mode
 *  asynchrone, avec vérification "Zip Slip" et délai maximal. */
function extractWithAdmZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => {
      finish(new Error("L'extraction de l'archive a dépassé le délai maximal."));
    }, EXTRACT_TIMEOUT_MS);

    try {
      const zip = new AdmZip(zipPath);

      // Défense en profondeur contre le "Zip Slip" : on vérifie nous-mêmes
      // chaque entrée avant extraction.
      const resolvedDestDir = path.resolve(destDir) + path.sep;
      zip.getEntries().forEach((entry) => {
        const resolvedEntryPath = path.resolve(destDir, entry.entryName);
        if (!resolvedEntryPath.startsWith(resolvedDestDir) && resolvedEntryPath !== path.resolve(destDir)) {
          throw new Error(`Archive LanguageTool invalide : entrée suspecte "${entry.entryName}".`);
        }
      });

      zip.extractAllToAsync(destDir, true, false, (err?: Error) => finish(err));
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Extrait l'archive : tar d'abord (rapide), adm-zip en secours si tar
 *  échoue OU produit une installation incomplète. */
async function extractArchive(zipPath: string, destDir: string): Promise<void> {
  try {
    await extractWithTar(zipPath, destDir);
    if (hasCompleteInstall(destDir)) return;
    console.warn('[grammar] tar a terminé mais l\'installation est incomplète, essai avec adm-zip.');
  } catch (err) {
    console.warn('[grammar] Extraction par tar impossible, essai avec adm-zip :', err);
  }

  await removeQuietly(destDir);
  await fs.promises.mkdir(destDir, { recursive: true });
  await extractWithAdmZip(zipPath, destDir);
}

/** Supprime les dossiers temporaires laissés par une installation
 *  interrompue, sauf celui actuellement utilisé (cas où le renommage final
 *  avait échoué et où le dossier temporaire sert d'installation). */
async function cleanupStagingDirs(userDataDir: string): Promise<void> {
  const configured = store.get('grammarPrefs')?.languageToolPath;
  const configuredResolved = configured ? path.resolve(configured) : null;

  try {
    const entries = await fs.promises.readdir(userDataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(STAGING_PREFIX)) continue;
      const fullPath = path.resolve(userDataDir, entry.name);
      if (configuredResolved && configuredResolved.startsWith(fullPath)) continue;
      await removeQuietly(fullPath);
    }
  } catch {
    /* dossier userData illisible : rien à nettoyer */
  }
}

/** Remplace le dossier cible par le dossier source. Si le renommage échoue
 *  (antivirus, fichier verrouillé...), on garde le dossier source tel quel. */
async function replaceDirectory(source: string, target: string): Promise<string> {
  await removeQuietly(target);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.promises.rename(source, target);
      return target;
    } catch {
      await delay(400);
    }
  }

  console.warn('[grammar] Renommage impossible, le dossier temporaire est conservé :', source);
  return source;
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

/** Démarre le serveur LanguageTool (appelé via une promesse partagée : un
 *  seul démarrage à la fois, même si l'éditeur le demande plusieurs fois). */
async function startServer(getWindow: () => BrowserWindow | null): Promise<{ port: number }> {
  if (installInProgress) {
    throw new Error('Installation de LanguageTool en cours, veuillez patienter.');
  }

  const prefs = store.get('grammarPrefs');
  if (!prefs.languageToolPath) throw new Error('Aucun dossier LanguageTool configuré.');

  const jarPath = findLanguageToolJar(prefs.languageToolPath);
  if (!jarPath) throw new Error('languagetool-server.jar introuvable dans le dossier configuré.');

  const jarDir = path.dirname(jarPath);
  if (!isInstallComplete(jarDir)) {
    throw new Error(
      "Installation de LanguageTool incomplète (dossier « libs » manquant). Relancez l'installation automatique pour la réparer."
    );
  }

  // Déjà démarré sur ce port : rien à refaire.
  if (languageToolProcess && languageToolReadyPort === prefs.port) {
    return { port: prefs.port };
  }

  // Échec très récent pour le même dossier : on renvoie la même erreur sans
  // relancer Java (évite les boucles de relance).
  const key = `${jarPath}|${prefs.port}`;
  if (
    lastStartFailure &&
    lastStartFailure.key === key &&
    Date.now() - lastStartFailure.time < START_FAILURE_COOLDOWN_MS
  ) {
    throw lastStartFailure.error;
  }

  if (languageToolProcess) {
    languageToolProcess.kill();
    languageToolProcess = null;
    languageToolReadyPort = null;
    // Laisser le temps au précédent process de libérer le port.
    await delay(300);
  }

  languageToolProcess = spawn(
    'java',
    ['-cp', jarPath, 'org.languagetool.server.HTTPServer', '--port', String(prefs.port)],
    // On capture stdout/stderr (au lieu de 'ignore') pour pouvoir
    // diagnostiquer un échec de démarrage au lieu de le passer sous silence.
    // Java est lancé depuis le dossier de LanguageTool, comme le recommande
    // la documentation officielle.
    { cwd: jarDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
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
    const error = err instanceof Error ? err : new Error(String(err));
    lastStartFailure = { key, time: Date.now(), error };
    throw error;
  }

  lastStartFailure = null;
  languageToolReadyPort = prefs.port;
  return { port: prefs.port };
}

/** Découpe un long texte en morceaux, de préférence entre deux paragraphes,
 *  sinon entre deux lignes, sinon après une fin de phrase. */
function splitTextIntoChunks(text: string): { start: number; text: string }[] {
  const chunks: { start: number; text: string }[] = [];
  const minimumCut = Math.floor(MAX_CHUNK_LENGTH / 2);
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_CHUNK_LENGTH);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const lineBreak = text.lastIndexOf('\n', end);
      const sentenceEnd = text.lastIndexOf('. ', end);

      if (paragraphBreak > start + minimumCut) {
        end = paragraphBreak + 2;
      } else if (lineBreak > start + minimumCut) {
        end = lineBreak + 1;
      } else if (sentenceEnd > start + minimumCut) {
        end = sentenceEnd + 2;
      }
    }

    chunks.push({ start, text: text.slice(start, end) });
    start = end;
  }

  return chunks;
}

/** Envoie un morceau de texte au serveur local et renvoie ses correspondances.
 *  Avec `picky` à vrai, LanguageTool active en plus ses règles « exigeantes »
 *  (style, typographie, répétitions...), utiles pour un texte soigné. */
async function checkChunk(
  port: number,
  text: string,
  language: string,
  picky: boolean
): Promise<LanguageToolRawMatch[]> {
  const params: Record<string, string> = {
    text,
    language,
    enabledOnly: 'false'
  };

  // En détection automatique, l'anglais, l'allemand, etc. exigent une variante
  // précise pour que la vérification orthographique fonctionne.
  if (language === 'auto') {
    params.preferredVariants = 'en-US,de-DE,pt-PT,ca-ES';
  }

  // Correction exigeante : active les règles supplémentaires de LanguageTool.
  if (picky) {
    params.level = 'picky';
  }

  let res: Response;

  try {
    res = await fetch(`http://127.0.0.1:${port}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('Le serveur LanguageTool met trop de temps à répondre.');
    }
    throw new Error("Le serveur LanguageTool local ne répond pas.");
  }

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

  const data = (await res.json()) as { matches?: LanguageToolRawMatch[] };
  return data.matches ?? [];
}

export function registerGrammarIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('store:get-grammar-prefs', () => store.get('grammarPrefs'));
  // Fusion avec les préférences existantes : enregistrer { picky } seul ne
  // touche pas à enabled, au chemin ni au port (et inversement).
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

    lastStartFailure = null;
    store.set('grammarPrefs', { ...store.get('grammarPrefs'), languageToolPath: folderPath });
    return { canceled: false, valid: true, folderPath };
  });

  // --- INSTALLATION AUTOMATIQUE — un seul bouton télécharge l'archive
  // "stable" officielle, l'extrait dans un dossier temporaire puis remplace
  // l'installation précédente et configure le chemin. Java reste à la charge
  // de l'utilisateur (impossible à embarquer proprement multiplateforme).
  ipcMain.handle('grammar:auto-install', async () => {
    if (installInProgress) {
      throw new Error('Une installation de LanguageTool est déjà en cours.');
    }

    const userDataDir = app.getPath('userData');
    const installDir = path.join(userDataDir, 'languagetool');
    const stagingDir = path.join(userDataDir, `${STAGING_PREFIX}${Date.now()}`);
    const zipPath = path.join(app.getPath('temp'), `scriptorium-languagetool-${Date.now()}.zip`);

    const sendProgress = (phase: 'download' | 'extract', percent: number) => {
      getWindow()?.webContents.send('grammar:install-progress', { phase, percent });
    };

    installInProgress = true;

    try {
      await cleanupStagingDirs(userDataDir);

      sendProgress('download', 0);
      await downloadFile(LANGUAGETOOL_DOWNLOAD_URL, zipPath, (fraction) => {
        sendProgress('download', Math.round(fraction * 100));
      });

      sendProgress('extract', 0);
      await fs.promises.mkdir(stagingDir, { recursive: true });
      await extractArchive(zipPath, stagingDir);

      if (!hasCompleteInstall(stagingDir)) {
        throw new Error(
          "L'archive téléchargée est incomplète (languagetool-server.jar ou dossier « libs » manquant). Réessayez plus tard."
        );
      }

      // Sous Windows, les fichiers d'un serveur en cours d'exécution sont
      // verrouillés : on l'arrête avant de remplacer l'ancienne installation.
      if (languageToolProcess) {
        stopGrammarServer();
        getWindow()?.webContents.send('grammar:server-stopped');
        await delay(500);
      }

      const finalDir = await replaceDirectory(stagingDir, installDir);
      const jarPath = findLanguageToolJar(finalDir);
      if (!jarPath || !isInstallComplete(path.dirname(jarPath))) {
        throw new Error("Installation incomplète : fichiers LanguageTool introuvables après l'extraction.");
      }

      const folderPath = path.dirname(jarPath);
      sendProgress('extract', 100);

      lastStartFailure = null;
      store.set('grammarPrefs', { ...store.get('grammarPrefs'), languageToolPath: folderPath });
      return { success: true, folderPath };
    } catch (err) {
      await removeQuietly(stagingDir);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      installInProgress = false;
      fs.unlink(zipPath, () => {}); // best-effort
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
          const match = output.match(/version "([0-9]+)(?:[.]([0-9]+))?/);
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

  ipcMain.handle('grammar:start-server', () => {
    if (!startPromise) {
      startPromise = startServer(getWindow).finally(() => {
        startPromise = null;
      });
    }
    return startPromise;
  });

  ipcMain.handle(
    'grammar:check-text',
    async (_e, { text, language }: { text: string; language: string }): Promise<GrammarMatch[]> => {
      // Relu à chaque vérification : un changement de réglage (accueil ou
      // éditeur) s'applique dès la vérification suivante, sans redémarrage.
      const prefs = store.get('grammarPrefs');
      if (!languageToolProcess || languageToolReadyPort !== prefs.port) {
        throw new Error("Le serveur LanguageTool local n'est pas démarré.");
      }

      // Correction exigeante activée par défaut : une valeur absente
      // (anciennes préférences) vaut « activé », seul false la désactive.
      const picky = prefs.picky !== false;

      const fullText = text || '';
      const checkLanguage = language || 'fr';
      const results: GrammarMatch[] = [];

      // Les morceaux sont vérifiés l'un après l'autre (le serveur local
      // traite de toute façon les requêtes une par une) et leurs positions
      // sont recalées sur le texte complet.
      for (const chunk of splitTextIntoChunks(fullText)) {
        if (!chunk.text.trim()) continue;

        const matches = await checkChunk(prefs.port, chunk.text, checkLanguage, picky);

        matches.forEach((m) => {
          if (typeof m.offset !== 'number' || typeof m.length !== 'number') return;

          results.push({
            offset: m.offset + chunk.start,
            length: m.length,
            message: m.shortMessage || m.message || '',
            ruleId: m.rule?.id ?? '',
            replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value)
          });
        });
      }

      return results;
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
