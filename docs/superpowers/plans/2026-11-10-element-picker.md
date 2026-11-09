# Element Picker (annotations + host read API) — Implementation Plan

**Goal:** Let a human select HTML elements on the content currently open in the Browser, annotate
them (auto name `Marker 1…`, optional comment, rename), and expose a host-facing read API so a
host MetaBot (IDBots / OAC) can learn exactly which element the human is referring to when
requesting changes — the Browser stays decoupled from host composers; it only stores markers and
serves the read API.

**Scope (agreed 2026-11-10):**

- Supported content: everything the Browser renders from infrastructure we control —
  `metaapp://` (zip or single-file HTML served via preview-assets), `preview-metaapp://localhost`,
  built-in bot pages, `pin://` (pin-inspector payload rendering).
- Not supported in v1 (picker button shows an "unsupported content" hint there):
  `preview-metaapp://<remote-host>` (direct external `https://` iframe, no injection point),
  `metafile://` HTML documents (remote accelerated CDN iframe), nested iframes inside a picked
  page (control messages are not propagated into sub-frames in v1).
- Annotation panel: info sections (identification, locator & geometry, semantics & state, page &
  capture, style) + per-marker comment + rename. No element screenshots in v1.
- Lifecycle: markers are per tab and cleared on navigation/reload/back/forward (old locators are
  stale) and on tab close; switching tabs keeps each tab's markers.

**Architecture — one engine, two hosts.** The Browser renders all content in cross-origin
sandboxed iframes (`htmlFrameSandbox`), except bot pages and pin-inspector payloads which are
rendered directly into chrome DOM. Therefore the picker engine (hover highlight, click capture,
element info extraction, marker overlay painting, scroll/resize repositioning) is written once as
an ES5 source string in core and runs in two hosts:

1. **iframe mode** (`metaapp://`, `preview-metaapp://localhost`): injected as a fourth
   `injectHeadScript` in `preparePreviewHtml` (after storage shim, navigation bridge, video
   fallback — so its capture-phase click handler runs before the navigation bridge and can
   suppress link clicks during pick mode). Dormant until chrome sends
   `agent-browser:picker-enable`; talks to chrome via postMessage (raw
   `{type: 'agent-browser:picker-…'}` messages, same style as the navigation bridge).
2. **chrome-DOM mode** (bot pages, pin-inspector): the same engine source is interpolated into
   the served client script (`app.ts` template literal), and chrome instantiates it directly,
   scoped to the rendered pane subtree.

**Host read API:** selection state lives in the client script like all tab content state (there is
no adapter state behind `getTabContent`). The API mirrors the existing page-embedded surface:
`globalThis.AgentBrowserTabs.getElementSelections(tabId?)` / `clearElementSelections(tabId?)`,
postMessage methods `agent-browser:get-element-selections` / `agent-browser:clear-element-selections`
(with `:response` replies), and an outbound host event `element-selections-changed` emitted on
every change. Types for the records live in `packages/host-contract`. IDBots/OAC wrappers are
separate-repo follow-ups and out of scope here.

**Tech Stack:** TypeScript workspace; Node built-in test runner (`node --test`, dist `require`
style); `node:vm` + FakeElement harness for chrome-script logic; Playwright chromium for a real
pick-flow E2E; no new dependencies.

---

## Working context

- **Worktree:** `.worktrees/element-picker` (branch `feat/element-picker`). Paths below are
  relative to that root.
- **Build:** `npm run build` (ESM + CJS); `npm run build:esm` for TDD loops.
- **Targeted tests:** `node --test tests/core/elementPicker.test.mjs
  tests/ui/browserPageElementPicker.test.mjs tests/ui/browserElementPickerE2E.test.mjs`; full
  suite: `npm run verify`.
- **Served-script escaping:** the client script in `packages/ui/src/browser/app.ts` is ONE giant
  TS template literal (`buildBrowserPageScript()`). New JS inside it MUST NOT contain backticks
  or `${`. The interpolated engine source must satisfy the same constraint (guarded by a unit
  test). `page.ts` keeps `split(placeholder).join(value)`.
- **Language:** code, comments, tests, docs in English. Commit messages `<type>: <description>`.
- **Commits:** one commit per unit of work; after each commit post a dev-journal buzz with the
  Bob identity (repo rule from AGENTS.md).

---

### Task 1: Core — picker engine source + preview HTML injection

**Files:**
- New: `packages/core/src/browser/elementPicker.ts`
- Modify: `packages/core/src/browser/previewHtml.ts` (fourth injection)
- Modify: `packages/core/src/index.ts` (exports)
- New: `tests/core/elementPicker.test.mjs`

- [ ] **Step 1: Engine source.** `ELEMENT_PICKER_SCRIPT_SOURCE` — idempotent IIFE guarded by
  `__agentBrowserElementPickerBridge` marker. Installs
  `window.__agentBrowserElementPicker = { create }` where `create({ root, onEvent })` returns
  `{ enable, disable, isEnabled, addMarker, updateMarker, removeMarker, clearMarkers }`.
  Engine behavior:
  - enable: capture-phase `mouseover`/`mouseout` (hover outline + tag chip), `click`
    (preventDefault + stopPropagation + stopImmediatePropagation, build element info, emit
    `pick`), capture-phase `scroll` on document + `resize` (reposition markers), `keydown`
    Escape (emit `escape`). disable: remove hover/click behavior; markers stay painted.
  - element info: tag, id, classes, attributes (cap 40 × 200 chars), `role` attribute,
    accessible-name candidates (`aria-label`, `alt`, `title`, `placeholder`, `value`, `href`,
    trimmed `textContent`), text preview (500 chars), outerHTML preview (2000 chars), css
    selector (id if unique, else nth-of-type path from root, depth cap 60; `cssScope` =
    `document` in iframe mode, `browser-pane` in chrome-DOM mode), absolute XPath, rect +
    scroll + viewport size, computed style summary (`color`, `backgroundColor`, `fontSize`,
    `fontFamily`, `fontWeight`, `display`).
  - markers: `addMarker(markerId, label)` binds to the most recently picked (still connected)
    element and paints a blue outline + badge chip into an overlay layer appended to `root`;
    `updateMarker` renames the badge; `removeMarker`/`clearMarkers` remove painting; marker
    badges are clickable and emit `marker-click` even when pick mode is off; cap 50 markers.
  - iframe auto-wiring: when `window.parent !== window`, auto-create on `document.documentElement`
    and translate control messages (`agent-browser:picker-enable|disable|add-marker|update-marker|
    remove-marker|clear-markers`) into calls, events out as
    `{type: 'agent-browser:picker-event', version: 1, event}` to `window.parent` (`'*'` target).
- [ ] **Step 2: Injection.** `ELEMENT_PICKER_BRIDGE = '<script>' + source + '</script>'`;
  `preparePreviewHtml` injects it fourth, marker-guarded, `text/html` only.
- [ ] **Step 3: Tests.** Injection present/idempotent/non-HTML untouched; source contains no
  backtick or `${`; bridge message names present; marker/caps constants visible.

**Verify:** `npm run build:esm && node --test tests/core/elementPicker.test.mjs tests/host-standalone/previewHtml.test.mjs`

### Task 2: host-contract — element selection types

**Files:**
- Modify: `packages/host-contract/src/index.ts`

- [ ] **Step 1:** Add `BrowserElementSelectionRect`, `BrowserElementSelectionLocator`,
  `BrowserElementSelectionElement`, `BrowserElementSelectionGeometry`,
  `BrowserElementSelectionStyle`, `BrowserElementSelection` (markerId, name, comment?, capturedAt,
  page{url,title}, frame{url}, locator, element, geometry, style), and
  `BrowserElementSelectionsSnapshot` (tabId, uri, title, selections). Types only — the postMessage
  transport stays string-based as today.

**Verify:** `npm run build:esm && node --test tests/host-contract/*.test.mjs`

### Task 3: UI — toolbar entry, pick controller, panel, markers, host API

**Files:**
- Modify: `packages/ui/src/browser/app.ts` (markup, elements map, wiring, controller, panel,
  store, host API, interpolated engine source)
- Modify: `packages/ui/src/browser/indexHtml.ts` (styles)
- Modify: `packages/ui/src/browser/menuModel.ts` (menu mirror entry)
- New: `tests/ui/browserPageElementPicker.test.mjs` (vm harness)
- New: `tests/ui/browserElementPickerE2E.test.mjs` (Playwright, real chromium)

- [ ] **Step 1: Toolbar + state.** Crosshair button `data-browser-picker-toggle` next to the
  bookmark star (markup, elements map, `initialize()` listener, active styling, menu mirror entry
  `toggle-element-picker`); per-tab store `tabElementSelections` cleared in `resolveUri` success
  (origin tab), `closeTab`, and before pane repaint of a navigated renderer.
- [ ] **Step 2: Pick controller.** Toggle pick mode for the active tab: iframe renderer →
  postMessage control via `bridgePostMessage`-style channel + `agent-browser:picker-event`
  listener; bot-page/pin-inspector renderer → direct engine instance scoped to the pane.
  Unsupported renderers (remote preview-metaapp, metafile CDN iframe, media, pdf) → disabled
  button + toast hint.
- [ ] **Step 3: Annotation panel.** Overlay panel (identification with editable name + tag chip,
  Locator & Geometry, Semantics & State, Page & Capture, Style sections, comment textarea,
  Cancel/Save). Save → marker record + `add-marker`; badge click → reopen panel for edit
  (rename/comment/remove). Esc exits pick mode. English UI text.
- [ ] **Step 4: Host read API.** `AgentBrowserTabs.getElementSelections/clearElementSelections`;
  postMessage `agent-browser:get-element-selections` / `agent-browser:clear-element-selections`
  with `:response` replies; `element-selections-changed` host event; records conform to
  host-contract types (capped previews).
- [ ] **Step 5: Tests.** vm-harness: toolbar wiring, unsupported renderer gating, panel save flow
  (FakeElement), marker store lifecycle clearing, host API + postMessage round trip + event.
  Playwright E2E: load a built page, open a bot-page pane, run engine in chrome-DOM mode — hover,
  pick, panel save, badge painted, `getElementSelections()` returns the record; navigation clears.

**Verify:** `npm run build && node --test tests/ui/browserPageElementPicker.test.mjs tests/ui/browserElementPickerE2E.test.mjs`

### Task 4: Full verification + merge prep

- [ ] `npm run verify` (full suite) and `npm run verify:packages` in the worktree.
- [ ] `git diff --check` for docs-only deltas; small per-unit commits + buzz entries.

---

**Out of scope / follow-ups:** IDBots + OAC host wrappers reading the new API; nested-iframe pick
propagation; element screenshots; picker support for remote preview-metaapp / metafile CDN
iframes (requires an injection point that does not exist today).
