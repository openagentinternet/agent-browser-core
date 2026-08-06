import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');
const {
  parseMetaAppLaunchUri,
  serializeMetaAppLaunchQuery,
} = require('../../packages/core/dist/browser/metaAppLaunchContext.js');
const { buildMetaAppResolveResult } = require('../../packages/core/dist/browser/metaAppResolver.js');
const { resolveBrowserResource } = require('../../packages/core/dist/browser/browserResolver.js');

const APP_PIN_ID = 'e7f1851b630c4bf1660a7b7f0aa576acb65a6a82f3827ce79ab8d755027b6c4c';
const BUZZ_PIN_ID = 'a9c8e3f1d2b64705af8e6c3b1d4a5098c7f2e6d1b3a54870c9f1e2d3a4b5c607i0';

function metaAppRecord(pinId) {
  return {
    pinId,
    firstPinId: pinId,
    operation: 'create',
    title: 'Fixture MetaApp',
    appName: 'fixture-metaapp',
    version: '1.0.0',
    runtime: 'browser',
    indexFile: 'index.html',
    code: 'metafile://content-pin',
    content: 'metafile://content-pin',
    contentType: 'text/html',
    codeType: 'text/html',
    tags: [],
    ownerGlobalMetaId: 'idq1publisher',
    network: 'mvc',
    localUiUrl: '/api/metaapp/preview-assets/custom/index.html',
    updatedAt: 1780760000000,
    source: 'indexer',
  };
}

function browserConfig() {
  return {
    metasoP2PBaseUrl: 'https://so.example.test',
    manApiBaseUrl: 'https://man.example.test',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
    botHomepageTemplateId: 'document',
    defaultChainName: 'mvc',
    localMode: true,
  };
}

test('parseBrowserUri keeps bare metaapp://<appPinId> behavior unchanged', () => {
  const parsed = parseBrowserUri(`metaapp://${APP_PIN_ID}i0`);
  assert.deepEqual(parsed, {
    originalUri: `metaapp://${APP_PIN_ID}i0`,
    normalizedUri: `metaapp://${APP_PIN_ID}i0`,
    scheme: 'metaapp',
    id: `${APP_PIN_ID}i0`,
  });
  assert.equal(parsed.launchContext, undefined);
});

test('parseBrowserUri extracts a pure appPinId and launchContext from deep-link query', () => {
  const uri = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`;
  const parsed = parseBrowserUri(uri);
  assert.equal(parsed.scheme, 'metaapp');
  assert.equal(parsed.id, `${APP_PIN_ID}i0`);
  assert.equal(parsed.normalizedUri, uri);
  assert.deepEqual(parsed.launchContext, {
    view: 'buzz',
    pin: BUZZ_PIN_ID,
    originalUri: uri,
  });
});

test('parseBrowserUri never lets query/path/hash leak into the appPinId', () => {
  const withQuery = parseBrowserUri(`metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`);
  assert.equal(withQuery.id, `${APP_PIN_ID}i0`);

  const pathForm = parseBrowserUri(`metaapp://${APP_PIN_ID}i0/buzz/${BUZZ_PIN_ID}`);
  assert.equal(pathForm.id, `${APP_PIN_ID}i0`);

  const hashForm = parseBrowserUri(`metaapp://${APP_PIN_ID}i0#buzz=${BUZZ_PIN_ID}`);
  assert.equal(hashForm.id, `${APP_PIN_ID}i0`);
  assert.equal(hashForm.launchContext, undefined);
});

test('parseBrowserUri decodes query with standard URL encoding', () => {
  const parsed = parseBrowserUri(`metaapp://${APP_PIN_ID}i0?view=buzz+detail&pin=${encodeURIComponent('a/b')}`);
  assert.deepEqual(parsed.launchContext, {
    view: 'buzz detail',
    pin: 'a/b',
    originalUri: `metaapp://${APP_PIN_ID}i0?view=buzz+detail&pin=${encodeURIComponent('a/b')}`,
  });
  assert.equal(parsed.id, `${APP_PIN_ID}i0`);
});

test('parseMetaAppLaunchUri returns null context for empty or unknown-only queries', () => {
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: null,
  });
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?foo=bar`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: null,
  });
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?view=`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: null,
  });
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?view=buzz`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: { view: 'buzz', originalUri: `metaapp://${APP_PIN_ID}i0?view=buzz` },
  });
});

test('serializeMetaAppLaunchQuery forwards declared params and degrades per host rules', () => {
  const uri = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`;
  assert.equal(
    serializeMetaAppLaunchQuery({ view: 'buzz', pin: BUZZ_PIN_ID, originalUri: uri }),
    `view=buzz&pin=${BUZZ_PIN_ID}`,
  );
  // Unknown view values are forwarded verbatim for the app's unsupported-view state.
  assert.equal(
    serializeMetaAppLaunchQuery({ view: 'other', originalUri: uri }),
    'view=other',
  );
  assert.equal(
    serializeMetaAppLaunchQuery({ view: 'other', pin: BUZZ_PIN_ID, originalUri: uri }),
    `view=other&pin=${BUZZ_PIN_ID}`,
  );
  // view=buzz without pin opens the default feed: nothing is forwarded.
  assert.equal(
    serializeMetaAppLaunchQuery({ view: 'buzz', originalUri: uri }),
    '',
  );
  // No view opens the default feed even when pin is present.
  assert.equal(
    serializeMetaAppLaunchQuery({ pin: BUZZ_PIN_ID, originalUri: uri }),
    '',
  );
  assert.equal(serializeMetaAppLaunchQuery(null), '');
  assert.equal(serializeMetaAppLaunchQuery(undefined), '');
});

test('serializeMetaAppLaunchQuery encodeURIComponent-encodes forwarded values', () => {
  const query = serializeMetaAppLaunchQuery({
    view: 'buzz',
    pin: 'a/b c&d',
    originalUri: 'metaapp://pin?x',
  });
  assert.equal(query, 'view=buzz&pin=a%2Fb+c%26d');
});

test('buildMetaAppResolveResult appends the launch query to the app entry URL', () => {
  const uri = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`;
  const record = metaAppRecord(`${APP_PIN_ID}i0`);
  const withContext = buildMetaAppResolveResult({
    uri,
    normalizedUri: uri,
    record,
    launchContext: { view: 'buzz', pin: BUZZ_PIN_ID, originalUri: uri },
  });
  assert.equal(withContext.renderer.type, 'html-iframe');
  assert.equal(
    withContext.renderer.url,
    `/api/metaapp/preview-assets/custom/index.html?view=buzz&pin=${BUZZ_PIN_ID}`,
  );

  const bare = buildMetaAppResolveResult({
    uri: `metaapp://${APP_PIN_ID}i0`,
    normalizedUri: `metaapp://${APP_PIN_ID}i0`,
    record,
  });
  assert.equal(bare.renderer.url, '/api/metaapp/preview-assets/custom/index.html');

  const degraded = buildMetaAppResolveResult({
    uri,
    normalizedUri: `metaapp://${APP_PIN_ID}i0`,
    record,
    launchContext: { view: 'buzz', originalUri: uri },
  });
  assert.equal(degraded.renderer.url, '/api/metaapp/preview-assets/custom/index.html');
});

test('buildMetaAppResolveResult keeps existing query and strips fragment when appending', () => {
  const record = metaAppRecord(`${APP_PIN_ID}i0`);
  const existingQuery = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: '/app/index.html?v=1' },
    launchContext: { view: 'buzz', pin: BUZZ_PIN_ID, originalUri: 'metaapp://x' },
  });
  assert.equal(existingQuery.renderer.url, `/app/index.html?v=1&view=buzz&pin=${BUZZ_PIN_ID}`);

  const fragment = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: 'https://x.example/app/index.html#top' },
    launchContext: { view: 'buzz', pin: BUZZ_PIN_ID, originalUri: 'metaapp://x' },
  });
  assert.equal(fragment.renderer.url, `https://x.example/app/index.html?view=buzz&pin=${BUZZ_PIN_ID}`);
});

test('resolveBrowserResource forwards launch params with a pure appPinId to metaAppResolve', async () => {
  let resolvedPinId = '';
  const result = await resolveBrowserResource({
    uri: `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`,
    config: browserConfig(),
    fetch: async () => {
      throw new Error('no owner profile fetch expected');
    },
    metaAppResolve: async (pinId) => {
      resolvedPinId = pinId;
      return { ok: true, data: metaAppRecord(pinId) };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(resolvedPinId, `${APP_PIN_ID}i0`);
  assert.equal(
    result.data.renderer.url,
    `/api/metaapp/preview-assets/custom/index.html?view=buzz&pin=${BUZZ_PIN_ID}`,
  );
  assert.equal(result.data.normalizedUri, `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`);
});

test('resolveBrowserResource keeps default feed behavior for query-less deep links', async () => {
  const result = await resolveBrowserResource({
    uri: `metaapp://${APP_PIN_ID}i0?foo=bar`,
    config: browserConfig(),
    metaAppResolve: async (pinId) => ({ ok: true, data: metaAppRecord(pinId) }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.url, '/api/metaapp/preview-assets/custom/index.html');
});

test('resolveBrowserResource propagates MetaApp resolution failures without degrading', async () => {
  const result = await resolveBrowserResource({
    uri: `metaapp://not-a-pin?view=buzz&pin=${BUZZ_PIN_ID}`,
    config: browserConfig(),
    metaAppResolve: async () => ({
      ok: false,
      code: 'invalid_browser_uri',
      message: 'metaapp:// requires a 64-hex pinId ending in i0.',
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_browser_uri');
});

test('preview-metaapp parsing is unaffected by MetaApp launch-context handling', () => {
  const parsed = parseBrowserUri('preview-metaapp://localhost/abs/path/index.html');
  assert.equal(parsed.scheme, 'preview-metaapp');
  assert.equal(parsed.id, '/abs/path/index.html');
  assert.equal(parsed.launchContext, undefined);
});
