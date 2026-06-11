import assert from 'node:assert/strict';
import type {
  BrowserCommandResult,
  BrowserHostAdapter,
  BrowserHostKind,
} from '@openagentinternet/agent-browser-host-contract';

export interface BrowserHostConformanceInput {
  adapter: BrowserHostAdapter;
  expectedHostKind: BrowserHostKind;
  sampleUri: string;
}

export function assertBrowserCommandResultShape(result: unknown, label = 'Browser command result'): asserts result is BrowserCommandResult<unknown> {
  assert.equal(typeof result, 'object', `${label} result object`);
  assert.notEqual(result, null, `${label} result object`);
  const commandResult = result as Partial<BrowserCommandResult<unknown>> & Record<string, unknown>;
  assert.equal(typeof commandResult.ok, 'boolean', `${label} ok`);
  assert.equal(typeof commandResult.state, 'string', `${label} state`);

  if (commandResult.ok === true) {
    assert.equal(commandResult.state, 'success', `${label} success state`);
    assert.equal(Object.prototype.hasOwnProperty.call(commandResult, 'data'), true, `${label} success data`);
    return;
  }

  assert.equal(['failed', 'waiting', 'manual_action_required'].includes(String(commandResult.state)), true, `${label} bad state`);
  assert.equal(typeof commandResult.code, 'string', `${label} code`);
  assert.notEqual(commandResult.code, '', `${label} code`);
  assert.equal(typeof commandResult.message, 'string', `${label} message`);
  assert.notEqual(commandResult.message, '', `${label} message`);

  if (commandResult.state === 'waiting' && commandResult.pollAfterMs !== undefined) {
    assert.equal(typeof commandResult.pollAfterMs, 'number', `${label} pollAfterMs`);
  }

  if (commandResult.action !== undefined) {
    assert.equal(typeof commandResult.action, 'object', `${label} action`);
    assert.notEqual(commandResult.action, null, `${label} action`);
    assert.equal(typeof (commandResult.action as Record<string, unknown>).label, 'string', `${label} action label`);
  }
}

export async function assertBrowserHostConformance(input: BrowserHostConformanceInput): Promise<void> {
  const runtime = await input.adapter.getRuntime();
  assertBrowserCommandResultShape(runtime, 'getRuntime');
  assert.equal(runtime.ok, true);
  assert.equal(runtime.data.host.kind, input.expectedHostKind);
  assert.equal(typeof runtime.data.host.name, 'string');
  assert.equal(typeof runtime.data.host.localMode, 'boolean');
  assert.equal(Array.isArray(runtime.data.actors), true);
  assert.equal(typeof runtime.data.labels.actorChip, 'string');
  assert.equal(typeof runtime.data.labels.noActorTitle, 'string');
  assert.equal(typeof runtime.data.labels.noActorBody, 'string');

  const settings = await input.adapter.getSettings();
  assertBrowserCommandResultShape(settings, 'getSettings');
  assert.equal(settings.ok, true);
  assert.equal(typeof settings.data.browser, 'object');
  assert.equal(typeof settings.data.effectiveBrowser, 'object');
  assert.equal(typeof settings.data.defaults, 'object');

  const updatedSettings = await input.adapter.updateSettings({ browser: settings.data.browser });
  assertBrowserCommandResultShape(updatedSettings, 'updateSettings');
  assert.equal(updatedSettings.ok, true);
  assert.equal(typeof updatedSettings.data.browser, 'object');
  assert.equal(typeof updatedSettings.data.effectiveBrowser, 'object');
  assert.equal(typeof updatedSettings.data.defaults, 'object');

  const cache = await input.adapter.getCache();
  assertBrowserCommandResultShape(cache, 'getCache');
  assert.equal(cache.ok, true);
  assert.equal(typeof cache.data, 'object');

  const clearedCache = await input.adapter.clearCache({});
  assertBrowserCommandResultShape(clearedCache, 'clearCache');
  assert.equal(clearedCache.ok, true);
  assert.equal(typeof clearedCache.data, 'object');

  const resolved = await input.adapter.resolveResource({ uri: input.sampleUri });
  assertBrowserCommandResultShape(resolved, 'resolveResource');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.uri, input.sampleUri);
  assert.equal(typeof resolved.data.normalizedUri, 'string');
  assert.equal(Array.isArray(resolved.data.actions), true);
  assert.equal(Array.isArray(resolved.data.sections), true);
  if (resolved.data.status) {
    assert.equal(typeof resolved.data.status.state, 'string');
    assert.equal(typeof resolved.data.status.verificationState, 'string');
    assert.equal(typeof resolved.data.status.message, 'string');
  }
  if (resolved.data.proof) {
    assert.equal(typeof resolved.data.proof.verificationState, 'string');
  }
  if (resolved.data.source) {
    assert.equal(typeof resolved.data.source.resolver, 'string');
  }

  const unsupported = await input.adapter.runTrustedAction({
    resourceUri: input.sampleUri,
    kind: 'payment',
    payload: {},
  });
  assertBrowserCommandResultShape(unsupported, 'runTrustedAction');
  if (!unsupported.ok) {
    assert.equal(typeof unsupported.code, 'string');
    assert.equal(typeof unsupported.message, 'string');
  } else {
    assert.equal(unsupported.data.kind, 'payment');
    assert.equal(typeof unsupported.data.handled, 'boolean');
  }
}
