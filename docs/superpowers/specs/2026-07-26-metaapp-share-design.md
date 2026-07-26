# MetaApp Address-Bar Icon, Info Panel, Share & Remix — Design

- Date: 2026-07-26
- Status: Approved by user (pending final spec review)
- Branch/worktree: `metaapp-share` (`.worktrees/metaapp-share`)

## Background

MetaApps on Agent Internet are proliferating. Hosts (OAC) are building a Remix feature that lets
users re-edit the current MetaApp, and users who publish their own apps as MetaApps want a share
entry point. This design adds MetaApp-aware chrome to the served Browser UI:

1. When the current URI resolves to a MetaApp, the address-bar left icon (today a static link
   glyph) shows the MetaApp's own icon, favicon-style.
2. Clicking that icon opens a small info panel (owner-chip style) with the app icon, title,
   version, last-updated time, and three icon actions: **Share**, **Remix**, **View pin**.
3. Share opens a modal with copyable public/in-protocol links and a "Buzz it" publisher that
   posts a simplebuzz via the current actor bot.
4. Remix invokes a host capability over the existing trusted-action bridge (pinId only);
   standalone mode shows the standard "not supported in web version" modal.
5. View pin navigates to `pin://<pinId>`.

## Current-State Findings (verified)

- MetaApp detection client-side: `state.current.resourceType === 'metaapp'`
  (`packages/ui/src/browser/app.ts:1798`, helper `currentMetaAppPinId()`).
- All panel data is already client-side: the full `MetaAppGalleryRecord` is embedded at
  `state.current.renderer.data.record` (`packages/core/src/browser/metaAppResolver.ts:84-86`;
  record type at `packages/core/src/browser/types.ts:273-302` with `icon`, `title`, `appName`,
  `version`, `updatedAt` (ms epoch), `pinId`, `firstPinId`, `intro`). **No core resolver changes
  are needed.**
- Address-bar left icon: static `<span class="browser-address-icon">` with a link SVG
  (`app.ts:69-77`); no JS hook today. Layout: `.browser-address-form` is
  `grid-template-columns: 30px minmax(0,1fr) 34px`.
- Owner-chip panel pattern to mirror: markup `app.ts:81-86`, render `renderOwnerPanel()`
  `app.ts:1705-1732`, open/close/toggle `app.ts:1734-1758`, document-level click-outside close
  `app.ts:5998-6002`, CSS `.browser-owner-panel*` in `indexHtml.ts` (dark overrides in
  `darkThemeCss.ts:90-96`).
- Generic modal: `renderModal(title, bodyHtml, confirmLabel, confirmAction, options?)`
  (`app.ts:3664-3676`) into `[data-browser-modal-root]`; closest analog is the private-chat modal
  (`openPrivateChatModalForTarget` `app.ts:4057-4100`, send `confirmPrivateChat`
  `app.ts:4143-4186`, sending state `setPrivateChatSending`, sent modal
  `showPrivateChatSentModal`).
- Host channel: `POST /api/browser/actions` with `{ resourceUri, kind, payload }`
  (`handleTrustedAction` `app.ts:4311-4337`); standalone-unsupported modal
  `openStandaloneUnsupportedModal()` (`app.ts:4025-4035`); `isStandaloneHostRuntime()` gate.
- Contract: `BrowserTrustedActionKind` union (`packages/host-contract/src/index.ts:85-99`),
  `BrowserMetaIdPinWritePayload` (`:115-131`), `BrowserTrustedActionResult` already supports
  optional `href`/`route` (`:361-376`), `BrowserRuntimeSnapshot.features` (`:209-215`).
- simplebuzz pin shape (bridge doc `docs/metaapp-host-bridge-v1-host-requirements.md:128-160`):
  `path: '/protocols/simplebuzz'`, `contentType: 'application/json;utf-8'`, body JSON with a
  `content` field (renderer reads `content | text | body`,
  `packages/renderers/src/index.ts:58-72`).
- `indexHtml.ts` is a one-time extraction from OAC (no generator script in this repo); CSS edits
  are made directly in the template string.
- Share URL shape `https://openagentinternet.org/browser/metaapp/<pinId>` matches the standalone
  client router convention `/browser/(metaid|metaapp|metafile|pin)/<id>` (`app.ts:1622`) and the
  existing OAC install link constant (`app.ts:4026`).
- The `'share-resource'` trusted-action kind exists in the contract union but is only used by the
  legacy parity stack; this feature does not touch it (Share modal is pure client-side).

## Decisions (user-approved)

- **Buzz channel**: reuse the existing `metaid-pin-write` trusted action; the UI composes the
  full `/protocols/simplebuzz` pin payload. No new `post-buzz` kind.
- **Remix**: click invokes the host immediately — no browser-side confirmation modal (the host
  owns the Remix UX).
- Remix contract: new kind `'metaapp-remix'` + new **optional** `features.remix?: boolean`
  (absent = unsupported, backward compatible with older hosts).
- Share-link domain: UI constant `https://openagentinternet.org` (consistent with the existing
  install-link constant).
- Share/Remix/View-pin actions operate on the current normalized `proof.pinId` (canonical even
  when arriving via `metaapp://name.eth` alias).

## Design

### 1. Address-bar app icon

- Add `data-browser-address-icon` hook to the icon slot in the shell markup
  (`buildBrowserPageDefinition().contentHtml`, `app.ts:69-77`).
- New render helper `renderAddressIcon()` called from `renderCurrent()` (`app.ts:2613`) and
  `syncToolbarForActiveTab()` (`app.ts:555`) so each tab shows its own state.
- Non-MetaApp: restore the default static link glyph, non-interactive (current behavior
  unchanged).
- MetaApp: slot becomes `<button type="button" class="browser-address-app-icon"
  data-browser-address-app-icon aria-haspopup="dialog" aria-expanded="false" title="<app title>">`
  containing `<img>` for the app icon.
- Icon URL helper `metaAppIconUrl(icon)`:
  - `http(s):` / `data:` / `blob:` → used as-is (via existing `safeUrl()`);
  - `metafile://<pinId>` → converted through the configured metafile content base URL from
    settings (same base-URL settings used elsewhere);
  - empty/relative/unrecognized or image load error → generic app glyph fallback (inline SVG,
    e.g. the existing `bot` icon style). Broken-image handling follows the existing capture-phase
    avatar error listener pattern (`app.ts:5927-5932`).

### 2. App info panel

- Markup: wrap the address icon slot in a `position:relative` container
  (`browser-address-icon-wrap`) holding the button and
  `<div class="browser-app-panel" data-browser-app-panel role="dialog" hidden>`.
- Render `renderAppPanel()` from `state.current.renderer.data.record` + `proof`:
  - header: 40px icon, title (`record.title || appName`), version pill (`record.version`),
    `Updated <date>` from `record.updatedAt` (ms epoch, locale date format);
  - footer: three icon+label buttons:
    - Share — `data-browser-app-panel-action="share"`, new `share` icon (share-2 style three-node
      glyph);
    - Remix — `data-browser-app-panel-action="remix"`, new `remix` icon (git-fork style branch
      glyph);
    - View pin — `data-browser-app-panel-action="view-pin"`, new `scroll` icon (receipt/scroll
      glyph).
- Open/close mirrors the owner panel exactly: `state.appPanelOpen`,
  `openAppPanel/closeAppPanel/toggleAppPanel`, `stopPropagation` on chip/panel clicks, the single
  document-level click-outside handler extended to close it, ESC closes (same as modal/menu
  conventions), `aria-expanded` sync.
- CSS mirrors `.browser-owner-panel*` but anchored left under the address form; dark-theme
  overrides added to `darkThemeCss.ts` following the owner-panel precedent; mobile capped like
  `.browser-owner-panel` (`max-width: calc(100vw - 16px)`).
- **Degradation**: `preview-metaapp://` resources also carry `resourceType: 'metaapp'` but have no
  `proof.pinId`. The panel still opens (info only) with all three action buttons `disabled` and a
  title/note that an on-chain pin is required.

### 3. Share modal

- Action `share`: close panel, open a `renderModal()`-based dialog titled "Share MetaApp":
  1. Row: `https://openagentinternet.org/browser/metaapp/<pinId>` (new UI constant
     `OPENAGENTINTERNET_BROWSER_BASE_URL`) + copy button → `showToast('Copied')`.
  2. Row: `metaapp://<pinId>` (existing `metaAppHref()` helper, `app.ts:682`) + copy button.
  3. Multi-line textarea pre-filled with default English copy:
     `I found an interesting app '<title>' — worth sharing: metaapp://<pinId>`
     (editable), and the modal confirm button labeled **Buzz it**.
- Buzz it flow:
  - `isStandaloneHostRuntime()` → `openStandaloneUnsupportedModal()` (no HTTP call), same UX as
    private chat in standalone.
  - Otherwise POST `/api/browser/actions` (with `?actorId=` via `endpointWithActor()`):
    ```json
    {
      "resourceUri": "metaapp://<pinId>",
      "kind": "metaid-pin-write",
      "payload": {
        "operation": "create",
        "path": "/protocols/simplebuzz",
        "encryption": "0",
        "version": "1.0.0",
        "contentType": "application/json;utf-8",
        "payload": { "encoding": "utf8", "value": "{\"content\":\"<user text>\"}" },
        "display": { "title": "Share MetaApp", "summary": "<truncated user text>" }
      }
    }
    ```
  - Sending state mirrors `setPrivateChatSending` (disabled button + spinner label); failure shows
    inline modal error text (mirrors `setPrivateChatStatus`).
  - Success: close composer, show a sent-modal mirroring `showPrivateChatSentModal`; "View post"
    navigates to `pin://<result.pinId>` from `BrowserMetaIdPinWriteResult`.

### 4. Remix

- Contract (`packages/host-contract/src/index.ts`):
  - `BrowserTrustedActionKind` += `'metaapp-remix'`;
  - `BrowserRuntimeSnapshot.features` += `remix?: boolean` (optional; undefined ⇒ unsupported).
- UI action `remix`: close panel, then:
  - `runtimeFeatures().remix !== true` → `openStandaloneUnsupportedModal()`;
  - else POST `{ resourceUri: 'metaapp://<pinId>', kind: 'metaapp-remix',
    payload: { pinId: '<proof.pinId>' } }` — `resourceUri` is already part of
    `BrowserTrustedActionInput`, so hosts receive URI + pinId. `pinId` is the current version
    (what you see is what you remix); hosts can resolve `firstPinId` themselves if needed.
  - Result handling: if `result.data.href`/`route` present, navigate; else
    `showToast('Remix opened in host')`-style confirmation. Failure → toast with the error
    message.
- Standalone (`packages/host-standalone/src/adapter.ts`, `memoryHost.ts`):
  `features.remix: false`, and a `runTrustedAction` case returning
  `browserFailure('browser_action_not_supported', ...)` for `metaapp-remix` (defense in depth;
  the UI feature flag is the primary gate).
- Test harness (`packages/test-harness/src/index.ts`): add `'metaapp-remix'` to
  `TRUSTED_ACTION_KINDS`.

### 5. View pin

- Pure client-side: close panel → `navigateTo(pin://<pinId>)` (existing `pinHref()` helper,
  `app.ts:669`). Works in every mode (pin-inspector renderer).

### 6. Icons

- Add to `iconHtml()` (`app.ts:1415-1442`): `share` (share-2 style), `remix` (git-fork style),
  `scroll` (pin/receipt style). 24×24 stroke paths matching the existing set.

### 7. Accessibility, theming, text

- Icon slot becomes a real `<button>` with `aria-haspopup="dialog"`, synced `aria-expanded`;
  panel `role="dialog"`; buttons have visible text labels (not icon-only).
- Dark theme: all new panel/modal styles get overrides in `darkThemeCss.ts`.
- All user-facing strings via `browserText(key, 'English fallback')` per existing convention;
  default buzz copy in English.
- Template safety: the client script is one giant template literal — escape backticks/`${` in new
  markup; page injection stays on the mandated `split(placeholder).join(value)` path (`page.ts`).

## Error/edge handling summary

- App icon fails to load → generic app glyph (existing avatar error-listener pattern).
- `preview-metaapp://` (no pinId) → panel info-only, actions disabled.
- Standalone: Buzz it and Remix → standard unsupported modal; View pin and copy actions work.
- Buzz failure → inline modal error; Remix failure → toast.
- Tab switching re-renders the icon per tab; navigation to non-MetaApp restores the default glyph.

## Out of scope (YAGNI)

- No `post-buzz` dedicated kind; no attachments/images in the buzz composer.
- No `metaapp://` `?version=` support; no "new version available" badge/update checks.
- No envelope shape changes (`renderer.data.record` is read in place; no promoted `appMeta`).
- No host-side Remix implementation (OAC/IDBots integrate `metaapp-remix` downstream).
- No changes to the legacy parity stack or to the unused `'share-resource'` kind.

## File-by-file change list

| File | Change |
|---|---|
| `packages/host-contract/src/index.ts` | `'metaapp-remix'` kind; optional `features.remix?: boolean` |
| `packages/ui/src/browser/app.ts` | icon-slot hook + `renderAddressIcon`, app panel (markup/render/open-close/actions), Share modal + buzz composer, Remix action, 3 new icons, `OPENAGENTINTERNET_BROWSER_BASE_URL` const, `browserText` strings, test-seam exports |
| `packages/ui/src/browser/indexHtml.ts` | panel + share-modal CSS (hand-edited template string), address-icon button styles |
| `packages/ui/src/browser/darkThemeCss.ts` | dark overrides for new panel/modal |
| `packages/host-standalone/src/adapter.ts` | `features.remix: false`; `metaapp-remix` unsupported stub |
| `packages/host-standalone/src/memoryHost.ts` | mirror stub |
| `packages/test-harness/src/index.ts` | `TRUSTED_ACTION_KINDS` += `'metaapp-remix'` |
| `tests/ui/*.test.mjs` | panel render, icon swap per resource type, share modal contents, buzz payload shape, standalone gating, view-pin navigation (node:vm + FakeElement pattern) |
| `tests/host-standalone/*.test.mjs` | `metaapp-remix` unsupported result; runtime features expose `remix: false` |
| `tests/host-contract/*.test.mjs` | conformance still green with new kind |

## Verification

- `npm run build` for all packages.
- `npm test` (full suite) green in the worktree.
- Manual smoke via `npm run dev:standalone -- --port 8787`: open a `metaapp://` URI, verify icon,
  panel, copy actions, view-pin, and the standalone unsupported modals for Remix/Buzz.
