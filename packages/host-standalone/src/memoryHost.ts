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

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface MemoryStandaloneHostInput {
  now?: () => number;
}

interface MemoryPermissionGrantRecord {
  actorId: string;
  resourceUri: string;
  operation: 'create';
  path: string;
}

const PROTOCOL_GRANT_WHITELIST = new Set([
  '/protocols/simplegroupcreate',
  '/protocols/simplegroupjoin',
  '/protocols/simplegroupchat',
]);
const PROTOCOL_GRANT_PATH_PATTERN = /^\/protocols\/[A-Za-z0-9_-]+$/u;

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
      remix: false,
    },
    labels: {
      actorChip: 'Wallet',
      noActorTitle: 'No Wallet',
      noActorBody: 'Standalone Browser is running with an in-memory development actor.',
      walletConnect: 'Connect Bot',
      walletSelectTitle: 'Select a wallet to connect',
      walletPrimaryProviderId: WALLET_PROVIDER_ID,
      walletPrimaryProviderLabel: `Connect to ${WALLET_PROVIDER_NAME}`,
      walletPrimaryProviderIconUrl: WALLET_PROVIDER_ICON_PATH,
      walletSecondaryProviderId: SECONDARY_WALLET_PROVIDER_ID,
      walletSecondaryProviderLabel: `Connect to ${SECONDARY_WALLET_PROVIDER_NAME}`,
      walletSecondaryProviderIconUrl: SECONDARY_WALLET_PROVIDER_ICON_PATH,
      walletUnsupportedProviderMessage: 'Coming soon',
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
  const sessionGrants = new Map<string, MemoryPermissionGrantRecord[]>();

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
      if (input.kind === 'llm-complete') {
        return browserFailure('llm_unavailable', 'The memory development host has no local LLM configured.');
      }
      if (input.kind === 'permissions-request') {
        const sessionKey = normalizeText(input.sessionId) || 'default-session';
        const resourceUri = normalizeText(input.resourceUri);
        const actorId = normalizeText(input.actorId) || 'standalone-wallet';
        const payload = input.payload ?? {};
        if (payload.revoke === true) {
          sessionGrants.delete(sessionKey);
          return browserSuccess({ kind: 'permissions-request', handled: true, data: { revoked: true } });
        }
        const grants = Array.isArray(payload.grants)
          ? payload.grants.filter((grant) =>
              grant && typeof grant === 'object' &&
              grant.method === 'metaid.pin.write' &&
              grant.operation === 'create' &&
              typeof grant.path === 'string' &&
              PROTOCOL_GRANT_PATH_PATTERN.test(grant.path))
          : [];
        if (!grants.length) {
          return browserFailure('invalid_params', 'Permission request requires at least one valid grant.');
        }
        for (const grant of grants) {
          if (!PROTOCOL_GRANT_WHITELIST.has(grant.path)) {
            return browserFailure('consent_denied', `The requested protocol path is not on the host whitelist: ${grant.path}`);
          }
        }
        const records = grants.map((grant) => ({ actorId, resourceUri, operation: grant.operation, path: grant.path }));
        sessionGrants.set(sessionKey, records);
        return browserSuccess({ kind: 'permissions-request', handled: true, data: { granted: grants } });
      }
      if (input.kind === 'metaid-pin-write') {
        const operation = normalizeText(input.payload?.operation);
        const path = normalizeText(input.payload?.path);
        const records = sessionGrants.get(normalizeText(input.sessionId) || 'default-session') ?? [];
        const granted = operation === 'create' && records.some(
          (record) => record.resourceUri === normalizeText(input.resourceUri) && record.path === path,
        );
        if (granted) {
          return browserFailure(
            'pin_write_failed',
            'Standalone Browser cannot broadcast PIN writes. Confirmation was skipped because the request is covered by a session grant.',
          );
        }
        return browserManualActionRequired(
          'browser_identity_required',
          'Standalone Browser cannot write MetaID PINs until a signing actor is available.',
          {
            data: {
              operation: normalizeText(input.payload?.operation),
              path: normalizeText(input.payload?.path),
            },
          },
        );
      }
      return browserFailure('browser_action_not_supported', `Standalone Browser does not support trusted action: ${input.kind}`);
    },
  };
}
