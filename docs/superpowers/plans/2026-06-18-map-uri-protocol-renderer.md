# MAP URI Protocol Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-neutral `map://` protocol links that resolve MetaID protocol pins through MAN, render protocol detail with the official renderer pack, and expose conversation navigation through trusted host actions.

**Architecture:** Core parses MAP URIs, resolves protocol pins through the configured MAN node, and returns normalized protocol resources without importing host code. UI renders protocol resources through a first-party renderer package and forwards `open-conversation` as a trusted action. OAC implements the host action in its adapter after ABC exposes the contract; IDBots and standalone remain decoupled.

**Tech Stack:** TypeScript workspace packages, Node.js 20.20.0, built-in `node:test`, ABC host-contract/core/ui/host-standalone packages, first-party renderer package, OAC host adapter follow-up.

---

## File Structure

- Modify `package.json`
  - Add `packages/renderers` to ESM and CJS build order before `packages/ui`.
- Modify `package-lock.json`
  - Refresh workspace metadata after adding `packages/renderers`.
- Modify `scripts/browser-workspaces.mjs`
  - Add the renderer workspace so package verification and publish helpers include it.
- Modify `release/compatibility.json`
  - Add `@openagentinternet/agent-browser-renderers` to the release compatibility package set.
- Modify `packages/host-contract/src/index.ts`
  - Add protocol resource, protocol renderer, host-action renderer, and `open-conversation` action contract fields.
- Modify `packages/test-harness/src/index.ts`
  - Accept the new resource, renderer, and action enum values in conformance checks.
- Modify `tests/host-contract/conformance.test.mjs`
  - Prove protocol resources and `open-conversation` actions are accepted.
- Modify `tests/test-harness/commandResultShape.test.mjs`
  - Prove follow-up actions with conversation hrefs stay shape-compatible.
- Modify `packages/core/src/uri/browserUri.ts`
  - Add `map` as a supported Browser URI scheme and normalize `[N]` MAP history shorthand.
- Create `packages/core/src/browser/mapUri.ts`
  - Parse MAP authority/path/query into protocol pin and conversation targets.
- Create `packages/core/src/browser/mapProtocolResolver.ts`
  - Resolve MAP protocol pins through MAN and build Browser resource envelopes.
- Modify `packages/core/src/browser/types.ts`
  - Mirror MAP resource/action types used by core.
- Modify `packages/core/src/browser/browserResolver.ts`
  - Dispatch `map://` URIs to the MAP resolver.
- Modify `packages/core/src/browser/botPageResolver.ts`
  - Add a host-neutral `Conversation` action that points at `map://simplemsg/conversation?peer={globalMetaId}`.
- Modify `packages/core/src/index.ts` and `packages/core/src/browser/uri.ts`
  - Export MAP parser and resolver helpers.
- Modify `tests/core/uri.test.mjs` and `tests/browser/uri.test.mjs`
  - Cover MAP URI normalization and invalid input.
- Create `tests/browser/mapProtocolResolver.test.mjs`
  - Cover MAN resolution, version fields, protocol path validation, unknown protocol generic rendering, and conversation resources.
- Modify `tests/browser/browserResolver.test.mjs`
  - Cover `resolveBrowserResource` dispatch for `map://` URIs.
- Modify `tests/browser/botHomepageResolver.test.mjs`
  - Cover Bot Page `Message` and `Conversation` action payloads.
- Create `packages/renderers/package.json`
  - Publishable first-party renderer pack manifest.
- Create `packages/renderers/tsconfig.json` and `packages/renderers/tsconfig.cjs.json`
  - ESM and CJS TypeScript builds.
- Create `packages/renderers/src/index.ts`
  - Export renderer registry and protocol renderer functions.
- Modify `packages/ui/package.json`
  - Depend on `@openagentinternet/agent-browser-renderers`.
- Modify `packages/ui/tsconfig.json` and `packages/ui/tsconfig.cjs.json`
  - Reference the renderer package for ESM builds and allow CJS package resolution.
- Modify `packages/ui/src/renderers.ts`
  - Render `protocol-pin` and `host-action` renderer descriptors through the first-party registry.
- Modify `packages/ui/src/browser/app.ts`
  - Normalize Browser address/history to resolved `map://...?...` URIs, render action results, and preserve existing private-chat modal behavior.
- Modify `tests/ui/renderers.test.mjs`
  - Cover SimpleBuzz, skill-service, generic protocol pin, and host-action rendering.
- Modify `tests/ui/browserPageRenderers.test.mjs`
  - Cover Bot Page buzz/service summary links to MAP URIs.
- Modify `tests/ui/browserPageActions.test.mjs`
  - Cover `open-conversation` trusted action dispatch and private-chat follow-up href display.
- Modify `tests/ui/browserPageState.test.mjs`
  - Cover `/browser/map/{protocol}/...` path decoding and query preservation in the shared Browser UI.
- Modify `tests/release/publishPackages.test.mjs`
  - Update dry-run publish order expectations for the renderer workspace.
- Modify `packages/host-standalone/src/server.ts`
  - Allow `/browser/map/{protocol}/...` to serve the Browser shell.
- Modify `tests/browser/browserStandaloneServer.test.mjs` and `tests/host-standalone/standaloneServer.test.mjs`
  - Cover standalone MAP deep links and standalone `open-conversation` manual action fallback.
- Modify `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/hostTypes.ts`
  - Add OAC-local `open-conversation` action type after ABC package update or local dev link.
- Modify `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserHostAdapter.ts`
  - Add `message-view` actor capability and map `open-conversation` to `/ui/conversations?local=...&peer=...`.
- Modify `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserCoreBridge.ts`
  - Whitelist `open-conversation` and preserve `href` action data.
- Modify `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/defaultHandlers.ts`
  - Return conversation href from successful private-chat sends when an A2A session id or peer is available.
- Modify OAC tests under `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/daemon/`
  - Cover OAC adapter action mapping, bridge passthrough, and private-chat follow-up href.

## Before You Start

- [ ] **Step 1: Confirm the working tree and Node runtime**

Run:

```bash
git status --short --branch
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --version
```

Expected: `git status --short --branch` prints a branch line starting with `##`, and `node --version` prints `v20.20.0`.

If `packages/ui/src/browser/app.ts` or `tests/ui/browserPageRenderers.test.mjs` already has unrelated local changes, read them before editing and preserve them. This repo currently allows unrelated dirty files, but each task must stage only the files changed for that task.

- [ ] **Step 2: Use an isolated execution branch when implementing**

Run:

```bash
git switch -c codex/map-uri-protocol-renderer
```

Expected: Git creates and switches to `codex/map-uri-protocol-renderer`.

## Task 1: Browser Contract for Protocol Resources and Conversation Actions

**Files:**
- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Modify: `tests/host-contract/conformance.test.mjs`
- Modify: `tests/test-harness/commandResultShape.test.mjs`

- [ ] **Step 1: Write failing contract tests**

In `tests/host-contract/conformance.test.mjs`, add:

```js
test('host conformance accepts protocol resources and open-conversation actions', async () => {
  const adapter = createConformantAdapter({
    async resolveResource(input) {
      return browserSuccess(createResolveResult(input.uri, {
        resourceType: 'protocol',
        title: 'Protocol Buzz',
        renderer: {
          type: 'protocol-pin',
          contentType: 'application/json',
          data: {
            rendererId: 'simplebuzz.detail',
            protocolPath: '/protocols/simplebuzz',
          },
        },
        actions: [{
          id: 'open-conversation',
          label: 'Conversation',
          kind: 'open-conversation',
          enabled: true,
          requiresUsingIdentity: true,
          payload: {
            conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
            peerGlobalMetaId: 'idq1peer',
          },
        }],
        proof: {
          pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          protocolPath: '/protocols/simplebuzz',
          verificationState: 'partial',
        },
      }));
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
  });
});
```

In `tests/test-harness/commandResultShape.test.mjs`, add:

```js
test('Browser command shape accepts conversation href follow-up actions', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserManualActionRequired('identity_required', 'Select a local Bot.', {
      action: {
        label: 'Open conversation',
        href: '/ui/conversations?local=idq1local&peer=idq1peer',
      },
      data: {
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      },
    }),
    'open-conversation',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/host-contract/conformance.test.mjs \
  tests/test-harness/commandResultShape.test.mjs
```

Expected: conformance fails because `protocol`, `protocol-pin`, and `open-conversation` are not accepted enum values.

- [ ] **Step 3: Extend host-contract types**

In `packages/host-contract/src/index.ts`, update the relevant unions:

```ts
export type BrowserActorCapability =
  | 'private-chat'
  | 'service-call'
  | 'wallet-sign'
  | 'payment'
  | 'template-settings'
  | 'profile-management'
  | 'chat-configuration'
  | 'resource-sharing'
  | 'message-view';

export type BrowserTrustedActionKind =
  | 'private-chat'
  | 'service-call'
  | 'copy-uri'
  | 'open-settings'
  | 'login'
  | 'wallet-sign'
  | 'payment'
  | 'edit-profile'
  | 'configure-chat'
  | 'view-messages'
  | 'open-conversation'
  | 'share-resource';

export type BrowserResourceType =
  | 'bot'
  | 'metaapp'
  | 'document'
  | 'image'
  | 'pdf'
  | 'protocol'
  | 'conversation'
  | 'unsupported'
  | 'unknown';

export type BrowserRendererType =
  | 'bot-page'
  | 'html-iframe'
  | 'pdf'
  | 'image'
  | 'video'
  | 'protocol-pin'
  | 'host-action'
  | 'unsupported';

export type BrowserResolveActionKind =
  | 'private-chat'
  | 'service-list'
  | 'service-call'
  | 'copy'
  | 'proof'
  | 'creator'
  | 'open-conversation';
```

Add a typed payload export near the trusted action types:

```ts
export interface BrowserOpenConversationPayload {
  conversationUri: string;
  peerGlobalMetaId: string;
  peerName?: string;
  initialComposerText?: string;
}
```

- [ ] **Step 4: Extend test-harness enum allowlists**

In `packages/test-harness/src/index.ts`, update constants:

```ts
const RESOURCE_TYPES = ['bot', 'metaapp', 'document', 'image', 'pdf', 'protocol', 'conversation', 'unsupported', 'unknown'];
const RENDERER_TYPES = ['bot-page', 'html-iframe', 'pdf', 'image', 'video', 'protocol-pin', 'host-action', 'unsupported'];
const RESOURCE_ACTION_KINDS = ['private-chat', 'service-list', 'service-call', 'copy', 'proof', 'creator', 'open-conversation'];
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/host-contract/conformance.test.mjs \
  tests/test-harness/commandResultShape.test.mjs
```

Expected: targeted tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/host-contract/src/index.ts \
  packages/test-harness/src/index.ts \
  tests/host-contract/conformance.test.mjs \
  tests/test-harness/commandResultShape.test.mjs
git commit -m "feat: add protocol browser action contract"
```

Post a Bob development journal for this commit using the repo's `metabot-post-buzz` procedure. The request JSON for that post must name the commit hash, changed files, verification commands, and result.

## Task 2: MAP URI Parser and Canonical Normalization

**Files:**
- Modify: `packages/core/src/uri/browserUri.ts`
- Create: `packages/core/src/browser/mapUri.ts`
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/browser/uri.ts`
- Modify: `tests/core/uri.test.mjs`
- Modify: `tests/browser/uri.test.mjs`

- [ ] **Step 1: Write failing parser tests**

In `tests/browser/uri.test.mjs`, extend the scheme normalization test:

```js
  assert.deepEqual(parseBrowserUri(' map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0[0] '), {
    originalUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0[0]',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=0',
    scheme: 'map',
    id: 'simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=0',
  });
```

Create parser-specific tests in `tests/core/uri.test.mjs` or add to the existing file:

```js
test('parseMapUri parses protocol pins and conversation targets', () => {
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

test('parseMapUri rejects aliases, empty paths, and invalid history selectors', () => {
  assert.throws(() => core.parseMapUri('map://buzz/pin/abc'), /pinId/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc[-1]'), /history/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc?version=latest'), /version/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation'), /peer/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/render/abc'), /unsupported MAP path/i);
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/core/uri.test.mjs \
  tests/browser/uri.test.mjs
```

Expected: tests fail because `map` and `parseMapUri` are not implemented.

- [ ] **Step 3: Add MAP parser types**

In `packages/core/src/browser/types.ts`, update `BrowserUriScheme`, `BrowserResourceType`, `BrowserRendererType`, and `BrowserTrustedAction.kind` with the same values added in Task 1.

Add these exported interfaces:

```ts
export type MapUriTargetKind = 'pin' | 'conversation';
export type MapPinVersionSelector = 'latest' | 'history-index' | 'exact';

export interface MapResolvedPinVersion {
  requestedPinId: string;
  rootPinId?: string;
  resolvedPinId: string;
  versionSelector: MapPinVersionSelector;
  historyIndex?: number;
}

export interface ParsedMapPinUri {
  originalUri: string;
  normalizedUri: string;
  authority: string;
  protocolPath: string;
  targetKind: 'pin';
  pinId: string;
  versionSelector: 'latest' | 'history-index';
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

- [ ] **Step 4: Implement `parseMapUri`**

Create `packages/core/src/browser/mapUri.ts`:

```ts
import type { ParsedMapUri } from './types.js';

const PIN_ID_PATTERN = /^[0-9a-f]{64}i[0-9]+$/iu;
const AUTHORITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const GLOBAL_META_ID_LIKE_PATTERN = /^id[qpzryt]1[023456789acdefghjklmnpqrstuvwxyz]+$/iu;

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeAuthority(value: string): string {
  const authority = cleanText(value).toLowerCase();
  if (!AUTHORITY_PATTERN.test(authority)) {
    throw new Error('MAP URI authority must be a protocol segment such as simplebuzz or skill-service.');
  }
  return authority;
}

function protocolPath(authority: string): string {
  return `/protocols/${authority}`;
}

function readVersion(searchParams: URLSearchParams): { versionSelector: 'latest' | 'history-index'; historyIndex?: number } {
  const version = searchParams.get('version');
  if (version == null || version === '') {
    return { versionSelector: 'latest' };
  }
  if (!/^[0-9]+$/u.test(version)) {
    throw new Error('MAP URI version must be a non-negative history index.');
  }
  return { versionSelector: 'history-index', historyIndex: Number(version) };
}

function normalizePinPath(pathname: string): { pathname: string; historyIndex?: number } {
  const match = pathname.match(/^(\/pin\/[^/?#\[\]]+)\[([0-9]+)\]$/u);
  if (!match) {
    if (/\[[^\]]*\]/u.test(pathname)) {
      throw new Error('MAP URI history shorthand must use a non-negative index such as [0].');
    }
    return { pathname };
  }
  return { pathname: match[1], historyIndex: Number(match[2]) };
}

export function parseMapUri(input: string): ParsedMapUri {
  const originalUri = cleanText(input);
  let url: URL;
  try {
    url = new URL(originalUri);
  } catch {
    throw new Error('Enter a complete MAP URI such as map://simplebuzz/pin/{pinId}.');
  }
  if (url.protocol !== 'map:') {
    throw new Error('MAP parser requires a map:// URI.');
  }

  const authority = normalizeAuthority(url.hostname);
  const normalizedPath = normalizePinPath(url.pathname);
  if (normalizedPath.historyIndex !== undefined) {
    if (url.searchParams.has('version')) {
      throw new Error('MAP URI must not combine [N] history shorthand with version query.');
    }
    url.searchParams.set('version', String(normalizedPath.historyIndex));
  }

  if (normalizedPath.pathname.startsWith('/pin/')) {
    const pinId = decodeURIComponent(normalizedPath.pathname.slice('/pin/'.length)).toLowerCase();
    if (!PIN_ID_PATTERN.test(pinId)) {
      throw new Error('MAP protocol pin target requires a 64-hex pinId ending in iN.');
    }
    const version = readVersion(url.searchParams);
    const normalizedUri = `map://${authority}/pin/${pinId}${version.versionSelector === 'history-index' ? `?version=${version.historyIndex}` : ''}`;
    return {
      originalUri,
      normalizedUri,
      authority,
      protocolPath: protocolPath(authority),
      targetKind: 'pin',
      pinId,
      ...version,
    };
  }

  if (authority === 'simplemsg' && normalizedPath.pathname === '/conversation') {
    const peerGlobalMetaId = cleanText(url.searchParams.get('peer'));
    if (!GLOBAL_META_ID_LIKE_PATTERN.test(peerGlobalMetaId)) {
      throw new Error('MAP conversation target requires a peer Global MetaID.');
    }
    return {
      originalUri,
      normalizedUri: `map://simplemsg/conversation?peer=${encodeURIComponent(peerGlobalMetaId)}`,
      authority: 'simplemsg',
      protocolPath: '/protocols/simplemsg',
      targetKind: 'conversation',
      peerGlobalMetaId,
    };
  }

  throw new Error(`Unsupported MAP path: ${normalizedPath.pathname || '/'}.`);
}
```

- [ ] **Step 5: Wire `map` into generic Browser URI parsing**

In `packages/core/src/uri/browserUri.ts`, update the scheme union and supported set:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp' | 'metafile' | 'map';

const SUPPORTED_SCHEMES = new Set<BrowserUriScheme>(['metaid', 'metaapp', 'metafile', 'map']);
```

Import `parseMapUri`:

```ts
import { parseMapUri } from '../browser/mapUri.js';
```

Before returning from `parseBrowserUri`, add:

```ts
  if (scheme === 'map') {
    const parsed = parseMapUri(originalUri);
    return {
      originalUri,
      normalizedUri: parsed.normalizedUri,
      scheme,
      id: parsed.normalizedUri.slice('map://'.length),
    };
  }
```

- [ ] **Step 6: Export MAP helpers**

In `packages/core/src/index.ts`, add:

```ts
export * from './browser/mapUri.js';
```

In `packages/core/src/browser/uri.ts`, add:

```ts
export {
  parseMapUri,
} from './mapUri.js';
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/core/uri.test.mjs \
  tests/browser/uri.test.mjs
```

Expected: parser tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/core/src/uri/browserUri.ts \
  packages/core/src/browser/mapUri.ts \
  packages/core/src/browser/types.ts \
  packages/core/src/index.ts \
  packages/core/src/browser/uri.ts \
  tests/core/uri.test.mjs \
  tests/browser/uri.test.mjs
git commit -m "feat: parse map protocol uris"
```

Post a Bob development journal for this commit.

## Task 3: MAN-Backed MAP Protocol Pin Resolver

**Files:**
- Create: `packages/core/src/browser/mapProtocolResolver.ts`
- Modify: `packages/core/src/browser/browserResolver.ts`
- Modify: `packages/core/src/browser/botPageResolver.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/browser/mapProtocolResolver.test.mjs`
- Modify: `tests/browser/browserResolver.test.mjs`
- Modify: `tests/browser/botHomepageResolver.test.mjs`

- [ ] **Step 1: Write failing resolver tests**

Create `tests/browser/mapProtocolResolver.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  resolveMapUriToResource,
} = require('../../packages/core/dist/browser/mapProtocolResolver.js');

const buzzPinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const resolvedBuzzPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

function manPin(overrides = {}) {
  return {
    id: resolvedBuzzPinId,
    pinId: resolvedBuzzPinId,
    rootPinId: buzzPinId,
    path: '/protocols/simplebuzz',
    operation: 'create',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json',
    content: JSON.stringify({
      content: 'Full buzz text',
      images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
    }),
    txid: resolvedBuzzPinId.slice(0, 64),
    chain: 'mvc',
    ownerAddress: '1FixtureAddress',
    ownerGlobalMetaId: 'idq1publisher',
    timestamp: 1780760000,
    ...overrides,
  };
}

test('resolveMapUriToResource resolves latest protocol pin through MAN', async () => {
  const calls = [];
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { pin: manPin() } }),
      };
    },
    now: () => 1780760000000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${buzzPinId}`]);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${buzzPinId}`);
  assert.equal(result.data.resourceType, 'protocol');
  assert.equal(result.data.renderer.type, 'protocol-pin');
  assert.equal(result.data.renderer.data.rendererId, 'simplebuzz.detail');
  assert.equal(result.data.renderer.data.protocolPath, '/protocols/simplebuzz');
  assert.equal(result.data.renderer.data.version.requestedPinId, buzzPinId);
  assert.equal(result.data.renderer.data.version.resolvedPinId, resolvedBuzzPinId);
  assert.equal(result.data.renderer.data.version.versionSelector, 'latest');
  assert.equal(result.data.proof.pinId, resolvedBuzzPinId);
  assert.equal(result.data.proof.protocolPath, '/protocols/simplebuzz');
});

test('resolveMapUriToResource forwards canonical history index to MAN', async () => {
  const calls = [];
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}[0]`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: manPin({ id: buzzPinId, pinId: buzzPinId }) }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${buzzPinId}?version=0`]);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${buzzPinId}?version=0`);
  assert.equal(result.data.renderer.data.version.versionSelector, 'history-index');
  assert.equal(result.data.renderer.data.version.historyIndex, 0);
});

test('resolveMapUriToResource parses SimpleBuzz payload from contentSummary when content is empty', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: manPin({
          content: '',
          contentSummary: JSON.stringify({
            content: 'Summary buzz text',
            images: ['metafile://summary-image-pin'],
          }),
        }),
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.data.payload.content, 'Summary buzz text');
  assert.deepEqual(result.data.renderer.data.payload.images, ['metafile://summary-image-pin']);
  assert.equal(result.data.renderer.data.contentSummary.content, 'Summary buzz text');
});

test('resolveMapUriToResource parses skill-service payload from contentSummary', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://skill-service/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: manPin({
          path: '/protocols/skill-service',
          content: '',
          contentSummary: {
            name: 'Evidence Skill',
            description: 'Finds evidence.',
            inputSchema: { task: 'string' },
          },
        }),
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.data.rendererId, 'skill-service.detail');
  assert.equal(result.data.renderer.data.payload.name, 'Evidence Skill');
  assert.deepEqual(result.data.renderer.data.payload.inputSchema, { task: 'string' });
});

test('resolveMapUriToResource rejects protocol path mismatch', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: manPin({ path: '/protocols/skill-service' }) }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_protocol_mismatch');
});

test('resolveMapUriToResource creates open-conversation resource for simplemsg conversation URI', async () => {
  const result = await resolveMapUriToResource({
    uri: 'map://simplemsg/conversation?peer=idq1peer',
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => {
      throw new Error('conversation URI should not fetch MAN pin content');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'conversation');
  assert.equal(result.data.renderer.type, 'host-action');
  assert.equal(result.data.actions[0].kind, 'open-conversation');
  assert.equal(result.data.actions[0].payload.peerGlobalMetaId, 'idq1peer');
});
```

In `tests/browser/browserResolver.test.mjs`, add:

```js
test('resolveBrowserResource dispatches map URI to protocol resolver', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const result = await resolveBrowserResource({
    uri: `map://unknown-protocol/pin/${pinId}`,
    config: browserConfig(),
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/protocols/unknown-protocol',
            operation: 'create',
            contentType: 'text/plain',
            content: 'raw protocol body',
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'protocol-pin');
  assert.equal(result.data.renderer.data.rendererId, 'generic.protocol-pin');
});
```

In `tests/browser/botHomepageResolver.test.mjs`, extend `buildBotPageResolveResult maps homepage JSON into BrowserResolveResult`:

```js
  const message = result.actions.find((action) => action.id === 'message');
  assert.equal(message.kind, 'private-chat');
  assert.equal(message.payload.targetGlobalMetaId, 'idq1fixturebot');

  const conversation = result.actions.find((action) => action.id === 'conversation');
  assert.deepEqual(conversation, {
    id: 'conversation',
    label: 'Conversation',
    kind: 'open-conversation',
    enabled: true,
    requiresUsingIdentity: true,
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1fixturebot',
      peerGlobalMetaId: 'idq1fixturebot',
      peerName: 'Fixture Bot',
    },
  });
```

- [ ] **Step 2: Run resolver tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/browser/mapProtocolResolver.test.mjs \
  tests/browser/browserResolver.test.mjs \
  tests/browser/botHomepageResolver.test.mjs
```

Expected: MAP resolver import fails, dispatch behavior fails, and Bot Page action checks fail because `open-conversation` is not emitted.

- [ ] **Step 3: Implement MAP protocol resolver**

Create `packages/core/src/browser/mapProtocolResolver.ts`:

```ts
import {
  browserCommandFailed,
  browserCommandSuccess,
  type BrowserCommandResult,
  type BrowserResolveResult,
  type MapResolvedPinVersion,
} from './types.js';
import { parseMapUri } from './mapUri.js';

type FetchResponse = { ok: boolean; status: number; json?(): Promise<unknown> };
type FetchFn = (url: string) => Promise<FetchResponse>;

const DEFAULT_MANAPI_BASE_URL = 'https://manapi.metaid.io';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unwrapPinRecord(payload: unknown): Record<string, unknown> | null {
  const root = record(payload);
  const data = record(root?.data);
  return record(data?.pin) ?? data ?? root;
}

function baseUrl(value: unknown): string {
  return (text(value) || DEFAULT_MANAPI_BASE_URL).replace(/\/+$/u, '') || DEFAULT_MANAPI_BASE_URL;
}

function parsePayload(content: unknown, contentType: string): unknown {
  if (record(content)) return content;
  const raw = text(content);
  if (!raw) return '';
  if (contentType.includes('json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = parsePayload(value, 'application/json');
  return record(parsed);
}

function contentSummary(pinRecord: Record<string, unknown>): Record<string, unknown> | null {
  return parseJsonObject(pinRecord.contentSummary ?? pinRecord.content_summary ?? pinRecord.summary);
}

function mergePayload(contentPayload: unknown, summaryPayload: Record<string, unknown> | null): unknown {
  const payloadRecord = record(contentPayload);
  if (payloadRecord && summaryPayload) return { ...summaryPayload, ...payloadRecord };
  if (payloadRecord) return payloadRecord;
  if (summaryPayload) return summaryPayload;
  return contentPayload;
}

function rendererId(protocolPath: string): string {
  if (protocolPath === '/protocols/simplebuzz') return 'simplebuzz.detail';
  if (protocolPath === '/protocols/skill-service') return 'skill-service.detail';
  return 'generic.protocol-pin';
}

function pinIdFromRecord(pinRecord: Record<string, unknown>, fallback: string): string {
  return text(pinRecord.pinId ?? pinRecord.id ?? pinRecord.pin_id) || fallback;
}

function buildConversationResult(uri: string): BrowserCommandResult<BrowserResolveResult> {
  const parsed = parseMapUri(uri);
  if (parsed.targetKind !== 'conversation') {
    return browserCommandFailed('invalid_browser_uri', 'MAP conversation result requires a conversation URI.');
  }
  return browserCommandSuccess({
    uri: parsed.originalUri,
    normalizedUri: parsed.normalizedUri,
    resourceType: 'conversation',
    title: 'Conversation',
    owner: {
      kind: 'unknown',
      globalMetaId: parsed.peerGlobalMetaId,
      name: parsed.peerGlobalMetaId,
      verificationState: 'partial',
    },
    renderer: {
      type: 'host-action',
      contentType: 'application/vnd.openagent.browser.host-action+json',
      data: {
        actionKind: 'open-conversation',
        actionId: 'open-conversation',
      },
    },
    status: { state: 'resolved', verificationState: 'partial', message: 'Conversation action is ready.' },
    source: { resolver: 'map-conversation' },
    actions: [{
      id: 'open-conversation',
      label: 'Conversation',
      kind: 'open-conversation',
      enabled: true,
      requiresUsingIdentity: true,
      payload: {
        conversationUri: parsed.normalizedUri,
        peerGlobalMetaId: parsed.peerGlobalMetaId,
      },
    }],
  });
}

export interface ResolveMapUriToResourceInput {
  uri: string;
  manApiBaseUrl?: string;
  fetch?: FetchFn;
  now?: () => number;
}

export async function resolveMapUriToResource(input: ResolveMapUriToResourceInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
  const parsed = parseMapUri(input.uri);
  if (parsed.targetKind === 'conversation') {
    return buildConversationResult(parsed.normalizedUri);
  }

  const fetchImpl = input.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return browserCommandFailed('browser_resolve_failed', 'A fetch implementation is required to resolve MAP protocol pins.');
  }

  const url = `${baseUrl(input.manApiBaseUrl)}/pin/${encodeURIComponent(parsed.pinId)}${parsed.versionSelector === 'history-index' ? `?version=${parsed.historyIndex}` : ''}`;
  const response = await fetchImpl(url);
  if (!response.ok || !response.json) {
    return browserCommandFailed(
      response.status === 404 ? 'browser_resource_not_found' : 'browser_resolve_failed',
      response.status === 404 ? 'Protocol pin was not found.' : `Protocol pin lookup failed with HTTP ${response.status}.`,
    );
  }

  const pinRecord = unwrapPinRecord(await response.json());
  if (!pinRecord) {
    return browserCommandFailed('browser_resource_not_found', 'Protocol pin was not found.');
  }

  const protocolPath = text(pinRecord.path);
  if (protocolPath !== parsed.protocolPath) {
    return browserCommandFailed(
      'browser_protocol_mismatch',
      `MAP URI expected ${parsed.protocolPath} but MAN returned ${protocolPath || '<empty>'}.`,
    );
  }

  const resolvedPinId = pinIdFromRecord(pinRecord, parsed.pinId);
  const version: MapResolvedPinVersion = {
    requestedPinId: parsed.pinId,
    rootPinId: text(pinRecord.rootPinId ?? pinRecord.root_pin_id) || undefined,
    resolvedPinId,
    versionSelector: parsed.versionSelector,
    ...(parsed.historyIndex !== undefined ? { historyIndex: parsed.historyIndex } : {}),
  };
  const contentType = text(pinRecord.contentType ?? pinRecord.content_type) || 'application/octet-stream';
  const summaryPayload = contentSummary(pinRecord);
  const contentPayload = parsePayload(pinRecord.content ?? pinRecord.payload, contentType);
  const payload = mergePayload(contentPayload, summaryPayload);
  const ownerGlobalMetaId = text(pinRecord.ownerGlobalMetaId ?? pinRecord.globalMetaId ?? pinRecord.global_meta_id ?? pinRecord.metaid ?? pinRecord.metaId);
  const ownerAddress = text(pinRecord.ownerAddress ?? pinRecord.address);

  return browserCommandSuccess({
    uri: parsed.originalUri,
    normalizedUri: parsed.normalizedUri,
    resourceType: 'protocol',
    title: text((record(payload) ?? {}).title) || text((record(payload) ?? {}).name) || `${parsed.authority} protocol pin`,
    owner: {
      kind: 'unknown',
      globalMetaId: ownerGlobalMetaId || undefined,
      address: ownerAddress || undefined,
      name: ownerGlobalMetaId || ownerAddress || 'Unknown publisher',
      verificationState: 'partial',
    },
    renderer: {
      type: 'protocol-pin',
      contentType,
      data: {
        rendererId: rendererId(parsed.protocolPath),
        authority: parsed.authority,
        protocolPath: parsed.protocolPath,
        version,
        payload,
        rawPayload: pinRecord.content ?? pinRecord.payload ?? pinRecord.contentSummary ?? pinRecord.content_summary ?? '',
        contentSummary: summaryPayload ?? undefined,
        pin: pinRecord,
      },
    },
    status: { state: 'resolved', verificationState: 'partial', message: 'Protocol pin resolved.' },
    proof: {
      txid: text(pinRecord.txid) || undefined,
      pinId: resolvedPinId,
      protocolPath: parsed.protocolPath,
      publisherGlobalMetaId: ownerGlobalMetaId || undefined,
      verificationState: 'partial',
      details: {
        requestedPinId: parsed.pinId,
        rootPinId: version.rootPinId,
        versionSelector: version.versionSelector,
        historyIndex: version.historyIndex,
        operation: text(pinRecord.operation) || undefined,
        encryption: text(pinRecord.encryption) || undefined,
        version: text(pinRecord.version) || undefined,
        chainName: text(pinRecord.chainName ?? pinRecord.chain) || undefined,
      },
    },
    source: { resolver: 'map-protocol-pin', url, raw: pinRecord },
    actions: [],
  });
}
```

- [ ] **Step 4: Dispatch MAP URIs from the Browser resolver**

In `packages/core/src/browser/browserResolver.ts`, import:

```ts
import { resolveMapUriToResource } from './mapProtocolResolver.js';
```

Add this branch before the metafile branch:

```ts
  if (parsed.scheme === 'map') {
    return resolveMapUriToResource({
      uri: parsed.normalizedUri,
      fetch: input.fetch,
      manApiBaseUrl: input.config.manApiBaseUrl,
    });
  }
```

In `packages/core/src/index.ts`, add:

```ts
export * from './browser/mapProtocolResolver.js';
```

- [ ] **Step 5: Add Bot Page conversation action**

In `packages/core/src/browser/botPageResolver.ts`, allow normalized homepage actions to preserve `open-conversation`:

```ts
  if (!id || !label || !['private-chat', 'service-list', 'service-call', 'copy', 'proof', 'creator', 'open-conversation'].includes(kind)) {
    return null;
  }
```

Change `mergeActions` to receive peer identity:

```ts
function mergeActions(input: {
  rawActions: unknown;
  normalizedUri: string;
  peerGlobalMetaId: string;
  peerName: string;
}): BrowserTrustedAction[] {
  const actions = new Map<string, BrowserTrustedAction>();
  const homepageActions = Array.isArray(input.rawActions) ? input.rawActions : [];
  for (const rawAction of homepageActions) {
    const action = normalizeAction(rawAction);
    if (action) {
      actions.set(action.id, action);
    }
  }

  const defaultActions: BrowserTrustedAction[] = [
    {
      id: 'message',
      label: 'Message',
      kind: 'private-chat',
      enabled: true,
      requiresUsingIdentity: true,
      payload: { targetGlobalMetaId: input.peerGlobalMetaId },
    },
    { id: 'services', label: 'Services', kind: 'service-list', enabled: true, requiresUsingIdentity: true },
    { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: input.normalizedUri },
  ];

  if (input.peerGlobalMetaId) {
    defaultActions.splice(1, 0, {
      id: 'conversation',
      label: 'Conversation',
      kind: 'open-conversation',
      enabled: true,
      requiresUsingIdentity: true,
      payload: {
        conversationUri: `map://simplemsg/conversation?peer=${encodeURIComponent(input.peerGlobalMetaId)}`,
        peerGlobalMetaId: input.peerGlobalMetaId,
        ...(input.peerName ? { peerName: input.peerName } : {}),
      },
    });
  }

  for (const action of defaultActions) {
    if (!actions.has(action.id)) {
      actions.set(action.id, action);
    }
  }

  return [...actions.values()];
}
```

Update the `buildBotPageResolveResult` call site:

```ts
    actions: mergeActions({
      rawActions: input.homepage.actions,
      normalizedUri: input.normalizedUri,
      peerGlobalMetaId: globalMetaId,
      peerName: title,
    }),
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/browser/mapProtocolResolver.test.mjs \
  tests/browser/browserResolver.test.mjs \
  tests/browser/botHomepageResolver.test.mjs
```

Expected: MAP resolver and dispatch tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/core/src/browser/mapProtocolResolver.ts \
  packages/core/src/browser/browserResolver.ts \
  packages/core/src/browser/botPageResolver.ts \
  packages/core/src/index.ts \
  tests/browser/mapProtocolResolver.test.mjs \
  tests/browser/browserResolver.test.mjs \
  tests/browser/botHomepageResolver.test.mjs
git commit -m "feat: resolve map protocol pins"
```

Post a Bob development journal for this commit.

## Task 4: Official Protocol Renderer Pack

**Files:**
- Create: `packages/renderers/package.json`
- Create: `packages/renderers/tsconfig.json`
- Create: `packages/renderers/tsconfig.cjs.json`
- Create: `packages/renderers/src/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/browser-workspaces.mjs`
- Modify: `release/compatibility.json`
- Modify: `tests/package/exportsInterop.test.mjs`
- Modify: `tests/package/packContents.test.mjs`
- Modify: `tests/release/publishPackages.test.mjs`
- Create: `tests/renderers/protocolRenderers.test.mjs`

- [ ] **Step 1: Write failing renderer package tests**

Create `tests/renderers/protocolRenderers.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const renderers = await import('../../packages/renderers/dist/index.js');

function protocolResource(rendererId, payload, overrides = {}) {
  return {
    uri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'protocol',
    title: 'Protocol Detail',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'protocol-pin',
      contentType: 'application/json',
      data: {
        rendererId,
        protocolPath: '/protocols/simplebuzz',
        payload,
        rawPayload: JSON.stringify(payload),
        version: {
          requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          resolvedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          versionSelector: 'latest',
        },
        ...overrides,
      },
    },
    actions: [],
    sections: [],
  };
}

test('SimpleBuzz renderer shows full text and media links', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('simplebuzz.detail', {
    content: 'Full buzz text with every paragraph.',
    images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
  }));

  assert.match(html, /browser-protocol-detail/);
  assert.match(html, /Full buzz text with every paragraph/);
  assert.match(html, /metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0/);
});

test('Skill service renderer shows service fields', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('skill-service.detail', {
    name: 'Research Skill',
    description: 'Finds evidence.',
    price: '0.01 SPACE',
    inputSchema: { task: 'string' },
  }, { protocolPath: '/protocols/skill-service' }));

  assert.match(html, /Research Skill/);
  assert.match(html, /Finds evidence/);
  assert.match(html, /0\.01 SPACE/);
  assert.match(html, /inputSchema/);
});

test('Generic renderer escapes raw payload and displays version identity', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('generic.protocol-pin', '<script>alert(1)</script>', {
    protocolPath: '/protocols/unknown',
  }));

  assert.match(html, /generic protocol/i);
  assert.match(html, /requestedPinId/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
```

Add package export checks in `tests/package/exportsInterop.test.mjs`:

```js
  {
    name: '@openagentinternet/agent-browser-renderers',
    exports: {
      DEFAULT_PROTOCOL_RENDERERS: 'object',
      renderProtocolPinHtml: 'function',
    },
  },
```

Insert this object in the existing `PACKAGES` array after `@openagentinternet/agent-browser-core` and before `@openagentinternet/agent-browser-ui`.

Add the renderer workspace to `tests/package/packContents.test.mjs`:

```js
  {
    name: '@openagentinternet/agent-browser-renderers',
    manifestUrl: new URL('../../packages/renderers/package.json', import.meta.url),
  },
```

Insert this object in the existing `WORKSPACES` array after `@openagentinternet/agent-browser-core` and before `@openagentinternet/agent-browser-ui`.

Update `tests/release/publishPackages.test.mjs` so the dry-run order includes the renderer package after core and before UI:

```js
"DRY RUN publish @openagentinternet/agent-browser-renderers@0.3.0",
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/renderers/protocolRenderers.test.mjs \
  tests/package/exportsInterop.test.mjs
```

Expected: build fails because `packages/renderers` does not exist.

- [ ] **Step 3: Add renderer package manifest and build config**

Create `packages/renderers/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-renderers",
  "version": "0.3.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/openagentinternet/agent-browser-core.git",
    "directory": "packages/renderers"
  },
  "type": "module",
  "main": "./dist-cjs/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist/**",
    "!dist/.tsbuildinfo",
    "dist-cjs/**",
    "!dist-cjs/.tsbuildinfo",
    "package.json",
    "README.md"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist-cjs/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-host-contract": "0.3.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

Create `packages/renderers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ],
  "references": [
    { "path": "../host-contract" }
  ]
}
```

Create `packages/renderers/tsconfig.cjs.json`:

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

Update root `package.json` build scripts:

```json
"build:esm": "tsc -b packages/host-contract packages/core packages/renderers packages/ui packages/host-standalone packages/test-harness",
"build:cjs": "tsc -p packages/host-contract/tsconfig.cjs.json && tsc -p packages/core/tsconfig.cjs.json && tsc -p packages/renderers/tsconfig.cjs.json && tsc -p packages/ui/tsconfig.cjs.json && tsc -p packages/host-standalone/tsconfig.cjs.json && tsc -p packages/test-harness/tsconfig.cjs.json && node scripts/write-cjs-package-markers.mjs",
```

Update `scripts/browser-workspaces.mjs` so package automation includes the renderer package:

```js
  {
    name: "@openagentinternet/agent-browser-renderers",
    path: "packages/renderers",
  },
```

Insert this object in `BROWSER_WORKSPACES` after `@openagentinternet/agent-browser-core` and before `@openagentinternet/agent-browser-ui`.

Update `release/compatibility.json`:

```json
"@openagentinternet/agent-browser-renderers": "0.3.0"
```

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm install --package-lock-only
```

Expected: `package-lock.json` includes the new workspace package.

- [ ] **Step 4: Implement renderer pack**

Create `packages/renderers/src/index.ts`:

```ts
import type { BrowserResourceEnvelope } from '@openagentinternet/agent-browser-host-contract';

export interface ProtocolRendererBinding {
  rendererId: string;
  protocolPath: string;
  label: string;
}

export const DEFAULT_PROTOCOL_RENDERERS: ProtocolRendererBinding[] = [
  { rendererId: 'simplebuzz.detail', protocolPath: '/protocols/simplebuzz', label: 'SimpleBuzz detail' },
  { rendererId: 'skill-service.detail', protocolPath: '/protocols/skill-service', label: 'Skill service detail' },
  { rendererId: 'generic.protocol-pin', protocolPath: '*', label: 'Generic protocol pin' },
];

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function data(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(resource.renderer.data);
}

function payload(resource: BrowserResourceEnvelope): unknown {
  return data(resource).payload ?? data(resource).rawPayload ?? '';
}

function jsonBlock(value: unknown): string {
  return `<pre class="browser-protocol-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function versionBlock(resource: BrowserResourceEnvelope): string {
  return `<dl class="browser-protocol-proof">${Object.entries(record(data(resource).version)).map(([key, value]) => (
    `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`
  )).join('')}</dl>`;
}

export function renderSimpleBuzzDetail(resource: BrowserResourceEnvelope): string {
  const body = record(payload(resource));
  const content = text(body.content ?? body.text ?? body.body ?? data(resource).rawPayload);
  const media = [
    ...array(body.images),
    ...array(body.imageUrls),
    ...array(body.attachments),
  ].map(text).filter(Boolean);
  return `<article class="browser-protocol-detail browser-simplebuzz-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || '/protocols/simplebuzz')}</p><h2>${escapeHtml(resource.title)}</h2></header>
    <section class="browser-protocol-body">${content.split(/\n{2,}/u).map((part) => `<p>${escapeHtml(part)}</p>`).join('')}</section>
    ${media.length ? `<section class="browser-protocol-media"><h3>Media</h3>${media.map((item) => `<a href="${escapeHtml(item)}">${escapeHtml(item)}</a>`).join('')}</section>` : ''}
    ${versionBlock(resource)}
  </article>`;
}

export function renderSkillServiceDetail(resource: BrowserResourceEnvelope): string {
  const body = record(payload(resource));
  return `<article class="browser-protocol-detail browser-skill-service-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || '/protocols/skill-service')}</p><h2>${escapeHtml(text(body.name) || resource.title)}</h2></header>
    ${text(body.description) ? `<p class="browser-protocol-summary">${escapeHtml(body.description)}</p>` : ''}
    <dl class="browser-protocol-fields">
      ${['price', 'pricing', 'serviceType', 'provider', 'endpoint', 'inputSchema', 'outputSchema'].map((key) => (
        Object.prototype.hasOwnProperty.call(body, key)
          ? `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key])}</dd>`
          : ''
      )).join('')}
    </dl>
    ${versionBlock(resource)}
  </article>`;
}

export function renderGenericProtocolPin(resource: BrowserResourceEnvelope): string {
  return `<article class="browser-protocol-detail browser-generic-protocol-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || 'Unknown protocol')}</p><h2>${escapeHtml(resource.title || 'Generic protocol pin')}</h2></header>
    ${versionBlock(resource)}
    <section><h3>Payload</h3>${jsonBlock(payload(resource))}</section>
    <section><h3>Pin</h3>${jsonBlock(data(resource).pin ?? {})}</section>
  </article>`;
}

export function renderProtocolPinHtml(resource: BrowserResourceEnvelope): string {
  const rendererId = text(data(resource).rendererId);
  if (rendererId === 'simplebuzz.detail') return renderSimpleBuzzDetail(resource);
  if (rendererId === 'skill-service.detail') return renderSkillServiceDetail(resource);
  return renderGenericProtocolPin(resource);
}
```

- [ ] **Step 5: Run renderer tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/renderers/protocolRenderers.test.mjs \
  tests/package/exportsInterop.test.mjs \
  tests/package/packContents.test.mjs \
  tests/release/publishPackages.test.mjs && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
```

Expected: renderer tests, package tests, and package verification pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json package-lock.json \
  scripts/browser-workspaces.mjs \
  release/compatibility.json \
  packages/renderers/package.json \
  packages/renderers/tsconfig.json \
  packages/renderers/tsconfig.cjs.json \
  packages/renderers/src/index.ts \
  tests/renderers/protocolRenderers.test.mjs \
  tests/package/exportsInterop.test.mjs \
  tests/package/packContents.test.mjs \
  tests/release/publishPackages.test.mjs
git commit -m "feat: add protocol renderer pack"
```

Post a Bob development journal for this commit.

## Task 5: Shared UI Rendering and Bot Page MAP Links

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/tsconfig.json`
- Modify: `packages/ui/tsconfig.cjs.json`
- Modify: `packages/ui/src/renderers.ts`
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/renderers.test.mjs`
- Modify: `tests/ui/browserPageRenderers.test.mjs`
- Modify: `tests/ui/browserPageActions.test.mjs`

- [ ] **Step 1: Write failing UI renderer tests**

In `tests/ui/renderers.test.mjs`, add:

```js
test('UI renders protocol-pin resources through first-party renderer pack', () => {
  const html = ui.renderResourceHtml({
    uri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'protocol',
    title: 'Buzz Detail',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'protocol-pin',
      contentType: 'application/json',
      data: {
        rendererId: 'simplebuzz.detail',
        protocolPath: '/protocols/simplebuzz',
        payload: { content: 'Full buzz text' },
        version: {
          requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          resolvedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          versionSelector: 'latest',
        },
      },
    },
    actions: [],
    sections: [],
  });

  assert.match(html, /browser-simplebuzz-detail/);
  assert.match(html, /Full buzz text/);
});

test('UI renders host-action resources as trusted action panels', () => {
  const html = ui.renderResourceHtml({
    uri: 'map://simplemsg/conversation?peer=idq1peer',
    normalizedUri: 'map://simplemsg/conversation?peer=idq1peer',
    resourceType: 'conversation',
    title: 'Conversation',
    owner: { kind: 'unknown', name: 'idq1peer', verificationState: 'partial' },
    renderer: {
      type: 'host-action',
      contentType: 'application/vnd.openagent.browser.host-action+json',
      data: { actionKind: 'open-conversation', actionId: 'open-conversation' },
    },
    actions: [{
      id: 'open-conversation',
      label: 'Conversation',
      kind: 'open-conversation',
      enabled: true,
      payload: {
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
        peerGlobalMetaId: 'idq1peer',
      },
    }],
    sections: [],
  });

  assert.match(html, /data-browser-action="open-conversation"/);
  assert.match(html, /Conversation/);
});
```

In `tests/ui/browserPageRenderers.test.mjs`, extend `bot-page renderer shows profile, services, and trusted buttons from homepage JSON` so v3 service and buzz rows contain `map://` links:

```js
assert.match(html, /href="map:\/\/skill-service\/pin\/service-current-pin"/);
assert.match(html, /href="map:\/\/simplebuzz\/pin\/buzz-pin"/);
```

Extend `bot-page renderer truncates buzz detail longer than 200 characters with ellipsis`:

```js
assert.match(html, /href="map:\/\/simplebuzz\/pin\/buzz-long-pin"/);
```

In `tests/ui/browserPageActions.test.mjs`, add:

```js
function browserActionTarget(attrs) {
  return {
    parentElement: null,
    getAttribute: (name) => attrs[name] || '',
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

test('viewport open-conversation action posts payload and follows returned href', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: {
      ok: true,
      data: {
        kind: 'open-conversation',
        handled: true,
        data: { href: '/ui/conversations?local=idq1worker&peer=idq1peer' },
      },
    },
  });

  await context.initialize();
  nodes['[data-browser-viewport]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({
      'data-browser-action': 'open-conversation',
      'data-browser-action-id': 'conversation',
      'data-browser-action-payload': JSON.stringify({
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
        peerGlobalMetaId: 'idq1peer',
      }),
    }),
  });
  await waitFor(() => requests.length === 1, 'open-conversation action post');
  await waitFor(
    () => context.window.location.href === '/ui/conversations?local=idq1worker&peer=idq1peer',
    'conversation href navigation',
  );

  assert.equal(requests[0].body.kind, 'open-conversation');
  assert.equal(requests[0].body.payload.peerGlobalMetaId, 'idq1peer');
  assert.equal(context.window.location.href, '/ui/conversations?local=idq1worker&peer=idq1peer');
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/renderers.test.mjs \
  tests/ui/browserPageRenderers.test.mjs \
  tests/ui/browserPageActions.test.mjs
```

Expected: protocol renderer and Bot Page MAP link expectations fail.

- [ ] **Step 3: Add UI dependency on renderer pack**

In `packages/ui/package.json`, add:

```json
"@openagentinternet/agent-browser-renderers": "0.3.0"
```

In `packages/ui/tsconfig.json`, add a reference:

```json
{ "path": "../renderers" }
```

- [ ] **Step 4: Render protocol and host-action resources**

In `packages/ui/src/renderers.ts`, import:

```ts
import { renderProtocolPinHtml } from '@openagentinternet/agent-browser-renderers';
```

Add a host-action helper:

```ts
function renderHostAction(resource: BrowserResourceEnvelope): string {
  const primary = resource.actions.find((action) => action.enabled !== false);
  return `<section class="browser-empty-state browser-host-action">
    <h2>${escapeHtml(resource.title || 'Action required')}</h2>
    ${primary ? renderActions([primary]) : '<p>No host action is available.</p>'}
  </section>`;
}
```

Update `renderResourceHtml` before the unsupported fallback:

```ts
  if (renderer.type === 'protocol-pin') return renderProtocolPinHtml(resource);
  if (renderer.type === 'host-action') return renderHostAction(resource);
```

- [ ] **Step 5: Link Bot Page summaries to MAP URIs**

In `packages/ui/src/browser/app.ts`, add a helper near other text/link helpers:

```js
function mapPinHref(protocolPath, pinId) {
  var protocol = String(protocolPath || '').replace(/^\/protocols\//, '').trim();
  var id = String(pinId || '').trim();
  return protocol && id ? 'map://' + protocol + '/pin/' + encodeURIComponent(id) : '';
}
```

In service row rendering, wrap the visible service title with a link when `protocolPath` and `pinId` exist:

```js
var href = mapPinHref(service.protocolPath || '/protocols/skill-service', service.pinId || service.id);
var title = escapeHtml(service.name || service.title || service.id || 'Service');
var titleHtml = href ? '<a href="' + escapeHtml(href) + '" data-browser-map-link>' + title + '</a>' : title;
```

In buzz row rendering, use the same helper with `/protocols/simplebuzz`:

```js
var href = mapPinHref(buzz.protocolPath || '/protocols/simplebuzz', buzz.pinId || buzz.id);
var titleHtml = href ? '<a href="' + escapeHtml(href) + '" data-browser-map-link>' + escapeHtml(summary) + '</a>' : escapeHtml(summary);
```

Add a delegated click handler in the Browser viewport:

```js
var mapLink = event.target && event.target.closest ? event.target.closest('[data-browser-map-link]') : null;
if (mapLink && mapLink.getAttribute('href')) {
  event.preventDefault();
  loadUri(mapLink.getAttribute('href'));
  return;
}
```

- [ ] **Step 6: Forward open-conversation actions and href results**

In `packages/ui/src/browser/app.ts`, preserve action payloads on rendered buttons:

```js
function actionPayloadAttribute(action) {
  if (!action || !action.payload || typeof action.payload !== 'object') return '';
  try {
    return ' data-browser-action-payload="' + escapeHtml(JSON.stringify(action.payload)) + '"';
  } catch (error) {
    return '';
  }
}

function renderActionButtons(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return '';
  return '<div class="browser-action-row">' + actions.map(function (action) {
    var kind = textValue(action && action.kind);
    var label = textValue(action && action.label) || kind || 'Action';
    var disabled = action && action.enabled === false ? ' disabled' : '';
    return '<button type="button" data-browser-action="' + escapeHtml(kind) +
      '" data-browser-action-id="' + escapeHtml(textValue(action && action.id)) + '"' +
      actionPayloadAttribute(action) + disabled + '>' +
      iconHtml(actionIconName(kind)) + '<span>' + escapeHtml(label) + '</span></button>';
  }).join('') + '</div>';
}
```

Extend the safe follow-up route helper used by `openTrustedActionHref` so it accepts local conversation pages as well as Bot management pages:

```js
function safeTrustedActionHref(value) {
  var href = textValue(value);
  if (!href) return '';
  if (href.indexOf('/ui/bot?') === 0 || href.indexOf('/ui/conversations?') === 0) return href;
  try {
    var origin = window.location && window.location.origin ? window.location.origin : '';
    if (!origin) return '';
    var url = new URL(href, origin);
    if (url.origin !== origin || !url.search) return '';
    if (url.pathname === '/ui/bot' || url.pathname === '/ui/conversations') {
      return url.pathname + url.search + url.hash;
    }
  } catch (error) {
    return '';
  }
  return '';
}
```

Update `openTrustedActionHref` to call `safeTrustedActionHref`, then add payload parsing for viewport action buttons:

```js
function parseActionPayloadAttribute(target) {
  var raw = target && target.getAttribute ? target.getAttribute('data-browser-action-payload') : '';
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return objectValue(parsed);
  } catch (error) {
    return {};
  }
}
```

In the existing viewport click listener, include the parsed payload:

```js
handleTrustedAction({
  kind: kind,
  id: target.getAttribute('data-browser-action-id') || '',
  serviceId: target.getAttribute('data-service-id') || '',
  payload: parseActionPayloadAttribute(target),
});
```

In `handleTrustedAction`, add the `open-conversation` branch:

```js
if (kind === 'open-conversation') {
  var result = await commandApi(endpointWithActor(browserEndpoints.actions), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri: currentResourceUri(),
      kind: 'open-conversation',
      payload: objectValue(action && action.payload),
    }),
  });
  openTrustedActionHref(result);
  return result;
}
```

Keep the private-chat composer unchanged. After `confirmPrivateChat` receives a successful result, call `openTrustedActionHref(result)` before returning so OAC can return a conversation link after sending.

- [ ] **Step 7: Run targeted UI tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/renderers.test.mjs \
  tests/ui/browserPageRenderers.test.mjs \
  tests/ui/browserPageActions.test.mjs
```

Expected: UI tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/ui/package.json \
  packages/ui/tsconfig.json \
  packages/ui/tsconfig.cjs.json \
  packages/ui/src/renderers.ts \
  packages/ui/src/browser/app.ts \
  tests/ui/renderers.test.mjs \
  tests/ui/browserPageRenderers.test.mjs \
  tests/ui/browserPageActions.test.mjs
git commit -m "feat: render map protocol resources"
```

Post a Bob development journal for this commit.

## Task 6: Standalone MAP Deep Links and Conversation Fallback

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `packages/host-standalone/src/server.ts`
- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `tests/ui/browserPageState.test.mjs`
- Modify: `tests/browser/browserStandaloneServer.test.mjs`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Write failing standalone tests**

In `tests/browser/browserStandaloneServer.test.mjs`, add:

```js
test('standalone Browser serves map protocol pin deep links', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const { baseUrl, close } = await startFixtureStandaloneServer({
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: pinId,
          path: '/protocols/simplebuzz',
          contentType: 'application/json',
          content: JSON.stringify({ content: 'Standalone MAP buzz' }),
        },
      }),
    }),
  });
  try {
    const response = await fetch(`${baseUrl}/browser/map/simplebuzz/pin/${pinId}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, new RegExp(`map://simplebuzz/pin/${pinId}`));
  } finally {
    await close();
  }
});
```

In `tests/ui/browserPageState.test.mjs`, add:

```js
test('Browser MAP deep link path is decoded into the address bar and preserves query', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const uri = `map://simplebuzz/pin/${pinId}?version=0`;
  const { elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/map/simplebuzz/pin/${pinId}`,
    search: '?version=0',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, uri);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(uri)}&actorId=worker`);
});
```

In `tests/host-standalone/standaloneServer.test.mjs`, add:

```js
test('standalone returns manual action for open-conversation', async () => {
  const result = await adapter.runTrustedAction({
    resourceUri: 'map://simplemsg/conversation?peer=idq1peer',
    kind: 'open-conversation',
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      peerGlobalMetaId: 'idq1peer',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'manual_action_required');
  assert.equal(result.code, 'browser_identity_required');
});
```

- [ ] **Step 2: Run standalone tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/browserPageState.test.mjs \
  tests/browser/browserStandaloneServer.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
```

Expected: `/browser/map/...` route and `open-conversation` fallback are not implemented.

- [ ] **Step 3: Allow standalone MAP Browser shell routes**

In `packages/host-standalone/src/server.ts`, extend `isBrowserPage`:

```ts
function isBrowserPage(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/browser' ||
    pathname === '/ui/browser' ||
    /^\/browser\/(?:metaid|metaapp|metafile)\/[^/?#]+$/.test(pathname) ||
    /^\/browser\/map\/[a-z0-9][a-z0-9-]{0,63}\/[^?#]+$/i.test(pathname);
}
```

- [ ] **Step 4: Add shared UI path-to-MAP URI decoding**

In `packages/ui/src/browser/app.ts`, change `browserUriFromPath` to accept `search`:

```js
function browserUriFromPath(pathname, search) {
  var path = textValue(pathname);
  var match = path.match(/^\/browser\/(metaid|metaapp|metafile)\/([^/?#]+)$/);
  if (match) {
    var decodedId = decodeURIComponentSafe(match[2]);
    var id = textValue(decodedId);
    return id ? match[1] + '://' + id : '';
  }

  var mapMatch = path.match(/^\/browser\/map\/([^/?#]+)\/(.+)$/);
  if (!mapMatch) return '';
  var authority = textValue(decodeURIComponentSafe(mapMatch[1]));
  var rest = mapMatch[2].split('/').map(decodeURIComponentSafe).join('/');
  return authority && rest ? 'map://' + authority + '/' + rest + textValue(search) : '';
}
```

If there is no existing safe decode helper, add:

```js
function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}
```

Update the initial path call site:

```js
var pathUri = queryUri ? '' : browserUriFromPath(window.location && window.location.pathname, window.location && window.location.search);
```

This translation must preserve query strings so `/browser/map/simplebuzz/pin/{pinId}?version=0` maps to `map://simplebuzz/pin/{pinId}?version=0`.

- [ ] **Step 5: Add standalone trusted-action fallback**

In `packages/host-standalone/src/adapter.ts`, extend `runTrustedAction`:

```ts
if (input.kind === 'open-conversation') {
  return browserManualActionRequired('browser_identity_required', 'Standalone Browser cannot open private conversations until a local identity is selected.', {
    data: {
      conversationUri: normalizeText(input.payload?.conversationUri),
      peerGlobalMetaId: normalizeText(input.payload?.peerGlobalMetaId),
    },
  });
}
```

- [ ] **Step 6: Run targeted standalone tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/browserPageState.test.mjs \
  tests/browser/browserStandaloneServer.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
```

Expected: standalone tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/host-standalone/src/server.ts \
  packages/host-standalone/src/adapter.ts \
  packages/ui/src/browser/app.ts \
  tests/ui/browserPageState.test.mjs \
  tests/browser/browserStandaloneServer.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
git commit -m "feat: support map standalone links"
```

Post a Bob development journal for this commit.

## Task 7: OAC Host Adapter Sync

**Files:**
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/hostTypes.ts`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserHostAdapter.ts`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserCoreBridge.ts`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/defaultHandlers.ts`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/daemon/oacBrowserHostAdapter.test.mjs`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/daemon/oacBrowserCoreBridge.test.mjs`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/daemon/browserRoutes.test.mjs`
- Modify: `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/browserRuntimeContext.test.mjs`

This task is intentionally in the OAC repo. Run it only after ABC packages are built and OAC is consuming the new local ABC output through the dev-link path or an exact package version bump.

- [ ] **Step 1: Verify OAC sees the intended ABC package output**

Run from `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node -e "console.log(require.resolve('@openagentinternet/agent-browser-ui/browser')); console.log(require.resolve('@openagentinternet/agent-browser-core')); console.log(require.resolve('@openagentinternet/agent-browser-host-contract'))"
```

Expected during local development: resolved paths point at the local ABC build output or the exact package version that contains Tasks 1-6.

- [ ] **Step 2: Write failing OAC adapter tests**

In `tests/daemon/oacBrowserHostAdapter.test.mjs`, add:

```js
test('OAC browser host adapter maps open-conversation to peer conversation href', async (t) => {
  const profileHome = await createProfileHome('oac-browser-open-conversation');
  t.after(async () => cleanupProfileHome(profileHome));
  const systemHomeDir = deriveSystemHome(profileHome);

  const active = await createMetabotProfileFromIdentity(systemHomeDir, {
    name: 'Conversation Browser Bot',
    homeDir: profileHome,
    globalMetaId: 'idq1local',
    mvcAddress: '18ConversationBrowser',
  });

  const adapter = await createAdapter({
    homeDir: active.homeDir,
    systemHomeDir,
  });

  const result = await adapter.runTrustedAction({
    actorId: active.slug,
    resourceUri: 'map://simplemsg/conversation?peer=idq1peer',
    kind: 'open-conversation',
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      peerGlobalMetaId: 'idq1peer',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.kind, 'open-conversation');
  assert.equal(result.data.data.href, '/ui/conversations?local=idq1local&peer=idq1peer');
});
```

In the existing actor capability assertions in `tests/daemon/oacBrowserHostAdapter.test.mjs`, update OAC Bot capabilities:

```js
capabilities: ['private-chat', 'service-call', 'template-settings', 'message-view'],
```

In `tests/daemon/oacBrowserCoreBridge.test.mjs`, add:

```js
test('OAC Browser core bridge passes open-conversation trusted action through', async (t) => {
  const profileHome = await createProfileHome('oac-browser-core-open-conversation');
  t.after(async () => cleanupProfileHome(profileHome));
  const systemHomeDir = deriveSystemHome(profileHome);

  const active = await createMetabotProfileFromIdentity(systemHomeDir, {
    name: 'Core Conversation Bot',
    homeDir: profileHome,
    globalMetaId: 'idq1local',
    mvcAddress: '18CoreConversation',
  });

  const adapter = await createAdapter({
    homeDir: active.homeDir,
    systemHomeDir,
  });

  const result = await adapter.runTrustedAction({
    actorId: active.slug,
    resourceUri: 'map://simplemsg/conversation?peer=idq1peer',
    kind: 'open-conversation',
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      peerGlobalMetaId: 'idq1peer',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.data.href, '/ui/conversations?local=idq1local&peer=idq1peer');
});
```

In `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/browserRuntimeContext.test.mjs`, update OAC Browser runtime fixtures that represent OAC Bots:

```js
capabilities: ['private-chat', 'service-call', 'template-settings', 'message-view'],
```

- [ ] **Step 3: Run OAC adapter tests to verify they fail**

Run from `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/daemon/oacBrowserHostAdapter.test.mjs \
  tests/daemon/oacBrowserCoreBridge.test.mjs \
  tests/browser/browserRuntimeContext.test.mjs
```

Expected: `open-conversation` is not in OAC-local action unions or adapter branches.

- [ ] **Step 4: Add OAC-local action type and capability**

In `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/hostTypes.ts`, add `message-view` to the existing `BrowserActorCapability` union:

```ts
export type BrowserActorCapability =
  | 'private-chat'
  | 'service-call'
  | 'wallet-sign'
  | 'payment'
  | 'template-settings'
  | 'message-view';
```

Then add `open-conversation` to the existing `BrowserTrustedActionKind` union. Preserve all existing action kinds, including `copy-uri`:

```ts
export type BrowserTrustedActionKind =
  | 'private-chat'
  | 'service-call'
  | 'copy-uri'
  | 'open-settings'
  | 'login'
  | 'edit-profile'
  | 'configure-chat'
  | 'view-messages'
  | 'open-conversation';
```

- [ ] **Step 5: Implement OAC adapter mapping**

In `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserHostAdapter.ts`, first update `profileToBrowserActor`:

```ts
    capabilities: ['private-chat', 'service-call', 'template-settings', 'message-view'],
```

Then add this helper inside `createOacBrowserHostAdapter` after `resolveActor`:

```ts
  async function resolveActorProfile(
    actor: OacBrowserActorContext,
  ): Promise<MetabotProfileFull | { failure: MetabotCommandResult<never> }> {
    let profiles: MetabotProfileFull[];
    try {
      profiles = await listMetabotProfiles(input.systemHomeDir);
    } catch (error) {
      return {
        failure: commandFailed(
          'browser_profile_list_failed',
          error instanceof Error ? error.message : 'Browser action could not list MetaBot profiles.',
        ),
      };
    }
    const actorHomeDir = path.resolve(actor.homeDir);
    const profile = profiles.find((entry) => path.resolve(entry.homeDir) === actorHomeDir) ?? null;
    if (!profile) {
      return {
        failure: commandFailed('profile_not_found', `MetaBot profile not found for Browser actor home: ${actor.homeDir}`),
      };
    }
    return profile;
  }
```

Then add this branch before owner actions:

```ts
    if (actionInput.kind === 'open-conversation') {
      const peerGlobalMetaId = normalizeText(payload.peerGlobalMetaId);
      if (!peerGlobalMetaId) {
        return commandFailed('invalid_browser_action', 'Browser open-conversation action requires peerGlobalMetaId.');
      }
      const profile = await resolveActorProfile(actor);
      if ('failure' in profile) return profile.failure;
      const local = normalizeText(profile.globalMetaId) || profile.slug;
      const href = `/ui/conversations?local=${encodeURIComponent(local)}&peer=${encodeURIComponent(peerGlobalMetaId)}`;
      return commandSuccess({
        kind: actionInput.kind,
        handled: true,
        data: {
          href,
          conversationUri: normalizeText(payload.conversationUri) || `map://simplemsg/conversation?peer=${encodeURIComponent(peerGlobalMetaId)}`,
          peerGlobalMetaId,
        },
      });
    }
```

- [ ] **Step 6: Whitelist bridge action and href data**

In `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserCoreBridge.ts`, add `open-conversation` to `isOacTrustedActionKind`:

```ts
    'open-conversation',
```

Extend `trustedActionData` so nested `href` remains preserved. If current code already preserves `href`, only add the new action kind.

- [ ] **Step 7: Return conversation href after private-chat sends**

In `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/defaultHandlers.ts`, replace the successful private-chat `localUiUrl` value with conversation-first routing:

```ts
          localUiUrl: buildDaemonLocalUiUrl(
            input.getDaemonRecord(),
            '/ui/conversations',
            {
              local: state.identity.globalMetaId,
              peer: request.to,
              ...(a2aSessionId ? { sessionId: a2aSessionId } : {}),
            },
          ),
```

Keep `traceId`, `traceMarkdownPath`, `transcriptMarkdownPath`, and `traceJsonPath` in the result so trace consumers still work.

- [ ] **Step 8: Run OAC targeted tests**

Run from `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/daemon/oacBrowserHostAdapter.test.mjs \
  tests/daemon/oacBrowserCoreBridge.test.mjs \
  tests/daemon/browserRoutes.test.mjs \
  tests/browser/browserRuntimeContext.test.mjs
```

Expected: OAC targeted tests pass.

- [ ] **Step 9: Commit in OAC repo**

Run from `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`:

```bash
git add src/core/browser/hostTypes.ts \
  src/daemon/browser/oacBrowserHostAdapter.ts \
  src/daemon/browser/oacBrowserCoreBridge.ts \
  src/daemon/defaultHandlers.ts \
  tests/daemon/oacBrowserHostAdapter.test.mjs \
  tests/daemon/oacBrowserCoreBridge.test.mjs \
  tests/daemon/browserRoutes.test.mjs \
  tests/browser/browserRuntimeContext.test.mjs
git commit -m "feat: open browser conversations"
```

Post a Bob development journal for this OAC commit.

## Task 8: End-to-End Verification and Release Readiness

**Files:**
- Modify only if a preceding task exposed a concrete mismatch:
  - `README.md`
  - `docs/acceptance/browser-parity-standalone.md`

- [ ] **Step 1: Run full ABC verification**

Run from `/Users/tusm/Documents/MetaID_Projects/agent-browser-core`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
```

Expected: all commands pass.

- [ ] **Step 2: Run standalone smoke check**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run dev:standalone -- --port 8787
```

In another shell:

```bash
curl -sS "http://127.0.0.1:8787/api/browser/runtime" | node -e "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{const json=JSON.parse(data); console.log(json.data.host.kind, json.data.host.localMode);})"
curl -sS "http://127.0.0.1:8787/browser/map/simplemsg/conversation?peer=idq1peer" | rg "map://simplemsg/conversation"
```

Expected:

```text
standalone true
map://simplemsg/conversation
```

Stop the standalone server after the smoke check.

- [ ] **Step 3: Run OAC targeted verification when Task 7 was executed**

Run from `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/daemon/oacBrowserHostAdapter.test.mjs \
  tests/daemon/oacBrowserCoreBridge.test.mjs \
  tests/ui/browserPageActions.test.mjs
```

Expected: OAC Browser adapter, bridge, and UI action tests pass.

- [ ] **Step 4: Verify host-neutral guardrails**

Run from `/Users/tusm/Documents/MetaID_Projects/agent-browser-core`:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/hostNeutralGuardrails.test.mjs
```

Expected: core and UI packages do not import OAC, IDBots, SQLite, wallet, or private chat implementation modules.

- [ ] **Step 5: Commit verification docs only if changed**

If acceptance docs changed, run:

```bash
git add README.md docs/acceptance/browser-parity-standalone.md
git commit -m "docs: record map protocol verification"
```

Post a Bob development journal for this commit.

## Self-Review Checklist

- [ ] Contract supports `protocol`, `conversation`, `protocol-pin`, `host-action`, and `open-conversation`.
- [ ] `map://simplebuzz/pin/{pinId}` resolves through `browserConfig.manApiBaseUrl`.
- [ ] `map://skill-service/pin/{pinId}` resolves through MAN and selects `skill-service.detail`.
- [ ] Unknown `map://{protocol}/pin/{pinId}` selects `generic.protocol-pin`.
- [ ] MAN pin payload extraction supports `content`, `payload`, and `contentSummary` without losing full-detail renderer data.
- [ ] Default pin resolution uses `/pin/{pinId}` without a version query.
- [ ] `[N]` shorthand normalizes to `?version=N` before resource resolution and Browser address/history display.
- [ ] Resolved resources preserve `requestedPinId`, `rootPinId`, `resolvedPinId`, `versionSelector`, and `historyIndex`.
- [ ] Protocol path mismatch fails closed with `browser_protocol_mismatch`.
- [ ] Bot Page summaries use MAP links instead of local UI routes for buzz and skill-service detail.
- [ ] UI never loads chain-declared renderer URLs automatically.
- [ ] Renderer package appears in `scripts/browser-workspaces.mjs`, `release/compatibility.json`, package tests, and publish dry-run tests.
- [ ] `map://simplemsg/conversation?peer=...` creates an `open-conversation` trusted action without fetching MAN pin content.
- [ ] OAC maps `open-conversation` to `/ui/conversations?local=...&peer=...` only in its host adapter.
- [ ] Standalone returns `manual_action_required` for conversation actions in version 1.
- [ ] ABC core and UI do not import OAC, IDBots, SQLite, wallet, or private chat implementation modules.
