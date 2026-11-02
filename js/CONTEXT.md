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

## Change & verify
Review database grants and ownership-based RLS before API changes. Bump `sw.js` cache version for any updated cached JS. Smoke-test anonymous sign-in, all-time/daily upsert, board reads, offline fallback and PWA refresh; do not infer hosted success from database-only checks.
