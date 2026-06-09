import type { BrowserResourceEnvelope, BrowserRuntimeSnapshot } from '@openagentinternet/agent-browser-host-contract';
import { escapeHtml, renderResourceHtml } from './renderers.js';

export interface BrowserPageDefinitionInput {
  title?: string;
  apiBasePath?: string;
  initialUri?: string;
  runtime?: BrowserRuntimeSnapshot | null;
  resource?: BrowserResourceEnvelope | null;
}

export interface BrowserPageDefinition {
  title: string;
  apiBasePath: string;
  initialUri: string;
  contentHtml: string;
  script: string;
}

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function browserClientScript(input: { apiBasePath: string; initialUri: string }): string {
  return `(() => {
  const apiBasePath = ${jsonScript(input.apiBasePath)};
  const resolveEndpoint = ${jsonScript(`${input.apiBasePath}/resolve`)};
  const initialUri = ${jsonScript(input.initialUri)};
  const input = document.querySelector('[data-browser-uri-input]');
  const form = document.querySelector('[data-browser-address-form]');
  const viewport = document.querySelector('[data-browser-viewport]');
  const status = document.querySelector('[data-browser-status-state]');
  const actor = document.querySelector('[data-browser-using-selector]');
  const resourceChip = document.querySelector('[data-browser-resource-chip]');
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  }
  function safeUrl(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (text.charAt(0) === '/' && text.slice(0, 2) !== '//') return text;
    try {
      const parsed = new URL(text);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
      return '';
    }
  }
  function sectionHtml(section) {
    return '<section class="browser-resource-section"><h3>' + escapeHtml(section.title) + '</h3>' +
      (section.items || []).map((item) => '<article class="browser-resource-list-item"><strong>' +
        escapeHtml(item.title || item.displayName || item.name || item.id || 'Untitled') + '</strong><p>' +
        escapeHtml(item.description || item.summary || item.bio || '') + '</p></article>').join('') +
      '</section>';
  }
  function actionHtml(action) {
    return '<button type="button" data-browser-action="' + escapeHtml(action.kind) +
      '" data-browser-action-id="' + escapeHtml(action.id) + '"' +
      (action.enabled ? '' : ' disabled') + '>' + escapeHtml(action.label) + '</button>';
  }
  function actionsHtml(actions) {
    return actions && actions.length
      ? '<div class="browser-action-row">' + actions.map(actionHtml).join('') + '</div>'
      : '';
  }
  function resourceHtml(resource) {
    const renderer = resource.renderer || {};
    if (renderer.type === 'bot-page') {
      return '<article class="browser-bot-page browser-bot-template-' + escapeHtml(renderer.templateId || 'document') + '">' +
        '<header class="browser-bot-hero"><h2>' + escapeHtml(resource.title || 'Bot') + '</h2><p>' +
        escapeHtml(resource.owner && resource.owner.globalMetaId || '') + '</p></header>' +
        actionsHtml(resource.actions || []) +
        '<div class="browser-resource-sections">' + (resource.sections || []).map(sectionHtml).join('') + '</div></article>';
    }
    const url = safeUrl(renderer.url);
    if (!url) return '<section class="browser-empty-state"><h2>Renderer URL blocked</h2></section>';
    if (renderer.type === 'html-iframe') return '<iframe class="browser-html-frame" sandbox="allow-scripts" src="' + escapeHtml(url) + '"></iframe>';
    if (renderer.type === 'pdf') return '<iframe class="browser-pdf" sandbox="" src="' + escapeHtml(url) + '"></iframe>';
    if (renderer.type === 'image') return '<img class="browser-image" src="' + escapeHtml(url) + '" alt="">';
    if (renderer.type === 'video') return '<video class="browser-video" src="' + escapeHtml(url) + '" controls></video>';
    return '<section class="browser-empty-state"><h2>Unsupported renderer</h2><p>' + escapeHtml(renderer.error || renderer.contentType || '') + '</p></section>';
  }
  async function loadRuntime() {
    const response = await fetch(apiBasePath + '/runtime');
    const payload = await response.json();
    if (payload.ok && payload.data && payload.data.defaultActor && actor) {
      actor.querySelector('.browser-chip-title').textContent = payload.data.labels.actorChip + ': ' + payload.data.defaultActor.label;
    }
  }
  async function navigateTo(uri) {
    if (!uri || !viewport) return;
    if (status) status.textContent = 'loading';
    try {
      const response = await fetch(resolveEndpoint + '?uri=' + encodeURIComponent(uri));
      const payload = await response.json();
      if (!payload.ok) {
        viewport.innerHTML = '<section class="browser-empty-state"><h2>Resolve failed</h2><p>' + escapeHtml(payload.message || payload.code || 'Unknown error') + '</p></section>';
        if (status) status.textContent = 'error';
        return;
      }
      viewport.innerHTML = resourceHtml(payload.data);
      if (resourceChip) resourceChip.querySelector('.browser-chip-title').textContent = payload.data.title || 'Resource';
      if (status) status.textContent = 'resolved';
    } catch (error) {
      viewport.innerHTML = '<section class="browser-empty-state"><h2>Resolve failed</h2><p>' + escapeHtml(error && error.message || 'Network error') + '</p></section>';
      if (status) status.textContent = 'error';
    }
  }
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      navigateTo(input && input.value || '').catch(() => {});
    });
  }
  loadRuntime().catch(() => {});
  if (input && !input.value) input.value = initialUri;
  if (initialUri && viewport && !viewport.innerHTML.trim()) navigateTo(initialUri).catch(() => {});
})();`;
}

export function buildBrowserPageDefinition(input: BrowserPageDefinitionInput = {}): BrowserPageDefinition {
  const apiBasePath = input.apiBasePath ?? '/api/browser';
  const initialUri = input.initialUri ?? input.runtime?.defaultUri ?? 'metaid://idq1fixturebot';
  const initialResource = input.resource ? renderResourceHtml(input.resource) : '<section class="browser-empty-state"><h2>Enter an Agent Internet URI</h2></section>';
  return {
    title: input.title ?? 'Agent Internet Browser',
    apiBasePath,
    initialUri,
    contentHtml: `<section class="browser-shell" data-browser-shell>
      <header class="browser-topbar" data-browser-topbar>
        <nav class="browser-nav" aria-label="Browser navigation">
          <button type="button" class="browser-icon-button" aria-label="Back" data-browser-back></button>
          <button type="button" class="browser-icon-button" aria-label="Forward" data-browser-forward></button>
          <button type="button" class="browser-icon-button" aria-label="Reload" data-browser-reload></button>
          <button type="button" class="browser-icon-button" aria-label="Bookmarks and history" data-browser-drawer-toggle></button>
        </nav>
        <form class="browser-address-form" data-browser-address-form>
          <input data-browser-uri-input aria-label="Agent Internet URI" value="${escapeHtml(initialUri)}" placeholder="metaid://idq1example">
          <button type="submit" class="browser-address-submit" aria-label="Visit URI"></button>
        </form>
        <button type="button" class="browser-resource-chip" data-browser-resource-chip><span class="browser-chip-title">Resource</span></button>
        <button type="button" class="browser-using-chip" data-browser-using-selector><span class="browser-chip-title">Using</span></button>
      </header>
      <div class="browser-owner-toolbar" data-browser-owner-toolbar hidden></div>
      <div class="browser-viewport-row" data-browser-viewport-row>
        <aside class="browser-drawer" data-browser-drawer hidden></aside>
        <main class="browser-viewport" data-browser-viewport>${initialResource}</main>
        <aside class="browser-inspector" data-browser-inspector hidden></aside>
      </div>
      <footer class="browser-status-strip" data-browser-status-strip>
        <button type="button" data-browser-status-state>ready</button>
        <button type="button" data-browser-status-proof>unverified</button>
        <span data-browser-status-renderer>renderer</span>
        <button type="button" data-browser-status-txid>TXID: -</button>
      </footer>
    </section>`,
    script: browserClientScript({ apiBasePath, initialUri }),
  };
}
