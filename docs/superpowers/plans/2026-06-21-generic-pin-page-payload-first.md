# Generic Pin Page Payload-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the version 1 `pin://` Generic Pin page as a payload-first content page, with a narrow resolver contract, a readable generic renderer, and creator-chip navigation in Browser chrome.

**Architecture:** `packages/core` stays responsible for URI parsing, MAN fetch, version identity, owner facts, and raw payload truth. `packages/renderers` owns the payload-first HTML structure and content-type routing for JSON, Markdown, text, and binary notices. `packages/ui` integrates that page into the Browser shell, keeps proof access in the inspector and status strip, and turns creator / copy / download affordances into host-neutral Browser behavior without coupling to OAC routes.

**Tech Stack:** TypeScript workspace packages, Node.js 20.20.0, built-in `node:test`, Browser core/UI/renderers packages, MAN-backed pin resolution, `marked` for Markdown rendering in the first-party renderer pack.

---

## Assumptions

- The spec intro still says "seven top-level sections", but the approved body text is the source of truth: one compact creator chip in Browser chrome plus four page sections (`Payload`, `Raw Payload`, `Related Media And Files`, `Pin Facts`).
- This round does **not** add protocol-specific detail renderers for SimpleBuzz or skill-service. Bot Page detail links already point at `pin://{pinId}` and stay that way.
- This round does **not** refactor the dual Browser shells away. The mature `packages/ui/src/browser/*` shell is the interactive source of truth, and the older exported helpers only get the small parity updates they need for creator-chip, copy, and download behavior.

## File Structure

- Modify `packages/core/src/browser/types.ts`
  - Add first-class `PinInspectorPinSummary` and `PinInspectorResourceData` interfaces so the generic pin contract is explicit and testable.
- Modify `packages/core/src/browser/pinResolver.ts`
  - Remove legacy `contentSummary` merge behavior from `pin://` resolution and return only raw payload truth plus normalized pin facts.
- Modify `tests/browser/pinResolver.test.mjs`
  - Lock the new resolver contract: no summary merge, no `contentSummary` field, preserved version identity.
- Modify `packages/renderers/package.json`
  - Add the Markdown renderer dependency used by the payload-first pin page.
- Modify `package-lock.json`
  - Refresh workspace lock metadata after the renderer dependency change.
- Create `packages/renderers/src/pinInspector.ts`
  - Hold the payload-first Generic Pin page renderer, content-type routing, related-file extraction, and Browser-URI link scanning.
- Modify `packages/renderers/src/index.ts`
  - Re-export the new pin renderer module and keep SimpleBuzz / skill-service detail renderers unchanged.
- Modify `tests/renderers/protocolRenderers.test.mjs`
  - Cover JSON, Markdown, plain text, binary notice, related file rows, and pin facts output for the renderer pack.
- Modify `tests/ui/renderers.test.mjs`
  - Verify `renderResourceHtml()` now emits the payload-first pin page structure.
- Modify `packages/ui/src/browser/app.ts`
  - Teach the mature Browser shell to render `pin-inspector`, keep creator-chip navigation in chrome, and handle copy / download affordances from the page body.
- Modify `packages/ui/src/browser/indexHtml.ts`
  - Add styles for the payload-first Generic Pin page inside the mature Browser shell.
- Modify `tests/ui/browserPageRenderers.test.mjs`
  - Verify the mature Browser shell can render a `pin://...` resource into the viewport as a content page.
- Modify `tests/ui/browserPageState.test.mjs`
  - Verify the resource chip stays creator-first and shows avatar / name / full `GlobalMetaID`.
- Modify `tests/ui/browserPageInspector.test.mjs`
  - Move the resource-chip click expectation from "open inspector" to "open creator Bot Page", while keeping proof/TXID inspector entry points.
- Modify `tests/ui/browserPageActions.test.mjs`
  - Verify copy-TXID and related-file download actions emitted by the pin page work through Browser chrome helpers.
- Modify `tests/ui/browserInteractions.test.mjs`
  - Lock the mature Browser shell wiring: creator chip click, proof/TXID inspector buttons, and page-body copy/download hooks.
- Modify `packages/ui/src/browserClientScript.ts`
  - Keep the exported legacy client script aligned for creator-chip navigation and generic copy / download affordances.
- Modify `packages/ui/src/browserStyles.ts`
  - Add the shared styles needed by the exported legacy Browser page HTML path.

## Before You Start

- [ ] **Step 1: Confirm repo state and runtime**

Run:

```bash
git status --short --branch
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --version
```

Expected:

- `git status --short --branch` prints a branch line beginning with `##`.
- `node --version` prints `v20.20.0`.

- [ ] **Step 2: Re-read the approved spec before touching code**

Run:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-06-20-pin-uri-generic-pin-inspector-design.md
sed -n '260,420p' docs/superpowers/specs/2026-06-20-pin-uri-generic-pin-inspector-design.md
```

Expected:

- The `pin://` rules still point to latest-effective MAN resolution by default.
- The page model still says payload-first, creator chip in chrome, and four body sections.

## Task 1: Tighten the `pin://` Resolver Contract

**Files:**
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/browser/pinResolver.ts`
- Test: `tests/browser/pinResolver.test.mjs`

- [ ] **Step 1: Write failing resolver assertions for the new contract**

In `tests/browser/pinResolver.test.mjs`, replace the summary-merge expectation with:

```js
test('resolvePinUriToResource keeps payload truth separate from legacy contentSummary fields', async () => {
  const payload = {
    name: 'History Payload',
    description: 'Older version',
  };
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}?version=0`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: manPin({
          id: pinId,
          pinId,
          content: '',
          payload,
          contentSummary: JSON.stringify({ summary: 'Older summary' }),
        }),
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.rawPayload, payload);
  assert.deepEqual(result.data.renderer.data.payload, payload);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data.renderer.data, 'contentSummary'), false);
});
```

Add one more test to prove string JSON still parses cleanly:

```js
test('resolvePinUriToResource parses JSON content without inventing summary fields', async () => {
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { pin: manPin({ content: JSON.stringify({ content: 'Full generic pin text' }) }) } }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.payload, { content: 'Full generic pin text' });
  assert.equal(result.data.renderer.data.pin.contentType, 'application/json');
});
```

- [ ] **Step 2: Run the resolver test to prove current behavior is wrong**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/pinResolver.test.mjs
```

Expected: FAIL because `pinResolver.ts` still merges `contentSummary` into `payload` and still returns `contentSummary` in `renderer.data`.

- [ ] **Step 3: Make the contract explicit in `types.ts`**

In `packages/core/src/browser/types.ts`, add:

```ts
export interface PinInspectorPinSummary {
  pinId: string;
  txid?: string;
  path?: string;
  operation?: string;
  version?: string;
  encryption?: string;
  contentType: string;
  chainName?: string;
  ownerGlobalMetaId?: string;
  ownerAddress?: string;
}

export interface PinInspectorResourceData {
  rendererId: 'generic.pin-inspector';
  version: PinResolvedVersion;
  pin: PinInspectorPinSummary;
  payload: unknown;
  rawPayload: unknown;
  rawPinRecord: Record<string, unknown>;
}
```

- [ ] **Step 4: Remove summary merging from `pinResolver.ts`**

In `packages/core/src/browser/pinResolver.ts`, delete `parseJsonObject()`, `contentSummary()`, and `mergePayload()`, then replace the payload path with:

```ts
function payloadSource(pinRecord: Record<string, unknown>): unknown {
  if (pinRecord.content !== undefined && pinRecord.content !== null) return pinRecord.content;
  if (pinRecord.payload !== undefined && pinRecord.payload !== null) return pinRecord.payload;
  return '';
}

const rawPayload = payloadSource(pinRecord);
const payload = parsePayload(rawPayload, contentType);
```

Return only the approved renderer data:

```ts
data: {
  rendererId: 'generic.pin-inspector',
  version,
  pin: {
    pinId: resolvedPinId,
    txid: text(pinRecord.txid) || undefined,
    path: protocolPath,
    operation: text(pinRecord.operation) || undefined,
    version: text(pinRecord.version) || undefined,
    encryption: text(pinRecord.encryption) || undefined,
    contentType,
    chainName: text(pinRecord.chainName ?? pinRecord.chain) || undefined,
    ownerGlobalMetaId: ownerGlobalMetaId || undefined,
    ownerAddress: ownerAddress || undefined,
  },
  payload,
  rawPayload,
  rawPinRecord: pinRecord,
} satisfies PinInspectorResourceData
```

- [ ] **Step 5: Run the resolver test again**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/pinResolver.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the contract cleanup and post the required dev journal buzz**

Run:

```bash
git add packages/core/src/browser/types.ts packages/core/src/browser/pinResolver.ts tests/browser/pinResolver.test.mjs
git commit -m "fix: narrow pin resolver payload contract"
REQUEST_FILE="$(mktemp)"
node -e "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({content:'Dev journal: narrowed pin:// resolver output so Generic Pin pages now receive only payload truth, raw payload, raw MAN record, and explicit version/pin facts. Removed legacy contentSummary merging from pin resolution to match the approved payload-first spec.'}, null, 2))" "$REQUEST_FILE"
$HOME/.metabot/bin/metabot buzz post --from bob --request-file "$REQUEST_FILE"
rm -f "$REQUEST_FILE"
```

Expected:

- Git records `fix: narrow pin resolver payload contract`.
- The buzz post returns `ok: true` and includes a `pinId`. Record that `pinId` in the task notes or commit log.

## Task 2: Build the Payload-First Generic Pin Page

**Files:**
- Modify: `packages/renderers/package.json`
- Modify: `package-lock.json`
- Create: `packages/renderers/src/pinInspector.ts`
- Modify: `packages/renderers/src/index.ts`
- Modify: `tests/renderers/protocolRenderers.test.mjs`
- Modify: `tests/ui/renderers.test.mjs`

- [ ] **Step 1: Write failing renderer tests for the approved page model**

In `tests/renderers/protocolRenderers.test.mjs`, replace the old inspector assertions with:

```js
test('Pin inspector renders payload, raw payload, related files, and pin facts without invented overview fields', () => {
  const html = renderers.renderPinInspectorHtml({
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'pin-inspector',
      contentType: 'application/json',
      data: {
        rendererId: 'generic.pin-inspector',
        version: { requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', versionSelector: 'latest' },
        pin: { pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', path: '/protocols/simplebuzz', txid: 'a'.repeat(64), contentType: 'application/json' },
        payload: {
          content: 'Full readable content',
          attachments: [{ uri: 'metafile://archive.zip', name: 'archive.zip' }],
          related: 'metaid://idq1fixturebot',
        },
        rawPayload: '{"content":"Full readable content"}',
        rawPinRecord: { path: '/protocols/simplebuzz', txid: 'a'.repeat(64) },
      },
    },
    actions: [],
    sections: [],
  });

  assert.match(html, /<h3>Payload<\/h3>/);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Related Media And Files<\/h3>/);
  assert.match(html, /<h3>Pin Facts<\/h3>/);
  assert.match(html, /Full readable content/);
  assert.match(html, /archive\.zip/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/archive\.zip"/);
  assert.match(html, /metaid:\/\/idq1fixturebot/);
  assert.doesNotMatch(html, />Identity</);
  assert.doesNotMatch(html, />Overview</);
  assert.doesNotMatch(html, />Related Links</);
});
```

In `tests/ui/renderers.test.mjs`, update the UI wrapper assertion to check for the same structure:

```js
assert.match(html, /browser-pin-inspector/);
assert.match(html, /<h3>Payload<\/h3>/);
assert.match(html, /<h3>Pin Facts<\/h3>/);
assert.match(html, /Rendered via generic pin inspector/);
assert.doesNotMatch(html, />Related Links</);
```

Add focused Markdown and binary cases:

```js
function pinInspectorResource(contentType, payloadValue) {
  return {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'pin-inspector',
      contentType,
      data: {
        rendererId: 'generic.pin-inspector',
        version: { requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', resolvedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', versionSelector: 'latest' },
        pin: { pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', contentType },
        payload: payloadValue,
        rawPayload: payloadValue,
        rawPinRecord: {},
      },
    },
    actions: [],
    sections: [],
  };
}

test('Pin inspector renders Markdown payloads through the renderer pack', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('text/markdown', '# Heading\\n\\nPlain body'));
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /Plain body/);
});

test('Pin inspector shows a compact binary notice instead of dumping bytes', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('application/octet-stream', 'AAEC'));
  assert.match(html, /Binary payload preview is not available/);
  assert.doesNotMatch(html, /AAECAAEC/);
});
```

- [ ] **Step 2: Run the renderer tests to confirm the current inspector layout fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/renderers/protocolRenderers.test.mjs tests/ui/renderers.test.mjs
```

Expected: FAIL because the current renderer still emits `Identity`, `Overview`, `Media`, and `Related Links`.

- [ ] **Step 3: Add the Markdown dependency to the renderer workspace**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm install --workspace @openagentinternet/agent-browser-renderers marked
```

Expected:

- `packages/renderers/package.json` gains the `marked` dependency.
- `package-lock.json` updates only for that workspace change.

- [ ] **Step 4: Create the payload-first renderer module**

Create `packages/renderers/src/pinInspector.ts` with the new source-of-truth renderer. The module should look like this:

```ts
import { marked } from 'marked';
import type { BrowserResourceEnvelope } from '@openagentinternet/agent-browser-host-contract';

const INTERNAL_BROWSER_URI_PATTERN = /^(metaid|metaapp|metafile|map|pin):\/\//iu;
const EXTERNAL_URL_PATTERN = /^https?:\/\//iu;
const MEDIA_KEYS = ['images', 'image', 'imageUrls', 'attachments', 'files', 'media'];

function renderPrimaryPayload(resource: BrowserResourceEnvelope): string {
  const contentType = text(resource.renderer.contentType || data(resource).pin?.contentType || 'application/octet-stream').toLowerCase();
  const parsed = payload(resource);
  if (contentType.includes('json')) return `<pre class="browser-protocol-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
  if (contentType === 'text/markdown') return `<div class="browser-pin-markdown">${marked.parse(escapeHtml(text(parsed)))}</div>`;
  if (contentType.startsWith('text/plain')) return `<pre class="browser-pin-text">${escapeHtml(text(parsed))}</pre>`;
  return '<p class="browser-pin-binary-notice">Binary payload preview is not available for this pin.</p>';
}

function renderPinFacts(resource: BrowserResourceEnvelope): string {
  const version = record(data(resource).version);
  const pin = record(data(resource).pin);
  const facts = [
    factRow('txid', text(pin.txid), true),
    factRow('path', text(pin.path)),
    factRow('requested pin id', text(version.requestedPinId)),
    factRow('resolved pin id', text(version.resolvedPinId)),
    factRow('root pin id', text(version.rootPinId)),
    factRow('version selector', text(version.versionSelector)),
    factRow('history index', text(version.historyIndex)),
    factRow('operation', text(pin.operation)),
    factRow('chain name', text(pin.chainName)),
    factRow('content type', text(pin.contentType || resource.renderer.contentType)),
    factRow('encryption', text(pin.encryption)),
    factRow('pin version', text(pin.version)),
  ].filter(Boolean).join('');
  return `<section class="browser-pin-section"><h3>Pin Facts</h3><dl class="browser-protocol-proof">${facts}</dl><details><summary>Raw MAN pin record</summary>${jsonBlock(data(resource).rawPinRecord ?? {})}</details></section>`;
}

export function renderPinInspectorHtml(resource: BrowserResourceEnvelope): string {
  return `<article class="browser-protocol-detail browser-pin-inspector">
    <header class="browser-pin-header"><p>${escapeHtml(text(record(data(resource).pin).path) || text(resource.renderer.contentType) || 'Pin')}</p><h2>${escapeHtml(text(resource.title) || 'Pin')}</h2></header>
    <section class="browser-pin-section"><h3>Payload</h3>${renderPrimaryPayload(resource)}</section>
    ${renderRawPayloadSection(resource)}
    ${renderRelatedMediaSection(resource)}
    ${renderPinFacts(resource)}
  </article>`;
}
```

Implementation rules inside that file:

- Keep JSON key order by rendering the parsed object as-is.
- Scan `MEDIA_KEYS` for files and links, but do **not** invent title/tag/body summaries.
- Emit `data-browser-download-ref="..."` on download controls and `data-browser-copy-value="..."` on the TXID copy control.
- Keep Browser-native URIs clickable through `href="metaid://..."` / `href="pin://..."` with `data-browser-map-link`.

- [ ] **Step 5: Re-export the new module and keep UI SSR wiring unchanged**

In `packages/renderers/src/index.ts`, replace the inline pin-inspector implementation with:

```ts
export {
  renderPinInspectorHtml,
} from './pinInspector.js';
```

Keep:

```ts
export function renderGenericProtocolPin(resource: BrowserResourceEnvelope): string {
  return renderPinInspectorHtml(resource, 'Generic protocol pin');
}
```

- [ ] **Step 6: Run the renderer tests again**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/renderers/protocolRenderers.test.mjs tests/ui/renderers.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the renderer work and post the required dev journal buzz**

Run:

```bash
git add packages/renderers/package.json package-lock.json packages/renderers/src/pinInspector.ts packages/renderers/src/index.ts tests/renderers/protocolRenderers.test.mjs tests/ui/renderers.test.mjs
git commit -m "feat: add payload-first generic pin page"
REQUEST_FILE="$(mktemp)"
node -e "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({content:'Dev journal: added the payload-first Generic Pin page renderer. JSON, Markdown, and plain text now render as primary payload content, binary pins show a compact notice, related files surface ZIP/document downloads, and pin facts keep raw resolver evidence visible without inventing semantic summaries.'}, null, 2))" "$REQUEST_FILE"
$HOME/.metabot/bin/metabot buzz post --from bob --request-file "$REQUEST_FILE"
rm -f "$REQUEST_FILE"
```

Expected:

- Git records `feat: add payload-first generic pin page`.
- The buzz post returns `ok: true` with a publish `pinId`.

## Task 3: Wire the Mature Browser Shell and Chrome Affordances

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `packages/ui/src/browser/indexHtml.ts`
- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `packages/ui/src/browserStyles.ts`
- Modify: `tests/ui/browserPageRenderers.test.mjs`
- Modify: `tests/ui/browserPageState.test.mjs`
- Modify: `tests/ui/browserPageInspector.test.mjs`
- Modify: `tests/ui/browserPageActions.test.mjs`
- Modify: `tests/ui/browserInteractions.test.mjs`

- [ ] **Step 1: Write failing Browser-shell tests for the missing pin page and creator-chip behavior**

In `tests/ui/browserPageRenderers.test.mjs`, add:

```js
test('mature Browser shell renders pin resources as payload-first content pages', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'application/json',
    data: {
      rendererId: 'generic.pin-inspector',
      version: { requestedPinId: pinId, resolvedPinId: pinId, versionSelector: 'latest' },
      pin: { pinId, txid: 'a'.repeat(64), path: '/protocols/simplebuzz', contentType: 'application/json' },
      payload: { content: 'Rendered in the Browser shell', attachments: [{ uri: 'metafile://archive.zip', name: 'archive.zip' }] },
      rawPayload: '{"content":"Rendered in the Browser shell"}',
      rawPinRecord: { txid: 'a'.repeat(64) },
    },
  }, {
    resourceType: 'pin',
    uri: `pin://${pinId}`,
    normalizedUri: `pin://${pinId}`,
    owner: { kind: 'bot', globalMetaId: 'idq1fixturebot', name: 'Fixture Bot', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Rendered in the Browser shell'), 'pin page render');
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /<h3>Payload<\/h3>/);
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /archive\.zip/);
});
```

In `tests/ui/browserPageInspector.test.mjs`, replace the old chip-click expectation with:

```js
test('Resource chip opens the creator Bot Page while proof and TXID still open the inspector', async () => {
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');

  nodes['[data-browser-resource-chip]'].click();
  await waitFor(() => context.state.current && context.state.current.normalizedUri === 'metaid://idq1fixturebot', 'creator navigation');

  nodes['[data-browser-status-proof]'].click();
  assert.match(nodes['[data-browser-inspector]'].innerHTML, /<h3>Proof<\/h3>/);
});
```

In `tests/ui/browserPageActions.test.mjs`, add:

```js
test('Pin page copy and download affordances use Browser helpers', async () => {
  const { context, clipboardWrites } = createContext();
  await context.copyValue('a'.repeat(64));
  assert.deepEqual(clipboardWrites, ['a'.repeat(64)]);

  const href = context.resolveDownloadHref('metafile://archive.zip');
  assert.match(href, /archive/i);
});
```

- [ ] **Step 2: Run the Browser-shell tests to prove the current shell is still missing `pin-inspector`**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserPageInspector.test.mjs tests/ui/browserPageActions.test.mjs tests/ui/browserInteractions.test.mjs
```

Expected:

- `browserPageRenderers.test.mjs` fails because `packages/ui/src/browser/app.ts` still treats `pin-inspector` as unsupported.
- `browserPageInspector.test.mjs` fails because the resource chip still opens the inspector.

- [ ] **Step 3: Add pin-page rendering to the mature Browser shell**

In `packages/ui/src/browser/app.ts`, extend `renderRenderer(current)` with an explicit `pin-inspector` branch:

```ts
if (type === 'pin-inspector') {
  return renderPinPage(current);
}
```

Add local helpers in the same file that mirror the renderer-pack page model:

```ts
function renderPinPage(current) {
  var renderer = objectValue(current && current.renderer);
  var data = objectValue(renderer.data);
  return '<article class="browser-protocol-detail browser-pin-inspector">' +
    renderPinPayloadSection(current, data) +
    renderPinRawPayloadSection(data) +
    renderPinMediaSection(current, data) +
    renderPinFactsSection(current, data) +
  '</article>';
}
```

Rules for the mature shell implementation:

- Match the same section titles and data attributes emitted by `packages/renderers/src/pinInspector.ts`.
- Reuse existing helpers like `buildMetafileDownloadHref()`, `safeUrl()`, `shortId()`, and `escapeHtml()`.
- Do **not** add OAC-local hard-coded routes; creator navigation must still go through `metaid://{globalMetaId}`.
- Do **not** widen this task to `protocol-pin` or `host-action`; this round only lands the Generic Pin page.

- [ ] **Step 4: Rewire the creator chip and page-body affordances**

In `packages/ui/src/browser/app.ts`, add a creator-chip navigation helper:

```ts
function creatorChipHref(current) {
  var owner = objectValue(current && current.owner);
  var globalMetaId = textValue(owner.globalMetaId);
  return globalMetaId ? 'metaid://' + globalMetaId : '';
}

function openCreatorFromChip() {
  var href = creatorChipHref(state.current);
  if (href) return navigateTo(href);
  return openInspector();
}
```

Wire it in place of the old resource-chip inspector behavior:

```ts
if (elements.resourceChip) elements.resourceChip.addEventListener('click', openCreatorFromChip);
if (elements.statusProof) elements.statusProof.addEventListener('click', openInspector);
if (elements.statusTxid) elements.statusTxid.addEventListener('click', openInspector);
```

Then add generic page-body handlers:

```ts
var copyButton = closestWithAttribute(event && event.target, 'data-browser-copy-value');
if (copyButton) {
  copyUri({ uri: copyButton.getAttribute('data-browser-copy-value') || '' });
  return;
}

var downloadButton = closestWithAttribute(event && event.target, 'data-browser-download-ref');
if (downloadButton) {
  var href = resolveDownloadHref(downloadButton.getAttribute('data-browser-download-ref') || '');
  if (href && window.location) window.location.href = href;
  else setStatus('error', 'Download unavailable.');
  return;
}
```

Implement `resolveDownloadHref()` so:

- `metafile://...` uses `buildMetafileDownloadHref()`;
- safe external `http(s)` file URLs pass through;
- Browser-native non-file URIs return `''`.

Expose the helpers for tests at the bottom of `packages/ui/src/browser/app.ts`:

```ts
globalThis.copyValue = function (value) { return copyUri({ uri: value }); };
globalThis.resolveDownloadHref = resolveDownloadHref;
```

- [ ] **Step 5: Mirror the small affordance parity updates into the legacy exported Browser shell**

In `packages/ui/src/browserClientScript.ts`, keep the legacy script aligned on:

```ts
if (resourceButton) {
  event.preventDefault();
  const href = resourceButton.getAttribute('data-browser-resource-uri') || '';
  if (href) {
    if (input) input.value = href;
    navigateTo(href).catch(() => {});
  } else {
    toggleInspector(true);
  }
  return;
}
```

Also add the same generic `data-browser-copy-value` and `data-browser-download-ref` event handling there. Do **not** duplicate the entire mature shell renderer architecture in this round.

- [ ] **Step 6: Add the page styles to both shell style entrypoints**

In `packages/ui/src/browser/indexHtml.ts` and `packages/ui/src/browserStyles.ts`, add styles for:

```css
.browser-pin-inspector {
  width: min(100% - 32px, 980px);
  margin: 16px auto 28px;
  padding: 24px;
  display: grid;
  gap: 18px;
  background: var(--browser-surface);
  border: 1px solid var(--browser-border);
  border-radius: 8px;
}

.browser-pin-section {
  display: grid;
  gap: 10px;
}

.browser-pin-file-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--browser-border);
  border-radius: 8px;
  background: var(--browser-panel);
}

.browser-pin-markdown,
.browser-pin-text,
.browser-pin-binary-notice {
  overflow-wrap: anywhere;
}
```

Keep the page content-first. Do **not** add a second full-width creator section in the body.

- [ ] **Step 7: Run the Browser-shell tests again**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserPageInspector.test.mjs tests/ui/browserPageActions.test.mjs tests/ui/browserInteractions.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit the Browser-shell integration and post the required dev journal buzz**

Run:

```bash
git add packages/ui/src/browser/app.ts packages/ui/src/browser/indexHtml.ts packages/ui/src/browserClientScript.ts packages/ui/src/browserStyles.ts tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageState.test.mjs tests/ui/browserPageInspector.test.mjs tests/ui/browserPageActions.test.mjs tests/ui/browserInteractions.test.mjs
git commit -m "feat: wire generic pin page into browser shell"
REQUEST_FILE="$(mktemp)"
node -e "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({content:'Dev journal: wired the Generic Pin page into Browser chrome. The creator chip now opens the creator Bot Page, proof and TXID still open the inspector, and payload-page copy/download affordances now resolve through Browser-native helpers instead of host-specific routes.'}, null, 2))" "$REQUEST_FILE"
$HOME/.metabot/bin/metabot buzz post --from bob --request-file "$REQUEST_FILE"
rm -f "$REQUEST_FILE"
```

Expected:

- Git records `feat: wire generic pin page into browser shell`.
- The buzz post returns `ok: true` with a publish `pinId`.

## Task 4: Final Verification

**Files:**
- No new source files.
- Re-run all touched tests before handoff.

- [ ] **Step 1: Run the focused Browser verification suite**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/browser/pinResolver.test.mjs \
  tests/renderers/protocolRenderers.test.mjs \
  tests/ui/renderers.test.mjs \
  tests/ui/browserPageRenderers.test.mjs \
  tests/ui/browserPageState.test.mjs \
  tests/ui/browserPageInspector.test.mjs \
  tests/ui/browserPageActions.test.mjs \
  tests/ui/browserInteractions.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the repo verification command that matches the touched surface**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run test:browser-parity
```

Expected: PASS.

- [ ] **Step 3: Sanity-check the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected:

- Only the expected core / renderer / UI / test files appear.
- No unrelated files are staged or modified.
