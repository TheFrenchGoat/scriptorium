// src/renderer/lib/screenplay-print.ts
//
// Texte brut et impression des projets de scénario.
// Ces fonctions étaient auparavant dans useEditorController.ts.
// Le rendu d'impression est identique à l'ancienne version, à une exception près :
// « Écrit par » devient « Written by » quand la convention du scénario est anglaise.

import { getLanguage } from '../i18n';
import {
  getSceneDisplayTitle,
  getSceneHeadingText,
  screenplayHtmlToPlainText,
} from './screenplay';
import type { ProjectData } from '../../shared/types';

/** Le contenu « scénario » d'un projet : scènes, réglages, page de titre. */
export type ScreenplayDocument = NonNullable<ProjectData['screenplay']>;

type ScreenplayScene = ScreenplayDocument['scenes'][number];

// ---------------------------------------------------------------------------
// Texte brut
// ---------------------------------------------------------------------------

/** Texte brut d'un élément de scène, sans espaces superflus autour. */
function elementPlainText(html: string): string {
  return screenplayHtmlToPlainText(html).trim();
}

/** Corps d'une scène : le texte de chaque élément non vide, joint par le séparateur donné. */
function sceneBodyText(scene: ScreenplayScene, separator: string): string {
  return scene.elements
    .map((element) => elementPlainText(element.html))
    .filter(Boolean)
    .join(separator);
}

/** Texte d'une scène (en-tête puis corps), utilisé pour les statistiques. */
export function getScenePlainText(screenplay: ScreenplayDocument, sceneId: string): string {
  const scene = screenplay.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return '';
  const heading = getSceneHeadingText(scene, screenplay.settings.conventionLanguage);
  return [heading, sceneBodyText(scene, '\n')].filter(Boolean).join('\n\n');
}

/** Texte complet du scénario, pour les exports TXT et Markdown. */
export function buildScreenplayPlainText(
  screenplay: ScreenplayDocument,
  includeWorkingTitles = false,
): string {
  const lang = getLanguage();
  const conventionLanguage = screenplay.settings.conventionLanguage;
  return screenplay.scenes
    .map((scene, index) => {
      const title = includeWorkingTitles ? getSceneDisplayTitle(scene, index, lang) : '';
      const heading = getSceneHeadingText(scene, conventionLanguage);
      const body = sceneBodyText(scene, '\n\n');
      return [title, heading, body].filter(Boolean).join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n\n');
}

// ---------------------------------------------------------------------------
// Impression (PDF)
// ---------------------------------------------------------------------------

function escapePlainTextForHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lit un champ de la page de titre (texte ou liste de lignes), nettoyé. */
function titlePageText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function buildTitlePageHtml(projectName: string, screenplay: ScreenplayDocument): string {
  const page = screenplay.titlePage;
  if (!page?.enabled) return '';

  const isEnglish = String(screenplay.settings.conventionLanguage)
    .toLowerCase()
    .startsWith('en');
  const title = titlePageText(page.title) || projectName;
  const authors = titlePageText(page.authors);
  const source = titlePageText(page.sourceNote);
  const contact = titlePageText(page.contact);
  const versionBlock = [titlePageText(page.version), titlePageText(page.date)]
    .filter(Boolean)
    .join('\n');

  const main = [
    `<div class="title">${escapePlainTextForHtml(title)}</div>`,
    authors
      ? `<div>${isEnglish ? 'Written by' : 'Écrit par'}</div><div class="authors">${escapePlainTextForHtml(authors)}</div>`
      : '',
    source ? `<div class="source">${escapePlainTextForHtml(source)}</div>` : '',
  ].join('');

  return [
    '<section class="title-page">',
    `<div class="title-main">${main}</div>`,
    contact ? `<div class="contact">${escapePlainTextForHtml(contact)}</div>` : '',
    versionBlock ? `<div class="version">${escapePlainTextForHtml(versionBlock)}</div>` : '',
    '</section>',
  ].join('');
}

function buildScenesHtml(screenplay: ScreenplayDocument): string {
  const { settings } = screenplay;
  return screenplay.scenes
    .map((scene, index) => {
      const number = settings.showSceneNumbersInExport
        ? `<span class="scene-number">${index + 1}</span>`
        : '';
      const heading = escapePlainTextForHtml(
        getSceneHeadingText(scene, settings.conventionLanguage),
      );
      const elements = scene.elements
        .map((element) => {
          const text = screenplayHtmlToPlainText(element.html);
          if (!text.trim()) return '';
          const className = escapePlainTextForHtml(String(element.type));
          const body = escapePlainTextForHtml(text).replace(/\n/g, '<br>');
          return `<div class="element ${className}">${body}</div>`;
        })
        .join('');
      return `<section class="scene"><div class="heading">${number}${heading}</div>${elements}</section>`;
    })
    .join('');
}

/** Document HTML complet, prêt à être imprimé en PDF. */
export function buildBasicScreenplayPrintHtml(
  projectName: string,
  screenplay: ScreenplayDocument,
): string {
  const { settings } = screenplay;
  const pageSize = settings.pageFormat === 'letter' ? 'Letter' : 'A4';
  const headingWeight = settings.boldSceneHeadings ? ' font-weight: bold;' : '';
  const lang = escapePlainTextForHtml(String(settings.conventionLanguage));

  const css = `
@page { size: ${pageSize}; margin: 25.4mm 20mm 25.4mm 38mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; background: #fff; }
body { font-family: "Courier Prime", "Courier New", Courier, monospace; font-size: 12pt; line-height: 1.2; }
.title-page { position: relative; width: 100%; height: 100vh; break-after: page; page-break-after: always; }
.title-main { position: absolute; top: 38%; left: 10%; right: 10%; text-align: center; }
.title { margin-bottom: 24pt; text-transform: uppercase; }
.authors, .source { margin-top: 12pt; white-space: pre-wrap; }
.contact { position: absolute; bottom: 0; left: 0; max-width: 45%; white-space: pre-wrap; }
.version { position: absolute; right: 0; bottom: 0; max-width: 45%; text-align: right; white-space: pre-wrap; }
.scene { margin: 0; padding: 0; }
.heading { position: relative; margin: 12pt 0; text-transform: uppercase; break-after: avoid; page-break-after: avoid;${headingWeight} }
.scene-number { position: absolute; right: calc(100% + 12pt); }
.element { min-height: 12pt; margin: 0; white-space: pre-wrap; overflow-wrap: break-word; }
.action { width: 100%; margin-bottom: 12pt; text-align: left; }
.character { width: 42%; margin-top: 12pt; margin-left: 38%; text-align: left; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
.parenthetical { width: 48%; margin-left: 28%; text-align: left; break-after: avoid; page-break-after: avoid; }
.dialogue { width: 58%; margin-left: 20%; margin-bottom: 12pt; text-align: left; }
.transition { width: 54%; margin: 12pt 0 12pt auto; text-align: right; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
.shot { width: 100%; margin: 12pt 0; text-align: left; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<style>${css}</style>
</head>
<body>${buildTitlePageHtml(projectName, screenplay)}${buildScenesHtml(screenplay)}</body>
</html>`;
}
