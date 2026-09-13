import { t, setLanguage, getLanguage, applyStaticTranslations } from './js/i18n.js';

console.log("menu.js chargé (persistance disque via window.api)");

// Remplacent alert()/confirm() natifs du navigateur (fenêtres système hors
// thème, incohérentes avec le reste de l'application) — mêmes fonctions que
// dans l'éditeur (js/editor.js), dupliquées ici car cette page (index.html)
// est un module JS séparé, sans état partagé avec l'éditeur.
function showInfoModal(message) {
  document.getElementById('infoModalMessage').textContent = message;
  document.getElementById('infoModal').style.display = 'flex';
}

function showConfirmModal(message) {
  return new Promise(resolve => {
    document.getElementById('confirmModalMessage').textContent = message;
    const modal = document.getElementById('confirmModal');
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');

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

document.getElementById('closeInfoModal').addEventListener('click', () => {
  document.getElementById('infoModal').style.display = 'none';
});

// Migration ponctuelle : si l'utilisateur avait des projets stockés dans
// l'ancien système localStorage (versions précédentes de l'appli), on les
// transfère une fois vers le store persistant, puis on nettoie localStorage.
async function migrateLegacyDataIfNeeded() {
  const legacyProjectsRaw = localStorage.getItem('codwriter_projects');
  if (!legacyProjectsRaw) return;

  try {
    const legacyData = {
      projects: JSON.parse(legacyProjectsRaw || '{}'),
      uiState: JSON.parse(localStorage.getItem('codwriter_state') || '{}'),
      theme: localStorage.getItem('codwriter_theme') || undefined,
      currentProject: localStorage.getItem('currentProject') || undefined
    };
    const migrated = await window.api.migrateFromLocalStorage(legacyData);
    if (migrated) {
      localStorage.removeItem('codwriter_projects');
      localStorage.removeItem('codwriter_state');
      localStorage.removeItem('codwriter_theme');
      localStorage.removeItem('currentProject');
      console.log('Anciennes données locales migrées vers le stockage persistant.');
    }
  } catch (e) {
    console.error('Échec de la migration des données locales :', e);
  }
}

async function init() {
  await migrateLegacyDataIfNeeded();

  const savedTheme = await window.api.getTheme();
  if (savedTheme) document.body.className = `${savedTheme} menu-page`;

  const savedLang = (await window.api.getLanguage()) || 'fr';
  setLanguage(savedLang);
  applyStaticTranslations();

  const langDropdown = document.getElementById('langDropdown');
  document.getElementById('btnLangToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('show');
  });
  document.querySelectorAll('#langDropdown .theme-item').forEach(item => {
    item.addEventListener('click', async () => {
      setLanguage(item.dataset.lang);
      await window.api.saveLanguage(getLanguage());
      applyStaticTranslations();
      langDropdown.classList.remove('show');
      renderProjects(); // re-rendu pour traduire aussi le contenu dynamique
    });
  });
  document.addEventListener('click', () => langDropdown.classList.remove('show'));

  const projectsList = document.getElementById('projectsList');
  const btnNew = document.getElementById('btnNewProject');

  let projects = await window.api.getProjects();

  function renderProjects() {
    projectsList.innerHTML = '';
    const keys = Object.keys(projects);

    if (keys.length === 0) {
      projectsList.innerHTML = `<div style="opacity:0.6;padding:40px;text-align:center;grid-column:1/-1;">${t('noProjects')}</div>`;
      return;
    }

    keys.forEach(name => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${name}`);

      let wordCount = 0;
      let chapterCount = 0;

      const projectData = projects[name];
      const chapters = projectData.chapters ? projectData.chapters : projectData;

      Object.values(chapters).forEach(content => {
        if (typeof content === 'string') {
          wordCount += content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
          chapterCount++;
        }
      });

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3>${name}</h3>
            <p>${t('projectStats', { chapters: chapterCount, words: wordCount })}</p>
          </div>
          <div class="project-options" style="position:relative;">
            <button class="btn-options" title="Personnaliser">⋮</button>
            <div class="options-menu dropdown-menu">
              <div class="dropdown-item btn-rename">${t('optionRename')}</div>
              <div class="dropdown-item btn-export-project">${t('optionExport')}</div>
              <div class="dropdown-item btn-delete" style="color:#ef4444;">${t('optionDelete')}</div>
            </div>
          </div>
        </div>
      `;

      // Clic pour ouvrir le projet
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.project-options')) return; // Ignore le clic sur les options
        await window.api.setCurrentProject(name);
        window.location.href = 'editor.html';
      });

      card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.project-options')) {
          e.preventDefault();
          card.click();
        }
      });

      // Gestion du menu "Personnaliser" (⋮)
      const btnOptions = card.querySelector('.btn-options');
      const optionsMenu = card.querySelector('.options-menu');

      btnOptions.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.options-menu').forEach(m => m !== optionsMenu && m.classList.remove('show'));
        optionsMenu.classList.toggle('show');
      });

      // Renommer
      const btnRename = card.querySelector('.btn-rename');
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.remove('show');
        const modal = document.getElementById('renameProjectModal');
        const input = document.getElementById('renameProjectInput');
        modal.style.display = 'flex';
        input.value = name;
        input.focus();

        document.getElementById('cancelRenameProject').onclick = () => modal.style.display = 'none';
        document.getElementById('confirmRenameProject').onclick = async () => {
          const newName = input.value.trim();
          if (!newName || newName === name) { modal.style.display = 'none'; return; }
          if (projects[newName]) { showInfoModal(t('alreadyExists')); return; }

          projects[newName] = projects[name];
          delete projects[name];
          await window.api.saveProjects(projects);

          let uiState = await window.api.getUiState();
          if (uiState[name]) {
            uiState[newName] = uiState[name];
            delete uiState[name];
            await window.api.saveUiState(uiState);
          }

          const currentProject = await window.api.getCurrentProject();
          if (currentProject === name) {
            await window.api.setCurrentProject(newName);
          }
          modal.style.display = 'none';
          renderProjects();
        };
      });

      // Exporter (.scriptorium) — sauvegarde manuelle portable
      const btnExportProject = card.querySelector('.btn-export-project');
      btnExportProject.addEventListener('click', async (e) => {
        e.stopPropagation();
        optionsMenu.classList.remove('show');

        const result = await window.api.showSaveDialog({
          title: 'Exporter le projet',
          defaultPath: `${name}.scriptorium`,
          filters: [{ name: 'Projet Scriptorium', extensions: ['scriptorium'] }]
        });
        if (result.canceled || !result.filePath) return;

        try {
          await window.api.exportProject(result.filePath, name, projects[name]);
          showInfoModal(t('exportSuccess'));
        } catch (err) {
          console.error(err);
          showInfoModal(t('exportError') + err.message);
        }
      });

      // Supprimer
      const btnDelete = card.querySelector('.btn-delete');
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        optionsMenu.classList.remove('show');
        if (await showConfirmModal(t('confirmDeleteProject', { name }))) {
          (async () => {
            delete projects[name];
            await window.api.saveProjects(projects);

            let uiState = await window.api.getUiState();
            if (uiState[name]) {
              delete uiState[name];
              await window.api.saveUiState(uiState);
            }

            const currentProject = await window.api.getCurrentProject();
            if (currentProject === name) {
              await window.api.clearCurrentProject();
            }
            renderProjects();
          })();
        }
      });

      projectsList.appendChild(card);
    });
  }

  // Fermer les menus des projets si on clique ailleurs (une seule fois, hors de renderProjects
  // pour ne pas empiler les écouteurs à chaque re-rendu)
  document.addEventListener('click', () => {
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
  });

  // --- ACCESSIBILITÉ : Échap ferme la modale ouverte, Entrée valide l'action principale ---
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;

    const openModal = Array.from(document.querySelectorAll('.modal'))
      .find(m => getComputedStyle(m).display !== 'none');
    if (!openModal) return;

    if (e.key === 'Escape') {
      const cancelBtn = openModal.querySelector('.modal-buttons button:first-child');
      if (cancelBtn) { cancelBtn.click(); } else { openModal.style.display = 'none'; }
      return;
    }

    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      const primaryBtn = openModal.querySelector('.modal-buttons button:last-child');
      if (primaryBtn) { e.preventDefault(); primaryBtn.click(); }
    }
  });

  document.getElementById('btnImportProject').addEventListener('click', async () => {
    const result = await window.api.showOpenDialog({
      title: 'Importer un projet',
      filters: [{ name: 'Projet Scriptorium', extensions: ['scriptorium', 'json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;

    try {
      const imported = await window.api.importProject(result.filePaths[0]);
      let name = imported.projectName;

      // Éviter d'écraser un projet existant du même nom
      if (projects[name]) {
        let i = 2;
        while (projects[`${name} (${i})`]) i++;
        name = `${name} (${i})`;
      }

      projects[name] = imported.projectData;
      await window.api.saveProjects(projects);
      renderProjects();
      showInfoModal(t('importSuccess', { name }));
    } catch (err) {
      console.error(err);
      showInfoModal(t('importError') + err.message);
    }
  });

  btnNew.addEventListener('click', () => {
    const modal = document.getElementById('newProjectModal');
    const input = document.getElementById('projectNameInput');
    modal.style.display = 'flex';
    input.value = `Projet ${Object.keys(projects).length + 1}`;
    input.focus();

    const close = () => modal.style.display = 'none';

    document.getElementById('cancelNewProject').onclick = close;
    document.getElementById('confirmNewProject').onclick = async () => {
      let name = input.value.trim();
      if (!name) { showInfoModal(t('nameRequired')); return; }
      if (projects[name]) { showInfoModal(t('alreadyExists')); return; }

      projects[name] = { chapters: { "Chapitre 1": "" }, world: {} };
      await window.api.saveProjects(projects);
      await window.api.setCurrentProject(name);
      close();
      window.location.href = 'editor.html';
    };
  });

  renderProjects();
}

init().catch(err => {
  console.error('Erreur au chargement du menu:', err);
  showInfoModal(t('menuInitErrorPrefix') + err.message + t('initErrorSuffix'));
});
