// src/renderer/components/menu/ProjectsPage.tsx
// Écran d'accueil : liste des projets, création, importation, renommage,
// suppression et accès rapide aux objectifs.
//
// Les sessions d'écriture et les objectifs font partie du projet. Lors d'un
// renommage, les sessions existantes ainsi que l'ancien historique statistique
// sont associés au nouveau nom du projet.
//
// Le bouton d'importation accepte :
// - les projets Scriptorium (.scriptorium et anciens fichiers .json) ;
// - les documents LibreOffice Writer (.odt).
//
// Pour un document ODT, le processus principal crée automatiquement un projet
// et découpe son contenu en chapitres.

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
import type {
  LanguageCode,
  ProjectData,
  ProjectsMap,
  WritingStats
} from '../../../shared/types';

export interface ProjectsPageProps {
  onOpenProject: (
    name: string
  ) => void | Promise<void>;
}

/**
 * Normalise un projet importé ou provenant d'une ancienne version.
 *
 * Les propriétés liées aux sessions et aux objectifs sont optionnelles dans
 * le type partagé afin de rester compatibles avec les anciens fichiers.
 * Dans l'état local de cette page, on les initialise systématiquement.
 */
function normalizeProjectData(
  data: ProjectData
): ProjectData {
  return {
    ...data,
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
 *
 * Les sessions détaillées sont stockées directement dans ProjectData, mais
 * l'ancien compteur quotidien reste dans WritingStats pour compatibilité.
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
    newProjectName,
    setNewProjectName
  ] = useState<string | null>(null);

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
      setNewProjectName(
        `${t('defaultProjectName')} ${
          Object.keys(projects).length +
          1
        }`
      );

      setTimeout(() => {
        newProjectInputRef.current?.focus();
        newProjectInputRef.current?.select();
      }, 0);
    };

  const confirmNewProject =
    async (): Promise<void> => {
      const name = (
        newProjectName ?? ''
      ).trim();

      if (!name) {
        showInfo(t('nameRequired'));
        return;
      }

      if (projects[name]) {
        showInfo(t('alreadyExists'));
        return;
      }

      const newProject: ProjectData = {
        chapters: {
          'Chapitre 1': ''
        },
        world: {},
        customWbTypes: {},
        writingSessions: [],
        goals: []
      };

      const next: ProjectsMap = {
        ...projects,
        [name]: newProject
      };

      await persist(next);

      setNewProjectName(null);

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

    setTimeout(() => {
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

      /*
       * On reconstruit l'objet en conservant l'ordre des clés.
       * Sans cela, le projet renommé serait déplacé à la fin de la liste.
       */
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

          /*
           * Une session mémorise aussi le nom du projet afin que son historique
           * reste compréhensible. Lors d'un renommage volontaire, on actualise
           * cette copie pour éviter d'afficher l'ancien nom.
           */
          next[newName] = {
            ...oldProject,
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

      /*
       * Déplace également les onglets et l'onglet actif éventuellement
       * persistés sous l'ancien nom.
       */
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

      /*
       * Compatibilité avec l'ancien historique quotidien de mots.
       */
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

    /*
     * Les statistiques historiques d'un projet supprimé ne doivent pas
     * laisser une entrée orpheline dans le store.
     */
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
        title: 'Exporter le projet',
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
        /*
         * Le processus principal détermine le type du fichier avec son
         * extension :
         *
         * - .scriptorium/.json : importation classique ;
         * - .odt : lecture du document LibreOffice et découpage automatique
         *   en chapitres.
         *
         * Dans les deux cas, le renderer reçoit le même objet ImportedProject.
         */
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

        /*
         * Évite d'écraser un projet existant portant le même nom.
         */
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

        /*
         * Si le projet importé contient des sessions, leur nom de projet est
         * ajusté lorsque le nom a dû être modifié pour éviter un doublon.
         *
         * Un document ODT ne contient normalement aucune session, mais la
         * normalisation garantit la même structure pour tous les imports.
         */
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
          newProjectName !== null
        }
        title={t(
          'newProjectModalTitle'
        )}
        onCancel={() => {
          setNewProjectName(null);
        }}
        onPrimary={() => {
          void confirmNewProject();
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setNewProjectName(
                  null
                );
              }}
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={() => {
                void confirmNewProject();
              }}
            >
              {t('create')}
            </button>
          </>
        }
      >
        <input
          ref={newProjectInputRef}
          type="text"
          placeholder={t(
            'projectNamePlaceholder'
          )}
          value={
            newProjectName ?? ''
          }
          onChange={(event) => {
            setNewProjectName(
              event.target.value
            );
          }}
        />
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
