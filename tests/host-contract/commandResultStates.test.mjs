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
