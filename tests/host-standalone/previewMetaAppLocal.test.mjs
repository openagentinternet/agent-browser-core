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
