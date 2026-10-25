import assert from 'node:assert/strict';
import { test } from 'node:test';

const contract = await import('../../packages/host-contract/dist/index.js');

test('command helpers create success failed waiting and manual action results', () => {
  assert.deepEqual(contract.browserSuccess({ ok: 1 }), {
    ok: true,
    state: 'success',
    data: { ok: 1 },
  });

  assert.deepEqual(contract.browserFailure('bad_input', 'Bad input.', { data: { field: 'uri' } }), {
    ok: false,
    state: 'failed',
    code: 'bad_input',
    message: 'Bad input.',
    data: { field: 'uri' },
  });

  assert.deepEqual(contract.browserWaiting('trace_pending', 'Trace is still running.', {
    pollAfterMs: 1500,
    action: { label: 'Open trace', route: '/trace/abc' },
    data: { traceId: 'abc' },
  }), {
    ok: false,
    state: 'waiting',
    code: 'trace_pending',
    message: 'Trace is still running.',
    pollAfterMs: 1500,
    action: { label: 'Open trace', route: '/trace/abc' },
    data: { traceId: 'abc' },
  });

  assert.deepEqual(contract.browserManualActionRequired('wallet_login_required', 'Connect a wallet.', {
    action: { label: 'Connect wallet', route: '/browser/login' },
  }), {
    ok: false,
    state: 'manual_action_required',
    code: 'wallet_login_required',
    message: 'Connect a wallet.',
    action: { label: 'Connect wallet', route: '/browser/login' },
  });
});

test('actor kind grouping classifies known kinds and stays neutral for unknown kinds', () => {
  // Known kinds: human-side and bot-side identities are distinguishable.
  assert.equal(contract.browserActorKindGroup('wallet'), 'human');
  assert.equal(contract.browserActorKindGroup('idbots-account'), 'human');
  assert.equal(contract.browserActorKindGroup('idbots-agent'), 'bot');
  assert.equal(contract.browserActorKindGroup('oac-bot'), 'bot');

  // Every kind ABC ships is classified — adding a kind without a group is a
  // contract change that must be deliberate.
  const kinds = ['wallet', 'oac-bot', 'idbots-agent', 'idbots-account'];
  for (const kind of kinds) {
    assert.notEqual(contract.browserActorKindGroup(kind), 'unknown', `${kind} must stay classified`);
  }

  // Unrecognized kinds are never guessed as Human or Bot.
  assert.equal(contract.browserActorKindGroup('some-future-kind'), 'unknown');
  assert.equal(contract.browserActorKindGroup('human'), 'unknown');
  assert.equal(contract.browserActorKindGroup(''), 'unknown');
  assert.equal(contract.browserActorKindGroup(undefined), 'unknown');
  assert.equal(contract.browserActorKindGroup(null), 'unknown');
  assert.equal(contract.browserActorKindGroup('  wallet  '), 'human', 'whitespace is trimmed');

  // Object.prototype keys must resolve to 'unknown', not leak the inherited
  // property value (e.g. the Object constructor) through the lookup.
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf', 'isPrototypeOf']) {
    const group = contract.browserActorKindGroup(key);
    assert.equal(typeof group, 'string', `${key} must resolve to a group string`);
    assert.equal(group, 'unknown', `${key} must stay neutral instead of hitting Object.prototype`);
  }
});
