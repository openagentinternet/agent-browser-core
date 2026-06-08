# Agent Browser Core Shared UI And Standalone Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shared Browser UI package and standalone development preview on top of the Phase 1 host contract and core packages.

**Architecture:** This phase keeps OAC untouched and continues developing only inside `agent-browser-core`. It expands the shared contracts with proof/source metadata, adds core URI and Bot homepage envelope helpers, creates a host-neutral UI package, and adds a memory-backed standalone host/server that proves the Browser can run outside OAC.

**Tech Stack:** Node.js `>=20 <25`, TypeScript strict mode, npm workspaces, Node's built-in `node:test`, ESM package exports, Node `http` for the standalone development server.

---

## Scope

This plan covers Phase 2 of the independent `agent-browser-core` project:

- workspace expansion for `@openagentinternet/agent-browser-ui`;
- workspace expansion for `@openagentinternet/agent-browser-host-standalone`;
- core URI parsing and Bot homepage resource-envelope helpers;
- host-neutral Browser page shell and renderer helpers;
- memory-backed standalone development host and server;
- package publish hygiene for generated TypeScript build artifacts;
- focused tests for core, UI, standalone host, and package contents.

This plan does not update Open Agent Connect, IDBots, public Metalet wallet login, production hosting, package publishing, or OAC CI. Those remain follow-up phases.

## Baseline

Start from:

```text
/Users/tusm/Documents/MetaID_Projects/agent-browser-core
main at bd406c6ba8176e2d153e858cfc573f370b9cea44
```

The OAC source snapshot that informs this phase is:

```text
/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser
/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser
/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/browser
/Users/tusm/Documents/MetaID_Projects/open-agent-connect/tests/ui
```

Use those files as behavior references only. Do not copy OAC daemon adapters, OAC route files, OAC profile storage, or OAC UI page wrappers into this repository.

## Files

- Modify: `package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Create: `packages/core/src/uri/browserUri.ts`
- Create: `packages/core/src/bot-homepage/botHomepageEnvelope.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/browserPageHtml.ts`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/menuModel.ts`
- Create: `packages/ui/src/pageDefinition.ts`
- Create: `packages/ui/src/renderers.ts`
- Create: `packages/host-standalone/package.json`
- Create: `packages/host-standalone/tsconfig.json`
- Create: `packages/host-standalone/src/http.ts`
- Create: `packages/host-standalone/src/index.ts`
- Create: `packages/host-standalone/src/main.ts`
- Create: `packages/host-standalone/src/memoryHost.ts`
- Create: `packages/host-standalone/src/server.ts`
- Create: `tests/core/botHomepageEnvelope.test.mjs`
- Create: `tests/core/uri.test.mjs`
- Create: `tests/fixtures/botHomepage.v1.json`
- Create: `tests/host-standalone/standaloneServer.test.mjs`
- Create: `tests/package/packContents.test.mjs`
- Create: `tests/ui/browserPage.test.mjs`
- Create: `tests/ui/renderers.test.mjs`
- Modify: `README.md`

## Task 1: Workspace Expansion And Package Hygiene

**Files:**
- Modify: `package.json`
- Modify: `packages/core/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/host-standalone/package.json`
- Create: `packages/host-standalone/tsconfig.json`
- Create: `packages/host-standalone/src/index.ts`
- Test: `tests/package/packContents.test.mjs`

- [ ] **Step 1: Update the root workspace scripts**

Replace `package.json` with:

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
    "build": "tsc -b packages/host-contract packages/core packages/ui packages/host-standalone packages/test-harness",
    "test": "npm run build && node --test tests/**/*.test.mjs",
    "verify": "npm run build && node --test tests/**/*.test.mjs",
    "dev:standalone": "node packages/host-standalone/dist/main.js"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Tighten core package publish files**

Replace `packages/core/package.json` with:

```json
{
  "name": "@openagentinternet/agent-browser-core",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/bot-homepage/**",
    "dist/resource/**",
    "dist/templates/**",
    "dist/uri/**"
  ],
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

- [ ] **Step 3: Add the UI package manifest**

Create `packages/ui/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-ui",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist/browserPageHtml.d.ts",
    "dist/browserPageHtml.d.ts.map",
    "dist/browserPageHtml.js",
    "dist/browserPageHtml.js.map",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/menuModel.d.ts",
    "dist/menuModel.d.ts.map",
    "dist/menuModel.js",
    "dist/menuModel.js.map",
    "dist/pageDefinition.d.ts",
    "dist/pageDefinition.d.ts.map",
    "dist/pageDefinition.js",
    "dist/pageDefinition.js.map",
    "dist/renderers.d.ts",
    "dist/renderers.d.ts.map",
    "dist/renderers.js",
    "dist/renderers.js.map"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-core": "0.1.0",
    "@openagentinternet/agent-browser-host-contract": "0.1.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 4: Add the UI package TypeScript config**

Create `packages/ui/tsconfig.json`:

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
  ],
  "references": [
    { "path": "../host-contract" },
    { "path": "../core" }
  ]
}
```

- [ ] **Step 5: Add the standalone host package manifest**

Create `packages/host-standalone/package.json`:

```json
{
  "name": "@openagentinternet/agent-browser-host-standalone",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "agent-browser-standalone": "./dist/main.js"
  },
  "files": [
    "dist/http.d.ts",
    "dist/http.d.ts.map",
    "dist/http.js",
    "dist/http.js.map",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/main.d.ts",
    "dist/main.d.ts.map",
    "dist/main.js",
    "dist/main.js.map",
    "dist/memoryHost.d.ts",
    "dist/memoryHost.d.ts.map",
    "dist/memoryHost.js",
    "dist/memoryHost.js.map",
    "dist/server.d.ts",
    "dist/server.d.ts.map",
    "dist/server.js",
    "dist/server.js.map"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@openagentinternet/agent-browser-core": "0.1.0",
    "@openagentinternet/agent-browser-host-contract": "0.1.0",
    "@openagentinternet/agent-browser-ui": "0.1.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 6: Add the standalone host TypeScript config**

Create `packages/host-standalone/tsconfig.json`:

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
  ],
  "references": [
    { "path": "../host-contract" },
    { "path": "../core" },
    { "path": "../ui" }
  ]
}
```

- [ ] **Step 7: Add initial package entrypoints**

Create `packages/ui/src/index.ts`:

```ts
export const AGENT_BROWSER_UI_PACKAGE = '@openagentinternet/agent-browser-ui';
```

Create `packages/host-standalone/src/index.ts`:

```ts
export const AGENT_BROWSER_HOST_STANDALONE_PACKAGE = '@openagentinternet/agent-browser-host-standalone';
```

- [ ] **Step 8: Add package content verification**

Create `tests/package/packContents.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);

async function packFiles(workspace) {
  const { stdout } = await execFileAsync('npm', ['pack', '--workspace', workspace, '--dry-run', '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  return parsed[0].files.map((file) => file.path);
}

test('published Browser packages exclude TypeScript build info files', async () => {
  for (const workspace of [
    '@openagentinternet/agent-browser-host-contract',
    '@openagentinternet/agent-browser-core',
    '@openagentinternet/agent-browser-ui',
    '@openagentinternet/agent-browser-host-standalone',
    '@openagentinternet/agent-browser-test-harness',
  ]) {
    const files = await packFiles(workspace);
    assert.equal(files.some((file) => file.endsWith('.tsbuildinfo')), false, workspace);
  }
});
```

- [ ] **Step 9: Run package bootstrap verification**

Run:

```bash
npm install
npm run build
node --test tests/package/packContents.test.mjs
git diff --check
```

Expected:

- `npm install` updates `package-lock.json` for the new workspace packages.
- `npm run build` compiles the existing packages plus the initial `ui` and `host-standalone` entrypoints.
- `node --test tests/package/packContents.test.mjs` passes.
- `git diff --check` exits 0.

- [ ] **Step 10: Commit workspace expansion**

Run:

```bash
git add package.json package-lock.json packages/core/package.json packages/ui/package.json packages/ui/tsconfig.json packages/ui/src/index.ts packages/host-standalone/package.json packages/host-standalone/tsconfig.json packages/host-standalone/src/index.ts tests/package/packContents.test.mjs
git commit -m "chore: add browser ui and standalone workspaces"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 2: Core URI And Bot Homepage Envelope

**Files:**
- Modify: `packages/host-contract/src/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/test-harness/src/index.ts`
- Create: `packages/core/src/uri/browserUri.ts`
- Create: `packages/core/src/bot-homepage/botHomepageEnvelope.ts`
- Create: `tests/core/uri.test.mjs`
- Create: `tests/core/botHomepageEnvelope.test.mjs`
- Create: `tests/fixtures/botHomepage.v1.json`

- [ ] **Step 1: Extend the host contract with optional resolution metadata**

In `packages/host-contract/src/index.ts`, add these exports after `BrowserOwnerAffinity`:

```ts
export type BrowserResolutionState = 'resolved' | 'loading' | 'not_found' | 'error';
export type BrowserVerificationState = 'verified' | 'partial' | 'unverified';

export interface BrowserResolutionStatus {
  state: BrowserResolutionState;
  verificationState: BrowserVerificationState;
  message: string;
}

export interface BrowserProofSummary {
  txid?: string;
  pinId?: string;
  protocolPath?: string;
  contentHash?: string;
  publisherGlobalMetaId?: string;
  explorerUrl?: string;
  verificationState: BrowserVerificationState;
  details?: Record<string, unknown>;
}

export interface BrowserSourceSummary {
  resolver: string;
  url?: string;
  fetchedAt?: number;
  indexedAt?: number;
  stale?: boolean;
  schemaVersion?: string;
  raw?: Record<string, unknown>;
}
```

Then update `BrowserResourceEnvelope` so it includes optional metadata:

```ts
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
  status?: BrowserResolutionStatus;
  proof?: BrowserProofSummary;
  source?: BrowserSourceSummary;
  raw?: unknown;
}
```

- [ ] **Step 2: Tighten test-harness resource assertions**

In `packages/test-harness/src/index.ts`, after the existing `resolved.data.sections` assertion, add:

```ts
  if (resolved.data.status) {
    assert.equal(typeof resolved.data.status.state, 'string');
    assert.equal(typeof resolved.data.status.verificationState, 'string');
    assert.equal(typeof resolved.data.status.message, 'string');
  }
  if (resolved.data.proof) {
    assert.equal(typeof resolved.data.proof.verificationState, 'string');
  }
  if (resolved.data.source) {
    assert.equal(typeof resolved.data.source.resolver, 'string');
  }
```

- [ ] **Step 3: Add URI parsing**

Create `packages/core/src/uri/browserUri.ts`:

```ts
export type BrowserUriScheme = 'metaid' | 'metaapp';

export interface ParsedBrowserUri {
  originalUri: string;
  normalizedUri: string;
  scheme: BrowserUriScheme;
  id: string;
}

const SUPPORTED_SCHEMES = new Set<BrowserUriScheme>(['metaid', 'metaapp']);

export function parseBrowserUri(input: string): ParsedBrowserUri {
  const originalUri = String(input ?? '').trim();
  const schemeMatch = originalUri.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);
  if (!schemeMatch) {
    throw new Error('Enter a complete Agent Internet URI such as metaid://idq1example or metaapp://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0.');
  }

  const scheme = schemeMatch[1].toLowerCase() as BrowserUriScheme;
  if (!SUPPORTED_SCHEMES.has(scheme)) {
    throw new Error(`Unsupported URI scheme: ${schemeMatch[1]}.`);
  }

  const id = schemeMatch[2].trim();
  if (!id) {
    throw new Error('Agent Internet URI has an empty resource id.');
  }

  return {
    originalUri,
    normalizedUri: `${scheme}://${id}`,
    scheme,
    id,
  };
}
```

- [ ] **Step 4: Add Bot homepage envelope normalization**

Create `packages/core/src/bot-homepage/botHomepageEnvelope.ts`:

```ts
import type {
  BrowserResourceEnvelope,
  BrowserResourceSection,
  BrowserTrustedActionDescriptor,
} from '@openagentinternet/agent-browser-host-contract';
import {
  DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  normalizeBotHomepageTemplateId,
  type BotHomepageTemplateId,
} from '../templates/botHomepageTemplates.js';

export interface BuildBotHomepageEnvelopeInput {
  uri: string;
  normalizedUri: string;
  homepage: Record<string, unknown>;
  resolverUrl?: string;
  templateId?: string;
  fetchedAt?: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function displayTitle(item: Record<string, unknown>): string {
  return text(item.displayName) || text(item.name) || text(item.title) || text(item.id) || text(item.currentPinId) || 'Untitled';
}

function normalizeItems(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return items.map((item) => ({
    ...item,
    title: displayTitle(item),
    description: text(item.description) || text(item.summary) || text(item.bio),
  }));
}

function section(
  id: string,
  title: string,
  kind: BrowserResourceSection['kind'],
  items: Array<Record<string, unknown>>,
): BrowserResourceSection | null {
  if (items.length === 0) return null;
  return {
    id,
    title,
    kind,
    items: normalizeItems(items),
  };
}

function sectionsFromHomepage(homepage: Record<string, unknown>): BrowserResourceSection[] {
  return [
    section('overview', 'Overview', 'generic-list', list(homepage.homepage).length ? list(homepage.homepage) : [record(homepage.homepage)].filter((item) => Object.keys(item).length > 0)),
    section('services', 'Services', 'services', list(homepage.services)),
    section('skills', 'Skills', 'skills', list(homepage.skills)),
    section('buses', 'Buses', 'buses', list(homepage.buses)),
    section('buzzes', 'Buzz', 'buzzes', list(homepage.buzzes).length ? list(homepage.buzzes) : list(homepage.buzz)),
    section('apps', 'Apps', 'apps', list(homepage.apps)),
    section('activity', 'Recent Activity', 'activity', list(homepage.activity)),
  ].filter((item): item is BrowserResourceSection => Boolean(item));
}

function actionsFromHomepage(globalMetaId: string, homepage: Record<string, unknown>): BrowserTrustedActionDescriptor[] {
  const actions: BrowserTrustedActionDescriptor[] = [];
  if (globalMetaId) {
    actions.push({
      id: 'private-chat',
      label: 'Private Chat',
      kind: 'private-chat',
      enabled: true,
      payload: { globalMetaId },
    });
  }
  for (const service of list(homepage.services)) {
    const serviceId = text(service.currentPinId) || text(service.id);
    if (!serviceId) continue;
    actions.push({
      id: `service-call:${serviceId}`,
      label: displayTitle(service),
      kind: 'service-call',
      enabled: true,
      payload: {
        serviceId,
        providerGlobalMetaId: globalMetaId,
      },
    });
  }
  return actions;
}

export function buildBotHomepageEnvelope(input: BuildBotHomepageEnvelopeInput): BrowserResourceEnvelope {
  const profile = record(input.homepage.profile);
  const globalMetaId = text(input.homepage.globalMetaId) || text(profile.globalMetaId);
  const title = text(profile.name) || text(input.homepage.name) || globalMetaId || 'Bot';
  const templateId: BotHomepageTemplateId = normalizeBotHomepageTemplateId(
    input.templateId,
    DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  );

  return {
    uri: input.uri,
    normalizedUri: input.normalizedUri,
    resourceType: 'bot',
    title,
    owner: {
      kind: 'bot',
      globalMetaId,
      address: text(profile.address) || undefined,
      label: title,
      avatar: text(profile.avatar) || undefined,
      verificationState: 'partial',
    },
    ownerAffinity: null,
    renderer: {
      type: 'bot-page',
      contentType: 'application/vnd.agent-browser.bot-homepage+json',
      templateId,
      data: input.homepage,
    },
    actions: actionsFromHomepage(globalMetaId, input.homepage),
    sections: sectionsFromHomepage(input.homepage),
    status: {
      state: 'resolved',
      verificationState: 'partial',
      message: '',
    },
    proof: {
      txid: text(record(input.homepage.identity).txid) || undefined,
      pinId: text(record(input.homepage.identity).pinId) || undefined,
      publisherGlobalMetaId: globalMetaId || undefined,
      verificationState: 'partial',
    },
    source: {
      resolver: 'bot-homepage',
      url: input.resolverUrl,
      fetchedAt: input.fetchedAt,
      schemaVersion: text(input.homepage.schemaVersion) || 'botHomepage.v1',
      raw: input.homepage,
    },
    raw: input.homepage,
  };
}
```

- [ ] **Step 5: Export core helpers**

Update `packages/core/src/index.ts` so it additionally exports:

```ts
export {
  parseBrowserUri,
  type BrowserUriScheme,
  type ParsedBrowserUri,
} from './uri/browserUri.js';
export {
  buildBotHomepageEnvelope,
  type BuildBotHomepageEnvelopeInput,
} from './bot-homepage/botHomepageEnvelope.js';
```

- [ ] **Step 6: Add the Bot homepage fixture**

Create `tests/fixtures/botHomepage.v1.json`:

```json
{
  "schemaVersion": "botHomepage.v1",
  "globalMetaId": "idq1fixturebot",
  "profile": {
    "name": "Fixture Bot",
    "avatar": "https://so.example.test/content/avatar-pin",
    "bio": "Builds Agent Browser fixtures.",
    "address": "1FixtureAddress"
  },
  "homepage": {
    "summary": "A Bot homepage used by package tests."
  },
  "identity": {
    "txid": "identity-txid",
    "pinId": "identity-pin"
  },
  "services": [
    {
      "id": "svc-review",
      "currentPinId": "service-pin-1",
      "displayName": "Fixture Review",
      "description": "Reviews Browser templates."
    }
  ],
  "skills": [
    {
      "name": "Template Authoring",
      "description": "Creates Bot homepage layouts."
    }
  ],
  "buses": [
    {
      "name": "Fixture Bus",
      "description": "Coordinates test traffic."
    }
  ],
  "buzz": [
    {
      "title": "Template update",
      "description": "Published a compact renderer."
    }
  ]
}
```

- [ ] **Step 7: Add URI tests**

Create `tests/core/uri.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('parseBrowserUri normalizes metaid and metaapp schemes', () => {
  assert.deepEqual(core.parseBrowserUri('  METAID://idqABC  '), {
    originalUri: 'METAID://idqABC',
    normalizedUri: 'metaid://idqABC',
    scheme: 'metaid',
    id: 'idqABC',
  });
  assert.deepEqual(core.parseBrowserUri('metaapp://abcdef123i0'), {
    originalUri: 'metaapp://abcdef123i0',
    normalizedUri: 'metaapp://abcdef123i0',
    scheme: 'metaapp',
    id: 'abcdef123i0',
  });
});

test('parseBrowserUri rejects missing, empty, and unsupported schemes', () => {
  assert.throws(() => core.parseBrowserUri('idqABC'), /complete Agent Internet URI/i);
  assert.throws(() => core.parseBrowserUri('metaid://'), /empty resource id/i);
  assert.throws(() => core.parseBrowserUri('https://example.com'), /unsupported URI scheme/i);
});
```

- [ ] **Step 8: Add Bot homepage envelope tests**

Create `tests/core/botHomepageEnvelope.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

async function fixture() {
  return JSON.parse(await readFile(new URL('../fixtures/botHomepage.v1.json', import.meta.url), 'utf8'));
}

test('buildBotHomepageEnvelope maps profile, proof, actions, and future lists', async () => {
  const homepage = await fixture();
  const result = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
    resolverUrl: 'https://so.example.test/api/bot-homepage/globalmetaid/idq1fixturebot',
    templateId: 'compact-list',
    fetchedAt: 1780840000000,
  });

  assert.equal(result.resourceType, 'bot');
  assert.equal(result.title, 'Fixture Bot');
  assert.equal(result.owner.globalMetaId, 'idq1fixturebot');
  assert.equal(result.owner.avatar, 'https://so.example.test/content/avatar-pin');
  assert.equal(result.renderer.type, 'bot-page');
  assert.equal(result.renderer.templateId, 'compact-list');
  assert.equal(result.status.state, 'resolved');
  assert.equal(result.proof.txid, 'identity-txid');
  assert.equal(result.source.resolver, 'bot-homepage');
  assert.equal(result.source.schemaVersion, 'botHomepage.v1');
  assert.equal(result.actions.some((action) => action.kind === 'private-chat'), true);
  assert.equal(result.actions.some((action) => action.kind === 'service-call'), true);
  assert.deepEqual(result.sections.map((section) => section.kind), [
    'generic-list',
    'services',
    'skills',
    'buses',
    'buzzes',
  ]);
});

test('buildBotHomepageEnvelope falls back to document template for unknown template id', async () => {
  const result = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage: await fixture(),
    templateId: 'missing',
  });

  assert.equal(result.renderer.templateId, 'document');
});
```

- [ ] **Step 9: Run focused core verification**

Run:

```bash
npm run build
node --test tests/core/uri.test.mjs tests/core/botHomepageEnvelope.test.mjs tests/host-contract/conformance.test.mjs
git diff --check
```

Expected: all commands pass.

- [ ] **Step 10: Commit core envelope work**

Run:

```bash
git add packages/host-contract/src/index.ts packages/test-harness/src/index.ts packages/core/src/index.ts packages/core/src/uri/browserUri.ts packages/core/src/bot-homepage/botHomepageEnvelope.ts tests/core/uri.test.mjs tests/core/botHomepageEnvelope.test.mjs tests/fixtures/botHomepage.v1.json
git commit -m "feat: add browser uri and bot homepage envelope core"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 3: Shared Browser UI Package

**Files:**
- Create: `packages/ui/src/menuModel.ts`
- Create: `packages/ui/src/renderers.ts`
- Create: `packages/ui/src/pageDefinition.ts`
- Create: `packages/ui/src/browserPageHtml.ts`
- Modify: `packages/ui/src/index.ts`
- Create: `tests/ui/renderers.test.mjs`
- Create: `tests/ui/browserPage.test.mjs`

- [ ] **Step 1: Add UI menu metadata**

Create `packages/ui/src/menuModel.ts`:

```ts
import { BOT_HOMEPAGE_TEMPLATES } from '@openagentinternet/agent-browser-core';

export interface BrowserMenuItemDefinition {
  id: string;
  label: string;
  icon: 'settings' | 'layout' | 'database';
  action: 'open-settings';
  settingsTab: 'baseUrls' | 'templates' | 'cache';
}

export interface BrowserMenuSectionDefinition {
  id: string;
  items: BrowserMenuItemDefinition[];
}

export interface BrowserSettingsTabDefinition {
  id: 'baseUrls' | 'templates' | 'cache';
  label: string;
}

export interface BrowserBaseUrlFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
}

export const BROWSER_MENU_SECTIONS: readonly BrowserMenuSectionDefinition[] = [
  {
    id: 'main',
    items: [
      { id: 'settings', label: 'Settings', icon: 'settings', action: 'open-settings', settingsTab: 'baseUrls' },
      { id: 'templates', label: 'Bot Page Templates', icon: 'layout', action: 'open-settings', settingsTab: 'templates' },
      { id: 'cache', label: 'Cache Management', icon: 'database', action: 'open-settings', settingsTab: 'cache' },
    ],
  },
];

export const BROWSER_SETTINGS_TABS: readonly BrowserSettingsTabDefinition[] = [
  { id: 'baseUrls', label: 'Base URLs' },
  { id: 'templates', label: 'Templates' },
  { id: 'cache', label: 'Cache' },
];

export const BROWSER_BOT_HOMEPAGE_TEMPLATES = BOT_HOMEPAGE_TEMPLATES;

export const BROWSER_BASE_URL_FIELDS: readonly BrowserBaseUrlFieldDefinition[] = [
  { key: 'metasoP2PBaseUrl', label: 'Bot Homepage API Base URL', placeholder: 'https://so.metaid.io' },
  { key: 'metafileContentBaseUrl', label: 'Metafile Content Base URL', placeholder: 'https://so.metaid.io/content' },
  { key: 'manApiBaseUrl', label: 'ManAPI Base URL', placeholder: 'https://manapi.metaid.io' },
  { key: 'blockExplorerBaseUrl', label: 'Block Explorer Base URL', placeholder: 'https://www.mvcscan.com/tx' },
  { key: 'walletApiBaseUrl', label: 'Wallet API Base URL', placeholder: 'https://...' },
];
```

- [ ] **Step 2: Add shared renderer helpers**

Create `packages/ui/src/renderers.ts`:

```ts
import type {
  BrowserRendererDescriptor,
  BrowserResourceEnvelope,
  BrowserResourceSection,
  BrowserTrustedActionDescriptor,
} from '@openagentinternet/agent-browser-host-contract';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

export function safeResourceUrl(rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sectionItemTitle(item: Record<string, unknown>): string {
  return text(item.title) || text(item.displayName) || text(item.name) || text(item.id) || 'Untitled';
}

function sectionItemDescription(item: Record<string, unknown>): string {
  return text(item.description) || text(item.summary) || text(item.bio);
}

function renderActions(actions: readonly BrowserTrustedActionDescriptor[]): string {
  if (actions.length === 0) return '';
  return `<div class="browser-action-row">${actions.map((action) => (
    `<button type="button" data-browser-action="${escapeHtml(action.kind)}" data-browser-action-id="${escapeHtml(action.id)}"${action.enabled ? '' : ' disabled'}>${escapeHtml(action.label)}</button>`
  )).join('')}</div>`;
}

function renderSection(section: BrowserResourceSection): string {
  return `<section class="browser-resource-section" data-browser-section="${escapeHtml(section.kind)}">
    <h3>${escapeHtml(section.title)}</h3>
    <div class="browser-resource-list">
      ${section.items.map((item) => `<article class="browser-resource-list-item">
        <strong>${escapeHtml(sectionItemTitle(item))}</strong>
        ${sectionItemDescription(item) ? `<p>${escapeHtml(sectionItemDescription(item))}</p>` : ''}
      </article>`).join('')}
    </div>
  </section>`;
}

export function renderBotPageHtml(resource: BrowserResourceEnvelope): string {
  const templateId = resource.renderer.templateId === 'compact-list' ? 'compact-list' : 'document';
  return `<article class="browser-bot-page browser-bot-template-${escapeHtml(templateId)}">
    <header class="browser-bot-hero">
      ${resource.owner?.avatar ? `<img class="browser-bot-avatar" src="${escapeHtml(safeResourceUrl(resource.owner.avatar))}" alt="">` : '<span class="browser-bot-avatar browser-avatar-fallback">B</span>'}
      <div>
        <h2>${escapeHtml(resource.title)}</h2>
        ${resource.owner?.globalMetaId ? `<p>${escapeHtml(resource.owner.globalMetaId)}</p>` : ''}
      </div>
    </header>
    ${renderActions(resource.actions)}
    <div class="browser-resource-sections">
      ${resource.sections.map(renderSection).join('')}
    </div>
  </article>`;
}

function renderUrlRenderer(renderer: BrowserRendererDescriptor, className: string, tag: 'iframe' | 'img' | 'video'): string {
  const url = safeResourceUrl(renderer.url);
  if (!url) {
    return '<section class="browser-empty-state"><h2>Renderer URL blocked</h2></section>';
  }
  if (tag === 'iframe' && className === 'browser-html-frame') {
    return `<iframe class="${className}" sandbox="allow-scripts" src="${escapeHtml(url)}" title="MetaApp preview"></iframe>`;
  }
  if (tag === 'iframe') {
    return `<iframe class="${className}" src="${escapeHtml(url)}" title="Document preview"></iframe>`;
  }
  if (tag === 'img') {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="">`;
  }
  return `<video class="${className}" src="${escapeHtml(url)}" controls></video>`;
}

export function renderResourceHtml(resource: BrowserResourceEnvelope): string {
  const renderer = resource.renderer;
  if (renderer.type === 'bot-page') return renderBotPageHtml(resource);
  if (renderer.type === 'html-iframe') return renderUrlRenderer(renderer, 'browser-html-frame', 'iframe');
  if (renderer.type === 'pdf') return renderUrlRenderer(renderer, 'browser-pdf', 'iframe');
  if (renderer.type === 'image') return renderUrlRenderer(renderer, 'browser-image', 'img');
  if (renderer.type === 'video') return renderUrlRenderer(renderer, 'browser-video', 'video');
  return `<section class="browser-empty-state"><h2>Unsupported renderer</h2><p>${escapeHtml(renderer.error || renderer.contentType || 'This resource type is not supported yet.')}</p></section>`;
}
```

- [ ] **Step 3: Add Browser page definition**

Create `packages/ui/src/pageDefinition.ts`:

```ts
import type { BrowserResourceEnvelope, BrowserRuntimeSnapshot } from '@openagentinternet/agent-browser-host-contract';
import { escapeHtml, renderResourceHtml } from './renderers.js';

export interface BrowserPageDefinitionInput {
  title?: string;
  apiBasePath?: string;
  initialUri?: string;
  runtime?: BrowserRuntimeSnapshot | null;
  resource?: BrowserResourceEnvelope | null;
}

export interface BrowserPageDefinition {
  title: string;
  apiBasePath: string;
  initialUri: string;
  contentHtml: string;
  script: string;
}

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function browserClientScript(input: { apiBasePath: string; initialUri: string }): string {
  return `(() => {
  const apiBasePath = ${jsonScript(input.apiBasePath)};
  const initialUri = ${jsonScript(input.initialUri)};
  const input = document.querySelector('[data-browser-uri-input]');
  const form = document.querySelector('[data-browser-address-form]');
  const viewport = document.querySelector('[data-browser-viewport]');
  const status = document.querySelector('[data-browser-status-state]');
  const actor = document.querySelector('[data-browser-using-selector]');
  const resourceChip = document.querySelector('[data-browser-resource-chip]');
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  }
  function safeUrl(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (text.charAt(0) === '/' && text.slice(0, 2) !== '//') return text;
    try {
      const parsed = new URL(text);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
      return '';
    }
  }
  function sectionHtml(section) {
    return '<section class="browser-resource-section"><h3>' + escapeHtml(section.title) + '</h3>' +
      (section.items || []).map((item) => '<article class="browser-resource-list-item"><strong>' +
        escapeHtml(item.title || item.displayName || item.name || item.id || 'Untitled') + '</strong><p>' +
        escapeHtml(item.description || item.summary || item.bio || '') + '</p></article>').join('') +
      '</section>';
  }
  function resourceHtml(resource) {
    const renderer = resource.renderer || {};
    if (renderer.type === 'bot-page') {
      return '<article class="browser-bot-page browser-bot-template-' + escapeHtml(renderer.templateId || 'document') + '">' +
        '<header class="browser-bot-hero"><h2>' + escapeHtml(resource.title || 'Bot') + '</h2><p>' +
        escapeHtml(resource.owner && resource.owner.globalMetaId || '') + '</p></header>' +
        '<div class="browser-resource-sections">' + (resource.sections || []).map(sectionHtml).join('') + '</div></article>';
    }
    const url = safeUrl(renderer.url);
    if (!url) return '<section class="browser-empty-state"><h2>Renderer URL blocked</h2></section>';
    if (renderer.type === 'html-iframe') return '<iframe class="browser-html-frame" sandbox="allow-scripts" src="' + escapeHtml(url) + '"></iframe>';
    if (renderer.type === 'pdf') return '<iframe class="browser-pdf" src="' + escapeHtml(url) + '"></iframe>';
    if (renderer.type === 'image') return '<img class="browser-image" src="' + escapeHtml(url) + '" alt="">';
    if (renderer.type === 'video') return '<video class="browser-video" src="' + escapeHtml(url) + '" controls></video>';
    return '<section class="browser-empty-state"><h2>Unsupported renderer</h2><p>' + escapeHtml(renderer.error || renderer.contentType || '') + '</p></section>';
  }
  async function loadRuntime() {
    const response = await fetch(apiBasePath + '/runtime');
    const payload = await response.json();
    if (payload.ok && payload.data && payload.data.defaultActor && actor) {
      actor.querySelector('.browser-chip-title').textContent = payload.data.labels.actorChip + ': ' + payload.data.defaultActor.label;
    }
  }
  async function navigateTo(uri) {
    if (!uri || !viewport) return;
    if (status) status.textContent = 'loading';
    const response = await fetch(apiBasePath + '/resolve?uri=' + encodeURIComponent(uri));
    const payload = await response.json();
    if (!payload.ok) {
      viewport.innerHTML = '<section class="browser-empty-state"><h2>Resolve failed</h2><p>' + escapeHtml(payload.message || payload.code || 'Unknown error') + '</p></section>';
      if (status) status.textContent = 'error';
      return;
    }
    viewport.innerHTML = resourceHtml(payload.data);
    if (resourceChip) resourceChip.querySelector('.browser-chip-title').textContent = payload.data.title || 'Resource';
    if (status) status.textContent = 'resolved';
  }
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      navigateTo(input && input.value || '');
    });
  }
  loadRuntime().catch(() => {});
  if (input && !input.value) input.value = initialUri;
  if (initialUri && viewport && !viewport.innerHTML.trim()) navigateTo(initialUri).catch(() => {});
})();`;
}

export function buildBrowserPageDefinition(input: BrowserPageDefinitionInput = {}): BrowserPageDefinition {
  const apiBasePath = input.apiBasePath ?? '/api/browser';
  const initialUri = input.initialUri ?? input.runtime?.defaultUri ?? 'metaid://idq1fixturebot';
  const initialResource = input.resource ? renderResourceHtml(input.resource) : '<section class="browser-empty-state"><h2>Enter an Agent Internet URI</h2></section>';
  return {
    title: input.title ?? 'Agent Internet Browser',
    apiBasePath,
    initialUri,
    contentHtml: `<section class="browser-shell" data-browser-shell>
      <header class="browser-topbar" data-browser-topbar>
        <nav class="browser-nav" aria-label="Browser navigation">
          <button type="button" class="browser-icon-button" aria-label="Back" data-browser-back></button>
          <button type="button" class="browser-icon-button" aria-label="Forward" data-browser-forward></button>
          <button type="button" class="browser-icon-button" aria-label="Reload" data-browser-reload></button>
          <button type="button" class="browser-icon-button" aria-label="Bookmarks and history" data-browser-drawer-toggle></button>
        </nav>
        <form class="browser-address-form" data-browser-address-form>
          <input data-browser-uri-input aria-label="Agent Internet URI" value="${escapeHtml(initialUri)}" placeholder="metaid://idq1example">
          <button type="submit" class="browser-address-submit" aria-label="Visit URI"></button>
        </form>
        <button type="button" class="browser-resource-chip" data-browser-resource-chip><span class="browser-chip-title">Resource</span></button>
        <button type="button" class="browser-using-chip" data-browser-using-selector><span class="browser-chip-title">Using</span></button>
      </header>
      <div class="browser-owner-toolbar" data-browser-owner-toolbar hidden></div>
      <div class="browser-viewport-row" data-browser-viewport-row>
        <aside class="browser-drawer" data-browser-drawer hidden></aside>
        <main class="browser-viewport" data-browser-viewport>${initialResource}</main>
        <aside class="browser-inspector" data-browser-inspector hidden></aside>
      </div>
      <footer class="browser-status-strip" data-browser-status-strip>
        <button type="button" data-browser-status-state>ready</button>
        <button type="button" data-browser-status-proof>unverified</button>
        <span data-browser-status-renderer>renderer</span>
        <button type="button" data-browser-status-txid>TXID: -</button>
      </footer>
    </section>`,
    script: browserClientScript({ apiBasePath, initialUri }),
  };
}
```

- [ ] **Step 4: Add full HTML rendering**

Create `packages/ui/src/browserPageHtml.ts`:

```ts
import { buildBrowserPageDefinition, type BrowserPageDefinition } from './pageDefinition.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

export function renderBrowserPageHtml(definition: BrowserPageDefinition = buildBrowserPageDefinition()): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(definition.title)}</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body:has(.browser-shell) { overflow: hidden; }
    .browser-shell { height: 100vh; min-height: 0; display: grid; grid-template-rows: 58px auto minmax(0, 1fr) 32px; background: #f8fafc; color: #111827; font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
    .browser-topbar { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #d1d5db; background: #fff; }
    .browser-nav { display: flex; gap: 4px; }
    .browser-icon-button, .browser-address-submit, .browser-status-strip button { width: 34px; height: 34px; border: 1px solid #d1d5db; background: #fff; }
    .browser-address-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
    .browser-address-form input { min-width: 0; border: 1px solid #d1d5db; padding: 0 10px; height: 34px; }
    .browser-resource-chip, .browser-using-chip { height: 34px; border: 1px solid #d1d5db; background: #fff; padding: 0 10px; white-space: nowrap; }
    .browser-owner-toolbar { grid-row: 2; display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding: 6px 8px; border-bottom: 1px solid #d1d5db; background: #f3f4f6; }
    .browser-viewport-row { grid-row: 3; position: relative; min-height: 0; display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; overflow: hidden; }
    .browser-drawer, .browser-inspector { min-height: 0; overflow: auto; border-right: 1px solid #d1d5db; background: #fff; }
    .browser-inspector { border-right: 0; border-left: 1px solid #d1d5db; }
    .browser-viewport { min-height: 0; overflow: auto; padding: 18px; }
    .browser-status-strip { grid-row: 4; display: flex; gap: 8px; align-items: center; padding: 0 8px; border-top: 1px solid #d1d5db; background: #fff; }
    .browser-bot-page, .browser-empty-state { max-width: 980px; margin: 0 auto; }
    .browser-bot-hero { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .browser-bot-avatar { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; background: #e5e7eb; }
    .browser-action-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .browser-action-row button { border: 1px solid #d1d5db; background: #fff; padding: 6px 10px; }
    .browser-resource-sections { display: grid; gap: 12px; }
    .browser-resource-section { background: #fff; border: 1px solid #d1d5db; padding: 12px; }
    .browser-resource-list { display: grid; gap: 8px; }
    .browser-resource-list-item { border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .browser-html-frame, .browser-pdf { width: 100%; height: 100%; min-height: 520px; border: 0; background: #fff; }
    .browser-image, .browser-video { display: block; max-width: 100%; margin: 0 auto; }
    @media (max-width: 900px) {
      .browser-topbar { grid-template-columns: auto minmax(120px, 1fr); }
      .browser-resource-chip, .browser-using-chip { display: none; }
      .browser-drawer, .browser-inspector { position: absolute; grid-row: 1; top: 0; bottom: 0; z-index: 2; width: min(86vw, 320px); }
      .browser-drawer { left: 0; }
      .browser-inspector { right: 0; }
    }
  </style>
</head>
<body>
${definition.contentHtml}
<script>${definition.script}</script>
</body>
</html>`;
}
```

- [ ] **Step 5: Replace the UI package entrypoint**

Replace `packages/ui/src/index.ts` with:

```ts
export {
  renderBrowserPageHtml,
} from './browserPageHtml.js';
export {
  buildBrowserPageDefinition,
  type BrowserPageDefinition,
  type BrowserPageDefinitionInput,
} from './pageDefinition.js';
export {
  escapeHtml,
  renderBotPageHtml,
  renderResourceHtml,
  safeResourceUrl,
} from './renderers.js';
export {
  BROWSER_BASE_URL_FIELDS,
  BROWSER_BOT_HOMEPAGE_TEMPLATES,
  BROWSER_MENU_SECTIONS,
  BROWSER_SETTINGS_TABS,
  type BrowserBaseUrlFieldDefinition,
  type BrowserMenuItemDefinition,
  type BrowserMenuSectionDefinition,
  type BrowserSettingsTabDefinition,
} from './menuModel.js';
```

- [ ] **Step 6: Add renderer tests**

Create `tests/ui/renderers.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');

async function botEnvelope(templateId = 'document') {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/botHomepage.v1.json', import.meta.url), 'utf8'));
  return core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
    templateId,
  });
}

test('bot-page renderer shows profile, sections, and trusted buttons', async () => {
  const html = ui.renderResourceHtml(await botEnvelope('compact-list'));
  assert.match(html, /browser-bot-template-compact-list/);
  assert.match(html, /Fixture Bot/);
  assert.match(html, /idq1fixturebot/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /Template Authoring/);
  assert.match(html, /Fixture Bus/);
  assert.match(html, /data-browser-action="private-chat"/);
  assert.match(html, /data-browser-action="service-call"/);
});

test('html iframe renderer is sandboxed and rejects unsafe URLs', () => {
  const safe = ui.renderResourceHtml({
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture App',
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'https://metaweb.example/app' },
    actions: [],
    sections: [],
  });
  assert.match(safe, /<iframe class="browser-html-frame" sandbox="allow-scripts" src="https:\/\/metaweb\.example\/app"/);
  assert.doesNotMatch(safe, /allow-same-origin/);
  assert.doesNotMatch(safe, /allow-top-navigation/);

  const blocked = ui.renderResourceHtml({
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture App',
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'javascript:alert(1)' },
    actions: [],
    sections: [],
  });
  assert.match(blocked, /Renderer URL blocked/);
  assert.doesNotMatch(blocked, /javascript:alert/);
});

test('pdf image and video render with content-specific elements', () => {
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://pdf', normalizedUri: 'metaapp://pdf', resourceType: 'pdf', title: 'PDF', renderer: { type: 'pdf', contentType: 'application/pdf', url: 'https://files.example/a.pdf' }, actions: [], sections: [] }), /class="browser-pdf"/);
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://image', normalizedUri: 'metaapp://image', resourceType: 'image', title: 'Image', renderer: { type: 'image', contentType: 'image/png', url: 'https://files.example/a.png' }, actions: [], sections: [] }), /class="browser-image"/);
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://video', normalizedUri: 'metaapp://video', resourceType: 'metaapp', title: 'Video', renderer: { type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4' }, actions: [], sections: [] }), /class="browser-video"/);
});
```

- [ ] **Step 7: Add Browser shell tests**

Create `tests/ui/browserPage.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');

test('Browser page renders fixed chrome, URI input, actor chip, viewport, and status strip', () => {
  const definition = ui.buildBrowserPageDefinition({ initialUri: 'metaid://idq1fixturebot' });
  const html = ui.renderBrowserPageHtml(definition);

  assert.match(html, /Agent Internet Browser/);
  assert.match(html, /data-browser-shell/);
  assert.match(html, /data-browser-uri-input/);
  assert.match(html, /data-browser-using-selector/);
  assert.match(html, /data-browser-viewport/);
  assert.match(html, /data-browser-status-strip/);
  assert.match(html, /body:has\(\.browser-shell\) \{ overflow: hidden; \}/);
  assert.match(html, /\.browser-viewport \{ min-height: 0; overflow: auto;/);
  assert.match(html, /TXID: -/);
});

test('Browser page can include an initial Bot resource render', async () => {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/botHomepage.v1.json', import.meta.url), 'utf8'));
  const resource = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
  });
  const html = ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition({ resource }));

  assert.match(html, /Fixture Bot/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /\/api\/browser\/resolve/);
});
```

- [ ] **Step 8: Run focused UI verification**

Run:

```bash
npm run build
node --test tests/ui/renderers.test.mjs tests/ui/browserPage.test.mjs
git diff --check
```

Expected: all commands pass.

- [ ] **Step 9: Commit shared UI package**

Run:

```bash
git add packages/ui tests/ui
git commit -m "feat: add shared browser ui package"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 4: Standalone Memory Host And Development Server

**Files:**
- Create: `packages/host-standalone/src/memoryHost.ts`
- Create: `packages/host-standalone/src/http.ts`
- Create: `packages/host-standalone/src/server.ts`
- Create: `packages/host-standalone/src/main.ts`
- Modify: `packages/host-standalone/src/index.ts`
- Create: `tests/host-standalone/standaloneServer.test.mjs`

- [ ] **Step 1: Add the memory host adapter**

Create `packages/host-standalone/src/memoryHost.ts`:

```ts
import {
  buildBotHomepageEnvelope,
  createUnsupportedResourceEnvelope,
  parseBrowserUri,
} from '@openagentinternet/agent-browser-core';
import {
  browserFailure,
  browserSuccess,
  type BrowserActor,
  type BrowserHostAdapter,
  type BrowserResourceEnvelope,
  type BrowserRuntimeSnapshot,
  type BrowserSettingsSnapshot,
} from '@openagentinternet/agent-browser-host-contract';

const STANDALONE_ACTOR_ID = 'standalone-wallet';

export interface MemoryStandaloneHostInput {
  now?: () => number;
  defaultUri?: string;
}

function fixtureHomepage(): Record<string, unknown> {
  return {
    schemaVersion: 'botHomepage.v1',
    globalMetaId: 'idq1fixturebot',
    profile: {
      name: 'Fixture Bot',
      avatar: 'https://so.example.test/content/avatar-pin',
      bio: 'Builds Agent Browser fixtures.',
      address: '1FixtureAddress',
    },
    homepage: {
      summary: 'A Bot homepage served by the standalone development host.',
    },
    identity: {
      txid: 'identity-txid',
      pinId: 'identity-pin',
    },
    services: [
      {
        id: 'svc-review',
        currentPinId: 'service-pin-1',
        displayName: 'Fixture Review',
        description: 'Reviews Browser templates.',
      },
    ],
    skills: [
      {
        name: 'Template Authoring',
        description: 'Creates Bot homepage layouts.',
      },
    ],
  };
}

function runtime(defaultUri: string): BrowserRuntimeSnapshot {
  const actor: BrowserActor = {
    id: STANDALONE_ACTOR_ID,
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  };
  return {
    host: {
      kind: 'standalone',
      name: 'Agent Internet Browser',
      localMode: false,
    },
    actors: [actor],
    defaultActor: actor,
    defaultUri,
    features: {
      privateChat: false,
      serviceCall: false,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: false,
    },
    labels: {
      actorChip: 'Wallet',
      noActorTitle: 'No Wallet',
      noActorBody: 'Standalone Browser is running with an in-memory development actor.',
    },
  };
}

export function createMemoryStandaloneBrowserHost(input: MemoryStandaloneHostInput = {}): BrowserHostAdapter {
  const now = input.now ?? Date.now;
  const defaultUri = input.defaultUri ?? 'metaid://idq1fixturebot';
  let settings: BrowserSettingsSnapshot = {
    browser: {
      botHomepageTemplateId: 'document',
    },
    effectiveBrowser: {
      botHomepageTemplateId: 'document',
      localMode: false,
    },
    defaults: {
      botHomepageTemplateId: 'document',
      localMode: false,
    },
  };
  let cacheClearedAt: number | null = null;

  function ensureActor(actorId?: string) {
    if (actorId && actorId !== STANDALONE_ACTOR_ID) {
      return browserFailure('actor_not_found', `Standalone Browser actor not found: ${actorId}`);
    }
    return null;
  }

  function resolveMetaapp(uri: string, normalizedUri: string): BrowserResourceEnvelope {
    return {
      uri,
      normalizedUri,
      resourceType: 'metaapp',
      title: 'Fixture MetaApp',
      owner: {
        kind: 'metaapp-publisher',
        globalMetaId: 'idq1fixturebot',
        label: 'Fixture Publisher',
        verificationState: 'partial',
      },
      ownerAffinity: null,
      renderer: {
        type: 'html-iframe',
        contentType: 'text/html',
        url: 'https://example.com/metaapp-preview.html',
      },
      actions: [],
      sections: [],
      status: {
        state: 'resolved',
        verificationState: 'partial',
        message: '',
      },
      proof: {
        pinId: normalizedUri.slice('metaapp://'.length),
        verificationState: 'partial',
      },
      source: {
        resolver: 'standalone-memory',
        fetchedAt: now(),
      },
    };
  }

  return {
    async getRuntime(actorInput = {}) {
      const failure = ensureActor(actorInput.actorId);
      return failure ?? browserSuccess(runtime(defaultUri));
    },
    async resolveResource(resolveInput) {
      const failure = ensureActor(resolveInput.actorId);
      if (failure) return failure;
      try {
        const parsed = parseBrowserUri(resolveInput.uri);
        if (parsed.scheme === 'metaid') {
          return browserSuccess(buildBotHomepageEnvelope({
            uri: parsed.originalUri,
            normalizedUri: parsed.normalizedUri,
            homepage: fixtureHomepage(),
            resolverUrl: 'memory://bot-homepage/idq1fixturebot',
            templateId: String(settings.effectiveBrowser.botHomepageTemplateId ?? 'document'),
            fetchedAt: now(),
          }));
        }
        return browserSuccess(resolveMetaapp(parsed.originalUri, parsed.normalizedUri));
      } catch (error) {
        return browserFailure('invalid_browser_uri', error instanceof Error ? error.message : String(error));
      }
    },
    async getSettings(actorInput = {}) {
      const failure = ensureActor(actorInput.actorId);
      return failure ?? browserSuccess(settings);
    },
    async updateSettings(input) {
      const failure = ensureActor(input.actorId);
      if (failure) return failure;
      settings = {
        browser: input.browser ?? {},
        effectiveBrowser: {
          ...settings.defaults,
          ...(input.browser ?? {}),
          localMode: false,
        },
        defaults: settings.defaults,
      };
      return browserSuccess(settings);
    },
    async getCache(actorInput = {}) {
      const failure = ensureActor(actorInput.actorId);
      if (failure) return failure;
      return browserSuccess({
        cacheRoot: 'standalone-memory',
        artifactCount: 0,
        pinRecordCount: 0,
        totalBytes: 0,
        lastClearedAt: cacheClearedAt,
      });
    },
    async clearCache(input) {
      const failure = ensureActor(input.actorId);
      if (failure) return failure;
      const scope = input.scope ?? 'all';
      if (!['all', 'artifact', 'pin'].includes(scope)) {
        return browserFailure('invalid_argument', 'Unsupported Browser cache clear scope.');
      }
      cacheClearedAt = now();
      return browserSuccess({
        cacheRoot: 'standalone-memory',
        clearedArtifacts: 0,
        clearedPinRecords: 0,
        scope,
        lastClearedAt: cacheClearedAt,
      });
    },
    async runTrustedAction(input) {
      const failure = ensureActor(input.actorId);
      if (failure) return failure;
      return browserFailure('browser_action_not_supported', `Standalone Browser does not support trusted action: ${input.kind}`);
    },
  };
}
```

- [ ] **Step 2: Add HTTP route helpers**

Create `packages/host-standalone/src/http.ts`:

```ts
import { Buffer } from 'node:buffer';
import type http from 'node:http';
import {
  browserFailure,
  type BrowserCommandResult,
  type BrowserHostAdapter,
  type BrowserTrustedActionKind,
} from '@openagentinternet/agent-browser-host-contract';

const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

function statusForResult(result: BrowserCommandResult<unknown>): number {
  if (result.ok) return 200;
  if (result.code === 'invalid_browser_uri' || result.code === 'missing_uri' || result.code === 'invalid_argument') return 400;
  if (result.code === 'actor_not_found') return 404;
  return 400;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;
    if (totalBytes > JSON_BODY_LIMIT_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object request body.');
  }
  return parsed as Record<string, unknown>;
}

export function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  });
  res.end(html);
}

export async function handleStandaloneBrowserApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  adapter: BrowserHostAdapter,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const actorId = text(url.searchParams.get('actorId'));

  if (url.pathname === '/api/browser/runtime') {
    if (method !== 'GET') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
      return true;
    }
    const result = await adapter.getRuntime(actorId ? { actorId } : {});
    sendJson(res, statusForResult(result), result);
    return true;
  }

  if (url.pathname === '/api/browser/resolve') {
    if (method !== 'GET') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
      return true;
    }
    const uri = text(url.searchParams.get('uri'));
    if (!uri) {
      sendJson(res, 400, browserFailure('missing_uri', 'uri query parameter is required.'));
      return true;
    }
    const result = await adapter.resolveResource({ uri, ...(actorId ? { actorId } : {}) });
    sendJson(res, statusForResult(result), result);
    return true;
  }

  if (url.pathname === '/api/browser/settings') {
    if (method === 'GET') {
      const result = await adapter.getSettings(actorId ? { actorId } : {});
      sendJson(res, statusForResult(result), result);
      return true;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const browser = body.browser && typeof body.browser === 'object' && !Array.isArray(body.browser)
        ? body.browser as Record<string, unknown>
        : {};
      const result = await adapter.updateSettings({ browser, ...(actorId ? { actorId } : {}) });
      sendJson(res, statusForResult(result), result);
      return true;
    }
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET or PUT.'));
    return true;
  }

  if (url.pathname === '/api/browser/cache') {
    if (method === 'GET') {
      const result = await adapter.getCache(actorId ? { actorId } : {});
      sendJson(res, statusForResult(result), result);
      return true;
    }
    if (method === 'DELETE') {
      const body = await readJsonBody(req);
      const result = await adapter.clearCache({
        scope: text(body.scope) || 'all',
        ...(actorId ? { actorId } : {}),
      });
      sendJson(res, statusForResult(result), result);
      return true;
    }
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET or DELETE.'));
    return true;
  }

  if (url.pathname === '/api/browser/actions') {
    if (method !== 'POST') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected POST.'));
      return true;
    }
    const body = await readJsonBody(req);
    const result = await adapter.runTrustedAction({
      resourceUri: text(body.resourceUri),
      kind: text(body.kind) as BrowserTrustedActionKind,
      ...(actorId ? { actorId } : {}),
      ...(body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? { payload: body.payload as Record<string, unknown> } : {}),
    });
    sendJson(res, statusForResult(result), result);
    return true;
  }

  return false;
}
```

- [ ] **Step 3: Add standalone server**

Create `packages/host-standalone/src/server.ts`:

```ts
import http from 'node:http';
import type { BrowserHostAdapter, BrowserResourceEnvelope, BrowserRuntimeSnapshot } from '@openagentinternet/agent-browser-host-contract';
import { buildBrowserPageDefinition, renderBrowserPageHtml } from '@openagentinternet/agent-browser-ui';
import { createMemoryStandaloneBrowserHost } from './memoryHost.js';
import { handleStandaloneBrowserApiRoute, sendHtml, sendJson } from './http.js';

export interface CreateStandaloneBrowserServerInput {
  adapter?: BrowserHostAdapter;
  defaultUri?: string;
}

async function loadInitialPage(adapter: BrowserHostAdapter, defaultUri: string): Promise<string> {
  const runtime = await adapter.getRuntime();
  const resource = await adapter.resolveResource({ uri: defaultUri });
  return renderBrowserPageHtml(buildBrowserPageDefinition({
    initialUri: defaultUri,
    runtime: runtime.ok ? runtime.data as BrowserRuntimeSnapshot : null,
    resource: resource.ok ? resource.data as BrowserResourceEnvelope : null,
  }));
}

function isBrowserPage(pathname: string): boolean {
  return pathname === '/' || pathname === '/browser' || pathname === '/ui/browser';
}

export function createStandaloneBrowserServer(input: CreateStandaloneBrowserServerInput = {}): http.Server {
  const defaultUri = input.defaultUri ?? 'metaid://idq1fixturebot';
  const adapter = input.adapter ?? createMemoryStandaloneBrowserHost({ defaultUri });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (url.pathname === '/healthz') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (isBrowserPage(url.pathname)) {
        if ((req.method ?? 'GET') !== 'GET') {
          sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Expected GET.' });
          return;
        }
        sendHtml(res, 200, await loadInitialPage(adapter, url.searchParams.get('uri') ?? defaultUri));
        return;
      }
      if (await handleStandaloneBrowserApiRoute(req, res, url, adapter)) {
        return;
      }
      sendJson(res, 404, { ok: false, code: 'not_found', message: `No route matched ${url.pathname}.` });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
```

- [ ] **Step 4: Add standalone CLI**

Create `packages/host-standalone/src/main.ts`:

```ts
#!/usr/bin/env node
import { createStandaloneBrowserServer } from './server.js';

function readOption(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) return argv[index + 1];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid Browser standalone port: ${value}`);
  }
  return port;
}

export async function main(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const host = readOption(argv, '--host') ?? env.BROWSER_HOST ?? '127.0.0.1';
  const port = parsePort(readOption(argv, '--port') ?? env.BROWSER_PORT ?? '8787');
  const server = createStandaloneBrowserServer();

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`Agent Internet Browser listening at http://${host}:${actualPort}/browser\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Replace the standalone package entrypoint**

Replace `packages/host-standalone/src/index.ts` with:

```ts
export {
  createMemoryStandaloneBrowserHost,
  type MemoryStandaloneHostInput,
} from './memoryHost.js';
export {
  createStandaloneBrowserServer,
  type CreateStandaloneBrowserServerInput,
} from './server.js';
export {
  handleStandaloneBrowserApiRoute,
  sendHtml,
  sendJson,
} from './http.js';
```

- [ ] **Step 6: Add standalone server tests**

Create `tests/host-standalone/standaloneServer.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const standalone = await import('../../packages/host-standalone/dist/index.js');

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function json(response) {
  return response.json();
}

test('standalone Browser server serves Browser shell and health route', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const health = await json(await fetch(`${baseUrl}/healthz`));
  assert.deepEqual(health, { ok: true });

  const response = await fetch(`${baseUrl}/browser`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Agent Internet Browser/);
  assert.match(html, /data-browser-shell/);
  assert.match(html, /Fixture Bot/);
  assert.match(html, /\/api\/browser\/runtime/);
});

test('standalone Browser server exposes runtime resolve settings cache and action routes', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const runtime = await json(await fetch(`${baseUrl}/api/browser/runtime`));
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, 'standalone');
  assert.equal(runtime.data.defaultActor.kind, 'wallet');

  const resolved = await json(await fetch(`${baseUrl}/api/browser/resolve?uri=metaid%3A%2F%2Fidq1fixturebot`));
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.resourceType, 'bot');
  assert.equal(resolved.data.renderer.type, 'bot-page');

  const settings = await json(await fetch(`${baseUrl}/api/browser/settings`));
  assert.equal(settings.ok, true);
  assert.equal(settings.data.effectiveBrowser.botHomepageTemplateId, 'document');

  const updated = await json(await fetch(`${baseUrl}/api/browser/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ browser: { botHomepageTemplateId: 'compact-list' } }),
  }));
  assert.equal(updated.ok, true);
  assert.equal(updated.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');

  const cache = await json(await fetch(`${baseUrl}/api/browser/cache`));
  assert.equal(cache.ok, true);
  assert.equal(cache.data.cacheRoot, 'standalone-memory');

  const cleared = await json(await fetch(`${baseUrl}/api/browser/cache`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all' }),
  }));
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.clearedArtifacts, 0);

  const actionResponse = await fetch(`${baseUrl}/api/browser/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'private-chat', resourceUri: 'metaid://idq1fixturebot' }),
  });
  const action = await json(actionResponse);
  assert.equal(actionResponse.status, 400);
  assert.equal(action.ok, false);
  assert.equal(action.code, 'browser_action_not_supported');
});
```

- [ ] **Step 7: Run focused standalone verification**

Run:

```bash
npm run build
node --test tests/host-standalone/standaloneServer.test.mjs tests/host-contract/conformance.test.mjs
node -e "import('./packages/host-standalone/dist/index.js').then(({ createStandaloneBrowserServer }) => { const server = createStandaloneBrowserServer(); server.listen(0, '127.0.0.1', async () => { const address = server.address(); const url = 'http://127.0.0.1:' + address.port + '/browser'; const response = await fetch(url); const html = await response.text(); if (!html.includes('data-browser-shell')) throw new Error('Browser shell missing'); console.log(url); server.close(); }); })"
```

Expected:

- The tests pass.
- The smoke command prints a URL like `http://127.0.0.1:<port>/browser` and exits after confirming the Browser shell is present.

- [ ] **Step 8: Commit standalone host package**

Run:

```bash
git add packages/host-standalone tests/host-standalone
git commit -m "feat: add standalone browser development host"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 5: Closeout, Documentation, And Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README current status**

Replace the `Current Status` section in `README.md` with:

```markdown
## Current Status

This repository contains the first shared Browser foundation:

- host-neutral Browser contract package;
- core resource, URI, and Bot homepage envelope package;
- shared Browser UI package with shell and renderer helpers;
- memory-backed standalone development host;
- fake-host and standalone conformance tests;
- architecture spec plus Phase 1 and Phase 2 implementation plans.

Full OAC package consumption, public Metalet wallet login, production standalone hosting, package
publishing, and IDBots integration are planned as follow-up implementation phases.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
git diff --check
node --test tests/package/packContents.test.mjs
```

Expected:

- `npm run verify` builds all packages and all tests pass.
- `git diff --check` exits 0.
- `tests/package/packContents.test.mjs` confirms no package includes `.tsbuildinfo`.

- [ ] **Step 3: Run standalone smoke check**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node -e "import('./packages/host-standalone/dist/index.js').then(({ createStandaloneBrowserServer }) => { const server = createStandaloneBrowserServer(); server.listen(8787, '127.0.0.1', async () => { const url = 'http://127.0.0.1:8787/browser'; const response = await fetch(url); const html = await response.text(); if (!html.includes('Fixture Bot')) throw new Error('Fixture Bot missing'); console.log(url); server.close(); }); })"
```

Expected:

- The smoke command prints `http://127.0.0.1:8787/browser`.
- The fetched HTML includes the Browser shell and Fixture Bot content.

- [ ] **Step 4: Commit closeout docs**

Run:

```bash
git add README.md docs/superpowers/plans/2026-06-09-agent-browser-core-shared-ui-standalone-preview.md
git commit -m "docs: add browser core phase 2 plan and status"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

- [ ] **Step 5: Push the completed Phase 2 branch**

Run:

```bash
git push origin codex/phase2-shared-ui-standalone-preview
```

Expected: the branch pushes to `https://github.com/openagentinternet/agent-browser-core`.

## Review Checklist

After all tasks pass, run this checklist before asking for merge:

- `packages/core` has no OAC, IDBots, SQLite, Metalet, or Node-only runtime dependency.
- `packages/ui` imports only Browser core and host contract packages.
- `packages/host-standalone` owns the development server and memory host behavior.
- Standalone trusted actions fail closed with `browser_action_not_supported`.
- The iframe renderer uses `sandbox="allow-scripts"` and does not include `allow-same-origin`.
- Browser shell keeps document overflow locked while `.browser-viewport` owns scrolling.
- `npm pack --dry-run --json` for all Browser packages excludes `.tsbuildinfo`.
- OAC repository files are not modified.

## Follow-Up Plans

After this plan passes, write separate implementation plans for:

- publishing the first pre-1.0 package set from `agent-browser-core`;
- adding OAC package consumption and OAC adapter conformance CI;
- adding public standalone Metalet wallet login and production deployment;
- adding the IDBots adapter and conformance tests.
