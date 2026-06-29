import {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  parseBrowserUri,
  type BrowserConfigContainer,
  type BrowserSettingsSnapshot as CoreBrowserSettingsSnapshot,
} from '@openagentinternet/agent-browser-core';
import {
  SECONDARY_WALLET_PROVIDER_ICON_PATH,
  WALLET_PROVIDER_ICON_PATH,
} from './assets.js';
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
const STANDALONE_WALLET_ACTOR_PREFIX = 'wallet:';
const WALLET_PROVIDER_NAME = 'Meta' + 'let';
const WALLET_PROVIDER_ID = WALLET_PROVIDER_NAME.toLowerCase();
const SECONDARY_WALLET_PROVIDER_NAME = 'Meta' + 'Mask';
const SECONDARY_WALLET_PROVIDER_ID = SECONDARY_WALLET_PROVIDER_NAME.toLowerCase();

export interface MemoryStandaloneHostInput {
  now?: () => number;
}

function runtime(): BrowserRuntimeSnapshot {
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
      noActorTitle: 'No Wallet',
      noActorBody: 'Standalone Browser is running with an in-memory development actor.',
      walletConnect: 'Connect Wallet',
      walletSelectTitle: '请选择连接钱包',
      walletPrimaryProviderId: WALLET_PROVIDER_ID,
      walletPrimaryProviderLabel: `Connect to ${WALLET_PROVIDER_NAME}`,
      walletPrimaryProviderIconUrl: WALLET_PROVIDER_ICON_PATH,
      walletSecondaryProviderId: SECONDARY_WALLET_PROVIDER_ID,
      walletSecondaryProviderLabel: `Connect to ${SECONDARY_WALLET_PROVIDER_NAME}`,
      walletSecondaryProviderIconUrl: SECONDARY_WALLET_PROVIDER_ICON_PATH,
      walletUnsupportedProviderMessage: '即将支持',
      walletInstallTitle: `Install ${WALLET_PROVIDER_NAME}`,
      walletInstallBody: `Please install ${WALLET_PROVIDER_NAME} wallet first.`,
      walletInstallAction: 'Install',
      walletInstallUrl: `https://${WALLET_PROVIDER_ID}.space`,
      walletUnlockError: `Please unlock ${WALLET_PROVIDER_NAME} first.`,
      walletInitializeError: `Please initialize ${WALLET_PROVIDER_NAME} first.`,
      walletAddressMissingError: `${WALLET_PROVIDER_NAME} did not return a wallet address.`,
      walletFallbackName: `${WALLET_PROVIDER_NAME} Wallet`,
      walletProviderId: WALLET_PROVIDER_ID,
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
  let config: BrowserConfigContainer = { browser: { botHomepageTemplateId: 'document' } };
  let settings: BrowserSettingsSnapshot = toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config }));
  let cacheClearedAt: number | null = null;

  function ensureActor(actorId?: string) {
    if (
      actorId &&
      actorId !== STANDALONE_ACTOR_ID &&
      !actorId.startsWith(STANDALONE_WALLET_ACTOR_PREFIX)
    ) {
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
      return failure ?? browserSuccess(runtime());
    },
    async resolveResource(resolveInput) {
      const failure = ensureActor(resolveInput.actorId);
      if (failure) return failure;
      try {
        const parsed = parseBrowserUri(resolveInput.uri);
        if (parsed.scheme === 'metaapp') {
          return browserSuccess(resolveMetaapp(parsed.originalUri, parsed.normalizedUri));
        }
        return browserFailure('unsupported_browser_uri', `Memory host cannot resolve ${parsed.scheme} URIs.`);
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
