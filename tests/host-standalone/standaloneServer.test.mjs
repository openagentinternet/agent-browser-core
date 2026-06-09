import assert from 'node:assert/strict';
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
  assert.match(html, /Fixture Bot/);

  const runtime = await json(await fetch(`${baseUrl}/api/browser/runtime`));
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, 'standalone');
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

  const methodResponse = await fetch(`${baseUrl}/api/browser/runtime`, { method: 'POST' });
  const method = await json(methodResponse);
  assert.equal(methodResponse.status, 405);
  assert.equal(method.ok, false);
  assert.equal(method.code, 'method_not_allowed');
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
