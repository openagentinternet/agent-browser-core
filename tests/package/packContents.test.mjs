import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function packTarball(workspace, destination) {
  const { stdout } = await execFileAsync('npm', ['pack', '--workspace', workspace, '--pack-destination', destination]);
  const tarballName = stdout.trim().split('\n').at(-1);
  assert.equal(typeof tarballName, 'string', `${workspace} pack prints tarball path`);
  assert.notEqual(tarballName, '', `${workspace} pack prints tarball path`);
  return join(destination, tarballName);
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

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(value);
    };
    const onError = (error) => finish(error);
    const onExit = (code, signal) => finish(new Error(`Command exited before expected output: code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`));
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for output. stdout=${stdout} stderr=${stderr}`)), 5000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (pattern.test(stdout)) finish(null, stdout);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

test('published Browser packages exclude source and TypeScript build artifact files', async () => {
  for (const workspace of WORKSPACES) {
    const files = await packFiles(workspace.name);
    assert.equal(files.some((file) => file.endsWith('.tsbuildinfo')), false, `${workspace.name} excludes .tsbuildinfo`);
    assert.equal(files.some((file) => file === 'src' || file.startsWith('src/')), false, `${workspace.name} excludes src/`);
    assert.equal(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false, `${workspace.name} excludes TypeScript source`);
  }
});

test('published Browser packages include declared entrypoints', async () => {
  for (const workspace of WORKSPACES) {
    const files = await packFiles(workspace.name);
    const manifest = await packageManifest(workspace.manifestUrl);

    assertPackIncludes(files, manifest.main, workspace.name);
    assertPackIncludes(files, manifest.module, workspace.name);
    assertPackIncludes(files, manifest.types, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].import, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].require, workspace.name);
    assertPackIncludes(files, manifest.exports['.'].types, workspace.name);
    assertPackIncludes(files, 'dist-cjs/package.json', workspace.name);

    for (const target of Object.values(manifest.bin ?? {})) {
      assertPackIncludes(files, target, workspace.name);
    }

    if (workspace.name === '@openagentinternet/agent-browser-ui') {
      assertPackIncludes(files, 'dist/browser/app.js', workspace.name);
      assertPackIncludes(files, 'dist/browser/page.js', workspace.name);
      assertPackIncludes(files, 'dist/browser/menuModel.js', workspace.name);
      assertPackIncludes(files, 'dist/browser/indexHtml.js', workspace.name);
      assertPackIncludes(files, 'dist/browserClientScript.js', workspace.name);
      assertPackIncludes(files, 'dist/browserShell.js', workspace.name);
      assertPackIncludes(files, 'dist/browserStyles.js', workspace.name);
      assertPackIncludes(files, 'dist/browserTypes.d.ts', workspace.name);
      assertPackIncludes(files, 'dist-cjs/browserClientScript.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/browserShell.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/browserStyles.js', workspace.name);
    }

    if (workspace.name === '@openagentinternet/agent-browser-host-standalone') {
      assertPackIncludes(files, 'dist/adapter.js', workspace.name);
      assertPackIncludes(files, 'dist/server.js', workspace.name);
      assertPackIncludes(files, 'dist/metaapp/artifactCache.js', workspace.name);
      assertPackIncludes(files, 'dist/metaapp/zipArchive.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/metaapp/artifactCache.js', workspace.name);
      assertPackIncludes(files, 'dist-cjs/metaapp/zipArchive.js', workspace.name);
    }
  }
});

test('standalone package bin starts through an installed command path', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-browser-bin-'));
  let child = null;
  try {
    const tarballs = [];
    for (const workspace of WORKSPACES) {
      tarballs.push(await packTarball(workspace.name, tempDir));
    }

    await writeFile(join(tempDir, 'package.json'), '{"private":true}\n', 'utf8');
    await execFileAsync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], {
      cwd: tempDir,
    });

    const commandPath = join(tempDir, 'node_modules', '.bin', 'agent-browser-standalone');
    child = spawn(commandPath, ['--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = await waitForOutput(child, /Agent Internet Browser listening at http:\/\/127\.0\.0\.1:\d+\/browser\n/);
    assert.match(stdout, /Agent Internet Browser listening at http:\/\/127\.0\.0\.1:\d+\/browser\n/);
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
