# Engine context — ONE MORE (the adopted fable build)

## Purpose
`src/engine/` is the game's vanilla-JavaScript heart, adopted wholesale at
**v25.0 THE FABLE ADOPTED (20 Nov 2026)** from the owner-supplied
*One_more_fable* build — a parallel fork of this game's own lineage. The
React shell around it (`src/App.tsx`) renders the exact DOM the engine
expects (same element ids), and `src/engine/boot.ts` bridges the two: every
engine file is imported as `?raw` text, concatenated in dependency order
(config → audio → ui → cutscene → game → render → intro → supabase-config →
lb → cloud-save → share → charms → codex → main), stripped of its
`'use strict'`, and executed in one shared classic scope inside a single
`new Function` — reproducing the old classic-script global scope. The
singletons (`CFG, ENEMIES, AREAS, UPGRADES, CONFLUENCES, CHARMS, SFX, UI,
CUT, G, R, INTRO, LB, CH, CODEX`) are then assigned onto `window`.
`window.__OM_BOOTED__` guards StrictMode's double effect.

## What this build carries (vs the pre-adoption v24.11 repo)
Eight brushes (needle, broom, stone, wisp + fan/tide/seal/scribe at scenes
6/10/14/18) with `profile {pace,bite,reach}` replacing the old `cls`
affinity; six scrolls of ten scenes (600 waves, 60 keepers, 6 Guardians);
the **CHARMS** purse (14 charms, 8-rank sealed ladder, `om_charms_v1`) with
the `charms.js` shop; **CONFLUENCES** (8 union cards); Ink Step (瞬 dash) +
Mikiri (切); 硯 field inkstones; GRIND/BLOT shelf tools; boss/keeper/death
cutscene films; a rebuilt wash-composited opening; v25 zero-GC trail/impact
buffers and the pixel budget; a scored upgrade auto-pick.

## What was retired with the adoption
The pre-adoption repo's v21.8–v24.11 systems are **not** in this engine:
THE STUDY skills and the two scribes, the octopus weapon holds, the boss
pour-in (`CFG.lord`/`enterT`), the bounded arenas (endless is unbounded
again), the ink-jar HUD, the painter's-hand autobrush intent layer (the
walker here is the pre-intent steerer), and the `qaProbe()` save-hygiene
gate (deep-link runs write the save). All recoverable from git history
(before the v25.0 adoption commit).

## Service worker & sounds
`public/sw.js` (landed at root by the build) is the vanilla worker's logic
ported: versioned caches, re-ink-behind-the-visit revalidation, offline
shell. The engine's audio is a synth-first kit that also fetches the 11
recorded files under `snd/` — carried from the pre-adoption repo into
`public/snd/`.

## Key files
`config.js` — all tuning; `game.js` — run state, waves, verbs (dash/mikiri/
shrines), the autobrush, upgrade/charm economy; `render.js` — the sumi-e
renderer, the scribe figure, beast portraits, the Armory canvases; `ui.js` —
every DOM screen and HUD; `charms.js`/`codex.js` — the 符 shop and the
compendium; `lb.js` + `cloud-save.js` + `supabase-config.js` — the
leaderboard, the private cross-device save, and the ink cloud's address
(values identical to the pre-adoption repo's). Node syntax check:
`node --check src/engine/<file>.js`. Build: `npm run build:site` from the
repo root.
