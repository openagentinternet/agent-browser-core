# Agent Browser Core Host Integration Guide

This document is the entry point for downstream hosts that embed Agent Browser
Core (ABC), especially Open Agent Connect and IDBots. It explains the shared
integration model, the recommended order of work, and which focused document to
read for each optional capability.

This is a routing guide, not a duplicate protocol specification. Follow the
linked feature document whenever it defines message envelopes, data shapes,
security rules, or acceptance checks.

## Integration principles

1. **ABC stays host-neutral.** URI normalization, resource envelopes,
   renderers, Browser UI, tab state, Library state, and iframe protocol handling
   belong to ABC. OAC, IDBots, wallet, database, IPC, filesystem, and daemon
   details belong to downstream host adapters.
2. **The host owns trusted effects.** ABC may validate and forward an operation,
   but the host selects the current actor, applies product policy, asks for user
   confirmation, signs or broadcasts transactions, uploads files, and returns a
   `BrowserCommandResult`.
3. **Consume one pinned ABC package set.** Keep all ABC packages on the same
   exact release. Do not copy selected Browser source files into a host or mix
   contracts and UI from different versions.
4. **Preserve the generated Browser page.** The served implementation lives in
   `packages/ui/src/browser/`. Hosts should render it through
   `renderBrowserPageHtml()` and must not extend the legacy parity files at the
   top of `packages/ui/src/`.
5. **Derive infrastructure defaults from core.** Start with
   `createDefaultBrowserConfig()`, override only host-specific fields, and use
   `createBrowserSettingsSnapshot()` for settings responses. Runtime overrides
   remain supported.
6. **Treat every iframe boundary explicitly.** Host-to-Browser messages,
   Browser-to-host events, and untrusted MetaApp-to-Browser requests are
   different contracts with different validation and consent requirements.
7. **Enable capabilities deliberately.** Runtime feature flags, actor
   capabilities, adapter behavior, routes, UI controls, and host policy must
   agree. Showing a control without implementing its trusted effect is not a
   complete integration.
8. **Treat package updates and host integration as separate gates.** Updating
   the pinned ABC packages installs shared UI and contracts, but it does not
   replace a host-native confirmation, signing, IPC, or error-normalization
   path. A capability is integrated only after the host preserves the required
   command-result semantics and passes the feature acceptance checks.

## Package roles

| Package | Host integration role |
| --- | --- |
| `@openagentinternet/agent-browser-host-contract` | Host-neutral adapter, runtime, actor, resource, trusted-action, and command-result types. |
| `@openagentinternet/agent-browser-core` | URI/resource logic, Browser configuration defaults, settings normalization, and built-in templates. |
| `@openagentinternet/agent-browser-ui` | Generated Browser page, renderers, Tabs and Library APIs, themes, and iframe bridges. |
| `@openagentinternet/agent-browser-host-standalone` | Standalone runtime and a concrete reference host; do not treat its in-memory policies as requirements for OAC or IDBots. |
| `@openagentinternet/agent-browser-test-harness` | Reusable checks for the shared `BrowserHostAdapter` contract. |

## Recommended integration order

1. Pin one compatible version of every ABC package used by the host.
2. Implement `BrowserHostAdapter` in the host-specific layer and run the shared
   test harness against it.
3. Expose the Browser API operations to the generated page and serve the HTML
   returned by `renderBrowserPageHtml()` without stripping its client script or
   iframe handlers.
4. Supply initial runtime state, actors, feature flags, labels, and Browser
   settings. Derive base URL defaults from core rather than copying URL literals.
5. Integrate theme selection and runtime theme synchronization.
6. Integrate Tabs only if the surrounding host needs to inspect or control ABC
   tabs outside the Browser UI.
7. Integrate the Library only if the surrounding host needs bookmarks, history,
   recent Bots, or recent URIs outside the Browser UI.
8. Implement MetaApp trusted effects only for capabilities the host intends to
   support, including the required confirmation and identity-consent flows.
9. Run host contract, iframe, persistence, security, and visual acceptance
   checks before updating the pinned ABC version in a production host.

## Baseline host adapter and HTTP surface

Every full host adapter implements these methods:

| `BrowserHostAdapter` method | Browser responsibility delegated to the host |
| --- | --- |
| `getRuntime` | Host identity, current actors, feature flags, labels, and default URI. |
| `resolveResource` | Resolve a normalized Browser URI into a host-neutral resource result. |
| `getSettings` / `updateSettings` | Read and update the host's persisted Browser settings. |
| `getCache` / `clearCache` | Inspect and clear host-managed Browser caches. |
| `runTrustedAction` | Execute host-owned effects such as chat, service calls, writes, or uploads. |

The standalone host exposes the reference HTTP mapping below. A downstream
host may use other internal routes or IPC, but the generated ABC page must
observe equivalent request and response semantics.

| Reference route | Method | Purpose |
| --- | --- | --- |
| `/api/browser/runtime` | `GET` | Runtime and actor snapshot. |
| `/api/browser/resolve` | `GET` | Resource resolution. |
| `/api/browser/settings` | `GET`, `PUT` | Browser settings. |
| `/api/browser/cache` | `GET`, `DELETE` | Cache inspection and clearing. |
| `/api/browser/actions` | `POST` | Trusted host action execution. |
| `/api/browser/metafile-upload` | `POST` | Host-owned file selection and upload for the MetaApp bridge. |

`/api/browser/info` is an optional standalone extension for Bot profile lookup;
it is not a method on the shared `BrowserHostAdapter` interface.

## Capability directory

### Theme synchronization

ABC owns all styling inside its iframe. The host chooses `light`, `dark`, or
`system` during initial rendering and may update it later without reloading the
Browser or losing page state.

Read [Browser Theme Host Integration](./browser-theme-host-integration.md) for
the render option, runtime message helper, source validation, and system-theme
behavior.

### Tabs, page information, and content extraction

Tabs are client/session state owned by the loaded ABC page. A host can open,
close, switch, and list tabs; inspect the active tab; read structured tab
information or bounded page content; and subscribe to lifecycle events. The
contract supports both a direct global API and a parent-frame message bridge.

Read [Browser Tabs Host Integration](./browser-tabs-host-integration.md) for the
`AgentBrowserTabs` API, message envelopes, event model, extraction limits,
security checks, and examples.

### Library: bookmarks and recent activity

ABC owns bookmarks and the retained browsing history in the Browser page's
`localStorage`. The host receives read-only snapshots containing bookmarks,
history, recent Bots, recent URIs, visit metadata, and compact resource
summaries. Library changes are announced as best-effort events; ABC remains the
source of truth.

Read [Browser Library Host Integration](./browser-library-host-integration.md)
for the `AgentBrowserLibrary` API, retention rules, message bridge, data shapes,
privacy rules, and version availability.

### MetaApp Host Bridge

MetaApps are untrusted child frames. ABC owns request validation, sanitized
actor projection, in-Browser navigation, and bridge responses. The host owns
identity consent and every trusted effect, including confirmation, MetaID PIN
writes, signing and broadcast, file selection, and MetaFile upload.

For the shared Write PIN modal, the host must return the complete structured
`manual_action_required` result from its trusted boundary. Merely consuming the
ABC release that contains the modal is insufficient; a wrapper that opens its
own native dialog or collapses the result into a generic failure bypasses the
shared UI.

Read [MetaApp Host Bridge V1 Host Requirements](./metaapp-host-bridge-v1-host-requirements.md)
for the required action/upload endpoints, actor rules, consent boundary,
trusted-action semantics, result shapes, and host acceptance checklist.

MetaApp authors should separately read
[Custom Bot Homepage and MetaApp Guide](./custom-bot-homepage-metaapp-guide.md)
for the `window.AgentBrowser` API available inside their content. That guide is
not a substitute for the host requirements.

### Served MetaApp HTML URI support

MetaApp HTML may reference Agent Internet resources directly: `src`, `srcset`,
and `poster` attributes can hold `metafile://` URIs, and anchors can use
`metaid://`, `metaapp://`, `metafile://`, `map://`, and `pin://` hrefs. Browsers
cannot load these schemes, so HTML served from a MetaApp asset route must be
prepared first:

- `metafile://` subresource references are rewritten to accelerated Metafile
  content web URLs derived from `metafileContentBaseUrl`;
- a navigation bridge script is injected so internal-URI anchor clicks are
  forwarded to ABC through the `agent-browser:navigate` channel, and
  `window.AgentBrowser.navigate(uri)` becomes available to the app;
- a `localStorage`/`sessionStorage` memory fallback is injected because the
  sandboxed preview iframe runs in an opaque origin.

`href` values are deliberately left as Agent Internet URIs: navigation stays
inside the Browser instead of opening a raw content URL.

Hosts that route MetaApp asset serving through the standalone adapter's
`resolvePreviewAsset` get this automatically. The standalone adapter proxies both
MetaApp content shapes through its preview-assets route: ZIP archives are
downloaded and extracted, and single-file HTML content references are downloaded
and cached as one-file artifacts — both then go through `preparePreviewHtml`. A
host that serves MetaApp assets from its own route must apply
`preparePreviewHtml({ body, contentType, metafileContentBaseUrl })`, exported
from `@openagentinternet/agent-browser-core` (and re-exported by
`@openagentinternet/agent-browser-host-standalone`), before returning HTML.
HTML Metafiles opened directly by URI (not as MetaApp content) are not served by
the host and are not prepared; their authors must embed the manual navigation
helper documented in the
[Custom Bot Homepage and MetaApp Guide](./custom-bot-homepage-metaapp-guide.md).

### Local MetaApp preview

ABC can resolve local preview URIs for development. This capability can read
local filesystem paths when explicitly used with `localhost`, so it must remain
a local-development tool and must not be exposed by a public production host.

Read [Preview MetaApp Protocol](./preview-metaapp-protocol.md) for URI forms,
examples, and the production-disable control.

### Standalone acceptance and host conformance

Use the standalone host as an executable reference for page delivery and API
mapping, then validate the downstream adapter with
`@openagentinternet/agent-browser-test-harness`. Do not infer OAC- or
IDBots-specific policy from the standalone memory host.

Read [Browser Parity Standalone Acceptance](./acceptance/browser-parity-standalone.md)
for standalone runtime, HTML, visual, package-consumption, and preview checks.

## Boundary map

| Boundary | Typical direction | Contract | Lifetime / trust |
| --- | --- | --- | --- |
| Host backend to ABC | Browser page to host adapter, route, or IPC | `BrowserHostAdapter` and `BrowserCommandResult` | Host-owned persistent state and trusted effects. |
| Host frame to ABC page | Parent to Browser iframe | Theme messages and Tabs/Library request messages | Trusted only after source, origin where applicable, type, version, and request correlation checks. |
| ABC page to host frame | Browser iframe to parent | Tab, history, and bookmark events plus correlated responses | Notifications are best effort; re-read current state when consistency matters. |
| Host code in the same realm | Host to Browser global | `AgentBrowserTabs` and `AgentBrowserLibrary` | Available after the Browser client initializes. |
| MetaApp frame to ABC page | Untrusted child to Browser parent | `window.AgentBrowser.navigate()` and `window.AgentBrowser.request()` | Resource-scoped, validated, sanitized, and consent-gated. |

Do not forward arbitrary MetaApp messages directly to the host adapter, expose
the Tabs or Library parent bridge to child frames, or treat Browser events as a
durable replicated log.

## Security and privacy checklist

- Validate `event.source`, `event.origin` where a stable origin exists, message
  type, protocol version, and correlated request id before trusting iframe data.
- Keep MetaApp sandboxing and ABC's active-frame checks intact when wrapping or
  post-processing the generated page.
- Require explicit, per-resource user consent before disclosing an actor's
  MetaID identity to untrusted MetaApp content.
- Re-read the selected actor and revalidate every write or upload in the host
  adapter at execution time. Never rely only on client-side validation.
- Keep signing keys, wallet internals, filesystem paths, IPC handles, database
  records, and raw host objects outside all iframe contracts.
- Treat browsing history and bookmarks as private user data. Do not upload,
  publish, or inject them into an agent prompt without the host's applicable
  consent and privacy policy.
- Disable local MetaApp filesystem preview in public deployments.
- Keep unsupported runtime capabilities disabled instead of presenting controls
  that can never complete.

## Host completion checklist

- [ ] All consumed ABC packages are pinned to one exact compatible version.
- [ ] Host-specific code is confined to the adapter, wrapper, routes, or IPC
      layer; shared core and UI remain host-neutral.
- [ ] `BrowserHostAdapter` passes the shared conformance harness.
- [ ] Browser configuration defaults derive from core and settings snapshots
      report the same defaults.
- [ ] The generated Browser HTML and client script are served intact.
- [ ] Initial render, runtime synchronization, and host theme changes work.
- [ ] Each enabled optional capability has passed the checklist in its linked
      feature document.
- [ ] Iframe origin/source validation, MetaApp identity consent, and trusted
      action confirmation have been tested negatively as well as positively.
- [ ] Refresh behavior is understood: Tabs are session-only, while Library data
      survives only as long as the Browser origin's `localStorage` survives.
- [ ] The host's production update uses the verified ABC release rather than an
      unreleased repository snapshot.

## Suggested reading paths

- **Basic embedded Browser:** this guide, Theme, then standalone acceptance and
  the shared adapter conformance harness.
- **Host-controlled Browser workspace:** add Tabs and Library.
- **MetaApp-capable desktop host:** add MetaApp Host Bridge requirements; give
  the separate MetaApp author guide to content developers.
- **Standalone development or protocol debugging:** add Preview MetaApp
  Protocol, while keeping its local-only security boundary explicit.
