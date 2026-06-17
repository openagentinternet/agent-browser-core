import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveBrowserResource } = require('../../packages/core/dist/browser/browserResolver.js');

test('resolveBrowserResource fails closed when metaso-p2p URL is missing for metaid URI', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1missingconfig',
    config: {
      metasoP2PBaseUrl: '',
      botHomepageTemplateId: 'document',
      defaultChainName: 'mvc',
      localMode: true,
    },
    metaAppLookup: async () => null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_config_missing');
});

test('resolveBrowserResource resolves metaid URI through homepage client', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v1.json', import.meta.url), 'utf8'));
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1fixturebot',
    config: {
      metasoP2PBaseUrl: 'https://so.example.test',
      botHomepageTemplateId: 'compact-list',
      defaultChainName: 'mvc',
      localMode: true,
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: '', data: fixture }),
    }),
    metaAppLookup: async () => null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'bot-page');
  assert.equal(result.data.renderer.templateId, 'compact-list');
});

test('resolveBrowserResource dispatches metafile URI to ManAPI file metadata', async () => {
  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const result = await resolveBrowserResource({
    uri: `metafile://${pinId}.pdf`,
    config: {
      metasoP2PBaseUrl: '',
      manApiBaseUrl: 'https://man.example.test',
      metafileContentBaseUrl: 'https://content.example.test/files',
      botHomepageTemplateId: 'document',
      defaultChainName: 'mvc',
      localMode: true,
    },
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/file/document.pdf',
            contentTypeDetect: 'application/pdf',
            globalMetaId: 'idq1publisher',
            timestamp: 1780760000,
          },
        }),
      };
    },
    metaAppLookup: async () => {
      throw new Error('metafile URI should not use MetaApp lookup');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metafile://${pinId}`);
  assert.equal(result.data.resourceType, 'pdf');
  assert.equal(result.data.renderer.type, 'pdf');
  assert.equal(result.data.renderer.url, `https://content.example.test/files/${pinId}`);
});

const customMetaAppPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';
const customMetafilePinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';

function browserConfig(overrides = {}) {
  return {
    metasoP2PBaseUrl: 'https://so.example.test',
    manApiBaseUrl: 'https://man.example.test',
    metafileContentBaseUrl: 'https://content.example.test/files',
    blockExplorerBaseUrl: 'https://explorer.example.test/tx',
    botHomepageTemplateId: 'document',
    defaultChainName: 'mvc',
    renderCustomBotPages: true,
    localMode: true,
    ...overrides,
  };
}

function homepageWithCustom(custom) {
  return {
    schemaVersion: 'botHomepage.v2',
    globalMetaId: 'idq1custombot',
    canonical: { globalMetaId: 'idq1custombot' },
    profile: { name: 'Custom Bot' },
    homepage: {
      mode: custom ? 'custom' : 'default',
      title: 'Custom Bot',
      summary: 'Custom summary.',
      custom,
    },
    proofs: { verificationState: 'partial' },
    source: { resolver: 'test-homepage' },
    actions: [
      { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: 'metaid://idq1custombot' },
    ],
  };
}

function metaAppRecord(pinId) {
  return {
    pinId,
    firstPinId: pinId,
    operation: 'create',
    title: 'Custom MetaApp',
    appName: 'custom-metaapp',
    version: '1.0.0',
    runtime: 'browser',
    indexFile: 'index.html',
    code: 'metafile://content-pin',
    content: 'metafile://content-pin',
    contentType: 'text/html',
    codeType: 'text/html',
    tags: [],
    ownerGlobalMetaId: 'idq1metaappowner',
    network: 'mvc',
    localUiUrl: '/api/metaapp/preview-assets/custom/index.html',
    updatedAt: 1780760000000,
    source: 'test',
  };
}

function homepageFetch(homepage) {
  return async (url) => {
    assert.equal(
      String(url),
      'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: '', data: homepage }),
    };
  };
}

test('resolveBrowserResource aliases custom metaapp homepage without rewriting normalized URI', async () => {
  const customHomepageUri = `metaapp://${customMetaAppPinId}`;
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: customHomepageUri })),
    metaAppLookup: async (pinId) => {
      assert.equal(pinId, customMetaAppPinId);
      return metaAppRecord(pinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://idq1custombot');
  assert.equal(result.data.normalizedUri, 'metaid://idq1custombot');
  assert.equal(result.data.resourceType, 'metaapp');
  assert.equal(result.data.owner.globalMetaId, 'idq1metaappowner');
  assert.equal(result.data.renderer.type, 'html-iframe');
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.aliasUri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.customHomepageUri, customHomepageUri);
  assert.equal(
    result.data.source.raw.botHomepageSourceUrl,
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
  );
  assert.equal(result.data.source.raw.botHomepageRaw.homepage.custom.uri, customHomepageUri);
});

test('resolveBrowserResource aliases custom metafile homepage without rewriting normalized URI', async () => {
  const fetchCalls = [];
  const customHomepageUri = `metafile://${customMetafilePinId}.png`;
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('https://so.example.test/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            message: '',
            data: homepageWithCustom({ uri: customHomepageUri }),
          }),
        };
      }
      assert.equal(String(url), `https://man.example.test/pin/${customMetafilePinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: customMetafilePinId,
            path: '/file/custom-homepage.png',
            contentTypeDetect: 'image/png',
            globalMetaId: 'idq1fileowner',
            timestamp: 1780760000,
          },
        }),
      };
    },
    metaAppLookup: async () => {
      throw new Error('metafile custom homepage should not use MetaApp lookup');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://idq1custombot');
  assert.equal(result.data.normalizedUri, 'metaid://idq1custombot');
  assert.equal(result.data.resourceType, 'image');
  assert.equal(result.data.renderer.type, 'image');
  assert.equal(result.data.renderer.url, `https://content.example.test/files/${customMetafilePinId}`);
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.aliasUri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.customHomepageUri, customHomepageUri);
  assert.equal(
    result.data.source.raw.botHomepageSourceUrl,
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
  );
  assert.deepEqual(fetchCalls, [
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v2',
    `https://man.example.test/pin/${customMetafilePinId}`,
  ]);
});

test('resolveBrowserResource uses built-in template when custom rendering is disabled', async () => {
  let metaAppLookupCalled = false;
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig({ renderCustomBotPages: false }),
    fetch: homepageFetch(homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` })),
    metaAppLookup: async () => {
      metaAppLookupCalled = true;
      return metaAppRecord(customMetaAppPinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'bot');
  assert.equal(result.data.renderer.type, 'bot-page');
  assert.equal(metaAppLookupCalled, false);
});

test('resolveBrowserResource uses built-in template when custom uri is empty', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: '   ' })),
    metaAppLookup: async () => {
      throw new Error('empty custom uri should not resolve MetaApp');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'bot');
  assert.equal(result.data.renderer.type, 'bot-page');
});

test('resolveBrowserResource fails closed for unsupported custom homepage uri', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: 'https://example.test/custom-homepage' })),
    metaAppLookup: async () => {
      throw new Error('unsupported custom uri should fail before MetaApp lookup');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_browser_uri');
});
