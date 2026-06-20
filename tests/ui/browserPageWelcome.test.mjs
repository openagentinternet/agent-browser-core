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
    this.classList = {
      add: (...names) => { for (const name of names) this.attrs[`class:${name}`] = true; },
      remove: (...names) => { for (const name of names) delete this.attrs[`class:${name}`]; },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true; else delete this.attrs[`class:${name}`];
      },
      contains: (name) => Boolean(this.attrs[`class:${name}`]),
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
}

function waitFor(condition, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - startedAt > 1000) { reject(new Error(`Timed out waiting for ${label}`)); return; }
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
    '[data-browser-status-proof]': new FakeElement(),
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
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
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

// Runtime with an actor but NO defaultUri — triggers the welcome page.
function welcomeRuntime(overrides = {}) {
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor],
      defaultActor,
      defaultUri: null,
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: {
        actorChip: 'Using',
        noActorTitle: 'No Bot',
        noActorBody: 'Create a local Bot before using Browser actions.',
      },
      ...overrides,
    },
  };
}

function settingsData() {
  return {
    browser: { botHomepageTemplateId: 'document', localMode: true },
    effectiveBrowser: { botHomepageTemplateId: 'document', localMode: true },
    defaults: { botHomepageTemplateId: 'document', localMode: true },
  };
}

function createBrowserContext(options = {}) {
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse ?? welcomeRuntime();
  const storage = options.storage ?? createMemoryStorage();
  if (options.seedBookmarks) {
    storage.setItem('agent-browser:bookmarks', JSON.stringify(options.seedBookmarks));
  }
  const context = {
    console, URL, URLSearchParams, JSON, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
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
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimeResponse };
      if (String(url).startsWith('/api/browser/settings')) return { ok: true, json: async () => ({ ok: true, data: settingsData() }) };
      if (String(url).startsWith('/api/browser/cache')) return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '/tmp', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, storage };
}

test('welcome page renders when runtime has no defaultUri and no initial URI', async () => {
  const { elements, fetchCalls } = createBrowserContext();
  await waitFor(() => fetchCalls.includes('/api/browser/runtime'), 'runtime load');
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  assert.match(elements['[data-browser-viewport]'].innerHTML, /browser-welcome/);
  assert.equal(elements['[data-browser-bookmark-star]'].disabled, true);
});

test('welcome page shows the two official recommendations', async () => {
  const { elements } = createBrowserContext();
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  assert.match(html, /metaapp:\/\/agent-browser/);
  assert.match(html, /metaid:\/\/docsbot/);
  assert.match(html, /Agent Browser/);
  assert.match(html, /Docs Bot/);
});

test('welcome page official tiles use data-browser-map-link so viewport delegation navigates', async () => {
  const { elements } = createBrowserContext();
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  // data-browser-map-link is the attribute the viewport click handler delegates to navigateTo.
  assert.match(html, /data-browser-map-link/);
});

test('welcome page with seeded bookmarks shows bookmark tiles before official tiles', async () => {
  const { elements } = createBrowserContext({
    seedBookmarks: [{ uri: 'metaid://idq1alice', title: 'Alice Bot', resourceType: 'bot' }],
  });
  await waitFor(() => elements['[data-browser-viewport]'].innerHTML.includes('browser-welcome'), 'welcome render');
  const html = elements['[data-browser-viewport]'].innerHTML;
  const alicePos = html.indexOf('Alice Bot');
  const officialPos = html.indexOf('Agent Browser');
  assert.ok(alicePos > -1, 'bookmark tile rendered');
  assert.ok(officialPos > -1, 'official tile rendered');
  assert.ok(alicePos < officialPos, 'bookmark tile precedes official tile');
});
