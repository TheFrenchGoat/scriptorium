// src/main/zip-writer.ts
// Petit écrivain d'archives ZIP, sans dépendance externe.
//
// Les formats OpenDocument (.odt) et ePub exigent que le fichier
// « mimetype » soit le premier de l'archive et ne soit pas compressé :
// ce module respecte l'ordre des fichiers fourni et le mode de stockage
// demandé pour chacun.
//
// Limites : pas de ZIP64 (moins de 4 Go et de 65 535 fichiers), ce qui
// est très largement suffisant pour des documents texte.

import zlib from 'node:zlib';

export interface ZipEntry {
  /** Chemin dans l'archive, avec des barres obliques (ex. META-INF/manifest.xml). */
  name: string;
  data: Buffer | string;
  /** true : stocké sans compression (obligatoire pour mimetype). */
  store?: boolean;
}

const CRC_TABLE: number[] = buildCrcTable();

function buildCrcTable(): number[] {
  const table: number[] = [];

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table.push(c >>> 0);
  }

  return table;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    const byte = data.readUInt8(i);
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { time: number; day: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));

  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/** Construit une archive ZIP en mémoire, fichiers dans l'ordre donné. */
export function buildZip(entries: readonly ZipEntry[], date: Date = new Date()): Buffer {
  if (entries.length > 0xffff) {
    throw new Error('Trop de fichiers pour une archive ZIP simple.');
  }

  const { time, day } = toDosDateTime(date);
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw: Buffer = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
    const store = entry.store === true;
    const body: Buffer = store ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const method = store ? 0 : 8;
    // Bit 11 : nom encodé en UTF-8 (seulement s'il contient autre chose que de l'ASCII).
    const flags = /^[\x20-\x7e]*$/.test(entry.name) ? 0 : 0x0800;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    parts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    directory.push(central, name);

    offset += local.length + name.length + body.length;

    if (offset > 0xffffffff) {
      throw new Error('Archive ZIP trop volumineuse.');
    }
  }

  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, directoryBuffer, end]);
}