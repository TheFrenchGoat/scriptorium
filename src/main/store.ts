// src/main/store.ts
// Stockage persistant (remplace l'ancien localStorage) : les données sont
// écrites dans un vrai fichier JSON sur disque (dossier userData de l'appli),
// avec des valeurs par défaut sûres. Le schéma est typé une bonne fois pour
// toutes ici, donc `store.get('projects')` renvoie un ProjectsMap et non `any`.

import Store from 'electron-store';
import type {
  EditorPrefs,
  GrammarPrefs,
  LanguageCode,
  ProjectsMap,
  ThemeName,
  UiState,
  WritingStats
} from '../shared/types';

export interface StoreSchema {
  projects: ProjectsMap;
  uiState: UiState;
  theme: ThemeName;
  currentProject: string | null;
  language: LanguageCode;

  /**
   * Préférences de l'éditeur et de l'interface.
   *
   * Elles contiennent également les échelles utilisées pour noter la
   * concentration et l'énergie à la fin d'une session d'écriture.
   */
  editorPrefs: EditorPrefs;

  /**
   * Ancien historique du nombre de mots écrits, par projet et par jour.
   *
   * Il reste conservé pour assurer la compatibilité avec les données des
   * versions précédentes. Les nouvelles sessions détaillées sont stockées
   * directement dans ProjectData.writingSessions.
   */
  writingStats: WritingStats;

  /**
   * Correcteur de grammaire hors ligne.
   *
   * `languageToolPath` pointe vers le dossier choisi par l'utilisateur ou
   * installé automatiquement.
   */
  grammarPrefs: GrammarPrefs;

  /**
   * Correcteur orthographique natif Chromium.
   *
   * webPreferences.spellcheck reste à true ; cette préférence active ou
   * désactive réellement le correcteur via
   * session.setSpellCheckerEnabled(), sans redémarrage.
   */
  nativeSpellcheckEnabled: boolean;
}

export const store = new Store<StoreSchema>({
  defaults: {
    projects: {},
    uiState: {},
    theme: 'dark',
    currentProject: null,
    language: 'fr',

    editorPrefs: {
      width: 800,
      fontFamily: "'Roboto', sans-serif",
      lineHeight: 1.6,

      uiFontSize: 14,
      uiFontFamily: "'Roboto', sans-serif",

      timerSoundEnabled: true,
      timerVolume: 0.5,
      timerSoundId: 'chime',

      marginLeft: 80,
      marginRight: 80,
      firstLineIndent: 0,

      /**
       * Échelles par défaut utilisées dans le formulaire de ressenti affiché
       * à la fin d'une session.
       *
       * L'utilisateur pourra choisir 5, 10 ou 20 dans les paramètres.
       */
      sessionConcentrationScale: 10,
      sessionEnergyScale: 10
    },

    /**
     * Format historique conservé pour les statistiques quotidiennes
     * existantes.
     */
    writingStats: {
      projects: {}
    },

    grammarPrefs: {
      enabled: false,
      languageToolPath: null,
      port: 8081
    },

    nativeSpellcheckEnabled: true
  }
});
