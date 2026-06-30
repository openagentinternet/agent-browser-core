# Custom Homepage Navigation Bridge Design

## Goal

Custom Bot Pages should be able to link to Agent Internet resources from inside a MetaApp or
Metafile-backed static homepage.

The primary authoring scenario is a Bot owner using OAC, IDBots, Codex, or another coding agent to
build a ZIP-backed static MetaApp homepage. The page may contain normal links and JavaScript-driven
interactions that should open Browser resources such as Bot Pages, pins, MetaApps, Metafiles, and
MAP resources. Those links must navigate inside Agent Browser Core instead of falling through to
the host browser's native custom-protocol handling.

## Current Behavior

Built-in Bot Page templates are rendered directly into the Browser viewport. They are not iframe
content. Internal links work because the template emits anchors such as:

```html
<a href="pin://{pinId}" data-browser-map-link>PIN</a>
```

The Browser shell listens for `data-browser-map-link` clicks in the same document, prevents the
native click, and calls the internal `navigateTo(uri)` flow.

Custom Bot Pages are different. When a Bot declares a custom homepage in `/info/homepage`,
`metaid://{globalMetaId}` can resolve to a `metaapp://` or `metafile://` target while the Browser
address bar keeps the outer `metaid://` URI. If the resolved target is HTML, ABC renders it in a
sandboxed `html-iframe` renderer.

The iframe boundary means:

- clicks inside the custom page do not bubble to the Browser shell;
- `data-browser-map-link` inside the iframe is not enough by itself;
- `window.location.href = "metaid://..."` delegates to the host browser or OS protocol handler;
- iframe JavaScript cannot call the parent page's `navigateTo()` directly.

## Non-Goals

- Do not expose wallet APIs, signing, payment, write-chain operations, local files, local storage, or
  host adapter internals to custom iframe content.
- Do not make iframe content a trusted Browser extension surface.
- Do not rewrite arbitrary user ZIP content in v1.
- Do not add special Metafile restrictions. Metafile continues to use the same renderer selection
  rules it already has. If a Metafile resolves to HTML, it uses the same `html-iframe` navigation
  bridge behavior as a MetaApp.
- Do not auto-execute MAP host actions. Navigation to a host-action resource may render an action
  page or trusted action button, but the bridge only requests navigation.

## Supported Browser URIs

The bridge and authoring docs should describe the same URI surface that `parseBrowserUri()` supports:

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

The frontend bridge may do a fast scheme allow-list check, but final validity remains the normal
Browser resolve path. Invalid or unsupported inputs should fail through the existing Browser error
state rather than inventing a separate iframe-specific resolver.

## Bridge Contract

ABC should add a parent-page `message` listener for navigation messages from the active
`html-iframe` renderer.

Message shape:

```json
{
  "type": "agent-browser:navigate",
  "version": 1,
  "uri": "metaid://idq1..."
}
```

Handling rules:

1. Ignore messages that do not have `type: "agent-browser:navigate"`.
2. Ignore messages whose `version` is missing or not `1`.
3. Read `uri` as a trimmed string.
4. Reject `uri` unless it starts with one of:
   - `metaid://`
   - `pin://`
   - `metaapp://`
   - `metafile://`
   - `map://`
5. Only accept messages from the currently rendered `iframe.browser-html-frame`.
6. Do not rely on `event.origin` for the security decision because sandboxed iframes without
   `allow-same-origin` can report an opaque origin.
7. Call the existing `navigateTo(uri)` path after validation.
8. Do not return privileged data to the iframe.

`event.source` validation is the key boundary. In v1, only the top-level rendered iframe can
request navigation. Nested iframes inside a MetaApp are not supported unless a later design adds an
explicit delegation model.

## Authoring Helper

The public authoring guide should provide a small helper that custom homepage authors can inline in
their static page. It should not require a build tool.

Recommended helper:

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

Static links can then use normal Agent Internet URIs:

```html
<a href="metaid://idq1...">Open Bot Page</a>
<a href="pin://6ea8...i0">Open PIN</a>
<a href="metaapp://6ea8...i0">Open MetaApp</a>
```

JavaScript-driven UI can call:

```js
window.AgentBrowser.navigate('map://simplemsg/conversation?peer=idq1...');
```

The helper deliberately intercepts only ABC-supported internal URI schemes. Normal `https://` links
remain normal web links unless the author chooses to handle them separately.

## Documentation Deliverable

Add a public guide, for example:

```text
docs/custom-bot-homepage-metaapp-guide.md
```

The guide should be written for Bot owners and coding agents. It should include:

- when to use a custom Bot homepage;
- the recommended ZIP-backed static MetaApp shape;
- the supported Agent Internet URI formats;
- anchor examples;
- JavaScript navigation examples;
- the inline helper snippet;
- a Codex prompt template for generating a custom homepage;
- guidance to prefer Agent Internet URIs over Web2 URLs for ecosystem resources;
- fallback behavior outside ABC;
- security notes explaining that the bridge only performs navigation.

The guide should also mention the built-in Bot Page behavior so authors understand why
`data-browser-map-link` works in built-in templates but not inside custom iframes.

## User Experience

When a custom homepage requests navigation:

1. The custom page sends the navigation message.
2. ABC validates the sender and URI scheme.
3. ABC updates the Browser address bar through the existing navigation path.
4. ABC records normal Browser history.
5. ABC resolves and renders the target resource.

For a custom homepage reached through `metaid://{globalMetaId}`, navigating away to `pin://...` or
`metaapp://...` should behave like any normal Browser navigation. The previous `metaid://...` custom
homepage remains reachable through the Browser back button.

Invalid messages should be ignored or produce a normal Browser error only when the URI reaches the
existing resolver. The iframe should not receive detailed host diagnostics.

## Security Model

The bridge is intentionally narrow:

- it accepts only navigation requests;
- it does not expose wallet capabilities;
- it does not expose host actor identity beyond what the Browser UI already renders;
- it does not grant iframe access to parent DOM;
- it does not require `allow-same-origin`;
- it does not require broader sandbox permissions.

Using `postMessage(..., '*')` in the helper is acceptable because the receiving parent validates the
message shape, active iframe source, and URI scheme. Authors may not know the final host origin in
advance because the same MetaApp can run in standalone ABC, OAC, IDBots, or another host.

## Implementation Notes

Likely touch points:

- `packages/ui/src/browserClientScript.ts`
- `packages/ui/src/browser/app.ts`
- `tests/ui/browserInteractions.test.mjs`
- `tests/ui/browserPageRenderers.test.mjs`
- `docs/custom-bot-homepage-metaapp-guide.md`

The production Browser page and test/debug Browser script should share the same behavior. If a
helper function is introduced, keep it local to the Browser UI package and avoid creating a new host
contract unless a host needs to customize bridge policy.

## Test Plan

Add focused tests for:

1. Browser client script includes a `message` listener for `agent-browser:navigate`.
2. A message from the active `iframe.browser-html-frame` calls the normal navigation path.
3. Unsupported schemes such as `https://`, `javascript:`, and relative URLs are ignored.
4. A message from a non-active iframe or unrelated window source is ignored.
5. Existing `data-browser-map-link` behavior in built-in Bot Page and pin renderers still works.
6. The custom homepage guide includes anchor, JavaScript, and supported URI examples.

For docs-only guide changes, `git diff --check` is enough. For bridge implementation, run the
targeted UI tests plus the normal package verification selected by the implementation plan.

## Open Questions

- Should ABC expose a tiny hosted helper script path later, such as
  `/browser/agent-browser-helper.js`, so authors can reference one shared helper instead of copying
  the inline snippet?
- Should a future version add an optional acknowledgement message back to the iframe for analytics
  or UI state? V1 should not include this because navigation success and resolver failure are
  already visible in the parent Browser UI.
