import { Marked } from 'marked';

import type { BrowserResourceEnvelope } from '@openagentinternet/agent-browser-host-contract';

const INTERNAL_BROWSER_URI_PATTERN = /^(metaid|metaapp|metafile|map|pin):\/\//iu;
const EXTERNAL_URL_PATTERN = /^https?:\/\//iu;
const MEDIA_KEYS = ['images', 'image', 'imageUrls', 'attachments', 'files', 'media'];

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function data(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(resource.renderer.data);
}

function payloadValue(resource: BrowserResourceEnvelope): unknown {
  return data(resource).payload ?? data(resource).rawPayload ?? '';
}

function pinValue(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(data(resource).pin);
}

function rawPinRecord(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(data(resource).rawPinRecord ?? data(resource).pin);
}

function versionValue(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(data(resource).version);
}

function jsonBlock(value: unknown): string {
  return `<pre class="browser-protocol-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function linkHtml(value: string, label?: string, extraAttributes = ''): string {
  const href = text(value);
  if (!href) return '';
  const content = escapeHtml(label || href);
  const internal = INTERNAL_BROWSER_URI_PATTERN.test(href);
  const external = EXTERNAL_URL_PATTERN.test(href);
  return `<a href="${escapeHtml(href)}"${internal ? ' data-browser-map-link' : external ? ' target="_blank" rel="noopener"' : ''}${extraAttributes}>${content}</a>`;
}

function fieldValueHtml(value: unknown): string {
  if (typeof value === 'string') {
    if (INTERNAL_BROWSER_URI_PATTERN.test(value) || EXTERNAL_URL_PATTERN.test(value)) {
      return linkHtml(value);
    }
    return escapeHtml(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return escapeHtml(String(value));
  }
  return escapeHtml(JSON.stringify(value));
}

function sectionBlock(title: string, bodyHtml: string, intro = ''): string {
  return `<section class="browser-pin-section">${intro ? `<p class="browser-pin-intro">${escapeHtml(intro)}</p>` : ''}<h3>${escapeHtml(title)}</h3>${bodyHtml}</section>`;
}

function infoList(items: Array<{ key: string; value: unknown; copyValue?: string }>): string {
  return `<dl class="browser-protocol-proof">${items.map((item) => {
    const copyButton = item.copyValue
      ? ` <button type="button" data-browser-copy-value="${escapeHtml(item.copyValue)}">Copy</button>`
      : '';
    return `<dt>${escapeHtml(item.key)}</dt><dd>${fieldValueHtml(item.value)}${copyButton}</dd>`;
  }).join('')}</dl>`;
}

const markdownRenderer = new Marked();

function renderMarkdownReference(href: string, content: string, title?: string | null): string {
  const normalizedHref = text(href);
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
  if (INTERNAL_BROWSER_URI_PATTERN.test(normalizedHref)) {
    return `<a href="${escapeHtml(normalizedHref)}" data-browser-map-link${titleAttribute}>${content}</a>`;
  }
  if (EXTERNAL_URL_PATTERN.test(normalizedHref)) {
    return `<a href="${escapeHtml(normalizedHref)}" target="_blank" rel="noopener"${titleAttribute}>${content}</a>`;
  }
  return content;
}

markdownRenderer.use({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const content = this.parser.parseInline(tokens);
      return renderMarkdownReference(href, content, title);
    },
    image({ href, title, text: alt }) {
      const content = escapeHtml(alt || href);
      return renderMarkdownReference(href, content, title);
    },
  },
});

function parseJsonPayload(payload: unknown, rawPayload: unknown): unknown {
  if (payload && typeof payload === 'object') return payload;
  const candidate = typeof rawPayload === 'string' && rawPayload.trim() ? rawPayload : typeof payload === 'string' ? payload : '';
  if (!candidate) return payload;
  try {
    return JSON.parse(candidate);
  } catch {
    return payload;
  }
}

function renderMarkdown(value: string): string {
  return String(markdownRenderer.parse(value));
}

function contentTypeValue(resource: BrowserResourceEnvelope): string {
  return text(resource.renderer.contentType || pinValue(resource).contentType || rawPinRecord(resource).contentType).toLowerCase();
}

function payloadIntro(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  if (contentType.includes('json')) {
    return 'JSON payload.';
  }
  if (contentType.startsWith('text/markdown')) {
    return 'Markdown payload.';
  }
  if (contentType.startsWith('text/plain')) {
    return 'Plain text payload.';
  }
  return 'Binary payload preview is not available.';
}

function rawIntro(): string {
  return 'Raw payload.';
}

function mediaIntro(): string {
  return 'Related media and files.';
}

function verifyIntro(): string {
  return 'TxID for verification.';
}

const PIN_INSPECTOR_PAGE_STYLE = `
  <style>
    body:has(.browser-pin-page) {
      background:
        radial-gradient(circle at top left, rgba(46, 111, 237, 0.08), transparent 28%),
        radial-gradient(circle at top right, rgba(17, 138, 105, 0.07), transparent 22%),
        #eef3f9;
    }
    body:has(.browser-pin-page) .browser-viewport { padding: 18px 14px 36px; }
    .browser-pin-page { width: min(1380px, calc(100vw - 28px)); max-width: none; margin: 18px auto 36px; display: grid; gap: 18px; }
    .browser-pin-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 4px 2px 0; flex-wrap: wrap; }
    .browser-pin-page-copy { display: grid; gap: 6px; min-width: 0; }
    .browser-pin-page-eyebrow { margin: 0; color: #6a778b; font-size: 12px; font-weight: 700; letter-spacing: .01em; }
    .browser-pin-page-head h2 { margin: 0; font-size: 30px; line-height: 1.08; }
    .browser-pin-page-subtitle { margin: 0; color: #6a778b; font-size: 14px; }
    .browser-pin-page-actions { display: flex; align-items: flex-start; flex-shrink: 0; gap: 8px; }
    .browser-pin-page-actions button { min-height: 34px; border: 1px solid #d9e1ed; border-radius: 10px; background: #fff; color: #162132; padding: 7px 12px; font-size: 12px; font-weight: 700; }
    .browser-pin-page-grid { display: grid; grid-template-columns: minmax(0, 1.58fr) minmax(300px, 320px); gap: 16px; align-items: start; }
    .browser-pin-stack, .browser-pin-aside { display: grid; gap: 18px; align-content: start; }
    .browser-pin-section { display: grid; gap: 12px; padding: 16px 18px; border: 1px solid #d9e1ed; border-radius: 14px; background: rgba(255, 255, 255, .92); box-shadow: 0 18px 46px rgba(19, 35, 67, .08), 0 3px 12px rgba(19, 35, 67, .04); }
    .browser-pin-aside .browser-pin-section { background: rgba(255, 255, 255, .82); }
    .browser-pin-section h3 { margin: 0; font-size: 15px; }
    .browser-pin-intro { margin: 0; color: #6a778b; font-size: 13px; line-height: 1.45; }
    .browser-protocol-json, .browser-protocol-raw, .browser-pin-text { margin: 0; overflow: auto; padding: 16px; border-radius: 12px; background: #182235; color: #d7e3f0; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .browser-pin-markdown { display: grid; gap: 10px; line-height: 1.7; color: #162132; }
    .browser-pin-markdown h1, .browser-pin-markdown h2, .browser-pin-markdown h3, .browser-pin-markdown p { margin: 0; }
    .browser-pin-markdown a { color: #2e6fed; text-decoration: none; }
    .browser-pin-markdown a:hover { text-decoration: underline; }
    .browser-pin-binary-notice { margin: 0; color: #6a778b; }
    .browser-protocol-proof { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px 14px; margin: 0; }
    .browser-protocol-proof dt { color: #6a778b; font-size: 12px; font-weight: 700; }
    .browser-protocol-proof dd { margin: 0; overflow-wrap: anywhere; }
    .browser-protocol-proof dd button { margin-left: 8px; border: 1px solid #d9e1ed; border-radius: 8px; background: #fff; padding: 4px 8px; }
    .browser-pin-file-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid #e6ebf2; }
    .browser-pin-file-row:first-of-type { border-top: 0; padding-top: 0; }
    .browser-pin-file-row span { min-width: 0; }
    .browser-pin-file-row a { color: #2e6fed; text-decoration: none; overflow-wrap: anywhere; }
    .browser-pin-file-row a:hover { text-decoration: underline; }
    .browser-pin-file-row button { border: 1px solid #d9e1ed; border-radius: 9px; background: #fff; padding: 6px 10px; white-space: nowrap; }
    @media (max-width: 1100px) {
      .browser-pin-page-grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 720px) {
      body:has(.browser-pin-page) .browser-viewport { padding: 12px 8px 20px; }
      .browser-pin-page { width: calc(100vw - 16px); margin: 12px auto 24px; gap: 14px; }
      .browser-pin-page-head { flex-direction: column; }
      .browser-pin-page-actions { width: 100%; }
      .browser-pin-page-actions button { width: 100%; }
      .browser-protocol-proof { grid-template-columns: 1fr; }
      .browser-pin-file-row { flex-direction: column; align-items: flex-start; }
    }
  </style>
`;

function renderPayload(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;

  if (contentType.includes('json')) {
    return jsonBlock(parseJsonPayload(payload, rawPayload));
  }
  if (contentType.startsWith('text/markdown')) {
    return `<div class="browser-pin-markdown">${renderMarkdown(typeof payload === 'string' ? payload : text(rawPayload))}</div>`;
  }
  if (contentType.startsWith('text/plain')) {
    const plain = typeof payload === 'string' ? payload : text(rawPayload);
    return `<pre class="browser-pin-text">${escapeHtml(plain)}</pre>`;
  }
  return '<p class="browser-pin-binary-notice">Binary payload preview is not available for this pin.</p>';
}

function renderRawPayload(resource: BrowserResourceEnvelope): string {
  const rawPayload = data(resource).rawPayload;
  const payload = payloadValue(resource);
  const source = typeof rawPayload === 'string'
    ? rawPayload
    : typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2);
  return `<pre class="browser-protocol-raw">${escapeHtml(source ?? '')}</pre>`;
}

function mediaReference(value: unknown): { uri: string; label: string } | null {
  if (typeof value === 'string') {
    const uri = text(value);
    return uri ? { uri, label: uri } : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>;
    const uri = text(entry.uri ?? entry.url ?? entry.href ?? entry.src ?? entry.pinId);
    if (!uri) return null;
    return {
      uri,
      label: text(entry.label ?? entry.name ?? entry.title ?? entry.filename) || uri,
    };
  }
  return null;
}

function collectBrowserUris(value: unknown, output: Set<string>, seen = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    const matches = value.match(/(?:metaid|metaapp|metafile|map|pin):\/\/[^\s"'<>()[\]{}]+/giu) || [];
    for (const uri of matches) {
      output.add(uri.replace(/[),.;!?]+$/u, ''));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBrowserUris(item, output, seen);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  if (seen.has(value as object)) {
    return;
  }
  seen.add(value as object);
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectBrowserUris(item, output, seen);
  }
}

function isDownloadableMediaReference(reference: unknown): boolean {
  const uri = text(reference);
  if (!uri) return false;
  if (EXTERNAL_URL_PATTERN.test(uri)) return true;
  if (!uri.startsWith('metafile://')) return false;
  const pinId = uri.slice('metafile://'.length).split(/[?#]/, 1)[0].replace(/\.[A-Za-z0-9]+$/u, '');
  return /^[0-9a-f]{64}i[0-9]+$/i.test(pinId);
}

function collectMediaItems(payload: unknown): Array<{ uri: string; label: string }> {
  const body = record(payload);
  const items: Array<{ uri: string; label: string }> = [];
  for (const key of MEDIA_KEYS) {
    const candidate = body[key];
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const normalized = mediaReference(item);
        if (normalized) items.push(normalized);
      }
      continue;
    }
    const normalized = mediaReference(candidate);
    if (normalized) items.push(normalized);
  }
  const discoveredUris = new Set<string>();
  collectBrowserUris(payload, discoveredUris);
  for (const uri of discoveredUris) {
    if (!/^https?:\/\//i.test(uri)) {
      items.push({ uri, label: uri });
    }
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const dedupeKey = item.uri;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

function renderMediaItems(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;
  const mediaSource = contentType.includes('json')
    ? parseJsonPayload(payload, rawPayload)
    : payload;
  const items = collectMediaItems(mediaSource);
  if (!items.length) {
    return '<p>No related media or file references found.</p>';
  }
  return items.map((item) => {
    const link = linkHtml(item.uri, item.label);
    const download = isDownloadableMediaReference(item.uri)
      ? `<button type="button" data-browser-download-ref="${escapeHtml(item.uri)}">Download</button>`
      : '';
    return `<div class="browser-pin-file-row"><span>${link}</span>${download}</div>`;
  }).join('');
}

export function renderPinInspectorHtml(resource: BrowserResourceEnvelope, headingOverride = ''): string {
  const pin = pinValue(resource);
  const version = versionValue(resource);
  const recordValue = rawPinRecord(resource);
  const heading = headingOverride || text(resource.title) || 'Pin';

  const txid = text(pin.txid ?? recordValue.txid);
  const contentType = contentTypeValue(resource);
  const facts = [
    { key: 'txid', value: txid, copyValue: txid || undefined },
    { key: 'path', value: text(pin.path ?? recordValue.path) },
    { key: 'requestedPinId', value: text(version.requestedPinId) },
    { key: 'resolvedPinId', value: text(version.resolvedPinId ?? pin.pinId ?? recordValue.pinId ?? recordValue.id) },
    { key: 'versionSelector', value: text(version.versionSelector) },
    { key: 'contentType', value: text(pin.contentType ?? recordValue.contentType ?? resource.renderer.contentType) },
  ].filter((item) => text(item.value) !== '');

  return `${PIN_INSPECTOR_PAGE_STYLE}<article class="browser-protocol-detail browser-pin-inspector browser-pin-page">
    <header class="browser-pin-page-head">
      <div class="browser-pin-page-copy">
        <p class="browser-pin-page-eyebrow">${escapeHtml(text(pin.path ?? recordValue.path) || contentType || 'Pin detail')}</p>
        <h2>${escapeHtml(heading)}</h2>
      </div>
      <div class="browser-pin-page-actions">
        ${txid ? `<button type="button" data-browser-copy-value="${escapeHtml(txid)}">Copy TxID</button>` : ''}
      </div>
    </header>
    <div class="browser-pin-page-grid">
      <div class="browser-pin-stack">
        ${sectionBlock('Payload', renderPayload(resource), payloadIntro(resource))}
        ${sectionBlock('Raw Payload', renderRawPayload(resource), rawIntro())}
        ${sectionBlock('Related Media', renderMediaItems(resource), mediaIntro())}
      </div>
      <aside class="browser-pin-aside">
        ${sectionBlock('Verify', `${facts.length ? infoList(facts) : '<p>No pin facts available.</p>'}<details><summary>Raw MAN pin record</summary>${jsonBlock(recordValue)}</details>`, verifyIntro())}
      </aside>
    </div>
  </article>`;
}
