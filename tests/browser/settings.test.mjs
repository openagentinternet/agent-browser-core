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
