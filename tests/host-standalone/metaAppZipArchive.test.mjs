import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { makeMetaAppZipArchive } from '../fixtures/browser/metaappZipFixture.mjs';

const require = createRequire(import.meta.url);
const {
  extractMetaAppZipArchive,
  writeMetaAppZipArchive,
} = require('../../packages/host-standalone/dist/metaapp/zipArchive.js');

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const DEFLATE_COMPRESSION_METHOD = 8;
const DATA_DESCRIPTOR_FLAG = 0x0008;

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

function createDeflateZipWithDeclaredSize({ entryName, body, declaredUncompressedSize }) {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const compressedBody = deflateRawSync(body);
  const bodyCrc = crc32(body);
  const localHeader = Buffer.alloc(30 + nameBuffer.length);
  localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(DEFLATE_COMPRESSION_METHOD, 8);
  localHeader.writeUInt32LE(bodyCrc, 14);
  localHeader.writeUInt32LE(compressedBody.byteLength, 18);
  localHeader.writeUInt32LE(declaredUncompressedSize, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  nameBuffer.copy(localHeader, 30);

  const centralDirectoryOffset = localHeader.byteLength + compressedBody.byteLength;
  const centralHeader = Buffer.alloc(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(DEFLATE_COMPRESSION_METHOD, 10);
  centralHeader.writeUInt32LE(bodyCrc, 16);
  centralHeader.writeUInt32LE(compressedBody.byteLength, 20);
  centralHeader.writeUInt32LE(declaredUncompressedSize, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE(0, 42);
  nameBuffer.copy(centralHeader, 46);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralHeader.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([localHeader, compressedBody, centralHeader, endOfCentralDirectory]);
}

function createDeflateZipWithDataDescriptor({ entryName, body }) {
  const nameBuffer = Buffer.from(entryName, 'utf8');
  const compressedBody = deflateRawSync(body);
  const bodyCrc = crc32(body);
  const localHeader = Buffer.alloc(30 + nameBuffer.length);
  localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(DATA_DESCRIPTOR_FLAG, 6);
  localHeader.writeUInt16LE(DEFLATE_COMPRESSION_METHOD, 8);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(0, 18);
  localHeader.writeUInt32LE(0, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  nameBuffer.copy(localHeader, 30);

  const dataDescriptor = Buffer.alloc(16);
  dataDescriptor.writeUInt32LE(0x08074b50, 0);
  dataDescriptor.writeUInt32LE(bodyCrc, 4);
  dataDescriptor.writeUInt32LE(compressedBody.byteLength, 8);
  dataDescriptor.writeUInt32LE(body.byteLength, 12);

  const centralDirectoryOffset = localHeader.byteLength + compressedBody.byteLength + dataDescriptor.byteLength;
  const centralHeader = Buffer.alloc(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(DATA_DESCRIPTOR_FLAG, 8);
  centralHeader.writeUInt16LE(DEFLATE_COMPRESSION_METHOD, 10);
  centralHeader.writeUInt32LE(bodyCrc, 16);
  centralHeader.writeUInt32LE(compressedBody.byteLength, 20);
  centralHeader.writeUInt32LE(body.byteLength, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE(0, 42);
  nameBuffer.copy(centralHeader, 46);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralHeader.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([localHeader, compressedBody, dataDescriptor, centralHeader, endOfCentralDirectory]);
}

test('extractMetaAppZipArchive extracts browser files and preserves relative paths', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-extract-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Extracted</title>',
    'assets/app.js': 'window.__zipExtracted = true;',
  });
  const result = await extractMetaAppZipArchive({ archive, outDir });

  assert.deepEqual(result.entries, ['assets/app.js', 'index.html']);
  assert.match(await readFile(path.join(outDir, 'index.html'), 'utf8'), /Extracted/);
  assert.match(await readFile(path.join(outDir, 'assets', 'app.js'), 'utf8'), /__zipExtracted/);
});

test('extractMetaAppZipArchive accepts deflate entries that use data descriptors', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-descriptor-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = createDeflateZipWithDataDescriptor({
    entryName: 'index.html',
    body: Buffer.from('<!doctype html><title>Descriptor</title>', 'utf8'),
  });
  const result = await extractMetaAppZipArchive({ archive, outDir });

  assert.deepEqual(result.entries, ['index.html']);
  assert.match(await readFile(path.join(outDir, 'index.html'), 'utf8'), /Descriptor/);
});

test('extractMetaAppZipArchive rejects path traversal entries', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-traversal-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = makeMetaAppZipArchive({
    '../outside.html': 'escape',
  });

  await assert.rejects(
    () => extractMetaAppZipArchive({ archive, outDir }),
    /Invalid ZIP entry name/,
  );

  await assert.rejects(
    () => extractMetaAppZipArchive({
      archive: makeMetaAppZipArchive({ '../': '' }),
      outDir,
    }),
    /Invalid ZIP entry name/,
  );
});

test('extractMetaAppZipArchive rejects local header name mismatches', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-local-name-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = Buffer.from(makeMetaAppZipArchive({ 'index.html': 'ok' }));
  Buffer.from('other.html', 'utf8').copy(archive, 30);

  await assert.rejects(
    () => extractMetaAppZipArchive({ archive, outDir }),
    /local header/i,
  );
});

test('extractMetaAppZipArchive rejects central directory variable-length overruns', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-central-bounds-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = Buffer.from(makeMetaAppZipArchive({ 'index.html': 'ok' }));
  const centralDirectoryOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(centralDirectoryOffset, -1);
  archive.writeUInt16LE(65000, centralDirectoryOffset + 30);

  await assert.rejects(
    () => extractMetaAppZipArchive({ archive, outDir }),
    /central directory/i,
  );
});

test('extractMetaAppZipArchive bounds deflate output by declared size', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-deflate-cap-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const archive = createDeflateZipWithDeclaredSize({
    entryName: 'large.txt',
    body: Buffer.from('1234567890', 'utf8'),
    declaredUncompressedSize: 4,
  });

  await assert.rejects(
    () => extractMetaAppZipArchive({ archive, outDir }),
    /declared ZIP size/i,
  );
  await assert.rejects(
    () => readFile(path.join(outDir, 'large.txt'), 'utf8'),
    /ENOENT/,
  );
});

test('extractMetaAppZipArchive enforces entry count and extracted size limits', async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-limits-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  await assert.rejects(
    () => extractMetaAppZipArchive({
      archive: makeMetaAppZipArchive({ 'one.txt': '1', 'two.txt': '2' }),
      outDir,
      maxEntries: 1,
    }),
    /too many entries/,
  );

  await assert.rejects(
    () => extractMetaAppZipArchive({
      archive: makeMetaAppZipArchive({ 'large.txt': '1234567890' }),
      outDir,
      maxUncompressedBytes: 4,
    }),
    /maximum extracted size/,
  );
});

test('writeMetaAppZipArchive skips development artifacts from source directories', async (t) => {
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-source-'));
  const outDir = await mkdtemp(path.join(tmpdir(), 'abc-zip-written-'));
  t.after(() => rm(sourceDir, { recursive: true, force: true }));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  await writeFile(path.join(sourceDir, 'index.html'), '<!doctype html><title>Written</title>', 'utf8');
  await writeFile(path.join(sourceDir, '.DS_Store'), 'ignored', 'utf8');
  const archivePath = path.join(outDir, 'app.zip');

  const written = await writeMetaAppZipArchive({ sourceDir, outFile: archivePath });
  assert.equal(written.entries.includes('index.html'), true);
  assert.equal(written.entries.includes('.DS_Store'), false);
  assert.equal(written.bytes > 0, true);
  assert.match(written.sha256, /^[a-f0-9]{64}$/);
});
