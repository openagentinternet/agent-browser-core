# Standalone Metalet Wallet Actor Design

Date: 2026-06-22
Status: Draft for review

## Context

Agent Browser Core standalone mode currently exposes a development wallet actor named
`standalone-wallet`. The actor satisfies the Browser host contract and scopes cache/action requests,
but it is not backed by a real user wallet. The Browser UI still treats the actor chip as a generic
multi-actor selector, which matches OAC and IDBots but does not match standalone usage.

In standalone Browser, the only usable actor should be the current human user connected through the
Metalet browser extension. This is the same product shape as show.now's top-level Connect flow:
detect `window.metaidwallet`, connect the extension, derive wallet addresses/public keys, build a
MetaID connector, then resolve user profile data for display.

## Goals

- Let standalone Browser users connect Metalet directly from the top-right actor chip.
- Replace the development actor display with the connected Metalet account.
- Show the connected account avatar, display name, and Global MetaID in the actor chip.
- Keep standalone actor selection single-account only. Clicking the chip must not open the existing
  multi-Bot selector in standalone mode.
- Keep OAC and IDBots multi-actor behavior unchanged.
- Keep wallet-specific behavior out of `packages/core`.
- Show an install prompt when Metalet is not installed, with Close and Install actions.
- Open `https://metalet.space` in a new browser window when the user clicks Install.

## Non-Goals

- Do not implement wallet signing for Browser actions in this change.
- Do not add multi-account Metalet selection.
- Do not change OAC or IDBots actor runtime semantics.
- Do not add wallet logic to Browser resource parsing, resolving, or renderers.
- Do not replace existing name alias or URI resolution behavior.
- Do not require a local Bot identity in standalone mode.

## Runtime Semantics

Standalone runtime should report wallet login support:

```text
host.kind = "standalone"
features.walletLogin = true
labels.actorChip = "Wallet"
```

Before a wallet is connected, runtime may continue to expose a placeholder actor if existing host
contract tests require an actor, but the UI must treat it as disconnected wallet state. The visible
chip should prompt connection instead of opening actor selection.

After a wallet is connected, the runtime/client state should expose exactly one active actor:

```ts
{
  id: "metalet:<address>",
  label: profile.name || shortAddress,
  kind: "wallet",
  isDefault: true,
  globalMetaId: profile.globalMetaId,
  address,
  avatar,
  capabilities: ["template-settings"]
}
```

The actor identity is the connected human wallet account, not a Bot. It can be used as the Browser
`actorId` for host-scoped APIs. Browser actions that require stronger signing or chat identity can
continue to return manual-action or unsupported states until those workflows are designed separately.

## UI Behavior

### Disconnected Standalone

The top-right actor chip should behave as a Connect Wallet button:

```text
Wallet: Connect Wallet
```

Clicking it should:

1. Check whether `window.metaidwallet` exists.
2. If missing, open a Browser modal that says Metalet must be installed first.
3. The modal has two actions:
   - Close: dismisses the modal.
   - Install: calls `window.open("https://metalet.space", "_blank", "noopener")` and keeps the
     current ABC page in place.
4. If Metalet exists, run the connect flow.

### Connected Standalone

After connect, the chip should show the connected account:

```text
Wallet: {name}
{globalMetaId}
```

The avatar should use the resolved profile avatar when available. If no profile avatar exists, use
the existing avatar fallback behavior.

Clicking the connected standalone chip should not open the multi-actor selector. Version 1 should
leave it inert after connection. Disconnect can be added later as a separate menu decision.

### Non-Standalone Hosts

OAC and IDBots should keep the current `Using actor` selector and modal behavior. Their runtime
actors remain host-provided Bots or identities.

## Metalet Connect Flow

The standalone client should follow show.now's proven sequence, reduced to the fields needed for
Browser actor display:

1. Check `window.metaidwallet.isConnected()`.
2. If status is not connected, call `window.metaidwallet.connect()`.
3. Read the current network through `window.metaidwallet.getNetwork()`.
4. Read wallet identity fields:
   - BTC address and public key through `window.metaidwallet.btc`.
   - MVC address and public key through the root Metalet API.
5. Build a MetaID connector using the same SDK family show.now uses.
6. Resolve profile information from the connector user data or a profile lookup API.
7. Normalize avatar, name, and Global MetaID into the Browser actor shape.
8. Store the connected actor in Browser client state and re-render the actor chip.

The first implementation should avoid dashboard cookies and show.now-specific tokens. ABC Browser
only needs the actor display and host request identity in this version.

## Package Boundary

### `packages/core`

No changes. Core remains host-neutral and wallet-free.

### `packages/host-standalone`

Standalone host owns runtime feature flags and the stable actor-id contract for wallet-backed
requests. It may keep the existing `standalone-wallet` compatibility path while the client is
disconnected.

If the implementation needs a profile lookup endpoint to avoid exposing API URLs in UI code, it
belongs in this package.

### `packages/ui`

UI owns the visible chip behavior and modal because the Metalet extension is only available in the
browser. Any Metalet-specific code must be gated by standalone runtime metadata so shared OAC/IDBots
UI behavior is unchanged.

The UI should not import OAC, IDBots, SQLite, or daemon internals.

## Error Handling

- Missing `window.metaidwallet`: show the install modal.
- `isConnected()` returns `locked`: show a wallet error telling the user to unlock Metalet.
- User cancels connect: keep disconnected state and show a short status message.
- Profile lookup fails: keep the wallet connected with address fallback, but leave avatar/name empty
  or derived from a short address.
- Network mismatch: do not block version 1 unless the SDK connector requires a network choice. If a
  switch is required, mirror show.now's switch-network behavior.

## Testing

Add tests that verify:

- Standalone runtime advertises `features.walletLogin = true`.
- In standalone disconnected state, clicking the actor chip does not open the actor selector.
- Missing Metalet opens the install modal with Close and Install buttons.
- Install uses `window.open("https://metalet.space", "_blank", ...)`.
- A mocked Metalet connection updates the chip with avatar, name, and Global MetaID.
- Connected standalone chip click remains inert and does not open the multi-actor modal.
- OAC-style multi-actor runtime still opens the existing actor selector.
- Existing standalone host tests still pass for cache, resolve, and trusted action routes.

Run:

```text
npm test
```

Use Node 20.20.0 for local verification in this workspace.
