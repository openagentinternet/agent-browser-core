import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBrowserUri } from '@openagentinternet/agent-browser-core';
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
  getStandaloneAdapterPreviewOriginRegistration,
  type CreateStandaloneBrowserHostAdapterInput,
  type StandaloneBrowserHostAdapter,
} from './adapter.js';

export interface CreateStandaloneBrowserServerInput extends CreateStandaloneBrowserHostAdapterInput {
  adapter?: StandaloneBrowserHostAdapter;
  assetsRoot?: string;
  /**
   * Control for the ephemeral loopback preview origin. Defaults to enabled:
   * MetaApp preview content is served from a dedicated loopback port so the
   * sandboxed app frame keeps its own real origin (different from the Browser
   * page origin) and its localStorage survives reloads. This also applies to
   * adapters built by createStandaloneBrowserHostAdapter and passed via
   * `adapter` unless they pinned their own previewContentBaseUrl. Set to false
   * to always serve preview URLs relative to the main origin: frames render
   * opaque and MetaApp storage becomes session-only (surfaced as a startup
   * warning and in /healthz).
   */
  enablePreviewOriginServer?: boolean;
}

async function loadInitialPage(): Promise<string> {
  return renderBrowserPageHtml();
}

function isBareBrowserPagePath(pathname: string): boolean {
  const match = pathname.match(/^\/browser\/([^/?#]+)$/u);
  if (!match) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    if (!decoded || decoded.includes('://')) {
      return false;
    }
    parseBrowserUri(decoded);
    return true;
  } catch {
    return false;
  }
}

function isBrowserPage(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/browser' ||
    pathname === '/ui/browser' ||
    isBareBrowserPagePath(pathname) ||
    /^\/browser\/(?:metaid|metaapp|metafile|pin)\/[^/?#]+$/.test(pathname) ||
    /^\/browser\/map\/.+$/.test(pathname);
}

const PREVIEW_ASSET_PREFIX = '/api/browser/preview-assets/';
const LOOPBACK_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

function firstHeaderValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? '').trim();
}

// The standalone API is unauthenticated by design (loopback dev server). Block
// blind cross-site triggers from sandboxed MetaApps and arbitrary websites:
// the Host header must be a loopback literal (anti DNS-rebinding) and
// Sec-Fetch-Site, when present, must be same-origin or none. Non-browser
// clients (curl, node fetch, MetaBot skills) send no fetch metadata and stay
// allowed. Preview assets are exempt: the opaque-origin MetaApp iframe loads
// its own assets with Sec-Fetch-Site: cross-site. Binding the server to a
// non-loopback host (e.g. --host 0.0.0.0) makes the API unreachable by
// design, since only loopback Host literals are trusted.
function isTrustedLoopbackRequest(req: http.IncomingMessage): boolean {
  if (!LOOPBACK_HOST_PATTERN.test(firstHeaderValue(req.headers.host))) {
    return false;
  }
  const secFetchSite = firstHeaderValue(req.headers['sec-fetch-site']).toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  return true;
}

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

// Serves one preview-asset request (shared by the main server and the preview
// origin server). Returns false when the path is not a preview asset path.
async function servePreviewAssetRequest(
  adapter: StandaloneBrowserHostAdapter,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const previewAsset = parsePreviewAssetPath(url.pathname);
  if (!previewAsset) {
    return false;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
    return true;
  }
  const result = await adapter.resolvePreviewAsset(previewAsset);
  if (!result.ok) {
    sendJson(res, statusForBrowserResult(result), result);
    return true;
  }
  sendText(res, 200, result.data.body, result.data.contentType, {
    'access-control-allow-origin': '*',
  });
  return true;
}

export function createStandaloneBrowserServer(input: CreateStandaloneBrowserServerInput = {}): http.Server {
  // MetaApp preview content is served from a dedicated ephemeral loopback
  // origin so the sandboxed app frame keeps a real origin that is deliberately
  // DIFFERENT from the Browser page origin. The UI then grants
  // allow-same-origin (app storage persists, canvases export, downloads work)
  // while the app still cannot script the Browser page or pass the
  // same-origin API guard. The ephemeral origin runs for the default
  // standalone path AND for adapters built by createStandaloneBrowserHostAdapter
  // passed via `adapter` (wired through the adapter's preview-origin
  // registration), unless the adapter pinned its own previewContentBaseUrl or
  // the caller disables it via enablePreviewOriginServer. Fully custom
  // adapters cannot be wired, so they fall back to relative preview URLs and
  // /healthz reports the session-only degradation instead of hiding it.
  const previewOrigin = { baseUrl: '' };
  const adapterRegistration = input.adapter
    ? getStandaloneAdapterPreviewOriginRegistration(input.adapter)
    : undefined;
  // Caller-owned external preview origin: a server-level previewContentBaseUrl
  // (no-adapter path only — with `adapter` it was never applied to the
  // adapter) or one pinned on the adapter at construction. Function-form
  // getters count as caller-owned too.
  const externalPreviewBaseUrl = (
    !input.adapter && typeof input.previewContentBaseUrl === 'string'
      ? input.previewContentBaseUrl.trim()
      : ''
  ) || adapterRegistration?.pinnedBaseUrl || '';
  const externalPreviewConfigured = !!externalPreviewBaseUrl
    || (!input.adapter && typeof input.previewContentBaseUrl === 'function')
    || !!adapterRegistration?.pinned;
  const usesPreviewOriginServer = input.enablePreviewOriginServer !== false
    && !externalPreviewConfigured
    && (!input.adapter || !!adapterRegistration);
  const adapter = input.adapter ?? createStandaloneBrowserHostAdapter({
    ...input,
    previewContentBaseUrl: input.previewContentBaseUrl ?? (() => previewOrigin.baseUrl),
  });
  const assetsRoot = input.assetsRoot ?? resolveStandaloneAssetsRoot();

  // Storage degradation surface for /healthz and startup logs. Ephemeral mode
  // reports its actual bind result at request time (the loopback port is
  // bound shortly after the main server starts listening).
  function previewStorageState(): {
    storage: 'persistent' | 'session-only' | 'host-configured';
    previewOrigin: string;
    warning?: string;
  } {
    if (externalPreviewConfigured) {
      return { storage: 'host-configured', previewOrigin: externalPreviewBaseUrl };
    }
    return previewOrigin.baseUrl
      ? { storage: 'persistent', previewOrigin: previewOrigin.baseUrl }
      : {
        storage: 'session-only',
        previewOrigin: '',
        warning: 'MetaApp preview frames share the Browser page origin, so MetaApp storage is session-only and app data is lost on reload.',
      };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (url.pathname === '/healthz') {
        sendJson(res, 200, { ok: true, metaAppPreview: previewStorageState() });
        return;
      }
      if (url.pathname.startsWith('/api/') && !url.pathname.startsWith(PREVIEW_ASSET_PREFIX)) {
        if (!isTrustedLoopbackRequest(req)) {
          sendJson(res, 403, browserFailure('forbidden', 'Request rejected by the standalone loopback request guard.'));
          return;
        }
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
      if (await servePreviewAssetRequest(adapter, req, res, url)) {
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

  if (usesPreviewOriginServer) {
    const previewServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      try {
        if (await servePreviewAssetRequest(adapter, req, res, url)) {
          return;
        }
        sendJson(res, 404, browserFailure('not_found', `No route matched ${url.pathname}.`));
      } catch (error) {
        sendJson(res, 500, browserFailure('internal_error', error instanceof Error ? error.message : String(error)));
      }
    });
    // On listen failure fall back to relative preview URLs (opaque frames)
    // and say so loudly instead of degrading silently.
    previewServer.on('error', () => {
      previewOrigin.baseUrl = '';
      if (adapterRegistration) {
        adapterRegistration.ephemeralBaseUrl = '';
      }
      console.warn('[standalone-browser] MetaApp preview origin failed to bind; preview frames fall back to the page origin and MetaApp storage will be session-only.');
    });
    // Bind only while the main server is listening, so a server that is
    // created but never listens (e.g. a CLI run whose port is taken) never
    // holds a port.
    server.on('listening', () => {
      previewServer.listen(0, '127.0.0.1', () => {
        const address = previewServer.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        if (port) {
          previewOrigin.baseUrl = `http://127.0.0.1:${port}`;
          if (adapterRegistration) {
            adapterRegistration.ephemeralBaseUrl = previewOrigin.baseUrl;
          }
          console.log(`[standalone-browser] MetaApp preview origin listening at ${previewOrigin.baseUrl} (MetaApp storage persists across reloads).`);
        }
      });
    });
    server.on('close', () => {
      // The ephemeral origin dies with the server; stop advertising it to the
      // adapter so later preview sessions fall back to relative URLs.
      if (adapterRegistration) {
        adapterRegistration.ephemeralBaseUrl = '';
      }
      previewOrigin.baseUrl = '';
      // close() alone leaves idle keep-alive connections holding the event
      // loop (tests would hang at exit); drop them explicitly.
      previewServer.closeIdleConnections();
      previewServer.closeAllConnections();
      previewServer.close();
    });
  } else {
    server.on('listening', () => {
      if (previewStorageState().storage === 'session-only') {
        console.warn('[standalone-browser] No independent MetaApp preview origin is active; MetaApp preview frames share the page origin and MetaApp storage will be session-only.');
      }
    });
  }

  return server;
}
