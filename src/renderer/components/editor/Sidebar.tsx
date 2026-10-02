// src/renderer/components/editor/Sidebar.tsx
// Sidebar : deux sections (Chapitres / World Building), chacune avec
// glisser-déposer pour réordonner, actions renommer/supprimer révélées au
// survol ou au focus clavier, et un menu "+" pour créer un nouvel élément.

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import type { EditorController } from './useEditorController';
import type { ItemType, WbType } from '../../../shared/types';

export interface SidebarProps {
  controller: EditorController;
  onOpenCustomTypeModal: (slug: string | null) => void;
  pendingNewWbType: WbType | null;
  onConsumePendingNewWbType: () => void;
}

interface RenameState {
  oldName: string;
  type: ItemType;
  value: string;
}

export function Sidebar({
  controller,
  onOpenCustomTypeModal,
  pendingNewWbType,
  onConsumePendingNewWbType
}: SidebarProps): React.ReactElement {
  const { t } = useI18n();
  const data = controller.data();
  const activeTab = controller.activeTab();
  const activeType = controller.activeType();

  const [wbMenuOpen, setWbMenuOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState<string | null>(null);
  const [newWbState, setNewWbState] = useState<{ type: WbType; name: string } | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [draggedChapter, setDraggedChapter] = useState<string | null>(null);
  const [draggedWb, setDraggedWb] = useState<string | null>(null);

  const wbMenuRef = useRef<HTMLDivElement | null>(null);
  const newChapterInputRef = useRef<HTMLInputElement | null>(null);
  const newWbInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!wbMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!wbMenuRef.current?.contains(e.target as Node)) setWbMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [wbMenuOpen]);

  const chapterNames = Object.keys(data.chapters);
  const wbNames = Object.keys(data.world);
  const customTypes = Object.entries(data.customWbTypes ?? {});

  const openNewChapter = () => {
    const count = chapterNames.length;
    setNewChapterName(`${t('defaultChapterName')} ${count + 1}`);
    setTimeout(() => {
      newChapterInputRef.current?.focus();
      newChapterInputRef.current?.select();
    }, 0);
  };

  const confirmNewChapter = () => {
    if (newChapterName && controller.createChapter(newChapterName)) {
      setNewChapterName(null);
    }
  };

  const openNewWbModal = (type: WbType) => {
    setWbMenuOpen(false);
    setNewWbState({ type, name: '' });
    setTimeout(() => newWbInputRef.current?.focus(), 0);
  };

  const confirmNewWb = () => {
    if (newWbState && controller.createWbItem(newWbState.name, newWbState.type)) {
      setNewWbState(null);
    }
  };

  // Un nouveau type personnalisé vient d'être créé (voir CustomWbTypeModal) :
  // on enchaîne directement sur la création d'une première fiche de ce type,
  // plutôt que de faire rouvrir le menu à l'utilisateur.
  useEffect(() => {
    if (pendingNewWbType === null) return;
    openNewWbModal(pendingNewWbType);
    onConsumePendingNewWbType();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewWbType]);

  const confirmRename = () => {
    if (!renaming) return;
    void controller.renameItem(renaming.oldName, renaming.value, renaming.type).then((ok) => {
      if (ok) setRenaming(null);
    });
  };

  const wbTypeLabel = (type: WbType): string => {
    const custom = data.customWbTypes?.[type];
    if (custom) return custom.label;
    return t(`wbLabel_${type}` as never);
  };

  const handleChapterDrop = (targetName: string) => {
    if (!draggedChapter || draggedChapter === targetName) return;
    const order = chapterNames.slice();
    const from = order.indexOf(draggedChapter);
    const to = order.indexOf(targetName);
    order.splice(from, 1);
    order.splice(to, 0, draggedChapter);
    controller.reorderSidebar('chapter', order);
    setDraggedChapter(null);
  };

  const handleWbDrop = (targetName: string) => {
    if (!draggedWb || draggedWb === targetName) return;
    const order = wbNames.slice();
    const from = order.indexOf(draggedWb);
    const to = order.indexOf(targetName);
    order.splice(from, 1);
    order.splice(to, 0, draggedWb);
    controller.reorderSidebar('world', order);
    setDraggedWb(null);
  };

  return (
    <>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-section" id="sectionChapters">
          <div className="sidebar-header">
            <h3>{t('chaptersHeader')}</h3>
            <button
              id="btnNewChapter"
              className="btn-add-mini"
              title={t('newChapterTitle')}
              onClick={openNewChapter}
            >
              +
            </button>
          </div>
          <ul id="chapterList" className="item-list">
            {chapterNames.map((name) => (
              <SidebarItem
                key={name}
                name={name}
                type="chapter"
                current={activeTab === name && activeType === 'chapter'}
                onOpen={() => controller.openItem(name, 'chapter')}
                onRename={() => setRenaming({ oldName: name, type: 'chapter', value: name })}
                onDelete={() => void controller.deleteItem(name, 'chapter')}
                draggable
                onDragStart={() => setDraggedChapter(name)}
                onDragEnd={() => setDraggedChapter(null)}
                onDropOn={() => handleChapterDrop(name)}
              />
            ))}
          </ul>
        </div>

        <div className="resize-handle-h" id="sidebarSectionsResizeHandle" />

        <div className="sidebar-section" id="sectionWorld">
          <div className="sidebar-header">
            <h3>{t('worldBuildingHeader')}</h3>
            <div style={{ position: 'relative' }} ref={wbMenuRef}>
              <button
                id="btnNewWB"
                className="btn-add-mini"
                title={t('addWBTitle')}
                onClick={(e) => {
                  e.stopPropagation();
                  setWbMenuOpen((v) => !v);
                }}
              >
                +
              </button>
              <div id="wbMenu" className={`wb-menu${wbMenuOpen ? ' show' : ''}`}>
                {(['character', 'place', 'object', 'other'] as const).map((builtin) => (
                  <div
                    key={builtin}
                    className="wb-menu-item"
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => openNewWbModal(builtin)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openNewWbModal(builtin);
                      }
                    }}
                  >
                    {{ character: '👤', place: '🏰', object: '💎', other: '📝' }[builtin]}{' '}
                    <span>{t(`wbLabel_${builtin}`)}</span>
                  </div>
                ))}
                <div id="wbCustomTypeMenuItems">
                  {customTypes.map(([slug, def]) => (
                    <div className="wb-menu-item wb-menu-item-custom" key={slug}>
                      <button
                        type="button"
                        className="wb-menu-item-main"
                        onClick={() => openNewWbModal(slug)}
                      >
                        {def.icon || '📁'} <span>{def.label}</span>
                      </button>
                      <div className="wb-menu-item-actions">
                        <button
                          type="button"
                          title={t('customTypeEditTitle')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setWbMenuOpen(false);
                            onOpenCustomTypeModal(slug);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title={t('customTypeDeleteTitle')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setWbMenuOpen(false);
                            void controller.deleteCustomType(slug, def);
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="wb-menu-item wb-menu-item-new-type"
                  id="btnNewCustomWbType"
                  onClick={() => {
                    setWbMenuOpen(false);
                    onOpenCustomTypeModal(null);
                  }}
                >
                  ➕ <span>{t('wbNewCustomTypeBtn')}</span>
                </button>
              </div>
            </div>
          </div>
          <ul id="wbList" className="item-list">
            {wbNames.map((name) => {
              const item = data.world[name];
              const icon = item.icon || controller.registry.templateFor(item.wbType).icon;
              return (
                <SidebarItem
                  key={name}
                  name={name}
                  type="world"
                  icon={icon}
                  current={activeTab === name && activeType === 'world'}
                  onOpen={() => controller.openItem(name, 'world')}
                  onRename={() => setRenaming({ oldName: name, type: 'world', value: name })}
                  onDelete={() => void controller.deleteItem(name, 'world')}
                  draggable
                  onDragStart={() => setDraggedWb(name)}
                  onDragEnd={() => setDraggedWb(null)}
                  onDropOn={() => handleWbDrop(name)}
                />
              );
            })}
          </ul>
        </div>
      </aside>

      <Modal
        open={newChapterName !== null}
        title={t('newChapterModalTitle')}
        onCancel={() => setNewChapterName(null)}
        onPrimary={confirmNewChapter}
        footer={
          <>
            <button onClick={() => setNewChapterName(null)}>{t('cancel')}</button>
            <button onClick={confirmNewChapter}>{t('create')}</button>
          </>
        }
      >
        <input
          ref={newChapterInputRef}
          type="text"
          placeholder={t('chapterNamePlaceholder')}
          value={newChapterName ?? ''}
          onChange={(e) => setNewChapterName(e.target.value)}
        />
      </Modal>

      <Modal
        open={newWbState !== null}
        title={newWbState ? t('newWBModalTitle', { type: wbTypeLabel(newWbState.type) }) : ''}
        onCancel={() => setNewWbState(null)}
        onPrimary={confirmNewWb}
        footer={
          <>
            <button onClick={() => setNewWbState(null)}>{t('cancel')}</button>
            <button onClick={confirmNewWb}>{t('create')}</button>
          </>
        }
      >
        <input
          ref={newWbInputRef}
          type="text"
          placeholder={t('wbNamePlaceholder')}
          value={newWbState?.name ?? ''}
          onChange={(e) => setNewWbState((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
        />
      </Modal>

      <Modal
        open={renaming !== null}
        title={t('renameModalTitle')}
        onCancel={() => setRenaming(null)}
        onPrimary={confirmRename}
        footer={
          <>
            <button onClick={() => setRenaming(null)}>{t('cancel')}</button>
            <button onClick={confirmRename}>{t('rename')}</button>
          </>
        }
      >
        <input
          type="text"
          autoFocus
          placeholder={t('newNamePlaceholder')}
          value={renaming?.value ?? ''}
          onChange={(e) => setRenaming((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
        />
      </Modal>
    </>
  );
}

interface SidebarItemProps {
  name: string;
  type: ItemType;
  icon?: string;
  current: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}

function SidebarItem({
  name,
  type,
  icon,
  current,
  onOpen,
  onRename,
  onDelete,
  draggable,
  onDragStart,
  onDragEnd,
  onDropOn
}: SidebarItemProps): React.ReactElement {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);

  return (
    <li
      className={`${current ? 'current' : ''}${dragOver ? ' drag-over' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={`${type === 'chapter' ? t('ariaChapter') : t('ariaSheet')} : ${name}`}
      draggable={draggable}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={() => {
        onDragEnd();
        setDragOver(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropOn();
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {icon ? <span className="item-icon">{icon}</span> : null} {name}
      </span>
      <div className="item-actions">
        <button
          className="rename-btn"
          title={t('renameItemTitle')}
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          ✏️
        </button>
        <button
          className="delete-btn"
          title={t('deleteItemTitle')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          🗑
        </button>
      </div>
    </li>
  );
}
