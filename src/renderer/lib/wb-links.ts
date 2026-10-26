// src/renderer/lib/wb-links.ts
// Réglage « Liens de la bible dans le texte » (Paramètres > Écriture).
//
// Les mentions (.wb-mention) restent TOUJOURS dans le HTML : l'index
// « Mentionné dans », les renommages et les suppressions de fiches continuent
// de fonctionner. Le réglage ne change que l'affichage et les interactions.
//
// La marque est posée sur <html> (attribut data-wb-links="off") et non sur
// <body> : App.tsx remplace toutes les classes de <body> à chaque changement
// de thème ou de page, ce qui effaçait le réglage.

/** Attribut posé sur <html> quand les liens sont désactivés. */
export const WB_LINKS_ATTRIBUTE = 'data-wb-links';

/** Applique le réglage (appelé avec les préférences de l'éditeur). */
export function applyWbLinksPref(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (enabled) html.removeAttribute(WB_LINKS_ATTRIBUTE);
  else html.setAttribute(WB_LINKS_ATTRIBUTE, 'off');
}

/** true si les noms des fiches sont mis en évidence et cliquables. */
export function wbLinksEnabled(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.getAttribute(WB_LINKS_ATTRIBUTE) !== 'off';
}
