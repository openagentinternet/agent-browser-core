import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

const standalone = await import('../../packages/host-standalone/dist/index.js');

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return { baseUrl: `http://127.0.0.1:${address.port}`, port: address.port };
}

function rawGet(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    });
    req.on('error', reject);
    req.end();
  });
}

test('request guard allows same-origin, none, and header-less API requests', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { baseUrl } = await listen(server);

  const noHeaders = await fetch(`${baseUrl}/api/browser/runtime`);
  assert.equal(noHeaders.status, 200);

  const sameOrigin = await fetch(`${baseUrl}/api/browser/runtime`, {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(sameOrigin.status, 200);

  const directNavigation = await fetch(`${baseUrl}/api/browser/runtime`, {
    headers: { 'sec-fetch-site': 'none' },
  });
  assert.equal(directNavigation.status, 200);
});

test('request guard rejects cross-site and same-site API requests', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { baseUrl } = await listen(server);

  for (const site of ['cross-site', 'same-site']) {
    const response = await fetch(`${baseUrl}/api/browser/runtime`, {
      headers: { 'sec-fetch-site': site },
    });
    assert.equal(response.status, 403, `sec-fetch-site: ${site} should be rejected`);
    const body = await response.json();
    assert.equal(body.ok, false);
  }
});

test('request guard rejects non-loopback Host headers (DNS rebinding)', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = await listen(server);

  const response = await rawGet(port, '/api/browser/runtime', { host: 'evil.example.com' });
  assert.equal(response.statusCode, 403);

  const loopback = await rawGet(port, '/api/browser/runtime', { host: `127.0.0.1:${port}` });
  assert.equal(loopback.statusCode, 200);
});

test('request guard exempts preview-assets (opaque-origin MetaApp asset loads)', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { baseUrl } = await listen(server);

  const response = await fetch(`${baseUrl}/api/browser/preview-assets/unknown-preview/index.html`, {
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  // Must not be blocked by the guard; a missing preview session yields 404, not 403.
  assert.notEqual(response.status, 403);
});
