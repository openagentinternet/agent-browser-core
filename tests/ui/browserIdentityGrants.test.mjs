import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

const IDENTITY_GRANTS_KEY = 'agent-browser:identity-grants';

class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.hidden = false;
    this.attrs = {};
    this.listeners = new Map();
    this.children = [];
    this._parent = null;
    this.childrenBySelector = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
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
    return idx === -1 ? null : (idx + 1 < this._parent.children.length ? this._parent.children[idx + 1] : null);
  }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) { return this.childrenBySelector.get(selector) || null; }
  setChild(selector, value) { this.childrenBySelector.set(selector, value); }
}

function browserActionTarget(attrs) {
  return {
    parentElement: null,
    getAttribute: (name) => attrs[name] || '',
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

function tabPane(nodes, tabId = 1) {
  const viewport = nodes['[data-browser-viewport]'];
  return viewport.children.find(
    (child) => typeof child.getAttribute === 'function' && child.getAttribute('data-tab-pane') === String(tabId),
  ) || null;
}

function setTabFrameWindow(nodes, frameWindow, tabId = 1) {
  const pane = tabPane(nodes, tabId);
  assert.ok(pane, `expected tab pane ${tabId} to exist`);
  pane.setChild('iframe.browser-html-frame', { contentWindow: frameWindow });
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() - startedAt > 1000) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(check, 5);
    };
    check();
  });
}

function elements() {
  return {
    '[data-browser-shell]': new FakeElement(),
    '[data-browser-uri-input]': new FakeElement(),
    '[data-browser-address-form]': new FakeElement(),
    '[data-browser-back]': new FakeElement(),
    '[data-browser-forward]': new FakeElement(),
    '[data-browser-reload]': new FakeElement(),
    '[data-browser-drawer-toggle]': new FakeElement(),
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-auto-write]': new FakeElement(),
  };
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

function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
  const storage = options.storage ?? createMemoryStorage();
  if (options.seedIdentityGrants !== undefined) {
    storage.setItem(IDENTITY_GRANTS_KEY, JSON.stringify(options.seedIdentityGrants));
  }
  const hostMessages = [];
  const parentWindow = { postMessage: (message) => hostMessages.push(message) };
  const windowListeners = new Map();
  const runtime = options.runtime || {};
  const context = {
    console,
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Promise,
    String,
    Error,
    setTimeout,
    clearTimeout,
    window: {
      location: { search: options.locationSearch ?? `?uri=${encodeURIComponent('metaapp://pin')}` },
      history: { replaceState() {} },
      localStorage: storage,
      addEventListener(eventName, handler) { windowListeners.set(eventName, handler); },
      parent: parentWindow,
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url) => {
      if (String(url).startsWith('/api/browser/runtime')) {
        return { ok: true, json: async () => ({ ok: true, data: runtime }) };
      }
      if (String(url).startsWith('/api/browser/resolve')) {
        const parsed = new URL(String(url), 'http://browser.test');
        const uri = parsed.searchParams.get('uri') || '';
        const byUri = options.resolveByUri || {};
        const payload = byUri[uri] || resolvePayload;
        return { ok: true, json: async () => ({ ok: true, data: payload }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes, storage, hostMessages, parentWindow, windowListeners };
}

function result(overrides = {}) {
  return {
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture',
    owner: { kind: 'metaapp-publisher', name: 'Fixture Publisher', verificationState: 'partial' },
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'https://metaweb.example/app' },
    actions: [],
    sections: [],
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'fixture' },
    ...overrides,
  };
}

function runtimeWithActor(overrides = {}) {
  const actor = {
    id: 'standalone:actor',
    label: 'Bob',
    kind: 'wallet',
    globalMetaId: 'idq1actor',
    isDefault: true,
    capabilities: [],
  };
  return {
    host: { kind: 'standalone', name: 'Standalone', localMode: true },
    actors: [actor],
    defaultActor: actor,
    defaultUri: null,
    features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
    labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    ...overrides,
  };
}

function postBridgeRequest(windowListeners, sourceWindow, request) {
  const listener = windowListeners.get('message');
  listener({
    source: sourceWindow,
    data: { type: 'agent-browser:request', version: 1, ...request },
  });
}

function frameWindow() {
  return {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
}

function seedGrant(overrides = {}) {
  return {
    appUri: 'metaapp://pin',
    appTitle: 'Fixture',
    identity: { globalMetaId: 'idq1actor', name: 'Bob' },
    grantedAt: 1000,
    lastUsedAt: 1000,
    ...overrides,
  };
}

async function bootFrame(run) {
  const activeFrame = frameWindow();
  await waitFor(() => run.nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(run.nodes, activeFrame);
  return activeFrame;
}

test('first browser.actor.current opens the Identity request panel and Allow persists a grant', async () => {
  const run = runWithResolve(result(), { runtime: runtimeWithActor() });
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-1', method: 'browser.actor.current' });
  assert.deepEqual(activeFrame.postMessageCalls, [], 'no response until the panel is answered');
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(run.nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);
  assert.match(run.nodes['[data-browser-modal-root]'].innerHTML, /actor-consent-allow/);

  run.nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'actor response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrame.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-1',
    ok: true,
    result: { actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Bob' } },
  });
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, true);

  const stored = JSON.parse(run.storage.getItem(IDENTITY_GRANTS_KEY));
  assert.equal(stored.version, 1);
  assert.equal(stored.grants.length, 1);
  assert.equal(stored.grants[0].appUri, 'metaapp://pin');
  assert.equal(stored.grants[0].appTitle, 'Fixture');
  assert.deepEqual(stored.grants[0].identity, { globalMetaId: 'idq1actor', name: 'Bob' });
  assert.equal(typeof stored.grants[0].grantedAt, 'number');
  assert.equal(typeof stored.grants[0].lastUsedAt, 'number');
});

test('a persisted grant auto-allows browser.actor.current after reload without the panel', async () => {
  const run = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    seedIdentityGrants: { version: 1, grants: [seedGrant()] },
  });
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-2', method: 'browser.actor.current' });
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'auto-allowed actor response');
  assert.equal(activeFrame.postMessageCalls[0].ok, true);
  assert.equal(activeFrame.postMessageCalls[0].result.actor.globalMetaId, 'idq1actor');
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, true, 'no Identity request panel');

  const stored = JSON.parse(run.storage.getItem(IDENTITY_GRANTS_KEY));
  assert.equal(stored.grants.length, 1);
  assert.equal(stored.grants[0].grantedAt, 1000, 'grantedAt is preserved');
  assert.ok(stored.grants[0].lastUsedAt > 1000, 'lastUsedAt is refreshed on reuse');
});

test('a grant for the app covers deep links with launch query parameters', async () => {
  const deepLink = result({ uri: 'metaapp://pin?view=buzz', normalizedUri: 'metaapp://pin?view=buzz' });
  const run = runWithResolve(deepLink, {
    runtime: runtimeWithActor(),
    resolveByUri: { 'metaapp://pin?view=buzz': deepLink },
    seedIdentityGrants: { version: 1, grants: [seedGrant()] },
  });
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-3', method: 'browser.actor.current' });
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'deep-link auto-allow');
  assert.equal(activeFrame.postMessageCalls[0].ok, true);
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, true);
});

test('a grant for one identity does not cover a different Using identity', async () => {
  const otherActor = {
    id: 'standalone:other',
    label: 'Other',
    kind: 'wallet',
    globalMetaId: 'idq1other',
    isDefault: true,
    capabilities: [],
  };
  const run = runWithResolve(result(), {
    runtime: runtimeWithActor({ actors: [otherActor], defaultActor: otherActor }),
    seedIdentityGrants: { version: 1, grants: [seedGrant()] },
  });
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-4', method: 'browser.actor.current' });
  assert.deepEqual(activeFrame.postMessageCalls, [], 'unauthorized identity must not be disclosed');
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false, 'panel opens for the new identity');

  run.nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'actor response for second identity');
  assert.equal(activeFrame.postMessageCalls[0].result.actor.globalMetaId, 'idq1other');

  const stored = JSON.parse(run.storage.getItem(IDENTITY_GRANTS_KEY));
  assert.equal(stored.grants.length, 2, 'one record per (app, identity)');
  const identities = stored.grants.map((grant) => grant.identity.globalMetaId).sort();
  assert.deepEqual(identities, ['idq1actor', 'idq1other']);
});

test('AgentBrowserLibrary.getIdentityGrants and the host message expose stored grants', async () => {
  const run = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    seedIdentityGrants: { version: 1, grants: [seedGrant(), seedGrant({ appUri: 'metaapp://other', identity: { globalMetaId: 'idq1actor', name: 'Bob' } })] },
  });
  await bootFrame(run);

  const grants = JSON.parse(JSON.stringify(run.context.AgentBrowserLibrary.getIdentityGrants()));
  assert.equal(grants.length, 2);
  assert.equal(grants[0].appUri, 'metaapp://other', 'most recently granted first');
  assert.equal(grants[0].scheme, 'metaapp');
  assert.deepEqual(grants[0].identity, { globalMetaId: 'idq1actor', name: 'Bob' });
  assert.equal(grants[0].grantedAt, 1000);

  run.context.handleBrowserMessage({
    source: run.parentWindow,
    data: { type: 'agent-browser:get-identity-grants', requestId: 'grants-1', limit: 1 },
  });
  const response = run.hostMessages.find((message) => message.type === 'agent-browser:get-identity-grants:response');
  assert.ok(response, 'host message response is emitted');
  assert.equal(response.ok, true);
  assert.equal(response.result.length, 1, 'limit is applied');
});

test('corrupt or legacy identity grant storage is ignored without breaking the panel', async () => {
  const run = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    storage: (() => {
      const storage = createMemoryStorage();
      storage.setItem(IDENTITY_GRANTS_KEY, '{not-json');
      return storage;
    })(),
  });
  const activeFrame = await bootFrame(run);

  assert.deepEqual(JSON.parse(JSON.stringify(run.context.AgentBrowserLibrary.getIdentityGrants())), []);
  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-5', method: 'browser.actor.current' });
  assert.deepEqual(activeFrame.postMessageCalls, []);
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false, 'panel still opens after corrupt storage');
});
