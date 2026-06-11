import type { BrowserClientScriptInput } from './browserTypes.js';
import {
  BROWSER_BASE_URL_FIELDS,
  BROWSER_BOT_HOMEPAGE_TEMPLATES,
  BROWSER_MENU_SECTIONS,
  BROWSER_SETTINGS_TABS,
} from './menuModel.js';

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildBrowserClientScript(input: BrowserClientScriptInput): string {
  return `(() => {
  const apiBasePath = ${jsonScript(input.apiBasePath)};
  const initialUri = ${jsonScript(input.initialUri)};
  const browserEndpoints = {
    runtime: apiBasePath + '/runtime',
    resolve: apiBasePath + '/resolve',
    settings: apiBasePath + '/settings',
    cache: apiBasePath + '/cache',
    actions: apiBasePath + '/actions'
  };
  const browserMenuSections = ${jsonScript(BROWSER_MENU_SECTIONS)};
  const browserSettingsTabs = ${jsonScript(BROWSER_SETTINGS_TABS)};
  const browserBaseUrlFields = ${jsonScript(BROWSER_BASE_URL_FIELDS)};
  const browserBotHomepageTemplates = ${jsonScript(BROWSER_BOT_HOMEPAGE_TEMPLATES)};
  const state = {
    runtime: null,
    resource: null,
    selectedActorId: '',
    settingsTab: 'baseUrls',
    settingsData: null,
    cacheData: null,
    error: ''
  };
  const input = document.querySelector('[data-browser-uri-input]');
  const form = document.querySelector('[data-browser-address-form]');
  const viewport = document.querySelector('[data-browser-viewport]');
  const status = document.querySelector('[data-browser-status-state]');
  const actor = document.querySelector('[data-browser-using-selector]');
  const resourceChip = document.querySelector('[data-browser-resource-chip]');
  const menu = document.querySelector('[data-browser-menu]');
  const menuTrigger = document.querySelector('[data-browser-menu-trigger]');
  const modalRoot = document.querySelector('[data-browser-modal-root]');
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  }
  function escapeAttribute(value) {
    return escapeHtml(value).replace(/\\n/g, ' ');
  }
  function closestWithAttribute(target, attribute) {
    return target && target.closest ? target.closest('[' + attribute + ']') : null;
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
  function endpointWithActor(endpoint, params) {
    const query = new URLSearchParams(params || {});
    if (state.selectedActorId) query.set('actorId', state.selectedActorId);
    const suffix = query.toString();
    return suffix ? endpoint + '?' + suffix : endpoint;
  }
  function selectedActor() {
    const runtime = state.runtime || {};
    const actors = runtime.actors || [];
    return actors.find((item) => item.id === state.selectedActorId) || runtime.defaultActor || actors[0] || null;
  }
  function updateActorChip() {
    if (!actor) return;
    const chipTitle = actor.querySelector('.browser-chip-title');
    if (!chipTitle) return;
    const runtime = state.runtime || {};
    const currentActor = selectedActor();
    const label = runtime.labels && runtime.labels.actorChip || 'Using';
    chipTitle.textContent = currentActor ? label + ': ' + currentActor.label : label;
  }
  function openBrowserModal(title, bodyHtml) {
    if (!modalRoot) return;
    modalRoot.innerHTML = '<div class="browser-modal-backdrop" data-browser-modal-close></div>' +
      '<section class="browser-modal-panel" role="document">' +
      '<header class="browser-modal-header"><h2>' + escapeHtml(title) + '</h2>' +
      '<button type="button" class="browser-modal-close" data-browser-modal-close aria-label="Close">x</button></header>' +
      '<div class="browser-modal-body">' + bodyHtml + '</div></section>';
    modalRoot.hidden = false;
  }
  function closeBrowserModal() {
    if (!modalRoot) return;
    modalRoot.hidden = true;
    modalRoot.innerHTML = '';
  }
  function showBrowserLoadingModal(title) {
    openBrowserModal(title, '<div class="browser-loading">Loading...</div>');
  }
  function renderBrowserMenu() {
    if (!menu) return;
    menu.innerHTML = browserMenuSections.map((section) =>
      '<section class="browser-menu-section" data-browser-menu-section="' + escapeAttribute(section.id) + '">' +
      '<h2>' + escapeHtml(section.title) + '</h2>' +
      (section.items || []).map((item) => {
        const menuItemDisabled = item.action !== 'open-settings';
        return '<button type="button" role="menuitem" data-browser-menu-item="' + escapeAttribute(item.id) + '"' +
        ' data-browser-menu-action="' + escapeAttribute(item.action) + '"' +
        (menuItemDisabled ? ' data-browser-menu-disabled aria-disabled="true" disabled' : '') +
        (item.settingsTab ? ' data-browser-settings-tab="' + escapeAttribute(item.settingsTab) + '"' : '') + '>' +
        '<span class="browser-menu-icon" data-browser-menu-icon="' + escapeAttribute(item.icon) + '"></span>' +
        '<span>' + escapeHtml(item.label) + '</span></button>';
      }).join('') + '</section>'
    ).join('');
  }
  function toggleBrowserMenu(forceOpen) {
    if (!menu) return;
    renderBrowserMenu();
    const open = typeof forceOpen === 'boolean' ? forceOpen : menu.hidden;
    menu.hidden = !open;
    if (menuTrigger) menuTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function findBrowserMenuItem(id) {
    for (const section of browserMenuSections) {
      const item = (section.items || []).find((entry) => entry.id === id);
      if (item) return item;
    }
    return null;
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
  function renderSettingsTabs() {
    return '<div class="browser-settings-tabs" role="tablist" aria-label="Browser settings">' +
      browserSettingsTabs.map((tab) =>
        '<button type="button" role="tab" data-browser-settings-tab="' + escapeAttribute(tab.id) + '"' +
        (state.settingsTab === tab.id ? ' aria-selected="true"' : ' aria-selected="false"') + '>' + escapeHtml(tab.label) + '</button>'
      ).join('') + '</div>';
  }
  function settingValue(key) {
    const data = state.settingsData || {};
    const browser = data.browser || {};
    const effectiveBrowser = data.effectiveBrowser || {};
    const defaults = data.defaults || {};
    return browser[key] ?? effectiveBrowser[key] ?? defaults[key] ?? '';
  }
  function renderBaseUrlSettings() {
    return '<section class="browser-settings-panel">' +
      '<div class="browser-settings-fields">' +
      browserBaseUrlFields.map((field) =>
        '<label><span>' + escapeHtml(field.label) + '</span>' +
        '<input data-browser-setting-field="' + escapeAttribute(field.key) + '" value="' + escapeAttribute(settingValue(field.key)) +
        '" placeholder="' + escapeAttribute(field.placeholder) + '"></label>'
      ).join('') + '</div>' +
      '<div class="browser-settings-actions"><button type="button" data-browser-settings-save>Save</button></div>' +
      '</section>';
  }
  function renderTemplateSettings() {
    const active = String(settingValue('botHomepageTemplateId') || 'document');
    return '<section class="browser-template-grid">' +
      browserBotHomepageTemplates.map((template) =>
        '<button type="button" data-browser-template-select="' + escapeAttribute(template.id) + '"' +
        (active === template.id ? ' aria-current="true"' : '') + '>' +
        '<strong>' + escapeHtml(template.name) + '</strong>' +
        '<span>' + escapeHtml(template.description) + '</span></button>'
      ).join('') + '</section>';
  }
  function renderCacheSettings() {
    const cache = state.cacheData || {};
    const lastCleared = cache.lastClearedAt ? new Date(cache.lastClearedAt).toLocaleString() : 'Never';
    return '<section class="browser-cache-panel">' +
      '<dl>' +
      '<div><dt>Cache root</dt><dd>' + escapeHtml(cache.cacheRoot || '-') + '</dd></div>' +
      '<div><dt>Artifacts</dt><dd>' + escapeHtml(cache.artifactCount ?? '-') + '</dd></div>' +
      '<div><dt>Pin records</dt><dd>' + escapeHtml(cache.pinRecordCount ?? '-') + '</dd></div>' +
      '<div><dt>Total bytes</dt><dd>' + escapeHtml(cache.totalBytes ?? '-') + '</dd></div>' +
      '<div><dt>Last cleared</dt><dd>' + escapeHtml(lastCleared) + '</dd></div>' +
      '</dl>' +
      '<div class="browser-cache-actions">' +
      '<button type="button" data-browser-cache-clear="all">Clear all</button>' +
      '<button type="button" data-browser-cache-clear="artifact">Clear artifacts</button>' +
      '<button type="button" data-browser-cache-clear="pin">Clear pin records</button>' +
      '</div></section>';
  }
  function renderBrowserSettings() {
    const body = (state.error ? '<p class="browser-settings-error">' + escapeHtml(state.error) + '</p>' : '') +
      renderSettingsTabs() +
      (state.settingsTab === 'templates'
        ? renderTemplateSettings()
        : state.settingsTab === 'cache'
          ? renderCacheSettings()
          : renderBaseUrlSettings());
    openBrowserModal('Browser Settings', body);
  }
  async function loadBrowserSettingsData() {
    state.error = '';
    const settingsResponse = await fetch(endpointWithActor(browserEndpoints.settings));
    const settingsPayload = await settingsResponse.json();
    if (!settingsPayload.ok) {
      throw new Error(settingsPayload.message || settingsPayload.code || 'Settings unavailable');
    }
    state.settingsData = settingsPayload.data;
    const cacheResponse = await fetch(endpointWithActor(browserEndpoints.cache));
    const cachePayload = await cacheResponse.json();
    if (!cachePayload.ok) {
      throw new Error(cachePayload.message || cachePayload.code || 'Cache unavailable');
    }
    state.cacheData = cachePayload.data;
  }
  async function openBrowserSettings(tab) {
    if (tab) state.settingsTab = tab;
    showBrowserLoadingModal('Browser Settings');
    try {
      await loadBrowserSettingsData();
    } catch (error) {
      state.error = error && error.message || 'Settings unavailable';
    }
    renderBrowserSettings();
  }
  function currentBrowserSettingsPatch() {
    const current = state.settingsData && state.settingsData.browser || {};
    return { ...current };
  }
  async function saveBrowserSettings() {
    if (!modalRoot) return;
    const browser = currentBrowserSettingsPatch();
    modalRoot.querySelectorAll('[data-browser-setting-field]').forEach((field) => {
      const key = field.getAttribute('data-browser-setting-field');
      if (!key) return;
      const value = String(field.value || '').trim();
      if (value) browser[key] = value;
      else delete browser[key];
    });
    showBrowserLoadingModal('Browser Settings');
    try {
      const response = await fetch(endpointWithActor(browserEndpoints.settings), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ browser })
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message || payload.code || 'Settings update failed');
      state.settingsData = payload.data;
      await loadBrowserSettingsData();
    } catch (error) {
      state.error = error && error.message || 'Settings update failed';
    }
    renderBrowserSettings();
  }
  async function selectBotHomepageTemplate(templateId) {
    const browser = currentBrowserSettingsPatch();
    browser.botHomepageTemplateId = templateId;
    showBrowserLoadingModal('Browser Settings');
    try {
      const response = await fetch(endpointWithActor(browserEndpoints.settings), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ browser })
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message || payload.code || 'Template update failed');
      state.settingsData = payload.data;
      await loadBrowserSettingsData();
      renderBrowserSettings();
      const uri = state.resource && state.resource.uri || input && input.value || '';
      if (uri) await navigateTo(uri);
    } catch (error) {
      state.error = error && error.message || 'Template update failed';
      renderBrowserSettings();
    }
  }
  async function clearBrowserCache(scope) {
    showBrowserLoadingModal('Browser Settings');
    try {
      const response = await fetch(endpointWithActor(browserEndpoints.cache), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: scope || 'all' })
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message || payload.code || 'Cache clear failed');
      await loadBrowserSettingsData();
    } catch (error) {
      state.error = error && error.message || 'Cache clear failed';
    }
    renderBrowserSettings();
  }
  function renderActorSelector() {
    const runtime = state.runtime || {};
    const actors = runtime.actors || [];
    const body = actors.length
      ? '<div class="browser-actor-list">' + actors.map((item) =>
        '<button type="button" data-browser-actor-id="' + escapeAttribute(item.id) + '"' +
        (item.id === state.selectedActorId ? ' aria-current="true"' : '') + '>' +
        '<strong>' + escapeHtml(item.label) + '</strong>' +
        '<span>' + escapeHtml(item.kind) + '</span></button>'
      ).join('') + '</div>'
      : '<section class="browser-empty-state"><h2>' + escapeHtml(runtime.labels && runtime.labels.noActorTitle || 'No actor') + '</h2><p>' +
        escapeHtml(runtime.labels && runtime.labels.noActorBody || 'No Browser actor is available.') + '</p></section>';
    openBrowserModal('Using', body);
  }
  async function openActorSelector() {
    showBrowserLoadingModal('Using');
    try {
      if (!state.runtime) await loadRuntime();
    } catch (error) {
      state.error = error && error.message || 'Runtime unavailable';
    }
    renderActorSelector();
  }
  async function selectActor(actorId) {
    state.selectedActorId = actorId;
    closeBrowserModal();
    updateActorChip();
    const uri = state.resource && state.resource.uri || input && input.value || '';
    if (uri) await navigateTo(uri);
  }
  async function loadRuntime() {
    const response = await fetch(endpointWithActor(browserEndpoints.runtime));
    const payload = await response.json();
    if (payload.ok && payload.data) {
      state.runtime = payload.data;
      if (!state.selectedActorId && payload.data.defaultActor) state.selectedActorId = payload.data.defaultActor.id;
      updateActorChip();
    }
  }
  async function navigateTo(uri) {
    if (!uri || !viewport) return;
    if (status) status.textContent = 'loading';
    try {
      const response = await fetch(endpointWithActor(browserEndpoints.resolve, { uri }));
      const payload = await response.json();
      if (!payload.ok) {
        state.resource = null;
        viewport.innerHTML = '<section class="browser-empty-state"><h2>Resolve failed</h2><p>' + escapeHtml(payload.message || payload.code || 'Unknown error') + '</p></section>';
        if (status) status.textContent = 'error';
        return;
      }
      state.resource = payload.data;
      viewport.innerHTML = resourceHtml(payload.data);
      if (resourceChip) resourceChip.querySelector('.browser-chip-title').textContent = payload.data.title || 'Resource';
      if (status) status.textContent = 'resolved';
    } catch (error) {
      state.resource = null;
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
  document.addEventListener('click', (event) => {
    const target = event.target;
    const menuItem = closestWithAttribute(target, 'data-browser-menu-item');
    if (menuItem) {
      event.preventDefault();
      if (menuItem.hasAttribute('data-browser-menu-disabled')) return;
      const item = findBrowserMenuItem(menuItem.getAttribute('data-browser-menu-item'));
      toggleBrowserMenu(false);
      if (item && item.action === 'open-settings') {
        openBrowserSettings(item.settingsTab || 'baseUrls').catch(() => {});
      }
      return;
    }
    const menuButton = closestWithAttribute(target, 'data-browser-menu-trigger');
    if (menuButton) {
      event.preventDefault();
      toggleBrowserMenu();
      return;
    }
    const usingButton = closestWithAttribute(target, 'data-browser-using-selector');
    if (usingButton) {
      event.preventDefault();
      openActorSelector().catch(() => {});
      return;
    }
    const modalClose = closestWithAttribute(target, 'data-browser-modal-close');
    if (modalClose) {
      event.preventDefault();
      closeBrowserModal();
      return;
    }
    const actorButton = closestWithAttribute(target, 'data-browser-actor-id');
    if (actorButton) {
      event.preventDefault();
      selectActor(actorButton.getAttribute('data-browser-actor-id') || '').catch(() => {});
      return;
    }
    const templateButton = closestWithAttribute(target, 'data-browser-template-select');
    if (templateButton) {
      event.preventDefault();
      selectBotHomepageTemplate(templateButton.getAttribute('data-browser-template-select') || '').catch(() => {});
      return;
    }
    const cacheButton = closestWithAttribute(target, 'data-browser-cache-clear');
    if (cacheButton) {
      event.preventDefault();
      clearBrowserCache(cacheButton.getAttribute('data-browser-cache-clear') || 'all').catch(() => {});
      return;
    }
    const saveButton = closestWithAttribute(target, 'data-browser-settings-save');
    if (saveButton) {
      event.preventDefault();
      saveBrowserSettings().catch(() => {});
      return;
    }
    const settingsTab = closestWithAttribute(target, 'data-browser-settings-tab');
    if (settingsTab && !settingsTab.hasAttribute('data-browser-menu-item')) {
      event.preventDefault();
      state.settingsTab = settingsTab.getAttribute('data-browser-settings-tab') || 'baseUrls';
      renderBrowserSettings();
    }
  });
  renderBrowserMenu();
  loadRuntime().catch(() => {});
  if (input && !input.value) input.value = initialUri;
  if (initialUri && viewport && !viewport.innerHTML.trim()) navigateTo(initialUri).catch(() => {});
})();`;
}
