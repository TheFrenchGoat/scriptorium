/**
 * Largeur du panneau gauche (Chapitres / World Building).
 * Enregistrée dans les préférences du logiciel (fichier sur le disque),
 * avec le stockage local de la fenêtre comme solution de secours.
 */
const STORAGE_KEY = 'scriptorium.sidebarWidth';
const MIN_WIDTH = 160;
const MAX_WIDTH = 500;
const SAVE_DELAY_MS = 300;

let persister: ((width: number) => void) | null = null;
let saveTimer: number | undefined;
let pendingWidth: number | null = null;

function clampWidth(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

/** Applique une largeur ; renvoie false si la valeur est absente ou invalide. */
export function applySidebarWidth(value: number | null | undefined): boolean {
  if (typeof value !== 'number' || !document.body) {
    return false;
  }

  const width = clampWidth(value);

  if (width === null) {
    return false;
  }

  document.body.style.setProperty('--sidebar-width', `${width}px`);
  return true;
}

/** Secours : largeur conservée dans le stockage local. */
export function restoreSidebarWidth(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      applySidebarWidth(Number.parseFloat(raw));
    }
  } catch {
    // Stockage indisponible.
  }
}

/** Fonction chargée d'écrire la largeur dans les préférences du logiciel. */
export function setSidebarWidthPersister(fn: ((width: number) => void) | null): void {
  persister = fn;
}

function flushPendingWidth(): void {
  saveTimer = undefined;

  if (pendingWidth !== null && persister) {
    persister(pendingWidth);
  }

  pendingWidth = null;
}

/** Appelée pendant le glissement : enregistre la largeur peu après la fin. */
export function saveSidebarWidth(value: number): void {
  const width = clampWidth(value);

  if (width === null) {
    return;
  }

  pendingWidth = width;

  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Stockage indisponible : les préférences suffisent.
  }

  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(flushPendingWidth, SAVE_DELAY_MS);
}

if (typeof document !== 'undefined') {
  if (document.body) {
    restoreSidebarWidth();
  } else {
    document.addEventListener('DOMContentLoaded', restoreSidebarWidth, { once: true });
  }
}