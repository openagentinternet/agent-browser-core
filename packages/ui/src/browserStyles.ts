export const BROWSER_PAGE_STYLES = `
    html, body { height: 100%; margin: 0; }
    body:has(.browser-shell) { overflow: hidden; }
    .browser-shell { height: 100vh; min-height: 0; display: grid; grid-template-rows: 58px auto minmax(0, 1fr) 32px; background: #f8fafc; color: #111827; font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
    .browser-topbar { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #d1d5db; background: #fff; }
    .browser-nav { display: flex; gap: 4px; }
    .browser-icon-button, .browser-address-submit, .browser-status-strip button { width: 34px; height: 34px; border: 1px solid #d1d5db; background: #fff; }
    .browser-address-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
    .browser-address-form input { min-width: 0; border: 1px solid #d1d5db; padding: 0 10px; height: 34px; }
    .browser-resource-chip, .browser-using-chip { height: 34px; border: 1px solid #d1d5db; background: #fff; padding: 0 10px; white-space: nowrap; }
    .browser-owner-toolbar { grid-row: 2; display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding: 6px 8px; border-bottom: 1px solid #d1d5db; background: #f3f4f6; }
    .browser-viewport-row { grid-row: 3; position: relative; min-height: 0; display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; overflow: hidden; }
    .browser-drawer, .browser-inspector { min-height: 0; overflow: auto; border-right: 1px solid #d1d5db; background: #fff; }
    .browser-inspector { border-right: 0; border-left: 1px solid #d1d5db; }
    .browser-viewport { min-height: 0; overflow: auto; padding: 18px; }
    .browser-status-strip { grid-row: 4; display: flex; gap: 8px; align-items: center; padding: 0 8px; border-top: 1px solid #d1d5db; background: #fff; }
    .browser-bot-page, .browser-empty-state { max-width: 980px; margin: 0 auto; }
    .browser-bot-hero { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .browser-bot-avatar { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; background: #e5e7eb; }
    .browser-action-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .browser-action-row button { border: 1px solid #d1d5db; background: #fff; padding: 6px 10px; }
    .browser-resource-sections { display: grid; gap: 12px; }
    .browser-resource-section { background: #fff; border: 1px solid #d1d5db; padding: 12px; }
    .browser-resource-list { display: grid; gap: 8px; }
    .browser-resource-list-item { border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .browser-html-frame, .browser-pdf { width: 100%; height: 100%; min-height: 520px; border: 0; background: #fff; }
    .browser-image, .browser-video { display: block; max-width: 100%; margin: 0 auto; }
    @media (max-width: 900px) {
      .browser-topbar { grid-template-columns: auto minmax(120px, 1fr); }
      .browser-resource-chip, .browser-using-chip { display: none; }
      .browser-drawer, .browser-inspector { position: absolute; grid-row: 1; top: 0; bottom: 0; z-index: 2; width: min(86vw, 320px); }
      .browser-drawer { left: 0; }
      .browser-inspector { right: 0; }
    }
`;
