import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');

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
});

test('parseBrowserUri rejects missing, empty, and unsupported schemes', () => {
  assert.throws(() => parseBrowserUri('idqABC'), /complete Agent Internet URI/i);
  assert.throws(() => parseBrowserUri('metaid://'), /empty resource id/i);
  assert.throws(() => parseBrowserUri('https://example.com'), /unsupported URI scheme/i);
});
