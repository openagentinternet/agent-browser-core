# Navigation Loading Feedback Design

Date: 2026-06-21
Status: Draft for review

## Goal

Eliminate the "frozen" feeling when a user clicks a `metaid://` link inside a Bot Page. Today,
clicking an internal link leaves the viewport showing the old page with no visual change for the
entire network round trip (hundreds of milliseconds to a few seconds), then swaps in the full new
page in a single `innerHTML` assignment. Users perceive this as sluggish and unresponsive.

This spec adds immediate loading feedback so navigation feels like opening a normal web page: the
viewport clears instantly to a structural skeleton, the reload button becomes a spinner for the
duration of the fetch, and the real content fades in when it arrives.

This spec is intentionally narrow and front-end only. It defines:

- a structural skeleton rendered into the viewport at the moment of navigation;
- a spinner state on the reload button during resolution;
- a fade-in transition when the resolved content is painted;
- the exact touch points in the served client script and stylesheet.

It does **not** touch the server-side resolution chain (`browserResolver.ts`), the host adapters, or
any caching. Those are out of scope and belong to a separate effort.

## Background

The served Browser client script is `packages/ui/src/browser/app.ts` (exported via
`buildBrowserPageDefinition()` → `renderBrowserPageHtml()`, consumed by the standalone host
`packages/host-standalone/src/server.ts:22`). A second, parallel implementation
(`packages/ui/src/browserClientScript.ts`) exists but is **not** on the live path; it must not be
edited for this change.

The navigation flow today (`app.ts:2700-2720`, `resolveUri`):

1. `setStatus('loading', '')` — the only feedback: updates the 32px bottom status strip text.
2. `await api(resolveUrl(uri))` — blocks for the whole network round trip. During this `await`,
   the viewport is untouched and continues to show the previous page.
3. `renderCurrent()` — assigns the entire rendered HTML in one shot:
   `elements.viewport.innerHTML = renderRenderer(current)` (`app.ts:1196`).

There is no skeleton, no opacity change, no spinner on the chrome, and no transition on content
arrival. The perceived result is "click → nothing → whole page pops in".

Three factors compound this, but only the first is in scope for this change:

1. **No viewport feedback during the fetch** — the dominant perceptual problem. In scope.
2. **Server-side serial fetches** (homepage → per-peer `enrichHomepageChats` → optional MetaApp
   ZIP). Out of scope.
3. **All-at-once `innerHTML` swap with no transition.** The fade-in defined here softens this.

## Design Decisions (from brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Front-end only; no server/cache changes | Highest perceived gain per unit of risk |
| 2 | Transition style: clear viewport to skeleton | Closest to "opening a normal web page" |
| 3 | Skeleton detail: structural (hero + one section) | Matches the default `document` template structure without locking in a specific row count or guessing the template |
| 4 | Spinner location: reload button turns into a spinner | The universal browser convention (Chrome/Safari/Firefox); reuses an existing button, zero new layout |
| 5 | Settlement: resolved content fades in over 300ms | Removes the hard "pop", matches the "content materializes" feel the user asked for |
| 6 | Skeleton timing: synchronous, immediate (no delay) | Maximum responsiveness; the user explicitly objected to "click → no reaction" |

## Touch Points

All changes are confined to two files in `packages/ui/src/browser/`.

### 1. `app.ts` — loading-state lifecycle in `resolveUri`

`resolveUri` (`app.ts:2700-2743`) gains a paired `showLoadingState()` / `clearLoadingState()`
lifecycle wrapped around the existing `await`. The skeleton is rendered **before** the `await`, so
the viewport changes at click time (t=0).

```text
async function resolveUri(uri, options) {
  // ... existing normalization, pushHistory ...
  setStatus('loading', '');
  state.lastResolveError = null;
  showLoadingState();                          // NEW: synchronous, before await
  try {
    var result = await api(resolveUrl(uri));   // existing fetch (unchanged)
    // ... existing state.current / recordVisit / setStatus('resolved') ...
    renderCurrent();                           // existing (now triggers fade-in)
    clearLoadingState();                       // NEW: restore reload button (success)
  } catch (error) {
    clearLoadingState();                       // NEW: restore reload button (error)
    // ... existing error rendering ...
  }
}
```

`clearLoadingState()` is owned by `resolveUri` (the navigator), not by `renderCurrent` (the
renderer). `renderCurrent` is called from many non-navigation contexts — settings changes,
identity switches, reload — where loading state is not active. Coupling the renderer to the
loading lifecycle would be wrong. So `clearLoadingState()` is called explicitly in **both** the
success path and the catch path of `resolveUri`, directly after `renderCurrent()` / before error
rendering. The function is idempotent (safe to call when not loading), which also covers the case
where `renderCurrent` itself throws.

### 2. `app.ts` — three new helper functions

**`skeletonHtml()`** — returns the structural skeleton as an HTML string. The structure mirrors
the default `document` template's hero + one section, so it reads as "this page is loading" without
guessing row counts or which template will win:

```text
<div class="browser-skeleton">
  <header class="browser-skeleton-hero">
    <div class="browser-skeleton-avatar"></div>
    <div class="browser-skeleton-identity">
      <div class="browser-skeleton-line browser-skeleton-title"></div>
      <div class="browser-skeleton-line browser-skeleton-subtitle"></div>
      <div class="browser-skeleton-line browser-skeleton-summary"></div>
    </div>
  </header>
  <section class="browser-skeleton-section">
    <div class="browser-skeleton-line browser-skeleton-heading"></div>
    <div class="browser-skeleton-row">
      <div class="browser-skeleton-rowicon"></div>
      <div class="browser-skeleton-rowbars">
        <div class="browser-skeleton-line w70"></div>
        <div class="browser-skeleton-line w45"></div>
      </div>
    </div>
    <div class="browser-skeleton-row">
      <div class="browser-skeleton-rowicon"></div>
      <div class="browser-skeleton-rowbars">
        <div class="browser-skeleton-line w60"></div>
        <div class="browser-skeleton-line w50"></div>
      </div>
    </div>
  </section>
</div>
```

The width modifier classes (`w70`, `w60`, `w50`, `w45`) give the bars varied widths so the
skeleton does not look like a uniform grid.

**`showLoadingState()`**:

```text
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
```

**`clearLoadingState()`**:

```text
function clearLoadingState() {
  state.loading = false;
  if (elements.reload) {
    elements.reload.classList.remove('is-loading');
    elements.reload.disabled = false;
  }
}
```

`clearLoadingState()` is called at the end of the success path (after `renderCurrent()`) and at the
start of the catch path.

### 3. `app.ts` — fade-in trigger in `renderCurrent`

After the existing `elements.viewport.innerHTML = renderRenderer(current)` assignment
(`app.ts:1196`), add a class toggle that triggers a CSS keyframe animation on the next frame:

```text
if (elements.viewport) {
  elements.viewport.innerHTML = renderRenderer(current);
  triggerEnterAnimation(elements.viewport);    // NEW
}
```

```text
function triggerEnterAnimation(node) {
  node.classList.remove('is-entering');
  // Force reflow so the class removal is committed before re-adding,
  // allowing the animation to restart on consecutive navigations.
  void node.offsetWidth;
  node.classList.add('is-entering');
  window.setTimeout(function () {
    node.classList.remove('is-entering');
  }, 320);   // slightly longer than the 300ms animation
}
```

The forced reflow (`void node.offsetWidth`) ensures the animation re-triggers on every navigation,
not just the first. The `setTimeout` cleanup removes the class after the animation completes so it
does not linger. Note: `renderCurrent` is only responsible for the fade-in; it does **not** touch
loading state — that lifecycle is owned by `resolveUri` (see touch point #1).

### 4. `indexHtml.ts` — three CSS blocks

All new CSS is appended inside the existing `<style>` block in `BROWSER_INDEX_HTML`
(`packages/ui/src/browser/indexHtml.ts`), keeping the "fully inlined, no external resources"
convention.

**Block 1 — skeleton + shimmer:**

```text
.browser-skeleton {
  width: min(900px, calc(100% - 48px));
  margin: 30px auto 40px;
  border: 1px solid var(--browser-border);
  border-radius: var(--browser-radius);
  background: var(--browser-surface);
  box-shadow: 0 1px 2px rgba(31, 41, 55, .05);
  display: grid;
  gap: 28px;
  padding: 36px 38px;
}
.browser-skeleton-hero {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 18px;
}
.browser-skeleton-avatar {
  width: 72px; height: 72px;
  border-radius: 14px;
}
.browser-skeleton-identity {
  display: grid; gap: 7px; padding-top: 4px;
}
.browser-skeleton-section { display: grid; gap: 8px; }
.browser-skeleton-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 11px; align-items: center;
  border-top: 1px solid #edf1f6; padding: 10px 0;
}
.browser-skeleton-rowicon { width: 34px; height: 34px; border-radius: 7px; }
.browser-skeleton-rowbars { display: grid; gap: 5px; }
.browser-skeleton-line { height: 10px; border-radius: 4px; width: 100%; }
.browser-skeleton-title { width: 45%; height: 22px; }
.browser-skeleton-subtitle { width: 32%; height: 10px; }
.browser-skeleton-summary { width: 75%; }
.browser-skeleton-heading { width: 90px; height: 16px; }
.w70 { width: 70%; } .w60 { width: 60%; } .w50 { width: 50%; } .w45 { width: 45%; }
/* shimmer: all skeleton blocks share this animated background */
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
```

The skeleton reuses the exact dimensions and paddings of `.browser-bot-page`,
`.browser-bot-header`, and `.browser-service-row` so the skeleton-to-content swap does not cause a
visible layout shift (the hero avatar is 72px in both, the page width matches, the row geometry
matches). This is deliberate: avoiding layout shift on settle is what makes the fade-in feel
smooth rather than jarring.

**Block 2 — reload button spinner:**

```text
.browser-icon-button.is-loading {
  position: relative;
  color: transparent;
  cursor: progress;
  pointer-events: none;
}
.browser-icon-button.is-loading > svg { opacity: 0; }
.browser-icon-button.is-loading::after {
  content: "";
  position: absolute;
  top: 50%; left: 50%;
  width: 16px; height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid var(--browser-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: browser-spin .8s linear infinite;
}
@keyframes browser-spin {
  to { transform: rotate(360deg); }
}
```

The existing reload `<svg>` (`app.ts:54-56`) is hidden via `opacity: 0` (not `display: none`, to
preserve the button's layout box), and a CSS-only spinner is rendered via `::after`. `color:
transparent` + `pointer-events: none` makes the button non-interactive during loading (you cannot
re-reload while a load is in flight), matching the existing `disabled = true`.

**Block 3 — content fade-in:**

```text
.browser-viewport.is-entering > * {
  animation: browser-enter .3s ease;
}
@keyframes browser-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

The animation targets `.browser-viewport.is-entering > *` (the direct child — the rendered
`<article>` or other renderer root), so it applies once per navigation and does not affect nested
interactions after it completes.

## Error Handling

`resolveUri`'s catch branch (`app.ts:2725-2742`) currently renders an error empty-state. After this
change it must also call `clearLoadingState()` to restore the reload button, otherwise a failed
navigation leaves the reload button stuck as a disabled spinner. The skeleton is overwritten by the
error empty-state in the existing code path, so no extra skeleton cleanup is needed there.

## Out of Scope

The following were identified during diagnosis but are deliberately excluded:

- **Server-side N+1 in `enrichHomepageChats`** (`browserResolver.ts:229-314`) — real latency, but
  touches the shared core consumed by OAC/IDBots; separate effort.
- **Resolution caching** (no in-memory or HTTP cache today; `no-store` headers in `http.ts`).
- **Streaming / chunked rendering** of the Bot Page itself.
- **`loading="lazy"` / `decoding="async"` on avatar `<img>` tags** — a worthwhile micro-optimization
  but independent of the loading-feedback flow defined here.
- **`browserClientScript.ts`** — the non-served parallel implementation. Not edited.

## Testing

The existing test suite (`tests/ui/browserPage.test.mjs`) exercises the Browser shell HTML and
client script via string assertions against `buildBrowserPageDefinition()` /
`renderBrowserPageHtml()`. Tests to add or extend:

1. **Skeleton CSS present** — assert `renderBrowserPageHtml()` output contains
   `browser-skeleton`, `browser-shimmer`, `browser-spin`, `browser-enter` keyframes.
2. **Reload spinner CSS present** — assert output contains
   `.browser-icon-button.is-loading` and `browser-spin`.
3. **Fade-in CSS present** — assert output contains `.browser-viewport.is-entering` and
   `browser-enter`.
4. **Skeleton HTML structure** — a focused unit test on the rendered skeleton string (the
   `skeletonHtml()` output is embedded in the client script; assert the script source contains the
   skeleton class names and row structure).

These are string/structural assertions consistent with the existing test style. No behavioral
(timing/animation) tests are attempted — animations are not observable in the string-rendering
test harness.

## Risks

- **Skeleton/content layout mismatch causes shift on settle.** Mitigated by matching the skeleton's
  geometry to the real template dimensions (same avatar size, page width, row geometry).
- **Reload button stuck as spinner on error.** Mitigated by `clearLoadingState()` in the catch
  branch; the function is idempotent.
- **Animation re-trigger fails on consecutive navigations.** Mitigated by the forced reflow
  (`void node.offsetWidth`) before re-adding `is-entering`.
- **Skeleton flashes for very fast responses (<100ms).** Accepted per decision #6 — the user
  prioritized immediate feedback over avoiding a brief skeleton flash on fast responses.
