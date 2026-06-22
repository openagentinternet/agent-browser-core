import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  applyBrowserSettingsUpdate,
  createBrowserSettingsSnapshot,
  createDefaultBrowserConfig,
  buildMetafileAcceleratedContentUrl,
  resolveBrowserConfig,
  resolveBrowserResource,
  fetchBotProfileInfo,
  type BrowserCommandResult as CoreBrowserCommandResult,
  type BrowserConfigContainer,
  type BrowserNameAliasProvider,
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
import { createEnsOpenAgentInternetResolver } from '@openagentinternet/agent-browser-name-resolvers';
import {
  createStandaloneMetaAppArtifactCacheStore,
  normalizeMetaAppModifyHistory,
  resolveStandaloneMetaAppCacheRoot,
  type MetaAppArtifactCacheEntry,
} from './metaapp/artifactCache.js';

const STANDALONE_ACTOR_ID = 'standalone-wallet';
const STANDALONE_METAFILE_CONTENT_BASE_URL = 'https://file.metaid.io/metafile-indexer';

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
  resolveBotProfile(input: { globalMetaId: string }): Promise<BrowserCommandResult<{ globalMetaId: string; name: string; avatar: string }>>;
}

export interface CreateStandaloneBrowserHostAdapterInput {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  cacheRoot?: string;
  maxZipArchiveBytes?: number;
  nameAliasProviders?: BrowserNameAliasProvider[];
  ensNameAliasProviderFactory?: (config: {
    chainId: 1;
    rpcUrls: string[];
    textKey: string;
  }) => BrowserNameAliasProvider;
}

interface PreviewSession {
  artifactDir: string;
  indexFile: string;
  createdAt: number;
  source: 'cache';
  cacheKey?: string;
}

const ZIP_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
]);
const DEFAULT_MAX_ZIP_ARCHIVE_BYTES = 25 * 1024 * 1024;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createStandaloneConfig(): BrowserConfigContainer {
  const { nameResolution: _nameResolution, ...defaults } = createDefaultBrowserConfig();
  return {
    browser: {
      ...defaults,
      metafileContentBaseUrl: STANDALONE_METAFILE_CONTENT_BASE_URL,
      localMode: false,
    },
  };
}

function createNameAliasProviders(input: {
  configured: BrowserNameAliasProvider[] | undefined;
  ensNameAliasProviderFactory: CreateStandaloneBrowserHostAdapterInput['ensNameAliasProviderFactory'];
  config: ReturnType<typeof resolveBrowserConfig>;
}): BrowserNameAliasProvider[] {
  const nameResolution = input.config.nameResolution;
  if (!nameResolution.enabled) {
    return [];
  }
  if (input.configured) {
    if (!nameResolution.ens.enabled) {
      return input.configured.filter((provider) => provider.id.trim().toLowerCase() !== 'ens');
    }
    return input.configured;
  }
  if (!nameResolution.ens.enabled) {
    return [];
  }
  return [
    (input.ensNameAliasProviderFactory ?? createEnsOpenAgentInternetResolver)({
      chainId: nameResolution.ens.chainId,
      rpcUrls: nameResolution.ens.rpcUrls,
      textKey: nameResolution.ens.textKey,
    }),
  ];
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
  if (extension === '.wasm') return 'application/wasm';
  if (extension === '.ico') return 'image/x-icon';
  if (extension === '.map') return 'application/json; charset=utf-8';
  if (extension === '.txt') return 'text/plain; charset=utf-8';
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

function isZipMetaAppContent(contentType: string, contentReference: string): boolean {
  const normalizedType = normalizeText(contentType).toLowerCase();
  const normalizedReference = normalizeText(contentReference).toLowerCase().split(/[?#]/, 1)[0];
  return ZIP_CONTENT_TYPES.has(normalizedType)
    || normalizedType.endsWith('/zip')
    || normalizedType.endsWith('+zip')
    || normalizedReference.endsWith('.zip')
    || /^metafile:\/\/.+\.zip$/iu.test(contentReference);
}

function resolveMetaAppContentUrl(contentReference: string, metafileContentBaseUrl: string): string | null {
  const reference = normalizeText(contentReference);
  if (!/^metafile:\/\//iu.test(reference)) {
    return null;
  }
  const pinId = reference.slice('metafile://'.length).split(/[?#]/, 1)[0]?.replace(/\.[A-Za-z0-9]+$/u, '') ?? '';
  if (!pinId || pinId.includes('/') || pinId.includes('\\')) {
    return null;
  }
  return buildMetafileAcceleratedContentUrl(metafileContentBaseUrl, pinId);
}

async function readBoundedResponseBody(input: {
  response: Response;
  maxBytes: number;
}): Promise<Buffer> {
  const contentLength = normalizeText(input.response.headers.get('content-length'));
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new Error('MetaApp ZIP download content-length is invalid.');
    }
    if (parsedLength > input.maxBytes) {
      throw new Error('MetaApp ZIP archive is too large.');
    }
  }

  const reader = input.response.body?.getReader?.();
  if (!reader) {
    throw new Error('MetaApp ZIP download response body is not streamable.');
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > input.maxBytes) {
      throw new Error('MetaApp ZIP archive exceeds the download size limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function downloadMetaAppZipArchive(input: {
  fetch: typeof fetch;
  contentReference: string;
  metafileContentBaseUrl: string;
  maxBytes?: number;
}): Promise<Buffer> {
  const contentUrl = resolveMetaAppContentUrl(input.contentReference, input.metafileContentBaseUrl);
  if (!contentUrl) {
    throw new Error('MetaApp ZIP content reference is not downloadable.');
  }
  const response = await input.fetch(contentUrl);
  if (!response.ok) {
    throw new Error(`MetaApp ZIP download failed with HTTP ${response.status}.`);
  }
  return readBoundedResponseBody({
    response,
    maxBytes: input.maxBytes ?? DEFAULT_MAX_ZIP_ARCHIVE_BYTES,
  });
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
  const artifactCache = createStandaloneMetaAppArtifactCacheStore({
    cacheRoot: input.cacheRoot ?? resolveStandaloneMetaAppCacheRoot({ env }),
    env,
    now,
  });

  function createPreviewSessionForArtifact(input: {
    artifactDir: string;
    indexFile: string;
    source: 'cache';
    cacheKey?: string;
  }): { previewId: string; localPreviewUrl: string } {
    previewCounter += 1;
    const previewId = `standalone-${now().toString(36)}-${previewCounter.toString(36)}`;
    previewSessions.set(previewId, {
      artifactDir: input.artifactDir,
      indexFile: input.indexFile,
      createdAt: now(),
      source: input.source,
      ...(input.cacheKey ? { cacheKey: input.cacheKey } : {}),
    });
    return {
      previewId,
      localPreviewUrl: `/api/browser/preview-assets/${encodeURIComponent(previewId)}/${encodeAssetPath(input.indexFile)}`,
    };
  }

  async function resolveZipPreviewArtifact(input: {
    pinId: string;
    contentReference: string;
    contentType: string;
    indexFile: string;
    pinRecord: Record<string, unknown>;
    metafileContentBaseUrl: string;
    resolveFetch: typeof fetch;
    maxBytes?: number;
  }): Promise<MetaAppArtifactCacheEntry> {
    const descriptor = {
      metaAppPinId: input.pinId,
      contentReference: input.contentReference,
      contentType: input.contentType,
      indexFile: input.indexFile,
      modifyHistory: normalizeMetaAppModifyHistory(input.pinRecord.modify_history ?? input.pinRecord.modifyHistory),
    };
    const cached = await artifactCache.getArtifact(descriptor);
    if (cached) {
      return cached;
    }
    const archive = await downloadMetaAppZipArchive({
      fetch: input.resolveFetch,
      contentReference: input.contentReference,
      metafileContentBaseUrl: input.metafileContentBaseUrl,
      maxBytes: input.maxBytes,
    });
    return artifactCache.writeArtifact({ ...descriptor, archive });
  }

  async function resolveResourceWithFetch(
    resolveInput: BrowserResolveInput,
    resolveFetch: typeof fetch,
  ): Promise<CoreBrowserCommandResult<BrowserResolveResult>> {
    const browserConfig = resolveBrowserConfig(config, env);
    const nameAliasProviders = createNameAliasProviders({
      configured: input.nameAliasProviders,
      ensNameAliasProviderFactory: input.ensNameAliasProviderFactory,
      config: browserConfig,
    });
    return resolveBrowserResource({
      uri: resolveInput.uri,
      config: browserConfig,
      fetch: resolveFetch,
      nameAliasProviders,
      metaAppResolve: (pinId) => resolveMetaAppPinToRecord({
        pinId,
        fetch: resolveFetch,
        manApiBaseUrl: browserConfig.manApiBaseUrl,
        metafileContentBaseUrl: browserConfig.metafileContentBaseUrl,
        now,
        createPreviewSession: async ({ pinId, contentReference, contentType, indexFile, pinRecord }) => {
          if (!isZipMetaAppContent(contentType, contentReference)) {
            throw new Error('Standalone MetaApp preview only supports ZIP content references.');
          }
          const artifact = await resolveZipPreviewArtifact({
            pinId,
            contentReference,
            contentType,
            indexFile,
            pinRecord,
            metafileContentBaseUrl: browserConfig.metafileContentBaseUrl,
            resolveFetch,
            maxBytes: input.maxZipArchiveBytes,
          });
          return createPreviewSessionForArtifact({
            artifactDir: artifact.artifactDir,
            indexFile: artifact.indexFile,
            source: 'cache',
            cacheKey: artifact.cacheKey,
          });
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
        noActorBody: 'Standalone Browser is running with a development wallet actor.',
      },
    });
  }

  async function resolveResource(resolveInput: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
    const actorFailure = resolveActor(resolveInput);
    if (actorFailure) return actorFailure;
    const result = await resolveResourceWithFetch(resolveInput, fetchImpl);
    return toBrowserResult(result);
  }

  async function getSettings(_settingsInput: BrowserSettingsInput = {}): Promise<BrowserCommandResult<BrowserSettingsSnapshot>> {
    return browserSuccess(toHostSettingsSnapshot(createBrowserSettingsSnapshot({ config, env })));
  }

  async function updateSettings(settingsInput: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>> {
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
    const stats = await artifactCache.getStats();
    return browserSuccess({
      cacheRoot: stats.cacheRoot,
      artifactsRoot: stats.artifactsRoot,
      pinsRoot: stats.pinsRoot,
      artifactCount: stats.artifactCount,
      pinRecordCount: stats.pinRecordCount,
      totalBytes: stats.totalBytes,
      artifacts: stats.artifacts,
      activePreviewSessionCount: previewSessions.size,
      ...(cacheClearedAt ? { lastClearedAt: cacheClearedAt } : {}),
    });
  }

  async function clearCache(cacheInput: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>> {
    const actorFailure = resolveActor(cacheInput);
    if (actorFailure) return actorFailure;
    const scope = normalizeText(cacheInput.scope) || (cacheInput.all ? 'all' : 'all');
    if (scope !== 'all' && scope !== 'pin' && scope !== 'artifact') {
      return browserFailure('invalid_argument', 'Unsupported Browser cache clear scope.');
    }

    try {
      let clearedArtifacts = 0;
      let clearedPinRecords = 0;
      let clearedPreviewSessions = 0;
      if (scope === 'all') {
        clearedPreviewSessions = previewSessions.size;
        previewSessions.clear();
        const cleared = await artifactCache.clear({ scope: 'all' });
        clearedArtifacts = cleared.clearedArtifacts;
        clearedPinRecords = cleared.clearedPinRecords;
      } else if (scope === 'pin') {
        const pinId = normalizeText(cacheInput.pinId);
        const cleared = pinId ? await artifactCache.clear({ scope: 'pin', pinId }) : { clearedArtifacts: 0, clearedPinRecords: 0 };
        clearedArtifacts = cleared.clearedArtifacts;
        clearedPinRecords = cleared.clearedPinRecords;
      } else {
        const cacheKey = normalizeText(cacheInput.cacheKey).toLowerCase();
        if (cacheKey) {
          const cleared = await artifactCache.clear({ scope: 'artifact', cacheKey });
          clearedArtifacts = cleared.clearedArtifacts;
          clearedPinRecords = cleared.clearedPinRecords;
          for (const [previewId, session] of previewSessions) {
            if (session.cacheKey === cacheKey) {
              previewSessions.delete(previewId);
              clearedPreviewSessions += 1;
            }
          }
        } else {
          clearedPreviewSessions = previewSessions.size;
          const cleared = await artifactCache.clear({ scope: 'artifact' });
          clearedArtifacts = cleared.clearedArtifacts;
          clearedPinRecords = cleared.clearedPinRecords;
          previewSessions.clear();
        }
      }
      cacheClearedAt = now();
      return browserSuccess({
        clearedArtifacts,
        clearedPinRecords,
        clearedPreviewSessions,
        scope,
        cacheRoot: artifactCache.cacheRoot,
        lastClearedAt: cacheClearedAt,
      });
    } catch (error) {
      return browserFailure('invalid_argument', error instanceof Error ? error.message : String(error));
    }
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
    if (actionInput.kind === 'open-conversation') {
      return browserManualActionRequired(
        'browser_identity_required',
        'Standalone Browser cannot open private conversations until a local identity is selected.',
        {
          data: {
            conversationUri: normalizeText(actionInput.payload?.conversationUri),
            peerGlobalMetaId: normalizeText(actionInput.payload?.peerGlobalMetaId),
          },
        },
      );
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

  async function resolveBotProfile(input: { globalMetaId: string }): Promise<BrowserCommandResult<{ globalMetaId: string; name: string; avatar: string }>> {
    const targetId = typeof input.globalMetaId === 'string' ? input.globalMetaId.trim() : '';
    if (!targetId) {
      return browserFailure('missing_argument', 'globalMetaId query parameter is required.');
    }
    const browserConfig = resolveBrowserConfig(config, env);
    const profile = await fetchBotProfileInfo({
      baseUrl: browserConfig.metasoP2PBaseUrl,
      globalMetaId: targetId,
      fetch: fetchImpl,
      metafileContentBaseUrl: browserConfig.metafileContentBaseUrl,
    });
    if (!profile) {
      return browserFailure('browser_resource_not_found', `Bot profile not found for ${targetId}.`);
    }
    const resolvedId = typeof profile.globalMetaId === 'string' ? profile.globalMetaId : targetId;
    const resolvedName = typeof profile.name === 'string' ? profile.name : targetId;
    const resolvedAvatar = typeof profile.avatar === 'string' ? profile.avatar : '';
    return browserSuccess({
      globalMetaId: resolvedId,
      name: resolvedName,
      avatar: resolvedAvatar,
    });
  }

  return {
    getRuntime,
    resolveResource,
    resolveBotProfile,
    getSettings,
    updateSettings,
    getCache,
    clearCache,
    runTrustedAction,
    resolvePreviewAsset,
  };
}
