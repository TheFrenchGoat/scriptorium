import { useSyncExternalStore } from 'react';

// Etat global "export en cours", partage entre le controleur et l'indicateur.
let busy = false;
const listeners = new Set<() => void>();

export function isExportBusy(): boolean {
  return busy;
}

export function setExportBusy(value: boolean): void {
  if (busy === value) return;
  busy = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useExportBusy(): boolean {
  return useSyncExternalStore(subscribe, isExportBusy, isExportBusy);
}
