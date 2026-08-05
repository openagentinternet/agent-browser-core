# MetaApp Host Bridge V1.1 — Local LLM + Session Protocol-Write Grants — Design

- Date: 2026-08-05
- Status: Implemented (branch `feat/metaapp-host-bridge-v1-1`, worktree `metaapp-host-bridge-v1-1`)
- Requirement source: `llm-play-chinese-chess/docs/01-abc-requirements.md` (LLM 联机象棋 MetaApp)

## Background

The LLM chess MetaApp runs its whole move loop inside the MetaApp iframe: read the board,
call the host's local LLM for a move, then write a `simplegroupchat` PIN. The v1 Host Bridge
cannot express either step, so v1.1 extends it with two capabilities:

1. `browser.llm.complete` — the MetaApp asks the host to run one text completion on the host's
   local LLM stack.
2. `browser.permissions.request` — the MetaApp asks once for session-scoped, no-confirmation
   `metaid.pin.write` access to an exact list of `/protocols/` paths; approved grants let
   subsequent writes skip the shared two-phase confirmation.

Both stay inside the v1 security model: the MetaApp is untrusted, the host owns every side
effect and the authorization state, and bridge responses never leak host internals. The v1
"no persistent permission grants" non-goal is deliberately relaxed to *session-scoped, in-memory*
grants only.

## Capability 1: `browser.llm.complete`

### Contract

```ts
// MetaApp call
await window.AgentBrowser.request({
  method: 'browser.llm.complete',
  params: {
    messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
    options: { temperature?: number; maxOutputTokens?: number; timeoutMs?: number },
    purpose?: string            // display label for the consent card
  }
});
// success: { text: string; model?: string; finishReason?: 'stop' | 'length' | 'error' }
// errors:  consent_denied | llm_unavailable | llm_timeout | rate_limited | invalid_params
```

- Forwarded as trusted action kind `llm-complete` over the existing `POST {apiBasePath}/actions`
  channel.
- **Consent gate (ABC side).** Mirrors the Identity Disclosure Consent: per-resource, in-memory
  only, reset on page reload. The first call per resource opens a consent card (MetaApp, identity,
  purpose); approval or denial is remembered for the page session. No host call happens before
  approval. `consent_pending` when another consent prompt is open.
- **Validation (ABC side).** non-empty `messages`, roles in `system|user|assistant`, total input
  ≤ 64 KB, numeric `options` bounds. Invalid input returns `invalid_params` without a host call.
- **Host adapter.** Wires `llm-complete` to the host's own LLM stack. Host-owned policy: 1
  in-flight completion per resource, ≤ 6 completions/minute per resource, completion timeout
  capped at 180 s. `model` is display-grade only. No streaming, tools, or multimodal in v1.1.
- **Error codes.** v1 codes plus `consent_denied` (pre-existing), `llm_unavailable`,
  `llm_timeout`, `rate_limited`.

## Capability 2: `browser.permissions.request`

### Contract

```ts
// MetaApp call
await window.AgentBrowser.request({
  method: 'browser.permissions.request',
  params: {
    grants: [
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupcreate' },
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupjoin' },
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' }
    ],
    reason: '...'              // untrusted display copy
  }
});
// success: { granted: Array<{method, operation, path}>; expiresAt?: number }
// errors:  consent_denied (policy or user) | invalid_params
```

### Two-phase flow (host-issued confirmation)

Follows the v1 shared PIN-write pattern so the host stays the authorizing party:

1. ABC validates the grant shape (method `metaid.pin.write`, operation `create`, exact
   `/protocols/<name>` path, no wildcards), then forwards `permissions-request` with the grants.
2. The host checks its **protocol whitelist policy** (initial list: `simplegroupcreate`,
   `simplegroupjoin`, `simplegroupchat`; sensitive protocols like `metaapp`, `simplemsg`, and
   payment never qualify). Off-list paths return `consent_denied` with a message.
3. In-policy requests return `manual_action_required` with `data.confirmation` (actor, grants,
   reason) and a host-issued `data.confirmRequest` carrying an opaque authorization token.
4. ABC renders the approval card (actor, resource, paths + operation, untrusted reason, risk
   note) and, on approval, resubmits the exact `confirmRequest`. The host validates the token
   once, records the grants in memory, and returns `{ granted }`.

### Grant semantics (host side)

- Bound to the four-tuple `(resourceUri, actorId, operation, exact path)` plus the Browser page
  **session id**. ABC generates a fresh session id per page load and sends it on every trusted
  action request (`BrowserTrustedActionInput.sessionId`); hosts may scope grants by it.
  Page refresh → new session → grants unreachable. Actor switch and navigation away are covered
  by the resource/actor binding.
- A `metaid.pin.write` request that hits a grant skips the `manual_action_required` two-phase
  envelope and goes straight to the host's validation → signing → broadcast path, returning the
  standard `BrowserMetaIdPinWriteResult`. Misses fall back to the v1 flow unchanged.
- Write rate limit (host policy, suggested default): ≤ 12 granted writes/minute per resource,
  payload ≤ 16 KB; violations return `rate_limited` / `invalid_params`.
- Revocation: `permissions-request` with `{ revoke: true }` drops the session's grants
  immediately. ABC also fires a fire-and-forget revoke when the active resource changes
  (navigation, tab switch, welcome page).

### Browser chrome

ABC keeps a UI-only mirror of the current resource's grants (never the authorization decision):

- A lock badge button in the top bar (`data-browser-auto-write`) is visible while the current
  resource holds grants. Tooltip: "This app can write to approved protocols automatically.
  Click to revoke."
- Clicking it opens a revoke confirmation modal; confirming sends `{ revoke: true }` to the host
  and hides the badge.
- The mirror and the badge sync on grant, revoke, navigation, and tab switches.

## Interaction with identity disclosure

The three consents (identity, LLM, permissions) remain independent per the requirement; a merged
single-card presentation (requirement §3.2 suggestion) is future work. Each gate answers
`consent_pending` while any other consent modal is open.

## Files

| Package | File | Change |
|---|---|---|
| host-contract | `src/index.ts` | kinds `llm-complete`/`permissions-request`; `sessionId`; v1.1 types |
| test-harness | `src/index.ts` | trusted-action kind list |
| ui | `src/browser/app.ts` | bridge methods, consents, approval card, chrome badge, revoke |
| host-standalone | `src/adapter.ts` | reference host: LLM handler + policy + grants + limits |
| host-standalone | `src/memoryHost.ts` | dev-host parity |
| host-standalone | `src/http.ts` | `sessionId` passthrough on `/api/browser/actions` |

## Security notes

- ABC never stores the host's authorization token; the approval card is rendered from
  `data.confirmation` only, and the iframe never sees it.
- Grants are all-or-nothing per request group (no per-path checkboxes) per the requirement.
- LLM output is untrusted text; the chess client validates moves against a rules engine before
  writing (outside this repo's scope).
- The standalone host has no signer, so granted writes prove the *confirmation skip* (the
  result is a `failed` `pin_write_failed`, never a `manual_action_required` envelope) rather
  than fabricating pinIds.

## Test plan

- UI (vm + FakeElement): llm validation, consent allow/deny/remembered/pending, host error
  mapping; permissions shape validation, approval card content, exact confirmRequest resubmit,
  cancel, policy denial, granted-write no-modal, badge + revoke, navigation-away revoke.
- Standalone adapter: llm unavailable/handler/rate limit/concurrency/timeout; permissions
  whitelist, malformed grants, forged/expired confirmations, four-tuple + session binding,
  revoke, granted-write limits, v1 fallback.
- HTTP: `/api/browser/actions` sessionId passthrough and the full grant flow over HTTP.
- Conformance/test-harness: new kinds accepted by `assertBrowserHostConformance`.
