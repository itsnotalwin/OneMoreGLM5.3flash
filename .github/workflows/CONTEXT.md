# GitHub Actions workflow context

## Purpose
Retain the ONE MORE/Supabase integration across frequent manual game-source updates.

## Key files
`supabase-integration-guard.yml`: read-only checks on pushes and PRs against `main`; failure signals source regressions.
`supabase-auto-repair.yml`: self-tests every main push; after integration guard failure on main, builds a validated **review-only .patch artifact** in Actions. It does not create branches, PRs or merge commits. Configuration/lobby recovery requires exact known-bad bytes; v19+ main startup uses unique-anchor insertion for OAuth/WIPE, preserving new Settings and gameplay. Unknown layouts/partial changes abort.

## Connections
The integration guard reads checked-out sources only. The auto-repair planner simulates known broken snapshots without contacting Supabase. The proposal job uploads a scoped patch artifact using read-only repository permissions; it never pushes a branch, uses database secrets or edits a player save. An operator must review and commit any repair separately.

## Account save protection (4 Nov 2026)
`cloud-save-check.yml` runs local-first mock tests for PC/phone migration, CAS revisions, JSONB order, divergent edits, WIPE and failed-restore rollback. The Supabase integration guard now also requires `cloud-save.js` and correct script/cache routing. The repair workflow now **creates patch artifacts only; no branches, PRs or merges**. Its known-good snapshot pin was updated to include the cloud auth and local-wipe hooks; it can safely reinsert only the known cloud script tag/cache asset when manual uploads remove them. Unknown source/layout changes abort.

## Change & verify
When intentionally refactoring auth, update the guard to recognize equivalent safe wiring. Confirm its own GitHub Actions run completes successfully. The archival snapshot tags and root `SUPABASE-RECOVERY.md` are the recovery sources if the guard fails.
