import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');
const {
  OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
  isSupportedNameAliasId,
  resolveBrowserNameAlias,
  validateNameAliasCanonicalTarget,
} = require('../../packages/core/dist/browser/nameAlias.js');

const validGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const validPinId = 'c06b7a2db6efa241560a2356e9966cf9758dae3ec9c795f614a652b113e30329i0';

test('ENS alias detection accepts .eth names and subnames only', () => {
  assert.equal(OPEN_AGENT_INTERNET_ENS_TEXT_KEY, 'org.openagentinternet.uri');
  assert.equal(isSupportedNameAliasId('sunny.eth'), true);
  assert.equal(isSupportedNameAliasId('app.sunny.eth'), true);
  assert.equal(isSupportedNameAliasId('SUNNY.ETH'), true);
  assert.equal(isSupportedNameAliasId('bücher.eth'), true);
  assert.equal(isSupportedNameAliasId('sunny.com'), false);
  assert.equal(isSupportedNameAliasId('sunny.eth/path'), false);
  assert.equal(isSupportedNameAliasId('sunny..eth'), false);
});

test('canonical target validation accepts same-scheme metaid targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: ` metaid://${validGlobalMetaId} `,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metaid://${validGlobalMetaId}`);
});

test('canonical target validation accepts same-scheme metaapp targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'metaapp',
    aliasName: 'app.sunny.eth',
    canonicalUri: `metaapp://${validPinId}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `metaapp://${validPinId}`);
});

test('canonical target validation accepts concrete same-scheme map targets', () => {
  const result = validateNameAliasCanonicalTarget({
    inputScheme: 'map',
    aliasName: 'buzz.sunny.eth',
    canonicalUri: `map://simplebuzz/pin/${validPinId}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.normalizedUri, `map://simplebuzz/pin/${validPinId}`);
});

test('canonical target validation rejects scheme mismatch, recursive aliases, and invalid values', () => {
  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: validGlobalMetaId,
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metafile',
    aliasName: 'file.sunny.eth',
    canonicalUri: `metafile://${validPinId}`,
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: `metaapp://${validPinId}`,
  }).code, 'name_alias_scheme_mismatch');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: 'metaid://other.eth',
  }).code, 'name_alias_recursive');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaid',
    aliasName: 'sunny.eth',
    canonicalUri: 'https://example.com',
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'metaapp',
    aliasName: 'app.sunny.eth',
    canonicalUri: 'metaapp://not-a-pin',
  }).code, 'invalid_name_alias_target');

  assert.equal(validateNameAliasCanonicalTarget({
    inputScheme: 'map',
    aliasName: 'buzz.sunny.eth',
    canonicalUri: 'map://other.eth',
  }).code, 'name_alias_recursive');
});

test('name alias resolution skips unsupported schemes before provider lookup', async () => {
  let called = false;
  const parsed = parseBrowserUri('metafile://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: () => true,
      async resolveNameAlias() {
        called = true;
        throw new Error('should not resolve metafile aliases');
      },
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data, null);
  assert.equal(called, false);
});
