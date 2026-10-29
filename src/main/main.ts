// src/main/main.ts
// Point d'entrée du processus principal.

import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, MenuItem, session, type IpcMainEvent } from 'electron';
import { store } from './store';
import { registerPersistenceIpc } from './ipc/persistence';
import { registerFileIpc } from './ipc/files';
import { registerBackupIpc } from './ipc/backups';
import { registerGrammarIpc, stopGrammarServer } from './ipc/grammar';
import { checkForUpdates, setupAutoUpdater, FOUR_HOURS_MS } from './updater';
import { mainText } from './main-texts';

/** Fenêtre principale, augmentée de l'applicateur de préférence du correcteur
 *  natif (appelé depuis l'IPC quand l'utilisateur change le réglage). */
type MainWindow = BrowserWindow & {
  applyNativeSpellcheckPreference?: (enabled: boolean) => void;
};

let win: MainWindow | null = null;
const getWindow = (): MainWindow | null => win;

const DEV_SERVER_URL = process.env.SCRIPTORIUM_DEV_SERVER;

/** Délai maximal d'attente de l'enregistrement par le renderer. */
const SAVE_BEFORE_CLOSE_TIMEOUT_MS = 5000;

/**
 * Jusqu'à cette date (ms), la fenêtre peut se fermer sans nouvel
 * enregistrement : posée par prepareForQuit, juste avant quitAndInstall.
 */
let quitPreparedUntil = 0;

/**
 * Demande au renderer d'enregistrer tout le projet ("app:before-close") et
 * attend sa réponse ("app:close-ready"), ou le délai maximal s'il ne répond pas.
 * Ne rejette jamais.
 */
function saveBeforeClose(target: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    if (target.isDestroyed()) {
      resolve();
      return;
    }

    const contents = target.webContents;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (done) {
        return;
      }

      done = true;

      if (timer) {
        clearTimeout(timer);
      }

      ipcMain.removeListener('app:close-ready', onReady);
      resolve();
    };

    const onReady = (readyEvent: IpcMainEvent): void => {
      if (readyEvent.sender === contents) {
        finish();
      }
    };

    ipcMain.on('app:close-ready', onReady);
    timer = setTimeout(finish, SAVE_BEFORE_CLOSE_TIMEOUT_MS);

    try {
      contents.send('app:before-close');
    } catch {
      finish();
    }
  });
}

/**
 * Appelée par « Redémarrer et installer » AVANT quitAndInstall : enregistre,
 * puis autorise la fermeture sans nouvelle attente pendant 15 secondes. Sans
 * cela, l'installateur démarrerait pendant que la fenêtre retient encore sa
 * fermeture, et pourrait arrêter l'application en plein enregistrement.
 */
async function prepareForQuit(): Promise<void> {
  const target = win;

  if (target && !target.isDestroyed()) {
    await saveBeforeClose(target);
  }

  quitPreparedUntil = Date.now() + 15000;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      // --- Sécurité Electron ---
      // Le renderer ne doit jamais avoir accès direct à Node.js : toute
      // interaction avec le système de fichiers ou le processus principal
      // passe par les canaux IPC exposés dans preload.ts.
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: true isole davantage le renderer, en défense en profondeur
      // au-delà de contextIsolation seul. preload n'utilise que contextBridge
      // et ipcRenderer, tous deux disponibles en environnement sandboxé.
      sandbox: true,
      preload: path.join(__dirname, '../preload/preload.js'),
      spellcheck: true // Correcteur natif actif
    }
  }) as MainWindow;

  // --- DIAGNOSTIC TEMPORAIRE ---
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });
  win.webContents.on('will-navigate', (_e, url) => {
    console.log('[will-navigate]', url);
  });
  win.webContents.on('console-message', (...args: any[]) => {
    // compatible avec l'ancienne et la nouvelle signature d'Electron
    const [e, level, message, line, source] = args;
    console.log(`[renderer] ${e?.message ?? message} (${e?.sourceId ?? source}:${e?.lineNumber ?? line})`);
  });
  if (process.env.SCRIPTORIUM_DEBUG) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  win.setMenuBarVisibility(false);

  // Désactive le pinch-to-zoom natif d'Electron/Chromium (geste trackpad) :
  // sans ça, un pincement zoomerait toute la fenêtre exactement comme le
  // faisait le Ctrl+molette avant sa correction côté renderer (voir
  // EditorPage.tsx). Le zoom de la feuille d'écriture est un mécanisme
  // applicatif dédié (CSS `zoom` sur #editor), indépendant de celui-ci.
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {
    /* API dépréciée sur certaines plateformes/versions : échec sans gravité */
  });

  // Langues du correcteur natif au démarrage (déterminées par Electron/l'OS).
  // On les conserve pour pouvoir les réappliquer si l'utilisateur réactive le
  // correcteur après l'avoir désactivé.
  const defaultSpellcheckLanguages = win.webContents.session.getSpellCheckerLanguages();

  // session.setSpellCheckerEnabled(false) seul ne suffit pas de façon fiable
  // sur toutes les versions/plateformes d'Electron : les mots déjà soulignés
  // peuvent le rester tant qu'une langue de correction reste active dans la
  // session (voir electron/electron#30215 et #25228). Vider la liste des
  // langues en plus de désactiver le service est le moyen fiable de couper
  // complètement le correcteur natif.
  const applyNativeSpellcheckPreference = (enabled: boolean): void => {
    const ses = win?.webContents.session;
    if (!ses) return;
    ses.setSpellCheckerEnabled(enabled);
    ses.setSpellCheckerLanguages(enabled ? defaultSpellcheckLanguages : []);
  };
  win.applyNativeSpellcheckPreference = applyNativeSpellcheckPreference;
  applyNativeSpellcheckPreference(store.get('nativeSpellcheckEnabled'));

  if (process.argv.includes('--dev') || DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }

  // Console de développement : F12 ou Ctrl+Maj+I. Ce raccourci venait du menu
  // par défaut d'Electron, supprimé au démarrage (voir app.whenReady).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = input.key.toLowerCase();
    const wantsDevTools =
      key === 'f12' || ((input.control || input.meta) && input.shift && !input.alt && key === 'i');
    if (!wantsDevTools) return;
    event.preventDefault();
    win?.webContents.toggleDevTools();
  });

  // Menu contextuel (suggestions du correcteur orthographique natif)
  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    const menuLang = store.get('language');

    if (params.misspelledWord) {
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        params.dictionarySuggestions.forEach((suggestion) => {
          menu.append(
            new MenuItem({
              label: suggestion,
              // Remplacement natif qui préserve le système d'annulation
              click: () => win?.webContents.replaceMisspelling(suggestion)
            })
          );
        });
      } else {
        menu.append(new MenuItem({ label: mainText('ctxNoSuggestions', menuLang), enabled: false }));
      }

      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: mainText('ctxAddToDictionary', menuLang),
          click: () =>
            win?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      );
    } else {
      menu.append(new MenuItem({ role: 'copy', label: mainText('ctxCopy', menuLang) }));
      menu.append(new MenuItem({ role: 'paste', label: mainText('ctxPaste', menuLang) }));
      menu.append(new MenuItem({ role: 'cut', label: mainText('ctxCut', menuLang) }));
      menu.append(new MenuItem({ role: 'selectAll', label: mainText('ctxSelectAll', menuLang) }));
      // Commentaires (romans) : texte selectionne, hors des champs de saisie.
      const formControl: unknown = Reflect.get(params, 'formControlType');
      const inFormField = typeof formControl === 'string' && formControl !== 'none';
      if (params.isEditable && !inFormField && params.selectionText.trim() !== '') {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(
          new MenuItem({
            label: mainText('ctxAddComment', menuLang),
            click: () => win?.webContents.send('comments:add-request')
          })
        );
      }
    }

    if (win) menu.popup({ window: win });
  });

  // Fermeture : le renderer enregistre d'abord tout le projet. La fenêtre se
  // ferme dès sa réponse, ou au bout de 5 secondes s'il ne répond pas.
  // Exception : juste après prepareForQuit (mise à jour), l'enregistrement
  // vient d'être fait, la fenêtre se ferme donc sans attendre.
  const currentWin = win;
  let closeAllowed = false;
  let closeRequested = false;

  currentWin.on('close', (event) => {
    if (closeAllowed || Date.now() < quitPreparedUntil) {
      return;
    }

    event.preventDefault();

    if (closeRequested) {
      return;
    }

    closeRequested = true;

    void saveBeforeClose(currentWin).then(() => {
      closeAllowed = true;

      if (!currentWin.isDestroyed()) {
        currentWin.close();
      }
    });
  });

  win.on('closed', () => {
    win = null;
  });
}

// ---------------------------------------------------------------------------
// CONTENT SECURITY POLICY
// Posée via webRequest.onHeadersReceived plutôt qu'une balise <meta> : c'est
// la méthode recommandée par la documentation sécurité d'Electron, et elle est
// nettement plus fiable pour des pages chargées en file:// (une CSP en <meta>
// sur file:// peut se comporter de façon inconsistante selon les versions de
// Chromium — c'est ce qui empêchait les polices Google Fonts de se charger).
// N'est appliquée qu'à la réponse du DOCUMENT PRINCIPAL ('mainFrame').
// ---------------------------------------------------------------------------
function cspDirectives(): string {
  const scriptSrc = DEV_SERVER_URL ? `'self' 'unsafe-inline' ${DEV_SERVER_URL}` : "'self'";
  const connectSrc = DEV_SERVER_URL
    ? `'self' ${DEV_SERVER_URL} ws://localhost:5173`
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    // blob: est nécessaire au lecteur de musique (URL.createObjectURL sur des
    // fichiers audio choisis par l'utilisateur).
    "media-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
}

function setupContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ cancel: false, responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives()]
      }
    });
  });
}

// --- Câblage IPC (une seule fois, avant la création de la fenêtre) ---
ipcMain.handle('window:set-fullscreen', (_event, enabled: unknown) => {
  const target = getWindow();
  if (target && !target.isDestroyed()) target.setFullScreen(enabled === true);
});
registerPersistenceIpc(getWindow);
registerFileIpc();
registerBackupIpc();
registerGrammarIpc(getWindow);

app.whenReady().then(() => {
  // Pas de menu d'application : le menu par défaut d'Electron, même caché,
  // gardait ses raccourcis (Ctrl+R recharge, Ctrl+W ferme, zoom, F11, etc.).
  Menu.setApplicationMenu(null);

  setupContentSecurityPolicy();
  createWindow();
  setupAutoUpdater(getWindow, prepareForQuit);

  // Premier check 5s après le démarrage (laisse l'UI se charger), puis check
  // périodique pour les sessions d'écriture qui restent ouvertes longtemps.
  setTimeout(() => checkForUpdates(false), 5000);
  setInterval(() => checkForUpdates(false), FOUR_HOURS_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', stopGrammarServer);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});