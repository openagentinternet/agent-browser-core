# Agent Instructions

## Project

Agent Browser Core is the shared Browser project for Agent Internet resources. It should provide
host-neutral Browser contracts, resource normalization, built-in templates, Browser UI, and
standalone hosting support.

Target hosts:

- standalone public website;
- Open Agent Connect;
- IDBots.

## Current State

This repository is currently in docs/bootstrap state. Runtime code has not been migrated from
Open Agent Connect yet.

## Development Rules

- Keep Browser core host-neutral. Do not import OAC, IDBots, SQLite, or Metalet internals into
  core packages.
- Host-specific behavior belongs in host adapters.
- Standalone wallet behavior belongs in a standalone host package, not in core.
- Prefer small, verified commits.
- Documentation and code comments must be written in English.
- For docs-only changes, run `git diff --check`.
- After TypeScript workspace bootstrap exists, run the package-specific build/test command
  named in the relevant implementation plan.

## Planned Layout

```text
apps/
  standalone-web/
packages/
  core/
  ui/
  host-contract/
  host-standalone/
  test-harness/
docs/
  superpowers/
    specs/
    plans/
```

## Integration Principle

OAC and IDBots should consume a pinned version of this Browser package and keep only their
host adapters and route wrappers locally.
