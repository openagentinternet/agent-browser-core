# Agent Browser Core OAC Browser Parity Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the mature OAC Browser module into ABC so ABC standalone becomes the visible, usable Browser development baseline.

**Architecture:** Copy the current OAC Browser implementation first, then adapt imports and host boundaries. ABC owns the Browser UI/core packages; standalone provides a mock wallet actor; OAC remains unchanged until a later consumption plan.

**Tech Stack:** Node.js `>=20 <25`, TypeScript strict mode, npm workspaces, CommonJS/ESM package output, Node `http`, Node's built-in `node:test`, Browser/Playwright screenshot smoke for visual acceptance.

---

## Operating Rules

- Work in `/Users/tusm/Documents/MetaID_Projects/agent-browser-core`.
- Start from the branch that contains the accepted ABC `0.2.x` contract/package baseline.
- Create a feature branch such as `codex/abc-0.3-oac-browser-parity-extraction`.
- Do not edit `/Users/tusm/Documents/MetaID_Projects/open-agent-connect` in this phase.
- Treat OAC Browser source files as read-only source material.
- Do not replace OAC's Browser with ABC in this phase.
- Do not redesign the Browser UI.
- Do not keep the current ABC `0.2.x` low-fidelity shared UI as the product baseline.
- Commit each task separately.
- Post a Bob Buzz development journal for every commit, per repository rules.

## Source Of Truth

Read these OAC files before implementation:

- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/index.html`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/app.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/menuModel.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/page.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/http.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/adapter.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/server.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/main.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/*`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/*`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPage*.test.mjs`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/fixtures/browser/*`

## Target File Structure

Expected ABC files after this plan:

```text
packages/
  core/
    src/
      browser/
        botHomepageClient.ts
        botHomepageTemplates.ts
        botPageResolver.ts
        browserResolver.ts
        config.ts
        metaAppResolver.ts
        metaAppPinResolver.ts
        settings.ts
        types.ts
        uri.ts
      index.ts
  host-contract/
    src/index.ts
  host-standalone/
    src/
      adapter.ts
      http.ts
      index.ts
      main.ts
      server.ts
  ui/
    src/
      browser/
        app.ts
        indexHtml.ts
        menuModel.ts
        page.ts
      index.ts
tests/
  browser/
  fixtures/browser/
  ui/
    browserPageActions.test.mjs
    browserPageInspector.test.mjs
    browserPageLayout.test.mjs
    browserPageRenderers.test.mjs
    browserPageState.test.mjs
```

If a different internal folder name is chosen, keep the public exports equivalent and document the
reason in the task commit message.

## Task 1: Add Parity Failure Tests And Fixtures

**Files:**

- Create: `tests/fixtures/browser/botHomepage.v1.json`
- Create: `tests/ui/browserPageRenderers.test.mjs`
- Create: `tests/ui/browserPageLayout.test.mjs`
- Create: `tests/browser/browserStandaloneServer.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Copy the Bot homepage fixture**

Copy:

```bash
mkdir -p tests/fixtures/browser
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/fixtures/browser/botHomepage.v1.json tests/fixtures/browser/botHomepage.v1.json
```

- [ ] **Step 2: Copy representative OAC Browser tests**

Copy the smallest useful first set:

```bash
mkdir -p tests/browser tests/ui
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageRenderers.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageLayout.test.mjs tests/ui/browserPageLayout.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/browserStandaloneServer.test.mjs tests/browser/browserStandaloneServer.test.mjs
```

- [ ] **Step 3: Adjust import paths in copied tests**

Replace OAC dist imports with ABC package dist imports:

```text
../../dist/ui/pages/browser/app.js
```

becomes:

```text
../../packages/ui/dist/browser/app.js
```

Replace:

```text
../../dist/browser/standalone/server.js
../../dist/browser/standalone/adapter.js
../../dist/core/metaapp/zipArchive.js
```

with ABC package paths:

```text
../../packages/host-standalone/dist/server.js
../../packages/host-standalone/dist/adapter.js
```

If `zipArchive.js` is not available in ABC, keep the MetaApp ZIP preview test skipped in Task 1
with a comment that Task 4 must either port the host-neutral ZIP helper or replace the test with a
fixture-backed preview asset test.

- [ ] **Step 4: Add focused scripts**

Add scripts to root `package.json`:

```json
{
  "scripts": {
    "test:browser-parity": "npm run build && node --test tests/browser/*.test.mjs tests/ui/browserPage*.test.mjs",
    "dev:standalone": "node packages/host-standalone/dist/main.js"
  }
}
```

Keep existing scripts. Do not remove `verify`, `verify:packages`, or release scripts.

- [ ] **Step 5: Verify tests fail for the right reason**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run test:browser-parity
```

Expected: FAIL because `packages/ui/dist/browser/app.js` and the mature standalone server modules
do not exist yet.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/fixtures/browser tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageLayout.test.mjs tests/browser/browserStandaloneServer.test.mjs
git commit -m "test: add browser parity baseline"
```

Post a Bob Buzz journal describing that the tests intentionally capture OAC Browser parity before
the implementation exists.

## Task 2: Port The Mature Browser UI Package

**Files:**

- Create: `packages/ui/src/browser/app.ts`
- Create: `packages/ui/src/browser/indexHtml.ts`
- Create: `packages/ui/src/browser/menuModel.ts`
- Create: `packages/ui/src/browser/page.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Create the Browser UI folder**

```bash
mkdir -p packages/ui/src/browser
```

- [ ] **Step 2: Copy OAC `app.ts`**

Copy OAC's mature Browser app source:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/app.ts packages/ui/src/browser/app.ts
```

Adjust only the imports at the top:

```ts
import {
  BROWSER_BASE_URL_FIELDS,
  BROWSER_BOT_HOMEPAGE_TEMPLATES,
  BROWSER_MENU_SECTIONS,
  BROWSER_SETTINGS_TABS,
} from './menuModel.js';
```

Do not rewrite renderer functions. In particular, keep the mature functions for:

- `renderBotHomepageDocumentTemplate`;
- `renderBotHomepageCompactListTemplate`;
- `renderRenderer`;
- `openUsingIdentitySelector`;
- `selectBotHomepageTemplate`;
- private chat and service-call modals;
- drawer, inspector, and share UI.

- [ ] **Step 3: Copy OAC `menuModel.ts`**

Copy:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/menuModel.ts packages/ui/src/browser/menuModel.ts
```

Replace the import:

```ts
import {
  BOT_HOMEPAGE_TEMPLATES,
  type BotHomepageTemplateDefinition,
} from '@openagentinternet/agent-browser-core';
```

If TypeScript cannot resolve the package self-reference during workspace build, use the relative
core source import:

```ts
import {
  BOT_HOMEPAGE_TEMPLATES,
  type BotHomepageTemplateDefinition,
} from '../../../core/src/index.js';
```

Prefer the package import if it builds cleanly.

- [ ] **Step 4: Convert OAC `index.html` into a TS template**

Generate `packages/ui/src/browser/indexHtml.ts` from OAC `src/browser/index.html`:

```bash
node - <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const source = '/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/index.html';
const target = 'packages/ui/src/browser/indexHtml.ts';
const html = readFileSync(source, 'utf8');
const body = [
  '// Generated from OAC src/browser/index.html during Browser parity extraction.',
  '// Keep this file aligned with the mature Browser template until OAC consumes ABC.',
  `export const BROWSER_INDEX_HTML = ${JSON.stringify(html)};`,
  '',
].join('\n');
writeFileSync(target, body);
NODE
```

Keep the mature inline CSS intact. Do not replace it with the current ABC `browserStyles.ts`.

- [ ] **Step 5: Port page rendering**

Create `packages/ui/src/browser/page.ts`:

```ts
import { buildBrowserPageDefinition, type BrowserPageDefinition } from './app.js';
import { BROWSER_INDEX_HTML } from './indexHtml.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function renderBrowserPageHtml(
  definition: BrowserPageDefinition = buildBrowserPageDefinition(),
  languagePreference?: string | null,
): Promise<string> {
  const language = languagePreference?.trim() || 'en';
  const content = definition.contentHtml ?? '';
  return BROWSER_INDEX_HTML
    .replace(/<html lang="en">/g, `<html lang="${escapeHtml(language)}">`)
    .replace(/__PAGE_TITLE__/g, escapeHtml(definition.title))
    .replace(/__PAGE_EYEBROW__/g, escapeHtml(definition.eyebrow))
    .replace(/__PAGE_HEADING__/g, escapeHtml(definition.heading))
    .replace(/__PAGE_DESCRIPTION__/g, escapeHtml(definition.description))
    .replace(/__PAGE_NAV__/g, '')
    .replace(/__PAGE_PANELS__/g, '')
    .replace(/__PAGE_CONTENT__/g, content)
    .replace(/__PAGE_SCRIPT__/g, definition.script);
}
```

This intentionally avoids OAC's i18n dependency. The client script still contains the OAC Browser
Chinese copy fallback.

- [ ] **Step 6: Export the mature UI**

Update `packages/ui/src/index.ts` to export the mature Browser API:

```ts
export {
  buildBrowserPageDefinition,
  type BrowserPageDefinition,
  type BrowserPagePanelDefinition,
} from './browser/app.js';
export { renderBrowserPageHtml } from './browser/page.js';
export {
  BROWSER_BASE_URL_FIELDS,
  BROWSER_BOT_HOMEPAGE_TEMPLATES,
  BROWSER_MENU_SECTIONS,
  BROWSER_SETTINGS_TABS,
} from './browser/menuModel.js';
```

Keep old exports only if they do not conflict. If old low-fidelity exports conflict, remove them
from the package root and update tests accordingly.

- [ ] **Step 7: Update package files**

Ensure `packages/ui/package.json` includes built browser submodules:

```json
{
  "files": [
    "dist/**",
    "dist-cjs/**",
    "package.json",
    "README.md"
  ]
}
```

If the package uses explicit `exports`, add subpath exports for:

```json
{
  "./browser": {
    "types": "./dist/browser/app.d.ts",
    "import": "./dist/browser/app.js",
    "require": "./dist-cjs/browser/app.js"
  }
}
```

The root export must continue to expose the mature page-rendering API.

- [ ] **Step 8: Run focused UI build/tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPageRenderers.test.mjs tests/ui/browserPageLayout.test.mjs
```

Expected: renderer and layout tests pass or fail only because core Browser types are not ported
yet. Fix UI import/build issues before continuing.

- [ ] **Step 9: Commit**

```bash
git add packages/ui tests/ui
git commit -m "feat: port mature browser ui"
```

Post a Bob Buzz journal with the UI parity scope and any intentionally preserved OAC behavior.

## Task 3: Port Browser Core Types, Settings, And Resolvers

**Files:**

- Create: `packages/core/src/browser/types.ts`
- Create: `packages/core/src/browser/uri.ts`
- Create: `packages/core/src/browser/config.ts`
- Create: `packages/core/src/browser/settings.ts`
- Create: `packages/core/src/browser/botHomepageClient.ts`
- Create: `packages/core/src/browser/botPageResolver.ts`
- Create: `packages/core/src/browser/browserResolver.ts`
- Create: `packages/core/src/browser/metaAppResolver.ts`
- Create or adapt: `packages/core/src/browser/metaAppPinResolver.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: copied and adapted `tests/browser/*.test.mjs`

- [ ] **Step 1: Create core browser folder**

```bash
mkdir -p packages/core/src/browser
```

- [ ] **Step 2: Copy OAC browser core files**

Copy the host-neutral browser core files:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/types.ts packages/core/src/browser/types.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/uri.ts packages/core/src/browser/uri.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/config.ts packages/core/src/browser/config.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/settings.ts packages/core/src/browser/settings.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/botHomepageClient.ts packages/core/src/browser/botHomepageClient.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/botPageResolver.ts packages/core/src/browser/botPageResolver.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/browserResolver.ts packages/core/src/browser/browserResolver.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/metaAppResolver.ts packages/core/src/browser/metaAppResolver.ts
```

- [ ] **Step 3: Replace OAC config imports**

In `packages/core/src/browser/config.ts` and `settings.ts`, replace OAC `MetabotConfig` imports
with host-neutral Browser config types:

```ts
export interface BrowserBaseConfig {
  metasoP2PBaseUrl: string;
  metafileContentBaseUrl: string;
  manApiBaseUrl: string;
  blockExplorerBaseUrl: string;
  walletApiBaseUrl?: string;
  botHomepageTemplateId: string;
  localMode: boolean;
}

export interface BrowserConfigContainer {
  browser?: Partial<BrowserBaseConfig>;
}
```

Create a default config function equivalent to the OAC defaults needed by Browser:

```ts
export function createDefaultBrowserConfig(): BrowserBaseConfig {
  return {
    metasoP2PBaseUrl: 'https://so.metaid.io',
    metafileContentBaseUrl: 'https://so.metaid.io/content',
    manApiBaseUrl: 'https://manapi.metaid.io',
    blockExplorerBaseUrl: 'https://www.mvcscan.com/tx',
    walletApiBaseUrl: '',
    botHomepageTemplateId: 'document',
    localMode: false,
  };
}
```

Keep OAC's validation behavior for base URLs and template IDs.

- [ ] **Step 4: Reuse ABC template definitions**

If OAC `botHomepageTemplates.ts` conflicts with existing ABC
`packages/core/src/templates/botHomepageTemplates.ts`, do not duplicate definitions. Export the
existing ABC template functions through `packages/core/src/browser/botHomepageTemplates.ts`:

```ts
export {
  BOT_HOMEPAGE_TEMPLATES,
  DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  isBotHomepageTemplateId,
  normalizeBotHomepageTemplateId,
  type BotHomepageTemplateDefinition,
  type BotHomepageTemplateId,
} from '../templates/botHomepageTemplates.js';
```

- [ ] **Step 5: Adapt MetaApp resolver dependencies**

Port only host-neutral pieces needed by Browser:

- MetaApp record type;
- ManAPI pin fetch;
- content URL resolution;
- preview session creation callback;
- renderer type selection.

Do not import OAC `core/metaapp/*` directly. If a small type is needed, define it in
`packages/core/src/browser/types.ts`.

- [ ] **Step 6: Export core Browser API**

Update `packages/core/src/index.ts`:

```ts
export * from './browser/types.js';
export * from './browser/uri.js';
export * from './browser/config.js';
export * from './browser/settings.js';
export * from './browser/botHomepageClient.js';
export * from './browser/botPageResolver.js';
export * from './browser/browserResolver.js';
export * from './browser/metaAppResolver.js';
```

Keep existing `parseBrowserUri`, template, and resource exports compatible where possible.

- [ ] **Step 7: Add core tests from OAC**

Copy and adapt:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/uri.test.mjs tests/browser/uri.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/botHomepageResolver.test.mjs tests/browser/botHomepageResolver.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/browserResolver.test.mjs tests/browser/browserResolver.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser/metaAppResolver.test.mjs tests/browser/metaAppResolver.test.mjs
```

Replace every copied test import whose path starts with `../../dist/core/browser/` so it starts
with `../../packages/core/dist/browser/` instead.

- [ ] **Step 8: Run focused core tests**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/uri.test.mjs tests/browser/botHomepageResolver.test.mjs tests/browser/browserResolver.test.mjs tests/browser/metaAppResolver.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core tests/browser
git commit -m "feat: port browser core resolvers"
```

Post a Bob Buzz journal describing the core extraction and host-neutral substitutions.

## Task 4: Reconcile The Host Contract With The Mature Browser UI

**Files:**

- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Test: `tests/host-contract/*.test.mjs`
- Test: `tests/test-harness/*.test.mjs`

- [ ] **Step 1: Update contract resource types**

Make `BrowserHostAdapter.resolveResource()` return the mature Browser resolve result shape from
`@openagentinternet/agent-browser-core`.

The contract should expose:

```ts
import type { BrowserResolveResult } from '@openagentinternet/agent-browser-core';

export interface BrowserHostAdapter {
  getRuntime(input?: BrowserRuntimeInput): Promise<BrowserCommandResult<BrowserRuntimeSnapshot>>;
  resolveResource(input: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResolveResult>>;
  getSettings(input?: BrowserSettingsInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  updateSettings(input: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  getCache(input?: BrowserCacheInput): Promise<BrowserCommandResult<BrowserCacheSnapshot>>;
  clearCache(input: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>>;
  runTrustedAction(input: BrowserTrustedActionInput): Promise<BrowserCommandResult<BrowserTrustedActionResult>>;
}
```

If importing core types from host-contract creates a package cycle, duplicate only the minimal
resource type definitions in host-contract for this milestone, then document that a later package
boundary cleanup should move shared types to a no-dependency package.

- [ ] **Step 2: Preserve command states**

Keep all `0.2.x` command states:

```ts
export type BrowserCommandState = 'success' | 'failed' | 'waiting' | 'manual_action_required';
```

Do not regress `browserWaiting()` or `browserManualActionRequired()` helpers.

- [ ] **Step 3: Align trusted action kinds**

Include all OAC UI action kinds:

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
  | 'share-resource';
```

The UI may still receive OAC resolver actions such as `copy`, `proof`, `creator`, and
`service-list` inside resource data. Host trusted actions should use normalized host action kinds.

- [ ] **Step 4: Update conformance harness**

Extend harness checks to require:

- runtime has host, actors, defaultActor, features, and labels;
- resolve returns `uri`, `normalizedUri`, `resourceType`, `title`, `owner`, `renderer`, `status`,
  and `source`;
- settings update accepts `botHomepageTemplateId`;
- cache clear accepts `all`;
- trusted action returns success, failed, waiting, or manual action required with valid fields.

- [ ] **Step 5: Run contract tests**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/host-contract/*.test.mjs tests/test-harness/*.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/host-contract packages/test-harness tests/host-contract tests/test-harness
git commit -m "feat: align host contract with browser parity ui"
```

Post a Bob Buzz journal describing the contract correction.

## Task 5: Port The Mature Standalone Host

**Files:**

- Create or replace: `packages/host-standalone/src/adapter.ts`
- Modify: `packages/host-standalone/src/http.ts`
- Modify: `packages/host-standalone/src/server.ts`
- Modify: `packages/host-standalone/src/main.ts`
- Modify: `packages/host-standalone/src/index.ts`
- Test: `tests/browser/browserStandaloneServer.test.mjs`
- Test: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Copy OAC standalone adapter**

Copy:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/adapter.ts packages/host-standalone/src/adapter.ts
```

Replace imports with ABC packages:

```ts
import {
  resolveBrowserConfig,
  resolveBrowserResource,
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  createDefaultBrowserConfig,
  type BrowserConfigContainer,
} from '@openagentinternet/agent-browser-core';
import {
  browserFailure,
  browserSuccess,
  type BrowserActor,
  type BrowserCacheClearInput,
  type BrowserCacheClearResult,
  type BrowserCacheInput,
  type BrowserCacheSnapshot,
  type BrowserHostAdapter,
  type BrowserResolveInput,
  type BrowserRuntimeInput,
  type BrowserRuntimeSnapshot,
  type BrowserSettingsInput,
  type BrowserSettingsSnapshot,
  type BrowserSettingsUpdateInput,
  type BrowserTrustedActionInput,
  type BrowserTrustedActionResult,
} from '@openagentinternet/agent-browser-host-contract';
```

Use `browserSuccess()` and `browserFailure()` instead of OAC `commandSuccess()` and
`commandFailed()`.

- [ ] **Step 2: Keep the standalone actor mock**

The runtime actor must be:

```ts
{
  id: 'standalone-wallet',
  label: 'Standalone Wallet',
  kind: 'wallet',
  isDefault: true,
  capabilities: ['template-settings']
}
```

Set:

```ts
labels: {
  actorChip: 'Wallet',
  noActorTitle: 'No Wallet',
  noActorBody: 'Standalone Browser is running with a development wallet actor.'
}
```

This is a mock actor, not Metalet login.

- [ ] **Step 3: Provide a useful default resource**

Set standalone `defaultUri` to:

```ts
'metaid://idq1fixturebot'
```

If network resolution fails for this fixture ID, return a fixture Bot homepage from
`tests/fixtures/browser/botHomepage.v1.json` or an equivalent in-package fixture. Opening
`/browser` must not look like an empty shell.

- [ ] **Step 4: Port standalone server**

Copy OAC standalone server behavior:

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/server.ts packages/host-standalone/src/server.ts
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/main.ts packages/host-standalone/src/main.ts
```

Replace page rendering import with:

```ts
import { renderBrowserPageHtml } from '@openagentinternet/agent-browser-ui';
```

Ensure these routes work:

- `/`;
- `/browser`;
- `/ui/browser`;
- `/browser/metaid/:id`;
- `/browser/metaapp/:pinId`;
- `/api/browser/runtime`;
- `/api/browser/resolve`;
- `/api/browser/settings`;
- `/api/browser/cache`;
- `/api/browser/actions`;
- `/api/browser/preview-assets/:previewId/:assetPath`.

- [ ] **Step 5: Keep action behavior explicit**

Standalone should not silently do OAC actions. For unsupported actions, return:

```ts
browserFailure(
  'browser_action_not_supported',
  `Standalone Browser does not support trusted action: ${input.kind}`,
)
```

For `login`, return `manual_action_required` only if the UI triggers it. Do not implement real
Metalet login in this milestone.

- [ ] **Step 6: Export standalone APIs**

Update `packages/host-standalone/src/index.ts`:

```ts
export {
  createStandaloneBrowserHostAdapter,
  type CreateStandaloneBrowserHostAdapterInput,
  type StandaloneBrowserHostAdapter,
  type StandaloneBrowserPreviewAsset,
  type StandaloneBrowserPreviewAssetInput,
} from './adapter.js';
export {
  createStandaloneBrowserServer,
  type CreateStandaloneBrowserServerInput,
} from './server.js';
```

- [ ] **Step 7: Run standalone tests**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/browser/browserStandaloneServer.test.mjs tests/host-standalone/standaloneServer.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/host-standalone tests/browser/browserStandaloneServer.test.mjs tests/host-standalone/standaloneServer.test.mjs
git commit -m "feat: port mature standalone browser host"
```

Post a Bob Buzz journal describing standalone parity and the mock wallet boundary.

## Task 6: Migrate Remaining Browser UI Interaction Tests

**Files:**

- Create: `tests/ui/browserPageState.test.mjs`
- Create: `tests/ui/browserPageActions.test.mjs`
- Create: `tests/ui/browserPageInspector.test.mjs`
- Modify: existing `tests/ui/browserPageRenderers.test.mjs`
- Modify: existing `tests/ui/browserPageLayout.test.mjs`

- [ ] **Step 1: Copy remaining OAC Browser UI tests**

```bash
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageState.test.mjs tests/ui/browserPageState.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageActions.test.mjs tests/ui/browserPageActions.test.mjs
cp /Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui/browserPageInspector.test.mjs tests/ui/browserPageInspector.test.mjs
```

- [ ] **Step 2: Adjust import paths**

Replace:

```text
../../dist/ui/pages/browser/app.js
```

with:

```text
../../packages/ui/dist/browser/app.js
```

If a test imports OAC-only helpers, inline the small fake helper into the test rather than importing
OAC.

- [ ] **Step 3: Preserve behavior expectations**

Keep assertions for:

- template settings select `compact-list`;
- Bot homepage renderer shows services, skills, buzz/future lists;
- MetaApp renderer sandboxing;
- owner toolbar actions;
- actor selector modal;
- private-chat modal;
- service-call modal;
- inspector proof/source details;
- drawer open/close and visit behavior;
- share modal copy options.

Do not weaken these tests just to match the old ABC preview UI.

- [ ] **Step 4: Run migrated UI tests**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/ui/browserPage*.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui packages/ui
git commit -m "test: migrate mature browser ui behavior coverage"
```

Post a Bob Buzz journal describing the UI behavior coverage.

## Task 7: Package Exports, Release Readiness, And Host-Neutral Guardrails

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/*/package.json`
- Modify: `release/compatibility.json`
- Modify: `.github/workflows/ci.yml`
- Create or modify: `tests/package/*.test.mjs`
- Create or modify: `tests/release/*.test.mjs`

- [ ] **Step 1: Update package metadata to `0.3.0`**

Set root and all package versions to:

```json
"version": "0.3.0"
```

Update internal package dependencies to `0.3.0`.

- [ ] **Step 2: Update release compatibility**

Update `release/compatibility.json` so every ABC package points to `0.3.0`.

- [ ] **Step 3: Update package content tests**

Ensure package tests assert the mature UI files are packed:

- `dist/browser/app.js`;
- `dist/browser/page.js`;
- `dist/browser/menuModel.js`;
- `dist/browser/indexHtml.js`;
- standalone `dist/adapter.js`;
- standalone `dist/server.js`.

Ensure source files and `.tsbuildinfo` are not packed.

- [ ] **Step 4: Add host-neutral guardrail test**

Create or extend a test that scans `packages/` source files and fails if it finds forbidden host
internals:

```js
const forbidden = [
  'open-agent-connect',
  'src/daemon',
  '.metabot/hot',
  'IDBots',
  'SQLite',
  'sqlite',
  'Metalet',
];
```

Allow these strings only inside documentation files, not package source.

- [ ] **Step 5: Run package verification**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.3.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages release .github tests
git commit -m "chore: prepare browser parity package release"
```

Post a Bob Buzz journal describing package and release readiness.

## Task 8: Visual Standalone Acceptance

**Files:**

- Create: `docs/acceptance/browser-parity-standalone.md`
- Optional create: `scripts/smoke-standalone-visual.mjs`

- [ ] **Step 1: Start ABC standalone**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run dev:standalone -- --port 8787
```

- [ ] **Step 2: Inspect runtime**

Run:

```bash
curl -fsS http://127.0.0.1:8787/api/browser/runtime
```

Expected:

- `ok: true`;
- `data.host.kind: "standalone"`;
- `data.defaultActor.kind: "wallet"`;
- actor label includes `Standalone Wallet`.

- [ ] **Step 3: Inspect Browser page HTML**

Run:

```bash
curl -fsS http://127.0.0.1:8787/browser | rg "browser-titlebar|browser-topbar|browser-using-chip|browser-template-option|browser-status-strip"
```

Expected: all markers are present.

- [ ] **Step 4: Capture screenshot**

Use Browser or Playwright to open:

```text
http://127.0.0.1:8787/browser
```

Acceptance screenshot must show:

- mature title bar;
- styled address bar;
- styled top-right actor chip;
- Bot homepage content or useful default resource;
- styled status strip;
- no low-fidelity blank-button toolbar.

Save the screenshot under an ignored output directory if needed. Do not commit generated
screenshots unless the repository already tracks acceptance images.

- [ ] **Step 5: Document acceptance evidence**

Create `docs/acceptance/browser-parity-standalone.md`:

```md
# Browser Parity Standalone Acceptance

## Runtime

- URL: http://127.0.0.1:8787/browser
- Host kind: standalone
- Actor: Standalone Wallet

## Verification

- npm run verify: passed
- npm run verify:packages: passed
- release version check v0.3.0: passed
- publish dry-run: passed

## Visual Acceptance

The standalone Browser uses the mature OAC Browser chrome and does not render the low-fidelity
ABC 0.2 preview UI.

## OAC Consumption

OAC consumption was not performed in this phase.
```

- [ ] **Step 6: Whole-phase review**

Run a fresh whole-phase review subagent. It must check:

- OAC Browser UI parity;
- no OAC edits;
- no OAC/IDBots/SQLite/Metalet internals imported into ABC packages;
- standalone actor remains mock wallet;
- package exports include the mature UI;
- tests and visual acceptance evidence are credible;
- OAC consumption is explicitly left for a later plan.

- [ ] **Step 7: Commit**

```bash
git add docs/acceptance/browser-parity-standalone.md
git commit -m "docs: close browser parity extraction"
```

Post a Bob Buzz journal with final verification and screenshot/visual evidence summary.

## Final Verification

After the final commit, run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.3.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
git status --short --branch
```

Expected:

- all tests pass;
- package dry-run lists all packages at `0.3.0`;
- worktree is clean;
- no tag, publish, merge, or OAC consumption has been performed.

## Explicit Handoff

When this plan completes, report:

- branch name;
- final commit;
- verification commands and pass/fail results;
- local standalone URL used for visual acceptance;
- screenshot evidence location if one was saved;
- Bob Buzz pin IDs;
- any remaining parity gaps;
- confirmation that OAC was not changed.

The next separate plan should be OAC consumption of the verified ABC `0.3.x` package.
