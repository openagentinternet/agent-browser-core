import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

const validGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';

test('parseBrowserUri normalizes supported Browser URI schemes', () => {
  assert.deepEqual(core.parseBrowserUri('  METAID://idqABC  '), {
    originalUri: 'METAID://idqABC',
    normalizedUri: 'metaid://idqABC',
    scheme: 'metaid',
    id: 'idqABC',
  });
  assert.deepEqual(core.parseBrowserUri('metaapp://abcdef123i0'), {
    originalUri: 'metaapp://abcdef123i0',
    normalizedUri: 'metaapp://abcdef123i0',
    scheme: 'metaapp',
    id: 'abcdef123i0',
  });
  assert.deepEqual(core.parseBrowserUri(' METAFILE://abcdef123i0.pdf '), {
    originalUri: 'METAFILE://abcdef123i0.pdf',
    normalizedUri: 'metafile://abcdef123i0.pdf',
    scheme: 'metafile',
    id: 'abcdef123i0.pdf',
  });
});

test('parseBrowserUri normalizes map scheme resources', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  assert.deepEqual(core.parseBrowserUri(` MAP://simplebuzz/pin/${pinId}[0] `), {
    originalUri: `MAP://simplebuzz/pin/${pinId}[0]`,
    normalizedUri: `map://simplebuzz/pin/${pinId}?version=0`,
    scheme: 'map',
    id: `simplebuzz/pin/${pinId}?version=0`,
  });
});

test('parseBrowserUri treats a bare valid Global MetaID as a metaid URI', () => {
  assert.deepEqual(core.parseBrowserUri(`  ${validGlobalMetaId.toUpperCase()}  `), {
    originalUri: validGlobalMetaId.toUpperCase(),
    normalizedUri: `metaid://${validGlobalMetaId}`,
    scheme: 'metaid',
    id: validGlobalMetaId,
  });
});

test('parseBrowserUri rejects missing, empty, and unsupported schemes', () => {
  assert.throws(() => core.parseBrowserUri('idqABC'), /complete Agent Internet URI/i);
  assert.throws(() => core.parseBrowserUri('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), /valid Global MetaID/i);
  assert.throws(() => core.parseBrowserUri('metaid://'), /empty resource id/i);
  assert.throws(() => core.parseBrowserUri('https://example.com'), /unsupported URI scheme/i);
});

test('core exports Global MetaID validation helper', () => {
  assert.equal(core.isValidGlobalMetaId(validGlobalMetaId), true);
  assert.equal(core.isValidGlobalMetaId('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), false);
});

test('parseMapUri accepts canonical MAP pin and conversation targets', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

  assert.deepEqual(core.parseMapUri(`map://simplebuzz/pin/${pinId}`), {
    originalUri: `map://simplebuzz/pin/${pinId}`,
    normalizedUri: `map://simplebuzz/pin/${pinId}`,
    authority: 'simplebuzz',
    protocolPath: '/protocols/simplebuzz',
    targetKind: 'pin',
    pinId,
    versionSelector: 'latest',
  });

  assert.deepEqual(core.parseMapUri(`map://simplebuzz/pin/${pinId}[1]`), {
    originalUri: `map://simplebuzz/pin/${pinId}[1]`,
    normalizedUri: `map://simplebuzz/pin/${pinId}?version=1`,
    authority: 'simplebuzz',
    protocolPath: '/protocols/simplebuzz',
    targetKind: 'pin',
    pinId,
    versionSelector: 'history-index',
    historyIndex: 1,
  });

  assert.deepEqual(core.parseMapUri('map://simplemsg/conversation?peer=idq1peer'), {
    originalUri: 'map://simplemsg/conversation?peer=idq1peer',
    normalizedUri: 'map://simplemsg/conversation?peer=idq1peer',
    authority: 'simplemsg',
    protocolPath: '/protocols/simplemsg',
    targetKind: 'conversation',
    peerGlobalMetaId: 'idq1peer',
  });
});

test('parseMapUri rejects aliases and invalid selectors', () => {
  assert.throws(() => core.parseMapUri('map://buzz.eth'), /unsupported MAP path|complete MAP URI/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc'), /pinId/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc[-1]'), /history/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc?version=latest'), /version/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation'), /peer/i);
});
