// src/renderer/components/editor/TabsBar.tsx
//
// Barre d’onglets de l’éditeur.
//
// Types d’onglets pris en charge :
// - chapter : chapitre d’un roman ;
// - scene : scène d’un scénario ;
// - world : fiche World Building.
//
// Pour une scène, le nom technique stocké dans TabRef correspond à
// l’identifiant stable de la scène. Le libellé visible est calculé à partir
// de sa position actuelle et de son titre de travail.

import React, {
  useState
} from 'react';
import { useI18n } from '../../i18n';
import {
  getSceneDisplayTitle
} from '../../lib/screenplay';
import type {
  EditorController
} from './useEditorController';
import type {
  ItemType,
  ScreenplayScene
} from '../../../shared/types';

export interface TabsBarProps {
  controller: EditorController;
}

interface TabPresentation {
  icon: string;
  label: string;
}

/**
 * Retourne les informations visibles d’un onglet.
 *
 * Pour les scènes, `tab.name` contient l’identifiant interne stable de la
 * scène et ne doit donc pas être affiché directement à l’utilisateur.
 */
function getTabPresentation(
  name: string,
  type: ItemType,
  controller: EditorController,
  interfaceLanguage: 'fr' | 'en'
): TabPresentation {
  const data =
    controller.data();

  if (type === 'world') {
    const wbItem =
      data.world[name];

    if (!wbItem) {
      return {
        icon: '📝',
        label: name
      };
    }

    const icon =
      wbItem.icon ||
      controller.registry.templateFor(
        wbItem.wbType
      ).icon ||
      '📝';

    return {
      icon,
      label: name
    };
  }

  if (type === 'scene') {
    const screenplay =
      data.screenplay;

    if (!screenplay) {
      return {
        icon: '🎬',
        label:
          interfaceLanguage === 'en'
            ? 'Scene'
            : 'Scène'
      };
    }

    const sceneIndex =
      screenplay.scenes.findIndex(
        (scene) => scene.id === name
      );

    const scene: ScreenplayScene | undefined =
      sceneIndex >= 0
        ? screenplay.scenes[sceneIndex]
        : undefined;

    if (!scene) {
      return {
        icon: '🎬',
        label:
          interfaceLanguage === 'en'
            ? 'Missing scene'
            : 'Scène introuvable'
      };
    }

    const conventionLanguage =
      screenplay.settings
        .conventionLanguage;

    const title =
      getSceneDisplayTitle(
        scene,
        sceneIndex,
        conventionLanguage
      );

    const sceneNumberLabel =
      conventionLanguage === 'en'
        ? `Scene ${sceneIndex + 1}`
        : `Scène ${sceneIndex + 1}`;

    /*
     * Si aucun titre de travail n’est renseigné, getSceneDisplayTitle renvoie
     * déjà « Scène N » ou « Scene N ». On évite donc de répéter le libellé.
     */
    const label =
      title === sceneNumberLabel
        ? sceneNumberLabel
        : `${sceneNumberLabel} — ${title}`;

    return {
      icon: '🎬',
      label
    };
  }

  return {
    icon: '',
    label: name
  };
}

export function TabsBar({
  controller
}: TabsBarProps): React.ReactElement {
  const {
    t,
    lang
  } = useI18n();

  const tabs =
    controller.tabs();

  const activeTab =
    controller.activeTab();

  const activeType =
    controller.activeType();

  const [
    draggedIndex,
    setDraggedIndex
  ] = useState<number | null>(
    null
  );

  return (
    <div
      id="tabs"
      className="tabs-bar"
      role="tablist"
    >
      {tabs.map((tab, index) => {
        const isActive =
          tab.name === activeTab &&
          tab.type === activeType;

        const presentation =
          getTabPresentation(
            tab.name,
            tab.type,
            controller,
            lang === 'en'
              ? 'en'
              : 'fr'
          );

        const tabKey =
          `${tab.type}:${tab.name}`;

        return (
          <div
            key={tabKey}
            className={`tab${
              isActive
                ? ' active'
                : ''
            }`}
            draggable
            tabIndex={0}
            role="tab"
            aria-selected={isActive}
            aria-label={t(
              'ariaTab',
              {
                name:
                  presentation.label
              }
            )}
            title={
              presentation.label
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                  'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();

                controller.switchTab(
                  tab.name,
                  tab.type
                );

                return;
              }

              if (
                event.key ===
                'Delete'
              ) {
                event.preventDefault();

                void controller.closeTab(
                  index
                );
              }
            }}
            onMouseDown={(event) => {
              /*
               * Clic molette : fermeture directe de l’onglet.
               */
              if (
                event.button === 1
              ) {
                event.preventDefault();

                void controller.closeTab(
                  index
                );

                return;
              }

              if (
                event.button !== 0
              ) {
                return;
              }

              const target =
                event.target as HTMLElement;

              if (
                target.closest(
                  '.close-tab'
                )
              ) {
                event.preventDefault();
                event.stopPropagation();

                void controller.closeTab(
                  index
                );

                return;
              }

              controller.switchTab(
                tab.name,
                tab.type
              );
            }}
            onDragStart={(event) => {
              setDraggedIndex(
                index
              );

              event.dataTransfer.effectAllowed =
                'move';

              /*
               * Chromium exige parfois une donnée pour démarrer correctement
               * le glisser-déposer.
               */
              event.dataTransfer.setData(
                'text/plain',
                tabKey
              );
            }}
            onDragEnd={() => {
              setDraggedIndex(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();

              event.dataTransfer.dropEffect =
                'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();

              if (
                draggedIndex !== null &&
                draggedIndex !== index
              ) {
                controller.moveTab(
                  draggedIndex,
                  index
                );
              }

              setDraggedIndex(null);
            }}
          >
            <span className="tab-label">
              {presentation.icon ? (
                <span
                  className="tab-icon"
                  aria-hidden="true"
                >
                  {presentation.icon}
                </span>
              ) : null}

              <span className="tab-title">
                {presentation.label}
              </span>
            </span>

            <button
              type="button"
              className="close-tab"
              title={t(
                'closeTabTitle'
              )}
              aria-label={`${t(
                'closeTabTitle'
              )} — ${
                presentation.label
              }`}
              onMouseDown={(
                event
              ) => {
                /*
                 * Évite que le gestionnaire onMouseDown du parent active
                 * l’onglet avant sa fermeture.
                 */
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                void controller.closeTab(
                  index
                );
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
