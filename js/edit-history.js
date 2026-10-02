// js/edit-history.js
// Système d'annulation/rétablissement (undo/redo) propre à Scriptorium,
// indépendant de document.execCommand('undo').
//
// Pourquoi ne pas se contenter du undo natif du navigateur ?
// Parce que le contentEditable est aussi manipulé par programme (le
// surlignage automatique des mentions World Building insère/retire des
// <span> en dehors de toute frappe utilisateur). Ces mutations parasitent
// la pile d'undo native de Chromium, qui finit par se comporter de façon
// imprévisible (annuler ne restaure pas ce que l'utilisateur attend).
//
// Cette pile est donc gérée nous-mêmes, par simples snapshots HTML,
// un historique indépendant par chapitre (comme le ferait un vrai éditeur
// à onglets multiples).

const MAX_HISTORY_PER_CHAPTER = 100;

export function createEditHistory() {
  // name -> { undo: string[], redo: string[], committedHtml: string|null }
  const store = new Map();

  function entryFor(name) {
    if (!store.has(name)) {
      store.set(name, { undo: [], redo: [], committedHtml: null });
    }
    return store.get(name);
  }

  return {
    // À appeler à l'ouverture d'un chapitre : resynchronise la référence
    // interne sans toucher aux piles déjà accumulées (l'historique survit
    // aux changements d'onglet pendant la session).
    sync(name, currentHtml) {
      entryFor(name).committedHtml = currentHtml;
    },

    // Enregistre un point de reprise si le contenu a réellement changé
    // depuis le dernier point connu. Toute nouvelle modification invalide
    // le "redo" en cours (comportement standard de tout éditeur de texte).
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
    // d'annulation à part entière, sans pour autant pousser de nouvelle entrée.
    resyncOnly(name, finalHtml) {
      entryFor(name).committedHtml = finalHtml;
    },

    canUndo(name) { return entryFor(name).undo.length > 0; },
    canRedo(name) { return entryFor(name).redo.length > 0; },

    // Retourne le HTML à restaurer, ou null s'il n'y a rien à annuler.
    undo(name, currentHtml) {
      const h = entryFor(name);
      if (h.undo.length === 0) return null;
      const previous = h.undo.pop();
      h.redo.push(currentHtml);
      if (h.redo.length > MAX_HISTORY_PER_CHAPTER) h.redo.shift();
      h.committedHtml = previous;
      return previous;
    },

    // Retourne le HTML à restaurer, ou null s'il n'y a rien à rétablir.
    redo(name, currentHtml) {
      const h = entryFor(name);
      if (h.redo.length === 0) return null;
      const next = h.redo.pop();
      h.undo.push(currentHtml);
      if (h.undo.length > MAX_HISTORY_PER_CHAPTER) h.undo.shift();
      h.committedHtml = next;
      return next;
    },

    // Migre l'historique lors d'un renommage de chapitre.
    rename(oldName, newName) {
      if (store.has(oldName)) {
        store.set(newName, store.get(oldName));
        store.delete(oldName);
      }
    },

    // Libère l'historique d'un chapitre supprimé.
    remove(name) {
      store.delete(name);
    }
  };
}
