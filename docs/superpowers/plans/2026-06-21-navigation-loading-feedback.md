# Navigation Loading Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediate loading feedback to Agent Browser navigation — when a `metaid://` link is clicked, the viewport clears instantly to a structural skeleton, the reload button becomes a spinner, and resolved content fades in.

**Architecture:** Pure front-end change confined to `packages/ui/src/browser/`. Two files: `indexHtml.ts` gets three new CSS blocks (skeleton+shimmer, reload spinner, fade-in); `app.ts` gets three new helper functions (`skeletonHtml`, `showLoadingState`, `clearLoadingState`) wired into the existing `resolveUri` lifecycle, plus a fade-in trigger in `renderCurrent`. No server-side, resolver, or cache changes.

**Tech Stack:** TypeScript workspace, inline HTML string template (`BROWSER_INDEX_HTML`), inline client script string (`definition.script`), `node --test` with string/regex assertions against compiled `dist/index.js`.

**Spec:** `docs/superpowers/specs/2026-06-21-navigation-loading-feedback-design.md`

**Worktree:** This plan executes inside `.worktrees/perf-optimization` on branch `perf/optimization`.

---

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `packages/ui/src/browser/indexHtml.ts` | The inlined HTML shell string `BROWSER_INDEX_HTML`, including all `<style>` CSS | Append 3 CSS blocks before `</style>` |
| `packages/ui/src/browser/app.ts` | The served client script (string), including `resolveUri`, `renderCurrent`, `state`, `elements` | Add 3 helpers + wire loading lifecycle + fade-in trigger |
| `tests/ui/browserPage.test.mjs` | String/regex assertions against compiled UI output | Add 4 test cases for skeleton/spinner/fade-in presence |

All paths are relative to the worktree root `.worktrees/perf-optimization`.

---

## Task 1: Add skeleton + shimmer CSS

**Files:**
- Modify: `packages/ui/src/browser/indexHtml.ts`

The `BROWSER_INDEX_HTML` constant is a single JS string literal with `\n` escapes. The `<style>` block ends with the `@media (max-width: 520px)` rule block, then `</style>`. We append the skeleton CSS immediately before `</style>`.

- [ ] **Step 1: Locate the insertion point**

The string to match (the closing of the 520px media query + the `</style>` tag) is unique. Run this to confirm it appears exactly once:

```bash
grep -c 'width: min(340px, calc(100vw - 20px));\\n        }\\n      }\\n    </style>' packages/ui/src/browser/indexHtml.ts
```

Expected output: `1`

- [ ] **Step 2: Append the skeleton + shimmer CSS**

In `packages/ui/src/browser/indexHtml.ts`, find this exact substring (the end of the 520px media query block and the closing `</style>`):

```
        .browser-drawer,
        .browser-inspector,
        .browser-shell.has-drawer .browser-inspector {
          top: 0;
          bottom: 0;
          width: min(340px, calc(100vw - 20px));
        }
      }
    </style>
```

Replace it with the same content but with the skeleton CSS inserted between `}` (end of media query) and `</style>`:

```
        .browser-drawer,
        .browser-inspector,
        .browser-shell.has-drawer .browser-inspector {
          top: 0;
          bottom: 0;
          width: min(340px, calc(100vw - 20px));
        }
      }
      .browser-skeleton {
        width: min(900px, calc(100% - 48px));
        margin: 30px auto 40px;
        border: 1px solid var(--browser-border);
        border-radius: var(--browser-radius);
        background: var(--browser-surface);
        box-shadow: 0 1px 2px rgba(31, 41, 55, .05);
        display: grid;
        gap: 28px;
        align-content: start;
        padding: 36px 38px;
      }
      .browser-skeleton-hero {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        align-items: start;
        gap: 18px;
        min-width: 0;
      }
      .browser-skeleton-avatar {
        width: 72px;
        height: 72px;
        border-radius: 14px;
      }
      .browser-skeleton-identity {
        min-width: 0;
        display: grid;
        gap: 7px;
        padding-top: 4px;
      }
      .browser-skeleton-section {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .browser-skeleton-row {
        min-width: 0;
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 11px;
        border-top: 1px solid #edf1f6;
        padding: 10px 0;
      }
      .browser-skeleton-rowicon {
        width: 34px;
        height: 34px;
        border-radius: 7px;
      }
      .browser-skeleton-rowbars {
        min-width: 0;
        display: grid;
        gap: 5px;
      }
      .browser-skeleton-line {
        height: 10px;
        border-radius: 4px;
        width: 100%;
      }
      .browser-skeleton-line.browser-skeleton-title {
        width: 45%;
        height: 22px;
      }
      .browser-skeleton-line.browser-skeleton-subtitle {
        width: 32%;
        height: 10px;
      }
      .browser-skeleton-line.browser-skeleton-summary {
        width: 75%;
      }
      .browser-skeleton-line.browser-skeleton-heading {
        width: 90px;
        height: 16px;
      }
      .browser-skeleton-line.w70 { width: 70%; }
      .browser-skeleton-line.w60 { width: 60%; }
      .browser-skeleton-line.w50 { width: 50%; }
      .browser-skeleton-line.w45 { width: 45%; }
      .browser-skeleton-avatar,
      .browser-skeleton-line,
      .browser-skeleton-rowicon {
        background: linear-gradient(90deg, #eaeef5 25%, #f4f6fb 50%, #eaeef5 75%);
        background-size: 200% 100%;
        animation: browser-shimmer 1.4s ease-in-out infinite;
      }
      @keyframes browser-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    </style>
```

The skeleton geometry deliberately matches `.browser-bot-page` (page width `min(900px, calc(100% - 48px))`, padding `36px 38px`, gap `28px`) and `.browser-bot-header` (avatar `72px`, `grid-template-columns: 76px minmax(0, 1fr)`, gap `18px`) so the skeleton→content swap does not cause layout shift.

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build:esm`
Expected: exits 0, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/indexHtml.ts
git commit -m "feat: add navigation skeleton and shimmer CSS"
```

---

## Task 2: Add reload-button spinner and content fade-in CSS

**Files:**
- Modify: `packages/ui/src/browser/indexHtml.ts`

- [ ] **Step 1: Append spinner + fade-in CSS after the skeleton CSS**

In `packages/ui/src/browser/indexHtml.ts`, find the `@keyframes browser-shimmer` block you just added (end of Task 1):

```
      @keyframes browser-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    </style>
```

Replace it with the shimmer keyframes plus the two new CSS blocks:

```
      @keyframes browser-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .browser-icon-button.is-loading {
        position: relative;
        color: transparent;
        cursor: progress;
        pointer-events: none;
      }
      .browser-icon-button.is-loading > svg {
        opacity: 0;
      }
      .browser-icon-button.is-loading::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        width: 16px;
        height: 16px;
        margin: -8px 0 0 -8px;
        border: 2px solid var(--browser-accent);
        border-top-color: transparent;
        border-radius: 50%;
        animation: browser-spin .8s linear infinite;
      }
      @keyframes browser-spin {
        to { transform: rotate(360deg); }
      }
      .browser-viewport.is-entering > * {
        animation: browser-enter .3s ease;
      }
      @keyframes browser-enter {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build:esm`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/indexHtml.ts
git commit -m "feat: add reload spinner and content fade-in CSS"
```

---

## Task 3: Add `skeletonHtml()`, `showLoadingState()`, `clearLoadingState()` helpers

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

These are the three new client-script functions. They are plain JS strings inside the `buildBrowserPageScript()` IIFE. Place them near the existing `setStatus` function (around line 490) so all status/loading helpers live together.

- [ ] **Step 1: Add the three helper functions after `setStatus`**

In `packages/ui/src/browser/app.ts`, find the `setStatus` function (lines 490-494):

```js
function setStatus(nextStatus, message) {
  state.status = nextStatus;
  state.error = message || '';
  if (elements.statusState) elements.statusState.textContent = nextStatus;
}
```

Immediately after it, insert the three new functions:

```js
function skeletonHtml() {
  return '<div class="browser-skeleton">' +
    '<header class="browser-skeleton-hero">' +
    '<div class="browser-skeleton-avatar"></div>' +
    '<div class="browser-skeleton-identity">' +
    '<div class="browser-skeleton-line browser-skeleton-title"></div>' +
    '<div class="browser-skeleton-line browser-skeleton-subtitle"></div>' +
    '<div class="browser-skeleton-line browser-skeleton-summary"></div>' +
    '</div></header>' +
    '<section class="browser-skeleton-section">' +
    '<div class="browser-skeleton-line browser-skeleton-heading"></div>' +
    '<div class="browser-skeleton-row"><div class="browser-skeleton-rowicon"></div>' +
    '<div class="browser-skeleton-rowbars"><div class="browser-skeleton-line w70"></div><div class="browser-skeleton-line w45"></div></div></div>' +
    '<div class="browser-skeleton-row"><div class="browser-skeleton-rowicon"></div>' +
    '<div class="browser-skeleton-rowbars"><div class="browser-skeleton-line w60"></div><div class="browser-skeleton-line w50"></div></div></div>' +
    '</section></div>';
}

function showLoadingState() {
  state.loading = true;
  if (elements.viewport) {
    elements.viewport.innerHTML = skeletonHtml();
  }
  if (elements.reload) {
    elements.reload.classList.add('is-loading');
    elements.reload.disabled = true;
  }
}

function clearLoadingState() {
  state.loading = false;
  if (elements.reload) {
    elements.reload.classList.remove('is-loading');
    elements.reload.disabled = false;
  }
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build:esm`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/browser/app.ts
git commit -m "feat: add skeleton and loading-state helpers to client script"
```

---

## Task 4: Wire loading lifecycle into `resolveUri`

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

This is the core wiring. `showLoadingState()` runs synchronously before the `await` (so the viewport changes at click time), and `clearLoadingState()` runs in both the success and catch paths.

- [ ] **Step 1: Add `showLoadingState()` before the await**

In `packages/ui/src/browser/app.ts`, find the start of the `try` block in `resolveUri` (around line 2711):

```js
  state.lastResolveError = null;
  try {
    var result = await api(resolveUrl(normalizedUri));
```

Replace it with `showLoadingState()` added before the await:

```js
  state.lastResolveError = null;
  showLoadingState();
  try {
    var result = await api(resolveUrl(normalizedUri));
```

- [ ] **Step 2: Add `clearLoadingState()` in the success path**

Find the success path (around line 2719-2720):

```js
    setStatus('resolved', '');
    renderCurrent();
    if (state.inspectorOpen) {
      renderInspector();
    }
    return result;
```

Replace it with `clearLoadingState()` added after `renderCurrent()`:

```js
    setStatus('resolved', '');
    renderCurrent();
    clearLoadingState();
    if (state.inspectorOpen) {
      renderInspector();
    }
    return result;
```

- [ ] **Step 3: Add `clearLoadingState()` in the catch path**

Find the catch block start (around line 2725):

```js
  } catch (error) {
    state.lastResolveError = {
      inputUri: normalizedUri,
```

Replace it with `clearLoadingState()` added as the first statement in catch:

```js
  } catch (error) {
    clearLoadingState();
    state.lastResolveError = {
      inputUri: normalizedUri,
```

- [ ] **Step 4: Verify the build still compiles**

Run: `npm run build:esm`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/app.ts
git commit -m "feat: wire loading-state lifecycle into resolveUri"
```

---

## Task 5: Add fade-in trigger to `renderCurrent`

**Files:**
- Modify: `packages/ui/src/browser/app.ts`

After the viewport's `innerHTML` is set, trigger the CSS fade-in animation by toggling the `is-entering` class with a forced reflow so it re-triggers on every navigation.

- [ ] **Step 1: Add `triggerEnterAnimation` helper after `clearLoadingState`**

In `packages/ui/src/browser/app.ts`, find the `clearLoadingState` function added in Task 3:

```js
function clearLoadingState() {
  state.loading = false;
  if (elements.reload) {
    elements.reload.classList.remove('is-loading');
    elements.reload.disabled = false;
  }
}
```

Immediately after it, add:

```js
function triggerEnterAnimation(node) {
  if (!node) return;
  node.classList.remove('is-entering');
  void node.offsetWidth;
  node.classList.add('is-entering');
  window.setTimeout(function () {
    node.classList.remove('is-entering');
  }, 320);
}
```

`void node.offsetWidth` forces a synchronous reflow so the browser commits the class removal before re-adding, which is what lets the animation restart on consecutive navigations rather than only firing once.

- [ ] **Step 2: Call `triggerEnterAnimation` in `renderCurrent`**

Find `renderCurrent` (around line 1195-1197):

```js
  if (elements.viewport) {
    elements.viewport.innerHTML = renderRenderer(current);
  }
```

Replace it with:

```js
  if (elements.viewport) {
    elements.viewport.innerHTML = renderRenderer(current);
    triggerEnterAnimation(elements.viewport);
  }
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build:esm`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/browser/app.ts
git commit -m "feat: trigger content fade-in on render"
```

---

## Task 6: Write tests for skeleton, spinner, and fade-in

**Files:**
- Modify: `tests/ui/browserPage.test.mjs`

The existing tests assert against the compiled `dist/index.js` (via `ui.buildBrowserPageDefinition()` and `ui.renderBrowserPageHtml()`) using `assert.match` with regexes, and against the raw `indexHtml.ts` source for CSS. We follow the same pattern. No behavioral/timing tests (animations aren't observable in string rendering).

- [ ] **Step 1: Write the failing test**

Append the following test cases to the end of `tests/ui/browserPage.test.mjs` (after the last existing `test(...)` block):

```js
test('Browser loading feedback renders skeleton, spinner, and fade-in CSS', async () => {
  const html = await ui.renderBrowserPageHtml();

  assert.match(template, /\.browser-skeleton \{/);
  assert.match(template, /\.browser-skeleton-avatar \{/);
  assert.match(template, /\.browser-skeleton-line\.browser-skeleton-title \{/);
  assert.match(template, /\.browser-skeleton-rowicon,/);
  assert.match(template, /animation: browser-shimmer 1\.4s ease-in-out infinite/);
  assert.match(template, /@keyframes browser-shimmer/);

  assert.match(template, /\.browser-icon-button\.is-loading \{/);
  assert.match(template, /\.browser-icon-button\.is-loading::after \{/);
  assert.match(template, /animation: browser-spin \.8s linear infinite/);
  assert.match(template, /@keyframes browser-spin/);

  assert.match(template, /\.browser-viewport\.is-entering > \*/);
  assert.match(template, /@keyframes browser-enter/);
  assert.match(template, /from \{ opacity: 0; transform: translateY\(6px\); \}/);
});

test('Browser client script exposes loading-state helpers and skeleton markup', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function skeletonHtml\(\)/);
  assert.match(definition.script, /function showLoadingState\(\)/);
  assert.match(definition.script, /function clearLoadingState\(\)/);
  assert.match(definition.script, /function triggerEnterAnimation\(node\)/);

  assert.match(definition.script, /'<div class="browser-skeleton">'/);
  assert.match(definition.script, /browser-skeleton-hero/);
  assert.match(definition.script, /browser-skeleton-avatar/);
  assert.match(definition.script, /browser-skeleton-rowbars/);

  assert.match(definition.script, /state\.loading = true;/);
  assert.match(definition.script, /elements\.reload\.classList\.add\('is-loading'\)/);
  assert.match(definition.script, /elements\.reload\.disabled = true;/);
  assert.match(definition.script, /elements\.reload\.classList\.remove\('is-loading'\)/);
  assert.match(definition.script, /void node\.offsetWidth;/);
  assert.match(definition.script, /triggerEnterAnimation\(elements\.viewport\);/);
});

test('Browser resolveUri wires showLoadingState before await and clearLoadingState in both paths', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /state\.lastResolveError = null;\s*showLoadingState\(\);\s*try \{/);
  assert.match(definition.script, /renderCurrent\(\);\s*clearLoadingState\(\);/);
  assert.match(definition.script, /\} catch \(error\) \{\s*clearLoadingState\(\);/);
});
```

- [ ] **Step 2: Run tests to verify they fail (helpers/CSS not yet present if run before Tasks 1-5)**

Since Tasks 1-5 are already done, these tests should pass. If running this task first, run:

Run: `npm test`
Expected (before Tasks 1-5): the three new tests FAIL with assertion errors (regexes not matching).
Expected (after Tasks 1-5): all tests PASS, including the three new ones.

- [ ] **Step 3: Run the full test suite to confirm green**

Run: `npm test`
Expected: `pass 281` (278 existing + 3 new), `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/browserPage.test.mjs
git commit -m "test: cover skeleton, spinner, and fade-in loading feedback"
```

---

## Task 7: Manual smoke test in the standalone runtime

**Files:** None (manual verification)

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 2: Start the standalone server**

Run: `npm run dev:standalone -- --port 8787`
Expected: server starts, logs a URL like `http://127.0.0.1:8787`.

- [ ] **Step 3: Verify the loading feedback visually**

Open the URL in a browser. Enter a `metaid://` URI and submit, then click a `metaid://` link inside the rendered Bot Page. Verify:

1. **Immediate skeleton** — the viewport clears instantly and shows the shimmer skeleton (hero avatar block + title/subtitle/summary bars + one section with two placeholder rows).
2. **Reload spinner** — the reload button (↻) in the top bar becomes a spinning circle for the duration of the fetch; it is non-clickable while loading.
3. **Content fade-in** — when the Bot Page resolves, the real content fades in over ~300ms (opacity 0→1, slight upward translate) rather than popping in.
4. **Error path** — if a navigation fails (enter an invalid URI), the reload button returns to normal (no stuck spinner) and the error empty-state renders.
5. **No layout shift** — the skeleton's page width, avatar size, and row geometry match the resolved Bot Page, so the fade-in does not jump.

- [ ] **Step 4: Stop the server**

`Ctrl+C` in the terminal running the dev server.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Skeleton CSS (spec touch point #4, Block 1) → Task 1
- [x] Reload spinner CSS (spec touch point #4, Block 2) → Task 2
- [x] Fade-in CSS (spec touch point #4, Block 3) → Task 2
- [x] `skeletonHtml` / `showLoadingState` / `clearLoadingState` (spec touch points #1, #2) → Tasks 3, 4
- [x] `resolveUri` lifecycle wiring, both paths (spec touch point #1) → Task 4
- [x] `triggerEnterAnimation` + `renderCurrent` (spec touch point #3) → Task 5
- [x] Error handling — `clearLoadingState` in catch (spec "Error Handling") → Task 4 Step 3
- [x] Testing (spec "Testing") → Task 6
- [x] Out of scope items explicitly excluded (no resolver/cache changes) → honored, no tasks touch them

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All code blocks complete.

**Type/name consistency:** `skeletonHtml`, `showLoadingState`, `clearLoadingState`, `triggerEnterAnimation`, `state.loading`, `elements.reload`, `.is-loading`, `.is-entering`, `browser-shimmer`/`browser-spin`/`browser-enter` keyframes — all consistent across tasks.

**Layout-shift mitigation:** Skeleton CSS matches `.browser-bot-page` dimensions (Task 1 Step 2 note documents this); verified in Task 7 Step 3.5.
