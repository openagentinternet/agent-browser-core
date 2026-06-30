# Custom Homepage Navigation Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow iframe-to-ABC navigation bridge so custom Bot homepages rendered as MetaApp or Metafile HTML can open `metaid://`, `pin://`, `metaapp://`, `metafile://`, and `map://` resources inside Agent Browser Core.

**Architecture:** Keep built-in Bot Page navigation unchanged. Add a parent-page `message` listener in the Browser UI scripts that accepts only `agent-browser:navigate` messages from the currently rendered `iframe.browser-html-frame`, validates the URI scheme, and reuses the existing `navigateTo(uri)` path. Document the supported authoring pattern with an inline helper snippet for static custom homepage creators.

**Tech Stack:** TypeScript workspace, generated Browser UI scripts, Node test runner, VM-based UI tests, Markdown docs.

---

## Scope Check

This is one focused subsystem: custom homepage navigation. It does not add wallet capabilities,
change MetaApp preview caching, change Metafile renderer selection, or rewrite user ZIP content.

## File Structure

- Modify `packages/ui/src/browserClientScript.ts`: production Browser page bridge helper and message listener.
- Modify `packages/ui/src/browser/app.ts`: test/debug Browser script bridge helper and exported helpers.
- Modify `tests/ui/browserInteractions.test.mjs`: script-level assertions that the generated client includes the bridge and still compiles.
- Modify `tests/ui/browserPageRenderers.test.mjs`: VM behavior tests for active iframe source validation and URI scheme filtering.
- Create `docs/custom-bot-homepage-metaapp-guide.md`: public guide for Bot owners and coding agents.

## Task 1: Add Failing Bridge Tests

**Files:**
- Modify: `tests/ui/browserInteractions.test.mjs`
- Modify: `tests/ui/browserPageRenderers.test.mjs`

- [ ] **Step 1: Add script-level assertions for the production client**

In `tests/ui/browserInteractions.test.mjs`, add this test after `generated client script compiles`:

```js
test('client script includes custom homepage iframe navigation bridge', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function isBrowserInternalHref\(value\)/);
  assert.match(script, /function currentBrowserHtmlFrameWindow\(\)/);
  assert.match(script, /function handleBrowserBridgeMessage\(event\)/);
  assert.match(script, /agent-browser:navigate/);
  assert.match(script, /window\.addEventListener\('message', handleBrowserBridgeMessage\)/);
  assert.match(script, /event\.source !== sourceWindow/);
  assert.match(script, /navigateTo\(uri\)\.catch\(\(\) => \{\}\)/);
});
```

- [ ] **Step 2: Extend the VM fake element so tests can expose an active iframe**

In `tests/ui/browserPageRenderers.test.mjs`, replace the `FakeElement` class with this version:

```js
class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.attrs = {};
    this.listeners = new Map();
    this.childrenBySelector = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  querySelector(selector) { return this.childrenBySelector.get(selector) || null; }
  setChild(selector, value) { this.childrenBySelector.set(selector, value); }
}
```

- [ ] **Step 3: Capture window message listeners in the VM setup**

In `tests/ui/browserPageRenderers.test.mjs`, update `runWithResolve()` so the returned object includes `windowListeners`.

Replace the start of `runWithResolve()` through the `window` object with:

```js
function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
  const fetchCalls = [];
  const windowListeners = new Map();
  const infoProfiles = options.infoProfiles || {};
  const context = {
    console,
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Promise,
    String,
    Error,
    setTimeout,
    clearTimeout,
    window: {
      location: { search: '?uri=metaid%3A%2F%2Fidq1fixturebot' },
      history: { replaceState() {} },
      addEventListener(eventName, handler) { windowListeners.set(eventName, handler); },
    },
```

Then replace the return line:

```js
  return { context, nodes, fetchCalls };
```

with:

```js
  return { context, nodes, fetchCalls, windowListeners };
```

- [ ] **Step 4: Add behavior coverage for active iframe bridge navigation**

In `tests/ui/browserPageRenderers.test.mjs`, add this test after `html-iframe renderer is sandboxed without privileged permissions`:

```js
test('html-iframe navigation bridge accepts only active iframe internal URI messages', async () => {
  const targetUri = `pin://${servicePinId}`;
  const activeFrameWindow = {};
  const inactiveFrameWindow = {};
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  nodes['[data-browser-viewport]'].setChild('iframe.browser-html-frame', { contentWindow: activeFrameWindow });

  const listener = windowListeners.get('message');
  assert.equal(typeof listener, 'function');

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: targetUri },
    source: inactiveFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes(`uri=${encodeURIComponent(targetUri)}`)), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: 'https://example.com' },
    source: activeFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes('https%3A%2F%2Fexample.com')), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: 'javascript:alert(1)' },
    source: activeFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes('javascript%3Aalert')), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: targetUri },
    source: activeFrameWindow,
  });
  await waitFor(
    () => fetchCalls.some((url) => String(url).includes(`uri=${encodeURIComponent(targetUri)}`)),
    'bridge navigation resolve',
  );
});
```

- [ ] **Step 5: Run the targeted tests and verify they fail**

Run:

```bash
npm run build && node --test tests/ui/browserInteractions.test.mjs tests/ui/browserPageRenderers.test.mjs
```

Expected: FAIL. The failures should show that `currentBrowserHtmlFrameWindow`, `handleBrowserBridgeMessage`, or the `message` listener does not exist yet.

- [ ] **Step 6: Keep the red test changes uncommitted**

Do not commit the failing tests by themselves. This repo requires relevant checks to pass before
each commit. Leave the test edits in the worktree and continue to Task 2.

## Task 2: Implement the Navigation Bridge

**Files:**
- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `packages/ui/src/browser/app.ts`

- [ ] **Step 1: Add bridge helpers to the production client script**

In `packages/ui/src/browserClientScript.ts`, insert this block immediately after `function isBrowserInternalHref(value) { ... }`:

```js
  function currentBrowserHtmlFrameWindow() {
    const frame = viewport && viewport.querySelector ? viewport.querySelector('iframe.browser-html-frame') : null;
    return frame && frame.contentWindow ? frame.contentWindow : null;
  }
  function handleBrowserBridgeMessage(event) {
    const data = event && event.data && typeof event.data === 'object' ? event.data : null;
    if (!data || data.type !== 'agent-browser:navigate' || data.version !== 1) return;
    const uri = textValue(data.uri);
    if (!isBrowserInternalHref(uri)) return;
    const sourceWindow = currentBrowserHtmlFrameWindow();
    if (!sourceWindow || event.source !== sourceWindow) return;
    navigateTo(uri).catch(() => {});
  }
```

- [ ] **Step 2: Register the production message listener**

In `packages/ui/src/browserClientScript.ts`, insert this block just before the existing `if (form) {` submit listener:

```js
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('message', handleBrowserBridgeMessage);
  }
```

- [ ] **Step 3: Add bridge helpers to the Browser page definition script**

In `packages/ui/src/browser/app.ts`, insert this block immediately after `function isBrowserInternalHref(value) { ... }`:

```js
function currentBrowserHtmlFrameWindow() {
  var frame = elements.viewport && elements.viewport.querySelector
    ? elements.viewport.querySelector('iframe.browser-html-frame')
    : null;
  return frame && frame.contentWindow ? frame.contentWindow : null;
}

function handleBrowserBridgeMessage(event) {
  var data = event && event.data && typeof event.data === 'object' ? event.data : null;
  if (!data || data.type !== 'agent-browser:navigate' || data.version !== 1) return;
  var uri = textValue(data.uri);
  if (!isBrowserInternalHref(uri)) return;
  var sourceWindow = currentBrowserHtmlFrameWindow();
  if (!sourceWindow || event.source !== sourceWindow) return;
  navigateTo(uri);
}
```

- [ ] **Step 4: Register the Browser page definition message listener**

In `packages/ui/src/browser/app.ts`, inside `initialize()`, insert this block after `bindElements();`:

```js
  if (!state.bridgeMessageListenerBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', handleBrowserBridgeMessage);
    state.bridgeMessageListenerBound = true;
  }
```

Add this field to the initial `state` object:

```js
  bridgeMessageListenerBound: false,
```

- [ ] **Step 5: Export debug helpers from the Browser page definition script**

In `packages/ui/src/browser/app.ts`, near the existing `globalThis.navigateTo = navigateTo;` exports, add:

```js
globalThis.currentBrowserHtmlFrameWindow = currentBrowserHtmlFrameWindow;
globalThis.handleBrowserBridgeMessage = handleBrowserBridgeMessage;
```

- [ ] **Step 6: Run the targeted tests and verify they pass**

Run:

```bash
npm run build && node --test tests/ui/browserInteractions.test.mjs tests/ui/browserPageRenderers.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the passing tests and implementation together**

Run:

```bash
git add tests/ui/browserInteractions.test.mjs tests/ui/browserPageRenderers.test.mjs packages/ui/src/browserClientScript.ts packages/ui/src/browser/app.ts
git commit -m "feat: add custom homepage navigation bridge"
```

- [ ] **Step 8: Post the Bob development journal for the implementation commit**

Run:

```bash
REQUEST_FILE=$(mktemp /tmp/abc-bridge-implementation-buzz.XXXXXX.json)
node -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({content:'Development journal: implemented the ABC custom homepage navigation bridge with tests. Added UI coverage for generated client-script wiring and active iframe source validation, then implemented the parent-page agent-browser:navigate listener for metaid://, pin://, metaapp://, metafile://, and map:// navigation without exposing wallet or host adapter capabilities.'}, null, 2));" "$REQUEST_FILE"
$HOME/.metabot/bin/metabot buzz post --from bob --request-file "$REQUEST_FILE"
```

Expected: JSON response with `"ok": true`.

## Task 3: Add the Custom Homepage Authoring Guide

**Files:**
- Create: `docs/custom-bot-homepage-metaapp-guide.md`

- [ ] **Step 1: Create the guide**

Create `docs/custom-bot-homepage-metaapp-guide.md` with this content:

````markdown
# Custom Bot Homepage MetaApp Guide

Custom Bot homepages let a Bot replace the built-in Bot Page template with a MetaApp or Metafile
declared in `/info/homepage`. The recommended rich homepage format is a ZIP-backed static MetaApp:
HTML, CSS, JavaScript, and assets packaged on chain and rendered by Agent Browser Core.

## Link Model

Agent Internet resources should use Agent Internet URIs instead of Web2 URLs:

```text
metaid://{globalMetaIdOrAlias}
pin://{pinId}
pin://{pinId}?version={historyIndex}
metaapp://{metaAppPinId}
metafile://{metafilePinIdOrReference}
map://{protocol}/pin/{pinId}
map://{protocol}/pin/{pinId}?version={historyIndex}
map://simplemsg/conversation?peer={globalMetaId}
```

Use `https://` only for normal external web pages, not for Agent Internet resources that already
have a MetaID URI.

## Static Links

Write normal anchors:

```html
<a href="metaid://idq1example">Open Bot Page</a>
<a href="pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0">Open PIN</a>
<a href="metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0">Open MetaApp</a>
```

Inside a custom homepage iframe, include the helper below so those links navigate inside ABC.

## Navigation Helper

Paste this script near the end of `body`:

```html
<script>
  window.AgentBrowser = window.AgentBrowser || {
    navigate: function (uri) {
      window.parent.postMessage({
        type: 'agent-browser:navigate',
        version: 1,
        uri: String(uri || '')
      }, '*');
    }
  };

  document.addEventListener('click', function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest('a[href]') : null;
    if (!link) return;

    var href = link.getAttribute('href') || '';
    if (!/^(metaid|pin|metaapp|metafile|map):\/\//i.test(href)) return;

    event.preventDefault();
    window.AgentBrowser.navigate(href);
  });
</script>
```

JavaScript UI can navigate directly:

```html
<button type="button" id="open-profile">Open Profile</button>
<script>
  document.getElementById('open-profile').addEventListener('click', function () {
    window.AgentBrowser.navigate('metaid://idq1example');
  });
</script>
```

## Built-In Templates Versus Custom Iframes

Built-in Bot Page templates are rendered directly in the ABC page. They can use
`data-browser-map-link` because their clicks happen in the same document as the Browser shell.

Custom MetaApp and HTML Metafile homepages run inside a sandboxed iframe. Clicks inside that iframe
do not bubble to the parent Browser page, so custom pages should use the `AgentBrowser.navigate`
helper.

## Coding Agent Prompt

Use this prompt when asking Codex or another coding agent to build a custom Bot homepage:

```text
Build a static ZIP-ready custom Bot homepage for Agent Browser Core. Use Agent Internet URI links
instead of Web2 URLs for ecosystem resources. Include the AgentBrowser navigation helper exactly
once near the end of body. All links to Bot Pages, pins, MetaApps, Metafiles, and MAP resources
must use metaid://, pin://, metaapp://, metafile://, or map://. For JavaScript-driven buttons,
call window.AgentBrowser.navigate(uri). Do not request wallet, signing, payment, local file, or
host adapter access from inside the page.
```

## Security Boundary

The navigation bridge only opens Browser resources. It does not provide wallet APIs, signing,
payment, write-chain actions, local files, local storage, or parent DOM access to custom homepage
content.
````

- [ ] **Step 2: Verify Markdown syntax and whitespace**

Run:

```bash
git diff --check -- docs/custom-bot-homepage-metaapp-guide.md
```

Expected: PASS.

- [ ] **Step 3: Commit the guide**

Run:

```bash
git add docs/custom-bot-homepage-metaapp-guide.md
git commit -m "docs: add custom homepage authoring guide"
```

- [ ] **Step 4: Post the Bob development journal for the guide commit**

Run:

```bash
REQUEST_FILE=$(mktemp /tmp/abc-bridge-guide-buzz.XXXXXX.json)
node -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({content:'Development journal: documented the custom Bot homepage MetaApp authoring guide. The guide explains supported Agent Internet URI formats, static anchor usage, the AgentBrowser.navigate helper, JavaScript-driven navigation, built-in template versus iframe behavior, and the security boundary that the bridge only performs navigation.'}, null, 2));" "$REQUEST_FILE"
$HOME/.metabot/bin/metabot buzz post --from bob --request-file "$REQUEST_FILE"
```

Expected: JSON response with `"ok": true`.

## Task 4: Final Verification And Closeout

**Files:**
- Verify: all files changed by Tasks 1-3

- [ ] **Step 1: Run targeted UI verification**

Run:

```bash
npm run build && node --test tests/ui/browserInteractions.test.mjs tests/ui/browserPageRenderers.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 3: Check the final diff**

Run:

```bash
git status --short --branch
git diff --stat HEAD~2..HEAD
```

Expected:

- current branch is `main`;
- no unintended staged changes remain;
- unrelated pre-existing dirty files, if any, are not included in these commits;
- the two bridge-related implementation commits are present.
