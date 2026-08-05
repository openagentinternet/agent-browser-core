# Browser Tabs Design

Date: 2026-07-23

## Goal

Add Chrome-style multi-tab support to the Agent Browser Core (ABC) UI so that the
Agent Internet browser behaves like a standard browser. The feature lives entirely
in the served Browser UI stack (`packages/ui/src/browser/`) and is host-neutral:
it works in standalone hosting and is consumable by OAC / IDBots.

## Scope & Decisions

These boundaries were confirmed during brainstorming:

- **New-tab sources** (three): host programmatic call, content-area `target=_blank`
  links, and Ctrl/Cmd+click on any link. Address-bar input and ordinary in-page links
  always navigate within the current tab (standard browser semantics).
- **Persistence**: session-level only. Refresh/reopen resets the tab list to a single
  default tab. This matches the existing single-tab behavior, where `current`/`history`
  are session-only. Bookmarks/visits remain persisted (shared, unrelated to tabs).
- **External API surface**: client-side `globalThis` bridge only. Do **not** extend
  `host-contract` or add HTTP endpoints. Tabs are a pure client-runtime concept; the
  server holds no tab session state.
- **Layout**: replicate Chrome. Remove the standalone 34px brand titlebar and fold the
  logo + `Bot Browser` brand name into the left of the tab strip. Tabs begin to the
  right of the brand area (never covering the logo). A `+` button sits at the far right.

## Architecture

### Data model (chosen: Tab-scoped state — Approach A)

Generalize the single `state.current` + single `state.history/historyIndex` into an
array of independent tabs, each owning its own navigation stack.

New `BrowserTab` type (inside the inline client script):

```ts
type BrowserTab = {
  id: number;            // monotonic, allocated from state.nextTabId
  current: BrowserResolveResult | null;  // null = empty/welcome tab
  history: string[];     // that tab's own back/forward stack
  historyIndex: number;
  status: 'idle' | 'loading' | 'resolved' | 'error';
  error: string | null;
  actorId: string;       // per-tab Using Actor (seeded from runtime.defaultActor)
};
```

`state` refactor — source of truth is `tabs[]`; shared fields stay global:

| Field | Ownership | Notes |
|------|-----------|-------|
| `tabs: BrowserTab[]` | new (per-tab container, **source of truth**) | all tabs; each owns current/history/historyIndex/status/error |
| `activeTabId: number` | new | currently active tab |
| `nextTabId: number` | new | id allocator |
| `current` / `history` / `historyIndex` | **read-only mirrors** | reflect `activeTab()`; refreshed by `applyActiveTabState()`. Kept (not removed) so the ~40 existing `state.current` read sites stay untouched |
| `status` / `error` | **read-only mirrors** | reflect active tab |
| `enrichToken` | **per-tab** (mirror of active tab's) | prevents stale async enrichment of tab A from polluting tab B after a switch |
| `actorId` | **per-tab** (mirror of active tab's) | each tab owns its Using Actor; seeded from `runtime.defaultActor` (the host default) on creation and at boot. `selectUsingIdentity` writes to the active tab only; `applyActiveTabState()` mirrors it onto `state.actorId` so `endpointWithActor()`/`resolveUrl()` stamp the active tab's actor on resolve/trusted-action/signing calls. Switching an actor in one tab never affects another. |
| `runtime` / `standaloneWalletPlaceholderActor` | **global** | runtime (incl. `defaultActor`, the host-supplied default for new tabs) is shared; standalone wallet placeholder is page-global |
| `bookmarks` / `visits` | **global** | shared across tabs; still persisted |
| `drawerOpen` / `inspectorOpen` / `menuOpen` / panels | **global** | UI panels shared |

**Mirror approach (Option 2, chosen):** `state.tabs[]` is the single source of truth.
`state.current/history/historyIndex/status/error/enrichToken/actorId` remain on `state` as
read-only mirrors of the active tab, refreshed by one helper `applyActiveTabState()`
after every mutation (nav) and every tab switch. Rationale: there are ~40 read-only
`state.current` sites across ~20 functions (owner panel, inspector, bookmark logic,
pin-inspector, resource chip). Routing all 43 through an accessor is high-risk churn.
With mirrors, those ~40 readers are untouched; only the ~8 *write* sites
(`resolveUri`, `renderCurrent`, `renderWelcome`, `renderNoLocalBot`, `pushHistory`,
`goBack`, `goForward`, `reloadCurrent`) and the tab mutation functions write to the
active tab first, then call `applyActiveTabState()` to sync the mirrors. Behavior is
identical to a full "removed" model: per-tab ownership + instant cache-hit switching.

Helper functions:

- `activeTab()` → returns the tab whose `id === state.activeTabId`.
- `applyActiveTabState()` → copies the active tab's
  `current/history/historyIndex/status/error/enrichToken` onto the `state` mirrors.
  Called after every navigation write and every `switchTab`.
- Write sites (nav functions) write to `activeTab()` then call `applyActiveTabState()`.
- `syncToolbarForActiveTab()` → after a switch, sync the address-bar input value,
  back/forward disabled states, page title, and bookmark star to the active tab's
  state. The toolbar is shared but always reflects the active tab (Chrome behavior).

Boot: `initialize()` always creates exactly one tab. If a `?uri=` deep link (or path)
is present, that tab navigates to it (unchanged); otherwise it is an empty welcome tab.

Switching is instant with no network request: `switchTab(id)` sets `activeTabId`, then
renders from the tab's cached `current` (or restores loading/error/welcome view).

### UI / DOM / CSS

Shell grid (in `packages/ui/src/browser/indexHtml.ts`):

```css
/* before */
grid-template-rows: 34px 58px auto minmax(0, 1fr) 32px;
/* after — row 1 becomes the tab strip (with embedded brand) */
grid-template-rows: 38px 58px auto minmax(0, 1fr) 32px;
```

The old `.browser-titlebar` block is removed; its brand elements move into the new tab
strip. Row indices of `.browser-topbar` (row 2), status row, `.browser-viewport-row`
(row 4), and `.browser-status-strip` (row 5) are unchanged.

New DOM (in `app.ts` `buildBrowserPageDefinition().contentHtml`, replacing
`.browser-titlebar`):

```html
<div class="browser-tabstrip" data-browser-tabstrip>
  <div class="browser-tabstrip-brand">
    <span class="browser-brand-icon">…globe SVG…</span>
    <span class="browser-brand-name">Bot Browser</span>
  </div>
  <div class="browser-tabstrip-tabs" data-browser-tabs-container>
    <!-- dynamic per-tab: -->
    <div class="browser-tab" data-tab-id="1" role="tab">
      <span class="browser-tab-title" title="…">page title</span>
      <button class="browser-tab-close" data-tab-close="1" aria-label="close">×</button>
    </div>
    …
  </div>
  <button class="browser-tab-new" data-browser-tab-new aria-label="new tab">+</button>
</div>
```

CSS highlights:
- `.browser-tabstrip` — `grid-row: 1; grid-column: 1 / -1; display: flex; align-items: stretch`.
- `.browser-tabstrip-brand` — fixed width, `flex: none`, vertically centered. Tabs start
  to its right, never covering the logo (hard constraint).
- `.browser-tabs-container` — `flex: 1; display: flex; overflow-x: auto` (horizontal
  scroll when many tabs).
- `.browser-tab` — `min-width: 90px; max-width: 200px`; title uses
  `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`; close button shows
  on hover only.
- `.browser-tab.is-active` — highlighted background + bottom border (Chrome-like).
- `.browser-tab-new` — `flex: none`, round `+`, rightmost.
- Responsive: at `max-width: 768px`, hide/collapse the brand name but keep the tab strip
  (tabs still needed on mobile). Existing responsive rules for other regions unchanged.

New render function `renderTabs()`: rebuilds the inner DOM of
`.browser-tabs-container` from `state.tabs` (applies `.is-active` to the active tab;
computes each label via `currentDisplayTitle()`; empty tabs show "新标签页"). Called on
tab list change, active change, and any tab's current-page title change.

`.browser-titlebar` removal cleanup:
- `bindElements()`: drop `pageTitle` binding, add `tabstrip`, `tabsContainer`, `tabNew`.
- `syncBrowserPageTitle()`: still updates `document.title`, but the in-page title display
  moves to the tab label; the brand name "Bot Browser" becomes static (no longer
  concatenated with the dynamic page title). The `data-browser-page-title` hook is kept
  (relocated) so existing title-sync VM tests keep passing.

### Navigation & new-tab interactions

In-tab navigation (default, current tab): address-bar submit and ordinary in-page link
clicks call `navigateTo(uri)` operating on `activeTab()`; back/forward/reload operate
on `activeTab()`'s history.

All three new-tab sources funnel into one entry point `openTab(uri?)`:

1. `createTab()` → push a tab into `state.tabs` with `current=null`, `history=[]`,
   `historyIndex=-1`, `status='idle'`; allocate `nextTabId`.
2. Set it as `activeTabId`.
3. `renderTabs()`.
4. If `uri` passed → `navigateTo(uri)` within the new (now-active) tab; else
   `renderWelcome()`.
5. `syncToolbarForActiveTab()`.

Source detection (added to the existing viewport link handler in `initialize()`):
click handler checks for `target=_blank` attribute or `e.metaKey || e.ctrlKey`; if hit,
`e.preventDefault()` + `openTab(linkUri)`; otherwise current-tab `navigateTo`.

`closeTab(id)`:
1. Find index `idx` of the tab.
2. Remove from `state.tabs`.
3. If it was the last tab → create a fresh empty tab (always keep `>= 1` tab, Chrome-like).
4. If the closed tab was active → activate a neighbor (prefer right, else left),
   `switchTab(neighbor)` → `renderCurrent()` / `renderWelcome()` +
   `syncToolbarForActiveTab()`.
5. Else only `renderTabs()`.

`switchTab(id)`:
1. `activeTabId = id`.
2. `renderTabs()`.
3. Render based on the tab's state:
   - `current` non-null → `renderCurrent()` (cache hit, **no fetch**).
   - `status==='loading'` → restore loading view.
   - `status==='error'` → restore error view.
   - else → `renderWelcome()`.
4. `syncToolbarForActiveTab()` (address bar, back/forward disabled states, bookmark star,
   `document.title` all reflect the active tab).

Invariants (test assertion points):
- Always `state.tabs.length >= 1`.
- Exactly one active tab; its `current` is the viewport content.
- `openTab()` with no uri creates an empty welcome tab; with uri it navigates the new tab
  and leaves other tabs untouched.
- Closing the active last tab auto-creates a fresh empty tab.

### External API & host bridge

All client-side, no `host-contract` / HTTP changes. Introduce a single namespace to
avoid polluting `globalThis`; keep existing direct function exports for backward
compatibility.

```ts
interface TabInfo {
  id: number;
  uri: string | null;     // current?.uri ?? current?.normalizedUri ?? null (null for empty tab)
  title: string | null;   // currentDisplayTitle() result; null for empty tab
  isActive: boolean;
  actorId: string;        // this tab's Using Actor id (per-tab; '' if none)
}

globalThis.AgentBrowserTabs = {
  openTab,      // (uri?: string, actorId?: string) => number   create + activate, return new tab id
  closeTab,     // (id: number) => void       close; closing the last auto-creates an empty one
  switchTab,    // (id: number) => void       activate the given tab
  getTabs,      // () => TabInfo[]            read-only snapshot of all tabs
  getActiveTab, // () => TabInfo | null       read-only snapshot of the active tab
};
```

`getTabs()` / `getActiveTab()` return shallow read-only snapshots; hosts cannot mutate
internal state via them.

Bridge message channel (reuse the existing `postMessage` listener in `initialize()`):
- `agent-browser:open-tab` `{ uri?: string, actorId?: string }` → `openTab` (an unknown `actorId` falls back to the host default actor)
- `agent-browser:close-tab` `{ id: number }` → `closeTab`
- `agent-browser:switch-tab` `{ id: number }` → `switchTab`

Rationale: tabs are a client-only runtime concept (server is stateless, has no tab
session). The server's `resolveResource(uri)` remains the sole resource-resolution
entry and is unrelated to tabs. `globalThis` + `postMessage` is sufficient for OAC /
IDBots to call from within their WebView/iframe, and is consistent with the existing
client-only navigation architecture.

### Title sync & refresh/restart behavior

Title appears in three places, kept consistent:

| Location | Content | Updated on |
|----------|---------|-----------|
| Tab label | `currentDisplayTitle()`; empty tab shows "新标签页" | any tab navigates / state changes |
| `document.title` | active tab title + ` - Bot Browser` | active tab content change / switch |
| Brand area | static "Bot Browser" (no dynamic page title) | never |

`syncBrowserPageTitle(title)` is refactored to `syncActiveTabTitle()`: reads
`activeTab().current`, computes the title, updates `document.title`, and calls
`renderTabs()` (so the tab label syncs). Called at the end of `renderCurrent`,
`renderWelcome`, etc. `currentDisplayTitle()` is reused unchanged. Empty-tab fallback
text is "新标签页".

Refresh/restart: session-level. After refresh, `state.tabs` resets; `initialize()`
recreates exactly one default tab. Deep-link handling is unchanged (`?uri=` query param
or path → the default tab navigates there; else empty welcome). Bookmarks/visits restore
from `localStorage` (shared, unrelated to tabs). Tab list / per-tab history / current
are not persisted.

Compatibility boundaries (verified during implementation):
- Bookmark star (`data-browser-bookmark-star`): reflects the active tab's current page;
  refreshed in `syncToolbarForActiveTab()`.
- Visits: all tabs write into the shared global `visits` (cross-tab "recent" semantics).
- Resource chip / owner panel / actor panel: reflect the active tab's `current`; redraw
  via `renderCurrent()` on switch.
- Menu / settings / drawer / inspector: global; not closed on switch. If their content
  depends on the active tab, refresh after `switchTab`.
- `enrichToken` per-tab (see data model): switching prevents a stale async enrichment of
  one tab from polluting another's display.

Error-state tab behavior: a tab that fails to navigate only affects itself
(`status='error'`, viewport shows the error; tab label may show an error marker).
Switching away and back restores its error view. Other tabs are unaffected.

## Testing strategy

Project uses Node's built-in `node:test` + `node:assert/strict`; tests import from
`packages/*/dist` (build first), `.mjs` files run via `node --test`. The inline client
script is testable via the established VM + `FakeElement` pattern (see
`tests/ui/browserPageState.test.mjs`, `browserPageActions.test.mjs`).

### Layer 1 — string/structural conformance

Existing tests must be updated because `.browser-titlebar` is removed:
- `tests/ui/browserPage.test.mjs:22-23` — drop `browser-titlebar` / `Bot Browser - ...page-title`
  assertions; replace with assertions that `browser-tabstrip`,
  `data-browser-tabs-container`, `data-browser-tab-new` are present.
- `tests/ui/browserPageLayout.test.mjs:63` — `grid-template-rows` assertion changes from
  `34px 58px auto minmax(0,1fr) 32px` to `38px 58px auto minmax(0,1fr) 32px`.
- `tests/ui/browserPageLayout.test.mjs:66` — viewport-row grid-row index: unchanged
  (row numbering is preserved; row 1 simply becomes the tab strip).
- Keep `data-browser-page-title` (relocated) so existing title-sync VM tests pass.

New structural assertions:
- Inline script contains `function createTab`, `function closeTab`, `function switchTab`,
  `function openTab`, and `globalThis.AgentBrowserTabs`.

### Layer 2 — behavioral tests (new `tests/ui/browserPageTabs.test.mjs`)

Reuse the VM + `FakeElement` pattern; add fake nodes for `[data-browser-tabstrip]`,
`[data-browser-tabs-container]`, `[data-browser-tab-new]`; execute the script via
`vm.runInNewContext`; fire listeners and assert state/render.

Cases (mapping to the invariants above):
1. Boot single tab: `getTabs().length === 1`; `getActiveTab()` is it; empty tab has
   `uri===null && title===null`.
2. `openTab(uri)`: tabs +1; new tab active; new tab navigates (fake fetch called); old
   tab untouched.
3. `openTab()` (no uri): new tab is empty welcome; no fetch.
4. `closeTab` non-active: tabs -1; active unchanged.
5. `closeTab` active (multi-tab): tabs -1; neighbor becomes active; viewport shows its
   content with no fetch.
6. `closeTab` last tab: still 1 tab (auto-created empty); `getTabs().length === 1`.
7. `switchTab`: active switches; viewport content switches with no fetch; toolbar
   (address-bar value, back/forward disabled state) reflects the new active tab.
8. In-tab navigation: address-bar submit navigates within the current tab (history pushed
   into that tab's history); no new tab.
9. `target=_blank` link click: viewport link handler detects target → new tab + fetch.
10. Ctrl/Cmd+click link: handler detects `metaKey||ctrlKey` → new tab.
11. Tab label title: after navigation the label shows the normalized title; empty tab
    shows "新标签页".
12. `getTabs`/`getActiveTab` return read-only snapshots: mutating the returned object does
    not affect internal state.

### Layer 3 — Playwright layout verification (extend `browserPageLayout.test.mjs`)

Existing Playwright checks cover viewport/drawer/inspector geometry, not the titlebar.
Add one check: assert the tab strip exists, the `+` button is rightmost, and tabs start
to the right of the brand area (logo not covered). Validates the "replicate Chrome"
layout in real Chromium.

### Running tests

New/changed tests are `.mjs`; `npm run build` then `npm test` (full). Focus first on
`npm run test:browser_parity` (covers `tests/browser/*` + `tests/ui/browserPage*`).

## Files touched

All changes are in the served stack unless noted:
- `packages/ui/src/browser/app.ts` — data model refactor, `createTab`/`closeTab`/
  `switchTab`/`openTab`/`renderTabs`/`syncToolbarForActiveTab`/`syncActiveTabTitle`,
  link-handler source detection, `globalThis.AgentBrowserTabs` + bridge messages,
  remove `.browser-titlebar` markup and add tab-strip markup.
- `packages/ui/src/browser/indexHtml.ts` — remove `.browser-titlebar` CSS; change
  `grid-template-rows` first track to `38px`; add tab-strip CSS + responsive rules.
- `packages/ui/src/browser/page.ts` — only if new template placeholders are needed
  (none expected); keep using `split().join()` for any injection.
- `tests/ui/browserPage.test.mjs`, `tests/ui/browserPageLayout.test.mjs` — update
  titlebar/grid assertions.
- `tests/ui/browserPageTabs.test.mjs` — new behavioral tests.
- (Optionally extend `browserPageLayout.test.mjs` Playwright section.)

Do not touch the legacy parity stack (`packages/ui/src/browserShell.ts`,
`browserStyles.ts`, `browserClientScript.ts`, `pageDefinition.ts`, `browserTypes.ts`,
`menuModel.ts`). Do not touch `packages/host-contract`.

## Constraints (from AGENTS.md)

- Placeholder injection in `page.ts` / `indexHtml.ts` MUST use
  `String.prototype.split(placeholder).join(value)`, never `replace(placeholder, value)`.
- The inline client script contains regex literals with `$`; never `replace` the script
  content with a value substitution.
- Keep Browser core host-neutral; host-specific behavior stays in host adapters.
