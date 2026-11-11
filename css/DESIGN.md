# css/ — design notes

## Purpose
The paper's whole visual language: washi surfaces, inked rules, seal-red accents, hand-wobbled borders. No framework, no build — `style.css` is the single sheet (the retired `inkstone.css` remains only for the orphan legacy page).

## Language
- **Palette** lives in custom properties at the top of `style.css` (`--paper*`, `--ink-*`, `--red`, `--red-deep`). Strict monochrome + one sacred seal red; bosses/keeper accents stay inside that family (the v20 RED/BLACK LAW).
- **Contrast tiers are pre-strengthened for alpha stacking** (v20.4): the room panels are translucent (`.set-wrap` at paper-97) and sit over the painted sheet, so raw alpha inks lose their nominal ratio. The tiers are therefore declared stronger than their labels suggest — text tier `--ink-62` at alpha .8, component `--ink-55` at .7, faint `--ink-45` at .58, name tier `--ink-70` at .82 — in every theme block. Treat these as the floors: any new text must use `--ink-62` or stronger; `--ink-45` is for marks and rules, never body text; the sealed-row hint and ghost-chip backdrops follow the same rule.
- **Ink wobble** comes from the two SVG `feTurbulence` filters in `index.html` (`#inkrough`, `#inkrough-soft`) referenced as `filter: var(--rough-soft)` etc. Never apply them to large animated areas — they are GPU-costly.
- **Type**: Zen Antique for display kanji/serif moments, IBM Plex Mono for labels. Letterspacing does the hierarchy work; sizes stay tiny (8.5–11.5px) against generous paper space.

## Room panels (`.set-wrap`, settings/brush/charms)
One shared panel: paper-92 sheet, 1.4px ink border, offset block shadow, slight rotation, `overflow-y: auto` with a thin inked scrollbar (never the browser's gray bar — styled for both Firefox `scrollbar-color` and `::-webkit-scrollbar`). Rows are `.set-row` grids (`auto 1fr auto` desktop / `auto 1fr` phone): kanji | name | description, with the state chip following. The name column must keep its room: `.set-name` is `white-space: nowrap` (wrap returns under 380px), and `.set-desc` is capped (`max-width: min(46vw, 300px)`) so a long description wraps instead of squeezing the name.

## Accessibility
`.sr-only` provides the screen-reader twin of painted UI: `#bannerLive` (aria-live) carries wave/scene announcements that the aria-hidden `#waveBanner` shows visually. `#introGate` is focusable (`tabindex="0"`). Focus visibility is the global `:focus-visible` red outline.

## Change & verify
Bump `sw.js` `VER` whenever a cached asset changes (this folder's files are precached). Capture a real `SCREENSHOT.png` from the running app for substantive edits — never invent evidence. Verify at desktop (≥740px) and phone (<740px) widths; the room panels stack their rows below 740px.
