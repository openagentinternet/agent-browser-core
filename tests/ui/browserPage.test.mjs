import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');

const templateSource = readFileSync(new URL('../../packages/ui/src/browser/indexHtml.ts', import.meta.url), 'utf8');
const templateMatch = templateSource.match(/export const BROWSER_INDEX_HTML = (.*);\n?$/s);
assert.ok(templateMatch, 'missing BROWSER_INDEX_HTML export');
const template = JSON.parse(templateMatch[1]);

test('Browser root API renders the mature fixed chrome shell asynchronously', async () => {
  const definition = ui.buildBrowserPageDefinition();
  const html = await ui.renderBrowserPageHtml(definition);

  assert.match(html, /Agent Internet Browser/);
  assert.match(html, /data-browser-shell/);
  assert.match(html, /class="browser-titlebar"/);
  assert.match(html, /class="browser-topbar"/);
  assert.match(html, /data-browser-uri-input/);
  assert.match(html, /data-browser-using-selector/);
  assert.match(html, /data-browser-resource-chip/);
  assert.match(html, /data-browser-menu-trigger/);
  assert.match(html, /data-browser-owner-toolbar/);
  assert.match(html, /data-browser-viewport/);
  assert.match(html, /data-browser-inspector/);
  assert.match(html, /data-browser-status-strip/);
  assert.match(html, /data-browser-modal-root/);
  assert.match(html, /TXID: -/);
});

test('Browser root API uses the generated mature inline CSS template', async () => {
  const html = await ui.renderBrowserPageHtml();

  assert.match(template, /body:has\(\.browser-shell\) \{\n        height: 100vh;\n        min-height: 100vh;\n        overflow: hidden;/);
  assert.match(template, /\.browser-shell \{\n        --browser-bg: #f4f6f9;/);
  assert.match(template, /\.browser-viewport \{\n        grid-row: 1;\n        grid-column: 1;/);
  assert.match(template, /\.browser-owner-toolbar \{/);
  assert.match(template, /\.browser-modal-panel \{/);
  assert.match(template, /\.browser-custom-pages-setting \{/);
  assert.match(template, /\.browser-help-icon \{/);
  assert.match(template, /\.browser-help-tooltip \{/);
  assert.match(template, /\.browser-help-wrap:hover \.browser-help-tooltip/);
  assert.match(template, /\.browser-switch-track \{/);
  assert.match(template, /\.browser-switch-thumb \{/);
  assert.match(template, /\.browser-switch\[aria-checked="true"\] \.browser-switch-track/);
  assert.match(template, /\.browser-settings-section-label \{/);
  assert.match(template, /\.browser-address-form input:focus-visible \{\n        outline: none;\n        outline-offset: 0;\n      \}/);
  assert.match(html, /body:has\(\.browser-shell\)/);
  assert.doesNotMatch(html, /__PAGE_CONTENT__|__PAGE_TITLE__|__PAGE_SCRIPT__/);
});

test('Browser client script exposes mature endpoints and path/default URI boot logic', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /var browserEndpoints = \{/);
  assert.match(definition.script, /runtime: '\/api\/browser\/runtime'/);
  assert.match(definition.script, /resolve: '\/api\/browser\/resolve'/);
  assert.match(definition.script, /settings: '\/api\/browser\/settings'/);
  assert.match(definition.script, /cache: '\/api\/browser\/cache'/);
  assert.match(definition.script, /actions: '\/api\/browser\/actions'/);
  assert.match(definition.script, /function browserUriFromPath\(pathname\)/);
  assert.match(definition.script, /var queryUri = new URLSearchParams\(window\.location\.search \|\| ''\)\.get\('uri'\) \|\| '';/);
  assert.match(definition.script, /var pathUri = queryUri \? '' : browserUriFromPath\(window\.location && window\.location\.pathname\);/);
  assert.match(definition.script, /if \(runtime && runtime\.defaultUri\) \{/);
  assert.match(definition.script, /globalThis\.browserUriFromPath = browserUriFromPath;/);
  assert.match(definition.script, /globalThis\.browserEndpoints = browserEndpoints;/);
});

test('Browser client script includes mature renderer, modal, owner, and share flows', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function renderBotHomepageDocumentTemplate\(payload, current\)/);
  assert.match(definition.script, /function renderBotHomepageCompactListTemplate\(payload, current\)/);
  assert.match(definition.script, /function renderRenderer\(current\)/);
  assert.match(definition.script, /function openUsingIdentitySelector\(\)/);
  assert.match(definition.script, /async function selectBotHomepageTemplate\(templateId\)/);
  assert.match(definition.script, /async function toggleCustomBotPages\(\)/);
  assert.match(definition.script, /state\.pendingPrivateChat = \{/);
  assert.match(definition.script, /state\.pendingServiceCall = \{/);
  assert.match(definition.script, /data-browser-owner-action="share"/);
  assert.match(definition.script, /data-browser-share-copy=/);
  assert.match(definition.script, /browser-drawer/);
  assert.match(definition.script, /browser-inspector/);
  assert.match(definition.script, /browser-html-frame" sandbox="allow-scripts"/);
});
