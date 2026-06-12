import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  createDefaultBrowserConfig,
  resolveBrowserConfig,
  resolveBrowserResource,
  type BrowserCommandResult as CoreBrowserCommandResult,
  type BrowserConfigContainer,
  type BrowserResolveResult,
  type BrowserSettingsSnapshot as CoreBrowserSettingsSnapshot,
  resolveMetaAppPinToRecord,
} from '@openagentinternet/agent-browser-core';
import {
  browserFailure,
  browserManualActionRequired,
  browserSuccess,
  type BrowserActor,
  type BrowserActorInput,
  type BrowserCacheClearInput,
  type BrowserCacheClearResult,
  type BrowserCacheInput,
  type BrowserCacheSnapshot,
  type BrowserCommandResult,
  type BrowserHostAdapter,
  type BrowserResolveInput,
  type BrowserRuntimeInput,
  type BrowserRuntimeSnapshot,
  type BrowserSettingsInput,
  type BrowserSettingsSnapshot,
  type BrowserSettingsUpdateInput,
  type BrowserTrustedActionInput,
  type BrowserTrustedActionResult,
} from '@openagentinternet/agent-browser-host-contract';

const STANDALONE_ACTOR_ID = 'standalone-wallet';
const STANDALONE_DEFAULT_URI = 'metaid://idq1fixturebot';
const STANDALONE_FIXTURE_GLOBAL_META_ID = 'idq1fixturebot';

const FIXTURE_BOT_HOMEPAGE: Record<string, unknown> = {
  schemaVersion: 'botHomepage.v1',
  resolvedAt: 1780760000000,
  globalMetaId: STANDALONE_FIXTURE_GLOBAL_META_ID,
  canonical: {
    globalMetaId: STANDALONE_FIXTURE_GLOBAL_META_ID,
    metaid: 'metaid-fixture',
    address: '18FixtureAddress',
    chainName: 'mvc',
  },
  profile: {
    name: 'Fixture Bot',
    avatar: 'https://so.example.test/content/avatar-pin',
    avatarPinId: 'avatar-pin',
    bio: 'Builds Agent Browser fixtures.',
    bioPinId: 'bio-pin',
    chatPubkey: '04fixture',
    chatPubkeyPinId: 'chat-pin',
    displayGlobalMetaId: 'idq1fixture...bot',
  },
  homepage: {
    mode: 'default',
    title: 'Fixture Bot',
    summary: 'Builds Agent Browser fixtures.',
    custom: null,
  },
  presence: {
    state: 'online',
    updatedAt: 1780760000000,
    source: 'fixture-presence',
  },
  services: [
    {
      id: 'service-current-pin',
      currentPinId: 'service-current-pin',
      sourceServicePinId: 'service-source-pin',
      displayName: 'Fixture Review',
      serviceName: 'fixture-review',
      description: 'Review a fixture payload.',
      providerSkill: 'fixture-review',
      price: '0',
      currency: 'SPACE',
      paymentChain: 'mvc',
      paymentAddress: '18FixtureAddress',
      proof: {
        txid: 'service-txid',
        pinId: 'service-current-pin',
        sourceServicePinId: 'service-source-pin',
        protocolPath: '/protocols/skill-service',
        publisherGlobalMetaId: STANDALONE_FIXTURE_GLOBAL_META_ID,
      },
    },
  ],
  actions: [
    { id: 'message', label: 'Message', kind: 'private-chat', enabled: true, requiresUsingIdentity: true },
    { id: 'services', label: 'Services', kind: 'service-list', enabled: true, requiresUsingIdentity: true },
    { id: 'copy-uri', label: 'Copy URI', kind: 'copy', enabled: true, uri: STANDALONE_DEFAULT_URI },
  ],
  proofs: {
    verificationState: 'partial',
    identity: {
      txid: 'fixture-identity-txid',
      pinId: 'fixture-identity-pin',
      protocolPath: '/protocols/simpleprofile',
      publisherGlobalMetaId: STANDALONE_FIXTURE_GLOBAL_META_ID,
      verificationState: 'partial',
    },
  },
  source: {
    resolver: 'standalone-fixture',
    fetchedAt: 1780760000000,
    stale: false,
  },
};

export interface StandaloneBrowserPreviewAsset {
  body: Buffer | string;
  contentType: string;
}

export interface StandaloneBrowserPreviewAssetInput {
  previewId: string;
  assetPath: string;
}

export interface StandaloneBrowserHostAdapter extends BrowserHostAdapter {
  resolvePreviewAsset(input: StandaloneBrowserPreviewAssetInput): Promise<BrowserCommandResult<StandaloneBrowserPreviewAsset>>;
}

export interface CreateStandaloneBrowserHostAdapterInput {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

interface PreviewSession {
  artifactDir: string;
  indexFile: string;
  createdAt: number;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createStandaloneConfig(): BrowserConfigContainer {
  return {
    browser: {
      ...createDefaultBrowserConfig(),
      localMode: false,
    },
  };
}

function buildStandaloneActor(): BrowserActor {
  return {
    id: STANDALONE_ACTOR_ID,
    label: 'Standalone Wallet',
    kind: 'wallet',
    isDefault: true,
    capabilities: ['template-settings'],
  };
}

function encodeAssetPath(assetPath: string): string {
  return assetPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html' || extension === '.htm') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function normalizePreviewAssetPath(value: unknown): string | null {
  const text = normalizeText(value).replace(/\\/g, '/');
  if (!text || text.startsWith('/') || text.includes('\0')) {
    return null;
  }
  const normalized = path.posix.normalize(text.replace(/^\.\//u, ''));
  if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
    return null;
  }
  return normalized;
}

function isFixtureMetaIdUri(uri: unknown): boolean {
  return normalizeText(uri).toLowerCase() === STANDALONE_DEFAULT_URI;
}

function fixtureFetch(): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify({
    code: 0,
    message: '',
    data: FIXTURE_BOT_HOMEPAGE,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
}

function toBrowserResult<T>(result: CoreBrowserCommandResult<T>): BrowserCommandResult<T> {
  if (result.ok) {
    return browserSuccess(result.data);
  }
  return browserFailure(result.code, result.message, result.data ? { data: result.data } : {});
}

function toHostSettingsSnapshot(snapshot: CoreBrowserSettingsSnapshot): BrowserSettingsSnapshot {
  return {
    browser: { ...snapshot.browser },
    effectiveBrowser: { ...snapshot.effectiveBrowser },
    defaults: { ...snapshot.defaults },
  };
}

function resolveActor(input?: BrowserActorInput): BrowserCommandResult<never> | null {
  const requestedActor = normalizeText(input?.actorId);
  if (requestedActor && requestedActor !== STANDALONE_ACTOR_ID) {
    return browserFailure('actor_not_found', `Standalone Browser actor not found: ${requestedActor}`);
  }
  return null;
}

export function createStandaloneBrowserHostAdapter(
  input: CreateStandaloneBrowserHostAdapterInput = {},
): StandaloneBrowserHostAdapter {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  let config = createStandaloneConfig();
  let cacheClearedAt: number | null = null;
  let previewCounter = 0;
  const previewSessions = new Map<string, PreviewSession>();

  async function resolveResourceWithFetch(
    resolveInput: BrowserResolveInput,
    resolveFetch: typeof fetch,
  ): Promise<CoreBrowserCommandResult<BrowserResolveResult>> {
    const browserConfig = resolveBrowserConfig(config, env);
    return resolveBrowserResource({
      uri: resolveInput.uri,
      config: browserConfig,
      fetch: resolveFetch,
      metaAppResolve: (pinId) => resolveMetaAppPinToRecord({
        pinId,
        fetch: resolveFetch,
        manApiBaseUrl: browserConfig.manApiBaseUrl,
        metafileContentBaseUrl: browserConfig.metafileContentBaseUrl,
        now,
        createPreviewSession: ({ contentReference, indexFile }) => {
          if (!contentReference.startsWith('file://')) {
            return { localPreviewUrl: '' };
          }
          const artifactDir = path.resolve(new URL(contentReference).pathname);
          previewCounter += 1;
          const previewId = `standalone-${now().toString(36)}-${previewCounter.toString(36)}`;
          previewSessions.set(previewId, {
            artifactDir,
            indexFile,
            createdAt: now(),
          });
          return {
            previewId,
            localPreviewUrl: `/api/browser/preview-assets/${encodeURIComponent(previewId)}/${encodeAssetPath(indexFile)}`,
          };
        },
      }),
    });
  }

  async function getRuntime(runtimeInput: BrowserRuntimeInput = {}): Promise<BrowserCommandResult<BrowserRuntimeSnapshot>> {
    const actorFailure = resolveActor(runtimeInput);
    if (actorFailure) return actorFailure;
    const actor = buildStandaloneActor();
    return browserSuccess({
      host: {
        kind: 'standalone',
        name: 'Agent Internet Browser',
        localMode: false,
      },
      actors: [actor],
      defaultActor: actor,
      defaultUri: STANDALONE_DEFAULT_URI,
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
        noActorBody: 'Standalone Browser is running with a development wallet actor.',
      },
    });
  }

  async function resolveResource(resolveInput: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
    const actorFailure = resolveActor(resolveInput);
    if (actorFailure) return actorFailure;
    if (isFixtureMetaIdUri(resolveInput.uri)) {
      return toBrowserResult(await resolveResourceWithFetch(resolveInput, fixtureFetch));
    }
    const result = await resolveResourceWithFetch(resolveInput, fetchImpl);
    return toBrowserResult(result);
  }

  async function getSettings(settingsInput: BrowserSettingsInput = {}): Promise<BrowserCommandResult<BrowserSettingsSnapshot>> {
    const actorFailure = resolveActor(settingsInput);
    if (actorFailure) return actorFailure;
    return browserSuccess(toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config, env })));
  }

  async function updateSettings(settingsInput: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>> {
    const actorFailure = resolveActor(settingsInput);
    if (actorFailure) return actorFailure;
    try {
      config = applyBrowserSettingsUpdate(config, settingsInput.browser);
      return browserSuccess(toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config, env })));
    } catch (error) {
      return browserFailure('invalid_argument', error instanceof Error ? error.message : String(error));
    }
  }

  async function getCache(cacheInput: BrowserCacheInput = {}): Promise<BrowserCommandResult<BrowserCacheSnapshot>> {
    const actorFailure = resolveActor(cacheInput);
    if (actorFailure) return actorFailure;
    return browserSuccess({
      cacheRoot: 'standalone-memory',
      artifactCount: previewSessions.size,
      pinRecordCount: 0,
      totalBytes: 0,
      ...(cacheClearedAt ? { lastClearedAt: cacheClearedAt } : {}),
    });
  }

  async function clearCache(cacheInput: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>> {
    const actorFailure = resolveActor(cacheInput);
    if (actorFailure) return actorFailure;
    const scope = normalizeText(cacheInput.scope) || 'all';
    if (scope !== 'all' && scope !== 'pin' && scope !== 'artifact') {
      return browserFailure('invalid_argument', 'Unsupported Browser cache clear scope.');
    }
    const clearedArtifacts = scope === 'all' || scope === 'artifact' ? previewSessions.size : 0;
    if (clearedArtifacts > 0) {
      previewSessions.clear();
    }
    cacheClearedAt = now();
    return browserSuccess({
      clearedArtifacts,
      clearedPinRecords: 0,
      scope,
      cacheRoot: 'standalone-memory',
      lastClearedAt: cacheClearedAt,
    });
  }

  async function runTrustedAction(
    actionInput: BrowserTrustedActionInput,
  ): Promise<BrowserCommandResult<BrowserTrustedActionResult>> {
    const actorFailure = resolveActor(actionInput);
    if (actorFailure) return actorFailure;
    if (actionInput.kind === 'login') {
      return browserManualActionRequired('wallet_login_required', 'Connect a wallet in the standalone host.', {
        action: { label: 'Connect wallet', route: '/browser/login' },
      });
    }
    return browserFailure(
      'browser_action_not_supported',
      `Standalone Browser does not support trusted action: ${actionInput.kind}`,
    );
  }

  async function resolvePreviewAsset(
    assetInput: StandaloneBrowserPreviewAssetInput,
  ): Promise<BrowserCommandResult<StandaloneBrowserPreviewAsset>> {
    const previewId = normalizeText(assetInput.previewId);
    const assetPath = normalizePreviewAssetPath(assetInput.assetPath);
    if (!previewId || !assetPath) {
      return browserFailure('invalid_argument', 'Preview asset path is invalid.');
    }
    const session = previewSessions.get(previewId);
    if (!session) {
      return browserFailure('browser_resource_not_found', 'Preview session was not found.');
    }
    const artifactRoot = path.resolve(session.artifactDir);
    const filePath = path.resolve(artifactRoot, assetPath);
    if (filePath !== artifactRoot && !filePath.startsWith(`${artifactRoot}${path.sep}`)) {
      return browserFailure('invalid_argument', 'Preview asset path is outside the app package.');
    }
    try {
      const body = await fs.readFile(filePath);
      return browserSuccess({
        body,
        contentType: contentTypeForPath(filePath),
      });
    } catch {
      return browserFailure('browser_resource_not_found', 'Preview asset was not found.');
    }
  }

  return {
    getRuntime,
    resolveResource,
    getSettings,
    updateSettings,
    getCache,
    clearCache,
    runTrustedAction,
    resolvePreviewAsset,
  };
}
