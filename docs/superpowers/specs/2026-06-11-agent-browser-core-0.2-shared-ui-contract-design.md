# Agent Browser Core 0.2 Shared UI And Contract Design

Date: 2026-06-11
Status: Draft for user review

## Context

Agent Browser Core `v0.1.0` has been released and published. Open Agent Connect now consumes the
published `@openagentinternet/agent-browser-host-contract`, `@openagentinternet/agent-browser-core`,
and `@openagentinternet/agent-browser-test-harness` packages at `0.1.0`.

The `v0.1.0` release proved the package split, build outputs, release workflow, and basic host
adapter conformance path. OAC Phase 4 proved that a real host can pin the shared packages and
bridge its local Browser adapter to the published `BrowserHostAdapter` contract.

The current gap is product-level reuse. OAC still owns the richer Browser UI shell, route semantics,
settings modal, template selector, cache management UI, actor selector, owner toolbar, private-chat
modal, service-call modal, share flow, and non-terminal command-state handling. ABC `v0.1.0` has a
foundation UI package, but it is not feature-parity with the current OAC Browser.

ABC `0.2.x` should therefore make the shared Browser package useful as the product UI boundary, not
only as a core/contract foundation.

## Decision

Build ABC `0.2.x` around **shared UI and contract parity**:

- extend the published host contract so host actions can return OAC-style non-terminal states;
- move the reusable OAC Browser shell behavior into `@openagentinternet/agent-browser-ui`;
- keep OAC-specific storage, identity, private chat, service calls, and owner management inside OAC;
- keep standalone production wallet login out of this milestone except where the contract needs room
  for a future wallet host;
- use OAC only as a pinned-package integration consumer after ABC `0.2.x` has been developed and
  verified in the ABC repository.

This milestone should make it realistic for OAC to switch from its local Browser UI implementation to
the shared UI package in a follow-up OAC integration branch.

## Goals

- Make `@openagentinternet/agent-browser-host-contract` represent real Browser command states:
  `success`, `failed`, `waiting`, and `manual_action_required`.
- Preserve simple success/failure ergonomics for hosts that do not need non-terminal states.
- Make `@openagentinternet/agent-browser-ui` own the reusable Browser shell:
  address bar, navigation controls, resource chip, actor chip, menu, owner toolbar, drawer,
  inspector, status strip, settings modal, template selector, cache controls, trusted-action modals,
  and Bot homepage rendering.
- Keep the UI package host-neutral by talking only to a `BrowserHostClient` interface and typed
  Browser contracts.
- Add shared tests for command-state handling, trusted-action flow, settings/cache UI behavior, and
  renderer safety.
- Keep the standalone development host current enough to exercise the shared UI and contract states.
- Prepare a clean OAC upgrade path from `0.1.0` to `0.2.x`.

## Non-Goals

- Do not implement the public standalone production website in this milestone.
- Do not implement Metalet wallet connect, wallet signing, or wallet payment flows yet.
- Do not implement user-uploaded templates or template marketplace behavior.
- Do not move OAC profile storage, OAC config files, OAC MetaApp artifact cache, OAC private chat,
  OAC service-call execution, or OAC Bot management routes into ABC.
- Do not require IDBots integration in this milestone.
- Do not make OAC automatically track `latest`; hosts must continue pinning exact ABC versions.

## Current Baseline

ABC currently contains:

- `packages/host-contract` with success/failed command result types;
- `packages/core` with URI parsing, resource normalization, Bot homepage envelope helpers, and built-in
  template registry;
- `packages/ui` with a foundational static Browser shell and renderer helpers;
- `packages/host-standalone` with a memory-backed development host and simple HTTP server;
- `packages/test-harness` with basic adapter conformance checks;
- release/package verification for `v0.1.0`.

OAC currently contains:

- pinned ABC `0.1.0` dependencies for host contract, core, and test harness;
- local Browser UI under `src/browser/`;
- local OAC Browser adapter under `src/daemon/browser/oacBrowserHostAdapter.ts`;
- bridge adapter under `src/daemon/browser/oacBrowserCoreBridge.ts`;
- tests proving the OAC adapter satisfies the published `0.1.0` conformance harness;
- additional recent Browser-adjacent UI work in OAC main.

The OAC work proves the desired shared package boundary, but the implementation still duplicates UI
logic in OAC.

## Host Contract Changes

`BrowserCommandResult<T>` should become a four-state contract:

```ts
export type BrowserCommandState = 'success' | 'failed' | 'waiting' | 'manual_action_required';

export type BrowserCommandResult<T> =
  | BrowserCommandSuccess<T>
  | BrowserCommandFailure
  | BrowserCommandWaiting
  | BrowserCommandManualActionRequired;
```

The non-terminal result shapes should be host-neutral:

```ts
export interface BrowserCommandWaiting {
  ok: false;
  state: 'waiting';
  code: string;
  message: string;
  pollAfterMs?: number;
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export interface BrowserCommandManualActionRequired {
  ok: false;
  state: 'manual_action_required';
  code: string;
  message: string;
  action?: BrowserFollowUpAction;
  data?: Record<string, unknown>;
}

export interface BrowserFollowUpAction {
  label: string;
  href?: string;
  route?: string;
  pollUrl?: string;
}
```

The contract should keep helper constructors:

- `browserSuccess(data)`
- `browserFailure(code, message, options?)`
- `browserWaiting(code, message, options?)`
- `browserManualActionRequired(code, message, options?)`

The command-state change applies to every adapter method, but the primary consumer in `0.2.x` is
`runTrustedAction`. The UI must handle all four states without host-specific branching.

## Shared UI Scope

The `@openagentinternet/agent-browser-ui` package should own reusable product UI behavior. It should
not be a thin static stub. It should be the package that OAC and standalone can reasonably mount
or render.

Required shared UI capabilities:

- address form and navigation controls;
- resource chip with owner/avatar summary;
- actor chip and actor selector;
- menu model with settings, template, and cache entries;
- owner toolbar driven by `ownerAffinity` or host-provided owner actions;
- drawer for current/default/recent resource shortcuts;
- inspector panel for proof, source, renderer, sections, and raw resource summary;
- status strip for command state, proof state, renderer, and txid/pin context;
- settings modal with base URL fields when the host exposes them;
- template selector with built-in template previews;
- cache panel with all-cache and current-resource cache clear actions;
- private-chat modal that collects message content and calls `runTrustedAction`;
- service-call modal that collects user task text and calls `runTrustedAction`;
- share modal that can copy Browser URLs and resource URIs;
- Bot homepage renderer using normalized `BrowserResourceEnvelope.sections`;
- URL renderer safety for iframe/image/video/pdf resources.

The UI package should expose stable entry points instead of forcing hosts to copy generated HTML:

```ts
export interface BrowserHostClient {
  getRuntime(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserRuntimeSnapshot>>;
  resolveResource(input: BrowserResolveInput): Promise<BrowserCommandResult<BrowserResourceEnvelope>>;
  getSettings(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  updateSettings(input: BrowserSettingsUpdateInput): Promise<BrowserCommandResult<BrowserSettingsSnapshot>>;
  getCache(input?: BrowserActorInput): Promise<BrowserCommandResult<BrowserCacheSnapshot>>;
  clearCache(input: BrowserCacheClearInput): Promise<BrowserCommandResult<BrowserCacheClearResult>>;
  runTrustedAction(input: BrowserTrustedActionInput): Promise<BrowserCommandResult<BrowserTrustedActionResult>>;
}
```

The concrete rendering API can be implemented as static HTML plus bundled script in this milestone,
as long as the public API is host-neutral and can later be backed by a browser bundler.

## Host-Neutral Boundary

ABC UI and core packages may depend on:

- Browser host contract types;
- normalized resource envelopes;
- built-in template definitions;
- safe URL and renderer utilities;
- a host client interface.

ABC UI and core packages must not depend on:

- OAC profile homes;
- OAC daemon internals;
- OAC command result implementation;
- IDBots SQLite or account internals;
- Metalet provider internals;
- Node-only filesystem or daemon behavior except in server-specific packages.

Host-specific behavior remains in host adapters:

- OAC maps local MetaBot profiles to actors.
- OAC persists settings in profile config.
- OAC owns MetaApp artifact cache operations.
- OAC runs private chat and service-call trusted actions.
- OAC maps owner actions to local Bot management routes.
- Future standalone maps wallet session to an actor and wallet signing/payment to trusted actions.
- Future IDBots maps its account or agent model to an actor.

## OAC Integration Requirements

OAC changes should not be made in the primary OAC checkout while other OAC work is active.

Any development session that modifies OAC for ABC `0.2.x` must:

- create a fresh OAC git worktree;
- use a branch dedicated to that worktree, such as `codex/abc-0.2-oac-ui-consumption`;
- use a worktree directory name derived from the same branch, such as
  `/Users/tusm/Documents/MetaID_Projects/open-agent-connect-worktrees/codex-abc-0.2-oac-ui-consumption`;
- keep all OAC changes out of `/Users/tusm/Documents/MetaID_Projects/open-agent-connect` unless the
  user explicitly asks to merge;
- pin the ABC version exactly when consuming a published `0.2.x` package;
- run focused Browser integration tests in the OAC worktree before requesting merge.

The expected OAC follow-up after ABC `0.2.x` is:

- bump ABC dependencies from `0.1.0` to `0.2.x`;
- install `@openagentinternet/agent-browser-ui` only after it reaches parity for the target UI;
- replace local OAC Browser UI entry points with shared UI package imports;
- keep `src/daemon/browser/oacBrowserHostAdapter.ts` and host-specific route wrappers in OAC;
- remove bridge-only compatibility code that becomes unnecessary after the contract supports
  non-terminal states directly;
- keep OAC route paths stable.

## Compatibility Policy

ABC `0.2.x` may introduce contract changes from `0.1.0`, but they must be explicit and testable.

Compatibility requirements:

- publish all packages with the same `0.2.x` version;
- keep CJS and ESM package outputs;
- update conformance tests to cover success, failed, waiting, and manual-action results;
- keep simple hosts valid if they only ever return success or failed results;
- make OAC detect contract drift through test-harness checks before it upgrades;
- document any `0.1.0` to `0.2.x` migration steps.

The release should be a pre-1.0 semver minor. A breaking contract improvement is acceptable for
`0.2.0` because the published package is pre-1.0 and host consumers pin exact versions.

## Testing And Verification

ABC verification should cover:

- host-contract type and helper behavior for all command states;
- test-harness conformance across success, failed, waiting, and manual-action adapter outputs;
- UI renderer safety for blocked URLs and allowed local/http/https URLs;
- UI state transitions for resolve success, resolve failure, trusted-action waiting, trusted-action
  manual action, settings update, template selection, cache clear, and actor selection;
- package pack contents and export maps;
- standalone development host smoke using the shared UI package.

OAC verification should happen only in the separate OAC worktree and should cover:

- dependency bump and package import smoke;
- OAC adapter conformance against the `0.2.x` harness;
- existing OAC Browser route behavior;
- `/browser` and `/ui/browser` rendering the shared UI shell;
- OAC private-chat, service-call, owner action, settings, template, and cache tests;
- `git diff --check`.

## Release And Consumption Flow

The intended sequence is:

1. Implement ABC `0.2.x` on an ABC feature branch.
2. Verify ABC build, tests, package contents, and standalone smoke.
3. Merge ABC `0.2.x` work into ABC `main`.
4. Publish an ABC `0.2.x` pre-1.0 package release through the existing release workflow.
5. Start a separate OAC worktree and branch for package consumption.
6. Bump OAC to the exact published ABC `0.2.x` packages.
7. Switch OAC Browser UI entry points to shared UI package imports only if parity checks pass.
8. Run focused OAC Browser verification and review.
9. Merge OAC work back only after the user approves.

ABC implementation should not edit OAC directly. OAC integration should not edit ABC directly.

## Risks

- The OAC Browser UI is currently a large script. Porting it blindly would move complexity without
  improving boundaries. The implementation plan should split shared UI into focused modules.
- Contract non-terminal states may need HTTP status mapping. The shared standalone server and OAC
  route wrappers should preserve host-appropriate status behavior.
- Template preview assets differ between Node package and browser environments. The UI package should
  expose browser-safe preview URLs or let hosts provide a preview resolver.
- The shared UI could accidentally absorb OAC-specific Chinese copy or route names. Runtime labels and
  host-provided actions should carry host-specific text where necessary.
- OAC may continue changing while ABC `0.2.x` is being implemented. The OAC consumption branch should
  be based on current OAC `main` in its own worktree when integration starts.

## Exit Criteria

ABC `0.2.x` is ready when:

- the host contract supports `success`, `failed`, `waiting`, and `manual_action_required`;
- the test harness verifies non-terminal command states;
- the shared UI package contains the reusable Browser shell and action/modal behavior needed by OAC;
- the standalone development host serves the shared UI using the updated contract;
- package verification proves all declared exports are present;
- release documentation describes the `0.1.0` to `0.2.x` migration;
- a follow-up OAC worktree can consume `0.2.x` without copying ABC source.

## Follow-Up After 0.2.x

After OAC successfully consumes ABC `0.2.x`, the next ABC milestone should be standalone production
hosting:

- Metalet wallet connect/disconnect;
- wallet actor runtime;
- wallet signing and payment trusted actions;
- hosted settings and cache strategy;
- production resolver and MetaApp preview policy;
- CSP and sandbox hardening for public deployment.
