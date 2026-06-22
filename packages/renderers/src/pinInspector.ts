import { Marked } from 'marked';

import type { BrowserResourceEnvelope } from '@openagentinternet/agent-browser-host-contract';

const INTERNAL_BROWSER_URI_PATTERN = /^(metaid|metaapp|metafile|map|pin):\/\//iu;
const EXTERNAL_URL_PATTERN = /^https?:\/\//iu;
const MEDIA_KEYS = ['images', 'image', 'imageUrls', 'attachments', 'files', 'media'];
const IMAGE_MEDIA_KEYS = new Set(['images', 'image', 'imageUrls']);

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

function pinTxid(resource: BrowserResourceEnvelope): string {
  const pin = pinValue(resource);
  const recordValue = rawPinRecord(resource);
  return text(pin.genesisTransaction ?? recordValue.genesisTransaction ?? pin.txid ?? recordValue.txid);
}

function versionValue(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(data(resource).version);
}

function jsonBlock(value: unknown, className = 'browser-protocol-json'): string {
  return `<pre class="${escapeHtml(className)}">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function shortReference(value: string): string {
  const normalized = text(value);
  if (normalized.length <= 42) return normalized;
  const separator = normalized.indexOf('://');
  if (separator > 0) {
    const prefix = normalized.slice(0, separator + 3);
    const body = normalized.slice(separator + 3);
    if (body.length > 28) return `${prefix}${body.slice(0, 10)}...${body.slice(-10)}`;
  }
  return `${normalized.slice(0, 18)}...${normalized.slice(-14)}`;
}

function linkHtml(value: string, label?: string, extraAttributes = '', className = ''): string {
  const href = text(value);
  if (!href) return '';
  const content = escapeHtml(label || href);
  const internal = INTERNAL_BROWSER_URI_PATTERN.test(href);
  const external = EXTERNAL_URL_PATTERN.test(href);
  const classAttribute = className ? ` class="${escapeHtml(className)}"` : '';
  return `<a${classAttribute} href="${escapeHtml(href)}"${internal ? ' data-browser-map-link' : external ? ' target="_blank" rel="noopener"' : ''}${extraAttributes}>${content}</a>`;
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
  return `<section class="browser-pin-section"><div class="browser-pin-section-head"><h3>${escapeHtml(title)}</h3>${intro ? `<p class="browser-pin-intro">${escapeHtml(intro)}</p>` : ''}</div>${bodyHtml}</section>`;
}

const COPY_ICON_SVG = '<svg class="browser-pin-copy-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><rect x="8" y="8" width="10" height="10" rx="2"></rect><path d="M6 14H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"></path></svg>';

function infoList(items: Array<{ key: string; value: unknown; copyValue?: string }>): string {
  return `<dl class="browser-protocol-proof">${items.map((item) => {
    const copyButton = item.copyValue
      ? ` <button type="button" class="browser-pin-copy-btn" title="Copy" aria-label="Copy" data-browser-copy-value="${escapeHtml(item.copyValue)}">${COPY_ICON_SVG}</button>`
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

function isLongJsonString(value: string): boolean {
  return value.length > 120 || value.includes('\n');
}

function contentTypeValue(resource: BrowserResourceEnvelope): string {
  return text(resource.renderer.contentType || pinValue(resource).contentType || rawPinRecord(resource).contentType).toLowerCase();
}

function payloadIntro(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;
  const jsonPayload = parseJsonPayload(payload, rawPayload);
  const renderAsJson = contentType.includes('json')
    || (payload && typeof payload === 'object')
    || (jsonPayload && typeof jsonPayload === 'object');
  if (renderAsJson) {
    return 'JSON is rendered as a structured payload document. Original keys and order are preserved.';
  }
  if (contentType.startsWith('text/markdown')) {
    return 'Markdown payload rendered as document content.';
  }
  if (contentType.startsWith('text/plain')) {
    return 'Plain text payload with line breaks preserved.';
  }
  return 'Binary PIN. No inline payload preview is available.';
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
      background: #eef3f9;
    }
    body:has(.browser-pin-page) .browser-viewport { padding: 18px 14px 36px; }
    .browser-pin-page { width: min(1380px, calc(100vw - 28px)); max-width: none; margin: 18px auto 36px; display: grid; gap: 18px; }
    .browser-pin-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 4px 2px 0; flex-wrap: wrap; }
    .browser-pin-page-copy { display: grid; gap: 10px; min-width: 0; }
    .browser-pin-page-eyebrow { margin: 0; color: #6a778b; font-size: 12px; font-weight: 700; }
    .browser-pin-page-head h2 { margin: 0; color: #121923; font-size: 30px; line-height: 1.08; letter-spacing: 0; }
    .browser-pin-meta-pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .browser-pin-meta-pill { display: inline-flex; align-items: center; min-height: 26px; max-width: 100%; padding: 4px 9px; border: 1px solid #d9e1ed; border-radius: 999px; background: #fff; color: #4c5b6f; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
    .browser-pin-page-actions { display: flex; align-items: flex-start; flex-shrink: 0; gap: 8px; }
    .browser-pin-page-actions button { min-height: 34px; border: 1px solid #cfd9e6; border-radius: 8px; background: #fff; color: #162132; padding: 7px 12px; font-size: 12px; font-weight: 700; }
    .browser-pin-page-actions button:first-child { background: #eaf1ff; border-color: #cfe0ff; color: #2e6fed; }
    .browser-pin-page-grid { display: grid; grid-template-columns: minmax(0, 1.58fr) minmax(300px, 320px); gap: 16px; align-items: start; }
    .browser-pin-stack, .browser-pin-aside { display: grid; gap: 18px; align-content: start; }
    .browser-pin-section { display: grid; gap: 12px; padding: 16px 18px; border: 1px solid #d9e1ed; border-radius: 14px; background: #fff; }
    .browser-pin-section-head { display: grid; gap: 5px; }
    .browser-pin-section h3 { margin: 0; color: #141c29; font-size: 15px; }
    .browser-pin-section:first-child h3 { font-size: 18px; }
    .browser-pin-intro { margin: 0; color: #6a778b; font-size: 13px; line-height: 1.45; }
    .browser-protocol-json, .browser-protocol-raw, .browser-pin-text { margin: 0; overflow: auto; padding: 16px; border-radius: 12px; background: #182235; color: #d7e3f0; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .browser-pin-json-doc { display: grid; gap: 12px; }
    .browser-pin-json-row { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; align-items: start; }
    .browser-pin-json-key { color: #8b95a5; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow-wrap: anywhere; }
    .browser-pin-json-value { min-width: 0; color: #162132; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word; }
    .browser-pin-json-text-block { line-height: 1.7; white-space: pre-wrap; }
    .browser-pin-json-token-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .browser-pin-json-token { display: inline-flex; align-items: center; max-width: 100%; padding: 7px 10px; border: 1px solid #d9e1ed; border-radius: 999px; background: #f7f9fc; color: #3d4c60; font-size: 12px; overflow-wrap: anywhere; }
    .browser-pin-json-token-link { color: #2e6fed; background: #eaf1ff; border-color: #cfe0ff; }
    .browser-pin-json-token-boolean, .browser-pin-json-token-number, .browser-pin-json-token-null { color: #334155; background: #eef3f9; }
    .browser-pin-json-list, .browser-pin-json-nested { display: grid; gap: 8px; min-width: 0; }
    .browser-pin-json-list-item, .browser-pin-json-subblock { padding: 12px 14px; border: 1px solid #d9e1ed; border-radius: 12px; background: #f7f9fc; }
    .browser-pin-json-subblock .browser-pin-json-row { grid-template-columns: minmax(120px, 0.32fr) minmax(0, 1fr); }
    .browser-pin-json-value a, .browser-pin-link-pill, .browser-pin-file-row a { color: #2563d8; text-decoration: none; }
    .browser-pin-json-value a:hover, .browser-pin-link-pill:hover, .browser-pin-file-row a:hover { text-decoration: underline; }
    .browser-pin-markdown { display: grid; gap: 10px; line-height: 1.7; color: #162132; }
    .browser-pin-markdown h1, .browser-pin-markdown h2, .browser-pin-markdown h3, .browser-pin-markdown p { margin: 0; }
    .browser-pin-markdown a { color: #2e6fed; text-decoration: none; }
    .browser-pin-markdown a:hover { text-decoration: underline; }
    .browser-pin-binary-card { display: grid; gap: 8px; place-items: center; min-height: 132px; padding: 18px; border: 1px solid #d9e1ed; border-radius: 12px; background: #f7f9fc; text-align: center; color: #6a778b; }
    .browser-pin-binary-card p { margin: 0; }
    .browser-pin-binary-badge { display: inline-flex; padding: 8px 12px; border: 1px solid #d9e1ed; border-radius: 999px; background: #fff; color: #162132; font-weight: 700; }
    .browser-pin-binary-type { font-size: 12px; overflow-wrap: anywhere; }
    .browser-protocol-proof { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 10px 14px; margin: 0; }
    .browser-protocol-proof dt { color: #6a778b; font-size: 12px; font-weight: 700; }
    .browser-protocol-proof dd { margin: 0; overflow-wrap: anywhere; }
    .browser-protocol-proof dd button { margin-left: 8px; border: 1px solid #d9e1ed; border-radius: 8px; background: #fff; padding: 4px 8px; }
    .browser-pin-media-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .browser-pin-media-card { display: grid; gap: 8px; min-width: 0; padding: 10px; border: 1px solid #dce4ef; border-radius: 8px; background: #f8fafc; }
    .browser-pin-media-preview { display: grid; place-items: center; min-height: 110px; border-radius: 7px; background: #e8eef6; color: #62718a; font-size: 12px; font-weight: 700; text-align: center; overflow: hidden; }
    .browser-pin-media-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .browser-pin-media-label { min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
    .browser-pin-file-list { display: grid; gap: 10px; }
    .browser-pin-file-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px 14px; border: 1px solid #d9e1ed; border-radius: 12px; background: #f7f9fc; }
    .browser-pin-file-meta { display: grid; gap: 4px; min-width: 0; }
    .browser-pin-file-name { font-weight: 700; color: #162132; word-break: break-word; }
    .browser-pin-file-desc { color: #6a778b; font-size: 12px; word-break: break-word; }
    .browser-pin-file-row span { min-width: 0; overflow-wrap: anywhere; }
    .browser-pin-download { display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; border-radius: 10px; border: 1px solid #cfe0ff; background: #eaf1ff; color: #2e6fed; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .browser-pin-link-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .browser-pin-link-pill { display: inline-flex; max-width: 100%; padding: 6px 9px; border: 1px solid #d9e1ed; border-radius: 999px; background: #f8fafc; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
    .browser-pin-raw-record { display: grid; gap: 10px; }
    .browser-pin-raw-record summary { cursor: pointer; color: #334155; font-size: 13px; font-weight: 700; }
    .browser-pin-primary-action { cursor: pointer; min-height: 34px; border: 1px solid #2563eb; border-radius: 8px; background: #2563eb; color: #fff; padding: 7px 14px; font-size: 12px; font-weight: 700; }
    .browser-pin-primary-action:hover, .browser-pin-primary-action:focus { background: #1d4ed8; border-color: #1d4ed8; }
    .browser-pin-copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin-left: 8px; padding: 0; border: 1px solid #d9e1ed; border-radius: 8px; background: #fff; color: #4c5b6f; cursor: pointer; vertical-align: middle; }
    .browser-pin-copy-btn:hover, .browser-pin-copy-btn:focus { border-color: #cfe0ff; background: #eaf1ff; color: #2e6fed; }
    .browser-pin-copy-icon { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    @media (max-width: 1100px) {
      .browser-pin-page-grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 720px) {
      body:has(.browser-pin-page) .browser-viewport { padding: 12px 8px 20px; }
      .browser-pin-page { width: calc(100vw - 16px); margin: 12px auto 24px; gap: 14px; }
      .browser-pin-page-head { flex-direction: column; }
      .browser-pin-page-actions { width: 100%; }
      .browser-pin-page-actions button { width: 100%; }
      .browser-pin-json-row, .browser-pin-json-subblock .browser-pin-json-row { grid-template-columns: 1fr; gap: 5px; }
      .browser-protocol-proof { grid-template-columns: 1fr; }
      .browser-pin-file-row { grid-template-columns: 1fr; align-items: stretch; }
    }
  </style>
`;

function jsonToken(value: unknown): string {
  if (typeof value === 'string') {
    if (INTERNAL_BROWSER_URI_PATTERN.test(value) || EXTERNAL_URL_PATTERN.test(value)) {
      return `<span class="browser-pin-json-token browser-pin-json-token-link">${linkHtml(value, shortReference(value))}</span>`;
    }
    return `<span class="browser-pin-json-token browser-pin-json-token-string">${escapeHtml(value)}</span>`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `<span class="browser-pin-json-token browser-pin-json-token-${typeof value}">${escapeHtml(String(value))}</span>`;
  }
  if (value === null) {
    return '<span class="browser-pin-json-token browser-pin-json-token-null">null</span>';
  }
  return `<span class="browser-pin-json-token">${escapeHtml(String(value))}</span>`;
}

function renderJsonValue(value: unknown): string {
  if (typeof value === 'string') {
    if (INTERNAL_BROWSER_URI_PATTERN.test(value) || EXTERNAL_URL_PATTERN.test(value)) {
      return linkHtml(value, shortReference(value));
    }
    if (isLongJsonString(value)) {
      return `<div class="browser-pin-json-text-block">${escapeHtml(value)}</div>`;
    }
    return escapeHtml(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return jsonToken(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="browser-pin-json-token browser-pin-json-token-null">[]</span>';
    const primitiveList = value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
    if (primitiveList) {
      return `<div class="browser-pin-json-token-list">${value.map(jsonToken).join('')}</div>`;
    }
    return `<div class="browser-pin-json-list">${value.map((item) => `<div class="browser-pin-json-list-item">${renderJsonValue(item)}</div>`).join('')}</div>`;
  }
  const nested = record(value);
  if (Object.keys(nested).length) {
    return `<div class="browser-pin-json-subblock browser-pin-json-nested">${renderJsonRows(nested)}</div>`;
  }
  return '<span class="browser-pin-json-token browser-pin-json-token-null">{}</span>';
}

function jsonValueClass(value: unknown): string {
  return 'browser-pin-json-value';
}

function renderJsonRows(value: Record<string, unknown>): string {
  return Object.entries(value).map(([key, item]) => (
    `<div class="browser-pin-json-row${typeof item === 'string' && isLongJsonString(item) ? ' browser-pin-json-row-longtext' : ''}"><div class="browser-pin-json-key">${escapeHtml(key)}</div><div class="${jsonValueClass(item)}">${renderJsonValue(item)}</div></div>`
  )).join('');
}

function renderJsonDocument(value: unknown): string {
  if (Array.isArray(value)) {
    return `<div class="browser-pin-json-doc">${renderJsonValue(value)}</div>`;
  }
  const body = record(value);
  if (!Object.keys(body).length) {
    return jsonBlock(value);
  }
  return `<div class="browser-pin-json-doc">${renderJsonRows(body)}</div>`;
}

function renderPayload(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;
  const jsonPayload = parseJsonPayload(payload, rawPayload);
  const renderAsJson = contentType.includes('json')
    || (payload && typeof payload === 'object')
    || (jsonPayload && typeof jsonPayload === 'object');

  if (renderAsJson) {
    return renderJsonDocument(jsonPayload);
  }
  if (contentType.startsWith('text/markdown')) {
    return `<div class="browser-pin-markdown">${renderMarkdown(typeof payload === 'string' ? payload : text(rawPayload))}</div>`;
  }
  if (contentType.startsWith('text/plain')) {
    const plain = typeof payload === 'string' ? payload : text(rawPayload);
    return `<pre class="browser-pin-text">${escapeHtml(plain)}</pre>`;
  }
  return `<div class="browser-pin-binary-card"><span class="browser-pin-binary-badge">Binary PIN</span><p>No inline parse is available in the generic renderer.</p>${contentType ? `<p class="browser-pin-binary-type">${escapeHtml(contentType)}</p>` : ''}</div>`;
}

function renderRawPayload(resource: BrowserResourceEnvelope): string {
  const rawPayload = data(resource).rawPayload;
  const payload = payloadValue(resource);
  const jsonPayload = parseJsonPayload(payload, rawPayload);
  const renderAsJson = contentTypeValue(resource).includes('json')
    || (payload && typeof payload === 'object')
    || (jsonPayload && typeof jsonPayload === 'object');
  if (renderAsJson) {
    return jsonBlock(jsonPayload, 'browser-protocol-raw');
  }
  const source = typeof rawPayload === 'string'
    ? rawPayload
    : typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2);
  return `<pre class="browser-protocol-raw">${escapeHtml(source ?? '')}</pre>`;
}

type PinMediaItem = { uri: string; label: string; kind: 'image' | 'file'; description?: string };

function isImageReference(uri: string, sourceKey = ''): boolean {
  if (IMAGE_MEDIA_KEYS.has(sourceKey)) return true;
  return /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/iu.test(uri);
}

function isMediaReferenceUri(uri: string): boolean {
  return EXTERNAL_URL_PATTERN.test(uri) || uri.startsWith('metafile://');
}

function mediaReference(value: unknown, sourceKey = ''): PinMediaItem | null {
  if (typeof value === 'string') {
    const uri = text(value);
    if (!uri || !isMediaReferenceUri(uri)) return null;
    return { uri, label: shortReference(uri), kind: isImageReference(uri, sourceKey) ? 'image' : 'file' };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>;
    const uri = text(entry.uri ?? entry.url ?? entry.href ?? entry.src ?? entry.pinId);
    if (!uri || !isMediaReferenceUri(uri)) return null;
    return {
      uri,
      label: text(entry.label ?? entry.name ?? entry.title ?? entry.filename) || uri,
      kind: isImageReference(uri, sourceKey) ? 'image' : 'file',
      description: text(entry.description ?? entry.summary ?? entry.type ?? entry.mimeType),
    };
  }
  return null;
}

function collectBrowserUris(value: unknown, output: Set<string>, seen = new WeakSet<object>(), includeExternal = false): void {
  if (typeof value === 'string') {
    const matches = value.match(/(?:metaid|metaapp|metafile|map|pin):\/\/[^\s"'<>()[\]{}]+/giu) || [];
    for (const uri of matches) {
      output.add(uri.replace(/[),.;!?]+$/u, ''));
    }
    if (includeExternal) {
      const externalMatches = value.match(/https?:\/\/[^\s"'<>()[\]{}]+/giu) || [];
      for (const uri of externalMatches) {
        output.add(uri.replace(/[),.;!?]+$/u, ''));
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBrowserUris(item, output, seen, includeExternal);
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
    collectBrowserUris(item, output, seen, includeExternal);
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

function collectMediaItems(payload: unknown): PinMediaItem[] {
  const body = record(payload);
  const items: PinMediaItem[] = [];
  for (const key of MEDIA_KEYS) {
    const candidate = body[key];
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const normalized = mediaReference(item, key);
        if (normalized) items.push(normalized);
      }
      continue;
    }
    const normalized = mediaReference(candidate, key);
    if (normalized) items.push(normalized);
  }
  const discoveredUris = new Set<string>();
  collectBrowserUris(payload, discoveredUris, new WeakSet<object>(), true);
  for (const uri of discoveredUris) {
    if (isMediaReferenceUri(uri)) {
      items.push({ uri, label: shortReference(uri), kind: isImageReference(uri) ? 'image' : 'file' });
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

function renderMediaPreview(item: PinMediaItem): string {
  const download = isDownloadableMediaReference(item.uri)
    ? `<button class="browser-pin-download" type="button" data-browser-download-ref="${escapeHtml(item.uri)}">Download</button>`
    : '';
  return `<article class="browser-pin-media-card" data-browser-media-preview-ref="${escapeHtml(item.uri)}">
    <div class="browser-pin-media-preview" data-browser-media-preview-slot>Image preview</div>
    <div class="browser-pin-media-label">${linkHtml(item.uri, item.label)}</div>
    ${download}
  </article>`;
}

function renderFileRow(item: PinMediaItem): string {
  const link = linkHtml(item.uri, item.label);
  const description = [item.uri, item.description].filter(Boolean).join(' · ');
  const download = isDownloadableMediaReference(item.uri)
    ? `<button class="browser-pin-download" type="button" data-browser-download-ref="${escapeHtml(item.uri)}">Download</button>`
    : '';
  return `<div class="browser-pin-file-row"><div class="browser-pin-file-meta"><div class="browser-pin-file-name">${link}</div>${description ? `<div class="browser-pin-file-desc">${escapeHtml(description)}</div>` : ''}</div>${download}</div>`;
}

function renderMediaItems(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;
  const jsonPayload = parseJsonPayload(payload, rawPayload);
  const mediaSource = contentType.includes('json')
    || (payload && typeof payload === 'object')
    || (jsonPayload && typeof jsonPayload === 'object')
    ? jsonPayload
    : payload;
  const items = collectMediaItems(mediaSource);
  if (!items.length) {
    return '<p>No related media or file references found.</p>';
  }
  const previews = items.filter((item) => item.kind === 'image');
  const files = items.filter((item) => item.kind !== 'image');
  return `${previews.length ? `<div class="browser-pin-media-grid">${previews.map(renderMediaPreview).join('')}</div>` : ''}${files.length ? `<div class="browser-pin-file-list">${files.map(renderFileRow).join('')}</div>` : ''}`;
}

function renderRelatedLinks(resource: BrowserResourceEnvelope): string {
  const contentType = contentTypeValue(resource);
  const payload = payloadValue(resource);
  const rawPayload = data(resource).rawPayload;
  const jsonPayload = parseJsonPayload(payload, rawPayload);
  const source = contentType.includes('json')
    || (payload && typeof payload === 'object')
    || (jsonPayload && typeof jsonPayload === 'object')
    ? jsonPayload
    : payload;
  const uris = new Set<string>();
  collectBrowserUris(source, uris);
  if (!uris.size) {
    return '<p>No related Browser links found.</p>';
  }
  return `<div class="browser-pin-link-list">${Array.from(uris).map((uri) => linkHtml(uri, shortReference(uri), '', 'browser-pin-link-pill')).join('')}</div>`;
}

function metaPill(value: unknown): string {
  const normalized = text(value);
  return normalized ? `<span class="browser-pin-meta-pill">${escapeHtml(normalized)}</span>` : '';
}

function versionLabel(version: Record<string, unknown>, pin: Record<string, unknown>): string {
  const selector = text(version.versionSelector);
  if (selector === 'latest') return 'latest effective version';
  if (selector === 'history-index') return `history version ${text(version.historyIndex) || '0'}`;
  return text(pin.version) ? `version ${text(pin.version)}` : selector;
}

export function renderPinInspectorHtml(resource: BrowserResourceEnvelope, headingOverride = ''): string {
  const pin = pinValue(resource);
  const version = versionValue(resource);
  const recordValue = rawPinRecord(resource);
  const heading = headingOverride || text(resource.title) || 'Pin';

  const txid = pinTxid(resource);
  const contentType = contentTypeValue(resource);
  const path = text(pin.path ?? recordValue.path);
  const chain = text(pin.chainName ?? recordValue.chainName ?? recordValue.chain);
  const pinVersion = text(pin.version ?? recordValue.version);
  const metaPills = [
    metaPill(path),
    metaPill(text(pin.contentType ?? recordValue.contentType ?? resource.renderer.contentType)),
    metaPill(versionLabel(version, pin)),
  ].filter(Boolean).join('');
  const facts = [
    { key: 'txid', value: txid, copyValue: txid || undefined },
    { key: 'chain', value: chain },
    { key: 'content-type', value: text(pin.contentType ?? recordValue.contentType ?? resource.renderer.contentType) },
    { key: 'path', value: path },
    { key: 'version', value: pinVersion || text(version.versionSelector) },
  ].filter((item) => text(item.value) !== '');

  return `${PIN_INSPECTOR_PAGE_STYLE}<article class="browser-protocol-detail browser-pin-inspector browser-pin-page">
    <header class="browser-pin-page-head">
      <div class="browser-pin-page-copy">
        <p class="browser-pin-page-eyebrow">${escapeHtml(text(pin.path ?? recordValue.path) || contentType || 'Pin detail')}</p>
        <h2>${escapeHtml(heading)}</h2>
        ${metaPills ? `<div class="browser-pin-meta-pills">${metaPills}</div>` : ''}
      </div>
      <div class="browser-pin-page-actions">
        <button type="button" class="browser-pin-primary-action" data-browser-open-raw-record>View Raw Record</button>
      </div>
    </header>
    <div class="browser-pin-page-grid">
      <div class="browser-pin-stack">
        ${sectionBlock('Payload Render', renderPayload(resource), payloadIntro(resource))}
        ${sectionBlock('Raw Payload', renderRawPayload(resource), rawIntro())}
        ${sectionBlock('Related Media', renderMediaItems(resource), mediaIntro())}
      </div>
      <aside class="browser-pin-aside">
        ${sectionBlock('Related Links', renderRelatedLinks(resource))}
        ${sectionBlock('Verify', `${facts.length ? infoList(facts) : '<p>No pin facts available.</p>'}`, verifyIntro())}
      </aside>
    </div>
  </article>`;
}
