# JavaScript folder context

## Purpose
Owns ONE MORE's vanilla-JavaScript runtime, rendering, audio and online leaderboard.

## Key files
`main.js` bootstraps the game; `game.js` owns runs; `render.js`, `ui.js` and `intro.js` handle presentation; `lb.js` reads/writes `om_scores` and `om_daily`; `supabase-config.js` holds only the public Pinpoint-project Supabase URL and publishable key. `firebase-config.js` is an unused placeholder unless separately integrated.

## Connections
`index.html` loads `supabase-config.js` before `lb.js`, and `sw.js` precaches both files. The Supabase SDK loads lazily on leaderboard use. Scores belong only in ONE MORE's `om_*` tables, never Pinpoint's tables.

## Google OAuth return (2 Nov 2026)
`lb.js` writes the short-lived `om_lb_google_return_v1` sessionStorage intent (tab and timestamp only) immediately before navigating to Google. On a new document `main.js` synchronously calls `LB.consumeOAuthReturn()`; a recent marker or a PKCE `?code`/OAuth error return bypasses the intro, boots the title canvas and reopens the correct leaderboard tab. The SDK's lazy `init()` then consumes the PKCE callback. No credentials are stored in the intent. Normal launches still play the intro. OAuth errors now display a targeted token-exchange message instead of a generic sign-in failure; failed OAuth query and hash parameters are removed from the browser URL after capture, preserving successful `?code` for PKCE. Browser integration still requires checking on GitHub Pages. **2026-11-02 server log:** `oauth2: invalid_client` / `The provided client secret is invalid` (Google provider is enabled, but its client secret must be corrected in the shared Pinpoint Supabase project by the project owner). Logs also show anonymous sign-ins disabled; re-enable Auth Anonymous provider for anonymous sign-in. No database/table fix is needed.

Before overwriting this folder via manual upload, compare with the preserved branch and [root recovery runbook](../SUPABASE-RECOVERY.md). The read-only Actions guard checks essential markers but cannot test live Google OAuth. Retain the new game's gameplay changes and selectively merge this folder's Auth/leaderboard logic.

## v12 compatibility (3 Nov 2026)
v12 extended `lb.js` to include weekly `om_weekly` scores, `ghost`/`has_ghost` replay columns and `fetchEcho`/ghost racing. Its OAuth callback restoration now also remembers `week` tabs; the restored main bootstrap preserves the new `om_intro_seen` once-per-session cinematic, Inkstone, charm shop and Guardians' Hall. Public Supabase config restored; `sw.js` uses `v12.0-supabase-1` and includes new Inkstone/charm assets. The [manual v12 upload is backed up](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v12-manual-upload-2026-11-03); see [root recovery runbook](../SUPABASE-RECOVERY.md). The new weekly table/ghost columns were migrated to the existing Pinpoint Supabase project with RLS; **do not rerun fresh-project SQL**. Browser Google sign-in is still pending verification.

## v16 OAuth Settings handoff (3 Nov 2026)
The v16 sign-in button moved into the Settings account screen. The latest manual upload removed the stored Google callback intent and blanked the public connection. The restored `LB.consumeOAuthReturn()` identifies PKCE return or OAuth failure, with `LB.initAuth()` initializing the lazy SDK to exchange the callback code. On return, `main.js` enters Settings instead of replaying the intro. If login originated via the board, it prepares the previous tab underneath Settings. No changes were made to game logic, animations, art or title's first-tap audio gate. The [v16 backup](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v16-manual-upload-2026-11-03) is the exact owner's uploaded snapshot. `sw.js` now uses `v16-supabase-1`. Targeted syntax and state checks passed; real Google login awaits user browser verification.

## v18 manual upload and OAuth restoration (3 Nov 2026)
Latest [v18 source backup](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v18-manual-upload-2026-11-03) retains the sixth silk scroll, 60-scene game and rendering updates. The owner upload had reverted the exact Supabase config, OAuth return and startup patches previously tested under v16; these three files were restored from the previously verified integration source with SHA checks. The PWA cache is now `v18-supabase-1`. The [Supabase source guard](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41719264286), deployment and 20/20 targeted JS tests passed. Live device Google login/posting is still a separate required test. See [root recovery runbook](../SUPABASE-RECOVERY.md).

## v18.1 recovery (3 Nov 2026)
Owner's [`8def891b` v18.1 upload](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v18-1-manual-upload-2026-11-03) was backed up unchanged. It reset `supabase-config.js`, `lb.js` and `main.js` to the already-diagnosed broken OAuth source. Only these files were restored from the last good verified code, and `sw.js` was bumped to `v18.1-supabase-1`. New game/visual/HTML/CSS changes remain untouched. [Guard](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41723992591) and [deploy](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41723995312) passed; browser OAuth/score posting still require a fresh test. See [recovery runbook](../SUPABASE-RECOVERY.md).

## Change & verify
Review database grants and ownership-based RLS before API changes. Bump `sw.js` cache version for any updated cached JS. Smoke-test anonymous sign-in, all-time/daily upsert, board reads, offline fallback and PWA refresh; do not infer hosted success from database-only checks.
