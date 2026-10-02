// src/renderer/lib/edit-history.ts
// Système d'annulation/rétablissement (undo/redo) propre à Scriptorium,
// indépendant de document.execCommand('undo').
//
// Pourquoi ne pas se contenter du undo natif du navigateur ?
// Parce que le contentEditable est aussi manipulé par programme (le
// surlignage automatique des mentions World Building insère/retire des
// <span> en dehors de toute frappe utilisateur). Ces mutations parasitent la
// pile d'undo native de Chromium, qui finit par se comporter de façon
// imprévisible (annuler ne restaure pas ce que l'utilisateur attend).
//
// Cette pile est donc gérée nous-mêmes, par simples snapshots HTML, un
// historique indépendant par chapitre (comme le ferait un vrai éditeur à
// onglets multiples).

const MAX_HISTORY_PER_CHAPTER = 100;

interface HistoryEntry {
  undo: string[];
  redo: string[];
  committedHtml: string | null;
}

export interface EditHistory {
  sync(name: string, currentHtml: string): void;
  commit(name: string, newHtml: string): void;
  resyncOnly(name: string, finalHtml: string): void;
  canUndo(name: string | null): boolean;
  canRedo(name: string | null): boolean;
  undo(name: string, currentHtml: string): string | null;
  redo(name: string, currentHtml: string): string | null;
  rename(oldName: string, newName: string): void;
  remove(name: string): void;
}

export function createEditHistory(): EditHistory {
  const store = new Map<string, HistoryEntry>();

  function entryFor(name: string): HistoryEntry {
    let entry = store.get(name);
    if (!entry) {
      entry = { undo: [], redo: [], committedHtml: null };
      store.set(name, entry);
    }
    return entry;
  }

  return {
    // À appeler à l'ouverture d'un chapitre : resynchronise la référence
    // interne sans toucher aux piles déjà accumulées (l'historique survit aux
    // changements d'onglet pendant la session).
    sync(name, currentHtml) {
      entryFor(name).committedHtml = currentHtml;
    },

    // Enregistre un point de reprise si le contenu a réellement changé depuis
    // le dernier point connu. Toute nouvelle modification invalide le "redo"
    // en cours (comportement standard de tout éditeur de texte).
    commit(name, newHtml) {
      const h = entryFor(name);
      if (h.committedHtml === newHtml) return;
      if (h.committedHtml !== null) {
        h.undo.push(h.committedHtml);
        if (h.undo.length > MAX_HISTORY_PER_CHAPTER) h.undo.shift();
      }
      h.committedHtml = newHtml;
      h.redo = [];
    },

    // Resynchronise la référence après une mutation "cosmétique" (ex: le
    // re-surlignage World Building) qui ne doit PAS constituer une étape
    // d'annulation à part entière, sans pousser de nouvelle entrée.
    resyncOnly(name, finalHtml) {
      entryFor(name).committedHtml = finalHtml;
    },

    canUndo(name) {
      return name ? entryFor(name).undo.length > 0 : false;
    },
    canRedo(name) {
      return name ? entryFor(name).redo.length > 0 : false;
    },

    undo(name, currentHtml) {
      const h = entryFor(name);
      if (h.undo.length === 0) return null;
      const previous = h.undo.pop() as string;
      h.redo.push(currentHtml);
      if (h.redo.length > MAX_HISTORY_PER_CHAPTER) h.redo.shift();
      h.committedHtml = previous;
      return previous;
    },

    redo(name, currentHtml) {
      const h = entryFor(name);
      if (h.redo.length === 0) return null;
      const next = h.redo.pop() as string;
      h.undo.push(currentHtml);
      if (h.undo.length > MAX_HISTORY_PER_CHAPTER) h.undo.shift();
      h.committedHtml = next;
      return next;
    },

    // Migre l'historique lors d'un renommage de chapitre.
    rename(oldName, newName) {
      const existing = store.get(oldName);
      if (existing) {
        store.set(newName, existing);
        store.delete(oldName);
      }
    },

    // Libère l'historique d'un chapitre supprimé.
    remove(name) {
      store.delete(name);
    }
  };
}
