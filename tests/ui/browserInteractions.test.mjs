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

test('actor switching re-resolves the current URI even before client resource state exists', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });

  assert.match(script, /async function selectActor\(actorId\) \{[\s\S]*const uri = state\.resource && state\.resource\.uri \|\| input && input\.value \|\| '';[\s\S]*if \(uri\) await navigateTo\(uri\);[\s\S]*\n  \}/);
  assert.doesNotMatch(script, /if \(state\.resource && uri\) await navigateTo\(uri\);/);
});

test('future inspector menu item is kept in the model but disabled in the Task 4 client menu', () => {
  const script = ui.buildBrowserClientScript({ apiBasePath: '/api/browser', initialUri: 'metaid://idq1fixturebot' });
  const inspector = ui.BROWSER_MENU_SECTIONS
    .flatMap((section) => section.items)
    .find((item) => item.id === 'inspector');

  assert.equal(inspector?.action, 'toggle-inspector');
  assert.match(script, /item\.action !== 'open-settings'/);
  assert.match(script, /data-browser-menu-disabled/);
  assert.match(script, /aria-disabled="true"/);
  assert.match(script, /menuItem\.hasAttribute\('data-browser-menu-disabled'\)/);
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
