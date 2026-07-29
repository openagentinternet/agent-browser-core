// Component-level refinements for the address-bar MetaApp panel and its share modal.
// These rules are injected after the base Browser template so light and dark themes
// continue to share the same layout and surface tokens.
export const BROWSER_METAAPP_PANEL_CSS = `
      .browser-app-panel-meta {
        padding: 0 10px;
        color: var(--browser-muted);
        font-size: 11px;
        line-height: 1.3;
      }
      .browser-address-form .browser-app-panel .browser-owner-panel-copy {
        width: 28px;
        height: 28px;
        margin-right: 0;
        margin-left: auto;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--browser-muted);
      }
      .browser-address-form .browser-app-panel .browser-owner-panel-copy:hover {
        border: none;
        background: var(--browser-hover, rgba(15, 23, 42, .06));
        color: var(--browser-text);
      }
      .browser-address-form .browser-app-panel .browser-owner-panel-item {
        justify-content: flex-start;
        width: 100%;
        height: auto;
        margin-right: 0;
        padding: 8px 10px;
        border: none;
        background: transparent;
        color: var(--browser-text);
      }
      .browser-address-form .browser-app-panel .browser-owner-panel-item:not(:disabled):hover {
        border: none;
        background: var(--browser-hover, rgba(15, 23, 42, .06));
        color: var(--browser-text);
      }
      .browser-app-share-rows {
        gap: 12px;
      }
      .browser-app-share-field {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .browser-app-share-label {
        color: var(--browser-muted);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.2;
      }
      .browser-modal-panel .browser-app-share-copy {
        box-sizing: border-box;
        flex: 0 0 28px;
        width: 28px;
        min-width: 28px;
        height: 28px;
        min-height: 28px;
        padding: 0 !important;
        line-height: 0;
      }
      .browser-app-share-copy .browser-icon {
        display: block;
        width: 20px !important;
        min-width: 20px;
        height: 20px !important;
      }
      .browser-app-share-composer {
        align-items: flex-end;
      }
      .browser-modal-body .browser-app-share-composer textarea {
        height: 96px;
      }
      .browser-modal-panel .browser-app-share-buzz {
        align-self: flex-end;
      }
      .browser-modal-panel .browser-app-share-copy,
      .browser-modal-panel .browser-app-share-buzz {
        border: 1px solid var(--browser-border);
        background: var(--browser-surface);
        color: var(--browser-text);
      }
      .browser-modal-panel .browser-app-share-copy:not(:disabled):hover,
      .browser-modal-panel .browser-app-share-buzz:not(:disabled):hover {
        border-color: var(--browser-border-strong);
        background: var(--browser-surface2);
        color: var(--browser-text);
      }
`;
