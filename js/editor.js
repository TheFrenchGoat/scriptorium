// js/editor.js
// Orchestrateur principal de la page d'édition. Chargé en tant que module ES
// (<script type="module">), donc exécuté après le parsing du DOM — pas besoin
// d'attendre DOMContentLoaded.
//
// Toute persistance passe par window.api (exposé par preload.js) : plus aucun
// accès direct à Node/localStorage depuis ce fichier (voir contextIsolation
// dans app.js).

import { WB_CONFIG, WB_TEMPLATES } from './wb-config.js';
import { setupTimer } from './timer.js';
import { setupMusicPlayer } from './music.js';
import { buildDocxData } from './docx-export.js';
import { buildMarkdown } from './markdown-export.js';
import { buildPrintHtml } from './pdf-export.js';
import { createEditHistory } from './edit-history.js';
import { t, setLanguage, getLanguage, applyStaticTranslations } from './i18n.js';
import { getPlainTextWithMap, clearGrammarMarks, applyGrammarMatches } from './grammar-check.js';

// --- MODALES GÉNÉRIQUES (remplacent alert()/confirm() natifs du navigateur) ---
// Définies au niveau module (pas dans init()) pour rester utilisables même
// si init() a échoué avant de se terminer — notamment par le tout dernier
// filet de sécurité en bas de ce fichier, qui doit pouvoir prévenir
// l'utilisateur d'une erreur de chargement sans jamais retomber sur une
// fenêtre système hors thème.

// `actions` (optionnel) : tableau de { label, onClick } rendu en boutons
// sous le message — ex: liste de fiches à ouvrir directement plutôt que de
// simplement mentionner leur nombre.
let infoModalHasActions = false;
function showInfoModal(message, actions) {
  document.getElementById('infoModalMessage').textContent = message;
  const modal = document.getElementById('infoModal');

  // La grande majorité des appels n'ont pas d'actions : on ne touche au DOM
  // pour les nettoyer que si un appel précédent en avait effectivement posé,
  // plutôt que de faire un querySelector + remove() à chaque appel.
  if (infoModalHasActions) {
    const oldActions = modal.querySelector('.info-modal-actions');
    if (oldActions) oldActions.remove();
    infoModalHasActions = false;
  }

  if (actions && actions.length > 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'info-modal-actions';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', () => { modal.style.display = 'none'; a.onClick(); });
      actionsEl.appendChild(btn);
    });
    modal.querySelector('.modal-buttons').insertAdjacentElement('beforebegin', actionsEl);
    infoModalHasActions = true;
  }

  modal.style.display = 'flex';
}
document.getElementById('closeInfoModal').addEventListener('click', () => {
  document.getElementById('infoModal').style.display = 'none';
});

// Remplacement de confirm() natif (fenêtre système hors thème). Contrairement
// à confirm() qui est synchrone, celle-ci est asynchrone :
// `if (!(await showConfirmModal(msg))) return;` à l'appel.
function showConfirmModal(message) {
  return new Promise(resolve => {
    document.getElementById('confirmModalMessage').textContent = message;
    const modal = document.getElementById('confirmModal');
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');

    // Un seul clic doit compter : anciens écouteurs retirés avant d'en poser
    // de nouveaux, pour ne jamais empiler plusieurs résolutions sur des
    // appels successifs de cette modale partagée.
    const settle = (result) => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => settle(true);
    const onCancel = () => settle(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.style.display = 'flex';
  });
}

async function init() {
  const projectName = await window.api.getCurrentProject();
  if (!projectName) {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('projectTitle').textContent = projectName;

  const savedLang = (await window.api.getLanguage()) || 'fr';
  setLanguage(savedLang);
  applyStaticTranslations();

  document.querySelectorAll('.lang-choice-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setLanguage(btn.dataset.lang);
      await window.api.saveLanguage(getLanguage());
      applyStaticTranslations();
      updateSettingsActiveStates();
      updateStats();
      renderSidebar();
      renderTabs();
      renderWbMenu(); // les titres ✏️/🗑 des types personnalisés sont posés dynamiquement, pas via data-i18n
      updateUndoRedoButtons();
    });
  });

  document.getElementById('btnBack').addEventListener('click', async () => {
    await save();
    window.location.href = 'index.html';
  });

  // --- ACCESSIBILITÉ : Échap ferme la modale ouverte, Entrée valide l'action principale ---
  function setupModalAccessibility() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;

      const openModal = Array.from(document.querySelectorAll('.modal'))
        .find(m => getComputedStyle(m).display !== 'none');
      if (!openModal) return;

      if (e.key === 'Escape') {
        // Simule un clic sur le bouton "Annuler/Fermer" (toujours le premier
        // de .modal-buttons dans cette appli) plutôt que de cacher la modale
        // directement : certaines modales (showConfirmModal) attendent une
        // Promise résolue par un clic sur un bouton — la cacher sans passer
        // par là la laisserait bloquée indéfiniment en attente.
        const cancelBtn = openModal.querySelector('.modal-buttons button:first-child');
        if (cancelBtn) { cancelBtn.click(); } else { openModal.style.display = 'none'; }
        return;
      }

      // Entrée ne valide que depuis un champ <input> (pas un <textarea>, où
      // Entrée doit rester un retour à la ligne normal), et jamais depuis un <select>
      // (Entrée y sert à confirmer l'option surlignée, pas à fermer la modale).
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        const primaryBtn = openModal.querySelector('.modal-buttons button:last-child');
        if (primaryBtn) { e.preventDefault(); primaryBtn.click(); }
      }
    });
  }

  // --- ACCESSIBILITÉ : rend les items de menus déroulants activables au clavier
  // (Tab pour s'y déplacer, Entrée/Espace pour choisir), sans dupliquer la
  // logique de clic déjà branchée séparément pour chacun.
  function makeKeyboardActivatable(selector) {
    document.querySelectorAll(selector).forEach(el => {
      el.tabIndex = 0;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
  }
  ['.dropdown-item'].forEach(makeKeyboardActivatable);

  // --- GESTION DES THÈMES ---
  const savedTheme = (await window.api.getTheme()) || 'dark';
  document.body.className = `${savedTheme} editor-page`;

  document.querySelectorAll('.theme-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.className = `${theme} editor-page`;
      window.api.saveTheme(theme);
      updateSettingsActiveStates();
    });
  });

  // Reflète visuellement le thème et la langue actuellement actifs parmi les
  // boutons de choix de la modale Paramètres (au chargement et après chaque
  // changement), pour qu'on sache toujours ce qui est sélectionné.
  function updateSettingsActiveStates() {
    document.querySelectorAll('.theme-choice-btn').forEach(btn => {
      btn.classList.toggle('active', document.body.classList.contains(btn.dataset.theme));
    });
    document.querySelectorAll('.lang-choice-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === getLanguage());
    });
  }
  updateSettingsActiveStates();

  // --- MODALE "PARAMÈTRES" ---
  // Remplace l'ancien menu déroulant en accordéon (Thème/Langue/Grammaire
  // imbriqués + Affichage/Statistiques séparés) par une modale unique, à
  // sections claires : Apparence / Correction / Mises à jour. Statistiques
  // est désormais un bouton à part dans l'en-tête (consultation ponctuelle,
  // pas un réglage), au même niveau que Sauvegardes et Exporter.
  document.getElementById('btnSettingsToggle').addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'flex';
    updateSettingsActiveStates();
  });
  document.getElementById('closeSettingsModal').onclick = () => closeModal('settingsModal');

  document.getElementById('btnHelp').addEventListener('click', () => {
    document.getElementById('helpModal').style.display = 'flex';
  });
  document.getElementById('closeHelpModal').onclick = () => closeModal('helpModal');

  window.api.getAppVersion().then(version => {
    const el = document.getElementById('settingsAppVersion');
    if (el) el.textContent = `v${version}`;
  });

  // --- PRÉFÉRENCES D'AFFICHAGE ---
  // La largeur reste une propriété de la feuille d'écriture (#editor, via
  // --editor-width). La taille et la police de texte, elles, pilotent
  // désormais l'INTERFACE (menus, sidebar, modales...) et non plus la feuille
  // d'écriture elle-même — voir --ui-font-size / --ui-font-family (style.css).
  function applyEditorPrefs(prefs) {
    document.body.style.setProperty('--editor-width', prefs.width + 'px');
    document.body.style.setProperty('--ui-font-size', (prefs.uiFontSize || 14) + 'px');
    document.body.style.setProperty('--ui-font-family', prefs.uiFontFamily || "'Roboto', sans-serif");
  }

  let editorPrefs = (await window.api.getEditorPrefs()) || { width: 800, uiFontSize: 14, uiFontFamily: "'Roboto', sans-serif" };
  applyEditorPrefs(editorPrefs);

  const prefWidth = document.getElementById('prefWidth');
  const prefUiFontSize = document.getElementById('prefUiFontSize');
  const prefUiFont = document.getElementById('prefUiFont');

  prefWidth.value = String(editorPrefs.width);
  prefUiFontSize.value = String(editorPrefs.uiFontSize || 14);
  prefUiFont.value = editorPrefs.uiFontFamily || "'Roboto', sans-serif";

  // --- STATISTIQUES D'ÉCRITURE ---
  let currentStatsPeriod = 'day';

  document.getElementById('btnStats').onclick = async () => {
    document.getElementById('statsModal').style.display = 'flex';
    await renderStatsGoal();
    await renderStatsList(currentStatsPeriod);
  };
  document.getElementById('closeStats').onclick = () => closeModal('statsModal');

  document.getElementById('statsGoalSaveBtn').addEventListener('click', async () => {
    const input = document.getElementById('statsGoalInput');
    const value = parseInt(input.value, 10);
    const stats = (await window.api.getWritingStats()) || {};
    const bucket = getStatsBucket(stats);
    bucket.dailyGoal = (Number.isFinite(value) && value > 0) ? value : null;
    await window.api.saveWritingStats(stats);
    await renderStatsGoal();
  });

  // --- MISE À JOUR AUTOMATIQUE ---
  // Le résultat (mise à jour trouvée / déjà à jour / erreur) est affiché par
  // le processus main via des dialogues natifs (voir app.js#setupAutoUpdater).
  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  if (btnCheckUpdates) {
    btnCheckUpdates.onclick = () => window.api.checkForUpdates();
  }

  document.querySelectorAll('.stats-period-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      currentStatsPeriod = opt.dataset.period;
      document.getElementById('statsPeriodLabel').textContent = opt.textContent;
      opt.closest('.dropdown-menu').classList.remove('show');
      await renderStatsList(currentStatsPeriod);
    });
  });

  [prefWidth, prefUiFontSize, prefUiFont].forEach(select => {
    select.addEventListener('change', () => {
      editorPrefs = {
        width: parseInt(prefWidth.value, 10),
        uiFontSize: parseInt(prefUiFontSize.value, 10),
        uiFontFamily: prefUiFont.value
      };
      applyEditorPrefs(editorPrefs);
      window.api.saveEditorPrefs(editorPrefs);
    });
  });

  // --- DROPDOWNS ---
  document.querySelectorAll('.dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isShowing = menu.classList.contains('show');
      document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => m.classList.remove('show'));
      if (!isShowing) menu.classList.add('show');
    });
  });

  document.getElementById('btnNewWB').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('wbMenu');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    menu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => m.classList.remove('show'));
  });

  // --- FORMATTAGE DU TEXTE ---
  function format(cmd, val) {
    if (activeType === 'chapter') {
      document.execCommand(cmd, false, val);
      document.getElementById('editor').focus();
      save(); updateStats();
    }
  }

  // document.execCommand('fontSize', ...) est limité aux 7 tailles HTML
  // historiques (attribut <font size="1..7">, sans rapport avec des pixels).
  // Pour obtenir une vraie taille en pixels (et donc plus de choix que 7
  // valeurs figées), on utilise l'astuce classique : on applique la taille
  // HTML la plus grande (7) pour que le navigateur crée lui-même les
  // <font size="7"> autour de la sélection avec la bonne portée exacte,
  // puis on remplace cet attribut par un style CSS font-size en pixels.
  // Le reste du pipeline (export DOCX notamment, voir docx-export.js) lit
  // déjà node.style.fontSize en pixels, donc aucun autre changement requis.
  function setFontSizePx(px) {
    if (activeType !== 'chapter') return;
    document.execCommand('fontSize', false, '7');
    const editor = document.getElementById('editor');
    editor.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      f.style.fontSize = px + 'px';
    });
    editor.focus();
    save(); updateStats();
  }

  document.getElementById('undoBtn').onclick = () => performUndo();
  document.getElementById('redoBtn').onclick = () => performRedo();
  document.getElementById('boldBtn').onclick = () => format('bold');
  document.getElementById('italicBtn').onclick = () => format('italic');
  document.getElementById('underlineBtn').onclick = () => format('underline');
  document.getElementById('alignLeftBtn').onclick = () => format('justifyLeft');
  document.getElementById('alignCenterBtn').onclick = () => format('justifyCenter');
  document.getElementById('alignRightBtn').onclick = () => format('justifyRight');
  document.getElementById('colorPicker').addEventListener('input', (e) => format('foreColor', e.target.value));

  document.querySelectorAll('.dropdown-item[data-command]').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.command === 'fontSizePx') {
        setFontSizePx(parseInt(item.dataset.value, 10));
      } else {
        format(item.dataset.command, item.dataset.value);
      }
    });
  });

  // --- DONNÉES ET PERSISTANCE ---
  let projects = await window.api.getProjects();
  let projectData = projects[projectName];

  if (projectData && !projectData.chapters && !projectData.world) {
    // Migration d'anciens projets stockés sans la structure {chapters, world}
    projectData = { chapters: projectData, world: {} };
    projects[projectName] = projectData;
    await window.api.saveProjects(projects);
  } else if (!projectData) {
    projectData = { chapters: {}, world: {} };
  }
  if (!projectData.customWbTypes) projectData.customWbTypes = {}; // migration : absent sur les projets créés avant cette fonctionnalité

  // Déclaré ici (et non plus près de ses fonctions utilitaires plus bas) car
  // rebuildFullMentionIndex() est appelé juste en dessous : une variable
  // `let` doit être déclarée avant sa première utilisation à l'exécution,
  // contrairement aux fonctions qui sont hoistées entièrement.
  let wbMentionIndex = new Map(); // clé en minuscule -> Set(noms de chapitres)
  let chapterOrderMap = new Map(); // nom de chapitre -> position (voir rebuildChapterOrderMap plus bas)

  rebuildFullMentionIndex();
  rebuildChapterOrderMap();

  // Restauration de l'état UI précédent
  let uiState = await window.api.getUiState();
  let projectState = uiState[projectName] || { openTabs: [], activeTab: null, activeType: 'chapter' };

  const editorContainer = document.getElementById('editorContainer');
  const chapterList = document.getElementById('chapterList');
  const wbList = document.getElementById('wbList');
  const tabsBar = document.getElementById('tabs');
  const stats = document.getElementById('stats');
  const saveStatus = document.getElementById('saveStatus');

  let openTabs = projectState.openTabs || [];
  let activeTab = projectState.activeTab;
  let activeType = projectState.activeType || 'chapter';
  let draggedTab = null;
  let draggedSidebarItem = null;

  // --- ZOOM DE LA FEUILLE D'ÉCRITURE (Ctrl + molette, comme dans Word) ---
  // Purement visuel et propre à la session (non persisté) : on utilise la
  // propriété CSS `zoom`, supportée nativement par le moteur Chromium
  // d'Electron, qui met à l'échelle la totalité de la page (texte + marges).
  let editorZoom = 1;
  // Contrôlé via l'attribut HTML standard `spellcheck` posé sur l'élément
  // éditable, plutôt que via session.setSpellCheckerEnabled() côté main :
  // cette dernière API est connue pour ne pas toujours désactiver
  // réellement le correcteur natif sur certaines plateformes (notamment
  // Windows, où Chromium peut déléguer au correcteur orthographique de
  // l'OS). L'attribut par élément, lui, est un standard web honoré
  // directement par le moteur de rendu.
  let nativeSpellcheckEnabled = true;
  const EDITOR_ZOOM_MIN = 0.5;
  const EDITOR_ZOOM_MAX = 2.5;
  const EDITOR_ZOOM_STEP = 0.1;

  editorContainer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    editorZoom = Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, +(editorZoom + direction * EDITOR_ZOOM_STEP).toFixed(2)));
    const editor = document.getElementById('editor');
    if (editor) editor.style.zoom = editorZoom;
  }, { passive: false });

  // Sauvegardes automatiques : on n'en crée pas à chaque frappe (trop coûteux
  // en I/O disque), seulement si assez de temps s'est écoulé depuis la
  // dernière, et seulement quand il y a eu de vrais changements entre-temps.
  const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let lastBackupAt = 0;
  let hasUnsavedChangesSinceLastBackup = false;

  // --- HISTORIQUE D'ANNULATION/RÉTABLISSEMENT (indépendant du natif) ---
  const editHistory = createEditHistory();

  // Le compteur de mots doit se rafraîchir quand on déplace le curseur/la
  // sélection (pas seulement quand on tape). Le listener est posé sur
  // `document` (pas sur l'éditeur) car `selectionchange` ne "bubble" pas
  // depuis un simple élément. On ne peut donc pas compter uniquement sur
  // l'événement `blur` de l'éditeur pour le retirer (il ne se déclenche pas
  // forcément quand l'élément est retiré du DOM via innerHTML = '') : on le
  // détache explicitement à chaque nouveau rendu, pour ne jamais accumuler
  // plusieurs listeners au fil des changements d'onglet.
  let activeSelectionChangeHandler = null;
  function detachSelectionChangeHandler() {
    if (activeSelectionChangeHandler) {
      document.removeEventListener('selectionchange', activeSelectionChangeHandler);
      activeSelectionChangeHandler = null;
    }
  }
  const HISTORY_DEBOUNCE_MS = 700; // regrouper une "rafale" de frappe en une seule étape d'annulation
  let historyDebounceTimer = null;

  function scheduleHistoryCommit(name, html) {
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = setTimeout(() => {
      editHistory.commit(name, html);
      updateUndoRedoButtons();
    }, HISTORY_DEBOUNCE_MS);
  }

  function placeCaretAtEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (!undoBtn || !redoBtn) return;
    const enabled = activeType === 'chapter' && !!activeTab;
    undoBtn.disabled = !enabled || !editHistory.canUndo(activeTab);
    redoBtn.disabled = !enabled || !editHistory.canRedo(activeTab);
  }

  function performUndo() {
    if (activeType !== 'chapter' || !activeTab) return;
    const editor = document.getElementById('editor');
    if (!editor) return;

    clearTimeout(historyDebounceTimer); // ne pas laisser un commit différé écraser la restauration
    const previous = editHistory.undo(activeTab, editor.innerHTML);
    if (previous === null) return;

    editor.innerHTML = previous;
    projectData.chapters[activeTab] = previous;
    highlightWorldBuilding();
    editHistory.resyncOnly(activeTab, editor.innerHTML);

    placeCaretAtEnd(editor);
    updateStats();
    updateUndoRedoButtons();
    setSaveStatus('pending');
    save();
  }

  function performRedo() {
    if (activeType !== 'chapter' || !activeTab) return;
    const editor = document.getElementById('editor');
    if (!editor) return;

    clearTimeout(historyDebounceTimer);
    const next = editHistory.redo(activeTab, editor.innerHTML);
    if (next === null) return;

    editor.innerHTML = next;
    projectData.chapters[activeTab] = next;
    highlightWorldBuilding();
    editHistory.resyncOnly(activeTab, editor.innerHTML);

    placeCaretAtEnd(editor);
    updateStats();
    updateUndoRedoButtons();
    setSaveStatus('pending');
    save();
  }

  // --- UTILITAIRES CURSEUR ---
  function getCaretCharacterOffsetWithin(element) {
    let caretOffset = 0;
    const doc = element.ownerDocument || element.document;
    const win = doc.defaultView || doc.parentWindow;
    const sel = win.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caretOffset = preCaretRange.toString().length;
    }
    return caretOffset;
  }

  function setCaretPosition(element, offset) {
    const createRange = (node, chars, range) => {
      if (!range) {
        range = document.createRange();
        range.selectNode(node);
        range.setStart(node, 0);
      }
      if (chars.count === 0) {
        range.setEnd(node, chars.count);
      }
      if (node && chars.count > 0) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent.length < chars.count) {
            chars.count -= node.textContent.length;
          } else {
            range.setEnd(node, chars.count);
            chars.count = 0;
          }
        } else {
          for (let lp = 0; lp < node.childNodes.length; lp++) {
            range = createRange(node.childNodes[lp], chars, range);
            if (chars.count === 0) break;
          }
        }
      }
      return range;
    };

    if (offset >= 0) {
      const selection = window.getSelection();
      const range = createRange(element, { count: offset });
      if (range) {
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  // --- DÉTECTION ET SURLIGNAGE WB (SAFE UNDO) ---
  // Remplace toutes les occurrences d'une chaîne dans un fragment HTML, en ne
  // touchant qu'aux nœuds texte (jamais aux balises). Réutilisée à la fois
  // pour le remplacement dans le chapitre ouvert et pour le remplacement
  // projet entier, qui opère sur des chapitres non affichés à l'écran.
  function replaceInHtmlString(html, findStr, repStr) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html || '';

    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
    const nodesToUpdate = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes(findStr)) nodesToUpdate.push(walker.currentNode);
    }

    let count = 0;
    nodesToUpdate.forEach(n => {
      count += n.nodeValue.split(findStr).length - 1;
      n.nodeValue = n.nodeValue.split(findStr).join(repStr);
    });

    return { html: tempDiv.innerHTML, count };
  }

  // Quand une fiche World Building est renommée, ses mentions déjà posées
  // dans les chapitres pointaient encore vers l'ancien nom (data-wb-key +
  // texte affiché) : au prochain highlightWorldBuilding(), cleanInvalidMentions
  // les considérait invalides (le texte ne correspond plus à aucune clé) et
  // les dé-surlignait silencieusement, en laissant l'ANCIEN nom en texte
  // brut. On met donc à jour ces mentions dans le HTML stocké de chaque
  // chapitre, de la même façon que la suppression le fait déjà pour ses
  // propres mentions.
  function renameWorldMentionsAcrossChapters(oldName, newName) {
    Object.keys(projectData.chapters).forEach(chapName => {
      const html = projectData.chapters[chapName];
      if (!html || typeof html !== 'string') return;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      const mentions = Array.from(tempDiv.querySelectorAll('.wb-mention')).filter(
        span => span.dataset.wbKey && span.dataset.wbKey.toLowerCase() === oldName.toLowerCase()
      );
      if (mentions.length === 0) return;

      mentions.forEach(span => {
        span.dataset.wbKey = newName;
        span.textContent = newName;
      });

      projectData.chapters[chapName] = tempDiv.innerHTML;
    });
  }

  function cleanInvalidMentions(rootNode, wbItems) {
    const mentions = Array.from(rootNode.querySelectorAll('.wb-mention'));
    let cleaned = false;

    mentions.forEach(span => {
      const text = span.textContent;
      const isValid = wbItems.some(key => key.toLowerCase() === text.toLowerCase());

      if (!isValid) {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        cleaned = true;
      }
    });
    if (cleaned) rootNode.normalize();
  }

  // Au-delà de ce seuil de caractères, le recalcul du surlignage à CHAQUE
  // pause de frappe (TreeWalker + regex sur tout le chapitre) devient coûteux.
  // On ne le refait plus qu'occasionnellement pour ces gros chapitres, plutôt
  // qu'à chaque frappe — une vraie solution (recalcul incrémental limité au
  // paragraphe modifié) demanderait de réécrire highlightWorldBuilding en
  // profondeur ; ceci est un garde-fou pragmatique en attendant.
  const HIGHLIGHT_SIZE_THRESHOLD = 50000; // ~50 000 caractères
  const HIGHLIGHT_MANY_ITEMS_THRESHOLD = 60; // fiches World Building : le pattern regex et le nombre de mentions à recolorer grossissent avec ce nombre
  const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5; // 1 fois sur 5 pauses de frappe pour les gros chapitres / gros projets
  let largeChapterHighlightCounter = 0;

  // Échappement générique, utilisé partout où une valeur (nom de fiche,
  // icône libre...) est injectée dans un attribut HTML via un template
  // literal, pour éviter qu'un caractère spécial ("<", '"'...) ne casse le
  // balisage ou n'introduise involontairement du HTML.
  function escapeHtmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- SÉLECTEUR D'EMOJI RÉUTILISABLE ---
  // Une seule implémentation, utilisée à la fois pour l'icône d'une fiche
  // World Building et pour l'icône d'un type de fiche personnalisé, plutôt
  // que deux versions dupliquées (une bonne, une réduite à un simple champ
  // texte sans panneau).
  const WB_EMOJI_CHOICES = [
    // Personnages
    '👤', '👥', '🧙', '🧝', '🧝‍♀️', '🦸', '🦹', '🧛', '🧟', '🧞', '🧚', '🧜‍♀️',
    '👑', '💂', '🥷', '👸', '🤴', '👻', '💀', '👹', '👺', '🧌',
    // Créatures / animaux
    '🐺', '🦊', '🐉', '🐲', '🦅', '🦉', '🐍', '🐴', '🦄', '🐗', '🐻', '🦁',
    '🐘', '🐬', '🦂', '🕷️', '🐸', '🦇',
    // Lieux
    '🏰', '🏯', '🏛️', '🏠', '🏚️', '⛩️', '🕌', '🕍', '🌲', '🌳', '🏞️', '🏔️',
    '🌋', '🏝️', '🌊', '🏜️', '🌾', '🌆', '🌌', '🌉',
    // Objets / artefacts
    '⚔️', '🗡️', '🛡️', '🏹', '💣', '🪓', '🔱', '💍', '👑', '🔮', '📜', '📖',
    '🕯️', '💎', '🗝️', '⚰️', '🚪', '⚗️', '🧪', '🪄', '🧭', '⌛', '🪙', '🏺',
    // Divers / concepts
    '🌙', '⭐', '☀️', '🔥', '❄️', '⚡', '🌪️', '☠️', '❤️', '⚖️', '📝', '❓'
  ];

  // Attache un panneau d'emojis à un bouton : clic sur le bouton = ouvre/ferme
  // le panneau ; clic sur un emoji ou validation du champ libre = appelle
  // onSelect(icon) et referme. Le panneau doit déjà avoir les classes
  // "wb-icon-picker dropdown-menu" dans le HTML pour hériter du
  // positionnement et de la fermeture automatique au clic extérieur (déjà
  // gérée globalement pour .dropdown-menu).
  function setupEmojiPicker(btnEl, pickerEl, onSelect) {
    pickerEl.innerHTML = `
      <div class="wb-icon-grid">
        ${WB_EMOJI_CHOICES.map(e => `<button type="button" class="wb-icon-choice" data-icon="${e}">${e}</button>`).join('')}
      </div>
      <div class="wb-icon-custom-row">
        <input type="text" class="wb-icon-custom-input" maxlength="4" data-i18n-placeholder="wbIconCustomPlaceholder" placeholder="${t('wbIconCustomPlaceholder')}">
        <button type="button" class="wb-icon-custom-apply">${t('wbIconCustomApply')}</button>
      </div>
    `;

    // Empêche un clic à l'intérieur du panneau (ex: pour se placer dans le
    // champ libre) de remonter jusqu'au gestionnaire global qui ferme tous
    // les menus déroulants au clic extérieur.
    pickerEl.addEventListener('click', (e) => e.stopPropagation());

    pickerEl.querySelectorAll('.wb-icon-choice').forEach(choiceBtn => {
      choiceBtn.addEventListener('click', () => {
        onSelect(choiceBtn.dataset.icon);
        pickerEl.classList.remove('show');
      });
    });

    const customInput = pickerEl.querySelector('.wb-icon-custom-input');
    const applyCustom = () => {
      if (!customInput.value.trim()) return;
      onSelect(customInput.value.trim());
      customInput.value = '';
      pickerEl.classList.remove('show');
    };
    pickerEl.querySelector('.wb-icon-custom-apply').addEventListener('click', applyCustom);
    customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } });

    btnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => { if (m !== pickerEl) m.classList.remove('show'); });
      pickerEl.classList.toggle('show');
    });
  }

  // Couleurs par défaut par type (reprises des variables CSS --wb-*), utilisées
  // tant qu'une fiche n'a pas de couleur personnalisée (data.color).
  const WB_DEFAULT_COLORS = { character: '#ef4444', place: '#10b981', object: '#3b82f6', other: '#a855f7' };
  function getWbColor(itemData) {
    if (!itemData) return '#94a3b8';
    if (itemData.color) return itemData.color;
    const customDef = projectData.customWbTypes && projectData.customWbTypes[itemData.wbType];
    if (customDef) return customDef.defaultColor || '#94a3b8';
    return WB_DEFAULT_COLORS[itemData.wbType] || '#94a3b8';
  }
  function applyMentionColorStyle(span, itemData) {
    const color = getWbColor(itemData);
    span.style.color = color;
    span.style.borderColor = color + '4d'; // ~30% d'opacité, cohérent avec les couleurs par défaut du CSS
  }

  // --- TYPES DE FICHES PERSONNALISÉS ---
  // Les 4 types intégrés (Personnage/Lieu/Objet/Autre) restent définis dans
  // wb-config.js. En plus, chaque projet peut définir ses propres types
  // (catégories) avec leurs propres champs, stockés dans
  // projectData.customWbTypes. Ces deux fonctions renvoient une vue fusionnée
  // (intégrés + personnalisés de CE projet), utilisée partout où le code a
  // besoin de résoudre les infos d'un type — pour ne jamais avoir à savoir,
  // au point d'appel, si un wbType donné est intégré ou personnalisé.
  //
  // Mises en cache : ces fonctions sont appelées à chaque rendu de sidebar,
  // d'onglet ou de fiche (donc potentiellement très souvent), alors que
  // customWbTypes ne change que sur des actions rares (créer/modifier/
  // supprimer un type, ou remplacer projectData en bloc). `customWbTypesVersion`
  // est incrémenté à chacune de ces actions ; le cache n'est reconstruit que
  // si la version a changé depuis le dernier appel.
  let customWbTypesVersion = 0;
  let cachedWbTemplatesVersion = -1;
  let cachedWbTemplates = null;
  let cachedWbConfigVersion = -1;
  let cachedWbConfig = null;

  function getEffectiveWbTemplates() {
    if (cachedWbTemplates && cachedWbTemplatesVersion === customWbTypesVersion) return cachedWbTemplates;
    const merged = { ...WB_TEMPLATES };
    Object.entries(projectData.customWbTypes || {}).forEach(([key, def]) => {
      merged[key] = { icon: def.icon, label: def.label, fields: def.fields };
    });
    cachedWbTemplates = merged;
    cachedWbTemplatesVersion = customWbTypesVersion;
    return merged;
  }
  function getEffectiveWbConfig() {
    if (cachedWbConfig && cachedWbConfigVersion === customWbTypesVersion) return cachedWbConfig;
    const merged = { ...WB_CONFIG };
    Object.entries(projectData.customWbTypes || {}).forEach(([key, def]) => {
      // colorClass n'est utile que comme repli visuel avant qu'une couleur
      // effective (getWbColor, inline) ne soit appliquée ; 'type-other' est un
      // repli neutre suffisant pour un type personnalisé.
      merged[key] = { label: def.label, colorClass: 'type-other', icon: def.icon };
    });
    cachedWbConfig = merged;
    cachedWbConfigVersion = customWbTypesVersion;
    return merged;
  }

  // --- INDEX INVERSÉ DES MENTIONS (fiche -> chapitres où elle apparaît) ---
  // Avant : chaque ouverture de fiche World Building reparcourait TOUT le
  // texte de TOUS les chapitres pour savoir où elle est mentionnée — coûteux
  // sur un roman à 40+ chapitres. On maintient à la place un index tenu à
  // jour de façon incrémentale (un seul chapitre à la fois, au fil de
  // l'écriture) ; ouvrir une fiche devient alors une simple lecture.
  // (wbMentionIndex lui-même est déclaré plus haut, voir commentaire à cet endroit.)

  function chapterTextMentions(text, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w\\u00C0-\\u00FF'-])(${escaped})(?![\\w\\u00C0-\\u00FF'-])`, 'iu');
    return re.test(text);
  }

  // Recalcule les entrées d'index pour UN SEUL chapitre (retire ses anciennes
  // entrées, ajoute les nouvelles). C'est la seule opération qui tourne au
  // fil de la frappe ; son coût est proportionnel au nombre de fiches, pas
  // au nombre de chapitres du projet.
  function updateMentionIndexForChapter(chapterName, html) {
    const text = stripHtmlToText(html);
    Object.keys(projectData.world).forEach(itemName => {
      const key = itemName.toLowerCase();
      if (!wbMentionIndex.has(key)) wbMentionIndex.set(key, new Set());
      const set = wbMentionIndex.get(key);
      if (chapterTextMentions(text, itemName)) set.add(chapterName); else set.delete(chapterName);
    });
  }

  // Ajoute l'index d'UNE SEULE fiche fraîchement créée (scanne tous les
  // chapitres, mais pour ce seul nom — pas une reconstruction complète de
  // toutes les fiches). Utile car le nom peut déjà apparaître en texte brut
  // dans des chapitres existants avant même d'être surligné.
  function addMentionIndexEntryForNewItem(name) {
    const key = name.toLowerCase();
    const set = new Set();
    Object.keys(projectData.chapters).forEach(chapName => {
      if (chapterTextMentions(stripHtmlToText(projectData.chapters[chapName]), name)) set.add(chapName);
    });
    wbMentionIndex.set(key, set);
  }

  // Reconstruction complète : uniquement pour les actions rares et globales
  // (import de projet, restauration de sauvegarde, remplacement dans tout le
  // projet) où reconstruire entièrement est plus simple et plus sûr qu'un
  // ajustement incrémental fin, sans coûter cher puisque ces actions sont
  // ponctuelles, pas déclenchées à la frappe.
  function rebuildFullMentionIndex() {
    wbMentionIndex = new Map();
    Object.keys(projectData.chapters).forEach(chapName => {
      updateMentionIndexForChapter(chapName, projectData.chapters[chapName]);
    });
  }

  // Position de chaque chapitre dans l'ordre du projet, tenue à jour de façon
  // incrémentale (création/suppression/renommage/réordonnancement d'un
  // chapitre) plutôt que recalculée en repassant par Object.keys(...) à
  // chaque fiche World Building consultée. (chapterOrderMap lui-même est
  // déclaré plus haut, voir commentaire à cet endroit.)
  function rebuildChapterOrderMap() {
    chapterOrderMap = new Map();
    Object.keys(projectData.chapters).forEach((name, i) => chapterOrderMap.set(name, i));
  }

  // Liste les chapitres où le nom d'une fiche apparaît, pour le bloc
  // "Mentionné dans" de la fiche World Building. Simple lecture de l'index
  // (aucun texte reparcouru ici) ; les résultats (généralement peu nombreux)
  // sont triés via chapterOrderMap plutôt qu'en filtrant la liste complète
  // des chapitres à chaque appel.
  function getChaptersContaining(name) {
    const set = wbMentionIndex.get(name.toLowerCase());
    if (!set || set.size === 0) return [];
    return Array.from(set).sort((a, b) => (chapterOrderMap.get(a) ?? 0) - (chapterOrderMap.get(b) ?? 0));
  }

  // Compteur global incrémenté à chaque changement de couleur de fiche (voir
  // wbColorInput plus bas), et version à laquelle chaque chapitre a été
  // synchronisé pour la dernière fois. Tant qu'aucune couleur n'a changé
  // depuis la dernière ouverture d'un chapitre donné, on saute entièrement
  // le parcours de ses mentions — sur un roman avec beaucoup de texte déjà
  // surligné, ça évite un travail inutile à chaque changement d'onglet.
  let wbColorVersion = 0;
  const chapterColorSyncVersion = new Map(); // nom de chapitre -> version au dernier sync

  // Mode lecture pour les fiches World Building : fige tous les champs
  // (readonly/disabled) pour pouvoir relire une fiche sans risque de la
  // modifier par erreur. Volontairement non persisté (juste pour la session
  // en cours) et global à toutes les fiches plutôt que par fiche, pour rester
  // simple : l'utilisateur l'active le temps de relire, puis le désactive.
  let wbReadMode = false;

  // Resynchronise la couleur des mentions déjà posées avec l'état actuel des
  // fiches (une couleur a pu être changée pendant que ce chapitre était
  // fermé). Volontairement PAS appelée depuis highlightWorldBuilding (qui
  // tourne à chaque pause de frappe) : sur un projet avec beaucoup de
  // mentions déjà posées, reparcourir tout l'éditeur à chaque frappe serait
  // coûteux pour un bénéfice quasi nul (la couleur ne change quasiment
  // jamais en cours de frappe). On ne le fait donc qu'à l'ouverture d'un
  // chapitre, et seulement si une couleur a réellement changé depuis.
  function syncMentionColors(editor, chapterName) {
    if (chapterColorSyncVersion.get(chapterName) === wbColorVersion) return; // rien n'a changé depuis
    editor.querySelectorAll('.wb-mention').forEach(span => {
      const itemData = projectData.world[span.dataset.wbKey];
      if (itemData) applyMentionColorStyle(span, itemData);
    });
    chapterColorSyncVersion.set(chapterName, wbColorVersion);
  }

  function highlightWorldBuilding() {
    if (activeType !== 'chapter') return;
    const editor = document.getElementById('editor');
    if (!editor) return;

    const wbItems = Object.keys(projectData.world).sort((a, b) => b.length - a.length);
    if (wbItems.length === 0) return;

    cleanInvalidMentions(editor, wbItems);

    const escapedItems = wbItems.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(?<![\\w\\u00C0-\\u00FF'-])(${escapedItems.join('|')})(?![\\w\\u00C0-\\u00FF'-])`, 'giu');

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];

    while (walker.nextNode()) {
      if (walker.currentNode.parentNode.classList.contains('wb-mention')) continue;
      nodesToProcess.push(walker.currentNode);
    }

    const caretOffset = getCaretCharacterOffsetWithin(editor);

    let hasModified = false;

    nodesToProcess.forEach(textNode => {
      // On traite TOUTES les correspondances du nœud d'origine, pas
      // seulement la première : après chaque split, on continue de chercher
      // dans le nœud restant (« après »), sinon un paragraphe contenant
      // plusieurs mentions différentes ne surlignait que la première.
      // On réinitialise aussi lastIndex à chaque nouveau nœud : comme
      // `pattern` est global et réutilisé d'un nœud à l'autre, un lastIndex
      // hérité d'un nœud précédent pouvait faire manquer entièrement les
      // correspondances d'un nœud plus court.
      let node = textNode;
      pattern.lastIndex = 0;
      let text = node.nodeValue;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        hasModified = true;

        const matchStartNode = node.splitText(match.index);
        const afterNode = matchStartNode.splitText(match[0].length);

        const matchedName = match[0];
        const realKey = wbItems.find(k => k.toLowerCase() === matchedName.toLowerCase());

        if (realKey && projectData.world[realKey]) {
          const itemData = projectData.world[realKey];
          const config = getEffectiveWbConfig()[itemData.wbType];

          const span = document.createElement('span');
          span.className = `wb-mention ${config.colorClass}`;
          span.dataset.wbKey = realKey;
          span.dataset.typeLabel = config.label;
          span.setAttribute('spellcheck', 'false');
          applyMentionColorStyle(span, itemData);

          matchStartNode.parentNode.insertBefore(span, matchStartNode);
          span.appendChild(matchStartNode);
        }

        node = afterNode;
        text = node.nodeValue;
        pattern.lastIndex = 0;
      }
    });

    if (hasModified) {
      editor.normalize();
      try { setCaretPosition(editor, caretOffset); } catch (e) { /* curseur hors texte, on ignore */ }
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const debouncedHighlight = debounce(() => {
    const editor = document.getElementById('editor');
    const chapterSize = editor ? editor.innerText.length : 0;
    const wbItemCount = Object.keys(projectData.world).length;

    let shouldHighlightNow = true;
    if (chapterSize > HIGHLIGHT_SIZE_THRESHOLD || wbItemCount > HIGHLIGHT_MANY_ITEMS_THRESHOLD) {
      largeChapterHighlightCounter++;
      shouldHighlightNow = (largeChapterHighlightCounter % HIGHLIGHT_LARGE_CHAPTER_EVERY_N === 0);
    }

    if (shouldHighlightNow) highlightWorldBuilding();

    if (editor && activeTab && activeType === 'chapter') {
      updateMentionIndexForChapter(activeTab, editor.innerHTML);
      editHistory.resyncOnly(activeTab, editor.innerHTML);
      updateUndoRedoButtons();
    }
  }, 1000);

  // Sauvegarde disque : délibérément sur un timer SÉPARÉ et plus long que le
  // recalcul du surlignage ci-dessus. Avant, save() était appelé dans le
  // même debounce que le surlignage (1s après une pause de frappe) : en
  // écriture continue avec de courtes pauses (fins de mot, de phrase...),
  // ça déclenchait une écriture disque à quasiment chaque pause. Regrouper
  // plusieurs de ces pauses rapprochées en une seule écriture réduit l'I/O
  // sans rien changer côté utilisateur : setSaveStatus('pending') est posé
  // immédiatement à la frappe (voir le listener 'input' plus bas), donc le
  // statut affiché reste tout aussi réactif, seule l'écriture réelle sur
  // disque est différée et groupée.
  const debouncedSave = debounce(() => { save(); }, 2500);

  // --- CORRECTEUR DE GRAMMAIRE HORS LIGNE (LanguageTool) ---
  // Le serveur LanguageTool local tourne en tâche de fond dans le processus
  // main (voir app.js) ; ce bloc ne fait qu'envoyer le texte du chapitre
  // ouvert et poser des <mark class="grammar-error"> sur les correspondances
  // reçues, selon le même principe (TreeWalker + splitText, jamais de
  // ré-écriture du HTML) que highlightWorldBuilding() ci-dessus.
  let grammarPrefs = { enabled: false, languageToolPath: null, port: 8081 };
  let grammarServerReady = false;
  let grammarStarting = false;

  // Petit indicateur dans la barre de statut (visible en permanence pendant
  // l'écriture) reflétant l'état réel du correcteur de grammaire, sans avoir
  // à rouvrir les Paramètres pour le savoir — surtout utile après le bug où
  // le serveur pouvait tomber silencieusement en cours de session.
  function updateGrammarStatusBar() {
    const el = document.getElementById('grammarStatusIndicator');
    if (!el) return;

    if (!grammarPrefs || !grammarPrefs.enabled) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'inline-flex';
    el.classList.remove('status-ready', 'status-error', 'status-starting');

    if (grammarStarting) {
      el.classList.add('status-starting');
      el.textContent = t('grammarStatusBarStarting');
      el.title = t('grammarStatusBarStartingTitle');
    } else if (grammarServerReady) {
      el.classList.add('status-ready');
      el.textContent = t('grammarStatusBarReady');
      el.title = t('grammarStatusBarReadyTitle');
    } else {
      el.classList.add('status-error');
      el.textContent = t('grammarStatusBarError');
      el.title = t('grammarStatusBarErrorTitle');
    }
  }
  let grammarCheckInFlight = false;
  let lastGrammarErrorShown = null; // évite de re-notifier en boucle la même erreur à chaque frappe
  const grammarPopup = document.getElementById('grammarSuggestPopup');

  async function runGrammarCheck() {
    if (!grammarPrefs.enabled || !grammarServerReady) return;
    if (activeType !== 'chapter' || !activeTab) return;
    const editor = document.getElementById('editor');
    if (!editor || grammarCheckInFlight) return;

    grammarCheckInFlight = true;
    try {
      const caretOffset = getCaretCharacterOffsetWithin(editor);
      const hadMarks = clearGrammarMarks(editor);

      const { text, nodes } = getPlainTextWithMap(editor);
      if (text.trim().length > 0) {
        const lang = getLanguage() === 'en' ? 'en-US' : 'fr';
        const matches = await window.api.checkGrammar(text, lang);
        // Le chapitre actif a pu changer pendant l'attente réseau : on
        // n'applique le résultat que s'il correspond toujours à ce qui est affiché.
        if (activeType === 'chapter' && document.getElementById('editor') === editor) {
          applyGrammarMatches(editor, matches, getPlainTextWithMap(editor).nodes);
        }
      }

      if (hadMarks || text.trim().length > 0) {
        try { setCaretPosition(editor, caretOffset); } catch (e) { /* curseur hors texte, on ignore */ }
      }
    } catch (err) {
      console.error('Erreur du correcteur de grammaire :', err);
      // Ancien comportement : alert() natif bloquant. Sur certaines
      // configurations Electron/Windows, une boîte de dialogue native
      // déclenchée depuis un callback asynchrone (ici un debounce, pas un
      // clic direct) peut laisser le focus clavier dans un état incohérent
      // une fois fermée — plus aucun champ ne reçoit la frappe, y compris
      // des champs sans rapport comme les fiches World Building. On utilise
      // donc la modale interne (non bloquante pour le thread JS) à la place.
      // On ne la signale aussi qu'une seule fois par message (pas à chaque
      // frappe), et on coupe la vérification jusqu'au prochain succès pour
      // éviter de marteler un serveur en échec toutes les 1,5s.
      if (lastGrammarErrorShown !== err.message) {
        lastGrammarErrorShown = err.message;
        grammarServerReady = false;
        showInfoModal(t('grammarCheckFailedAlert', { error: err.message }));
      }
    } finally {
      grammarCheckInFlight = false;
    }
  }

  const debouncedGrammarCheck = debounce(runGrammarCheck, 1500);

  // Le processus main prévient le renderer si le serveur LanguageTool meurt
  // après coup (crash, tué manuellement, port repris par un autre process).
  // Sans ça, ce renderer continuait de croire le serveur prêt et la
  // prochaine vérification échouait avec un message confus ("pas démarré")
  // alors qu'il avait bel et bien démarré — c'est ce qui causait l'erreur
  // malgré un statut "actif" affiché juste avant dans les Paramètres.
  // On tente une resynchronisation automatique (relance) plutôt que de
  // rester bloqué en attendant une action manuelle de l'utilisateur.
  window.api.onGrammarServerStopped(() => {
    grammarServerReady = false;
    lastGrammarErrorShown = null;
    updateGrammarStatusBar();
    if (grammarPrefs.enabled) refreshGrammarStatusUI();
  });

  document.getElementById('grammarStatusIndicator').addEventListener('click', () => {
    document.getElementById('grammarSetupModal').style.display = 'flex';
    refreshGrammarStatusUI();
  });

  function hideGrammarPopup() { grammarPopup.style.display = 'none'; grammarPopup.innerHTML = ''; }

  function showGrammarPopup(mark) {
    const message = mark.dataset.message || '';
    let replacements = [];
    try { replacements = JSON.parse(mark.dataset.replacements || '[]'); } catch (e) { /* ignore */ }

    grammarPopup.innerHTML = '';
    const msgEl = document.createElement('div');
    msgEl.className = 'gsp-message';
    msgEl.textContent = message;
    grammarPopup.appendChild(msgEl);

    if (replacements.length === 0) {
      const none = document.createElement('div');
      none.className = 'gsp-message';
      none.style.opacity = '0.6';
      none.textContent = t('grammarNoSuggestions');
      grammarPopup.appendChild(none);
    } else {
      replacements.forEach(rep => {
        const btn = document.createElement('button');
        btn.className = 'gsp-suggestion';
        btn.textContent = rep;
        btn.onclick = () => {
          const parent = mark.parentNode;
          const textNode = document.createTextNode(rep);
          parent.insertBefore(textNode, mark);
          parent.removeChild(mark);
          parent.normalize();
          hideGrammarPopup();
          const editorEl = document.getElementById('editor');
          if (editorEl) {
            projectData.chapters[activeTab] = editorEl.innerHTML;
            setSaveStatus('pending');
            updateStats();
            scheduleHistoryCommit(activeTab, editorEl.innerHTML);
            save();
          }
        };
        grammarPopup.appendChild(btn);
      });
    }

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'gsp-ignore';
    ignoreBtn.textContent = t('grammarIgnoreBtn');
    ignoreBtn.onclick = () => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
      hideGrammarPopup();
    };
    grammarPopup.appendChild(ignoreBtn);

    const rect = mark.getBoundingClientRect();
    grammarPopup.style.display = 'block';
    const popupWidth = grammarPopup.offsetWidth || 280;
    let left = rect.left;
    if (left + popupWidth > window.innerWidth - 10) left = window.innerWidth - popupWidth - 10;
    grammarPopup.style.left = `${Math.max(10, left)}px`;
    grammarPopup.style.top = `${rect.bottom + 6}px`;
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.grammar-error')) return; // géré par le listener dédié ci-dessous
    if (!e.target.closest('.grammar-suggest-popup')) hideGrammarPopup();
  });

  async function refreshGrammarStatusUI() {
    const javaStatusEl = document.getElementById('grammarJavaStatus');
    const javaHintEl = document.getElementById('grammarJavaHint');
    const btnOpenJava = document.getElementById('btnGrammarOpenJava');
    const folderStatusEl = document.getElementById('grammarFolderStatus');
    const messageEl = document.getElementById('grammarStatusMessage');
    if (!javaStatusEl) { updateGrammarStatusBar(); return; }

    messageEl.textContent = t('grammarStatusChecking');
    folderStatusEl.textContent = grammarPrefs.languageToolPath || t('grammarFolderNotSet');

    const javaInfo = await window.api.checkJavaAvailable();
    const javaOk = javaInfo.available && !javaInfo.outdated;

    if (!javaInfo.available) {
      javaStatusEl.textContent = t('grammarJavaMissing');
    } else if (javaInfo.outdated) {
      javaStatusEl.textContent = t('grammarJavaOutdated', { version: javaInfo.major ?? '?' });
    } else {
      javaStatusEl.textContent = t('grammarJavaOk');
    }
    javaHintEl.textContent = javaInfo.outdated ? t('grammarJavaOutdatedHint') : t('grammarJavaMissingHint');
    javaHintEl.style.display = javaOk ? 'none' : 'block';
    btnOpenJava.style.display = javaOk ? 'none' : 'block';

    if (!grammarPrefs.enabled) {
      messageEl.textContent = t('grammarStatusDisabled');
      updateGrammarStatusBar();
      return;
    }
    if (!javaOk || !grammarPrefs.languageToolPath) {
      messageEl.textContent = '';
      updateGrammarStatusBar();
      return;
    }

    messageEl.textContent = t('grammarStatusStarting');
    grammarStarting = true;
    updateGrammarStatusBar();
    try {
      const result = await window.api.startGrammarServer();
      grammarServerReady = true;
      messageEl.textContent = t('grammarStatusReady', { port: result.port });
      debouncedGrammarCheck();
    } catch (err) {
      grammarServerReady = false;
      messageEl.textContent = t('grammarStatusError', { error: err.message });
    } finally {
      grammarStarting = false;
      updateGrammarStatusBar();
    }
  }

  async function setupGrammarChecker() {
    grammarPrefs = await window.api.getGrammarPrefs();

    const enableCheckbox = document.getElementById('grammarEnableCheckbox');
    enableCheckbox.checked = grammarPrefs.enabled;

    async function persistEnabled(value) {
      grammarPrefs = await window.api.saveGrammarPrefs({ enabled: value });
      enableCheckbox.checked = grammarPrefs.enabled;
      if (!grammarPrefs.enabled) {
        grammarServerReady = false;
        const editor = document.getElementById('editor');
        if (editor && clearGrammarMarks(editor)) {
          projectData.chapters[activeTab] = editor.innerHTML;
        }
      }
      await refreshGrammarStatusUI();
    }

    enableCheckbox.addEventListener('change', () => persistEnabled(enableCheckbox.checked));

    // "Configurer…" ouvre le détail technique (Java, dossier LanguageTool,
    // installation) par-dessus la modale Paramètres, qui reste ouverte
    // en-dessous ; la fermer évite d'empiler deux modales visibles à l'écran.
    document.getElementById('btnGrammarConfigure').addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal('settingsModal');
      document.getElementById('grammarSetupModal').style.display = 'flex';
      refreshGrammarStatusUI();
    });

    document.getElementById('closeGrammarSetup').onclick = () => closeModal('grammarSetupModal');
    document.getElementById('btnGrammarRecheck').onclick = () => {
      lastGrammarErrorShown = null;
      refreshGrammarStatusUI();
    };

    document.getElementById('btnGrammarOpenJava').addEventListener('click', () => {
      window.api.openExternalLink('https://www.java.com/fr/download/');
    });

    // --- INSTALLATION AUTOMATIQUE : télécharge + extrait LanguageTool en un
    // clic, sans que l'utilisateur ait à chercher/dézipper quoi que ce soit
    // lui-même. Java reste requis (voir bouton dédié ci-dessus).
    const btnAutoInstall = document.getElementById('btnGrammarAutoInstall');
    const progressWrap = document.getElementById('grammarInstallProgressWrap');
    const progressBar = document.getElementById('grammarInstallProgressBar');
    const progressLabel = document.getElementById('grammarInstallProgressLabel');
    const messageEl = document.getElementById('grammarStatusMessage');

    window.api.onGrammarInstallProgress(({ phase, percent }) => {
      progressWrap.style.display = 'block';
      if (phase === 'download') {
        progressBar.style.width = `${percent}%`;
        progressLabel.textContent = t('grammarInstallDownloading', { percent });
      } else if (phase === 'extract') {
        progressBar.style.width = '100%';
        progressLabel.textContent = t('grammarInstallExtracting');
      }
    });

    btnAutoInstall.addEventListener('click', async () => {
      btnAutoInstall.disabled = true;
      progressWrap.style.display = 'block';
      progressBar.style.width = '0%';
      progressLabel.textContent = '';
      messageEl.textContent = '';

      try {
        await window.api.installLanguageToolAuto();
        progressLabel.textContent = t('grammarInstallDone');
        grammarPrefs = await window.api.saveGrammarPrefs({ enabled: true });
        document.getElementById('grammarEnableCheckbox').checked = true;
        await refreshGrammarStatusUI();
      } catch (err) {
        progressLabel.textContent = t('grammarInstallError', { error: err.message });
      } finally {
        btnAutoInstall.disabled = false;
      }
    });

    document.getElementById('btnGrammarSelectFolder').addEventListener('click', async () => {
      const result = await window.api.selectLanguageToolFolder();
      if (result.canceled) return;
      if (!result.valid) {
        messageEl.textContent = t('grammarInvalidFolder');
        return;
      }
      grammarPrefs = await window.api.getGrammarPrefs();
      await refreshGrammarStatusUI();
    });

    // Clic sur une faute soulignée : affiche les suggestions (comme le
    // menu contextuel natif du correcteur d'orthographe, mais en JS puisque
    // ces marques ne sont pas connues d'Electron).
    document.addEventListener('click', (e) => {
      const mark = e.target.closest('.grammar-error');
      if (mark) { e.stopPropagation(); showGrammarPopup(mark); }
    });

    if (grammarPrefs.enabled) refreshGrammarStatusUI();
  }

  // --- INDICATEUR DE STATUT DE SAUVEGARDE ---
  function setSaveStatus(state) {
    if (!saveStatus) return;
    saveStatus.classList.remove('saved', 'pending', 'error');
    if (state === 'pending') {
      saveStatus.textContent = t('saveStatusPending');
      saveStatus.classList.add('pending');
    } else if (state === 'error') {
      saveStatus.textContent = t('saveStatusError');
      saveStatus.classList.add('error');
    } else {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      saveStatus.textContent = t('saveStatusSavedAt', { time: `${hh}:${mm}` });
      saveStatus.classList.add('saved');
    }
  }

  // --- SAUVEGARDE (fichier disque via electron-store, plus de localStorage) ---
  async function save() {
    // Sécurité: Si on est en train de supprimer (activeTab null), ne pas sauvegarder
    if (!activeTab) return;

    if (activeType === 'chapter' && activeTab) {
      const editor = document.getElementById('editor');
      if (editor) projectData.chapters[activeTab] = editor.innerHTML;
    }
    projects[projectName] = projectData;
    hasUnsavedChangesSinceLastBackup = true;
    recordWritingStats(); // best-effort, ne bloque pas la sauvegarde principale

    try {
      await window.api.saveProjects(projects);

      uiState[projectName] = { openTabs, activeTab, activeType };
      await window.api.saveUiState(uiState);

      setSaveStatus('saved');
    } catch (err) {
      console.error('Échec de la sauvegarde:', err);
      setSaveStatus('error');
      return;
    }

    maybeCreateBackup();
  }

  // Sauvegarde horodatée automatique : ne se déclenche que si assez de temps
  // s'est écoulé ET qu'il y a eu de vraies modifications depuis la dernière.
  async function maybeCreateBackup() {
    if (!hasUnsavedChangesSinceLastBackup) return;
    const now = Date.now();
    if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;

    try {
      await window.api.createBackup(projectName, projectData);
      lastBackupAt = now;
      hasUnsavedChangesSinceLastBackup = false;
    } catch (err) {
      console.error('Échec de la sauvegarde automatique horodatée:', err);
    }
  }

  // --- STATS ---
  function getTotalStats() {
    let totalWords = 0;
    let totalChars = 0;
    Object.values(projectData.chapters).forEach(htmlContent => {
      if (typeof htmlContent === 'string') {
        const plainText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        totalWords += plainText.split(' ').filter(w => w.length > 0).length;
        totalChars += plainText.length;
      }
    });
    return { words: totalWords, chars: totalChars };
  }

  // --- STATISTIQUES D'ÉCRITURE (mots écrits par jour/semaine/mois/année) ---
  // Comptabilisées PAR PROJET (namespace stats.projects[projectName]) : les
  // compter tous projets confondus mélangeait la progression de romans sans
  // rapport entre eux dès qu'on travaillait sur plusieurs à la fois.
  function getStatsBucket(stats) {
    if (!stats.projects) stats.projects = {};
    if (!stats.projects[projectName]) {
      stats.projects[projectName] = { baselineDate: null, baselineWords: 0, history: {}, dailyGoal: null };
    }
    return stats.projects[projectName];
  }

  function getDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // --- OBJECTIF QUOTIDIEN ---
  // Un seul objectif simple (mots/jour) par projet, stocké à côté de
  // l'historique. Affiche la progression du jour courant avec un code
  // couleur (atteint / en cours).
  async function renderStatsGoal() {
    const input = document.getElementById('statsGoalInput');
    const progressEl = document.getElementById('statsGoalProgress');
    let stats;
    try {
      stats = (await window.api.getWritingStats()) || {};
    } catch (err) {
      console.error('Impossible de charger l’objectif quotidien :', err);
      stats = {};
    }
    const bucket = getStatsBucket(stats);

    const goal = bucket.dailyGoal || null;
    input.value = goal ? String(goal) : '';

    if (!goal) {
      progressEl.textContent = '';
      return;
    }

    const todayWords = (bucket.history && bucket.history[getDateKey(new Date())]) || 0;
    const reached = todayWords >= goal;
    progressEl.innerHTML = t('statsGoalProgress', { words: Math.max(0, todayWords), goal });
    progressEl.style.color = reached ? '#10b981' : 'var(--text-muted)';
  }

  // Enregistre la progression du nombre de mots pour la journée en cours,
  // pour LE PROJET COURANT uniquement. Principe : un "baseline" (total de
  // mots au début de la journée) permet de calculer, à tout moment, le
  // solde net écrit aujourd'hui ; l'historique par jour est mis à jour en
  // direct (pas seulement au changement de jour).
  async function recordWritingStats() {
    try {
      const stats = (await window.api.getWritingStats()) || {};
      const bucket = getStatsBucket(stats);

      const todayKey = getDateKey(new Date());
      const currentTotal = getTotalStats().words; // total du projet courant uniquement

      if (bucket.baselineDate !== todayKey) {
        // Premier enregistrement du jour : on fige le solde d'hier (déjà
        // dans l'historique) et on redémarre un nouveau point de référence.
        bucket.baselineDate = todayKey;
        bucket.baselineWords = currentTotal;
        if (bucket.history[todayKey] === undefined) bucket.history[todayKey] = 0;
      } else {
        bucket.history[todayKey] = currentTotal - bucket.baselineWords;
      }

      await window.api.saveWritingStats(stats);
    } catch (err) {
      console.error("Échec de l'enregistrement des statistiques d'écriture:", err);
    }
  }

  // Clé de semaine ISO 8601 (ex: "2026-S36"), pour un regroupement par
  // semaine cohérent quel que soit le jour où l'utilisateur consulte le menu.
  function getIsoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Lundi = 0
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
    const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + firstThursdayDayNum) / 7);
    return `${date.getUTCFullYear()}-S${String(weekNum).padStart(2, '0')}`;
  }

  function formatStatsLabel(key, period) {
    const locale = getLanguage() === 'en' ? 'en-US' : 'fr-FR';
    if (period === 'day') {
      const [y, m, d] = key.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'week') {
      const [y, w] = key.split('-S');
      return `${t('statsWeekPrefix')} ${w} — ${y}`;
    }
    if (period === 'month') {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return key; // année, déjà lisible telle quelle
  }

  async function renderStatsList(period) {
    const list = document.getElementById('statsList');
    list.innerHTML = `<li style="padding:15px; color:var(--text-muted); text-align:center;">${t('loadingStats')}</li>`;

    let stats;
    try {
      stats = (await window.api.getWritingStats()) || {};
    } catch (err) {
      console.error('Impossible de charger les statistiques:', err);
      stats = {};
    }
    const history = getStatsBucket(stats).history || {};

    const buckets = {};
    Object.keys(history).forEach(dayKey => {
      const [y, m, d] = dayKey.split('-').map(Number);
      if (!y || !m || !d) return;
      const date = new Date(y, m - 1, d);

      let bucketKey;
      if (period === 'day') bucketKey = dayKey;
      else if (period === 'week') bucketKey = getIsoWeekKey(date);
      else if (period === 'month') bucketKey = `${y}-${String(m).padStart(2, '0')}`;
      else bucketKey = String(y);

      buckets[bucketKey] = (buckets[bucketKey] || 0) + (history[dayKey] || 0);
    });

    const sortedKeys = Object.keys(buckets).sort().reverse();
    list.innerHTML = '';

    if (sortedKeys.length === 0) {
      list.innerHTML = `<li style="padding:15px; color:var(--text-muted); text-align:center;">${t('statsNoData')}</li>`;
      return;
    }

    sortedKeys.slice(0, 60).forEach(key => {
      const words = buckets[key];
      const li = document.createElement('li');
      li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; cursor:default;';
      const sign = words > 0 ? '+' : '';
      const color = words < 0 ? '#ef4444' : (words > 0 ? '#10b981' : 'var(--text-muted)');
      li.innerHTML = `
        <span>${formatStatsLabel(key, period)}</span>
        <span style="color:${color}; font-weight:600;">${sign}${words} ${t('statsWordsUnit')}</span>
      `;
      list.appendChild(li);
    });
  }

  function updateStats() {
    if (activeType === 'chapter') {
      const editor = document.getElementById('editor');
      if (!editor) return;

      const selection = window.getSelection();
      let words = 0;
      let chars = 0;
      let isSelected = false;

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();
        if (selectedText) {
          isSelected = true;
          words = selectedText.split(/\s+/).filter(Boolean).length;
          chars = selectedText.length;
        }
      }

      if (!isSelected) {
        const text = editor.innerText.trim();
        words = text === "" ? 0 : text.split(/\s+/).filter(Boolean).length;
        chars = text.length;
      }

      const total = getTotalStats();
      stats.textContent = isSelected
        ? t('statsSelected', { words, chars, total: total.words })
        : t('statsNormal', { words, chars, total: total.words });
      return;
    }
    stats.textContent = t('statsSheetMode');
  }

  // --- RENDER ---
  function renderEditorContent() {
    detachSelectionChangeHandler();
    editorContainer.innerHTML = '';
    if (!activeTab) return;

    if (activeType === 'chapter') {
      const div = document.createElement('div');
      div.id = 'editor';
      div.contentEditable = "true";
      div.spellcheck = nativeSpellcheckEnabled;
      div.setAttribute('placeholder', 'Écrivez votre histoire...');
      div.innerHTML = projectData.chapters[activeTab] || '';
      div.style.zoom = editorZoom;
      editHistory.sync(activeTab, div.innerHTML);
      largeChapterHighlightCounter = 0;

      div.addEventListener('input', () => {
        if (activeTab) projectData.chapters[activeTab] = div.innerHTML;
        setSaveStatus('pending');
        updateStats();
        scheduleHistoryCommit(activeTab, div.innerHTML);
        debouncedHighlight();
        debouncedSave();
        debouncedGrammarCheck();
      });

      div.addEventListener('click', (e) => {
        const mention = e.target.closest('.wb-mention');
        if (mention) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            const wbKey = mention.dataset.wbKey;
            if (projectData.world[wbKey]) {
              openItem(wbKey, 'world');
            } else {
              showInfoModal(t('itemNotFound'));
              cleanInvalidMentions(div, Object.keys(projectData.world));
            }
          }
        }
      });

      // --- SÉCURITÉ : désinfection du contenu collé ---
      // Le presse-papiers peut contenir du HTML copié depuis n'importe quelle
      // page web (potentiellement piégé : gestionnaires d'événements, scripts).
      // On le fait désinfecter par le processus principal avant insertion.
      div.addEventListener('paste', async (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const plain = e.clipboardData.getData('text/plain');

        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let toInsert;

        if (html) {
          try {
            toInsert = await window.api.sanitizeHtml(html);
          } catch (err) {
            console.error('Échec de la désinfection du collage, repli en texte brut:', err);
            toInsert = escapeHtml(plain).replace(/\n/g, '<br>');
          }
        } else {
          toInsert = escapeHtml(plain).replace(/\n/g, '<br>');
        }

        document.execCommand('insertHTML', false, toInsert);
      });

      editorContainer.appendChild(div);
      highlightWorldBuilding();
      syncMentionColors(div, activeTab);
      debouncedGrammarCheck();
      updateStats();
      updateUndoRedoButtons();

      activeSelectionChangeHandler = () => { if (activeType === 'chapter') updateStats(); };
      document.addEventListener('selectionchange', activeSelectionChangeHandler);
      div.addEventListener('blur', detachSelectionChangeHandler);

    } else if (activeType === 'world') {
      const data = projectData.world[activeTab];
      if (!data) return;

      const template = getEffectiveWbTemplates()[data.wbType];
      const container = document.createElement('div');
      container.className = 'wb-container';

      container.innerHTML = `
        <div class="wb-header">
          <div class="wb-icon-picker-container">
            <button type="button" id="wbIconBtn" class="wb-icon-btn" title="${t('wbIconInputTitle')}">${escapeHtmlAttr(data.icon || template.icon)}</button>
            <div id="wbIconPicker" class="wb-icon-picker dropdown-menu"></div>
          </div>
          <input type="text" id="wbNameInput_live" class="wb-title-input" value="${escapeHtmlAttr(activeTab)}">
          <label class="wb-color-label" title="${t('wbColorLabel')}">
            <input type="color" id="wbColorInput" value="${escapeHtmlAttr(getWbColor(data))}">
          </label>
          <button type="button" id="wbReadModeBtn" class="wb-readmode-btn ${wbReadMode ? 'active' : ''}" title="${t('wbReadModeTitle')}">
            ${wbReadMode ? '🔒' : '👁'} <span data-i18n="wbReadModeLabel">${t('wbReadModeLabel')}</span>
          </button>
        </div>
        <div id="wbFormFields"></div>
        <div id="wbMentionsSection"></div>
      `;

      container.querySelector('#wbReadModeBtn').addEventListener('click', () => {
        wbReadMode = !wbReadMode;
        renderEditorContent();
      });

      const fieldsContainer = container.querySelector('#wbFormFields');
      const isCustomWbType = !!(projectData.customWbTypes && projectData.customWbTypes[data.wbType]);

      template.fields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'wb-form-group';
        const label = document.createElement('label');
        label.className = 'wb-label';
        // Champs intégrés : libellé traduit (FR/EN) via i18n. Champs des
        // types personnalisés : libellé tel que saisi par l'utilisateur à la
        // création du type (texte libre propre à ce projet, pas une chaîne
        // d'interface à traduire).
        label.textContent = isCustomWbType ? field.label : t(`wbField_${field.key}`);

        let input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
        if (field.type !== 'textarea') input.type = 'text';
        input.className = field.type === 'textarea' ? 'wb-textarea' : 'wb-input';
        input.value = data.content[field.key] || '';
        input.readOnly = wbReadMode;
        input.addEventListener('input', () => {
          projectData.world[activeTab].content[field.key] = input.value;
          setSaveStatus('pending');
          save();
        });

        group.appendChild(label);
        group.appendChild(input);
        fieldsContainer.appendChild(group);
      });

      // --- Icône : bouton qui ouvre un panneau d'emojis courants, + un champ
      // libre pour tout emoji/texte non listé (le clavier système fonctionne
      // aussi directement dans ce champ, ex: Win+. sous Windows).
      const iconBtn = container.querySelector('#wbIconBtn');
      const iconPicker = container.querySelector('#wbIconPicker');
      iconBtn.disabled = wbReadMode;

      function setWbIcon(value) {
        projectData.world[activeTab].icon = value;
        iconBtn.textContent = value;
        setSaveStatus('pending');
        save();
        renderSidebar();
        renderTabs();
      }

      setupEmojiPicker(iconBtn, iconPicker, setWbIcon);

      // --- Nom (renommage direct depuis la fiche, réutilise performRename) ---
      const nameInput = container.querySelector('#wbNameInput_live');
      nameInput.readOnly = wbReadMode;
      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });
      nameInput.addEventListener('change', async () => {
        const oldName = activeTab;
        const ok = await performRename(oldName, nameInput.value, 'world');
        if (ok) {
          renderEditorContent(); // le nom (donc activeTab) a changé : on regénère la fiche avec le bon état
        } else {
          nameInput.value = oldName; // renommage refusé (nom vide/existant déjà, ou annulé) : on restaure l'affichage
        }
      });

      // --- Couleur de surlignage dans les chapitres ---
      const wbColorInputEl = container.querySelector('#wbColorInput');
      wbColorInputEl.disabled = wbReadMode;
      wbColorInputEl.addEventListener('input', (e) => {
        projectData.world[activeTab].color = e.target.value;
        wbColorVersion++; // invalide le cache de resynchro : tous les chapitres seront revérifiés à leur prochaine ouverture
        setSaveStatus('pending');
        save();
      });

      // --- Chapitres où cet élément est mentionné, avec accès direct ---
      const mentionsSection = container.querySelector('#wbMentionsSection');
      const chaptersWithMention = getChaptersContaining(activeTab);
      const mentionsGroup = document.createElement('div');
      mentionsGroup.className = 'wb-form-group';
      const mentionsLabel = document.createElement('label');
      mentionsLabel.className = 'wb-label';
      mentionsLabel.textContent = t('wbMentionedInLabel');
      mentionsGroup.appendChild(mentionsLabel);

      if (chaptersWithMention.length === 0) {
        const none = document.createElement('div');
        none.style.cssText = 'color:var(--text-muted); font-size:13px;';
        none.textContent = t('wbMentionedInNone');
        mentionsGroup.appendChild(none);
      } else {
        const list = document.createElement('div');
        list.className = 'wb-mentioned-chapters';
        chaptersWithMention.forEach(chapName => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wb-mentioned-chapter-btn';
          btn.textContent = `📖 ${chapName}`;
          btn.addEventListener('click', () => openItem(chapName, 'chapter'));
          list.appendChild(btn);
        });
        mentionsGroup.appendChild(list);
      }
      mentionsSection.appendChild(mentionsGroup);

      editorContainer.appendChild(container);
      updateStats();
      updateUndoRedoButtons();
    }
  }

  function renderTabs() {
    tabsBar.innerHTML = '';
    openTabs.forEach((item, i) => {
      const tab = document.createElement('div');
      const isActive = (item.name === activeTab && item.type === activeType);

      let icon = '';
      if (item.type === 'world') {
        const wbItem = projectData.world[item.name];
        if (wbItem) icon = (wbItem.icon || getEffectiveWbTemplates()[wbItem.wbType].icon) + ' ';
      }

      tab.className = `tab ${isActive ? 'active' : ''}`;
      tab.innerHTML = `<span>${icon}${item.name}</span> <span class="close-tab" title="Fermer">×</span>`;
      tab.setAttribute('draggable', true);
      tab.dataset.index = i;
      tab.tabIndex = 0;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-label', `Onglet ${item.name}`);

      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(item.name, item.type); }
        if (e.key === 'Delete') { e.preventDefault(); closeTab(i); }
      });

      tab.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(i);
        } else if (e.button === 0) {
          if (e.target.classList.contains('close-tab')) {
            e.stopPropagation();
            closeTab(i);
          } else {
            switchTab(item.name, item.type);
          }
        }
      });

      tab.addEventListener('dragstart', (e) => { draggedTab = i; e.dataTransfer.effectAllowed = 'move'; tab.classList.add('dragging'); });
      tab.addEventListener('dragend', () => { tab.classList.remove('dragging'); draggedTab = null; });
      tab.addEventListener('dragover', (e) => e.preventDefault());
      tab.addEventListener('drop', (e) => {
        e.stopPropagation();
        if (draggedTab !== null && draggedTab !== i) {
          const movedItem = openTabs.splice(draggedTab, 1)[0];
          openTabs.splice(i, 0, movedItem);
          save(); renderTabs();
        }
      });

      tabsBar.appendChild(tab);
    });
  }

  function switchTab(name, type) {
    if (activeTab === name && activeType === type) return;
    save();
    activeTab = name;
    activeType = type;
    renderEditorContent();
    renderTabs();
    renderSidebar();
  }

  async function closeTab(index) {
    const closed = openTabs[index];
    if (!closed) return;

    await save();

    // Si la dernière sauvegarde a échoué (écriture disque en erreur, voir
    // setSaveStatus('error')), fermer l'onglet sans rien dire ferait perdre
    // silencieusement le texte non écrit sur disque. On demande confirmation
    // avant de continuer plutôt que de fermer à l'aveugle.
    if (saveStatus.classList.contains('error')) {
      if (!(await showConfirmModal(t('closeTabUnsavedWarning', { name: closed.name })))) return;
    }

    openTabs.splice(index, 1);

    if (activeTab === closed.name && activeType === closed.type) {
      if (openTabs.length > 0) {
        const nextIndex = Math.max(0, index - 1);
        const next = openTabs[nextIndex];
        activeTab = next.name;
        activeType = next.type;
      } else {
        activeTab = null;
      }
      renderEditorContent();
    }
    renderTabs();
    save();
  }

  function openItem(name, type) {
    const existing = openTabs.find(t => t.name === name && t.type === type);
    if (!existing) openTabs.push({ name, type });
    switchTab(name, type);
  }

  function renderSidebar() {
    chapterList.innerHTML = '';
    Object.keys(projectData.chapters).forEach(name => {
      chapterList.appendChild(createSidebarItem(name, 'chapter'));
    });

    wbList.innerHTML = '';
    Object.keys(projectData.world).forEach(name => {
      const data = projectData.world[name];
      const icon = data.icon || getEffectiveWbTemplates()[data.wbType].icon;
      wbList.appendChild(createSidebarItem(name, 'world', icon));
    });
  }

  let itemToRename = null;
  function createSidebarItem(name, type, iconStr = '') {
    const li = document.createElement('li');
    if (activeTab === name && activeType === type) li.className = 'current';

    li.innerHTML = `
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${iconStr ? '<span class="item-icon">' + iconStr + '</span>' : ''} ${name}
      </span>
      <div class="item-actions">
        <button class="rename-btn" title="Renommer">✏️</button>
        <button class="delete-btn" title="Supprimer">🗑</button>
      </div>
    `;

    li.draggable = true;
    li.dataset.name = name;
    li.dataset.type = type;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${type === 'chapter' ? 'Chapitre' : 'Fiche'} : ${name}`);

    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(name, type); }
    });

    li.addEventListener('dragstart', (e) => {
      draggedSidebarItem = li;
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });

    li.addEventListener('dragend', () => { li.classList.remove('dragging'); draggedSidebarItem = null; });
    li.addEventListener('click', () => openItem(name, type));

    li.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      itemToRename = { oldName: name, type: type };
      document.getElementById('renameInput').value = name;
      document.getElementById('renameModal').style.display = 'flex';
    });

    // --- SUPPRESSION SÉCURISÉE ---
    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await showConfirmModal(t('confirmDeleteItem', { name }))) {

        if (activeTab === name && activeType === type) {
          activeTab = null;
          editorContainer.innerHTML = '';
        }

        if (type === 'chapter') {
          delete projectData.chapters[name];
          editHistory.remove(name);
          // Retire ce chapitre de l'index sans rescanner tout le projet : il
          // suffit de le retirer du Set de chaque fiche qui le mentionnait.
          wbMentionIndex.forEach(set => set.delete(name));
          chapterOrderMap.delete(name);
        } else {
          delete projectData.world[name];
          Object.keys(projectData.chapters).forEach(chapName => {
            let html = projectData.chapters[chapName];
            if (html && typeof html === 'string') {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              const mentions = tempDiv.querySelectorAll(`.wb-mention[data-wb-key="${name.replace(/"/g, '\\"')}"]`);
              mentions.forEach(m => {
                const parent = m.parentNode;
                while (m.firstChild) parent.insertBefore(m.firstChild, m);
                parent.removeChild(m);
              });
              projectData.chapters[chapName] = tempDiv.innerHTML;
            }
          });
          // La fiche n'existe plus : son entrée d'index (quels chapitres la
          // mentionnaient) n'a plus de sens, simple suppression O(1).
          wbMentionIndex.delete(name.toLowerCase());
        }

        const idx = openTabs.findIndex(t => t.name === name && t.type === type);
        if (idx !== -1) {
          openTabs.splice(idx, 1);
          if (!activeTab && openTabs.length > 0) {
            const next = openTabs[Math.max(0, idx - 1)];
            activeTab = next.name;
            activeType = next.type;
          }
        }

        save();
        renderSidebar();
        renderTabs();
        if (activeTab) renderEditorContent();
      }
    });

    return li;
  }

  // --- REDIMENSIONNEMENT DES PANNEAUX (façon Premiere Pro) ---
  // Sidebar entière (largeur) et sections Chapitres/World Building (hauteur
  // relative), ajustables par glisser-déposer sur leurs poignées dédiées.
  function setupPanelResize() {
    // Point unique d'activation/désactivation du mode "redimensionnement" :
    // pose/retire la classe CSS (voir style.css) plutôt qu'un style inline,
    // et est appelé depuis plusieurs filets de sécurité (mouseup, mais aussi
    // mousemove si le bouton s'avère relâché sans qu'on ait reçu l'event, et
    // blur de la fenêtre) pour qu'on ne reste JAMAIS bloqué en "sélection de
    // texte désactivée" si un mouseup est manqué (ex: relâché hors fenêtre).
    function endAnyResize() {
      resizingSidebar = false;
      resizingSections = false;
      if (sidebarHandle) sidebarHandle.classList.remove('dragging');
      if (sectionsHandle) sectionsHandle.classList.remove('dragging');
      document.body.classList.remove('resizing-panel');
    }

    const sidebar = document.getElementById('sidebar');
    const sidebarHandle = document.getElementById('sidebarResizeHandle');
    const SIDEBAR_MIN = 160;
    const SIDEBAR_MAX = 500;

    const sectionChapters = document.getElementById('sectionChapters');
    const sectionsHandle = document.getElementById('sidebarSectionsResizeHandle');
    const SECTION_MIN = 60;

    let resizingSidebar = false;
    let resizingSections = false;

    if (sidebar && sidebarHandle) {
      sidebarHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizingSidebar = true;
        sidebarHandle.classList.add('dragging');
        document.body.classList.add('resizing-panel');
      });
    }

    if (sectionChapters && sectionsHandle) {
      sectionsHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizingSections = true;
        sectionsHandle.classList.add('dragging');
        document.body.classList.add('resizing-panel');
        sectionChapters.style.flex = '0 0 auto';
      });
    }

    window.addEventListener('mousemove', (e) => {
      if (!resizingSidebar && !resizingSections) return;

      // Filet de sécurité : si le bouton gauche n'est plus enfoncé (bit 1 de
      // e.buttons) c'est qu'un mouseup a eu lieu sans être capté (relâché
      // hors de la fenêtre par ex.) — on arrête proprement au lieu de rester
      // bloqué en mode "redimensionnement".
      if ((e.buttons & 1) === 0) { endAnyResize(); return; }

      if (resizingSidebar) {
        const rect = sidebar.getBoundingClientRect();
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - rect.left));
        document.body.style.setProperty('--sidebar-width', newWidth + 'px');
      }

      if (resizingSections) {
        const parentRect = sectionChapters.parentElement.getBoundingClientRect();
        const maxHeight = parentRect.height - SECTION_MIN - sectionsHandle.offsetHeight;
        const newHeight = Math.min(maxHeight, Math.max(SECTION_MIN, e.clientY - parentRect.top));
        sectionChapters.style.height = newHeight + 'px';
      }
    });

    window.addEventListener('mouseup', endAnyResize);
    window.addEventListener('blur', endAnyResize);
    document.addEventListener('mouseleave', endAnyResize);
  }

  function setupSidebarDrag() {
    [chapterList, wbList].forEach(list => {
      list.addEventListener('dragover', (e) => e.preventDefault());
      list.addEventListener('drop', (e) => {
        e.preventDefault();
        const typeExpected = list.id === 'chapterList' ? 'chapter' : 'world';
        if (!draggedSidebarItem || draggedSidebarItem.dataset.type !== typeExpected) return;
        const targetLi = e.target.closest('li');
        if (!targetLi || targetLi === draggedSidebarItem) return;

        const children = Array.from(list.children);
        const fromIdx = children.indexOf(draggedSidebarItem);
        const toIdx = children.indexOf(targetLi);
        const moved = children.splice(fromIdx, 1)[0];
        children.splice(toIdx, 0, moved);
        list.innerHTML = '';
        children.forEach(c => list.appendChild(c));

        const newOrder = children.map(li => li.dataset.name);
        const newDataObj = {};
        if (typeExpected === 'chapter') {
          newOrder.forEach(k => newDataObj[k] = projectData.chapters[k]);
          projectData.chapters = newDataObj;
          rebuildChapterOrderMap();
        } else {
          newOrder.forEach(k => newDataObj[k] = projectData.world[k]);
          projectData.world = newDataObj;
        }
        save(); renderSidebar();
      });
    });
  }

  // --- MODALES ---
  function closeModal(id) { document.getElementById(id).style.display = 'none'; }

  document.getElementById('btnNewChapter').onclick = () => {
    // Nom par défaut pré-rempli (comme pour un nouveau projet) : si
    // l'utilisateur valide directement avec Entrée sans le modifier, le
    // chapitre est créé sous ce nom plutôt que de ne rien faire.
    const chapterCount = Object.keys(projectData.chapters).length;
    const input = document.getElementById('chapterNameInput');
    input.value = `${t('defaultChapterName')} ${chapterCount + 1}`;
    document.getElementById('addChapterModal').style.display = 'flex';
    input.focus();
    input.select();
  };
  document.getElementById('cancelChapter').onclick = () => closeModal('addChapterModal');
  document.getElementById('confirmChapter').onclick = () => {
    const name = document.getElementById('chapterNameInput').value.trim();
    if (name && !projectData.chapters[name]) {
      projectData.chapters[name] = "";
      rebuildChapterOrderMap();
      save(); renderSidebar(); openItem(name, 'chapter');
      closeModal('addChapterModal');
    }
  };

  let wbTypeToCreate = null;

  function openNewItemModalForType(type) {
    wbTypeToCreate = type;
    const customDef = projectData.customWbTypes[type];
    const typeLabel = customDef ? customDef.label : t(`wbLabel_${type}`);
    document.getElementById('wbModalTitle').textContent = t('newWBModalTitle', { type: typeLabel });
    document.getElementById('wbNameInput').value = '';
    document.getElementById('addWBModal').style.display = 'flex';
  }

  // Factorisé pour être appliqué aussi bien aux 4 entrées de types intégrés
  // (statiques dans le HTML) qu'aux types personnalisés (injectés en JS,
  // voir renderWbMenu) : mêmes clics, même activation clavier.
  function wireWbMenuItemClick(item) {
    item.tabIndex = 0;
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } });
    item.onclick = () => openNewItemModalForType(item.dataset.type);
  }
  document.querySelectorAll('.wb-menu-item[data-type]').forEach(wireWbMenuItemClick);

  // Injecte les types personnalisés de ce projet dans le menu "+", entre les
  // 4 types intégrés et "Nouveau type…", chacun avec des actions ✏️/🗑
  // (mêmes principes que les actions de la sidebar : révélées au survol ou
  // au focus clavier). Rappelé après création/modification/suppression d'un
  // type pour que le menu reflète immédiatement l'état courant.
  function buildWbMenuRow(key, def) {
    const row = document.createElement('div');
    row.className = 'wb-menu-item wb-menu-item-custom';
    row.dataset.typeKey = key;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'wb-menu-item-main';
    item.dataset.type = key;
    item.innerHTML = `${escapeHtmlAttr(def.icon || '📁')} <span>${escapeHtmlAttr(def.label)}</span>`;
    wireWbMenuItemClick(item);

    const actions = document.createElement('div');
    actions.className = 'wb-menu-item-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.title = t('customTypeEditTitle');
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openCustomTypeModalForEdit(key); });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.title = t('customTypeDeleteTitle');
    deleteBtn.textContent = '🗑';
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCustomType(key, def); });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    row.appendChild(item);
    row.appendChild(actions);
    return row;
  }

  // Reconstruction complète : utilisée pour le premier rendu et au
  // changement de langue (où de toute façon TOUTES les entrées ont besoin
  // d'être retraduites, donc un rebuild complet n'ajoute rien de superflu).
  function renderWbMenu() {
    const container = document.getElementById('wbCustomTypeMenuItems');
    container.innerHTML = '';
    Object.entries(projectData.customWbTypes || {}).forEach(([key, def]) => {
      container.appendChild(buildWbMenuRow(key, def));
    });
  }
  renderWbMenu();

  // Mise à jour ciblée : n'affecte que l'entrée concernée (créée, modifiée
  // ou retirée), sans reconstruire tout le menu à chaque création/édition/
  // suppression de type — utile dès qu'un projet accumule plusieurs types
  // personnalisés.
  function addOrUpdateWbMenuEntry(key, def) {
    const container = document.getElementById('wbCustomTypeMenuItems');
    const existing = container.querySelector(`[data-type-key="${key}"]`);
    const freshRow = buildWbMenuRow(key, def);
    if (existing) existing.replaceWith(freshRow); else container.appendChild(freshRow);
  }
  function removeWbMenuEntry(key) {
    const container = document.getElementById('wbCustomTypeMenuItems');
    const existing = container.querySelector(`[data-type-key="${key}"]`);
    if (existing) existing.remove();
  }

  document.getElementById('cancelWB').onclick = () => closeModal('addWBModal');
  document.getElementById('confirmWB').onclick = () => {
    const name = document.getElementById('wbNameInput').value.trim();
    if (name && !projectData.world[name]) {
      projectData.world[name] = { wbType: wbTypeToCreate, content: {} };
      addMentionIndexEntryForNewItem(name);
      save(); renderSidebar(); openItem(name, 'world');
      closeModal('addWBModal');
      if (activeType === 'chapter') highlightWorldBuilding();
    }
  };

  // --- CRÉATION / MODIFICATION / SUPPRESSION D'UN TYPE DE FICHE PERSONNALISÉ ---
  function slugify(str, fallback) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
  }

  // `presetKey`, quand fourni (mode édition), est réutilisé tel quel pour ne
  // pas faire perdre le contenu déjà saisi par les fiches existantes de ce
  // type ; sans lui (nouveau champ), une clé est générée à la validation.
  function addCustomTypeFieldRow(presetLabel = '', presetType = 'text', presetKey = '') {
    const list = document.getElementById('customTypeFieldsList');
    const row = document.createElement('div');
    row.className = 'custom-type-field-row';
    row.dataset.key = presetKey;
    row.innerHTML = `
      <input type="text" class="custom-type-field-label" placeholder="${t('customTypeFieldLabelPlaceholder')}" value="${escapeHtmlAttr(presetLabel)}">
      <select class="custom-type-field-type">
        <option value="text">${t('customTypeFieldTypeText')}</option>
        <option value="textarea">${t('customTypeFieldTypeTextarea')}</option>
      </select>
      <button type="button" class="btn-remove-field" title="${t('customTypeRemoveFieldTitle')}">✕</button>
    `;
    row.querySelector('.custom-type-field-type').value = presetType;
    row.querySelector('.btn-remove-field').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  document.getElementById('btnAddCustomTypeField').addEventListener('click', () => addCustomTypeFieldRow());

  // null = création d'un nouveau type ; sinon, clé interne du type en cours de modification.
  let editingCustomTypeSlug = null;
  let customTypeIconValue = '📁';

  const customTypeIconBtn = document.getElementById('customTypeIconBtn');
  setupEmojiPicker(customTypeIconBtn, document.getElementById('customTypeIconPicker'), (icon) => {
    customTypeIconValue = icon;
    customTypeIconBtn.textContent = icon;
  });

  function resetCustomTypeModalFields() {
    document.getElementById('customTypeNameInput').value = '';
    customTypeIconValue = '📁';
    customTypeIconBtn.textContent = '📁';
    document.getElementById('customTypeColorInput').value = '#94a3b8';
    document.getElementById('customTypeFieldsList').innerHTML = '';
  }

  document.getElementById('btnNewCustomWbType').addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => m.classList.remove('show'));
    editingCustomTypeSlug = null;
    document.getElementById('customTypeModalTitleText').textContent = t('customTypeModalTitle');
    document.getElementById('confirmCustomWbType').textContent = t('create');
    resetCustomTypeModalFields();
    addCustomTypeFieldRow(t('customTypeDefaultFieldLabel'), 'textarea');
    document.getElementById('customWbTypeModal').style.display = 'flex';
  });

  // Ouvre la même modale pré-remplie avec les valeurs existantes, pour
  // modifier un type déjà créé (nom, icône, couleur, champs).
  function openCustomTypeModalForEdit(slug) {
    document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => m.classList.remove('show'));
    const def = projectData.customWbTypes[slug];
    if (!def) return;

    editingCustomTypeSlug = slug;
    document.getElementById('customTypeModalTitleText').textContent = t('customTypeEditModalTitle');
    document.getElementById('confirmCustomWbType').textContent = t('save');
    resetCustomTypeModalFields();
    document.getElementById('customTypeNameInput').value = def.label;
    customTypeIconValue = def.icon || '📁';
    customTypeIconBtn.textContent = customTypeIconValue;
    document.getElementById('customTypeColorInput').value = def.defaultColor || '#94a3b8';
    (def.fields || []).forEach(f => addCustomTypeFieldRow(f.label, f.type, f.key));
    document.getElementById('customWbTypeModal').style.display = 'flex';
  }

  // Suppression bloquée tant que des fiches existantes utilisent ce type,
  // pour ne jamais laisser une fiche pointer vers un type qui n'existe plus.
  // La liste des fiches concernées est cliquable : chacune ouvre directement
  // la fiche en question, plutôt que de simplement en donner le nombre.
  async function deleteCustomType(slug, def) {
    const itemsUsingType = Object.keys(projectData.world).filter(name => projectData.world[name].wbType === slug);
    if (itemsUsingType.length > 0) {
      showInfoModal(
        t('customTypeDeleteBlocked', { count: itemsUsingType.length, label: def.label }),
        itemsUsingType.map(name => ({ label: `${def.icon || '📁'} ${name}`, onClick: () => openItem(name, 'world') }))
      );
      return;
    }
    if (!(await showConfirmModal(t('customTypeConfirmDelete', { label: def.label })))) return;

    delete projectData.customWbTypes[slug];
    customWbTypesVersion++;
    save();
    removeWbMenuEntry(slug);
  }

  document.getElementById('cancelCustomWbType').onclick = () => closeModal('customWbTypeModal');

  document.getElementById('confirmCustomWbType').onclick = () => {
    const label = document.getElementById('customTypeNameInput').value.trim();
    if (!label) { showInfoModal(t('customTypeNameRequired')); return; }

    const icon = customTypeIconValue || '📁';
    const defaultColor = document.getElementById('customTypeColorInput').value;

    const rawFields = Array.from(document.querySelectorAll('#customTypeFieldsList .custom-type-field-row'))
      .map(row => ({
        label: row.querySelector('.custom-type-field-label').value.trim(),
        type: row.querySelector('.custom-type-field-type').value,
        existingKey: row.dataset.key || ''
      }))
      .filter(f => f.label);

    if (rawFields.length === 0) { showInfoModal(t('customTypeFieldsRequired')); return; }

    // Deux champs avec le même libellé généreraient des clés distinctes
    // (via désambiguïsation _2, _3...) sans que rien ne le signale, ce qui
    // porterait à confusion sur la fiche elle-même (deux champs affichant le
    // même nom). On bloque plutôt que de deviner une intention.
    const labelCounts = new Map();
    rawFields.forEach(f => {
      const key = f.label.toLowerCase();
      labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
    });
    const duplicateLabel = rawFields.find(f => labelCounts.get(f.label.toLowerCase()) > 1);
    if (duplicateLabel) { showInfoModal(t('customTypeDuplicateField', { label: duplicateLabel.label })); return; }

    // Clés de champ : celles déjà existantes (mode édition) sont réutilisées
    // telles quelles pour préserver le contenu déjà saisi par les fiches de
    // ce type ; seuls les champs nouvellement ajoutés reçoivent une clé
    // fraîche, slugifiée à partir de leur libellé.
    const usedKeys = new Set(rawFields.map(f => f.existingKey).filter(Boolean));
    const fields = rawFields.map(f => {
      if (f.existingKey) return { key: f.existingKey, label: f.label, type: f.type };
      let key = slugify(f.label, 'champ');
      let uniqueKey = key, j = 2;
      while (usedKeys.has(uniqueKey)) { uniqueKey = `${key}_${j}`; j++; }
      usedKeys.add(uniqueKey);
      return { key: uniqueKey, label: f.label, type: f.type };
    });

    const wasEditing = !!editingCustomTypeSlug;
    let finalSlug = editingCustomTypeSlug;

    if (editingCustomTypeSlug) {
      projectData.customWbTypes[editingCustomTypeSlug] = { label, icon, defaultColor, fields };
    } else {
      // Clé interne unique pour ce nouveau type (base = nom slugifié, désambiguïsée si collision).
      const baseSlug = 'custom_' + slugify(label, 'type');
      finalSlug = baseSlug;
      let i = 2;
      while (projectData.customWbTypes[finalSlug]) { finalSlug = `${baseSlug}_${i}`; i++; }
      projectData.customWbTypes[finalSlug] = { label, icon, defaultColor, fields };
    }
    customWbTypesVersion++;

    save();
    addOrUpdateWbMenuEntry(finalSlug, projectData.customWbTypes[finalSlug]);
    renderSidebar(); // les icônes/couleurs de fiches existantes de ce type ont pu changer
    renderTabs();
    // La fiche actuellement affichée peut être justement de ce type : sans
    // ça, son icône/ses champs resteraient périmés jusqu'au prochain
    // changement d'onglet.
    if (activeType === 'world' && activeTab && projectData.world[activeTab] && projectData.world[activeTab].wbType === finalSlug) {
      renderEditorContent();
    }
    closeModal('customWbTypeModal');
    editingCustomTypeSlug = null;

    // À la création (pas à la modification), enchaîne directement sur la
    // création d'une première fiche de ce nouveau type, plutôt que de faire
    // rouvrir le menu à l'utilisateur.
    if (!wasEditing) openNewItemModalForType(finalSlug);
  };

  document.getElementById('cancelRename').onclick = () => closeModal('renameModal');
  // Factorisé pour être appelable aussi bien depuis la modale de renommage
  // (sidebar) que directement depuis le champ "Nom" d'une fiche World
  // Building (voir renderEditorContent, branche 'world').
  async function performRename(oldName, newName, type) {
    newName = newName.trim();
    if (!newName || newName === oldName) return false;

    if (type === 'chapter') {
      if (projectData.chapters[newName]) { showInfoModal(t('alreadyExists')); return false; }
      projectData.chapters[newName] = projectData.chapters[oldName];
      delete projectData.chapters[oldName];
      editHistory.rename(oldName, newName);
    } else {
      if (projectData.world[newName]) { showInfoModal(t('alreadyExists')); return false; }

      // Renommer une fiche réécrit aussi son nom partout où il apparaît dans
      // le texte des chapitres (pour garder le récit cohérent) : un
      // changement bien plus large qu'un simple renommage de fiche, donc on
      // prévient avant de le faire silencieusement — surtout que ça ne
      // touche pas qu'aux mentions déjà surlignées, mais à toute occurrence
      // du mot dans le texte.
      const affectedChapters = getChaptersContaining(oldName);
      if (affectedChapters.length > 0) {
        const proceed = await showConfirmModal(t('renameWbMentionsWarning', { oldName, newName, count: affectedChapters.length }));
        if (!proceed) return false;
      }

      projectData.world[newName] = projectData.world[oldName];
      delete projectData.world[oldName];
      if (affectedChapters.length > 0) renameWorldMentionsAcrossChapters(oldName, newName);
    }

    const tab = openTabs.find(t => t.name === oldName && t.type === type);
    if (tab) tab.name = newName;
    if (activeTab === oldName && activeType === type) activeTab = newName;

    if (type === 'chapter') {
      // Le texte ne change pas, seul le nom du chapitre change : on migre sa
      // clé dans chaque Set de l'index plutôt que de tout reparcourir.
      wbMentionIndex.forEach(set => { if (set.has(oldName)) { set.delete(oldName); set.add(newName); } });
      const order = chapterOrderMap.get(oldName);
      chapterOrderMap.delete(oldName);
      if (order !== undefined) chapterOrderMap.set(newName, order);
    } else {
      // L'ensemble des chapitres qui mentionnent cette fiche ne change pas
      // (le texte a été remplacé 1:1 dans exactement les mêmes chapitres,
      // voir renameWorldMentionsAcrossChapters ci-dessus) : on migre juste la
      // clé de la fiche dans l'index, sans reparcourir aucun texte.
      const oldKey = oldName.toLowerCase(), newKey = newName.toLowerCase();
      const set = wbMentionIndex.get(oldKey);
      wbMentionIndex.delete(oldKey);
      wbMentionIndex.set(newKey, set || new Set());
    }

    // Si un chapitre est affiché, son HTML stocké a pu changer (mention
    // renommée) : on doit rafraîchir l'éditeur AVANT save(), sinon save()
    // écraserait ce changement avec le contenu encore affiché à l'écran
    // (qui, lui, contient toujours l'ancien nom).
    if (activeType === 'chapter' && activeTab) {
      const editor = document.getElementById('editor');
      if (editor) {
        editor.innerHTML = projectData.chapters[activeTab] || '';
        highlightWorldBuilding();
        editHistory.resyncOnly(activeTab, editor.innerHTML);
        updateStats();
      }
    }

    save(); renderSidebar(); renderTabs();
    return true;
  }

  document.getElementById('confirmRename').onclick = async () => {
    const newName = document.getElementById('renameInput').value;
    await performRename(itemToRename.oldName, newName, itemToRename.type);
    closeModal('renameModal');
  };

  document.getElementById('btnReplace').onclick = () => {
    document.getElementById('findInput').value = '';
    document.getElementById('replaceInput').value = '';
    document.getElementById('replaceScopeAll').checked = false;
    document.getElementById('replaceModal').style.display = 'flex';
  };
  document.getElementById('cancelReplace').onclick = () => closeModal('replaceModal');

  document.getElementById('replaceAllBtn').onclick = () => {
    const findStr = document.getElementById('findInput').value;
    const repStr = document.getElementById('replaceInput').value;
    if (!findStr) return;

    const wholeProject = document.getElementById('replaceScopeAll').checked;
    clearTimeout(historyDebounceTimer);

    if (!wholeProject) {
      if (activeType !== 'chapter' || !activeTab) {
        showInfoModal(t('replaceNoChapterOpen'));
        return;
      }

      const oldHtml = projectData.chapters[activeTab];
      const { html: newHtml, count } = replaceInHtmlString(oldHtml, findStr, repStr);
      if (count === 0) { showInfoModal(t('replaceNoneInChapter')); return; }

      editHistory.sync(activeTab, oldHtml);
      projectData.chapters[activeTab] = newHtml;

      const editor = document.getElementById('editor');
      editor.innerHTML = newHtml;
      highlightWorldBuilding();
      editHistory.commit(activeTab, editor.innerHTML);
      updateMentionIndexForChapter(activeTab, editor.innerHTML);

      updateUndoRedoButtons();
      setSaveStatus('pending');
      save(); updateStats();
      showInfoModal(t('replaceDoneInChapter', { count }));

    } else {
      let totalCount = 0;
      let chaptersAffected = 0;

      Object.keys(projectData.chapters).forEach(chapName => {
        const oldHtml = projectData.chapters[chapName];
        const { html: newHtml, count } = replaceInHtmlString(oldHtml, findStr, repStr);
        if (count === 0) return;

        chaptersAffected++;
        totalCount += count;

        editHistory.sync(chapName, oldHtml);
        projectData.chapters[chapName] = newHtml;
        editHistory.commit(chapName, newHtml);

        // Si ce chapitre est actuellement affiché, on met aussi à jour le DOM visible.
        if (chapName === activeTab) {
          const editor = document.getElementById('editor');
          if (editor) {
            editor.innerHTML = newHtml;
            highlightWorldBuilding();
            editHistory.resyncOnly(activeTab, editor.innerHTML);
            projectData.chapters[activeTab] = editor.innerHTML;
          }
        }
      });

      rebuildFullMentionIndex();
      updateUndoRedoButtons();
      setSaveStatus('pending');
      save(); updateStats();
      showInfoModal(totalCount > 0
        ? t('replaceDoneInProject', { count: totalCount, chapters: chaptersAffected })
        : t('replaceNoneInProject'));
    }

    closeModal('replaceModal');
  };

  // --- RECHERCHE GLOBALE (lecture seule, navigue vers le résultat) ---
  function stripHtmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightTerm(snippet, term) {
    const pattern = new RegExp(escapeRegExp(term), 'gi');
    return snippet.replace(pattern, m => `<mark>${m}</mark>`);
  }

  function findSnippets(text, term, maxSnippets = 3, contextChars = 45) {
    const lowerText = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const snippets = [];
    let cursor = 0;
    let totalCount = 0;

    while (true) {
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

  function runGlobalSearch(term) {
    const results = [];
    if (!term.trim()) return results;

    Object.keys(projectData.chapters).forEach(chapName => {
      const text = stripHtmlToText(projectData.chapters[chapName]);
      const { snippets, totalCount } = findSnippets(text, term);
      if (totalCount > 0) results.push({ type: 'chapter', name: chapName, count: totalCount, snippets });
    });

    Object.keys(projectData.world).forEach(wbName => {
      const data = projectData.world[wbName];
      const combinedText = Object.values(data.content || {}).join('  ');
      const { snippets, totalCount } = findSnippets(combinedText, term);
      if (totalCount > 0) results.push({ type: 'world', name: wbName, count: totalCount, snippets });
    });

    return results;
  }

  const globalSearchInput = document.getElementById('globalSearchInput');
  const globalSearchResults = document.getElementById('globalSearchResults');

  function renderGlobalSearchResults(term) {
    if (!term.trim()) {
      globalSearchResults.innerHTML = `<li style="padding:15px; color:var(--text-muted);">${t('globalSearchHint')}</li>`;
      return;
    }

    const results = runGlobalSearch(term);
    if (results.length === 0) {
      globalSearchResults.innerHTML = `<li style="padding:15px; color:var(--text-muted);">${t('globalSearchNoResults')}</li>`;
      return;
    }

    globalSearchResults.innerHTML = '';
    results.forEach(result => {
      const li = document.createElement('li');
      li.className = 'search-result';
      const wbEntry = projectData.world[result.name];
      const icon = result.type === 'chapter' ? '📖' : (wbEntry?.icon || getEffectiveWbTemplates()[wbEntry?.wbType]?.icon || '📝');
      li.innerHTML = `
        <div class="search-result-header">
          <span>${icon} ${result.name}</span>
          <span class="search-result-count">${t('occurrences', { count: result.count })}</span>
        </div>
        ${result.snippets.map(s => `<div class="search-result-snippet">${highlightTerm(s, term)}</div>`).join('')}
      `;
      li.addEventListener('click', () => {
        openItem(result.name, result.type);
        closeModal('globalSearchModal');
        if (result.type === 'chapter') {
          setTimeout(() => {
            try { window.find(term); } catch (e) { /* window.find non supporté, tant pis */ }
          }, 80);
        }
      });
      globalSearchResults.appendChild(li);
    });
  }

  let globalSearchDebounce = null;
  document.getElementById('btnGlobalSearch').onclick = () => {
    document.getElementById('globalSearchModal').style.display = 'flex';
    globalSearchInput.value = '';
    globalSearchResults.innerHTML = `<li style="padding:15px; color:var(--text-muted);">${t('globalSearchHint')}</li>`;
    globalSearchInput.focus();
  };
  document.getElementById('closeGlobalSearch').onclick = () => closeModal('globalSearchModal');
  globalSearchInput.addEventListener('input', () => {
    clearTimeout(globalSearchDebounce);
    globalSearchDebounce = setTimeout(() => renderGlobalSearchResults(globalSearchInput.value), 250);
  });

  // --- MINUTEUR & MUSIQUE (modules autonomes) ---
  setupTimer();
  setupMusicPlayer();
  setupGrammarChecker();

  // --- CORRECTEUR ORTHOGRAPHIQUE NATIF (Chromium), indépendant de LanguageTool ---
  async function setupNativeSpellcheckToggle() {
    const toggle = document.getElementById('nativeSpellcheckToggle');
    if (!toggle) return;
    nativeSpellcheckEnabled = await window.api.getNativeSpellcheck();
    toggle.checked = nativeSpellcheckEnabled;
    toggle.addEventListener('change', async () => {
      nativeSpellcheckEnabled = toggle.checked;
      await window.api.setNativeSpellcheck(nativeSpellcheckEnabled);
      // On applique directement l'attribut spellcheck sur l'élément éditable
      // (mécanisme fiable) en plus de l'appel à session.setSpellCheckerEnabled
      // côté main (qui reste utile mais pas toujours suffisant seul).
      if (activeType === 'chapter' && activeTab) {
        renderEditorContent();
      }
    });
  }
  await setupNativeSpellcheckToggle();

  // --- EXPORT (menu unique : TXT / DOCX / Projet complet) ---
  async function exportAsTxt() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) { showInfoModal(t('nothingToExport')); return; }

    try {
      await save(); // s'assurer que le chapitre en cours d'édition est bien à jour
      const result = await window.api.showSaveDialog({
        title: 'Exporter en TXT',
        defaultPath: `${projectName} - Complet.txt`,
        filters: [{ name: 'Fichier Texte', extensions: ['txt'] }]
      });
      if (result.canceled || !result.filePath) return;

      let fullText = "";
      for (let i = 0; i < chapterNames.length; i++) {
        const chapName = chapterNames[i];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = projectData.chapters[chapName] || '';
        fullText += `--- ${chapName} ---\n\n` + tempDiv.innerText + "\n\n\n";
      }

      await window.api.exportTxt(result.filePath, fullText);
      showInfoModal(t('exportTxtSuccess'));
    } catch (err) {
      console.error('Erreur export TXT:', err);
      showInfoModal(t('exportTxtError') + err.message);
    }
  }

  async function exportAsDocx() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) { showInfoModal(t('nothingToExport')); return; }

    try {
      await save(); // s'assurer que le chapitre en cours d'édition est bien à jour
      const result = await window.api.showSaveDialog({
        title: 'Exporter en DOCX',
        defaultPath: `${projectName} - Complet.docx`,
        filters: [{ name: 'Word', extensions: ['docx'] }]
      });
      if (result.canceled || !result.filePath) return;

      const finalDocxData = buildDocxData(projectData);
      await window.api.exportDocx(result.filePath, finalDocxData);
      showInfoModal(t('exportDocxSuccess'));
    } catch (err) {
      console.error('Erreur export DOCX:', err);
      showInfoModal(t('exportDocxError') + err.message);
    }
  }

  async function exportProjectFile() {
    try {
      await save(); // s'assurer que le chapitre en cours d'édition est bien à jour

      const result = await window.api.showSaveDialog({
        title: 'Exporter le projet complet',
        defaultPath: `${projectName}.scriptorium`,
        filters: [{ name: 'Projet Scriptorium', extensions: ['scriptorium'] }]
      });
      if (result.canceled || !result.filePath) return;

      await window.api.exportProject(result.filePath, projectName, projectData);
      showInfoModal(t('exportSuccess'));
    } catch (err) {
      console.error('Erreur export projet:', err);
      showInfoModal(t('exportProjectError') + err.message);
    }
  }

  async function exportAsMarkdown() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) { showInfoModal(t('nothingToExport')); return; }

    try {
      await save(); // s'assurer que le chapitre en cours d'édition est bien à jour
      const result = await window.api.showSaveDialog({
        title: 'Exporter en Markdown',
        defaultPath: `${projectName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      if (result.canceled || !result.filePath) return;

      const markdown = buildMarkdown(projectData);
      await window.api.exportTxt(result.filePath, markdown);
      showInfoModal(t('exportMdSuccess'));
    } catch (err) {
      console.error('Erreur export Markdown:', err);
      showInfoModal(t('exportMdError') + err.message);
    }
  }

  async function exportAsPdf() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) { showInfoModal(t('nothingToExport')); return; }

    try {
      await save(); // s'assurer que le chapitre en cours d'édition est bien à jour
      const result = await window.api.showSaveDialog({
        title: 'Exporter en PDF',
        defaultPath: `${projectName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (result.canceled || !result.filePath) return;

      const printHtml = buildPrintHtml(projectData, projectName);
      await window.api.exportPdf(result.filePath, printHtml);
      showInfoModal(t('exportPdfSuccess'));
    } catch (err) {
      console.error('Erreur export PDF:', err);
      showInfoModal(t('exportPdfError') + err.message);
    }
  }

  document.querySelectorAll('.dropdown-item[data-export]').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.export;
      if (type === 'txt') exportAsTxt();
      else if (type === 'md') exportAsMarkdown();
      else if (type === 'pdf') exportAsPdf();
      else if (type === 'docx') exportAsDocx();
      else if (type === 'project') exportProjectFile();
    });
  });

  // --- SAUVEGARDES AUTOMATIQUES : consultation et restauration ---
  const backupsModal = document.getElementById('backupsModal');
  const backupsList = document.getElementById('backupsList');

  document.getElementById('btnBackups').onclick = async () => {
    try {
      await renderBackupsList();
      backupsModal.style.display = 'flex';
    } catch (err) {
      console.error('Erreur ouverture sauvegardes:', err);
      showInfoModal(t('backupRestoreError') + err.message);
    }
  };
  document.getElementById('closeBackups').onclick = () => closeModal('backupsModal');

  function formatBackupDate(isoString) {
    if (!isoString) return t('unknownDate');
    const d = new Date(isoString);
    const locale = getLanguage() === 'en' ? 'en-US' : 'fr-FR';
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function renderBackupsList() {
    backupsList.innerHTML = `<li style="padding:15px; color:var(--text-muted);">${t('loadingBackups')}</li>`;
    const backups = await window.api.listBackups(projectName);

    if (backups.length === 0) {
      backupsList.innerHTML = `<li style="padding:15px; color:var(--text-muted);">${t('backupNoneYet')}</li>`;
      return;
    }

    backupsList.innerHTML = '';
    backups.forEach(backup => {
      const li = document.createElement('li');
      li.className = 'backup-item';
      li.innerHTML = `
        <span>${formatBackupDate(backup.savedAt)}</span>
        <button class="btn-restore-backup">${t('backupRestoreBtn')}</button>
      `;
      li.querySelector('.btn-restore-backup').addEventListener('click', async () => {
        if (!(await showConfirmModal(t('backupConfirmRestore', { date: formatBackupDate(backup.savedAt) })))) {
          return;
        }
        try {
          // Filet de sécurité : on sauvegarde l'état actuel avant d'écraser quoi que ce soit.
          await window.api.createBackup(projectName, projectData);

          const restoredData = await window.api.restoreBackup(projectName, backup.fileName);
          projectData = restoredData;
          if (!projectData.customWbTypes) projectData.customWbTypes = {}; // migration : sauvegardes antérieures à cette fonctionnalité
          customWbTypesVersion++; // projectData remplacé en bloc : le cache des types fusionnés doit être reconstruit
          wbColorVersion++; // projectData remplacé en bloc : on ne peut plus se fier au cache par chapitre
          chapterColorSyncVersion.clear();
          rebuildFullMentionIndex();
          projects[projectName] = projectData;
          await window.api.saveProjects(projects);

          activeTab = null;
          openTabs = [];
          editorContainer.innerHTML = '';
          renderSidebar();
          renderTabs();
          closeModal('backupsModal');
          showInfoModal(t('backupRestoreSuccess'));
        } catch (err) {
          console.error(err);
          showInfoModal(t('backupRestoreError') + err.message);
        }
      });
      backupsList.appendChild(li);
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isEditorFocused = document.activeElement && document.activeElement.id === 'editor';
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // Undo/Redo : uniquement quand le focus est dans l'éditeur de chapitre.
      // Ailleurs (champs des modales, fiches World Building...), on laisse le
      // navigateur gérer Ctrl+Z nativement pour ces champs <input>/<textarea>.
      if (ctrlOrCmd && isEditorFocused) {
        if (!e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); performUndo(); return; }
        if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
          e.preventDefault(); performRedo(); return;
        }
      }

      if (ctrlOrCmd) {
        if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        if (e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); }
        if (e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); }
        if (e.key.toLowerCase() === 'u') { e.preventDefault(); format('underline'); }

        // Alignement : uniquement dans l'éditeur de chapitre (comme B/I/U
        // plus haut, ces commandes n'ont pas de sens ailleurs).
        if (isEditorFocused) {
          if (e.key.toLowerCase() === 'l') { e.preventDefault(); format('justifyLeft'); }
          if (e.key.toLowerCase() === 'e') { e.preventDefault(); format('justifyCenter'); }
          if (e.key.toLowerCase() === 'r') { e.preventDefault(); format('justifyRight'); }
        }

        // Recherche : Ctrl+F pour Rechercher/Remplacer (chapitre courant),
        // Ctrl+Maj+F pour la recherche globale (tout le projet).
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (e.shiftKey) {
            document.getElementById('btnGlobalSearch').click();
          } else {
            document.getElementById('btnReplace').click();
          }
        }

        // Navigation entre onglets, pratique dès que plusieurs chapitres/fiches
        // sont ouverts en même temps.
        if (e.key === 'Tab' && openTabs.length > 1) {
          e.preventDefault();
          const currentIndex = openTabs.findIndex(t => t.name === activeTab && t.type === activeType);
          const delta = e.shiftKey ? -1 : 1;
          const nextIndex = (currentIndex + delta + openTabs.length) % openTabs.length;
          switchTab(openTabs[nextIndex].name, openTabs[nextIndex].type);
        }

        // Zoom de la page (complète le Ctrl+molette déjà existant).
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          editorZoom = Math.min(EDITOR_ZOOM_MAX, +(editorZoom + EDITOR_ZOOM_STEP).toFixed(2));
          const editor = document.getElementById('editor');
          if (editor) editor.style.zoom = editorZoom;
        }
        if (e.key === '-') {
          e.preventDefault();
          editorZoom = Math.max(EDITOR_ZOOM_MIN, +(editorZoom - EDITOR_ZOOM_STEP).toFixed(2));
          const editor = document.getElementById('editor');
          if (editor) editor.style.zoom = editorZoom;
        }
        if (e.key === '0') {
          e.preventDefault();
          editorZoom = 1;
          const editor = document.getElementById('editor');
          if (editor) editor.style.zoom = editorZoom;
        }
      }
    });
  }

  renderSidebar();
  setupSidebarDrag();
  setupPanelResize();
  setupKeyboardShortcuts();
  setupModalAccessibility();

  if (activeTab) {
    renderTabs();
    renderEditorContent();
  } else if (openTabs.length > 0) {
    switchTab(openTabs[0].name, openTabs[0].type);
  }
}

console.log("editor.js chargé (modulaire, sans accès Node direct)");
init().catch(err => {
  console.error("Erreur au chargement de l'éditeur:", err);
  showInfoModal(t('initErrorPrefix') + err.message + t('initErrorSuffix'));
});
