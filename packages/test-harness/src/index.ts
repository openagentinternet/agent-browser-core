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

const RESOURCE_TYPES = ['bot', 'metaapp', 'document', 'image', 'pdf', 'protocol', 'conversation', 'pin', 'unsupported', 'unknown'];
const OWNER_KINDS = ['bot', 'metaapp-publisher', 'wallet-user', 'unknown'];
const RENDERER_TYPES = ['bot-page', 'html-iframe', 'pdf', 'image', 'video', 'protocol-pin', 'pin-inspector', 'host-action', 'unsupported'];
const RESOLUTION_STATES = ['resolved', 'loading', 'not_found', 'error'];
const VERIFICATION_STATES = ['verified', 'partial', 'unverified'];
const RESOURCE_ACTION_KINDS = ['private-chat', 'service-list', 'service-call', 'copy', 'proof', 'creator', 'open-conversation'];

function assertAllowedString(value: unknown, allowed: readonly string[], label: string): asserts value is string {
  if (typeof value !== 'string') {
    assert.fail(label);
  }
  assert.equal(allowed.includes(value), true, label);
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
  assert.equal(typeof runtime.data.host, 'object');
  assert.notEqual(runtime.data.host, null);
  assert.equal(runtime.data.host.kind, input.expectedHostKind);
  assert.equal(typeof runtime.data.host.name, 'string');
  assert.equal(typeof runtime.data.host.localMode, 'boolean');
  assert.equal(Array.isArray(runtime.data.actors), true);
  assert.equal(Object.prototype.hasOwnProperty.call(runtime.data, 'defaultActor'), true);
  assert.equal(typeof runtime.data.features, 'object');
  assert.notEqual(runtime.data.features, null);
  assert.equal(typeof runtime.data.labels, 'object');
  assert.notEqual(runtime.data.labels, null);
  assert.equal(typeof runtime.data.labels.actorChip, 'string');
  assert.equal(typeof runtime.data.labels.noActorTitle, 'string');
  assert.equal(typeof runtime.data.labels.noActorBody, 'string');

  const settings = await input.adapter.getSettings();
  assertBrowserCommandResultShape(settings, 'getSettings');
  assert.equal(settings.ok, true);
  assert.equal(typeof settings.data.browser, 'object');
  assert.equal(typeof settings.data.effectiveBrowser, 'object');
  assert.equal(typeof settings.data.defaults, 'object');

  const updatedSettings = await input.adapter.updateSettings({
    browser: {
      ...settings.data.browser,
      botHomepageTemplateId: 'document',
    },
  });
  assertBrowserCommandResultShape(updatedSettings, 'updateSettings');
  assert.equal(updatedSettings.ok, true);
  assert.equal(typeof updatedSettings.data.browser, 'object');
  assert.equal(typeof updatedSettings.data.effectiveBrowser, 'object');
  assert.equal(typeof updatedSettings.data.defaults, 'object');

  const cache = await input.adapter.getCache();
  assertBrowserCommandResultShape(cache, 'getCache');
  assert.equal(cache.ok, true);
  assert.equal(typeof cache.data, 'object');

  const clearedCache = await input.adapter.clearCache({ all: true });
  assertBrowserCommandResultShape(clearedCache, 'clearCache');
  assert.equal(clearedCache.ok, true);
  assert.equal(typeof clearedCache.data, 'object');

  const resolved = await input.adapter.resolveResource({ uri: input.sampleUri });
  assertBrowserCommandResultShape(resolved, 'resolveResource');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.data.uri, input.sampleUri);
  assert.equal(typeof resolved.data.normalizedUri, 'string');
  assert.notEqual(resolved.data.normalizedUri, '');
  assertAllowedString(resolved.data.resourceType, RESOURCE_TYPES, 'resolveResource resourceType');
  assert.equal(typeof resolved.data.title, 'string');
  assert.notEqual(resolved.data.title, '');
  assert.equal(typeof resolved.data.owner, 'object', 'resolveResource owner');
  assert.notEqual(resolved.data.owner, null, 'resolveResource owner');
  assertAllowedString(resolved.data.owner.kind, OWNER_KINDS, 'resolveResource owner kind');
  assert.equal(typeof resolved.data.owner.name, 'string', 'resolveResource owner name');
  assert.notEqual(resolved.data.owner.name, '', 'resolveResource owner name');
  assert.equal(typeof resolved.data.renderer, 'object', 'resolveResource renderer');
  assert.notEqual(resolved.data.renderer, null, 'resolveResource renderer');
  assertAllowedString(resolved.data.renderer.type, RENDERER_TYPES, 'resolveResource renderer type');
  assert.equal(typeof resolved.data.renderer.contentType, 'string', 'resolveResource renderer contentType');
  assert.equal(typeof resolved.data.status, 'object', 'resolveResource status');
  assert.notEqual(resolved.data.status, null, 'resolveResource status');
  assertAllowedString(resolved.data.status.state, RESOLUTION_STATES, 'resolveResource status state');
  assertAllowedString(resolved.data.status.verificationState, VERIFICATION_STATES, 'resolveResource status verificationState');
  assert.equal(typeof resolved.data.status.message, 'string', 'resolveResource status message');
  assert.equal(typeof resolved.data.source, 'object', 'resolveResource source');
  assert.notEqual(resolved.data.source, null, 'resolveResource source');
  assert.equal(typeof resolved.data.source.resolver, 'string', 'resolveResource source resolver');
  assert.notEqual(resolved.data.source.resolver, '', 'resolveResource source resolver');
  assert.equal(Array.isArray(resolved.data.actions), true);
  for (const action of resolved.data.actions) {
    assert.equal(typeof action, 'object', 'resolveResource action');
    assert.notEqual(action, null, 'resolveResource action');
    assert.equal(typeof action.id, 'string', 'resolveResource action id');
    assert.notEqual(action.id, '', 'resolveResource action id');
    assert.equal(typeof action.label, 'string', 'resolveResource action label');
    assert.notEqual(action.label, '', 'resolveResource action label');
    assertAllowedString(action.kind, RESOURCE_ACTION_KINDS, 'resolveResource action kind');
  }
  if (resolved.data.proof) {
    assertAllowedString(resolved.data.proof.verificationState, VERIFICATION_STATES, 'resolveResource proof verificationState');
  }

  const unsupported = await input.adapter.runTrustedAction({
    resourceUri: input.sampleUri,
    kind: 'payment',
    payload: {},
  });
  assertBrowserCommandResultShape(unsupported, 'runTrustedAction');
  if (unsupported.ok) {
    assert.equal(unsupported.data.kind, 'payment');
    assert.equal(typeof unsupported.data.handled, 'boolean');
  }
}
