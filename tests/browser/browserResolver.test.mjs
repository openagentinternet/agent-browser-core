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
