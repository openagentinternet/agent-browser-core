import assert from 'node:assert/strict';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');

test('client script includes runtime menu settings template cache and actor flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /const browserEndpoints = \{/);
  assert.match(script, /settings: apiBasePath \+ '\/settings'/);
  assert.match(script, /cache: apiBasePath \+ '\/cache'/);
  assert.match(script, /function renderBrowserMenu\(/);
  assert.match(script, /function openBrowserSettings\(/);
  assert.match(script, /function renderTemplateSettings\(/);
  assert.match(script, /function toggleCustomBotPages\(/);
  assert.match(script, /function clearBrowserCache\(/);
  assert.match(script, /function openActorSelector\(/);
  assert.match(script, /data-browser-settings-tab/);
  assert.match(script, /data-browser-template-select/);
  assert.match(script, /data-browser-custom-pages-toggle/);
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
});

test('generated client script compiles', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.doesNotThrow(() => new Function(script));
});

test('client script includes drawer inspector owner toolbar share and trusted action flows', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function renderDrawer\(/);
  assert.match(script, /function renderInspector\(/);
  assert.match(script, /function renderOwnerToolbar\(/);
  assert.match(script, /function openShareModal\(/);
  assert.match(script, /function openPrivateChatModal\(/);
  assert.match(script, /function openServiceCallModal\(/);
  assert.match(script, /function runTrustedAction\(/);
  assert.match(script, /function applyCommandResult\(/);
  assert.match(script, /manual_action_required/);
  assert.match(script, /waiting/);
  assert.match(script, /data-browser-owner-action/);
  assert.match(script, /data-browser-private-chat-message/);
  assert.match(script, /data-browser-service-task/);
  assert.match(script, /data-browser-share-copy/);
});

test('mature Browser shell resolves resources client-side from an empty viewport', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.contentHtml, /<main class="browser-viewport" data-browser-viewport><\/main>/);
  assert.match(definition.script, /function renderRenderer\(current\)/);
  assert.match(definition.script, /function openPrivateChatModal\(/);
  assert.match(definition.script, /state\.current = result;/);
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
  assert.match(definition.script, /elements\.statusProof\.addEventListener\('click', openInspector\)/);
  assert.match(definition.script, /elements\.statusTxid\.addEventListener\('click', openInspector\)/);
});

test('resolve failures clear stale resource chrome and keep URI history coherent', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /function clearResourceChrome\(/);
  assert.match(script, /resourceChip[\s\S]*browser-chip-title[\s\S]*Resource/);
  assert.match(script, /statusProof\) statusProof\.textContent = 'unverified'/);
  assert.match(script, /statusTxid\) statusTxid\.textContent = 'TXID: -'/);
  assert.match(script, /renderOwnerToolbar\(null\)/);
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
