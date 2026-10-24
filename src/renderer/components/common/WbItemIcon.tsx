// src/renderer/components/common/WbItemIcon.tsx
// Contenu de l'icône d'une fiche : la photo ronde si elle existe, sinon l'emoji.

import React from 'react';

export interface WbIconContentProps {
  icon: string;
  image?: string;
}

export function WbIconContent({ icon, image }: WbIconContentProps): React.ReactElement {
  if (image) {
    return <img className="wb-icon-photo" src={image} alt="" draggable={false} />;
  }

  return <>{icon}</>;
}