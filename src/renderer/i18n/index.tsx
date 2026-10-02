// src/renderer/i18n/index.tsx
// Système d'internationalisation léger, sans dépendance externe.
// - `t(key, vars)` traduit une clé vers la langue courante (repli sur le
//   français puis sur la clé elle-même si rien n'est trouvé).
// - `useI18n()` donne accès à `t` et à `setLanguage` depuis un composant, et
//   provoque un re-rendu de toute l'application au changement de langue —
//   ce qui remplace l'ancien `applyStaticTranslations()` qui repassait sur le
//   DOM à la main.
// - `t` reste exporté au niveau module pour le code non-React (helpers,
//   gestionnaires d'erreur au démarrage).

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { dict, fr, type TranslationKey } from './dict';
import type { LanguageCode } from '../../shared/types';

export type { TranslationKey } from './dict';

export type TranslationVars = Record<string, string | number>;

let currentLang: LanguageCode = 'fr';

export function setLanguage(lang: string): void {
  currentLang = lang === 'en' || lang === 'fr' ? lang : 'fr';
}

export function getLanguage(): LanguageCode {
  return currentLang;
}

export function t(key: TranslationKey, vars?: TranslationVars): string {
  let str: string = dict[currentLang]?.[key] ?? fr[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
    });
  }
  return str;
}

interface I18nContextValue {
  lang: LanguageCode;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  changeLanguage: (lang: LanguageCode) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLang,
  children
}: {
  initialLang: LanguageCode;
  children: React.ReactNode;
}): React.ReactElement {
  setLanguage(initialLang);
  const [lang, setLang] = useState<LanguageCode>(initialLang);

  const changeLanguage = useCallback((next: LanguageCode) => {
    setLanguage(next);
    setLang(next);
    void window.api.saveLanguage(next);
  }, []);

  // `t` est recréé à chaque changement de langue : c'est justement ce qui fait
  // re-rendre les composants qui l'utilisent.
  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: (key, vars) => t(key, vars), changeLanguage }),
    [lang, changeLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé à l’intérieur de <I18nProvider>');
  return ctx;
}
