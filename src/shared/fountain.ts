// src/shared/fountain.ts
// Format Fountain : scènario en texte brut (https://fountain.io).
//
// - buildFountainText : scénario Scriptorium -> texte Fountain (export) ;
// - parseFountain : texte Fountain -> page de titre et scènes (import).
//
// Module partagé, sans DOM ni Node : il sert au processus principal
// (import) comme à l'interface (export).
//
// Correspondances :
// - en-tête de scène : ligne INT. / EXT. (sinon forcée par un point) ;
// - titre de travail de la scène : résumé "= ..." sous l'en-tête ;
// - personnage, didascalie (...), réplique : bloc sans ligne vide ;
// - transition : "... TO:" ou "> ..." ;
// - plan : ligne d'action en majuscules (redevient une action à l'import) ;
// - gras **...**, italique *...*, souligné _..._.
// Import : sections (#), notes [[...]], commentaires et sauts de page (===)
// ignorés ; double dialogue (^) : répliques l'une après l'autre.

import type {
  FreeScreenplayHeading,
  ScreenplayElementType,
  ScreenplayProjectData,
  ScreenplayScene,
  StructuredScreenplayHeading
} from './types';

type TitlePage = ScreenplayProjectData['titlePage'];
type SceneHeading = ScreenplayScene['heading'];
type InteriorExterior = StructuredScreenplayHeading['interiorExterior'];
type Language = 'fr' | 'en';

export interface ParsedFountain {
  /** Titre lu dans la page de titre ('' si absent). */
  title: string;
  /** Conventions devinées d'après le texte. */
  language: Language;
  /** Page de titre (null si le fichier n'en a pas). */
  titlePage: TitlePage | null;
  scenes: ScreenplayScene[];
}

// ---------------------------------------------------------------------------
// Outils communs
// ---------------------------------------------------------------------------

/** En-tête de scène reconnu sans point forcé. */
const HEADING_PATTERN = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[. ]/i;

/** Premiers caractères qui changent le type d'une ligne Fountain. */
const SPECIAL_STARTS = '!@.>~#=[';

function hasLetters(value: string): boolean {
  return value.toUpperCase() !== value.toLowerCase();
}

function isUpperCase(value: string): boolean {
  return hasLetters(value) && value === value.toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Nom de personnage sans extension (V.O.) ni marque de double dialogue. */
function cueBase(line: string): string {
  return line
    .replace(/\s*\^\s*$/, '')
    .replace(/\s*$[^)]*$\s*$/, '')
    .trim();
}

/** Ligne reconnue comme personnage sans le forcer par @. */
function isCharacterCue(line: string): boolean {
  const base = cueBase(line);
  return (
    base !== '' &&
    isUpperCase(base) &&
    !HEADING_PATTERN.test(base) &&
    SPECIAL_STARTS.indexOf(line.charAt(0)) < 0
  );
}

/** Texte sans marques d'emphase (* et _), échappements retirés. */
function stripMarkup(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index++) {
    const char = value.charAt(index);
    const next = value.charAt(index + 1);
    if (char === '\\' && (next === '*' || next === '_')) {
      out += next;
      index++;
      continue;
    }
    if (char === '*' || char === '_') continue;
    out += char;
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// Export : scénario -> Fountain
// ---------------------------------------------------------------------------

const TAG_CODES: Record<string, number> = { b: 0, strong: 0, i: 1, em: 1, u: 2 };
const MARKERS = ['**', '*', '_'];

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
};

function decodeEntities(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole: string, code: string) => {
    if (code.charAt(0) === '#') {
      const hex = code.charAt(1) === 'x' || code.charAt(1) === 'X';
      const point = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, code) ? NAMED_ENTITIES[code] : whole;
  });
}

/** HTML en ligne d'un élément -> texte Fountain ('\n' pour un retour à la ligne). */
function htmlToFountain(html: string, emphasis: boolean): string {
  const tagPattern = /<(\/?)([A-Za-z0-9]+)[^>]*>/g;
  let out = '';
  let last = 0;

  const appendText = (raw: string): void => {
    let text = decodeEntities(raw);
    if (emphasis) text = text.replace(/\*/g, '\\*').replace(/_/g, '\\_');
    out += text;
  };

  let match: RegExpExecArray | null = tagPattern.exec(html);
  while (match !== null) {
    appendText(html.slice(last, match.index));
    last = tagPattern.lastIndex;
    const name = match[2].toLowerCase();
    if (name === 'br') {
      out += '\n';
    } else if (emphasis && Object.prototype.hasOwnProperty.call(TAG_CODES, name)) {
      out += String.fromCharCode((match[1] === '/' ? 0xe010 : 0xe000) + TAG_CODES[name]);
    }
    match = tagPattern.exec(html);
  }
  appendText(html.slice(last));

  // Les espaces restent hors des marques : "**mot** " et non "**mot **".
  let result = out
    .replace(/([\uE000-\uE002])([ \t\u00a0]+)/g, '$2$1')
    .replace(/([ \t\u00a0]+)([\uE010-\uE012])/g, '$2$1');

  let previous = '';
  while (previous !== result) {
    previous = result;
    result = result.replace(/\uE000\uE010|\uE001\uE011|\uE002\uE012/g, '');
  }

  return result.replace(/[\uE000-\uE002\uE010-\uE012]/g, (marker: string) => MARKERS[marker.charCodeAt(0) & 0x0f]);
}

/** Lignes d'un bloc, sans lignes vides en début et en fin. */
function cleanLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

/** Une ligne d'action qui serait lue autrement est forcée par "!". */
function needsForcedAction(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (SPECIAL_STARTS.indexOf(trimmed.charAt(0)) >= 0) return true;
  if (HEADING_PATTERN.test(trimmed)) return true;
  return isUpperCase(cueBase(trimmed));
}

function titleValues(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return cleanLines(value)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function titleField(key: string, values: string[]): string[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [key + ': ' + values[0]];
  return [key + ':'].concat(values.map((line) => '   ' + line));
}

function buildTitlePage(page: TitlePage | undefined, language: Language): string[] {
  if (!page || page.enabled !== true) return [];

  const authors = titleValues(page.authors);
  const result: string[] = titleField('Title', titleValues(page.title).slice(0, 1));

  if (authors.length > 0) {
    result.push('Credit: ' + (language === 'en' ? 'Written by' : '\u00c9crit par'));
    result.push(...titleField(authors.length > 1 ? 'Authors' : 'Author', authors));
  }

  result.push(...titleField('Source', titleValues(page.sourceNote)));
  result.push(...titleField('Draft date', titleValues(page.date)));
  result.push(...titleField('Version', titleValues(page.version)));
  result.push(...titleField('Contact', titleValues(page.contact)));
  return result;
}

/**
 * Scénario -> texte Fountain.
 * headingText : texte de l'en-tête d'une scène (calculé par l'interface).
 */
export function buildFountainText(
  screenplay: ScreenplayProjectData,
  headingText: (scene: ScreenplayScene) => string
): string {
  const language: Language = screenplay.settings.conventionLanguage === 'en' ? 'en' : 'fr';
  const upper = (value: string): string => value.toLocaleUpperCase(language);
  const out: string[] = buildTitlePage(screenplay.titlePage, language);

  screenplay.scenes.forEach((scene, index) => {
    let heading = upper(headingText(scene)).replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    if (heading === '') heading = (language === 'en' ? 'SCENE ' : 'SC\u00c8NE ') + String(index + 1);
    out.push('', '', HEADING_PATTERN.test(heading) ? heading : '.' + heading);

    const workingTitle =
      typeof scene.workingTitle === 'string' ? scene.workingTitle.replace(/\s+/g, ' ').trim() : '';
    if (workingTitle !== '') out.push('', '= ' + workingTitle);

    let inDialogue = false;

    for (const element of scene.elements) {
      const type = element.type;
      const lines = cleanLines(htmlToFountain(element.html, type === 'action' || type === 'dialogue'));
      if (lines.length === 0) continue;

      const single = lines
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join(' ');

      if (type === 'character') {
        const cue = upper(single);
        out.push('', isCharacterCue(cue) ? cue : '@' + cue);
        inDialogue = true;
        continue;
      }

      if (inDialogue && type === 'parenthetical') {
        let text = single;
        if (text.charAt(0) !== '(') text = '(' + text;
        if (text.charAt(text.length - 1) !== ')') text += ')';
        out.push(text);
        continue;
      }

      if (inDialogue && type === 'dialogue') {
        lines.forEach((line) => {
          out.push(line.trim() === '' ? '  ' : line);
        });
        continue;
      }

      inDialogue = false;

      if (type === 'transition') {
        const text = upper(single).replace(/^>\s*/, '');
        out.push('', isUpperCase(text) && /TO:$/.test(text) ? text : '> ' + text);
        continue;
      }

      const body = type === 'shot' ? lines.map((line) => upper(line)) : lines;
      out.push('');
      body.forEach((line, lineIndex) => {
        if (lineIndex === 0) {
          out.push(needsForcedAction(line) ? '!' + line : line);
        } else {
          out.push(line.trim() === '' ? '  ' : line);
        }
      });
    }
  });

  while (out.length > 0 && out[0] === '') out.shift();
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Import : Fountain -> scénario
// ---------------------------------------------------------------------------

const HIDDEN_MARK = '\u0001';
const ESCAPED_STAR = '\uE020';
const ESCAPED_UNDERSCORE = '\uE021';

const TITLE_KEYS = [
  'title', 'credit', 'author', 'authors', 'source', 'draft date', 'date',
  'contact', 'copyright', 'notes', 'revision', 'version'
];
const TITLE_LINE = /^([A-Za-z][A-Za-z ]*):(.*)$/;
const SCENE_NUMBER = /\s*#[^#]*#\s*$/;

const HEADING_PREFIXES: { pattern: RegExp; value: InteriorExterior }[] = [
  { pattern: /^(INT\.?\/EXT\.?|I\/E\.?)\s+/i, value: 'INT./EXT.' },
  { pattern: /^EXT\.?\/INT\.?\s+/i, value: 'EXT./INT.' },
  { pattern: /^INT\.?\s+/i, value: 'INT.' },
  { pattern: /^EXT\.?\s+/i, value: 'EXT.' }
];
const HEADING_SEPARATORS = [' \u2014 ', ' \u2013 ', ' - '];

const FRENCH_TIMES = ['JOUR', 'NUIT', 'SOIR', 'MATIN', 'AUBE', 'CRÉPUSCULE', 'AURORE', 'MIDI', 'TARD', 'CONTINU'];
const ENGLISH_TIMES = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'DUSK', 'DAWN', 'NOON', 'LATER', 'CONTINUOUS', 'SUNSET', 'SUNRISE'];
const FRENCH_WORDS = ['le', 'la', 'les', 'des', 'une', 'est', 'et', 'dans', 'pas', 'vous', 'elle', 'il', 'du', 'sur'];
const ENGLISH_WORDS = ['the', 'and', 'is', 'of', 'to', 'you', 'he', 'she', 'in', 'it', 'not', 'his', 'her', 'on'];

/** Retire notes [[...]] et commentaires ; une ligne devenue vide disparaôt. */
function removeHidden(text: string): string {
  const marked = text
    .replace(/\x2F\*[\s\S]*?\*\x2F/g, HIDDEN_MARK)
    .replace(/\x5B\x5B[\s\S]*?\x5D\x5D/g, HIDDEN_MARK);

  return marked
    .split('\n')
    .filter((line) => !(line.indexOf(HIDDEN_MARK) >= 0 && line.split(HIDDEN_MARK).join('').trim() === ''))
    .map((line) => line.split(HIDDEN_MARK).join(''))
    .join('\n');
}

/** Texte Fountain d'une ligne -> HTML (gras, italique, souligné). */
function inlineToHtml(text: string): string {
  let value = text.replace(/\\\*/g, ESCAPED_STAR).replace(/\\_/g, ESCAPED_UNDERSCORE);
  value = escapeHtml(value)
    .replace(/\*\*\*(?=\S)([^*\n]*?\S)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '<i>$1</i>')
    .replace(/_(?=\S)([^_\n]*?\S)_/g, '<u>$1</u>');
  return value.split(ESCAPED_STAR).join('*').split(ESCAPED_UNDERSCORE).join('_');
}

function linesToHtml(lines: string[]): string {
  return lines.map((line) => (line === '' ? '' : inlineToHtml(line))).join('<br>');
}

function isBlankLine(raw: string | undefined): boolean {
  return raw === undefined || (raw.trim() === '' && !/^ {2}$/.test(raw));
}

function freeHeading(text: string, createId: () => string): FreeScreenplayHeading {
  return { id: createId(), type: 'scene-heading', mode: 'free', html: escapeHtml(text) };
}

/** "INT. LIEU — MOMENT" donne un en-tête structuré, sinon un en-tête libre. */
function makeHeading(text: string, createId: () => string): SceneHeading {
  for (const prefix of HEADING_PREFIXES) {
    const match = prefix.pattern.exec(text);
    if (!match) continue;

    const rest = text.slice(match[0].length);
    for (const separator of HEADING_SEPARATORS) {
      const at = rest.lastIndexOf(separator);
      if (at <= 0) continue;
      const location = rest.slice(0, at).trim();
      const timeOfDay = rest.slice(at + separator.length).trim();
      if (location === '' || timeOfDay === '') break;
      const heading: StructuredScreenplayHeading = {
        id: createId(),
        type: 'scene-heading',
        mode: 'structured',
        interiorExterior: prefix.value,
        location,
        timeOfDay
      };
      return heading;
    }
    break;
  }
  return freeHeading(text, createId);
}

function guessLanguage(headings: string[], body: string): Language {
  let french = 0;
  let english = 0;

  for (const heading of headings) {
    for (const token of heading.toUpperCase().split(/[^A-Z0-9\u00C0-\u017F]+/)) {
      if (FRENCH_TIMES.indexOf(token) >= 0) french++;
      if (ENGLISH_TIMES.indexOf(token) >= 0) english++;
    }
  }
  if (french !== english) return french > english ? 'fr' : 'en';

  french = 0;
  english = 0;
  for (const word of body.slice(0, 200000).toLowerCase().split(/[^a-z\u00e0-\u017f]+/)) {
    if (FRENCH_WORDS.indexOf(word) >= 0) french++;
    if (ENGLISH_WORDS.indexOf(word) >= 0) english++;
  }
  return english > french ? 'en' : 'fr';
}

function readTitlePage(lines: string[]): { fields: Record<string, string[]>; next: number } | null {
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') index++;
  if (index >= lines.length) return null;

  const firstMatch = TITLE_LINE.exec(lines[index].trim());
  if (!firstMatch || TITLE_KEYS.indexOf(firstMatch[1].trim().toLowerCase()) < 0) return null;

  const fields: Record<string, string[]> = {};
  let current: string[] | null = null;

  while (index < lines.length && lines[index].trim() !== '') {
    const raw = lines[index];
    const trimmed = raw.trim();
    const match = /^\s/.test(raw) ? null : TITLE_LINE.exec(trimmed);

    if (match) {
      const key = match[1].trim().toLowerCase();
      const list: string[] = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : [];
      fields[key] = list;
      current = list;
      const value = match[2].trim();
      if (value !== '') list.push(value);
    } else if (current !== null) {
      current.push(trimmed);
    }
    index++;
  }

  return { fields, next: index };
}

/**
 * Texte Fountain -> page de titre et scènes.
 * createId : identifiant unique (sanitizeProjectData vérifie ensuite).
 */
export function parseFountain(source: string, createId: () => string): ParsedFountain {
  const text = removeHidden(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  const lines = text.split('\n').map((line) => line.replace(/\t/g, '    '));

  let title = '';
  let titlePage: TitlePage | null = null;
  const titleRead = readTitlePage(lines);

  if (titleRead !== null) {
    const fields = titleRead.fields;
    const get = (...keys: string[]): string[] => {
      const values: string[] = [];
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        for (const value of fields[key]) {
          const clean = stripMarkup(value);
          if (clean !== '') values.push(clean);
        }
      }
      return values;
    };

    title = get('title').join(' ');
    titlePage = {
      enabled: true,
      title,
      authors: get('author', 'authors').join('\n'),
      contact: get('contact').join('\n'),
      version: get('version', 'revision').join('\n'),
      date: get('draft date', 'date').join('\n'),
      sourceNote: get('source').join('\n')
    };
  }

  const start = titleRead !== null ? titleRead.next : 0;
  const scenes: ScreenplayScene[] = [];
  const headingTexts: string[] = [];
  const state: { scene: ScreenplayScene | null } = { scene: null };

  const openScene = (heading: SceneHeading): ScreenplayScene => {
    const scene: ScreenplayScene = { id: createId(), workingTitle: '', heading, elements: [] };
    scenes.push(scene);
    state.scene = scene;
    return scene;
  };

  const addElement = (type: ScreenplayElementType, html: string): void => {
    const scene = state.scene !== null ? state.scene : openScene(freeHeading('', createId));
    scene.elements.push({ id: createId(), type, html });
  };

  let index = start;
  while (index < lines.length) {
    const line = lines[index].trim();

    if (line === '') {
      index++;
      continue;
    }

    const next = index + 1 < lines.length ? lines[index + 1] : undefined;
    const nextBlank = isBlankLine(next);

    // Saut de page et section : ignorés.
    if (/^={3,}$/.test(line) || line.charAt(0) === '#') {
      index++;
      continue;
    }

    // Résumé : titre de travail de la scène s'il suit l'en-tête.
    if (line.charAt(0) === '=') {
      const scene = state.scene;
      if (scene !== null && scene.elements.length === 0 && !scene.workingTitle) {
        scene.workingTitle = stripMarkup(line.slice(1));
      }
      index++;
      continue;
    }

    const forcedHeading = line.length > 1 && line.charAt(0) === '.' && line.charAt(1) !== '.';
    if (forcedHeading || HEADING_PATTERN.test(line)) {
      const headingText = stripMarkup((forcedHeading ? line.slice(1) : line).replace(SCENE_NUMBER, ''))
        .replace(/\s+/g, ' ')
        .trim();
      headingTexts.push(headingText);
      openScene(makeHeading(headingText, createId));
      index++;
      continue;
    }

    // Texte centré : action.
    if (line.length > 1 && line.charAt(0) === '>' && line.charAt(line.length - 1) === '<') {
      addElement('action', inlineToHtml(line.slice(1, -1).trim()));
      index++;
      continue;
    }

    if (line.charAt(0) === '>' || (nextBlank && isUpperCase(line) && /TO:$/.test(line))) {
      addElement('transition', escapeHtml(stripMarkup(line.charAt(0) === '>' ? line.slice(1) : line)));
      index++;
      continue;
    }

    const forcedCharacter = line.charAt(0) === '@';
    if (!nextBlank && (forcedCharacter || isCharacterCue(line))) {
      const name = stripMarkup((forcedCharacter ? line.slice(1) : line).replace(/\s*\^\s*$/, ''));
      addElement('character', escapeHtml(name));
      index++;

      let speech: string[] = [];
      const flush = (): void => {
        if (speech.length > 0) {
          addElement('dialogue', linesToHtml(speech));
          speech = [];
        }
      };

      while (index < lines.length && !isBlankLine(lines[index])) {
        const part = lines[index].trim();
        if (part.length > 1 && part.charAt(0) === '(' && part.charAt(part.length - 1) === ')') {
          flush();
          addElement('parenthetical', escapeHtml(stripMarkup(part)));
        } else {
          speech.push(part);
        }
        index++;
      }
      flush();
      continue;
    }

    // Action : lignes jusqu'à la prochaine ligne vide.
    const paragraph: string[] = [];
    while (index < lines.length && !isBlankLine(lines[index])) {
      paragraph.push(lines[index].trim());
      index++;
    }
    if (paragraph.length > 0) {
      const first = paragraph[0];
      if (first.charAt(0) === '!' || first.charAt(0) === '~') paragraph[0] = first.slice(1).trim();
      addElement('action', linesToHtml(paragraph));
    }
  }

  return {
    title,
    language: guessLanguage(headingTexts, lines.slice(start).join('\n')),
    titlePage,
    scenes
  };
}
