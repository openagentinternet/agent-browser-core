# Browser Element Picker — Host Integration Guide

This document describes how a host (IDBots, OAC, a standalone wrapper, or any
embedding context) integrates with the Agent Browser Core (ABC) **element
picker** feature. The picker lets a human mark HTML elements on the content
open in the Browser, annotate them (name + optional comment), and exposes a
read API so the host's MetaBot can learn exactly which element the human is
referring to when requesting changes ("make this button bigger", "restyle this
card", ...).

The Browser stays decoupled from host composers: it stores markers and serves
the read API. Turning selections into chat context / prompts is host-side work.

## TL;DR

- The human enters pick mode from the Browser toolbar (crosshair button next
  to the bookmark star, or Browser menu → "Select elements" on mobile), clicks
  elements, fills the annotation panel, and confirms. Markers are painted as
  blue outlines with numbered badges on the page.
- The host reads the annotations through the same surfaces as tabs:

| Surface | Item | Purpose |
| ------- | ---- | ------- |
| Direct global | `AgentBrowserTabs.getElementSelections(tabId?)` | Read a tab's annotations (cloned snapshot). |
| Direct global | `AgentBrowserTabs.clearElementSelections(tabId?)` | Drop a tab's annotations and badges. |
| Message bridge | `agent-browser:get-element-selections` | Same read, correlated `:response`. |
| Message bridge | `agent-browser:clear-element-selections` | Same clear, correlated `:response`. |
| Host event | `element-selections-changed` | Push notification on every store change. |

- Everything in this guide ships in package version **`0.10.0`** of
  `@openagentinternet/agent-browser-ui` (+ `agent-browser-core`,
  `agent-browser-host-contract`). No adapter or HTTP surface changes are
  required — like tabs, picker state is **client-side, per tab, session-only**.

---

## Mental model

- **The human marks; the browser records; the host reads.** Pick mode is
  user-initiated only — there is intentionally no host message that forces the
  Browser into pick mode (v1). The host's job is to consume selections.
- **One engine, two hosts.** Content always renders in a cross-origin sandboxed
  iframe, except built-in bot pages and pin payloads which render in chrome
  DOM. Both cases are supported; the host sees no difference except the
  `locator.cssScope` field (see below).
- **Markers are per tab and short-lived by design.** Navigation, reload, and
  back/forward clear a tab's markers (a stale CSS/XPath locator would mislead
  the MetaBot); closing a tab clears them too. Switching tabs keeps each tab's
  markers painted. There is no persistence across page reloads — read the
  selections before they are invalidated.
- **Supported content:** `metaapp://` (zip or single-file HTML served through
  the local preview pipeline), `preview-metaapp://localhost`, built-in bot
  pages, `pin://` (pin-inspector payload rendering). The toolbar button is
  disabled with everything else (`preview-metaapp://<remote-host>`,
  `metafile://` HTML documents rendered from the CDN, PDF/media renderers) and
  nested iframes inside a picked page are not reached (v1).
- **Caps per record** (so hosts can bound prompts): text preview 500 chars,
  outerHTML preview 2000 chars, 40 attributes × 200 chars, 50 markers per tab.

---

## Record shape

`getElementSelections` returns a snapshot (deep-cloned; safe to mutate):

```js
{
  tabId: 3,
  uri: "metaapp://6ea8a0bd...",
  title: "Chess App",
  selections: [
    {
      markerId: "marker-1",
      name: "Marker 1",            // human-renamable, defaults to "Marker N"
      comment: "Make the label uppercase",
      capturedAt: "2026-11-10T08:15:42.183Z",
      page:   { url: "metaapp://6ea8a0bd...", title: "Chess App" },
      frame:  { url: "/api/browser/preview-assets/preview-7/index.html" },
      locator: {
        cssSelector: "#app > button.play-btn",
        cssScope: "document",      // see table below
        xpath: "/html[1]/body[1]/div[1]/button[2]"
      },
      element: {
        tag: "button",
        id: "play-btn",
        classes: ["play-btn", "primary"],
        attributes: { type: "button", "data-action": "play" },
        role: "button",
        accessibleName: "Play game",
        textPreview: "Play game",
        outerHtmlPreview: "<button id=\"play-btn\" class=\"play-btn primary\" ...>"
      },
      geometry: {
        rect: { x: 24, y: 380, width: 160, height: 44 },  // viewport coords at capture
        scrollX: 0, scrollY: 0,
        viewportWidth: 1200, viewportHeight: 800
      },
      style: { color: "#fff", backgroundColor: "rgb(31,111,235)", fontSize: "16px",
               fontFamily: "Inter, sans-serif", fontWeight: "600", display: "inline-block" }
    }
  ]
}
```

TypeScript hosts import the same shape from
`@openagentinternet/agent-browser-host-contract`: `BrowserElementSelectionsSnapshot`,
`BrowserElementSelection`, `BrowserElementSelectionLocator`, `BrowserElementSelectionElement`,
`BrowserElementSelectionGeometry`, `BrowserElementSelectionStyle`.

### `locator.cssScope`

| Value | Meaning | Where the selector resolves |
| ----- | ------- | --------------------------- |
| `"document"` | Content served through the sandboxed preview iframe (metaapp / local preview). | Inside that frame's document. `frame.url` identifies the frame. |
| `"browser-pane"` | Bot pages and pin payloads rendered directly into the Browser chrome. | The active tab's pane subtree (`[data-tab-pane="<tabId>"]`) in the Browser page document. |

Selectors are unique-id-first with an `nth-of-type` structural fallback and a
60-segment depth cap; XPath is absolute and fully index-qualified.

---

## API reference

Both methods mirror the tab read APIs' semantics:

- Omitting `tabId` targets the **active** tab; a numeric id targets that tab.
- Unknown tab id → `null` (same as `getTabInfo`).
- `getElementSelections(tabId?)` → snapshot object as above, or `null`.
- `clearElementSelections(tabId?)` → `{ tabId, cleared: true }`, or `null`.
  Badges are removed only for the active tab (background panes may repaint or
  detach at any time); the records are dropped either way.

```js
// Host running in the same JS realm as the Browser page:
const snapshot = AgentBrowserTabs.getElementSelections();      // active tab
const byTab    = AgentBrowserTabs.getElementSelections(tabId); // specific tab
AgentBrowserTabs.clearElementSelections(tabId);
```

Pick mode entry, hovering, picking, the annotation panel, renaming, comments,
and marker removal are all end-user Browser UI — hosts never drive them.

---

## Message bridge (hosts embedding the Browser as an iframe)

Same envelope conventions as `agent-browser:get-content` / `get-tab-info`:
send from the host window to the Browser frame with a `requestId`, receive a
correlated `:response` on `window` (the Browser posts to `window.parent`).

```js
// Ask for the active tab's selections:
browserFrame.contentWindow.postMessage({
  type: "agent-browser:get-element-selections",
  requestId: "req-42"
}, "*");

window.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "agent-browser:get-element-selections:response"
      && data.requestId === "req-42") {
    if (data.ok) {
      const snapshot = data.result;   // shape as above
    } else {
      // data.error.code === "tab_not_found"
    }
  }
});
```

`agent-browser:clear-element-selections` works identically and answers
`agent-browser:clear-element-selections:response` with
`result = { tabId, cleared: true }`.

### Host events pushed to the host

On every store change the Browser posts (best-effort, fire-and-forget):

```js
{
  type: "agent-browser:event",
  version: 1,
  event: "element-selections-changed",
  payload: {
    reason: "marker-added" | "marker-updated" | "marker-removed" | "cleared",
    tabId: 3,
    count: 2
  }
}
```

The payload carries counts only — call `getElementSelections` to fetch bodies.
Security note: inbound picker events (frame → Browser) are accepted only from
the active tab's own frame window; hosts should likewise verify `event.source`
before trusting bridge traffic.

---

## Recommended host wiring (MetaBot use case)

The typical IDBots loop: the human marks elements, then tells the MetaBot
"change these". The host listens for changes, and when composing the LLM
request, renders the current selections into a prompt fragment:

```js
let lastSelections = null;

window.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "agent-browser:event"
      && data.event === "element-selections-changed") {
    lastSelections = AgentBrowserTabs.getElementSelections(data.payload.tabId);
  }
});

function selectionFragment(snapshot) {
  if (!snapshot || !snapshot.selections.length) return "";
  const lines = snapshot.selections.map((selection, index) => {
    const where = selection.locator.cssSelector;
    const what = selection.element.tag
      + (selection.element.id ? "#" + selection.element.id : "")
      + (selection.element.classes.length ? "." + selection.element.classes.join(".") : "");
    return [
      `[${index + 1}] ${selection.name} — <${what}>`,
      `  locator (${selection.locator.cssScope}): ${where}`,
      selection.locator.xpath ? `  xpath: ${selection.locator.xpath}` : "",
      selection.element.textPreview ? `  text: ${selection.element.textPreview}` : "",
      selection.comment ? `  human comment: ${selection.comment}` : ""
    ].filter(Boolean).join("\n");
  });
  return "Marked elements on \"" + snapshot.title + "\" (" + snapshot.uri + "):\n" + lines.join("\n");
}
```

Notes for integrators:

- **Read early, clear explicitly.** Selections die on navigation. If the host
  needs them later (e.g. the MetaBot reply arrives after the user navigated),
  capture the snapshot on `element-selections-changed` / on send.
- **Comments are the human's intent** — always forward them verbatim; the
  locator + element fields are the machine's address for the target.
- `geometry` describes the capture-time viewport (useful for "the box on the
  right" style references); it is not a stable identifier.
- A host "clear" button (after the MetaBot has consumed the marks) maps to
  `clearElementSelections`; the user-facing flow already covers removing
  single markers via badge → panel → Remove.

---

## Integration checklist (IDBots / OAC)

1. Bump pinned ABC packages to `0.10.0` (`agent-browser-ui`,
   `agent-browser-core`, `agent-browser-host-contract`; renderers if pinned).
   No adapter, route, or host-contract surface changes — the feature is fully
   contained in the served Browser page.
2. Keep the existing embed wiring unchanged; the picker is enabled by default
   in the served page and self-gates per renderer.
3. Add the read path: listen for `element-selections-changed`, expose
   `getElementSelections` to the MetaBot context builder (fragment example
   above), and decide when to call `clearElementSelections`.
4. Regression-test with the served page: mark elements on a bot page
   (chrome-DOM mode) and on a `metaapp://` preview (iframe mode); verify the
   host receives `element-selections-changed` and that navigation clears.
   Reference implementations: `tests/ui/browserPageElementPicker.test.mjs`
   and `tests/ui/browserElementPickerE2E.test.mjs` in this repository.
5. Do not add host-side picker triggers in v1; if a "please mark the element"
   nudge is needed, show it in the host chat, not by driving the Browser UI.

## Versioning note

| Version | Added |
| ------- | ----- |
| `0.10.0` | Element picker: toolbar entry, annotation panel, per-tab marker store, `AgentBrowserTabs.getElementSelections/clearElementSelections`, bridge methods `agent-browser:get-element-selections` / `agent-browser:clear-element-selections`, host event `element-selections-changed`, `BrowserElementSelection*` contract types. |
