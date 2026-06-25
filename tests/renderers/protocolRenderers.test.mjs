import assert from 'node:assert/strict';
import test from 'node:test';

const renderers = await import('../../packages/renderers/dist/index.js');
const legacyTxid = 'a'.repeat(64);
const genesisTxid = 'b'.repeat(64);
const creatorGlobalMetaId = 'idq1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5pw5z8n';
const peerGlobalMetaId = 'idq14hmv23j5fnlx4ccnmvlyldjd38xjsechzwg9xz';
const secondPeerGlobalMetaId = 'idq1zfazvxaq69uw6txe3ewce30ewyhy9a7mzykgv0';
const currentRequestedPinId = '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const currentResolvedPinId = '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const relatedMetaAppPinId = 'c67c6dfac211747156757f4bbdb710df1c27e680719c156aaea21f858a1cc2cei0';
const relatedBarePinId = 'fd7603131166e30663981864c0223351deb1336b6eb33a0396237d5847fa504ai9';

function protocolResource(rendererId, payload, overrides = {}) {
  return {
    uri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'protocol',
    title: 'Protocol Detail',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'protocol-pin',
      contentType: 'application/json',
      data: {
        rendererId,
        protocolPath: '/protocols/simplebuzz',
        payload,
        rawPayload: JSON.stringify(payload),
        version: {
          requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          resolvedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          versionSelector: 'latest',
        },
        ...overrides,
      },
    },
    actions: [],
    sections: [],
  };
}

test('SimpleBuzz renderer shows full text and media links', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('simplebuzz.detail', {
    content: 'Full buzz text with every paragraph.',
    images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
  }));

  assert.match(html, /browser-protocol-detail/);
  assert.match(html, /Full buzz text with every paragraph/);
  assert.match(html, /metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0/);
});

test('Skill service renderer shows service fields', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('skill-service.detail', {
    name: 'Research Skill',
    description: 'Finds evidence.',
    price: '0.01 SPACE',
    inputSchema: { task: 'string' },
  }, { protocolPath: '/protocols/skill-service' }));

  assert.match(html, /Research Skill/);
  assert.match(html, /Finds evidence/);
  assert.match(html, /0\.01 SPACE/);
  assert.match(html, /inputSchema/);
});

test('Generic renderer escapes raw payload and displays version identity', () => {
  const html = renderers.renderProtocolPinHtml(protocolResource('generic.protocol-pin', '<script>alert(1)</script>', {
    protocolPath: '/protocols/unknown',
  }));

  assert.match(html, /<h3>Payload Render<\/h3>/);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.doesNotMatch(html, /<h3>Identity<\/h3>/);
  assert.doesNotMatch(html, /<h3>Overview<\/h3>/);
  assert.match(html, /<h3>Related Media<\/h3>/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

function pinInspectorResource(contentType, payload, overrides = {}) {
  return {
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'pin-inspector',
      contentType,
      data: {
        rendererId: 'generic.pin-inspector',
        version: {
          requestedPinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          resolvedPinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          rootPinId: '5ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          versionSelector: 'latest',
          historyIndex: 3,
        },
        pin: {
          pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          path: '/protocols/simplebuzz',
          contentType,
          operation: 'create',
          chainName: 'btc',
          encryption: 'public',
          version: '1',
          txid: legacyTxid,
          genesisTransaction: genesisTxid,
        },
        payload,
        rawPayload: typeof payload === 'string' ? payload : '{"title":"Inspectable pin"}',
        rawPinRecord: {
          path: '/protocols/simplebuzz',
          txid: legacyTxid,
          genesisTransaction: genesisTxid,
          contentType,
        },
        ...overrides,
      },
    },
    actions: [],
    sections: [],
  };
}

test('Pin inspector renders prototype-style JSON payload with media, links, and verification actions', () => {
  const longContent = 'The page should answer the human question first. '.repeat(6).trim();
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('application/vnd.metaid+json; charset=utf-8', {
    title: 'Inspectable pin',
    content: longContent,
    topic: 'generic pin detail',
    featured: true,
    score: 42,
    images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
    image: 'metaid://idq1fixturebot',
    tags: ['agent-browser', 'pin-renderer'],
    extra: {
      publishedAt: '2026-06-20T13:42:00Z',
      lang: 'en',
    },
    attachments: [
      { uri: 'https://files.example/archive.zip', name: 'archive.zip' },
      { uri: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip', name: 'fixture.zip' },
      { uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0', name: 'origin pin' },
    ],
    files: [{ url: 'https://files.example/guide.pdf', title: 'guide.pdf' }],
  }, {
    rawPayload: '{"title":"Inspectable pin","images":["metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0"]}',
  }));

  assert.match(html, /browser-pin-page/);
  assert.match(html, /Inspectable pin/);
  assert.match(html, /browser-pin-meta-pills/);
  assert.match(html, /\/protocols\/simplebuzz/);
  assert.match(html, /application\/vnd\.metaid\+json; charset=utf-8/);
  assert.match(html, /latest effective version/);
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
  assert.ok(html.indexOf('browser-pin-json-key">title') < html.indexOf('browser-pin-json-key">content'), 'JSON key order should be preserved');
  assert.match(html, /<h3>Raw Payload<\/h3>/);
  assert.match(html, /<h3>Related Media<\/h3>/);
  assert.match(html, /browser-pin-media-grid/);
  assert.match(html, /data-browser-media-preview-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0"/);
  assert.match(html, /browser-pin-file-meta/);
  assert.match(html, /browser-pin-file-name/);
  assert.match(html, /browser-pin-file-desc/);
  assert.match(html, /class="browser-pin-download"/);
  assert.match(html, /archive\.zip/);
  assert.match(html, /fixture\.zip/);
  assert.match(html, /guide\.pdf/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/archive\.zip"/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/guide\.pdf"/);
  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, /browser-pin-link-pill/);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /<h3>Verify<\/h3>/);
  assert.match(html, /View Raw Record/);
  assert.match(html, /data-browser-copy-value="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
  assert.match(html, /<dt>txid<\/dt>/);
  assert.match(html, /chain/);
  assert.match(html, /content-type/);
  assert.doesNotMatch(html, /requestedPinId/);
  assert.doesNotMatch(html, /resolvedPinId/);
  assert.doesNotMatch(html, /rootPinId/);
  assert.doesNotMatch(html, /historyIndex/);
  assert.doesNotMatch(html, /Raw MAN pin record/);
  assert.doesNotMatch(html, /data-browser-pin-raw-record/);
  assert.doesNotMatch(html, /<h3>Identity<\/h3>/);
  assert.doesNotMatch(html, /<h3>Overview<\/h3>/);
  assert.doesNotMatch(html, /Content-type routing model/);
  assert.doesNotMatch(html, /why-this-direction/);
});

test('Pin inspector renders related entities from creator and payload Global Meta IDs', () => {
  const payload = {
    content: 'Entity scan should not depend on content type.',
    to: peerGlobalMetaId,
    participants: [
      { id: secondPeerGlobalMetaId },
      { id: peerGlobalMetaId },
      { id: creatorGlobalMetaId },
      { id: 'idq1fixturebot' },
    ],
  };
  const rawPayload = JSON.stringify(payload);
  const resource = pinInspectorResource('text/plain;utf-8', rawPayload, {
    pin: {
      pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
      path: '/protocols/simplebuzz',
      contentType: 'text/plain;utf-8',
      chainName: 'btc',
      txid: legacyTxid,
      genesisTransaction: genesisTxid,
      ownerGlobalMetaId: creatorGlobalMetaId,
    },
    rawPayload,
    rawPinRecord: {
      globalMetaId: creatorGlobalMetaId,
      contentType: 'text/plain;utf-8',
      txid: legacyTxid,
      genesisTransaction: genesisTxid,
    },
  });
  resource.owner.globalMetaId = creatorGlobalMetaId;
  resource.owner.name = 'Creator fallback';

  const html = renderers.renderPinInspectorHtml(resource);

  assert.ok(html.indexOf('<h3>Related Entities</h3>') < html.indexOf('<h3>Related Links</h3>'));
  assert.match(html, /<div class="browser-pin-entity-role">creator<\/div>/);
  assert.match(html, /<div class="browser-pin-entity-role">peer<\/div>/);
  assert.match(html, new RegExp(`href="metaid://${creatorGlobalMetaId}" data-browser-map-link`));
  assert.match(html, new RegExp(`href="metaid://${peerGlobalMetaId}" data-browser-map-link`));
  assert.match(html, new RegExp(`href="metaid://${secondPeerGlobalMetaId}" data-browser-map-link`));
  assert.match(html, /idq14hmv\.\.\.zwg9xz/);
  assert.equal((html.match(/class="browser-pin-entity-card"/g) || []).length, 3);
  assert.doesNotMatch(html, /href="metaid:\/\/idq1fixturebot"/);
});

test('Pin inspector renders metaapp links and bare non-current pin IDs as related links', () => {
  const payload = [
    `MetaApp: metaapp://${relatedMetaAppPinId}`,
    `Reference pin: ${relatedBarePinId}`,
    `Current requested pin should not self-link: ${currentRequestedPinId}`,
    `Current resolved pin should not self-link: ${currentResolvedPinId}`,
  ].join('\n');
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('text/plain;utf-8', payload, {
    rawPayload: payload,
  }));

  assert.match(html, /<h3>Related Links<\/h3>/);
  assert.match(html, new RegExp(`href="metaapp://${relatedMetaAppPinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`metaapp://${relatedMetaAppPinId.slice(0, 10)}\\.\\.\\.${relatedMetaAppPinId.slice(-10)}`));
  assert.match(html, new RegExp(`href="pin://${relatedBarePinId}" data-browser-map-link`));
  assert.match(html, new RegExp(`pin://${relatedBarePinId.slice(0, 10)}\\.\\.\\.${relatedBarePinId.slice(-10)}`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${currentRequestedPinId}"`));
  assert.doesNotMatch(html, new RegExp(`href="pin://${currentResolvedPinId}"`));
});

test('Pin inspector shows the pin update timestamp instead of "latest effective version" when a timestamp is present', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('application/json', { title: 'Timestamped pin' }, {
    rawPinRecord: {
      path: '/protocols/simplebuzz',
      txid: legacyTxid,
      genesisTransaction: genesisTxid,
      contentType: 'application/json',
      timestamp: 1718887380,
    },
  }));
  // "latest effective version" fallback should be replaced by a local timestamp pill.
  assert.doesNotMatch(html, /latest effective version/);
  // 1718887380s -> local "YYYY-MM-DD HH:MM:SS" shaped pill.
  assert.match(html, /updated \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
});

test('Pin inspector falls back to "latest effective version" when no timestamp is present', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('application/json', { title: 'Untimestamped pin' }));
  assert.match(html, /latest effective version/);
});

test('Pin inspector renders JSON strings from plain text payloads as structured documents', () => {
  const rawPayload = '{"content":"7\\n#美食工厂","contentType":"application/json;utf-8","attachments":["metafile://50d939b24815df1afd4c37137eebe15f65dbd71ae2ea505b465558a3f170c342i0.jpg"]}';
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('text/plain;utf-8', rawPayload, {
    rawPayload,
  }));

  assert.match(html, /JSON is rendered as a structured payload document/);
  assert.match(html, /browser-pin-json-doc/);
  assert.match(html, /browser-pin-json-key">content</);
  assert.match(html, /browser-pin-json-token browser-pin-json-token-link/);
  assert.match(html, /browser-pin-file-meta/);
  assert.match(html, /browser-protocol-raw">\{\n  &quot;content&quot;: &quot;7\\n#美食工厂&quot;,\n  &quot;contentType&quot;: &quot;application\/json;utf-8&quot;/);
});

test('Pin inspector wraps long raw payload fields without horizontal overflow', async () => {
  const rawPayload = JSON.stringify({
    content: 'x'.repeat(1600),
    contentType: 'application/json;utf-8',
  });
  const html = renderers.renderPinInspectorHtml(pinInspectorResource('application/json;utf-8', rawPayload, {
    rawPayload,
  }));
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 520, height: 720 } });
    await page.setContent(`
      <style>
        html, body { margin: 0; }
        .browser-shell, .browser-shell * { box-sizing: border-box; }
        .browser-viewport { width: 504px; overflow: auto; }
      </style>
      <section class="browser-shell"><main class="browser-viewport" data-browser-viewport>${html}</main></section>
    `, { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(() => {
      const raw = document.querySelector('.browser-protocol-raw');
      const pageRoot = document.querySelector('.browser-pin-page');
      const viewport = document.querySelector('[data-browser-viewport]');
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        pageClientWidth: pageRoot ? pageRoot.clientWidth : 0,
        pageScrollWidth: pageRoot ? pageRoot.scrollWidth : 0,
        viewportClientWidth: viewport ? viewport.clientWidth : 0,
        viewportScrollWidth: viewport ? viewport.scrollWidth : 0,
        rawClientWidth: raw ? raw.clientWidth : 0,
        rawScrollWidth: raw ? raw.scrollWidth : 0,
      };
    });

    assert.ok(metrics.rawClientWidth > 0, `missing raw payload block: ${JSON.stringify(metrics)}`);
    assert.ok(
      metrics.rawScrollWidth <= metrics.rawClientWidth + 1,
      `raw payload should wrap instead of horizontally scrolling: ${JSON.stringify(metrics)}`
    );
    assert.ok(
      metrics.pageScrollWidth <= metrics.pageClientWidth + 1,
      `pin page should not be widened by raw payload content: ${JSON.stringify(metrics)}`
    );
    assert.ok(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `document should not expose page-level horizontal overflow: ${JSON.stringify(metrics)}`
    );
    assert.ok(
      metrics.viewportScrollWidth <= metrics.viewportClientWidth + 1,
      `Browser viewport should not expose horizontal overflow: ${JSON.stringify(metrics)}`
    );
  } finally {
    if (page) await page.close();
    await browser.close();
  }
});

test('Pin inspector discovers related files from JSON-string payload sources', () => {
  const rawPayload = JSON.stringify({
    content: 'String payload source',
    attachments: [{ uri: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip', name: 'string.zip' }],
    files: [{ url: 'https://files.example/string-guide.pdf', title: 'string-guide.pdf' }],
  });
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'application/json',
    rawPayload,
    { rawPayload },
  ));

  assert.match(html, /string\.zip/);
  assert.match(html, /string-guide\.pdf/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
  assert.match(html, /data-browser-download-ref="https:\/\/files\.example\/string-guide\.pdf"/);
});

test('Pin inspector discovers browser URIs recursively from nested payload values', () => {
  const payload = {
    title: 'Nested links',
    meta: {
      body: {
        link: 'metaid://idq1fixturebot',
        nested: [{ ref: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0' }],
        media: {
          archive: 'metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0.zip',
        },
      },
    },
  };
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'application/json',
    payload,
    { rawPayload: JSON.stringify(payload) },
  ));

  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
  assert.match(html, /href="pin:\/\/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0" data-browser-map-link/);
  assert.match(html, /data-browser-download-ref="metafile:\/\/f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0\.zip"/);
});

test('Pin inspector renders markdown payload as parsed markdown and preserves raw source nearby', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'text/markdown',
    '# Heading\n\n**Bold** and [Map](metaid://idq1fixturebot)',
    { rawPayload: '# Heading\n\n**Bold** and [Map](metaid://idq1fixturebot)' },
  ));

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /metaid:\/\/idq1fixturebot/);
  assert.match(html, /<h3>Raw Payload<\/h3>/);
});

test('Pin inspector sanitizes raw HTML and blocks unsafe markdown links', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'text/markdown',
    '# Safe Heading\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n[Good](metaid://idq1fixturebot)',
    { rawPayload: '# Safe Heading\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n[Good](metaid://idq1fixturebot)' },
  ));

  assert.match(html, /<h1>Safe Heading<\/h1>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:alert\(1\)"/);
  assert.match(html, />Bad</);
  assert.match(html, /href="metaid:\/\/idq1fixturebot" data-browser-map-link/);
});

test('Pin inspector blocks unsafe markdown images and avoids auto-embedding external image syntax', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'text/markdown',
    '![Bad](javascript:alert(1))\n\n![Preview](metafile://image-fixture)\n\n![External](https://files.example/image.png)',
    { rawPayload: '![Bad](javascript:alert(1))\n\n![Preview](metafile://image-fixture)\n\n![External](https://files.example/image.png)' },
  ));

  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /href="javascript:alert\(1\)"/);
  assert.match(html, /href="metafile:\/\/image-fixture" data-browser-map-link/);
  assert.match(html, /href="https:\/\/files\.example\/image\.png" target="_blank" rel="noopener"/);
});

test('Pin inspector renders plain text payload without markdown parsing', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'text/plain; charset=utf-8',
    'Literal *stars* only',
    { rawPayload: 'Literal *stars* only' },
  ));

  assert.match(html, /Literal \*stars\* only/);
  assert.doesNotMatch(html, /<em>stars<\/em>/);
});

test('Pin inspector shows compact notice for binary payloads', () => {
  const html = renderers.renderPinInspectorHtml(pinInspectorResource(
    'application/octet-stream',
    '',
    { rawPayload: '' },
  ));

  assert.match(html, /browser-pin-binary-card/);
  assert.match(html, /Binary PIN/);
  assert.match(html, /application\/octet-stream/);
});
