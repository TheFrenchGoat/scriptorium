// src/main/main-texts.ts
// Textes affichés par le processus principal : menu du clic droit, titre de
// fenêtre système, messages d'erreur réseau de l'installation de LanguageTool.
// Le dictionnaire de l'interface (src/renderer/i18n) n'est pas accessible ici.
//
// La langue est fournie par l'appelant (en général store.get('language')) :
// ce module ne lit pas les réglages lui-même, ce qui permet de le tester sans
// lancer Electron. Toute valeur autre que 'en' donne le français.

export type MainLanguage = 'fr' | 'en';

const fr = {
  ctxNoSuggestions: 'Aucune suggestion',
  ctxAddToDictionary: 'Ajouter au dictionnaire',
  ctxCopy: 'Copier',
  ctxPaste: 'Coller',
  ctxCut: 'Couper',
  ctxSelectAll: 'Tout sélectionner',
  ctxAddComment: 'Ajouter un commentaire',
  dialogSelectLanguageToolFolder: 'Sélectionner le dossier LanguageTool',
  netNotFound:
    "Impossible de joindre languagetool.org : vérifiez votre connexion Internet (ou un pare-feu/proxy qui bloquerait l'accès), puis réessayez.",
  netRefused: 'Connexion refusée par le serveur de téléchargement. Réessayez plus tard.',
  netReset: 'La connexion a été interrompue pendant le téléchargement. Réessayez.',
  netTimeout: 'Le téléchargement a expiré (délai dépassé). Vérifiez votre connexion et réessayez.',
  netCertificate:
    'Le certificat de sécurité du site de téléchargement est invalide (réseau ou proxy suspect).'
};

export type MainTextKey = keyof typeof fr;

const en: Record<MainTextKey, string> = {
  ctxNoSuggestions: 'No suggestions',
  ctxAddToDictionary: 'Add to dictionary',
  ctxCopy: 'Copy',
  ctxPaste: 'Paste',
  ctxCut: 'Cut',
  ctxSelectAll: 'Select all',
  ctxAddComment: 'Add a comment',
  dialogSelectLanguageToolFolder: 'Select the LanguageTool folder',
  netNotFound:
    'Cannot reach languagetool.org: check your Internet connection (or a firewall/proxy that might block access), then try again.',
  netRefused: 'Connection refused by the download server. Try again later.',
  netReset: 'The connection was interrupted during the download. Try again.',
  netTimeout: 'The download timed out. Check your connection and try again.',
  netCertificate:
    'The security certificate of the download site is invalid (suspicious network or proxy).'
};

export const mainTexts: Record<MainLanguage, Record<MainTextKey, string>> = { fr, en };

export function normalizeMainLanguage(value: unknown): MainLanguage {
  return value === 'en' ? 'en' : 'fr';
}

export function mainText(key: MainTextKey, lang: unknown): string {
  return mainTexts[normalizeMainLanguage(lang)][key] ?? fr[key] ?? key;
}
