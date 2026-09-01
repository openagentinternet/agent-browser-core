import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createStandaloneBrowserHostAdapter } = require('../../packages/host-standalone/dist/index.js');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'preview-metaapp-'));
  try {
    await fn(dir);
  } finally {
    // best-effort cleanup; the host is in-memory
  }
}

test('localhost preview of a directory resolves index.html via the preview-assets route shape', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'index.html'), '<h1>hi</h1>');
    const host = createStandaloneBrowserHostAdapter();
    const result = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(result.ok, true);
    assert.equal(result.data.renderer.type, 'html-iframe');
    assert.match(result.data.renderer.url, /\/api\/browser\/preview-assets\//);
    assert.match(result.data.renderer.url, /index\.html$/);
  });
});

test('preview URLs are absolute on a configured dedicated preview origin', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'index.html'), '<h1>hi</h1>');
    const host = createStandaloneBrowserHostAdapter({ previewContentBaseUrl: 'http://127.0.0.1:9911' });
    const result = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(result.ok, true);
    assert.match(result.data.renderer.url, /^http:\/\/127\.0\.0\.1:9911\/api\/browser\/preview-assets\//);
    assert.match(result.data.renderer.url, /index\.html$/);
  });
});

test('preview origin getter is evaluated per session and empty falls back to relative URLs', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'index.html'), '<h1>hi</h1>');
    let currentBase = '';
    const host = createStandaloneBrowserHostAdapter({ previewContentBaseUrl: () => currentBase });
    const relative = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(relative.ok, true);
    assert.match(relative.data.renderer.url, /^\/api\/browser\/preview-assets\//);

    currentBase = 'http://127.0.0.1:9912/';
    const absolute = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(absolute.ok, true);
    assert.match(absolute.data.renderer.url, /^http:\/\/127\.0\.0\.1:9912\/api\/browser\/preview-assets\//);
  });
});

test('localhost preview of a single file uses its parent dir as artifactDir', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'report.pdf'), '%PDF-1.4');
    const host = createStandaloneBrowserHostAdapter();
    const result = await host.resolveResource({ uri: `preview-metaapp://localhost${path.join(dir, 'report.pdf')}` });
    assert.equal(result.ok, true);
    assert.equal(result.data.renderer.type, 'pdf');
    assert.match(result.data.renderer.url, /report\.pdf$/);
  });
});

test('localhost preview of a directory without index.html fails with a clear message', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'other.html'), 'x');
    const host = createStandaloneBrowserHostAdapter();
    const result = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(result.ok, false);
    assert.match(result.message, /index\.html/i);
  });
});

test('localhost preview of a non-existent path fails', async () => {
  const host = createStandaloneBrowserHostAdapter();
  const result = await host.resolveResource({ uri: 'preview-metaapp://localhost/this/does/not/exist' });
  assert.equal(result.ok, false);
  assert.match(result.message, /not found/i);
});

test('preview session ids are unique and unguessable', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'index.html'), '<h1>hi</h1>');
    const host = createStandaloneBrowserHostAdapter();
    const first = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    const second = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const extractId = (url) => url.match(/\/api\/browser\/preview-assets\/([^/]+)\//)[1];
    const firstId = extractId(first.data.renderer.url);
    const secondId = extractId(second.data.renderer.url);
    assert.notEqual(firstId, secondId);
    assert.match(firstId, /^standalone-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.match(secondId, /^standalone-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
