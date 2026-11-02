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
      location: { search: options.locationSearch ?? '?uri=metaapp%3A%2F%2Fpin' },
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
    host: { kind: 'idbots', name: 'IDBots', localMode: true },
    actors: [{
      id: 'local:15',
      label: 'Bob',
      kind: 'bot',
      globalMetaId: 'idq1actor',
      isDefault: true,
      capabilities: [],
    }],
    defaultActor: {
      id: 'local:15',
      label: 'Bob',
      kind: 'bot',
      globalMetaId: 'idq1actor',
      isDefault: true,
      capabilities: [],
    },
    defaultUri: null,
    features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false, nftBuy: true },
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

function actionCount(fetchRequests) {
  return fetchRequests.filter((entry) => String(entry.url).startsWith('/api/browser/actions')).length;
}

function primeFrame(nodes) {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  return waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render')
    .then(() => {
      setTabFrameWindow(nodes, activeFrameWindow);
      return activeFrameWindow;
    });
}

const GENESIS = 'a'.repeat(64);
const CODEHASH = 'b'.repeat(40);

function buyParams(overrides = {}) {
  return {
    genesis: GENESIS,
    codehash: CODEHASH,
    tokenIndex: '7898',
    priceSats: 100000,
    sellTxid: 'c'.repeat(64),
    sellOutputIndex: 0,
    sellerAddress: '1SellerAddressFixture',
    collectionName: 'MetaBot Avatar',
    name: 'Avatar #7898',
    imgUrl: 'https://metaweb.example/avatar-7898.png',
    ...overrides,
  };
}

function nftBuyManualResponse(token, overrides = {}) {
  return {
    ok: false,
    state: 'manual_action_required',
    code: 'manual_action_required',
    message: 'Confirm this NFT purchase before the host executes it.',
    data: {
      confirmation: {
        actor: { uri: 'metaapp://pin', globalMetaId: 'idq1actor', name: 'Bob' },
        tokenIndex: '7898',
        genesis: GENESIS,
        codehash: CODEHASH,
        priceSats: 100000,
        sellUtxo: { txId: 'c'.repeat(64), outputIndex: 0, sellerAddress: '1SellerAddressFixture', price: 100000 },
        display: {
          name: 'Avatar #7898',
          collectionName: 'MetaBot Avatar',
          imgUrl: 'https://metaweb.example/avatar-7898.png',
          sellerAddress: '1SellerAddressFixture',
        },
        confirmationId: 'nftbuy-1',
        expiresAt: 1735886400123,
        ...overrides.confirmation,
      },
      confirmRequest: {
        resourceUri: 'metaapp://pin',
        kind: 'nft-buy',
        payload: {
          genesis: GENESIS,
          codehash: CODEHASH,
          tokenIndex: '7898',
          priceSats: 100000,
          sellTxid: 'c'.repeat(64),
          sellOutputIndex: 0,
          sellerAddress: '1SellerAddressFixture',
          collectionName: 'MetaBot Avatar',
          name: 'Avatar #7898',
          imgUrl: 'https://metaweb.example/avatar-7898.png',
          confirmed: true,
          hostConfirmation: { id: 'nftbuy-1', token },
        },
        ...overrides.confirmRequest,
      },
    },
  };
}

const nftBuySuccess = {
  ok: true,
  data: {
    kind: 'nft-buy',
    handled: true,
    data: { txid: 'd'.repeat(64), fundingTxid: 'e'.repeat(64), tokenIndex: '7898', genesis: GENESIS },
  },
};

test('browser.nft.buy is refused when the host feature gate is closed', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor({ features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false } }),
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-gate', method: 'browser.nft.buy', params: buyParams(),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'gate refusal');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'unsupported_method');
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.nft.buy validates the four-tuple before any host action', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  const activeFrameWindow = await primeFrame(nodes);

  const cases = [
    buyParams({ genesis: 'not-hex' }),
    buyParams({ codehash: 'zz' }),
    buyParams({ tokenIndex: 'abc' }),
    buyParams({ priceSats: 0 }),
    buyParams({ priceSats: 1.5 }),
    buyParams({ priceSats: '100000' }),
    buyParams({ imgUrl: 'javascript:alert(1)' }),
    buyParams({ sellTxid: 'c'.repeat(64), sellOutputIndex: -1 }),
    buyParams({ sellTxid: '', sellOutputIndex: 2 }),
  ];
  for (let index = 0; index < cases.length; index += 1) {
    postBridgeRequest(windowListeners, activeFrameWindow, {
      id: `buy-bad-${index}`, method: 'browser.nft.buy', params: cases[index],
    });
    await waitFor(() => activeFrameWindow.postMessageCalls.length === index + 1, `refusal ${index}`);
    assert.equal(activeFrameWindow.postMessageCalls[index].ok, false);
    assert.equal(activeFrameWindow.postMessageCalls[index].error.code, 'invalid_params');
  }
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.nft.buy renders the purchase card and returns txids on approval', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      nftBuyManualResponse('opaque-token-1'),
      nftBuySuccess,
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-1', method: 'browser.nft.buy', params: buyParams(),
  });

  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card');
  const phaseOne = actionBody(fetchRequests, 0);
  assert.equal(phaseOne.kind, 'nft-buy');
  assert.equal(phaseOne.payload.genesis, GENESIS);
  assert.equal(phaseOne.payload.priceSats, 100000);
  assert.equal(phaseOne.payload.confirmed, undefined);

  // Card surfaces the NFT image, name, collection, price, seller, and outpoint.
  const cardHtml = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(cardHtml, /Buy NFT/);
  assert.match(cardHtml, /avatar-7898\.png/);
  assert.match(cardHtml, /Avatar #7898/);
  assert.match(cardHtml, /MetaBot Avatar/);
  assert.match(cardHtml, /100,000 sats/);
  assert.match(cardHtml, /0\.001 SPACE/);
  assert.match(cardHtml, /1SellerA\.\.\.ixture/);
  assert.match(cardHtml, /#7898/);
  assert.equal(activeFrameWindow.postMessageCalls.length, 0);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'nft-buy-confirm' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'purchase response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[0].result.txid, 'd'.repeat(64));
  assert.equal(activeFrameWindow.postMessageCalls[0].result.fundingTxid, 'e'.repeat(64));
  // The exact host-issued confirmRequest was resubmitted with hostConfirmation.
  const phaseTwo = actionBody(fetchRequests, 1);
  assert.equal(phaseTwo.kind, 'nft-buy');
  assert.equal(phaseTwo.payload.confirmed, true);
  assert.equal(phaseTwo.payload.hostConfirmation.id, 'nftbuy-1');
  assert.equal(phaseTwo.payload.hostConfirmation.token, 'opaque-token-1');
  assert.equal(phaseTwo.payload.genesis, GENESIS);
});

test('browser.nft.buy returns user_rejected with zero side effects when the card is cancelled', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [nftBuyManualResponse('opaque-token-2')],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-cancel', method: 'browser.nft.buy', params: buyParams(),
  });
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card for cancel');
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-close': '' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'cancel response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'user_rejected');
  // Zero side effects: exactly one actions POST (phase one) and no confirmRequest.
  assert.equal(actionCount(fetchRequests), 1);
  const phaseTwo = actionBody(fetchRequests, 1);
  assert.equal(phaseTwo, null);
});

test('browser.nft.buy surfaces a phase-two host failure on the card and to the page', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      nftBuyManualResponse('opaque-token-3'),
      { ok: false, code: 'nft_buy_failed', message: 'Insufficient balance.' },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-fail', method: 'browser.nft.buy', params: buyParams(),
  });
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card for failure');
  // Register the confirm button so the failure-state transformation (confirm
  // flips to a Close/dismiss control) is observable on the fake element.
  const confirmButton = new FakeElement();
  confirmButton.setAttribute('data-browser-modal-action', 'nft-buy-confirm');
  nodes['[data-browser-modal-root]'].setChild('[data-browser-modal-action="nft-buy-confirm"]', confirmButton);
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'nft-buy-confirm' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'failure response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'nft_buy_failed');
  assert.match(activeFrameWindow.postMessageCalls[0].error.message, /Insufficient balance/);
  assert.equal(actionCount(fetchRequests), 2);
  // The card switched to its failure state instead of closing silently: the
  // confirm control flipped to dismiss and the modal stays open.
  assert.equal(confirmButton.getAttribute('data-browser-modal-action'), 'nft-buy-dismiss');
  assert.equal(confirmButton.textContent, 'Close');
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
});
