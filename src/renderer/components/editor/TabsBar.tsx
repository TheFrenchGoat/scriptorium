// src/renderer/components/editor/TabsBar.tsx
// Barre d'onglets : clic gauche pour activer, clic molette ou icône "×" pour
// fermer, glisser-déposer pour réordonner. Reprend le comportement exact de
// l'original (mousedown plutôt que click, pour intercepter le bouton molette).

import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import type { EditorController } from './useEditorController';

export interface TabsBarProps {
  controller: EditorController;
}

export function TabsBar({ controller }: TabsBarProps): React.ReactElement {
  const { t } = useI18n();
  const tabs = controller.tabs();
  const activeTab = controller.activeTab();
  const activeType = controller.activeType();
  const data = controller.data();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  return (
    <div id="tabs" className="tabs-bar">
      {tabs.map((tab, i) => {
        const isActive = tab.name === activeTab && tab.type === activeType;
        let icon = '';
        if (tab.type === 'world') {
          const wbItem = data.world[tab.name];
          if (wbItem) icon = (wbItem.icon || controller.registry.templateFor(wbItem.wbType).icon) + ' ';
        }

        return (
          <div
            key={`${tab.type}:${tab.name}`}
            className={`tab${isActive ? ' active' : ''}`}
            draggable
            tabIndex={0}
            role="tab"
            aria-label={t('ariaTab', { name: tab.name })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                controller.switchTab(tab.name, tab.type);
              }
              if (e.key === 'Delete') {
                e.preventDefault();
                void controller.closeTab(i);
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void controller.closeTab(i);
              } else if (e.button === 0) {
                const target = e.target as HTMLElement;
                if (target.classList.contains('close-tab')) {
                  e.stopPropagation();
                  void controller.closeTab(i);
                } else {
                  controller.switchTab(tab.name, tab.type);
                }
              }
            }}
            onDragStart={() => setDraggedIndex(i)}
            onDragEnd={() => setDraggedIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.stopPropagation();
              if (draggedIndex !== null && draggedIndex !== i) {
                controller.moveTab(draggedIndex, i);
              }
              setDraggedIndex(null);
            }}
          >
            <span>
              {icon}
              {tab.name}
            </span>{' '}
            <span className="close-tab" title={t('closeTabTitle')}>
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
