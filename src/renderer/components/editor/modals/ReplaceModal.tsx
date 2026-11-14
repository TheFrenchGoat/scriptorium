// src/renderer/components/editor/modals/ReplaceModal.tsx
// Fenetre "Rechercher / Remplacer" (bouton de la barre d'outils, Ctrl+F).
// Trois onglets :
// - Rechercher / Remplacer : remplacement dans le chapitre ou tout le projet ;
// - Remplacements automatiques : liste propre au livre (mot tape -> texte),
//   appliquee pendant la frappe (voir lib/auto-replace.ts) ;
// - Typographie : reglages du livre, analyse du chapitre ou du livre,
//   corrections une a une ou en une fois (voir controller/typography-actions.ts).
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import type { EditorController } from '../useEditorController';
import { isAutoReplaceWord, type AutoReplaceRule } from '../../../lib/auto-replace';
import type { ReplaceMatchInfo } from '../../../lib/dom';
import {
  TYPO_CATEGORIES,
  TYPO_REPORT_ONLY,
  type TypoCategory,
  type TypoDialogueStyle,
  type TypoLanguage,
  type TypoSpacing
} from '../../../../shared/typography';
import type { TypoProjectSettings } from '../../../../shared/typography-project';
import type { TranslationKey } from '../../../i18n/dict';
import type { TypoReport, TypoReportItem } from '../controller/types';

export interface ReplaceModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

type ReplaceTab = 'search' | 'auto' | 'typo';
type TypoLanguageChoice = TypoLanguage | 'auto';

const ARROW = String.fromCharCode(0x2192);
const CROSS = String.fromCharCode(0x2715);
const ELLIPSIS = String.fromCharCode(0x2026);
const NBSP = String.fromCharCode(0x00a0);
const NNBSP = String.fromCharCode(0x202f);
const THIN_SPACE = String.fromCharCode(0x2009);

// Options de recherche : gardees d'une fois sur l'autre.
const WHOLE_WORD_KEY = 'scriptorium.replaceWholeWord';
const MATCH_CASE_KEY = 'scriptorium.replaceMatchCase';
// Regles typographiques cochees : gardees d'une fois sur l'autre.
const TYPO_CATEGORIES_KEY = 'scriptorium.typoCategories';
/** Cas affiches par categorie (puis par paquets de cette taille). */
const TYPO_GROUP_STEP = 100;
/** Caracteres de contexte de part et d'autre d'un cas. */
const TYPO_EXCERPT = 40;
/** Tentatives pour montrer un cas apres l'ouverture du chapitre. */
const TYPO_REVEAL_TRIES = 12;
const TYPO_REVEAL_DELAY = 80;

const TYPO_CATEGORY_LABELS: Record<TypoCategory, TranslationKey> = {
  apostrophes: 'typoCatApostrophes',
  quotes: 'typoCatQuotes',
  punctuation: 'typoCatPunctuation',
  spaces: 'typoCatSpaces',
  ellipsis: 'typoCatEllipsis',
  dashes: 'typoCatDashes',
  numbers: 'typoCatNumbers',
  digits: 'typoCatDigits',
  dialogue: 'typoCatDialogue'
};

const TYPO_LANGUAGES: { value: TypoLanguageChoice; label: TranslationKey; hint: TranslationKey | null }[] = [
  { value: 'auto', label: 'typoLanguageAuto', hint: 'typoLanguageAutoHint' },
  { value: 'fr', label: 'typoLanguageFr', hint: null },
  { value: 'en', label: 'typoLanguageEn', hint: null }
];

const TYPO_SPACINGS: { value: TypoSpacing; label: TranslationKey; hint: TranslationKey }[] = [
  { value: 'standard', label: 'typoSpacingStandard', hint: 'typoSpacingStandardHint' },
  { value: 'thin', label: 'typoSpacingThin', hint: 'typoSpacingThinHint' },
  { value: 'quebec', label: 'typoSpacingQuebec', hint: 'typoSpacingQuebecHint' }
];

const TYPO_DIALOGUES: { value: TypoDialogueStyle; label: TranslationKey }[] = [
  { value: 'any', label: 'typoDialogueAny' },
  { value: 'quotes', label: 'typoDialogueQuotes' },
  { value: 'dash', label: 'typoDialogueDash' }
];

interface TypoPiece {
  text: string;
  space: TranslationKey | null;
}

interface TypoGroup {
  category: TypoCategory;
  items: TypoReportItem[];
  total: number;
}

function readOption(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function saveOption(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Stockage indisponible : l'option vaut pour cette fois seulement.
  }
}

function readTypoCategories(): TypoCategory[] {
  try {
    const raw = window.localStorage.getItem(TYPO_CATEGORIES_KEY);
    if (raw === null) return TYPO_CATEGORIES.slice();
    const wanted = raw.split(',');
    return TYPO_CATEGORIES.filter((category) => wanted.includes(category));
  } catch {
    return TYPO_CATEGORIES.slice();
  }
}

function saveTypoCategories(list: readonly TypoCategory[]): void {
  try {
    window.localStorage.setItem(TYPO_CATEGORIES_KEY, list.join(','));
  } catch {
    // Stockage indisponible : le choix vaut pour cette fois seulement.
  }
}

/** Decoupe un texte pour rendre visibles les espaces (normales, insecables, fines). */
function typoPieces(text: string): TypoPiece[] {
  const result: TypoPiece[] = [];
  let plain = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    let space: TranslationKey | null = null;
    if (char === ' ') space = 'typoSpaceNormal';
    else if (char === NBSP) space = 'typoSpaceNbsp';
    else if (char === NNBSP || char === THIN_SPACE) space = 'typoSpaceThin';
    if (space === null) {
      plain += char;
      continue;
    }
    if (plain) result.push({ text: plain, space: null });
    plain = '';
    result.push({ text: char, space });
  }
  if (plain) result.push({ text: plain, space: null });
  return result;
}

function isBlankRule(rule: AutoReplaceRule): boolean {
  return rule.from.trim() === '' && rule.to.trim() === '';
}

export function ReplaceModal({ open, controller, onClose }: ReplaceModalProps): React.ReactElement {
  const { t } = useI18n();
  const [tab, setTab] = useState<ReplaceTab>('search');
  const [findStr, setFindStr] = useState('');
  const [repStr, setRepStr] = useState('');
  const [wholeProject, setWholeProject] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [rules, setRules] = useState<AutoReplaceRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [wholeWord, setWholeWord] = useState<boolean>(() => readOption(WHOLE_WORD_KEY, false));
  const [matchCase, setMatchCase] = useState<boolean>(() => readOption(MATCH_CASE_KEY, true));
  const [matchInfo, setMatchInfo] = useState<ReplaceMatchInfo | null>(null);

  // Typographie
  const [typoSettings, setTypoSettings] = useState<TypoProjectSettings | null>(null);
  const [typoLanguage, setTypoLanguage] = useState<TypoLanguage>('fr');
  const [typoWhole, setTypoWhole] = useState(false);
  const [typoCategories, setTypoCategories] = useState<TypoCategory[]>(() => readTypoCategories());
  const [typoReport, setTypoReport] = useState<TypoReport | null>(null);
  const [typoMessage, setTypoMessage] = useState('');
  const [typoShown, setTypoShown] = useState<Partial<Record<TypoCategory, number>>>({});
  const [restoreArmed, setRestoreArmed] = useState(false);

  const loadTypography = () => {
    try {
      setTypoSettings(controller.getTypography());
      setTypoLanguage(controller.getTypographyLanguage());
    } catch {
      setTypoSettings(null);
    }
  };

  const analyzeTypo = (whole: boolean = typoWhole, categories: readonly TypoCategory[] = typoCategories) => {
    setTypoShown({});
    try {
      setTypoReport(controller.analyzeTypography(whole, categories));
    } catch {
      setTypoReport(null);
      setTypoMessage(t('typoError'));
    }
  };

  const runTypoAnalysis = () => {
    setTypoMessage('');
    setRestoreArmed(false);
    analyzeTypo();
  };

  const updateTypography = (patch: {
    language?: TypoLanguageChoice;
    spacing?: TypoSpacing;
    dialogueStyle?: TypoDialogueStyle;
  }) => {
    setRestoreArmed(false);
    try {
      const current = typoSettings ?? controller.getTypography();
      const language: TypoLanguageChoice =
        patch.language !== undefined ? patch.language : current.language ?? 'auto';
      const next: TypoProjectSettings = {
 spacing: patch.spacing ?? current.spacing,
        dialogueStyle: patch.dialogueStyle ?? current.dialogueStyle,
        ignored: current.ignored
      };
      if (language !== 'auto') next.language = language;
      controller.setTypography(next);
    } catch {
      setTypoMessage(t('typoError'));
    }
    loadTypography();
    if (typoReport) analyzeTypo();
  };

  const chooseTypoScope = (whole: boolean) => {
    setTypoWhole(whole);
    setTypoMessage('');
    setRestoreArmed(false);
    if (typoReport) analyzeTypo(whole, typoCategories);
  };

  const toggleTypoCategory = (category: TypoCategory) => {
    const next = TYPO_CATEGORIES.filter((item) =>
      item === category ? !typoCategories.includes(item) : typoCategories.includes(item)
    );
    setTypoCategories(next);
    saveTypoCategories(next);
    setTypoMessage('');
    setRestoreArmed(false);
    if (typoReport) analyzeTypo(typoWhole, next);
  };

  const fixTypoCase = (item: TypoReportItem) => {
    setRestoreArmed(false);
    let fixed = false;
    try {
      fixed = controller.fixTypographyCase(item);
      setTypoMessage(fixed ? '' : t('typoCaseChanged'));
    } catch {
      setTypoMessage(t('typoError'));
    }
    analyzeTypo();
  };

  const ignoreTypoCase = (item: TypoReportItem) => {
    setRestoreArmed(false);
    try {
      controller.ignoreTypographyCase(item);
      setTypoMessage('');
    } catch {
      setTypoMessage(t('typoError'));
    }
    loadTypography();
    analyzeTypo();
  };

  const fixAllTypo = () => {
    setRestoreArmed(false);
    try {
      const result = controller.fixAllTypography(typoWhole, typoCategories);
      if (result.unavailable) setTypoMessage(t('typoUnavailable'));
      else if (result.noChapter) setTypoMessage(t('typoNoChapter'));
      else if (result.count === 0) setTypoMessage(t('typoNothingFixed'));
      else setTypoMessage(t('typoFixedAll', { count: result.count, chapters: result.chapters }));
    } catch {
      setTypoMessage(t('typoError'));
    }
    analyzeTypo();
  };

  const restoreTypoIgnored = () => {
    if (!restoreArmed) {
      setRestoreArmed(true);
      return;
    }
    setRestoreArmed(false);
    try {
      const count = controller.restoreTypographyIgnored();
      setTypoMessage(t('typoRestored', { count }));
    } catch {
      setTypoMessage(t('typoError'));
    }
    loadTypography();
    if (typoReport) analyzeTypo();
  };

  const showMoreTypo = (category: TypoCategory, limit: number) => {
    setTypoShown((current) => {
      const next = { ...current };
      next[category] = limit + TYPO_GROUP_STEP;
      return next;
    });
  };

  // Aller a : ouvre le chapitre, ferme la fenetre (l'onglet Typographie est
  // garde) puis selectionne le passage des que l'editeur est pret.
  const goToTypoCase = (item: TypoReportItem) => {
    setRestoreArmed(false);
    controller.openItem(item.chapter, 'chapter');
    onClose();
    let tries = 0;
    const attempt = () => {
      tries += 1;
      let shown = false;
      try {
        shown = controller.revealTypographyCase(item);
      } catch {
 shown = false;
      }
      if (!shown && tries < TYPO_REVEAL_TRIES) window.setTimeout(attempt, TYPO_REVEAL_DELAY);
    };
    window.setTimeout(attempt, TYPO_REVEAL_DELAY);
  };

  const saveAuto = (nextEnabled: boolean, nextRules: AutoReplaceRule[]) => {
    controller.setAutoReplace({ enabled: nextEnabled, rules: nextRules });
    setDirty(false);
  };

  const saveIfDirty = () => {
    if (dirty) saveAuto(autoEnabled, rules);
  };

  const close = () => {
    if (dirty || rules.some(isBlankRule)) {
      saveAuto(autoEnabled, rules.filter((rule) => !isBlankRule(rule)));
    }
    setFindStr('');
    setRepStr('');
    setWholeProject(false);
    setTab('search');
    setTypoReport(null);
    setTypoMessage('');
    setTypoShown({});
    setRestoreArmed(false);
    onClose();
  };

  const runReplace = () => {
    if (!findStr || (matchInfo !== null && matchInfo.count === 0)) return;
    controller.replaceAll(findStr, repStr, wholeProject, { wholeWord, matchCase });
    close();
  };

  const ignorePrimary = () => undefined;

  const switchTab = (next: ReplaceTab) => {
    saveIfDirty();
    if (next === 'typo' && tab !== 'typo') {
      loadTypography();
      setTypoMessage('');
      setRestoreArmed(false);
      if (!typoReport && controller.activeType() !== 'chapter') setTypoWhole(true);
    }
    setTab(next);
  };

  const updateRule = (index: number, field: 'from' | 'to', value: string) => {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)));
    setDirty(true);
  };

  const addRule = () => {
    setFocusIndex(rules.length);
    setRules((current) => [...current, { from: '', to: '' }]);
  };

  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
    setFocusIndex(null);
    saveAuto(autoEnabled, next);
  };

  const toggleEnabled = (value: boolean) => {
    setAutoEnabled(value);
    saveAuto(value, rules);
  };

  // Nombre d'occurrences, recalcule peu apres chaque changement.
  useEffect(() => {
    setMatchInfo(null);
    if (!open || tab !== 'search' || !findStr) return undefined;
    const timer = window.setTimeout(() => {
      setMatchInfo(controller.countMatches(findStr, wholeProject, { wholeWord, matchCase }));
    }, 200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, tab, findStr, wholeProject, wholeWord, matchCase, controller]);

  // A chaque ouverture, on recharge la liste du livre ouvert et les reglages
  // typographiques ; une analyse deja affichee est refaite.
  useEffect(() => {
    if (!open) return;
    const current = controller.getAutoReplace();
    setAutoEnabled(current.enabled);
    setRules(current.rules.map((rule) => ({ ...rule })));
    setDirty(false);
    setFocusIndex(null);
    setRestoreArmed(false);
    loadTypography();
    if (tab === 'typo' && typoReport) analyzeTypo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const warningFor = (rule: AutoReplaceRule, index: number): string | null => {
    const from = rule.from.trim();
    if (!from) return null;
    if (!isAutoReplaceWord(from)) return t('autoRepWarnWord');
    const key = from.toLocaleLowerCase();
    if (rules.findIndex((other) => other.from.trim().toLocaleLowerCase() === key) !== index) {
      return t('autoRepWarnDuplicate');
    }
    if (rule.to === '') return t('autoRepWarnEmpty');
    return null;
  };

  let countLabel = '';
  if (findStr && matchInfo) {
    if (matchInfo.noChapter) countLabel = t('replaceNoChapterOpen');
    else if (matchInfo.count === 0) countLabel = t('replaceCountNone');
    else if (!wholeProject) countLabel = t(matchInfo.scenes ? 'replaceCountScene' : 'replaceCountChapter', { count: matchInfo.count });
    else countLabel = t(matchInfo.scenes ? 'replaceCountScenes' : 'replaceCountChapters', { count: matchInfo.count, places: matchInfo.places });
  }
  const nothingToReplace = !findStr || (matchInfo !== null && matchInfo.count === 0);

  const isScreenplay = controller.isScreenplayProject();
  const countBadge: number | null =
    findStr.length > 0 && matchInfo && !matchInfo.noChapter ? matchInfo.count : null;
  const toggleWholeWord = () => {
    const next = !wholeWord;
    setWholeWord(next);
    saveOption(WHOLE_WORD_KEY, next);
  };
  const toggleMatchCase = () => {
    const next = !matchCase;
    setMatchCase(next);
    saveOption(MATCH_CASE_KEY, next);
  };

  // Typographie : valeurs affichees
  const typoLanguageChoice: TypoLanguageChoice =
    typoSettings && typoSettings.language ? typoSettings.language : 'auto';
  const typoIgnoredCount = typoSettings ? typoSettings.ignored.length : 0;
  const typoCanFixAll = !!typoReport && typoReport.items.some((item) => item.issue.replacement !== null);

  let typoSummary: string = t('typoHint');
  if (typoReport) {
    if (typoReport.unavailable) typoSummary = t('typoUnavailable');
    else if (typoReport.noChapter) typoSummary = t('typoNoChapter');
    else if (typoReport.total === 0) typoSummary = t('typoNone');
    else if (typoWhole) typoSummary = t('typoSummaryProject', { count: typoReport.total, chapters: typoReport.chapters });
    else typoSummary = t('typoSummaryChapter', { count: typoReport.total });
    if (typoReport.truncated) typoSummary += ' ' + t('typoTruncated', { count: typoReport.items.length });
  }

  const typoGroups: TypoGroup[] = [];
  if (typoReport) {
    for (const category of TYPO_CATEGORIES) {
      const items = typoReport.items.filter((item) => item.issue.category === category);
      if (items.length === 0) continue;
      typoGroups.push({ category, items, total: typoReport.counts[category] ?? items.length });
    }
  }

  const renderTypoText = (text: string, prefix: string): React.ReactNode[] =>
    typoPieces(text).map((piece, index) =>
      piece.space ? (
 <span key={prefix + index} className="typo-space">
   {t(piece.space)}
        </span>
      ) : (
 <React.Fragment key={prefix + index}>{piece.text}</React.Fragment>
      )
    );

  const renderTypoExcerpt = (item: TypoReportItem): React.ReactElement => {
    const { start, end, original, replacement } = item.issue;
    const from = Math.max(0, start - TYPO_EXCERPT);
    const to = Math.min(item.text.length, end + TYPO_EXCERPT);
    const before = (from > 0 ? ELLIPSIS : '') + item.text.slice(from, start);
    const after = item.text.slice(end, to) + (to < item.text.length ? ELLIPSIS : '');
    return (
      <div className="typo-excerpt">
        <span className="typo-context">{before}</span>
 {replacement === null ? (
   <mark className="typo-flag">{renderTypoText(original, 'o')}</mark>
        ) : (
   <>
     {original ? <del className="typo-old">{renderTypoText(original, 'o')}</del> : null}
     <ins className="typo-new">{replacement ? renderTypoText(replacement, 'n') : t('typoNothing')}</ins>
          </>
        )}
 <span className="typo-context">{after}</span>
      </div>
    );
  };

  const footer =
    tab === 'search' ? (
      <>
        <button className="replace-close-btn" onClick={close}>{t('close')}</button>
        <button className="btn-primary replace-run-btn" onClick={runReplace} disabled={nothingToReplace}>{t('replaceAllBtn')}</button>
      </>
    ) : tab === 'typo' ? (
      <>
        <button className="replace-close-btn" onClick={close}>{t('close')}</button>
        {isScreenplay ? null : (
   <>
     <button
       className="typo-restore-btn"
       onClick={restoreTypoIgnored}
       disabled={typoIgnoredCount === 0}
       title={t('typoRestoreHint')}
     >
       {restoreArmed ? t('typoRestoreConfirm') : t('typoRestore', { count: typoIgnoredCount })}
     </button>
     <button
className="btn-primary replace-run-btn"
       onClick={fixAllTypo}
       disabled={!typoCanFixAll}
       title={t('typoFixAllHint')}
     >
       {t('typoFixAll')}
            </button>
          </>
        )}
      </>
    ) : (
      <button onClick={close}>{t('close')}</button>
    );

  return (
    <Modal
      open={open}
      title={t('replaceModalTitle')}
      onCancel={close}
      onPrimary={tab === 'search' ? runReplace : tab === 'auto' ? saveIfDirty : ignorePrimary}
      footer={footer}
    >
      <div className="autorep-tabs" role="tablist">
        <button
   type="button"
   role="tab"
          aria-selected={tab === 'search'}
   className={tab === 'search' ? 'autorep-tab active' : 'autorep-tab'}
   onClick={() => switchTab('search')}
        >
          {t('autoRepTabSearch')}
        </button>
 <button
          type="button"
          role="tab"
   aria-selected={tab === 'auto'}
   className={tab === 'auto' ? 'autorep-tab active' : 'autorep-tab'}
   onClick={() => switchTab('auto')}
 >
   {t('autoRepTabAuto')}
        </button>
 <button
          type="button"
          role="tab"
   aria-selected={tab === 'typo'}
   className={tab === 'typo' ? 'autorep-tab active' : 'autorep-tab'}
   onClick={() => switchTab('typo')}
        >
   {t('typoTab')}
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <div className="replace-search">
     <label className="replace-field-label" htmlFor="replace-find-input">
       {t('replaceFindLabel')}
     </label>
     <div className="replace-find-wrap">
       <input
         id="replace-find-input"
         type="text"
  value={findStr}
         onChange={(e) => setFindStr(e.target.value)}
         placeholder={t('findPlaceholder')}
  spellCheck={false}
  autoFocus
       />
       {countBadge !== null && (
         <span className={'replace-badge' + (countBadge === 0 ? ' none' : '')} aria-hidden="true">
    {countBadge}
         </span>
)}
     </div>
     <label className="replace-field-label" htmlFor="replace-rep-input">
       {t('replaceWithLabel')}
            </label>
     <input
       id="replace-rep-input"
       type="text"
value={repStr}
       onChange={(e) => setRepStr(e.target.value)}
       placeholder={t('replacePlaceholder')}
       spellCheck={false}
            />
     <div className="replace-row">
       <div className="replace-scope" role="group" aria-label={t('replaceScopeGroup')}>
         <button
    type="button"
    className={'replace-seg' + (wholeProject ? '' : ' active')}
    aria-pressed={!wholeProject}
    onClick={() => setWholeProject(false)}
         >
    {isScreenplay ? t('replaceScopeScene') : t('replaceScopeChapter')}
         </button>
  <button
    type="button"
    className={'replace-seg' + (wholeProject ? ' active' : '')}
    aria-pressed={wholeProject}
    onClick={() => setWholeProject(true)}
  >
    {isScreenplay ? t('replaceScopeScreenplay') : t('replaceScopeProject')}
         </button>
       </div>
       <div className="replace-toggles">
  <button
           type="button"
           className={'replace-toggle' + (wholeWord ? ' active' : '')}
    aria-pressed={wholeWord}
    title={t('replaceWholeWordHint')}
    onClick={toggleWholeWord}
  >
    {t('replaceWholeWord')}
  </button>
         <button
           type="button"
           className={'replace-toggle' + (matchCase ? ' active' : '')}
    aria-pressed={matchCase}
    title={t('replaceMatchCaseHint')}
           onClick={toggleMatchCase}
  >
    {t('replaceMatchCase')}
         </button>
       </div>
     </div>
     <p className={'replace-count' + (matchInfo && matchInfo.count === 0 ? ' none' : '')} aria-live="polite">{countLabel}</p>
   </div>
        </>
      ) : tab === 'typo' ? (
        <div className="typo-panel">
          {isScreenplay ? (
     <p className="typo-note">{t('typoUnavailable')}</p>
   ) : (
     <>
       <div className="typo-settings">
  <div className="typo-setting">
    <span className="typo-label">{t('typoLanguageLabel')}</span>
    <div className="replace-scope" role="group" aria-label={t('typoLanguageLabel')}>
      {TYPO_LANGUAGES.map((choice) => (
        <button
   key={choice.value}
   type="button"
   className={'replace-seg' + (typoLanguageChoice === choice.value ? ' active' : '')}
          aria-pressed={typoLanguageChoice === choice.value}
          title={choice.hint ? t(choice.hint) : undefined}
   onClick={() => updateTypography({ language: choice.value })}
 >
   {t(choice.label)}
        </button>
      ))}
    </div>
  </div>
         {typoLanguage === 'fr' && typoSettings ? (
    <>
      <div className="typo-setting">
        <span className="typo-label">{t('typoSpacingLabel')}</span>
        <div className="replace-scope" role="group" aria-label={t('typoSpacingLabel')}>
   {TYPO_SPACINGS.map((choice) => (
     <button
       key={choice.value}
       type="button"
       className={'replace-seg' + (typoSettings.spacing === choice.value ? ' active' : '')}
       aria-pressed={typoSettings.spacing === choice.value}
       title={t(choice.hint)}
onClick={() => updateTypography({ spacing: choice.value })}
     >
       {t(choice.label)}
     </button>
   ))}
 </div>
      </div>
      <div className="typo-setting">
 <span className="typo-label" title={t('typoDialogueHint')}>{t('typoDialogueLabel')}</span>
        <div className="replace-scope" role="group" aria-label={t('typoDialogueLabel')}>
   {TYPO_DIALOGUES.map((choice) => (
     <button
       key={choice.value}
       type="button"
       className={'replace-seg' + (typoSettings.dialogueStyle === choice.value ? ' active' : '')}
       aria-pressed={typoSettings.dialogueStyle === choice.value}
       title={t('typoDialogueHint')}
       onClick={() => updateTypography({ dialogueStyle: choice.value })}
     >
       {t(choice.label)}
     </button>
   ))}
        </div>
      </div>
    </>
         ) : null}
       </div>

       <div className="replace-row">
         <div className="replace-scope" role="group" aria-label={t('typoScopeGroup')}>
    <button
      type="button"
      className={'replace-seg' + (typoWhole ? '' : ' active')}
      aria-pressed={!typoWhole}
      onClick={() => chooseTypoScope(false)}
    >
      {t('replaceScopeChapter')}
    </button>
    <button
      type="button"
      className={'replace-seg' + (typoWhole ? ' active' : '')}
      aria-pressed={typoWhole}
      onClick={() => chooseTypoScope(true)}
           >
      {t('replaceScopeProject')}
           </button>
         </div>
  <button
           type="button"
           className="btn-primary typo-analyze-btn"
           onClick={runTypoAnalysis}
    disabled={typoCategories.length === 0}
  >
    {t('typoAnalyze')}
  </button>
       </div>

       <div>
         <span className="typo-label">{t('typoCategoriesLabel')}</span>
  <div className="replace-toggles typo-categories" role="group" aria-label={t('typoCategoriesLabel')}>
    {TYPO_CATEGORIES.map((category) => {
      const active = typoCategories.includes(category);
      return (
 <button
          key={category}
   type="button"
   className={'replace-toggle' + (active ? ' active' : '')}
   aria-pressed={active}
          title={TYPO_REPORT_ONLY.includes(category) ? t('typoReportOnlyHint') : undefined}
   onClick={() => toggleTypoCategory(category)}
        >
          {t(TYPO_CATEGORY_LABELS[category])}
 </button>
      );
    })}
         </div>
       </div>

       <p className="replace-count typo-summary" aria-live="polite">{typoSummary}</p>
       {typoMessage ? <p className="typo-message">{typoMessage}</p> : null}

       {typoGroups.length > 0 ? (
  <div className="typo-results">
    {typoGroups.map((group) => {
      const limit = typoShown[group.category] ?? TYPO_GROUP_STEP;
      return (
        <section key={group.category} className="typo-group">
   <h4 className="typo-group-title">
     <span>{t(TYPO_CATEGORY_LABELS[group.category])}</span>
     <span className="typo-group-count">{group.total}</span>
          </h4>
   {group.items.slice(0, limit).map((item, index) => (
     <div key={group.category + '-' + index} className="typo-item">
{typoWhole || item.issue.replacement === null ? (
         <div className="typo-item-head">
    {typoWhole ? <span className="typo-item-chapter">{item.chapter}</span> : <span />}
    {item.issue.replacement === null ? (
      <span className="typo-badge" title={t('typoReportOnlyHint')}>{t('typoToCheck')}</span>
           ) : null}
         </div>
       ) : null}
       {renderTypoExcerpt(item)}
       <div className="typo-item-actions">
  <button type="button" title={t('typoGoToHint')} onClick={() => goToTypoCase(item)}>
    {t('typoGoTo')}
         </button>
         {item.issue.replacement !== null ? (
           <button type="button" onClick={() => fixTypoCase(item)}>
      {t('typoFix')}
    </button>
         ) : null}
         <button type="button" title={t('typoIgnoreHint')} onClick={() => ignoreTypoCase(item)}>
    {t('typoIgnore')}
  </button>
       </div>
     </div>
   ))}
   {group.items.length > limit ? (
            <button type="button" className="typo-more" onClick={() => showMoreTypo(group.category, limit)}>
       {t('typoShowMore', { count: group.items.length - limit })}
     </button>
          ) : null}
        </section>
      );
    })}
  </div>
       ) : null}
     </>
          )}
        </div>
      ) : (
        <div className="autorep-panel">
   <label className="autorep-toggle">
     <input
       type="checkbox"
checked={autoEnabled}
       onChange={(e) => toggleEnabled(e.target.checked)}
     />
     <span>{t('autoRepEnabled')}</span>
   </label>
   <p className="autorep-hint">{t('autoRepHint')}</p>

   {rules.length === 0 ? (
     <p className="autorep-empty">{t('autoRepEmpty')}</p>
   ) : (
            <div className="autorep-list">
       <div className="autorep-head">
         <span>{t('autoRepFrom')}</span>
         <span />
         <span>{t('autoRepTo')}</span>
  <span />
       </div>
       {rules.map((rule, index) => {
         const warning = warningFor(rule, index);
         return (
           <div key={index} className="autorep-item">
      <div className="autorep-row">
 <input
          type="text"
   value={rule.from}
   placeholder={t('autoRepFromPlaceholder')}
   autoFocus={focusIndex === index}
   onChange={(e) => updateRule(index, 'from', e.target.value)}
   onBlur={saveIfDirty}
        />
        <span className="autorep-arrow" aria-hidden="true">{ARROW}</span>
        <input
   type="text"
          value={rule.to}
          placeholder={t('autoRepToPlaceholder')}
   onChange={(e) => updateRule(index, 'to', e.target.value)}
          onBlur={saveIfDirty}
 />
        <button
          type="button"
   className="autorep-del"
          title={t('autoRepDelete')}
   aria-label={t('autoRepDelete')}
   onClick={() => removeRule(index)}
        >
   {CROSS}
        </button>
      </div>
      {warning ? <div className="autorep-warn">{warning}</div> : null}
    </div>
         );
       })}
            </div>
   )}

          <button type="button" className="autorep-add" onClick={addRule}>
     {t('autoRepAdd')}
          </button>
        </div>
      )}
    </Modal>
  );
}
