import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

const validGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';

test('parseBrowserUri normalizes metaid and metaapp schemes', () => {
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
