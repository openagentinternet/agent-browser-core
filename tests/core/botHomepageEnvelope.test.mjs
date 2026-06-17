import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

async function fixture() {
  return JSON.parse(await readFile(new URL('../fixtures/botHomepage.v3.json', import.meta.url), 'utf8'));
}

test('buildBotHomepageEnvelope maps profile, proof, actions, and future lists', async () => {
  const homepage = await fixture();
  const result = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
    resolverUrl: 'https://so.example.test/api/bot-homepage/globalmetaid/idq1fixturebot',
    templateId: 'compact-list',
    fetchedAt: 1780840000000,
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });

  assert.equal(result.resourceType, 'bot');
  assert.equal(result.title, 'Fixture Bot');
  assert.equal(result.owner.globalMetaId, 'idq1fixturebot');
  assert.equal(result.owner.avatar, 'https://file.metaid.io/metafile-indexer/content/avatar-pin');
  assert.equal(result.renderer.type, 'bot-page');
  assert.equal(result.renderer.templateId, 'compact-list');
  assert.equal(result.status.state, 'resolved');
  assert.equal(result.proof.pinId, 'name-pin');
  assert.equal(result.proof.protocolPath, '/info/name');
  assert.equal(result.source.resolver, 'bot-homepage');
  assert.equal(result.source.schemaVersion, 'botHomepage.v3');
  assert.equal(result.actions.some((action) => action.kind === 'private-chat'), true);
  assert.equal(result.actions.some((action) => action.kind === 'service-call'), true);
  assert.deepEqual(result.sections.map((section) => section.kind), [
    'services',
    'buzzes',
    'apps',
  ]);
});

test('buildBotHomepageEnvelope falls back to document template for unknown template id', async () => {
  const result = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage: await fixture(),
    templateId: 'missing',
  });

  assert.equal(result.renderer.templateId, 'document');
});
