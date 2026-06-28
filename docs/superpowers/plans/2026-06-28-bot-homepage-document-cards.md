# Bot Homepage Document Cards Implementation Plan

## Goal

Update the default Bot homepage Document template so Services and MetaApps render as cards matching the approved prototype, using real Bot homepage v3 fields.

## Steps

1. Add renderer tests for v3 Services cards.
   - Use `sections[].items[].data.payload` fixtures matching the live v3 response.
   - Assert `displayName`, `description`, `providerSkill`, `price currency`, `serviceIcon`, and `outputType` render.
   - Assert Input is not rendered.

2. Add renderer tests for v3 MetaApps cards.
   - Use `coverImg`, `icon`, `title`, `appName`, `intro`, `version`, `contentType`, and `code`.
   - Assert the title is plain text, Run owns the `metaapp://` link, Download uses the metafile content URL, and `[PIN]` is absent from the MetaApps section.

3. Extend Bot homepage normalization.
   - Services: normalize `serviceIcon`, `providerSkill`, `price`, `currency`, and `output || outputType`.
   - MetaApps: normalize `coverImg`, `icon`, `appName`, `version`, `contentType || codeType`, `href`, `downloadHref`, and date.

4. Replace Document section rows with card markup.
   - Services become service cards with an icon, text block, facts, price, and Request button.
   - MetaApps become app cards with square cover media, Run/Download actions below the cover, identity block, intro, and facts.

5. Add scoped CSS for the new card classes.
   - Keep card radius at 8px or less.
   - Add responsive behavior for narrow screens.
   - Keep existing Recent Activity link styling intact.

6. Verify and commit.
   - Run the focused UI renderer test during TDD.
   - Run the relevant workspace verification before committing.
   - Commit docs and implementation as separate units.
