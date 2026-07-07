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
    this.classList = {
      add: (...names) => {
        for (const name of names) this.attrs[`class:${name}`] = true;
      },
      remove: (...names) => {
        for (const name of names) delete this.attrs[`class:${name}`];
      },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true;
        else delete this.attrs[`class:${name}`];
      },
    };
  }

  get value() {
    return this._value;
  }

  set value(value) {
    const nextValue = String(value);
    this._value = nextValue;
    this.valueHistory.push(nextValue);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.textContent = this._innerHTML.replace(/<[^>]*>/g, '');
  }

  addEventListener(eventName, handler) {
    this.listeners.set(eventName, handler);
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return this.attrs[name] || '';
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }

  click() {
    this.listeners.get('click')?.({ preventDefault() {} });
  }

  submit() {
    this.listeners.get('submit')?.({ preventDefault() {} });
  }
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

function createElements() {
  return {
    '[data-browser-shell]': new FakeElement(),
    '[data-browser-uri-input]': new FakeElement(),
    '[data-browser-address-form]': new FakeElement(),
    '[data-browser-back]': new FakeElement(),
    '[data-browser-forward]': new FakeElement(),
    '[data-browser-reload]': new FakeElement(),
    '[data-browser-drawer-toggle]': new FakeElement(),
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-owner-panel]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-actor-panel]': new FakeElement(),
    '[data-browser-menu-trigger]': new FakeElement(),
    '[data-browser-menu]': new FakeElement(),
    '[data-browser-owner-toolbar]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-strip]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
  };
}

function resolvedBot(uri, name = 'Alice Bot') {
  return {
    ok: true,
    data: {
      uri,
      normalizedUri: uri.toLowerCase(),
      resourceType: 'bot',
      title: name,
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name, verificationState: 'verified' },
      renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', templateId: 'document', data: { profile: { name } } },
      status: { state: 'resolved', verificationState: 'verified', message: '' },
      source: { resolver: 'test' },
      actions: [],
    },
  };
}

const defaultActor = {
  id: 'worker',
  label: 'Worker Bot',
  kind: 'oac-bot',
  globalMetaId: 'idq1worker',
  isDefault: true,
  capabilities: ['private-chat', 'service-call', 'template-settings'],
};

function runtimePayload(overrides = {}) {
  const actor = overrides.defaultActor === undefined ? defaultActor : overrides.defaultActor;
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor],
      defaultActor: actor,
      defaultUri: actor && actor.globalMetaId ? `metaid://${actor.globalMetaId}` : null,
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
      ...overrides,
    },
  };
}

function eventTargetWithAttribute(attribute, value = '') {
  return {
    parentElement: null,
    getAttribute(name) {
      return name === attribute ? value : null;
    },
    hasAttribute(name) {
      return name === attribute;
    },
  };
}

const standaloneWalletActor = {
  id: 'standalone-wallet',
  label: 'Standalone Wallet',
  kind: 'wallet',
  isDefault: true,
  capabilities: ['template-settings'],
};

function standaloneWalletRuntimePayload(overrides = {}) {
  return runtimePayload({
    host: { kind: 'standalone', name: 'Agent Internet Browser', localMode: false },
    actors: [standaloneWalletActor],
    defaultActor: standaloneWalletActor,
    defaultUri: null,
    features: {
      privateChat: false,
      serviceCall: false,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: true,
    },
    labels: {
      actorChip: 'Wallet',
      noActorTitle: 'No Wallet',
      noActorBody: 'Connect Metalet to use standalone Browser.',
      walletConnect: 'Connect Wallet',
      walletSelectTitle: 'Select a wallet to connect',
      walletPrimaryProviderId: 'metalet',
      walletPrimaryProviderLabel: 'Connect to Metalet',
      walletPrimaryProviderIconUrl: '/assets/metalet-logo-v3.4c11a0b7.svg',
      walletSecondaryProviderId: 'metamask',
      walletSecondaryProviderLabel: 'Connect to MetaMask',
      walletSecondaryProviderIconUrl: '/assets/metamask-fox.svg',
      walletUnsupportedProviderMessage: 'Coming soon',
      walletInstallTitle: 'Install Metalet',
      walletInstallBody: 'Please install Metalet wallet first.',
      walletInstallAction: 'Install',
      walletInstallUrl: 'https://metalet.space',
      walletUnlockError: 'Please unlock Metalet first.',
      walletInitializeError: 'Please initialize Metalet first.',
      walletAddressMissingError: 'Metalet did not return a wallet address.',
      walletFallbackName: 'Metalet Wallet',
      walletProviderId: 'metalet',
    },
    ...overrides,
  });
}

function createBrowserContext(options = {}) {
  const elements = createElements();
  const fetchCalls = [];
  const openCalls = [];
  const documentListeners = new Map();
  const runtimeResponse = options.runtimeResponse ?? runtimePayload();
  const resolveResponse = options.resolveResponse ?? ((uri) => resolvedBot(uri));
  const settingsData = options.settingsData ?? {
    browser: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: {
        enabled: true,
        ens: {
          enabled: false,
          chainId: 1,
          rpcUrls: [],
          textKey: 'org.openagentinternet.uri',
        },
      },
      defaultChainName: 'mvc',
      localMode: true,
    },
    effectiveBrowser: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: {
        enabled: true,
        ens: {
          enabled: false,
          chainId: 1,
          rpcUrls: [],
          textKey: 'org.openagentinternet.uri',
        },
      },
      defaultChainName: 'mvc',
      localMode: true,
    },
    defaults: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: {
        enabled: true,
        ens: {
          enabled: false,
          chainId: 1,
          rpcUrls: [],
          textKey: 'org.openagentinternet.uri',
        },
      },
      defaultChainName: 'mvc',
      localMode: true,
    },
  };
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
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
      open: (url, target, features) => {
        openCalls.push([url, target, features]);
        return null;
      },
      metaidwallet: options.metaidwallet,
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => elements[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: (eventName, handler) => {
        if (!documentListeners.has(eventName)) documentListeners.set(eventName, []);
        documentListeners.get(eventName).push(handler);
      },
    },
    fetch: async (url, fetchOptions = {}) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) {
        return { ok: true, json: async () => runtimeResponse };
      }
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        const payload = typeof resolveResponse === 'function' ? resolveResponse(uri) : resolveResponse;
        return { ok: true, json: async () => payload };
      }
      if (String(url).startsWith('/api/browser/settings')) {
        if (fetchOptions.method === 'PUT') {
          const body = JSON.parse(fetchOptions.body || '{}');
          if (body.browser && typeof body.browser === 'object') {
            settingsData.browser = { ...settingsData.browser, ...body.browser };
            settingsData.effectiveBrowser = { ...settingsData.effectiveBrowser, ...body.browser };
          }
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: JSON.parse(JSON.stringify(settingsData)),
          }),
        };
      }
      if (String(url).startsWith('/api/browser/cache')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              cacheRoot: '/tmp/.metabot/cache/metaapps',
              artifactCount: 2,
              pinRecordCount: 1,
              totalBytes: 2048,
              artifacts: [],
            },
          }),
        };
      }
      if (options.walletProfileResponse && String(url).includes('/api/v1/users/address/')) {
        return {
          ok: true,
          json: async () => JSON.parse(JSON.stringify(options.walletProfileResponse)),
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  context.globalThis = context;
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, openCalls, documentListeners };
}

test('Browser query URI is decoded into the address bar and resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });

  await waitFor(() => fetchCalls.length === 2, 'runtime and initial resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice');
  assert.equal(fetchCalls[0], '/api/browser/runtime');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');
});

test('Browser MetaID deep link path is decoded into the address bar and resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext({ pathname: '/browser/metaid/idq1alice' });

  await waitFor(() => fetchCalls.length === 2, 'runtime and deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');
});

test('Browser bare ENS alias path is decoded into the address bar and resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext({ pathname: '/browser/sunnyfung.eth' });

  await waitFor(() => fetchCalls.length === 2, 'runtime and bare ENS alias resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://sunnyfung.eth');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fsunnyfung.eth&actorId=worker');
});

test('Browser MetaID deep link path keeps botpage override in the address bar and resolve request', async () => {
  const { elements, fetchCalls } = createBrowserContext({
    pathname: '/browser/metaid/idq1alice',
    search: '?botpage=default',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and deep link resolve with botpage override');

  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice?botpage=default');
  assert.equal(
    fetchCalls[1],
    '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice%3Fbotpage%3Ddefault&actorId=worker',
  );
});

test('Browser MetaApp deep link path is decoded into the address bar and resolved', async () => {
  const pinId = '8544d8a15126296abe36a0bad740a4f293580575b5b00d345029bf99b74c78eci0';
  const { elements, fetchCalls } = createBrowserContext({ pathname: `/browser/metaapp/${pinId}` });

  await waitFor(() => fetchCalls.length === 2, 'runtime and deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, `metaapp://${pinId}`);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=metaapp%3A%2F%2F${pinId}&actorId=worker`);
});

test('Browser displays disabled MetaApp resolver failures in the centered failure state', async () => {
  const pinId = 'b6bfe1ab3b605c03bbe27b8bd8fe4f7874552e9020f207b677ab9ea89a424cedi0';
  const { context, elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/metaapp/${pinId}`,
    resolveResponse: () => ({
      ok: false,
      state: 'failed',
      code: 'browser_resource_disabled',
      message: 'MetaApp disabled by owner',
    }),
  });

  await waitFor(
    () => context.state.lastResolveError && elements['[data-browser-viewport]'].innerHTML.includes('MetaApp disabled by owner'),
    'disabled MetaApp failure state',
  );

  assert.equal(context.state.current, null);
  assert.equal(context.state.lastResolveError.code, 'browser_resource_disabled');
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=metaapp%3A%2F%2F${pinId}&actorId=worker`);
  assert.match(elements['[data-browser-viewport]'].innerHTML, /<h2>Resolve failed<\/h2>/);
  assert.match(elements['[data-browser-viewport]'].innerHTML, /MetaApp disabled by owner/);
});

test('Browser pin deep link path is decoded into the address bar and preserves version query', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const uri = `pin://${pinId}?version=0`;
  const { elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/pin/${pinId}`,
    search: '?version=0',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and pin deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, uri);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(uri)}&actorId=worker`);
});

test('Browser MAP deep link path is decoded into the address bar and preserves query', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const uri = `map://simplebuzz/pin/${pinId}?version=0`;
  const { elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/map/simplebuzz/pin/${pinId}`,
    search: '?version=0',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, uri);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(uri)}&actorId=worker`);
});

test('Browser address input displays the resolver-normalized URI for a bare Global MetaID', async () => {
  const globalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
  const canonicalUri = `metaid://${globalMetaId}`;
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({ defaultUri: null }),
    resolveResponse: (uri) => ({
      ...resolvedBot(canonicalUri, 'Global MetaID Bot'),
      data: {
        ...resolvedBot(canonicalUri, 'Global MetaID Bot').data,
        uri,
        normalizedUri: canonicalUri,
      },
    }),
  });

  await waitFor(() => context.state.actorId === 'worker', 'runtime actor load');

  elements['[data-browser-uri-input]'].value = globalMetaId;
  elements['[data-browser-address-form]'].submit();
  await waitFor(() => elements['[data-browser-uri-input]'].value === canonicalUri, 'bare Global MetaID canonical URI');

  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(globalMetaId)}&actorId=worker`);
  assert.equal(elements['[data-browser-uri-input]'].value, canonicalUri);
  // The welcome page seeds history as its origin (empty URI), so the first
  // navigation appends after it.
  assert.deepEqual(Array.from(context.state.history), ['', canonicalUri]);
});

test('Browser address input displays the resolver-normalized URI for a bare domain alias', async () => {
  const alias = 'sunnyfung.eth';
  const canonicalUri = `metaid://${alias}`;
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({ defaultUri: null }),
    resolveResponse: (uri) => ({
      ...resolvedBot(canonicalUri, 'Alias Bot'),
      data: {
        ...resolvedBot(canonicalUri, 'Alias Bot').data,
        uri,
        normalizedUri: canonicalUri,
      },
    }),
  });

  await waitFor(() => context.state.actorId === 'worker', 'runtime actor load');

  elements['[data-browser-uri-input]'].value = alias;
  elements['[data-browser-address-form]'].submit();
  await waitFor(() => elements['[data-browser-uri-input]'].value === canonicalUri, 'bare alias canonical URI');

  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(alias)}&actorId=worker`);
  assert.equal(elements['[data-browser-uri-input]'].value, canonicalUri);
  assert.deepEqual(Array.from(context.state.history), ['', canonicalUri]);
});

test('Browser address input displays the resolver-normalized URI for a bare pin id', async () => {
  const pinId = '7edcf7775a2054c87c46c0a964d10dd6c32408506d60b0b91a90c30423d8edbei0';
  const canonicalUri = `pin://${pinId}`;
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({ defaultUri: null }),
    resolveResponse: (uri) => ({
      ok: true,
      data: {
        uri,
        normalizedUri: canonicalUri,
        resourceType: 'pin',
        title: 'Fixture Pin',
        owner: { kind: 'pin-author', globalMetaId: 'idq1alice', name: 'Alice', verificationState: 'partial' },
        renderer: { type: 'unsupported', contentType: 'application/json', error: 'Unsupported pin content.' },
        status: { state: 'resolved', verificationState: 'partial', message: '' },
        proof: { pinId, verificationState: 'partial' },
        source: { resolver: 'test' },
        actions: [],
      },
    }),
  });

  await waitFor(() => context.state.actorId === 'worker', 'runtime actor load');

  elements['[data-browser-uri-input]'].value = pinId;
  elements['[data-browser-address-form]'].submit();
  await waitFor(() => elements['[data-browser-uri-input]'].value === canonicalUri, 'bare pin canonical URI');

  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=${encodeURIComponent(pinId)}&actorId=worker`);
  assert.equal(elements['[data-browser-uri-input]'].value, canonicalUri);
  assert.deepEqual(Array.from(context.state.history), ['', canonicalUri]);
});

test('Browser preserves metaid address when resolver returns custom target resource model', async () => {
  const aliasUri = 'metaid://idq1custombot';
  const customHomepageUri = 'metaapp://custom-pin';
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1custombot',
    resolveResponse: () => ({
      ok: true,
      data: {
        uri: aliasUri,
        normalizedUri: aliasUri,
        resourceType: 'metaapp',
        title: 'Custom MetaApp',
        owner: {
          kind: 'metaapp-publisher',
          globalMetaId: 'idq1metaappowner',
          name: 'Custom MetaApp Owner',
          verificationState: 'partial',
        },
        renderer: {
          type: 'html-iframe',
          contentType: 'text/html',
          url: '/api/metaapp/preview-assets/custom/index.html',
        },
        status: { state: 'resolved', verificationState: 'partial', message: '' },
        proof: { pinId: 'custom-pin', verificationState: 'partial' },
        source: {
          resolver: 'test',
          raw: {
            aliasUri,
            customHomepageUri,
          },
        },
        actions: [
          { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: aliasUri },
        ],
      },
    }),
  });

  await waitFor(
    () => context.state.current && elements['[data-browser-uri-input]'].value === aliasUri,
    'custom target alias address',
  );

  assert.equal(context.state.current.resourceType, 'metaapp');
  assert.equal(context.state.current.normalizedUri, aliasUri);
  assert.equal(elements['[data-browser-uri-input]'].value, aliasUri);
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1custombot&actorId=worker');
  assert.equal(fetchCalls.some((call) => call.includes('metaapp%3A%2F%2F')), false);
  assert.deepEqual(elements['[data-browser-uri-input]'].valueHistory, [aliasUri, aliasUri, aliasUri]);
  assert.equal(elements['[data-browser-uri-input]'].valueHistory.includes(customHomepageUri), false);
});

test('Browser Metafile deep link path is decoded into the address bar and resolved', async () => {
  const pinId = 'f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.pdf';
  const { elements, fetchCalls } = createBrowserContext({ pathname: `/browser/metafile/${pinId}` });

  await waitFor(() => fetchCalls.length === 2, 'runtime and deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, `metafile://${pinId}`);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=metafile%3A%2F%2F${pinId}&actorId=worker`);
});

test('Browser MAP deep link path is decoded into the address bar and resolved', async () => {
  const pinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const { elements, fetchCalls } = createBrowserContext({
    pathname: `/browser/map/simplebuzz/pin/${pinId}`,
    search: '?version=0',
  });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP deep link resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, `map://simplebuzz/pin/${pinId}?version=0`);
  assert.equal(fetchCalls[1], `/api/browser/resolve?uri=map%3A%2F%2Fsimplebuzz%2Fpin%2F${pinId}%3Fversion%3D0&actorId=worker`);
});

test('Browser MAP alias deep link path is decoded into the address bar and resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext({ pathname: '/browser/map/buzz.sunny.eth' });

  await waitFor(() => fetchCalls.length === 2, 'runtime and MAP alias resolve');

  assert.equal(elements['[data-browser-uri-input]'].value, 'map://buzz.sunny.eth');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=map%3A%2F%2Fbuzz.sunny.eth&actorId=worker');
});

test('Browser status TXID falls back to the proof pin transaction id', async () => {
  const txid = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const pinId = `${txid}i0`;
  const { elements, fetchCalls } = createBrowserContext({
    resolveResponse: (uri) => ({
      ok: true,
      data: {
        uri,
        normalizedUri: uri.toLowerCase(),
        resourceType: 'metaapp',
        title: 'Fixture MetaApp',
        owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1publisher', name: 'Publisher', verificationState: 'partial' },
        renderer: { type: 'unsupported', contentType: 'application/zip', error: 'Unsupported MetaApp content type.' },
        status: { state: 'resolved', verificationState: 'partial', message: '' },
        proof: { pinId, protocolPath: '/protocols/metaapp', verificationState: 'partial' },
        source: { resolver: 'test' },
        actions: [],
      },
    }),
  });

  await waitFor(() => fetchCalls.length === 2, 'MetaApp render with pin proof');

  assert.equal(elements['[data-browser-status-txid]'].textContent, 'TXID: 1234567890...abcdef');
});

test('Browser loads runtime and resolves default URI when no query URI is present', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'runtime and default resolve');

  assert.equal(fetchCalls[0], '/api/browser/runtime');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1worker&actorId=worker');
  assert.equal(context.state.actorId, 'worker');
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1worker');
});

test('Browser renders current resource identity separately from using identity', async () => {
  const { elements, fetchCalls } = createBrowserContext({
    resolveResponse: (uri) => resolvedBot(uri, 'Alice Resource'),
  });

  await waitFor(() => fetchCalls.length === 2, 'resource render');

  assert.match(elements['[data-browser-resource-chip]'].innerHTML, /browser-chip-avatar/);
  assert.doesNotMatch(elements['[data-browser-resource-chip]'].innerHTML, /Alice Resource/);
  elements['[data-browser-resource-chip]'].click();
  const ownerPanel = elements['[data-browser-owner-panel]'];
  assert.match(ownerPanel.innerHTML, /Alice Resource/);
  assert.match(ownerPanel.innerHTML, /idq1alice/);
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Using: Worker Bot/);
});

test('Browser resource chip uses publisher identity for MetaApp resources', async () => {
  const { elements, fetchCalls } = createBrowserContext({
    resolveResponse: (uri) => ({
      ok: true,
      data: {
        uri,
        normalizedUri: uri.toLowerCase(),
        resourceType: 'metaapp',
        title: 'Fixture MetaApp',
        owner: {
          kind: 'metaapp-publisher',
          globalMetaId: 'idq1publisher',
          name: 'Publisher Bot',
          avatar: 'https://so.example.test/content/publisher-avatar',
          verificationState: 'partial',
        },
        renderer: { type: 'unsupported', contentType: 'application/zip', error: 'Unsupported MetaApp content type.' },
        status: { state: 'resolved', verificationState: 'partial', message: '' },
        source: { resolver: 'test' },
        actions: [],
      },
    }),
  });

  await waitFor(() => fetchCalls.length === 2, 'MetaApp resource render');

  const resourceChip = elements['[data-browser-resource-chip]'].innerHTML;
  assert.match(resourceChip, /https:\/\/so\.example\.test\/content\/publisher-avatar/);
  assert.doesNotMatch(resourceChip, /Publisher Bot/);
  assert.doesNotMatch(resourceChip, /Fixture MetaApp/);
});

test('Browser using identity selector switches identity without navigating or touching the address bar', async () => {
  const reviewerActor = {
    id: 'reviewer',
    label: 'Reviewer Bot',
    kind: 'oac-bot',
    globalMetaId: 'idq1reviewer',
    isDefault: false,
    capabilities: ['private-chat', 'service-call', 'template-settings'],
  };
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({
      actors: [defaultActor, reviewerActor],
      defaultActor,
      defaultUri: 'metaid://idq1worker',
    }),
  });

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');

  elements['[data-browser-using-selector]'].click();

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.equal(elements['[data-browser-using-selector]'].getAttribute('aria-expanded'), 'true');
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Worker Bot/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Reviewer Bot/);

  await context.selectUsingIdentity('reviewer');

  assert.equal(context.state.runtime.defaultActor.id, 'reviewer');
  assert.equal(context.state.actorId, 'reviewer');
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Using: Reviewer Bot/);
  assert.equal(elements['[data-browser-modal-root]'].hidden, true);
  assert.equal(elements['[data-browser-using-selector]'].getAttribute('aria-expanded'), 'false');
  // Switching only updates the chip and the recorded actor — it must NOT
  // re-resolve the page or touch the address bar.
  assert.equal(fetchCalls.length, 2);
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1worker');
  assert.deepEqual(Array.from(context.state.history), ['metaid://idq1worker']);
  assert.equal(context.state.historyIndex, 0);
});

test('Browser using identity chip and selector render actor avatars when runtime provides them', async () => {
  const reviewerAvatar = 'data:image/png;base64,reviewer-avatar';
  const workerAvatar = 'data:image/jpeg;base64,worker-avatar';
  const reviewerActor = {
    id: 'reviewer',
    label: 'Reviewer Bot',
    kind: 'oac-bot',
    globalMetaId: 'idq1reviewer',
    avatar: reviewerAvatar,
    isDefault: false,
    capabilities: ['private-chat', 'service-call', 'template-settings'],
  };
  const workerActor = { ...defaultActor };
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({
      actors: [workerActor, reviewerActor],
      defaultActor: { ...workerActor, avatar: workerAvatar },
      defaultUri: 'metaid://idq1worker',
    }),
  });

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');

  assert.match(elements['[data-browser-using-selector]'].innerHTML, /browser-avatar-image/);
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /data:image\/jpeg;base64,worker-avatar/);

  elements['[data-browser-using-selector]'].click();

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /browser-avatar-image/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /data:image\/jpeg;base64,worker-avatar/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /data:image\/png;base64,reviewer-avatar/);

  await context.selectUsingIdentity('reviewer');

  assert.match(elements['[data-browser-using-selector]'].innerHTML, /data:image\/png;base64,reviewer-avatar/);
  assert.doesNotMatch(elements['[data-browser-using-selector]'].innerHTML, /browser-avatar-fallback/);

  await context.selectUsingIdentity('worker');

  assert.match(elements['[data-browser-using-selector]'].innerHTML, /data:image\/jpeg;base64,worker-avatar/);
  // Switching the active actor only re-renders the chip; no re-resolution.
  assert.equal(fetchCalls.length, 2);
});

test('Browser safeUrl keeps data and blob avatar URLs', async () => {
  const { context } = createBrowserContext();

  assert.equal(context.safeUrl('data:image/png;base64,avatar-data'), 'data:image/png;base64,avatar-data');
  assert.equal(context.safeUrl('blob:https://example.test/avatar-data'), 'blob:https://example.test/avatar-data');
  assert.equal(context.safeUrl('javascript:alert(1)'), '');
});

test('standalone wallet chip opens wallet picker before provider-specific connect', async () => {
  const { context, elements } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Connect Wallet/);
  assert.doesNotMatch(elements['[data-browser-using-selector]'].innerHTML, /browser-chip-avatar/);
  assert.doesNotMatch(elements['[data-browser-using-selector]'].innerHTML, /Wallet:/);

  elements['[data-browser-using-selector]'].click();

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Select a wallet to connect/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /class="browser-icon-button" data-browser-modal-close/);
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, />Close<\/button>/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Connect to Metalet/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Connect to MetaMask/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /data-browser-wallet-provider="metalet"/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /data-browser-wallet-provider="metamask"/);
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /Install Metalet/);
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /data-browser-actor-id/);
});

test('standalone MetaMask wallet option reports coming soon', async () => {
  const { context, elements } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  elements['[data-browser-using-selector]'].click();
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-provider', 'metamask'),
  });

  assert.match(elements['[data-browser-toast]'].textContent, /Coming soon/);
});

test('standalone Metalet wallet option opens install modal when extension is missing', async () => {
  const { context, elements } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  elements['[data-browser-using-selector]'].click();
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-provider', 'metalet'),
  });

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Install Metalet/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /data-browser-wallet-install/);
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /data-browser-actor-id/);
});

test('standalone Metalet install action opens the wallet site in a new window', async () => {
  const { context, elements, openCalls } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  elements['[data-browser-using-selector]'].click();
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-provider', 'metalet'),
  });
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-install'),
  });

  assert.deepEqual(openCalls, [
    ['https://metalet.space', '_blank', 'noopener'],
  ]);
});

test('standalone Metalet connect updates the single wallet actor and opens wallet actor menu', async () => {
  let connectCalls = 0;
  const metaidwallet = {
    isConnected: async () => ({ status: connectCalls ? 'connected' : 'not-connected' }),
    connect: async () => {
      connectCalls += 1;
      return { status: 'connected' };
    },
    getNetwork: async () => ({ network: 'livenet' }),
    getAddress: async () => 'mvc-address-1234567890',
    getPublicKey: async () => 'mvc-public-key',
    btc: {
      getAddress: async () => 'btc-address-1234567890',
      getPublicKey: async () => 'btc-public-key',
    },
  };
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
    metaidwallet,
    walletProfileResponse: {
      code: 0,
      data: {
        name: 'Sunny Fung',
        globalMetaId: 'idq1walletuser',
        avatar: '/avatar.png',
      },
    },
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  elements['[data-browser-using-selector]'].click();
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-provider', 'metalet'),
  });
  await waitFor(() => context.state.actorId === 'wallet:mvc-address-1234567890', 'wallet actor selection');

  assert.equal(connectCalls, 1);
  assert.equal(context.state.runtime.defaultActor.id, 'wallet:mvc-address-1234567890');
  assert.equal(context.state.runtime.actors.length, 1);
  assert.equal(context.state.runtime.actors[0].globalMetaId, 'idq1walletuser');
  assert.equal(context.state.runtime.actors[0].wallet.btcAddress, 'btc-address-1234567890');
  assert.ok(fetchCalls.includes('https://file.metaid.io/metafile-indexer/api/v1/users/address/mvc-address-1234567890'));
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Sunny Fung/);
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /idq1walletuser/);
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /https:\/\/file\.metaid\.io\/metafile-indexer\/avatar\.png/);

  elements['[data-browser-modal-root]'].innerHTML = 'unchanged';
  elements['[data-browser-using-selector]'].click();
  assert.equal(elements['[data-browser-actor-panel]'].hidden, false);
  assert.match(elements['[data-browser-actor-panel]'].innerHTML, /Visit homepage/);
  assert.match(elements['[data-browser-actor-panel]'].innerHTML, /Logout/);
  assert.equal(elements['[data-browser-modal-root]'].innerHTML, 'unchanged');
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /data-browser-actor-id/);
});

test('standalone wallet actor menu visits homepage and logs out', async () => {
  const metaidwallet = {
    isConnected: async () => ({ status: 'not-connected' }),
    connect: async () => ({ status: 'connected' }),
    getNetwork: async () => ({ network: 'livenet' }),
    getAddress: async () => 'mvc-address-1234567890',
    getPublicKey: async () => 'mvc-public-key',
    btc: {
      getAddress: async () => 'btc-address-1234567890',
      getPublicKey: async () => 'btc-public-key',
    },
  };
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: standaloneWalletRuntimePayload(),
    metaidwallet,
    walletProfileResponse: {
      code: 0,
      data: {
        name: 'Sunny Fung',
        globalMetaId: 'idq1walletuser',
        avatar: '/avatar.png',
      },
    },
  });

  await waitFor(() => context.state.runtime, 'standalone runtime load');

  elements['[data-browser-using-selector]'].click();
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: eventTargetWithAttribute('data-browser-wallet-provider', 'metalet'),
  });
  await waitFor(() => context.state.actorId === 'wallet:mvc-address-1234567890', 'wallet actor selection');

  elements['[data-browser-using-selector]'].click();
  const actorPanelClick = elements['[data-browser-actor-panel]'].listeners.get('click');
  assert.equal(typeof actorPanelClick, 'function');
  actorPanelClick({
    stopPropagation() {},
    target: eventTargetWithAttribute('data-browser-actor-panel-action', 'visit-home'),
  });
  await waitFor(
    () => fetchCalls.some((url) => url.startsWith('/api/browser/resolve?uri=metaid%3A%2F%2Fidq1walletuser')),
    'wallet homepage visit',
  );
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1walletuser');

  elements['[data-browser-using-selector]'].click();
  actorPanelClick({
    stopPropagation() {},
    target: eventTargetWithAttribute('data-browser-actor-panel-action', 'logout'),
  });

  assert.equal(context.state.actorId, 'standalone-wallet');
  assert.equal(context.state.runtime.defaultActor.id, 'standalone-wallet');
  assert.match(elements['[data-browser-using-selector]'].innerHTML, /Connect Wallet/);
  assert.doesNotMatch(elements['[data-browser-using-selector]'].innerHTML, /browser-chip-avatar/);
});

test('Browser menu is data-driven and opens cache management settings', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');

  assert.ok(Array.isArray(context.browserMenuSections));
  assert.equal(context.browserMenuSections[0].items[0].id, 'settings');
  assert.equal(context.browserMenuSections[0].items[1].id, 'name-resolution');
  assert.equal(context.browserMenuSections[0].items[2].id, 'templates');
  assert.equal(context.browserMenuSections[0].items[3].id, 'cache');

  elements['[data-browser-menu-trigger]'].click();
  assert.equal(elements['[data-browser-menu]'].hidden, false);
  assert.equal(elements['[data-browser-menu-trigger]'].getAttribute('aria-expanded'), 'true');
  assert.match(elements['[data-browser-menu]'].innerHTML, /Settings/);
  assert.match(elements['[data-browser-menu]'].innerHTML, /Name Resolution/);
  assert.match(elements['[data-browser-menu]'].innerHTML, /Bot Page Templates/);
  assert.match(elements['[data-browser-menu]'].innerHTML, /Cache Management/);

  await context.handleBrowserMenuAction('cache');

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Base URLs/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Templates/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Cache/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /\/tmp\/\.metabot\/cache\/metaapps/);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /2 artifacts/);
  assert.equal(fetchCalls.at(-2), '/api/browser/settings');
  assert.equal(fetchCalls.at(-1), '/api/browser/cache?actorId=worker');
});

test('Browser menu matches owner panel outside-click dismissal behavior', async () => {
  const { elements, fetchCalls, documentListeners } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');

  const triggerClick = elements['[data-browser-menu-trigger]'].listeners.get('click');
  const menuClick = elements['[data-browser-menu]'].listeners.get('click');
  const documentClick = documentListeners.get('click')?.at(-1);
  assert.equal(typeof triggerClick, 'function');
  assert.equal(typeof menuClick, 'function');
  assert.equal(typeof documentClick, 'function');

  let triggerStopped = false;
  triggerClick({
    stopPropagation() {
      triggerStopped = true;
    },
  });
  assert.equal(triggerStopped, true);
  assert.equal(elements['[data-browser-menu]'].hidden, false);
  assert.equal(elements['[data-browser-menu-trigger]'].getAttribute('aria-expanded'), 'true');

  let menuStopped = false;
  menuClick({
    stopPropagation() {
      menuStopped = true;
    },
    target: eventTargetWithAttribute('data-browser-menu'),
  });
  assert.equal(menuStopped, true);

  documentClick({});
  assert.equal(elements['[data-browser-menu]'].hidden, true);
  assert.equal(elements['[data-browser-menu-trigger]'].getAttribute('aria-expanded'), 'false');
});

test('Browser base URL settings show only resolver base URL fields', async () => {
  const { context, elements } = createBrowserContext();

  await waitFor(() => context.state.current, 'initial Browser load');
  await context.openBrowserSettings('baseUrls');

  assert.deepEqual(JSON.parse(JSON.stringify(context.browserBaseUrlFields.map((field) => field.key))), [
    'metasoP2PBaseUrl',
    'metafileContentBaseUrl',
    'manApiBaseUrl',
  ]);
  const html = elements['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /Metaso P2P Base URL/);
  assert.match(html, /Metafile Content Base URL/);
  assert.match(html, /ManAPI Base URL/);
  assert.match(html, /The infrastructure of the Open Agent Internet is decentralized\./);
  assert.match(html, /Build your own via <a href="https:\/\/github\.com\/orgs\/openagentinternet\/repositories" target="_blank" rel="noopener">GitHub<\/a>\./);
  assert.doesNotMatch(html, /Block Explorer Base URL/);
  assert.doesNotMatch(html, /Wallet API Base URL/);
});

test('Browser name resolution settings save ENS fields globally', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('nameResolution');

  const modal = elements['[data-browser-modal-root]'];
  assert.match(modal.innerHTML, /Name Resolution/);
  assert.match(modal.innerHTML, /data-browser-name-resolution-enabled/);
  assert.match(modal.innerHTML, /data-browser-ens-enabled/);
  assert.match(modal.innerHTML, /data-browser-ens-rpc-urls/);
  assert.match(modal.innerHTML, /org\.openagentinternet\.uri/);

  modal.querySelector('[data-browser-ens-rpc-urls]').value = 'https://rpc-one.example/rpc, https://rpc-two.example/rpc';
  modal.querySelector('[data-browser-ens-text-key]').value = 'org.openagentinternet.uri';
  await context.saveBrowserSettings();

  assert.deepEqual(context.state.settingsData.browser.nameResolution.ens.rpcUrls, [
    'https://rpc-one.example/rpc',
    'https://rpc-two.example/rpc',
  ]);
  assert.equal(context.state.settingsData.browser.nameResolution.ens.textKey, 'org.openagentinternet.uri');
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
});

test('Browser template settings show only the default Document template', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');

  // Compact List is intentionally hidden from the picker (its built-in rendering
  // is not production-ready); only Document remains selectable, and it is the
  // default. compact-list still resolves server-side, so it is absent here only
  // from the Browser Settings UI list.
  assert.ok(Array.isArray(context.browserBotHomepageTemplates));
  assert.equal(context.browserBotHomepageTemplates.map((template) => template.id).join(','), 'document');

  await context.handleBrowserMenuAction('templates');

  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /Document/);
  assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /Compact List/);
  // Document is the default and is shown as selected in the picker.
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /aria-pressed="true"/);
  assert.equal(fetchCalls.at(-2), '/api/browser/settings');
  assert.equal(fetchCalls.at(-1), '/api/browser/cache?actorId=worker');

  // Selecting Document persists it as the active template and renders the document shell.
  await context.selectBotHomepageTemplate('document');

  assert.equal(context.state.settingsData.browser.botHomepageTemplateId, 'document');
  assert.equal(context.state.current.renderer.templateId, 'document');
  assert.match(elements['[data-browser-viewport]'].innerHTML, /browser-bot-template-document/);
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
});

test('Browser template settings render global custom Bot Page toggle with tooltip help', async () => {
  const { context, elements, fetchCalls } = createBrowserContext();

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('templates');

  const html = elements['[data-browser-modal-root]'].innerHTML;
  assert.match(html, /Render Custom Bot Pages/);
  assert.match(html, /data-browser-custom-pages-toggle/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /data-browser-custom-pages-help/);
  assert.match(html, /browser-help-tooltip/);
  assert.match(html, /When enabled, Bot Pages can render the custom MetaApp or Metafile declared on \/info\/homepage/);
  assert.match(html, /<circle cx="12" cy="12" r="9"><\/circle>/);
  assert.match(html, /class="browser-info-dot"/);
  assert.doesNotMatch(html, />\?<\/button>/);
  assert.match(html, /browser-switch-track/);
  assert.match(html, /browser-switch-thumb/);
});

test('Browser custom Bot Page toggle saves globally and re-resolves the current URI', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1custombot',
  });

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('templates');
  await context.toggleCustomBotPages();

  assert.equal(context.state.settingsData.browser.renderCustomBotPages, false);
  assert.match(elements['[data-browser-modal-root]'].innerHTML, /aria-checked="false"/);
  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
  assert.ok(fetchCalls.includes('/api/browser/settings'));
  assert.ok(fetchCalls.filter((call) => call.startsWith('/api/browser/resolve?uri=metaid%3A%2F%2Fidq1custombot')).length >= 2);
  assert.equal(context.state.current.normalizedUri, 'metaid://idq1custombot');
});

test('Browser custom Bot Page toggle is wired through modal click delegation', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    search: '?uri=metaid%3A%2F%2Fidq1custombot',
  });

  await waitFor(() => fetchCalls.length === 2, 'initial Browser load');
  await context.handleBrowserMenuAction('templates');

  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  assert.equal(typeof modalClick, 'function');
  modalClick({
    target: {
      parentElement: null,
      getAttribute(name) {
        return name === 'data-browser-custom-pages-toggle' ? '' : null;
      },
      hasAttribute(name) {
        return name === 'data-browser-custom-pages-toggle';
      },
    },
  });
  await waitFor(() => context.state.settingsData.browser.renderCustomBotPages === false, 'delegated custom pages toggle');

  assert.equal(fetchCalls.includes('/api/browser/settings?actorId=worker'), false);
  assert.ok(fetchCalls.filter((call) => call.startsWith('/api/browser/resolve?uri=metaid%3A%2F%2Fidq1custombot')).length >= 2);
});

test('Browser history controls navigate without replacing Browser chrome', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1one' });
  const topbar = elements['[data-browser-address-form]'];
  await waitFor(() => fetchCalls.length === 2, 'first resolve');

  elements['[data-browser-uri-input]'].value = 'metaid://idq1two';
  elements['[data-browser-address-form]'].submit();
  await waitFor(() => context.state.history.length === 2, 'second history entry');

  elements['[data-browser-back]'].click();
  await waitFor(() => fetchCalls.length === 4, 'back resolve');

  elements['[data-browser-forward]'].click();
  await waitFor(() => fetchCalls.length === 5, 'forward resolve');

  elements['[data-browser-reload]'].click();
  await waitFor(() => fetchCalls.length === 6, 'reload resolve');

  assert.deepEqual(Array.from(context.state.history), ['metaid://idq1one', 'metaid://idq1two']);
  assert.equal(context.state.historyIndex, 1);
  assert.equal(elements['[data-browser-address-form]'], topbar);
});

test('Browser renders no-actor empty state from runtime labels when runtime has no default actor', async () => {
  const { elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({
      actors: [],
      defaultActor: null,
      defaultUri: null,
      labels: {
        actorChip: 'Wallet',
        noActorTitle: 'Sign in with Wallet',
        noActorBody: 'Use Metalet to activate Browser actions.',
        noActorAction: { label: 'Open Wallet Login', href: '/ui/wallet' },
      },
    }),
  });

  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('Sign in with Wallet'), 'no actor render');

  assert.equal(fetchCalls[0], '/api/browser/runtime');
  assert.match(elements['[data-browser-viewport]'].innerHTML, /Use Metalet to activate Browser actions\./);
  assert.match(elements['[data-browser-viewport]'].innerHTML, /href="\/ui\/wallet"/);
});

test('Browser no-local-Bot empty state renders Bot creation activation entry', async () => {
  const { elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({
      actors: [],
      defaultActor: null,
      defaultUri: null,
      labels: {
        actorChip: 'Using',
        noActorTitle: 'Create your first Bot',
        noActorBody: 'Your local Agent needs a Bot identity before it can appear on the Agent Internet.',
        noActorAction: { label: 'Create Bot', href: '/ui/bot?mode=create' },
      },
    }),
  });

  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('Create your first Bot'), 'Bot creation empty state');

  assert.equal(fetchCalls[0], '/api/browser/runtime');
  assert.match(elements['[data-browser-viewport]'].innerHTML, /Your local Agent needs a Bot identity before it can appear on the Agent Internet\./);
  assert.match(elements['[data-browser-viewport]'].innerHTML, /href="\/ui\/bot\?mode=create"/);
  assert.match(elements['[data-browser-viewport]'].innerHTML, />Create Bot<\/a>/);
});

test('Browser back button returns to the welcome page from the first navigation', async () => {
  const { context, elements, fetchCalls } = createBrowserContext({
    runtimeResponse: runtimePayload({ defaultUri: null }),
  });

  await waitFor(() => context.state.actorId === 'worker', 'runtime actor load');
  // The welcome page seeds the history origin so it is reachable via back.
  assert.deepEqual(Array.from(context.state.history), ['']);
  assert.equal(context.state.historyIndex, 0);

  elements['[data-browser-uri-input]'].value = 'metaid://idq1first';
  elements['[data-browser-address-form]'].submit();
  await waitFor(() => context.state.history.length === 2, 'first navigation recorded');

  assert.deepEqual(Array.from(context.state.history), ['', 'metaid://idq1first']);
  assert.equal(context.state.historyIndex, 1);

  elements['[data-browser-back]'].click();
  await waitFor(() => context.state.historyIndex === 0, 'back to welcome origin');

  // Back to the welcome origin renders the welcome page again.
  assert.match(elements['[data-browser-viewport]'].innerHTML, /data-browser-welcome/);
  assert.deepEqual(Array.from(context.state.history), ['', 'metaid://idq1first']);
});
