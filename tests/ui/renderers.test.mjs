import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');

async function botEnvelope(templateId = 'document') {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/botHomepage.v1.json', import.meta.url), 'utf8'));
  return core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
    templateId,
  });
}

test('bot-page renderer shows profile, sections, and trusted buttons', async () => {
  const html = ui.renderResourceHtml(await botEnvelope('compact-list'));
  assert.match(html, /browser-bot-template-compact-list/);
  assert.match(html, /Fixture Bot/);
  assert.match(html, /idq1fixturebot/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /Template Authoring/);
  assert.match(html, /Fixture Bus/);
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

test('pdf image and video render with content-specific elements', () => {
  const pdf = ui.renderResourceHtml({ uri: 'metaapp://pdf', normalizedUri: 'metaapp://pdf', resourceType: 'pdf', title: 'PDF', renderer: { type: 'pdf', contentType: 'application/pdf', url: 'https://files.example/a.pdf' }, actions: [], sections: [] });
  assert.match(pdf, /class="browser-pdf"/);
  assert.match(pdf, /sandbox=""/);
  assert.doesNotMatch(pdf, /allow-same-origin/);
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://image', normalizedUri: 'metaapp://image', resourceType: 'image', title: 'Image', renderer: { type: 'image', contentType: 'image/png', url: 'https://files.example/a.png' }, actions: [], sections: [] }), /class="browser-image"/);
  assert.match(ui.renderResourceHtml({ uri: 'metaapp://video', normalizedUri: 'metaapp://video', resourceType: 'metaapp', title: 'Video', renderer: { type: 'video', contentType: 'video/mp4', url: 'https://files.example/a.mp4' }, actions: [], sections: [] }), /class="browser-video"/);
});
