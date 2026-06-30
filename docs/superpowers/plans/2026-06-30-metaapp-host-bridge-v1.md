# MetaApp Host Bridge V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the MetaApp Host Bridge v1 contract and shared Browser UI bridge so iframe MetaApps can navigate, read actor identity, observe actor changes, request MetaID PIN writes, and call a host-owned MetaFile upload surface.

**Architecture:** The existing `agent-browser:navigate` iframe bridge remains the navigation path. New `agent-browser:request`, `agent-browser:response`, and `agent-browser:event` messages reuse the same active-iframe sender check. ABC UI sanitizes actor snapshots and forwards writes/uploads to host-owned endpoints or trusted actions; core remains host-neutral and does not import OAC, IDBots, wallet, file-system, or upload internals.

**Tech Stack:** TypeScript workspace packages, Browser iframe `postMessage`, ABC host-contract/core/ui/host-standalone packages, Node.js 20.20.0, built-in `node:test`.

---

## File Structure

- Modify `packages/host-contract/src/index.ts`
  - Add bridge actor, PIN write, MetaFile upload result types.
  - Add `metaid-pin-write` and `metafile-upload` trusted action kinds.
  - Widen `BrowserTrustedActionResult.data` so hosts can return typed chain results.
- Modify `packages/core/src/browser/types.ts`
  - Mirror bridge trusted action kinds where core resource actions are normalized.
- Modify `packages/core/src/resource/resourceEnvelope.ts`
  - Accept the new trusted action kinds in unsupported/resource validation helpers when needed.
- Modify `packages/test-harness/src/index.ts`
  - Accept new trusted action kinds and generic trusted action result data.
- Modify `tests/host-contract/conformance.test.mjs`
  - Prove bridge write/upload action result shapes pass conformance.
- Modify `tests/test-harness/commandResultShape.test.mjs`
  - Prove typed `data` payloads remain command-shape compatible.
- Modify `packages/ui/src/browser/app.ts`
  - Add production Browser bridge request/response/event handling.
  - Add sanitized actor snapshot conversion.
  - Emit `browser.actor.changed` after actor selection changes.
  - Forward `metaid.pin.write` through `/api/browser/actions`.
  - Call `/api/browser/metafile-upload` for `metafile.upload`.
- Modify `packages/ui/src/browserClientScript.ts`
  - Keep debug/test Browser script behavior aligned with `packages/ui/src/browser/app.ts`.
- Modify `packages/host-standalone/src/http.ts`
  - Add a `POST /api/browser/metafile-upload` route that returns an honest unsupported/manual action result in standalone.
- Modify `packages/host-standalone/src/adapter.ts`
  - Return clear unsupported/manual action responses for `metaid-pin-write` and `metafile-upload`.
- Modify `packages/host-standalone/src/memoryHost.ts`
  - Mirror development fallback behavior for tests.
- Modify `tests/ui/browserPageRenderers.test.mjs`
  - Cover active-iframe bridge request/response, actor current, actor changed, invalid source, and navigation compatibility.
- Modify `tests/ui/browserInteractions.test.mjs`
  - Cover helper/bridge strings emitted in the Browser script.
- Modify `tests/host-standalone/standaloneServer.test.mjs`
  - Cover standalone MetaFile upload fallback route.
- Modify `docs/custom-bot-homepage-metaapp-guide.md`
  - Expand the guide from navigation-only into MetaApp Host Bridge v1 authoring guidance.

## Before You Start

- [ ] **Step 1: Confirm branch and dirty state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -n 5
```

Expected: the current branch is based on `main`. If unrelated dirty files exist, read their paths and avoid staging them. This repo currently has other session work in progress, so every task must stage only the files named in that task.

- [ ] **Step 2: Use a clean implementation branch or worktree**

Run one of these from `main`:

```bash
git switch -c codex/metaapp-host-bridge-v1
```

or, if the main checkout remains dirty:

```bash
git worktree add .worktrees/metaapp-host-bridge-v1 -b codex/metaapp-host-bridge-v1 main
cd .worktrees/metaapp-host-bridge-v1
```

Expected: implementation happens on a single branch based on `main`, not on top of another feature branch.

- [ ] **Step 3: Confirm Node runtime**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --version
```

Expected: `v20.20.0`.

## Task 1: Host Contract Types

**Files:**
- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Modify: `tests/host-contract/conformance.test.mjs`
- Modify: `tests/test-harness/commandResultShape.test.mjs`

- [ ] **Step 1: Write failing command-shape tests**

In `tests/test-harness/commandResultShape.test.mjs`, add:

```js
test('Browser command shape accepts MetaID PIN write data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'metaid-pin-write',
      handled: true,
      data: {
        pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        txid: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7',
        operation: 'create',
        path: '/protocols/simplebuzz',
        actor: {
          uri: 'metaid://idq1actor',
          globalMetaId: 'idq1actor',
          name: 'Actor',
          avatarPinId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0',
        },
      },
    }),
    'metaid-pin-write',
  );
});

test('Browser command shape accepts MetaFile upload data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'metafile-upload',
      handled: true,
      data: {
        files: [{
          pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          uri: 'metafile://7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0.pdf',
          name: 'paper.pdf',
          size: 1234,
          contentType: 'application/pdf',
          actor: {
            uri: 'metaid://idq1actor',
            globalMetaId: 'idq1actor',
            name: 'Actor',
          },
        }],
      },
    }),
    'metafile-upload',
  );
});
```

- [ ] **Step 2: Add a failing conformance action test**

In `tests/host-contract/conformance.test.mjs`, add a conformant adapter case whose `runTrustedAction`
handles `metaid-pin-write`:

```js
test('host conformance accepts MetaApp bridge trusted action kinds', async () => {
  const adapter = createConformantAdapter({
    async runTrustedAction(input) {
      if (input.kind === 'metaid-pin-write') {
        return browserSuccess({
          kind: 'metaid-pin-write',
          handled: true,
          data: {
            pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
            txid: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7',
            operation: 'create',
            path: '/protocols/simplebuzz',
            actor: {
              uri: 'metaid://idq1actor',
              globalMetaId: 'idq1actor',
              name: 'Actor',
            },
          },
        });
      }
      return browserFailure('unsupported_action', `Unsupported action: ${input.kind}`);
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    trustedAction: {
      resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
      kind: 'metaid-pin-write',
      payload: {
        operation: 'create',
        path: '/protocols/simplebuzz',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
      },
    },
  });
});
```

If `assertBrowserHostConformance` does not accept `trustedAction`, add a smaller direct assertion
against `adapter.runTrustedAction(...)` in the same test file.

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/test-harness/commandResultShape.test.mjs \
  tests/host-contract/conformance.test.mjs
```

Expected: failures mention unsupported `metaid-pin-write` or narrow `BrowserTrustedActionResult.data`.

- [ ] **Step 4: Extend host-contract types**

In `packages/host-contract/src/index.ts`, add the new action kinds:

```ts
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
  | 'share-resource'
  | 'metaid-pin-write'
  | 'metafile-upload';
```

Add bridge data types near `BrowserOpenConversationPayload`:

```ts
export interface BrowserMetaAppBridgeActor {
  uri: string;
  globalMetaId: string;
  name: string;
  avatarPinId?: string;
}

export interface BrowserMetaIdPinWritePayload {
  operation: 'create' | 'modify' | 'revoke';
  path: string;
  encryption: string;
  version: string;
  contentType: string;
  payload: {
    encoding: 'utf8' | 'base64';
    value: string;
  };
  originalId?: string;
  appAction?: string;
  display?: {
    title?: string;
    summary?: string;
  };
}

export interface BrowserMetaIdPinWriteResult {
  pinId: string;
  txid: string;
  operation: 'create' | 'modify' | 'revoke';
  path: string;
  actor: BrowserMetaAppBridgeActor;
}

export interface BrowserMetaFileUploadResult {
  files: Array<{
    pinId: string;
    uri: string;
    name: string;
    size: number;
    contentType: string;
    contentHash?: string;
    actor: BrowserMetaAppBridgeActor;
  }>;
}
```

Widen `BrowserTrustedActionResult.data`:

```ts
export interface BrowserTrustedActionResult {
  kind: BrowserTrustedActionKind;
  handled: boolean;
  data?: Record<string, unknown> & {
    href?: string;
    route?: string;
    copiedText?: string;
    message?: string;
  };
}
```

- [ ] **Step 5: Extend test harness enum checks**

In `packages/test-harness/src/index.ts`, include the new trusted action kinds wherever
`BrowserTrustedActionKind` values are checked:

```ts
const TRUSTED_ACTION_KINDS = [
  'private-chat',
  'service-call',
  'copy-uri',
  'open-settings',
  'login',
  'wallet-sign',
  'payment',
  'edit-profile',
  'configure-chat',
  'view-messages',
  'open-conversation',
  'share-resource',
  'metaid-pin-write',
  'metafile-upload',
];
```

If the file uses a different constant name, update that existing list instead of adding a duplicate.

- [ ] **Step 6: Run contract tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/test-harness/commandResultShape.test.mjs \
  tests/host-contract/conformance.test.mjs
```

Expected: both files pass.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add \
  packages/host-contract/src/index.ts \
  packages/test-harness/src/index.ts \
  tests/host-contract/conformance.test.mjs \
  tests/test-harness/commandResultShape.test.mjs
git commit -m "feat: add metaapp bridge host contract"
```

After the commit succeeds, post a Bob development journal entry with `metabot buzz post --from bob`
summarizing the contract change and tests run.

## Task 2: Browser App Bridge Request Handling

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/browserPageRenderers.test.mjs`

- [ ] **Step 1: Add failing active iframe request tests**

In `tests/ui/browserPageRenderers.test.mjs`, extend the navigation bridge test block with a request
case. Use the same active frame setup already used for `agent-browser:navigate`:

```js
test('custom iframe bridge responds with sanitized current actor', async () => {
  const { context, nodes, windowListeners, fetchCalls } = createBrowserPageTestContext({
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{
        id: 'standalone:actor',
        label: 'Bob',
        kind: 'wallet',
        globalMetaId: 'idq1actor',
        avatar: 'https://example.invalid/avatar.png',
        isDefault: true,
        capabilities: ['template-settings'],
      }],
      defaultActor: {
        id: 'standalone:actor',
        label: 'Bob',
        kind: 'wallet',
        globalMetaId: 'idq1actor',
        avatar: 'https://example.invalid/avatar.png',
        isDefault: true,
        capabilities: ['template-settings'],
      },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await context.navigateTo('metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0');
  const activeFrameWindow = { postMessageCalls: [], postMessage(message) { this.postMessageCalls.push(message); } };
  nodes['[data-browser-viewport]'].setChild('iframe.browser-html-frame', { contentWindow: activeFrameWindow });

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-1',
      method: 'browser.actor.current',
      params: {},
    },
  });

  assert.deepEqual(activeFrameWindow.postMessageCalls[0], {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-1',
    ok: true,
    result: {
      actor: {
        uri: 'metaid://idq1actor',
        globalMetaId: 'idq1actor',
        name: 'Bob',
      },
    },
  });
  assert.equal(fetchCalls.some((call) => String(call.url).includes('/api/browser/actions')), false);
});
```

Add a second test that sends the same request from `{}` as `event.source` and asserts no
`postMessageCalls` are recorded.

- [ ] **Step 2: Run the failing UI test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: the new test fails because `agent-browser:request` is ignored.

- [ ] **Step 3: Add response helpers to production app script**

In `packages/ui/src/browser/app.ts`, near `handleBrowserBridgeMessage`, add:

```js
function bridgePostMessage(targetWindow, message) {
  if (!targetWindow || typeof targetWindow.postMessage !== 'function') return;
  targetWindow.postMessage(message, '*');
}

function bridgeResponse(id, ok, payload) {
  var response = {
    type: 'agent-browser:response',
    version: 1,
    id: textValue(id),
    ok: !!ok
  };
  if (ok) response.result = payload || {};
  else response.error = payload || { code: 'invalid_request', message: 'Invalid bridge request.' };
  return response;
}

function sanitizedActorSnapshot(actor) {
  var data = effectiveActor(actor);
  var globalMetaId = textValue(data && data.globalMetaId);
  if (!globalMetaId) return null;
  var snapshot = {
    uri: 'metaid://' + globalMetaId,
    globalMetaId: globalMetaId,
    name: textValue(data && data.label) || globalMetaId
  };
  var avatarPinId = extractPinId(textValue(data && data.avatarPinId));
  if (avatarPinId) snapshot.avatarPinId = avatarPinId;
  return snapshot;
}
```

If `extractPinId` does not exist, add it near other PIN helpers:

```js
function extractPinId(value) {
  var text = textValue(value);
  if (!text) return '';
  if (/^metafile:\/\//i.test(text)) text = text.slice('metafile://'.length);
  if (/^pin:\/\//i.test(text)) text = text.slice('pin://'.length);
  text = text.split(/[?#]/, 1)[0].replace(/\.[A-Za-z0-9]+$/u, '').toLowerCase();
  return isBrowserPinId(text) ? text : '';
}
```

- [ ] **Step 4: Handle `browser.actor.current` requests**

Extend `handleBrowserBridgeMessage(event)`:

```js
function handleBrowserBridgeMessage(event) {
  var data = event && event.data && typeof event.data === 'object' ? event.data : null;
  if (!data || data.version !== 1) return;
  var sourceWindow = currentBrowserHtmlFrameWindow();
  if (!sourceWindow || event.source !== sourceWindow) return;

  if (data.type === 'agent-browser:navigate') {
    var uri = textValue(data.uri);
    if (!isBrowserInternalHref(uri)) return;
    navigateTo(uri);
    return;
  }

  if (data.type !== 'agent-browser:request') return;
  var id = textValue(data.id);
  if (!id) return;
  if (textValue(data.method) === 'browser.actor.current') {
    bridgePostMessage(sourceWindow, bridgeResponse(id, true, { actor: sanitizedActorSnapshot(selectedActor()) }));
    return;
  }
  bridgePostMessage(sourceWindow, bridgeResponse(id, false, {
    code: 'unsupported_method',
    message: 'Unsupported AgentBrowser bridge method.'
  }));
}
```

Keep `agent-browser:navigate` behavior unchanged except for moving the active-iframe source check
before method handling.

- [ ] **Step 5: Run the UI test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: the new actor-current tests pass and existing navigation bridge tests still pass.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageRenderers.test.mjs
git commit -m "feat: expose metaapp actor bridge"
```

Post the required Bob development journal entry after the commit.

## Task 3: Actor Change Events

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `tests/ui/browserPageRenderers.test.mjs`

- [ ] **Step 1: Write failing actor changed test**

In `tests/ui/browserPageRenderers.test.mjs`, add a test that renders an iframe, assigns
`contentWindow.postMessage`, calls `selectUsingIdentity('second-actor')`, and expects:

```js
{
  type: 'agent-browser:event',
  version: 1,
  event: 'browser.actor.changed',
  payload: {
    actor: {
      uri: 'metaid://idq1second',
      globalMetaId: 'idq1second',
      name: 'Second'
    }
  }
}
```

Use a runtime fixture with two actors:

```js
actors: [
  { id: 'first-actor', label: 'First', kind: 'wallet', globalMetaId: 'idq1first', isDefault: true, capabilities: [] },
  { id: 'second-actor', label: 'Second', kind: 'wallet', globalMetaId: 'idq1second', isDefault: false, capabilities: [] },
]
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: the actor changed event is not posted.

- [ ] **Step 3: Add event emit helper**

In `packages/ui/src/browser/app.ts`, add:

```js
function bridgeEvent(eventName, payload) {
  return {
    type: 'agent-browser:event',
    version: 1,
    event: eventName,
    payload: payload || {}
  };
}

function emitBridgeEvent(eventName, payload) {
  var sourceWindow = currentBrowserHtmlFrameWindow();
  if (!sourceWindow) return;
  bridgePostMessage(sourceWindow, bridgeEvent(eventName, payload));
}
```

At the end of successful `selectUsingIdentity(selectedId)`, after `renderActorChip()` or the
existing actor chip update call, add:

```js
emitBridgeEvent('browser.actor.changed', { actor: sanitizedActorSnapshot(selectedActor()) });
```

- [ ] **Step 4: Run the UI test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: the actor changed test passes.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageRenderers.test.mjs
git commit -m "feat: emit metaapp actor change events"
```

Post the required Bob development journal entry after the commit.

## Task 4: PIN Write Bridge Forwarding

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Modify: `tests/ui/browserPageRenderers.test.mjs`

- [ ] **Step 1: Write failing bridge request test**

In `tests/ui/browserPageRenderers.test.mjs`, add a test that sends:

```js
{
  type: 'agent-browser:request',
  version: 1,
  id: 'write-1',
  method: 'metaid.pin.write',
  params: {
    operation: 'create',
    path: '/protocols/simplebuzz',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value: '{"content":"hello"}' },
    display: { title: 'Post buzz', summary: 'hello' }
  }
}
```

Mock `/api/browser/actions` to return:

```js
{
  ok: true,
  state: 'success',
  data: {
    kind: 'metaid-pin-write',
    handled: true,
    data: {
      pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
      txid: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7',
      operation: 'create',
      path: '/protocols/simplebuzz',
      actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Actor' }
    }
  }
}
```

Assert the bridge response is `ok: true` and the fetch body is:

```js
{
  resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
  kind: 'metaid-pin-write',
  payload: {
    operation: 'create',
    path: '/protocols/simplebuzz',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value: '{"content":"hello"}' },
    display: { title: 'Post buzz', summary: 'hello' }
  }
}
```

- [ ] **Step 2: Write failing invalid operation test**

In the same test file, send `operation: 'delete'` and assert the iframe receives:

```js
{
  type: 'agent-browser:response',
  version: 1,
  id: 'write-invalid',
  ok: false,
  error: {
    code: 'invalid_params',
    message: 'MetaID PIN write operation must be create, modify, or revoke.'
  }
}
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: `metaid.pin.write` is unsupported.

- [ ] **Step 4: Add PIN write validation helpers**

In `packages/ui/src/browser/app.ts`, add:

```js
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validatePinWriteParams(params) {
  var input = isPlainObject(params) ? params : {};
  var operation = textValue(input.operation);
  if (!/^(create|modify|revoke)$/u.test(operation)) {
    return { ok: false, error: { code: 'invalid_params', message: 'MetaID PIN write operation must be create, modify, or revoke.' } };
  }
  var path = textValue(input.path);
  if (!path || path.charAt(0) !== '/') {
    return { ok: false, error: { code: 'invalid_params', message: 'MetaID PIN write path must start with /.' } };
  }
  var payload = isPlainObject(input.payload) ? input.payload : {};
  var encoding = textValue(payload.encoding);
  if (!/^(utf8|base64)$/u.test(encoding) || !textValue(payload.value)) {
    return { ok: false, error: { code: 'invalid_params', message: 'MetaID PIN write payload must include utf8 or base64 data.' } };
  }
  return {
    ok: true,
    value: {
      operation: operation,
      path: path,
      encryption: textValue(input.encryption),
      version: textValue(input.version),
      contentType: textValue(input.contentType),
      payload: { encoding: encoding, value: textValue(payload.value) },
      ...(textValue(input.originalId) ? { originalId: textValue(input.originalId) } : {}),
      ...(textValue(input.appAction) ? { appAction: textValue(input.appAction) } : {}),
      ...(isPlainObject(input.display) ? { display: input.display } : {})
    }
  };
}
```

- [ ] **Step 5: Add `metaid.pin.write` request handling**

In the `agent-browser:request` branch of `handleBrowserBridgeMessage`, add:

```js
if (textValue(data.method) === 'metaid.pin.write') {
  handleBridgePinWrite(sourceWindow, id, data.params);
  return;
}
```

Add:

```js
async function handleBridgePinWrite(sourceWindow, id, params) {
  var validation = validatePinWriteParams(params);
  if (!validation.ok) {
    bridgePostMessage(sourceWindow, bridgeResponse(id, false, validation.error));
    return;
  }
  try {
    var result = await commandApi(endpointWithActor(browserEndpoints.actions), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceUri: currentResourceUri(),
        kind: 'metaid-pin-write',
        payload: validation.value
      })
    });
    bridgePostMessage(sourceWindow, bridgeResponse(id, true, result && result.data ? result.data : result));
  } catch (error) {
    bridgePostMessage(sourceWindow, bridgeResponse(id, false, {
      code: error && error.code ? error.code : 'pin_write_failed',
      message: error && error.message ? error.message : 'MetaID PIN write failed.'
    }));
  }
}
```

- [ ] **Step 6: Add standalone fallback**

In `packages/host-standalone/src/adapter.ts`, before the final unsupported return:

```ts
if (actionInput.kind === 'metaid-pin-write') {
  return browserManualActionRequired(
    'browser_identity_required',
    'Standalone Browser cannot write MetaID PINs until a signing actor is available.',
    { data: { operation: normalizeText(actionInput.payload?.operation), path: normalizeText(actionInput.payload?.path) } },
  );
}
```

Mirror the same behavior in `packages/host-standalone/src/memoryHost.ts` if its `runTrustedAction`
has explicit action handling.

- [ ] **Step 7: Run tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs
```

Expected: PIN write bridge tests pass.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add \
  packages/ui/src/browser/app.ts \
  packages/host-standalone/src/adapter.ts \
  packages/host-standalone/src/memoryHost.ts \
  tests/ui/browserPageRenderers.test.mjs
git commit -m "feat: forward metaapp pin write requests"
```

Post the required Bob development journal entry after the commit.

## Task 5: MetaFile Upload Bridge Contract

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `packages/host-standalone/src/http.ts`
- Modify: `tests/ui/browserPageRenderers.test.mjs`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Add failing bridge test for unsupported upload endpoint**

In `tests/ui/browserPageRenderers.test.mjs`, add a `metafile.upload` request with:

```js
{
  source: { kind: 'host-picker', multiple: true, accept: ['application/pdf'] },
  purpose: 'netdisk'
}
```

Mock `/api/browser/metafile-upload` to return:

```js
{
  ok: false,
  state: 'manual_action_required',
  code: 'metafile_upload_unavailable',
  message: 'MetaFile upload is not available in this host.'
}
```

Assert the iframe receives:

```js
{
  type: 'agent-browser:response',
  version: 1,
  id: 'upload-1',
  ok: false,
  error: {
    code: 'metafile_upload_unavailable',
    message: 'MetaFile upload is not available in this host.'
  }
}
```

- [ ] **Step 2: Add failing standalone route test**

In `tests/host-standalone/standaloneServer.test.mjs`, add:

```js
test('standalone metafile upload route returns explicit unsupported state', async () => {
  const server = await startStandaloneTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/browser/metafile-upload`, { method: 'POST' });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.ok, false);
    assert.equal(payload.state, 'manual_action_required');
    assert.equal(payload.code, 'metafile_upload_unavailable');
  } finally {
    await server.close();
  }
});
```

Use the existing server helper names from the file instead of adding a duplicate helper.

- [ ] **Step 3: Run failing tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/browserPageRenderers.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
```

Expected: upload route and bridge method are missing.

- [ ] **Step 4: Add upload endpoint constant and validation**

In `packages/ui/src/browser/app.ts`, extend `browserEndpoints`:

```js
metafileUpload: '/api/browser/metafile-upload',
```

Add:

```js
function validateMetafileUploadParams(params) {
  var input = isPlainObject(params) ? params : {};
  var source = isPlainObject(input.source) ? input.source : {};
  if (textValue(source.kind) !== 'host-picker') {
    return { ok: false, error: { code: 'invalid_params', message: 'MetaFile upload source.kind must be host-picker.' } };
  }
  return {
    ok: true,
    value: {
      source: {
        kind: 'host-picker',
        ...(typeof source.multiple === 'boolean' ? { multiple: source.multiple } : {}),
        ...(Array.isArray(source.accept) ? { accept: source.accept.map(textValue).filter(Boolean) } : {})
      },
      ...(textValue(input.purpose) ? { purpose: textValue(input.purpose) } : {})
    }
  };
}
```

- [ ] **Step 5: Add `metafile.upload` request handling**

In the bridge request handler:

```js
if (textValue(data.method) === 'metafile.upload') {
  handleBridgeMetafileUpload(sourceWindow, id, data.params);
  return;
}
```

Add:

```js
async function handleBridgeMetafileUpload(sourceWindow, id, params) {
  var validation = validateMetafileUploadParams(params);
  if (!validation.ok) {
    bridgePostMessage(sourceWindow, bridgeResponse(id, false, validation.error));
    return;
  }
  try {
    var result = await commandApi(endpointWithActor(browserEndpoints.metafileUpload), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validation.value)
    });
    bridgePostMessage(sourceWindow, bridgeResponse(id, true, result && result.data ? result.data : result));
  } catch (error) {
    bridgePostMessage(sourceWindow, bridgeResponse(id, false, {
      code: error && error.code ? error.code : 'upload_failed',
      message: error && error.message ? error.message : 'MetaFile upload failed.'
    }));
  }
}
```

- [ ] **Step 6: Add standalone unsupported route**

In `packages/host-standalone/src/http.ts`, before the final `return false`, add:

```ts
if (url.pathname === '/api/browser/metafile-upload') {
  if (method !== 'POST') {
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected POST.'));
    return true;
  }
  sendJson(res, 409, browserManualActionRequired(
    'metafile_upload_unavailable',
    'MetaFile upload is not available in the standalone host.',
  ));
  return true;
}
```

Import `browserManualActionRequired` if the file does not already import it.

- [ ] **Step 7: Run tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/ui/browserPageRenderers.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
```

Expected: upload bridge tests and standalone route tests pass.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add \
  packages/ui/src/browser/app.ts \
  packages/host-standalone/src/http.ts \
  tests/ui/browserPageRenderers.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
git commit -m "feat: add metaapp metafile upload bridge"
```

Post the required Bob development journal entry after the commit.

## Task 6: Debug Script Parity

**Files:**
- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `tests/ui/browserInteractions.test.mjs`

- [ ] **Step 1: Add failing script assertions**

In `tests/ui/browserInteractions.test.mjs`, add assertions beside the existing navigation bridge
script checks:

```js
assert.match(script, /agent-browser:request/);
assert.match(script, /agent-browser:response/);
assert.match(script, /browser\.actor\.current/);
assert.match(script, /metaid\.pin\.write/);
assert.match(script, /metafile\.upload/);
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs
```

Expected: the new string assertions fail.

- [ ] **Step 3: Mirror bridge helpers in `browserClientScript.ts`**

Copy the production bridge helper behavior from `packages/ui/src/browser/app.ts` into
`packages/ui/src/browserClientScript.ts`, using `const`/`let` style already present in that file.
Keep these method names identical:

```js
bridgePostMessage
bridgeResponse
bridgeEvent
emitBridgeEvent
sanitizedActorSnapshot
validatePinWriteParams
validateMetafileUploadParams
handleBridgePinWrite
handleBridgeMetafileUpload
```

The `handleBrowserBridgeMessage(event)` implementation must accept both:

```js
data.type === 'agent-browser:navigate'
data.type === 'agent-browser:request'
```

and must still reject messages whose `event.source` is not the current `iframe.browser-html-frame`.

- [ ] **Step 4: Run debug script test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs
```

Expected: the script assertions pass.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add packages/ui/src/browserClientScript.ts tests/ui/browserInteractions.test.mjs
git commit -m "feat: align debug metaapp bridge script"
```

Post the required Bob development journal entry after the commit.

## Task 7: Public MetaApp Authoring Guide

**Files:**
- Modify: `docs/custom-bot-homepage-metaapp-guide.md`

- [ ] **Step 1: Update the helper snippet**

Replace the current helper with a merged helper that preserves `navigate` and adds `request` and
`on`:

```html
<script>
  (function () {
    var callbacks = {};
    var listeners = {};
    var nextId = 1;
    var bridge = window.AgentBrowser || {};

    bridge.navigate = bridge.navigate || function (uri) {
      window.parent.postMessage({
        type: 'agent-browser:navigate',
        version: 1,
        uri: String(uri || '')
      }, '*');
    };

    bridge.request = bridge.request || function (input) {
      var id = 'req-' + (nextId++);
      return new Promise(function (resolve, reject) {
        callbacks[id] = { resolve: resolve, reject: reject };
        window.parent.postMessage({
          type: 'agent-browser:request',
          version: 1,
          id: id,
          method: String(input && input.method || ''),
          params: input && input.params || {}
        }, '*');
      });
    };

    bridge.on = bridge.on || function (eventName, handler) {
      if (!listeners[eventName]) listeners[eventName] = [];
      listeners[eventName].push(handler);
      return function () {
        listeners[eventName] = (listeners[eventName] || []).filter(function (item) {
          return item !== handler;
        });
      };
    };

    window.addEventListener('message', function (event) {
      var data = event && event.data || {};
      if (data.type === 'agent-browser:response' && callbacks[data.id]) {
        var callback = callbacks[data.id];
        delete callbacks[data.id];
        if (data.ok) callback.resolve(data.result);
        else {
          var error = new Error(data.error && data.error.message || 'AgentBrowser request failed');
          error.code = data.error && data.error.code || 'bridge_error';
          callback.reject(error);
        }
      }
      if (data.type === 'agent-browser:event') {
        (listeners[data.event] || []).forEach(function (handler) {
          handler(data.payload);
        });
      }
    });

    window.AgentBrowser = bridge;
  }());
</script>
```

- [ ] **Step 2: Add actor example**

Add:

````md
## Current Actor

MetaApps can read the selected actor as a MetaID identity snapshot:

```js
const result = await window.AgentBrowser.request({ method: 'browser.actor.current' });
console.log(result.actor && result.actor.globalMetaId);
```

The actor object contains only `uri`, `globalMetaId`, `name`, and optional `avatarPinId`.
It does not contain OAC, IDBots, host, wallet, route, or Web2 avatar fields.
````

- [ ] **Step 3: Add PIN write example**

Add:

````md
## Writing A MetaID PIN

Use `metaid.pin.write` for application actions such as posts, notes, likes, replies, and private
protocol records:

```js
await window.AgentBrowser.request({
  method: 'metaid.pin.write',
  params: {
    operation: 'create',
    path: '/protocols/simplebuzz',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: {
      encoding: 'utf8',
      value: JSON.stringify({ content: 'hello Agent Internet' })
    },
    display: {
      title: 'Publish post',
      summary: 'hello Agent Internet'
    }
  }
});
```
````

- [ ] **Step 4: Add MetaFile upload and netdisk example**

Add:

````md
## Uploading Files

Use `metafile.upload` for large files. Store the returned `metafile://...` URI inside a smaller
application-level PIN:

```js
const upload = await window.AgentBrowser.request({
  method: 'metafile.upload',
  params: {
    source: { kind: 'host-picker', multiple: true },
    purpose: 'netdisk'
  }
});

for (const file of upload.files) {
  await window.AgentBrowser.request({
    method: 'metaid.pin.write',
    params: {
      operation: 'create',
      path: '/protocols/netdisk/file',
      encryption: '0',
      version: '1.0.0',
      contentType: 'application/json;utf-8',
      payload: {
        encoding: 'utf8',
        value: JSON.stringify({
          name: file.name,
          file: file.uri,
          size: file.size,
          contentType: file.contentType
        })
      }
    }
  });
}
```
````

- [ ] **Step 5: Update Coding Agent prompt**

Replace the existing prompt with one that includes navigation, actor, upload, and write guidance:

```text
Build a static ZIP-ready MetaApp for Agent Browser Core. Use Agent Internet URI links instead of
Web2 URLs for ecosystem resources. Include the AgentBrowser helper exactly once near the end of
body. Use window.AgentBrowser.navigate(uri) for metaid://, pin://, metaapp://, metafile://, and
map:// navigation. Use window.AgentBrowser.request({ method: 'browser.actor.current' }) to display
the current MetaID actor. Listen for browser.actor.changed when showing the active posting identity.
Use metaid.pin.write for create/modify/revoke MetaID PIN records. Use metafile.upload before
writing netdisk, media, document, or attachment index PINs. Do not request wallet, signing, payment,
private key, host route, local file path, or Web2 avatar access from inside the MetaApp.
```

- [ ] **Step 6: Verify guide formatting**

Run:

```bash
git diff --check -- docs/custom-bot-homepage-metaapp-guide.md
```

Expected: no output.

- [ ] **Step 7: Commit Task 7**

Run:

```bash
git add docs/custom-bot-homepage-metaapp-guide.md
git commit -m "docs: expand metaapp host bridge guide"
```

Post the required Bob development journal entry after the commit.

## Task 8: Final Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/test-harness/commandResultShape.test.mjs \
  tests/host-contract/conformance.test.mjs \
  tests/ui/browserInteractions.test.mjs \
  tests/ui/browserPageRenderers.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

Expected: verification passes. If it fails, inspect the first failing test and fix only failures
introduced by this branch.

- [ ] **Step 3: Confirm staged scope**

Run:

```bash
git status --short --branch
git log --oneline --decorate -n 8
```

Expected: only this branch's intended files are modified or committed. Unrelated pre-existing dirty
files from the root worktree must not be staged or committed.

- [ ] **Step 4: Prepare downstream notes**

Add a short note to the final implementation report:

```text
OAC and IDBots still need host adapter work for real MetaID PIN signing/broadcast and MetaFile
upload. ABC provides the shared bridge contract, Browser UI transport, standalone fallback, and
authoring guide.
```
