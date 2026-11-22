// src/renderer/lib/wb-events.ts
// Événements partagés entre l'éditeur de scénario et le contrôleur de l'éditeur.
// Fichier séparé pour éviter un import circulaire
// (ScreenplayElementEditor -> WbSidePanel -> useEditorController -> ScreenplayElementEditor).

/** Événement : ouvrir une fiche dans un onglet (Ctrl+clic dans une scène). */
export const WB_OPEN_TAB_EVENT = 'scriptorium:wb-open-tab';

/** Contenu de l'événement WB_OPEN_TAB_EVENT. */
export interface WbOpenTabEventDetail {
  itemId: string;
}
