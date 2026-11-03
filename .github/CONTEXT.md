# .github context

## Purpose
Repository automation and safeguards for manual GitHub uploads, commits and pull requests.

## Key files
`workflows/` contains the integration guard and the read-only/check-then-draft repair workflow. `supabase-auto-repair.cjs` plans narrowly scoped source recovery from pinned known-good/known-bad Git snapshots. Its self-tests intentionally reject unfamiliar auth edits.

## Connections
GitHub Pages uses GitHub's built-in publishing workflow. The supplementary Supabase integration guard is independent of Pages publishing.

## Change & verify
Do not add provider secrets or privileged tokens to Actions. Keep guard checks read-only. Review the Actions result after edits; source checks cannot prove remote Supabase Auth credentials or browser OAuth complete.
