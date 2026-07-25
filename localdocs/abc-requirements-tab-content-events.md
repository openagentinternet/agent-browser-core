# ABC Feature Requests: Tab Content Extraction & Browser Events

Date: 2026-07-25 · From: IDBots team · To: agent-browser-core (ABC) team
Priority: R1/R2 block IDBots M1; R3 is nice-to-have

## Context

IDBots embeds ABC (`@openagentinternet/agent-browser-ui` v0.4.0) as a srcDoc iframe and
communicates with it through an injected bridge (fetch hijack of `/api/browser/*` → postMessage,
plus host → iframe control messages like `open-uri` / `tab-command`).

We are building an **AI co-work sidebar**: a local agent (running host-side, not inside ABC) that
drives the browser on behalf of the user — opening on-chain pages by natural language, reading the
current page, and preparing modified versions of MetaApps for preview and re-publication on-chain.

Tab management (`AgentBrowserTabs.openTab/closeTab/switchTab/getTabs`) and URI navigation already
work well through the existing bridge. What we are missing is **read access to tab content** and
**proactive state notifications**. Today the host can only poll `get-tabs`/`get-active-tab`, which
returns only `{id, uri, title, isActive}`.

## R1 — Tab content extraction API

**Use cases**

- The agent answers questions about the page the user is currently viewing
  ("这个作品是干什么的？", "总结一下这个主页").
- The agent prepares a modified copy of the current MetaApp. (For published MetaApps we can read
  source files from our local cache, but for dynamically rendered pages — bot homepages, map
  renderers — the rendered output is the only source of truth.)

**Requested API** (either shape works; we slightly prefer the postMessage contract for symmetry
with the existing bridge):

- Option A: extend the tabs runtime — `AgentBrowserTabs.getTabContent(tabId?)`
- Option B: host → iframe postMessage, e.g.
  `{ type: 'agent-browser:get-content', tabId? }` → response
  `{ type: 'agent-browser:get-content:response', requestId, result | error }`

**Suggested result shape**

```jsonc
{
  "tabId": "tab-3",
  "uri": "metaid://...",
  "title": "...",
  "contentType": "text/html",
  "text": "visible text content, whitespace-normalized",
  "html": "<rendered HTML, optional or truncated>",
  "truncated": false,
  "extractedAt": 1753400000000
}
```

**Notes / constraints**

- MetaApp pages render inside a nested sandboxed iframe (`browser-html-frame`) that is cross-origin
  to the host, so extraction must happen inside ABC's own context (ABC already holds
  `currentBrowserHtmlFrameWindow()`).
- Host-initiated reads only; no continuous streaming needed.
- Size limits / truncation flags are fine and appreciated — agent context windows are bounded.
- Text-first is acceptable: if full HTML is hard to extract safely, `text` alone already unblocks
  most agent use cases.

## R2 — Browser events push to host

**Use cases**

- Keep the agent's view of the browser fresh (we inject the active tab's uri/title into the agent
  context before every turn; today we must poll).
- UI reactions in the host sidebar (e.g. highlight which tab a conversation is about).

**Requested events** (postMessage to parent window, e.g.
`{ type: 'agent-browser:event', event: '<name>', payload: {...} }`):

| event | payload | when |
|---|---|---|
| `tab-opened` | `{tabId, uri?}` | new tab created |
| `tab-closed` | `{tabId}` | tab closed |
| `tab-activated` | `{tabId, uri?, title?}` | active tab changed |
| `navigation-committed` | `{tabId, uri, title?}` | a tab finished resolving/loading a URI |
| `title-updated` | `{tabId, title}` | document title changed after load |

Fire-and-forget is fine; no ack needed. Best-effort delivery is acceptable.

## R3 — (nice-to-have) Expose the current tab's resolve envelope

ABC internally keeps the full `BrowserResolveResult` per tab (`state.tabs[i].current`), including
`owner`, `proof`, `renderer`, `source`, and `actions`. Exposing it (e.g.
`AgentBrowserTabs.getTabInfo(tabId)` returning the envelope, or included in R1's result) would let
the host/agent show provenance ("这个作品的作者是谁，链上证明是什么") without re-resolving the URI
host-side.

## Out of scope (no ABC work needed)

- The AI/agent loop itself lives entirely host-side (IDBots cowork runtime + tools).
- `preview-metaapp://` local preview — already shipped in dd695b1, thank you! IDBots-side
  integration (implementing `previewMetaAppLocalResolve` over our local preview server) is on our
  roadmap for the next version bump.

## Contact

IDBots team — happy to test early builds behind a feature flag.
