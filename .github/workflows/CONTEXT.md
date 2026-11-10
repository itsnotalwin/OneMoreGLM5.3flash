# GitHub Actions workflow context

## Purpose
Retain the ONE MORE/Supabase integration across frequent manual game-source updates.

## Key files
`supabase-integration-guard.yml`: read-only checks on pushes and PRs against `main`; failure signals source regressions.
`supabase-auto-repair.yml`: self-tests every main push; after an integration guard failure on main, builds a validated **review-only .patch artifact**. It never creates branches, PRs or merges. Config repair accepts only the exact blank public-config object; lobby repair uses exact known-bad bytes or unique-anchor OAuth/cloud-access insertion; main repair inserts only the known Settings-return and safe-WIPE hooks. The v19.3 purse/charms fixture tests these paths. Unknown/partial layouts abort. Retired Inkstone assets are not required by current v19.3 validation.

## Connections
The integration guard reads checked-out sources only. The auto-repair planner simulates known broken snapshots without contacting Supabase. The proposal job uploads a scoped patch artifact using read-only repository permissions; it never pushes a branch, uses database secrets or edits a player save. An operator must review and commit any repair separately.

## Account save protection (4 Nov 2026)
`cloud-save-check.yml` runs local-first mock tests for PC/phone migration, CAS revisions, JSONB order, divergent edits, WIPE and failed-restore rollback. The Supabase integration guard now requires `cloud-save.js`, correct script/cache order, Google account bridge and the current weekly-board/purse UI. It does not require the retired Inkstone page. The repair workflow **creates patch artifacts only; no branches, PRs or merges**. It can restore a known blank config, missing lobby auth/cloud bridge, additive Settings/WIPE hooks, and the cloud script/cache tag while preserving new gameplay. Unknown source/layout changes abort.

## Change & verify
When intentionally refactoring auth, update the guard to recognize equivalent safe wiring. Confirm its own GitHub Actions run completes successfully. The archival snapshot tags and root `SUPABASE-RECOVERY.md` are the recovery sources if the guard fails.
