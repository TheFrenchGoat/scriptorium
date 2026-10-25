// src/main/export-images.ts
// Images du document d'export (portraits de la bible) : lecture des data URL.

export interface DecodedExportImage {
  data: Buffer;
  extension: 'jpg' | 'png';
  mediaType: 'image/jpeg' | 'image/png';
}

const DATA_URL_PATTERN = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;

/** JPEG ou PNG en base64 -> octets ; tout le reste est refusé (null). */
export function decodeImageDataUrl(dataUrl: string): DecodedExportImage | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (match === null) return null;

  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0) return null;

  return match[1] === 'png'
    ? { data, extension: 'png', mediaType: 'image/png' }
    : { data, extension: 'jpg', mediaType: 'image/jpeg' };
}