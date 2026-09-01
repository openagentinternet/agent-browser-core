import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');
const stylesSource = readFileSync(new URL('../../packages/ui/src/browserStyles.ts', import.meta.url), 'utf8');
const stylesMatch = stylesSource.match(/export const BROWSER_PAGE_STYLES = `([\s\S]*)`;\n?$/);
assert.ok(stylesMatch, 'missing BROWSER_PAGE_STYLES export');
const stylesTemplate = stylesMatch[1];

const templateSource = readFileSync(new URL('../../packages/ui/src/browser/indexHtml.ts', import.meta.url), 'utf8');
const templateMatch = templateSource.match(/export const BROWSER_INDEX_HTML = (.*);\n?$/s);
assert.ok(templateMatch, 'missing BROWSER_INDEX_HTML export');
const template = JSON.parse(templateMatch[1]);

test('Browser root API renders the mature fixed chrome shell asynchronously', async () => {
  const definition = ui.buildBrowserPageDefinition();
  const html = await ui.renderBrowserPageHtml(definition);

  assert.match(html, /Agent Internet Browser/);
  assert.match(html, /data-browser-shell/);
  assert.match(html, /class="browser-tabstrip"/);
  assert.match(html, /data-browser-tabs-container/);
  assert.match(html, /data-browser-tab-new/);
  assert.match(html, /data-browser-page-title/);
  assert.match(html, /class="browser-topbar"/);
  assert.match(html, /data-browser-uri-input/);
  assert.match(html, /data-browser-using-selector/);
  assert.match(html, /data-browser-resource-chip/);
  assert.match(html, /data-browser-menu-trigger/);
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
  assert.match(template, /\.browser-modal-panel \{/);
  assert.match(template, /\.browser-custom-pages-setting \{/);
  assert.match(template, /\.browser-modal-panel \.browser-help-icon/);
  assert.match(template, /\.browser-help-tooltip \{/);
  assert.match(template, /\.browser-help-icon \.browser-info-dot \{/);
  assert.match(template, /\.browser-help-wrap:hover \.browser-help-tooltip/);
  assert.match(template, /\.browser-switch-track \{/);
  assert.match(template, /\.browser-switch-thumb \{/);
  assert.match(template, /\.browser-switch\[aria-checked="true"\] \.browser-switch-track/);
  assert.match(template, /\.browser-settings-section-label \{/);
  assert.match(template, /\.browser-address-form input:focus-visible \{\n        outline: none;\n        outline-offset: 0;\n      \}/);
  assert.match(html, /body:has\(\.browser-shell\)/);
  assert.match(html, /\.browser-app-panel-meta \{[\s\S]*?padding: 0 10px;[\s\S]*?font-size: 11px;/);
  assert.match(html, /\.browser-address-form \.browser-app-panel \.browser-owner-panel-copy \{[\s\S]*?margin-left: auto;[\s\S]*?border: none;[\s\S]*?background: transparent;/);
  assert.match(html, /\.browser-address-form \.browser-app-panel \.browser-owner-panel-item \{[\s\S]*?justify-content: flex-start;[\s\S]*?width: 100%;[\s\S]*?padding: 8px 10px;[\s\S]*?border: none;[\s\S]*?background: transparent;/);
  assert.match(html, /\.browser-app-share-label \{[\s\S]*?font-size: 11px;/);
  assert.match(html, /\.browser-modal-panel \.browser-app-share-copy \{[\s\S]*?flex: 0 0 28px;[\s\S]*?padding: 0 !important;/);
  assert.match(html, /\.browser-app-share-copy \.browser-icon \{[\s\S]*?width: 20px !important;[\s\S]*?min-width: 20px;/);
  assert.match(html, /\.browser-app-share-composer \{\n        align-items: flex-end;/);
  assert.match(html, /\.browser-modal-body \.browser-app-share-composer textarea \{[\s\S]*?height: 96px;/);
  assert.match(html, /\.browser-modal-panel \.browser-app-share-buzz \{\n        align-self: flex-end;/);
  assert.match(html, /\.browser-modal-panel \.browser-app-share-buzz \{[\s\S]*?background: var\(--browser-surface\);[\s\S]*?color: var\(--browser-text\);/);
  assert.doesNotMatch(html, /__PAGE_CONTENT__|__PAGE_TITLE__|__PAGE_SCRIPT__/);
});

test('Browser client script exposes mature endpoints and path/default URI boot logic', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /var browserEndpoints = \{/);
  assert.match(definition.script, /runtime: '\/api\/browser\/runtime'/);
  assert.match(definition.script, /resolve: '\/api\/browser\/resolve'/);
  assert.match(definition.script, /info: '\/api\/browser\/info'/);
  assert.match(definition.script, /settings: '\/api\/browser\/settings'/);
  assert.match(definition.script, /cache: '\/api\/browser\/cache'/);
  assert.match(definition.script, /actions: '\/api\/browser\/actions'/);
  assert.match(definition.script, /function decodeURIComponentSafe\(value\)/);
  assert.match(definition.script, /function browserUriFromPath\(pathname, search\)/);
  assert.match(definition.script, /var mapMatch = path\.match\(/);
  assert.match(definition.script, /browser\\\/map/);
  assert.match(definition.script, /return mapId \? 'map:\/\/' \+ mapId \+ textValue\(search\) : '';/);
  assert.match(definition.script, /var queryUri = new URLSearchParams\(window\.location\.search \|\| ''\)\.get\('uri'\) \|\| '';/);
  assert.match(definition.script, /var pathUri = queryUri \? '' : browserUriFromPath\(window\.location && window\.location\.pathname, window\.location && window\.location\.search\);/);
  assert.match(definition.script, /if \(runtime && runtime\.defaultUri\) \{/);
  assert.match(definition.script, /globalThis\.browserUriFromPath = browserUriFromPath;/);
  assert.match(definition.script, /globalThis\.browserEndpoints = browserEndpoints;/);
});

test('Browser client script includes mature renderer, modal, and chat flows', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function renderBotHomepageDocumentTemplate\(payload, current\)/);
  assert.match(definition.script, /function renderBotHomepageCompactListTemplate\(payload, current\)/);
  assert.match(definition.script, /function renderRenderer\(current\)/);
  assert.match(definition.script, /function openUsingIdentitySelector\(\)/);
  assert.match(definition.script, /async function selectBotHomepageTemplate\(templateId\)/);
  assert.match(definition.script, /async function toggleCustomBotPages\(\)/);
  assert.match(definition.script, /state\.pendingPrivateChat = \{/);
  assert.match(definition.script, /state\.pendingServiceCall = \{/);
  assert.match(definition.script, /browser-drawer/);
  assert.match(definition.script, /browser-inspector/);
  assert.match(definition.script, /function htmlFrameSandbox/);
  assert.match(definition.script, /'allow-scripts allow-downloads'/);
  assert.match(definition.script, /'allow-scripts allow-same-origin allow-downloads'/);
});

test('Browser page HTML preserves inline script text containing dollar signs', async () => {
  const definition = {
    ...ui.buildBrowserPageDefinition(),
    script: "const marker = '$\\''; window.__browserMarker = marker;",
  };

  const html = await ui.renderBrowserPageHtml(definition);

  // The body app script (with the dollar-sign content) is preserved verbatim.
  // The head theme-init script is separate, so there are now two </script>.
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  assert.equal((html.match(/window\.__browserMarker = marker;/g) || []).length, 1);
  assert.doesNotMatch(html, /<body>[\s\S]*<script>\s*const marker = '\$\'';\s*<\/script>[\s\S]*<\/body>/);
});

test('Browser page HTML remains English-only when a host passes zh-CN', async () => {
  const definition = ui.buildBrowserPageDefinition();
  const html = await ui.renderBrowserPageHtml(definition, 'zh-CN');

  assert.match(html, /<html lang="en" data-browser-theme="light"/);
  assert.doesNotMatch(html, /<html lang="zh-CN"/);
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(definition.script, /[\u4e00-\u9fff]/);
});

test('Browser loading feedback renders reload spinner and fade-in CSS', async () => {
  const html = await ui.renderBrowserPageHtml();

  assert.match(template, /\.browser-icon-button\.is-loading \{/);
  assert.match(template, /\.browser-icon-button\.is-loading::after \{/);
  assert.match(template, /animation: browser-spin \.8s linear infinite/);
  assert.match(template, /@keyframes browser-spin/);

  assert.match(template, /\.browser-viewport\.is-entering > \*/);
  assert.match(template, /@keyframes browser-enter/);
  assert.match(template, /from \{ opacity: 0; transform: translateY\(6px\); \}/);

  // CSS also surfaces in the rendered HTML (styles are inlined into the shell).
  assert.match(html, /browser-spin/);
});

test('Browser client script exposes loading-state helpers', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function showLoadingState\(\)/);
  assert.match(definition.script, /function clearLoadingState\(\)/);
  assert.match(definition.script, /function triggerEnterAnimation\(node\)/);

  // Loading state clears the active tab's content pane (no skeleton markup) and
  // sets the per-tab loading flag so the reload spinner reflects this tab only.
  assert.match(definition.script, /pane\.innerHTML = '';/);
  assert.match(definition.script, /function syncLoadingButton\(/);

  assert.match(definition.script, /function clearLoadingState\(\) \{[\s\S]*?syncLoadingButton\(\);/);
  assert.match(definition.script, /elements\.reload\.classList\.remove\('is-loading'\)/);
  assert.match(definition.script, /void node\.offsetWidth;/);
  // Enter animation now targets the active tab's pane (per-tab content model).
  assert.match(definition.script, /triggerEnterAnimation\(pane\);/);
});

test('Browser resolveUri wires showLoadingState before await and clearLoadingState in both paths', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /state\.lastResolveError = null;\s*showLoadingState\(\);\s*try \{/);
  assert.match(definition.script, /renderCurrent\(\);\s*clearLoadingState\(\);/);
  assert.match(definition.script, /\} catch \(error\) \{\s*clearLoadingState\(\);/);
});

test('Browser client script exposes chat peer metadata markers', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function normalizeBotHomepageChats\(items, identity\)/);
  assert.match(definition.script, /var partnerGlobalMetaId = textValue\(peer\.globalMetaId \|\| peer\.globalMetaID \|\| peer\.globalmetaid \|\| \(chat && chat\.interactWith\)\);/);
  assert.match(definition.script, /partnerHref: partnerGlobalMetaId \? \('metaid:\/\/' \+ partnerGlobalMetaId\) : ''/);
  assert.match(definition.script, /data-chat-peer/);
  assert.match(definition.script, /data-chat-partner/);
});

test('Browser modal templates use icon close buttons and dedicated footer action groups', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /class="browser-icon-button" data-browser-modal-close aria-label="/);
  assert.doesNotMatch(definition.script, /data-browser-modal-close aria-label="[^"]*">Close<\/button>/);
  assert.match(definition.script, /browser-modal-footer-end/);
  assert.match(definition.script, /data-browser-modal-close>\s*' \+ escapeHtml\(browserText\('modal\.cancel', 'Cancel'\)\)/);
  assert.match(definition.script, /data-browser-modal-confirm data-browser-modal-action=/);
  assert.match(stylesTemplate, /\.browser-modal-footer-start, \.browser-modal-footer-end \{ display: inline-flex; align-items: center; gap: 12px; \}/);
});
