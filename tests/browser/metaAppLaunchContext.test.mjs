import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');
const {
  parseMetaAppLaunchUri,
  serializeMetaAppLaunchQuery,
  serializeMetaAppLaunchHash,
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
    rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}`,
    rawHash: '',
    originalUri: uri,
  });
});

test('parseBrowserUri keeps every extra query parameter and the hash in the launch context', () => {
  const uri = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD&empty=#section-1`;
  const parsed = parseBrowserUri(uri);
  assert.equal(parsed.id, `${APP_PIN_ID}i0`);
  assert.equal(parsed.normalizedUri, uri);
  assert.deepEqual(parsed.launchContext, {
    view: 'buzz',
    pin: BUZZ_PIN_ID,
    rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD&empty=`,
    rawHash: 'section-1',
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
  // The fragment no longer disappears: it is carried verbatim so the host can
  // forward it to the app entry URL.
  assert.deepEqual(hashForm.launchContext, {
    rawQuery: '',
    rawHash: `buzz=${BUZZ_PIN_ID}`,
    originalUri: `metaapp://${APP_PIN_ID}i0#buzz=${BUZZ_PIN_ID}`,
  });
});

test('parseBrowserUri decodes query with standard URL encoding', () => {
  const parsed = parseBrowserUri(`metaapp://${APP_PIN_ID}i0?view=buzz+detail&pin=${encodeURIComponent('a/b')}`);
  assert.deepEqual(parsed.launchContext, {
    view: 'buzz detail',
    pin: 'a/b',
    rawQuery: `view=buzz+detail&pin=${encodeURIComponent('a/b')}`,
    rawHash: '',
    originalUri: `metaapp://${APP_PIN_ID}i0?view=buzz+detail&pin=${encodeURIComponent('a/b')}`,
  });
  assert.equal(parsed.id, `${APP_PIN_ID}i0`);
});

test('parseMetaAppLaunchUri returns null context only for bare appPinIds', () => {
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: null,
  });
  // Extra parameters and fragments survive even without view/pin so the app
  // can read them from its own location.search / location.hash.
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?foo=bar`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: {
      rawQuery: 'foo=bar',
      rawHash: '',
      originalUri: `metaapp://${APP_PIN_ID}i0?foo=bar`,
    },
  });
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?view=`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: {
      rawQuery: 'view=',
      rawHash: '',
      originalUri: `metaapp://${APP_PIN_ID}i0?view=`,
    },
  });
  assert.deepEqual(parseMetaAppLaunchUri(`metaapp://${APP_PIN_ID}i0?view=buzz`), {
    appPinId: `${APP_PIN_ID}i0`,
    launchContext: {
      view: 'buzz',
      rawQuery: 'view=buzz',
      rawHash: '',
      originalUri: `metaapp://${APP_PIN_ID}i0?view=buzz`,
    },
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
  // view=buzz without pin opens the default feed: view/pin are not forwarded.
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

test('serializeMetaAppLaunchQuery forwards the full raw query byte-exact when launch rules allow', () => {
  const rawQuery = `view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD`;
  assert.equal(
    serializeMetaAppLaunchQuery({
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery,
      rawHash: '',
      originalUri: `metaapp://pin?${rawQuery}`,
    }),
    rawQuery,
  );
  // Undeclared views stay verbatim too, including pin placement.
  assert.equal(
    serializeMetaAppLaunchQuery({
      view: 'other',
      rawQuery: `foo=bar&view=other`,
      rawHash: '',
      originalUri: 'metaapp://pin?foo=bar&view=other',
    }),
    'foo=bar&view=other',
  );
});

test('serializeMetaAppLaunchQuery keeps extra parameters when degrading view/pin', () => {
  // view=buzz without pin: view/pin are withheld (default feed) but the
  // remaining parameters still reach the app.
  assert.equal(
    serializeMetaAppLaunchQuery({
      view: 'buzz',
      rawQuery: `view=buzz&foo=bar`,
      rawHash: '',
      originalUri: 'metaapp://pin?view=buzz&foo=bar',
    }),
    'foo=bar',
  );
  // No view at all: extra parameters still pass through.
  assert.equal(
    serializeMetaAppLaunchQuery({
      rawQuery: 'foo=bar&baz=qux',
      rawHash: '',
      originalUri: 'metaapp://pin?foo=bar&baz=qux',
    }),
    'foo=bar&baz=qux',
  );
  assert.equal(
    serializeMetaAppLaunchQuery({
      view: 'buzz',
      rawQuery: 'view=buzz',
      rawHash: '',
      originalUri: 'metaapp://pin?view=buzz',
    }),
    '',
  );
});

test('serializeMetaAppLaunchQuery encodeURIComponent-encodes forwarded values', () => {
  const query = serializeMetaAppLaunchQuery({
    view: 'buzz',
    pin: 'a/b c&d',
    originalUri: 'metaapp://pin?x',
  });
  assert.equal(query, 'view=buzz&pin=a%2Fb+c%26d');
});

test('serializeMetaAppLaunchHash forwards the deep-link fragment verbatim', () => {
  assert.equal(serializeMetaAppLaunchHash({ rawHash: 'section-1', originalUri: 'metaapp://pin#section-1' }), 'section-1');
  assert.equal(serializeMetaAppLaunchHash({ rawHash: '', originalUri: 'metaapp://pin' }), '');
  assert.equal(serializeMetaAppLaunchHash({ originalUri: 'metaapp://pin' }), '');
  assert.equal(serializeMetaAppLaunchHash(null), '');
  assert.equal(serializeMetaAppLaunchHash(undefined), '');
});

test('buildMetaAppResolveResult appends the launch query to the app entry URL', () => {
  const uri = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}`;
  const record = metaAppRecord(`${APP_PIN_ID}i0`);
  const withContext = buildMetaAppResolveResult({
    uri,
    normalizedUri: uri,
    record,
    launchContext: {
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}`,
      rawHash: '',
      originalUri: uri,
    },
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

test('buildMetaAppResolveResult forwards extra parameters and the hash to the iframe URL', () => {
  const record = metaAppRecord(`${APP_PIN_ID}i0`);
  const result = buildMetaAppResolveResult({
    uri: `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`,
    normalizedUri: `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`,
    record,
    launchContext: {
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD`,
      rawHash: 'section-1',
      originalUri: `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`,
    },
  });
  // The iframe location.search/location.hash match the original URI verbatim.
  assert.equal(
    result.renderer.url,
    `/api/metaapp/preview-assets/custom/index.html?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`,
  );

  const extrasOnly = buildMetaAppResolveResult({
    uri: `metaapp://${APP_PIN_ID}i0?foo=bar#top`,
    normalizedUri: `metaapp://${APP_PIN_ID}i0?foo=bar#top`,
    record,
    launchContext: {
      rawQuery: 'foo=bar',
      rawHash: 'top',
      originalUri: `metaapp://${APP_PIN_ID}i0?foo=bar#top`,
    },
  });
  assert.equal(extrasOnly.renderer.url, '/api/metaapp/preview-assets/custom/index.html?foo=bar#top');

  const hashOnly = buildMetaAppResolveResult({
    uri: `metaapp://${APP_PIN_ID}i0#top`,
    normalizedUri: `metaapp://${APP_PIN_ID}i0#top`,
    record,
    launchContext: {
      rawQuery: '',
      rawHash: 'top',
      originalUri: `metaapp://${APP_PIN_ID}i0#top`,
    },
  });
  assert.equal(hashOnly.renderer.url, '/api/metaapp/preview-assets/custom/index.html#top');
});

test('buildMetaAppResolveResult keeps existing entry query and replaces its fragment', () => {
  const record = metaAppRecord(`${APP_PIN_ID}i0`);
  const existingQuery = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: '/app/index.html?v=1' },
    launchContext: {
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}`,
      rawHash: '',
      originalUri: 'metaapp://x',
    },
  });
  assert.equal(existingQuery.renderer.url, `/app/index.html?v=1&view=buzz&pin=${BUZZ_PIN_ID}`);

  const fragment = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: 'https://x.example/app/index.html#top' },
    launchContext: {
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}`,
      rawHash: '',
      originalUri: 'metaapp://x',
    },
  });
  assert.equal(fragment.renderer.url, `https://x.example/app/index.html?view=buzz&pin=${BUZZ_PIN_ID}`);

  // A forwarded hash replaces the entry URL fragment; external https app
  // entry URLs receive the pass-through exactly like local preview URLs.
  const externalWithHash = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: 'https://x.example/app/index.html#top' },
    launchContext: {
      view: 'buzz',
      pin: BUZZ_PIN_ID,
      rawQuery: `view=buzz&pin=${BUZZ_PIN_ID}`,
      rawHash: 'section-9',
      originalUri: 'metaapp://x',
    },
  });
  assert.equal(
    externalWithHash.renderer.url,
    `https://x.example/app/index.html?view=buzz&pin=${BUZZ_PIN_ID}#section-9`,
  );

  // Non-metaapp entry URLs without a launch context are left untouched.
  const untouched = buildMetaAppResolveResult({
    uri: 'metaapp://x',
    normalizedUri: 'metaapp://x',
    record: { ...record, localUiUrl: 'https://x.example/app/index.html?keep=1#own' },
  });
  assert.equal(untouched.renderer.url, 'https://x.example/app/index.html?keep=1#own');
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

test('resolveBrowserResource passes every extra parameter and the hash to the preview iframe', async () => {
  const deepLink = `metaapp://${APP_PIN_ID}i0?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`;
  const result = await resolveBrowserResource({
    uri: deepLink,
    config: browserConfig(),
    metaAppResolve: async (pinId) => ({ ok: true, data: metaAppRecord(pinId) }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, deepLink);
  assert.equal(
    result.data.renderer.url,
    `/api/metaapp/preview-assets/custom/index.html?view=buzz&pin=${BUZZ_PIN_ID}&foo=bar&flag=%E4%B8%AD#section-1`,
  );
});

test('resolveBrowserResource keeps default feed behavior for deep links without view or extras', async () => {
  // Bare appPinId: no query, no fragment, nothing to forward.
  const bare = await resolveBrowserResource({
    uri: `metaapp://${APP_PIN_ID}i0`,
    config: browserConfig(),
    metaAppResolve: async (pinId) => ({ ok: true, data: metaAppRecord(pinId) }),
  });
  assert.equal(bare.ok, true);
  assert.equal(bare.data.renderer.url, '/api/metaapp/preview-assets/custom/index.html');

  // view=buzz without pin and no extra parameters: unchanged degraded result.
  const degraded = await resolveBrowserResource({
    uri: `metaapp://${APP_PIN_ID}i0?view=buzz`,
    config: browserConfig(),
    metaAppResolve: async (pinId) => ({ ok: true, data: metaAppRecord(pinId) }),
  });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.data.renderer.url, '/api/metaapp/preview-assets/custom/index.html');
});

test('resolveBrowserResource forwards unknown-view deep links with extra parameters unchanged', async () => {
  const result = await resolveBrowserResource({
    uri: `metaapp://${APP_PIN_ID}i0?view=play&x=1`,
    config: browserConfig(),
    metaAppResolve: async (pinId) => ({ ok: true, data: metaAppRecord(pinId) }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.url, '/api/metaapp/preview-assets/custom/index.html?view=play&x=1');
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

test('preview-metaapp and metaid parsing are unaffected by MetaApp launch-context handling', () => {
  const parsed = parseBrowserUri('preview-metaapp://localhost/abs/path/index.html');
  assert.equal(parsed.scheme, 'preview-metaapp');
  assert.equal(parsed.id, '/abs/path/index.html');
  assert.equal(parsed.launchContext, undefined);

  const metaId = parseBrowserUri('metaid://idq1example');
  assert.equal(metaId.scheme, 'metaid');
  assert.equal(metaId.launchContext, undefined);
});
