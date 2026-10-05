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
    };
  }
  get value() { return this._value; }
  set value(value) { const next = String(value); this._value = next; this.valueHistory.push(next); }
  get innerHTML() {
    if (this.children && this.children.length) {
      return this.children
        .filter((c) => !(typeof c.hasAttribute === 'function' && c.hasAttribute('hidden')))
        .map((c) => c.innerHTML)
        .join('');
    }
    return this._innerHTML;
  }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
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
    '[data-browser-tab-context-menu]',
  ];
  for (const s of selectors) els[s] = new FakeElement();
  // The served page markup starts the context menu hidden (hidden attribute);
  // mirror that on the harness element.
  els['[data-browser-tab-context-menu]'].hidden = true;
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
  const hostMessages = [];
  const parentWindow = { postMessage: (message) => { hostMessages.push(message); } };
  const runtimeResponse = options.runtimeResponse || runtimePayload();
  const resolveResponse = options.resolveResponse || ((uri) => resolvedBot(uri));
  const documentListeners = new Map();
  const context = {
    console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
      parent: parentWindow,
    },
    document: {
      readyState: 'complete', title: 'Agent Internet Browser',
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      addEventListener: (eventName, handler) => {
        if (!documentListeners.has(eventName)) documentListeners.set(eventName, []);
        documentListeners.get(eventName).push(handler);
      },
      createElement: () => new FakeElement(),
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
  return { context, elements, fetchCalls, documentListeners, hostMessages, parentWindow };
}

// Find a tab's persistent content pane inside the fake viewport.
function findTabPaneElement(elements, tabId) {
  const viewport = elements['[data-browser-viewport]'];
  return viewport.children.find((child) => child.getAttribute('data-tab-pane') === String(tabId)) || null;
}

// Extract the host-bound events (agent-browser:event) captured by the parent stub.
function hostEvents(hostMessages) {
  return hostMessages.filter((message) => message && message.type === 'agent-browser:event');
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

test('openTab with an already-open uri switches to that tab instead of duplicating', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const existingId = context.AgentBrowserTabs.getActiveTab().id;
  const fetchesBefore = fetchCalls.length;
  const reusedId = context.AgentBrowserTabs.openTab('metaid://idq1alice');
  assert.equal(reusedId, existingId, 'returns the existing tab id');
  assert.equal(context.AgentBrowserTabs.getTabs().length, 1, 'no tab was created');
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, existingId);
  assert.equal(fetchCalls.length, fetchesBefore, 'no new resolve fetch for a reused tab');
});

test('openTab uri matching is trimmed and case-insensitive', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const existingId = context.AgentBrowserTabs.getActiveTab().id;
  const reusedId = context.AgentBrowserTabs.openTab('  METAID://IDQ1ALICE ');
  assert.equal(reusedId, existingId);
  assert.equal(context.AgentBrowserTabs.getTabs().length, 1);
  assert.equal(fetchCalls.length, 2, 'no new resolve fetch for a case-variant uri');
});

test('openTab dedupe matches a tab that is still loading the requested uri', async () => {
  let releaseBobResolve;
  const bobGate = new Promise((resolve) => { releaseBobResolve = resolve; });
  const { context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    resolveResponse: (uri) => (String(uri).includes('idq1bob') ? bobGate : resolvedBot(uri)),
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  // First open starts the (still pending) resolve on a second tab.
  context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve started');
  const loadingTabId = context.AgentBrowserTabs.getActiveTab().id;
  assert.equal(context.state.tabs.find((t) => t.id === loadingTabId).status, 'loading');
  // A second open request for the same uri must reuse the in-flight tab.
  const reusedId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  assert.equal(reusedId, loadingTabId, 'switches to the loading tab');
  assert.equal(context.AgentBrowserTabs.getTabs().length, 2, 'no duplicate tab');
  assert.equal(fetchCalls.filter((call) => call.includes('idq1bob')).length, 1, 'no second bob resolve');
  releaseBobResolve(resolvedBot('metaid://idq1bob'));
  await waitFor(() => {
    const tab = context.state.tabs.find((t) => t.id === loadingTabId);
    return tab && tab.status === 'resolved';
  }, 'bob resolve settled');
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, loadingTabId);
});

test('openTab with dedupe disabled always creates a new tab (explicit open-in-new-tab gesture)', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const existingId = context.AgentBrowserTabs.getActiveTab().id;
  const newId = context.AgentBrowserTabs.openTab('metaid://idq1alice', undefined, { dedupe: false });
  await waitFor(() => fetchCalls.length === 3, 'second resolve');
  assert.notEqual(newId, existingId);
  assert.equal(context.AgentBrowserTabs.getTabs().length, 2);
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, newId);
});

const reviewerActorTabs = {
  id: 'reviewer', label: 'Reviewer Bot', kind: 'oac-bot', globalMetaId: 'idq1reviewer',
  isDefault: false, capabilities: ['private-chat', 'service-call', 'template-settings'],
};

// The Using Actor is owned per tab. Selecting an actor in one tab must NOT
// affect another tab's actor — neither visually (the chip) nor at action time
// (the actorId query param stamped on resolve / trusted-action / signing calls).
test('per-tab actor: selecting actors in two tabs stays independent across switches', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    runtimeResponse: runtimePayload({ actors: [defaultActor, reviewerActorTabs] }),
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');

  // Tab 1 (boot): default actor is 'worker'.
  const tab1Id = context.AgentBrowserTabs.getActiveTab().id;
  assert.equal(context.state.actorId, 'worker');
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Using: Worker Bot/);

  // Open Tab 2 and switch its actor to 'reviewer'.
  context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'tab 2 resolve');
  const tab2Id = context.AgentBrowserTabs.getActiveTab().id;
  assert.notEqual(tab2Id, tab1Id);
  // The new tab inherits the host default actor ('worker').
  assert.equal(context.state.actorId, 'worker');
  await context.selectUsingIdentity('reviewer');
  assert.equal(context.state.actorId, 'reviewer');
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Using: Reviewer Bot/);

  // Switch back to Tab 1: its actor is still 'worker' (chip + state restored).
  context.AgentBrowserTabs.switchTab(tab1Id);
  assert.equal(context.state.actorId, 'worker');
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Using: Worker Bot/);
  const tab1 = context.state.tabs.find((t) => t.id === tab1Id);
  const tab2 = context.state.tabs.find((t) => t.id === tab2Id);
  assert.equal(tab1.actorId, 'worker');
  assert.equal(tab2.actorId, 'reviewer');

  // A navigation in Tab 1 must carry Tab 1's actor ('worker'), not Tab 2's.
  const fetchesBefore = fetchCalls.length;
  await context.navigateTo('metaid://idq1carol');
  await waitFor(() => fetchCalls.length === fetchesBefore + 1, 'tab 1 re-resolve');
  assert.equal(
    fetchCalls[fetchCalls.length - 1],
    '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1carol&actorId=worker',
    'tab 1 resolve must carry tab 1 actor, not tab 2 actor'
  );

  // Switch to Tab 2 and navigate: it must carry Tab 2's actor ('reviewer').
  context.AgentBrowserTabs.switchTab(tab2Id);
  const tab2FetchesBefore = fetchCalls.length;
  await context.navigateTo('metaid://idq1dave');
  await waitFor(() => fetchCalls.length === tab2FetchesBefore + 1, 'tab 2 re-resolve');
  const tab2Fetch = fetchCalls[fetchCalls.length - 1];
  assert.ok(
    tab2Fetch.indexOf('actorId=reviewer') !== -1,
    `tab 2 resolve must carry tab 2 actor; got ${tab2Fetch}`
  );
});

// A host may open a tab with a specific actor via the optional actorId arg.
test('per-tab actor: openTab(uri, actorId) seeds the new tab with the requested actor', async () => {
  const { context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    runtimeResponse: runtimePayload({ actors: [defaultActor, reviewerActorTabs] }),
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');

  const newId = context.AgentBrowserTabs.openTab('metaid://idq1bob', 'reviewer');
  await waitFor(() => fetchCalls.length === 3, 'new tab resolve');
  const active = context.AgentBrowserTabs.getActiveTab();
  assert.equal(active.id, newId);
  assert.equal(active.actorId, 'reviewer');
  assert.equal(context.state.actorId, 'reviewer');
  // The resolve call for the new tab carries the requested actor.
  assert.ok(
    fetchCalls[2].indexOf('actorId=reviewer') !== -1,
    `new-tab resolve must carry requested actorId; got ${fetchCalls[2]}`
  );
  // An unknown actorId falls back to the host default actor.
  const fallbackId = context.AgentBrowserTabs.openTab('metaid://idq1erin', 'does-not-exist');
  await waitFor(() => fetchCalls.length === 4, 'fallback tab resolve');
  const fallbackTab = context.state.tabs.find((t) => t.id === fallbackId);
  assert.equal(fallbackTab.actorId, 'worker', 'unknown actorId falls back to host default');
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

// --- R1: tab content extraction --------------------------------------------

test('getTabContent extracts text and metadata from the active tab pane', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'tab current set');
  const content = context.AgentBrowserTabs.getTabContent();
  assert.equal(content.tabId, context.AgentBrowserTabs.getActiveTab().id);
  assert.equal(content.uri, 'metaid://idq1alice');
  assert.equal(content.title, 'Alice Bot');
  assert.equal(content.contentType, 'application/vnd.oac.bot-homepage+json');
  assert.match(content.text, /Alice Bot/);
  assert.match(content.html, /Alice Bot/);
  assert.equal(content.truncated, false);
  assert.equal(typeof content.extractedAt, 'number');
  // Same result when addressed by explicit id; null for an unknown id.
  assert.equal(context.AgentBrowserTabs.getTabContent(content.tabId).uri, 'metaid://idq1alice');
  assert.equal(context.AgentBrowserTabs.getTabContent(9999), null);
});

test('getTabContent reads a background (hidden) tab pane without switching', async () => {
  const { context, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    resolveResponse: (uri) => resolvedBot(uri, uri.includes('bob') ? 'Bob Bot' : 'Alice Bot'),
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const aliceTabId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1bob', 'bob current set');
  // Alice's tab is now hidden in the background; its pane content must still read.
  const content = context.AgentBrowserTabs.getTabContent(aliceTabId);
  assert.equal(content.tabId, aliceTabId);
  assert.equal(content.uri, 'metaid://idq1alice');
  assert.match(content.text, /Alice Bot/);
  assert.equal(context.AgentBrowserTabs.getActiveTab().uri, 'metaid://idq1bob', 'active tab untouched');
});

test('getTabContent truncates oversized pane text and flags it', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const tabId = context.AgentBrowserTabs.getActiveTab().id;
  const pane = findTabPaneElement(elements, tabId);
  assert.ok(pane, 'pane exists for the active tab');
  pane.innerHTML = `start ${'x'.repeat(60000)} end`;
  const content = context.AgentBrowserTabs.getTabContent(tabId);
  assert.equal(content.truncated, true);
  assert.equal(content.text.length, 50000);
  assert.match(content.text, /^start x+/);
});

test('getTabInfo returns a cloned resolve envelope that cannot mutate state', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'tab current set');
  const info = context.AgentBrowserTabs.getTabInfo();
  assert.equal(info.id, context.AgentBrowserTabs.getActiveTab().id);
  assert.equal(info.isActive, true);
  assert.equal(info.uri, 'metaid://idq1alice');
  assert.equal(info.current.uri, 'metaid://idq1alice');
  assert.equal(info.current.renderer.type, 'bot-page');
  assert.equal(info.current.owner.globalMetaId, 'idq1alice');
  // Mutating the returned envelope must not affect browser state.
  info.current.title = 'HACKED';
  assert.equal(context.AgentBrowserTabs.getTabInfo().current.title, 'Alice Bot');
  assert.equal(context.AgentBrowserTabs.getTabInfo(9999), null);
});

// --- R2: browser events pushed to the host ---------------------------------

test('host events fire for navigation, tab open/switch/close, and title updates', async () => {
  const { context, fetchCalls, hostMessages } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
    resolveResponse: (uri) => resolvedBot(uri, uri.includes('bob') ? 'Bob Bot' : 'Alice Bot'),
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'tab current set');
  const aliceTabId = context.AgentBrowserTabs.getActiveTab().id;

  // Initial navigation committed on the seed tab, with a title update.
  const initialEvents = hostEvents(hostMessages);
  const navAlice = initialEvents.find((message) => message.event === 'navigation-committed');
  // Payloads are created inside the vm realm, so compare fields, not identity.
  assert.equal(navAlice.payload.tabId, aliceTabId);
  assert.equal(navAlice.payload.uri, 'metaid://idq1alice');
  assert.equal(navAlice.payload.title, 'Alice Bot');
  assert.ok(initialEvents.some((message) => message.event === 'title-updated'
    && message.payload.tabId === aliceTabId && message.payload.title === 'Alice Bot'));

  // openTab emits tab-opened + tab-activated, then navigation-committed on resolve.
  const bobTabId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1bob', 'bob current set');
  const afterOpen = hostEvents(hostMessages);
  assert.ok(afterOpen.some((message) => message.event === 'tab-opened'
    && message.payload.tabId === bobTabId && message.payload.uri === 'metaid://idq1bob'));
  assert.ok(afterOpen.some((message) => message.event === 'tab-activated' && message.payload.tabId === bobTabId));
  assert.ok(afterOpen.some((message) => message.event === 'navigation-committed'
    && message.payload.tabId === bobTabId && message.payload.title === 'Bob Bot'));

  // switchTab emits tab-activated with uri/title context.
  context.AgentBrowserTabs.switchTab(aliceTabId);
  const activated = hostEvents(hostMessages).filter((message) => message.event === 'tab-activated');
  const lastActivated = activated[activated.length - 1];
  assert.equal(lastActivated.payload.tabId, aliceTabId);
  assert.equal(lastActivated.payload.uri, 'metaid://idq1alice');
  assert.equal(lastActivated.payload.title, 'Alice Bot');

  // title-updated is value-guarded: re-applying the same title emits nothing.
  const titleEventsBefore = hostEvents(hostMessages).filter((message) => message.event === 'title-updated').length;
  context.AgentBrowserTabs.switchTab(aliceTabId);
  const titleEventsAfter = hostEvents(hostMessages).filter((message) => message.event === 'title-updated').length;
  assert.equal(titleEventsAfter, titleEventsBefore, 'no duplicate title-updated for an unchanged title');

  // closeTab emits tab-closed, then tab-activated for the neighbor that takes over.
  context.AgentBrowserTabs.closeTab(aliceTabId);
  const afterClose = hostEvents(hostMessages);
  assert.ok(afterClose.some((message) => message.event === 'tab-closed' && message.payload.tabId === aliceTabId));
  const activations = afterClose.filter((message) => message.event === 'tab-activated');
  assert.equal(activations[activations.length - 1].payload.tabId, bobTabId);
});

test('closing the last tab emits tab-closed then tab-opened/tab-activated for the fresh tab', async () => {
  const { context, fetchCalls, hostMessages } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const onlyTabId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.closeTab(onlyTabId);
  const events = hostEvents(hostMessages);
  const closedIndex = events.findIndex((message) => message.event === 'tab-closed' && message.payload.tabId === onlyTabId);
  assert.ok(closedIndex !== -1, 'tab-closed emitted');
  const freshTabId = context.AgentBrowserTabs.getActiveTab().id;
  const openedIndex = events.findIndex((message) => message.event === 'tab-opened' && message.payload.tabId === freshTabId);
  assert.ok(openedIndex > closedIndex, 'fresh tab-opened follows tab-closed');
  assert.ok(events.some((message, index) => index > closedIndex && message.event === 'tab-activated'
    && message.payload.tabId === freshTabId), 'fresh tab-activated follows tab-closed');
});

// --- R1/R3: host postMessage request/response ------------------------------

test('agent-browser:get-content message round-trips a correlated response to the host', async () => {
  const { context, fetchCalls, hostMessages, parentWindow } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'tab current set');

  context.handleBrowserMessage({ source: parentWindow, data: { type: 'agent-browser:get-content', requestId: 'r1' } });
  const response = hostMessages.find((message) => message.type === 'agent-browser:get-content:response');
  assert.equal(response.requestId, 'r1');
  assert.equal(response.ok, true);
  assert.equal(response.result.uri, 'metaid://idq1alice');
  assert.match(response.result.text, /Alice Bot/);

  context.handleBrowserMessage({ source: parentWindow, data: { type: 'agent-browser:get-content', requestId: 'r2', tabId: 9999 } });
  const errorResponse = hostMessages.filter((message) => message.type === 'agent-browser:get-content:response')[1];
  assert.equal(errorResponse.requestId, 'r2');
  assert.equal(errorResponse.ok, false);
  assert.equal(errorResponse.error.code, 'tab_not_found');
});

test('agent-browser:get-tab-info message returns the resolve envelope', async () => {
  const { context, fetchCalls, hostMessages, parentWindow } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'tab current set');

  context.handleBrowserMessage({ source: parentWindow, data: { type: 'agent-browser:get-tab-info', requestId: 'r3' } });
  const response = hostMessages.find((message) => message.type === 'agent-browser:get-tab-info:response');
  assert.equal(response.requestId, 'r3');
  assert.equal(response.ok, true);
  assert.equal(response.result.current.uri, 'metaid://idq1alice');
  assert.equal(response.result.current.owner.globalMetaId, 'idq1alice');
});

test('host request messages from a non-parent source are ignored', async () => {
  const { context, fetchCalls, hostMessages } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const notParent = { postMessage() {} };
  context.handleBrowserMessage({ source: notParent, data: { type: 'agent-browser:get-content', requestId: 'rx' } });
  assert.equal(hostMessages.some((message) => message.type === 'agent-browser:get-content:response'), false,
    'no response is posted for a non-parent source');
});

// --- Back/Forward toolbar sync after in-tab navigation ----------------------

// Regression: an empty new tab disables Back/Forward, and only tab-lifecycle
// events used to re-sync the toolbar — navigating inside the tab never
// re-enabled the buttons, leaving Back stuck disabled forever.
test('empty new tab then two navigations re-enable the Back button', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');

  context.AgentBrowserTabs.openTab();
  assert.equal(elements['[data-browser-back]'].disabled, true, 'fresh empty tab: Back disabled');
  assert.equal(elements['[data-browser-forward]'].disabled, true, 'fresh empty tab: Forward disabled');

  await context.navigateTo('metaid://idq1bob');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1bob', 'first navigation');
  await context.navigateTo('metaid://idq1carol');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1carol', 'second navigation');

  assert.equal(elements['[data-browser-back]'].disabled, false, 'Back re-enabled after in-tab navigation');
  assert.equal(elements['[data-browser-forward]'].disabled, true, 'Forward stays disabled at the newest entry');
});

test('goBack and goForward keep the Back/Forward buttons in sync with historyIndex', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  await context.navigateTo('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'second navigation');

  assert.equal(elements['[data-browser-back]'].disabled, false, 'historyIndex 1: Back enabled');
  assert.equal(elements['[data-browser-forward]'].disabled, true, 'historyIndex 1: Forward disabled');

  await context.goBack();
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1alice', 'back navigation');
  assert.equal(elements['[data-browser-back]'].disabled, true, 'historyIndex 0: Back disabled');
  assert.equal(elements['[data-browser-forward]'].disabled, false, 'historyIndex 0: Forward enabled');

  await context.goForward();
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1bob', 'forward navigation');
  assert.equal(elements['[data-browser-back]'].disabled, false, 'back at newest entry: Back enabled');
  assert.equal(elements['[data-browser-forward]'].disabled, true, 'back at newest entry: Forward disabled');
});

// --- PR1: tab context menu / pinned / rename / undo close --------------------
//
// The context menu is a delegated contextmenu listener on the tab strip plus
// one shared overlay element; dispatch helpers below feed synthetic events
// into the registered listeners (same pattern the click-triggered tests use).

function delegatableTarget(attrName, attrValue, disabled) {
  return {
    getAttribute: (name) => (name === attrName ? String(attrValue) : ''),
    hasAttribute: (name) => name === attrName,
    disabled: !!disabled,
    parentElement: null,
  };
}

// Right-click (contextmenu event) on the strip, targeting one tab.
function dispatchTabContextMenu(elements, tabId) {
  const listener = elements['[data-browser-tabs-container]'].listeners.get('contextmenu');
  listener({
    preventDefault() {}, stopPropagation() {}, clientX: 24, clientY: 10,
    target: delegatableTarget('data-tab-id', tabId),
  });
}

function dispatchTabMenuClick(elements, action, disabled) {
  const listener = elements['[data-browser-tab-context-menu]'].listeners.get('click');
  listener({
    preventDefault() {}, stopPropagation() {},
    target: delegatableTarget('data-browser-tab-ctx-action', action, disabled),
  });
}

// Rename through the context menu + modal, asserting the intermediate states.
function renameTabViaMenu(elements, activeId, value) {
  dispatchTabContextMenu(elements, activeId);
  const menu = elements['[data-browser-tab-context-menu]'];
  assert.equal(menu.hidden, false, 'context menu opened');
  dispatchTabMenuClick(elements, 'rename');
  const modalRoot = elements['[data-browser-modal-root]'];
  assert.equal(modalRoot.hidden, false, 'rename modal opened');
  const input = modalRoot.querySelector('[data-browser-tab-rename-input]');
  input.value = value;
  const dispatcher = modalRoot.listeners.get('click');
  dispatcher({
    preventDefault() {}, stopPropagation() {},
    target: delegatableTarget('data-browser-modal-action', 'tab-rename'),
  });
  return modalRoot;
}

test('openTab second-arg label form sets TabInfo.label and is shown in the strip', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const newId = context.AgentBrowserTabs.openTab('metaid://idq1bob', { label: 'Bob Review' });
  await waitFor(() => fetchCalls.length === 3, 'openTab resolve');

  const tabs = context.AgentBrowserTabs.getTabs();
  const opened = tabs.find((tab) => tab.id === newId);
  assert.equal(opened.label, 'Bob Review', 'label override lands in TabInfo');
  assert.ok(!('label' in tabs.find((tab) => tab.id !== newId)), 'ordinary tabs keep the older five-field shape');
  assert.ok(!('pinned' in opened), 'unpinned tabs carry no pinned field');
  const stripHtml = elements['[data-browser-tabs-container]'].innerHTML;
  assert.match(stripHtml, /Bob Review/, 'strip shows the label override');
});

test('openTab with an empty label option behaves like the plain call', async () => {
  const { context, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const newId = context.AgentBrowserTabs.openTab('metaid://idq1bob', { label: '   ' });
  await waitFor(() => fetchCalls.length === 3, 'openTab resolve');
  const opened = context.AgentBrowserTabs.getTabs().find((tab) => tab.id === newId);
  assert.ok(!('label' in opened), 'blank label does not create a label field');
});

test('context menu opens on right-click with the expected items', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;

  dispatchTabContextMenu(elements, activeId);
  const menu = elements['[data-browser-tab-context-menu]'];
  assert.equal(menu.hidden, false, 'menu visible');
  const menuHtml = menu.innerHTML;
  for (const item of ['Close tab', 'Close other tabs', 'Close tabs to the right', 'Pin', 'Rename…']) {
    assert.match(menuHtml, new RegExp(escapeRegExp(item)), `menu has "${item}"`);
  }
  assert.match(menuHtml, /data-browser-tab-ctx-action="reopen-closed" disabled/, 'Reopen closed tab disabled with an empty stack');
});

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('close other tabs keeps the anchor tab and pinned tabs', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  const carolId = context.AgentBrowserTabs.openTab('metaid://idq1carol');
  await waitFor(() => fetchCalls.length === 4, 'three resolves');

  // Pin the base tab via the context menu: bulk closes must skip it.
  dispatchTabContextMenu(elements, baseId);
  dispatchTabMenuClick(elements, 'pin');
  assert.equal(context.AgentBrowserTabs.getTabs().find((tab) => tab.id === baseId).pinned, true, 'base tab pinned');

  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'close-others');
  // Array.from: getTabs() hands out a vm-realm array; deepStrictEqual compares
  // prototypes, so bring the copy into the host realm first.
  const remaining = Array.from(context.AgentBrowserTabs.getTabs(), (tab) => tab.id).sort((a, b) => a - b);
  assert.deepEqual(remaining, [baseId, bobId].sort((a, b) => a - b), 'only the anchor and pinned tabs remain');

  // Undo close walks the stack from the most recent entry: Carol first.
  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'reopen-closed');
  await waitFor(() => context.AgentBrowserTabs.getTabs().some((tab) => tab.uri === 'metaid://idq1carol'), 'carol restored');
  // The stack is drained: a further reopen is a no-op.
  const tabsAfterOneRestore = context.AgentBrowserTabs.getTabs().length;
  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'reopen-closed');
  assert.equal(context.AgentBrowserTabs.getTabs().length, tabsAfterOneRestore, 'empty stack: reopen is a no-op');
});

test('close tabs to the right removes only later strip tabs and keeps pinned', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  const carolId = context.AgentBrowserTabs.openTab('metaid://idq1carol');
  await waitFor(() => fetchCalls.length === 4, 'three resolves');

  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'close-right');
  // Array.from: see the realm note in the close-others test above.
  const remaining = Array.from(context.AgentBrowserTabs.getTabs(), (tab) => tab.id).sort((a, b) => a - b);
  assert.deepEqual(remaining, [baseId, bobId].sort((a, b) => a - b), 'carol (right of bob) is closed');
});

test('pin and unpin reset the strip order and TabInfo.pinned', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  const carolId = context.AgentBrowserTabs.openTab('metaid://idq1carol');
  await waitFor(() => fetchCalls.length === 4, 'three resolves');
  const stripHtml = () => elements['[data-browser-tabs-container]'].innerHTML;

  dispatchTabContextMenu(elements, carolId);
  dispatchTabMenuClick(elements, 'pin');
  const carolInfo = context.AgentBrowserTabs.getTabs().find((tab) => tab.id === carolId);
  assert.equal(carolInfo.pinned, true, 'pinned flag set');
  const html = stripHtml();
  assert.ok(
    html.indexOf(`data-tab-id="${carolId}"`) < html.indexOf(`data-tab-id="${baseId}"`),
    'pinned tab renders before unpinned tabs',
  );
  assert.ok(
    html.indexOf(`data-tab-id="${carolId}"`) < html.indexOf(`data-tab-id="${bobId}"`),
    'pinned tab renders before the other unpinned tab',
  );
  assert.match(html, /is-pinned/, 'pinned visual class present');

  // Unpin flips the flag back and restores creation order.
  dispatchTabContextMenu(elements, carolId);
  assert.match(elements['[data-browser-tab-context-menu]'].innerHTML, /Unpin/, 'menu label switches to Unpin');
  dispatchTabMenuClick(elements, 'pin');
  const carolAfter = context.AgentBrowserTabs.getTabs().find((tab) => tab.id === carolId);
  assert.ok(!('pinned' in carolAfter), 'unpinned tabs carry no pinned field');
  const htmlAfter = stripHtml();
  assert.ok(
    htmlAfter.indexOf(`data-tab-id="${carolId}"`) > htmlAfter.indexOf(`data-tab-id="${bobId}"`),
    'unpinned tab renders after its senior sibling again',
  );
});

test('rename via context menu writes the override shown in TabInfo and the strip', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;

  renameTabViaMenu(elements, activeId, 'My Named Tab');
  const info = context.AgentBrowserTabs.getActiveTab();
  assert.equal(info.label, 'My Named Tab', 'rename override stored');
  assert.match(elements['[data-browser-tabs-container]'].innerHTML, /My Named Tab/, 'strip shows the renamed label');
  assert.equal(elements['[data-browser-modal-root]'].hidden, true, 'rename modal closed after confirm');
  assert.equal(fetchCalls.length, 2, 'rename does not navigate');
});

test('rename override survives later navigation-committed title updates', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;
  renameTabViaMenu(elements, activeId, 'Alice Home');

  // A committed navigation recomputes the resource title; the override stays.
  await context.navigateTo('metaid://idq1bob');
  await waitFor(() => context.AgentBrowserTabs.getActiveTab().uri === 'metaid://idq1bob', 'second navigation');
  assert.equal(context.AgentBrowserTabs.getActiveTab().label, 'Alice Home', 'override survived the commit');
  const stripHtml = elements['[data-browser-tabs-container]'].innerHTML;
  assert.match(stripHtml, /Alice Home/, 'strip still shows the override');
});

test('rename with an empty field clears the override', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const activeId = context.AgentBrowserTabs.getActiveTab().id;
  renameTabViaMenu(elements, activeId, 'Temp Name');
  assert.equal(context.AgentBrowserTabs.getActiveTab().label, 'Temp Name');

  renameTabViaMenu(elements, activeId, '');
  const info = context.AgentBrowserTabs.getActiveTab();
  assert.ok(!('label' in info), 'empty rename clears the label field');
  assert.match(elements['[data-browser-tabs-container]'].innerHTML, /Alice Bot/, 'strip falls back to the page title');
});

test('context menu Close tab closes the targeted tab', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve');

  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'close-tab');
  assert.ok(!context.AgentBrowserTabs.getTabs().some((tab) => tab.id === bobId), 'bob closed by the menu action');
  assert.equal(context.AgentBrowserTabs.getActiveTab().id, baseId, 'base tab became active');
});

test('undo close restores the tab with its uri and pinned/label state', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob', { label: 'Bob Note' });
  await waitFor(() => fetchCalls.length === 3, 'bob resolve');

  dispatchTabContextMenu(elements, bobId);
  dispatchTabMenuClick(elements, 'pin');
  assert.equal(context.AgentBrowserTabs.getTabs().find((tab) => tab.id === bobId).pinned, true, 'pinned before close');

  context.AgentBrowserTabs.closeTab(bobId);
  assert.ok(!context.AgentBrowserTabs.getTabs().some((tab) => tab.id === bobId), 'bob is gone after close');

  dispatchTabContextMenu(elements, baseId);
  dispatchTabMenuClick(elements, 'reopen-closed');
  await waitFor(() => {
    const tabs = context.AgentBrowserTabs.getTabs();
    return tabs.some((tab) => tab.uri === 'metaid://idq1bob' && tab.label === 'Bob Note' && tab.pinned);
  }, 'bob restored with label and pinned state');

  // The stack is empty again: a fresh menu shows the reopen item disabled.
  dispatchTabContextMenu(elements, baseId);
  assert.match(
    elements['[data-browser-tab-context-menu]'].innerHTML,
    /data-browser-tab-ctx-action="reopen-closed" disabled/,
    'reopen disabled once the stack drained',
  );
});

test('closing the last tab then undo replaces the untouched placeholder', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const baseId = context.AgentBrowserTabs.getActiveTab().id;

  context.AgentBrowserTabs.closeTab(baseId);
  assert.equal(context.AgentBrowserTabs.getTabs().length, 1, 'placeholder keeps the window alive');

  dispatchTabContextMenu(elements, context.AgentBrowserTabs.getActiveTab().id);
  dispatchTabMenuClick(elements, 'reopen-closed');
  await waitFor(() => {
    const tabs = context.AgentBrowserTabs.getTabs();
    return tabs.length === 1 && tabs[0].uri === 'metaid://idq1alice';
  }, 'placeholder replaced by the restored tab');
});

test('Cmd+Shift+T and Ctrl+Shift+T reopen the most recently closed tab', async () => {
  const { context, elements, documentListeners, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const bobId = context.AgentBrowserTabs.openTab('metaid://idq1bob');
  await waitFor(() => fetchCalls.length === 3, 'bob resolve');
  context.AgentBrowserTabs.closeTab(bobId);

  const keydownListeners = documentListeners.get('keydown');
  assert.ok(Array.isArray(keydownListeners) && keydownListeners.length >= 1, 'a document keydown listener is registered');
  let preventDefaultCalled = false;
  for (const handler of keydownListeners) {
    handler({
      key: 't', shiftKey: true, ctrlKey: false, metaKey: true,
      preventDefault() { preventDefaultCalled = true; },
    });
  }
  await waitFor(() => context.AgentBrowserTabs.getTabs().some((tab) => tab.uri === 'metaid://idq1bob'), 'bob restored by Cmd+Shift+T');
  assert.equal(preventDefaultCalled, true, 'preventDefault when a reopen happened');

  // Ctrl variant (non-mac) restores the initial tab after a close.
  const baseId = context.AgentBrowserTabs.getActiveTab().id;
  context.AgentBrowserTabs.closeTab(baseId);
  let ctrlPrevented = false;
  for (const handler of keydownListeners) {
    handler({
      key: 'T', shiftKey: true, ctrlKey: true, metaKey: false,
      preventDefault() { ctrlPrevented = true; },
    });
  }
  await waitFor(() => context.AgentBrowserTabs.getTabs().some((tab) => tab.uri && tab.uri.toLowerCase().indexOf('alice') !== -1), 'initial tab restored by Ctrl+Shift+T');
  assert.equal(ctrlPrevented, true);
});

test('right-click outside a tab does not open the menu and Escape dismisses it', async () => {
  const { context, elements, documentListeners, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');

  // Right-click on the strip but NOT on a tab (no data-tab-id target).
  const listener = elements['[data-browser-tabs-container]'].listeners.get('contextmenu');
  listener({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0, target: { getAttribute: () => '', hasAttribute: () => false, parentElement: null } });
  assert.equal(elements['[data-browser-tab-context-menu]'].hidden, true, 'no menu for a non-tab target');

  dispatchTabContextMenu(elements, context.AgentBrowserTabs.getActiveTab().id);
  assert.equal(elements['[data-browser-tab-context-menu]'].hidden, false, 'menu open');
  for (const handler of documentListeners.get('keydown')) {
    handler({ key: 'Escape', preventDefault() {} });
  }
  assert.equal(elements['[data-browser-tab-context-menu]'].hidden, true, 'Escape closed the menu');
});

test('bridge open-tab message accepts a label pass-through', async () => {
  const { context, hostMessages, parentWindow, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1alice',
  });
  await waitFor(() => fetchCalls.length === 2, 'initial resolve');
  const before = context.AgentBrowserTabs.getTabs().length;
  context.handleBrowserMessage({ source: parentWindow, data: { type: 'agent-browser:open-tab', uri: 'metaid://idq1carol', label: 'Carol Launched' } });
  await waitFor(() => fetchCalls.length === 3, 'carol resolve');
  const tabs = context.AgentBrowserTabs.getTabs();
  assert.equal(tabs.length, before + 1);
  assert.equal(tabs.find((tab) => tab.title === 'Carol Bot' || tab.label === 'Carol Launched').label, 'Carol Launched',
    'the opened tab carries the label');
});
