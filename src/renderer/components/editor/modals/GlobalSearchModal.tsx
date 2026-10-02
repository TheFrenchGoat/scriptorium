// src/renderer/components/editor/modals/GlobalSearchModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import { Modal } from '../../common/Modal';
import { debounce } from '../../../lib/dom';
import { runGlobalSearch, splitSnippet, type SearchResult } from '../../../lib/search';
import type { EditorController } from '../useEditorController';

export interface GlobalSearchModalProps {
  open: boolean;
  controller: EditorController;
  onClose: () => void;
}

export function GlobalSearchModal({ open, controller, onClose }: GlobalSearchModalProps): React.ReactElement {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const runSearch = useRef(
    debounce((value: string) => {
      setResults(value.trim() ? runGlobalSearch(controller.data(), value) : []);
    }, 250)
  ).current;

  useEffect(() => {
    if (open) {
      setTerm('');
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const onOpenResult = (result: SearchResult) => {
    controller.openItem(result.name, result.type);
    onClose();
    if (result.type === 'chapter') {
      setTimeout(() => {
        try {
          // window.find() est une API dépréciée, absente des typages DOM
          // récents, mais toujours implémentée par Chromium/Electron.
          const win = window as Window & { find?: (text: string) => boolean };
          win.find?.(term);
        } catch {
          /* window.find non supporté, tant pis */
        }
      }, 80);
    }
  };

  const iconFor = (result: SearchResult): string => {
    if (result.type === 'chapter') return '📖';
    const wbEntry = controller.data().world[result.name];
    if (wbEntry) return wbEntry.icon || controller.registry.templateFor(wbEntry.wbType).icon;
    return '📝';
  };

  return (
    <Modal
      open={open}
      title={t('globalSearchModalTitle')}
      width={620}
      onCancel={onClose}
      footer={<button onClick={onClose}>{t('close')}</button>}
    >
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder={t('globalSearchPlaceholder')}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          runSearch(e.target.value);
        }}
      />
      <ul
        className="item-list"
        style={{
          maxHeight: 360,
          margin: '15px 0 20px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          listStyle: 'none'
        }}
      >
        {results === null ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('globalSearchHint')}</li>
        ) : results.length === 0 ? (
          <li style={{ padding: 15, color: 'var(--text-muted)' }}>{t('globalSearchNoResults')}</li>
        ) : (
          results.map((result) => (
            <li
              key={`${result.type}:${result.name}`}
              className="search-result"
              onClick={() => onOpenResult(result)}
            >
              <div className="search-result-header">
                <span className="search-result-name">
                  {iconFor(result)} {result.name}
                </span>
                <span className="search-result-count">{t('occurrences', { count: result.count })}</span>
              </div>
              {result.snippets.map((snippet, i) => (
                <div className="search-result-snippet" key={i}>
                  {splitSnippet(snippet, term).map((part, j) =>
                    part.match ? <mark key={j}>{part.text}</mark> : <React.Fragment key={j}>{part.text}</React.Fragment>
                  )}
                </div>
              ))}
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}
