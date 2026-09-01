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
  assert.equal(runtime.data.features.remix, false);
  assert.deepEqual(runtime.data.defaultActor, {
    id: 'standalone-wallet',
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  });
  const metaletIcon = await fetch(`${baseUrl}/assets/metalet-logo-v3.4c11a0b7.svg`);
  assert.equal(metaletIcon.status, 200);
  assert.match(metaletIcon.headers.get('content-type'), /image\/svg\+xml/);
  assert.equal(runtime.data.defaultUri, null);
  assert.deepEqual(runtime.data.labels, {
    actorChip: 'Wallet',
    noActorTitle: 'No Wallet',
    noActorBody: 'Standalone Browser is running with a development wallet actor.',
    walletConnect: 'Connect Bot',
    walletSelectTitle: 'Select a wallet to connect',
    walletPrimaryProviderId: 'metalet',
    walletPrimaryProviderLabel: 'Connect to Metalet',
    walletPrimaryProviderIconUrl: '/assets/metalet-logo-v3.4c11a0b7.svg',
    walletSecondaryProviderId: 'metamask',
    walletSecondaryProviderLabel: 'Connect to MetaMask',
    walletSecondaryProviderIconUrl: '/assets/metamask-fox.svg',
    walletUnsupportedProviderMessage: 'Coming soon',
    walletInstallTitle: 'Install Metalet',
    walletInstallBody: 'Please install Metalet wallet first.',
    walletInstallAction: 'Install',
    walletInstallUrl: 'https://metalet.space',
    walletUnlockError: 'Please unlock Metalet first.',
    walletInitializeError: 'Please initialize Metalet first.',
    walletAddressMissingError: 'Metalet did not return a wallet address.',
    walletFallbackName: 'Metalet Wallet',
    walletProviderId: 'metalet',
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

  for (const kind of ['service-call', 'private-chat', 'metaapp-remix']) {
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

test('standalone metafile upload route returns explicit unsupported state', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/metafile-upload`, { method: 'POST' });
  const payload = await json(response);

  assert.equal(response.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.state, 'manual_action_required');
  assert.equal(payload.code, 'metafile_upload_unavailable');
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

test('standalone actions route forwards sessionId and serves the v1.1 grant flow over HTTP', async (t) => {
  const server = standalone.createStandaloneBrowserServer({
    llmComplete: async () => ({ text: 'h2e2', model: 'dev-model', finishReason: 'stop' }),
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  const resourceUri = 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const sessionId = 'http-session-1';

  const llmResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri,
      kind: 'llm-complete',
      sessionId,
      payload: { messages: [{ role: 'user', content: 'board' }], purpose: 'llmchess-move' },
    }),
  });
  const llm = await json(llmResponse);
  assert.equal(llmResponse.status, 200);
  assert.equal(llm.ok, true);
  assert.equal(llm.data.data.text, 'h2e2');
  assert.equal(llm.data.data.model, 'dev-model');

  const phaseOneResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri,
      kind: 'permissions-request',
      sessionId,
      payload: {
        grants: [{ method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' }],
        reason: 'chess moves',
      },
    }),
  });
  const phaseOne = await json(phaseOneResponse);
  assert.equal(phaseOneResponse.status, 200);
  assert.equal(phaseOne.ok, false);
  assert.equal(phaseOne.state, 'manual_action_required');
  assert.equal(phaseOne.data.confirmRequest.resourceUri, resourceUri);

  const phaseTwoResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri: phaseOne.data.confirmRequest.resourceUri,
      kind: 'permissions-request',
      sessionId,
      payload: phaseOne.data.confirmRequest.payload,
    }),
  });
  const phaseTwo = await json(phaseTwoResponse);
  assert.equal(phaseTwo.ok, true);
  assert.equal(phaseTwo.data.data.granted.length, 1);

  const writeResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri,
      kind: 'metaid-pin-write',
      sessionId,
      payload: {
        operation: 'create',
        path: '/protocols/simplegroupchat',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"app":"llmchess"}' },
      },
    }),
  });
  const write = await json(writeResponse);
  // The grant skipped the two-phase confirmation envelope; the standalone host
  // still cannot sign, so the write fails on the broadcast path.
  assert.equal(write.state, 'failed');
  assert.equal(write.code, 'pin_write_failed');
  assert.notEqual(write.state, 'manual_action_required');

  // A fresh session (page refresh) has no grants: two-phase flow returns.
  const freshWriteResponse = await fetch(`${baseUrl}/api/browser/actions?actorId=standalone-wallet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      resourceUri,
      kind: 'metaid-pin-write',
      sessionId: 'http-session-fresh',
      payload: {
        operation: 'create',
        path: '/protocols/simplegroupchat',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"app":"llmchess"}' },
      },
    }),
  });
  const freshWrite = await json(freshWriteResponse);
  assert.equal(freshWrite.state, 'manual_action_required');
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

test('memory standalone Browser host accepts connected wallet actor aliases', async () => {
  const host = standalone.createMemoryStandaloneBrowserHost();
  const actorId = 'wallet:12ghVWG1yAgNjzXj4mr3qK9DgyornMUikZ';
  const pinId = '6d3cc874b5f09b0eed5efe283530fbf22b9e27769a34ceadfd150cdb9e1dc753i0';

  const runtime = await host.getRuntime({ actorId });
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.features.remix, false);

  const resolved = await host.resolveResource({
    actorId,
    uri: `metaapp://${pinId}`,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.normalizedUri, `metaapp://${pinId}`);
});

test('standalone Browser serves a preview-metaapp localhost directory over HTTP end-to-end', async (t) => {
  const { mkdtemp: mkdtempAsync, writeFile } = await import('node:fs/promises');
  const { tmpdir: tmpdirAsync } = await import('node:os');
  const nodePath = await import('node:path');
  const dir = await mkdtempAsync(nodePath.join(tmpdirAsync(), 'preview-e2e-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true })));
  const marker = 'preview-e2e-marker-9f3c2a';
  await writeFile(nodePath.join(dir, 'index.html'), `<h1>${marker}</h1>`);

  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);

  // Resolve via the standalone HTTP resolve route: the real /api/browser/resolve?uri=... GET.
  const uri = `preview-metaapp://localhost${dir}`;
  const resolveResponse = await fetch(`${baseUrl}/api/browser/resolve?uri=${encodeURIComponent(uri)}`);
  const resolved = await resolveResponse.json();
  assert.equal(resolveResponse.status, 200, `resolve status for ${uri}`);
  assert.equal(resolved.ok, true, `resolve ok for ${uri}`);

  const previewUrl = resolved.data?.renderer?.url;
  assert.ok(previewUrl, 'expected a renderer url');
  // Preview content is served from a dedicated loopback origin on its own
  // port, deliberately different from the Browser page origin: the sandboxed
  // app frame then keeps a real cross-origin (canvas export + downloads work)
  // without ever being able to script the Browser page.
  assert.match(previewUrl, /^http:\/\/127\.0\.0\.1:\d+\/api\/browser\/preview-assets\//, 'renderer url should target the dedicated preview origin');
  assert.ok(!previewUrl.startsWith(baseUrl), 'preview origin must differ from the Browser page origin');

  // End-to-end: HTTP-GET the served preview asset from the preview origin.
  const asset = await fetch(previewUrl);
  assert.equal(asset.status, 200, `asset status for ${previewUrl}`);
  assert.match(asset.headers.get('content-type'), /text\/html/);
  const body = await asset.text();
  assert.match(body, new RegExp(marker));
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
