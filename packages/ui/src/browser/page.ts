import { buildBrowserPageDefinition, type BrowserPageDefinition } from './app.js';
import { BROWSER_INDEX_HTML } from './indexHtml.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizedLanguage(languagePreference?: string | null): string {
  const language = String(languagePreference ?? '').trim();
  return language || 'en';
}

export async function renderBrowserPageHtml(
  definition: BrowserPageDefinition = buildBrowserPageDefinition(),
  languagePreference?: string | null,
): Promise<string> {
  const content = definition.contentHtml ?? '';
  return BROWSER_INDEX_HTML
    .split('<html lang="en">').join(`<html lang="${escapeHtml(normalizedLanguage(languagePreference))}">`)
    .split('__PAGE_TITLE__').join(escapeHtml(definition.title))
    .split('__PAGE_EYEBROW__').join(escapeHtml(definition.eyebrow))
    .split('__PAGE_HEADING__').join(escapeHtml(definition.heading))
    .split('__PAGE_DESCRIPTION__').join(escapeHtml(definition.description))
    .split('__PAGE_NAV__').join('')
    .split('__PAGE_PANELS__').join('')
    .split('__PAGE_CONTENT__').join(content)
    .split('__PAGE_SCRIPT__').join(definition.script);
}
