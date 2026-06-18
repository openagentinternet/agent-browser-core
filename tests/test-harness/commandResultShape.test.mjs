import assert from 'node:assert/strict';
import { test } from 'node:test';

const contract = await import('../../packages/host-contract/dist/index.js');
const harness = await import('../../packages/test-harness/dist/index.js');

test('assertBrowserCommandResultShape accepts every valid command state', () => {
  harness.assertBrowserCommandResultShape(contract.browserSuccess({ ok: true }), 'success');
  harness.assertBrowserCommandResultShape(contract.browserFailure('failed_code', 'Failed message.'), 'failed');
  harness.assertBrowserCommandResultShape(contract.browserWaiting('wait_code', 'Wait message.', {
    pollAfterMs: 1000,
    action: { label: 'Poll', pollUrl: '/api/browser/poll/1' },
  }), 'waiting');
  harness.assertBrowserCommandResultShape(contract.browserManualActionRequired('manual_code', 'Manual message.', {
    action: { label: 'Open', href: 'https://example.test/action' },
  }), 'manual');
});

test('assertBrowserCommandResultShape rejects invalid command state objects', () => {
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'waiting', code: '', message: 'Missing code.' }, 'bad'),
    /bad code/,
  );
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'manual_action_required', code: 'x', message: '' }, 'bad'),
    /bad message/,
  );
  assert.throws(
    () => harness.assertBrowserCommandResultShape({ ok: false, state: 'unknown', code: 'x', message: 'x' }, 'bad'),
    /bad state/,
  );
});

test('Browser command shape accepts conversation href follow-up actions', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserManualActionRequired('identity_required', 'Select a local Bot.', {
      action: {
        label: 'Open conversation',
        href: '/ui/conversations?local=idq1local&peer=idq1peer',
      },
      data: {
        conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
      },
    }),
    'open-conversation',
  );
});
