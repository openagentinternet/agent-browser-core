import { test } from 'node:test';
import {
  browserFailure,
  browserSuccess,
} from '../../packages/host-contract/dist/index.js';
import { assertBrowserHostConformance } from '../../packages/test-harness/dist/index.js';

test('fake standalone host satisfies Browser host conformance', async () => {
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
          noActorBody: 'Connect Metalet to use Browser actions.',
          noActorAction: { label: 'Connect Wallet', actionKind: 'login' },
        },
      });
    },
    async resolveResource(input) {
      return browserSuccess({
        uri: input.uri,
        normalizedUri: input.uri,
        resourceType: 'bot',
        title: 'Fake Bot',
        owner: {
          kind: 'bot',
          globalMetaId: 'idq1fake',
          label: 'Fake Bot',
          verificationState: 'verified',
        },
        ownerAffinity: null,
        renderer: { type: 'bot-page', contentType: 'application/json', templateId: 'document' },
        actions: [],
        sections: [],
      });
    },
    async getSettings() {
      return browserSuccess({
        browser: {},
        effectiveBrowser: {},
        defaults: {},
      });
    },
    async updateSettings(input) {
      return browserSuccess({
        browser: input.browser ?? {},
        effectiveBrowser: input.browser ?? {},
        defaults: {},
      });
    },
    async getCache() {
      return browserSuccess({ cacheRoot: 'fake', artifactCount: 0 });
    },
    async clearCache() {
      return browserSuccess({ cacheRoot: 'fake', clearedArtifacts: 0 });
    },
    async runTrustedAction(input) {
      return browserFailure('browser_action_not_supported', `Unsupported action: ${input.kind}`);
    },
  };

  await assertBrowserHostConformance({
    adapter,
    expectedHostKind: 'standalone',
    sampleUri: 'metaid://idq1fake',
  });
});
