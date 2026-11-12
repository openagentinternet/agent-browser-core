import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  LOCAL_FILE_VIEWER_MAX_BYTES,
  renderLocalFileViewerHtml,
} = require('../../packages/renderers/dist/localFileViewer.js');

test('markdown renders GFM tables', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 't.md',
    kind: 'markdown',
    text: '| a | b |\n| - | - |\n| 1 | 2 |',
  });
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
});

test('markdown output contains no script tags and escapes raw HTML', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'x.md',
    kind: 'markdown',
    text: 'hello\n\n<script>alert(1)</script>\n\n<div onclick="x()">hi</div>',
  });
  assert.equal(html.includes('<script'), false);
  assert.match(html, /&lt;script&gt;/);
});

test('code kind output contains no script tags', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'x.js',
    kind: 'code',
    language: 'javascript',
    text: 'const s = "<script>alert(1)</script>";',
  });
  assert.equal(html.includes('<script'), false);
});

test('javascript: links are dropped to plain text', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'x.md',
    kind: 'markdown',
    text: '[x](javascript:alert(1)) [ok](https://example.com) [rel](./b.md)',
  });
  assert.equal(html.includes('javascript:'), false);
  assert.match(html, /href="https:\/\/example\.com"[^>]*target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\.\/b\.md"/);
});

test('Agent Internet scheme links are kept', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'x.md',
    kind: 'markdown',
    text: '[p](pin://abc) [m](metaid://idq1x) [f](preview-file://localhost/a.md)',
  });
  assert.match(html, /href="pin:\/\/abc"/);
  assert.match(html, /href="metaid:\/\/idq1x"/);
  assert.match(html, /href="preview-file:\/\/localhost\/a\.md"/);
});

test('typescript code is highlighted and plain code gets line numbers', () => {
  const ts = renderLocalFileViewerHtml({
    fileName: 'a.ts',
    kind: 'code',
    language: 'typescript',
    text: 'const x: number = 1;',
  });
  assert.match(ts, /hljs-keyword/);

  const plain = renderLocalFileViewerHtml({
    fileName: 'a.unknownlang',
    kind: 'code',
    language: 'not-a-language',
    text: 'line1\nline2',
  });
  assert.match(plain, /lfv-ln/);
});

test('highlighted multi-line code keeps balanced spans per row and line numbers', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'a.ts',
    kind: 'code',
    language: 'typescript',
    text: 'const x = 1;\n/* a comment\nspanning lines */\nconst y = 2;',
  });
  assert.match(html, /lfv-ln/);
  const rows = [...html.matchAll(/<tr><td class="lfv-ln">(\d+)<\/td><td class="lfv-lc">(.*?)<\/td><\/tr>/gs)];
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row[1]), ['1', '2', '3', '4']);
  for (const [, , lineHtml] of rows) {
    const opens = (lineHtml.match(/<span/g) ?? []).length;
    const closes = (lineHtml.match(/<\/span>/g) ?? []).length;
    assert.equal(opens, closes, `unbalanced spans in row: ${lineHtml}`);
  }
  // The comment body lines must carry the comment highlighting on both rows.
  const commentRows = rows.filter((row) => row[2].includes('comment') || row[2].includes('spanning'));
  assert.equal(commentRows.length, 2);
  for (const row of commentRows) {
    assert.match(row[2], /hljs-comment/);
  }
});

test('text kind escapes and numbers lines', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'a.txt',
    kind: 'text',
    text: '<b>bold</b>\nsecond',
  });
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /lfv-ln/);
});

test('csv parses quoted comma fields and uses first row as header', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'data.csv',
    kind: 'csv',
    text: 'name,note\nalice,"hello, world"\nbob,"say ""hi"""',
  });
  assert.match(html, /<th>name<\/th><th>note<\/th>/);
  assert.match(html, /<td>hello, world<\/td>/);
  assert.match(html, /<td>say &quot;hi&quot;<\/td>/);
});

test('tsv files use tab delimiter', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'data.tsv',
    kind: 'csv',
    text: 'a\tb\n1\t2',
  });
  assert.match(html, /<th>a<\/th><th>b<\/th>/);
  assert.match(html, /<td>1<\/td><td>2<\/td>/);
});

test('truncated flag shows the banner', () => {
  const html = renderLocalFileViewerHtml({
    fileName: 'big.txt',
    kind: 'text',
    text: 'x',
    truncated: true,
  });
  assert.match(html, /File truncated at 2 MB for display\./);
});

test('explicit theme sets data-theme, absent theme falls back to prefers-color-scheme', () => {
  const dark = renderLocalFileViewerHtml({ fileName: 'a.txt', kind: 'text', text: 'x', theme: 'dark' });
  assert.match(dark, /<html lang="en" data-theme="dark">/);
  const auto = renderLocalFileViewerHtml({ fileName: 'a.txt', kind: 'text', text: 'x' });
  assert.match(auto, /prefers-color-scheme/);
  assert.doesNotMatch(auto, /<html lang="en" data-theme=/);
});

test('viewer documents never contain script tags', () => {
  for (const kind of ['markdown', 'text', 'code', 'csv']) {
    const html = renderLocalFileViewerHtml({ fileName: 'a', kind, text: '<script>x</script>' });
    assert.equal(html.includes('<script'), false, kind);
  }
});

test('max bytes constant is 2 MiB', () => {
  assert.equal(LOCAL_FILE_VIEWER_MAX_BYTES, 2 * 1024 * 1024);
});
