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
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-menu-trigger]': new FakeElement(),
    '[data-browser-menu]': new FakeElement(),
    '[data-browser-owner-panel]': new FakeElement(),
    '[data-browser-actor-panel]': new FakeElement(),
    '[data-browser-app-panel]': new FakeElement(),
    '[data-browser-bookmark-star]': new FakeElement(),
    '[data-browser-share-buzz]': new FakeElement(),
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-using-actor]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-tabstrip]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
    '[data-browser-status-strip]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-auto-write]': new FakeElement(),
    '[data-browser-app-session]': new FakeElement(),
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

function startParams(overrides = {}) {
  return {
    appId: 'llmchess.v2',
    sessionType: 'agent-game',
    groupId: 'group-1',
    gameId: 'xiangqi',
    manifestUri: 'metafile://abc',
    rulesHash: 'sha256:rules',
    adapterHash: 'sha256:adapter',
    seat: 'black',
    agentId: 'idq1actor',
    ttlMs: 86400000,
    protocolPaths: ['/protocols/simplegroupjoin', '/protocols/simplegroupchat'],
    budget: { llmCalls: 500, writes: 500 },
    ...overrides,
  };
}

function sessionManualResponse(resourceUri, token, start) {
  return {
    ok: false,
    state: 'manual_action_required',
    code: 'app_session_required',
    message: 'Confirm the App Session authorization before the host starts it.',
    data: {
      confirmation: {
        actor: { uri: resourceUri, globalMetaId: 'idq1actor', name: 'Bob' },
        resourceUri,
        appId: start.appId,
        sessionType: start.sessionType,
        groupId: start.groupId,
        gameId: start.gameId,
        manifestUri: start.manifestUri,
        rulesHash: start.rulesHash,
        adapterHash: start.adapterHash || start.rulesHash,
        seat: start.seat,
        protocolPaths: start.protocolPaths,
        ttlMs: start.ttlMs,
        llmBudget: 500,
        writeBudget: 500,
        expiresAt: 1735886400123,
      },
      confirmRequest: {
        resourceUri,
        kind: 'app-session-start',
        payload: {
          ...start,
          confirmed: true,
          hostConfirmation: { id: 'appsession-1', token },
        },
      },
    },
  };
}

function sessionObject(overrides = {}) {
  return {
    sessionId: 'sess-1',
    appId: 'llmchess.v2',
    sessionType: 'agent-game',
    groupId: 'group-1',
    gameId: 'xiangqi',
    manifestUri: 'metafile://abc',
    adapterHash: 'sha256:adapter',
    rulesHash: 'sha256:rules',
    seat: 'black',
    agentId: 'idq1actor',
    status: 'running',
    lastIndex: 0,
    lastActionSeq: 0,
    lastError: null,
    createdAt: 1735800000123,
    updatedAt: 1735800123456,
    expiresAt: 1735886400123,
    budget: { llmCalls: 500, llmCallsUsed: 0, writes: 500, writesUsed: 0 },
    ...overrides,
  };
}

function sessionStartSuccess(session) {
  return { ok: true, data: { kind: 'app-session-start', handled: true, data: session } };
}

async function primeFrame(nodes) {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);
  return activeFrameWindow;
}

test('browser.app.session.start validates required fields before forwarding', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  const activeFrameWindow = await primeFrame(nodes);

  const cases = [
    { params: { appId: '', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'appId' },
    { params: { appId: 'a', sessionType: '', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'sessionType' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: '', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'groupId' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: '', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'gameId' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: '', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'manifestUri' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: '', seat: 'black', agentId: 'a', ttlMs: 86400000 }, field: 'rulesHash' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: '', agentId: 'a', ttlMs: 86400000 }, field: 'seat' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: '', ttlMs: 86400000 }, field: 'agentId' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: 0 }, field: 'ttlMs' },
    { params: { appId: 'a', sessionType: 'agent-game', groupId: 'g', gameId: 'xiangqi', manifestUri: 'm', rulesHash: 'r', seat: 'black', agentId: 'a', ttlMs: -5 }, field: 'ttlMs' },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    postBridgeRequest(windowListeners, activeFrameWindow, {
      id: `start-bad-${index}`, method: 'browser.app.session.start', params: cases[index].params,
    });
    assert.equal(activeFrameWindow.postMessageCalls[index].ok, false);
    assert.equal(activeFrameWindow.postMessageCalls[index].error.code, 'invalid_params');
  }
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.app.session.start renders the authorization card and returns the session on approval', async () => {
  const start = startParams();
  const session = sessionObject();
  const { context, nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      sessionManualResponse('metaapp://pin', 'opaque-token-1', start),
      sessionStartSuccess(session),
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'start-1', method: 'browser.app.session.start', params: start,
  });

  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'authorization card');
  const phaseOne = actionBody(fetchRequests, 0);
  assert.equal(phaseOne.kind, 'app-session-start');
  assert.equal(phaseOne.payload.groupId, 'group-1');
  assert.equal(phaseOne.payload.confirmed, undefined);
  // Card surfaces actor, game, rules hash, protocol paths, and the note.
  const cardHtml = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(cardHtml, /Start App Session/);
  assert.match(cardHtml, /xiangqi/);
  assert.match(cardHtml, /sha256:rules/);
  assert.match(cardHtml, /\/protocols\/simplegroupchat/);
  assert.match(cardHtml, /long-running session/);
  assert.equal(activeFrameWindow.postMessageCalls.length, 0);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'app-session-approve' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'session start response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[0].result.sessionId, 'sess-1');
  // The exact host-issued confirmRequest was resubmitted with hostConfirmation.
  const phaseTwo = actionBody(fetchRequests, 1);
  assert.equal(phaseTwo.payload.confirmed, true);
  assert.equal(phaseTwo.payload.hostConfirmation.id, 'appsession-1');
  assert.equal(phaseTwo.payload.hostConfirmation.token, 'opaque-token-1');
  // The chrome session indicator is now visible and the mirror holds the session.
  assert.equal(nodes['[data-browser-app-session]'].hidden, false);
  assert.equal(context.state.activeAppSessions.length, 1);
  assert.equal(context.state.activeAppSessions[0].sessionId, 'sess-1');
});

test('browser.app.session.start returns consent_denied when the user cancels the card', async () => {
  const start = startParams();
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [sessionManualResponse('metaapp://pin', 'opaque-token-2', start)],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'start-cancel', method: 'browser.app.session.start', params: start,
  });
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'authorization card for cancel');
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-close': '' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'cancel response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'consent_denied');
});

test('browser.app.session.start passes host errors straight through without a card', async () => {
  const start = startParams();
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: false, state: 'failed', code: 'rules_hash_mismatch', message: 'rules hash differs from the match' },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'start-conflict', method: 'browser.app.session.start', params: start,
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'error passthrough');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'rules_hash_mismatch');
  // No authorization card was rendered for a host-side failure.
  assert.doesNotMatch(nodes['[data-browser-modal-root]'].innerHTML, /Start App Session/);
});

test('browser.app.session.list / status / pause / resume / stop forward straight through', async () => {
  const session = sessionObject();
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: true, data: { kind: 'app-session-list', handled: true, data: { sessions: [session] } } },
      { ok: true, data: { kind: 'app-session-status', handled: true, data: session } },
      { ok: true, data: { kind: 'app-session-pause', handled: true, data: { ...session, status: 'paused' } } },
      { ok: true, data: { kind: 'app-session-resume', handled: true, data: session } },
      { ok: true, data: { kind: 'app-session-stop', handled: true, data: { ...session, status: 'stopped' } } },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'list-1', method: 'browser.app.session.list', params: {},
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'list response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, true);
  assert.deepEqual(activeFrameWindow.postMessageCalls[0].result.sessions[0].sessionId, 'sess-1');
  assert.equal(actionBody(fetchRequests, 0).kind, 'app-session-list');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'status-1', method: 'browser.app.session.status', params: { sessionId: 'sess-1' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 2, 'status response');
  assert.equal(activeFrameWindow.postMessageCalls[1].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[1].result.status, 'running');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'pause-1', method: 'browser.app.session.pause', params: { sessionId: 'sess-1' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 3, 'pause response');
  assert.equal(activeFrameWindow.postMessageCalls[2].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[2].result.status, 'paused');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'resume-1', method: 'browser.app.session.resume', params: { sessionId: 'sess-1' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 4, 'resume response');
  assert.equal(activeFrameWindow.postMessageCalls[3].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[3].result.status, 'running');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'stop-1', method: 'browser.app.session.stop', params: { sessionId: 'sess-1' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 5, 'stop response');
  assert.equal(activeFrameWindow.postMessageCalls[4].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[4].result.status, 'stopped');
  // Stopped session is dropped from the chrome mirror -> indicator hidden.
  assert.equal(nodes['[data-browser-app-session]'].hidden, true);
});

test('browser.app.session.status / pause / resume / stop require a sessionId', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  const activeFrameWindow = await primeFrame(nodes);

  const methods = ['status', 'pause', 'resume', 'stop'];
  for (let index = 0; index < methods.length; index += 1) {
    postBridgeRequest(windowListeners, activeFrameWindow, {
      id: `no-sid-${index}`, method: `browser.app.session.${methods[index]}`, params: {},
    });
    assert.equal(activeFrameWindow.postMessageCalls[index].ok, false);
    assert.equal(activeFrameWindow.postMessageCalls[index].error.code, 'invalid_params');
  }
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.app.session.* host failures pass the exact error code through', async () => {
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      { ok: false, state: 'failed', code: 'session_not_found', message: 'no such session' },
      { ok: false, state: 'failed', code: 'session_conflict', message: 'lease held' },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'status-missing', method: 'browser.app.session.status', params: { sessionId: 'sess-x' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'status missing response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'session_not_found');

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'resume-conflict', method: 'browser.app.session.resume', params: { sessionId: 'sess-x' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 2, 'resume conflict response');
  assert.equal(activeFrameWindow.postMessageCalls[1].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[1].error.code, 'session_conflict');
});

test('the chrome session indicator opens the revoke modal and can stop a running session', async () => {
  const session = sessionObject();
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      sessionStartSuccess(session),
      { ok: true, data: { kind: 'app-session-stop', handled: true, data: { ...session, status: 'stopped' } } },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  // Seed the mirror as if a start just succeeded.
  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'seed', method: 'browser.app.session.status', params: { sessionId: 'sess-1' },
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'seed response');
  assert.equal(nodes['[data-browser-app-session]'].hidden, false);

  // Indicator click opens the management modal listing the running session.
  nodes['[data-browser-app-session]'].listeners.get('click')({});
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /xiangqi/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Stop/);

  // Clicking the per-session Stop button forwards app-session-stop and hides the indicator.
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: {
      parentElement: null,
      getAttribute: (name) => (name === 'data-browser-app-session-stop' ? 'sess-1' : ''),
      hasAttribute: (name) => name === 'data-browser-app-session-stop',
    },
  });
  await waitFor(() => nodes['[data-browser-app-session]'].hidden === true, 'indicator hidden after stop');
  const stopBody = actionBody(fetchRequests, 1);
  assert.equal(stopBody.kind, 'app-session-stop');
  assert.equal(stopBody.payload.sessionId, 'sess-1');
});

test('an unknown bridge method still returns unsupported_method', async () => {
  const { nodes, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'unknown', method: 'browser.app.session.restart', params: {},
  });
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'unsupported_method');
});
