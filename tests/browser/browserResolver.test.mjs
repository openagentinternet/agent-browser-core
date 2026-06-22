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
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
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

test('resolveBrowserResource returns raw homepage without enriching chat peer profiles', async () => {
  const firstPeer = 'idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz';
  const secondPeer = 'idq1kwa7ku4w7rrx07cra9t5qr33stszvml3s96qjy';
  const firstChatPinId = '1'.repeat(64) + 'i0';
  const secondChatPinId = '2'.repeat(64) + 'i0';
  const thirdChatPinId = '3'.repeat(64) + 'i0';
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: {
      globalMetaId: 'idq1chatfixturebot',
      legacyMetaId: 'metaid-chatfixture',
      display: 'idq1chatf...bot',
    },
    profile: {
      name: 'Chat Fixture Bot',
      avatar: {
        pinId: 'avatar-pin',
        contentType: 'image/png',
      },
      bio: 'Exercises mixed homepage activity rendering.',
      pins: {
        name: 'name-pin',
      },
    },
    presence: {
      state: 'online',
      updatedAt: 1780760000,
      source: 'fixture-presence',
    },
    sections: [
      {
        id: 'services',
        protocolPath: '/protocols/skill-service',
        page: { limit: 5, count: 0, hasMore: false },
        items: [],
      },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        page: { limit: 5, count: 3, hasMore: false },
        items: [
          {
            pinId: firstChatPinId,
            protocolPath: '/protocols/simplemsg',
            timestamp: 1781913600,
            data: { interactWith: firstPeer },
          },
          {
            pinId: secondChatPinId,
            protocolPath: '/protocols/simplemsg',
            timestamp: 1781827200,
            data: { interactWith: secondPeer },
          },
          {
            pinId: thirdChatPinId,
            protocolPath: '/protocols/simplemsg',
            timestamp: 1781740800,
            data: { interactWith: firstPeer },
          },
        ],
      },
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        page: { limit: 5, count: 0, hasMore: false },
        items: [],
      },
    ],
    warnings: [],
  };
  const fetchCalls = [];
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1chatfixturebot',
    config: browserConfig(),
    fetch: async (url) => {
      const target = String(url);
      fetchCalls.push(target);
      if (target === 'https://so.example.test/api/bot-homepage/globalmetaid/idq1chatfixturebot?version=v3') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, message: '', data: homepage }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    },
    metaAppLookup: async () => null,
  });

  assert.equal(result.ok, true);
  const chatsSection = result.data.renderer.data.sections.find((section) => section.id === 'chats');
  assert.equal(Array.isArray(chatsSection.items), true);
  // Chat items retain the raw interactWith peer id but are NOT enriched with profiles.
  assert.deepEqual(
    chatsSection.items.map((item) => item.data.interactWith),
    [firstPeer, secondPeer, firstPeer],
  );
  assert.deepEqual(
    chatsSection.items.map((item) => item.data.interactWithProfile),
    [undefined, undefined, undefined],
  );
  // Resolve must only fetch the homepage — peer profile enrichment is now async/client-side.
  assert.deepEqual(fetchCalls, [
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1chatfixturebot?version=v3',
  ]);
});

test('resolveBrowserResource dispatches metafile URI to ManAPI file metadata', async () => {
  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const result = await resolveBrowserResource({
    uri: `metafile://${pinId}.pdf`,
    config: {
      metasoP2PBaseUrl: '',
      manApiBaseUrl: 'https://man.example.test',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
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
  assert.equal(result.data.renderer.url, `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${pinId}`);
});

const customMetaAppPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';
const customMetafilePinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
const metaAppOwnerAvatarId = '9'.repeat(64) + 'i0';

function browserConfig(overrides = {}) {
  return {
    metasoP2PBaseUrl: 'https://so.example.test',
    manApiBaseUrl: 'https://man.example.test',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
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
    schemaVersion: 'botHomepage.v3',
    identity: {
      globalMetaId: 'idq1custombot',
      legacyMetaId: 'metaid-custom',
      display: 'idq1custom...bot',
    },
    profile: {
      name: 'Custom Bot',
      bio: 'Custom summary.',
      homepage: custom
        ? {
          pinId: 'homepage-pin',
          payload: custom,
        }
        : null,
      pins: {
        name: 'name-pin',
      },
    },
    presence: {
      state: 'unknown',
      updatedAt: null,
      source: '',
    },
    sections: [
      {
        id: 'services',
        protocolPath: '/protocols/skill-service',
        page: { limit: 5, count: 0, hasMore: false },
        items: [],
      },
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        page: { limit: 5, count: 0, hasMore: false },
        items: [],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        page: { limit: 5, count: 0, hasMore: false },
        items: [],
      },
    ],
    warnings: [],
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
    if (String(url) === 'https://so.example.test/api/info/globalmetaid/idq1metaappowner') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 1,
          data: {
            globalMetaId: 'idq1metaappowner',
            name: 'MetaApp Owner',
            avatarId: metaAppOwnerAvatarId,
          },
        }),
      };
    }
    assert.equal(
      String(url),
      'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v3',
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: '', data: homepage }),
    };
  };
}

test('resolveBrowserResource enriches direct metaapp owners with bot profile name and avatar', async () => {
  const result = await resolveBrowserResource({
    uri: `metaapp://${customMetaAppPinId}`,
    config: browserConfig(),
    fetch: async (url) => {
      assert.equal(String(url), 'https://so.example.test/api/info/globalmetaid/idq1metaappowner');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 1,
          data: {
            globalMetaId: 'idq1metaappowner',
            name: 'MetaApp Owner',
            avatarId: metaAppOwnerAvatarId,
          },
        }),
      };
    },
    metaAppLookup: async (pinId) => {
      assert.equal(pinId, customMetaAppPinId);
      return metaAppRecord(pinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'metaapp');
  assert.equal(result.data.owner.globalMetaId, 'idq1metaappowner');
  assert.equal(result.data.owner.name, 'MetaApp Owner');
  assert.equal(
    result.data.owner.avatar,
    `https://file.metaid.io/metafile-indexer/content/${metaAppOwnerAvatarId}`,
  );
});

test('resolveBrowserResource enriches direct pin owners with bot profile name and avatar', async () => {
  const pinId = '8ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const ownerAvatarId = '9'.repeat(64) + 'i0';
  const result = await resolveBrowserResource({
    uri: `pin://${pinId}`,
    config: browserConfig(),
    fetch: async (url) => {
      if (String(url) === 'https://so.example.test/api/info/globalmetaid/idq1publisher') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 1,
            data: {
              globalMetaId: 'idq1publisher',
              name: 'Pin Owner',
              avatarId: ownerAvatarId,
            },
          }),
        };
      }
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/protocols/skill-service',
            operation: 'create',
            contentType: 'application/json',
            content: JSON.stringify({ name: 'Evidence Skill' }),
            ownerGlobalMetaId: 'idq1publisher',
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'pin');
  assert.equal(result.data.owner.globalMetaId, 'idq1publisher');
  assert.equal(result.data.owner.name, 'Pin Owner');
  assert.equal(
    result.data.owner.avatar,
    `https://file.metaid.io/metafile-indexer/content/${ownerAvatarId}`,
  );
});

test('resolveBrowserResource enriches direct metafile owners with bot profile name and avatar', async () => {
  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const ownerAvatarId = '8'.repeat(64) + 'i0';
  const result = await resolveBrowserResource({
    uri: `metafile://${pinId}.png`,
    config: browserConfig(),
    fetch: async (url) => {
      if (String(url) === 'https://so.example.test/api/info/globalmetaid/idq1fileowner') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 1,
            data: {
              globalMetaId: 'idq1fileowner',
              name: 'File Owner',
              avatarId: ownerAvatarId,
            },
          }),
        };
      }
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/file/image.png',
            contentTypeDetect: 'image/png',
            globalMetaId: 'idq1fileowner',
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
  assert.equal(result.data.resourceType, 'image');
  assert.equal(result.data.owner.globalMetaId, 'idq1fileowner');
  assert.equal(result.data.owner.name, 'File Owner');
  assert.equal(
    result.data.owner.avatar,
    `https://file.metaid.io/metafile-indexer/content/${ownerAvatarId}`,
  );
});

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
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v3',
  );
  assert.equal(result.data.source.raw.botHomepageRaw.profile.homepage.payload.uri, customHomepageUri);
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
  assert.equal(result.data.renderer.url, `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${customMetafilePinId}`);
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.aliasUri, 'metaid://idq1custombot');
  assert.equal(result.data.source.raw.customHomepageUri, customHomepageUri);
  assert.equal(
    result.data.source.raw.botHomepageSourceUrl,
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v3',
  );
  assert.deepEqual(fetchCalls, [
    'https://so.example.test/api/bot-homepage/globalmetaid/idq1custombot?version=v3',
    `https://man.example.test/pin/${customMetafilePinId}`,
  ]);
});

test('resolveBrowserResource uses built-in template when metaid uri requests botpage=default', async () => {
  let metaAppLookupCalled = false;
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot?botpage=default',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` })),
    metaAppLookup: async () => {
      metaAppLookupCalled = true;
      return metaAppRecord(customMetaAppPinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://idq1custombot?botpage=default');
  assert.equal(result.data.normalizedUri, 'metaid://idq1custombot?botpage=default');
  assert.equal(result.data.resourceType, 'bot');
  assert.equal(result.data.renderer.type, 'bot-page');
  assert.equal(metaAppLookupCalled, false);
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

test('resolveBrowserResource uses built-in template when custom is null or missing', async () => {
  const missingCustomHomepage = homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` });
  delete missingCustomHomepage.profile.homepage;

  for (const homepage of [
    homepageWithCustom(null),
    missingCustomHomepage,
  ]) {
    const result = await resolveBrowserResource({
      uri: 'metaid://idq1custombot',
      config: browserConfig(),
      fetch: homepageFetch(homepage),
      metaAppLookup: async () => {
        throw new Error('empty custom homepage should not resolve MetaApp');
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.resourceType, 'bot');
    assert.equal(result.data.renderer.type, 'bot-page');
  }
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

test('resolveBrowserResource fails closed when custom homepage target resolution fails', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaid://idq1custombot',
    config: browserConfig(),
    fetch: homepageFetch(homepageWithCustom({ uri: `metaapp://${customMetaAppPinId}` })),
    metaAppResolve: async (pinId) => {
      assert.equal(pinId, customMetaAppPinId);
      return {
        ok: false,
        code: 'browser_resource_not_found',
        message: 'Custom target not found.',
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resource_not_found');
  assert.equal(result.message, 'Custom target not found.');
});

test('resolveBrowserResource dispatches map URI to protocol resolver', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const result = await resolveBrowserResource({
    uri: `map://unknown-protocol/pin/${pinId}`,
    config: browserConfig(),
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/protocols/unknown-protocol',
            operation: 'create',
            contentType: 'text/plain',
            content: 'raw protocol body',
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.renderer.type, 'protocol-pin');
  assert.equal(result.data.renderer.data.rendererId, 'generic.protocol-pin');
});

test('resolveBrowserResource dispatches pin URI to generic pin resolver', async () => {
  const pinId = '8ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const result = await resolveBrowserResource({
    uri: `pin://${pinId}`,
    config: browserConfig(),
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${pinId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: pinId,
            path: '/protocols/skill-service',
            operation: 'create',
            contentType: 'application/json',
            content: JSON.stringify({ name: 'Evidence Skill', description: 'Readable through pin inspector.' }),
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.resourceType, 'pin');
  assert.equal(result.data.renderer.type, 'pin-inspector');
  assert.equal(result.data.renderer.data.rendererId, 'generic.pin-inspector');
  assert.equal(result.data.renderer.data.pin.path, '/protocols/skill-service');
});

const validEnsGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const validEnsMetaAppPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';

function ensProvider(canonicalUri, overrides = {}) {
  return {
    id: 'ens',
    supportsName: (name) => String(name).toLowerCase().endsWith('.eth'),
    async resolveNameAlias(request) {
      if (overrides.fail) {
        return { ok: false, code: overrides.fail.code, message: overrides.fail.message, data: { name: request.name } };
      }
      return {
        ok: true,
        state: 'success',
        data: {
          provider: 'ens',
          normalizedName: request.name.toLowerCase(),
          textKey: 'org.openagentinternet.uri',
          canonicalUri,
          resolvedAt: 1780761234567,
          verificationState: 'partial',
          raw: { source: 'test-ens' },
        },
      };
    },
  };
}

test('resolveBrowserResource resolves metaid ENS aliases while preserving visible URI', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  const result = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaid://${validEnsGlobalMetaId}`)],
    fetch: async (url) => {
      assert.equal(
        String(url),
        `https://so.example.test/api/bot-homepage/globalmetaid/${validEnsGlobalMetaId}?version=v3`,
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: '', data: fixture }),
      };
    },
    metaAppLookup: async () => null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaid://sunny.eth');
  assert.equal(result.data.normalizedUri, 'metaid://sunny.eth');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, `metaid://${validEnsGlobalMetaId}`);
  assert.equal(result.data.source.raw.nameAlias.provider, 'ens');
  assert.equal(result.data.actions.find((action) => action.id === 'copy-uri').uri, 'metaid://sunny.eth');
});

test('resolveBrowserResource resolves metaapp ENS aliases through MetaApp resolver', async () => {
  const result = await resolveBrowserResource({
    uri: 'metaapp://app.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaapp://${validEnsMetaAppPinId}`)],
    metaAppLookup: async (pinId) => {
      assert.equal(pinId, validEnsMetaAppPinId);
      return metaAppRecord(pinId);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'metaapp://app.sunny.eth');
  assert.equal(result.data.normalizedUri, 'metaapp://app.sunny.eth');
  assert.equal(result.data.resourceType, 'metaapp');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, `metaapp://${validEnsMetaAppPinId}`);
});

test('resolveBrowserResource dispatches map ENS aliases to injected map resolver', async () => {
  const canonicalMapUri = `map://simplebuzz/pin/${validEnsMetaAppPinId}`;
  const result = await resolveBrowserResource({
    uri: 'map://buzz.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(canonicalMapUri)],
    mapResolve: async (uri) => {
      assert.equal(uri, canonicalMapUri);
      return {
        ok: true,
        state: 'success',
        data: {
          uri,
          normalizedUri: uri,
          resourceType: 'unknown',
          title: 'Buzz Resource',
          owner: { kind: 'unknown', globalMetaId: '', name: 'Unknown', verificationState: 'partial' },
          renderer: { type: 'unsupported', contentType: 'application/vnd.metaid.map' },
          status: { state: 'resolved', verificationState: 'partial', message: 'Resolved MAP resource.' },
          source: { resolver: 'map-test', raw: { protocol: 'simplebuzz' } },
          actions: [{ id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri }],
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.uri, 'map://buzz.sunny.eth');
  assert.equal(result.data.normalizedUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.source.raw.nameAlias.canonicalUri, canonicalMapUri);
});

test('resolveBrowserResource rejects invalid MAP alias-like names before map resolver dispatch', async () => {
  let mapResolveCalled = false;
  const result = await resolveBrowserResource({
    uri: 'map://sunny..eth',
    config: browserConfig(),
    mapResolve: async () => {
      mapResolveCalled = true;
      return {
        ok: true,
        state: 'success',
        data: {
          uri: 'map://sunny..eth',
          normalizedUri: 'map://sunny..eth',
          resourceType: 'unknown',
          title: 'Invalid alias',
          owner: { kind: 'unknown', globalMetaId: '', name: 'Unknown', verificationState: 'partial' },
          renderer: { type: 'unsupported', contentType: 'application/vnd.metaid.map' },
          status: { state: 'resolved', verificationState: 'partial', message: 'Resolved MAP resource.' },
          source: { resolver: 'map-test' },
          actions: [],
        },
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_browser_uri');
  assert.equal(mapResolveCalled, false);
});

test('resolveBrowserResource preserves MAP alias context when built-in map resolver fails', async () => {
  const canonicalMapUri = `map://simplebuzz/pin/${validEnsMetaAppPinId}`;
  const result = await resolveBrowserResource({
    uri: 'map://buzz.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(canonicalMapUri)],
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${validEnsMetaAppPinId}`);
      return { ok: false, status: 503, json: async () => ({}) };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'browser_resolve_failed');
  assert.equal(result.data.inputUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.aliasUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.aliasName, 'buzz.sunny.eth');
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.canonicalUri, canonicalMapUri);
});

test('resolveBrowserResource preserves MAP alias context when map resolver fails', async () => {
  const canonicalMapUri = `map://simplebuzz/pin/${validEnsMetaAppPinId}`;
  const result = await resolveBrowserResource({
    uri: 'map://buzz.sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(canonicalMapUri)],
    mapResolve: async () => ({
      ok: false,
      state: 'failed',
      code: 'map_resolve_failed',
      message: 'MAP lookup failed.',
      data: { attempt: 1 },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'map_resolve_failed');
  assert.equal(result.data.attempt, 1);
  assert.equal(result.data.inputUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.aliasUri, 'map://buzz.sunny.eth');
  assert.equal(result.data.aliasName, 'buzz.sunny.eth');
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.canonicalUri, canonicalMapUri);
});

test('resolveBrowserResource reports direct MAP resolver availability without alias context', async () => {
  const canonicalMapUri = `map://simplebuzz/pin/${validEnsMetaAppPinId}`;
  let directMapResolveUri = '';
  const directResolved = await resolveBrowserResource({
    uri: canonicalMapUri,
    config: browserConfig(),
    mapResolve: async (uri) => {
      directMapResolveUri = uri;
      return {
        ok: true,
        state: 'success',
        data: {
          uri,
          normalizedUri: uri,
          resourceType: 'unknown',
          title: 'Buzz Resource',
          owner: { kind: 'unknown', globalMetaId: '', name: 'Unknown', verificationState: 'partial' },
          renderer: { type: 'unsupported', contentType: 'application/vnd.metaid.map' },
          status: { state: 'resolved', verificationState: 'partial', message: 'Resolved MAP resource.' },
          source: { resolver: 'map-test' },
          actions: [],
        },
      };
    },
  });

  assert.equal(directResolved.ok, true);
  assert.equal(directMapResolveUri, canonicalMapUri);

  const failedBuiltInResolver = await resolveBrowserResource({
    uri: canonicalMapUri,
    config: browserConfig(),
    fetch: async (url) => {
      assert.equal(String(url), `https://man.example.test/pin/${validEnsMetaAppPinId}`);
      return { ok: false, status: 503, json: async () => ({}) };
    },
  });

  assert.equal(failedBuiltInResolver.ok, false);
  assert.equal(failedBuiltInResolver.code, 'browser_resolve_failed');
  assert.equal(failedBuiltInResolver.data, undefined);
});

test('resolveBrowserResource fails closed for ENS alias errors', async () => {
  const missingProvider = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
  });
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.code, 'name_resolution_unavailable');

  const mismatch = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider(`metaapp://${validEnsMetaAppPinId}`)],
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'name_alias_scheme_mismatch');

  const providerFailure = await resolveBrowserResource({
    uri: 'metaid://sunny.eth',
    config: browserConfig(),
    nameAliasProviders: [ensProvider('', { fail: { code: 'name_alias_not_found', message: 'No record.' } })],
  });
  assert.equal(providerFailure.ok, false);
  assert.equal(providerFailure.code, 'name_alias_not_found');
  assert.equal(providerFailure.data.inputUri, 'metaid://sunny.eth');
  assert.equal(providerFailure.data.provider, 'ens');
  assert.equal(providerFailure.data.aliasName, 'sunny.eth');
});
