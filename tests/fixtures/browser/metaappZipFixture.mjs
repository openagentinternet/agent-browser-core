import { Buffer } from 'node:buffer';

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const STORE_COMPRESSION_METHOD = 0;

function buildCrcTable() {
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

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const tableIndex = (crc ^ buffer[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC_TABLE[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(target, value, offset) {
  target.writeUInt16LE(value & 0xffff, offset);
  return offset + 2;
}

function writeUInt32LE(target, value, offset) {
  target.writeUInt32LE(value >>> 0, offset);
  return offset + 4;
}

function toEntryList(entries) {
  return Object.entries(entries)
    .map(([entryName, value]) => ({
      entryName,
      data: Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'),
    }))
    .sort((left, right) => left.entryName.localeCompare(right.entryName));
}

function createLocalHeader(entryName, data, crc) {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const header = Buffer.alloc(30 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, LOCAL_FILE_HEADER_SIGNATURE, offset);
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

function createCentralDirectoryHeader(entryName, data, crc, localHeaderOffset) {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const header = Buffer.alloc(46 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, CENTRAL_DIRECTORY_HEADER_SIGNATURE, offset);
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

function createEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  const header = Buffer.alloc(22);
  let offset = 0;
  offset = writeUInt32LE(header, END_OF_CENTRAL_DIRECTORY_SIGNATURE, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, entryCount, offset);
  offset = writeUInt16LE(header, entryCount, offset);
  offset = writeUInt32LE(header, centralDirectorySize, offset);
  offset = writeUInt32LE(header, centralDirectoryOffset, offset);
  offset = writeUInt16LE(header, 0, offset);
  return header;
}

export function makeMetaAppZipArchive(entries) {
  const entryList = toEntryList(entries);
  const fileParts = [];
  const centralDirectoryParts = [];
  let localOffset = 0;

  for (const entry of entryList) {
    const crc = crc32(entry.data);
    const localHeader = createLocalHeader(entry.entryName, entry.data, crc);
    const centralHeader = createCentralDirectoryHeader(entry.entryName, entry.data, crc, localOffset);
    fileParts.push(localHeader, entry.data);
    centralDirectoryParts.push(centralHeader);
    localOffset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectory = createEndOfCentralDirectory(entryList.length, centralDirectory.byteLength, localOffset);
  return Buffer.concat([...fileParts, centralDirectory, endOfCentralDirectory]);
}
