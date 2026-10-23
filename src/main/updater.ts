// src/main/updater.ts
// MISE À JOUR AUTOMATIQUE (electron-updater)
//
// electron-builder publie, à chaque `npm run release`, le setup .exe
// accompagné d'un fichier `latest.yml` sur les Releases GitHub du dépôt
// configuré dans package.json#build.publish. Au démarrage (et toutes les 4h si
// l'app reste ouverte longtemps, ce qui est courant pour un éditeur de texte),
// on interroge ce `latest.yml`.
//
// Le téléchargement n'est pas automatique : on prévient d'abord le renderer
// (événement 'updater:update-available'), qui demande confirmation dans une
// fenêtre interne, jamais une boîte de dialogue système. Le téléchargement ne
// démarre qu'après l'appel 'updater:confirm-download'.
//
// Le processus principal garde l'état de la mise à jour trouvée (proposée, en
// téléchargement, prête) : une fenêtre ouverte plus tard le retrouve par
// 'updater:get-pending'. Pendant le téléchargement, l'avancement est envoyé
// par 'updater:download-progress'. Un échec du téléchargement est toujours
// signalé, puisqu'il fait suite à une demande de l'utilisateur.

import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

type UpdateState = 'available' | 'downloading' | 'downloaded';

interface PendingUpdate {
  version: string;
  state: UpdateState;
  /** Avancement du téléchargement, de 0 à 100. */
  percent: number;
}

// Un check manuel (bouton "Rechercher les mises à jour") doit TOUJOURS
// répondre quelque chose, jamais rester sans effet visible, sinon le bouton
// paraît cassé. Un check automatique en fond, lui, doit rester silencieux
// s'il n'y a rien de neuf ou en cas d'échec, pour ne pas interrompre
// l'écriture. Une mise à jour TROUVÉE, elle, est toujours signalée.
let isManualUpdateCheck = false;
let pendingUpdate: PendingUpdate | null = null;
let sendToWindow: (channel: string, ...args: unknown[]) => void = () => {};

// Vrai pendant « Redémarrer et installer » : empêche un double clic de lancer
// deux fois l'enregistrement puis l'installation. Remis à faux en cas d'erreur
// pour que l'utilisateur puisse réessayer.
let installRequested = false;

/**
 * Première ligne du message d'erreur, raccourcie : les erreurs réseau
 * contiennent parfois toute la réponse du serveur.
 */
function shortMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const first = raw.split('\n')[0].trim();
  return first.length > 300 ? first.slice(0, 300) + '...' : first;
}

/** Renvoie au renderer l'état d'un téléchargement en cours ou terminé. */
function resendPendingState(): void {
  if (!pendingUpdate) return;
  if (pendingUpdate.state === 'downloading') {
    sendToWindow('updater:download-progress', {
      version: pendingUpdate.version,
      percent: pendingUpdate.percent
    });
  } else if (pendingUpdate.state === 'downloaded') {
    sendToWindow('updater:update-downloaded', { version: pendingUpdate.version });
  }
}

/** Échec du téléchargement : la mise à jour redevient « proposée » et l'utilisateur est prévenu. */
function failDownload(err: unknown): void {
  if (!pendingUpdate || pendingUpdate.state !== 'downloading') return;
  pendingUpdate = { ...pendingUpdate, state: 'available', percent: 0 };
  sendToWindow('updater:error', shortMessage(err), 'download');
}

async function startDownload(): Promise<void> {
  if (!pendingUpdate) return;
  // Déjà en cours ou terminé : on renvoie seulement l'état actuel.
  if (pendingUpdate.state !== 'available') {
    resendPendingState();
    return;
  }
  pendingUpdate = { ...pendingUpdate, state: 'downloading', percent: 0 };
  sendToWindow('updater:download-progress', { version: pendingUpdate.version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    // electron-updater émet aussi 'error' : si l'échec y a déjà été signalé,
    // l'état est revenu à « proposée » et failDownload ne fait rien.
    console.error('downloadUpdate:', err);
    failDownload(err);
  }
}

export function checkForUpdates(manual = false): void {
  // Un check AUTOMATIQUE n'a aucun sens en dev : il n'y a pas de build publiée
  // à comparer. Un check MANUEL, en revanche, doit réagir même en dev, au
  // minimum en l'expliquant clairement.
  if (!app.isPackaged) {
    if (manual) {
      sendToWindow(
        'updater:error',
        "La vérification des mises à jour n'est disponible que dans une version installée de l'application (pas en développement).",
        'check'
      );
    }
    return;
  }

  // Téléchargement en cours ou terminé : inutile d'interroger GitHub de
  // nouveau. Une vérification manuelle reçoit simplement l'état actuel.
  if (pendingUpdate && pendingUpdate.state !== 'available') {
    if (manual) resendPendingState();
    return;
  }

  isManualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch((err) => console.error('checkForUpdates:', err));
}

/**
 * @param prepareForQuit Enregistre le projet et autorise la fermeture de la
 *   fenêtre sans nouvelle attente. Appelée AVANT quitAndInstall : sinon
 *   l'installateur démarrerait pendant que la fenêtre retient encore sa
 *   fermeture, et pourrait arrêter l'application en plein enregistrement.
 */
export function setupAutoUpdater(
  getWindow: () => BrowserWindow | null,
  prepareForQuit: () => Promise<void> = () => Promise.resolve()
): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  sendToWindow = (channel, ...args) => {
    getWindow()?.webContents.send(channel, ...args);
  };

  autoUpdater.on('update-available', (info) => {
    const manual = isManualUpdateCheck;
    isManualUpdateCheck = false;
    // Même version déjà proposée : une vérification automatique (toutes les
    // 4 heures) ne rouvre pas la fenêtre ; une vérification manuelle, si.
    if (!manual && pendingUpdate && pendingUpdate.version === info.version) return;
    pendingUpdate = { version: info.version, state: 'available', percent: 0 };
    sendToWindow('updater:update-available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    if (isManualUpdateCheck) sendToWindow('updater:update-not-available');
    isManualUpdateCheck = false;
    if (pendingUpdate && pendingUpdate.state === 'available') pendingUpdate = null;
  });

  autoUpdater.on('download-progress', (progress) => {
    if (!pendingUpdate || pendingUpdate.state !== 'downloading') return;
    const raw = Number.isFinite(progress.percent) ? progress.percent : 0;
    const percent = Math.max(0, Math.min(100, Math.floor(raw)));
    // Un message par point de pourcentage suffit.
    if (percent === pendingUpdate.percent) return;
    pendingUpdate = { ...pendingUpdate, percent };
    sendToWindow('updater:download-progress', { version: pendingUpdate.version, percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    pendingUpdate = { version: info.version, state: 'downloaded', percent: 100 };
    sendToWindow('updater:update-downloaded', { version: info.version });
    isManualUpdateCheck = false;
  });

  autoUpdater.on('error', (err) => {
    console.error('Erreur auto-updater :', err);
    installRequested = false;
    if (pendingUpdate && pendingUpdate.state === 'downloading') {
      // Toujours signalé : le téléchargement a été demandé par l'utilisateur.
      failDownload(err);
    } else if (isManualUpdateCheck) {
      // Échec d'une vérification en fond : silencieux, pour ne pas déranger
      // l'écriture. Signalé seulement après une vérification manuelle.
      sendToWindow('updater:error', shortMessage(err), 'check');
    }
    isManualUpdateCheck = false;
  });

  ipcMain.handle('updater:check', () => checkForUpdates(true));
  ipcMain.handle('updater:get-version', () => app.getVersion());
  ipcMain.handle('updater:confirm-download', () => startDownload());
  ipcMain.handle('updater:quit-and-install', async () => {
    if (installRequested) return;
    installRequested = true;
    try {
      await prepareForQuit();
    } catch (err) {
      console.error('Préparation de la fermeture :', err);
    }
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('updater:get-pending', () => pendingUpdate);
}
