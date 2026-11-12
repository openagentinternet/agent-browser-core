import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('parsePreviewFileUri splits localhost file path into host and path', () => {
  const parsed = core.parsePreviewFileUri('preview-file://localhost/Users/tusm/docs/notes.md');
  assert.deepEqual(parsed, {
    originalUri: 'preview-file://localhost/Users/tusm/docs/notes.md',
    normalizedUri: 'preview-file://localhost/Users/tusm/docs/notes.md',
    scheme: 'preview-file',
    host: 'localhost',
    path: '/Users/tusm/docs/notes.md',
  });
});

test('parsePreviewFileUri percent-decodes the path', () => {
  const parsed = core.parsePreviewFileUri('preview-file://localhost/Users/me/my%20docs/a%20b.md');
  assert.equal(parsed.path, '/Users/me/my docs/a b.md');
});

test('parsePreviewFileUri collapses consecutive slashes in the path', () => {
  const parsed = core.parsePreviewFileUri('preview-file://localhost/Users//tusm//a.md');
  assert.equal(parsed.path, '/Users/tusm/a.md');
});

test('parsePreviewFileUri rejects non-localhost hosts', () => {
  assert.throws(() => core.parsePreviewFileUri('preview-file://example.com/a.md'), /only supports localhost/i);
  assert.throws(() => core.parsePreviewFileUri('preview-file://localhost:3000/a.md'), /only supports localhost/i);
});

test('parsePreviewFileUri rejects empty host and non-absolute path', () => {
  assert.throws(() => core.parsePreviewFileUri('preview-file:///a.md'), /host|URI/i);
  assert.throws(() => core.parsePreviewFileUri('preview-file://localhosta.md'), /path|URI|localhost/i);
});

test('file:/// alias normalizes to preview-file', () => {
  const parsed = core.parseBrowserUri('file:///Users/tusm/docs/a.md');
  assert.equal(parsed.scheme, 'preview-file');
  assert.equal(parsed.normalizedUri, 'preview-file://localhost/Users/tusm/docs/a.md');
  assert.equal(parsed.id, '/Users/tusm/docs/a.md');
});

test('file://localhost alias normalizes to preview-file', () => {
  const parsed = core.parseBrowserUri('file://localhost/Users/tusm/docs/a.md');
  assert.equal(parsed.scheme, 'preview-file');
  assert.equal(parsed.normalizedUri, 'preview-file://localhost/Users/tusm/docs/a.md');
});

test('file:// Windows drive form keeps the drive path', () => {
  const parsed = core.parseBrowserUri('file:///C:/Users/tusm/a.md');
  assert.equal(parsed.scheme, 'preview-file');
  assert.equal(parsed.normalizedUri, 'preview-file://localhost/C:/Users/tusm/a.md');
});

test('file:// non-localhost host is rejected', () => {
  assert.throws(() => core.parseBrowserUri('file://example.com/a.md'), /only supports localhost/i);
});

test('parseBrowserUri accepts canonical preview-file URIs', () => {
  const parsed = core.parseBrowserUri('preview-file://localhost/Users/tusm/a.md');
  assert.equal(parsed.scheme, 'preview-file');
  assert.equal(parsed.normalizedUri, 'preview-file://localhost/Users/tusm/a.md');
  assert.equal(parsed.id, '/Users/tusm/a.md');
});
