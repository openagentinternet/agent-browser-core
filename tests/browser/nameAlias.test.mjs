import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseBrowserUri } = require('../../packages/core/dist/browser/uri.js');
const {
  OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
  aliasBrowserResolveResult,
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

test('name alias resolution reports unavailable provider with alias context', async () => {
  const parsed = parseBrowserUri('metaid://sunny.eth');
  const result = await resolveBrowserNameAlias({ parsed, providers: [] });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'name_resolution_unavailable');
  assert.equal(result.data.inputUri, 'metaid://sunny.eth');
  assert.equal(result.data.aliasName, 'sunny.eth');
});

test('name alias resolution returns canonical alias context after provider validation', async () => {
  const parsed = parseBrowserUri('metaid://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: (name) => name === 'sunny.eth',
      async resolveNameAlias() {
        return {
          ok: true,
          state: 'success',
          data: {
            provider: 'ens',
            normalizedName: 'sunny.eth',
            textKey: OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
            canonicalUri: ` metaid://${validGlobalMetaId} `,
            resolvedAt: 123,
            verificationState: 'verified',
            raw: { source: 'test' },
          },
        };
      },
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.aliasUri, 'metaid://sunny.eth');
  assert.equal(result.data.canonicalUri, `metaid://${validGlobalMetaId}`);
  assert.equal(result.data.canonicalParsed.normalizedUri, `metaid://${validGlobalMetaId}`);
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.normalizedName, 'sunny.eth');
  assert.deepEqual(result.data.raw, { source: 'test' });
});

test('name alias resolution preserves context on provider command failure', async () => {
  const parsed = parseBrowserUri('metaid://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: () => true,
      async resolveNameAlias() {
        return {
          ok: false,
          state: 'failed',
          code: 'ens_timeout',
          message: 'ENS lookup timed out.',
          data: { attempt: 1 },
        };
      },
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ens_timeout');
  assert.equal(result.data.attempt, 1);
  assert.equal(result.data.inputUri, 'metaid://sunny.eth');
  assert.equal(result.data.aliasName, 'sunny.eth');
  assert.equal(result.data.provider, 'ens');
});

test('name alias resolution converts supportsName exceptions into command failures', async () => {
  const parsed = parseBrowserUri('metaid://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName() {
        throw new Error('ENS provider unavailable');
      },
      async resolveNameAlias() {
        throw new Error('should not resolve after supportsName failure');
      },
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'name_resolution_failed');
  assert.equal(result.data.inputUri, 'metaid://sunny.eth');
  assert.equal(result.data.aliasName, 'sunny.eth');
  assert.equal(result.data.provider, 'ens');
  assert.match(result.message, /ENS provider unavailable/u);
});

test('name alias resolution converts resolveNameAlias exceptions into command failures', async () => {
  const parsed = parseBrowserUri('metaid://sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: () => true,
      async resolveNameAlias() {
        throw new Error('ENS text lookup failed');
      },
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'name_resolution_failed');
  assert.equal(result.data.inputUri, 'metaid://sunny.eth');
  assert.equal(result.data.aliasName, 'sunny.eth');
  assert.equal(result.data.provider, 'ens');
  assert.match(result.message, /ENS text lookup failed/u);
});

test('name alias resolution preserves alias context on invalid provider canonical target', async () => {
  const parsed = parseBrowserUri('metaapp://app.sunny.eth');
  const result = await resolveBrowserNameAlias({
    parsed,
    providers: [{
      id: 'ens',
      supportsName: () => true,
      async resolveNameAlias() {
        return {
          ok: true,
          state: 'success',
          data: {
            provider: 'ens',
            normalizedName: 'app.sunny.eth',
            textKey: OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
            canonicalUri: 'metaapp://not-a-pin',
            resolvedAt: 123,
            verificationState: 'unverified',
          },
        };
      },
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_name_alias_target');
  assert.equal(result.data.inputUri, 'metaapp://app.sunny.eth');
  assert.equal(result.data.aliasName, 'app.sunny.eth');
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.canonicalUri, 'metaapp://not-a-pin');
});

test('aliasBrowserResolveResult preserves alias surface and stores alias metadata', () => {
  const canonicalUri = `metaid://${validGlobalMetaId}`;
  const result = aliasBrowserResolveResult({
    result: {
      uri: canonicalUri,
      normalizedUri: canonicalUri,
      resourceType: 'bot',
      title: 'Sunny',
      owner: {
        kind: 'bot',
        globalMetaId: validGlobalMetaId,
        name: 'Sunny',
        verificationState: 'verified',
      },
      renderer: {
        type: 'bot-page',
        contentType: 'text/html',
      },
      status: {
        state: 'resolved',
        verificationState: 'verified',
        message: 'Resolved.',
      },
      source: {
        resolver: 'test',
        raw: { existing: true },
      },
      actions: [
        { id: 'copy-uri', label: 'Copy URI', kind: 'copy', uri: canonicalUri },
        { id: 'open-proof', label: 'Open proof', kind: 'proof', uri: 'https://example.com/proof' },
      ],
    },
    alias: {
      aliasUri: 'metaid://sunny.eth',
      canonicalParsed: parseBrowserUri(canonicalUri),
      provider: 'ens',
      normalizedName: 'sunny.eth',
      textKey: OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
      canonicalUri,
      resolvedAt: 123,
      verificationState: 'verified',
      raw: { coinType: 0 },
    },
  });

  assert.equal(result.uri, 'metaid://sunny.eth');
  assert.equal(result.normalizedUri, 'metaid://sunny.eth');
  assert.equal(result.actions[0].uri, 'metaid://sunny.eth');
  assert.equal(result.actions[1].uri, 'https://example.com/proof');
  assert.deepEqual(result.source.raw.existing, true);
  assert.deepEqual(result.source.raw.nameAlias, {
    aliasUri: 'metaid://sunny.eth',
    provider: 'ens',
    normalizedName: 'sunny.eth',
    textKey: OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
    canonicalUri,
    resolvedAt: 123,
    verificationState: 'verified',
    raw: { coinType: 0 },
  });
});
