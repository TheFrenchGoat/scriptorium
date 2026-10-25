// src/renderer/lib/export/prepare-images.ts
// Avant Word et ODT : les portraits WebP sont convertis en JPEG, et chaque
// image prend ses proportions réelles dans la boîte prévue.

import type { ExportBlock, ExportDocument, ExportImageBlock } from '../../../shared/export-document';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image illisible'));
    image.src = src;
  });
}

function roundCm(value: number): number {
  return Math.round(value * 100) / 100;
}

async function prepareImage(block: ExportImageBlock): Promise<ExportImageBlock | null> {
  try {
    const image = await loadImage(block.dataUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width <= 0 || height <= 0) return null;

    const scale = Math.min(block.widthCm / width, block.heightCm / height);
    const size = { widthCm: roundCm(width * scale), heightCm: roundCm(height * scale) };

    if (/^data:image\/(jpeg|png);base64,/.test(block.dataUrl)) {
      return { ...block, ...size };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) return null;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);

    return { ...block, ...size, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
  } catch (error) {
    console.error('Portrait ignore a l export :', error);
    return null;
  }
}

export async function prepareExportImages(doc: ExportDocument): Promise<ExportDocument> {
  const chapters = await Promise.all(
    doc.chapters.map(async (chapter) => {
      if (!chapter.blocks.some((block) => block.kind === 'image')) return chapter;

      const blocks: ExportBlock[] = [];
      for (const block of chapter.blocks) {
        if (block.kind !== 'image') {
          blocks.push(block);
          continue;
        }
        const prepared = await prepareImage(block);
        if (prepared !== null) blocks.push(prepared);
      }
      return { ...chapter, blocks };
    })
  );

  return { ...doc, chapters };
}