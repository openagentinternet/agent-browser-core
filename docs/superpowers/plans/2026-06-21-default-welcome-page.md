# Default Welcome Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "Fixture Bot" default landing page with a Chrome-style welcome page that renders when the Browser opens with no URI.

**Architecture:** Remove `defaultUri` from both standalone adapters so the client bootstrap's empty-URI fallback renders a new `renderWelcome()` function directly into the viewport. The welcome page shows a centered hero (logo + decorative prompt) and a single shortcut grid combining the user's bookmarks/recent visits with two official recommendation entries pinned at the tail. The fixture machinery (`FIXTURE_BOT_HOMEPAGE`, `fixtureFetch`, `isFixtureMetaIdUri`) becomes dead code and is removed in the same commit.

**Tech Stack:** TypeScript workspace monorepo; client-side inline script in `packages/ui/src/browser/app.ts`; standalone host adapter in `packages/host-standalone/src/adapter.ts` and `memoryHost.ts`; tests via `node --test` with a `vm.runInNewContext` DOM harness in `tests/ui/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-06-21-default-welcome-page-design.md`

---

## File Structure

**Modify:**
- `packages/ui/src/browser/app.ts` — add `OFFICIAL_RECOMMENDATIONS` constant, add `renderWelcome()` function, change `initialize()` fallback, add welcome CSS via `indexHtml.ts` companion edits, add i18n strings. ~90% of the work.
- `packages/ui/src/browser/indexHtml.ts` — add welcome-page CSS (`.browser-welcome`, `.browser-welcome-hero`, `.browser-welcome-prompt`, `.browser-welcome-grid`, `.browser-welcome-tile`, `.browser-welcome-tile.is-official`) to the embedded `<style>`.
- `packages/host-standalone/src/adapter.ts` — remove `STANDALONE_DEFAULT_URI`, `STANDALONE_FIXTURE_GLOBAL_META_ID`, `FIXTURE_BOT_HOMEPAGE`, `isFixtureMetaIdUri`, `fixtureFetch`; drop `defaultUri` from `getRuntime()`; simplify `resolveResource()`.
- `packages/host-standalone/src/memoryHost.ts` — remove `fixtureHomepage()`, drop `defaultUri` from input/runtime, simplify `resolveResource()` metaid branch.
- `docs/acceptance/browser-parity-standalone.md:10` — update "Default URI" line.

**Create:**
- `tests/ui/browserPageWelcome.test.mjs` — new test file for the welcome page (trigger, content, shortcut grid, official recommendations, empty state, re-render on empty submit).

**Update tests (fixture/defaultUri assertions):**
- `tests/ui/browserPage.test.mjs:70` — assertion on `runtime.defaultUri` script branch.
- `tests/host-standalone/standaloneServer.test.mjs:53,78,82` — `defaultUri` and fixture resolve assertions.
- `tests/browser/browserStandaloneServer.test.mjs:341` — `defaultUri` assertion.
- `tests/browser/browserStandaloneServer.test.mjs:425-442` — DELETE the entire "falls back to the fixture bot homepage when network resolution fails" test; its whole premise is the removed fixture-fallback behavior.

**Do NOT touch:** `tests/browser/botHomepageResolver.test.mjs`, `tests/core/botHomepageEnvelope.test.mjs`, `tests/fixtures/*`, `tests/renderers/*`, `tests/ui/renderers.test.mjs`, `tests/ui/browserInteractions.test.mjs`, `tests/ui/browserPageRenderers.test.mjs`, `tests/ui/browserPageInspector.test.mjs`. These use `idq1fixturebot`/`Fixture Bot` as generic test input data (fixture JSON files, resolver unit tests) — they are NOT testing the default-URI behavior and must keep working. The fixture test data files remain valid inputs to the resolver pipeline; only the *default-URI wiring* is removed.

---

## Task 1: Add welcome page CSS to indexHtml.ts

The welcome page reuses existing CSS variables (`--browser-*`) and the light theme. This task adds the styling so Task 2's HTML has classes to use. Putting CSS first lets us verify it compiles before wiring behavior.

**Files:**
- Modify: `packages/ui/src/browser/indexHtml.ts` (the embedded `<style>` inside `BROWSER_INDEX_HTML`)

- [ ] **Step 1: Locate the insertion point**

Open `packages/ui/src/browser/indexHtml.ts`. Find the `.browser-empty-state h2,` rule block (the empty-state styles). The welcome CSS will be added immediately after the `.browser-empty-state p` rule (the last empty-state rule), before whatever rule follows it.

Run to confirm the anchor exists:
```bash
grep -c 'browser-empty-state p' packages/ui/src/browser/indexHtml.ts
```
Expected: output `1` (or more; the anchor string appears once as a CSS selector).

- [ ] **Step 2: Add the welcome CSS**

The CSS string lives inside the `BROWSER_INDEX_HTML` template literal, escaped as `\n` newlines. Insert this block right after the `.browser-empty-state p { ... }` rule. Use the Edit tool with the `.browser-empty-state p {\n        color: var(--browser-muted);\n      }` block as the anchor, appending the welcome CSS after it.

The welcome CSS to add (note: in the file these are `\n`-escaped within the single big string; match the surrounding 2-space-indent + `\n` style):

```css
.browser-welcome {
  min-height: 100%;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 18px;
  padding: 32px 24px;
  text-align: center;
  color: var(--browser-text);
}
.browser-welcome-hero { display: grid; justify-items: center; gap: 8px; }
.browser-welcome-title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.browser-welcome-subtitle { margin: 0; color: var(--browser-muted); font-size: 13px; }
.browser-welcome-prompt {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 4px; padding: 9px 14px;
  min-width: 260px; max-width: 360px;
  border: 1px solid var(--browser-border);
  border-radius: 999px;
  background: var(--browser-surface);
  color: var(--browser-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; text-align: left; cursor: text;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.browser-welcome-prompt:hover,
.browser-welcome-prompt:focus-visible {
  border-color: var(--browser-accent);
  box-shadow: 0 0 0 3px var(--browser-accent-soft);
  outline: none;
}
.browser-welcome-prompt .browser-icon { width: 15px; height: 15px; opacity: .7; }
.browser-welcome-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 480px;
}
.browser-welcome-tile {
  display: grid; justify-items: center; gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--browser-border);
  border-radius: 10px;
  background: var(--browser-surface);
  color: var(--browser-text);
  text-decoration: none;
  cursor: pointer;
  transition: border-color .14s ease, background-color .14s ease, transform .14s ease;
}
.browser-welcome-tile:hover {
  border-color: #a9b7cf;
  background: #f8fbff;
  transform: translateY(-1px);
}
.browser-welcome-tile-icon {
  width: 34px; height: 34px;
  display: grid; place-content: center;
  border-radius: 50%;
  background: var(--browser-surface2);
  color: var(--browser-muted);
}
.browser-welcome-tile-icon .browser-icon { width: 18px; height: 18px; }
.browser-welcome-tile.is-official { border-color: var(--browser-accent-soft); }
.browser-welcome-tile.is-official .browser-welcome-tile-icon {
  background: var(--browser-accent-soft);
  color: var(--browser-accent);
}
.browser-welcome-tile-label {
  font-size: 11px; font-weight: 600; line-height: 1.25;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.browser-welcome-tile-uri {
  font-size: 10px; color: var(--browser-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.browser-welcome-heading {
  justify-self: start; margin: 0 0 4px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .05em; color: var(--browser-dim);
  grid-column: 1 / -1;
}
```

- [ ] **Step 3: Build and verify CSS compiles**

Run:
```bash
npm run build:esm 2>&1 | tail -5
```
Expected: build completes with no errors (exit 0). The CSS is just a string, so it won't fail TS, but this confirms no accidental template-literal breakage.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/indexHtml.ts
git commit -m "feat: add welcome page CSS to browser shell"
```

---

## Task 2: Add OFFICIAL_RECOMMENDATIONS constant and i18n strings

**Files:**
- Modify: `packages/ui/src/browser/app.ts` — inside `buildBrowserPageScript()` string.

- [ ] **Step 1: Add the official recommendations constant**

In `packages/ui/src/browser/app.ts`, inside `buildBrowserPageScript()`, locate the line `var browserEndpoints = {` (around line 120). The constant must be inside the script string. Insert immediately **before** `var browserEndpoints = {`:

```js
var OFFICIAL_RECOMMENDATIONS = [
  { uri: 'metaapp://agent-browser', title: 'Agent Browser', kind: 'official' },
  { uri: 'metaid://docsbot', title: 'Docs Bot', kind: 'official' }
];

```

These URIs are placeholders pending real pinID / globalMetaId values. Replacement is a single edit to this constant.

- [ ] **Step 2: Add i18n strings**

In the same file, find the `browserLaunchCopy` object's `'zh-CN'` block (around line 128-157). Add these keys before the closing `}` of the `'zh-CN'` block (after `'bookmark.removeLabel': '移除'`):

```js
,
    'welcome.title': 'Agent Internet',
    'welcome.subtitle': '在地址栏输入 metaid:// URI 即可访问',
    'welcome.promptPlaceholder': 'metaid://',
    'welcome.gridHeading': '书签 / 最近访问'
```

Note: the existing last entry `'bookmark.removeLabel': '移除'` has no trailing comma; the new block replaces it with a comma-joined list. Use the Edit tool: old string `'bookmark.removeLabel': '移除'\n  }\n};` → new string with the comma + new keys appended.

- [ ] **Step 3: Build and verify**

```bash
npm run build:esm 2>&1 | tail -5
```
Expected: build succeeds (exit 0).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/app.ts
git commit -m "feat: add official recommendations constant and welcome i18n strings"
```

---

## Task 3: Add renderWelcome() function (TDD)

This is the core function. Write the test first, watch it fail, then implement.

**Files:**
- Create: `tests/ui/browserPageWelcome.test.mjs`
- Modify: `packages/ui/src/browser/app.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/ui/browserPageWelcome.test.mjs`. It reuses the FakeElement/vm harness pattern from `tests/ui/browserPageBookmarks.test.mjs` (copy the `FakeElement`, `waitFor`, `createElements`, `createMemoryStorage`, `resolvedBot`, `defaultActor`, `runtimePayload`, `settingsData` helpers verbatim — they are the standard test harness; see `tests/ui/browserPageBookmarks.test.mjs:9-225`).

Key difference from the bookmarks test: the `runtimePayload` must return `defaultUri: null` and a valid actor (so it's the "has actor, no URI" path, NOT the no-actor path). Also `createBrowserContext` must support `seedBookmarks`.

Full file content:

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
      contains: (name) => Boolean(this.attrs[`class:${name}`]),
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
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
  return {
    '[data-browser-shell]': new FakeElement(),
    '[data-browser-uri-input]': new FakeElement(),
    '[data-browser-address-form]': new FakeElement(),
    '[data-browser-back]': new FakeElement(),
    '[data-browser-forward]': new FakeElement(),
    '[data-browser-reload]': new FakeElement(),
    '[data-browser-drawer-toggle]': new FakeElement(),
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-menu-trigger]': new FakeElement(),
    '[data-browser-menu]': new FakeElement(),
    '[data-browser-owner-toolbar]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-strip]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-proof]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-bookmark-star]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
  };
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

const defaultActor = {
  id: 'worker',
  label: 'Worker Bot',
  kind: 'oac-bot',
  globalMetaId: 'idq1worker',
  isDefault: true,
  capabilities: ['private-chat', 'service-call', 'template-settings'],
};

// Runtime with an actor but NO defaultUri — triggers the welcome page.
function welcomeRuntime(overrides = {}) {
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor],
      defaultActor,
      defaultUri: null,
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: {
        actorChip: 'Using',
        noActorTitle: 'No Bot',
        noActorBody: 'Create a local Bot before using Browser actions.',
      },
      ...overrides,
    },
  };
}

function settingsData() {
  return {
    browser: { botHomepageTemplateId: 'document', localMode: true },
    effectiveBrowser: { botHomepageTemplateId: 'document', localMode: true },
    defaults: { botHomepageTemplateId: 'document', localMode: true },
  };
}

function createBrowserContext(options = {}) {
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse ?? welcomeRuntime();
  const storage = options.storage ?? createMemoryStorage();
  if (options.seedBookmarks) {
    storage.setItem('agent-browser:bookmarks', JSON.stringify(options.seedBookmarks));
  }
  const context = {
    console, URL, URLSearchParams, JSON, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
      localStorage: storage,
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => elements[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimeResponse };
      if (String(url).startsWith('/api/browser/settings')) return { ok: true, json: async () => ({ ok: true, data: settingsData() }) };
      if (String(url).startsWith('/api/browser/cache')) return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '/tmp', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, storage };
}

test('welcome page renders when runtime has no defaultUri and no initial URI', async () => {
  const { elements, fetchCalls } = createBrowserContext();
  await waitFor(() => fetchCalls.includes('/api/browser/runtime'), 'runtime load');
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  assert.match(elements['[data-browser-viewport]'].innerHTML, /browser-welcome/);
  assert.equal(elements['[data-browser-bookmark-star]'].disabled, true);
});

test('welcome page shows the two official recommendations', async () => {
  const { elements } = createBrowserContext();
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  assert.match(html, /metaapp:\/\/agent-browser/);
  assert.match(html, /metaid:\/\/docsbot/);
  assert.match(html, /Agent Browser/);
  assert.match(html, /Docs Bot/);
});

test('welcome page official tiles use data-browser-map-link so viewport delegation navigates', async () => {
  const { elements } = createBrowserContext();
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  // data-browser-map-link is the attribute the viewport click handler delegates to navigateTo.
  assert.match(html, /data-browser-map-link/);
});

test('welcome page with seeded bookmarks shows bookmark tiles before official tiles', async () => {
  const { elements } = createBrowserContext({
    seedBookmarks: [{ uri: 'metaid://idq1alice', title: 'Alice Bot', resourceType: 'bot' }],
  });
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  const alicePos = html.indexOf('Alice Bot');
  const officialPos = html.indexOf('Agent Browser');
  assert.ok(alicePos > -1, 'bookmark tile rendered');
  assert.ok(officialPos > -1, 'official tile rendered');
  assert.ok(alicePos < officialPos, 'bookmark tile precedes official tile');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/browserPageWelcome.test.mjs 2>&1 | tail -20
```
Expected: FAIL. The viewport won't contain `browser-welcome` because `renderWelcome()` doesn't exist yet and `initialize()` still falls through to `renderNoLocalBot()` only when there's no actor. With an actor + no defaultUri, today's code hits `renderNoLocalBot()` (because the defaultUri branch is skipped) — actually re-check: today `renderNoLocalBot()` IS the fallback after the defaultUri branch. The test will likely show `browser-empty-state` instead of `browser-welcome`. Confirm the failure is about the missing `browser-welcome` class.

- [ ] **Step 3: Implement renderWelcome()**

In `packages/ui/src/browser/app.ts`, add the `renderWelcome()` function. Place it immediately **before** the existing `function renderNoLocalBot()` (around line 1065). The function builds the hero + shortcut grid HTML and assigns it to the viewport, mirroring `renderNoLocalBot()`'s structure.

```js
function buildWelcomeShortcutTiles() {
  var tiles = [];
  var seenUris = {};
  function pushTile(item, kind) {
    var uri = textValue(item.uri);
    if (!uri || seenUris[uri]) return;
    seenUris[uri] = true;
    var resourceName = textValue(item.title) || shortId(uri);
    var resourceType = textValue(item.resourceType);
    var iconName = kind === 'official'
      ? (uri.indexOf('metaapp://') === 0 ? 'service' : 'bot')
      : (resourceType === 'metaapp' ? 'service' : resourceType === 'bot' ? 'bot' : 'bookmark');
    var tileClass = kind === 'official' ? 'browser-welcome-tile is-official' : 'browser-welcome-tile';
    tiles.push('<a class="' + tileClass + '" data-browser-map-link href="' + escapeHtml(uri) + '">' +
      '<span class="browser-welcome-tile-icon" aria-hidden="true">' + iconHtml(iconName) + '</span>' +
      '<span class="browser-welcome-tile-label">' + escapeHtml(resourceName) + '</span>' +
      '<span class="browser-welcome-tile-uri">' + escapeHtml(shortId(uri)) + '</span>' +
      '</a>');
  }
  for (var i = 0; i < state.bookmarks.length; i += 1) pushTile(state.bookmarks[i], 'bookmark');
  var recent = uniqueRecent();
  for (var j = 0; j < recent.length; j += 1) pushTile(recent[j], 'recent');
  for (var k = 0; k < OFFICIAL_RECOMMENDATIONS.length; k += 1) pushTile(OFFICIAL_RECOMMENDATIONS[k], 'official');
  return tiles.join('');
}

function renderWelcome() {
  setStatus('ready', '');
  state.current = null;
  renderOwnerToolbar();
  if (elements.resourceChip) {
    elements.resourceChip.innerHTML = avatarHtml('', 'Resource', 'browser-chip-avatar') +
      '<span class="browser-chip-copy"><span class="browser-chip-title">' + escapeHtml(browserText('resource.emptyTitle', 'No resource')) + '</span><span class="browser-chip-subtitle">' + escapeHtml(browserText('welcome.title', 'Agent Internet')) + '</span></span>' +
      '<span class="browser-chip-proof" aria-hidden="true">' + iconHtml('shield') + '</span>';
  }
  if (elements.statusProof) elements.statusProof.innerHTML = proofIconHtml('unverified') + '<span>' + escapeHtml(browserText('status.unverified', 'unverified')) + '</span>';
  if (elements.statusRenderer) elements.statusRenderer.textContent = browserText('status.rendererNone', 'renderer: none');
  if (elements.statusTxid) elements.statusTxid.textContent = 'TXID: -';
  if (elements.viewport) {
    elements.viewport.innerHTML = '<section class="browser-welcome" data-browser-welcome>' +
      '<div class="browser-welcome-hero">' +
        '<h1 class="browser-welcome-title">' + escapeHtml(browserText('welcome.title', 'Agent Internet')) + '</h1>' +
        '<p class="browser-welcome-subtitle">' + escapeHtml(browserText('welcome.subtitle', 'Enter a metaid:// URI in the address bar to visit a resource.')) + '</p>' +
        '<button type="button" class="browser-welcome-prompt" data-browser-welcome-prompt>' +
          iconHtml('link') +
          '<span>' + escapeHtml(browserText('welcome.promptPlaceholder', 'metaid://')) + '</span>' +
        '</button>' +
      '</div>' +
      '<div class="browser-welcome-grid">' +
        '<h2 class="browser-welcome-heading">' + escapeHtml(browserText('welcome.gridHeading', 'Bookmarks / Recent')) + '</h2>' +
        buildWelcomeShortcutTiles() +
      '</div>' +
    '</section>';
  }
  renderBookmarkStar();
}
```

- [ ] **Step 4: Replace the initialize() defaultUri branch with renderWelcome()**

In `packages/ui/src/browser/app.ts`, find the `initialize()` function's tail (around line 2529-2533):

```js
  if (runtime && runtime.defaultUri) {
    await navigateTo(runtime.defaultUri);
    return;
  }
  renderNoLocalBot();
}
```

Replace the entire `defaultUri` branch + `renderNoLocalBot()` fallback with a single `renderWelcome()` call. The `defaultUri` concept is removed from the UI entirely (per spec — both adapters will return `null`):

```js
  renderWelcome();
}
```

Note: this means `renderNoLocalBot()` is no longer called from `initialize()`. It remains defined and is still called from `openUsingIdentitySelector()` (line 1974, the no-actor path) — do NOT delete the function, only remove the `initialize()` call site.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/browserPageWelcome.test.mjs 2>&1 | tail -20
```
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full UI test suite to check for regressions**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/*.test.mjs 2>&1 | tail -15
```
Expected: all pass EXCEPT `tests/ui/browserPageState.test.mjs` may have tests that relied on `renderNoLocalBot()` being the no-URI fallback (the "no actor" tests still pass because they hit the actor path at `app.ts:1974`; but if any test asserts the no-URI-with-actor path renders the no-actor empty state, it will now fail). Investigate any failure: if it's a test that gave a valid actor + `defaultUri: null` and expected `renderNoLocalBot` content, that test is now correctly expecting `renderWelcome` content — update it (the welcome page is the new correct behavior). Do NOT change no-actor tests.

- [ ] **Step 7: Commit**

```bash
git add tests/ui/browserPageWelcome.test.mjs packages/ui/src/browser/app.ts
git commit -m "feat: render welcome page when Browser opens with no URI"
```

---

## Task 4: Make the welcome prompt focus the address bar and re-render welcome on empty submit

The spec requires: clicking the decorative prompt focuses the real address bar; clearing the address bar and submitting re-renders the welcome page.

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

- [ ] **Step 1: Write the failing test for empty-submit re-render**

Append to `tests/ui/browserPageWelcome.test.mjs`:

```js
test('submitting an empty address bar re-renders the welcome page', async () => {
  const { elements } = createBrowserContext();
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'initial welcome render');
  // Simulate user clearing the address bar and submitting.
  elements['[data-browser-uri-input]'].value = '';
  elements['[data-browser-address-form]'].submit();
  // Should still show welcome (not an error/empty state).
  assert.match(elements['[data-browser-viewport]'].innerHTML, /browser-welcome/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/browserPageWelcome.test.mjs 2>&1 | tail -15
```
Expected: FAIL. Today `navigateTo('')` → `resolveUri('')` returns `null` early (line 2259 `if (!normalizedUri) return null;`) and leaves the viewport untouched OR the form submit handler may not re-render. The empty submit currently does nothing useful.

- [ ] **Step 3: Implement empty-submit → renderWelcome()**

In `packages/ui/src/browser/app.ts`, find `resolveUri` (around line 2257):

```js
async function resolveUri(uri, options) {
  var normalizedUri = textValue(uri);
  if (!normalizedUri) return null;
```

Change the early-return to render the welcome page instead:

```js
async function resolveUri(uri, options) {
  var normalizedUri = textValue(uri);
  if (!normalizedUri) {
    renderWelcome();
    return null;
  }
```

- [ ] **Step 4: Wire the welcome prompt click to focus the address bar**

In `initialize()`, find the viewport click listener (around line 2337-2356). It currently handles `data-browser-map-link` and `data-browser-action`. Add a branch for `data-browser-welcome-prompt` at the TOP of that handler (before the mapLink check), so clicking the decorative prompt focuses the real input:

```js
    elements.viewport.addEventListener('click', function (event) {
      var promptTarget = closestWithAttribute(event && event.target, 'data-browser-welcome-prompt');
      if (promptTarget) {
        if (elements.input && typeof elements.input.focus === 'function') elements.input.focus();
        return;
      }
      var mapLink = closestWithAttribute(event && event.target, 'data-browser-map-link');
      // ... rest unchanged
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/browserPageWelcome.test.mjs 2>&1 | tail -15
```
Expected: PASS (5 tests).

- [ ] **Step 6: Run full UI suite for regressions**

```bash
npm run build 2>&1 | tail -3 && node --test tests/ui/*.test.mjs 2>&1 | tail -15
```
Expected: all pass. The `resolveUri('')` change only affects the empty-string case, which previously returned `null` silently — now it renders welcome. No existing test navigates to an empty URI expecting an error.

- [ ] **Step 7: Commit**

```bash
git add tests/ui/browserPageWelcome.test.mjs packages/ui/src/browser/app.ts
git commit -m "feat: focus address bar from welcome prompt and re-render welcome on empty submit"
```

---

## Task 5: Remove defaultUri from standalone adapter

Now that the welcome page renders on empty URI, remove the fixture default-URI from the active standalone adapter.

**Files:**
- Modify: `packages/host-standalone/src/adapter.ts`
- Update test: `tests/browser/browserStandaloneServer.test.mjs`

- [ ] **Step 1: Update the failing test assertions first**

In `tests/browser/browserStandaloneServer.test.mjs`:

(a) Line 341 — change:
```js
  assert.equal(runtime.data.defaultUri, 'metaid://idq1fixturebot');
```
→
```js
  assert.equal(runtime.data.defaultUri, null);
```

(b) Lines 425-442 — **delete the entire test** `standalone Browser server falls back to the fixture bot homepage when network resolution fails`. This test exists solely to verify the fixture-fallback behavior being removed; its premise is gone. The following test at line 444 (`resolves non-fixture metaid resources through adapter fetch`) remains valid — it mocks `fetch` and resolves a non-fixture URI, and is unaffected by the fixture removal.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build 2>&1 | tail -3 && node --test tests/browser/browserStandaloneServer.test.mjs 2>&1 | tail -15
```
Expected: FAIL (the adapter still returns `defaultUri: 'metaid://idq1fixturebot'`).

- [ ] **Step 3: Remove defaultUri and fixture machinery from adapter.ts**

In `packages/host-standalone/src/adapter.ts`:

(a) Delete the two constants (lines 47-48):
```ts
const STANDALONE_DEFAULT_URI = 'metaid://idq1fixturebot';
const STANDALONE_FIXTURE_GLOBAL_META_ID = 'idq1fixturebot';
```

(b) Delete the entire `FIXTURE_BOT_HOMEPAGE` constant (lines 51-158).

(c) Delete `isFixtureMetaIdUri` function (lines 291-293).

(d) Delete `fixtureFetch` function (lines 377-386).

(e) In `getRuntime()` (around line 536), change the `defaultUri` field to `null` (the contract type is `defaultUri: string | null` — required, so it must be present but null):
```ts
    defaultUri: null,
```
(Replaces `defaultUri: STANDALONE_DEFAULT_URI,`.)

(f) In `resolveResource()` (around line 552-560), simplify by removing the fixture branch:
```ts
async function resolveResource(resolveInput: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
  const actorFailure = resolveActor(resolveInput);
  if (actorFailure) return actorFailure;
  const result = await resolveResourceWithFetch(resolveInput, fetchImpl);
  return toBrowserResult(result);
}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds. If TS complains about unused imports (e.g., a `Response` import only used by `fixtureFetch`), remove the orphaned import. Check the top of `adapter.ts` for now-unused imports and remove only those YOUR change orphaned.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run build 2>&1 | tail -3 && node --test tests/browser/browserStandaloneServer.test.mjs 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/host-standalone/src/adapter.ts tests/browser/browserStandaloneServer.test.mjs
git commit -m "refactor: remove fixture defaultUri and fixture machinery from standalone adapter"
```

---

## Task 6: Remove defaultUri and fixtureHomepage from memory host

**Files:**
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Update test: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Update the failing test assertions**

In `tests/host-standalone/standaloneServer.test.mjs`:

Line 53:
```js
  assert.equal(runtime.data.defaultUri, 'metaid://idq1fixturebot');
```
→
```js
  assert.equal(runtime.data.defaultUri, null);
```

Lines 78-82 (resolves `metaid://idq1fixturebot` expecting `'Fixture Bot'`):
```js
  const resolved = await json(await fetch(`${baseUrl}/api/browser/resolve?uri=metaid%3A%2F%2Fidq1fixturebot`));
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.resourceType, 'bot');
  assert.equal(resolved.data.renderer.type, 'bot-page');
  assert.equal(resolved.data.title, 'Fixture Bot');
```
→ The memory host's `resolveResource` metaid branch used `fixtureHomepage()`. After removal, decide: does the memory host still resolve arbitrary `metaid://` URIs? Check the current `resolveResource` (lines 204-223): it calls `buildBotHomepageEnvelope({ homepage: fixtureHomepage(), ... })` for ANY metaid URI. After removing `fixtureHomepage`, the memory host can no longer resolve metaid URIs. **Decision:** the memory host is a dev/test host; it should return a resolve failure for metaid URIs it has no data for. Change the test to assert failure:

```js
  const resolved = await json(await fetch(`${baseUrl}/api/browser/resolve?uri=metaid%3A%2F%2Fidq1fixturebot`));
  assert.equal(resolved.ok, false);
```

Also lines 137, 152 reference `resourceUri: 'metaid://idq1fixturebot'` in action/login payloads — these are action requests, not resolves. Read those test sections (around 130-160): if they only assert the action response (not the resolve), they stay valid. Only change if they assert fixture resolve content.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build 2>&1 | tail -3 && node --test tests/host-standalone/standaloneServer.test.mjs 2>&1 | tail -15
```
Expected: FAIL.

- [ ] **Step 3: Remove fixtureHomepage and defaultUri from memoryHost.ts**

In `packages/host-standalone/src/memoryHost.ts`:

(a) Remove `defaultUri?: string;` from `MemoryStandaloneHostInput` (line 25). If any caller passes `defaultUri`, they'll TS-error and need updating — check `tests/host-standalone/` and `packages/test-harness/` for callers. The grep earlier showed none outside the definition.

(b) Delete the entire `fixtureHomepage()` function (lines 28-106).

(c) In `runtime(defaultUri: string)` (line 108): change signature to `runtime()` and change the `defaultUri` field to `null` (the contract type `defaultUri: string | null` is required, so keep the field, set it to null):
```ts
function runtime(): BrowserRuntimeSnapshot {
  const actor: BrowserActor = { ... };
  return {
    host: { kind: 'standalone', ... },
    actors: [actor],
    defaultActor: actor,
    defaultUri: null,
    features: { ... },
    labels: { ... },
  };
}
```

(d) In `createMemoryStandaloneBrowserHost` (line 148-150): remove the `defaultUri` local:
```ts
export function createMemoryStandaloneBrowserHost(input: MemoryStandaloneHostInput = {}): BrowserHostAdapter {
  const now = input.now ?? Date.now;
  let config: BrowserConfigContainer = { browser: { botHomepageTemplateId: 'document' } };
```

(e) In `getRuntime` (line 200-203): `runtime(defaultUri)` → `runtime()`.

(f) In `resolveResource` (lines 204-223): the metaid branch used `fixtureHomepage()`. Remove that branch; metaid URIs now fall through to a failure. The simplified `resolveResource`:
```ts
    async resolveResource(resolveInput) {
      const failure = ensureActor(resolveInput.actorId);
      if (failure) return failure;
      try {
        const parsed = parseBrowserUri(resolveInput.uri);
        if (parsed.scheme === 'metaapp') {
          return browserSuccess(resolveMetaapp(parsed.originalUri, parsed.normalizedUri));
        }
        return browserFailure('unsupported_browser_uri', `Memory host cannot resolve ${parsed.scheme} URIs.`);
      } catch (error) {
        return browserFailure('invalid_browser_uri', error instanceof Error ? error.message : String(error));
      }
    },
```

(g) Check for now-orphaned imports: `buildBotHomepageEnvelope` is no longer used — remove it from the import at line 3. Keep `parseBrowserUri` (still used). After edit, the import becomes:
```ts
import {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  type BrowserConfigContainer,
  type BrowserSettingsSnapshot as CoreBrowserSettingsSnapshot,
} from '@openagentinternet/agent-browser-core';
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds. If `MemoryStandaloneHostInput` is now empty (only `now?`), that's fine. Check `packages/test-harness/` for any reference to `defaultUri` on the memory host and update if needed.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run build 2>&1 | tail -3 && node --test tests/host-standalone/standaloneServer.test.mjs 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/host-standalone/src/memoryHost.ts tests/host-standalone/standaloneServer.test.mjs
git commit -m "refactor: remove fixtureHomepage and defaultUri from memory host"
```

---

## Task 7: Update remaining test assertions and docs

**Files:**
- Modify: `tests/ui/browserPage.test.mjs:70`
- Modify: `docs/acceptance/browser-parity-standalone.md:10`

- [ ] **Step 1: Update the script-structure assertion**

`tests/ui/browserPage.test.mjs:70` asserts the client script contains `if (runtime && runtime.defaultUri) {`. Task 3 removed that branch. Update the assertion to verify the welcome page is rendered instead. Change line 70:
```js
  assert.match(definition.script, /if \(runtime && runtime\.defaultUri\) \{/);
```
→
```js
  assert.match(definition.script, /function renderWelcome\(\)/);
```

- [ ] **Step 2: Update the acceptance doc**

In `docs/acceptance/browser-parity-standalone.md`, find line 10:
```
- Default URI: metaid://idq1fixturebot
```
Change to:
```
- Default landing: welcome page (no default URI; address bar empty renders welcome)
```

- [ ] **Step 3: Commit**

```bash
git add tests/ui/browserPage.test.mjs docs/acceptance/browser-parity-standalone.md
git commit -m "docs: update standalone acceptance and script assertion for welcome page"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the complete test suite**

```bash
npm test 2>&1 | tail -25
```
Expected: all tests pass. This runs `npm run build` + `node --test tests/**/*.test.mjs`.

- [ ] **Step 2: Grep for residual fixture references in production code**

```bash
grep -rn "idq1fixturebot\|FIXTURE_BOT_HOMEPAGE\|fixtureFetch\|isFixtureMetaIdUri" packages/host-standalone/src/ packages/ui/src/browser/
```
Expected: no output (all removed from production code). Test files and fixtures may still contain `idq1fixturebot` as test input data — that's fine and intentional.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

```bash
npm run dev:standalone -- --port 8787 &
sleep 2
open http://localhost:8787/browser
```
Expected: browser opens, viewport shows the welcome page (Agent Internet hero + shortcut grid with 2 official tiles). Address bar empty. Clicking an official tile attempts to resolve `metaapp://agent-browser` / `metaid://docsbot` (will fail gracefully until real pinIDs are provided, showing "Resolve failed" — expected for placeholder URIs).

- [ ] **Step 4: Final commit if any cleanup remains**

If the smoke test surfaced issues, fix and commit. Otherwise the feature is complete.

---

## Success Criteria Mapping (from spec)

1. ✅ Opening `/`, `/browser`, `/ui/browser` with no URI renders welcome — Task 3 (renderWelcome in initialize fallback).
2. ✅ Shortcut grid shows bookmarks + recent visits + 2 official recommendations pinned at tail — Task 3 (buildWelcomeShortcutTiles order).
3. ✅ Empty bookmarks → grid shows only 2 official recommendations — Task 3 (no empty placeholder cells).
4. ✅ Clicking official recommendation runs normal resolve — Task 3 (tiles use `data-browser-map-link`, delegated to `navigateTo`).
5. ✅ Clearing address bar + submit re-renders welcome — Task 4 (resolveUri empty branch).
6. ✅ No fixture references in production code — Tasks 5 & 6.
7. ✅ renderNoLocalBot path unchanged — Task 3 leaves it untouched.
