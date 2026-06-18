import type { ParsedMapUri } from './types.js';
export type { ParsedMapUri } from './types.js';

const MAP_URI_PREFIX = 'map://';
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

function normalizeAuthority(authority: string): string {
  const normalized = authority.toLowerCase();
  if (!normalized || normalized.includes('.') || normalized.includes('@')) {
    throw new Error('Unsupported MAP path or alias target.');
  }
  return normalized;
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
  const authority = normalizeAuthority(url.hostname);
  const protocolPath = `/protocols/${authority}`;

  if (url.username || url.password || url.port) {
    throw new Error('Unsupported MAP path or alias target.');
  }

  if (authority === 'simplemsg' && url.pathname === '/conversation') {
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

  if (url.searchParams.has('version') && !/^\d+$/u.test(url.searchParams.get('version') ?? '')) {
    throw new Error('MAP pin version query must be a non-negative integer.');
  }

  if (url.search && !url.searchParams.has('version')) {
    throw new Error('Unsupported MAP path or query.');
  }

  const pinTarget = parsePinPath(url.pathname);
  if (!pinTarget) {
    throw new Error('Unsupported MAP path. Enter a complete MAP URI.');
  }

  const queryVersion = url.searchParams.get('version');
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
