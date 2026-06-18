import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  resolveMapUriToResource,
} = require('../../packages/core/dist/browser/mapProtocolResolver.js');

const buzzPinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const resolvedBuzzPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

function manPin(overrides = {}) {
  return {
    id: resolvedBuzzPinId,
    pinId: resolvedBuzzPinId,
    rootPinId: buzzPinId,
    path: '/protocols/simplebuzz',
    operation: 'create',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json',
    content: JSON.stringify({
      content: 'Full buzz text',
      images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
    }),
    txid: resolvedBuzzPinId.slice(0, 64),
    chain: 'mvc',
    ownerAddress: '1FixtureAddress',
    ownerGlobalMetaId: 'idq1publisher',
    timestamp: 1780760000,
    ...overrides,
  };
}

test('resolveMapUriToResource resolves latest protocol pin through MAN', async () => {
  const calls = [];
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { pin: manPin() } }),
      };
    },
    now: () => 1780760000000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${buzzPinId}`]);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${buzzPinId}`);
  assert.equal(result.data.resourceType, 'protocol');
  assert.equal(result.data.renderer.type, 'protocol-pin');
  assert.equal(result.data.renderer.data.rendererId, 'simplebuzz.detail');
  assert.equal(result.data.renderer.data.protocolPath, '/protocols/simplebuzz');
  assert.equal(result.data.renderer.data.version.requestedPinId, buzzPinId);
  assert.equal(result.data.renderer.data.version.resolvedPinId, resolvedBuzzPinId);
  assert.equal(result.data.renderer.data.version.versionSelector, 'latest');
  assert.equal(result.data.proof.pinId, resolvedBuzzPinId);
  assert.equal(result.data.proof.protocolPath, '/protocols/simplebuzz');
});

test('resolveMapUriToResource forwards canonical history index to MAN', async () => {
  const calls = [];
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}[0]`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: manPin({ id: buzzPinId, pinId: buzzPinId }) }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`https://man.example.test/pin/${buzzPinId}?version=0`]);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${buzzPinId}?version=0`);
  assert.equal(result.data.renderer.data.version.versionSelector, 'history-index');
  assert.equal(result.data.renderer.data.version.historyIndex, 0);
});

test('resolveMapUriToResource parses SimpleBuzz payload from contentSummary when content is empty', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: manPin({
          content: '',
          contentSummary: JSON.stringify({
            content: 'Summary buzz text',
            images: ['metafile://summary-image-pin'],
          }),
        }),
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.data.payload.content, 'Summary buzz text');
  assert.deepEqual(result.data.renderer.data.payload.images, ['metafile://summary-image-pin']);
  assert.equal(result.data.renderer.data.contentSummary.content, 'Summary buzz text');
});

test('resolveMapUriToResource parses skill-service payload from contentSummary', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://skill-service/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: manPin({
          path: '/protocols/skill-service',
          content: '',
          contentSummary: {
            name: 'Evidence Skill',
            description: 'Finds evidence.',
            inputSchema: { task: 'string' },
          },
        }),
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.data.rendererId, 'skill-service.detail');
  assert.equal(result.data.renderer.data.payload.name, 'Evidence Skill');
  assert.deepEqual(result.data.renderer.data.payload.inputSchema, { task: 'string' });
});

test('resolveMapUriToResource rejects protocol path mismatch', async () => {
  const result = await resolveMapUriToResource({
    uri: `map://simplebuzz/pin/${buzzPinId}`,
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: manPin({ path: '/protocols/skill-service' }) }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_protocol_mismatch');
});

test('resolveMapUriToResource creates open-conversation resource for simplemsg conversation URI', async () => {
  const result = await resolveMapUriToResource({
    uri: 'map://simplemsg/conversation?peer=idq1peer',
    manApiBaseUrl: 'https://man.example.test',
    fetch: async () => {
      throw new Error('conversation URI should not fetch MAN pin content');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'conversation');
  assert.equal(result.data.renderer.type, 'host-action');
  assert.equal(result.data.actions[0].kind, 'open-conversation');
  assert.equal(result.data.actions[0].payload.peerGlobalMetaId, 'idq1peer');
});
