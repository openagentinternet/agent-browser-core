import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const core = await import('../../packages/core/dist/index.js');
const ui = await import('../../packages/ui/dist/index.js');

test('Browser page renders fixed chrome, URI input, actor chip, viewport, and status strip', () => {
  const definition = ui.buildBrowserPageDefinition({ initialUri: 'metaid://idq1fixturebot' });
  const html = ui.renderBrowserPageHtml(definition);

  assert.match(html, /Agent Internet Browser/);
  assert.match(html, /data-browser-shell/);
  assert.match(html, /data-browser-uri-input/);
  assert.match(html, /data-browser-using-selector/);
  assert.match(html, /data-browser-viewport/);
  assert.match(html, /data-browser-status-strip/);
  assert.match(html, /data-browser-menu-trigger/);
  assert.match(html, /data-browser-modal-root/);
  assert.match(html, /body:has\(\.browser-shell\) \{ overflow: hidden; \}/);
  assert.match(html, /\.browser-viewport \{ min-height: 0; overflow: auto;/);
  assert.match(html, /TXID: -/);
  assert.equal(typeof ui.buildBrowserClientScript, 'function');
  assert.equal(typeof ui.buildBrowserShellHtml, 'function');
  assert.equal(typeof ui.BROWSER_PAGE_STYLES, 'string');
});

test('Browser page can include an initial Bot resource render', async () => {
  const homepage = JSON.parse(await readFile(new URL('../fixtures/botHomepage.v1.json', import.meta.url), 'utf8'));
  const resource = core.buildBotHomepageEnvelope({
    uri: 'metaid://idq1fixturebot',
    normalizedUri: 'metaid://idq1fixturebot',
    homepage,
  });
  const html = ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition({ resource }));

  assert.match(html, /Fixture Bot/);
  assert.match(html, /Fixture Review/);
  assert.match(html, /\/api\/browser\/resolve/);
});

test('Browser client script preserves resolved Bot actions and resolve failures', () => {
  const definition = ui.buildBrowserPageDefinition();

  assert.match(definition.script, /function actionHtml\(action\)/);
  assert.match(definition.script, /data-browser-action=/);
  assert.match(definition.script, /actionsHtml\(resource\.actions \|\| \[\]\)/);
  assert.match(definition.script, /class="browser-pdf" sandbox=""/);
  assert.match(definition.script, /try \{/);
  assert.match(definition.script, /catch \(error\)/);
  assert.match(definition.script, /status\.textContent = 'error'/);
  assert.match(definition.script, /navigateTo\(input && input\.value \|\| ''\)\.catch\(\(\) => \{\}\)/);
});
