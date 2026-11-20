# AGENTS.md — ONE MORE GLM 5.3 Flash

This repository follows the portable build rules from the private ALWIN Obsidian vault. The source repository does not itself grant agents access to that vault.

Before changing code, read this file, `PROJECT.md` and the nearest folder `CONTEXT.md` (the engine's is `src/engine/CONTEXT.md`). **For any manual source upload, authentication, leaderboard or PWA cache update, first read `SUPABASE-RECOVERY.md`; preserve source wiring, rerun the Supabase integration guard and do not overwrite unrelated gameplay.** Keep `main` as the only Git branch. Never revert a new game version's Settings or gameplay modules wholesale merely to restore Google login. Each authored subfolder needs a concise `CONTEXT.md` when substantively edited. Do not invent screenshots.

The repo carries the **adopted fable build (v25.0)**: a Vite + React shell (`src/`, entry `index.src.html`) around the vanilla engine (`src/engine/*.js`, booted through `boot.ts`'s `?raw` bridge). The **root `index.html` is the committed build artifact** — after any source change run `npm run build:site` (vite build → `scripts/build.cjs` lands dist/ on the root) and commit the output together with the source. GitHub Pages serves the branch root directly (no Actions deploy). `node_modules/` and `dist/` are gitignored.

Preserve the game, save data, gameplay, offline capability, and the existing Supabase backend. Make small, version-checked commits. Never expose Supabase secret/service-role keys; the browser may use the public publishable key only. Keep `om_scores` and `om_daily` separate from Pinpoint's `scores` and `pinpoint_profiles`, and verify grants/RLS after backend changes.

Verify the changed path before claiming success. GitHub Pages deployment results and physical-device checks must be reported separately from source commits and database tests. Update relevant folder notes for substantive changes; preserve other agents' work and avoid fabricated screenshots.
