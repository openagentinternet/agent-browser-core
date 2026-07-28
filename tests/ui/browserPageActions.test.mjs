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
    '[data-browser-owner-toolbar]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-owner-panel]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-address-icon]': new FakeElement(),
    '[data-browser-app-panel]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
  };
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 1000) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(check, 5);
    };
    check();
  });
}

function createContext(options = {}) {
  const nodes = elements();
  const requests = [];
  const clipboardWrites = [];
  const context = {
    console,
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Promise,
    String,
    Error,
    JSON,
    setTimeout,
    clearTimeout,
    navigator: options.clipboard === false ? {} : {
      clipboard: {
        writeText: async (value) => clipboardWrites.push(value),
      },
    },
    window: { location: { search: '', origin: 'http://127.0.0.1:3000', href: 'http://127.0.0.1:3000/ui/browser' }, history: { replaceState() {} } },
    document: {
      documentElement: { lang: options.language || 'en' },
      readyState: 'loading',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url, fetchOptions = {}) => {
      if (String(url).startsWith('/api/browser/actions')) {
        requests.push({ url: String(url), body: fetchOptions.body ? JSON.parse(fetchOptions.body) : null });
        return {
          ok: true,
          json: async () => options.actionResponse || ({ ok: true, data: { accepted: true } }),
        };
      }
      if (String(url).startsWith('/api/browser/runtime')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: context.state.runtime,
          }),
        };
      }
      if (String(url).startsWith('/api/browser/resolve')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: context.state.current,
          }),
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  context.bindElements();
  context.state.runtime = {
    host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
    actors: [{
      id: 'worker',
      label: 'Worker Bot',
      kind: 'oac-bot',
      globalMetaId: 'idq1worker',
      isDefault: true,
      capabilities: ['private-chat', 'service-call', 'template-settings'],
    }],
    defaultActor: {
      id: 'worker',
      label: 'Worker Bot',
      kind: 'oac-bot',
      globalMetaId: 'idq1worker',
      isDefault: true,
      capabilities: ['private-chat', 'service-call', 'template-settings'],
    },
    defaultUri: 'metaid://idq1worker',
    features: {
      privateChat: true,
      serviceCall: true,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: false,
    },
    labels: {
      actorChip: 'Using',
      noActorTitle: 'No Bot',
      noActorBody: 'Create a local Bot before using Browser actions.',
      noActorAction: { label: 'Create Bot', href: '/ui/bot' },
    },
  };
  context.state.actorId = 'worker';
  context.state.current = {
    uri: 'metaid://idq1target',
    normalizedUri: 'metaid://idq1target',
    resourceType: 'bot',
    title: 'Target Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1target', name: 'Target Bot', verificationState: 'partial' },
    renderer: {
      type: 'bot-page',
      contentType: 'application/vnd.oac.bot-homepage+json',
      data: {
        services: [{
          id: 'service-id',
          currentPinId: 'service-current-pin',
          providerGlobalMetaId: 'idq1provider',
          displayName: 'Fixture Service',
          price: '0',
          currency: 'SPACE',
        }],
      },
    },
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'test' },
    actions: [],
  };
  return { context, nodes, requests, clipboardWrites };
}

function browserActionTarget(attrs) {
  return {
    parentElement: null,
    getAttribute: (name) => attrs[name] || '',
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

test('copy-uri writes normalized URI to clipboard and falls back to status text', async () => {
  const withClipboard = createContext();
  await withClipboard.context.handleTrustedAction({ id: 'copy-uri', kind: 'copy', uri: 'metaid://idq1target' });
  assert.deepEqual(withClipboard.clipboardWrites, ['metaid://idq1target']);

  const withoutClipboard = createContext({ clipboard: false });
  await withoutClipboard.context.handleTrustedAction({ id: 'copy-uri', kind: 'copy', uri: 'metaid://idq1target' });
  assert.match(withoutClipboard.nodes['[data-browser-status-state]'].textContent, /copied/i);
});

test('resolveDownloadHref maps metafile and external URLs but rejects Browser-native URIs', () => {
  const { context } = createContext();

  assert.match(context.resolveDownloadHref('metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'), /f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0/i);
  assert.equal(context.resolveDownloadHref('https://files.example/guide.pdf'), 'https://files.example/guide.pdf');
  assert.equal(context.resolveDownloadHref('pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0'), '');
  assert.equal(context.resolveDownloadHref('metaid://idq1fixturebot'), '');
});

test('resolveMediaPreviewHref maps image-capable references and rejects navigation-only URIs', () => {
  const { context } = createContext();

  assert.match(context.resolveMediaPreviewHref('metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'), /f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0/i);
  assert.equal(context.resolveMediaPreviewHref('https://files.example/preview.png'), 'https://files.example/preview.png');
  assert.equal(context.resolveMediaPreviewHref('pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0'), '');
  assert.equal(context.resolveMediaPreviewHref('metaid://idq1fixturebot'), '');
});

test('enhancePinMediaPreviews replaces failed image previews with a fallback placeholder', () => {
  const { context } = createContext();
  let errorHandler = null;
  const image = {
    addEventListener(eventName, handler) {
      if (eventName === 'error') errorHandler = handler;
    },
  };
  const slotClasses = new Set();
  const slot = {
    innerHTML: 'Image preview',
    classList: {
      add(name) { slotClasses.add(name); },
      remove(name) { slotClasses.delete(name); },
    },
    querySelector(selector) {
      return selector === 'img' ? image : null;
    },
  };
  const card = {
    getAttribute(name) {
      return name === 'data-browser-media-preview-ref'
        ? 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'
        : '';
    },
    querySelector(selector) {
      return selector === '[data-browser-media-preview-slot]' ? slot : null;
    },
  };
  const root = {
    querySelectorAll(selector) {
      return selector === '[data-browser-media-preview-ref]' ? [card] : [];
    },
  };

  context.enhancePinMediaPreviews(root);
  assert.match(slot.innerHTML, /<img /);
  assert.equal(typeof errorHandler, 'function');

  errorHandler();
  assert.equal(slotClasses.has('is-error'), true);
  assert.match(slot.innerHTML, /Image unavailable\./);
  assert.doesNotMatch(slot.innerHTML, /<img /);
});

test('openPinRawRecord opens the raw MAN record modal', () => {
  const { context, nodes } = createContext();
  const trigger = {
    closest(selector) {
      return selector === '.browser-pin-page' ? {} : null;
    },
  };

  context.state.current = {
    uri: 'pin://fixture',
    normalizedUri: 'pin://fixture',
    resourceType: 'pin',
    title: 'Fixture Pin',
    renderer: {
      type: 'pin-inspector',
      contentType: 'application/vnd.metaid+json; charset=utf-8',
      data: {
        rendererId: 'generic.pin-inspector',
        version: { requestedPinId: 'pin', resolvedPinId: 'pin', versionSelector: 'latest' },
        pin: {
          pinId: 'pin',
          path: '/protocols/simplebuzz',
          contentType: 'application/vnd.metaid+json; charset=utf-8',
          operation: 'create',
          chainName: 'btc',
          version: '1',
          genesisTransaction: 'b'.repeat(64),
        },
        rawPinRecord: {
          path: '/protocols/simplebuzz',
          genesisTransaction: 'b'.repeat(64),
          txid: 'a'.repeat(64),
        },
        payload: { title: 'Fixture Pin' },
        rawPayload: '{"title":"Fixture Pin"}',
      },
    },
  };

  assert.equal(context.openPinRawRecord(trigger), true);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Raw PIN record/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /&quot;genesisTransaction&quot;: &quot;b{64}&quot;/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /&quot;txid&quot;: &quot;a{64}&quot;/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /browser-protocol-json/);
});

test('copyValue forwards generic page-body copy affordances through Browser copy helper', async () => {
  const { context, clipboardWrites } = createContext();

  await context.copyValue('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

  assert.deepEqual(clipboardWrites, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
});

test('private-chat sends only after modal confirmation with Browser action contract', async () => {
  const { context, nodes, requests } = createContext();

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });
  assert.equal(requests.length, 0);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Target Bot/);

  await context.confirmPrivateChat('Hello from Browser');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/browser/actions?actorId=worker');
  assert.deepEqual(requests[0].body, {
    resourceUri: 'metaid://idq1target',
    kind: 'private-chat',
    payload: {
      to: 'idq1target',
      content: 'Hello from Browser',
    },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body, 'from'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body.payload, 'peer'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body.payload, 'message'), false);
});

test('private-chat modal shows avatars beside the Using and Target bot names', async () => {
  const { context, nodes } = createContext();

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });

  const html = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /<dd class="browser-modal-value-with-avatar"/, 'Using row must use the avatar value layout');
  const valueRows = html.match(/<dd class="browser-modal-value-with-avatar"[\s\S]*?<\/dd>/g) || [];
  assert.equal(valueRows.length, 2, 'both Using and Target rows must render with an avatar');
  assert.match(valueRows[0], /browser-modal-value-avatar/, 'Using avatar element must render');
  assert.match(valueRows[0], />Worker Bot</, 'Using row must show the Using bot name');
  assert.match(valueRows[1], /browser-modal-value-avatar/, 'Target avatar element must render');
  assert.match(valueRows[1], />Target Bot</, 'Target row must show the Target bot name');
});

test('private-chat Send is blocked when the Using and Target bots are the same', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current.owner = { kind: 'bot', globalMetaId: 'idq1worker', name: 'Worker Bot', verificationState: 'partial' };

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false, 'modal stays open so the user can change selection');

  await context.confirmPrivateChat('Hello from Browser');

  assert.equal(requests.length, 0, 'no action request is posted when Using and Target are the same bot');
  assert.match(nodes['[data-browser-status-state]'].textContent, /error/i);
  assert.match(context.state.error, /cannot be the same/i);
});


test('private-chat success shows a confirmation modal with a conversation link', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: {
      ok: true,
      data: {
        kind: 'private-chat',
        handled: true,
        data: { href: '/ui/conversations?local=idq1worker&peer=idq1target' },
      },
    },
  });

  await context.initialize();
  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });
  await context.confirmPrivateChat('Hello from Browser');

  assert.equal(requests.length, 1);
  assert.equal(context.window.location.href, 'http://127.0.0.1:3000/ui/browser');
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Message sent/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, />Close<\/button>/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /View conversation/);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({
      'data-browser-modal-action': 'view-conversation',
    }),
  });

  await waitFor(
    () => context.window.location.href === '/ui/conversations?local=idq1worker&peer=idq1target',
    'sent message conversation href navigation',
  );
  assert.equal(requests.length, 1);
});

test('private-chat modal view conversation button posts open-conversation and follows returned href', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: {
      ok: true,
      data: {
        kind: 'open-conversation',
        handled: true,
        data: { href: '/ui/conversations?local=idq1worker&peer=idq1target' },
      },
    },
  });
  await context.initialize();
  context.state.current.actions = [{
    id: 'conversation',
    label: 'Conversation',
    kind: 'open-conversation',
    enabled: true,
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1target',
      peerGlobalMetaId: 'idq1target',
      peerName: 'Target Bot',
    },
  }];

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /View Conversation/);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({
      'data-browser-modal-action': 'view-conversation',
    }),
  });

  await waitFor(() => requests.length === 1, 'view conversation action post');
  await waitFor(
    () => context.window.location.href === '/ui/conversations?local=idq1worker&peer=idq1target',
    'view conversation href navigation',
  );

  assert.deepEqual(requests[0].body, {
    resourceUri: 'metaid://idq1target',
    kind: 'open-conversation',
    payload: {
      conversationUri: 'map://simplemsg/conversation?peer=idq1target',
      peerGlobalMetaId: 'idq1target',
      peerName: 'Target Bot',
    },
  });
});

test('viewport open-conversation action posts payload and follows returned href', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: {
      ok: true,
      data: {
        kind: 'open-conversation',
        handled: true,
        data: { href: '/ui/conversations?local=idq1worker&peer=idq1peer' },
      },
    },
  });

  await context.initialize();
  nodes['[data-browser-viewport]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({
      'data-browser-action': 'open-conversation',
      'data-browser-action-id': 'conversation',
      'data-browser-action-payload': JSON.stringify({
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
        peerGlobalMetaId: 'idq1peer',
      }),
    }),
  });
  await waitFor(() => requests.length === 1, 'open-conversation action post');
  await waitFor(
    () => context.window.location.href === '/ui/conversations?local=idq1worker&peer=idq1peer',
    'conversation href navigation',
  );

  assert.equal(requests[0].body.kind, 'open-conversation');
  assert.equal(requests[0].body.payload.peerGlobalMetaId, 'idq1peer');
  assert.equal(context.window.location.href, '/ui/conversations?local=idq1worker&peer=idq1peer');
});

test('browser keeps the no-Bot launch chrome in English when the page language is zh-CN', () => {
  const empty = createContext({ language: 'zh-CN' });
  empty.context.state.runtime = {
    host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
    actors: [],
    defaultActor: null,
    defaultUri: null,
    features: {
      privateChat: true,
      serviceCall: true,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: false,
    },
    labels: {
      actorChip: 'Using',
      noActorTitle: 'Create your first Bot',
      noActorBody: 'Your local Agent needs a Bot identity before it can appear on the Agent Internet.',
      noActorAction: { label: 'Create Bot', href: '/ui/bot?mode=create' },
    },
  };

  // The pane model writes the no-actor empty state into the ACTIVE tab's content
  // pane, so an active tab must exist (initialize() never ran: readyState is
  // 'loading' and DOMContentLoaded is a no-op in this mock). openTab() creates
  // and activates a tab synchronously; its welcome render is overwritten below.
  empty.context.AgentBrowserTabs.openTab();
  empty.context.renderNoLocalBot();

  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /Create your first Bot/);
  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /Your local Agent needs a Bot identity/);
  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /Create Bot/);
  assert.doesNotMatch(empty.nodes['[data-browser-viewport]'].innerHTML, /[\u4e00-\u9fff]/);
});

test('service-call sends only after modal confirmation with Browser action contract', async () => {
  const { context, nodes, requests } = createContext();

  await context.handleTrustedAction({ id: 'call', kind: 'service-call', serviceId: 'service-current-pin' });
  assert.equal(requests.length, 0);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Fixture Service/);

  await context.confirmServiceCall('Review this payload');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/browser/actions?actorId=worker');
  assert.deepEqual(requests[0].body, {
    resourceUri: 'metaid://idq1target',
    kind: 'service-call',
    payload: {
      servicePinId: 'service-current-pin',
      providerGlobalMetaId: 'idq1provider',
      userTask: 'Review this payload',
    },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body, 'from'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body.payload, 'input'), false);
});

test('sandboxed iframe renderer does not expose side-effect helpers to content', () => {
  const { context } = createContext();
  const html = context.renderRenderer({
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'https://metaweb.example/app' },
    owner: {},
    status: {},
    source: {},
    actions: [],
  });

  assert.match(html, /<iframe class="browser-html-frame" sandbox="allow-scripts" src=/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.doesNotMatch(html, /allow-top-navigation/);
  assert.doesNotMatch(html, /api\/chat\/private/);
  assert.doesNotMatch(html, /api\/services\/call/);
});

function standaloneRuntime() {
  return {
    host: { kind: 'standalone', name: 'Standalone Browser', localMode: true },
    actors: [{
      id: 'wallet',
      label: 'Standalone Wallet',
      kind: 'wallet',
      globalMetaId: 'idq1wallet',
      wallet: 'metaidwallet',
      isDefault: true,
      capabilities: ['template-settings'],
    }],
    defaultActor: {
      id: 'wallet',
      label: 'Standalone Wallet',
      kind: 'wallet',
      globalMetaId: 'idq1wallet',
      wallet: 'metaidwallet',
      isDefault: true,
      capabilities: ['template-settings'],
    },
    defaultUri: 'metaid://idq1target',
    features: {
      privateChat: false,
      serviceCall: false,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: true,
    },
    labels: {},
  };
}

for (const action of [
  { id: 'message', kind: 'private-chat' },
  { id: 'conversation', kind: 'open-conversation', payload: { conversationUri: 'map://simplemsg/conversation?peer=idq1target', peerGlobalMetaId: 'idq1target' } },
  { id: 'call', kind: 'service-call', serviceId: 'service-current-pin' },
]) {
  test(`standalone runtime blocks ${action.kind} write action and opens unsupported modal`, async () => {
    const { context, nodes, requests } = createContext();
    context.state.runtime = standaloneRuntime();

    await context.handleTrustedAction(action);

    assert.equal(requests.length, 0, `${action.kind} must not POST in standalone`);
    assert.equal(nodes['[data-browser-modal-root]'].hidden, false, `${action.kind} must open a modal`);
    assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
  });
}

test('standalone unsupported modal offers an install guide with a link to openagentinternet.org', async () => {
  const { context, nodes } = createContext();
  context.state.runtime = standaloneRuntime();

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });

  const html = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /This feature is not supported in the web version\./);
  assert.match(html, /install Open Agent Connect from openagentinternet\.org\./);
  assert.match(html, /<a class="browser-modal-link" href="https:\/\/openagentinternet\.org\/" target="_blank" rel="noopener">Go to openagentinternet\.org<\/a>/);
});

test('standalone unsupported modal closes on confirm without posting', async () => {
  const { context, nodes, requests } = createContext();
  context.state.runtime = standaloneRuntime();
  await context.initialize();

  await context.handleTrustedAction({ id: 'message', kind: 'private-chat' });
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);

  nodes['[data-browser-modal-root]'].listeners.get('click')({
    preventDefault() {},
    target: browserActionTarget({ 'data-browser-modal-action': 'standalone-unsupported' }),
  });

  assert.equal(nodes['[data-browser-modal-root]'].hidden, true);
  assert.equal(requests.length, 0);
});

test('bot page header omits the Follow button across hosts', () => {
  for (const hostKind of ['oac', 'idbots', 'standalone']) {
    const { context } = createContext();
    context.state.runtime = { ...standaloneRuntime(), host: { kind: hostKind, name: hostKind, localMode: true } };
    context.state.current = {
      uri: 'metaid://idq1target',
      normalizedUri: 'metaid://idq1target',
      resourceType: 'bot',
      title: 'Target Bot',
      owner: { kind: 'bot', globalMetaId: 'idq1target', name: 'Target Bot', verificationState: 'partial' },
      renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', data: {} },
      status: { state: 'resolved', verificationState: 'partial', message: '' },
      source: { resolver: 'test' },
      actions: [{ id: 'message', label: 'Message', kind: 'private-chat', enabled: true }],
    };

    const html = context.renderRenderer(context.state.current);
    assert.doesNotMatch(html, /data-browser-follow/, `Follow button must not render in ${hostKind} host`);
    assert.match(html, /data-browser-action="private-chat"/, `Message button must still render in ${hostKind} host`);
  }
});

test('owner panel omits the Follow menu item', () => {
  const { context, nodes } = createContext();
  context.state.current = {
    uri: 'metaid://idq1target',
    normalizedUri: 'metaid://idq1target',
    resourceType: 'bot',
    title: 'Target Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1target', name: 'Target Bot', avatar: '' },
    renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', data: {} },
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'test' },
    actions: [],
  };

  context.renderOwnerPanel();
  const html = nodes['[data-browser-owner-panel]'].innerHTML;
  assert.doesNotMatch(html, /data-browser-owner-panel-action="follow"/);
  assert.match(html, /data-browser-owner-panel-action="visit-home"/);
  assert.match(html, /data-browser-owner-panel-action="send-message"/);
  assert.doesNotMatch(html, /data-browser-owner-panel-action="send-message" disabled/);
});

test('owner panel Send Message opens the existing private-chat composer in a host runtime', async () => {
  const { context, nodes, requests } = createContext();
  context.openOwnerPanel();

  await context.handleOwnerPanelAction('send-message');

  assert.equal(nodes['[data-browser-owner-panel]'].hidden, true);
  assert.equal(requests.length, 0);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Private Chat/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Target Bot/);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /data-browser-private-chat-message/);
});

test('owner panel Send Message opens the unsupported modal in standalone', async () => {
  const { context, nodes, requests } = createContext();
  context.state.runtime = standaloneRuntime();
  context.openOwnerPanel();

  await context.handleOwnerPanelAction('send-message');

  assert.equal(nodes['[data-browser-owner-panel]'].hidden, true);
  assert.equal(requests.length, 0);
  assert.equal(nodes['[data-browser-modal-root]'].hidden, false);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
});

const METAAPP_PIN_ID = `${'a'.repeat(64)}i0`;
const METAAPP_ICON_PIN_ID = `${'b'.repeat(64)}i0`;

function metaAppCurrent({ withProof = true } = {}) {
  const record = {
    pinId: METAAPP_PIN_ID,
    firstPinId: METAAPP_PIN_ID,
    operation: 'create',
    title: 'Fun App',
    appName: 'Fun App',
    icon: `metafile://${METAAPP_ICON_PIN_ID}`,
    version: '1.2.0',
    runtime: 'html',
    indexFile: 'index.html',
    code: '',
    content: '',
    contentType: 'application/zip',
    codeType: 'zip',
    tags: [],
    ownerGlobalMetaId: 'idq1owner',
    network: 'mvc',
    updatedAt: 1750000000000,
    source: 'test',
  };
  return {
    uri: `metaapp://${METAAPP_PIN_ID}`,
    normalizedUri: `metaapp://${METAAPP_PIN_ID}`,
    resourceType: 'metaapp',
    title: 'Fun App',
    owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1owner', name: 'Owner Bot', verificationState: 'partial' },
    renderer: { type: 'html-iframe', contentType: 'text/html', data: { record } },
    proof: withProof ? { pinId: METAAPP_PIN_ID, protocolPath: '/protocols/metaapp', verificationState: 'partial' } : undefined,
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    source: { resolver: 'test' },
    actions: [],
  };
}

test('metaAppIconUrl resolves http, metafile, bare pinId, and rejects junk', () => {
  const { context } = createContext();
  assert.equal(context.metaAppIconUrl('https://cdn.example/icon.png'), 'https://cdn.example/icon.png');
  const fromMetafile = context.metaAppIconUrl(`metafile://${METAAPP_ICON_PIN_ID}`);
  assert.ok(fromMetafile.includes(`/api/v1/files/accelerate/content/${METAAPP_ICON_PIN_ID}`), fromMetafile);
  const fromBarePin = context.metaAppIconUrl(METAAPP_ICON_PIN_ID);
  assert.ok(fromBarePin.endsWith(`/content/${METAAPP_ICON_PIN_ID}`), fromBarePin);
  assert.equal(context.metaAppIconUrl('javascript:alert(1)'), '');
  assert.equal(context.metaAppIconUrl(''), '');
});

test('address icon stays the default link glyph for non-MetaApp resources', () => {
  const { context, nodes } = createContext();
  context.renderAddressIcon();
  const slot = nodes['[data-browser-address-icon]'];
  assert.equal(slot.disabled, true);
  assert.doesNotMatch(slot.innerHTML, /browser-app-icon-image/);
  assert.equal(slot.getAttribute('title'), '');
});

test('address icon shows the MetaApp icon for MetaApp resources', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.renderAddressIcon();
  const slot = nodes['[data-browser-address-icon]'];
  assert.equal(slot.disabled, false);
  assert.match(slot.innerHTML, /browser-app-icon-image/);
  assert.match(slot.innerHTML, new RegExp(METAAPP_ICON_PIN_ID));
  assert.equal(slot.getAttribute('title'), 'Fun App');
  assert.equal(slot.getAttribute('aria-haspopup'), 'dialog');
});

test('address icon restores the default glyph when leaving a MetaApp', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.renderAddressIcon();
  const slot = nodes['[data-browser-address-icon]'];
  assert.equal(slot.disabled, false);
  context.state.current = null;
  context.renderAddressIcon();
  assert.equal(slot.disabled, true);
  assert.doesNotMatch(slot.innerHTML, /browser-app-icon-image/);
  assert.equal(slot.getAttribute('aria-haspopup'), '');
  assert.equal(slot.getAttribute('aria-expanded'), '');
  assert.equal(slot.getAttribute('tabindex'), '-1');
});

test('app panel renders MetaApp metadata and actions', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openAppPanel();
  const panel = nodes['[data-browser-app-panel]'];
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Fun App/);
  assert.match(panel.innerHTML, /v1\.2\.0/);
  assert.match(panel.innerHTML, /Updated 2025-06-15/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="share"/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="remix"/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="view-pin"/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="share"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span>Share<\/span>/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="remix"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span>Remix<\/span>/);
  assert.match(panel.innerHTML, /data-browser-app-panel-action="view-pin"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span>View pin<\/span>/);
  assert.doesNotMatch(panel.innerHTML, /disabled/);
  assert.equal(nodes['[data-browser-address-icon]'].getAttribute('aria-expanded'), 'true');
  context.closeAppPanel();
  assert.equal(panel.hidden, true);
  assert.equal(nodes['[data-browser-address-icon]'].getAttribute('aria-expanded'), 'false');
});

test('app panel disables actions when the MetaApp has no on-chain pin', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent({ withProof: false });
  context.openAppPanel();
  const html = nodes['[data-browser-app-panel]'].innerHTML;
  assert.match(html, /data-browser-app-panel-action="share" disabled/);
  assert.match(html, /data-browser-app-panel-action="remix" disabled/);
  assert.match(html, /data-browser-app-panel-action="view-pin" disabled/);
  assert.match(html, /Actions require an on-chain pin/);
});

test('app panel view-pin navigates to the pin URI', async () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openAppPanel();
  await context.handleAppPanelAction('view-pin');
  assert.equal(nodes['[data-browser-app-panel]'].hidden, true);
  assert.equal(nodes['[data-browser-uri-input]'].value, `pin://${METAAPP_PIN_ID}`);
});

test('share modal shows web URL, metaapp URI, and editable default buzz text', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  const html = nodes['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /Share MetaApp/);
  assert.match(html, new RegExp(`https://openagentinternet\\.org/browser/metaapp/${METAAPP_PIN_ID}`));
  assert.match(html, new RegExp(`metaapp://${METAAPP_PIN_ID}`));
  assert.match(html, /I found an interesting app &#39;Fun App&#39;/);
  assert.match(html, /class="browser-app-share-label">Web2 URL:<\/span>/);
  assert.match(html, /class="browser-app-share-label">A\/I URI:<\/span>/);
  assert.match(html, /<label class="browser-app-share-label" for="browser-app-share-message">Share with Buzz<\/label>/);
  assert.match(html, /data-browser-app-share-message/);
  assert.match(html, />Share<\/button>/);
  assert.doesNotMatch(html, /Buzz it/);
  assert.match(html, /browser-app-share-composer/);
  assert.match(html, /class="browser-app-share-buzz" data-browser-modal-action="app-share-buzz"/);
  assert.equal((html.match(/data-browser-copy-value/g) || []).length, 2);
  assert.doesNotMatch(html, /data-browser-modal-confirm/);
});

test('Share posts a simplebuzz pin write through the actions endpoint', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: {
      ok: true,
      data: { pinId: `${'d'.repeat(64)}i0`, txid: 'tx-buzz', operation: 'create', path: '/protocols/simplebuzz' },
    },
  });
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.kind, 'metaid-pin-write');
  assert.equal(body.resourceUri, `metaapp://${METAAPP_PIN_ID}`);
  assert.equal(body.payload.operation, 'create');
  assert.equal(body.payload.path, '/protocols/simplebuzz');
  assert.equal(body.payload.encryption, '0');
  assert.equal(body.payload.version, '1.0.0');
  assert.equal(body.payload.contentType, 'application/json;utf-8');
  assert.equal(body.payload.payload.encoding, 'utf8');
  assert.equal(body.payload.payload.value, JSON.stringify({ content: 'hello buzz' }));
  assert.equal(body.payload.display.title, 'Share MetaApp');
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /Buzz published/);
});

test('Share keeps the new buzz pin id for view-post', async () => {
  const buzzPinId = `${'c'.repeat(64)}i0`;
  const { context } = createContext({
    actionResponse: {
      ok: true,
      data: { pinId: buzzPinId, txid: 'tx-buzz', operation: 'create', path: '/protocols/simplebuzz' },
    },
  });
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(context.state.pendingAppShareBuzzPinId, buzzPinId);
});

test('Share is gated in standalone mode', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.state.runtime = standaloneRuntime();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.equal(requests.length, 0);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
});

test('Share requires a message', async () => {
  const { context, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  const result = await context.confirmAppShareBuzz('   ');
  assert.equal(result, null);
  assert.equal(requests.length, 0);
});

test('Share does not declare publication for waiting envelopes', async () => {
  const { context, nodes } = createContext({
    actionResponse: { ok: false, state: 'manual_action_required', code: 'wallet_confirm', message: 'Confirm in wallet' },
  });
  context.state.current = metaAppCurrent();
  context.openMetaAppShareModal();
  await context.confirmAppShareBuzz('hello buzz');
  assert.doesNotMatch(nodes['[data-browser-modal-root]'].innerHTML, /Buzz published/);
  assert.match(nodes['[data-browser-toast]'].textContent, /Confirm in wallet/);
});

test('Remix opens the unsupported modal when the host lacks the remix feature', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  await context.requestMetaAppRemix();
  assert.equal(requests.length, 0);
  assert.match(nodes['[data-browser-modal-root]'].innerHTML, /standalone-unsupported/);
});

test('Remix posts the metaapp-remix trusted action with the current pinId', async () => {
  const { context, nodes, requests } = createContext();
  context.state.current = metaAppCurrent();
  context.state.runtime.features.remix = true;
  await context.requestMetaAppRemix();
  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.kind, 'metaapp-remix');
  assert.equal(body.resourceUri, `metaapp://${METAAPP_PIN_ID}`);
  assert.deepEqual(body.payload, { pinId: METAAPP_PIN_ID });
  assert.match(nodes['[data-browser-toast]'].textContent, /Remix request sent to the host/);
});

test('Remix surfaces host failures as a toast', async () => {
  const { context, nodes, requests } = createContext({
    actionResponse: { ok: false, state: 'failed', code: 'remix_failed', message: 'remix broke' },
  });
  context.state.current = metaAppCurrent();
  context.state.runtime.features.remix = true;
  const result = await context.requestMetaAppRemix();
  assert.equal(result, null);
  assert.equal(requests.length, 1);
  assert.match(nodes['[data-browser-toast]'].textContent, /remix broke/);
});

test('renderAddressIcon re-renders an open app panel for the new MetaApp', () => {
  const { context, nodes } = createContext();
  context.state.current = metaAppCurrent();
  context.openAppPanel();
  assert.match(nodes['[data-browser-app-panel]'].innerHTML, /Fun App/);
  const other = metaAppCurrent();
  other.title = 'Other App';
  other.renderer.data.record.title = 'Other App';
  context.state.current = other;
  context.renderAddressIcon();
  assert.match(nodes['[data-browser-app-panel]'].innerHTML, /Other App/);
});
