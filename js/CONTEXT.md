# JavaScript folder context

## Purpose
Owns ONE MORE's vanilla-JavaScript runtime, rendering, audio and online leaderboard.

## Key files
`main.js` bootstraps the game; `game.js` owns runs; `render.js`, `ui.js` and `intro.js` handle presentation; `lb.js` reads/writes `om_scores` and `om_daily`; `supabase-config.js` holds only the public Pinpoint-project Supabase URL and publishable key. `firebase-config.js` is an unused placeholder unless separately integrated.

## Connections
`index.html` loads `supabase-config.js` before `lb.js`, and `sw.js` precaches both files. The Supabase SDK loads lazily on leaderboard use. Scores belong only in ONE MORE's `om_*` tables, never Pinpoint's tables.

## Change & verify
Review database grants and ownership-based RLS before API changes. Bump `sw.js` cache version for any updated cached JS. Smoke-test anonymous sign-in, all-time/daily upsert, board reads, offline fallback and PWA refresh; do not infer hosted success from database-only checks.
