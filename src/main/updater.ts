// src/main/updater.ts
// MISE À JOUR AUTOMATIQUE (electron-updater)
//
// electron-builder publie, à chaque `npm run release`, le setup .exe
// accompagné d'un fichier `latest.yml` sur les Releases GitHub du dépôt
// configuré dans package.json#build.publish. Au démarrage (et toutes les 4h si
// l'app reste ouverte longtemps, ce qui est courant pour un éditeur de texte),
// on interroge ce `latest.yml`.
//
// Contrairement à la version initiale, le téléchargement n'est PLUS
// automatique dès qu'une mise à jour est détectée : on prévient d'abord le
// renderer (événement 'updater:available'), qui affiche une modale interne
// demandant confirmation — cohérent avec le reste de l'appli, qui n'utilise
// jamais de boîte de dialogue système. Le téléchargement ne démarre qu'après
// le consentement explicite de l'utilisateur, sur l'appel 'updater:confirm-download'.

import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// Un check manuel (bouton "Rechercher les mises à jour…") doit TOUJOURS
// répondre quelque chose — jamais rester sans effet visible, sinon le bouton
// paraît cassé. Un check automatique en fond, lui, doit rester silencieux
// s'il n'y a rien de neuf ou en cas d'échec, pour ne pas interrompre
// l'écriture. Une mise à jour TROUVÉE, elle, est toujours signalée, qu'elle
// vienne d'un check manuel ou automatique.
let isManualUpdateCheck = false;
let sendToWindow: (channel: string, ...args: unknown[]) => void = () => {};

export function checkForUpdates(manual = false): void {
  // Un check AUTOMATIQUE (silencieux) n'a aucun sens en dev : il n'y a pas de
  // build publiée à comparer, et ça ne ferait que polluer la console à
  // chaque démarrage. Un check MANUEL, en revanche, doit réagir même en
  // dev — au minimum en l'expliquant clairement — pour que le bouton
  // "Rechercher les mises à jour" ne reste jamais silencieux.
  if (!app.isPackaged) {
    if (manual) {
      sendToWindow(
        'updater:error',
        "La vérification des mises à jour n'est disponible que dans une version installée de l'application (pas en développement)."
      );
    }
    return;
  }

  isManualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch((err) => console.error('checkForUpdates:', err));
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  sendToWindow = (channel, ...args) => {
    getWindow()?.webContents.send(channel, ...args);
  };

  autoUpdater.on('update-available', (info) => {
    sendToWindow('updater:available', { version: info.version });
    isManualUpdateCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    if (isManualUpdateCheck) sendToWindow('updater:not-available');
    isManualUpdateCheck = false;
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendToWindow('updater:downloaded', { version: info.version });
    isManualUpdateCheck = false;
  });

  autoUpdater.on('error', (err) => {
    // Échec silencieux en fond (pas de connexion, dépôt non configuré...) : on
    // ne dérange pas l'utilisateur en pleine écriture. On l'informe seulement
    // s'il a demandé une vérification manuelle.
    console.error('Erreur auto-updater :', err);
    if (isManualUpdateCheck) sendToWindow('updater:error', err.message);
    isManualUpdateCheck = false;
  });

  ipcMain.handle('updater:check', () => checkForUpdates(true));
  ipcMain.handle('updater:get-version', () => app.getVersion());
  ipcMain.handle('updater:confirm-download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:quit-and-install', () => autoUpdater.quitAndInstall());
}
