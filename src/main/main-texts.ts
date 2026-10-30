// src/main/main-texts.ts
// Textes affichés par le processus principal : menu du clic droit, titre de
// fenêtre système, messages d'erreur réseau de l'installation de LanguageTool.
// Le dictionnaire de l'interface (src/renderer/i18n) n'est pas accessible ici.
//
// La langue est fournie par l'appelant (en général store.get('language')) :
// ce module ne lit pas les réglages lui-même, ce qui permet de le tester sans
// lancer Electron. Toute valeur autre que 'en' donne le français.
//
// Messages d'erreur : main.ts enregistre une seule fois la source de langue
// (setMainLanguageSource) ; mainMessage(cle) relit alors la langue en cours
// à chaque appel. Sans source enregistrée (tests), le français est utilisé.

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
    'Le certificat de sécurité du site de téléchargement est invalide (réseau ou proxy suspect).',
  // Import de fichiers (Word, ODT, texte, Fountain, HTML)
  importDocxInvalid: "Le fichier sélectionné n'est pas un document Word (.docx) valide.",
  importDocxNotFound: 'Le fichier Word sélectionné est introuvable.',
  importDocxOpenFailed: "Impossible d'ouvrir le document Word. Le fichier est peut-être endommagé.",
  importDocxMissingDocument: 'Document Word invalide : le fichier word/document.xml est absent.',
  importDocxReadFailed: 'Impossible de lire le document Word. Le fichier est peut-être endommagé.',
  importDocxNoText: 'Le document Word ne contient aucun texte importable.',
  importOdtInvalid: "Le fichier sélectionné n'est pas un document ODT valide.",
  importOdtNotFound: 'Le fichier ODT sélectionné est introuvable.',
  importOdtOpenFailed: "Impossible d'ouvrir le document ODT. Le fichier est peut-être endommagé.",
  importOdtMissingContent: 'Document ODT invalide : le fichier content.xml est absent.',
  importOdtNoText: 'Le document ODT ne contient aucun texte importable.',
  importNoText: 'Le fichier ne contient aucun texte importable.',
  importNotTextFile: "Le fichier sélectionné n'est pas un fichier texte (.txt) ou Markdown (.md).",
  importFileTooLarge: 'Le fichier est trop volumineux (50 Mo au maximum).',
  importFileEmpty: 'Le fichier est vide.',
  importFileUnreadable: "Le fichier sélectionné n'est pas un fichier texte lisible.",
  importDefaultProjectName: 'Document importé'
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
    'The security certificate of the download site is invalid (suspicious network or proxy).',
  // File import (Word, ODT, text, Fountain, HTML)
  importDocxInvalid: 'The selected file is not a valid Word document (.docx).',
  importDocxNotFound: 'The selected Word file cannot be found.',
  importDocxOpenFailed: 'Cannot open the Word document. The file may be damaged.',
  importDocxMissingDocument: 'Invalid Word document: the word/document.xml file is missing.',
  importDocxReadFailed: 'Cannot read the Word document. The file may be damaged.',
  importDocxNoText: 'The Word document contains no importable text.',
  importOdtInvalid: 'The selected file is not a valid ODT document.',
  importOdtNotFound: 'The selected ODT file cannot be found.',
  importOdtOpenFailed: 'Cannot open the ODT document. The file may be damaged.',
  importOdtMissingContent: 'Invalid ODT document: the content.xml file is missing.',
  importOdtNoText: 'The ODT document contains no importable text.',
  importNoText: 'The file contains no importable text.',
  importNotTextFile: 'The selected file is not a text (.txt) or Markdown (.md) file.',
  importFileTooLarge: 'The file is too large (50 MB maximum).',
  importFileEmpty: 'The file is empty.',
  importFileUnreadable: 'The selected file is not a readable text file.',
  importDefaultProjectName: 'Imported document'
};

export const mainTexts: Record<MainLanguage, Record<MainTextKey, string>> = { fr, en };

export function normalizeMainLanguage(value: unknown): MainLanguage {
  return value === 'en' ? 'en' : 'fr';
}

export function mainText(key: MainTextKey, lang: unknown): string {
  return mainTexts[normalizeMainLanguage(lang)][key] ?? fr[key] ?? key;
}

/** Fonction qui renvoie la langue en cours (enregistrée par main.ts). */
type MainLanguageSource = () => unknown;

let languageSource: MainLanguageSource | null = null;

/** Enregistre la façon de lire la langue choisie (appelé une seule fois par main.ts). */
export function setMainLanguageSource(source: MainLanguageSource | null): void {
  languageSource = source;
}

/** Langue en cours : français si aucune source n'est enregistrée ou si sa lecture échoue. */
export function currentMainLanguage(): MainLanguage {
  if (!languageSource) return 'fr';
  try {
    return normalizeMainLanguage(languageSource());
  } catch {
    return 'fr';
  }
}

/** Texte dans la langue en cours, avec remplacement des variables fournies. */
export function mainMessage(key: MainTextKey, vars?: Record<string, string | number>): string {
  const text = mainText(key, currentMainLanguage());
  if (!vars) return text;
  const values: Record<string, string | number> = vars;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole: string, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
  );
}
