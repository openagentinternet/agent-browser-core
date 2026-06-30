# MetaApp Host Bridge V1 Design

## Goal

MetaApps should be able to behave like real Agent Internet applications, not only static pages.
They need a host-neutral way to:

- navigate to Agent Internet resources;
- read the current actor identity;
- react when the current actor changes;
- upload files as MetaFiles;
- request MetaID PIN writes through the current actor.

The bridge must preserve MetaID semantics. MetaApps should see chain identity and chain resource
references, not OAC routes, IDBots internals, Web2 avatar URLs, wallet objects, or host adapter
details.

## Relationship To The Navigation Bridge

The existing custom homepage navigation bridge remains the read/navigation side of the MetaApp
surface. It lets iframe content request internal Browser navigation with:

```json
{
  "type": "agent-browser:navigate",
  "version": 1,
  "uri": "metaid://idq1..."
}
```

MetaApp Host Bridge v1 extends the same concept with request/response and event messages. The
public authoring helper should expose one `window.AgentBrowser` namespace:

```js
window.AgentBrowser.navigate("metaid://idq1...");
const actor = await window.AgentBrowser.request({ method: "browser.actor.current" });
```

The helper must extend an existing `window.AgentBrowser` object instead of replacing it, so the
navigation helper and host-action helper can be loaded in either order.

## Non-Goals

- Do not expose wallet APIs, private keys, signers, balances, payment, transfer, or arbitrary signing.
- Do not expose OAC, IDBots, standalone, route, daemon, local database, or local filesystem internals.
- Do not return Web2 avatar URLs, preview URLs, explorer URLs, or host-specific URLs to MetaApps.
- Do not let MetaApps bypass host confirmation for writes or uploads.
- Do not define persistent permission grants in v1. Hosts may add confirmation caching later.
- Do not encode write requests as `pin://create/...` or another URI path format.
- Do not batch multiple writes into one bridge call in v1.

## Bridge Transport

Iframe MetaApps communicate with ABC through `postMessage`. The parent page accepts bridge messages
only from the active `iframe.browser-html-frame`, matching the navigation bridge security model.

Request message:

```json
{
  "type": "agent-browser:request",
  "version": 1,
  "id": "request-id",
  "method": "metaid.pin.write",
  "params": {}
}
```

Response message:

```json
{
  "type": "agent-browser:response",
  "version": 1,
  "id": "request-id",
  "ok": true,
  "result": {}
}
```

Error response:

```json
{
  "type": "agent-browser:response",
  "version": 1,
  "id": "request-id",
  "ok": false,
  "error": {
    "code": "manual_action_required",
    "message": "Select an actor before writing a PIN."
  }
}
```

Event message:

```json
{
  "type": "agent-browser:event",
  "version": 1,
  "event": "browser.actor.changed",
  "payload": {
    "actor": {}
  }
}
```

The public helper should provide:

```ts
window.AgentBrowser.request(input): Promise<unknown>
window.AgentBrowser.on(eventName, handler): () => void
window.AgentBrowser.navigate(uri): void
```

## Actor Identity

MetaApps can read the current actor, but the returned object is a MetaID identity snapshot, not a
host runtime actor.

Method:

```ts
browser.actor.current
```

Response:

```ts
interface MetaAppBridgeActor {
  uri: string;          // metaid://{globalMetaId}
  globalMetaId: string;
  name: string;
  avatarPinId?: string;
}

interface ActorCurrentResult {
  actor: MetaAppBridgeActor | null;
}
```

Rules:

- `uri` must be `metaid://{globalMetaId}`.
- `name` should come from the actor's MetaID profile when available.
- `avatarPinId` should be the raw avatar file PIN id when available.
- Do not return host kind, actor id, adapter id, Web2 avatar URL, capabilities, wallet address, or
  local profile path.
- If no actor is selected, return `{ actor: null }`.

Actor changes are delivered through:

```ts
browser.actor.changed
```

Payload:

```ts
{
  actor: MetaAppBridgeActor | null
}
```

This lets a MetaApp update UI such as "posting as Bob" when the user switches the Browser actor.

## MetaID PIN Write

MetaApps request one MetaID PIN write at a time. The MetaApp supplies the MetaID tuple data. The
host chooses the current actor, confirms the action, builds the transaction, signs it, broadcasts it,
and returns chain identifiers.

Method:

```ts
metaid.pin.write
```

Request:

```ts
interface MetaIdPinWriteRequest {
  operation: "create" | "modify" | "revoke";
  path: string;
  encryption: string;
  version: string;
  contentType: string;
  payload: {
    encoding: "utf8" | "base64";
    value: string;
  };
  originalId?: string;
  appAction?: string;
  display?: {
    title?: string;
    summary?: string;
  };
}
```

Response:

```ts
interface MetaIdPinWriteResult {
  pinId: string;
  txid: string;
  operation: "create" | "modify" | "revoke";
  path: string;
  actor: MetaAppBridgeActor;
}
```

Rules:

- `operation`, `path`, `encryption`, `version`, `contentType`, and `payload` map directly to the
  MetaID OP_RETURN tuple: `metaid`, operation, path, encryption, version, content type, content body.
- `create`, `modify`, and `revoke` are first-class peer operations in v1.
- ABC must not interpret app-level protocols such as simplebuzz, notes, likes, replies, or netdisk.
- The parent bridge validates the basic schema before forwarding to the host.
- The host must re-read the active actor at execution time. A previously returned actor snapshot is
  display context only.
- The host confirmation UI should show the actual actor, operation, path, content type, payload size,
  and optional display title/summary.
- The result returns the actual actor used for the write.
- Do not return explorer URLs or host-specific status routes to the MetaApp in v1.

## MetaFile Upload

Large content should not be base64-embedded into `metaid.pin.write`. A MetaApp that needs a netdisk,
media, document, or attachment workflow should upload file content as MetaFiles first, then write a
small application-level PIN that references the resulting `metafile://...` URI.

Method:

```ts
metafile.upload
```

Recommended request for large files:

```ts
interface MetaFileUploadRequest {
  source: {
    kind: "host-picker";
    multiple?: boolean;
    accept?: string[];
  };
  purpose?: string;
}
```

Response:

```ts
interface MetaFileUploadResult {
  files: Array<{
    pinId: string;
    uri: string;          // metafile://{pinId}.{ext} when an extension is known
    name: string;
    size: number;
    contentType: string;
    contentHash?: string;
    actor: MetaAppBridgeActor;
  }>;
}
```

Rules:

- `host-picker` is the v1 default because it lets the host own file access, large-file transport,
  confirmation, and upload progress.
- The returned `uri` should prefer extension-bearing `metafile://{pinId}.{ext}` when file name or
  content type is known.
- Do not return HTTP download URLs.
- Hosts may impose size, count, and content-type limits.
- Hosts may return `manual_action_required` or `failed` when upload support is unavailable.
- App-provided `File` objects, drag-and-drop streaming, and chunk progress events can be v2 features.

## Netdisk Flow Example

```ts
const upload = await window.AgentBrowser.request({
  method: "metafile.upload",
  params: {
    source: { kind: "host-picker", multiple: true },
    purpose: "netdisk"
  }
});

for (const file of upload.files) {
  await window.AgentBrowser.request({
    method: "metaid.pin.write",
    params: {
      operation: "create",
      path: "/protocols/netdisk/file",
      encryption: "0",
      version: "1.0.0",
      contentType: "application/json;utf-8",
      payload: {
        encoding: "utf8",
        value: JSON.stringify({
          name: file.name,
          file: file.uri,
          size: file.size,
          contentType: file.contentType,
          contentHash: file.contentHash || ""
        })
      },
      display: {
        title: "Save file index",
        summary: file.name
      }
    }
  });
}
```

## Authoring Guide Updates

The public MetaApp authoring guide should evolve from a custom homepage navigation guide into a
general MetaApp development guide. It should include:

- supported Agent Internet URI navigation;
- the inline `window.AgentBrowser` helper;
- `browser.actor.current` and `browser.actor.changed`;
- `metaid.pin.write`;
- `metafile.upload`;
- examples for on-chain social posts, likes, notes, and netdisk file indexes;
- a Codex prompt template that tells coding agents to use MetaID URIs, actor snapshots, MetaFile
  upload, and PIN write intents instead of Web2 URLs or host-specific APIs.

## Security Model

The bridge is intentionally narrow:

- only the active MetaApp iframe can send accepted bridge messages;
- method names are allow-listed;
- actor responses contain only MetaID identity fields;
- uploads and writes require host-controlled confirmation;
- write execution uses the actor selected at execution time;
- wallet, payment, arbitrary signing, balances, private keys, host routes, and local files remain
  unavailable to MetaApps;
- returned resource references are MetaID resource identifiers, not Web2 URLs.

## Error Handling

Bridge errors should use stable codes:

- `bridge_unavailable`
- `invalid_request`
- `unsupported_method`
- `invalid_params`
- `actor_required`
- `manual_action_required`
- `user_cancelled`
- `upload_failed`
- `pin_write_failed`

The helper should reject the request promise with an `Error` whose `code` property is set when the
parent returns `ok: false`.

## Implementation Notes

Likely touch points:

- `packages/host-contract/src/index.ts`
- `packages/core/src/browser/types.ts`
- `packages/ui/src/browser/app.ts`
- `packages/ui/src/browserClientScript.ts`
- `packages/host-standalone/src/adapter.ts`
- `packages/host-standalone/src/memoryHost.ts`
- `tests/ui/browserInteractions.test.mjs`
- `tests/ui/browserPageRenderers.test.mjs`
- `tests/host-contract/conformance.test.mjs`
- `docs/custom-bot-homepage-metaapp-guide.md`

The implementation should keep core host-neutral. ABC UI owns iframe message handling and forwards
trusted operations through the host adapter. OAC and IDBots implement the real MetaFile upload and
MetaID PIN write behavior in their host adapters.

## Test Plan

Add focused tests for:

1. The authoring helper extends an existing `window.AgentBrowser` object.
2. `browser.actor.current` returns a sanitized MetaID identity snapshot.
3. Actor changes emit `browser.actor.changed` to the active iframe.
4. `metaid.pin.write` validates the tuple shape and forwards one trusted host action.
5. `create`, `modify`, and `revoke` are accepted operations.
6. `metafile.upload` supports `source.kind = "host-picker"` and returns only MetaID resource
   references.
7. Unsupported methods, unsupported sources, host-specific URLs, and messages from non-active
   iframes are rejected or ignored.
8. Existing `agent-browser:navigate` behavior still works.
9. The public authoring guide includes navigation, actor, upload, write, and Coding Agent examples.

For docs-only changes, run `git diff --check`. For implementation, run targeted UI and host-contract
tests first, then `npm run verify` before release work.
