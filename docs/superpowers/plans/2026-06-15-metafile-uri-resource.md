# Metafile URI Resource Implementation Plan

## Success Criteria

- `metafile://{pinId}` resolves through ManAPI metadata and renders by file content type.
- `metafile://{pinId}.{ext}` resolves to the same canonical pin id and content URL.
- Chain metadata wins over conflicting input extensions.
- Unsupported files return a safe download link instead of attempting preview.
- Standalone deep links at `/browser/metafile/{pinId}` serve the Browser shell.

## Steps

1. Add red tests for URI parsing, metafile resolver behavior, Browser resolver dispatch, UI fallback
   links, Browser page deep links, and standalone route matching.
   - Verify: targeted test command fails for missing/unsupported `metafile://` behavior.
2. Implement the core metafile resolver and dispatch from `resolveBrowserResource`.
   - Verify: core resolver tests pass.
3. Update UI fallback rendering and standalone deep-link route parsing.
   - Verify: UI and standalone targeted tests pass.
4. Run full workspace verification and live standalone smoke tests with the provided PDF and MP4
   metafile URIs.
   - Verify: `npm run verify` passes and local API/page smoke checks identify PDF and video
     renderers.
