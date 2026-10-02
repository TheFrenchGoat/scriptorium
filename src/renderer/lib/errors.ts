// src/renderer/lib/errors.ts
// `ipcRenderer.invoke()` enveloppe systématiquement les erreurs renvoyées par
// le processus principal dans un message du type :
//   "Error invoking remote method 'grammar:auto-install': Error: <message réel>"
// Ce boilerplate (répété parfois deux fois si l'erreur d'origine était déjà
// une Error) n'apporte rien à l'utilisateur et rend les messages d'erreur
// affichés dans les modales illisibles. On l'enlève avant affichage.

const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*':\s*/;
const REDUNDANT_ERROR_PREFIX = /^Error:\s*/;

export function describeError(err: unknown): string {
  let message = err instanceof Error ? err.message : String(err);
  message = message.replace(IPC_ERROR_PREFIX, '');
  // Le message réel peut lui-même commencer par "Error: " une ou deux fois
  // selon les couches traversées ; on les retire toutes.
  while (REDUNDANT_ERROR_PREFIX.test(message)) {
    message = message.replace(REDUNDANT_ERROR_PREFIX, '');
  }
  return message;
}
