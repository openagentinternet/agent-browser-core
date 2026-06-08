import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const WORKSPACES = [
  {
    name: '@openagentinternet/agent-browser-host-contract',
    manifestUrl: new URL('../../packages/host-contract/package.json', import.meta.url),
  },
  {
    name: '@openagentinternet/agent-browser-core',
    manifestUrl: new URL('../../packages/core/package.json', import.meta.url),
  },
  {
    name: '@openagentinternet/agent-browser-ui',
    manifestUrl: new URL('../../packages/ui/package.json', import.meta.url),
  },
  {
    name: '@openagentinternet/agent-browser-host-standalone',
    manifestUrl: new URL('../../packages/host-standalone/package.json', import.meta.url),
  },
  {
    name: '@openagentinternet/agent-browser-test-harness',
    manifestUrl: new URL('../../packages/test-harness/package.json', import.meta.url),
  },
];

async function packFiles(workspace) {
  const { stdout } = await execFileAsync('npm', ['pack', '--workspace', workspace, '--dry-run', '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  return parsed[0].files.map((file) => file.path);
}

async function packageManifest(manifestUrl) {
  return JSON.parse(await readFile(manifestUrl, 'utf8'));
}

function packagePath(target) {
  return String(target).replace(/^\.\//, '');
}

function assertPackIncludes(files, target, workspace) {
  assert.equal(files.includes(packagePath(target)), true, `${workspace} packs ${target}`);
}

test('published Browser packages exclude TypeScript build info files', async () => {
  for (const workspace of WORKSPACES) {
    const files = await packFiles(workspace.name);
    assert.equal(files.some((file) => file.endsWith('.tsbuildinfo')), false, workspace.name);
  }
});

test('published Browser packages include declared entrypoints', async () => {
  for (const workspace of WORKSPACES) {
    const files = await packFiles(workspace.name);
    const manifest = await packageManifest(workspace.manifestUrl);

    assertPackIncludes(files, manifest.main, workspace.name);
    assertPackIncludes(files, manifest.types, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].import, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].types, workspace.name);

    for (const target of Object.values(manifest.bin ?? {})) {
      assertPackIncludes(files, target, workspace.name);
    }
  }
});

test('standalone package bin runs through a symlinked command path', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-browser-bin-'));
  try {
    const commandPath = join(tempDir, 'agent-browser-standalone');
    await symlink(new URL('../../packages/host-standalone/dist/main.js', import.meta.url), commandPath);

    const { stdout } = await execFileAsync(commandPath);
    assert.equal(stdout, 'Agent Internet Browser standalone server is not implemented yet.\n');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
