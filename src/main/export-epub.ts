// src/main/export-epub.ts
// Document intermédiaire d'export -> livre numérique ePub 3 (.epub).
//
// Une archive ePub est un ZIP :
// - mimetype : en premier et non compressé ;
// - META-INF/container.xml : emplacement de content.opf ;
// - OEBPS/content.opf : métadonnées, liste des fichiers, ordre de lecture ;
// - OEBPS/nav.xhtml : table des matières ePub 3 ;
// - OEBPS/toc.ncx : table des matières des anciennes liseuses ;
// - OEBPS/style.css, couverture, page de titre, un fichier par chapitre
//   et les images.
//
// La police, la taille du texte et les marges ne sont pas imposées : le
// lecteur les choisit sur sa liseuse. Seuls le gras, l'italique et le
// souligné sont repris.

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import type { ExportBlock, ExportDocument, ExportRun } from '../shared/export-document';
import { hasTableOfContents } from '../shared/export-document';
import type { EpubExportOptions, EpubExportResult } from '../shared/types';
import { buildZip, type ZipEntry } from './zip-writer';
import { decodeImageDataUrl } from './export-images';

const EPUB_MIME_TYPE = 'application/epub+zip';
const XHTML_MEDIA_TYPE = 'application/xhtml+xml';

/** Taille maximale de l'image de couverture (30 Mo). */
const MAX_COVER_BYTES = 30 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

const CONTAINER_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
  '  <rootfiles>',
  '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
  '  </rootfiles>',
  '</container>',
  ''
].join('\n');

const STYLE_CSS = [
  'body { margin: 0; padding: 0; }',
  'p { margin: 0; text-indent: 1.5em; text-align: justify; line-height: 1.4; orphans: 2; widows: 2; }',
  'p.no-indent, p.empty, p.separator, p.image, p.align-center, p.align-right { text-indent: 0; }',
  'p.align-center { text-align: center; }',
  'p.align-right { text-align: right; }',
  'p.separator { text-align: center; margin: 1em 0; }',
  'p.image { text-align: center; margin: 1em 0; }',
  'p.image img { height: auto; }',
  'h1.chapter-title { text-align: center; font-size: 1.5em; font-weight: normal; margin: 2em 0 1.5em; page-break-after: avoid; }',
  '.title-page { text-align: center; }',
  'h1.book-title { text-align: center; font-size: 2em; margin: 30% 0 0.5em; }',
  'p.book-subtitle { text-align: center; text-indent: 0; font-size: 1.2em; font-style: italic; margin: 0 0 2em; }',
  'p.book-author { text-align: center; text-indent: 0; font-size: 1.2em; margin: 2em 0 0; }',
  '.cover { text-align: center; margin: 0; padding: 0; }',
  '.cover img { max-width: 100%; max-height: 100vh; height: auto; }',
  'h1.toc-title { text-align: center; font-size: 1.5em; font-weight: normal; margin: 2em 0 1em; }',
  'ol.toc { list-style-type: none; margin: 0; padding: 0; }',
  'ol.toc li { margin: 0.4em 0; }',
  'ol.toc a { text-decoration: none; }',
  ''
].join('\n');

interface EpubImage {
  id: string;
  href: string;
  data: Buffer;
  mediaType: string;
}

interface EpubCover {
  href: string;
  data: Buffer;
  mediaType: string;
}

interface EpubChapterFile {
  id: string;
  href: string;
  title: string;
  xhtml: string;
}

/** Options reçues du renderer : tout ce qui est invalide est remplacé. */
export function normalizeEpubExportOptions(value: unknown): EpubExportOptions {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const rawIdentifier = source.identifier;
  const rawCover = source.coverPath;

  const identifier =
    typeof rawIdentifier === 'string' && UUID_PATTERN.test(rawIdentifier)
      ? rawIdentifier.toLowerCase()
      : randomUUID();

  const coverPath =
    typeof rawCover === 'string' &&
    rawCover.length <= 4096 &&
    !/[\u0000-\u001F]/.test(rawCover)
      ? rawCover
      : '';

  return { identifier, coverPath };
}

/** Retire les caractères interdits en XML. */
function cleanXmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function escapeXml(value: string): string {
  return cleanXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function documentLanguage(doc: ExportDocument): string {
  const language = doc.language.trim();
  return LANGUAGE_PATTERN.test(language) ? language : 'fr';
}

function xhtmlPage(language: string, title: string, body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE html>',
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">`,
    '<head>',
    '  <meta charset="UTF-8"/>',
    `  <title>${escapeXml(title)}</title>`,
    '  <link rel="stylesheet" type="text/css" href="style.css"/>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function runToXhtml(run: ExportRun): string {
  if (run.text === '\n') return '<br/>';

  let html = escapeXml(run.text);
  if (html === '') return '';

  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;

  return html;
}

function blockToXhtml(block: ExportBlock, images: EpubImage[]): string {
  if (block.kind === 'image') {
    const image = decodeImageDataUrl(block.dataUrl);
    if (image === null) return '';

    const index = images.length + 1;
    const href = `images/image-${index}.${image.extension}`;
    images.push({ id: `image-${index}`, href, data: image.data, mediaType: image.mediaType });

    const width = Math.max(1, Math.min(30, block.widthCm));
    return `<p class="image"><img src="${href}" alt="" style="width:${width}cm;max-width:100%"/></p>`;
  }

  if (block.kind === 'empty') {
    return '<p class="empty">&#160;</p>';
  }

  if (block.kind === 'separator') {
    return `<p class="separator">${block.symbol ? escapeXml(block.symbol) : '&#160;'}</p>`;
  }

  const classes: string[] = [];
  if (block.noIndent) classes.push('no-indent');
  if (block.align) classes.push(`align-${block.align}`);
  const attr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  const content = block.runs.map(runToXhtml).join('');

  return `<p${attr}>${content === '' ? '&#160;' : content}</p>`;
}

/** Image de couverture : JPEG ou PNG reconnus à leurs premiers octets. */
function readCover(coverPath: string): EpubCover | null {
  if (coverPath === '') return null;

  try {
    const stat = fs.statSync(coverPath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_COVER_BYTES) return null;

    const data = fs.readFileSync(coverPath);

    if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      return { href: 'images/cover.png', data, mediaType: 'image/png' };
    }

    if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return { href: 'images/cover.jpg', data, mediaType: 'image/jpeg' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Couverture sous forme de data URL, pour la vignette et l'aperçu de la
 * fenêtre d'export. Mêmes règles que l'export (JPEG ou PNG, 30 Mo au plus) :
 * null si l'image est absente ou invalide.
 */
export function readCoverDataUrl(coverPath: string): string | null {
  const cover = readCover(coverPath);
  if (!cover) return null;

  return `data:${cover.mediaType};base64,${Buffer.from(cover.data).toString('base64')}`;
}

/** Date au format exigé par ePub : 2026-01-31T12:00:00Z. */
function modifiedDate(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

export async function generateExportEpub(
  filePath: string,
  doc: ExportDocument,
  options: EpubExportOptions
): Promise<EpubExportResult> {
  if (doc.chapters.length === 0) {
    throw new Error('Aucun chapitre à exporter.');
  }

  const language = documentLanguage(doc);
  const title = doc.title.trim() || 'Scriptorium';
  const subtitle = doc.subtitle.trim();
  const author = doc.author.trim();
  const tocLabel = doc.labels.tableOfContents.trim() || 'Contents';
  const identifier = `urn:uuid:${options.identifier}`;
  const modified = modifiedDate();

  const cover = readCover(options.coverPath);
  const coverMissing = options.coverPath !== '' && cover === null;

  // Chapitres (et portraits de la bible).
  const images: EpubImage[] = [];
  const chapters: EpubChapterFile[] = doc.chapters.map((chapter, index) => {
    const name = chapter.title.trim() || String(index + 1);
    const number = String(index + 1).padStart(3, '0');
    const blocks = chapter.blocks
      .map((block) => blockToXhtml(block, images))
      .filter((html) => html !== '');
    const body = [
      '<section class="chapter">',
      `<h1 class="chapter-title">${escapeXml(name)}</h1>`,
      ...blocks,
      '</section>'
    ].join('\n');

    return {
      id: `chapter-${number}`,
      href: `chapter-${number}.xhtml`,
      title: name,
      xhtml: xhtmlPage(language, name, body)
    };
  });

  const manifest: string[] = [
    `    <item id="nav" href="nav.xhtml" media-type="${XHTML_MEDIA_TYPE}" properties="nav"/>`,
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="style" href="style.css" media-type="text/css"/>'
  ];
  const spine: string[] = [];
  const pages: ZipEntry[] = [];
  const media: ZipEntry[] = [];

  // Couverture.
  if (cover !== null) {
    manifest.push(
      `    <item id="cover-image" href="${cover.href}" media-type="${cover.mediaType}" properties="cover-image"/>`
    );
    manifest.push(`    <item id="cover" href="cover.xhtml" media-type="${XHTML_MEDIA_TYPE}"/>`);
    spine.push('    <itemref idref="cover"/>');
    pages.push({
      name: 'OEBPS/cover.xhtml',
      data: xhtmlPage(
        language,
        title,
        `<section class="cover" epub:type="cover"><img src="${cover.href}" alt="${escapeXml(title)}"/></section>`
      )
    });
    media.push({ name: `OEBPS/${cover.href}`, data: cover.data, store: true });
  }

  // Page de titre.
  if (doc.titlePage) {
    const lines = [
      '<section class="title-page" epub:type="titlepage">',
      `<h1 class="book-title">${escapeXml(title)}</h1>`
    ];
    if (subtitle !== '') lines.push(`<p class="book-subtitle">${escapeXml(subtitle)}</p>`);
    if (author !== '') lines.push(`<p class="book-author">${escapeXml(author)}</p>`);
    lines.push('</section>');

    manifest.push(`    <item id="title-page" href="title.xhtml" media-type="${XHTML_MEDIA_TYPE}"/>`);
    spine.push('    <itemref idref="title-page"/>');
    pages.push({ name: 'OEBPS/title.xhtml', data: xhtmlPage(language, title, lines.join('\n')) });
  }

  // Table des matières visible dans le livre (toujours présente dans le menu de la liseuse).
  if (hasTableOfContents(doc)) {
    spine.push('    <itemref idref="nav"/>');
  }

  for (const chapter of chapters) {
    manifest.push(`    <item id="${chapter.id}" href="${chapter.href}" media-type="${XHTML_MEDIA_TYPE}"/>`);
    spine.push(`    <itemref idref="${chapter.id}"/>`);
    pages.push({ name: `OEBPS/${chapter.href}`, data: chapter.xhtml });
  }

  for (const image of images) {
    manifest.push(`    <item id="${image.id}" href="${image.href}" media-type="${image.mediaType}"/>`);
    media.push({ name: `OEBPS/${image.href}`, data: image.data, store: true });
  }

  const nav = xhtmlPage(
    language,
    tocLabel,
    [
      '<nav epub:type="toc" id="toc">',
      `<h1 class="toc-title">${escapeXml(tocLabel)}</h1>`,
      '<ol class="toc">',
      ...chapters.map(
        (chapter) => `<li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`
      ),
      '</ol>',
      '</nav>'
    ].join('\n')
  );

  const ncx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${language}">`,
    '  <head>',
    `    <meta name="dtb:uid" content="${identifier}"/>`,
    '    <meta name="dtb:depth" content="1"/>',
    '    <meta name="dtb:totalPageCount" content="0"/>',
    '    <meta name="dtb:maxPageNumber" content="0"/>',
    '  </head>',
    `  <docTitle><text>${escapeXml(title)}</text></docTitle>`,
    '  <navMap>',
    ...chapters.map(
      (chapter, index) =>
        `    <navPoint id="nav-${index + 1}" playOrder="${index + 1}"><navLabel><text>${escapeXml(chapter.title)}</text></navLabel><content src="${chapter.href}"/></navPoint>`
    ),
    '  </navMap>',
    '</ncx>',
    ''
  ].join('\n');

  const metadata: string[] = [
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `    <dc:identifier id="book-id">${identifier}</dc:identifier>`,
    `    <dc:title>${escapeXml(title)}</dc:title>`,
    `    <dc:language>${language}</dc:language>`
  ];
  if (author !== '') metadata.push(`    <dc:creator>${escapeXml(author)}</dc:creator>`);
  metadata.push(`    <dc:date>${modified.slice(0, 10)}</dc:date>`);
  metadata.push(`    <meta property="dcterms:modified">${modified}</meta>`);
  if (cover !== null) metadata.push('    <meta name="cover" content="cover-image"/>');
  metadata.push('  </metadata>');

  const opf = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}">`,
    ...metadata,
    '  <manifest>',
    ...manifest,
    '  </manifest>',
    '  <spine toc="ncx">',
    ...spine,
    '  </spine>',
    '</package>',
    ''
  ].join('\n');

  const entries: ZipEntry[] = [
    { name: 'mimetype', data: EPUB_MIME_TYPE, store: true },
    { name: 'META-INF/container.xml', data: CONTAINER_XML },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/toc.ncx', data: ncx },
    { name: 'OEBPS/style.css', data: STYLE_CSS },
    ...pages,
    ...media
  ];

  await fs.promises.writeFile(filePath, buildZip(entries));

  return { coverMissing };
}
