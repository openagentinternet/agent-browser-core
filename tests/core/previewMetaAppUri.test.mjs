import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('parsePreviewMetaAppUri splits localhost file path into host and path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/tusm/app/index.html');
  assert.deepEqual(parsed, {
    originalUri: 'preview-metaapp://localhost/Users/tusm/app/index.html',
    normalizedUri: 'preview-metaapp://localhost/Users/tusm/app/index.html',
    scheme: 'preview-metaapp',
    host: 'localhost',
    path: '/Users/tusm/app/index.html',
  });
});

test('parsePreviewMetaAppUri keeps a directory path with trailing slash', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/tusm/app/');
  assert.equal(parsed.host, 'localhost');
  assert.equal(parsed.path, '/Users/tusm/app/');
});

test('parsePreviewMetaAppUri treats localhost:3000 as a remote host (port retained)', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost:3000/app/index.html');
  assert.equal(parsed.host, 'localhost:3000');
  assert.equal(parsed.path, '/app/index.html');
});

test('parsePreviewMetaAppUri accepts a remote host', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://example.com/path/to/index.html');
  assert.equal(parsed.host, 'example.com');
  assert.equal(parsed.path, '/path/to/index.html');
});

test('parsePreviewMetaAppUri percent-decodes the path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users/me/my%20project/index.html');
  assert.equal(parsed.path, '/Users/me/my project/index.html');
});

test('parsePreviewMetaAppUri collapses consecutive slashes in the path', () => {
  const parsed = core.parsePreviewMetaAppUri('preview-metaapp://localhost/Users//tusm/app/index.html');
  assert.equal(parsed.path, '/Users/tusm/app/index.html');
});

test('parsePreviewMetaAppUri rejects empty host', () => {
  assert.throws(() => core.parsePreviewMetaAppUri('preview-metaapp:///Users/tusm/app/index.html'), /host|URI/i);
});

test('parsePreviewMetaAppUri rejects a non-absolute path', () => {
  assert.throws(() => core.parsePreviewMetaAppUri('preview-metaapp://localhostrelative.html'), /path|URI/i);
});
