import { Buffer } from 'node:buffer';
import type http from 'node:http';
import {
  browserFailure,
  type BrowserCommandResult,
  type BrowserHostAdapter,
  type BrowserTrustedActionKind,
} from '@openagentinternet/agent-browser-host-contract';

const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

class InvalidJsonBodyError extends Error {}

function statusForResult(result: BrowserCommandResult<unknown>): number {
  if (result.ok || result.state === 'waiting' || result.state === 'manual_action_required') return 200;
  if (result.code === 'invalid_browser_uri' || result.code === 'missing_uri' || result.code === 'invalid_argument') return 400;
  if (result.code === 'actor_not_found') return 404;
  return 400;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;
    if (totalBytes > JSON_BODY_LIMIT_BYTES) throw new InvalidJsonBodyError('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonBodyError('Request body must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidJsonBodyError('Expected a JSON object request body.');
  }
  return parsed as Record<string, unknown>;
}

async function readJsonBodyOrSendFailure(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Record<string, unknown> | null> {
  try {
    return await readJsonBody(req);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      sendJson(res, 400, browserFailure('invalid_argument', error.message));
      return null;
    }
    throw error;
  }
}

export function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  });
  res.end(html);
}

export async function handleStandaloneBrowserApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  adapter: BrowserHostAdapter,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const actorId = text(url.searchParams.get('actorId'));

  if (url.pathname === '/api/browser/runtime') {
    if (method !== 'GET') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
      return true;
    }
    const result = await adapter.getRuntime(actorId ? { actorId } : {});
    sendJson(res, statusForResult(result), result);
    return true;
  }

  if (url.pathname === '/api/browser/resolve') {
    if (method !== 'GET') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET.'));
      return true;
    }
    const uri = text(url.searchParams.get('uri'));
    if (!uri) {
      sendJson(res, 400, browserFailure('missing_uri', 'uri query parameter is required.'));
      return true;
    }
    const result = await adapter.resolveResource({ uri, ...(actorId ? { actorId } : {}) });
    sendJson(res, statusForResult(result), result);
    return true;
  }

  if (url.pathname === '/api/browser/settings') {
    if (method === 'GET') {
      const result = await adapter.getSettings(actorId ? { actorId } : {});
      sendJson(res, statusForResult(result), result);
      return true;
    }
    if (method === 'PUT') {
      const body = await readJsonBodyOrSendFailure(req, res);
      if (!body) return true;
      const browser = body.browser && typeof body.browser === 'object' && !Array.isArray(body.browser)
        ? body.browser as Record<string, unknown>
        : {};
      const result = await adapter.updateSettings({ browser, ...(actorId ? { actorId } : {}) });
      sendJson(res, statusForResult(result), result);
      return true;
    }
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET or PUT.'));
    return true;
  }

  if (url.pathname === '/api/browser/cache') {
    if (method === 'GET') {
      const result = await adapter.getCache(actorId ? { actorId } : {});
      sendJson(res, statusForResult(result), result);
      return true;
    }
    if (method === 'DELETE') {
      const body = await readJsonBodyOrSendFailure(req, res);
      if (!body) return true;
      const result = await adapter.clearCache({
        scope: text(body.scope) || 'all',
        ...(actorId ? { actorId } : {}),
      });
      sendJson(res, statusForResult(result), result);
      return true;
    }
    sendJson(res, 405, browserFailure('method_not_allowed', 'Expected GET or DELETE.'));
    return true;
  }

  if (url.pathname === '/api/browser/actions') {
    if (method !== 'POST') {
      sendJson(res, 405, browserFailure('method_not_allowed', 'Expected POST.'));
      return true;
    }
    const body = await readJsonBodyOrSendFailure(req, res);
    if (!body) return true;
    const result = await adapter.runTrustedAction({
      resourceUri: text(body.resourceUri),
      kind: text(body.kind) as BrowserTrustedActionKind,
      ...(actorId ? { actorId } : {}),
      ...(body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? { payload: body.payload as Record<string, unknown> } : {}),
    });
    sendJson(res, statusForResult(result), result);
    return true;
  }

  return false;
}
