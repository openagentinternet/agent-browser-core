import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Exercises the real built CLI entry (what `npm run dev:standalone` and the
// public deployment image run), so the flag wiring into
// createStandaloneBrowserServer is covered end to end.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntry = 'packages/host-standalone/dist/main.js';
const LISTEN_LINE = /Agent Internet Browser listening at (http:\/\/127\.0\.0\.1:\d+)\/browser/;

function spawnCli(args) {
  return spawn(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// One shared stdout accumulator per child; `waitFor` first checks what has
// already been captured (the pinned-origin line can flush between two waits),
// then waits for new data. Kills the child and fails on timeout.
function captureStdout(child) {
  const capture = { stdout: '', waiters: [] };
  child.stdout.on('data', (chunk) => {
    capture.stdout += String(chunk);
    capture.waiters = capture.waiters.filter((waiter) => {
      const match = capture.stdout.match(waiter.matcher);
      if (!match) return true;
      clearTimeout(waiter.timer);
      waiter.resolve({ match, stdout: capture.stdout });
      return false;
    });
  });
  return capture;
}

function waitFor(capture, matcher, timeoutMs = 10000) {
  const existing = capture.stdout.match(matcher);
  if (existing) return Promise.resolve({ match: existing, stdout: capture.stdout });
  return new Promise((resolve, reject) => {
    const waiter = { matcher, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      capture.waiters = capture.waiters.filter((entry) => entry !== waiter);
      reject(new Error(`CLI stdout never matched ${matcher}; stdout so far:\n${capture.stdout}`));
    }, timeoutMs);
    capture.waiters.push(waiter);
  });
}

const waitForListenLine = (child, capture) => waitFor(capture, LISTEN_LINE);

async function closeCli(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

test('standalone CLI pins the MetaApp preview origin via --preview-base-url', async (t) => {
  const child = spawnCli(['--host', '127.0.0.1', '--port', '0', '--preview-base-url', 'https://preview.example']);
  t.after(() => closeCli(child));
  const capture = captureStdout(child);
  const listen = await waitForListenLine(child, capture);
  const baseUrl = listen.match[1];
  await waitFor(capture, /MetaApp preview origin pinned to https:\/\/preview\.example \(host-configured\)/);

  const health = await (await fetch(`${baseUrl}/healthz`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.metaAppPreview.storage, 'host-configured');
  assert.equal(health.metaAppPreview.previewOrigin, 'https://preview.example');
});

test('standalone CLI rejects an invalid --preview-base-url', async (t) => {
  const child = spawnCli(['--host', '127.0.0.1', '--port', '0', '--preview-base-url', 'not-a-url']);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const code = await new Promise((resolve) => child.once('exit', (exitCode) => resolve(exitCode)));
  assert.equal(code, 1);
  assert.match(stderr, /Invalid Browser standalone preview base URL/);
});

test('standalone CLI keeps the ephemeral preview origin when the flag is absent', async (t) => {
  const child = spawnCli(['--host', '127.0.0.1', '--port', '0']);
  t.after(() => closeCli(child));
  const capture = captureStdout(child);
  const listen = await waitForListenLine(child, capture);
  const baseUrl = listen.match[1];

  // The ephemeral preview origin binds right after the main server starts
  // listening, so poll /healthz like the server tests do.
  const deadline = Date.now() + 5000;
  let state;
  do {
    state = (await (await fetch(`${baseUrl}/healthz`)).json()).metaAppPreview;
    if (state.storage === 'persistent') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.equal(state.storage, 'persistent');
  assert.match(state.previewOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
});
