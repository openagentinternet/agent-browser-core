import assert from 'node:assert/strict';
import test from 'node:test';
import { createStandaloneBrowserHostAdapter } from '../../packages/host-standalone/dist/index.js';

const CHAT_PATH = '/protocols/simplegroupchat';
const CREATE_PATH = '/protocols/simplegroupcreate';
const CHAT_GRANT = { method: 'metaid.pin.write', operation: 'create', path: CHAT_PATH };
const RESOURCE = 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const ACTOR = 'standalone-wallet';
const SESSION = 'session-1';

function writePayload(value = '{"app":"llmchess","type":"move"}') {
  return {
    operation: 'create',
    path: CHAT_PATH,
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value },
  };
}

function pinWriteInput(overrides = {}) {
  return {
    resourceUri: RESOURCE,
    kind: 'metaid-pin-write',
    actorId: ACTOR,
    sessionId: SESSION,
    payload: writePayload(),
    ...overrides,
  };
}

function grantInput(overrides = {}) {
  return {
    resourceUri: RESOURCE,
    kind: 'permissions-request',
    actorId: ACTOR,
    sessionId: SESSION,
    payload: { grants: [CHAT_GRANT], reason: 'chess moves' },
    ...overrides,
  };
}

function confirmPhaseTwo(manualResult, overrides = {}) {
  assert.equal(manualResult.ok, false);
  assert.equal(manualResult.state, 'manual_action_required');
  const confirmRequest = manualResult.data.confirmRequest;
  return {
    resourceUri: confirmRequest.resourceUri,
    kind: 'permissions-request',
    actorId: ACTOR,
    sessionId: SESSION,
    payload: confirmRequest.payload,
    ...overrides,
  };
}

function validManualResult(result) {
  assert.equal(result.ok, false);
  assert.equal(result.state, 'manual_action_required');
  assert.equal(result.code, 'permissions_required');
  assert.equal(result.data.confirmation.grants.length, 1);
  assert.equal(result.data.confirmation.grants[0].path, CHAT_PATH);
  assert.equal(result.data.confirmRequest.kind, 'permissions-request');
  return result;
}

test('standalone llm-complete answers llm_unavailable without a configured LLM', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    actorId: ACTOR,
    payload: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'llm_unavailable');
});

test('standalone llm-complete forwards to the injected local LLM and sanitizes the result', async () => {
  const calls = [];
  const adapter = createStandaloneBrowserHostAdapter({
    llmComplete: async (input) => {
      calls.push(input);
      return { text: 'h2e2', model: 'gpt-5.6', finishReason: 'stop' };
    },
  });
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    actorId: ACTOR,
    payload: {
      messages: [{ role: 'system', content: 'You are a chess player.' }, { role: 'user', content: 'board' }],
      options: { temperature: 0.7, maxOutputTokens: 512 },
      purpose: 'llmchess-move',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.kind, 'llm-complete');
  assert.deepEqual(result.data.data, { text: 'h2e2', model: 'gpt-5.6', finishReason: 'stop' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages.length, 2);
  assert.equal(calls[0].options.temperature, 0.7);
  assert.equal(calls[0].purpose, 'llmchess-move');
});

test('standalone llm-complete rejects invalid message payloads', async () => {
  const adapter = createStandaloneBrowserHostAdapter({
    llmComplete: async () => ({ text: 'x' }),
  });
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    payload: { messages: [] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_params');
});

test('standalone llm-complete enforces the per-resource minute rate limit', async () => {
  let calls = 0;
  const adapter = createStandaloneBrowserHostAdapter({
    llmComplete: async () => {
      calls += 1;
      return { text: 'move' };
    },
  });
  for (let index = 0; index < 6; index += 1) {
    const result = await adapter.runTrustedAction({
      resourceUri: RESOURCE,
      kind: 'llm-complete',
      payload: { messages: [{ role: 'user', content: 'board' }] },
    });
    assert.equal(result.ok, true, `call ${index} should pass`);
  }
  const limited = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    payload: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(limited.ok, false);
  assert.equal(limited.code, 'rate_limited');
  assert.equal(calls, 6);
});

test('standalone llm-complete allows one in-flight completion per resource', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const adapter = createStandaloneBrowserHostAdapter({
    llmComplete: async () => {
      await gate;
      return { text: 'move' };
    },
  });
  const first = adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    payload: { messages: [{ role: 'user', content: 'board' }] },
  });
  const second = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    payload: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'rate_limited');
  release();
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
});

test('standalone llm-complete times out when the LLM stalls', async () => {
  const adapter = createStandaloneBrowserHostAdapter({
    llmComplete: async () => new Promise(() => {}),
  });
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE,
    kind: 'llm-complete',
    payload: {
      messages: [{ role: 'user', content: 'board' }],
      options: { timeoutMs: 30 },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'llm_timeout');
});

test('standalone permissions-request requires a structured confirmation then records the grant', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const phaseOne = validManualResult(await adapter.runTrustedAction(grantInput()));
  assert.equal(phaseOne.data.confirmation.reason, 'chess moves');

  const phaseTwo = await adapter.runTrustedAction(confirmPhaseTwo(phaseOne));
  assert.equal(phaseTwo.ok, true);
  assert.deepEqual(phaseTwo.data.data.granted, [CHAT_GRANT]);

  // The granted write skips the two-phase confirmation envelope.
  const write = await adapter.runTrustedAction(pinWriteInput());
  assert.equal(write.ok, false);
  assert.equal(write.state, 'failed');
  assert.equal(write.code, 'pin_write_failed');
  assert.equal(write.data, undefined);
});

test('standalone permissions-request rejects paths outside the host whitelist', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const result = await adapter.runTrustedAction(grantInput({
    payload: {
      grants: [{ method: 'metaid.pin.write', operation: 'create', path: '/protocols/metaapp' }],
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'consent_denied');
  assert.match(result.message, /not on the host whitelist/);
});

test('standalone permissions-request rejects non-create or malformed grants', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const modify = await adapter.runTrustedAction(grantInput({
    payload: { grants: [{ method: 'metaid.pin.write', operation: 'modify', path: CHAT_PATH }] },
  }));
  assert.equal(modify.ok, false);
  assert.equal(modify.code, 'invalid_params');

  const wildcard = await adapter.runTrustedAction(grantInput({
    payload: { grants: [{ method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat/*' }] },
  }));
  assert.equal(wildcard.ok, false);
  assert.equal(wildcard.code, 'invalid_params');
});

test('standalone permissions-request rejects forged or expired confirmations', async () => {
  const now = 1_700_000_000_000;
  const adapter = createStandaloneBrowserHostAdapter({ now: () => now });
  const phaseOne = validManualResult(await adapter.runTrustedAction(grantInput()));

  const forged = await adapter.runTrustedAction(confirmPhaseTwo(phaseOne, {
    payload: { ...phaseOne.data.confirmRequest.payload, hostConfirmation: { id: 'perm-x', token: 'wrong' } },
  }));
  assert.equal(forged.ok, false);
  assert.equal(forged.code, 'consent_denied');

  const expired = await adapter.runTrustedAction(confirmPhaseTwo(phaseOne, {
    payload: { ...phaseOne.data.confirmRequest.payload, hostConfirmation: { id: 'perm-y', token: 'wrong' } },
  }));
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 'consent_denied');
});

test('standalone grants are bound to actor, resource, session, operation, and exact path', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const phaseOne = validManualResult(await adapter.runTrustedAction(grantInput()));
  await adapter.runTrustedAction(confirmPhaseTwo(phaseOne));

  const cases = [
    { label: 'different actor', overrides: { actorId: 'wallet:other-address' } },
    { label: 'different resource', overrides: { resourceUri: 'metaapp://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbi0' } },
    { label: 'different session', overrides: { sessionId: 'session-2' } },
    { label: 'different path', overrides: { payload: { ...writePayload(), path: CREATE_PATH } } },
    { label: 'modify operation', overrides: { payload: { ...writePayload(), operation: 'modify', path: '@6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0' } } },
  ];
  for (const entry of cases) {
    const write = await adapter.runTrustedAction(pinWriteInput(entry.overrides));
    assert.equal(write.ok, false, `${entry.label} write should not be granted`);
    assert.equal(write.state, 'manual_action_required', `${entry.label} should fall back to two-phase confirmation`);
    assert.equal(write.code, 'browser_identity_required');
  }
});

test('standalone revoke invalidates session grants immediately', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const phaseOne = validManualResult(await adapter.runTrustedAction(grantInput()));
  await adapter.runTrustedAction(confirmPhaseTwo(phaseOne));

  const writeBefore = await adapter.runTrustedAction(pinWriteInput());
  assert.equal(writeBefore.state, 'failed');
  assert.equal(writeBefore.code, 'pin_write_failed');

  const revoked = await adapter.runTrustedAction(grantInput({ payload: { revoke: true } }));
  assert.equal(revoked.ok, true);
  assert.equal(revoked.data.data.revoked, true);

  const writeAfter = await adapter.runTrustedAction(pinWriteInput());
  assert.equal(writeAfter.state, 'manual_action_required');
});

test('standalone granted writes are rate limited and size capped', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const phaseOne = validManualResult(await adapter.runTrustedAction(grantInput()));
  await adapter.runTrustedAction(confirmPhaseTwo(phaseOne));

  const oversized = await adapter.runTrustedAction(pinWriteInput({ payload: writePayload('a'.repeat(16 * 1024 + 1)) }));
  assert.equal(oversized.ok, false);
  assert.equal(oversized.code, 'invalid_params');
  assert.match(oversized.message, /16KB/);

  for (let index = 0; index < 12; index += 1) {
    const ok = await adapter.runTrustedAction(pinWriteInput());
    assert.equal(ok.state, 'failed', `write ${index} should hit the granted path`);
    assert.equal(ok.code, 'pin_write_failed');
  }
  const limited = await adapter.runTrustedAction(pinWriteInput());
  assert.equal(limited.ok, false);
  assert.equal(limited.code, 'rate_limited');
});

test('standalone ungranted metaid.pin.write keeps the v1 two-phase flow', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const result = await adapter.runTrustedAction(pinWriteInput());
  assert.equal(result.ok, false);
  assert.equal(result.state, 'manual_action_required');
  assert.equal(result.code, 'browser_identity_required');
  assert.equal(result.data.path, CHAT_PATH);
});
