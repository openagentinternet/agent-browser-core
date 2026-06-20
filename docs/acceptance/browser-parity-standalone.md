# Browser Parity Standalone Acceptance

## Runtime

- URL: http://127.0.0.1:8787/browser
- Runtime endpoint: http://127.0.0.1:8787/api/browser/runtime
- Host kind: standalone
- Actor: Standalone Wallet
- Default actor kind: wallet
- Default landing: welcome page (no default URI; empty address bar renders the welcome page)

## Browser HTML

The standalone Browser page contains the mature chrome markers:

- browser-titlebar
- browser-topbar
- browser-using-chip
- browser-template-option
- browser-status-strip

## Verification

- npm run build: passed
- npm run verify: passed
- npm run verify:packages: passed
- release version check v0.3.0: passed
- publish dry-run: passed; all packages were listed at 0.3.0

## Visual Acceptance

Screenshot evidence: `/Users/tusm/Documents/MetaID_Projects/agent-browser-core/dist/acceptance/browser-parity-standalone.png`

The standalone Browser uses the mature OAC Browser chrome and does not render the low-fidelity
ABC 0.2 preview UI. The captured page shows the title bar, styled address bar, top-right
Standalone Wallet actor chip, Fixture Bot homepage content, and styled status strip.

## OAC Consumption

OAC consumption was not performed in this phase.

## Standalone ZIP MetaApp Preview

Verification date: 2026-06-15

- `metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0` resolves to `html-iframe`.
- The resolved renderer URL is served from `/api/browser/preview-assets/...`.
- The MetaApp record keeps `codeType: application/zip` while exposing `contentType: text/html` for rendering.
- `GET /api/browser/cache` reports the configured standalone cache root, one artifact, and one pin record after resolution.
