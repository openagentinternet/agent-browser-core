# ENS Name Resolution Design

Date: 2026-06-17
Status: Draft for review

## Context

Agent Browser Core currently uses explicit Browser URIs for Agent Internet resources:

- `metaid://{globalMetaId}` for Bot Pages;
- `metaapp://{pinId}` for MetaApps;
- `pin://{pinId}` for generic pin inspection;
- `metafile://{pinId}` for file resources;
- `map://...` for MetaID Application Pointer resources, as defined in the MAP URI design.

These identifiers are stable but hard for humans to remember. The Browser should support
blockchain-backed names without changing the meaning of existing URI schemes. ENS is the first
provider because `.eth` names have mature resolver records, widely deployed tooling, and a direct
text-record model for arbitrary application keys.

## Decision

Add a host-neutral name-alias resolution step before canonical resource resolution.

Version 1 supports ENS `.eth` names through a single text record:

```text
org.openagentinternet.uri
```

The text record value must be a complete Agent Internet URI:

```text
metaid://{globalMetaId}
metaapp://{pinId}
pin://{pinId}
metafile://{pinId}
metafile://{pinId}.{ext}
metafile://{kind}/{pinId}
map://{canonicalMapTarget}
```

The user input scheme must match the resolved record scheme:

```text
metaid://sunny.eth  -> metaid://{globalMetaId}
metaapp://sunny.eth -> metaapp://{pinId}
pin://pin.sunny.eth -> pin://{pinId}
metafile://file.sunny.eth -> metafile://{pinId}
map://sunny.eth     -> map://{canonicalMapTarget}
```

These cross-scheme redirects are invalid in version 1:

```text
metaid://sunny.eth  -> metaapp://{pinId}
metaapp://sunny.eth -> metaid://{globalMetaId}
map://sunny.eth     -> metaid://{globalMetaId}
```

The visible Browser address should remain the input alias URI after a successful resolve. The
resolver uses the canonical URI internally and records the ENS alias proof in the resource source
metadata and Inspector.

## Goals

- Let users open memorable ENS names in Browser URI form.
- Keep `metaid://`, `metaapp://`, `pin://`, `metafile://`, and `map://` semantics trustworthy.
- Use one Open Agent Internet text-record key across supported resource schemes.
- Keep ABC core host-neutral and free of Ethereum RPC, wallet, signer, OAC, IDBots, and database
  dependencies.
- Make ENS an interchangeable provider behind a general name-alias resolver interface.
- Preserve a clear difference between single-sided ENS claims and future bidirectional verified
  bindings.

## Non-Goals

- Do not require bidirectional binding in version 1.
- Do not support Web2 DNS names in version 1.
- Do not support ENS names outside normalized `.eth` names and `.eth` subnames in version 1.
- Do not enumerate all ENS text records. Resolve only the configured key.
- Do not accept bare pin ids, bare Global MetaIDs, JSON payloads, or URLs as ENS record values.
- Do not allow one ENS text value to point to another ENS alias in version 1.
- Do not use `io.metaid.*` as a namespace.
- Do not add wallet signing, ENS record editing, or registration flows.

## URI Semantics

### Alias URI

An alias URI is a normal Browser URI whose resource id is an ENS name:

```text
metaid://sunny.eth
metaapp://app.sunny.eth
pin://pin.sunny.eth
metafile://file.sunny.eth
map://buzz.sunny.eth
```

The input scheme tells Browser which resource family the user expects. The ENS text record may only
confirm a canonical URI in the same family.

### Canonical URI

The canonical URI is the value read from `org.openagentinternet.uri`. It must be fully typed by its
own scheme:

```text
metaid://idq1...
metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
metafile://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
metafile://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0.pdf
metafile://video/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
```

The canonical value must pass target-specific validation:

- `metaid://` requires a valid Global MetaID, including checksum and payload-length rules.
- `metaapp://` requires a canonical MetaApp pin id: 64 lowercase or uppercase hex characters
  followed by `i0`.
- `pin://` requires a canonical pin URI accepted by the pin parser.
- `metafile://` requires a canonical file reference accepted by the Metafile resolver. Version 1
  accepts `metafile://{pinId}`, `metafile://{pinId}.{ext}`, and `metafile://{kind}/{pinId}`.
- `map://` requires a canonical MAP URI accepted by the MAP parser. For version 1 this means a
  concrete MAP target such as `map://{protocol}/pin/{pinId}` rather than another name alias.

### Address Bar

After a successful alias resolve, Browser should keep the address input and history entry on the
alias URI:

```text
metaid://sunny.eth
```

The Inspector should expose the canonical URI:

```text
metaid://idq1...
```

Copy actions should continue to copy the visible alias URI unless the user explicitly chooses a
"copy canonical URI" action in Inspector.

## ENS Record Contract

ENS record key:

```text
org.openagentinternet.uri
```

Record value examples:

```text
metaid://idq1...
metaapp://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
pin://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
metafile://6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0.pdf
map://simplebuzz/pin/6ea8a0bd0bac9a9c6cf4e035e9ce0a18e3a89f390c355dcc43074010fbee7ee7i0
```

The key uses the reversed registered domain namespace for Open Agent Internet. It intentionally does
not mention MetaID because the target may be an identity, MetaApp, MAP resource, or future Browser
resource family.

The resolver must trim surrounding whitespace from the text value before parsing it. Internal
whitespace is not normalized.

## Resolve Flow

For a user input such as `metaid://sunny.eth`:

1. Parse the Browser URI.
2. Detect whether the parsed id is an ENS `.eth` name or subname.
3. If it is not a supported name alias, continue through the existing resolver path.
4. Normalize the ENS name according to ENS name normalization rules.
5. Read the `org.openagentinternet.uri` text record through the configured ENS provider.
6. Fail if the record is missing or empty.
7. Parse the record value as a Browser URI.
8. Fail if the record scheme differs from the input scheme.
9. Fail if the canonical value is another name alias.
10. Run target-specific canonical validation for the parsed canonical URI.
11. Resolve the canonical URI through the existing resource resolver.
12. Return the resolved resource while preserving the alias URI as the visible `uri` and
    `normalizedUri`.
13. Attach alias metadata so Inspector and tests can see the ENS claim and canonical target.

The resolver must not show an intermediate canonical navigation state. The UI should receive one
final result, matching the existing custom Bot Page aliasing pattern.

## Package Boundary

### `packages/core`

Core owns alias orchestration and validation. It should export provider-neutral types such as:

```ts
interface BrowserNameAliasRequest {
  inputUri: string;
  inputScheme: BrowserUriScheme;
  name: string;
}

interface BrowserNameAliasResult {
  provider: 'ens' | string;
  normalizedName: string;
  textKey: string;
  canonicalUri: string;
  resolvedAt: number;
  verificationState: BrowserVerificationState;
  raw?: Record<string, unknown>;
}

interface BrowserNameAliasProvider {
  id: string;
  supportsName(name: string): boolean;
  resolveNameAlias(request: BrowserNameAliasRequest): Promise<BrowserCommandResult<BrowserNameAliasResult>>;
}
```

Core may own:

- alias detection dispatch;
- scheme-match enforcement;
- canonical target validation;
- recursive alias prevention;
- result aliasing;
- source metadata assembly.

Core must not import Ethereum libraries, JSON-RPC clients, OAC, IDBots, SQLite, Metalet, wallet,
signer, or private-key modules.

### Name Resolver Package

Add a small optional package for shared provider implementations:

```text
packages/name-resolvers
```

Package name:

```text
@openagentinternet/agent-browser-name-resolvers
```

This package may depend on ENS/Ethereum client tooling such as `viem`. It should export an ENS
provider factory, for example:

```ts
createEnsOpenAgentInternetResolver({
  rpcUrls,
  chainId: 1,
  textKey: 'org.openagentinternet.uri',
})
```

The package is optional for hosts. A host can either use the shared ENS provider or inject its own
provider that implements the core interface.

### Host Adapters

Host adapters wire provider configuration into core:

- standalone uses configured Ethereum RPC URLs for public preview and local development;
- OAC can use the same provider package or its own runtime-configured provider;
- IDBots can wire an equivalent provider when it consumes the package.

Hosts own provider availability. If no ENS provider is configured, a `.eth` alias should fail with
`name_resolution_unavailable` rather than falling through to a Global MetaID or pin lookup.

### `packages/ui`

UI should not resolve ENS directly. It should render alias metadata already returned by core.

Inspector should show:

- alias URI;
- provider;
- normalized ENS name;
- text key;
- canonical URI;
- alias verification state;
- resolved time;
- provider error when resolution failed.

The main resource renderer should continue to render the canonical resource result.

## Configuration

Add Browser settings for name resolution:

```ts
interface BrowserNameResolutionConfig {
  enabled: boolean;
  ens?: {
    enabled: boolean;
    chainId: 1;
    rpcUrls: string[];
    textKey: string;
  };
}
```

Defaults:

```text
nameResolution.enabled = true
ens.enabled = true only when at least one RPC URL is configured
ens.chainId = 1
ens.textKey = org.openagentinternet.uri
```

Do not hard-code one public RPC endpoint as the only production path. A public hosted Browser may
ship a default endpoint from deployment configuration, but local packages should keep RPC URLs
configurable.

## Verification States

Version 1 treats a valid ENS text record as a single-sided claim.

Alias verification state:

- `partial`: ENS text record resolves to a valid same-scheme canonical URI.
- `verified`: reserved for future bidirectional binding, where the canonical MetaID or resource also
  claims the ENS name.
- `unverified`: invalid, missing, unsupported, or unavailable alias state.

The canonical resource keeps its own proof and verification state. ENS alias verification must not
overwrite canonical resource verification.

## Error Handling

Use explicit failure codes:

- `name_resolution_unavailable`: alias input needs a provider, but no provider is configured.
- `name_resolution_failed`: provider lookup failed because of RPC, normalization, or resolver errors.
- `name_alias_not_found`: the configured text record is missing or empty.
- `invalid_name_alias_target`: the text record value is not a valid canonical Browser URI.
- `name_alias_scheme_mismatch`: the input scheme and canonical target scheme differ.
- `name_alias_recursive`: the text record points to another supported name alias.

Failures should preserve the user's input URI in the error context. They should not fall back to
legacy resource lookup for `.eth` ids because that would hide configuration and record problems.

## Security And Trust

- Treat ENS text records as owner-controlled pointers, not proof that the target identity endorsed
  the ENS name.
- Do not mark aliases `verified` until bidirectional binding exists.
- Do not execute renderers or scripts from ENS records.
- Do not accept `http://`, `https://`, `ipfs://`, JSON, or arbitrary resolver data as a Browser
  target in version 1.
- Normalize ENS names before lookup and display the normalized name in Inspector.
- Enforce scheme match so the address bar does not misrepresent the resource family.
- Reject recursive aliases to prevent loops and ambiguous ownership chains.

## Acceptance Criteria

- `metaid://sunny.eth` reads `org.openagentinternet.uri` and resolves when the value is a valid
  `metaid://{globalMetaId}`.
- `metaapp://sunny.eth` reads the same key and resolves when the value is a valid
  `metaapp://{pinId}`.
- `map://sunny.eth` reads the same key and resolves when the value is a valid canonical `map://`
  target.
- A scheme mismatch fails with `name_alias_scheme_mismatch`.
- Missing or empty text records fail with `name_alias_not_found`.
- Invalid canonical targets fail with `invalid_name_alias_target`.
- Recursive aliases fail with `name_alias_recursive`.
- Missing provider configuration fails with `name_resolution_unavailable`.
- Browser address and history stay on the alias URI after success.
- Inspector shows provider, normalized name, text key, canonical URI, resolved time, and alias
  verification state.
- ABC core does not import ENS/Ethereum client libraries.
- Existing `metaid://{globalMetaId}`, `metaapp://{pinId}`, `metafile://{pinId}`, and canonical
  `map://...` inputs continue to resolve without ENS lookup.

## Verification Plan

Implementation should add focused tests for:

- ENS alias detection for `.eth` names and subnames.
- Non-ENS ids bypassing name resolution.
- successful `metaid://`, `metaapp://`, and `map://` same-scheme aliases using mocked providers;
- scheme mismatch;
- invalid record values;
- recursive aliases;
- provider unavailable;
- provider failure;
- address-bar alias preservation in Browser UI state;
- Inspector rendering of alias metadata.

Run the full workspace gate after implementation:

```text
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" npm run verify
```

For docs-only changes to this design, run:

```text
git diff --check
```

## External References

- ENS text records: https://docs.ens.domains/web/records/
- ENSIP-5 text records: https://docs.ens.domains/ensip/5/
- ENS Universal Resolver: https://docs.ens.domains/resolvers/universal/
- ENS name normalization: https://docs.ens.domains/ensip/15/
- viem `getEnsText`: https://viem.sh/docs/ens/actions/getEnsText
