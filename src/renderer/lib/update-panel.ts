// src/renderer/lib/update-panel.ts
// Indique si l'onglet « Mises à jour » des Paramètres est affiché à l'écran.
// UpdatesSection s'y inscrit ; UpdateNotifier le consulte avant d'ouvrir une
// fenêtre, pour ne pas montrer deux fois le même résultat.

type VisibilityCheck = () => boolean;

const panels = new Set<VisibilityCheck>();

/** Inscrit une section ; renvoie la fonction qui la désinscrit. */
export function registerUpdatesPanel(isShown: VisibilityCheck): () => void {
  panels.add(isShown);
  return () => {
    panels.delete(isShown);
  };
}

/** Vrai si au moins une section « Mises à jour » est visible. */
export function isUpdatesPanelShown(): boolean {
  return Array.from(panels).some((isShown) => isShown());
}
