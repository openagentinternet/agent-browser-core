# preview-metaapp:// Protocol — Design Spec

- **Date:** 2026-07-24
- **Branch:** `feat/preview-metaapp-protocol`
- **Status:** Design approved, pending implementation plan
- **Author:** Sunny Fung (via collaborative design session)

## 1. Background & Motivation

When developing a MetaApp (or mini-program) locally — often with a Coding Agent — users want to see
how it looks and behaves in the Agent Browser **before** publishing it on-chain. Today the only way
to preview is to publish the work as a MetaApp first (which costs on-chain fees and effort), then
view the published artifact. Iterating on layout, interactivity, and on-chain interactions this way
is slow and expensive.

This spec introduces a new Browser URI scheme, `preview-metaapp://`, that lets a user point the
Browser at a **local file or directory** (or, for completeness, a remote HTTP origin) and preview it
with the exact same rendering pipeline used for published MetaApps — HTML, PDF, images, video, audio.
The published on-chain effect can be approximated locally at zero cost.

## 2. Goals & Non-Goals

### Goals

- New scheme `preview-metaapp://{host}/{path}` recognized by the Browser URI parser.
- `host === 'localhost'` reads the local filesystem and serves the content via the existing
  preview-asset pipeline (path-traversal containment, storage-shim injection, relative-resource
  resolution all reused).
- Non-`localhost` hosts are treated as HTTP origins and rendered by direct connection.
- All existing renderers (`html-iframe`, `pdf`, `image`, `video`, `audio`) apply automatically.
- Zero UI changes; zero new HTTP routes; zero new on-disk cache.
- Host-neutral core: all filesystem access stays in `host-standalone`; core consumes a host-injected
  factory.

### Non-Goals

- Path/directory allow-lists or sandboxing of `localhost` reads. (Explicitly deferred — see
  §9 Security.)
- Network reachability probing for remote hosts. (Core constructs the URL; the iframe does the
  fetch.)
- A Settings UI for managing preview roots. (URI is self-describing; no config surface needed in v1.)
- A new HTTP serving route. (Reuse `/api/browser/preview-assets/`.)
- Persisting preview sessions to disk. (Local directories are read live each time.)

## 3. Decisions (locked during design session)

| # | Decision | Choice |
|---|---|---|
| D1 | Remote-host semantics | **Any HTTP origin, direct connect.** Core builds `https://{host}{path}`. |
| D2 | Local-path safety model | **No restriction — any absolute path.** Risk documented; no allow-list logic. |
| D3 | Which `host` triggers local FS | **Literal `'localhost'` only.** `localhost:3000` and `127.0.0.1` are remote (HTTP). |
| D4 | Reuse vs. new serving route | **Reuse** existing `PreviewSession` + `/api/browser/preview-assets/`. |
| D5 | Settings surface | **None in v1.** Only a host-level env kill-switch. |
| D6 | Remote probing | **None.** Core does not pre-fetch remote URLs. |
| D7 | Remote scheme | **`https`** for remote hosts in v1 (no `http` option). See §6. |

## 4. URI Format

```
preview-metaapp://{host}/{path}
```

- `host` — hostname. `localhost` ⇒ local FS branch; any other value ⇒ remote HTTP branch.
- `path` — absolute path beginning with `/`.
  - For `localhost`: a filesystem absolute path (e.g. `/Users/tusm/.../app/index.html`).
  - For remote: a URL path (e.g. `/path/to/index.html`).

### Examples

```
# Local file
preview-metaapp://localhost/Users/tusm/Documents/MetaID_Projects/metaapp_buzz/app/index.html

# Local directory (auto-resolves index.html)
preview-metaapp://localhost/Users/tusm/Documents/MetaID_Projects/metaapp_buzz/app/

# Local single non-HTML file
preview-metaapp://localhost/Users/me/report.pdf

# Remote
preview-metaapp://example.com/path/to/index.html
```

### Parsing rules

- Use the standard `URL` constructor to split host and path:
  - `url.host` is the host (includes port if present). Detection of the local-FS branch is simply
    `host === 'localhost'` — because `url.host` keeps the port, `localhost:3000` is **not** equal to
    `'localhost'` and correctly falls into the remote branch (per D3). No separate port check needed.
  - `url.pathname` is the path; it is percent-decoded by `URL`, which is the desired behavior for
    Chinese-character and space paths (`/Users/me/我的项目`).
- `normalizedUri` = `preview-metaapp://{host}{path}`, with collapsed consecutive slashes in the path
  but the path body otherwise preserved.
- An empty host or a path that is not absolute (does not start with `/`) is a parse error.

## 5. Architecture

### 5.1 Package boundaries

This feature strictly follows the existing package-boundary rules (AGENTS.md §Development Rules):

- **`packages/core`** — host-neutral. Owns URI parsing, scheme registration, the resolver dispatch,
  and renderer selection. **Performs no filesystem access and no network requests.**
- **`packages/host-standalone`** — owns all local FS access. Implements the host-injected factory
  consumed by core. Reuses the existing `PreviewSession` machinery verbatim.
- **`packages/ui`** — **untouched.** Existing renderers already accept both `https:` URLs and `/`-
  prefixed relative URLs via `safeRendererUrl()`.

### 5.2 New types

In `packages/core/src/browser/types.ts`:

```ts
// Extend the scheme union (also mirrored in uri/browserUri.ts).
export type BrowserUriScheme =
  | 'metaid' | 'metaapp' | 'metafile' | 'map' | 'pin' | 'preview-metaapp';

// Parsed form of preview-metaapp:// — has host+path structure (unlike flat metaapp/metafile).
export interface ParsedPreviewMetaAppUri {
  originalUri: string;
  normalizedUri: string;
  scheme: 'preview-metaapp';
  host: string;
  path: string;   // absolute, percent-decoded, begins with '/'
}

// Host-injected factory for the localhost branch. Mirrors MetaAppPreviewSessionFactory's pattern:
// core stays host-neutral and just consumes the returned localPreviewUrl.
export type PreviewMetaAppLocalResolve = (input: {
  path: string;   // absolute local path (directory or file)
}) => Promise<PreviewMetaAppLocalResolveResult> | PreviewMetaAppLocalResolveResult;

export interface PreviewMetaAppLocalResolveResult {
  localPreviewUrl: string;   // e.g. /api/browser/preview-assets/{previewId}/index.html
  previewId?: string;
  contentType?: string;      // e.g. 'text/html', 'application/pdf'; drives renderer selection
}

// Host-level kill-switch on the base config.
export interface BrowserBaseConfig {
  // ...existing fields...
  enablePreviewMetaApp?: boolean;   // default true
}
```

### 5.3 New optional input on the resolver entry point

In `packages/core/src/browser/browserResolver.ts`, extend `ResolveBrowserResourceInput`:

```ts
export interface ResolveBrowserResourceInput {
  // ...existing fields...
  previewMetaAppLocalResolve?: PreviewMetaAppLocalResolve;   // injected by host-standalone
}
```

This mirrors the existing `metaAppResolve` / `MetaAppPreviewSessionFactory` host-injection pattern at
`types.ts:285` — the established way core stays host-neutral while delegating host-specific work.

## 6. Resolver Design

New module `packages/core/src/browser/previewMetaAppResolver.ts` exports:

```ts
export function resolvePreviewMetaAppResource(input: {
  parsed: ParsedPreviewMetaAppUri;
  config: BotBrowserConfig;
  previewMetaAppLocalResolve?: PreviewMetaAppLocalResolve;
}): Promise<BrowserCommandResult<BrowserResolveResult>>;
```

### Dispatch

1. If `config.enablePreviewMetaApp === false` ⇒ return `unsupported`, message
   `"preview-metaapp is disabled"`.
2. Branch on host:
   - **Local FS branch** — `parsed.host === 'localhost'` (because `url.host` includes any port,
     `localhost:3000` never matches and goes remote; see D3):
     - If `previewMetaAppLocalResolve` is absent ⇒ return `unsupported`, message
       `"Local preview is not supported by this host"`.
     - Else call it with `{ path: parsed.path }`. On its result, select a renderer from
       `contentType` (falling back to extension sniffing) and build a `BrowserResolveResult` with
       `renderer.type ∈ {html-iframe, pdf, image, video, audio}` and
       `renderer.url = result.localPreviewUrl`.
   - **Remote HTTP branch** — any other host:
     - Construct `renderer.url = https://{host}{path}`. Remote scheme is **always `https`** in v1
       (decision D7); there is no `http` option. `{host}` carries its port when present
       (e.g. `localhost:3000` → `https://localhost:3000{path}`).
     - Select renderer from the path's extension via the existing `selectRendererType()` helper
       (`metaAppResolver.ts:37`).
     - Do **not** invoke any host callback. Do **not** perform a network fetch.

### Renderer selection (both branches)

Reuse `selectRendererType(contentTypeOrExtension)` (already in core). Mapping:

- `text/html` / `.html` / `.htm` ⇒ `html-iframe`
- `application/pdf` / `.pdf` ⇒ `pdf`
- `image/*` / `.png|.jpg|.jpeg|.gif|.webp|.svg` ⇒ `image`
- `video/*` / `.mp4|.webm|.mov` ⇒ `video`
- `audio/*` / `.mp3|.wav|.ogg` ⇒ `audio`
- anything else ⇒ `unsupported`

### Dispatch wiring

In `resolveBrowserResource()` (`browserResolver.ts:306`), add a
`parsed.scheme === 'preview-metaapp'` branch that calls `resolvePreviewMetaAppResource()`, placed
**before** the `metaapp` fallthrough (currently at line ~453) so the generic fallthrough never
catches this scheme.

## 7. Local FS Implementation (host-standalone)

`packages/host-standalone/src/adapter.ts` provides the `previewMetaAppLocalResolve` factory, wired
into the `resolveBrowserResource` call site (alongside the existing `metaAppResolve` injection).

Algorithm (`path` is the decoded absolute local path):

1. `fs.stat(path)`:
   - If a **directory** ⇒ `artifactDir = path`; resolve `indexFile`:
     - prefer `index.html`, then `index.htm`; if neither exists ⇒ error result
       `"No index.html found in directory: {path}"`.
   - If a **file** ⇒ `artifactDir = path.dirname(path)`, `indexFile = path.basename(path)`.
   - `ENOENT` ⇒ error `"Local path not found: {path}"`.
   - `EACCES` ⇒ error `"Permission denied: {path}"`.
2. Call the existing `createPreviewSessionForArtifact({ artifactDir, indexFile, source: 'local' })`
   (adapter.ts:383) to mint a `previewId` + `localPreviewUrl`. This requires widening the
   `PreviewSession.source` union from `'cache'` to `'cache' | 'local'` — a live local directory is
   not a cache artifact, and the tag should be honest. (`source` is informational; no behavior
   branches on it today.)
3. Infer `contentType` via the existing `contentTypeForPath()` (adapter.ts:147) from `indexFile`.
4. Return `{ localPreviewUrl, previewId, contentType }`.

### Why this reuses everything

- The existing route `/api/browser/preview-assets/{previewId}/{assetPath}`
  (`server.ts:60,150-165`) serves the session unchanged.
- `resolvePreviewAsset()` (`adapter.ts:660-687`) enforces path-traversal containment per session:
  requested asset must resolve under `session.artifactDir`. This guards against a single preview
  session escaping its declared directory.
- `injectMetaAppPreviewStorageShim()` (`adapter.ts:219-244`) injects fake `localStorage`/
  `sessionStorage` so MetaApp-style apps function.
- HTML relative resources (`<img src="logo.png">`) resolve to
  `/api/browser/preview-assets/{previewId}/logo.png` and load normally.
- No new route, no new cache, no new content-type table.

### Session lifecycle

Sessions live in the existing in-memory `previewSessions` map keyed by `previewId`, aged by
`createdAt`. No persistence. Because local directories are read live, a page reload always reflects
the latest file contents on disk.

## 8. Configuration

### Core defaults

`createDefaultBrowserConfig()` (`core/src/browser/config.ts:39`) sets `enablePreviewMetaApp: true`.

### Env override

`resolveBrowserConfig()` (`config.ts:59`) reads `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP=1` and, when
set, forces `enablePreviewMetaApp = false`. This is the sole host-level kill-switch.

### Host specialization

Hosts (OAC, IDBots) that do not want to expose local-FS preview spread
`createDefaultBrowserConfig()` as a base and set `enablePreviewMetaApp: false` — per AGENTS.md's
recommended host pattern. They never need to inject `previewMetaAppLocalResolve`.

### Settings UI

**No new Settings fields in v1.** The URI is self-describing and there is no allow-list to manage.

## 9. Security Considerations

**D2 — Unrestricted absolute-path reads on `localhost`.** This is an explicit, user-approved design
choice. Implication: any entity able to submit a `preview-metaapp://localhost/...` URI to a running
standalone Browser can read any file the host process can read (e.g. `~/.ssh/id_rsa`, `/etc/passwd`).

Mitigations in scope:
- The feature is documented as **local-dev-only** and **must not be exposed to the public
  internet**. The standalone host's `localMode` flag is a behavioral setting, **not** a deployment
  scope — it does NOT restrict local-FS preview, so it must not be relied on as a gate.
- The `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP` kill-switch is the **only** runtime control that
  disables the feature; a deployment exposed beyond the local machine must set it.
- `resolvePreviewAsset()`'s per-session path-traversal containment remains in force: it prevents a
  single session from escaping its declared `artifactDir`, even though the declared root itself is
  unrestricted.

Mitigations explicitly **out of scope** for v1 (documented, not implemented):
- An allow-list of permitted local root directories.
- Authentication/authorization on the `localhost` preview branch.

Code comments and user-facing docs will call out the local-dev-only constraint.

## 10. Error Handling

All error paths produce a `BrowserCommandResult<BrowserResolveResult>` (not thrown exceptions),
consistent with every other resolver.

| Branch | Condition | State | Message |
|---|---|---|---|
| both | `enablePreviewMetaApp === false` | `unsupported` | `"preview-metaapp is disabled"` |
| parse | empty host / non-absolute path | error | `"Invalid preview-metaapp URI"` |
| local | no `previewMetaAppLocalResolve` injected | `unsupported` | `"Local preview is not supported by this host"` |
| local | `ENOENT` | error | `"Local path not found: {path}"` |
| local | directory without index.html | error | `"No index.html found in directory: {path}"` |
| local | `EACCES` | error | `"Permission denied: {path}"` |
| remote | unrecognized extension | `unsupported` | `"Unsupported content type for preview"` |

Remote HTTP errors (404, CORS, timeout) are **not** handled by core — they surface naturally inside
the rendered iframe.

## 11. Testing

### Core unit tests

`packages/core` — `previewMetaAppUri.test.ts`:
- localhost file path ⇒ `host='localhost'`, correct decoded `path`
- directory path with and without trailing slash
- single non-HTML file (`.pdf`)
- remote host ⇒ `host='example.com'`
- `localhost:3000` ⇒ remote branch (port present)
- Chinese/space path percent-decode
- empty host / non-absolute path ⇒ throws
- `normalizedUri` correctness

`packages/core` — `previewMetaAppResolver.test.ts`:
- localhost + injected factory ⇒ factory called, returned `localPreviewUrl` becomes `renderer.url`,
  renderer type matches `contentType`
- localhost + no factory ⇒ `unsupported`
- localhost + `enablePreviewMetaApp=false` ⇒ `unsupported`, factory **not** called
- remote `.html` ⇒ `renderer.url = https://{host}{path}`, type `html-iframe`
- remote `.pdf/.png/.mp4/.mp3` ⇒ correct renderer types
- remote unknown extension ⇒ `unsupported`
- remote branch invokes **no** host callback

### host-standalone tests

`packages/host-standalone` — `previewMetaAppLocal.test.ts`:
- file path ⇒ `artifactDir`=parent dir, `indexFile`=basename
- directory path ⇒ `artifactDir`=dir, `indexFile`=`index.html`
- directory without index.html ⇒ error
- non-existent path ⇒ error
- single PDF ⇒ `contentType='application/pdf'`
- real HTTP GET against `/api/browser/preview-assets/{previewId}/{asset}` confirms serving (mirrors
  existing preview-asset test pattern)

### Conformance

`packages/test-harness` — add `preview-metaapp://` to the scheme conformance checks: parsing,
`normalizedUri` stability, resolver output satisfies the `BrowserResolveResult` contract.

### Not tested

- Remote HTTP reachability (by design — §6, D6).
- Actual iframe rendering (UI untouched; covered by existing renderer tests).

## 12. Change Inventory

| Package | File | Change |
|---|---|---|
| core | `src/uri/browserUri.ts` | Add `'preview-metaapp'` to union + `SUPPORTED_SCHEMES` + parser branch delegating to new parser |
| core | `src/browser/types.ts` | Mirror `BrowserUriScheme`; add `ParsedPreviewMetaAppUri`, `PreviewMetaAppLocalResolve`, `PreviewMetaAppLocalResolveResult`; add `enablePreviewMetaApp?` to `BrowserBaseConfig` |
| core | `src/browser/previewMetaAppUri.ts` | **NEW** — URI parser |
| core | `src/browser/previewMetaAppResolver.ts` | **NEW** — resolver (local + remote branches) |
| core | `src/browser/browserResolver.ts` | Add `preview-metaapp` dispatch branch; add `previewMetaAppLocalResolve?` to input |
| core | `src/browser/config.ts` | Default `enablePreviewMetaApp: true`; env `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP` |
| core | `src/index.ts` | Export new parser + resolver + types |
| host-standalone | `src/adapter.ts` | Implement `previewMetaAppLocalResolve` factory (reuses `createPreviewSessionForArtifact`); widen `PreviewSession.source` to `'cache' \| 'local'` |
| host-standalone | resolver call site | Inject the factory |
| tests | `*.test.ts` (4 files) | **NEW** per §11 |
| docs | user docs | Protocol explanation + local-dev-only security note |

**UI: no changes. HTTP routes: no additions. On-disk cache: no additions.**

## 13. Open Questions

None. All decisions were resolved during the design session (§3).
