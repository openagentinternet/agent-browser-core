# Agent Browser Core OAC Browser Parity Extraction Design

## Status

Drafted for the ABC `0.3.x` milestone.

## Problem

Agent Browser Core was created so Browser features can be developed once and then consumed by
standalone, Open Agent Connect, and IDBots. The current ABC `0.2.x` branch achieved useful package,
contract, and standalone-host foundations, but its shared UI is a low-fidelity development preview.
It is not a migrated version of the mature OAC Browser UI and must not replace the current OAC
Browser experience.

The immediate product need is a visible, usable Browser baseline in ABC so future Browser work can
happen in one repository. The fastest correct path is not to rebuild the Browser from scratch. The
source of truth for this milestone is the existing OAC Browser module.

## Current Code Observations

The mature Browser implementation currently lives in OAC:

- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/index.html`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/app.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/menuModel.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/page.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/http.ts`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/browser/standalone/*`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/core/browser/*`
- `/Users/tusm/Documents/MetaID_Projects/open-agent-connect/src/daemon/browser/oacBrowserHostAdapter.ts`

OAC already has the important seams:

- a Browser page renderer that serves a template HTML file and generated client script;
- host API routes under `/api/browser/*`;
- runtime actor metadata for the top-right "Using" area;
- settings, template selection, cache, resolver, and trusted-action endpoints;
- a standalone Browser server under `src/browser/standalone/*`;
- tests for page layout, renderers, settings state, Browser routes, standalone server, and module
  boundaries.

ABC currently has useful foundations:

- `packages/host-contract` defines host-neutral runtime/action/result primitives;
- `packages/core` has URI, resource, section, and Bot homepage template helpers;
- `packages/host-standalone` can serve a basic memory-backed Browser preview;
- `packages/test-harness` has conformance helpers;
- package build and release plumbing exists.

The missing piece is parity extraction: ABC must take OAC's mature Browser implementation as the
baseline instead of evolving the current low-fidelity ABC UI.

## Product Principle

ABC owns the Browser product. OAC, IDBots, and standalone are hosts.

```text
ABC        -> Browser shell, rendering, templates, resource contract, shared UI behavior
OAC        -> local Bot actors, OAC storage, OAC cache, OAC trusted actions, daemon routes
IDBots     -> IDBots account actors, IDBots storage, IDBots trusted actions
Standalone -> mock or wallet actors, hosted storage, public-site wallet behavior
```

For `0.3.x`, standalone may use a mock wallet actor. It only needs to make the mature Browser UI
visible and useful for fast development feedback. Production Metalet login is not part of this
milestone.

## Goals

- Move the mature OAC Browser UI into ABC with minimal behavioral drift.
- Make ABC standalone render a Browser experience that is visually close to the current OAC Browser.
- Keep the top-right actor area host-driven through the host adapter contract.
- Preserve OAC's current Browser behavior until OAC explicitly consumes a parity-verified ABC build.
- Allow future Browser UI and Bot homepage template work to happen in ABC first.
- Keep ABC host-neutral: no imports from OAC, IDBots, SQLite, or Metalet internals in core packages.

## Non-Goals

- Do not redesign the Browser UI.
- Do not replace OAC Browser with the current ABC `0.2.x` shared UI.
- Do not implement production Metalet wallet login.
- Do not implement IDBots integration.
- Do not remove OAC's Browser code until OAC has consumed and verified the parity ABC package.
- Do not solve all package API cleanup before the copied Browser is visible and usable.

## Recommended Approach

Use copy-first extraction, then adapter cleanup.

The implementation should initially copy the mature OAC Browser module into ABC and adjust only the
minimum required imports and package boundaries. It should not translate the OAC UI into the current
ABC `0.2.x` low-fidelity UI structure. The OAC page, CSS, script, renderer logic, and tests are the
parity baseline.

After the copied Browser runs in ABC standalone, the code can be split and cleaned only where doing
so is required for package boundaries or host neutrality.

## Target Package Shape

### `@openagentinternet/agent-browser-core`

Owns shared resource parsing, Browser config, Bot homepage resolution, MetaApp resolution, built-in
template metadata, and shape normalization needed by the mature Browser UI.

The OAC `src/core/browser/*` implementation should be ported here, with OAC config/storage imports
replaced by host-neutral types.

### `@openagentinternet/agent-browser-ui`

Owns the mature Browser page and client behavior.

It should expose at least:

- `buildBrowserPageDefinition()`;
- `renderBrowserPageHtml()`;
- Browser menu/template metadata;
- any renderer helpers required by tests.

The implementation should be based on OAC `src/browser/app.ts`, `src/browser/index.html`,
`src/browser/menuModel.ts`, and `src/browser/page.ts`.

### `@openagentinternet/agent-browser-host-contract`

Owns the host adapter contract used by standalone, OAC, and IDBots.

The top-right actor area must remain contract-driven through:

- `getRuntime()`;
- `actors`;
- `defaultActor`;
- `labels.actorChip`;
- `features`;
- `runTrustedAction()`.

If the current ABC `0.2.x` `BrowserResourceEnvelope` conflicts with the copied OAC Browser UI
contract, the mature OAC Browser shape wins for `0.3.x`. ABC `0.2.x` has not been consumed by OAC
as a shared UI baseline, so preserving a weak preview contract is less important than restoring the
correct product baseline.

### `@openagentinternet/agent-browser-host-standalone`

Owns the development standalone host and server.

For `0.3.x`, it should:

- serve the mature Browser page from `@openagentinternet/agent-browser-ui`;
- expose `/api/browser/runtime`, `/api/browser/resolve`, `/api/browser/settings`,
  `/api/browser/cache`, and `/api/browser/actions`;
- provide a mock `Standalone Wallet` actor for the top-right actor UI;
- support template settings and cache controls in memory;
- resolve Bot homepages and MetaApps enough to exercise rendering;
- provide a useful default route or fixture so opening `/browser` is not an empty shell.

Production standalone wallet login remains a later milestone.

### `@openagentinternet/agent-browser-test-harness`

Owns contract and host conformance checks. It should verify that a host provides the actor/runtime,
settings, cache, resolver, trusted-action, and command-state behavior required by the mature Browser
UI.

## Data Contract Direction

OAC's current Browser UI expects a resource model with:

- `uri`;
- `normalizedUri`;
- `resourceType`;
- `title`;
- `owner`;
- `renderer`;
- `status`;
- `proof`;
- `source`;
- `actions`.

That model should become the ABC `0.3.x` UI resource contract. The implementation may keep ABC
`0.2.x` helper names as compatibility aliases, but the UI should not be forced through a weaker
new envelope that causes renderer rewrites.

## Host Adapter Direction

The top-right actor UI must be host-neutral:

- OAC maps local Bot profiles into `oac-bot` actors.
- Standalone maps the mock wallet into a `wallet` actor for now.
- IDBots later maps SQLite/account users into `idbots-agent` or `idbots-account` actors.

The UI does not know where actors come from. It only calls the host contract.

Trusted actions remain host-owned:

- OAC implements private chat, service call, profile edit, chat configuration, and message view.
- Standalone can return explicit unsupported/manual/waiting results for unsupported actions.
- IDBots later implements its own actions.

## Standalone Acceptance

Opening ABC standalone `/browser` must look and behave close to the current OAC Browser, except for
the actor source:

- title bar and Browser chrome are present;
- address bar, drawer, menu, status strip, and inspector are styled;
- the top-right chip shows `Wallet: Standalone Wallet` or equivalent standalone wording;
- Bot homepage `document` and `compact-list` templates work;
- MetaApp iframe/image/pdf/video renderers work;
- template settings can switch the active Bot homepage template;
- Browser cache settings are visible and non-broken;
- unsupported standalone trusted actions fail visibly rather than silently.

Playwright or Browser screenshots are required for human acceptance. Node tests alone are not
sufficient for this milestone.

## OAC Consumption Gate

OAC must not consume `@openagentinternet/agent-browser-ui` until ABC standalone passes parity
acceptance.

The later OAC consumption plan should:

- pin the verified ABC `0.3.x` package versions;
- replace local OAC Browser page rendering with ABC UI rendering;
- keep OAC host adapter behavior in OAC;
- preserve OAC's current Browser route URLs;
- run OAC Browser tests and screenshot checks before merge.

## Risks

- Copying OAC files can temporarily duplicate code between OAC and ABC. This is acceptable because
  the goal is to move the source of truth, not maintain both permanently.
- The current ABC `0.2.x` resource envelope may be partially superseded. This is acceptable because
  ABC `0.2.x` shared UI is not the desired product baseline.
- MetaApp preview serving may depend on OAC cache helpers. The standalone host should port only the
  host-neutral parts needed to serve preview assets.
- Visual parity requires real browser checks. Static tests can miss the exact failure that triggered
  this correction.

## Success Criteria

- ABC standalone Browser is visibly mature enough to serve as the development baseline.
- ABC standalone uses mock actor data only for the host/account area, not for the entire UI.
- The mature OAC Browser UI behavior is preserved in ABC tests.
- No ABC core package imports OAC, IDBots, SQLite, or Metalet internals.
- OAC remains unchanged until a separate OAC consumption plan.
- Future Browser feature work can be planned against ABC rather than OAC-local Browser files.
