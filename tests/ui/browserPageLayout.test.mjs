import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const templateSource = readFileSync(new URL('../../packages/ui/src/browser/indexHtml.ts', import.meta.url), 'utf8');
const templateMatch = templateSource.match(/export const BROWSER_INDEX_HTML = (.*);\n?$/s);
assert.ok(templateMatch, 'missing BROWSER_INDEX_HTML export');
const template = JSON.parse(templateMatch[1]);
const { buildBrowserPageDefinition } = require('../../packages/ui/dist/browser/app.js');
const { renderBrowserPageHtml } = require('../../packages/ui/dist/browser/page.js');

function cssBlock(selector) {
  const marker = `${selector} {`;
  const start = template.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = template.indexOf('\n      }', bodyStart);
  assert.notEqual(end, -1, `missing CSS block end for ${selector}`);
  return template.slice(bodyStart, end);
}

function cssBlockAfter(marker, selector) {
  const markerIndex = template.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
  const selectorMarker = `${selector} {`;
  const start = template.indexOf(selectorMarker, markerIndex);
  assert.notEqual(start, -1, `missing CSS block for ${selector} after ${marker}`);
  const bodyStart = start + selectorMarker.length;
  const end = template.indexOf('\n        }', bodyStart);
  assert.notEqual(end, -1, `missing CSS block end for ${selector} after ${marker}`);
  return template.slice(bodyStart, end);
}

function assertDeclaration(block, property, value) {
  const pattern = new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`);
  assert.match(block, pattern);
}

function assertNoDeclaration(block, property, value) {
  const pattern = new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`);
  assert.doesNotMatch(block, pattern);
}

test('Browser page locks outer document while renderer viewport owns content scrolling', () => {
  const bodyBlock = cssBlock('body:has(.browser-shell)');
  assertDeclaration(bodyBlock, 'overflow', 'hidden');

  const pageShellBlock = cssBlock('.shell:has(.browser-shell)');
  assertDeclaration(pageShellBlock, 'height', '100vh');
  assertDeclaration(pageShellBlock, 'overflow', 'hidden');

  const contentBlock = cssBlock('.content:has(.browser-shell)');
  assertDeclaration(contentBlock, 'height', 'calc(100vh - 52px)');
  assertDeclaration(contentBlock, 'min-height', '0');
  assertDeclaration(contentBlock, 'overflow', 'hidden');

  const browserShellBlock = cssBlock('.browser-shell');
  assertDeclaration(browserShellBlock, 'height', '100%');
  assertDeclaration(browserShellBlock, 'min-height', '0');
  assertDeclaration(browserShellBlock, 'overflow', 'hidden');
  assertDeclaration(browserShellBlock, 'grid-template-rows', '34px 58px auto minmax(0, 1fr) 32px');

  const viewportRowBlock = cssBlock('.browser-viewport-row');
  assertDeclaration(viewportRowBlock, 'grid-row', '4');
  assertDeclaration(viewportRowBlock, 'position', 'relative');
  assertDeclaration(viewportRowBlock, 'overflow', 'hidden');

  const viewportBlock = cssBlock('.browser-viewport');
  assertDeclaration(viewportBlock, 'grid-row', '1');
  assertDeclaration(viewportBlock, 'min-height', '0');
  assertDeclaration(viewportBlock, 'overflow', 'auto');
});

test('Responsive Browser drawer and inspector overlay the viewport row, not owner chrome', () => {
  const responsivePanelBlock = cssBlockAfter(
    '@media (max-width: 900px)',
    '.browser-drawer,\n        .browser-inspector,\n        .browser-shell.has-drawer .browser-inspector'
  );

  assertDeclaration(responsivePanelBlock, 'position', 'absolute');
  assertDeclaration(responsivePanelBlock, 'grid-row', '1');
  assertDeclaration(responsivePanelBlock, 'top', '0');
  assertDeclaration(responsivePanelBlock, 'bottom', '0');
  assertNoDeclaration(responsivePanelBlock, 'position', 'fixed');
  assertNoDeclaration(responsivePanelBlock, 'top', '120px');
});

test('Responsive Browser overlays stay within renderer viewport geometry', async () => {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(await renderBrowserPageHtml(buildBrowserPageDefinition()), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const shell = document.querySelector('[data-browser-shell]');
      const viewport = document.querySelector('[data-browser-viewport]');
      const drawer = document.querySelector('[data-browser-drawer]');
      const inspector = document.querySelector('[data-browser-inspector]');

      shell.classList.add('has-drawer', 'has-inspector');
      viewport.innerHTML = '<section class="browser-empty-state"><h2>Viewport content</h2></section>';
      drawer.hidden = false;
      drawer.innerHTML = '<section class="browser-drawer-panel"><h2>Library</h2></section>';
      inspector.hidden = false;
      inspector.innerHTML = '<section class="browser-inspector-panel"><h2>Inspector</h2></section>';
    });

    const geometry = await page.evaluate(() => {
      function rect(selector) {
        const box = document.querySelector(selector).getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      }
      return {
        viewport: rect('[data-browser-viewport]'),
        drawer: rect('[data-browser-drawer]'),
        inspector: rect('[data-browser-inspector]'),
        status: rect('[data-browser-status-strip]'),
      };
    });

    for (const panelName of ['drawer', 'inspector']) {
      const panel = geometry[panelName];
      assert.ok(
        panel.top >= geometry.viewport.top - 1,
        `${panelName} top should be at or below viewport top: panel=${JSON.stringify(panel)} viewport=${JSON.stringify(geometry.viewport)}`
      );
      assert.ok(
        panel.bottom <= geometry.viewport.bottom + 1,
        `${panelName} bottom should be at or before viewport bottom: panel=${JSON.stringify(panel)} viewport=${JSON.stringify(geometry.viewport)}`
      );
      assert.ok(
        panel.bottom <= geometry.status.top + 1,
        `${panelName} should not overlap status chrome: panel=${JSON.stringify(panel)} status=${JSON.stringify(geometry.status)}`
      );
    }
  } finally {
    if (page) await page.close();
    await browser.close();
  }
});

test('Responsive Browser status strip stays single-line at narrow widths', async () => {
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch();
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 320, height: 540 } });
    await page.setContent(await renderBrowserPageHtml(buildBrowserPageDefinition()), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.querySelector('[data-browser-status-state]').textContent = 'resolved';
      document.querySelector('[data-browser-status-renderer]').textContent = 'renderer: pin-inspector with a deliberately long renderer label';
      document.querySelector('[data-browser-status-txid]').textContent = 'TXID: 47bd23df82d4f5f30ef8d3b43ee05983188571ac328c4de156ee80a1ed5e7ab2';
    });

    const status = await page.evaluate(() => {
      const strip = document.querySelector('[data-browser-status-strip]');
      const style = getComputedStyle(strip);
      return {
        height: strip.getBoundingClientRect().height,
        clientHeight: strip.clientHeight,
        scrollHeight: strip.scrollHeight,
        flexWrap: style.flexWrap,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      };
    });

    assert.equal(status.flexWrap, 'nowrap');
    assert.equal(status.overflowX, 'hidden');
    assert.equal(status.overflowY, 'hidden');
    assert.ok(status.height <= 33, `status strip should keep fixed chrome height: ${JSON.stringify(status)}`);
    assert.ok(
      status.scrollHeight <= status.clientHeight + 1,
      `status strip should not create a second text row: ${JSON.stringify(status)}`
    );
  } finally {
    if (page) await page.close();
    await browser.close();
  }
});
