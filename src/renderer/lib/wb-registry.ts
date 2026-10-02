// src/renderer/lib/wb-registry.ts
// Les 4 types intégrés (Personnage/Lieu/Objet/Autre) restent définis dans
// wb-config.ts. En plus, chaque projet peut définir ses propres types avec
// leurs propres champs (projectData.customWbTypes). Ce registre renvoie une
// vue FUSIONNÉE (intégrés + personnalisés de CE projet), utilisée partout où
// le code a besoin de résoudre les infos d'un type — pour ne jamais avoir à
// savoir, au point d'appel, si un wbType donné est intégré ou personnalisé.
//
// Mise en cache : ces fonctions sont appelées à chaque rendu de sidebar,
// d'onglet ou de fiche (donc très souvent), alors que customWbTypes ne change
// que sur des actions rares. `bumpVersion()` est appelé à chacune de ces
// actions ; le cache n'est reconstruit que si la version a changé.

import {
  WB_CONFIG,
  WB_DEFAULT_COLORS,
  WB_FALLBACK_COLOR,
  WB_TEMPLATES,
  type WbConfigEntry
} from './wb-config';
import type { BuiltinWbType, ProjectData, WbItem, WbTemplate, WbType } from '../../shared/types';

export interface WbRegistry {
  templates(): Record<string, WbTemplate>;
  config(): Record<string, WbConfigEntry>;
  templateFor(type: WbType): WbTemplate;
  configFor(type: WbType): WbConfigEntry;
  isCustomType(type: WbType): boolean;
  colorFor(item: WbItem | undefined | null): string;
  bumpVersion(): void;
  version(): number;
}

export function createWbRegistry(getProjectData: () => ProjectData): WbRegistry {
  let customVersion = 0;
  let cachedTemplatesVersion = -1;
  let cachedTemplates: Record<string, WbTemplate> | null = null;
  let cachedConfigVersion = -1;
  let cachedConfig: Record<string, WbConfigEntry> | null = null;

  function templates(): Record<string, WbTemplate> {
    if (cachedTemplates && cachedTemplatesVersion === customVersion) return cachedTemplates;
    const merged: Record<string, WbTemplate> = { ...WB_TEMPLATES };
    Object.entries(getProjectData().customWbTypes ?? {}).forEach(([key, def]) => {
      merged[key] = { icon: def.icon, label: def.label, fields: def.fields };
    });
    cachedTemplates = merged;
    cachedTemplatesVersion = customVersion;
    return merged;
  }

  function config(): Record<string, WbConfigEntry> {
    if (cachedConfig && cachedConfigVersion === customVersion) return cachedConfig;
    const merged: Record<string, WbConfigEntry> = { ...WB_CONFIG };
    Object.entries(getProjectData().customWbTypes ?? {}).forEach(([key, def]) => {
      // colorClass n'est utile que comme repli visuel avant qu'une couleur
      // effective (colorFor, inline) ne soit appliquée ; 'type-other' est un
      // repli neutre suffisant pour un type personnalisé.
      merged[key] = { label: def.label, colorClass: 'type-other', icon: def.icon };
    });
    cachedConfig = merged;
    cachedConfigVersion = customVersion;
    return merged;
  }

  return {
    templates,
    config,
    templateFor(type) {
      return templates()[type] ?? WB_TEMPLATES.other;
    },
    configFor(type) {
      return config()[type] ?? WB_CONFIG.other;
    },
    isCustomType(type) {
      return !!getProjectData().customWbTypes?.[type];
    },
    colorFor(item) {
      if (!item) return WB_FALLBACK_COLOR;
      if (item.color) return item.color;
      const customDef = getProjectData().customWbTypes?.[item.wbType];
      if (customDef) return customDef.defaultColor || WB_FALLBACK_COLOR;
      return WB_DEFAULT_COLORS[item.wbType as BuiltinWbType] ?? WB_FALLBACK_COLOR;
    },
    bumpVersion() {
      customVersion++;
    },
    version() {
      return customVersion;
    }
  };
}

/** Applique la couleur effective d'une fiche à une mention déjà posée. */
export function applyMentionColorStyle(span: HTMLElement, color: string): void {
  span.style.color = color;
  // ~30% d'opacité, cohérent avec les couleurs par défaut du CSS
  span.style.borderColor = color + '4d';
}
