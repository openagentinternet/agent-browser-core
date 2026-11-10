// Real-browser E2E for the element picker. Covers both host modes:
// - chrome-DOM mode: a bot page rendered into the pane, engine instantiated
//   against the pane subtree by the chrome script;
// - iframe mode: a local preview frame whose HTML carries the injected bridge
//   (the same script preparePreviewHtml serves), driven over postMessage.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');
const { renderBrowserPageHtml } = require('../../packages/ui/dist/browser/page.js');
const { ELEMENT_PICKER_SCRIPT_SOURCE } = require('../../packages/core/dist/browser/elementPicker.js');

const defaultActor = {
  id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
  isDefault: true, capabilities: ['private-chat', 'service-call'],
};

function runtimePayload() {
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor],
      defaultActor,
      defaultUri: null,
      features: { privateChat: true, serviceCall: true, cacheManagement: false, templateSettings: false, walletLogin: false },
      labels: {},
    },
  };
}

function botPagePayload(uri, name) {
  return {
    ok: true,
    data: {
      uri, normalizedUri: uri.toLowerCase(), resourceType: 'bot', title: name,
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name, verificationState: 'verified' },
      renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', templateId: 'document', data: { profile: { name } } },
      status: { state: 'resolved', verificationState: 'verified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

function previewFramePayload(uri) {
  return {
    ok: true,
    data: {
      uri, normalizedUri: uri, resourceType: 'metaapp', title: 'Preview App',
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name: 'Alice Bot', verificationState: 'unverified' },
      renderer: {
        type: 'html-iframe',
        contentType: 'text/html',
        url: '/api/browser/preview-assets/preview-1/index.html',
        data: { record: {} },
      },
      status: { state: 'resolved', verificationState: 'unverified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

function previewFrameHtml() {
  // What preparePreviewHtml serves: app markup plus the injected bridge.
  return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}#app-btn{margin:40px;padding:12px 20px;font-size:16px}</style></head>'
    + '<body><button id="app-btn" data-role="save">Save draft</button>'
    + '<script>' + ELEMENT_PICKER_SCRIPT_SOURCE + '</script></body></html>';
}

async function startServer() {
  const pageHtml = await renderBrowserPageHtml(buildBrowserPageDefinition());
  const server = http.createServer((request, response) => {
    const url = String(request.url || '/');
    const sendJson = (payload) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    };
    if (url.startsWith('/api/browser/runtime')) return sendJson(runtimePayload());
    if (url.startsWith('/api/browser/resolve')) {
      const uri = decodeURIComponent((url.split('uri=')[1] || '').replace(/\+/g, ' '));
      if (uri.startsWith('metaid://')) return sendJson(botPagePayload(uri, 'Alice Bot'));
      if (uri.startsWith('preview-metaapp://localhost')) {
        const payload = previewFramePayload(uri);
        payload.data.renderer.url = `http://${request.headers.host}/browser-cache/metaapp-preview/preview-1/index.html`;
        return sendJson(payload);
      }
      if (uri.startsWith('metaapp://')) return sendJson(previewFramePayload(uri));
      response.writeHead(404, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ ok: false, message: 'unknown uri' }));
    }
    if (url.startsWith('/api/browser/settings')) return sendJson({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } });
    if (url.startsWith('/api/browser/cache')) return sendJson({ ok: true, data: { cacheRoot: '/tmp', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } });
    if (url.startsWith('/api/browser/preview-assets/') || url.startsWith('/browser-cache/metaapp-preview/')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(previewFrameHtml());
    }
    if (url === '/ui/shared.css') {
      response.writeHead(200, { 'content-type': 'text/css' });
      return response.end('');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(pageHtml);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('element picker works end to end in chrome-DOM and iframe modes (e2e)', async () => {
  const playwright = await import('playwright');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl + '/ui/browser', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(globalThis.AgentBrowserTabs), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-browser-viewport]') && document.querySelector('[data-browser-viewport]').innerHTML.includes('browser-welcome'), null, { timeout: 10000 });

    // --- chrome-DOM mode: bot page -----------------------------------------
    await page.evaluate(() => globalThis.resolveUri('metaid://idq1alice'));
    await page.waitForFunction(() => document.querySelector('[data-browser-status-state]') && document.querySelector('[data-browser-status-state]').textContent === 'resolved', null, { timeout: 10000 });
    assert.equal(await page.locator('[data-browser-picker-toggle]').isDisabled(), false, 'bot page enables the picker');

    await page.click('[data-browser-picker-toggle]');
    await page.waitForFunction(() => document.querySelector('[data-browser-picker-toggle]').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });

    // Click an element inside the rendered bot page; the engine intercepts the
    // click and opens the annotation panel.
    await page.evaluate(() => {
      const pane = document.querySelector('[data-tab-pane]');
      if (!pane) throw new Error('pane missing');
      const target = pane.querySelector('h1, h2, h3, strong, b, div, span');
      if (!target) throw new Error('no pickable element in pane');
      target.click();
    });
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-browser-picker-name]', 'Bot name');
    await page.fill('[data-browser-picker-comment]', 'Make the name larger');
    await page.click('[data-browser-picker-panel-save]');

    await page.waitForSelector('.__ab-picker-badge', { timeout: 5000 });
    assert.equal(await page.locator('.__ab-picker-badge').textContent(), 'Bot name', 'badge painted with the custom name');

    const paneSnapshot = await page.evaluate(() => AgentBrowserTabs.getElementSelections());
    // The browser appends &actorId=... to the resolve request; the tab uri is
    // echoed back by the test server, so assert on the prefix.
    assert.ok(paneSnapshot.uri.startsWith('metaid://idq1alice'), `unexpected uri: ${paneSnapshot.uri}`);
    assert.equal(paneSnapshot.selections.length, 1);
    assert.equal(paneSnapshot.selections[0].name, 'Bot name');
    assert.equal(paneSnapshot.selections[0].comment, 'Make the name larger');
    assert.equal(paneSnapshot.selections[0].locator.cssScope, 'browser-pane');
    assert.ok(paneSnapshot.selections[0].locator.cssSelector.length > 0);
    assert.ok(paneSnapshot.selections[0].geometry.rect.width >= 0);

    // Navigation clears the markers (stale locators) and exits pick mode.
    await page.evaluate(() => globalThis.resolveUri('metaapp://preview-1'));
    await page.waitForFunction(() => document.querySelector('[data-browser-status-state]').textContent === 'resolved', null, { timeout: 10000 });
    const cleared = await page.evaluate(() => AgentBrowserTabs.getElementSelections());
    assert.equal(cleared.selections.length, 0, 'navigation clears markers');
    assert.equal(await page.locator('[data-browser-picker-toggle]').getAttribute('aria-pressed'), 'false');

    // --- iframe mode: injected bridge --------------------------------------
    assert.equal(await page.locator('[data-browser-picker-toggle]').isDisabled(), false, 'local preview frame enables the picker');
    await page.waitForSelector('iframe.browser-html-frame', { timeout: 10000 });
    await page.click('[data-browser-picker-toggle]');
    await page.waitForFunction(() => document.querySelector('[data-browser-picker-toggle]').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });

    const frameElement = await page.$('iframe.browser-html-frame');
    const frame = await frameElement.contentFrame();
    await frame.waitForSelector('#app-btn', { timeout: 10000 });
    await frame.click('#app-btn');

    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    const panelText = await page.locator('[data-browser-picker-panel]').textContent();
    assert.match(panelText, /page document/, 'frame picks report document-scoped selectors');
    await page.fill('[data-browser-picker-name]', 'App save button');
    await page.fill('[data-browser-picker-comment]', 'Hook this to the save action');
    await page.click('[data-browser-picker-panel-save]');

    // The badge is painted INSIDE the sandboxed frame by the bridge.
    await frame.waitForSelector('.__ab-picker-badge', { timeout: 5000 });
    assert.equal(await frame.locator('.__ab-picker-badge').textContent(), 'App save button');

    const frameSnapshot = await page.evaluate(() => AgentBrowserTabs.getElementSelections());
    assert.equal(frameSnapshot.selections.length, 1);
    assert.equal(frameSnapshot.selections[0].name, 'App save button');
    assert.equal(frameSnapshot.selections[0].comment, 'Hook this to the save action');
    assert.equal(frameSnapshot.selections[0].locator.cssScope, 'document');
    assert.equal(frameSnapshot.selections[0].frame.url, '/api/browser/preview-assets/preview-1/index.html');
    assert.equal(frameSnapshot.selections[0].element.attributes['data-role'], 'save');

    // Esc inside the frame exits pick mode.
    await frame.click('#app-btn');
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-browser-picker-panel]');
      return panel && panel.hidden === true;
    }, null, { timeout: 5000 });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('pane picker markers and engines follow duplicate URI tabs (e2e)', async () => {
  const playwright = await import('playwright');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl + '/ui/browser', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(globalThis.AgentBrowserTabs), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-browser-viewport]')?.innerHTML.includes('browser-welcome'), null, { timeout: 10000 });

    const uri = 'metaid://idq1alice';
    await page.evaluate((value) => globalThis.resolveUri(value), uri);
    await page.waitForFunction(() => document.querySelector('[data-browser-status-state]')?.textContent === 'resolved', null, { timeout: 10000 });
    const firstTabId = await page.evaluate(() => AgentBrowserTabs.getActiveTab().id);
    const pickActivePaneElement = () => page.evaluate(() => {
      const pane = document.querySelector('[data-tab-pane]:not([hidden])');
      const target = pane?.querySelector('h1, h2, h3, strong, b, div, span');
      if (!target) throw new Error('no pickable element in active pane');
      target.click();
    });

    await page.click('[data-browser-picker-toggle]');
    await pickActivePaneElement();
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-browser-picker-name]', 'First tab marker');
    await page.click('[data-browser-picker-panel-save]');
    await page.waitForSelector('.__ab-picker-badge:visible', { timeout: 5000 });

    const secondTabId = await page.evaluate((value) => AgentBrowserTabs.openTab(value, { dedupe: false }), uri);
    await page.waitForFunction((tabId) => {
      const active = AgentBrowserTabs.getActiveTab();
      const pane = document.querySelector(`[data-tab-pane="${tabId}"]`);
      return active.id === tabId && active.uri && pane && !pane.hasAttribute('hidden');
    }, secondTabId, { timeout: 10000 });
    assert.equal(await page.locator('.__ab-picker-marker:visible').count(), 0, 'opening a tab hides the previous tab markers');
    assert.equal(await page.locator('[data-browser-picker-toggle]').getAttribute('aria-pressed'), 'false');

    await page.click('[data-browser-picker-toggle]');
    await pickActivePaneElement();
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-browser-picker-name]', 'Second tab marker');
    await page.click('[data-browser-picker-panel-save]');
    await page.waitForSelector('.__ab-picker-badge:visible', { timeout: 5000 });
    assert.equal(await page.locator('.__ab-picker-badge:visible').textContent(), 'Second tab marker');
    assert.equal(await page.evaluate((tabId) => AgentBrowserTabs.getElementSelections(tabId).selections.length, firstTabId), 1);
    assert.equal(await page.evaluate((tabId) => AgentBrowserTabs.getElementSelections(tabId).selections.length, secondTabId), 1);

    await page.evaluate((tabId) => AgentBrowserTabs.switchTab(tabId), firstTabId);
    assert.equal(await page.locator('.__ab-picker-badge:visible').textContent(), 'First tab marker');
    assert.equal(await page.locator('.__ab-picker-marker:visible').count(), 1, 'only the active tab marker is visible');
    assert.equal(await page.locator('[data-browser-picker-toggle]').getAttribute('aria-pressed'), 'false');

    await page.evaluate((tabId) => AgentBrowserTabs.switchTab(tabId), secondTabId);
    assert.equal(await page.locator('.__ab-picker-badge:visible').textContent(), 'Second tab marker');
    assert.equal(await page.locator('.__ab-picker-marker:visible').count(), 1);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('host-local preview picker works in duplicate URI frames (e2e)', async () => {
  const playwright = await import('playwright');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(baseUrl + '/ui/browser', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(globalThis.AgentBrowserTabs), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-browser-viewport]')?.innerHTML.includes('browser-welcome'), null, { timeout: 10000 });

    const uri = 'preview-metaapp://localhost/Users/a/app/index.html';
    await page.evaluate((value) => globalThis.resolveUri(value), uri);
    await page.waitForFunction(() => document.querySelector('[data-browser-status-state]')?.textContent === 'resolved', null, { timeout: 10000 });
    assert.equal(await page.locator('[data-browser-picker-toggle]').isDisabled(), false, 'IDBots-style loopback preview URL enables picking');
    const firstTabId = await page.evaluate(() => AgentBrowserTabs.getActiveTab().id);
    const activeFrame = async () => {
      const element = await page.$('.browser-tab-pane:not([hidden]) iframe.browser-html-frame');
      assert.ok(element, 'active preview frame missing');
      const frame = await element.contentFrame();
      assert.ok(frame, 'active preview content window missing');
      return frame;
    };

    await page.click('[data-browser-picker-toggle]');
    const firstFrame = await activeFrame();
    await firstFrame.waitForSelector('#app-btn', { timeout: 10000 });
    await firstFrame.click('#app-btn');
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-browser-picker-name]', 'Preview one');
    await page.click('[data-browser-picker-panel-save]');
    await firstFrame.waitForSelector('.__ab-picker-badge', { timeout: 5000 });

    const secondTabId = await page.evaluate((value) => AgentBrowserTabs.openTab(value, { dedupe: false }), uri);
    await page.waitForFunction((tabId) => {
      const active = AgentBrowserTabs.getActiveTab();
      const pane = document.querySelector(`[data-tab-pane="${tabId}"]`);
      return active.id === tabId && active.uri && pane && !pane.hasAttribute('hidden') && pane.querySelector('iframe.browser-html-frame');
    }, secondTabId, { timeout: 10000 });
    assert.equal(await page.locator(`[data-tab-pane="${firstTabId}"]`).isHidden(), true, 'first preview pane is hidden');
    assert.equal(await page.locator('[data-browser-picker-toggle]').getAttribute('aria-pressed'), 'false');

    await page.click('[data-browser-picker-toggle]');
    const secondFrame = await activeFrame();
    await secondFrame.waitForSelector('#app-btn', { timeout: 10000 });
    await secondFrame.click('#app-btn');
    await page.waitForSelector('[data-browser-picker-panel]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-browser-picker-name]', 'Preview two');
    await page.click('[data-browser-picker-panel-save]');
    await secondFrame.waitForFunction(() => document.querySelector('.__ab-picker-badge')?.textContent === 'Preview two', null, { timeout: 5000 });
    assert.equal(await page.evaluate((tabId) => AgentBrowserTabs.getElementSelections(tabId).selections.length, firstTabId), 1);
    assert.equal(await page.evaluate((tabId) => AgentBrowserTabs.getElementSelections(tabId).selections.length, secondTabId), 1);

    await page.evaluate((tabId) => AgentBrowserTabs.switchTab(tabId), firstTabId);
    const restoredFirstFrame = await activeFrame();
    await restoredFirstFrame.waitForFunction(() => document.querySelector('.__ab-picker-badge')?.textContent === 'Preview one', null, { timeout: 5000 });
    assert.equal(await page.locator(`[data-tab-pane="${secondTabId}"]`).isHidden(), true, 'second preview markers hide with its pane');

    await page.evaluate((tabId) => AgentBrowserTabs.switchTab(tabId), secondTabId);
    const restoredSecondFrame = await activeFrame();
    await restoredSecondFrame.waitForFunction(() => document.querySelector('.__ab-picker-badge')?.textContent === 'Preview two', null, { timeout: 5000 });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
