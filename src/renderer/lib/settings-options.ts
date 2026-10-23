// src/renderer/lib/settings-options.ts
// Listes de choix communes aux deux fenêtres « Paramètres » (accueil et
// éditeur) : thèmes, largeurs, polices, interlignes, tailles, sons du
// minuteur et échelles des sessions.
// Source unique : un thème ou une police ajouté ici apparaît dans les deux
// fenêtres.

import type { SessionRatingScale, ThemeName } from '../../shared/types';
import type { TranslationKey } from '../i18n';
import type { TimerSoundId } from './sound';

/** Choix affiché avec un libellé traduit. */
export interface LabelledChoice<T> {
  value: T;
  key: TranslationKey;
}

/** Police : le libellé est le nom de la police (non traduit). */
export interface FontChoice {
  value: string;
  label: string;
}

export const THEMES: LabelledChoice<ThemeName>[] = [
  { value: 'dark', key: 'themeDark' },
  { value: 'light', key: 'themeLight' },
  { value: 'sepia', key: 'themeSepia' },
  { value: 'midnight', key: 'themeMidnight' },
  { value: 'forest', key: 'themeForest' },
  { value: 'contrast', key: 'themeContrast' },
  { value: 'rose', key: 'themeRose' },
  { value: 'lavender', key: 'themeLavender' },
  { value: 'ocean', key: 'themeOcean' }
];

export const TIMER_SOUND_LABEL_KEYS: Record<TimerSoundId, TranslationKey> = {
  chime: 'timerSoundChime',
  bell: 'timerSoundBell',
  soft: 'timerSoundSoft',
  alarm: 'timerSoundAlarm'
};

/** Largeur de la page d'écriture (px). */
export const WIDTHS: LabelledChoice<number>[] = [
  { value: 650, key: 'prefWidthNarrow' },
  { value: 800, key: 'prefWidthNormal' },
  { value: 1000, key: 'prefWidthLarge' },
  { value: 1300, key: 'prefWidthXLarge' }
];

/** Polices du texte (éditeur). */
export const READING_FONTS: FontChoice[] = [
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Merriweather', serif", label: 'Merriweather' }
];

/** Interlignes du texte. */
export const LINE_HEIGHTS: LabelledChoice<number>[] = [
  { value: 1.4, key: 'prefLineCompact' },
  { value: 1.6, key: 'prefLineNormal' },
  { value: 1.8, key: 'prefLineAiry' },
  { value: 2.2, key: 'prefLineVeryAiry' }
];

/** Tailles de l'interface (px). */
export const UI_SIZES: LabelledChoice<number>[] = [
  { value: 12, key: 'prefUiSizeSmall' },
  { value: 14, key: 'prefUiSizeNormal' },
  { value: 16, key: 'prefUiSizeLarge' },
  { value: 18, key: 'prefUiSizeXLarge' }
];

/** Polices de l'interface. */
export const UI_FONTS: FontChoice[] = [
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Segoe UI', sans-serif", label: 'Segoe UI' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' }
];

export const SESSION_RATING_SCALES: SessionRatingScale[] = [5, 10, 20];

/** Échelle de notation des sessions : 10 par défaut. */
export function normalizeSessionRatingScale(
  value: number | undefined
): SessionRatingScale {
  if (value === 5 || value === 20) return value;
  return 10;
}
