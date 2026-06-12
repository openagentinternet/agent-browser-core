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
    .replace(/<html lang="en">/g, `<html lang="${escapeHtml(normalizedLanguage(languagePreference))}">`)
    .replace(/__PAGE_TITLE__/g, escapeHtml(definition.title))
    .replace(/__PAGE_EYEBROW__/g, escapeHtml(definition.eyebrow))
    .replace(/__PAGE_HEADING__/g, escapeHtml(definition.heading))
    .replace(/__PAGE_DESCRIPTION__/g, escapeHtml(definition.description))
    .replace(/__PAGE_NAV__/g, '')
    .replace(/__PAGE_PANELS__/g, '')
    .replace(/__PAGE_CONTENT__/g, content)
    .replace(/__PAGE_SCRIPT__/g, definition.script);
}
