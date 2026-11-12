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
  addEventListener(eventName, handler) { this.listeners.set(eventName, handler); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) { return this.childrenBySelector.get(selector) || null; }
  setChild(selector, value) { this.childrenBySelector.set(selector, value); }
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

function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
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
      location: options.pageLocation || { search: '?uri=preview-file%3A%2F%2Flocalhost%2Ftmp%2Fa.md', href: 'http://127.0.0.1:8787/browser', origin: 'http://127.0.0.1:8787' },
      history: { replaceState() {} },
      addEventListener() {},
    },
    document: {
      readyState: 'complete',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => new FakeElement(),
    },
    fetch: async (url) => {
      if (String(url).startsWith('/api/browser/resolve')) {
        return { ok: true, json: async () => ({ ok: true, data: resolvePayload }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes };
}

function result(renderer, overrides = {}) {
  return {
    uri: 'preview-file://localhost/tmp/a.md',
    normalizedUri: 'preview-file://localhost/tmp/a.md',
    resourceType: 'document',
    title: 'a.md',
    owner: { kind: 'unknown', globalMetaId: '', name: 'Local File', verificationState: 'unverified' },
    renderer,
    status: { state: 'resolved', verificationState: 'unverified', message: '' },
    source: { resolver: 'preview-file' },
    actions: [],
    ...overrides,
  };
}

test('file-viewer renderer emits a scriptless sandboxed iframe with the theme query', async () => {
  const { nodes } = runWithResolve(result({
    type: 'file-viewer',
    contentType: 'text/markdown; charset=utf-8',
    url: 'http://127.0.0.1:9311/api/browser/preview-assets/sess-1/a.md?abc-viewer=1',
    data: { kind: 'markdown', path: '/tmp/a.md' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-file-viewer'), 'file viewer iframe');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /<iframe class="browser-file-viewer"/);
  assert.match(html, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(html, /allow-scripts/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.match(html, /abcTheme=(light|dark)/);
});

test('file-viewer without a URL renders the blocked state', async () => {
  const { nodes } = runWithResolve(result({
    type: 'file-viewer',
    contentType: 'text/markdown; charset=utf-8',
  }));
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Renderer URL blocked'), 'blocked state');
});

test('video renderer with a direct URL emits a video element', async () => {
  const { nodes } = runWithResolve(result({
    type: 'video',
    contentType: 'video/mp4',
    url: 'http://127.0.0.1:9311/api/browser/preview-assets/sess-1/clip.mp4',
    data: { kind: 'video', path: '/tmp/clip.mp4' },
  }, {
    uri: 'preview-file://localhost/tmp/clip.mp4',
    normalizedUri: 'preview-file://localhost/tmp/clip.mp4',
  }));
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<video'), 'video element');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /<video controls src="http:\/\/127\.0\.0\.1:9311\/api\/browser\/preview-assets\/sess-1\/clip\.mp4"/);
});

test('audio renderer with a direct URL emits an audio element', async () => {
  const { nodes } = runWithResolve(result({
    type: 'audio',
    contentType: 'audio/mpeg',
    url: 'http://127.0.0.1:9311/api/browser/preview-assets/sess-1/song.mp3',
    data: { kind: 'audio', path: '/tmp/song.mp3' },
  }, {
    uri: 'preview-file://localhost/tmp/song.mp3',
    normalizedUri: 'preview-file://localhost/tmp/song.mp3',
  }));
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<audio'), 'audio element');
});
