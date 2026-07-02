import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createBrowserNameAliasProviders } = require('../../packages/name-resolvers/dist-cjs/index.js');
const { resolveBrowserConfig, createDefaultBrowserConfig } = require('../../packages/core/dist-cjs/index.js');

function buildConfig(overrides = {}) {
  const base = {
    browser: {
      ...(overrides.browser ?? {}),
    },
  };
  return resolveBrowserConfig(base, overrides.env ?? {});
}

function fakeProvider(id = 'custom') {
  return {
    id,
    supportsName: () => true,
    async resolveNameAlias() {
      return { ok: true, state: 'success', data: {} };
    },
  };
}

test('createBrowserNameAliasProviders returns the built-in ENS provider when ENS is enabled', () => {
  const providers = createBrowserNameAliasProviders({
    config: buildConfig(),
  });
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'ens');
});

test('createBrowserNameAliasProviders returns no providers when name resolution is disabled', () => {
  const providers = createBrowserNameAliasProviders({
    config: buildConfig({ browser: { nameResolution: { enabled: false, ens: { enabled: true } } } }),
  });
  assert.deepEqual(providers, []);
});

test('createBrowserNameAliasProviders returns no providers when ENS is disabled', () => {
  const providers = createBrowserNameAliasProviders({
    config: buildConfig({
      browser: { nameResolution: { enabled: true, ens: { enabled: false, rpcUrls: ['https://rpc.example'] } } },
    }),
  });
  assert.deepEqual(providers, []);
});

test('createBrowserNameAliasProviders keeps host-configured providers as-is when ENS is enabled', () => {
  const custom = fakeProvider('custom');
  const providers = createBrowserNameAliasProviders({
    config: buildConfig(),
    configured: [custom],
  });
  assert.equal(providers.length, 1);
  assert.equal(providers[0], custom);
});

test('createBrowserNameAliasProviders filters built-in ENS provider out of configured providers when ENS is disabled', () => {
  const ens = fakeProvider('ens');
  const custom = fakeProvider('custom');
  const providers = createBrowserNameAliasProviders({
    config: buildConfig({
      browser: { nameResolution: { enabled: true, ens: { enabled: false, rpcUrls: ['https://rpc.example'] } } },
    }),
    configured: [ens, custom],
  });
  assert.equal(providers.length, 1);
  assert.equal(providers[0], custom);
});

test('createBrowserNameAliasProviders honors the ENS factory override', () => {
  let called = 0;
  const providers = createBrowserNameAliasProviders({
    config: buildConfig(),
    ensNameAliasProviderFactory: (config) => {
      called += 1;
      const provider = fakeProvider('ens-override');
      assert.equal(config.rpcUrls.length, 1);
      return provider;
    },
  });
  assert.equal(called, 1);
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'ens-override');
});

test('createBrowserNameAliasProviders applies defaults from createDefaultBrowserConfig', () => {
  // The core default enables name resolution and ENS, so providers should be
  // returned without any host configuration. This is the contract OAC/IDBots
  // rely on so ENS names resolve out of the box.
  const defaults = createDefaultBrowserConfig();
  const providers = createBrowserNameAliasProviders({ config: defaults });
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, 'ens');
});
