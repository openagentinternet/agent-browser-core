# preview-file:// Protocol Design

Local file preview for the Agent Browser: hosts can render files on the local
filesystem (markdown, text, code, csv, html, pdf, image, video, audio) inside a
Browser tab instead of falling through to the html-iframe renderer and being
served as `application/octet-stream` (a download dialog).

## Motivation

`preview-metaapp://` covers directory/app previews; single files of unknown type
ended up as octet-stream downloads. `preview-file://` gives each known file kind
the right renderer — a sanitized, scriptless in-Browser viewer for text-like
files, and the native renderer for media and documents.

## URI

```
preview-file://localhost/<absolute path>
```

- Only the literal host `localhost` is supported in this version. Any other
  host (including `localhost:3000`) is a parse error:
  `preview-file only supports localhost.`
- The path is percent-decoded, consecutive slashes are collapsed, and it must
  be absolute (`/` prefix).
- Aliases: `file:///abs/path` and `file://localhost/abs/path` input normalize to
  `preview-file://localhost/abs/path`. The Windows drive form keeps its
  leading slash (`file:///C:/x/y.md` -> `preview-file://localhost/C:/x/y.md`);
  the host strips the slash on win32.

## Classification

`classifyLocalFile(path)` (pure, exported from core) maps a path to
`{ kind, contentType, language?, viewer }`. Matching is case-insensitive on the
extension. `contentType` is the canonical MIME a host must use when serving the
raw file (text kinds carry `; charset=utf-8`). `viewer` is true for the kinds
rendered by the static viewer page.

| kind | extensions / filenames | renderer |
| --- | --- | --- |
| markdown | md markdown mdx mdown | file-viewer |
| text | txt text log; extensionless files; dotfiles (.gitignore, .env); README/LICENSE/CHANGELOG | file-viewer |
| code | js mjs cjs jsx, ts tsx mts cts, py rb go rs java kt swift c h cpp cc cxx hpp cs php sh bash zsh ps1 sql json jsonc yaml yml toml ini xml css scss less vue svelte lua r dart scala pl ex exs hs clj gradle proto graphql diff patch; Dockerfile, Makefile | file-viewer |
| csv | csv tsv | file-viewer |
| html | html htm xhtml | html-iframe |
| pdf | pdf | pdf |
| image | png jpg jpeg gif webp svg avif bmp ico apng | image |
| video | mp4 m4v webm mov ogv | video |
| audio | mp3 wav m4a aac flac ogg oga opus | audio |
| unsupported | everything else (docx xlsx pptx zip ...) | unsupported (error, no URL) |

`language` is the highlight.js language name for code files.

## Resolver contract

`resolveBrowserResource` dispatches `preview-file` to
`resolvePreviewFileResource({ parsed, config, previewFileLocalResolve })`, where
the host callback maps `{ path }` to `{ localPreviewUrl, contentType? }`.

- `enablePreviewFile !== true` -> `browser_resource_disabled`
  (`preview-file is disabled by this host.`); the callback is never invoked.
- No callback -> `browser_resource_unsupported`
  (`Local file preview is not supported by this host.`).
- Callback throws -> `browser_resolve_failed` with its message.
- Unsupported kind -> `unsupported` renderer with error
  `This file type cannot be previewed in the Browser.` and **no URL** — the
  Browser never offers a download link.
- Title is the file basename; owner is `{ kind: 'unknown', name: 'Local File',
  verificationState: 'unverified' }`; `source.resolver` is `preview-file`;
  actions: copy-uri only. `renderer.data` is `{ kind, language?, path }`.
- `resourceType`: pdf -> `pdf`, image -> `image`, else `document`.

## Viewer contract (file-viewer)

Text-like kinds render through the new `file-viewer` renderer: the host serves a
complete static HTML document produced by `renderLocalFileViewerHtml()`
(`@openagentinternet/agent-browser-renderers/local-file-viewer`) in a sandboxed iframe.

- The generated document contains **no `<script>`**. Markdown is rendered with
  GFM; raw HTML tokens are escaped; link hrefs are restricted to
  http/https/mailto/relative/#fragment and the Agent Internet schemes (metaid
  metaapp metafile map pin preview-file preview-metaapp); http(s) links get
  `target="_blank" rel="noopener noreferrer"`; relative image src is kept so the
  host can serve sibling files; fenced code is highlighted via highlight.js.
  CSV is parsed with proper quoted-field handling (tab delimiter for `.tsv`),
  first row as header, capped at 2000 rows.
- Route: the standalone host reuses `/api/browser/preview-assets/<id>/<file>`.
  When the session index file is requested with `?abc-viewer=1` and it
  classifies as a viewer kind, the host reads at most
  `LOCAL_FILE_VIEWER_MAX_BYTES` (2 MiB), utf8-decodes it, renders the viewer
  document and responds `text/html; charset=utf-8` with
  `Content-Security-Policy: default-src 'none'; img-src 'self' data: blob:
  http: https:; media-src 'self'; style-src 'unsafe-inline'`. Otherwise the raw
  file is served with `classifyLocalFile(...).contentType`.
- Theme: the Browser appends `abcTheme=<light|dark>`
  (`FILE_VIEWER_THEME_QUERY_PARAM`) to the frame URL; the renderer uses it for
  `<html data-theme>` and otherwise falls back to `prefers-color-scheme`.
- Sandbox: `allow-popups allow-popups-to-escape-sandbox` — never
  `allow-scripts` or `allow-same-origin`.
- Video/audio renderers with a direct `renderer.url` (no metafile `pinId`)
  emit a plain `<video controls>` / `<audio controls>` element.

## Security

- **Opt-in**: `enablePreviewFile` defaults to `false` in
  `createDefaultBrowserConfig()` and is a plain boolean passthrough in
  `resolveBrowserConfig` (no env var). Hosts must set it explicitly; the
  standalone CLI exposes `--enable-preview-file` /
  `BROWSER_ENABLE_PREVIEW_FILE=1`. On a public standalone deployment it must
  stay off — it reads arbitrary local paths.
- Localhost only: no remote fetching branch exists in this version.
- The viewer page is fully static (no scripts, CSP `default-src 'none'`), so
  rendered file content cannot execute anything in the Browser.
- Unsupported kinds never expose a URL, so nothing can be exfiltrated through a
  download link either.
