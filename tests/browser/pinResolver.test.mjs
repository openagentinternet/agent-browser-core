import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  resolvePinUriToResource,
} = require('../../packages/core/dist/browser/pinResolver.js');

const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const resolvedPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const legacyTxid = 'a'.repeat(64);
const genesisTxid = 'b'.repeat(64);

function manPin(overrides = {}) {
  return {
    id: resolvedPinId,
    pinId: resolvedPinId,
    rootPinId: pinId,
    path: '/protocols/simplebuzz',
    operation: 'create',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json',
    content: JSON.stringify({
      title: 'Pin Title',
      content: 'Full generic pin text',
      images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
    }),
    txid: legacyTxid,
    genesisTransaction: genesisTxid,
    chain: 'mvc',
    ownerAddress: '1FixtureAddress',
    ownerGlobalMetaId: 'idq1publisher',
    timestamp: 1780760000,
    ...overrides,
  };
}

test('resolvePinUriToResource resolves latest effective pin through MAN', async () => {
  const calls = [];
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { pin: manPin() } }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${pinId}`]);
  assert.equal(result.data.normalizedUri, `pin://${pinId}`);
  assert.equal(result.data.resourceType, 'pin');
  assert.equal(result.data.renderer.type, 'pin-inspector');
  assert.equal(result.data.renderer.data.rendererId, 'generic.pin-inspector');
  assert.equal(result.data.renderer.data.version.requestedPinId, pinId);
  assert.equal(result.data.renderer.data.version.resolvedPinId, resolvedPinId);
  assert.equal(result.data.renderer.data.version.versionSelector, 'latest');
  assert.equal(result.data.renderer.data.pin.path, '/protocols/simplebuzz');
  assert.equal(result.data.renderer.data.pin.txid, genesisTxid);
  assert.equal(result.data.renderer.data.pin.genesisTransaction, genesisTxid);
  assert.equal(result.data.proof.pinId, resolvedPinId);
  assert.equal(result.data.proof.txid, genesisTxid);
});

test('resolvePinUriToResource forwards history index to MAN and preserves payload objects', async () => {
  const payload = {
    name: 'History Payload',
    description: 'Older version',
  };
  const calls = [];
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}?version=0`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: manPin({
            id: pinId,
            pinId,
            content: undefined,
            payload,
            contentSummary: JSON.stringify({ summary: 'Older summary' }),
          }),
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${pinId}?version=0`]);
  assert.equal(result.data.normalizedUri, `pin://${pinId}?version=0`);
  assert.equal(result.data.renderer.data.version.versionSelector, 'history-index');
  assert.equal(result.data.renderer.data.version.historyIndex, 0);
  assert.deepEqual(result.data.renderer.data.rawPayload, payload);
  assert.deepEqual(result.data.renderer.data.payload, payload);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.data.renderer.data, 'contentSummary'),
    false,
  );
});

test('resolvePinUriToResource falls back to payload when MAN content is null', async () => {
  const payload = {
    kind: 'payload-object',
    content: 'Use payload when content is null',
  };
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          pin: manPin({
            content: null,
            payload,
          }),
        },
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.rawPayload, payload);
  assert.deepEqual(result.data.renderer.data.payload, payload);
});

test('resolvePinUriToResource parses string JSON content without inventing summary fields', async () => {
  const payload = {
    title: 'Parsed from content',
    nested: { kind: 'json' },
  };
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          pin: manPin({
            content: JSON.stringify(payload),
            contentSummary: JSON.stringify({ summary: 'legacy summary' }),
          }),
        },
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.rawPayload, JSON.stringify(payload));
  assert.deepEqual(result.data.renderer.data.payload, payload);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.data.renderer.data, 'contentSummary'),
    false,
  );
});

test('resolvePinUriToResource decodes base64 contentBody before parsing text payload', async () => {
  const payload = {
    title: 'Base64 encoded body',
    content: 'Visible body text',
  };
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          pin: manPin({
            content: '',
            contentBody: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
          }),
        },
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.rawPayload, JSON.stringify(payload));
  assert.deepEqual(result.data.renderer.data.payload, payload);
  assert.equal(result.data.title, 'Base64 encoded body');
});

test('resolvePinUriToResource prefers contentSummary when MAN content is empty', async () => {
  const payload = {
    serviceName: 'weibo-hot-trend-service',
    displayName: '微博热搜',
    endpoint: 'simplemsg',
    paymentAddress: '1EX5NN6npyCp3X6Sv4Yahv6DrBNKRtq4Gw',
  };
  const result = await resolvePinUriToResource({
    uri: `pin://${pinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          pin: manPin({
            content: '',
            contentBody: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
            contentSummary: JSON.stringify(payload),
          }),
        },
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.renderer.data.rawPayload, JSON.stringify(payload));
  assert.deepEqual(result.data.renderer.data.payload, payload);
});
