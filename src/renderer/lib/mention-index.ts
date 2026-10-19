// src/renderer/lib/mention-index.ts
// INDEX INVERSÉ DES MENTIONS (fiche -> chapitres où elle apparaît)
//
// Plutôt que de reparcourir tout le texte de tous les chapitres à chaque
// ouverture de fiche, on maintient un index tenu à jour de façon
// incrémentale (un seul chapitre à la fois, au fil de l'écriture).
//
// Format 2 du World Building :
// - l'index est organisé par IDENTIFIANT de fiche (et non plus par nom) ;
// - le nom ET les alias de chaque fiche sont recherchés ;
// - une mention posée dans le HTML (data-wb-key) compte aussi, même si son
//   texte ne correspond plus exactement au nom.
//
// Ce module fournit aussi les outils de détection partagés avec
// highlight.ts, afin que le surlignage et l'index reconnaissent exactement
// les mêmes mots.

import { stripHtmlToText } from './dom';
import type { ProjectData, WbItem } from '../../shared/types';

// ============================================================================
// OUTILS DE DÉTECTION PARTAGÉS
// ============================================================================

/*
 * Caractères spéciaux des expressions régulières, échappés un par un.
 * (Même méthode que dans odt-importer.ts.)
 */
const REGEX_SPECIAL_CHARS = '.*+?^${}()|[]\\';

export function escapeRegExp(value: string): string {
  let output = '';

  for (const char of value) {
    output += REGEX_SPECIAL_CHARS.includes(char) ? '\\' + char : char;
  }

  return output;
}

/**
 * Caractères considérés comme faisant partie d'un mot : toutes les lettres
 * (quelle que soit la langue), chiffres, accents combinés, tiret bas et
 * trait d'union.
 *
 * L'apostrophe n'en fait volontairement PAS partie : « d'Arthur » et
 * « l'Épée » doivent être détectés.
 *
 * À utiliser avec le drapeau `u`.
 */
export const WB_WORD_CHARS = '\\p{L}\\p{N}\\p{M}_-';

/**
 * Forme normalisée d'un terme : espaces réduits, minuscules.
 */
export function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Nom et alias d'une fiche, sans doublon ni valeur vide.
 */
export function getItemTerms(item: WbItem | null | undefined): string[] {
  if (!item) {
    return [];
  }

  const candidates: string[] = [];

  if (typeof item.name === 'string') {
    candidates.push(item.name);
  }

  if (Array.isArray(item.aliases)) {
    item.aliases.forEach((alias) => {
      if (typeof alias === 'string') {
        candidates.push(alias);
      }
    });
  }

  const seen = new Set<string>();
  const terms: string[] = [];

  candidates.forEach((candidate) => {
    const cleaned = candidate.replace(/\s+/g, ' ').trim();
    const key = normalizeTerm(cleaned);

    if (cleaned && !seen.has(key)) {
      seen.add(key);
      terms.push(cleaned);
    }
  });

  return terms;
}

/**
 * Motif d'un terme : chaque espace accepte une ou plusieurs espaces
 * quelconques (y compris insécables).
 */
function termPattern(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
}

/**
 * Construit une expression régulière reconnaissant l'un des termes donnés,
 * en respectant les frontières de mot.
 *
 * Les termes les plus longs sont essayés en premier : dans « Jean-Pierre »,
 * c'est « Jean-Pierre » qui est trouvé, pas « Jean ».
 *
 * Retourne `null` s'il n'y a aucun terme.
 */
export function buildTermsRegExp(terms: string[], flags = 'giu'): RegExp | null {
  const seen = new Set<string>();
  const unique: string[] = [];

  terms.forEach((term) => {
    const key = normalizeTerm(term);

    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(term);
    }
  });

  if (unique.length === 0) {
    return null;
  }

  unique.sort((a, b) => b.length - a.length);

  const alternation = unique.map(termPattern).join('|');

  return new RegExp(
    '(?<![' + WB_WORD_CHARS + '])(?:' + alternation + ')(?![' + WB_WORD_CHARS + '])',
    flags
  );
}

/**
 * Teste si un terme apparaît dans un texte, en respectant les frontières de
 * mot. Insensible à la casse.
 */
export function chapterTextMentions(text: string, term: string): boolean {
  const regex = buildTermsRegExp([term], 'iu');

  return regex ? regex.test(text) : false;
}

/**
 * Teste si une fiche (nom ou alias) apparaît dans un texte.
 */
export function textMentionsItem(text: string, item: WbItem): boolean {
  const regex = buildTermsRegExp(getItemTerms(item), 'iu');

  return regex ? regex.test(text) : false;
}

/**
 * Identifiants présents dans les attributs data-wb-key d'un HTML.
 */
export function collectMentionKeys(html: string): Set<string> {
  const keys = new Set<string>();

  if (typeof html !== 'string' || html.indexOf('data-wb-key') === -1) {
    return keys;
  }

  const pattern = /data-wb-key="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (match[1]) {
      keys.add(match[1]);
    }
  }

  return keys;
}

// ============================================================================
// INDEX
// ============================================================================

export interface MentionIndex {
  /** Recalcule les entrées pour UN SEUL chapitre. C'est la seule opération
   *  qui tourne au fil de la frappe ; le texte n'est parcouru qu'une fois,
   *  quel que soit le nombre de fiches. */
  updateForChapter(chapterName: string, html: string): void;

  /** Recalcule l'entrée d'UNE fiche dans tous les chapitres : à appeler
   *  après sa création, un changement de nom ou d'alias. */
  refreshItem(itemId: string): void;

  /** Reconstruction complète : uniquement pour les actions rares et
   *  globales (ouverture, import, restauration de sauvegarde). */
  rebuildAll(): void;

  /** Chapitres où la fiche apparaît, triés dans l'ordre du projet. */
  chaptersContaining(itemId: string): string[];

  removeChapter(chapterName: string): void;
  renameChapter(oldName: string, newName: string): void;
  removeItem(itemId: string): void;
  rebuildChapterOrder(): void;
}

interface TermMatcher {
  signature: string;
  regex: RegExp | null;

  /** terme normalisé -> identifiants des fiches qui l'utilisent */
  termToIds: Map<string, string[]>;
}

export function createMentionIndex(getProjectData: () => ProjectData): MentionIndex {
  /** identifiant de fiche -> Set(noms de chapitres) */
  let index = new Map<string, Set<string>>();

  /** nom de chapitre -> position, pour trier sans reparcourir la liste. */
  let chapterOrder = new Map<string, number>();

  let matcher: TermMatcher | null = null;

  function getWorld(): Record<string, WbItem> {
    const world = getProjectData().world;

    return world && typeof world === 'object' ? world : {};
  }

  function getChapters(): Record<string, string> {
    const chapters = getProjectData().chapters;

    return chapters && typeof chapters === 'object' ? chapters : {};
  }

  /**
   * Expression régulière unique couvrant toutes les fiches.
   *
   * Elle n'est reconstruite que si un nom ou un alias a changé.
   */
  function getMatcher(): TermMatcher {
    const world = getWorld();
    const entries: [string, string[]][] = [];
    const signatureParts: string[] = [];

    Object.entries(world).forEach(([id, item]) => {
      const terms = getItemTerms(item);

      entries.push([id, terms]);
      signatureParts.push(id + '=' + terms.map(normalizeTerm).join('|'));
    });

    const signature = signatureParts.join('\n');

    if (matcher && matcher.signature === signature) {
      return matcher;
    }

    const termToIds = new Map<string, string[]>();
    const allTerms: string[] = [];

    entries.forEach(([id, terms]) => {
      terms.forEach((term) => {
        const key = normalizeTerm(term);
        const ids = termToIds.get(key);

        if (ids) {
          if (!ids.includes(id)) {
            ids.push(id);
          }
        } else {
          termToIds.set(key, [id]);
          allTerms.push(term);
        }
      });
    });

    matcher = {
      signature,
      regex: buildTermsRegExp(allTerms, 'giu'),
      termToIds
    };

    return matcher;
  }

  /**
   * Identifiants des fiches mentionnées dans un chapitre.
   */
  function findItemsInHtml(html: string): Set<string> {
    const world = getWorld();
    const found = new Set<string>();
    const current = getMatcher();

    if (current.regex) {
      const text = stripHtmlToText(html);

      for (const match of text.matchAll(current.regex)) {
        const ids = current.termToIds.get(normalizeTerm(match[0]));

        ids?.forEach((id) => found.add(id));
      }
    }

    collectMentionKeys(html).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(world, key)) {
        found.add(key);
      }
    });

    return found;
  }

  function getSet(itemId: string): Set<string> {
    let set = index.get(itemId);

    if (!set) {
      set = new Set<string>();
      index.set(itemId, set);
    }

    return set;
  }

  const api: MentionIndex = {
    updateForChapter(chapterName, html) {
      const found = findItemsInHtml(html);

      Object.keys(getWorld()).forEach((itemId) => {
        const set = getSet(itemId);

        if (found.has(itemId)) {
          set.add(chapterName);
        } else {
          set.delete(chapterName);
        }
      });
    },

    refreshItem(itemId) {
      const item = getWorld()[itemId];

      if (!item) {
        index.delete(itemId);
        return;
      }

      const regex = buildTermsRegExp(getItemTerms(item), 'iu');
      const chapters = getChapters();
      const set = new Set<string>();

      Object.keys(chapters).forEach((chapterName) => {
        const html = chapters[chapterName];

        if (collectMentionKeys(html).has(itemId)) {
          set.add(chapterName);
          return;
        }

        if (regex && regex.test(stripHtmlToText(html))) {
          set.add(chapterName);
        }
      });

      index.set(itemId, set);
    },

    rebuildAll() {
      index = new Map();

      const chapters = getChapters();

      Object.keys(getWorld()).forEach((itemId) => getSet(itemId));

      Object.keys(chapters).forEach((chapterName) => {
        api.updateForChapter(chapterName, chapters[chapterName]);
      });

      api.rebuildChapterOrder();
    },

    chaptersContaining(itemId) {
      const set = index.get(itemId);

      if (!set || set.size === 0) {
        return [];
      }

      return Array.from(set).sort(
        (a, b) => (chapterOrder.get(a) ?? 0) - (chapterOrder.get(b) ?? 0)
      );
    },

    removeChapter(chapterName) {
      index.forEach((set) => set.delete(chapterName));
      chapterOrder.delete(chapterName);
    },

    renameChapter(oldName, newName) {
      // Le texte ne change pas, seul le nom du chapitre change.
      index.forEach((set) => {
        if (set.has(oldName)) {
          set.delete(oldName);
          set.add(newName);
        }
      });

      const order = chapterOrder.get(oldName);
      chapterOrder.delete(oldName);

      if (order !== undefined) {
        chapterOrder.set(newName, order);
      }
    },

    removeItem(itemId) {
      index.delete(itemId);
    },

    rebuildChapterOrder() {
      chapterOrder = new Map();

      Object.keys(getChapters()).forEach((name, position) => {
        chapterOrder.set(name, position);
      });
    }
  };

  return api;
}
