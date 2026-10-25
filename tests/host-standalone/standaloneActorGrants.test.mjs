import assert from 'node:assert/strict';
import test from 'node:test';

const standalone = await import('../../packages/host-standalone/dist/index.js');

const RESOURCE_URI = 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0';
const GRANT_PATH = '/protocols/simplegroupchat';
const CHAT_GRANT = { method: 'metaid.pin.write', operation: 'create', path: GRANT_PATH };

function pinWritePayload(path = GRANT_PATH) {
  return {
    operation: 'create',
    path,
    encryption: '0',
    version: '1.0.0',
    contentType: 'application/json;utf-8',
    payload: { encoding: 'utf8', value: '{"app":"actor-grant-test"}' },
  };
}

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

// The memory development host records session grants without the two-phase
// card, so the (resourceUri, actorId, operation, path) binding of a granted
// write is checked directly by metaid-pin-write. This is the regression test
// for the actorId omission: before the fix, a grant issued while
// 'standalone-wallet' was selected also covered a write as 'wallet:<address>'
// (a different actor after a switch), silently skipping confirmation under the
// wrong identity.
test('memory host grants do not cover a PIN write as a different actor', async () => {
  const host = standalone.createMemoryStandaloneBrowserHost();
  const sessionId = 'memory-session-1';

  const granted = await host.runTrustedAction({
    actorId: 'standalone-wallet',
    resourceUri: RESOURCE_URI,
    kind: 'permissions-request',
    sessionId,
    payload: { grants: [CHAT_GRANT], reason: 'memory host actor binding' },
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.data.data.granted.length, 1);

  // Same actor: the grant applies, confirmation is skipped (and the write then
  // fails honestly because the memory host has no signer).
  const ownWrite = await host.runTrustedAction({
    actorId: 'standalone-wallet',
    resourceUri: RESOURCE_URI,
    kind: 'metaid-pin-write',
    sessionId,
    payload: pinWritePayload(),
  });
  assert.equal(ownWrite.ok, false);
  assert.equal(ownWrite.state, 'failed');
  assert.equal(ownWrite.code, 'pin_write_failed');

  // A different actor (the wallet-alias identity a user switches to) must NOT
  // inherit the grant: the write falls back to the confirmation-required error
  // instead of skipping confirmation as the previous actor.
  const switchedWrite = await host.runTrustedAction({
    actorId: 'wallet:12ghVWG1yAgNjzXj4mr3qK9DgyornMUikZ',
    resourceUri: RESOURCE_URI,
    kind: 'metaid-pin-write',
    sessionId,
    payload: pinWritePayload(),
  });
  assert.equal(switchedWrite.ok, false);
  assert.equal(switchedWrite.state, 'manual_action_required');
  assert.equal(switchedWrite.code, 'browser_identity_required');
  assert.notEqual(switchedWrite.code, 'pin_write_failed', 'actor switch must fail closed, not reuse the grant');

  // A forged actor id never reaches grant lookup at all.
  const forgedWrite = await host.runTrustedAction({
    actorId: 'forged-actor-id',
    resourceUri: RESOURCE_URI,
    kind: 'metaid-pin-write',
    sessionId,
    payload: pinWritePayload(),
  });
  assert.equal(forgedWrite.ok, false);
  assert.equal(forgedWrite.code, 'actor_not_found');
});

test('memory host grants stay bound to operation and path for the same actor', async () => {
  const host = standalone.createMemoryStandaloneBrowserHost();

  await host.runTrustedAction({
    actorId: 'standalone-wallet',
    resourceUri: RESOURCE_URI,
    kind: 'permissions-request',
    sessionId: 'memory-session-2',
    payload: { grants: [CHAT_GRANT] },
  });

  const modifyWrite = await host.runTrustedAction({
    actorId: 'standalone-wallet',
    resourceUri: RESOURCE_URI,
    kind: 'metaid-pin-write',
    sessionId: 'memory-session-2',
    payload: {
      ...pinWritePayload(),
      operation: 'modify',
      path: `${GRANT_PATH}@6d3cc874b5f09b0eed5efe283530fbf22b9e27769a34ceadfd150cdb9e1dc753i0`,
    },
  });
  assert.equal(modifyWrite.state, 'manual_action_required', 'only create is grant-eligible');

  const otherPathWrite = await host.runTrustedAction({
    actorId: 'standalone-wallet',
    resourceUri: RESOURCE_URI,
    kind: 'metaid-pin-write',
    sessionId: 'memory-session-2',
    payload: pinWritePayload('/protocols/simplegroupjoin'),
  });
  assert.equal(otherPathWrite.state, 'manual_action_required', 'grants cover exact paths only');
});

// The real standalone adapter implements the two-phase permissions card. Both
// the confirmation token and the recorded grant are bound to the actor: after
// switching identities, replaying the earlier actor's authorization must fail
// closed.
test('standalone adapter rejects confirmation and grant replay across actors', async (t) => {
  const server = standalone.createStandaloneBrowserServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = await listen(server);
  const walletActorId = 'wallet:12ghVWG1yAgNjzXj4mr3qK9DgyornMUikZ';
  const sessionId = 'adapter-session-1';

  async function postAction(actorId, kind, payload) {
    const response = await fetch(`${baseUrl}/api/browser/actions?actorId=${encodeURIComponent(actorId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceUri: RESOURCE_URI, kind, sessionId, payload }),
    });
    return response.json();
  }

  // The wallet actor requests the same grant and gets its own confirmation.
  const walletPhaseOne = await postAction(walletActorId, 'permissions-request', {
    grants: [CHAT_GRANT],
    reason: 'actor binding',
  });
  assert.equal(walletPhaseOne.state, 'manual_action_required');
  assert.ok(walletPhaseOne.data.confirmRequest.payload.hostConfirmation);

  // Confirming as a DIFFERENT actor (standalone-wallet) with the wallet
  // actor's token is an actor mismatch and fails closed.
  const crossConfirm = await postAction('standalone-wallet', 'permissions-request', {
    ...walletPhaseOne.data.confirmRequest.payload,
  });
  assert.equal(crossConfirm.ok, false);
  assert.equal(crossConfirm.code, 'consent_denied');
  assert.match(crossConfirm.message, /does not match this resource or actor/);

  // The mismatched attempt consumed the single-use token: the rightful actor
  // cannot confirm with it either — no silent retry path remains.
  const staleConfirm = await postAction(walletActorId, 'permissions-request', {
    ...walletPhaseOne.data.confirmRequest.payload,
  });
  assert.equal(staleConfirm.ok, false);
  assert.equal(staleConfirm.code, 'consent_denied');

  // Grant replay across actors: standalone-wallet confirms its own grant...
  const hostPhaseOne = await postAction('standalone-wallet', 'permissions-request', {
    grants: [CHAT_GRANT],
    reason: 'actor binding',
  });
  assert.equal(hostPhaseOne.state, 'manual_action_required');
  const hostConfirm = await postAction('standalone-wallet', 'permissions-request', {
    ...hostPhaseOne.data.confirmRequest.payload,
  });
  assert.equal(hostConfirm.ok, true);

  // ...and the wallet actor must not inherit that grant on the same resource,
  // session, and path after switching.
  const switchedWrite = await postAction(walletActorId, 'metaid-pin-write', pinWritePayload());
  assert.equal(switchedWrite.state, 'manual_action_required');
  assert.equal(switchedWrite.code, 'browser_identity_required');

  // The granting actor itself still hits the grant (skipped confirmation, then
  // the honest no-signer failure).
  const ownWrite = await postAction('standalone-wallet', 'metaid-pin-write', pinWritePayload());
  assert.equal(ownWrite.state, 'failed');
  assert.equal(ownWrite.code, 'pin_write_failed');
});
