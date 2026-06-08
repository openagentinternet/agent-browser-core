# Agent Browser Core Bootstrap Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `agent-browser-core` as a testable TypeScript workspace with the first host-neutral Browser contracts, core resource model, built-in template registry, and conformance harness.

**Architecture:** This plan creates the new repository's foundation without migrating the full Browser UI yet. It extracts stable Browser-owned contracts from the OAC baseline, keeps host-specific behavior out of core packages, and proves the contract with fake-host conformance tests before any OAC or IDBots integration work.

**Tech Stack:** Node.js `>=20 <25`, TypeScript strict mode, npm workspaces, Node's built-in `node:test`, ESM package exports.

---

## Scope

This plan covers the first implementation slice only:

- repository build/test bootstrap;
- `@openagentinternet/agent-browser-host-contract`;
- `@openagentinternet/agent-browser-core`;
- built-in Bot homepage template metadata;
- host conformance test harness;
- fake-host tests proving the contract.

This plan does not migrate the full Browser UI, standalone Metalet wallet flow, OAC package consumption, or IDBots adapter. Those need follow-up plans after this foundation is passing.

## Files

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/host-contract/package.json`
- Create: `packages/host-contract/tsconfig.json`
- Create: `packages/host-contract/src/index.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/templates/botHomepageTemplates.ts`
- Create: `packages/core/src/resource/resourceEnvelope.ts`
- Create: `packages/test-harness/package.json`
- Create: `packages/test-harness/tsconfig.json`
- Create: `packages/test-harness/src/index.ts`
- Create: `tests/host-contract/conformance.test.mjs`
- Create: `tests/core/templates.test.mjs`
- Modify: `README.md`

## Task 1: Workspace Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Add the root package manifest**

Create `package.json`:

```json
{
  "name": "agent-browser-core-workspace",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "description": "Shared Agent Internet Browser core, UI, host contracts, and standalone web runtime.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/openagentinternet/agent-browser-core.git"
  },
  "engines": {
    "node": ">=20 <25"
  },
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "tsc -b packages/host-contract packages/core packages/test-harness",
    "test": "npm run build && node --test tests/**/*.test.mjs",
    "verify": "npm run build && node --test tests/**/*.test.mjs"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Add the shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "rootDir": ".",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: npm creates `package-lock.json` and installs TypeScript plus Node types.

- [ ] **Step 4: Run the empty build and record the expected failure**

Run:

```bash
npm run build
```

Expected: FAIL because package directories do not exist yet.

- [ ] **Step 5: Commit workspace bootstrap**

Run:

```bash
git add package.json package-lock.json tsconfig.base.json
git commit -m "chore: bootstrap browser core workspace"
```

## Task 2: Host Contract Package

**Files:**
- Create: `packages/host-contract/package.json`
- Create: `packages/host-contract/tsconfig.json`
- Create: `packages/host-contract/src/index.ts`

- [ ] **Step 1: Add the package manifest**

Create `packages/host-contract/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-host-contract",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Add the package TypeScript config**

Create `packages/host-contract/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 3: Add the host contract types**

Create `packages/host-contract/src/index.ts`:

```ts
export type BrowserHostKind = 'standalone' | 'oac' | 'idbots';
export type BrowserActorKind = 'wallet' | 'oac-bot' | 'idbots-agent' | 'idbots-account';

export type BrowserActorCapability =
  | 'private-chat'
  | 'service-call'
  | 'wallet-sign'
  | 'payment'
  | 'template-settings'
  | 'profile-management'
  | 'chat-configuration'
  | 'resource-sharing'
  | 'message-view';

export interface BrowserCommandSuccess<T> {
  ok: true;
  state: 'success';
  data: T;
}

export interface BrowserCommandFailure {
  ok: false;
  state: 'failed';
  code: string;
  message: string;
}

export type BrowserCommandResult<T> = BrowserCommandSuccess<T> | BrowserCommandFailure;

export interface BrowserActor {
  id: string;
  label: string;
  kind: BrowserActorKind;
  globalMetaId?: string;
  address?: string;
  avatar?: string;
  isDefault: boolean;
  capabilities: BrowserActorCapability[];
}

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

export interface BrowserTrustedActionDescriptor {
  id: string;
  label: string;
  kind: BrowserTrustedActionKind;
  enabled: boolean;
  payload?: Record<string, unknown>;
}

export interface BrowserRuntimeLabels {
  actorChip: string;
  noActorTitle: string;
  noActorBody: string;
  noActorAction?: {
    label: string;
    href?: string;
    actionKind?: BrowserTrustedActionKind;
  };
}

export interface BrowserRuntimeSnapshot {
  host: {
    kind: BrowserHostKind;
    name: string;
    localMode: boolean;
    publicBaseUrl?: string;
  };
  actors: BrowserActor[];
  defaultActor: BrowserActor | null;
  defaultUri: string | null;
  features: {
    privateChat: boolean;
    serviceCall: boolean;
    cacheManagement: boolean;
    templateSettings: boolean;
    walletLogin: boolean;
  };
  labels: BrowserRuntimeLabels;
}

export interface BrowserResourceOwner {
  kind: 'bot' | 'metaapp-publisher' | 'wallet-user' | 'unknown';
  globalMetaId?: string;
  address?: string;
  label: string;
  avatar?: string;
  verificationState: 'verified' | 'partial' | 'unverified';
}

export interface BrowserOwnerAffinity {
  ownerActorId: string;
  ownerGlobalMetaId?: string;
  capabilities: BrowserActorCapability[];
  actions: BrowserTrustedActionDescriptor[];
}

export interface BrowserRendererDescriptor {
  type: 'bot-page' | 'html-iframe' | 'pdf' | 'image' | 'video' | 'unsupported';
  contentType: string;
  templateId?: string;
  url?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface BrowserResourceSection {
  id: string;
  title: string;
  kind: 'services' | 'skills' | 'buses' | 'buzzes' | 'apps' | 'activity' | 'generic-list';
  items: Array<Record<string, unknown>>;
}

export interface BrowserResourceEnvelope {
  uri: string;
  normalizedUri: string;
  resourceType: 'bot' | 'metaapp' | 'document' | 'image' | 'pdf' | 'unknown';
  title: string;
  owner?: BrowserResourceOwner;
  ownerAffinity?: BrowserOwnerAffinity | null;
  renderer: BrowserRendererDescriptor;
  actions: BrowserTrustedActionDescriptor[];
  sections: BrowserResourceSection[];
  raw?: unknown;
}

export interface BrowserSettingsSnapshot {
  browser: Record<string, unknown>;
  effectiveBrowser: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

export type BrowserCacheSnapshot = Record<string, unknown>;
export type BrowserCacheClearResult = Record<string, unknown>;

export interface BrowserActorInput {
  actorId?: string;
}

export interface BrowserResolveInput extends BrowserActorInput {
  uri: string;
}

export interface BrowserSettingsUpdateInput extends BrowserActorInput {
  browser?: Record<string, unknown>;
}

export interface BrowserTrustedActionInput extends BrowserActorInput {
  resourceUri: string;
  kind: BrowserTrustedActionKind;
  payload?: Record<string, unknown>;
}

export interface BrowserTrustedActionResult {
  kind: BrowserTrustedActionKind;
  handled: boolean;
  data?: {
    href?: string;
    route?: string;
    copiedText?: string;
    message?: string;
  };
}

export interface BrowserHostAdapter {
  getRuntime(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserRuntimeSnapshot>>;
  resolveResource(input: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResourceEnvelope>>;
  getSettings(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  updateSettings(input: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  getCache(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserCacheSnapshot>>;
  clearCache(input: BrowserActorInput & { scope?: string }): Promise<BrowserCommandResult<BrowserCacheClearResult>>;
  runTrustedAction(input: BrowserTrustedActionInput): Promise<BrowserCommandResult<BrowserTrustedActionResult>>;
}

export function browserSuccess<T>(data: T): BrowserCommandSuccess<T> {
  return { ok: true, state: 'success', data };
}

export function browserFailure(code: string, message: string): BrowserCommandFailure {
  return { ok: false, state: 'failed', code, message };
}
```

- [ ] **Step 4: Run the host-contract build**

Run:

```bash
npm run build -w @openagentinternet/agent-browser-host-contract
```

Expected: PASS.

- [ ] **Step 5: Commit host contract package**

Run:

```bash
git add packages/host-contract
git commit -m "feat: add browser host contract package"
```

## Task 3: Core Resource And Template Package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/templates/botHomepageTemplates.ts`
- Create: `packages/core/src/resource/resourceEnvelope.ts`
- Test: `tests/core/templates.test.mjs`

- [ ] **Step 1: Add the core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-core",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-host-contract": "0.1.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Add the core TypeScript config**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "references": [
    { "path": "../host-contract" }
  ],
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 3: Add Bot homepage template metadata**

Create `packages/core/src/templates/botHomepageTemplates.ts`:

```ts
export const DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID = 'document';

export type BotHomepageTemplateId = 'document' | 'compact-list';

export interface BotHomepageTemplateDefinition {
  id: BotHomepageTemplateId;
  name: string;
  description: string;
  previewImage: string;
}

export const BOT_HOMEPAGE_TEMPLATES: readonly BotHomepageTemplateDefinition[] = [
  {
    id: 'document',
    name: 'Document',
    description: 'A profile-first page with overview, services, and recent activity sections.',
    previewImage: 'builtin://bot-homepage/document/preview.svg',
  },
  {
    id: 'compact-list',
    name: 'Compact List',
    description: 'A dense list layout for quickly scanning services, skills, buzz, and future homepage lists.',
    previewImage: 'builtin://bot-homepage/compact-list/preview.svg',
  },
];

export function isBotHomepageTemplateId(value: unknown): value is BotHomepageTemplateId {
  return BOT_HOMEPAGE_TEMPLATES.some((template) => template.id === value);
}

export function normalizeBotHomepageTemplateId(
  value: unknown,
  fallback: BotHomepageTemplateId = DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
): BotHomepageTemplateId {
  return isBotHomepageTemplateId(value) ? value : fallback;
}
```

- [ ] **Step 4: Add resource envelope helpers**

Create `packages/core/src/resource/resourceEnvelope.ts`:

```ts
import type {
  BrowserResourceEnvelope,
  BrowserResourceSection,
  BrowserTrustedActionDescriptor,
} from '@openagentinternet/agent-browser-host-contract';

export function normalizeResourceSections(value: unknown): BrowserResourceSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section): BrowserResourceSection[] => {
    if (!section || typeof section !== 'object') return [];
    const raw = section as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '';
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : 'generic-list';
    const items = Array.isArray(raw.items)
      ? raw.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
    if (!id || !title) return [];
    return [{
      id,
      title,
      kind: isResourceSectionKind(kind) ? kind : 'generic-list',
      items,
    }];
  });
}

export function normalizeTrustedActions(value: unknown): BrowserTrustedActionDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action): BrowserTrustedActionDescriptor[] => {
    if (!action || typeof action !== 'object') return [];
    const raw = action as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : '';
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : '';
    if (!id || !label || !isTrustedActionKind(kind)) return [];
    return [{
      id,
      label,
      kind,
      enabled: raw.enabled !== false,
      ...(raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? { payload: raw.payload as Record<string, unknown> } : {}),
    }];
  });
}

export function createUnsupportedResourceEnvelope(uri: string, message: string): BrowserResourceEnvelope {
  return {
    uri,
    normalizedUri: uri,
    resourceType: 'unknown',
    title: 'Unsupported resource',
    renderer: {
      type: 'unsupported',
      contentType: 'text/plain',
      error: message,
    },
    actions: [],
    sections: [],
  };
}

function isResourceSectionKind(value: string): value is BrowserResourceSection['kind'] {
  return ['services', 'skills', 'buses', 'buzzes', 'apps', 'activity', 'generic-list'].includes(value);
}

function isTrustedActionKind(value: string): value is BrowserTrustedActionDescriptor['kind'] {
  return [
    'private-chat',
    'service-call',
    'copy-uri',
    'open-settings',
    'login',
    'wallet-sign',
    'payment',
    'edit-profile',
    'configure-chat',
    'view-messages',
    'share-resource',
  ].includes(value);
}
```

- [ ] **Step 5: Add the core entrypoint**

Create `packages/core/src/index.ts`:

```ts
export {
  BOT_HOMEPAGE_TEMPLATES,
  DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  isBotHomepageTemplateId,
  normalizeBotHomepageTemplateId,
  type BotHomepageTemplateDefinition,
  type BotHomepageTemplateId,
} from './templates/botHomepageTemplates.js';
export {
  createUnsupportedResourceEnvelope,
  normalizeResourceSections,
  normalizeTrustedActions,
} from './resource/resourceEnvelope.js';
```

- [ ] **Step 6: Add template tests**

Create `tests/core/templates.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('built-in Bot homepage templates expose stable metadata', () => {
  assert.deepEqual(core.BOT_HOMEPAGE_TEMPLATES.map((template) => template.id), [
    'document',
    'compact-list',
  ]);
  for (const template of core.BOT_HOMEPAGE_TEMPLATES) {
    assert.equal(typeof template.name, 'string');
    assert.equal(typeof template.description, 'string');
    assert.match(template.previewImage, /^builtin:\/\//);
  }
});

test('template id normalization falls back to the default template', () => {
  assert.equal(core.normalizeBotHomepageTemplateId('compact-list'), 'compact-list');
  assert.equal(core.normalizeBotHomepageTemplateId('missing-template'), 'document');
});
```

- [ ] **Step 7: Run focused core verification**

Run:

```bash
npm run build && node --test tests/core/templates.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit core package**

Run:

```bash
git add packages/core tests/core
git commit -m "feat: add browser core package"
```

## Task 4: Conformance Test Harness

**Files:**
- Create: `packages/test-harness/package.json`
- Create: `packages/test-harness/tsconfig.json`
- Create: `packages/test-harness/src/index.ts`
- Test: `tests/host-contract/conformance.test.mjs`

- [ ] **Step 1: Add the test harness package manifest**

Create `packages/test-harness/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-test-harness",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-host-contract": "0.1.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Add the test harness TypeScript config**

Create `packages/test-harness/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "references": [
    { "path": "../host-contract" }
  ],
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 3: Add the conformance runner**

Create `packages/test-harness/src/index.ts`:

```ts
import assert from 'node:assert/strict';
import type { BrowserHostAdapter } from '@openagentinternet/agent-browser-host-contract';

export interface BrowserHostConformanceInput {
  adapter: BrowserHostAdapter;
  expectedHostKind: 'standalone' | 'oac' | 'idbots';
  sampleUri: string;
}

export async function assertBrowserHostConformance(input: BrowserHostConformanceInput): Promise<void> {
  const runtime = await input.adapter.getRuntime();
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, input.expectedHostKind);
  assert.equal(typeof runtime.data.host.name, 'string');
  assert.equal(typeof runtime.data.host.localMode, 'boolean');
  assert.equal(Array.isArray(runtime.data.actors), true);
  assert.equal(typeof runtime.data.labels.actorChip, 'string');
  assert.equal(typeof runtime.data.labels.noActorTitle, 'string');
  assert.equal(typeof runtime.data.labels.noActorBody, 'string');

  const settings = await input.adapter.getSettings();
  assert.equal(settings.ok, true);
  assert.equal(typeof settings.data.browser, 'object');
  assert.equal(typeof settings.data.effectiveBrowser, 'object');
  assert.equal(typeof settings.data.defaults, 'object');

  const resolved = await input.adapter.resolveResource({ uri: input.sampleUri });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.uri, input.sampleUri);
  assert.equal(typeof resolved.data.normalizedUri, 'string');
  assert.equal(Array.isArray(resolved.data.actions), true);
  assert.equal(Array.isArray(resolved.data.sections), true);

  const unsupported = await input.adapter.runTrustedAction({
    resourceUri: input.sampleUri,
    kind: 'payment',
    payload: {},
  });
  if (!unsupported.ok) {
    assert.equal(typeof unsupported.code, 'string');
    assert.equal(typeof unsupported.message, 'string');
  } else {
    assert.equal(unsupported.data.kind, 'payment');
    assert.equal(typeof unsupported.data.handled, 'boolean');
  }
}
```

- [ ] **Step 4: Add a fake-host conformance test**

Create `tests/host-contract/conformance.test.mjs`:

```js
import { test } from 'node:test';
import {
  browserFailure,
  browserSuccess,
} from '../../packages/host-contract/dist/index.js';
import { assertBrowserHostConformance } from '../../packages/test-harness/dist/index.js';

test('fake standalone host satisfies Browser host conformance', async () => {
  const adapter = {
    async getRuntime() {
      return browserSuccess({
        host: { kind: 'standalone', name: 'Fake Browser', localMode: false },
        actors: [],
        defaultActor: null,
        defaultUri: null,
        features: {
          privateChat: false,
          serviceCall: false,
          cacheManagement: true,
          templateSettings: true,
          walletLogin: true,
        },
        labels: {
          actorChip: 'Wallet',
          noActorTitle: 'Connect Wallet',
          noActorBody: 'Connect Metalet to use Browser actions.',
          noActorAction: { label: 'Connect Wallet', actionKind: 'login' },
        },
      });
    },
    async resolveResource(input) {
      return browserSuccess({
        uri: input.uri,
        normalizedUri: input.uri,
        resourceType: 'bot',
        title: 'Fake Bot',
        owner: {
          kind: 'bot',
          globalMetaId: 'idq1fake',
          label: 'Fake Bot',
          verificationState: 'verified',
        },
        ownerAffinity: null,
        renderer: { type: 'bot-page', contentType: 'application/json', templateId: 'document' },
        actions: [],
        sections: [],
      });
    },
    async getSettings() {
      return browserSuccess({
        browser: {},
        effectiveBrowser: {},
        defaults: {},
      });
    },
    async updateSettings(input) {
      return browserSuccess({
        browser: input.browser ?? {},
        effectiveBrowser: input.browser ?? {},
        defaults: {},
      });
    },
    async getCache() {
      return browserSuccess({ cacheRoot: 'fake', artifactCount: 0 });
    },
    async clearCache() {
      return browserSuccess({ cacheRoot: 'fake', clearedArtifacts: 0 });
    },
    async runTrustedAction(input) {
      return browserFailure('browser_action_not_supported', `Unsupported action: ${input.kind}`);
    },
  };

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});
```

- [ ] **Step 5: Run focused conformance verification**

Run:

```bash
npm run build && node --test tests/host-contract/conformance.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit conformance harness**

Run:

```bash
git add packages/test-harness tests/host-contract
git commit -m "feat: add browser host conformance harness"
```

## Task 5: Closeout

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the repository status in README**

Replace the "Current Status" section in `README.md` with:

```markdown
## Current Status

This repository contains the first testable Browser foundation:

- host-neutral Browser contract package;
- core resource and template package;
- fake-host conformance harness;
- architecture spec and bootstrap extraction plan.

Full Browser UI migration, standalone Metalet wallet hosting, OAC package consumption, and IDBots
integration are planned as follow-up implementation phases.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
git diff --check
```

Expected: both commands pass.

- [ ] **Step 3: Commit closeout docs**

Run:

```bash
git add README.md
git commit -m "docs: update browser core bootstrap status"
```

- [ ] **Step 4: Push the completed bootstrap branch**

Run:

```bash
git push origin main
```

Expected: branch pushes to `https://github.com/openagentinternet/agent-browser-core`.

## Follow-Up Plans

After this plan passes, write separate implementation plans for:

- migrating the Browser UI shell and renderer tests;
- implementing the standalone hosted web app and Metalet wallet adapter;
- updating OAC to consume a pinned Browser package;
- adding the IDBots adapter and conformance tests.
