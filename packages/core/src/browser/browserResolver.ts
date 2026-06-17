import { createBotHomepageClient } from './botHomepageClient.js';
import { buildBotPageResolveResult } from './botPageResolver.js';
import { resolveMetafilePinToResource } from './metafileResolver.js';
import { buildMetaAppResolveResult } from './metaAppResolver.js';
import { parseBrowserUri, type ParsedBrowserUri } from './uri.js';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCustomHomepageUri(homepage: Record<string, unknown>): string {
  const profile = isRecord(homepage.profile) ? homepage.profile : {};
  const profileHomepage = isRecord(profile.homepage) ? profile.homepage : {};
  const payload = isRecord(profileHomepage.payload) ? profileHomepage.payload : {};
  const v3Uri = text(payload.uri);
  if (v3Uri) {
    return v3Uri;
  }

  const homepageInfo = isRecord(homepage.homepage) ? homepage.homepage : {};
  const custom = isRecord(homepageInfo.custom) ? homepageInfo.custom : {};
  return text(custom.uri);
}

function aliasCopyActions(actions: BrowserResolveResult['actions'], aliasUri: string): BrowserResolveResult['actions'] {
  return actions.map((action) => (
    action.id === 'copy-uri' || action.kind === 'copy'
      ? { ...action, uri: aliasUri }
      : action
  ));
}

function aliasCustomHomepageResult(input: {
  result: BrowserResolveResult;
  aliasUri: string;
  customHomepageUri: string;
  botHomepageSourceUrl: string;
  botHomepageRaw: Record<string, unknown>;
}): BrowserResolveResult {
  return {
    ...input.result,
    uri: input.aliasUri,
    normalizedUri: input.aliasUri,
    actions: aliasCopyActions(input.result.actions, input.aliasUri),
    source: {
      ...input.result.source,
      raw: {
        ...(input.result.source.raw ?? {}),
        aliasUri: input.aliasUri,
        customHomepageUri: input.customHomepageUri,
        botHomepageSourceUrl: input.botHomepageSourceUrl,
        botHomepageRaw: input.botHomepageRaw,
      },
    },
  };
}

async function resolveMetaAppResource(input: {
  parsed: ParsedBrowserUri;
  request: ResolveBrowserResourceInput;
}): Promise<BrowserCommandResult<BrowserResolveResult>> {
  let record: MetaAppGalleryRecord | null;
  if (input.request.metaAppResolve) {
    const resolved = await input.request.metaAppResolve(input.parsed.id);
    if (!resolved.ok) {
      return resolved;
    }
    record = resolved.data;
  } else if (input.request.metaAppLookup) {
    record = await input.request.metaAppLookup(input.parsed.id);
  } else {
    record = null;
  }
  if (!record) {
    return browserCommandFailed('browser_resource_not_found', 'Resource not found.');
  }

  return browserCommandSuccess(buildMetaAppResolveResult({
    uri: input.parsed.originalUri,
    normalizedUri: input.parsed.normalizedUri,
    record,
    fetchedAt: Date.now(),
  }));
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

    const aliasUri = parsed.normalizedUri;
    const customHomepageUri = readCustomHomepageUri(homepage.data);
    if (input.config.renderCustomBotPages !== false && customHomepageUri) {
      let customParsed;
      try {
        customParsed = parseBrowserUri(customHomepageUri);
      } catch (error) {
        return browserCommandFailed('invalid_browser_uri', error instanceof Error ? error.message : String(error));
      }

      if (customParsed.scheme !== 'metaapp' && customParsed.scheme !== 'metafile') {
        return browserCommandFailed('invalid_browser_uri', 'Custom Bot Page URI must use metaapp:// or metafile://.');
      }

      const customResolved = customParsed.scheme === 'metafile'
        ? await resolveMetafilePinToResource({
          uri: customParsed.originalUri,
          id: customParsed.id,
          fetch: input.fetch,
          manApiBaseUrl: input.config.manApiBaseUrl,
          metafileContentBaseUrl: input.config.metafileContentBaseUrl,
        })
        : await resolveMetaAppResource({ parsed: customParsed, request: input });

      if (!customResolved.ok) {
        return customResolved;
      }

      return browserCommandSuccess(aliasCustomHomepageResult({
        result: customResolved.data,
        aliasUri,
        customHomepageUri,
        botHomepageSourceUrl: homepage.url,
        botHomepageRaw: homepage.data,
      }));
    }

    return browserCommandSuccess(buildBotPageResolveResult({
      uri: parsed.originalUri,
      normalizedUri: parsed.normalizedUri,
      homepage: homepage.data,
      resolverUrl: homepage.url,
      templateId: input.config.botHomepageTemplateId,
      metafileContentBaseUrl: input.config.metafileContentBaseUrl,
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

  return resolveMetaAppResource({ parsed, request: input });
}
