import http from 'node:http';
import type { BrowserHostAdapter } from '@openagentinternet/agent-browser-host-contract';
import { buildBrowserPageDefinition, renderBrowserPageHtml } from '@openagentinternet/agent-browser-ui';
import { handleStandaloneBrowserApiRoute, sendHtml, sendJson } from './http.js';
import { createMemoryStandaloneBrowserHost } from './memoryHost.js';

export interface CreateStandaloneBrowserServerInput {
  adapter?: BrowserHostAdapter;
  defaultUri?: string;
}

async function loadInitialPage(): Promise<string> {
  return renderBrowserPageHtml(buildBrowserPageDefinition());
}

function isBrowserPage(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/browser' ||
    pathname === '/ui/browser' ||
    /^\/browser\/(?:metaid|metaapp)\/[^/?#]+$/.test(pathname);
}

export function createStandaloneBrowserServer(input: CreateStandaloneBrowserServerInput = {}): http.Server {
  const defaultUri = input.defaultUri ?? 'metaid://idq1fixturebot';
  const adapter = input.adapter ?? createMemoryStandaloneBrowserHost({ defaultUri });

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
      if (await handleStandaloneBrowserApiRoute(req, res, url, adapter)) {
        return;
      }
      sendJson(res, 404, { ok: false, code: 'not_found', message: `No route matched ${url.pathname}.` });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
