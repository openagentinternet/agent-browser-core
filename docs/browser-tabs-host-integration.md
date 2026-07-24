# Browser Tabs — Host Integration Guide

This document describes how a host (OAC, IDBots, a standalone wrapper, or any
embedding context) integrates with the Agent Browser Core (ABC) multi-tab
feature. It covers the runtime APIs a host can call, the message-bridge
contract for sandboxed embeds, the behaviors a host should expect, and the
recommended integration steps.

## TL;DR

The Browser exposes a stable, host-neutral tab API on the client runtime under
`globalThis.AgentBrowserTabs`, plus `postMessage` bridge messages for hosts
that run the Browser inside an `<iframe>` / WebView and cannot call globals
directly. Both surfaces expose the same five operations:

| Operation    | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `openTab`    | Open a new tab (optionally navigating to a URI).  |
| `closeTab`   | Close a tab by id.                                |
| `switchTab`  | Activate a tab by id.                             |
| `getTabs`    | Read-only list of all open tabs.                  |
| `getActiveTab` | Read-only snapshot of the currently active tab. |

Tab state is **client-only and session-level**: tabs live in the Browser page's
memory. The host does not need to (and cannot) manage tab state server-side.

---

## Mental model

- The Browser is a single page that owns its own tab strip, address bar, and
  per-tab content panes. A host embeds this page (iframe / WebView / route) and
  drives it through the API below.
- Tabs are a **client runtime concept**. There is no server-side tab session, no
  HTTP endpoint for tabs, and no change to the existing `BrowserHostAdapter`
  contract. Resource resolution (`resolveResource`) is unchanged and unrelated
  to tabs.
- Switching tabs never reloads content: each tab owns a persistent DOM pane, so
  iframe/MetaApp/scroll/input state survives a round-trip through another tab.
- At least one tab always exists. Closing the last tab auto-creates a fresh
  empty tab.

---

## API reference

All operations are available in two equivalent forms:

1. **Direct global** — `window.AgentBrowserTabs.<method>(...)`. Use this when the
   host runs in the same JS realm as the Browser page (same-origin iframe, or a
   host shell that imports the Browser bundle).
2. **Message bridge** — `window.postMessage({ type, ... })`. Use this when the
   Browser runs in a sandboxed cross-origin iframe and the host can only reach
   it via `postMessage`.

### `TabInfo` shape

`getTabs()` and `getActiveTab()` return read-only snapshots of this shape:

```ts
interface TabInfo {
  /** Monotonic numeric id assigned by the Browser. Use for closeTab/switchTab. */
  id: number;
  /** Resolved URI of the tab's current resource, or null for an empty/welcome tab. */
  uri: string | null;
  /** Normalized display title of the current resource, or null for an empty tab. */
  title: string | null;
  /** True if this is the currently active tab. */
  isActive: boolean;
}
```

The returned objects are **shallow copies**. Mutating them does not affect the
Browser's internal state.

### `openTab(uri?) -> number`

Creates a new tab, activates it, and returns the new tab's `id`.

- `openTab('metaid://idq1alice')` — creates a tab and navigates it to the URI
  (the navigation is scoped to the new tab; other tabs are untouched).
- `openTab()` (no argument, or `undefined`) — creates an empty tab showing the
  welcome page. No network request is made.

```js
// Direct
const newId = window.AgentBrowserTabs.openTab('metaid://idq1alice');

// Bridge (the Browser accepts this from window.parent only)
window.parent.postMessage(
  { type: 'agent-browser:open-tab', uri: 'metaid://idq1alice' },
  '*'
);
```

### `closeTab(id) -> void`

Closes the tab with the given numeric `id`. Silent (no-op) if no tab has that id.

- If the closed tab was the active one, the Browser activates a neighbor
  (prefer the right neighbor, else the left) and reveals its existing content
  pane without reloading it.
- If it was the **last** tab, the Browser auto-creates a fresh empty tab, so
  there is always at least one tab.

```js
window.AgentBrowserTabs.closeTab(tabId);
// or
window.parent.postMessage({ type: 'agent-browser:close-tab', id: tabId }, '*');
```

### `switchTab(id) -> void`

Activates the tab with the given `id`. No-op if not found. Switching only
reveals that tab's existing content pane and syncs the shared toolbar (address
bar, back/forward state, title, loading spinner) to it — it never re-fetches
and never rebuilds pane DOM.

```js
window.AgentBrowserTabs.switchTab(tabId);
// or
window.parent.postMessage({ type: 'agent-browser:switch-tab', id: tabId }, '*');
```

### `getTabs() -> TabInfo[]`

Returns a read-only snapshot array of all open tabs, in display order.

```js
const tabs = window.AgentBrowserTabs.getTabs();
const openCount = tabs.length;
```

> Note: `getTabs` / `getActiveTab` are **not** exposed over the message bridge
> (the bridge is request-less/fire-and-forget for tab actions). If a host needs
> tab listings from a sandboxed iframe, poll `getTabs` via a host-injected
> same-realm script, or track tab ids locally from the `openTab` return values.

### `getActiveTab() -> TabInfo | null`

Returns a read-only snapshot of the currently active tab, or `null` if none.

```js
const active = window.AgentBrowserTabs.getActiveTab();
if (active) console.log(active.uri, active.title);
```

---

## Message bridge contract

For hosts that embed the Browser in a sandboxed `<iframe>` and can only
communicate via `postMessage`.

### Security gate

Tab bridge messages are accepted **only from `window.parent`** (the direct host
frame). Messages from any other source (including MetaApp iframes rendered
inside the viewport) are ignored for tab operations. This prevents content
loaded in a tab from opening/closing the host's other tabs.

### Message envelope

All tab bridge messages are plain objects with a `type` string. They are
fire-and-forget (no response is sent back).

| `type`                       | Payload        | Effect                                  |
| ---------------------------- | -------------- | --------------------------------------- |
| `agent-browser:open-tab`     | `{ uri? }`     | `openTab(uri)` (uri optional)           |
| `agent-browser:close-tab`    | `{ id }`       | `closeTab(Number(id))`                  |
| `agent-browser:switch-tab`   | `{ id }`       | `switchTab(Number(id))`                 |

```js
// From the host (the Browser's parent frame):
const iframe = document.querySelector('iframe#browser');
iframe.contentWindow.postMessage(
  { type: 'agent-browser:open-tab', uri: 'metaapp://<pinId>' },
  '*' // or the Browser's origin for tighter security
);
```

Malformed payloads degrade safely: a missing/empty `uri` opens an empty tab;
a non-numeric `id` is a silent no-op.

### Relationship to the existing MetaApp bridge

The Browser already routes a separate set of `agent-browser:request` /
`agent-browser:navigate` messages **from the MetaApp iframe rendered inside the
viewport** (for pin writes, uploads, private chat, etc.). Those are unaffected
by tabs. Tab bridge messages are a distinct, host-facing channel gated on
`window.parent` — the two never overlap.

---

## Behaviors a host should expect

1. **Always ≥ 1 tab.** Never assume zero tabs. On fresh load there is exactly
   one tab; closing the last one creates a new empty one.
2. **Session-level only.** A page refresh resets the tab list to a single
   default tab. Deep-link `?uri=` or `/browser/<scheme>/<id>` paths drive the
   initial tab's content; they do not restore a prior tab set. Do not rely on
   tab ids surviving a reload.
3. **`openTab` switches focus.** Calling `openTab` activates the new tab
   immediately (the user sees it). If you want to open a URI in the background
   without switching, that is not currently supported — open it and then
   `switchTab` back to the previous tab.
4. **Shared toolbar.** The address bar, back/forward buttons, reload button,
   and title are shared across tabs but always reflect the active tab. When you
   switch tabs, the toolbar updates to match; you do not need to sync it.
5. **Async navigation is scoped to its tab.** If a tab is navigating (fetch in
   flight) and the user (or host) switches to another tab, the in-flight resolve
   still lands on its originating tab — it will not clobber the newly active
   tab's view.
6. **`id` is numeric and monotonic**, allocated from an internal counter. Treat
   it as an opaque token; do not assume it is contiguous or starts at a fixed
   value.

---

## Integration checklist

### If your host runs the Browser same-origin (direct global access)

- [ ] After the Browser page loads, confirm `window.AgentBrowserTabs` is defined
      before calling it (the inline script sets it up during boot).
- [ ] Use `openTab(uri)` to route host-initiated navigations into a new tab
      (e.g. clicking a notification, a deep link from another part of the host
      UI, a "open in Browser" action).
- [ ] Use `getActiveTab()` / `getTabs()` if your host chrome shows a tab count,
      current title, or a tab switcher mirroring the Browser's tabs.
- [ ] Prefer `openTab` (new tab) over reusing the current tab when the user is
      mid-task in the current tab; reuse the current tab only for in-page link
      navigations (which the Browser already handles internally).

### If your host embeds the Browser in a sandboxed iframe

- [ ] Post `agent-browser:open-tab` / `close-tab` / `switch-tab` messages to the
      iframe's `contentWindow` (the Browser accepts them from its `parent`).
- [ ] If you need tab listings (`getTabs`/`getActiveTab`), inject a tiny
      same-origin helper script that polls `window.AgentBrowserTabs` and relays
      the snapshots to the host — the bridge itself does not return tab lists.
- [ ] When passing a target origin to `postMessage`, prefer the Browser's real
      origin over `'*'` once you know it.

### General

- [ ] Do not attempt to manage tab state server-side or persist it; tabs are
      client-only by design.
- [ ] Do not add HTTP endpoints or extend `BrowserHostAdapter` for tabs — the
      feature is intentionally client-only.
- [ ] If your host has its own external "tab" concept (e.g. workspace tabs),
      decide whether the Browser's internal tabs should be 1:1 with them or
      hidden behind a single host tab. The API supports either; the simplest
      start is to let the Browser own its tabs and expose counts/titles via
      `getTabs` for host display.

---

## Examples

### Open a URI in a new tab from the host UI

```js
// A host button that opens a bot's page in a new Browser tab.
function openInBrowserTab(uri) {
  const browser = document.querySelector('iframe#browser');
  if (browser && browser.contentWindow.AgentBrowserTabs) {
    browser.contentWindow.AgentBrowserTabs.openTab(uri);
  } else if (browser) {
    browser.contentWindow.postMessage(
      { type: 'agent-browser:open-tab', uri },
      '*'
    );
  }
}
```

### Mirror the active tab's title into the host shell

```js
// Polling example; a host could also drive this off its own navigation events.
function syncHostTitle() {
  const api = window.AgentBrowserTabs; // same-origin case
  if (!api) return;
  const active = api.getActiveTab();
  document.title = active?.title
    ? `${active.title} — My Host`
    : 'My Host';
}
setInterval(syncHostTitle, 1000);
```

### Show a "N tabs open" badge

```js
const api = window.AgentBrowserTabs;
const count = api ? api.getTabs().length : 0;
badge.textContent = String(count);
```

---

## Reference

- Design spec: `docs/superpowers/specs/2026-07-23-browser-tabs-design.md`
- Implementation: `packages/ui/src/browser/app.ts` — `AgentBrowserTabs` export
  and the `handleBrowserMessage` tab branch.
- Related host bridge (MetaApp/viewport-scoped, distinct from tabs):
  `docs/metaapp-host-bridge-v1-host-requirements.md`
- Theme host integration (separate host-facing channel):
  `docs/browser-theme-host-integration.md`
