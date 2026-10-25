// Notes de version affichees par la fenetre "Quoi de neuf".
// Pour une nouvelle version : ajouter un bloc EN TETE du tableau.

export interface WhatsNewEntry {
  version: string;
  fr: string[];
  en: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.4.0',
    fr: [
      'Nouvelle fenêtre d’export avec un aperçu de la mise en page.',
      'Modèles et réglages de mise en page pour vos exports.',
      'Nouveau format ODT (LibreOffice, OpenOffice).',
      'Les scénarios s’exportent maintenant en Word et en ODT.',
      'La bible de l’univers peut être jointe à l’export, avec les portraits.',
      'Les couleurs du texte sont conservées à l’export, sans les surlignages de la bible.',
      'Un indicateur « Export en cours… » s’affiche pendant les exports.'
    ],
    en: [
      'New export window with a layout preview.',
      'Layout templates and settings for your exports.',
      'New ODT format (LibreOffice, OpenOffice).',
      'Screenplays can now be exported to Word and ODT.',
      'The world bible can be included in exports, with portraits.',
      'Text colors are kept on export, without the world bible highlights.',
      'An "Exporting…" indicator is shown during exports.'
    ]
  }
];

/** Compare deux versions "1.4.0" : negatif si a < b, 0 si egales, positif si a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
