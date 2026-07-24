# preview-metaapp:// Protocol

`preview-metaapp://{host}/{path}` previews a local or remote resource in the Agent Browser using
the same renderers as published MetaApps (HTML, PDF, image, video, audio). It is intended for
iterating on a MetaApp locally **before** publishing on-chain.

## URI format

```
preview-metaapp://{host}/{path}
```

- `{host}`:
  - `localhost` — read the local filesystem.
  - any other value — treated as an HTTPS origin (the browser connects directly to
    `https://{host}{path}`).
- `{path}`:
  - For `localhost`: an absolute filesystem path. A directory auto-resolves `index.html`
    (then `index.htm`). A single file is previewed directly.
  - For remote: a URL path.

## Examples

```
# Local directory
preview-metaapp://localhost/Users/tusm/Documents/MetaID_Projects/metaapp_buzz/app/

# Local single file
preview-metaapp://localhost/Users/tusm/report.pdf

# Remote
preview-metaapp://example.com/path/to/index.html
```

## How localhost preview works

The standalone host serves the file/directory through the same preview-asset pipeline used for
published ZIP MetaApps: relative resources resolve correctly, and HTML pages get a localStorage/
sessionStorage shim. Reload the page to pick up the latest file contents on disk.

## Security — local dev only

When `host` is `localhost`, the browser reads **any absolute path** the host process can read.
Do **not** expose a `preview-metaapp://localhost` endpoint to the public internet. To disable the
feature entirely on a host, set `METABOT_BROWSER_DISABLE_PREVIEW_METAAPP=1`.

Note: only the literal host `localhost` reads the local filesystem. `localhost:3000` (with a port)
and `127.0.0.1` are treated as remote HTTPS origins.
