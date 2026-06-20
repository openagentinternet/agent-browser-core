import type { BrowserResourceEnvelope } from '@openagentinternet/agent-browser-host-contract';

export interface ProtocolRendererBinding {
  rendererId: string;
  protocolPath: string;
  label: string;
}

export const DEFAULT_PROTOCOL_RENDERERS: ProtocolRendererBinding[] = [
  { rendererId: 'simplebuzz.detail', protocolPath: '/protocols/simplebuzz', label: 'SimpleBuzz detail' },
  { rendererId: 'skill-service.detail', protocolPath: '/protocols/skill-service', label: 'Skill service detail' },
  { rendererId: 'generic.protocol-pin', protocolPath: '*', label: 'Generic protocol pin' },
];

const INTERNAL_BROWSER_URI_PATTERN = /^(metaid|metaapp|metafile|map|pin):\/\//iu;
const EXTERNAL_URL_PATTERN = /^https?:\/\//iu;
const OVERVIEW_KEYS = ['content', 'text', 'body', 'description', 'summary', 'intro'];
const MEDIA_KEYS = ['images', 'image', 'imageUrls', 'attachments', 'files', 'media'];
const TITLE_KEYS = ['title', 'name', 'displayName'];

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

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function data(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(resource.renderer.data);
}

function payload(resource: BrowserResourceEnvelope): unknown {
  return data(resource).payload ?? data(resource).rawPayload ?? '';
}

function jsonBlock(value: unknown): string {
  return `<pre class="browser-protocol-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function versionBlock(resource: BrowserResourceEnvelope): string {
  return `<dl class="browser-protocol-proof">${Object.entries(record(data(resource).version)).map(([key, value]) => (
    `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`
  )).join('')}</dl>`;
}

function linkHtml(value: unknown, label?: string): string {
  const href = text(value);
  if (!href) return '';
  const content = escapeHtml(label || href);
  const internal = INTERNAL_BROWSER_URI_PATTERN.test(href);
  return `<a href="${escapeHtml(href)}"${internal ? ' data-browser-map-link' : EXTERNAL_URL_PATTERN.test(href) ? ' target="_blank" rel="noopener"' : ''}>${content}</a>`;
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

function payloadRecord(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(payload(resource));
}

function pinRecord(resource: BrowserResourceEnvelope): Record<string, unknown> {
  return record(data(resource).rawPinRecord ?? data(resource).pin);
}

function displayTitle(resource: BrowserResourceEnvelope): string {
  const body = payloadRecord(resource);
  for (const key of TITLE_KEYS) {
    const value = text(body[key]);
    if (value) return value;
  }
  return text(resource.title);
}

function overviewText(resource: BrowserResourceEnvelope): string {
  const body = payloadRecord(resource);
  for (const key of OVERVIEW_KEYS) {
    const value = text(body[key]);
    if (value) return value;
  }
  const raw = payload(resource);
  return typeof raw === 'string' ? text(raw) : '';
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
      label: text(entry.label ?? entry.name ?? entry.title) || uri,
    };
  }
  return null;
}

function mediaItems(resource: BrowserResourceEnvelope): Array<{ uri: string; label: string }> {
  const body = payloadRecord(resource);
  const items: Array<{ uri: string; label: string }> = [];
  for (const key of MEDIA_KEYS) {
    const raw = body[key];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const normalized = mediaReference(item);
        if (normalized) items.push(normalized);
      }
      continue;
    }
    const normalized = mediaReference(raw);
    if (normalized) items.push(normalized);
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.uri}\n${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function keyFields(resource: BrowserResourceEnvelope): Array<{ key: string; value: unknown }> {
  const body = payloadRecord(resource);
  const reserved = new Set([...OVERVIEW_KEYS, ...MEDIA_KEYS]);
  return Object.entries(body)
    .filter(([key, value]) => {
      if (reserved.has(key)) return false;
      if (isScalar(value)) return text(value) !== '';
      if (Array.isArray(value)) {
        return value.length > 0 && value.length <= 4 && value.every(isScalar);
      }
      return false;
    })
    .map(([key, value]) => ({ key, value }));
}

function walkUris(value: unknown, found: Set<string>, depth = 0): void {
  if (depth > 6) return;
  if (typeof value === 'string') {
    const candidate = text(value);
    if ((INTERNAL_BROWSER_URI_PATTERN.test(candidate) || EXTERNAL_URL_PATTERN.test(candidate)) && candidate) {
      found.add(candidate);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkUris(item, found, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      walkUris(entry, found, depth + 1);
    }
  }
}

function relatedLinks(resource: BrowserResourceEnvelope): string[] {
  const found = new Set<string>();
  walkUris(payload(resource), found);
  return Array.from(found.values());
}

function sectionBlock(title: string, bodyHtml: string): string {
  return `<section><h3>${escapeHtml(title)}</h3>${bodyHtml}</section>`;
}

function infoList(items: Array<{ key: string; value: unknown }>): string {
  return `<dl class="browser-protocol-proof">${items.map((item) => (
    `<dt>${escapeHtml(item.key)}</dt><dd>${fieldValueHtml(item.value)}</dd>`
  )).join('')}</dl>`;
}

export function renderPinInspectorHtml(resource: BrowserResourceEnvelope, headingOverride = ''): string {
  const rendererData = data(resource);
  const version = record(rendererData.version);
  const pin = record(rendererData.pin);
  const recordData = pinRecord(resource);
  const overview = overviewText(resource);
  const media = mediaItems(resource);
  const fields = keyFields(resource);
  const links = relatedLinks(resource);
  const ownerLabel = text(resource.owner?.globalMetaId) || text(resource.owner?.address) || text(resource.owner?.name);
  const heading = headingOverride || displayTitle(resource) || 'Pin Inspector';
  const uri = text(resource.normalizedUri || resource.uri);

  const identityItems = [
    { key: 'uri', value: uri },
    { key: 'path', value: text(pin.path ?? recordData.path) },
    { key: 'requestedPinId', value: text(version.requestedPinId) },
    { key: 'resolvedPinId', value: text(version.resolvedPinId ?? pin.pinId ?? recordData.pinId ?? recordData.id) },
    { key: 'rootPinId', value: text(version.rootPinId) },
    { key: 'txid', value: text(pin.txid ?? recordData.txid) },
    { key: 'publisher', value: ownerLabel },
  ].filter((item) => text(item.value) !== '');

  const proofItems = [
    { key: 'versionSelector', value: text(version.versionSelector) },
    { key: 'historyIndex', value: text(version.historyIndex) },
    { key: 'operation', value: text(pin.operation ?? recordData.operation) },
    { key: 'chainName', value: text(pin.chainName ?? recordData.chainName ?? recordData.chain) },
    { key: 'contentType', value: text(pin.contentType ?? recordData.contentType ?? resource.renderer.contentType) },
    { key: 'encryption', value: text(pin.encryption ?? recordData.encryption) },
    { key: 'version', value: text(pin.version ?? recordData.version) },
  ].filter((item) => text(item.value) !== '');

  const rawPanels = [
    `<details open><summary>Parsed payload</summary>${jsonBlock(payload(resource))}</details>`,
    `<details><summary>Raw payload</summary>${jsonBlock(rendererData.rawPayload ?? '')}</details>`,
    `<details><summary>Raw MAN pin record</summary>${jsonBlock(recordData)}</details>`,
  ].join('');

  return `<article class="browser-protocol-detail browser-pin-inspector">
    <header><p>${escapeHtml(text(pin.path ?? recordData.path) || text(resource.renderer.contentType) || 'Pin')}</p><h2>${escapeHtml(heading)}</h2>${resource.title && resource.title !== heading ? `<p>${escapeHtml(resource.title)}</p>` : ''}</header>
    ${sectionBlock('Identity', infoList(identityItems))}
    ${sectionBlock('Overview', overview ? overview.split(/\n{2,}/u).map((part) => `<p>${escapeHtml(part)}</p>`).join('') : '<p>No overview text found.</p>')}
    ${sectionBlock('Media', media.length ? media.map((item) => `<p>${linkHtml(item.uri, item.label)}</p>`).join('') : '<p>No media references.</p>')}
    ${sectionBlock('Key Fields', fields.length ? infoList(fields) : '<p>No compact fields.</p>')}
    ${sectionBlock('Related Links', links.length ? links.map((value) => `<p>${linkHtml(value)}</p>`).join('') : '<p>No related links.</p>')}
    ${sectionBlock('Proof', proofItems.length ? infoList(proofItems) : '<p>No proof details.</p>')}
    ${sectionBlock('Raw And Structured Data', rawPanels)}
  </article>`;
}

export function renderSimpleBuzzDetail(resource: BrowserResourceEnvelope): string {
  const body = record(payload(resource));
  const content = text(body.content ?? body.text ?? body.body ?? data(resource).rawPayload);
  const media = [
    ...array(body.images),
    ...array(body.imageUrls),
    ...array(body.attachments),
  ].map(text).filter(Boolean);
  return `<article class="browser-protocol-detail browser-simplebuzz-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || '/protocols/simplebuzz')}</p><h2>${escapeHtml(resource.title)}</h2></header>
    <section class="browser-protocol-body">${content.split(/\n{2,}/u).map((part) => `<p>${escapeHtml(part)}</p>`).join('')}</section>
    ${media.length ? `<section class="browser-protocol-media"><h3>Media</h3>${media.map((item) => `<a href="${escapeHtml(item)}">${escapeHtml(item)}</a>`).join('')}</section>` : ''}
    ${versionBlock(resource)}
  </article>`;
}

export function renderSkillServiceDetail(resource: BrowserResourceEnvelope): string {
  const body = record(payload(resource));
  return `<article class="browser-protocol-detail browser-skill-service-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || '/protocols/skill-service')}</p><h2>${escapeHtml(text(body.name) || resource.title)}</h2></header>
    ${text(body.description) ? `<p class="browser-protocol-summary">${escapeHtml(body.description)}</p>` : ''}
    <dl class="browser-protocol-fields">
      ${['price', 'pricing', 'serviceType', 'provider', 'endpoint', 'inputSchema', 'outputSchema'].map((key) => (
        Object.prototype.hasOwnProperty.call(body, key)
          ? `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key])}</dd>`
          : ''
      )).join('')}
    </dl>
    ${versionBlock(resource)}
  </article>`;
}

export function renderGenericProtocolPin(resource: BrowserResourceEnvelope): string {
  return renderPinInspectorHtml(resource, 'Generic protocol pin');
}

export function renderProtocolPinHtml(resource: BrowserResourceEnvelope): string {
  const rendererId = text(data(resource).rendererId);
  if (rendererId === 'simplebuzz.detail') return renderSimpleBuzzDetail(resource);
  if (rendererId === 'skill-service.detail') return renderSkillServiceDetail(resource);
  return renderGenericProtocolPin(resource);
}
