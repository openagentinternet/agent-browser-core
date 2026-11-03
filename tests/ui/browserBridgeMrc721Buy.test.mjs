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
    '[data-browser-private-chat]': new FakeElement(),
    '[data-browser-pin-write]': new FakeElement(),
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
    features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false, mrc721Buy: true },
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

// MRC-721 atomic-swap listing credential (v1.1). Shapes are the published
// sell-chain forms hit live during the 2026-11-04 sell/buy chain run; the
// 64-hex txids below are fixture-shaped but byte-length faithful.
const ITEM_PIN_ID = 'f5255da1fe98dda3f28051ebe646dc9060a905c13f35676eeb0c6fd08a0f47a8i0';
const ITEM_TXID = 'f5255da1fe98dda3f28051ebe646dc9060a905c13f35676eeb0c6fd08a0f47a8';
const PARTIAL_TX = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';


function listingCredential(overrides = {}) {
  return {
    version: 1,
    kind: 'mrc721-atomic-swap',
    itemPinId: ITEM_PIN_ID,
    collectionPinId: 'c04dc62b95ad51a58d1e85497bfbe0e38fb9e7e66d4c9dc69f5c6f32ce17b4d2i0',
    outpoint: { txid: ITEM_TXID, vout: 0, satoshis: 546 },
    sellerAddress: '1GrqX7K9jdnUor8hAoAfDx99uFH2tT75Za',
    buyerAddress: '1AxUdSkVdDyDreYSYVoDRFeyS1pvQdvcJx',
    priceSats: 22000,
    partialTx: PARTIAL_TX,
    sigtype: 193,
    feeRate: 10,
    createdAt: 0,
    expiresAt: 0,
    ...overrides,
  };
}

function mrc721BuyManualResponse(token, overrides = {}) {
  return {
    ok: false,
    state: 'manual_action_required',
    code: 'manual_action_required',
    message: 'Confirm this MRC-721 purchase before the host executes it.',
    data: {
      confirmation: {
        actor: { uri: 'metaapp://pin', globalMetaId: 'idq1actor', name: 'Bob' },
        listing: listingCredential(),
        display: {
          name: 'Pixel Sun #6734',
          collectionName: 'Pixel Sun',
          imgUrl: 'metafile://c04dc62b95ad51a58d1e85497bfbe0e38fb9e7e66d4c9dc69f5c6f32ce17b4d2i0',
          sellerAddress: '1GrqX7K9jdnUor8hAoAfDx99uFH2tT75Za',
          buyerAddress: '1AxUdSkVdDyDreYSYVoDRFeyS1pvQdvcJx',
        },
        confirmationId: 'mrc721buy-1',
        expiresAt: 1735886400123,
        ...overrides.confirmation,
      },
      confirmRequest: {
        resourceUri: 'metaapp://pin',
        kind: 'mrc721-buy',
        payload: {
          ...listingCredential(),
          confirmed: true,
          hostConfirmation: { id: 'mrc721buy-1', token },
        },
        ...overrides.confirmRequest,
      },
    },
  };
}

const mrc721BuySuccess = {
  ok: true,
  data: {
    kind: 'mrc721-buy',
    handled: true,
    data: {
      txid: 'd'.repeat(64),
      itemPinId: ITEM_PIN_ID,
      priceSats: 22000,
      sellerAddress: '1GrqX7K9jdnUor8hAoAfDx99uFH2tT75Za',
      buyerAddress: '1AxUdSkVdDyDreYSYVoDRFeyS1pvQdvcJx',
    },
  },
};

test('browser.mrc721.buy is refused when the host feature gate is closed', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor({ features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false } }),
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-gate', method: 'browser.mrc721.buy', params: listingCredential(),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'gate refusal');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'unsupported_method');
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.mrc721.buy validates the listing credential before any host action', async () => {
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
  });
  const activeFrameWindow = await primeFrame(nodes);

  const cases = [
    'not json at all',
    { foo: 1 },
    listingCredential({ kind: 'mrc721-atomic-swap-v2' }),
    listingCredential({ version: 2 }),
    listingCredential({ itemPinId: 'f5255da1i0' }),
    listingCredential({ itemPinId: ITEM_TXID.toUpperCase() + 'i0' }),
    listingCredential({ sellerAddress: 'not-an-address' }),
    listingCredential({ buyerAddress: 'O' }),
    listingCredential({ priceSats: 0 }),
    listingCredential({ priceSats: 21999 }),
    listingCredential({ priceSats: '22000' }),
    listingCredential({ priceSats: 1.5 }),
    listingCredential({ sigtype: 65 }),
    listingCredential({ sigtype: '193' }),
    listingCredential({ partialTx: '' }),
    listingCredential({ partialTx: 'a\nb' }),
    listingCredential({ outpoint: undefined }),
    listingCredential({ outpoint: { txid: 'f5255da1', vout: 0, satoshis: 546 } }),
    listingCredential({ outpoint: { txid: ITEM_TXID, vout: -1, satoshis: 546 } }),
    listingCredential({ outpoint: { txid: ITEM_TXID, vout: 0, satoshis: 0 } }),
    listingCredential({ feeRate: -1 }),
    listingCredential({ collectionPinId: 'c'.repeat(129) }),
  ];
  for (let index = 0; index < cases.length; index += 1) {
    postBridgeRequest(windowListeners, activeFrameWindow, {
      id: `buy-bad-${index}`, method: 'browser.mrc721.buy', params: cases[index],
    });
    await waitFor(() => activeFrameWindow.postMessageCalls.length === index + 1, `refusal ${index}`);
    assert.equal(activeFrameWindow.postMessageCalls[index].ok, false);
    assert.equal(activeFrameWindow.postMessageCalls[index].error.code, 'invalid_params');
  }
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('browser.mrc721.buy renders the purchase card and returns the buy result on approval', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      mrc721BuyManualResponse('opaque-token-1'),
      mrc721BuySuccess,
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-1', method: 'browser.mrc721.buy', params: listingCredential(),
  });

  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card');
  const phaseOne = actionBody(fetchRequests, 0);
  assert.equal(phaseOne.kind, 'mrc721-buy');
  assert.equal(phaseOne.payload.itemPinId, ITEM_PIN_ID);
  assert.equal(phaseOne.payload.priceSats, 22000);
  assert.equal(phaseOne.payload.sigtype, 193);
  assert.equal(phaseOne.payload.confirmed, undefined);

  // Card surfaces the NFT image, name, collection, price, seller and buyer,
  // plus the item outpoint the atomic swap spends.
  const cardHtml = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(cardHtml, /MRC-721 PURCHASE/);
  assert.match(cardHtml, /Pixel Sun #6734/);
  assert.match(cardHtml, /Pixel Sun/);
  assert.match(cardHtml, /f5255da1fe\.\.\./);
  assert.match(cardHtml, /22,000 sats/);
  assert.match(cardHtml, /0\.00022 SPACE/);
  assert.match(cardHtml, /1GrqX7K9\.\.\.tT75Za/);
  assert.match(cardHtml, /1AxUdSkV\.\.\.QdvcJx/);
  assert.match(cardHtml, /directed listing/);
  assert.equal(activeFrameWindow.postMessageCalls.length, 0);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'mrc721-buy-confirm' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'purchase response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, true);
  assert.equal(activeFrameWindow.postMessageCalls[0].result.txid, 'd'.repeat(64));
  assert.equal(activeFrameWindow.postMessageCalls[0].result.itemPinId, ITEM_PIN_ID);
  assert.equal(activeFrameWindow.postMessageCalls[0].result.priceSats, 22000);
  // The exact host-issued confirmRequest was resubmitted with hostConfirmation.
  const phaseTwo = actionBody(fetchRequests, 1);
  assert.equal(phaseTwo.kind, 'mrc721-buy');
  assert.equal(phaseTwo.payload.confirmed, true);
  assert.equal(phaseTwo.payload.hostConfirmation.id, 'mrc721buy-1');
  assert.equal(phaseTwo.payload.hostConfirmation.token, 'opaque-token-1');
  assert.equal(phaseTwo.payload.itemPinId, ITEM_PIN_ID);
  assert.deepEqual(phaseTwo.payload.outpoint, { txid: ITEM_TXID, vout: 0, satoshis: 546 });
});

test('browser.mrc721.buy accepts the credential as a JSON string or wrapped listing', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      mrc721BuyManualResponse('opaque-token-2'),
      mrc721BuySuccess,
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-str', method: 'browser.mrc721.buy', params: JSON.stringify(listingCredential()),
  });

  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card from string credential');
  assert.equal(actionBody(fetchRequests, 0).payload.itemPinId, ITEM_PIN_ID);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'mrc721-buy-confirm' }),
  });
  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'purchase response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, true);
});

test('browser.mrc721.buy returns user_rejected with zero side effects when the card is cancelled', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [mrc721BuyManualResponse('opaque-token-3')],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-cancel', method: 'browser.mrc721.buy', params: listingCredential(),
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
  assert.equal(actionBody(fetchRequests, 1), null);
});

test('browser.mrc721.buy surfaces a phase-two host failure on the card and to the page', async () => {
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result(), {
    runtime: runtimeWithActor(),
    actionResponses: [
      mrc721BuyManualResponse('opaque-token-4'),
      { ok: false, code: 'mrc721_buy_failed', message: 'The listing partial transaction can no longer be completed (item moved).' },
    ],
  });
  const activeFrameWindow = await primeFrame(nodes);

  postBridgeRequest(windowListeners, activeFrameWindow, {
    id: 'buy-fail', method: 'browser.mrc721.buy', params: listingCredential(),
  });
  await waitFor(() => nodes['[data-browser-modal-root]'].hidden === false, 'purchase card for failure');
  const confirmButton = new FakeElement();
  confirmButton.setAttribute('data-browser-modal-action', 'mrc721-buy-confirm');
  nodes['[data-browser-modal-root]'].setChild('[data-browser-modal-action="mrc721-buy-confirm"]', confirmButton);
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'mrc721-buy-confirm' }),
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'failure response');
  assert.equal(activeFrameWindow.postMessageCalls[0].ok, false);
  assert.equal(activeFrameWindow.postMessageCalls[0].error.code, 'mrc721_buy_failed');
  assert.match(activeFrameWindow.postMessageCalls[0].error.message, /no longer be completed/);
  assert.equal(actionCount(fetchRequests), 2);
  // The card switched to its failure state instead of closing silently.
  assert.equal(confirmButton.getAttribute('data-browser-modal-action'), 'mrc721-buy-dismiss');
  assert.equal(confirmButton.textContent, 'Close');
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
});
