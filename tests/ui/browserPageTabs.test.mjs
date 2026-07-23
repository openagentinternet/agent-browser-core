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
      add: (...names) => { for (const name of names) this.attrs[`class:${name}`] = true; },
      remove: (...names) => { for (const name of names) delete this.attrs[`class:${name}`]; },
      toggle: (name, force) => {
        const next = force === undefined ? !this.attrs[`class:${name}`] : Boolean(force);
        if (next) this.attrs[`class:${name}`] = true; else delete this.attrs[`class:${name}`];
      },
    };
  }
  get value() { return this._value; }
  set value(value) { const next = String(value); this._value = next; this.valueHistory.push(next); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.textContent = this._innerHTML.replace(/<[^>]*>/g, ''); }
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  querySelector(selector) {
    const match = String(selector).match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    if (!match) return null;
    const [, attribute, value] = match;
    const key = value === undefined ? attribute : `${attribute}:${value}`;
    if (!this.children) this.children = new Map();
    if (!this.children.has(key)) this.children.set(key, new FakeElement());
    return this.children.get(key);
  }
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
  submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
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
  const els = {};
  const selectors = [
    '[data-browser-shell]', '[data-browser-page-title]', '[data-browser-uri-input]',
    '[data-browser-address-form]', '[data-browser-back]', '[data-browser-forward]',
    '[data-browser-reload]', '[data-browser-drawer-toggle]', '[data-browser-resource-chip]',
    '[data-browser-owner-panel]', '[data-browser-using-selector]', '[data-browser-actor-panel]',
    '[data-browser-menu-trigger]', '[data-browser-menu]', '[data-browser-viewport]',
    '[data-browser-status-strip]', '[data-browser-status-state]', '[data-browser-status-renderer]',
    '[data-browser-status-txid]', '[data-browser-drawer]', '[data-browser-inspector]',
    '[data-browser-modal-root]', '[data-browser-toast]', '[data-browser-tabstrip]',
    '[data-browser-tabs-container]', '[data-browser-tab-new]',
  ];
  for (const s of selectors) els[s] = new FakeElement();
  return els;
}

function resolvedBot(uri, name) {
  name = name || 'Alice Bot';
  return {
    ok: true,
    data: {
      uri, normalizedUri: uri.toLowerCase(), resourceType: 'bot', title: name,
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name, verificationState: 'verified' },
      renderer: { type: 'bot-page', contentType: 'application/vnd.oac.bot-homepage+json', templateId: 'document', data: { profile: { name } } },
      status: { state: 'resolved', verificationState: 'verified', message: '' },
      source: { resolver: 'test' }, actions: [],
    },
  };
}

const defaultActor = {
  id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
  isDefault: true, capabilities: ['private-chat', 'service-call', 'template-settings'],
};

function runtimePayload(overrides) {
  overrides = overrides || {};
  const actor = overrides.defaultActor === undefined ? defaultActor : overrides.defaultActor;
  return {
    ok: true,
    data: {
      host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
      actors: [defaultActor], defaultActor: actor,
      defaultUri: actor && actor.globalMetaId ? `metaid://${actor.globalMetaId}` : null,
      features: { privateChat: true, serviceCall: true, cacheManagement: true, templateSettings: true, walletLogin: false },
      labels: { actorChip: 'Using', noActorTitle: 'No Bot', noActorBody: 'Create a local Bot.', noActorAction: { label: 'Create Bot', href: '/ui/bot' } },
      ...overrides,
    },
  };
}

function createBrowserContext(options) {
  options = options || {};
  const elements = createElements();
  const fetchCalls = [];
  const runtimeResponse = options.runtimeResponse || runtimePayload();
  const resolveResponse = options.resolveResponse || ((uri) => resolvedBot(uri));
  const documentListeners = new Map();
  const context = {
    console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    Promise, String, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
      history: { replaceState() {} },
    },
    document: {
      readyState: 'complete', title: 'Agent Internet Browser',
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      addEventListener: (eventName, handler) => {
        if (!documentListeners.has(eventName)) documentListeners.set(eventName, []);
        documentListeners.get(eventName).push(handler);
      },
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimeResponse };
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        const payload = typeof resolveResponse === 'function' ? resolveResponse(uri) : resolveResponse;
        return { ok: true, json: async () => payload };
      }
      if (String(url).startsWith('/api/browser/settings')) {
        return { ok: true, json: async () => ({ ok: true, data: { browser: {}, effectiveBrowser: {}, defaults: {} } }) };
      }
      if (String(url).startsWith('/api/browser/cache')) {
        return { ok: true, json: async () => ({ ok: true, data: { cacheRoot: '-', artifactCount: 0, pinRecordCount: 0, totalBytes: 0, artifacts: [] } }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
  context.globalThis = context;
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, elements, fetchCalls, documentListeners };
}

test('single tab navigation resolves and sets state.current on the active tab', async () => {
  const { elements, fetchCalls } = createBrowserContext({ search: '?uri=metaid%3A%2F%2Fidq1alice' });
  await waitFor(() => fetchCalls.length === 2, 'runtime and resolve');
  assert.equal(elements['[data-browser-uri-input]'].value, 'metaid://idq1alice');
  assert.equal(fetchCalls[1], '/api/browser/resolve?uri=metaid%3A%2F%2Fidq1alice&actorId=worker');
});
