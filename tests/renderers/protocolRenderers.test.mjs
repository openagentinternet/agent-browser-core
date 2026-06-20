import assert from 'node:assert/strict';
import test from 'node:test';

const renderers = await import('../../packages/renderers/dist/index.js');

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

  assert.match(html, /generic protocol/i);
  assert.match(html, /requestedPinId/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('Pin inspector renders overview media and related links for generic pin resources', () => {
  const html = renderers.renderPinInspectorHtml({
    uri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    normalizedUri: 'pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    resourceType: 'pin',
    title: 'Pin 6ea8a0bd...',
    owner: { kind: 'unknown', name: 'Publisher', verificationState: 'partial' },
    renderer: {
      type: 'pin-inspector',
      contentType: 'application/json',
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
          contentType: 'application/json',
        },
        payload: {
          title: 'Inspectable pin',
          content: 'Full readable content',
          images: ['metafile://f038f3f06c0781e24cc89c25e5145fd225c13309acdad2db7b911d99aa160c98i0'],
          link: 'metaid://idq1fixturebot',
        },
        rawPayload: '{"title":"Inspectable pin"}',
        rawPinRecord: {
          path: '/protocols/simplebuzz',
          txid: 'a'.repeat(64),
        },
      },
    },
    actions: [],
    sections: [],
  });

  assert.match(html, /browser-pin-inspector/);
  assert.match(html, /Inspectable pin/);
  assert.match(html, /Full readable content/);
  assert.match(html, /Identity/);
  assert.match(html, /Media/);
  assert.match(html, /Related Links/);
  assert.match(html, /metaid:\/\/idq1fixturebot/);
});
