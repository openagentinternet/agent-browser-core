# MetaApp Host Bridge V1 Host Requirements

## Audience

This document is for Agent Browser Core downstream hosts, especially Open Agent Connect and IDBots.
It defines what a host must implement after consuming the MetaApp Host Bridge v1 capable ABC
packages.

MetaApp authors should read `docs/custom-bot-homepage-metaapp-guide.md` instead. The protocol design
source is `docs/superpowers/specs/2026-06-30-metaapp-host-bridge-v1-design.md`, and the compile-time
host contract lives in `packages/host-contract/src/index.ts`.

> **V1.1 (LLM completion + session protocol-write grants):** hosts consuming a package with the
> v1.1 contract must also implement the `llm-complete` and `permissions-request` trusted action
> kinds described in [MetaApp Host Bridge V1.1](#metaapp-host-bridge-v11). The v1.1 design source
> is `docs/superpowers/specs/2026-08-05-metaapp-host-bridge-v1-1-design.md`. The v1
> "persistent permission grants" non-goal is relaxed to session-scoped, in-memory grants only.

## Summary

ABC provides the shared iframe bridge, in-Browser navigation, request validation, sanitized actor
snapshots, host-neutral TypeScript contracts, and the shared PIN-write confirmation modal. A
downstream host provides the real side effects and authorization:

- current Actor Bot selection;
- host-issued, single-use confirmation authorization;
- MetaID PIN transaction building, signing, and broadcast;
- MetaFile file picking, upload, and progress handling;
- stable success and error responses back to the ABC bridge.

The bridge is a JavaScript `postMessage` bridge, not a `map://` command protocol. `map://` remains a
semantic Agent Internet URI for navigation and resource references. Navigation goes through
`window.AgentBrowser.navigate(...)` and is owned by ABC UI; writes, actor reads, and uploads go
through `window.AgentBrowser.request(...)` and the host adapter.

## Required Host Integration

1. Consume an ABC package version that includes MetaApp Host Bridge v1.
2. Serve the generated ABC Browser shell and client script without removing the iframe bridge code.
3. Preserve the packaged ABC Browser page behavior when wrapping, serving, or post-processing it.
4. Provide an ABC API base path whose endpoints are equivalent to:
   - `POST {apiBasePath}/actions`
   - `POST {apiBasePath}/metafile-upload`
5. Wire `POST {apiBasePath}/actions` to the host's `BrowserHostAdapter.runTrustedAction(...)`.
6. Support the new trusted action kinds:
   - `metaid-pin-write`
   - `metafile-upload`
   - `llm-complete` (v1.1)
   - `permissions-request` (v1.1)
7. Keep Browser core host-neutral. OAC, IDBots, wallet, database, IPC, filesystem, and daemon details
   must stay inside the downstream host adapter or wrapper.

Hosts may use different internal routes or IPC methods, but the ABC page must observe the same
request and response semantics.

Package consumption and host capability integration are separate gates. The shared Write PIN modal
is available in ABC `0.4.3`, but updating packages alone does not replace a downstream host's native
confirmation, IPC, signer, or result-normalization path. The host integration is complete only when
the action result described below reaches the generated ABC page intact and the end-to-end
acceptance checks pass.

## Navigation Bridge Compatibility

MetaApps navigate inside the Browser with:

```js
window.AgentBrowser.navigate('metaid://idq1example');
```

The iframe posts this message to the parent Browser page:

```json
{
  "type": "agent-browser:navigate",
  "version": 1,
  "uri": "metaid://idq1example"
}
```

The navigation bridge is implemented by ABC UI. It does not require a host adapter method, trusted
action, signing path, upload endpoint, or Actor Bot selection.

Host compatibility requirements:

- Serve the bridge-capable ABC Browser shell and client script.
- Do not remove or replace ABC's parent-page `agent-browser:navigate` message listener.
- If the host wraps or post-processes rendered Browser HTML, keep the custom MetaApp iframe compatible
  with ABC's active-frame `postMessage` check.
- Do not convert Agent Internet URIs into host-specific routes before they reach ABC navigation.
- Do not treat `map://` navigation as a command execution channel. It is a semantic resource URI.
- Do not require a selected actor for pure navigation.

Downstream hosts normally should not add code specifically for Navigation Bridge. A smoke test is
recommended only when the host wrapper, iframe sandbox, HTML post-processing, or ABC package version
changes.

## Actor Identity Requirements

MetaApps can ask for the current actor:

```js
await window.AgentBrowser.request({ method: 'browser.actor.current' });
```

ABC returns a sanitized MetaID identity snapshot:

```ts
interface MetaAppBridgeActor {
  uri: string;
  globalMetaId: string;
  name: string;
  avatarPinId?: string;
}
```

Host requirements:

- Provide the selected actor to ABC runtime state with a stable host-local `actorId`, display label,
  and `globalMetaId`.
- Return `actor: null` when no actor is selected.
- Prefer a chain-backed avatar file PIN id for `avatarPinId` when available. Omit the field when it
  is not available.
- Do not expose host kind, adapter id, wallet address, signer details, filesystem paths, HTTP avatar
  URLs, local profile URLs, or capabilities to MetaApps.
- Emit or preserve `browser.actor.changed` behavior when the selected actor changes in the Browser
  page.
- Treat the actor snapshot as display context only. The host must re-read the current actor at write
  or upload execution time.

### Identity Disclosure Consent

Because MetaApps are untrusted content, a Browser host MUST NOT disclose the connected identity
(MetaID, display name, avatar) to a MetaApp without an explicit, per-resource user approval. This
applies to both the `browser.actor.current` response and `browser.actor.changed`
events. When the user has not approved, the host answers `browser.actor.current`
with a `{ code: 'consent_denied' }` bridge error and suppresses
`browser.actor.changed` events for that resource. Approvals may be held in
memory only (reset on page reload); hosts MUST NOT persist a blanket
"always allow for all MetaApps" grant.

## MetaID PIN Write Requirements

MetaApps request a write with:

```js
await window.AgentBrowser.request({
  method: 'metaid.pin.write',
  params: {
    operation: 'create',
    path: '/protocols/simplebuzz',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value: '{"content":"hello"}' },
    display: { title: 'Publish post', summary: 'hello' }
  }
});
```

ABC forwards this to the host action endpoint as:

```json
{
  "resourceUri": "metaapp://...",
  "kind": "metaid-pin-write",
  "payload": {
    "operation": "create",
    "path": "/protocols/simplebuzz",
    "encryption": "0",
    "version": "1.0.0",
    "contentType": "application/json;utf-8",
    "payload": { "encoding": "utf8", "value": "{\"content\":\"hello\"}" },
    "display": { "title": "Publish post", "summary": "hello" }
  }
}
```

Host requirements:

- Accept `create`, `modify`, and `revoke` as peer operations.
- Treat `path` as operation-specific: `create` requires an absolute MetaID protocol path beginning
  with `/`; `modify` and `revoke` require `@<pinId>` and target that existing PIN.
- When `originalId` is present for `modify` or `revoke`, require it to match the `@<pinId>` target.
- Allow `revoke` to carry an empty UTF-8 payload.
- Validate the payload again in the host adapter. ABC validation is only the first boundary.
- Require a selected actor with a usable MetaID signing path.
- Re-read the selected actor at execution time, even when the request includes an `actorId` query
  parameter from the Browser page.
- Before signing or broadcasting, return the structured two-phase confirmation response documented
  below. ABC renders the shared confirmation modal; the host still owns authorization and execution.
- Build the MetaID OP_RETURN tuple from the request fields: `metaid`, operation, path, encryption,
  version, content type, and payload body.
- Broadcast using the host's current Actor Bot signing and broadcast stack.
- Return the actual actor used for the write.
- Do not let MetaApps access private keys, arbitrary signing, wallet balances, payment APIs, or raw
  transaction builders.

Successful result data must match:

```ts
interface BrowserMetaIdPinWriteResult {
  pinId: string;
  txid: string;
  operation: 'create' | 'modify' | 'revoke';
  path: string;
  actor: MetaAppBridgeActor;
}
```

The host action response should wrap that result in the existing Browser command result shape.

### Shared Two-Phase Confirmation

For a PIN write that has not been authorized, return `manual_action_required` with sanitized display
data and a host-issued confirmation request:

```ts
browserManualActionRequired(
  'manual_action_required',
  'Confirm this MetaID PIN write before the host signs or broadcasts it.',
  {
    data: {
      confirmation: {
        actor,
        operation: request.operation,
        path: request.path,
        contentType: request.contentType,
        payloadSize,
        confirmationId,
        expiresAt,
        display: request.display
      },
      confirmRequest: {
        resourceUri,
        kind: 'metaid-pin-write',
        payload: {
          ...request,
          confirmed: true,
          hostConfirmation: { id: confirmationId, token: opaqueToken }
        }
      }
    }
  }
);
```

ABC keeps `confirmRequest` in the trusted parent page, displays only `confirmation`, and resubmits the
exact host-issued request after the user chooses **Write PIN**. The MetaApp iframe receives only the
final success or error response and never receives the host token.

### Result Transport Invariants

Every route, IPC handler, preload method, renderer wrapper, and host adapter between the trusted host
service and the generated ABC page must preserve the complete `BrowserCommandResult`. In particular,
the first response must still contain all of these fields when ABC receives it:

```ts
{
  ok: false,
  state: 'manual_action_required',
  code: 'manual_action_required',
  message: 'Confirm this MetaID PIN write before the host signs or broadcasts it.',
  data: { confirmation, confirmRequest }
}
```

Do not normalize that response with code equivalent to:

```ts
return browserFailure(result.code, result.message);
```

That conversion discards `state`, `data.confirmation`, and `data.confirmRequest`, so ABC cannot
recognize the two-phase flow or display the shared modal. Return the original structured result, or
construct an equivalent `browserManualActionRequired(...)` result with the full data envelope.

If the host uses HTTP internally, treat `manual_action_required` as an expected command state rather
than a transport error; return a response that the Browser client can parse normally. If the host
uses IPC, resolve the IPC call with the complete result instead of throwing or reducing it to only a
code and message.

The first request must issue authorization only. It must not open a host-native confirmation, sign,
build a transaction with irreversible side effects, or broadcast. Only the second, exact
`confirmRequest` may consume the authorization and reach the signing path.

Host requirements:

- Bind the confirmation to the actor, resource URI, normalized write request, an expiration time,
  and a single use.
- Re-read the current actor and validate the confirmation when the second request arrives.
- Reject client-supplied `confirmed` fields unless a valid host-issued authorization accompanies
  them.
- Consume the authorization before signing so retries cannot replay it.
- Return `user_cancelled`, `pin_write_failed`, or another stable error when the write cannot finish.

A host with an existing trusted native confirmation can continue returning the final success result
directly. To adopt the shared ABC visual treatment, it should switch to the structured two-phase
response instead of opening its native dialog.

`commandApi()` intentionally resolves `waiting` and `manual_action_required` responses; it does not
throw them. A host wrapper that still intercepts `handleBridgePinWrite` must inspect the resolved
result in `.then(...)` or after `await`. Do not put the confirmation branch only in `.catch(...)`.
Hosts consuming an ABC package that includes the shared flow should remove custom PIN-write modal
overrides and let ABC handle both Browser chrome actions and MetaApp iframe requests consistently.

## MetaFile Upload Requirements

MetaApps request large file upload with:

```js
await window.AgentBrowser.request({
  method: 'metafile.upload',
  params: {
    source: { kind: 'host-picker', multiple: true, accept: ['application/pdf'] },
    purpose: 'netdisk'
  }
});
```

ABC forwards this to:

```text
POST {apiBasePath}/metafile-upload
```

Host requirements:

- Support `source.kind = 'host-picker'` for v1 when file upload is implemented.
- Open the host-owned file picker instead of exposing local file paths to iframe content.
- Apply host-owned limits for file size, count, content type, and upload time.
- Use the current actor selected at execution time for upload ownership/signing when the upload
  protocol requires an actor.
- Return only MetaID resource identifiers and file metadata to the MetaApp.
- Prefer `metafile://{pinId}.{ext}` when a safe extension is known.
- Do not return HTTP download URLs, local file paths, temporary upload URLs, or host-specific status
  routes to the MetaApp.
- If upload is unavailable, return a stable bridge error instead of silently doing nothing.

Successful result data must match:

```ts
interface BrowserMetaFileUploadResult {
  files: Array<{
    pinId: string;
    uri: string;
    name: string;
    size: number;
    contentType: string;
    contentHash?: string;
    actor: MetaAppBridgeActor;
  }>;
}
```

Large application data should use this flow: upload file content as MetaFiles first, then write a
small application-level MetaID PIN that references the returned `metafile://...` URI.

## Error Requirements

Hosts should preserve stable bridge-level error codes whenever possible:

- `invalid_request`
- `unsupported_method`
- `invalid_params`
- `actor_required`
- `manual_action_required`
- `user_cancelled`
- `consent_denied`
- `consent_pending`
- `upload_failed`
- `pin_write_failed`

Host-specific lower-level errors should be mapped to one of these bridge-level codes before they are
returned to the MetaApp. The user-facing message may be host-specific, but it must not include
private keys, local paths, stack traces, tokens, internal route names, or daemon details.

## OAC Implementation Notes

OAC should implement the bridge through its Browser wrapper, daemon UI routes, and OAC Browser host
adapter.

Recommended OAC responsibilities:

- Update the ABC package dependency to the bridge-capable version.
- Ensure the rendered Browser page uses the ABC client script with the expected API base path.
- Do not add an OAC-specific Navigation Bridge adapter. Navigation is ABC-owned; OAC only needs to
  avoid breaking the packaged Browser shell.
- If the OAC Browser wrapper changes, smoke-test that a custom MetaApp can still navigate to an Agent
  Internet URI inside Browser.
- Route `POST /api/browser/actions` or the OAC-equivalent Browser action route to the OAC Browser
  host adapter.
- Add `metaid-pin-write` handling in the OAC Browser host adapter.
- Connect that handling to the selected OAC Actor Bot identity, existing MetaID write stack, and
  host-issued two-phase confirmation flow.
- Remove wrapper-level `handleBridgePinWrite` confirmation overrides after adopting ABC's shared
  modal; otherwise Browser chrome writes and iframe writes can follow different code paths.
- Add or route `POST /api/browser/metafile-upload` to the OAC-owned MetaFile upload flow.
- Keep OAC identity ids, local daemon routes, database ids, and wallet internals out of bridge
  responses.
- Verify that changing the OAC selected actor updates the Browser actor state used by bridge
  requests.

OAC should not fork the MetaApp bridge API. Any OAC-specific behavior should stay behind the shared
ABC host contract.

## IDBots Implementation Notes

IDBots should implement the bridge through the Bot Browser renderer wrapper, preload/main-process IPC,
and IDBots Browser host adapter.

Recommended IDBots responsibilities:

- Update the ABC package dependency to the bridge-capable version.
- Preserve the ABC iframe bridge when assigning or post-processing rendered Browser HTML.
- Do not add an IDBots-specific Navigation Bridge adapter. Navigation is ABC-owned; IDBots only needs
  to avoid breaking the packaged Browser shell.
- Keep the iframe sandbox compatible with bridge messaging and MetaApp execution.
- If Bot Browser post-processes rendered Browser HTML or iframe sandboxing, smoke-test that a custom
  MetaApp can still navigate to an Agent Internet URI inside Browser.
- Route Browser action requests from renderer to main process through explicit IPC handlers.
- Add `metaid-pin-write` handling in the IDBots Browser host adapter or main-process service layer.
- Connect that handling to the selected Bot identity, existing MetaID write stack, and host-owned
  confirmation authorization.
- To use the shared visual treatment, return the two-phase response from trusted main-process code
  instead of opening an Electron `dialog.showMessageBox` confirmation.
- Replace any `confirmPinWrite` callback that immediately opens a native dialog with a trusted
  main-process authorization issuer and validator. The first call returns
  `browserManualActionRequired(...)`; the confirmed second call validates and consumes the opaque
  authorization before invoking the existing PIN writer.
- Preserve `manual_action_required` unchanged through main-process IPC, preload, the renderer bridge,
  `BrowserHostAdapter.runTrustedAction(...)`, and the Browser action endpoint. Do not convert every
  `ok: false` result into `browserFailure(...)`.
- Keep the complete structured result body when mapping it to an HTTP-like response. A
  `manual_action_required` result is a successful transport round trip even though its command-level
  `ok` value is `false`.
- Remove the old native confirmation path after the shared flow passes end-to-end tests. Keeping both
  paths can produce two prompts or let Browser chrome writes and MetaApp iframe writes diverge.
- Add a host-owned file picker for `metafile.upload`; the renderer iframe must not receive local file
  paths.
- Return sanitized `pinId`, `txid`, `metafile://...`, and actor snapshots only.
- Verify that actor changes in Bot Browser emit or preserve `browser.actor.changed` for the active
  MetaApp iframe.

IDBots should keep Electron IPC, local filesystem access, and main-process services behind the host
adapter boundary.

## Security Requirements

- Accept bridge messages only from the active MetaApp iframe.
- Treat MetaApps as untrusted content, even when they are chain-hosted.
- Keep all write, upload, signer, wallet, and file access behind host-controlled authorization.
- Never expose private keys, arbitrary signing, balances, payments, host routes, local paths, or
  internal ids to iframe content.
- Do not trust display text from MetaApps as protocol authority. It is only confirmation copy.
- Do not trust actor snapshots from MetaApps. Actor selection belongs to the host.
- Do not return Web2 avatar URLs, HTTP file URLs, explorer URLs, or host-specific status URLs in v1
  bridge results.

## Acceptance Checklist

A downstream host implementation is ready when all of these checks pass:

- If the host changed its Browser wrapper, iframe sandbox, HTML post-processing, or ABC package
  version, a custom MetaApp can still call `window.AgentBrowser.navigate(...)` and open an Agent
  Internet URI inside Browser.
- A custom MetaApp can call `browser.actor.current` and receive only MetaID actor fields.
- A custom MetaApp receives `browser.actor.changed` when the user switches the selected actor.
- A valid `metaid.pin.write` request reaches the host adapter as `metaid-pin-write`.
- The first PIN-write request returns `manual_action_required` with both `confirmation` and
  `confirmRequest`, and neither the signer nor broadcaster has run.
- The shared ABC confirmation modal shows the current actor and write details, backed by a
  host-issued authorization, before signing.
- Choosing **Write PIN** submits the exact host-issued `confirmRequest`; the host validates and
  consumes it once, then returns the final write result.
- Cancelling the modal sends no confirmed request and performs no signing or broadcast.
- Browser chrome Share and a MetaApp iframe `metaid.pin.write` request use the same shared
  confirmation path; no host-native PIN confirmation appears in either flow.
- Host adapter tests assert preservation of `state`, `data.confirmation`, and `data.confirmRequest`
  across route or IPC boundaries, including an `ok: false` result.
- `create`, `modify`, and `revoke` all either succeed through the same code path or fail with a
  documented bridge error.
- Successful writes return `pinId`, `txid`, operation, path, and sanitized actor.
- Invalid write payloads fail without reaching the signer.
- `metafile.upload` opens a host-owned picker when supported.
- Successful uploads return `metafile://...` references and sanitized file metadata.
- Unsupported upload returns a stable bridge error.
- No bridge response contains local paths, wallet objects, private data, Web2 avatar URLs, HTTP file
  URLs, explorer URLs, OAC routes, IDBots routes, or daemon/IPC details.
- Messages from inactive iframes are ignored or rejected.

## Non-Goals For Host V1

- Persistent permission grants.
- Batch writes.
- MetaApp-provided `File` object streaming.
- Drag-and-drop upload streaming.
- Upload progress events inside the MetaApp iframe.
- Wallet balance, payment, transfer, or arbitrary signing APIs.
- Host-specific bridge methods exposed to MetaApps.

## MetaApp Host Bridge V1.1

V1.1 adds two capabilities to the v1 bridge for LLM-driven MetaApps (for example the on-chain
chess MetaApp, which runs its whole move loop inside the iframe). The v1 security model is
unchanged: the MetaApp stays untrusted, the host owns every side effect and the authorization
state, and bridge responses never leak host internals. The v1 "persistent permission grants"
non-goal is relaxed to session-scoped, in-memory grants.

### V1.1: `browser.llm.complete` (host local LLM completion)

MetaApps request one text completion on the host's own LLM stack:

```js
await window.AgentBrowser.request({
  method: 'browser.llm.complete',
  params: {
    messages: [
      { role: 'system', content: 'You are a Chinese chess player.' },
      { role: 'user', content: '<board text + legal move list>' }
    ],
    options: { temperature: 0.7, maxOutputTokens: 512, timeoutMs: 120000 },
    purpose: 'llmchess-move'
  }
});
// success: { text: string; model?: string; finishReason?: 'stop' | 'length' | 'error' }
```

Host requirements:

- Support the trusted action kind `llm-complete` on `POST {apiBasePath}/actions`. The payload
  is `{ messages, options?, purpose? }`; the result data is `{ text, model?, finishReason? }`.
- Wire it to the host's local LLM stack (IDBots: MetaBot LLM session layer; OAC: the agent LLM
  configuration). The host picks the model and configuration; the MetaApp cannot.
- Consent model: same level as the v1 Identity Disclosure Consent. ABC gates the first call per
  resource with an in-memory consent card; the host may additionally reject with
  `consent_denied`. Approval must never be a persistent, global "allow for all MetaApps".
- Rate limiting and quotas are host-owned (suggested defaults): one in-flight completion per
  resource, ≤ 6 completions per minute per resource, completion timeout capped at 180 s.
  Exceeded limits return `rate_limited` / `llm_timeout`.
- Sanitize responses: no API keys, endpoints, local paths, or internal routing details; `model`
  is a display-grade name only.
- V1.1 does not support streaming, tool calls, or multimodal input.
- Error codes: `consent_denied`, `llm_unavailable`, `llm_timeout`, `rate_limited`, plus the
  existing `invalid_params` / `unsupported_method`.

### V1.1: `browser.permissions.request` (session protocol-write grants)

MetaApps ask once for session-scoped, no-confirmation `metaid.pin.write` access to exact
`/protocols/` paths:

```js
await window.AgentBrowser.request({
  method: 'browser.permissions.request',
  params: {
    grants: [
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupcreate' },
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupjoin' },
      { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' }
    ],
    reason: 'Write chess moves automatically during the game.'
  }
});
// success: { granted: Array<{ method, operation, path }>; expiresAt?: number }
```

Flow and host responsibilities:

- Support the trusted action kind `permissions-request`. Phase 1 carries `{ grants, reason }`
  and must return `manual_action_required` with `data.confirmation` (actor, grants, reason) and
  a host-issued `data.confirmRequest` carrying an opaque authorization, exactly like the shared
  PIN-write flow. ABC renders the card and resubmits the exact `confirmRequest` on approval.
- The authorization is all-or-nothing per request group: no per-path checkboxes.
- Only `operation: 'create'` may ever be granted. `modify` / `revoke` always keep the v1
  two-phase confirmation.
- Paths must be exact `/protocols/<name>` paths. No wildcards. The host keeps a **protocol
  whitelist policy** (initial suggestion: `simplegroupcreate`, `simplegroupjoin`,
  `simplegroupchat`); sensitive protocols (`metaapp`, `simplemsg`, payment-related, ...) must
  never qualify. Off-list grants return `consent_denied` with a message.
- The host records approved grants in memory bound to the four-tuple `(resourceUri, actorId,
  operation, exact path)` plus the page session. ABC sends a fresh `sessionId` on every trusted
  action request (`BrowserTrustedActionInput.sessionId`); scope grants by it so page refresh
  invalidates them. Actor switch and navigation away are covered by the actor/resource binding.
  No persistent grants.
- On a grant hit, `metaid.pin.write` must skip the `manual_action_required` two-phase envelope
  and go straight to the existing validation → signing → broadcast path, returning the standard
  `BrowserMetaIdPinWriteResult`. Misses keep the v1 flow unchanged.
- Granted-write rate limit (host-owned, suggested default): ≤ 12 writes per minute per
  resource, payload ≤ 16 KB. Exceeded limits return `rate_limited` / `invalid_params`, never
  silent queuing.
- Revocation: `permissions-request` with `{ revoke: true }` drops the session's grants
  immediately and returns `{ revoked: true }`. ABC renders a visible chrome indicator while the
  current resource holds grants and offers the one-click revoke entry; it also fires an
  automatic revoke when the active resource changes.
- Grant and write events should be recorded in the host's local audit log (trace) for later
  review.
