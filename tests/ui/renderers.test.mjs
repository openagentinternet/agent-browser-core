import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');

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
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://video', normalizedUri: 'metaapp://video', resourceType: 'metaapp', title: 'Video', renderer: { type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4' }, actions: [], sections: [] }), /class="browser-video"/);
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
