# MetaApp Host Bridge V1 Host Requirements

## Audience

This document is for Agent Browser Core downstream hosts, especially Open Agent Connect and IDBots.
It defines what a host must implement after consuming the MetaApp Host Bridge v1 capable ABC
packages.

MetaApp authors should read `docs/custom-bot-homepage-metaapp-guide.md` instead. The protocol design
source is `docs/superpowers/specs/2026-06-30-metaapp-host-bridge-v1-design.md`, and the compile-time
host contract lives in `packages/host-contract/src/index.ts`.

## Summary

ABC provides the shared iframe bridge, in-Browser navigation, request validation, sanitized actor
snapshots, and host-neutral TypeScript contracts. A downstream host provides the real side effects:

- current Actor Bot selection;
- host-controlled confirmation UI;
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
7. Keep Browser core host-neutral. OAC, IDBots, wallet, database, IPC, filesystem, and daemon details
   must stay inside the downstream host adapter or wrapper.

Hosts may use different internal routes or IPC methods, but the ABC page must observe the same
request and response semantics.

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
- Show a host-owned confirmation UI before signing or broadcasting.
- The confirmation UI should display the actor, operation, path, content type, payload size, and
  optional `display.title` and `display.summary`.
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
  host-owned confirmation flow.
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
  confirmation flow.
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
- Keep all write, upload, signer, wallet, and file access behind host confirmation.
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
- The host confirmation UI shows the current actor and the write details before signing.
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
