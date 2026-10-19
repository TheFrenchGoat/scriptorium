// src/renderer/lib/search.ts
// Recherche globale (lecture seule) : chapitres + fiches World Building, avec
// extraits de contexte autour de chaque occurrence.
//
// Pour les fiches, la recherche porte sur le contenu des champs, mais aussi
// sur le nom et les alias : une fiche est trouvée par son nom même si
// celui-ci n'apparaît dans aucun de ses champs.

import { escapeRegExp, stripHtmlToText } from './dom';
import type { ItemType, ProjectData } from '../../shared/types';

export interface SearchResult {
  type: ItemType;
  /** Nom du chapitre, ou identifiant de la fiche. */
  name: string;
  count: number;
  snippets: string[];
}

const MAX_SNIPPETS = 3;

export function findSnippets(
  text: string,
  term: string,
  maxSnippets = MAX_SNIPPETS,
  contextChars = 45
): { snippets: string[]; totalCount: number } {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const snippets: string[] = [];
  let cursor = 0;
  let totalCount = 0;

  for (;;) {
    const found = lowerText.indexOf(lowerTerm, cursor);
    if (found === -1) break;
    totalCount++;

    if (snippets.length < maxSnippets) {
      const start = Math.max(0, found - contextChars);
      const end = Math.min(text.length, found + term.length + contextChars);
      let snippet = text.slice(start, end);
      if (start > 0) snippet = '…' + snippet;
      if (end < text.length) snippet += '…';
      snippets.push(snippet);
    }
    cursor = found + term.length;
  }

  return { snippets, totalCount };
}

/** Nom et alias de la fiche qui contiennent le terme (sans doublon). */
function matchingNames(names: string[], term: string): string[] {
  const lowerTerm = term.toLowerCase();
  const seen = new Set<string>();
  const hits: string[] = [];

  names.forEach((raw) => {
    const value = (raw || '').trim();
    if (!value) return;

    const lower = value.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);

    if (lower.includes(lowerTerm)) hits.push(value);
  });

  return hits;
}

export function runGlobalSearch(projectData: ProjectData, term: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!term.trim()) return results;

  Object.keys(projectData.chapters).forEach((chapName) => {
    const text = stripHtmlToText(projectData.chapters[chapName]);
    const { snippets, totalCount } = findSnippets(text, term);
    if (totalCount > 0) results.push({ type: 'chapter', name: chapName, count: totalCount, snippets });
  });

  // Les fiches trouvées par leur nom ou un alias passent avant celles
  // trouvées seulement par leur contenu.
  const byName: SearchResult[] = [];
  const byContent: SearchResult[] = [];

  Object.keys(projectData.world).forEach((itemId) => {
    const item = projectData.world[itemId];
    if (!item) return;

    const nameHits = matchingNames([item.name, ...(item.aliases ?? [])], term);

    const combinedText = Object.values(item.content || {}).join('  ');
    const { snippets, totalCount } = findSnippets(combinedText, term);

    const count = nameHits.length + totalCount;
    if (count === 0) return;

    const result: SearchResult = {
      type: 'world',
      name: itemId,
      count,
      snippets: [...nameHits, ...snippets].slice(0, MAX_SNIPPETS)
    };

    if (nameHits.length > 0) byName.push(result);
    else byContent.push(result);
  });

  return [...results, ...byName, ...byContent];
}

/** Découpe un extrait autour des occurrences du terme, pour un rendu React
 *  (pas d'innerHTML : le terme recherché vient de l'utilisateur). */
export function splitSnippet(snippet: string, term: string): { text: string; match: boolean }[] {
  if (!term) return [{ text: snippet, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const pattern = new RegExp(escapeRegExp(term), 'gi');
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(snippet)) !== null) {
    if (m.index > lastIndex) parts.push({ text: snippet.slice(lastIndex, m.index), match: false });
    parts.push({ text: m[0], match: true });
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) pattern.lastIndex++; // garde-fou contre une boucle infinie
  }
  if (lastIndex < snippet.length) parts.push({ text: snippet.slice(lastIndex), match: false });
  return parts;
}
