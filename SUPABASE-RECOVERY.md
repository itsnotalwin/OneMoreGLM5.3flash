# ONE MORE GLM 5.3 Flash — Supabase integration recovery

> **Read this before manually replacing or uploading game files.** This is the canonical *source-repository recovery runbook*. A separate short BRAIN project record links here instead of duplicating the implementation. Last verified: **2026-11-02**. This repo is **not** `itsnotalwin/ONE_MORE`.

## Preserved source snapshot

- **Backup branch:** [`backup/supabase-integration-2026-11-02`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/supabase-integration-2026-11-02).
- **Verified branch commit:** [`2e844ba957e3e8dcfb4dd4da33eb21357be46abe`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/2e844ba957e3e8dcfb4dd4da33eb21357be46abe).
- **Live game:** https://itsnotalwin.github.io/OneMoreGLM5.3flash/
- The backup captures a working *source/deployment and database integration baseline*, **not** proof that Google OAuth or anonymous login completed successfully in a real browser. See blockers below.
- The backup branch is a normal Git branch, not write-protected. Do not delete, force-push or reuse it for active game development.

## Files and behaviors that MUST survive a manual update

| File | Keep / merge this integration behavior |
| --- | --- |
| `js/supabase-config.js` | `window.OM_SUPABASE` with project URL `https://sffpyvxbgmhepftxoesy.supabase.co` and the project's **public** `sb_publishable_...` API key. **Never** use or commit secret/service-role credentials. |
| `js/lb.js` | Supabase v2 SDK; `signInAnonymously()`, optional `signInWithOAuth({provider:'google'})`; `flowType: 'pkce'` and `detectSessionInUrl: true`; leaderboard read/upserts through **`om_scores`** and **`om_daily`** only. |
| `js/lb.js` | Before Google redirect, store short-lived `om_lb_google_return_v1` intent in **sessionStorage** (active board tab + timestamp only). `LB.consumeOAuthReturn()` recognizes this marker or `?code`/error URL, preserves successful PKCE `?code`, restores the prior tab, and clears *failed* OAuth error parameters after capture. It displays an actionable token-exchange error. |
| `js/main.js` | At startup call `LB.consumeOAuthReturn()` **before** the usual opening decision. On callback call `enterTitle(); LB.open('title', oauthReturn.tab)`; otherwise preserve normal introduction, game controls and `?lbdebug=1`. |
| `index.html` | Load `js/supabase-config.js` **before** `js/lb.js`, and `js/lb.js` **before** `js/main.js`. Retain the leaderboard/auth DOM elements and buttons. |
| `sw.js` | Precache the three JS files and bump `VER` **each time cached game code or config changes**, so installed PWAs receive the new code. Saved snapshot used `v8.6-supabase-oauth-3`; newer versions should increment rather than reset. |
| `README.md`, `PROJECT.md`, `AGENTS.md`, `js/CONTEXT.md` | Keep architecture/setup instructions, build rules and this recovery reference. |
| `.github/workflows/supabase-integration-guard.yml` | Keep the read-only integration guard: it detects future source uploads that drop key Supabase/OAuth wiring. It does **not** prevent a push to an unprotected branch or validate remote OAuth credentials. |

**Do not copy the entire old `js/main.js` or `js/lb.js` over newer versions without review:** doing so might discard later gameplay/UI improvements. Merge the integration sections, review the diff, and run the guard.

## Shared Supabase backend: preserve the separation

**Project:** [Pinpoint, ID `sffpyvxbgmhepftxoesy`](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy) (Europe West 1). Both games share the **Supabase project Auth service and quotas**, but NOT their gameplay tables.

- ONE MORE tables: `public.om_scores` (one score per `auth.users` UID) and `public.om_daily` (one score per day and UID).
- Pinpoint tables, **do not modify for this project**: `public.scores` and `public.pinpoint_profiles`.
- Installed Supabase migrations: `20261102155646_onemore_glm_flash_isolated_leaderboards` and `onemore_daily_uid_foreign_key_index`. Inspect `Database → Migrations` before applying anything.
- Both ONE MORE tables have **RLS on**. `anon` can SELECT only; `authenticated` can SELECT/INSERT/UPDATE, with `auth.uid() = uid` restrictions on writes. No direct DELETE to either. This was checked with owner insert/upsert and cross-owner rejection in rolled-back test transactions. Both game tables were empty after those tests (not a guarantee of present-day row counts).
- **Do not re-run the README's fresh-project SQL on an already configured shared project.** Never change `auth.users`, Pinpoint functions, or Pinpoint RLS policies to repair a ONE MORE front-end update.

## Auth dashboard configuration cannot be restored from Git

These are **external settings** you must preserve independently across manual source updates:

1. [Supabase Google provider](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy/auth/providers?provider=Google): **Google enabled**, using the Client ID and **matching Client Secret** of a real Google Cloud **Web application** OAuth client. Secrets live in provider settings, never in Git.
2. [Google Auth Platform OAuth clients](https://console.cloud.google.com/auth/clients): callback URI `https://sffpyvxbgmhepftxoesy.supabase.co/auth/v1/callback`, with `https://itsnotalwin.github.io` as a web origin if applicable.
3. [Supabase Redirect URLs](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy/auth/url-configuration): **allowlist** `https://itsnotalwin.github.io/OneMoreGLM5.3flash/`. **Do not replace Pinpoint's own Site URL**; add ONE MORE as an additional redirect.
4. Enable **Anonymous sign-ins** if players should use ONE MORE's `SIGN THE PAGE` option. This is a shared project setting and may also affect Pinpoint.

### Last *observed* blockers (do not present as resolved without retesting)

- **Google OAuth:** Supabase Auth logs 2026-11-02 ~17:39–17:51 UTC showed `oauth2: "invalid_client" "The provided client secret is invalid."` and `Unable to exchange external code`. Google authorization/redirect was reaching Supabase, but the **Google Client Secret** in the Supabase Google provider needed correction. Changing JavaScript, URL encoding, or leaderboard RLS does not resolve a bad external client secret.
- **Anonymous sign-ins:** Auth logs at ~17:50–17:51 UTC showed HTTP 422 `anonymous_provider_disabled`. Toggle Anonymous sign-ins in the shared project's Authentication provider settings.
- A real browser end-to-end **signed-in Google session, anonymous session and leaderboard post** has **not** been independently verified at this checkpoint. Never infer success from GitHub Pages build or SQL-only tests.

## Safe manual upgrade workflow

1. **Preserve this backup branch.** Upload/new-code changes should target `main` or a **new** development branch, not the backup.
2. When updating locally, `git pull --ff-only origin main` first. Bring in new game changes as a feature branch/commit when possible. When using GitHub's **Upload files** UI, review every filename being replaced and keep the files listed above or merge their Supabase/OAuth code into replacements.
3. Review integration differences **before** the upload/merge:
   ```bash
   git fetch origin backup/supabase-integration-2026-11-02
   git diff origin/backup/supabase-integration-2026-11-02..HEAD -- \
     js/supabase-config.js js/lb.js js/main.js index.html sw.js
   ```
4. If a file was accidentally overwritten, compare against `backup/supabase-integration-2026-11-02` in GitHub, then **selectively merge** the missing blocks. A full `git restore --source origin/backup/supabase-integration-2026-11-02 -- <file>` **replaces the whole current file** and could discard newer features; use it only after reviewing the consequences.
5. Bump `sw.js` `VER` for cached code changes. On the deployed PWA, do a hard refresh or close/reopen the installed app after the new service worker activates.
6. Check the [Supabase integration guard in GitHub Actions](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/workflows/supabase-integration-guard.yml). A green guard confirms **source wiring only**.
7. Manually verify: normal cold start still shows opening; Google login returns directly to the leaderboard and shows the signed-in player; Daily tab survives return; anonymous `SIGN THE PAGE` works; Endless and Daily run posts reach their separate Supabase tables; page refresh preserves identity and no stale OAuth query remains. Then check Pages deployment and browser console/network errors.

## Key source changes (for review/cherry-picking)

- [`842c037`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/842c0375ea6539f714c54725bb0d079a88c1c7ae): connect **public** Supabase config.
- [`36511c3`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/36511c31bd57115c186bb8c0fe023d328000fb36): OAuth return intent, PKCE callback recognition and tab restoration logic.
- [`232f5e4`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/232f5e49ee2d954708a53cc25800d6a62955622f): skip the opening/reopen leaderboard on OAuth return.
- [`7c0d191`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/7c0d191e5c7ee2d11f6c88575162a0660ba2040e): clearer Google token-exchange errors and removal of stale error callback URL parameters, preserving success `?code`.
- [`cbc86d5`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/cbc86d5de9638f0f6b1266e2210cd416cb63b667): PWA cache refresh to `v8.6-supabase-oauth-3`.
- [`2e844ba`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/2e844ba957e3e8dcfb4dd4da33eb21357be46abe): backup snapshot baseline. Also see the repository's commit history for intermediate setup/docs.

**Future agent handoff:** First inspect this runbook and `PROJECT.md`, then current `main` and the backup branch. Confirm what changed before editing. The only verified backend requirement is shared Pinpoint with isolated `om_*` tables; the Google secret and Anonymous Auth status require fresh verification whenever OAuth behavior changes. Never treat old Auth errors as necessarily current.
