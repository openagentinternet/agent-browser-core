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
  assert.match(script, /function clearBrowserCache\(/);
  assert.match(script, /function openActorSelector\(/);
  assert.match(script, /data-browser-settings-tab/);
  assert.match(script, /data-browser-template-select/);
  assert.match(script, /data-browser-cache-clear/);
  assert.match(script, /data-browser-actor-id/);
});

test('shared shell exposes menu and modal roots used by client script', () => {
  const html = ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition());

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

test('server-rendered resource hydrates client action state on first load', () => {
  const definition = ui.buildBrowserPageDefinition({
    resource: {
      uri: 'metaid://idq1fixturebot',
      normalizedUri: 'metaid://idq1fixturebot',
      resourceType: 'bot-homepage',
      title: 'SSR Fixture Bot',
      owner: { globalMetaId: 'idq1fixturebot' },
      renderer: { type: 'bot-page', templateId: 'document' },
      ownerAffinity: null,
      actions: [
        { id: 'private-chat-fixture', kind: 'private-chat', label: 'Private Chat', enabled: true },
      ],
      sections: [],
    },
  });

  assert.match(definition.contentHtml, /data-browser-action="private-chat"/);
  assert.match(definition.script, /const initialResource = /);
  assert.match(definition.script, /SSR Fixture Bot/);
  assert.match(definition.script, /private-chat-fixture/);
  assert.doesNotMatch(definition.script, /resource: null/);
});

test('browser chrome navigation and status buttons are wired or disabled', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.contentHtml, /data-browser-back[^>]*disabled/);
  assert.match(definition.contentHtml, /data-browser-forward[^>]*disabled/);
  assert.match(definition.script, /function updateHistoryButtons\(/);
  assert.match(definition.script, /function reloadCurrentResource\(/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-back'\)/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-forward'\)/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-reload'\)/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-status-state'\)/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-status-proof'\)/);
  assert.match(definition.script, /closestWithAttribute\(target, 'data-browser-status-txid'\)/);
  assert.match(definition.script, /toggleInspector\(true\)/);
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

test('inspector menu item is wired after Task 5 client behavior exists', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });
  const inspector = ui.BROWSER_MENU_SECTIONS
    .flatMap((section) => section.items)
    .find((item) => item.id === 'inspector');

  assert.equal(inspector?.action, 'toggle-inspector');
  assert.match(script, /item\.action !== 'open-settings' && item\.action !== 'toggle-inspector' && item\.action !== 'toggle-drawer'/);
  assert.match(script, /item && item\.action === 'toggle-inspector'/);
  assert.match(script, /renderInspector\(\)/);
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
