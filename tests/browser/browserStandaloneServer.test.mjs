import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os, { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { makeMetaAppZipArchive } from '../fixtures/browser/metaappZipFixture.mjs';

const require = createRequire(import.meta.url);
const { createStandaloneBrowserServer } = require('../../packages/host-standalone/dist/server.js');
const { createStandaloneBrowserHostAdapter } = require('../../packages/host-standalone/dist/adapter.js');

const METAAPP_PIN_ID = '8544d8a15126296abe36a0bad740a4f293580575b5b00d345029bf99b74c78eci0';

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function readJson(response) {
  return response.json();
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

test('standalone Browser server serves Browser pages and shared CSS', async (t) => {
  const server = createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  for (const pathname of ['/', '/browser', '/ui/browser', '/browser/metaid/idq1fixturebot']) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Agent Internet Browser/);
    assert.match(html, /data-browser-shell/);
    assert.match(html, /\/api\/browser\/runtime/);
  }

  const cssResponse = await fetch(`${baseUrl}/ui/shared.css`);
  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get('content-type'), /text\/css/);
  assert.match(await cssResponse.text(), /MetaBot UI/);
});

test('standalone Browser server exposes runtime, settings, cache, and action routes', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abc-standalone-runtime-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const server = createStandaloneBrowserServer({
    env: {
      AGENT_BROWSER_CACHE_DIR: cacheDir,
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const runtime = await readJson(await fetch(`${baseUrl}/api/browser/runtime`));
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, 'standalone');
  assert.deepEqual(runtime.data.defaultActor, {
    id: 'standalone-wallet',
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  });
  assert.equal(runtime.data.defaultUri, 'metaid://idq1fixturebot');
  assert.deepEqual(runtime.data.labels, {
    actorChip: 'Wallet',
    noActorTitle: 'No Wallet',
    noActorBody: 'Standalone Browser is running with a development wallet actor.',
  });

  const settings = await readJson(await fetch(`${baseUrl}/api/browser/settings`));
  assert.equal(settings.ok, true);
  assert.equal(settings.data.effectiveBrowser.localMode, false);

  const updated = await readJson(await fetch(`${baseUrl}/api/browser/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ browser: { botHomepageTemplateId: 'compact-list', renderCustomBotPages: false } }),
  }));
  assert.equal(updated.ok, true);
  assert.equal(updated.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(updated.data.effectiveBrowser.renderCustomBotPages, false);

  const missingActorSettings = await readJson(await fetch(`${baseUrl}/api/browser/settings?actorId=missing`));
  assert.equal(missingActorSettings.ok, true);
  assert.equal(missingActorSettings.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(missingActorSettings.data.effectiveBrowser.renderCustomBotPages, false);

  const cache = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cache.ok, true);
  assert.equal(cache.data.cacheRoot, cacheDir);

  const cleared = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all' }),
  }));
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.clearedArtifacts, 0);

  const actionResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'private-chat',
      resourceUri: 'metaid://idq1fixturebot',
      payload: { to: 'idq1fixturebot', content: 'hello' },
    }),
  });
  const action = await readJson(actionResponse);
  assert.equal(actionResponse.status, 400);
  assert.equal(action.ok, false);
  assert.equal(action.code, 'browser_action_not_supported');
  assert.equal(action.message, 'Standalone Browser does not support trusted action: private-chat');

  const loginResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'login',
      resourceUri: 'metaid://idq1fixturebot',
    }),
  });
  const login = await readJson(loginResponse);
  assert.equal(loginResponse.status, 200);
  assert.equal(login.ok, false);
  assert.equal(login.state, 'manual_action_required');
  assert.equal(login.code, 'wallet_login_required');
  assert.equal(login.action.label, 'Connect wallet');
});

test('standalone Browser server falls back to the fixture bot homepage when network resolution fails', async (t) => {
  const adapter = createStandaloneBrowserHostAdapter({
    fetch: async () => {
      throw new Error('network unavailable');
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaid%3A%2F%2Fidq1fixturebot`);
  const payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.resourceType, 'bot');
  assert.equal(payload.data.title, 'Fixture Bot');
  assert.equal(payload.data.renderer.type, 'bot-page');
});

test('standalone Browser server resolves non-fixture metaid resources through adapter fetch', async (t) => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  fixture.identity.globalMetaId = 'idq1fetchedbot';
  fixture.identity.display = 'idq1fetched...bot';
  fixture.profile.name = 'Fetched Bot';
  const fetchUrls = [];
  const adapter = createStandaloneBrowserHostAdapter({
    fetch: async (url) => {
      fetchUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: '', data: fixture }),
      };
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaid%3A%2F%2Fidq1fetchedbot`);
  const payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.resourceType, 'bot');
  assert.equal(payload.data.title, 'Fetched Bot');
  assert.equal(payload.data.renderer.type, 'bot-page');
  assert.equal(fetchUrls.length, 1);
  assert.match(fetchUrls[0], /idq1fetchedbot/);
});

test('standalone Browser server downloads ZIP MetaApp content from the default file-indexer endpoint', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abc-standalone-default-metafile-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const pinId = '82'.repeat(32) + 'i0';
  const contentPinId = '91'.repeat(32) + 'i0';
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>Default ZIP Endpoint</title>',
  });
  const fetchUrls = [];

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      AGENT_BROWSER_CACHE_DIR: cacheDir,
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
    },
    fetch: async (url) => {
      const textUrl = String(url);
      fetchUrls.push(textUrl);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1DefaultEndpointPublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'Default ZIP Endpoint MetaApp',
              appName: 'default-zip-endpoint-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: `metafile://${contentPinId}.zip`,
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${contentPinId}`) {
        return new Response(archive, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      return new Response('not found', { status: 404 });
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const resolved = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.renderer.type, 'html-iframe');
  assert.equal(
    fetchUrls[1],
    `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${contentPinId}`,
  );
});

test('standalone Browser server rejects untrusted file MetaApp content references', async (t) => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'abc-standalone-metaapp-project-'));
  t.after(() => rm(projectDir, { recursive: true, force: true }));
  await writeFile(path.join(projectDir, 'secret.txt'), 'LOCAL_SECRET_SHOULD_NOT_LEAK');
  const projectUrl = pathToFileURL(projectDir).href;
  const adapter = createStandaloneBrowserHostAdapter({
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://manapi.metaid.io/pin/${METAAPP_PIN_ID}`) {
        return jsonResponse({
          data: {
            id: METAAPP_PIN_ID,
            path: '/protocols/metaapp',
            address: '1StandalonePublisher',
            timestamp: 1780833765,
            contentSummary: JSON.stringify({
              title: 'Standalone MetaApp',
              appName: 'standalone-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: projectUrl,
              contentType: 'text/plain',
              indexFile: 'secret.txt',
            }),
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const resolveResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${METAAPP_PIN_ID}`);
  const resolved = await readJson(resolveResponse);
  assert.equal(resolveResponse.status, 400);
  assert.equal(resolved.ok, false);
  assert.match(resolved.message, /only supports ZIP content references/i);
  assert.doesNotMatch(JSON.stringify(resolved), /LOCAL_SECRET_SHOULD_NOT_LEAK/);

  const previewResponse = await fetch(`${baseUrl}/api/browser/preview-assets/standalone-probe/secret.txt`);
  const preview = await readJson(previewResponse);
  assert.equal(previewResponse.status, 404);
  assert.equal(preview.ok, false);
  assert.doesNotMatch(JSON.stringify(preview), /LOCAL_SECRET_SHOULD_NOT_LEAK/);
});

test('standalone Browser server downloads ZIP MetaApp content into artifact cache and serves preview assets', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abc-standalone-zip-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const pinId = 'a9'.repeat(32) + 'i0';
  const contentPinId = 'b8'.repeat(32) + 'i0';
  const wrongPinId = 'c7'.repeat(32) + 'i0';
  const archive = makeMetaAppZipArchive({
    'index.html': '<!doctype html><title>ZIP Preview</title><script src="./assets/app.js"></script>',
    'assets/app.js': 'window.__abcZipPreviewLoaded = true;',
  });
  let zipFetchCount = 0;

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      AGENT_BROWSER_CACHE_DIR: cacheDir,
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
      METABOT_BROWSER_METAFILE_CONTENT_BASE_URL: 'https://content.example.test/files',
    },
    now: () => 1781450015615,
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1ZipPublisher',
            ownerGlobalMetaId: 'idq1zippublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'ZIP MetaApp',
              appName: 'zip-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: `metafile://${contentPinId}.zip`,
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === `https://content.example.test/files/${contentPinId}`) {
        zipFetchCount += 1;
        return new Response(archive, { status: 200, headers: { 'content-type': 'application/zip' } });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const firstResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const first = await readJson(firstResponse);
  assert.equal(firstResponse.status, 200);
  assert.equal(first.ok, true);
  assert.equal(first.data.renderer.type, 'html-iframe');
  assert.equal(first.data.renderer.contentType, 'text/html');
  assert.match(first.data.renderer.url, /^\/api\/browser\/preview-assets\/standalone-/);
  assert.equal(first.data.renderer.data.record.contentType, 'text/html');
  assert.equal(first.data.renderer.data.record.codeType, 'application/zip');

  const htmlResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  assert.equal(htmlResponse.headers.get('access-control-allow-origin'), '*');
  assert.match(await htmlResponse.text(), /ZIP Preview/);

  const scriptUrl = first.data.renderer.url.replace(/index\.html$/, 'assets/app.js');
  const scriptResponse = await fetch(`${baseUrl}${scriptUrl}`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('content-type'), /text\/javascript/);
  assert.equal(scriptResponse.headers.get('access-control-allow-origin'), '*');
  assert.match(await scriptResponse.text(), /__abcZipPreviewLoaded/);

  const cache = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cache.ok, true);
  assert.equal(cache.data.cacheRoot, cacheDir);
  assert.equal(cache.data.artifactCount, 1);
  assert.equal(cache.data.pinRecordCount, 1);
  assert.equal(cache.data.activePreviewSessionCount, 1);
  assert.equal(cache.data.totalBytes > 0, true);

  const clearWrongPinResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'pin', pinId: wrongPinId }),
  });
  const clearedWrongPin = await readJson(clearWrongPinResponse);
  assert.equal(clearWrongPinResponse.status, 200);
  assert.equal(clearedWrongPin.ok, true);
  assert.equal(clearedWrongPin.data.clearedArtifacts, 0);
  assert.equal(clearedWrongPin.data.clearedPinRecords, 0);

  const cacheAfterWrongPinClear = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cacheAfterWrongPinClear.ok, true);
  assert.equal(cacheAfterWrongPinClear.data.artifactCount, 1);
  assert.equal(cacheAfterWrongPinClear.data.pinRecordCount, 1);

  const htmlAfterWrongPinClearResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  assert.equal(htmlAfterWrongPinClearResponse.status, 200);
  assert.match(await htmlAfterWrongPinClearResponse.text(), /ZIP Preview/);

  const clearPinResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'pin', pinId }),
  });
  const clearedPin = await readJson(clearPinResponse);
  assert.equal(clearPinResponse.status, 200);
  assert.equal(clearedPin.ok, true);
  assert.equal(clearedPin.data.clearedArtifacts, 0);
  assert.equal(clearedPin.data.clearedPinRecords, 1);

  const cacheAfterPinClear = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cacheAfterPinClear.ok, true);
  assert.equal(cacheAfterPinClear.data.artifactCount, 1);
  assert.equal(cacheAfterPinClear.data.pinRecordCount, 0);
  assert.equal(cacheAfterPinClear.data.activePreviewSessionCount, 1);

  const htmlAfterPinClearResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  assert.equal(htmlAfterPinClearResponse.status, 200);
  assert.match(htmlAfterPinClearResponse.headers.get('content-type'), /text\/html/);
  assert.match(await htmlAfterPinClearResponse.text(), /ZIP Preview/);

  const secondResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const second = await readJson(secondResponse);
  assert.equal(secondResponse.status, 200);
  assert.equal(second.ok, true);
  assert.equal(second.data.renderer.type, 'html-iframe');
  assert.equal(zipFetchCount, 1);

  const clearArtifactsResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'artifact' }),
  });
  const clearedArtifactsOnly = await readJson(clearArtifactsResponse);
  assert.equal(clearArtifactsResponse.status, 200);
  assert.equal(clearedArtifactsOnly.ok, true);
  assert.equal(clearedArtifactsOnly.data.clearedArtifacts, 1);
  assert.equal(clearedArtifactsOnly.data.clearedPinRecords, 0);
  assert.equal(clearedArtifactsOnly.data.clearedPreviewSessions, 2);

  const cacheAfterArtifactClear = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cacheAfterArtifactClear.ok, true);
  assert.equal(cacheAfterArtifactClear.data.artifactCount, 0);
  assert.equal(cacheAfterArtifactClear.data.pinRecordCount, 1);
  assert.equal(cacheAfterArtifactClear.data.activePreviewSessionCount, 0);

  const afterArtifactClearResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  const afterArtifactClear = await readJson(afterArtifactClearResponse);
  assert.equal(afterArtifactClearResponse.status, 404);
  assert.equal(afterArtifactClear.ok, false);
  assert.equal(afterArtifactClear.code, 'browser_resource_not_found');

  const thirdResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const third = await readJson(thirdResponse);
  assert.equal(thirdResponse.status, 200);
  assert.equal(third.ok, true);
  assert.equal(third.data.renderer.type, 'html-iframe');
  assert.equal(zipFetchCount, 2);

  const cacheBeforeKeyedClear = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cacheBeforeKeyedClear.ok, true);
  assert.equal(cacheBeforeKeyedClear.data.artifactCount, 1);
  assert.equal(cacheBeforeKeyedClear.data.pinRecordCount, 1);
  assert.equal(cacheBeforeKeyedClear.data.activePreviewSessionCount, 1);
  const cacheKey = cacheBeforeKeyedClear.data.artifacts[0].cacheKey;

  const keyedClearResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'artifact', cacheKey: cacheKey.toUpperCase() }),
  });
  const keyedClear = await readJson(keyedClearResponse);
  assert.equal(keyedClearResponse.status, 200);
  assert.equal(keyedClear.ok, true);
  assert.equal(keyedClear.data.clearedArtifacts, 1);
  assert.equal(keyedClear.data.clearedPinRecords, 1);
  assert.equal(keyedClear.data.clearedPreviewSessions, 1);

  const cacheAfterKeyedClear = await readJson(await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`));
  assert.equal(cacheAfterKeyedClear.ok, true);
  assert.equal(cacheAfterKeyedClear.data.artifactCount, 0);
  assert.equal(cacheAfterKeyedClear.data.pinRecordCount, 0);
  assert.equal(cacheAfterKeyedClear.data.activePreviewSessionCount, 0);

  const fourthResponse = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const fourth = await readJson(fourthResponse);
  assert.equal(fourthResponse.status, 200);
  assert.equal(fourth.ok, true);
  assert.equal(fourth.data.renderer.type, 'html-iframe');
  assert.equal(zipFetchCount, 3);

  const clearResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=standalone-wallet`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all' }),
  });
  const cleared = await readJson(clearResponse);
  assert.equal(clearResponse.status, 200);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.clearedArtifacts, 1);
  assert.equal(cleared.data.clearedPinRecords, 1);
  assert.equal(cleared.data.clearedPreviewSessions, 1);

  const afterClearResponse = await fetch(`${baseUrl}${first.data.renderer.url}`);
  const afterClear = await readJson(afterClearResponse);
  assert.equal(afterClearResponse.status, 404);
  assert.equal(afterClear.ok, false);
  assert.equal(afterClear.code, 'browser_resource_not_found');
});

test('standalone Browser server rejects arbitrary HTTPS ZIP MetaApp content references', async (t) => {
  const pinId = 'd6'.repeat(32) + 'i0';
  let evilZipFetchCount = 0;

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
      METABOT_BROWSER_METAFILE_CONTENT_BASE_URL: 'https://content.example.test/files',
    },
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1HttpsPublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'HTTPS ZIP MetaApp',
              appName: 'https-zip-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: 'https://evil.example/app.zip',
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === 'https://evil.example/app.zip') {
        evilZipFetchCount += 1;
        throw new Error('Arbitrary HTTPS ZIP content should not be fetched.');
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const resolved = await readJson(response);
  assert.equal(response.status, 400);
  assert.equal(resolved.ok, false);
  assert.match(resolved.message, /not downloadable|unsupported ZIP reference/i);
  assert.equal(evilZipFetchCount, 0);
});

test('standalone Browser server rejects ZIP MetaApp downloads above the compressed archive limit', async (t) => {
  const pinId = 'e5'.repeat(32) + 'i0';
  const contentPinId = 'f4'.repeat(32) + 'i0';
  let zipFetchCount = 0;

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
      METABOT_BROWSER_METAFILE_CONTENT_BASE_URL: 'https://content.example.test/files',
    },
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1LargeZipPublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'Large ZIP MetaApp',
              appName: 'large-zip-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: `metafile://${contentPinId}.zip`,
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === `https://content.example.test/files/${contentPinId}`) {
        zipFetchCount += 1;
        return new Response(Buffer.from('PK'), {
          status: 200,
          headers: {
            'content-length': '999999999',
            'content-type': 'application/zip',
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const resolved = await readJson(response);
  assert.equal(response.status, 400);
  assert.equal(resolved.ok, false);
  assert.match(resolved.message, /too large|exceeds/i);
  assert.equal(resolved.data?.renderer?.url, undefined);
  assert.equal(zipFetchCount, 1);
});

test('standalone Browser server rejects streaming ZIP MetaApp downloads above the compressed archive limit without content-length', async (t) => {
  const pinId = 'a4'.repeat(32) + 'i0';
  const contentPinId = 'b3'.repeat(32) + 'i0';
  let zipFetchCount = 0;

  const adapter = createStandaloneBrowserHostAdapter({
    env: {
      METABOT_BROWSER_MANAPI_BASE_URL: 'https://man.example.test',
      METABOT_BROWSER_METAFILE_CONTENT_BASE_URL: 'https://content.example.test/files',
    },
    maxZipArchiveBytes: 4,
    fetch: async (url) => {
      const textUrl = String(url);
      if (textUrl === `https://man.example.test/pin/${pinId}`) {
        return new Response(JSON.stringify({
          data: {
            id: pinId,
            path: '/protocols/metaapp',
            address: '1StreamingZipPublisher',
            timestamp: 1781450015,
            contentSummary: JSON.stringify({
              title: 'Streaming ZIP MetaApp',
              appName: 'streaming-zip-metaapp',
              version: '1.0.0',
              runtime: 'browser',
              content: `metafile://${contentPinId}.zip`,
              contentType: 'application/zip',
              codeType: 'application/zip',
              indexFile: 'index.html',
            }),
          },
        }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
      }
      if (textUrl === `https://content.example.test/files/${contentPinId}`) {
        zipFetchCount += 1;
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.enqueue(new Uint8Array([4, 5, 6]));
            controller.close();
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/zip' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
    },
  });
  const server = createStandaloneBrowserServer({ adapter });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/resolve?actorId=standalone-wallet&uri=metaapp%3A%2F%2F${pinId}`);
  const resolved = await readJson(response);
  assert.equal(response.status, 400);
  assert.equal(resolved.ok, false);
  assert.match(resolved.message, /exceeds the download size limit/i);
  assert.equal(resolved.data?.renderer?.url, undefined);
  assert.equal(zipFetchCount, 1);
});
