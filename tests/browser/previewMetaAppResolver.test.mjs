import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../../packages/core/dist/index.js');
const { resolvePreviewMetaAppResource } = require('../../packages/core/dist/browser/previewMetaAppResolver.js');

function baseConfig(overrides = {}) {
  return {
    metasoP2PBaseUrl: 'https://so.metaid.io',
    metafileContentBaseUrl: 'https://cdn.metaid.io',
    manApiBaseUrl: 'https://manapi.metaid.io',
    botHomepageTemplateId: 'document',
    renderCustomBotPages: true,
    nameResolution: { enabled: false, ens: { enabled: false, chainId: 1, rpcUrls: [], textKey: '' } },
    localMode: true,
    enablePreviewMetaApp: true,
    ...overrides,
  };
}

function parsed(host, path) {
  const normalizedUri = `preview-metaapp://${host}${path}`;
  return { originalUri: normalizedUri, normalizedUri, scheme: 'preview-metaapp', host, path };
}

test('localhost branch calls the host factory and uses its localPreviewUrl', async () => {
  let calledWithPath = null;
  const result = await resolvePreviewMetaAppResource({
    parsed: parsed('localhost', '/Users/tusm/app/index.html'),
    config: baseConfig(),
    previewMetaAppLocalResolve: async ({ path }) => {
      calledWithPath = path;
      return { localPreviewUrl: '/api/browser/preview-assets/preview-1/index.html', contentType: 'text/html' };
    },
  });
  assert.equal(calledWithPath, '/Users/tusm/app/index.html');
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.renderer.url, '/api/browser/preview-assets/preview-1/index.html');
});

test('localhost branch without a factory returns unsupported', async () => {
  const result = await resolvePreviewMetaAppResource({
    parsed: parsed('localhost', '/Users/tusm/app/index.html'),
    config: baseConfig(),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /not supported by this host/i);
});

test('enablePreviewMetaApp false returns unsupported and does not call the factory', async () => {
  let called = false;
  const result = await resolvePreviewMetaAppResource({
    parsed: parsed('localhost', '/Users/tusm/app/index.html'),
    config: baseConfig({ enablePreviewMetaApp: false }),
    previewMetaAppLocalResolve: async () => { called = true; return { localPreviewUrl: '/x' }; },
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /disabled/i);
  assert.equal(called, false);
});

test('remote branch builds an https url and selects renderer by extension', async () => {
  let called = false;
  const result = await resolvePreviewMetaAppResource({
    parsed: parsed('example.com', '/path/to/index.html'),
    config: baseConfig(),
    previewMetaAppLocalResolve: async () => { called = true; return { localPreviewUrl: '/x' }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.renderer.url, 'https://example.com/path/to/index.html');
  assert.equal(called, false, 'remote branch must not invoke the local factory');
});

test('remote branch selects pdf/image/video/audio by extension', async () => {
  const pdf = await resolvePreviewMetaAppResource({ parsed: parsed('example.com', '/a.pdf'), config: baseConfig() });
  assert.equal(pdf.data.renderer.type, 'pdf');
  assert.equal(pdf.data.renderer.url, 'https://example.com/a.pdf');

  const image = await resolvePreviewMetaAppResource({ parsed: parsed('example.com', '/a.png'), config: baseConfig() });
  assert.equal(image.data.renderer.type, 'image');

  const video = await resolvePreviewMetaAppResource({ parsed: parsed('example.com', '/a.mp4'), config: baseConfig() });
  assert.equal(video.data.renderer.type, 'video');

  const audio = await resolvePreviewMetaAppResource({ parsed: parsed('example.com', '/a.mp3'), config: baseConfig() });
  assert.equal(audio.data.renderer.type, 'audio');
});

test('remote branch returns unsupported for unknown extensions', async () => {
  const result = await resolvePreviewMetaAppResource({ parsed: parsed('example.com', '/a.bin'), config: baseConfig() });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'unsupported');
  assert.equal(result.data.renderer.url, undefined);
});
