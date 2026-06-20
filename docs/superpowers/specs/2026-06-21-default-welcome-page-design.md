# Default Welcome Page Design

Date: 2026-06-21
Status: Draft for review

## Goal

Replace the current default landing page — a hardcoded "Fixture Bot" homepage at
`metaid://idq1fixturebot` — with a Chrome-style welcome page. When the Browser is opened with no
URI (no `?uri=` param, no path-derived URI, and no `runtime.defaultUri`), it shows a clean welcome
page instead of a fake bot homepage.

The welcome page keeps the Browser feeling like a human-facing browser: a centered hero with a
prompt-shaped input mock, and a single shortcut grid built from the user's existing bookmarks and
recent visits, with two official recommendation entries pinned at the tail.

This spec is intentionally narrow. It defines:

- the trigger condition for the welcome page;
- the content structure of the welcome page viewport;
- the official recommendation entries (placeholder URIs, to be replaced later);
- the removal of the fixture default-URI path and its dead code.

## Background

Today both standalone adapters return `defaultUri: 'metaid://idq1fixturebot'`:

- `packages/host-standalone/src/adapter.ts` (`STANDALONE_DEFAULT_URI`, `getRuntime()`)
- `packages/host-standalone/src/memoryHost.ts` (`createMemoryStandaloneBrowserHost`)

The client bootstrap (`packages/ui/src/browser/app.ts`, `initialize()`) uses this `defaultUri` when
no other URI is present, which navigates to `metaid://idq1fixturebot`. That URI is intercepted by
`isFixtureMetaIdUri()` and served from a hardcoded `FIXTURE_BOT_HOMEPAGE` constant via a fake
`fixtureFetch()`. The result is a sample "Fixture Bot" homepage rendered through the normal
pipeline, designed so "opening `/browser` must not look like an empty shell".

The original concern (avoiding an empty shell) is valid, but a fake bot homepage is the wrong
answer. A real browser's default page is a welcome/start page, not a simulated website. This spec
replaces the fake homepage with a real welcome page.

## Trigger Condition

The welcome page renders when the Browser has no URI to load. Concretely, in `initialize()`
(`packages/ui/src/browser/app.ts`), the fallback branch currently:

```text
if (runtime && runtime.defaultUri) {
  await navigateTo(runtime.defaultUri);
  return;
}
renderNoLocalBot();
```

becomes:

```text
renderWelcome();
```

The welcome page is the single fallback when all three of these are absent:

1. No `?uri=` query parameter.
2. No path-derived URI (e.g. `/browser/metaid/<id>`).
3. No `runtime.defaultUri` (removed from both adapters — see "Fixture Removal" below).

`renderNoLocalBot()` (`app.ts:1065`) is unchanged. It handles a different condition ("no
wallet/actor connected") and remains responsible for that case. The welcome page and the
no-local-bot state are separate paths with separate responsibilities.

### Returning to the welcome page

The welcome page is reachable again after navigation: clearing the address bar and submitting, or
navigating back to a point with no history, re-renders the welcome page. Address bar empty equals
welcome page. The implementation detail (how `navigateTo('')` or an empty submit triggers
`renderWelcome()`) is covered in the implementation plan.

## Content Structure

The welcome page is rendered into the existing `<main data-browser-viewport>` element. It uses the
existing dark theme and reuses existing CSS patterns (`.browser-empty-state` centered layout,
`.browser-bot-page` card patterns) where applicable. The content is a single centered column,
max-width approximately 640px.

### Hero

- Title/logo: `Agent Internet`.
- Subtitle: `在地址栏输入 metaid:// URI 即可访问` (i18n via the existing `browserText()` /
  `browserLaunchCopy['zh-CN']` pattern; an English fallback string is also provided).
- A prompt-shaped input mock: a styled element resembling the address bar with a `metaid://`
  hint and a search icon. Clicking it focuses the real top address bar input. This element is
  purely visual; it is styled with care (rounded corners, balanced padding, icon alignment, a
  focus/hover state) so it does not look rough.

### Shortcut Grid (single grid, official recommendations pinned at the tail)

- Grid heading: `书签 / 最近访问` (i18n as above).
- Grid entries, in order:
  1. User bookmarks — from `state.bookmarks` (localStorage, key
     `agent-browser:bookmarks`).
  2. Recent visits — from `state.visits` (in-memory, current session), deduped against bookmarks
     via the existing `uniqueRecent()` helper (`app.ts:1134`).
  3. Official recommendations (two entries, pinned at the tail, visually distinguished with the
     existing accent color):
     - `metaapp://agent-browser` — title `Agent Browser`
     - `metaid://docsbot` — title `Docs Bot`

All grid entries use the same row/cell markup pattern as the existing Library drawer
(`renderBookmarkList` / `renderVisitList` at `app.ts:1148-1160`, `1294-1309`), emitting
clickable rows that navigate via the existing viewport delegation.

### Official Recommendations Are Real URI Suggestions

The two official entries are real URI suggestions, not fake resolved data. Clicking one runs the
normal `navigateTo(uri)` → resolve pipeline → renders the real on-chain bot or MetaApp homepage.
They are the same kind of object as a user bookmark (a navigable URI), just sourced from an
official recommendation list. This is the key distinction from the removed
`FIXTURE_BOT_HOMEPAGE`, which faked a fully-resolved result.

### Placeholder URIs

The two official URIs are placeholders:

```text
metaapp://agent-browser
metaid://docsbot
```

They will be replaced with real on-chain pinID / globalMetaId values later. The replacement is a
single constant edit (see "Implementation Surface" below). Until replaced, the URIs are still
syntactically valid and will resolve through the normal pipeline (failing gracefully if the
placeholder ID is not yet on chain).

### Empty State (no bookmarks, no recent visits)

When the user has no bookmarks and no recent visits, the grid shows only the two official
recommendations. There is no "no bookmarks yet" placeholder text or dashed empty cells — the two
official entries fill the grid, so the page never looks empty. As the user bookmarks bots or
visits resources, their entries appear above the official recommendations.

## Implementation Surface

All changes are confined to the UI and standalone host packages. Core packages are not touched.

### New: `renderWelcome()` in `packages/ui/src/browser/app.ts`

A new function modeled on `renderNoLocalBot()` (`app.ts:1065`):

- Builds the welcome-page HTML string (hero + shortcut grid).
- Assigns it to `elements.viewport.innerHTML`.
- Sets the status strip: state `ready`, renderer `none`, TXID `-`.
- Clears `state.current = null`.
- Resets the resource chip to "No resource".
- Renders the bookmark star in its disabled (no current resource) state.

### New: `OFFICIAL_RECOMMENDATIONS` constant in `packages/ui/src/browser/app.ts`

```ts
const OFFICIAL_RECOMMENDATIONS = [
  { uri: 'metaapp://agent-browser', title: 'Agent Browser', kind: 'official' },
  { uri: 'metaid://docsbot', title: 'Docs Bot', kind: 'official' },
];
```

Both URIs are placeholders pending real pinID / globalMetaId values. Replacement is a single
constant edit.

### Changed: `initialize()` fallback in `packages/ui/src/browser/app.ts`

The `runtime.defaultUri` fallback branch is replaced by a direct `renderWelcome()` call.

### Fixture Removal (single commit)

Removing `defaultUri` orphans the fixture machinery, which is dead code after this change. It is
removed in the same commit:

- `packages/host-standalone/src/adapter.ts`:
  - `STANDALONE_DEFAULT_URI` constant (`:47`)
  - `STANDALONE_FIXTURE_GLOBAL_META_ID` constant (`:48`)
  - `FIXTURE_BOT_HOMEPAGE` constant (`:51-158`)
  - `isFixtureMetaIdUri()` function and its branch in `resolveResource()` (`:291-293`, `:555-557`)
  - `fixtureFetch()` function (`:377-386`)
  - `defaultUri: STANDALONE_DEFAULT_URI` in `getRuntime()` (`:536`)
- `packages/host-standalone/src/memoryHost.ts`:
  - `defaultUri` from `createMemoryStandaloneBrowserHost` input/output (`:124`)
  - `fixtureHomepage()` and its use in resolving `metaid://idq1fixturebot` (`:28-106`, `:204-223`)
- `docs/acceptance/browser-parity-standalone.md:10`: update the "Default URI" line from
  `metaid://idq1fixturebot` to the welcome page.

### Tests

Any test asserting `defaultUri === 'metaid://idq1fixturebot'` or asserting fixture homepage
rendering is updated to assert: no `defaultUri`, welcome page renders on empty URI. The existing
`renderNoLocalBot` tests remain valid (no change to that path).

## Out Of Scope

- No new resource/renderer type (e.g. `welcome://`) is added. The welcome page renders directly
  into the viewport, not through the `renderRenderer()` envelope pipeline.
- No server-side injection of welcome content. The welcome page is entirely client-side.
- No persistence of welcome-page state. Bookmarks and visits already persist; the welcome page is
  recomputed from them each render.
- No official recommendation list fetched from a remote source. The list is a hardcoded constant
  for now. Remote-sourced recommendations are a future possibility, not part of this spec.
- No changes to `renderNoLocalBot()` or the no-actor condition.
- No changes to the existing Library drawer. The welcome page reuses the Library's data and row
  markup patterns but does not modify the drawer itself.

## Success Criteria

1. Opening `/`, `/browser`, or `/ui/browser` with no `?uri=` and no path URI renders the welcome
   page (hero + shortcut grid), not the Fixture Bot homepage.
2. The welcome page shortcut grid shows user bookmarks + recent visits, with the two official
   recommendations pinned at the tail.
3. With no bookmarks and no recent visits, the grid shows only the two official recommendations;
   the page does not look empty.
4. Clicking an official recommendation runs the normal resolve pipeline and renders the real
   resource (or fails gracefully if the placeholder ID is not on chain).
5. Clearing the address bar and submitting re-renders the welcome page.
6. No code references `metaid://idq1fixturebot`, `FIXTURE_BOT_HOMEPAGE`, `fixtureFetch`, or
   `isFixtureMetaIdUri` after the change.
7. The no-actor (`renderNoLocalBot`) path is unchanged.
