# Standalone MetaApp Preview Backend Design

## Context

Agent Browser Core currently resolves `metaapp://` resources through shared Browser core logic and
renders supported resource types through the shared Browser UI. The standalone host can serve Browser
pages and preview assets, but it only creates preview sessions for existing `file://` artifact
directories. Remote MetaApps whose code is published as `application/zip` resolve to a download URL
and then fall through to the unsupported renderer path.

Open Agent Connect can render the same ZIP MetaApps because its daemon owns host-specific artifact
work: it downloads the ZIP, extracts it into a local artifact cache, creates a preview session, and
serves the extracted `index.html` plus relative assets through daemon routes.

The public standalone Browser planned for `https://botinternet.org/browser` should feel like a
front-end application to users, but ZIP MetaApp rendering still needs a thin server-side preview
layer. Browsers cannot iframe a ZIP archive directly, and a fully client-side ZIP preview based on
IndexedDB, OPFS, and Service Workers would make the first public release harder to secure, test, and
operate.

## Goals

- Render remote ZIP MetaApps in the standalone Browser without relying on OAC daemon internals.
- Keep Browser core host-neutral: no OAC, IDBots, database, wallet, or deployment-specific storage
  imports in `packages/core`.
- Keep the shared UI simple: it should render the `renderer.url` returned by the host and should not
  know how ZIP download or extraction works.
- Provide a local development path for `packages/host-standalone` using file-system artifact cache.
- Define a production path for `botinternet.org` using a thin TypeScript/Node preview backend,
  isolated preview origin, and replaceable storage.
- Ensure OAC can keep using the shared ABC packages it needs without installing or running the
  standalone preview backend.

## Non-Goals

- Do not move OAC profile, actor, daemon, or artifact-cache internals into ABC core.
- Do not implement wallet login, wallet signing, or payment from inside MetaApp iframes.
- Do not make the first release a purely browser-side ZIP runtime.
- Do not require OAC to adopt the standalone preview backend.
- Do not introduce a large application framework unless the implementation plan identifies a concrete
  need.

## Recommended Technology

The preview backend should be written in TypeScript on Node.js 20 or newer.

This matches the existing ABC workspace, allows direct reuse of shared Browser contracts and resolver
types, keeps tests in the same Node test toolchain, and makes the OAC-proven ZIP preview behavior
easier to port without importing OAC-specific runtime state.

The first local implementation should extend the existing Node HTTP standalone host rather than
introducing a new web framework. A later production package may wrap the same preview service
interfaces with a deployment-specific HTTP framework or serverless adapter if needed.

## Package Boundaries

### `packages/core`

Core remains host-neutral. It may contain:

- MetaApp protocol record normalization;
- renderer selection;
- host-neutral preview session input/output types;
- small pure helpers that do not touch file systems, object storage, databases, wallets, or OAC
  runtime state.

Core must not download ZIP archives, extract files, choose cache directories, serve preview assets,
or import standalone/OAC/IDBots host packages.

### `packages/ui`

UI remains renderer-driven. It may:

- call the Browser host API;
- render `html-iframe`, image, video, and document renderers;
- show cache controls when the host reports `features.cacheManagement`.

UI must not download or extract ZIP archives.

### `packages/host-standalone`

The standalone host owns local development behavior:

- resolve Browser resources through the shared core;
- detect ZIP MetaApp preview inputs through the host-provided preview session factory;
- download, validate, and extract ZIP artifacts into a host-owned local cache;
- serve preview assets through `/api/browser/preview-assets/:previewId/:assetPath`;
- expose cache status and cache clearing through the existing Browser cache contract.

The default local cache root should be host-owned and configurable:

```text
Default on macOS:
~/Library/Caches/agent-browser-core/metaapps

Environment override:
AGENT_BROWSER_CACHE_DIR=/absolute/path
```

The local cache layout should be deterministic:

```text
<cacheRoot>/
  artifacts/
    <artifactKey>/
      index.html
      assets/...
  pins/
    <pinId>.json
  tmp/
```

### `packages/preview-backend`

A production preview backend package may be added when `botinternet.org` deployment work begins.
This package is an ABC monorepo host package, not a core dependency. It should expose the same
preview service concepts as `host-standalone` but use production storage and preview origin rules.

OAC should not depend on this package. OAC should continue to own its local daemon adapter and local
artifact cache.

## Production Deployment Shape

The public standalone deployment should use three visible surfaces:

```text
https://botinternet.org/browser
  Browser UI.

https://botinternet.org/api/browser/resolve?uri=metaapp://...
  Browser resource resolution API.

https://metaapp-preview.botinternet.org/<artifactKey>/index.html
  Isolated preview origin for extracted MetaApp assets.
```

The preview backend may run as a small Node service, a serverless function set, or an edge-compatible
adapter, but the first implementation should be designed around explicit interfaces rather than a
specific hosting vendor.

Production storage should be replaceable:

- artifact metadata: SQLite, Postgres, Redis, KV, or another deployment-owned index;
- extracted files: local disk for small single-node deployments, or object storage plus CDN for
  public deployment;
- temporary downloads: short-lived local or platform temporary storage.

## Data Flow

1. The user opens `https://botinternet.org/browser`.
2. The Browser UI asks the host to resolve a resource, such as:

   ```text
   /api/browser/resolve?uri=metaapp://<pinId>
   ```

3. Core normalizes the URI and asks the host-provided MetaApp resolver for the protocol record.
4. The standalone or preview host reads the `/protocols/metaapp` pin and finds the content reference,
   content type, code type, and index file.
5. If the content is directly renderable HTML, image, video, or document content, the host returns the
   normal renderer metadata.
6. If the content is a ZIP MetaApp, the host:

   - resolves `metafile://...` or HTTPS content references to a download URL;
   - computes an artifact key from stable content identity;
   - reuses an existing extracted artifact when the cache is valid;
   - downloads the archive when needed;
   - validates and extracts the archive;
   - creates a preview URL for the configured `indexFile`.

7. The host returns a MetaApp record whose `contentType` is `text/html`, whose `runUrl` and
   `localUiUrl` point to the preview URL, and whose original ZIP metadata remains available in the
   raw record.
8. Core builds an `html-iframe` renderer.
9. UI renders the returned URL in the existing MetaApp iframe renderer.

## Artifact Identity And Caching

The artifact key should identify the downloaded package, not just the current preview session. It
should include:

- the normalized content reference or resolved download URL;
- the declared source content type and code type;
- the normalized `indexFile`;
- a stable chain identifier such as the MetaApp pin id and content pin id when available.

Hosts may include response metadata such as ETag, content length, or last modified time when the
source provides it, but those fields should not be required for correctness.

Cache behavior:

- cache hits return a new preview session URL pointing at the existing artifact;
- failed extraction must not replace an existing valid artifact;
- downloads and extractions should write into `tmp/` first and then move atomically into
  `artifacts/<artifactKey>/`;
- cache clear with scope `artifact` removes extracted artifacts and active preview sessions;
- cache clear with scope `pin` removes pin metadata and any mapping from pin id to artifact key;
- cache clear with scope `all` removes both.

## ZIP Validation And Extraction

ZIP handling is part of the host preview service, not the UI.

The extraction logic must enforce:

- maximum archive byte size;
- maximum uncompressed byte size;
- maximum file count;
- maximum path depth and path length;
- no absolute paths;
- no `..` path segments after normalization;
- no backslash path traversal;
- no symlinks or special file entries;
- required `indexFile` exists after extraction;
- ignored or rejected development artifacts such as `.git/`, `node_modules/`, `.DS_Store`, and
  hidden runtime directories when they are not needed for browser execution.

The service must infer or set safe content types when serving preview assets. Unknown files should
use `application/octet-stream`.

## HTTP API Surface

The existing standalone routes should remain the local development baseline:

```text
GET /browser
GET /api/browser/runtime
GET /api/browser/resolve?uri=<uri>
GET /api/browser/preview-assets/:previewId/:assetPath
GET /api/browser/cache
POST /api/browser/cache/clear
```

Production may use the same logical routes for the Browser host API. Preview asset routes should be
served from the preview origin:

```text
GET https://metaapp-preview.botinternet.org/<artifactKey>/<assetPath>
```

The resolve response should not expose local file-system paths, cache root paths, host secrets, or
private deployment metadata.

## Security Model

The standalone public website has a stricter threat model than local OAC.

Required controls:

- render untrusted MetaApp content in a sandboxed iframe;
- keep wallet login, signing, and payment as first-party Browser trusted actions only;
- never expose wallet APIs to MetaApp iframe content;
- serve public preview assets from an isolated preview origin where practical;
- do not set authentication cookies on the preview origin;
- use restrictive CSP for preview assets;
- block path traversal and invalid archive entries before writing extracted files;
- set explicit content types and avoid content sniffing where possible;
- rate-limit public resolve and ZIP download endpoints;
- do not fetch arbitrary internal network URLs from user-controlled content references;
- only resolve supported `metafile://` and public `https://` content references according to host
  policy.

## Error Handling

The host should preserve clear error boundaries:

- invalid `metaapp://` URI: return `invalid_browser_uri`;
- missing or non-MetaApp pin: return the existing resource or protocol mismatch errors;
- unsupported non-ZIP content: keep the current unsupported renderer behavior;
- ZIP download failure: return `browser_resolve_failed` with a download-specific message;
- ZIP validation failure: return `browser_resolve_failed` with a validation-specific message;
- missing `indexFile`: return `browser_resolve_failed`;
- preview asset missing: return `browser_resource_not_found`;
- preview asset path outside artifact root: return `invalid_argument`.

The UI should show the host error instead of inventing a fallback renderer.

## OAC Compatibility

OAC must not be forced to run the standalone preview backend.

Dependency rules:

- OAC may depend on `@openagentinternet/agent-browser-core`,
  `@openagentinternet/agent-browser-host-contract`, and `@openagentinternet/agent-browser-ui`.
- OAC should not depend on `@openagentinternet/agent-browser-host-standalone` for its daemon
  runtime.
- OAC should not depend on a future `@openagentinternet/agent-browser-preview-backend` package.
- Shared packages must not import preview backend packages.

OAC can keep its local daemon adapter and artifact cache while still consuming newer shared core and
UI packages.

## Testing And Verification

The implementation plan should include tests at these layers:

- core tests proving ZIP content is only converted to an `html-iframe` renderer when a host returns
  a preview URL;
- standalone host tests for ZIP download, validation, extraction, cache hit, cache clear, and preview
  asset serving;
- path traversal tests for malicious ZIP entries;
- fixture-backed MetaApp resolve tests using a local ZIP fixture;
- browser/UI tests proving a ZIP MetaApp resolves to an iframe URL and no longer shows unsupported
  renderer;
- package-boundary tests proving `core` and `ui` do not import standalone or preview backend code.

Docs-only changes should run `git diff --check`. Implementation changes should run the package
builds and targeted Node tests named in the implementation plan.

## Rollout Plan

The implementation should be split into two phases.

### Phase 1: Local Standalone ZIP Preview

- Add host-owned ZIP artifact cache to `packages/host-standalone`.
- Reuse the existing `/api/browser/preview-assets/` route.
- Add local file-system cache under the configured cache root.
- Make the known ZIP MetaApp resolve to `html-iframe` in local standalone mode.
- Keep all production object-storage concerns out of this phase.

### Phase 2: Production Preview Backend

- Add a production host package or deployment adapter for `botinternet.org`.
- Introduce a replaceable artifact store for object storage and metadata index.
- Serve extracted artifacts from `metaapp-preview.botinternet.org` or an equivalent isolated origin.
- Add public-rate-limit, storage, and operational configuration.
- Keep this package out of OAC's dependency graph.

## Acceptance Criteria

- `metaapp://<pinId>` records whose code is an `application/zip` package resolve to an
  `html-iframe` renderer when the standalone host can create a preview URL.
- The standalone Browser no longer shows `Unsupported renderer` for valid ZIP MetaApps with a valid
  `index.html`.
- `packages/core` remains host-neutral and has no dependency on standalone or preview backend
  packages.
- OAC can continue consuming shared ABC packages without installing or running the standalone preview
  backend.
- Cache controls report and clear standalone artifacts through the existing Browser cache contract.
- Malicious ZIP archives cannot write outside the artifact directory or serve files outside the
  preview root.
- The public deployment design supports an isolated preview origin for untrusted MetaApp content.
