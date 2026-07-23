import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

class FakeElement {
  constructor(value = '') {
    this._value = String(value);
    this.valueHistory = [];
    this.textContent = '';
    this._innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.attrs = {};
    this.classList = {
      add: (...names) => { for (const name of names) this.attrs[`class:${name}`] = true; },
      remove: (...names) => { for (const name of names) delete this.attrs[`class:${name}`]; },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true; else delete this.attrs[`class:${name}`];
      },
    };
  }
  get value() { return this._value; }
  set value(value) { const next = String(value); this._value = next; this.valueHistory.push(next); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
  submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - startedAt > 1000) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(check, 5);
    };
    check();
  });
}

function createElements() {
  const els = {};
  const selectors = [
    '[data-browser-shell]', '[data-browser-page-title]', '[data-browser-uri-input]',
    '[data-browser-address-form]', '[data-browser-back]', '[data-browser-forward]',
    '[data-browser-reload]', '[data-browser-drawer-toggle]', '[data-browser-resource-chip]',
    '[data-browser-owner-panel]', '[data-browser-using-selector]', '[data-browser-actor-panel]',
    '[data-browser-menu-trigger]', '[data-browser-menu]', '[data-browser-viewport]',
    '[data-browser-status-strip]', '[data-browser-status-state]', '[data-browser-status-renderer]',
    '[data-browser-status-txid]', '[data-browser-drawer]', '[data-browser-inspector]',
    '[data-browser-modal-root]', '[data-browser-toast]', '[data-browser-tabstrip]',
    '[data-browser-tabs-container]', '[data-browser-tab-new]',
  ];
  for (const s of selectors) els[s] = new FakeElement();
  return els;
}

function resolvedBot(uri, name) {
  name = name || 'Alice Bot';
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

const defaultActor = {
  id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
  isDefault: true, capabilities: ['private-chat', 'service-call', 'template-settings'],
};

function runtimePayload(overrides) {
  overrides = overrides || {};
  const actor = overrides.defaultActor === undefined ? defaultActor : overrides.defaultActor;
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor], defaultActor: actor,
      defaultUri: actor && actor.globalMetaId ? `metaid://${actor.globalMetaId}` : null,
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No Bot', noActorBody: 'Create a local Bot.', noActorAction: { label: 'Create Bot', href: '/ui/bot' } },
      ...overrides,
    },
  };
}

function createBrowserContext(options) {
  options = options || {};
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse || runtimePayload();
  const resolveResponse = options.resolveResponse || ((uri) => resolvedBot(uri));
  const documentListeners = new Map();
  const context = {
    console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
    },
    document: {
      readyState: 'complete', title: 'Agent Internet Browser',
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      addEventListener: (eventName, handler) => {
        if (!documentListeners.has(eventName)) documentListeners.set(eventName, []);
        documentListeners.get(eventName).push(handler);
      },
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimeResponse };
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        const payload = typeof resolveResponse === 'function' ? resolveResponse(uri) : resolveResponse;
        return { ok: true, json: async () => payload };
      }
      if (String(url).startsWith('/api/browser/settings')) {
        return { ok: true, json: async () => ({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } }) };
      }
      if (String(url).startsWith('/api/browser/cache')) {
        return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '-', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  context.globalThis = context;
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, documentListeners };
}

test('single tab navigation resolves and sets state.current on the active tab', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'runtime and resolve');
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');
});

test('tab title updates to the resolved page title after navigation', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'resolve');
  // The tab container innerHTML should mention the resolved bot name.
  assert.match(elements['[data-browser-tabs-container]'].innerHTML, /Alice Bot/);
});

test('openTab via AgentBrowserTabs creates a new active tab and navigates it', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const beforeCount = context.AgentBrowserTabs.getTabs().length;
  const newId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'new tab resolve');
  const tabs = context.AgentBrowserTabs.getTabs();
  assert.equal(tabs.length, beforeCount + 1);
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, newId);
  assert.equal(fetchCalls[2], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1bob&actorId=worker');
});

test('openTab with no uri creates an empty welcome tab without fetching', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const fetchesBefore = fetchCalls.length;
  const newId = context.AgentBrowserTabs.openTab();
  const tab = context.AgentBrowserTabs.getActiveTab();
  assert.equal(tab.id, newId);
  assert.equal(tab.uri, null);
  assert.equal(fetchCalls.length, fetchesBefore, 'no fetch for empty tab');
});

test('closeTab on the last tab auto-creates a fresh empty tab', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.closeTab(activeId);
  const tabs = context.AgentBrowserTabs.getTabs();
  assert.equal(tabs.length, 1);
  assert.notEqual(tabs[0].id, activeId);
  assert.equal(tabs[0].uri, null);
});

test('switchTab restores cached content without fetching', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const firstId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'second tab resolve');
  // switch back to the first tab — no new fetch
  const fetchesBefore = fetchCalls.length;
  context.AgentBrowserTabs.switchTab(firstId);
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, firstId);
  assert.equal(fetchCalls.length, fetchesBefore, 'switching uses cache, no fetch');
});

test('Ctrl+click on a viewport map-link opens a new tab', async () => {
  const { elements, context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const beforeCount = context.AgentBrowserTabs.getTabs().length;
  // Build a fake map-link target inside the viewport click handler.
  const linkTarget = { parentElement: null, getAttribute(n){ return n==='href'?'metaid://idq1bob':(n==='target'?'_blank':null);}, hasAttribute(n){return n==='data-browser-map-link';} };
  const clickEvent = { target: linkTarget, preventDefault(){}, ctrlKey: true, metaKey: false };
  elements['[data-browser-viewport]'].listeners.get('click')(clickEvent);
  await waitFor(() => fetchCalls.length === 3, 'ctrl-click new tab resolve');
  assert.equal(context.AgentBrowserTabs.getTabs().length, beforeCount + 1);
});

// Bug 1: a resolve that completes AFTER a tab switch must write its result to the
// ORIGINAL (navigating) tab, not the now-active one.
test('async resolve writes to the originating tab even after a mid-flight switch', async () => {
  // Per-uri controllable resolve responses: each returns a thenable we settle
  // independently, so we can complete alice's resolve while bob's stays pending.
  const pending = {};
  const settle = {};
  const makePending = (key) => {
    if (!pending[key]) {
      pending[key] = new Promise((resolve) => { settle[key] = resolve; });
    }
    return pending[key];
  };
  const { elements, context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    resolveResponse: (uri) => makePending(uri),
  });
  await waitFor(() => fetchCalls.length === 2, 'runtime and initial resolve');

  // Tab 1 (alice) is navigating and its resolve is still pending.
  const aliceTabId = context.AgentBrowserTabs.getActiveTab().id;
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');

  // While alice's resolve is in flight, open a second tab and switch to it.
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve started');
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, bobId);

  // Now settle alice's resolve ONLY. Bob is the active tab at this moment.
  settle['metaid://idq1alice'](resolvedBot('metaid://idq1alice', 'Alice Bot'));
  // Allow microtasks to flush so the resolveUri .then chain runs.
  await new Promise((r) => setTimeout(r, 30));

  // The active (bob) tab must NOT have been polluted with alice's result.
  assert.equal(elements['[data-browser-viewport]'].innerHTML.includes('Alice Bot'), false,
    'newly-active bob tab must not show the originating tab content');

  // The result must belong to the alice (originating) tab. Switching back to
  // alice must render her resolved content from cache.
  context.AgentBrowserTabs.switchTab(aliceTabId);
  await new Promise((r) => setTimeout(r, 10));
  assert.match(elements['[data-browser-viewport]'].innerHTML, /Alice Bot/,
    'originating tab should show its own resolved content after switching back');
});

// Bug 2: switching to a tab that is in the error state must restore its error
// view, not fall through to renderWelcome (which would clobber the error).
test('switching to an error-state tab restores its error view instead of Welcome', async () => {
  // First resolve fails; the active tab ends up in the error state.
  const { elements, context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    resolveResponse: () => ({ ok: false, message: 'boom no such resource' }),
  });
  await waitFor(() => fetchCalls.length === 2, 'runtime and failing resolve');
  await new Promise((r) => setTimeout(r, 10));
  // The active (alice) tab should show the resolve error.
  assert.match(elements['[data-browser-viewport]'].innerHTML, /Resolve failed/);
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');

  const errorTabId = context.AgentBrowserTabs.getActiveTab().id;

  // Open a second (welcome) tab and switch to it.
  context.AgentBrowserTabs.openTab();
  assert.notEqual(context.AgentBrowserTabs.getActiveTab().id, errorTabId);
  await new Promise((r) => setTimeout(r, 10));

  // Switch back to the error tab. It must STILL show the error, not Welcome.
  context.AgentBrowserTabs.switchTab(errorTabId);
  await new Promise((r) => setTimeout(r, 10));
  assert.match(elements['[data-browser-viewport]'].innerHTML, /Resolve failed/,
    'error tab should keep showing its error view after switching back');
  assert.equal(elements['[data-browser-viewport]'].innerHTML.includes('data-browser-welcome'), false,
    'error tab must not fall through to Welcome');
});
