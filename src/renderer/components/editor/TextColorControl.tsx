// src/renderer/components/editor/TextColorControl.tsx
//
// Commande « Couleur du texte » de la barre d'outils, façon traitement de
// texte : un bouton en deux parties.
//
//   [ A ]  applique la couleur affichée sous la lettre (dernière utilisée) ;
//   [ ▾ ]  ouvre le panneau : Automatique, palette, couleur personnalisée.
//
// Ce composant gère uniquement le choix de la couleur. L'application au
// texte est faite par la barre d'outils (onApplyColor / onApplyAutomatic).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, DropdownItem } from '../common/Dropdown';
import './TextColorControl.css';

export interface TextColorControlProps {
  lang: string;
  onApplyColor: (color: string) => void;
  onApplyAutomatic: () => void;
}

interface TextColorChoice {
  value: string;
  fr: string;
  en: string;
}

/** Palette proposée (2 lignes de 6). */
const TEXT_COLORS: TextColorChoice[] = [
  { value: '#dc2626', fr: 'Rouge', en: 'Red' },
  { value: '#ea580c', fr: 'Orange', en: 'Orange' },
  { value: '#ca8a04', fr: 'Jaune foncé', en: 'Dark yellow' },
  { value: '#16a34a', fr: 'Vert', en: 'Green' },
  { value: '#0891b2', fr: 'Turquoise', en: 'Teal' },
  { value: '#2563eb', fr: 'Bleu', en: 'Blue' },
  { value: '#7c3aed', fr: 'Violet', en: 'Purple' },
  { value: '#db2777', fr: 'Rose', en: 'Pink' },
  { value: '#92400e', fr: 'Marron', en: 'Brown' },
  { value: '#6b7280', fr: 'Gris', en: 'Grey' },
  { value: '#000000', fr: 'Noir', en: 'Black' },
  { value: '#ffffff', fr: 'Blanc', en: 'White' }
];

const DEFAULT_TEXT_COLOR = '#dc2626';
const LAST_TEXT_COLOR_KEY = 'scriptorium.toolbar.lastTextColor';

function readStoredTextColor(): string {
  try {
    const stored = window.localStorage.getItem(LAST_TEXT_COLOR_KEY);

    if (stored && /^#[0-9a-f]{6}$/i.test(stored)) {
      return stored.toLowerCase();
    }
  } catch {
    /* stockage indisponible : couleur par défaut */
  }

  return DEFAULT_TEXT_COLOR;
}

function storeTextColor(color: string): void {
  try {
    window.localStorage.setItem(LAST_TEXT_COLOR_KEY, color);
  } catch {
    /* stockage indisponible : la couleur reste mémorisée pour la session */
  }
}

function getColorName(color: string, isEnglish: boolean): string {
  const choice = TEXT_COLORS.find((item) => item.value === color.toLowerCase());

  if (choice) {
    return isEnglish ? choice.en : choice.fr;
  }

  return color.toUpperCase();
}

export function TextColorControl({
  lang,
  onApplyColor,
  onApplyAutomatic
}: TextColorControlProps): React.ReactElement {
  const isEnglish = lang === 'en';
  const [lastColor, setLastColor] = useState<string>(readStoredTextColor);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const applyColor = useCallback(
    (color: string): void => {
      const normalized = color.toLowerCase();

      setLastColor(normalized);
      storeTextColor(normalized);
      onApplyColor(normalized);
    },
    [onApplyColor]
  );

  const openCustomPicker = useCallback((): void => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.value = lastColor;

    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }, [lastColor]);

  // Écoute native de « change » : l'onChange de React se déclencherait à
  // chaque mouvement de la souris dans le sélecteur.
  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    const onChange = (): void => {
      applyColor(input.value);
    };

    input.addEventListener('change', onChange);

    return () => {
      input.removeEventListener('change', onChange);
    };
  }, [applyColor]);

  const lastColorName = getColorName(lastColor, isEnglish);

  const labels = isEnglish
    ? {
        apply: `Apply the colour “${lastColorName}” to the selected text`,
        menu: 'Text colour: more choices',
        title: 'Text colour',
        automatic: 'Automatic',
        automaticHint: 'Theme colour, follows the selected theme',
        colors: 'Colours',
        custom: 'Custom colour…',
        tip: 'Tip: the A button reapplies the last colour chosen.'
      }
    : {
        apply: `Appliquer la couleur « ${lastColorName} » au texte sélectionné`,
        menu: 'Couleur du texte : plus de choix',
        title: 'Couleur du texte',
        automatic: 'Automatique',
        automaticHint: 'Couleur du thème, s’adapte au thème choisi',
        colors: 'Couleurs',
        custom: 'Couleur personnalisée…',
        tip: 'Astuce : le bouton A réapplique la dernière couleur choisie.'
      };

  return (
    <div className="toolbar-color-control text-color-control">
      <button
        type="button"
        className="text-color-apply"
        title={labels.apply}
        aria-label={labels.apply}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyColor(lastColor)}
      >
        <span className="text-color-letter">A</span>
        <span
          className="text-color-bar"
          aria-hidden="true"
          style={{ background: lastColor }}
        />
      </button>

      <Dropdown
        label={<span aria-hidden="true">▾</span>}
        buttonClassName="dropdown-btn text-color-arrow"
        buttonTitle={labels.menu}
        containerStyle={{ display: 'flex' }}
        menuStyle={{ width: 240, padding: 10 }}
      >
        {(close) => (
          <div className="text-color-panel">
            <div className="text-color-section-title">{labels.title}</div>

            <DropdownItem
              preserveSelection
              title={labels.automaticHint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 6
              }}
              onSelect={() => {
                onApplyAutomatic();
                close();
              }}
            >
              <span
                className="text-color-swatch text-color-swatch-auto"
                aria-hidden="true"
              />
              <span className="text-color-row-text">
                <span>{labels.automatic}</span>
                <span className="text-color-row-hint">
                  {labels.automaticHint}
                </span>
              </span>
            </DropdownItem>

            <div className="text-color-divider" />

            <div className="text-color-section-title">{labels.colors}</div>

            <div className="text-color-grid">
              {TEXT_COLORS.map((choice) => {
                const name = isEnglish ? choice.en : choice.fr;
                const isCurrent = choice.value === lastColor;

                return (
                  <DropdownItem
                    key={choice.value}
                    preserveSelection
                    title={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 30,
                      padding: 3,
                      borderRadius: 6
                    }}
                    onSelect={() => {
                      applyColor(choice.value);
                      close();
                    }}
                  >
                    <span
                      className={
                        isCurrent
                          ? 'text-color-swatch is-current'
                          : 'text-color-swatch'
                      }
                      aria-label={name}
                      style={{ background: choice.value }}
                    />
                  </DropdownItem>
                );
              })}
            </div>

            <div className="text-color-divider" />

            <DropdownItem
              preserveSelection
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 6
              }}
              onSelect={() => {
                openCustomPicker();
                close();
              }}
            >
              <span
                className="text-color-swatch text-color-swatch-custom"
                aria-hidden="true"
              />
              <span>{labels.custom}</span>
            </DropdownItem>

            <div className="text-color-divider" />

            <div className="text-color-tip">{labels.tip}</div>
          </div>
        )}
      </Dropdown>

      <input
        ref={inputRef}
        type="color"
        className="text-color-hidden-input"
        tabIndex={-1}
        aria-hidden="true"
        defaultValue={lastColor}
      />
    </div>
  );
}
