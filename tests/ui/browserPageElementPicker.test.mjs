import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.attrs = {};
    this.listeners = new Map();
    this.children = [];
    this._parent = null;
    this.childrenBySelector = new Map();
    this.classList = {
      add: (...names) => { for (const name of names) this.attrs[`class:${name}`] = true; },
      remove: (...names) => { for (const name of names) delete this.attrs[`class:${name}`]; },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true; else delete this.attrs[`class:${name}`];
      },
      contains: (name) => Boolean(this.attrs[`class:${name}`]),
    };
  }
  get innerHTML() {
    if (this.children && this.children.length) {
      return this.children
        .filter((c) => !(typeof c.hasAttribute === 'function' && c.hasAttribute('hidden')))
        .map((c) => c.innerHTML)
        .join('');
    }
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.textContent = this._innerHTML.replace(/<[^>]*>/g, '');
    // Real DOM semantics: replacing innerHTML destroys the subtree, so cached
    // querySelector children (and their field values) must not survive.
    this.childrenBySelector.clear();
  }
  appendChild(child) { child._parent = this; this.children.push(child); return child; }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) { this.children.splice(idx, 1); child._parent = null; }
    return child;
  }
  get firstElementChild() { return (this.children && this.children.length) ? this.children[0] : null; }
  get nextElementSibling() {
    if (!this._parent) return null;
    const idx = this._parent.children.indexOf(this);
    if (idx === -1) return null;
    return idx + 1 < this._parent.children.length ? this._parent.children[idx + 1] : null;
  }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.childrenBySelector.has(key)) this.childrenBySelector.set(key, new FakeElement());
    return this.childrenBySelector.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
  focus() { /* no-op for tests */ }
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - startedAt > 2000) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(check, 5);
    };
    check();
  });
}

function createElements() {
  const els = {};
  const selectors = [
    '[data-browser-shell]', '[data-browser-uri-input]', '[data-browser-address-form]',
    '[data-browser-back]', '[data-browser-forward]', '[data-browser-reload]',
    '[data-browser-drawer-toggle]', '[data-browser-resource-chip]', '[data-browser-using-selector]',
    '[data-browser-menu-trigger]', '[data-browser-menu]', '[data-browser-viewport]',
    '[data-browser-status-state]', '[data-browser-status-renderer]', '[data-browser-status-txid]',
    '[data-browser-drawer]', '[data-browser-inspector]', '[data-browser-modal-root]',
    '[data-browser-bookmark-star]', '[data-browser-picker-toggle]', '[data-browser-picker-panel]',
    '[data-browser-toast]', '[data-browser-tabstrip]', '[data-browser-tabs-container]',
    '[data-browser-tab-new]', '[data-browser-tab-context-menu]',
  ];
  for (const s of selectors) els[s] = new FakeElement();
  els['[data-browser-tab-context-menu]'].hidden = true;
  els['[data-browser-picker-panel]'].hidden = true;
  return els;
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

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
        url: String(uri).startsWith('metaapp://idbots') || String(uri).startsWith('preview-metaapp://localhost') || uri === 'metaid://idq1custommetaapp'
          ? 'http://127.0.0.1:47701/browser-cache/metaapp-preview/preview-1/index.html'
          : '/api/browser/preview-assets/preview-1/index.html',
        data: { record: {} },
      },
      status: { state: 'resolved', verificationState: 'unverified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

function remoteFramePayload(uri) {
  const payload = previewFramePayload(uri);
  payload.data.renderer.url = 'https://cdn.example.com/app/index.html';
  return payload;
}

function imagePayload(uri) {
  return {
    ok: true,
    data: {
      uri, normalizedUri: uri, resourceType: 'image', title: 'Pic',
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name: 'Alice Bot' },
      renderer: { type: 'image', contentType: 'image/png', url: 'metafile://765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0', data: {} },
      status: { state: 'resolved', verificationState: 'unverified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

// Pick payload as the engine reports it (shape mirrors the core engine).
const PICK_INFO = {
  tag: 'button',
  id: 'submit-btn',
  classes: ['btn', 'btn-primary'],
  attributes: { type: 'submit', 'data-action': 'save' },
  role: 'button',
  accessibleName: 'Save changes',
  textPreview: 'Save changes',
  outerHtmlPreview: '<button id="submit-btn" class="btn btn-primary" type="submit">Save changes</button>',
  locator: { cssSelector: '#submit-btn', cssScope: 'browser-pane', xpath: '/html[1]/body[1]/div[1]/button[1]' },
  geometry: { rect: { x: 10, y: 20, width: 120, height: 36 }, scrollX: 0, scrollY: 0, viewportWidth: 1200, viewportHeight: 800 },
  style: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(47, 111, 235)', fontSize: '14px', fontFamily: 'Inter', fontWeight: '600', display: 'inline-block' },
};

function createPickerContext(options = {}) {
  const elements = createElements();
  const fetchCalls = [];
  const postedFrameMessages = [];
  const hostMessages = [];
  const engineLog = [];
  const fakeFrameWindow = {
    postMessage(message) { postedFrameMessages.push(message); },
  };
  const resolveResponse = (uri) => {
    if (uri === 'metaid://idq1custommetaapp') return previewFramePayload(uri);
    if (String(uri).startsWith('metaid://')) return botPagePayload(uri, 'Alice Bot');
    if (uri === 'metaapp://remote') return remoteFramePayload(uri);
    if (String(uri).startsWith('metaapp://') || String(uri).startsWith('preview-metaapp://localhost')) return previewFramePayload(uri);
    if (String(uri).startsWith('metafile://')) return imagePayload(uri);
    throw new Error(`Unexpected resolve uri ${uri}`);
  };
  const storage = createMemoryStorage();
  const context = {
    console, URL, URLSearchParams, JSON, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: '/ui/browser', search: '' },
      history: { replaceState() {} },
      localStorage: storage,
      // Host side of the page-embedded surface: the Browser page posts here
      // when embedded as an iframe.
      parent: {
        postMessage(message) { hostMessages.push(message); },
      },
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => elements[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimePayload() };
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        return { ok: true, json: async () => resolveResponse(uri) };
      }
      if (String(url).startsWith('/api/browser/settings')) return { ok: true, json: async () => ({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } }) };
      if (String(url).startsWith('/api/browser/cache')) return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '/tmp', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  // The interpolated engine source overwrites window.__agentBrowserElementPicker
  // during evaluation, so the stub engine must be installed AFTER the script.
  // It records calls so controller logic can be asserted without a real DOM.
  context.window.__agentBrowserElementPicker = {
    create(opts) {
      engineLog.push({ root: opts.root, hasOnEvent: typeof opts.onEvent === 'function' });
      return {
        enabled: false,
        visible: true,
        enable() { this.enabled = true; engineLog.push('enable'); },
        disable() { this.enabled = false; engineLog.push('disable'); },
        isEnabled() { return this.enabled; },
        setVisible(visible) { this.visible = visible; engineLog.push(['setVisible', visible]); },
        addMarker(markerId, label) { engineLog.push(['addMarker', markerId, label]); return true; },
        updateMarker(markerId, label) { engineLog.push(['updateMarker', markerId, label]); return true; },
        removeMarker(markerId) { engineLog.push(['removeMarker', markerId]); return true; },
        clearMarkers() { engineLog.push('clearMarkers'); return true; },
        dispose() { engineLog.push('dispose'); },
      };
    },
  };
  // Frame lookup override: the FakeElement DOM cannot host a real iframe, so
  // point currentBrowserHtmlFrameWindow at the harness fake frame window.
  if (options.overrideFrameWindow !== false) {
    context.currentBrowserHtmlFrameWindow = () => fakeFrameWindow;
  }
  return { context, elements, fetchCalls, postedFrameMessages, hostMessages, engineLog, fakeFrameWindow };
}

async function resolveTo(context, uri) {
  await context.resolveUri(uri);
  await waitFor(() => context.state.status === 'resolved', `resolve of ${uri}`);
}

function panelClick(context, selector) {
  const panelElement = context.document.querySelector('[data-browser-picker-panel]');
  const handler = panelElement.listeners.get('click');
  assert.ok(handler, 'panel click delegation missing');
  handler({ target: { closest: (needle) => (needle === selector ? {} : null) } });
}

const PICK_EVENT = (element) => ({ source: null, data: { type: 'agent-browser:picker-event', version: 1, event: { type: 'pick', element } } });

test('picker toolbar button enables for supported content and stays disabled otherwise', async () => {
  const { context, elements } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, true, 'welcome content must not enable picking');

  await resolveTo(context, 'metaid://idq1alice');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, false, 'bot pages support picking');

  await resolveTo(context, 'metafile://765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, true, 'image renderers do not support picking');

  await resolveTo(context, 'metaapp://765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, false, 'standalone local preview frames support picking');

  await resolveTo(context, 'metaapp://idbots-local');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, false, 'host-local MetaApp preview URLs support picking regardless of route');

  await resolveTo(context, 'preview-metaapp://localhost/Users/a/app/index.html');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, false, 'host-local preview-metaapp URLs support picking');

  await resolveTo(context, 'metaid://idq1custommetaapp');
  assert.equal(context.state.current.resourceType, 'metaapp', 'the metaid alias resolves to a custom MetaApp homepage');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, false, 'metaid aliases of host-local MetaApps support picking');

  // Remote frame (no preview-assets path) is unsupported.
  await resolveTo(context, 'metaapp://remote');
  assert.equal(elements['[data-browser-picker-toggle]'].disabled, true, 'remote html-iframe frames do not support picking');
});

test('pane-mode pick flow: enter, pick, save, rename via badge, host read API', async () => {
  const { context, elements, engineLog } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  await resolveTo(context, 'metaid://idq1alice');

  elements['[data-browser-picker-toggle]'].click();
  assert.equal(context.state.pickerModeTabId, 1, 'pick mode entered for active tab');
  assert.equal(context.state.pickerEngine.enabled, true, 'pane engine enabled');
  assert.ok(engineLog.includes('enable'));
  assert.equal(elements['[data-browser-picker-toggle]'].attrs['class:is-active'], true);

  // The (stubbed) engine reports picks through the controller's event hook.
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  const panel = elements['[data-browser-picker-panel]'];
  assert.equal(panel.hidden, false, 'annotation panel opens on pick');
  assert.match(panel.innerHTML, /Annotate/);
  assert.match(panel.innerHTML, /Locator &amp; Geometry/);
  assert.match(panel.innerHTML, /#submit-btn/);

  // Name + comment through the panel fields (FakeElement auto-creates children).
  panel.querySelector('[data-browser-picker-name]').value = '  Save button  ';
  panel.querySelector('[data-browser-picker-comment]').value = 'Make the label uppercase';

  panelClick(context, '[data-browser-picker-panel-save]');

  assert.equal(panel.hidden, true, 'panel closes after save');
  const snapshot = context.AgentBrowserTabs.getElementSelections();
  assert.equal(snapshot.tabId, 1);
  assert.equal(snapshot.uri, 'metaid://idq1alice');
  assert.equal(snapshot.title, 'Alice Bot');
  assert.equal(snapshot.selections.length, 1);
  const record = snapshot.selections[0];
  assert.equal(record.name, 'Save button');
  assert.equal(record.comment, 'Make the label uppercase');
  assert.equal(record.markerId, 'marker-1');
  assert.equal(record.element.tag, 'button');
  assert.equal(record.locator.cssSelector, '#submit-btn');
  assert.equal(record.locator.cssScope, 'browser-pane');
  assert.equal(record.element.attributes['data-action'], 'save');
  assert.equal(record.geometry.rect.width, 120);
  assert.equal(record.style.backgroundColor, 'rgb(47, 111, 235)');
  assert.match(record.capturedAt, /^\d{4}-/);
  assert.ok(engineLog.some((entry) => Array.isArray(entry) && entry[0] === 'addMarker' && entry[1] === 'marker-1' && entry[2] === 'Save button'), 'badge painted');

  // Badge click reopens the panel in edit mode; rename flows to the engine.
  pickerOnEvent(context)({ type: 'marker-click', markerId: 'marker-1' });
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Edit marker/);
  panel.querySelector('[data-browser-picker-name]').value = 'Primary CTA';
  panelClick(context, '[data-browser-picker-panel-save]');
  const renamed = context.AgentBrowserTabs.getElementSelections().selections[0];
  assert.equal(renamed.name, 'Primary CTA');
  assert.ok(engineLog.some((entry) => Array.isArray(entry) && entry[0] === 'updateMarker' && entry[2] === 'Primary CTA'), 'badge renamed');

  // Default naming falls back to Marker N when the name field is empty.
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');
  const second = context.AgentBrowserTabs.getElementSelections().selections[1];
  assert.equal(second.name, 'Marker 2');
  assert.equal(second.comment, '');

  // Escape with no pending pick exits pick mode but keeps markers.
  pickerOnEvent(context)({ type: 'escape' });
  assert.equal(context.state.pickerModeTabId, null);
  assert.equal(context.state.pickerEngine.enabled, false);
  assert.equal(context.AgentBrowserTabs.getElementSelections().selections.length, 2);
});

function pickerOnEvent(context) {
  return (event) => context.handlePickerEngineEvent(event);
}

test('frame-mode pick flow drives the injected bridge over postMessage', async () => {
  const { context, elements, postedFrameMessages, fakeFrameWindow } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  await resolveTo(context, 'metaapp://765570486edfc94bb0b393bfb8c48d100fb84be9fcf2b9b0b39df68e997135c1i0');

  elements['[data-browser-picker-toggle]'].click();
  assert.equal(context.state.pickerModeTabId, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(postedFrameMessages.filter((message) => message.type === 'agent-browser:picker-enable'))),
    [{ type: 'agent-browser:picker-enable', version: 1 }],
  );

  // Pick event arrives from the frame; only the active frame's source is accepted.
  const framePickInfo = { ...PICK_INFO, locator: { ...PICK_INFO.locator, cssScope: 'document' } };
  context.handleBrowserMessage({ source: fakeFrameWindow, data: { type: 'agent-browser:picker-event', version: 1, event: { type: 'pick', element: framePickInfo } } });
  const panel = elements['[data-browser-picker-panel]'];
  assert.equal(panel.hidden, false, 'panel opens from frame pick');
  assert.match(panel.innerHTML, /page document/, 'frame picks scope selectors to the document');

  panel.querySelector('[data-browser-picker-name]').value = 'Submit';
  panelClick(context, '[data-browser-picker-panel-save]');
  assert.ok(postedFrameMessages.some((message) => message.type === 'agent-browser:picker-add-marker' && message.markerId === 'marker-1' && message.label === 'Submit'), 'add-marker sent to frame');
  assert.equal(context.AgentBrowserTabs.getElementSelections().selections[0].locator.cssScope, 'document');

  // Forged events from other windows are ignored.
  context.handleBrowserMessage({ source: {}, data: { type: 'agent-browser:picker-event', version: 1, event: { type: 'pick', element: PICK_INFO } } });
  assert.equal(panel.hidden, true, 'no panel for a forged source');

  // Exit posts disable to the frame.
  elements['[data-browser-picker-toggle]'].click();
  assert.equal(context.state.pickerModeTabId, null);
  assert.ok(postedFrameMessages.some((message) => message.type === 'agent-browser:picker-disable'), 'disable sent to frame');
});

test('new and duplicate tabs hide previous pane markers and use independent engines', async () => {
  const { context, engineLog } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  const uri = 'metaid://idq1alice';
  await resolveTo(context, uri);

  context.togglePickerMode();
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');
  const firstEngine = context.state.pickerEngine;
  const firstRoot = context.activeViewportPane();

  const secondTabId = context.AgentBrowserTabs.openTab(uri, { dedupe: false });
  await waitFor(() => context.state.status === 'resolved' && context.state.activeTabId === secondTabId, 'duplicate tab resolve');
  assert.equal(context.state.pickerModeTabId, null, 'opening a tab exits the previous tab pick mode');
  assert.equal(firstEngine.enabled, false, 'previous pane engine is disabled');
  assert.equal(firstEngine.visible, false, 'previous pane markers are hidden');
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 1, 'previous tab records survive');

  context.togglePickerMode();
  const secondEngine = context.state.pickerEngine;
  const secondRoot = context.activeViewportPane();
  assert.notEqual(secondEngine, firstEngine, 'duplicate URI tab must not reuse the first pane engine');
  assert.notEqual(secondRoot, firstRoot, 'each tab engine binds to its own pane');
  assert.equal(engineLog.filter((entry) => entry && entry.root).length, 2);

  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');
  assert.equal(context.AgentBrowserTabs.getElementSelections(secondTabId).selections.length, 1);
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 1);

  context.AgentBrowserTabs.switchTab(1);
  assert.equal(secondEngine.visible, false, 'second tab markers hide in the background');
  assert.equal(firstEngine.visible, true, 'first tab markers reappear');
  assert.equal(context.state.pickerEngine, firstEngine, 'active engine follows the tab');
  assert.equal(context.state.pickerModeTabId, null);

  context.AgentBrowserTabs.switchTab(secondTabId);
  assert.equal(firstEngine.visible, false);
  assert.equal(secondEngine.visible, true);
  assert.equal(context.state.pickerEngine, secondEngine);
});

test('navigation and tab close clear markers; switchTab keeps them per tab', async () => {
  const { context, engineLog } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  await resolveTo(context, 'metaid://idq1alice');

  context.togglePickerMode();
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');
  assert.equal(context.AgentBrowserTabs.getElementSelections().selections.length, 1);

  // Second tab navigated from the first: first tab keeps markers.
  const secondTabId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => context.state.status === 'resolved' && context.state.activeTabId === secondTabId, 'second tab resolve');
  assert.equal(context.AgentBrowserTabs.getElementSelections(secondTabId).selections.length, 0);
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 1, 'background tab keeps markers');

  // Navigate the second tab: its (empty) selection set stays empty; pick mode
  // is not active there.
  await resolveTo(context, 'metaid://idq1carol');
  assert.equal(context.AgentBrowserTabs.getElementSelections(secondTabId).selections.length, 0);

  // Back to tab 0, navigate it: markers cleared, pick mode left, engine disposed.
  context.AgentBrowserTabs.switchTab(1);
  assert.equal(context.state.pickerModeTabId, null, 'switching tabs left pick mode behind');
  context.togglePickerMode();
  assert.equal(context.state.pickerModeTabId, 1);
  await resolveTo(context, 'metaid://idq1dave');
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 0, 'navigation clears markers');
  assert.equal(context.state.pickerModeTabId, null, 'navigation exits pick mode');
  assert.ok(engineLog.includes('dispose'), 'pane engine disposed on navigation');

  // Host-initiated clear works and removes badges for the active tab.
  context.togglePickerMode();
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 1);
  const cleared = context.AgentBrowserTabs.clearElementSelections(1);
  assert.equal(cleared.tabId, 1);
  assert.equal(cleared.cleared, true);
  assert.equal(context.AgentBrowserTabs.getElementSelections(1).selections.length, 0);
  assert.ok(engineLog.includes('clearMarkers'));

  // Unknown tab ids return null like getTabInfo.
  assert.equal(context.AgentBrowserTabs.getElementSelections(999), null);
  assert.equal(context.AgentBrowserTabs.clearElementSelections(999), null);
});

test('host postMessage protocol: get-element-selections and clear-element-selections', async () => {
  const { context, hostMessages } = createPickerContext();
  await waitFor(() => context.state.runtime, 'runtime load');
  await resolveTo(context, 'metaid://idq1alice');
  context.togglePickerMode();
  pickerOnEvent(context)({ type: 'pick', element: PICK_INFO });
  panelClick(context, '[data-browser-picker-panel-save]');

  const parentSource = context.window.parent;
  context.handleBrowserMessage({ source: parentSource, data: { type: 'agent-browser:get-element-selections', requestId: 'r1' } });
  const getResponse = hostMessages.find((message) => message.type === 'agent-browser:get-element-selections:response');
  assert.ok(getResponse, 'get response posted');
  assert.equal(getResponse.requestId, 'r1');
  assert.equal(getResponse.ok, true);
  assert.equal(getResponse.result.tabId, 1);
  assert.equal(getResponse.result.selections.length, 1);

  context.handleBrowserMessage({ source: parentSource, data: { type: 'agent-browser:clear-element-selections', requestId: 'r2' } });
  const clearResponse = hostMessages.find((message) => message.type === 'agent-browser:clear-element-selections:response');
  assert.ok(clearResponse, 'clear response posted');
  assert.equal(clearResponse.ok, true);
  assert.equal(clearResponse.result.tabId, 1);
  assert.equal(clearResponse.result.cleared, true);
  assert.equal(context.AgentBrowserTabs.getElementSelections().selections.length, 0);

  context.handleBrowserMessage({ source: parentSource, data: { type: 'agent-browser:get-element-selections', requestId: 'r3', tabId: 42 } });
  const missResponse = hostMessages.find((message) => message.type === 'agent-browser:get-element-selections:response' && message.requestId === 'r3');
  assert.equal(missResponse.ok, false);
  assert.equal(missResponse.error.code, 'tab_not_found');
});
