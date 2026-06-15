# Standalone MetaApp ZIP Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ABC standalone resolve valid ZIP-backed `metaapp://` resources to `html-iframe` renderers served from host-owned preview assets.

**Architecture:** This plan implements Phase 1 from the accepted SPEC only: local standalone ZIP preview. `packages/core` remains host-neutral; `packages/ui` continues to render the host-returned `renderer.url`; `packages/host-standalone` owns ZIP download, validation, extraction, local artifact cache, preview sessions, and cache reporting. The production `botinternet.org` preview backend and object-storage adapter are intentionally left for a separate plan.

**Tech Stack:** Node.js `>=20 <25`, TypeScript strict mode, npm workspaces, Node `http`, Node's built-in `node:test`, host-owned file-system cache, no new ZIP npm dependency in Phase 1.

---

## Operating Rules

- Work in `/Users/tusm/Documents/MetaID_Projects/agent-browser-core`.
- Create an implementation branch before touching code, for example:

  ```bash
  git checkout -b codex/standalone-metaapp-zip-preview
  ```

- Do not edit `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`.
- Use OAC files as read-only reference material only.
- Keep `packages/core` free of file-system, ZIP extraction, object storage, OAC, IDBots, SQLite, Metalet, and daemon imports.
- Keep `packages/ui` free of ZIP download and extraction logic.
- Commit each task separately.
- Post a Bob Buzz development journal for every commit, per repository rules.

## Scope Boundary

This plan delivers local standalone ZIP preview:

- `http://127.0.0.1:8787/browser` can resolve a valid ZIP MetaApp to `html-iframe`;
- extracted ZIP files live under a standalone host cache root;
- `/api/browser/preview-assets/:previewId/:assetPath` serves extracted assets;
- cache status and clearing use the existing Browser cache API.

This plan does not add:

- `packages/preview-backend`;
- object storage;
- `metaapp-preview.botinternet.org`;
- public rate limiting;
- production deployment configuration.

## Source References

Read these before implementation:

- `docs/superpowers/specs/2026-06-15-standalone-metaapp-preview-backend-design.md`
- `packages/core/src/browser/metaAppPinResolver.ts`
- `packages/core/src/browser/metaAppResolver.ts`
- `packages/host-standalone/src/adapter.ts`
- `packages/host-standalone/src/server.ts`
- `packages/host-standalone/src/http.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/metaapp/zipArchive.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/metaapp/artifactCache.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/metaAppPinResolver.ts`

## Target File Structure

Expected files after this plan:

```text
packages/
  host-standalone/
    src/
      adapter.ts
      metaapp/
        artifactCache.ts
        zipArchive.ts
      server.ts
    package.json
tests/
  browser/
    metaAppResolver.test.mjs
    browserStandaloneServer.test.mjs
  fixtures/
    browser/
      metaappZipFixture.mjs
  host-standalone/
    metaAppArtifactCache.test.mjs
    metaAppZipArchive.test.mjs
  package/
    packContents.test.mjs
  release/
    hostNeutralGuardrails.test.mjs
docs/
  acceptance/
    browser-parity-standalone.md
```

Do not add files under `packages/core/src/metaapp` in this phase.

## Task 1: Add ZIP Fixture Helper And Failing Standalone Test

**Files:**

- Create: `tests/fixtures/browser/metaappZipFixture.mjs`
- Modify: `tests/browser/metaAppResolver.test.mjs`
- Modify: `tests/browser/browserStandaloneServer.test.mjs`

- [ ] **Step 1: Create a test-only ZIP fixture writer**

Create `tests/fixtures/browser/metaappZipFixture.mjs` with this complete content:

```js
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
```

- [ ] **Step 2: Import fixture helpers in the standalone server test**

At the top of `tests/browser/browserStandaloneServer.test.mjs`, add:

```js
import { makeMetaAppZipArchive } from '../fixtures/browser/metaappZipFixture.mjs';
```

Keep the existing imports.

- [ ] **Step 3: Add a core resolver guard for host-created preview URLs**

Append this test to `tests/browser/metaAppResolver.test.mjs`:

```js
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
```

- [ ] **Step 4: Add a failing ZIP MetaApp test**

Append this test to `tests/browser/browserStandaloneServer.test.mjs`:

```js
test('standalone Browser server downloads ZIP MetaApp content into artifact cache and serves preview assets', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abc-standalone-zip-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const pinId = 'a9'.repeat(32) + 'i0';
  const contentPinId = 'b8'.repeat(32) + 'i0';
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>ZIP Preview</title><script src="./assets/app.js"></script>',
    'assets/app.js': 'window.__abcZipPreviewLoaded = true;',
  });
  let zipFetchCount = 0;

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      AGENT_BROWSER_CACHE_DIR: cacheDir,
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
      METABOT_BROWSER_METAFILE_CONTENT_BASE_URL: 'https://content.example.test/files',
    },
    now: () => 1781450015615,
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1ZipPublisher',
            ownerGlobalMetaId: 'idq1zippublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'ZIP MetaApp',
              appName: 'zip-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: `metafile://${contentPinId}.zip`,
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === `https://content.example.test/files/${contentPinId}`) {
        zipFetchCount += 1;
        return new Response(archive, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const firstResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const first = await readJson(firstResponse);
  assert.equal(firstResponse.status, 200);
  assert.equal(first.ok, true);
  assert.equal(first.data.renderer.type, 'html-iframe');
  assert.equal(first.data.renderer.contentType, 'text/html');
  assert.match(first.data.renderer.url, /^\/api\/browser\/preview-assets\/standalone-/);
  assert.equal(first.data.renderer.data.record.contentType, 'text/html');
  assert.equal(first.data.renderer.data.record.codeType, 'application/zip');

  const htmlResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  assert.match(await htmlResponse.text(), /ZIP Preview/);

  const scriptUrl = first.data.renderer.url.replace(/index\.html$/, 'assets/app.js');
  const scriptResponse = await fetch(`${baseUrl}${scriptUrl}`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('content-type'), /text\/javascript/);
  assert.match(await scriptResponse.text(), /__abcZipPreviewLoaded/);

  const cache = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cache.ok, true);
  assert.equal(cache.data.cacheRoot, cacheDir);
  assert.equal(cache.data.artifactCount, 1);
  assert.equal(cache.data.pinRecordCount, 1);
  assert.equal(cache.data.activePreviewSessionCount, 1);
  assert.equal(cache.data.totalBytes > 0, true);

  const secondResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const second = await readJson(secondResponse);
  assert.equal(secondResponse.status, 200);
  assert.equal(second.ok, true);
  assert.equal(second.data.renderer.type, 'html-iframe');
  assert.equal(zipFetchCount, 1);

  const clearResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all' }),
  });
  const cleared = await readJson(clearResponse);
  assert.equal(clearResponse.status, 200);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.clearedArtifacts, 1);
  assert.equal(cleared.data.clearedPinRecords, 1);

  const afterClearResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  const afterClear = await readJson(afterClearResponse);
  assert.equal(afterClearResponse.status, 404);
  assert.equal(afterClear.ok, false);
  assert.equal(afterClear.code, 'browser_resource_not_found');
});
```

- [ ] **Step 5: Run the focused test and verify it fails for unsupported ZIP preview**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/browserStandaloneServer.test.mjs
```

Expected: FAIL in the new test because `renderer.type` is currently `unsupported`, or because ZIP
preview cache support is missing from `packages/host-standalone`.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/browser/metaappZipFixture.mjs tests/browser/metaAppResolver.test.mjs tests/browser/browserStandaloneServer.test.mjs
git commit -m "test: cover standalone zip metaapp preview"
```

Post a Bob Buzz journal that states the failing test captures the expected standalone ZIP MetaApp
behavior before implementation.

## Task 2: Add Host-Side ZIP Archive Utility

**Files:**

- Create: `packages/host-standalone/src/metaapp/zipArchive.ts`
- Create: `tests/host-standalone/metaAppZipArchive.test.mjs`

- [ ] **Step 1: Create the standalone MetaApp helper directory**

Run:

```bash
mkdir -p packages/host-standalone/src/metaapp
```

- [ ] **Step 2: Copy the proven ZIP archive utility into the standalone host**

Run:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/metaapp/zipArchive.ts packages/host-standalone/src/metaapp/zipArchive.ts
```

Keep the file host-owned. Do not export it from `packages/core`.

- [ ] **Step 3: Verify the copied utility has no OAC imports**

Run:

```bash
rg -n "open-agent-connect|src/daemon|resolveMetabotPaths|MetabotPaths|SQLite|Metalet|IDBots" packages/host-standalone/src/metaapp/zipArchive.ts
```

Expected: no matches.

- [ ] **Step 4: Add ZIP archive utility tests**

Create `tests/host-standalone/metaAppZipArchive.test.mjs` with this complete content:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { makeMetaAppZipArchive } from '../fixtures/browser/metaappZipFixture.mjs';

const require = createRequire(import.meta.url);
const {
  extractMetaAppZipArchive,
  writeMetaAppZipArchive,
} = require('../../packages/host-standalone/dist/metaapp/zipArchive.js');

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
```

- [ ] **Step 5: Run the ZIP utility tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-standalone/metaAppZipArchive.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/host-standalone/src/metaapp/zipArchive.ts tests/host-standalone/metaAppZipArchive.test.mjs
git commit -m "feat: add standalone metaapp zip archive utility"
```

Post a Bob Buzz journal describing the host-owned ZIP extraction utility and path traversal coverage.

## Task 3: Add Standalone Artifact Cache

**Files:**

- Create: `packages/host-standalone/src/metaapp/artifactCache.ts`
- Create: `tests/host-standalone/metaAppArtifactCache.test.mjs`

- [ ] **Step 1: Copy the artifact cache source as a starting point**

Run:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/metaapp/artifactCache.ts packages/host-standalone/src/metaapp/artifactCache.ts
```

- [ ] **Step 2: Replace OAC path imports with standalone cache root imports**

In `packages/host-standalone/src/metaapp/artifactCache.ts`, replace the top imports with:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractMetaAppZipArchive } from './zipArchive.js';
```

Remove every reference to:

```ts
import { resolveMetabotPaths, type MetabotPaths } from '../state/paths';
```

- [ ] **Step 3: Replace path resolution with standalone cache root resolution**

Replace the copied `resolvePaths` function with this code:

```ts
export interface StandaloneMetaAppArtifactCacheOptions {
  cacheRoot?: string;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

function normalizeCacheRoot(value: unknown): string {
  return normalizeText(value).replace(/\/+$/, '');
}

export function resolveStandaloneMetaAppCacheRoot(input: {
  cacheRoot?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homeDir?: string;
} = {}): string {
  const env = input.env ?? process.env;
  const explicit = normalizeCacheRoot(input.cacheRoot) || normalizeCacheRoot(env.AGENT_BROWSER_CACHE_DIR);
  if (explicit) {
    return path.resolve(explicit);
  }

  const homeDir = normalizeText(input.homeDir) || os.homedir();
  if ((input.platform ?? process.platform) === 'darwin') {
    return path.join(homeDir, 'Library', 'Caches', 'agent-browser-core', 'metaapps');
  }
  return path.join(homeDir, '.cache', 'agent-browser-core', 'metaapps');
}
```

- [ ] **Step 4: Rename the factory and remove Metabot path types**

Replace the copied factory signature:

```ts
export function createMetaAppArtifactCacheStore(
  pathsOrHomeDir: string | MetabotPaths,
  options: MetaAppArtifactCacheOptions = {},
): MetaAppArtifactCacheStore {
  const paths = resolvePaths(pathsOrHomeDir);
  const cacheRoot = path.join(paths.metabotRoot, 'cache', 'metaapps');
```

with:

```ts
export function createStandaloneMetaAppArtifactCacheStore(
  options: StandaloneMetaAppArtifactCacheOptions = {},
): MetaAppArtifactCacheStore {
  const cacheRoot = resolveStandaloneMetaAppCacheRoot(options);
```

Keep the following lines unchanged after the new `cacheRoot` assignment:

```ts
  const artifactsRoot = path.join(cacheRoot, 'artifacts');
  const pinsRoot = path.join(cacheRoot, 'pins');
  const now = options.now ?? Date.now;
```

- [ ] **Step 5: Keep the descriptor and cache methods host-neutral**

Verify these exported names exist in `packages/host-standalone/src/metaapp/artifactCache.ts`:

```ts
export interface MetaAppArtifactDescriptor
export interface MetaAppArtifactCacheEntry
export interface MetaAppArtifactCacheStats
export interface MetaAppArtifactCacheStore
export function normalizeMetaAppModifyHistory
export function buildMetaAppArtifactCacheKey
export function resolveStandaloneMetaAppCacheRoot
export function createStandaloneMetaAppArtifactCacheStore
```

No function in this file should mention OAC, daemon, profile, or Metabot paths.

- [ ] **Step 6: Replace copied pin clear behavior with standalone semantics**

In `packages/host-standalone/src/metaapp/artifactCache.ts`, replace the `clear(input = { scope: 'all' })` implementation with this version:

```ts
    async clear(input = { scope: 'all' }) {
      const scope = input.scope ?? 'all';
      if (scope === 'all') {
        const stats = await this.getStats();
        await fs.rm(cacheRoot, { recursive: true, force: true });
        return {
          clearedArtifacts: stats.artifactCount,
          clearedPinRecords: stats.pinRecordCount,
        };
      }

      if (scope === 'pin') {
        const pinId = safePinId((input as { scope: 'pin'; pinId: string }).pinId);
        const pinFile = pinCacheFilePath(pinsRoot, pinId);
        const existed = await pathExists(pinFile);
        await fs.rm(pinFile, { force: true }).catch(() => undefined);
        return { clearedArtifacts: 0, clearedPinRecords: existed ? 1 : 0 };
      }

      if (scope !== 'artifact') {
        throw new Error('Unsupported MetaApp artifact cache clear scope.');
      }

      const cacheKey = safeCacheKey((input as { scope: 'artifact'; cacheKey: string }).cacheKey);
      const pinRecordFiles = await listPinRecordFiles(pinsRoot);
      let clearedPinRecords = 0;
      for (const file of pinRecordFiles) {
        if (cacheKeyFromPinRecord(await readJsonFile(file)) === cacheKey) {
          await fs.rm(file, { force: true });
          clearedPinRecords += 1;
        }
      }

      const artifactRoot = path.join(artifactsRoot, cacheKey);
      const hadArtifact = await pathExists(artifactRoot);
      await fs.rm(artifactRoot, { recursive: true, force: true });
      return {
        clearedArtifacts: hadArtifact ? 1 : 0,
        clearedPinRecords,
      };
    },
```

This is intentionally different from OAC: `scope: 'pin'` removes the pin record only; extracted
artifact files are removed by `scope: 'artifact'` or `scope: 'all'`.

- [ ] **Step 7: Add artifact cache tests**

Create `tests/host-standalone/metaAppArtifactCache.test.mjs` with this complete content:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
```

- [ ] **Step 8: Run artifact cache tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-standalone/metaAppArtifactCache.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/host-standalone/src/metaapp/artifactCache.ts tests/host-standalone/metaAppArtifactCache.test.mjs
git commit -m "feat: add standalone metaapp artifact cache"
```

Post a Bob Buzz journal describing the standalone cache root, deterministic artifact keys, pin
records, and invalid replacement protection.

## Task 4: Wire ZIP Preview Into The Standalone Adapter

**Files:**

- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `tests/browser/browserStandaloneServer.test.mjs`

- [ ] **Step 1: Import artifact cache helpers in the adapter**

In `packages/host-standalone/src/adapter.ts`, add:

```ts
import {
  createStandaloneMetaAppArtifactCacheStore,
  normalizeMetaAppModifyHistory,
  resolveStandaloneMetaAppCacheRoot,
  type MetaAppArtifactCacheEntry,
} from './metaapp/artifactCache.js';
```

- [ ] **Step 2: Extend adapter input with cache override**

Change `CreateStandaloneBrowserHostAdapterInput` to:

```ts
export interface CreateStandaloneBrowserHostAdapterInput {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  cacheRoot?: string;
}
```

- [ ] **Step 3: Add preview session source metadata**

Replace the current `PreviewSession` interface with:

```ts
interface PreviewSession {
  artifactDir: string;
  indexFile: string;
  createdAt: number;
  source: 'file' | 'cache';
  cacheKey?: string;
}
```

- [ ] **Step 4: Add ZIP and content URL helpers above `createStandaloneBrowserHostAdapter`**

Add this code near the existing helper functions:

```ts
const ZIP_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
]);

function isZipMetaAppContent(contentType: string, contentReference: string): boolean {
  const normalizedType = normalizeText(contentType).toLowerCase();
  const normalizedReference = normalizeText(contentReference).toLowerCase().split(/[?#]/, 1)[0];
  return ZIP_CONTENT_TYPES.has(normalizedType)
    || normalizedType.endsWith('/zip')
    || normalizedType.endsWith('+zip')
    || normalizedReference.endsWith('.zip')
    || /^metafile:\/\/.+\.zip$/iu.test(contentReference);
}

function resolveMetaAppContentUrl(contentReference: string, metafileContentBaseUrl: string): string | null {
  const reference = normalizeText(contentReference);
  if (/^https:\/\//iu.test(reference)) {
    return reference;
  }
  if (!/^metafile:\/\//iu.test(reference)) {
    return null;
  }
  const pinId = reference.slice('metafile://'.length).split(/[?#]/, 1)[0]?.replace(/\.[A-Za-z0-9]+$/u, '') ?? '';
  if (!pinId || pinId.includes('/') || pinId.includes('\\')) {
    return null;
  }
  return `${metafileContentBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(pinId)}`;
}

async function downloadMetaAppZipArchive(input: {
  fetch: typeof fetch;
  contentReference: string;
  metafileContentBaseUrl: string;
}): Promise<Buffer> {
  const contentUrl = resolveMetaAppContentUrl(input.contentReference, input.metafileContentBaseUrl);
  if (!contentUrl) {
    throw new Error('MetaApp ZIP content reference is not downloadable.');
  }
  const response = await input.fetch(contentUrl);
  if (!response.ok || !response.arrayBuffer) {
    throw new Error(`MetaApp ZIP download failed with HTTP ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}
```

This intentionally allows `https://` and `metafile://` references only. Keep `http://` disabled for
remote ZIP downloads in Phase 1.

- [ ] **Step 5: Initialize artifact cache inside the adapter factory**

Inside `createStandaloneBrowserHostAdapter`, after `previewSessions`, add:

```ts
  const artifactCache = createStandaloneMetaAppArtifactCacheStore({
    cacheRoot: input.cacheRoot ?? resolveStandaloneMetaAppCacheRoot({ env }),
    env,
    now,
  });
```

- [ ] **Step 6: Add preview session registration helper**

Inside `createStandaloneBrowserHostAdapter`, before `resolveResourceWithFetch`, add:

```ts
  function createPreviewSessionForArtifact(input: {
    artifactDir: string;
    indexFile: string;
    source: 'file' | 'cache';
    cacheKey?: string;
  }): { previewId: string; localPreviewUrl: string } {
    previewCounter += 1;
    const previewId = `standalone-${now().toString(36)}-${previewCounter.toString(36)}`;
    previewSessions.set(previewId, {
      artifactDir: input.artifactDir,
      indexFile: input.indexFile,
      createdAt: now(),
      source: input.source,
      ...(input.cacheKey ? { cacheKey: input.cacheKey } : {}),
    });
    return {
      previewId,
      localPreviewUrl: `/api/browser/preview-assets/${encodeURIComponent(previewId)}/${encodeAssetPath(input.indexFile)}`,
    };
  }
```

- [ ] **Step 7: Add ZIP artifact resolution helper inside the adapter factory**

Inside `createStandaloneBrowserHostAdapter`, before `resolveResourceWithFetch`, add:

```ts
  async function resolveZipPreviewArtifact(input: {
    pinId: string;
    contentReference: string;
    contentType: string;
    indexFile: string;
    protocol: Record<string, unknown>;
    pinRecord: Record<string, unknown>;
    metafileContentBaseUrl: string;
    resolveFetch: typeof fetch;
  }): Promise<MetaAppArtifactCacheEntry> {
    const descriptor = {
      metaAppPinId: input.pinId,
      contentReference: input.contentReference,
      contentType: input.contentType,
      indexFile: input.indexFile,
      modifyHistory: normalizeMetaAppModifyHistory(input.pinRecord.modify_history ?? input.pinRecord.modifyHistory),
    };
    const cached = await artifactCache.getArtifact(descriptor);
    if (cached) {
      return cached;
    }
    const archive = await downloadMetaAppZipArchive({
      fetch: input.resolveFetch,
      contentReference: input.contentReference,
      metafileContentBaseUrl: input.metafileContentBaseUrl,
    });
    return artifactCache.writeArtifact({ ...descriptor, archive });
  }
```

- [ ] **Step 8: Replace `createPreviewSession` in `resolveMetaAppPinToRecord`**

Replace the existing inline `createPreviewSession` body with:

```ts
        createPreviewSession: async ({ pinId, contentReference, contentType, indexFile, protocol, pinRecord }) => {
          if (contentReference.startsWith('file://')) {
            const artifactDir = path.resolve(new URL(contentReference).pathname);
            return createPreviewSessionForArtifact({
              artifactDir,
              indexFile,
              source: 'file',
            });
          }
          if (!isZipMetaAppContent(contentType, contentReference)) {
            return { localPreviewUrl: '' };
          }
          const artifact = await resolveZipPreviewArtifact({
            pinId,
            contentReference,
            contentType,
            indexFile,
            protocol,
            pinRecord,
            metafileContentBaseUrl: browserConfig.metafileContentBaseUrl,
            resolveFetch,
          });
          return createPreviewSessionForArtifact({
            artifactDir: artifact.artifactDir,
            indexFile: artifact.indexFile,
            source: 'cache',
            cacheKey: artifact.cacheKey,
          });
        },
```

- [ ] **Step 9: Update cache reporting**

Replace `getCache` with:

```ts
  async function getCache(cacheInput: BrowserCacheInput = {}): Promise<BrowserCommandResult<BrowserCacheSnapshot>> {
    const actorFailure = resolveActor(cacheInput);
    if (actorFailure) return actorFailure;
    const stats = await artifactCache.getStats();
    const filePreviewSessionCount = Array.from(previewSessions.values()).filter((session) => session.source === 'file').length;
    return browserSuccess({
      cacheRoot: stats.cacheRoot,
      artifactsRoot: stats.artifactsRoot,
      pinsRoot: stats.pinsRoot,
      artifactCount: stats.artifactCount + filePreviewSessionCount,
      pinRecordCount: stats.pinRecordCount,
      totalBytes: stats.totalBytes,
      activePreviewSessionCount: previewSessions.size,
      ...(cacheClearedAt ? { lastClearedAt: cacheClearedAt } : {}),
    });
  }
```

- [ ] **Step 10: Update cache clearing**

Replace `clearCache` with:

```ts
  async function clearCache(cacheInput: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>> {
    const actorFailure = resolveActor(cacheInput);
    if (actorFailure) return actorFailure;
    const scope = normalizeText(cacheInput.scope) || (cacheInput.all ? 'all' : 'all');
    if (scope !== 'all' && scope !== 'pin' && scope !== 'artifact') {
      return browserFailure('invalid_argument', 'Unsupported Browser cache clear scope.');
    }

    try {
      let clearedArtifacts = 0;
      let clearedPinRecords = 0;
      if (scope === 'all') {
        const activeArtifacts = previewSessions.size;
        previewSessions.clear();
        const cleared = await artifactCache.clear({ scope: 'all' });
        clearedArtifacts = Math.max(activeArtifacts, cleared.clearedArtifacts);
        clearedPinRecords = cleared.clearedPinRecords;
      } else if (scope === 'pin') {
        const pinId = normalizeText(cacheInput.pinId);
        const cleared = pinId ? await artifactCache.clear({ scope: 'pin', pinId }) : { clearedArtifacts: 0, clearedPinRecords: 0 };
        clearedArtifacts = cleared.clearedArtifacts;
        clearedPinRecords = cleared.clearedPinRecords;
      } else {
        const cacheKey = normalizeText(cacheInput.cacheKey);
        if (cacheKey) {
          const cleared = await artifactCache.clear({ scope: 'artifact', cacheKey });
          clearedArtifacts = cleared.clearedArtifacts;
          clearedPinRecords = cleared.clearedPinRecords;
          for (const [previewId, session] of previewSessions) {
            if (session.cacheKey === cacheKey) previewSessions.delete(previewId);
          }
        } else {
          const stats = await artifactCache.getStats();
          const activeArtifacts = previewSessions.size;
          previewSessions.clear();
          const cleared = await artifactCache.clear({ scope: 'all' });
          clearedArtifacts = Math.max(activeArtifacts, cleared.clearedArtifacts, stats.artifactCount);
          clearedPinRecords = cleared.clearedPinRecords;
        }
      }
      cacheClearedAt = now();
      return browserSuccess({
        clearedArtifacts,
        clearedPinRecords,
        scope,
        cacheRoot: artifactCache.cacheRoot,
        lastClearedAt: cacheClearedAt,
      });
    } catch (error) {
      return browserFailure('invalid_argument', error instanceof Error ? error.message : String(error));
    }
  }
```

- [ ] **Step 11: Extend content type mapping for common MetaApp assets**

In `contentTypeForPath`, add these cases before the fallback:

```ts
  if (extension === '.wasm') return 'application/wasm';
  if (extension === '.ico') return 'image/x-icon';
  if (extension === '.map') return 'application/json; charset=utf-8';
  if (extension === '.txt') return 'text/plain; charset=utf-8';
```

- [ ] **Step 12: Run the failing standalone ZIP test again**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/browserStandaloneServer.test.mjs
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/host-standalone/src/adapter.ts tests/browser/browserStandaloneServer.test.mjs
git commit -m "feat: render zip metaapps in standalone host"
```

Post a Bob Buzz journal describing ZIP download, cache hits, preview sessions, and cache API updates.

## Task 5: Package New Host Files And Guard Boundaries

**Files:**

- Modify: `packages/host-standalone/package.json`
- Modify: `tests/release/hostNeutralGuardrails.test.mjs`
- Modify: `tests/package/packContents.test.mjs`

- [ ] **Step 1: Add new dist files to the standalone package manifest**

In `packages/host-standalone/package.json`, add these entries to `files`:

```json
"dist/metaapp/artifactCache.d.ts",
"dist/metaapp/artifactCache.d.ts.map",
"dist/metaapp/artifactCache.js",
"dist/metaapp/artifactCache.js.map",
"dist/metaapp/zipArchive.d.ts",
"dist/metaapp/zipArchive.d.ts.map",
"dist/metaapp/zipArchive.js",
"dist/metaapp/zipArchive.js.map",
"dist-cjs/metaapp/artifactCache.js",
"dist-cjs/metaapp/artifactCache.js.map",
"dist-cjs/metaapp/zipArchive.js",
"dist-cjs/metaapp/zipArchive.js.map"
```

Keep existing file entries unchanged.

- [ ] **Step 2: Extend package content tests**

In `tests/package/packContents.test.mjs`, inside the `if (workspace.name === '@openagentinternet/agent-browser-host-standalone')` block, add:

```js
      assertPackIncludes(files, 'dist/metaapp/artifactCache.js', workspace.name);
      assertPackIncludes(files, 'dist/metaapp/zipArchive.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/metaapp/artifactCache.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/metaapp/zipArchive.js', workspace.name);
```

- [ ] **Step 3: Strengthen host-neutral guardrails**

In `tests/release/hostNeutralGuardrails.test.mjs`, keep the existing forbidden list and add package
import graph checks below the current test:

```js
test('core and ui do not import standalone host packages', async () => {
  const { stdout } = await execFileAsync('git', ['ls-files', 'packages/core/src', 'packages/ui/src']);
  const sourceFiles = stdout.split('\n').filter((file) => file.endsWith('.ts'));
  const violations = [];

  for (const filePath of sourceFiles) {
    const contents = await readFile(path.join(repoRoot, filePath), 'utf8');
    if (contents.includes('agent-browser-host-standalone') || contents.includes('host-standalone')) {
      violations.push(`${filePath} imports standalone host code`);
    }
  }

  assert.deepEqual(violations, []);
});
```

- [ ] **Step 4: Run package and guardrail tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/package/packContents.test.mjs tests/release/hostNeutralGuardrails.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/host-standalone/package.json tests/package/packContents.test.mjs tests/release/hostNeutralGuardrails.test.mjs
git commit -m "test: guard standalone zip preview package boundaries"
```

Post a Bob Buzz journal describing package publication coverage and core/UI boundary guardrails.

## Task 6: Verify End-To-End Standalone Behavior

**Files:**

- Modify: `docs/acceptance/browser-parity-standalone.md`

- [ ] **Step 1: Run the targeted test suite**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-standalone/metaAppZipArchive.test.mjs tests/host-standalone/metaAppArtifactCache.test.mjs tests/browser/browserStandaloneServer.test.mjs tests/package/packContents.test.mjs tests/release/hostNeutralGuardrails.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

Expected: PASS.

- [ ] **Step 3: Start standalone locally with an isolated cache**

Run:

```bash
CACHE_DIR="$(mktemp -d /tmp/abc-metaapp-cache.XXXXXX)"
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" AGENT_BROWSER_CACHE_DIR="$CACHE_DIR" npm run dev:standalone
```

Expected terminal output:

```text
Agent Internet Browser listening at http://127.0.0.1:8787/browser
```

Keep this server running for the next steps.

- [ ] **Step 4: Verify the known ZIP MetaApp resolves to an iframe renderer**

In another terminal, run:

```bash
curl -fsS 'http://127.0.0.1:8787/api/browser/resolve?uri=metaapp%3A%2F%2F6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0' \
  | jq '{ok,state:.state,resourceType:.data.resourceType,rendererType:.data.renderer.type,rendererContentType:.data.renderer.contentType,rendererUrl:.data.renderer.url,recordContentType:.data.renderer.data.record.contentType,codeType:.data.renderer.data.record.codeType,error:.data.renderer.error}'
```

Expected shape:

```json
{
  "ok": true,
  "state": "success",
  "resourceType": "metaapp",
  "rendererType": "html-iframe",
  "rendererContentType": "text/html",
  "rendererUrl": "/api/browser/preview-assets/...",
  "recordContentType": "text/html",
  "codeType": "application/zip",
  "error": null
}
```

- [ ] **Step 5: Verify cache status**

Run:

```bash
curl -fsS 'http://127.0.0.1:8787/api/browser/cache' | jq '{ok,cacheRoot:.data.cacheRoot,artifactCount:.data.artifactCount,pinRecordCount:.data.pinRecordCount,totalBytes:.data.totalBytes}'
```

Expected: `ok` is `true`, `cacheRoot` starts with `/tmp/abc-metaapp-cache`, `artifactCount` is `1`,
`pinRecordCount` is `1`, and `totalBytes` is greater than zero. The exact byte count depends on the
downloaded package.

- [ ] **Step 6: Update acceptance notes**

Append this section to `docs/acceptance/browser-parity-standalone.md`:

```md
## Standalone ZIP MetaApp Preview

Verification date: 2026-06-15

- `metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0` resolves to `html-iframe`.
- The resolved renderer URL is served from `/api/browser/preview-assets/...`.
- The MetaApp record keeps `codeType: application/zip` while exposing `contentType: text/html` for rendering.
- `GET /api/browser/cache` reports the configured standalone cache root, one artifact, and one pin record after resolution.
```

- [ ] **Step 7: Stop the local standalone server**

Press `Ctrl-C` in the server terminal.

- [ ] **Step 8: Run docs check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 9: Commit**

```bash
git add docs/acceptance/browser-parity-standalone.md
git commit -m "docs: record standalone zip metaapp acceptance"
```

Post a Bob Buzz journal describing the local standalone acceptance result and the known ZIP MetaApp
URI that now renders.

## Final Verification Before Closeout

Run:

```bash
git status --short
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
git diff --check
```

Expected:

- `git status --short` shows a clean working tree after the final commit.
- `npm run verify` passes.
- `npm run verify:packages` passes.
- `git diff --check` exits with code `0`.

## Phase 2 Handoff Notes

After Phase 1 lands, write a separate plan for the production preview backend. That plan should
cover `packages/preview-backend`, object storage, metadata index selection, `metaapp-preview`
origin routing, public rate limiting, and deployment configuration for `botinternet.org`.
