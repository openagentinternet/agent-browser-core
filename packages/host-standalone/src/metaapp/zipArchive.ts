import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { inflateRaw } from 'node:zlib';

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const STORE_COMPRESSION_METHOD = 0;
const DEFLATE_COMPRESSION_METHOD = 8;
const ENCRYPTED_FLAG = 0x0001;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const DEFAULT_MAX_EXTRACTED_ENTRIES = 2_000;
const DEFAULT_MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;

const SKIP_NAMES = new Set(['.DS_Store', '.git', 'node_modules', '.runtime']);

function normalizeEntryName(entryName: string): string {
  return entryName.replace(/\\/g, '/');
}

function assertSafeEntryName(entryName: string): void {
  if (!entryName || path.posix.isAbsolute(entryName) || entryName.split('/').includes('..')) {
    throw new Error(`Invalid ZIP entry name: ${entryName}`);
  }
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32WithTable(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const tableIndex = (crc ^ buffer[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC_TABLE[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function collectEntries(
  sourceDir: string,
  exclude: string[],
): Promise<Array<{ entryName: string; filePath: string; data: Buffer }>> {
  const excludeSet = new Set(exclude.map((value) => normalizeEntryName(value).replace(/^\.\/+/, '').replace(/^\/+/, '')));
  const collected: Array<{ entryName: string; filePath: string; data: Buffer }> = [];

  async function visit(currentDir: string): Promise<void> {
    const dirents = await fs.readdir(currentDir, { withFileTypes: true });
    dirents.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const dirent of dirents) {
      if (SKIP_NAMES.has(dirent.name)) {
        continue;
      }

      const filePath = path.join(currentDir, dirent.name);
      const relativePath = normalizeEntryName(path.relative(sourceDir, filePath));
      const normalizedRelativePath = relativePath.replace(/^\.\/+/, '');
      if (!normalizedRelativePath || path.posix.isAbsolute(normalizedRelativePath) || normalizedRelativePath.split('/').includes('..')) {
        throw new Error(`Invalid ZIP entry path: ${relativePath}`);
      }
      if (excludeSet.has(normalizedRelativePath)) {
        continue;
      }

      if (dirent.isDirectory()) {
        await visit(filePath);
        continue;
      }

      if (dirent.name === '.DS_Store' || normalizedRelativePath.endsWith('/.DS_Store')) {
        continue;
      }

      assertSafeEntryName(normalizedRelativePath);
      collected.push({
        entryName: normalizedRelativePath,
        filePath,
        data: await fs.readFile(filePath),
      });
    }
  }

  await visit(sourceDir);
  collected.sort((left, right) => (left.entryName < right.entryName ? -1 : left.entryName > right.entryName ? 1 : 0));
  return collected;
}

function writeUInt16LE(target: Buffer, value: number, offset: number): number {
  target.writeUInt16LE(value & 0xffff, offset);
  return offset + 2;
}

function writeUInt32LE(target: Buffer, value: number, offset: number): number {
  target.writeUInt32LE(value >>> 0, offset);
  return offset + 4;
}

function createLocalHeader(entryName: string, data: Buffer, crc: number): Buffer {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const header = Buffer.alloc(30 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, ZIP_LOCAL_FILE_HEADER_SIGNATURE, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, STORE_COMPRESSION_METHOD, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt32LE(header, crc, offset);
  offset = writeUInt32LE(header, data.byteLength, offset);
  offset = writeUInt32LE(header, data.byteLength, offset);
  offset = writeUInt16LE(header, nameBuffer.length, offset);
  offset = writeUInt16LE(header, 0, offset);
  nameBuffer.copy(header, offset);
  return header;
}

function createCentralDirectoryHeader(entryName: string, data: Buffer, crc: number, localHeaderOffset: number): Buffer {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const header = Buffer.alloc(46 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, STORE_COMPRESSION_METHOD, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt32LE(header, crc, offset);
  offset = writeUInt32LE(header, data.byteLength, offset);
  offset = writeUInt32LE(header, data.byteLength, offset);
  offset = writeUInt16LE(header, nameBuffer.length, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt32LE(header, 0, offset);
  offset = writeUInt32LE(header, localHeaderOffset, offset);
  nameBuffer.copy(header, offset);
  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Buffer {
  const header = Buffer.alloc(22);
  let offset = 0;
  offset = writeUInt32LE(header, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, entryCount, offset);
  offset = writeUInt16LE(header, entryCount, offset);
  offset = writeUInt32LE(header, centralDirectorySize, offset);
  offset = writeUInt32LE(header, centralDirectoryOffset, offset);
  offset = writeUInt16LE(header, 0, offset);
  return header;
}

export async function writeMetaAppZipArchive(input: {
  sourceDir: string;
  outFile: string;
  exclude?: string[];
}): Promise<{ filePath: string; bytes: number; sha256: string; entries: string[] }> {
  const sourceDir = path.resolve(input.sourceDir);
  const outFile = path.resolve(input.outFile);
  const entries = await collectEntries(sourceDir, input.exclude ?? []);
  const fileParts: Buffer[] = [];
  const centralDirectoryParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    assertSafeEntryName(entry.entryName);
    const crc = crc32WithTable(entry.data);
    const localHeader = createLocalHeader(entry.entryName, entry.data, crc);
    const centralHeader = createCentralDirectoryHeader(entry.entryName, entry.data, crc, localOffset);
    fileParts.push(localHeader, entry.data);
    centralDirectoryParts.push(centralHeader);
    localOffset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectory = createEndOfCentralDirectory(entries.length, centralDirectory.byteLength, localOffset);
  const archive = Buffer.concat([...fileParts, centralDirectory, endOfCentralDirectory]);

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, archive);

  return {
    filePath: outFile,
    bytes: archive.byteLength,
    sha256: createHash('sha256').update(archive).digest('hex'),
    entries: entries.map((entry) => entry.entryName),
  };
}

function findEndOfCentralDirectory(archive: Buffer): number {
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('ZIP end-of-central-directory record was not found.');
}

function assertInsideDirectory(rootDir: string, filePath: string): void {
  const relative = path.relative(rootDir, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`ZIP entry escapes target directory: ${filePath}`);
  }
}

function assertSupportedGeneralPurposeFlags(entryName: string, flags: number): void {
  if ((flags & ENCRYPTED_FLAG) !== 0) {
    throw new Error(`Encrypted ZIP entries are not supported: ${entryName}`);
  }
  if ((flags & DATA_DESCRIPTOR_FLAG) !== 0) {
    throw new Error(`ZIP data descriptor entries are not supported: ${entryName}`);
  }
}

function inflateRawBounded(input: {
  entryName: string;
  compressedData: Buffer;
  uncompressedSize: number;
}): Promise<Buffer> {
  const maxOutputLength = Math.max(input.uncompressedSize, 1);
  return new Promise((resolve, reject) => {
    inflateRaw(input.compressedData, { maxOutputLength }, (error, result) => {
      if (error) {
        reject(new Error(`Invalid deflate data or declared ZIP size for ${input.entryName}: ${error.message}`));
        return;
      }
      resolve(result);
    });
  });
}

async function decompressZipEntry(input: {
  entryName: string;
  compressionMethod: number;
  compressedData: Buffer;
  uncompressedSize: number;
}): Promise<Buffer> {
  if (input.compressionMethod === STORE_COMPRESSION_METHOD) {
    if (input.compressedData.byteLength !== input.uncompressedSize) {
      throw new Error(`ZIP entry size mismatch: ${input.entryName}`);
    }
    return input.compressedData;
  }
  if (input.compressionMethod === DEFLATE_COMPRESSION_METHOD) {
    const inflated = await inflateRawBounded({
      entryName: input.entryName,
      compressedData: input.compressedData,
      uncompressedSize: input.uncompressedSize,
    });
    if (inflated.byteLength !== input.uncompressedSize) {
      throw new Error(`ZIP entry size mismatch: ${input.entryName}`);
    }
    return inflated;
  }
  throw new Error(`Unsupported ZIP compression method ${input.compressionMethod} for ${input.entryName}.`);
}

export async function extractMetaAppZipArchive(input: {
  archive: Buffer;
  outDir: string;
  maxEntries?: number;
  maxUncompressedBytes?: number;
}): Promise<{ outDir: string; entries: string[] }> {
  const archive = Buffer.from(input.archive);
  const outDir = path.resolve(input.outDir);
  const maxEntries = input.maxEntries ?? DEFAULT_MAX_EXTRACTED_ENTRIES;
  const maxUncompressedBytes = input.maxUncompressedBytes ?? DEFAULT_MAX_EXTRACTED_BYTES;
  const eocdOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  if (entryCount > maxEntries) {
    throw new Error(`ZIP archive has too many entries: ${entryCount}.`);
  }

  const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
  let centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralOffset + centralDirectorySize;
  if (
    centralOffset > archive.length
    || centralDirectorySize > archive.length
    || centralDirectoryEnd > archive.length
    || centralDirectoryEnd > eocdOffset
  ) {
    throw new Error('Invalid ZIP central directory bounds.');
  }

  let totalUncompressedBytes = 0;
  const extractedEntries: string[] = [];

  await fs.mkdir(outDir, { recursive: true });

  for (let index = 0; index < entryCount; index += 1) {
    if (centralOffset + 46 > centralDirectoryEnd || archive.readUInt32LE(centralOffset) !== ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error('Invalid ZIP central directory.');
    }

    const generalPurposeFlags = archive.readUInt16LE(centralOffset + 8);
    const compressionMethod = archive.readUInt16LE(centralOffset + 10);
    const crc = archive.readUInt32LE(centralOffset + 16);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(centralOffset + 42);
    const nameStart = centralOffset + 46;
    const nameEnd = nameStart + nameLength;
    const centralEntryEnd = nameEnd + extraLength + commentLength;
    if (centralEntryEnd > archive.length || centralEntryEnd > centralDirectoryEnd) {
      throw new Error('Invalid ZIP central directory entry bounds.');
    }

    const entryName = normalizeEntryName(archive.subarray(nameStart, nameEnd).toString('utf8'));
    centralOffset = centralEntryEnd;
    assertSafeEntryName(entryName);
    assertSupportedGeneralPurposeFlags(entryName, generalPurposeFlags);

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new Error('ZIP archive exceeds the maximum extracted size.');
    }

    if (localHeaderOffset + 30 > archive.length || archive.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP local header for ${entryName}.`);
    }
    const localGeneralPurposeFlags = archive.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod = archive.readUInt16LE(localHeaderOffset + 8);
    const localCrc = archive.readUInt32LE(localHeaderOffset + 14);
    const localCompressedSize = archive.readUInt32LE(localHeaderOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localHeaderOffset + 22);
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (localNameEnd > archive.length) {
      throw new Error(`Invalid ZIP local header name bounds for ${entryName}.`);
    }
    const localEntryName = normalizeEntryName(archive.subarray(localNameStart, localNameEnd).toString('utf8'));
    if (localEntryName !== entryName) {
      throw new Error(`ZIP local header name mismatch for ${entryName}.`);
    }
    if (localGeneralPurposeFlags !== generalPurposeFlags) {
      throw new Error(`ZIP local header flags mismatch for ${entryName}.`);
    }
    if (localCompressionMethod !== compressionMethod) {
      throw new Error(`ZIP local header compression method mismatch for ${entryName}.`);
    }
    if (localCrc !== crc) {
      throw new Error(`ZIP local header CRC mismatch for ${entryName}.`);
    }
    if (localCompressedSize !== compressedSize) {
      throw new Error(`ZIP local header compressed size mismatch for ${entryName}.`);
    }
    if (localUncompressedSize !== uncompressedSize) {
      throw new Error(`ZIP local header uncompressed size mismatch for ${entryName}.`);
    }
    if (entryName.endsWith('/')) {
      continue;
    }

    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > archive.length || dataEnd > archive.length) {
      throw new Error(`Invalid ZIP data bounds for ${entryName}.`);
    }

    const body = await decompressZipEntry({
      entryName,
      compressionMethod,
      compressedData: archive.subarray(dataStart, dataEnd),
      uncompressedSize,
    });
    if (crc32WithTable(body) !== crc) {
      throw new Error(`ZIP entry CRC mismatch: ${entryName}`);
    }
    const targetPath = path.resolve(outDir, entryName);
    assertInsideDirectory(outDir, targetPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, body);
    extractedEntries.push(entryName);
  }

  if (centralOffset !== centralDirectoryEnd) {
    throw new Error('Invalid ZIP central directory size.');
  }

  return { outDir, entries: extractedEntries };
}
