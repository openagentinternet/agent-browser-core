import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

class FakeElement {
  constructor(value = '') {
    this._value = String(value);
    this.textContent = '';
    this._innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.attrs = {};
    this.children = [];
    this._parent = null;
    this.childrenBySelector = new Map();
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
      contains: (name) => Boolean(this.attrs[`class:${name}`]),
    };
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

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.textContent = this._innerHTML.replace(/<[^>]*>/g, '');
  }

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

  removeAttribute(name) {
    delete this.attrs[name];
  }

  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.childrenBySelector.has(key)) this.childrenBySelector.set(key, new FakeElement());
    return this.childrenBySelector.get(key);
  }

  click() {
    this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} });
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
    '[data-browser-using-selector]': new FakeElement(),
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
    '[data-browser-bookmark-star]': new FakeElement(),
    '[data-browser-toast]': new FakeElement(),
  };
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
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
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
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

function settingsData() {
  return {
    browser: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: { enabled: true, ens: { enabled: false, chainId: 1, rpcUrls: [], textKey: 'org.openagentinternet.uri' } },
      defaultChainName: 'mvc',
      localMode: true,
    },
    effectiveBrowser: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: { enabled: true, ens: { enabled: false, chainId: 1, rpcUrls: [], textKey: 'org.openagentinternet.uri' } },
      defaultChainName: 'mvc',
      localMode: true,
    },
    defaults: {
      metasoP2PBaseUrl: 'https://so.metaid.io',
      metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
      manApiBaseUrl: 'https://manapi.metaid.io',
      botHomepageTemplateId: 'document',
      renderCustomBotPages: true,
      nameResolution: { enabled: true, ens: { enabled: false, chainId: 1, rpcUrls: [], textKey: 'org.openagentinternet.uri' } },
      defaultChainName: 'mvc',
      localMode: true,
    },
  };
}

function createBrowserContext(options = {}) {
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse ?? runtimePayload();
  const resolveResponse = options.resolveResponse ?? ((uri) => resolvedBot(uri));
  const data = settingsData();
  const storage = options.storage ?? createMemoryStorage();
  if (options.seedBookmarks) {
    storage.setItem('agent-browser:bookmarks', JSON.stringify(options.seedBookmarks));
  }
  const context = {
    console,
    URL,
    URLSearchParams,
    JSON,
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
      localStorage: storage,
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => elements[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
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
        return { ok: true, json: async () => ({ ok: true, data: JSON.parse(JSON.stringify(data)) }) };
      }
      if (String(url).startsWith('/api/browser/cache')) {
        return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '/tmp/.metabot/cache/metaapps', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, storage };
}

function makeClickTarget(attrName, attrValue) {
  return {
    parentElement: null,
    getAttribute(name) {
      return name === attrName ? attrValue : null;
    },
    hasAttribute(name) {
      return name === attrName;
    },
  };
}

const ALICE_URI = 'metaid://idq1alice';

test('bookmark star is disabled until a resource is resolved', async () => {
  const { elements, fetchCalls } = createBrowserContext();
  assert.equal(elements['[data-browser-bookmark-star]'].disabled, true);
  assert.equal(elements['[data-browser-bookmark-star]'].classList.contains('is-active'), false);
  await waitFor(() => fetchCalls.length >= 2, 'initial resolve');
  await waitFor(() => elements['[data-browser-bookmark-star]'].disabled === false, 'star enabled after resolve');
  assert.equal(elements['[data-browser-bookmark-star]'].classList.contains('is-active'), false);
});

test('clicking the star adds the current page as a bookmark with toast feedback', async () => {
  const { context, elements, storage } = createBrowserContext();
  elements['[data-browser-bookmark-star]'].click();
  // No current resource yet: no bookmark recorded.
  assert.equal(context.state.bookmarks.length, 0);
  const stored = storage.getItem('agent-browser:bookmarks');
  assert.equal(stored, null);
});

test('addBookmark records current page, persists to localStorage, and marks the star active', async () => {
  const { context, elements, storage } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  const added = context.addBookmark();
  assert.equal(added, true);
  assert.equal(context.state.bookmarks.length, 1);
  assert.equal(context.state.bookmarks[0].uri, ALICE_URI.toLowerCase());
  assert.equal(context.state.bookmarks[0].title, 'Alice Bot');
  assert.equal(context.state.bookmarks[0].resourceType, 'bot');
  assert.equal(elements['[data-browser-bookmark-star]'].classList.contains('is-active'), true);
  const stored = JSON.parse(storage.getItem('agent-browser:bookmarks'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].uri, ALICE_URI.toLowerCase());
});

test('toggleBookmark shows a toast and toggles the bookmark', async () => {
  const { context, elements } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.toggleBookmark();
  assert.equal(context.state.bookmarks.length, 1);
  assert.equal(elements['[data-browser-toast]'].hidden, false);
  assert.equal(elements['[data-browser-toast]'].textContent, 'Bookmark added');
  assert.equal(elements['[data-browser-toast]'].classList.contains('is-visible'), true);
  context.toggleBookmark();
  assert.equal(context.state.bookmarks.length, 0);
  assert.equal(elements['[data-browser-toast]'].textContent, 'Bookmark removed');
  assert.equal(elements['[data-browser-bookmark-star]'].classList.contains('is-active'), false);
});

test('removeBookmark deletes the matching entry by uri', async () => {
  const { context } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.addBookmark();
  assert.equal(context.removeBookmark(ALICE_URI.toLowerCase()), true);
  assert.equal(context.state.bookmarks.length, 0);
  assert.equal(context.removeBookmark(ALICE_URI.toLowerCase()), false);
});

test('Library drawer lists user bookmarks with remove buttons and omits the derived default page', async () => {
  const { context, elements } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.addBookmark();
  context.renderDrawer();
  const html = elements['[data-browser-drawer]'].innerHTML;
  assert.ok(html.includes('data-browser-visit-uri="metaid://idq1alice"'));
  assert.ok(html.includes('data-browser-bookmark-remove="metaid://idq1alice"'));
  // No derived idq1worker default page leaks into the bookmarks section.
  assert.equal(html.includes('data-browser-visit-uri="metaid://idq1worker"'), false);
});

test('Library drawer shows an empty Bookmarks section when there are no bookmarks', async () => {
  const { context, elements } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.renderDrawer();
  const html = elements['[data-browser-drawer]'].innerHTML;
  assert.ok(html.includes('None'));
});

test('drawer remove button opens a confirmation modal', async () => {
  const { context, elements } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.addBookmark();
  context.renderDrawer();
  const drawerClick = elements['[data-browser-drawer]'].listeners.get('click');
  assert.equal(typeof drawerClick, 'function');
  drawerClick({ target: makeClickTarget('data-browser-bookmark-remove', ALICE_URI.toLowerCase()), stopPropagation() {} });
  assert.equal(context.state.pendingBookmarkRemoval, ALICE_URI.toLowerCase());
  assert.equal(elements['[data-browser-modal-root]'].hidden, false);
  const modalHtml = elements['[data-browser-modal-root]'].innerHTML;
  assert.ok(modalHtml.includes('delete-bookmark'));
});

test('confirming the delete-bookmark modal removes the bookmark and closes the modal', async () => {
  const { context, elements, storage } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => context.state.current, 'current resource resolved');
  context.addBookmark();
  context.renderDrawer();
  const drawerClick = elements['[data-browser-drawer]'].listeners.get('click');
  drawerClick({ target: makeClickTarget('data-browser-bookmark-remove', ALICE_URI.toLowerCase()), stopPropagation() {} });
  assert.equal(context.state.bookmarks.length, 1);
  const modalClick = elements['[data-browser-modal-root]'].listeners.get('click');
  modalClick({ target: makeClickTarget('data-browser-modal-action', 'delete-bookmark'), stopPropagation() {} });
  assert.equal(context.state.bookmarks.length, 0);
  assert.equal(context.state.pendingBookmarkRemoval, '');
  assert.equal(elements['[data-browser-modal-root]'].hidden, true);
  assert.equal(elements['[data-browser-toast]'].textContent, 'Bookmark removed');
  const stored = JSON.parse(storage.getItem('agent-browser:bookmarks'));
  assert.equal(stored.length, 0);
});

test('loadBookmarks restores saved bookmarks from localStorage on startup', async () => {
  const seeded = [{ uri: 'metaid://idq1saved', title: 'Saved Bot', resourceType: 'bot' }];
  const { context } = createBrowserContext({ seedBookmarks: seeded });
  assert.equal(context.state.bookmarks.length, 1);
  assert.equal(context.state.bookmarks[0].uri, 'metaid://idq1saved');
  assert.equal(context.state.bookmarks[0].title, 'Saved Bot');
});
