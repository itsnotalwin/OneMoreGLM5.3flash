# AGENTS.md — ONE MORE GLM 5.3 Flash

This repository follows the portable build rules from the private ALWIN Obsidian vault. The source repository does not itself grant agents access to that vault.

Before changing code, read this file, `PROJECT.md` and the nearest folder `CONTEXT.md`. **For any manual source upload, authentication, leaderboard or PWA cache update, first read `SUPABASE-RECOVERY.md` and compare with archival Git tag `backup/supabase-integration-2026-11-02`; preserve source wiring, rerun the Supabase integration guard and do not overwrite unrelated gameplay.** Keep `main` as the only Git branch: the repair workflow produces a reviewable patch artifact, not PR branches. Never revert a new game version's Settings or gameplay modules wholesale merely to restore Google login. Each authored subfolder needs a concise `CONTEXT.md` when substantively edited. CSS/UI/visual source folders also need a `DESIGN.md` and a real, current `SCREENSHOT.png` captured from the running app; do not invent evidence.

Preserve the static vanilla JS game, save data, gameplay, offline capability, and existing Pinpoint backend. Make small, version-checked commits. Never expose Supabase secret/service-role keys; the browser may use the public publishable key only. Keep `om_scores` and `om_daily` separate from Pinpoint's `scores` and `pinpoint_profiles`, and verify grants/RLS after backend changes.

Verify the changed path before claiming success. GitHub Pages deployment results and physical-device checks must be reported separately from source commits and database tests. Update relevant folder notes for substantive changes; preserve other agents' work and avoid fabricated screenshots.
