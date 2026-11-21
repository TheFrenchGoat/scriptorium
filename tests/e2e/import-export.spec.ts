// tests/e2e/import-export.spec.ts
// Lot 4 : import et export. Les fenetres systeme (Enregistrer sous, Ouvrir)
// sont remplacees dans le processus principal ; tous les fichiers d'essai
// sont crees dans un dossier temporaire, supprime a la fin de chaque test.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { launchApp } from './app';
import { novelConfig, openProject } from './projet';

type Launched = Awaited<ReturnType<typeof launchApp>>;
type AppPage = Launched['page'];

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const NBSP = String.fromCharCode(160);
const WHATS_NEW_KEY = 'scriptorium.whatsNew.lastSeenVersion';
/** Un separateur de scene, quel que soit son symbole. */
const SEP = '[separateur]';

const ONE = [
  'Le vent soufflait sur la lande.',
  'Marc avancait sans se retourner.',
  '***',
  'Le lendemain, la pluie tomba.'
];
const TWO = ['La ville apparut au loin.', 'Personne ne vint a sa rencontre.'];
const SENTENCES = ONE.filter((text) => text !== '***').concat(TWO);
const [S0, S1, S2, S3, S4] = SENTENCES;

/** Chapitres attendus apres un import. */
const EXPECTED_CHAPTERS: Record<string, string[]> = {
  'Chapitre 1': ONE.map(normalizeSeparator),
  'Chapitre 2': TWO.map(normalizeSeparator)
};

/** Position de chaque format dans la liste de la fenetre d'export. */
const FORMATS = {
  pdf: { index: 0, label: 'PDF (.pdf)' },
  docx: { index: 1, label: 'Word (.docx)' },
  odt: { index: 2, label: 'OpenDocument (.odt)' },
  epub: { index: 3, label: 'ePub (.epub)' },
  txt: { index: 4, label: 'Texte brut (.txt)' },
  md: { index: 5, label: 'Markdown (.md)' }
};
type FormatKey = keyof typeof FORMATS;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function normalizeSeparator(text: string): string {
  return text.length > 0 && text.length <= 12 && !/[a-z0-9]/i.test(text) ? SEP : text;
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scriptorium-e2e-io-'));
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function paragraphsHtml(list: readonly string[]): string {
  return list.map((text) => '<p>' + text + '</p>').join('');
}

/** Roman de deux chapitres, avec des reglages d'export simples et previsibles. */
function ioConfig(name: string): Record<string, unknown> {
  return {
    language: 'fr',
    theme: 'dark',
    currentProject: null,
    nativeSpellcheckEnabled: false,
    projects: {
      [name]: {
 projectType: 'novel',
        chapters: { 'Chapitre 1': paragraphsHtml(ONE), 'Chapitre 2': paragraphsHtml(TWO) },
        world: {},
        wbFolders: [],
 wbRelationTypes: [],
        wbRelations: [],
 wbTimeline: [],
        writingSessions: [],
 goals: [],
        exportSettings: {
   format: 'txt',
          template: 'manuscript',
          titlePage: { enabled: false },
          runningHeader: false,
   content: {
            tableOfContents: false,
     sceneSeparators: true,
     sceneSeparator: 'spaced-stars',
     fixTypography: false
   }
        }
      }
    },
    uiState: {
      [name]: {
        openTabs: [{ name: 'Chapitre 1', type: 'chapter' }],
        activeTab: 'Chapitre 1',
        activeType: 'chapter'
      }
    }
  };
}

function stripTags(html: string): string {
  let text = '';
  let inside = false;
  for (const ch of html) {
    if (ch === '<') inside = true;
    else if (ch === '>') inside = false;
    else if (!inside) text += ch;
  }
  return text
    .split('&nbsp;').join(' ')
    .split(NBSP).join(' ')
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&quot;').join('"')
    .split('&amp;').join('&')
    .trim();
}

const BLOCK_ENDS = ['</div>', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>', '</li>', '</blockquote>'];

/** Texte de chaque bloc non vide d'un chapitre enregistre. */
function blockTexts(html: string): string[] {
  let unified = html;
  for (const end of BLOCK_ENDS) unified = unified.split(end).join('</p>');
  return unified.split('</p>').map(stripTags).filter((text) => text !== '').map(normalizeSeparator);
}

/** Chapitres d'un projet dans les donnees relues sur le disque. */
function storedChapters(data: unknown, name: string): Record<string, string[]> {
  const root = (data ?? {}) as { projects?: Record<string, { chapters?: Record<string, unknown> } | undefined> };
  const project = root.projects ? root.projects[name] : undefined;
  if (!project || !project.chapters) throw new Error('Projet absent des donnees enregistrees : ' + name);
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(project.chapters)) {
    const html = project.chapters[key];
    result[key] = typeof html === 'string' ? blockTexts(html) : ['(contenu non textuel)'];
  }
  return result;
}

/** Lignes d'un fichier texte ; un separateur devient SEP. */
function textLines(raw: string): string[] {
  return raw.split(CRLF).join(LF).split(LF).map((line) => (line === '' ? line : normalizeSeparator(line)));
}

/** Lit une archive ZIP (docx, odt, epub) : nom -> contenu decompresse. */
function readZip(file: string): Map<string, Buffer> {
  const data = fs.readFileSync(file);
  const entries = new Map<string, Buffer>();
  let end = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Archive ZIP illisible : ' + file);
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error('Repertoire ZIP invalide : ' + file);
    const method = data.readUInt16LE(offset + 10);
    const size = data.readUInt32LE(offset + 20);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const local = data.readUInt32LE(offset + 42);
    const name = data.toString('utf8', offset + 46, offset + 46 + nameLength);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const raw = data.subarray(start, start + size);
    entries.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryText(entries: Map<string, Buffer>, name: string): string {
  const content = entries.get(name);
  if (!content) {
    throw new Error('Fichier ' + name + ' absent de l archive (contenu : ' + Array.from(entries.keys()).join(', ') + ')');
  }
  return content.toString('utf8');
}

/** Attend le message d'information, le ferme (Echap) et renvoie son texte. */
async function readInfo(page: AppPage): Promise<string> {
  const info = page.locator('#infoModalMessage');
  await expect(info).toBeVisible({ timeout: 120000 });
  const message = (await info.textContent()) || '';
  await page.keyboard.press('Escape');
  await expect(info).toBeHidden();
  return message;
}

/** Ecran d'accueil pret, sans la fenetre Nouveautes. */
async function readyHome(page: AppPage): Promise<void> {
  const button = page.locator('#btnImportProject');
  await expect(button).toBeVisible({ timeout: 30000 });
  await page.evaluate((key) => window.localStorage.setItem(key, '999.0.0'), WHATS_NEW_KEY);
  await page.reload();
  await expect(button).toBeVisible({ timeout: 30000 });
}

/** Exporte le projet ouvert par la fenetre d'export, vers le fichier indique. */
async function exportTo(launched: Launched, format: FormatKey, target: string): Promise<void> {
  await launched.app.evaluate(({ dialog }, filePath) => {
    const replaced = dialog as unknown as Record<string, unknown>;
    replaced.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  const page = launched.page;
  await page.locator('#btnExportMenu').click();
  await page.locator('.dropdown-menu').getByText('Exporter le document').click();
  const panel = page.locator('.export-modal');
  await expect(panel).toBeVisible();
  const choice = FORMATS[format];
  const select = panel.locator('[aria-label="Format de fichier"]').first();
  await select.click();
  await page.keyboard.press('Home');
  for (let step = 0; step < choice.index; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toContainText(choice.label);
  await page.locator('.export-confirm').click();
  const message = await readInfo(page);
  expect(message, 'message apres export ' + format).not.toMatch(/rreur|rror|chec/i);
  expect(fs.existsSync(target), 'fichier ' + format + ' cree').toBe(true);
  expect(fs.statSync(target).size, 'fichier ' + format + ' non vide').toBeGreaterThan(0);
}

/** Importe un fichier depuis l'accueil ; renvoie le nombre de chapitres de l'apercu. */
async function importFile(launched: Launched, file: string, projectName: string): Promise<number> {
  await launched.app.evaluate(({ dialog }, filePath) => {
    const replaced = dialog as unknown as Record<string, unknown>;
    replaced.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, file);
  const page = launched.page;
  await page.locator('#btnImportProject').click();
  const preview = page.locator('.import-preview');
  await expect(preview).toBeVisible({ timeout: 30000 });
  const chapterCount = await preview.locator('.import-preview-list input[type="checkbox"]').count();
  await preview.locator('.import-preview-name input').fill(projectName);
  await page.locator('button.btn-primary').filter({ hasText: 'Importer' }).click();
  const message = await readInfo(page);
  expect(message, 'message apres import').toContain(projectName);
  await expect(page.locator('#projectsList [role="button"][aria-label="' + projectName + '"]')).toBeVisible();
  return chapterCount;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('export TXT et Markdown : titres, paragraphes, ordre et separateur', async () => {
  test.setTimeout(180000);
  const dir = makeTempDir();
  const launched = await launchApp(ioConfig('Essai export'));
  try {
    await openProject(launched.page, 'Essai export');

    const txtFile = path.join(dir, 'essai.txt');
    await exportTo(launched, 'txt', txtFile);
    const raw = fs.readFileSync(txtFile, 'utf8');
    expect(raw.includes(CRLF), 'fins de ligne Windows').toBe(true);
    expect(textLines(raw)).toEqual([
      'Chapitre 1', '', S0, S1, '', SEP, '', S2,
      '', '', '',
      'Chapitre 2', '', S3, S4, ''
    ]);

    const mdFile = path.join(dir, 'essai.md');
    await exportTo(launched, 'md', mdFile);
    const markdown = fs.readFileSync(mdFile, 'utf8');
    expect(markdown.includes('***'), 'separateur d origine remplace').toBe(false);
    expect(markdown.split(CRLF).join(LF).split(LF).filter((line) => line !== '')).toEqual([
      '# Chapitre 1', S0, S1, '* * *', S2,
      '# Chapitre 2', S3, S4
    ]);
  } finally {
    await launched.close();
    removeDir(dir);
  }
});

test('export DOCX, ODT, EPUB et PDF : fichiers valides et texte present', async () => {
  test.setTimeout(240000);
  const dir = makeTempDir();
  const launched = await launchApp(ioConfig('Essai formats'));
  try {
    await openProject(launched.page, 'Essai formats');

    const docxFile = path.join(dir, 'essai.docx');
    await exportTo(launched, 'docx', docxFile);
    expect(fs.readFileSync(docxFile).subarray(0, 2).toString('latin1')).toBe('PK');
    const documentXml = entryText(readZip(docxFile), 'word/document.xml');
    for (const sentence of SENTENCES) expect(documentXml, 'texte Word').toContain(sentence);
    expect(documentXml.indexOf(S0)).toBeLessThan(documentXml.indexOf(S3));

    const odtFile = path.join(dir, 'essai.odt');
    await exportTo(launched, 'odt', odtFile);
    const odtEntries = readZip(odtFile);
    expect(entryText(odtEntries, 'mimetype')).toBe('application/vnd.oasis.opendocument.text');
    const contentXml = entryText(odtEntries, 'content.xml');
    for (const sentence of SENTENCES) expect(contentXml, 'texte ODT').toContain(sentence);
    expect(contentXml.indexOf(S0)).toBeLessThan(contentXml.indexOf(S3));

    const epubFile = path.join(dir, 'essai.epub');
    await exportTo(launched, 'epub', epubFile);
    const epubEntries = readZip(epubFile);
    expect(Array.from(epubEntries.keys())[0]).toBe('mimetype');
    expect(entryText(epubEntries, 'mimetype')).toBe('application/epub+zip');
    expect(epubEntries.has('META-INF/container.xml')).toBe(true);
    let pages = '';
    for (const [name, content] of epubEntries) {
      if (name.endsWith('.xhtml') || name.endsWith('.html')) pages += content.toString('utf8');
    }
    for (const sentence of SENTENCES) expect(pages, 'texte ePub').toContain(sentence);

    const pdfFile = path.join(dir, 'essai.pdf');
    await exportTo(launched, 'pdf', pdfFile);
    const pdf = fs.readFileSync(pdfFile);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(Math.max(0, pdf.length - 1024)).toString('latin1')).toContain('%%EOF');
  } finally {
    await launched.close();
    removeDir(dir);
  }
});

test('import TXT et Markdown a deux chapitres : chapitres, paragraphes et separateur', async () => {
  test.setTimeout(180000);
  const dir = makeTempDir();
  const txtFile = path.join(dir, 'roman.txt');
  fs.writeFileSync(
    txtFile,
    ['Chapitre 1', '', S0, S1, '', '***', '', S2, '', '', '', 'Chapitre 2', '', S3, S4, ''].join(CRLF),
    'utf8'
  );
  const mdFile = path.join(dir, 'roman.md');
  fs.writeFileSync(
    mdFile,
    ['# Chapitre 1', S0, S1, '* * *', S2, '# Chapitre 2', S3, S4].join(LF + LF) + LF,
    'utf8'
  );
  const launched = await launchApp(novelConfig('Existant', 'Chapitre 1', ['Texte existant.']));
  let closed = false;
  try {
    await readyHome(launched.page);
    expect(await importFile(launched, txtFile, 'Import TXT'), 'chapitres TXT dans l apercu').toBe(2);
    expect(await importFile(launched, mdFile, 'Import MD'), 'chapitres MD dans l apercu').toBe(2);

    const data = (await launched.closeAndRead()) as unknown;
    closed = true;
    for (const name of ['Import TXT', 'Import MD']) {
      const chapters = storedChapters(data, name);
      expect(Object.keys(chapters), name).toEqual(['Chapitre 1', 'Chapitre 2']);
      expect(chapters, name).toEqual(EXPECTED_CHAPTERS);
    }
    expect(storedChapters(data, 'Existant')).toEqual({ 'Chapitre 1': ['Texte existant.'] });
  } finally {
    if (!closed) await launched.close();
    removeDir(dir);
  }
});

test('aller-retour : export TXT puis import du meme fichier', async () => {
  test.setTimeout(180000);
  const dir = makeTempDir();
  const file = path.join(dir, 'aller-retour.txt');
  try {
    const first = await launchApp(ioConfig('Aller'));
    try {
      await openProject(first.page, 'Aller');
      await exportTo(first, 'txt', file);
    } finally {
      await first.close();
    }

    const second = await launchApp(novelConfig('Existant', 'Chapitre 1', ['Texte existant.']));
    let closed = false;
    try {
      await readyHome(second.page);
      expect(await importFile(second, file, 'Retour'), 'chapitres dans l apercu').toBe(2);
      const data = (await second.closeAndRead()) as unknown;
      closed = true;
      const chapters = storedChapters(data, 'Retour');
      expect(Object.keys(chapters)).toEqual(['Chapitre 1', 'Chapitre 2']);
      expect(chapters).toEqual(EXPECTED_CHAPTERS);
    } finally {
      if (!closed) await second.close();
    }
  } finally {
    removeDir(dir);
  }
});
