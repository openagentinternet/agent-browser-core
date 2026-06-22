import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveMetafilePinToResource } = require('../../packages/core/dist/browser/metafileResolver.js');

const manApiBaseUrl = 'https://man.example.test';
const metafileContentBaseUrl = 'https://file.metaid.io/metafile-indexer';
const acceleratedContentBaseUrl = `${metafileContentBaseUrl}/api/v1/files/accelerate/content`;

function pinRecord(pinId, overrides = {}) {
  return {
    id: pinId,
    path: '/file/example.bin',
    contentType: 'application/octet-stream',
    contentTypeDetect: '',
    contentLength: 120,
    globalMetaId: 'idq1publisher',
    address: '18Publisher',
    timestamp: 1780760000,
    ...overrides,
  };
}

function fetchPin(expectedPinId, record) {
  return async (url) => {
    assert.equal(String(url), `${manApiBaseUrl}/pin/${expectedPinId}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 1,
        message: 'ok',
        data: record,
      }),
    };
  };
}

test('resolveMetafilePinToResource normalizes extension input and trusts chain content type', async () => {
  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const result = await resolveMetafilePinToResource({
    uri: `metafile://${pinId}.png`,
    id: `${pinId}.png`,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: fetchPin(pinId, pinRecord(pinId, {
      path: '/file/index',
      contentType: 'metafile/index;utf-8',
      contentTypeDetect: 'text/plain; charset=utf-8',
      contentLength: 368,
      contentSummary: JSON.stringify({
        dataType: 'application/pdf;binary',
        name: 'chain-document.pdf',
        fileSize: 42_000,
        sha256: '826a0410e9481c61f5013c75ee5ca2f4a6d2452efd389995129b74efac5c81a2',
      }),
    })),
    now: () => 1780760000001,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metafile://${pinId}`);
  assert.equal(result.data.resourceType, 'pdf');
  assert.equal(result.data.renderer.type, 'pdf');
  assert.equal(result.data.renderer.contentType, 'application/pdf');
  assert.equal(result.data.renderer.url, `${acceleratedContentBaseUrl}/${pinId}`);
  assert.equal(result.data.title, 'chain-document.pdf');
  assert.equal(result.data.proof.pinId, pinId);
  assert.equal(result.data.proof.details.fileSize, 42_000);
  assert.equal(result.data.source.url, `${manApiBaseUrl}/pin/${pinId}`);
});

test('resolveMetafilePinToResource selects video renderer from ManAPI content type', async () => {
  const pinId = '3b94a321a496a5a92e765acae78101d35ad42728b00b30d2ce085034eadcc1b0i0';
  const result = await resolveMetafilePinToResource({
    uri: `metafile://${pinId}`,
    id: pinId,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: fetchPin(pinId, pinRecord(pinId, {
      path: '/file/index',
      contentType: 'metafile/index;utf-8',
      contentTypeDetect: 'text/plain; charset=utf-8',
      contentSummary: JSON.stringify({
        dataType: 'video/mp4;binary',
        name: 'demo-video.mp4',
      }),
    })),
    now: () => 1780760000001,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'document');
  assert.equal(result.data.renderer.type, 'video');
  assert.equal(result.data.renderer.contentType, 'video/mp4');
  assert.equal(result.data.renderer.url, `${acceleratedContentBaseUrl}/${pinId}`);
});

test('resolveMetafilePinToResource returns a download link for unsupported ZIP content', async () => {
  const pinId = '70f90112e924ece97b15ff2c833ef573a3800761ebdd5d8dcb6d1c72b7e36361i0';
  const result = await resolveMetafilePinToResource({
    uri: `metafile://${pinId}.zip`,
    id: `${pinId}.zip`,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: fetchPin(pinId, pinRecord(pinId, {
      path: '/file/archive.zip',
      contentType: 'application/zip;binary',
      contentTypeDetect: 'application/zip',
    })),
    now: () => 1780760000001,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metafile://${pinId}`);
  assert.equal(result.data.resourceType, 'unsupported');
  assert.equal(result.data.renderer.type, 'unsupported');
  assert.equal(result.data.renderer.contentType, 'application/zip');
  assert.equal(result.data.renderer.url, `${acceleratedContentBaseUrl}/${pinId}`);
  assert.equal(result.data.status.state, 'resolved');
  assert.match(result.data.renderer.error, /download/i);
});

test('resolveMetafilePinToResource strips the typed-path prefix (metafile://video/<pinid>)', async () => {
  const pinId = 'ca285872c9a994bdceab001f31ba82c67455a06a295948b97def0682e04b64dei0';
  const result = await resolveMetafilePinToResource({
    uri: `metafile://video/${pinId}`,
    id: `video/${pinId}`,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: fetchPin(pinId, pinRecord(pinId, {
      path: '/file/index',
      contentType: 'metafile/index;utf-8',
      contentTypeDetect: 'text/plain; charset=utf-8',
      contentSummary: JSON.stringify({ dataType: 'video/mp4;binary', name: 'clip.mp4' }),
    })),
    now: () => 1780760000001,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metafile://${pinId}`);
  assert.equal(result.data.resourceType, 'document');
  assert.equal(result.data.renderer.type, 'video');
  assert.equal(result.data.renderer.url, `${acceleratedContentBaseUrl}/${pinId}`);
});

test('resolveMetafilePinToResource selects audio renderer for audio content types', async () => {
  const pinId = 'dd53ea8c3f3d51a7f9af2c06807ffabd3f560cff4e80f6ae8881d628f186ab91i0';
  const result = await resolveMetafilePinToResource({
    uri: `metafile://${pinId}.wav`,
    id: `${pinId}.wav`,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: fetchPin(pinId, pinRecord(pinId, {
      path: '/file/voice.wav',
      contentType: 'audio/wave',
    })),
    now: () => 1780760000001,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metafile://${pinId}`);
  assert.equal(result.data.resourceType, 'document');
  assert.equal(result.data.renderer.type, 'audio');
  assert.equal(result.data.renderer.contentType, 'audio/wave');
  assert.equal(result.data.renderer.url, `${acceleratedContentBaseUrl}/${pinId}`);
});
