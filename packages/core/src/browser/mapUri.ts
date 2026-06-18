import type { ParsedMapUri } from './types.js';
export type { ParsedMapUri } from './types.js';

const MAP_URI_PREFIX = 'map://';
const PROTOCOL_AUTHORITY_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const PIN_ID_PATTERN = /^[0-9a-f]{64}i[0-9]+$/iu;
const GLOBAL_META_ID_LIKE_PATTERN = /^id[qpzryt]1[a-z0-9]+$/iu;

function parseMapUrl(input: string): URL {
  const originalUri = String(input ?? '').trim();
  if (!originalUri) {
    throw new Error('Enter a complete MAP URI.');
  }
  if (!originalUri.toLowerCase().startsWith(MAP_URI_PREFIX)) {
    throw new Error('Enter a complete MAP URI starting with map://.');
  }
  try {
    return new URL(originalUri);
  } catch {
    throw new Error('Enter a complete MAP URI.');
  }
}

function extractRawAuthority(originalUri: string): string {
  return originalUri.slice(MAP_URI_PREFIX.length).split(/[/?#]/u, 1)[0] ?? '';
}

function normalizeAuthority(rawAuthority: string): string {
  const normalized = rawAuthority.toLowerCase();
  if (!PROTOCOL_AUTHORITY_PATTERN.test(normalized)) {
    throw new Error('Unsupported MAP path authority or alias target.');
  }
  return normalized;
}

function rejectFragment(url: URL): void {
  if (url.hash) {
    throw new Error('Unsupported MAP URI fragment.');
  }
}

function requireOnlyQueryParam(url: URL, name: string): void {
  const entries = Array.from(url.searchParams.keys());
  if (entries.length !== 1 || entries[0] !== name) {
    throw new Error('Unsupported MAP URI query parameter.');
  }
}

function rejectUnsupportedPinQuery(url: URL): string | null {
  if (!url.search) return null;
  requireOnlyQueryParam(url, 'version');

  const versions = url.searchParams.getAll('version');
  if (versions.length !== 1) {
    throw new Error('Unsupported MAP pin version query.');
  }

  const version = versions[0];
  if (!/^\d+$/u.test(version)) {
    throw new Error('MAP pin version query must be a non-negative integer.');
  }
  return version;
}

function parsePinPath(pathname: string): { pinId: string; historyIndex?: number } | null {
  const match = pathname.match(/^\/pin\/([^/?#\[\]]+)(?:\[(-?\d+)\])?$/u);
  if (!match) return null;

  const historySelector = match[2];
  if (historySelector === undefined) {
    const pinId = match[1].toLowerCase();
    if (!PIN_ID_PATTERN.test(pinId)) {
      throw new Error('MAP pin target requires a valid pinId.');
    }
    return { pinId };
  }

  const historyIndex = Number(historySelector);
  if (!Number.isSafeInteger(historyIndex) || historyIndex < 0) {
    throw new Error('MAP pin history selector must be a non-negative integer.');
  }

  const pinId = match[1].toLowerCase();
  if (!PIN_ID_PATTERN.test(pinId)) {
    throw new Error('MAP pin target requires a valid pinId.');
  }
  return { pinId, historyIndex };
}

function parseConversationPeer(searchParams: URLSearchParams): string {
  const peer = searchParams.get('peer')?.trim().toLowerCase() ?? '';
  if (!peer) {
    throw new Error('MAP conversation target requires a peer Global MetaID.');
  }
  if (!GLOBAL_META_ID_LIKE_PATTERN.test(peer)) {
    throw new Error('MAP conversation target requires a valid peer Global MetaID.');
  }
  return peer;
}

export function parseMapUri(input: string): ParsedMapUri {
  const originalUri = String(input ?? '').trim();
  const url = parseMapUrl(originalUri);
  rejectFragment(url);

  const authority = normalizeAuthority(extractRawAuthority(originalUri));
  const protocolPath = `/protocols/${authority}`;

  if (url.username || url.password || url.port) {
    throw new Error('Unsupported MAP path or alias target.');
  }

  if (authority === 'simplemsg' && url.pathname === '/conversation') {
    if (!url.searchParams.has('peer')) {
      parseConversationPeer(url.searchParams);
    }
    requireOnlyQueryParam(url, 'peer');
    const peerGlobalMetaId = parseConversationPeer(url.searchParams);
    return {
      originalUri,
      normalizedUri: `map://simplemsg/conversation?peer=${peerGlobalMetaId}`,
      authority: 'simplemsg',
      protocolPath: '/protocols/simplemsg',
      targetKind: 'conversation',
      peerGlobalMetaId,
    };
  }

  const queryVersion = rejectUnsupportedPinQuery(url);

  const pinTarget = parsePinPath(url.pathname);
  if (!pinTarget) {
    throw new Error('Unsupported MAP path. Enter a complete MAP URI.');
  }

  if (pinTarget.historyIndex !== undefined && queryVersion !== null) {
    throw new Error('Unsupported MAP pin version selector.');
  }

  const historyIndex = pinTarget.historyIndex ?? (queryVersion === null ? undefined : Number(queryVersion));
  if (historyIndex !== undefined && (!Number.isSafeInteger(historyIndex) || historyIndex < 0)) {
    throw new Error('MAP pin history selector must be a non-negative integer.');
  }

  return {
    originalUri,
    normalizedUri: historyIndex === undefined
      ? `map://${authority}/pin/${pinTarget.pinId}`
      : `map://${authority}/pin/${pinTarget.pinId}?version=${historyIndex}`,
    authority,
    protocolPath,
    targetKind: 'pin',
    pinId: pinTarget.pinId,
    versionSelector: historyIndex === undefined ? 'latest' : 'history-index',
    ...(historyIndex === undefined ? {} : { historyIndex }),
  };
}
