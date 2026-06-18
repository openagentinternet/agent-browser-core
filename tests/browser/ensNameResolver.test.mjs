import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createEnsOpenAgentInternetResolver } = require('../../packages/name-resolvers/dist-cjs/index.js');

test('ENS provider supports only .eth aliases', () => {
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc.example'],
    transportFactory: () => ({
      async getEnsText() {
        return null;
      },
    }),
  });

  assert.equal(provider.id, 'ens');
  assert.equal(provider.supportsName('sunny.eth'), true);
  assert.equal(provider.supportsName('app.sunny.eth'), true);
  assert.equal(provider.supportsName('sunny.com'), false);
});

test('ENS provider returns canonical URI from org.openagentinternet.uri text record', async () => {
  const calls = [];
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc.example'],
    now: () => 1780761234567,
    transportFactory: (rpcUrl) => ({
      async getEnsText(input) {
        calls.push({ rpcUrl, input });
        return ' metaid://idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n ';
      },
    }),
  });

  const result = await provider.resolveNameAlias({
    inputUri: 'metaid://SUNNY.ETH',
    inputScheme: 'metaid',
    name: 'SUNNY.ETH',
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.provider, 'ens');
  assert.equal(result.data.normalizedName, 'sunny.eth');
  assert.equal(result.data.textKey, 'org.openagentinternet.uri');
  assert.equal(result.data.canonicalUri, 'metaid://idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n');
  assert.equal(result.data.resolvedAt, 1780761234567);
  assert.equal(result.data.verificationState, 'partial');
  assert.deepEqual(calls, [{
    rpcUrl: 'https://rpc.example',
    input: { name: 'sunny.eth', key: 'org.openagentinternet.uri' },
  }]);
});

test('ENS provider falls back across RPC URLs and reports missing records', async () => {
  const calls = [];
  const provider = createEnsOpenAgentInternetResolver({
    rpcUrls: ['https://rpc-one.example', 'https://rpc-two.example'],
    transportFactory: (rpcUrl) => ({
      async getEnsText(input) {
        calls.push({ rpcUrl, input });
        if (rpcUrl.includes('one')) {
          throw new Error('first RPC failed');
        }
        return null;
      },
    }),
  });

  const result = await provider.resolveNameAlias({
    inputUri: 'metaid://sunny.eth',
    inputScheme: 'metaid',
    name: 'sunny.eth',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'name_alias_not_found');
  assert.equal(calls.length, 2);
});
