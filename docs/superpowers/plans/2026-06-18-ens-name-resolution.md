# ENS Name Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ENS-backed name aliases so Browser can resolve `metaid://*.eth`, `metaapp://*.eth`, and `map://*.eth` through `org.openagentinternet.uri`.

**Architecture:** Keep alias orchestration in `packages/core`, keep ENS/Ethereum client code out of core, and inject name-alias providers from hosts. Core parses the input alias URI, asks a provider for a canonical URI, enforces same-scheme and canonical-target rules, resolves the canonical resource, then returns the canonical result with the visible URI restored to the alias.

**Tech Stack:** TypeScript strict mode, npm workspaces, Node `>=20 <25`, `node:test`, optional `viem` in `@openagentinternet/agent-browser-name-resolvers`, existing Browser host-contract result shapes.

---

## Scope Notes

This plan implements ENS name-alias support and the provider boundary. It does not implement the full MAP protocol renderer from `docs/superpowers/specs/2026-06-17-map-uri-protocol-renderer-design.md`. For `map://` aliases, this plan adds the parser-only MAP URI helper required for canonical target validation plus a `mapResolve` hook so alias resolution can dispatch to the MAP resolver when that resolver is present. The full MAP renderer plan should extend the same `packages/core/src/browser/mapUri.ts` parser instead of creating a second MAP parser.

The implementation must preserve the current host-neutral rule: `packages/core` must not import `viem`, Ethereum JSON-RPC clients, OAC, IDBots, SQLite, Metalet, wallets, or signer modules.

Every task commit must be followed by a Bob development-journal Buzz using the `metabot-post-buzz` skill and `--from bob`. Each Buzz should include the task number, commit hash, files touched, verification command, and pass/fail result.

## File Structure

- Modify `packages/core/src/uri/browserUri.ts`: add `map` as a Browser URI scheme and export reusable Global MetaID validation.
- Create `packages/core/src/browser/mapUri.ts`: parser-only MAP URI canonicalization used by ENS alias validation.
- Modify `packages/core/src/browser/types.ts`: add `map` to Browser scheme types, add name-resolution config and provider-neutral alias types.
- Create `packages/core/src/browser/nameAlias.ts`: ENS alias detection, canonical target validation, provider dispatch, and alias metadata helpers.
- Modify `packages/core/src/browser/browserResolver.ts`: run name-alias resolution before canonical dispatch; add `mapResolve` hook; preserve alias URI in resolved results.
- Modify `packages/core/src/browser/config.ts`: resolve name-resolution defaults and env overrides.
- Modify `packages/core/src/browser/settings.ts`: persist and validate name-resolution settings.
- Modify `packages/core/src/index.ts`: export alias helpers and types.
- Create `packages/name-resolvers/*`: optional ENS provider package using `viem`.
- Modify `packages/host-standalone/src/adapter.ts`: wire configured ENS provider or injected name-alias providers into core resolution.
- Modify `packages/host-standalone/src/server.ts`: accept `/browser/map/...` routes.
- Modify `packages/ui/src/browser/menuModel.ts`: add Browser settings tab metadata for name resolution.
- Modify `packages/ui/src/browser/app.ts`: render alias metadata in Inspector, show alias failures, and wire name-resolution settings controls.
- Modify tests under `tests/core`, `tests/browser`, `tests/ui`, and `tests/package`.
- Modify root `package.json`, `package-lock.json`, `scripts/browser-workspaces.mjs`, `release/compatibility.json`, root build scripts, and package/release tests so the new workspace is built, packed, exported, and release-checked.

## Task 1: Add URI Foundations For MAP And Alias Target Validation

**Files:**
- Modify: `packages/core/src/uri/browserUri.ts`
- Create: `packages/core/src/browser/mapUri.ts`
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/browser/uri.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `tests/core/uri.test.mjs`
- Modify: `tests/browser/uri.test.mjs`

- [ ] **Step 1: Write failing URI tests**

Add these assertions to both `tests/core/uri.test.mjs` and `tests/browser/uri.test.mjs`:

```js
test('parseBrowserUri normalizes map scheme resources', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  assert.deepEqual(core.parseBrowserUri(` MAP://simplebuzz/pin/${pinId}[0] `), {
    originalUri: `MAP://simplebuzz/pin/${pinId}[0]`,
    normalizedUri: `map://simplebuzz/pin/${pinId}?version=0`,
    scheme: 'map',
    id: `simplebuzz/pin/${pinId}?version=0`,
  });
});

test('core exports Global MetaID validation helper', () => {
  assert.equal(core.isValidGlobalMetaId(validGlobalMetaId), true);
  assert.equal(core.isValidGlobalMetaId('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), false);
});
```

For `tests/browser/uri.test.mjs`, replace `core.parseBrowserUri` with `parseBrowserUri` and import `isValidGlobalMetaId` from `../../packages/core/dist/browser/uri.js`:

```js
const { parseBrowserUri, isValidGlobalMetaId } = require('../../packages/core/dist/browser/uri.js');
```

Use this browser test helper body:

```js
test('browser uri module exports Global MetaID validation helper', () => {
  assert.equal(isValidGlobalMetaId(validGlobalMetaId), true);
  assert.equal(isValidGlobalMetaId('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), false);
});
```

In `tests/core/uri.test.mjs`, add parser-specific MAP assertions:

```js
test('parseMapUri accepts canonical MAP pin and conversation targets', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

  assert.deepEqual(core.parseMapUri(`map://simplebuzz/pin/${pinId}`), {
    originalUri: `map://simplebuzz/pin/${pinId}`,
    normalizedUri: `map://simplebuzz/pin/${pinId}`,
    authority: 'simplebuzz',
    protocolPath: '/protocols/simplebuzz',
    targetKind: 'pin',
    pinId,
    versionSelector: 'latest',
  });

  assert.deepEqual(core.parseMapUri(`map://simplebuzz/pin/${pinId}[1]`), {
    originalUri: `map://simplebuzz/pin/${pinId}[1]`,
    normalizedUri: `map://simplebuzz/pin/${pinId}?version=1`,
    authority: 'simplebuzz',
    protocolPath: '/protocols/simplebuzz',
    targetKind: 'pin',
    pinId,
    versionSelector: 'history-index',
    historyIndex: 1,
  });

  assert.deepEqual(core.parseMapUri('map://simplemsg/conversation?peer=idq1peer'), {
    originalUri: 'map://simplemsg/conversation?peer=idq1peer',
    normalizedUri: 'map://simplemsg/conversation?peer=idq1peer',
    authority: 'simplemsg',
    protocolPath: '/protocols/simplemsg',
    targetKind: 'conversation',
    peerGlobalMetaId: 'idq1peer',
  });
});

test('parseMapUri rejects aliases and invalid selectors', () => {
  assert.throws(() => core.parseMapUri('map://buzz.eth'), /unsupported MAP path|complete MAP URI/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc'), /pinId/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc[-1]'), /history/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc?version=latest'), /version/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation'), /peer/i);
});
```

- [ ] **Step 2: Run the focused URI tests and verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/core/uri.test.mjs tests/browser/uri.test.mjs
```

Expected: build or tests fail because `map`, `parseMapUri`, and `isValidGlobalMetaId` are not exported.

- [ ] **Step 3: Implement the URI foundations**

In `packages/core/src/uri/browserUri.ts`, change the scheme type and supported set:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp' | 'metafile' | 'map';

const SUPPORTED_SCHEMES = new Set<BrowserUriScheme>(['metaid', 'metaapp', 'metafile', 'map']);
```

Add this export after `normalizeBareGlobalMetaId`:

```ts
export function isValidGlobalMetaId(input: string): boolean {
  return normalizeBareGlobalMetaId(input) !== null;
}
```

In `packages/core/src/browser/types.ts`, change:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp' | 'metafile' | 'map';
```

Add parser-only MAP types in the same file:

```ts
export type MapUriTargetKind = 'pin' | 'conversation';
export type MapPinVersionSelector = 'latest' | 'history-index';

export interface ParsedMapPinUri {
  originalUri: string;
  normalizedUri: string;
  authority: string;
  protocolPath: string;
  targetKind: 'pin';
  pinId: string;
  versionSelector: MapPinVersionSelector;
  historyIndex?: number;
}

export interface ParsedMapConversationUri {
  originalUri: string;
  normalizedUri: string;
  authority: 'simplemsg';
  protocolPath: '/protocols/simplemsg';
  targetKind: 'conversation';
  peerGlobalMetaId: string;
}

export type ParsedMapUri = ParsedMapPinUri | ParsedMapConversationUri;
```

Create `packages/core/src/browser/mapUri.ts` using the parser contract from `docs/superpowers/specs/2026-06-17-map-uri-protocol-renderer-design.md`. The implementation must:

- parse only `map://` URIs;
- normalize authority to lowercase;
- accept `map://{protocol}/pin/{pinId}`, `map://{protocol}/pin/{pinId}[N]`, and `map://simplemsg/conversation?peer={globalMetaId}`;
- normalize `[N]` to `?version=N`;
- reject `?version=latest`, negative history selectors, ENS aliases, invalid pin ids, and missing conversation peers.

In `packages/core/src/uri/browserUri.ts`, import `parseMapUri` and use it when `scheme === 'map'`:

```ts
import { parseMapUri } from '../browser/mapUri.js';
```

```ts
  if (scheme === 'map') {
    const parsedMap = parseMapUri(`${scheme}://${id}`);
    return {
      originalUri,
      normalizedUri: parsedMap.normalizedUri,
      scheme,
      id: parsedMap.normalizedUri.slice('map://'.length),
    };
  }
```

Do not edit `packages/host-contract/src/index.ts` in this task. Current host-contract exposes host/resource result shapes and does not define Browser URI schemes; keep URI parsing and scheme support inside `packages/core`.

In `packages/core/src/browser/uri.ts`, export the new helper:

```ts
export {
  parseBrowserUri,
  isValidGlobalMetaId,
  type BrowserUriScheme,
  type ParsedBrowserUri,
} from '../uri/browserUri.js';
export { parseMapUri, type ParsedMapUri } from './mapUri.js';
```

In `packages/core/src/index.ts`, export the helper from the root entry:

```ts
export {
  parseBrowserUri,
  isValidGlobalMetaId,
  type BrowserUriScheme,
  type ParsedBrowserUri,
} from './uri/browserUri.js';
export { parseMapUri, type ParsedMapUri } from './browser/mapUri.js';
```

- [ ] **Step 4: Run the focused URI tests and verify they pass**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/core/uri.test.mjs tests/browser/uri.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/core/src/uri/browserUri.ts packages/core/src/browser/mapUri.ts packages/core/src/browser/types.ts packages/core/src/browser/uri.ts packages/core/src/index.ts tests/core/uri.test.mjs tests/browser/uri.test.mjs
git commit -m "feat: add browser URI alias foundations"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 2: Add Provider-Neutral Name Alias Core

**Files:**
- Create: `packages/core/src/browser/nameAlias.ts`
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/browser/nameAlias.test.mjs`

- [ ] **Step 1: Write failing alias-core tests**

Create `tests/browser/nameAlias.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');
const {
  OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
  isSupportedNameAliasId,
  resolveBrowserNameAlias,
  validateNameAliasCanonicalTarget,
} = require('../../packages/core/dist/browser/nameAlias.js');

const validGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const validPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';

test('ENS alias detection accepts .eth names and subnames only', () => {
  assert.equal(OPEN_AGENT_INTERNET_ENS_TEXT_KEY, 'org.openagentinternet.uri');
  assert.equal(isSupportedNameAliasId('sunny.eth'), true);
  assert.equal(isSupportedNameAliasId('app.sunny.eth'), true);
  assert.equal(isSupportedNameAliasId('SUNNY.ETH'), true);
  assert.equal(isSupportedNameAliasId('bücher.eth'), true);
  assert.equal(isSupportedNameAliasId('sunny.com'), false);
  assert.equal(isSupportedNameAliasId('sunny.eth/path'), false);
  assert.equal(isSupportedNameAliasId('sunny..eth'), false);
});

test('canonical target validation accepts same-scheme metaid targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: ` metaid://${validGlobalMetaId} `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metaid://${validGlobalMetaId}`);
});

test('canonical target validation accepts same-scheme metaapp targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'metaapp',
    aliasName: 'app.sunny.eth',
    canonicalUri: `metaapp://${validPinId}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metaapp://${validPinId}`);
});

test('canonical target validation accepts concrete same-scheme map targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'map',
    aliasName: 'buzz.sunny.eth',
    canonicalUri: `map://simplebuzz/pin/${validPinId}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${validPinId}`);
});

test('canonical target validation rejects scheme mismatch, recursive aliases, and invalid values', () => {
  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: validGlobalMetaId,
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metafile',
    aliasName: 'file.sunny.eth',
    canonicalUri: `metafile://${validPinId}`,
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: `metaapp://${validPinId}`,
  }).code, 'name_alias_scheme_mismatch');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: 'metaid://other.eth',
  }).code, 'name_alias_recursive');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: 'https://example.com',
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaapp',
    aliasName: 'app.sunny.eth',
    canonicalUri: 'metaapp://not-a-pin',
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'map',
    aliasName: 'buzz.sunny.eth',
    canonicalUri: 'map://other.eth',
  }).code, 'name_alias_recursive');
});

test('name alias resolution skips unsupported schemes before provider lookup', async () => {
  let called = false;
  const parsed = parseBrowserUri('metafile://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: () => true,
      async resolveNameAlias() {
        called = true;
        throw new Error('should not resolve metafile aliases');
      },
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data, null);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run the alias-core test and verify it fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/nameAlias.test.mjs
```

Expected: FAIL because `packages/core/dist/browser/nameAlias.js` does not exist.

- [ ] **Step 3: Add provider-neutral alias types**

Append these interfaces to `packages/core/src/browser/types.ts`:

```ts
export interface BrowserNameAliasRequest {
  inputUri: string;
  inputScheme: BrowserUriScheme;
  name: string;
}

export interface BrowserNameAliasResult {
  provider: 'ens' | string;
  normalizedName: string;
  textKey: string;
  canonicalUri: string;
  resolvedAt: number;
  verificationState: BrowserVerificationState;
  raw?: Record<string, unknown>;
}

export interface BrowserNameAliasProvider {
  id: string;
  supportsName(name: string): boolean;
  resolveNameAlias(request: BrowserNameAliasRequest): Promise<BrowserCommandResult<BrowserNameAliasResult>>;
}
```

- [ ] **Step 4: Implement `packages/core/src/browser/nameAlias.ts`**

Create `packages/core/src/browser/nameAlias.ts`:

```ts
import { parseBrowserUri, isValidGlobalMetaId, parseMapUri, type ParsedBrowserUri } from './uri.js';
import {
  browserCommandFailed,
  browserCommandSuccess,
  type BrowserCommandResult,
  type BrowserNameAliasProvider,
  type BrowserNameAliasRequest,
  type BrowserNameAliasResult,
  type BrowserResolveResult,
  type BrowserUriScheme,
} from './types.js';

export const OPEN_AGENT_INTERNET_ENS_TEXT_KEY = 'org.openagentinternet.uri';

const PIN_ID_PATTERN = /^[0-9a-f]{64}i0$/iu;
const EXPLICIT_ALIAS_TARGET_PATTERN = /^(metaid|metaapp|map):\/\//iu;
const SUPPORTED_NAME_ALIAS_SCHEMES = new Set<BrowserUriScheme>(['metaid', 'metaapp', 'map']);

export interface ValidateNameAliasCanonicalTargetInput {
  inputScheme: BrowserUriScheme;
  aliasName: string;
  canonicalUri: string;
}

export interface ValidatedNameAliasCanonicalTarget {
  parsed: ParsedBrowserUri;
  normalizedUri: string;
}

export interface ResolveBrowserNameAliasInput {
  parsed: ParsedBrowserUri;
  providers?: BrowserNameAliasProvider[];
}

export interface BrowserNameAliasContext extends BrowserNameAliasResult {
  aliasUri: string;
  canonicalParsed: ParsedBrowserUri;
}

export function isSupportedNameAliasId(value: string): boolean {
  const name = String(value ?? '').trim().toLowerCase();
  if (!name.endsWith('.eth')) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  const labels = name.split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0 && !/\s/u.test(label));
}

function isCanonicalMetaAppId(id: string): boolean {
  return PIN_ID_PATTERN.test(id.trim());
}

function isCanonicalMapTarget(parsed: ParsedBrowserUri): boolean {
  if (parsed.scheme !== 'map') return false;
  try {
    parseMapUri(parsed.normalizedUri);
    return true;
  } catch {
    return false;
  }
}

function isSupportedNameAliasScheme(scheme: BrowserUriScheme): boolean {
  return SUPPORTED_NAME_ALIAS_SCHEMES.has(scheme);
}

function isRecursiveAlias(parsed: ParsedBrowserUri): boolean {
  return isSupportedNameAliasId(parsed.id);
}

function withAliasErrorContext<T>(
  result: BrowserCommandResult<T>,
  context: Record<string, unknown>,
): BrowserCommandResult<T> {
  if (result.ok) return result;
  return {
    ...result,
    data: {
      ...(result.data ?? {}),
      ...context,
    },
  };
}

export function validateNameAliasCanonicalTarget(
  input: ValidateNameAliasCanonicalTargetInput,
): BrowserCommandResult<ValidatedNameAliasCanonicalTarget> {
  if (!isSupportedNameAliasScheme(input.inputScheme)) {
    return browserCommandFailed('invalid_name_alias_target', 'Name alias input scheme is not supported.', {
      aliasName: input.aliasName,
      inputScheme: input.inputScheme,
    });
  }

  const canonicalText = input.canonicalUri.trim();
  if (!EXPLICIT_ALIAS_TARGET_PATTERN.test(canonicalText)) {
    return browserCommandFailed('invalid_name_alias_target', 'Name alias target must be an explicit Agent Internet URI.', {
      aliasName: input.aliasName,
      canonicalUri: canonicalText,
    });
  }

  let parsed: ParsedBrowserUri;
  try {
    parsed = parseBrowserUri(canonicalText);
  } catch (error) {
    return browserCommandFailed(
      'invalid_name_alias_target',
      error instanceof Error ? error.message : 'Name alias target is not a valid Browser URI.',
      { aliasName: input.aliasName },
    );
  }

  if (parsed.scheme !== input.inputScheme) {
    return browserCommandFailed('name_alias_scheme_mismatch', 'Name alias target scheme does not match the input URI scheme.', {
      aliasName: input.aliasName,
      inputScheme: input.inputScheme,
      canonicalScheme: parsed.scheme,
      canonicalUri: parsed.normalizedUri,
    });
  }

  if (isRecursiveAlias(parsed)) {
    return browserCommandFailed('name_alias_recursive', 'Name alias target points to another supported name alias.', {
      aliasName: input.aliasName,
      canonicalUri: parsed.normalizedUri,
    });
  }

  if (parsed.scheme === 'metaid' && !isValidGlobalMetaId(parsed.id)) {
    return browserCommandFailed('invalid_name_alias_target', 'ENS metaid target must contain a valid Global MetaID.', {
      aliasName: input.aliasName,
      canonicalUri: parsed.normalizedUri,
    });
  }

  if (parsed.scheme === 'metaapp' && !isCanonicalMetaAppId(parsed.id)) {
    return browserCommandFailed('invalid_name_alias_target', 'ENS metaapp target must contain a canonical pin id.', {
      aliasName: input.aliasName,
      canonicalUri: parsed.normalizedUri,
    });
  }

  if (parsed.scheme === 'map' && !isCanonicalMapTarget(parsed)) {
    return browserCommandFailed('invalid_name_alias_target', 'ENS map target must contain a concrete MAP pin URI.', {
      aliasName: input.aliasName,
      canonicalUri: parsed.normalizedUri,
    });
  }

  return browserCommandSuccess({
    parsed,
    normalizedUri: parsed.normalizedUri,
  });
}

export async function resolveBrowserNameAlias(
  input: ResolveBrowserNameAliasInput,
): Promise<BrowserCommandResult<BrowserNameAliasContext | null>> {
  if (!isSupportedNameAliasScheme(input.parsed.scheme) || !isSupportedNameAliasId(input.parsed.id)) {
    return browserCommandSuccess(null);
  }

  const providers = input.providers ?? [];
  const provider = providers.find((candidate) => candidate.supportsName(input.parsed.id));
  if (!provider) {
    return browserCommandFailed('name_resolution_unavailable', 'Name alias resolution is not configured.', {
      aliasUri: input.parsed.normalizedUri,
      inputUri: input.parsed.normalizedUri,
      aliasName: input.parsed.id,
    });
  }

  const request: BrowserNameAliasRequest = {
    inputUri: input.parsed.normalizedUri,
    inputScheme: input.parsed.scheme,
    name: input.parsed.id,
  };
  const resolved = await provider.resolveNameAlias(request);
  if (!resolved.ok) {
    return withAliasErrorContext(resolved, {
      inputUri: input.parsed.normalizedUri,
      aliasName: input.parsed.id,
      provider: provider.id,
    });
  }

  const canonical = validateNameAliasCanonicalTarget({
    inputScheme: input.parsed.scheme,
    aliasName: resolved.data.normalizedName,
    canonicalUri: resolved.data.canonicalUri,
  });
  if (!canonical.ok) {
    return withAliasErrorContext(canonical, {
      inputUri: input.parsed.normalizedUri,
      aliasName: input.parsed.id,
      provider: provider.id,
    });
  }

  return browserCommandSuccess({
    ...resolved.data,
    aliasUri: input.parsed.normalizedUri,
    canonicalUri: canonical.data.normalizedUri,
    canonicalParsed: canonical.data.parsed,
  });
}

export function aliasBrowserResolveResult(input: {
  result: BrowserResolveResult;
  alias: BrowserNameAliasContext;
}): BrowserResolveResult {
  return {
    ...input.result,
    uri: input.alias.aliasUri,
    normalizedUri: input.alias.aliasUri,
    actions: input.result.actions.map((action) => (
      action.id === 'copy-uri' || action.kind === 'copy'
        ? { ...action, uri: input.alias.aliasUri }
        : action
    )),
    source: {
      ...input.result.source,
      raw: {
        ...(input.result.source.raw ?? {}),
        nameAlias: {
          aliasUri: input.alias.aliasUri,
          provider: input.alias.provider,
          normalizedName: input.alias.normalizedName,
          textKey: input.alias.textKey,
          canonicalUri: input.alias.canonicalUri,
          resolvedAt: input.alias.resolvedAt,
          verificationState: input.alias.verificationState,
          raw: input.alias.raw,
        },
      },
    },
  };
}
```

- [ ] **Step 5: Export the new module**

Append this export to `packages/core/src/index.ts`:

```ts
export * from './browser/nameAlias.js';
```

- [ ] **Step 6: Run the alias-core test and verify it passes**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/nameAlias.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/core/src/browser/nameAlias.ts packages/core/src/browser/types.ts packages/core/src/index.ts tests/browser/nameAlias.test.mjs
git commit -m "feat: add Browser name alias core"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 3: Integrate Alias Resolution Into The Browser Resolver

**Files:**
- Modify: `packages/core/src/browser/browserResolver.ts`
- Modify: `packages/core/src/browser/types.ts`
- Modify: `tests/browser/browserResolver.test.mjs`

- [ ] **Step 1: Write failing resolver tests**

Append these tests to `tests/browser/browserResolver.test.mjs`:

```js
const validEnsGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const validEnsMetaAppPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';

function ensProvider(canonicalUri, overrides = {}) {
  return {
    id: 'ens',
    supportsName: (name) => String(name).toLowerCase().endsWith('.eth'),
    async resolveNameAlias(request) {
      if (overrides.fail) {
        return { ok: false, code: overrides.fail.code, message: overrides.fail.message, data: { name: request.name } };
      }
      return {
        ok: true,
        state: 'success',
        data: {
          provider: 'ens',
          normalizedName: request.name.toLowerCase(),
          textKey: 'org.openagentinternet.uri',
          canonicalUri,
          resolvedAt: 1780761234567,
          verificationState: 'partial',
          raw: { source: 'test-ens' },
        },
      };
    },
  };
}

test('resolveBrowserResource resolves metaid ENS aliases while preserving visible URI', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  const result = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaid://${validEnsGlobalMetaId}`)],
    fetch: async (url) => {
      assert.equal(
        String(url),
        `https://so.example.test/api/bot-homepage/globalmetaid/${validEnsGlobalMetaId}?version=v3`,
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: '', data: fixture }),
      };
    },
    metaAppLookup: async () => null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://sunny.eth');
  assert.equal(result.data.normalizedUri, 'metaid://sunny.eth');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, `metaid://${validEnsGlobalMetaId}`);
  assert.equal(result.data.source.raw.nameAlias.provider, 'ens');
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://sunny.eth');
});

test('resolveBrowserResource resolves metaapp ENS aliases through MetaApp resolver', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaapp://app.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaapp://${validEnsMetaAppPinId}`)],
    metaAppLookup: async (pinId) => {
      assert.equal(pinId, validEnsMetaAppPinId);
      return metaAppRecord(pinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaapp://app.sunny.eth');
  assert.equal(result.data.normalizedUri, 'metaapp://app.sunny.eth');
  assert.equal(result.data.resourceType, 'metaapp');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, `metaapp://${validEnsMetaAppPinId}`);
});

test('resolveBrowserResource dispatches map ENS aliases to injected map resolver', async () => {
  const canonicalMapUri = `map://simplebuzz/pin/${validEnsMetaAppPinId}`;
  const result = await resolveBrowserResource({
    uri: 'map://buzz.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(canonicalMapUri)],
    mapResolve: async (uri) => {
      assert.equal(uri, canonicalMapUri);
      return {
        ok: true,
        state: 'success',
        data: {
          uri,
          normalizedUri: uri,
          resourceType: 'unknown',
          title: 'Buzz Resource',
          owner: { kind: 'unknown', globalMetaId: '', name: 'Unknown', verificationState: 'partial' },
          renderer: { type: 'unsupported', contentType: 'application/vnd.metaid.map' },
          status: { state: 'resolved', verificationState: 'partial', message: 'Resolved MAP resource.' },
          source: { resolver: 'map-test', raw: { protocol: 'simplebuzz' } },
          actions: [{ id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri }],
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'map://buzz.sunny.eth');
  assert.equal(result.data.normalizedUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, canonicalMapUri);
});

test('resolveBrowserResource fails closed for ENS alias errors', async () => {
  const missingProvider = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
  });
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.code, 'name_resolution_unavailable');

  const mismatch = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaapp://${validEnsMetaAppPinId}`)],
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'name_alias_scheme_mismatch');

  const providerFailure = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider('', { fail: { code: 'name_alias_not_found', message: 'No record.' } })],
  });
  assert.equal(providerFailure.ok, false);
  assert.equal(providerFailure.code, 'name_alias_not_found');
  assert.equal(providerFailure.data.inputUri, 'metaid://sunny.eth');
  assert.equal(providerFailure.data.provider, 'ens');
  assert.equal(providerFailure.data.aliasName, 'sunny.eth');
});
```

- [ ] **Step 2: Run resolver tests and verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/browserResolver.test.mjs
```

Expected: FAIL because `resolveBrowserResource` does not accept `nameAliasProviders` or `mapResolve`.

- [ ] **Step 3: Add resolver input types**

In `packages/core/src/browser/browserResolver.ts`, extend `ResolveBrowserResourceInput`:

```ts
export interface ResolveBrowserResourceInput {
  uri: string;
  config: BotBrowserConfig;
  fetch?: typeof fetch;
  metaAppLookup?: (pinId: string) => Promise<MetaAppGalleryRecord | null>;
  metaAppResolve?: (pinId: string) => Promise<BrowserCommandResult<MetaAppGalleryRecord>>;
  mapResolve?: (uri: string, parsed: ParsedBrowserUri) => Promise<BrowserCommandResult<BrowserResolveResult>>;
  nameAliasProviders?: BrowserNameAliasProvider[];
  skipNameAliasResolution?: boolean;
}
```

Import the new types and helpers:

```ts
import {
  aliasBrowserResolveResult,
  resolveBrowserNameAlias,
} from './nameAlias.js';
import type { BrowserNameAliasProvider } from './types.js';
```

- [ ] **Step 4: Add alias resolution before canonical dispatch**

In `resolveBrowserResource`, after parsing succeeds and before `if (parsed.scheme === 'metaid')`, add:

```ts
  if (!input.skipNameAliasResolution) {
    const alias = await resolveBrowserNameAlias({
      parsed,
      providers: input.nameAliasProviders,
    });
    if (!alias.ok) {
      return alias;
    }
    if (alias.data) {
      const canonicalResolved = await resolveBrowserResource({
        ...input,
        uri: alias.data.canonicalUri,
        skipNameAliasResolution: true,
      });
      if (!canonicalResolved.ok) {
        return canonicalResolved;
      }
      return browserCommandSuccess(aliasBrowserResolveResult({
        result: canonicalResolved.data,
        alias: alias.data,
      }));
    }
  }
```

- [ ] **Step 5: Add MAP resolver dispatch**

Before the final MetaApp dispatch, add:

```ts
  if (parsed.scheme === 'map') {
    if (!input.mapResolve) {
      return browserCommandFailed('map_resolution_unavailable', 'MAP resource resolution is not configured.');
    }
    return input.mapResolve(parsed.normalizedUri, parsed);
  }
```

- [ ] **Step 6: Run resolver tests and verify they pass**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/browserResolver.test.mjs tests/browser/nameAlias.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/core/src/browser/browserResolver.ts packages/core/src/browser/types.ts tests/browser/browserResolver.test.mjs
git commit -m "feat: resolve Browser name aliases"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 4: Add Name Resolution Configuration And Settings

**Files:**
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/browser/config.ts`
- Modify: `packages/core/src/browser/settings.ts`
- Modify: `tests/browser/settings.test.mjs`
- Modify: `tests/browser/browserStandaloneServer.test.mjs`
- Modify: `packages/ui/src/browser/menuModel.ts`
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/browserPageState.test.mjs`
- Modify: `tests/ui/browserInteractions.test.mjs`

- [ ] **Step 1: Write failing settings tests**

Append these tests to `tests/browser/settings.test.mjs`:

```js
test('Browser settings default name resolution on with ENS disabled until RPC URLs exist', () => {
  const defaults = createDefaultBrowserConfig();
  const resolved = resolveBrowserConfig({});
  const snapshot = createBrowserSettingsSnapshot({ config: {} });

  assert.equal(defaults.nameResolution.enabled, true);
  assert.equal(defaults.nameResolution.ens.enabled, false);
  assert.deepEqual(defaults.nameResolution.ens.rpcUrls, []);
  assert.equal(defaults.nameResolution.ens.textKey, 'org.openagentinternet.uri');
  assert.equal(resolved.nameResolution.enabled, true);
  assert.equal(resolved.nameResolution.ens.enabled, false);
  assert.equal(snapshot.effectiveBrowser.nameResolution.ens.textKey, 'org.openagentinternet.uri');
});

test('Browser settings resolve ENS config from env and browser settings', () => {
  const resolved = resolveBrowserConfig({
    browser: {
      nameResolution: {
        enabled: true,
        ens: {
          enabled: true,
          rpcUrls: ['https://configured.example/rpc'],
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  }, {
    METABOT_BROWSER_ENS_RPC_URLS: 'https://env-one.example/rpc, https://env-two.example/rpc',
  });

  assert.equal(resolved.nameResolution.enabled, true);
  assert.equal(resolved.nameResolution.ens.enabled, true);
  assert.deepEqual(resolved.nameResolution.ens.rpcUrls, [
    'https://env-one.example/rpc',
    'https://env-two.example/rpc',
  ]);
  assert.equal(resolved.nameResolution.ens.textKey, 'org.openagentinternet.uri');
});

test('Browser settings update and validate name resolution fields', () => {
  const updated = applyBrowserSettingsUpdate({}, {
    nameResolution: {
      enabled: true,
      ens: {
        enabled: true,
        rpcUrls: ['https://rpc.example'],
        textKey: 'org.openagentinternet.uri',
      },
    },
  });
  const snapshot = createBrowserSettingsSnapshot({ config: updated });

  assert.equal(snapshot.effectiveBrowser.nameResolution.enabled, true);
  assert.equal(snapshot.effectiveBrowser.nameResolution.ens.enabled, true);
  assert.deepEqual(snapshot.effectiveBrowser.nameResolution.ens.rpcUrls, ['https://rpc.example']);

  assert.throws(
    () => applyBrowserSettingsUpdate({}, { nameResolution: { ens: { rpcUrls: ['not-a-url'] } } }),
    /browser\.nameResolution\.ens\.rpcUrls must contain http\(s\) URLs/,
  );
  assert.throws(
    () => applyBrowserSettingsUpdate({}, { nameResolution: { ens: { textKey: '' } } }),
    /browser\.nameResolution\.ens\.textKey must be a non-empty string/,
  );
});
```

In `tests/browser/browserStandaloneServer.test.mjs`, extend the settings update body in the existing server test:

```js
body: JSON.stringify({
  browser: {
    botHomepageTemplateId: 'compact-list',
    renderCustomBotPages: false,
    nameResolution: {
      enabled: true,
      ens: {
        enabled: true,
        rpcUrls: ['https://rpc.example'],
        textKey: 'org.openagentinternet.uri',
      },
    },
  },
}),
```

Add assertions after the existing custom rendering assertions:

```js
assert.equal(updated.data.effectiveBrowser.nameResolution.enabled, true);
assert.equal(updated.data.effectiveBrowser.nameResolution.ens.enabled, true);
assert.deepEqual(updated.data.effectiveBrowser.nameResolution.ens.rpcUrls, ['https://rpc.example']);
```

In `tests/ui/browserPageState.test.mjs`, extend the default `settingsData` fixture with:

```js
nameResolution: {
  enabled: true,
  ens: {
    enabled: false,
    chainId: 1,
    rpcUrls: [],
    textKey: 'org.openagentinternet.uri',
  },
},
```

Extend the local `FakeElement` class with a selector-backed `querySelector` for settings input fields:

```js
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=]+)="([^"]+)"\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
```

Add this UI settings test:

```js
test('Browser name resolution settings save ENS fields globally', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('nameResolution');

  const modal = elements['[data-browser-modal-root]'];
  assert.match(modal.innerHTML, /Name Resolution/);
  assert.match(modal.innerHTML, /data-browser-name-resolution-enabled/);
  assert.match(modal.innerHTML, /data-browser-ens-enabled/);
  assert.match(modal.innerHTML, /data-browser-ens-rpc-urls/);
  assert.match(modal.innerHTML, /org\.openagentinternet\.uri/);

  modal.querySelector('[data-browser-ens-rpc-urls]').value = 'https://rpc-one.example/rpc, https://rpc-two.example/rpc';
  modal.querySelector('[data-browser-ens-text-key]').value = 'org.openagentinternet.uri';
  await context.saveBrowserSettings();

  assert.deepEqual(context.state.settingsData.browser.nameResolution.ens.rpcUrls, [
    'https://rpc-one.example/rpc',
    'https://rpc-two.example/rpc',
  ]);
  assert.equal(context.state.settingsData.browser.nameResolution.ens.textKey, 'org.openagentinternet.uri');
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
});
```

In `tests/ui/browserInteractions.test.mjs`, add script-shape assertions that the Browser script contains `renderNameResolutionSettings`, `data-browser-name-resolution-enabled`, `data-browser-ens-rpc-urls`, and `saveNameResolutionSettings`.

- [ ] **Step 2: Run settings tests and verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/settings.test.mjs tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserInteractions.test.mjs
```

Expected: FAIL because `nameResolution` is not part of Browser config or UI settings.

- [ ] **Step 3: Add config types**

In `packages/core/src/browser/types.ts`, add:

```ts
export interface BrowserEnsNameResolutionConfig {
  enabled: boolean;
  chainId: 1;
  rpcUrls: string[];
  textKey: string;
}

export interface BrowserNameResolutionConfig {
  enabled: boolean;
  ens: BrowserEnsNameResolutionConfig;
}
```

Add this property to `BrowserBaseConfig`:

```ts
  nameResolution: BrowserNameResolutionConfig;
```

- [ ] **Step 4: Resolve config defaults and env overrides**

In `packages/core/src/browser/config.ts`, add constants:

```ts
const DEFAULT_ENS_TEXT_KEY = 'org.openagentinternet.uri';
```

Add helpers:

```ts
function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return null;
}

function normalizeUrlList(value: unknown): string[] {
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join(',') : '';
  return text
    .split(',')
    .map((item) => normalizeUrl(item))
    .filter(Boolean);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
```

In `createDefaultBrowserConfig`, add:

```ts
    nameResolution: {
      enabled: true,
      ens: {
        enabled: false,
        chainId: 1,
        rpcUrls: [],
        textKey: DEFAULT_ENS_TEXT_KEY,
      },
    },
```

In `resolveBrowserConfig`, compute before the return:

```ts
  const browserNameResolution = browser.nameResolution ?? {};
  const browserEns = browserNameResolution.ens ?? {};
  const envRpcUrls = normalizeUrlList(env.METABOT_BROWSER_ENS_RPC_URLS);
  const configuredRpcUrls = envRpcUrls.length > 0 ? envRpcUrls : normalizeUrlList(browserEns.rpcUrls);
  const nameResolutionEnabled = normalizeBoolean(env.METABOT_BROWSER_NAME_RESOLUTION_ENABLED)
    ?? (typeof browserNameResolution.enabled === 'boolean' ? browserNameResolution.enabled : defaults.nameResolution.enabled);
  const ensEnabledInput = normalizeBoolean(env.METABOT_BROWSER_ENS_ENABLED)
    ?? (typeof browserEns.enabled === 'boolean' ? browserEns.enabled : configuredRpcUrls.length > 0);
  const ensTextKey = normalizeText(env.METABOT_BROWSER_ENS_TEXT_KEY)
    || normalizeText(browserEns.textKey)
    || defaults.nameResolution.ens.textKey;
```

Add to the returned object:

```ts
    nameResolution: {
      enabled: nameResolutionEnabled,
      ens: {
        enabled: nameResolutionEnabled && ensEnabledInput && configuredRpcUrls.length > 0,
        chainId: 1,
        rpcUrls: configuredRpcUrls,
        textKey: ensTextKey,
      },
    },
```

- [ ] **Step 5: Validate settings updates**

In `packages/core/src/browser/settings.ts`, add helpers:

```ts
function validateHttpUrl(value: unknown, message: string): string {
  const text = normalizeBaseUrl(value);
  if (!text) {
    throw new Error(message);
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported_protocol');
    }
    return parsed.href.replace(/\/+$/, '');
  } catch {
    throw new Error(message);
  }
}

function validateHttpUrlList(value: unknown): string[] {
  const message = 'browser.nameResolution.ens.rpcUrls must contain http(s) URLs.';
  const rawItems = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return rawItems.map((item) => validateHttpUrl(item, message));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readNameResolutionConfig(
  value: Partial<BrowserBaseConfig>['nameResolution'] | undefined,
  defaults: BrowserBaseConfig['nameResolution'],
): BrowserBaseConfig['nameResolution'] {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : defaults.enabled,
    ens: {
      enabled: typeof value?.ens?.enabled === 'boolean' ? value.ens.enabled : defaults.ens.enabled,
      chainId: 1,
      rpcUrls: Array.isArray(value?.ens?.rpcUrls) ? [...value.ens.rpcUrls] : [...defaults.ens.rpcUrls],
      textKey: value?.ens?.textKey || defaults.ens.textKey,
    },
  };
}

function readOptionalBoolean(value: unknown, fallback: boolean, message: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }
  return value;
}

function mergeNameResolutionSettings(
  current: Partial<BrowserBaseConfig>['nameResolution'],
  input: unknown,
  defaults: BrowserBaseConfig['nameResolution'],
): BrowserBaseConfig['nameResolution'] {
  const value = readObject(input);
  const existing = readNameResolutionConfig(current, defaults);
  const ensInput = readObject(value.ens);
  const next = {
    enabled: readOptionalBoolean(value.enabled, existing.enabled, 'browser.nameResolution.enabled must be a boolean.'),
    ens: {
      enabled: readOptionalBoolean(ensInput.enabled, existing.ens.enabled, 'browser.nameResolution.ens.enabled must be a boolean.'),
      chainId: 1 as const,
      rpcUrls: hasOwn(ensInput, 'rpcUrls')
        ? validateHttpUrlList(ensInput.rpcUrls)
        : [...existing.ens.rpcUrls],
      textKey: hasOwn(ensInput, 'textKey')
        ? normalizeText(ensInput.textKey)
        : existing.ens.textKey,
    },
  };
  if (!next.ens.textKey) {
    throw new Error('browser.nameResolution.ens.textKey must be a non-empty string.');
  }
  return next;
}
```

In `applyBrowserSettingsUpdate`, before `localMode`, add:

```ts
  if (Object.prototype.hasOwnProperty.call(browserInput, 'nameResolution')) {
    nextBrowser.nameResolution = mergeNameResolutionSettings(
      nextBrowser.nameResolution,
      browserInput.nameResolution,
      defaults.nameResolution,
    );
  }
```

- [ ] **Step 6: Wire Browser settings UI**

In `packages/ui/src/browser/menuModel.ts`, extend settings tab types and menu:

```ts
settingsTab: 'baseUrls' | 'templates' | 'nameResolution' | 'cache';
```

```ts
{ id: 'nameResolution', label: 'Name Resolution' },
```

Add a menu item after `Settings`:

```ts
{
  id: 'name-resolution',
  label: 'Name Resolution',
  icon: 'link',
  action: 'open-settings',
  settingsTab: 'nameResolution',
},
```

In `packages/ui/src/browser/app.ts`, add helpers beside `renderBaseUrlSettings`:

```js
function nameResolutionConfig() {
  var data = state.settingsData || {};
  var effective = objectValue(objectValue(data.effectiveBrowser).nameResolution);
  var browser = objectValue(objectValue(data.browser).nameResolution);
  var defaults = objectValue(objectValue(data.defaults).nameResolution);
  var source = Object.keys(browser).length ? browser : (Object.keys(effective).length ? effective : defaults);
  var ens = objectValue(source.ens);
  return {
    enabled: source.enabled !== false,
    ensEnabled: ens.enabled === true,
    rpcUrls: Array.isArray(ens.rpcUrls) ? ens.rpcUrls.join(', ') : '',
    textKey: textValue(ens.textKey) || 'org.openagentinternet.uri'
  };
}

function renderNameResolutionSettings() {
  var config = nameResolutionConfig();
  return '<form class="browser-settings-form" data-browser-settings-form>' +
    '<label class="browser-settings-field"><span>Name Resolution</span>' +
      '<button type="button" class="browser-switch" role="switch" data-browser-name-resolution-enabled aria-checked="' + (config.enabled ? 'true' : 'false') + '">' +
        '<span class="browser-switch-track" aria-hidden="true"><span class="browser-switch-thumb"></span></span>' +
        '<span class="browser-switch-label">' + (config.enabled ? 'On' : 'Off') + '</span></button></label>' +
    '<label class="browser-settings-field"><span>ENS</span>' +
      '<button type="button" class="browser-switch" role="switch" data-browser-ens-enabled aria-checked="' + (config.ensEnabled ? 'true' : 'false') + '">' +
        '<span class="browser-switch-track" aria-hidden="true"><span class="browser-switch-thumb"></span></span>' +
        '<span class="browser-switch-label">' + (config.ensEnabled ? 'On' : 'Off') + '</span></button></label>' +
    '<label class="browser-settings-field"><span>ENS RPC URLs</span>' +
      '<input data-browser-ens-rpc-urls value="' + escapeHtml(config.rpcUrls) + '" placeholder="https://rpc.example" /></label>' +
    '<label class="browser-settings-field"><span>ENS Text Key</span>' +
      '<input data-browser-ens-text-key value="' + escapeHtml(config.textKey) + '" placeholder="org.openagentinternet.uri" /></label>' +
  '</form>';
}
```

Update `renderBrowserSettingsModal` so `nameResolution` uses `renderNameResolutionSettings()` and shows the save button:

```js
var body = state.settingsTab === 'cache'
  ? renderCacheSettings()
  : (state.settingsTab === 'templates'
    ? renderTemplateSettings()
    : (state.settingsTab === 'nameResolution' ? renderNameResolutionSettings() : renderBaseUrlSettings()));
var saveButton = state.settingsTab === 'baseUrls' || state.settingsTab === 'nameResolution'
  ? '<button type="button" data-browser-settings-save>Save</button>'
  : '';
```

Add a `saveNameResolutionSettings` helper and route `saveBrowserSettings` through it:

```js
async function saveNameResolutionSettings() {
  if (!elements.modalRoot || typeof elements.modalRoot.querySelector !== 'function') return null;
  var rpcUrlsInput = elements.modalRoot.querySelector('[data-browser-ens-rpc-urls]');
  var textKeyInput = elements.modalRoot.querySelector('[data-browser-ens-text-key]');
  var enabledSwitch = elements.modalRoot.querySelector('[data-browser-name-resolution-enabled]');
  var ensSwitch = elements.modalRoot.querySelector('[data-browser-ens-enabled]');
  var rpcUrls = textValue(rpcUrlsInput && rpcUrlsInput.value)
    .split(',')
    .map(function (item) { return textValue(item); })
    .filter(Boolean);
  var browser = {
    nameResolution: {
      enabled: !enabledSwitch || enabledSwitch.getAttribute('aria-checked') !== 'false',
      ens: {
        enabled: !!ensSwitch && ensSwitch.getAttribute('aria-checked') === 'true',
        rpcUrls: rpcUrls,
        textKey: textValue(textKeyInput && textKeyInput.value) || 'org.openagentinternet.uri'
      }
    }
  };
  var result = await api(browserSettingsEndpoint(), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ browser: browser })
  });
  state.settingsData = result;
  setStatus('saved', '');
  renderBrowserSettingsModal();
  return result;
}
```

At the top of the existing `saveBrowserSettings` function, insert:

```js
  if (state.settingsTab === 'nameResolution') {
    return saveNameResolutionSettings();
  }
```

In the modal click handler, add toggles for `data-browser-name-resolution-enabled` and `data-browser-ens-enabled`. Toggle the clicked element's `aria-checked` value and re-render its label before saving.

- [ ] **Step 7: Run settings tests and verify they pass**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/settings.test.mjs tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserInteractions.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/core/src/browser/types.ts packages/core/src/browser/config.ts packages/core/src/browser/settings.ts packages/ui/src/browser/menuModel.ts packages/ui/src/browser/app.ts tests/browser/settings.test.mjs tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserInteractions.test.mjs
git commit -m "feat: add Browser name resolution settings"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 5: Add Optional ENS Provider Package

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/browser-workspaces.mjs`
- Create: `packages/name-resolvers/package.json`
- Create: `packages/name-resolvers/tsconfig.json`
- Create: `packages/name-resolvers/tsconfig.cjs.json`
- Create: `packages/name-resolvers/src/index.ts`
- Create: `packages/name-resolvers/src/ens.ts`
- Create: `tests/browser/ensNameResolver.test.mjs`

- [ ] **Step 1: Create the workspace package and install viem**

Create `packages/name-resolvers/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-name-resolvers",
  "version": "0.3.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/openagentinternet/agent-browser-core.git",
    "directory": "packages/name-resolvers"
  },
  "type": "module",
  "main": "./dist-cjs/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/ens.d.ts",
    "dist/ens.d.ts.map",
    "dist/ens.js",
    "dist/ens.js.map",
    "dist-cjs/package.json",
    "dist-cjs/index.js",
    "dist-cjs/index.js.map",
    "dist-cjs/ens.js",
    "dist-cjs/ens.js.map"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist-cjs/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-core": "0.3.0",
    "viem": "^2.0.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

Create `packages/name-resolvers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "references": [
    { "path": "../core" }
  ],
  "include": [
    "src/**/*.ts"
  ]
}
```

Create `packages/name-resolvers/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm install
```

Expected: `package-lock.json` gains the new workspace and `viem` dependency tree.

- [ ] **Step 2: Write failing ENS provider tests**

Create `tests/browser/ensNameResolver.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createEnsOpenAgentInternetResolver } = require('../../packages/name-resolvers/dist-cjs/index.js');

test('ENS provider supports only .eth aliases', () => {
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc.example'],
    transportFactory: () => ({
      async getEnsText() {
        return null;
      },
    }),
  });

  assert.equal(provider.id, 'ens');
  assert.equal(provider.supportsName('sunny.eth'), true);
  assert.equal(provider.supportsName('app.sunny.eth'), true);
  assert.equal(provider.supportsName('sunny.com'), false);
});

test('ENS provider returns canonical URI from org.openagentinternet.uri text record', async () => {
  const calls = [];
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc.example'],
    now: () => 1780761234567,
    transportFactory: (rpcUrl) => ({
      async getEnsText(input) {
        calls.push({ rpcUrl, input });
        return ' metaid://idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n ';
      },
    }),
  });

  const result = await provider.resolveNameAlias({
    inputUri: 'metaid://SUNNY.ETH',
    inputScheme: 'metaid',
    name: 'SUNNY.ETH',
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.normalizedName, 'sunny.eth');
  assert.equal(result.data.textKey, 'org.openagentinternet.uri');
  assert.equal(result.data.canonicalUri, 'metaid://idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n');
  assert.equal(result.data.resolvedAt, 1780761234567);
  assert.equal(result.data.verificationState, 'partial');
  assert.deepEqual(calls, [{
    rpcUrl: 'https://rpc.example',
    input: { name: 'sunny.eth', key: 'org.openagentinternet.uri' },
  }]);
});

test('ENS provider falls back across RPC URLs and reports missing records', async () => {
  const calls = [];
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc-one.example', 'https://rpc-two.example'],
    transportFactory: (rpcUrl) => ({
      async getEnsText(input) {
        calls.push({ rpcUrl, input });
        if (rpcUrl.includes('one')) {
          throw new Error('first RPC failed');
        }
        return null;
      },
    }),
  });

  const result = await provider.resolveNameAlias({
    inputUri: 'metaid://sunny.eth',
    inputScheme: 'metaid',
    name: 'sunny.eth',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'name_alias_not_found');
  assert.equal(calls.length, 2);
});
```

- [ ] **Step 3: Run ENS provider tests and verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/ensNameResolver.test.mjs
```

Expected: FAIL because package source does not exist and root build does not include the workspace.

- [ ] **Step 4: Implement the provider**

Create `packages/name-resolvers/src/index.ts`:

```ts
export * from './ens.js';
```

Create `packages/name-resolvers/src/ens.ts`:

```ts
import {
  OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
  browserCommandFailed,
  browserCommandSuccess,
  isSupportedNameAliasId,
  type BrowserCommandResult,
  type BrowserNameAliasProvider,
  type BrowserNameAliasRequest,
  type BrowserNameAliasResult,
} from '@openagentinternet/agent-browser-core';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

export interface EnsTextClient {
  getEnsText(input: { name: string; key: string }): Promise<string | null>;
}

export interface CreateEnsOpenAgentInternetResolverInput {
  rpcUrls: string[];
  chainId?: 1;
  textKey?: string;
  now?: () => number;
  transportFactory?: (rpcUrl: string) => EnsTextClient;
}

function normalizeRpcUrls(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

function createDefaultClient(rpcUrl: string): EnsTextClient {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

export function createEnsOpenAgentInternetResolver(
  input: CreateEnsOpenAgentInternetResolverInput,
): BrowserNameAliasProvider {
  const rpcUrls = normalizeRpcUrls(input.rpcUrls);
  const textKey = input.textKey?.trim() || OPEN_AGENT_INTERNET_ENS_TEXT_KEY;
  const now = input.now ?? Date.now;
  const transportFactory = input.transportFactory ?? createDefaultClient;

  return {
    id: 'ens',
    supportsName(name: string): boolean {
      return isSupportedNameAliasId(name);
    },
    async resolveNameAlias(request: BrowserNameAliasRequest): Promise<BrowserCommandResult<BrowserNameAliasResult>> {
      let normalizedName: string;
      try {
        normalizedName = normalize(request.name);
      } catch (error) {
        return browserCommandFailed('name_resolution_failed', error instanceof Error ? error.message : 'ENS name normalization failed.', {
          aliasName: request.name,
        });
      }

      if (rpcUrls.length === 0) {
        return browserCommandFailed('name_resolution_unavailable', 'ENS RPC URLs are not configured.', {
          aliasName: normalizedName,
          textKey,
        });
      }

      const errors: string[] = [];
      for (const rpcUrl of rpcUrls) {
        try {
          const client = transportFactory(rpcUrl);
          const textValue = await client.getEnsText({ name: normalizedName, key: textKey });
          const canonicalUri = typeof textValue === 'string' ? textValue.trim() : '';
          if (canonicalUri) {
            return browserCommandSuccess({
              provider: 'ens',
              normalizedName,
              textKey,
              canonicalUri,
              resolvedAt: now(),
              verificationState: 'partial',
              raw: { rpcUrl },
            });
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (errors.length === rpcUrls.length) {
        return browserCommandFailed('name_resolution_failed', 'ENS text record lookup failed.', {
          aliasName: normalizedName,
          textKey,
          errors,
        });
      }

      return browserCommandFailed('name_alias_not_found', 'ENS text record was missing or empty.', {
        aliasName: normalizedName,
        textKey,
      });
    },
  };
}
```

- [ ] **Step 5: Add root build scripts for name-resolvers**

In root `package.json`, update:

```json
"build:esm": "tsc -b packages/host-contract packages/core packages/name-resolvers packages/ui packages/host-standalone packages/test-harness",
"build:cjs": "tsc -p packages/host-contract/tsconfig.cjs.json && tsc -p packages/core/tsconfig.cjs.json && tsc -p packages/name-resolvers/tsconfig.cjs.json && tsc -p packages/ui/tsconfig.cjs.json && tsc -p packages/host-standalone/tsconfig.cjs.json && tsc -p packages/test-harness/tsconfig.cjs.json && node scripts/write-cjs-package-markers.mjs",
```

- [ ] **Step 6: Register the workspace for package tooling**

In `scripts/browser-workspaces.mjs`, add the new package after core:

```js
  {
    name: "@openagentinternet/agent-browser-name-resolvers",
    path: "packages/name-resolvers",
  },
```

This feeds CJS package marker creation, package publish tooling, and tests that iterate `BROWSER_WORKSPACES`.

- [ ] **Step 7: Run ENS provider tests and verify they pass**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/ensNameResolver.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add package.json package-lock.json scripts/browser-workspaces.mjs packages/name-resolvers tests/browser/ensNameResolver.test.mjs
git commit -m "feat: add ENS name resolver package"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 6: Wire Standalone Host Name Resolution

**Files:**
- Modify: `packages/host-standalone/package.json`
- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `packages/host-standalone/src/server.ts`
- Modify: `tests/browser/browserStandaloneServer.test.mjs`
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/browserPageState.test.mjs`

- [ ] **Step 1: Write failing standalone alias tests**

Add a standalone server test that injects a fake alias provider into `createStandaloneBrowserServer`. Use the existing server test helper style in `tests/browser/browserStandaloneServer.test.mjs`:

```js
test('standalone server resolves metaid ENS alias through injected provider', async (t) => {
  const canonicalGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  fixture.identity.globalMetaId = canonicalGlobalMetaId;
  fixture.identity.display = 'idq1qypq-w5z8n';
  fixture.profile.name = 'ENS Fixture Bot';
  const server = createStandaloneBrowserServer({
    fetch: async (url) => {
      assert.match(String(url), new RegExp(canonicalGlobalMetaId));
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: '', data: fixture }),
      };
    },
    nameAliasProviders: [{
      id: 'ens',
      supportsName: (name) => String(name).toLowerCase() === 'fixture.eth',
      async resolveNameAlias() {
        return {
          ok: true,
          state: 'success',
          data: {
            provider: 'ens',
            normalizedName: 'fixture.eth',
            textKey: 'org.openagentinternet.uri',
            canonicalUri: `metaid://${canonicalGlobalMetaId}`,
            resolvedAt: 1780761234567,
            verificationState: 'partial',
          },
        };
      },
    }],
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const payload = await readJson(await fetch(`${baseUrl}/api/browser/resolve?uri=metaid%3A%2F%2Ffixture.eth`));
  assert.equal(payload.ok, true);
  assert.equal(payload.data.normalizedUri, 'metaid://fixture.eth');
  assert.equal(payload.data.source.raw.nameAlias.canonicalUri, `metaid://${canonicalGlobalMetaId}`);
});
```

Add a second standalone test that proves env-configured ENS wiring constructs a provider without requiring a real Ethereum RPC:

```js
test('standalone server constructs ENS provider from configured RPC URLs', async (t) => {
  const canonicalGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  fixture.identity.globalMetaId = canonicalGlobalMetaId;
  const factoryCalls = [];
  const server = createStandaloneBrowserServer({
    env: {
      METABOT_BROWSER_ENS_RPC_URLS: 'https://rpc.example',
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: '', data: fixture }),
    }),
    ensNameAliasProviderFactory: (config) => {
      factoryCalls.push(config);
      return {
        id: 'ens',
        supportsName: (name) => String(name).toLowerCase() === 'env.eth',
        async resolveNameAlias() {
          return {
            ok: true,
            state: 'success',
            data: {
              provider: 'ens',
              normalizedName: 'env.eth',
              textKey: config.textKey,
              canonicalUri: `metaid://${canonicalGlobalMetaId}`,
              resolvedAt: 1780761234567,
              verificationState: 'partial',
            },
          };
        },
      };
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const payload = await readJson(await fetch(`${baseUrl}/api/browser/resolve?uri=metaid%3A%2F%2Fenv.eth`));
  assert.equal(payload.ok, true);
  assert.equal(factoryCalls[0].rpcUrls[0], 'https://rpc.example');
  assert.equal(factoryCalls[0].textKey, 'org.openagentinternet.uri');
});
```

Add a route assertion to an existing page-route test:

```js
const mapPage = await fetch(`${baseUrl}/browser/map/buzz.sunny.eth`);
assert.equal(mapPage.status, 200);

const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const canonicalMapPage = await fetch(`${baseUrl}/browser/map/simplebuzz/pin/${pinId}?version=0`);
assert.equal(canonicalMapPage.status, 200);
```

In `tests/ui/browserPageState.test.mjs`, add a MAP deep-link assertion beside the existing MetaID, MetaApp, and Metafile deep-link tests:

```js
test('Browser MAP deep link path is decoded into the address bar and resolved', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const { elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/map/simplebuzz/pin/${pinId}`,
    search: '?version=0',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, `map://simplebuzz/pin/${pinId}?version=0`);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=map%3A%2F%2Fsimplebuzz%2Fpin%2F${pinId}%3Fversion%3D0&actorId=worker`);
});
```

Add a second MAP alias deep-link assertion:

```js
test('Browser MAP alias deep link path is decoded into the address bar and resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext({ pathname: '/browser/map/buzz.sunny.eth' });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP alias resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, 'map://buzz.sunny.eth');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=map%3A%2F%2Fbuzz.sunny.eth&actorId=worker');
});
```

- [ ] **Step 2: Run standalone tests and verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs
```

Expected: FAIL because standalone adapter does not accept `nameAliasProviders`, server routes do not include map, and the Browser page path parser does not decode `/browser/map/...`.

- [ ] **Step 3: Add host dependency**

In `packages/host-standalone/package.json`, add:

```json
"@openagentinternet/agent-browser-name-resolvers": "0.3.0",
```

Keep dependencies sorted with the existing local package group.

- [ ] **Step 4: Add adapter input and provider construction**

In `packages/host-standalone/src/adapter.ts`, import:

```ts
import { createEnsOpenAgentInternetResolver } from '@openagentinternet/agent-browser-name-resolvers';
import type { BrowserNameAliasProvider } from '@openagentinternet/agent-browser-core';
```

Extend `CreateStandaloneBrowserHostAdapterInput`:

```ts
  nameAliasProviders?: BrowserNameAliasProvider[];
  ensNameAliasProviderFactory?: (config: {
    chainId: 1;
    rpcUrls: string[];
    textKey: string;
  }) => BrowserNameAliasProvider;
```

Add helper near `createStandaloneConfig`:

```ts
function createNameAliasProviders(input: {
  configured: BrowserNameAliasProvider[] | undefined;
  ensNameAliasProviderFactory: CreateStandaloneBrowserHostAdapterInput['ensNameAliasProviderFactory'];
  config: ReturnType<typeof resolveBrowserConfig>;
}): BrowserNameAliasProvider[] {
  if (input.configured) {
    return input.configured;
  }
  const nameResolution = input.config.nameResolution;
  if (!nameResolution.enabled || !nameResolution.ens.enabled) {
    return [];
  }
  return [
    (input.ensNameAliasProviderFactory ?? createEnsOpenAgentInternetResolver)({
      rpcUrls: nameResolution.ens.rpcUrls,
      chainId: nameResolution.ens.chainId,
      textKey: nameResolution.ens.textKey,
    }),
  ];
}
```

In `resolveResourceWithFetch`, compute providers after `browserConfig`:

```ts
    const nameAliasProviders = createNameAliasProviders({
      configured: input.nameAliasProviders,
      ensNameAliasProviderFactory: input.ensNameAliasProviderFactory,
      config: browserConfig,
    });
```

Pass it into `resolveBrowserResource`:

```ts
      nameAliasProviders,
```

- [ ] **Step 5: Add map page route support**

In `packages/host-standalone/src/server.ts`, update `isBrowserPage`:

```ts
    /^\/browser\/(?:metaid|metaapp|metafile)\/[^/?#]+$/.test(pathname) ||
    /^\/browser\/map\/.+$/.test(pathname);
```

In `packages/ui/src/browser/app.ts`, update `browserUriFromPath` to accept the search string and preserve MAP query parameters:

```js
function browserUriFromPath(pathname, search) {
  var regularMatch = textValue(pathname).match(/^\/browser\/(metaid|metaapp|metafile)\/([^/?#]+)$/);
  if (regularMatch) {
    var rawId = regularMatch[2];
    var decodedId = rawId;
    try {
      decodedId = decodeURIComponent(rawId);
    } catch (error) {
      decodedId = rawId;
    }
    var id = textValue(decodedId);
    if (!id) return '';
    return regularMatch[1] + '://' + id;
  }
  var mapMatch = textValue(pathname).match(/^\/browser\/map\/(.+)$/);
  if (!mapMatch) return '';
  var rawMapId = mapMatch[1];
  var decodedMapId = rawMapId;
  try {
    decodedMapId = decodeURIComponent(rawMapId);
  } catch (error) {
    decodedMapId = rawMapId;
  }
  var query = textValue(search);
  return 'map://' + textValue(decodedMapId) + (query ? query : '');
}
```

Update initialization to pass `window.location.search`:

```js
var pathUri = queryUri ? '' : browserUriFromPath(window.location && window.location.pathname, window.location && window.location.search);
```

- [ ] **Step 6: Run standalone tests and verify they pass**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add packages/host-standalone/package.json packages/host-standalone/src/adapter.ts packages/host-standalone/src/server.ts packages/ui/src/browser/app.ts tests/browser/browserStandaloneServer.test.mjs tests/ui/browserPageState.test.mjs package-lock.json
git commit -m "feat: wire standalone ENS name aliases"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 7: Render Alias Metadata In Inspector

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/browserPageInspector.test.mjs`

- [ ] **Step 1: Write failing Inspector test**

In `tests/ui/browserPageInspector.test.mjs`, change the local helper signature from `function createContext()` to:

```js
function createContext(overrides = {}) {
```

After the `responses` map is created, add:

```js
  for (const [uri, result] of Object.entries(overrides.responses ?? {})) {
    responses.set(uri, result);
  }
  const failures = overrides.failures ?? {};
```

In the helper `fetch` implementation for `/api/browser/resolve`, return a configured failure before falling back to `responses`:

```js
      if (failures[uri]) {
        return { ok: true, json: async () => failures[uri] };
      }
```

Then add this dedicated test:

```js
test('Inspector renders ENS alias metadata from source raw nameAlias', async () => {
  const aliasUri = 'metaid://sunny.eth';
  const { context, nodes } = createContext({
    responses: {
      [aliasUri]: browserResult(aliasUri, {
        normalizedUri: aliasUri,
        title: 'Sunny',
        owner: { kind: 'bot', globalMetaId: 'idq1target', name: 'Sunny', verificationState: 'partial' },
        source: {
          resolver: 'metaso-p2p',
          raw: {
            nameAlias: {
              aliasUri,
              provider: 'ens',
              normalizedName: 'sunny.eth',
              textKey: 'org.openagentinternet.uri',
              canonicalUri: 'metaid://idq1target',
              resolvedAt: 1780761234567,
              verificationState: 'partial',
            },
          },
        },
      }),
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo(aliasUri);
  await waitFor(() => context.state.current && context.state.current.uri === aliasUri, 'alias resource');
  nodes['[data-browser-resource-chip]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Name Alias<\/h3>/);
  assert.match(html, /sunny\.eth/);
  assert.match(html, /org\.openagentinternet\.uri/);
  assert.match(html, /metaid:\/\/idq1target/);
  assert.match(html, /partial/);
});
```

Add a failure-state Inspector test:

```js
test('Inspector renders ENS alias failure context after resolve error', async () => {
  const aliasUri = 'metaid://missing.eth';
  const { context, nodes } = createContext({
    failures: {
      [aliasUri]: {
        ok: false,
        state: 'failed',
        code: 'name_alias_not_found',
        message: 'ENS text record was missing or empty.',
        data: {
          inputUri: aliasUri,
          aliasName: 'missing.eth',
          provider: 'ens',
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo(aliasUri);
  await waitFor(() => context.state.lastResolveError, 'alias failure');
  nodes['[data-browser-status-proof]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Name Alias Error<\/h3>/);
  assert.match(html, /name_alias_not_found/);
  assert.match(html, /missing\.eth/);
  assert.match(html, /org\.openagentinternet\.uri/);
  assert.match(html, /metaid:\/\/missing\.eth/);
});
```

- [ ] **Step 2: Run Inspector test and verify it fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/ui/browserPageInspector.test.mjs
```

Expected: FAIL because the Inspector does not render a Name Alias section.

- [ ] **Step 3: Implement alias metadata rendering**

In `packages/ui/src/browser/app.ts`, add this helper before `renderInspector`:

```js
function renderNameAliasInspector(source) {
  var raw = objectValue(source && source.raw);
  var alias = objectValue(raw.nameAlias);
  if (!Object.keys(alias).length) return '';
  return '<h3>Name Alias</h3><dl>' +
    keyValue('alias URI', alias.aliasUri) +
    keyValue('provider', alias.provider) +
    keyValue('name', alias.normalizedName) +
    keyValue('text key', alias.textKey) +
    keyValue('canonical URI', alias.canonicalUri) +
    keyValue('resolved at', alias.resolvedAt) +
    keyValue('verification', alias.verificationState) +
    '</dl>';
}
```

Add an error Inspector helper:

```js
function renderResolveErrorInspector() {
  if (!elements.inspector || !state.lastResolveError) return;
  var error = state.lastResolveError || {};
  var data = objectValue(error.data);
  elements.inspector.innerHTML = '<section class="browser-inspector-panel">' +
    '<header class="browser-panel-header"><h2>Inspector</h2><button type="button" class="browser-icon-button" data-browser-inspector-close aria-label="Close inspector">' + iconHtml('close') + '</button></header>' +
    '<div class="browser-proof-summary">' + proofIconHtml('unverified') + '<span>unverified</span></div>' +
    '<h3>Name Alias Error</h3><dl>' +
      keyValue('code', error.code) +
      keyValue('message', error.message) +
      keyValue('input URI', data.inputUri || error.inputUri) +
      keyValue('provider', data.provider) +
      keyValue('name', data.aliasName) +
      keyValue('text key', data.textKey) +
    '</dl></section>';
}
```

Initialize `state.lastResolveError` to `null`. In `resolveUri`, clear it before successful resolution and set it in the catch block:

```js
state.lastResolveError = null;
```

```js
state.lastResolveError = {
  inputUri: normalizedUri,
  code: error && error.payload && error.payload.code,
  message: error && error.message ? error.message : 'Resolve failed.',
  data: error && error.payload && error.payload.data
};
```

Update `openInspector` so failures without `state.current` can render:

```js
if (state.lastResolveError && !state.current) {
  renderResolveErrorInspector();
  return;
}
```

In `renderInspector`, insert `renderNameAliasInspector(source)` between the Source `</dl>` and `renderHomepageV3Inspector(current)`:

```js
    keyValue('schema', source.schemaVersion) +
    '</dl>' + renderNameAliasInspector(source) + renderHomepageV3Inspector(current) + (source.raw ? '<pre>' + escapeHtml(JSON.stringify(source.raw || {}, null, 2)) + '</pre>' : '') + '</section>';
```

- [ ] **Step 4: Run Inspector test and verify it passes**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/ui/browserPageInspector.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageInspector.test.mjs
git commit -m "feat: show name alias evidence in Inspector"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 8: Update Package Exports, Pack Checks, And Release Guardrails

**Files:**
- Modify: `tests/package/exportsInterop.test.mjs`
- Modify: `tests/package/packContents.test.mjs`
- Modify: `tests/release/hostNeutralGuardrails.test.mjs`
- Modify: `release/compatibility.json`

- [ ] **Step 1: Write package export expectations**

In `tests/package/exportsInterop.test.mjs`, add this package entry after core:

```js
  {
    name: '@openagentinternet/agent-browser-name-resolvers',
    exports: {
      createEnsOpenAgentInternetResolver: 'function',
    },
  },
```

In `tests/package/packContents.test.mjs`, add this workspace entry after core:

```js
  {
    name: '@openagentinternet/agent-browser-name-resolvers',
    manifestUrl: new URL('../../packages/name-resolvers/package.json', import.meta.url),
  },
```

Add package-specific pack assertions after the core or UI block:

```js
    if (workspace.name === '@openagentinternet/agent-browser-name-resolvers') {
      assertPackIncludes(files, 'dist/ens.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/ens.js', workspace.name);
    }
```

In `release/compatibility.json`, add the new package at version `0.3.0`:

```json
"@openagentinternet/agent-browser-name-resolvers": "0.3.0"
```

In `tests/release/hostNeutralGuardrails.test.mjs`, add an automated guardrail that scans `packages/core/src` and `packages/ui/src`:

```js
test('core and ui do not import ENS or Ethereum provider packages', async () => {
  const { stdout } = await execFileAsync('git', ['ls-files', 'packages/core/src', 'packages/ui/src']);
  const sourceFiles = stdout.split('\n').filter((file) => file.endsWith('.ts'));
  const forbiddenImports = [
    '@openagentinternet/agent-browser-name-resolvers',
    'viem',
    'ethers',
    'createPublicClient',
  ];
  const violations = [];

  for (const filePath of sourceFiles) {
    const contents = await readFile(path.join(repoRoot, filePath), 'utf8');
    for (const value of forbiddenImports) {
      if (contents.includes(value)) {
        violations.push(`${filePath} imports ${value}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
```

- [ ] **Step 2: Run package tests and verify current status**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && node --test tests/package/exportsInterop.test.mjs tests/package/packContents.test.mjs tests/release/hostNeutralGuardrails.test.mjs && npm run verify:release-version -- v0.3.0
```

Expected: PASS after Task 5 package wiring. A missing `dist-cjs/package.json` for name-resolvers means Task 5 did not add the package to `scripts/browser-workspaces.mjs`; fix that Task 5 file instead of special-casing `scripts/write-cjs-package-markers.mjs`.

- [ ] **Step 3: Commit Task 8**

```bash
git add tests/package/exportsInterop.test.mjs tests/package/packContents.test.mjs tests/release/hostNeutralGuardrails.test.mjs release/compatibility.json
git commit -m "chore: include name resolver package checks"
```

After the commit, post a Bob Buzz development journal for this task with `metabot buzz post --from bob`.

## Task 9: Full Verification And Closeout

**Files:**
- No new source files unless previous verification reveals a defect in files already touched by this plan.

- [ ] **Step 1: Run full verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

Expected: PASS.

- [ ] **Step 2: Run package verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
```

Expected: PASS.

- [ ] **Step 3: Run release-version verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:release-version -- v0.3.0
```

Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git status --short
git log --oneline -8
git diff --stat origin/main..HEAD
```

Expected: every changed file belongs to this plan. Existing unrelated user changes must not be reverted.

- [ ] **Step 5: Request implementation code review**

Use `superpowers:requesting-code-review` after the implementation tasks finish. Provide the reviewer:

```text
Description: ENS name alias support for Agent Browser Core.
Requirements: docs/superpowers/specs/2026-06-17-ens-name-resolution-design.md and docs/superpowers/plans/2026-06-18-ens-name-resolution.md.
Base SHA: the commit before Task 1.
Head SHA: the latest implementation commit.
```

Fix Critical and Important review findings before asking for merge or release.

## Self-Review Checklist

- Spec coverage: The plan covers same-scheme `metaid://`, `metaapp://`, and `map://` alias handling, `org.openagentinternet.uri`, provider-neutral core, optional ENS provider package, standalone wiring, Inspector evidence, settings, and package checks.
- Scope control: Full MAP rendering remains in the MAP URI plan; this plan adds a resolver hook and canonical validation for `map://` aliases.
- Core boundary: `viem` appears only in `packages/name-resolvers`; core only sees provider interfaces.
- Verification: Each task has a focused test command and commit step, and the closeout includes `npm run verify`, `verify:packages`, and `verify:release-version`.
