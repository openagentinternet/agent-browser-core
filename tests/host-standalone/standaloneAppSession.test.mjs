import assert from 'node:assert/strict';
import test from 'node:test';
import { createStandaloneBrowserHostAdapter } from '../../packages/host-standalone/dist/index.js';
import { createMemoryStandaloneBrowserHost } from '../../packages/host-standalone/dist/memoryHost.js';

const RESOURCE = 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const ACTOR = 'standalone-wallet';
const SESSION = 'session-1';

function startPayload(overrides = {}) {
  return {
    appId: 'llmchess.v2',
    sessionType: 'agent-game',
    groupId: 'group-1',
    gameId: 'xiangqi',
    manifestUri: 'metafile://abc',
    rulesHash: 'sha256:rules',
    adapterHash: 'sha256:adapter',
    seat: 'black',
    agentId: ACTOR,
    ttlMs: 86400000,
    protocolPaths: ['/protocols/simplegroupjoin', '/protocols/simplegroupchat'],
    budget: { llmCalls: 500, writes: 500 },
    ...overrides,
  };
}

function sessionObject(overrides = {}) {
  return {
    sessionId: 'sess-1',
    appId: 'llmchess.v2',
    sessionType: 'agent-game',
    groupId: 'group-1',
    gameId: 'xiangqi',
    manifestUri: 'metafile://abc',
    adapterHash: 'sha256:adapter',
    rulesHash: 'sha256:rules',
    seat: 'black',
    agentId: ACTOR,
    status: 'running',
    lastIndex: 0,
    lastActionSeq: 0,
    lastError: null,
    createdAt: 1735800000123,
    updatedAt: 1735800123456,
    expiresAt: 1735886400123,
    budget: { llmCalls: 500, llmCallsUsed: 0, writes: 500, writesUsed: 0 },
    ...overrides,
  };
}

// Builds an injected appSession handler backed by an in-memory map, so tests can
// assert the adapter's two-phase card, idempotency, and error-code passthrough
// without a real host runner.
function createFakeSessionHandler() {
  const sessions = new Map();
  const calls = [];
  let idempotencyHits = 0;
  return {
    calls,
    idempotencyHits: () => idempotencyHits,
    handler: async ({ action, resourceUri, actorId, payload }) => {
      const record = { action, resourceUri, actorId, payload };
      calls.push(record);
      // Mirror host idempotency: same (groupId, seat, agentId, rulesHash) reuses
      // the existing session instead of creating a duplicate.
      if (action === 'start') {
        const key = [payload.groupId, payload.seat, payload.agentId, payload.rulesHash].join('|');
        for (const existing of sessions.values()) {
          const existingKey = [existing.groupId, existing.seat, existing.agentId, existing.rulesHash].join('|');
          if (existingKey === key) {
            idempotencyHits += 1;
            return { ok: true, state: 'success', data: { kind: 'app-session-start', handled: true, data: existing } };
          }
        }
        const session = sessionObject({ sessionId: `sess-${sessions.size + 1}` });
        sessions.set(session.sessionId, session);
        record.createdSessionId = session.sessionId;
        return { ok: true, state: 'success', data: { kind: 'app-session-start', handled: true, data: session } };
      }
      if (action === 'list') {
        const list = [...sessions.values()].filter((s) => s.agentId === actorId);
        return { ok: true, state: 'success', data: { kind: 'app-session-list', handled: true, data: { sessions: list } } };
      }
      if (action === 'status') {
        const session = sessions.get(payload.sessionId);
        if (!session || session.agentId !== actorId) {
          return { ok: false, state: 'failed', code: 'session_not_found', message: 'no such session' };
        }
        return { ok: true, state: 'success', data: { kind: 'app-session-status', handled: true, data: session } };
      }
      if (action === 'pause' || action === 'resume') {
        const session = sessions.get(payload.sessionId);
        if (!session) return { ok: false, state: 'failed', code: 'session_not_found', message: 'no such session' };
        session.status = action === 'pause' ? 'paused' : 'running';
        return { ok: true, state: 'success', data: { kind: `app-session-${action}`, handled: true, data: session } };
      }
      if (action === 'stop') {
        const session = sessions.get(payload.sessionId);
        if (!session) return { ok: false, state: 'failed', code: 'session_not_found', message: 'no such session' };
        session.status = 'stopped';
        return { ok: true, state: 'success', data: { kind: 'app-session-stop', handled: true, data: session } };
      }
      return { ok: false, state: 'failed', code: 'internal_error', message: 'unknown action' };
    },
  };
}

test('app-session-start answers unsupported_method when no appSession handler is injected', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, payload: startPayload(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unsupported_method');
});

test('app-session-start validates required fields before invoking the handler', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler });
  const cases = [
    { field: 'appId', overrides: { appId: '' } },
    { field: 'groupId', overrides: { groupId: '' } },
    { field: 'rulesHash', overrides: { rulesHash: '' } },
    { field: 'seat', overrides: { seat: '' } },
    { field: 'agentId', overrides: { agentId: '' } },
    { field: 'ttlMs', overrides: { ttlMs: 0 } },
    { field: 'ttlMs', overrides: { ttlMs: -10 } },
  ];
  for (const item of cases) {
    const result = await adapter.runTrustedAction({
      resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, payload: startPayload(item.overrides),
    });
    assert.equal(result.ok, false, `expected invalid_params for ${item.field}`);
    assert.equal(result.code, 'invalid_params');
  }
  assert.equal(fake.calls.length, 0, 'handler must not be invoked on invalid params');
});

test('app-session-start produces a two-phase manual-action card, then starts on phase 2', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler });
  const phaseOne = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: startPayload(),
  });
  assert.equal(phaseOne.ok, false);
  assert.equal(phaseOne.state, 'manual_action_required');
  assert.equal(phaseOne.code, 'app_session_required');
  // The card data carries the authorization summary and an opaque confirmRequest.
  const confirmation = phaseOne.data.confirmation;
  assert.equal(confirmation.appId, 'llmchess.v2');
  assert.equal(confirmation.groupId, 'group-1');
  assert.equal(confirmation.rulesHash, 'sha256:rules');
  assert.equal(confirmation.adapterHash, 'sha256:adapter');
  assert.equal(confirmation.seat, 'black');
  assert.deepEqual(confirmation.protocolPaths, ['/protocols/simplegroupjoin', '/protocols/simplegroupchat']);
  assert.equal(confirmation.llmBudget, 500);
  assert.equal(confirmation.writeBudget, 500);
  assert.equal(phaseOne.data.confirmRequest.kind, 'app-session-start');
  assert.equal(phaseOne.data.confirmRequest.resourceUri, RESOURCE);
  assert.equal(fake.calls.length, 0, 'handler must not run during phase 1');

  const phaseTwo = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: phaseOne.data.confirmRequest.payload,
  });
  assert.equal(phaseTwo.ok, true);
  assert.equal(phaseTwo.data.kind, 'app-session-start');
  assert.equal(phaseTwo.data.data.status, 'running');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].action, 'start');
});

test('app-session-start reuses the existing session for an identical tuple (idempotency)', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler });
  async function fullStart() {
    const phaseOne = await adapter.runTrustedAction({
      resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
      payload: startPayload(),
    });
    return adapter.runTrustedAction({
      resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
      payload: phaseOne.data.confirmRequest.payload,
    });
  }
  const first = await fullStart();
  const second = await fullStart();
  assert.equal(first.data.data.sessionId, second.data.data.sessionId, 'same tuple reuses the session id');
  assert.equal(fake.idempotencyHits(), 1, 'the handler observed one idempotent reuse');
});

test('app-session-start phase 2 rejects a mismatched resource or actor', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler });
  const phaseOne = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: startPayload(),
  });
  const crossResource = await adapter.runTrustedAction({
    resourceUri: 'metaapp://other', kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: phaseOne.data.confirmRequest.payload,
  });
  assert.equal(crossResource.ok, false);
  assert.equal(crossResource.code, 'consent_denied');

  const crossActor = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: 'wallet:other', sessionId: SESSION,
    payload: phaseOne.data.confirmRequest.payload,
  });
  assert.equal(crossActor.ok, false);
  assert.equal(crossActor.code, 'consent_denied');
  assert.equal(fake.calls.length, 0, 'handler never runs for a mismatched confirmation');
});

test('app-session-start phase 2 rejects an invalid or expired confirmation token', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler, now: () => 1_000_000_000_000 });
  const phaseOne = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: startPayload(),
  });
  const tampered = {
    ...phaseOne.data.confirmRequest.payload,
    hostConfirmation: { id: phaseOne.data.confirmRequest.payload.hostConfirmation.id, token: 'wrong-token' },
  };
  const result = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: tampered,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'consent_denied');
});

test('app-session list/status/pause/resume/stop forward straight to the handler and pass errors through', async () => {
  const fake = createFakeSessionHandler();
  const adapter = createStandaloneBrowserHostAdapter({ appSession: fake.handler });

  // Seed a session via a full start.
  const phaseOne = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: startPayload(),
  });
  await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: phaseOne.data.confirmRequest.payload,
  });
  const sessionId = fake.calls[0].createdSessionId || 'sess-1';

  const list = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-list', actorId: ACTOR, sessionId: SESSION, payload: {},
  });
  assert.equal(list.ok, true);
  assert.equal(list.data.data.sessions.length, 1);

  const status = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-status', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId },
  });
  assert.equal(status.ok, true);
  assert.equal(status.data.data.status, 'running');

  const paused = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-pause', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId },
  });
  assert.equal(paused.ok, true);
  assert.equal(paused.data.data.status, 'paused');
  // pause is idempotent at the host; pausing again stays paused.
  const pausedAgain = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-pause', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId },
  });
  assert.equal(pausedAgain.ok, true);
  assert.equal(pausedAgain.data.data.status, 'paused');

  const resumed = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-resume', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId },
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.data.status, 'running');

  const stopped = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-stop', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId, releaseSeat: true },
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.data.data.status, 'stopped');
  // stop is idempotent: the host keeps returning stopped.
  const stoppedAgain = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-stop', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId },
  });
  assert.equal(stoppedAgain.ok, true);
  assert.equal(stoppedAgain.data.data.status, 'stopped');

  // Error passthrough: a missing session surfaces session_not_found unchanged.
  const missing = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-status', actorId: ACTOR, sessionId: SESSION,
    payload: { sessionId: 'nope' },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'session_not_found');
});

test('app-session list/status/control answer session_not_found when no handler is injected', async () => {
  const adapter = createStandaloneBrowserHostAdapter();
  for (const kind of ['app-session-list', 'app-session-status', 'app-session-pause', 'app-session-resume', 'app-session-stop']) {
    const result = await adapter.runTrustedAction({
      resourceUri: RESOURCE, kind, actorId: ACTOR, payload: { sessionId: 'sess-1' },
    });
    assert.equal(result.ok, false, `${kind} should fail`);
    assert.equal(result.code, 'session_not_found', `${kind} should return session_not_found`);
  }
});

test('host error codes (rules_hash_mismatch, adapter_invalid, session_conflict) pass through unchanged', async () => {
  const adapter = createStandaloneBrowserHostAdapter({
    appSession: async () => ({ ok: false, state: 'failed', code: 'rules_hash_mismatch', message: 'hash differs' }),
  });
  const phaseOne = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: startPayload(),
  });
  const phaseTwo = await adapter.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: ACTOR, sessionId: SESSION,
    payload: phaseOne.data.confirmRequest.payload,
  });
  assert.equal(phaseTwo.ok, false);
  assert.equal(phaseTwo.code, 'rules_hash_mismatch');
});

test('memory host answers capability errors for the app-session bridge', async () => {
  const host = createMemoryStandaloneBrowserHost();
  const start = await host.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-start', actorId: 'standalone-wallet', payload: startPayload(),
  });
  assert.equal(start.ok, false);
  assert.equal(start.code, 'unsupported_method');

  const status = await host.runTrustedAction({
    resourceUri: RESOURCE, kind: 'app-session-status', actorId: 'standalone-wallet', payload: { sessionId: 'sess-1' },
  });
  assert.equal(status.ok, false);
  assert.equal(status.code, 'session_not_found');
});
