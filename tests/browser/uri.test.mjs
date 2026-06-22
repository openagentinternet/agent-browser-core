import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri, isValidGlobalMetaId } = require('../../packages/core/dist/browser/uri.js');

const validGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';

test('parseBrowserUri normalizes supported Browser URI schemes', () => {
  assert.deepEqual(parseBrowserUri('  METAID://idqABC  '), {
    originalUri: 'METAID://idqABC',
    normalizedUri: 'metaid://idqABC',
    scheme: 'metaid',
    id: 'idqABC',
  });
  assert.deepEqual(parseBrowserUri('metaapp://abcdef123i0'), {
    originalUri: 'metaapp://abcdef123i0',
    normalizedUri: 'metaapp://abcdef123i0',
    scheme: 'metaapp',
    id: 'abcdef123i0',
  });
  assert.deepEqual(parseBrowserUri(' METAFILE://abcdef123i0.pdf '), {
    originalUri: 'METAFILE://abcdef123i0.pdf',
    normalizedUri: 'metafile://abcdef123i0.pdf',
    scheme: 'metafile',
    id: 'abcdef123i0.pdf',
  });
  assert.deepEqual(parseBrowserUri(' map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0[0] '), {
    originalUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0[0]',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=0',
    scheme: 'map',
    id: 'simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=0',
  });
  const pinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  assert.deepEqual(parseBrowserUri(` PIN://${pinId}?version=2 `), {
    originalUri: `PIN://${pinId}?version=2`,
    normalizedUri: `pin://${pinId}?version=2`,
    scheme: 'pin',
    id: `${pinId}?version=2`,
  });
});

test('parseBrowserUri normalizes map scheme resources', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  assert.deepEqual(parseBrowserUri(` MAP://simplebuzz/pin/${pinId}[0] `), {
    originalUri: `MAP://simplebuzz/pin/${pinId}[0]`,
    normalizedUri: `map://simplebuzz/pin/${pinId}?version=0`,
    scheme: 'map',
    id: `simplebuzz/pin/${pinId}?version=0`,
  });
});

test('parseBrowserUri treats a bare valid Global MetaID as a metaid URI', () => {
  assert.deepEqual(parseBrowserUri(`  ${validGlobalMetaId.toUpperCase()}  `), {
    originalUri: validGlobalMetaId.toUpperCase(),
    normalizedUri: `metaid://${validGlobalMetaId}`,
    scheme: 'metaid',
    id: validGlobalMetaId,
  });
});

test('parseBrowserUri treats a bare domain-like alias as a metaid URI', () => {
  assert.deepEqual(parseBrowserUri('  SUNNYFUNG.ETH  '), {
    originalUri: 'SUNNYFUNG.ETH',
    normalizedUri: 'metaid://sunnyfung.eth',
    scheme: 'metaid',
    id: 'sunnyfung.eth',
  });
});

test('parseBrowserUri treats a bare pin id as a pin URI', () => {
  const pinId = '7edcf7775a2054c87c46c0a964d10dd6c32408506d60b0b91a90c30423d8edbei0';
  assert.deepEqual(parseBrowserUri(`  ${pinId.toUpperCase()}  `), {
    originalUri: pinId.toUpperCase(),
    normalizedUri: `pin://${pinId}`,
    scheme: 'pin',
    id: pinId,
  });
});

test('parseBrowserUri rejects missing, empty, and unsupported schemes', () => {
  assert.throws(() => parseBrowserUri('idqABC'), /complete Agent Internet URI/i);
  assert.throws(() => parseBrowserUri('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), /valid Global MetaID/i);
  assert.throws(() => parseBrowserUri('sunny_fung.eth'), /complete Agent Internet URI/i);
  assert.throws(() => parseBrowserUri('sunnyfung.eth/path'), /complete Agent Internet URI/i);
  assert.throws(() => parseBrowserUri('metaid://'), /empty resource id/i);
  assert.throws(() => parseBrowserUri('https://example.com'), /unsupported URI scheme/i);
});

test('browser uri module exports Global MetaID validation helper', () => {
  assert.equal(isValidGlobalMetaId(validGlobalMetaId), true);
  assert.equal(isValidGlobalMetaId('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), false);
});
