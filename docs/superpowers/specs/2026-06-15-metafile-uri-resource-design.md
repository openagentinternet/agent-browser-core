# Metafile URI Resource Design

## Goal

Add host-neutral `metafile://` URI support to the Browser resolver so a user can open
`metafile://{pinId}` or `metafile://{pinId}.{ext}` directly.

## Boundaries

- `metafile://` is a generic file resource, not a MetaApp protocol resource.
- MetaApp ZIP package preview remains scoped to `metaapp://` resolution.
- The optional extension is input compatibility only. Resolver lookup and content URLs use the
  canonical pin id without the extension.
- ManAPI pin metadata is the source of truth for content type. For `/file/index` pins, the actual
  file type is `contentSummary.dataType`; the pin-level content type describes the index document.
  Input extension is only a fallback when metadata does not expose a type.

## Resolve Flow

1. Parse `metafile://` with the existing Browser URI parser.
2. Normalize the metafile id by stripping one trailing extension after the `i0` pin suffix.
3. Fetch pin metadata from `{manApiBaseUrl}/pin/{pinId}`.
4. Read content type from `contentSummary.dataType`, then `contentTypeDetect`, then `contentType`,
   then path or input extension.
5. Build the direct content URL as `{metafileContentBaseUrl}/{pinId}`.
6. Return a `BrowserResolveResult` with a renderer selected by content type.

## Renderer Mapping

- `text/html` and `application/xhtml+xml`: `html-iframe`.
- `application/pdf`: `pdf`.
- `image/*`: `image`.
- `video/*`: `video`.
- Other types, including ZIP: `unsupported` with a safe download URL.

HTML files continue to use the existing iframe sandbox policy.

## Verification

- Unit tests cover PDF, video, extension normalization, extension/type conflict, ZIP fallback, URI
  parsing, deep-link routing, and unsupported download link rendering.
- Local smoke tests use the provided PDF and MP4 metafile URIs against the standalone Browser API
  and page renderer.
