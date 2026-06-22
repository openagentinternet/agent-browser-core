import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');
const legacyTxid = 'a'.repeat(64);
const genesisTxid = 'b'.repeat(64);

async function botEnvelope(templateId = 'document') {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/botHomepage.v3.json', import.meta.url), 'utf8'));
  return core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
    templateId,
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });
}

test('bot-page renderer shows profile, sections, and trusted buttons', async () => {
  const html = ui.renderResourceHtml(await botEnvelope('compact-list'));
  assert.match(html, /browser-bot-template-compact-list/);
  assert.match(html, /Fixture Bot/);
  assert.match(html, /idq1fixturebot/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /Fixture MetaApp/);
  assert.match(html, /Published a v3 homepage fixture/);
  assert.match(html, /data-browser-action="private-chat"/);
  assert.match(html, /data-browser-action="service-call"/);
});

test('bot-page renderer falls back when avatar URL is unsafe', async () => {
  const resource = await botEnvelope();
  resource.owner.avatar = 'javascript:alert(1)';

  const html = ui.renderResourceHtml(resource);

  assert.match(html, /browser-avatar-fallback/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.doesNotMatch(html, /src=""/);
});

test('html iframe renderer is sandboxed and rejects unsafe URLs', () => {
  const safe = ui.renderResourceHtml({
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture App',
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'https://metaweb.example/app' },
    actions: [],
    sections: [],
  });
  assert.match(safe, /<iframe class="browser-html-frame" sandbox="allow-scripts" src="https:\/\/metaweb\.example\/app"/);
  assert.doesNotMatch(safe, /allow-same-origin/);
  assert.doesNotMatch(safe, /allow-top-navigation/);

  const blocked = ui.renderResourceHtml({
    uri: 'metaapp://pin',
    normalizedUri: 'metaapp://pin',
    resourceType: 'metaapp',
    title: 'Fixture App',
    renderer: { type: 'html-iframe', contentType: 'text/html', url: 'javascript:alert(1)' },
    actions: [],
    sections: [],
  });
  assert.match(blocked, /Renderer URL blocked/);
  assert.doesNotMatch(blocked, /javascript:alert/);
});

test('UI renders protocol-pin resources through first-party renderer pack', () => {
  const html = ui.renderResourceHtml({
    uri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'protocol',
    title: 'Buzz Detail',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'protocol-pin',
      contentType: 'application/json',
      data: {
        rendererId: 'simplebuzz.detail',
        protocolPath: '/protocols/simplebuzz',
        payload: { content: 'Full buzz text' },
        version: {
          requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          resolvedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          versionSelector: 'latest',
        },
      },
    },
    actions: [],
    sections: [],
  });

  assert.match(html, /browser-simplebuzz-detail/);
  assert.match(html, /Full buzz text/);
});

test('UI renders pin-inspector resources through first-party renderer pack', () => {
  const html = ui.renderResourceHtml({
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
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
    },
    actions: [],
    sections: [],
  });

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
  assert.match(html, /data-browser-media-preview-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0"/);
  assert.match(html, /browser-pin-file-meta/);
  assert.match(html, /browser-pin-file-name/);
  assert.match(html, /browser-pin-file-desc/);
  assert.match(html, /class="browser-pin-download"/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /browser-pin-link-pill/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.match(html, /View Raw Record/);
  assert.match(html, /data-browser-copy-value="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
  assert.match(html, /<dt>txid<\/dt>/);
  assert.match(html, /guide\.pdf/);
  assert.match(html, /fixture\.zip/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/guide\.pdf"/);
  assert.doesNotMatch(html, /requestedPinId/);
  assert.doesNotMatch(html, /resolvedPinId/);
  assert.doesNotMatch(html, /Raw MAN pin record/);
  assert.doesNotMatch(html, /data-browser-pin-raw-record/);
  assert.doesNotMatch(html, /<h3>Identity<\/h3>/);
  assert.doesNotMatch(html, /<h3>Overview<\/h3>/);
  assert.doesNotMatch(html, /Content-type routing model/);
  assert.doesNotMatch(html, /why-this-direction/);
});

test('UI renders pin-inspector video and audio metafiles as playable previews', () => {
  const videoPin = 'c20fb7af7b8c2b88a782ae02f6ea7f68f3b280a861838e70ee55950cfe8793bbi0';
  const audioPin = '5ef0e012707756227d99e481927ab476ab8d74b300fea247b9e027b58bf0e16ai0';
  const html = ui.renderResourceHtml({
    uri: 'pin://' + videoPin,
    normalizedUri: 'pin://' + videoPin,
    resourceType: 'pin',
    title: 'Media Pin',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'pin-inspector',
      contentType: 'application/vnd.metaid+json; charset=utf-8',
      data: {
        rendererId: 'generic.pin-inspector',
        version: { resolvedPinId: videoPin, versionSelector: 'latest' },
        pin: { pinId: videoPin, path: '/protocols/simplebuzz', contentType: 'application/json' },
        payload: {
          title: 'Media Pin',
          // Both typed-prefix and extension metafile forms must be detected.
          videos: ['metafile://video/' + videoPin],
          audio: ['metafile://audio/' + audioPin],
          clip: 'metafile://' + videoPin + '.mp4',
          track: 'metafile://' + audioPin + '.wav',
        },
        rawPayload: '{}',
        rawPinRecord: { path: '/protocols/simplebuzz' },
      },
    },
    actions: [],
    sections: [],
  });

  // Video slot (typed-prefix form).
  assert.match(html, /data-browser-video-preview[^>]*data-browser-media-ref="metafile:\/\/video\/c20fb7af/);
  // Audio slot (typed-prefix form).
  assert.match(html, /data-browser-audio-preview[^>]*data-browser-media-ref="metafile:\/\/audio\/5ef0e012/);
  // Extension forms also classify as playable media, not generic file rows.
  assert.match(html, /data-browser-video-preview[^>]*data-browser-media-ref="metafile:\/\/c20fb7af[0-9a-f]+i0\.mp4"/);
  assert.match(html, /data-browser-audio-preview[^>]*data-browser-media-ref="metafile:\/\/5ef0e012[0-9a-f]+i0\.wav"/);
  // All four playable previews carry a Download button (pinId extraction now
  // handles the typed-prefix form too).
  assert.match(html, /data-browser-download-ref="metafile:\/\/video\/c20fb7af/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/audio\/5ef0e012/);
  // Video/audio references must NOT be rendered as plain file rows.
  assert.doesNotMatch(html, /browser-pin-file-name[^<]*metafile:\/\/video\/c20fb7af/);
});

test('UI renders JSON strings from plain text payloads as structured pin documents', () => {
  const rawPayload = '{"content":"7\\n#美食工厂","contentType":"application/json;utf-8","attachments":["metafile://50d939b24815df1afd4c37137eebe15f65dbd71ae2ea505b465558a3f170c342i0.jpg"]}';
  const html = ui.renderResourceHtml({
    uri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    normalizedUri: 'pin://06a1ecf0944fd0a86eaac7afa67dff03d913e5c76cc7a098cbed56b476d6af3ci0?version=0',
    resourceType: 'pin',
    title: 'Pin 06a1ecf094...af3ci0',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
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
        },
        payload: rawPayload,
        rawPayload,
        rawPinRecord: {
          path: '/protocols/simplebuzz',
          txid: 'a'.repeat(64),
          contentType: 'text/plain;utf-8',
          contentBody: 'eyJjb250ZW50IjoiN1xuI+e+jumjn+W3peWOgiIsImNvbnRlbnRUeXBlIjoiYXBwbGljYXRpb24vanNvbjt1dGYtOCIsImF0dGFjaG1lbnRzIjpbIm1ldGFmaWxlOi8vNTBkOTM5YjI0ODE1ZGYxYWZkNGMzNzEzN2VlYmUxNWY2NWRiZDcxYWUyZWE1MDViNDY1NTU4YTNmMTcwYzM0MmkwLmpwZyJdfQ==',
        },
      },
    },
    actions: [],
    sections: [],
  });

  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-row browser-pin-json-row-longtext/);
  assert.match(html, /browser-pin-json-subblock/);
  assert.match(html, /browser-protocol-raw">\{\n  &quot;content&quot;: &quot;7\\n#美食工厂&quot;/);
});

test('UI renders host-action resources as trusted action panels', () => {
  const html = ui.renderResourceHtml({
    uri: 'map://simplemsg/conversation?peer=idq1peer',
    normalizedUri: 'map://simplemsg/conversation?peer=idq1peer',
    resourceType: 'conversation',
    title: 'Conversation',
    owner: { kind: 'unknown', name: 'idq1peer', verificationState: 'partial' },
    renderer: {
      type: 'host-action',
      contentType: 'application/vnd.openagent.browser.host-action+json',
      data: { actionKind: 'open-conversation', actionId: 'open-conversation' },
    },
    actions: [{
      id: 'open-conversation',
      label: 'Conversation',
      kind: 'open-conversation',
      enabled: true,
      payload: {
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
        peerGlobalMetaId: 'idq1peer',
      },
    }],
    sections: [],
  });

  assert.match(html, /data-browser-action="open-conversation"/);
  assert.match(html, /Conversation/);
});

test('safeRendererUrl allows local http and https URLs only', () => {
  assert.equal(ui.safeRendererUrl('/local/path'), '/local/path');
  assert.equal(ui.safeRendererUrl('https://example.test/app'), 'https://example.test/app');
  assert.equal(ui.safeRendererUrl('http://127.0.0.1:3000/app'), 'http://127.0.0.1:3000/app');
  assert.equal(ui.safeRendererUrl('javascript:alert(1)'), '');
  assert.equal(ui.safeRendererUrl('data:text/html,hi'), '');
  assert.equal(ui.safeRendererUrl('//example.test/app'), '');
});

test('pdf image and video render with content-specific elements', () => {
  const pdf = ui.renderResourceHtml({ uri: 'metaapp://pdf', normalizedUri: 'metaapp://pdf', resourceType: 'pdf', title: 'PDF', renderer: { type: 'pdf', contentType: 'application/pdf', url: 'https://files.example/a.pdf' }, actions: [], sections: [] });
  assert.match(pdf, /class="browser-pdf"/);
  assert.match(pdf, /sandbox=""/);
  assert.doesNotMatch(pdf, /allow-same-origin/);
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://image', normalizedUri: 'metaapp://image', resourceType: 'image', title: 'Image', renderer: { type: 'image', contentType: 'image/png', url: 'https://files.example/a.png' }, actions: [], sections: [] }), /class="browser-image"/);
  // Video and audio metafiles render a centered media stage whose player slot
  // the client enhances (supporting the chunked-video manifest scheme).
  const videoHtml = ui.renderResourceHtml({ uri: 'metafile://video/abc', normalizedUri: 'metafile://video/abc', resourceType: 'document', title: 'Video', renderer: { type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4', data: { pinId: 'abc' } }, actions: [], sections: [] });
  assert.match(videoHtml, /browser-media-stage/);
  assert.match(videoHtml, /data-browser-video-preview/);
  const audioHtml = ui.renderResourceHtml({ uri: 'metafile://audio/xyz', normalizedUri: 'metafile://audio/xyz', resourceType: 'document', title: 'Audio', renderer: { type: 'audio', contentType: 'audio/mpeg', url: 'https://files.example/a.mp3', data: { pinId: 'xyz' } }, actions: [], sections: [] });
  assert.match(audioHtml, /data-browser-audio-preview/);
});

test('unsupported renderer exposes a safe download link when available', () => {
  const html = ui.renderResourceHtml({
    uri: 'metafile://zip',
    normalizedUri: 'metafile://zip',
    resourceType: 'unsupported',
    title: 'Archive',
    renderer: {
      type: 'unsupported',
      contentType: 'application/zip',
      url: 'https://files.example/archive.zip',
      error: 'This file can be downloaded.',
    },
    actions: [],
    sections: [],
  });
  assert.match(html, /Download file/);
  assert.match(html, /href="https:\/\/files\.example\/archive\.zip"/);

  const blocked = ui.renderResourceHtml({
    uri: 'metafile://zip',
    normalizedUri: 'metafile://zip',
    resourceType: 'unsupported',
    title: 'Archive',
    renderer: {
      type: 'unsupported',
      contentType: 'application/zip',
      url: 'javascript:alert(1)',
      error: 'This file can be downloaded.',
    },
    actions: [],
    sections: [],
  });
  assert.doesNotMatch(blocked, /Download file/);
  assert.doesNotMatch(blocked, /javascript:alert/);
});
