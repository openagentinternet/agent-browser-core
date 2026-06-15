import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildMetaAppResolveResult } = require('../../packages/core/dist/browser/metaAppResolver.js');
const { resolveMetaAppPinToRecord } = require('../../packages/core/dist/browser/metaAppPinResolver.js');

function record(overrides = {}) {
  return {
    pinId: 'a'.repeat(64) + 'i0',
    firstPinId: 'b'.repeat(64) + 'i0',
    operation: 'create',
    title: 'Fixture MetaApp',
    appName: 'fixture-metaapp',
    version: '1.0.0',
    runtime: 'browser',
    indexFile: 'index.html',
    code: '',
    content: '',
    contentType: 'text/html',
    codeType: 'html',
    tags: [],
    ownerGlobalMetaId: 'idq1publisher',
    ownerAddress: '18Publisher',
    network: 'mvc',
    metawebUrl: 'https://metaweb.example/app',
    localUiUrl: '/api/metaapp/preview-assets/preview/index.html',
    updatedAt: 1780760000000,
    source: 'indexer',
    ...overrides,
  };
}

test('buildMetaAppResolveResult selects sandboxed html iframe renderer', () => {
  const result = buildMetaAppResolveResult({
    uri: 'metaapp://' + 'a'.repeat(64) + 'i0',
    normalizedUri: 'metaapp://' + 'a'.repeat(64) + 'i0',
    record: record(),
    fetchedAt: 1780760000001,
  });

  assert.equal(result.resourceType, 'metaapp');
  assert.equal(result.owner.kind, 'metaapp-publisher');
  assert.equal(result.owner.globalMetaId, 'idq1publisher');
  assert.equal(result.renderer.type, 'html-iframe');
  assert.equal(result.renderer.url, '/api/metaapp/preview-assets/preview/index.html');
  assert.equal(result.actions.some((action) => action.kind === 'copy'), true);
  assert.equal(result.actions.some((action) => action.kind === 'proof'), true);
});

test('buildMetaAppResolveResult selects content-specific renderers', () => {
  const pdf = buildMetaAppResolveResult({ uri: 'metaapp://pin', normalizedUri: 'metaapp://pin', record: record({ contentType: 'application/pdf', localUiUrl: '', downloadUrl: 'https://files.example/a.pdf' }) });
  assert.equal(pdf.renderer.type, 'pdf');
  assert.equal(pdf.renderer.url, 'https://files.example/a.pdf');

  const image = buildMetaAppResolveResult({ uri: 'metaapp://pin', normalizedUri: 'metaapp://pin', record: record({ contentType: 'image/png', localUiUrl: '', downloadUrl: 'https://files.example/a.png' }) });
  assert.equal(image.renderer.type, 'image');
  assert.equal(image.renderer.url, 'https://files.example/a.png');

  const video = buildMetaAppResolveResult({ uri: 'metaapp://pin', normalizedUri: 'metaapp://pin', record: record({ contentType: 'video/mp4', localUiUrl: '', downloadUrl: 'https://files.example/a.mp4' }) });
  assert.equal(video.renderer.type, 'video');
  assert.equal(video.renderer.url, 'https://files.example/a.mp4');

  assert.equal(buildMetaAppResolveResult({ uri: 'metaapp://pin', normalizedUri: 'metaapp://pin', record: record({ contentType: 'application/octet-stream', localUiUrl: '', downloadUrl: 'https://files.example/a.bin' }) }).renderer.type, 'unsupported');
});

test('resolveMetaAppPinToRecord renders metafile content URL instead of ManAPI metadata URL', async () => {
  const pinId = 'c'.repeat(64) + 'i0';
  const contentPinId = 'd'.repeat(64) + 'i0';
  const manApiBaseUrl = 'https://man.example.test';
  const metafileContentBaseUrl = 'https://content.example.test/files';
  const resolved = await resolveMetaAppPinToRecord({
    pinId,
    manApiBaseUrl,
    metafileContentBaseUrl,
    fetch: async (url) => {
      assert.equal(String(url), `${manApiBaseUrl}/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: {
            pin: {
              path: '/protocols/metaapp',
              ownerGlobalMetaId: 'idq1publisher',
              address: '18Publisher',
              timestamp: 1780760000,
              contentSummary: JSON.stringify({
                title: 'Fixture HTML MetaApp',
                appName: 'fixture-html-metaapp',
                version: '1.0.0',
                content: `metafile://${contentPinId}.html`,
                contentType: 'text/html',
                codeType: 'html',
                indexFile: 'index.html',
              }),
            },
          },
        }),
      };
    },
    now: () => 1780760000001,
  });

  assert.equal(resolved.ok, true);
  const result = buildMetaAppResolveResult({
    uri: `metaapp://${pinId}`,
    normalizedUri: `metaapp://${pinId}`,
    record: resolved.data,
  });

  assert.equal(result.renderer.type, 'html-iframe');
  assert.equal(result.renderer.url, `${metafileContentBaseUrl}/${contentPinId}`);
  assert.notEqual(result.renderer.url, `${manApiBaseUrl}/pin/${pinId}`);
});

test('resolveMetaAppPinToRecord returns HTML content when the host creates a ZIP preview URL', async () => {
  const pinId = 'e1'.repeat(32) + 'i0';
  const contentPinId = 'f2'.repeat(32) + 'i0';
  const resolved = await resolveMetaAppPinToRecord({
    pinId,
    manApiBaseUrl: 'https://man.example.test',
    metafileContentBaseUrl: 'https://content.example.test/files',
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            pin: {
              path: '/protocols/metaapp',
              ownerGlobalMetaId: 'idq1publisher',
              address: '18Publisher',
              timestamp: 1781450015,
              contentSummary: JSON.stringify({
                title: 'ZIP Preview MetaApp',
                appName: 'zip-preview-metaapp',
                version: '1.0.0',
                content: `metafile://${contentPinId}.zip`,
                contentType: 'application/zip',
                codeType: 'application/zip',
                indexFile: 'index.html',
              }),
            },
          },
        }),
      };
    },
    createPreviewSession: ({ contentReference, contentType, indexFile }) => {
      assert.equal(contentReference, `metafile://${contentPinId}.zip`);
      assert.equal(contentType, 'application/zip');
      assert.equal(indexFile, 'index.html');
      return {
        previewId: 'zip-preview',
        localPreviewUrl: '/api/browser/preview-assets/zip-preview/index.html',
      };
    },
    now: () => 1781450015615,
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.contentType, 'text/html');
  assert.equal(resolved.data.codeType, 'application/zip');
  assert.equal(resolved.data.localUiUrl, '/api/browser/preview-assets/zip-preview/index.html');
  assert.equal(resolved.data.runUrl, '/api/browser/preview-assets/zip-preview/index.html');

  const result = buildMetaAppResolveResult({
    uri: `metaapp://${pinId}`,
    normalizedUri: `metaapp://${pinId}`,
    record: resolved.data,
  });
  assert.equal(result.renderer.type, 'html-iframe');
  assert.equal(result.renderer.url, '/api/browser/preview-assets/zip-preview/index.html');
});
