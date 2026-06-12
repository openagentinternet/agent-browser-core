# Agent Browser Core

Shared Agent Internet Browser core, UI, host contracts, and standalone web runtime.

This repository is the future home for the Browser product currently prototyped inside
Open Agent Connect. The goal is to maintain one Browser codebase that can run as:

- a standalone public website;
- an embedded Open Agent Connect Browser;
- an embedded IDBots Browser.

## Current Status

This repository contains the first pre-1.0 shared Browser package foundation:

- host-neutral Browser contract package;
- core resource, URI, and Bot homepage envelope package;
- shared Browser UI package with shell and renderer helpers;
- memory-backed standalone development host;
- fake-host and standalone conformance tests;
- ESM and CommonJS package outputs for host compatibility;
- package export, pack-content, release-version, and workflow verification tests;
- CI and tag-triggered release workflow scaffolding.

Full OAC package consumption, public Metalet wallet login, production standalone hosting, and IDBots
integration are planned as follow-up implementation phases.

## Reference Documents

- `docs/superpowers/specs/2026-06-08-agent-browser-core-independent-project-design.md`
- `docs/superpowers/plans/2026-06-08-agent-browser-core-bootstrap-extraction.md`

## Release Process

The next package release is `v0.2.0`. Package publishing is tag-triggered through
`.github/workflows/release.yml`.

Before pushing a release tag:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify:packages
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" node scripts/verify-release-version.mjs v0.2.0
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run publish:packages:dry-run
git diff --check
```

Do not run `npm publish` manually for normal releases. Configure npm trusted publishing for each
publishable package, merge the release-ready branch to `main`, then tag and push the version tag
from the same `main` commit:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## 0.1.0 To 0.2.0 Host Migration

Host adapters that only return `success` and `failed` command results remain valid.
Hosts may now return `waiting` and `manual_action_required` for long-running or human-confirmed actions.
UI hosts should consume `@openagentinternet/agent-browser-ui@0.2.0` only when they want the shared Browser shell.
OAC integration remains a separate pinned-package consumption step and should be implemented in a dedicated OAC worktree.

## Source Baseline

The initial extraction source is:

```text
/Users/tusm/Documents/MetaID_Projects/open-agent-connect
```

The Browser source snapshot is expected under OAC's `src/browser`, `src/core/browser`, and
`tests/browser` areas. Future implementation tasks should copy only stable Browser-owned logic
and keep OAC-specific adapters inside OAC unless a plan explicitly moves them.
