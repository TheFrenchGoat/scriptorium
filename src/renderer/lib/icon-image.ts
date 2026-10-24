// src/renderer/lib/icon-image.ts
// Réduit une photo choisie par l'utilisateur en petite image carrée, recadrée
// au centre, utilisée à la place de l'emoji d'une fiche World Building.

const ICON_IMAGE_SIZE = 128;
const MAX_FILE_SIZE = 30 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('lecture impossible'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image illisible'));
    img.src = src;
  });
}

/** Renvoie une URL de données webp (ou jpeg) de 128 x 128 px. */
export async function fileToIconImage(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('fichier trop lourd');
  }

  const img = await loadImage(await readAsDataUrl(file));
  const side = Math.min(img.naturalWidth, img.naturalHeight);

  if (!side) {
    throw new Error('image vide');
  }

  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = ICON_IMAGE_SIZE;
  canvas.height = ICON_IMAGE_SIZE;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('canvas indisponible');
  }

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_IMAGE_SIZE, ICON_IMAGE_SIZE);

  const webp = canvas.toDataURL('image/webp', 0.85);

  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}