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

  const langDropdown = document.getElementById('langDropdown');
  document.querySelectorAll('#langDropdown .theme-item').forEach(item => {
    item.addEventListener('click', async () => {
      setLanguage(item.dataset.lang);
      await window.api.saveLanguage(getLanguage());
      applyStaticTranslations();
      langDropdown.classList.remove('show');
      document.querySelector('#settingsLangItem .settings-parent-row').classList.remove('open');
      updateStats();
      renderSidebar();
      renderTabs();
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
        openModal.style.display = 'none';
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
  ['.dropdown-item', '.theme-item', '.wb-menu-item'].forEach(makeKeyboardActivatable);

  // --- GESTION DES THÈMES ---
  const themeDropdown = document.getElementById('themeDropdown');

  const savedTheme = (await window.api.getTheme()) || 'dark';
  document.body.className = `${savedTheme} editor-page`;

  // Sélecteur restreint à [data-theme] : les lignes du menu "Paramètres"
  // (Thème / Langue / Affichage) partagent aussi la classe .theme-item pour
  // leur style, mais ne doivent pas déclencher ce changement de thème.
  document.querySelectorAll('.theme-item[data-theme]').forEach(item => {
    item.addEventListener('click', () => {
      const theme = item.dataset.theme;
      document.body.className = `${theme} editor-page`;
      window.api.saveTheme(theme);
      themeDropdown.classList.remove('show');
      document.querySelector('#settingsThemeItem .settings-parent-row').classList.remove('open');
    });
  });

  // --- MENU "PARAMÈTRES" (regroupe Thème / Langue / Affichage / Statistiques) ---
  // Thème et Langue s'ouvrent en accordéon SOUS leur ligne (voir style.css) :
  // un volet latéral sortait de l'écran quand "Paramètres" est proche du bord
  // de la fenêtre, le rendant invisible bien que techniquement fonctionnel.
  const settingsDropdown = document.getElementById('settingsDropdown');
  const themeRow = document.querySelector('#settingsThemeItem .settings-parent-row');
  const langRow = document.querySelector('#settingsLangItem .settings-parent-row');

  function closeSubmenuPanels() {
    document.querySelectorAll('.submenu-panel').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.settings-parent-row').forEach(r => r.classList.remove('open'));
  }

  document.getElementById('btnSettingsToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-menu, .wb-menu').forEach(m => m.classList.remove('show'));
    settingsDropdown.classList.toggle('show');
    // Sous-menus toujours repliés à l'ouverture/fermeture du menu Paramètres.
    closeSubmenuPanels();
  });

  const grammarRow = document.querySelector('#settingsGrammarItem .settings-parent-row');
  const grammarSubmenuPanel = document.getElementById('grammarSubmenuPanel');

  themeRow.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.remove('show');
    langRow.classList.remove('open');
    grammarSubmenuPanel.classList.remove('show');
    grammarRow.classList.remove('open');
    themeDropdown.classList.toggle('show');
    themeRow.classList.toggle('open');
  });

  langRow.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.remove('show');
    themeRow.classList.remove('open');
    grammarSubmenuPanel.classList.remove('show');
    grammarRow.classList.remove('open');
    langDropdown.classList.toggle('show');
    langRow.classList.toggle('open');
  });

  grammarRow.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.remove('show');
    themeRow.classList.remove('open');
    langDropdown.classList.remove('show');
    langRow.classList.remove('open');
    grammarSubmenuPanel.classList.toggle('show');
    grammarRow.classList.toggle('open');
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

  document.getElementById('btnDisplayPrefs').onclick = () => {
    document.getElementById('displayPrefsModal').style.display = 'flex';
  };
  document.getElementById('closeDisplayPrefs').onclick = () => closeModal('displayPrefsModal');

  // --- STATISTIQUES D'ÉCRITURE ---
  let currentStatsPeriod = 'day';

  document.getElementById('btnStats').onclick = async () => {
    document.getElementById('statsModal').style.display = 'flex';
    await renderStatsList(currentStatsPeriod);
  };
  document.getElementById('closeStats').onclick = () => closeModal('statsModal');

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
      document.querySelectorAll('.dropdown-menu, .theme-dropdown, .wb-menu, .submenu-panel').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.settings-parent-row').forEach(r => r.classList.remove('open'));
      if (!isShowing) menu.classList.add('show');
    });
  });

  document.getElementById('btnNewWB').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('wbMenu');
    document.querySelectorAll('.dropdown-menu, .theme-dropdown, .submenu-panel').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.settings-parent-row').forEach(r => r.classList.remove('open'));
    menu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu, .theme-dropdown, .wb-menu, .submenu-panel').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.settings-parent-row').forEach(r => r.classList.remove('open'));
  });

  // --- FORMATTAGE DU TEXTE ---
  function format(cmd, val) {
    if (activeType === 'chapter') {
      document.execCommand(cmd, false, val);
      document.getElementById('editor').focus();
      save(); updateStats();
    }
  }

  document.getElementById('undoBtn').onclick = () => performUndo();
  document.getElementById('redoBtn').onclick = () => performRedo();
  document.getElementById('boldBtn').onclick = () => format('bold');
  document.getElementById('italicBtn').onclick = () => format('italic');
  document.getElementById('underlineBtn').onclick = () => format('underline');
  document.getElementById('colorPicker').addEventListener('input', (e) => format('foreColor', e.target.value));

  document.querySelectorAll('.dropdown-item[data-command]').forEach(item => {
    item.addEventListener('click', () => {
      format(item.dataset.command, item.dataset.value);
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
  const HIGHLIGHT_LARGE_CHAPTER_EVERY_N = 5; // 1 fois sur 5 pauses de frappe pour les gros chapitres
  let largeChapterHighlightCounter = 0;

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
          const config = WB_CONFIG[itemData.wbType];

          const span = document.createElement('span');
          span.className = `wb-mention ${config.colorClass}`;
          span.dataset.wbKey = realKey;
          span.dataset.typeLabel = config.label;
          span.setAttribute('spellcheck', 'false');

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

    let shouldHighlightNow = true;
    if (chapterSize > HIGHLIGHT_SIZE_THRESHOLD) {
      largeChapterHighlightCounter++;
      shouldHighlightNow = (largeChapterHighlightCounter % HIGHLIGHT_LARGE_CHAPTER_EVERY_N === 0);
    }

    if (shouldHighlightNow) highlightWorldBuilding();
    save();

    if (editor && activeTab && activeType === 'chapter') {
      editHistory.resyncOnly(activeTab, editor.innerHTML);
      updateUndoRedoButtons();
    }
  }, 1000);

  // --- CORRECTEUR DE GRAMMAIRE HORS LIGNE (LanguageTool) ---
  // Le serveur LanguageTool local tourne en tâche de fond dans le processus
  // main (voir app.js) ; ce bloc ne fait qu'envoyer le texte du chapitre
  // ouvert et poser des <mark class="grammar-error"> sur les correspondances
  // reçues, selon le même principe (TreeWalker + splitText, jamais de
  // ré-écriture du HTML) que highlightWorldBuilding() ci-dessus.
  let grammarPrefs = { enabled: false, languageToolPath: null, port: 8081 };
  let grammarServerReady = false;
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
      // Auparavant cette erreur disparaissait silencieusement : l'utilisateur
      // voyait juste "aucune faute" sans savoir si c'était parce que le texte
      // était correct ou parce que la requête avait échoué. On la signale donc
      // une seule fois (pas à chaque frappe), et on coupe la vérification
      // jusqu'à ce que l'utilisateur relance manuellement depuis les Paramètres,
      // pour éviter de marteler un serveur en échec toutes les 1,5s.
      if (lastGrammarErrorShown !== err.message) {
        lastGrammarErrorShown = err.message;
        grammarServerReady = false;
        alert(t('grammarCheckFailedAlert', { error: err.message }));
      }
    } finally {
      grammarCheckInFlight = false;
    }
  }

  const debouncedGrammarCheck = debounce(runGrammarCheck, 1500);

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
    if (!javaStatusEl) return;

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
      return;
    }
    if (!javaOk || !grammarPrefs.languageToolPath) {
      messageEl.textContent = '';
      return;
    }

    messageEl.textContent = t('grammarStatusStarting');
    try {
      const result = await window.api.startGrammarServer();
      grammarServerReady = true;
      messageEl.textContent = t('grammarStatusReady', { port: result.port });
      debouncedGrammarCheck();
    } catch (err) {
      grammarServerReady = false;
      messageEl.textContent = t('grammarStatusError', { error: err.message });
    }
  }

  async function setupGrammarChecker() {
    grammarPrefs = await window.api.getGrammarPrefs();

    const enableCheckboxTop = document.getElementById('grammarEnableCheckbox');
    const enableCheckboxModal = document.getElementById('grammarEnableCheckboxModal');
    enableCheckboxTop.checked = grammarPrefs.enabled;
    enableCheckboxModal.checked = grammarPrefs.enabled;

    async function persistEnabled(value) {
      grammarPrefs = await window.api.saveGrammarPrefs({ enabled: value });
      enableCheckboxTop.checked = grammarPrefs.enabled;
      enableCheckboxModal.checked = grammarPrefs.enabled;
      if (!grammarPrefs.enabled) {
        grammarServerReady = false;
        const editor = document.getElementById('editor');
        if (editor && clearGrammarMarks(editor)) {
          projectData.chapters[activeTab] = editor.innerHTML;
        }
      }
      await refreshGrammarStatusUI();
    }

    enableCheckboxTop.addEventListener('change', () => persistEnabled(enableCheckboxTop.checked));
    enableCheckboxModal.addEventListener('change', () => persistEnabled(enableCheckboxModal.checked));

    document.getElementById('btnGrammarConfigure').addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown-menu, .theme-dropdown, .submenu-panel').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.settings-parent-row').forEach(r => r.classList.remove('open'));
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
        document.getElementById('grammarEnableCheckboxModal').checked = true;
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
  // Comptabilisées sur TOUS les projets (pas seulement celui ouvert), pour
  // donner une vraie vision de la production d'écriture globale.
  function countWordsInHtml(htmlContent) {
    if (typeof htmlContent !== 'string' || !htmlContent) return 0;
    const plainText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return plainText ? plainText.split(' ').filter(w => w.length > 0).length : 0;
  }

  function getGlobalTotalWords() {
    let total = 0;
    Object.values(projects).forEach(proj => {
      const chapters = proj && proj.chapters ? proj.chapters : proj;
      if (chapters && typeof chapters === 'object') {
        Object.values(chapters).forEach(html => { total += countWordsInHtml(html); });
      }
    });
    return total;
  }

  function getDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Enregistre la progression du nombre de mots pour la journée en cours.
  // Principe : un "baseline" (total de mots au début de la journée) permet de
  // calculer, à tout moment, le solde net écrit aujourd'hui ; l'historique
  // par jour est mis à jour en direct (pas seulement au changement de jour).
  async function recordWritingStats() {
    try {
      const stats = (await window.api.getWritingStats()) || { baselineDate: null, baselineWords: 0, history: {} };
      if (!stats.history) stats.history = {};

      const todayKey = getDateKey(new Date());
      const currentTotal = getGlobalTotalWords();

      if (stats.baselineDate !== todayKey) {
        // Premier enregistrement du jour : on fige le solde d'hier (déjà
        // dans l'historique) et on redémarre un nouveau point de référence.
        stats.baselineDate = todayKey;
        stats.baselineWords = currentTotal;
        if (stats.history[todayKey] === undefined) stats.history[todayKey] = 0;
      } else {
        stats.history[todayKey] = currentTotal - stats.baselineWords;
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
      stats = (await window.api.getWritingStats()) || { history: {} };
    } catch (err) {
      console.error('Impossible de charger les statistiques:', err);
      stats = { history: {} };
    }
    const history = stats.history || {};

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
              alert(t('itemNotFound'));
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
      debouncedGrammarCheck();
      updateStats();
      updateUndoRedoButtons();

      activeSelectionChangeHandler = () => { if (activeType === 'chapter') updateStats(); };
      document.addEventListener('selectionchange', activeSelectionChangeHandler);
      div.addEventListener('blur', detachSelectionChangeHandler);

    } else if (activeType === 'world') {
      const data = projectData.world[activeTab];
      if (!data) return;

      const template = WB_TEMPLATES[data.wbType];
      const container = document.createElement('div');
      container.className = 'wb-container';

      container.innerHTML = `
        <div class="wb-header">
          <span class="wb-icon">${template.icon}</span>
          <span class="wb-title">${activeTab}</span>
        </div>
        <div id="wbFormFields"></div>
      `;

      const fieldsContainer = container.querySelector('#wbFormFields');

      template.fields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'wb-form-group';
        const label = document.createElement('label');
        label.className = 'wb-label';
        label.textContent = t(`wbField_${field.key}`);

        let input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
        if (field.type !== 'textarea') input.type = 'text';
        input.className = field.type === 'textarea' ? 'wb-textarea' : 'wb-input';
        input.value = data.content[field.key] || '';
        input.addEventListener('input', () => {
          projectData.world[activeTab].content[field.key] = input.value;
          setSaveStatus('pending');
          save();
        });

        group.appendChild(label);
        group.appendChild(input);
        fieldsContainer.appendChild(group);
      });

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
        if (wbItem) icon = WB_TEMPLATES[wbItem.wbType].icon + ' ';
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

  function closeTab(index) {
    const closed = openTabs[index];
    if (!closed) return;

    save();
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
      const icon = WB_TEMPLATES[data.wbType].icon;
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
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(t('confirmDeleteItem', { name }))) {

        if (activeTab === name && activeType === type) {
          activeTab = null;
          editorContainer.innerHTML = '';
        }

        if (type === 'chapter') {
          delete projectData.chapters[name];
          editHistory.remove(name);
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

  // Modale d'information générique, en remplacement des alert() natifs du
  // navigateur (peu cohérents visuellement avec le reste de l'application).
  function showInfoModal(message) {
    document.getElementById('infoModalMessage').textContent = message;
    document.getElementById('infoModal').style.display = 'flex';
  }
  document.getElementById('closeInfoModal').onclick = () => closeModal('infoModal');

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
      save(); renderSidebar(); openItem(name, 'chapter');
      closeModal('addChapterModal');
    }
  };

  let wbTypeToCreate = null;
  document.querySelectorAll('.wb-menu-item').forEach(item => {
    item.onclick = () => {
      wbTypeToCreate = item.dataset.type;
      document.getElementById('wbModalTitle').textContent = t('newWBModalTitle', { type: t(`wbLabel_${wbTypeToCreate}`) });
      document.getElementById('wbNameInput').value = '';
      document.getElementById('addWBModal').style.display = 'flex';
    };
  });
  document.getElementById('cancelWB').onclick = () => closeModal('addWBModal');
  document.getElementById('confirmWB').onclick = () => {
    const name = document.getElementById('wbNameInput').value.trim();
    if (name && !projectData.world[name]) {
      projectData.world[name] = { wbType: wbTypeToCreate, content: {} };
      save(); renderSidebar(); openItem(name, 'world');
      closeModal('addWBModal');
      if (activeType === 'chapter') highlightWorldBuilding();
    }
  };

  document.getElementById('cancelRename').onclick = () => closeModal('renameModal');
  document.getElementById('confirmRename').onclick = () => {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === itemToRename.oldName) { closeModal('renameModal'); return; }

    if (itemToRename.type === 'chapter') {
      if (projectData.chapters[newName]) return alert(t('alreadyExists'));
      projectData.chapters[newName] = projectData.chapters[itemToRename.oldName];
      delete projectData.chapters[itemToRename.oldName];
      editHistory.rename(itemToRename.oldName, newName);
    } else {
      if (projectData.world[newName]) return alert(t('alreadyExists'));
      projectData.world[newName] = projectData.world[itemToRename.oldName];
      delete projectData.world[itemToRename.oldName];
      renameWorldMentionsAcrossChapters(itemToRename.oldName, newName);
    }

    const tab = openTabs.find(t => t.name === itemToRename.oldName && t.type === itemToRename.type);
    if (tab) tab.name = newName;
    if (activeTab === itemToRename.oldName && activeType === itemToRename.type) activeTab = newName;

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
      const icon = result.type === 'chapter' ? '📖' : (WB_TEMPLATES[projectData.world[result.name]?.wbType]?.icon || '📝');
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
    if (chapterNames.length === 0) return alert(t('nothingToExport'));

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
      alert(t('exportTxtSuccess'));
    } catch (err) {
      console.error('Erreur export TXT:', err);
      alert(t('exportTxtError') + err.message);
    }
  }

  async function exportAsDocx() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) return alert(t('nothingToExport'));

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
      alert(t('exportDocxSuccess'));
    } catch (err) {
      console.error('Erreur export DOCX:', err);
      alert(t('exportDocxError') + err.message);
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
      alert(t('exportSuccess'));
    } catch (err) {
      console.error('Erreur export projet:', err);
      alert(t('exportProjectError') + err.message);
    }
  }

  async function exportAsMarkdown() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) return alert(t('nothingToExport'));

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
      alert(t('exportMdSuccess'));
    } catch (err) {
      console.error('Erreur export Markdown:', err);
      alert(t('exportMdError') + err.message);
    }
  }

  async function exportAsPdf() {
    const chapterNames = Object.keys(projectData.chapters);
    if (chapterNames.length === 0) return alert(t('nothingToExport'));

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
      alert(t('exportPdfSuccess'));
    } catch (err) {
      console.error('Erreur export PDF:', err);
      alert(t('exportPdfError') + err.message);
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
      alert(t('backupRestoreError') + err.message);
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
        if (!confirm(t('backupConfirmRestore', { date: formatBackupDate(backup.savedAt) }))) {
          return;
        }
        try {
          // Filet de sécurité : on sauvegarde l'état actuel avant d'écraser quoi que ce soit.
          await window.api.createBackup(projectName, projectData);

          const restoredData = await window.api.restoreBackup(projectName, backup.fileName);
          projectData = restoredData;
          projects[projectName] = projectData;
          await window.api.saveProjects(projects);

          activeTab = null;
          openTabs = [];
          editorContainer.innerHTML = '';
          renderSidebar();
          renderTabs();
          closeModal('backupsModal');
          alert(t('backupRestoreSuccess'));
        } catch (err) {
          console.error(err);
          alert(t('backupRestoreError') + err.message);
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
  alert(t('initErrorPrefix') + err.message + t('initErrorSuffix'));
});
