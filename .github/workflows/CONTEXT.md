# GitHub Actions workflow context

## Purpose
Retain the ONE MORE/Supabase integration across frequent manual game-source updates.

## Key files
`supabase-integration-guard.yml`: read-only checks on pushes and PRs against `main`; failure signals source regressions.
`supabase-auto-repair.yml`: independently self-tests on each main push; on an integration-guard failure from a main push, checks only exact known broken auth/config source and creates a **draft review PR**, never changes main. For unfamiliar source it aborts and alerts by failed Actions job.

## Connections
The integration guard reads checked-out sources only. The auto-repair planner simulates known broken snapshots without contacting Supabase, and the proposal job can use a scoped GitHub token to push a separate review branch and create a draft PR. Neither workflow changes database scores, main, Pages publishing, or uses provider secrets. Repository Actions settings must allow draft PR creation.

## Change & verify
When intentionally refactoring auth, update the guard to recognize equivalent safe wiring. Confirm its own GitHub Actions run completes successfully. The separate backup branch and root `SUPABASE-RECOVERY.md` are the recovery sources if the guard fails.
