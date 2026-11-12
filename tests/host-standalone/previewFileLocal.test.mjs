import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createStandaloneBrowserServer } = require('../../packages/host-standalone/dist/server.js');
const { createStandaloneBrowserHostAdapter } = require('../../packages/host-standalone/dist/adapter.js');

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'preview-file-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function pngBytes() {
  // 1x1 transparent PNG.
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
}

test('preview-file markdown resolves to a viewer page and siblings serve raw', async (t) => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'a.md'), '# Hello\n\n![](img.png)\n');
    await writeFile(path.join(dir, 'img.png'), pngBytes());

    const adapter = createStandaloneBrowserHostAdapter({ enablePreviewFile: true });
    const server = createStandaloneBrowserServer({ adapter });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = await listen(server);

    const resolved = await adapter.resolveResource({
      uri: `preview-file://localhost${path.join(dir, 'a.md')}`,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(resolved.data.renderer.type, 'file-viewer');
    const viewerUrl = new URL(resolved.data.renderer.url, baseUrl);
    assert.match(viewerUrl.search, /abc-viewer=1/);

    const viewerResponse = await fetch(viewerUrl);
    assert.equal(viewerResponse.status, 200);
    assert.match(viewerResponse.headers.get('content-type') ?? '', /text\/html/);
    assert.match(
      viewerResponse.headers.get('content-security-policy') ?? '',
      /default-src 'none'/,
    );
    const html = await viewerResponse.text();
    assert.match(html, /<h1[^>]*>Hello<\/h1>/);
    assert.match(html, /src="img\.png"/);
    assert.equal(html.includes('<script'), false);

    const imageResponse = await fetch(new URL('img.png', viewerUrl));
    assert.equal(imageResponse.status, 200);
    assert.match(imageResponse.headers.get('content-type') ?? '', /image\/png/);
  });
});

test('preview-file serves raw files with classified content types', async (t) => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.from([0, 1, 2, 3]));
    const adapter = createStandaloneBrowserHostAdapter({ enablePreviewFile: true });
    const server = createStandaloneBrowserServer({ adapter });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = await listen(server);

    const resolved = await adapter.resolveResource({
      uri: `preview-file://localhost${path.join(dir, 'clip.mp4')}`,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(resolved.data.renderer.type, 'video');

    const assetResponse = await fetch(new URL(resolved.data.renderer.url, baseUrl));
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') ?? '', /video\/mp4/);
  });
});

test('preview-file is disabled by default', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'a.md'), '# hi\n');
    const adapter = createStandaloneBrowserHostAdapter();
    const resolved = await adapter.resolveResource({
      uri: `preview-file://localhost${path.join(dir, 'a.md')}`,
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.code, 'browser_resource_disabled');
  });
});

test('preview-file on a directory fails with a clear message', async () => {
  await withTempDir(async (dir) => {
    const adapter = createStandaloneBrowserHostAdapter({ enablePreviewFile: true });
    const resolved = await adapter.resolveResource({
      uri: `preview-file://localhost${dir}`,
    });
    assert.equal(resolved.ok, false);
    assert.match(resolved.message, /preview-metaapp/i);
  });
});

test('preview-file on a missing path fails', async () => {
  const adapter = createStandaloneBrowserHostAdapter({ enablePreviewFile: true });
  const resolved = await adapter.resolveResource({
    uri: 'preview-file://localhost/nonexistent-dir-zzz/a.md',
  });
  assert.equal(resolved.ok, false);
  assert.match(resolved.message, /not found/i);
});

test('preview-file unsupported extension resolves to an error without a URL', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'report.docx'), 'x');
    const adapter = createStandaloneBrowserHostAdapter({ enablePreviewFile: true });
    const resolved = await adapter.resolveResource({
      uri: `preview-file://localhost${path.join(dir, 'report.docx')}`,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(resolved.data.renderer.type, 'unsupported');
    assert.equal(resolved.data.renderer.url, undefined);
  });
});
