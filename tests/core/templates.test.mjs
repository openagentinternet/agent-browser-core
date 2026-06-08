import assert from 'node:assert/strict';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');

test('built-in Bot homepage templates expose stable metadata', () => {
  assert.deepEqual(core.BOT_HOMEPAGE_TEMPLATES.map((template) => template.id), [
    'document',
    'compact-list',
  ]);
  for (const template of core.BOT_HOMEPAGE_TEMPLATES) {
    assert.equal(typeof template.name, 'string');
    assert.equal(typeof template.description, 'string');
    assert.match(template.previewImage, /^builtin:\/\//);
  }
});

test('template id normalization falls back to the default template', () => {
  assert.equal(core.normalizeBotHomepageTemplateId('compact-list'), 'compact-list');
  assert.equal(core.normalizeBotHomepageTemplateId('missing-template'), 'document');
});
