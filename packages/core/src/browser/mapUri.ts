import type { ParsedMapUri } from './types.js';

const PIN_ID_PATTERN = /^[0-9a-f]{64}i[0-9]+$/iu;
const AUTHORITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const GLOBAL_META_ID_LIKE_PATTERN = /^id[qpzryt]1[023456789acdefghjklmnpqrstuvwxyz]+$/iu;

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeAuthority(value: string): string {
  const authority = cleanText(value).toLowerCase();
  if (!AUTHORITY_PATTERN.test(authority)) {
    throw new Error('MAP URI authority must be a protocol segment such as simplebuzz or skill-service.');
  }
  return authority;
}

function protocolPath(authority: string): string {
  return `/protocols/${authority}`;
}

function readVersion(searchParams: URLSearchParams): { versionSelector: 'latest' | 'history-index'; historyIndex?: number } {
  const version = searchParams.get('version');
  if (version == null || version === '') {
    return { versionSelector: 'latest' };
  }
  if (!/^[0-9]+$/u.test(version)) {
    throw new Error('MAP URI version must be a non-negative history index.');
  }
  return { versionSelector: 'history-index', historyIndex: Number(version) };
}

function normalizePinPath(pathname: string): { pathname: string; historyIndex?: number } {
  const match = pathname.match(/^(\/pin\/[^/?#[\]]+)\[([0-9]+)\]$/u);
  if (!match) {
    if (/\[[^\]]*\]/u.test(pathname)) {
      throw new Error('MAP URI history shorthand must use a non-negative index such as [0].');
    }
    return { pathname };
  }
  return { pathname: match[1], historyIndex: Number(match[2]) };
}

export function parseMapUri(input: string): ParsedMapUri {
  const originalUri = cleanText(input);
  let url: URL;
  try {
    url = new URL(originalUri);
  } catch {
    throw new Error('Enter a complete MAP URI such as map://simplebuzz/pin/{pinId}.');
  }
  if (url.protocol !== 'map:') {
    throw new Error('MAP parser requires a map:// URI.');
  }

  const authority = normalizeAuthority(url.hostname);
  const normalizedPath = normalizePinPath(url.pathname);
  if (normalizedPath.historyIndex !== undefined) {
    if (url.searchParams.has('version')) {
      throw new Error('MAP URI must not combine [N] history shorthand with version query.');
    }
    url.searchParams.set('version', String(normalizedPath.historyIndex));
  }

  if (normalizedPath.pathname.startsWith('/pin/')) {
    const version = readVersion(url.searchParams);
    const pinId = decodeURIComponent(normalizedPath.pathname.slice('/pin/'.length)).toLowerCase();
    if (!PIN_ID_PATTERN.test(pinId)) {
      throw new Error('MAP protocol pin target requires a 64-hex pinId ending in iN.');
    }
    const normalizedUri = `map://${authority}/pin/${pinId}${version.versionSelector === 'history-index' ? `?version=${version.historyIndex}` : ''}`;
    return {
      originalUri,
      normalizedUri,
      authority,
      protocolPath: protocolPath(authority),
      targetKind: 'pin',
      pinId,
      ...version,
    };
  }

  if (authority === 'simplemsg' && normalizedPath.pathname === '/conversation') {
    const peerGlobalMetaId = cleanText(url.searchParams.get('peer'));
    if (!GLOBAL_META_ID_LIKE_PATTERN.test(peerGlobalMetaId)) {
      throw new Error('MAP conversation target requires a peer Global MetaID.');
    }
    return {
      originalUri,
      normalizedUri: `map://simplemsg/conversation?peer=${encodeURIComponent(peerGlobalMetaId)}`,
      authority: 'simplemsg',
      protocolPath: '/protocols/simplemsg',
      targetKind: 'conversation',
      peerGlobalMetaId,
    };
  }

  throw new Error(`Unsupported MAP path: ${normalizedPath.pathname || '/'}.`);
}
