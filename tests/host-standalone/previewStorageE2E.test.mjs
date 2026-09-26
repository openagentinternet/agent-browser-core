// E2E regression: a MetaApp preview frame must run on its own real origin so
// its storage persists across reloads. Guards against silently regressing to
// opaque same-origin frames, where localStorage dies on reload,
// document.cookie / navigator.serviceWorker access throws, and canvas export
// is tainted.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const standalone = await import('../../packages/host-standalone/dist/index.js');

// Probe app served as a preview-metaapp://localhost directory. It reports its
// capabilities through the frame console (the parent cannot reach into a
// cross-origin frame) and self-reloads once to prove localStorage survives.
const PROBE_APP_HTML = `<!doctype html>
<html><head><title>probe</title></head>
<body>
<script>
(function () {
  function report(name, value) {
    console.log('probe:' + name + ':' + value);
  }
  try { document.cookie; report('cookie', 'ok'); } catch (error) { report('cookie', 'ERR:' + error); }
  try { navigator.serviceWorker; report('sw', 'ok'); } catch (error) { report('sw', 'ERR:' + error); }
  try {
    var canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f00';
    ctx.fillRect(0, 0, 8, 8);
    canvas.toBlob(function (blob) {
      report('canvas', blob ? 'ok' : 'ERR:null-blob');
    }, 'image/png');
  } catch (error) { report('canvas', 'ERR:' + error); }
  try {
    var value = localStorage.getItem('probe');
    if (value === 'v1') {
      report('storage', 'persisted');
    } else {
      localStorage.setItem('probe', 'v1');
      report('storage', 'written');
      location.reload();
    }
  } catch (error) { report('storage', 'ERR:' + error); }
  var link = document.createElement('a');
  link.href = 'data:text/plain,probe-download';
  link.download = 'probe.txt';
  document.body.appendChild(link);
  link.click();
}());
</script>
</body>
</html>`;

async function createPreviewAppServer(t, serverInput = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'preview-storage-e2e-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'index.html'), PROBE_APP_HTML);

  const server = standalone.createStandaloneBrowserServer(serverInput);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { dir, baseUrl };
}

async function waitForPreviewStorage(baseUrl, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  do {
    const response = await fetch(`${baseUrl}/healthz`);
    state = (await response.json()).metaAppPreview;
    if (state.storage === expected) return state;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.fail(`timed out waiting for metaAppPreview.storage === ${expected}; last: ${JSON.stringify(state)}`);
}

function probeCollector(page) {
  const reports = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('probe:')) {
      reports.push(text.slice('probe:'.length));
    }
  });
  return reports;
}

async function waitForReport(reports, prefix, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = reports.find((report) => report.startsWith(prefix));
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`timed out waiting for probe report ${prefix}.*; got: ${JSON.stringify(reports)}`);
}

async function openPreviewApp(page, baseUrl, dir) {
  await page.goto(`${baseUrl}/browser`);
  await page.fill('[data-browser-uri-input]', `preview-metaapp://localhost${dir}`);
  await page.press('[data-browser-uri-input]', 'Enter');
  return page.waitForSelector('iframe.browser-html-frame', { timeout: 15000 });
}

test('MetaApp preview frame keeps persistent storage on a real cross-origin (e2e)', async (t) => {
  const { dir, baseUrl } = await createPreviewAppServer(t);
  await waitForPreviewStorage(baseUrl, 'persistent');

  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  let page;
  try {
    page = await browser.newPage();
    const reports = probeCollector(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

    const frame = await openPreviewApp(page, baseUrl, dir);

    // The frame must be served from an origin that differs from the Browser
    // page, and the sandbox must keep that origin real (allow-same-origin)
    // while staying sandboxed otherwise.
    const sandbox = await frame.getAttribute('sandbox');
    assert.ok(sandbox.includes('allow-same-origin'), `sandbox should include allow-same-origin, got: ${sandbox}`);
    assert.ok(sandbox.includes('allow-scripts'), `sandbox should include allow-scripts, got: ${sandbox}`);
    assert.ok(sandbox.includes('allow-downloads'), `sandbox should include allow-downloads, got: ${sandbox}`);
    const src = await frame.getAttribute('src');
    const frameOrigin = new URL(src, baseUrl).origin;
    assert.notEqual(frameOrigin, new URL(baseUrl).origin, 'frame origin must differ from the Browser page origin');

    // Storage survives the app's own reload (the probe writes, reloads, then
    // reports 'persisted' only if localStorage kept the value).
    assert.equal(await waitForReport(reports, 'storage:persisted'), 'storage:persisted');

    // Opaque-origin frames throw on these property accesses; a real origin
    // must not.
    assert.equal(await waitForReport(reports, 'cookie:'), 'cookie:ok');
    assert.equal(await waitForReport(reports, 'sw:'), 'sw:ok');

    // Canvas export must not be tainted.
    assert.equal(await waitForReport(reports, 'canvas:'), 'canvas:ok');

    // allow-downloads still works from the sandboxed frame.
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'probe.txt');
    await download.cancel();
  } finally {
    if (page) await page.close();
    await browser.close();
  }
});

test('opted-out preview frames degrade to session-only storage on the page origin (e2e)', async (t) => {
  const { dir, baseUrl } = await createPreviewAppServer(t, { enablePreviewOriginServer: false });
  await waitForPreviewStorage(baseUrl, 'session-only');

  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  let page;
  try {
    page = await browser.newPage();
    const reports = probeCollector(page);

    const frame = await openPreviewApp(page, baseUrl, dir);

    // Degraded form: the preview URL stays relative to the page origin, so the
    // frame stays fully opaque — no allow-same-origin.
    const sandbox = await frame.getAttribute('sandbox');
    assert.ok(!sandbox.includes('allow-same-origin'), `sandbox must stay opaque, got: ${sandbox}`);
    const src = await frame.getAttribute('src');
    assert.equal(new URL(src, baseUrl).origin, new URL(baseUrl).origin, 'degraded frame shares the page origin');

    // The memory storage shim keeps setItem working, but the value dies on
    // reload: the probe keeps re-writing instead of reporting 'persisted'.
    assert.equal(await waitForReport(reports, 'storage:'), 'storage:written');
    await waitForReport(reports, 'storage:written', 15000);
    const persisted = reports.find((report) => report.startsWith('storage:persisted'));
    assert.equal(persisted, undefined, `degraded frames must not report persisted storage, got: ${persisted}`);
  } finally {
    if (page) await page.close();
    await browser.close();
  }
});
