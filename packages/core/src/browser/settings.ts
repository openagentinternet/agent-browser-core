import { BOT_HOMEPAGE_TEMPLATES, isBotHomepageTemplateId } from './botHomepageTemplates.js';
import { createDefaultBrowserConfig, resolveBrowserConfig } from './config.js';
import type {
  BrowserBaseConfig,
  BrowserBaseConfigInput,
  BrowserConfigContainer,
  BrowserSettingsSnapshot,
} from './types.js';

export type { BrowserSettingsSnapshot } from './types.js';

export const BROWSER_BASE_URL_KEYS = [
  'metasoP2PBaseUrl',
  'metafileContentBaseUrl',
  'manApiBaseUrl',
  'blockExplorerBaseUrl',
  'walletApiBaseUrl',
] as const;

export type BrowserBaseUrlKey = typeof BROWSER_BASE_URL_KEYS[number];

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value: unknown): string {
  return normalizeText(value).replace(/\/+$/, '');
}

function validateHttpBaseUrl(key: BrowserBaseUrlKey, value: string): string {
  if (!value) {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported_protocol');
    }
    return parsed.href.replace(/\/+$/, '');
  } catch {
    throw new Error(`browser.${key} must be an http(s) base URL.`);
  }
}

function validateHttpUrl(value: unknown, message: string): string {
  const text = normalizeBaseUrl(value);
  if (!text) {
    throw new Error(message);
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported_protocol');
    }
    return parsed.href.replace(/\/+$/, '');
  } catch {
    throw new Error(message);
  }
}

function validateHttpUrlList(value: unknown): string[] {
  const typeMessage = 'browser.nameResolution.ens.rpcUrls must be a string or string array.';
  const message = 'browser.nameResolution.ens.rpcUrls must contain http(s) URLs.';
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw new Error(typeMessage);
  }
  const rawItems = Array.isArray(value) ? value : value.split(',');
  if (rawItems.some((item) => typeof item !== 'string')) {
    throw new Error(typeMessage);
  }
  return rawItems.map((item) => validateHttpUrl(item, message));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRequiredObject(value: unknown, message: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(message);
}

function readNameResolutionConfig(
  value: BrowserBaseConfigInput['nameResolution'] | undefined,
  defaults: BrowserBaseConfig['nameResolution'],
): BrowserBaseConfig['nameResolution'] {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : defaults.enabled,
    ens: {
      enabled: typeof value?.ens?.enabled === 'boolean' ? value.ens.enabled : defaults.ens.enabled,
      chainId: 1,
      rpcUrls: Array.isArray(value?.ens?.rpcUrls) ? [...value.ens.rpcUrls] : [...defaults.ens.rpcUrls],
      textKey: value?.ens?.textKey || defaults.ens.textKey,
    },
  };
}

function readOptionalBoolean(value: unknown, fallback: boolean, message: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }
  return value;
}

function mergeNameResolutionSettings(
  current: BrowserBaseConfigInput['nameResolution'],
  input: unknown,
  defaults: BrowserBaseConfig['nameResolution'],
): BrowserBaseConfig['nameResolution'] {
  const value = readRequiredObject(input, 'browser.nameResolution must be an object.');
  const existing = readNameResolutionConfig(current, defaults);
  const ensInput = hasOwn(value, 'ens')
    ? readRequiredObject(value.ens, 'browser.nameResolution.ens must be an object.')
    : {};
  const next = {
    enabled: readOptionalBoolean(value.enabled, existing.enabled, 'browser.nameResolution.enabled must be a boolean.'),
    ens: {
      enabled: readOptionalBoolean(ensInput.enabled, existing.ens.enabled, 'browser.nameResolution.ens.enabled must be a boolean.'),
      chainId: 1 as const,
      rpcUrls: hasOwn(ensInput, 'rpcUrls')
        ? validateHttpUrlList(ensInput.rpcUrls)
        : [...existing.ens.rpcUrls],
      textKey: hasOwn(ensInput, 'textKey')
        ? normalizeText(ensInput.textKey)
        : existing.ens.textKey,
    },
  };
  if (!next.ens.textKey) {
    throw new Error('browser.nameResolution.ens.textKey must be a non-empty string.');
  }
  return next;
}

export function createBrowserSettingsSnapshot(input: {
  config: BrowserConfigContainer;
  configPath?: string;
  env?: Record<string, string | undefined>;
}): BrowserSettingsSnapshot {
  const defaults = createDefaultBrowserConfig();
  return {
    browser: { ...(input.config.browser ?? {}) },
    effectiveBrowser: { ...resolveBrowserConfig(input.config, input.env ?? {}) },
    defaults: { ...defaults },
    ...(input.configPath ? { configPath: input.configPath } : {}),
  };
}

export function applyBrowserSettingsUpdate<TConfig extends BrowserConfigContainer>(
  current: TConfig,
  rawBrowserInput: unknown,
): TConfig & { browser: BrowserBaseConfigInput } {
  const browserInput = readObject(rawBrowserInput);
  const defaults = createDefaultBrowserConfig();
  const nextBrowser: BrowserBaseConfigInput = {
    ...(current.browser ?? {}),
  };

  for (const key of BROWSER_BASE_URL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(browserInput, key)) {
      continue;
    }
    const normalized = validateHttpBaseUrl(key, normalizeBaseUrl(browserInput[key]));
    if (!normalized) {
      const fallback = defaults[key];
      if (fallback) {
        nextBrowser[key] = fallback;
      } else {
        delete nextBrowser[key];
      }
    } else {
      nextBrowser[key] = normalized;
    }
  }

  if (Object.prototype.hasOwnProperty.call(browserInput, 'botHomepageTemplateId')) {
    const templateId = normalizeText(browserInput.botHomepageTemplateId);
    if (!isBotHomepageTemplateId(templateId)) {
      throw new Error(`browser.botHomepageTemplateId must be one of ${BOT_HOMEPAGE_TEMPLATES.map((template) => template.id).join(', ')}.`);
    }
    nextBrowser.botHomepageTemplateId = templateId;
  }

  if (Object.prototype.hasOwnProperty.call(browserInput, 'renderCustomBotPages')) {
    if (typeof browserInput.renderCustomBotPages !== 'boolean') {
      throw new Error('browser.renderCustomBotPages must be a boolean');
    }
    nextBrowser.renderCustomBotPages = browserInput.renderCustomBotPages;
  }

  if (Object.prototype.hasOwnProperty.call(browserInput, 'nameResolution')) {
    nextBrowser.nameResolution = mergeNameResolutionSettings(
      nextBrowser.nameResolution,
      browserInput.nameResolution,
      defaults.nameResolution,
    );
  }

  if (Object.prototype.hasOwnProperty.call(browserInput, 'localMode')) {
    nextBrowser.localMode = browserInput.localMode === true;
  }

  return {
    ...current,
    browser: nextBrowser,
  };
}
