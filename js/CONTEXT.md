# JavaScript folder context

## Purpose
Owns ONE MORE's vanilla-JavaScript runtime, rendering, audio and online leaderboard.

## Key files
`main.js` bootstraps the game; `game.js` owns runs; `render.js`, `ui.js` and `intro.js` handle presentation; `lb.js` reads/writes `om_scores` and `om_daily`; `supabase-config.js` holds only the public Pinpoint-project Supabase URL and publishable key. `firebase-config.js` is an unused placeholder unless separately integrated.

## Connections
`index.html` loads `supabase-config.js` before `lb.js`, and `sw.js` precaches both files. The Supabase SDK loads lazily on leaderboard use. Scores belong only in ONE MORE's `om_*` tables, never Pinpoint's tables.

## Google OAuth return (2 Nov 2026)
`lb.js` writes the short-lived `om_lb_google_return_v1` sessionStorage intent (tab and timestamp only) immediately before navigating to Google. On a new document `main.js` synchronously calls `LB.consumeOAuthReturn()`; a recent marker or a PKCE `?code`/OAuth error return bypasses the intro, boots the title canvas and reopens the correct leaderboard tab. The SDK's lazy `init()` then consumes the PKCE callback. No credentials are stored in the intent. Normal launches still play the intro. Browser integration still requires checking on GitHub Pages.

## Change & verify
Review database grants and ownership-based RLS before API changes. Bump `sw.js` cache version for any updated cached JS. Smoke-test anonymous sign-in, all-time/daily upsert, board reads, offline fallback and PWA refresh; do not infer hosted success from database-only checks.
