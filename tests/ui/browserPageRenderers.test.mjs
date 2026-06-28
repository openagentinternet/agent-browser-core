import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');
const { BROWSER_INDEX_HTML } = require('../../packages/ui/dist/browser/indexHtml.js');

const servicePinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const buzzPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const longBuzzPinId = '8ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const multilineBuzzPinId = '9ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const metaAppPinId = 'a'.repeat(64) + 'i0';
const olderMetaAppPinId = 'b'.repeat(64) + 'i0';
const metaAppCodePinId = 'c'.repeat(64) + 'i0';
const legacyTxid = 'a'.repeat(64);
const genesisTxid = 'b'.repeat(64);
const chatPeerSunny = 'idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz';
const chatPeerDon = 'idq1kwa7ku4w7rrx07cra9t5qr33stszvml3s96qjy';
const chatPeerAtlas = 'idq1g6d3c36xl5uphy8z2w4q8g2jp3xcz9n9s7t4nq';
const pinCreatorGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const pinPeerGlobalMetaId = 'idq1zfazvxaq69uw6txe3ewce30ewyhy9a7mzykgv0';
const relatedMetaAppPinId = 'c67c6dfac211747156757f4bbdb710df1c27e680719c156aaea21f858a1cc2cei0';
const relatedBarePinId = 'fd7603131166e30663981864c0223351deb1336b6eb33a0396237d5847fa504ai9';
const chatPeerSunnyAvatarPinId = 'd'.repeat(64) + 'i0';
const chatPeerDonAvatarPinId = 'e'.repeat(64) + 'i0';
const chatPeerAtlasAvatarPinId = 'f'.repeat(64) + 'i0';
const chatPeerSunnyAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerSunnyAvatarPinId}`;
const chatPeerDonAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerDonAvatarPinId}`;
const chatPeerAtlasAvatarUrl = `https://file.metaid.io/metafile-indexer/content/${chatPeerAtlasAvatarPinId}`;

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

function runWithResolve(resolvePayload, options = {}) {
  const nodes = elements();
  const fetchCalls = [];
  const infoProfiles = options.infoProfiles || {};
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
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/browser/resolve')) {
        return { ok: true, json: async () => ({ ok: true, data: resolvePayload }) };
      }
      if (String(url).startsWith('/api/browser/info')) {
        const parsed = new URL(String(url), 'http://browser.test');
        const globalMetaId = parsed.searchParams.get('globalMetaId') || '';
        const profile = infoProfiles[globalMetaId] || { globalMetaId, name: globalMetaId, avatar: '' };
        return { ok: true, json: async () => ({ ok: true, data: profile }) };
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) };
    },
  };
  vm.runInNewContext(buildBrowserPageDefinition().script, context);
  return { context, nodes, fetchCalls };
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
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'bot-page',
    contentType: 'application/vnd.oac.bot-homepage+json',
    data: fixture,
  }, {
    resourceType: 'bot',
    title: 'Fixture Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1fixturebot', name: 'Fixture Bot', avatar: avatarUrl, verificationState: 'partial' },
    actions: [
      { id: 'message', label: 'Message', kind: 'private-chat', enabled: true },
      {
        id: 'conversation',
        label: 'Conversation',
        kind: 'open-conversation',
        enabled: true,
        payload: {
          conversationUri: 'map://simplemsg/conversation?peer=idq1fixturebot',
          peerGlobalMetaId: 'idq1fixturebot',
        },
      },
      { id: 'services', label: 'Services', kind: 'service-list', enabled: true },
      { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: 'metaid://idq1fixturebot' },
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
  assert.doesNotMatch(html, /data-browser-action="service-list"/);
  assert.doesNotMatch(html, /data-browser-action="open-conversation"/);
  assert.doesNotMatch(html, /data-browser-action="copy"/);
  assert.doesNotMatch(html, /data-browser-follow/);
  assert.doesNotMatch(html, /<span>Follow<\/span>/);
  assert.match(html, /class="browser-service-card"/);
  assert.match(html, /fixture-review/);
  assert.match(html, /0 SPACE/);
  assert.match(html, /Output/);
  assert.match(html, /data-browser-action="service-call"/);
  assert.match(html, new RegExp(`data-service-id="${servicePinId}"`));
  assert.match(html, new RegExp(`href="pin://${servicePinId}" data-browser-map-link class="browser-service-title browser-bot-inline-link"`));
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
  const { nodes, fetchCalls } = runWithResolve(result({
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
  const { nodes, fetchCalls } = runWithResolve(result({
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
              interactWith: {
                globalMetaId: chatPeerSunny,
                name: 'AI_Sunny',
                avatarId: chatPeerSunnyAvatarPinId,
              },
            },
          },
          {
            pinId: '2'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 18) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerDon,
                name: 'don-bot',
                avatarId: chatPeerDonAvatarPinId,
              },
            },
          },
          {
            pinId: '3'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 16) / 1000),
            data: {
              interactWith: {
                globalMetaId: chatPeerAtlas,
                name: 'Atlas',
                avatarId: chatPeerAtlasAvatarPinId,
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
  const { nodes, fetchCalls } = runWithResolve(result({
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
  assert.equal(fetchCalls.filter((url) => url.includes('/api/browser/info')).length, 0);
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

test('bot-page renderer keeps MetaApp intro scoped to each card and uses Run deep links', async () => {
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
                coverImg: 'https://file.metaid.io/metafile-indexer/content/cover-pin',
                icon: 'https://file.metaid.io/metafile-indexer/content/icon-pin',
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
  assert.match(firstMetaAppRow, /class="browser-metaapp-run"/);
  assert.match(firstMetaAppRow, /class="browser-metaapp-cover-image"/);
  assert.match(firstMetaAppRow, /class="browser-metaapp-icon-image"/);
  assert.match(firstMetaAppRow, new RegExp(`<strong class="browser-metaapp-title">${escapeRegExp('eric-homepage')}</strong><a href="pin://${metaAppPinId}" data-browser-map-link class="browser-metaapp-name browser-bot-inline-link">${escapeRegExp('eric-homepage')}</a>`));
  assert.match(html, /class="browser-metaapp-download"/);
  assert.equal((html.match(new RegExp(introText, 'g')) || []).length, 1);
  assert.doesNotMatch(firstMetaAppRow, new RegExp(introText));
  assert.doesNotMatch(html, new RegExp(`>metafile://${metaAppCodePinId}\\.zip<`));
  assert.match(html, new RegExp(`href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));
  assert.match(html, /aria-label="Download MetaApp code zip"/);
});

test('bot-page document renders service and MetaApp cards from v3 payload fields', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1styledcardsbot' },
    profile: { name: 'Styled Cards Bot', bio: 'Publishes services and MetaApps.' },
    sections: [
      {
        id: 'services',
        protocolPath: '/protocols/skill-service',
        items: [
          {
            pinId: servicePinId,
            protocolPath: '/protocols/skill-service',
            data: {
              payload: {
                displayName: '微博热搜',
                description: '获取微博热搜榜数据，返回热搜标题、热度值和跳转链接。',
                providerSkill: 'weibo-hot-trend',
                price: '0.00001',
                currency: 'SPACE',
                serviceIcon: 'https://manapi.metaid.io/content/service-icon-pin',
                outputType: 'text',
              },
            },
          },
        ],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            data: {
              payload: {
                appName: 'Styled MetaApp',
                code: `metafile://${metaAppCodePinId}.zip`,
                content: `metafile://${metaAppCodePinId}.zip`,
                contentType: 'application/zip',
                coverImg: 'https://file.metaid.io/metafile-indexer/content/card-cover',
                icon: 'https://file.metaid.io/metafile-indexer/content/card-icon',
                intro: 'Runs a styled Browser application.',
                title: 'Styled MetaApp Title',
                version: '1.2.3',
              },
            },
          },
        ],
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
              interactWith: {
                globalMetaId: chatPeerSunny,
                name: 'AI_Sunny',
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
    uri: 'metaid://idq1styledcardsbot',
    normalizedUri: 'metaid://idq1styledcardsbot',
    resourceType: 'bot',
    title: 'Styled Cards Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1styledcardsbot', name: 'Styled Cards Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('AI_Sunny'), 'styled bot page render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  const servicesSection = html.match(/<section class="browser-document-section browser-bot-services"><h3>Services<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(servicesSection, 'services section should render');
  assert.match(servicesSection[1], /class="browser-service-card"/);
  assert.match(servicesSection[1], /微博热搜/);
  assert.match(servicesSection[1], new RegExp(`href="pin://${servicePinId}" data-browser-map-link class="browser-service-title browser-bot-inline-link"`));
  assert.match(servicesSection[1], /获取微博热搜榜数据，返回热搜标题、热度值和跳转链接。/);
  assert.match(servicesSection[1], /weibo-hot-trend/);
  assert.match(servicesSection[1], /0\.00001 SPACE/);
  assert.match(servicesSection[1], /<div class="browser-service-actions"><span class="browser-service-price">0\.00001 SPACE<\/span><button type="button" data-browser-action="service-call"/);
  assert.match(servicesSection[1], /Output/);
  assert.match(servicesSection[1], /text/);
  assert.match(servicesSection[1], /class="browser-service-icon-image"/);
  assert.match(servicesSection[1], /data-browser-action="service-call"/);
  assert.doesNotMatch(servicesSection[1], /Input/);

  const metaAppsSection = html.match(/<section class="browser-document-section browser-bot-metaapps"><h3>MetaApps<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(metaAppsSection, 'metaapps section should render');
  assert.match(metaAppsSection[1], /class="browser-metaapp-card"/);
  assert.match(metaAppsSection[1], /Styled MetaApp Title/);
  assert.match(metaAppsSection[1], /Styled MetaApp/);
  assert.match(metaAppsSection[1], new RegExp(`href="pin://${metaAppPinId}" data-browser-map-link class="browser-metaapp-name browser-bot-inline-link"`));
  assert.match(metaAppsSection[1], /Runs a styled Browser application./);
  assert.match(metaAppsSection[1], /1\.2\.3/);
  assert.match(metaAppsSection[1], /application\/zip/);
  assert.match(metaAppsSection[1], new RegExp(`class="browser-metaapp-run" href="metaapp://${metaAppPinId}" data-browser-map-link`));
  assert.match(metaAppsSection[1], /class="browser-metaapp-cover-image"/);
  assert.match(metaAppsSection[1], /class="browser-metaapp-icon-image"/);
  assert.doesNotMatch(metaAppsSection[1], /class="browser-pin-badge"/);
  assert.doesNotMatch(metaAppsSection[1], new RegExp(`<a[^>]+>${escapeRegExp('Styled MetaApp Title')}</a>`));
  assert.match(metaAppsSection[1], new RegExp(`href="https://file\\.metaid\\.io/metafile-indexer/api/v1/files/accelerate/content/${metaAppCodePinId}"`));

  assert.match(html, /href="metaid:\/\/idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz"[^>]*style="[^"]*text-decoration:none;color:#3558c8;"/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-bot-inline-link \{\s+color: #3558c8;\s+text-decoration: none;\s+\}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-bot-inline-link:hover,\s+\.browser-bot-inline-link:focus \{\s+color: #3558c8;\s+text-decoration: none;\s+\}/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-metaapp-actions \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-card \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-icon \{\s+align-self: start;/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-actions \{/);
  assert.match(BROWSER_INDEX_HTML, /\.browser-service-price \{\s+color: var\(--browser-accent\);\s+text-align: right;/);
  const narrowCss = BROWSER_INDEX_HTML.match(/@media \(max-width: 520px\) \{[\s\S]*?\.browser-icon-button\.is-loading/);
  assert.ok(narrowCss, 'narrow viewport CSS should be present');
  assert.doesNotMatch(narrowCss[0], /\.browser-service-card,\s+\.browser-metaapp-card,/);
  assert.doesNotMatch(narrowCss[0], /\.browser-service-card button/);
  assert.match(narrowCss[0], /\.browser-service-actions \{\s+justify-items: end;/);
  assert.match(html, /<path d="M12 3v12"><\/path>/);
});

test('bot-page document hides empty Services and MetaApps sections', async () => {
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1emptycardsbot' },
    profile: { name: 'Empty Cards Bot', bio: 'Has only activity.' },
    sections: [
      { id: 'services', protocolPath: '/protocols/skill-service', items: [] },
      { id: 'metaapps', protocolPath: '/protocols/metaapp', items: [] },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: '1'.repeat(64) + 'i0',
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: { interactWith: { globalMetaId: chatPeerSunny, name: 'AI_Sunny' } },
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
    uri: 'metaid://idq1emptycardsbot',
    normalizedUri: 'metaid://idq1emptycardsbot',
    resourceType: 'bot',
    title: 'Empty Cards Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1emptycardsbot', name: 'Empty Cards Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Recent Activity'), 'empty card sections render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.doesNotMatch(html, /browser-bot-services/);
  assert.doesNotMatch(html, /<h3>Services<\/h3>/);
  assert.doesNotMatch(html, /No public services/);
  assert.doesNotMatch(html, /browser-bot-metaapps/);
  assert.doesNotMatch(html, /<h3>MetaApps<\/h3>/);
  assert.doesNotMatch(html, /No public MetaApps/);
  assert.match(html, /Recent Activity/);
  assert.match(html, /AI_Sunny/);
});

test('bot-page renderer links each Recent Activity item to its pin:// detail via a [PIN] badge', async () => {
  const buzzPin = '4'.repeat(64) + 'i0';
  const chatPin = '1'.repeat(64) + 'i0';
  const homepage = {
    schemaVersion: 'botHomepage.v3',
    identity: { globalMetaId: 'idq1pinbadgebot' },
    profile: { name: 'Badge Bot', bio: 'Exercises [PIN] badges.' },
    sections: [
      { id: 'services', protocolPath: '/protocols/skill-service', items: [] },
      {
        id: 'chats',
        protocolPath: '/protocols/simplemsg',
        items: [
          {
            pinId: chatPin,
            protocolPath: '/protocols/simplemsg',
            timestamp: Math.floor(Date.UTC(2026, 5, 19) / 1000),
            data: { interactWith: { globalMetaId: chatPeerSunny, name: 'AI_Sunny' } },
          },
        ],
      },
      {
        id: 'buzzes',
        protocolPath: '/protocols/simplebuzz',
        items: [
          {
            pinId: buzzPin,
            protocolPath: '/protocols/simplebuzz',
            timestamp: Math.floor(Date.UTC(2026, 5, 20) / 1000),
            data: { payload: { content: 'Published new build.' } },
          },
        ],
      },
      {
        id: 'metaapps',
        protocolPath: '/protocols/metaapp',
        items: [
          {
            pinId: metaAppPinId,
            protocolPath: '/protocols/metaapp',
            timestamp: 1780760004,
            data: { payload: { appName: 'badge-app', title: 'Badge App', version: '1.0.0' } },
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
    uri: 'metaid://idq1pinbadgebot',
    normalizedUri: 'metaid://idq1pinbadgebot',
    resourceType: 'bot',
    title: 'Badge Bot',
    owner: { kind: 'bot', globalMetaId: 'idq1pinbadgebot', name: 'Badge Bot', verificationState: 'partial' },
    actions: [],
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Recent Activity'), 'pin badge render');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  // Buzz row: PIN badge links to pin://<buzzPin> via internal nav.
  const buzzBadge = new RegExp(`class="browser-pin-badge" href="pin://${buzzPin}" data-browser-map-link[^>]*>PIN`);
  assert.match(html, buzzBadge);
  // Chat row: PIN badge links to the chat interaction pin.
  const chatBadge = new RegExp(`class="browser-pin-badge" href="pin://${chatPin}" data-browser-map-link[^>]*>PIN`);
  assert.match(html, chatBadge);
  // MetaApps use Run for the app link and do not render a PIN badge in the card section.
  const metaAppsSection = html.match(/<section class="browser-document-section browser-bot-metaapps"><h3>MetaApps<\/h3>([\s\S]*?)<\/section>/);
  assert.ok(metaAppsSection, 'metaapps section should render');
  assert.match(metaAppsSection[1], new RegExp(`href="metaapp://${metaAppPinId}"`));
  assert.doesNotMatch(metaAppsSection[1], /class="browser-pin-badge"/);
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
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: {
        title: 'Readable Pin',
        content: 'Rendered via generic pin inspector. '.repeat(6).trim(),
        featured: true,
        score: 42,
        images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
        attachments: [
          { uri: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip', name: 'fixture.zip' },
          { uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', name: 'origin pin' },
        ],
        files: [{ url: 'https://files.example/guide.pdf', title: 'guide.pdf' }],
        image: 'metaid://idq1fixturebot',
        tags: ['agent-browser', 'pin-renderer'],
        extra: {
          publishedAt: '2026-06-20T13:42:00Z',
          lang: 'en',
        },
      },
      rawPayload: '{"title":"Readable Pin"}',
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
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
  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-row browser-pin-json-row-longtext/);
  assert.match(html, /browser-pin-json-text-block/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-boolean/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-number/);
  assert.match(html, /browser-pin-json-token-list/);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-link/);
  assert.match(html, /browser-pin-json-subblock/);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Related Media<\/h3>/);
  assert.match(html, /browser-pin-media-grid/);
  assert.match(html, /browser-pin-file-meta/);
  assert.match(html, /browser-pin-file-name/);
  assert.match(html, /browser-pin-file-desc/);
  assert.match(html, /class="browser-pin-download"/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /browser-pin-link-pill/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.match(html, /View Raw Record/);
  assert.match(html, /guide\.pdf/);
  assert.match(html, /fixture\.zip/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/guide\.pdf"/);
  assert.match(html, /data-browser-copy-value="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
  assert.match(html, /<dt>txid<\/dt>/);
  assert.doesNotMatch(html, /requestedPinId/);
  assert.doesNotMatch(html, /resolvedPinId/);
  assert.doesNotMatch(html, /Content-type routing model/);
  assert.doesNotMatch(html, /why-this-direction/);
  assert.doesNotMatch(html, /Raw MAN pin record/);
  assert.doesNotMatch(html, /data-browser-pin-raw-record/);
});

test('pin-inspector renders related entities and hydrates creator and peer profiles', async () => {
  const rawPayload = JSON.stringify({
    content: 'Plain payload with peer identity.',
    to: pinPeerGlobalMetaId,
    nested: [{ id: chatPeerSunny }, { id: pinCreatorGlobalMetaId }, { id: 'idq1fixturebot' }],
  });
  const creatorAvatar = 'https://assets.example/creator.png';
  const peerAvatar = 'https://assets.example/peer.png';
  const sunnyAvatar = 'https://assets.example/sunny.png';
  const { nodes, fetchCalls } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
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
        contentType: 'text/plain;utf-8',
        operation: 'create',
        chainName: 'btc',
        ownerGlobalMetaId: pinCreatorGlobalMetaId,
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        globalMetaId: pinCreatorGlobalMetaId,
        contentType: 'text/plain;utf-8',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', globalMetaId: pinCreatorGlobalMetaId, name: pinCreatorGlobalMetaId, verificationState: 'partial' },
  }), {
    infoProfiles: {
      [pinCreatorGlobalMetaId]: { globalMetaId: pinCreatorGlobalMetaId, name: 'Creator Bot', avatar: creatorAvatar },
      [pinPeerGlobalMetaId]: { globalMetaId: pinPeerGlobalMetaId, name: 'Peer Bot', avatar: peerAvatar },
      [chatPeerSunny]: { globalMetaId: chatPeerSunny, name: 'Sunny', avatar: sunnyAvatar },
    },
  });

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<h3>Related Entities</h3>'), 'related entities section render');
  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('Creator Bot')
    && nodes['[data-browser-viewport]'].innerHTML.includes('Peer Bot')
    && nodes['[data-browser-viewport]'].innerHTML.includes('Sunny'), 'related entity profile hydration');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  assert.ok(html.indexOf('<h3>Related Entities</h3>') < html.indexOf('<h3>Related Links</h3>'));
  assert.match(html, /<div class="browser-pin-entity-role">creator<\/div>/);
  assert.match(html, /<div class="browser-pin-entity-role">peer<\/div>/);
  assert.match(html, new RegExp(`href="metaid://${pinCreatorGlobalMetaId}" data-browser-map-link`));
  assert.match(html, new RegExp(`href="metaid://${pinPeerGlobalMetaId}" data-browser-map-link`));
  assert.match(html, /idq14hmv\.\.\.zwg9xz/);
  assert.match(html, /Creator Bot/);
  assert.match(html, /Peer Bot/);
  assert.match(html, /Sunny/);
  assert.match(html, /src="https:\/\/assets\.example\/creator\.png"/);
  assert.match(html, /src="https:\/\/assets\.example\/peer\.png"/);
  assert.match(html, /src="https:\/\/assets\.example\/sunny\.png"/);
  const infoCalls = fetchCalls.filter((url) => url.includes('/api/browser/info'));
  assert.equal(infoCalls.length, 3);
  assert.doesNotMatch(infoCalls.join('\n'), /idq1fixturebot/);
});

test('pin-inspector renders metaapp links and bare non-current pin IDs as related links', async () => {
  const requestedPinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const resolvedPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
  const rawPayload = [
    `MetaApp: metaapp://${relatedMetaAppPinId}`,
    `Reference pin: ${relatedBarePinId}`,
    `Current requested pin should not self-link: ${requestedPinId}`,
    `Current resolved pin should not self-link: ${resolvedPinId}`,
  ].join('\n');
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId,
        resolvedPinId,
        versionSelector: 'latest',
      },
      pin: {
        pinId: resolvedPinId,
        path: '/protocols/simplebuzz',
        contentType: 'text/plain;utf-8',
        chainName: 'btc',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        pinId: resolvedPinId,
        contentType: 'text/plain;utf-8',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
    },
  }, {
    uri: `pin://${requestedPinId}`,
    normalizedUri: `pin://${requestedPinId}`,
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('<h3>Related Links</h3>'), 'related links render');
  const html = nodes['[data-browser-viewport]'].innerHTML;

  assert.match(html, new RegExp(`href="metaapp://${relatedMetaAppPinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`metaapp://${relatedMetaAppPinId.slice(0, 10)}\\.\\.\\.${relatedMetaAppPinId.slice(-10)}`));
  assert.match(html, new RegExp(`href="pin://${relatedBarePinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`pin://${relatedBarePinId.slice(0, 10)}\\.\\.\\.${relatedBarePinId.slice(-10)}`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${requestedPinId}"`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${resolvedPinId}"`));
});

test('pin-inspector renders JSON strings from plain text payloads as structured documents', async () => {
  const rawPayload = '{"content":"7\\n#美食工厂","contentType":"application/json;utf-8","attachments":["metafile://50d939b24815df1afd4c37137eebe15f65dbd71ae2ea505b465558a3f170c342i0.jpg"]}';
  const { nodes } = runWithResolve(result({
    type: 'pin-inspector',
    contentType: 'text/plain;utf-8',
    data: {
      rendererId: 'generic.pin-inspector',
      version: {
        requestedPinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        resolvedPinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        versionSelector: 'latest',
      },
      pin: {
        pinId: '06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0',
        path: '/protocols/simplebuzz',
        contentType: 'text/plain;utf-8',
        operation: 'create',
        chainName: 'mvc',
        encryption: '0',
        version: '1',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
      },
      payload: rawPayload,
      rawPayload,
      rawPinRecord: {
        path: '/protocols/simplebuzz',
        txid: legacyTxid,
        genesisTransaction: genesisTxid,
        contentType: 'text/plain;utf-8',
        contentBody: 'eyJjb250ZW50IjoiN1xuI+e+jumjn+W3peWOgiIsImNvbnRlbnRUeXBlIjoiYXBwbGljYXRpb24vanNvbjt1dGYtOCIsImF0dGFjaG1lbnRzIjpbIm1ldGFmaWxlOi8vNTBkOTM5YjI0ODE1ZGYxYWZkNGMzNzEzN2VlYmUxNWY2NWRiZDcxYWUyZWE1MDViNDY1NTU4YTNmMTcwYzM0MmkwLmpwZyJdfQ==',
      },
    },
  }, {
    uri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    normalizedUri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    resourceType: 'pin',
    title: 'Pin 06a1ecf094...af3ci0',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
  }));

  await waitFor(() => nodes['[data-browser-viewport]'].innerHTML.includes('browser-pin-page'), 'plain-text-json pin render');
  const html = nodes['[data-browser-viewport]'].innerHTML;
  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-row browser-pin-json-row-longtext/);
  assert.match(html, /browser-pin-json-subblock/);
  assert.match(html, /browser-protocol-raw">\{\n  &quot;content&quot;: &quot;7\\n#美食工厂&quot;/);
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

  const video = runWithResolve(result({ type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4', data: { pinId: 'c20fb7af7b8c2b88a782ae02f6ea7f68f3b280a861838e70ee55950cfe8793bbi0' } }));
  await waitFor(() => video.nodes['[data-browser-viewport]'].innerHTML.includes('browser-media-stage'), 'video render');
  assert.match(video.nodes['[data-browser-viewport]'].innerHTML, /data-browser-video-preview/);
  assert.match(video.nodes['[data-browser-viewport]'].innerHTML, /data-browser-media-ref="metafile:\/\/c20fb7af/);

  const audio = runWithResolve(result({ type: 'audio', contentType: 'audio/mpeg', url: 'https://files.example/a.mp3', data: { pinId: 'dd53ea8c3f3d51a7f9af2c06807ffabd3f560cff4e80f6ae8881d628f186ab91i0' } }));
  await waitFor(() => audio.nodes['[data-browser-viewport]'].innerHTML.includes('browser-media-stage'), 'audio render');
  assert.match(audio.nodes['[data-browser-viewport]'].innerHTML, /data-browser-audio-preview/);
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
