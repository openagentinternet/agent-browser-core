import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { makeMetaAppZipArchive } from '../fixtures/browser/metaappZipFixture.mjs';

const require = createRequire(import.meta.url);
const {
  buildMetaAppArtifactCacheKey,
  createStandaloneMetaAppArtifactCacheStore,
  resolveStandaloneMetaAppCacheRoot,
} = require('../../packages/host-standalone/dist/metaapp/artifactCache.js');

const descriptor = {
  metaAppPinId: 'c7'.repeat(32) + 'i0',
  contentReference: 'metafile://' + 'd6'.repeat(32) + 'i0.zip',
  contentType: 'application/zip',
  indexFile: 'index.html',
  modifyHistory: null,
};

test('resolveStandaloneMetaAppCacheRoot uses env override and platform defaults', () => {
  assert.equal(
    resolveStandaloneMetaAppCacheRoot({
      cacheRoot: '/tmp/explicit-cache',
      env: { AGENT_BROWSER_CACHE_DIR: '/tmp/env-cache' },
    }),
    '/tmp/explicit-cache',
  );
  assert.equal(
    resolveStandaloneMetaAppCacheRoot({ env: { AGENT_BROWSER_CACHE_DIR: '/tmp/abc-cache' } }),
    '/tmp/abc-cache',
  );
  assert.equal(
    resolveStandaloneMetaAppCacheRoot({ env: {}, platform: 'darwin', homeDir: '/Users/alice' }),
    '/Users/alice/Library/Caches/agent-browser-core/metaapps',
  );
  assert.equal(
    resolveStandaloneMetaAppCacheRoot({ env: {}, platform: 'linux', homeDir: '/home/alice' }),
    '/home/alice/.cache/agent-browser-core/metaapps',
  );
});

test('standalone artifact cache writes, reads, reports, and clears ZIP artifacts', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({
    cacheRoot,
    now: () => 1781450015615,
  });
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Cached</title>',
    'assets/app.js': 'window.__cached = true;',
  });

  assert.equal(await cache.getArtifact(descriptor), null);

  const written = await cache.writeArtifact({ ...descriptor, archive });
  assert.match(written.cacheKey, /^[a-f0-9]{64}$/);
  assert.equal(written.indexFile, 'index.html');
  assert.match(await readFile(path.join(written.artifactDir, 'index.html'), 'utf8'), /Cached/);

  const hit = await cache.getArtifact(descriptor);
  assert.equal(hit.cacheKey, written.cacheKey);
  assert.equal(hit.artifactDir, written.artifactDir);

  const stats = await cache.getStats();
  assert.equal(stats.cacheRoot, cacheRoot);
  assert.equal(stats.artifactCount, 1);
  assert.equal(stats.pinRecordCount, 1);
  assert.equal(stats.totalBytes > 0, true);
  assert.equal(stats.artifacts[0].cacheKey, written.cacheKey);

  const clearedPin = await cache.clear({ scope: 'pin', pinId: descriptor.metaAppPinId });
  assert.equal(clearedPin.clearedArtifacts, 0);
  assert.equal(clearedPin.clearedPinRecords, 1);
  const afterPinClear = await cache.getStats();
  assert.equal(afterPinClear.artifactCount, 1);
  assert.equal(afterPinClear.pinRecordCount, 0);

  const clearedArtifact = await cache.clear({ scope: 'artifact', cacheKey: written.cacheKey });
  assert.equal(clearedArtifact.clearedArtifacts, 1);
  assert.equal(clearedArtifact.clearedPinRecords, 0);
  assert.equal((await cache.getStats()).artifactCount, 0);
});

test('standalone artifact clear removes associated pin records', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-artifact-clear-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({ cacheRoot });
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Clear artifact</title>',
  });
  const written = await cache.writeArtifact({ ...descriptor, archive });

  const clearedArtifact = await cache.clear({ scope: 'artifact', cacheKey: written.cacheKey });
  assert.equal(clearedArtifact.clearedArtifacts, 1);
  assert.equal(clearedArtifact.clearedPinRecords, 1);
  const stats = await cache.getStats();
  assert.equal(stats.artifactCount, 0);
  assert.equal(stats.pinRecordCount, 0);
});

test('standalone artifact clear without cache key removes artifacts and preserves pin records', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-artifact-all-clear-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({ cacheRoot });
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Clear artifacts only</title>',
  });
  await cache.writeArtifact({ ...descriptor, archive });

  const cleared = await cache.clear({ scope: 'artifact' });
  assert.equal(cleared.clearedArtifacts, 1);
  assert.equal(cleared.clearedPinRecords, 0);
  const stats = await cache.getStats();
  assert.equal(stats.artifactCount, 0);
  assert.equal(stats.pinRecordCount, 1);
});

test('standalone all clear removes artifacts and pin records', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-all-clear-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({ cacheRoot });
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Clear all</title>',
  });
  await cache.writeArtifact({ ...descriptor, archive });

  const cleared = await cache.clear();
  assert.equal(cleared.clearedArtifacts, 1);
  assert.equal(cleared.clearedPinRecords, 1);
  const stats = await cache.getStats();
  assert.equal(stats.artifactCount, 0);
  assert.equal(stats.pinRecordCount, 0);
});

test('standalone artifact cache ignores a tampered manifest artifact path', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-tampered-manifest-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({ cacheRoot });
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Tampered</title>',
  });
  const written = await cache.writeArtifact({ ...descriptor, archive });
  const manifest = JSON.parse(await readFile(written.manifestPath, 'utf8'));
  await writeFile(
    written.manifestPath,
    `${JSON.stringify({ ...manifest, artifactPath: '../outside' }, null, 2)}\n`,
    'utf8',
  );

  assert.equal(await cache.getArtifact(descriptor), null);
  const stats = await cache.getStats();
  assert.equal(stats.artifactCount, 0);
});

test('standalone artifact cache preserves an existing artifact when a replacement ZIP is invalid', async (t) => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'abc-artifact-cache-invalid-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));

  const cache = createStandaloneMetaAppArtifactCacheStore({ cacheRoot });
  const validArchive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Valid</title>',
  });
  const written = await cache.writeArtifact({ ...descriptor, archive: validArchive });

  await assert.rejects(
    () => cache.writeArtifact({ ...descriptor, archive: Buffer.from('not a zip') }),
    /ZIP end-of-central-directory/,
  );

  const hit = await cache.getArtifact(descriptor);
  assert.equal(hit.cacheKey, written.cacheKey);
  assert.match(await readFile(path.join(hit.artifactDir, 'index.html'), 'utf8'), /Valid/);
});

test('buildMetaAppArtifactCacheKey changes when content identity changes', () => {
  const first = buildMetaAppArtifactCacheKey(descriptor);
  const second = buildMetaAppArtifactCacheKey({
    ...descriptor,
    indexFile: 'app/index.html',
  });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});
