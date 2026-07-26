# MetaApp Address-Bar Icon, Info Panel, Share & Remix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the current URI is a MetaApp, show its icon favicon-style in the address bar; clicking it opens an info panel (icon/title/version/updated) with Share, Remix, and View-pin actions; Share offers copyable links plus a "Buzz it" simplebuzz publisher; Remix invokes the host over the trusted-action bridge.

**Architecture:** All MetaApp data is already client-side at `state.current.renderer.data.record` (no core resolver changes). The UI mirrors the existing owner-chip panel and private-chat modal patterns in `packages/ui/src/browser/app.ts`. Remix adds one trusted-action kind `'metaapp-remix'` plus an optional `features.remix` flag to the host contract; Buzz reuses the existing `'metaid-pin-write'` kind with a `/protocols/simplebuzz` payload. Standalone keeps both actions behind the existing "not supported in web version" modal.

**Tech Stack:** TypeScript workspace, Node built-in test runner (`node --test`) with `node:vm` + FakeElement UI harness, no frameworks.

**Spec:** `docs/superpowers/specs/2026-07-26-metaapp-share-design.md`

---

## Working context (read first)

- **Worktree:** work inside `/Users/tusm/Documents/MetaID_Projects/agent-browser-core/.worktrees/metaapp-share` on branch `metaapp-share`. All paths below are relative to that root.
- **Build:** `npm run build` (ESM + CJS). For TDD loops, `npm run build:esm` suffices (tests import `packages/*/dist/...` ESM output).
- **Targeted tests:** `node --test tests/ui/browserPageActions.test.mjs` (or the relevant file). Full suite: `npm test`.
- **Served-script escaping:** the client script in `packages/ui/src/browser/app.ts` is ONE giant TS template literal (`buildBrowserPageScript()`, app.ts:122-6127). New JS code inside it MUST NOT contain backticks or `${`. Avoid regex literals; if one is unavoidable, escape slashes as `\\/` in the TS source (existing example: `/^metafile:\\/\\//i` at app.ts:706). The new code in this plan deliberately uses no regex literals.
- **Placeholder injection:** `packages/ui/src/browser/page.ts` MUST keep using `split(placeholder).join(value)` — never `String.prototype.replace`. This plan does not touch `page.ts`; do not regress this.
- **`indexHtml.ts` format:** the template is stored as a single double-quoted JS string with literal `\n` escape sequences. Task 4 provides a Node injection script for the CSS edit — use it, do not hand-edit the 69 KB line.
- **Language:** code, comments, tests, and docs in English.
- **Commits:** one commit per task, message format `<type>: <short description>`. After EVERY commit, post a dev-journal buzz with the Bob identity (repo rule from AGENTS.md):
  ```bash
  printf '%s' '{"content":"Agent Browser Core dev journal: <what changed and why, 2-4 sentences>"}' > /tmp/abc-buzz.json
  $HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
  ```

---

### Task 1: Host contract — `metaapp-remix` kind + optional `features.remix`

**Files:**
- Modify: `packages/host-contract/src/index.ts:85-99` (kind union) and `:209-215` (features)
- Modify: `packages/test-harness/src/index.ts:22-37` (kind list)

- [ ] **Step 1: Add the kind and feature flag to the contract**

In `packages/host-contract/src/index.ts`, change the `BrowserTrustedActionKind` union (lines 85-99) — insert `'metaapp-remix'` between `'share-resource'` and `'metaid-pin-write'`:

```ts
export type BrowserTrustedActionKind =
  | 'private-chat'
  | 'service-call'
  | 'copy-uri'
  | 'open-settings'
  | 'login'
  | 'wallet-sign'
  | 'payment'
  | 'edit-profile'
  | 'configure-chat'
  | 'view-messages'
  | 'open-conversation'
  | 'share-resource'
  | 'metaapp-remix'
  | 'metaid-pin-write'
  | 'metafile-upload';
```

In the same file, change `BrowserRuntimeSnapshot.features` (lines 209-215) to add the optional flag (optional so older hosts stay compatible; absent = unsupported):

```ts
  features: {
    privateChat: boolean;
    serviceCall: boolean;
    cacheManagement: boolean;
    templateSettings: boolean;
    walletLogin: boolean;
    // Optional capability flag: hosts that can remix the current MetaApp set this true.
    remix?: boolean;
  };
```

- [ ] **Step 2: Mirror the kind in the test harness list**

In `packages/test-harness/src/index.ts` (lines 22-37), insert `'metaapp-remix'` between `'share-resource'` and `'metaid-pin-write'`:

```ts
const TRUSTED_ACTION_KINDS = [
  'private-chat',
  'service-call',
  'copy-uri',
  'open-settings',
  'login',
  'wallet-sign',
  'payment',
  'edit-profile',
  'configure-chat',
  'view-messages',
  'open-conversation',
  'share-resource',
  'metaapp-remix',
  'metaid-pin-write',
  'metafile-upload',
];
```

- [ ] **Step 3: Build and run contract/harness tests**

Run: `npm run build && node --test tests/host-contract/*.test.mjs tests/test-harness/*.test.mjs`
Expected: build succeeds; all tests PASS (type-level change verified by `tsc`; harness conformance stays green).

- [ ] **Step 4: Commit + buzz journal**

```bash
git add packages/host-contract/src/index.ts packages/test-harness/src/index.ts
git commit -m "feat: add metaapp-remix trusted action kind to host contract"
printf '%s' '{"content":"Agent Browser Core dev journal: added the metaapp-remix trusted action kind and an optional features.remix flag to the Browser host contract (plus the test-harness kind list). This is the contract foundation for the MetaApp share/remix browser chrome on branch metaapp-share; hosts that implement remix can now advertise it, older hosts stay compatible because the flag is optional."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 2: Standalone host — `features.remix: false`

**Files:**
- Test: `tests/host-standalone/standaloneServer.test.mjs:46` and `:164-176`
- Modify: `packages/host-standalone/src/adapter.ts:536-542` (features block)
- Modify: `packages/host-standalone/src/memoryHost.ts:56-62` (features block)

- [ ] **Step 1: Write the failing tests**

In `tests/host-standalone/standaloneServer.test.mjs`, add one assertion right after line 46 (`assert.equal(runtime.data.features.walletLogin, true);`):

```js
  assert.equal(runtime.data.features.remix, false);
```

In the same file, extend the unsupported-kinds loop at line 164 so the new kind is covered by the existing default-failure path:

```js
  for (const kind of ['service-call', 'private-chat', 'metaapp-remix']) {
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build:esm && node --test tests/host-standalone/standaloneServer.test.mjs`
Expected: FAIL — `AssertionError: Expected values to be strictly equal: undefined !== false` at the new `features.remix` assertion. (The loop extension passes already via the adapter's default `browser_action_not_supported` fallthrough.)

- [ ] **Step 3: Add the flag in both standalone hosts**

In `packages/host-standalone/src/adapter.ts`, features block (lines 536-542):

```ts
      features: {
        privateChat: false,
        serviceCall: false,
        cacheManagement: true,
        templateSettings: true,
        walletLogin: true,
        remix: false,
      },
```

In `packages/host-standalone/src/memoryHost.ts`, features block (lines 56-62), same addition:

```ts
    features: {
      privateChat: false,
      serviceCall: false,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: true,
      remix: false,
    },
```

No `runTrustedAction` change: the default fallthrough already returns `browserFailure('browser_action_not_supported', ...)` for unknown kinds in both hosts, which is exactly the defense-in-depth behavior for `metaapp-remix`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:esm && node --test tests/host-standalone/standaloneServer.test.mjs`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit + buzz journal**

```bash
git add packages/host-standalone/src/adapter.ts packages/host-standalone/src/memoryHost.ts tests/host-standalone/standaloneServer.test.mjs
git commit -m "feat: expose remix as unsupported in standalone host features"
printf '%s' '{"content":"Agent Browser Core dev journal: standalone host now advertises features.remix=false in both the real adapter and the memory host, with server tests pinning the flag and the metaapp-remix unsupported-action failure. The Browser UI gates its Remix button on this flag, so web-mode standalone gets the standard not-supported modal while OAC/IDBots can flip the flag on."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 3: Address-bar MetaApp icon

**Files:**
- Test: `tests/ui/browserPageActions.test.mjs:51-72` (element stubs) — append tests at end of file
- Modify: `packages/ui/src/browser/app.ts` — shell markup `:69-77`, state `:176-177`, `bindElements()` `:1497-1498`, `iconHtml()` `:1430`, helpers near `currentMetaAppPinId()` `:1798-1801`, `renderCurrent()` `:2641-2642`, `syncToolbarForActiveTab()` `:564`, exports `:6054`

- [ ] **Step 1: Write the failing tests**

In `tests/ui/browserPageActions.test.mjs`, inside the `elements()` factory (lines 51-72), add three stubs (any position in the object):

```js
    '[data-browser-address-icon]': new FakeElement(),
    '[data-browser-app-panel]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
```

Append at the END of the same file:

```js
const METAAPP_PIN_ID = `${'a'.repeat(64)}i0`;
const METAAPP_ICON_PIN_ID = `${'b'.repeat(64)}i0`;

function metaAppCurrent({ withProof = true } = {}) {
  const record = {
    pinId: METAAPP_PIN_ID,
    firstPinId: METAAPP_PIN_ID,
    operation: 'create',
    title: 'Fun App',
    appName: 'Fun App',
    icon: `metafile://${METAAPP_ICON_PIN_ID}`,
    version: '1.2.0',
    runtime: 'html',
    indexFile: 'index.html',
    code: '',
    content: '',
    contentType: 'application/zip',
    codeType: 'zip',
    tags: [],
    ownerGlobalMetaId: 'idq1owner',
    network: 'mvc',
    updatedAt: 1750000000000,
    source: 'test',
  };
  return {
    uri: `metaapp://${METAAPP_PIN_ID}`,
    normalizedUri: `metaapp://${METAAPP_PIN_ID}`,
    resourceType: 'metaapp',
    title: 'Fun App',
    owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1owner', name: 'Owner Bot', verificationState: 'partial' },
    renderer: { type: 'html-iframe', contentType: 'text/html', data: { record } },
    proof: withProof ? { pinId: METAAPP_PIN_ID, protocolPath: '/protocols/metaapp', verificationState: 'partial' } : undefined,
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'test' },
    actions: [],
  };
}

test('metaAppIconUrl resolves http, metafile, bare pinId, and rejects junk', () => {
  const { context } = createContext();
  assert.equal(context.metaAppIconUrl('https://cdn.example/icon.png'), 'https://cdn.example/icon.png');
  const fromMetafile = context.metaAppIconUrl(`metafile://${METAAPP_ICON_PIN_ID}`);
  assert.ok(fromMetafile.includes(`/api/v1/files/accelerate/content/${METAAPP_ICON_PIN_ID}`), fromMetafile);
  const fromBarePin = context.metaAppIconUrl(METAAPP_ICON_PIN_ID);
  assert.ok(fromBarePin.endsWith(`/content/${METAAPP_ICON_PIN_ID}`), fromBarePin);
  assert.equal(context.metaAppIconUrl('javascript:alert(1)'), '');
  assert.equal(context.metaAppIconUrl(''), '');
});

test('address icon stays the default link glyph for non-MetaApp resources', () => {
  const { context, nodes } = createContext();
  context.renderAddressIcon();
  const slot = nodes['[data-browser-address-icon]'];
  assert.equal(slot.disabled, true);
  assert.doesNotMatch(slot.innerHTML, /browser-app-icon-image/);
  assert.equal(slot.getAttribute('title'), '');
});

test('address icon shows the MetaApp icon for MetaApp resources', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.renderAddressIcon();
  const slot = nodes['[data-browser-address-icon]'];
  assert.equal(slot.disabled, false);
  assert.match(slot.innerHTML, /browser-app-icon-image/);
  assert.match(slot.innerHTML, new RegExp(METAAPP_ICON_PIN_ID));
  assert.equal(slot.getAttribute('title'), 'Fun App');
  assert.equal(slot.getAttribute('aria-haspopup'), 'dialog');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: FAIL — `context.metaAppIconUrl is not a function` / `context.renderAddressIcon is not a function`.

- [ ] **Step 3: Implement the address-bar icon**

**3a.** Shell markup — in `packages/ui/src/browser/app.ts`, `buildBrowserPageDefinition().contentHtml` (lines 69-72), replace:

```html
          <form class="browser-address-form" data-browser-address-form>
            <span class="browser-address-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"></path></svg>
            </span>
```

with (icon slot becomes a disabled-by-default button, plus the hidden app panel container):

```html
          <form class="browser-address-form" data-browser-address-form>
            <div class="browser-address-icon-wrap">
              <button type="button" class="browser-address-icon" data-browser-address-icon disabled tabindex="-1" title="">
                <svg viewBox="0 0 24 24" focusable="false"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"></path></svg>
              </button>
              <div class="browser-app-panel" data-browser-app-panel role="dialog" hidden></div>
            </div>
```

**3b.** State — in the `state` object, after `actorPanelOpen: false,` (line 177) add:

```js
  appPanelOpen: false,
```

**3c.** Icons — in `iconHtml()` (app.ts:1415-1442), add three entries to the `icons` map right after the `link:` entry (line 1430):

```js
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.59 13.51L15.42 17.49M15.41 6.51L8.59 10.49"></path>',
    remix: '<circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v2c0 .6-.5 1-1 1H7c-.6 0-1-.4-1-1V9"></path><path d="M12 12v3"></path>',
    scroll: '<path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path>',
```

**3d.** `bindElements()` (app.ts:1487-1516) — add two entries after `ownerPanel:` (line 1498):

```js
    addressIcon: document.querySelector('[data-browser-address-icon]'),
    appPanel: document.querySelector('[data-browser-app-panel]'),
```

**3e.** Helpers — right after `currentMetaAppPinId()` (app.ts:1798-1801), add:

```js
// Returns the embedded MetaApp gallery record for the current resource, or null
// when the current resource is not a MetaApp. Preview resources (preview-metaapp://)
// also carry a record but no chain proof; callers gate pin actions separately.
function currentMetaAppRecord() {
  if (!state.current || state.current.resourceType !== 'metaapp') return null;
  var data = objectValue(state.current.renderer && state.current.renderer.data);
  var record = objectValue(data.record);
  return Object.keys(record).length ? record : null;
}

function metaAppRecordTitle(record) {
  return textValue(record && record.title) ||
    textValue(record && record.appName) ||
    textValue(state.current && state.current.title) ||
    'MetaApp';
}

// The chain icon field is free-form: http(s)/data/blob URL, metafile:// URI, or a
// bare metafile pinId. Normalize to a fetchable URL; empty when unusable.
function metaAppIconUrl(icon) {
  var raw = textValue(icon);
  if (!raw) return '';
  if (raw.toLowerCase().indexOf('metafile://') === 0) return buildMetafileDownloadHref(raw);
  if (isBrowserPinId(raw)) return buildMetafileContentHref(raw);
  return safeUrl(raw);
}

function appIconHtml(record, className) {
  var url = metaAppIconUrl(record && record.icon);
  var classValue = className || 'browser-app-icon-image';
  if (url) {
    return '<img class="' + classValue + '" src="' + escapeHtml(url) + '" alt="" />';
  }
  return '<span class="browser-app-icon-fallback" aria-hidden="true">' + iconHtml('bot') + '</span>';
}

function formatAppUpdatedAt(value) {
  var timestamp = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (!timestamp) return '';
  var date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
```

**3f.** `renderAddressIcon()` + panel open/close/toggle — add right after the helpers from 3e:

```js
var ADDRESS_ICON_DEFAULT_HTML = iconHtml('link');

// Keeps the address-bar leading icon in sync with the active tab: the default
// link glyph for ordinary resources, the MetaApp's own icon (favicon-style,
// clickable) for MetaApp resources.
function renderAddressIcon() {
  if (!elements.addressIcon) return;
  var record = currentMetaAppRecord();
  if (!record) {
    closeAppPanel();
    elements.addressIcon.innerHTML = ADDRESS_ICON_DEFAULT_HTML;
    elements.addressIcon.disabled = true;
    elements.addressIcon.classList.remove('has-app-icon');
    elements.addressIcon.removeAttribute('aria-haspopup');
    elements.addressIcon.setAttribute('title', '');
    return;
  }
  elements.addressIcon.innerHTML = appIconHtml(record, 'browser-app-icon-image');
  elements.addressIcon.disabled = false;
  elements.addressIcon.classList.add('has-app-icon');
  elements.addressIcon.setAttribute('aria-haspopup', 'dialog');
  elements.addressIcon.setAttribute('aria-expanded', state.appPanelOpen ? 'true' : 'false');
  elements.addressIcon.setAttribute('title', metaAppRecordTitle(record));
}

function closeAppPanel() {
  state.appPanelOpen = false;
  if (elements.appPanel) elements.appPanel.hidden = true;
  if (elements.addressIcon && typeof elements.addressIcon.setAttribute === 'function') {
    elements.addressIcon.setAttribute('aria-expanded', 'false');
  }
}

function openAppPanel() {
  if (!elements.appPanel || !currentMetaAppRecord()) return;
  state.appPanelOpen = true;
  renderAppPanel();
  elements.appPanel.hidden = false;
  if (elements.addressIcon && typeof elements.addressIcon.setAttribute === 'function') {
    elements.addressIcon.setAttribute('aria-expanded', 'true');
  }
}

function toggleAppPanel() {
  if (state.appPanelOpen) {
    closeAppPanel();
  } else {
    openAppPanel();
  }
}
```

(`renderAppPanel` is implemented in Task 4; JS function declarations hoist within the script scope, so calling it here is safe once Task 4 lands — Task 3 tests never open the panel.)

**3g.** Call sites — in `renderCurrent()` (app.ts:2613-2643), add one line after `renderBookmarkStar();` (line 2641), before `syncPanelState();`:

```js
  renderAddressIcon();
```

In `syncToolbarForActiveTab()` (app.ts:555-565), add one line after `syncLoadingButton();`:

```js
  renderAddressIcon();
```

**3h.** Exports — with the other `globalThis` seams (after `globalThis.handleOwnerPanelAction`, app.ts:6055), add:

```js
globalThis.metaAppIconUrl = metaAppIconUrl;
globalThis.renderAddressIcon = renderAddressIcon;
globalThis.openAppPanel = openAppPanel;
globalThis.closeAppPanel = closeAppPanel;
globalThis.toggleAppPanel = toggleAppPanel;
```

Export only what this task defines — the export block executes at script load, so
referencing a not-yet-written function would break every UI test.
`renderAppPanel`/`handleAppPanelAction` get their exports in Task 4,
`openMetaAppShareModal`/`confirmAppShareBuzz`/`openAppShareBuzzPost` in Task 5,
`requestMetaAppRemix` in Task 6. Calls *inside* function bodies (e.g.
`renderAddressIcon` calling `closeAppPanel`, `openAppPanel` calling
`renderAppPanel`) resolve at call time and are safe across tasks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: PASS (whole file, old + new tests).

- [ ] **Step 5: Commit + buzz journal**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageActions.test.mjs
git commit -m "feat: show MetaApp icon in the browser address bar"
printf '%s' '{"content":"Agent Browser Core dev journal: the Browser address bar now shows the current MetaApp\u0027s own icon favicon-style (fallback to a generic glyph), replacing the static link glyph only while a MetaApp is loaded and restoring it otherwise. Icon URLs are normalized from http(s), metafile://, or bare pinIds via the configured metafile content base; per-tab sync included. First slice of the metaapp-share branch, with node:vm UI tests."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 4: MetaApp info panel + CSS

**Files:**
- Test: `tests/ui/browserPageActions.test.mjs` (append)
- Modify: `packages/ui/src/browser/app.ts` — helpers after Task-3 block, `initialize()` `:5969-5986` and `:5998-6002`
- Modify: `packages/ui/src/browser/indexHtml.ts` (CSS injection via script below)
- Modify: `packages/ui/src/browser/darkThemeCss.ts` (append before the closing backtick, after line 166)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/browserPageActions.test.mjs`:

```js
test('app panel renders MetaApp metadata and actions', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openAppPanel();
  const panel = nodes['[data-browser-app-panel]'];
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Fun App/);
  assert.match(panel.innerHTML, /v1\.2\.0/);
  assert.match(panel.innerHTML, /Updated 2025-06-15/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="share"/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="remix"/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="view-pin"/);
  assert.equal(nodes['[data-browser-address-icon]'].getAttribute('aria-expanded'), 'true');
  context.closeAppPanel();
  assert.equal(panel.hidden, true);
  assert.equal(nodes['[data-browser-address-icon]'].getAttribute('aria-expanded'), 'false');
});

test('app panel disables actions when the MetaApp has no on-chain pin', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent({ withProof: false });
  context.openAppPanel();
  const html = nodes['[data-browser-app-panel]'].innerHTML;
  assert.match(html, /data-browser-app-panel-action="share" disabled/);
  assert.match(html, /data-browser-app-panel-action="remix" disabled/);
  assert.match(html, /data-browser-app-panel-action="view-pin" disabled/);
  assert.match(html, /Actions require an on-chain pin/);
});

test('app panel view-pin navigates to the pin URI', async () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openAppPanel();
  await context.handleAppPanelAction('view-pin');
  assert.equal(nodes['[data-browser-app-panel]'].hidden, true);
  assert.equal(nodes['[data-browser-uri-input]'].value, `pin://${METAAPP_PIN_ID}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: FAIL — `context.openAppPanel is not a function`… (if Task 3 exported it already: `renderAppPanel is not defined` inside `openAppPanel`, or `context.handleAppPanelAction is not a function`).

- [ ] **Step 3: Implement the panel**

**3a.** In `packages/ui/src/browser/app.ts`, right after `toggleAppPanel()` from Task 3, add:

```js
function renderAppPanel() {
  if (!elements.appPanel) return;
  var record = currentMetaAppRecord();
  if (!record) {
    elements.appPanel.innerHTML = '';
    return;
  }
  var pinId = currentMetaAppPinId();
  var title = metaAppRecordTitle(record);
  var version = textValue(record.version);
  var updated = formatAppUpdatedAt(record.updatedAt);
  var actionsDisabled = pinId ? '' : ' disabled';
  var metaLine = version ? 'v' + escapeHtml(version) : '';
  if (updated) {
    metaLine += (metaLine ? ' · ' : '') + escapeHtml(browserText('appPanel.updated', 'Updated')) + ' ' + escapeHtml(updated);
  }
  elements.appPanel.innerHTML =
    '<div class="browser-app-panel-head">' +
      '<span class="browser-app-panel-icon">' + appIconHtml(record, 'browser-app-icon-image') + '</span>' +
      '<div class="browser-app-panel-id">' +
        '<span class="browser-app-panel-name">' + escapeHtml(title) + '</span>' +
        '<span class="browser-app-panel-meta">' + (metaLine || escapeHtml(shortId(pinId) || 'MetaApp')) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="browser-app-panel-menu" role="none">' +
      '<button type="button" class="browser-app-panel-item" data-browser-app-panel-action="share"' + actionsDisabled + '>' +
        iconHtml('share') + '<span>' + escapeHtml(browserText('appPanel.share', 'Share')) + '</span>' +
      '</button>' +
      '<button type="button" class="browser-app-panel-item" data-browser-app-panel-action="remix"' + actionsDisabled + '>' +
        iconHtml('remix') + '<span>' + escapeHtml(browserText('appPanel.remix', 'Remix')) + '</span>' +
      '</button>' +
      '<button type="button" class="browser-app-panel-item" data-browser-app-panel-action="view-pin"' + actionsDisabled + '>' +
        iconHtml('scroll') + '<span>' + escapeHtml(browserText('appPanel.viewPin', 'View pin')) + '</span>' +
      '</button>' +
    '</div>' +
    (pinId ? '' : '<p class="browser-app-panel-note">' + escapeHtml(browserText('appPanel.pinRequired', 'Actions require an on-chain pin for this MetaApp.')) + '</p>');
}

function handleAppPanelAction(action) {
  closeAppPanel();
  if (action === 'share') {
    openMetaAppShareModal();
    return Promise.resolve();
  }
  if (action === 'remix') {
    return requestMetaAppRemix();
  }
  if (action === 'view-pin') {
    var href = pinHref(currentMetaAppPinId());
    if (href) return navigateTo(href);
  }
  return Promise.resolve();
}
```

(`openMetaAppShareModal` / `requestMetaAppRemix` land in Tasks 5-6 and hoist.)

**3b.** Event wiring — in `initialize()`, after the `elements.resourceChip` click block (app.ts:5969-5972), add:

```js
  if (elements.addressIcon) {
    elements.addressIcon.addEventListener('click', function (event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      if (elements.addressIcon.disabled) return;
      toggleAppPanel();
    });
  }
  if (elements.appPanel) {
    elements.appPanel.addEventListener('click', function (event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      var target = closestWithAttribute(event && event.target, 'data-browser-app-panel-action');
      if (!target) return;
      if (target.disabled) return;
      handleAppPanelAction(target.getAttribute('data-browser-app-panel-action')).catch(function (error) {
        setStatus('error', error && error.message ? error.message : 'App action failed.');
      });
    });
  }
```

In the document-level click-outside handler (app.ts:5998-6002), add one line so the panel closes like the menu/owner panel:

```js
  document.addEventListener('click', function () {
    if (state.menuOpen) closeBrowserMenu();
    if (state.ownerPanelOpen) closeOwnerPanel();
    if (state.actorPanelOpen) closeStandaloneActorPanel();
    if (state.appPanelOpen) closeAppPanel();
  });
```

**3c.** Light CSS — write the CSS to `/tmp/metaapp-panel.css` exactly:

```css
      .browser-address-icon-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .browser-address-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--browser-dim);
      }
      .browser-address-icon:not(:disabled) {
        cursor: pointer;
      }
      .browser-address-icon:disabled {
        cursor: default;
      }
      .browser-address-icon .browser-app-icon-image {
        width: 20px;
        height: 20px;
        border-radius: 5px;
        object-fit: cover;
      }
      .browser-address-icon .browser-app-icon-fallback {
        display: inline-flex;
        width: 20px;
        height: 20px;
        color: var(--browser-dim);
      }
      .browser-app-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 37;
        min-width: 248px;
        border: 1px solid var(--browser-border);
        border-radius: var(--browser-radius);
        background: var(--browser-surface);
        box-shadow: var(--browser-shadow);
        padding: 12px;
        display: grid;
        gap: 8px;
        text-align: left;
      }
      .browser-app-panel-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--browser-border);
      }
      .browser-app-panel-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: 10px;
        overflow: hidden;
        background: var(--browser-surface2);
      }
      .browser-app-panel-icon .browser-app-icon-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .browser-app-panel-icon .browser-app-icon-fallback {
        display: inline-flex;
        width: 22px;
        height: 22px;
        color: var(--browser-dim);
      }
      .browser-app-panel-id {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .browser-app-panel-name {
        font-weight: 600;
        color: var(--browser-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .browser-app-panel-meta {
        font-size: 12px;
        color: var(--browser-muted);
      }
      .browser-app-panel-menu {
        display: grid;
        gap: 2px;
      }
      .browser-app-panel-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        background: transparent;
        color: var(--browser-text);
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        text-align: left;
        transition: background-color .14s ease;
      }
      .browser-app-panel-item:not(:disabled):hover {
        background: var(--browser-hover, rgba(15, 23, 42, .06));
      }
      .browser-app-panel-item:disabled {
        opacity: .55;
        cursor: not-allowed;
      }
      .browser-app-panel-item .browser-icon {
        flex: 0 0 auto;
      }
      .browser-app-panel-note {
        margin: 0;
        font-size: 12px;
        color: var(--browser-muted);
      }
      .browser-app-share-rows {
        display: grid;
        gap: 8px;
        margin-bottom: 10px;
      }
      .browser-app-share-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .browser-app-share-value {
        flex: 1 1 auto;
        min-width: 0;
        padding: 6px 8px;
        border: 1px solid var(--browser-border);
        border-radius: 6px;
        background: var(--browser-surface2);
        color: var(--browser-text);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .browser-app-share-copy {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--browser-muted);
        border-radius: 6px;
        cursor: pointer;
        transition: background-color .14s ease, color .14s ease;
      }
      .browser-app-share-copy:hover {
        background: var(--browser-hover, rgba(15, 23, 42, .06));
        color: var(--browser-text);
      }
      .browser-app-share-status.is-sending {
        color: var(--browser-muted);
      }
      .browser-app-share-status.is-error {
        color: var(--browser-danger);
      }
```

Then inject it into `packages/ui/src/browser/indexHtml.ts` with this Node script (the file stores the template as one double-quoted string with literal `\n` escapes; the script converts real newlines to `\n` sequences and inserts before the `.browser-address-form input {` rule):

```bash
cat > /tmp/inject-metaapp-css.mjs <<'EOF'
import fs from 'node:fs';
const path = 'packages/ui/src/browser/indexHtml.ts';
const source = fs.readFileSync(path, 'utf8');
const css = fs.readFileSync('/tmp/metaapp-panel.css', 'utf8').trimEnd();
const escaped = css.split('\n').join('\\n');
const anchor = '.browser-address-form input {';
const index = source.indexOf(anchor);
if (index === -1) throw new Error('anchor not found');
if (source.includes('.browser-app-panel {')) throw new Error('already injected');
const updated = source.slice(0, index) + escaped + '\\n      ' + source.slice(index);
fs.writeFileSync(path, updated);
console.log('injected', css.split('\n').length, 'css lines');
EOF
node /tmp/inject-metaapp-css.mjs
```

Verify the injection landed exactly once:

Run: `grep -c 'browser-app-panel {' packages/ui/src/browser/indexHtml.ts`
Expected: `1`

**3d.** Dark CSS — in `packages/ui/src/browser/darkThemeCss.ts`, add before the closing backtick (after line 166). Surfaces and text colors follow the dark `--browser-*` variable redefinitions automatically; only hover/status tones need explicit overrides:

```css
      html[data-browser-resolved-theme="dark"] .browser-app-panel-icon { background: #1f3052; }
      html[data-browser-resolved-theme="dark"] .browser-app-share-copy:hover { background: #1f3052; color: #c2d0e6; }
      html[data-browser-resolved-theme="dark"] .browser-app-share-status.is-sending { color: #8fa1bd; }
      html[data-browser-resolved-theme="dark"] .browser-app-share-status.is-error { color: #ff9a9a; }
```

**3e.** Exports — in the Task-3 export block (after `globalThis.toggleAppPanel`), add:

```js
globalThis.renderAppPanel = renderAppPanel;
globalThis.handleAppPanelAction = handleAppPanelAction;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit + buzz journal**

```bash
git add packages/ui/src/browser/app.ts packages/ui/src/browser/indexHtml.ts packages/ui/src/browser/darkThemeCss.ts tests/ui/browserPageActions.test.mjs
git commit -m "feat: add MetaApp info panel to the address bar"
printf '%s' '{"content":"Agent Browser Core dev journal: clicking the MetaApp icon in the address bar now opens an owner-chip-style info panel with the app icon, title, version, and last-updated date, plus Share / Remix / View-pin actions (disabled with a hint for preview-only apps without an on-chain pin). Mirrors the owner panel open/close/outside-click behavior, ships light and dark theme CSS, and adds panel tests to the node:vm UI harness."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 5: Share modal + "Buzz it" publisher

**Files:**
- Test: `tests/ui/browserPageActions.test.mjs` (append)
- Modify: `packages/ui/src/browser/app.ts` — constant near `:151`, functions after Task-4 block, `closeModal()` `:3678-3691`, modal dispatch `:5848`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/browserPageActions.test.mjs`:

```js
test('share modal shows web URL, metaapp URI, and editable default buzz text', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  const html = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /Share MetaApp/);
  assert.match(html, new RegExp(`https://openagentinternet\\.org/browser/metaapp/${METAAPP_PIN_ID}`));
  assert.match(html, new RegExp(`metaapp://${METAAPP_PIN_ID}`));
  assert.match(html, /I found an interesting app &#39;Fun App&#39;/);
  assert.match(html, /data-browser-app-share-message/);
  assert.match(html, /Buzz it/);
  assert.match(html, /data-browser-modal-action="app-share-buzz"/);
});

test('Buzz it posts a simplebuzz pin write through the actions endpoint', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.kind, 'metaid-pin-write');
  assert.equal(body.resourceUri, `metaapp://${METAAPP_PIN_ID}`);
  assert.equal(body.payload.operation, 'create');
  assert.equal(body.payload.path, '/protocols/simplebuzz');
  assert.equal(body.payload.encryption, '0');
  assert.equal(body.payload.version, '1.0.0');
  assert.equal(body.payload.contentType, 'application/json;utf-8');
  assert.equal(body.payload.payload.encoding, 'utf8');
  assert.equal(body.payload.payload.value, JSON.stringify({ content: 'hello buzz' }));
  assert.equal(body.payload.display.title, 'Share MetaApp');
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Buzz published/);
});

test('Buzz it keeps the new buzz pin id for view-post', async () => {
  const buzzPinId = `${'c'.repeat(64)}i0`;
  const { context } = createContext({
    actionResponse: {
      ok: true,
      data: { pinId: buzzPinId, txid: 'tx-buzz', operation: 'create', path: '/protocols/simplebuzz' },
    },
  });
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(context.state.pendingAppShareBuzzPinId, buzzPinId);
});

test('Buzz it is gated in standalone mode', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.state.runtime = standaloneRuntime();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(requests.length, 0);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
});

test('Buzz it requires a message', async () => {
  const { context, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  const result = await context.confirmAppShareBuzz('   ');
  assert.equal(result, null);
  assert.equal(requests.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: FAIL — `context.openMetaAppShareModal is not a function` / `context.confirmAppShareBuzz is not a function`.

- [ ] **Step 3: Implement the share modal and buzz publisher**

**3a.** Constant — in `packages/ui/src/browser/app.ts`, after the `OFFICIAL_RECOMMENDATIONS` block (around line 141), add:

```js
// Public web gateway used when sharing a MetaApp with web2 users. Matches the
// standalone client router shape /browser/metaapp/<pinId> (app.ts browserUriFromPath).
var METAAPP_SHARE_WEB_BASE_URL = 'https://openagentinternet.org/browser/metaapp/';
```

**3b.** State — in the `state` object, after `appPanelOpen: false,` (added in Task 3), add:

```js
  pendingAppShare: null,
  appShareSending: false,
  pendingAppShareBuzzPinId: '',
```

**3c.** Functions — after `handleAppPanelAction()` from Task 4, add:

```js
function defaultAppShareText(title, uri) {
  return "I found an interesting app '" + title + "' — worth sharing: " + uri;
}

function appShareRowHtml(value) {
  var copyLabel = browserText('appShare.copy', 'Copy');
  return '<div class="browser-app-share-row">' +
    '<code class="browser-app-share-value">' + escapeHtml(value) + '</code>' +
    '<button type="button" class="browser-app-share-copy" data-browser-copy-value="' + escapeHtml(value) + '" aria-label="' + escapeHtml(copyLabel) + '" title="' + escapeHtml(copyLabel) + '">' + iconHtml('copy') + '</button>' +
  '</div>';
}

function openMetaAppShareModal() {
  var record = currentMetaAppRecord();
  var pinId = currentMetaAppPinId();
  if (!record || !pinId) {
    setStatus('error', 'MetaApp pin is missing.');
    return;
  }
  var title = metaAppRecordTitle(record);
  var appUri = metaAppHref(pinId);
  var webUrl = METAAPP_SHARE_WEB_BASE_URL + encodeURIComponent(pinId);
  state.pendingAppShare = { pinId: pinId, uri: appUri, title: title };
  renderModal(
    browserText('appShare.title', 'Share MetaApp'),
    '<div class="browser-app-share-rows">' +
      appShareRowHtml(webUrl) +
      appShareRowHtml(appUri) +
    '</div>' +
    '<textarea data-browser-app-share-message rows="3" placeholder="' + escapeHtml(browserText('appShare.messagePlaceholder', 'Say something about this app...')) + '">' + escapeHtml(defaultAppShareText(title, appUri)) + '</textarea>',
    browserText('appShare.buzzIt', 'Buzz it'),
    'app-share-buzz'
  );
}

async function confirmAppShareBuzz(messageText) {
  var pending = state.pendingAppShare;
  var content = textValue(messageText);
  if (!pending || !content) {
    setStatus('error', 'Message is required.');
    return null;
  }
  if (isStandaloneHostRuntime()) {
    openStandaloneUnsupportedModal();
    return null;
  }
  // Debounce: the on-chain publish can be slow, so ignore repeat clicks while a
  // publish is in flight (the Buzz it button is also disabled).
  if (state.appShareSending) {
    return null;
  }
  setAppShareSending(true);
  try {
    var result = await commandApi(endpointWithActor(browserEndpoints.actions), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceUri: pending.uri,
        kind: 'metaid-pin-write',
        payload: {
          operation: 'create',
          path: '/protocols/simplebuzz',
          encryption: '0',
          version: '1.0.0',
          contentType: 'application/json;utf-8',
          payload: { encoding: 'utf8', value: JSON.stringify({ content: content }) },
          display: { title: 'Share MetaApp', summary: content.slice(0, 80) }
        }
      })
    });
    state.appShareSending = false;
    setStatus('sent', '');
    showAppShareBuzzSentModal(result);
    return result;
  } catch (err) {
    setAppShareSending(false);
    var failMessage = textValue(err && err.message) ||
      browserText('appShare.sendFailed', 'Failed to publish the buzz. Please try again.');
    setAppShareStatus('error', failMessage);
    setStatus('error', failMessage);
    return null;
  }
}

// Busy-state toggle for the Buzz it button, mirroring setPrivateChatSending.
function setAppShareSending(sending) {
  state.appShareSending = sending;
  var root = elements.modalRoot;
  var canQuery = root && typeof root.querySelector === 'function';
  var confirmBtn = canQuery ? root.querySelector('[data-browser-modal-confirm]') : null;
  if (sending) {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.classList.add('is-busy');
      confirmBtn.textContent = browserText('appShare.sending', 'Publishing...');
    }
    setAppShareStatus('sending',
      browserText('appShare.sendingHint', 'Publishing buzz... please wait.'));
  } else if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.classList.remove('is-busy');
    confirmBtn.textContent = browserText('appShare.buzzIt', 'Buzz it');
  }
}

// Status note at the bottom of the share modal, mirroring setPrivateChatStatus.
function setAppShareStatus(tone, message) {
  var root = elements.modalRoot;
  if (!root || typeof root.querySelector !== 'function') return;
  var body = root.querySelector('.browser-modal-body');
  if (!body) return;
  var note = body.querySelector('[data-browser-app-share-status]');
  if (!note && typeof document !== 'undefined' && document.createElement) {
    note = document.createElement('p');
    note.className = 'browser-app-share-status';
    note.setAttribute('data-browser-app-share-status', '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    body.appendChild(note);
  }
  if (note) {
    note.className = 'browser-app-share-status is-' + tone;
    note.textContent = message;
  }
}

function showAppShareBuzzSentModal(result) {
  state.pendingAppShareBuzzPinId = textValue(result && result.pinId);
  renderModal(
    browserText('appShare.sentTitle', 'Buzz published'),
    '<p>' + escapeHtml(browserText('appShare.sentBody', 'Your buzz has been published.')) + '</p>',
    browserText('appShare.viewPost', 'View post'),
    'app-share-view-post',
    {
      cancelLabel: browserText('modal.close', 'Close')
    }
  );
}

function openAppShareBuzzPost() {
  var buzzPinId = textValue(state.pendingAppShareBuzzPinId);
  closeModal();
  var href = pinHref(buzzPinId);
  if (href) return navigateTo(href);
  return Promise.resolve();
}
```

**3d.** `closeModal()` reset — in `closeModal()` (app.ts:3678-3691), add three lines after `state.pendingServiceCall = null;`:

```js
  state.pendingAppShare = null;
  state.appShareSending = false;
  state.pendingAppShareBuzzPinId = '';
```

**3e.** Modal dispatch — in the `modalRoot` click delegation inside `initialize()`, after the `view-conversation` block (app.ts:5848-5851), add:

```js
      if (action === 'app-share-buzz') {
        var shareInput = elements.modalRoot.querySelector('[data-browser-app-share-message]');
        confirmAppShareBuzz(shareInput ? shareInput.value : '');
        return;
      }
      if (action === 'app-share-view-post') {
        openAppShareBuzzPost();
        return;
      }
```

The copy buttons need no new wiring: `handleCopyValue` (app.ts:5677) already handles `data-browser-copy-value` inside the modalRoot delegation and shows the "copied" toast.

**3f.** Exports — in the export block (after `globalThis.handleAppPanelAction` from Task 4), add:

```js
globalThis.openMetaAppShareModal = openMetaAppShareModal;
globalThis.confirmAppShareBuzz = confirmAppShareBuzz;
globalThis.openAppShareBuzzPost = openAppShareBuzzPost;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit + buzz journal**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageActions.test.mjs
git commit -m "feat: add MetaApp share modal with buzz publishing"
printf '%s' '{"content":"Agent Browser Core dev journal: the MetaApp panel Share action now opens a share modal with copyable openagentinternet.org and metaapp:// links, plus an editable buzz composer whose Buzz it button publishes a simplebuzz through the current actor bot by reusing the metaid-pin-write trusted action (no new contract surface). Standalone web mode gets the standard unsupported modal; success lands on a published modal that can jump to the new buzz pin. Covered by payload-shape and gating tests."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 6: Remix action bridged to the host

**Files:**
- Test: `tests/ui/browserPageActions.test.mjs` (append)
- Modify: `packages/ui/src/browser/app.ts` — after Task-5 block

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/browserPageActions.test.mjs`:

```js
test('Remix opens the unsupported modal when the host lacks the remix feature', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  await context.requestMetaAppRemix();
  assert.equal(requests.length, 0);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
});

test('Remix posts the metaapp-remix trusted action with the current pinId', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.state.runtime.features.remix = true;
  await context.requestMetaAppRemix();
  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.kind, 'metaapp-remix');
  assert.equal(body.resourceUri, `metaapp://${METAAPP_PIN_ID}`);
  assert.deepEqual(body.payload, { pinId: METAAPP_PIN_ID });
  assert.match(nodes['[data-browser-toast]'].textContent, /Remix request sent to the host/);
});

test('Remix surfaces host failures as a toast', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: { ok: false, state: 'failed', code: 'remix_failed', message: 'remix broke' },
  });
  context.state.current = metaAppCurrent();
  context.state.runtime.features.remix = true;
  const result = await context.requestMetaAppRemix();
  assert.equal(result, null);
  assert.equal(requests.length, 1);
  assert.match(nodes['[data-browser-toast]'].textContent, /remix broke/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: FAIL — `context.requestMetaAppRemix is not a function`.

- [ ] **Step 3: Implement the remix action**

In `packages/ui/src/browser/app.ts`, after `openAppShareBuzzPost()` from Task 5, add:

```js
// Remix = host-driven re-editing of the current MetaApp. The browser only
// bridges the intent (kind + pinId); the host owns the whole remix UX, so a
// success result never navigates browser-side (the safe-href allowlist in
// safeTrustedActionHref only covers /ui/bot and /ui/conversations anyway).
async function requestMetaAppRemix() {
  var pinId = currentMetaAppPinId();
  if (!pinId) {
    setStatus('error', 'MetaApp pin is missing.');
    return null;
  }
  if (runtimeFeatures().remix !== true) {
    openStandaloneUnsupportedModal();
    return null;
  }
  try {
    var result = await commandApi(endpointWithActor(browserEndpoints.actions), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceUri: currentResourceUri(),
        kind: 'metaapp-remix',
        payload: { pinId: pinId }
      })
    });
    setStatus('remix-requested', '');
    showToast(browserText('remix.requestSent', 'Remix request sent to the host.'));
    return result;
  } catch (err) {
    var failMessage = textValue(err && err.message) ||
      browserText('remix.failed', 'Remix request failed.');
    showToast(failMessage);
    setStatus('error', failMessage);
    return null;
  }
}
```

Then add the export — in the export block (after `globalThis.openAppShareBuzzPost` from Task 5):

```js
globalThis.requestMetaAppRemix = requestMetaAppRemix;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build:esm && node --test tests/ui/browserPageActions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit + buzz journal**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageActions.test.mjs
git commit -m "feat: add MetaApp remix action bridged to hosts"
printf '%s' '{"content":"Agent Browser Core dev journal: the MetaApp panel Remix action is wired end to end: gated on the new features.remix flag, it posts a metaapp-remix trusted action carrying the current pinId (resourceUri rides along per the contract), toasts on success, and surfaces host failures. Hosts own the entire remix UX; the browser deliberately never navigates on the result. Unsupported hosts and standalone get the standard web-version modal."}' > /tmp/abc-buzz.json
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/abc-buzz.json
```

---

### Task 7: Full verification + manual smoke

**Files:** none (verification only; fix-forward if something surfaces)

- [ ] **Step 1: Full build + test suite**

Run: `npm test`
Expected: build succeeds; ALL tests PASS (ui, host-contract, host-standalone, core, package, release, renderers, browser).

- [ ] **Step 2: Packaging checks**

Run: `npm run verify:packages`
Expected: PASS (host-contract/ui package surface changed; conformance must stay green).

- [ ] **Step 3: Manual smoke (standalone)**

Run: `npm run dev:standalone -- --port 8787`, then in a real browser:
1. Visit `http://127.0.0.1:8787/browser/metaapp/765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0` (the official A/I YellowPaper app from `OFFICIAL_RECOMMENDATIONS`).
2. Expect: address-bar shows the app icon; clicking it opens the panel with title/version/updated; Share/Remix/View-pin enabled.
3. Share modal: both copy buttons toast "copied"; Buzz it opens the standalone unsupported modal.
4. Remix opens the same unsupported modal.
5. View pin navigates to the pin-inspector page.
6. Navigate to a `metaid://` bot page: the address icon is back to the plain link glyph and not clickable.

- [ ] **Step 4: Fix-forward if needed, then final commit**

Only if smoke reveals issues: fix, re-run `npm test`, and commit as `fix: <description>` (plus the buzz journal). Otherwise nothing to commit — report done.

---

## Self-review notes (already applied)

- Spec coverage: address icon (Task 3), panel + degradation + view-pin (Task 4), share modal + buzz via `metaid-pin-write` (Task 5), remix via `metaapp-remix` + `features.remix` (Tasks 1, 2, 6), icons (Task 3c), dark theme (Task 4d), standalone gating (Tasks 2, 5, 6), test-harness kind list (Task 1).
- Deliberate spec deviation, approved by simplification: Remix success never navigates browser-side — `safeTrustedActionHref` (app.ts:2440-2456) only allows `/ui/bot` and `/ui/conversations`, and hosts drive their own remix UI; the UI toasts instead. The spec has been updated to match.
- Name consistency across tasks: `currentMetaAppRecord`, `metaAppRecordTitle`, `metaAppIconUrl`, `appIconHtml`, `formatAppUpdatedAt`, `renderAddressIcon`, `renderAppPanel`, `openAppPanel`/`closeAppPanel`/`toggleAppPanel`, `handleAppPanelAction`, `openMetaAppShareModal`, `defaultAppShareText`, `appShareRowHtml`, `confirmAppShareBuzz`, `setAppShareSending`, `setAppShareStatus`, `showAppShareBuzzSentModal`, `openAppShareBuzzPost`, `requestMetaAppRemix`, `METAAPP_SHARE_WEB_BASE_URL`, state fields `appPanelOpen`, `pendingAppShare`, `appShareSending`, `pendingAppShareBuzzPinId`.
