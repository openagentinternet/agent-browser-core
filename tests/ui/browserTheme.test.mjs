import assert from 'node:assert/strict';
import { test } from 'node:test';

const ui = await import('../../packages/ui/dist/index.js');
const browser = await import('../../packages/ui/dist/browser/index.js');
const createRequire = (await import('node:module')).default.createRequire;
const require = createRequire(import.meta.url);
const uiCjs = require('../../packages/ui/dist-cjs/index.js');
const browserCjs = require('../../packages/ui/dist-cjs/browser/index.js');

test('Browser theme contract exports are available on ESM and CJS entrypoints', () => {
  for (const mod of [ui, browser, uiCjs, browserCjs]) {
    assert.equal(typeof mod.createBrowserThemeMessage, 'function', 'createBrowserThemeMessage exported');
    assert.equal(typeof mod.isBrowserThemeMessage, 'function', 'isBrowserThemeMessage exported');
    assert.equal(typeof mod.resolveBrowserTheme, 'function', 'resolveBrowserTheme exported');
    assert.equal(typeof mod.normalizeBrowserTheme, 'function', 'normalizeBrowserTheme exported');
    assert.equal(typeof mod.buildBrowserThemeHeadScript, 'function', 'buildBrowserThemeHeadScript exported');
    assert.equal(mod.BROWSER_THEME_MESSAGE_TYPE, 'agent-browser:set-theme', 'message type constant');
    assert.equal(mod.BROWSER_THEME_MESSAGE_VERSION, 1, 'message version constant');
  }
});

test('createBrowserThemeMessage produces the stable theme envelope', () => {
  assert.deepEqual(ui.createBrowserThemeMessage('light'), {
    type: 'agent-browser:set-theme',
    version: 1,
    theme: 'light',
  });
  assert.deepEqual(ui.createBrowserThemeMessage('dark'), {
    type: 'agent-browser:set-theme',
    version: 1,
    theme: 'dark',
  });
  assert.deepEqual(ui.createBrowserThemeMessage('system'), {
    type: 'agent-browser:set-theme',
    version: 1,
    theme: 'system',
  });
});

test('isBrowserThemeMessage accepts valid envelopes and rejects invalid payloads', () => {
  const ok = (payload) => ui.isBrowserThemeMessage(payload);
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1, theme: 'light' }), true);
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1, theme: 'dark' }), true);
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1, theme: 'system' }), true);

  // Invalid message type.
  assert.equal(ok({ type: 'agent-browser:navigate', version: 1, theme: 'dark' }), false);
  // Wrong version.
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 2, theme: 'dark' }), false);
  // Unsupported theme value.
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1, theme: 'purple' }), false);
  // Missing theme.
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1 }), false);
  // Not an object.
  assert.equal(ok(null), false);
  assert.equal(ok('agent-browser:set-theme'), false);
  assert.equal(ok(undefined), false);
  assert.equal(ok(42), false);
  // Spoofed structure with extra junk but valid core fields is still accepted
  // (extra keys do not invalidate a valid envelope).
  assert.equal(ok({ type: 'agent-browser:set-theme', version: 1, theme: 'dark', extra: 1 }), true);
});

test('resolveBrowserTheme evaluates system against the OS preference', () => {
  assert.equal(ui.resolveBrowserTheme('system', true), 'dark');
  assert.equal(ui.resolveBrowserTheme('system', false), 'light');
  assert.equal(ui.resolveBrowserTheme('dark', true), 'dark');
  assert.equal(ui.resolveBrowserTheme('dark', false), 'dark');
  assert.equal(ui.resolveBrowserTheme('light', true), 'light');
  assert.equal(ui.resolveBrowserTheme('light', false), 'light');
});

test('normalizeBrowserTheme falls back to light for unknown input', () => {
  assert.equal(ui.normalizeBrowserTheme('dark'), 'dark');
  assert.equal(ui.normalizeBrowserTheme(undefined), 'light');
  assert.equal(ui.normalizeBrowserTheme(null), 'light');
  assert.equal(ui.normalizeBrowserTheme('purple'), 'light');
  assert.equal(ui.normalizeBrowserTheme(123), 'light');
});

test('renderBrowserPageHtml keeps light behavior when no theme is supplied', async () => {
  const html = await ui.renderBrowserPageHtml();
  assert.match(html, /<html lang="en" data-browser-theme="light" data-browser-resolved-theme="light" style="color-scheme: light">/);
  // Two-arg call (definition, language) still defaults to light.
  const htmlTwoArg = await ui.renderBrowserPageHtml(ui.buildBrowserPageDefinition(), 'en-US');
  assert.match(htmlTwoArg, /data-browser-resolved-theme="light"/);
  // light values remain the defaults in the variable block (no silent drift).
  assert.match(html, /\.browser-shell \{\n        --browser-bg: #f4f6f9;/);
});

test('renderBrowserPageHtml bakes dark on first paint so no white flash occurs', async () => {
  const html = await ui.renderBrowserPageHtml(undefined, undefined, { theme: 'dark' });
  // Resolved theme is dark immediately in the static HTML (before any JS runs).
  assert.match(html, /data-browser-theme="dark" data-browser-resolved-theme="dark" style="color-scheme: dark"/);
  // Dark CSS variable overrides are present and keyed off the resolved attribute.
  assert.match(html, /html\[data-browser-resolved-theme="dark"\] \.browser-shell \{/);
  assert.match(html, /--browser-bg: #0b1220;/);
});

test('renderBrowserPageHtml treats unknown theme values as light', async () => {
  const html = await ui.renderBrowserPageHtml(undefined, undefined, { theme: 'banana' });
  assert.match(html, /data-browser-resolved-theme="light"/);
});

test('renderBrowserPageHtml system theme resolves at runtime via the head script', async () => {
  const html = await ui.renderBrowserPageHtml(undefined, undefined, { theme: 'system' });
  // The requested theme is system (runtime source of truth).
  assert.match(html, /data-browser-theme="system"/);
  // Resolved defaults to light statically (avoids dark flash); the head script
  // corrects it before first paint.
  assert.match(html, /data-browser-resolved-theme="light"/);
  // The blocking head script reads prefers-color-scheme and resolves system.
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /var resolved = requested === "system" \?/);
});

test('the blocking head script writes the resolved attribute before first paint', () => {
  const script = ui.buildBrowserThemeHeadScript();
  assert.match(script, /data-browser-resolved-theme/);
  assert.match(script, /root\.style\.colorScheme = resolved/);
  // It never overwrites the requested data-browser-theme attribute (source of truth).
  assert.doesNotMatch(script, /setAttribute\("data-browser-theme"/);
});

test('the client script wires a parent-only theme message listener', async () => {
  const definition = ui.buildBrowserPageDefinition();

  // A single message dispatcher handles both theme and bridge messages.
  assert.match(definition.script, /function handleBrowserMessage\(event\)/);
  // Theme messages are accepted only from window.parent.
  assert.match(definition.script, /if \(window && window\.parent && event\.source === window\.parent\)/);
  // It validates the envelope before applying a theme.
  assert.match(definition.script, /if \(data && isBrowserThemeMessage\(data\)\)/);
  assert.match(definition.script, /applyBrowserTheme\(data\.theme\)/);
  // Registered once during initialize.
  assert.match(definition.script, /window\.addEventListener\('message', handleBrowserMessage\)/);
});

test('the client script applies a theme without reloading the page', async () => {
  const definition = ui.buildBrowserPageDefinition();

  // applyBrowserTheme sets the resolved attribute + color-scheme in place.
  assert.match(definition.script, /function applyBrowserTheme\(theme\)/);
  assert.match(definition.script, /function applyResolvedTheme\(resolved\)/);
  assert.match(definition.script, /root\.setAttribute\('data-browser-resolved-theme', resolved\)/);
  // For system it registers a matchMedia change listener; for explicit themes it pins.
  assert.match(definition.script, /mql\.addEventListener\('change', onChange\)/);
  assert.match(definition.script, /state\.currentTheme = theme/);
});

test('the MetaApp iframe sandbox contract is unchanged by theme logic', async () => {
  const definition = ui.buildBrowserPageDefinition();
  // The MetaApp html-frame sandbox is computed by htmlFrameSandbox; theme code
  // never touches it.
  assert.match(definition.script, /function htmlFrameSandbox/);
  assert.match(definition.script, /'allow-scripts allow-same-origin allow-downloads'/);
  // No CSS filter inversion is applied to media iframes/images anywhere.
  const dark = await ui.renderBrowserPageHtml(undefined, undefined, { theme: 'dark' });
  assert.doesNotMatch(dark, /browser-html-frame[^}]*filter:\s*(invert|hue-rotate)/);
  assert.doesNotMatch(dark, /filter:\s*invert/);
});
