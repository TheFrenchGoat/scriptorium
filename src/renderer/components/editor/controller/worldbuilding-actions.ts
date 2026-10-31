// Actions Worldbuilding du contrôleur d'édition : champs, icône, image,
// couleur et alias d'une fiche, mode lecture, chapitres et scènes qui
// mentionnent une fiche, types personnalisés.
// Code déplacé tel quel depuis useEditorController.ts (étape 4c-7) ; les valeurs
// du hook arrivent par le contexte et sont déstructurées au début de
// createWorldbuildingActions pour que le code reste identique.

import type { WbItem } from '../../../../shared/types';
import { getSceneDisplayTitle } from '../../../lib/screenplay';
import { cloneWbData } from '../../../lib/wb-history';
import type { WbHistoryEntry } from '../../../lib/wb-history';
import type { MentionIndex } from '../../../lib/mention-index';
import type { WbRegistry } from '../../../lib/wb-registry';
import { t } from '../../../i18n';
import { isScreenplayData, slugify, touchWbItem } from './utils';
import type { EditorController, EditorControllerDeps, MutableState } from './types';

/**
 * Ce dont les actions Worldbuilding ont besoin ; fourni par useEditorController.
 * ctrl est un relais : il n'est appelé qu'à la suppression d'un type
 * personnalisé, quand le contrôleur est entièrement construit.
 */
export interface WorldbuildingActionsContext {
  showInfo: EditorControllerDeps['showInfo'];
  showConfirm: EditorControllerDeps['showConfirm'];
  bump: () => void;
  s: MutableState;
  registry: WbRegistry;
  mentionIndex: MentionIndex;
  setSaveStatus: (state: 'saved' | 'pending' | 'error') => void;
  saveAll: () => Promise<void>;
  scheduleWbSave: () => void;
  highlight: () => boolean;
  flushPendingHistoryCommit: () => void;
  activeChapterEditor: () => { name: string; editor: HTMLElement } | null;
  takeWbSnapshot: () => Record<string, unknown>;
  recordWbChange: (
    labelKey: WbHistoryEntry['labelKey'],
    before: Record<string, unknown>,
    extras?: { undoExtra?: () => void; redoExtra?: () => void },
  ) => void;
  recordWbItemChange: (
    labelKey: WbHistoryEntry['labelKey'],
    itemId: string,
    before: WbItem,
    mergeKey?: string,
  ) => void;
  resyncChapters: (changedChapters: string[], openChapter: string | null) => void;
  ctrl: Pick<EditorController, 'itemsUsingType' | 'openItem'>;
}

/** Les 11 méthodes Worldbuilding du contrôleur. */
export type WorldbuildingActions = Pick<
  EditorController,
  | 'updateWbField'
  | 'setWbIcon'
  | 'setWbIconImage'
  | 'setWbColor'
  | 'setWbAliases'
  | 'toggleReadMode'
  | 'chaptersContaining'
  | 'scenesContaining'
  | 'itemsUsingType'
  | 'saveCustomType'
  | 'deleteCustomType'
>;

export function createWorldbuildingActions(ctx: WorldbuildingActionsContext): WorldbuildingActions {
  const {
    showInfo,
    showConfirm,
    bump,
    s,
    registry,
    mentionIndex,
    setSaveStatus,
    saveAll,
    scheduleWbSave,
    highlight,
    flushPendingHistoryCommit,
    activeChapterEditor,
    takeWbSnapshot,
    recordWbChange,
    recordWbItemChange,
    resyncChapters,
    ctrl,
  } = ctx;

  return {
    updateWbField(itemId, fieldKey, value) {
      const item = s.projectData.world[itemId];

      if (!item) {
        return;
      }

      if (item.content[fieldKey] === value) {
        return;
      }

      const wbBefore = cloneWbData(item);

      item.content[fieldKey] = value;
      touchWbItem(item);

      recordWbItemChange('wbHistItemEdit', itemId, wbBefore, 'field:' + itemId + ':' + fieldKey);

      s.hasUnsavedChangesSinceLastBackup = true;

      setSaveStatus('pending');

      scheduleWbSave();

      // Sans ce rafraîchissement, le champ (piloté par React) réaffiche
      // aussitôt l'ancienne valeur : la frappe semble ne rien faire.
      bump();
    },

    setWbIcon(itemId, icon) {
      const item = s.projectData.world[itemId];

      if (!item) {
        return;
      }

      const wbBefore = cloneWbData(item);

      item.icon = icon;
      touchWbItem(item);

      recordWbItemChange('wbHistItemIcon', itemId, wbBefore);

      setSaveStatus('pending');

      void saveAll();
      bump();
    },

    setWbIconImage(itemId, image) {
      const item = s.projectData.world[itemId];

      if (!item) {
        return;
      }

      const wbBefore = cloneWbData(item);

      if (image) { item.iconImage = image; } else { delete item.iconImage; }
      touchWbItem(item);

      recordWbItemChange('wbHistItemIcon', itemId, wbBefore);

      setSaveStatus('pending');

      void saveAll();
      bump();
    },

    setWbColor(itemId, color) {
      const item = s.projectData.world[itemId];

      if (!item) {
        return;
      }

      const wbBefore = cloneWbData(item);

      item.color = color;
      touchWbItem(item);

      recordWbItemChange('wbHistItemColor', itemId, wbBefore, 'color:' + itemId);

      s.wbColorVersion += 1;

      setSaveStatus('pending');

      void saveAll();
      bump();
    },

    setWbAliases(itemId, aliases) {
      const item = s.projectData.world[itemId];

      if (!item) {
        return false;
      }

      const keyOf = (value: string): string =>
        value.normalize('NFC').trim().toLocaleLowerCase();

      // Nettoyage : sans vide, sans doublon, sans le nom de la fiche.
      const ownNameKey = keyOf(item.name);
      const seen = new Set<string>();
      const cleaned: string[] = [];

      aliases.forEach((raw) => {
        const alias = typeof raw === 'string' ? raw.trim() : '';
        const key = keyOf(alias);

        if (!alias || key === ownNameKey || seen.has(key)) {
          return;
        }

        seen.add(key);
        cleaned.push(alias);
      });

      // Un alias ne doit pas être le nom ou l'alias d'une autre fiche.
      for (const otherId of Object.keys(s.projectData.world)) {
        if (otherId === itemId) {
          continue;
        }

        const other = s.projectData.world[otherId];

        if (!other) {
          continue;
        }

        const otherKeys = new Set<string>([keyOf(other.name)]);

        if (Array.isArray(other.aliases)) {
          other.aliases.forEach((alias) => otherKeys.add(keyOf(alias)));
        }

        const conflict = cleaned.find((alias) => otherKeys.has(keyOf(alias)));

        if (conflict) {
          showInfo(
            t('wbAliasConflict', { alias: conflict, name: other.name })
          );
          return false;
        }
      }

      const previous = Array.isArray(item.aliases) ? item.aliases : [];

      const unchanged =
        previous.length === cleaned.length &&
        previous.every((alias, index) => alias === cleaned[index]);

      if (unchanged) {
        return true;
      }

      const wbBefore = cloneWbData(item);

      item.aliases = cleaned;

      recordWbItemChange('wbHistItemAliases', itemId, wbBefore);
      touchWbItem(item);

      mentionIndex.refreshItem(itemId);
      registry.bumpVersion();

      // Chapitre ouvert : les nouveaux alias sont surlignés tout de suite,
      // et les mentions d'un alias retiré redeviennent du texte simple.
      const open = activeChapterEditor();

      if (open) {
        flushPendingHistoryCommit();
        highlight();
        s.projectData.chapters[open.name] = open.editor.innerHTML;
        resyncChapters([], open.name);
      }

      s.hasUnsavedChangesSinceLastBackup = true;

      setSaveStatus('pending');

      void saveAll();
      bump();

      return true;
    },

    /**
     * Mode lecture d'une fiche.
     *
     * - Avec un identifiant (panneau latéral, ou fiche affichée dans un
     *   onglet) : c'est cette fiche qui bascule.
     * - Sans identifiant (barre d'outils, raccourci) : la fiche de l'onglet
     *   actif, comme avant.
     */
    toggleReadMode(itemId) {
      const targetId =
        itemId ?? (s.activeType === 'world' ? s.activeTab : null);

      if (!targetId) {
        return;
      }

      const item = s.projectData.world[targetId];

      if (!item) {
        return;
      }

      item.readMode = !item.readMode;

      scheduleWbSave();
      bump();
    },

    chaptersContaining(itemId) {
      return mentionIndex.chaptersContaining(itemId);
    },

    scenesContaining(itemId) {
      if (!isScreenplayData(s.projectData)) {
        return [];
      }

      const screenplay = s.projectData.screenplay;
      const sceneIds = mentionIndex.scenesContaining(
        itemId,
        screenplay.scenes
      );

      return sceneIds.flatMap((sceneId) => {
        const index = screenplay.scenes.findIndex(
          (scene) => scene.id === sceneId
        );

        if (index < 0) {
          return [];
        }

        const title = getSceneDisplayTitle(
          screenplay.scenes[index],
          index,
          screenplay.settings.conventionLanguage
        );

        return [{ id: sceneId, title }];
      });
    },

    itemsUsingType(slug) {
      return Object.keys(s.projectData.world).filter(
        (itemId) => s.projectData.world[itemId].wbType === slug
      );
    },

    saveCustomType(slug, definition) {
      const categories = registry.cloneCategoryDefinitions();

      let finalSlug = slug;

      if (!finalSlug) {
        const baseSlug = `custom_${slugify(definition.label, 'type')}`;

        finalSlug = baseSlug;

        let index = 2;

        while (categories[finalSlug]) {
          finalSlug = `${baseSlug}_${index}`;
          index += 1;
        }
      }

      const previous = categories[finalSlug];

      categories[finalSlug] = previous
        ? { ...previous, ...definition, builtin: previous.builtin }
        : { ...definition };

      const wbBefore = takeWbSnapshot();

      s.projectData.wbCategories = categories;

      recordWbChange(previous ? 'wbHistCategoryEdit' : 'wbHistCategoryCreate', wbBefore);

      registry.bumpVersion();

      // L'icône ou la couleur de la catégorie a pu changer.
      s.wbColorVersion += 1;

      setSaveStatus('pending');

      void saveAll();
      bump();

      return finalSlug;
    },

    async deleteCustomType(slug) {
      const label = registry.labelFor(slug);
      const usedBy = ctrl.itemsUsingType(slug);

      if (usedBy.length > 0) {
        showInfo(
          t('customTypeDeleteBlocked', {
            count: usedBy.length,
            label
          }),
          usedBy.map((itemId) => {
            const item = s.projectData.world[itemId];

            return {
              label: `${registry.iconFor(item)} ${item.name}`,
              onClick: () => {
                ctrl.openItem(itemId, 'world');
              }
            };
          })
        );

        return;
      }

      const confirmed = await showConfirm(
        t('customTypeConfirmDelete', { label })
      );

      if (!confirmed) {
        return;
      }

      const categories = registry.cloneCategoryDefinitions();

      delete categories[slug];

      const wbBefore = takeWbSnapshot();

      s.projectData.wbCategories = categories;

      recordWbChange('wbHistCategoryDelete', wbBefore);

      registry.bumpVersion();

      setSaveStatus('pending');

      bump();

      await saveAll();
    },
  };
}
