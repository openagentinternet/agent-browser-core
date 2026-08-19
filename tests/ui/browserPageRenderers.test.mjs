import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');
const { BROWSER_INDEX_HTML } = require('../../packages/ui/dist/browser/indexHtml.js');

const servicePinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const buzzPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const longBuzzPinId = '8ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const multilineBuzzPinId = '9ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const metaAppPinId = 'a'.repeat(64) + 'i0';
const olderMetaAppPinId = 'b'.repeat(64) + 'i0';
const metaAppCodePinId = 'c'.repeat(64) + 'i0';
const legacyTxid = 'a'.repeat(64);
const genesisTxid = 'b'.repeat(64);
const chatPeerSunny = 'idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz';
const chatPeerDon = 'idq1kwa7ku4w7rrx07cra9t5qr33stszvml3s96qjy';
const chatPeerAtlas = 'idq1g6d3c36xl5uphy8z2w4q8g2jp3xcz9n9s7t4nq';
const pinCreatorGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const pinPeerGlobalMetaId = 'idq1zfazvxaq69uw6txe3ewce30ewyhy9a7mzykgv0';
const relatedMetaAppPinId = 'c67c6dfac211747156757f4bbdb710df1c27e680719c156aaea21f858a1cc2cei0';
const relatedBarePinId = 'fd7603131166e30663981864c0223351deb1336b6eb33a0396237d5847fa504ai9';
const chatPeerSunnyAvatarPinId = 'd'.repeat(64) + 'i0';
const chatPeerDonAvatarPinId = 'e'.repeat(64) + 'i0';
const chatPeerAtlasAvatarPinId = 'f'.repeat(64) + 'i0';
const chatPeerSunnyAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerSunnyAvatarPinId}`;
const chatPeerDonAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerDonAvatarPinId}`;
const chatPeerAtlasAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerAtlasAvatarPinId}`;

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  };
}

function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
  const fetchCalls = [];
  const fetchRequests = [];
  const windowListeners = new Map();
  const infoProfiles = options.infoProfiles || {};
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
    crypto: { randomUUID: () => 'test-session' },
    window: {
      location: { search: '?uri=metaid%3A%2F%2Fidq1fixturebot' },
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
        return { ok: true, json: async () => ({ ok: true, data: resolvePayload }) };
      }
      if (String(url).startsWith('/api/browser/info')) {
        const parsed = new URL(String(url), 'http://browser.test');
        const globalMetaId = parsed.searchParams.get('globalMetaId') || '';
        const profile = infoProfiles[globalMetaId] || { globalMetaId, name: globalMetaId, avatar: '' };
        return { ok: true, json: async () => ({ ok: true, data: profile }) };
      }
      if (String(url).startsWith('/api/browser/actions')) {
        return { ok: true, json: async () => options.actionResponse || ({ ok: true, data: {} }) };
      }
      if (String(url).startsWith('/api/browser/metafile-upload')) {
        return { ok: true, json: async () => options.uploadResponse || ({ ok: false, state: 'manual_action_required', code: 'metafile_upload_unavailable', message: 'MetaFile upload is not available in this host.' }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes, fetchCalls, fetchRequests, windowListeners };
}

function result(renderer, overrides = {}) {
  return {
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture',
    owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1publisher', name: 'Publisher', verificationState: 'partial' },
    renderer,
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    proof: { txid: 'txid-1', pinId: 'pin-1', verificationState: 'partial' },
    source: { resolver: 'test', raw: { kept: true } },
    actions: [],
    ...overrides,
  };
}

test('bot-page renderer shows profile, services, and trusted buttons from homepage JSON', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  fixture.sections[0].items[0].pinId = servicePinId;
  fixture.sections[1].items[0].pinId = buzzPinId;
  // metafile:// image references resolve to the accelerated Metafile content path;
  // web2 image URLs (such as manapi /content/) are passed through unchanged.
  const serviceIconPinId = '2ef06f1c4f5a3b9d8e7c6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5ai0';
  fixture.sections[0].items[0].data.payload.serviceIcon = `metafile://${serviceIconPinId}`;
  const metaappCoverPinId = '3ef06f1c4f5a3b9d8e7c6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5ai0';
  const metaappIconPinId = '4ef06f1c4f5a3b9d8e7c6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5ai0';
  const metaappsSection = fixture.sections.find((section) => section.id === 'metaapps');
  metaappsSection.items[0].data.payload.coverImg = `https://manapi.metaid.io/content/${metaappCoverPinId}`;
  metaappsSection.items[0].data.payload.icon = `https://manapi.metaid.io/content/${metaappIconPinId}`;
  const avatarUrl = 'https://file.metaid.io/metafile-indexer/content/avatar-pin';
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: fixture,
  }, {
    resourceType: 'bot',
    title: 'Fixture Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1fixturebot', name: 'Fixture Bot', avatar: avatarUrl, verificationState: 'partial' },
    actions: [
      { id: 'message', label: 'Message', kind: 'private-chat', enabled: true },
      {
        id: 'conversation',
        label: 'Conversation',
        kind: 'open-conversation',
        enabled: true,
        payload: {
          conversationUri: 'map://simplemsg/conversation?peer=idq1fixturebot',
          peerGlobalMetaId: 'idq1fixturebot',
        },
      },
      { id: 'services', label: 'Services', kind: 'service-list', enabled: true },
      { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: 'metaid://idq1fixturebot' },
    ],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Fixture Review'), 'bot page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Fixture Bot/);
  assert.match(html, /idq1fixturebot/);
  assert.match(html, /<p class="browser-globalmetaid">idq1fixturebot<\/p><span class="browser-presence-tag" aria-label="Online status"><span class="browser-presence-dot" aria-hidden="true"><\/span><span>online<\/span><\/span>/);
  assert.match(html, /Builds Agent Browser fixtures/);
  assert.match(html, /Overview/);
  assert.match(html, /Recent Activity/);
  assert.doesNotMatch(html, /browser-bot-summary/);
  assert.match(html, /Bio:<\/strong>\s*Builds Agent Browser fixtures/);
  // profile.llm.payload.primaryProvider ("codex") renders a Primary provider chip
  // with the Codex brand icon inside the Overview section.
  assert.match(html, /LLM:<\/strong>/);
  assert.match(html, /<div class="browser-overview-meta"><strong class="browser-overview-label">LLM:<\/strong><div class="browser-service-meta browser-llm-chips">/);
  assert.match(html, /browser-llm-provider-chip/);
  assert.match(html, /Primary/);
  assert.match(html, /Codex/);
  assert.match(html, /browser-llm-provider-icon/);
  assert.match(html, /browser-llm-chips/);
  assert.doesNotMatch(html, /Fallback/);
  assert.doesNotMatch(html, /browser-proof-icon/);
  assert.doesNotMatch(html, /<section class="browser-document-section browser-bot-buzzes">/);
  assert.match(html, /<h3>MetaApps<\/h3>/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /Fixture MetaApp/);
  assert.match(html, /Published a v3 homepage fixture/);
  assert.equal((html.match(/Published a v3 homepage fixture\./g) || []).length, 1);
  assert.match(html, /data-browser-action="private-chat"/);
  assert.doesNotMatch(html, /data-browser-action="service-list"/);
  assert.doesNotMatch(html, /data-browser-action="open-conversation"/);
  assert.doesNotMatch(html, /data-browser-action="copy"/);
  assert.doesNotMatch(html, /data-browser-follow/);
  assert.doesNotMatch(html, /<span>Follow<\/span>/);
  assert.match(html, /class="browser-service-card"/);
  assert.match(html, /fixture-review/);
  assert.match(html, /0 SPACE/);
  assert.match(html, /Output/);
  assert.match(html, /data-browser-action="service-call"/);
  assert.match(html, new RegExp(`data-service-id="${servicePinId}"`));
  assert.match(html, new RegExp(`href="pin://${servicePinId}" data-browser-map-link class="browser-service-title browser-bot-inline-link"`));
  assert.doesNotMatch(html, new RegExp(`href="map://simplebuzz/pin/${buzzPinId}"`));
  assert.match(html, /https:\/\/file\.metaid\.io\/metafile-indexer\/content\/avatar-pin/);
  // metafile:// image references resolve to the accelerated Metafile content path.
  assert.match(html, new RegExp(`https:\\/\\/file\\.metaid\\.io\\/metafile-indexer\\/api\\/v1\\/files\\/accelerate\\/content\\/${serviceIconPinId}`));
  // web2 image URLs (manapi /content/) are passed through unchanged.
  assert.match(html, new RegExp(`src="https:\\/\\/manapi\\.metaid\\.io\\/content\\/${metaappCoverPinId}"`));
  assert.match(html, new RegExp(`src="https:\\/\\/manapi\\.metaid\\.io\\/content\\/${metaappIconPinId}"`));
});

test('bot-page Overview renders both Primary and Fallback LLM provider chips', async () => {
  // Mirrors the real v3 homepage shape (e.g. so.metaid.io bot-homepage API),
  // where profile.llm.payload carries both primaryProvider and fallbackProvider.
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1llmbot' },
    profile: {
      name: 'LLM Bot',
      bio: 'Runs on two providers.',
      llm: {
        pinId: '3e9d1dc7e8f3d972fe1cfce6cb4715f9f88ddf5c2779a5b75c8a0f2dfb9adaf2i0',
        payload: { primaryProvider: 'codex', fallbackProvider: 'cursor' },
      },
    },
    sections: [],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1llmbot',
    normalizedUri: 'metaid://idq1llmbot',
    resourceType: 'bot',
    title: 'LLM Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1llmbot', name: 'LLM Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Overview'), 'llm chips render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /LLM:<\/strong>/);
  assert.match(html, /<div class="browser-overview-meta"><strong class="browser-overview-label">LLM:<\/strong><div class="browser-service-meta browser-llm-chips">/);
  assert.match(html, /browser-llm-chips/);
  assert.match(html, /Primary/);
  assert.match(html, /Codex/);
  assert.match(html, /Fallback/);
  assert.match(html, /Cursor/);
  // both chips carry the icon wrapper, and each renders an inlined <svg>.
  assert.equal((html.match(/browser-llm-provider-chip/g) || []).length, 2);
  assert.equal((html.match(/browser-llm-provider-icon/g) || []).length, 2);
  assert.equal((html.match(/<svg/g) || []).length >= 2, true);
});

test('bot-page Overview hides LLM provider chips when profile.llm is absent or empty', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1nollmbot' },
    profile: { name: 'No-LLM Bot', bio: 'No provider configured.' },
    sections: [],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1nollmbot',
    normalizedUri: 'metaid://idq1nollmbot',
    resourceType: 'bot',
    title: 'No-LLM Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1nollmbot', name: 'No-LLM Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Overview'), 'no-llm render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Bio:<\/strong>\s*No provider configured\./);
  assert.doesNotMatch(html, /browser-llm-provider-chip/);
  assert.doesNotMatch(html, /browser-llm-chips/);
  assert.doesNotMatch(html, /LLM:<\/strong>/);
  assert.doesNotMatch(html, /Primary/);
  assert.doesNotMatch(html, /Fallback/);
});

test('bot-page Overview hides LLM provider chips when profile.llm.payload is null', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1nullllmbot' },
    profile: { name: 'Null-LLM Bot', bio: 'Empty LLM payload.', llm: null },
    sections: [],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1nullllmbot',
    normalizedUri: 'metaid://idq1nullllmbot',
    resourceType: 'bot',
    title: 'Null-LLM Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1nullllmbot', name: 'Null-LLM Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Overview'), 'null-llm render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Bio:<\/strong>\s*Empty LLM payload\./);
  assert.doesNotMatch(html, /browser-llm-provider-chip/);
  assert.doesNotMatch(html, /browser-llm-chips/);
  assert.doesNotMatch(html, /LLM:<\/strong>/);
});

test('bot-page document template keeps long profile bio visible once in Overview', async () => {
  const longBio = 'Agent Internet is a convenient name for an emerging permissionless network of Agents. On this network, Agents can create identities without permission, discover other Agents, and communicate and collaborate without relying on any central party or fixed Web2 infrastructure. It is a decentralized, self-growing network.';
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1agentinternet' },
    profile: { name: 'Agent Internet', bio: longBio },
    sections: [],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1agentinternet',
    normalizedUri: 'metaid://idq1agentinternet',
    resourceType: 'bot',
    title: 'Agent Internet',
    owner: { kind: 'bot', globalMetaId: 'idq1agentinternet', name: 'Agent Internet', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Overview'), 'long bio render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.doesNotMatch(html, /browser-bot-summary/);
  assert.match(html, /Bio:<\/strong>/);
  assert.equal((html.match(new RegExp(escapeRegExp(longBio), 'g')) || []).length, 1);
});

test('bot-page document template hides Bio and LLM labels when no overview content exists', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1emptyoverviewbot' },
    profile: { name: 'Empty Overview Bot' },
    sections: [],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1emptyoverviewbot',
    normalizedUri: 'metaid://idq1emptyoverviewbot',
    resourceType: 'bot',
    title: 'Empty Overview Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1emptyoverviewbot', name: 'Empty Overview Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Overview'), 'empty overview render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /This Bot has not published an overview yet\./);
  assert.doesNotMatch(html, /Bio:<\/strong>/);
  assert.doesNotMatch(html, /LLM:<\/strong>/);
});

test('bot-page renderer does not create pin detail links from non-pin service ids', async () => {
  const homepage = {
    globalMetaId: 'idq1servicebot',
    profile: { name: 'Service Bot' },
    services: [
      {
        id: 'callable-service-id',
        displayName: 'Callable Service',
        description: 'This service is callable but has no published pin id.',
      },
    ],
  };
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'Service Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1servicebot', name: 'Service Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Callable Service'), 'service without pin render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Callable Service/);
  assert.match(html, /data-browser-action="service-call"/);
  assert.match(html, /data-service-id="callable-service-id"/);
  assert.doesNotMatch(html, /pin:\/\/callable-service-id/);
  assert.doesNotMatch(html, /data-browser-map-link/);
});

test('bot-page renderer truncates buzz detail longer than 200 characters with ellipsis', async () => {
  const longContent = 'A'.repeat(280);
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1longbuzzbot' },
    profile: { name: 'Long Buzz Bot', bio: 'Posts long buzz content.' },
    sections: [
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        items: [
          {
            pinId: longBuzzPinId,
            protocolPath: '/protocols/simplebuzz',
            timestamp: 1780760002,
            data: { payload: { content: longContent } },
          },
        ],
      },
    ],
  };
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'Long Buzz Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1longbuzzbot', name: 'Long Buzz Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Long Buzz Bot'), 'long buzz render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Recent Activity/);
  assert.doesNotMatch(html, new RegExp(`href="map://simplebuzz/pin/${longBuzzPinId}"`));
  assert.ok(html.includes('A'.repeat(200) + '......'), 'buzz detail should be truncated to 200 characters followed by ellipsis');
  assert.equal((html.match(new RegExp('A'.repeat(200) + '\\.\\.\\.\\.', 'g')) || []).length, 1);
  assert.ok(!html.includes('A'.repeat(280)), 'full untruncated buzz content must not be rendered');
});

test('bot-page renderer mixes buzzes and chats in Recent Activity by descending timestamp and keeps peer metaid links inline', async () => {
  const ownerAvatarUrl = 'https://file.metaid.io/metafile-indexer/content/owner-avatar-pin';
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1recentactivitybot' },
    profile: { name: 'Eric', bio: 'Shares recent Browser activity.' },
    sections: [
      {
        id: 'services',
        protocolPath: '/protocols/skill-service',
        items: [],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [],
      },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: '1'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerSunny,
                name: 'AI_Sunny',
                avatarId: chatPeerSunnyAvatarPinId,
              },
            },
          },
          {
            pinId: '2'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 18) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerDon,
                name: 'don-bot',
                avatarId: chatPeerDonAvatarPinId,
              },
            },
          },
          {
            pinId: '3'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 16) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerAtlas,
                name: 'Atlas',
                avatarId: chatPeerAtlasAvatarPinId,
              },
            },
          },
        ],
      },
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        items: [
          {
            pinId: '4'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplebuzz',
            timestamp: Math.floor(Date.UTC(2026, 5, 20) / 1000),
            data: {
              payload: {
                content: 'Published new build.',
              },
            },
          },
          {
            pinId: '5'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplebuzz',
            timestamp: Math.floor(Date.UTC(2026, 5, 17) / 1000),
            data: {
              payload: {
                content: 'Published earlier build.',
              },
            },
          },
          {
            pinId: '6'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplebuzz',
            timestamp: Math.floor(Date.UTC(2026, 5, 15) / 1000),
            data: {
              payload: {
                content: 'Oldest activity entry.',
              },
            },
          },
        ],
      },
    ],
  };
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1recentactivitybot',
    normalizedUri: 'metaid://idq1recentactivitybot',
    resourceType: 'bot',
    title: 'Eric',
    owner: { kind: 'bot', globalMetaId: 'idq1recentactivitybot', name: 'Eric', avatar: ownerAvatarUrl, verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Recent Activity'), 'mixed recent activity render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.equal((html.match(/class="browser-activity-row"/g) || []).length, 6);
  assert.match(html, />Eric<\/span><\/span><span style="color:var\(--browser-muted\);"> interacted with <\/span>/);
  assert.match(html, new RegExp(`href="metaid://${chatPeerSunny}"[^>]*data-browser-map-link`));
  assert.match(html, /AI_Sunny<\/span><\/a>/);
  assert.match(html, /AI_Sunny<\/span><\/a><span style="color:var\(--browser-muted\);"> on 2026-06-19<\/span>/);
  assert.match(html, new RegExp(escapeRegExp(chatPeerSunnyAvatarUrl)));
  assert.match(html, new RegExp(escapeRegExp(chatPeerDonAvatarUrl)));
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
  assert.ok(html.indexOf('Published new build.') < html.indexOf('AI_Sunny'), 'latest buzz should render before newer chat peers');
  assert.ok(html.indexOf('AI_Sunny') < html.indexOf('don-bot'), 'newer chat should render before older chat');
  assert.ok(html.indexOf('don-bot') < html.indexOf('Published earlier build.'), 'older buzz should remain below newer chat');
  assert.ok(html.indexOf('Published earlier build.') < html.indexOf('Atlas'), 'older chat should remain below older buzz');
  assert.ok(html.indexOf('Atlas') < html.indexOf('Oldest activity entry.'), 'oldest buzz should render last');
  assert.equal(fetchCalls.filter((url) => url.includes('/api/browser/info')).length, 0);
});

test('bot-page renderer removes linked title for multiline simplebuzz recent activity rows', async () => {
  const multilineContent = [
    '[Dev Diary] OAC browser boundary cleanup lockfile sync',
    '',
    'Commit: efea0079 chore: sync package lock after browser cleanup',
    '',
    'This small follow-up syncs package-lock.json with the earlier package.json cleanup so downstream installs stay deterministic across Browser integration work.',
  ].join('\n');
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1multilinebuzzbot' },
    profile: { name: 'Multiline Buzz Bot', bio: 'Posts multiline buzz content.' },
    sections: [
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        items: [
          {
            pinId: multilineBuzzPinId,
            protocolPath: '/protocols/simplebuzz',
            timestamp: 1780760003,
            data: { payload: { content: multilineContent } },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'Multiline Buzz Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1multilinebuzzbot', name: 'Multiline Buzz Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Multiline Buzz Bot'), 'multiline buzz render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Recent Activity/);
  assert.match(html, /Commit: efea0079 chore: sync package lock after browser cleanup/);
  assert.doesNotMatch(html, new RegExp(`href=\"map://simplebuzz/pin/${multilineBuzzPinId}\"`));
  assert.equal((html.match(/Commit: efea0079 chore: sync package lock after browser cleanup/g) || []).length, 1);
});

test('bot-page renderer keeps MetaApp intro scoped to each card and uses Run deep links', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1metaappbot' },
    profile: { name: 'MetaApp Bot', bio: 'Publishes Browser MetaApps.' },
    sections: [
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            timestamp: 1780760004,
            data: {
              payload: {
                appName: 'eric-homepage',
                code: `metafile://${metaAppCodePinId}.zip`,
                content: `metafile://${metaAppCodePinId}.zip`,
                codeType: 'application/zip',
                contentType: 'application/zip',
                coverImg: 'https://file.metaid.io/metafile-indexer/content/cover-pin',
                icon: 'https://file.metaid.io/metafile-indexer/content/icon-pin',
                title: 'eric-homepage',
                version: '1.0.0',
              },
            },
          },
          {
            pinId: olderMetaAppPinId,
            protocolPath: '/protocols/metaapp',
            timestamp: 1780760003,
            data: {
              payload: {
                appName: 'eric-homepage',
                intro: 'hello，大家好。我可以为你分享我的开发经验',
                title: 'eric',
                version: '0.9.0',
              },
            },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'MetaApp Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1metaappbot', name: 'MetaApp Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('MetaApps'), 'metaapp render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  const introText = 'hello，大家好。我可以为你分享我的开发经验';
  const metaAppsSection = html.match(/<section class="browser-document-section browser-bot-metaapps"><h3>MetaApps<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(metaAppsSection, 'metaapps section should render');
  const [firstMetaAppRow] = metaAppsSection[1].split('</article>');
  assert.match(html, new RegExp(`href="metaapp://${metaAppPinId}"`));
  assert.doesNotMatch(html, new RegExp(`href="map://metaapp/pin/${metaAppPinId}"`));
  assert.match(firstMetaAppRow, /class="browser-metaapp-run"/);
  assert.match(firstMetaAppRow, /class="browser-metaapp-cover-image"/);
  assert.match(firstMetaAppRow, /class="browser-metaapp-icon-image"/);
  assert.match(firstMetaAppRow, new RegExp(`<a href="pin://${metaAppPinId}" data-browser-map-link class="browser-metaapp-title browser-bot-inline-link">${escapeRegExp('eric-homepage')}</a><span class="browser-metaapp-name">${escapeRegExp('eric-homepage')}</span>`));
  assert.doesNotMatch(firstMetaAppRow, /class="browser-metaapp-name browser-bot-inline-link"/);
  assert.match(html, /class="browser-metaapp-download"/);
  assert.equal((html.match(new RegExp(introText, 'g')) || []).length, 1);
  assert.doesNotMatch(firstMetaAppRow, new RegExp(introText));
  assert.doesNotMatch(html, new RegExp(`>metafile://${metaAppCodePinId}\\.zip<`));
  assert.match(html, new RegExp(`href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));
  assert.match(html, /aria-label="Download MetaApp code zip"/);
});

test('bot-page renderer shows a non-clickable Disabled action for disabled MetaApps', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1metaappbot' },
    profile: { name: 'MetaApp Bot', bio: 'Publishes Browser MetaApps.' },
    sections: [
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            timestamp: 1780760004,
            data: {
              payload: {
                appName: 'eric-homepage',
                title: 'eric-homepage',
                version: '1.0.0',
                disabled: true,
              },
            },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'MetaApp Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1metaappbot', name: 'MetaApp Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('MetaApps'), 'metaapp render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /class="browser-metaapp-run is-disabled" aria-disabled="true"/);
  assert.match(html, /<span>Disabled<\/span>/);
  assert.doesNotMatch(html, new RegExp(`href="metaapp://${metaAppPinId}"`));
  assert.doesNotMatch(html, /<span>Run<\/span>/);
  assert.match(html, new RegExp(`<a href="pin://${metaAppPinId}" data-browser-map-link class="browser-metaapp-title browser-bot-inline-link">eric-homepage</a>`));
});

test('bot-page document renders service and MetaApp cards from v3 payload fields', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1styledcardsbot' },
    profile: { name: 'Styled Cards Bot', bio: 'Publishes services and MetaApps.' },
    sections: [
      {
        id: 'services',
        protocolPath: '/protocols/skill-service',
        items: [
          {
            pinId: servicePinId,
            protocolPath: '/protocols/skill-service',
            data: {
              payload: {
                displayName: '微博热搜',
                description: '获取微博热搜榜数据，返回热搜标题、热度值和跳转链接。',
                providerSkill: 'weibo-hot-trend',
                price: '0.00001',
                currency: 'SPACE',
                serviceIcon: 'https://manapi.metaid.io/content/service-icon-pin',
                outputType: 'text',
              },
            },
          },
        ],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            data: {
              payload: {
                appName: 'Styled MetaApp',
                code: `metafile://${metaAppCodePinId}.zip`,
                content: `metafile://${metaAppCodePinId}.zip`,
                contentType: 'application/zip',
                coverImg: 'https://file.metaid.io/metafile-indexer/content/card-cover',
                icon: 'https://file.metaid.io/metafile-indexer/content/card-icon',
                intro: 'Runs a styled Browser application.',
                title: 'Styled MetaApp Title',
                version: '1.2.3',
              },
            },
          },
        ],
      },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: '1'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerSunny,
                name: 'AI_Sunny',
              },
            },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1styledcardsbot',
    normalizedUri: 'metaid://idq1styledcardsbot',
    resourceType: 'bot',
    title: 'Styled Cards Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1styledcardsbot', name: 'Styled Cards Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('AI_Sunny'), 'styled bot page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  const servicesSection = html.match(/<section class="browser-document-section browser-bot-services"><h3>Services<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(servicesSection, 'services section should render');
  assert.match(servicesSection[1], /class="browser-service-card"/);
  assert.match(servicesSection[1], /微博热搜/);
  assert.match(servicesSection[1], new RegExp(`href="pin://${servicePinId}" data-browser-map-link class="browser-service-title browser-bot-inline-link"`));
  assert.match(servicesSection[1], /获取微博热搜榜数据，返回热搜标题、热度值和跳转链接。/);
  assert.match(servicesSection[1], /weibo-hot-trend/);
  assert.match(servicesSection[1], /0\.00001 SPACE/);
  assert.match(servicesSection[1], /<div class="browser-service-actions"><span class="browser-service-price">0\.00001 SPACE<\/span><button type="button" data-browser-action="service-call"/);
  assert.match(servicesSection[1], /Output/);
  assert.match(servicesSection[1], /text/);
  assert.match(servicesSection[1], /class="browser-service-icon-image"/);
  assert.match(servicesSection[1], /data-browser-action="service-call"/);
  assert.doesNotMatch(servicesSection[1], /Input/);

  const metaAppsSection = html.match(/<section class="browser-document-section browser-bot-metaapps"><h3>MetaApps<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(metaAppsSection, 'metaapps section should render');
  assert.match(metaAppsSection[1], /class="browser-metaapp-card"/);
  assert.match(metaAppsSection[1], /Styled MetaApp Title/);
  assert.match(metaAppsSection[1], /Styled MetaApp/);
  assert.match(metaAppsSection[1], new RegExp(`<a href="pin://${metaAppPinId}" data-browser-map-link class="browser-metaapp-title browser-bot-inline-link">Styled MetaApp Title</a>`));
  assert.match(metaAppsSection[1], /<span class="browser-metaapp-name">Styled MetaApp<\/span>/);
  assert.doesNotMatch(metaAppsSection[1], /class="browser-metaapp-name browser-bot-inline-link"/);
  assert.match(metaAppsSection[1], /Runs a styled Browser application./);
  assert.match(metaAppsSection[1], /1\.2\.3/);
  assert.match(metaAppsSection[1], /application\/zip/);
  assert.match(metaAppsSection[1], new RegExp(`class="browser-metaapp-run" href="metaapp://${metaAppPinId}" data-browser-map-link`));
  assert.match(metaAppsSection[1], /class="browser-metaapp-cover-image"/);
  assert.match(metaAppsSection[1], /class="browser-metaapp-icon-image"/);
  assert.match(metaAppsSection[1], /<div class="browser-metaapp-actions">[\s\S]*class="browser-metaapp-run"[\s\S]*class="browser-metaapp-download"/);
  assert.match(metaAppsSection[1], /<div class="browser-metaapp-main">/);
  assert.doesNotMatch(metaAppsSection[1], /class="browser-pin-badge"/);
  assert.match(metaAppsSection[1], new RegExp(`href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));

  assert.match(html, /href="metaid:\/\/idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz"[^>]*style="[^"]*text-decoration:none;color:var\(--browser-accent\);"/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-bot-inline-link \{\s+color: #3558c8;\s+text-decoration: none;\s+\}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-bot-inline-link:hover,\s+\.browser-bot-inline-link:focus \{\s+color: #3558c8;\s+text-decoration: none;\s+\}/);
  assert.doesNotMatch(BROWSER_INDEX_HTML, /\.browser-metaapp-name\.browser-bot-inline-link \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-metaapp-actions \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-card \{\n        display: grid;\n        grid-template-columns: 44px minmax\(0, 1fr\) minmax\(96px, auto\);\n        align-items: start;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-metaapp-card \{\n        display: grid;\n        grid-template-columns: 88px minmax\(0, 1fr\) auto;\n        align-items: start;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-icon,\s+\.browser-metaapp-icon,\s+\.browser-metaapp-cover \{\n        display: inline-flex;[\s\S]*?overflow: hidden;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-icon \{\n        align-self: start;\n        width: 44px;\n        height: 44px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-icon-image,\s+\.browser-metaapp-icon-image,\s+\.browser-metaapp-cover-image \{\n        width: 100%;\n        height: 100%;\n        display: block;\n        object-fit: cover;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-main,\s+\.browser-metaapp-main,\s+\.browser-metaapp-title-block \{\n        min-width: 0;\n        display: grid;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-heading \{\n        min-width: 0;\n        display: flex;\n        align-items: baseline;\n        gap: 10px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-price \{\n        color: var\(--browser-muted\);\n        text-align: right;[\s\S]*?white-space: nowrap;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-actions \{\n        min-width: 0;\n        display: grid;\n        justify-items: end;\n        align-content: start;\n        gap: 8px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-card button \{\n        justify-self: end;\n        white-space: nowrap;\n        border-color: #cfe0ff;\n        background: #eaf1ff;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-meta,\s+\.browser-metaapp-facts \{\n        display: flex;\n        flex-wrap: wrap;\n        gap: 6px;\n        min-width: 0;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-provider,\s+\.browser-card-chip,\s+\.browser-metaapp-fact \{\n        min-width: 0;\n        display: inline-flex;[\s\S]*?border-radius: 999px;[\s\S]*?font-size: 11px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-presence-tag \{\n        justify-self: start;\n        display: inline-flex;[\s\S]*?border-radius: 999px;[\s\S]*?font-size: 11px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-presence-dot \{\n        width: 7px;\n        height: 7px;[\s\S]*?box-shadow: 0 0 0 2px rgba\(34, 197, 94, \.16\), 0 0 10px rgba\(34, 197, 94, \.42\);/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-overview-label \{\n        color: var\(--browser-muted\);\n        font-weight: 700;\n      \}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-overview-meta \{\n        display: flex;\n        align-items: center;\n        gap: 8px;\n        min-width: 0;\n        flex-wrap: nowrap;\n      \}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-overview-meta \.browser-llm-chips \{\n        margin-top: 0;\n        flex-wrap: nowrap;\n      \}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-metaapp-actions \{\n        display: grid;\n        grid-template-columns: 64px 30px;\n        gap: 6px;\n        justify-self: end;\n        align-self: center;\n        width: 100px;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-card,\s+\.browser-metaapp-card \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-actions \{/);
  const narrowCss = BROWSER_INDEX_HTML.match(/@media \(max-width: 520px\) \{[\s\S]*?\.browser-icon-button\.is-loading/);
  assert.ok(narrowCss, 'narrow viewport CSS should be present');
  assert.doesNotMatch(narrowCss[0], /\.browser-service-card,\s+\.browser-metaapp-card,/);
  assert.doesNotMatch(narrowCss[0], /\.browser-service-card button/);
  assert.match(narrowCss[0], /\.browser-service-actions \{\s+justify-items: end;/);
  assert.match(BROWSER_INDEX_HTML, /@media \(max-width: 520px\) \{[\s\S]*?\.browser-metaapp-media \{\n          width: 88px;\n          justify-self: start;\n        \}\n        \.browser-metaapp-actions \{\n          width: 100px;\n          justify-self: start;/);
  assert.match(html, /<path d="M12 3v12"><\/path>/);
});

test('bot-page document hides empty Services and MetaApps sections', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1emptycardsbot' },
    profile: { name: 'Empty Cards Bot', bio: 'Has only activity.' },
    sections: [
      { id: 'services', protocolPath: '/protocols/skill-service', items: [] },
      { id: 'metaapps', protocolPath: '/protocols/metaapp', items: [] },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: '1'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: { interactWith: { globalMetaId: chatPeerSunny, name: 'AI_Sunny' } },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1emptycardsbot',
    normalizedUri: 'metaid://idq1emptycardsbot',
    resourceType: 'bot',
    title: 'Empty Cards Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1emptycardsbot', name: 'Empty Cards Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Recent Activity'), 'empty card sections render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.doesNotMatch(html, /browser-bot-services/);
  assert.doesNotMatch(html, /<h3>Services<\/h3>/);
  assert.doesNotMatch(html, /No public services/);
  assert.doesNotMatch(html, /browser-bot-metaapps/);
  assert.doesNotMatch(html, /<h3>MetaApps<\/h3>/);
  assert.doesNotMatch(html, /No public MetaApps/);
  assert.match(html, /Recent Activity/);
  assert.match(html, /AI_Sunny/);
});

test('bot-page renderer links each Recent Activity item to its pin:// detail via a [PIN] badge', async () => {
  const buzzPin = '4'.repeat(64) + 'i0';
  const chatPin = '1'.repeat(64) + 'i0';
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1pinbadgebot' },
    profile: { name: 'Badge Bot', bio: 'Exercises [PIN] badges.' },
    sections: [
      { id: 'services', protocolPath: '/protocols/skill-service', items: [] },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: chatPin,
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: { interactWith: { globalMetaId: chatPeerSunny, name: 'AI_Sunny' } },
          },
        ],
      },
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        items: [
          {
            pinId: buzzPin,
            protocolPath: '/protocols/simplebuzz',
            timestamp: Math.floor(Date.UTC(2026, 5, 20) / 1000),
            data: { payload: { content: 'Published new build.' } },
          },
        ],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            timestamp: 1780760004,
            data: { payload: { appName: 'badge-app', title: 'Badge App', version: '1.0.0' } },
          },
        ],
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: homepage,
  }, {
    uri: 'metaid://idq1pinbadgebot',
    normalizedUri: 'metaid://idq1pinbadgebot',
    resourceType: 'bot',
    title: 'Badge Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1pinbadgebot', name: 'Badge Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Recent Activity'), 'pin badge render');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  // Buzz row: PIN badge links to pin://<buzzPin> via internal nav.
  const buzzBadge = new RegExp(`class="browser-pin-badge" href="pin://${buzzPin}" data-browser-map-link[^>]*>PIN`);
  assert.match(html, buzzBadge);
  // Chat row: PIN badge links to the chat interaction pin.
  const chatBadge = new RegExp(`class="browser-pin-badge" href="pin://${chatPin}" data-browser-map-link[^>]*>PIN`);
  assert.match(html, chatBadge);
  // MetaApps use Run for the app link and do not render a PIN badge in the card section.
  const metaAppsSection = html.match(/<section class="browser-document-section browser-bot-metaapps"><h3>MetaApps<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(metaAppsSection, 'metaapps section should render');
  assert.match(metaAppsSection[1], new RegExp(`href="metaapp://${metaAppPinId}"`));
  assert.doesNotMatch(metaAppsSection[1], /class="browser-pin-badge"/);
});

test('bot-page renderer uses compact-list template with normalized future lists', async () => {
  const homepage = {
    globalMetaId: 'idq1compactbot',
    profile: {
      name: 'Compact Bot',
      avatar: 'https://so.example.test/content/compact-avatar',
      bio: 'Runs compact Browser fixtures.',
    },
    homepage: {
      summary: 'Compact summary.',
    },
    services: [
      {
        id: 'svc-review',
        currentPinId: 'service-pin-1',
        displayName: 'Review Service',
        description: 'Reviews Browser templates.',
      },
    ],
    skills: [
      {
        name: 'Template Authoring',
        description: 'Creates Bot homepage layouts.',
      },
    ],
    buzz: [
      {
        title: 'Template update',
        description: 'Published a compact renderer.',
      },
    ],
  };
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    templateId: 'compact-list',
    data: homepage,
  }, {
    resourceType: 'bot',
    title: 'Compact Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1compactbot', name: 'Compact Bot', verificationState: 'verified' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-bot-template-compact-list'), 'compact template render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Compact Bot/);
  assert.match(html, /Review Service/);
  assert.match(html, /data-browser-action="service-call"/);
  assert.match(html, /Template Authoring/);
  assert.match(html, /Template update/);
  assert.match(html, /Compact summary/);
});

test('html-iframe renderer is sandboxed without privileged permissions', async () => {
  const { nodes } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /<iframe class="browser-html-frame" sandbox="allow-scripts" src="https:\/\/metaweb\.example\/app"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.doesNotMatch(html, /allow-top-navigation/);
  assert.doesNotMatch(html, /wallet|payment|signing/i);
});

test('html-iframe navigation bridge accepts only active iframe internal URI messages', async () => {
  const targetUri = `pin://${servicePinId}`;
  const activeFrameWindow = {};
  const inactiveFrameWindow = {};
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  assert.equal(typeof listener, 'function');

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: targetUri },
    source: inactiveFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes(`uri=${encodeURIComponent(targetUri)}`)), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: 'https://example.com' },
    source: activeFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes('https%3A%2F%2Fexample.com')), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: 'javascript:alert(1)' },
    source: activeFrameWindow,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls.some((url) => String(url).includes('javascript%3Aalert')), false);

  listener({
    data: { type: 'agent-browser:navigate', version: 1, uri: targetUri },
    source: activeFrameWindow,
  });
  await waitFor(
    () => fetchCalls.some((url) => String(url).includes(`uri=${encodeURIComponent(targetUri)}`)),
    'bridge navigation resolve',
  );
});

test('html-iframe bridge responds with sanitized current actor', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchCalls, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{
        id: 'standalone:actor',
        label: 'Bob',
        kind: 'wallet',
        globalMetaId: 'idq1actor',
        avatar: 'https://example.invalid/avatar.png',
        isDefault: true,
        capabilities: ['template-settings'],
      }],
      defaultActor: {
        id: 'standalone:actor',
        label: 'Bob',
        kind: 'wallet',
        globalMetaId: 'idq1actor',
        avatar: 'https://example.invalid/avatar.png',
        isDefault: true,
        capabilities: ['template-settings'],
      },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-1',
      method: 'browser.actor.current',
      params: {},
    },
  });

  // No response until the user allows identity access in the consent modal.
  assert.deepEqual(activeFrameWindow.postMessageCalls, []);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });

  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-1',
    ok: true,
    result: {
      actor: {
        uri: 'metaid://idq1actor',
        globalMetaId: 'idq1actor',
        name: 'Bob',
      },
    },
  });

  // Consent is remembered for the resource: a second call answers immediately.
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-2',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[1])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-2',
    ok: true,
    result: {
      actor: {
        uri: 'metaid://idq1actor',
        globalMetaId: 'idq1actor',
        name: 'Bob',
      },
    },
  });
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
});

test('html-iframe bridge denies the actor snapshot when the user dismisses the consent modal', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-deny-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  // Dismiss via the modal close (X) button — same path as Cancel/Deny.
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-close': '' }),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-deny-1',
    ok: false,
    error: {
      code: 'consent_denied',
      message: 'The user denied identity access for this MetaApp.',
    },
  });

  // Denial is remembered for the page session: asking again is denied
  // immediately without re-opening the consent modal.
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-deny-2',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[1])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'actor-deny-2',
    ok: false,
    error: {
      code: 'consent_denied',
      message: 'The user denied identity access for this MetaApp.',
    },
  });
  assert.equal(activeFrameWindow.postMessageCalls.length, 2);
});

test('html-iframe bridge opens the Browser private-chat composer for the current Bot owner', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const targetGlobalMetaId = 'idq1targetbot';
  const { context, nodes, fetchCalls, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }, {
    uri: `metaid://${targetGlobalMetaId}`,
    normalizedUri: `metaid://${targetGlobalMetaId}`,
    owner: {
      kind: 'bot',
      globalMetaId: targetGlobalMetaId,
      name: 'Target Bot',
      verificationState: 'partial',
    },
  }), {
    runtime: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [{
        id: 'worker',
        label: 'Worker',
        kind: 'oac-bot',
        globalMetaId: 'idq1worker',
        isDefault: true,
        capabilities: ['private-chat'],
      }],
      defaultActor: {
        id: 'worker',
        label: 'Worker',
        kind: 'oac-bot',
        globalMetaId: 'idq1worker',
        isDefault: true,
        capabilities: ['private-chat'],
      },
      defaultUri: null,
      features: { privateChat: true, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'private-chat-compose-1',
      method: 'browser.privateChat.compose',
      params: {
        to: 'idq1forgedtarget',
        content: 'must not be accepted from iframe content',
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'private-chat composer bridge response');
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Private Chat/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Target Bot/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /data-browser-private-chat-message/);
  assert.equal(context.state.pendingPrivateChat.to, targetGlobalMetaId);
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'private-chat-compose-1',
    ok: true,
    result: { opened: true },
  });
});

test('html-iframe bridge validates and opens a Browser-confirmed simplemsg composer', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const targetGlobalMetaId = 'idq1cust0mtarget';
  const { context, nodes, fetchCalls, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [{
        id: 'worker',
        label: 'Worker',
        kind: 'oac-bot',
        globalMetaId: 'idq1worker',
        isDefault: true,
        capabilities: ['private-chat'],
      }],
      defaultActor: {
        id: 'worker',
        label: 'Worker',
        kind: 'oac-bot',
        globalMetaId: 'idq1worker',
        isDefault: true,
        capabilities: ['private-chat'],
      },
      defaultUri: null,
      features: { privateChat: true, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'simplemsg-compose-empty',
      method: 'browser.simplemsg.compose',
      params: { to: targetGlobalMetaId, content: '  ' },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'simplemsg-compose-empty',
    ok: false,
    error: {
      code: 'invalid_params',
      message: 'Simplemsg content is required.',
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);

  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'simplemsg-compose-invalid-target',
      method: 'browser.simplemsg.compose',
      params: { to: 'not-a-global-metaid', content: 'Hello' },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[1])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'simplemsg-compose-invalid-target',
    ok: false,
    error: {
      code: 'invalid_params',
      message: 'A valid simplemsg target Global MetaID is required.',
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);

  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'simplemsg-compose-1',
      method: 'browser.simplemsg.compose',
      params: {
        to: targetGlobalMetaId,
        content: 'Hello & goodbye </textarea>',
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 3, 'simplemsg composer bridge response');
  const modalHtml = nodes['[data-browser-modal-root]'].innerHTML;
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(modalHtml, /Private Chat/);
  assert.match(modalHtml, new RegExp(targetGlobalMetaId));
  assert.match(modalHtml, /Hello &amp; goodbye &lt;\/textarea&gt;/);
  assert.equal(context.state.pendingPrivateChat.to, targetGlobalMetaId);
  assert.equal(fetchCalls.some((url) => String(url).includes('/api/browser/actions')), false);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[2])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'simplemsg-compose-1',
    ok: true,
    result: { opened: true },
  });
});

test('html-iframe bridge ignores actor requests from inactive frames', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const inactiveFrameWindow = {};
  const { nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: inactiveFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-ignored',
      method: 'browser.actor.current',
      params: {},
    },
  });

  assert.deepEqual(activeFrameWindow.postMessageCalls, []);
});

test('html-iframe bridge emits actor changed events after actor selection', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [
        { id: 'first-actor', label: 'First', kind: 'wallet', globalMetaId: 'idq1first', isDefault: true, capabilities: [] },
        { id: 'second-actor', label: 'Second', kind: 'wallet', globalMetaId: 'idq1second', isDefault: false, capabilities: [] },
      ],
      defaultActor: { id: 'first-actor', label: 'First', kind: 'wallet', globalMetaId: 'idq1first', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'actor-consent',
      method: 'browser.actor.current',
      params: {},
    },
  });
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  activeFrameWindow.postMessageCalls.length = 0;

  await context.selectUsingIdentity('second-actor');

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:event',
    version: 1,
    event: 'browser.actor.changed',
    payload: {
      actor: {
        uri: 'metaid://idq1second',
        globalMetaId: 'idq1second',
        name: 'Second',
      },
    },
  });
});

test('html-iframe bridge does not emit actor changed events without identity consent', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [
        { id: 'first-actor', label: 'First', kind: 'wallet', globalMetaId: 'idq1first', isDefault: true, capabilities: [] },
        { id: 'second-actor', label: 'Second', kind: 'wallet', globalMetaId: 'idq1second', isDefault: false, capabilities: [] },
      ],
      defaultActor: { id: 'first-actor', label: 'First', kind: 'wallet', globalMetaId: 'idq1first', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  await context.selectUsingIdentity('second-actor');

  assert.deepEqual(activeFrameWindow.postMessageCalls, []);
});

test('html-iframe bridge attributes identity requests to the active tab only', async () => {
  const firstFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const secondFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const payload = result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  });
  const { context, nodes, windowListeners } = runWithResolve(payload, {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, firstFrameWindow, 1);

  // Open a second tab rendering another MetaApp; tab 2 becomes the active tab
  // while tab 1's pane (and its running app) stays in the DOM, hidden.
  payload.uri = 'metaapp://second';
  payload.normalizedUri = 'metaapp://second';
  context.AgentBrowserTabs.openTab();
  await context.navigateTo('metaapp://second');
  assert.ok(tabPane(nodes, 2).innerHTML.includes('browser-html-frame'), 'tab 2 iframe render');
  setTabFrameWindow(nodes, secondFrameWindow, 2);

  const listener = windowListeners.get('message');
  // The hidden tab's app asks: it must be ignored (no response, no modal).
  listener({
    source: firstFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'hidden-tab-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.deepEqual(firstFrameWindow.postMessageCalls, []);
  assert.doesNotMatch(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);

  // The active tab's app asks: the consent modal opens, naming tab 2's resource.
  listener({
    source: secondFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'active-tab-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /metaapp:\/\/second/);
});

test('html-iframe bridge rejects concurrent actor requests while a consent prompt is open', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'pending-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  // A second request while the prompt is open fails fast with consent_pending.
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'pending-2',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'pending-2',
    ok: false,
    error: {
      code: 'consent_pending',
      message: 'An identity consent prompt is already open.',
    },
  });
  assert.equal(activeFrameWindow.postMessageCalls.length, 1);

  // Allowing the prompt answers only the first request.
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  assert.equal(activeFrameWindow.postMessageCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[1])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'pending-1',
    ok: true,
    result: {
      actor: {
        uri: 'metaid://idq1actor',
        globalMetaId: 'idq1actor',
        name: 'Bob',
      },
    },
  });
});

test('html-iframe bridge requires identity consent per resource', async () => {
  const firstFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const secondFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const payload = result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  });
  const { context, nodes, windowListeners } = runWithResolve(payload, {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, firstFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: firstFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'resource-a',
      method: 'browser.actor.current',
      params: {},
    },
  });
  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'actor-consent-allow' }),
  });
  assert.equal(firstFrameWindow.postMessageCalls.length, 1);

  // Navigate the same tab to a second MetaApp: consent granted for resource A
  // must not cover resource B — the modal opens again for the new resource.
  payload.uri = 'metaapp://second-resource';
  payload.normalizedUri = 'metaapp://second-resource';
  await context.navigateTo('metaapp://second-resource');
  assert.ok(tabPane(nodes, 1).innerHTML.includes('browser-html-frame'), 'second resource iframe render');
  setTabFrameWindow(nodes, secondFrameWindow);

  listener({
    source: secondFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'resource-b',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.deepEqual(secondFrameWindow.postMessageCalls, []);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /metaapp:\/\/second-resource/);
});

test('html-iframe bridge does not persist identity denial when navigation invalidates the prompt', async () => {
  const firstFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const secondFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const payload = result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  });
  const { context, nodes, windowListeners } = runWithResolve(payload, {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, firstFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: firstFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'nav-prompt-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  // Navigating away invalidates the prompt: the pending request is denied and
  // the modal closed.
  payload.uri = 'metaapp://elsewhere';
  payload.normalizedUri = 'metaapp://elsewhere';
  await context.navigateTo('metaapp://elsewhere');
  assert.deepEqual(JSON.parse(JSON.stringify(firstFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'nav-prompt-1',
    ok: false,
    error: {
      code: 'consent_denied',
      message: 'The user denied identity access for this MetaApp.',
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);

  // The denial is NOT remembered: back on the original resource, a fresh
  // request opens the consent modal again instead of being denied outright.
  payload.uri = 'metaapp://pin';
  payload.normalizedUri = 'metaapp://pin';
  await context.navigateTo('metaapp://pin');
  setTabFrameWindow(nodes, secondFrameWindow);
  listener({
    source: secondFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'nav-prompt-2',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.deepEqual(secondFrameWindow.postMessageCalls, []);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);
});

test('html-iframe bridge does not persist identity denial when the tab context changes', async () => {
  const appFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { context, nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, appFrameWindow, 1);

  const listener = windowListeners.get('message');
  listener({
    source: appFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'tab-prompt-1',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  // Opening another tab invalidates the prompt: the pending request is denied
  // and the modal closed.
  context.AgentBrowserTabs.openTab();
  assert.deepEqual(JSON.parse(JSON.stringify(appFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'tab-prompt-1',
    ok: false,
    error: {
      code: 'consent_denied',
      message: 'The user denied identity access for this MetaApp.',
    },
  });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);

  // Switching back to the app's tab and re-asking opens the modal again — the
  // invalidation did not record a lasting denial.
  context.AgentBrowserTabs.switchTab(1);
  listener({
    source: appFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'tab-prompt-2',
      method: 'browser.actor.current',
      params: {},
    },
  });
  assert.equal(appFrameWindow.postMessageCalls.length, 1);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);
});

test('html-iframe bridge answers null actor without consent when no identity is connected', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Bob', kind: 'wallet', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Bob', kind: 'wallet', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'no-identity-1',
      method: 'browser.actor.current',
      params: {},
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'no-identity-1',
    ok: true,
    result: { actor: null },
  });
  assert.doesNotMatch(nodes['[data-browser-modal-root]'].innerHTML, /Identity request/);
});

test('html-iframe bridge forwards MetaID PIN write requests to host actions', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
    actionResponse: {
      ok: true,
      state: 'success',
      data: {
        kind: 'metaid-pin-write',
        handled: true,
        data: {
          pinId: servicePinId,
          txid: servicePinId.slice(0, 64),
          operation: 'create',
          path: '/protocols/simplebuzz',
          actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Actor' },
        },
      },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'write-1',
      method: 'metaid.pin.write',
      params: {
        operation: 'create',
        path: '/protocols/simplebuzz',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
        display: { title: 'Post buzz', summary: 'hello' },
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'pin write bridge response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'write-1',
    ok: true,
    result: {
      pinId: servicePinId,
      txid: servicePinId.slice(0, 64),
      operation: 'create',
      path: '/protocols/simplebuzz',
      actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Actor' },
    },
  });

  const actionRequest = fetchRequests.find((request) => request.url.startsWith('/api/browser/actions'));
  assert.equal(actionRequest.url, '/api/browser/actions?actorId=standalone%3Aactor');
  assert.deepEqual(JSON.parse(actionRequest.options.body), {
    resourceUri: 'metaapp://pin',
    kind: 'metaid-pin-write',
    sessionId: 'test-session',
    payload: {
      operation: 'create',
      path: '/protocols/simplebuzz',
      encryption: '0',
      version: '1.0.0',
      contentType: 'application/json;utf-8',
      payload: { encoding: 'utf8', value: '{"content":"hello"}' },
      display: { title: 'Post buzz', summary: 'hello' },
    },
  });
});

test('html-iframe bridge forwards modify and revoke PIN writes with @pinId targets', async () => {
  for (const operation of ['modify', 'revoke']) {
    const activeFrameWindow = {
      postMessageCalls: [],
      postMessage(message) { this.postMessageCalls.push(message); },
    };
    const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
      type: 'html-iframe',
      contentType: 'text/html',
      url: 'https://metaweb.example/app',
    }), {
      runtime: {
        host: { kind: 'standalone', name: 'Standalone', localMode: true },
        actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
        defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
        defaultUri: null,
        features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
        labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
      },
      actionResponse: {
        ok: true,
        state: 'success',
        data: {
          kind: 'metaid-pin-write',
          handled: true,
          data: {
            pinId: servicePinId,
            txid: servicePinId.slice(0, 64),
            operation,
            path: `@${servicePinId}`,
            actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Actor' },
          },
        },
      },
    });

    await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), `${operation} iframe render`);
    setTabFrameWindow(nodes, activeFrameWindow);

    const listener = windowListeners.get('message');
    listener({
      source: activeFrameWindow,
      data: {
        type: 'agent-browser:request',
        version: 1,
        id: `write-${operation}`,
        method: 'metaid.pin.write',
        params: {
          operation,
          path: `@${servicePinId}`,
          encryption: '0',
          version: '1.0.0',
          contentType: 'application/json;utf-8',
          payload: { encoding: 'utf8', value: operation === 'revoke' ? '' : '{"content":"updated"}' },
          originalId: servicePinId,
          appAction: operation === 'revoke' ? 'remove-post' : 'edit-post',
          display: { title: `${operation} post`, summary: servicePinId },
        },
      },
    });

    await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, `${operation} pin write bridge response`);
    assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
      type: 'agent-browser:response',
      version: 1,
      id: `write-${operation}`,
      ok: true,
      result: {
        pinId: servicePinId,
        txid: servicePinId.slice(0, 64),
        operation,
        path: `@${servicePinId}`,
        actor: { uri: 'metaid://idq1actor', globalMetaId: 'idq1actor', name: 'Actor' },
      },
    });

    const actionRequest = fetchRequests.find((request) => request.url.startsWith('/api/browser/actions'));
    assert.equal(actionRequest.url, '/api/browser/actions?actorId=standalone%3Aactor');
    assert.deepEqual(JSON.parse(actionRequest.options.body), {
      resourceUri: 'metaapp://pin',
      kind: 'metaid-pin-write',
      sessionId: 'test-session',
      payload: {
        operation,
        path: `@${servicePinId}`,
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: operation === 'revoke' ? '' : '{"content":"updated"}' },
        originalId: servicePinId,
        appAction: operation === 'revoke' ? 'remove-post' : 'edit-post',
        display: { title: `${operation} post`, summary: servicePinId },
      },
    });
  }
});

test('html-iframe bridge rejects slash paths for modify and revoke PIN writes', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'write-invalid-path',
      method: 'metaid.pin.write',
      params: {
        operation: 'modify',
        path: '/protocols/simplebuzz',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'invalid modify slash path response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'write-invalid-path',
    ok: false,
    error: {
      code: 'invalid_params',
      message: 'MetaID PIN modify/revoke path must be @<targetPinId>.',
    },
  });
  assert.equal(fetchRequests.some((request) => request.url.startsWith('/api/browser/actions')), false);
});

test('html-iframe bridge rejects mismatched originalId for targeted PIN writes', async () => {
  const otherPinId = '1'.repeat(64) + 'i0';
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'write-mismatched-original',
      method: 'metaid.pin.write',
      params: {
        operation: 'modify',
        path: `@${servicePinId}`,
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
        originalId: otherPinId,
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'mismatched originalId response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'write-mismatched-original',
    ok: false,
    error: {
      code: 'invalid_params',
      message: 'MetaID PIN write originalId must match the target pin id.',
    },
  });
  assert.equal(fetchRequests.some((request) => request.url.startsWith('/api/browser/actions')), false);
});

test('html-iframe bridge rejects invalid MetaID PIN write operations', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'write-invalid',
      method: 'metaid.pin.write',
      params: {
        operation: 'delete',
        path: '/protocols/simplebuzz',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
      },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'write-invalid',
    ok: false,
    error: {
      code: 'invalid_params',
      message: 'MetaID PIN write operation must be create, modify, or revoke.',
    },
  });
  assert.equal(fetchRequests.some((request) => request.url.startsWith('/api/browser/actions')), false);
});

test('html-iframe bridge forwards MetaFile upload requests to the host endpoint', async () => {
  const activeFrameWindow = {
    postMessageCalls: [],
    postMessage(message) { this.postMessageCalls.push(message); },
  };
  const { nodes, fetchRequests, windowListeners } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'https://metaweb.example/app',
  }), {
    runtime: {
      host: { kind: 'standalone', name: 'Standalone', localMode: true },
      actors: [{ id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] }],
      defaultActor: { id: 'standalone:actor', label: 'Actor', kind: 'wallet', globalMetaId: 'idq1actor', isDefault: true, capabilities: [] },
      defaultUri: null,
      features: { privateChat: false, serviceCall: false, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No actor', noActorBody: 'No actor' },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'iframe render');
  setTabFrameWindow(nodes, activeFrameWindow);

  const listener = windowListeners.get('message');
  listener({
    source: activeFrameWindow,
    data: {
      type: 'agent-browser:request',
      version: 1,
      id: 'upload-1',
      method: 'metafile.upload',
      params: {
        source: { kind: 'host-picker', multiple: true, accept: ['application/pdf'] },
        purpose: 'netdisk',
      },
    },
  });

  await waitFor(() => activeFrameWindow.postMessageCalls.length === 1, 'metafile upload bridge response');
  assert.deepEqual(JSON.parse(JSON.stringify(activeFrameWindow.postMessageCalls[0])), {
    type: 'agent-browser:response',
    version: 1,
    id: 'upload-1',
    ok: false,
    error: {
      code: 'metafile_upload_unavailable',
      message: 'MetaFile upload is not available in this host.',
    },
  });

  const uploadRequest = fetchRequests.find((request) => request.url.startsWith('/api/browser/metafile-upload'));
  assert.equal(uploadRequest.url, '/api/browser/metafile-upload?actorId=standalone%3Aactor');
  assert.deepEqual(JSON.parse(uploadRequest.options.body), {
    source: { kind: 'host-picker', multiple: true, accept: ['application/pdf'] },
    purpose: 'netdisk',
  });
});

test('custom Bot Page alias renders target renderer while preserving source details', async () => {
  const aliasUri = 'metaid://idq1custombot';
  const customHomepageUri = 'metaapp://custom-pin';
  const { context, nodes } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: '/api/metaapp/preview-assets/custom/index.html',
  }, {
    uri: aliasUri,
    normalizedUri: aliasUri,
    resourceType: 'metaapp',
    title: 'Custom MetaApp',
    source: {
      resolver: 'test',
      raw: {
        aliasUri,
        customHomepageUri,
      },
    },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-html-frame'), 'custom alias iframe render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /<iframe class="browser-html-frame" sandbox="allow-scripts" src="\/api\/metaapp\/preview-assets\/custom\/index\.html"/);
  assert.equal(context.state.current.normalizedUri, aliasUri);
  assert.equal(context.state.current.source.raw.aliasUri, aliasUri);
  assert.equal(context.state.current.source.raw.customHomepageUri, customHomepageUri);

  context.renderInspector();
  const inspector = nodes['[data-browser-inspector]'].innerHTML;
  assert.match(inspector, /customHomepageUri/);
  assert.match(inspector, /metaapp:\/\/custom-pin/);
});

test('pin-inspector renderer uses payload-first mature shell sections', async () => {
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'application/vnd.metaid+json; charset=utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        path: '/protocols/simplebuzz',
        contentType: 'application/vnd.metaid+json; charset=utf-8',
        operation: 'create',
        chainName: 'btc',
        encryption: 'public',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: {
        title: 'Readable Pin',
        content: 'Rendered via generic pin inspector. '.repeat(6).trim(),
        featured: true,
        score: 42,
        images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
        attachments: [
          { uri: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip', name: 'fixture.zip' },
          { uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', name: 'origin pin' },
        ],
        files: [{ url: 'https://files.example/guide.pdf', title: 'guide.pdf' }],
        image: 'metaid://idq1fixturebot',
        tags: ['agent-browser', 'pin-renderer'],
        extra: {
          publishedAt: '2026-06-20T13:42:00Z',
          lang: 'en',
        },
      },
      rawPayload: '{"title":"Readable Pin"}',
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'pin page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /browser-pin-page/);
  assert.match(html, /Readable Pin/);
  assert.match(html, /browser-pin-meta-pills/);
  assert.match(html, /<h3>Payload Render<\/h3>/);
  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-row browser-pin-json-row-longtext/);
  assert.match(html, /browser-pin-json-text-block/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-boolean/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-number/);
  assert.match(html, /browser-pin-json-token-list/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-link/);
  assert.match(html, /browser-pin-json-subblock/);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Related Media<\/h3>/);
  assert.match(html, /browser-pin-media-grid/);
  assert.match(html, /browser-pin-file-meta/);
  assert.match(html, /browser-pin-file-name/);
  assert.match(html, /browser-pin-file-desc/);
  assert.match(html, /class="browser-pin-download"/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /browser-pin-link-pill/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.match(html, /View Raw Record/);
  assert.match(html, /guide\.pdf/);
  assert.match(html, /fixture\.zip/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/guide\.pdf"/);
  assert.match(html, /data-browser-copy-value="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
  assert.match(html, /<dt>txid<\/dt>/);
  assert.doesNotMatch(html, /requestedPinId/);
  assert.doesNotMatch(html, /resolvedPinId/);
  assert.doesNotMatch(html, /Content-type routing model/);
  assert.doesNotMatch(html, /why-this-direction/);
  assert.doesNotMatch(html, /Raw MAN pin record/);
  assert.doesNotMatch(html, /data-browser-pin-raw-record/);
  assert.doesNotMatch(html, /<a class="browser-metaapp-run"/);
  assert.doesNotMatch(html, /<a class="browser-metaapp-download"/);
});

test('pin-inspector adds Run and download actions for MetaApp protocol pins', async () => {
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'application/vnd.metaid+json; charset=utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: metaAppPinId,
        resolvedPinId: metaAppPinId,
        versionSelector: 'latest',
      },
      pin: {
        pinId: metaAppPinId,
        path: '/protocols/metaapp',
        contentType: 'application/vnd.metaid+json; charset=utf-8',
        operation: 'create',
        chainName: 'mvc',
        encryption: 'public',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: {
        title: 'Fixture MetaApp',
        appName: 'fixture-app',
        version: '1.0.0',
      },
      rawPinRecord: {
        path: '/protocols/metaapp',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
        contentSummary: JSON.stringify({
          title: 'Fixture MetaApp',
          content: `metafile://${metaAppCodePinId}.zip`,
        }),
      },
    },
  }, {
    uri: `pin://${metaAppPinId}`,
    normalizedUri: `pin://${metaAppPinId}`,
    resourceType: 'pin',
    title: 'Fixture MetaApp',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'pin page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, new RegExp(`<a class="browser-metaapp-run" href="metaapp://${metaAppPinId}" data-browser-map-link>`));
  assert.match(html, new RegExp(`<a class="browser-metaapp-download" href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));
  assert.ok(html.indexOf('browser-metaapp-run') > -1, 'MetaApp Run action is rendered');
  assert.ok(
    html.indexOf('browser-metaapp-run') < html.indexOf('data-browser-open-raw-record'),
    'MetaApp actions render before View Raw Record',
  );
});

test('pin-inspector renders a Disabled action instead of Run for disabled MetaApp protocol pins', async () => {
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'application/vnd.metaid+json; charset=utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: metaAppPinId,
        resolvedPinId: metaAppPinId,
        versionSelector: 'latest',
      },
      pin: {
        pinId: metaAppPinId,
        path: '/protocols/metaapp',
        contentType: 'application/vnd.metaid+json; charset=utf-8',
        operation: 'create',
        chainName: 'mvc',
        encryption: 'public',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: {
        title: 'Fixture MetaApp',
        appName: 'fixture-app',
        version: '1.0.0',
      },
      rawPinRecord: {
        path: '/protocols/metaapp',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
        contentSummary: JSON.stringify({
          title: 'Fixture MetaApp',
          content: `metafile://${metaAppCodePinId}.zip`,
          disabled: true,
        }),
      },
    },
  }, {
    uri: `pin://${metaAppPinId}`,
    normalizedUri: `pin://${metaAppPinId}`,
    resourceType: 'pin',
    title: 'Fixture MetaApp',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'pin page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /class="browser-metaapp-run is-disabled" aria-disabled="true"/);
  assert.match(html, /<span>Disabled<\/span>/);
  assert.doesNotMatch(html, new RegExp(`<a class="browser-metaapp-run" href="metaapp://${metaAppPinId}"`));
  assert.doesNotMatch(html, /<span>Run<\/span>/);
  assert.match(html, new RegExp(`<a class="browser-metaapp-download" href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));
});

test('pin-inspector renderer treats extensionless metafile references as image previews', async () => {
  const imagePinId = '320179c814f9a6048add5fb773b231ff79057f0b388dd1f6988d28fdb5b93c46i0';
  const archivePinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0';
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'application/vnd.metaid+json; charset=utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        path: '/protocols/simplebuzz',
        contentType: 'application/vnd.metaid+json; charset=utf-8',
        operation: 'create',
        chainName: 'btc',
        encryption: 'public',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: {
        title: 'Extensionless media',
        attachments: [
          `metafile://${imagePinId}`,
          `metafile://${archivePinId}.zip`,
        ],
      },
      rawPayload: '{}',
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'pin page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, new RegExp(`data-browser-media-preview-ref="metafile://${imagePinId}"`));
  assert.match(html, new RegExp(`data-browser-download-ref="metafile://${imagePinId}"`));
  assert.doesNotMatch(html, new RegExp(`data-browser-media-preview-ref="metafile://${archivePinId}\\.zip"`));
  assert.match(html, new RegExp(`data-browser-download-ref="metafile://${archivePinId}\\.zip"`));
  assert.match(html, /browser-pin-file-list/);
});

test('pin-inspector renders related entities and hydrates creator and peer profiles', async () => {
  const rawPayload = JSON.stringify({
    content: 'Plain payload with peer identity.',
    to: pinPeerGlobalMetaId,
    nested: [{ id: chatPeerSunny }, { id: pinCreatorGlobalMetaId }, { id: 'idq1fixturebot' }],
  });
  const creatorAvatar = 'https://assets.example/creator.png';
  const peerAvatar = 'https://assets.example/peer.png';
  const sunnyAvatar = 'https://assets.example/sunny.png';
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        path: '/protocols/simplebuzz',
        contentType: 'text/plain;utf-8',
        operation: 'create',
        chainName: 'btc',
        ownerGlobalMetaId: pinCreatorGlobalMetaId,
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        globalMetaId: pinCreatorGlobalMetaId,
        contentType: 'text/plain;utf-8',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', globalMetaId: pinCreatorGlobalMetaId, name: pinCreatorGlobalMetaId, verificationState: 'partial' },
  }), {
    infoProfiles: {
      [pinCreatorGlobalMetaId]: { globalMetaId: pinCreatorGlobalMetaId, name: 'Creator Bot', avatar: creatorAvatar },
      [pinPeerGlobalMetaId]: { globalMetaId: pinPeerGlobalMetaId, name: 'Peer Bot', avatar: peerAvatar },
      [chatPeerSunny]: { globalMetaId: chatPeerSunny, name: 'Sunny', avatar: sunnyAvatar },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<h3>Related Entities</h3>'), 'related entities section render');
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Creator Bot')
    && nodes['[data-browser-viewport]'].innerHTML.includes('Peer Bot')
    && nodes['[data-browser-viewport]'].innerHTML.includes('Sunny'), 'related entity profile hydration');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  assert.ok(html.indexOf('<h3>Related Entities</h3>') < html.indexOf('<h3>Related Links</h3>'));
  assert.match(html, /<div class="browser-pin-entity-role">creator<\/div>/);
  assert.match(html, /<div class="browser-pin-entity-role">peer<\/div>/);
  assert.match(html, new RegExp(`href="metaid://${pinCreatorGlobalMetaId}" data-browser-map-link`));
  assert.match(html, new RegExp(`href="metaid://${pinPeerGlobalMetaId}" data-browser-map-link`));
  assert.match(html, /idq14hmv\.\.\.zwg9xz/);
  assert.match(html, /Creator Bot/);
  assert.match(html, /Peer Bot/);
  assert.match(html, /Sunny/);
  assert.match(html, /src="https:\/\/assets\.example\/creator\.png"/);
  assert.match(html, /src="https:\/\/assets\.example\/peer\.png"/);
  assert.match(html, /src="https:\/\/assets\.example\/sunny\.png"/);
  const infoCalls = fetchCalls.filter((url) => url.includes('/api/browser/info'));
  assert.equal(infoCalls.length, 3);
  assert.doesNotMatch(infoCalls.join('\n'), /idq1fixturebot/);
});

test('pin-inspector renders metaapp links and bare non-current pin IDs as related links', async () => {
  const requestedPinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const resolvedPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const rawPayload = [
    `MetaApp: metaapp://${relatedMetaAppPinId}`,
    `Reference pin: ${relatedBarePinId}`,
    `Current requested pin should not self-link: ${requestedPinId}`,
    `Current resolved pin should not self-link: ${resolvedPinId}`,
  ].join('\n');
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId,
        resolvedPinId,
        versionSelector: 'latest',
      },
      pin: {
        pinId: resolvedPinId,
        path: '/protocols/simplebuzz',
        contentType: 'text/plain;utf-8',
        chainName: 'btc',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        pinId: resolvedPinId,
        contentType: 'text/plain;utf-8',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: `pin://${requestedPinId}`,
    normalizedUri: `pin://${requestedPinId}`,
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<h3>Related Links</h3>'), 'related links render');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  assert.match(html, new RegExp(`href="metaapp://${relatedMetaAppPinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`metaapp://${relatedMetaAppPinId.slice(0, 10)}\\.\\.\\.${relatedMetaAppPinId.slice(-10)}`));
  assert.match(html, new RegExp(`href="pin://${relatedBarePinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`pin://${relatedBarePinId.slice(0, 10)}\\.\\.\\.${relatedBarePinId.slice(-10)}`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${requestedPinId}"`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${resolvedPinId}"`));
});

test('pin-inspector renders JSON strings from plain text payloads as structured documents', async () => {
  const rawPayload = '{"content":"7\\n#美食工厂","contentType":"application/json;utf-8","attachments":["metafile://50d939b24815df1afd4c37137eebe15f65dbd71ae2ea505b465558a3f170c342i0.jpg"]}';
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        resolvedPinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        path: '/protocols/simplebuzz',
        contentType: 'text/plain;utf-8',
        operation: 'create',
        chainName: 'mvc',
        encryption: '0',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
        contentType: 'text/plain;utf-8',
        contentBody: 'eyJjb250ZW50IjoiN1xuI+e+jumjn+W3peWOgiIsImNvbnRlbnRUeXBlIjoiYXBwbGljYXRpb24vanNvbjt1dGYtOCIsImF0dGFjaG1lbnRzIjpbIm1ldGFmaWxlOi8vNTBkOTM5YjI0ODE1ZGYxYWZkNGMzNzEzN2VlYmUxNWY2NWRiZDcxYWUyZWE1MDViNDY1NTU4YTNmMTcwYzM0MmkwLmpwZyJdfQ==',
      },
    },
  }, {
    uri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    normalizedUri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    resourceType: 'pin',
    title: 'Pin 06a1ecf094...af3ci0',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'plain-text-json pin render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-row browser-pin-json-row-longtext/);
  assert.match(html, /browser-pin-json-subblock/);
  assert.match(html, /browser-protocol-raw">\{\n  &quot;content&quot;: &quot;7\\n#美食工厂&quot;/);
});

test('pin-inspector markdown payload renders structured lists in the mature shell', async () => {
  const markdown = '# Notes\n\n- first item\n- second item\n\nParagraph with [Bot](metaid://idq1fixturebot)';
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/markdown',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        path: '/protocols/simplebuzz',
        contentType: 'text/markdown',
        operation: 'create',
        chainName: 'btc',
        encryption: 'public',
        version: '1',
      },
      payload: markdown,
      rawPayload: markdown,
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: 'b'.repeat(64),
      },
    },
  }, {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin Notes',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-markdown'), 'markdown pin render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /<h1>Notes<\/h1>/);
  assert.match(html, /<ul><li>first item<\/li><li>second item<\/li><\/ul>/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
});

test('pdf, image, and video render with content-specific elements', async () => {
  const pdf = runWithResolve(result({ type: 'pdf', contentType: 'application/pdf', url: 'https://files.example/a.pdf' }));
  await waitFor(() => pdf.nodes['[data-browser-viewport]'].innerHTML.includes('browser-pdf'), 'pdf render');
  assert.match(pdf.nodes['[data-browser-viewport]'].innerHTML, /<iframe class="browser-pdf" sandbox="" src="https:\/\/files\.example\/a\.pdf"/);

  const image = runWithResolve(result({ type: 'image', contentType: 'image/png', url: 'https://files.example/a.png' }));
  await waitFor(() => image.nodes['[data-browser-viewport]'].innerHTML.includes('browser-image'), 'image render');
  assert.match(image.nodes['[data-browser-viewport]'].innerHTML, /<img class="browser-image" src="https:\/\/files\.example\/a\.png" alt=""/);

  const video = runWithResolve(result({ type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4', data: { pinId: 'c20fb7af7b8c2b88a782ae02f6ea7f68f3b280a861838e70ee55950cfe8793bbi0' } }));
  await waitFor(() => video.nodes['[data-browser-viewport]'].innerHTML.includes('browser-media-stage'), 'video render');
  assert.match(video.nodes['[data-browser-viewport]'].innerHTML, /data-browser-video-preview/);
  assert.match(video.nodes['[data-browser-viewport]'].innerHTML, /data-browser-media-ref="metafile:\/\/c20fb7af/);

  const audio = runWithResolve(result({ type: 'audio', contentType: 'audio/mpeg', url: 'https://files.example/a.mp3', data: { pinId: 'dd53ea8c3f3d51a7f9af2c06807ffabd3f560cff4e80f6ae8881d628f186ab91i0' } }));
  await waitFor(() => audio.nodes['[data-browser-viewport]'].innerHTML.includes('browser-media-stage'), 'audio render');
  assert.match(audio.nodes['[data-browser-viewport]'].innerHTML, /data-browser-audio-preview/);
});

test('unsupported renderer keeps source details available for Inspector', async () => {
  const payload = result({
    type: 'unsupported',
    contentType: 'application/octet-stream',
    url: 'https://files.example/archive.zip',
    error: 'Unsupported MetaApp content type.',
  });
  const { context, nodes } = runWithResolve(payload);

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Unsupported renderer'), 'unsupported render');
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /Unsupported MetaApp content type/);
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /href="https:\/\/files\.example\/archive\.zip"/);
  assert.match(nodes['[data-browser-viewport]'].innerHTML, /Download file/);
  assert.deepEqual(context.state.current.source.raw, { kept: true });
});

test('renderer URLs pass through safeUrl and reject unsafe schemes', async () => {
  const { nodes } = runWithResolve(result({
    type: 'html-iframe',
    contentType: 'text/html',
    url: 'javascript:alert(1)',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Renderer URL blocked'), 'unsafe render');
  assert.doesNotMatch(nodes['[data-browser-viewport]'].innerHTML, /javascript:alert/);
});
