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

This repository now contains the TypeScript workspace for the shared Agent Browser packages.
Browser runtime code has been extracted into host-neutral core and UI packages, with standalone
host support for local/public Browser previews.

## Core Modules

- `packages/host-contract`: shared Browser host contracts, command result states, and
  adapter-facing types.
- `packages/core`: host-neutral Browser resource parsing, URI normalization, resource envelopes,
  Bot homepage templates, and Browser resource resolvers.
- `packages/ui`: shared Browser UI rendering, Browser shell/page generation, client hydration,
  menu models, and resource renderers.
- `packages/host-standalone`: standalone HTTP runtime, standalone host adapter, memory host, and
  MetaApp preview support.
- `packages/test-harness`: reusable conformance checks for host contract behavior.

## Main Workflows

- Build all packages with `npm run build`.
- Run the full verification suite with `npm test` or `npm run verify`.
- Run package and release checks with `npm run verify:packages` and
  `npm run verify:release-version`.
- Start the standalone runtime with `npm run dev:standalone -- --port 8787`.

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
- Template placeholder injection in `packages/ui/src/browser/page.ts` MUST use
  `String.prototype.split(placeholder).join(value)`, never `String.prototype.replace(placeholder, value)`.
  The inline client script (`app.ts`) contains regex literals with `$` (e.g. `replace(/\/+$/, '')`),
  which `replace` treats as special substitution patterns, silently truncating the emitted `<script>`
  and breaking all Browser UI (buttons/input/links stop responding with no console error).

## Commit and Merge Rules

- If you notice unfamiliar or unrelated file changes, continue working and stay focused on your
  own scoped edits unless the user asks you to inspect them.
- For each completed round that modifies existing code/docs or adds new code/docs, automatically
  stage and commit only the files you changed and understand.
- For deletion changes, wait until the user explicitly says "commit" before staging and
  committing those deletions.
- Prefer small, frequent commits. Commit each independent, verifiable unit of work as soon as it
  is complete.
- For every modification or newly added feature, create one commit.
- For every commit, use the `metabot-post-buzz` skill with the Bob identity (slug: `bob`) to post
  a detailed development-journal entry on-chain describing the change.
- Use commit messages in the format `<type>: <short description>`, where `<type>` is one of
  `feat`, `fix`, `refactor`, `docs`, or `chore`.
- Before committing, make sure the relevant local tests or verification steps pass for your
  changes.
- When merging completed work into `main`, use `git merge --no-ff` to preserve the feature merge
  point.

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require
constant clarification.

### 5. No Guessing, No Drive-By Fixes

**Verify boundaries before acting. Don't fix bugs you didn't create.**

- Never guess. When writing a plan or code, if anything is unclear or any scope boundary is
  ambiguous, either read the relevant code or discuss with the user; keep going until every
  boundary is clear.
- Don't opportunistically fix pre-existing bugs that fall outside the current task. Surface them
  to the user and let them decide; never silently change behavior you weren't asked to change.

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
