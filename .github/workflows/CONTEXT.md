# GitHub Actions workflow context

## Purpose
Retain the ONE MORE/Supabase integration across source updates — now over the adopted Vite build (v25.0 THE FABLE ADOPTED).

## Key files
`supabase-integration-guard.yml`: read-only checks on pushes and PRs against `main`. It parse-checks the engine (`src/engine/*.js`), the worker (`public/sw.js`) and the build script, runs `npm ci` + `vite build`, and asserts the Supabase/OAuth/cloud-save wiring survived inside the engine fork (the publishable-only config, om_scores/om_daily/om_weekly tables, anonymous + Google PKCE auth, the OAuth return key, weekly-board and ghost-racing flows, `om_player_saves` sync with local-wipe protection). It also asserts the `boot.ts` ?raw bridge still imports every module the cloud flow needs — including `charms.js` and `codex.js`, which are part of the adopted game — that the PWA core cache still carries the sounds and washes, and that the committed root `index.html` artifact carries the engine's own `OM_VERSION` (a stale root artifact fails the guard).

`cloud-save-check.yml`: parse-checks the cloud-save triad and the worker on touches to `src/engine/cloud-save.js`, `lb.js`, `main.js`, `boot.ts`, `public/sw.js`, `index.src.html` or the build script.

## Retired with the vanilla tree (20 Nov 2026)
`supabase-auto-repair.yml` and its helpers (`.github/supabase-auto-repair.cjs`, `.github/cloud-save.test.cjs`) planned review-only patches against the vanilla five-file `<script src="./js/…">` integration, whose anchors no longer exist in the adopted build. Their protection lives on in the rewritten guard plus git history (the pre-adoption tree is intact up to the v24.11 commits). Recovery sources: git history and root `SUPABASE-RECOVERY.md`.

## Change & verify
When intentionally refactoring auth or the boot bridge, update the guard to recognize equivalent safe wiring. Confirm its own GitHub Actions run completes successfully. The root `SUPABASE-RECOVERY.md` and git history are the recovery sources if the guard fails.
