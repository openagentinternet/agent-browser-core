# Agent Browser Core Pre-1 Package Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `agent-browser-core` ready to publish its first pre-1.0 package set without changing OAC, IDBots, production hosting, or wallet login.

**Architecture:** This phase turns the Phase 2 workspace into a releaseable package set. It adds release metadata, version guards, dual ESM/CommonJS outputs for host compatibility, package export verification, CI/release workflows, and an explicit manual release gate. The development branch must not publish to npm or push a release tag.

**Tech Stack:** TypeScript project references, npm workspaces, Node.js `>=20 <25`, Node test runner, GitHub Actions, npm package exports.

---

## Scope

This phase implements the architecture spec's Phase 3: "Publish The First Browser Package".

In scope:

- release metadata for all Browser packages;
- version verification for root package, workspace packages, internal dependency pins, and release compatibility metadata;
- ESM output for browser and modern bundlers;
- CommonJS output for hosts that still consume CommonJS;
- package export tests for both `import` and `require`;
- npm pack tests that prove release files include declared entrypoints and exclude generated build-info files;
- CI workflow for normal verification;
- release workflow that can publish all packages after a tag is pushed;
- release documentation and a post-merge manual release checklist.

Out of scope:

- updating Open Agent Connect;
- updating IDBots;
- implementing Metalet wallet login;
- deploying a production standalone website;
- pushing a release tag from the development session;
- running `npm publish` from the development session.

## Baseline

Start from `agent-browser-core/main` after Phase 2 merge:

```bash
git status --short --branch
git log --oneline --decorate -3
```

Expected:

- branch is `main`;
- worktree is clean;
- `HEAD` includes `chore: merge browser core phase 2 shared ui preview`.

Create the Phase 3 branch:

```bash
git checkout -b codex/phase3-pre1-package-release
```

Use Node v20.20.0 for local verification:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
node --version
```

Expected: `v20.20.0`.

## File Structure

Create:

- `release/compatibility.json` - release metadata consumed by version checks and future host CI.
- `scripts/browser-workspaces.mjs` - central list of publishable Browser workspace packages and publish order.
- `scripts/verify-release-version.mjs` - validates a tag against all package versions and internal dependency pins.
- `scripts/write-cjs-package-markers.mjs` - writes `dist-cjs/package.json` markers so generated `.js` files are CommonJS under package roots with `"type": "module"`.
- `scripts/publish-packages.mjs` - publishes packages in dependency order, with `--dry-run` for local and CI tests.
- `tsconfig.cjs.base.json` - shared CommonJS TypeScript build settings.
- `packages/*/tsconfig.cjs.json` - per-package CommonJS build configs.
- `.github/workflows/ci.yml` - normal CI verification.
- `.github/workflows/release.yml` - tag-triggered package publishing workflow.
- `tests/package/exportsInterop.test.mjs` - verifies package `import` and `require` exports.
- `tests/release/verifyReleaseVersion.test.mjs` - verifies release version guard behavior.
- `tests/release/publishPackages.test.mjs` - verifies dry-run publish order.
- `tests/release/workflows.test.mjs` - verifies release workflow guardrails.

Modify:

- `package.json` - add build scripts, release verification scripts, and package verification scripts.
- `packages/*/package.json` - add CommonJS entrypoints and package file entries.
- `tests/package/packContents.test.mjs` - extend package-file assertions to cover CommonJS output.
- `README.md` - document Phase 3 status and release process.

## Package List

Publish packages in this order:

1. `@openagentinternet/agent-browser-host-contract`
2. `@openagentinternet/agent-browser-core`
3. `@openagentinternet/agent-browser-ui`
4. `@openagentinternet/agent-browser-host-standalone`
5. `@openagentinternet/agent-browser-test-harness`

All packages remain version `0.1.0` for the first pre-1.0 release unless the implementation session finds that npm already has `0.1.0` published. If `0.1.0` is already published, stop and report before changing versions.

## Task 1: Release Metadata And Version Guard

**Files:**

- Create: `release/compatibility.json`
- Create: `scripts/browser-workspaces.mjs`
- Create: `scripts/verify-release-version.mjs`
- Create: `tests/release/verifyReleaseVersion.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing release version tests**

Create `tests/release/verifyReleaseVersion.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const release = await import('../../scripts/verify-release-version.mjs');
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('verifyReleaseVersion accepts the repository pre-1.0 release tag', async () => {
  await release.verifyReleaseVersion({
    repoRoot,
    tag: 'v0.1.0',
  });
});

test('verifyReleaseVersion rejects a tag that does not match root package version', async () => {
  await assert.rejects(
    () => release.verifyReleaseVersion({ repoRoot, tag: 'v0.2.0' }),
    /Tag version 0\.2\.0 does not match root package version 0\.1\.0/,
  );
});

test('verifyReleaseVersion rejects mismatched package and internal dependency versions', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'agent-browser-release-'));
  try {
    await mkdir(join(tempRoot, 'release'), { recursive: true });
    await mkdir(join(tempRoot, 'packages', 'host-contract'), { recursive: true });
    await mkdir(join(tempRoot, 'packages', 'core'), { recursive: true });
    await mkdir(join(tempRoot, 'packages', 'ui'), { recursive: true });
    await mkdir(join(tempRoot, 'packages', 'host-standalone'), { recursive: true });
    await mkdir(join(tempRoot, 'packages', 'test-harness'), { recursive: true });

    const realRootPackage = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    const realCompatibility = JSON.parse(await readFile(new URL('../../release/compatibility.json', import.meta.url), 'utf8'));

    await writeJson(join(tempRoot, 'package.json'), { ...realRootPackage, version: '0.1.0' });
    await writeJson(join(tempRoot, 'release', 'compatibility.json'), realCompatibility);
    await writeJson(join(tempRoot, 'packages', 'host-contract', 'package.json'), {
      name: '@openagentinternet/agent-browser-host-contract',
      version: '0.1.0',
    });
    await writeJson(join(tempRoot, 'packages', 'core', 'package.json'), {
      name: '@openagentinternet/agent-browser-core',
      version: '0.1.0',
      dependencies: {
        '@openagentinternet/agent-browser-host-contract': '0.2.0',
      },
    });
    await writeJson(join(tempRoot, 'packages', 'ui', 'package.json'), {
      name: '@openagentinternet/agent-browser-ui',
      version: '0.1.0',
      dependencies: {
        '@openagentinternet/agent-browser-core': '0.1.0',
        '@openagentinternet/agent-browser-host-contract': '0.1.0',
      },
    });
    await writeJson(join(tempRoot, 'packages', 'host-standalone', 'package.json'), {
      name: '@openagentinternet/agent-browser-host-standalone',
      version: '0.1.0',
      dependencies: {
        '@openagentinternet/agent-browser-core': '0.1.0',
        '@openagentinternet/agent-browser-host-contract': '0.1.0',
        '@openagentinternet/agent-browser-ui': '0.1.0',
      },
    });
    await writeJson(join(tempRoot, 'packages', 'test-harness', 'package.json'), {
      name: '@openagentinternet/agent-browser-test-harness',
      version: '0.1.0',
      dependencies: {
        '@openagentinternet/agent-browser-host-contract': '0.1.0',
      },
    });

    await assert.rejects(
      () => release.verifyReleaseVersion({ repoRoot: tempRoot, tag: 'v0.1.0' }),
      /@openagentinternet\/agent-browser-core depends on @openagentinternet\/agent-browser-host-contract@0\.2\.0, expected 0\.1\.0/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/verifyReleaseVersion.test.mjs
```

Expected: FAIL because `scripts/verify-release-version.mjs` and `release/compatibility.json` do not exist.

- [ ] **Step 3: Add workspace package list**

Create `scripts/browser-workspaces.mjs`:

```js
export const BROWSER_WORKSPACES = [
  {
    name: '@openagentinternet/agent-browser-host-contract',
    path: 'packages/host-contract',
  },
  {
    name: '@openagentinternet/agent-browser-core',
    path: 'packages/core',
  },
  {
    name: '@openagentinternet/agent-browser-ui',
    path: 'packages/ui',
  },
  {
    name: '@openagentinternet/agent-browser-host-standalone',
    path: 'packages/host-standalone',
  },
  {
    name: '@openagentinternet/agent-browser-test-harness',
    path: 'packages/test-harness',
  },
];

export const BROWSER_PACKAGE_NAMES = BROWSER_WORKSPACES.map((workspace) => workspace.name);
```

- [ ] **Step 4: Add release compatibility metadata**

Create `release/compatibility.json`:

```json
{
  "version": "0.1.0",
  "packages": {
    "@openagentinternet/agent-browser-host-contract": "0.1.0",
    "@openagentinternet/agent-browser-core": "0.1.0",
    "@openagentinternet/agent-browser-ui": "0.1.0",
    "@openagentinternet/agent-browser-host-standalone": "0.1.0",
    "@openagentinternet/agent-browser-test-harness": "0.1.0"
  },
  "hosts": {
    "standalone": "development-preview",
    "oac": "not-integrated",
    "idbots": "not-integrated"
  }
}
```

- [ ] **Step 5: Add release version verifier**

Create `scripts/verify-release-version.mjs`:

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_WORKSPACES } from './browser-workspaces.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = [...argv];
  const result = {
    tag: '',
    repoRoot: REPO_ROOT,
  };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--repo-root') {
      const value = args.shift();
      if (!value) throw new Error('--repo-root requires a path');
      result.repoRoot = path.resolve(value);
      continue;
    }
    if (!result.tag) {
      result.tag = arg ?? '';
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!result.tag) throw new Error('Usage: node scripts/verify-release-version.mjs <tag> [--repo-root <path>]');
  return result;
}

function versionFromTag(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(tag);
  if (!match) throw new Error(`Release tag must look like v0.1.0, got: ${tag}`);
  return match[1];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} version ${actual} does not match expected version ${expected}`);
  }
}

function assertInternalDependencyVersions(manifest, expectedVersion, packageNames) {
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const deps = manifest[field] ?? {};
    for (const packageName of packageNames) {
      if (deps[packageName] && deps[packageName] !== expectedVersion) {
        throw new Error(`${manifest.name} depends on ${packageName}@${deps[packageName]}, expected ${expectedVersion}`);
      }
    }
  }
}

export async function verifyReleaseVersion(input) {
  const repoRoot = path.resolve(input.repoRoot ?? REPO_ROOT);
  const releaseVersion = versionFromTag(input.tag);
  const packageNames = new Set(BROWSER_WORKSPACES.map((workspace) => workspace.name));
  const rootPackage = await readJson(path.join(repoRoot, 'package.json'));
  const compatibility = await readJson(path.join(repoRoot, 'release', 'compatibility.json'));

  if (rootPackage.version !== releaseVersion) {
    throw new Error(`Tag version ${releaseVersion} does not match root package version ${rootPackage.version}`);
  }
  assertVersion('release/compatibility.json', compatibility.version, releaseVersion);

  for (const workspace of BROWSER_WORKSPACES) {
    const manifest = await readJson(path.join(repoRoot, workspace.path, 'package.json'));
    if (manifest.name !== workspace.name) {
      throw new Error(`${workspace.path}/package.json name ${manifest.name} does not match ${workspace.name}`);
    }
    assertVersion(workspace.name, manifest.version, releaseVersion);
    assertVersion(`release/compatibility.json packages.${workspace.name}`, compatibility.packages?.[workspace.name], releaseVersion);
    assertInternalDependencyVersions(manifest, releaseVersion, packageNames);
  }

  return {
    version: releaseVersion,
    packages: BROWSER_WORKSPACES.map((workspace) => workspace.name),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await verifyReleaseVersion(args);
  process.stdout.write(`Agent Browser Core release version verified: ${result.version}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 6: Add package scripts**

Modify the root `package.json` `scripts` object to include release verification:

```json
{
  "scripts": {
    "build": "tsc -b packages/host-contract packages/core packages/ui packages/host-standalone packages/test-harness",
    "test": "npm run build && node --test tests/**/*.test.mjs",
    "verify": "npm run build && node --test tests/**/*.test.mjs",
    "verify:release-version": "node scripts/verify-release-version.mjs",
    "dev:standalone": "node packages/host-standalone/dist/main.js"
  }
}
```

- [ ] **Step 7: Run focused release verification tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/verifyReleaseVersion.test.mjs
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.1.0
```

Expected:

- release test file passes;
- verifier prints `Agent Browser Core release version verified: 0.1.0`.

- [ ] **Step 8: Commit release metadata**

Run:

```bash
git add package.json release/compatibility.json scripts/browser-workspaces.mjs scripts/verify-release-version.mjs tests/release/verifyReleaseVersion.test.mjs
git commit -m "chore: add browser release version metadata"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 2: Dual ESM And CommonJS Package Outputs

**Files:**

- Create: `tsconfig.cjs.base.json`
- Create: `packages/core/tsconfig.cjs.json`
- Create: `packages/host-contract/tsconfig.cjs.json`
- Create: `packages/host-standalone/tsconfig.cjs.json`
- Create: `packages/test-harness/tsconfig.cjs.json`
- Create: `packages/ui/tsconfig.cjs.json`
- Create: `scripts/write-cjs-package-markers.mjs`
- Create: `tests/package/exportsInterop.test.mjs`
- Modify: `package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/host-contract/package.json`
- Modify: `packages/host-standalone/package.json`
- Modify: `packages/test-harness/package.json`
- Modify: `packages/ui/package.json`
- Modify: `tests/package/packContents.test.mjs`

- [ ] **Step 1: Write failing package export interop tests**

Create `tests/package/exportsInterop.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('Browser packages can be imported as ESM', async () => {
  const hostContract = await import('@openagentinternet/agent-browser-host-contract');
  const core = await import('@openagentinternet/agent-browser-core');
  const ui = await import('@openagentinternet/agent-browser-ui');
  const standalone = await import('@openagentinternet/agent-browser-host-standalone');
  const harness = await import('@openagentinternet/agent-browser-test-harness');

  assert.equal(typeof hostContract.browserSuccess, 'function');
  assert.equal(typeof core.parseBrowserUri, 'function');
  assert.equal(typeof core.BOT_HOMEPAGE_TEMPLATES.length, 'number');
  assert.equal(typeof ui.renderBrowserPageHtml, 'function');
  assert.equal(typeof standalone.createStandaloneBrowserServer, 'function');
  assert.equal(typeof harness.assertBrowserHostConformance, 'function');
});

test('Browser packages can be required as CommonJS', () => {
  const hostContract = require('@openagentinternet/agent-browser-host-contract');
  const core = require('@openagentinternet/agent-browser-core');
  const ui = require('@openagentinternet/agent-browser-ui');
  const standalone = require('@openagentinternet/agent-browser-host-standalone');
  const harness = require('@openagentinternet/agent-browser-test-harness');

  assert.equal(typeof hostContract.browserSuccess, 'function');
  assert.equal(typeof core.parseBrowserUri, 'function');
  assert.equal(typeof core.BOT_HOMEPAGE_TEMPLATES.length, 'number');
  assert.equal(typeof ui.renderBrowserPageHtml, 'function');
  assert.equal(typeof standalone.createStandaloneBrowserServer, 'function');
  assert.equal(typeof harness.assertBrowserHostConformance, 'function');
});
```

- [ ] **Step 2: Run test to verify CommonJS fails**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/package/exportsInterop.test.mjs
```

Expected: FAIL on the CommonJS `require(...)` test because the packages currently publish only ESM exports.

- [ ] **Step 3: Add CommonJS TypeScript base config**

Create `tsconfig.cjs.base.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "declaration": false,
    "declarationMap": false,
    "sourceMap": true,
    "composite": false,
    "incremental": true
  }
}
```

- [ ] **Step 4: Add per-package CommonJS configs**

Create `packages/host-contract/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

Create `packages/core/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

Create `packages/ui/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

Create `packages/host-standalone/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/http.ts",
    "src/index.ts",
    "src/memoryHost.ts",
    "src/server.ts"
  ]
}
```

Create `packages/test-harness/tsconfig.cjs.json`:

```json
{
  "extends": "../../tsconfig.cjs.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-cjs",
    "tsBuildInfoFile": "dist-cjs/.tsbuildinfo"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 5: Add CommonJS package markers**

Create `scripts/write-cjs-package-markers.mjs`:

```js
#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_WORKSPACES } from './browser-workspaces.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function writeCommonJsPackageMarkers(repoRoot = REPO_ROOT) {
  for (const workspace of BROWSER_WORKSPACES) {
    const distCjsRoot = path.join(repoRoot, workspace.path, 'dist-cjs');
    await mkdir(distCjsRoot, { recursive: true });
    await writeFile(path.join(distCjsRoot, 'package.json'), '{\n  "type": "commonjs"\n}\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeCommonJsPackageMarkers().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 6: Update root build scripts**

Modify the root `package.json` scripts to:

```json
{
  "scripts": {
    "build:esm": "tsc -b packages/host-contract packages/core packages/ui packages/host-standalone packages/test-harness",
    "build:cjs": "tsc -p packages/host-contract/tsconfig.cjs.json && tsc -p packages/core/tsconfig.cjs.json && tsc -p packages/ui/tsconfig.cjs.json && tsc -p packages/host-standalone/tsconfig.cjs.json && tsc -p packages/test-harness/tsconfig.cjs.json && node scripts/write-cjs-package-markers.mjs",
    "build": "npm run build:esm && npm run build:cjs",
    "test": "npm run build && node --test tests/**/*.test.mjs",
    "verify": "npm run build && node --test tests/**/*.test.mjs",
    "verify:packages": "npm run build && node --test tests/package/*.test.mjs",
    "verify:release-version": "node scripts/verify-release-version.mjs",
    "dev:standalone": "node packages/host-standalone/dist/main.js"
  }
}
```

- [ ] **Step 7: Update package exports**

For every package manifest in `packages/*/package.json`, keep `"type": "module"` and add:

```json
{
  "main": "./dist-cjs/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist-cjs/index.js"
    }
  }
}
```

Keep the standalone package's existing bin:

```json
{
  "bin": {
    "agent-browser-standalone": "./dist/main.js"
  }
}
```

Add `dist-cjs/package.json` and `dist-cjs` generated files to each package's `files` list.

For `packages/host-contract/package.json`, the `files` list should become:

```json
[
  "dist/index.d.ts",
  "dist/index.d.ts.map",
  "dist/index.js",
  "dist/index.js.map",
  "dist-cjs/index.js",
  "dist-cjs/index.js.map",
  "dist-cjs/package.json"
]
```

For `packages/core/package.json`, add these CommonJS entries while keeping the existing ESM entries:

```json
[
  "dist-cjs/index.js",
  "dist-cjs/index.js.map",
  "dist-cjs/bot-homepage/**",
  "dist-cjs/resource/**",
  "dist-cjs/templates/**",
  "dist-cjs/uri/**",
  "dist-cjs/package.json"
]
```

For `packages/ui/package.json`, add CommonJS entries for each generated UI file:

```json
[
  "dist-cjs/browserPageHtml.js",
  "dist-cjs/browserPageHtml.js.map",
  "dist-cjs/index.js",
  "dist-cjs/index.js.map",
  "dist-cjs/menuModel.js",
  "dist-cjs/menuModel.js.map",
  "dist-cjs/pageDefinition.js",
  "dist-cjs/pageDefinition.js.map",
  "dist-cjs/renderers.js",
  "dist-cjs/renderers.js.map",
  "dist-cjs/package.json"
]
```

For `packages/host-standalone/package.json`, add CommonJS entries for each generated host file:

```json
[
  "dist-cjs/http.js",
  "dist-cjs/http.js.map",
  "dist-cjs/index.js",
  "dist-cjs/index.js.map",
  "dist-cjs/memoryHost.js",
  "dist-cjs/memoryHost.js.map",
  "dist-cjs/server.js",
  "dist-cjs/server.js.map",
  "dist-cjs/package.json"
]
```

Do not include `src/main.ts` in the standalone CommonJS build. The CLI uses `import.meta.url`
and remains an ESM-only executable through `dist/main.js`; the CommonJS build only needs the
package API that hosts can `require()`.

For `packages/test-harness/package.json`, the `files` list should become:

```json
[
  "dist/index.d.ts",
  "dist/index.d.ts.map",
  "dist/index.js",
  "dist/index.js.map",
  "dist-cjs/index.js",
  "dist-cjs/index.js.map",
  "dist-cjs/package.json"
]
```

- [ ] **Step 8: Extend pack contents tests**

Modify `tests/package/packContents.test.mjs` so `published Browser packages include declared entrypoints` also checks:

```js
    assertPackIncludes(files, manifest.module, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].require, workspace.name);
    assertPackIncludes(files, 'dist-cjs/package.json', workspace.name);
```

Also add this test:

```js
test('published Browser packages exclude source and TypeScript build artifacts', async () => {
  for (const workspace of WORKSPACES) {
    const files = await packFiles(workspace.name);
    assert.equal(files.some((file) => file.endsWith('.tsbuildinfo')), false, workspace.name);
    assert.equal(files.some((file) => file.startsWith('src/')), false, workspace.name);
    assert.equal(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false, workspace.name);
  }
});
```

- [ ] **Step 9: Run package build and interop tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/package/exportsInterop.test.mjs tests/package/packContents.test.mjs
```

Expected:

- ESM and CJS builds both complete.
- `exportsInterop.test.mjs` proves `import` and `require` work.
- `packContents.test.mjs` proves declared ESM/CJS entrypoints are packed and `.tsbuildinfo` is not packed.

- [ ] **Step 10: Commit dual-output package build**

Run:

```bash
git add package.json tsconfig.cjs.base.json scripts/write-cjs-package-markers.mjs packages/core/package.json packages/core/tsconfig.cjs.json packages/host-contract/package.json packages/host-contract/tsconfig.cjs.json packages/host-standalone/package.json packages/host-standalone/tsconfig.cjs.json packages/test-harness/package.json packages/test-harness/tsconfig.cjs.json packages/ui/package.json packages/ui/tsconfig.cjs.json tests/package/exportsInterop.test.mjs tests/package/packContents.test.mjs
git commit -m "chore: add dual package build outputs"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 3: Package Publishing Scripts And GitHub Workflows

**Files:**

- Create: `scripts/publish-packages.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `tests/release/publishPackages.test.mjs`
- Create: `tests/release/workflows.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing publish and workflow tests**

Create `tests/release/publishPackages.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const publish = await import('../../scripts/publish-packages.mjs');

test('dry-run publish lists Browser packages in dependency order', async () => {
  const lines = [];
  await publish.publishPackages({
    dryRun: true,
    log: (line) => lines.push(line),
  });

  assert.deepEqual(lines, [
    'DRY RUN publish @openagentinternet/agent-browser-host-contract@0.1.0',
    'DRY RUN publish @openagentinternet/agent-browser-core@0.1.0',
    'DRY RUN publish @openagentinternet/agent-browser-ui@0.1.0',
    'DRY RUN publish @openagentinternet/agent-browser-host-standalone@0.1.0',
    'DRY RUN publish @openagentinternet/agent-browser-test-harness@0.1.0',
  ]);
});
```

Create `tests/release/workflows.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('release workflow verifies versions and publishes packages through trusted publisher', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');

  assert.match(workflow, /tags:\n\s+- 'v\*\.\*\.\*'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /node scripts\/verify-release-version\.mjs "\$\{\{ github\.ref_name \}\}"/);
  assert.match(workflow, /node scripts\/publish-packages\.mjs/);
  assert.doesNotMatch(workflow, /npm publish --workspace/);
});

test('ci workflow runs package verification on pushes and pull requests', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.match(workflow, /on:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run verify:packages/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/publishPackages.test.mjs tests/release/workflows.test.mjs
```

Expected: FAIL because `scripts/publish-packages.mjs` and workflow files do not exist.

- [ ] **Step 3: Add publish script**

Create `scripts/publish-packages.mjs`:

```js
#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { BROWSER_WORKSPACES } from './browser-workspaces.mjs';

const execFile = promisify(execFileCallback);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function npmPackageVersionExists(packageName, version) {
  try {
    await execFile('npm', ['view', `${packageName}@${version}`, 'version'], {
      cwd: REPO_ROOT,
    });
    return true;
  } catch {
    return false;
  }
}

async function publishWorkspace(workspaceName) {
  await execFile('npm', ['publish', '--workspace', workspaceName, '--access', 'public'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

export async function publishPackages(input = {}) {
  const dryRun = Boolean(input.dryRun);
  const log = input.log ?? ((line) => process.stdout.write(`${line}\n`));

  for (const workspace of BROWSER_WORKSPACES) {
    const manifest = await readJson(path.join(REPO_ROOT, workspace.path, 'package.json'));
    const label = `${workspace.name}@${manifest.version}`;

    if (dryRun) {
      log(`DRY RUN publish ${label}`);
      continue;
    }

    if (await npmPackageVersionExists(workspace.name, manifest.version)) {
      log(`${label} is already published; skipping.`);
      continue;
    }

    log(`Publishing ${label}`);
    await publishWorkspace(workspace.name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  publishPackages(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches:
      - main
      - 'codex/**'
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20.20.0'

      - name: Install dependencies
        run: npm ci

      - name: Verify workspace
        run: npm run verify

      - name: Verify package outputs
        run: npm run verify:packages

      - name: Verify release metadata
        run: node scripts/verify-release-version.mjs v0.1.0
```

- [ ] **Step 5: Add release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20.20.0'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Verify workspace
        run: npm run verify

      - name: Verify package outputs
        run: npm run verify:packages

      - name: Verify release version
        run: node scripts/verify-release-version.mjs "${{ github.ref_name }}"

      - name: Publish npm packages
        run: node scripts/publish-packages.mjs
```

The npm organization must configure trusted publishing for each publishable package before a real tag is pushed.

- [ ] **Step 6: Add publish scripts to root package**

Modify the root `package.json` scripts to include:

```json
{
  "scripts": {
    "publish:packages": "node scripts/publish-packages.mjs",
    "publish:packages:dry-run": "node scripts/publish-packages.mjs --dry-run"
  }
}
```

Keep all scripts added in Task 1 and Task 2.

- [ ] **Step 7: Run workflow and publish tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node --test tests/release/publishPackages.test.mjs tests/release/workflows.test.mjs
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
```

Expected:

- tests pass;
- dry run prints the five package names in dependency order;
- no network publish occurs.

- [ ] **Step 8: Commit publishing scripts and workflows**

Run:

```bash
git add package.json scripts/publish-packages.mjs .github/workflows/ci.yml .github/workflows/release.yml tests/release/publishPackages.test.mjs tests/release/workflows.test.mjs
git commit -m "chore: add browser package release workflows"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

## Task 4: Closeout Documentation And Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-09-agent-browser-core-pre1-package-release.md`

- [ ] **Step 1: Update README current status**

Replace the `Current Status` section in `README.md` with:

```markdown
## Current Status

This repository contains the first pre-1.0 shared Browser package foundation:

- host-neutral Browser contract package;
- core resource, URI, and Bot homepage envelope package;
- shared Browser UI package with shell and renderer helpers;
- memory-backed standalone development host;
- fake-host and standalone conformance tests;
- ESM and CommonJS package outputs for host compatibility;
- package export, pack-content, release-version, and workflow verification tests;
- CI and tag-triggered release workflow scaffolding.

Full OAC package consumption, public Metalet wallet login, production standalone hosting, and IDBots
integration are planned as follow-up implementation phases.
```

- [ ] **Step 2: Add release instructions to README**

Add this section after `Reference Documents`:

````markdown
## Release Process

The first package release is `v0.1.0`. Package publishing is tag-triggered through
`.github/workflows/release.yml`.

Before pushing a release tag:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.1.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
```

Do not run `npm publish` manually for normal releases. Configure npm trusted publishing for each
publishable package, merge the release-ready branch to `main`, then push the version tag from the
same commit:

```bash
git tag v0.1.0
git push origin v0.1.0
```
````

- [ ] **Step 3: Run full Phase 3 verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.1.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
```

Expected:

- `npm run verify` builds ESM and CJS outputs and all tests pass.
- `npm run verify:packages` passes package export and pack-content tests.
- release version verifier prints `Agent Browser Core release version verified: 0.1.0`.
- publish dry run prints all five packages in dependency order.
- `git diff --check` exits 0.

- [ ] **Step 4: Commit closeout docs**

Run:

```bash
git add README.md docs/superpowers/plans/2026-06-09-agent-browser-core-pre1-package-release.md
git commit -m "docs: add browser core phase 3 release plan and status"
```

Then use `metabot-post-buzz` with Bob (`--from bob`) to publish a development-journal entry for this commit.

- [ ] **Step 5: Push the completed Phase 3 branch**

Run only in the development session after all reviews pass:

```bash
git push origin codex/phase3-pre1-package-release
```

Do not merge to `main`, push `main`, push `v0.1.0`, or run `npm publish` in the development session.

## Review Checklist

After all tasks pass, run this checklist before asking for merge:

- `packages/core` has no OAC, IDBots, SQLite, Metalet, or Node-only runtime dependency.
- `packages/ui` imports only Browser core and host contract packages.
- `packages/host-standalone` remains the only package with standalone Node server code.
- Package manifests expose both ESM `import` and CommonJS `require` entrypoints.
- CommonJS output lives under `dist-cjs/` with `dist-cjs/package.json` declaring `"type": "commonjs"`.
- `npm pack --dry-run --json` includes every declared entrypoint and excludes `.tsbuildinfo`.
- Release workflow does not inline `npm publish --workspace`; it delegates to `scripts/publish-packages.mjs`.
- Release workflow has `id-token: write` for npm trusted publishing.
- Development session did not publish npm packages and did not push a release tag.
- OAC repository files are not modified.

## Follow-Up Plans

After Phase 3 passes and the release branch is merged, the next controlled step is to push tag
`v0.1.0` from the merged `main` commit after npm trusted publishing is configured. After the
package is published, write Phase 4 for OAC pinned package consumption and OAC adapter conformance
CI.
