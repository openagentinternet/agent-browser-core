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
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  assert.deepEqual(core.parseBrowserUri(` PIN://${pinId}?version=2 `), {
    originalUri: `PIN://${pinId}?version=2`,
    normalizedUri: `pin://${pinId}?version=2`,
    scheme: 'pin',
    id: `${pinId}?version=2`,
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

test('parseBrowserUri treats a bare domain-like alias as a metaid URI', () => {
  assert.deepEqual(core.parseBrowserUri('  SUNNYFUNG.ETH  '), {
    originalUri: 'SUNNYFUNG.ETH',
    normalizedUri: 'metaid://sunnyfung.eth',
    scheme: 'metaid',
    id: 'sunnyfung.eth',
  });
});

test('parseBrowserUri treats a bare pin id as a pin URI', () => {
  const pinId = '7edcf7775a2054c87c46c0a964d10dd6c32408506d60b0b91a90c30423d8edbei0';
  assert.deepEqual(core.parseBrowserUri(`  ${pinId.toUpperCase()}  `), {
    originalUri: pinId.toUpperCase(),
    normalizedUri: `pin://${pinId}`,
    scheme: 'pin',
    id: pinId,
  });
});

test('parseBrowserUri rejects missing, empty, and unsupported schemes', () => {
  assert.throws(() => core.parseBrowserUri('idqABC'), /complete Agent Internet URI/i);
  assert.throws(() => core.parseBrowserUri('idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8p'), /valid Global MetaID/i);
  assert.throws(() => core.parseBrowserUri('sunny_fung.eth'), /complete Agent Internet URI/i);
  assert.throws(() => core.parseBrowserUri('sunnyfung.eth/path'), /complete Agent Internet URI/i);
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

test('parsePinUri accepts canonical pin latest and history targets', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

  assert.deepEqual(core.parsePinUri(`pin://${pinId}`), {
    originalUri: `pin://${pinId}`,
    normalizedUri: `pin://${pinId}`,
    pinId,
    versionSelector: 'latest',
  });

  assert.deepEqual(core.parsePinUri(`pin://${pinId}?version=1`), {
    originalUri: `pin://${pinId}?version=1`,
    normalizedUri: `pin://${pinId}?version=1`,
    pinId,
    versionSelector: 'history-index',
    historyIndex: 1,
  });
});

test('parsePinUri rejects invalid selectors and unsupported components', () => {
  assert.throws(() => core.parsePinUri('pin://abc'), /pinId/i);
  assert.throws(() => core.parsePinUri('pin://abc[0]'), /pinId|path/i);
  assert.throws(() => core.parsePinUri('pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=latest'), /version/i);
  assert.throws(() => core.parsePinUri('pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0?version=1&foo=bar'), /query/i);
  assert.throws(() => core.parsePinUri('pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0#fragment'), /fragment/i);
});

test('parseMapUri rejects aliases and invalid selectors', () => {
  assert.throws(() => core.parseMapUri('map://buzz.eth'), /unsupported MAP path|complete MAP URI|authority/i);
  assert.throws(() => core.parseMapUri('map://buzz/pin/abc'), /pinId/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc'), /pinId/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc[-1]'), /history/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/pin/abc?version=latest'), /version/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation'), /peer/i);
  assert.throws(() => core.parseMapUri('map://simplebuzz/render/abc'), /unsupported MAP path/i);
});

test('parseMapUri rejects unsafe authorities and unsupported components', () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

  assert.throws(() => core.parseMapUri(`map://buzz%2Eeth/pin/${pinId}`), /alias|authority|unsupported/i);
  assert.throws(() => core.parseMapUri(`map://simple%2fbuzz/pin/${pinId}`), /alias|authority|unsupported|complete/i);
  assert.throws(() => core.parseMapUri(`map://simple_buzz/pin/${pinId}`), /alias|authority|unsupported/i);
  assert.throws(() => core.parseMapUri(`map://simplebuzz/pin/${pinId}#fragment`), /fragment|unsupported/i);
  assert.throws(() => core.parseMapUri(`map://simplebuzz/pin/${pinId}?version=1&foo=bar`), /query|unsupported/i);
  assert.throws(() => core.parseMapUri(`map://simplebuzz/pin/${pinId}?version=1&version=2`), /version|unsupported/i);
  assert.throws(() => core.parseMapUri(`map://simplebuzz/pin/${pinId}[2]?version=1`), /version|unsupported/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation?peer=idq1peer&extra=1'), /query|unsupported/i);
  assert.throws(() => core.parseMapUri('map://simplemsg/conversation?peer=idq1peer#fragment'), /fragment|unsupported/i);
});

test('parseBrowserUri accepts the preview-metaapp scheme', () => {
  const parsed = core.parseBrowserUri('preview-metaapp://localhost/Users/tusm/app/index.html');
  assert.equal(parsed.scheme, 'preview-metaapp');
  assert.equal(parsed.normalizedUri, 'preview-metaapp://localhost/Users/tusm/app/index.html');
  // The dedicated preview-metaapp parser (Task 2) splits host + path and
  // uses the path as the resource id.
  assert.equal(parsed.id, '/Users/tusm/app/index.html');
});

test('parseBrowserUri lowercases the preview-metaapp scheme', () => {
  const parsed = core.parseBrowserUri('PREVIEW-METAAPP://localhost/x');
  assert.equal(parsed.scheme, 'preview-metaapp');
});
