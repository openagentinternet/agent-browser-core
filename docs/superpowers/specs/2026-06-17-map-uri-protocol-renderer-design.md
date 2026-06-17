# MAP URI Protocol Renderer Design

Date: 2026-06-17
Status: Draft for review

## Context

Agent Browser Core already resolves identity, MetaApp, and metafile resources through Browser URIs:

- `metaid://{globalMetaId}` for Bot Pages;
- `metaapp://{pinId}` for MetaApps;
- `metafile://{pinId}` for file resources.

Bot Pages currently summarize protocol content such as `simplebuzz` and `skill-service`. The next
product gap is a host-neutral link model that lets a user open a protocol item from a Bot Page and
see the full protocol detail without binding the link to an OAC route, an IDBots route, or a Web2
centralized application.

The motivating first-version flows are:

- open a Bot Page, click a buzz summary, and view the full buzz content including text and media;
- open a Bot Page, click a skill-service summary, and view the service detail;
- open a remote Bot Page in OAC and start or view a conversation between the selected local Bot and
  the remote Bot.

## Decision

Introduce `map://` as the Browser URI family for MetaID Application Pointers.

`map://` links identify protocol resources and protocol actions. They do not identify local UI
routes and do not embed renderer implementation URLs. Browser hosts resolve `map://` through the
configured MAN node, normalize the chain resource, then dispatch it through a trusted renderer or
host capability.

First version examples:

```text
map://simplebuzz/pin/{pinId}
map://skill-service/pin/{pinId}
map://simplemsg/conversation?peer={globalMetaId}
```

The authority maps directly to a MetaID protocol path:

```text
map://simplebuzz/...    -> /protocols/simplebuzz
map://skill-service/... -> /protocols/skill-service
map://simplemsg/...     -> /protocols/simplemsg
```

Version 1 does not support aliases. The authority must match the protocol path segment exactly.

## Goals

- Give Bot Page summaries stable links to full protocol resources.
- Keep links chain-native and host-neutral.
- Use the Browser configured MAN node as the read source for pin and version resolution.
- Preserve MAN default version semantics: a pin object resolves to its latest effective version by
  default.
- Keep ABC core free of OAC, IDBots, wallet, database, and private-key dependencies.
- Ship a first-party renderer pack for common protocol details without making the core package grow
  into a large protocol UI bundle.
- Let OAC provide an interaction path from a remote Bot Page to private conversation UX without
  encoding OAC routes into public links.

## Non-Goals

- Do not execute arbitrary chain-declared renderers in version 1.
- Do not add protocol aliases in version 1.
- Do not implement standalone private chat sending in version 1.
- Do not move OAC private chat, conversation storage, signer access, or Bot profile routes into ABC.
- Do not bind `map://` links to `/ui/*` paths or other local host routes.
- Do not require IDBots integration before the host contract is ready.

## MAP URI Semantics

### Protocol Pin Resources

`map://{protocol}/pin/{pinId}` opens a protocol object anchored by `pinId`.

The default version selector is `latest`. Browser resolution delegates to the configured MAN node,
so the returned record should follow MAN's current effective-version behavior.

The resolver must preserve version identity fields in the normalized resource:

```ts
interface MapResolvedPinVersion {
  requestedPinId: string;
  rootPinId?: string;
  resolvedPinId: string;
  versionSelector: 'latest' | 'history-index' | 'exact';
  historyIndex?: number;
}
```

The first implementation should support latest by default:

```text
map://simplebuzz/pin/{pinId}
```

The user-facing historic-version shorthand is:

```text
map://simplebuzz/pin/{pinId}[0]
map://simplebuzz/pin/{pinId}[1]
```

The canonical normalized form should be query based:

```text
map://simplebuzz/pin/{pinId}?version=0
map://simplebuzz/pin/{pinId}?version=1
```

The shorthand may be accepted as input and rendered in product copy, but Browser internals should
normalize to the query form because it is easier to pass through URL parsers and host route layers.

### Conversation Resources

`map://simplemsg/conversation?peer={globalMetaId}` identifies a conversation between the current
using actor and a peer Bot.

The URI intentionally omits the local actor. The local side comes from Browser runtime state:

- selected actor in OAC;
- selected account or agent in IDBots;
- future standalone wallet identity.

If a host has no suitable actor, it should return `manual_action_required` with a login or identity
selection action.

## Resolve Flow

For `map://{protocol}/pin/{pinId}`:

1. Parse and normalize the MAP URI.
2. Map `{protocol}` to `/protocols/{protocol}` with no aliasing.
3. Resolve the requested pin through `browserConfig.manApiBaseUrl`.
4. Apply MAN version semantics. Default to the latest effective version. Use the requested history
   index when `version=N` is present.
5. Validate that the resolved pin path matches `/protocols/{protocol}`.
6. Extract MetaID pin metadata: operation, path, encryption, version, content type, payload,
   creator or owner identity, txid, pin id, chain, and content summary when present.
7. Build a normalized Browser resource with requested and resolved version identity.
8. Dispatch to the renderer registry.

For `map://simplemsg/conversation?peer={globalMetaId}`:

1. Parse and normalize the conversation URI.
2. Validate `peer` as a Global MetaID-like identifier.
3. Build a host trusted action request instead of resolving to a generic protocol renderer.
4. Let the host open, create, or report the conversation state.

## Package Boundary

### `packages/core`

Core owns MAP parsing, MAN-backed protocol pin resolution, validation, and resource normalization.
It should not render protocol-specific UI.

Core may export:

- MAP URI parser helpers;
- protocol path normalization;
- MAN pin resolver helpers;
- `MapResolvedPinVersion`;
- `ProtocolPinResourceEnvelope` or an extension of the existing Browser resource envelope.

### `packages/ui`

UI owns the Browser shell and renderer registry execution. It should render actions and pass trusted
actions to the host client, but it should not know OAC routes or IDBots routes.

UI may know that `open-conversation` is a trusted action kind, but it should not know that OAC maps
that action to `/ui/conversations`.

### Official Renderer Pack

Create a first-party renderer pack in the ABC repository, published with ABC versions but kept
separate from core:

```text
packages/renderers
```

Package name:

```text
@openagentinternet/agent-browser-renderers
```

The renderer pack is first-party and trusted by default when a host chooses the default Browser UI.
It is not a general third-party renderer execution system.

Version 1 renderers:

- `SimpleBuzzDetailRenderer`
- `SkillServiceDetailRenderer`
- `GenericProtocolPinRenderer`

The generic renderer is required. It displays the MetaID seven-tuple, requested and resolved version
identity, proof fields, content type, parsed payload when possible, and raw payload fallback. This
keeps new protocols inspectable before a dedicated renderer exists.

## Renderer Registry

The Browser renderer registry maps normalized resources to renderer implementations:

```ts
interface BrowserRendererBinding {
  id: string;
  protocolPath: string;
  resourceKind: 'pin-detail' | 'conversation' | 'generic';
  rendererType: 'component' | 'host-action' | 'iframe';
  rendererId?: string;
  actionKind?: BrowserTrustedActionKind;
}
```

Version 1 default bindings:

```text
/protocols/simplebuzz + pin-detail      -> SimpleBuzzDetailRenderer
/protocols/skill-service + pin-detail   -> SkillServiceDetailRenderer
unknown protocol + pin-detail           -> GenericProtocolPinRenderer
/protocols/simplemsg + conversation     -> open-conversation trusted action
```

Do not load third-party renderer URIs automatically. Future chain-declared renderers can be
discovered and shown as metadata, but they must be explicitly installed or trusted before use.

## OAC Conversation Integration

OAC must provide interactive Bot Page behavior in version 1 without leaking OAC routes into MAP
links or ABC core.

Add a host-neutral trusted action:

```text
open-conversation
```

Action payload:

```ts
interface OpenConversationPayload {
  conversationUri: string; // map://simplemsg/conversation?peer=...
  peerGlobalMetaId: string;
  peerName?: string;
  initialComposerText?: string;
}
```

OAC handles the action by using the selected Browser actor as the local Bot and returning a local UI
href:

```text
/ui/conversations?local={selectedLocalBotOrGlobalMetaId}&peer={peerGlobalMetaId}
```

The OAC adapter remains the only layer that knows this route. IDBots can implement the same action
with its own route later. Standalone can return `manual_action_required` in version 1.

`private-chat` remains the send-message action. In OAC, sending a message should return a follow-up
href to the peer conversation when possible, not only a trace page. That lets the Browser show a
clear "open conversation" result after the first message is sent.

Bot Page UI should expose:

- `Message`: opens the Browser private-chat composer modal, sends through the `private-chat`
  trusted action, then offers an `open-conversation` follow-up when the host returns one;
- `Conversation`: opens the peer conversation through `open-conversation`.

Both actions are derived from host capabilities. If the selected actor lacks `private-chat` or
`message-view`, the UI should show the action disabled or return `manual_action_required`.

## Security And Trust

- MAP links are data pointers, not executable renderer pointers.
- Core must validate that the resolved pin protocol path matches the MAP authority.
- Renderer selection must come from a trusted local registry.
- Third-party renderer declarations must not run automatically in version 1.
- HTML iframe rendering remains limited to existing safe renderer policy.
- Private chat and conversation actions must run only through host trusted actions because they
  require identity and secret access.

## Acceptance Criteria

- `map://simplebuzz/pin/{pinId}` resolves through the configured MAN base URL and renders full buzz
  detail with the first-party renderer.
- `map://skill-service/pin/{pinId}` resolves through MAN and renders service detail with the
  first-party renderer.
- Unknown `map://{protocol}/pin/{pinId}` resources resolve to the generic protocol pin renderer
  when the protocol path validates.
- Default pin resolution uses MAN latest-effective-version semantics.
- Historic selectors normalize from `[N]` to `?version=N`.
- Bot Page summaries link to MAP URIs instead of local UI routes.
- OAC Browser can open a remote Bot Page and route conversation actions to the existing OAC
  conversation page through the host adapter.
- ABC core and UI do not import OAC, IDBots, SQLite, wallet, or private chat implementation modules.

## Resolved Product Choices

- The visible Browser address should normalize historical selectors to `?version=N`. The `[N]`
  shorthand may still be accepted as user input and used in explanatory copy.
- `Message` should use the existing Browser private-chat modal for version 1. This keeps sending in
  the trusted action path and avoids requiring the OAC conversation page to become a write surface in
  the same milestone.
