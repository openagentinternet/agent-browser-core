import path from 'node:path';

export const STANDALONE_ASSETS_BASE_PATH = '/assets';
export const WALLET_PROVIDER_ICON_PATH = `${STANDALONE_ASSETS_BASE_PATH}/metalet-logo-v3.4c11a0b7.svg`;
export const SECONDARY_WALLET_PROVIDER_ICON_PATH = `${STANDALONE_ASSETS_BASE_PATH}/metamask-fox.svg`;

function normalizeAssetPath(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
  if (!text || text.startsWith('/') || text.includes('\0')) {
    return null;
  }
  const normalized = path.posix.normalize(text.replace(/^\.\//u, ''));
  if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
    return null;
  }
  return normalized;
}

export function resolveStandaloneAssetsRoot(baseDir?: string): string {
  const resolvedBaseDir = path.resolve(baseDir ?? process.cwd(), 'packages/host-standalone/dist');
  return path.resolve(resolvedBaseDir, '..', 'assets');
}

export function resolveStandaloneAssetPath(assetPath: unknown, assetsRoot?: string): string | null {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized) {
    return null;
  }
  const root = path.resolve(assetsRoot ?? resolveStandaloneAssetsRoot());
  const filePath = path.resolve(root, normalized);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return filePath;
}

export function contentTypeForPath(filePath: string): string {
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
