import assert from 'node:assert/strict';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');

test('client script includes runtime menu settings template cache and actor flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });
  const browserPageScript = ui.buildBrowserPageDefinition().script;

  assert.match(script, /const browserEndpoints = \{/);
  assert.match(script, /settings: apiBasePath \+ '\/settings'/);
  assert.match(script, /cache: apiBasePath \+ '\/cache'/);
  assert.match(script, /function renderBrowserMenu\(/);
  assert.match(script, /function openBrowserSettings\(/);
  assert.match(script, /function renderTemplateSettings\(/);
  assert.match(browserPageScript, /function renderNameResolutionSettings\(/);
  assert.match(script, /function toggleCustomBotPages\(/);
  assert.match(browserPageScript, /function saveNameResolutionSettings\(/);
  assert.match(script, /function clearBrowserCache\(/);
  assert.match(script, /function openActorSelector\(/);
  assert.match(script, /data-browser-settings-tab/);
  assert.match(script, /data-browser-template-select/);
  assert.match(script, /data-browser-custom-pages-toggle/);
  assert.match(browserPageScript, /data-browser-name-resolution-enabled/);
  assert.match(browserPageScript, /data-browser-ens-rpc-urls/);
  assert.match(script, /data-browser-custom-pages-help/);
  assert.match(script, /browser-help-tooltip/);
  assert.match(script, /browser-info-dot/);
  assert.match(script, /browser-switch-track/);
  assert.match(script, /browser-switch-thumb/);
  assert.match(script, /data-browser-cache-clear/);
  assert.match(script, /data-browser-actor-id/);
});

test('shared shell exposes menu and modal roots used by client script', async () => {
  const html = await ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition());

  assert.match(html, /data-browser-menu-trigger/);
  assert.match(html, /data-browser-menu role="menu"/);
  assert.match(html, /data-browser-modal-root/);
  assert.match(html, /data-browser-using-selector/);
  assert.doesNotMatch(html, /data-browser-status-proof/);
});

test('generated client script compiles', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.doesNotThrow(() => new Function(script));
});

test('client script includes custom homepage iframe navigation bridge', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function isBrowserInternalHref\(value\)/);
  assert.match(script, /function currentBrowserHtmlFrameWindow\(\)/);
  assert.match(script, /function handleBrowserBridgeMessage\(event\)/);
  assert.match(script, /agent-browser:navigate/);
  assert.match(script, /agent-browser:request/);
  assert.match(script, /agent-browser:response/);
  assert.match(script, /browser\.actor\.current/);
  assert.match(script, /browser\.privateChat\.compose/);
  assert.match(script, /function handleBridgePrivateChatCompose\(sourceWindow, id\)/);
  assert.match(script, /metaid\.pin\.write/);
  assert.match(script, /metafile\.upload/);
  assert.match(script, /window\.addEventListener\('message', handleBrowserBridgeMessage\)/);
  assert.match(script, /event\.source !== sourceWindow/);
  assert.match(script, /navigateTo\(uri\)\.catch\(\(\) => \{\}\)/);
});

test('client script includes drawer inspector share and trusted action flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function renderDrawer\(/);
  assert.match(script, /function renderInspector\(/);
  assert.match(script, /function openShareModal\(/);
  assert.match(script, /function openPrivateChatModal\(/);
  assert.match(script, /function openServiceCallModal\(/);
  assert.match(script, /function runTrustedAction\(/);
  assert.match(script, /function applyCommandResult\(/);
  assert.match(script, /manual_action_required/);
  assert.match(script, /waiting/);
  assert.match(script, /data-browser-private-chat-message/);
  assert.match(script, /data-browser-service-task/);
  assert.match(script, /data-browser-share-copy/);
});

test('mature Browser shell resolves resources client-side from an empty viewport', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.contentHtml, /<main class="browser-viewport" data-browser-viewport><\/main>/);
  assert.match(definition.script, /function renderRenderer\(current\)/);
  assert.match(definition.script, /function openPrivateChatModal\(/);
  // Navigation now writes the resolved resource onto the active tab, then mirrors
  // it onto state.current via applyActiveTabState() (per-tab source of truth).
  assert.match(definition.script, /resolvedTab\.current = result;/);
  assert.match(definition.script, /state\.current = tab\.current;/);
});

test('browser chrome navigation and status buttons are wired or disabled', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.contentHtml, /data-browser-back/);
  assert.match(definition.contentHtml, /data-browser-forward/);
  assert.match(definition.script, /function reloadCurrent\(/);
  assert.match(definition.script, /function goBack\(/);
  assert.match(definition.script, /function goForward\(/);
  assert.match(definition.script, /elements\.back\.addEventListener\('click', goBack\)/);
  assert.match(definition.script, /elements\.forward\.addEventListener\('click', goForward\)/);
  assert.match(definition.script, /elements\.reload\.addEventListener\('click', reloadCurrent\)/);
  assert.match(definition.script, /function openCreatorFromChip\(/);
  assert.match(definition.script, /elements\.resourceChip\.addEventListener\('click'[\s\S]*toggleOwnerPanel\(\)/);
  assert.doesNotMatch(definition.script, /elements\.statusProof\.addEventListener\('click', openInspector\)/);
  assert.match(definition.script, /elements\.statusTxid\.addEventListener\('click', openInspector\)/);
});

test('mature shell exposes generic copy and download helpers for pin pages', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function resolveDownloadHref\(/);
  assert.match(definition.script, /data-browser-copy-value/);
  assert.match(definition.script, /data-browser-download-ref/);
  assert.match(definition.script, /browser-pin-json-text-block/);
  assert.match(definition.script, /browser-pin-json-token-boolean/);
  assert.match(definition.script, /browser-pin-json-token-link/);
  assert.match(definition.script, /browser-pin-json-subblock/);
  assert.match(definition.script, /browser-pin-download/);
  assert.match(definition.script, /globalThis\.copyValue = function \(value\) \{ return copyUri\(\{ uri: value \}\); \}/);
  assert.match(definition.script, /globalThis\.resolveDownloadHref = resolveDownloadHref/);
});

test('client script includes generic pin page renderer and creator-chip parity', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'pin://fixture' });

  assert.match(script, /function renderPinInspectorPage\(resource\)/);
  assert.match(script, /if \(renderer\.type === 'pin-inspector'\) \{/);
  assert.match(script, /data-browser-map-link/);
  assert.match(script, /const mapLink = closestWithAttribute\(target, 'data-browser-map-link'\);/);
  assert.match(script, /PIN_INSPECTOR_PIN_ID_RE/);
  assert.match(script, /function pinInspectorCurrentPinIds\(resource\)/);
  assert.match(script, /function openCreatorFromChip\(\) \{[\s\S]*if \(resource\.resourceType === 'bot'\) \{[\s\S]*toggleInspector\(true\);[\s\S]*return;[\s\S]*\}[\s\S]*const uri = creatorUri\(resource\);/);
  assert.match(script, /if \(\[\s*'- ', '\* '\]\.some/);
});

test('resolve failures clear stale resource chrome and keep URI history coherent', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function clearResourceChrome\(/);
  assert.match(script, /resourceChip[\s\S]*browser-chip-title[\s\S]*Resource/);
  assert.doesNotMatch(script, /statusProof\) statusProof\.textContent = 'unverified'/);
  assert.match(script, /statusTxid\) statusTxid\.textContent = 'TXID: -'/);
  assert.match(script, /if \(drawer && !drawer\.hidden\) renderDrawer\(\);/);
  assert.match(script, /if \(inspector && !inspector\.hidden\) renderInspector\(\);/);
  assert.match(script, /function renderResolveFailure\(uri, message, options\) \{[\s\S]*clearResourceChrome\('error', 'renderer'\);[\s\S]*viewport\.innerHTML = '<section class="browser-empty-state"><h2>Resolve failed/);
  assert.match(script, /function renderResolveFailure\(uri, message, options\) \{[\s\S]*if \(!options \|\| options\.recordHistory !== false\) recordHistory\(uri\);[\s\S]*else updateHistoryButtons\(\);[\s\S]*\n  \}/);
});

test('actor switching re-resolves the current URI even before client resource state exists', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /async function selectActor\(actorId\) \{[\s\S]*const uri = state\.resource && state\.resource\.uri \|\| input && input\.value \|\| '';[\s\S]*if \(uri\) await navigateTo\(uri\);[\s\S]*\n  \}/);
  assert.doesNotMatch(script, /if \(state\.resource && uri\) await navigateTo\(uri\);/);
});

test('settings tabs use tab semantics', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /role="tablist"/);
  assert.match(script, /role="tab"/);
  assert.match(script, /aria-selected="true"/);
  assert.doesNotMatch(script, /aria-current="page"/);
});

test('mobile topbar reserves space for nav address and menu trigger', () => {
  assert.match(
    ui.BROWSER_PAGE_STYLES,
    /@media \(max-width: 900px\) \{[\s\S]*\.browser-topbar \{ grid-template-columns: auto minmax\(120px, 1fr\) auto; \}/,
  );
});

test('pin file rows keep download actions reachable on narrow widths', () => {
  assert.match(ui.BROWSER_PAGE_STYLES, /\.browser-pin-file-row span \{ min-width: 0; overflow-wrap: anywhere; \}/);
  assert.match(ui.BROWSER_PAGE_STYLES, /\.browser-pin-json-value a, \.browser-pin-link-pill, \.browser-pin-file-row a \{ color: #2563d8; text-decoration: none; \}/);
  assert.match(ui.BROWSER_PAGE_STYLES, /\.browser-pin-json-text-block \{ line-height: 1\.7; white-space: pre-wrap; \}/);
  assert.match(ui.BROWSER_PAGE_STYLES, /\.browser-pin-download \{ display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; border-radius: 10px;/);
  assert.match(ui.BROWSER_PAGE_STYLES, /\.browser-pin-file-meta \{ display: grid; gap: 4px; min-width: 0; \}/);
});
