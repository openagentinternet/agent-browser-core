import {
  browserCommandFailed,
  browserCommandSuccess,
  type BrowserCommandResult,
  type BrowserResolveResult,
  type PinInspectorResourceData,
  type PinResolvedVersion,
} from './types.js';
import { parsePinUri } from './pinUri.js';

type FetchResponse = { ok: boolean; status: number; json?(): Promise<unknown> };
type FetchFn = (url: string) => Promise<FetchResponse>;

const DEFAULT_MANAPI_BASE_URL = 'https://manapi.metaid.io';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unwrapPinRecord(payload: unknown): Record<string, unknown> | null {
  const root = record(payload);
  const data = record(root?.data);
  return record(data?.pin) ?? data ?? root;
}

function baseUrl(value: unknown): string {
  return (text(value) || DEFAULT_MANAPI_BASE_URL).replace(/\/+$/u, '') || DEFAULT_MANAPI_BASE_URL;
}

function parsePayload(content: unknown, contentType: string): unknown {
  if (record(content) || Array.isArray(content)) return content;
  const raw = text(content);
  if (!raw) return '';
  if (contentType.includes('json')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function pinIdFromRecord(pinRecord: Record<string, unknown>, fallback: string): string {
  return text(pinRecord.pinId ?? pinRecord.id ?? pinRecord.pin_id) || fallback;
}

function fetchImplementation(fetchInput?: FetchFn): FetchFn | undefined {
  if (fetchInput) return fetchInput;
  return typeof globalThis.fetch === 'function'
    ? (url: string) => globalThis.fetch(url)
    : undefined;
}

function shortId(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export interface ResolvePinUriToResourceInput {
  uri: string;
  manApiBaseUrl?: string;
  fetch?: FetchFn;
}

export async function resolvePinUriToResource(input: ResolvePinUriToResourceInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
  const parsed = parsePinUri(input.uri);
  const fetchImpl = fetchImplementation(input.fetch);
  if (!fetchImpl) {
    return browserCommandFailed('browser_resolve_failed', 'A fetch implementation is required to resolve pin resources.');
  }

  const url = `${baseUrl(input.manApiBaseUrl)}/pin/${encodeURIComponent(parsed.pinId)}${parsed.versionSelector === 'history-index' ? `?version=${parsed.historyIndex}` : ''}`;
  const response = await fetchImpl(url);
  if (!response.ok || !response.json) {
    return browserCommandFailed(
      response.status === 404 ? 'browser_resource_not_found' : 'browser_resolve_failed',
      response.status === 404 ? 'Pin was not found.' : `Pin lookup failed with HTTP ${response.status}.`,
    );
  }

  const pinRecord = unwrapPinRecord(await response.json());
  if (!pinRecord) {
    return browserCommandFailed('browser_resource_not_found', 'Pin was not found.');
  }

  const resolvedPinId = pinIdFromRecord(pinRecord, parsed.pinId);
  const version: PinResolvedVersion = {
    requestedPinId: parsed.pinId,
    rootPinId: text(pinRecord.rootPinId ?? pinRecord.root_pin_id) || undefined,
    resolvedPinId,
    versionSelector: parsed.versionSelector,
    ...(parsed.historyIndex !== undefined ? { historyIndex: parsed.historyIndex } : {}),
  };
  const contentType = text(pinRecord.contentType ?? pinRecord.content_type) || 'application/octet-stream';
  const rawPayload = pinRecord.content !== undefined && pinRecord.content !== null
    ? pinRecord.content
    : pinRecord.payload !== undefined && pinRecord.payload !== null
      ? pinRecord.payload
      : '';
  const payload = parsePayload(rawPayload, contentType);
  const ownerGlobalMetaId = text(pinRecord.ownerGlobalMetaId ?? pinRecord.globalMetaId ?? pinRecord.global_meta_id ?? pinRecord.metaid ?? pinRecord.metaId);
  const ownerAddress = text(pinRecord.ownerAddress ?? pinRecord.address);
  const protocolPath = text(pinRecord.path) || undefined;
  const rendererData = {
    rendererId: 'generic.pin-inspector',
    version,
    pin: {
      pinId: resolvedPinId,
      txid: text(pinRecord.txid) || undefined,
      path: protocolPath,
      operation: text(pinRecord.operation) || undefined,
      version: text(pinRecord.version) || undefined,
      encryption: text(pinRecord.encryption) || undefined,
      contentType,
      chainName: text(pinRecord.chainName ?? pinRecord.chain) || undefined,
      ownerGlobalMetaId: ownerGlobalMetaId || undefined,
      ownerAddress: ownerAddress || undefined,
    },
    payload,
    rawPayload,
    rawPinRecord: pinRecord,
  } satisfies PinInspectorResourceData;

  return browserCommandSuccess({
    uri: parsed.originalUri,
    normalizedUri: parsed.normalizedUri,
    resourceType: 'pin',
    title: `Pin ${shortId(resolvedPinId)}`,
    owner: {
      kind: 'unknown',
      globalMetaId: ownerGlobalMetaId,
      address: ownerAddress || undefined,
      name: ownerGlobalMetaId || ownerAddress || 'Unknown publisher',
      verificationState: 'partial',
    },
    renderer: {
      type: 'pin-inspector',
      contentType,
      data: rendererData,
    },
    status: { state: 'resolved', verificationState: 'partial', message: 'Pin resolved.' },
    proof: {
      txid: text(pinRecord.txid) || undefined,
      pinId: resolvedPinId,
      protocolPath,
      publisherGlobalMetaId: ownerGlobalMetaId || undefined,
      verificationState: 'partial',
      details: {
        requestedPinId: parsed.pinId,
        rootPinId: version.rootPinId,
        versionSelector: version.versionSelector,
        historyIndex: version.historyIndex,
        operation: text(pinRecord.operation) || undefined,
        encryption: text(pinRecord.encryption) || undefined,
        version: text(pinRecord.version) || undefined,
        chainName: text(pinRecord.chainName ?? pinRecord.chain) || undefined,
      },
    },
    source: { resolver: 'pin-resolver', url, raw: pinRecord },
    actions: [],
  });
}
