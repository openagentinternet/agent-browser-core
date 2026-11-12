import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../../packages/core/dist/index.js');
const { resolvePreviewFileResource } = require('../../packages/core/dist/browser/previewFileResolver.js');
const { resolveBrowserResource } = require('../../packages/core/dist/browser/browserResolver.js');

function baseConfig(overrides = {}) {
  return {
    metasoP2PBaseUrl: 'https://so.metaid.io',
    metafileContentBaseUrl: 'https://cdn.metaid.io',
    manApiBaseUrl: 'https://manapi.metaid.io',
    botHomepageTemplateId: 'document',
    renderCustomBotPages: true,
    nameResolution: { enabled: false, ens: { enabled: false, chainId: 1, rpcUrls: [], textKey: '' } },
    localMode: true,
    enablePreviewFile: true,
    ...overrides,
  };
}

function parsed(path) {
  const normalizedUri = `preview-file://localhost${path}`;
  return { originalUri: normalizedUri, normalizedUri, scheme: 'preview-file', host: 'localhost', path };
}

const stubResolve = async ({ path }) => ({
  localPreviewUrl: `/api/browser/preview-assets/preview-1/${path.split('/').pop()}?abc-viewer=1`,
  contentType: 'text/markdown; charset=utf-8',
});

test('enablePreviewFile unset returns disabled and does not call the callback', async () => {
  let called = false;
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/a.md'),
    config: baseConfig({ enablePreviewFile: undefined }),
    previewFileLocalResolve: async () => { called = true; return { localPreviewUrl: '/x' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resource_disabled');
  assert.match(result.message, /disabled/i);
  assert.equal(called, false);
});

test('missing callback returns unsupported', async () => {
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/a.md'),
    config: baseConfig(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resource_unsupported');
  assert.match(result.message, /not supported by this host/i);
});

test('markdown file resolves to file-viewer with the host URL', async () => {
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/notes.md'),
    config: baseConfig(),
    previewFileLocalResolve: stubResolve,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'file-viewer');
  assert.match(result.data.renderer.url, /notes\.md\?abc-viewer=1$/);
  assert.equal(result.data.renderer.contentType, 'text/markdown; charset=utf-8');
  assert.equal(result.data.renderer.data.kind, 'markdown');
  assert.equal(result.data.title, 'notes.md');
  assert.equal(result.data.owner.name, 'Local File');
  assert.equal(result.data.source.resolver, 'preview-file');
  assert.equal(result.data.resourceType, 'document');
});

test('code file carries the highlight language', async () => {
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/app.ts'),
    config: baseConfig(),
    previewFileLocalResolve: stubResolve,
  });
  assert.equal(result.data.renderer.type, 'file-viewer');
  assert.equal(result.data.renderer.data.language, 'typescript');
});

test('html file resolves to html-iframe', async () => {
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/page.html'),
    config: baseConfig(),
    previewFileLocalResolve: async () => ({ localPreviewUrl: '/p/page.html', contentType: 'text/html' }),
  });
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.renderer.url, '/p/page.html');
});

test('pdf/image/video/audio map to same-named renderers and resource types', async () => {
  for (const [file, type, resourceType] of [
    ['/tmp/a.pdf', 'pdf', 'pdf'],
    ['/tmp/a.png', 'image', 'image'],
    ['/tmp/a.mp4', 'video', 'document'],
    ['/tmp/a.mp3', 'audio', 'document'],
  ]) {
    const result = await resolvePreviewFileResource({
      parsed: parsed(file),
      config: baseConfig(),
      previewFileLocalResolve: async () => ({ localPreviewUrl: '/p/x' }),
    });
    assert.equal(result.data.renderer.type, type, file);
    assert.equal(result.data.resourceType, resourceType, file);
  }
});

test('unsupported file type resolves to error status without a URL', async () => {
  let called = false;
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/report.docx'),
    config: baseConfig(),
    previewFileLocalResolve: async () => { called = true; return { localPreviewUrl: '/x' }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'unsupported');
  assert.equal(result.data.renderer.url, undefined);
  assert.equal(result.data.status.state, 'error');
  assert.match(result.data.renderer.error, /cannot be previewed/i);
  assert.equal(called, false, 'unsupported files must not hit the filesystem');
});

test('callback throw maps to browser_resolve_failed', async () => {
  const result = await resolvePreviewFileResource({
    parsed: parsed('/tmp/a.md'),
    config: baseConfig(),
    previewFileLocalResolve: async () => { throw new Error('Local path not found: /tmp/a.md'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resolve_failed');
  assert.match(result.message, /not found/i);
});

test('resolveBrowserResource dispatches preview-file URIs', async () => {
  const result = await resolveBrowserResource({
    uri: 'preview-file://localhost/tmp/notes.md',
    config: baseConfig(),
    previewFileLocalResolve: stubResolve,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'file-viewer');
  assert.equal(result.data.normalizedUri, 'preview-file://localhost/tmp/notes.md');
});

test('resolveBrowserResource dispatches file:// alias URIs', async () => {
  const result = await resolveBrowserResource({
    uri: 'file:///tmp/notes.md',
    config: baseConfig(),
    previewFileLocalResolve: stubResolve,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, 'preview-file://localhost/tmp/notes.md');
});

test('resolveBrowserResource honours resolveBrowserConfig default (disabled)', async () => {
  const config = core.resolveBrowserConfig({});
  assert.equal(config.enablePreviewFile, false);
  let called = false;
  const result = await resolveBrowserResource({
    uri: 'preview-file://localhost/tmp/notes.md',
    config,
    previewFileLocalResolve: async () => { called = true; return { localPreviewUrl: '/x' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resource_disabled');
  assert.equal(called, false);
});
