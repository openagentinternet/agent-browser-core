# MetaApp Host Bridge V1.1 (LLM + Session Grants) — Implementation Plan

> **Status:** Implemented and verified. `npm run verify` passes (502 tests).

**Goal:** Add the two MetaApp Host Bridge v1.1 capabilities requested by the LLM chess MetaApp
requirement (`01-abc-requirements.md`): `browser.llm.complete` (host local LLM completion) and
`browser.permissions.request` (session-scoped, whitelisted no-confirmation PIN writes), keeping
the v1 security model (host owns authorization; ABC renders; memory-only, session-scoped grants).

**Architecture:** Both capabilities ride the existing trusted-action channel
(`POST {apiBasePath}/actions`). ABC (`packages/ui/src/browser/app.ts`) validates, gates consents
per resource in memory, renders cards, and resubmits the exact host-issued confirmRequest (same
pattern as the shared PIN-write flow). The host adapter (standalone reference) owns the LLM
stack, the protocol whitelist, the grant store (keyed by page session id + actor + resource +
operation + path), and the rate limits. ABC generates a fresh `sessionId` per page load and sends
it on every trusted action so grants die on page refresh; navigation away and actor switch are
covered by the resource/actor bindings plus an active revoke on resource change.

**Tech Stack:** TypeScript workspace, Node built-in test runner with `node:vm` + FakeElement UI
harness, no frameworks.

**Spec:** `docs/superpowers/specs/2026-08-05-metaapp-host-bridge-v1-1-design.md`

---

## Working context

- **Worktree:** `metaapp-host-bridge-v1-1` (branch `feat/metaapp-host-bridge-v1-1`). All paths
  below are relative to that root.
- **Build:** `npm run build` (ESM + CJS). For TDD loops, `npm run build:esm` suffices.
- **Targeted tests:** `node --test tests/ui/browserBridgeLlmPermissions.test.mjs` /
  `tests/host-standalone/standaloneBridgeV1_1.test.mjs`; full suite: `npm run verify`.
- **Served-script escaping:** the client script in `packages/ui/src/browser/app.ts` is ONE giant
  TS template literal (`buildBrowserPageScript()`). New JS inside it MUST NOT contain backticks
  or `${`; regex literals must escape slashes as `\\/` in the TS source (e.g.
  `/^\\/protocols\\/[A-Za-z0-9_-]+$/`). `page.ts` must keep `split(placeholder).join(value)`.
- **Language:** code, comments, tests, docs in English. Commit messages `<type>: <description>`.
- **Commits:** one commit per unit of work; after each commit post a dev-journal buzz with the
  Bob identity (repo rule from AGENTS.md).

---

### Task 1: Host contract — new kinds, v1.1 types, sessionId

**Files:**
- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`

- [x] **Step 1: Kinds + types.** Add `'llm-complete'` and `'permissions-request'` to
  `BrowserTrustedActionKind`; add `sessionId?: string` to `BrowserTrustedActionInput`; add
  `BrowserLlmCompleteMessage/Payload/Result`, `BrowserPermissionGrant`,
  `BrowserPermissionsRequestPayload/Result/Confirmation/ConfirmRequest/ManualActionData`.
- [x] **Step 2: test-harness kind list.** Extend `TRUSTED_ACTION_KINDS`.

### Task 2: UI bridge — `browser.llm.complete` + LLM consent gate

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

- [x] **Step 1: State.** `state.llmConsent` (per-resource memory), `state.pendingLlmConsent`.
- [x] **Step 2: Handler.** `validateLlmCompleteParams` (roles, 64 KB cap, options bounds),
  `handleBridgeLlmComplete` (consent gate → `forwardLlmComplete` via kind `llm-complete`),
  consent card (`llm-consent-allow`), `flushPendingLlmConsent` beside every
  `flushPendingActorConsent` site, `consent_pending` cross-checks.
- [x] **Step 3: Dispatcher.** Route `browser.llm.complete` in `handleBrowserBridgeMessage`.

### Task 3: UI bridge — `browser.permissions.request` + chrome indicator + revoke

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

- [x] **Step 1: Handler.** `validatePermissionsRequestParams` (create-only, exact
  `/protocols/<name>` paths), `handleBridgePermissionsRequest` two-phase flow
  (forward → render card from host `confirmation` → resubmit exact `confirmRequest` → mirror
  `granted`), host `consent_denied` passthrough, `user_cancelled`.
- [x] **Step 2: Chrome.** `data-browser-auto-write` badge in the shell, `syncAutoWriteContext`
  from `applyActiveTabState` (revokes the previous resource's grants on change), revoke modal
  and `{ revoke: true }` call.
- [x] **Step 3: Session id.** `browserSessionId` (crypto.randomUUID with fallback) attached to
  every trusted action request (pin write, permissions, llm).

### Task 4: Standalone host — reference adapter + memory host

**Files:**
- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Modify: `packages/host-standalone/src/http.ts`

- [x] **Step 1: Adapter.** Injectable `llmComplete` handler (`llm_unavailable` default);
  LLM policy (1 in-flight, ≤ 6/min, timeout ≤ 180 s); `permissions-request` two-phase with
  host-issued token, whitelist (`simplegroupcreate/join/chat`), session-scoped grant store;
  `metaid-pin-write` grant hit skips the confirmation envelope (host policy: ≤ 12/min,
  ≤ 16 KB payload); `{ revoke: true }`.
- [x] **Step 2: Memory host.** Same kinds for the dev host (no LLM, immediate grants, same
  whitelist).
- [x] **Step 3: HTTP.** Pass `sessionId` through `/api/browser/actions`.

### Task 5: Tests

**Files:**
- Add: `tests/ui/browserBridgeLlmPermissions.test.mjs`
- Add: `tests/host-standalone/standaloneBridgeV1_1.test.mjs`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`
- Modify: `tests/host-contract/conformance.test.mjs`
- Modify: `tests/test-harness/commandResultShape.test.mjs`
- Modify: `tests/ui/browserPageActions.test.mjs` / `tests/ui/browserPageRenderers.test.mjs`
  (inject `crypto.randomUUID` stub, expect `sessionId: 'test-session'` in exact request bodies)

- [x] **Step 1: UI tests** (12): validation, consent allow/deny/remembered/pending, error
  mapping, permissions shape validation, approval card, exact confirmRequest, cancel, policy
  denial, granted write skips modal, badge + revoke, navigation-away revoke.
- [x] **Step 2: Standalone tests** (14): llm unavailable/handler/rate limit/concurrency/timeout,
  whitelist, malformed grants, forged/expired confirmations, four-tuple + session binding,
  revoke, granted-write limits, v1 fallback.
- [x] **Step 3: HTTP/conformance tests**: sessionId passthrough + grant flow over HTTP; new
  kinds through `assertBrowserHostConformance`; result shapes.

### Task 6: Docs

**Files:**
- Add: `docs/superpowers/specs/2026-08-05-metaapp-host-bridge-v1-1-design.md`
- Add: `docs/superpowers/plans/2026-08-05-metaapp-host-bridge-v1-1.md`
- Modify: `docs/metaapp-host-bridge-v1-host-requirements.md` (v1.1 sections)
- Modify: `docs/custom-bot-homepage-metaapp-guide.md` (authoring examples)

### Task 7: Verification

- [x] `npm run verify` — 502 tests pass.
