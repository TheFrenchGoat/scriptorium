// src/main/fountain-importer.ts
// Import d'un scénario Fountain (.fountain) : lecture du fichier (encodage
// détecté comme pour les textes), puis analyse par src/shared/fountain.ts.
// Le projet obtenu est complété par sanitizeProjectData (réglages par
// défaut, identifiants uniques).

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseFountain } from '../shared/fountain';
import { decodeTextFile } from './text-importer';
import { projectNameFromFilePath } from './import-html';
import { mainMessage } from './main-texts';

/** Taille maximale acceptée (50 Mo). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Longueur maximale du nom de projet tiré du titre. */
const NAME_MAX_LENGTH = 120;

export interface FountainImportResult {
  projectName: string;
  /** Données brutes, à passer à sanitizeProjectData. */
  projectData: Record<string, unknown>;
}

export async function importFountainProject(filePath: string): Promise<FountainImportResult> {
  if ((await fs.promises.stat(filePath)).size > MAX_FILE_BYTES) {
    throw new Error(mainMessage('importFileTooLarge'));
  }

  const parsed = parseFountain(decodeTextFile(await fs.promises.readFile(filePath)), () => randomUUID());

  const titlePage = parsed.titlePage ?? {
    enabled: false,
    title: '',
    authors: '',
    contact: '',
    version: '',
    date: '',
    sourceNote: ''
  };

  const name = parsed.title.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);

  return {
    projectName: name || projectNameFromFilePath(filePath),
    projectData: {
      projectType: 'screenplay',
      chapters: {},
      screenplay: {
        version: 1,
        settings: { conventionLanguage: parsed.language },
        titlePage,
        scenes: parsed.scenes
      }
    }
  };
}
