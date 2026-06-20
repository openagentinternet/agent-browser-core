import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

const DERIVED_TXID = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const DERIVED_PIN_ID = `${DERIVED_TXID}i0`;

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
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
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
    '[data-browser-resource-chip]': new FakeElement(),
    '[data-browser-using-selector]': new FakeElement(),
    '[data-browser-menu-trigger]': new FakeElement(),
    '[data-browser-menu]': new FakeElement(),
    '[data-browser-viewport]': new FakeElement(),
    '[data-browser-status-state]': new FakeElement(),
    '[data-browser-status-proof]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
  };
}

function browserResult(uri, overrides = {}) {
  return {
    uri,
    normalizedUri: uri.toLowerCase(),
    resourceType: 'bot',
    title: 'Fixture Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1fixturebot', name: 'Fixture Bot', verificationState: 'partial' },
    renderer: { type: 'unsupported', contentType: 'application/octet-stream', error: 'Unsupported MetaApp content type.' },
    status: { state: 'resolved', verificationState: 'partial', message: '' },
    proof: {
      txid: 'txid-fixture',
      pinId: 'pin-fixture',
      protocolPath: '/info/bio',
      contentHash: 'sha256:bio',
      publisherGlobalMetaId: 'idq1fixturebot',
      explorerUrl: 'https://explorer.example/txid-fixture',
      verificationState: 'partial',
    },
    source: { resolver: 'test-resolver', url: 'https://resolver.example', raw: { ok: true } },
    actions: [],
    ...overrides,
  };
}

function createContext(overrides = {}) {
  const nodes = elements();
  const responses = new Map([
    ['metaid://idq1fixturebot', browserResult('metaid://idq1fixturebot')],
    ['metaapp://pin', browserResult('metaapp://pin', {
      resourceType: 'metaapp',
      title: 'Fixture MetaApp',
      owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1publisher', name: 'Publisher', verificationState: 'partial' },
    })],
    [`metaapp://${DERIVED_PIN_ID}`, browserResult(`metaapp://${DERIVED_PIN_ID}`, {
      resourceType: 'metaapp',
      title: 'Derived TXID MetaApp',
      owner: { kind: 'metaapp-publisher', globalMetaId: 'idq1publisher', name: 'Publisher', verificationState: 'partial' },
      proof: {
        pinId: DERIVED_PIN_ID,
        protocolPath: '/protocols/metaapp',
        publisherGlobalMetaId: 'idq1publisher',
        verificationState: 'partial',
      },
    })],
  ]);
  for (const [uri, result] of Object.entries(overrides.responses ?? {})) {
    responses.set(uri, result);
  }
  const failures = overrides.failures ?? {};
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
    window: { location: { search: '?uri=metaid%3A%2F%2Fidq1fixturebot' }, history: { replaceState() {} } },
    document: {
      readyState: 'complete',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    fetch: async (url) => {
      const uri = new URLSearchParams(String(url).split('?')[1] || '').get('uri') || '';
      if (failures[uri]) {
        return { ok: true, json: async () => failures[uri] };
      }
      return { ok: true, json: async () => ({ ok: true, data: responses.get(uri) || browserResult(uri) }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes };
}

test('Browser drawer and Inspector are hidden by default in the shell', () => {
  const definition = buildBrowserPageDefinition();
  assert.match(definition.contentHtml, /data-browser-drawer hidden/);
  assert.match(definition.contentHtml, /data-browser-inspector hidden/);
});

test('Browser chrome uses icon-only toolbar controls and avoids prototype labels', () => {
  const definition = buildBrowserPageDefinition();
  const html = definition.contentHtml;
  assert.match(html, /aria-label="Back"/);
  assert.match(html, /aria-label="Forward"/);
  assert.match(html, /aria-label="Reload"/);
  assert.match(html, /aria-label="Bookmarks and history"/);
  assert.match(html, /aria-label="Browser menu"/);
  assert.match(html, /data-browser-menu-trigger/);
  assert.match(html, /data-browser-menu[^>]*hidden/);
  assert.doesNotMatch(html, />Back</);
  assert.doesNotMatch(html, />Forward</);
  assert.doesNotMatch(html, />Reload</);
  assert.doesNotMatch(html, />Bookmarks</);
  assert.doesNotMatch(html, />Open</);
  assert.doesNotMatch(html, /Browser-owned controls/);
});

test('Drawer opens from drawer button and shows bookmarks, recents, and visit history', async () => {
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo('metaapp://pin');

  nodes['[data-browser-drawer-toggle]'].click();

  assert.equal(nodes['[data-browser-drawer]'].hidden, false);
  const html = nodes['[data-browser-drawer]'].innerHTML;
  assert.match(html, /Bookmarks/);
  assert.match(html, /Recent Bots/);
  assert.match(html, /Fixture Bot/);
  assert.match(html, /Fixture MetaApp/);
  assert.match(html, /History/);
  assert.match(html, /metaid:\/\/idq1fixturebot/);
});

test('resource chip opens creator Bot Page while proof and TXID controls still open Inspector', async () => {
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo('metaapp://pin');

  nodes['[data-browser-resource-chip]'].click();
  await waitFor(() => context.state.current && context.state.current.normalizedUri === 'metaid://idq1publisher', 'creator Bot Page navigation');
  assert.equal(nodes['[data-browser-inspector]'].hidden, true);
  assert.equal(nodes['[data-browser-inspector]'].innerHTML, '');

  nodes['[data-browser-inspector]'].innerHTML = '';
  nodes['[data-browser-status-proof]'].click();
  assert.equal(nodes['[data-browser-inspector]'].hidden, false);
  assert.match(nodes['[data-browser-inspector]'].innerHTML, /<h3>Proof<\/h3>/);

  nodes['[data-browser-inspector]'].innerHTML = '';
  nodes['[data-browser-status-txid]'].click();
  assert.match(nodes['[data-browser-inspector]'].innerHTML, /txid-fixture/);

  const defaultHtml = buildBrowserPageDefinition().contentHtml;
  assert.doesNotMatch(defaultHtml, />Proof</);
  assert.doesNotMatch(defaultHtml, />Source</);
});

test('Inspector proof labels use TXID and include proof details', async () => {
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');

  nodes['[data-browser-status-txid]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(nodes['[data-browser-status-txid]'].textContent, /TXID/);
  assert.doesNotMatch(nodes['[data-browser-status-txid]'].textContent, /TSID/);
  assert.match(html, /TXID/);
  assert.doesNotMatch(html, /TSID/);
  assert.match(html, /pin id/);
  assert.match(html, /protocol path/);
  assert.match(html, /content hash/);
  assert.match(html, /publisher GlobalMetaId/);
  assert.match(html, /block explorer action/);
  assert.match(html, /View on Block Explorer/);
});

test('Inspector summarizes homepage v3 sections', async () => {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/browser/botHomepage.v3.json', import.meta.url), 'utf8'));
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');

  context.state.current = browserResult('metaid://idq1fixturebot', {
    renderer: {
      type: 'bot-page',
      contentType: 'application/vnd.oac.bot-homepage+json',
      data: homepage,
    },
    source: {
      resolver: 'test-resolver',
      schemaVersion: 'botHomepage.v3',
      raw: homepage,
    },
    proof: {
      pinId: 'name-pin',
      protocolPath: '/info/name',
      publisherGlobalMetaId: 'idq1fixturebot',
      verificationState: 'partial',
    },
  });
  context.openInspector();

  const html = nodes['[data-browser-inspector]'].innerHTML;
  assert.match(html, /<h3>Homepage v3<\/h3>/);
  assert.match(html, /services/);
  assert.match(html, /service-current-pin/);
  assert.match(html, /buzzes/);
  assert.match(html, /buzz-pin/);
  assert.match(html, /metaapps/);
  assert.match(html, /metaapp-pin/);
});

test('Inspector renders ENS alias metadata from source raw nameAlias', async () => {
  const aliasUri = 'metaid://sunny.eth';
  const { context, nodes } = createContext({
    responses: {
      [aliasUri]: browserResult(aliasUri, {
        normalizedUri: aliasUri,
        title: 'Sunny',
        owner: { kind: 'bot', globalMetaId: 'idq1target', name: 'Sunny', verificationState: 'partial' },
        source: {
          resolver: 'metaso-p2p',
          raw: {
            nameAlias: {
              aliasUri,
              provider: 'ens',
              normalizedName: 'sunny.eth',
              textKey: 'org.openagentinternet.uri',
              canonicalUri: 'metaid://idq1target',
              resolvedAt: 1780761234567,
              verificationState: 'partial',
            },
          },
        },
      }),
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo(aliasUri);
  await waitFor(() => context.state.current && context.state.current.uri === aliasUri, 'alias resource');
  nodes['[data-browser-resource-chip]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Name Alias<\/h3>/);
  assert.match(html, /sunny\.eth/);
  assert.match(html, /org\.openagentinternet\.uri/);
  assert.match(html, /metaid:\/\/idq1target/);
  assert.match(html, /partial/);
});

test('Inspector renders ENS alias failure context after resolve error', async () => {
  const aliasUri = 'metaid://missing.eth';
  const { context, nodes } = createContext({
    failures: {
      [aliasUri]: {
        ok: false,
        state: 'failed',
        code: 'name_alias_not_found',
        message: 'ENS text record was missing or empty.',
        data: {
          inputUri: aliasUri,
          aliasName: 'missing.eth',
          provider: 'ens',
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo(aliasUri);
  await waitFor(() => context.state.lastResolveError, 'alias failure');
  nodes['[data-browser-status-proof]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Name Alias Error<\/h3>/);
  assert.match(html, /name_alias_not_found/);
  assert.match(html, /missing\.eth/);
  assert.match(html, /org\.openagentinternet\.uri/);
  assert.match(html, /metaid:\/\/missing\.eth/);
});

test('Inspector refreshes to ENS alias error when open resource resolve fails', async () => {
  const aliasUri = 'metaid://missing.eth';
  const { context, nodes } = createContext({
    failures: {
      [aliasUri]: {
        ok: false,
        state: 'failed',
        code: 'name_alias_not_found',
        message: 'ENS text record was missing or empty.',
        data: {
          inputUri: aliasUri,
          aliasName: 'missing.eth',
          provider: 'ens',
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  nodes['[data-browser-status-txid]'].click();
  assert.match(nodes['[data-browser-inspector]'].innerHTML, /txid-fixture/);

  await context.navigateTo(aliasUri);
  await waitFor(() => context.state.lastResolveError, 'alias failure');
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Name Alias Error<\/h3>/);
  assert.match(html, /name_alias_not_found/);
  assert.match(html, /missing\.eth/);
  assert.doesNotMatch(html, /txid-fixture/);
});

test('Inspector refreshes from ENS alias error to successful alias evidence', async () => {
  const badAliasUri = 'metaid://bad.eth';
  const goodAliasUri = 'metaid://good.eth';
  const { context, nodes } = createContext({
    responses: {
      [goodAliasUri]: browserResult(goodAliasUri, {
        normalizedUri: goodAliasUri,
        title: 'Good Alias Bot',
        owner: { kind: 'bot', globalMetaId: 'idq1goodalias', name: 'Good Alias Bot', verificationState: 'partial' },
        source: {
          resolver: 'metaso-p2p',
          raw: {
            nameAlias: {
              aliasUri: goodAliasUri,
              provider: 'ens',
              normalizedName: 'good.eth',
              textKey: 'org.openagentinternet.uri',
              canonicalUri: 'metaid://idq1goodalias',
              resolvedAt: 1780761234567,
              verificationState: 'partial',
            },
          },
        },
      }),
    },
    failures: {
      [badAliasUri]: {
        ok: false,
        state: 'failed',
        code: 'name_alias_not_found',
        message: 'ENS text record was missing or empty.',
        data: {
          inputUri: badAliasUri,
          aliasName: 'bad.eth',
          provider: 'ens',
          textKey: 'org.openagentinternet.uri',
        },
      },
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  nodes['[data-browser-resource-chip]'].click();

  await context.navigateTo(badAliasUri);
  await waitFor(() => context.state.lastResolveError, 'bad alias failure');
  assert.match(nodes['[data-browser-inspector]'].innerHTML, /<h3>Name Alias Error<\/h3>/);

  await context.navigateTo(goodAliasUri);
  await waitFor(() => context.state.current && context.state.current.uri === goodAliasUri, 'good alias resource');
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.doesNotMatch(html, /<h3>Name Alias Error<\/h3>/);
  assert.match(html, /<h3>Name Alias<\/h3>/);
  assert.match(html, /good\.eth/);
  assert.match(html, /metaid:\/\/idq1goodalias/);
  assert.match(html, /org\.openagentinternet\.uri/);
});

test('Inspector renders generic resolve failure context for non-alias errors', async () => {
  const failedUri = 'metaid://broken';
  const { context, nodes } = createContext({
    failures: {
      [failedUri]: {
        ok: false,
        state: 'failed',
        code: 'resolver_unavailable',
        message: 'Resolver is unavailable.',
        data: {
          inputUri: failedUri,
        },
      },
    },
  });

  await waitFor(() => context.state.current, 'initial resource');
  await context.navigateTo(failedUri);
  await waitFor(() => context.state.lastResolveError, 'generic failure');
  nodes['[data-browser-status-proof]'].click();
  const html = nodes['[data-browser-inspector]'].innerHTML;

  assert.match(html, /<h3>Resolve Error<\/h3>/);
  assert.doesNotMatch(html, /<h3>Name Alias Error<\/h3>/);
  assert.match(html, /resolver_unavailable/);
  assert.match(html, /metaid:\/\/broken/);
  assert.doesNotMatch(html, /<dt>provider<\/dt>/);
  assert.doesNotMatch(html, /<dt>name<\/dt>/);
  assert.doesNotMatch(html, /<dt>text key<\/dt>/);
});

test('Inspector TXID falls back to the proof pin transaction id', async () => {
  const { context, nodes } = createContext();
  await waitFor(() => context.state.current, 'initial resource');

  await context.navigateTo(`metaapp://${DERIVED_PIN_ID}`);
  nodes['[data-browser-status-txid]'].click();

  assert.match(
    nodes['[data-browser-inspector]'].innerHTML,
    new RegExp(`<dt>TXID</dt><dd>${DERIVED_TXID}</dd>`),
  );
});
