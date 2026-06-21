import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');

const servicePinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const buzzPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const longBuzzPinId = '8ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const multilineBuzzPinId = '9ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const metaAppPinId = 'a'.repeat(64) + 'i0';
const olderMetaAppPinId = 'b'.repeat(64) + 'i0';
const metaAppCodePinId = 'c'.repeat(64) + 'i0';
const chatPeerSunny = 'idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz';
const chatPeerDon = 'idq1kwa7ku4w7rrx07cra9t5qr33stszvml3s96qjy';
const chatPeerAtlas = 'idq1g6d3c36xl5uphy8z2w4q8g2jp3xcz9n9s7t4nq';
const chatPeerSunnyAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${'d'.repeat(64)}i0`;
const chatPeerDonAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${'e'.repeat(64)}i0`;
const chatPeerAtlasAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${'f'.repeat(64)}i0`;

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
    '[data-browser-status-proof]': new FakeElement(),
    '[data-browser-status-renderer]': new FakeElement(),
    '[data-browser-status-txid]': new FakeElement(),
    '[data-browser-drawer]': new FakeElement(),
    '[data-browser-inspector]': new FakeElement(),
    '[data-browser-modal-root]': new FakeElement(),
  };
}

function runWithResolve(resolvePayload) {
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
    window: { location: { search: '?uri=metaid%3A%2F%2Fidq1fixturebot' }, history: { replaceState() {} } },
    document: {
      readyState: 'complete',
      querySelector: (selector) => nodes[selector] ?? null,
      querySelectorAll: () => [],
      addEventListener: () => {},
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
  const avatarUrl = 'https://file.metaid.io/metafile-indexer/content/avatar-pin';
  const { nodes } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: fixture,
  }, {
    resourceType: 'bot',
    title: 'Fixture Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1fixturebot', name: 'Fixture Bot', avatar: avatarUrl, verificationState: 'partial' },
    actions: [
      { id: 'message', label: 'Message', kind: 'private-chat', enabled: true },
      { id: 'services', label: 'Services', kind: 'service-list', enabled: true },
    ],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Fixture Review'), 'bot page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /Fixture Bot/);
  assert.match(html, /idq1fixturebot/);
  assert.match(html, /Builds Agent Browser fixtures/);
  assert.match(html, /Overview/);
  assert.match(html, /Recent Activity/);
  assert.doesNotMatch(html, /<section class="browser-document-section browser-bot-buzzes">/);
  assert.match(html, /<h3>MetaApps<\/h3>/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /Fixture MetaApp/);
  assert.match(html, /Published a v3 homepage fixture/);
  assert.equal((html.match(/Published a v3 homepage fixture\./g) || []).length, 1);
  assert.match(html, /data-browser-action="private-chat"/);
  assert.match(html, /data-browser-action="service-list"/);
  assert.match(html, new RegExp(`href="pin://${servicePinId}"`));
  assert.doesNotMatch(html, new RegExp(`href="map://simplebuzz/pin/${buzzPinId}"`));
  assert.match(html, /https:\/\/file\.metaid\.io\/metafile-indexer\/content\/avatar-pin/);
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
  const { nodes } = runWithResolve(result({
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
  const { nodes } = runWithResolve(result({
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
              interactWith: chatPeerSunny,
              interactWithProfile: {
                globalMetaId: chatPeerSunny,
                name: 'AI_Sunny',
                avatar: chatPeerSunnyAvatarUrl,
              },
            },
          },
          {
            pinId: '2'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 18) / 1000),
            data: {
              interactWith: chatPeerDon,
              interactWithProfile: {
                globalMetaId: chatPeerDon,
                name: 'don-bot',
                avatar: chatPeerDonAvatarUrl,
              },
            },
          },
          {
            pinId: '3'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 16) / 1000),
            data: {
              interactWith: chatPeerAtlas,
              interactWithProfile: {
                globalMetaId: chatPeerAtlas,
                name: 'Atlas',
                avatar: chatPeerAtlasAvatarUrl,
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
  const { nodes } = runWithResolve(result({
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
  assert.match(html, /在 2026-06-19 和/);
  assert.match(html, />Eric<\/span><\/span><span style="color:#667085;">在 2026-06-19 和<\/span>/);
  assert.match(html, new RegExp(`href="metaid://${chatPeerSunny}"[^>]*data-browser-map-link`));
  assert.match(html, /AI_Sunny<\/span><\/a>/);
  assert.match(html, new RegExp(escapeRegExp(chatPeerSunnyAvatarUrl)));
  assert.match(html, new RegExp(escapeRegExp(chatPeerDonAvatarUrl)));
  assert.match(html, /发生了互动/);
  assert.ok(html.indexOf('Published new build.') < html.indexOf('AI_Sunny'), 'latest buzz should render before newer chat peers');
  assert.ok(html.indexOf('AI_Sunny') < html.indexOf('don-bot'), 'newer chat should render before older chat');
  assert.ok(html.indexOf('don-bot') < html.indexOf('Published earlier build.'), 'older buzz should remain below newer chat');
  assert.ok(html.indexOf('Published earlier build.') < html.indexOf('Atlas'), 'older chat should remain below older buzz');
  assert.ok(html.indexOf('Atlas') < html.indexOf('Oldest activity entry.'), 'oldest buzz should render last');
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

test('bot-page renderer keeps MetaApp intro scoped to each item and uses metaapp deep links', async () => {
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
  assert.match(html, /class="browser-metaapp-link"/);
  assert.match(html, /class="browser-metaapp-download"/);
  assert.equal((html.match(new RegExp(introText, 'g')) || []).length, 1);
  assert.doesNotMatch(firstMetaAppRow, new RegExp(introText));
  assert.doesNotMatch(html, new RegExp(`>metafile://${metaAppCodePinId}\\.zip<`));
  assert.match(html, new RegExp(`href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));
  assert.match(html, /aria-label="Download MetaApp code zip"/);
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
      },
      payload: {
        title: 'Readable Pin',
        content: 'Rendered via generic pin inspector',
        attachments: [
          { uri: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip', name: 'fixture.zip' },
          { uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', name: 'origin pin' },
        ],
        files: [{ url: 'https://files.example/guide.pdf', title: 'guide.pdf' }],
        image: 'metaid://idq1fixturebot',
      },
      rawPayload: '{"title":"Readable Pin"}',
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: 'a'.repeat(64),
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
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Related Media<\/h3>/);
  assert.match(html, /browser-pin-media-grid/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /browser-pin-link-pill/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.match(html, /View Raw Record/);
  assert.match(html, /data-browser-pin-raw-record/);
  assert.match(html, /guide\.pdf/);
  assert.match(html, /fixture\.zip/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/guide\.pdf"/);
  assert.match(html, /data-browser-copy-value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.doesNotMatch(html, /requestedPinId/);
  assert.doesNotMatch(html, /resolvedPinId/);
  assert.doesNotMatch(html, /Content-type routing model/);
  assert.doesNotMatch(html, /why-this-direction/);
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
  assert.match(pdf.nodes['[data-browser-viewport]'].innerHTML, /<iframe class="browser-pdf" src="https:\/\/files\.example\/a\.pdf"/);

  const image = runWithResolve(result({ type: 'image', contentType: 'image/png', url: 'https://files.example/a.png' }));
  await waitFor(() => image.nodes['[data-browser-viewport]'].innerHTML.includes('browser-image'), 'image render');
  assert.match(image.nodes['[data-browser-viewport]'].innerHTML, /<img class="browser-image" src="https:\/\/files\.example\/a\.png" alt=""/);

  const video = runWithResolve(result({ type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4' }));
  await waitFor(() => video.nodes['[data-browser-viewport]'].innerHTML.includes('browser-video'), 'video render');
  assert.match(video.nodes['[data-browser-viewport]'].innerHTML, /<video class="browser-video" src="https:\/\/files\.example\/a\.mp4" controls/);
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
