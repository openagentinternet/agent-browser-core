import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  browserFailure,
  browserManualActionRequired,
  browserSuccess,
  browserWaiting,
} from '../../packages/host-contract/dist/index.js';
import { assertBrowserHostConformance } from '../../packages/test-harness/dist/index.js';

function createResolveResult(uri, overrides = {}) {
  return {
    uri,
    normalizedUri: uri,
    resourceType: 'bot',
    title: 'Fake Bot',
    owner: {
      kind: 'bot',
      globalMetaId: 'idq1fake',
      name: 'Fake Bot',
      verificationState: 'verified',
    },
    renderer: { type: 'bot-page', contentType: 'application/json', templateId: 'document' },
    status: { state: 'resolved', verificationState: 'verified', message: 'Resolved fake bot.' },
    source: { resolver: 'fake-conformance' },
    actions: [],
    ...overrides,
  };
}

function createConformantAdapter(overrides = {}) {
  const adapter = {
    async getRuntime() {
      return browserSuccess({
        host: { kind: 'standalone', name: 'Fake Browser', localMode: false },
        actors: [],
        defaultActor: null,
        defaultUri: null,
        features: {
          privateChat: false,
          serviceCall: false,
          cacheManagement: true,
          templateSettings: true,
          walletLogin: true,
        },
        labels: {
          actorChip: 'Wallet',
          noActorTitle: 'Connect Wallet',
          noActorBody: 'Connect a wallet to use Browser actions.',
          noActorAction: { label: 'Connect Wallet', actionKind: 'login' },
        },
      });
    },
    async resolveResource(input) {
      return browserSuccess(createResolveResult(input.uri));
    },
    async getSettings() {
      return browserSuccess({
        browser: {},
        effectiveBrowser: {},
        defaults: {},
      });
    },
    async updateSettings(input) {
      assert.equal(input.browser.botHomepageTemplateId, 'document');
      return browserSuccess({
        browser: input.browser ?? {},
        effectiveBrowser: input.browser ?? {},
        defaults: {},
      });
    },
    async getCache() {
      return browserSuccess({ cacheRoot: 'fake', artifactCount: 0 });
    },
    async clearCache(input) {
      assert.equal(input.all, true);
      return browserSuccess({ cacheRoot: 'fake', clearedArtifacts: 0 });
    },
    async runTrustedAction(input) {
      return browserFailure('browser_action_not_supported', `Unsupported action: ${input.kind}`);
    },
  };

  return { ...adapter, ...overrides };
}

test('fake standalone host satisfies Browser host conformance', async () => {
  const adapter = createConformantAdapter();

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});

test('host conformance rejects resolve results missing mature Browser fields', async () => {
  const adapter = createConformantAdapter({
    async resolveResource(input) {
      return browserSuccess({
        uri: input.uri,
        normalizedUri: input.uri,
        resourceType: 'bot',
        title: 'Fake Bot',
        renderer: { type: 'bot-page', contentType: 'application/json', templateId: 'document' },
        actions: [],
      });
    },
  });

  await assert.rejects(
    () => assertBrowserHostConformance({
      adapter,
      expectedHostKind: 'standalone',
      sampleUri: 'metaid://idq1fake',
    }),
    /resolveResource owner/,
  );
});

test('host conformance rejects invalid mature Browser enum values', async () => {
  const cases = [
    {
      label: 'resourceType',
      overrides: { resourceType: 'host-login' },
      pattern: /resolveResource resourceType/,
    },
    {
      label: 'owner.kind',
      overrides: { owner: { kind: 'person', name: 'Fake Bot', verificationState: 'verified' } },
      pattern: /resolveResource owner kind/,
    },
    {
      label: 'renderer.type',
      overrides: { renderer: { type: 'native-view', contentType: 'application/json' } },
      pattern: /resolveResource renderer type/,
    },
    {
      label: 'status.state',
      overrides: { status: { state: 'done', verificationState: 'verified', message: 'Resolved fake bot.' } },
      pattern: /resolveResource status state/,
    },
    {
      label: 'status.verificationState',
      overrides: { status: { state: 'resolved', verificationState: 'trusted', message: 'Resolved fake bot.' } },
      pattern: /resolveResource status verificationState/,
    },
    {
      label: 'proof.verificationState',
      overrides: { proof: { verificationState: 'trusted' } },
      pattern: /resolveResource proof verificationState/,
    },
    {
      label: 'actions.kind',
      overrides: { actions: [{ id: 'login', label: 'Login', kind: 'login' }] },
      pattern: /resolveResource action kind/,
    },
  ];

  for (const { label, overrides, pattern } of cases) {
    const adapter = createConformantAdapter({
      async resolveResource(input) {
        return browserSuccess(createResolveResult(input.uri, overrides));
      },
    });

    await assert.rejects(
      () => assertBrowserHostConformance({
        adapter,
        expectedHostKind: 'standalone',
        sampleUri: `metaid://idq1fake-${label}`,
      }),
      pattern,
    );
  }
});

test('host conformance accepts successful trusted actions', async () => {
  const adapter = createConformantAdapter({
    async runTrustedAction(input) {
      return browserSuccess({ kind: input.kind, handled: true });
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});

test('host conformance accepts MetaApp bridge trusted action kinds', async () => {
  let called = false;
  const adapter = createConformantAdapter({
    async runTrustedAction(input) {
      if (input.kind === 'metaid-pin-write') {
        called = true;
        return browserSuccess({
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
            },
          },
        });
      }
      return browserFailure('unsupported_action', `Unsupported action: ${input.kind}`);
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
    trustedAction: {
      resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
      kind: 'metaid-pin-write',
      payload: {
        operation: 'create',
        path: '/protocols/simplebuzz',
        encryption: '0',
        version: '1.0.0',
        contentType: 'application/json;utf-8',
        payload: { encoding: 'utf8', value: '{"content":"hello"}' },
      },
    },
  });

  assert.equal(called, true);
});

test('host conformance accepts MetaApp bridge v1.1 trusted action kinds', async () => {
  const seen = [];
  const adapter = createConformantAdapter({
    async runTrustedAction(input) {
      if (input.kind === 'llm-complete') {
        seen.push('llm-complete');
        return browserSuccess({
          kind: 'llm-complete',
          handled: true,
          data: { text: 'h2e2', model: 'gpt-5.6', finishReason: 'stop' },
        });
      }
      if (input.kind === 'permissions-request') {
        seen.push('permissions-request');
        return browserSuccess({
          kind: 'permissions-request',
          handled: true,
          data: {
            granted: [{ method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' }],
          },
        });
      }
      return browserFailure('unsupported_action', `Unsupported action: ${input.kind}`);
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
    trustedAction: {
      resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
      kind: 'llm-complete',
      sessionId: 'session-1',
      payload: {
        messages: [{ role: 'user', content: 'board' }],
        purpose: 'llmchess-move',
      },
    },
  });

  const llm = await adapter.runTrustedAction({
    resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    kind: 'llm-complete',
    payload: { messages: [{ role: 'user', content: 'board' }] },
  });
  assert.equal(llm.ok, true);
  assert.equal(llm.data.data.text, 'h2e2');

  const permissions = await adapter.runTrustedAction({
    resourceUri: 'metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
    kind: 'permissions-request',
    sessionId: 'session-2',
    payload: {
      grants: [{ method: 'metaid.pin.write', operation: 'create', path: '/protocols/simplegroupchat' }],
    },
  });
  assert.equal(permissions.ok, true);
  assert.equal(permissions.data.data.granted.length, 1);
  // The harness itself invokes the configured trustedAction once, then the two
  // explicit calls below round out the coverage.
  assert.deepEqual(seen, ['llm-complete', 'llm-complete', 'permissions-request']);
});

test('host conformance accepts waiting trusted actions', async () => {
  const adapter = createConformantAdapter({
    async runTrustedAction() {
      return browserWaiting('payment_pending', 'Payment is pending.', { pollAfterMs: 1000 });
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});

test('host conformance accepts manual-action trusted actions', async () => {
  const adapter = createConformantAdapter({
    async runTrustedAction() {
      return browserManualActionRequired('wallet_required', 'Connect a wallet.', {
        action: { label: 'Connect wallet', route: '/browser/login' },
      });
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});

test('host conformance accepts protocol resources and open-conversation actions', async () => {
  const adapter = createConformantAdapter({
    async resolveResource(input) {
      return browserSuccess(createResolveResult(input.uri, {
        resourceType: 'protocol',
        title: 'Protocol Buzz',
        renderer: {
          type: 'protocol-pin',
          contentType: 'application/json',
          data: {
            rendererId: 'simplebuzz.detail',
            protocolPath: '/protocols/simplebuzz',
          },
        },
        actions: [{
          id: 'open-conversation',
          label: 'Conversation',
          kind: 'open-conversation',
          enabled: true,
          requiresUsingIdentity: true,
          payload: {
            conversationUri: 'map://simplemsg/conversation?peer=idq1peer',
            peerGlobalMetaId: 'idq1peer',
          },
        }],
        proof: {
          pinId: '6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
          protocolPath: '/protocols/simplebuzz',
          verificationState: 'partial',
        },
      }));
    },
  });

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0',
  });
});
