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

test('Browser command shape accepts MetaID PIN write data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'metaid-pin-write',
      handled: true,
      data: {
        pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
        txid: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7',
        operation: 'create',
        path: '/protocols/simplebuzz',
        actor: {
          uri: 'metaid://idq1actor',
          globalMetaId: 'idq1actor',
          name: 'Actor',
          avatarPinId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaai0',
        },
      },
    }),
    'metaid-pin-write',
  );
});

test('Browser command shape accepts MetaFile upload data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'metafile-upload',
      handled: true,
      data: {
        files: [{
          pinId: '7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          uri: 'metafile://7ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0.pdf',
          name: 'paper.pdf',
          size: 1234,
          contentType: 'application/pdf',
          actor: {
            uri: 'metaid://idq1actor',
            globalMetaId: 'idq1actor',
            name: 'Actor',
          },
        }],
      },
    }),
    'metafile-upload',
  );
});

test('Browser command shape accepts LLM completion data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'llm-complete',
      handled: true,
      data: {
        text: 'h2e2',
        model: 'gpt-5.6',
        finishReason: 'stop',
      },
    }),
    'llm-complete',
  );
});

test('Browser command shape accepts protocol permission grant data', () => {
  harness.assertBrowserCommandResultShape(
    contract.browserSuccess({
      kind: 'permissions-request',
      handled: true,
      data: {
        granted: [{
          method: 'metaid.pin.write',
          operation: 'create',
          path: '/protocols/simplegroupchat',
        }],
      },
    }),
    'permissions-request',
  );
});
