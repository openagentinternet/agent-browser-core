import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  ELEMENT_PICKER_BRIDGE,
  ELEMENT_PICKER_BRIDGE_MARKER,
  ELEMENT_PICKER_SCRIPT_SOURCE,
} = require('../../packages/core/dist/browser/elementPicker.js');
const { preparePreviewHtml } = require('../../packages/core/dist/browser/previewHtml.js');

test('preparePreviewHtml injects the element picker bridge into text/html', () => {
  const output = preparePreviewHtml({
    body: Buffer.from('<!doctype html><html><head><title>t</title></head><body></body></html>'),
    contentType: 'text/html; charset=utf-8',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });
  const html = String(output);
  assert.ok(html.includes(ELEMENT_PICKER_BRIDGE_MARKER), 'picker marker missing');
  assert.ok(html.includes('agent-browser:picker-enable'), 'picker control messages missing');
  assert.ok(html.includes('agent-browser:picker-event'), 'picker event channel missing');
});

test('element picker injection is idempotent', () => {
  const once = preparePreviewHtml({
    body: Buffer.from('<html><head></head><body></body></html>'),
    contentType: 'text/html',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });
  const twice = preparePreviewHtml({
    body: Buffer.from(String(once)),
    contentType: 'text/html',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });
  const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;
  assert.equal(
    countOccurrences(String(twice), ELEMENT_PICKER_BRIDGE_MARKER),
    countOccurrences(String(once), ELEMENT_PICKER_BRIDGE_MARKER),
  );
  assert.equal(
    countOccurrences(String(twice), 'agent-browser:picker-event'),
    countOccurrences(String(once), 'agent-browser:picker-event'),
  );
});

test('non-HTML preview bodies are left untouched', () => {
  const body = Buffer.from('<script>alert(1)</script>');
  const output = preparePreviewHtml({
    body,
    contentType: 'application/javascript',
    metafileContentBaseUrl: 'https://file.metaid.io/metafile-indexer',
  });
  assert.ok(Buffer.isBuffer(output));
  assert.equal(output.toString('utf8'), body.toString('utf8'));
});

test('picker source is embeddable in the app.ts template literal', () => {
  assert.ok(!ELEMENT_PICKER_SCRIPT_SOURCE.includes('`'), 'backtick would break the app.ts template literal');
  assert.ok(!ELEMENT_PICKER_SCRIPT_SOURCE.includes('${'), 'interpolation would break the app.ts template literal');
  assert.ok(!ELEMENT_PICKER_BRIDGE.includes('`'));
});

test('picker source installs a create() factory and covers control messages', () => {
  for (const marker of [
    '__agentBrowserElementPicker = { create: createInstance, CAPS: CAPS }',
    "'agent-browser:picker-enable') instance.enable()",
    "'agent-browser:picker-disable') instance.disable()",
    "'agent-browser:picker-add-marker') instance.addMarker(data.markerId, data.label)",
    "'agent-browser:picker-update-marker') instance.updateMarker(data.markerId, data.label)",
    "'agent-browser:picker-remove-marker') instance.removeMarker(data.markerId)",
    "'agent-browser:picker-clear-markers') instance.clearMarkers()",
  ]) {
    assert.ok(ELEMENT_PICKER_SCRIPT_SOURCE.includes(marker), `missing: ${marker}`);
  }
});

const ENGINE_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; height: 2000px; }
  #alpha { width: 120px; height: 60px; background: #eee; }
  #beta { width: 120px; height: 60px; background: #ddd; }
</style></head>
<body>
  <div id="alpha" title="Alpha title">Alpha text</div>
  <div id="beta"><span>Beta text</span></div>
  <div id="counter" style="width:80px;height:30px">0</div>
  <script>${ELEMENT_PICKER_SCRIPT_SOURCE}</script>
  <script>
    window.__events = [];
    window.__picker = window.__agentBrowserElementPicker.create({
      onEvent: function (event) { window.__events.push(event); }
    });
    window.__clicks = 0;
    document.getElementById('counter').addEventListener('click', function () {
      window.__clicks += 1;
      document.getElementById('counter').textContent = String(window.__clicks);
    });
  </script>
</body></html>`;

test('element picker engine drives pick, markers, and disposal in a real DOM (e2e)', async () => {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(ENGINE_PAGE, { waitUntil: 'load' });

    // Pick mode intercepts clicks and reports element info.
    await page.evaluate(() => window.__picker.enable());
    assert.equal(await page.evaluate(() => window.__picker.isEnabled()), true);
    await page.click('#beta span');
    const pick = await page.evaluate(() => window.__events.find((event) => event.type === 'pick'));
    assert.ok(pick, 'pick event missing');
    assert.equal(pick.element.tag, 'span');
    assert.equal(pick.element.textPreview, 'Beta text');
    assert.equal(pick.element.locator.cssScope, 'document');
    assert.ok(pick.element.locator.cssSelector.includes('span'), `selector: ${pick.element.locator.cssSelector}`);
    assert.ok(pick.element.locator.xpath.startsWith('/html[1]/body[1]/div['), `xpath: ${pick.element.locator.xpath}`);
    assert.equal(pick.element.geometry.viewportWidth > 0, true);
    assert.equal(typeof pick.element.style.backgroundColor, 'string');

    // Clicks are swallowed during pick mode.
    assert.equal(await page.evaluate(() => window.__clicks), 0);

    // Markers paint an outline plus a clickable badge for the last pick.
    assert.equal(await page.evaluate(() => window.__picker.addMarker('m1', 'Marker 1')), true);
    assert.equal(await page.locator('.__ab-picker-marker').count(), 1);
    assert.equal(await page.locator('.__ab-picker-badge').textContent(), 'Marker 1');
    await page.click('.__ab-picker-badge');
    const markerClick = await page.evaluate(() => window.__events.find((event) => event.type === 'marker-click'));
    assert.ok(markerClick, 'marker-click event missing');
    assert.equal(markerClick.markerId, 'm1');

    await page.evaluate(() => window.__picker.setVisible(false));
    assert.equal(await page.locator('.__ab-picker-marker:visible').count(), 0, 'hidden engine suppresses its marker layer');
    await page.evaluate(() => window.__picker.setVisible(true));
    assert.equal(await page.locator('.__ab-picker-marker:visible').count(), 1, 'visible engine restores its marker layer');

    // Rename flows into the badge.
    await page.evaluate(() => window.__picker.updateMarker('m1', 'Renamed'));
    assert.equal(await page.locator('.__ab-picker-badge').textContent(), 'Renamed');

    // Hover shows the chip.
    await page.hover('#alpha');
    assert.equal(await page.evaluate(() => document.querySelector('.__ab-picker-hover-chip').style.display), 'block');

    // Escape is surfaced to the controller.
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => window.__events.some((event) => event.type === 'escape')), 'escape event missing');

    // Disable returns interactivity; clicks pass through again.
    await page.evaluate(() => window.__picker.disable());
    assert.equal(await page.evaluate(() => window.__picker.isEnabled()), false);
    await page.click('#counter');
    assert.equal(await page.evaluate(() => window.__clicks), 1);

    // Dispose removes the overlay layer and listeners.
    await page.evaluate(() => window.__picker.dispose());
    assert.equal(await page.locator('.__ab-picker-marker').count(), 0);
    assert.equal(await page.evaluate(() => document.getElementById('__agent-browser-picker-overlay')), null);
  } finally {
    await browser.close();
  }
});
