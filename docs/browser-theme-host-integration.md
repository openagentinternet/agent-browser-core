# Browser Theme Host Integration

## Audience

This document is for Agent Browser Core (ABC) downstream hosts — especially
Open Agent Connect and IDBots — that render the ABC Browser inside an
`<iframe>` (typically via `srcDoc`). It shows how to select and synchronize the
Browser light/dark/system theme.

## Why ABC owns the theme

The ABC Browser runs inside an iframe. A host's own dark-mode styles cannot
reach across the iframe boundary, so ABC renders its own theme. The host only
**selects** a theme (initial + runtime changes); it never injects or maintains
any Browser CSS. Do not use CSS filters, color inversion, or host-side style
overrides.

## Theme values

`BrowserTheme = 'light' | 'dark' | 'system'`

- `light` / `dark`: always that theme.
- `system`: follow the user's OS `prefers-color-scheme`, resolved before first
  paint and re-evaluated at runtime when the OS theme changes.

When no theme is supplied, ABC keeps its current **light** behavior (legacy
compatible).

## 1. Set the initial theme at render time

Pass the host's effective theme as the third argument to
`renderBrowserPageHtml`. The theme is baked into the HTML, so the first paint
is already correct — no white flash.

```ts
import { renderBrowserPageHtml } from '@openagentinternet/agent-browser-ui';

const html = await renderBrowserPageHtml(
  definition,                                // optional
  languagePreference,                        // optional
  { theme: themeService.getEffectiveTheme() }, // 'light' | 'dark' | 'system'
);
// Put `html` into the iframe srcDoc.
```

The two-argument and one-argument call forms are fully backward compatible and
default to `light`.

## 2. Switch the theme at runtime

When the host theme changes, send one `postMessage` into the ABC iframe. ABC
applies the new theme **without reloading the page, rebuilding the iframe, or
losing the current URI/page state**.

```ts
import { createBrowserThemeMessage } from '@openagentinternet/agent-browser-ui';

const frame = document.querySelector('iframe.browser-html-frame');
frame.contentWindow.postMessage(
  createBrowserThemeMessage('dark'), // or 'light' | 'system'
  '*',                                // or a specific origin
);
```

Always build the message with `createBrowserThemeMessage`. The stable envelope
is:

```json
{
  "type": "agent-browser:set-theme",
  "version": 1,
  "theme": "dark"
}
```

`BROWSER_THEME_MESSAGE_TYPE` (`'agent-browser:set-theme'`) and
`BROWSER_THEME_MESSAGE_VERSION` (`1`) are exported as constants. Do not invent
your own message strings — hosts and ABC must share this single envelope.

## Security: what ABC accepts

The ABC iframe applies a theme message only when **both** hold:

- `event.source === window.parent` (the message came from the host, not the
  MetaApp child iframe or any other window);
- the envelope validates via `isBrowserThemeMessage` (correct `type`,
  numeric `version`, supported `theme`).

Invalid sources, wrong types, bad versions, and unsupported theme values are
silently ignored. You can reuse `isBrowserThemeMessage` if you need to validate
on the host side.

## How ABC handles `system`

- On first paint, a blocking `<head>` script resolves `system` against
  `prefers-color-scheme` and writes the concrete value (`light`/`dark`) plus
  `color-scheme` before the page is painted.
- At runtime, when ABC receives a `system` theme message it subscribes to
  `matchMedia('(prefers-color-scheme: dark)')` and re-resolves automatically
  when the OS theme changes. Explicit `light`/`dark` messages unsubscribe and
  pin the theme.

Hosts therefore only need to forward their own theme preference; they do not
need to observe OS changes on ABC's behalf.

## Scope and non-goals

- Theme is a UI presentation concern only. It is not part of any on-chain
  protocol, trusted action, Browser backend config, or persisted setting.
- The MetaApp iframe (`iframe.browser-html-frame`) is third-party web content.
  ABC never rewrites its content or sandbox; MetaApps should support
  `prefers-color-scheme` themselves.
- Images, avatars, videos, and brand assets are never color-inverted.

## Exports

From `@openagentinternet/agent-browser-ui` (and the `/browser` subpath):

| Export | Kind | Purpose |
| --- | --- | --- |
| `BrowserTheme` | type | `'light' \| 'dark' \| 'system'` |
| `RenderBrowserPageHtmlOptions` | type | `{ theme?: BrowserTheme }` |
| `renderBrowserPageHtml` | function | Render with optional initial theme |
| `createBrowserThemeMessage` | function | Build the host → iframe message |
| `isBrowserThemeMessage` | function | Validate an unknown payload |
| `resolveBrowserTheme` | function | Resolve `system` → `light`/`dark` |
| `BROWSER_THEME_MESSAGE_TYPE` | const | `'agent-browser:set-theme'` |
| `BROWSER_THEME_MESSAGE_VERSION` | const | `1` |
