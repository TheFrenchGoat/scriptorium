// src/renderer/lib/ui-prefs.ts
// Préférences d'affichage de l'INTERFACE (taille et police des menus, de la
// barre latérale et des fenêtres). La feuille d'écriture a ses propres
// variables (--editor-*), appliquées par l'éditeur.
// Fichier séparé de App.tsx pour éviter un import circulaire
// (App -> ProjectsPage -> HomeSettingsModal -> App).
// La fonction ci-dessous est reprise telle quelle de App.tsx.

import type { EditorPrefs } from '../../shared/types';

/** Applique les préférences d'affichage de l'INTERFACE (taille et police des
 *  menus, sidebar, modales). La feuille d'écriture a ses propres variables
 *  (--editor-*), appliquées par l'éditeur. */
export function applyUiPrefs(prefs: EditorPrefs): void {
  document.body.style.setProperty('--ui-font-size', `${prefs.uiFontSize ?? 14}px`);
  document.body.style.setProperty('--ui-font-family', prefs.uiFontFamily ?? "'Roboto', sans-serif");
}
