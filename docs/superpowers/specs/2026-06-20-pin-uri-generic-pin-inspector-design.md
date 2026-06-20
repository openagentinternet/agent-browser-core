# Pin URI and Generic Pin Inspector Design

Date: 2026-06-20
Status: Draft for review

## Goal

Add host-neutral `pin://` URI support so Browser can open a chain pin object directly, resolve the
latest effective version through the configured MAN node by default, and render the result with a
generic Pin Inspector.

This spec is intentionally narrow. It defines:

- `pin://` URI semantics;
- version selection rules;
- resolver output contract for generic pin inspection;
- the seven top-level sections of the Generic Pin Inspector page.

## Relationship To Existing URI Families

- `pin://` is an object address: "open this pin object".
- `map://` is a protocol semantic address or protocol action address: "open this resource as a
  protocol meaning" or "perform this protocol action".
- `metaid://`, `metaapp://`, and `metafile://` keep their current meanings.

This supersedes the earlier draft choice that Bot Page detail links should default to
`map://{protocol}/pin/{pinId}`. The new default is:

```text
pin://{pinId}
```

`map://simplemsg/conversation?peer={globalMetaId}` remains unchanged.

## Boundaries

- `pin://` does not encode a protocol name.
- `pin://` does not select a protocol-specific renderer.
- `pin://` does not execute chain-declared renderer code.
- `pin://` does not replace `map://` for conversations, service actions, or future protocol-native
  detail pages.
- Version 1 does not add aliasing for `pin://`.
- Version 1 does not add historical shorthand like `[0]` to `pin://`.

## Pin URI Semantics

### Canonical Forms

Latest effective version:

```text
pin://{pinId}
```

Historical version by MAN history index:

```text
pin://{pinId}?version=0
pin://{pinId}?version=1
```

### Normalization Rules

- The authority is the pin id.
- The canonical normalized form has no path component.
- Pin ids normalize to lowercase.
- The only supported query parameter in version 1 is `version`.
- `version` must be a non-negative integer history index.
- Fragments are not supported.
- Username, password, and port are not supported.

Input compatibility rules:

- Hosts may accept one trailing slash and normalize it away.
- `pin://` does not accept `[N]` shorthand because the pin id lives in the authority position and
  bracket syntax conflicts with URI host parsing.

### Pin Id Validation

Version 1 requires the same pin id format already used by Browser:

```text
64 lowercase or uppercase hex chars + i + non-negative integer suffix
```

Example:

```text
6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
```

## Version Rules

- `pin://{pinId}` resolves through MAN default semantics and means "the latest effective version of
  this object".
- `pin://{pinId}?version=N` resolves through MAN history semantics and means "history index `N` of
  this object".
- Version 1 supports `latest` and `history-index` selectors only.
- Version 1 does not add an `exact` selector.
- Browser must preserve requested identity and resolved identity separately because MAN may return a
  different effective pin than the requested anchor.

Resolver version identity:

```ts
interface ResolvedPinVersion {
  requestedPinId: string;
  rootPinId?: string;
  resolvedPinId: string;
  versionSelector: 'latest' | 'history-index';
  historyIndex?: number;
}
```

## Resolve Flow

1. Parse and normalize `pin://`.
2. Build the MAN request from `browserConfig.manApiBaseUrl`.
3. Fetch:
   - `{manApiBaseUrl}/pin/{pinId}` for latest effective version;
   - `{manApiBaseUrl}/pin/{pinId}?version=N` for history lookup.
4. Normalize the returned pin record and preserve both requested and resolved version identity.
5. Extract chain metadata, owner metadata, content type, content summary, and payload source.
6. Parse payload when the content is already structured or the content type indicates JSON.
7. Return a Browser resource resolved to the Generic Pin Inspector.

The resolver does not choose a protocol-specific renderer from `pin.path`. Even when the pin is a
protocol pin such as `/protocols/simplebuzz`, `pin://` remains a generic object-inspection entry.

## Browser Resource Contract

Version 1 should add a first-class pin resource instead of overloading `protocol`.

```ts
type BrowserResourceType =
  | 'bot'
  | 'metaapp'
  | 'document'
  | 'image'
  | 'pdf'
  | 'protocol'
  | 'conversation'
  | 'pin'
  | 'unsupported'
  | 'unknown';

type BrowserRendererType =
  | 'bot-page'
  | 'html-iframe'
  | 'pdf'
  | 'image'
  | 'video'
  | 'protocol-pin'
  | 'pin-inspector'
  | 'host-action'
  | 'unsupported';
```

`pin://` resolver result:

```ts
interface PinInspectorPinSummary {
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

interface PinInspectorResourceData {
  rendererId: 'generic.pin-inspector';
  version: ResolvedPinVersion;
  pin: PinInspectorPinSummary;
  payload: unknown;
  rawPayload: unknown;
  rawPinRecord: Record<string, unknown>;
}

interface PinResolveResult extends BrowserResolveResult {
  resourceType: 'pin';
  renderer: {
    type: 'pin-inspector';
    contentType: string;
    data: PinInspectorResourceData;
  };
}
```

Contract notes:

- `title` should stay neutral, such as `Pin {shortId}`. Human-friendly field extraction belongs to
  the renderer, not the resolver.
- The resolver should not invent a canonical `content`, `title`, `tag`, or summary projection for
  unknown protocols. The renderer works from payload truth plus declared outer `contentType`.
- `owner` comes from MAN owner metadata when available.
- When `owner.globalMetaId` is present, the UI may use it to show a creator chip and link to the
  creator Bot Page through `metaid://{globalMetaId}`.
- `proof.pinId` should be the resolved pin id.
- `proof.details` should include at least:
  `requestedPinId`, `rootPinId`, `versionSelector`, `historyIndex`, `operation`, `encryption`,
  `version`, and `chainName`.
- `source.raw` may keep the MAN record, but `renderer.data.rawPinRecord` is the canonical renderer
  input for inspection.

## Generic Pin Page Model

The internal renderer id remains `generic.pin-inspector`, but the version 1 presentation should be
a content-first pin page rather than a heavy inspector layout.

### Browser Chrome

The Browser top bar should keep a compact creator chip in the address-row trailing slot.

The chip should:

- show the creator avatar when available;
- show creator name and `GlobalMetaID` from `resource.owner`;
- link to the creator Bot Page through `metaid://{globalMetaId}` when `owner.globalMetaId` exists.

The page body should not repeat the same creator block as a full-width section unless the host has
no browser chrome.

### Primary Sections

The page body should have four primary sections.

### 1. Payload

Purpose: render the payload itself as the main content.

Rules:

- Treat outer MetaID `contentType` as the routing truth.
- Do not guess a canonical title, hero body, tag list, or semantic summary for unknown protocols.
- Preserve original JSON keys and visible order when rendering JSON payloads.
- Keep this section visually dominant.

Version 1 routing:

- `application/json`: render a structured JSON document view.
- `text/markdown`: render Markdown directly.
- `text/plain`: render plain text directly.
- binary or unsupported content: show a compact non-preview notice instead of dumping bytes.

### 2. Raw Payload

Purpose: keep the generic renderer trustworthy.

Rules:

- Show the raw payload clearly and close to the primary payload view.
- When the payload is JSON, show the original raw JSON text rather than a second semantic summary.
- When the payload is Markdown or text, this section may collapse by default if the rendered view is
  already literal enough.

### 3. Related Media And Files

Purpose: surface payload-linked assets without making them the center of the page.

Recognize common asset-bearing keys such as:

```text
images, image, imageUrls, attachments, files, media
```

Rules:

- Inline image preview is allowed for safe resolvable image references.
- Documents and archives, including ZIP attachments, should appear as file rows with download
  affordance.
- `metafile://...` references should render as internal Browser links.
- External `http://` and `https://` references may be shown as links, but they should not be
  auto-embedded in version 1.

### 4. Pin Facts

Purpose: preserve auditability without overwhelming the content view.

Show:

- txid, with a copy affordance;
- `pin.path` when present;
- requested pin id and resolved pin id when they differ;
- root pin id when present;
- version selector and history index when present;
- operation, chain name, content type, encryption state, and pin version field when present;
- raw MAN pin record, preferably collapsed by default.

This section is for chain and resolver facts, not payload interpretation.

### Related Links

Browser-native links found in payload may appear inside `Related Media And Files` or `Pin Facts` as
a compact support list rather than a separate dominant section.

Recursively scan payload strings for complete Browser URIs and collect unique values for:

- `metaid://`
- `pin://`
- `map://`
- `metafile://`
- `metaapp://`

If a string is an external `http(s)` URL, it may be listed separately as an external reference, but
it is not treated as a first-class Agent Internet link.

## Renderer Runtime Boundary

The core resolver only returns facts. It does not build Web2 preview URLs or local host routes.

The Generic Pin Inspector may depend on small UI-layer helpers such as:

```ts
interface PinInspectorRenderContext {
  buildInternalBrowserHref(uri: string): string;
  buildMetafilePreviewUrl(reference: string): string | null;
  safeExternalUrl(url: string): string | null;
}
```

This keeps responsibilities clean:

- `packages/core` resolves the pin and normalizes data;
- `packages/renderers` decides how to present the data;
- `packages/ui` or the host supplies runtime link and preview helpers.

## Bot Page Linking Rule

Version 1 built-in Bot Page templates should use `pin://{pinId}` for generic detail links such as:

- buzz detail;
- skill-service detail;
- other protocol item detail rows that do not yet have a dedicated semantic renderer.

Protocol-specific `map://...` links remain valid and may be introduced later where a dedicated
renderer or action is needed.

## Acceptance Criteria

- `pin://{pinId}` resolves through MAN and opens the latest effective version of the pin object.
- `pin://{pinId}?version=0` resolves through MAN history semantics.
- The resolver returns `resourceType: "pin"` with `renderer.type: "pin-inspector"`.
- Requested and resolved pin identity are both preserved in the result.
- Built-in Bot Page detail links can use `pin://` without encoding OAC or IDBots routes.
- The Generic Pin page routes by declared outer content type and treats payload as the primary
  content source.
- The Browser chrome can show the creator as a compact bot chip using `resource.owner`.
- The Generic Pin page can present readable JSON, Markdown, and plain text payloads while keeping
  raw payload and raw pin record visible.
- ZIP and other document-like attachments can appear as downloadable related files.
- `map://simplemsg/conversation?peer=...` remains the protocol action URI for conversation opening.
