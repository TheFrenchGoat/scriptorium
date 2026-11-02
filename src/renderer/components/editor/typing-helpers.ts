// src/renderer/components/editor/typing-helpers.ts
// Outils de fluidité de la frappe (étape 4d) :
// - createTrailingThrottle : regroupe des calculs répétés (compteur de mots) ;
// - shallowEqual : évite un nouvel affichage quand un petit objet n'a pas changé.
// Sans dépendance au DOM, pour pouvoir être testés automatiquement.

/** Minuteurs utilisés (remplacés par une fausse horloge dans les tests). */
export interface ThrottleTimers {
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
}

const defaultTimers: ThrottleTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export interface TrailingThrottle {
  /** Demande un calcul : il aura lieu au plus tard après le délai. */
  schedule(): void;
  /** Annule le calcul en attente, s'il y en a un. */
  cancel(): void;
  /** Indique si un calcul est en attente. */
  pending(): boolean;
}

/**
 * Exécute task au plus une fois par délai. La première demande lance le
 * minuteur ; les demandes suivantes pendant l'attente sont regroupées. Le
 * calcul a donc lieu au plus tard delayMs après chaque demande, et il lit
 * l'état du moment : la dernière demande est toujours prise en compte.
 */
export function createTrailingThrottle(
  task: () => void,
  delayMs: number,
  timers: ThrottleTimers = defaultTimers
): TrailingThrottle {
  let handle: unknown = null;
  let waiting = false;

  return {
    schedule() {
      if (waiting) {
        return;
      }

      waiting = true;
      handle = timers.set(() => {
        waiting = false;
        handle = null;
        task();
      }, delayMs);
    },
    cancel() {
      if (!waiting) {
        return;
      }

      timers.clear(handle);
      waiting = false;
      handle = null;
    },
    pending: () => waiting
  };
}

/** Vrai si les deux objets ont les mêmes clés et les mêmes valeurs (sans profondeur). */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) {
    return true;
  }

  const keysA = Object.keys(a) as (keyof T)[];
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key])
  );
}
