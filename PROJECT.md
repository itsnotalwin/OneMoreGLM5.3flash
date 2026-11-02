# ONE MORE — GLM 5.3 Flash

## Purpose
An ink-brush survival browser game with journey, endless, and daily modes. This is a distinct repository from `itsnotalwin/ONE_MORE`.

## Architecture
Zero-build static HTML/CSS/vanilla JS PWA. Entry: `index.html`; gameplay, renderer, leaderboard, and bootstrap in `js/` (see `js/CONTEXT.md`), visuals in `css/`, images in `img/`, offline cache in `sw.js`.

## Manual update / recovery
**Preserve:** [SUPABASE-RECOVERY.md](SUPABASE-RECOVERY.md), a source snapshot at [backup/supabase-integration-2026-11-02](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/supabase-integration-2026-11-02) and the read-only `.github/workflows/supabase-integration-guard.yml` Actions check. Merge backend/OAuth code into later gameplay sources instead of replacing whole newer JS files from the backup. The last observed Google provider client-secret error and disabled anonymous sign-in setting are external Supabase/Auth blockers, not verified fixed.

## Run / test / deploy
Serve with `python3 -m http.server 8000`. Use the built-in GitHub Pages `pages build and deployment` Action on `main` and check its conclusion. Test leaderboard open, anonymous sign-in, all-time/daily score submission, browser refresh, and offline gameplay separately. Manual browser smoke test remains necessary.

## Current state (2 Nov 2026)
Supabase config committed to shared **Pinpoint** project `sffpyvxbgmhepftxoesy` using a publishable browser key. The two separate leaderboard tables `public.om_scores` and `public.om_daily` have scoped RLS and proper role grants; authenticated owner insert/upsert and cross-owner rejection were validated in rolled-back transactions. Pinpoint's two pre-existing app tables and their rows were preserved. `sw.js` cache version `v8.6-supabase-oauth-3` forces updated JavaScript after the Google login return fix. `LB.consumeOAuthReturn()` now bypasses the opening and restores the leaderboard/tab after Google OAuth navigation; unit harness tested seven normal/return/error/expiry scenarios, syntax and startup guards. Hosted Google sign-in and score posting still need a manual confirmation. See README for database migrations. Real hosted browser authentication/gameplay posting is not independently verified yet.

## Decisions / next actions
Share Supabase project-level Auth and quotas, **not** application rows or policies. Optional Google login is not required for anonymous leaderboard play. Verify the latest Pages deploy and a real-device anonymous sign-in/score post; then review PINPOINT-specific advisor warnings separately rather than altering that game's backend during ONE MORE setup.
