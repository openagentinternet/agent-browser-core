# preview-metaapp:// Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `preview-metaapp://{host}/{path}` Browser URI scheme that previews a local file/directory (host `localhost`) via the existing preview-asset pipeline, or any remote HTTP origin (other hosts), reusing all existing renderers with zero UI changes.

**Architecture:** Core registers the new scheme + parser, then dispatches a new resolver with two branches: the `localhost` branch delegates to a host-injected `previewMetaAppLocalResolve` factory (core stays FS-free); the remote branch builds `https://{host}{path}` directly. host-standalone implements the factory by reusing `createPreviewSessionForArtifact` + the existing `/api/browser/preview-assets/` route.

**Tech Stack:** TypeScript workspace (npm workspaces), `node --test` with `.test.mjs` files in top-level `tests/`, built `dist/` consumed by tests.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-07-24-preview-metaapp-protocol-design.md`) and AGENTS.md:

- **Core must stay host-neutral — no filesystem access, no network requests in `packages/core`.** All FS work lives in `packages/host-standalone`.
- **Test convention:** tests are `.test.mjs` files under top-level `tests/`, importing from built `../../packages/<pkg>/dist/index.js` (or deep `dist/...js` paths). Runner: `npm test` = `npm run build && node --test tests/**/*.test.mjs`.
- **Local-FS branch triggers only when `host === 'localhost'` literally** (using `url.host`, which includes any port, so `localhost:3000` never matches → goes remote).
- **Remote scheme is always `https`** in v1; no `http` option.
- **Core does not pre-fetch remote URLs** — it only constructs the renderer URL; the iframe does the fetch.
- **Local-path safety:** unrestricted absolute paths (explicit, user-approved). No allow-list. Document the local-dev-only constraint in code comments + docs.
- **Kill-switch env var:** `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP=1` → `enablePreviewMetaApp = false`.
- **Commit messages** use `<type>: <short description>` (`feat`/`fix`/`refactor`/`docs`/`chore`).
- **After each commit**, post a development-journal buzz via the `metabot-post-buzz` skill with the Bob identity (slug `bob`).

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/uri/browserUri.ts` (modify) | Register `'preview-metaapp'` in scheme union + `SUPPORTED_SCHEMES` + parser branch |
| `packages/core/src/browser/types.ts` (modify) | Mirror union; add `ParsedPreviewMetaAppUri`, `PreviewMetaAppLocalResolve`, `PreviewMetaAppLocalResolveResult`; add `enablePreviewMetaApp?` to `BrowserBaseConfig` |
| `packages/core/src/browser/previewMetaAppUri.ts` (create) | Pure URI parser → `ParsedPreviewMetaAppUri` |
| `packages/core/src/browser/previewMetaAppResolver.ts` (create) | Resolver: local branch (delegates to host factory) + remote branch (builds https URL); owns renderer-type selection |
| `packages/core/src/browser/browserResolver.ts` (modify) | Add `preview-metaapp` dispatch branch; add `previewMetaAppLocalResolve?` to `ResolveBrowserResourceInput` |
| `packages/core/src/browser/config.ts` (modify) | Default `enablePreviewMetaApp: true`; read `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP` env |
| `packages/core/src/index.ts` (modify) | Export new parser, resolver, types |
| `packages/host-standalone/src/adapter.ts` (modify) | Implement `previewMetaAppLocalResolve` factory; widen `PreviewSession.source` to `'cache' \| 'local'` |
| `tests/core/previewMetaAppUri.test.mjs` (create) | Parser unit tests |
| `tests/browser/previewMetaAppResolver.test.mjs` (create) | Resolver branch tests |
| `tests/host-standalone/previewMetaAppLocal.test.mjs` (create) | Local FS factory + HTTP serving tests |
| `tests/core/uri.test.mjs` (modify) | Add scheme-acceptance cases |
| `docs/superpowers/specs/...` | (exists) |
| `docs/preview-metaapp-protocol.md` (create) | User docs + security note |

---

### Task 1: Register scheme + core types + config

This task lays the foundation: the scheme name becomes valid, the new typed interfaces exist, and the config kill-switch works. Nothing dispatches yet (resolver comes in Task 3), so `preview-metaapp://` will parse but fall through to the `metaapp` resolver and fail predictably — that's fine; Task 1's tests only cover parsing + config.

**Files:**
- Modify: `packages/core/src/uri/browserUri.ts:4,13`
- Modify: `packages/core/src/browser/types.ts:3,21`
- Modify: `packages/core/src/browser/config.ts:39-57,59-106`
- Test: `tests/core/uri.test.mjs`

**Interfaces:**
- Produces: `BrowserUriScheme` now includes `'preview-metaapp'`; `BrowserBaseConfig.enablePreviewMetaApp?: boolean`; `ParsedPreviewMetaAppUri`, `PreviewMetaAppLocalResolve`, `PreviewMetaAppLocalResolveResult` exported from `types.ts`.

- [ ] **Step 1: Write the failing tests in `tests/core/uri.test.mjs`**

Append to the existing file (after the last `test(...)`):

```js
test('parseBrowserUri accepts the preview-metaapp scheme', () => {
  const parsed = core.parseBrowserUri('preview-metaapp://localhost/Users/tusm/app/index.html');
  assert.equal(parsed.scheme, 'preview-metaapp');
  assert.equal(parsed.normalizedUri, 'preview-metaapp://localhost/Users/tusm/app/index.html');
  assert.equal(parsed.id, '/Users/tusm/app/index.html');
});

test('parseBrowserUri lowercases the preview-metaapp scheme', () => {
  const parsed = core.parseBrowserUri('PREVIEW-METAAPP://localhost/x');
  assert.equal(parsed.scheme, 'preview-metaapp');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/core/uri.test.mjs`
Expected: FAIL — "Unsupported URI scheme: preview-metaapp" (scheme not yet registered).

- [ ] **Step 3: Register the scheme in `packages/core/src/uri/browserUri.ts`**

Change line 4:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp' | 'metafile' | 'map' | 'pin' | 'preview-metaapp';
```

Change line 13:

```ts
const SUPPORTED_SCHEMES = new Set<BrowserUriScheme>(['metaid', 'metaapp', 'metafile', 'map', 'pin', 'preview-metaapp']);
```

No parser branch yet — the generic fallthrough at lines 209-214 (`normalizedUri = ${scheme}://${id}`) already handles the scheme for now and makes Step 1's tests pass. The dedicated parser is added in Task 2.

- [ ] **Step 4: Mirror the union in `packages/core/src/browser/types.ts`**

Change line 3:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp' | 'metafile' | 'map' | 'pin' | 'preview-metaapp';
```

- [ ] **Step 5: Add the new interfaces to `packages/core/src/browser/types.ts`**

Add immediately after the `ParsedPinUri` interface (after line 190):

```ts
export interface ParsedPreviewMetaAppUri {
  originalUri: string;
  normalizedUri: string;
  scheme: 'preview-metaapp';
  host: string;
  path: string;
}

export interface PreviewMetaAppLocalResolveResult {
  localPreviewUrl: string;
  previewId?: string;
  contentType?: string;
}

export type PreviewMetaAppLocalResolve = (input: {
  path: string;
}) => Promise<PreviewMetaAppLocalResolveResult> | PreviewMetaAppLocalResolveResult;
```

Add `enablePreviewMetaApp?: boolean;` as the last field of `BrowserBaseConfig` (after `localMode: boolean;` at line 28):

```ts
export interface BrowserBaseConfig {
  metasoP2PBaseUrl: string;
  metafileContentBaseUrl: string;
  manApiBaseUrl: string;
  botHomepageTemplateId: BotHomepageTemplateId;
  renderCustomBotPages: boolean;
  nameResolution: BrowserNameResolutionConfig;
  localMode: boolean;
  enablePreviewMetaApp?: boolean;
}
```

- [ ] **Step 6: Add the config default + env override in `packages/core/src/browser/config.ts`**

In `createDefaultBrowserConfig()` (line 39), add the field to the returned object (after `localMode: false,`):

```ts
    localMode: false,
    enablePreviewMetaApp: true,
  };
```

In `resolveBrowserConfig()` return object (line 81-105), add after the `localMode` line (line 104):

```ts
    localMode: typeof browser.localMode === 'boolean' ? browser.localMode : defaults.localMode,
    enablePreviewMetaApp: normalizeBoolean(env.METABOT_BROWSER_DISABLE_PREVIEW_METAAPP) === true
      ? false
      : (typeof browser.enablePreviewMetaApp === 'boolean' ? browser.enablePreviewMetaApp : defaults.enablePreviewMetaApp),
  };
```

(`normalizeBoolean` already exists at config.ts:18; returns `true`/`false`/`null`. `=== true` means the env was explicitly set truthy → disable. This keeps the field absent from `BrowserBaseConfigInput` — it's host/env-only, not a Settings field, matching the spec's "no Settings UI in v1".)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run build && node --test tests/core/uri.test.mjs`
Expected: PASS (all existing + 2 new).

- [ ] **Step 8: Run full suite to confirm no regressions**

Run: `npm test`
Expected: 397 pass, 0 fail (395 baseline + 2 new).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/uri/browserUri.ts packages/core/src/browser/types.ts packages/core/src/browser/config.ts tests/core/uri.test.mjs
git commit -m "feat: register preview-metaapp scheme with types and config kill-switch"
```

Then post a buzz via the `metabot-post-buzz` skill (Bob identity) summarizing this commit.

---

### Task 2: URI parser module

Create the dedicated parser that splits host + path. This replaces the generic fallthrough for this scheme so `host`/`path` are structured.

**Files:**
- Create: `packages/core/src/browser/previewMetaAppUri.ts`
- Modify: `packages/core/src/uri/browserUri.ts:189-207` (add parser branch) and line 1-2 (import)
- Modify: `packages/core/src/index.ts` (export)
- Test: `tests/core/previewMetaAppUri.test.mjs` (create)
- Test: `tests/core/uri.test.mjs` (update id expectation)

**Interfaces:**
- Consumes: `ParsedPreviewMetaAppUri` from Task 1.
- Produces: `export function parsePreviewMetaAppUri(input: string): ParsedPreviewMetaAppUri`.

- [ ] **Step 1: Write the failing tests in `tests/core/previewMetaAppUri.test.mjs`**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('parsePreviewMetaAppUri splits localhost file path into host and path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/tusm/app/index.html');
  assert.deepEqual(parsed, {
    originalUri: 'preview-metaapp://localhost/Users/tusm/app/index.html',
    normalizedUri: 'preview-metaapp://localhost/Users/tusm/app/index.html',
    scheme: 'preview-metaapp',
    host: 'localhost',
    path: '/Users/tusm/app/index.html',
  });
});

test('parsePreviewMetaAppUri keeps a directory path with trailing slash', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/tusm/app/');
  assert.equal(parsed.host, 'localhost');
  assert.equal(parsed.path, '/Users/tusm/app/');
});

test('parsePreviewMetaAppUri treats localhost:3000 as a remote host (port retained)', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost:3000/app/index.html');
  assert.equal(parsed.host, 'localhost:3000');
  assert.equal(parsed.path, '/app/index.html');
});

test('parsePreviewMetaAppUri accepts a remote host', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://example.com/path/to/index.html');
  assert.equal(parsed.host, 'example.com');
  assert.equal(parsed.path, '/path/to/index.html');
});

test('parsePreviewMetaAppUri percent-decodes the path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/me/my%20project/index.html');
  assert.equal(parsed.path, '/Users/me/my project/index.html');
});

test('parsePreviewMetaAppUri collapses consecutive slashes in the path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users//tusm/app/index.html');
  assert.equal(parsed.path, '/Users/tusm/app/index.html');
});

test('parsePreviewMetaAppUri rejects empty host', () => {
  assert.throws(() => core.parsePreviewMetaAppUri('preview-metaapp:///Users/tusm/app/index.html'), /host|URI/i);
});

test('parsePreviewMetaAppUri rejects a non-absolute path', () => {
  assert.throws(() => core.parsePreviewMetaAppUri('preview-metaapp://localhostrelative.html'), /path|URI/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/core/previewMetaAppUri.test.mjs`
Expected: FAIL — `core.parsePreviewMetaAppUri is not a function`.

- [ ] **Step 3: Create `packages/core/src/browser/previewMetaAppUri.ts`**

```ts
import type { ParsedPreviewMetaAppUri } from './types.js';
export type { ParsedPreviewMetaAppUri } from './types.js';

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function collapseSlashes(value: string): string {
  return value.replace(/\/\/+/g, '/');
}

export function parsePreviewMetaAppUri(input: string): ParsedPreviewMetaAppUri {
  const originalUri = cleanText(input);
  let url: URL;
  try {
    url = new URL(originalUri);
  } catch {
    throw new Error('Enter a complete preview-metaapp URI such as preview-metaapp://localhost/path/to/index.html.');
  }
  if (url.protocol !== 'preview-metaapp:') {
    throw new Error('Preview-MetaApp parser requires a preview-metaapp:// URI.');
  }
  // Reject userinfo — meaningless for this scheme and a source of confusion.
  if (url.username || url.password) {
    throw new Error('Unsupported preview-metaapp URI userinfo.');
  }

  const host = url.host; // includes port when present, so localhost:3000 never equals 'localhost'
  if (!host) {
    throw new Error('preview-metaapp URI requires a host.');
  }

  // url.pathname is percent-decoded by URL already. Collapse stray duplicate slashes only.
  const normalizedPath = collapseSlashes(url.pathname);
  if (!normalizedPath.startsWith('/')) {
    throw new Error('preview-metaapp URI path must be absolute.');
  }

  const normalizedUri = `preview-metaapp://${host}${normalizedPath}`;
  return {
    originalUri,
    normalizedUri,
    scheme: 'preview-metaapp',
    host,
    path: normalizedPath,
  };
}
```

- [ ] **Step 4: Add the parser branch in `packages/core/src/uri/browserUri.ts`**

Add the import at the top (after line 2):

```ts
import { parsePreviewMetaAppUri } from '../browser/previewMetaAppUri.js';
```

Add a branch after the `pin` block (after line 207, before the generic `return` at 209):

```ts
  if (scheme === 'preview-metaapp') {
    const parsed = parsePreviewMetaAppUri(originalUri);
    return {
      originalUri,
      normalizedUri: parsed.normalizedUri,
      scheme,
      id: parsed.path,
    };
  }
```

- [ ] **Step 5: Export the parser from `packages/core/src/index.ts`**

Add after the `parsePinUri` export (line 21):

```ts
export { parsePreviewMetaAppUri, type ParsedPreviewMetaAppUri } from './browser/previewMetaAppUri.js';
```

- [ ] **Step 6: Update the id expectation in `tests/core/uri.test.mjs`**

The Task 1 test asserted `parsed.id === '/Users/tusm/app/index.html'` — this remains correct because the new branch sets `id: parsed.path`. No change needed; re-run to confirm.

Run: `npm run build && node --test tests/core/uri.test.mjs tests/core/previewMetaAppUri.test.mjs`
Expected: PASS (both files).

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/browser/previewMetaAppUri.ts packages/core/src/uri/browserUri.ts packages/core/src/index.ts tests/core/previewMetaAppUri.test.mjs
git commit -m "feat: add preview-metaapp URI parser"
```

Post a buzz (Bob identity).

---

### Task 3: Resolver module

Create the resolver with both branches and its own renderer-type selector. It is not yet wired into dispatch (Task 4 does that), so tests call it directly.

**Files:**
- Create: `packages/core/src/browser/previewMetaAppResolver.ts`
- Test: `tests/browser/previewMetaAppResolver.test.mjs` (create)

**Interfaces:**
- Consumes: `ParsedPreviewMetaAppUri`, `PreviewMetaAppLocalResolve`, `BrowserBaseConfig`, `BotBrowserConfig`, `BrowserResolveResult`, `BrowserCommandResult`, `browserCommandSuccess`, `browserCommandFailed` (all from core).
- Produces: `export function resolvePreviewMetaAppResource(input: {...}): Promise<BrowserCommandResult<BrowserResolveResult>>`. Task 4 wires this into `resolveBrowserResource`.

- [ ] **Step 1: Write the failing tests in `tests/browser/previewMetaAppResolver.test.mjs`**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/browser/previewMetaAppResolver.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/core/src/browser/previewMetaAppResolver.ts`**

```ts
import {
  browserCommandFailed,
  browserCommandSuccess,
  type BrowserCommandResult,
  type BrowserResolveResult,
  type BotBrowserConfig,
  type ParsedPreviewMetaAppUri,
  type PreviewMetaAppLocalResolve,
} from './types.js';

function hasExtension(url: string | undefined, extensions: string[]): boolean {
  if (!url) {
    return false;
  }
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  return extensions.some((extension) => pathname.endsWith(extension));
}

// preview-metaapp:// is a local-dev/remote preview: it has no on-chain owner or proof.
// Renderer selection mirrors metaAppResolver.ts:selectRendererType but is independent because
// that helper is private and typed to MetaAppGalleryRecord, which previews do not have.
function selectPreviewRendererType(contentType: string, url: string | undefined): BrowserResolveResult['renderer']['type'] {
  const ct = contentType.toLowerCase();
  if (ct === 'application/pdf' || hasExtension(url, ['.pdf'])) return 'pdf';
  if (ct.startsWith('image/') || hasExtension(url, ['.apng', '.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp'])) return 'image';
  if (ct.startsWith('video/') || hasExtension(url, ['.mp4', '.m4v', '.mov', '.ogg', '.ogv', '.webm'])) return 'video';
  if (ct.startsWith('audio/') || hasExtension(url, ['.mp3', '.wav', '.oga', '.opus'])) return 'audio';
  if (ct === 'text/html' || ct === 'application/xhtml+xml' || hasExtension(url, ['.html', '.htm'])) return 'html-iframe';
  return 'unsupported';
}

function buildResolveResult(input: {
  parsed: ParsedPreviewMetaAppUri;
  rendererUrl: string | undefined;
  contentType: string;
}): BrowserCommandResult<BrowserResolveResult> {
  const rendererType = selectPreviewRendererType(input.contentType, input.rendererUrl);
  const unsupported = rendererType === 'unsupported';
  return browserCommandSuccess({
    uri: input.parsed.originalUri,
    normalizedUri: input.parsed.normalizedUri,
    resourceType: 'metaapp',
    title: 'Local Preview',
    owner: {
      kind: 'unknown',
      globalMetaId: '',
      name: 'Local Preview',
      verificationState: 'unverified',
    },
    renderer: {
      type: rendererType,
      contentType: input.contentType || 'application/octet-stream',
      ...(input.rendererUrl ? { url: input.rendererUrl } : {}),
      ...(unsupported ? { error: 'Unsupported preview content type.' } : {}),
    },
    status: {
      state: unsupported ? 'error' : 'resolved',
      verificationState: 'unverified',
      message: unsupported ? 'Unsupported preview content type.' : 'Preview resolved.',
    },
    source: {
      resolver: 'preview-metaapp',
      ...(input.rendererUrl ? { url: input.rendererUrl } : {}),
      fetchedAt: Date.now(),
    },
    actions: [
      { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: input.parsed.normalizedUri },
    ],
  });
}

export async function resolvePreviewMetaAppResource(input: {
  parsed: ParsedPreviewMetaAppUri;
  config: BotBrowserConfig;
  previewMetaAppLocalResolve?: PreviewMetaAppLocalResolve;
}): Promise<BrowserCommandResult<BrowserResolveResult>> {
  if (input.config.enablePreviewMetaApp === false) {
    return browserCommandFailed('browser_resource_disabled', 'preview-metaapp is disabled.');
  }

  const isLocal = input.parsed.host === 'localhost';

  if (isLocal) {
    if (!input.previewMetaAppLocalResolve) {
      return browserCommandFailed('browser_resource_unsupported', 'Local preview is not supported by this host.');
    }
    let resolved;
    try {
      resolved = await input.previewMetaAppLocalResolve({ path: input.parsed.path });
    } catch (error) {
      return browserCommandFailed(
        'browser_resolve_failed',
        error instanceof Error ? error.message : String(error),
      );
    }
    return buildResolveResult({
      parsed: input.parsed,
      rendererUrl: resolved.localPreviewUrl,
      contentType: resolved.contentType ?? 'text/html',
    });
  }

  // Remote branch: direct HTTPS connection. Core does not probe reachability (D6).
  const rendererUrl = `https://${input.parsed.host}${input.parsed.path}`;
  return buildResolveResult({
    parsed: input.parsed,
    rendererUrl,
    contentType: '',
  });
}
```

Note: `BotBrowserConfig` is imported from `./types.js`. Verify it is exported there (it is, at types.ts:47). `browserCommandFailed`/`browserCommandSuccess` are exported from types.ts (lines 242-252).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test tests/browser/previewMetaAppResolver.test.mjs`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/browser/previewMetaAppResolver.ts tests/browser/previewMetaAppResolver.test.mjs
git commit -m "feat: add preview-metaapp resolver with local and remote branches"
```

Post a buzz (Bob identity).

---

### Task 4: Wire resolver into dispatch + input field + exports

Connect the resolver so `resolveBrowserResource('preview-metaapp://...')` actually routes to it.

**Files:**
- Modify: `packages/core/src/browser/browserResolver.ts:25-34` (input interface), `:442-453` (dispatch branch)
- Modify: `packages/core/src/index.ts` (export resolver)
- Test: `tests/browser/browserResolver.test.mjs` (add end-to-end dispatch test)

**Interfaces:**
- Consumes: `resolvePreviewMetaAppResource` from Task 3, `PreviewMetaAppLocalResolve` from Task 1.
- Produces: `ResolveBrowserResourceInput.previewMetaAppLocalResolve?` field; the dispatch branch.

- [ ] **Step 1: Read the dispatch test file to mirror its style**

Run: `head -60 tests/browser/browserResolver.test.mjs` — note how it imports `resolveBrowserResource` and builds a `BotBrowserConfig`. Mirror the `baseConfig` helper and config shape used there.

- [ ] **Step 2: Write the failing dispatch test**

Append to `tests/browser/browserResolver.test.mjs` (adjust the config helper name to match the file's existing convention; if it uses a function like `function makeConfig(...)`, reuse it):

```js
test('resolveBrowserResource routes preview-metaapp localhost through the injected factory', async () => {
  // Use the file's existing config helper; if named differently, substitute it.
  const result = await core.resolveBrowserResource({
    uri: 'preview-metaapp://localhost/Users/tusm/app/index.html',
    config: makeConfig({ enablePreviewMetaApp: true }),
    previewMetaAppLocalResolve: async () => ({
      localPreviewUrl: '/api/browser/preview-assets/p1/index.html',
      contentType: 'text/html',
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.renderer.url, '/api/browser/preview-assets/p1/index.html');
});

test('resolveBrowserResource routes preview-metaapp remote as direct https', async () => {
  const result = await core.resolveBrowserResource({
    uri: 'preview-metaapp://example.com/x.html',
    config: makeConfig({ enablePreviewMetaApp: true }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.url, 'https://example.com/x.html');
});
```

If the existing file does not have a `makeConfig` helper, add a minimal one at the top of your appended tests:

```js
function makeConfig(overrides = {}) {
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run build && node --test tests/browser/browserResolver.test.mjs`
Expected: FAIL — `preview-metaapp://localhost/...` currently falls through to `resolveMetaAppResource` (the metaapp fallthrough) and returns "Resource not found", so the renderer assertions fail.

- [ ] **Step 4: Add the input field in `packages/core/src/browser/browserResolver.ts`**

Add `previewMetaAppLocalResolve` to `ResolveBrowserResourceInput` (after the `mapResolve?` line at 31):

```ts
  mapResolve?: (uri: string, parsed: ParsedBrowserUri) => Promise<BrowserCommandResult<BrowserResolveResult>>;
  previewMetaAppLocalResolve?: PreviewMetaAppLocalResolve;
  nameAliasProviders?: BrowserNameAliasProvider[];
```

Add the import of the type and resolver. Near the top of the file (with the other resolver imports), add:

```ts
import { resolvePreviewMetaAppResource } from './previewMetaAppResolver.js';
```

And ensure `PreviewMetaAppLocalResolve` is imported from `./types.js` (add it to the existing `./types.js` import block at lines 14-23 in this file).

- [ ] **Step 5: Add the dispatch branch in `resolveBrowserResource`**

Add a branch after the `map` block (after line 451, before the `metaapp` fallthrough `return resolveMetaAppResource(...)` at 453):

```ts
  if (parsed.scheme === 'preview-metaapp') {
    // parseBrowserUri already produced a ParsedPreviewMetaAppUri-shaped result; re-parse via the
    // dedicated parser to obtain the structured host/path fields the resolver needs.
    const previewParsed = parsePreviewMetaAppUri(parsed.normalizedUri);
    return resolvePreviewMetaAppResource({
      parsed: previewParsed,
      config: input.config,
      previewMetaAppLocalResolve: input.previewMetaAppLocalResolve,
    });
  }
```

Add the parser import at the top:

```ts
import { parsePreviewMetaAppUri } from './previewMetaAppUri.js';
```

- [ ] **Step 6: Export the resolver from `packages/core/src/index.ts`**

Add after the metaAppResolver export (line 39):

```ts
export * from './browser/previewMetaAppResolver.js';
```

- [ ] **Step 7: Run the dispatch tests to verify they pass**

Run: `npm run build && node --test tests/browser/browserResolver.test.mjs`
Expected: PASS (including 2 new).

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/browser/browserResolver.ts packages/core/src/index.ts tests/browser/browserResolver.test.mjs
git commit -m "feat: wire preview-metaapp resolver into browser dispatch"
```

Post a buzz (Bob identity).

---

### Task 5: host-standalone local-FS factory

Implement `previewMetaAppLocalResolve` in the standalone adapter, reusing `createPreviewSessionForArtifact`. Widen `PreviewSession.source`.

**Files:**
- Modify: `packages/host-standalone/src/adapter.ts:88-94` (widen source), `:383-402` (createPreviewSessionForArtifact source param), `:444-477` (inject factory)
- Test: `tests/host-standalone/previewMetaAppLocal.test.mjs` (create)

**Interfaces:**
- Consumes: `PreviewMetaAppLocalResolve` type + `previewMetaAppLocalResolve` input field (Tasks 1 & 4).
- Produces: the factory implementation that creates a `PreviewSession` for a local dir/file.

- [ ] **Step 1: Write the failing tests in `tests/host-standalone/previewMetaAppLocal.test.mjs`**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createStandaloneHost } = require('../../packages/host-standalone/dist/index.js');

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
    const host = createStandaloneHost({});
    const result = await host.resolve({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(result.ok, true);
    assert.equal(result.data.renderer.type, 'html-iframe');
    assert.match(result.data.renderer.url, /\/api\/browser\/preview-assets\//);
    assert.match(result.data.renderer.url, /index\.html$/);
  });
});

test('localhost preview of a single file uses its parent dir as artifactDir', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'report.pdf'), '%PDF-1.4');
    const host = createStandaloneHost({});
    const result = await host.resolve({ uri: `preview-metaapp://localhost${path.join(dir, 'report.pdf')}` });
    assert.equal(result.ok, true);
    assert.equal(result.data.renderer.type, 'pdf');
    assert.match(result.data.renderer.url, /report\.pdf$/);
  });
});

test('localhost preview of a directory without index.html fails with a clear message', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'other.html'), 'x');
    const host = createStandaloneHost({});
    const result = await host.resolve({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(result.ok, false);
    assert.match(result.message, /index\.html/i);
  });
});

test('localhost preview of a non-existent path fails', async () => {
  const host = createStandaloneHost({});
  const result = await host.resolve({ uri: 'preview-metaapp://localhost/this/does/not/exist' });
  assert.equal(result.ok, false);
  assert.match(result.message, /not found/i);
});
```

NOTE: verify the actual `createStandaloneHost` export name + `host.resolve({ uri })` call shape by reading `tests/host-standalone/standaloneServer.test.mjs` and the adapter's public API before finalizing. If the host exposes a different entry (e.g. `host.resolveBrowserResource` or a `BrowserHostAdapter.resolve`), adjust the test to match exactly. The goal of this step is the assertion contract, reachable through whatever the real public API is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/host-standalone/previewMetaAppLocal.test.mjs`
Expected: FAIL — preview resolves to `unsupported` ("Local preview is not supported by this host") because the factory is not injected yet.

- [ ] **Step 3: Widen `PreviewSession.source` in `packages/host-standalone/src/adapter.ts`**

Change the `PreviewSession` interface (lines 88-94):

```ts
interface PreviewSession {
  artifactDir: string;
  indexFile: string;
  createdAt: number;
  source: 'cache' | 'local';
  cacheKey?: string;
}
```

Change `createPreviewSessionForArtifact`'s parameter type (line 386) from `source: 'cache';` to:

```ts
  source: 'cache' | 'local';
```

- [ ] **Step 4: Implement the factory in `packages/host-standalone/src/adapter.ts`**

Add a helper function inside the adapter factory (near `createPreviewSessionForArtifact`, after line 402). This is the host-injected `previewMetaAppLocalResolve`:

```ts
  // preview-metaapp://localhost: read a live local file or directory. Unrestricted absolute path
  // by explicit design (local-dev only; must not be exposed to the public internet). See the
  // design spec §9 Security.
  async function resolveLocalPreviewPath(input: { path: string }): Promise<PreviewMetaAppLocalResolveResult> {
    let stats;
    try {
      stats = await fs.stat(input.path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        throw new Error(`Local path not found: ${input.path}`);
      }
      if (code === 'EACCES') {
        throw new Error(`Permission denied: ${input.path}`);
      }
      throw error;
    }

    let artifactDir: string;
    let indexFile: string;
    if (stats.isDirectory()) {
      const candidates = ['index.html', 'index.htm'];
      const found = await Promise.all(
        candidates.map(async (name) => {
          try { await fs.access(path.join(input.path, name)); return name; } catch { return null; }
        }),
      );
      indexFile = found.find((name): name is string => name !== null) ?? '';
      if (!indexFile) {
        throw new Error(`No index.html found in directory: ${input.path}`);
      }
      artifactDir = input.path;
    } else {
      artifactDir = path.dirname(input.path);
      indexFile = path.basename(input.path);
    }

    const session = createPreviewSessionForArtifact({ artifactDir, indexFile, source: 'local' });
    const contentType = contentTypeForPath(indexFile) || 'text/html';
    return { localPreviewUrl: session.localPreviewUrl, previewId: session.previewId, contentType };
  }
```

`PreviewMetaAppLocalResolveResult` must be imported at the top of the file — add it to the existing `@openagentinternet/agent-browser-core` import (line 3-17):

```ts
  type BrowserResolveResult,
  type PreviewMetaAppLocalResolveResult,
```

(`contentTypeForPath` already exists at adapter.ts:147; `createPreviewSessionForArtifact` at 383; `fs` and `path` are imported at lines 1-2.)

- [ ] **Step 5: Inject the factory at the `resolveBrowserResource` call site (line 444-477)**

Add `previewMetaAppLocalResolve` next to `metaAppResolve`:

```ts
    return resolveBrowserResource({
      uri: resolveInput.uri,
      config: browserConfig,
      fetch: resolveFetch,
      nameAliasProviders,
      previewMetaAppLocalResolve: resolveLocalPreviewPath,
      metaAppResolve: (pinId) => resolveMetaAppPinToRecord({
        // ...existing...
      }),
    });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run build && node --test tests/host-standalone/previewMetaAppLocal.test.mjs`
Expected: PASS (all 4).

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/host-standalone/src/adapter.ts tests/host-standalone/previewMetaAppLocal.test.mjs
git commit -m "feat: serve local preview-metaapp paths via standalone preview sessions"
```

Post a buzz (Bob identity).

---

### Task 6: Conformance + end-to-end verification

Confirm the new scheme satisfies host-contract conformance and works through the standalone HTTP server.

**Files:**
- Test: `tests/host-standalone/standaloneServer.test.mjs` (add an HTTP end-to-end test)
- No production code changes expected.

**Interfaces:** consumes the public API only.

- [ ] **Step 1: Read `tests/host-standalone/standaloneServer.test.mjs`** to mirror its `listen(server)` + `fetch(baseUrl + path)` pattern (lines 10-30).

- [ ] **Step 2: Write an end-to-end HTTP test**

Add to `tests/host-standalone/standaloneServer.test.mjs`, mirroring the existing `listen` helper:

```js
test('standalone Browser serves a preview-metaapp localhost directory over HTTP', async (t) => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const nodePath = await import('node:path');
  const dir = await mkdtemp(nodePath.join(tmpdir(), 'preview-e2e-'));
  await writeFile(nodePath.join(dir, 'index.html'), '<h1>preview e2e</h1>');

  const server = createStandaloneBrowserServer({}); // use the exact constructor the file already uses
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  // Resolve via the browser resolve route, then fetch the preview asset.
  const resolveResponse = await fetch(`${baseUrl}/browser/preview-metaapp/localhost${dir}`);
  // The exact route shape (deep-link vs /api/browser/resolve) depends on server.ts — match what
  // standaloneServer.test.mjs already uses for other schemes (e.g. the metafile deep-link at line 38).
  const resolved = await resolveResponse.json();
  const previewUrl = resolved.renderer?.url;
  assert.ok(previewUrl, 'expected a renderer url');
  const asset = await fetch(`${baseUrl}${previewUrl}`);
  assert.equal(asset.status, 200);
  const body = await asset.text();
  assert.match(body, /preview e2e/);
});
```

Adjust the resolve route + constructor names to match the file's real conventions. If the existing tests use a `/api/browser/resolve` POST or a `/browser/<scheme>/...` deep-link GET, use the same for `preview-metaapp`.

- [ ] **Step 3: Run the e2e test**

Run: `npm run build && node --test tests/host-standalone/standaloneServer.test.mjs`
Expected: PASS.

- [ ] **Step 4: Run the full verification suite**

Run: `npm run verify`
Expected: all pass (this runs the full `tests/**/*.test.mjs` glob).

- [ ] **Step 5: Commit (test-only)**

```bash
git add tests/host-standalone/standaloneServer.test.mjs
git commit -m "test: add preview-metaapp localhost end-to-end HTTP test"
```

Post a buzz (Bob identity).

---

### Task 7: User documentation

Document the protocol and the local-dev-only security constraint.

**Files:**
- Create: `docs/preview-metaapp-protocol.md`

- [ ] **Step 1: Write `docs/preview-metaapp-protocol.md`**

```markdown
# preview-metaapp:// Protocol

`preview-metaapp://{host}/{path}` previews a local or remote resource in the Agent Browser using
the same renderers as published MetaApps (HTML, PDF, image, video, audio). It is intended for
iterating on a MetaApp locally **before** publishing on-chain.

## URI format

```
preview-metaapp://{host}/{path}
```

- `{host}`:
  - `localhost` — read the local filesystem.
  - any other value — treated as an HTTPS origin (the browser connects directly to
    `https://{host}{path}`).
- `{path}`:
  - For `localhost`: an absolute filesystem path. A directory auto-resolves `index.html`
    (then `index.htm`). A single file is previewed directly.
  - For remote: a URL path.

## Examples

```
# Local directory
preview-metaapp://localhost/Users/tusm/Documents/MetaID_Projects/metaapp_buzz/app/

# Local single file
preview-metaapp://localhost/Users/tusm/report.pdf

# Remote
preview-metaapp://example.com/path/to/index.html
```

## How localhost preview works

The standalone host serves the file/directory through the same preview-asset pipeline used for
published ZIP MetaApps: relative resources resolve correctly, and HTML pages get a localStorage/
sessionStorage shim. Reload the page to pick up the latest file contents on disk.

## Security — local dev only

When `host` is `localhost`, the browser reads **any absolute path** the host process can read.
Do **not** expose a `preview-metaapp://localhost` endpoint to the public internet. To disable the
feature entirely on a host, set `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP=1`.

Note: only the literal host `localhost` reads the local filesystem. `localhost:3000` (with a port)
and `127.0.0.1` are treated as remote HTTPS origins.
```

- [ ] **Step 2: Commit**

```bash
git add docs/preview-metaapp-protocol.md
git commit -m "docs: document the preview-metaapp protocol and security constraints"
```

Post a buzz (Bob identity).

- [ ] **Step 3: Merge into main**

Per AGENTS.md, merge completed work with `git merge --no-ff`:

```bash
git checkout main
git merge --no-ff feat/preview-metaapp-protocol -m "feat: merge preview-metaapp protocol"
```

(Do this only after all tasks pass and the user confirms.)

---

## Self-Review

(Spec coverage check — run after writing the plan.)

- **§4 URI format + parsing** → Task 2 (parser) + Task 1 (scheme registration). ✓
- **§5.2 New types** → Task 1 Step 5. ✓
- **§5.3 Input field** → Task 4 Step 4. ✓
- **§6 Resolver (local + remote, renderer selection, dispatch)** → Task 3 (resolver) + Task 4 (dispatch). ✓
- **§7 Local FS impl (stat, dir vs file, index.html, createPreviewSessionForArtifact, contentTypeForPath, source widen)** → Task 5. ✓
- **§8 Config (default true, env kill-switch, no Settings UI)** → Task 1 Step 6. ✓
- **§9 Security (unrestricted path, local-dev-only doc)** → Task 5 code comment + Task 7 docs. ✓
- **§10 Error handling** → Task 3 (disabled/unsupported/unknown-ext) + Task 5 (ENOENT/EACCES/no-index). ✓
- **§11 Testing (4 test files + e2e)** → Tasks 1-6. ✓
- **§12 Change inventory** → all files covered across tasks. ✓

No placeholders. Type names consistent: `parsePreviewMetaAppUri`, `resolvePreviewMetaAppResource`, `ParsedPreviewMetaAppUri`, `PreviewMetaAppLocalResolve`, `PreviewMetaAppLocalResolveResult`, `previewMetaAppLocalResolve`, `enablePreviewMetaApp` — used identically across all tasks.
