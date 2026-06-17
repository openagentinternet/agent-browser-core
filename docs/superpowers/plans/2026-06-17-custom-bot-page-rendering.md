# Custom Bot Page Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render custom Bot Pages declared in Bot homepage v2 as MetaApp or Metafile resources while keeping the Browser address bar on the original `metaid://` URI.

**Architecture:** Keep the behavior in shared Browser core by treating `homepage.custom.uri` as an alias target during `metaid://` resolution. Existing MetaApp and Metafile resolvers still own target resource behavior; the alias layer only decides when to delegate, preserves the outer URI, and records alias metadata. Browser settings remain global, and the UI updates settings without actor scoping.

**Tech Stack:** TypeScript workspace packages, Node.js 20.20.0, built-in `node:test`, shared Browser core/UI/standalone host packages.

---

## File Structure

- Modify `packages/core/src/browser/types.ts`
  - Add `renderCustomBotPages: boolean` to shared Browser config.
- Modify `packages/core/src/browser/config.ts`
  - Default `renderCustomBotPages` to `true` and resolve it from config.
- Modify `packages/core/src/browser/settings.ts`
  - Accept global `renderCustomBotPages` updates.
- Create `tests/browser/settings.test.mjs`
  - Cover defaults and settings update behavior.
- Modify `packages/core/src/browser/botHomepageClient.ts`
  - Fetch Bot homepage v2 with only `?version=v2`.
- Modify `tests/browser/botHomepageResolver.test.mjs`
  - Replace the v1/include query expectation with the v2-only query.
- Modify `packages/core/src/browser/browserResolver.ts`
  - Add custom homepage detection and alias delegation to MetaApp/Metafile resolution.
- Modify `tests/browser/browserResolver.test.mjs`
  - Cover custom MetaApp success, custom Metafile success, disabled setting fallback, empty custom fallback, and invalid custom failure.
- Modify `packages/ui/src/browser/app.ts`
  - Add global toggle UI and no-actor settings calls in the mature Browser shell.
- Modify `packages/ui/src/browserClientScript.ts`
  - Keep the exported legacy Browser client script aligned with the same global settings behavior.
- Modify `packages/ui/src/browserStyles.ts`
  - Add compact styling for the custom toggle, switch, and help icon.
- Modify `tests/ui/browserPageState.test.mjs`
  - Cover the Templates tab toggle, global settings calls, and no custom URI address flicker.
- Modify `tests/ui/browserInteractions.test.mjs` and `tests/ui/browserPage.test.mjs`
  - Cover generated script markers for the new toggle handler.
- Modify `tests/host-standalone/standaloneServer.test.mjs`
  - Assert standalone settings expose and update `renderCustomBotPages`.

## Task 1: Global Browser Setting Contract

**Files:**
- Create: `tests/browser/settings.test.mjs`
- Modify: `packages/core/src/browser/types.ts`
- Modify: `packages/core/src/browser/config.ts`
- Modify: `packages/core/src/browser/settings.ts`
- Modify: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Write failing settings tests**

Create `tests/browser/settings.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  createDefaultBrowserConfig,
  resolveBrowserConfig,
} = require('../../packages/core/dist/index.js');

test('Browser settings default to rendering custom Bot Pages globally', () => {
  const defaults = createDefaultBrowserConfig();
  const resolved = resolveBrowserConfig({});
  const snapshot = createBrowserSettingsSnapshot({ config: {} });

  assert.equal(defaults.renderCustomBotPages, true);
  assert.equal(resolved.renderCustomBotPages, true);
  assert.equal(snapshot.defaults.renderCustomBotPages, true);
  assert.equal(snapshot.effectiveBrowser.renderCustomBotPages, true);
});

test('Browser settings update custom rendering and template as global browser fields', () => {
  const current = {
    browser: {
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
    },
  };

  const updated = applyBrowserSettingsUpdate(current, {
    botHomepageTemplateId: 'compact-list',
    renderCustomBotPages: false,
  });
  const snapshot = createBrowserSettingsSnapshot({ config: updated });

  assert.equal(updated.browser.botHomepageTemplateId, 'compact-list');
  assert.equal(updated.browser.renderCustomBotPages, false);
  assert.equal(snapshot.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(snapshot.effectiveBrowser.renderCustomBotPages, false);
});

test('Browser settings reject non-boolean custom rendering values', () => {
  assert.throws(
    () => applyBrowserSettingsUpdate({}, { renderCustomBotPages: 'false' }),
    /browser\.renderCustomBotPages must be a boolean/,
  );
});
```

Update the settings section of `tests/host-standalone/standaloneServer.test.mjs`:

```js
  const settings = await json(await fetch(`${baseUrl}/api/browser/settings`));
  assert.equal(settings.ok, true);
  assert.equal(settings.data.effectiveBrowser.botHomepageTemplateId, 'document');
  assert.equal(settings.data.effectiveBrowser.renderCustomBotPages, true);

  const updated = await json(await fetch(`${baseUrl}/api/browser/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      browser: {
        botHomepageTemplateId: 'compact-list',
        renderCustomBotPages: false,
      },
    }),
  }));
  assert.equal(updated.ok, true);
  assert.equal(updated.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(updated.data.effectiveBrowser.renderCustomBotPages, false);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/settings.test.mjs tests/host-standalone/standaloneServer.test.mjs
```

Expected: `tests/browser/settings.test.mjs` fails because `renderCustomBotPages` is not defined.

- [ ] **Step 3: Add the config field**

In `packages/core/src/browser/types.ts`, add the field to `BrowserBaseConfig`:

```ts
export interface BrowserBaseConfig {
  metasoP2PBaseUrl: string;
  metafileContentBaseUrl: string;
  manApiBaseUrl: string;
  blockExplorerBaseUrl: string;
  walletApiBaseUrl?: string;
  botHomepageTemplateId: BotHomepageTemplateId;
  renderCustomBotPages: boolean;
  localMode: boolean;
}
```

In `packages/core/src/browser/config.ts`, add the default:

```ts
export function createDefaultBrowserConfig(): BrowserBaseConfig {
  return {
    metasoP2PBaseUrl: DEFAULT_METASO_P2P_BASE_URL,
    metafileContentBaseUrl: DEFAULT_METAFILE_CONTENT_BASE_URL,
    manApiBaseUrl: DEFAULT_MANAPI_BASE_URL,
    blockExplorerBaseUrl: DEFAULT_BLOCK_EXPLORER_BASE_URL,
    walletApiBaseUrl: '',
    botHomepageTemplateId: DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
    renderCustomBotPages: true,
    localMode: false,
  };
}
```

In `resolveBrowserConfig`, resolve the field from stored config:

```ts
    botHomepageTemplateId: normalizeBotHomepageTemplateId(browser.botHomepageTemplateId),
    renderCustomBotPages: typeof browser.renderCustomBotPages === 'boolean'
      ? browser.renderCustomBotPages
      : defaults.renderCustomBotPages,
    localMode: typeof browser.localMode === 'boolean' ? browser.localMode : defaults.localMode,
```

- [ ] **Step 4: Accept settings updates**

In `packages/core/src/browser/settings.ts`, add this block before the `localMode` block:

```ts
  if (Object.prototype.hasOwnProperty.call(browserInput, 'renderCustomBotPages')) {
    if (typeof browserInput.renderCustomBotPages !== 'boolean') {
      throw new Error('browser.renderCustomBotPages must be a boolean.');
    }
    nextBrowser.renderCustomBotPages = browserInput.renderCustomBotPages;
  }
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/settings.test.mjs tests/host-standalone/standaloneServer.test.mjs
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/browser/types.ts \
  packages/core/src/browser/config.ts \
  packages/core/src/browser/settings.ts \
  tests/browser/settings.test.mjs \
  tests/host-standalone/standaloneServer.test.mjs
git commit -m "feat: add custom bot page setting"
```

Post a Bob development journal for this commit with `metabot buzz post --from bob`.

## Task 2: Bot Homepage v2 Fetch Contract

**Files:**
- Modify: `tests/browser/botHomepageResolver.test.mjs`
- Modify: `packages/core/src/browser/botHomepageClient.ts`

- [ ] **Step 1: Update the failing homepage client test**

In `tests/browser/botHomepageResolver.test.mjs`, rename the first test and replace the expected URL:

```js
test('Bot homepage client fetches metaso-p2p botHomepage.v2 envelope', async () => {
  const calls = [];
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v1.json', import.meta.url), 'utf8'));
  const client = createBotHomepageClient({
    baseUrl: 'https://so.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: '', data: fixture }),
      };
    },
  });

  const result = await client.getByGlobalMetaId('idq1fixturebot');

  assert.equal(result.ok, true);
  assert.equal(result.data.profile.name, 'Fixture Bot');
  assert.deepEqual(calls, [
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1fixturebot?version=v2',
  ]);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/botHomepageResolver.test.mjs
```

Expected: the first test fails because the client still sends include parameters.

- [ ] **Step 3: Change the request URL**

In `packages/core/src/browser/botHomepageClient.ts`, replace URL construction in `getByGlobalMetaId`:

```ts
      const url = `${baseUrl}/api/bot-homepage/globalmetaid/${encodedId}?version=v2`;
```

- [ ] **Step 4: Run the targeted test**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/botHomepageResolver.test.mjs
```

Expected: all tests in `botHomepageResolver.test.mjs` pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/browser/botHomepageClient.ts tests/browser/botHomepageResolver.test.mjs
git commit -m "fix: request bot homepage v2"
```

Post a Bob development journal for this commit with `metabot buzz post --from bob`.

## Task 3: Core Custom Homepage Alias Resolver

**Files:**
- Modify: `tests/browser/browserResolver.test.mjs`
- Modify: `packages/core/src/browser/browserResolver.ts`

- [ ] **Step 1: Add failing alias resolver tests**

Append these helpers and tests to `tests/browser/browserResolver.test.mjs`:

```js
const customMetaAppPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';
const customMetafilePinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';

function browserConfig(overrides = {}) {
  return {
    metasoP2PBaseUrl: 'https://so.example.test',
    manApiBaseUrl: 'https://man.example.test',
    metafileContentBaseUrl: 'https://content.example.test/files',
    blockExplorerBaseUrl: 'https://explorer.example.test/tx',
    botHomepageTemplateId: 'document',
    defaultChainName: 'mvc',
    renderCustomBotPages: true,
    localMode: true,
    ...overrides,
  };
}

function homepageWithCustom(custom) {
  return {
    schemaVersion: 'botHomepage.v2',
    globalMetaId: 'idq1custombot',
    canonical: { globalMetaId: 'idq1custombot' },
    profile: { name: 'Custom Bot' },
    homepage: {
      mode: custom ? 'custom' : 'default',
      title: 'Custom Bot',
      summary: 'Custom summary.',
      custom,
    },
    proofs: { verificationState: 'partial' },
    source: { resolver: 'test-homepage' },
    actions: [
      { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: 'metaid://idq1custombot' },
    ],
  };
}

function metaAppRecord(pinId) {
  return {
    pinId,
    firstPinId: pinId,
    operation: 'create',
    title: 'Custom MetaApp',
    appName: 'custom-metaapp',
    version: '1.0.0',
    runtime: 'browser',
    indexFile: 'index.html',
    code: 'metafile://content-pin',
    content: 'metafile://content-pin',
    contentType: 'text/html',
    codeType: 'text/html',
    tags: [],
    ownerGlobalMetaId: 'idq1metaappowner',
    network: 'mvc',
    localUiUrl: '/api/metaapp/preview-assets/custom/index.html',
    updatedAt: 1780760000000,
    source: 'test',
  };
}

function homepageFetch(homepage) {
  return async (url) => {
    assert.equal(
      String(url),
      'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: '', data: homepage }),
    };
  };
}

test('resolveBrowserResource aliases custom metaapp homepage without rewriting normalized URI', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` })),
    metaAppLookup: async (pinId) => {
      assert.equal(pinId, customMetaAppPinId);
      return metaAppRecord(pinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://idq1custombot');
  assert.equal(result.data.normalizedUri, 'metaid://idq1custombot');
  assert.equal(result.data.resourceType, 'metaapp');
  assert.equal(result.data.owner.globalMetaId, 'idq1metaappowner');
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.aliasUri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.customHomepageUri, `metaapp://${customMetaAppPinId}`);
  assert.equal(result.data.source.raw.botHomepageRaw.homepage.custom.uri, `metaapp://${customMetaAppPinId}`);
});

test('resolveBrowserResource aliases custom metafile homepage without rewriting normalized URI', async () => {
  const fetchCalls = [];
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('https://so.example.test/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            message: '',
            data: homepageWithCustom({ uri: `metafile://${customMetafilePinId}.png` }),
          }),
        };
      }
      assert.equal(String(url), `https://man.example.test/pin/${customMetafilePinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: customMetafilePinId,
            path: '/file/custom-homepage.png',
            contentTypeDetect: 'image/png',
            globalMetaId: 'idq1fileowner',
            timestamp: 1780760000,
          },
        }),
      };
    },
    metaAppLookup: async () => {
      throw new Error('metafile custom homepage should not use MetaApp lookup');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://idq1custombot');
  assert.equal(result.data.normalizedUri, 'metaid://idq1custombot');
  assert.equal(result.data.resourceType, 'image');
  assert.equal(result.data.renderer.type, 'image');
  assert.equal(result.data.renderer.url, `https://content.example.test/files/${customMetafilePinId}`);
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://idq1custombot');
  assert.deepEqual(fetchCalls, [
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
    `https://man.example.test/pin/${customMetafilePinId}`,
  ]);
});

test('resolveBrowserResource uses built-in template when custom rendering is disabled', async () => {
  let metaAppLookupCalled = false;
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig({ renderCustomBotPages: false }),
    fetch: homepageFetch(homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` })),
    metaAppLookup: async () => {
      metaAppLookupCalled = true;
      return metaAppRecord(customMetaAppPinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'bot');
  assert.equal(result.data.renderer.type, 'bot-page');
  assert.equal(metaAppLookupCalled, false);
});

test('resolveBrowserResource uses built-in template when custom uri is empty', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: '   ' })),
    metaAppLookup: async () => {
      throw new Error('empty custom uri should not resolve MetaApp');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'bot');
  assert.equal(result.data.renderer.type, 'bot-page');
});

test('resolveBrowserResource fails closed for unsupported custom homepage uri', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: 'https://example.test/custom-homepage' })),
    metaAppLookup: async () => {
      throw new Error('unsupported custom uri should fail before MetaApp lookup');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_browser_uri');
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/browserResolver.test.mjs
```

Expected: the new alias tests fail because `resolveBrowserResource` always returns `bot-page` for `metaid://`.

- [ ] **Step 3: Add resolver helpers**

In `packages/core/src/browser/browserResolver.ts`, add helpers near the top of the file:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCustomHomepageUri(homepage: Record<string, unknown>): string {
  const homepageInfo = isRecord(homepage.homepage) ? homepage.homepage : {};
  const custom = isRecord(homepageInfo.custom) ? homepageInfo.custom : {};
  return text(custom.uri);
}

function aliasCopyActions(actions: BrowserResolveResult['actions'], aliasUri: string): BrowserResolveResult['actions'] {
  return actions.map((action) => (
    action.id === 'copy-uri' || action.kind === 'copy'
      ? { ...action, uri: aliasUri }
      : action
  ));
}

function aliasCustomHomepageResult(input: {
  result: BrowserResolveResult;
  aliasUri: string;
  customHomepageUri: string;
  botHomepageSourceUrl: string;
  botHomepageRaw: Record<string, unknown>;
}): BrowserResolveResult {
  return {
    ...input.result,
    uri: input.aliasUri,
    normalizedUri: input.aliasUri,
    actions: aliasCopyActions(input.result.actions, input.aliasUri),
    source: {
      ...input.result.source,
      raw: {
        ...(input.result.source.raw ?? {}),
        aliasUri: input.aliasUri,
        customHomepageUri: input.customHomepageUri,
        botHomepageSourceUrl: input.botHomepageSourceUrl,
        botHomepageRaw: input.botHomepageRaw,
      },
    },
  };
}
```

- [ ] **Step 4: Factor MetaApp resolution into a helper**

In the same file, move the existing MetaApp branch into a helper:

```ts
async function resolveMetaAppResource(input: {
  parsed: ReturnType<typeof parseBrowserUri>;
  request: ResolveBrowserResourceInput;
}): Promise<BrowserCommandResult<BrowserResolveResult>> {
  let record: MetaAppGalleryRecord | null;
  if (input.request.metaAppResolve) {
    const resolved = await input.request.metaAppResolve(input.parsed.id);
    if (!resolved.ok) {
      return resolved;
    }
    record = resolved.data;
  } else if (input.request.metaAppLookup) {
    record = await input.request.metaAppLookup(input.parsed.id);
  } else {
    record = null;
  }
  if (!record) {
    return browserCommandFailed('browser_resource_not_found', 'Resource not found.');
  }

  return browserCommandSuccess(buildMetaAppResolveResult({
    uri: input.parsed.originalUri,
    normalizedUri: input.parsed.normalizedUri,
    record,
    fetchedAt: Date.now(),
  }));
}
```

Replace the bottom MetaApp branch with:

```ts
  return resolveMetaAppResource({ parsed, request: input });
```

- [ ] **Step 5: Add custom homepage delegation**

Inside the `parsed.scheme === 'metaid'` branch, after the homepage fetch succeeds and before returning `buildBotPageResolveResult`, add:

```ts
    const aliasUri = parsed.normalizedUri;
    const customHomepageUri = readCustomHomepageUri(homepage.data);
    if (input.config.renderCustomBotPages !== false && customHomepageUri) {
      let customParsed;
      try {
        customParsed = parseBrowserUri(customHomepageUri);
      } catch (error) {
        return browserCommandFailed('invalid_browser_uri', error instanceof Error ? error.message : String(error));
      }

      if (customParsed.scheme !== 'metaapp' && customParsed.scheme !== 'metafile') {
        return browserCommandFailed('invalid_browser_uri', 'Custom Bot Page URI must use metaapp:// or metafile://.');
      }

      const customResolved = customParsed.scheme === 'metafile'
        ? await resolveMetafilePinToResource({
          uri: customParsed.originalUri,
          id: customParsed.id,
          fetch: input.fetch,
          manApiBaseUrl: input.config.manApiBaseUrl,
          metafileContentBaseUrl: input.config.metafileContentBaseUrl,
        })
        : await resolveMetaAppResource({ parsed: customParsed, request: input });

      if (!customResolved.ok) {
        return customResolved;
      }

      return browserCommandSuccess(aliasCustomHomepageResult({
        result: customResolved.data,
        aliasUri,
        customHomepageUri,
        botHomepageSourceUrl: homepage.url,
        botHomepageRaw: homepage.data,
      }));
    }
```

Keep the existing Bot Page return as the fallback for disabled custom rendering or absent custom data.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/browserResolver.test.mjs tests/browser/metafileResolver.test.mjs tests/browser/metaAppResolver.test.mjs
```

Expected: all listed tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/browser/browserResolver.ts tests/browser/browserResolver.test.mjs
git commit -m "feat: resolve custom bot page aliases"
```

Post a Bob development journal for this commit with `metabot buzz post --from bob`.

## Task 4: Templates Settings UI

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Modify: `packages/ui/src/browserClientScript.ts`
- Modify: `packages/ui/src/browserStyles.ts`
- Modify: `tests/ui/browserPageState.test.mjs`
- Modify: `tests/ui/browserInteractions.test.mjs`
- Modify: `tests/ui/browserPage.test.mjs`

- [ ] **Step 1: Add failing UI state tests**

In `tests/ui/browserPageState.test.mjs`, add `renderCustomBotPages` to the default `settingsData.browser`, `settingsData.effectiveBrowser`, and `settingsData.defaults` objects:

```js
      renderCustomBotPages: true,
```

Update existing settings call assertions in the cache and template tests:

```js
  assert.equal(fetchCalls.at(-2), '/api/browser/settings');
  assert.equal(fetchCalls.at(-1), '/api/browser/cache?actorId=worker');
```

After `await context.selectBotHomepageTemplate('compact-list');`, assert that settings calls are global:

```js
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
```

Add a test for the toggle UI:

```js
test('Browser template settings render global custom Bot Page toggle with tooltip help', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('templates');

  const html = elements['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /Render Custom Bot Pages/);
  assert.match(html, /data-browser-custom-pages-toggle/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /data-browser-custom-pages-help/);
  assert.doesNotMatch(html, />When enabled, Bot Pages can render the custom MetaApp or Metafile declared on \/info\/homepage/);
});
```

Add a test for toggling and re-resolving with the outer URI:

```js
test('Browser custom Bot Page toggle saves globally and re-resolves the current URI', async () => {
  const { context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1custombot',
  });

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('templates');
  await context.toggleCustomBotPages();

  assert.equal(context.state.settingsData.browser.renderCustomBotPages, false);
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
  assert.ok(fetchCalls.includes('/api/browser/settings'));
  assert.ok(fetchCalls.filter((call) => call.startsWith('/api/browser/resolve?uri=metaid%3A%2F%2Fidq1custombot')).length >= 2);
  assert.equal(context.state.current.normalizedUri, 'metaid://idq1custombot');
});
```

- [ ] **Step 2: Add generated script marker tests**

In `tests/ui/browserInteractions.test.mjs`, extend the first test:

```js
  assert.match(script, /function toggleCustomBotPages\(/);
  assert.match(script, /data-browser-custom-pages-toggle/);
  assert.match(script, /data-browser-custom-pages-help/);
```

In `tests/ui/browserPage.test.mjs`, add:

```js
  assert.match(definition.script, /async function toggleCustomBotPages\(\)/);
```

- [ ] **Step 3: Run UI tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageState.test.mjs tests/ui/browserInteractions.test.mjs tests/ui/browserPage.test.mjs
```

Expected: tests fail because the toggle and no-actor settings calls do not exist.

- [ ] **Step 4: Update mature Browser app settings UI**

In `packages/ui/src/browser/app.ts`, add constants and helpers near the settings helpers:

```js
var CUSTOM_BOT_PAGE_HELP = 'When enabled, Bot Pages can render the custom MetaApp or Metafile declared on /info/homepage. When disabled, Browser always uses the selected built-in template.';

function browserSettingsEndpoint() {
  return browserEndpoints.settings;
}

function customBotPagesEnabled() {
  var value = settingValue('renderCustomBotPages');
  return value !== false;
}
```

Update `loadBrowserSettingsData`, `saveBrowserSettings`, and `selectBotHomepageTemplate` so settings use `browserSettingsEndpoint()` instead of `endpointWithActor(browserEndpoints.settings)`. Keep cache calls on `endpointWithActor(browserEndpoints.cache)`.

Replace the start of `renderTemplateSettings()` with a toggle section:

```js
function renderTemplateSettings() {
  var selectedId = selectedBotHomepageTemplateId();
  var customEnabled = customBotPagesEnabled();
  return '<section class="browser-template-panel">' +
    '<section class="browser-custom-pages-setting">' +
      '<div class="browser-custom-pages-label"><strong>Render Custom Bot Pages</strong>' +
        '<button type="button" class="browser-help-icon" data-browser-custom-pages-help aria-label="Custom Bot Page rendering help" title="' + escapeHtml(CUSTOM_BOT_PAGE_HELP) + '">?</button></div>' +
      '<button type="button" class="browser-switch" role="switch" data-browser-custom-pages-toggle aria-checked="' + (customEnabled ? 'true' : 'false') + '">' +
        '<span>' + (customEnabled ? 'On' : 'Off') + '</span></button>' +
    '</section>' +
    '<section class="browser-template-builtins">' +
      '<div class="browser-settings-section-label">Built-in Template</div>' +
      '<div class="browser-template-options">' + browserBotHomepageTemplates.map(function (template) {
```

Close the new `browser-template-builtins` section before the end of the template panel:

```js
      }).join('') + '</div>' +
    '</section>' +
  '</section>';
}
```

Add a toggle handler near `selectBotHomepageTemplate`:

```js
async function toggleCustomBotPages() {
  var nextValue = !customBotPagesEnabled();
  var result = await api(browserSettingsEndpoint(), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ browser: { renderCustomBotPages: nextValue } })
  });
  state.settingsData = result;
  setStatus('saved', '');
  renderBrowserSettingsModal();
  var uri = state.current && state.current.uri || elements.input && elements.input.value || '';
  if (uri) {
    await resolveUri(uri, { record: false });
  }
  return result;
}
```

Add the click handler in the modal event block:

```js
      var customToggle = closestWithAttribute(event && event.target, 'data-browser-custom-pages-toggle');
      if (customToggle) {
        toggleCustomBotPages().catch(function (error) {
          setStatus('error', error && error.message ? error.message : 'Settings update failed.');
        });
        return;
      }
```

Expose it with the other test globals:

```js
globalThis.toggleCustomBotPages = toggleCustomBotPages;
```

- [ ] **Step 5: Update the legacy exported client script**

In `packages/ui/src/browserClientScript.ts`, mirror the same setting behavior:

- Add `CUSTOM_BOT_PAGE_HELP`.
- Add `browserSettingsEndpoint()`.
- Use `fetch(browserSettingsEndpoint())` for settings GET/PUT.
- Add the same `role="switch"` toggle markup to `renderTemplateSettings()`.
- Add `toggleCustomBotPages()` that PUTs `{ browser: { renderCustomBotPages: nextValue } }`.
- Re-resolve the current URI after toggling.
- Add the click handler for `data-browser-custom-pages-toggle`.

Use the same data attributes as the mature Browser app:

```html
data-browser-custom-pages-toggle
data-browser-custom-pages-help
```

- [ ] **Step 6: Add compact styles**

In `packages/ui/src/browserStyles.ts`, add styles that keep the setting compact:

```css
.browser-custom-pages-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.browser-custom-pages-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.browser-help-icon {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  padding: 0;
}

.browser-switch {
  min-width: 64px;
}

.browser-settings-section-label {
  margin: 16px 0 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: #4b5563;
}
```

Match the current `browserStyles.ts` style by using existing raw color values instead of adding CSS variables.

- [ ] **Step 7: Run targeted UI tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageState.test.mjs tests/ui/browserInteractions.test.mjs tests/ui/browserPage.test.mjs
```

Expected: all listed UI tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/app.ts \
  packages/ui/src/browserClientScript.ts \
  packages/ui/src/browserStyles.ts \
  tests/ui/browserPageState.test.mjs \
  tests/ui/browserInteractions.test.mjs \
  tests/ui/browserPage.test.mjs
git commit -m "feat: add custom bot page settings UI"
```

Post a Bob development journal for this commit with `metabot buzz post --from bob`.

## Task 5: Address-Bar Alias Regression Coverage

**Files:**
- Modify: `tests/ui/browserPageState.test.mjs`
- Modify: `tests/ui/browserPageRenderers.test.mjs`

- [ ] **Step 1: Add address-bar no-flicker state test**

In `tests/ui/browserPageState.test.mjs`, add:

```js
test('Browser preserves metaid address when resolver returns custom target resource model', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1custombot',
    resolveResponse: () => ({
      ok: true,
      data: {
        uri: 'metaid://idq1custombot',
        normalizedUri: 'metaid://idq1custombot',
        resourceType: 'metaapp',
        title: 'Custom MetaApp',
        owner: {
          kind: 'metaapp-publisher',
          globalMetaId: 'idq1metaappowner',
          name: 'idq1metaappowner',
          verificationState: 'partial',
        },
        renderer: {
          type: 'html-iframe',
          contentType: 'text/html',
          url: '/api/metaapp/preview-assets/custom/index.html',
        },
        status: { state: 'resolved', verificationState: 'partial', message: 'MetaApp resolved.' },
        proof: { pinId: 'custom-pin', protocolPath: '/protocols/metaapp', verificationState: 'partial' },
        source: {
          resolver: 'metaapp-cache',
          raw: {
            aliasUri: 'metaid://idq1custombot',
            customHomepageUri: 'metaapp://custom-pin',
          },
        },
        actions: [
          { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: 'metaid://idq1custombot' },
        ],
      },
    }),
  });

  await waitFor(() => elements['[data-browser-uri-input]'].value === 'metaid://idq1custombot', 'aliased address');
  assert.equal(context.state.current.resourceType, 'metaapp');
  assert.equal(context.state.current.normalizedUri, 'metaid://idq1custombot');
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1custombot');
  assert.equal(fetchCalls.some((call) => call.includes('metaapp%3A%2F%2F')), false);
});
```

- [ ] **Step 2: Add renderer test for aliased custom resources**

In `tests/ui/browserPageRenderers.test.mjs`, add a test that renders an aliased MetaApp result:

```js
test('custom Bot Page alias renders target renderer while preserving source details', async () => {
  const payload = result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: '/api/metaapp/preview-assets/custom/index.html',
  }, {
    uri: 'metaid://idq1custombot',
    normalizedUri: 'metaid://idq1custombot',
    resourceType: 'metaapp',
    source: {
      resolver: 'metaapp-cache',
      raw: {
        aliasUri: 'metaid://idq1custombot',
        customHomepageUri: 'metaapp://custom-pin',
      },
    },
  });
  const { context, nodes } = runWithResolve(payload);

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'aliased custom render');
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /src="\/api\/metaapp\/preview-assets\/custom\/index\.html"/);
  assert.equal(context.state.current.normalizedUri, 'metaid://idq1custombot');
  assert.equal(context.state.current.source.raw.customHomepageUri, 'metaapp://custom-pin');
});
```

- [ ] **Step 3: Run targeted UI regression tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build && \
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageState.test.mjs tests/ui/browserPageRenderers.test.mjs
```

Expected: both files pass.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/browserPageState.test.mjs tests/ui/browserPageRenderers.test.mjs
git commit -m "chore: cover custom bot page address alias"
```

Post a Bob development journal for this commit with `metabot buzz post --from bob`.

## Task 6: Full Verification

**Files:**
- No source files should be modified in this task unless verification exposes a defect from Tasks 1-5.

- [ ] **Step 1: Run release guard checks for host-neutral boundaries**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/hostNeutralGuardrails.test.mjs
```

Expected: pass. This proves the custom resolver did not import OAC, IDBots, SQLite, Metalet, or standalone host internals into shared packages.

- [ ] **Step 2: Run the full workspace gate**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

Expected: build passes and all tests pass.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted source or test changes remain.

- [ ] **Step 4: Record verification result**

If verification required no fixes, do not create a commit. If verification exposed a defect and the fix changed source or tests, commit only the files changed for that fix:

```bash
git add <changed-files>
git commit -m "fix: stabilize custom bot page rendering"
```

Post a Bob development journal only when a new commit is created.
