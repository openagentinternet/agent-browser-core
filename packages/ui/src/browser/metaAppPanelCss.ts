// Component-level refinements for the address-bar MetaApp panel and its share modal.
// These rules are injected after the base Browser template so light and dark themes
// continue to share the same layout and surface tokens.
export const BROWSER_METAAPP_PANEL_CSS = `
      .browser-app-panel-meta {
        font-size: 11px;
        line-height: 1.3;
      }
      .browser-app-panel-item {
        flex-direction: row;
        gap: 5px;
        padding: 7px 5px;
        font-size: 11px;
        line-height: 1.2;
      }
      .browser-app-panel-item .browser-icon {
        width: 14px;
        height: 14px;
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
      .browser-app-share-copy .browser-icon {
        width: 20px;
        height: 20px;
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
