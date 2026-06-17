# Custom Bot Page Rendering Design

## Goal

Support custom Bot Page rendering from the Bot homepage v2 read model. A Bot can declare a
custom homepage in `/info/homepage`; when Browser resolves `metaid://{globalMetaId}`, it can
render the declared MetaApp or Metafile while keeping the address bar on the original
`metaid://` URI.

This is a Browser rendering feature. It does not publish, update, or validate `/info/homepage`
on chain.

## Confirmed Contract

Browser fetches Bot homepage data with only the version parameter:

```text
GET {metasoP2PBaseUrl}/api/bot-homepage/globalmetaid/{globalMetaId}?version=v2
```

Do not send `includeServices`, `includeProofs`, `includePresence`, or any other optional query
parameters. Future schema upgrades should only require changing the version value, such as from
`v2` to `v3`.

The custom homepage declaration is:

```json
{
  "uri": "metaapp://c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0",
  "renderer": "metaapp",
  "contentType": "application/vnd.metaapp"
}
```

For this phase, Browser only uses `uri`. It ignores `renderer` and `contentType`.

## Settings

Add a global Browser setting named `renderCustomBotPages`, defaulting to `true`.

This setting is global for the Browser runtime. It is not scoped to the current actor, local Bot,
wallet, or profile. The existing `botHomepageTemplateId` setting should also be treated as global:
choosing a built-in template once affects every local actor and every resolved Bot Page.

The setting only changes local rendering behavior. It does not change chain data or the
`/info/homepage` payload.

## Settings UI

The Templates tab should contain two sections:

1. A compact global toggle labeled `Render Custom Bot Pages`, defaulting to on.
2. The existing built-in Bot Page template selector.

The toggle label should have a question-mark icon with a hover/focus tooltip. The help text should
not be displayed inline in the settings panel.

Tooltip text:

```text
When enabled, Bot Pages can render the custom MetaApp or Metafile declared on /info/homepage. When disabled, Browser always uses the selected built-in template.
```

Any existing UI copy that says template changes apply to the selected local Bot should be corrected
to global Browser wording.

## Custom Homepage Detection

Treat a custom homepage as present only when:

- `data.homepage.custom` is an object; and
- `data.homepage.custom.uri` is a non-empty string after trimming.

These cases are not custom homepages and should render with the built-in template:

- `homepage.custom` is `null`;
- `homepage.custom` is missing;
- `homepage.custom` is an empty object;
- `homepage.custom.uri` is missing or an empty string.

This default-template fallback applies regardless of whether `renderCustomBotPages` is on or off.

## Resolve Flow

Use core resolver aliasing.

1. Resolve `metaid://{globalMetaId}` through the Bot homepage v2 endpoint.
2. If `renderCustomBotPages` is `false`, build the normal Bot Page result with the selected
   built-in template.
3. If no custom homepage is present, build the normal Bot Page result with the selected built-in
   template.
4. If a custom homepage is present and the setting is enabled, inspect `custom.uri`.
5. If `custom.uri` starts with `metaapp://`, resolve it through the existing MetaApp resolver.
6. If `custom.uri` starts with `metafile://`, resolve it through the existing Metafile resolver.
7. If the target resolver succeeds, return the target resource model while keeping
   `uri` and `normalizedUri` set to the outer `metaid://{globalMetaId}`.

The target resource model means:

- `resourceType` comes from the target resource;
- `owner` comes from the target resource;
- `proof` comes from the target resource;
- `actions` come from the target resource, with copy actions normalized to the outer `metaid://`
  URI;
- `renderer`, `status`, and target-specific source details come from the target resolver.

The Browser UI must not see or render an intermediate `metaapp://` or `metafile://` navigation
state. The resolver should return the final aliased result once, with `normalizedUri` already set
to the outer `metaid://` URI. This prevents address-bar flicker or rapid URI rewrites.

## Error Handling

When a custom homepage is present and the setting is enabled, custom rendering is authoritative.

- Unsupported schemes fail closed.
- Invalid custom URIs fail closed.
- MetaApp resolver failures fail closed.
- Metafile resolver failures fail closed.
- Do not fall back to the built-in Bot Page template after a custom URI failure.

The only fallback-to-template cases are disabled custom rendering or absent custom homepage data.

Existing target resolver semantics remain intact. For example, a Metafile with an unsupported
content type can still return a resolved unsupported renderer if that is how the Metafile resolver
classifies the resource.

## Source Metadata

The returned `source` should make the alias visible to Inspector and tests without changing the
address bar.

The target resolver remains the main source, but `source.raw` should include alias details such as:

- `aliasUri`: the outer `metaid://{globalMetaId}` URI;
- `customHomepageUri`: the target `metaapp://` or `metafile://` URI;
- `botHomepageSourceUrl`: the v2 homepage request URL;
- `botHomepageRaw`: the raw Bot homepage response data.

## Host Boundaries

Keep Browser core host-neutral.

- Core may decide whether a v2 Bot homepage aliases to `metaapp://` or `metafile://`.
- Core may reuse existing MetaApp and Metafile resolver inputs and result builders.
- Core must not import OAC, IDBots, SQLite, Metalet, or standalone host internals.
- Host adapters continue to provide the existing MetaApp resolver behavior, including standalone ZIP
  preview support where available.

## Verification

Implementation should add focused tests for:

- Bot homepage client requests only `?version=v2`.
- `renderCustomBotPages` defaults to `true`.
- Settings update persists `renderCustomBotPages` as a global Browser setting.
- Template settings are global Browser settings, not selected-actor settings.
- Custom `metaapp://` success returns `resourceType: "metaapp"` while `normalizedUri` remains the
  outer `metaid://` URI.
- Custom `metafile://` success returns the target file renderer while `normalizedUri` remains the
  outer `metaid://` URI.
- Empty or null custom homepage data uses the built-in template.
- Disabled custom rendering uses the built-in template even when custom data exists.
- Invalid or unsupported custom URIs fail without built-in-template fallback.
- The Templates tab shows the global toggle, question-mark tooltip, and built-in template selector
  without inline long help text.
- The Browser address input does not move through a visible custom URI intermediate state.

Run the full workspace gate after implementation:

```text
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```
