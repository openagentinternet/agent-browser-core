import { BROWSER_PAGE_STYLES } from './browserStyles.js';
import { buildBrowserPageDefinition } from './pageDefinition.js';
import type { BrowserPageDefinition } from './browserTypes.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

export function renderBrowserPageHtml(definition: BrowserPageDefinition = buildBrowserPageDefinition()): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(definition.title)}</title>
  <style>${BROWSER_PAGE_STYLES}</style>
</head>
<body>
${definition.contentHtml}
<script>${definition.script}</script>
</body>
</html>`;
}
