// src/renderer/components/menu/ProjectsPage.tsx
//
// Écran d'accueil :
// - liste des projets ;
// - création d'un roman ou d'un scénario ;
// - importation ;
// - renommage ;
// - exportation ;
// - suppression.
//
// Les anciens projets qui ne possèdent pas encore `projectType` sont
// automatiquement considérés comme des romans.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useI18n } from '../../i18n';
import { useDialogs } from '../common/Dialogs';
import { Modal } from '../common/Modal';
import { ProjectCard } from './ProjectCard';
import { describeError } from '../../lib/errors';
import {
  createScreenplayProject,
  getDefaultSceneHeading
} from '../../lib/screenplay';
import type {
  LanguageCode,
  ProjectData,
  ProjectType,
  ProjectsMap,
  ScreenplayConventionLanguage,
  ScreenplayInteriorExterior,
  ScreenplayPageFormat,
  WritingStats
} from '../../../shared/types';

export interface ProjectsPageProps {
  onOpenProject: (
    name: string
  ) => void | Promise<void>;
}

interface NewProjectDraft {
  projectType: ProjectType | null;
  name: string;

  /**
   * Paramètres propres au scénario.
   */
  conventionLanguage: ScreenplayConventionLanguage;
  pageFormat: ScreenplayPageFormat;
  author: string;
  workingTitle: string;
  interiorExterior: ScreenplayInteriorExterior;
  customInteriorExterior: string;
  location: string;
  time: string;
}

/**
 * Retourne un nouveau brouillon de création de projet.
 */
function createNewProjectDraft(
  defaultName: string
): NewProjectDraft {
  return {
    projectType: null,
    name: defaultName,
    conventionLanguage: 'fr',
    pageFormat: 'a4',
    author: '',
    workingTitle: '',
    interiorExterior: 'INT.',
    customInteriorExterior: '',
    location: '',
    time: ''
  };
}

/**
 * Normalise un projet importé ou provenant d'une ancienne version.
 */
function normalizeProjectData(
  data: ProjectData
): ProjectData {
  const projectType: ProjectType =
    data?.projectType === 'screenplay'
      ? 'screenplay'
      : 'novel';

  if (projectType === 'screenplay') {
    const fallback =
      createScreenplayProject({
        title: ''
      });

    return {
      ...data,
      projectType: 'screenplay',
      chapters: data?.chapters || {},
      world: data?.world || {},
      customWbTypes:
        data?.customWbTypes || {},
      writingSessions: Array.isArray(
        data?.writingSessions
      )
        ? data.writingSessions
        : [],
      goals: Array.isArray(data?.goals)
        ? data.goals
        : [],
      screenplay:
        data?.screenplay ||
        fallback.screenplay
    };
  }

  return {
    ...data,
    projectType: 'novel',
    chapters: data?.chapters || {},
    world: data?.world || {},
    customWbTypes:
      data?.customWbTypes || {},
    writingSessions: Array.isArray(
      data?.writingSessions
    )
      ? data.writingSessions
      : [],
    goals: Array.isArray(data?.goals)
      ? data.goals
      : []
  };
}

/**
 * Déplace l'ancien historique quotidien vers le nouveau nom du projet.
 */
async function renameWritingStatsProject(
  oldName: string,
  newName: string
): Promise<void> {
  let stats: WritingStats;

  try {
    stats =
      (await window.api.getWritingStats()) ||
      {};
  } catch (error) {
    console.error(
      'Impossible de charger les statistiques pendant le renommage :',
      error
    );

    return;
  }

  if (!stats.projects?.[oldName]) {
    return;
  }

  const projects = {
    ...(stats.projects || {})
  };

  projects[newName] =
    projects[oldName];

  delete projects[oldName];

  try {
    await window.api.saveWritingStats({
      ...stats,
      projects
    });
  } catch (error) {
    console.error(
      'Impossible de déplacer les statistiques vers le nouveau nom :',
      error
    );
  }
}

/**
 * Supprime l'ancien historique quotidien associé à un projet supprimé.
 */
async function deleteWritingStatsProject(
  projectName: string
): Promise<void> {
  let stats: WritingStats;

  try {
    stats =
      (await window.api.getWritingStats()) ||
      {};
  } catch (error) {
    console.error(
      'Impossible de charger les statistiques pendant la suppression :',
      error
    );

    return;
  }

  if (!stats.projects?.[projectName]) {
    return;
  }

  const projects = {
    ...stats.projects
  };

  delete projects[projectName];

  try {
    await window.api.saveWritingStats({
      ...stats,
      projects
    });
  } catch (error) {
    console.error(
      'Impossible de supprimer les statistiques du projet :',
      error
    );
  }
}

export function ProjectsPage({
  onOpenProject
}: ProjectsPageProps): React.ReactElement {
  const {
    t,
    lang,
    changeLanguage
  } = useI18n();

  const {
    showInfo,
    showConfirm
  } = useDialogs();

  const [
    projects,
    setProjects
  ] = useState<ProjectsMap>({});

  const [
    langMenuOpen,
    setLangMenuOpen
  ] = useState(false);

  const [
    newProjectDraft,
    setNewProjectDraft
  ] = useState<NewProjectDraft | null>(
    null
  );

  const [
    renaming,
    setRenaming
  ] = useState<{
    oldName: string;
    value: string;
  } | null>(null);

  const newProjectInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const renameInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  useEffect(() => {
    void (async () => {
      try {
        const loadedProjects =
          (await window.api.getProjects()) ||
          {};

        const normalizedProjects: ProjectsMap =
          {};

        Object.entries(
          loadedProjects
        ).forEach(
          ([name, projectData]) => {
            normalizedProjects[name] =
              normalizeProjectData(
                projectData
              );
          }
        );

        setProjects(
          normalizedProjects
        );
      } catch (error) {
        const message =
          describeError(error);

        showInfo(
          t('menuInitErrorPrefix') +
            message +
            t('initErrorSuffix')
        );
      }
    })();
  }, [showInfo, t]);

  useEffect(() => {
    if (!langMenuOpen) {
      return;
    }

    const close = (): void => {
      setLangMenuOpen(false);
    };

    document.addEventListener(
      'click',
      close
    );

    return () => {
      document.removeEventListener(
        'click',
        close
      );
    };
  }, [langMenuOpen]);

  const persist = useCallback(
    async (
      next: ProjectsMap
    ): Promise<void> => {
      setProjects({ ...next });

      await window.api.saveProjects(
        next
      );
    },
    []
  );

  // -----------------------------------------------------------------------
  // CRÉATION
  // -----------------------------------------------------------------------

  const openNewProjectModal =
    (): void => {
      const projectNumber =
        Object.keys(projects).length + 1;

      setNewProjectDraft(
        createNewProjectDraft(
          `${t('defaultProjectName')} ${projectNumber}`
        )
      );
    };

  const chooseProjectType = (
    projectType: ProjectType
  ): void => {
    setNewProjectDraft(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const projectNumber =
          Object.keys(projects).length +
          1;

        const defaultName =
          projectType === 'screenplay'
            ? lang === 'fr'
              ? `Scénario ${projectNumber}`
              : `Screenplay ${projectNumber}`
            : `${t(
                'defaultProjectName'
              )} ${projectNumber}`;

        return {
          ...previous,
          projectType,
          name: defaultName,
          conventionLanguage:
            lang === 'en'
              ? 'en'
              : 'fr'
        };
      }
    );

    window.setTimeout(() => {
      newProjectInputRef.current?.focus();
      newProjectInputRef.current?.select();
    }, 0);
  };

  const returnToProjectTypeChoice =
    (): void => {
      setNewProjectDraft(
        (previous) =>
          previous
            ? {
                ...previous,
                projectType: null
              }
            : previous
      );
    };

  const confirmNewProject =
    async (): Promise<void> => {
      if (
        !newProjectDraft ||
        !newProjectDraft.projectType
      ) {
        return;
      }

      const name =
        newProjectDraft.name.trim();

      if (!name) {
        showInfo(t('nameRequired'));
        return;
      }

      if (projects[name]) {
        showInfo(t('alreadyExists'));
        return;
      }

      let newProject: ProjectData;

if (
  newProjectDraft.projectType ===
  'screenplay'
) {
  const interiorExterior =
    newProjectDraft.interiorExterior;

  const customInteriorExterior =
    interiorExterior === 'OTHER'
      ? newProjectDraft
          .customInteriorExterior
          .trim()
      : '';

  newProject =
    createScreenplayProject({
      title: name,
      author:
        newProjectDraft.author.trim(),
      conventionLanguage:
        newProjectDraft
          .conventionLanguage,
      pageFormat:
        newProjectDraft.pageFormat,
      firstScene: {
        workingTitle:
          newProjectDraft
            .workingTitle
            .trim(),
        interiorExterior,
        customInteriorExterior,
        location:
          newProjectDraft
            .location
            .trim(),
        time:
          newProjectDraft
            .time
            .trim()
      }
    });
}
 else {
        newProject = {
          projectType: 'novel',
          chapters: {
            'Chapitre 1': ''
          },
          world: {},
          customWbTypes: {},
          writingSessions: [],
          goals: []
        };
      }

      const next: ProjectsMap = {
        ...projects,
        [name]: newProject
      };

      await persist(next);

      setNewProjectDraft(null);

      await onOpenProject(name);
    };

  // -----------------------------------------------------------------------
  // RENOMMAGE
  // -----------------------------------------------------------------------

  const openRenameModal = (
    name: string
  ): void => {
    setRenaming({
      oldName: name,
      value: name
    });

    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const confirmRename =
    async (): Promise<void> => {
      if (!renaming) {
        return;
      }

      const { oldName } = renaming;

      const newName =
        renaming.value.trim();

      if (
        !newName ||
        newName === oldName
      ) {
        setRenaming(null);
        return;
      }

      if (projects[newName]) {
        showInfo(t('alreadyExists'));
        return;
      }

      const next: ProjectsMap = {};

      Object.keys(projects).forEach(
        (key) => {
          if (key !== oldName) {
            next[key] =
              projects[key];

            return;
          }

          const oldProject =
            normalizeProjectData(
              projects[oldName]
            );

          const screenplay =
            oldProject.screenplay
              ? {
                  ...oldProject.screenplay,
                  titlePage: {
                    ...oldProject.screenplay
                      .titlePage,
                    title:
                      oldProject.screenplay
                        .titlePage.title ||
                      newName
                  }
                }
              : undefined;

          next[newName] = {
            ...oldProject,
            ...(screenplay
              ? { screenplay }
              : {}),
            writingSessions:
              oldProject.writingSessions?.map(
                (session) => ({
                  ...session,
                  projectName: newName
                })
              ) || []
          };
        }
      );

      await persist(next);

      const uiState =
        await window.api.getUiState();

      if (uiState[oldName]) {
        uiState[newName] =
          uiState[oldName];

        delete uiState[oldName];

        await window.api.saveUiState(
          uiState
        );
      }

      await renameWritingStatsProject(
        oldName,
        newName
      );

      const currentProject =
        await window.api.getCurrentProject();

      if (
        currentProject === oldName
      ) {
        await window.api.setCurrentProject(
          newName
        );
      }

      setRenaming(null);
    };

  // -----------------------------------------------------------------------
  // SUPPRESSION
  // -----------------------------------------------------------------------

  const deleteProject = async (
    name: string
  ): Promise<void> => {
    const confirmed =
      await showConfirm(
        t('confirmDeleteProject', {
          name
        })
      );

    if (!confirmed) {
      return;
    }

    const next = {
      ...projects
    };

    delete next[name];

    await persist(next);

    const uiState =
      await window.api.getUiState();

    if (uiState[name]) {
      delete uiState[name];

      await window.api.saveUiState(
        uiState
      );
    }

    await deleteWritingStatsProject(
      name
    );

    const currentProject =
      await window.api.getCurrentProject();

    if (currentProject === name) {
      await window.api.clearCurrentProject();
    }
  };

  // -----------------------------------------------------------------------
  // EXPORT
  // -----------------------------------------------------------------------

  const exportProject = async (
    name: string
  ): Promise<void> => {
    const result =
      await window.api.showSaveDialog({
        title:
          lang === 'fr'
            ? 'Exporter le projet'
            : 'Export project',
        defaultPath: `${name}.scriptorium`,
        filters: [
          {
            name: 'Projet Scriptorium',
            extensions: [
              'scriptorium'
            ]
          }
        ]
      });

    if (
      result.canceled ||
      !result.filePath
    ) {
      return;
    }

    try {
      await window.api.exportProject(
        result.filePath,
        name,
        normalizeProjectData(
          projects[name]
        )
      );

      showInfo(
        t('exportSuccess')
      );
    } catch (error) {
      console.error(error);

      showInfo(
        t('exportError') +
          describeError(error)
      );
    }
  };

  // -----------------------------------------------------------------------
  // IMPORT
  // -----------------------------------------------------------------------

  const importProject =
    async (): Promise<void> => {
      const result =
        await window.api.showOpenDialog({
          title:
            lang === 'fr'
              ? 'Importer un projet ou un document LibreOffice'
              : 'Import a project or LibreOffice document',
          filters: [
            {
              name:
                lang === 'fr'
                  ? 'Formats pris en charge'
                  : 'Supported formats',
              extensions: [
                'scriptorium',
                'odt',
                'json'
              ]
            },
            {
              name:
                lang === 'fr'
                  ? 'Document LibreOffice Writer'
                  : 'LibreOffice Writer document',
              extensions: ['odt']
            },
            {
              name:
                lang === 'fr'
                  ? 'Projet Scriptorium'
                  : 'Scriptorium project',
              extensions: [
                'scriptorium',
                'json'
              ]
            }
          ],
          properties: ['openFile']
        });

      if (
        result.canceled ||
        !result.filePaths ||
        result.filePaths.length === 0
      ) {
        return;
      }

      const selectedFile =
        result.filePaths[0];

      try {
        const imported =
          await window.api.importProject(
            selectedFile
          );

        let name =
          imported.projectName.trim();

        if (!name) {
          name =
            t('defaultProjectName');
        }

        if (projects[name]) {
          const baseName = name;
          let index = 2;

          while (
            projects[
              `${baseName} (${index})`
            ]
          ) {
            index++;
          }

          name = `${baseName} (${index})`;
        }

        const importedProject =
          normalizeProjectData(
            imported.projectData
          );

        const normalizedImportedProject: ProjectData =
          {
            ...importedProject,
            writingSessions:
              importedProject.writingSessions?.map(
                (session) => ({
                  ...session,
                  projectName: name
                })
              ) || []
          };

        await persist({
          ...projects,
          [name]:
            normalizedImportedProject
        });

        showInfo(
          t('importSuccess', {
            name
          })
        );
      } catch (error) {
        console.error(error);

        const errorPrefix =
          lang === 'fr'
            ? "Erreur lors de l'importation : le fichier sélectionné n'est peut-être pas un projet Scriptorium ou un document ODT valide.\n\n"
            : 'Import error: the selected file may not be a valid Scriptorium project or ODT document.\n\n';

        showInfo(
          errorPrefix +
            describeError(error)
        );
      }
    };

  const projectNames =
    Object.keys(projects);

  const newProjectTitle =
    newProjectDraft?.projectType ===
    'screenplay'
      ? lang === 'fr'
        ? 'Nouveau scénario'
        : 'New screenplay'
      : newProjectDraft?.projectType ===
          'novel'
        ? lang === 'fr'
          ? 'Nouveau roman'
          : 'New novel'
        : lang === 'fr'
          ? 'Choisir le type de projet'
          : 'Choose the project type';

  return (
    <>
      <div className="menu-container">
        <header className="menu-header">
          <div className="menu-header-title">
            <h1>📖 Scriptorium</h1>

            <span className="menu-header-subtitle">
              {projectNames.length ===
              0
                ? t('noProjects')
                : t(
                    'projectCountSubtitle',
                    {
                      count:
                        projectNames.length
                    }
                  )}
            </span>
          </div>

          <div className="menu-header-actions">
            <div
              className="theme-menu-container"
              style={{
                position: 'relative'
              }}
            >
              <button
                id="btnLangToggle"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();

                  setLangMenuOpen(
                    (value) => !value
                  );
                }}
              >
                {t('langToggle')}
              </button>

              <div
                className={`theme-dropdown${
                  langMenuOpen
                    ? ' show'
                    : ''
                }`}
              >
                {(
                  [
                    'fr',
                    'en'
                  ] as LanguageCode[]
                ).map((code) => (
                  <div
                    key={code}
                    className="theme-item"
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => {
                      changeLanguage(code);
                      setLangMenuOpen(
                        false
                      );
                    }}
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                          'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault();

                        changeLanguage(
                          code
                        );

                        setLangMenuOpen(
                          false
                        );
                      }
                    }}
                    style={
                      code === lang
                        ? {
                            color:
                              'var(--accent)'
                          }
                        : undefined
                    }
                  >
                    {t(
                      code === 'fr'
                        ? 'langFr'
                        : 'langEn'
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              id="btnImportProject"
              type="button"
              title={
                lang === 'fr'
                  ? 'Importer un projet Scriptorium ou un document LibreOffice Writer'
                  : 'Import a Scriptorium project or LibreOffice Writer document'
              }
              onClick={() => {
                void importProject();
              }}
            >
              {t('importProject')}
            </button>

            <button
              id="btnNewProject"
              type="button"
              className="btn-primary"
              onClick={
                openNewProjectModal
              }
            >
              {t('newProject')}
            </button>
          </div>
        </header>

        <div
          id="projectsList"
          className="projects-list"
        >
          {projectNames.length ===
          0 ? (
            <div className="projects-empty-state">
              <span className="projects-empty-icon">
                📚
              </span>

              <h3>
                {t('noProjects')}
              </h3>

              <p>
                {t('noProjectsHint')}
              </p>

              <button
                type="button"
                className="btn-primary"
                onClick={
                  openNewProjectModal
                }
              >
                {t('newProject')}
              </button>
            </div>
          ) : (
            projectNames.map(
              (name) => (
                <ProjectCard
                  key={name}
                  name={name}
                  data={
                    projects[name]
                  }
                  onOpen={() => {
                    void onOpenProject(
                      name
                    );
                  }}
                  onRename={() => {
                    openRenameModal(
                      name
                    );
                  }}
                  onExport={() => {
                    void exportProject(
                      name
                    );
                  }}
                  onDelete={() => {
                    void deleteProject(
                      name
                    );
                  }}
                />
              )
            )
          )}
        </div>
      </div>

      <Modal
        open={
          newProjectDraft !== null
        }
        title={newProjectTitle}
        width={
          newProjectDraft?.projectType ===
          'novel'
            ? 500
            : 680
        }
        onCancel={() => {
          setNewProjectDraft(null);
        }}
        onPrimary={() => {
          if (
            newProjectDraft?.projectType
          ) {
            void confirmNewProject();
          }
        }}
        footer={
          newProjectDraft?.projectType ? (
            <>
              <button
                type="button"
                onClick={
                  returnToProjectTypeChoice
                }
              >
                {lang === 'fr'
                  ? 'Retour'
                  : 'Back'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewProjectDraft(
                    null
                  );
                }}
              >
                {t('cancel')}
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void confirmNewProject();
                }}
              >
                {t('create')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewProjectDraft(null);
              }}
            >
              {t('cancel')}
            </button>
          )
        }
      >
        {newProjectDraft &&
        !newProjectDraft.projectType ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: 16
            }}
          >
            <button
              type="button"
              onClick={() => {
                chooseProjectType(
                  'novel'
                );
              }}
              style={{
                display: 'flex',
                minHeight: 190,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 24,
                border:
                  '1px solid var(--border)',
                borderRadius: 12,
                background:
                  'var(--bg-panel)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: 44
                }}
              >
                📖
              </span>

              <strong
                style={{
                  fontSize: 18
                }}
              >
                {lang === 'fr'
                  ? 'Roman'
                  : 'Novel'}
              </strong>

              <span
                style={{
                  color:
                    'var(--text-muted)',
                  textAlign: 'center',
                  lineHeight: 1.5
                }}
              >
                {lang === 'fr'
                  ? 'Écriture organisée en chapitres avec mise en page libre.'
                  : 'Writing organized into chapters with free formatting.'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                chooseProjectType(
                  'screenplay'
                );
              }}
              style={{
                display: 'flex',
                minHeight: 190,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 24,
                border:
                  '1px solid var(--border)',
                borderRadius: 12,
                background:
                  'var(--bg-panel)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: 44
                }}
              >
                🎬
              </span>

              <strong
                style={{
                  fontSize: 18
                }}
              >
                {lang === 'fr'
                  ? 'Scénario'
                  : 'Screenplay'}
              </strong>

              <span
                style={{
                  color:
                    'var(--text-muted)',
                  textAlign: 'center',
                  lineHeight: 1.5
                }}
              >
                {lang === 'fr'
                  ? 'Écriture structurée en scènes avec les conventions du scénario.'
                  : 'Scene-based writing using screenplay conventions.'}
              </span>
            </button>
          </div>
        ) : null}

        {newProjectDraft?.projectType ===
        'novel' ? (
          <label
            style={{
              display: 'grid',
              gap: 8
            }}
          >
            <span>
              {lang === 'fr'
                ? 'Nom du roman'
                : 'Novel name'}
            </span>

            <input
              ref={
                newProjectInputRef
              }
              type="text"
              placeholder={t(
                'projectNamePlaceholder'
              )}
              value={
                newProjectDraft.name
              }
              onChange={(event) => {
                const value =
                  event.target.value;

                setNewProjectDraft(
                  (previous) =>
                    previous
                      ? {
                          ...previous,
                          name: value
                        }
                      : previous
                );
              }}
            />
          </label>
        ) : null}

        {newProjectDraft?.projectType ===
        'screenplay' ? (
          <div
            style={{
              display: 'grid',
              gap: 18
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 14
              }}
            >
              <label
                style={{
                  display: 'grid',
                  gap: 6
                }}
              >
                <span>
                  {lang === 'fr'
                    ? 'Nom du projet'
                    : 'Project name'}
                </span>

                <input
                  ref={
                    newProjectInputRef
                  }
                  type="text"
                  value={
                    newProjectDraft.name
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setNewProjectDraft(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              name: value
                            }
                          : previous
                    );
                  }}
                />
              </label>

              <label
                style={{
                  display: 'grid',
                  gap: 6
                }}
              >
                <span>
                  {lang === 'fr'
                    ? 'Auteur ou auteurs'
                    : 'Author or authors'}
                </span>

                <input
                  type="text"
                  value={
                    newProjectDraft.author
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setNewProjectDraft(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              author: value
                            }
                          : previous
                    );
                  }}
                />
              </label>

              <label
                style={{
                  display: 'grid',
                  gap: 6
                }}
              >
                <span>
                  {lang === 'fr'
                    ? 'Convention'
                    : 'Convention'}
                </span>

                <select
                  value={
                    newProjectDraft
                      .conventionLanguage
                  }
                  onChange={(event) => {
                    const value =
                      event.target
                        .value as ScreenplayConventionLanguage;

                    setNewProjectDraft(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              conventionLanguage:
                                value
                            }
                          : previous
                    );
                  }}
                >
                  <option value="fr">
                    Française
                  </option>

                  <option value="en">
                    English
                  </option>
                </select>
              </label>

              <label
                style={{
                  display: 'grid',
                  gap: 6
                }}
              >
                <span>
                  {lang === 'fr'
                    ? 'Format de page'
                    : 'Page format'}
                </span>

                <select
                  value={
                    newProjectDraft
                      .pageFormat
                  }
                  onChange={(event) => {
                    const value =
                      event.target
                        .value as ScreenplayPageFormat;

                    setNewProjectDraft(
                      (previous) =>
                        previous
                          ? {
                              ...previous,
                              pageFormat:
                                value
                            }
                          : previous
                    );
                  }}
                >
                  <option value="a4">
                    A4
                  </option>

                  <option value="letter">
                    US Letter
                  </option>
                </select>
              </label>
            </div>

            <div
              style={{
                paddingTop: 14,
                borderTop:
                  '1px solid var(--border)'
              }}
            >
              <strong>
                {lang === 'fr'
                  ? 'Première scène'
                  : 'First scene'}
              </strong>

              <p
                style={{
                  margin:
                    '6px 0 14px',
                  color:
                    'var(--text-muted)',
                  fontSize: 13
                }}
              >
                {lang === 'fr'
                  ? 'Ces informations pourront être modifiées ultérieurement.'
                  : 'This information can be changed later.'}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(2, minmax(0, 1fr))',
                  gap: 14
                }}
              >
                <label
                  style={{
                    display: 'grid',
                    gap: 6,
                    gridColumn:
                      '1 / -1'
                  }}
                >
                  <span>
                    {lang === 'fr'
                      ? 'Titre de travail facultatif'
                      : 'Optional working title'}
                  </span>

                  <input
                    type="text"
                    placeholder={
                      lang === 'fr'
                        ? 'Ex. La rencontre'
                        : 'E.g. The meeting'
                    }
                    value={
                      newProjectDraft
                        .workingTitle
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setNewProjectDraft(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                workingTitle:
                                  value
                              }
                            : previous
                      );
                    }}
                  />
                </label>

                <label
                  style={{
                    display: 'grid',
                    gap: 6
                  }}
                >
                  <span>
                    {lang === 'fr'
                      ? 'Intérieur / extérieur'
                      : 'Interior / exterior'}
                  </span>

                  <select
                    value={
                      newProjectDraft
                        .interiorExterior
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value as ScreenplayInteriorExterior;

                      setNewProjectDraft(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                interiorExterior:
                                  value
                              }
                            : previous
                      );
                    }}
                  >
                    <option value="INT.">
                      INT.
                    </option>

                    <option value="EXT.">
                      EXT.
                    </option>

                    <option value="INT./EXT.">
                      INT./EXT.
                    </option>

                    <option value="EXT./INT.">
                      EXT./INT.
                    </option>

                    <option value="OTHER">
                      {lang === 'fr'
                        ? 'Autre…'
                        : 'Other…'}
                    </option>
                  </select>
                </label>

                {newProjectDraft
                  .interiorExterior ===
                'OTHER' ? (
                  <label
                    style={{
                      display: 'grid',
                      gap: 6
                    }}
                  >
                    <span>
                      {lang === 'fr'
                        ? 'Mention personnalisée'
                        : 'Custom prefix'}
                    </span>

                    <input
                      type="text"
                      placeholder="I/E."
                      value={
                        newProjectDraft
                          .customInteriorExterior
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          event.target
                            .value;

                        setNewProjectDraft(
                          (previous) =>
                            previous
                              ? {
                                  ...previous,
                                  customInteriorExterior:
                                    value
                                }
                              : previous
                        );
                      }}
                    />
                  </label>
                ) : (
                  <label
                    style={{
                      display: 'grid',
                      gap: 6
                    }}
                  >
                    <span>
                      {lang === 'fr'
                        ? 'Lieu'
                        : 'Location'}
                    </span>

                    <input
                      type="text"
                      placeholder={
                        lang === 'fr'
                          ? 'APPARTEMENT'
                          : 'APARTMENT'
                      }
                      value={
                        newProjectDraft
                          .location
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          event.target
                            .value;

                        setNewProjectDraft(
                          (previous) =>
                            previous
                              ? {
                                  ...previous,
                                  location:
                                    value
                                }
                              : previous
                        );
                      }}
                    />
                  </label>
                )}

                {newProjectDraft
                  .interiorExterior ===
                'OTHER' ? (
                  <label
                    style={{
                      display: 'grid',
                      gap: 6
                    }}
                  >
                    <span>
                      {lang === 'fr'
                        ? 'Lieu'
                        : 'Location'}
                    </span>

                    <input
                      type="text"
                      placeholder={
                        lang === 'fr'
                          ? 'APPARTEMENT'
                          : 'APARTMENT'
                      }
                      value={
                        newProjectDraft
                          .location
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          event.target
                            .value;

                        setNewProjectDraft(
                          (previous) =>
                            previous
                              ? {
                                  ...previous,
                                  location:
                                    value
                                }
                              : previous
                        );
                      }}
                    />
                  </label>
                ) : null}

                <label
                  style={{
                    display: 'grid',
                    gap: 6,
                    gridColumn:
                      newProjectDraft
                        .interiorExterior ===
                      'OTHER'
                        ? undefined
                        : '1 / -1'
                  }}
                >
                  <span>
                    {lang === 'fr'
                      ? 'Moment'
                      : 'Time'}
                  </span>

                  <input
                    type="text"
                    placeholder={
                      newProjectDraft
                        .conventionLanguage ===
                      'fr'
                        ? 'JOUR'
                        : 'DAY'
                    }
                    value={
                      newProjectDraft.time
                    }
                    onChange={(event) => {
                      const value =
                        event.target.value;

                      setNewProjectDraft(
                        (previous) =>
                          previous
                            ? {
                                ...previous,
                                time: value
                              }
                            : previous
                      );
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  border:
                    '1px solid var(--border)',
                  borderRadius: 8,
                  background:
                    'var(--bg-input)'
                }}
              >
                <span
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    color:
                      'var(--text-muted)',
                    fontSize: 12
                  }}
                >
                  {lang === 'fr'
                    ? "Aperçu de l'en-tête"
                    : 'Scene heading preview'}
                </span>

                <strong
                  style={{
                    fontFamily:
                      "'Courier Prime', 'Courier New', monospace",
                    fontSize: 14
                  }}
                >
{getDefaultSceneHeading(
  {
    interiorExterior:
      newProjectDraft
        .interiorExterior,
    customInteriorExterior:
      newProjectDraft
        .interiorExterior ===
      'OTHER'
        ? newProjectDraft
            .customInteriorExterior
        : '',
    location:
      newProjectDraft.location,
    time:
      newProjectDraft.time
  },
  newProjectDraft
    .conventionLanguage
)}

                </strong>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={renaming !== null}
        title={t(
          'renameProjectModalTitle'
        )}
        onCancel={() => {
          setRenaming(null);
        }}
        onPrimary={() => {
          void confirmRename();
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRenaming(null);
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={() => {
                void confirmRename();
              }}
            >
              {t('rename')}
            </button>
          </>
        }
      >
        <input
          ref={renameInputRef}
          type="text"
          placeholder={t(
            'newNamePlaceholder'
          )}
          value={
            renaming?.value ?? ''
          }
          onChange={(event) => {
            setRenaming(
              (previous) =>
                previous
                  ? {
                      ...previous,
                      value:
                        event.target
                          .value
                    }
                  : previous
            );
          }}
        />
      </Modal>
    </>
  );
}
