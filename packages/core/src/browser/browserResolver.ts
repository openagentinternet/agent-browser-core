import { createBotHomepageClient } from './botHomepageClient.js';
import { buildBotPageResolveResult } from './botPageResolver.js';
import { resolveMetafilePinToResource } from './metafileResolver.js';
import { buildMetaAppResolveResult } from './metaAppResolver.js';
import { parseBrowserUri } from './uri.js';
import {
  browserCommandFailed,
  browserCommandSuccess,
  type BotBrowserConfig,
  type BrowserCommandResult,
  type BrowserResolveResult,
  type MetaAppGalleryRecord,
} from './types.js';

export interface ResolveBrowserResourceInput {
  uri: string;
  config: BotBrowserConfig;
  fetch?: typeof fetch;
  metaAppLookup?: (pinId: string) => Promise<MetaAppGalleryRecord | null>;
  metaAppResolve?: (pinId: string) => Promise<BrowserCommandResult<MetaAppGalleryRecord>>;
}

export async function resolveBrowserResource(input: ResolveBrowserResourceInput): Promise<BrowserCommandResult<BrowserResolveResult>> {
  let parsed;
  try {
    parsed = parseBrowserUri(input.uri);
  } catch (error) {
    return browserCommandFailed('invalid_browser_uri', error instanceof Error ? error.message : String(error));
  }

  if (parsed.scheme === 'metaid') {
    if (!input.config.metasoP2PBaseUrl.trim()) {
      return browserCommandFailed('browser_config_missing', 'Browser metaso-p2p base URL is not configured.');
    }

    const client = createBotHomepageClient({
      baseUrl: input.config.metasoP2PBaseUrl,
      fetch: input.fetch,
    });
    const homepage = await client.getByGlobalMetaId(parsed.id);
    if (!homepage.ok) {
      if (homepage.code === 'bot_homepage_not_found') {
        return browserCommandFailed('browser_resource_not_found', homepage.message);
      }
      return browserCommandFailed('browser_resolve_failed', homepage.message);
    }

    return browserCommandSuccess(buildBotPageResolveResult({
      uri: parsed.originalUri,
      normalizedUri: parsed.normalizedUri,
      homepage: homepage.data,
      resolverUrl: homepage.url,
      templateId: input.config.botHomepageTemplateId,
    }));
  }

  if (parsed.scheme === 'metafile') {
    return resolveMetafilePinToResource({
      uri: parsed.originalUri,
      id: parsed.id,
      fetch: input.fetch,
      manApiBaseUrl: input.config.manApiBaseUrl,
      metafileContentBaseUrl: input.config.metafileContentBaseUrl,
    });
  }

  let record: MetaAppGalleryRecord | null;
  if (input.metaAppResolve) {
    const resolved = await input.metaAppResolve(parsed.id);
    if (!resolved.ok) {
      return resolved;
    }
    record = resolved.data;
  } else if (input.metaAppLookup) {
    record = await input.metaAppLookup(parsed.id);
  } else {
    record = null;
  }
  if (!record) {
    return browserCommandFailed('browser_resource_not_found', 'Resource not found.');
  }

  return browserCommandSuccess(buildMetaAppResolveResult({
    uri: parsed.originalUri,
    normalizedUri: parsed.normalizedUri,
    record,
    fetchedAt: Date.now(),
  }));
}
