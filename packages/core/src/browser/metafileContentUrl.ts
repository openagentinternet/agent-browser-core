export const DEFAULT_METAFILE_CONTENT_BASE_URL = 'https://file.metaid.io/metafile-indexer';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeMetafileContentBaseUrl(value: unknown): string {
  return (normalizeText(value) || DEFAULT_METAFILE_CONTENT_BASE_URL).replace(/\/+$/, '')
    || DEFAULT_METAFILE_CONTENT_BASE_URL;
}

function isMetafileIndexerRoot(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return parsed.pathname.replace(/\/+$/, '') === '/metafile-indexer';
  } catch {
    return false;
  }
}

export function buildMetafileAcceleratedContentUrl(baseUrl: unknown, pinId: string): string {
  const normalizedBaseUrl = normalizeMetafileContentBaseUrl(baseUrl);
  const encodedPinId = encodeURIComponent(pinId);
  return isMetafileIndexerRoot(normalizedBaseUrl)
    ? `${normalizedBaseUrl}/api/v1/files/accelerate/content/${encodedPinId}`
    : `${normalizedBaseUrl}/${encodedPinId}`;
}

export function buildMetafileContentUrl(baseUrl: unknown, pinId: string): string {
  const normalizedBaseUrl = normalizeMetafileContentBaseUrl(baseUrl);
  const encodedPinId = encodeURIComponent(pinId);
  return isMetafileIndexerRoot(normalizedBaseUrl)
    ? `${normalizedBaseUrl}/content/${encodedPinId}`
    : `${normalizedBaseUrl}/${encodedPinId}`;
}
