const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const https = require('https');
const AdmZip = require('adm-zip');
const Store = require('electron-store');
const { generateDocx } = require('./utils.js');
const sanitizeHtml = require('sanitize-html');

// ---------------------------------------------------------------------------
// SÉCURITÉ : désinfection du HTML provenant de sources externes.
// Le contenu des chapitres est injecté en innerHTML dans un contentEditable
// (voir js/editor.js). Un fichier .scriptorium reçu d'un tiers, ou un collage
// depuis une page web, pourrait sinon contenir du JavaScript exécutable
// (<img onerror>, <script>, gestionnaires d'événements...). Seules les
// balises et attributs réellement produits par l'éditeur sont autorisés.
// ---------------------------------------------------------------------------
const CHAPTER_HTML_SANITIZE_OPTIONS = {
  allowedTags: ['div', 'p', 'span', 'b', 'strong', 'i', 'em', 'u', 'font', 'br'],
  allowedAttributes: {
    span: ['class', 'data-wb-key', 'data-type-label', 'style', 'spellcheck'],
    font: ['face', 'size', 'color'],
    div: ['style'],
    p: ['style']
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([0-9, .]+\)$/],
      'font-family': [/.*/],
      'font-size': [/^[0-9.]+(px|pt)$/],
      'font-weight': [/^(bold|normal|[0-9]+)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|none)$/]
    }
  },
  disallowedTagsMode: 'discard'
};

function sanitizeProjectData(projectData) {
  if (!projectData || typeof projectData !== 'object') return { chapters: {}, world: {} };

  const chapters = projectData.chapters || {};
  const sanitizedChapters = {};
  Object.keys(chapters).forEach(name => {
    sanitizedChapters[name] = typeof chapters[name] === 'string'
      ? sanitizeHtml(chapters[name], CHAPTER_HTML_SANITIZE_OPTIONS)
      : '';
  });

  // Le contenu World Building est du texte brut (champs <input>/<textarea>,
  // jamais injecté en innerHTML côté renderer) : pas de risque équivalent, on
  // le passe tel quel.
  return { chapters: sanitizedChapters, world: projectData.world || {} };
}

// --- STOCKAGE PERSISTANT (remplace l'ancien localStorage) ---
// Les données sont écrites dans un vrai fichier JSON sur disque
// (dossier userData de l'appli), avec des valeurs par défaut sûres.
const store = new Store({
  defaults: {
    projects: {},
    uiState: {},
    theme: 'dark',
    currentProject: null,
    language: 'fr',
    // NB: la taille/police définies ici s'appliquent à l'INTERFACE (menus, sidebar,
    // modales), pas à la feuille d'écriture — voir js/editor.js#applyEditorPrefs.
    editorPrefs: { width: 800, uiFontSize: 14, uiFontFamily: "'Roboto', sans-serif" },
    // Historique du nombre de mots écrits, tous projets confondus (voir
    // js/editor.js#recordWritingStats). "history" est un total par jour
    // ("YYYY-MM-DD" -> mots nets écrits ce jour-là), agrégé ensuite côté
    // renderer par semaine/mois/année pour le menu Statistiques.
    writingStats: { baselineDate: null, baselineWords: 0, history: {} },
    // Correcteur de grammaire hors ligne (LanguageTool) : voir bloc dédié
    // plus bas. languageToolPath pointe vers le dossier choisi par
    // l'utilisateur (contenant, ou dont un sous-dossier contient,
    // languagetool-server.jar). Rien n'est jamais téléchargé par
    // Scriptorium : c'est un outil tiers que l'utilisateur installe lui-même.
    grammarPrefs: { enabled: false, languageToolPath: null, port: 8081 },
    // Correcteur orthographique natif (Chromium). webPreferences.spellcheck
    // reste toujours à true (nécessaire pour que le moteur existe) ; c'est
    // cette préférence qui l'active/désactive réellement via
    // session.setSpellCheckerEnabled(), à la volée, sans recharger la fenêtre.
    nativeSpellcheckEnabled: true
  }
});

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      // --- Sécurité Electron ---
      // Le renderer ne doit jamais avoir accès direct à Node.js : toute
      // interaction avec le système de fichiers ou le processus principal
      // passe par les canaux IPC exposés dans preload.js.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true // Correcteur natif actif
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  // Langues du correcteur natif au démarrage (déterminées par Electron/l'OS).
  // On les conserve pour pouvoir les réappliquer si l'utilisateur réactive
  // le correcteur après l'avoir désactivé.
  const defaultSpellcheckLanguages = win.webContents.session.getSpellCheckerLanguages();

  // session.setSpellCheckerEnabled(false) seul ne suffit pas de façon fiable
  // sur toutes les versions/plateformes d'Electron : les mots déjà soulignés
  // peuvent le rester tant qu'une langue de correction reste active dans la
  // session (bug/limitation documentée : voir electron/electron#30215 et
  // electron/electron#25228). Vider la liste des langues en plus de
  // désactiver le service est le moyen fiable de couper complètement le
  // correcteur natif.
  function applyNativeSpellcheckPreference(enabled) {
    const ses = win.webContents.session;
    ses.setSpellCheckerEnabled(enabled);
    ses.setSpellCheckerLanguages(enabled ? defaultSpellcheckLanguages : []);
  }
  win.applyNativeSpellcheckPreference = applyNativeSpellcheckPreference;

  // Applique la préférence persistée (le correcteur natif est actif par
  // défaut côté webPreferences, mais l'utilisateur a pu le désactiver lors
  // d'une session précédente).
  applyNativeSpellcheckPreference(store.get('nativeSpellcheckEnabled'));

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }

  // Création du Menu Contextuel (Correcteur orthographique)
  win.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // S'il y a un mot mal orthographié détecté
    if (params.misspelledWord) {
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach(suggestion => {
          menu.append(new MenuItem({
            label: suggestion,
            // Remplacement natif qui préserve parfaitement le système d'annulation (Undo/Redo)
            click: () => win.webContents.replaceMisspelling(suggestion)
          }));
        });
      } else {
        menu.append(new MenuItem({
          label: 'Aucune suggestion',
          enabled: false
        }));
      }

      menu.append(new MenuItem({ type: 'separator' }));

      menu.append(new MenuItem({
        label: 'Ajouter au dictionnaire',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
    } else {
      // Menu contextuel par défaut
      menu.append(new MenuItem({ role: 'copy', label: 'Copier' }));
      menu.append(new MenuItem({ role: 'paste', label: 'Coller' }));
      menu.append(new MenuItem({ role: 'cut', label: 'Couper' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Tout sélectionner' }));
    }

    menu.popup(win);
  });
}

// ---------------------------------------------------------------------------
// IPC : Persistance (remplace les anciens appels localStorage du renderer)
// ---------------------------------------------------------------------------
ipcMain.handle('store:get-projects', () => store.get('projects'));
ipcMain.handle('store:save-projects', (event, projects) => {
  store.set('projects', projects);
  return true;
});

ipcMain.handle('store:get-ui-state', () => store.get('uiState'));
ipcMain.handle('store:save-ui-state', (event, uiState) => {
  store.set('uiState', uiState);
  return true;
});

ipcMain.handle('store:get-theme', () => store.get('theme'));
ipcMain.handle('store:save-theme', (event, theme) => {
  store.set('theme', theme);
  return true;
});

ipcMain.handle('store:get-language', () => store.get('language'));
ipcMain.handle('store:save-language', (event, lang) => {
  store.set('language', lang);
  return true;
});

ipcMain.handle('store:get-editor-prefs', () => store.get('editorPrefs'));
ipcMain.handle('store:save-editor-prefs', (event, prefs) => {
  store.set('editorPrefs', prefs);
  return true;
});

ipcMain.handle('store:get-writing-stats', () => store.get('writingStats'));
ipcMain.handle('store:save-writing-stats', (event, stats) => {
  store.set('writingStats', stats);
  return true;
});

// ---------------------------------------------------------------------------
// CORRECTEUR ORTHOGRAPHIQUE NATIF (Chromium) — indépendant de LanguageTool.
// setSpellCheckerEnabled() prend effet immédiatement, sans recharger la page.
// ---------------------------------------------------------------------------
ipcMain.handle('store:get-native-spellcheck', () => store.get('nativeSpellcheckEnabled'));
ipcMain.handle('store:set-native-spellcheck', (event, enabled) => {
  store.set('nativeSpellcheckEnabled', enabled);
  if (win && win.applyNativeSpellcheckPreference) win.applyNativeSpellcheckPreference(enabled);
  return enabled;
});

// ---------------------------------------------------------------------------
// CORRECTEUR DE GRAMMAIRE HORS LIGNE — intégration LanguageTool
//
// LanguageTool n'est PAS embarqué dans Scriptorium (l'archive officielle
// pèse ~200 Mo et nécessite un Runtime Java) : l'utilisateur télécharge et
// dézippe lui-même LanguageTool (languagetool.org/download), puis indique
// à Scriptorium où se trouve le dossier via le sélecteur natif. Scriptorium
// lance ensuite `languagetool-server.jar` comme process enfant Java, et
// interroge ce serveur local (127.0.0.1) en HTTP — tout reste sur la
// machine de l'utilisateur, aucune donnée n'est envoyée en ligne.
// ---------------------------------------------------------------------------
ipcMain.handle('store:get-grammar-prefs', () => store.get('grammarPrefs'));
ipcMain.handle('store:save-grammar-prefs', (event, prefs) => {
  store.set('grammarPrefs', { ...store.get('grammarPrefs'), ...prefs });
  return store.get('grammarPrefs');
});

// Cherche languagetool-server.jar directement dans le dossier choisi, ou
// dans l'un de ses sous-dossiers immédiats (cas typique : l'utilisateur
// sélectionne le dossier parent dans lequel il a dézippé "LanguageTool-6.x/").
function findLanguageToolJar(folderPath) {
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
  } catch (e) { /* dossier illisible ou inexistant : pas de jar trouvé */ }
  return null;
}

ipcMain.handle('dialog:select-languagetool-folder', async () => {
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

// ---------------------------------------------------------------------------
// INSTALLATION AUTOMATIQUE — pour éviter à l'utilisateur de devoir chercher,
// télécharger et dézipper LanguageTool lui-même : un seul bouton télécharge
// l'archive "stable" officielle (URL pérenne fournie par languagetool.org,
// toujours à jour), l'extrait dans le dossier de données de l'application,
// et configure directement le chemin. Java reste à la charge de
// l'utilisateur (impossible à embarquer proprement multiplateforme sans
// alourdir énormément l'installeur).
// ---------------------------------------------------------------------------
const LANGUAGETOOL_DOWNLOAD_URL = 'https://languagetool.org/download/LanguageTool-stable.zip';

function downloadFile(url, destPath, onProgress, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Trop de redirections lors du téléchargement.'));

    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(res.headers.location, destPath, onProgress, redirectCount + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Téléchargement échoué (HTTP ${res.statusCode}).`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) onProgress(downloadedBytes / totalBytes);
      });
      res.on('error', reject);
      fileStream.on('error', reject);
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => resolve()));
    });
    request.on('error', reject);
  });
}

ipcMain.handle('grammar:auto-install', async () => {
  const installDir = path.join(app.getPath('userData'), 'languagetool');
  const zipPath = path.join(app.getPath('temp'), `scriptorium-languagetool-${Date.now()}.zip`);

  const sendProgress = (phase, percent) => {
    if (win) win.webContents.send('grammar:install-progress', { phase, percent });
  };

  try {
    fs.mkdirSync(installDir, { recursive: true });

    sendProgress('download', 0);
    await downloadFile(LANGUAGETOOL_DOWNLOAD_URL, zipPath, (fraction) => {
      sendProgress('download', Math.round(fraction * 100));
    });

    sendProgress('extract', 0);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(installDir, true);
    sendProgress('extract', 100);

    fs.unlink(zipPath, () => {}); // best-effort, on ne bloque pas sur le nettoyage

    const jarPath = findLanguageToolJar(installDir);
    if (!jarPath) {
      throw new Error("L'archive téléchargée ne contient pas languagetool-server.jar (format inattendu, réessayez plus tard).");
    }

    store.set('grammarPrefs', { ...store.get('grammarPrefs'), languageToolPath: installDir });
    return { success: true, folderPath: installDir };
  } catch (err) {
    fs.unlink(zipPath, () => {});
    throw err;
  }
});

// `java -version` écrit sur stderr (comportement historique de la JVM), pas stdout.
// On ne se contente plus de vérifier que Java existe : LanguageTool récent
// (celui téléchargé par l'auto-install) nécessite Java 17+. En dessous, le
// .jar ne charge même pas (UnsupportedClassVersionError), donc autant le
// détecter en amont et guider l'utilisateur plutôt que de le laisser
// découvrir une stacktrace.
ipcMain.handle('grammar:check-java', () => {
  return new Promise((resolve) => {
    execFile('java', ['-version'], (error, stdout, stderr) => {
      if (error) return resolve({ available: false, major: null, outdated: false });

      const output = stderr || stdout || '';
      const match = output.match(/version "(\d+)(?:\.(\d+))?/);
      let major = null;
      if (match) {
        const first = parseInt(match[1], 10);
        // Ancien schéma de version ("1.8.0_301" -> Java 8, le vrai numéro
        // majeur est le 2e groupe) vs nouveau schéma depuis Java 9/JEP 223
        // ("17.0.2" -> 17, "21" -> 21).
        major = first === 1 ? parseInt(match[2], 10) : first;
      }

      resolve({
        available: true,
        major,
        outdated: major !== null && major < 17
      });
    });
  });
});

ipcMain.handle('shell:open-external', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

let languageToolProcess = null;
let languageToolReadyPort = null;

function waitForServerReady(proc, port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let stderrTail = '';

  if (proc.stderr) {
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000); // on ne garde que la fin
    });
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    // Si le process Java meurt avant d'avoir répondu (port déjà utilisé,
    // jar corrompu, classe introuvable...), on le signale IMMÉDIATEMENT
    // avec le vrai message d'erreur, au lieu d'attendre bêtement le timeout
    // de 60s pour afficher un message générique qui ne dit rien du problème réel.
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      const detail = stderrTail.trim();
      reject(new Error(
        `Le serveur LanguageTool s'est arrêté avant d'être prêt (code ${code}).` +
        (detail ? `\nDétail : ${detail}` : ' Aucune sortie d\'erreur capturée.')
      ));
    };
    proc.once('exit', onExit);

    (async function poll() {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        proc.removeListener('exit', onExit);
        return reject(new Error('Délai dépassé (le serveur met parfois du temps à démarrer la première fois).'));
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/v2/languages`);
        if (res.ok) {
          settled = true;
          proc.removeListener('exit', onExit);
          return resolve(true);
        }
      } catch (e) { /* pas encore prêt, on réessaie */ }
      setTimeout(poll, 500);
    })();
  });
}

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
    // Laisser le temps au précédent process de libérer le port avant d'en relancer un.
    await new Promise(r => setTimeout(r, 300));
  }

  languageToolProcess = spawn('java', ['-cp', jarPath, 'org.languagetool.server.HTTPServer', '--port', String(prefs.port)], {
    // On capture stdout/stderr (au lieu de 'ignore') pour pouvoir diagnostiquer
    // un échec de démarrage au lieu de le passer sous silence.
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const currentProcess = languageToolProcess;

  currentProcess.on('error', () => {
    if (languageToolProcess === currentProcess) {
      languageToolProcess = null;
      languageToolReadyPort = null;
    }
  });
  currentProcess.on('exit', () => {
    if (languageToolProcess === currentProcess) {
      languageToolProcess = null;
      languageToolReadyPort = null;
    }
  });

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

ipcMain.handle('grammar:check-text', async (event, { text, language }) => {
  const prefs = store.get('grammarPrefs');
  if (!languageToolProcess || languageToolReadyPort !== prefs.port) {
    throw new Error('Le serveur LanguageTool local n\'est pas démarré.');
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
    // LanguageTool répond en général avec un corps JSON {"message": "..."} qui
    // explique précisément le problème (langue non reconnue, paramètre
    // invalide...) — bien plus utile que le simple code HTTP pour diagnostiquer.
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody && errBody.message ? ` : ${errBody.message}` : '';
    } catch (e) { /* corps non-JSON, on garde juste le code HTTP */ }
    throw new Error(`Réponse HTTP ${res.status} du serveur LanguageTool${detail}`);
  }

  const data = await res.json();
  return (data.matches || []).map(m => ({
    offset: m.offset,
    length: m.length,
    message: m.shortMessage || m.message,
    ruleId: m.rule ? m.rule.id : '',
    replacements: (m.replacements || []).slice(0, 5).map(r => r.value)
  }));
});

app.on('will-quit', () => {
  if (languageToolProcess) {
    languageToolProcess.kill();
    languageToolProcess = null;
  }
});

ipcMain.handle('store:get-current-project', () => store.get('currentProject'));
ipcMain.handle('store:set-current-project', (event, name) => {
  store.set('currentProject', name);
  return true;
});
ipcMain.handle('store:clear-current-project', () => {
  store.set('currentProject', null);
  return true;
});

// Migration ponctuelle : au premier lancement de cette version, on récupère
// les anciennes données localStorage (transmises une fois par le renderer)
// et on les copie dans le store persistant si celui-ci est encore vide.
ipcMain.handle('store:migrate', (event, legacyData) => {
  const hasExistingData = Object.keys(store.get('projects') || {}).length > 0;
  if (!hasExistingData && legacyData && legacyData.projects) {
    store.set('projects', legacyData.projects);
    if (legacyData.uiState) store.set('uiState', legacyData.uiState);
    if (legacyData.theme) store.set('theme', legacyData.theme);
    if (legacyData.currentProject) store.set('currentProject', legacyData.currentProject);
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// IPC : Boîte de dialogue "Enregistrer sous"
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:show-save', async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result;
});

ipcMain.handle('dialog:show-open', async (event, options) => {
  const result = await dialog.showOpenDialog(options);
  return result;
});

// ---------------------------------------------------------------------------
// IPC : Export de fichiers — l'écriture disque se fait UNIQUEMENT côté main,
// le renderer n'ayant plus accès à 'fs' directement (voir preload.js).
// ---------------------------------------------------------------------------
const fs = require('fs');

ipcMain.handle('export:txt', (event, { filePath, text }) => {
  fs.writeFileSync(filePath, text, 'utf-8');
  return true;
});

ipcMain.handle('export:docx', async (event, { filePath, docxData }) => {
  await generateDocx(filePath, docxData);
  return true;
});

// ---------------------------------------------------------------------------
// EXPORT PDF — rendu via une fenêtre Electron invisible (le PDF est le
// résultat de la mise en page HTML/CSS réelle, pas une approximation).
// ---------------------------------------------------------------------------
const os = require('os');

ipcMain.handle('export:pdf', async (event, { filePath, htmlContent }) => {
  const tempHtmlPath = path.join(os.tmpdir(), `scriptorium-print-${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  const pdfWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });

  try {
    await pdfWindow.loadFile(tempHtmlPath);
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
    fs.writeFileSync(filePath, Buffer.from(pdfBuffer));
    return true;
  } finally {
    pdfWindow.destroy();
    fs.unlink(tempHtmlPath, () => {}); // best-effort, on ne bloque pas sur le nettoyage
  }
});

// ---------------------------------------------------------------------------
// EXPORT / IMPORT DE PROJET COMPLET (.scriptorium)
// Permet une sauvegarde manuelle portable, indépendante du store interne :
// changer de PC, envoyer son projet à quelqu'un, garder une copie hors-ligne.
// ---------------------------------------------------------------------------
const SCHEMA_VERSION = 1;

ipcMain.handle('project:export', (event, { filePath, projectName, projectData }) => {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appName: 'Scriptorium',
    exportedAt: new Date().toISOString(),
    projectName,
    projectData
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('project:import', (event, filePath) => {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const payload = JSON.parse(raw);

  if (!payload || typeof payload !== 'object' || !payload.projectData) {
    throw new Error("Fichier invalide : ce n'est pas un export Scriptorium reconnu.");
  }

  return {
    projectName: payload.projectName || 'Projet importé',
    projectData: sanitizeProjectData(payload.projectData)
  };
});

// ---------------------------------------------------------------------------
// SAUVEGARDES AUTOMATIQUES HORODATÉES
// Un instantané complet du projet est écrit dans un dossier dédié du profil
// utilisateur, avec rotation (on ne garde que les N dernières par projet).
// Objectif : pouvoir revenir en arrière après une suppression ou un
// remplacement malheureux, indépendamment du fichier de travail courant.
// ---------------------------------------------------------------------------
const BACKUPS_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS_PER_PROJECT = 10;

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Les noms de projet peuvent contenir des caractères invalides pour un nom
// de fichier/dossier (/ \ : * ? " < > |) : on les neutralise pour créer un
// nom de dossier sûr, tout en gardant le nom d'origine lisible dans les
// métadonnées de chaque sauvegarde.
function sanitizeForFilesystem(name) {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'projet';
}

function projectBackupDir(projectName) {
  return path.join(BACKUPS_DIR, sanitizeForFilesystem(projectName));
}

ipcMain.handle('backup:create', (event, { projectName, projectData }) => {
  ensureBackupsDir();
  const dir = projectBackupDir(projectName);
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}.json`;
  fs.writeFileSync(
    path.join(dir, fileName),
    JSON.stringify({ projectName, projectData, savedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );

  // Rotation : on ne garde que les MAX_BACKUPS_PER_PROJECT plus récentes.
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - MAX_BACKUPS_PER_PROJECT;
  if (excess > 0) {
    files.slice(0, excess).forEach(f => fs.unlinkSync(path.join(dir, f)));
  }

  return { fileName };
});

ipcMain.handle('backup:list', (event, projectName) => {
  const dir = projectBackupDir(projectName);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .map(fileName => {
      let savedAt = null;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf-8'));
        savedAt = data.savedAt || null;
      } catch (e) { /* fichier corrompu, on l'ignore silencieusement dans la liste */ }
      return { fileName, savedAt };
    });
});

ipcMain.handle('backup:restore', (event, { projectName, fileName }) => {
  const dir = projectBackupDir(projectName);
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error('Sauvegarde introuvable.');
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return sanitizeProjectData(data.projectData);
});

// Désinfection à la demande, utilisée notamment lors d'un collage dans
// l'éditeur (le presse-papiers peut contenir du HTML copié depuis une page
// web quelconque, potentiellement piégé).
ipcMain.handle('sanitize:html', (event, html) => sanitizeHtml(html, CHAPTER_HTML_SANITIZE_OPTIONS));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
