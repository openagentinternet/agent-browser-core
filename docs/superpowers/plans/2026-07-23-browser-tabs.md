# Browser Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chrome-style multi-tab support to the served Agent Browser UI so the Agent Internet browser behaves like a standard browser.

**Architecture:** Generalize the single `state.current` + single navigation stack into `state.tabs: BrowserTab[]` (source of truth), with `state.current/history/historyIndex/status/error/enrichToken` kept as read-only mirrors of the active tab, refreshed by `applyActiveTabState()`. This avoids touching the ~40 existing `state.current` read sites; only ~8 write sites route through the active tab. A new tab strip (row 1, 38px) replaces the old `.browser-titlebar`, with the logo + `Bot Browser` brand embedded at the left (Chrome-like). Three new-tab sources funnel into one `openTab(uri?)`. A `globalThis.AgentBrowserTabs` namespace exposes host integration; no `host-contract` or HTTP changes.

**Tech Stack:** TypeScript, Node `node:test` + `node:assert/strict`, VM-based client-script tests with a `FakeElement` DOM mock, Playwright for layout geometry. All client logic is one inline script string emitted by `buildBrowserPageScript()` in `packages/ui/src/browser/app.ts`.

## Global Constraints

- Tests import from `packages/*/dist` (built JS). Run `npm run build` (or `npm run build:esm`) before running tests so source changes are picked up.
- The full test command is `npm test` (= build + `node --test tests/**/*.test.mjs`). The browser-focused subset is `npm run test:browser_parity`.
- Placeholder injection in `page.ts` / `indexHtml.ts` MUST use `String.prototype.split(placeholder).join(value)`, never `replace(placeholder, value)`.
- The inline client script contains regex literals with `$` (e.g. `replace(/\/+$/, '')`). Never `String.prototype.replace(placeholder, value)` the script content.
- Do NOT touch the legacy parity stack: `packages/ui/src/browserShell.ts`, `browserStyles.ts`, `browserClientScript.ts`, `pageDefinition.ts`, `browserTypes.ts`, `menuModel.ts`.
- Do NOT touch `packages/host-contract`.
- All edits to the served page go in `packages/ui/src/browser/` (`app.ts`, `indexHtml.ts`).
- The client script uses ES5-style `var`/`function` declarations (it is a template-literal string), NOT modern `const`/arrow functions. Match that style inside `buildBrowserPageScript()`.
- The client script is the body of a template literal in `app.ts`, so backslashes must be doubled in regexes (`\\.`) and `\` in strings stays `\\` — match the existing escaping when adding code.

---

## File Structure

All changes are in the served stack + tests:

- `packages/ui/src/browser/app.ts` — data model (state), new tab functions (`createTab`, `closeTab`, `switchTab`, `openTab`, `renderTabs`, `applyActiveTabState`, `syncToolbarForActiveTab`, `activeTab`), nav-function rewrites, link-handler new-tab detection, `globalThis.AgentBrowserTabs`, bridge messages, shell markup (remove `.browser-titlebar`, add tab strip).
- `packages/ui/src/browser/indexHtml.ts` — CSS: remove `.browser-titlebar`/`.browser-window-brand`/`.browser-brand-icon` blocks; change grid first track to `38px`; add `.browser-tabstrip*` CSS; update the 768px media query.
- `tests/ui/browserPage.test.mjs` — update titlebar assertions → tab-strip assertions.
- `tests/ui/browserPageLayout.test.mjs` — update `grid-template-rows` assertion.
- `tests/ui/browserPageTabs.test.mjs` — **new** behavioral test file (VM + FakeElement).

---

## Task 1: Update existing structural/layout tests to the tab-strip shell

This task changes the shell markup and CSS first, and updates the two tests that assert on the old `.browser-titlebar`/grid geometry. After this task the build and the updated tests pass, but there is no tab *behavior* yet (a single tab is rendered statically). Behavioral logic lands in later tasks.

**Files:**
- Modify: `packages/ui/src/browser/app.ts:37-113` (shell `contentHtml`)
- Modify: `packages/ui/src/browser/indexHtml.ts` (CSS — grid + titlebar blocks + media query)
- Modify: `tests/ui/browserPage.test.mjs:22-24`
- Modify: `tests/ui/browserPageLayout.test.mjs:63`

**Interfaces:**
- Produces: new DOM hooks `data-browser-tabstrip`, `data-browser-tabs-container`, `data-browser-tab-new`, and a static single-tab markup that later tasks render dynamically.

- [ ] **Step 1: Update the failing structural test**

Open `tests/ui/browserPage.test.mjs`. Replace lines 22-24 (the three titlebar assertions) with tab-strip assertions. Find this block:

```js
  assert.match(html, /class="browser-titlebar"/);
  assert.match(html, /Bot Browser -\s*<span class="browser-window-page-title" data-browser-page-title title="Agent Internet Browser">Agent Internet Browser<\/span>/);
  assert.match(html, /data-browser-page-title/);
```

Replace with:

```js
  assert.match(html, /class="browser-tabstrip"/);
  assert.match(html, /data-browser-tabs-container/);
  assert.match(html, /data-browser-tab-new/);
  assert.match(html, /data-browser-page-title/);
```

- [ ] **Step 2: Update the failing grid-geometry test**

Open `tests/ui/browserPageLayout.test.mjs`. Find line 63:

```js
  assertDeclaration(browserShellBlock, 'grid-template-rows', '34px 58px auto minmax(0, 1fr) 32px');
```

Replace with:

```js
  assertDeclaration(browserShellBlock, 'grid-template-rows', '38px 58px auto minmax(0, 1fr) 32px');
```

Line 66 (`assertDeclaration(viewportRowBlock, 'grid-row', '4');`) stays unchanged — row numbering is preserved (row 1 becomes the tab strip, viewport-row is still row 4).

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run build && npm run test:browser_parity`
Expected: FAIL — `browserPage.test.mjs` and `browserPageLayout.test.mjs` fail on the assertions just changed, because the markup/CSS still has the old titlebar.

- [ ] **Step 4: Replace the shell markup with the tab strip**

Open `packages/ui/src/browser/app.ts`. In `buildBrowserPageDefinition().contentHtml` (lines 39-46), replace the entire `.browser-titlebar` div with the tab strip. Replace this exact block:

```
        <div class="browser-titlebar" aria-label="Agent Internet Browser">
          <div class="browser-window-brand">
            <span class="browser-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8S14.2 17.7 12 20M12 4C9.8 6.3 8.7 9 8.7 12s1.1 5.7 3.3 8"></path></svg>
            </span>
            <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Bot Browser - <span class="browser-window-page-title" data-browser-page-title title="Agent Internet Browser">Agent Internet Browser</span></span>
          </div>
        </div>
```

with:

```
        <div class="browser-tabstrip" data-browser-tabstrip aria-label="Agent Internet Browser">
          <div class="browser-tabstrip-brand">
            <span class="browser-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8S14.2 17.7 12 20M12 4C9.8 6.3 8.7 9 8.7 12s1.1 5.7 3.3 8"></path></svg>
            </span>
            <span class="browser-brand-name">Bot Browser</span>
          </div>
          <div class="browser-tabstrip-tabs" data-browser-tabs-container>
            <div class="browser-tab is-active" data-tab-id="0" role="tab">
              <span class="browser-tab-title" data-browser-page-title title="Agent Internet Browser">Agent Internet Browser</span>
              <button type="button" class="browser-tab-close" data-tab-close="0" aria-label="Close tab" tabindex="-1">×</button>
            </div>
          </div>
          <button type="button" class="browser-tab-new" data-browser-tab-new aria-label="New tab" title="New tab">+</button>
        </div>
```

Note: `data-browser-page-title` is preserved (relocated into the first tab title) so the existing title-sync VM tests keep passing.

- [ ] **Step 5: Update the CSS grid first track to 38px**

Open `packages/ui/src/browser/indexHtml.ts`. In the `BROWSER_INDEX_HTML` string, change the grid declaration. Find:

```
grid-template-rows: 34px 58px auto minmax(0, 1fr) 32px;
```

Replace with:

```
grid-template-rows: 38px 58px auto minmax(0, 1fr) 32px;
```

- [ ] **Step 6: Replace `.browser-titlebar` CSS with tab-strip CSS**

In `packages/ui/src/browser/indexHtml.ts`, find the `.browser-titlebar {` rule (it starts with `grid-row: 1; display: flex; align-items: center; justify-content: space-between;` ...). The full block to replace is:

```
      .browser-titlebar {
        grid-row: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        padding: 0 14px;
        border-bottom: 1px solid var(--browser-border);
        background: linear-gradient(#fbfcfe, #eef2f7);
        color: var(--browser-muted);
        user-select: none;
      }
```

Replace with the tab-strip styles:

```
      .browser-tabstrip {
        grid-row: 1;
        display: flex;
        align-items: stretch;
        gap: 0;
        min-width: 0;
        padding: 0;
        border-bottom: 1px solid var(--browser-border);
        background: linear-gradient(#fbfcfe, #eef2f7);
        color: var(--browser-muted);
        user-select: none;
      }
      .browser-tabstrip-brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
        padding: 0 14px;
        color: #263548;
        font-size: 12px;
        font-weight: 650;
        white-space: nowrap;
      }
      .browser-brand-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .browser-tabstrip-tabs {
        flex: 1;
        display: flex;
        align-items: stretch;
        gap: 2px;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: thin;
        padding: 4px 2px 0;
      }
      .browser-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 90px;
        max-width: 200px;
        padding: 0 8px;
        border-radius: 8px 8px 0 0;
        background: transparent;
        color: var(--browser-muted);
        cursor: pointer;
        position: relative;
      }
      .browser-tab:hover {
        background: rgba(47, 111, 237, .06);
      }
      .browser-tab.is-active {
        background: var(--browser-surface);
        color: var(--browser-text);
        box-shadow: 0 -2px 0 var(--browser-accent) inset;
        font-weight: 600;
      }
      .browser-tab-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }
      .browser-tab-close {
        flex: none;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--browser-dim);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        border-radius: 4px;
      }
      .browser-tab:hover .browser-tab-close,
      .browser-tab.is-active .browser-tab-close {
        opacity: 1;
      }
      .browser-tab-close:hover {
        background: rgba(31, 41, 55, .1);
        color: var(--browser-text);
      }
      .browser-tab-new {
        flex: none;
        width: 30px;
        margin: 4px 4px 0;
        border: none;
        background: transparent;
        color: var(--browser-muted);
        font-size: 18px;
        cursor: pointer;
        border-radius: 6px;
      }
      .browser-tab-new:hover {
        background: rgba(47, 111, 237, .1);
        color: var(--browser-accent);
      }
      .browser-brand-icon {
        width: 18px;
        height: 18px;
        color: var(--browser-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .browser-brand-icon svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
```

The `.browser-brand-icon` block was previously nested inside the titlebar region; it is now re-declared here (so the globe logo keeps its styling). Verify the original `.browser-brand-icon` block (the one immediately after the old `.browser-window-brand`) is still present — if it is now a duplicate, remove the older standalone copy to avoid conflict. (It is safe to keep one copy; the rule here supersedes.)

- [ ] **Step 7: Update the 768px media query**

In `packages/ui/src/browser/indexHtml.ts`, find the `@media (max-width: 768px)` block. It currently contains:

```
          grid-template-rows: 0 auto auto minmax(0, 1fr) 32px;
        }
        .browser-titlebar {
          display: none;
        }
        .browser-topbar {
```

Replace the `0 auto ...` grid line and the `.browser-titlebar { display: none; }` rule so the tab strip stays visible on mobile but the brand name hides. Replace with:

```
          grid-template-rows: 38px auto auto minmax(0, 1fr) 32px;
        }
        .browser-brand-name {
          display: none;
        }
        .browser-tabstrip-brand {
          padding: 0 8px;
        }
        .browser-topbar {
```

(The first track stays `38px` on mobile so the tab strip remains usable; only the brand name hides.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run build && npm run test:browser_parity`
Expected: PASS — `browserPage.test.mjs` and `browserPageLayout.test.mjs` now pass with the new tab-strip markup and `38px` grid.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/browser/app.ts packages/ui/src/browser/indexHtml.ts tests/ui/browserPage.test.mjs tests/ui/browserPageLayout.test.mjs
git commit -m "feat: replace titlebar with tab strip shell"
```

---

## Task 2: Add the tab data model and `activeTab()` / `applyActiveTabState()` helpers

Introduce `state.tabs`, `state.activeTabId`, `state.nextTabId`; keep `state.current/history/historyIndex/status/error/enrichToken` as mirrors. Add the two helper functions. After this task the script boots with a single empty tab and mirrors are in sync — no visible behavior change yet (still single tab, static markup from Task 1).

**Files:**
- Modify: `packages/ui/src/browser/app.ts:147-178` (the `state` object)
- Add new functions after the `state`/`elements` declarations in the script string

**Interfaces:**
- Produces: `activeTab() -> BrowserTab`, `applyActiveTabState() -> void`, `createTab() -> BrowserTab`. `state.tabs`, `state.activeTabId`, `state.nextTabId`.

- [ ] **Step 1: Refactor the `state` object**

Open `packages/ui/src/browser/app.ts`. The script's `state` object is at lines 147-178. Replace this block:

```
var state = {
  history: [],
  historyIndex: -1,
  current: null,
  runtime: null,
  actorId: '',
  drawerOpen: false,
  inspectorOpen: false,
  menuOpen: false,
  ownerPanelOpen: false,
  actorPanelOpen: false,
  settingsTab: 'baseUrls',
  settingsData: null,
  cacheData: null,
  pendingPrivateChat: null,
  pendingConversationHref: '',
  pendingServiceCall: null,
  pendingBookmarkRemoval: '',
  bookmarks: [],
  visits: [],
  status: 'loading',
  error: '',
  lastResolveError: null,
  toastTimer: null,
  pinEntityProfiles: {},
  pinEntityProfilePending: {},
  enrichToken: 0,
  bridgeMessageListenerBound: false,
  currentTheme: 'light',
  themeMediaUnbind: null,
  standaloneWalletPlaceholderActor: null
};
```

with (note the new `tabs`/`activeTabId`/`nextTabId`; `history`/`historyIndex`/`current`/`status`/`error`/`enrichToken` remain as mirrors):

```
var state = {
  tabs: [],
  activeTabId: 0,
  nextTabId: 1,
  // Read-only mirrors of the active tab, kept in sync by applyActiveTabState().
  // state.tabs[] is the source of truth; these exist so the ~40 existing
  // state.current read sites need no change.
  history: [],
  historyIndex: -1,
  current: null,
  runtime: null,
  actorId: '',
  drawerOpen: false,
  inspectorOpen: false,
  menuOpen: false,
  ownerPanelOpen: false,
  actorPanelOpen: false,
  settingsTab: 'baseUrls',
  settingsData: null,
  cacheData: null,
  pendingPrivateChat: null,
  pendingConversationHref: '',
  pendingServiceCall: null,
  pendingBookmarkRemoval: '',
  bookmarks: [],
  visits: [],
  status: 'loading',
  error: '',
  lastResolveError: null,
  toastTimer: null,
  pinEntityProfiles: {},
  pinEntityProfilePending: {},
  enrichToken: 0,
  bridgeMessageListenerBound: false,
  currentTheme: 'light',
  themeMediaUnbind: null,
  standaloneWalletPlaceholderActor: null
};
```

- [ ] **Step 2: Add `activeTab`, `applyActiveTabState`, `createTab` helpers**

Still in `packages/ui/src/browser/app.ts`, find the line `var elements = {};` (around line 180, immediately after the `state` block). Insert these functions **after** `var elements = {};`:

```
var elements = {};

function activeTab() {
  for (var i = 0; i < state.tabs.length; i += 1) {
    if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
  }
  return state.tabs[0] || null;
}

// Copy the active tab's per-tab fields onto the state mirrors so the existing
// state.current / state.history / state.historyIndex / state.status / state.error
// / state.enrichToken read sites reflect the active tab. Call after every
// navigation write and every switchTab.
function applyActiveTabState() {
  var tab = activeTab();
  if (!tab) return;
  state.current = tab.current;
  state.history = tab.history;
  state.historyIndex = tab.historyIndex;
  state.status = tab.status;
  state.error = tab.error;
  state.enrichToken = tab.enrichToken;
}

// Create a fresh tab (empty welcome by default) and return it. Does NOT activate it.
function createTab() {
  var tab = {
    id: state.nextTabId,
    current: null,
    history: [],
    historyIndex: -1,
    status: 'idle',
    error: null,
    enrichToken: 0
  };
  state.nextTabId += 1;
  state.tabs.push(tab);
  return tab;
}
```

- [ ] **Step 3: Verify the script still builds and boots (no behavior test yet)**

Run: `npm run build`
Expected: Build succeeds (TypeScript compiles the template literal).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/app.ts
git commit -m "feat: add tab data model with active-tab mirror helpers"
```

---

## Task 3: Route navigation write sites through the active tab

Rewrite the ~8 write sites (`pushHistory`, `resolveUri`, `renderCurrent`, `renderWelcome`, `renderNoLocalBot`, `goBack`, `goForward`, `reloadCurrent`) so they mutate the active tab first, then sync mirrors via `applyActiveTabState()`. The read sites (`state.current`) stay untouched because mirrors now reflect the active tab. After this task, single-tab navigation still works exactly as before (behaviorally identical), but the data now lives on `tabs[0]`.

**Files:**
- Modify: `packages/ui/src/browser/app.ts` — `pushHistory`, `resolveUri`, `renderCurrent`, `renderWelcome`, `renderNoLocalBot`, `goBack`, `goForward`, `reloadCurrent`, and `setStatus`

**Interfaces:**
- Consumes: `activeTab()`, `applyActiveTabState()` from Task 2.
- Produces: nav functions that operate on the active tab and keep mirrors in sync.

- [ ] **Step 1: Write a failing behavioral test for single-tab nav still working**

Create `tests/ui/browserPageTabs.test.mjs`. Start by copying the `FakeElement` class and `waitFor` helper from `tests/ui/browserPageState.test.mjs` (lines 9-104), and a minimal `createBrowserContext`. For the first test, assert that navigating via the address bar still resolves and sets `state.current` on the active tab. Full starter file:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

class FakeElement {
  constructor(value = '') {
    this._value = String(value);
    this.valueHistory = [];
    this.textContent = '';
    this._innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.attrs = {};
    this.classList = {
      add: (...names) => { for (const name of names) this.attrs[`class:${name}`] = true; },
      remove: (...names) => { for (const name of names) delete this.attrs[`class:${name}`]; },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true; else delete this.attrs[`class:${name}`];
      },
    };
  }
  get value() { return this._value; }
  set value(value) { const next = String(value); this._value = next; this.valueHistory.push(next); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
  submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - startedAt > 1000) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(check, 5);
    };
    check();
  });
}

function createElements() {
  const els = {};
  const selectors = [
    '[data-browser-shell]', '[data-browser-page-title]', '[data-browser-uri-input]',
    '[data-browser-address-form]', '[data-browser-back]', '[data-browser-forward]',
    '[data-browser-reload]', '[data-browser-drawer-toggle]', '[data-browser-resource-chip]',
    '[data-browser-owner-panel]', '[data-browser-using-selector]', '[data-browser-actor-panel]',
    '[data-browser-menu-trigger]', '[data-browser-menu]', '[data-browser-viewport]',
    '[data-browser-status-strip]', '[data-browser-status-state]', '[data-browser-status-renderer]',
    '[data-browser-status-txid]', '[data-browser-drawer]', '[data-browser-inspector]',
    '[data-browser-modal-root]', '[data-browser-toast]', '[data-browser-tabstrip]',
    '[data-browser-tabs-container]', '[data-browser-tab-new]',
  ];
  for (const s of selectors) els[s] = new FakeElement();
  return els;
}

function resolvedBot(uri, name) {
  name = name || 'Alice Bot';
  return {
    ok: true,
    data: {
      uri, normalizedUri: uri.toLowerCase(), resourceType: 'bot', title: name,
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name, verificationState: 'verified' },
      renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', templateId: 'document', data: { profile: { name } } },
      status: { state: 'resolved', verificationState: 'verified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

const defaultActor = {
  id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
  isDefault: true, capabilities: ['private-chat', 'service-call', 'template-settings'],
};

function runtimePayload(overrides) {
  overrides = overrides || {};
  const actor = overrides.defaultActor === undefined ? defaultActor : overrides.defaultActor;
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor], defaultActor: actor,
      defaultUri: actor && actor.globalMetaId ? `metaid://${actor.globalMetaId}` : null,
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No Bot', noActorBody: 'Create a local Bot.', noActorAction: { label: 'Create Bot', href: '/ui/bot' } },
      ...overrides,
    },
  };
}

function createBrowserContext(options) {
  options = options || {};
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse || runtimePayload();
  const resolveResponse = options.resolveResponse || ((uri) => resolvedBot(uri));
  const documentListeners = new Map();
  const context = {
    console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
    },
    document: {
      readyState: 'complete', title: 'Agent Internet Browser',
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      addEventListener: (eventName, handler) => {
        if (!documentListeners.has(eventName)) documentListeners.set(eventName, []);
        documentListeners.get(eventName).push(handler);
      },
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimeResponse };
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        const payload = typeof resolveResponse === 'function' ? resolveResponse(uri) : resolveResponse;
        return { ok: true, json: async () => payload };
      }
      if (String(url).startsWith('/api/browser/settings')) {
        return { ok: true, json: async () => ({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } }) };
      }
      if (String(url).startsWith('/api/browser/cache')) {
        return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '-', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  context.globalThis = context;
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, documentListeners };
}

test('single tab navigation resolves and sets state.current on the active tab', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'runtime and resolve');
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs`
Expected: FAIL — `initialize()` has not yet been updated to seed `state.tabs`, so `activeTab()` returns null and navigation throws or the boot errors.

- [ ] **Step 3: Route `pushHistory` through the active tab**

In `packages/ui/src/browser/app.ts`, find `pushHistory` (lines ~1990-1996). Replace:

```
function pushHistory(uri) {
  if (!uri) return;
  if (state.history[state.historyIndex] === uri) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(uri);
  state.historyIndex = state.history.length - 1;
}
```

with:

```
function pushHistory(uri) {
  if (!uri) return;
  var tab = activeTab();
  if (!tab) return;
  if (tab.history[tab.historyIndex] === uri) return;
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(uri);
  tab.historyIndex = tab.history.length - 1;
  applyActiveTabState();
}
```

- [ ] **Step 4: Route `resolveUri` through the active tab**

In `packages/ui/src/browser/app.ts`, find `resolveUri` (lines ~4837-4883). It has these write sites: `state.current = result;` (success) and `state.current = null;` + `setStatus(...)` (error), plus the `state.history[state.historyIndex] = resolvedUri;` line. Replace the whole function body's mutation points. Concretely, change:

```
    if (shouldRecord && state.historyIndex >= 0) state.history[state.historyIndex] = resolvedUri;
    state.current = result;
    state.lastResolveError = null;
    recordVisit(result);
    setStatus('resolved', '');
    renderCurrent();
```

to:

```
    var resolvedTab = activeTab();
    if (resolvedTab) {
      if (shouldRecord && resolvedTab.historyIndex >= 0) resolvedTab.history[resolvedTab.historyIndex] = resolvedUri;
      resolvedTab.current = result;
      resolvedTab.status = 'resolved';
      resolvedTab.error = null;
      applyActiveTabState();
    } else {
      state.current = result;
    }
    state.lastResolveError = null;
    recordVisit(result);
    setStatus('resolved', '');
    renderCurrent();
```

And in the catch block, change:

```
    setStatus('error', error && error.message ? error.message : 'Resolve failed.');
    state.current = null;
    syncBrowserPageTitle('Resolve failed');
```

to:

```
    var errorTab = activeTab();
    if (errorTab) {
      errorTab.current = null;
      errorTab.status = 'error';
      errorTab.error = error && error.message ? error.message : 'Resolve failed.';
      applyActiveTabState();
    } else {
      state.current = null;
    }
    setStatus('error', error && error.message ? error.message : 'Resolve failed.');
    syncBrowserPageTitle('Resolve failed');
```

(Note: `setStatus` itself is updated in Step 8 to also write the active tab. The `recordVisit(result)` and `state.lastResolveError` lines stay as-is — visits are global.)

- [ ] **Step 5: Route `renderWelcome` and `renderNoLocalBot` through the active tab**

In `renderWelcome` (line ~1937), it sets `state.current = null;`. Change that line to clear the active tab:

```
function renderWelcome() {
  setStatus('ready', '');
  var welcomeTab = activeTab();
  if (welcomeTab) { welcomeTab.current = null; welcomeTab.status = 'ready'; welcomeTab.error = null; applyActiveTabState(); }
  else { state.current = null; }
  syncBrowserPageTitle(browserText('welcome.windowTitle', 'Welcome'));
```

(Replace the existing `state.current = null;` line in `renderWelcome` with the 3-line block above; keep the rest of the function identical.)

Apply the same change in `renderNoLocalBot` (line ~1966), replacing its `state.current = null;`:

```
function renderNoLocalBot() {
  var title = runtimeLabel('noActorTitle', 'No Browser actor');
  var body = runtimeLabel('noActorBody', 'Connect an actor before using Browser actions.');
  var action = runtimeLabels().noActorAction;
  var actionHref = action && typeof action === 'object' ? safeUrl(action.href) : '';
  var actionLabel = browserText('runtime.noActorAction.label', action && typeof action === 'object' ? textValue(action.label) : '');
  setStatus('ready', '');
  var noActorTab = activeTab();
  if (noActorTab) { noActorTab.current = null; noActorTab.status = 'ready'; noActorTab.error = null; applyActiveTabState(); }
  else { state.current = null; }
  syncBrowserPageTitle(title);
```

- [ ] **Step 6: Route `goBack` / `goForward` / `reloadCurrent` through the active tab**

These three read `state.history`/`state.historyIndex`. Since mirrors are kept in sync, they read correctly, but they must mutate the active tab, not the mirror. Replace `goBack`:

```
function goBack() {
  var tab = activeTab();
  if (!tab || tab.historyIndex <= 0) return null;
  tab.historyIndex -= 1;
  applyActiveTabState();
  return resolveUri(tab.history[tab.historyIndex], { record: false });
}
```

Replace `goForward`:

```
function goForward() {
  var tab = activeTab();
  if (!tab || tab.historyIndex >= tab.history.length - 1) return null;
  tab.historyIndex += 1;
  applyActiveTabState();
  return resolveUri(tab.history[tab.historyIndex], { record: false });
}
```

Replace `reloadCurrent`:

```
function reloadCurrent() {
  var tab = activeTab();
  var uri = (tab && tab.history[tab.historyIndex]) || (elements.input && elements.input.value) || '';
  return resolveUri(uri, { record: false });
}
```

- [ ] **Step 7: Route `setStatus` to mirror the active tab**

`setStatus` (line ~948) writes `state.status`/`state.error`. Make it also update the active tab so the mirror source stays consistent. Replace:

```
function setStatus(nextStatus, message) {
  state.status = nextStatus;
  state.error = message || '';
  if (elements.statusState) elements.statusState.textContent = nextStatus;
}
```

with:

```
function setStatus(nextStatus, message) {
  state.status = nextStatus;
  state.error = message || '';
  var tab = activeTab();
  if (tab) { tab.status = nextStatus; tab.error = message || ''; }
  if (elements.statusState) elements.statusState.textContent = nextStatus;
}
```

- [ ] **Step 8: Seed the initial tab in `initialize()` boot**

In `initialize()` (line ~4934), at the very start after `bindElements();` (the first line of `initialize`), add the initial tab creation so `activeTab()` is never null during boot. Find:

```
async function initialize() {
  bindElements();
```

Replace with:

```
async function initialize() {
  bindElements();
  if (!state.tabs.length) {
    createTab();
    state.activeTabId = state.tabs[0].id;
    applyActiveTabState();
  }
```

Also update the welcome-seed block near the end of `initialize` (lines ~5222-5226) that sets `state.history` directly. Find:

```
  if (state.historyIndex < 0) {
    state.history = [''];
    state.historyIndex = 0;
  }
  renderWelcome();
```

Replace with:

```
  var bootTab = activeTab();
  if (bootTab && bootTab.historyIndex < 0) {
    bootTab.history = [''];
    bootTab.historyIndex = 0;
    applyActiveTabState();
  }
  renderWelcome();
```

- [ ] **Step 9: Run the new test and the full browser parity suite**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs && npm run test:browser_parity`
Expected: PASS — the single-tab nav test passes, and all existing browser parity tests still pass (mirrors make behavior identical).

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageTabs.test.mjs
git commit -m "feat: route navigation writes through active tab with mirrors"
```

---

## Task 4: Implement `renderTabs()` and wire tab-strip rendering + title sync

Add `renderTabs()` (rebuilds the tab container DOM from `state.tabs`), wire it into the render pipeline (title sync + nav complete), and add a `syncActiveTabTitle()` that updates `document.title` and the tab labels. Bind the new tab-strip elements. After this task the single tab's label updates as you navigate, and the `+` button is bound (but `openTab` is stubbed until Task 5).

**Files:**
- Modify: `packages/ui/src/browser/app.ts` — `bindElements`, new `renderTabs`/`syncActiveTabTitle`, refactor `syncBrowserPageTitle`, `initialize` (bind `+`, tab container)

**Interfaces:**
- Consumes: `activeTab()` from Task 2.
- Produces: `renderTabs() -> void`, `syncActiveTabTitle() -> void`, bound `elements.tabstrip`/`elements.tabsContainer`/`elements.tabNew`.

- [ ] **Step 1: Write a failing test that the tab label reflects the navigated title**

Append to `tests/ui/browserPageTabs.test.mjs`:

```js
test('tab title updates to the resolved page title after navigation', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'resolve');
  // The tab container innerHTML should mention the resolved bot name.
  assert.match(elements['[data-browser-tabs-container]'].innerHTML, /Alice Bot/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs`
Expected: FAIL — `renderTabs` doesn't exist yet; the tab container markup is static from Task 1 and never updates.

- [ ] **Step 3: Add `renderTabs()` and `syncActiveTabTitle()`**

In `packages/ui/src/browser/app.ts`, add these functions immediately after the `currentDisplayTitle` function (around line ~199):

```
function syncActiveTabTitle() {
  var tab = activeTab();
  var title = tab && tab.current ? currentDisplayTitle(tab.current, '') : '';
  var displayTitle = title || BROWSER_PAGE_DEFAULT_TITLE;
  if (typeof document === 'object' && document) {
    document.title = title ? (title + ' - ' + BROWSER_WINDOW_TITLE_SUFFIX) : BROWSER_PAGE_DEFAULT_TITLE;
  }
  renderTabs();
}

function renderTabs() {
  if (!elements.tabsContainer) return;
  var html = state.tabs.map(function (tab) {
    var isActive = tab.id === state.activeTabId;
    var title = tab.current ? currentDisplayTitle(tab.current, '') : '';
    var label = title || browserText('tab.newTab', '新标签页');
    var activeClass = isActive ? ' is-active' : '';
    return '<div class="browser-tab' + activeClass + '" data-tab-id="' + tab.id + '" role="tab">' +
      '<span class="browser-tab-title" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>' +
      '<button type="button" class="browser-tab-close" data-tab-close="' + tab.id + '" aria-label="Close tab" tabindex="-1">×</button>' +
      '</div>';
  }).join('');
  elements.tabsContainer.innerHTML = html;
}
```

- [ ] **Step 4: Refactor `syncBrowserPageTitle` to delegate to `syncActiveTabTitle`**

`syncBrowserPageTitle` (lines ~201-213) currently sets `elements.pageTitle` (which no longer exists — it moved into the tab). Replace the whole function with a thin wrapper that updates `document.title` + calls `renderTabs`:

```
function syncBrowserPageTitle(pageTitle) {
  syncActiveTabTitle();
}
```

(The `pageTitle` argument is now derived from `activeTab().current` inside `syncActiveTabTitle`, so the argument is ignored. This keeps all existing call sites of `syncBrowserPageTitle(...)` working without changes.)

- [ ] **Step 5: Bind the new tab-strip elements in `bindElements`**

In `bindElements` (lines ~893-919), add the three new elements. Replace the closing of the object:

```
    bookmarkStar: document.querySelector('[data-browser-bookmark-star]'),
    toast: document.querySelector('[data-browser-toast]')
  };
```

with:

```
    bookmarkStar: document.querySelector('[data-browser-bookmark-star]'),
    toast: document.querySelector('[data-browser-toast]'),
    tabstrip: document.querySelector('[data-browser-tabstrip]'),
    tabsContainer: document.querySelector('[data-browser-tabs-container]'),
    tabNew: document.querySelector('[data-browser-tab-new]')
  };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs`
Expected: PASS — the tab container now re-renders with "Alice Bot".

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageTabs.test.mjs
git commit -m "feat: render tab strip with per-tab titles"
```

---

## Task 5: Implement `openTab`, `closeTab`, `switchTab`, and the host API

Add the core tab mutation functions, the `+` button handler, tab click/switch, tab close, and the three new-tab source detectors (host programmatic, `target=_blank`, Ctrl/Cmd+click). Expose `globalThis.AgentBrowserTabs` and bridge messages. After this task, full multi-tab behavior works.

**Files:**
- Modify: `packages/ui/src/browser/app.ts` — new functions, `initialize` (bind `+`, tabs-container click handler, viewport link new-tab detection), `globalThis` exports, bridge message handler

**Interfaces:**
- Consumes: `createTab`, `activeTab`, `applyActiveTabState`, `renderTabs`, `navigateTo`, `renderWelcome`, `renderCurrent` from earlier tasks.
- Produces: `openTab(uri?) -> number`, `closeTab(id) -> void`, `switchTab(id) -> void`, `getTabs() -> TabInfo[]`, `getActiveTab() -> TabInfo|null`, `globalThis.AgentBrowserTabs`.

- [ ] **Step 1: Write failing tests for the tab operations**

Append to `tests/ui/browserPageTabs.test.mjs`:

```js
test('openTab via AgentBrowserTabs creates a new active tab and navigates it', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const beforeCount = context.AgentBrowserTabs.getTabs().length;
  const newId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'new tab resolve');
  const tabs = context.AgentBrowserTabs.getTabs();
  assert.equal(tabs.length, beforeCount + 1);
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, newId);
  assert.equal(fetchCalls[2], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1bob&actorId=worker');
});

test('openTab with no uri creates an empty welcome tab without fetching', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const fetchesBefore = fetchCalls.length;
  const newId = context.AgentBrowserTabs.openTab();
  const tab = context.AgentBrowserTabs.getActiveTab();
  assert.equal(tab.id, newId);
  assert.equal(tab.uri, null);
  assert.equal(fetchCalls.length, fetchesBefore, 'no fetch for empty tab');
});

test('closeTab on the last tab auto-creates a fresh empty tab', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.closeTab(activeId);
  const tabs = context.AgentBrowserTabs.getTabs();
  assert.equal(tabs.length, 1);
  assert.notEqual(tabs[0].id, activeId);
  assert.equal(tabs[0].uri, null);
});

test('switchTab restores cached content without fetching', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const firstId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'second tab resolve');
  // switch back to the first tab — no new fetch
  const fetchesBefore = fetchCalls.length;
  context.AgentBrowserTabs.switchTab(firstId);
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, firstId);
  assert.equal(fetchCalls.length, fetchesBefore, 'switching uses cache, no fetch');
});

test('Ctrl+click on a viewport map-link opens a new tab', async () => {
  const { elements, context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const beforeCount = context.AgentBrowserTabs.getTabs().length;
  // Build a fake map-link target inside the viewport click handler.
  const linkTarget = { parentElement: null, getAttribute(n){ return n==='href'?'metaid://idq1bob':(n==='target'?'_blank':null);}, hasAttribute(n){return n==='data-browser-map-link';} };
  const clickEvent = { target: linkTarget, preventDefault(){}, ctrlKey: true, metaKey: false };
  elements['[data-browser-viewport]'].listeners.get('click')(clickEvent);
  await waitFor(() => fetchCalls.length === 3, 'ctrl-click new tab resolve');
  assert.equal(context.AgentBrowserTabs.getTabs().length, beforeCount + 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs`
Expected: FAIL — `AgentBrowserTabs` is undefined; tab functions don't exist.

- [ ] **Step 3: Implement `openTab`, `closeTab`, `switchTab`, `getTabs`, `getActiveTab`**

In `packages/ui/src/browser/app.ts`, add these functions after the `createTab` function (added in Task 2):

```
function tabToInfo(tab) {
  var isActive = tab.id === state.activeTabId;
  var uri = tab.current ? (textValue(tab.current.uri) || textValue(tab.current.normalizedUri) || null) : null;
  var title = tab.current ? currentDisplayTitle(tab.current, '') || null : null;
  return { id: tab.id, uri: uri, title: title, isActive: isActive };
}

function getTabs() {
  return state.tabs.map(tabToInfo);
}

function getActiveTab() {
  var tab = activeTab();
  return tab ? tabToInfo(tab) : null;
}

// Create + activate a new tab. If uri is provided, navigate the new tab to it;
// otherwise show the welcome page. Returns the new tab id.
function openTab(uri) {
  var tab = createTab();
  state.activeTabId = tab.id;
  applyActiveTabState();
  renderTabs();
  if (uri) {
    navigateTo(uri);
  } else {
    renderWelcome();
    syncToolbarForActiveTab();
  }
  return tab.id;
}

// Close a tab by id. If it was the last tab, create a fresh empty one. If it
// was active, activate a neighbor (prefer right, else left) and re-render its
// content from cache (no fetch).
function closeTab(id) {
  var idx = -1;
  for (var i = 0; i < state.tabs.length; i += 1) {
    if (state.tabs[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return;
  var wasActive = state.tabs[idx].id === state.activeTabId;
  state.tabs.splice(idx, 1);
  if (!state.tabs.length) {
    var fresh = createTab();
    state.activeTabId = fresh.id;
    applyActiveTabState();
    renderWelcome();
    syncToolbarForActiveTab();
    renderTabs();
    return;
  }
  if (wasActive) {
    var neighbor = state.tabs[idx] || state.tabs[idx - 1];
    state.activeTabId = neighbor.id;
    applyActiveTabState();
    if (state.current) renderCurrent();
    else renderWelcome();
    syncToolbarForActiveTab();
  }
  renderTabs();
}

// Activate a tab by id. Render its cached content (no fetch) and sync toolbar.
function switchTab(id) {
  var tab = null;
  for (var i = 0; i < state.tabs.length; i += 1) {
    if (state.tabs[i].id === id) { tab = state.tabs[i]; break; }
  }
  if (!tab) return;
  state.activeTabId = tab.id;
  applyActiveTabState();
  renderTabs();
  if (state.current) renderCurrent();
  else if (state.status === 'loading') showLoadingState();
  else renderWelcome();
  syncToolbarForActiveTab();
}

// After a tab switch, sync the shared toolbar (address bar, back/forward, title,
// bookmark star) to reflect the active tab.
function syncToolbarForActiveTab() {
  var tab = activeTab();
  var uri = '';
  if (tab && tab.historyIndex >= 0) uri = tab.history[tab.historyIndex] || '';
  if (elements.input) elements.input.value = uri;
  if (elements.back) elements.back.disabled = !tab || tab.historyIndex <= 0;
  if (elements.forward) elements.forward.disabled = !tab || tab.historyIndex >= (tab ? tab.history.length - 1 : -1);
  renderBookmarkStar();
  syncActiveTabTitle();
}
```

- [ ] **Step 4: Add `target=_blank` and Ctrl/Cmd+click detection to the viewport handler**

In `initialize()`, find the viewport click handler's map-link branch (lines ~4964-4970):

```
      var mapLink = closestWithAttribute(event && event.target, 'data-browser-map-link');
      var mapHref = mapLink && mapLink.getAttribute ? mapLink.getAttribute('href') : '';
      if (mapHref) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        navigateTo(mapHref);
        return;
      }
```

Replace with new-tab detection:

```
      var mapLink = closestWithAttribute(event && event.target, 'data-browser-map-link');
      var mapHref = mapLink && mapLink.getAttribute ? mapLink.getAttribute('href') : '';
      if (mapHref) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        var openInNewTab = (event && (event.ctrlKey || event.metaKey)) ||
          (mapLink && typeof mapLink.getAttribute === 'function' && mapLink.getAttribute('target') === '_blank');
        if (openInNewTab) openTab(mapHref);
        else navigateTo(mapHref);
        return;
      }
```

- [ ] **Step 5: Bind the `+` button and tab-strip click handlers in `initialize()`**

In `initialize()`, after the address-form binding (around line ~5159, after the `elements.form.addEventListener('submit', ...)` block), add the tab-strip bindings. Insert before `if (elements.back) elements.back.addEventListener(...)`:

```
  if (elements.tabNew) {
    elements.tabNew.addEventListener('click', function () { openTab(); });
  }
  if (elements.tabsContainer) {
    elements.tabsContainer.addEventListener('click', function (event) {
      var closeTarget = closestWithAttribute(event && event.target, 'data-tab-close');
      if (closeTarget) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        var closeId = Number(closeTarget.getAttribute('data-tab-close'));
        closeTab(closeId);
        return;
      }
      var tabEl = closestWithAttribute(event && event.target, 'data-tab-id');
      if (tabEl) {
        switchTab(Number(tabEl.getAttribute('data-tab-id')));
      }
    });
  }
```

- [ ] **Step 6: Expose `globalThis.AgentBrowserTabs` and add bridge messages**

In `packages/ui/src/browser/app.ts`, at the bottom of the script string near the other `globalThis` exports (before `if (document.readyState === 'loading')`), add:

```
globalThis.AgentBrowserTabs = {
  openTab: openTab,
  closeTab: closeTab,
  switchTab: switchTab,
  getTabs: getTabs,
  getActiveTab: getActiveTab
};
```

Then add bridge message support in `handleBrowserMessage` (line ~606). Find:

```
  // Host -> Browser theme messages are accepted only from window.parent.
  if (data && isBrowserThemeMessage(data)) {
    if (window && window.parent && event.source === window.parent) {
      applyBrowserTheme(data.theme);
    }
    return;
  }
  handleBrowserBridgeMessage(event);
```

Replace with (adds tab messages from `window.parent`):

```
  // Host -> Browser theme messages are accepted only from window.parent.
  if (data && isBrowserThemeMessage(data)) {
    if (window && window.parent && event.source === window.parent) {
      applyBrowserTheme(data.theme);
    }
    return;
  }
  // Host -> Browser tab messages are accepted only from window.parent.
  if (window && window.parent && event.source === window.parent && data && typeof data.type === 'string') {
    if (data.type === 'agent-browser:open-tab') {
      openTab(textValue(data.uri) || undefined);
      return;
    }
    if (data.type === 'agent-browser:close-tab') {
      closeTab(Number(data.id));
      return;
    }
    if (data.type === 'agent-browser:switch-tab') {
      switchTab(Number(data.id));
      return;
    }
  }
  handleBrowserBridgeMessage(event);
```

- [ ] **Step 7: Run the tab tests to verify they pass**

Run: `npm run build && node --test tests/ui/browserPageTabs.test.mjs`
Expected: PASS — all five new tests pass.

- [ ] **Step 8: Run the full browser parity suite to check for regressions**

Run: `npm run build && npm run test:browser_parity`
Expected: PASS — all browser tests (existing + new tab tests) pass.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageTabs.test.mjs
git commit -m "feat: add multi-tab open/close/switch with host bridge API"
```

---

## Task 6: Final verification and docs

Run the complete test suite, verify the invariants from the spec, and confirm no legacy/host-contract files were touched.

**Files:**
- No source changes (verification only). Possibly a docs note.

- [ ] **Step 1: Run the full verification suite**

Run: `npm test`
Expected: PASS — all tests across all packages pass.

- [ ] **Step 2: Verify no off-limits files were modified**

Run: `git diff --name-only main...HEAD` (or `git status` if on a branch) and confirm the changed files are only:
- `packages/ui/src/browser/app.ts`
- `packages/ui/src/browser/indexHtml.ts`
- `tests/ui/browserPage.test.mjs`
- `tests/ui/browserPageLayout.test.mjs`
- `tests/ui/browserPageTabs.test.mjs`
- spec/plan docs

None of the legacy parity stack (`browserShell.ts`, `browserStyles.ts`, `browserClientScript.ts`, `pageDefinition.ts`, `browserTypes.ts`, `menuModel.ts`) or `packages/host-contract` should appear.

- [ ] **Step 3: Verify spec invariants via ad-hoc VM check**

Run a quick node script (or add a temporary test) confirming: `getTabs().length === 1` after boot; closing the active last tab leaves exactly 1 tab; switching tabs performs no fetch. (These are covered by Task 5 tests — this is a redundant confirmation.)

- [ ] **Step 4: Commit (only if any docs were added)**

If a docs note was added:
```bash
git add docs/
git commit -m "docs: note tab feature in browser UI"
```

Otherwise, skip — nothing to commit.

---

## Self-Review Notes

**Spec coverage check:**
- Data model (mirror approach, Task 2) ✓
- Navigation write routing (Task 3) ✓
- UI/DOM/CSS tab strip (Task 1) ✓
- `renderTabs` + title sync (Task 4) ✓
- `openTab`/`closeTab`/`switchTab` + invariants (Task 5) ✓
- Three new-tab sources: host bridge + `target=_blank` + Ctrl/Cmd (Task 5 Step 4 & 6) ✓
- `globalThis.AgentBrowserTabs` (Task 5 Step 6) ✓
- bridge messages (Task 5 Step 6) ✓
- Title sync to tab labels + document.title (Task 4) ✓
- Session-level persistence (no persistence code added — correct) ✓
- Tests: structural (Task 1), behavioral (Tasks 3/5) ✓

**Placeholder scan:** No TBD/TODO/"add error handling" — every code step shows complete code.

**Type consistency:** `openTab(uri?) -> number`, `closeTab(id: number)`, `switchTab(id: number)`, `getTabs() -> TabInfo[]`, `getActiveTab() -> TabInfo | null`, `activeTab() -> BrowserTab`, `applyActiveTabState() -> void`, `createTab() -> BrowserTab`, `renderTabs() -> void`, `syncActiveTabTitle() -> void`, `syncToolbarForActiveTab() -> void`. Names match across tasks.

**Known simplification:** Playwright layout verification (spec Layer 3) is not added as a separate task — the existing Playwright checks in `browserPageLayout.test.mjs` already exercise the shell geometry, and Task 1's `38px` grid assertion covers the row-1 change. A dedicated "tab strip rightmost +`+` button + no logo overlap" Playwright check can be added later if desired; it is optional polish, not core behavior. This is noted here for transparency.
