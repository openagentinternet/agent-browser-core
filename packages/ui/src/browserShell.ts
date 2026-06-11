import { escapeHtml } from './renderers.js';
import type { BrowserShellInput } from './browserTypes.js';

export function buildBrowserShellHtml(input: BrowserShellInput): string {
  return `<section class="browser-shell" data-browser-shell>
      <header class="browser-topbar" data-browser-topbar>
        <nav class="browser-nav" aria-label="Browser navigation">
          <button type="button" class="browser-icon-button" aria-label="Back" data-browser-back></button>
          <button type="button" class="browser-icon-button" aria-label="Forward" data-browser-forward></button>
          <button type="button" class="browser-icon-button" aria-label="Reload" data-browser-reload></button>
          <button type="button" class="browser-icon-button" aria-label="Bookmarks and history" data-browser-drawer-toggle aria-expanded="false"></button>
        </nav>
        <form class="browser-address-form" data-browser-address-form>
          <input data-browser-uri-input aria-label="Agent Internet URI" value="${escapeHtml(input.initialUri)}">
          <button type="submit" class="browser-address-submit" aria-label="Visit URI"></button>
        </form>
        <button type="button" class="browser-resource-chip" data-browser-resource-chip aria-expanded="false"><span class="browser-chip-title">Resource</span></button>
        <button type="button" class="browser-using-chip" data-browser-using-selector aria-expanded="false"><span class="browser-chip-title">Using</span></button>
        <button type="button" class="browser-icon-button browser-menu-trigger" data-browser-menu-trigger aria-label="Browser menu" aria-haspopup="menu" aria-expanded="false"></button>
        <div class="browser-chrome-menu" data-browser-menu role="menu" hidden></div>
      </header>
      <div class="browser-owner-toolbar" data-browser-owner-toolbar hidden></div>
      <div class="browser-viewport-row" data-browser-viewport-row>
        <aside class="browser-drawer" data-browser-drawer hidden></aside>
        <main class="browser-viewport" data-browser-viewport>${input.initialResourceHtml}</main>
        <aside class="browser-inspector" data-browser-inspector hidden></aside>
      </div>
      <footer class="browser-status-strip" data-browser-status-strip>
        <button type="button" data-browser-status-state>ready</button>
        <button type="button" data-browser-status-proof>unverified</button>
        <span data-browser-status-renderer>renderer</span>
        <button type="button" data-browser-status-txid>TXID: -</button>
      </footer>
      <div class="browser-modal" data-browser-modal-root hidden></div>
    </section>`;
}
