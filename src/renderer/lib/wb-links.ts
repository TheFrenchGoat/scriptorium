// src/renderer/lib/wb-links.ts
// Réglage « Liens de la bible dans le texte » (Paramètres > Écriture).
//
// Les mentions (.wb-mention) restent TOUJOURS dans le HTML : l'index
// « Mentionné dans », les renommages et les suppressions de fiches continuent
// de fonctionner. Le réglage ne change que l'affichage et les interactions :
// une classe posée sur <body> neutralise la couleur (style.css), et les
// gestionnaires de clic et de survol consultent wbLinksEnabled().

/** Classe posée sur <body> quand les liens sont désactivés. */
export const WB_LINKS_OFF_CLASS = 'wb-links-off';

/** Applique le réglage (appelé avec les préférences de l'éditeur). */
export function applyWbLinksPref(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle(WB_LINKS_OFF_CLASS, !enabled);
}

/** true si les noms des fiches sont mis en évidence et cliquables. */
export function wbLinksEnabled(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.body.classList.contains(WB_LINKS_OFF_CLASS);
}
