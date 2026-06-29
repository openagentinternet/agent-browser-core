import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { browserFailure } from '@openagentinternet/agent-browser-host-contract';
import { renderBrowserPageHtml } from '@openagentinternet/agent-browser-ui';
import {
  handleStandaloneBrowserApiRoute,
  sendHtml,
  sendJson,
  sendText,
  statusForBrowserResult,
} from './http.js';
import {
  contentTypeForPath,
  resolveStandaloneAssetPath,
  resolveStandaloneAssetsRoot,
} from './assets.js';
import {
  createStandaloneBrowserHostAdapter,
  type CreateStandaloneBrowserHostAdapterInput,
  type StandaloneBrowserHostAdapter,
} from './adapter.js';

export interface CreateStandaloneBrowserServerInput extends CreateStandaloneBrowserHostAdapterInput {
  adapter?: StandaloneBrowserHostAdapter;
  assetsRoot?: string;
}

async function loadInitialPage(): Promise<string> {
  return renderBrowserPageHtml();
}

function isBrowserPage(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/browser' ||
    pathname === '/ui/browser' ||
    /^\/browser\/(?:metaid|metaapp|metafile|pin)\/[^/?#]+$/.test(pathname) ||
    /^\/browser\/map\/.+$/.test(pathname);
}

const PREVIEW_ASSET_PREFIX = '/api/browser/preview-assets/';
const STATIC_ASSET_PREFIX = '/assets/';
const FALLBACK_SHARED_CSS = '/* MetaBot UI shared development styles */\n';

function parsePreviewAssetPath(pathname: string): { previewId: string; assetPath: string } | null {
  if (!pathname.startsWith(PREVIEW_ASSET_PREFIX)) {
    return null;
  }
  const rest = pathname.slice(PREVIEW_ASSET_PREFIX.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  try {
    const [previewId, ...assetParts] = parts.map((part) => decodeURIComponent(part));
    return {
      previewId,
      assetPath: assetParts.join('/'),
    };
  } catch {
    return null;
  }
}

async function serveSharedCss(res: http.ServerResponse): Promise<boolean> {
  sendText(res, 200, FALLBACK_SHARED_CSS, 'text/css; charset=utf-8');
  return true;
}

async function serveStandaloneAsset(
  res: http.ServerResponse,
  pathname: string,
  assetsRoot: string,
): Promise<boolean> {
  if (!pathname.startsWith(STATIC_ASSET_PREFIX)) {
    return false;
  }
  const assetPath = pathname.slice(STATIC_ASSET_PREFIX.length);
  const filePath = resolveStandaloneAssetPath(assetPath, assetsRoot);
  if (!filePath) {
    return false;
  }
  try {
    const body = await readFile(filePath);
    sendText(res, 200, body, contentTypeForPath(filePath));
    return true;
  } catch {
    return false;
  }
}

export function createStandaloneBrowserServer(input: CreateStandaloneBrowserServerInput = {}): http.Server {
  const adapter = input.adapter ?? createStandaloneBrowserHostAdapter(input);
  const assetsRoot = input.assetsRoot ?? resolveStandaloneAssetsRoot();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (url.pathname === '/healthz') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (isBrowserPage(url.pathname)) {
        if ((req.method ?? 'GET') !== 'GET') {
          sendJson(res, 405, { ok: false, code: 'method_not_allowed', message: 'Expected GET.' });
          return;
        }
        sendHtml(res, 200, await loadInitialPage());
        return;
      }
      if (url.pathname === '/ui/shared.css') {
        if ((req.method ?? 'GET') !== 'GET') {
          sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
          return;
        }
        await serveSharedCss(res);
        return;
      }
      if (url.pathname.startsWith(STATIC_ASSET_PREFIX)) {
        if ((req.method ?? 'GET') !== 'GET') {
          sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
          return;
        }
        const served = await serveStandaloneAsset(res, url.pathname, assetsRoot);
        if (served) {
          return;
        }
        sendJson(res, 404, browserFailure('not_found', `No route matched ${url.pathname}.`));
        return;
      }
      const previewAsset = parsePreviewAssetPath(url.pathname);
      if (previewAsset) {
        if ((req.method ?? 'GET') !== 'GET') {
          sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
          return;
        }
        const result = await adapter.resolvePreviewAsset(previewAsset);
        if (!result.ok) {
          sendJson(res, statusForBrowserResult(result), result);
          return;
        }
        sendText(res, 200, result.data.body, result.data.contentType, {
          'access-control-allow-origin': '*',
        });
        return;
      }
      if (await handleStandaloneBrowserApiRoute(req, res, url, adapter)) {
        return;
      }
      sendJson(res, 404, browserFailure('not_found', `No route matched ${url.pathname}.`));
    } catch (error) {
      sendJson(res, 500, browserFailure('internal_error', error instanceof Error ? error.message : String(error)));
    }
  });
}
