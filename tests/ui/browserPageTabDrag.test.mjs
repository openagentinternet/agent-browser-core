import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');
const { renderBrowserPageHtml } = require('../../packages/ui/dist/browser/page.js');

// Minimal DOM used by the served Browser script. The tab strip is rebuilt from
// renderTabs()'s markup string, so the container parses that one shape into tab
// nodes; everything else only needs the API surface the page touches at boot.
class FakeStyle {
  constructor() {
    this.transform = '';
    this.transition = '';
    this.left = '';
    this.display = '';
    this.width = '';
    this.height = '';
  }
  setProperty(name, value) { this[name] = String(value); }
  removeProperty(name) { delete this[name]; }
}

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.attrs = new Map();
    this.listeners = new Map();
    this.listenerPhases = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = new FakeStyle();
    this._classes = new Set();
    this._innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.scrollLeft = 0;
    this.value = '';
    this.classList = {
      add: (...names) => { for (const name of names) this._classes.add(name); },
      remove: (...names) => { for (const name of names) this._classes.delete(name); },
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (next) this._classes.add(name); else this._classes.delete(name);
      },
    };
  }
  get parentElement() { return this.parentNode; }
  get className() { return Array.from(this._classes).join(' '); }
  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    if (this.attrs.has('data-browser-tabs-container')) this.parseTabStrip(this._innerHTML);
  }
  parseTabStrip(markup) {
    const chunks = markup.split('<div class="browser-tab').slice(1);
    for (const chunk of chunks) {
      const head = chunk.slice(0, chunk.indexOf('>'));
      const classMatch = head.match(/class="([^"]*)"/);
      const idMatch = head.match(/data-tab-id="(\d+)"/);
      if (!idMatch) continue;
      const tab = new FakeNode('div');
      tab.className = classMatch ? classMatch[1] : 'browser-tab';
      for (const token of head.match(/[a-z-]+="[^"]*"/g) || []) {
        const [name, ...rest] = token.split('=');
        tab.setAttribute(name, rest.join('=').replace(/^"|"$/g, ''));
      }
      tab.setAttribute('data-tab-id', idMatch[1]);
      const close = new FakeNode('button');
      close.className = 'browser-tab-close';
      close.setAttribute('data-tab-close', idMatch[1]);
      const closeDraggable = chunk.match(/data-tab-close="\d+" draggable="([^"]+)"/);
      close.setAttribute('draggable', closeDraggable ? closeDraggable[1] : 'true');
      tab.appendChild(close);
      this.appendChild(tab);
    }
    if (markup.includes('data-browser-tab-new')) {
      const newTab = new FakeNode('button');
      newTab.className = 'browser-tab-new';
      newTab.setAttribute('data-browser-tab-new', '');
      this.appendChild(newTab);
    }
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, anchor) {
    if (!anchor) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(anchor);
    child.parentNode = this;
    this.children.splice(index === -1 ? this.children.length : index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  contains(node) {
    let cursor = node;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }
  tabChildren() {
    return this.children.filter((child) => child._classes.has('browser-tab'));
  }
  getBoundingClientRect() {
    if (this.attrs.has('data-browser-tabs-container')) {
      return { left: 100, right: 900, top: 0, bottom: 40, width: 800, height: 40 };
    }
    const parent = this.parentNode;
    if (parent && parent.attrs.has('data-browser-tabs-container') && this._classes.has('browser-tab')) {
      const index = parent.tabChildren().indexOf(this);
      const left = 104 + index * 122;
      return { left, right: left + 120, top: 0, bottom: 40, width: 120, height: 36 };
    }
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }
  setAttribute(name, value) { this.attrs.set(String(name), String(value)); }
  getAttribute(name) { return this.attrs.has(String(name)) ? this.attrs.get(String(name)) : null; }
  hasAttribute(name) { return this.attrs.has(String(name)); }
  removeAttribute(name) { this.attrs.delete(String(name)); }
  addEventListener(type, handler, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
    this.listenerPhases.set(type, options === true || Boolean(options && options.capture));
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
  }
  querySelectorAll(selector) {
    const results = [];
    const matches = (node) => {
      if (selector === '.browser-tab') return node._classes.has('browser-tab');
      const attr = selector.match(/^\[([^\]=]+)\]$/);
      if (attr) return node.attrs.has(attr[1]);
      return false;
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
  querySelector(selector) {
    const attr = selector.match(/^\[([^\]=]+)\]$/);
    if (attr && this.attrs.has(attr[1])) return this;
    const candidates = this.querySelectorAll(selector);
    return candidates.length ? candidates[0] : null;
  }
  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (selector.startsWith('.') && cursor._classes.has(selector.slice(1))) return cursor;
      const attr = selector.match(/^\[([^\]=]+)\]$/);
      if (attr && cursor.attrs.has(attr[1])) return cursor;
      cursor = cursor.parentNode;
    }
    return null;
  }
  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() { event.defaultPrevented = true; },
      stopPropagation() {},
      ...properties,
    };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
  focus() {}
  blur() {}
  click() { this.dispatch('click'); }
}

function createElements() {
  const selectors = [
    '[data-browser-shell]', '[data-browser-page-title]', '[data-browser-uri-input]',
    '[data-browser-address-form]', '[data-browser-back]', '[data-browser-forward]',
    '[data-browser-reload]', '[data-browser-reload-wrap]', '[data-browser-reload-popover]',
    '[data-browser-drawer-toggle]', '[data-browser-resource-chip]', '[data-browser-owner-panel]',
    '[data-browser-address-icon]', '[data-browser-app-panel]', '[data-browser-using-selector]',
    '[data-browser-actor-panel]', '[data-browser-menu-trigger]', '[data-browser-menu]',
    '[data-browser-viewport]', '[data-browser-status-strip]', '[data-browser-status-state]',
    '[data-browser-status-renderer]', '[data-browser-status-txid]', '[data-browser-drawer]',
    '[data-browser-inspector]', '[data-browser-modal-root]', '[data-browser-toast]',
    '[data-browser-tabstrip]', '[data-browser-tabs-container]', '[data-browser-tab-new]',
    '[data-browser-tab-context-menu]', '[data-browser-tabs-trigger]', '[data-browser-tabs-panel]',
    '[data-browser-tabs-count]', '[data-browser-bookmark-star]', '[data-browser-picker-toggle]',
    '[data-browser-picker-panel]', '[data-browser-auto-write]', '[data-browser-app-session]',
  ];
  const nodes = new Map();
  for (const selector of selectors) {
    const node = new FakeNode();
    node.setAttribute(selector.slice(1, -1), '');
    nodes.set(selector, node);
  }
  nodes.get('[data-browser-tab-context-menu]').hidden = true;
  nodes.get('[data-browser-tabs-panel]').hidden = true;
  return nodes;
}

function resolvedBot(uri, name) {
  return {
    ok: true,
    data: {
      uri,
      normalizedUri: uri.toLowerCase(),
      resourceType: 'bot',
      title: name,
      owner: { kind: 'bot', globalMetaId: 'idq1alice', name, verificationState: 'verified' },
      renderer: {
        type: 'bot-page',
        contentType: 'application/vnd.oac.bot-homepage+json',
        templateId: 'document',
        data: { profile: { name } },
      },
      status: { state: 'resolved', verificationState: 'verified', message: '' },
      source: { resolver: 'test' },
      actions: [],
    },
  };
}

const runtimePayload = {
  ok: true,
  data: {
    host: { kind: 'oac', name: 'Open Agent Connect', localMode: true },
    actors: [{
      id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
      isDefault: true, capabilities: [],
    }],
    defaultActor: {
      id: 'worker', label: 'Worker Bot', kind: 'oac-bot', globalMetaId: 'idq1worker',
      isDefault: true, capabilities: [],
    },
    defaultUri: null,
    features: {},
    labels: {},
  },
};

function createStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createBrowserContext(options = {}) {
  const elements = createElements();
  const storage = createStorage(options.storage);
  const documentListeners = new Map();
  const documentElement = new FakeNode('html');
  documentElement.setAttribute('data-browser-theme', 'light');
  documentElement.setAttribute('data-browser-resolved-theme', 'light');
  const body = new FakeNode('body');
  const head = new FakeNode('head');
  const context = {
    console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    Promise, Error, setTimeout, clearTimeout,
    window: {
      location: { pathname: '/ui/browser', search: '' },
      history: { replaceState() {} },
      parent: { postMessage() {} },
      localStorage: storage,
      setTimeout, clearTimeout,
      addEventListener() {},
      matchMedia(query) {
        const matches = Boolean(options.narrow) && query === '(max-width: 768px)';
        return { matches, media: query, addEventListener() {}, addListener() {} };
      },
    },
    document: {
      readyState: 'complete',
      title: '',
      documentElement,
      body,
      head,
      querySelector(selector) {
        if (elements.has(selector)) return elements.get(selector);
        const created = new FakeNode();
        created.setAttribute(selector.slice(1, -1), '');
        elements.set(selector, created);
        return created;
      },
      querySelectorAll() { return []; },
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(handler);
      },
      createElement(tagName) { return new FakeNode(tagName); },
    },
    fetch: async (url) => {
      if (String(url).startsWith('/api/browser/runtime')) return { ok: true, json: async () => runtimePayload };
      if (String(url).startsWith('/api/browser/resolve')) {
        const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
        return { ok: true, json: async () => resolvedBot(uri, uri.replace(/^metaid:\/\//, 'Bot ')) };
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
  return { context, elements, storage };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stripTabs(container) {
  return container.tabChildren();
}

function stripIds(container) {
  return stripTabs(container).map((tab) => Number(tab.getAttribute('data-tab-id')));
}

function tabNode(container, tabId) {
  return stripTabs(container).find((tab) => Number(tab.getAttribute('data-tab-id')) === tabId) || null;
}

// Reuse the boot seed tab for the first URI, then open the rest, so the strip
// holds exactly the requested tabs (the page always keeps one seed tab alive).
async function openTabs(contextWrapper, uris) {
  const { context } = contextWrapper;
  context.navigateTo(uris[0]);
  await settle();
  for (const uri of uris.slice(1)) {
    context.AgentBrowserTabs.openTab(uri);
    await settle();
  }
}

function dataTransfer() {
  return {
    effectAllowed: '',
    dropEffect: '',
    setData() {},
  };
}

test('tab strip arms drag on tabs; the close button is its own canceled drag source', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const tabs = stripTabs(container);
  assert.equal(tabs.length, 2);
  // Chromium only establishes a drop target when dragenter is canceled from the
  // bubble phase; keep that binding pinned.
  assert.equal(container.listenerPhases.get('dragenter'), false);
  assert.equal(container.listenerPhases.get('dragover'), true);
  for (const tab of tabs) {
    assert.equal(tab.getAttribute('draggable'), 'true');
    const close = tab.querySelectorAll('[data-tab-close]')[0];
    assert.ok(close, 'tab keeps its close button');
    // The close button carries draggable=true so a drag that starts on it
    // reports the button as the drag source and dragstart can cancel it; a
    // draggable=false child would still start the parent tab's drag in Chromium.
    assert.equal(close.getAttribute('draggable'), 'true');
  }
});

test('dragstart marks the tab without relocating it (native drag stays alive)', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const first = stripTabs(container)[0];
  const parentBefore = first.parentNode;

  container.dispatch('dragstart', { target: first, clientX: 110, dataTransfer: dataTransfer() });

  assert.ok(first.classList.contains('is-dragging'));
  // Owner-final motion: the source never leaves its layout position — only the
  // opacity class changes. Relocating it makes Chromium cancel the native drag.
  assert.ok(!first.style.position, 'the dragged tab must never be repositioned');
  assert.equal(first.parentNode, parentBefore, 'the dragged tab must not move in the DOM');
  const line = container.children.find((child) => child.classList.contains('browser-tab-insert-line'));
  assert.equal(line, undefined, 'there is no insertion line any more');
});

test('dragover yields the neighbours one slot toward the pointer', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b', 'metaid://c']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const tabs = stripTabs(container);

  container.dispatch('dragstart', { target: tabs[0], clientX: 110, dataTransfer: dataTransfer() });
  // Pointer past the last tab's midpoint (tab 2 spans 348..468): boundary 3.
  container.dispatch('dragover', { target: tabs[2], clientX: 460, dataTransfer: dataTransfer() });

  assert.equal(tabs[1].style.transform, 'translateX(-122px)');
  assert.equal(tabs[2].style.transform, 'translateX(-122px)');
  assert.equal(tabs[0].style.transform, '');
  const line = container.children.find((child) => child.classList.contains('browser-tab-insert-line'));
  assert.equal(line, undefined, 'the yield is the only insertion expression');
});

test('a middle tab combines collapse and opening on the same transform', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b', 'metaid://c']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const tabs = stripTabs(container);

  // Drag the middle tab to the far left: the tab AFTER the origin collapses
  // left, the opening at boundary 0 pushes the first tab right — net +slot for
  // the left neighbour, 0 for the right one.
  container.dispatch('dragstart', { target: tabs[1], clientX: 240, dataTransfer: dataTransfer() });
  container.dispatch('dragover', { target: tabs[0], clientX: 0, dataTransfer: dataTransfer() });

  assert.equal(tabs[0].style.transform, 'translateX(122px)', 'left neighbour opens the slot');
  assert.equal(tabs[1].style.transform, '', 'the source itself is never transformed');
  assert.equal(tabs[2].style.transform, '', 'collapse and opening cancel for the right neighbour');
});

test('drop rewrites state.tabs, re-renders the strip and persists the URI order', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b', 'metaid://c']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const before = stripTabs(container);
  const draggedId = Number(before[0].getAttribute('data-tab-id'));

  container.dispatch('dragstart', { target: before[0], clientX: 110, dataTransfer: dataTransfer() });
  container.dispatch('dragover', { target: before[2], clientX: 460, dataTransfer: dataTransfer() });
  container.dispatch('drop', { target: before[2], clientX: 460, dataTransfer: dataTransfer() });

  const stateIds = Array.from(wrapper.context.state.tabs, (tab) => tab.id);
  assert.equal(stateIds[stateIds.length - 1], draggedId, 'dragged tab moved to the end');
  const after = stripTabs(container);
  assert.deepEqual(
    after.map((tab) => Number(tab.getAttribute('data-tab-id'))),
    stateIds,
    'strip re-rendered in the new order',
  );
  for (const tab of after) assert.equal(tab.style.transform, '', 'no FLIP residue after settle');
  assert.deepEqual(
    JSON.parse(wrapper.storage.getItem('agent-browser:tab-order')),
    ['metaid://b', 'metaid://c', 'metaid://a'],
  );
});

test('drop on the tab original slot is a no-op and writes nothing', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const tabs = stripTabs(container);
  const orderBefore = stripIds(container);

  container.dispatch('dragstart', { target: tabs[1], clientX: 240, dataTransfer: dataTransfer() });
  container.dispatch('dragover', { target: tabs[1], clientX: 240, dataTransfer: dataTransfer() });
  container.dispatch('drop', { target: tabs[1], clientX: 240, dataTransfer: dataTransfer() });

  assert.deepEqual(stripIds(container), orderBefore);
  assert.equal(wrapper.storage.getItem('agent-browser:tab-order'), null);
});

test('an unpinned tab cannot be dropped into the pinned segment', async () => {
  const wrapper = createBrowserContext();
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b', 'metaid://c']);
  const { context } = wrapper;
  const pinnedTab = context.state.tabs[0];
  pinnedTab.pinned = true;
  context.AgentBrowserTabs.switchTab(pinnedTab.id);
  await settle();

  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const visible = stripTabs(container);
  assert.equal(Number(visible[0].getAttribute('data-tab-id')), pinnedTab.id, 'pinned tab renders first');
  const draggedId = Number(visible[2].getAttribute('data-tab-id'));

  container.dispatch('dragstart', { target: visible[2], clientX: 380, dataTransfer: dataTransfer() });
  container.dispatch('dragover', { target: visible[0], clientX: 106, dataTransfer: dataTransfer() });
  container.dispatch('drop', { target: visible[0], clientX: 106, dataTransfer: dataTransfer() });

  const order = Array.from(wrapper.context.state.tabs, (tab) => tab.id);
  assert.equal(order[0], pinnedTab.id, 'pinned tab keeps the first slot');
  assert.equal(order.indexOf(draggedId), 1, 'dropped tab lands right after the pinned segment');
  assert.equal(
    Number(stripTabs(container)[0].getAttribute('data-tab-id')),
    pinnedTab.id,
    'rendered strip still leads with the pinned tab',
  );
});

test('saved URI order replays as a relative order on the next page load', async () => {
  const saved = JSON.stringify(['metaid://c', 'metaid://a', 'metaid://b']);
  const wrapper = createBrowserContext({ storage: { 'agent-browser:tab-order': saved } });
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b', 'metaid://c']);

  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const order = Array.from(wrapper.context.state.tabs, (tab) => tab.current && tab.current.uri);
  assert.deepEqual(order, ['metaid://c', 'metaid://a', 'metaid://b']);
  assert.deepEqual(
    stripTabs(container).map((tab) => Number(tab.getAttribute('data-tab-id'))),
    Array.from(wrapper.context.state.tabs, (tab) => tab.id),
  );
  assert.equal(wrapper.storage.getItem('agent-browser:tab-order'), saved, 'a restore never rewrites the saved list');
});

test('below the 768px strip breakpoint drag is not armed', async () => {
  const wrapper = createBrowserContext({ narrow: true });
  await settle();
  await openTabs(wrapper, ['metaid://a', 'metaid://b']);
  const container = wrapper.elements.get('[data-browser-tabs-container]');
  const tabs = stripTabs(container);
  for (const tab of tabs) assert.notEqual(tab.getAttribute('draggable'), 'true');

  container.dispatch('dragstart', { target: tabs[0], clientX: 110, dataTransfer: dataTransfer() });
  assert.equal(tabs[0].classList.contains('is-dragging'), false);
});

test('tab drag motion CSS matches the contract and is injected before dark overrides', async () => {
  const cssSource = readFileSync(new URL('../../packages/ui/src/browser/tabDragCss.ts', import.meta.url), 'utf8');
  assert.match(cssSource, /transition: transform 150ms cubic-bezier\(0\.2, 0, 0, 1\)/);
  assert.match(cssSource, /opacity 120ms ease-out/);
  assert.match(cssSource, /transform: scale\(1\.02\) translateY\(-1px\)/);
  assert.match(cssSource, /border-color: var\(--browser-accent\)/);
  assert.match(cssSource, /opacity: \.05/);
  assert.match(cssSource, /prefers-reduced-motion: reduce/);
  assert.match(cssSource, /transition: none !important/);
  assert.doesNotMatch(cssSource, /browser-tab-insert-line/, 'the insertion line is deleted (owner ruling)');
  assert.doesNotMatch(cssSource, /box-shadow/);

  const html = await renderBrowserPageHtml();
  const dragIndex = html.indexOf('.browser-tab.is-dragging {');
  const darkIndex = html.indexOf('html[data-browser-resolved-theme="dark"] .browser-shell {');
  assert.ok(dragIndex !== -1, 'tab drag CSS is served');
  assert.ok(darkIndex !== -1, 'dark theme CSS is served');
  assert.ok(dragIndex < darkIndex, 'tab drag CSS is injected before dark overrides');
});
