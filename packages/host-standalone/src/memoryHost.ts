import {
  applyBrowserSettingsUpdate,
  buildBotHomepageEnvelope,
  createBrowserSettingsSnapshot,
  parseBrowserUri,
  type BrowserConfigContainer,
  type BrowserSettingsSnapshot as CoreBrowserSettingsSnapshot,
} from '@openagentinternet/agent-browser-core';
import {
  browserFailure,
  browserManualActionRequired,
  browserSuccess,
  browserWaiting,
  type BrowserActor,
  type BrowserHostAdapter,
  type BrowserResourceEnvelope,
  type BrowserRuntimeSnapshot,
  type BrowserSettingsSnapshot,
} from '@openagentinternet/agent-browser-host-contract';

const STANDALONE_ACTOR_ID = 'standalone-wallet';

export interface MemoryStandaloneHostInput {
  now?: () => number;
  defaultUri?: string;
}

function fixtureHomepage(): Record<string, unknown> {
  return {
    schemaVersion: 'botHomepage.v3',
    identity: {
      globalMetaId: 'idq1fixturebot',
      legacyMetaId: 'metaid-fixture',
      display: 'idq1fixture...bot',
    },
    profile: {
      name: 'Fixture Bot',
      avatar: {
        pinId: 'avatar-pin',
        contentType: 'image/png',
      },
      bio: 'Builds Agent Browser fixtures.',
      homepage: null,
      pins: {
        name: 'name-pin',
        bio: 'bio-pin',
      },
    },
    presence: {
      state: 'online',
      updatedAt: null,
      source: 'memory-fixture',
    },
    sections: [
      {
        id: 'services',
        title: 'Services',
        items: [
          {
            pinId: 'service-pin-1',
            protocolPath: '/protocols/skill-service',
            data: {
              payload: {
                displayName: 'Fixture Review',
                description: 'Reviews Browser templates.',
              },
            },
          },
        ],
      },
      {
        id: 'buzzes',
        title: 'Buzz',
        items: [
          {
            pinId: 'buzz-pin-1',
            protocolPath: '/protocols/simplebuzz',
            data: {
              payload: {
                content: 'A Bot homepage served by the standalone development host.',
              },
            },
          },
        ],
      },
      {
        id: 'metaapps',
        title: 'MetaApps',
        items: [
          {
            pinId: 'metaapp-pin-1',
            protocolPath: '/protocols/metaapp',
            data: {
              payload: {
                title: 'Fixture MetaApp',
                appName: 'Fixture MetaApp',
                intro: 'Creates Bot homepage layouts.',
              },
            },
          },
        ],
      },
    ],
    warnings: [],
  };
}

function runtime(defaultUri: string): BrowserRuntimeSnapshot {
  const actor: BrowserActor = {
    id: STANDALONE_ACTOR_ID,
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  };
  return {
    host: {
      kind: 'standalone',
      name: 'Agent Internet Browser',
      localMode: false,
    },
    actors: [actor],
    defaultActor: actor,
    defaultUri,
    features: {
      privateChat: false,
      serviceCall: false,
      cacheManagement: true,
      templateSettings: true,
      walletLogin: false,
    },
    labels: {
      actorChip: 'Wallet',
      noActorTitle: 'No Wallet',
      noActorBody: 'Standalone Browser is running with an in-memory development actor.',
    },
  };
}

function toHostSettingsSnapshot(snapshot: CoreBrowserSettingsSnapshot): BrowserSettingsSnapshot {
  return {
    browser: { ...snapshot.browser },
    effectiveBrowser: { ...snapshot.effectiveBrowser },
    defaults: { ...snapshot.defaults },
  };
}

export function createMemoryStandaloneBrowserHost(input: MemoryStandaloneHostInput = {}): BrowserHostAdapter {
  const now = input.now ?? Date.now;
  const defaultUri = input.defaultUri ?? 'metaid://idq1fixturebot';
  let config: BrowserConfigContainer = { browser: { botHomepageTemplateId: 'document' } };
  let settings: BrowserSettingsSnapshot = toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config }));
  let cacheClearedAt: number | null = null;

  function ensureActor(actorId?: string) {
    if (actorId && actorId !== STANDALONE_ACTOR_ID) {
      return browserFailure('actor_not_found', `Standalone Browser actor not found: ${actorId}`);
    }
    return null;
  }

  function resolveMetaapp(uri: string, normalizedUri: string): BrowserResourceEnvelope {
    return {
      uri,
      normalizedUri,
      resourceType: 'metaapp',
      title: 'Fixture MetaApp',
      owner: {
        kind: 'metaapp-publisher',
        globalMetaId: 'idq1fixturebot',
        name: 'Fixture Publisher',
        label: 'Fixture Publisher',
        verificationState: 'partial',
      },
      ownerAffinity: null,
      renderer: {
        type: 'html-iframe',
        contentType: 'text/html',
        url: 'https://example.com/metaapp-preview.html',
      },
      actions: [],
      sections: [],
      status: {
        state: 'resolved',
        verificationState: 'partial',
        message: '',
      },
      proof: {
        pinId: normalizedUri.slice('metaapp://'.length),
        verificationState: 'partial',
      },
      source: {
        resolver: 'standalone-memory',
        fetchedAt: now(),
      },
    };
  }

  return {
    async getRuntime(actorInput = {}) {
      const failure = ensureActor(actorInput.actorId);
      return failure ?? browserSuccess(runtime(defaultUri));
    },
    async resolveResource(resolveInput) {
      const failure = ensureActor(resolveInput.actorId);
      if (failure) return failure;
      try {
        const parsed = parseBrowserUri(resolveInput.uri);
        if (parsed.scheme === 'metaid') {
          return browserSuccess(buildBotHomepageEnvelope({
            uri: parsed.originalUri,
            normalizedUri: parsed.normalizedUri,
            homepage: fixtureHomepage(),
            resolverUrl: 'memory://bot-homepage/idq1fixturebot',
            templateId: String(settings.effectiveBrowser.botHomepageTemplateId ?? 'document'),
            fetchedAt: now(),
          }));
        }
        return browserSuccess(resolveMetaapp(parsed.originalUri, parsed.normalizedUri));
      } catch (error) {
        return browserFailure('invalid_browser_uri', error instanceof Error ? error.message : String(error));
      }
    },
    async getSettings(_actorInput = {}) {
      return browserSuccess(settings);
    },
    async updateSettings(input) {
      try {
        config = applyBrowserSettingsUpdate(config, input.browser);
        settings = toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config }));
        return browserSuccess(settings);
      } catch (error) {
        return browserFailure('invalid_argument', error instanceof Error ? error.message : String(error));
      }
    },
    async getCache(actorInput = {}) {
      const failure = ensureActor(actorInput.actorId);
      if (failure) return failure;
      return browserSuccess({
        cacheRoot: 'standalone-memory',
        artifactCount: 0,
        pinRecordCount: 0,
        totalBytes: 0,
        lastClearedAt: cacheClearedAt,
      });
    },
    async clearCache(input) {
      const failure = ensureActor(input.actorId);
      if (failure) return failure;
      const scope = input.scope ?? 'all';
      if (!['all', 'artifact', 'pin'].includes(scope)) {
        return browserFailure('invalid_argument', 'Unsupported Browser cache clear scope.');
      }
      cacheClearedAt = now();
      return browserSuccess({
        cacheRoot: 'standalone-memory',
        clearedArtifacts: 0,
        clearedPinRecords: 0,
        scope,
        lastClearedAt: cacheClearedAt,
      });
    },
    async runTrustedAction(input) {
      const failure = ensureActor(input.actorId);
      if (failure) return failure;
      if (input.kind === 'login') {
        return browserManualActionRequired('wallet_login_required', 'Connect a wallet in the standalone host.', {
          action: { label: 'Connect wallet', route: '/browser/login' },
        });
      }
      if (input.kind === 'service-call') {
        return browserWaiting('service_call_pending', 'Standalone service call is queued in the development host.', {
          pollAfterMs: 1000,
          action: { label: 'Open request status', route: '/browser/requests/dev-service-call' },
          data: { requestId: 'dev-service-call' },
        });
      }
      return browserFailure('browser_action_not_supported', `Standalone Browser does not support trusted action: ${input.kind}`);
    },
  };
}
