import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const standalone = await import('../../packages/host-standalone/dist/index.js');
const standaloneCli = await import('../../packages/host-standalone/dist/main.js');

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

  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const deepLinkResponse = await fetch(`${baseUrl}/browser/metafile/${pinId}.pdf`);
  const deepLinkHtml = await deepLinkResponse.text();
  assert.equal(deepLinkResponse.status, 200);
  assert.match(deepLinkHtml, /Agent Internet Browser/);

  const runtime = await json(await fetch(`${baseUrl}/api/browser/runtime`));
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, 'standalone');
  assert.equal(runtime.data.features.walletLogin, true);
  assert.deepEqual(runtime.data.defaultActor, {
    id: 'standalone-wallet',
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  });
  assert.equal(runtime.data.defaultUri, null);
  assert.deepEqual(runtime.data.labels, {
    actorChip: 'Wallet',
    noActorTitle: 'No Wallet',
    noActorBody: 'Standalone Browser is running with a development wallet actor.',
  });
});

test('standalone Browser server exposes runtime resolve settings cache and action routes', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'abc-host-standalone-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const server = standalone.createStandaloneBrowserServer({
    env: {
      AGENT_BROWSER_CACHE_DIR: cacheDir,
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const runtime = await json(await fetch(`${baseUrl}/api/browser/runtime`));
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, 'standalone');
  assert.equal(runtime.data.defaultActor.kind, 'wallet');

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

  const missingActorSettings = await json(await fetch(`${baseUrl}/api/browser/settings?actorId=missing`));
  assert.equal(missingActorSettings.ok, true);
  assert.equal(missingActorSettings.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(missingActorSettings.data.effectiveBrowser.renderCustomBotPages, false);

  const missingActorUpdated = await json(await fetch(`${baseUrl}/api/browser/settings?actorId=missing`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      browser: {
        botHomepageTemplateId: 'document',
        renderCustomBotPages: true,
      },
    }),
  }));
  assert.equal(missingActorUpdated.ok, true);
  assert.equal(missingActorUpdated.data.effectiveBrowser.botHomepageTemplateId, 'document');
  assert.equal(missingActorUpdated.data.effectiveBrowser.renderCustomBotPages, true);

  const cache = await json(await fetch(`${baseUrl}/api/browser/cache`));
  assert.equal(cache.ok, true);
  assert.equal(cache.data.cacheRoot, cacheDir);

  const cleared = await json(await fetch(`${baseUrl}/api/browser/cache`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'all' }),
  }));
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.clearedArtifacts, 0);

  const loginResponse = await fetch(`${baseUrl}/api/browser/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'login', resourceUri: 'metaid://idq1fixturebot' }),
  });
  const login = await json(loginResponse);
  assert.equal(loginResponse.status, 200);
  assert.equal(login.ok, false);
  assert.equal(login.state, 'manual_action_required');
  assert.equal(login.code, 'wallet_login_required');
  assert.equal(login.message, 'Connect a wallet in the standalone host.');
  assert.equal(login.action.label, 'Connect wallet');
  assert.equal(login.action.route, '/browser/login');

  for (const kind of ['service-call', 'private-chat']) {
    const unsupportedResponse = await fetch(`${baseUrl}/api/browser/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, resourceUri: 'metaid://idq1fixturebot' }),
    });
    const unsupported = await json(unsupportedResponse);
    assert.equal(unsupportedResponse.status, 400);
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.state, 'failed');
    assert.equal(unsupported.code, 'browser_action_not_supported');
    assert.equal(unsupported.message, `Standalone Browser does not support trusted action: ${kind}`);
  }
});

test('standalone returns manual action for open-conversation', async () => {
  const adapter = standalone.createStandaloneBrowserHostAdapter();
  const result = await adapter.runTrustedAction({
    resourceUri: 'map://simplemsg/conversation?peer=idq1peer',
    kind: 'open-conversation',
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      peerGlobalMetaId: 'idq1peer',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'manual_action_required');
  assert.equal(result.code, 'browser_identity_required');
});

test('standalone Browser server maps bad client requests to explicit failures', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const badJsonResponse = await fetch(`${baseUrl}/api/browser/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  const badJson = await json(badJsonResponse);
  assert.equal(badJsonResponse.status, 400);
  assert.equal(badJson.ok, false);
  assert.equal(badJson.code, 'invalid_argument');

  const badScopeResponse = await fetch(`${baseUrl}/api/browser/cache`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'missing' }),
  });
  const badScope = await json(badScopeResponse);
  assert.equal(badScopeResponse.status, 400);
  assert.equal(badScope.ok, false);
  assert.equal(badScope.code, 'invalid_argument');

  const badActorResponse = await fetch(`${baseUrl}/api/browser/runtime?actorId=missing`);
  const badActor = await json(badActorResponse);
  assert.equal(badActorResponse.status, 404);
  assert.equal(badActor.ok, false);
  assert.equal(badActor.code, 'actor_not_found');

  const badCacheActorResponse = await fetch(`${baseUrl}/api/browser/cache?actorId=missing`);
  const badCacheActor = await json(badCacheActorResponse);
  assert.equal(badCacheActorResponse.status, 404);
  assert.equal(badCacheActor.ok, false);
  assert.equal(badCacheActor.code, 'actor_not_found');

  const methodResponse = await fetch(`${baseUrl}/api/browser/runtime`, { method: 'POST' });
  const method = await json(methodResponse);
  assert.equal(methodResponse.status, 405);
  assert.equal(method.ok, false);
  assert.equal(method.code, 'method_not_allowed');
});

test('memory standalone Browser host keeps settings global while cache remains actor-scoped', async () => {
  const host = standalone.createMemoryStandaloneBrowserHost();

  const missingActorSettings = await host.getSettings({ actorId: 'missing' });
  assert.equal(missingActorSettings.ok, true);
  assert.equal(missingActorSettings.data.effectiveBrowser.renderCustomBotPages, true);
  assert.equal(missingActorSettings.data.defaults.renderCustomBotPages, true);

  const updated = await host.updateSettings({
    actorId: 'missing',
    browser: {
      botHomepageTemplateId: 'compact-list',
      renderCustomBotPages: false,
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(updated.data.effectiveBrowser.renderCustomBotPages, false);

  const invalid = await host.updateSettings({
    actorId: 'missing',
    browser: {
      renderCustomBotPages: 'false',
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'invalid_argument');
  assert.match(invalid.message, /browser\.renderCustomBotPages must be a boolean/);

  const missingActorRuntime = await host.getRuntime({ actorId: 'missing' });
  assert.equal(missingActorRuntime.ok, false);
  assert.equal(missingActorRuntime.code, 'actor_not_found');

  const missingActorCache = await host.getCache({ actorId: 'missing' });
  assert.equal(missingActorCache.ok, false);
  assert.equal(missingActorCache.code, 'actor_not_found');
});

test('standalone CLI rejects listen errors', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);
  const port = Number(new URL(baseUrl).port);

  await assert.rejects(
    () => standaloneCli.main(['--host', '127.0.0.1', '--port', String(port)], {}),
    /EADDRINUSE/,
  );
});
