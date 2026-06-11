# Agent Browser Core 0.2 Shared UI And Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Agent Browser Core `0.2.0` as the first shared Browser UI and command-state contract that OAC can consume from published packages.

**Architecture:** Implement only in `agent-browser-core`. Extend the host contract to model terminal and non-terminal Browser command states, make the conformance harness validate that shape, then move the reusable Browser shell behavior into `@openagentinternet/agent-browser-ui` while keeping host-specific identity, storage, wallet, private-chat, service-call, and route wrappers outside ABC.

**Tech Stack:** Node.js `>=20 <25`, TypeScript strict mode, npm workspaces, dual ESM/CommonJS package output, Node's built-in `node:test`, static host-neutral HTML/CSS/client script for the shared Browser UI, Node `http` for the standalone development host.

---

## Scope

This plan implements the ABC side of `0.2.0`.

In scope:

- `@openagentinternet/agent-browser-host-contract` support for `success`, `failed`, `waiting`, and `manual_action_required`;
- typed helper constructors for every command state;
- a shared `BrowserHostClient` contract alias/interface for UI clients;
- conformance-harness validation for all command-state shapes;
- standalone host/server updates that exercise non-terminal states;
- shared UI package refactor into focused modules;
- shared UI behavior for runtime loading, navigation, actor selection, menu, settings, templates, cache, drawer, inspector, owner toolbar, share, private-chat, service-call, and command-state display;
- package manifest, export, pack-content, and release-version readiness for `0.2.0`;
- closeout documentation for the `0.1.0` to `0.2.0` migration path.

Out of scope:

- no OAC edits in this plan;
- no OAC worktree creation in this plan;
- no IDBots integration;
- no public standalone production wallet login;
- no Metalet wallet signing or payment execution;
- no user-uploaded template marketplace;
- no package tag push or npm publish from the feature branch unless the user explicitly requests release execution.

The OAC consumption plan must be written in the OAC repository after ABC `0.2.0` is merged and published. That OAC plan must require a fresh OAC worktree and a dedicated branch.

## Starting Point

Work in:

```bash
cd /Users/tusm/Documents/MetaID_Projects/agent-browser-core
```

Start from clean `main` after this plan is committed. Create a feature branch:

```bash
git switch main
git pull --ff-only
git switch -c codex/abc-0.2-shared-ui-contract
```

Use Node v20.20.0 for verification:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
node --version
```

Expected:

```text
v20.20.0
```

Subagent workflow requirements:

- Use `superpowers:subagent-driven-development`.
- Use a fresh implementer subagent for every task.
- After every task, run a fresh `spec-review` subagent and a fresh `code-quality-review` subagent.
- Commit each completed task separately.
- For every commit, post a Bob development-journal Buzz with `metabot-post-buzz` using slug `bob`.
- Do not change `/Users/tusm/Documents/MetaID_Projects/open-agent-connect`.

## Reference Files

Use these ABC files as the implementation surface:

- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Modify: `packages/host-standalone/src/http.ts`
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Modify: `packages/host-standalone/src/index.ts`
- Modify: `packages/ui/src/browserPageHtml.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/menuModel.ts`
- Modify: `packages/ui/src/pageDefinition.ts`
- Modify: `packages/ui/src/renderers.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/tsconfig.json`
- Modify: `packages/core/src/index.ts` only if a UI task needs an existing core export surfaced through the package root
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `release/compatibility.json`
- Modify: `README.md`
- Modify: `tests/host-contract/conformance.test.mjs`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`
- Modify: `tests/package/exportsInterop.test.mjs`
- Modify: `tests/package/packContents.test.mjs`
- Modify: `tests/release/verifyReleaseVersion.test.mjs`
- Modify: `tests/ui/browserPage.test.mjs`
- Modify: `tests/ui/renderers.test.mjs`
- Create: `packages/ui/src/browserClientScript.ts`
- Create: `packages/ui/src/browserShell.ts`
- Create: `packages/ui/src/browserStyles.ts`
- Create: `packages/ui/src/browserTypes.ts`
- Create: `tests/host-contract/commandResultStates.test.mjs`
- Create: `tests/test-harness/commandResultShape.test.mjs`
- Create: `tests/ui/browserInteractions.test.mjs`

Use these OAC files as behavior references only. Do not copy OAC adapters or route wrappers into ABC:

- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/app.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/menuModel.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserHostAdapter.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserCoreBridge.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageActions.test.mjs`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageInspector.test.mjs`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageLayout.test.mjs`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageRenderers.test.mjs`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageState.test.mjs`

## Task 1: Extend Host Contract Command States

**Files:**

- Modify: `packages/host-contract/src/index.ts`
- Modify: `tests/package/exportsInterop.test.mjs`
- Create: `tests/host-contract/commandResultStates.test.mjs`

- [ ] **Step 1: Write command-state tests**

Create `tests/host-contract/commandResultStates.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const contract = await import('../../packages/host-contract/dist/index.js');

test('command helpers create success failed waiting and manual action results', () => {
  assert.deepEqual(contract.browserSuccess({ ok: 1 }), {
    ok: true,
    state: 'success',
    data: { ok: 1 },
  });

  assert.deepEqual(contract.browserFailure('bad_input', 'Bad input.', { data: { field: 'uri' } }), {
    ok: false,
    state: 'failed',
    code: 'bad_input',
    message: 'Bad input.',
    data: { field: 'uri' },
  });

  assert.deepEqual(contract.browserWaiting('trace_pending', 'Trace is still running.', {
    pollAfterMs: 1500,
    action: { label: 'Open trace', route: '/trace/abc' },
    data: { traceId: 'abc' },
  }), {
    ok: false,
    state: 'waiting',
    code: 'trace_pending',
    message: 'Trace is still running.',
    pollAfterMs: 1500,
    action: { label: 'Open trace', route: '/trace/abc' },
    data: { traceId: 'abc' },
  });

  assert.deepEqual(contract.browserManualActionRequired('wallet_login_required', 'Connect a wallet.', {
    action: { label: 'Connect wallet', route: '/browser/login' },
  }), {
    ok: false,
    state: 'manual_action_required',
    code: 'wallet_login_required',
    message: 'Connect a wallet.',
    action: { label: 'Connect wallet', route: '/browser/login' },
  });
});
```

- [ ] **Step 2: Run the new test and confirm the missing exports**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-contract/commandResultStates.test.mjs
```

Expected: the test fails because `browserWaiting` and `browserManualActionRequired` are not exported.

- [ ] **Step 3: Update the contract types and helpers**

In `packages/host-contract/src/index.ts`, replace the current command-result block with:

```ts
export type BrowserCommandState = 'success' | 'failed' | 'waiting' | 'manual_action_required';

export interface BrowserFollowUpAction {
  label: string;
  href?: string;
  route?: string;
  pollUrl?: string;
}

export interface BrowserCommandSuccess<T> {
  ok: true;
  state: 'success';
  data: T;
}

export interface BrowserCommandFailure {
  ok: false;
  state: 'failed';
  code: string;
  message: string;
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export interface BrowserCommandWaiting {
  ok: false;
  state: 'waiting';
  code: string;
  message: string;
  pollAfterMs?: number;
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export interface BrowserCommandManualActionRequired {
  ok: false;
  state: 'manual_action_required';
  code: string;
  message: string;
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export type BrowserCommandResult<T> =
  | BrowserCommandSuccess<T>
  | BrowserCommandFailure
  | BrowserCommandWaiting
  | BrowserCommandManualActionRequired;

export interface BrowserCommandFailureOptions {
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export interface BrowserCommandWaitingOptions extends BrowserCommandFailureOptions {
  pollAfterMs?: number;
}
```

Then replace the helper functions at the bottom of the file with:

```ts
function optionalCommandFields(options: BrowserCommandFailureOptions): Pick<BrowserCommandFailure, 'action' | 'data'> {
  return {
    ...(options.action ? { action: options.action } : {}),
    ...(options.data ? { data: options.data } : {}),
  };
}

export function browserSuccess<T>(data: T): BrowserCommandSuccess<T> {
  return { ok: true, state: 'success', data };
}

export function browserFailure(
  code: string,
  message: string,
  options: BrowserCommandFailureOptions = {},
): BrowserCommandFailure {
  return { ok: false, state: 'failed', code, message, ...optionalCommandFields(options) };
}

export function browserWaiting(
  code: string,
  message: string,
  options: BrowserCommandWaitingOptions = {},
): BrowserCommandWaiting {
  return {
    ok: false,
    state: 'waiting',
    code,
    message,
    ...(typeof options.pollAfterMs === 'number' ? { pollAfterMs: options.pollAfterMs } : {}),
    ...optionalCommandFields(options),
  };
}

export function browserManualActionRequired(
  code: string,
  message: string,
  options: BrowserCommandFailureOptions = {},
): BrowserCommandManualActionRequired {
  return { ok: false, state: 'manual_action_required', code, message, ...optionalCommandFields(options) };
}
```

Add named input interfaces near the existing adapter input types:

```ts
export interface BrowserSettingsInput extends BrowserActorInput {}

export interface BrowserCacheInput extends BrowserActorInput {}

export interface BrowserCacheClearInput extends BrowserActorInput {
  scope?: string;
  pinId?: string;
  cacheKey?: string;
}
```

Update `BrowserHostAdapter` to use the named input interfaces:

```ts
export interface BrowserHostAdapter {
  getRuntime(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserRuntimeSnapshot>>;
  resolveResource(input: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResourceEnvelope>>;
  getSettings(input?: BrowserSettingsInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  updateSettings(input: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  getCache(input?: BrowserCacheInput): Promise<BrowserCommandResult<BrowserCacheSnapshot>>;
  clearCache(input: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>>;
  runTrustedAction(input: BrowserTrustedActionInput): Promise<BrowserCommandResult<BrowserTrustedActionResult>>;
}

export interface BrowserHostClient extends BrowserHostAdapter {}
```

- [ ] **Step 4: Update export interop expectations**

In `tests/package/exportsInterop.test.mjs`, extend the host-contract export expectations:

```js
{
  name: '@openagentinternet/agent-browser-host-contract',
  exports: {
    browserSuccess: 'function',
    browserFailure: 'function',
    browserWaiting: 'function',
    browserManualActionRequired: 'function',
  },
},
```

- [ ] **Step 5: Verify Task 1**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-contract/commandResultStates.test.mjs tests/package/exportsInterop.test.mjs
```

Expected: both tests pass.

- [ ] **Step 6: Review and commit Task 1**

Run spec and quality reviews. Then commit only Task 1 files:

```bash
git add packages/host-contract/src/index.ts tests/host-contract/commandResultStates.test.mjs tests/package/exportsInterop.test.mjs
git commit -m "feat: extend browser command result contract"
```

Post a Bob Buzz describing the command-state contract addition.

## Task 2: Update Harness And Standalone State Handling

**Files:**

- Modify: `packages/test-harness/src/index.ts`
- Modify: `packages/host-standalone/src/http.ts`
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Modify: `packages/host-standalone/src/index.ts`
- Modify: `tests/host-contract/conformance.test.mjs`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`
- Modify: `tests/package/exportsInterop.test.mjs`
- Create: `tests/test-harness/commandResultShape.test.mjs`

- [ ] **Step 1: Write shape validation tests**

Create `tests/test-harness/commandResultShape.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const contract = await import('../../packages/host-contract/dist/index.js');
const harness = await import('../../packages/test-harness/dist/index.js');

test('assertBrowserCommandResultShape accepts every valid command state', () => {
  harness.assertBrowserCommandResultShape(contract.browserSuccess({ ok: true }), 'success');
  harness.assertBrowserCommandResultShape(contract.browserFailure('failed_code', 'Failed message.'), 'failed');
  harness.assertBrowserCommandResultShape(contract.browserWaiting('wait_code', 'Wait message.', {
    pollAfterMs: 1000,
    action: { label: 'Poll', pollUrl: '/api/browser/poll/1' },
  }), 'waiting');
  harness.assertBrowserCommandResultShape(contract.browserManualActionRequired('manual_code', 'Manual message.', {
    action: { label: 'Open', href: 'https://example.test/action' },
  }), 'manual');
});

test('assertBrowserCommandResultShape rejects invalid command state objects', () => {
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'waiting', code: '', message: 'Missing code.' }, 'bad'),
    /bad code/,
  );
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'manual_action_required', code: 'x', message: '' }, 'bad'),
    /bad message/,
  );
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'unknown', code: 'x', message: 'x' }, 'bad'),
    /bad state/,
  );
});
```

- [ ] **Step 2: Run the new test and confirm the missing harness export**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/test-harness/commandResultShape.test.mjs
```

Expected: the test fails because `assertBrowserCommandResultShape` is not exported.

- [ ] **Step 3: Add command-result shape validation to the harness**

In `packages/test-harness/src/index.ts`, import `BrowserCommandResult` and add this function above `assertBrowserHostConformance`:

```ts
export function assertBrowserCommandResultShape(result: unknown, label = 'Browser command result'): asserts result is BrowserCommandResult<unknown> {
  assert.equal(typeof result, 'object', `${label} result object`);
  assert.notEqual(result, null, `${label} result object`);
  const commandResult = result as Partial<BrowserCommandResult<unknown>> & Record<string, unknown>;
  assert.equal(typeof commandResult.ok, 'boolean', `${label} ok`);
  assert.equal(typeof commandResult.state, 'string', `${label} state`);

  if (commandResult.ok === true) {
    assert.equal(commandResult.state, 'success', `${label} success state`);
    assert.equal(Object.prototype.hasOwnProperty.call(commandResult, 'data'), true, `${label} success data`);
    return;
  }

  assert.equal(['failed', 'waiting', 'manual_action_required'].includes(String(commandResult.state)), true, `${label} bad state`);
  assert.equal(typeof commandResult.code, 'string', `${label} code`);
  assert.notEqual(commandResult.code, '', `${label} code`);
  assert.equal(typeof commandResult.message, 'string', `${label} message`);
  assert.notEqual(commandResult.message, '', `${label} message`);

  if (commandResult.state === 'waiting' && commandResult.pollAfterMs !== undefined) {
    assert.equal(typeof commandResult.pollAfterMs, 'number', `${label} pollAfterMs`);
  }

  if (commandResult.action !== undefined) {
    assert.equal(typeof commandResult.action, 'object', `${label} action`);
    assert.notEqual(commandResult.action, null, `${label} action`);
    assert.equal(typeof (commandResult.action as Record<string, unknown>).label, 'string', `${label} action label`);
  }
}
```

Update `assertBrowserHostConformance` so every adapter result is validated before its state-specific assertions:

```ts
const runtime = await input.adapter.getRuntime();
assertBrowserCommandResultShape(runtime, 'getRuntime');
assert.equal(runtime.ok, true);
```

Apply the same pattern to `getSettings`, `updateSettings`, `getCache`, `clearCache`, `resolveResource`, and `runTrustedAction`.

- [ ] **Step 4: Update standalone HTTP status handling**

In `packages/host-standalone/src/http.ts`, update `statusForResult`:

```ts
function statusForResult(result: BrowserCommandResult<unknown>): number {
  if (result.ok || result.state === 'waiting' || result.state === 'manual_action_required') return 200;
  if (result.code === 'invalid_browser_uri' || result.code === 'missing_uri' || result.code === 'invalid_argument') return 400;
  if (result.code === 'actor_not_found') return 404;
  return 400;
}
```

- [ ] **Step 5: Make the standalone memory host exercise non-terminal states**

In `packages/host-standalone/src/memoryHost.ts`, add helper imports:

```ts
  browserManualActionRequired,
  browserWaiting,
```

Then update `runTrustedAction` so the development host returns deterministic non-terminal states:

```ts
async runTrustedAction(input) {
  const failure = ensureActor(input.actorId);
  if (failure) return failure;
  if (input.kind === 'login') {
    return browserManualActionRequired('wallet_login_required', 'Connect a wallet in the standalone host.', {
      action: { label: 'Connect wallet', route: '/browser/login' },
    });
  }
  if (input.kind === 'service-call') {
    return browserWaiting('service_call_pending', 'Standalone service call is queued in the development host.', {
      pollAfterMs: 1000,
      action: { label: 'Open request status', route: '/browser/requests/dev-service-call' },
      data: { requestId: 'dev-service-call' },
    });
  }
  return browserFailure('browser_action_not_supported', `Standalone Browser does not support trusted action: ${input.kind}`);
},
```

- [ ] **Step 6: Update standalone server tests for non-terminal states**

In `tests/host-standalone/standaloneServer.test.mjs`, update the action-route test block so it asserts:

```js
const serviceCallResponse = await fetch(`${baseUrl}/api/browser/actions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'service-call', resourceUri: 'metaid://idq1fixturebot' }),
});
const serviceCall = await json(serviceCallResponse);
assert.equal(serviceCallResponse.status, 200);
assert.equal(serviceCall.ok, false);
assert.equal(serviceCall.state, 'waiting');
assert.equal(serviceCall.code, 'service_call_pending');
assert.equal(serviceCall.pollAfterMs, 1000);

const loginResponse = await fetch(`${baseUrl}/api/browser/actions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'login', resourceUri: 'metaid://idq1fixturebot' }),
});
const login = await json(loginResponse);
assert.equal(loginResponse.status, 200);
assert.equal(login.ok, false);
assert.equal(login.state, 'manual_action_required');
assert.equal(login.code, 'wallet_login_required');
assert.equal(login.action.label, 'Connect wallet');

const unsupportedResponse = await fetch(`${baseUrl}/api/browser/actions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind: 'private-chat', resourceUri: 'metaid://idq1fixturebot' }),
});
const unsupported = await json(unsupportedResponse);
assert.equal(unsupportedResponse.status, 400);
assert.equal(unsupported.ok, false);
assert.equal(unsupported.state, 'failed');
assert.equal(unsupported.code, 'browser_action_not_supported');
```

- [ ] **Step 7: Update export interop expectations**

In `tests/package/exportsInterop.test.mjs`, extend the test-harness export expectations:

```js
{
  name: '@openagentinternet/agent-browser-test-harness',
  exports: {
    assertBrowserHostConformance: 'function',
    assertBrowserCommandResultShape: 'function',
  },
},
```

- [ ] **Step 8: Verify Task 2**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test \
  tests/test-harness/commandResultShape.test.mjs \
  tests/host-contract/conformance.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs \
  tests/package/exportsInterop.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 9: Review and commit Task 2**

Run spec and quality reviews. Then commit only Task 2 files:

```bash
git add \
  packages/test-harness/src/index.ts \
  packages/host-standalone/src/http.ts \
  packages/host-standalone/src/memoryHost.ts \
  packages/host-standalone/src/index.ts \
  tests/host-contract/conformance.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs \
  tests/package/exportsInterop.test.mjs \
  tests/test-harness/commandResultShape.test.mjs
git commit -m "feat: validate browser command state conformance"
```

Post a Bob Buzz describing the conformance and standalone state-handling update.

## Task 3: Split The Shared UI Into Focused Modules

**Files:**

- Modify: `packages/ui/src/browserPageHtml.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/pageDefinition.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/tsconfig.json`
- Modify: `tests/package/packContents.test.mjs`
- Modify: `tests/ui/browserPage.test.mjs`
- Create: `packages/ui/src/browserClientScript.ts`
- Create: `packages/ui/src/browserShell.ts`
- Create: `packages/ui/src/browserStyles.ts`
- Create: `packages/ui/src/browserTypes.ts`

- [ ] **Step 1: Add UI module export tests**

In `tests/ui/browserPage.test.mjs`, add assertions to the first test:

```js
assert.match(html, /data-browser-menu-trigger/);
assert.match(html, /data-browser-modal-root/);
assert.equal(typeof ui.buildBrowserClientScript, 'function');
assert.equal(typeof ui.buildBrowserShellHtml, 'function');
assert.equal(typeof ui.BROWSER_PAGE_STYLES, 'string');
```

In `tests/package/packContents.test.mjs`, add assertions inside the declared-entrypoints test when `workspace.name === '@openagentinternet/agent-browser-ui'`:

```js
if (workspace.name === '@openagentinternet/agent-browser-ui') {
  assertPackIncludes(files, 'dist/browserClientScript.js', workspace.name);
  assertPackIncludes(files, 'dist/browserShell.js', workspace.name);
  assertPackIncludes(files, 'dist/browserStyles.js', workspace.name);
  assertPackIncludes(files, 'dist/browserTypes.d.ts', workspace.name);
  assertPackIncludes(files, 'dist-cjs/browserClientScript.js', workspace.name);
  assertPackIncludes(files, 'dist-cjs/browserShell.js', workspace.name);
  assertPackIncludes(files, 'dist-cjs/browserStyles.js', workspace.name);
}
```

- [ ] **Step 2: Run UI tests and confirm missing exports**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPage.test.mjs tests/package/packContents.test.mjs
```

Expected: tests fail because the new UI module exports and packed files do not exist.

- [ ] **Step 3: Create shared UI types**

Create `packages/ui/src/browserTypes.ts`:

```ts
import type { BrowserResourceEnvelope, BrowserRuntimeSnapshot } from '@openagentinternet/agent-browser-host-contract';

export interface BrowserPageDefinitionInput {
  title?: string;
  apiBasePath?: string;
  initialUri?: string;
  runtime?: BrowserRuntimeSnapshot | null;
  resource?: BrowserResourceEnvelope | null;
}

export interface BrowserPageDefinition {
  title: string;
  apiBasePath: string;
  initialUri: string;
  contentHtml: string;
  script: string;
}

export interface BrowserShellInput {
  initialUri: string;
  initialResourceHtml: string;
}

export interface BrowserClientScriptInput {
  apiBasePath: string;
  initialUri: string;
}
```

- [ ] **Step 4: Move styles into `browserStyles.ts`**

Create `packages/ui/src/browserStyles.ts` and export the existing CSS from `browserPageHtml.ts`:

```ts
export const BROWSER_PAGE_STYLES = `/* existing Browser page CSS moved here without behavior changes */`;
```

When applying this step, move the real existing CSS string into `BROWSER_PAGE_STYLES`. Do not leave the comment text in the committed source.

- [ ] **Step 5: Move shell HTML into `browserShell.ts`**

Create `packages/ui/src/browserShell.ts`:

```ts
import { escapeHtml } from './renderers.js';
import type { BrowserShellInput } from './browserTypes.js';

export function buildBrowserShellHtml(input: BrowserShellInput): string {
  return `<section class="browser-shell" data-browser-shell>
      <header class="browser-topbar" data-browser-topbar>
        <nav class="browser-nav" aria-label="Browser navigation">
          <button type="button" class="browser-icon-button" aria-label="Back" data-browser-back></button>
          <button type="button" class="browser-icon-button" aria-label="Forward" data-browser-forward></button>
          <button type="button" class="browser-icon-button" aria-label="Reload" data-browser-reload></button>
          <button type="button" class="browser-icon-button" aria-label="Bookmarks and history" data-browser-drawer-toggle aria-expanded="false"></button>
        </nav>
        <form class="browser-address-form" data-browser-address-form>
          <input data-browser-uri-input aria-label="Agent Internet URI" value="${escapeHtml(input.initialUri)}">
          <button type="submit" class="browser-address-submit" aria-label="Visit URI"></button>
        </form>
        <button type="button" class="browser-resource-chip" data-browser-resource-chip aria-expanded="false"><span class="browser-chip-title">Resource</span></button>
        <button type="button" class="browser-using-chip" data-browser-using-selector aria-expanded="false"><span class="browser-chip-title">Using</span></button>
        <button type="button" class="browser-icon-button browser-menu-trigger" data-browser-menu-trigger aria-label="Browser menu" aria-haspopup="menu" aria-expanded="false"></button>
        <div class="browser-chrome-menu" data-browser-menu role="menu" hidden></div>
      </header>
      <div class="browser-owner-toolbar" data-browser-owner-toolbar hidden></div>
      <div class="browser-viewport-row" data-browser-viewport-row>
        <aside class="browser-drawer" data-browser-drawer hidden></aside>
        <main class="browser-viewport" data-browser-viewport>${input.initialResourceHtml}</main>
        <aside class="browser-inspector" data-browser-inspector hidden></aside>
      </div>
      <footer class="browser-status-strip" data-browser-status-strip>
        <button type="button" data-browser-status-state>ready</button>
        <button type="button" data-browser-status-proof>unverified</button>
        <span data-browser-status-renderer>renderer</span>
        <button type="button" data-browser-status-txid>TXID: -</button>
      </footer>
      <div class="browser-modal" data-browser-modal-root hidden></div>
    </section>`;
}
```

- [ ] **Step 6: Move client script builder into `browserClientScript.ts`**

Create `packages/ui/src/browserClientScript.ts` with the existing `jsonScript` helper and current `browserClientScript` body moved from `pageDefinition.ts`. Export it as:

```ts
import type { BrowserClientScriptInput } from './browserTypes.js';

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildBrowserClientScript(input: BrowserClientScriptInput): string {
  return `(() => {
  const apiBasePath = ${jsonScript(input.apiBasePath)};
  const resolveEndpoint = ${jsonScript(`${input.apiBasePath}/resolve`)};
  const initialUri = ${jsonScript(input.initialUri)};
  /* move the existing client script body here in this task */
})();`;
}
```

When applying this step, replace the inline comment with the full existing client script body from `pageDefinition.ts`.

- [ ] **Step 7: Make `pageDefinition.ts` compose the modules**

Update `packages/ui/src/pageDefinition.ts` so it imports and uses the new modules:

```ts
import { buildBrowserClientScript } from './browserClientScript.js';
import { buildBrowserShellHtml } from './browserShell.js';
import type { BrowserPageDefinition, BrowserPageDefinitionInput } from './browserTypes.js';
import { renderResourceHtml } from './renderers.js';

export function buildBrowserPageDefinition(input: BrowserPageDefinitionInput = {}): BrowserPageDefinition {
  const apiBasePath = input.apiBasePath ?? '/api/browser';
  const initialUri = input.initialUri ?? input.runtime?.defaultUri ?? 'metaid://idq1fixturebot';
  const initialResourceHtml = input.resource
    ? renderResourceHtml(input.resource)
    : '<section class="browser-empty-state"><h2>Enter an Agent Internet URI</h2></section>';
  return {
    title: input.title ?? 'Agent Internet Browser',
    apiBasePath,
    initialUri,
    contentHtml: buildBrowserShellHtml({ initialUri, initialResourceHtml }),
    script: buildBrowserClientScript({ apiBasePath, initialUri }),
  };
}
```

- [ ] **Step 8: Update `browserPageHtml.ts` and package exports**

Update `packages/ui/src/browserPageHtml.ts` to import `BROWSER_PAGE_STYLES` from `browserStyles.ts`.

Update `packages/ui/src/index.ts`:

```ts
export { BROWSER_PAGE_STYLES } from './browserStyles.js';
export { buildBrowserClientScript } from './browserClientScript.js';
export { buildBrowserShellHtml } from './browserShell.js';
export type {
  BrowserClientScriptInput,
  BrowserPageDefinition,
  BrowserPageDefinitionInput,
  BrowserShellInput,
} from './browserTypes.js';
export { BROWSER_MENU_SECTIONS, BROWSER_SETTINGS_TABS } from './menuModel.js';
export { buildBrowserPageDefinition } from './pageDefinition.js';
export { escapeHtml, renderResourceHtml, safeRendererUrl } from './renderers.js';
export type { BrowserPageHtmlInput } from './browserPageHtml.js';
export { renderBrowserPageHtml } from './browserPageHtml.js';
```

- [ ] **Step 9: Update UI package packed files**

In `packages/ui/package.json`, add ESM and CommonJS files for the new modules:

```json
"dist/browserClientScript.d.ts",
"dist/browserClientScript.d.ts.map",
"dist/browserClientScript.js",
"dist/browserClientScript.js.map",
"dist/browserShell.d.ts",
"dist/browserShell.d.ts.map",
"dist/browserShell.js",
"dist/browserShell.js.map",
"dist/browserStyles.d.ts",
"dist/browserStyles.d.ts.map",
"dist/browserStyles.js",
"dist/browserStyles.js.map",
"dist/browserTypes.d.ts",
"dist/browserTypes.d.ts.map",
"dist/browserTypes.js",
"dist/browserTypes.js.map",
"dist-cjs/browserClientScript.js",
"dist-cjs/browserClientScript.js.map",
"dist-cjs/browserShell.js",
"dist-cjs/browserShell.js.map",
"dist-cjs/browserStyles.js",
"dist-cjs/browserStyles.js.map",
"dist-cjs/browserTypes.js",
"dist-cjs/browserTypes.js.map"
```

- [ ] **Step 10: Verify Task 3**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPage.test.mjs tests/package/packContents.test.mjs tests/package/exportsInterop.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 11: Review and commit Task 3**

Run spec and quality reviews. Then commit only Task 3 files:

```bash
git add \
  packages/ui/src/browserPageHtml.ts \
  packages/ui/src/browserClientScript.ts \
  packages/ui/src/browserShell.ts \
  packages/ui/src/browserStyles.ts \
  packages/ui/src/browserTypes.ts \
  packages/ui/src/index.ts \
  packages/ui/src/pageDefinition.ts \
  packages/ui/package.json \
  packages/ui/tsconfig.json \
  tests/package/packContents.test.mjs \
  tests/ui/browserPage.test.mjs
git commit -m "refactor: split shared browser ui modules"
```

Post a Bob Buzz describing the UI module split.

## Task 4: Add Shared Runtime Menu Settings Template And Cache UI

**Files:**

- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `packages/ui/src/browserShell.ts`
- Modify: `packages/ui/src/browserStyles.ts`
- Modify: `packages/ui/src/menuModel.ts`
- Modify: `tests/ui/browserPage.test.mjs`
- Create or Modify: `tests/ui/browserInteractions.test.mjs`

- [ ] **Step 1: Add static UI behavior assertions**

Create `tests/ui/browserInteractions.test.mjs` if it does not exist, or extend it if Task 3 already created it:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');

test('client script includes runtime menu settings template cache and actor flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /const browserEndpoints = \{/);
  assert.match(script, /settings: apiBasePath \+ '\/settings'/);
  assert.match(script, /cache: apiBasePath \+ '\/cache'/);
  assert.match(script, /function renderBrowserMenu\(/);
  assert.match(script, /function openBrowserSettings\(/);
  assert.match(script, /function renderTemplateSettings\(/);
  assert.match(script, /function clearBrowserCache\(/);
  assert.match(script, /function openActorSelector\(/);
  assert.match(script, /data-browser-settings-tab/);
  assert.match(script, /data-browser-template-select/);
  assert.match(script, /data-browser-cache-clear/);
  assert.match(script, /data-browser-actor-id/);
});

test('shared shell exposes menu and modal roots used by client script', () => {
  const html = ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition());

  assert.match(html, /data-browser-menu-trigger/);
  assert.match(html, /data-browser-menu role="menu"/);
  assert.match(html, /data-browser-modal-root/);
  assert.match(html, /data-browser-using-selector/);
});
```

- [ ] **Step 2: Run the interaction tests and confirm missing behavior**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs
```

Expected: tests fail on missing client-script functions.

- [ ] **Step 3: Extend `menuModel.ts`**

Ensure `packages/ui/src/menuModel.ts` exports settings tabs and menu sections that are host-neutral:

```ts
export interface BrowserSettingsTab {
  id: 'baseUrls' | 'templates' | 'cache';
  label: string;
}

export interface BrowserMenuItem {
  id: string;
  label: string;
  icon: 'settings' | 'template' | 'database' | 'info';
  action: 'open-settings' | 'toggle-inspector' | 'toggle-drawer';
  settingsTab?: BrowserSettingsTab['id'];
}

export interface BrowserMenuSection {
  id: string;
  title: string;
  items: BrowserMenuItem[];
}

export const BROWSER_SETTINGS_TABS: BrowserSettingsTab[] = [
  { id: 'baseUrls', label: 'Base URLs' },
  { id: 'templates', label: 'Templates' },
  { id: 'cache', label: 'Cache' },
];

export const BROWSER_MENU_SECTIONS: BrowserMenuSection[] = [
  {
    id: 'browser',
    title: 'Browser',
    items: [
      { id: 'settings', label: 'Settings', icon: 'settings', action: 'open-settings', settingsTab: 'baseUrls' },
      { id: 'templates', label: 'Templates', icon: 'template', action: 'open-settings', settingsTab: 'templates' },
      { id: 'cache', label: 'Cache', icon: 'database', action: 'open-settings', settingsTab: 'cache' },
      { id: 'inspector', label: 'Inspector', icon: 'info', action: 'toggle-inspector' },
    ],
  },
];
```

Preserve existing exported names if they already exist.

- [ ] **Step 4: Add runtime and endpoint state to `browserClientScript.ts`**

Inside the client script template, define host-neutral endpoints and state:

```js
const browserEndpoints = {
  runtime: apiBasePath + '/runtime',
  resolve: apiBasePath + '/resolve',
  settings: apiBasePath + '/settings',
  cache: apiBasePath + '/cache',
  actions: apiBasePath + '/actions'
};
const state = {
  runtime: null,
  resource: null,
  selectedActorId: '',
  settingsTab: 'baseUrls',
  settingsData: null,
  cacheData: null,
  error: ''
};
```

Update existing fetch calls to use `browserEndpoints`.

- [ ] **Step 5: Add settings modal functions**

Add these client-script functions with host-neutral names and data attributes:

```js
function renderSettingsTabs() {
  return '<div class="browser-settings-tabs" role="tablist">' + browserSettingsTabs.map(function (tab) {
    var tabId = textValue(tab.id);
    var selected = tabId === state.settingsTab;
    return '<button type="button" role="tab" data-browser-settings-tab="' + escapeHtml(tabId) + '"' +
      (selected ? ' aria-selected="true"' : '') + '>' + escapeHtml(tab.label) + '</button>';
  }).join('') + '</div>';
}

function renderBaseUrlSettings() {
  var data = state.settingsData || {};
  var browser = data.browser || {};
  return '<form class="browser-settings-form" data-browser-settings-form>' +
    ['resolverBaseUrl', 'publicBaseUrl'].map(function (key) {
      return '<label class="browser-settings-field"><span>' + escapeHtml(key) + '</span>' +
        '<input data-browser-setting-field="' + escapeHtml(key) + '" value="' + escapeHtml(browser[key] || '') + '" /></label>';
    }).join('') + '</form>';
}

function renderTemplateSettings() {
  var data = state.settingsData || {};
  var effective = data.effectiveBrowser || {};
  var selectedTemplateId = textValue(effective.botHomepageTemplateId || 'document');
  return '<section class="browser-template-grid">' + botHomepageTemplates.map(function (template) {
    var templateId = textValue(template.id);
    return '<button type="button" class="browser-template-option" data-browser-template-select="' + escapeHtml(templateId) + '"' +
      (templateId === selectedTemplateId ? ' aria-current="true"' : '') + '><strong>' + escapeHtml(template.name) +
      '</strong><span>' + escapeHtml(template.description || '') + '</span></button>';
  }).join('') + '</section>';
}

function renderCacheSettings() {
  var cache = state.cacheData || {};
  return '<section class="browser-cache-panel">' +
    '<dl><dt>cache root</dt><dd>' + escapeHtml(cache.cacheRoot || '-') + '</dd>' +
    '<dt>artifacts</dt><dd>' + escapeHtml(cache.artifactCount || 0) + '</dd>' +
    '<dt>pin records</dt><dd>' + escapeHtml(cache.pinRecordCount || 0) + '</dd></dl>' +
    '<div class="browser-cache-actions"><button type="button" data-browser-cache-clear="pin">Clear Current Resource</button>' +
    '<button type="button" data-browser-cache-clear="all">Clear All Browser Cache</button></div></section>';
}
```

Import or inject `botHomepageTemplates` from `@openagentinternet/agent-browser-core` in the same style the current UI package uses for menu data. If direct runtime injection is simpler in this static-script milestone, serialize the template list in `buildBrowserClientScript`.

- [ ] **Step 6: Add settings, template, and cache actions**

Add these client-script functions:

```js
async function loadBrowserSettingsData() {
  state.settingsData = await api(endpointWithActor(browserEndpoints.settings));
  state.cacheData = await api(endpointWithActor(browserEndpoints.cache));
}

async function openBrowserSettings(tabId) {
  state.settingsTab = settingsTabExists(tabId);
  showModal('<section class="browser-modal-panel browser-settings-panel" role="dialog" aria-modal="true">' +
    '<header><h2>Browser Settings</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body"><p class="browser-settings-note">Loading...</p></div></section>');
  await loadBrowserSettingsData();
  renderBrowserSettingsModal();
}

async function selectBotHomepageTemplate(templateId) {
  var nextBrowser = Object.assign({}, state.settingsData && state.settingsData.browser || {}, {
    botHomepageTemplateId: textValue(templateId)
  });
  state.settingsData = await api(endpointWithActor(browserEndpoints.settings), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ browser: nextBrowser })
  });
  renderBrowserSettingsModal();
  if (state.resource && state.resource.uri) await navigateTo(state.resource.uri);
}

async function clearBrowserCache(scope) {
  state.cacheData = await api(endpointWithActor(browserEndpoints.cache), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: textValue(scope) || 'all' })
  });
  state.cacheData = await api(endpointWithActor(browserEndpoints.cache));
  setStatus('cache cleared', '');
  renderBrowserSettingsModal();
}
```

- [ ] **Step 7: Add actor selector behavior**

Add `openActorSelector` and selection handling:

```js
function openActorSelector() {
  var runtime = state.runtime || {};
  var actors = runtime.actors || [];
  showModal('<section class="browser-modal-panel browser-actor-panel" role="dialog" aria-modal="true">' +
    '<header><h2>' + escapeHtml(runtimeLabel('actorChip', 'Using') + ' Actor') + '</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body">' + actors.map(function (actor) {
      var actorId = textValue(actor.id);
      return '<button type="button" data-browser-actor-id="' + escapeHtml(actorId) + '"' +
        (actorId === state.selectedActorId ? ' aria-current="true"' : '') + '><strong>' + escapeHtml(actor.label) +
        '</strong><span>' + escapeHtml(actor.kind) + '</span></button>';
    }).join('') + '</div></section>');
}

function selectActor(actorId) {
  state.selectedActorId = textValue(actorId);
  closeModal();
  updateActorChip();
  if (state.resource && state.resource.uri) {
    navigateTo(state.resource.uri).catch(function (error) {
      setStatus('error', error && error.message ? error.message : 'Actor switch failed.');
    });
  }
}
```

- [ ] **Step 8: Wire menu, settings, cache, template, and actor click handlers**

Extend the shell click listener so these attributes are handled:

```js
data-browser-menu-trigger
data-browser-menu-item
data-browser-settings-tab
data-browser-settings-save
data-browser-template-select
data-browser-cache-clear
data-browser-actor-id
data-browser-using-selector
data-browser-modal-close
```

Use existing `closestWithAttribute` style helpers from the OAC reference, but keep the helpers inside `browserClientScript.ts`.

- [ ] **Step 9: Verify Task 4**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs tests/ui/browserPage.test.mjs tests/host-standalone/standaloneServer.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 10: Review and commit Task 4**

Run spec and quality reviews. Then commit only Task 4 files:

```bash
git add \
  packages/ui/src/browserClientScript.ts \
  packages/ui/src/browserShell.ts \
  packages/ui/src/browserStyles.ts \
  packages/ui/src/menuModel.ts \
  tests/ui/browserPage.test.mjs \
  tests/ui/browserInteractions.test.mjs
git commit -m "feat: add shared browser settings ui"
```

Post a Bob Buzz describing the menu/settings/template/cache/actor UI behavior.

## Task 5: Add Shared Resource Drawer Inspector Owner Toolbar And Trusted Action Modals

**Files:**

- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `packages/ui/src/browserShell.ts`
- Modify: `packages/ui/src/browserStyles.ts`
- Modify: `packages/ui/src/renderers.ts`
- Modify: `tests/ui/browserInteractions.test.mjs`
- Modify: `tests/ui/renderers.test.mjs`

- [ ] **Step 1: Add resource interaction assertions**

Extend `tests/ui/browserInteractions.test.mjs`:

```js
test('client script includes drawer inspector owner toolbar share and trusted action flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function renderDrawer\(/);
  assert.match(script, /function renderInspector\(/);
  assert.match(script, /function renderOwnerToolbar\(/);
  assert.match(script, /function openShareModal\(/);
  assert.match(script, /function openPrivateChatModal\(/);
  assert.match(script, /function openServiceCallModal\(/);
  assert.match(script, /function runTrustedAction\(/);
  assert.match(script, /function applyCommandResult\(/);
  assert.match(script, /manual_action_required/);
  assert.match(script, /waiting/);
  assert.match(script, /data-browser-owner-action/);
  assert.match(script, /data-browser-private-chat-message/);
  assert.match(script, /data-browser-service-task/);
  assert.match(script, /data-browser-share-copy/);
});
```

Extend `tests/ui/renderers.test.mjs` with renderer safety assertions:

```js
test('safeRendererUrl allows local http and https URLs only', () => {
  assert.equal(ui.safeRendererUrl('/local/path'), '/local/path');
  assert.equal(ui.safeRendererUrl('https://example.test/app'), 'https://example.test/app');
  assert.equal(ui.safeRendererUrl('http://127.0.0.1:3000/app'), 'http://127.0.0.1:3000/app');
  assert.equal(ui.safeRendererUrl('javascript:alert(1)'), '');
  assert.equal(ui.safeRendererUrl('data:text/html,hi'), '');
  assert.equal(ui.safeRendererUrl('//example.test/app'), '');
});
```

- [ ] **Step 2: Run tests and confirm missing behavior**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs tests/ui/renderers.test.mjs
```

Expected: tests fail on missing functions or missing safety export behavior.

- [ ] **Step 3: Ensure renderer URL safety is exported**

In `packages/ui/src/renderers.ts`, make `safeRendererUrl` exported and ensure it only permits:

```ts
export function safeRendererUrl(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.charAt(0) === '/' && text.slice(0, 2) !== '//') return text;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Add command-result display handling**

In `packages/ui/src/browserClientScript.ts`, add:

```js
function applyCommandResult(payload, successMessage) {
  if (payload && payload.ok) {
    setStatus(successMessage || 'success', '');
    return payload.data;
  }
  if (payload && payload.state === 'waiting') {
    setStatus('waiting', payload.message || payload.code || '');
    renderCommandNotice(payload);
    return null;
  }
  if (payload && payload.state === 'manual_action_required') {
    setStatus('manual action required', payload.message || payload.code || '');
    renderCommandNotice(payload);
    return null;
  }
  throw new Error(payload && (payload.message || payload.code) || 'Browser command failed.');
}

function renderCommandNotice(payload) {
  var action = payload && payload.action || {};
  showModal('<section class="browser-modal-panel browser-command-panel" role="dialog" aria-modal="true">' +
    '<header><h2>' + escapeHtml(payload.state === 'waiting' ? 'Waiting' : 'Action Required') +
    '</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body"><p>' + escapeHtml(payload.message || payload.code || '') + '</p>' +
    (action.label ? '<a data-browser-command-action href="' + escapeHtml(action.href || action.route || action.pollUrl || '#') + '">' + escapeHtml(action.label) + '</a>' : '') +
    '</div></section>');
}
```

Update `api()` so it returns the raw command result and calls `applyCommandResult()` only at call sites that need `data`. This keeps non-terminal states visible rather than throwing as generic failures.

- [ ] **Step 5: Add drawer and inspector rendering**

Add:

```js
function renderDrawer() {
  var runtime = state.runtime || {};
  var defaultUri = textValue(runtime.defaultUri || initialUri);
  elements.drawer.innerHTML = '<header class="browser-panel-header"><h2>Resources</h2><button type="button" data-browser-drawer-close aria-label="Close drawer">Close</button></header>' +
    '<button type="button" data-browser-visit-uri="' + escapeHtml(defaultUri) + '">Default Resource</button>' +
    (state.resource && state.resource.uri ? '<button type="button" data-browser-visit-uri="' + escapeHtml(state.resource.uri) + '">Current Resource</button>' : '');
}

function renderInspector() {
  var resource = state.resource || {};
  var proof = resource.proof || {};
  var source = resource.source || {};
  elements.inspector.innerHTML = '<header class="browser-panel-header"><h2>Inspector</h2><button type="button" data-browser-inspector-close aria-label="Close inspector">Close</button></header>' +
    '<dl>' +
    '<dt>uri</dt><dd>' + escapeHtml(resource.uri || '-') + '</dd>' +
    '<dt>renderer</dt><dd>' + escapeHtml(resource.renderer && resource.renderer.type || '-') + '</dd>' +
    '<dt>verification</dt><dd>' + escapeHtml(proof.verificationState || resource.status && resource.status.verificationState || 'unverified') + '</dd>' +
    '<dt>txid</dt><dd>' + escapeHtml(proof.txid || '-') + '</dd>' +
    '<dt>pin id</dt><dd>' + escapeHtml(proof.pinId || '-') + '</dd>' +
    '<dt>resolver</dt><dd>' + escapeHtml(source.resolver || '-') + '</dd>' +
    '</dl>';
}
```

- [ ] **Step 6: Add owner toolbar rendering**

Add:

```js
function renderOwnerToolbar(resource) {
  var affinity = resource && resource.ownerAffinity;
  var actions = affinity && affinity.actions || [];
  if (!actions.length) {
    elements.ownerToolbar.hidden = true;
    elements.ownerToolbar.innerHTML = '';
    return;
  }
  elements.ownerToolbar.hidden = false;
  elements.ownerToolbar.innerHTML = actions.map(function (action) {
    return '<button type="button" data-browser-owner-action="' + escapeHtml(action.kind) +
      '" data-browser-action-id="' + escapeHtml(action.id || '') + '"' +
      (action.enabled ? '' : ' disabled') + '>' + escapeHtml(action.label) + '</button>';
  }).join('');
}
```

Call `renderOwnerToolbar(payload.data)` after successful resource resolution.

- [ ] **Step 7: Add share, private-chat, and service-call modals**

Add:

```js
function openShareModal() {
  var resource = state.resource || {};
  var metaidUri = textValue(resource.uri || input && input.value || initialUri);
  var localUrl = window.location.href;
  showModal('<section class="browser-modal-panel browser-share-panel" role="dialog" aria-modal="true">' +
    '<header><h2>Share</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body">' +
    '<button type="button" data-browser-share-copy="' + escapeHtml(metaidUri) + '">Copy resource URI</button>' +
    '<button type="button" data-browser-share-copy="' + escapeHtml(localUrl) + '">Copy Browser URL</button>' +
    '</div></section>');
}

function openPrivateChatModal(action) {
  showModal('<section class="browser-modal-panel browser-action-panel" role="dialog" aria-modal="true">' +
    '<header><h2>' + escapeHtml(action.label || 'Private Chat') + '</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body"><textarea data-browser-private-chat-message rows="5"></textarea></div>' +
    '<footer><button type="button" data-browser-modal-close>Cancel</button><button type="button" data-browser-modal-action="private-chat">Send</button></footer></section>');
}

function openServiceCallModal(action) {
  showModal('<section class="browser-modal-panel browser-action-panel" role="dialog" aria-modal="true">' +
    '<header><h2>' + escapeHtml(action.label || 'Service Call') + '</h2><button type="button" data-browser-modal-close aria-label="Close">Close</button></header>' +
    '<div class="browser-modal-body"><textarea data-browser-service-task rows="5"></textarea></div>' +
    '<footer><button type="button" data-browser-modal-close>Cancel</button><button type="button" data-browser-modal-action="service-call">Send</button></footer></section>');
}
```

- [ ] **Step 8: Add trusted-action execution**

Add:

```js
async function runTrustedAction(kind, payload) {
  var command = await api(endpointWithActor(browserEndpoints.actions), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri: state.resource && state.resource.uri || input && input.value || initialUri,
      kind: kind,
      payload: payload || {}
    })
  });
  return applyCommandResult(command, 'action complete');
}
```

Wire modal confirm buttons:

```js
if (action === 'private-chat') {
  var message = elements.modalRoot.querySelector('[data-browser-private-chat-message]');
  runTrustedAction('private-chat', { content: message && message.value || '' }).catch(function (error) {
    setStatus('error', error && error.message ? error.message : 'Private chat failed.');
  });
}
if (action === 'service-call') {
  var task = elements.modalRoot.querySelector('[data-browser-service-task]');
  runTrustedAction('service-call', { userTask: task && task.value || '' }).catch(function (error) {
    setStatus('error', error && error.message ? error.message : 'Service call failed.');
  });
}
```

- [ ] **Step 9: Wire resource action buttons**

When a click target has `data-browser-action`, dispatch:

```js
if (kind === 'private-chat') return openPrivateChatModal(action);
if (kind === 'service-call') return openServiceCallModal(action);
if (kind === 'share-resource' || kind === 'copy-uri') return openShareModal();
return runTrustedAction(kind, action.payload || {});
```

Use action descriptors from `state.resource.actions` and `state.resource.ownerAffinity.actions`.

- [ ] **Step 10: Verify Task 5**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserInteractions.test.mjs tests/ui/renderers.test.mjs tests/ui/browserPage.test.mjs tests/host-standalone/standaloneServer.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 11: Review and commit Task 5**

Run spec and quality reviews. Then commit only Task 5 files:

```bash
git add \
  packages/ui/src/browserClientScript.ts \
  packages/ui/src/browserShell.ts \
  packages/ui/src/browserStyles.ts \
  packages/ui/src/renderers.ts \
  tests/ui/browserInteractions.test.mjs \
  tests/ui/renderers.test.mjs
git commit -m "feat: add shared browser resource actions"
```

Post a Bob Buzz describing the resource drawer, inspector, owner toolbar, share, and trusted-action modal work.

## Task 6: Prepare Package Metadata For 0.2.0

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/core/package.json`
- Modify: `packages/host-contract/package.json`
- Modify: `packages/host-standalone/package.json`
- Modify: `packages/test-harness/package.json`
- Modify: `packages/ui/package.json`
- Modify: `release/compatibility.json`
- Modify: `README.md`
- Modify: `tests/release/verifyReleaseVersion.test.mjs`
- Modify: `tests/package/exportsInterop.test.mjs`
- Modify: `tests/package/packContents.test.mjs`

- [ ] **Step 1: Update release-version test expectations**

In `tests/release/verifyReleaseVersion.test.mjs`, update any hard-coded release tag or version from `v0.1.0` / `0.1.0` to `v0.2.0` / `0.2.0`.

- [ ] **Step 2: Run release-version tests and confirm version drift**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/verifyReleaseVersion.test.mjs
```

Expected: test fails because manifests still report `0.1.0`.

- [ ] **Step 3: Bump all package versions and internal dependency pins**

Update these files from `0.1.0` to `0.2.0`:

```text
package.json
packages/core/package.json
packages/host-contract/package.json
packages/host-standalone/package.json
packages/test-harness/package.json
packages/ui/package.json
release/compatibility.json
```

Internal package dependencies must also use exact `0.2.0`, for example:

```json
"dependencies": {
  "@openagentinternet/agent-browser-core": "0.2.0",
  "@openagentinternet/agent-browser-host-contract": "0.2.0",
  "@openagentinternet/agent-browser-ui": "0.2.0"
}
```

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm install --package-lock-only
```

- [ ] **Step 4: Update README release and migration notes**

In `README.md`, update the release section to say the next release is `v0.2.0` and include this migration summary:

```md
## 0.1.0 To 0.2.0 Host Migration

Host adapters that only return `success` and `failed` command results remain valid.
Hosts may now return `waiting` and `manual_action_required` for long-running or human-confirmed actions.
UI hosts should consume `@openagentinternet/agent-browser-ui@0.2.0` only when they want the shared Browser shell.
OAC integration remains a separate pinned-package consumption step and should be implemented in a dedicated OAC worktree.
```

- [ ] **Step 5: Verify package exports and pack contents**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/package/exportsInterop.test.mjs tests/package/packContents.test.mjs
```

Expected: tests pass.

- [ ] **Step 6: Verify release version**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.2.0
```

Expected:

```text
Agent Browser Core release version verified: 0.2.0
```

- [ ] **Step 7: Verify package dry run**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
```

Expected: the dry run lists all five packages at version `0.2.0` in dependency order and does not publish.

- [ ] **Step 8: Review and commit Task 6**

Run spec and quality reviews. Then commit only Task 6 files:

```bash
git add \
  package.json \
  package-lock.json \
  packages/core/package.json \
  packages/host-contract/package.json \
  packages/host-standalone/package.json \
  packages/test-harness/package.json \
  packages/ui/package.json \
  release/compatibility.json \
  README.md \
  tests/release/verifyReleaseVersion.test.mjs \
  tests/package/exportsInterop.test.mjs \
  tests/package/packContents.test.mjs
git commit -m "chore: prepare browser core 0.2 package metadata"
```

Post a Bob Buzz describing the `0.2.0` package metadata and migration note.

## Task 7: Final Verification And Phase Closeout

**Files:**

- Modify: `docs/superpowers/specs/2026-06-11-agent-browser-core-0.2-shared-ui-contract-design.md`
- Modify: `docs/superpowers/plans/2026-06-11-agent-browser-core-0.2-shared-ui-contract.md`

- [ ] **Step 1: Run full ABC verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

Expected: TypeScript build succeeds and all tests pass.

- [ ] **Step 2: Run package verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
```

Expected: package export and pack-content tests pass.

- [ ] **Step 3: Run release readiness checks**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.2.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
```

Expected:

```text
Agent Browser Core release version verified: 0.2.0
```

The package dry run must list all five packages and must not publish. `git diff --check` must print no whitespace errors.

- [ ] **Step 4: Run standalone smoke**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node packages/host-standalone/dist/main.js --port 0
```

Expected output contains:

```text
Agent Internet Browser listening at http://127.0.0.1:
```

Stop the standalone process after confirming the URL is printed.

- [ ] **Step 5: Update docs status**

Update the spec status line:

```md
Status: Implemented in ABC 0.2.0 branch
```

At the top of this plan, add a short completion block below the header:

```md
**Implementation Status:** Completed on `codex/abc-0.2-shared-ui-contract`; verified with `npm run verify`, `npm run verify:packages`, `node scripts/verify-release-version.mjs v0.2.0`, `npm run publish:packages:dry-run`, `git diff --check`, and standalone smoke.
```

- [ ] **Step 6: Whole-phase review**

Run a fresh whole-phase review subagent with this prompt:

```text
Review the completed Agent Browser Core 0.2 shared UI and contract branch against docs/superpowers/specs/2026-06-11-agent-browser-core-0.2-shared-ui-contract-design.md and docs/superpowers/plans/2026-06-11-agent-browser-core-0.2-shared-ui-contract.md.

Focus on host neutrality, command-state contract correctness, conformance coverage, package publish hygiene, shared UI parity with the stated scope, and whether OAC integration can proceed as a separate pinned-package consumption plan.

Do not change files. Return blocking findings first, then non-blocking risks, then verification evidence.
```

Fix blocking findings in the relevant task files, run the smallest verification that covers the fix, run `git diff --check`, and commit the fix with a focused message. Post a Bob Buzz for each fix commit.

- [ ] **Step 7: Commit closeout docs**

If the whole-phase review has no blocking findings, commit the closeout doc updates:

```bash
git add \
  docs/superpowers/specs/2026-06-11-agent-browser-core-0.2-shared-ui-contract-design.md \
  docs/superpowers/plans/2026-06-11-agent-browser-core-0.2-shared-ui-contract.md
git commit -m "docs: close browser core 0.2 implementation plan"
```

Post a Bob Buzz describing final verification and phase closeout.

## Final Handoff

When all tasks are complete, report:

- branch name and final commit;
- verification commands and pass counts;
- whole-phase review result;
- Bob Buzz pin IDs for every commit;
- whether `git status --short --branch` is clean;
- explicit note that no OAC files were changed.

Do not merge to `main`, push a tag, publish npm packages, or start OAC consumption until the user explicitly asks.
