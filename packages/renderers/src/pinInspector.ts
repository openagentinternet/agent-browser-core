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

function sectionBlock(title: string, bodyHtml: string): string {
  return `<section class="browser-pin-section"><h3>${escapeHtml(title)}</h3>${bodyHtml}</section>`;
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
  const facts = [
    { key: 'txid', value: txid, copyValue: txid || undefined },
    { key: 'path', value: text(pin.path ?? recordValue.path) },
    { key: 'requestedPinId', value: text(version.requestedPinId) },
    { key: 'resolvedPinId', value: text(version.resolvedPinId ?? pin.pinId ?? recordValue.pinId ?? recordValue.id) },
    { key: 'rootPinId', value: text(version.rootPinId) },
    { key: 'versionSelector', value: text(version.versionSelector) },
    { key: 'historyIndex', value: text(version.historyIndex) },
    { key: 'operation', value: text(pin.operation ?? recordValue.operation) },
    { key: 'chainName', value: text(pin.chainName ?? recordValue.chainName ?? recordValue.chain) },
    { key: 'contentType', value: text(pin.contentType ?? recordValue.contentType ?? resource.renderer.contentType) },
    { key: 'encryption', value: text(pin.encryption ?? recordValue.encryption) },
    { key: 'version', value: text(pin.version ?? recordValue.version) },
  ].filter((item) => text(item.value) !== '');

  return `<article class="browser-protocol-detail browser-pin-inspector">
    <header class="browser-pin-header"><p>${escapeHtml(text(pin.path ?? recordValue.path) || text(resource.renderer.contentType) || 'Pin')}</p><h2>${escapeHtml(heading)}</h2></header>
    ${sectionBlock('Payload', renderPayload(resource))}
    ${sectionBlock('Raw Payload', renderRawPayload(resource))}
    ${sectionBlock('Related Media And Files', renderMediaItems(resource))}
    ${sectionBlock('Pin Facts', `${facts.length ? infoList(facts) : '<p>No pin facts available.</p>'}<details><summary>Raw MAN pin record</summary>${jsonBlock(recordValue)}</details>`)}
  </article>`;
}
