// js/wb-config.js
// Constantes de configuration du "World Building" (personnages, lieux, objets...).
// Isolé dans son propre module car ce sont des données statiques, réutilisées
// à plusieurs endroits (rendu de l'éditeur, sidebar, formulaires de fiches).

export const WB_CONFIG = {
  character: { label: 'Personnage', colorClass: 'type-character', icon: '👤' },
  place: { label: 'Lieu', colorClass: 'type-place', icon: '🏰' },
  object: { label: 'Objet', colorClass: 'type-object', icon: '💎' },
  other: { label: 'Autre', colorClass: 'type-other', icon: '📝' }
};

export const WB_TEMPLATES = {
  character: {
    icon: '👤', label: 'Personnage',
    fields: [
      { key: 'firstname', label: 'Prénom', type: 'text' },
      { key: 'lastname', label: 'Nom', type: 'text' },
      { key: 'age', label: 'Âge', type: 'text' },
      { key: 'home', label: 'Habitation', type: 'text' },
      { key: 'family', label: 'Famille', type: 'textarea' },
      { key: 'physical', label: 'Physique', type: 'textarea' },
      { key: 'moral', label: 'Moral / Psychologie', type: 'textarea' },
      { key: 'background', label: 'Histoire / Background', type: 'textarea' },
      { key: 'notes', label: 'Notes libres', type: 'textarea' }
    ]
  },
  place: {
    icon: '🏰', label: 'Lieu',
    fields: [
      { key: 'type', label: 'Type de lieu', type: 'text' },
      { key: 'location', label: 'Localisation', type: 'text' },
      { key: 'description', label: 'Description visuelle', type: 'textarea' },
      { key: 'atmosphere', label: 'Atmosphère / Ambiance', type: 'textarea' },
      { key: 'history', label: 'Histoire', type: 'textarea' },
      { key: 'inhabitants', label: 'Habitants / Faune', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]
  },
  object: {
    icon: '💎', label: 'Objet',
    fields: [
      { key: 'type', label: "Type d'objet", type: 'text' },
      { key: 'owner', label: 'Propriétaire', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'power', label: 'Pouvoir / Utilité', type: 'textarea' },
      { key: 'history', label: 'Origine / Histoire', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]
  },
  other: {
    icon: '📝', label: 'Autre',
    fields: [
      { key: 'description', label: 'Description libre', type: 'textarea' }
    ]
  }
};
