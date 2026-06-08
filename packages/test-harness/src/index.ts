import assert from 'node:assert/strict';
import type { BrowserHostAdapter, BrowserHostKind } from '@openagentinternet/agent-browser-host-contract';

export interface BrowserHostConformanceInput {
  adapter: BrowserHostAdapter;
  expectedHostKind: BrowserHostKind;
  sampleUri: string;
}

export async function assertBrowserHostConformance(input: BrowserHostConformanceInput): Promise<void> {
  const runtime = await input.adapter.getRuntime();
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, input.expectedHostKind);
  assert.equal(typeof runtime.data.host.name, 'string');
  assert.equal(typeof runtime.data.host.localMode, 'boolean');
  assert.equal(Array.isArray(runtime.data.actors), true);
  assert.equal(typeof runtime.data.labels.actorChip, 'string');
  assert.equal(typeof runtime.data.labels.noActorTitle, 'string');
  assert.equal(typeof runtime.data.labels.noActorBody, 'string');

  const settings = await input.adapter.getSettings();
  assert.equal(settings.ok, true);
  assert.equal(typeof settings.data.browser, 'object');
  assert.equal(typeof settings.data.effectiveBrowser, 'object');
  assert.equal(typeof settings.data.defaults, 'object');

  const updatedSettings = await input.adapter.updateSettings({ browser: settings.data.browser });
  assert.equal(updatedSettings.ok, true);
  assert.equal(typeof updatedSettings.data.browser, 'object');
  assert.equal(typeof updatedSettings.data.effectiveBrowser, 'object');
  assert.equal(typeof updatedSettings.data.defaults, 'object');

  const cache = await input.adapter.getCache();
  assert.equal(cache.ok, true);
  assert.equal(typeof cache.data, 'object');

  const clearedCache = await input.adapter.clearCache({});
  assert.equal(clearedCache.ok, true);
  assert.equal(typeof clearedCache.data, 'object');

  const resolved = await input.adapter.resolveResource({ uri: input.sampleUri });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.uri, input.sampleUri);
  assert.equal(typeof resolved.data.normalizedUri, 'string');
  assert.equal(Array.isArray(resolved.data.actions), true);
  assert.equal(Array.isArray(resolved.data.sections), true);

  const unsupported = await input.adapter.runTrustedAction({
    resourceUri: input.sampleUri,
    kind: 'payment',
    payload: {},
  });
  if (!unsupported.ok) {
    assert.equal(typeof unsupported.code, 'string');
    assert.equal(typeof unsupported.message, 'string');
  } else {
    assert.equal(unsupported.data.kind, 'payment');
    assert.equal(typeof unsupported.data.handled, 'boolean');
  }
}
