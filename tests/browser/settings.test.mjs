import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  createDefaultBrowserConfig,
  resolveBrowserConfig,
} = require('../../packages/core/dist/index.js');

test('Browser settings default to rendering custom Bot Pages globally', () => {
  const defaults = createDefaultBrowserConfig();
  const resolved = resolveBrowserConfig({});
  const snapshot = createBrowserSettingsSnapshot({ config: {} });

  assert.equal(defaults.renderCustomBotPages, true);
  assert.equal(resolved.renderCustomBotPages, true);
  assert.equal(snapshot.defaults.renderCustomBotPages, true);
  assert.equal(snapshot.effectiveBrowser.renderCustomBotPages, true);
});

test('Browser settings default Metafile content base to indexer root', () => {
  const defaults = createDefaultBrowserConfig();
  const resolved = resolveBrowserConfig({});
  const snapshot = createBrowserSettingsSnapshot({ config: {} });

  assert.equal(defaults.metafileContentBaseUrl, 'https://file.metaid.io/metafile-indexer');
  assert.equal(resolved.metafileContentBaseUrl, 'https://file.metaid.io/metafile-indexer');
  assert.equal(snapshot.defaults.metafileContentBaseUrl, 'https://file.metaid.io/metafile-indexer');
  assert.equal(snapshot.effectiveBrowser.metafileContentBaseUrl, 'https://file.metaid.io/metafile-indexer');
});

test('Browser settings update custom rendering and template as global browser fields', () => {
  const current = {
    browser: {
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
    },
  };

  const updated = applyBrowserSettingsUpdate(current, {
    botHomepageTemplateId: 'compact-list',
    renderCustomBotPages: false,
  });
  const snapshot = createBrowserSettingsSnapshot({ config: updated });

  assert.equal(updated.browser.botHomepageTemplateId, 'compact-list');
  assert.equal(updated.browser.renderCustomBotPages, false);
  assert.equal(snapshot.effectiveBrowser.botHomepageTemplateId, 'compact-list');
  assert.equal(snapshot.effectiveBrowser.renderCustomBotPages, false);
});

test('Browser settings reject non-boolean custom rendering values', () => {
  assert.throws(
    () => applyBrowserSettingsUpdate({}, { renderCustomBotPages: 'false' }),
    /browser\.renderCustomBotPages must be a boolean/,
  );
});

test('Browser settings default name resolution on with ENS disabled until RPC URLs exist', () => {
  const defaults = createDefaultBrowserConfig();
  const resolved = resolveBrowserConfig({});
  const snapshot = createBrowserSettingsSnapshot({ config: {} });

  assert.equal(defaults.nameResolution.enabled, true);
  assert.equal(defaults.nameResolution.ens.enabled, false);
  assert.deepEqual(defaults.nameResolution.ens.rpcUrls, []);
  assert.equal(defaults.nameResolution.ens.textKey, 'org.openagentinternet.uri');
  assert.equal(resolved.nameResolution.enabled, true);
  assert.equal(resolved.nameResolution.ens.enabled, false);
  assert.equal(snapshot.effectiveBrowser.nameResolution.ens.textKey, 'org.openagentinternet.uri');
});

test('Browser settings resolve ENS config from env and browser settings', () => {
  const resolved = resolveBrowserConfig({
    browser: {
      nameResolution: {
        enabled: true,
        ens: {
          enabled: true,
          rpcUrls: ['https://configured.example/rpc'],
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  }, {
    METABOT_BROWSER_ENS_RPC_URLS: 'https://env-one.example/rpc, https://env-two.example/rpc',
  });

  assert.equal(resolved.nameResolution.enabled, true);
  assert.equal(resolved.nameResolution.ens.enabled, true);
  assert.deepEqual(resolved.nameResolution.ens.rpcUrls, [
    'https://env-one.example/rpc',
    'https://env-two.example/rpc',
  ]);
  assert.equal(resolved.nameResolution.ens.textKey, 'org.openagentinternet.uri');
});

test('Browser settings update and validate name resolution fields', () => {
  const updated = applyBrowserSettingsUpdate({}, {
    nameResolution: {
      enabled: true,
      ens: {
        enabled: true,
        rpcUrls: ['https://rpc.example'],
        textKey: 'org.openagentinternet.uri',
      },
    },
  });
  const snapshot = createBrowserSettingsSnapshot({ config: updated });

  assert.equal(snapshot.effectiveBrowser.nameResolution.enabled, true);
  assert.equal(snapshot.effectiveBrowser.nameResolution.ens.enabled, true);
  assert.deepEqual(snapshot.effectiveBrowser.nameResolution.ens.rpcUrls, ['https://rpc.example']);

  assert.throws(
    () => applyBrowserSettingsUpdate({}, { nameResolution: { ens: { rpcUrls: ['not-a-url'] } } }),
    /browser\.nameResolution\.ens\.rpcUrls must contain http\(s\) URLs/,
  );
  assert.throws(
    () => applyBrowserSettingsUpdate({}, { nameResolution: { ens: { textKey: '' } } }),
    /browser\.nameResolution\.ens\.textKey must be a non-empty string/,
  );
});
