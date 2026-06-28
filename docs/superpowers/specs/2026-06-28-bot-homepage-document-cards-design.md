# Bot Homepage Document Cards Design

## Context

The default Bot homepage Document template currently treats Services and MetaApps like simple activity rows. The approved direction is to make both sections read as application/service cards while keeping Recent Activity unchanged.

The visual prototype is stored at:

`/Users/tusm/Documents/MetaID_Projects/agent-browser-core/.superpowers/brainstorm/37540-1782620769/content/metaapps-services-prototype-v8.html`

The in-app browser security policy blocked exporting a localhost screenshot from the prototype session, so this spec references the local HTML prototype artifact instead of attaching a captured image.

## Source Data

Implementation must be driven by the Bot homepage v3 response shape from:

`https://so.metaid.io/api/bot-homepage/globalmetaid/idq1j3yu9vmwxkqdqrrt39qxl8u69vs0esjhwg6l5k?version=v3`

The v3 homepage places section rows under `sections[].items[]`. Each row may wrap protocol fields in `data.payload`; the renderer must use the normalized payload fields rather than protocol labels.

### Services

The `skill-service` payload fields used by the card are:

- `displayName`: primary service name.
- `description`: service summary.
- `providerSkill`: provider skill identifier.
- `price` plus `currency`: price label.
- `serviceIcon`: optional service icon image.
- `output` or `outputType`: output label. Prefer `output` when present, fall back to `outputType`.

The service card must not render an Input field or an `inputType` label.

### MetaApps

The `metaapp` payload fields used by the card are:

- `coverImg`: square cover image.
- `icon`: small app icon next to the title block.
- `title`: display title.
- `appName`: app identifier/name.
- `intro`: description.
- `version`: version label.
- `contentType` or `codeType`: package/runtime type label.
- `code` or `content`: download source when it resolves to a metafile.

## Services Card Behavior

- Render each Service as a compact card with a visible service icon, title, description, provider skill, price, Output label, and Request action.
- Keep the Request button as the primary service action.
- Do not display protocol noise such as `skill-service`, `displayName`, or `pin` as card footer labels.
- Do not display Input.
- Use the same quiet, utility-focused visual language as the approved MetaApps card layout.

## MetaApps Card Behavior

- Render each MetaApp as an app card, not as a Recent Activity row.
- Place a square cover image on the left.
- Place Run and Download actions below the cover, with Run slightly wider than Download.
- Place the app icon next to the title/appName text, not overlapping the cover.
- Show both `title` and `appName`.
- Show `intro`, `version`, `contentType`/`codeType`, and updated date when available.
- Open the MetaApp from the Run action, not by clicking the title.
- Do not render a `pin` label or `[PIN]` badge inside the MetaApps section.

## Non-Goals

- Do not change Recent Activity rendering.
- Do not change the service request modal behavior.
- Do not change custom Bot page rendering or non-Document templates beyond reusing the same normalized rows where the existing code already does so.

## Acceptance Criteria

- A v3 `skill-service` item with `displayName`, `description`, `providerSkill`, `price`, `currency`, `serviceIcon`, and `outputType` renders those values in a Service card.
- The Services section contains no Input label.
- A v3 MetaApp item with `coverImg`, `icon`, `title`, `appName`, `intro`, `version`, `contentType`, and `code` renders an app card with Run and Download actions.
- The MetaApps title is not a link, and the section does not render a `[PIN]` badge.
- Recent Activity chat peer links retain their existing blue, non-underlined style.
