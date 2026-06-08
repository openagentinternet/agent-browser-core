# Agent Browser Core

Shared Agent Internet Browser core, UI, host contracts, and standalone web runtime.

This repository is the future home for the Browser product currently prototyped inside
Open Agent Connect. The goal is to maintain one Browser codebase that can run as:

- a standalone public website;
- an embedded Open Agent Connect Browser;
- an embedded IDBots Browser.

## Current Status

This repository has been created for planning and extraction work. The first committed artifacts
are the independent-project architecture spec and the bootstrap/extraction implementation plan.

No Browser runtime code has been migrated yet.

## Reference Documents

- `docs/superpowers/specs/2026-06-08-agent-browser-core-independent-project-design.md`
- `docs/superpowers/plans/2026-06-08-agent-browser-core-bootstrap-extraction.md`

## Source Baseline

The initial extraction source is:

```text
/Users/tusm/Documents/MetaID_Projects/open-agent-connect
```

The Browser source snapshot is expected under OAC's `src/browser`, `src/core/browser`, and
`tests/browser` areas. Future implementation tasks should copy only stable Browser-owned logic
and keep OAC-specific adapters inside OAC unless a plan explicitly moves them.
