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
  return `<article class="browser-protocol-detail browser-generic-protocol-detail">
    <header><p>${escapeHtml(text(data(resource).protocolPath) || 'Unknown protocol')}</p><h2>Generic protocol pin</h2>${resource.title ? `<p>${escapeHtml(resource.title)}</p>` : ''}</header>
    ${versionBlock(resource)}
    <section><h3>Payload</h3>${jsonBlock(payload(resource))}</section>
    <section><h3>Pin</h3>${jsonBlock(data(resource).pin ?? {})}</section>
  </article>`;
}

export function renderProtocolPinHtml(resource: BrowserResourceEnvelope): string {
  const rendererId = text(data(resource).rendererId);
  if (rendererId === 'simplebuzz.detail') return renderSimpleBuzzDetail(resource);
  if (rendererId === 'skill-service.detail') return renderSkillServiceDetail(resource);
  return renderGenericProtocolPin(resource);
}
