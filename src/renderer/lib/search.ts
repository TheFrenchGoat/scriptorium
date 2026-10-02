// src/renderer/lib/search.ts
// Recherche globale (lecture seule) : chapitres + fiches World Building, avec
// extraits de contexte autour de chaque occurrence.

import { escapeRegExp, stripHtmlToText } from './dom';
import type { ItemType, ProjectData } from '../../shared/types';

export interface SearchResult {
  type: ItemType;
  name: string;
  count: number;
  snippets: string[];
}

export function findSnippets(
  text: string,
  term: string,
  maxSnippets = 3,
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

export function runGlobalSearch(projectData: ProjectData, term: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!term.trim()) return results;

  Object.keys(projectData.chapters).forEach((chapName) => {
    const text = stripHtmlToText(projectData.chapters[chapName]);
    const { snippets, totalCount } = findSnippets(text, term);
    if (totalCount > 0) results.push({ type: 'chapter', name: chapName, count: totalCount, snippets });
  });

  Object.keys(projectData.world).forEach((wbName) => {
    const data = projectData.world[wbName];
    const combinedText = Object.values(data.content || {}).join('  ');
    const { snippets, totalCount } = findSnippets(combinedText, term);
    if (totalCount > 0) results.push({ type: 'world', name: wbName, count: totalCount, snippets });
  });

  return results;
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
