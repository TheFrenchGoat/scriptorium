// src/renderer/components/editor/controller/constants.ts
// Constantes de l'éditeur : délais, seuils de surlignage, zoom et préférences par défaut.
// Extraites de useEditorController.ts (étape 4c-1), sans changement de comportement.

import type { EditorPrefs } from '../../../../shared/types';

export const HIGHLIGHT_SIZE_THRESHOLD = 50000;
export const HIGHLIGHT_MANY_ITEMS_THRESHOLD = 60;
export const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5;
export const HISTORY_DEBOUNCE_MS = 700;
export const CHAPTER_SAVE_DEBOUNCE_MS = 2500;
export const SCREENPLAY_SAVE_DEBOUNCE_MS = 1500;
/** Délai avant d'enregistrer les modifications d'une fiche (champs, mode lecture). */
export const WB_SAVE_DEBOUNCE_MS = 800;
export const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Langue de vérification grammaticale.
 *
 * Volontairement indépendante de la langue de l'interface : un roman français
 * reste vérifié en français même si l'interface est en anglais. Un réglage
 * dédié pourra remplacer cette constante plus tard.
 */
export const GRAMMAR_LANGUAGE = 'fr';

export const EDITOR_ZOOM_MIN = 0.5;
export const EDITOR_ZOOM_MAX = 2.5;
export const EDITOR_ZOOM_STEP = 0.1;

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  width: 800,
  fontFamily: "'Roboto', sans-serif",
  lineHeight: 1.6,
  uiFontSize: 14,
  uiFontFamily: "'Roboto', sans-serif",
  timerSoundEnabled: true,
  timerVolume: 0.5,
  timerSoundId: 'chime',
  marginLeft: 80,
  marginRight: 80,
  firstLineIndent: 0
};
