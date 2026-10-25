import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

const IDENTITY_GRANTS_KEY = 'agent-browser:identity-grants';
const RESOURCE_URI = 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';

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
    return (idx === -1 || idx + 1 >= this._parent.children.length) ? null : this._parent.children[idx + 1];
  }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) { return this.childrenBySelector.get(selector) || null; }
  setChild(selector, value) { this.childrenBySelector.set(selector, value); }
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
}

function browserActionTarget(attrs) {
  return {
    parentElement: null,
    getAttribute: (name) => attrs[name] || '',
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

function elements() {
  return {
    '[data-browser-shell]': new FakeElement(),
    '[data-browser-page-title]': new FakeElement(),
    '[data-browser-uri-input]': new FakeElement(),
    '[data-browser-address-form]': new FakeElement(),
    '[data-browser-back]': new FakeElement(),
    '[data-browser-forward]': new FakeElement(),
    '[data-browser-reload]': new FakeElement(),
    '[data-browser-reload-wrap]': new FakeElement(),
    '[data-browser-reload-popover]': new FakeElement(),
    '[data-browser-drawer-toggle]': new FakeElement(),
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-owner-panel]': new FakeElement(),
    '[data-browser-address-icon]': new FakeElement(),
    '[data-browser-app-panel]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-actor-panel]': new FakeElement(),
    '[data-browser-menu-trigger]': new FakeElement(),
    '[data-browser-menu]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-tab-context-menu]': new FakeElement(),
    '[data-browser-bookmark-star]': new FakeElement(),
    '[data-browser-auto-write]': new FakeElement(),
    '[data-browser-app-session]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
    '[data-browser-tabstrip]': new FakeElement(),
    '[data-browser-tabs-container]': new FakeElement(),
    '[data-browser-tab-new]': new FakeElement(),
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

// One human account Actor, one Bot agent Actor (the IDBots mapping), and one
// Actor with a kind ABC does not know — it must render neutrally.
const humanActor = {
  id: 'idbots-account',
  label: 'Sunny (Account)',
  kind: 'idbots-account',
  globalMetaId: 'idq1sunny',
  isDefault: false,
  capabilities: ['template-settings'],
};
const botActor = {
  id: 'idbots-agent',
  label: 'Worker Agent',
  kind: 'idbots-agent',
  globalMetaId: 'idq1agent',
  isDefault: true,
  capabilities: ['private-chat', 'service-call', 'template-settings'],
};
const unknownKindActor = {
  id: 'future-host-actor',
  label: 'Future Host Actor',
  kind: 'some-future-kind',
  globalMetaId: 'idq1future',
  isDefault: false,
  capabilities: [],
};
// Kinds that collide with Object.prototype keys must render exactly like any
// other unknown kind: present in the list, never badged as Human or Bot.
const prototypeKeyKindActors = [
  { ...unknownKindActor, id: 'proto-constructor', label: 'Constructor Kind', kind: 'constructor' },
  { ...unknownKindActor, id: 'proto-tostring', label: 'ToString Kind', kind: 'toString' },
  { ...unknownKindActor, id: 'proto-proto', label: 'Proto Kind', kind: '__proto__' },
];

function runtimePayload(overrides = {}) {
  return {
    host: { kind: 'idbots', name: 'IDBots', localMode: false },
    actors: [botActor, humanActor],
    defaultActor: botActor,
    defaultUri: 'metaid://idq1agent',
    features: {
      privateChat: true,
      serviceCall: true,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: false,
    },
    labels: {
      actorChip: 'Actor',
      noActorTitle: 'No Actor',
      noActorBody: 'Create a local actor before using Browser actions.',
    },
    ...overrides,
  };
}

function resolvedMetaApp() {
  return {
    uri: RESOURCE_URI,
    normalizedUri: RESOURCE_URI,
    resourceType: 'metaapp',
    title: 'Fixture MetaApp',
    owner: { kind: 'metaapp-publisher', name: 'Fixture Publisher', verificationState: 'partial' },
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'https://metaweb.example/app' },
    actions: [],
    sections: [],
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'fixture' },
  };
}

function createBrowserContext(options = {}) {
  const nodes = elements();
  const storage = options.storage ?? createMemoryStorage();
  const fetchRequests = [];
  const windowListeners = new Map();
  const runtime = options.runtime ?? runtimePayload();
  const actionResponses = [...(options.actionResponses ?? [])];
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
      location: { pathname: '/ui/browser', search: `?uri=${encodeURIComponent(RESOURCE_URI)}` },
      history: { replaceState() {} },
      localStorage: storage,
      addEventListener(eventName, handler) { windowListeners.set(eventName, handler); },
    },
    document: {
      readyState: 'complete',
      title: 'Agent Internet Browser',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url, fetchOptions = {}) => {
      fetchRequests.push({ url: String(url), options: fetchOptions });
      if (String(url).startsWith('/api/browser/runtime')) {
        return { ok: true, json: async () => ({ ok: true, data: runtime }) };
      }
      if (String(url).startsWith('/api/browser/resolve')) {
        return { ok: true, json: async () => ({ ok: true, data: options.resolveResponse ?? resolvedMetaApp() }) };
      }
      if (String(url).startsWith('/api/browser/settings')) {
        return { ok: true, json: async () => ({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } }) };
      }
      if (String(url).startsWith('/api/browser/actions')) {
        const queued = actionResponses.length ? actionResponses.shift() : options.actionResponse;
        return { ok: true, json: async () => (queued !== undefined ? queued : { ok: true, data: {} }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes, storage, fetchRequests, windowListeners };
}

function tabPane(nodes, tabId) {
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

function frameWindow() {
  return {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
}

function postBridgeRequest(windowListeners, sourceWindow, request) {
  const listener = windowListeners.get('message');
  listener({
    source: sourceWindow,
    data: { type: 'agent-browser:request', version: 1, ...request },
  });
}

async function bootFrame(run, tabId = 1) {
  const activeFrame = frameWindow();
  await waitFor(() => run.nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(run.nodes, activeFrame, tabId);
  return activeFrame;
}

function actionRequests(run) {
  return run.fetchRequests.filter((entry) => String(entry.url).startsWith('/api/browser/actions'));
}

function seedGrant(overrides = {}) {
  return {
    appUri: RESOURCE_URI,
    appTitle: 'Fixture MetaApp',
    identity: { globalMetaId: 'idq1sunny', name: 'Sunny (Account)' },
    grantedAt: 1000,
    lastUsedAt: 1000,
    ...overrides,
  };
}

test('Actor selector renders human and bot actors with kind badges; unknown kinds stay neutral', async () => {
  const run = createBrowserContext({
    runtime: runtimePayload({
      actors: [botActor, humanActor, unknownKindActor, ...prototypeKeyKindActors],
    }),
  });
  await waitFor(() => run.context.state.runtime, 'initial load');

  run.nodes['[data-browser-using-selector]'].click();
  const modalHtml = run.nodes['[data-browser-modal-root]'].innerHTML;
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(modalHtml, /Worker Agent/);
  assert.match(modalHtml, /Sunny \(Account\)/);
  assert.match(modalHtml, /Future Host Actor/);

  // Known kinds carry a distinguishing badge before selection.
  assert.match(modalHtml, /browser-actor-kind-badge is-human[^>]*>Human</);
  assert.match(modalHtml, /browser-actor-kind-badge is-bot[^>]*>Bot</);
  const badgeCount = (modalHtml.match(/browser-actor-kind-badge/g) || []).length;
  assert.equal(badgeCount, 2, 'only the two known kinds are badged; unknown kinds stay neutral');

  // Object.prototype-colliding kinds render like any other unknown kind.
  assert.match(modalHtml, /Constructor Kind/);
  assert.match(modalHtml, /ToString Kind/);
  assert.match(modalHtml, /Proto Kind/);
});

test('Runtime labels can override the kind badge text', async () => {
  const run = createBrowserContext({
    runtime: runtimePayload({
      labels: {
        actorChip: 'Actor',
        noActorTitle: 'No Actor',
        noActorBody: 'No actor',
        actorKindHuman: '人类身份',
        actorKindBot: '机器人',
      },
    }),
  });
  await waitFor(() => run.context.state.runtime, 'initial load');

  run.nodes['[data-browser-using-selector]'].click();
  const modalHtml = run.nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(modalHtml, /browser-actor-kind-badge is-human[^>]*>人类身份</);
  assert.match(modalHtml, /browser-actor-kind-badge is-bot[^>]*>机器人</);
});

test('Bot-only runtime keeps the selector behavior with a bot badge and no human badge', async () => {
  const run = createBrowserContext({
    runtime: runtimePayload({ actors: [botActor] }),
  });
  await waitFor(() => run.context.state.runtime, 'initial load');

  run.nodes['[data-browser-using-selector]'].click();
  const modalHtml = run.nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(modalHtml, /Worker Agent/);
  assert.match(modalHtml, /browser-actor-kind-badge is-bot[^>]*>Bot</);
  assert.doesNotMatch(modalHtml, /is-human/);
});

test('Introducing a human actor does not change the default actor or new-tab seeding', async () => {
  const run = createBrowserContext();
  await waitFor(() => run.context.state.runtime, 'initial load');

  assert.equal(run.context.state.actorId, 'idbots-agent', 'default actor stays the bot');
  assert.equal(run.context.state.runtime.defaultActor.id, 'idbots-agent');

  await run.context.selectUsingIdentity('idbots-account');
  assert.equal(run.context.state.actorId, 'idbots-account');
  assert.equal(run.context.state.runtime.defaultActor.id, 'idbots-agent', 'host default is not mutated by selection');

  run.context.AgentBrowserTabs.openTab('metaid://idq1worker');
  const newTabInfo = run.context.AgentBrowserTabs.getActiveTab();
  assert.equal(run.context.state.actorId, 'idbots-agent', 'a new tab seeds the stable host default');
  assert.equal(newTabInfo.actorId, 'idbots-agent');
});

test('Actor selection stays per tab across human/bot switches', async () => {
  const run = createBrowserContext();
  await waitFor(() => run.context.state.runtime, 'initial load');

  await run.context.selectUsingIdentity('idbots-account');
  assert.equal(run.context.state.tabs.find((t) => t.id === run.context.state.activeTabId).actorId, 'idbots-account');

  run.context.AgentBrowserTabs.openTab('metaid://idq1worker');
  assert.equal(run.context.state.actorId, 'idbots-agent', 'second tab keeps its own default actor');

  run.context.AgentBrowserTabs.switchTab(1);
  assert.equal(run.context.state.actorId, 'idbots-account', 'first tab retains the human actor selection');
  const info = run.context.AgentBrowserTabs.getTabs().find((t) => t.id === 1);
  assert.equal(info.actorId, 'idbots-account');
});

test('browser.actor.current discloses a human actor only after per-resource consent', async () => {
  const run = createBrowserContext();
  await waitFor(() => run.context.state.runtime, 'initial load');
  await run.context.selectUsingIdentity('idbots-account');
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-human-1', method: 'browser.actor.current' });
  assert.deepEqual(activeFrame.postMessageCalls, [], 'no disclosure before consent');
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false, 'consent panel opens for the human actor');

  run.nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'human actor response');
  assert.equal(activeFrame.postMessageCalls[0].ok, true);
  assert.equal(activeFrame.postMessageCalls[0].result.actor.globalMetaId, 'idq1sunny');

  // The persisted consent covers only this (resource, identity) pair: the bot
  // actor on the same resource is a different identity and must re-consent.
  await run.context.selectUsingIdentity('idbots-agent');
  postBridgeRequest(run.windowListeners, activeFrame, { id: 'actor-bot-1', method: 'browser.actor.current' });
  assert.equal(activeFrame.postMessageCalls.length, 1, 'bot identity is not disclosed under the human grant');
  assert.equal(run.nodes['[data-browser-modal-root]'].hidden, false, 'consent panel re-opens for the bot identity');
});

test('browser.actor.changed fires after a switch only when disclosure is authorized', async () => {
  const run = createBrowserContext({
    storage: (() => {
      const storage = createMemoryStorage();
      storage.setItem(IDENTITY_GRANTS_KEY, JSON.stringify({ version: 1, grants: [seedGrant()] }));
      return storage;
    })(),
  });
  await waitFor(() => run.context.state.runtime, 'initial load');
  const activeFrame = await bootFrame(run);
  assert.equal(run.context.state.actorId, 'idbots-agent');

  // The persisted grant names the human identity. The currently selected bot
  // has no consent on record, so the initial state emits nothing; switching to
  // the human identity is covered by the grant and must emit exactly one event.
  await run.context.selectUsingIdentity('idbots-account');
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'authorized switch emits actor.changed');
  const event = activeFrame.postMessageCalls[0];
  assert.equal(event.type, 'agent-browser:event');
  assert.equal(event.event, 'browser.actor.changed');
  assert.equal(event.payload.actor.globalMetaId, 'idq1sunny');

  // Switching back to the bot has no consent on record: the event is suppressed.
  await run.context.selectUsingIdentity('idbots-agent');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(activeFrame.postMessageCalls.length, 1, 'unauthorized switch must not disclose the bot identity');
});

test('PIN-write confirmation shows the host-issued actor identity and phase 2 re-attaches the selected actor', async () => {
  const pinWritePayload = {
    operation: 'create',
    path: '/protocols/preference/feedback',
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value: '{"category":["motion-video"]}' },
  };
  const confirmationActor = { uri: 'metaid://idq1sunny', globalMetaId: 'idq1sunny', name: 'Sunny (Account)' };
  const phaseOne = {
    ok: false,
    state: 'manual_action_required',
    code: 'manual_action_required',
    message: 'Confirm this MetaID PIN write before the host signs or broadcasts it.',
    data: {
      confirmation: {
        actor: confirmationActor,
        operation: 'create',
        path: '/protocols/preference/feedback',
        contentType: 'application/json;utf-8',
        payloadSize: 30,
        display: { title: 'Publish feedback', summary: 'motion-video batch' },
      },
      confirmRequest: {
        resourceUri: RESOURCE_URI,
        kind: 'metaid-pin-write',
        payload: {
          ...pinWritePayload,
          confirmed: true,
          hostConfirmation: { id: 'pin-1', token: 'opaque-token' },
        },
      },
    },
  };
  const phaseTwo = {
    ok: true,
    data: {
      kind: 'metaid-pin-write',
      handled: true,
      data: {
        pinId: '9f8e7d6c5b4a3928170f6e5d4c3b2a190f8e7d6c5b4a3928170f6e5d4c3b2a19i0',
        txid: '9f8e7d6c5b4a3928170f6e5d4c3b2a190f8e7d6c5b4a3928170f6e5d4c3b2a19',
        operation: 'create',
        path: '/protocols/preference/feedback',
        actor: confirmationActor,
      },
    },
  };
  const run = createBrowserContext({ actionResponses: [phaseOne, phaseTwo] });
  await waitFor(() => run.context.state.runtime, 'initial load');
  await run.context.selectUsingIdentity('idbots-account');
  const activeFrame = await bootFrame(run);

  postBridgeRequest(run.windowListeners, activeFrame, {
    id: 'pin-1',
    method: 'metaid.pin.write',
    params: pinWritePayload,
  });
  await waitFor(() => run.nodes['[data-browser-modal-root]'].innerHTML.includes('browser-pin-write-confirmation'), 'confirmation modal');

  // The card displays the identity the host says it will actually use.
  const modalHtml = run.nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(modalHtml, /Sunny \(Account\)/);
  assert.match(modalHtml, /idq1sunny/);
  assert.match(modalHtml, /\/protocols\/preference\/feedback/);

  run.nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'pin-write-confirm' }),
  });
  await waitFor(() => actionRequests(run).length === 2, 'phase 2 posted');
  await waitFor(() => activeFrame.postMessageCalls.length === 1, 'bridge response');

  const phaseTwoRequest = actionRequests(run)[1];
  assert.match(phaseTwoRequest.url, /actorId=idbots-account/, 'phase 2 re-attaches the currently selected actor');
  const phaseTwoBody = JSON.parse(phaseTwoRequest.options.body);
  assert.equal(phaseTwoBody.kind, 'metaid-pin-write');
  assert.equal(phaseTwoBody.payload.hostConfirmation.token, 'opaque-token');
  assert.ok(phaseTwoBody.sessionId, 'phase 2 carries the page session id');

  const response = activeFrame.postMessageCalls[0];
  assert.equal(response.ok, true);
  assert.equal(response.result.actor.globalMetaId, 'idq1sunny', 'success result returns the actual signer identity');
  assert.equal(response.result.pinId, phaseTwo.data.data.pinId);
});

test('openTab rejects a forged actor id and keeps the default selection', async () => {
  const run = createBrowserContext();
  await waitFor(() => run.context.state.runtime, 'initial load');

  run.context.AgentBrowserTabs.openTab('metaid://idq1worker', 'forged-actor-id');
  const activeTab = run.context.state.tabs.find((t) => t.id === run.context.state.activeTabId);
  assert.equal(activeTab.actorId, 'idbots-agent', 'unknown actor id cannot become the signing actor');
});
