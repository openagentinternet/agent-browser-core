import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

for (const modulePath of [
  '../../packages/ui/dist-cjs/index.js',
  '../../packages/ui/dist-cjs/browser/index.js',
]) {
  test(`${modulePath} exports the Browser Library host message contract`, () => {
    const ui = require(modulePath);
    assert.equal(ui.BROWSER_LIBRARY_MESSAGE_VERSION, 1);
    assert.deepEqual(ui.BROWSER_LIBRARY_REQUEST_TYPES, {
      snapshot: 'agent-browser:get-library',
      bookmarks: 'agent-browser:get-bookmarks',
      history: 'agent-browser:get-history',
      recentBots: 'agent-browser:get-recent-bots',
      recentUris: 'agent-browser:get-recent-uris',
      identityGrants: 'agent-browser:get-identity-grants',
    });
  });
}
