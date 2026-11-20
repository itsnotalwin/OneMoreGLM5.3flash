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

## Upgrade shelf (`screen-upgrade`)
Desktop and landscape: three columns of `.up-card` in `minmax(0, 1fr)` rows; under 540px landscape the description caps at `max-height: 6.8em`. Phone (<640px): the shelf stacks — rows are `max-content` with `align-content: start` so a description is never squeezed to a clipped line (a stretched grid keeps equal rows and hides text); the card trims padding/glyph/name, the banner folds to one line, and the keyboard hint stands down so all three choices fit without scrolling. `overflow-y: auto` stays on the grid only as a last-resort net — if it ever visibly scrolls, the trim has drifted. Under DEPLOY hangs **the passing hand** (`.pass-btn`, v24.7): a centered hairline-underlined ghost chip, `9px`/`--ink-62` — quieter than the AUTO chip on purpose, so it never pulls the eye from the cards; it must stay visible (not clipped) at 844×390 and 390×844 with zero sheet scroll.

## The ink jar (`screen-upgrade` HUD)
Integrity wears a squat inkwell (`#hudHp .hp-jar`, 22×26 inline SVG) instead of a bar: one clipped rect pours down via `translateY((1−pct)·17.4)` (`.28s` ease — keep the transform transition on `.hp-jar-ink`), a mono percentage (`.hp-pct`) sits beside it, and ≤34% flips **is-low** — ink and percentage to `--red`, `hpPulse` opacity breath. The control must stay ~61px wide: it lives 14px from the sheet's right edge and must never reach the wave chip's scene meta (the old 148px bar overlapped 13–43px on phones). The jar is theme-agnostic — `--ink`/`--ink-70`/`--red` resolve per sheet; no per-theme overrides.

## Short landscape settings
The pinned return button (`.set-back`, sticky) rides a ±1000px paper band (`::before`) so the sheet reads full-width — the wrap (`overflow-x: hidden`) clips that spill in short landscape, or it opens a sideways scrollbar. The wordmark's red hanko (`.word-seal`) shrinks with the short-landscape wordmark (20×20) and hangs fully clear of the final glyph — at the base size it stamped over the last E's face.

## Accessibility
`.sr-only` provides the screen-reader twin of painted UI: `#bannerLive` (aria-live) carries wave/scene announcements that the aria-hidden `#waveBanner` shows visually. `#introGate` is focusable (`tabindex="0"`). Focus visibility is the global `:focus-visible` red outline.

## Change & verify
Bump `sw.js` `VER` whenever a cached asset changes (this folder's files are precached). Capture a real `SCREENSHOT.png` from the running app for substantive edits — never invent evidence. Verify at desktop (≥740px) and phone (<740px) widths; the room panels stack their rows below 740px.
