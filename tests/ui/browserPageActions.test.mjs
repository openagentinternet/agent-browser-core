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
    this.innerHTML = '';
    this.hidden = false;
    this.attrs = {};
    this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
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

test('browser renders the no-Bot launch chrome in Simplified Chinese', () => {
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

  empty.context.renderNoLocalBot();

  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /创建你的第一个 Bot/);
  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /本地 Agent 需要先拥有一个 Bot 身份/);
  assert.match(empty.nodes['[data-browser-viewport]'].innerHTML, /创建 Bot/);
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
});
