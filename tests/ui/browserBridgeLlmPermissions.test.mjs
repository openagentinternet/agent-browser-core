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
    if (idx === -1) return null;
    return idx + 1 < this._parent.children.length ? this._parent.children[idx + 1] : null;
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

function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
  const fetchCalls = [];
  const fetchRequests = [];
  const windowListeners = new Map();
  const runtime = options.runtime || {};
  const actionResponses = Array.isArray(options.actionResponses)
    ? options.actionResponses.slice()
    : [];
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
      location: { search: options.locationSearch ?? '?uri=metaid%3A%2F%2Fidq1fixturebot' },
      history: { replaceState() {} },
      addEventListener(eventName, handler) { windowListeners.set(eventName, handler); },
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url, fetchOptions = {}) => {
      fetchCalls.push(String(url));
      fetchRequests.push({ url: String(url), options: fetchOptions });
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
      if (String(url).startsWith('/api/browser/actions')) {
        const queued = actionResponses.length ? actionResponses.shift() : options.actionResponse;
        return { ok: true, json: async () => (queued !== undefined ? queued : { ok: true, data: {} }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes, fetchCalls, fetchRequests, windowListeners };
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
  return {
    host: { kind: 'standalone', name: 'Standalone', localMode: true },
    actors: [{
      id: 'standalone:actor',
      label: 'Bob',
      kind: 'wallet',
      globalMetaId: 'idq1actor',
      isDefault: true,
      capabilities: [],
    }],
    defaultActor: {
      id: 'standalone:actor',
      label: 'Bob',
      kind: 'wallet',
      globalMetaId: 'idq1actor',
      isDefault: true,
      capabilities: [],
    },
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

function actionBody(fetchRequests, index) {
  const request = fetchRequests.filter((entry) => String(entry.url).startsWith('/api/browser/actions'))[index];
  if (!request) return null;
  return JSON.parse(request.options.body);
}

const chatGrant = { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' };
const joinGrant = { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupjoin' };

function permissionsManualResponse(resourceUri, grants, token) {
  return {
    ok: false,
    state: 'manual_action_required',
    code: 'permissions_required',
    message: 'Confirm the protocol write grants before the host records them.',
    data: {
      confirmation: {
        actor: { uri: '', globalMetaId: '', name: 'Standalone Wallet' },
        grants,
        reason: 'chess moves',
      },
      confirmRequest: {
        resourceUri,
        kind: 'permissions-request',
        payload: {
          grants,
          reason: 'chess moves',
          confirmed: true,
          hostConfirmation: { id: 'perm-1', token },
        },
      },
    },
  };
}

function permissionsApprovedResponse(grants) {
  return {
    ok: true,
    data: { kind: 'permissions-request', handled: true, data: { granted: grants } },
  };
}

test('browser.llm.complete validates messages, roles, and input size before forwarding', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-empty', method: 'browser.llm.complete', params: { messages: [] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'llm-empty',
    ok: false,
    error: { code: 'invalid_params', message: 'LLM completion requires at least one message.' },
  });

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-role', method: 'browser.llm.complete',
    params: { messages: [{ role: 'assistant', content: 'x' }, { role: 'tool', content: 'y' }] },
  });
  assert.equal(activeFrameWindow.postMessageCalls[1].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[1].error.code, 'invalid_params');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-size', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'a'.repeat(65537) }] },
  });
  assert.equal(activeFrameWindow.postMessageCalls[2].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[2].error.code, 'invalid_params');
  assert.equal(activeFrameWindow.postMessageCalls.length, 3);
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.llm.complete requires per-resource consent and forwards after approval', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: true, data: { kind: 'llm-complete', handled: true, data: { text: 'h2e2', model: 'gpt-5.6', finishReason: 'stop' } } },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-1', method: 'browser.llm.complete',
    params: {
      messages: [{ role: 'system', content: 'You are a chess player.' }, { role: 'user', content: 'board text' }],
      options: { temperature: 0.7, maxOutputTokens: 512 },
      purpose: 'llmchess-move',
    },
  });

  // No host call and no response until the consent card is answered.
  assert.deepEqual(activeFrameWindow.postMessageCalls, []);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Local LLM request/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /llmchess-move/);
  assert.equal(fetchRequests.filter((entry) => String(entry.url).includes('/api/browser/actions')).length, 0);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'llm-consent-allow' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'llm completion response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'llm-1',
    ok: true,
    result: { text: 'h2e2', model: 'gpt-5.6', finishReason: 'stop' },
  });
  const forwarded = actionBody(fetchRequests, 0);
  assert.equal(forwarded.kind, 'llm-complete');
  assert.equal(forwarded.resourceUri, 'metaapp://pin');
  assert.equal(forwarded.payload.messages.length, 2);
  assert.equal(forwarded.payload.options.temperature, 0.7);
  assert.equal(forwarded.payload.purpose, 'llmchess-move');

  // Consent is remembered for the resource: the second call forwards directly.
  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-2', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'next board' }] },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 2, 'second llm completion response');
  assert.equal(activeFrameWindow.postMessageCalls[1].ok, true);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
});

test('browser.llm.complete denies without consent and remembers the denial', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-deny-1', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-close': '' }),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'llm-deny-1',
    ok: false,
    error: { code: 'consent_denied', message: 'The user denied local LLM access for this MetaApp.' },
  });

  // Denial is remembered: no modal, immediate consent_denied.
  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-deny-2', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[1])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'llm-deny-2',
    ok: false,
    error: { code: 'consent_denied', message: 'The user denied local LLM access for this MetaApp.' },
  });
  assert.equal(activeFrameWindow.postMessageCalls.length, 2);
});

test('browser.llm.complete maps host error codes to the bridge', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: false, state: 'failed', code: 'llm_timeout', message: 'Local LLM completion timed out.' },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-err', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'board' }] },
  });
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'llm-consent-allow' }),
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'llm error response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'llm-err',
    ok: false,
    error: { code: 'llm_timeout', message: 'Local LLM completion timed out.' },
  });
});

test('browser.llm.complete reports consent_pending while another consent is open', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'actor-1', method: 'browser.actor.current', params: {},
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'llm-pending', method: 'browser.llm.complete',
    params: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'consent_pending');
});

test('browser.permissions.request rejects grants outside the exact /protocols/ create shape', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const cases = [
    { method: 'metaid.pin.write', operation: 'modify', path: '/protocols/simplegroupchat' },
    { method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat/*' },
    { method: 'browser.llm.complete', operation: 'create', path: '/protocols/simplegroupchat' },
    { method: 'metaid.pin.write', operation: 'create', path: 'simplegroupchat' },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    postBridgeRequest(windowListeners, activeFrameWindow, {
      id: `perm-bad-${index}`, method: 'browser.permissions.request',
      params: { grants: [cases[index]], reason: 'r' },
    });
    assert.equal(activeFrameWindow.postMessageCalls[index].ok, false);
    assert.equal(activeFrameWindow.postMessageCalls[index].error.code, 'invalid_params');
  }
  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-empty', method: 'browser.permissions.request', params: { grants: [] },
  });
  assert.equal(activeFrameWindow.postMessageCalls[cases.length].error.code, 'invalid_params');
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.permissions.request renders the host approval card and records the grant on approval', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      permissionsManualResponse('metaapp://pin', [chatGrant, joinGrant], 'opaque-token-1'),
      permissionsApprovedResponse([chatGrant, joinGrant]),
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-1', method: 'browser.permissions.request',
    params: { grants: [chatGrant, joinGrant], reason: 'chess moves' },
  });

  // Phase 1 forwarded; card shows grants, reason, and the risk note.
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'approval card');
  const phaseOne = actionBody(fetchRequests, 0);
  assert.equal(phaseOne.kind, 'permissions-request');
  assert.equal(phaseOne.payload.grants.length, 2);
  assert.equal(phaseOne.payload.confirmed, undefined);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Approve automatic writes/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /\/protocols\/simplegroupchat/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /chess moves/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /without per-message confirmation/);
  assert.equal(activeFrameWindow.postMessageCalls.length, 0);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'permissions-approve' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'grant response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'perm-1',
    ok: true,
    result: { granted: [chatGrant, joinGrant] },
  });
  // The exact host-issued confirmRequest was resubmitted.
  const phaseTwo = actionBody(fetchRequests, 1);
  assert.equal(phaseTwo.payload.confirmed, true);
  assert.equal(phaseTwo.payload.hostConfirmation.id, 'perm-1');
  assert.equal(phaseTwo.payload.hostConfirmation.token, 'opaque-token-1');
  // The chrome auto-write indicator is now visible.
  assert.equal(nodes['[data-browser-auto-write]'].hidden, false);
  assert.deepEqual(context.state.activePermissions['metaapp://pin'], [chatGrant, joinGrant]);
});

test('browser.permissions.request cancels with user_cancelled and keeps the indicator hidden', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      permissionsManualResponse('metaapp://pin', [chatGrant], 'opaque-token-2'),
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-cancel', method: 'browser.permissions.request',
    params: { grants: [chatGrant] },
  });
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'approval card for cancel');
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-close': '' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'cancel response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'perm-cancel',
    ok: false,
    error: { code: 'user_cancelled', message: 'Permission request was cancelled.' },
  });
  assert.equal(fetchRequests.filter((entry) => String(entry.url).includes('/api/browser/actions')).length, 1);
  assert.equal(nodes['[data-browser-auto-write]'].hidden, true);
  assert.equal(context.state.activePermissions['metaapp://pin'], undefined);
});

test('browser.permissions.request surfaces host policy denials', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: false, state: 'failed', code: 'consent_denied', message: 'The requested protocol path is not on the host whitelist: /protocols/metaapp' },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-deny', method: 'browser.permissions.request',
    params: { grants: [chatGrant] },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'policy denial response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'perm-deny',
    ok: false,
    error: { code: 'consent_denied', message: 'The requested protocol path is not on the host whitelist: /protocols/metaapp' },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
});

test('granted metaid.pin.write skips the shared confirmation modal when the host returns success directly', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      permissionsApprovedResponse([chatGrant]),
      {
        ok: true,
        data: {
          kind: 'metaid-pin-write',
          handled: true,
          data: {
            pinId,
            txid: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7',
            operation: 'create',
            path: '/protocols/simplegroupchat',
            actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Bob' },
          },
        },
      },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-g', method: 'browser.permissions.request',
    params: { grants: [chatGrant] },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'grant response');
  assert.equal(nodes['[data-browser-auto-write]'].hidden, false);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'write-1', method: 'metaid.pin.write',
    params: {
      operation: 'create',
      path: '/protocols/simplegroupchat',
      encryption: '0',
      version: '1.0.0',
      contentType: 'application/json;utf-8',
      payload: { encoding: 'utf8', value: '{"app":"llmchess"}' },
    },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 2, 'granted write response');
  // No confirmation modal appeared: the host result came back without
  // manual_action_required.
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.equal(activeFrameWindow.postMessageCalls[1].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[1].result.pinId, pinId);
  assert.equal(fetchRequests.filter((entry) => String(entry.url).includes('/api/browser/actions')).length, 2);
});

test('chrome auto-write indicator revokes grants on demand', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      permissionsApprovedResponse([chatGrant]),
      { ok: true, data: { kind: 'permissions-request', handled: true, data: { revoked: true } } },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-r', method: 'browser.permissions.request',
    params: { grants: [chatGrant] },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'grant response');
  assert.equal(nodes['[data-browser-auto-write]'].hidden, false);

  // Click the chrome indicator: revoke confirmation modal.
  nodes['[data-browser-auto-write]'].listeners.get('click')({});
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Revoke automatic writes\?/);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'permissions-revoke-confirm' }),
  });
  await waitFor(() => nodes['[data-browser-auto-write]'].hidden === true, 'indicator hidden after revoke');
  const revokeBody = actionBody(fetchRequests, 1);
  assert.equal(revokeBody.kind, 'permissions-request');
  assert.equal(revokeBody.payload.revoke, true);
  assert.equal(revokeBody.resourceUri, 'metaapp://pin');
  assert.equal(context.state.activePermissions['metaapp://pin'], undefined);
});

test('navigating away revokes the previous resource grants and hides the indicator', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const otherResult = result({ uri: 'metaapp://otherpin', normalizedUri: 'metaapp://otherpin', title: 'Other' });
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    resolveByUri: { 'metaapp://otherpin': otherResult },
    actionResponses: [
      permissionsApprovedResponse([chatGrant]),
      { ok: true, data: { kind: 'permissions-request', handled: true, data: { revoked: true } } },
    ],
  });
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'perm-n', method: 'browser.permissions.request',
    params: { grants: [chatGrant] },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'grant response');
  assert.equal(nodes['[data-browser-auto-write]'].hidden, false);

  // Navigate to another MetaApp resource via the navigation bridge.
  windowListeners.get('message')({
    source: activeFrameWindow,
    data: { type: 'agent-browser:navigate', version: 1, uri: 'metaapp://otherpin' },
  });
  await waitFor(() => fetchRequests.filter((entry) => String(entry.url).includes('/api/browser/actions')).length === 2, 'revoke forwarded');
  const revokeBody = actionBody(fetchRequests, 1);
  assert.equal(revokeBody.kind, 'permissions-request');
  assert.equal(revokeBody.payload.revoke, true);
  assert.equal(revokeBody.resourceUri, 'metaapp://pin');
  // The indicator reflects the new resource, which has no grants.
  await waitFor(() => nodes['[data-browser-auto-write]'].hidden === true, 'indicator hidden after navigation');
});
