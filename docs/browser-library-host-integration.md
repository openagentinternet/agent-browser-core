# Browser Library Host Integration

This document defines how a downstream host reads the Agent Browser Core (ABC)
Library: bookmarks, recent Browser history, recent Bots, and recent URIs.

Availability: this API was added after `0.4.1`. A host pinned to `0.4.1` cannot
use it; pin the first ABC package release that includes `AgentBrowserLibrary`.

## Contract boundary

- ABC owns the Library data and persists it in the Browser page's
  `localStorage`. The host reads snapshots; it does not own or synchronize the
  underlying storage.
- The API is client-side. It does not add an HTTP route or extend
  `BrowserHostAdapter`.
- The API is read-only. Bookmark creation/removal remains a user action in ABC's
  Browser UI.
- Tab state and Library state have different lifetimes. Tabs reset on Browser
  reload, while Library data survives when the Browser origin's `localStorage`
  survives.
- History is an MRU summary of at most 20 unique supported ABC URIs, not an
  unlimited event log. Repeated visits update timestamps and `visitCount`
  instead of creating duplicate rows.

ABC records these URI schemes in history: `metaid`, `metaapp`, `metafile`,
`map`, and `pin`.

## Access modes

The same data is available through two host integration modes:

1. Same-origin or same-realm hosts call `window.AgentBrowserLibrary` directly.
2. Sandboxed/cross-origin iframe hosts use correlated `postMessage`
   request/response messages.

The message bridge accepts Library reads only when `event.source ===
window.parent`. A MetaApp or any unrelated frame cannot read Browser history or
bookmarks through this channel.

## Data shapes

All timestamps are Unix time in milliseconds. A timestamp is `null` when an
entry was stored by an older ABC version that did not record that field.
Owner, proof, and source are compact summaries captured during resolution;
ABC deliberately excludes the full resolve envelope and `source.raw` from
Library persistence.

```ts
interface BrowserLibraryOwner {
  kind: string;
  globalMetaId: string | null;
  metaid: string | null;
  address: string | null;
  name: string;
  label: string | null;
  avatar: string | null;
  online: boolean | null;
  verificationState: string;
}

interface BrowserLibraryProof {
  txid: string | null;
  pinId: string | null;
  protocolPath: string | null;
  contentHash: string | null;
  publisherGlobalMetaId: string | null;
  explorerUrl: string | null;
  verificationState: string;
}

interface BrowserLibrarySource {
  resolver: string;
  url: string | null;
  fetchedAt: number | null;
  indexedAt: number | null;
  stale: boolean | null;
  schemaVersion: string | null;
}

interface BrowserLibraryVisit {
  /** Normalized ABC URI; use this as the stable resource key. */
  uri: string;
  title: string;
  resourceType: string;
  /** URI scheme without ://, for example metaid or metaapp. */
  scheme: string;
  firstVisitedAt: number | null;
  lastVisitedAt: number | null;
  /** Known visits while this URI remains in the retained history. */
  visitCount: number;
  owner: BrowserLibraryOwner | null;
  proof: BrowserLibraryProof | null;
  source: BrowserLibrarySource | null;
}

interface BrowserLibraryBookmark {
  uri: string;
  title: string;
  resourceType: string;
  scheme: string;
  createdAt: number | null;
  /** Joined from retained history when the bookmarked URI was visited. */
  firstVisitedAt: number | null;
  lastVisitedAt: number | null;
  visitCount: number;
}

interface BrowserLibrarySnapshot {
  schemaVersion: 1;
  /** Time this read-only snapshot was created, not the last mutation time. */
  capturedAt: number;
  bookmarks: BrowserLibraryBookmark[];
  /** Newest first; contains every retained history item. */
  history: BrowserLibraryVisit[];
  /** Newest unique Bot visits, five by default. */
  recentBots: BrowserLibraryVisit[];
  /** Newest unique URI visits, ten by default. */
  recentUris: BrowserLibraryVisit[];
  counts: {
    bookmarks: number;
    history: number;
    /** Sum of visitCount across retained history entries. */
    totalKnownVisits: number;
  };
  retention: {
    historyMax: 20;
    defaultRecentBotLimit: 5;
    defaultRecentUriLimit: 10;
  };
}
```

Snapshots are detached objects. Mutating a returned array or item does not
change ABC state.

## Direct global API

ABC exposes this namespace after the Browser page script initializes:

```ts
interface AgentBrowserLibraryApi {
  getSnapshot(): BrowserLibrarySnapshot;
  getBookmarks(limit?: number): BrowserLibraryBookmark[];
  getHistory(limit?: number): BrowserLibraryVisit[];
  getRecentBots(limit?: number): BrowserLibraryVisit[];
  getRecentUris(limit?: number): BrowserLibraryVisit[];
}

declare global {
  interface Window {
    AgentBrowserLibrary: AgentBrowserLibraryApi;
  }
}
```

TypeScript hosts can import the contract instead of redefining it:

```ts
import {
  BROWSER_LIBRARY_REQUEST_TYPES,
  type AgentBrowserLibraryApi,
  type BrowserLibraryHostEvent,
  type BrowserLibrarySnapshot,
} from '@openagentinternet/agent-browser-ui/browser';
```

`limit` is optional and non-negative. Invalid or negative values fall back to
the method default; `0` returns an empty array. Limits cannot exceed the data
currently retained by ABC.

Example:

```js
const library = browserFrame.contentWindow.AgentBrowserLibrary;
const snapshot = library.getSnapshot();

hostAgentContext.browser = {
  bookmarks: snapshot.bookmarks,
  recentBots: snapshot.recentBots,
  recentUris: snapshot.recentUris,
};
```

Use `getSnapshot()` when the host needs a consistent bundle. Use a narrower
method when only one collection is needed.

## Cross-origin message bridge

Each read echoes the host's `requestId` and responds to `window.parent`.

| Request `type` | Payload | Response `type` | Result |
| --- | --- | --- | --- |
| `agent-browser:get-library` | `{ requestId }` | `agent-browser:get-library:response` | `BrowserLibrarySnapshot` |
| `agent-browser:get-bookmarks` | `{ requestId, limit? }` | `agent-browser:get-bookmarks:response` | `BrowserLibraryBookmark[]` |
| `agent-browser:get-history` | `{ requestId, limit? }` | `agent-browser:get-history:response` | `BrowserLibraryVisit[]` |
| `agent-browser:get-recent-bots` | `{ requestId, limit? }` | `agent-browser:get-recent-bots:response` | `BrowserLibraryVisit[]` |
| `agent-browser:get-recent-uris` | `{ requestId, limit? }` | `agent-browser:get-recent-uris:response` | `BrowserLibraryVisit[]` |

The success envelope is:

```ts
{
  type: '<request-type>:response',
  version: 1,
  requestId: string,
  ok: true,
  result: unknown
}
```

The following helper is sufficient for a typical iframe host:

```js
let nextLibraryRequestId = 0;

function readBrowserLibrary(iframe, browserOrigin, type, limit) {
  return new Promise((resolve, reject) => {
    const requestId = `browser-library-${++nextLibraryRequestId}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 5000);

    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      if (event.origin !== browserOrigin) return;
      const message = event.data;
      if (message?.type !== `${type}:response`) return;
      if (message.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error?.message || 'Browser Library read failed'));
    }

    window.addEventListener('message', onMessage);
    iframe.contentWindow.postMessage(
      { type, requestId, ...(limit === undefined ? {} : { limit }) },
      browserOrigin
    );
  });
}

const snapshot = await readBrowserLibrary(
  browserIframe,
  new URL(browserIframe.src).origin,
  'agent-browser:get-library'
);
```

Prefer the real Browser origin as the `postMessage` target and validate both
`event.source` and `event.origin` before trusting a response.

## Change events

ABC uses the existing host event envelope:

```ts
{
  type: 'agent-browser:event',
  version: 1,
  event: 'history-changed' | 'bookmarks-changed',
  payload: object
}
```

Events are best-effort notifications, not an authoritative replicated log.
Read `getSnapshot()` after an event when the host needs a fully consistent
view.

| `event` | `payload.reason` | Additional payload |
| --- | --- | --- |
| `history-changed` | `visit-recorded` | `{ item: BrowserLibraryVisit, total }` |
| `bookmarks-changed` | `bookmark-added` | `{ item: BrowserLibraryBookmark, total }` |
| `bookmarks-changed` | `bookmark-removed` | `{ item: BrowserLibraryBookmark, total }` |

Example host listener:

```js
window.addEventListener('message', async (event) => {
  if (event.source !== browserIframe.contentWindow) return;
  if (event.origin !== browserOrigin) return;
  const message = event.data;
  if (message?.type !== 'agent-browser:event') return;
  if (message.event !== 'history-changed' && message.event !== 'bookmarks-changed') return;

  hostLibraryCache = await readBrowserLibrary(
    browserIframe,
    browserOrigin,
    'agent-browser:get-library'
  );
  refreshHostBrowserContext(hostLibraryCache);
});
```

## Downstream integration checklist

- Pin an ABC version that includes `AgentBrowserLibrary`; do not assume `0.4.1`
  contains this contract.
- Wait until the Browser page has loaded before using the direct global or
  sending bridge messages.
- Prefer `getSnapshot()` for initial hydration, then refresh after
  `history-changed` or `bookmarks-changed`.
- Treat `uri` as the resource key. Treat titles and `resourceType` as display
  metadata that may change after a later visit.
- Expect legacy `createdAt`, `firstVisitedAt`, and `lastVisitedAt` values to be
  `null`; legacy `owner`, `proof`, and `source` summaries may also be `null`.
- Do not treat the 20 retained items as a complete lifetime browsing log.
- Keep user history/bookmarks private to the host feature that needs them. Do
  not publish, upload, or place them in an agent prompt without the host's
  applicable user-consent and privacy policy.
- Do not add a parallel host database unless the product explicitly needs
  cross-device synchronization; ABC remains the source of truth for this API.

## Related contracts

- Tabs, page content, and tab lifecycle events:
  `docs/browser-tabs-host-integration.md`
- Theme synchronization: `docs/browser-theme-host-integration.md`
- MetaApp-to-host capabilities (a separate, untrusted-content bridge):
  `docs/metaapp-host-bridge-v1-host-requirements.md`
