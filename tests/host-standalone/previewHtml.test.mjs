import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  preparePreviewHtml,
  rewritePreviewHtmlMetafileReferences,
} = require('../../packages/host-standalone/dist/metaapp/previewHtml.js');
const { createStandaloneBrowserHostAdapter } = require('../../packages/host-standalone/dist/index.js');

const PIN = '765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0';
const PIN_B = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const DEFAULT_ACCELERATED = `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${PIN}`;
const DEFAULT_ACCELERATED_B = `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${PIN_B}`;

test('rewrites src attributes holding metafile:// references', () => {
  const html = `<img src="metafile://${PIN}"><video src="metafile://${PIN}"></video>`;
  const rewritten = rewritePreviewHtmlMetafileReferences(html, 'https://file.metaid.io/metafile-indexer');
  assert.equal(rewritten, `<img src="${DEFAULT_ACCELERATED}"><video src="${DEFAULT_ACCELERATED}"></video>`);
});

test('rewrites single-quoted src, poster, and srcset attributes', () => {
  const html = `<video src='metafile://${PIN}' poster='metafile://${PIN}'></video>`;
  const rewritten = rewritePreviewHtmlMetafileReferences(html, 'https://file.metaid.io/metafile-indexer');
  assert.equal(
    rewritten,
    `<video src='${DEFAULT_ACCELERATED}' poster='${DEFAULT_ACCELERATED}'></video>`,
  );
});

test('rewrites every srcset candidate and preserves descriptors', () => {
  const html = `<img srcset="metafile://${PIN} 1x, metafile://${PIN_B} 2x, https://example.com/a.png 3x">`;
  const rewritten = rewritePreviewHtmlMetafileReferences(html, 'https://file.metaid.io/metafile-indexer');
  assert.equal(
    rewritten,
    `<img srcset="${DEFAULT_ACCELERATED} 1x, ${DEFAULT_ACCELERATED_B} 2x, https://example.com/a.png 3x">`,
  );
});

test('accepts typed-path prefixes, extensions, query strings, and uppercase schemes', () => {
  const variants = [
    `metafile://video/${PIN}`,
    `metafile://${PIN}.mp4`,
    `metafile://${PIN}?x=1`,
    `METAFILE://${PIN}`,
  ];
  for (const variant of variants) {
    const rewritten = rewritePreviewHtmlMetafileReferences(
      `<img src="${variant}">`,
      'https://file.metaid.io/metafile-indexer',
    );
    assert.equal(rewritten, `<img src="${DEFAULT_ACCELERATED}">`, `variant ${variant} should normalize`);
  }
});

test('leaves href links, data-src, invalid pin ids, and web2 urls untouched', () => {
  const html = [
    `<a href="metaapp://${PIN}">app</a>`,
    `<a href="metafile://${PIN}">file</a>`,
    `<img data-src="metafile://${PIN}">`,
    `<img src="metafile://not-a-pin">`,
    `<img src="https://example.com/a.png">`,
  ].join('');
  assert.equal(
    rewritePreviewHtmlMetafileReferences(html, 'https://file.metaid.io/metafile-indexer'),
    html,
  );
});

test('derives non-indexer base urls without the accelerated path segment', () => {
  const rewritten = rewritePreviewHtmlMetafileReferences(
    `<img src="metafile://${PIN}">`,
    'https://cdn.example.com/',
  );
  assert.equal(rewritten, `<img src="https://cdn.example.com/${PIN}">`);
});

test('preparePreviewHtml leaves non-HTML assets byte-identical', () => {
  const body = Buffer.from('<img src="metafile://x">');
  const prepared = preparePreviewHtml({ body, contentType: 'image/png', metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer' });
  assert.equal(prepared, body);
});

test('preparePreviewHtml rewrites metafile references and injects both preview scripts into head', () => {
  const body = Buffer.from(`<html><head><title>t</title></head><body><img src="metafile://${PIN}"></body></html>`);
  const prepared = String(preparePreviewHtml({
    body,
    contentType: 'text/html; charset=utf-8',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  }));
  assert.ok(prepared.includes('__agentBrowserPreviewStorageShim'), 'storage shim should be injected');
  assert.ok(prepared.includes('__agentBrowserPreviewBridge'), 'navigation bridge should be injected');
  assert.ok(prepared.includes(`src="${DEFAULT_ACCELERATED}"`), 'metafile src should be rewritten');
  const head = prepared.slice(0, prepared.indexOf('</head>'));
  assert.ok(head.includes('__agentBrowserPreviewStorageShim'), 'shim should sit inside head');
  assert.ok(head.includes('__agentBrowserPreviewBridge'), 'bridge should sit inside head');
});

test('preparePreviewHtml is idempotent for already-prepared html', () => {
  const body = Buffer.from(`<html><head></head><body><img src="metafile://${PIN}"></body></html>`);
  const once = String(preparePreviewHtml({
    body,
    contentType: 'text/html',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  }));
  const twice = String(preparePreviewHtml({
    body: Buffer.from(once),
    contentType: 'text/html',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  }));
  assert.equal(twice, once);
});

test('served preview assets rewrite metafile src and carry the navigation bridge', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'preview-html-'));
  await writeFile(
    path.join(dir, 'index.html'),
    `<html><head></head><body><a href="metaapp://${PIN}">open</a><img src="metafile://${PIN_B}"></body></html>`,
  );
  try {
    const host = createStandaloneBrowserHostAdapter();
    const resolved = await host.resolveResource({ uri: `preview-metaapp://localhost${dir}` });
    assert.equal(resolved.ok, true);
    const previewUrl = resolved.data.renderer.url;
    assert.match(previewUrl, /^\/api\/browser\/preview-assets\//);
    const afterPrefix = previewUrl.slice('/api/browser/preview-assets/'.length);
    const [previewId, ...assetPathParts] = afterPrefix.split('/');
    const asset = await host.resolvePreviewAsset({ previewId, assetPath: decodeURIComponent(assetPathParts.join('/')) });
    assert.equal(asset.ok, true);
    assert.equal(asset.data.contentType, 'text/html; charset=utf-8');
    const html = String(asset.data.body);
    assert.ok(html.includes(`href="metaapp://${PIN}"`), 'internal href should stay a Browser URI');
    assert.ok(html.includes(`src="${DEFAULT_ACCELERATED_B}"`), 'metafile img src should be rewritten');
    assert.ok(html.includes('__agentBrowserPreviewBridge'), 'navigation bridge should be injected');
    assert.ok(html.includes('__agentBrowserPreviewStorageShim'), 'storage shim should stay injected');
  } finally {
    // best-effort cleanup; the host is in-memory
  }
});
