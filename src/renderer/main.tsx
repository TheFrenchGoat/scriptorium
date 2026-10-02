// src/renderer/main.tsx
// Point d'entrée du renderer.
//
// Volontairement SANS <React.StrictMode> : en développement, StrictMode
// invoque deux fois chaque effet, ce qui ferait tourner deux fois la mise en
// place impérative du contentEditable (innerHTML + surlignage + position du
// curseur). C'est inoffensif en théorie, mais cela rendrait tout diagnostic de
// bug d'édition inutilement confus. Le reste de l'application ne dépend
// d'aucun comportement propre à StrictMode.

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/style.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable dans index.html');

createRoot(container).render(<App />);
