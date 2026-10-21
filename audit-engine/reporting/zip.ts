/** Small, dependency-free ZIP writer for already-compressed PNG and UTF-8 evidence. */
export interface ZipEntry { name: string; content: Buffer }

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

export function storedZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('Too many ZIP entries.');
  const names = new Set<string>();
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(entry.name) || entry.name.startsWith('/') || entry.name.split('/').includes('..') || names.has(entry.name)) {
      throw new Error('Invalid or duplicate ZIP entry name.');
    }
    names.add(entry.name);
    const name = Buffer.from(entry.name, 'utf8');
    const size = entry.content.length;
    if (name.length > 0xffff || size > 0xffffffff || offset + size + name.length + 30 > 0xffffffff) throw new Error('ZIP evidence exceeds standard format limits.');
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, entry.content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + size;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  if (offset + directorySize > 0xffffffff) throw new Error('ZIP evidence exceeds standard format limits.');
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(entries.length, 8);
  footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(directorySize, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...directory, footer]);
}
