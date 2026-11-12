import assert from 'node:assert/strict';
import { test } from 'node:test';

const { classifyLocalFile } = await import('../../packages/core/dist/index.js');

const CASES = [
  ['/tmp/notes.md', { kind: 'markdown', viewer: true }],
  ['/tmp/notes.markdown', { kind: 'markdown', viewer: true }],
  ['/tmp/notes.txt', { kind: 'text', viewer: true }],
  ['/tmp/app.log', { kind: 'text', viewer: true }],
  ['/tmp/README', { kind: 'text', viewer: true }],
  ['/tmp/LICENSE', { kind: 'text', viewer: true }],
  ['/tmp/.gitignore', { kind: 'text', viewer: true }],
  ['/tmp/noextension', { kind: 'text', viewer: true }],
  ['/tmp/a.ts', { kind: 'code', language: 'typescript', viewer: true }],
  ['/tmp/a.tsx', { kind: 'code', language: 'typescript', viewer: true }],
  ['/tmp/a.js', { kind: 'code', language: 'javascript', viewer: true }],
  ['/tmp/a.rs', { kind: 'code', language: 'rust', viewer: true }],
  ['/tmp/Dockerfile', { kind: 'code', language: 'dockerfile', viewer: true }],
  ['/tmp/Makefile', { kind: 'code', language: 'makefile', viewer: true }],
  ['/tmp/data.CSV', { kind: 'csv', viewer: true }],
  ['/tmp/data.tsv', { kind: 'csv', viewer: true }],
  ['/tmp/page.html', { kind: 'html', viewer: false }],
  ['/tmp/doc.pdf', { kind: 'pdf', viewer: false }],
  ['/tmp/pic.png', { kind: 'image', viewer: false }],
  ['/tmp/clip.mp4', { kind: 'video', viewer: false }],
  ['/tmp/song.mp3', { kind: 'audio', viewer: false }],
  ['/tmp/song.flac', { kind: 'audio', viewer: false }],
  ['/tmp/report.docx', { kind: 'unsupported', viewer: false }],
  ['/tmp/archive.zip', { kind: 'unsupported', viewer: false }],
];

for (const [filePath, expected] of CASES) {
  test(`classifyLocalFile ${filePath} -> ${expected.kind}`, () => {
    const result = classifyLocalFile(filePath);
    assert.equal(result.kind, expected.kind);
    assert.equal(result.viewer, expected.viewer);
    if (expected.language) {
      assert.equal(result.language, expected.language);
    }
  });
}

test('classifyLocalFile is case-insensitive on extensions', () => {
  assert.equal(classifyLocalFile('/tmp/A.MD').kind, 'markdown');
  assert.equal(classifyLocalFile('/tmp/A.PDF').kind, 'pdf');
  assert.equal(classifyLocalFile('/tmp/A.PNG').kind, 'image');
});

test('classifyLocalFile returns canonical content types', () => {
  assert.equal(classifyLocalFile('/tmp/a.md').contentType, 'text/markdown; charset=utf-8');
  assert.equal(classifyLocalFile('/tmp/a.txt').contentType, 'text/plain; charset=utf-8');
  assert.equal(classifyLocalFile('/tmp/a.csv').contentType, 'text/csv; charset=utf-8');
  assert.equal(classifyLocalFile('/tmp/a.html').contentType, 'text/html; charset=utf-8');
  assert.equal(classifyLocalFile('/tmp/a.pdf').contentType, 'application/pdf');
  assert.equal(classifyLocalFile('/tmp/a.png').contentType, 'image/png');
  assert.equal(classifyLocalFile('/tmp/a.mp4').contentType, 'video/mp4');
  assert.equal(classifyLocalFile('/tmp/a.mp3').contentType, 'audio/mpeg');
  assert.equal(classifyLocalFile('/tmp/a.docx').contentType, 'application/octet-stream');
});
